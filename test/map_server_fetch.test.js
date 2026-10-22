// 버스 '한 번에 받기'(engine/map-worker.js · f.bus.sv=1) 시험.  실행: node test/map_server_fetch.test.js
//  서버가 엔진의 need 를 BUSAPI 바인딩으로 받아 채워 완성된 화면 + info.bres 를 돌려주는지 · 캐시 · 실패 때의 폴백 · cap 문턱.
process.env.TZ = 'Asia/Seoul';
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = p => path.join(__dirname, '..', p);
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const cut = t => t.slice(0, t.indexOf('if (typeof module'));
const code = cut(fs.readFileSync(R('engine/map.js'), 'utf8')) + '\n' + fs.readFileSync(R('engine/map-worker.js'), 'utf8') + '\n;this.H = handleScreenMap;';
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
    const log1 = [], log2 = [], c = load({ caches });
    await post(c.H, { BUSAPI: binding(log1) }, base(true));
    await post(c.H, { BUSAPI: binding(log2) }, base(true));
    ok(log1.some(u => /getStationByPos/.test(u)) && !log2.some(u => /getStationByPos/.test(u)) && log2.filter(u => /getStationByUid/.test(u)).length === 3, '같은 칸을 다시 열면 정류장 조회는 캐시 · 도착정보만 새로 받는다');
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
  console.log('map_server_fetch: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
