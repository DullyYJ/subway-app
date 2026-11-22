// 버스→버스 환승(내리는 정류장 = 다음 버스 승차 정류장이 한 노드로 합쳐진 경로)에서 환승 정류장에 서서 기다렸다 출발하는 사람을 끝까지 따라간다.
//   배포 엔진(s472) 가상 이동 시험(실제 경로 · 환승 정류장에서 기다리는 사람)에서 찾은 문제:
//   ① 판교→광교중앙(누리1 → 9200 → 80): 환승 정류장(3번)에서 기다리는 동안 영점이 그 정류장의 '통과 시각'을 4초마다 뒤로 밀어, 다음 정류장 도착 예상이 계속 뒤로 밀렸다 →
//      출발해 달려도 4번 영점 창에 못 들어가 마커가 3번에 멈추고 '목적지 1정거장 전'(5_1)이 빠졌다(맨 끝에서 재동기로 건너뜀).
//   ② 동탄→수서(71 → 8302 → 9607 → 강남06): 같은 문제로 '환승 2정거장 전'(7_2)이 8분 늦고 '환승 준비'(7_1)·'목적지 2정거장 전'(10_2)이 빠졌다.
//   ③ 같은 동탄 경로의 7번(환승 하차)과 8번(다음 버스 승차)은 52m — 7번에서 기다리는 사람이 8번 영점 반경 안이라 8번도 통과로 적혀 '목적지 2정거장 전'(10_2)이 4분 일찍 울렸고,
//      달려 들어오는 사람은 8번 쪽을 먼저 150m 안에 들어 7번을 건너뛰었다.
//   고침(엔진 ride-standby): 영점이 한 번 적은 버스→버스 환승 정류장 통과 시각은 더 늦게 다시 쓰지 않고, 환승 정류장 바로 다음 정류장은 다음 버스 시각(계획 소요 − 30초)까지 영점·재동기로 적지 않으며(300m 넘게 벗어나면 탔다),
//   재동기가 150m 안에 붙은 정류장을 고르면 가장 앞 번호부터 적는다.
//   성질: ① 모든 환승·목적지 알림이 실제 통과 앞 60초 ~ 뒤 40초 안에 한 번씩 울린다 ② 현재역이 한 칸씩(건너뛰지 않고) 간다 ③ 위치 기록이 끊겨도(터널) 일찍 울리지 않는다 ④ GPS 잡음에도 같다
// 실행: node test/s473_bus_xfer_wait.test.js
'use strict';
const assert = require('assert');
const path = require('path');
require(path.join(__dirname, '..', 'engine', 'ride-eta.js')).RIDE_ETA_DEFAULTS.nrtEarlySec = 0;
const SB = require(path.join(__dirname, '..', 'engine', 'ride-standby.js'));
const BX = require(path.join(__dirname, 'helpers', 'bus_xfer_scenario.js'));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e && e.message).split('\n').slice(0, 4).join(' | ')); } };

// 알림 키 'N_r' = 노드 N 까지 r 정거장 남음 → 노드 N-r 을 지나는 순간. 실제 통과 시각은 계획 시각(가상 사람은 계획 시각에 정류장에 닿는다).
function check(R, keys, lo, hi, loDest) {
  keys.forEach(([key, node]) => {
    const t0 = R.at(key); assert.ok(t0 != null, key + ' 가 안 울림 ' + JSON.stringify(R.alerts.map(a => a.key + '@' + a.t)));
    const dev = t0 - R.plan[node - 1], l = key.endsWith('_0') ? loDest : lo;
    assert.ok(dev >= l && dev <= hi, key + ' ' + t0 + '초 · 실제 통과(' + (node) + '번 ' + R.plan[node - 1] + '초) 대비 ' + dev + '초 (허용 ' + l + '~' + hi + ')');
  });
  const ks = R.alerts.map(a => a.key); assert.strictEqual(ks.length, new Set(ks).size, '중복 알림 ' + ks);
}
const stepsOk = (R) => { let prev = -1; R.rows.forEach(x => { if (x.ci > prev + 1 && prev >= 0) assert.fail('현재역이 ' + prev + ' → ' + x.ci + ' 로 건너뜀(' + x.t + '초)'); if (x.ci < prev) assert.fail('현재역이 거꾸로(' + prev + ' → ' + x.ci + ', ' + x.t + '초)'); prev = Math.max(prev, x.ci); }); };

console.log('판교→광교중앙 (누리1 → 9200 → 80 · 환승 정류장 3번에서 기다림)');
const PG = BX.run(SB, BX.fixture('pangyo'), { realMove: true });
t('알림이 실제 통과 근처: 3_1(2번) · 5_2(3번) · 5_1(4번) · 5_0(5번)', () => { check(PG, [['3_1', 2], ['5_2', 3], ['5_1', 4], ['5_0', 5]], -60, 40, -80); });
t('마커가 환승 정류장(3번)에서 4번 · 5번으로 한 칸씩 간다 · 안내가 끝난다', () => { stepsOk(PG); assert.ok(PG.doneAt != null, '끝나지 않음'); });
t('환승 정류장에서 기다리는 동안 통과 시각이 뒤로 밀리지 않는다(3번 통과 시각이 처음 닿은 때 근처)', () => {
  const p3 = (PG.state.eta.passes || []).filter(p => p.idx === 3)[0]; assert.ok(p3, '3번 통과 기록 없음');
  const rel3 = Math.round((p3.ms - PG.state.stops.slice().sort((a, b) => a.i - b.i)[0].arrMs) / 1000);
  assert.ok(Math.abs(rel3 - PG.plan[2]) <= 60, '3번 통과 ' + rel3 + '초 · 계획 ' + PG.plan[2] + '초');
});

console.log('동탄→수서 (71 → 8302 → 9607 → 강남06 · 환승 정류장에서 기다림 · 7번과 8번은 52m)');
const DT = BX.run(SB, BX.fixture('dongtan'), { realMove: true });
t('알림이 실제 통과 근처: 4_2 · 4_1 · 7_2 · 7_1 · 10_2 · 10_1 · 10_0', () => { check(DT, [['4_2', 2], ['4_1', 3], ['7_2', 5], ['7_1', 6], ['10_2', 8], ['10_1', 9], ['10_0', 10]], -60, 40, -80); });
t('마커가 7번(환승 하차)을 건너뛰지 않고 한 칸씩 간다', () => { stepsOk(DT); });
t('7번에서 다음 버스(8번)를 기다리는 동안 목적지 2정거장 전(10_2)이 울리지 않는다(다음 버스 시각 − 60초 전까지)', () => {
  assert.ok(DT.at('10_2') >= DT.plan[7] - 60, '10_2 ' + DT.at('10_2') + ' · 8번 계획 ' + DT.plan[7]);
});

console.log('위치 기록이 끊기는 터널 · 잡음');
t('동탄 · 정류장에서 350m 넘게 벗어나면 위치 기록이 없는 터널: 일찍 울리지 않고 모두 한 번씩', () => {
  const R = BX.run(SB, BX.fixture('dongtan'), { realMove: true, gps: (ft, p, S) => Math.min.apply(null, S.map(s => BX.hav(p[0], p[1], s.lat, s.lng))) <= 350 });
  ['4_2', '4_1', '7_2', '7_1', '10_2', '10_1', '10_0'].forEach(k => { assert.ok(R.at(k) != null, k + ' 안 울림 ' + JSON.stringify(R.alerts.map(a => a.key + '@' + a.t))); });
  assert.ok(R.at('10_2') >= R.plan[7] - 60, '10_2 가 너무 일찍 ' + R.at('10_2'));
  const ks = R.alerts.map(a => a.key); assert.strictEqual(ks.length, new Set(ks).size, '중복 ' + ks);
});
t('동탄 · GPS 잡음 8m: 모든 알림이 같은 범위 안', () => { check(BX.run(SB, BX.fixture('dongtan'), { realMove: true, noise: 8 }), [['4_2', 2], ['4_1', 3], ['7_2', 5], ['7_1', 6], ['10_2', 8], ['10_1', 9], ['10_0', 10]], -60, 40, -80); });

console.log('\n' + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
