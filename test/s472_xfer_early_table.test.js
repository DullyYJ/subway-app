// 환승 대기(rsBlAskX)에서 '시각표 다음 차'가 계획 승차 시각보다 훨씬 이르게 돌아오면(걷는 사이 놓치는 차) 받아들이지 않는다.
//   배포 엔진 가상 이동 시험(tools/alert_trip_sim.js · s471 배포본)에서 찾은 문제: 청라→강남 환승 4번 — 신논현 9호선→신분당선 환승은 걷는 시간이 4분인데
//   엔진은 승강장까지 1분만 더해 시각표 다음 차(계획 승차보다 8분 이른 차)를 물었고, 그 답을 받아들여 '탔다'고 보고 마커·알림이 7분 넘게 앞서 갔다
//   ('곧 도착'·'목적지 도착'이 실제보다 7분 일찍). 계획의 승차 시각은 걷는 시간을 이미 넣어 시각표에서 잡은 것이다.
//   성질: ① 시각표 답이 계획 승차보다 RS_BLX_EARLY_TT_MS(90초) 넘게 이르면 버리고 계획 그대로 ② 90초 안의 차이(같은 열차 · 분 단위 반올림)는 지금처럼 받는다
//         ③ 계획보다 늦은 차(놓친 열차)는 받는다 ④ 실시간(realtime) 답은 이르더라도 받는다 ⑤ 못 받아 되돌린 뒤에도 안내가 계획대로 끝까지 간다
// 실행: node test/s472_xfer_early_table.test.js
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
// 1호선 S0..S3(2분 간격 · 8분 지점 S3=환승역) → 걷기 4분(같은 좌표) → 2호선 X3(환승역과 같은 좌표)..X5 → 걷기. 계획 승차 720초.
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
const NODE = { alight: 4, board: 5, dest: 7 };
const BOARD_REL = Math.round((PLAN[4] - T0) / 1000);        // 720
const rel = ms => Math.round((ms - T0) / 1000);

// 가상 이동 — 계획대로 움직이는 사람(승차는 계획 720초). answer(b, now) → { ms, src } | null : 엔진의 ask 에 앱이 답하는 일.
function run(answer) {
  const posAt = (ts) => {
    if (ts <= PLAN[0]) return [STOPS[0].lat, STOPS[0].lng];
    for (let k = 0; k < STOPS.length - 1; k++) if (ts <= PLAN[k + 1]) { const f = PLAN[k + 1] > PLAN[k] ? (ts - PLAN[k]) / (PLAN[k + 1] - PLAN[k]) : 1; return [STOPS[k].lat + (STOPS[k + 1].lat - STOPS[k].lat) * f, STOPS[k].lng + (STOPS[k + 1].lng - STOPS[k].lng) * f]; }
    return [STOPS[STOPS.length - 1].lat, STOPS[STOPS.length - 1].lng];
  };
  let st = JSON.parse(JSON.stringify(ST0)), pend = null; const alerts = [], rows = [], notes = []; let doneAt = null;
  for (let now = PLAN[0] - 120000; now <= PLAN[PLAN.length - 1] + 420000; now += 4000) {
    const fixes = []; for (let ft = now - 3000; ft <= now; ft += 3000) { const p = posAt(ft); fixes.push([ft, p[0], p[1], 12]); }
    const req = { nowMs: now, fixes: fixes, state: JSON.parse(JSON.stringify(st)) }; if (pend) { req.bl = pend; pend = null; }
    const r = SB.rideStandby(req); st = r.state;
    (r.notes || []).forEach(n => notes.push(rel(now) + ' ' + n));
    if (r.ask && r.ask.body && answer) {
      const b = r.ask.body, a = answer(b, now);
      pend = a ? { ok: true, kind: b.kind, i: b.i, ms: a.ms, src: a.src, at: b.nowMs, fromMs: b.fromMs, allowEarlier: !!b.allowEarlier, maxWait: b.maxWait } : null;
    }
    if (r.alert) alerts.push({ t: rel(now), key: r.alert.key, type: r.alert.type, ci: r.curIdx });
    rows.push({ t: rel(now), ci: r.curIdx });
    if (r.done) { doneAt = rel(now); break; }
  }
  const at = key => { const a = alerts.filter(x => x.key === key); return a.length ? a[0].t : null; };
  const ciAt = sec => { let v = null; rows.forEach(x => { if (x.t <= sec) v = x.ci; }); return v; };
  return { alerts, rows, notes, doneAt, at, ciAt };
}
const within = (v, lo, hi, what) => assert.ok(v != null && v >= lo && v <= hi, what + ': ' + v + ' 이(가) ' + lo + '~' + hi + ' 안이어야 한다');
const hasNote = (R, re) => R.notes.some(n => re.test(n));

console.log('시각표 답이 계획 승차(' + BOARD_REL + '초)보다 일찍 — 걷는 사이 놓치는 차');
const E = run((b, now) => ({ ms: b.fromMs + 30000, src: 'table' }));       // 물은 시각(지금+1분) 직후 차 = 계획보다 2분 이상 이르다
t('받지 않고 계획대로: 승차 예정 전에는 현재역이 내린 역(4번)에 머문다', () => {
  for (let s = 490; s <= 690; s += 10) { const ci = E.ciAt(s); assert.ok(ci != null && ci <= NODE.alight, 't=' + s + ' curIdx=' + ci + ' alerts=' + JSON.stringify(E.alerts)); }
  assert.ok(hasNote(E, /계획 승차보다 \d+초 일러/), '버렸다는 기록 없음: ' + E.notes.filter(n => /환승 다음 차/.test(n)).join(' / '));
});
t('목적지 알림이 계획 시각 근처: 7_2 ≈ 720 · 7_1 ≈ 840 · 7_0 ≈ 960 (±50초)', () => {
  within(E.at('7_2'), BOARD_REL - 20, BOARD_REL + 50, '7_2'); within(E.at('7_1'), 800, 890, '7_1'); within(E.at('7_0'), 920, 1010, '7_0');
});
t('알림은 키마다 한 번 · 안내가 도착 뒤 5분 안에 끝난다', () => {
  const ks = E.alerts.map(x => x.key); assert.strictEqual(ks.length, new Set(ks).size, '중복 ' + ks);
  assert.ok(E.doneAt != null && E.doneAt <= 960 + 330, 'done=' + E.doneAt);
});

console.log('계획과 거의 같은 차(분 단위 반올림 · 60초 일찍)는 지금처럼 받는다');
const S = run((b, now) => ({ ms: PLAN[4] - 60000, src: 'table' }));
t('받는다: 기록에 \'환승 다음 차(table)\' · 버렸다는 기록 없음 · 알림은 계획 근처', () => {
  assert.ok(hasNote(S, /환승 다음 차\(table\)/), '받은 기록 없음');
  assert.ok(!hasNote(S, /계획 승차보다 \d+초 일러/), '잘못 버림');
  within(S.at('7_2'), BOARD_REL - 100, BOARD_REL + 50, '7_2');
});

console.log('계획보다 늦은 차(걷다가 놓침)');
const L = run((b, now) => ({ ms: PLAN[4] + 180000, src: 'table' }));
t('받는다: 마커는 승차 예정 전에 앞서지 않고 알림은 3분쯤 늦게', () => {
  for (let s = 490; s <= 690; s += 10) assert.ok(L.ciAt(s) <= NODE.alight, 't=' + s + ' curIdx=' + L.ciAt(s));
  assert.ok(hasNote(L, /환승 다음 차\(table\)/), '받은 기록 없음');
});

console.log('실시간(realtime) 답은 이르더라도 받는다');
const RT = run((b, now) => ({ ms: b.fromMs + 30000, src: 'realtime', tn: '2001' }));
t('받는다: 기록에 \'환승 다음 차(realtime)\' · 버렸다는 기록 없음', () => {
  assert.ok(hasNote(RT, /환승 다음 차\(realtime\)/), '받은 기록 없음: ' + RT.notes.filter(n => /환승 다음 차/.test(n)).join(' / '));
  assert.ok(!hasNote(RT, /계획 승차보다 \d+초 일러/), '실시간 답을 버림');
});

console.log('\n' + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
