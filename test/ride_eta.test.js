// 도착시각 엔진(engine/ride-eta.js) 단위 시험 — 브라우저 없이 Node 만으로 돈다(수 초 이내).
// 실행: node test/ride_eta.test.js
//
// 예전 시험(test/ride_evidence.ui.test.js, 헤드리스 Chromium)이 앱 안의 _recalcArrivalsFrom 에 대해 확인하던 의미를 엔진 입력(passes)으로 옮겼다.
//   · 통과 기록의 출처는 src 로 구분한다: 'board'(승차 확정) 'pf'(위치 채택) 'cell'(기지국 선행) 'gps' 'drift'
//   · 표시는 HH:MM(가장 가까운 분). 그래서 ±1분 안쪽은 "같다"로 본다(시험에서 쓰는 허용치는 각 줄에 적었다).
'use strict';
const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');
const { rideEta, handleRideEta } = require(path.join(__dirname, '..', 'engine', 'ride-eta.js'));

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e && e.message).split('\n')[0]); } };
const tAsync = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e && e.message).split('\n')[0]); } };

// ── 공통 장면: 출발 + 인천1호선 7개 역(예정 17:35 캠퍼스타운 승차, 역간 2~3분) ──────────────────────────────
const DAY = Date.parse('2026-10-06T00:00:00+09:00');                       // 한국 자정
const at = (h, m, s) => DAY + ((h * 60 + m) * 60 + (s || 0)) * 1000;
const hm = (s) => { const p = s.split(':'); return (+p[0]) * 60 + (+p[1]); };
const NAMES = ['캠퍼스타운', '동막', '동춘', '원인재', '신연수', '선학', '문학경기장'], OFFS = [0, 3, 5, 7, 8, 10, 12];
const BM = 17 * 60 + 35;
function scene(line) {
  const nodes = [{ name: '출발', isOrigin: true, planMin: BM - 5 }];
  NAMES.forEach((n, i) => nodes.push({ name: n, isSub: true, lineName: line || '인천1호선', planMin: BM + OFFS[i] }));
  return nodes;
}
// 환승 장면: 7호선 3역(가·나·다) → 도보 → 2호선 3역(라·마·바). 예정 17:35 승차, 환승 후 17:43 승차
function xferScene() {
  const mk = (name, min, o) => Object.assign({ name: name, planMin: min }, o);
  return [mk('출발', BM - 5, { isOrigin: true }),
    mk('가', BM, { isSub: true, lineName: '7호선' }), mk('나', BM + 3, { isSub: true, lineName: '7호선' }), mk('다', BM + 5, { isSub: true, lineName: '7호선' }),
    mk('환승', BM + 6, { isWalk: true }),
    mk('라', BM + 8, { isSub: true, lineName: '2호선' }), mk('마', BM + 11, { isSub: true, lineName: '2호선' }), mk('바', BM + 13, { isSub: true, lineName: '2호선' })];
}
const run = (nodes, passes, nowMs, extra) => rideEta(Object.assign({ nowMs: nowMs != null ? nowMs : passes[passes.length - 1].ms, nodes: nodes, passes: passes, boarded: true }, extra || {}));
const P = (idx, h, m, s, src) => ({ idx: idx, ms: at(h, m, s), src: src || 'pf' });
const hmStr = (m) => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.round(m % 60)).slice(-2);
const near = (arrStr, planStr, tol) => Math.abs(hm(arrStr) - hm(planStr)) <= (tol == null ? 1 : tol);
const sceneArr = (r) => r.arr.slice(1);          // 출발 노드 제외

console.log('[입출력·순수성]');
t('출력 모양: arr(HH:MM)·etaMs·delayMin·anchorIdx·notes, 노드 수와 같다', () => {
  const r = run(scene(), [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 20)]);
  assert.strictEqual(r.arr.length, 8); assert.strictEqual(r.etaMs.length, 8);
  r.arr.forEach(a => assert.ok(/^\d\d:\d\d$/.test(a), a));
  assert.strictEqual(typeof r.delayMin, 'number'); assert.strictEqual(r.anchorIdx, 2); assert.ok(Array.isArray(r.notes) && r.notes.length > 0);
});
t('입력을 바꾸지 않고, 같은 입력은 같은 결과(상태 없음)', () => {
  const inp = { nowMs: at(17, 41, 5), nodes: scene(), passes: [P(1, 17, 35, 48, 'board'), P(2, 17, 39, 0), P(3, 17, 41, 5)], boarded: true };
  const copy = JSON.stringify(inp);
  const a = rideEta(inp), b = rideEta(inp);
  assert.strictEqual(JSON.stringify(inp), copy); assert.deepStrictEqual(a, b);
});
t('시각은 한국 시각(UTC+9)으로 표시된다 — Worker 의 UTC 시계와 무관', () => {
  const r = run(scene(), [P(1, 17, 35, 30, 'board'), P(2, 17, 38, 0)]);
  assert.ok(near(r.arr[1], '17:35'), JSON.stringify(r.arr));
});
t('표시 반올림은 가장 가까운 분(내림은 opts.rounding=floor)', () => {
  const nodes = scene();
  const a = run(nodes, [P(1, 17, 35, 20, 'board'), P(2, 17, 38, 0)], at(17, 38, 0), { opts: { rounding: 'floor' } });
  const b = run(nodes, [P(1, 17, 35, 20, 'board'), P(2, 17, 38, 0)], at(17, 38, 0));
  const i = 7, e = (x) => x.etaMs[i] / 60000 + 540;
  assert.strictEqual(hm(a.arr[i]), Math.floor(e(a) % 1440 + 1e-9)); assert.strictEqual(hm(b.arr[i]), Math.round(e(b)) % 1440);
});

console.log('[승차 전·증거 없음 — 건드리지 않는다]');
t('승차 전(boarded=false)에는 모든 시각이 예정 그대로', () => {
  const r = rideEta({ nowMs: at(17, 30, 0), nodes: scene(), passes: [], boarded: false });
  assert.deepStrictEqual(sceneArr(r), ['17:35', '17:38', '17:40', '17:42', '17:43', '17:45', '17:47']); assert.strictEqual(r.anchorIdx, -1);
});
t('승차 전에는 통과 기록이 있어도(notDeparted) 승차역 이후를 건드리지 않는다', () => {
  const r = rideEta({ nowMs: at(17, 33, 0), nodes: scene(), passes: [P(2, 17, 32, 0)], boarded: true, notDeparted: true });
  assert.deepStrictEqual(sceneArr(r), ['17:35', '17:38', '17:40', '17:42', '17:43', '17:45', '17:47']);
});
t('승차 전 예정이 40분 넘게 지났으면 경로 전체를 지금에 맞춘다(이미 떠난 차를 가리키지 않게)', () => {
  const r = rideEta({ nowMs: at(18, 30, 0), nodes: scene(), passes: [], boarded: false });
  assert.ok(hm(r.arr[1]) >= hm('18:29'), JSON.stringify(r.arr)); assert.strictEqual(hm(r.arr[7]) - hm(r.arr[1]), 12);
});
t('승차했어도 통과 기록이 하나도 없으면 예정 그대로', () => {
  const r = rideEta({ nowMs: at(17, 36, 0), nodes: scene(), passes: [], boarded: true });
  assert.deepStrictEqual(sceneArr(r), ['17:35', '17:38', '17:40', '17:42', '17:43', '17:45', '17:47']);
});

console.log('[기준 시각 — 지연 수준(최근 통과 + 위치 채택 지연 보정)]');
t('정시 운행: 통과가 예정 + 채택 지연(5~70초)으로 찍히면 예정 시각 그대로(채택 지연이 시각을 밀지 않는다)', () => {
  const ps = [P(1, 17, 35, 50, 'board'), P(2, 17, 38, 35), P(3, 17, 40, 40), P(4, 17, 42, 20)];
  const r = run(scene(), ps);
  assert.deepStrictEqual(sceneArr(r).slice(3), ['17:42', '17:43', '17:45', '17:47'], JSON.stringify(r.arr));
});
t('정상 속도(3분 구간을 3분20초)로 통과하면 시각이 그대로 따라간다', () => {
  const r = run(scene(), [P(1, 17, 35, 10, 'board'), P(2, 17, 38, 30)]);
  assert.strictEqual(r.arr[2], '17:38', JSON.stringify(r.arr));
});
t('열차가 실제로 1분 늦으면 그 지연을 따라간다(원인재 17:42 → 17:43, 도착 17:47 → 17:48). 채택은 실제 통과보다 5~70초 늦게 찍히므로 stamp 는 +1.6분', () => {
  const r = run(scene('7호선'), [P(1, 17, 35, 48, 'board'), P(2, 17, 39, 35), P(3, 17, 41, 40)]);
  assert.strictEqual(r.arr[4], '17:43', JSON.stringify(r.arr)); assert.ok(near(r.arr[7], '17:48', 0), JSON.stringify(r.arr)); assert.ok(r.delayMin > 0.6 && r.delayMin < 1.4, 'delayMin ' + r.delayMin);
});
t('채택 stamp 가 예정 + 1분이면(= 실제로는 정시~0.9분 지연) 열차가 1분 늦다고 단정하지 않는다(채택 지연 보정)', () => {
  const r = run(scene('7호선'), [P(1, 17, 35, 48, 'board'), P(2, 17, 39, 0), P(3, 17, 41, 5)]);
  assert.ok(r.delayMin < 1.0, 'delayMin ' + r.delayMin);
});
t('3.5분 늦은 채 달리면 도착예정(예정 17:47)이 17:50 쪽(±1분)을 유지한다', () => {
  const r = run(scene(), [P(1, 17, 38, 0, 'board'), P(2, 17, 41, 10), P(3, 17, 43, 30), P(4, 17, 45, 40)]);
  assert.ok(near(r.arr[7], '17:50', 1), JSON.stringify(r.arr)); assert.ok(r.delayMin > 2.5 && r.delayMin < 4.2, 'delayMin ' + r.delayMin);
});
t('일찍 달리면(3분 일찍) 앞으로의 시각도 그만큼 앞당겨진다(같은 열차 안에서)', () => {
  const r = run(scene(), [P(1, 17, 32, 30, 'board'), P(2, 17, 35, 20), P(3, 17, 37, 25), P(4, 17, 39, 20)]);
  assert.ok(hm(r.arr[7]) <= hm('17:45'), JSON.stringify(r.arr));
});
t('실제 통과 3개 중 한 역이 1분 반 일찍(기지국 선행) 찍혀도 도착예정이 끌려가지 않는다 — 신연수 17:43 유지', () => {
  const ps = [P(1, 17, 35, 48, 'board'), P(2, 17, 38, 5), P(3, 17, 40, 0), P(4, 17, 40, 30, 'cell')];
  const r = run(scene(), ps);
  assert.ok(hm(r.arr[5]) >= hm('17:43'), JSON.stringify(r.arr)); assert.ok(hm(r.arr[7]) >= hm('17:47'), JSON.stringify(r.arr));
});
t('기지국 선행 stamp 하나만 마지막에 있어도 열차가 3.5분 늦다는 판단은 유지된다', () => {
  const ps = [P(1, 17, 38, 0, 'board'), P(2, 17, 41, 10), P(3, 17, 43, 30), P(4, 17, 45, 40), P(5, 17, 44, 40, 'cell')];
  const r = run(scene(), ps);
  assert.ok(near(r.arr[7], '17:50', 1), JSON.stringify(r.arr));
});
t('기지국 선행과 뒤이은 PF 채택이 같은 역에 함께 오면 PF 쪽을 쓴다(선행 stamp 가 끝까지 앞서 고정되지 않는다)', () => {
  const base = [P(1, 17, 35, 48, 'board'), P(2, 17, 38, 5), P(3, 17, 40, 0)];
  const withBoth = run(scene(), base.concat([P(4, 17, 40, 40, 'cell'), P(4, 17, 42, 20, 'pf')]));
  const pfOnly = run(scene(), base.concat([P(4, 17, 42, 20, 'pf')]));
  assert.deepStrictEqual(withBoth.arr, pfOnly.arr); assert.ok(withBoth.notes.some(s => /기지국 선행 대신/.test(s)), withBoth.notes.join(' / '));
});
t('기지국 선행 stamp 만 있을 때는 하한으로만 쓴다: 실제는 stamp 보다 1~3분 뒤라 그 역 시각이 stamp 보다 빨라지지 않는다', () => {
  const r = run(scene(), [P(1, 17, 35, 20, 'board'), P(2, 17, 36, 40, 'cell')]);
  assert.ok(r.etaMs[2] >= at(17, 36, 40), '동막 시각이 선행 stamp 보다 이르다');
  assert.ok(r.arr[2] >= '17:37' || r.arr[2] === '17:37' || hm(r.arr[2]) >= hm('17:37'), JSON.stringify(r.arr));
});

console.log('[승차 직후 — 앵커 하한(구간 소요의 60%)과 정적 시간표 스냅]');
t('승차 52초 뒤 동막 선행 통과가 찍혀도 출발 시각이 탄 시각(17:35)보다 2분 넘게 앞서지 않는다(예전: 17:29)', () => {
  const r = run(scene(), [P(1, 17, 35, 48, 'board'), P(2, 17, 36, 40, 'cell')], at(17, 36, 40), { timetable: { boardIdx: 1, times: [hm('17:29'), hm('17:32'), hm('17:42')] } });
  assert.ok(hm(r.arr[1]) >= hm('17:33'), r.arr[1]); assert.ok(r.arr[1] !== '17:29' && r.arr[2] !== '17:32');
});
t('동막에 실제로 도착하면 원래 시각(17:35 · 동막 17:38)으로 돌아온다', () => {
  const r = run(scene(), [P(1, 17, 35, 48, 'board'), P(2, 17, 38, 5)], at(17, 38, 5));
  assert.ok(near(r.arr[1], '17:35') && near(r.arr[2], '17:38', 0), JSON.stringify(r.arr));
});
t('정적 시간표 스냅: 승차 직후(승차역 뒤 통과 없음)에는 확정 2분 전 이후의 시각표 열차를 쓴다', () => {
  const r = run(scene(), [P(1, 17, 36, 20, 'board')], at(17, 36, 30), { timetable: { boardIdx: 1, times: [hm('17:29'), hm('17:35'), hm('17:42')] } });
  assert.ok(r.notes.some(s => /정적 시간표 스냅/.test(s)), r.notes.join(' / ')); assert.ok(near(r.arr[1], '17:35'), JSON.stringify(r.arr));
});
t('시각표에 확정 2분 전 이후 열차가 없으면 스냅하지 않는다(17:29·17:32 로 끌려가지 않음)', () => {
  const r = run(scene(), [P(1, 17, 35, 48, 'board')], at(17, 35, 50), { timetable: { boardIdx: 1, times: [hm('17:29'), hm('17:32'), hm('17:42')] } });
  assert.ok(!r.notes.some(s => /정적 시간표 스냅/.test(s)), r.notes.join(' / ')); assert.ok(hm(r.arr[1]) >= hm('17:34'), r.arr[1]);
});
t('승차 뒤 통과 기록이 하나라도 생기면 스냅하지 않는다(앵커가 만든 시각을 시각표가 끌어당기지 않음)', () => {
  const r = run(scene(), [P(1, 17, 36, 20, 'board'), P(2, 17, 38, 50)], at(17, 38, 50), { timetable: { boardIdx: 1, times: [hm('17:29'), hm('17:35'), hm('17:42')] } });
  assert.ok(!r.notes.some(s => /정적 시간표 스냅/.test(s)), r.notes.join(' / '));
});

console.log('[기록 없는 역 — 앞뒤 역 사이에 놓이고 순서가 거꾸로 가지 않는다]');
t('통과 기록 없는 역(3·4)이 앞 역(2)과 뒤 역(5) 사이에, 예정 비율로 놓인다', () => {
  const r = run(scene('7호선'), [P(1, 17, 35, 48, 'board'), P(2, 17, 39, 30), P(5, 17, 47, 10)]);
  const a = r.etaMs;
  assert.ok(a[2] <= a[3] && a[3] <= a[4] && a[4] <= a[5], JSON.stringify(r.arr)); assert.ok(a[3] > a[2] && a[4] < a[5] + 1, JSON.stringify(r.arr));
  for (let i = 2; i < 8; i++) assert.ok(r.etaMs[i] >= r.etaMs[i - 1], '순서 ' + JSON.stringify(r.arr));
});
t('표시 순서(노드 순) 시각이 거꾸로 가지 않는다 — 어떤 통과 조합에서도', () => {
  const combos = [
    [P(1, 17, 40, 0, 'board'), P(2, 17, 40, 5), P(3, 17, 40, 10), P(5, 17, 40, 15)],
    [P(1, 17, 30, 0, 'board'), P(3, 17, 31, 0), P(2, 17, 36, 0)],
    [P(2, 17, 50, 0), P(1, 17, 49, 0, 'board')],
    [P(1, 17, 35, 20, 'board'), P(4, 17, 41, 40, 'cell'), P(6, 17, 55, 0)]
  ];
  combos.forEach(ps => { const r = run(scene(), ps); for (let i = 1; i < r.etaMs.length; i++) assert.ok(r.etaMs[i] >= r.etaMs[i - 1], JSON.stringify(r.arr)); });
});
t('앞 역보다 이른 시각으로 들어온 통과(순서 꼬임)는 버린다', () => {
  const r = run(scene(), [P(1, 17, 35, 20, 'board'), P(2, 17, 38, 20), P(3, 17, 36, 0)]);
  assert.ok(r.notes.some(s => /버림/.test(s)), r.notes.join(' / ')); assert.strictEqual(r.anchorIdx, 2);
});

console.log('[자정을 넘는 경로]');
const midScene = () => { const base = 23 * 60 + 50, nodes = [{ name: '출발', isOrigin: true, planMin: base - 4 }]; for (let i = 0; i < 7; i++) nodes.push({ name: 'M' + i, isSub: true, lineName: '7호선', planMin: base + i * 3 }); return nodes; };
t('23:50 승차 · 00:05 통과(planMin 은 1440 이상으로 이어서 센다): 순서가 거꾸로 가지 않고 도착 예정이 하루 전으로 튀지 않는다', () => {
  const nodes = midScene();
  const r = rideEta({ nowMs: at(24, 5, 0), nodes: nodes, boarded: true, passes: [P(1, 23, 55, 0, 'board'), P(4, 24, 5, 0)] });
  const lastMin = Math.round(r.etaMs[7] / 60000 + 540) % 1440, nowM = 5;
  assert.ok(((lastMin - nowM + 1440) % 1440) < 120, JSON.stringify(r.arr));
  for (let i = 1; i < r.etaMs.length; i++) assert.ok(r.etaMs[i] >= r.etaMs[i - 1], JSON.stringify(r.arr));
  assert.ok(/^00:/.test(r.arr[7]) || /^23:/.test(r.arr[7]), r.arr[7]);
});
t('같은 경로를 planMin 을 하루 안으로 접어(00:xx 로) 보내도 결과가 같다', () => {
  const nodes = midScene(), folded = nodes.map(n => Object.assign({}, n, { planMin: n.planMin % 1440 }));
  const ps = [P(1, 23, 55, 0, 'board'), P(4, 24, 5, 0)];
  const a = rideEta({ nowMs: at(24, 5, 0), nodes: nodes, boarded: true, passes: ps }), b = rideEta({ nowMs: at(24, 5, 0), nodes: folded, boarded: true, passes: ps });
  assert.deepStrictEqual(a.arr, b.arr);
});
t('자정 전에 승차 확정, 자정 뒤 통과가 쌓이는 지연 수준도 올바르다(1분 지연)', () => {
  const nodes = midScene();
  const r = rideEta({ nowMs: at(24, 0, 40), nodes: nodes, boarded: true, passes: [P(1, 23, 51, 0, 'board'), P(2, 23, 54, 35), P(3, 23, 57, 40), P(4, 24, 0, 40)] });
  assert.ok(r.delayMin > 0.6 && r.delayMin < 1.4, 'delayMin ' + r.delayMin); assert.ok(hm(r.arr[7]) >= 0 && /^00:/.test(r.arr[7]), JSON.stringify(r.arr));
});

console.log('[환승 — 앞 구간 고정 · 환승 열차는 처음 안내보다 이르지 않게 · 지연은 전파]');
t('첫 열차를 5분 일찍 타도 환승 뒤 열차(라 17:43)는 앞당겨지지 않는다 — 앞 구간은 일찍 간 만큼 앞당겨짐', () => {
  const r = run(xferScene(), [P(1, 17, 30, 0, 'board'), P(2, 17, 33, 20), P(3, 17, 35, 20)]);
  assert.ok(hm(r.arr[5]) >= hm('17:43'), JSON.stringify(r.arr)); assert.ok(hm(r.arr[7]) >= hm('17:48'), JSON.stringify(r.arr));
  assert.ok(hm(r.arr[2]) <= hm('17:36'), '앞 구간은 일찍 간 만큼 앞당겨짐 ' + JSON.stringify(r.arr));
});
t('늦게 타면(3분) 환승 뒤 열차도 같은 만큼 뒤로 밀린다(지연은 그대로 전파)', () => {
  const r = run(xferScene(), [P(1, 17, 38, 0, 'board'), P(2, 17, 41, 20), P(3, 17, 43, 20)]);
  assert.ok(hm(r.arr[5]) >= hm('17:46'), JSON.stringify(r.arr));
});
t('환승해서 탄 열차가 9분 늦어도 이미 지나간 앞 구간 역 시각(가·나·다)은 바뀌지 않는다', () => {
  const nodes = xferScene();
  const leg1 = [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 20), P(3, 17, 40, 20)];
  const before = run(nodes, leg1);
  const after = run(nodes, leg1.concat([P(5, 17, 52, 0, 'board'), P(6, 17, 55, 40)]));
  assert.deepStrictEqual(after.arr.slice(0, 4), before.arr.slice(0, 4), JSON.stringify({ before: before.arr, after: after.arr }));
  assert.ok(hm(after.arr[7]) >= hm('17:56'), '뒤 구간은 지연을 따라간다 ' + JSON.stringify(after.arr));
});
t('앞 구간의 마지막 통과 뒤 역(기록 없음)은 뒤 구간 증거에 끌려가지 않는다', () => {
  const nodes = xferScene();
  const leg1 = [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 20)];                        // 다(3)는 기록 없음
  const a = run(nodes, leg1.concat([P(5, 17, 45, 0, 'board'), P(6, 17, 48, 20)]));
  const b = run(nodes, leg1.concat([P(5, 17, 52, 0, 'board'), P(6, 17, 55, 40)]));
  assert.strictEqual(a.arr[3], b.arr[3], JSON.stringify({ a: a.arr, b: b.arr }));
});
t('환승 뒤 열차를 탔는데 앞 구간 기록이 하나도 없어도 계산이 된다(뒤 구간만의 증거)', () => {
  const r = run(xferScene(), [P(5, 17, 44, 0, 'board'), P(6, 17, 47, 10)]);
  assert.ok(near(r.arr[7], '17:49', 1), JSON.stringify(r.arr)); for (let i = 1; i < r.etaMs.length; i++) assert.ok(r.etaMs[i] >= r.etaMs[i - 1]);
});

console.log('[승차 확정이 늦은 몰림 — 3~6분 늦게 확정되면 직후 통과가 한꺼번에 찍힌다]');
t('17:41 에야 승차 확정(예정 17:35) → 동막·동춘이 5초 간격으로 몰려 찍혀도(몰림) 지연 수준에 반영되지 않는다: 정시 운행이면 도착 17:48 이하', () => {
  const ps = [P(1, 17, 41, 0, 'board'), P(2, 17, 41, 5), P(3, 17, 41, 10), P(4, 17, 42, 30), P(5, 17, 43, 20)];
  const r = run(scene(), ps);
  assert.ok(hm(r.arr[7]) <= hm('17:48'), JSON.stringify(r.arr)); assert.ok(hm(r.arr[5]) <= hm('17:46'), JSON.stringify(r.arr));
  assert.ok(r.notes.some(s => /몰림/.test(s)), r.notes.join(' / '));
});
t('같은 상황에서 몰림 때문에 도착 예정이 17:53(예전 방식: 몰림 stamp 를 그대로 믿을 때)처럼 밀리지 않는다 — 몰림 직후 첫 사건', () => {
  const r = run(scene(), [P(1, 17, 41, 0, 'board'), P(2, 17, 41, 5), P(3, 17, 41, 10)]);
  assert.ok(hm(r.arr[7]) <= hm('17:51'), JSON.stringify(r.arr));            // 승차 확정이 정말 6분 늦은 것인지 열차가 6분 늦은 것인지는 아직 알 수 없다 → 그 사이(최대 3~4분)에서 고른다
});
t('몰림 뒤 첫 실제 통과가 정시면 지연 수준이 정시로 돌아온다', () => {
  const r = run(scene(), [P(1, 17, 41, 0, 'board'), P(2, 17, 41, 5), P(3, 17, 41, 10), P(4, 17, 42, 30)]);
  assert.ok(Math.abs(r.delayMin) < 1, 'delayMin ' + r.delayMin); assert.ok(near(r.arr[7], '17:47', 1), JSON.stringify(r.arr));
});
t('열차가 정말 5분 늦고 승차 확정도 늦었다면(몰림 뒤 실제 통과가 5분 늦음) 5분 지연을 따라간다', () => {
  const ps = [P(1, 17, 41, 30, 'board'), P(2, 17, 41, 35), P(3, 17, 41, 40), P(4, 17, 47, 30), P(5, 17, 48, 20)];
  const r = run(scene(), ps);
  assert.ok(r.delayMin > 4 && r.delayMin < 6, 'delayMin ' + r.delayMin); assert.ok(near(r.arr[7], '17:52', 1), JSON.stringify(r.arr));
});
t('승차 확정이 3~6분 늦고 몰림이 시작될 때, 열차가 실제로 큰 폭으로 늦은 경우(+6분)도 정시 사전값에 갇히지 않는다(2.5분 안쪽)', () => {
  // 실제 열차 +6분: 승차 17:41 출발, 확정 17:45 (4분 늦음), 동막(예정 17:38 → 실제 17:44) 이미 지남 → 확정 5초 뒤 채택
  const r = run(scene(), [P(1, 17, 45, 0, 'board'), P(2, 17, 45, 5)]);
  assert.ok(r.delayMin >= 2.5, 'delayMin ' + r.delayMin);                       // 사전값(0.5분) 근처가 아니라 상한(≈6.9분)과 사전값 사이로 고른다
});
t('승차 확정 시각이 정상(1분 안쪽)이고 다음 역 채택이 정상 간격이면 몰림으로 보지 않는다', () => {
  const r = run(scene(), [P(1, 17, 35, 50, 'board'), P(2, 17, 38, 40)]);
  assert.ok(!r.notes.some(s => /몰림/.test(s)), r.notes.join(' / '));
});

console.log('[증거 종류별]');
t('GPS 통과는 그 시각 그대로(채택 지연 보정 없음)', () => {
  const r = run(scene(), [P(1, 17, 35, 0, 'board'), P(2, 17, 38, 0, 'gps'), P(3, 17, 40, 0, 'gps')]);
  assert.ok(Math.abs(r.delayMin) < 0.3, 'delayMin ' + r.delayMin); assert.strictEqual(r.arr[2], '17:38');
});
t('src 가 없는 통과는 위치 채택(pf)으로 본다', () => {
  const a = run(scene(), [{ idx: 1, ms: at(17, 35, 40), src: 'board' }, { idx: 2, ms: at(17, 38, 35) }]), b = run(scene(), [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 35)]);
  assert.deepStrictEqual(a.arr, b.arr);
});
t('도보·출발 노드에 온 통과 기록과 범위 밖 idx 는 무시한다', () => {
  const r = run(scene(), [{ idx: 0, ms: at(17, 31, 0), src: 'pf' }, { idx: 99, ms: at(17, 31, 0), src: 'pf' }, P(1, 17, 35, 40, 'board'), P(2, 17, 38, 35)]);
  assert.strictEqual(r.anchorIdx, 2);
});

console.log('[안전망]');
t('도착 예정이 이미 지난 시각으로 나오지 않는다(지금보다 앞서면 지금으로)', () => {
  const r = run(scene(), [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 35)], at(18, 10, 0));
  assert.ok(r.etaMs[7] >= at(18, 10, 0), JSON.stringify(r.arr));
});
t('역 이름·planMin 이 일부 비어도 죽지 않는다(planMin 없는 노드는 null)', () => {
  const nodes = scene(); nodes[3].planMin = null; delete nodes[4].name;
  const r = run(nodes, [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 35)]);
  assert.strictEqual(r.arr[3], null); assert.ok(/^\d\d:\d\d$/.test(r.arr[7]));
});
t('빈 입력에도 죽지 않는다', () => { const r = rideEta({}); assert.ok(Array.isArray(r.arr)); assert.doesNotThrow(() => rideEta()); });
t('호출 1000번이 1초 안쪽(순수 계산이라 Worker 에서도 부담이 없다)', () => {
  const ps = [P(1, 17, 35, 48, 'board'), P(2, 17, 39, 0), P(3, 17, 41, 5), P(4, 17, 43, 0), P(5, 17, 44, 30, 'cell')], nodes = scene(), t0 = Date.now();
  for (let i = 0; i < 1000; i++) run(nodes, ps);
  assert.ok(Date.now() - t0 < 2000, (Date.now() - t0) + 'ms');
});

console.log('[시뮬 회귀 — test/fuzz/ride_eta_sim.js 를 짧게 돌려 오라클 편차·규칙 위반을 본다]');
(function () {
  const WALK = new Set(['출발', '도보', '환승']);
  const oracle = (s, x) => { const i0 = x.trueIdx; if (i0 < 0) return null; let tt = s.truthAll[i0]; if (tt == null) return null; for (let i = i0 + 1; i < s.names.length; i++) { const d = s.plan[i] - s.plan[i - 1], start = !WALK.has(s.names[i]) && WALK.has(s.names[i - 1]); tt = start ? Math.max(s.plan[i], tt + d) : tt + d; } return tt; };
  const simRun = (anom, seed, n) => JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'fuzz', 'ride_eta_sim.js'), String(n), String(seed)], { env: Object.assign({}, process.env, { ANOM: anom }), maxBuffer: 1 << 28 }).toString());
  const evaluate = (J) => {
    const dev = []; let mono = 0, past = 0;
    J.out.forEach(s => {
      const ids = s.names.map((nm, i) => WALK.has(nm) ? -1 : i).filter(i => i >= 0);
      s.rec.forEach(x => {
        if (x.err) return;
        for (let k = 1; k < ids.length; k++) { const a = x.tl[ids[k - 1]].split(':'), c = x.tl[ids[k]].split(':'); let d = (+c[0]) * 60 + (+c[1]) - ((+a[0]) * 60 + (+a[1])); if (d < -720) d += 1440; if (d < 0) { mono++; break; } }
        if (x.etaNow < -1 && x.at / 60 < s.destTruth - 1) past++;
        if (x.type === 'board' || WALK.has(s.names[s.names.length - 1])) return;
        const o = oracle(s, x); if (o == null) return;
        let d = s.destTruth + x.etaErr - o; d = ((d + 720) % 1440 + 1440) % 1440 - 720; dev.push(Math.abs(d));
      });
    });
    dev.sort((a, b) => a - b); return { n: dev.length, p90: dev[Math.floor(dev.length * 0.9)], max: dev[dev.length - 1], mono: mono, past: past, errs: J.errs.length };
  };
  [['early,late1,ug,miss,late6,pullback,skip3', 63, '복합(combo)'], ['early,late1', 61, '일찍·늦게'], ['ug', 62, '지하 구간'], ['', 64, '기본']].forEach(c => {
    t('시뮬 ' + c[2] + ' (40개 시나리오): 오라클 편차 p90 ≤ 1.0분 · 최대 ≤ 4분 · 시각 역전 0 · 도착예정이 지난 시각 0 · 오류 0', () => {
      const r = evaluate(simRun(c[0], c[1], 40));
      assert.ok(r.n > 300, 'n=' + r.n); assert.ok(r.p90 <= 1.0, 'p90=' + r.p90.toFixed(2)); assert.ok(r.max <= 4, 'max=' + r.max.toFixed(2));
      assert.strictEqual(r.mono, 0); assert.strictEqual(r.past, 0); assert.strictEqual(r.errs, 0);
    });
  });
})();

console.log('[앱에서 옮겨 온 계산: 연착·승강장 대기·실시간 도착정보]');
t('연착: 다음 역 예정 시각이 지났는데 증거가 없으면 그 역은 지금보다 이르게 나오지 않는다(남은 시간이 0분으로 굳지 않음)', () => {
  const nodes = scene();
  const base = run(nodes, [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 20)], at(17, 38, 30));
  const late = run(nodes, [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 20)], at(17, 41, 10));       // 동춘(예정 17:40)을 지났는데 3번째 역 증거가 없다
  assert.ok(hm(late.arr[3]) >= hm('17:41'), late.arr[3]);
  assert.ok(late.notes.some(x => /연착/.test(x)), late.notes.join(' | '));
  assert.ok(hm(base.arr[3]) <= hm('17:40'), '증거 전엔 밀리지 않는다 ' + base.arr[3]);
});
t('연착은 상태가 없다: 같은 입력을 두 번 불러도 같은 결과(누적해서 밀리지 않음)', () => {
  const nodes = scene(), ps = [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 20)];
  assert.deepStrictEqual(run(nodes, ps, at(17, 42, 0)).arr, run(nodes, ps, at(17, 42, 0)).arr);
});
t('연착 보정은 뒤 역 전체를 밀지 않는다(지하에서 역을 건너뛴 경우 오인 방지): 뒤 역은 앞 역보다 이르지 않게만', () => {
  const nodes = scene(), ps = [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 20)];
  const quiet = run(nodes, ps, at(17, 38, 40)), late = run(nodes, ps, at(17, 41, 30));
  assert.ok(hm(late.arr[7]) - hm(quiet.arr[7]) <= 2, quiet.arr[7] + ' → ' + late.arr[7]);
});
t('승강장 대기: 예정 출발이 1분 넘게 지났으면 승차역부터 지연으로 밀고, 대기 중이 아니면 밀지 않는다', () => {
  const nodes = scene(), now = at(17, 37, 0);                        // 예정 승차 17:35 → 2분 지남
  const w = rideEta({ nowMs: now, nodes: nodes, passes: [], boarded: false, notDeparted: true, platformWaiting: true });
  const n = rideEta({ nowMs: now, nodes: nodes, passes: [], boarded: false, notDeparted: true });
  assert.ok(hm(w.arr[1]) >= hm('17:37'), w.arr[1]); assert.strictEqual(n.arr[1], '17:35');
  assert.ok(hm(w.arr[7]) - hm(n.arr[7]) >= 2, w.arr[7] + ' vs ' + n.arr[7]);
  assert.strictEqual(w.arr[0], n.arr[0]);                              // 승차역 앞(도보)은 그대로
});
t('승강장 대기 + 이미 역에 있음(boardArriveMs=지금): 승차역 시각이 지금으로 끌려와 늦음 증거가 사라지지 않는다', () => {
  const nodes = scene(), now = at(17, 37, 0);
  const w = rideEta({ nowMs: now, nodes: nodes, passes: [], boarded: false, notDeparted: true, platformWaiting: true, boardArriveMs: now });
  assert.ok(hm(w.arr[1]) >= hm('17:37'), w.arr[1]);                    // 예정 17:35 + 2분 지연 → 17:37~38 (지금 + 0.5분)
  assert.ok(hm(w.arr[7]) - hm('17:35') >= 2, w.arr[7]);
});
t("움직임 시작 증거(move): 승차 확정이 4분 늦어도 출발 시각을 알면 지연으로 오해하지 않는다", () => {
  const nodes = scene();
  const mv = run(nodes, [P(1, 17, 35, 20, 'move')], at(17, 39, 0));         // 17:35:20 에 움직임 시작(탐지 지연 ≈20초 → 실제 출발 ≈17:35:00)
  assert.ok(near(mv.arr[1], '17:35', 0) && near(mv.arr[7], nodes[7].planMin ? hmStr(nodes[7].planMin) : '17:49', 1), mv.arr.join(' '));
  assert.ok(Math.abs(mv.delayMin) <= 0.5, 'delay ' + mv.delayMin);
  const bd = run(nodes, [P(1, 17, 39, 0, 'board')], at(17, 39, 0));         // 같은 시각의 '확정'만 있으면 3~6분 늦은 확정일 수도 있어 지연 추정이 갈린다
  assert.notStrictEqual(bd.delayMin, mv.delayMin);
});
t("움직임 시작 증거(move): 탐지 지연만큼 이른 시각으로 보고 뒤 통과(PF)와 함께 쓴다", () => {
  const nodes = scene(), r = run(nodes, [P(1, 17, 36, 0, 'move'), P(2, 17, 38, 50)], at(17, 39, 0));   // 출발 17:35:15 ± , 다음 역 17:38:15 안팎 = 약 +0.3분
  assert.ok(Math.abs(r.delayMin - 0.3) <= 0.5, 'delay ' + r.delayMin);
  assert.ok(r.notes.some(x => /믿을 만한 통과 2개/.test(x)), r.notes.join(' | '));
});
t('승강장 대기 유예(4분)가 끝나면 밀지 않는다(놓침 판단은 앱의 몫)', () => {
  const nodes = scene(), r = rideEta({ nowMs: at(17, 40, 30), nodes: nodes, passes: [], boarded: false, notDeparted: true, platformWaiting: true });
  assert.strictEqual(r.arr[1], '17:35');
});
t('실시간 도착정보: 다음 역을 그 시각으로 맞추고 뒤를 같은 폭만큼 민다(앞 역은 그대로)', () => {
  const nodes = scene(), ps = [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 20)], now = at(17, 38, 30);
  const base = run(nodes, ps, now);
  const lv = run(nodes, ps, now, { live: [{ idx: 3, ms: at(17, 43, 0) }] });                  // 동춘을 17:43 에 도착한다고 알려줌(계산은 ≈17:40)
  assert.ok(near(lv.arr[3], '17:43', 0), lv.arr[3]); assert.strictEqual(lv.arr[2], base.arr[2]);
  assert.ok(hm(lv.arr[7]) - hm(base.arr[7]) >= 2, base.arr[7] + ' → ' + lv.arr[7]);
  const small = run(nodes, ps, now, { live: [{ idx: 3, ms: at(17, 40, 5) }] });               // 차이가 20초 미만이면 무시
  assert.deepStrictEqual(small.arr, base.arr);
});

t('승차 전 다음 차 시각(boardNext): 예정보다 늦은 차는 승차역부터 그만큼 민다, 앞당김은 allowEarlier 일 때만', () => {
  const nodes = scene(), now = at(17, 30, 0), mk = (b) => rideEta({ nowMs: now, nodes: nodes, passes: [], boarded: false, notDeparted: true, boardNext: b });
  const late = mk({ ms: at(17, 38, 0), src: 'table' });
  assert.strictEqual(late.arr[1], '17:38'); assert.strictEqual(late.arr[7], '17:50'); assert.strictEqual(late.arr[0], '17:30');
  assert.strictEqual(mk({ ms: at(17, 32, 0) }).arr[1], '17:35');                                 // 이른 차는 allowEarlier 없으면 무시
  assert.strictEqual(mk({ ms: at(17, 32, 0), allowEarlier: true }).arr[1], '17:32');
  assert.strictEqual(mk({ ms: at(18, 30, 0) }).arr[1], '17:35');                                 // 30분 넘는 대기는 반영 안 함
  assert.strictEqual(mk({ ms: at(18, 30, 0), maxWaitMin: 90 }).arr[1], '18:30');
});
t('승차역 시각은 내가 그 역에 닿는 시각(boardArriveMs)보다 이를 수 없다', () => {
  const nodes = scene(), r = rideEta({ nowMs: at(17, 30, 0), nodes: nodes, passes: [], boarded: false, notDeparted: true, boardArriveMs: at(17, 37, 0) });
  assert.strictEqual(r.arr[1], '17:37'); assert.strictEqual(r.arr[7], '17:49');
  const ok = rideEta({ nowMs: at(17, 30, 0), nodes: nodes, passes: [], boarded: false, notDeparted: true, boardArriveMs: at(17, 33, 0) });
  assert.strictEqual(ok.arr[1], '17:35');
});

console.log('[Worker 진입점 handleRideEta]');
(async () => {
  const mkReq = (method, body) => new Request('https://example.test/ride-eta', { method: method, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)), headers: { 'content-type': 'application/json' } });
  await tAsync('POST JSON → 200 + JSON(arr…) + CORS 헤더', async () => {
    const res = await handleRideEta(mkReq('POST', { nowMs: at(17, 38, 5), nodes: scene(), passes: [P(1, 17, 35, 48, 'board'), P(2, 17, 38, 5)], boarded: true }));
    assert.strictEqual(res.status, 200); assert.strictEqual(res.headers.get('content-type'), 'application/json'); assert.strictEqual(res.headers.get('access-control-allow-origin'), '*');
    const j = await res.json(); assert.strictEqual(j.arr.length, 8); assert.ok(near(j.arr[7], '17:47'), JSON.stringify(j.arr));
  });
  await tAsync('OPTIONS(사전 요청) → 204 + CORS', async () => {
    const res = await handleRideEta(mkReq('OPTIONS'));
    assert.strictEqual(res.status, 204); assert.strictEqual(res.headers.get('access-control-allow-origin'), '*'); assert.ok(/POST/.test(res.headers.get('access-control-allow-methods')));
  });
  await tAsync('GET 은 405, JSON 이 아니면 400(둘 다 JSON 오류 본문 + CORS)', async () => {
    const g = await handleRideEta(new Request('https://example.test/ride-eta')); assert.strictEqual(g.status, 405); assert.strictEqual(g.headers.get('access-control-allow-origin'), '*');
    const b = await handleRideEta(mkReq('POST', '{깨진 json')); assert.strictEqual(b.status, 400); assert.ok((await b.json()).error);
  });
  console.log('\n' + pass + ' 통과, ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})();
