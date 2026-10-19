// 경로 결과 정리 엔진(engine/route-view.js) 시험 — 2026-10-19 (s66)
//   · 겹침 정리(서명 · 더 짧은 쪽 · 탭 합치기 · 소요/환승/종류 같은 것) · 탭 대표 · 왜 이 경로인지 문장 · 승차/대기/도보 나누기
//   · 입력을 고치지 않는다 · Worker 내장본이 모듈과 같다 · &rv=1 일 때만 싣는다
'use strict';
const assert = require('assert');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const RV = require(path.join(root, 'engine/route-view.js'));
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n     ' + (e && e.message)); } }

const sub = (line, a, b, min, x) => Object.assign({ trafficType: 1, lane: [{ name: line }], startName: a, endName: b, sectionTime: min }, x || {});
const bus = (no, a, b, min, x) => Object.assign({ trafficType: 2, lane: [{ busNo: no }], startName: a, endName: b, sectionTime: min }, x || {});
const walk = (min, x) => Object.assign({ trafficType: 3, sectionTime: min }, x || {});
const P = (tab, tot, xf, pt, sp, x) => ({ info: Object.assign({ tab, totalTime: tot, transferCount: xf, pathType: pt }, x || {}), subPath: sp });
const od = paths => ({ result: { path: paths } });

t('같은 서명: 더 짧은 쪽을 남기고 탭을 합친다', () => {
  const A = [walk(3), sub('2호선', '강남', '시청', 20), walk(2)];
  const r = RV.rvAnnotate(od([P('fast', 30, 0, 1, A), P('less', 28, 0, 1, A)]));
  assert.deepStrictEqual(r.keep, [1]); assert.deepStrictEqual(r.tabs[1], ['fast', 'less']); assert.strictEqual(r.why[1], '가장 빨리 도착하면서 환승도 가장 적은 경로예요.');
});
t('소요·환승·종류가 같으면 먼저 온 것만(탭은 합치지 않는다)', () => {
  const r = RV.rvAnnotate(od([P('fast', 30, 1, 3, [sub('2호선', 'a', 'b', 20)]), P('sub', 30, 1, 3, [sub('3호선', 'a', 'b', 20)])]));
  assert.deepStrictEqual(r.keep, [0]); assert.deepStrictEqual(r.tabs[0], ['fast']);
});
t('왜 이 경로인지: 최단 · 최소환승 · 도보 · 지하철 · 버스 · 장거리', () => {
  const s1 = [sub('2호선', 'a', 'b', 20)], s2 = [sub('1호선', 'a', 'c', 25), sub('2호선', 'c', 'b', 10)];
  const r = RV.rvAnnotate(od([P('fast', 30, 2, 3, s2), P('less', 40, 0, 3, s1), P('walk', 50, 1, 3, [walk(40)]), P('sub', 41, 1, 1, [sub('9호선', 'x', 'y', 30)]), P('bus', 42, 0, 2, [bus('146', 'x', 'y', 30)])]));
  assert.strictEqual(r.why[0], '가장 빨리 도착하는 경로예요. 환승 0회로 가는 경로는 10분 더 걸려요.');
  assert.strictEqual(r.why[1], '환승이 가장 적은 경로예요(환승 없음). 가장 빠른 경로보다 10분 더 걸려요.');
  assert.strictEqual(r.why[2], '걷는 시간이 가장 짧은 경로예요.'); assert.strictEqual(r.why[3], '지하철 위주로 이동하는 경로예요.'); assert.strictEqual(r.why[4], '버스 위주로 이동하는 경로예요.');
  const L = RV.rvAnnotate(od([P('longdist', 200, 1, 4, [{ trafficType: 4, lane: [{ name: 'KTX' }], startName: 'a', endName: 'b', sectionTime: 150 }], { longDist: true, ldGrade: 'KTX', ldDepTs: 100, ldFastRide: { rideMin: 120, depTs: 200, depLabel: '10:30' } })]));
  assert.strictEqual(L.why[0], '기다리는 시간까지 합쳐 가장 일찍 도착하는 KTX 편이에요. 이동 시간만 가장 짧은 편은 10:30 출발(120분)이지만 기다리는 시간이 길어 도착은 더 늦어요.');
  assert.strictEqual(RV.rvAnnotate(od([P(null, 30, 0, 3, s1)])).why[0], '');
});
t('승차/대기/도보 나누기: 합이 총 소요와 같다 · 문장', () => {
  const sp = [walk(3), sub('2호선', 'a', 'b', 20, { startSec: 60, endSec: 960 }), walk(4, { xferWaitSec: 120 }), bus('146', 'b', 'c', 10, { waitSec: 180 })];
  const r = RV.rvAnnotate(od([P('fast', 37, 1, 3, sp)]));
  const s = r.split[0]; assert.strictEqual(s.ride + s.wait + s.walk, 37); assert.strictEqual(s.tot, 37);
  assert.strictEqual(s.text, '승차 ' + s.ride + '분 · 대기 ' + s.wait + '분 · 도보·환승 ' + s.walk + '분');
  assert.strictEqual(RV.rvAnnotate(od([P('fast', 10, 0, 3, [walk(10)])])).split[0], null);          // 탈것 없음 → 나눌 수 없음
  assert.strictEqual(RV.rvSplitText({ ride: 9, wait: 0, walk: 0 }), '승차 9분');
});
t('모자란 시간은 대기에 더한다(15분 이내) · 3분 이내는 비율', () => {
  const sp = [sub('2호선', 'a', 'b', 20)];
  assert.deepStrictEqual(RV.rvSplit(sp, 26), { ride: 20, wait: 6, walk: 0 });
  assert.deepStrictEqual(RV.rvSplit(sp, 21).ride + RV.rvSplit(sp, 21).wait, 21);
  assert.deepStrictEqual(RV.rvSplit(sp, 100), { ride: 20, wait: 0, walk: 0 });
});
t('입력을 바꾸지 않는다 · 경로가 없어도 죽지 않는다', () => {
  const o = od([P('fast', 30, 0, 3, [sub('2호선', 'a', 'b', 20)]), P('less', 31, 0, 3, [sub('2호선', 'a', 'b', 20)])]);
  const c = JSON.stringify(o); const r = RV.rvAnnotate(o); delete o.result.rv; assert.strictEqual(JSON.stringify(o), c); assert.ok(r.v === 1);
  assert.deepStrictEqual(RV.rvAnnotate({ result: { path: [] } }).keep, []); assert.deepStrictEqual(RV.rvAnnotate({}).keep, []); assert.deepStrictEqual(RV.rvAnnotate(null).keep, []);
});
const worker = fs.readFileSync(path.join(root, 'engine/route-v2-worker.ascii.js'), 'utf8');
t('Worker 에 내장되고 rv=1 일 때만 싣는다', () => {
  assert.ok(/\/\/ ===== route-view \(/.test(worker)); assert.ok(/route-view \\ub05d =====/.test(worker));
  assert.ok(/if \(p\.get\("rv"\) === "1"\) \{\s*try \{\s*rvAnnotate\(_od\);/.test(worker));
  assert.ok(worker.indexOf('rvAnnotate(_od)') > worker.indexOf('await ntAttachAll(env, _od'));      // 환승·다음열차 정보가 붙은 뒤
});
t('Worker 내장본 결과가 모듈과 같다', () => {
  const m = worker.match(/\/\/ ===== route-view \([^\n]*\n([\s\S]*?)\/\/ ===== route-view \\ub05d =====/); assert.ok(m);
  const body = m[1].replace(/^\s*if \(typeof module[^\n]*\n/m, '');
  const mod = new Function(body + '; return { rvAnnotate: rvAnnotate };')();
  const s1 = [sub('2호선', 'a', 'b', 20)], s2 = [sub('1호선', 'a', 'c', 25), sub('2호선', 'c', 'b', 10)];
  const mk = () => od([P('fast', 30, 2, 3, s2), P('less', 40, 0, 3, s1), P('less', 39, 0, 3, s1), P('sub', 41, 1, 1, [sub('9호선', 'x', 'y', 30, { startSec: 0, endSec: 1500 })]), P(null, 50, 1, 2, [bus('146', 'x', 'y', 30, { waitSec: 200 })])]);
  assert.deepStrictEqual(mod.rvAnnotate(mk()), RV.rvAnnotate(mk()));
});
console.log('route_view: ' + pass + ' pass ' + fail + ' fail');
process.exit(fail ? 1 : 0);
