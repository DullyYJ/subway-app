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
console.log('ride_track: pass', pass, 'fail', fail); process.exit(fail ? 1 : 0);
