// 지하철 → 버스 환승에서 환승 역 근처 정류장에 서서 버스를 기다렸다 타는 사람을 끝까지 따라간다.
//   배포 엔진(s473) 가상 이동 시험(공휴일 12/25 10:00 의정부→홍대입구: 1호선 → 1102 → 7101 · 실제 서비스가 만든 상태)에서 찾은 문제:
//   도봉산역(4번 · 1호선)과 도봉산역(중)(5번 · 1102 승차)은 95m — 내려서 정류장에서 버스를 9분 기다리는 동안 영점이 4번의 '통과 시각'을 531 → 678 → 855초로 계속 뒤로 다시 써
//   (지하철이 늦은 것으로 보아) 5번 버스 도착 예상이 1080 → 1462초로 밀렸고, 실제 버스가 1080초에 5번을 지나 달려도 5번 영점 창에 못 들어가 마커가 4번에 멈췄다 —
//   '환승 2정거장 전'(종로2가 8_2)이 330초 늦게, '1정거장 전'(8_1)은 아예 빠지고(잡음 8m) 안내가 6분 뒤처졌다.
//   고침(엔진 ride-standby): ① 버스→버스 환승 정류장 규칙(s473: 통과 시각 되쓰기 금지 · 다음 승차 정류장은 다음 버스 시각까지 영점으로 안 적음)을 지하철→버스 환승에도 적용
//   ② 그 보류가 풀릴 때(환승 역 300m 안에 아직 서 있음) 승차 정류장 통과 시각은 서 있던 자리에서 앞당겨 잡힌 순간이 아니라 풀리는 시각 이후로 적는다.
//   성질: ① 모든 환승·목적지 알림이 실제 통과 앞 60초 ~ 뒤 40초 안에 한 번씩 울린다 ② 현재역이 한 칸씩(건너뛰지도 거꾸로 가지도 않고) 간다 ③ 환승 역의 통과 시각이 처음 닿은 때 근처에 머문다.
// 실행: node test/s474_sub_bus_xfer_wait.test.js
'use strict';
const assert = require('assert');
const path = require('path');
require(path.join(__dirname, '..', 'engine', 'ride-eta.js')).RIDE_ETA_DEFAULTS.nrtEarlySec = 0;
const SB = require(path.join(__dirname, '..', 'engine', 'ride-standby.js'));
const BX = require(path.join(__dirname, 'helpers', 'bus_xfer_scenario.js'));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e && e.message).split('\n').slice(0, 4).join(' | ')); } };

// 알림 키 'N_r' = 노드 N 까지 r 정거장 남음 → 노드 N-r 을 지나는 순간. 실제 통과 시각은 계획 시각(가상 사람은 계획 시각에 정류장에 닿는다).
const KEYS = [['4_2', 2], ['4_1', 3], ['8_2', 6], ['8_1', 7], ['15_2', 13], ['15_1', 14], ['15_0', 15]];
function check(R, lo, hi, loDest) {
  KEYS.forEach(([key, node]) => {
    const t0 = R.at(key); assert.ok(t0 != null, key + ' 가 안 울림 ' + JSON.stringify(R.alerts.map(a => a.key + '@' + a.t)));
    const dev = t0 - R.plan[node - 1], l = key.endsWith('_0') ? loDest : lo;
    assert.ok(dev >= l && dev <= hi, key + ' ' + t0 + '초 · 실제 통과(' + node + '번 ' + R.plan[node - 1] + '초) 대비 ' + dev + '초 (허용 ' + l + '~' + hi + ')');
  });
  const ks = R.alerts.map(a => a.key); assert.strictEqual(ks.length, new Set(ks).size, '중복 알림 ' + ks);
}
const stepsOk = (R) => { let prev = -1; R.rows.forEach(x => { if (x.ci > prev + 1 && prev >= 0) assert.fail('현재역이 ' + prev + ' → ' + x.ci + ' 로 건너뜀(' + x.t + '초)'); if (x.ci < prev) assert.fail('현재역이 거꾸로 ' + prev + ' → ' + x.ci + '(' + x.t + '초)'); prev = x.ci; }); };
const passOf = (R, i) => { const p = (R.state.eta.passes || []).filter(q => q.idx === i)[0]; assert.ok(p, i + '번 통과 기록 없음'); return Math.round((p.ms - R.state.stops.slice().sort((a, b) => a.i - b.i)[0].arrMs) / 1000); };
const tunnel = (ft, p, S) => Math.min.apply(null, S.map(s => BX.hav(p[0], p[1], s.lat, s.lng))) <= 350;

console.log('의정부→홍대입구 (1호선 → 1102 → 7101 · 도봉산역에서 내려 95m 앞 정류장에서 버스를 기다림)');
const R0 = BX.run(SB, BX.fixture474(), { realMove: true });
t('계획: 도봉산(4번) 510초 → 버스 승차 정류장(5번) 1080초 — 기다림 570초가 들어 있는 경로', () => { assert.strictEqual(R0.plan[3], 510); assert.strictEqual(R0.plan[4], 1080); });
t('알림이 실제 통과 근처: 4_2 · 4_1 · 8_2 · 8_1 · 15_2 · 15_1 · 15_0', () => { check(R0, -60, 40, -80); });
t('현재역이 한 칸씩 가고 안내가 끝난다', () => { stepsOk(R0); assert.ok(R0.doneAt != null, '끝나지 않음'); });
t('기다리는 동안 도봉산(4번) 통과 시각이 뒤로 밀리지 않는다(처음 닿은 510초 근처)', () => { const p4 = passOf(R0, 4); assert.ok(Math.abs(p4 - R0.plan[3]) <= 60, '4번 통과 ' + p4 + '초 · 계획 ' + R0.plan[3] + '초'); });
t('버스를 타 달려 나가면 5번 통과가 버스 시각(1080초) 근처로 적힌다', () => { const p5 = passOf(R0, 5); assert.ok(Math.abs(p5 - R0.plan[4]) <= 60, '5번 통과 ' + p5 + '초 · 계획 ' + R0.plan[4] + '초'); });
t('GPS 잡음 8m: 모든 알림이 같은 범위 안 · 한 칸씩', () => { const R = BX.run(SB, BX.fixture474(), { realMove: true, noise: 8 }); check(R, -60, 40, -80); stepsOk(R); });
t('정류장에서 350m 넘게 벗어나면 위치 기록이 없는 터널(버스 구간): 모두 한 번씩 · 한 칸씩 · 거꾸로 가지 않음', () => { const R = BX.run(SB, BX.fixture474(), { realMove: true, gps: tunnel }); check(R, -60, 40, -80); stepsOk(R); });
t('기다리지 않고 직선으로 걸어 정류장에 닿는 사람(realMove 없음)도 모두 한 번씩 · 한 칸씩', () => { const R = BX.run(SB, BX.fixture474(), {}); check(R, -60, 40, -80); stepsOk(R); });

console.log('합성 경로: 1호선 4역 → (걷기 D m · 기다림 W 초) → 버스 6정거장 [→ 400m 걸어 버스 5정거장]');
// 알림 키 'N_r' 의 실제 통과 = 노드 N-r 의 계획 시각 — 합성 경로는 대상이 환승(4번) · 목적지 둘이다
function checkAny(R, st, lo, hi, loDest) {
  const STOPS = st.stops.slice().sort((a, b) => a.i - b.i), idx = {}; STOPS.forEach((x, k) => { idx[x.i] = k; });
  const tg = st.cfg.targets, seq = st.cfg.seq; let n = 0;
  tg.forEach(g => [2, 1, 0].forEach(r => {
    if (r === 0 && g.kind !== 'dest') return; const p = g.seqPos - r; if (p < 0) return; const k = idx[seq[p]]; if (k == null) return;
    const key = g.nodeIdx + '_' + r, a = R.alerts.filter(x => x.key === key)[0]; assert.ok(a, key + ' 가 안 울림 ' + JSON.stringify(R.alerts.map(x => x.key + '@' + x.t)));
    const dev = a.t - R.plan[k], l = r === 0 ? loDest : lo; assert.ok(dev >= l && dev <= hi, key + ' ' + a.t + '초 · 실제 통과(' + R.plan[k] + '초) 대비 ' + dev + '초 (허용 ' + l + '~' + hi + ')'); n++;
  }));
  const ks = R.alerts.map(a => a.key); assert.strictEqual(ks.length, new Set(ks).size, '중복 알림 ' + ks); assert.ok(n >= 3, '확인한 알림이 너무 적음 ' + n);
}
const noJump = (R) => { let prev = -1; R.rows.forEach(x => { if (prev >= 0 && x.ci > prev + 1) assert.fail('건너뜀 ' + prev + ' → ' + x.ci + '(' + x.t + '초)'); prev = x.ci; }); };
[[30, 180, 'stand', 0], [95, 420, 'stand', 8], [250, 420, 'walkfirst', 8], [500, 700, 'walkfirst', 25], [900, 180, 'walkfirst', 8], [95, 700, 'creep', 25]].forEach(([D, W, mode, noise]) => {
  [false, true].forEach(third => t((third ? '버스→버스까지 · ' : '') + '역↔정류장 ' + D + 'm · 기다림 ' + W + '초 · ' + (mode === 'stand' ? '서서 기다리다 마지막에 이동' : mode === 'walkfirst' ? '내리자마자 걸어 정류장에서 기다림' : '직선으로 천천히') + ' · 잡음 ' + noise + 'm: 모든 알림이 실제 통과 앞 60초 ~ 뒤 40초 · 건너뛰지 않음', () => {
    const st = BX.subBus(D, W, third), R = BX.run(SB, JSON.parse(JSON.stringify(st)), mode === 'stand' ? { realMove: true, noise } : mode === 'walkfirst' ? { realMove: true, walkFirst: true, noise } : { noise });
    checkAny(R, st, -60, 40, -80); noJump(R); assert.ok(R.doneAt != null, '끝나지 않음');
  }));
});

console.log('\n' + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
