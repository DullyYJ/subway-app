// 버스 '한 번에 받기'(engine/map-worker.js · f.bus.sv=1) 시험.  실행: node test/map_server_fetch.test.js
//  서버가 엔진의 need 를 BUSAPI 바인딩으로 받아 채워 완성된 화면 + info.bres 를 돌려주는지 · 캐시 · 실패 때의 폴백 · cap 문턱.
process.env.TZ = 'Asia/Seoul';
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = p => path.join(__dirname, '..', p);
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const cut = t => t.slice(0, t.indexOf('if (typeof module'));
const code = cut(fs.readFileSync(R('engine/map.js'), 'utf8')) + '\n' + fs.readFileSync(R('engine/map-worker.js'), 'utf8') + '\n;this.H = handleScreenMap; this.T = handleBusTago; this.mapSvOne = mapSvOne;';
function load(extra) {
  const ctx = Object.assign({ ENGINE_VERSION: 'test', Request, Response, URL, Promise, setTimeout, clearTimeout, JSON, Date, console }, extra || {});
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
    ok(keys.some(k => /^bs:[0-9a-f]{16}$/.test(k)) && keys.includes('bsreg') && kv.ttl && kv.ttl.expirationTtl === 14 * 86400, '처음 받은 정류장 목록은 KV 에 14일 + 기억 목록(bsreg)에 기록 ' + keys.join());
    const reg = JSON.parse(kv.get('bsreg'));
    ok(reg.length >= 1 && reg.every(e => /^(tp|gg|tn|d1)$/.test(e.k) && typeof e.u === 'string' && e.at > 0), '목록 항목은 {k,u,at}');
    const c2 = load(); c2.MAPSV_CTX = ctxw;
    await post(c2.H, { BUSAPI: binding(log2), ROWS_KV: mkKv() }, base(true));
    ok(log1.some(u => /getStationByPos/.test(u)) && !log2.some(u => /getStationByPos/.test(u)) && log2.filter(u => /getStationByUid/.test(u)).length === 3, '새 데이터센터(캐시 없음)도 KV 에서 정류장 목록을 바로 쓴다 · 도착정보만 새로 받는다');
    // 엉뚱한 주소 값(해시 겹침)이면 쓰지 않는다
    const k0 = keys.find(k => /^bs:/.test(k)), v0 = JSON.parse(kv.get(k0)); v0.u = 'https://other'; kv.set(k0, JSON.stringify(v0));
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
  console.log('map_server_fetch: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
