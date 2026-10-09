// s18 시험 — 버스 운행시간을 '타는 시각' 기준으로 확인하고, 막차 뒤/첫차 전을 올바르게 가른다.
// 사용: node svc_board.test.mjs <빌드된 엔진.js>   (make.sh 결과물)
import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'assert';
console.warn = () => {};
const src = fs.readFileSync(process.argv[2], 'utf8');
const i = src.lastIndexOf('export {');
const tmp = path.join(os.tmpdir(), 'svc_board_eng_' + process.pid + '.mjs');
fs.writeFileSync(tmp, src.slice(0, i) + 'export { addBus, dijkstra, buildSubway, SUBWAY_BUNDLE, subOffSet, subNextFirst, _nowMinKST, svcOffState };\n');
const M = await import(tmp);
fs.unlinkSync(tmp);
const G0 = M.buildSubway(M.SUBWAY_BUNDLE);

// 1) 분류: 막차(+여유 60분) 뒤는 after, 첫차 직전은 before
{
  const w = { s: 300, e: 1350 };                       // 05:00 ~ 22:30
  assert.strictEqual(M.svcOffState(w, 26), 'after');   // 00:26 — 막차 뒤(예전엔 before 로 잘못 나왔다)
  assert.strictEqual(M.svcOffState(w, 60), 'after');   // 01:00
  assert.strictEqual(M.svcOffState(w, 200), 'before'); // 03:20 — 첫차에 더 가깝다
  assert.strictEqual(M.svcOffState({ s: null, e: null }, 10), null);
}

const lat0 = 37.2, lng0 = 127.3;
const straight = [[0, 0], [0, .01], [0, .02], [0, .03], [0, .04], [0, .05]];
const detour = [[0, 0], [.004, .01], [.004, .02], [.004, .03], [.004, .04], [0, .05]];
const route = (key, no, s, e, itv, pts, idp) => pts.map((p, k) => ({
  seq: k + 1, node_id: idp + k, node_nm: idp + k, lat: lat0 + p[0], lng: lng0 + p[1],
  route_key: key, route_no: no, route_type: '일반버스', start_time: s, end_time: e, itv_wd: itv, itv_sat: itv, itv_sun: itv,
}));
function run(rows, hh, mm) {
  const baseMs = Date.UTC(2026, 9, 9, hh - 9, mm);
  const G = { adj: Object.create(null), ST: G0.ST, LN: G0.LN, _weekend: false, _baseMs: baseMs, _baseCustom: true };
  const nk = M._nowMinKST(baseMs);
  G.subOff = M.subOffSet(G.LN, nk, false); G.subFirst = M.subNextFirst(G.LN, nk, false);
  for (const k in G0.adj) G.adj[k] = G0.adj[k].slice();
  const r = M.addBus(G, rows, M.SUBWAY_BUNDLE); G._allowBus = null;
  return M.dijkstra(G, r.busCoord, r.busNm, lat0 + .0003, lng0 + .0003, lat0 + .0003, lng0 + .0497, 'minTime', { noSubway: true });
}
const X = route('X_1', 'X1', '0500', '2230', 60, straight, 'N');   // 빠르지만 22:30 막차
const Y = route('Y_1', 'Y1', '0500', '0230', 60, detour, 'M');      // 조금 돌지만 02:30 까지

// 2) 낮: 경고 없음, 빠른 X
{
  const r = run([...X, ...Y], 14, 0);
  assert.ok(r && !r.svcWarn && !r.svcRerouted);
  assert.strictEqual(r.legs[0].busNo, 'X1');
}
// 3) 밤 23:20 출발 — X 는 출발 시각엔 운행 중(막차+60분=23:30)이지만 타는 시각엔 끝났다 → Y 로 다시 찾는다
{
  const r = run([...X, ...Y], 23, 20);
  assert.ok(r && !r.svcWarn, '경고 없는 경로여야 한다');
  assert.strictEqual(r.legs[0].busNo, 'Y1');
  assert.strictEqual(r.svcRerouted, true);
}
// 4) 대안이 없으면 원래 경로 + 정직한 경고(after)
{
  const r = run(X, 23, 20);
  assert.ok(r && r.svcWarn && r.svcWarn[0].type === 'bus');
  assert.strictEqual(r.svcWarn[0].state, 'after');
  assert.strictEqual(r.svcWarn[0].rk, 'X_1');
}
console.log('svc_board ok');
