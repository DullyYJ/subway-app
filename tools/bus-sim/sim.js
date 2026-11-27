// 버스 탭 "현위치 → 정류장 · 도착시간이 3초 안에 다 뜨는가" 시뮬레이터 (수도권: 서울 TOPIS · 경기 GBIS · 인천 TAGO)
//
//  · 서버 쪽은 진짜 코드다: engine/map.js + engine/map-worker.js(handleScreenMap → mapSvResolve)를 그대로 읽어 '가상 시계'로 돌린다.
//  · 공공 API(TOPIS · GBIS · TAGO · 우리 정류장 표 D1)의 응답 지연 · 오류 봉투 비율은 모델이다(HANDOFF 의 실측 기록에 맞춤 — LAT/ERR 표). --scale 로 느림/빠름을 바꿔 본다.
//  · 정류장 분포는 D1 의 실제 밀도(points.csv: 반경 450m/300m 정류장 수 · 역 출구 수 · '(미정차)' 수)에 맞춰 만든다.
//  · 기기 쪽(앱 ↔ 서버 왕복 · 직접 받기 · 다시 그리기)은 ShellActivity.loadMapBodyRound / fetchBusNeed / busPaint 를 읽은 대로 옮긴 모델이다.
//
//  실행: node tools/bus-sim/sim.js [--reps 6] [--scale 1] [--rtt avg|good|weak] [--variant base|v1|v2|...] [--json out.json]
process.env.TZ = 'Asia/Seoul';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const REPS = parseInt(arg('reps', '6'), 10), SCALE = parseFloat(arg('scale', '1')), RTTP = arg('rtt', 'avg'), VARIANT = arg('variant', 'base'), OUT = arg('json', '');
const BUDGET_MS = 3000, CONC = parseFloat(arg('conc', '0.025')), PEMPTY = parseFloat(arg('empty', '0.05')), TAGOX = parseFloat(arg('tago', '1'));

// ── 난수 · 분포 ──
function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function gauss(R) { let u = 0; while (!u) u = R(); const v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function lognormal(R, med, p90) { const s = Math.log(p90 / med) / 1.2816; return med * Math.exp(s * gauss(R)); }
function pct(a, p) { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

// ── 가상 시계 ──
const V = { now: 0, seq: 0, q: [] };
V.set = (fn, ms) => { const id = ++V.seq; V.q.push({ id, t: V.now + Math.max(0, Math.round(ms || 0)), fn }); return id; };
V.clr = (id) => { const i = V.q.findIndex(x => x.id === id); if (i >= 0) V.q.splice(i, 1); };
V.sleep = (ms) => new Promise(r => V.set(r, ms));
class VDate extends Date { static now() { return V.now; } constructor(...a) { if (a.length) super(...a); else super(V.now); } }
async function drive(done) {
  for (let g = 0; g < 2e6; g++) {
    await new Promise(r => setImmediate(r));
    if (done()) return;
    if (!V.q.length) throw new Error('deadlock at ' + V.now);
    let bi = 0; for (let i = 1; i < V.q.length; i++) if (V.q[i].t < V.q[bi].t || (V.q[i].t === V.q[bi].t && V.q[i].id < V.q[bi].id)) bi = i;
    const x = V.q.splice(bi, 1)[0]; V.now = Math.max(V.now, x.t); x.fn();
  }
  throw new Error('too many steps');
}

// ── 공공 API 지연 모델(ms: [중앙값, 90%]) · 오류 봉투(HTTP_ERROR 200) 비율 ──
const LAT = { topisList: [350, 800], gbisList: [400, 900], tagoList: [2200, 6000], d1: [250, 450], topisArr: [600, 1300], gbisArr: [700, 1500], tagoArr: [900, 3000], tagoThru: [900, 3000], tagoCoord: [1500, 5000], other: [800, 2000] };
const ERR = { topisList: 0.02, gbisList: 0.03, tagoList: 0.05, d1: 0.005, topisArr: 0.03, gbisArr: 0.04, tagoArr: 0.07, tagoThru: 0.07, tagoCoord: 0.07, other: 0.05 };
const HANG = 0.004;                                                         // 아무 답도 안 오는 호출(서버는 시도마다 3초에 끊는다)
const RTTS = { good: [110, 220], avg: [240, 650], weak: [450, 1000] };
const ENVELOPE = '{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"errMsg":"HTTP_ERROR","returnReasonCode":"04"}}}';
function kindOf(u) {
  if (/getStationByPos/.test(u)) return 'topisList'; if (/getBusStationAroundListv2/.test(u)) return 'gbisList'; if (/getCrdntPrxmtSttnList/.test(u)) return /cityCode=/.test(u) ? 'tagoCoord' : 'tagoList';
  if (/bus-stops/.test(u)) return 'd1'; if (/getStationByUid/.test(u)) return 'topisArr'; if (/getBusArrivalListv2/.test(u)) return 'gbisArr';
  if (/getSttnAcctoArvlPrearngeInfoList/.test(u)) return 'tagoArr'; if (/getSttnThrghRouteList/.test(u)) return 'tagoThru'; return 'other';
}

// ── 지점 · 세계 만들기 ──
function loadPoints() {
  const L = fs.readFileSync(path.join(__dirname, 'points.csv'), 'utf8').trim().split('\n').slice(1);
  return L.map(l => { const c = l.split(','); return { g: c[0], la: +c[1], lo: +c[2], n450: +c[3], n300: +c[4], nex: +c[5], nns: +c[6], reg: c[0] === 'S' ? 'S' : c[0] === 'I' ? 'I' : 'G' }; });
}
function buildWorld(pt, R) {
  const cosL = 88000, mlat = 111000, stops = [];
  const place = (rmin, rmax) => { const r = Math.sqrt(rmin * rmin + R() * (rmax * rmax - rmin * rmin)), a = R() * 2 * Math.PI; return { la: pt.la + r * Math.sin(a) / mlat, lo: pt.lo + r * Math.cos(a) / cosL }; };
  const city = pt.reg === 'S' ? 11 : pt.reg === 'I' ? 23 : 31010;
  let idx = 0; const mk = (nm, pos, extra) => { idx++; const s = Object.assign({ nm, la: pos.la, lo: pos.lo, i: idx, nonstop: false, exit: false }, extra || {}); stops.push(s); return s; };
  const n300 = Math.max(1, pt.n300), n450 = Math.max(n300, pt.n450);
  const mk0 = mk('내가 선 정류장', { la: pt.la, lo: pt.lo });
  let k = 1, nex = Math.min(pt.nex, n300 - 1), nns = Math.min(pt.nns, n450 - 1);
  const stn = '가상' + Math.floor(R() * 99) + '역';
  while (k < n300) {                                                       // 300m 안
    const isEx = nex > 0 && (stops.filter(s => s.exit).length < nex);
    const s = mk(isEx ? stn + (stops.filter(x => x.exit).length + 1) + '번출구' : '정류장' + k + (R() < 0.5 ? '앞' : '사거리'), place(0, 300), { exit: isEx });
    if (!isEx && R() < 0.4 && k + 1 < n300) { k++; mk(s.nm, { la: s.la + (R() - .5) * 0.0008, lo: s.lo + (R() - .5) * 0.0008 }); }          // 길 건너 같은 이름 정류장
    k++;
  }
  for (let j = n300; j < n450; j++) mk('먼정류장' + j, place(300, 450));
  for (let j = 0; j < nns; j++) { const s = stops[stops.length - 1 - j]; if (s && !s.exit) { s.nm = s.nm + '(미정차)'; s.nonstop = true; } }
  const rt = (m, sd) => Math.max(0, Math.round(m + sd * gauss(R)));
  stops.forEach(s => {
    s.routes = s.nonstop ? 0 : (R() < PEMPTY ? 0 : Math.max(1, pt.reg === 'S' ? rt(5, 2.5) : pt.reg === 'I' ? rt(3.2, 2) : rt(3.6, 2)));
    s.ars = String(10000 + s.i + Math.floor(R() * 1000) * 100); s.sid = String(200000000 + s.i * 7 + Math.floor(R() * 1e5));
    s.d1id = (pt.reg === 'S' ? 'SEB1' : pt.reg === 'I' ? 'ICB1' : 'GGB2') + String(10000000 + s.i * 13 + Math.floor(R() * 1e5));
    s.tagoId = pt.reg === 'I' ? s.d1id.replace(/^ICB1/, 'ICB3') : s.d1id;
    s.tagoMissing = pt.reg === 'I' ? (s.exit ? R() < 0.15 : R() < 0.04) : R() < 0.03;          // TAGO 목록에 아직 없는 새 정류장
  });
  return { pt, stops, city, byArs: new Map(stops.map(s => [s.ars, s])), bySid: new Map(stops.map(s => [s.sid, s])), byTago: new Map(stops.map(s => [s.tagoId, s])) };
}
const dist = (pt, s) => Math.hypot((s.la - pt.la) * 111000, (s.lo - pt.lo) * 88000);
// 응답 본문 만들기(엔진이 읽는 모양)
function arrRoutesText(kind, s, R) {
  const n = s.routes; const rows = [];
  for (let j = 0; j < n; j++) rows.push({ no: String(100 + ((s.i * 7 + j * 31) % 900)), sec: 60 + Math.floor(R() * 900), prev: 1 + Math.floor(R() * 8), rid: 'R' + s.i + '_' + j });
  if (kind === 'topisArr') return '<ServiceResult><msgBody>' + rows.map(r => `<itemList><rtNm>${r.no}</rtNm><arrmsg1>${Math.floor(r.sec / 60)}분${r.sec % 60}초후[${r.prev}번째 전]</arrmsg1><traTime1>${r.sec}</traTime1><arrmsg2>20분후[9번째 전]</arrmsg2><traTime2>1200</traTime2><adirection>방면</adirection></itemList>`).join('') + '</msgBody></ServiceResult>';
  if (kind === 'gbisArr') return JSON.stringify({ response: { msgHeader: { resultCode: n ? 0 : 4 }, msgBody: n ? { busArrivalList: rows.map(r => ({ routeName: r.no, predictTimeSec1: r.sec, locationNo1: r.prev, routeDestName: '방면', routeTypeCd: 13, routeId: r.rid, flag: 'PASS' })) } : {} } });
  return JSON.stringify({ response: { body: n ? { items: { item: rows.map(r => ({ routeno: r.no, arrtime: r.sec, arrprevstationcnt: r.prev, routeid: r.rid })) }, totalCount: n } : { items: '', totalCount: 0 } } });
}
function bodyFor(W, kind, u, R) {
  const pt = W.pt;
  if (kind === 'topisList') {
    if (pt.reg !== 'S') return '<ServiceResult><msgBody></msgBody></ServiceResult>';
    return '<ServiceResult><msgBody>' + W.stops.filter(s => !s.nonstop).map(s => `<itemList><arsId>${s.ars}</arsId><stationNm>${s.nm}</stationNm><gpsX>${s.lo}</gpsX><gpsY>${s.la}</gpsY><dist>${Math.round(dist(pt, s))}</dist></itemList>`).join('') + '</msgBody></ServiceResult>';
  }
  if (kind === 'gbisList') {
    const L = (pt.reg === 'G' || (pt.reg === 'I' && INCG)) ? W.stops : [];
    return JSON.stringify({ response: { msgHeader: { resultCode: L.length ? 0 : 4 }, msgBody: L.length ? { busStationAroundList: L.map(s => ({ stationId: s.sid, stationName: s.nm, x: s.lo, y: s.la, mobileNo: String(10000 + s.i) })) } : {} } });
  }
  if (kind === 'tagoList') {
    const L = pt.reg === 'S' ? [] : W.stops.filter(s => !s.nonstop && !s.tagoMissing).sort((a, b) => dist(pt, a) - dist(pt, b)).slice(0, 50);
    return JSON.stringify({ response: { body: { items: L.length ? { item: L.map(s => ({ nodeid: s.tagoId, nodenm: s.nm, gpslati: s.la, gpslong: s.lo, citycode: String(W.city), nodeno: String(s.i) })) } : '' } } });
  }
  if (kind === 'd1') return JSON.stringify({ ok: true, count: W.stops.length, stops: W.stops.map(s => ({ node_id: s.d1id, node_nm: s.nm, city_code: String(W.city), lat: s.la, lng: s.lo, dist: Math.round(dist(pt, s)) })) });
  if (kind === 'topisArr') { const m = /arsId=(\d+)/.exec(u), s = m && W.byArs.get(m[1]); return s ? arrRoutesText(kind, s, R) : '<ServiceResult><msgBody></msgBody></ServiceResult>'; }
  if (kind === 'gbisArr') { const m = /stationId=(\d+)/.exec(u), s = m && W.bySid.get(m[1]); return s ? arrRoutesText(kind, s, R) : JSON.stringify({ response: { msgHeader: { resultCode: 4 }, msgBody: {} } }); }
  if (kind === 'tagoArr') { const m = /nodeId=([A-Za-z0-9]+)/.exec(u), s = m && W.byTago.get(m[1]); return s ? arrRoutesText(kind, s, R) : JSON.stringify({ response: { body: { items: '', totalCount: 0 } } }); }
  if (kind === 'tagoThru') { const m = /nodeid=([A-Za-z0-9]+)/.exec(u), s = m && W.byTago.get(m[1]); const n = s ? s.routes : 0; return JSON.stringify({ response: { body: n ? { items: { item: Array.from({ length: n }, (_, j) => ({ routeno: String(100 + ((s.i * 7 + j * 31) % 900)), routeid: 'R' + s.i + '_' + j })) }, totalCount: n } : { items: '', totalCount: 0 } } }); }
  return JSON.stringify({ response: { body: { items: '', totalCount: 0 } } });
}

// ── 서버 세계(공공 API · 캐시) ──
function mkServerWorld(W, R, stores, log, scale) {
  const inflight = { data: 0 };
  async function upstream(u) {                                   // 공공 API 한 번 — 지연 · 오류 봉투 · 멈춤
    const kind = kindOf(u), [m, q] = LAT[kind], host = /ws\.bus\.go\.kr/.test(u) ? 'seoul' : /gentle-lab|bus-stops/.test(u) ? 'd1' : 'data';
    const conc = host === 'data' ? inflight.data : 0;
    const pe = Math.min(0.45, ERR[kind] + (host === 'data' && /Arr|Thru|Coord/.test(kind) ? CONC * Math.max(0, conc - 3) : 0));
    const hang = R() < HANG, bad = !hang && R() < pe;
    const kx = /^tago/.test(kind) ? TAGOX : 1; let d = Math.min(20000, lognormal(R, m * scale * kx, q * scale * kx)); if (hang) d = 25000; if (bad) d *= 0.6;
    const t0 = V.now; if (host === 'data') inflight.data++;
    log.push({ kind, t0, d });
    await V.sleep(d); if (host === 'data') inflight.data--;
    if (bad) return new Response(ENVELOPE, { status: 200 });
    const bd = bodyFor(W, kind, u, R); if (process.env.BUSSIM_DEBUG2 && W.pt.reg === process.env.BUSSIM_DEBUG2 && /Arr/.test(kind) && !global.__dbg2) { global.__dbg2 = 1; console.log('DBG2', kind, u, bd.slice(0, 200)); }
    return new Response(bd, { status: 200 });
  }
  const BUSAPI = { fetch: async (req) => { const x = new URL(req.url), inner = x.searchParams.get('url') || (x.pathname + x.search); await V.sleep(15); return upstream(inner); } };
  const tagoAttempts = () => [['env-key', 1], ['env-key2', 2]].map(([via]) => ({ via, run: (inner) => upstream(inner) }));
  const edge = { async match(req) { await V.sleep(5); const v = stores.edge.get(req.url); return v ? new Response(v, { status: 200 }) : undefined; }, async put(req, res) { stores.edge.set(req.url, await res.clone().text()); } };
  const KV = { async get(k, o) { await V.sleep(30); const v = stores.kv.get(k); return v === undefined ? null : (o && o.type === 'json' ? JSON.parse(v) : v); }, async put(k, v) { stores.kv.set(k, v); } };
  return { env: { BUSAPI, ROWS_KV: KV, TAGO_KEY: 'k1', TAGO_KEY2: 'k2' }, tagoAttempts, edge };
}

// ── 엔진 코드(변형 포함) ──
function engineCode(variant) {
  let mapjs = fs.readFileSync(path.join(ROOT, 'engine/map.js'), 'utf8'); mapjs = mapjs.slice(0, mapjs.indexOf('if (typeof module'));
  let wk = fs.readFileSync(path.join(ROOT, 'engine/map-worker.js'), 'utf8');
  const rep = (src, a, b) => { if (src.indexOf(a) < 0) throw new Error('variant patch missed: ' + a.slice(0, 60)); return src.split(a).join(b); };
  const vs = variant.split('+'); if (vs.includes('v1') && vs.includes('v5')) throw new Error('v1 와 v5 는 함께 못 쓴다');
  if (vs.includes('v1')) {                                    // 도착정보 바퀴: 앞쪽(본문 a*)이 다 오면 덤(이웃·경유노선)은 짧게(120ms)만 더 기다린다
    wk = rep(wk, "if (arrWave) await Promise.race([Promise.all(ps), new Promise(function (r) { setTimeout(r, budget); })]);",
      "if (arrWave) { var coreIdx = []; need.forEach(function (n, i) { if (/^a[0-9]/.test(String(n.k || ''))) coreIdx.push(i); }); var cp = Promise.all(coreIdx.map(function (i) { return ps[i]; })).then(function () { return new Promise(function (r) { setTimeout(r, 120); }); }); await Promise.race([Promise.all(ps), cp, new Promise(function (r) { setTimeout(r, budget); })]); }");
  }
  if (vs.includes('v2')) {                                    // 대기 한도를 '정류장 단계 뒤 2.2초'가 아니라 '요청 받은 때부터 svb' 로(정류장 단계에 쓴 시간을 뺀다)
    wk = rep(wk, "var f = body.f, b = f.bus,", "var __t0 = Date.now(); var f = body.f, b = f.bus,");
    wk = rep(wk, "if (arrWave) await Promise.race(", "if (arrWave) budget = Math.max(MAPSV_ARR_MIN, budget - (Date.now() - __t0)); if (arrWave) await Promise.race(");
  }
  if (vs.includes('v3')) {                                    // '(미정차)' 자리표시 정류장은 목록에서 뺀다
    mapjs = rep(mapjs, "function mapStopExit(s)", "function mapNoStop(s) { return /\\(?미정차\\)?\\s*$/.test(s.nm || ''); }\nfunction mapStopExit(s)");
    mapjs = rep(mapjs, "    if (!isFinite(s.dist) || s.dist > r) return;\n", "    if (!isFinite(s.dist) || s.dist > r || mapNoStop(s)) return;\n");
  }
  if (vs.includes('v4')) {                                    // 첫 바퀴에서는 이웃 정류장(g)·경유노선(t) 조회를 덤으로 미룬다 — 본문(a)만 먼저
    mapjs = rep(mapjs, "var peers = mapPeersOf(s, pool), peerWait = false, pi;", "var peers = res.__first ? [] : mapPeersOf(s, pool), peerWait = false, pi;");
    mapjs = rep(mapjs, "if (res[tk] === undefined || mapArrErr(res[tk])) ask.push({ k: tk, url: mapThruUrl(s) });", "if (res.__first) { /* 덤은 뒤로 */ } else if (res[tk] === undefined || mapArrErr(res[tk])) ask.push({ k: tk, url: mapThruUrl(s) });");
  }
  if (vs.includes('v5')) {                                    // 가장 가까운 4곳(첫 화면에 보이는 카드)의 본문(a0~a3)이 오면 나머지는 120ms 만 더 기다리고 돌려준다(나머지는 이어서 받는다)
    wk = rep(wk, "if (arrWave) await Promise.race([Promise.all(ps), new Promise(function (r) { setTimeout(r, budget); })]);",
      "if (arrWave) { var visIdx = []; need.forEach(function (n, i) { if (/^a[0-3]$/.test(String(n.k || ''))) visIdx.push(i); }); var vp = Promise.all(visIdx.map(function (i) { return ps[i]; })).then(function () { return new Promise(function (r) { setTimeout(r, 120); }); }); await Promise.race([Promise.all(ps), vp, new Promise(function (r) { setTimeout(r, budget); })]); }");
  }
  if (vs.includes('v6')) {                                    // 서버가 도착정보 바퀴를 한 번 더 돈다(이웃·바꾼 ID·좌표 보정 등 '빈 응답 추적') — 총 대기는 정류장 단계 뒤 2.2초 안
    wk = rep(wk, "var f = body.f, b = f.bus,", "var __t0 = Date.now(); var f = body.f, b = f.bus,");
    wk = rep(wk, "    if (arrWave) break;                                     // 도착정보는 한 번만(못 받은 곳은 기기가 이어 받는다)",
      "    if (arrWave) { var __ib = out && out.info && out.info.bus; if (round >= 2 || !__ib || __ib.st !== 'need' || Date.now() - __t0 > 2000) break; budget = Math.max(MAPSV_ARR_MIN, Math.min(budget, 2600 - (Date.now() - __t0))); }");
  }
  if (vs.includes('k5')) mapjs = rep(mapjs, "MAP_NEAR_CAP = 8;", "MAP_NEAR_CAP = 5;");
  if (vs.includes('k6')) mapjs = rep(mapjs, "MAP_NEAR_CAP = 8;", "MAP_NEAR_CAP = 6;");
  if (vs.includes('incg')) { mapjs = rep(mapjs, "var MAP_INCHEON_BOX = [37.29, 37.66, 126.34, 126.81];", "var MAP_INCHEON_BOX = [0, 0, 0, 0];"); INCG = true; }
  if (vs.includes('h350')) wk = rep(wk, "setTimeout(function () { r(null); }, 700);", "setTimeout(function () { r(null); }, 350);");     // 헤지 간격 0.7초 → 0.35초
  return { code: mapjs + '\n' + wk + '\n;this.H = handleScreenMap;', first: vs.includes('v4') };
}
function load(world, SW, variantInfo) {
  const ctx = { ENGINE_VERSION: 'sim', Request, Response, URL, Promise, JSON, console, Math, Date: VDate, setTimeout: (f, ms) => V.set(f, ms), clearTimeout: (id) => V.clr(id), tagoAttempts: SW.tagoAttempts, caches: { default: SW.edge } };
  vm.runInNewContext(variantInfo.code, ctx);
  return ctx;
}

// ── 기기 모델 ──
function dev(R, prof) { const [m, q] = RTTS[prof]; const rtt = () => Math.max(40, lognormal(R, m, q)); return { rtt }; }
function directFetch(R, prof, kind, scale) {            // 기기가 gildongmu-bus + route-v2(/bus-tago) 두 길로 직접 받는 시간(NetPost.getBusArr: 두 길 경주 · 1.5초 뒤 늦은 헤지 · 오류 봉투면 0.15~0.3초 뒤 다시, 최대 3번)
  const [m, q] = LAT[kind]; let t = 0;
  for (let a = 0; a < 3; a++) {
    const one = (extra) => { const hang = R() < HANG, bad = !hang && R() < ERR[kind] + 0.02; let d = extra + Math.max(40, lognormal(R, RTTS[prof][0], RTTS[prof][1])) + 30 + Math.min(20000, lognormal(R, m * scale * (/^tago/.test(kind) ? TAGOX : 1), q * scale * (/^tago/.test(kind) ? TAGOX : 1))); if (hang) d = 1e9; return { d: bad ? d * 0.6 : d, bad }; };
    const A = one(0), B = one(1500);
    const okA = !A.bad && A.d < 8000, okB = !B.bad && B.d < 8000, best = Math.min(okA ? A.d : 1e9, okB ? B.d : 1e9);
    if (best < 1e9) return t + best;
    t += Math.min(5000, Math.min(A.d, B.d) < 1e8 ? Math.min(A.d, B.d) : 5000) + 150 + R() * 150;
  }
  return 1e9;
}
function arrKind(reg, nm) { return reg === 'S' ? 'topisArr' : (reg === 'G' || (reg === 'I' && INCG)) ? 'gbisArr' : 'tagoArr'; }

// ── 한 번 돌리기 ──
async function runOne(pt, state, rep, variantInfo, variantName) {
  const R = rng((pt.la * 1e5 | 0) ^ (pt.lo * 1e5 | 0) ^ (rep * 7919) ^ (state.charCodeAt(0) * 104729));
  const W = buildWorld(pt, rng((pt.la * 1e5 | 0) ^ (pt.lo * 1e5 | 0) ^ (rep * 7919))), stores = RUNSTORE.get(pt) || (RUNSTORE.set(pt, { edge: new Map(), kv: new Map() }), RUNSTORE.get(pt));
  const D = dev(R, RTTP), kind = arrKind(pt.reg);
  const mkReq = (svb) => JSON.stringify({ cap: 29, f: { part: 'b', mode: 'bus', reg: 'seoul', flt: 'ALL', th: 'pastel', bus: { vw: 'near', sel: -1, sv: 1, svb, fav: [], nx: {}, al: {}, ord: [], lat: pt.la, lng: pt.lo, res: variantInfo.first ? { __first: 1 } : {} } } });
  const cardsOf = (j) => (j.body || []).filter(n => n.t === 'bcard');
  const res = { reg: pt.reg, state, rep, ok: false };
  const finish = (ct) => {                                                  // ct[i] = i번째 카드에 도착정보가 그려진 시각(ms)
    const K = ct.length; res.K = K;
    if (!K) { res.T_all = res.T_first = res.vis4 = NaN; res.frac3 = NaN; return res; }
    res.T_all = Math.max.apply(null, ct); res.T_first = Math.min.apply(null, ct);
    res.vis4 = Math.max.apply(null, ct.slice(0, 4)); res.frac3 = ct.filter(x => x <= BUDGET_MS).length / K; res.ok = true; return res;
  };
  if (state === 'device-warm') {
    // 기기에 정류장 목록 보관본 · 도착정보 주소가 있다 → 엔진을 거치지 않고 곧장 직접 받는다. 서버 쪽 정류장 목록(= 엔진이 고르는 카드)을 구해 카드 수를 얻는다.
    const SW0 = mkServerWorld(W, R, { edge: new Map(), kv: new Map() }, [], SCALE), ctx0 = load(W, SW0, variantInfo);
    V.now = 0; V.q.length = 0;
    let j0 = null; ctx0.H(new Request('https://x/screen/map', { method: 'POST', body: mkReq(300) }), SW0.env).then(r => r.json()).then(j => { j0 = j; });
    await drive(() => j0); V.q.length = 0;
    const K = cardsOf(j0).length, arr = []; for (let i = 0; i < K; i++) arr.push({ i, t: directFetch(R, RTTP, kind, SCALE) });
    res.T_stops = 100; res.calls = K; res.T1 = res.T2 = 100;
    const pc0 = paintChain(R, D, arr, 100, K); return finish(arr.map(x => pc0[x.i]));
  }
  if (state === 'cold') { stores.edge.clear(); stores.kv.clear(); }
  const log = [], SW = mkServerWorld(W, R, stores, log, SCALE), ctx = load(W, SW, variantInfo);
  V.now = 0; V.q.length = 0;
  const up1 = D.rtt() / 2, up2 = D.rtt() / 2, dn1 = D.rtt() / 2, dn2 = D.rtt() / 2;
  let j1 = null, j2 = null, d1 = 0, d2 = 0;
  V.set(() => { ctx.H(new Request('https://x/screen/map', { method: 'POST', body: mkReq(300) }), SW.env).then(r => r.json()).then(j => { j1 = j; d1 = V.now; }); }, up1);
  V.set(() => { ctx.H(new Request('https://x/screen/map', { method: 'POST', body: mkReq(2200) }), SW.env).then(r => r.json()).then(j => { j2 = j; d2 = V.now; }); }, up2);
  await drive(() => j1 && j2); V.q.length = 0;
  const T1 = d1 + dn1, T2 = d2 + dn2, cd1 = cardsOf(j1), cd2 = cardsOf(j2), K = cd2.length;
  res.T1 = T1; res.T2 = T2; res.serverMs2 = d2 - up2; res.calls = log.length;
  res.callsArr = log.filter(x => /Arr|Thru|Coord/.test(x.kind)).length;
  const need2 = (j2.info && j2.info.bus && j2.info.bus.need || []).filter(n => /^a\d/.test(String(n.k))).length;
  res.needLeft = need2; res.st2 = j2.info && j2.info.bus && j2.info.bus.st; res.svf = j2.info && j2.info.svf;
  res.T_stops = Math.min(T1, T2) + 60;
  if (!K) return finish([]);
  const ct = new Array(K).fill(Infinity), pend = [];
  const t2r = T2 + 80;                                                      // 전체 응답을 받아 그린 시각
  for (let i = 0; i < K; i++) {
    const d1ok = cd1[i] && !cd1[i].ld;                                       // 정류장만 응답(0.3초 대기)에 이미 도착정보가 있던 카드
    if (d1ok && T1 + 60 < t2r) ct[i] = T1 + 60;
    else if (!cd2[i].ld) ct[i] = t2r;
    else pend.push({ i, t: t2r + directFetch(R, RTTP, kind, SCALE) });       // 서버가 못 채운 카드는 기기가 직접 받아 온다(deferNeed 라 전체 응답이 올 때까지 시작하지 않는다)
  }
  if (pend.length) { const pc = paintChain(R, D, pend, t2r, pend.length); pend.forEach(x => { ct[x.i] = pc[x.i]; }); }
  return finish(ct);
}
// 직접 받은 도착정보가 오는 대로 엔진에 다시 그리게 한다(busPaint: 왕복 + 아직 비었으면 서버가 최대 0.3초 더 기다림) — 한 번에 하나, 도중에 온 것은 다음 바퀴에 묶는다. → { 카드번호: 그려진 시각 }
function paintChain(R, D, arr, t0, total) {
  const out = {}, ts = arr.slice().sort((a, b) => a.t - b.t); let t = t0, painted = 0;
  const okArr = ts.filter(x => x.t < 1e8);
  arr.forEach(x => { out[x.i] = Infinity; });
  while (painted < okArr.length) {
    const start = Math.max(t, okArr[painted].t), have = okArr.filter(x => x.t <= start), remaining = total - have.length;
    const dur = D.rtt() + (remaining > 0 ? 250 : 40) + 60; t = start + dur;
    have.forEach(x => { if (out[x.i] === Infinity) out[x.i] = t; }); painted = have.length;
  }
  return out;
}
const RUNSTORE = new Map();
var INCG = false;

(async () => {
  const pts = loadPoints(), vinfo = engineCode(VARIANT), states = ['cold', 'server-warm', 'device-warm'], rows = [];
  for (const pt of pts) {
    for (let rep = 0; rep < REPS; rep++) {
      for (const st of states) {
        try { const r = await runOne(pt, st, rep, vinfo, VARIANT); r.g = pt.g; rows.push(r); } catch (e) { console.error('run fail', pt.g, st, e.message); }
      }
    }
  }
  fs.writeFileSync(OUT || path.join('/tmp/claude-0/-home-claude/a9371fe6-6ad8-56fd-bcdf-4ef2f8ed941f/scratchpad', 'bussim-' + VARIANT + '-s' + SCALE + '-' + RTTP + '.json'), JSON.stringify(rows));
  report(rows);
})().catch(e => { console.error(e); process.exit(1); });

function report(rows) {
  const out = [];
  for (const st of ['cold', 'server-warm', 'device-warm']) for (const reg of ['S', 'G', 'I', 'ALL']) {
    const rs = rows.filter(r => r.state === st && (reg === 'ALL' || r.reg === reg) && r.K > 0);
    if (!rs.length) continue;
    const f = (k) => rs.filter(r => isFinite(r[k]) && r[k] <= BUDGET_MS).length / rs.length;
    out.push({ state: st, reg, n: rs.length, stops3: f('T_stops'), first3: f('T_first'), vis43: f('vis4'), all3: f('T_all'), card3: rs.reduce((a, r) => a + r.frac3, 0) / rs.length, allP50: pct(rs.map(r => r.T_all).filter(isFinite), .5), allP90: pct(rs.map(r => r.T_all).filter(isFinite), .9), stopsP50: pct(rs.map(r => r.T_stops), .5), vis4P50: pct(rs.map(r => r.vis4).filter(isFinite), .5), calls: rs.reduce((a, r) => a + (r.calls || 0), 0) / rs.length });
  }
  console.log('variant=' + VARIANT + ' scale=' + SCALE + ' rtt=' + RTTP + ' conc=' + CONC + ' reps=' + REPS);
  console.log('상태          권역    n  정류장≤3s 첫도착≤3s 위4곳≤3s 전부≤3s 카드별≤3s | 정류장p50 위4곳p50 전부p50 전부p90 | 호출수');
  out.forEach(o => console.log([o.state.padEnd(12), o.reg.padEnd(3), String(o.n).padStart(4), (o.stops3 * 100).toFixed(0).padStart(7) + '%', (o.first3 * 100).toFixed(0).padStart(8) + '%', (o.vis43 * 100).toFixed(0).padStart(8) + '%', (o.all3 * 100).toFixed(0).padStart(7) + '%', (o.card3 * 100).toFixed(0).padStart(8) + '%', '|', String(Math.round(o.stopsP50)).padStart(8), String(Math.round(o.vis4P50)).padStart(8), String(Math.round(o.allP50)).padStart(7), String(Math.round(o.allP90)).padStart(7), '|', o.calls.toFixed(1).padStart(6)].join(' ')));
}
