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
//         want?:{ off, ridden, miss, zero } }     (생략하면 off·ridden·miss — zero 는 요청할 때만)
//         plan.stops?:[{ i, lat, lng, arrMs, fin? }…]   (zero 용) 승차 뒤 지나는 역·정류장 — i=앱 노드 번호, arrMs=시각표(엔진이 맞춘 표시) 도착 시각, fin=최종 목적지
// 출력  { v, fix:{n, ageSec, fresh}, off:{confirmed, distM, n, spanSec, why},
//         ridden:{id, ok, mean, max, tail, curMean, curTail, curBad, last:{lat,lng}} | null,
//         miss:{proof, why}, board:{walkingAway, distM, speed, why} | null, vehicleNow }
//   zero  : (want.zero, plan.boarded 일 때만) 영점 확인 — 각 정류장의 시각표 도착 15초 전 ~ 30초 뒤(45초) 동안 신선한 GPS 가 그 정류장 부근(정확도 반경을 뺀 거리 200m, 최종 목적지는 250m)에 한 번이라도 잡히면
//           '제대로 달리고 있다' = state 'near'(도착 시각 3초 전부터 apply:true — 앱이 진행도를 그 정류장으로 맞춘다). 시각표는 바꾸지 않는다(엔진 출력에 시각 보정이 없다).
//           창이 끝났는데 가까운 위치가 없으면 600m 넘는 위치만 있으면 'far', 쓸 위치가 아예 없으면 'none', 그 사이(250~600m)는 'off'. 잡히지 않아도 벌은 없다.
//           final = 최종 목적지(fin) 판정 verdict: 'verify'(창 안) · 'confirmed'(창 끝에 가까운 위치 있음 → 앱은 안내 종료) · 'notyet'(먼 위치만 → 아직 도착 전) · 'unknown'(위치 없음/애매 → 앱은 [안내 종료] 버튼).
//           창이 끝난 뒤에도 30분까지는 최근 45초로 다시 판정한다(늦게 도착해 GPS 가 나중에 잡혀도 confirmed 로 바뀐다).
//   board : 지하철 승차 확정 전(plan.notDeparted)에만. 승차역(plan.boardPt)에서 멀어졌지만 신선한 GPS 가 '걷는 속도'로 이어지면 열차를 탄 게 아니다 → walkingAway.
//           앱은 이때 '승차역에서 멀어짐·시각 경과·기지국 변화'만으로 승차를 확정하지 않는다(시뮬: 지하철 먼저 계획에서 안 타고 돌아가거나 걸어도 승차로 처리).
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
  zeroLeadSec: 15, zeroWinSec: 45, zeroNearM: 200, zeroFinalNearM: 250, zeroFarM: 600, zeroApplyLeadSec: 3, zeroKeepSec: 20, zeroFinalKeepMin: 30
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

// ── 이탈 ──────────────────────────────────────────────────────────────────────
function rtOff(P, tr, O) {
  var plan = P.plan || {}, now = P.nowMs;
  var res = { confirmed: false, distM: null, n: 0, spanSec: 0, why: '' };
  if (plan.suppress && plan.suppress.length) { res.why = 'suppressed:' + plan.suppress.join(','); return res; }
  if (plan.subConfirmed === true) { res.why = 'sub_confirmed'; return res; }          // 2026-10-12: 지하철 탑승이 확정이면 이탈 판정을 하지 않는다(YJ)
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
  var lead = O.zeroLeadSec * 1000, win = O.zeroWinSec * 1000, ws = s.arrMs - lead, we = ws + win;
  var active = now >= ws && now <= we, ended = now > we;
  if (now < ws) return null;
  var sliding = false;
  if (ended) {
    if (s.fin && now - s.arrMs <= O.zeroFinalKeepMin * 60000) sliding = true;       // 최종 목적지는 늦게 도착해도 최근 45초로 다시 본다
    else if (now - we > O.zeroKeepSec * 1000) return null;                          // 중간 역은 창이 끝난 뒤 잠깐만 알려 준다
  }
  var from = sliding ? now - win : ws - 2000, to = sliding ? now : (ended ? we : now);
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
function rtZero(P, tr, O) {
  var plan = P.plan || {}, stops = plan.stops || [], now = P.nowMs, out = { stops: [], final: null };
  if (!plan.boarded || !stops.length) return out;
  for (var k = 0; k < stops.length; k++) {
    var s = stops[k];
    if (!s || !isFinite(s.arrMs) || !isFinite(s.lat) || !isFinite(s.lng)) continue;
    var r = rtZeroStop(s, tr, now, O);
    if (!r) continue;
    out.stops.push(r);
    if (r.fin) out.final = r;
  }
  return out;
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
              off: null, ridden: null, miss: null, board: null, vehicleNow: false };
  out.vehicleNow = rtVehicleNow(tr, P.nowMs);
  if (want.off) out.off = rtOff(P, tr, O);
  if (want.ridden) out.ridden = rtRidden(P, tr, O, out.vehicleNow);
  if (want.miss) out.miss = rtMiss(P, tr, O);
  if (want.board !== false) out.board = rtBoard(P, tr, O);
  if (want.zero) out.zero = rtZero(P, tr, O);
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
