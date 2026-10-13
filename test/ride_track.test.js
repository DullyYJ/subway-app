// engine/ride-track.js 단위 시험 — 이탈·타고 있는 차 찾기·못 탔다 증명
const { rideTrack } = require('../engine/ride-track.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('FAIL', m); } }
const NOW = 1.8e12, KY = 111000, KX = 88000;
// 동쪽으로 뻗은 직선 경로 (0,0)→(0,7km)
const line = (lat0) => [0, 1000, 2000, 4000, 7000].map(m => ({ lat: lat0, lng: m / KX }));
const plan = (o) => Object.assign({ pts: line(0), progIsSub: false, boarded: true, notDeparted: false, riding: true }, o || {});
// 궤적 생성: from(초 전)~to(초 전)까지 step초마다, 위치는 f(t)
function trail(fromS, toS, step, f, acc) {
  const o = []; for (let s = fromS; s >= toS; s -= step) { const p = f(s); o.push([NOW - s * 1000, p.lat, p.lng, acc == null ? 10 : acc]); } return o;
}
const onPath = (s) => ({ lat: 0, lng: (3000 - s * 10) / KX });
const offPath = (s) => ({ lat: 600 / KY, lng: (3000 - s * 10) / KX });
const T = (tr, p, extra) => rideTrack(Object.assign({ nowMs: NOW, trail: tr, plan: plan(p) }, extra || {}));

// 1) 경로 위 → 이탈 아님
ok(!T(trail(120, 0, 10, onPath)).off.confirmed, '경로 위는 이탈 아님');
// 2) 600m 벗어나 70초 → 이탈
let r = T(trail(120, 0, 10, offPath));
ok(r.off.confirmed && r.off.distM >= 590, '600m 벗어남 이탈 확정 ' + JSON.stringify(r.off));
// 3) 벗어난 지 30초뿐 → 아직
ok(!T(trail(30, 0, 5, offPath)).off.confirmed, '30초는 이르다');
// 4) 튄 점 하나 → 아님
const jump = trail(120, 0, 10, onPath); jump[6] = [NOW - 60000, 800 / KY, 2000 / KX, 10];
ok(!T(jump).off.confirmed, '튄 점 하나는 무시');
// 5) 끊긴 GPS: 같은 좌표 반복 + 오래됨 → 아님
const frozen = trail(300, 0, 10, () => ({ lat: 800 / KY, lng: 2000 / KX }));
ok(!T(frozen).off.confirmed, '같은 좌표 반복은 이탈 아님');
// 6) 마지막 좌표가 40초 전 → stale
ok(T(trail(160, 40, 10, offPath)).off.why === 'stale', '오래된 좌표는 판정 안 함');
// 7) 지하철 진행 중: 정확도 좋고 크게 움직이며 벗어남 → 이탈(예전엔 면제)
r = T(trail(150, 0, 10, offPath, 15), { progIsSub: true });
ok(r.off.confirmed && r.off.why === 'off_surface_sub', '지하철 계획이라도 지상에서 계속 벗어나면 이탈 ' + JSON.stringify(r.off));
// 8) 지하철 진행 중: 정확도 나쁜 좌표(지하 진입 직전) → 면제
r = T(trail(150, 0, 10, offPath, 100), { progIsSub: true });
ok(!r.off.confirmed, '지하철 진행 중 부정확한 좌표는 이탈 아님 ' + r.off.why);
// 9) 지하철 진행 중: 벗어난 곳에 가만히 → 면제
r = T(trail(150, 0, 10, () => ({ lat: 600 / KY, lng: 2000 / KX }) , 15).map((q, i) => [q[0], q[1], q[2] + i * 2e-6, q[3]]), { progIsSub: true });
ok(!r.off.confirmed, '지하철 진행 중 제자리는 이탈 아님 ' + r.off.why);
// 9b) 지하철 진행 중: 내려서 걷는 속도(1.3m/s)로 벗어남 → 이탈 / 느리게 어슬렁(0.4m/s)은 면제
const walkOff = (v) => (s) => ({ lat: 600 / KY, lng: (3000 - s * v) / KX });
r = T(trail(150, 0, 10, walkOff(1.3), 15), { progIsSub: true });
ok(r.off.confirmed && r.off.why === 'off_surface_sub', '걷는 속도로 벗어나도 이탈 ' + JSON.stringify(r.off));
r = T(trail(150, 0, 10, walkOff(0.4), 15), { progIsSub: true });
ok(!r.off.confirmed && r.off.why === 'sub_still', '어슬렁은 이탈 아님 ' + JSON.stringify(r.off));
// 9c) 지하철 탑승 확정(subConfirmed) 이면 지상에서 벗어난 좌표가 있어도 이탈이 아니다 / 후보 경로로 갈아타지도 않는다
r = T(trail(150, 0, 10, offPath, 15), { progIsSub: true, subConfirmed: true });
ok(!r.off.confirmed && r.off.why === 'sub_confirmed', '지하철 탑승 확정이면 이탈 판정 안 함 ' + JSON.stringify(r.off));
{ const bulge2 = (lat) => [0, 1000, 2000, 4000, 7000].map((m, i) => ({ lat: (i === 0 || i === 4) ? 0 : lat, lng: m / KX }));
  const B2 = { id: 'B', pts: bulge2(-1200 / KY) }, A2 = { id: 'A', pts: line(0) };
  const south2 = (s) => ({ lat: -1200 / KY, lng: (3500 - s * 10) / KX });
  r = T(trail(200, 0, 10, south2), { pts: line(0), progIsSub: true }, { cands: [A2, B2] });
  ok(r.ridden && r.ridden.id === 'B' && r.ridden.ok, '확정 전에는 후보 B 로 맞춘다(기존 동작) ' + JSON.stringify(r.ridden));
  r = T(trail(200, 0, 10, south2), { pts: line(0), progIsSub: true, subConfirmed: true }, { cands: [A2, B2] });
  ok(!r.ridden, '지하철 탑승 확정이면 후보 경로로 갈아타지 않는다 ' + JSON.stringify(r.ridden)); }
// 10) suppress / notDeparted
ok(!T(trail(120, 0, 10, offPath), { suppress: ['baseTime'] }).off.confirmed, '예상 시각 모드는 쉰다');
ok(!T(trail(120, 0, 10, offPath), { notDeparted: true }).off.confirmed, '출발 전은 쉰다');
// 11) 타고 있는 차 찾기: 후보 B 는 남쪽으로 불룩, 실제 궤적은 B 를 따라감
const bulge = (lat) => [0, 1000, 2000, 4000, 7000].map((m, i) => ({ lat: (i === 0 || i === 4) ? 0 : lat, lng: m / KX }));
const B = { id: 'B', pts: bulge(-1200 / KY) }, A = { id: 'A', pts: line(0) };
const south = (s) => ({ lat: -1200 / KY, lng: (3500 - s * 10) / KX });
r = T(trail(200, 0, 10, south), { pts: line(0) }, { cands: [A, B] });
ok(r.ridden && r.ridden.id === 'B' && r.ridden.ok, '궤적이 따라가는 후보 B 선택 ' + JSON.stringify(r.ridden));
// 12) 보던 경로를 따라가면 ok 아님
r = T(trail(200, 0, 10, onPath), {}, { cands: [A, B] });
ok(!r.ridden || !r.ridden.ok, '보던 경로를 따라가면 바꾸지 않는다');
// 13) 걷는 중이면 맞추지 않음
r = T(trail(200, 0, 10, south), { boarded: false, riding: false }, { cands: [A, B] });
ok(r.ridden == null || r.vehicleNow, '걷는 중이면 후보 맞춤 없음(차량 속도가 아니면)');
// 14) 못 탔다 증명: 신선한 정지
const still = trail(120, 0, 10, () => ({ lat: 0, lng: 100 / KX }));
r = T(still, { boarded: false, riding: false });
ok(r.miss.proof, '신선한 정지는 못 탔다 증명 ' + r.miss.why);
// 15) 지하 진입 후 GPS 끊김(마지막 좌표 60초 전) → 증명하지 않음
r = T(trail(180, 60, 10, () => ({ lat: 0, lng: 100 / KX })), { boarded: false, riding: false });
ok(!r.miss.proof && r.miss.why === 'stale', '끊긴 GPS 는 정지 증거가 아니다 ' + r.miss.why);
// 16) 기지국이 바뀌고 있으면 증명 아님
r = T(still, { boarded: false, riding: false }, { sensor: { cellN180: 3 } });
ok(!r.miss.proof, '기지국 변화 중이면 증명 아님');
// 17) 탑승 증거가 있으면 증명 아님
ok(!T(still, { boarded: false, riding: true }).miss.proof, '탑승 증거가 있으면 증명 아님');
// 19) 승차 안 하고 걸어서 멀어짐(지하철 먼저 계획): 역에서 400m 넘게, 걷는 속도로 → walkingAway
const bp = { lat: 0, lng: 0 };
const walkAway = (s) => ({ lat: 0, lng: (420 + (80 - s) * 1.3) / KX });
r = T(trail(75, 0, 8, walkAway, 15), { notDeparted: true, boardPt: bp, boarded: false, riding: false });
ok(r.board && r.board.walkingAway, '걸어서 멀어지면 walkingAway ' + JSON.stringify(r.board));
// 20) 열차 속도로 멀어지면 아님
const trainAway = (s) => ({ lat: 0, lng: (250 + (80 - s) * 14) / KX });
r = T(trail(75, 0, 8, trainAway, 15), { notDeparted: true, boardPt: bp, boarded: false, riding: false });
ok(r.board && !r.board.walkingAway, '열차 속도는 walkingAway 아님 ' + JSON.stringify(r.board));
// 21) 역 근처 좌표가 섞여 있으면 아님 / 오래된 좌표는 아님 / 승차 후엔 계산 안 함
r = T(trail(75, 0, 8, (s) => ({ lat: 0, lng: (100 + (80 - s) * 5) / KX }), 15), { notDeparted: true, boardPt: bp });
ok(r.board && !r.board.walkingAway && r.board.why === 'near_station', '역 근처 좌표 섞임 ' + JSON.stringify(r.board));
r = T(trail(120, 50, 8, walkAway, 15), { notDeparted: true, boardPt: bp });
ok(r.board && !r.board.walkingAway, '오래된 좌표는 판정 안 함 ' + r.board.why);
ok(T(trail(75, 0, 8, walkAway, 15), { notDeparted: false, boardPt: bp }).board === null, '승차 후엔 판정 안 함');
// 18) 빈 입력
r = rideTrack({ nowMs: NOW }); ok(r.off.confirmed === false && r.fix.n === 0, '빈 입력 안전');
// 19) 영점 확인 / 도착 확인 (want.zero) — 시각표 도착 15초 전 ~ 30초 뒤 45초, 정류장 부근 GPS 가 한 번이라도 잡히면 near
{
  const stn = (m) => ({ lat: 0, lng: m / KX });
  const Z = (nowOff, fixes, stops, extra) => {   // nowOff: 도착 시각 대비 지금(초, +는 도착 뒤)
    const arr = NOW - nowOff * 1000;
    const st = (stops || [{ i: 2, lat: 0, lng: 3000 / KX, arrMs: arr }]).map(x => Object.assign({ arrMs: arr }, x));
    const tr = fixes.map(f => [arr + f.t * 1000, f.lat != null ? f.lat : 0, f.lng != null ? f.lng : 3000 / KX, f.acc == null ? 20 : f.acc]);
    return rideTrack(Object.assign({ nowMs: NOW, trail: tr, plan: plan({ stops: st }), want: { zero: true } }, extra || {}));
  };
  let z = Z(-30, [{ t: -40 }]);
  ok(z.zero.stops.length === 0, '도착 15초보다 전(30초 전)에는 알리지 않는다 ' + JSON.stringify(z.zero));
  z = Z(-10, [{ t: -12 }]);
  ok(z.zero.stops[0].state === 'near' && !z.zero.stops[0].apply, '15초 전 창 안: near 이지만 아직 apply 아님(도착 시각 3초 전부터) ' + JSON.stringify(z.zero.stops[0]));
  z = Z(-2, [{ t: -8 }]);
  ok(z.zero.stops[0].state === 'near' && z.zero.stops[0].apply, '도착 2초 전: near + apply');
  z = Z(5, [{ t: -3, lng: 3150 / KX }]);
  ok(z.zero.stops[0].state === 'near' && z.zero.stops[0].apply, '정류장에서 150m(정확도 20 빼면 130m) → near');
  const E = 111190;   // 적도(시험 좌표계)에서 1도 = 111.19km — 정류장 기준 동쪽 m 만큼
  z = Z(5, [{ t: -3, lng: 3000 / KX + 215 / E, acc: 20 }]);
  ok(z.zero.stops[0].state === 'near', '215m − 정확도 20 = 195m ≤ 200m → near');
  z = Z(5, [{ t: -3, lng: 3000 / KX + 235 / E, acc: 20 }]);
  ok(z.zero.stops[0].state === 'pending' && z.zero.stops[0].distM > 200, '235m − 20 = 215m 는 중간 역 기준(200m) 밖 → near 아님(창 안이라 pending) ' + JSON.stringify(z.zero.stops[0]));
  z = Z(5, []);
  ok(z.zero.stops[0].state === 'pending' && !z.zero.stops[0].apply, '창 안에 위치가 없으면 pending(벌 없음)');
  z = Z(40, [{ t: -2, lng: 3000 / KX }]);
  ok(z.zero.stops[0].state === 'near', '창이 막 끝난 뒤(25초)에도 near 를 알려 준다(중간 역 20초 유지) ' + JSON.stringify(z.zero.stops[0]));
  z = Z(80, [{ t: -2 }]);
  ok(z.zero.stops.length === 0, '중간 역은 창이 끝나고 20초가 지나면 더 알리지 않는다');
  z = Z(-5, [{ t: -8, lat: 600 / KY }], undefined);
  ok(z.zero.stops[0].state === 'pending', '600m 떨어진 위치만 있어도 창 안이면 pending');
  z = Z(0, [{ t: -8, acc: 200 }]);
  ok(z.zero.stops[0].n === 0 && z.zero.stops[0].state === 'pending', '정확도 나쁜 위치(150m 초과)는 근거가 아니다');
  // 시각표를 바꾸지 않는다 — 출력에 시각 보정 필드가 없다
  z = Z(0, [{ t: -3 }]);
  ok(!('arrMs' in z.zero.stops[0]) && !('delay' in z.zero.stops[0]) && !('shiftMs' in z.zero.stops[0]), '출력에 시각 보정이 없다');
  // 승차 확정 전엔 판정하지 않는다
  z = rideTrack({ nowMs: NOW, trail: [[NOW - 3000, 0, 3000 / KX, 10]], plan: plan({ boarded: false, stops: [{ i: 2, lat: 0, lng: 3000 / KX, arrMs: NOW }] }), want: { zero: true } });
  ok(z.zero.stops.length === 0, '승차 확정 전엔 영점 판정 없음');
  // zero 를 요청하지 않으면 없다
  ok(rideTrack({ nowMs: NOW, trail: [], plan: plan() }).zero === undefined, 'want 생략 시 zero 없음');
  // 최종 목적지 verdict
  const FIN = (nowOff, fixes) => Z(nowOff, fixes, [{ i: 5, lat: 0, lng: 3000 / KX, fin: true }]);
  z = FIN(10, [{ t: -3 }]);
  ok(z.zero.final.verdict === 'verify', '창(45초) 안에서는 near 여도 verify(창이 끝나야 종료) ' + JSON.stringify(z.zero.final));
  z = FIN(31, [{ t: -3 }]);
  ok(z.zero.final.verdict === 'confirmed', '창이 끝나고 near 가 있으면 confirmed ' + JSON.stringify(z.zero.final));
  z = FIN(31, [{ t: -3, lng: 3000 / KX + 255 / E, acc: 10 }]);
  ok(z.zero.final.verdict === 'confirmed', '목적지 기준은 250m(255−10=245m) → confirmed ' + JSON.stringify(z.zero.final));
  z = FIN(31, []);
  ok(z.zero.final.verdict === 'unknown', '창이 끝났는데 위치가 없으면 unknown(앱은 버튼) ' + JSON.stringify(z.zero.final));
  z = FIN(31, [{ t: -3, lat: 400 / KY }]);
  ok(z.zero.final.verdict === 'unknown' && z.zero.final.state === 'off', '250~600m 애매 → unknown ' + JSON.stringify(z.zero.final));
  z = FIN(31, [{ t: -3, lat: 1500 / KY }, { t: 0, lat: 1500 / KY }]);
  ok(z.zero.final.verdict === 'notyet', '600m 넘는 위치만 → notyet(아직 도착 전) ' + JSON.stringify(z.zero.final));
  // 창이 끝난 뒤 늦게 GPS 가 잡히면 최근 45초로 다시 판정 → confirmed
  z = FIN(300, [{ t: 100, lat: 1500 / KY }, { t: 290 }]);
  ok(z.zero.final.verdict === 'confirmed', '5분 뒤 최근 45초 안에 near → confirmed ' + JSON.stringify(z.zero.final));
  z = FIN(300, [{ t: 100, lat: 1500 / KY }, { t: 285, lat: 1500 / KY }]);
  ok(z.zero.final.verdict === 'notyet', '5분 뒤에도 최근 45초가 먼 위치뿐 → notyet ' + JSON.stringify(z.zero.final));
  z = FIN(40 * 60, [{ t: 2390 }]);
  ok(z.zero.final === null, '30분이 지나면 판정하지 않는다');
  z = FIN(-1, []);
  ok(z.zero.final.verdict === 'verify' && z.zero.final.state === 'pending', '도착 1초 전 위치 없음 → verify/pending');
}

// ── 버스를 정말 탔나 · 위치 잡는 방식(2026-10-13 YJ: 버스 안 타고 승용차를 탔는데 역으로 인식) ─────────────
{
  const X = (m) => m / KX;                                   // 동쪽 m → 경도
  const stopsAt = (xs, planOffS) => xs.map((x, i) => ({ i: i + 2, lat: 0, lng: X(x), arrMs: NOW + planOffS[i] * 1000, bus: true, planMs: NOW + planOffS[i] * 1000 }));
  const run = (tr, planO) => rideTrack({ nowMs: NOW, trail: tr, plan: plan(Object.assign({ boarded: true, riding: true }, planO)), want: { off: false, ridden: false, miss: false, bus: true } });
  const BOARD = { lat: 0, lng: X(0) };
  // 승용차: 정류장(0m)에서 3km 떨어진 곳(2000m)부터 시속 45km 로 달린다. 궤적은 움직임 시작 40초 전부터.
  let car = trail(160, 0, 5, (s) => ({ lat: 0, lng: X(2000 + (160 - s) * 12.5) }));
  let r = run(car, { startMs: NOW - 120000, busLeg: { boardPt: BOARD } });
  ok(r.bus && r.bus.state === 'notBus' && r.bus.why === 'no_stop' && r.bus.stopSeen === false, '승용차: 승차 정류장을 지난 적 없다 → notBus/no_stop ' + JSON.stringify(r.bus));
  ok(r.mode === null, '버스 아님이면 GPS 중심 모드를 켜지 않는다 ' + JSON.stringify(r.mode));
  // 버스: 정류장에서 60초 서 있다가 출발(시속 20km 안팎), 궤적은 정류장 도착 전부터
  let bus = trail(200, 140, 5, () => ({ lat: 0, lng: X(10) })).concat(trail(135, 0, 5, (s) => ({ lat: 0, lng: X((140 - s) * 5.5) })));
  r = run(bus, { startMs: NOW - 135000, busLeg: { boardPt: BOARD } });
  ok(r.bus.state === 'plausible' && r.bus.stopSeen === true, '버스: 승차 정류장을 지났다 → plausible ' + JSON.stringify(r.bus));
  ok(r.mode && r.mode.kind === 'bus' && r.mode.gps === 'heavy' && r.mode.snapM === 500 && r.mode.advanceSec === 8, '버스 탑승 → GPS 를 더 쓰는 모드 ' + JSON.stringify(r.mode));
  // 확실한 증거(탑승 버튼 · 차량 매칭)가 있으면 정류장을 안 지났어도 confirmed
  for (const pf of ['button', 'vehicle']) {
    r = run(car, { startMs: NOW - 120000, busLeg: { boardPt: BOARD, proof: pf } });
    ok(r.bus.state === 'confirmed' && r.mode && r.mode.kind === 'bus', pf + ' 증거 → confirmed + 버스 모드 ' + JSON.stringify(r.bus));
  }
  // 걷는 중(차량 속도 아님, 탑승 증거도 없음) → idle
  const walk = trail(160, 0, 5, (s) => ({ lat: 0, lng: X(2000 + (160 - s) * 1.2) }));
  r = run(walk, { riding: false, boarded: false, startMs: null, busLeg: { boardPt: BOARD } });
  ok(r.bus.state === 'idle', '걷는 중 → idle ' + JSON.stringify(r.bus));
  // 궤적이 움직임 시작을 덮지 못하면(정류장이 궤적 밖일 수 있다) 단정하지 않는다
  const shortTr = trail(60, 0, 5, (s) => ({ lat: 0, lng: X(2000 + (60 - s) * 12.5) }));
  r = run(shortTr, { startMs: NOW - 120000, busLeg: { boardPt: BOARD } });
  ok(r.bus.state === 'unknown' && r.bus.why === 'trail_short', '궤적이 짧다 → unknown(아무 일도 하지 않는다) ' + JSON.stringify(r.bus));
  r = run(shortTr, { startMs: null, busLeg: { boardPt: BOARD } });
  ok(r.bus.state === 'unknown', '움직임 시작 시각을 모르면 → unknown ' + JSON.stringify(r.bus));
  // 정류장 부근은 지났지만(같은 길에서 출발) 뒤 정류장들에 계획보다 5분 넘게 먼저 닿는다 → 버스가 아니다
  const fast = trail(160, 0, 5, (s) => ({ lat: 0, lng: X((160 - s) * 14) }));      // 0m 에서 시작, 시속 50km — 2240m 까지
  const early = stopsAt([800, 1600, 2200], [900, 1500, 2100]);                     // 계획은 15~35분 뒤
  r = run(fast, { startMs: NOW - 160000, busLeg: { boardPt: BOARD }, stops: early });
  ok(r.bus.state === 'notBus' && r.bus.why === 'ahead' && r.bus.ahead >= 2, '뒤 정류장에 계획보다 먼저 닿음 → notBus/ahead ' + JSON.stringify(r.bus));
  // 계획 시각대로 가면 plausible
  const onTime = stopsAt([800, 1600, 2200], [-100, -40, 10]);
  r = run(fast, { startMs: NOW - 160000, busLeg: { boardPt: BOARD }, stops: onTime });
  ok(r.bus.state === 'plausible' && r.bus.ahead === 0, '계획 시각대로 → plausible ' + JSON.stringify(r.bus));
  // 한 정류장만 앞서면(버스가 조금 일찍 간 것) 버스가 아니라고 하지 않는다
  const one = stopsAt([800, 1600, 2200], [900, -40, 10]);
  r = run(fast, { startMs: NOW - 160000, busLeg: { boardPt: BOARD }, stops: one });
  ok(r.bus.state === 'plausible', '한 정류장만 앞섬 → plausible ' + JSON.stringify(r.bus));
  // 승용차인데 지하철역에 '확정'돼 있다(YJ 제보) → 확정이어도 버스를 안 탔으면 거짓 — notBus, 모드 없음
  r = run(car, { subConfirmed: true, startMs: NOW - 120000, busLeg: { boardPt: BOARD } });
  ok(r.bus.state === 'notBus' && r.mode === null, '거짓 지하철 확정(승용차) → notBus, 시각표 모드를 켜지 않는다 ' + JSON.stringify([r.mode, r.bus]));
  // 진짜로 버스를 타고 와서 지하철 확정 → 시각표로 움직이고 GPS 는 역마다 영점
  r = run(bus, { subConfirmed: true, startMs: NOW - 135000, busLeg: { boardPt: BOARD } });
  ok(r.mode && r.mode.kind === 'sub' && r.mode.gps === 'zero' && r.bus.state === 'plausible', '진짜 버스 뒤 지하철 확정 → mode sub/zero ' + JSON.stringify([r.mode, r.bus]));
  r = run(car, { subConfirmed: true, startMs: NOW - 120000, busLeg: { boardPt: BOARD, proof: 'button' } });
  ok(r.mode && r.mode.kind === 'sub' && r.bus.state === 'confirmed', '탑승 버튼 증거 + 지하철 확정 → mode sub ' + JSON.stringify([r.mode, r.bus]));
  // 앱이 움직임 시작 시각을 모를 때: 궤적 맨 앞이 서 있다 출발했으면 엔진이 직접 찾는다 / 이미 달리는 중에 시작한 궤적이면 단정하지 않는다
  r = run(car.slice(), { startMs: null, busLeg: { boardPt: BOARD } });
  ok(r.bus.state === 'unknown', '이미 달리는 궤적(시작을 모름) → unknown ' + JSON.stringify(r.bus));
  const stillThenCar = trail(160, 100, 5, () => ({ lat: 0, lng: X(2000) })).concat(trail(95, 0, 5, (s) => ({ lat: 0, lng: X(2000 + (100 - s) * 12.5) })));
  r = run(stillThenCar, { startMs: null, busLeg: { boardPt: BOARD } });
  ok(r.bus.state === 'notBus' && r.bus.why === 'no_stop', '서 있다 출발한 궤적 → 시작 시각을 엔진이 찾아 notBus ' + JSON.stringify(r.bus));
  // 승차 정류장 자체의 계획 시각보다 일찍 가 있어도(boardIdx) 앞선 것으로 세지 않는다
  const earlyBoard = stopsAt([0, 800, 1600], [900, -40, 10]);
  r = run(fast, { startMs: NOW - 160000, busLeg: { boardPt: BOARD, boardIdx: 2 }, stops: earlyBoard });
  ok(r.bus.state === 'plausible' && r.bus.ahead === 0, '승차 정류장은 앞선 것으로 세지 않는다 ' + JSON.stringify(r.bus));
  // 버스 구간 정보가 없으면 bus null, 지하철도 아니면 mode null
  r = rideTrack({ nowMs: NOW, trail: car, plan: plan({ boarded: true }), want: { off: false, ridden: false, miss: false } });
  ok(r.bus === null && r.mode === null, 'busLeg 없음 → bus/mode null');
  // 기존 want({off, ridden, miss}) 로 불러도 bus 를 같이 답한다(요청에 bus 를 쓰지 않아도)
  r = rideTrack({ nowMs: NOW, trail: car, plan: plan({ boarded: true, startMs: NOW - 120000, busLeg: { boardPt: BOARD } }) });
  ok(r.bus && r.bus.state === 'notBus', '기본 want 에서도 bus 판정 ' + JSON.stringify(r.bus));
}

// ── 탑승·환승 버튼을 누른 순간의 GPS 확인(2026-10-13 YJ) ───────────────────────────────
{
  const X = (m) => m / KX, PT = { lat: 0, lng: X(0) };
  const pr = (tr, now) => rideTrack({ nowMs: now || NOW, trail: tr, plan: { pts: [], pressPt: PT }, want: { off: false, ridden: false, miss: false, bus: false, press: true } }).press;
  let r = pr(trail(20, 0, 5, () => ({ lat: 0, lng: X(100) })));
  ok(r && r.state === 'at' && r.distM <= 130, '역 100m 안 → at ' + JSON.stringify(r));
  r = pr(trail(20, 0, 5, () => ({ lat: 0, lng: X(2000) })));
  ok(r.state === 'away' && r.distM > 1900, '역에서 2km → away ' + JSON.stringify(r));
  r = pr(trail(20, 0, 5, () => ({ lat: 0, lng: X(500) })));
  ok(r.state === 'near', '300~800m 사이 → near(믿는다) ' + JSON.stringify(r));
  r = pr(trail(120, 60, 5, () => ({ lat: 0, lng: X(2000) })));
  ok(r.state === 'unknown' && r.why === 'stale', '좌표가 오래됐다(지하) → unknown ' + JSON.stringify(r));
  r = pr([]);
  ok(r.state === 'unknown' && r.why === 'no_fix', '좌표 없음 → unknown');
  r = pr(trail(20, 0, 5, () => ({ lat: 0, lng: X(900) }), 200));
  ok(r.state === 'unknown', '정확도 나쁜 좌표는 쓰지 않는다 ' + JSON.stringify(r));
  const o = rideTrack({ nowMs: NOW, trail: [], plan: { pts: [] } });
  ok(o.press === null, 'want.press 가 없으면 press null');
}
// 20) 통과 시각(passMs) — 표시 시각보다 일찍·늦게 닿은 열차도 GPS 로 통과 시각을 찾는다(2026-10-13: 선학에 시간표보다 1.2분 빨리 왔는데 시각이 안 맞춰졌다)
{
  const stn = { lat: 0, lng: 3000 / KX };
  const run = (arrOff, fixes, pass) => {   // arrOff: 표시 도착 시각 − 지금(초)
    const arr = NOW + arrOff * 1000;
    const tr = fixes.map(f => [NOW + f.t * 1000, 0, 3000 / KX + (f.dx || 0) / KX, f.acc == null ? 20 : f.acc]);
    return rideTrack({ nowMs: NOW, trail: tr, plan: plan({ stops: [{ i: 2, lat: stn.lat, lng: stn.lng, arrMs: arr, pass: pass }] }), want: { zero: true } });
  };
  let z = run(72, [{ t: -20 }], true), s0 = z.zero.stops[0];
  ok(s0 && s0.passMs === NOW - 20000 && s0.passEarlySec === -92 && s0.apply === true && s0.state === 'near', '일찍 닿음(표시보다 72초 뒤): 통과 시각을 돌려준다 ' + JSON.stringify(s0));
  z = run(72, [{ t: -20 }], false);
  ok(z.zero.stops.length === 0, 'pass 표시가 없으면 넓은 창을 보지 않는다(옛 동작)');
  z = run(72, [{ t: -20, acc: 100 }], true);
  ok(z.zero.stops.length === 0 || z.zero.stops[0].passMs === undefined, '정확도 60m 넘는 좌표는 통과 시각에 쓰지 않는다 ' + JSON.stringify(z.zero.stops));
  z = run(-200, [{ t: -50 }], true); s0 = z.zero.stops[0];
  ok(s0 && s0.passMs === NOW - 50000 && s0.passEarlySec === 150, '늦게 닿음(표시보다 150초 뒤): 통과 시각을 돌려준다 ' + JSON.stringify(s0));
  z = run(-600, [{ t: -50 }], true);
  ok(z.zero.stops.length === 0, '표시 시각이 10분 전이면 보지 않는다');
  z = run(400, [{ t: -20 }], true);
  ok(z.zero.stops.length === 0, '표시 시각이 6분 넘게 남았으면 보지 않는다');
  z = run(30, [{ t: -60, dx: 100 }, { t: -40, dx: 30 }, { t: -20, dx: 90 }], true); s0 = z.zero.stops[0];
  ok(s0 && s0.passMs === NOW - 40000 && s0.passDistM <= 40, '가장 가까웠던 순간(30m)의 시각 ' + JSON.stringify(s0));
  z = run(30, [{ t: -20, dx: 400 }], true);
  ok(z.zero.stops.length === 0 || z.zero.stops[0].passMs === undefined, '150m 밖이면 통과로 보지 않는다');
}
// 21) 아직 안 닿음(notYet) — 표시 도착 시각이 지났는데 GPS 가 앞 정류장과 이 정류장 '사이'에서 이 정류장과 멀다 → 늦는 열차(엔진이 시각을 민다)
{
  const st = (arrOff) => [{ i: 1, lat: 0, lng: 0, arrMs: NOW - 200000 }, { i: 2, lat: 0, lng: 3000 / KX, arrMs: NOW + arrOff * 1000, pass: true }];
  const run = (arrOff, fixes) => rideTrack({ nowMs: NOW, trail: fixes.map(f => [NOW + f.t * 1000, 0, f.x / KX, f.acc == null ? 20 : f.acc]), plan: plan({ stops: st(arrOff) }), want: { zero: true } });
  let z = run(-60, [{ t: -10, x: 1900 }]), s2 = z.zero.stops.find(x => x.i === 2);
  ok(s2 && s2.notYet === true && s2.notYetDistM > 1000, '표시 도착 60초 지남 + 1.1km 앞(두 역 사이) → notYet ' + JSON.stringify(s2));
  z = run(30, [{ t: -10, x: 1900 }]); ok(!(z.zero.stops.find(x => x.i === 2) || {}).notYet, '아직 표시 도착 시각 전이면 notYet 아님');
  z = run(-60, [{ t: -10, x: 2800 }]); ok(!(z.zero.stops.find(x => x.i === 2) || {}).notYet, '400m 안이면 notYet 아님(곧 닿는다)');
  z = run(-60, [{ t: -10, x: 4500 }]); ok(!(z.zero.stops.find(x => x.i === 2) || {}).notYet, '이미 지나쳐 멀어졌으면(두 역 사이가 아님) notYet 아님');
  z = run(-60, [{ t: -60, x: 1900 }]); ok(!(z.zero.stops.find(x => x.i === 2) || {}).notYet, '좌표가 낡았으면(50초) 판정하지 않는다');
  z = run(-400, [{ t: -10, x: 1900 }]); ok(!(z.zero.stops.find(x => x.i === 2) || {}).notYet, '표시 도착이 5분 넘게 지났으면 판정하지 않는다');
  z = run(-60, [{ t: -10, x: 1900, acc: 150 }]); ok(!(z.zero.stops.find(x => x.i === 2) || {}).notYet, '정확도 100m 넘는 좌표는 쓰지 않는다');
  z = rideTrack({ nowMs: NOW, trail: [[NOW - 10000, 0, 1900 / KX, 20]], plan: plan({ stops: [{ i: 2, lat: 0, lng: 3000 / KX, arrMs: NOW - 60000, pass: true }] }), want: { zero: true } });
  ok(!(z.zero.stops[0] || {}).notYet, '앞 정류장 정보가 없으면 판정하지 않는다');
}
console.log('ride_track: pass', pass, 'fail', fail); process.exit(fail ? 1 : 0);
