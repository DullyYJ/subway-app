'use strict';
// route-v2 s248: (YJ: "가장 가까운 정류장은 한진인데 자꾸 다음 정류장에서 태워 — 주변에 검색되는 정류장이 있으면 다른 정류장에서 태우지 마")
//   accessNodes(nearFirst) 가 버스 정류장은 가장 가까운 곳 근처(반대편 포함)만 남긴다. 단 가까운 정류장들에 없는 노선이 있는 정류장은 도보 10분(720m) 안에서만 넓힌다. 지하철역·'내 즐겨찾기 승차'는 그대로.
const fs = require('fs'), path = require('path'), vm = require('vm');
const W = fs.readFileSync(path.join(__dirname, '..', 'engine/route-v2-worker.ascii.js'), 'utf8');
function cut(name) {
  const a = W.indexOf('function ' + name + '(');
  if (a < 0) throw new Error(name + ' 없음');
  const b = W.indexOf('__name(' + name + ',', a);
  return W.slice(a, b);
}
const consts = ['ACCESS_WALK', 'WALK_MPS', 'NEAR_EXTRA', 'NEAR_RATIO', 'NEAR_KEEP', 'BOARD_NEAR_EXTRA', 'BOARD_EXPAND_M', 'PREF_SNAP_M', 'FAV_SNAP_M', 'FAV_WALK_MULT', 'CROSS_ROAD_M', 'STOP_SNAP_M'].map((n) => {
  const m = new RegExp('^var ' + n + ' = [^;]+;', 'm').exec(W); if (!m) throw new Error(n + ' 상수 없음'); return m[0];
}).join('\n');
const ctx = { __name: (f) => f, __name2: (f) => f, Math, String, Array, Object, isFinite, Infinity, stopNmKey: (x) => String(x || ''), Set, buildStopRouteIdx: (G) => G.__idx || {} };
vm.createContext(ctx);
vm.runInContext(consts + '\n' + cut('hav') + '\n' + cut('busAllowed') + '\n' + cut('accessNodes') + '\nthis.an = accessNodes;', ctx);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
// 사용자 위치에서 동쪽으로 d 미터 떨어진 점
const LAT = 37.3472, LNG = 126.6260, MLNG = 1 / (111320 * Math.cos(LAT * Math.PI / 180));
const at = (m, dy) => [LAT + (dy || 0) / 110540, LNG + m * MLNG];
const busCoord = { H1: at(147), H2: at(185, 20), SG: at(860), FAR: at(700, 300) };
const names = (r) => r.map((x) => x[0]).sort().join();
const G = () => ({ ST: {}, noStop: {}, __idx: { H1: [['r43a', 1]], H2: [['r43b', 1]], SG: [['r43a', 2]], A: [['x', 1]], B: [['y', 1]], C: [['x', 9]], Z: [['q', 1]], FAR: [['f', 1]] } });
let r = ctx.an(G(), busCoord, LAT, LNG, null, {}, true);
ok(names(r) === 'B|H1,B|H2', '가까운 한진 두 곳(양방향)만 — 다음 정류장(선광)·먼 정류장은 빼둔다: ' + names(r));
// 앱이 찾아 준 주변 정류장 목록이 있어도(allowBus) 같은 규칙
const allow = [at(147), at(185, 20), at(860)];
r = ctx.an(G(), busCoord, LAT, LNG, allow, {}, true);
ok(names(r) === 'B|H1,B|H2', '주변 목록(선광 포함)이 있어도 가장 가까운 곳 근처만: ' + names(r));
// 지하철역은 그대로 남는다
const g = G(); g.ST = { s1: { y: LAT, x: LNG + 800 * MLNG } };
r = ctx.an(g, busCoord, LAT, LNG, null, {}, true);
ok(names(r).indexOf('S|s1') >= 0 && names(r).indexOf('B|SG') < 0, '지하철역은 그대로, 먼 정류장만 뺀다: ' + names(r));
// 가장 가까운 정류장이 20m 라도 반대편(150m 이내)은 남는다
const bc2 = { A: at(20), B: at(160), C: at(500) };
r = ctx.an(G(), bc2, LAT, LNG, null, {}, true);
ok(names(r) === 'B|A,B|B', '가까운 곳이 20m 여도 길 건너편 정류장은 남는다: ' + names(r));
// 정류장이 하나뿐이면 멀어도(900m 안) 그대로
r = ctx.an(G(), { Z: at(700) }, LAT, LNG, null, {}, true);
ok(names(r) === 'B|Z', '근처에 그것 하나뿐이면 그대로: ' + names(r));
// 넓히기: 가까운 정류장들에 없는 노선이 있는 정류장만 · 도보 10분(720m) 안에서만
{
  const bc = { H1: at(147), H2: at(185, 20), SAME: at(600), NEW: at(650), NEWFAR: at(800), UNK: at(560) };
  const g3 = G(); g3.__idx = { H1: [['r43a', 1]], H2: [['r43b', 1]], SAME: [['r43a', 5]], NEW: [['r9', 3]], NEWFAR: [['r9', 4]] };
  const r3 = ctx.an(g3, bc, LAT, LNG, null, {}, true);
  ok(names(r3) === 'B|H1,B|H2,B|NEW', '가까운 정류장에 없는 노선(r9)이 있는 650m 정류장만 넓힌다 — 같은 노선(r43)뿐인 정류장·노선 정보 없는 정류장·800m(10분 밖)은 뺀다: ' + names(r3));
  const st = {}; ctx.an(g3, bc, LAT, LNG, null, st, true);
  ok(st.farBusExpanded === 1, '넓힌 수를 진단에 남긴다');
  const r4 = ctx.an(g3, bc, LAT, LNG, null, {});
  ok(names(r4).indexOf('B|SAME') >= 0, 'nearFirst 가 아니면(도착지 쪽 등) 예전 그대로');
}
console.log('access_near_bus: pass', pass, 'fail', fail);
process.exit(fail ? 1 : 0);
