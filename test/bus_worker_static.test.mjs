// s462: gildongmu-bus 워커 — 거의 안 바뀌는 조회(경유노선 · 좌표 정류장 · 노선 정류장 목록)는 6시간 · 검증된 본문만 · 업스트림 엣지 캐시로 굳히지 않는다. 도착정보는 그대로 10초.
import fs from 'fs';
import os from 'os'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'busw2-')), f = path.join(tmp, 'bus_mod.mjs');
fs.writeFileSync(f, fs.readFileSync(path.join(root, 'workers/src/bus.js'), 'utf8'));
const load = async () => (await import(f + '?x=' + Date.now() + Math.random())).default;
const TH = '{"response":{"header":{"resultCode":"00"},"body":{"items":{"item":[{"routeno":"8","routeid":"R1"},{"routeno":"9","routeid":"R2"}]},"totalCount":2}}}';
const EMPTY = '{"response":{"header":{"resultCode":"00"},"body":{"items":"","totalCount":0}}}';
const ERR = '{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"errMsg":"SERVICE ERROR","returnReasonCode":"22"}}}';
const ARR = '{"response":{"header":{"resultCode":"00"},"body":{"items":{"item":[{"routeno":"8","arrtime":240}]},"totalCount":1}}}';
let calls = [], body = TH, opts = [];
globalThis.fetch = async (u, init) => { calls.push(String(u)); opts.push(init && init.cf); return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }); };
const store = new Map();
globalThis.caches = { default: { match: async (rq) => store.has(rq.url) ? new Response(store.get(rq.url)) : undefined, put: async (rq, rs) => { store.set(rq.url, await rs.text()); } } };
const env = { DATA_GO_KR_KEY: 'abc%2Bdef' };
const pend = []; const ctx = { waitUntil: (p) => pend.push(p) };
const mk = (op, q) => 'https://apis.data.go.kr/1613000/' + op + '?cityCode=21&' + q + '&_type=json';
const ask = async (w, url) => { const r = await w.fetch(new Request('https://x/tago?url=' + encodeURIComponent(url)), env, ctx); return [r.status, await r.text(), r.headers.get('x-gm-cache')]; };
let fails = 0; const ok = (c, m) => { console.log(c ? '  ok  ' : '  FAIL', m); if (!c) fails++; };
const THRU = mk('BusSttnInfoInqireService/getSttnThrghRouteList', 'nodeid=BSB1');
let w = await load();
calls = []; opts = []; body = TH;
let r = await ask(w, THRU); await Promise.all(pend);
ok(r[0] === 200 && r[1] === TH && calls.length === 1 && opts[0].cacheEverything === false, '경유노선: 처음엔 받고 업스트림 엣지 캐시(cacheEverything)는 쓰지 않는다');
r = await ask(w, THRU);
ok(calls.length === 1 && r[1] === TH && r[2] === 'HIT', '같은 isolate 의 두 번째는 메모리 ' + r[2]);
w = await load();   // 새 isolate — 메모리는 비었다
r = await ask(w, THRU);
ok(calls.length === 1 && r[1] === TH && r[2] === 'HIT-S', '새 isolate 도 같은 데이터센터 캐시(Cache API)에서 즉시 ' + r[2] + ' 호출 ' + calls.length);
// 빈 목록 · 오류 봉투는 굳히지 않는다
store.clear(); calls = []; body = EMPTY; w = await load();
await ask(w, THRU); await ask(w, THRU);
ok(calls.length === 2 && store.size === 0, '빈 목록은 6시간 굳히지 않는다(다시 받는다)');
body = ERR; w = await load(); calls = [];
await ask(w, THRU); await ask(w, THRU);
ok(calls.length === 2 && store.size === 0, '오류 봉투는 굳히지 않는다');
// 노선 정류장 목록(큰 본문)은 Cache API 에는 두되 메모리에는 두지 않는다
const BIG = '{"response":{"header":{"resultCode":"00"},"body":{"items":{"item":[' + Array.from({ length: 1500 }, (_, i) => '{"nodeid":"N' + i + '","nodenm":"정류장' + i + '","nodeord":' + i + '}').join(',') + ']},"totalCount":1500}}}';
store.clear(); calls = []; body = BIG; w = await load();
const RT = mk('BusRouteInfoInqireService/getRouteAcctoThrghSttnList', 'routeId=R1&numOfRows=300');
await ask(w, RT); await Promise.all(pend);
const rr = await ask(w, RT);
ok(BIG.length > 60000 && calls.length === 1 && rr[2] === 'HIT-S', '큰 노선 정류장 목록: 메모리 대신 Cache API ' + rr[2]);
// 도착정보는 10초 · 업스트림 엣지 캐시 그대로
store.clear(); calls = []; opts = []; body = ARR; w = await load();
await ask(w, mk('ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList', 'nodeId=BSB1'));
ok(opts[0].cacheEverything === true && opts[0].cacheTtlByStatus['200-299'] === 10 && store.size === 0, '도착정보는 예전 그대로(10초 · Cache API 에 두지 않는다)');
// 좌표 정류장 목록도 포함
body = TH; calls = []; w = await load();
const CR = mk('BusSttnInfoInqireService/getCrdntPrxmtSttnList', 'gpsLati=35.18&gpsLong=129.076');
await ask(w, CR); const c2 = await ask(w, CR);
ok(calls.length === 1 && c2[2] === 'HIT', '좌표로 찾은 정류장 목록도 캐시');
// ── s463: 하루 예산 조절기 — 사용량이 70% 를 넘으면 도착정보 기억을 늘린다(TAGO 10→12→15초 · 서울 15→20→25초). 읽기는 뒤에서(요청을 막지 않는다) · 못 읽으면 normal
const askE = async (w, url, e) => { const r = await w.fetch(new Request('https://x/tago?url=' + encodeURIComponent(url)), e, ctx); return [r.status, await r.text(), r.headers.get('x-gm-cache')]; };
const dbR = (rows, o) => { o = o || {}; const st = { q: 0 }; return { st, prepare: (sql) => ({ bind: (day) => ({ all: async () => { st.q++; st.sql = sql; st.day = day; if (o.err) throw new Error(o.err); return { results: rows }; } }) }), batch: async () => [], }; };
const ARRU = (id) => mk('ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList', 'nodeId=' + id);
const SEOU = (id) => 'http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid?arsId=' + id;
const ttlOf = async (rows, url, o) => { store.clear(); calls = []; opts = []; body = ARR; const d = dbR(rows, o), e2 = { DATA_GO_KR_KEY: 'abc%2Bdef', DB: d }; const w2 = await load();
  await askE(w2, ARRU('WARM1'), e2); await Promise.all(pend);                 // 첫 요청: 읽기를 시작(이 요청은 normal 로 간다)
  opts = []; await askE(w2, url, e2); return { ttl: opts[0] && opts[0].cacheTtlByStatus && opts[0].cacheTtlByStatus['200-299'], q: d.st.q, day: d.st.day, sql: d.st.sql }; };
let t = await ttlOf([{ k: 'bus.tago.arr', n: 1000 }], ARRU('BSB2'));
ok(t.ttl === 10 && t.q === 1 && /live_usage/.test(t.sql) && /^\d{4}-\d\d-\d\d$/.test(t.day), '예산 조절기: 사용량이 적으면 도착정보 10초 · D1 은 1번만 읽는다');
t = await ttlOf([{ k: 'bus.tago.arr', n: 250000 }, { k: 'map.arr.tago', n: 110000 }], ARRU('BSB3'));
ok(t.ttl === 12, 'TAGO 70% 넘음(버스 서버 + 지도 서버 호출 합) → 12초 ' + t.ttl);
t = await ttlOf([{ k: 'tago.env-key', n: 300000 }, { k: 'tago.env-key2', n: 160000 }], ARRU('BSB4'));
ok(t.ttl === 15, 'TAGO 90% 넘음 → 15초(그 이상은 늘리지 않는다) ' + t.ttl);
t = await ttlOf([{ k: 'bus.seoul.arr', n: 7500 }], SEOU('11111'));
ok(t.ttl === 20, '서울 75%(1만/일 한도) → 서울 도착정보 20초 ' + t.ttl);
t = await ttlOf([{ k: 'bus.seoul.arr', n: 9500 }], SEOU('22222'));
ok(t.ttl === 25, '서울 95% → 25초 ' + t.ttl);
t = await ttlOf([{ k: 'bus.seoul.arr', n: 9500 }], ARRU('BSB5'));
ok(t.ttl === 10, '서울이 많아도 TAGO 도착정보는 그대로 10초(종류별로 따로) ' + t.ttl);
t = await ttlOf([{ k: 'bus.tago.arr', n: 480000 }], mk('ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList', 'nodeId=BSB6').replace('/1613000/ArvlInfoInqireService', '/6410000/busarrivalservice/v2').replace('getSttnAcctoArvlPrearngeInfoList', 'getBusArrivalListv2'));
ok(t.ttl === 10, '경기(GBIS) 도착정보는 조절 대상이 아니다(10초) ' + t.ttl);
t = await ttlOf([], ARRU('BSB7'), { err: 'D1 down' });
ok(t.ttl === 10, 'D1 을 못 읽으면 normal 그대로(요청은 막히지 않는다)');
{ // 정적 조회(경유노선 등)는 예산과 무관하게 6시간
  store.clear(); calls = []; opts = []; body = TH; const d = dbR([{ k: 'bus.tago.arr', n: 490000 }]), e2 = { DATA_GO_KR_KEY: 'abc%2Bdef', DB: d }; const w2 = await load();
  await askE(w2, ARRU('WARM2'), e2); await Promise.all(pend); const rr2 = await askE(w2, THRU, e2); const rr3 = await askE(w2, THRU, e2);
  ok(rr2[0] === 200 && rr3[2] === 'HIT', '예산 모드와 관계없이 경유노선 목록은 그대로 캐시');
}
{ // /usage.json 에 모드가 보인다
  store.clear(); const d = dbR([{ k: 'bus.tago.arr', n: 400000 }]), e2 = { DATA_GO_KR_KEY: 'abc%2Bdef', DB: d }; const w2 = await load();
  body = ARR; await askE(w2, ARRU('WARM3'), e2); await Promise.all(pend);
  const r2 = await w2.fetch(new Request('https://x/usage.json'), e2, ctx); const j = await r2.json();
  ok(j.budget && j.budget.modes.tago === 'saver' && j.budget.ttlSec.tago === 12 && j.budget.limit.tago === 500000, '/usage.json 에 budget(모드 · TTL · 한도) ' + JSON.stringify(j.budget));
}
process.exit(fails ? 1 : 0);
