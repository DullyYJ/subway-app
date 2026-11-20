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
process.exit(fails ? 1 : 0);
