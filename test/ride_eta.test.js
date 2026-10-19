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
const eng = require(path.join(__dirname, '..', 'engine', 'ride-eta.js')), handleRideEta = eng.handleRideEta;
// ★ 2026-10-19 (YJ: 역 도착 06:38 → 06:38:30 에 도착으로 확정): 엔진 기본값이 '예정 +30초 · 분 내림 표시'로 바뀌었다.
//   아래 기존 시험들은 알고리즘(지연 수준·영점·밀고 당김)을 '예정이 정각(:00) · 가장 가까운 분 표시' 약속으로 짜 두었으므로 그 약속(planSecOffset 0 · round)을 명시해 그대로 돌린다.
//   새 약속은 파일 맨 아래 [도착 :30 규칙] 시험이 따로 본다.
const LEGACY = { planSecOffset: 0, rounding: 'round' };
const rideEta = (inp) => (inp && inp.op) ? eng.rideEta(inp) : eng.rideEta(Object.assign({}, inp, { opts: Object.assign({}, LEGACY, inp && inp.opts) }));
const rideEtaNew = eng.rideEta;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e && e.message).split('\n')[0]); } };
const tAsync = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e && e.message).split('\n')[0]); } };


// ── 표시 이름: 6글자 넘으면 …, 이동 중 문구(2026-10-13 YJ) ──
t('표시 이름 — 6글자 이하는 그대로, 넘으면 앞 6글자 + … (역·정류장·버스 이름), 이동 중 문구는 엔진이 만든다', () => {
  const r = rideEta({ op: 'labels', names: ['동막', '캠퍼스타운', '여섯글자이름', '일곱글자이름이', '송도국제도시역앞'], lines: ['순환43', '인천1호선', '새벽1(송도)', '1234567'] });
  assert.strictEqual(r.max, 6);
  assert.deepStrictEqual(r.labels['동막'], { s: '동막', m: '동막(이동중)' });
  assert.strictEqual(r.labels['캠퍼스타운'].s, '캠퍼스타운');
  assert.strictEqual(r.labels['여섯글자이름'].s, '여섯글자이름');
  assert.deepStrictEqual(r.labels['일곱글자이름이'], { s: '일곱글자이름\u2026', m: '일곱글자이름\u2026(이동중)' });
  assert.strictEqual(r.labels['송도국제도시역앞'].s, '송도국제도시\u2026');
  assert.strictEqual(r.lines['순환43'], '순환43');
  assert.strictEqual(r.lines['인천1호선'], '인천1호선');
  assert.strictEqual(r.lines['새벽1(송도)'], '새벽1(송도\u2026');
  assert.strictEqual(r.lines['1234567'], '123456\u2026');
  const r2 = rideEta({ op: 'labels', names: ['동막'], max: 2, movingSuffix: '(달리는 중)' });
  assert.strictEqual(r2.labels['동막'].m, '동막(달리는 중)');
});


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
t('pos.segs — 앞으로의 구간 목록을 함께 준다(응답이 끊겨도 앱이 시각표대로 이어 그린다)', () => {
  const nodes = scene();
  const r = rideEta({ nowMs: at(17, 36), nodes, passes: [{ idx: 1, ms: at(17, 35), src: 'board' }], boarded: true, timetableFirst: true });
  assert.ok(r.pos && r.pos.segs && r.pos.segs.length >= 5, JSON.stringify(r.pos && r.pos.segs && r.pos.segs.length));
  const sg = r.pos.segs;
  assert.strictEqual(sg[0].from, r.pos.from); assert.strictEqual(sg[0].to, r.pos.to); assert.strictEqual(sg[0].t0, r.pos.t0); assert.strictEqual(sg[0].t1, r.pos.t1);
  for (let i = 1; i < sg.length; i++) { assert.strictEqual(sg[i].from, sg[i - 1].to); assert.ok(sg[i].a >= sg[i - 1].t1 - 1 && sg[i].t1 > sg[i].a); }
  // 5분 뒤에 새로 묻지 않아도, 같은 목록에서 그 시각이 드는 구간을 찾으면 엔진이 5분 뒤에 계산한 위치와 같다
  const later = at(17, 41);
  const fresh = rideEta({ nowMs: later, nodes, passes: [{ idx: 1, ms: at(17, 35), src: 'board' }], boarded: true, timetableFirst: true }).pos;
  const hit = sg.find(s => later < s.t1) || sg[sg.length - 1];
  assert.strictEqual(hit.from, fresh.from); assert.strictEqual(hit.to, fresh.to);
});
// ★ 2026-10-14 (YJ: 인천1호선 시험 — 도착 표시가 15초쯤 늦다 → 중간역은 일찍 도착으로 → 10초였다가 2026-10-15 YJ 요청으로 5초): arriveEarlySec
t('arriveEarlySec — 중간 경로역은 표시 도착 시각보다 5초 일찍 닿은 것으로 본다(승차역·최종 목적지는 그대로, 표시 시각 arr·etaMs 도 그대로)', () => {
  const nodes = scene(), ps = [{ idx: 1, ms: at(17, 35), src: 'gps' }];
  const q = (nowMs, o) => rideEta(Object.assign({ nowMs, nodes, passes: ps, boarded: true, timetableFirst: true }, o || {}));
  const E = q(at(17, 36)).etaMs, E2 = E[2], E3 = E[3];                          // 동막(idx2) · 동춘(idx3) 표시 도착 시각(엔진이 정한 값)
  assert.strictEqual(q(E2 - 7000).pos.from, 1, '동막 도착 7초 전 — 아직 앞 역 쪽');
  assert.strictEqual(q(E2 - 4000).pos.from, 2, '도착 4초 전이면 이미 동막에 닿았다(5초 일찍)');
  assert.strictEqual(q(E2 - 4000).pos.to, 3);
  // 끄면(0) 예전과 같다
  assert.strictEqual(q(E2 - 4000, { opts: { arriveEarlySec: 0 } }).pos.from, 1);
  assert.strictEqual(q(E2 + 1000, { opts: { arriveEarlySec: 0 } }).pos.from, 2);
  // 표시 도착 시각은 그대로
  const a = q(E2 - 4000), b = q(E2 - 4000, { opts: { arriveEarlySec: 0 } });
  assert.deepStrictEqual(a.etaMs, b.etaMs); assert.deepStrictEqual(a.arr, b.arr);
  // 구간 시각: 동막 → 동춘 구간은 5초 일찍 시작하고 5초 일찍 끝난다
  const sg = a.pos.segs[0];
  assert.strictEqual(sg.from, 2); assert.strictEqual(sg.a, E2 - 5000); assert.strictEqual(sg.t0, E2 - 5000 + 20000); assert.strictEqual(sg.t1, E3 - 5000);
  // 앞 구간 끝 = 다음 구간의 도착(a) — 끊기지 않는다
  for (let i = 1; i < a.pos.segs.length; i++) assert.strictEqual(a.pos.segs[i].a, a.pos.segs[i - 1].t1);
  // 최종 목적지(마지막 노드)에는 적용하지 않는다
  const last = a.pos.segs[a.pos.segs.length - 1], nLast = E.length - 1;
  assert.strictEqual(last.to, nLast); assert.strictEqual(last.t1, E[nLast]);
  // 마지막 구간 직전 역은 5초 일찍
  assert.strictEqual(last.a, E[nLast - 1] - 5000);
});
// ★ 2026-10-15 (YJ: "경유역 도착하며 영점을 맞추고, 도착시간을 초 단위로 다시 맞춘 뒤 이후 마커 도착 표시를 5초 당기자"): 당김은 GPS 영점이 잡힌 뒤, 영점 역보다 뒤의 중간역에만
t('arriveEarlySec — GPS 영점이 없으면 당기지 않고(시각표 그대로), 영점이 잡히면 그 역보다 뒤 중간역만 영점으로 맞춘 시각에서 5초 당긴다', () => {
  const nodes = scene(), mk = (ps, nowMs, o) => rideEta(Object.assign({ nowMs, nodes, passes: ps, boarded: true, timetableFirst: true }, o || {}));
  const board = [{ idx: 1, ms: at(17, 35), src: 'board' }];
  const E = mk(board, at(17, 36)).etaMs;
  // 영점 없음(승차 기록뿐) → 도착 시각 4초 전이어도 아직 앞 역(예전엔 5초 일찍 닿은 것으로 봤다)
  assert.strictEqual(mk(board, E[2] - 4000).pos.from, 1, '영점 전엔 당기지 않는다');
  assert.strictEqual(mk(board, E[2] + 1000).pos.from, 2);
  // 약한 증거(move·pf)만 있어도 영점이 아니다
  assert.strictEqual(mk(board.concat([{ idx: 1, ms: at(17, 35), src: 'pf' }]), E[2] - 4000).pos.from, 1);
  // 동막(idx2)에서 GPS 영점이 잡히면: 동막은 통과한 역(바닥)이고, 뒤 동춘(idx3)은 영점으로 맞춘 도착 시각 5초 전에 닿은 것으로 본다
  const zp = board.concat([{ idx: 2, ms: E[2] + 8000, src: 'gps' }]);          // 동막을 8초 늦게 통과
  const r = mk(zp, E[2] + 20000), E3z = r.etaMs[3];
  assert.ok(E3z > E[3] && E3z - E[3] <= 9000, '영점이 뒤 도착 시각을 늦게 통과한 만큼(8초 안쪽) 민다: ' + (E3z - E[3]));
  assert.strictEqual(mk(zp, E3z - 6000).pos.from, 2, '영점으로 맞춘 동춘 도착 6초 전 — 아직 동막');
  assert.strictEqual(mk(zp, E3z - 4000).pos.from, 3, '4초 전이면 동춘에 닿았다(영점 뒤라 5초 일찍)');
  // 영점이 있어도 영점 역 자신의 시각은 당기지 않는다(그 역은 실제 통과 시각이 기준)
  assert.strictEqual(r.pos.segs[0].a, r.etaMs[2], '영점 역은 당기지 않는다');
  assert.strictEqual(r.pos.segs[1].a, r.etaMs[3] - 5000, '영점 뒤 역은 5초 당긴다');
  // 옛 방식으로 되돌리는 스위치
  assert.strictEqual(mk(board, E[2] - 4000, { opts: { arriveEarlyAfterZero: false } }).pos.from, 2);
});
t('pos.segs — 남은 구간 전부를 준다(14구간으로 끊기지 않는다: 26분 뒤 마커가 굳은 실기기 사고)', () => {
  const nodes = [{ name: '출발', isOrigin: true, planMin: BM - 5 }];
  for (let i = 0; i < 40; i++) nodes.push({ name: 'S' + i, isSub: true, lineName: '인천1호선', planMin: BM + i * 2 });
  const r = rideEta({ nowMs: at(17, 36), nodes, passes: [{ idx: 1, ms: at(17, 35), src: 'board' }], boarded: true, timetableFirst: true });
  assert.ok(r.pos.segs.length >= 38, '구간 수 ' + r.pos.segs.length);
  assert.strictEqual(r.pos.segs[r.pos.segs.length - 1].to, 40);
});
t('arriveEarlySec — 환승 장면(두 노선)에서도 중간 역에만 적용되고 구간 시각이 앞뒤로 어긋나지 않는다', () => {
  const nodes = xferScene(), ps = [{ idx: 1, ms: at(17, 35), src: 'board' }];
  const r = rideEta({ nowMs: at(17, 36), nodes, passes: ps, boarded: true, timetableFirst: true }).pos;
  r.segs.forEach(s => { assert.ok(s.t1 >= s.t0 - 1, 't1 ≥ t0 ' + JSON.stringify(s)); assert.ok(s.t1 > s.a); });
  for (let i = 1; i < r.segs.length; i++) assert.strictEqual(r.segs[i].from, r.segs[i - 1].to);
});
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
  const simRun = (anom, seed, n) => JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'fuzz', 'ride_eta_sim.js'), String(n), String(seed)], { env: Object.assign({}, process.env, { ANOM: anom, OPTS: JSON.stringify(LEGACY) }), maxBuffer: 1 << 28 }).toString());
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
t('시각표 기준(timetableFirst): 증거 없이 예정 시각이 지나도 연착으로 밀지 않는다(시각표대로 간다) — 끄면 기존대로 밀림', () => {
  const nodes = scene(), ps = [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 20)];
  const base = run(nodes, ps, at(17, 38, 30)), tf = run(nodes, ps, at(17, 41, 10), { timetableFirst: true }), legacy = run(nodes, ps, at(17, 41, 10));
  assert.ok(hm(tf.arr[3]) <= hm('17:40'), '시각표 기준: ' + tf.arr[3]);
  assert.ok(hm(legacy.arr[3]) >= hm('17:41'), '기존: ' + legacy.arr[3]);
  assert.ok(hm(tf.arr[3]) === hm(base.arr[3]), '증거가 없으면 시각이 그대로 ' + base.arr[3] + ' vs ' + tf.arr[3]);
  assert.ok(tf.notes.some(x => /시각표 기준/.test(x)));
});
t('GPS 가 아직 안 닿았다고 하면(notYet) 시각표 기준에서도 그 정류장을 연착으로 밀고 마커는 그 앞 구간에 둔다 — 증거 없음만으로는 밀지 않는다', () => {
  const nodes = scene(), ps = [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 20)];
  const noEv = run(nodes, ps, at(17, 41, 10), { timetableFirst: true });
  const ny = run(nodes, ps, at(17, 41, 10), { timetableFirst: true, notYet: [3] });
  assert.ok(hm(ny.arr[3]) > hm(noEv.arr[3]) || ny.pos.from < noEv.pos.from, 'notYet 가 시각을 밀거나 마커를 앞 구간에 둔다 ' + noEv.arr[3] + ' → ' + ny.arr[3]);
  assert.ok(ny.pos.from === 2 && ny.pos.to === 3 && ny.pos.moving === true, JSON.stringify(ny.pos));
  assert.ok(ny.notes.some(x => /아직 안 닿았다/.test(x)), ny.notes.join(' | '));
  const other = run(nodes, ps, at(17, 41, 10), { timetableFirst: true, notYet: [5] });
  assert.ok(other.arr[3] === noEv.arr[3], '다음 정류장이 아닌 notYet 는 무시');
});
t('영점(GPS 통과)은 뒤 시각의 기준 — 일찍 닿으면 당기고 늦게 닿으면 민다(밀고 당김), 약한 증거 역은 두 GPS 사이를 예정 비율로 나눈다, 몰림이어도 같은 시각으로 뭉치지 않는다', () => {
  const mid = new Date('2026-10-13T00:00:00+09:00').getTime(), T = (h, m, s) => mid + ((h * 60 + m) * 60 + (s || 0)) * 1000, pl = [null, 18 * 60 + 39, 18 * 60 + 41, 18 * 60 + 43, 18 * 60 + 45, 18 * 60 + 48, 18 * 60 + 53];
  const nodes = ['출발', '계산', '임학', '박촌', '굴현', '계양', '아라'].map((n, i) => ({ name: n, isSub: i > 0 && i < 6, isOrigin: i === 0, lineName: i < 6 ? '1' : '', planMin: pl[i] }));
  const go = (ps, now) => rideEta({ nowMs: now, nodes, passes: ps, boarded: true, timetableFirst: true, tzOffsetMin: 540 });
  const sec = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const g = [{ idx: 1, ms: T(18, 34, 0), src: 'gps' }, { idx: 2, ms: T(18, 36, 0), src: 'gps' }];
  const early = go(g.concat([{ idx: 4, ms: T(18, 38, 30), src: 'gps' }]), T(18, 39, 0));
  assert.ok(early.arr[5] === '18:42' && early.arr[6] === '18:47', '굴현 18:38:30(예정 18:45 → −6.5분) → 계양·아라도 6.5분 당김 ' + early.arr.join(' '));
  const late = go(g.concat([{ idx: 4, ms: T(18, 47, 0), src: 'gps' }]), T(18, 47, 10));
  assert.ok(late.arr[5] === '18:50' && late.arr[6] === '18:55', '굴현 18:47(+2분) → 뒤를 2분 밂 ' + late.arr.join(' '));
  const mid2 = go(g.concat([{ idx: 3, ms: T(18, 40, 20), src: 'pf' }, { idx: 4, ms: T(18, 40, 30), src: 'gps' }]), T(18, 41, 0));
  assert.ok(sec(mid2.arr[3]) >= sec('18:37') && sec(mid2.arr[3]) <= sec('18:39') && mid2.arr[3] !== mid2.arr[4], '두 GPS 사이 약한 증거 역은 예정 비율로 ' + mid2.arr.join(' '));
  const burst = go(g.concat([{ idx: 3, ms: T(18, 40, 10), src: 'pf' }, { idx: 4, ms: T(18, 40, 20), src: 'pf' }]), T(18, 40, 30));
  assert.ok(burst.arr[3] !== burst.arr[4] && sec(burst.arr[3]) < sec(burst.arr[4]), '몰림(10초 간격 PF) — 박촌·굴현이 같은 시각이 아니다 ' + burst.arr.join(' '));
  const off = rideEta({ nowMs: T(18, 39, 0), nodes, passes: g.concat([{ idx: 4, ms: T(18, 38, 30), src: 'gps' }]), boarded: true, timetableFirst: true, tzOffsetMin: 540, opts: { zeroFollow: 0 } });
  assert.ok(off.notes.every(x => !/^영점/.test(x)), '끄면 예전 동작');
});
t('영점은 초 단위까지 뒤 시각을 밀고 당긴다 — GPS 통과가 몇 초 달라지면 뒤 도착 시각(etaMs)도 정확히 그만큼 움직이고, 작은 값이라고 버리지 않는다', () => {
  const mid = new Date('2026-10-13T00:00:00+09:00').getTime(), T = (h, m, s) => mid + ((h * 60 + m) * 60 + (s || 0)) * 1000, pl = [null, 18 * 60 + 39, 18 * 60 + 41, 18 * 60 + 43, 18 * 60 + 45, 18 * 60 + 48, 18 * 60 + 53];
  const nodes = ['출발', '계산', '임학', '박촌', '굴현', '계양', '아라'].map((n, i) => ({ name: n, isSub: i > 0 && i < 6, isOrigin: i === 0, lineName: i < 6 ? '1' : '', planMin: pl[i] }));
  const g = [{ idx: 1, ms: T(18, 34, 0), src: 'gps' }, { idx: 2, ms: T(18, 36, 0), src: 'gps' }];
  const go = (sec, prev) => rideEta({ nowMs: T(18, 47, 0), nodes, passes: g.concat([{ idx: 4, ms: T(18, 46, 0) + sec * 1000, src: 'gps' }]), boarded: true, timetableFirst: true, tzOffsetMin: 540, prevLevelMin: prev });
  const a = go(37), b = go(49), c = go(52);
  // 굴현 예정 18:45:00 → 통과 18:46:37 = +97초. 계양(예정 18:48:00)·아라(18:53:00)는 정확히 +97초
  assert.strictEqual(a.etaMs[5], T(18, 48, 0) + 97000, '계양 = 예정 + 97초 (' + (a.etaMs[5] - T(18, 48, 0)) / 1000 + ')');
  assert.strictEqual(a.etaMs[6], T(18, 53, 0) + 97000);
  assert.strictEqual(b.etaMs[5] - a.etaMs[5], 12000, '통과가 12초 늦으면 뒤도 정확히 12초');
  // 직전에 그린 수준(prevLevelMin)이 비슷해도(0.4분=24초 안) 영점이 있으면 덮어쓰지 않는다
  const d = go(52, a.delayMin);
  assert.strictEqual(d.etaMs[5] - a.etaMs[5], 15000, '이전 값에서 15초 차이도 그대로 반영 ' + (d.etaMs[5] - a.etaMs[5]));
  assert.strictEqual(c.etaMs[6] - a.etaMs[6], 15000);
  assert.ok(Math.abs(a.delayMin - 1.62) < 0.01, 'delayMin=' + a.delayMin);
});
// ★ 2026-10-18 (개선 후보 1순위): 한 구간에서 GPS 통과가 하나뿐이고 기준(그린 수준, 없으면 시각표)에서 8분 넘게 벗어나면 확인될 때까지 참고만 한다 — 잘못 찍힌 GPS 통과 하나가 시각표를 크게 흔들지 못하게. (처음엔 3분이었으나 standby 시뮬 d300(5분 늦은 열차)에서 진짜 지연까지 늦게 따라가 8분으로 올림)
t('영점 보수화 — 혼자인 GPS 통과가 시각표에서 8분 넘게 벗어나면 시각을 안 바꾼다(참고만), 그린 수준과 가깝거나 두 번째 GPS 통과가 오면 따른다, 5분 정도 진짜 지연은 바로 따른다, 0 이면 끔', () => {
  const mid = new Date('2026-10-13T00:00:00+09:00').getTime(), T = (h, m, s) => mid + ((h * 60 + m) * 60 + (s || 0)) * 1000, pl = [null, 18 * 60 + 39, 18 * 60 + 41, 18 * 60 + 43, 18 * 60 + 45, 18 * 60 + 48, 18 * 60 + 53];
  const nodes = ['출발', '계산', '임학', '박촌', '굴현', '계양', '아라'].map((n, i) => ({ name: n, isSub: i > 0 && i < 6, isOrigin: i === 0, lineName: i < 6 ? '1' : '', planMin: pl[i] }));
  const go = (ps, extra) => rideEta(Object.assign({ nowMs: T(19, 2, 0), nodes, passes: ps, boarded: true, timetableFirst: true, tzOffsetMin: 540 }, extra || {}));
  const board = { idx: 1, ms: T(18, 39, 0), src: 'board' };
  const base = go([board]);
  // 굴현(예정 18:45)을 18:54:30(+9.5분)에 통과했다는 GPS 통과 하나뿐
  const solo = [board, { idx: 4, ms: T(18, 54, 30), src: 'gps' }];
  const a = go(solo);
  assert.strictEqual(a.etaMs[5], base.etaMs[5], '혼자인 +9.5분 GPS 통과는 뒤 시각을 바꾸지 않는다(시각표 그대로): ' + (a.etaMs[5] - base.etaMs[5]) / 1000);
  assert.strictEqual(a.etaMs[6], base.etaMs[6]);
  assert.ok(a.notes.some(x => /참고만/.test(x)), a.notes.join(' | '));
  // 앱이 이미 +9.4분을 그려 둔 상태(prevLevelMin)면 가까우니 따른다
  const b = go(solo, { prevLevelMin: 9.4 });
  assert.strictEqual(b.etaMs[5], T(18, 48, 0) + 570000, '그린 수준(+9.4)과 8분 안이라 +9.5분 그대로 반영: ' + (b.etaMs[5] - T(18, 48, 0)) / 1000);
  // 같은 구간에서 두 번째 GPS 통과가 오면 더는 혼자가 아니다 — 예전처럼 따른다
  const c = go(solo.concat([{ idx: 5, ms: T(18, 57, 30), src: 'gps' }]));
  assert.strictEqual(c.etaMs[5], T(18, 57, 30), '두 번째 GPS 통과(계양)가 오면 그 시각을 그대로');
  assert.ok(c.etaMs[6] >= T(18, 53, 0) + 8 * 60000, '뒤(아라)도 예정(18:53)보다 8분 넘게 밀린다: ' + (c.etaMs[6] - T(18, 53, 0)) / 1000);
  // 진짜 지연(+5분)·작은 어긋남(+1.5분)은 혼자여도 바로 따른다 (standby 시뮬 d300 이 이걸 요구)
  const d = go([board, { idx: 4, ms: T(18, 46, 30), src: 'gps' }]);
  assert.strictEqual(d.etaMs[5], T(18, 48, 0) + 90000, '+1.5분은 바로 반영');
  const d5 = go([board, { idx: 4, ms: T(18, 50, 0), src: 'gps' }]);
  assert.strictEqual(d5.etaMs[5], T(18, 48, 0) + 300000, '+5분 지연도 바로 반영');
  // 끄면(0) 예전 동작: 혼자여도 +9.5분을 곧바로 반영
  const e = go(solo, { opts: { zeroSoloMaxMin: 0 } });
  assert.strictEqual(e.etaMs[5], T(18, 48, 0) + 570000, '끄면 예전처럼 곧바로 반영');
});
t('시각표 기준 위치(pos): 도착 시각이 지난 마지막 역에서 정차 뒤 다음 역 도착까지 0→1, 증거 없이 연착으로 멈추지 않는다', () => {
  const nodes = scene(), ps = [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 20)];
  const r0 = run(nodes, ps, at(17, 38, 30), { timetableFirst: true });
  assert.ok(r0.pos && r0.pos.from === 2, JSON.stringify(r0.pos));
  const r1 = run(nodes, ps, at(17, 39, 10), { timetableFirst: true });
  assert.strictEqual(r1.pos.from, 2); assert.strictEqual(r1.pos.to, 3); assert.ok(r1.pos.ratio > 0 && r1.pos.ratio < 1 && r1.pos.moving, JSON.stringify(r1.pos));
  const r2 = run(nodes, ps, at(17, 41, 30), { timetableFirst: true });
  assert.ok(r2.pos.from >= 3, '증거 없이도 시각표대로 지나간다 ' + JSON.stringify(r2.pos));
  assert.ok(!run(nodes, ps, at(17, 41, 30)).pos, 'timetableFirst 가 아니면 pos 없음');
});
t('시각표 기준 위치(pos): 통과 증거가 시각표보다 앞서면 그 역이 바닥이다(뒤로 가지 않는다)', () => {
  const nodes = scene(), ps = [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 20), P(4, 17, 39, 0)];
  const r = run(nodes, ps, at(17, 39, 10), { timetableFirst: true });
  assert.ok(r.pos.from >= 4, JSON.stringify(r.pos));
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
t('중간에 정차·서행으로 지연이 갑자기 4분 생겨도(계단식 변화) 두 번 통과 뒤에는 새 지연을 따른다(변화점 필터)', () => {
  const nodes = scene();
  const a = run(nodes, [P(1, 17, 35, 20), P(2, 17, 38, 15), P(3, 17, 44, 5), P(4, 17, 46, 10)]);   // 3번째 역부터 +4분
  assert.ok(hm(a.arr[7]) >= hm('17:50') && hm(a.arr[7]) <= hm('17:52'), a.arr.join(' '));
  const b = run(nodes, [P(1, 17, 35, 20), P(2, 17, 38, 15), P(3, 17, 40, 15), P(4, 17, 46, 0), P(5, 17, 47, 0)]);   // 4번째 역 앞 구간에서 +4분
  assert.ok(hm(b.arr[7]) >= hm('17:49') && hm(b.arr[7]) <= hm('17:51'), b.arr.join(' '));
  const c = run(nodes, [P(1, 17, 35, 20), P(2, 17, 38, 15), P(3, 17, 40, 15), P(4, 17, 42, 15), P(5, 17, 43, 15)]);   // 정시 운행이면 지연 0 근처 유지
  assert.ok(Math.abs(c.delayMin) <= 0.6 && c.arr[7] === '17:47', c.arr.join(' ') + ' d=' + c.delayMin);
});
t('승강장 대기 유예(4분)가 끝나면 밀지 않는다(놓침 판단은 앱의 몫)', () => {
  const nodes = scene(), r = rideEta({ nowMs: at(17, 40, 30), nodes: nodes, passes: [], boarded: false, notDeparted: true, platformWaiting: true });
  assert.strictEqual(r.arr[1], '17:35');
});
t('실시간 도착정보: 두 역이 같은 방향으로 늦다고 하면 그 지연을 따르고, 앞 역·이미 지난 역은 그대로', () => {
  const nodes = scene(), ps = [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 20)], now = at(17, 38, 30);
  const base = run(nodes, ps, now);
  const lv = run(nodes, ps, now, { live: [{ idx: 3, ms: at(17, 43, 0) }, { idx: 4, ms: at(17, 45, 0) }] });      // 동춘 17:43·원인재 17:45 (계산은 ≈17:40·17:42)
  assert.ok(hm(lv.arr[3]) >= hm('17:42') && hm(lv.arr[4]) >= hm('17:44'), lv.arr.join(' ')); assert.strictEqual(lv.arr[2], base.arr[2]);
  assert.ok(hm(lv.arr[7]) - hm(base.arr[7]) >= 2, base.arr[7] + ' → ' + lv.arr[7]);
  assert.ok(lv.notes.some(x => /실시간 도착정보 2건/.test(x)), lv.notes.join(' | '));
});
t('실시간 도착정보: 하나만 통과 기록과 크게 어긋나면(엉뚱한 열차일 수 있음) 절반만 따르지 않고 기록 쪽을 지킨다 — 이상치 혼합', () => {
  const nodes = scene(), ps = [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 20), P(3, 17, 40, 20)], now = at(17, 40, 30);
  const base = run(nodes, ps, now);
  const odd = run(nodes, ps, now, { live: [{ idx: 4, ms: at(17, 47, 0) }] });                  // 통과가 정시인데 다음 역만 +5분 — 뒤차를 집었을 가능성
  assert.ok(Math.abs(hm(odd.arr[4]) - hm(base.arr[4])) <= 1.01, base.arr[4] + ' → ' + odd.arr[4]);
  const small = run(nodes, ps, now, { live: [{ idx: 4, ms: at(17, 42, 10) }] });                // 거의 같은 값은 정상 반영(±1분 이내)
  assert.ok(Math.abs(hm(small.arr[4]) - hm(base.arr[4])) <= 1);
  const old = run(nodes, ps, now, { live: [{ idx: 4, ms: at(17, 47, 0) }], opts: { liveHmm: 0 } });   // 옛 방식(뒤를 통째로 밈)은 옵션으로 남아 있다
  assert.ok(hm(old.arr[4]) - hm(base.arr[4]) >= 4, old.arr[4]);
});

t('실시간 도착정보 후보가 여럿이면(앞차·내 열차·뒤차) 통과 기록과 맞는 열차를 내 열차로 고른다', () => {
  const nodes = scene(), ps = [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 20), P(3, 17, 43, 20)], now = at(17, 43, 30);   // 동춘부터 3분 늦어 달린다
  const base = run(nodes, ps, now);
  const withC = run(nodes, ps, now, { live: [{ idx: 4, ms: at(17, 42, 10) }, { idx: 4, ms: at(17, 45, 10) }, { idx: 4, ms: at(17, 49, 40) }] });   // 앞차 / 내 열차(예정 17:42 + 3분) / 뒤차
  assert.ok(Math.abs(hm(withC.arr[4]) - hm('17:45')) <= 1, base.arr[4] + ' → ' + withC.arr[4]);
  assert.ok(Math.abs(hm(withC.arr[7]) - hm(base.arr[7])) <= 1.01, base.arr[7] + ' → ' + withC.arr[7]);       // 이미 지연을 아는 상태라 크게 바뀌지 않는다
  const only = run(nodes, [P(1, 17, 35, 40, 'board'), P(2, 17, 38, 20)], at(17, 38, 30), { live: [{ idx: 3, ms: at(17, 40, 5) }, { idx: 3, ms: at(17, 44, 10) }] });   // 정시 통과 + 후보 둘(정시 / 뒤차 +4분)
  assert.ok(Math.abs(hm(only.arr[3]) - hm('17:40')) <= 1, only.arr.join(' '));
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

t('지연 수준이 그려진 값과 0.4분 안이면 그린 값을 유지한다(시각이 1분씩 흔들리지 않게), 넘으면 따라간다', () => {
  const nodes = scene(), base = { nowMs: at(17, 38, 5), nodes: nodes, passes: [P(1, 17, 35, 48, 'board'), P(2, 17, 38, 5)], boarded: true };
  const r0 = rideEta(base), d0 = r0.delayMin;
  const r1 = rideEta(Object.assign({}, base, { prevLevelMin: d0 + 0.25, prevAnchorIdx: r0.anchorIdx }));
  assert.ok(Math.abs(r1.delayMin - (d0 + 0.25)) < 1e-6, '유지 ' + d0 + ' → ' + r1.delayMin);
  const r2 = rideEta(Object.assign({}, base, { prevLevelMin: d0 + 1.5, prevAnchorIdx: r0.anchorIdx }));
  assert.ok(Math.abs(r2.delayMin - d0) < 1e-6, '크게 다르면 새 값 ' + r2.delayMin);
  const r3 = rideEta(Object.assign({}, base, { prevLevelMin: d0 + 0.25, prevAnchorIdx: r0.anchorIdx + 3 }));
  assert.ok(Math.abs(r3.delayMin - d0) < 1e-6, '앞선 앵커의 값은 쓰지 않는다');
});

console.log('[Worker 진입점 handleRideEta]');
// ★ 2026-10-16 (YJ: "도착하면 마커가 바로 다음역으로 넘어간다 — GPS 영점을 고려해서 10초 정차(노란색) 후 이동"): hold / markerDwellSec / stopDwellSec 10 → 2026-10-19 YJ: 각 역 12초 문 열림(지하철만 · 버스는 GPS 기준이라 정차 없음)
t('hold — 영점(gps) 통과 역에서 통과 시각 + 20초 동안 정차로 알린다(시각표 기준이 아니어도) · 끝나면 없다 · 승차 확정/기지국/목적지는 세우지 않는다', () => {
  const nodes = scene(), ps = [{ idx: 1, ms: at(17, 35), src: 'board' }, { idx: 2, ms: at(17, 38, 20), src: 'gps' }];
  const q = (nowMs, o) => rideEta(Object.assign({ nowMs, nodes, passes: ps, boarded: true }, o || {}));    // timetableFirst 아님
  const E = q(at(17, 38, 25)).etaMs, pass = at(17, 38, 20);
  assert.strictEqual(E[2], pass, '영점이면 그 역의 시각은 실제 통과 시각');
  const h = q(pass + 3000).hold; assert.ok(h, 'hold'); assert.strictEqual(h.idx, 2); assert.strictEqual(h.src, 'gps'); assert.strictEqual(h.untilMs, pass + 20000);
  assert.strictEqual(q(pass + 19900).hold.idx, 2); assert.strictEqual(q(pass + 20100).hold, null, '20초 뒤엔 이동');
  assert.strictEqual(q(pass - 5000).hold, null, '아직 안 닿았다');
  assert.strictEqual(rideEta({ nowMs: at(17, 35, 5), nodes, passes: [{ idx: 1, ms: at(17, 35), src: 'board' }], boarded: true }).hold, null, '승차 확정은 도착이 아니다');
  assert.strictEqual(rideEta({ nowMs: at(17, 36), nodes, passes: [{ idx: 2, ms: at(17, 35, 58), src: 'cell' }], boarded: true }).hold, null, '기지국 선행은 도착이 아니다');
  const nLast = nodes.length - 1;
  assert.strictEqual(rideEta({ nowMs: at(17, 50, 3), nodes, passes: [{ idx: 1, ms: at(17, 35), src: 'board' }, { idx: nLast, ms: at(17, 50), src: 'gps' }], boarded: true }).hold, null, '목적지는 세우지 않는다');
  assert.strictEqual(q(pass + 3000, { opts: { markerDwellSec: 0 } }).hold, null, '끄면 없다');
  // 위치 채택(pf)은 실제보다 늦게 찍힌다 — 그래도 '기록한 시각'부터 20초는 그 역에 세운다(정차 없이 다음 역으로 넘어가 보이지 않게)
  const pfp = at(17, 40, 0), qp = (nowMs) => rideEta({ nowMs, nodes, passes: [{ idx: 1, ms: at(17, 35), src: 'board' }, { idx: 2, ms: pfp, src: 'pf' }], boarded: true }).hold;
  assert.strictEqual(qp(pfp + 2000).idx, 2); assert.strictEqual(qp(pfp + 2000).src, 'pf'); assert.strictEqual(qp(pfp + 2000).atMs, pfp); assert.strictEqual(qp(pfp + 2000).untilMs, pfp + 20000);
  assert.strictEqual(qp(pfp + 20500), null);
});
t('stopDwellSec 20 — 시각표 기준 위치(pos)에서도 도착 뒤 20초만 역 위에 머문다', () => {
  const nodes = scene(), ps = [{ idx: 1, ms: at(17, 35), src: 'gps' }];
  const base = rideEta({ nowMs: at(17, 36), nodes, passes: ps, boarded: true, timetableFirst: true }), E2 = base.etaMs[2] - 5000;
  const a = rideEta({ nowMs: E2 + 18000, nodes, passes: ps, boarded: true, timetableFirst: true }).pos, b = rideEta({ nowMs: E2 + 24000, nodes, passes: ps, boarded: true, timetableFirst: true }).pos;
  assert.strictEqual(a.from, 2); assert.strictEqual(a.ratio, 0, '20초 안 — 정차'); assert.ok(b.ratio > 0, '20초 뒤 — 이동');
});
t('버스 정류장에는 정차(20초)를 두지 않는다 — hold 없음 · pos 는 도착하자마자 이동(GPS 기준)', () => {
  const nodes = scene().map((n, i) => (i === 2 ? Object.assign({}, n, { isBus: true, isSub: false }) : n)), ps = [{ idx: 1, ms: at(17, 35), src: 'gps' }, { idx: 2, ms: at(17, 38, 20), src: 'gps' }];
  assert.strictEqual(rideEta({ nowMs: at(17, 38, 23), nodes, passes: ps, boarded: true }).hold, null, '버스 정류장은 hold 없음');
  const sub = rideEta({ nowMs: at(17, 38, 23), nodes: scene(), passes: ps, boarded: true }).hold;
  assert.ok(sub && sub.idx === 2, '지하철 역은 hold 가 있다(대조)');
});
t('버스도 지하철처럼 — 실제 통과가 계획보다 일찍/늦으면 남은 정류장 시각이 같이 당겨지고 밀린다(통과가 확정된 정류장은 실제 시각 그대로)', () => {
  const B0 = 5 * 60 + 10, offs = [0, 2, 4, 6, 8, 10, 12];
  const nodes = [{ name: '출발', isOrigin: true, planMin: B0 - 5 }].concat(offs.map((o, i) => ({ name: '정' + i, isBus: true, lineName: 'N30', planMin: B0 + o })));
  const run = (nowMs, ps) => rideEta({ nowMs, nodes, passes: [{ idx: 1, ms: at(5, 10, 30), src: 'board' }].concat(ps), boarded: true }).etaMs;
  const plan = run(at(5, 11), []);
  const early = run(at(5, 11, 40), [{ idx: 3, ms: at(5, 11, 30), src: 'gps' }]);
  for (let i = 4; i <= 7; i++) assert.ok(plan[i] - early[i] >= 90000 && plan[i] - early[i] <= 120000, '정' + (i - 1) + ' 1분 40초쯤 당겨짐 ' + (plan[i] - early[i]));
  assert.strictEqual(early[3], at(5, 11, 30), '통과한 정류장은 실제 통과 시각 그대로(확정)');
  for (let i = 2; i <= 7; i++) assert.ok(early[i] > early[i - 1], '시각은 정류장 순서대로 늘어난다(' + i + ')');
  const late = run(at(5, 16, 40), [{ idx: 3, ms: at(5, 16, 0), src: 'gps' }]);
  for (let i = 4; i <= 7; i++) assert.ok(late[i] - plan[i] >= 160000 && late[i] - plan[i] <= 200000, '정' + (i - 1) + ' 3분쯤 밀림 ' + (late[i] - plan[i]));
});
// ★ 2026-10-16 (YJ: 탑승 → 환승 → 도착 버튼 줄): op 'row' — 어떤 칸이 보이고 어떻게 전환하는지는 엔진이 정한다
t('row — 확정 전 none · 확정 뒤 탑승 · 첫 구간을 타면 환승(남은 구간 있을 때) · 마지막 구간까지 타면 도착', () => {
  const row = (locked, done, prev) => rideEta({ op: 'row', locked, legs: done.map(d => ({ done: d })), prev });
  assert.strictEqual(row(false, [false, false]).slot, 'none'); assert.strictEqual(row(false, [false]).cols, 2);
  const a = row(true, [false, false]); assert.strictEqual(a.slot, 'board'); assert.strictEqual(a.label, '탑승'); assert.strictEqual(a.leg, 0); assert.strictEqual(a.cols, 3); assert.strictEqual(a.transfers, 1);
  const b = row(true, [true, false]); assert.strictEqual(b.slot, 'transfer'); assert.strictEqual(b.label, '환승'); assert.strictEqual(b.leg, 1);
  const c = row(true, [true, true]); assert.strictEqual(c.slot, 'arrive'); assert.strictEqual(c.label, '도착'); assert.strictEqual(c.leg, -1);
  const d = row(true, [true, false, false]); assert.strictEqual(d.slot, 'transfer'); assert.strictEqual(d.leg, 1, '환승이 둘이면 두 번째 구간 탑승 전까지 환승');
  assert.strictEqual(row(true, [true, true, false]).slot, 'transfer'); assert.strictEqual(row(true, [true, true, false]).leg, 2);
  assert.strictEqual(row(true, [true]).slot, 'arrive', '환승 없는 경로는 탑승 뒤 바로 도착'); assert.strictEqual(row(true, [false]).transfers, 0);
  assert.strictEqual(row(true, []).slot, 'none', '대중교통 구간이 없으면 칸 없음');
  assert.strictEqual(row(true, [false, true]).slot, 'board', '앞 구간을 안 탔으면 뒤 구간 기록은 보지 않는다');
});
t('row — 전환 종류: 생성(오른쪽에서 밀기) · 환승(위에서 내려옴) · 도착(아래에서 올라옴) · 되돌리기는 반대', () => {
  const k = (prev, locked, done) => rideEta({ op: 'row', locked, legs: done.map(d => ({ done: d })), prev }).anim;
  assert.strictEqual(k('none', true, [false, false]).kind, 'push_in'); assert.ok(k('none', true, [false, false]).ms > 0);
  assert.strictEqual(k('board', true, [true, false]).kind, 'slide_down');
  assert.strictEqual(k('transfer', true, [true, true]).kind, 'slide_up');
  assert.strictEqual(k('board', true, [true]).kind, 'slide_up', '환승 없는 경로: 탑승 → 도착');
  assert.strictEqual(k('transfer', true, [false, false]).kind, 'slide_up', '탑승 되돌림');
  assert.strictEqual(k('arrive', true, [true, false]).kind, 'slide_down', '도착 되돌림');
  assert.strictEqual(k('board', false, [false, false]).kind, 'push_out', '경로 취소');
  assert.strictEqual(k('board', true, [false, false]).kind, 'none'); assert.strictEqual(k('board', true, [false, false]).ms, 0);
  assert.strictEqual(k(null, true, [false]).kind, 'push_in'); assert.strictEqual(k('엉뚱', true, [false]).kind, 'push_in');
  assert.strictEqual(k('board', true, [true, false]).ease.length, 4);
});
// ── 도착 전 순서(op:'arrive') — 기준은 최종 목적지가 아니라 '마지막 대중교통 하차'(2026-10-17 YJ) ──
const NOW0 = Date.UTC(2026, 9, 16, 9, 0, 0);           // KST 2026-10-16(금) 18:00
const mn = (m) => NOW0 + m * 60000;
// 지하철 3정거장 + 도보 10분(마지막 하차 뒤 걸어서 목적지)
const arrNodes = () => [
  { isOrigin: true, name: '출발', ms: null },
  { isSub: true, lineName: '2호선', name: 'A', ms: mn(5) }, { isSub: true, lineName: '2호선', name: 'B', ms: mn(8) },
  { isSub: true, lineName: '2호선', name: 'C', ms: mn(11) }, { isSub: true, lineName: '2호선', name: 'D', ms: mn(14) },
  { isWalk: true, name: '도보', ms: mn(24) }, { name: '목적지', isWalk: true, ms: mn(24) }
];
const arrive = (o) => rideEta(Object.assign({ op: 'arrive', nowMs: NOW0, nodes: arrNodes(), idx: 1, riding: true }, o || {}));
t('arrive — 하차 기준은 마지막 대중교통(D)이다. 뒤의 도보 10분이 있어도 목적지 도착 시각을 쓰지 않는다', () => {
  const r = arrive(); assert.strictEqual(r.ok, true); assert.strictEqual(r.alight.name, 'D'); assert.strictEqual(r.alight.ms, mn(14));
  assert.strictEqual(r.reco.fromMs, mn(14) - 7 * 60000, '하차 7분 전부터 추천'); assert.ok(r.reco.untilMs > mn(14));
  assert.strictEqual(r.reco.untilMs, mn(14) + 30000, '도착 30초 뒤까지'); assert.strictEqual(r.reco.ttlMs, 25 * 60000, '묵은 추천은 25분 뒤 숨김'); assert.strictEqual(r.reco.holdMs, 30000, '하단 줄은 보인 뒤 30초는 그대로(깜박임 방지 · 엔진이 정한 값)');
});
t('arrive — 두 정거장 전 level 2 · 한 정거장 전 level 1 · 그 앞은 0 (마지막 구간을 타는 중일 때만)', () => {
  assert.strictEqual(arrive({ idx: 1 }).level, 0); assert.strictEqual(arrive({ idx: 1 }).left, 3); assert.strictEqual(arrive({ idx: 1 }).pre, 1, '세 정거장 전 = 알약 깜박임 신호');
  assert.strictEqual(arrive({ idx: 2 }).level, 2); assert.strictEqual(arrive({ idx: 2 }).left, 2);
  assert.strictEqual(arrive({ idx: 3 }).level, 1); assert.strictEqual(arrive({ idx: 4 }).level, 1);
  assert.strictEqual(arrive({ idx: 3, riding: false }).level, 0, '타기 전·걷는 중이면 0'); assert.strictEqual(arrive({ idx: 3, hold: true }).level, 0, '환승 승차 대기면 0');
});
t('arrive — 환승 경로: 앞 구간을 타는 중에는 마지막 구간 단계가 아니다(level 0, left null)', () => {
  const nodes = [{ isOrigin: true, ms: null }, { isSub: true, lineName: '1호선', name: 'P', ms: mn(4) }, { isSub: true, lineName: '1호선', name: 'Q', ms: mn(8) },
    { isBus: true, lineName: '30번', name: 'R', ms: mn(12) }, { isBus: true, lineName: '30번', name: 'S', ms: mn(16) }, { isBus: true, lineName: '30번', name: 'T', ms: mn(20) }];
  const a = rideEta({ op: 'arrive', nowMs: NOW0, nodes, idx: 2, riding: true }); assert.strictEqual(a.alight.name, 'T'); assert.strictEqual(a.level, 0); assert.strictEqual(a.left, null);
  const b = rideEta({ op: 'arrive', nowMs: NOW0, nodes, idx: 4, riding: true }); assert.strictEqual(b.level, 1); assert.strictEqual(b.legStart, 3);
});
t('arrive — 내릴 준비 문구는 엔진이 날짜·시간·날씨에 맞춰 준다(금요일 저녁 · 비 · 월급날 · 주말)', () => {
  const fri = arrive({ idx: 3 }); assert.strictEqual(fri.getoff.title, '내릴 준비를 해주세요'); assert.ok(/주말|금요일|고생/.test(fri.getoff.cheer), fri.getoff.cheer);
  assert.ok(/빗길|우산|비 오는/.test(arrive({ idx: 3, wx: { rainy: true } }).getoff.cheer));
  assert.ok(/눈/.test(arrive({ idx: 3, wx: { snowy: true } }).getoff.cheer));
  const sat = rideEta({ op: 'arrive', nowMs: Date.UTC(2026, 9, 17, 3, 0, 0), nodes: arrNodes().map(n => Object.assign({}, n, { ms: n.ms == null ? null : n.ms - NOW0 + Date.UTC(2026, 9, 17, 3, 0, 0) })), idx: 3, riding: true }); // 토요일 낮 12시
  assert.ok(/주말|쉬는 날/.test(sat.getoff.cheer), sat.getoff.cheer);
  assert.strictEqual(arrive({ idx: 3 }).getoff.cheer, arrive({ idx: 3 }).getoff.cheer, '같은 시각엔 같은 문구');
});
t('arrive — 하차 판정 3분 뒤 앱 종료 시각(quitAtMs). 판정 시각은 한 번 정해지면 안 움직인다', () => {
  const a = arrive({ idx: 4, alighted: false }); assert.strictEqual(a.alighted, false); assert.strictEqual(a.quitAtMs, null);
  const b = arrive({ idx: 5, alighted: true }); assert.strictEqual(b.alighted, true); assert.strictEqual(b.alightedAt, NOW0); assert.strictEqual(b.quitAtMs, NOW0 + 180000);
  const c = arrive({ nowMs: NOW0 + 60000, idx: 5, alighted: true, alightedAt: NOW0 }); assert.strictEqual(c.quitAtMs, NOW0 + 180000, '다시 물어도 처음 판정 + 3분');
  assert.strictEqual(arrive({ idx: 5 }).alighted, true, '진행 노드가 하차 노드를 지났으면 하차로 본다');
  assert.strictEqual(arrive({ idx: 4, alighted: true, quitAfterSec: 60 }).quitAtMs, NOW0 + 60000);
});
t('arrive — 값이 모자라면 ok:false 로 답한다(앱은 그리지 않는다) · nextAtMs 는 다음 경계 시각', () => {
  assert.strictEqual(rideEta({ op: 'arrive', nowMs: NOW0, nodes: [{ isWalk: true, ms: mn(3) }] }).ok, false);
  assert.strictEqual(rideEta({ op: 'arrive', nowMs: NOW0, nodes: [{ isSub: true, name: 'X', ms: null }] }).ok, false);
  assert.strictEqual(rideEta({ op: 'arrive', nowMs: NOW0, nodes: [] }).ok, false);
  assert.strictEqual(arrive().nextAtMs, mn(14) - 7 * 60000, '추천 시작 시각이 다음 경계');
  assert.strictEqual(arrive({ nowMs: mn(8) }).nextAtMs, mn(14) + 30000, '추천 끝 시각이 다음 경계');
});
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
  console.log('[도착 :50 규칙 · 20초 정차 — 2026-10-19 YJ]');
  t('시각표 도착이 06:38 이면 06:38:50 에 도착으로 확정한다(예정 +50초) — 화면에는 그대로 06:38', () => {
    const nodes = scene(), ps = [];       // 통과 기록 없음 = 예정 그대로
    const a = rideEtaNew({ nowMs: at(17, 36), nodes, passes: ps, boarded: true }), b = rideEta({ nowMs: at(17, 36), nodes, passes: ps, boarded: true });
    for (let i = 2; i < nodes.length; i++) if (a.etaMs[i] != null) { assert.strictEqual(a.etaMs[i] - b.etaMs[i], 50000, i + '번 노드 +50초'); assert.strictEqual(a.arr[i], b.arr[i], i + '번 노드 표시는 같은 분'); }
    const m = (x) => ((x % 60000) + 60000) % 60000; assert.strictEqual(m(a.etaMs[2]), 50000, '분의 50초');
  });
  t('도착 06:38:50 → 20초 정차(06:39:10 까지)는 역 위(ratio 0), 그 뒤 이동 · GPS 영점이 잡히면 그 통과 시각이 우선(예정 :50 이 아니다)', () => {
    const nodes = scene(), ps = [{ idx: 1, ms: at(17, 35), src: 'gps' }];
    const base = rideEtaNew({ nowMs: at(17, 36), nodes, passes: ps, boarded: true, timetableFirst: true, opts: { arriveEarlySec: 0 } }), E2 = base.etaMs[2];
    const a = rideEtaNew({ nowMs: E2 + 18000, nodes, passes: ps, boarded: true, timetableFirst: true, opts: { arriveEarlySec: 0 } }).pos;
    const b = rideEtaNew({ nowMs: E2 + 24000, nodes, passes: ps, boarded: true, timetableFirst: true, opts: { arriveEarlySec: 0 } }).pos;
    assert.strictEqual(a.from, 2); assert.strictEqual(a.ratio, 0, '20초 안 — 정차'); assert.ok(b.ratio > 0, '20초 뒤 — 이동');
    const z = rideEtaNew({ nowMs: E2 + 3000, nodes, passes: [{ idx: 1, ms: at(17, 35), src: 'gps' }, { idx: 2, ms: E2 - 20000, src: 'gps' }], boarded: true });
    assert.strictEqual(z.etaMs[2], E2 - 20000, '영점은 실제 통과 시각 그대로');
  });
  t('도착 :50 은 옵션으로 끈다(planSecOffset 0) · 표시 내림/반올림도 옵션', () => {
    const nodes = scene(), ps = [];
    const o = rideEtaNew({ nowMs: at(17, 36), nodes, passes: ps, boarded: true, opts: { planSecOffset: 0 } }), n = rideEtaNew({ nowMs: at(17, 36), nodes, passes: ps, boarded: true });
    assert.strictEqual(n.etaMs[2] - o.etaMs[2], 50000);
  });

  console.log('\n' + pass + ' 통과, ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})();
