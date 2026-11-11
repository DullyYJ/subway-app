// s449 시험 — 가까운 정류장 우선(NEAR_PRIO_MIN). 사용: node test/near_priority.test.mjs [엔진.js]
//   가까운 정류장(30m)의 N1 은 배차가 길고, 먼 정류장(약 450m)의 F1 은 빠르다.
//   · 먼 쪽이 7분 넘게 이기면 그대로 먼 정류장(F1), 7분 이내면 가까운 정류장(N1)을 쓴다.
import fs from 'fs'; import os from 'os'; import path from 'path'; import assert from 'assert';
console.warn = () => {};
const file = process.argv[2] || new URL('../engine/route-v2-worker.ascii.js', import.meta.url).pathname;
const src = fs.readFileSync(file, 'utf8'); const i = src.lastIndexOf('export {');
const tmp = path.join(os.tmpdir(), 'near_prio_' + process.pid + '.mjs');
fs.writeFileSync(tmp, src.slice(0, i) + 'export { addBus, dijkstra, buildSubway, SUBWAY_BUNDLE, subOffSet, subNextFirst, _nowMinKST };\n');
const M = await import(tmp); fs.unlinkSync(tmp);
const G0 = M.buildSubway(M.SUBWAY_BUNDLE);
const lat0 = 37.60, lng0 = 126.70, mLat = 110540, mLng = 111320 * Math.cos(lat0 * Math.PI / 180);
const ll = (x, y) => [lat0 + y / mLat, lng0 + x / mLng];
const row = (key, no, seq, id, x, y, itv) => { const [la, lo] = ll(x, y); return { seq, node_id: id, node_nm: id, lat: la, lng: lo, route_key: key, route_no: no, route_type: '일반버스', start_time: '0000', end_time: '2359', itv_wd: itv, itv_sat: itv, itv_sun: itv }; };
const world = (itvN) => { const rows = []; for (let k = 0; k < 11; k++) rows.push(row('N_1', 'N1', k + 1, 'N' + k, 30 + k * 497, 0, itvN)); for (let k = 0; k < 10; k++) rows.push(row('F_1', 'F1', k + 1, 'F' + k, 300 + k * 520, 330, 8)); return rows; };
function run(rows) {
  const baseMs = Date.UTC(2026, 10, 10, 5, 0);
  const G = { adj: Object.create(null), ST: G0.ST, LN: G0.LN, _weekend: false, _baseMs: baseMs, _baseCustom: true };
  const nk = M._nowMinKST(baseMs); G.subOff = M.subOffSet(G.LN, nk, false); G.subFirst = M.subNextFirst(G.LN, nk, false);
  for (const k in G0.adj) G.adj[k] = G0.adj[k].slice();
  const r = M.addBus(G, rows, M.SUBWAY_BUNDLE); G._allowBus = null;
  const [sy, sx] = ll(0, 0), [ey, ex] = ll(5000, 60);
  return M.dijkstra(G, r.busCoord, r.busNm, sy, sx, ey, ex, 'minTime', { noSubway: true });
}
const bus = (r) => r.legs.find((l) => l.mode === 'bus').busNo;
{ const r = run(world(8)); assert.strictEqual(bus(r), 'N1'); assert.ok(!r.nearPrio, '가까운 쪽이 이미 이기면 그대로'); }
{ const r = run(world(34)); assert.strictEqual(bus(r), 'N1', '먼 정류장이 6분 이기는 정도면 가까운 정류장'); assert.strictEqual(r.nearPrio, true); assert.strictEqual(r.accessWalkMin, 0); }
{ const r = run(world(45)); assert.strictEqual(bus(r), 'F1', '먼 정류장이 7분 넘게 이기면 먼 정류장'); assert.ok(!r.nearPrio); }
console.log('near_priority ok');
