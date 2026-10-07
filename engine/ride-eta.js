// 길동무 — 탑승 중 도착시각 계산 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수)
//
// ★ 원칙(YJ): "계산은 전부 엔진이 한다. 앱은 그리기만 한다."
//   예전에는 앱(www/index.html)이 역·정류장 통과 시각(_nodePassMs)을 보고 직접 도착시각을 다시 계산했다
//   (_recalcArrivalsFrom · _htlSanityCheck · _htlSnapBoardArr · _monoDisplayFix). 그 계산을 이 파일로 옮겨 다듬었다.
//   앱은 매번 '지금까지의 증거 전부'를 보내고, 이 함수가 노드별 도착시각을 돌려준다(상태 없음 = stateless).
//
// 입력  { nowMs, nodes:[{name,isSub,isBus,isWalk,isOrigin,lineName,planMin}], passes:[{idx,ms,src}], boarded,
//         timetable?:{boardIdx,times[]}, notDeparted?, platformWaiting?, live?:[{idx,ms}], boardNext?:{ms,src,allowEarlier,maxWaitMin}, boardArriveMs?, tzOffsetMin?, opts? }
//   planMin : 처음 안내한 도착 예정(하루 안의 분, 자정을 넘으면 1440 이상). 앱이 덮어쓴 값이 아니라 '원래 값'을 항상 보낸다.
//   passes  : 통과 증거. src = 'board'(승차 확정) | 'move'(움직임 시작 시각 — 되짚어 찍은 값) | 'gps' | 'pf'(위치 채택) | 'cell'(기지국 선행) | 'drift'
//             같은 역에 증거가 여러 개여도 된다(예: 기지국 선행 + 뒤이은 PF 채택) — 어느 것을 믿을지는 여기서 정한다.
//   timetable: 첫 승차역의 정적 시각표 출발 분(승차 직후 한 번만 쓰인다)
// 출력  { arr:["HH:MM"…], etaMs:[ms…], schedMin:[분…], delayMin, anchorIdx, notes:[…], boardShiftMin?(승차 전만) }
//
// 이 파일은 의존성이 없다. 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// 조정값. 전부 '측정으로 고칠 수 있는' 값이다(근거는 각 줄 주석). 요청의 opts 로 덮어쓸 수 있다(민감도 점검용).
// ─────────────────────────────────────────────────────────────────────────────
var RIDE_ETA_DEFAULTS = {
  // ★ 2026-10-07 (PF 채택 지연): 위치 채택(PF)은 실제 통과보다 5~70초(평균 ≈ 37초) 늦게 찍힌다 → 실제 통과 ≈ 채택 시각 − 35초.
  pfLagSec: 35, pfLagMinSec: 5, pfLagMaxSec: 70,
  // 승차 확정이 실제 승차보다 늦은 정도: 보통 20~120초, 가끔(약 20%) 2~6.5분.
  //   ★ 2026-10-07: boardFloor(범위 밖 바닥 확률) 0.004 → 0.0008. 바닥이 높으면 '확정 지연 > 370초' 쪽으로 퍼진 평탄 꼬리가 분포의 10~90% 구간을 부풀려, 한쪽 봉우리가 분명한데도 값이 가운데로 끌려갔다.
  boardLagMinSec: 20, boardLagNormSec: 120, boardLateMinSec: 170, boardLagMaxSec: 370, boardNormW: 0.8, boardSoftMin: 0.25, boardFloor: 0.0008,
  // 기지국 선행 통과는 실제 통과보다 1~3분 이르다.
  cellLeadMinSec: 60, cellLeadMaxSec: 180,
  // GPS 통과: 가장 가까웠던 순간 ±15초
  gpsTolSec: 15,
  // 움직임 시작(src 'move'): 앱이 위치 궤적에서 '달리기가 시작된 때'를 되짚어 찍은 값(앱: 탑승 증거가 선 시각 − 60초). 증거가 서는 때는 출발 뒤 25~120초라
  //   찍힌 값은 실제 출발보다 −35~+60초(이르거나 늦다)에 놓이고, 문턱 근처 오차 ±10초. (실측 전의 가정 — 실차 기록으로 보정할 값)
  moveLagMinSec: -35, moveLagMaxSec: 60, moveTolSec: 10,
  // ★ 2026-10-07 (원인: 승차 확정이 3~6분 늦으면 직후 PF 채택이 5초 간격으로 한꺼번에 몰려 찍힘): 앞 기록과 이 간격(초) 안에 찍힌 통과 = '몰림'.
  //   실제 통과보다 훨씬 늦은 시각이라 지연의 상한일 뿐이다 → 지연 수준을 정하는 데 쓰지 않는다.
  backlogGapSec: 12, burstExactSec: 6.5, burstAmbigW: 0.5,
  // 열차는 시각표 구간 소요의 60% 보다 빨리 달릴 수 없다(기존 앱 규칙 '앵커 하한'의 일반화). 뒤 통과가 이보다 빠르게 찍혔으면 앞 통과는 늦게 알게 된 기록이다.
  minRunRatio: 0.6, burstTolSec: 45,
  // 지연 수준을 정할 때 보는 '가장 최근 믿을 만한 통과' 개수(기존 앱: 최근 3개). 오래된 통과는 지연 변화를 못 따라가므로 버린다.
  levelWindow: 3,
  // 강건 가능도(robust): 통과 하나하나를 '맞다(지금 지연 수준을 알려 줌)'와 '이후 지연이 갑자기 바뀌었거나(구간 중 정차·서행) 이상치다'의 혼합으로 본다.
  //   그 통과 뒤 지나온 역 수 k 만큼 '바뀌었을' 확률 q = 1−(1−epsJump)^k + epsOut. 하드 창(levelWindow) 대신 오래된 통과는 서서히 영향이 줄고, 한 번의 엉뚱한 통과는 여러 통과가 한 목소리를 내면 무시된다.
  robust: 0, epsJump: 0.04, epsOut: 0.03, robustFloor: 0.03,
  //   hmm: 1 이면 위 아이디어를 변화점 필터로 정확히 푼다(통과를 순서대로 보며 사후분포를 이음). jumpScaleMin: 갑작스런 변화 폭(라플라스 척도, 분).
  earlyJumpMaxMin: 0,
  hmm: 1, bimodalSpanMin: 0, looseOnlyAtStart: 1, jumpUpScaleMin: 4, jumpDnScaleMin: 1.5, jumpUpW: 0.75, priorNegWideSd: 3.5,
  // 구간 안에서 지연은 서서히 변한다: 한 역당 변화폭(분, √역수로 늘어남)과, 늦어지는 쪽으로의 평균 기울기(분/역)
  driftPerStop: 0.12, driftBiasPerStop: 0.07,
  // 지연 사전 분포(분): 열차는 대개 예정 근처(좁은 봉우리) + 가끔 크게 어긋남(넓은 꼬리). 증거가 없을 때만 영향을 준다.
  priorDelayMin: 0.5, priorNarrowW: 0.5, priorNarrowSd: 3, priorWideSd: 8,
  // 범위 가장자리의 부드러움(분)
  softMin: 0.2,
  // 최종 지연 수준 = 확률 분포의 10~90% 구간 한가운데(둘로 갈리는 상황에서 어느 쪽이 맞아도 오차가 반으로 줄도록)
  quantile: 0.1,
  // ★ 2026-10-07 (몰림 증거를 확률로): 몰림 기록은 '실제 통과 + 채택 지연(5~70초) ≤ 기록'이라 가능도가 d 가 낮을수록 서서히 커지는 경사다.
  //   false 면 예전처럼 상한 계단(d ≤ 기록 − 5초)으로만 쓴다(되돌리기용).
  burstRamp: true,
  // 정적 시간표 스냅: 승차 확정 시각 N분 전까지의 열차만 후보(17:35 탑승인데 17:29 열차로 끌려가지 않게). 열차가 시각표보다 일찍 떠나지 않는다는 하한으로 쓴다.
  //   ★ 2026-10-07: 후보를 '확정 직전 snapCandMaxMin 분 안의 시각표 열차 전부'로 넓힘(확정이 늦은 경우 진짜 탄 열차는 더 앞 열차). 2분 안 열차 가중 1, 그보다 앞 열차 snapOldW,
  //   어느 후보에도 안 맞는 지연도 snapEps 만큼은 남겨 둔다(시각표를 벗어난 운행이 있어도 못박지 않게).
  snapBackMin: 2, snapLateMaxMin: 1.5, snapCandMaxMin: 6, snapEps: 0.5, snapOldW: 0.4,
  // 승차 전인데 예정 승차 시각이 '지금'보다 이만큼(분) 넘게 지났으면 경로 전체를 지금에 맞춘다(기존 _htlSanityCheck 의 40분)
  staleShiftMin: 40,
  // ★ 2026-10-07 (앱의 시각 계산을 엔진으로 옮김 — 'overdue' = 예전 앱의 _pfOverdueShift / _htlDelayTrack):
  //   앵커(마지막 통과) 뒤 첫 정차 노드의 예정 시각이 이만큼(초) 지났는데 도착 증거가 없으면 그만큼 늦는 것이다 → 그 노드를 '지금 + overdueExtraMin 분'으로 미루고 뒤를 같은 폭만큼 민다(최대 overdueMaxMin 분).
  //   엔진은 상태가 없어 매번 같은 식으로 다시 계산하므로 누적되지 않는다.
  overdueSec: 60, overdueMaxMin: 15, overdueExtraMin: 0.5, overdueGain: 1, overdueMode: 'clamp',
  // 승강장에서 열차를 기다리는 중(platformWaiting): 예정 출발이 platMinOverMin 분 넘게 지났고 platGraceMin 분 안이면 늦는 것으로 보고 승차역부터 '지금 + platExtraMin 분'으로 민다(예전 앱의 _platformLateShift).
  platMinOverMin: 1, platGraceMin: 4, platExtraMin: 0.5,
  // 실시간 도착정보(live: 앱이 서울 열린데이터 등에서 받아 보내는 '이 역에 이 시각에 도착')가 현재 계산과 이만큼(초) 이상 어긋나면 그 노드를 그 시각으로 맞추고 뒤를 같은 폭만큼 민다(예전 앱의 _rtArrPoll → _htlShiftFrom).
  liveMinSec: 20, liveMaxSec: 900,
  // 실시간 도착정보를 구간 지연 필터의 측정값으로 쓴다(liveHmm=1): 표준편차 liveSdSec 의 가우시안 + 엉뚱한 열차를 집었을 확률 epsLive 의 이상치 혼합.
  liveHmm: 1, liveSdSec: 30, epsLive: 0.35,
  // 다음 차 시각(boardNext)을 반영하는 최대 대기(분) — 첫차 대기·운행 종료 같은 값은 반영하지 않는다(예전 앱 _maxWait)
  boardMaxWaitMin: 30,
  // 표시 반올림: 'round'(가장 가까운 분) | 'floor'(내림 — 예전 앱)
  rounding: 'round'
};

function _reFold(d) { return d - Math.round(d / 1440) * 1440; }          // 자정 접힘: 차이를 ±12시간 안으로
function _reHHMM(ms, tzMin, rounding) {
  var m = (ms + tzMin * 60000) / 60000;
  m = (rounding === 'floor') ? Math.floor(m + 1e-9) : Math.round(m);
  m = ((m % 1440) + 1440) % 1440;
  var h = Math.floor(m / 60), mi = m % 60;
  return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
}
function _reMin(ms, tzMin) { var m = ((ms + tzMin * 60000) / 60000) % 1440; return (m + 1440) % 1440; }
function _reIsTransit(n) { return !!n && !n.isWalk && !n.isOrigin && (!!n.isSub || !!n.isBus); }
function _reMerge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
function _reSrcPri(src) { return src === 'gps' ? 6 : src === 'move' ? 5 : src === 'pf' ? 4 : src === 'drift' ? 3 : src === 'board' ? 2 : 1; }

// ─────────────────────────────────────────────────────────────────────────────
// 본체
// ─────────────────────────────────────────────────────────────────────────────
function rideEta(input) {
  input = input || {};
  var O = _reMerge(RIDE_ETA_DEFAULTS, input.opts);
  var tz = (typeof input.tzOffsetMin === 'number') ? input.tzOffsetMin : 540;     // 한국 표준시
  var nodes = input.nodes || [];
  var n = nodes.length;
  var notes = [];
  var passesIn = input.passes || [];
  var i, j, k, ii;

  var nowMs = +input.nowMs;
  if (!isFinite(nowMs)) {
    nowMs = 0;
    for (ii = 0; ii < passesIn.length; ii++) if (+passesIn[ii].ms > nowMs) nowMs = +passesIn[ii].ms;
    if (!nowMs) nowMs = Date.now();
  }

  // ── 1. 예정 시각(planMin)을 '지금' 기준 절대 시각(ms)으로. 자정을 넘는 경로도 이어서 센다(차이는 항상 ±12시간으로 접어서).
  var planMs = new Array(n), valid = new Array(n), firstValid = -1, prevValid = -1, chain = 0, nowMin = _reMin(nowMs, tz), ms0 = 0;
  for (i = 0; i < n; i++) {
    var pmI = nodes[i] && nodes[i].planMin;
    valid[i] = (pmI != null && isFinite(+pmI));
    if (!valid[i]) { planMs[i] = null; continue; }
    if (firstValid < 0) { firstValid = i; chain = +pmI; ms0 = nowMs + _reFold(+pmI - nowMin) * 60000; }
    else chain += _reFold(+pmI - (+nodes[prevValid].planMin));
    planMs[i] = ms0 + (chain - (+nodes[firstValid].planMin)) * 60000;
    prevValid = i;
  }
  if (firstValid < 0) return { arr: [], etaMs: [], delayMin: 0, anchorIdx: -1, notes: ['planMin 이 있는 노드가 없다'] };

  // ── 2. 승차 구간(leg) 구조 — 기존 _isLegStartIdx 와 같은 판정(앞이 도보·출발점이거나 노선·수단이 바뀌면 새 구간)
  var isLegStart = new Array(n), legOf = new Array(n), boardIdx = -1, curLeg = -1;
  for (i = 0; i < n; i++) {
    var nd = nodes[i], pv = nodes[i - 1];
    isLegStart[i] = !!(_reIsTransit(nd) && (!pv || pv.isWalk || pv.isOrigin || (pv.lineName || '') !== (nd.lineName || '') || !!pv.isBus !== !!nd.isBus));
    if (isLegStart[i]) curLeg = i;
    legOf[i] = _reIsTransit(nd) ? curLeg : -1;
    if (boardIdx < 0 && _reIsTransit(nd)) boardIdx = i;
  }

  // ── 3. 아직 안 탔으면 승차역부터 뒤는 건드리지 않는다(차는 시각표대로 온다 — 내가 걷는 속도와 무관하다).
  var out = new Array(n);
  function planOnly() { for (var q = 0; q < n; q++) out[q] = valid[q] ? planMs[q] : null; }
  if (input.notDeparted === true || input.boarded === false) {
    planOnly();
    notes.push('승차 전: 승차역 이후 시각은 예정 그대로');
    var bOk = boardIdx >= 0 && valid[boardIdx], shiftFrom = function (from, ms) { for (var q = from; q < n; q++) if (out[q] != null) out[q] += ms; };
    // (1) 실제 다음 차 시각(예전 앱 _applyRealBoardTime/applyDelay): 앱이 버스 도착정보·실시간 지하철·시각표에서 가져온 '내가 탈 수 있는 다음 차의 출발 시각'.
    //     열차는 이 시각에 오므로 승차역부터 그 시각으로 맞춘다(허용 범위 안일 때만 — allowEarlier 면 앞당김도, 아니면 늦춤만).
    if (bOk && input.boardNext && isFinite(+input.boardNext.ms)) {
      var bnx = input.boardNext, wN = (+bnx.ms - planMs[boardIdx]) / 60000, maxW = (bnx.maxWaitMin != null && isFinite(+bnx.maxWaitMin)) ? +bnx.maxWaitMin : O.boardMaxWaitMin;
      var okN = bnx.allowEarlier ? (Math.abs(wN) >= 1 && wN <= maxW && wN >= -180) : (wN > 0.5 && wN <= maxW);
      if (okN) { shiftFrom(boardIdx, wN * 60000); notes.push('다음 차 시각 ' + Math.round(wN * 10) / 10 + '분 반영(' + (bnx.src || '?') + ')'); }
    }
    // (2) 승강장 대기(예전 앱 _platformLateShift): 열차가 늦는 것으로 보고 승차역부터 시각을 민다. 처음 예정 기준 유예(platGraceMin)가 끝나면 '놓침' 판단은 앱의 몫이라 계산하지 않는다.
    if (input.platformWaiting === true && bOk) {
      var overP = (nowMs - out[boardIdx]) / 60000, origP = (nowMs - planMs[boardIdx]) / 60000;
      if (overP >= O.platMinOverMin && origP < O.platGraceMin) {
        var addP = (overP + O.platExtraMin) * 60000;
        shiftFrom(boardIdx, addP);
        notes.push('승강장 대기: 예정 출발 ' + Math.round(overP * 60) + '초 지남 → 열차 지연으로 보고 승차역 이후 +' + Math.round(addP / 1000) + '초');
      }
    }
    // (3) 승차역 시각은 내가 그 역에 닿는 시각보다 이를 수 없다(예전 앱 _htlBoardFixWait 불변식)
    if (bOk && isFinite(+input.boardArriveMs)) {
      var dA = (+input.boardArriveMs - out[boardIdx]) / 60000;
      if (dA > 0.02) { shiftFrom(boardIdx, dA * 60000); notes.push('승차역 시각을 내가 닿는 시각(' + Math.round(dA * 10) / 10 + '분 뒤)에 맞춤'); }
    }
    // (4) 예정 승차 시각이 '지금'보다 한참 지났으면(이미 떠난 차를 가리킴) 경로 전체를 지금에 맞춘다(예전 앱 _htlSanityCheck 의 40분)
    if (bOk) {
      var staleMin = (nowMs - out[boardIdx]) / 60000;
      if (staleMin > O.staleShiftMin) {
        shiftFrom(0, staleMin * 60000);
        notes.push('승차 전 예정이 ' + Math.round(staleMin) + '분 지나 경로 전체를 지금에 맞춤');
      }
    }
    var rPre = _reFinish(out, tz, O, -1, 0, notes, n, nowMs);
    rPre.boardShiftMin = bOk ? Math.round(((rPre.etaMs[boardIdx] != null ? rPre.etaMs[boardIdx] : planMs[boardIdx]) - planMs[boardIdx]) / 600) / 100 : 0;      // 승차역 시각이 처음 예정보다 얼마나 밀렸나(분)
    return rPre;
  }

  // ── 4. 통과 증거 정리: 역마다 하나만(gps > pf > drift > board > cell), 같은 종류면 먼저 안 쪽, 시각 순서가 거꾸로면 버림
  var byIdx = {}, P;
  for (ii = 0; ii < passesIn.length; ii++) {
    P = passesIn[ii];
    if (!P || !isFinite(+P.idx) || !isFinite(+P.ms)) continue;
    var ix = +P.idx;
    if (ix < 0 || ix >= n || !valid[ix] || !_reIsTransit(nodes[ix])) continue;
    var src = P.src || 'pf', cur = byIdx[ix];
    if (!cur || _reSrcPri(src) > _reSrcPri(cur.src) || (_reSrcPri(src) === _reSrcPri(cur.src) && +P.ms < cur.ms)) {
      if (cur && cur.src === 'cell' && src !== 'cell') notes.push('역 ' + ix + ': 기지국 선행 대신 위치 채택을 씀');
      byIdx[ix] = { idx: ix, ms: +P.ms, src: src };
    }
  }
  var ps = [];
  for (k in byIdx) ps.push(byIdx[k]);
  ps.sort(function (a, b) { return a.idx - b.idx; });
  var kept = [], lastMs = -Infinity;
  for (ii = 0; ii < ps.length; ii++) {
    if (ps[ii].ms < lastMs - 20000) { notes.push('역 ' + ps[ii].idx + ' 통과 시각이 앞 역보다 이르다 → 버림'); continue; }
    kept.push(ps[ii]); if (ps[ii].ms > lastMs) lastMs = ps[ii].ms;
  }
  ps = kept;
  if (!ps.length) {
    planOnly();
    notes.push('통과 증거 없음: 예정 그대로');
    return _reFinish(out, tz, O, -1, 0, notes, n, nowMs);
  }

  // ── 5. 정적 시간표 후보: 첫 승차역에서 확정 시각 직전 snapCandMaxMin 분 안에 떠난 시각표 열차 전부.
  //     (예전에는 '확정 2분 전 이후 가장 최근 열차' 하나만 골라 지연 ≥ 그 열차로 못박았다 → 확정이 3~6분 늦은 경우(진짜 탄 열차는 더 앞 열차)엔 엉뚱한 열차에 끌려가 최대 5분 오차.
  //      이제 후보 전부를 '여러 봉우리' 가능도로 넘기고, 어느 열차였는지는 확정 지연 분포가 가른다.) 승차 뒤 믿을 만한 통과가 하나라도 생기면 구간 모델이 쓰지 않는다.
  var snapIdx = -1, snap = null;
  var TT = input.timetable;
  if (TT && isFinite(+TT.boardIdx) && TT.times && TT.times.length && byIdx[+TT.boardIdx]) {
    var anyAfter = false;
    for (k in byIdx) if (+k > +TT.boardIdx) { anyAfter = true; break; }
    var bp = byIdx[+TT.boardIdx], bIdx = +TT.boardIdx;
    var bMin = _reMin(bp.ms, tz), floorMin = Math.floor(_reMin(bp.ms - O.snapBackMin * 60000, tz)), best = null, cands = [], sub0 = (bMin - Math.floor(bMin)) * 60000;
    for (j = 0; j < TT.times.length; j++) {
      var t = +TT.times[j];
      var dBack = _reFold(Math.floor(bMin) - t);                      // 승차 확정 분 − 시각표 분 (≥0 = 이미 떠난 열차)
      if (dBack < 0 || dBack > 30) continue;
      if (_reFold(t - floorMin) >= 0 && (best === null || dBack < best)) best = dBack;       // 확정 2분 전 이후 가장 최근 열차(알림용)
      if (dBack <= O.snapCandMaxMin) cands.push({ d: (bp.ms - sub0 - dBack * 60000 - planMs[bIdx]) / 60000, w: (_reFold(t - floorMin) >= 0) ? 1 : O.snapOldW });
    }
    if (cands.length && !anyAfter) {
      snapIdx = bIdx;
      snap = { delays: cands, note: best === null ? null : '정적 시간표 스냅: ' + (nodes[bIdx].name || bIdx) + ' 승차 확정 ' + _reHHMM(bp.ms, tz, 'floor') + ' → 시각표 ' + _reHHMM(bp.ms - sub0 - best * 60000, tz, 'floor') + ' 이후 출발로 본다' };
    }
  }

  // ── 6. 구간(leg)별 모델: 구간마다 '그 구간의 통과'만으로 지연 수준과 각 역의 실제 통과 시각을 추정한다.
  //     → 이미 끝난 앞 구간 역 시각은 뒤 구간의 지연·일찍 도착에 끌려가지 않는다(앞 구간 고정).
  var legsMap = {}, legKeys = [];
  for (ii = 0; ii < ps.length; ii++) { var lg = legOf[ps[ii].idx]; if (!legsMap[lg]) { legsMap[lg] = []; legKeys.push(lg); } legsMap[lg].push(ps[ii]); }
  var est = {}, legLevel = {}, liveUsed = {};
  for (ii = 0; ii < legKeys.length; ii++) {
    var L = legKeys[ii];
    var prior = O.priorDelayMin;
    if (ii > 0) prior = Math.max(O.priorDelayMin, legLevel[legKeys[ii - 1]]);     // 앞 구간이 늦으면 환승 열차도 늦다(지연 전파)
    var liveL = null;
    if (O.liveHmm && ii === legKeys.length - 1) {          // 마지막(현재) 구간에서 아직 안 지난 역의 실시간 도착정보만 지연 필터에 넣는다
      liveL = [];
      var lastPs = legsMap[L][legsMap[L].length - 1].idx, liveSeen = {};
      for (var lj = 0; lj < (input.live || []).length; lj++) {
        var LV0 = input.live[lj];
        if (!LV0 || !isFinite(+LV0.idx) || !isFinite(+LV0.ms)) continue;
        var li0 = +LV0.idx;
        if (li0 <= lastPs || li0 >= n || !valid[li0] || !_reIsTransit(nodes[li0]) || legOf[li0] !== L) continue;
        // 같은 역에 도착 예정 열차가 여러 대면(앞차·내 열차·뒤차) 모두 후보로 넘긴다 — 어느 것이 내 열차인지는 지연 필터가 통과 기록과 맞춰 가른다
        if (!liveSeen[li0]) { liveSeen[li0] = { idx: li0, ms: [] }; liveL.push(liveSeen[li0]); }
        if (liveSeen[li0].ms.length < 4) liveSeen[li0].ms.push(+LV0.ms);
      }
      liveL.sort(function (a, b) { return a.idx - b.idx; });
      for (lj = 0; lj < liveL.length; lj++) liveUsed[liveL[lj].idx] = 1;
    }
    var m = _reLegModel(legsMap[L], planMs, O, prior, snapIdx >= 0 && legOf[snapIdx] === L ? snap : null, notes, liveL);
    legLevel[L] = m.level;
    for (var e in m.est) est[e] = m.est[e];
  }
  var anchor = ps[ps.length - 1];
  var level = legLevel[legOf[anchor.idx]];
  if (legKeys.length > 1) notes.push('앞 구간 ' + (legKeys.length - 1) + '개는 자기 구간 통과만으로 고정(뒤 구간 지연에 안 끌려감)');

  // ── 7. 노드별 시각 만들기
  //  (가) 통과가 있는 역: 그 추정 시각       (나) 앵커 뒤: 예정 + 지연 수준(환승 열차는 처음 안내보다 이르지 않게)
  //  (다) 통과 기록 있는 두 역 사이의 기록 없는 역: 두 역 시각 사이를 예정 비율로 나눈다       (라) 첫 통과 앞: 예정 그대로(도보 구간)
  for (k = 0; k < n; k++) out[k] = null;
  for (k in est) out[+k] = est[k];
  var carry = 0, held = false;
  for (k = anchor.idx + 1; k < n; k++) {
    if (!valid[k]) continue;
    var base = planMs[k] + level * 60000 + carry;
    if (isLegStart[k] && k > boardIdx) {
      var need = planMs[k] - base;
      if (need > 3000) { carry += need; base += need; held = true; }
    }
    out[k] = base;
  }
  if (held) notes.push('환승 유지: 앞으로 탈 열차·버스는 처음 안내한 시각보다 이르게 나오지 않음');
  var stamped = [];
  for (k = 0; k <= anchor.idx; k++) if (est[k] != null) stamped.push(k);
  var interp = 0, frozenTail = 0;
  for (k = 0; k < n; k++) {
    if (out[k] != null || !valid[k]) continue;
    if (k < stamped[0]) { out[k] = planMs[k]; continue; }
    var lo = -1, hi = -1;
    for (j = 0; j < stamped.length; j++) { if (stamped[j] < k) lo = stamped[j]; else { hi = stamped[j]; break; } }
    if (lo < 0 || hi < 0) { out[k] = planMs[k] + level * 60000; continue; }
    var tLo = est[lo], tHi = Math.max(tLo, est[hi]);
    // 이미 끝난 앞 구간의 마지막 통과 뒤 역(통과 기록 없음)은 그 구간 자신의 지연 수준으로 — 뒤 구간 증거에 끌려가지 않게(다음 통과 시각은 넘지 않게)
    if (legOf[k] >= 0 && legOf[k] !== legOf[anchor.idx] && legLevel[legOf[k]] != null && legOf[lo] === legOf[k] && legOf[hi] !== legOf[k]) {
      out[k] = Math.max(tLo, Math.min(tHi, planMs[k] + legLevel[legOf[k]] * 60000));
      frozenTail++;
      continue;
    }
    var span = planMs[hi] - planMs[lo], f = span > 0 ? (planMs[k] - planMs[lo]) / span : 0.5;
    out[k] = tLo + (tHi - tLo) * Math.max(0, Math.min(1, f));
    interp++;
  }
  // (마) 실시간 도착정보: 앵커 뒤 가장 가까운 노드 하나를 그 시각으로 맞추고 뒤를 같은 폭만큼 민다(앞 구간·앞 역은 건드리지 않는다)
  var liveIn = input.live || [], liveBest = null;
  for (ii = 0; ii < liveIn.length; ii++) {
    var LV = liveIn[ii];
    if (!LV || !isFinite(+LV.idx) || !isFinite(+LV.ms) || +LV.idx <= anchor.idx || +LV.idx >= n || out[+LV.idx] == null || liveUsed[+LV.idx]) continue;
    if (!liveBest || +LV.idx < +liveBest.idx) liveBest = LV;
  }
  if (liveBest) {
    var dLv = (+liveBest.ms - out[+liveBest.idx]) / 1000;
    if (Math.abs(dLv) >= O.liveMinSec && Math.abs(dLv) <= O.liveMaxSec) {
      for (k = +liveBest.idx; k < n; k++) if (out[k] != null) out[k] += dLv * 1000;
      notes.push('실시간 도착정보 ' + (nodes[+liveBest.idx].name || liveBest.idx) + ': ' + (dLv > 0 ? '+' : '') + Math.round(dLv) + '초 반영');
    }
  }
  // (바) 연착: 앵커 뒤 첫 정차 노드의 예정 시각이 지났는데 도착 증거가 없다
  var nxO = -1;
  for (k = anchor.idx + 1; k < n; k++) if (valid[k] && _reIsTransit(nodes[k]) && out[k] != null) { nxO = k; break; }
  if (nxO >= 0) {
    var overO = (nowMs - out[nxO]) / 1000;
    if (overO >= O.overdueSec) {
      if (O.overdueMode === 'shift') {
        // 뒤 시각을 통째로 민다(예전 앱 방식). 위치 판단이 지하에서 역을 건너뛴 경우(증거 없음 ≠ 연착)에도 밀어 버려 시뮬에서 정확도가 나빠진다 → 기본값 아님
        var addO = Math.min(O.overdueMaxMin, (overO / 60 + O.overdueExtraMin) * O.overdueGain) * 60000;
        for (k = nxO; k < n; k++) if (out[k] != null) out[k] += addO;
        notes.push('연착: ' + (nodes[nxO].name || nxO) + ' 예정 ' + Math.round(overO) + '초 지났는데 도착 증거 없음 → 이후 +' + Math.round(addO / 1000) + '초');
      } else {
        // 증거 없이 예정 시각이 지났다고 이미 도착한 것은 아니다(남은 시간이 0분으로 굳지 않게): 그 노드만 '지금 + overdueExtraMin 분'으로 올리고,
        // 뒤 노드는 '앞 노드 + 예정 간격의 minRunRatio' 보다 이르지 않게만 한다(밀 필요가 있을 때만 민다). 증거 없는 통과를 연착으로 오인해 뒤 전체를 미는 일이 없다.
        var floorO = nowMs + O.overdueExtraMin * 60000, prevO = null, movedO = 0;
        for (k = nxO; k < n; k++) {
          if (out[k] == null) continue;
          var lo = (k === nxO) ? floorO : (prevO == null ? -Infinity : prevO.t + O.minRunRatio * (planMs[k] - prevO.p));
          if (out[k] < lo) { out[k] = lo; movedO++; }
          prevO = { t: out[k], p: planMs[k] };
        }
        notes.push('연착 보정: ' + (nodes[nxO].name || nxO) + ' 예정 ' + Math.round(overO) + '초 지났는데 도착 증거 없음 → 지금 + ' + O.overdueExtraMin + '분으로 올림(' + movedO + '곳)');
      }
    }
  }
  if (frozenTail) notes.push('앞 구간 마지막 통과 뒤 역 ' + frozenTail + '곳: 그 구간 자신의 지연 수준으로 고정');
  if (interp) notes.push('통과 기록 없는 역 ' + interp + '곳: 앞뒤 기록 사이를 예정 비율로 나눔');

  return _reFinish(out, tz, O, anchor.idx, level, notes, n, nowMs);
}

// 표시 마지막 안전망: 시각이 거꾸로 가지 않게(앞 시각보다 이른 값은 앞 시각에 맞춘다) + 도착 예정이 이미 지난 시각이 되지 않게 + 서식
function _reFinish(out, tz, O, anchorIdx, level, notes, n, nowMs) {
  var prev = null, mono = 0, arr = new Array(n), q, last = -1;
  // 첫 통과 앞 도보 노드가 뒤 노드보다 늦을 수 있으므로 앞쪽은 뒤에서부터 상한을 먼저 적용
  var nextMin = null;
  for (q = n - 1; q >= 0; q--) { if (out[q] == null) continue; if (nextMin != null && out[q] > nextMin && q < anchorIdx) out[q] = nextMin; if (nextMin == null || out[q] < nextMin) nextMin = out[q]; }
  for (q = n - 1; q >= 0; q--) if (out[q] != null) { last = q; break; }
  if (anchorIdx >= 0 && last > anchorIdx && out[last] < nowMs) { out[last] = nowMs; notes.push('도착 예정이 이미 지난 시각이라 지금으로 맞춤'); }
  for (q = 0; q < n; q++) {
    if (out[q] == null) continue;
    if (prev != null && out[q] < prev) { out[q] = prev; mono++; }
    prev = out[q];
  }
  if (mono) notes.push('표시 순서 보정 ' + mono + '곳');
  for (q = 0; q < n; q++) arr[q] = out[q] == null ? null : _reHHMM(out[q], tz, O.rounding);
  // schedMin: '지금(하루 안의 분) + 그 노드까지 남은 분' — 앱이 옛 필드(_schedMin)를 같은 값으로 맞출 때 쓴다(자정을 넘으면 1440 이상이 된다)
  var nowM = _reMin(nowMs, tz), sched = new Array(n);
  for (q = 0; q < n; q++) sched[q] = out[q] == null ? null : Math.round((nowM + (out[q] - nowMs) / 60000) * 1000) / 1000;
  return { arr: arr, etaMs: out, schedMin: sched, delayMin: Math.round(level * 100) / 100, anchorIdx: anchorIdx, notes: notes };
}

// ─────────────────────────────────────────────────────────────────────────────
// 한 승차 구간의 통과 증거 → { level(분), est{idx:ms} }
//   '지연 수준(level)' = 이 구간 열차가 예정보다 얼마나 늦(+)거나 이른(−)지(분). 구간 안에서는 거의 일정하다.
//   증거마다 '그 증거가 허용하는 지연의 범위'를 만들고, 범위들을 곱한 확률 분포(격자)의 10~90% 구간 한가운데를 지연 수준으로 삼는다.
//     · 위치 채택(PF)        : 실제 통과는 채택보다 5~70초 앞 → 지연 ∈ [x−70초, x−5초]   (x = 채택 시각 − 예정)
//     · 승차 확정(board)     : 실제 승차보다 보통 20~120초, 가끔 2~6.5분 늦게 확정됨
//     · 몰림(backlog)        : 앞 기록과 12초 안에 찍힌 통과, 또는 뒤 통과가 '최소 주행시간'보다 가깝게 찍혀 늦게 알게 된 것으로 드러난 통과 → 상한으로만.
//                              채택 지연이 5~70초 균일이면 '실제 통과 + 지연 ≤ 기록'의 확률은 d 가 낮을수록 서서히 커지는 경사(burstRamp). 그래서 승차 확정이 3~6분 늦었다는 쪽(확정 지연 큰 쪽)에
//                              확률이 실리고, 확정 지연이 보통(20~120초)이어서 몰림이 생기려면 구간 간격이 1분 안팎이어야 한다는 사실이 자연스레 반영된다.
//     · 기지국 선행(cell)    : 실제 통과는 stamp 보다 1~3분 뒤 → 지연 ∈ [x+60초, x+180초]
//     · GPS                  : 지연 ∈ [x±15초]
//     · 정적 시간표(승차 직후) : 열차는 시각표보다 일찍 떠나지 않는다 → 확정 직전 6분 안의 시각표 열차마다 '지연 ∈ [시각표−예정, +1.5분]' 봉우리를 만들고 모두 더한 혼합 가능도(어느 열차였는지는 확정 지연 분포가 가른다)
//     · 사전 분포            : 믿을 만한 통과가 하나도 없을 때만(승차 직후 몰림뿐일 때) 영향
// ─────────────────────────────────────────────────────────────────────────────
function _reLegModel(S, planMs, O, priorMean, snap, notes, liveL) {
  var est = {}, i, g, MIN = 60000;
  var B = [], C = [];                 // B: 위치 증거(승차·PF·GPS·드리프트), C: 기지국 선행
  for (i = 0; i < S.length; i++) (S[i].src === 'cell' ? C : B).push(S[i]);
  var tolMs = O.burstTolSec * 1000;

  // 몰림 판별: 뒤 통과에서 거꾸로 '최소 주행시간만큼 앞선 시각'(U)보다 늦게 찍힌 기록 = 이제야 알게 된 기록(상한일 뿐)
  var U = new Array(B.length), loose = new Array(B.length), backlog = new Array(B.length), ambig = new Array(B.length), nBacklog = 0;
  for (i = B.length - 1; i >= 0; i--) {
    U[i] = B[i].ms;
    if (i < B.length - 1) { var cand = U[i + 1] - O.minRunRatio * (planMs[B[i + 1].idx] - planMs[B[i].idx]); if (cand < U[i]) U[i] = cand; }
    loose[i] = (B[i].ms - U[i]) > tolMs;
    backlog[i] = i > 0 && (B[i].ms - B[i - 1].ms) <= O.backlogGapSec * 1000;
    ambig[i] = backlog[i] && !loose[i] && (B[i].ms - B[i - 1].ms) > O.burstExactSec * 1000;
    if ((loose[i] || backlog[i]) && B[i].src !== 'board') nBacklog++;
  }
  // 늦게 알게 된 통과(몰림)는 승차 확정이 늦을 때 확정 직후에만 생긴다. 구간 중간에서 앞 통과가 '뒤 통과보다 늦다'고 나오면 앞 통과가 늦은 게 아니라 뒤 통과가 엉뚱한 값일 수 있다 → 중간에서는 몰림으로 보지 않는다.
  if (O.hmm && O.looseOnlyAtStart) { var okc = true; for (i = 0; i < B.length; i++) { var isEv = !(B[i].src === 'board' || loose[i] || backlog[i]); if (loose[i] && !okc) loose[i] = false; if (isEv) okc = false; } nBacklog = 0; for (i = 0; i < B.length; i++) if ((loose[i] || backlog[i]) && B[i].src !== 'board') nBacklog++; }
  var infList = [];
  for (i = 0; i < B.length; i++) if (B[i].src !== 'board' && !loose[i] && !backlog[i]) infList.push(i);
  var nInfo = infList.length;
  // 지연은 구간 안에서 서서히 변하므로 '가장 최근 믿을 만한 통과 몇 개'부터 뒤만 쓴다
  var useFrom = nInfo ? infList[Math.max(0, nInfo - O.levelWindow)] : 0;
  var lastIdx = S[S.length - 1].idx;

  // 격자 범위
  var xs = [];
  for (i = 0; i < S.length; i++) xs.push((S[i].ms - planMs[S[i].idx]) / MIN);
  var gLo = Math.min.apply(null, xs) - 8, gHi = Math.max.apply(null, xs) + 3, step = 0.05;
  if (gHi - gLo > 250) gHi = gLo + 250;
  var NG = Math.max(2, Math.round((gHi - gLo) / step) + 1), lp = new Array(NG);
  var snapOn = !!snap && nInfo === 0;
  if (snapOn && snap.note) notes.push(snap.note);
  var rbQ = function (lvl, k2) { if (!O.robust) return lvl; var q = 1 - Math.pow(1 - O.epsJump, k2) + O.epsOut; if (q > 0.9) q = 0.9; return Math.log((1 - q) * Math.exp(lvl) + q * O.robustFloor); };
  function win(d, a, b, sg) { if (d < a) { var z = (a - d) / sg; return -0.5 * z * z; } if (d > b) { var z2 = (d - b) / sg; return -0.5 * z2 * z2; } return 0; }
  var pfLo = O.pfLagMinSec / 60, pfHi = O.pfLagMaxSec / 60, sg = O.softMin;
  var bnMin = O.boardLagMinSec / 60, bnNorm = O.boardLagNormSec / 60, bnLateMin = O.boardLateMinSec / 60, bnMax = O.boardLagMaxSec / 60, bsg = O.boardSoftMin;
  var dNorm = O.boardNormW / (bnNorm - bnMin), dLate = (1 - O.boardNormW) / (bnMax - bnLateMin);
  function soft(x, a, b, sg2) { if (x < a) { var z = (a - x) / sg2; return Math.exp(-0.5 * z * z); } if (x > b) { var z3 = (x - b) / sg2; return Math.exp(-0.5 * z3 * z3); } return 1; }
  // 통과 i 가 지연 d(분)를 얼마나 지지하는지(로그 가능도). wid/sh/k2: 이 통과가 마지막 통과보다 몇 역 앞이라 생기는 창 넓힘·기울기(하드 창 방식), HMM 방식은 0.
  function emitLog(i, d, wid, sh, k2) {
    var st = B[i], xi = (st.ms - planMs[st.idx]) / MIN;
    if (st.src === 'board') {
      var lc = xi - d;                                                             // lc: 승차 확정이 실제 승차보다 늦은 정도(분)
      var f = O.boardFloor + dNorm * soft(lc, bnMin, bnNorm, bsg) + dLate * soft(lc, bnLateMin, bnMax, bsg);
      return Math.log(f);
    } else if (st.src === 'gps') {
      return rbQ(win(d, xi + sh - O.gpsTolSec / 60 - wid, xi + sh + O.gpsTolSec / 60 + wid, sg), k2);
    } else if (st.src === 'move') {
      return rbQ(win(d, xi + sh - (O.moveLagMaxSec + O.moveTolSec) / 60 - wid, xi + sh - (O.moveLagMinSec - O.moveTolSec) / 60 + wid, sg), k2);      // 지연 ∈ [x−(탐지 지연 최대+오차), x−(최소−오차)]
    } else if (loose[i] || backlog[i]) {
      if (O.burstRamp) {
        var cB = (U[i] - planMs[st.idx]) / MIN + sh + wid, accB = 0, nsB = 14, zq;
        for (var lq = 0; lq < nsB; lq++) { var lagM = pfLo + (pfHi - pfLo) * (lq + 0.5) / nsB; zq = Math.max(0, d + lagM - cB) / sg; accB += Math.exp(-0.5 * zq * zq); }
        accB /= nsB;
        // 앞 기록과 간격이 5초 간격 몰림(≈5초)보다 조금 넓으면(6.5~12초) 몰림일 수도, 우연히 바로 뒤에 찍힌 정상 채택일 수도 있다 → 두 가설의 혼합
        if (ambig[i]) accB = O.burstAmbigW * accB + (1 - O.burstAmbigW) * soft(d, xi + sh - pfHi - wid, xi + sh - pfLo + wid, sg);
        return Math.log(accB + 1e-12);
      } else return win(d, -1e9, (U[i] - planMs[st.idx]) / MIN - pfLo, sg);                // 몰림: 상한만
    } else if (st.src === 'drift') {
      return rbQ(win(d, xi + sh - 2 * pfHi - wid, xi + sh + 0.2 + wid, sg), k2);              // 드리프트 보정 위치: 지연이 더 클 수 있어 범위를 넓게
    } else {
      return rbQ(win(d, xi + sh - pfHi - wid, xi + sh - pfLo + wid, sg), k2);
    }
  }
  // ── 변화점(HMM) 필터: 통과를 시간 순으로 보며 지연 수준의 사후분포를 이어 간다. 역 사이에 지연은 서서히 변하고(가우시안·기울기), 작은 확률로 갑자기 바뀐다(구간 중 정차·서행: 라플라스).
  //     통과 하나가 이상치일 확률(epsOut)도 둔다 → 한 번의 엉뚱한 통과는 무시되고, 그 뒤 통과들이 새 수준을 가리키면 따라간다.
  var hmmAl = null;
  if (O.hmm) {
    var al = new Float64Array(NG), t1 = new Float64Array(NG), t2 = new Float64Array(NG), gg, kk, sm;
    var prW = nInfo ? 0.02 : O.priorNarrowW;
    for (gg = 0; gg < NG; gg++) {
      var d0 = gLo + gg * step, wSd = (d0 < priorMean && O.priorNegWideSd > 0) ? O.priorNegWideSd : O.priorWideSd;       // 일찍 달리는 쪽은 한계가 있다(시각표보다 20분 이른 열차는 없다): 아래쪽 꼬리를 좁힘
      al[gg] = prW * Math.exp(-0.5 * Math.pow((d0 - priorMean) / O.priorNarrowSd, 2)) / O.priorNarrowSd + (1 - prW) * Math.exp(-0.5 * Math.pow((d0 - priorMean) / wSd, 2)) / wSd;
    }
    var normA = function (arr) { var sum = 0, q; for (q = 0; q < NG; q++) sum += arr[q]; if (!(sum > 0)) { for (q = 0; q < NG; q++) arr[q] = 1 / NG; return; } for (q = 0; q < NG; q++) arr[q] /= sum; };
    normA(al);
    var prevI = -1;
    function hmmStep(dk) {
      var shC = O.driftBiasPerStop * dk / step, sdC = Math.max(0.3, O.driftPerStop * Math.sqrt(dk) / step), pj = 1 - Math.pow(1 - O.epsJump, dk);
      // 기울기: 분수 칸만큼 이동(선형 보간)
      var s0 = Math.floor(shC), fr = shC - s0;
      for (gg = 0; gg < NG; gg++) { var a0 = gg - s0, a1 = gg - s0 - 1; t1[gg] = (a0 >= 0 ? al[a0] * (1 - fr) : 0) + (a1 >= 0 ? al[a1] * fr : 0); }
      // 가우시안 번짐
      var R = Math.max(1, Math.ceil(3 * sdC)), ker = new Float64Array(2 * R + 1), ks = 0;
      for (kk = -R; kk <= R; kk++) { ker[kk + R] = Math.exp(-0.5 * kk * kk / (sdC * sdC)); ks += ker[kk + R]; }
      for (gg = 0; gg < NG; gg++) { sm = 0; for (kk = -R; kk <= R; kk++) { var gi = gg + kk; if (gi >= 0 && gi < NG) sm += t1[gi] * ker[kk + R]; } t2[gg] = sm / ks; }
      // 갑작스런 변화: 라플라스 컨볼루션(재귀 필터)
      if (pj > 1e-9) {
        // 갑작스런 변화는 비대칭: 늦어지는 쪽(정차·서행 — 크게 가능)과 일찍 달리는 쪽(회복 — 작게만 가능)의 지수 꼬리를 따로 둔다(재귀 필터로 O(NG)).
        var ru = Math.exp(-step / O.jumpUpScaleMin), rd = Math.exp(-step / O.jumpDnScaleMin), wU = O.jumpUpW * (1 - ru), wD = (1 - O.jumpUpW) * (1 - rd), Uc = 0, Dc = 0, Dv = new Float64Array(NG);
        for (gg = NG - 1; gg >= 0; gg--) { Dv[gg] = Dc; Dc = t2[gg] + rd * Dc; }                  // Dv[g] = Σ_{m≥1} rd^{m−1} α[g+m]
        for (gg = 0; gg < NG; gg++) { al[gg] = (1 - pj) * t2[gg] + pj * (wU * Uc + wD * Dv[gg]); Uc = t2[gg] + ru * Uc; }   // Uc = Σ_{m≥1} ru^{m−1} α[g−m]
      } else for (gg = 0; gg < NG; gg++) al[gg] = t2[gg];
    }
    for (i = Math.max(0, B.length - 60); i < B.length; i++) {      // 계산량 상한: 최근 60개 통과만(보통 한 구간은 그보다 훨씬 적다)
      if (prevI >= 0) hmmStep(Math.max(1, B[i].idx - prevI));
      var bs = B[i].src, mixOut = (bs !== 'board' && !(loose[i] || backlog[i]));
      for (gg = 0; gg < NG; gg++) { var ev = Math.exp(emitLog(i, gLo + gg * step, 0, 0, 0)); al[gg] *= mixOut ? ((1 - O.epsOut) * ev + O.epsOut * O.robustFloor) : ev; }
      normA(al); prevI = B[i].idx;
    }
    // 실시간 도착정보(앞으로 설 역의 도착 시각) — 그 역의 지연을 직접 재는 값. 이 역까지 지연이 변할 수 있으니 역 수만큼 전이한 뒤 가우시안(+이상치)으로 곱한다.
    if (liveL && liveL.length && prevI >= 0) {
      var sdL = Math.max(0.05, O.liveSdSec / 60), nUsed = 0;
      for (var lq = 0; lq < liveL.length; lq++) {
        var LQ = liveL[lq], xls = [], mq;
        for (mq = 0; mq < LQ.ms.length; mq++) xls.push((LQ.ms[mq] - planMs[LQ.idx]) / MIN);
        hmmStep(Math.max(1, LQ.idx - prevI));
        for (gg = 0; gg < NG; gg++) {
          var dg = gLo + gg * step, mixL = 0;
          for (mq = 0; mq < xls.length; mq++) { var zl = (dg - xls[mq]) / sdL; mixL += Math.exp(-0.5 * zl * zl); }
          al[gg] *= (1 - O.epsLive) * mixL / xls.length + O.epsLive * O.robustFloor;
        }
        normA(al); prevI = LQ.idx; nUsed++;
      }
      if (nUsed) notes.push('실시간 도착정보 ' + nUsed + '건을 지연 필터에 반영');
    }
    hmmAl = al;
  }
  for (g = 0; g < NG; g++) {
    var d = gLo + g * step;
    var v = Math.log((nInfo ? 0.02 : O.priorNarrowW) * Math.exp(-0.5 * Math.pow((d - priorMean) / O.priorNarrowSd, 2)) / O.priorNarrowSd
      + (1 - O.priorNarrowW) * Math.exp(-0.5 * Math.pow((d - priorMean) / O.priorWideSd, 2)) / O.priorWideSd);
    if (hmmAl) v = Math.log(hmmAl[g] + 1e-300);
    else for (i = useFrom; i < B.length; i++) {
      var k2 = Math.max(0, lastIdx - B[i].idx);
      v += emitLog(i, d, O.driftPerStop * Math.sqrt(k2), O.driftBiasPerStop * k2, k2);      // 오래된 통과일수록 그 사이 지연이 달라졌을 수 있다(대개 늦어지는 쪽)
    }
    for (i = 0; i < C.length; i++) {
      var xc = (C[i].ms - planMs[C[i].idx]) / MIN, wc = O.driftPerStop * Math.sqrt(Math.max(0, lastIdx - C[i].idx));
      v += win(d, xc + O.cellLeadMinSec / 60 - wc, xc + O.cellLeadMaxSec / 60 + wc, sg);
    }
    if (snapOn) { var mixS = O.snapEps; for (var sj = 0; sj < snap.delays.length; sj++) mixS += snap.delays[sj].w * soft(d, snap.delays[sj].d - 0.15, snap.delays[sj].d + O.snapLateMaxMin, sg); v += Math.log(mixS); }
    lp[g] = v;
  }
  var mx = -Infinity, tot = 0, w = new Array(NG);
  for (g = 0; g < NG; g++) if (lp[g] > mx) mx = lp[g];
  for (g = 0; g < NG; g++) { w[g] = Math.exp(lp[g] - mx); tot += w[g]; }
  var level = gLo, qLo = gLo, qHi = gLo, acc = 0, gotLo = false, gotHi = false, gotMed = false;
  for (g = 0; g < NG; g++) {
    acc += w[g];
    if (!gotLo && acc >= tot * O.quantile) { qLo = gLo + g * step; gotLo = true; }
    if (!gotMed && acc >= tot / 2) { level = gLo + g * step; gotMed = true; }
    if (!gotHi && acc >= tot * (1 - O.quantile)) { qHi = gLo + g * step; gotHi = true; }
  }
  if (O.quantile > 0 && O.quantile < 0.5) level = (O.bimodalSpanMin > 0 && qHi - qLo > O.bimodalSpanMin) ? level : (qLo + qHi) / 2;      // 사후분포가 두 봉우리(예: 엉뚱한 통과 vs 정말 바뀜)로 갈라지면 가운데(둘 다 아닌 값)가 아니라 중앙값
  if (nBacklog) notes.push('몰림 ' + nBacklog + '건: 지연 수준에서 제외(채택 지연을 감안한 상한 가능도로만 사용)');
  if (C.length) notes.push('기지국 선행 ' + C.length + '건: 실제보다 1~3분 이른 값이라 하한으로만 사용');
  notes.push('구간 지연 수준 ' + (Math.round(level * 100) / 100) + '분 (믿을 만한 통과 ' + nInfo + '개' + (nInfo ? '' : ', 사전값·승차 확정으로 추정') + ')');

  // 각 역 추정 시각
  for (i = 0; i < B.length; i++) {
    var b2 = B[i];
    if (b2.src === 'board' || loose[i] || backlog[i]) est[b2.idx] = Math.min(b2.ms - 5000, planMs[b2.idx] + level * MIN);   // 늦게 알게 된 기록은 실제 통과가 아니다
    else est[b2.idx] = b2.src === 'gps' ? b2.ms : b2.src === 'move' ? b2.ms - (O.moveLagMinSec + O.moveLagMaxSec) / 2 * 1000 : b2.ms - O.pfLagSec * 1000;
  }
  for (i = 0; i < C.length; i++) est[C[i].idx] = Math.max(C[i].ms, planMs[C[i].idx] + level * MIN);
  return { level: level, est: est };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Worker 진입점 — route-v2 의 fetch 에서  if (url.pathname === "/ride-eta") return handleRideEta(request);
// ─────────────────────────────────────────────────────────────────────────────
function handleRideEta(request) {
  var H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
  if (request.method === 'OPTIONS') return Promise.resolve(new Response(null, { status: 204, headers: H }));
  if (request.method !== 'POST') return Promise.resolve(new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: H }));
  return request.json().then(function (body) {
    var out;
    try { out = rideEta(body); } catch (e) { return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500, headers: H }); }
    return new Response(JSON.stringify(out), { headers: H });
  }, function () { return new Response(JSON.stringify({ error: 'JSON 아님' }), { status: 400, headers: H }); });
}

if (typeof module !== 'undefined') module.exports = { rideEta: rideEta, handleRideEta: handleRideEta, RIDE_ETA_DEFAULTS: RIDE_ETA_DEFAULTS };
