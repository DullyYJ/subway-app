// 환승 대기 중 '시각표 다음 차'를 못 구했을 때(xFree: 네트워크 실패 6번 · 시각표 없는 노선) — 승차역에 서 있는 것만으로 '탔다'고 처리되지 않아야 한다.
//   배포 엔진 가상 이동 시험(tools/alert_trip_sim.js)에서 찾은 문제: 환승역에 내려 같은 역(같은 좌표)의 승차 노드에서 기다리는데,
//   시각표 답이 없다고 '위치 판단으로' 풀리는 순간 영점이 승차 노드를 '통과'로 적어 마커가 한 칸 앞서가고 '목적지 2정거장 전'이 1~3분 일찍 울렸다
//   (정거장 하나만 남은 짧은 환승 뒤에는 '목적지 도착'까지 3분 일찍).
//   성질: ① 승차 예정 시각 전에 승차역에 서 있는 동안 현재역(curIdx)은 내린 역에 머물고 목적지 알림이 울리지 않는다 ② 열차가 실제로 떠나면(위치가 움직이면) 제때 따라간다
//         ③ 시각표 답이 있으면 지금처럼 정확하다(회귀) ④ 열차가 늦게 떠나도(승차역에서 더 기다림) 일찍 울리지 않는다 ⑤ 지하(위치 기록 끊김)여도 계획대로 이어진다
// 실행: node test/s471_xfer_nofree.test.js
'use strict';
const assert = require('assert');
const path = require('path');
require(path.join(__dirname, '..', 'engine', 'ride-eta.js')).RIDE_ETA_DEFAULTS.nrtEarlySec = 0;
const RS = require(path.join(__dirname, '..', 'engine', 'ride-start.js'));
const SB = require(path.join(__dirname, '..', 'engine', 'ride-standby.js'));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e && e.message).split('\n').slice(0, 4).join(' | ')); } };

const T0 = Date.UTC(2026, 10, 23, 0, 0, 0);     // 월 09:00 KST
const LAT = 37.5, LNG0 = 126.9, DL = 0.0137;       // 역 간격 약 1.2km
const walk = (m, ss, es) => ({ trafficType: 3, sectionTime: m, distance: m * 70, startSec: ss, endSec: es });
// 1호선 S0..S3(2분 간격 · 8분 지점 S3=환승역) → 걷기 4분(같은 좌표) → 2호선 X3(환승역과 같은 좌표)..X5 → 걷기
function mkRoute() {
  const subA = { trafficType: 1, lane: [{ name: '수도권 1호선' }], sectionTime: 6, distance: 3600, startName: 'S0', endName: 'S3', startSec: 120, endSec: 480, stopSec: [120, 240, 360, 480],
    passStopList: { stations: [0, 1, 2, 3].map(i => ({ stationName: 'S' + i, y: LAT, x: LNG0 + DL * i })) } };
  const subB = { trafficType: 1, lane: [{ name: '수도권 2호선' }], sectionTime: 4, distance: 2400, startName: 'X3', endName: 'X5', startSec: 720, endSec: 960, stopSec: [720, 840, 960],
    passStopList: { stations: [3, 4, 5].map(i => ({ stationName: 'X' + i, y: LAT, x: LNG0 + DL * i })) } };
  const P = { info: { totalTime: 18, transferCount: 1, pathType: 1, tab: 'fast' }, subPath: [walk(2, 0, 120), subA, walk(4, 480, 720), subB, walk(2, 960, 1080)] };
  return { data: { result: { path: [P] } }, tab: 'fast', a: '출발지', b: '도착지', bt: null, rb: T0, now: T0, tz: 540, th: 'dark' };
}
const o0 = RS.rideStart({ cap: 18 }, mkRoute());
assert.ok(o0.ok, 'rideStart 실패');
const ST0 = o0.state;
const STOPS = ST0.stops.slice().sort((a, b) => a.i - b.i);
const PLAN = STOPS.map(s => s.arrMs);
const NODE = { alight: 4, board: 5, x4: 6, dest: 7 };
const BK = 4;                                    // 승차 노드(5번)의 stops 배열 자리(노드 번호 - 1)
const rel = ms => Math.round((ms - T0) / 1000);

// 가상 이동 — 실제 통과 시각(act[k])대로 움직이는 사람. 3초마다 위치(잡음 없음). opts: { act:(k→ms), answer:ms|null(시각표 답), gps:'gps'|'tunnel', until }
function run(opts) {
  opts = opts || {};
  const act = STOPS.map((s, k) => opts.act ? opts.act(k, s.arrMs) : s.arrMs);
  const posAt = (ts) => {
    if (ts <= act[0]) return [STOPS[0].lat, STOPS[0].lng];
    for (let k = 0; k < STOPS.length - 1; k++) if (ts <= act[k + 1]) { const f = act[k + 1] > act[k] ? (ts - act[k]) / (act[k + 1] - act[k]) : 1; return [STOPS[k].lat + (STOPS[k + 1].lat - STOPS[k].lat) * f, STOPS[k].lng + (STOPS[k + 1].lng - STOPS[k].lng) * f]; }
    return [STOPS[STOPS.length - 1].lat, STOPS[STOPS.length - 1].lng];
  };
  const hav = (a, b, c, d) => { const R = 6371000, k = Math.PI / 180, x = (c - a) * k, y = (d - b) * k * Math.cos((a + c) / 2 * k); return Math.sqrt(x * x + y * y) * R; };
  const near = p => Math.min.apply(null, STOPS.map(s => hav(p[0], p[1], s.lat, s.lng)));
  let st = JSON.parse(JSON.stringify(ST0)), pend = null; const alerts = [], rows = []; let doneAt = null;
  const tEnd = act[act.length - 1] + 420000;
  for (let now = act[0] - 120000; now <= tEnd; now += 4000) {
    const fixes = [];
    for (let ft = now - 3000; ft <= now; ft += 3000) { const p = posAt(ft); if (opts.gps === 'tunnel' && ft > act[BK] && near(p) > 350) continue; fixes.push([ft, p[0], p[1], 12]); }
    const req = { nowMs: now, fixes: fixes, state: JSON.parse(JSON.stringify(st)) }; if (pend) { req.bl = pend; pend = null; }
    const r = SB.rideStandby(req); st = r.state;
    if (r.ask && r.ask.body && opts.answer != null) { const b = r.ask.body; pend = { ok: true, kind: b.kind, i: b.i, ms: opts.answer, src: 'table', at: b.nowMs, fromMs: b.fromMs, allowEarlier: !!b.allowEarlier, maxWait: b.maxWait }; }
    if (r.alert) alerts.push({ t: rel(now), key: r.alert.key, type: r.alert.type, ci: r.curIdx });
    rows.push({ t: rel(now), ci: r.curIdx, done: !!r.done });
    if (r.done) { doneAt = rel(now); break; }
  }
  const at = key => { const a = alerts.filter(x => x.key === key); return a.length ? a[0].t : null; };
  const ciAt = sec => { let v = null; rows.forEach(x => { if (x.t <= sec) v = x.ci; }); return v; };
  return { alerts, rows, doneAt, at, ciAt, act: act.map(rel) };
}
const within = (v, lo, hi, what) => assert.ok(v != null && v >= lo && v <= hi, what + ': ' + v + ' 이(가) ' + lo + '~' + hi + ' 안이어야 한다');

console.log('환승 대기(시각표 답 없음) — 승차역에 서 있는 동안');
const A = run({ answer: null });            // 계획대로 · 통신 불가
t('시각표 답이 없어도 승차 예정(720초) 전에는 현재역이 내린 역(4번)에 머문다', () => {
  for (let s = 490; s <= 690; s += 10) { const ci = A.ciAt(s); assert.ok(ci != null && ci <= NODE.alight, 't=' + s + ' curIdx=' + ci + ' (내린 역 ' + NODE.alight + ' 에 머물러야 함) alerts=' + JSON.stringify(A.alerts)); }
});
t('목적지 2정거장 전(7_2)이 승차 예정 시각보다 20초 넘게 앞서 울리지 않는다', () => {
  const a = A.at('7_2'); assert.ok(a != null, '7_2 가 안 울림'); assert.ok(a >= 720 - 20, '7_2 가 ' + a + '초에 울림(승차 예정 720초보다 ' + (720 - a) + '초 이름)');
});
t('열차가 떠난 뒤에는 제때: 7_2 ≈ 720초 · 7_1 ≈ 840초 · 7_0 ≈ 960초(±40초)', () => {
  within(A.at('7_2'), 700, 770, '7_2'); within(A.at('7_1'), 800, 880, '7_1'); within(A.at('7_0'), 920, 1000, '7_0');
});
t('알림은 키마다 한 번씩만 · 안내는 도착 후 5분 안에 끝난다', () => {
  const ks = A.alerts.map(x => x.key); assert.strictEqual(ks.length, new Set(ks).size, '중복 ' + ks);
  assert.ok(A.doneAt != null && A.doneAt <= 960 + 330, 'done=' + A.doneAt);
});

console.log('시각표 답이 있을 때(회귀)');
const B = run({ answer: PLAN[NODE.board] });
t('시각표 답(720초)이 있으면 승차 전에는 머물고 제때 울린다', () => {
  for (let s = 490; s <= 690; s += 10) assert.ok(B.ciAt(s) <= NODE.alight, 't=' + s + ' curIdx=' + B.ciAt(s));
  within(B.at('7_2'), 700, 770, '7_2'); within(B.at('7_1'), 800, 880, '7_1'); within(B.at('7_0'), 920, 1000, '7_0');
});

console.log('열차가 늦게 떠남(승차역에서 3분 더 기다림) · 시각표 답 없음');
const L = run({ answer: null, act: (k, ms) => k >= BK ? ms + 180000 : ms });
t('실제 출발(900초) 전에는 앞서가지 않는다', () => {
  for (let s = 490; s <= 890; s += 10) assert.ok(L.ciAt(s) <= NODE.alight, 't=' + s + ' curIdx=' + L.ciAt(s));
  const a = L.at('7_2'); assert.ok(a != null && a >= 900 - 20, '7_2=' + a + ' (실제 출발 900초)');
});
t('실제로 떠나면 따라간다: 7_2 ≈ 900+40초 · 7_0 은 실제 도착(1140초) ±60초', () => { within(L.at('7_2'), 880, 900 + 90, '7_2'); within(L.at('7_0'), 1100, 1140 + 60, '7_0'); });

console.log('지하(위치 기록이 역 350m 밖에서 끊김) · 시각표 답 없음');
const U = run({ answer: null, gps: 'tunnel' });
t('끊겨도 승차 전에 일찍 울리지 않고, 끝내 도착 알림이 울린다(안내가 멈추지 않음)', () => {
  const a = U.at('7_2'); assert.ok(a == null || a >= 720 - 20, '7_2=' + a);
  const z = U.at('7_0'); assert.ok(z != null, '7_0(목적지 도착) 안 울림 alerts=' + JSON.stringify(U.alerts)); assert.ok(z <= 960 + 330, '7_0=' + z);
  assert.ok(U.doneAt != null && U.doneAt <= 960 + 700, 'done=' + U.doneAt);
});

console.log('\n' + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
