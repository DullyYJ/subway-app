// 길동무 — 탑승 중 경로 추적 판정 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수)
//
// ★ 원칙(YJ): "엔진은 연산, 앱은 그림그리기."  (2026-10-12 재확인: "규칙은 지켜야 해")
//   예전에는 앱(www/index.html)이 직접 판정했다 — 경로 이탈(_checkOffRoute), 타고 있는 차 찾기(_matchRiddenRoute),
//   '정말 못 탔다' 증명(_missProof). 그 판정을 이 파일로 옮겼다. 앱은 위치 궤적과 센서 요약(증거)을 보내고, 답(판정)을 그대로 따른다.
//   상태 없음(stateless): 매번 '최근 증거 전부'를 받아 판정한다. 쿨다운처럼 '언제 부를지'는 앱이 정하지만 '무엇이 맞는지'는 여기서 정한다.
//
// 입력  { nowMs, floorMs?,
//         trail:[[ts,lat,lng,acc?]…]            최근 궤적(오래된 것 먼저). 앱은 잡음 걸러내기 외의 가공을 하지 않는다.
//         plan:{ pts:[{lat,lng}…]               지금 안내 중인 경로의 노드 좌표(순서대로)
//                progIsSub, progIsBus           진행도가 가리키는 노드 종류
//                boarded, notDeparted, riding   앱이 가진 증거 상태(승차 확정 / 출발 전 / 탑승 증거)
//                startMs?                       탑승 증거가 선 시각(_rideEvStartMs)
//                boardPt?:{lat,lng}, departM?   지하철 승차역 좌표와 '멀어짐' 기준(m)
//                suppress?:[string…] }          판정을 쉬어야 하는 모드(예상 시각·지하철 노선도·수동 출발 등) — 하나라도 있으면 이탈 없음
//         cands?:[{id,pts:[{lat,lng}…],longDist?}…]   엔진이 이번 탐색에서 준 후보 경로들
//         sensor?:{ cellN180, pfSeg }            기지국 변화 횟수(180초), PF 가 최근 주행(seg)으로 본 적이 있는지
//         want?:{ off, ridden, miss, zero, bus } }     (생략하면 off·ridden·miss — zero 는 요청할 때만)
//         plan.stops?:[{ i, lat, lng, arrMs, fin?, pass? }…]   (zero 용) 승차 뒤 지나는 역·정류장 — i=앱 노드 번호, arrMs=시각표(엔진이 맞춘 표시) 도착 시각, fin=최종 목적지
// 출력  { v, fix:{n, ageSec, fresh}, off:{confirmed, distM, n, spanSec, why},
//         ridden:{id, ok, mean, max, tail, curMean, curTail, curBad, last:{lat,lng}} | null,
//         miss:{proof, why}, board:{walkingAway, distM, speed, why} | null, vehicleNow }
//   zero  : (want.zero, plan.boarded 일 때만) [★ 2026-10-13 stops[].pass:true 면 표시 도착 시각 앞 5분~뒤 7분의 넓은 창에서 정확도 60m 이하 좌표가 150m 안에 든 가장 가까운 순간을 stops[].passMs 로 돌려준다(일찍·늦게 닿은 열차의 통과 시각)] 영점 확인 — 각 정류장의 시각표 도착 15초 전 ~ 30초 뒤(45초) 동안 신선한 GPS 가 그 정류장 부근(정확도 반경을 뺀 거리 200m, 최종 목적지는 250m)에 한 번이라도 잡히면
//           '제대로 달리고 있다' = state 'near'(도착 시각 3초 전부터 apply:true — 앱이 진행도를 그 정류장으로 맞춘다). 시각표는 바꾸지 않는다(엔진 출력에 시각 보정이 없다).
//           창이 끝났는데 가까운 위치가 없으면 600m 넘는 위치만 있으면 'far', 쓸 위치가 아예 없으면 'none', 그 사이(250~600m)는 'off'. 잡히지 않아도 벌은 없다.
//           final = 최종 목적지(fin) 판정 verdict: 'verify'(창 안) · 'confirmed'(창 끝에 가까운 위치 있음 → 앱은 안내 종료) · 'notyet'(먼 위치만 → 아직 도착 전) · 'unknown'(위치 없음/애매 → 앱은 [안내 종료] 버튼).
//           창이 끝난 뒤에도 30분까지는 최근 45초로 다시 판정한다(늦게 도착해 GPS 가 나중에 잡혀도 confirmed 로 바뀐다).
//   board : 지하철 승차 확정 전(plan.notDeparted)에만. 승차역(plan.boardPt)에서 멀어졌지만 신선한 GPS 가 '걷는 속도'로 이어지면 열차를 탄 게 아니다 → walkingAway.
//           앱은 이때 '승차역에서 멀어짐·시각 경과·기지국 변화'만으로 승차를 확정하지 않는다(시뮬: 지하철 먼저 계획에서 안 타고 돌아가거나 걸어도 승차로 처리).
//
//   bus   : (plan.busLeg 가 있을 때) 2026-10-13 YJ: "버스 안 타고 승용차를 탔는데 역으로 인식한다". '버스를 정말 탔나'의 판정.
//           plan.busLeg = { boardPt:{lat,lng}, boardIdx?, proof?:'button'|'vehicle'|'ridden' }  (진행도가 어디에 있든 보낸다 — 지하철역에 '확정'돼 있어도 버스를 안 탔으면 거짓 확정이다)  (proof = 앱이 가진 확실한 탑승 증거: 탑승 버튼 · 실시간 차량 매칭 — 앱은 이름만 전한다)
//           state: 'confirmed'(proof 있음) · 'plausible'(승차 정류장 부근을 지났고 계획 시각보다 앞서 달리지 않음) · 'notBus'(차량 속도로 움직이는데
//                  승차 정류장을 지난 적이 없거나[why 'no_stop'], 뒤 정류장들에 계획보다 5분 넘게 먼저 닿는다[why 'ahead'] → 버스가 아니다) ·
//                  'idle'(차량 속도가 아니다) · 'unknown'(궤적이 승차 시점을 덮지 못함 등 판단 불가 — 아무 일도 하지 않는다)
//           plan.stops[].planMs = 처음 계획 도착 시각, plan.stops[].bus = 버스 정류장 여부(앱이 시각을 당겨도 변하지 않는 값) — 'ahead' 판정에만 쓴다.
//   press : (want.press 일 때) 탑승·환승 버튼을 누른 순간 승차역(plan.pressPt)에 있나 — { state:'at'|'near'|'away'|'unknown', distM, ageSec }. 앱은 'away'(800m 밖) 일 때만 버튼을 거둔다.
//   mode  : 지금 위치를 무엇으로 잡을지(엔진이 정한다, 앱은 따른다). { kind:'sub', gps:'zero' }  지하철 탑승 확정 = 시각표로 움직이고 GPS 는 역마다 영점만 ·
//           { kind:'bus', gps:'heavy', snapM, advanceSec }  버스 탑승(확정·그럴듯함) = GPS 를 더 쓴다(정류장 투영 반경 snapM, 정류장 진행 간격 advanceSec) · 없으면 null
//   motion: (2026-10-19) 네비게이션식 '지금 달리는 중인가' — { moving: true|false|null(모른다), speedMps, n, ageSec }. 최근 14초 좋은 좌표의 순 이동 속도(1.4m/s↑ 달림 · 0.7m/s↓ 정지). 앱은 버스 구간 마커의 달림/정지(노랑)를 이 값으로 그린다.
//   busPos: (2026-10-19) 버스를 타는 중(plan.progIsBus 이거나 bus.state confirmed/plausible, notBus 아님) · plan.boarded 일 때, 같은 구간(plan.stops[].lg)의 버스 정류장을 이은 선 위 지금 위치.
//           { lg, offM(선에서 떨어진 m), fromI·toI(지금 위치 앞·뒤 정류장 앱 번호), ratio, distAlong, passed:[{i, ms}](이미 지난 정류장과 통과 시각 — 선 위 이동 거리로 초 단위 보간), passedUnknown:[i](궤적이 시작할 때 이미 지나 있어 시각을 모르는 정류장) }
//           앱은 진행도를 그 정류장까지 올리고 시각을 통과 증거(gps)로 적어 보낸다 → 엔진(ride-eta)이 남은 정류장 시각을 당기거나 민다. 선에서 busPosOffM(150m) 넘게 벗어나면 주지 않는다.
//
// 이 파일은 의존성이 없다. 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';

var RIDE_TRACK_DEFAULTS = {
  offM: 350,              // 경로선에서 이만큼 벗어나면 이탈 후보
  offWinSec: 70,          // 이 시간 동안 들어온 서로 다른 좌표 전부가 벗어나 있어야 이탈 (예전: 10초 틱 6번 연속)
  offMinFixes: 4,         // 그 시간 안에 필요한 서로 다른 좌표 수(좌표가 같은 값으로 반복되면 한 번으로 센다 = 끊긴 GPS)
  offMinSpanSec: 50,      // 첫 좌표와 마지막 좌표가 이만큼 떨어져 있어야 한다(순간 오차 무시)
  // 진행도가 지하철 노드일 때: 지하 진입 직전 튄 좌표와 구분해야 하므로 더 엄격하게. 지상에서 확실히 움직이는 좌표가 충분히 있을 때만 이탈로 본다.
  subWinSec: 100, subMinFixes: 6, subMinSpanSec: 80, subMinMoveM: 90, subMaxAcc: 60,
  freshSec: 25,           // 마지막 좌표가 이보다 오래됐으면 '끊긴 GPS' — 이탈도 못 탔다는 증명도 하지 않는다
  maxAcc: 120,            // 정확도가 이보다 나쁜 좌표는 쓰지 않는다
  // 타고 있는 차 찾기(예전 _matchRiddenRoute): 지나온 길 평균/최대/현재 위치가 후보 경로선에서 떨어진 거리(m)
  fitMean: 120, fitMax: 300, fitTail: 200, fitBetterBy: 60, rideWinSec: 480, rideMinFixes: 4,
  curBadMean: 200, curBadTail: 300,
  // 못 탔다는 증명(예전 _missProof)
  // 걷는 중인지(승차 안 함): 승차역에서 departM(기본 400m) 넘게 떨어진 신선한 좌표가 걷는 속도(앞·뒤 덩어리 중앙값 사이 순속도 ≤ 3m/s; 열차는 8m/s 이상)로 이어짐
  walkWinSec: 75, walkMinFixes: 5, walkMinSpanSec: 45, walkMaxSpeed: 3.0, walkDepartM: 400,
  missWinSec: 120, missD80: 80, missMinSpanSec: 45, missMinFixes: 3, missCellN: 2,
  // 영점 확인 / 도착 확인
  pressNearM: 300,        // 탑승·환승 버튼을 눌렀을 때 승차역에서 이 안이면 '역에 있다'
  pressFarM: 800,         // 이보다 멀면 '역에 없다' — 버튼을 거둔다(그 사이는 믿는다)
  busStopNearM: 150,      // 승차 정류장을 '지났다'고 보는 반경(정확도 일부를 뺀 거리)
  busStopAccCap: 50,      // 위 거리에서 빼 주는 정확도의 상한
  subRideWinSec: 120, subRideMinFixes: 4, subRideMinSpanSec: 90, subRideOffM: 600, subRideMaxAcc: 60,   // 지하철 탑승 확정 중 이탈: 신선한 정확한 좌표가 2분 가까이 전부 경로선에서 600m 밖일 때만
  busTrailMaxAgeSec: 570, // 앱 궤적은 10분(600초)보다 오래된 점을 버린다 — 맨 앞 점이 이만큼 오래됐으면 밀려났을 수 있다
  busTrailCap: 240,       // 앱이 보내는 궤적 점 수의 상한 — 이만큼 차면 오래된 점이 밀려나 '승차 정류장을 지난 적 없음'을 말할 수 없다
  busCoverSlackSec: 20,   // 궤적이 움직임 시작보다 이만큼 앞서 시작해야 '정류장을 지난 적 없음'을 말할 수 있다
  busAheadSec: 300,       // 뒤 정류장에 계획 시각보다 이만큼 먼저 닿으면 앞서 달린 것
  busAheadMinStops: 2,    // 그런 정류장이 이만큼 이상이어야 '버스가 아님'
  busStopNearReachM: 200, // 뒤 정류장 '닿았다' 반경
  busGpsSnapM: 500,       // 버스 탑승 중 GPS 를 정류장 투영에 쓰는 반경(지하철/기본 200)
  busAdvanceSec: 8,       // 버스 탑승 중 GPS 로 정류장을 하나 더 올려도 되는 간격(기본 15)
  trailMaxSpeedMps: 60, zeroLeadSec: 25, zeroWinSec: 55, zeroSlideSec: 45, zeroNearM: 200, zeroFinalNearM: 250, zeroFarM: 600, zeroApplyLeadSec: 3, zeroKeepSec: 20, zeroFinalKeepMin: 30,
  // ★ 2026-10-13 (YJ: "시간표보다 빠르게 선학에 왔어. 위치는 맞혔는데 시간이 안맞춰져. 시간도 같이 밀거나 당기며 계속 영점"): 시각표 창(도착 15초 전~30초 뒤) 밖에서 닿은 열차(일찍·늦게)도 놓치지 않도록
  //   pass:true 인 정류장은 '표시 도착 시각 앞뒤' 넓은 창에서 GPS 가 그 정류장 150m 안(정확도 60m 이하 좌표)에 든 가장 가까운 순간을 통과 시각(passMs)으로 돌려준다 — 앱은 그 시각을 통과 증거로 엔진에 다시 보낸다.
  passAheadSec: 300, passLateSec: 420, passBackSec: 300, passNearM: 150, passAccM: 60, passInterpMaxGapSec: 30, passConfirmSec: 20, passAwayM: 100,
  // ★ 2026-10-13 (YJ: "마커도 계속 엔진에 위치를 물어보고 영점 잡고 보정해야지 — 밀거나 당기거나"): 늦게 오는 열차 — 표시 도착 시각이 지났는데 신선한 GPS 가 '앞 정류장과 이 정류장 사이'에서 이 정류장과 notYetFarM 넘게 떨어져 있으면 notYet:true(아직 안 닿음). 앱은 이 증거를 /ride-eta 에 보내고 엔진이 뒤 시각을 민다.
  notYetFarM: 400, notYetMaxLateSec: 300, notYetBetween: 1.25, notYetAccM: 100,
  // ★ 2026-10-19 (YJ: "버스는 지상이 대부분이니까 네비게이션처럼 GPS 를 써 · 버스가 계속 움직이는데 마커는 정지(노랑)"): 움직임 · 버스 위치.
  //   motion : 신선한 좌표 몇 개의 '순 이동 속도'(m/s)로 지금 달리는 중인지 본다(지하철 PF 의 정차 판정과 무관 — 네비게이션식).
  //   busPos : 버스 구간 정류장을 이은 선 위에서 지금 위치(정류장 사이 비율)와 이미 지난 정류장의 통과 시각(선 위 이동 거리로 보간).
  motionWinSec: 14, motionMinSpanSec: 4, motionMaxAcc: 60, motionMoveMps: 1.4, motionStopMps: 0.7,
  busPosOffM: 150, busPosFixAccM: 60, busPosMinStops: 2, busPosMinGapM: 15
};

// ── 기하 ──────────────────────────────────────────────────────────────────────
function rtHav(aLat, aLng, bLat, bLng) {
  var R = 6371000, dLat = (bLat - aLat) * Math.PI / 180, dLng = (bLng - aLng) * Math.PI / 180;
  var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
// 점 → 선분 최단거리(m). 위경도 → m 근사(한국 위도대; 앱이 쓰던 값과 같다)
function rtSegDist(pLat, pLng, aLat, aLng, bLat, bLng) {
  var kx = 88000, ky = 111000;
  var px = pLng * kx, py = pLat * ky, ax = aLng * kx, ay = aLat * ky, bx = bLng * kx, by = bLat * ky;
  var dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  var t = len2 ? (((px - ax) * dx + (py - ay) * dy) / len2) : 0;
  t = Math.max(0, Math.min(1, t));
  var qx = ax + dx * t, qy = ay + dy * t;
  return Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
}
function rtPathDist(lat, lng, pts) {
  if (!pts || pts.length < 2) return null;
  var best = Infinity;
  for (var j = 0; j < pts.length - 1; j++) {
    var d = rtSegDist(lat, lng, pts[j].lat, pts[j].lng, pts[j + 1].lat, pts[j + 1].lng);
    if (d < best) best = d;
  }
  return best;
}
function rtMed(a) { var v = a.slice().sort(function (x, y) { return x - y; }); return v.length ? v[Math.floor(v.length / 2)] : null; }

// ── 궤적 정리: 형식 통일 · 정확도 나쁜 점 제거 · floor 이전 제거 ─────────────────────────
function rtTrail(P, O) {
  var now = P.nowMs, floor = P.floorMs || 0, out = [], raw = P.trail || [];
  for (var i = 0; i < raw.length; i++) {
    var q = raw[i], ts, lat, lng, acc;
    if (Array.isArray(q)) { ts = q[0]; lat = q[1]; lng = q[2]; acc = q[3]; } else if (q) { ts = q.ts; lat = q.lat; lng = q.lng; acc = q.acc; } else continue;
    if (!isFinite(ts) || !isFinite(lat) || !isFinite(lng)) continue;
    if (ts < floor || ts > now + 5000 || now - ts > 600000) continue;
    if (acc != null && isFinite(acc) && acc > O.maxAcc) continue;
    out.push({ ts: ts, lat: lat, lng: lng, acc: (acc != null && isFinite(acc)) ? acc : null });
  }
  out.sort(function (a, b) { return a.ts - b.ts; });
  return out;
}
// 같은 좌표가 이어서 반복되는 것(끊긴 GPS 가 마지막 값을 재사용)은 한 번으로 센다
function rtDistinct(tr) {
  var out = [], last = null;
  for (var i = 0; i < tr.length; i++) {
    var sig = Math.round(tr[i].lat * 1e5) + ',' + Math.round(tr[i].lng * 1e5);
    if (sig === last) continue;
    last = sig; out.push(tr[i]);
  }
  return out;
}

// 지하철 탑승 확정 중의 이탈(좁은 규칙) — 위 rtOff 설명 참고
function rtOffSubRiding(P, tr, O, res) {
  var plan = P.plan || {}, now = P.nowMs, pts = plan.pts || [], i;
  if (pts.length < 2) { res.why = 'sub_confirmed'; return res; }
  var w = rtDistinct(tr.filter(function (p) { return now - p.ts <= O.subRideWinSec * 1000; }));
  res.n = w.length;
  if (!w.length) { res.why = 'sub_confirmed'; return res; }
  var last = w[w.length - 1];
  if (now - last.ts > O.freshSec * 1000) { res.why = 'sub_confirmed'; return res; }
  if (w.length < O.subRideMinFixes) { res.why = 'sub_confirmed'; return res; }
  res.spanSec = Math.round((last.ts - w[0].ts) / 1000);
  if (last.ts - w[0].ts < O.subRideMinSpanSec * 1000) { res.why = 'sub_confirmed'; return res; }
  var ds = [];
  for (i = 0; i < w.length; i++) {
    if (w[i].acc != null && w[i].acc > O.subRideMaxAcc) { res.why = 'sub_confirmed'; return res; }   // 정확도가 나쁜 좌표(지하 진입·출구 근처 튄 점)가 섞이면 판정하지 않는다
    ds.push(rtPathDist(w[i].lat, w[i].lng, pts));
  }
  res.distM = Math.round(rtMed(ds));
  if (!(ds[ds.length - 1] > O.subRideOffM)) { res.why = 'on_path'; return res; }          // 지금은 경로선 가까이(복귀·지상 구간 열차)
  for (i = 0; i < ds.length; i++) if (!(ds[i] > O.subRideOffM)) { res.why = 'sub_confirmed'; return res; }
  res.confirmed = true; res.why = 'off_sub_riding';
  return res;
}
// ── 이탈 ──────────────────────────────────────────────────────────────────────
function rtOff(P, tr, O) {
  var plan = P.plan || {}, now = P.nowMs;
  var res = { confirmed: false, distM: null, n: 0, spanSec: 0, why: '' };
  var sup = (plan.suppress || []).filter(function (x) { return x !== 'subRiding'; });          // subRiding = 앱이 '지하철 탑승 확정'으로 본 것 — 아래에서 따로 다룬다
  if (sup.length) { res.why = 'suppressed:' + sup.join(','); return res; }
  // 2026-10-12: 지하철 탑승이 확정이면 일반 이탈 판정(경로선 150m 등)은 하지 않는다(YJ: 지하철 잘 타다 버스 경로로 바뀜).
  // ★ 2026-10-14 (시뮬: 지하철을 타다 중간에 내려 걸어가거나 택시를 타도 영영 재탐색하지 않았다): 좁은 규칙 하나만 둔다 — 신선하고 정확한 지상 좌표가 2분 가까이 '전부' 경로선에서 600m 밖.
  //   지하(GPS 없음)·지상 구간을 달리는 열차(경로선 위)는 해당 없고, 후보 경로로 갈아타기(rtRidden)는 계속 막는다.
  if (plan.subConfirmed === true) return rtOffSubRiding(P, tr, O, res);
  if (plan.notDeparted) { res.why = 'not_departed'; return res; }
  var pts = plan.pts || [];
  if (pts.length < 2) { res.why = 'no_path'; return res; }
  var sub = !!plan.progIsSub;
  var win = (sub ? O.subWinSec : O.offWinSec) * 1000, minN = sub ? O.subMinFixes : O.offMinFixes, minSpan = (sub ? O.subMinSpanSec : O.offMinSpanSec) * 1000;
  var w = rtDistinct(tr.filter(function (p) { return now - p.ts <= win; }));
  res.n = w.length;
  if (!w.length) { res.why = 'no_fix'; return res; }
  var last = w[w.length - 1];
  if (now - last.ts > O.freshSec * 1000) { res.why = 'stale'; return res; }
  if (w.length < minN) { res.why = 'few_fixes'; return res; }
  res.spanSec = Math.round((last.ts - w[0].ts) / 1000);
  if (last.ts - w[0].ts < minSpan) { res.why = 'short_span'; return res; }
  var ds = [], i;
  for (i = 0; i < w.length; i++) ds.push(rtPathDist(w[i].lat, w[i].lng, pts));
  res.distM = Math.round(rtMed(ds));
  for (i = 0; i < ds.length; i++) if (!(ds[i] > O.offM)) { res.why = 'on_path'; return res; }
  if (sub) {
    // 지하철을 타러 가는/타는 중인데 지상 좌표가 계속 경로선 밖: 정확도가 좋고(지하 진입 직전의 튄 좌표 제외) 실제로 움직였을 때만
    var accs = w.map(function (p) { return p.acc; }).filter(function (a) { return a != null; });
    var ma = accs.length ? rtMed(accs) : null;
    if (ma != null && ma > O.subMaxAcc) { res.why = 'sub_poor_acc'; return res; }
    var mv = 0; for (i = 1; i < w.length; i++) { var m = rtHav(w[0].lat, w[0].lng, w[i].lat, w[i].lng); if (m > mv) mv = m; }
    if (mv < O.subMinMoveM) { res.why = 'sub_still'; return res; }
  }
  res.confirmed = true; res.why = sub ? 'off_surface_sub' : 'off';
  return res;
}

// ── 지금 차량 속도로 움직이는 중인가(예전 _evVehicleNow) ─────────────────────────────────
function rtVehicleNow(tr, now) {
  var fit = function (winMs, minPts, minSpan, dSeg, dTot, minV) {
    var pts = tr.filter(function (q) { return now - q.ts <= winMs; });
    if (pts.length < minPts) return false;
    if ((pts[pts.length - 1].ts - pts[0].ts) / 1000 < minSpan) return false;
    var k = Math.floor(pts.length / 3);
    var med = function (arr, key) { return rtMed(arr.map(function (z) { return z[key]; })); };
    var g = function (a, b) { var seg = pts.slice(a, b); return { lat: med(seg, 'lat'), lng: med(seg, 'lng'), ts: med(seg, 'ts') }; };
    var P1 = g(0, k), P2 = g(k, pts.length - k), P3 = g(pts.length - k, pts.length);
    var d12 = rtHav(P1.lat, P1.lng, P2.lat, P2.lng), d23 = rtHav(P2.lat, P2.lng, P3.lat, P3.lng), d13 = rtHav(P1.lat, P1.lng, P3.lat, P3.lng);
    var t13 = (P3.ts - P1.ts) / 1000; if (t13 < minSpan * 0.6) return false;
    return d12 >= dSeg && d23 >= dSeg && d13 >= dTot && d13 / t13 >= minV && d13 >= 0.8 * (d12 + d23);
  };
  return fit(50000, 6, 30, 40, 100, 4.5) || fit(300000, 20, 200, 250, 700, 2.6);
}

// ── 타고 있는 차 찾기(예전 _matchRiddenRoute) ───────────────────────────────────────
function rtTrailFit(pts, tr) {
  if (!pts || pts.length < 2 || !tr || !tr.length) return null;
  var sum = 0, mx = 0, ds = [], i;
  for (i = 0; i < tr.length; i++) { var d = rtPathDist(tr[i].lat, tr[i].lng, pts); ds.push(d); sum += d; if (d > mx) mx = d; }
  var tail = 0; for (i = Math.max(0, ds.length - 3); i < ds.length; i++) if (ds[i] > tail) tail = ds[i];
  return { mean: sum / ds.length, max: mx, tail: tail, n: ds.length };
}
function rtRidden(P, tr, O, vehNow) {
  var cands = P.cands || [], plan = P.plan || {}, now = P.nowMs;
  if (cands.length < 2) return null;
  if (plan.subConfirmed === true) return null;                         // 2026-10-12: 지하철 탑승이 확정이면 다른 후보 경로로 갈아타지 않는다(YJ)
  var onVeh = plan.boarded === true || plan.riding === true || vehNow;
  if (!onVeh) return null;                                           // 걷고 있으면 맞추지 않는다(재탐색)
  var from = Math.max(plan.startMs ? plan.startMs - 30000 : 0, now - O.rideWinSec * 1000);
  var w = tr.filter(function (q) { return q.ts >= from && now - q.ts <= O.rideWinSec * 1000; });
  if (w.length < O.rideMinFixes) return null;
  var cur = rtTrailFit(plan.pts, w), best = null, bestFit = null;
  for (var i = 0; i < cands.length; i++) {
    var c = cands[i]; if (!c || c.longDist === true || !c.pts || c.pts.length < 3) continue;
    var f = rtTrailFit(c.pts, w); if (!f) continue;
    if (!bestFit || f.mean < bestFit.mean) { bestFit = f; best = c; }
  }
  if (!best) return null;
  var ok = bestFit.mean <= O.fitMean && bestFit.max <= O.fitMax && bestFit.tail <= O.fitTail;     // 지나온 길과 현재 위치가 모두 그 경로 위여야 한다
  if (ok && cur && !(bestFit.mean + O.fitBetterBy < cur.mean)) ok = false;                         // 지금 보던 경로보다 확실히 잘 맞아야 한다
  var l = w[w.length - 1];
  return { id: best.id, ok: ok, mean: Math.round(bestFit.mean), max: Math.round(bestFit.max), tail: Math.round(bestFit.tail),
           curMean: cur ? Math.round(cur.mean) : null, curTail: cur ? Math.round(cur.tail) : null,
           curBad: !!(cur && cur.mean > O.curBadMean && cur.tail > O.curBadTail), last: { lat: l.lat, lng: l.lng } };
}

// ── 못 탔다는 증명(예전 _missProof) — 신선한 정지 증거가 있을 때만 ──────────────────────────
function rtMiss(P, tr, O) {
  var plan = P.plan || {}, now = P.nowMs, sn = P.sensor || {};
  var res = { proof: false, why: '' };
  if (plan.riding === true || plan.boarded === true) { res.why = 'riding'; return res; }
  var w = tr.filter(function (p) { return now - p.ts <= O.missWinSec * 1000; });
  if (w.length < O.missMinFixes) { res.why = 'few_fixes'; return res; }
  var last = w[w.length - 1];
  // ★ 2026-10-12: 지하로 들어가면 GPS 가 끊기고 마지막 좌표가 '가만히 서 있는 증거'로 남는다 → 신선하지 않으면 증명하지 않는다(지하철 먼저 계획에서 늦은 열차가 '놓침'으로 처리되던 원인).
  if (now - last.ts > O.freshSec * 1000) { res.why = 'stale'; return res; }
  var dt = (last.ts - w[0].ts) / 1000;
  if (dt < O.missMinSpanSec) { res.why = 'short_span'; return res; }
  var ds = [];
  for (var i = 1; i < w.length; i++) ds.push(rtHav(w[0].lat, w[0].lng, w[i].lat, w[i].lng));
  ds.sort(function (a, b) { return a - b; });
  var d80 = ds[Math.min(ds.length - 1, Math.floor(ds.length * 0.8))];
  if (d80 > O.missD80) { res.why = 'moving'; return res; }
  if ((sn.cellN180 || 0) >= O.missCellN) { res.why = 'cell_changes'; return res; }
  if (sn.pfSeg === true) { res.why = 'pf_moving'; return res; }
  res.proof = true; res.why = 'still ' + Math.round(d80) + 'm/' + Math.round(dt) + 's';
  return res;
}

// ── 승차 안 하고 걸어서 멀어짐(예전 앱: 멀어지면 무조건 '탔다') ───────────────────────────────
function rtBoard(P, tr, O) {
  var plan = P.plan || {}, now = P.nowMs, bp = plan.boardPt;
  if (!plan.notDeparted || !bp || !isFinite(bp.lat) || !isFinite(bp.lng)) return null;
  var res = { walkingAway: false, distM: null, speed: null, why: '' };
  var w = rtDistinct(tr.filter(function (p) { return now - p.ts <= O.walkWinSec * 1000; }));
  if (w.length < O.walkMinFixes) { res.why = 'few_fixes'; return res; }
  var last = w[w.length - 1];
  if (now - last.ts > O.freshSec * 1000) { res.why = 'stale'; return res; }
  var span = (last.ts - w[0].ts) / 1000;
  if (span < O.walkMinSpanSec) { res.why = 'short_span'; return res; }
  var dm = plan.departM || O.walkDepartM, ds = w.map(function (p) { return rtHav(p.lat, p.lng, bp.lat, bp.lng); });
  res.distM = Math.round(rtMed(ds));
  for (var i = 0; i < ds.length; i++) if (ds[i] <= dm * 0.5) { res.why = 'near_station'; return res; }   // 아직 역 근처 좌표가 섞여 있다
  var k = Math.max(1, Math.floor(w.length / 3));
  var med = function (arr, key) { return rtMed(arr.map(function (z) { return z[key]; })); };
  var a = w.slice(0, k), b = w.slice(w.length - k);
  var A = { lat: med(a, 'lat'), lng: med(a, 'lng'), ts: med(a, 'ts') }, B = { lat: med(b, 'lat'), lng: med(b, 'lng'), ts: med(b, 'ts') };
  var dt = (B.ts - A.ts) / 1000; if (dt < span * 0.4) { res.why = 'short_span'; return res; }
  res.speed = +(rtHav(A.lat, A.lng, B.lat, B.lng) / dt).toFixed(2);
  if (res.speed > O.walkMaxSpeed) { res.why = 'fast'; return res; }
  res.walkingAway = true; res.why = 'walking ' + res.speed + 'm/s ' + res.distM + 'm';
  return res;
}

// ── 영점 확인 · 도착 확인 ─────────────────────────────────────────────
function rtZeroStop(s, tr, now, O) {
  var lead = O.zeroLeadSec * 1000, win = O.zeroWinSec * 1000, slideWin = O.zeroSlideSec * 1000, ws = s.arrMs - lead, we = ws + win;   // ★ 2026-10-14 (YJ: 영점도 일찍): 창 = 도착 25초 전 ~ 30초 뒤(예전 15초 전 ~ 30초 뒤). 끝은 그대로, 시작만 10초 일찍
  var active = now >= ws && now <= we, ended = now > we;
  if (now < ws) return null;
  var sliding = false;
  if (ended) {
    if (s.fin && now - s.arrMs <= O.zeroFinalKeepMin * 60000) sliding = true;       // 최종 목적지는 늦게 도착해도 최근 45초로 다시 본다
    else if (now - we > O.zeroKeepSec * 1000) return null;                          // 중간 역은 창이 끝난 뒤 잠깐만 알려 준다
  }
  var from = sliding ? now - slideWin : ws - 2000, to = sliding ? now : (ended ? we : now);
  var R = s.fin ? O.zeroFinalNearM : O.zeroNearM, n = 0, near = 0, far = 0, best = null;
  for (var i = 0; i < tr.length; i++) {
    var q = tr[i];
    if (q.ts < from || q.ts > to + 1000) continue;
    if (q.acc != null && q.acc > 150) continue;
    var acc = q.acc == null ? 50 : q.acc, d = rtHav(q.lat, q.lng, s.lat, s.lng) - acc;
    n++;
    if (best == null || d < best) best = d;
    if (d <= R) near++; else if (d > O.zeroFarM) far++;
  }
  var dt = now - s.arrMs, st;
  if (near >= 1 && near >= far) st = 'near';
  else if (active) st = 'pending';
  else if (far >= 1) st = 'far';
  else if (n === 0) st = 'none';
  else st = 'off';
  var r = { i: s.i, fin: !!s.fin, state: st, apply: (st === 'near' && dt >= -O.zeroApplyLeadSec * 1000), dtSec: Math.round(dt / 1000), n: n, near: near, far: far, distM: best == null ? null : Math.round(best) };
  if (s.fin) r.verdict = (active && !sliding) ? 'verify' : (st === 'near' ? 'confirmed' : (st === 'far' ? 'notyet' : 'unknown'));
  return r;
}
// 통과 시각: 표시 도착 시각 앞뒤의 넓은 창에서 정류장에 가장 가까웠던 좌표의 시각(정확도 좋은 좌표만). 없으면 null.
function rtPassTime(s, tr, now, O) {
  if (now < s.arrMs - O.passAheadSec * 1000 || now - s.arrMs > O.passLateSec * 1000) return null;
  var lo = s.arrMs - O.passBackSec * 1000, best = null;
  for (var i = 0; i < tr.length; i++) {
    var q = tr[i];
    if (q.ts < lo || q.ts > now + 1000) continue;
    if (q.acc != null && q.acc > O.passAccM) continue;
    var d = rtHav(q.lat, q.lng, s.lat, s.lng);
    if (d <= O.passNearM && (best == null || d < best.d)) best = { d: d, ms: q.ts, i: i };
  }
  if (!best) return null;
  // ★ 2026-10-26 s207 (보수화): '가장 가까운 순간'은 지나고 나서야 알 수 있다. 아직 다가오는 중(가장 가까운 좌표가 맨 끝이고 더 가까워지는 중)에 통과로 적으면 열차가 닿기 전 시각이 박힌다
  //   (모의 실험: 처음 박힌 통과 시각이 실제보다 10~25초 이르다가 나중에 고쳐짐). 그 뒤 좌표가 passAwayM 이상 멀어졌거나, 가장 가까웠던 순간에서 passConfirmSec 가 지났을 때(정차 · 좌표 끊김 포함)에만 통과로 적는다.
  var conf = now - tr[best.i].ts >= O.passConfirmSec * 1000;
  for (var cj = best.i + 1; !conf && cj < tr.length; cj++) {
    var cq = tr[cj];
    if (cq.ts > now + 1000) break;
    if (cq.acc != null && cq.acc > O.passAccM) continue;
    if (rtHav(cq.lat, cq.lng, s.lat, s.lng) >= best.d + O.passAwayM) conf = true;
  }
  if (!conf) return null;
  // ★ 2026-10-14 (YJ: "영점 조절 gps 잡을 때 초 단위까지 함께 앞뒤로 밀어줘. 몇 초가 계속 쌓이면 나중에 오차가 커지니까"):
  //   '가장 가까웠던 샘플'의 시각은 샘플 간격(수 초~십수 초)만큼 틀릴 수 있다. 앞뒤 샘플 사이에서 정류장에 가장 가까웠던 순간을 직선 보간으로 구해 초 단위(ms)로 쓴다.
  var ms = best.ms, dMin = best.d, bi = best.i, gapMs = O.passInterpMaxGapSec * 1000, cand = [bi - 1, bi];
  for (var c = 0; c < cand.length; c++) {
    var a = tr[cand[c]], b = tr[cand[c] + 1];
    if (!a || !b || b.ts <= a.ts || b.ts - a.ts > gapMs || b.ts > now + 1000) continue;
    if ((a.acc != null && a.acc > O.passAccM) || (b.acc != null && b.acc > O.passAccM)) continue;
    var kx = 111320 * Math.cos(s.lat * Math.PI / 180), ax = (a.lng - s.lng) * kx, ay = (a.lat - s.lat) * 111320, bx = (b.lng - s.lng) * kx, by = (b.lat - s.lat) * 111320;
    var vx = bx - ax, vy = by - ay, vv = vx * vx + vy * vy;
    if (!(vv > 0)) continue;
    var u = -(ax * vx + ay * vy) / vv;
    if (u <= 0 || u >= 1) continue;
    var px = ax + u * vx, py = ay + u * vy, dd = Math.sqrt(px * px + py * py);
    if (dd < dMin - 0.5) { dMin = dd; ms = Math.round(a.ts + u * (b.ts - a.ts)); }
  }
  return { ms: ms, distM: Math.round(dMin) };
}
// 아직 안 닿음: 표시 도착 시각이 지났는데(최대 notYetMaxLateSec) 마지막 신선한 좌표가 앞 정류장과 이 정류장 '사이'에 있고 이 정류장에서 notYetFarM 넘게 멀다.
//   (이미 지나쳐 멀어진 경우와 가르기 위해 '사이'일 때만 — 앞 정류장 좌표가 없으면 판정하지 않는다.)
function rtNotYet(s, prev, tr, now, O) {
  if (!prev || !isFinite(prev.lat) || !isFinite(prev.lng)) return null;
  var late = now - s.arrMs;
  if (late < 0 || late > O.notYetMaxLateSec * 1000 || !tr.length) return null;
  var q = null;
  for (var i = tr.length - 1; i >= 0; i--) { if (tr[i].acc == null || tr[i].acc <= O.notYetAccM) { q = tr[i]; break; } }
  if (!q || now - q.ts > O.freshSec * 1000) return null;
  var dn = rtHav(q.lat, q.lng, s.lat, s.lng), dp = rtHav(q.lat, q.lng, prev.lat, prev.lng), L = rtHav(prev.lat, prev.lng, s.lat, s.lng);
  if (dn <= O.notYetFarM || L <= 0) return null;
  if (dp + dn > L * O.notYetBetween) return null;
  return { distM: Math.round(dn) };
}
// ★ 2026-10-14 (실기기 로그: 앱을 다시 켜자 쌓였던 위치가 한꺼번에 와 모두 '지금' 시각이 찍혀, 지난 역 전부가 19:16 에 지난 것으로 읽혔다 — 동수 +6.2분·부평 +4.2분 …):
//   같은(거의 같은) 시각인데 멀리 떨어진 좌표는 사실일 수 없다(속도 상한 trailMaxSpeedMps). 뒤에서부터 보며 그런 앞 좌표를 버린다 — 가장 최신 좌표만 남는다.
function rtSane(tr, O) {
  var out = [], i, q, nx = null;
  for (i = tr.length - 1; i >= 0; i--) {
    q = tr[i];
    if (nx) {
      var dt = Math.max(1, Math.abs(nx.ts - q.ts) / 1000), accs = (nx.acc == null ? 50 : nx.acc) + (q.acc == null ? 50 : q.acc);
      if (rtHav(q.lat, q.lng, nx.lat, nx.lng) - accs > O.trailMaxSpeedMps * dt + 60) continue;
    }
    out.push(q); nx = q;
  }
  return out.reverse();
}
function rtZero(P, tr, O) {
  var plan = P.plan || {}, stops = plan.stops || [], now = P.nowMs, out = { stops: [], final: null };
  if (!plan.boarded || !stops.length) return out;
  tr = rtSane(tr, O);
  for (var k = 0; k < stops.length; k++) {
    var s = stops[k];
    if (!s || !isFinite(s.arrMs) || !isFinite(s.lat) || !isFinite(s.lng)) continue;
    var r = rtZeroStop(s, tr, now, O), ps = (s.pass === true && !s.fin) ? rtPassTime(s, tr, now, O) : null;
    var ny = (!ps && s.pass === true && !s.fin) ? rtNotYet(s, k > 0 ? stops[k - 1] : null, tr, now, O) : null;
    if (!r && !ps && !ny) continue;
    if (ny && r && r.state === 'near') ny = null;
    if (!r && !ps && !ny) continue;
    if (!r) r = { i: s.i, fin: !!s.fin, state: 'pass', apply: false, dtSec: Math.round((now - s.arrMs) / 1000), n: 0, near: 0, far: 0, distM: null };
    if (ny) { r.notYet = true; r.notYetDistM = ny.distM; }
    if (ps) { r.passMs = ps.ms; r.passDistM = ps.distM; r.passEarlySec = Math.round((ps.ms - s.arrMs) / 1000); r.apply = true; if (r.state !== 'near') r.state = 'near'; }
    out.stops.push(r);
    if (r.fin) out.final = r;
  }
  return out;
}

// ── 버스를 정말 탔나(2026-10-13 YJ: 버스 안 타고 승용차를 탔는데 역으로 인식) ─────────────────────────
//   승차 '확정'이 차량 속도만으로 서기 때문에 승용차·택시도 버스 탑승으로 읽힌다. 속도로는 버스와 승용차를 가를 수 없으니
//   (1) 확실한 증거(탑승 버튼·실시간 차량 매칭) (2) 승차 정류장을 지난 적이 있나 (3) 뒤 정류장에 계획보다 훨씬 먼저 닿나 로 가른다.
function rtReach(tr, lat, lng, nearM, capAcc) {
  // 정확도를 일부 빼고 nearM 안에 든 첫 좌표의 시각(없으면 null)
  for (var i = 0; i < tr.length; i++) {
    var q = tr[i], acc = q.acc == null ? 50 : Math.min(q.acc, capAcc);
    if (rtHav(q.lat, q.lng, lat, lng) - acc <= nearM) return q.ts;
  }
  return null;
}
// 움직임 시작 시각을 앱이 모를 때(탑승 증거 시각이 없음): 궤적 맨 앞이 가만히 서 있다가(20초 안에 40m 미만) 150m 넘게 벗어난 첫 좌표의 시각. 궤적이 이미 달리는 중에 시작했으면 null.
function rtMotionStart(tr, O) {
  if (!tr.length) return null;
  var t0 = tr[0], i, still = true;
  for (i = 1; i < tr.length && tr[i].ts - t0.ts <= 20000; i++) if (rtHav(t0.lat, t0.lng, tr[i].lat, tr[i].lng) >= 40) still = false;
  if (!still) return null;
  for (i = 1; i < tr.length; i++) if (rtHav(t0.lat, t0.lng, tr[i].lat, tr[i].lng) > 150) return tr[i].ts;
  return null;
}
function rtBus(P, tr, O, vehNow) {
  var plan = P.plan || {}, b = plan.busLeg, now = P.nowMs;
  if (!b) return null;
  var res = { state: 'unknown', why: '', stopSeen: null, ahead: 0 };
  var sup = (plan.suppress || []).filter(function (x) { return x !== 'subRiding'; });          // subRiding = 앱이 '지하철 탑승 확정'으로 본 것 — 그게 거짓인지 가리는 중이므로 쉬는 이유가 아니다
  if (sup.length) { res.state = 'idle'; res.why = 'suppressed:' + sup.join(','); return res; }
  if (b.proof === 'button' || b.proof === 'vehicle' || b.proof === 'ridden') { res.state = 'confirmed'; res.why = 'proof_' + b.proof; return res; }
  var moving = vehNow === true || plan.riding === true || plan.boarded === true;
  if (!moving) { res.state = 'idle'; res.why = 'not_moving'; return res; }
  if (!tr.length) { res.why = 'no_fix'; return res; }
  var last = tr[tr.length - 1];
  if (now - last.ts > O.freshSec * 1000) { res.why = 'stale'; return res; }
  var bp = b.boardPt, seen = null;
  if (bp && isFinite(bp.lat) && isFinite(bp.lng)) {
    var t = rtReach(tr, bp.lat, bp.lng, O.busStopNearM, O.busStopAccCap);
    seen = t != null; res.stopSeen = seen;
  }
  // 뒤 정류장에 계획보다 먼저 닿았나(처음 계획 시각 기준)
  var stops = plan.stops || [], ahead = 0, k;
  for (k = 0; k < stops.length; k++) {
    var s = stops[k];
    if (!s || s.bus !== true || !isFinite(s.planMs) || !isFinite(s.lat) || !isFinite(s.lng)) continue;
    if (b.boardIdx != null && s.i <= b.boardIdx) continue;                 // 승차 정류장은 일찍 가 있을 수 있다
    var tt = rtReach(tr, s.lat, s.lng, O.busStopNearReachM, O.busStopAccCap);
    if (tt != null && tt < s.planMs - O.busAheadSec * 1000) ahead++;
  }
  res.ahead = ahead;
  if (seen === true) {
    if (ahead >= O.busAheadMinStops) { res.state = 'notBus'; res.why = 'ahead'; return res; }
    res.state = 'plausible'; res.why = 'stop_seen'; return res;
  }
  if (ahead >= O.busAheadMinStops) { res.state = 'notBus'; res.why = 'ahead'; return res; }
  if (seen === false) {
    // 승차 정류장을 지난 적이 없다 — 궤적이 움직임 시작 전부터 있을 때만 단정한다(오래전에 지나 궤적 밖으로 밀려난 것일 수 있다)
    // ★ 2026-10-14 (시뮬 bus/faithful: 계획대로 버스를 타는데 10분쯤 뒤 '승용차'로 판정돼 재탐색): 궤적은 최근 busTrailCap 점만 남아 오래된 점이 밀려난다.
    //   승차 증거 시각(startMs)이 승차 정류장 통과보다 늦으면, 정류장 통과는 밀려나고 궤적 맨 앞은 아직 startMs 보다 앞이라 '지난 적 없음'으로 잘못 읽혔다.
    //   → 궤적이 점 수 상한에 닿았거나 맨 앞 점이 10분 가까이 됐으면(오래된 점이 밀려났을 수 있다) 단정하지 않는다.
    if (tr.length >= O.busTrailCap || now - tr[0].ts >= O.busTrailMaxAgeSec * 1000) { res.why = 'trail_capped'; return res; }
    var from = plan.startMs || null;
    if (!from) from = rtMotionStart(tr, O);
    if (from && tr[0].ts <= from - O.busCoverSlackSec * 1000) { res.state = 'notBus'; res.why = 'no_stop'; return res; }
    res.why = 'trail_short'; return res;
  }
  res.why = 'no_board_pt'; return res;
}
// 탑승·환승 버튼을 누른 순간의 GPS 확인(2026-10-13 YJ: "환승을 누르면 한 번 더 GPS 확인 후 시간표 기준으로 따라가면 좋겠다")
//   plan.pressPt = 누른 구간의 승차역 좌표. 신선한(freshSec) 좋은 좌표가 있으면 정확도 일부를 뺀 거리로 'at'(300m 안) · 'away'(800m 밖) · 'near'(그 사이 — 믿는다),
//   쓸 좌표가 없으면(지하) 'unknown' — 앱은 'away' 일 때만 버튼을 거둔다.
function rtPress(P, tr, O) {
  var plan = P.plan || {}, pp = plan.pressPt, now = P.nowMs;
  if (!pp || !isFinite(pp.lat) || !isFinite(pp.lng)) return null;
  var res = { state: 'unknown', distM: null, ageSec: null, why: '' };
  var q = null, i;
  for (i = tr.length - 1; i >= 0; i--) { if (tr[i].acc == null || tr[i].acc <= O.maxAcc) { q = tr[i]; break; } }
  if (!q) { res.why = 'no_fix'; return res; }
  res.ageSec = Math.round((now - q.ts) / 1000);
  if (now - q.ts > O.freshSec * 1000) { res.why = 'stale'; return res; }
  var acc = q.acc == null ? 50 : Math.min(q.acc, O.busStopAccCap), d = Math.max(0, rtHav(q.lat, q.lng, pp.lat, pp.lng) - acc);
  res.distM = Math.round(d);
  if (d <= O.pressNearM) { res.state = 'at'; res.why = 'near_station'; }
  else if (d > O.pressFarM) { res.state = 'away'; res.why = 'far_from_station'; }
  else { res.state = 'near'; res.why = 'between'; }
  return res;
}
// ── 움직임(네비게이션식) ─────────────────────────────────────────────────────────
//   최근 motionWinSec 안의 좋은 좌표 처음~끝의 순 이동 거리(정확도의 절반씩을 뺀다)를 시간으로 나눈 속도. 좌표가 모자라거나 오래되면 moving:null(모른다).
//   moving: true(≥ motionMoveMps) · false(≤ motionStopMps) · 그 사이는 직전 값을 알 수 없으므로 null — 앱은 null 이면 기존 판정을 쓴다.
function rtMotion(tr, now, O) {
  var res = { moving: null, speedMps: null, n: 0, ageSec: null };
  var pts = [], i;
  for (i = 0; i < tr.length; i++) { var q = tr[i]; if (now - q.ts <= O.motionWinSec * 1000 && (q.acc == null || q.acc <= O.motionMaxAcc)) pts.push(q); }
  res.n = pts.length;
  if (tr.length) res.ageSec = Math.round((now - tr[tr.length - 1].ts) / 1000);
  if (pts.length < 2) return res;
  var a = pts[0], b = pts[pts.length - 1], dt = (b.ts - a.ts) / 1000;
  if (dt < O.motionMinSpanSec || now - b.ts > O.freshSec * 1000) return res;
  var d = rtHav(a.lat, a.lng, b.lat, b.lng) - ((a.acc == null ? 20 : a.acc) + (b.acc == null ? 20 : b.acc)) / 2;
  var v = Math.max(0, d) / dt;
  res.speedMps = Math.round(v * 10) / 10;
  if (v >= O.motionMoveMps) res.moving = true; else if (v <= O.motionStopMps) res.moving = false;
  return res;
}
// ── 버스 위치(정류장을 이은 선 위) ───────────────────────────────────────────────
//   plan.stops[].lg = 같은 노선·같은 탈것으로 이어진 구간 번호, bus = 버스 정류장. 같은 lg 의 버스 정류장을 순서대로 이어 선으로 본다.
//   각 구간에서 최신 좌표가 선에서 busPosOffM 이내인 구간을 고른다(가장 가까운 것). 좌표 → 선 위 이동 거리(m)로 바꿔 두면 정류장마다 '그 거리를 넘어선 순간'이 통과 시각이다
//   (마지막으로 정류장 앞이던 좌표 ↔ 처음 정류장 뒤인 좌표 사이를 거리 비율로 보간 — 좌표 간격이 30초 넘어도 거리로 보간하므로 초 단위가 맞는다).
//   반환: { lg, offM, fromI, toI, ratio, distAlong, passed:[{i, ms}], passedUnknown:[i…] }  — 최신 좌표 앞의 정류장 i 는 모두 지난 것이고, 시각을 알면 ms.
function rtBusPos(P, tr, O) {
  var plan = P.plan || {}, stops = plan.stops || [], now = P.nowMs;
  if (!plan.boarded || !stops.length || !tr.length) return null;
  var last = null, k;
  for (k = tr.length - 1; k >= 0; k--) { if (tr[k].acc == null || tr[k].acc <= O.busPosFixAccM) { last = tr[k]; break; } }
  if (!last || now - last.ts > O.freshSec * 1000) return null;
  var legs = {}, order = [];
  for (k = 0; k < stops.length; k++) {
    var s = stops[k];
    if (!s || s.bus !== true || s.lg == null || !isFinite(s.lat) || !isFinite(s.lng)) continue;
    if (!legs[s.lg]) { legs[s.lg] = []; order.push(s.lg); }
    legs[s.lg].push(s);
  }
  var best = null, g;
  for (g = 0; g < order.length; g++) {
    var L = legs[order[g]];
    if (L.length < O.busPosMinStops) continue;
    var cum = [0], j;
    for (j = 1; j < L.length; j++) cum.push(cum[j - 1] + rtHav(L[j - 1].lat, L[j - 1].lng, L[j].lat, L[j].lng));
    var pr = rtBusProject(L, cum, last.lat, last.lng);
    if (pr && pr.off <= O.busPosOffM && (!best || pr.off < best.pr.off)) best = { lg: order[g], L: L, cum: cum, pr: pr };
  }
  if (!best) return null;
  var L2 = best.L, cum2 = best.cum, pr2 = best.pr;
  var out = { lg: best.lg, offM: Math.round(pr2.off), fromI: L2[pr2.seg].i, toI: L2[Math.min(L2.length - 1, pr2.seg + 1)].i, ratio: Math.round(pr2.ratio * 1000) / 1000, distAlong: Math.round(pr2.s), passed: [], passedUnknown: [] };
  // 궤적 → 선 위 거리(선에서 busPosOffM 안인 좌표만)
  var xs = [];
  for (k = 0; k < tr.length; k++) {
    var q = tr[k]; if (q.acc != null && q.acc > O.busPosFixAccM) continue;
    var p = rtBusProject(L2, cum2, q.lat, q.lng);
    if (p && p.off <= O.busPosOffM) xs.push({ ts: q.ts, s: p.s });
  }
  var sNow = pr2.s;
  for (k = 1; k < L2.length; k++) {                       // 첫 정류장은 승차(지난 것이 아니다)
    var sk = cum2[k];
    if (sNow < sk + O.busPosMinGapM) continue;             // 아직 안 지났다(정류장 바로 뒤 몇 m 는 같은 정류장으로 본다)
    var lb = -1, x;
    for (x = 0; x < xs.length; x++) { if (xs[x].s < sk) lb = x; }
    if (lb < 0) { out.passedUnknown.push(L2[k].i); continue; }       // 궤적이 시작할 때 이미 지나 있었다 — 시각을 모른다
    var A = xs[lb], B = xs[lb + 1];
    if (!B || B.s < sk) { out.passedUnknown.push(L2[k].i); continue; }
    var ms = (B.s > A.s) ? Math.round(A.ts + (sk - A.s) / (B.s - A.s) * (B.ts - A.ts)) : B.ts;
    if (ms > now + 1000) ms = now;
    out.passed.push({ i: L2[k].i, ms: ms });
  }
  return out;
}
// 점 → 정류장 선(꺾은선) 투영: { seg, ratio, s(선 위 거리 m), off(선에서 떨어진 m) }
function rtBusProject(L, cum, lat, lng) {
  var bestD = Infinity, res = null, j;
  for (j = 0; j < L.length - 1; j++) {
    var d = rtSegDist(lat, lng, L[j].lat, L[j].lng, L[j + 1].lat, L[j + 1].lng);
    if (d < bestD) {
      var kx = 88000, ky = 111000, ax = L[j].lng * kx, ay = L[j].lat * ky, bx = L[j + 1].lng * kx, by = L[j + 1].lat * ky, px = lng * kx, py = lat * ky;
      var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      bestD = d; res = { seg: j, ratio: t, s: cum[j] + t * (cum[j + 1] - cum[j]), off: d };
    }
  }
  return res;
}
// 위치를 무엇으로 잡을지 — 엔진이 정한다(앱은 따른다)
function rtMode(P, O, bus) {
  var plan = P.plan || {};
  if (bus && bus.state === 'notBus') return null;
  if (plan.subConfirmed === true) return { kind: 'sub', gps: 'zero' };
  if (bus && (bus.state === 'confirmed' || bus.state === 'plausible') && plan.boarded === true)
    return { kind: 'bus', gps: 'heavy', snapM: O.busGpsSnapM, advanceSec: O.busAdvanceSec };
  return null;
}

// ── 진입 ──────────────────────────────────────────────────────────────────────
function rideTrack(P) {
  P = P || {};
  var O = {}, k, D = RIDE_TRACK_DEFAULTS;
  for (k in D) O[k] = D[k];
  if (P.opts) for (k in P.opts) O[k] = P.opts[k];
  if (!isFinite(P.nowMs)) P.nowMs = Date.now();
  var want = P.want || { off: true, ridden: true, miss: true };
  var tr = rtTrail(P, O), last = tr.length ? tr[tr.length - 1] : null;
  var out = { v: 1, fix: { n: tr.length, ageSec: last ? Math.round((P.nowMs - last.ts) / 1000) : null, fresh: !!(last && P.nowMs - last.ts <= O.freshSec * 1000) },
              off: null, ridden: null, miss: null, board: null, vehicleNow: false, bus: null, mode: null, press: null, motion: null, busPos: null };
  out.vehicleNow = rtVehicleNow(tr, P.nowMs);
  if (want.off) out.off = rtOff(P, tr, O);
  if (want.ridden) out.ridden = rtRidden(P, tr, O, out.vehicleNow);
  if (want.miss) out.miss = rtMiss(P, tr, O);
  if (want.board !== false) out.board = rtBoard(P, tr, O);
  if (want.zero) out.zero = rtZero(P, tr, O);
  if (want.bus !== false) out.bus = rtBus(P, tr, O, out.vehicleNow);
  // ★ 2026-10-13: 궤적이 후보 버스 경로(엔진 후보 중 다른 번호 — 급행 등)를 따라 달리면 '버스를 탔다'는 뜻이다. 계획 시각보다 먼저 닿는 건 더 빠른 버스라서지 승용차가 아니다 → notBus 로 보지 않는다.
  if (out.bus && out.bus.state === 'notBus' && out.ridden && out.ridden.ok) { out.bus.state = 'plausible'; out.bus.why = 'candidate_route'; }
  if (want.press === true) out.press = rtPress(P, tr, O);
  out.motion = tr.length ? rtMotion(tr, P.nowMs, O) : null;
  // 버스 위치: 버스를 타고 있다고 볼 근거가 있을 때(진행도가 버스 노드이거나 엔진이 버스로 봄)만 — 승용차(notBus)면 주지 않는다
  if (want.bus !== false && (!out.bus || out.bus.state !== 'notBus') && ((P.plan && P.plan.progIsBus === true) || (out.bus && (out.bus.state === 'confirmed' || out.bus.state === 'plausible')))) out.busPos = rtBusPos(P, tr, O);
  out.mode = rtMode(P, O, out.bus);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Worker 진입점 — route-v2 의 fetch 에서  if (url.pathname === "/ride-track") return handleRideTrack(request);
// ─────────────────────────────────────────────────────────────────────────────
function handleRideTrack(request) {
  var H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
  if (request.method === 'OPTIONS') return Promise.resolve(new Response(null, { status: 204, headers: H }));
  if (request.method !== 'POST') return Promise.resolve(new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: H }));
  return request.json().then(function (body) {
    var out;
    try { out = rideTrack(body); } catch (e) { return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500, headers: H }); }
    return new Response(JSON.stringify(out), { headers: H });
  }, function () { return new Response(JSON.stringify({ error: 'JSON 아님' }), { status: 400, headers: H }); });
}

if (typeof module !== 'undefined') module.exports = { rideTrack: rideTrack, handleRideTrack: handleRideTrack, RIDE_TRACK_DEFAULTS: RIDE_TRACK_DEFAULTS };
