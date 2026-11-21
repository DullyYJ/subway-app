// 버스 '한 번에 받기'(engine/map-worker.js · f.bus.sv=1) 시험.  실행: node test/map_server_fetch.test.js
//  서버가 엔진의 need 를 BUSAPI 바인딩으로 받아 채워 완성된 화면 + info.bres 를 돌려주는지 · 캐시 · 실패 때의 폴백 · cap 문턱.
process.env.TZ = 'Asia/Seoul';
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = p => path.join(__dirname, '..', p);
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const cut = t => t.slice(0, t.indexOf('if (typeof module'));
const code = cut(fs.readFileSync(R('engine/map.js'), 'utf8')) + '\n' + fs.readFileSync(R('engine/map-worker.js'), 'utf8') + '\n;this.H = handleScreenMap; this.T = handleBusTago; this.B = handleBusBudget; this.mapSvOne = mapSvOne; this.mapBusStops = mapBusStops;';
function load(extra) {
  const ctx = Object.assign({ ENGINE_VERSION: 'test', Request, Response, URL, Promise, setTimeout, clearTimeout, JSON, Date, console, AbortController }, extra || {});
  vm.runInNewContext(code, ctx);
  return ctx;
}
const SEOUL_POS = '<ServiceResult><msgBody>' + [['11111', '아라역5번출구', 127.0, 37.50054], ['22222', '길건너', 127.0, 37.5018], ['33333', '큰길', 127.0, 37.50252], ['44444', '멀리', 127.0, 37.506]]
  .map(r => `<itemList><arsId>${r[0]}</arsId><stationNm>${r[1]}</stationNm><gpsX>${r[2]}</gpsX><gpsY>${r[3]}</gpsY><dist>1</dist></itemList>`).join('') + '</msgBody></ServiceResult>';
const ARR = (no) => `<ServiceResult><msgBody><itemList><rtNm>${no}</rtNm><arrmsg1>3분30초후[2번째 전]</arrmsg1><traTime1>210</traTime1><arrmsg2>10분후[5번째 전]</arrmsg2><traTime2></traTime2><adirection>강남역</adirection></itemList></msgBody></ServiceResult>`;
function binding(log, fail) {
  return { fetch: async (req) => {
    const u = new URL(req.url), inner = u.searchParams.get('url') || (u.pathname + u.search);
    log.push(inner);
    if (fail && fail(inner)) return new Response('', { status: 500 });
    if (/getStationByPos/.test(inner)) return new Response(SEOUL_POS, { status: 200 });
    if (/getStationByUid\?arsId=(\d+)/.test(inner)) return new Response(ARR('N' + inner.match(/arsId=(\d+)/)[1].slice(0, 2)), { status: 200 });
    return new Response('', { status: 200 });
  } };
}
const post = (H, env, body) => H(new Request('https://x/screen/map', { method: 'POST', body: JSON.stringify(body) }), env).then(async r => ({ status: r.status, j: await r.json() }));
const base = (sv, cap) => ({ cap: cap == null ? 23 : cap, f: { part: 'b', mode: 'bus', th: 'dark', bus: Object.assign({ lat: 37.5, lng: 127.0, res: {} }, sv ? { sv: 1 } : {}) } });

(async () => {
  // ⓪ s170: 공공 API 오류 봉투(200)는 받은 것이 아니다 — 서버가 res 에 넣지 않고 info.bres 에도 싣지 않는다(기기가 다시 받는다)
  {
    const ENV = '{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"errMsg":"HTTP_ERROR","returnReasonCode":"04"}}}';
    const b2 = (log) => ({ fetch: async (req) => { const u = new URL(req.url), inner = u.searchParams.get('url') || ''; log.push(inner);
      if (/getStationByPos/.test(inner)) return new Response(SEOUL_POS, { status: 200 });
      if (/getStationByUid\?arsId=(\d+)/.test(inner)) return new Response(ENV, { status: 200 });
      return new Response('', { status: 200 }); } });
    const log = [], c = load(), r = await post(c.H, { BUSAPI: b2(log) }, base(true));
    const cards = r.j.body.filter(n => n.t === 'bcard');
    ok(r.status === 200 && cards.length === 3 && cards.every(x => x.ld && !x.em) && r.j.info.bus.st === 'need' && !(r.j.info.bres && r.j.info.bres.a0), '오류 봉투만 받았다: "도착정보 없음"이 아니라 불러오는 중 + 다시 받기(need)');
  }
  // ⓪-2 s170: 공공데이터 키가 둘이면 정류장을 반반씩(짝수 번째 키1 먼저 · 홀수 번째 키2 먼저) 나눠 묻고, 한쪽이 오류 봉투면 바로 다른 키로
  {
    const ENV = '{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"errMsg":"HTTP_ERROR","returnReasonCode":"04"}}}';
    const TN = JSON.stringify({ response: { body: { items: { item: [0, 1, 2, 3].map(i => ({ nodeid: 'ICB36800043' + i, nodenm: '정류장' + i, gpslati: 37.489 + i * 0.0003, gpslong: 126.724, citycode: '23', nodeno: '1' + i })) } } } });
    const AR = JSON.stringify({ response: { body: { items: { item: [{ routeno: '8', arrtime: 240, arrprevstationcnt: 3 }] } } } });
    const calls = [];
    const tagoAttempts = (env) => ['k1', 'k2'].map((n, i) => ({ via: i ? 'env-key2' : 'env-key', run: (inner) => { calls.push([n, inner]); const bad = n === 'k2' && /ICB368000431/.test(inner); return Promise.resolve(new Response(/getCrdntPrxmtSttnList/.test(inner) ? TN : bad ? ENV : AR, { status: 200 })); } }));
    const c = load({ tagoAttempts }), env = { TAGO_KEY: 'k1', TAGO_KEY2: 'k2' };
    const r = await post(c.H, env, { cap: 23, f: { part: 'b', mode: 'bus', th: 'dark', bus: { lat: 37.489, lng: 126.724, res: {}, sv: 1, svb: 3000 } } });
    const arr = calls.filter(x => /getSttnAcctoArvlPrearngeInfoList/.test(x[1]));
    const first = id => (arr.find(x => x[1].indexOf(id) >= 0) || [])[0];
    const cards = r.j.body.filter(n => n.t === 'bcard');
    ok(r.status === 200 && cards.length === 4 && cards.every(x => x.rows && x.rows.length === 1) && r.j.info.bus.st === 'ok', '두 키: 모든 정류장 도착정보를 한 번에 채운다(' + cards.length + '곳)');
    ok(arr.every(x => !/serviceKey=&|serviceKey=$/.test(x[1])) && arr.length >= 5, '빈 serviceKey 는 빼고 키는 실행 쪽이 붙인다 · 오류 난 곳은 다른 키로 다시 ' + arr.length);
    const ord = [...new Set(arr.map(x => x[1].match(/nodeId=(\w+)/)[1]))].map(id => id + ':' + first(id));
    ok(ord.length === 4 && ord.filter(x => x.endsWith('k1')).length === 2 && ord.filter(x => x.endsWith('k2')).length === 2, '정류장을 두 키로 반반 ' + ord.join());
    ok(arr.filter(x => /ICB368000431/.test(x[1])).map(x => x[0]).join() === 'k2,k1', '먼저 물은 키가 오류 봉투면 같은 정류장을 다른 키로 바로 다시');
  }
  // ① 서버가 정류장 → 도착정보를 한 번에 받는다
  {
    const log = [], c = load(), r = await post(c.H, { BUSAPI: binding(log) }, base(true));
    const cards = r.j.body.filter(n => n.t === 'bcard');
    ok(r.status === 200 && r.j.info.bus.st === 'ok' && cards.length === 3 && cards.every(x => x.rows && x.rows.length === 1), '한 번에: 반경 300m 안 3곳(멀리 있는 1곳 빼고) 모두 도착정보까지 채워 돌려준다 ' + JSON.stringify(r.j.info.bus));
    ok(r.j.info.bres && r.j.info.bres.tp && r.j.info.bres.a0 && r.j.info.bres.a2 && r.j.info.svf === 0, 'info.bres 에 받은 본문 · 실패 0');
    ok(log.filter(u => /getStationByPos/.test(u)).length === 1 && log.filter(u => /getStationByUid/.test(u)).length === 3, '정류장 조회 1번 + 도착정보 3번(동시)');
    ok(/tmX=127&tmY=37\.5&radius=450/.test(log[0]) || log.some(u => /tmX=127&tmY=37\.5&radius=450/.test(u)), '조회 좌표는 칸 가운데 · 반경 450m');
  }
  // ② 정류장 목록 엣지 캐시
  {
    const store = new Map();
    const caches = { default: { match: async (rq) => store.has(rq.url) ? new Response(store.get(rq.url)) : undefined, put: async (rq, rs) => { store.set(rq.url, await rs.text()); } } };
    let off = 0; class MD extends Date { static now() { return Date.now.call(Date) + off; } }
    const log1 = [], log2 = [], log3 = [], c = load({ caches, Date: MD });
    await post(c.H, { BUSAPI: binding(log1) }, base(true));
    await post(c.H, { BUSAPI: binding(log2) }, base(true));
    ok(log1.some(u => /getStationByPos/.test(u)) && !log2.some(u => /getStationByPos/.test(u)), '같은 칸을 다시 열면 정류장 조회는 캐시');
    ok(log2.filter(u => /getStationByUid/.test(u)).length === 0, 's290: 5초 안에 다시 열면 도착정보는 방금 받은 것을 쓴다(같은 주소는 다시 부르지 않는다)');
    off = 6000;
    await post(c.H, { BUSAPI: binding(log3) }, base(true));
    ok(log3.filter(u => /getStationByUid/.test(u)).length === 3, '5초가 지나면 도착정보만 새로 받는다');
  }
  // ②-1 s383: 새로고침(f.bus.nf=1)은 정류장 목록 캐시를 건너뛰고 공공 API 에서 새로 받는다
  {
    const store = new Map();
    const caches = { default: { match: async (rq) => store.has(rq.url) ? new Response(store.get(rq.url)) : undefined, put: async (rq, rs) => { store.set(rq.url, await rs.text()); } } };
    const log1 = [], log2 = [], log3 = [], c = load({ caches });
    await post(c.H, { BUSAPI: binding(log1) }, base(true));
    const fb = base(true); fb.f.bus.nf = 1;
    await post(c.H, { BUSAPI: binding(log2) }, fb);
    ok(log2.some(u => /getStationByPos/.test(u)), 's383: 새로고침(nf)은 캐시가 있어도 정류장 목록을 다시 조회');
    await post(c.H, { BUSAPI: binding(log3) }, base(true));
    ok(!log3.some(u => /getStationByPos/.test(u)), 's383: 새로고침으로 받은 새 목록이 보관본이 된다(그 뒤 일반 열기는 캐시)');
  }
  // ②-1b s383: TAGO(tn)가 빠뜨린 정류장은 D1 로 채운다(같은 TAGO 열쇠는 하나로)
  {
    const c = load();
    const tn = JSON.stringify({ response: { body: { items: { item: [{ nodeid: 'ICB3A', nodenm: '아라역6번출구', gpslati: 37.5005, gpslong: 127.0, citycode: 23 }] } } } });
    const d1 = JSON.stringify({ stops: [{ node_id: 'ICB1A', node_nm: '아라역6번출구', lat: 37.5005, lng: 127.0, city_code: '23' }, { node_id: 'ICB1B', node_nm: '아라역8번출구', lat: 37.5012, lng: 127.0, city_code: '23' }] });
    const st = c.mapBusStops({ bus: { lat: 37.5, lng: 127.0, res: { tn, d1 } } });
    ok(st.length === 2 && st.some(x => x.nm === '아라역8번출구') && st.filter(x => x.nm === '아라역6번출구').length === 1, 's383: TAGO + D1 합침(같은 정류장은 하나): ' + st.map(x => x.nm).join());
    ok(c.mapBusStops({ bus: { lat: 37.5, lng: 127.0, res: { tn } } }).length === 1, 'D1 이 없으면 TAGO 만');
  }
  // ②-2 s290: 동시에 같은 도착정보를 부르면 하나로 합친다 · 빈 값은 기억하지 않는다
  {
    const log = [], c = load();
    const [r1, r2] = await Promise.all([post(c.H, { BUSAPI: binding(log) }, base(true)), post(c.H, { BUSAPI: binding(log) }, base(true))]);
    ok(r1.j.info.bus.st === 'ok' && r2.j.info.bus.st === 'ok' && log.filter(u => /getStationByUid/.test(u)).length === 3, '동시에 두 번 물어도 도착정보 공공 호출은 3번뿐 ' + log.filter(u => /getStationByUid/.test(u)).length);
    const flaky = []; let phase = 1;
    const b3 = { fetch: async (req) => { const u = new URL(req.url), inner = u.searchParams.get('url') || (u.pathname + u.search); flaky.push(inner); if (/getStationByPos/.test(inner)) return new Response(SEOUL_POS, { status: 200 }); if (/getStationByUid/.test(inner)) return phase === 1 ? new Response('', { status: 500 }) : new Response(ARR('N1'), { status: 200 }); return new Response('', { status: 200 }); } };
    const c3 = load();
    await post(c3.H, { BUSAPI: b3 }, base(true));
    const before = flaky.filter(u => /getStationByUid/.test(u)).length; phase = 2;
    const r3 = await post(c3.H, { BUSAPI: b3 }, base(true));
    ok(flaky.filter(u => /getStationByUid/.test(u)).length > before && r3.j.info.bus.st === 'ok', '실패(빈 값)는 기억하지 않아 바로 다시 받는다');
  }
  // ②-3 s290: 정류장 목록 전국 저장소(KV) — 데이터센터 캐시가 비어도 KV 에서 · 처음 받으면 KV 와 목록에 기록
  {
    const kv = new Map(), mkKv = () => ({ get: async (k, o) => { const v = kv.get(k); return v == null ? null : (o && (o.type === 'json' || o === 'json') ? JSON.parse(v) : v); }, put: async (k, v, o) => { kv.set(k, v); kv.ttl = o; } });
    const pend = [], ctxw = { waitUntil: (p) => pend.push(p) };
    const log1 = [], log2 = [], c = load({ MAPSV_CTX: undefined });
    c.MAPSV_CTX = ctxw;
    const env = () => ({ BUSAPI: binding([]), ROWS_KV: mkKv() });
    const e1 = { BUSAPI: binding(log1), ROWS_KV: mkKv() };
    await post(c.H, e1, base(true));
    await Promise.all(pend);
    const keys = [...kv.keys()];
    ok(keys.some(k => /^bs2:[0-9a-f]{16}$/.test(k)) && keys.includes('bsreg') && kv.ttl && kv.ttl.expirationTtl === 14 * 86400, '처음 받은 정류장 목록은 KV 에 14일 + 기억 목록(bsreg)에 기록 ' + keys.join());
    const reg = JSON.parse(kv.get('bsreg'));
    ok(reg.length >= 1 && reg.every(e => /^(tp|gg|tn|d1)$/.test(e.k) && typeof e.u === 'string' && e.at > 0), '목록 항목은 {k,u,at}');
    const c2 = load(); c2.MAPSV_CTX = ctxw;
    await post(c2.H, { BUSAPI: binding(log2), ROWS_KV: mkKv() }, base(true));
    ok(log1.some(u => /getStationByPos/.test(u)) && !log2.some(u => /getStationByPos/.test(u)) && log2.filter(u => /getStationByUid/.test(u)).length === 3, '새 데이터센터(캐시 없음)도 KV 에서 정류장 목록을 바로 쓴다 · 도착정보만 새로 받는다');
    // 엉뚱한 주소 값(해시 겹침)이면 쓰지 않는다
    const k0 = keys.find(k => /^bs2:/.test(k)), v0 = JSON.parse(kv.get(k0)); v0.u = 'https://other'; kv.set(k0, JSON.stringify(v0));
    const log3 = [], c3 = load(); c3.MAPSV_CTX = ctxw;
    await post(c3.H, { BUSAPI: binding(log3), ROWS_KV: mkKv() }, base(true));
    ok(log3.some(u => /getStationByPos/.test(u)), '저장된 주소가 다르면(해시 겹침) 쓰지 않고 새로 받는다');
  }
  // ②-4 s290: cron — 6일 넘은 항목만 오래된 순으로 최대 8개 다시 받는다
  {
    const kv = new Map(), env = { BUSAPI: binding([]), ROWS_KV: { get: async (k) => kv.has(k) ? JSON.parse(kv.get(k)) : null, put: async (k, v) => { kv.set(k, v); } } };
    const U = 'https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList?cityCode=23&gpsLati=37.5&gpsLong=127&_type=json';
    const now = Date.now(), reg = [];
    for (let i = 0; i < 12; i++) reg.push({ k: 'tn', u: U + '&i=' + i, at: now - (7 + i) * 86400000 });
    reg.push({ k: 'tn', u: U + '&fresh=1', at: now - 86400000 });
    kv.set('bsreg', JSON.stringify(reg));
    const TN = JSON.stringify({ response: { body: { items: { item: [{ nodeid: 'ICB1', nodenm: 'a', gpslati: 37.5, gpslong: 127, citycode: '23', nodeno: '1' }] } } } });
    const c = load({ tagoAttempts: () => [{ via: 'env-key', run: async () => new Response(TN, { status: 200 }) }] });
    const code2 = vm.runInContext('mapBusWarmCron', vm.createContext(c));
    const n = await code2(env, now);
    const after = JSON.parse(kv.get('bsreg'));
    ok(n === 8 && after.filter(e => e.at === now).length === 8, '한 번에 8개까지 다시 받는다 ' + n);
    ok(after.find(e => /fresh=1/.test(e.u)).at === now - 86400000 && after.filter(e => e.at < now - 7 * 86400000).length === 3, '어제 받은 것은 건드리지 않고, 가장 오래된 것부터 받는다');
    ok(await code2({}, now) === 0 && await code2({ ROWS_KV: { get: async () => null, put: async () => { } } }, now) === 0, '저장소나 목록이 없으면 아무것도 안 한다');
  }
  // ②-5 s290: 워커 연결 — 요청 ctx 를 건네 응답 뒤 저장 · 알림 시각에 정류장 목록 다시 받기
  {
    const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
    ok(/async function handleFetch\(request, env, ctx\) \{\n  if \(typeof MAPSV_CTX !== "undefined"\) MAPSV_CTX = ctx \|\| null;/.test(w) && /ctx\.waitUntil\(mapBusWarmCron\(env, Date\.now\(\)\)\.catch\(/.test(w), '워커: ctx 전달 · cron 에서 mapBusWarmCron');
  }
  // ③ 바인딩이 없으면 need 를 그대로(기기가 예전 방식으로 이어 감)
  {
    const c = load(), r = await post(c.H, {}, base(true));
    ok(r.status === 200 && r.j.info.bus.st === 'need' && r.j.info.bus.need.length >= 1 && !r.j.info.bres, '바인딩이 없으면 need 가 남은 화면(폴백)');
  }
  // ④ sv 가 없거나 cap 이 낮으면 서버가 받지 않는다
  {
    const log = [], c = load();
    const r1 = await post(c.H, { BUSAPI: binding(log) }, base(false)), r2 = await post(c.H, { BUSAPI: binding(log) }, base(true, 22));
    ok(r1.j.info.bus.st === 'need' && r2.j.info.bus.st === 'need' && log.length === 0, 'sv 없음 · cap 22 는 예전과 똑같이 need');
  }
  // ⑤ 도착정보 일부 실패 → svf
  {
    const log = [], c = load(), r = await post(c.H, { BUSAPI: binding(log, u => /arsId=22222/.test(u)) }, base(true));
    const nd = r.j.info.bus.need || [];
    ok(r.j.info.svf === 1 && r.j.info.bus.st === 'need' && nd.length === 1 && /arsId=22222/.test(nd[0].url) && r.j.info.bres[nd[0].k] === undefined && r.j.info.bres.a0 && r.j.info.bres.a2, '도착정보가 하나 안 오면 svf=1 · 그 곳만 need 로 남긴다(빈 값으로 굳혀 "도착정보 없음"이 되지 않게 — 기기가 직접 받는다)');
    const cs = r.j.body.filter(n => n.t === 'bcard');
    ok(cs.filter(x => x.ld).length === 1 && cs.filter(x => x.em).length === 0, '못 받은 곳은 "불러오는 중", "도착정보 없음"이 아니다');
  }
  // ⑤-b 도착정보가 시간 안에 안 오면(느린 공공 API) 온 것만 싣고 나머지는 need
  {
    const log = [], b0 = binding(log), slow = { fetch: async (req) => { const inner = new URL(req.url).searchParams.get('url') || ''; if (/arsId=22222/.test(inner)) await new Promise(r => setTimeout(r, 3000)); return b0.fetch(req); } };
    const c = load(), t0 = Date.now(), r = await post(c.H, { BUSAPI: slow }, base(true));
    ok(Date.now() - t0 < 2900 && r.j.info.bus.st === 'need' && r.j.info.bus.need.length === 1 && r.j.info.bres.a0, '느린 한 곳 때문에 전체가 기다리지 않는다(2.2초 안에 온 것만) ' + (Date.now() - t0) + 'ms');
  }
  // ⑥-b s177: 정류장 목록 — TAGO 가 느려도(수 초) 서버 정류장 표(D1)가 먼저 정류장을 주면 기다리지 않고 도착정보로 넘어간다 · 서울은 D1 이 먼저 와도 TOPIS 를 기다린다
  {
    const D1 = JSON.stringify({ ok: true, count: 2, stops: [{ node_id: 'BSB1', node_nm: '시청역', city_code: '21', lat: 35.1796, lng: 129.0757 }, { node_id: 'BSB2', node_nm: '부산시청', city_code: '21', lat: 35.1798, lng: 129.0758 }] });
    const AR = JSON.stringify({ response: { body: { items: { item: [{ routeno: '8', arrtime: 240, arrprevstationcnt: 3, routeid: 'R1' }] } } } });
    const log = [], bnd = { fetch: async (req) => { const u = new URL(req.url), inner = u.searchParams.get('url') || (u.pathname + u.search); log.push(inner);
      if (/getCrdntPrxmtSttnList/.test(inner)) { await new Promise(r => setTimeout(r, 4500)); return new Response('', { status: 200 }); }
      if (/bus-stops/.test(inner)) return new Response(D1, { status: 200 });
      if (/getSttnAcctoArvlPrearngeInfoList/.test(inner)) return new Response(AR, { status: 200 });
      if (/getSttnThrghRouteList/.test(inner)) return new Response('{"response":{"body":{"items":""}}}', { status: 200 });          // s199: 경유노선(덤)
      return new Response('', { status: 200 }); } };
    const c = load(), t0 = Date.now(), r = await post(c.H, { BUSAPI: bnd }, { cap: 23, f: { part: 'b', mode: 'bus', th: 'dark', bus: { lat: 35.1796, lng: 129.0756, res: {}, sv: 1, svb: 2000 } } });
    const cards = r.j.body.filter(n => n.t === 'bcard'), dt = Date.now() - t0;
    ok(r.status === 200 && dt < 2500 && cards.length === 2 && cards.every(x => x.rows && x.rows.length === 1) && (r.j.info.bus.st === 'ok' || r.j.info.bus.need.every(n => /^r/.test(n.k))), 'TAGO 가 4.5초 걸려도 D1 로 정류장 2곳 + 도착정보를 바로 ' + dt + 'ms');
    ok(r.j.info.bres && r.j.info.bres.d1 && r.j.info.bres.tn === '', '기다리지 않은 출처는 빈 값으로 돌려준다(기기가 보관)');
  }
  {
    const POS = SEOUL_POS, D1 = JSON.stringify({ ok: true, count: 1, stops: [{ node_id: 'X1', node_nm: '엉뚱', city_code: '11', lat: 37.5, lng: 127.0 }] });
    const log = [], bnd = { fetch: async (req) => { const u = new URL(req.url), inner = u.searchParams.get('url') || (u.pathname + u.search); log.push(inner);
      if (/getStationByPos/.test(inner)) { await new Promise(r => setTimeout(r, 400)); return new Response(POS, { status: 200 }); }
      if (/bus-stops/.test(inner)) return new Response(D1, { status: 200 });
      if (/getStationByUid\?arsId=(\d+)/.test(inner)) return new Response(ARR('N' + inner.match(/arsId=(\d+)/)[1].slice(0, 2)), { status: 200 });
      return new Response('', { status: 200 }); } };
    const c = load(), r = await post(c.H, { BUSAPI: bnd }, base(true));
    const cards = r.j.body.filter(n => n.t === 'bcard');
    ok(cards.length === 3 && r.j.info.stops.every(x => x.src === 'topis'), '서울은 D1 이 먼저 와도 TOPIS 정류장을 쓴다(출처 우선순위)');
  }
  // ⑥ 정류장도 못 받으면(전부 실패) need 그대로
  {
    const c = load(), r = await post(c.H, { BUSAPI: binding([], () => true) }, base(true));
    ok(r.j.info.bus.st === 'need' && !r.j.info.bres, '모두 실패하면 첫 화면(need) 그대로');
  }
  // ⑦ 허용 안 한 주소는 받지 않는다(엔진이 만든 주소만)
  {
    const c = load();
    ok(c.mapSvViaBinding({ BUSAPI: binding([]) }, 'https://evil.example/x') === null && c.mapSvViaBinding({ BUSAPI: binding([]) }, 'http://ws.bus.go.kr/api/x?y=1') !== null && c.mapSvViaBinding({ BUSAPI: binding([]) }, 'https://gentle-lab-7e47subway-api.phg0643.workers.dev/bus-stops?lat=37.5&lng=127&radius=450') !== null, '허용 호스트(공공 API · D1 정류장 표)만');
  }
  // ⑨ s174: 헤지 — 첫 길이 느리면(0.7초) 다른 키를 동시에 띄워 먼저 온 정상 본문을 쓴다
  {
    const GOODT = '<response><body><items><item><arrtime>120</arrtime></item></items></body></response>';
    const mkc = (first, second) => load({ tagoAttempts: () => [{ via: 'env-key', run: first }, { via: 'env-key2', run: second }] });
    const U = 'https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList?cityCode=23&nodeId=ICB1&_type=json';
    let c = mkc(() => new Promise(r => setTimeout(() => r(new Response(GOODT, { status: 200 })), 2000)), () => Promise.resolve(new Response(GOODT, { status: 200 })));
    let t0 = Date.now(), body = await c.mapSvOne({}, 'a0', U);
    ok(body === GOODT && Date.now() - t0 < 1300, '첫 길이 느려도 0.7초 뒤 다른 키가 먼저 온다 ' + (Date.now() - t0) + 'ms');
    c = mkc(() => Promise.resolve(new Response('{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"errMsg":"HTTP_ERROR"}}}', { status: 200 })), () => Promise.resolve(new Response(GOODT, { status: 200 })));
    t0 = Date.now(); body = await c.mapSvOne({}, 'a0', U);
    ok(body === GOODT && Date.now() - t0 < 300, '오류 봉투는 기다리지 않고 곧바로 다음 키 ' + (Date.now() - t0) + 'ms');
    c = mkc(() => Promise.resolve(new Response('{"OpenAPI_ServiceResponse":1}', { status: 200 })), () => Promise.reject(new Error('x')));
    ok((await c.mapSvOne({}, 'a0', U)) === '', '모두 실패하면 빈 본문(없음으로 굳히지 않는다)');
    c = mkc(() => Promise.resolve(new Response(GOODT, { status: 200 })), () => { throw new Error('호출되면 안 된다'); });
    ok((await c.mapSvOne({}, 'a0', U)) === GOODT, '첫 길이 바로 오면 다른 길은 쓰지 않는다');
  }
  // ⑧ s172: /bus-tago 중계 — 키 2개 번갈아 · 오류 봉투면 다른 키 · 허용 호스트만 · 키는 응답에 없다
  {
    const ERRENV = '{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"errMsg":"HTTP_ERROR"}}}', GOOD = '<response><body><items><item><arrtime>120</arrtime></item></items></body></response>';
    const seen = [];
    const fx = (badKey) => async (u) => { seen.push(u); const m = /serviceKey=([^&]+)/.exec(u); const k = m ? decodeURIComponent(m[1]) : ''; return new Response(k === badKey ? ERRENV : GOOD, { status: 200 }); };
    const call = (c, url, env) => c.T(new Request('https://x/bus-tago?url=' + encodeURIComponent(url)), env);
    const env = { TAGO_KEY: 'KEYONE', TAGO_KEY2: 'KEYTWO' };
    const U = 'https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList?cityCode=23&nodeId=ICB1&_type=json';
    let c = load({ fetch: fx('') });
    const r1 = await call(c, U, env), r2 = await call(c, U, env);
    const k1 = /serviceKey=([^&]+)/.exec(seen[0])[1], k2 = /serviceKey=([^&]+)/.exec(seen[1])[1];
    ok(r1.status === 200 && r2.status === 200 && k1 !== k2, '두 키를 번갈아 쓴다 ' + k1 + '/' + k2);
    ok(!(await r1.clone().text()).includes('KEYONE') && r1.headers.get('Access-Control-Allow-Origin') === '*', '응답에 키가 없고 CORS 가 열려 있다');
    seen.length = 0; c = load({ fetch: fx('KEYONE') });
    let ra = await call(c, U, env), rb = await call(c, U, env);
    ok(ra.status === 200 && rb.status === 200 && (await ra.text()) === GOOD && (await rb.text()) === GOOD, '한 키가 오류 봉투(200)여도 다른 키로 받는다');
    seen.length = 0; c = load({ fetch: fx('KEYONE') });
    const rc = await call(c, U, { TAGO_KEY: 'KEYONE' });
    ok(rc.status === 502, '키가 하나뿐이고 오류면 502(기기가 다른 길로)');
    c = load({ fetch: async () => { throw new Error('x'); } });
    ok((await call(c, U, env)).status === 502, '네트워크 오류면 502');
    c = load({ fetch: fx('') }); seen.length = 0;
    const bad = await call(c, 'https://evil.example/x?serviceKey=zzz', env), big = await call(c, 'https://apis.data.go.kr/' + 'a'.repeat(1600), env);
    ok(bad.status === 400 && big.status === 400 && seen.length === 0, '허용 호스트가 아니거나 너무 긴 주소는 거절(나가지 않는다)');
    const U2 = 'https://apis.data.go.kr/x?serviceKey=OLD&cityCode=1';
    await call(c, U2, env);
    ok(seen.length === 1 && !/OLD/.test(seen[0]) && /serviceKey=KEY/.test(seen[0]), '들어온 주소의 serviceKey 는 지우고 서버 키를 쓴다');
    const op = await c.T(new Request('https://x/bus-tago', { method: 'OPTIONS' }), env);
    ok(op.status === 204, 'OPTIONS 204');
  }
  // ⓪-3 s248: 역 시간표 — f.tt.sv=1 이면 서버(다음 열차 엔진)가 모든 노선 시간표를 직접 채워 한 번에 완성된 화면 · info.fill 로도 돌려준다
  {
    const calls = [];
    const nt = { timetable: (q) => { calls.push(q.line + '|' + (q.day || '-')); return { line: q.line, stn: q.from, dayCode: q.day || 'DAY', today: 'DAY', days: [{ code: 'DAY', label: '평일' }, { code: 'SUN', label: '토·일·공휴일' }], nowMin: 780, dirs: [{ dk: '상', toward: '소요산', times: [330, 340, 790, 800], first: 330, last: 800, nextMin: 790, tomorrow: false }, { dk: '하', toward: '인천', times: [335, 350, 795], first: 335, last: 795, nextMin: 795, tomorrow: false }], noData: false }; } };
    const ttBody = (extra) => ({ cap: 23, f: { part: 'tt', stn: '영등포', reg: '수도권', th: 'dark', tt: Object.assign({ st: 'loading', sel: { line: '', day: '', dk: '' }, res: {} }, extra || {}) } });
    const HS = require('../engine/home-stations').HOME_STNS;
    let c = load({ ntEnsure: async () => nt, HOME_STNS: HS });
    let r = await post(c.H, {}, ttBody({ sv: 1 }));
    const txt = JSON.stringify(r.j.body || []) + JSON.stringify(r.j.head || []);
    ok(r.status === 200 && r.j.info.need === null && r.j.info.fill && r.j.info.fill['1호선|-'] && /첫차/.test(txt) && !/불러오는 중/.test(txt), '서버가 채워 한 번에: 시간표가 그려지고 need 없음 · info.fill 에 노선별 시간표');
    ok(calls.every(x => /\|-$/.test(x)), '요일을 안 골랐으면 노선마다 한 번씩(요일 미정): ' + calls.join());
    const pre = nt.timetable({ line: '1호선', from: '영등포' });
    calls.length = 0;
    r = await post(c.H, {}, ttBody({ sv: 1, sel: { line: '1호선', day: 'SUN', dk: '' }, res: { '1호선|-': pre } }));
    ok(r.j.info.need === null && r.j.info.fill && Object.keys(r.j.info.fill).join() === '1호선|SUN' && calls.join() === '1호선|SUN', '요일을 고르면 그 노선·요일만 새로 채운다(이미 있는 것은 다시 계산 안 함): ' + calls.join());
    calls.length = 0;
    r = await post(c.H, {}, ttBody({ sv: 1, res: { '1호선|-': pre } }));
    ok(!r.j.info.fill && r.j.info.need === null, '이미 다 있으면 채우지 않는다(fill 없음)');
    r = await post(c.H, {}, ttBody());
    ok(!r.j.info.fill && r.j.info.need && r.j.info.need.line === '1호선', 'sv 가 없으면(옛 앱) 예전처럼 need 를 남긴다');
    c = load({ ntEnsure: async () => null, HOME_STNS: HS });
    r = await post(c.H, {}, ttBody({ sv: 1 }));
    ok(r.status === 200 && !r.j.info.fill && r.j.info.need, '시각표를 못 불러오면 need 가 남아 기기가 예전 길로 받는다');
    c = load({ ntEnsure: async () => { throw new Error('boom'); }, HOME_STNS: HS });
    r = await post(c.H, {}, ttBody({ sv: 1 }));
    ok(r.status === 200 && r.j.info.need, '시각표 엔진이 예외를 던져도 화면은 나간다');
  }
  // ⓪-4 s451: 지도를 2초 꾹 눌러 고른 곳(f.bus.pin)은 서버가 받을 때도 그곳을 기준으로 100 m — 내 위치가 멀어도(또는 없어도) 정류장이 나온다
  {
    const log = [], c = load();
    const pb = (extra) => ({ cap: 23, f: { part: 'b', mode: 'bus', th: 'dark', bus: Object.assign({ res: {}, sv: 1, pin: [37.5018, 127.0] }, extra) } });
    let r = await post(c.H, { BUSAPI: binding(log) }, pb({ lat: 37.45, lng: 127.2 }));
    let cards = r.j.body.filter(n => n.t === 'bcard');
    ok(r.status === 200 && cards.length >= 1 && cards.length <= 3 && r.j.info.bus.st === 'ok', '꾹 누른 곳 주변(내 위치는 멀다): 정류장이 나온다 ' + cards.length);
    ok(log.some(u => /getStationByPos/.test(u) && /37\.50/.test(decodeURIComponent(u))), '정류장 목록은 꾹 누른 곳 좌표로 묻는다');
    r = await post(c.H, { BUSAPI: binding([]) }, pb({}));
    cards = r.j.body.filter(n => n.t === 'bcard');
    ok(r.status === 200 && cards.length >= 1, '내 위치가 없어도 꾹 누른 곳만으로 서버가 채운다 ' + cards.length);
  }
  // ⑨ s458 (YJ 11-16 화면: 아라역 사거리인데 4 · 5 · 8번출구가 빠지고 먼 아라동행정복지센터가 나온다) — 실제 정류장 표(D1, 2026-11-16)로 재현
  //   TAGO 주변 목록에는 새 출구 정류장(ICB…1432 · 1434 · 1435)이 없고 우리 정류장 표(D1)에만 있다. TAGO 가 먼저 오면(서버 보관본 · 0.05초) 예전엔 D1(0.3초)을 버리고 그렸다.
  {
    const ALL = JSON.parse(fs.readFileSync(R('test/fixtures/ara_bus_stops.json'), 'utf8')), ME = [37.5922, 126.71368];
    const D1 = JSON.stringify({ ok: true, count: ALL.length, stops: ALL.map(x => Object.assign({ city_code: '23' }, x)) });
    const NEW = /14(32|33|34|35)$/;      // TAGO 에 아직 없는 새 정류장
    const TN = JSON.stringify({ response: { body: { items: { item: ALL.filter(x => /^ICB/.test(x.node_id) && !NEW.test(x.node_id)).map(x => ({ nodeid: x.node_id.replace(/^ICB1/, 'ICB3'), nodenm: x.node_nm, gpslati: x.lat, gpslong: x.lng, citycode: 23 })) } } } });
    const AR = JSON.stringify({ response: { body: { items: { item: [{ routeno: '941', arrtime: 240, arrprevstationcnt: 3, routeid: 'R1' }] } } } });
    const mk = (tnMs, d1Ms, d1Fail) => ({ fetch: async (req) => { const u = new URL(req.url), inner = u.searchParams.get('url') || (u.pathname + u.search);
      if (/getCrdntPrxmtSttnList/.test(inner)) { await new Promise(r => setTimeout(r, tnMs)); return new Response(TN, { status: 200 }); }
      if (/bus-stops/.test(inner)) { await new Promise(r => setTimeout(r, d1Ms)); return d1Fail ? new Response('', { status: 500 }) : new Response(D1, { status: 200 }); }
      if (/getSttnAcctoArvlPrearngeInfoList/.test(inner)) return new Response(AR, { status: 200 });
      if (/getSttnThrghRouteList/.test(inner)) return new Response('{"response":{"body":{"items":""}}}', { status: 200 });
      return new Response('', { status: 200 }); } });
    const go = async (tnMs, d1Ms, d1Fail, extra) => { const c = load(extra), t0 = Date.now(), r = await post(c.H, { BUSAPI: mk(tnMs, d1Ms, d1Fail) }, { cap: 23, f: { part: 'b', mode: 'bus', th: 'dark', bus: { lat: ME[0], lng: ME[1], res: {}, sv: 1, svb: 300 } } }); return { names: r.j.body.filter(n => n.t === 'bcard').map(n => n.nm), ms: Date.now() - t0, bres: r.j.info.bres || {}, nc: r.j.info.bus && r.j.info.bus.nc, need: (r.j.info.bus && r.j.info.bus.need || []).map(n => n.k) }; };
    const EX7 = ['아라역1번출구', '아라역3번출구', '아라역4번출구', '아라역5번출구', '아라역6번출구', '아라역8번출구', '아라역7번출구'];
    let a = await go(50, 300);
    ok(JSON.stringify(a.names.slice(0, 7)) === JSON.stringify(EX7) && a.names.length === 8 && !/출구/.test(a.names[7]), 's458: TAGO 가 먼저 와도 D1 을 기다려 출구 7곳이 모두 맨 앞(가까운 순) · 그 뒤에 다른 정류장 — ' + a.names.join(' / '));
    ok(a.ms < 1200 && a.bres.d1 && a.bres.d1.length > 100 && a.bres.tn.length > 100 && a.nc === undefined, 's458: D1 0.3초만 더 기다린다(' + a.ms + 'ms) · 기기에 두 출처를 모두 돌려준다');
    a = await go(300, 50);
    ok(JSON.stringify(a.names.slice(0, 7)) === JSON.stringify(EX7), 's458: D1 이 먼저 오면 예전 그대로 바로(TAGO 를 기다리지 않는다) — 출구 7곳 ' + a.ms + 'ms');
    a = await go(50, 4000);
    ok(a.ms < 2600 && a.names.length === 6 && a.names.indexOf('아라역5번출구') < 0 && a.bres.d1 === undefined && a.nc === 1, 's458: D1 이 1.5초 넘게 안 오면 더 기다리지 않고 TAGO 만으로 그린다(' + a.ms + 'ms · ' + a.names.length + '곳) — 기기는 이 목록을 보관하지 않는다 · s459: D1 은 빈 값으로 굳히지 않고 서버가 도착정보 바퀴에서 되묻는다');
    a = await go(50, 100, true);
    ok(a.names.length === 6 && a.ms < 1200 && a.nc === 1, 's458: D1 이 실패해도 멈추지 않는다 ' + a.ms + 'ms · 보관하지 말라고(nc) 알린다');
    const old = load(); old.mapBusWantD1 = () => false;      // 예전 동작(기다리지 않음) 재현 — 화면과 같은 6곳이 나오는지 확인
    const r0 = await post(old.H, { BUSAPI: mk(50, 300) }, { cap: 23, f: { part: 'b', mode: 'bus', th: 'dark', bus: { lat: ME[0], lng: ME[1], res: {}, sv: 1, svb: 300 } } }), n0 = r0.j.body.filter(n => n.t === 'bcard').map(n => n.nm);
    ok(JSON.stringify(n0) === JSON.stringify(['아라역1번출구', '아라역3번출구', '아라역6번출구', '아라역7번출구', '아라동행정복지센터', '아라동행정복지센터']), 's458: (재현) 기다리지 않으면 YJ 화면 그대로 — 출구 4곳 + 아라동행정복지센터 2곳: ' + n0.join(' / '));
  }
  // ⑩ s462 (YJ: "카카오는 바로 뜨는데 우리는 바로 안 뜨는 게 너무 많다 — 적어도 3초 안에 다 나오게"): 경유노선 캐시 · 새 앱(svo)의 덤 안 기다림 · 같은 요청 안 두 번째 바퀴 · 응답 뒤 받기 이어 가기
  {
    const D1 = JSON.stringify({ ok: true, count: 2, stops: [{ node_id: 'BSB1', node_nm: '시청역', city_code: '21', lat: 35.1796, lng: 129.0757 }, { node_id: 'BSB2', node_nm: '부산시청', city_code: '21', lat: 35.1798, lng: 129.0758 }] });
    const AR = JSON.stringify({ response: { body: { items: { item: [{ routeno: '8', arrtime: 240, arrprevstationcnt: 3, routeid: 'R1' }] } } } });
    const EMPTY = '{"response":{"header":{"resultCode":"00"},"body":{"items":"","numOfRows":10,"pageNo":1,"totalCount":0}}}';
    const TH = JSON.stringify({ response: { body: { items: { item: [{ routeno: '8', routeid: 'R1', routetp: '일반버스' }, { routeno: '9', routeid: 'R2', routetp: '일반버스' }] } } } });
    const CR = JSON.stringify({ response: { body: { items: { item: [{ nodeid: 'BSB1X', nodenm: '시청역', gpslati: 35.1796, gpslong: 129.0757, citycode: 21, nodeno: '1' }] } } } });
    const mkB = (log, o) => { o = o || {}; return { fetch: async (req) => { const u = new URL(req.url), inner = u.searchParams.get('url') || (u.pathname + u.search); log.push(inner);
      if (/getCrdntPrxmtSttnList/.test(inner) && /numOfRows=50/.test(inner)) return new Response('', { status: 200 });
      if (/getCrdntPrxmtSttnList/.test(inner)) { await new Promise(r => setTimeout(r, o.crMs || 0)); return new Response(CR, { status: 200 }); }
      if (/bus-stops/.test(inner)) return new Response(D1, { status: 200 });
      if (/getSttnAcctoArvlPrearngeInfoList/.test(inner)) { await new Promise(r => setTimeout(r, o.arrMs || 0)); return new Response(o.emptyB1 && /nodeId=BSB1&/.test(inner) ? EMPTY : AR, { status: 200 }); }
      if (/getSttnThrghRouteList/.test(inner)) { await new Promise(r => setTimeout(r, o.thruMs || 0)); return new Response(o.thruEmpty ? '{"response":{"body":{"items":""}}}' : TH, { status: 200 }); }
      return new Response('', { status: 200 }); } }; };
    const body = (extra, res) => ({ cap: 29, f: { part: 'b', mode: 'bus', th: 'dark', bus: Object.assign({ lat: 35.1796, lng: 129.0756, res: res || {}, sv: 1, svb: 2000 }, extra || {}) } });
    const mkCaches = () => { const store = new Map(); return { store, default: { match: async (rq) => store.has(rq.url) ? new Response(store.get(rq.url)) : undefined, put: async (rq, rs) => { store.set(rq.url, await rs.text()); } } }; };
    const thruN = log => log.filter(u => /getSttnThrghRouteList/.test(u)).length;
    // 10-a 경유노선은 한 번 받으면 데이터센터 캐시에 — 다른 isolate(기억 없음)에서도 두 번째는 공공 API 를 부르지 않는다
    {
      const cs = mkCaches(), l1 = [], l2 = [];
      let c = load({ caches: cs }); const r1 = await post(c.H, { BUSAPI: mkB(l1) }, body());
      ok(thruN(l1) === 2 && r1.j.info.bres.t0 && r1.j.info.bres.t1, '10-a: 처음에는 경유노선 2곳을 받는다');
      ok([...cs.store.keys()].some(k => /k=tl&/.test(k)) && ![...cs.store.keys()].some(k => /k=t0&/.test(k)), '10-a: 캐시 종류는 열쇠 번호가 아니라 조회 종류(tl)로 — 열쇠 번호가 바뀌어도 맞는다');
      c = load({ caches: cs }); const r2 = await post(c.H, { BUSAPI: mkB(l2) }, body());
      ok(thruN(l2) === 0 && r2.j.info.bres.t0 === r1.j.info.bres.t0 && r2.j.info.bres.t1 === r1.j.info.bres.t1, '10-a: 두 번째(다른 isolate)는 경유노선 공공 호출 0번 · 같은 본문 ' + thruN(l2));
      ok(l2.filter(u => /getSttnAcctoArvlPrearngeInfoList/.test(u)).length === 2, '10-a: 도착정보(실시간)는 캐시하지 않고 새로 받는다');
      // 빈 목록은 12시간 굳히지 않는다
      const cs2 = mkCaches(), l3 = [], l4 = [];
      c = load({ caches: cs2 }); await post(c.H, { BUSAPI: mkB(l3, { thruEmpty: true }) }, body());
      c = load({ caches: cs2 }); await post(c.H, { BUSAPI: mkB(l4, { thruEmpty: true }) }, body());
      ok(thruN(l3) === 2 && thruN(l4) === 2 && ![...cs2.store.keys()].some(k => /k=tl&/.test(k)), '10-a: 빈 경유노선 응답은 캐시하지 않는다(다시 받는다)');
    }
    // 10-b 새 앱(svo): 도착정보가 다 오면 느린 경유노선(덤)은 0.25초만 더 기다리고 돌려준다 · 예전 앱은 예전 그대로(예산 끝까지)
    {
      const pend = [], ctxw = { waitUntil: (p) => pend.push(p) };
      const run = async (svo) => { const l = []; const c = load(); c.MAPSV_CTX = ctxw; const t0 = Date.now(); const r = await post(c.H, { BUSAPI: mkB(l, { thruMs: 3000, arrMs: 40 }) }, body(svo ? { svo: 1 } : {})); return { r, dt: Date.now() - t0, l }; };
      const o = await run(true), n = await run(false);
      const cards = o.r.j.body.filter(x => x.t === 'bcard');
      ok(o.dt < 1300 && cards.length === 2 && cards.every(x => x.rows && x.rows.length === 1), '10-b: svo — 도착정보가 오면 바로(경유노선 3초를 기다리지 않는다) ' + o.dt + 'ms');
      ok(o.r.j.info.bres.a0 && o.r.j.info.bres.a1 && !o.r.j.info.bres.t0 && o.r.j.info.bus.st === 'need' && o.r.j.info.bus.need.every(x => /^[tu][0-9]{1,2}$/.test(x.k) || /^r/.test(x.k)), '10-b: 못 받은 덤(경유노선)은 need 로 남는다 · 도착정보 정류장은 모두 채워졌다 ' + JSON.stringify((o.r.j.info.bus.need || []).map(x => x.k)));
      ok(n.dt >= 1800 && n.r.j.info.bus.st === 'need', '10-b: svo 가 없는 예전 앱은 예전처럼 예산(2초)까지 기다린다 ' + n.dt + 'ms');
      ok(pend.length >= 1, '10-b: 응답 뒤에도 못 끝낸 받기는 waitUntil 로 이어 간다(' + pend.length + ')');
      const tw = Date.now(); await Promise.all(pend); // 이어 받은 경유노선이 끝나면 5초 기억 · 캐시에 남는다
    }
    // 10-c 응답 뒤에 이어 받은 경유노선은 데이터센터 캐시에 채워진다 → 기기의 다음 요청은 즉시
    {
      const cs = mkCaches(), pend = [], ctxw = { waitUntil: (p) => pend.push(p) }, l1 = [], l2 = [];
      let c = load({ caches: cs }); c.MAPSV_CTX = ctxw;
      const t0 = Date.now(); await post(c.H, { BUSAPI: mkB(l1, { thruMs: 1500, arrMs: 30 }) }, body({ svo: 1 }));
      const dt1 = Date.now() - t0;
      await Promise.all(pend);
      ok(dt1 < 1200 && [...cs.store.keys()].some(k => /k=tl&/.test(k)), '10-c: 응답은 빨리(' + dt1 + 'ms) · 그 뒤 이어 받은 경유노선은 캐시에 채워졌다');
      c = load({ caches: cs }); const t1 = Date.now(); const r2 = await post(c.H, { BUSAPI: mkB(l2, { thruMs: 1500, arrMs: 30 }) }, body({ svo: 1 }));
      ok(thruN(l2) === 0 && r2.j.info.bres.t0 && Date.now() - t1 < 1000, '10-c: 다음 요청은 경유노선을 기다리지 않고 캐시에서 ' + (Date.now() - t1) + 'ms');
    }
    // 10-d 같은 요청 안 두 번째 바퀴: 좌표로 다시 찾은 정류장(t100+) → 바꾼 ID 도착정보(g)까지 서버가 한 번에. 예전 앱은 기기가 바퀴를 더 돈다
    {
      const flow = async (svo) => { const log = [], c = load(); let res = {}, rounds = 0, last = null;
        for (; rounds < 8; rounds++) {
          const r = await post(c.H, { BUSAPI: mkB(log, { emptyB1: true }) }, body({ svb: svo ? 2200 : 300, svo: svo ? 1 : 0 }, res)); last = r.j;       // s464: svb 300 + svo 는 '정류장만 먼저' 요청(도착정보를 받지 않는다) — 전체 요청은 svb 2200
          const need = r.j.info.bus.need || [];
          for (const k in (r.j.info.bres || {})) res[k] = r.j.info.bres[k];
          if (!need.length) break;
          const left = need.filter(x => res[x.k] === undefined);
          if (!left.length) break;
          for (const x of left) { const rr = await mkB(log, { emptyB1: true }).fetch(new Request('https://busapi.internal/tago?url=' + encodeURIComponent(x.url))); res[x.k] = await rr.text(); }
        }
        return { rounds, last, keys: Object.keys(res) };
      };
      const a = await flow(false), b = await flow(true);
      ok(b.last.info.bus.st === 'ok' && a.last.info.bus.st === 'ok' && b.keys.includes('t100') && b.keys.includes('g500'), '10-d: 두 방식 모두 끝에는 완성된 화면(좌표 정류장 · 바꾼 ID 도착정보 포함) ' + a.keys.join() + ' | ' + b.keys.join());
      ok(b.rounds < a.rounds, '10-d: 새 앱(svo)은 서버가 같은 요청 안에서 바퀴를 더 돌아 요청 횟수가 줄어든다(예전 ' + (a.rounds + 1) + '번 → ' + (b.rounds + 1) + '번)');
    }
    // 10-e /bus-tago — 경유노선 · 노선 정류장 목록은 캐시 · 도착정보는 캐시 안 함 · 빈 본문은 캐시 안 함
    {
      const cs = mkCaches(); let nf = 0, empty = false;
      const fx = async (u) => { nf++; return new Response(/getSttnAcctoArvlPrearngeInfoList/.test(u) ? AR : empty ? '{"response":{"body":{"items":""}}}' : TH, { status: 200 }); };
      const call = (c, url) => c.T(new Request('https://x/bus-tago?url=' + encodeURIComponent(url)), { TAGO_KEY: 'K1' });
      const THU = 'https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnThrghRouteList?serviceKey=&cityCode=21&nodeid=BSB1&numOfRows=100&pageNo=1&_type=json';
      const ARU = 'https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList?serviceKey=&cityCode=21&nodeId=BSB1&_type=json';
      let c = load({ fetch: fx, caches: cs });
      const a1 = await call(c, THU), a2 = await call(c, THU);
      ok(a1.status === 200 && a2.status === 200 && nf === 1 && (await a2.text()) === TH, '10-e: 경유노선은 두 번째부터 공공 API 를 부르지 않는다 ' + nf);
      await call(c, ARU); await call(c, ARU);
      ok(nf === 3, '10-e: 도착정보는 매번 받는다 ' + nf);
      nf = 0; empty = true; const cs2 = mkCaches(); c = load({ fetch: fx, caches: cs2 });
      await call(c, THU); await call(c, THU);
      ok(nf === 2 && cs2.store.size === 0, '10-e: 빈 목록은 캐시하지 않는다');
      nf = 0; empty = false; c = load({ fetch: fx, caches: mkCaches() });
      await call(c, THU.replace('serviceKey=&', 'serviceKey=REALKEY&')); await call(c, THU.replace('serviceKey=&', 'serviceKey=REALKEY&'));
      ok(nf === 2, '10-e: 키가 박힌 주소는 캐시 열쇠에 키가 섞이지 않게 캐시하지 않는다');
      ok(c.mapSvStaticCls(THU) === 'tl' && c.mapSvStaticCls(THU.replace('getSttnThrghRouteList', 'getRouteAcctoThrghSttnList')) === 'rl' && c.mapSvStaticCls(ARU) === '' && c.mapSvStaticCls('https://evil.example/getSttnThrghRouteList?serviceKey=&a=1') === '', '10-e: 캐시 종류 판별(경유노선 tl · 노선 정류장 rl · 도착정보/남의 호스트는 안 함)');
    }
  }
  // ⑪ s463 (YJ: "API 호출량 조절 · 카카오처럼 — 클라우드플레어만으로"): 호출 세기 · 하루 예산 조절기 · 데이터센터 도착정보 공유 캐시 · /bus-budget
  {
    const AR = JSON.stringify({ response: { body: { items: { item: [{ routeno: '8', arrtime: 240, arrprevstationcnt: 3, routeid: 'R1' }] } } } });
    const EMPTY = '{"response":{"header":{"resultCode":"00"},"body":{"items":"","numOfRows":10,"pageNo":1,"totalCount":0}}}';
    const ERRB = '{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"errMsg":"HTTP_ERROR","returnReasonCode":"04"}}}';
    const ARU = 'https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList?serviceKey=&cityCode=21&nodeId=BSB1&_type=json';
    const SEU = 'http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid?arsId=11111';
    // 받은 시각(x-at)을 담는 모의 데이터센터 캐시(머리글까지 보관) + 시계를 옮길 수 있는 Date
    const mkCs = () => { const store = new Map(), calls = { match: 0, put: 0 };
      return { store, calls, default: { match: async (rq) => { calls.match++; const e = store.get(rq.url); return e ? new Response(e.t, { headers: e.h }) : undefined; }, put: async (rq, rs) => { calls.put++; const h = {}; rs.headers.forEach((v, k) => { h[k] = v; }); store.set(rq.url, { t: await rs.text(), h }); } } }; };
    const tick = () => new Promise(r => setTimeout(r, 15));                                  // 공유 캐시 쓰기는 응답 뒤에(waitUntil) 끝난다 — 시험은 잠깐 기다린다
    const clock = () => { const T = { off: 0 }; class MD extends Date { static now() { return Date.now.call(Date) + T.off; } } return { T, MD }; };
    const usageOf = () => { const n = {}; return { n, usageAdd: (k) => { n[k] = (n[k] || 0) + 1; } }; };
    const dbOf = (rows, o) => { o = o || {}; const st = { q: 0 }; return { st, DB: { prepare: (sql) => ({ bind: (day) => ({ all: async () => { st.q++; st.sql = sql; st.day = day; if (o.err) throw new Error(o.err); if (o.slow) await new Promise(r => setTimeout(r, o.slow)); return { results: rows }; } }) }) } }; };
    const tagoK = (log, ms, bad) => (env) => ['k1', 'k2'].map((n, i) => ({ via: i ? 'env-key2' : 'env-key', run: (inner) => { log.push(n + ':' + inner); return new Promise(r => setTimeout(() => r(new Response(bad ? ERRB : AR, { status: 200 })), ms || 0)); } }));

    // 11-a 순수 계산: 종류별 사용량 → 모드(70% saver · 90% critical) · 이 isolate 의 아직 못 올린 세기도 더한다 · 환경값으로 한도를 바꾼다
    {
      const c = load();
      const ev = (rows, pend, lim) => c.mapSvBudEval(rows, pend, lim);
      let e = ev([{ k: 'bus.tago.arr', n: 100000 }]);
      ok(e.modes.tago === 'normal' && e.modes.seoul === 'normal' && e.used.tago === 100000, '11-a: 10만 건(20%)은 normal');
      e = ev([{ k: 'bus.tago.arr', n: 200000 }, { k: 'map.arr.tago', n: 150000 }]);
      ok(e.modes.tago === 'saver' && e.used.tago === 350000, '11-a: 버스 서버 + 지도 서버 호출을 합쳐 70% → saver');
      e = ev([{ k: 'tago.env-key', n: 440000 }, { k: 'tago.env-key2', n: 10000 }]);
      ok(e.modes.tago === 'critical', '11-a: 90% → critical (route-v2 의 tago.env-key · env-key2 도 센다)');
      e = ev([{ k: 'bus.seoul.arr', n: 7000 }, { k: 'bus.tago.arr', n: 10 }]);
      ok(e.modes.seoul === 'saver' && e.modes.tago === 'normal', '11-a: 서울(1만/일)은 따로 — 7천 건 → seoul 만 saver');
      e = ev([{ k: 'bus.seoul.arr', n: 8500 }], { 'map.arr.seoul': 500 });
      ok(e.modes.seoul === 'critical', '11-a: 아직 올리지 못한 이 isolate 의 세기(pending)도 더한다');
      e = ev([{ k: 'bus.tago.arr', n: 60000 }], null, { tago: 80000 });
      ok(e.modes.tago === 'saver' && e.limit.tago === 80000, '11-a: 한도를 환경값(TAGO_ARR_LIMIT)으로 바꿀 수 있다');
      e = ev([{ k: 'bus.gbis', n: 9e9 }, { k: 'x', n: 9e9 }, null, { k: 'bus.tago.arr', n: 'zz' }]);
      ok(e.modes.tago === 'normal' && e.modes.seoul === 'normal', '11-a: 다른 종류의 세기 · 깨진 행은 무시');
    }
    // 11-b 조절기 갱신: D1 에서 오늘 행을 읽어 모드 반영 · 1분에 한 번 · 못 읽으면 지난 모드 · DB 없으면 normal
    {
      const { T, MD } = clock(), u = usageOf();
      const c = load({ Date: MD, USAGE: { n: {}, last: 0, ready: true } });
      const d = dbOf([{ k: 'bus.tago.arr', n: 360000 }]);
      ok(c.mapSvBudRefresh({}) === null && c.mapSvBudMode('tago') === 'normal', '11-b: DB 가 없으면 읽지 않고 normal');
      const p = c.mapSvBudRefresh({ DB: d.DB }); ok(p && typeof p.then === 'function', '11-b: 뒤에서 읽는다(약속을 돌려준다)');
      ok(c.mapSvBudMode('tago') === 'normal', '11-b: 읽는 동안 이 요청은 막히지 않는다(아직 normal)');
      await p;
      ok(c.mapSvBudMode('tago') === 'saver' && c.mapSvBudMode('seoul') === 'normal' && d.st.q === 1 && /live_usage/.test(d.st.sql) && /^\d{4}-\d\d-\d\d$/.test(d.st.day), '11-b: 읽은 뒤 saver · 한국 날짜 키로 live_usage 조회 1번');
      ok(c.mapSvBudRefresh({ DB: d.DB }) === null && d.st.q === 1, '11-b: 1분 안에는 다시 읽지 않는다(D1 읽기 보호)');
      T.off = 61000; const d2 = dbOf([{ k: 'bus.tago.arr', n: 470000 }]);
      await c.mapSvBudRefresh({ DB: d2.DB });
      ok(c.mapSvBudMode('tago') === 'critical', '11-b: 1분 뒤에는 다시 읽어 critical 로');
      T.off = 130000; const d3 = dbOf([], { err: 'D1 down' });
      await c.mapSvBudRefresh({ DB: d3.DB });
      ok(c.mapSvBudMode('tago') === 'critical' && /D1 down/.test(c.MAPSV_BUD.err) && c.MAPSV_BUD.busy === false, '11-b: 못 읽으면 지난 모드를 그대로(갑자기 풀리지 않는다) · 다음에 다시');
      T.off = 200000; const d4 = dbOf([], { slow: 2500 }); const t0 = Date.now();
      await c.mapSvBudRefresh({ DB: d4.DB });
      ok(Date.now() - t0 < 2200 && /timeout/.test(c.MAPSV_BUD.err), '11-b: D1 이 느려도 1.5초에서 포기 ' + (Date.now() - t0) + 'ms');
      T.off = 300000; const d5 = dbOf([{ k: 'bus.tago.arr', n: 1 }]);
      await c.mapSvBudRefresh({ DB: d5.DB });
      ok(c.mapSvBudMode('tago') === 'normal', '11-b: 사용량이 줄면(다음 날) normal 로 돌아온다');
    }
    // 11-c 도착정보 공유 캐시: 같은 데이터센터의 다른 isolate 는 TTL 안이면 공공 API 를 부르지 않는다 · TTL 은 모드에 따라 5/9/15초
    {
      const cs = mkCs(), { T, MD } = clock(), l1 = [], l2 = [], u = usageOf();
      const env = { TAGO_KEY: 'k1', TAGO_KEY2: 'k2' };
      let c = load({ caches: cs, Date: MD, tagoAttempts: tagoK(l1, 0), usageAdd: u.usageAdd }); const b1 = await c.mapSvOne(env, 'a0', ARU);
      await tick(); ok(b1 === AR && l1.length === 1 && cs.calls.put === 1, '11-c: 처음엔 공공 API 1번 · 공유 캐시에 둔다');
      c = load({ caches: cs, Date: MD, tagoAttempts: tagoK(l2, 0), usageAdd: u.usageAdd }); // 다른 isolate(기억 없음)
      T.off = 4000; const b2 = await c.mapSvOne(env, 'a0', ARU);
      ok(b2 === AR && l2.length === 0 && u.n['map.arr.saved'] === 1, '11-c: 4초 뒤 다른 isolate — 공공 호출 0번(map.arr.saved 1)');
      c = load({ caches: cs, Date: MD, tagoAttempts: tagoK(l2, 0), usageAdd: u.usageAdd }); T.off = 6000; await c.mapSvOne(env, 'a0', ARU); await tick();
      ok(l2.length === 1, '11-c: 6초 뒤에는 새로 받는다(normal TTL 5초 — 오래된 도착정보를 내지 않는다)');
      // saver: 9초 · critical: 15초(그 이상은 절대 안 쓴다)
      for (const [mode, hit, miss] of [['saver', 8000, 10000], ['critical', 14000, 16000]]) {
        const cs2 = mkCs(), ck = clock(), la = [];
        const rows = [{ k: 'bus.tago.arr', n: mode === 'saver' ? 400000 : 480000 }];
        const mk = () => { const cc = load({ caches: cs2, Date: ck.MD, tagoAttempts: tagoK(la, 0), usageAdd: usageOf().usageAdd }); return cc; };
        let cc = mk(); await cc.mapSvBudRefresh({ DB: dbOf(rows).DB }); await new Promise(r => setTimeout(r, 5));
        ok(cc.mapSvBudMode('tago') === mode, '11-c: ' + mode + ' 모드');
        await cc.mapSvOne(env, 'a0', ARU); await tick(); const n0 = la.length;
        cc = mk(); await cc.mapSvBudRefresh({ DB: dbOf(rows).DB }); ck.T.off = hit; await cc.mapSvOne(env, 'a0', ARU);
        ok(la.length === n0, '11-c: ' + mode + ' — ' + hit / 1000 + '초 뒤에도 공유본을 쓴다');
        cc = mk(); await cc.mapSvBudRefresh({ DB: dbOf(rows).DB }); ck.T.off = miss; await cc.mapSvOne(env, 'a0', ARU);
        ok(la.length === n0 + 1, '11-c: ' + mode + ' — ' + miss / 1000 + '초 뒤에는 새로 받는다');
      }
    }
    // 11-d 공유 캐시에 두지 않는 것: 빈 목록 · 오류 봉투 · 열쇠가 박힌 주소 · 도착정보가 아닌 주소 · 머리글(x-at)이 없거나 미래인 것
    {
      const { T, MD } = clock(), env = { TAGO_KEY: 'k1', TAGO_KEY2: 'k2' };
      const run = async (body, url) => { const cs = mkCs(), l = []; const c = load({ caches: cs, Date: MD, tagoAttempts: (e) => [{ via: 'env-key', run: (inner) => { l.push(inner); return Promise.resolve(new Response(body, { status: 200 })); } }, { via: 'env-key2', run: (inner) => { l.push(inner); return Promise.resolve(new Response(body, { status: 200 })); } }] });
        await c.mapSvOne(env, 'a0', url || ARU); await tick(); const ent = [...cs.store.keys()].filter(k => /map-sv-cache\.internal\/a\?/.test(k)).length; return { cs, c, ent }; };
      ok((await run(EMPTY)).ent === 0, '11-d: 빈 도착정보 응답은 공유하지 않는다(잠깐의 빈 응답이 모두에게 퍼지지 않게)');
      ok((await run(ERRB)).ent === 0, '11-d: 오류 봉투는 공유하지 않는다');
      ok((await run(AR, ARU.replace('serviceKey=&', 'serviceKey=REAL&'))).ent === 0, '11-d: 열쇠가 박힌 주소는 공유하지 않는다');
      const r0 = await run(AR); ok(r0.ent === 1 && [...r0.cs.store.entries()].every(([k, v]) => !/k1|k2|REAL/.test(k) && /^\d+$/.test(v.h['x-at'] || '') && /max-age=30/.test(v.h['cache-control'] || '')), '11-d: 정상 도착정보는 열쇠 없는 주소로 · 받은 시각 · max-age 30초와 함께');
      const c = r0.c; const url = ARU;
      const key = [...r0.cs.store.keys()][0];
      const get = async (h) => { r0.cs.store.set(key, { t: AR, h }); return c.mapSvArrGet(url, null); };
      ok((await get({})) === '' && (await get({ 'x-at': String(Date.now() + 60000) })) === '' && (await get({ 'x-at': String(Date.now()) })) === AR, '11-d: 받은 시각이 없거나 미래(시계 이상)인 것은 쓰지 않는다');
      ok((await c.mapSvArrGet(url, { n: 40 })) === '' && (await c.mapSvArrGet(url, { n: 3 })) === AR, '11-d: 한 요청이 하위 요청을 이미 많이 썼으면(무료 50개 한도 보호) 공유 캐시는 건너뛴다');
      ok(c.mapSvArrFam(ARU) === 'tago' && c.mapSvArrFam(SEU) === 'seoul' && c.mapSvArrFam('https://apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2?stationId=1&format=json') === 'gbis' && c.mapSvArrFam('https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getSttnThrghRouteList?serviceKey=&cityCode=21') === '' && c.mapSvArrFam(ARU.replace('serviceKey=&', 'serviceKey=X&')) === '', '11-d: 도착정보 종류 판별(tago · seoul · gbis · 그 밖은 아님)');
    }
    // 11-e 호출 세기: 실제로 나간 호출만 map.arr.<종류> · 동시에 띄운 호출은 map.hedge · 아낀 호출은 map.arr.saved
    {
      const u = usageOf(), l = [], env = { TAGO_KEY: 'k1', TAGO_KEY2: 'k2' }, { MD } = clock();
      const c = load({ caches: mkCs(), Date: MD, tagoAttempts: tagoK(l, 900), usageAdd: u.usageAdd });
      await c.mapSvOne(env, 'a0', ARU); await c.mapSvOne(env, 'a0', ARU);       // 두 번째는 5초 기억
      ok(u.n['map.arr.tago'] === 2 && u.n['map.hedge'] === 1 && u.n['map.arr.saved'] === 1 && l.length === 2, '11-e: 느린 첫 호출(0.9초) → 0.7초에 한 번 더(hedge) = 나간 호출 2 · 아낀 호출 1 ' + JSON.stringify(u.n));
      const u2 = usageOf(); const c2 = load({ caches: mkCs(), Date: MD, tagoAttempts: tagoK([], 0), usageAdd: u2.usageAdd });
      await c2.mapSvOne(env, 'a0', ARU);
      ok(u2.n['map.arr.tago'] === 1 && !u2.n['map.hedge'], '11-e: 빨리 오면 호출 1 · hedge 0');
      const u3 = usageOf(), c3 = load({ caches: mkCs(), usageAdd: u3.usageAdd, tagoAttempts: tagoK([], 0) });
      await c3.mapSvOne(env, 'tp', 'https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList?serviceKey=&gpsLati=37.5&gpsLong=127&numOfRows=10&_type=json');
      ok(u3.n['map.st'] >= 1 && !u3.n['map.arr.tago'], '11-e: 정류장 · 노선 목록 호출은 map.st 로 따로');
      // usageAdd 가 없는 환경(시험 · 예전 번들)에서도 그대로 동작
      const c4 = load({ caches: mkCs(), tagoAttempts: tagoK([], 0) }); ok((await c4.mapSvOne(env, 'a0', ARU)) === AR, '11-e: 세기 함수가 없어도 동작');
    }
    // 11-f 헤지(느린 호출에 동시에 한 번 더): normal 0.7초 · 3번까지 / saver 1.2초 · 2번까지 / critical 1.8초 · 2번까지
    {
      const env = { TAGO_KEY: 'k1', TAGO_KEY2: 'k2', BUSAPI: { fetch: async () => { calls.push('b'); await new Promise(r => setTimeout(r, 1500)); return new Response(AR, { status: 200 }); } } };
      let calls = [];
      const trial = async (rows) => { calls = []; const c = load({ caches: mkCs(), tagoAttempts: (e) => [{ via: 'env-key', run: () => { calls.push('1'); return new Promise(r => setTimeout(() => r(new Response(AR, { status: 200 })), 1500)); } }, { via: 'env-key2', run: () => { calls.push('2'); return new Promise(r => setTimeout(() => r(new Response(AR, { status: 200 })), 1500)); } }, { via: 'binding', run: () => { calls.push('b'); return new Promise(r => setTimeout(() => r(new Response(AR, { status: 200 })), 1500)); } }], usageAdd: usageOf().usageAdd });
        if (rows) { await c.mapSvBudRefresh({ DB: dbOf(rows).DB }); await new Promise(r => setTimeout(r, 5)); }
        const t0 = Date.now(); await c.mapSvOne(env, 'a0', ARU); return { n: calls.length, dt: Date.now() - t0, mode: c.mapSvBudMode('tago') }; };
      const a = await trial(null), b = await trial([{ k: 'bus.tago.arr', n: 400000 }]), d = await trial([{ k: 'bus.tago.arr', n: 480000 }]);
      ok(a.mode === 'normal' && a.n === 3, '11-f: normal — 1.5초 걸리는 호출에 0.7초 · 1.4초에 동시 호출이 늘어 3번 ' + a.n);
      ok(b.mode === 'saver' && b.n === 2, '11-f: saver — 1.2초에 한 번만 더 = 2번 ' + b.n);
      ok(d.mode === 'critical' && d.n === 1, '11-f: critical — 1.8초까지 기다리므로 1.5초에 온 첫 호출로 끝 = 1번 ' + d.n);
      ok(a.dt < 1800 && b.dt < 1800 && d.dt < 1800, '11-f: 어느 모드든 결과는 첫 호출이 오는 즉시(약 1.5초) ' + [a.dt, b.dt, d.dt].join());
    }
    // 11-g /screen/map: 센 호출을 올릴 수 있게 실행 맥락을 알리고 · 응답 머리에 모드 · 끝에 usageFlush
    {
      const u = usageOf(), flushed = []; const ctxw = { waitUntil: () => {} };
      const c = load({ _liveCtx: null, usageFlush: (e) => flushed.push(e), usageAdd: u.usageAdd });
      c.MAPSV_CTX = ctxw; const log = [];
      const env = { BUSAPI: binding(log), DB: dbOf([{ k: 'bus.seoul.arr', n: 9500 }]).DB };
      const rs = await c.H(new Request('https://x/screen/map', { method: 'POST', body: JSON.stringify(base(true)) }), env);
      ok(rs.status === 200 && /^normal\/normal$/.test(rs.headers.get('X-Bus-Mode') || ''), '11-g: 첫 요청은 읽는 중이라 normal/normal 머리 ' + rs.headers.get('X-Bus-Mode'));
      await new Promise(r => setTimeout(r, 20));
      const rs2 = await c.H(new Request('https://x/screen/map', { method: 'POST', body: JSON.stringify(base(true)) }), env);
      ok(/^normal\/critical$/.test(rs2.headers.get('X-Bus-Mode') || ''), '11-g: 읽은 뒤 요청은 서울 critical 반영 ' + rs2.headers.get('X-Bus-Mode'));
      ok(flushed.length >= 2 && c._liveCtx === ctxw, '11-g: 요청마다 usageFlush · 실행 맥락(_liveCtx)을 알려 센 호출이 D1 에 올라간다');
      ok(u.n['map.arr.seoul'] === 3 && u.n['map.arr.saved'] >= 3, '11-g: 서울 도착정보 3곳 = 나간 호출 3(바인딩 길도 이 서버가 낸 호출로 센다) · 둘째 요청은 5초 기억으로 아낌 ' + JSON.stringify(u.n));
    }
    // 11-h /bus-tago: 도착정보 공유 캐시(HIT-A) · 센다 · 오류/빈 목록 비공유
    {
      let nf = 0, body = AR; const cs = mkCs(), u = usageOf(), { T, MD } = clock();
      const fx = async () => { nf++; return new Response(body, { status: 200 }); };
      const call = (c, url) => c.T(new Request('https://x/bus-tago?url=' + encodeURIComponent(url)), { TAGO_KEY: 'K1' });
      let c = load({ fetch: fx, caches: cs, Date: MD, usageAdd: u.usageAdd });
      const r1 = await call(c, ARU); await tick(); const r2 = await call(c, ARU);
      ok(r1.status === 200 && r2.status === 200 && nf === 1 && r2.headers.get('X-Cache') === 'HIT-A' && (await r2.text()) === AR, '11-h: 두 번째는 공공 API 를 부르지 않고 공유본(HIT-A) ' + nf);
      ok(u.n['map.arr.tago'] === 1 && u.n['map.arr.saved'] === 1, '11-h: 센다 — 나간 호출 1 · 아낀 호출 1 ' + JSON.stringify(u.n));
      T.off = 6000; await call(c, ARU); await tick();
      ok(nf === 2, '11-h: 5초가 지나면 새로 받는다');
      body = EMPTY; const cs2 = mkCs(); c = load({ fetch: fx, caches: cs2, Date: MD }); nf = 0; await call(c, ARU); await tick(); await call(c, ARU); await tick();
      ok(nf === 2 && ![...cs2.store.keys()].some(k => /\/a\?/.test(k)), '11-h: 빈 도착정보는 공유하지 않는다');
      body = AR; nf = 0; c = load({ fetch: fx, caches: mkCs(), Date: MD }); await call(c, ARU.replace('serviceKey=&', 'serviceKey=REAL&')); await tick(); await call(c, ARU.replace('serviceKey=&', 'serviceKey=REAL&'));
      ok(nf === 2, '11-h: 열쇠가 박힌 주소는 공유하지 않는다');
    }
    // 11-i /bus-budget: 진단 JSON · ?refresh=1 바로 읽기 · ?probe=1 요금제(하위 요청 한도) 재 보기
    {
      const c = load({ caches: mkCs() }); c.MAPSV_CTX = { waitUntil: () => {} };
      const env = { DB: dbOf([{ k: 'bus.tago.arr', n: 450000 }, { k: 'bus.seoul.arr', n: 1000 }]).DB };
      const r = await c.B(new Request('https://x/bus-budget?refresh=1'), env), j = await r.json();
      ok(r.status === 200 && j.ok && j.modes.tago === 'critical' && j.modes.seoul === 'normal' && j.used.tago === 450000 && j.limit.tago === 500000 && j.ratio.tago === 0.9 && j.ttlMs.tago === 15000 && j.ttlMs.seoul === 5000 && j.hasDb && !j.err && j.ver === 'test', '11-i: /bus-budget?refresh=1 — 모드 · 사용량 · 한도 · 비율 · TTL ' + JSON.stringify(j).slice(0, 200));
      const free = { n: 0, default: { match: async () => { if (++free.n > 50) throw new Error('Too many subrequests'); return undefined; } } };
      const cf = load({ caches: free }), jf = await (await cf.B(new Request('https://x/bus-budget?probe=1'), {})).json();
      ok(jf.probe.cacheCallsOk === 50 && /free/.test(jf.probe.plan) && /Too many/.test(jf.probe.error), '11-i: 50번째에서 막히면 무료 요금제로 본다 ' + JSON.stringify(jf.probe));
      const paid = { default: { match: async () => undefined } }, cp = load({ caches: paid }), jp = await (await cp.B(new Request('https://x/bus-budget?probe=1'), {})).json();
      ok(jp.probe.cacheCallsOk === 60 && /paid/.test(jp.probe.plan), '11-i: 60번 모두 되면 유료로 본다');
      const jn = await (await load({}).B(new Request('https://x/bus-budget'), {})).json();
      ok(jn.ok && jn.modes.tago === 'normal' && jn.hasDb === false && jn.probe === undefined, '11-i: DB 가 없어도 동작(normal)');
    }
  }
  // ⑫ s464 (YJ: "순서대로 해줘" — 첫 도착정보를 3초 안에): 조기 반환 · '정류장만 먼저' 요청은 도착정보를 받지 않는다 · 가까운 정류장 도착정보는 두 길을 동시에 · 정류장 0건 재시도 · 엔진을 터뜨린 본문 하나만 빼고 다시 그리기
  {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const D1 = JSON.stringify({ ok: true, count: 2, stops: [{ node_id: 'BSB1', node_nm: '시청역', city_code: '21', lat: 35.1796, lng: 129.0757 }, { node_id: 'BSB2', node_nm: '부산시청', city_code: '21', lat: 35.1798, lng: 129.0758 }] });
    const D1E = '{"ok":true,"count":0,"stops":[]}';
    const AR = JSON.stringify({ response: { body: { items: { item: [{ routeno: '8', arrtime: 240, arrprevstationcnt: 3, routeid: 'R1' }] } } } });
    const mkB = (log, o) => { o = o || {}; return { fetch: async (req) => { const u = new URL(req.url), inner = u.searchParams.get('url') || (u.pathname + u.search); log.push(inner);
      if (/getCrdntPrxmtSttnList/.test(inner)) return new Response('', { status: 200 });
      if (/bus-stops/.test(inner)) { const n = log.filter(x => /bus-stops/.test(x)).length; return new Response(o.d1 ? o.d1(n) : D1, { status: 200 }); }
      if (/getSttnAcctoArvlPrearngeInfoList/.test(inner)) { const node = (inner.match(/nodeId=(\w+)/) || [])[1]; await sleep((o.arrMs && o.arrMs[node]) || 0); return new Response(AR, { status: 200 }); }
      return new Response('', { status: 200 }); } }; };
    const body = (extra, res) => ({ cap: 29, f: { part: 'b', mode: 'bus', th: 'dark', bus: Object.assign({ lat: 35.1796, lng: 129.0756, res: res || {}, sv: 1, svb: 2200, svo: 1 }, extra || {}) } });
    const arrN = log => log.filter(u => /getSttnAcctoArvlPrearngeInfoList/.test(u)).length;
    const mkU = () => { const n = {}; return { n, usageAdd: k => { n[k] = (n[k] || 0) + 1; } }; };
    // 12-a 조기 반환: 한 곳은 바로 오고 한 곳은 3초 걸린다 → 새 앱(svo)은 예산 끝(2.8초)까지 붙잡히지 않고 곧 돌려준다 · 못 받은 곳은 응답 뒤에서 계속 받는다 · 예전 앱은 예전 그대로
    {
      const l1 = [], pend = [], c = load(); c.MAPSV_CTX = { waitUntil: p => pend.push(p) };
      const t0 = Date.now(); const r = await post(c.H, { BUSAPI: mkB(l1, { arrMs: { BSB2: 3000 } }) }, body());
      const dt = Date.now() - t0, cards = r.j.body.filter(n => n.t === 'bcard');
      ok(dt < 1500 && cards.length === 2 && cards[0].rows && cards[0].rows.length === 1 && cards[1].ld && r.j.info.bus.st === 'need', '12-a: 첫 도착정보가 오면 곧 돌려준다(' + dt + 'ms) · 느린 정류장은 "불러오는 중"으로 남겨 기기가 이어 받는다');
      ok(r.j.info.bres && r.j.info.bres.a0 && !r.j.info.bres.a1 && r.j.info.svf === 1 && pend.length >= 1, '12-a: 받은 본문만 bres 에 · 못 받은 1곳은 svf · 응답 뒤 받기는 waitUntil 에 맡긴다(' + pend.length + ')');
      await Promise.all(pend);
      const l2 = [], c2 = load(); c2.MAPSV_CTX = { waitUntil: () => {} };
      const t1 = Date.now(); const r2 = await post(c2.H, { BUSAPI: mkB(l2, { arrMs: { BSB2: 3000 } }) }, body({ svo: 0, svb: 1200 }));
      const dt2 = Date.now() - t1;
      ok(dt2 >= 1100 && r2.j.body.filter(n => n.t === 'bcard')[1].ld, '12-a: 예전 앱(svo 없음)은 예전 그대로 예산 끝까지 기다린다(' + dt2 + 'ms)');
    }
    // 12-b 모두 빨리 오면 기다리지 않는다(조기 반환은 core 가 덜 왔을 때만) · 느리지 않은 요청은 완성 화면
    {
      const l1 = [], c = load(); c.MAPSV_CTX = { waitUntil: () => {} };
      const t0 = Date.now(); const r = await post(c.H, { BUSAPI: mkB(l1, { arrMs: { BSB1: 40, BSB2: 120 } }) }, body());
      const cards = r.j.body.filter(n => n.t === 'bcard');
      ok(Date.now() - t0 < 900 && cards.length === 2 && cards.every(x => x.rows && x.rows.length === 1) && !(r.j.info.bus.need || []).some(n => /^a/.test(n.k)) && r.j.info.svf === 0, '12-b: 모두 곧 오면 도착정보 전부 채운 화면 ' + (Date.now() - t0) + 'ms');
    }
    // 12-c '정류장만 먼저'(svb 300 + svo) 요청은 도착정보를 받지 않는다(전체 요청과 같은 곳을 두 번 부르지 않는다) · 정류장은 그대로 · need 로 남긴다
    {
      const l1 = [], c = load(), t0 = Date.now(); const r = await post(c.H, { BUSAPI: mkB(l1, { arrMs: { BSB1: 800, BSB2: 800 } }) }, body({ svb: 300 }));
      const cards = r.j.body.filter(n => n.t === 'bcard'), need = r.j.info.bus.need || [];
      ok(arrN(l1) === 0 && cards.length === 2 && cards.every(x => x.ld) && need.some(n => n.k === 'a0') && need.some(n => n.k === 'a1') && Date.now() - t0 < 700, '12-c: 정류장만 먼저 — 도착정보는 안 받고(공공 API ' + arrN(l1) + '번) need 로 남긴다 ' + (Date.now() - t0) + 'ms');
      const l2 = [], c2 = load(); await post(c2.H, { BUSAPI: mkB(l2) }, body({ svb: 300, svo: 0 }));
      ok(arrN(l2) === 2, '12-c: 예전 앱(svo 없음)의 svb 300 은 예전 그대로 도착정보를 짧게 기다려 받는다(' + arrN(l2) + ')');
      const l3 = [], c3 = load(); c3.MAPSV_CTX = { waitUntil: () => {} }; await post(c3.H, { BUSAPI: mkB(l3) }, body({ svb: 300 }, { d1: D1 }));
      ok(arrN(l3) === 2, '12-c: 정류장 본문을 이미 받은 뒤 바퀴(svb 300 + svo)는 예전 그대로 모자란 도착정보를 받는다(' + arrN(l3) + ')');
    }
    // 12-d 가장 가까운 정류장 셋(a0~a2)은 두 길을 동시에(normal 모드) · 넷째부터는 예전 간격(0.7초) · 아낌 모드는 예전 간격
    {
      const TN = JSON.stringify({ response: { body: { items: { item: [0, 1, 2, 3].map(i => ({ nodeid: 'ICB36800043' + i, nodenm: '정류장' + i, gpslati: 37.489 + i * 0.0003, gpslong: 126.724, citycode: '23', nodeno: '1' + i })) } } } });
      const AR2 = JSON.stringify({ response: { body: { items: { item: [{ routeno: '8', arrtime: 240, arrprevstationcnt: 3 }] } } } });
      const run = async (mode) => {
        const calls = [], tagoAttempts = () => ['k1', 'k2'].map((n, i) => ({ via: i ? 'env-key2' : 'env-key', run: (inner) => { calls.push([n, inner]); return sleep(120).then(() => new Response(/getCrdntPrxmtSttnList/.test(inner) ? TN : AR2, { status: 200 })); } }));
        const u = mkU(), c = load({ tagoAttempts, usageAdd: u.usageAdd }); c.MAPSV_CTX = { waitUntil: () => {} };
        if (mode) c.MAPSV_BUD.modes.tago = mode;
        await post(c.H, { TAGO_KEY: 'k1', TAGO_KEY2: 'k2' }, { cap: 29, f: { part: 'b', mode: 'bus', th: 'dark', bus: { lat: 37.489, lng: 126.724, res: {}, sv: 1, svb: 2200, svo: 1 } } });
        const per = {}; calls.filter(x => /getSttnAcctoArvlPrearngeInfoList/.test(x[1])).forEach(x => { const id = x[1].match(/nodeId=(\w+)/)[1]; (per[id] = per[id] || []).push(x[0]); });
        return { per, u };
      };
      const a = await run(null), ids = Object.keys(a.per).sort();
      ok(ids.length === 4 && ids.slice(0, 3).every(id => a.per[id].length === 2 && new Set(a.per[id]).size === 2) && a.per[ids[3]].length === 1, '12-d: 가까운 셋은 두 키를 동시에(각 2번 · 서로 다른 키) · 넷째는 1번 — ' + JSON.stringify(a.per));
      ok((a.u.n['map.hedge'] || 0) === 3, '12-d: 동시에 띄운 두 번째 호출 3개를 map.hedge 로 센다(' + (a.u.n['map.hedge'] || 0) + ')');
      const b = await run('saver');
      ok(Object.keys(b.per).every(id => b.per[id].length === 1), '12-d: 아낌(saver) 모드는 동시에 띄우지 않는다 — 빨리 오면 1번씩 ' + JSON.stringify(b.per));
    }
    // 12-e 정류장 0건: 서버 정류장 표(D1)가 잠깐 빈 값을 주면(청라) 캐시를 건너뛰고 한 번 더 · 진짜 비어 있으면 한 번만 더 · 고른 곳(pin)은 다시 안 받는다
    {
      const l1 = [], u = mkU(), c = load({ usageAdd: u.usageAdd }); c.MAPSV_CTX = { waitUntil: () => {} };
      const r = await post(c.H, { BUSAPI: mkB(l1, { d1: n => n === 1 ? D1E : D1 }) }, body());
      const cards = r.j.body.filter(n => n.t === 'bcard');
      ok(cards.length === 2 && l1.filter(x => /bus-stops/.test(x)).length === 2 && u.n['map.empty.retry'] === 1 && u.n['map.empty.fix'] === 1, '12-e: 첫 응답이 빈 값이어도 한 번 더 받아 정류장 ' + cards.length + '곳 · 정류장 조회 ' + l1.filter(x => /bus-stops/.test(x)).length + '번');
      const l2 = [], u2 = mkU(), c2 = load({ usageAdd: u2.usageAdd }); c2.MAPSV_CTX = { waitUntil: () => {} };
      const r2 = await post(c2.H, { BUSAPI: mkB(l2, { d1: () => D1E }) }, body());
      ok(r2.j.info.bus.st === 'empty' && l2.filter(x => /bus-stops/.test(x)).length === 2 && u2.n['map.empty.fix'] === undefined, '12-e: 진짜 비어 있으면 한 번만 더 받고 빈 화면 — 조회 ' + l2.filter(x => /bus-stops/.test(x)).length + '번');
      const l3 = [], c3 = load(); c3.MAPSV_CTX = { waitUntil: () => {} };
      const r3 = await post(c3.H, { BUSAPI: mkB(l3, { d1: () => D1E }) }, body({ pin: [35.1796, 129.0756] }));
      ok(r3.j.info.bus.st === 'empty' && l3.filter(x => /bus-stops/.test(x)).length === 1, '12-e: 지도에서 고른 곳(pin)의 빈 결과는 다시 받지 않는다(' + l3.filter(x => /bus-stops/.test(x)).length + '번)');
    }
    // 12-f 엔진을 터뜨린 받은 본문 하나만 빼고 다시 그린다(500 대신) · 원인은 /bus-budget lastErr 에 · 그래도 안 되면 500
    {
      const u = mkU(), c = load({ usageAdd: u.usageAdd }), real = c.mapScreen; c.MAPSV_CTX = { waitUntil: () => {} };
      c.mapScreen = function (cap, f, d) { const r = f && f.bus && f.bus.res; if (r && r.a1 === 'POISON') throw new Error('Cannot read properties of undefined (reading x)'); return real(cap, f, d); };
      const D1R = JSON.stringify({ ok: true, count: 2, stops: [{ node_id: 'BSB1', node_nm: '시청역', city_code: '21', lat: 35.1796, lng: 129.0757 }] });
      const r = await post(c.H, { BUSAPI: mkB([]) }, body({ sv: 0 }, { d1: D1R, a0: AR, a1: 'POISON', t0: '{}' }));
      ok(r.status === 200 && r.j.ok && r.j.body.some(n => n.t === 'bcard'), '12-f: 본문 하나(a1)가 엔진을 터뜨려도 500 이 아니라 그 본문만 빼고 다시 그린다(status ' + r.status + ')');
      ok(c.MAPSV_ERR && c.MAPSV_ERR.stage === 'salvage' && c.MAPSV_ERR.key === 'a1' && /Cannot read/.test(c.MAPSV_ERR.msg) && u.n['map.err.salvage'] === 1, '12-f: 범인(a1)과 오류를 lastErr 에 남기고 센다 ' + JSON.stringify(c.MAPSV_ERR));
      const jb = await (await c.B(new Request('https://x/bus-budget'), {})).json();
      ok(jb.lastErr && jb.lastErr.key === 'a1', '12-f: /bus-budget 으로 마지막 오류를 볼 수 있다');
      const c2 = load({ usageAdd: u.usageAdd }); c2.mapScreen = function () { throw new Error('always'); };
      const r2 = await post(c2.H, { BUSAPI: mkB([]) }, body({ sv: 0 }, { a0: AR }));
      ok(r2.status === 500 && /always/.test(r2.j.error) && c2.MAPSV_ERR.stage === '500', '12-f: 본문 탓이 아니면 예전처럼 500(원인 기록)');
    }
    // ⑬ s466 (YJ: "병목부분 찾고") — 쓸 만한 도착정보를 이미 받았으면 추가 바퀴(좌표로 다시 찾은 정류장 t100+ → 바꾼 ID 도착정보)는 짧게만 기다린다 · 진단(dbg=1)은 info.svt 에 단계별 시간
    {
      const sleep2 = ms => new Promise(r => setTimeout(r, ms));
      const D1 = JSON.stringify({ ok: true, count: 2, stops: [{ node_id: 'BSB1', node_nm: '시청역', city_code: '21', lat: 35.1796, lng: 129.0757 }, { node_id: 'BSB2', node_nm: '부산시청', city_code: '21', lat: 35.1798, lng: 129.0758 }] });
      const AR = JSON.stringify({ response: { body: { items: { item: [{ routeno: '8', arrtime: 240, arrprevstationcnt: 3, routeid: 'R1' }] } } } });
      const EMPTY = '{"response":{"header":{"resultCode":"00"},"body":{"items":"","numOfRows":10,"pageNo":1,"totalCount":0}}}';
      const CR = JSON.stringify({ response: { body: { items: { item: [{ nodeid: 'BSB1X', nodenm: '시청역', gpslati: 35.1796, gpslong: 129.0757, citycode: 21, nodeno: '1' }] } } } });
      const mkB = (log, o) => { o = o || {}; return { fetch: async (req) => { const u = new URL(req.url), inner = u.searchParams.get('url') || (u.pathname + u.search); log.push(inner);
        if (/getCrdntPrxmtSttnList/.test(inner) && /numOfRows=50/.test(inner)) return new Response('', { status: 200 });
        if (/getCrdntPrxmtSttnList/.test(inner)) { await sleep2(o.crMs || 0); return new Response(CR, { status: 200 }); }
        if (/bus-stops/.test(inner)) return new Response(D1, { status: 200 });
        if (/getSttnAcctoArvlPrearngeInfoList/.test(inner)) { await sleep2(o.arrMs || 0); return new Response(/nodeId=BSB1&/.test(inner) ? EMPTY : AR, { status: 200 }); }
        return new Response('', { status: 200 }); } }; };
      const body = (extra, res) => ({ cap: 29, f: { part: 'b', mode: 'bus', th: 'dark', bus: Object.assign({ lat: 35.1796, lng: 129.0756, res: res || {}, sv: 1, svb: 2200, svo: 1 }, extra || {}) } });
      // 13-a 느린 좌표 정류장 목록(2.5초): 새 방식은 첫 바퀴의 도착정보로 곧 돌려준다 · 예전 방식(dbg + tune.old)은 기다린다
      {
        const pend = [], c = load(); c.MAPSV_CTX = { waitUntil: p => pend.push(p) };
        const t0 = Date.now(); const r = await post(c.H, { BUSAPI: mkB([], { crMs: 2500 }) }, body());
        const dt = Date.now() - t0, cards = r.j.body.filter(n => n.t === 'bcard');
        ok(dt < 1500 && cards.some(x => x.rows && x.rows.length >= 1) && r.j.info.bus.st === 'need' && !r.j.info.svt, '13-a: 도착정보를 받았으면 느린 좌표 목록(2.5초)을 끝까지 붙잡히지 않는다(' + dt + 'ms) · 진단 없이는 svt 없음');
        await Promise.all(pend);
        const c2 = load(); c2.MAPSV_CTX = { waitUntil: () => {} };
        const t1 = Date.now(); const r2 = await post(c2.H, { BUSAPI: mkB([], { crMs: 2500 }) }, body({ dbg: 1, tune: { old: 1 } }));
        ok(Date.now() - t1 >= 2300, '13-a: 예전 방식(tune.old)은 느린 좌표 목록까지 기다린다(' + (Date.now() - t1) + 'ms)');
      }
      // 13-b 좌표 목록이 빠르면(30ms) 한 요청에서 끝까지(예전과 같다) — 한도(0.7초) 안이라
      {
        const c = load(); c.MAPSV_CTX = { waitUntil: () => {} };
        const t0 = Date.now(); const r = await post(c.H, { BUSAPI: mkB([], { crMs: 30 }) }, body());
        ok(r.j.info.bres.t100 && r.j.info.bres.g500 && !(r.j.info.bus.need || []).some(n => /^[afgh][0-9]|^[tu][0-9]{3}/.test(n.k)) && Date.now() - t0 < 900, '13-b: 빠른 좌표 목록은 한도 안이라 한 요청에서 도착정보까지 끝낸다(경유노선 덤만 남음 · ' + (Date.now() - t0) + 'ms)');
      }
      // 13-c 진단(dbg=1): 단계별 시간 · 바퀴 구분 · 키별 완료 시각 · 한도 적용 여부 · tune 값 범위 안으로
      {
        const c = load(); c.MAPSV_CTX = { waitUntil: () => {} };
        const r = await post(c.H, { BUSAPI: mkB([], { crMs: 2500 }) }, body({ dbg: 1, tune: { w2: 400, to: 99999 } }));
        const sv = r.j.info.svt;
        ok(sv && sv.v === 1 && Array.isArray(sv.r) && sv.r.some(x => x.w === 's') && sv.r.some(x => x.w === 'a') && sv.r.every(x => Array.isArray(x.ks) && x.t1 >= x.t0) && sv.ms < 1500, '13-c: dbg=1 → info.svt 에 바퀴별(정류장 s · 도착정보 a) 시간이 있다(' + (sv && sv.ms) + 'ms)');
        const aw = sv.r.filter(x => x.w === 'a');
        ok(aw.length >= 2 && aw[1].cap === true && aw[1].wb <= 400 && aw[0].ks.some(k => k[0] === 'a1' && k[1] >= 0), '13-c: 두 번째 도착정보 바퀴는 한도 적용(cap) · tune.w2=400 반영 · 첫 바퀴 a1 완료 시각 기록');
        const r2 = await post(load().H, { BUSAPI: mkB([]) }, body({ tune: { w2: 5 } }));            // dbg 없이 tune 만 보내면 무시
        ok(!r2.j.info.svt, '13-c: dbg 없이 보낸 tune 은 무시된다(진단 · 조절은 dbg=1 일 때만)');
      }
    }

    // ⑭ s467 (YJ: "2, 3번 먼저") — ② 멈춘 호출 끊기 · 대부분 끝났는데 몇 곳만 멈추면 일찍 응답 · ③ 방향 이름(노선 정류장 목록 r)을 서버가 한 번에 받아 채우기
    {
      const sleep3 = ms => new Promise(r => setTimeout(r, ms));
      const ARU = 'https://apis.data.go.kr/1613000/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList?serviceKey=&cityCode=21&nodeId=BSB1&_type=json';
      const AR = JSON.stringify({ response: { body: { items: { item: [{ routeno: '8', arrtime: 240, arrprevstationcnt: 3, routeid: 'R1' }] } } } });
      const env = { TAGO_KEY: 'k1', TAGO_KEY2: 'k2' };
      // 14-a 가까운 정류장(a0)은 두 길을 동시에 — 한쪽이 멈춰 있고 다른 쪽이 먼저 정상 본문을 주면 멈춘 쪽은 끊는다
      {
        const ev = [], tagoAttempts = () => [{ via: 'env-key', run: (inner, sig) => new Promise((res, rej) => { ev.push('k1 start sig=' + !!sig); if (sig) sig.addEventListener('abort', () => { ev.push('k1 abort'); rej(new Error('aborted')); }); }) },
          { via: 'env-key2', run: (inner, sig) => { ev.push('k2 start'); return sleep3(60).then(() => new Response(AR, { status: 200 })); } }];
        const c = load({ tagoAttempts }), t0 = Date.now(), b = await c.mapSvOne(env, 'a0', ARU, false, { n: 0 });
        await sleep3(20);
        ok(b === AR && Date.now() - t0 < 600 && ev.includes('k1 start sig=true') && ev.includes('k1 abort'), '14-a: 먼저 온 정상 본문이 있으면 멈춘 다른 길은 끊는다(취소 신호가 호출에 전달됨) ' + ev.join('|') + ' ' + (Date.now() - t0) + 'ms');
      }
      // 14-b 시간 제한(tune.to=500)을 넘긴 시도는 끊는다 — 멈춘 호출이 동시 연결을 계속 잡지 않게 · 본문 읽기가 멈춰도 같다
      {
        const ev = [], mk = () => (inner, sig) => new Promise((res, rej) => { if (sig) sig.addEventListener('abort', () => { ev.push('abort'); rej(new Error('aborted')); }); });
        const c = load({ tagoAttempts: () => [{ via: 'env-key', run: mk() }, { via: 'env-key2', run: mk() }] }), t0 = Date.now(), b = await c.mapSvOne(env, 'a0', ARU, false, { n: 0, to: 500 });
        const dt = Date.now() - t0;
        ok(b === '' && dt >= 450 && dt < 1500 && ev.length >= 2, '14-b: 시간 제한을 넘긴 호출은 끊고(' + ev.length + '건) 빈 값으로 돌려준다 ' + dt + 'ms');
        const c2 = load({ tagoAttempts: () => [{ via: 'env-key', run: (inner, sig) => Promise.resolve({ status: 200, text: () => new Promise((_, rej) => { if (sig) sig.addEventListener('abort', () => { ev.push('body-abort'); rej(new Error('aborted')); }); }) }) }] });
        const t1 = Date.now(), b2 = await c2.mapSvOne(env, 'a0', ARU, false, { n: 0, to: 500 });
        ok(b2 === '' && Date.now() - t1 < 1500 && ev.includes('body-abort'), '14-b: 머리만 오고 본문이 멈춰도 시간 제한 안에 끊는다 ' + (Date.now() - t1) + 'ms');
        const c3 = load({ tagoAttempts: () => [{ via: 'env-key', run: async () => new Response(AR, { status: 200 }) }] });                       // 취소 신호를 안 받는 옛 run · 신호가 없는 환경에서도 그대로 동작
        ok(await c3.mapSvOne(env, 'a0', ARU, false, { n: 0 }) === AR, '14-b: 취소 신호를 쓰지 않는 호출도 그대로 정상');
      }
      // 14-c 쓸 만한 도착정보가 한 건도 없는데 core 의 75% 이상이 끝났고 한 곳만 멈춘 채 1초가 지나면 마감(≈1.8초)까지 안 붙잡고 돌려준다 · tune.nosettle 은 예전 동작
      {
        const D1 = JSON.stringify({ ok: true, count: 4, stops: [1, 2, 3, 4].map(i => ({ node_id: 'BSB' + i, node_nm: '정류장' + i, city_code: '21', lat: 35.1796 + i * 0.0002, lng: 129.0757 })) });
        const EMPTY = '{"response":{"header":{"resultCode":"00"},"body":{"items":"","numOfRows":10,"pageNo":1,"totalCount":0}}}';
        const mkB = () => ({ fetch: async (req) => { const u = new URL(req.url), inner = u.searchParams.get('url') || (u.pathname + u.search);
          if (/getCrdntPrxmtSttnList/.test(inner) && /numOfRows=50/.test(inner)) return new Response('', { status: 200 });
          if (/bus-stops/.test(inner)) return new Response(D1, { status: 200 });
          if (/getSttnAcctoArvlPrearngeInfoList/.test(inner)) { if (/nodeId=BSB4&/.test(inner)) { await sleep3(4000); return new Response(AR, { status: 200 }); } await sleep3(30); return new Response(EMPTY, { status: 200 }); }
          return new Response('', { status: 200 }); } });
        const body = (extra) => ({ cap: 29, f: { part: 'b', mode: 'bus', th: 'dark', bus: Object.assign({ lat: 35.1796, lng: 129.0757, res: {}, sv: 1, svb: 1200, svo: 1, dbg: 1 }, extra || {}) } });
        const c = load(); c.MAPSV_CTX = { waitUntil: () => {} };
        const t0 = Date.now(), r = await post(c.H, { BUSAPI: mkB() }, body()), dt = Date.now() - t0, aw = (r.j.info.svt.r || []).filter(x => x.w === 'a');
        ok(dt >= 900 && dt < 1500 && aw.length >= 1 && aw[0].early === true && aw[0].why === 'settled' && r.j.info.bus.st === 'need' && (r.j.info.bus.need || []).some(n => n.k === 'a3'), '14-c: 쓸 만한 도착정보 없이 3/4 가 끝나고 1곳이 멈추면 1초 무렵 일찍 돌려준다(' + dt + 'ms · why=' + (aw[0] && aw[0].why) + ') · 멈춘 정류장은 need 로 남는다');
        const c2 = load(); c2.MAPSV_CTX = { waitUntil: () => {} };
        const t1 = Date.now(); const r2 = await post(c2.H, { BUSAPI: mkB() }, body({ tune: { nosettle: 1 } }));
        ok(Date.now() - t1 >= 1500, '14-c: tune.nosettle=1 은 예전처럼 마감까지 기다린다(' + (Date.now() - t1) + 'ms)');
      }
      // 14-d 방향 이름: 도착정보는 이미 있고 남은 것이 노선 정류장 목록(r)뿐인 재요청 — 서버가 받아 info.nx 로 채운다(기기 바퀴 없이)
      {
        const it = (id, nm, la, lo) => ({ nodeid: id, nodenm: nm, gpslati: la, gpslong: lo, citycode: '23' });
        const only = JSON.stringify({ response: { body: { items: { item: [it('ICB368001467', '검단대성베르힐', 37.582405, 126.708497)] } } } });
        const arrB = (...a) => JSON.stringify({ response: { body: { items: { item: a.map(x => ({ routeno: x[0], arrtime: x[1], arrprevstationcnt: 2, routeid: 'R' + x[0], routetp: '일반버스' })) } } } });
        const stnList = (rid, names, ids) => JSON.stringify({ response: { body: { items: { item: names.map((n, k) => ({ routeid: rid, nodeord: k + 1, nodeid: ids[k], nodenm: n, gpslati: 37.5, gpslong: 126.7, updowncd: 0 })) } } } });
        const RT = rid => stnList(rid, ['가', '검단대성베르힐', '다음역' + rid, '종점'], ['X1', 'ICB368001467', 'X3', 'X4']);
        const res0 = { tp: '', gg: '', tn: only, a0: arrB(['9701', 200], ['77', 300]), t0: '{}' };
        const mk = (log, extra) => { const tagoAttempts = () => ['k1', 'k2'].map((n, i) => ({ via: i ? 'env-key2' : 'env-key', run: (inner, sig) => { log.push(inner); const m = /routeId=(\w+)/.exec(inner); return sleep3(20).then(() => new Response(/getRouteAcctoThrghSttnList/.test(inner) ? RT(m[1]) : /getSttnAcctoArvlPrearngeInfoList/.test(inner) ? arrB(['9701', 200], ['77', 300]) : '{}', { status: 200 })); } }));
          const c = load({ tagoAttempts }); c.MAPSV_CTX = { waitUntil: () => {} }; return c; };
        const body = (res, extra) => ({ cap: 29, f: { part: 'b', mode: 'bus', th: 'dark', bus: Object.assign({ lat: 37.5824, lng: 126.7085, res: Object.assign({}, res), sv: 1, svb: 300, svo: 1 }, extra || {}) } });
        const log = [], c = mk(log), t0 = Date.now(), r = await post(c.H, { TAGO_KEY: 'k1', TAGO_KEY2: 'k2' }, body(res0));
        const cd = r.j.body.filter(n => n.t === 'bcard')[0], rl = log.filter(x => /getRouteAcctoThrghSttnList/.test(x));
        ok(rl.length === 2 && r.j.info.bus.st === 'ok' && r.j.info.nx['ICB368001467|R9701'] === '다음역R9701' && r.j.info.nx['ICB368001467|R77'] === '다음역R77' && cd.rows.every(x => /방향/.test(x.dir || '')) && !(r.j.info.bres && Object.keys(r.j.info.bres).some(k => /^r/.test(k))), '14-d: 도착정보는 있고 r 만 남은 재요청 — 서버가 두 노선 목록을 한 번에 받아 방향 이름을 채운다(' + rl.length + '건 · ' + (Date.now() - t0) + 'ms) · 큰 본문은 bres 에 싣지 않는다');
        const log2 = [], c2 = mk(log2), r2 = await post(c2.H, { TAGO_KEY: 'k1', TAGO_KEY2: 'k2' }, body({ tp: '', gg: '', tn: only }, { svb: 2200 }));
        ok(r2.j.info.bres && r2.j.info.bres.a0 && r2.j.info.bus.st === 'need' && (r2.j.info.bus.need || []).every(n => /^r[0-9]/.test(n.k)) && log2.filter(x => /getRouteAcctoThrghSttnList/.test(x)).length === 0, '14-d: 도착정보를 막 받은 첫 응답은 방향 이름 때문에 늦추지 않는다(r 은 need 로 남고 서버가 받지 않음)');
        const log3 = [], c3 = mk(log3), r3 = await post(c3.H, { TAGO_KEY: 'k1', TAGO_KEY2: 'k2' }, body(res0, { dbg: 1, tune: { nonx: 1 } }));
        ok(log3.filter(x => /getRouteAcctoThrghSttnList/.test(x)).length === 0 && (r3.j.info.bus.need || []).some(n => /^r/.test(n.k)), '14-d: tune.nonx=1 은 예전처럼 서버가 r 을 받지 않는다');
        const log4 = [], c4 = mk(log4), r4 = await post(c4.H, { TAGO_KEY: 'k1', TAGO_KEY2: 'k2' }, body(res0, { svo: 0 }));
        ok(log4.filter(x => /getRouteAcctoThrghSttnList/.test(x)).length === 0 && (r4.j.info.bus.need || []).some(n => /^r/.test(n.k)), '14-d: 예전 앱(svo 없음)은 그대로 — 서버가 r 을 받지 않는다');
        const slow = { run: null }; const log5 = [], tagoAttempts5 = () => [{ via: 'env-key', run: (inner, sig) => { log5.push(inner); if (/getRouteAcctoThrghSttnList/.test(inner)) return new Promise(() => {}); return Promise.resolve(new Response('{}', { status: 200 })); } }];
        const c5 = load({ tagoAttempts: tagoAttempts5 }); const pend5 = []; c5.MAPSV_CTX = { waitUntil: p => pend5.push(p) };
        const t5 = Date.now(), r5 = await post(c5.H, { TAGO_KEY: 'k1' }, body(res0));
        ok(Date.now() - t5 < 2600 && r5.status === 200 && (r5.j.info.bus.need || []).some(n => /^r/.test(n.k)) && pend5.length >= 1, '14-d: 목록이 멈춰도 1.8초 안에 돌려주고(' + (Date.now() - t5) + 'ms) r 은 need 로 남겨 기기가 이어 받는다 · 못 끝낸 것은 응답 뒤에서 계속');
      }
    }
  }
  console.log('map_server_fetch: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
