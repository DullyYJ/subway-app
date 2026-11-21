// 버스 U자 구간(가까운 정류장 두 개 사이에 멀리 간 정류장이 낀 경로)에서 위치 판단이 앞 정류장을 건너뛰지 않는다.
//   배포 엔진 가상 이동 시험에서 찾은 문제: 김포 841번 → 골드라인 환승(사우역). 승차 5번(사우역.김포고)과 하차 7번(…김포초교방면)이 43m 거리이고 그 사이 6번(사우지하차도)이 204m 밖에 있는 U자 구간이라,
//   5번 110m 앞에서 '가장 가까운' 7번이 통과로 적혀(재동기) 5·6번을 건너뛰고 하차 노드로 곧장 가, 환승 '2정거장 전'·'환승 준비(1정거장 전)' 알림이 둘 다 사라졌다.
//   그 뒤에도 넓은 창 통과 증거(영점)가 5번 근처 위치로 7번을 6번보다 먼저 통과로 적어 같은 일이 되풀이됐다.
//   성질: ① 환승 알림(7_2 · 7_1)이 둘 다 울린다 ② 현재역(curIdx)은 거꾸로 가지 않고 5 → 6 → 7 순서로 한 칸씩 간다 ③ 환승 알림은 실제 통과 앞 60초 안(너무 이르지 않게) ④ 목적지 알림(11_2 · 11_1 · 11_0)은 그대로 제때
// 실행: node test/s471_bus_loop_skip.test.js
'use strict';
const assert = require('assert');
const path = require('path');
require(path.join(__dirname, '..', 'engine', 'ride-eta.js')).RIDE_ETA_DEFAULTS.nrtEarlySec = 0;
const RS = require(path.join(__dirname, '..', 'engine', 'ride-start.js'));
const SB = require(path.join(__dirname, '..', 'engine', 'ride-standby.js'));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e && e.message).split('\n').slice(0, 4).join(' | ')); } };

const T0 = Date.UTC(2026, 10, 23, 0, 0, 0);     // 월 09:00 KST
const walk = (m, ss, es) => ({ trafficType: 3, sectionTime: m, distance: m * 70, startSec: ss, endSec: es });
// 실제 841번 경로의 좌표(김포 사우역 U자: 5↔7 43m · 5↔6 204m · 6↔7 204m)
const C = { 1: [37.64257, 126.70943], 2: [37.63658, 126.71035], 3: [37.63207, 126.71135], 4: [37.62682, 126.71213], 5: [37.62107, 126.71723], 6: [37.62010, 126.71920], 7: [37.62137, 126.71753], 8: [37.62036, 126.71972], 9: [37.61249, 126.73239], 10: [37.60124, 126.77035], 11: [37.56236, 126.80187] };
const NM = { 1: '차량등록사업소', 2: '걸포중앙공원입구', 3: '김포우리병원', 4: '북변환승센터', 5: '사우역.김포고', 6: '사우지하차도(미정차)', 7: '사우역.김포고(김포초교방면)' };
const bus = { trafficType: 2, lane: [{ busNo: '841' }], sectionTime: 12, distance: 6000, startName: NM[1], endName: NM[7], startSec: 120, endSec: 829,
  passStopList: { stations: [1, 2, 3, 4, 5, 6, 7].map(i => ({ stationName: NM[i], y: C[i][0], x: C[i][1] })) } };
const sub = { trafficType: 1, lane: [{ name: '김포골드라인' }], sectionTime: 10, distance: 9000, startName: '사우', endName: '김포공항', startSec: 1080, endSec: 1863, stopSec: [1080, 1215, 1478, 1863],
  passStopList: { stations: [8, 9, 10, 11].map((i, q) => ({ stationName: ['사우', '풍무', '고촌', '김포공항'][q], y: C[i][0], x: C[i][1] })) } };
const P = { info: { totalTime: 32, transferCount: 1, pathType: 3, tab: 'fast' }, subPath: [walk(2, 0, 120), bus, walk(4, 829, 1080), sub, walk(2, 1863, 1980)] };
const o0 = RS.rideStart({ cap: 18 }, { data: { result: { path: [JSON.parse(JSON.stringify(P))] } }, tab: 'fast', a: '출발지', b: '도착지', bt: null, rb: T0, now: T0, tz: 540, th: 'dark' });
assert.ok(o0.ok, 'rideStart 실패: ' + JSON.stringify(o0));
const ST0 = o0.state;
const STOPS = ST0.stops.slice().sort((a, b) => a.i - b.i);
const TT = STOPS.map(s => s.arrMs);
const rel = ms => Math.round((ms - T0) / 1000);

function run(gps) {
  const posAt = (ts) => {
    if (ts <= TT[0]) return [STOPS[0].lat, STOPS[0].lng];
    for (let k = 0; k < STOPS.length - 1; k++) if (ts <= TT[k + 1]) { const f = TT[k + 1] > TT[k] ? (ts - TT[k]) / (TT[k + 1] - TT[k]) : 1; return [STOPS[k].lat + (STOPS[k + 1].lat - STOPS[k].lat) * f, STOPS[k].lng + (STOPS[k + 1].lng - STOPS[k].lng) * f]; }
    return [STOPS[STOPS.length - 1].lat, STOPS[STOPS.length - 1].lng];
  };
  let st = JSON.parse(JSON.stringify(ST0)), pend = null; const alerts = [], rows = [];
  for (let now = TT[0] - 120000; now <= TT[TT.length - 1] + 400000; now += 4000) {
    const fixes = []; for (let ft = now - 3000; ft <= now; ft += 3000) { if (gps && !gps(ft)) continue; const p = posAt(ft); fixes.push([ft, p[0], p[1], 12]); }
    const req = { nowMs: now, fixes: fixes, state: JSON.parse(JSON.stringify(st)) }; if (pend) { req.bl = pend; pend = null; }
    const r = SB.rideStandby(req); st = r.state;
    if (r.ask && r.ask.body) { const b = r.ask.body; pend = { ok: true, kind: b.kind, i: b.i, ms: b.fromMs + 30000, src: 'table', at: b.nowMs, fromMs: b.fromMs, allowEarlier: !!b.allowEarlier, maxWait: b.maxWait }; }
    if (r.alert) alerts.push({ t: rel(now), key: r.alert.key, type: r.alert.type, ci: r.curIdx });
    rows.push({ t: rel(now), ci: r.curIdx });
    if (r.done) break;
  }
  const at = key => { const a = alerts.filter(x => x.key === key); return a.length ? a[0].t : null; };
  return { alerts, rows, at };
}
const R = run();
const TR = k => rel(TT[k - 1]);       // 노드 k 의 계획 통과(초)

console.log('버스 U자 구간(841 · 사우역)');
t('환승 알림 둘 다 울린다: 7_2(환승 2정거장 전) · 7_1(환승 준비)', () => {
  assert.ok(R.at('7_2') != null, '7_2 없음 ' + JSON.stringify(R.alerts));
  assert.ok(R.at('7_1') != null, '7_1 없음(앞 정류장을 건너뜀) ' + JSON.stringify(R.alerts));
  assert.ok(R.at('7_2') < R.at('7_1'), '7_2 가 7_1 보다 먼저여야 한다');
});
t('환승 알림이 실제 통과(5번 · 6번)보다 60초 넘게 앞서지 않는다', () => {
  assert.ok(R.at('7_2') >= TR(5) - 60, '7_2=' + R.at('7_2') + ' 계획 ' + TR(5));
  assert.ok(R.at('7_1') >= TR(6) - 60, '7_1=' + R.at('7_1') + ' 계획 ' + TR(6));
});
t('현재역이 거꾸로 가지 않고 5 → 6 → 7 순서로 한 칸씩 간다', () => {
  let prev = null; const seen = [];
  R.rows.forEach(x => { if (prev != null) assert.ok(x.ci >= prev, 't=' + x.t + ' curIdx ' + prev + ' → ' + x.ci + ' (거꾸로)'); if (x.ci !== prev) seen.push(x.ci); prev = x.ci; });
  const a = seen.indexOf(5), b = seen.indexOf(6), c = seen.indexOf(7);
  assert.ok(a >= 0 && b === a + 1 && c === b + 1, '5 → 6 → 7 순서 아님: ' + seen.join(','));
});
t('목적지 알림은 그대로 제때: 11_2 · 11_1 (±40초) · 11_0 도착(−40 ~ +70초: 마지막 역은 닿았는지 확인하는 시간이 있다)', () => {
  [['11_2', 9], ['11_1', 10]].forEach(([key, node]) => { const a = R.at(key); assert.ok(a != null && Math.abs(a - TR(node)) <= 40, key + '=' + a + ' 계획 ' + TR(node)); });
  const z = R.at('11_0'); assert.ok(z != null && z - TR(11) >= -40 && z - TR(11) <= 70, '11_0=' + z + ' 계획 ' + TR(11));
});

console.log('같은 경로 · 위치 기록이 잠깐씩 끊겨도(5초 중 3초는 빠짐)');
const G = run(ft => Math.floor(ft / 3000) % 3 !== 0);
t('환승 알림이 둘 다 울린다 · 현재역이 거꾸로 가지 않는다', () => {
  assert.ok(G.at('7_2') != null && G.at('7_1') != null, JSON.stringify(G.alerts));
  let prev = null; G.rows.forEach(x => { if (prev != null) assert.ok(x.ci >= prev, 't=' + x.t + ' curIdx ' + prev + ' → ' + x.ci); prev = x.ci; });
});

console.log('\n' + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
