// 도착시각 엔진(engine/ride-eta.js) 무작위 시뮬레이션 — Node 전용(브라우저·Playwright 없음).
//
// 실행: node test/fuzz/ride_eta_sim.js [시나리오수=80] [시드=63] > out.json      (환경변수 ANOM=early,late1,ug,miss,late6,pullback,skip3)
//   ENGINE=경로   : 다른 엔진 파일로 비교(기본 ../../engine/ride-eta.js)
//   ROUND=floor   : 표시 반올림을 내림으로(기본 round — 엔진 기본값 그대로)
//   OPTS='{"pfLagSec":0}' : 엔진 옵션(input.opts)을 덮어쓴다(민감도 점검용)
//   MOVE=0.5      : 승차 확정 때 '움직임 시작' 증거(src move)를 보낼 수 있는 비율(기본 0 = 기존 모델)
//   추가 변수(ANOM): halt(구간 중 정차·큰 지연) slowseg(서행) express(중간부터 일찍) traffic(버스 흔들림) falsepf(엉뚱한 역 채택) dupe(중복 채택) restart(앱 재시작=증거 소실) offline(통신 끊김=마지막 값 유지) badmove(MOVE 증거 오인, MOVE 와 함께)
//   NOTT=1        : 정적 시간표(timetable) 입력을 보내지 않는다
//
// 이 파일의 '진실 모델'과 '사건 모델'은 브라우저 시뮬(fuzz3.js, Playwright + www/index.html)과 같은 시드·같은 난수 호출 순서를 쓴다 →
//   같은 시드면 시나리오(경로·진실 시각·사건 시각)가 브라우저 시뮬과 한 칸도 다르지 않다(그래서 기존 분석 스크립트 cmp.js / inv.js / oracle.js 에 그대로 넣을 수 있다).
//   다른 점은 하나: 앱이 들고 있는 통과 기록(passes)을 엔진 입력으로 만들어 rideEta() 를 부른다(재계산은 엔진이 한다 — 앱은 그리기만).
//
// 사건 모델(앱이 실제로 겪는 것):
//   board  : 승차 확정(진짜 승차 시각보다 25~110초 늦음, 가끔(12%, late6 이면 30%) 3~6분 늦음) → 통과 기록 src 'board'
//   adopt  : PF 위치 채택(진짜 통과보다 5~70초 늦음; 승차 확정 직후엔 밀린 역이 5초 간격으로 한꺼번에 채택 = 몰림) → src 'pf'
//   adopt+lead : 기지국이 1~3분 일찍 찍는 선행 통과 → src 'cell'  (뒤이어 PF 가 같은 역을 채택하면 pf 가 우선 — 예전 앱의 LEADFIX=2 '셀 stamp 를 PF 채택 시각-35초로 교체'는 엔진 안으로 옮겼다)
//   pull   : 위치가 한 칸 되돌아갔다 오는 사건(통과 기록은 그대로, 재계산만)
// 진실 모델: 구간(leg)마다 시각표 + 지연(0~3분 시작, 역마다 ±) + 이상(early −2~−6분 / late1 +2~+8분 / miss 환승 열차 놓침 +4~+9분 / ug 지하 구간 통과 기록 끊김 / skip3 건너뜀 25%).
'use strict';
var fs = require('fs'), path = require('path');
var N = +(process.argv[2] || 80), SEED = +(process.argv[3] || 63);
var ANOM = process.env.ANOM || '';
var MOVE = +(process.env.MOVE || 0);
var ENGINE = process.env.ENGINE || path.join(__dirname, '..', '..', 'engine', 'ride-eta.js');
var E = require(ENGINE);
var EXTRA_OPTS = process.env.OPTS ? JSON.parse(process.env.OPTS) : null;
var TZ_MIN = 540;

function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
var FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'incheon1_weekday_tt.json'), 'utf8'));
var ORDER = FX.order, TT = FX.tt;
var LINES = [['부산1호선',1.5,2.5],['부산2호선',1.5,2.5],['부산3호선',1.5,3],['부산4호선',2,3],['동해선',2.5,5],['부산김해경전철',1.5,3],['대구1호선',1.5,3],['대구2호선',1.5,3],['대구3호선',1.5,2.5],['대전1호선',1.5,3],['광주1호선',1.5,3],['신림선',1.5,3],['우이신설선',1.5,2.5],['용인에버라인',2,3.5],['KTX',15,40],['ITX',6,15],['1호선',2,3.5],['2호선',1.5,2.5],['3호선',2,3],['4호선',2,3],['5호선',1.5,3],['6호선',1.5,3],['7호선',2,3.5],['8호선',1.5,3],['9호선',1.5,3],['9호선(급행)',3,9],['신분당선',2,5],['수인분당선',2,4],['경의중앙선',2,5],['공항철도',2,4],['공항철도(직통)',6,15],['김포골드라인',1.5,2.5],['인천2호선',2,3],['경춘선',2.5,5],['GTX-A',5,12],['에버라인',2,3.5],['의정부경전철',1.5,3]];
var KINDS = [['gsub'], ['walk','gsub'], ['walk','gsub','xfer','gsub'], ['bus','xfer','gsub'], ['walk','gsub','xfer','gsub','xfer','gsub'], ['walk','gsub','walk','bus'], ['walk','bus','xfer','gsub','xfer','bus'], ['isub'], ['walk', 'isub'], ['bus', 'xfer', 'isub'], ['walk', 'isub', 'xfer', 'sub'], ['walk', 'isub', 'walk', 'bus'], ['walk', 'isub'], ['walk', 'isub', 'xfer', 'isub'], ['walk', 'bus', 'xfer', 'isub', 'xfer', 'bus']];

var MID = Date.parse('2026-10-06T00:00:00+09:00');   // 한국 자정(ms) — 시나리오의 모든 'at'(초)은 여기서부터
function two(n) { return (n < 10 ? '0' : '') + n; }
function minOfDayKst(ms) { var m = ((ms + TZ_MIN * 60000) / 60000) % 1440; return (m + 1440) % 1440; }

var fwdKey = null;
{ var a0 = TT['동막'], c0 = TT['캠퍼스타운']; var t0 = a0['상'].find(function (x) { return x > 1050; }); var n0 = c0['상'].find(function (x) { return x > t0; }); fwdKey = (n0 - t0 < 6) ? '상' : '하'; }
var revKey = fwdKey === '상' ? '하' : '상';
var R = rng(SEED);
function pick(a) { return a[Math.floor(R() * a.length)]; }
function ri(a, b2) { return a + Math.floor(R() * (b2 - a + 1)); }
var out = [], errs = [];

for (var sc = 0; sc < N; sc++) {
  var kind = pick(KINDS); var pr = R(); var startMin = pr < 0.5 ? ri(17 * 60 + 5, 19 * 60) : pr < 0.75 ? ri(22 * 60 + 40, 23 * 60 + 55) : ri(5 * 60 + 10, 7 * 60);
  var nodes = []; var t = startMin, legId = 0;
  nodes.push({ name: '출발', isOrigin: true, plan: t });
  var legs = []; var dirSign = R() < 0.5 ? 1 : -1; var dk = dirSign === 1 ? fwdKey : revKey;
  kind.forEach(function (k) {
    if (k === 'walk') { t += ri(3, 8); nodes.push({ name: '도보', isWalk: true, plan: t }); }
    else if (k === 'xfer') { t += ri(3, 6); nodes.push({ name: '환승', isWalk: true, plan: t }); }
    else if (k === 'isub') {
      legId++; var n = ri(4, 14); var start = nodes.length;
      var s0 = dirSign === 1 ? ri(0, ORDER.length - n) : ri(n - 1, ORDER.length - 1);
      var need = (nodes.length > 1 && nodes[nodes.length - 1].isWalk) ? ri(1, 5) : 0; var arriveAtStn = t + need;
      var names = []; for (var i = 0; i < n; i++) names.push(ORDER[s0 + dirSign * i]);
      var tt = []; var first = TT[names[0]][dk].find(function (x) { return x >= arriveAtStn + (R() < 0.3 ? 0 : 0); }); if (first == null) { legId--; return; }
      tt.push(first); for (var i = 1; i < n; i++) { var arr = TT[names[i]][dk]; var pv = tt[i - 1]; var nx = arr.find(function (x) { return x > pv && x <= pv + 6; }); tt.push(nx != null ? nx : tt[i - 1] + 2.5); }
      var bias = pick([0, 0, 0, -1, 1, 2]);       // 엔진 표시가 시간표와 어긋나는 정도
      for (var i = 0; i < n; i++) nodes.push({ name: names[i], isSub: true, line: '인천1호선', plan: tt[i] + bias, ttMin: tt[i], leg: legId, real: true });
      t = tt[n - 1] + bias - 2; legs.push({ start: start, end: nodes.length - 1, id: legId, type: 'sub', ttTimes: TT[names[0]][dk] });
    } else if (k === 'gsub') {
      legId++; var L = pick(LINES); var n = ri(4, 14); var start = nodes.length;
      t += (nodes.length > 1 && nodes[nodes.length - 1].isWalk) ? ri(2, 6) : 0;
      for (var i = 0; i < n; i++) { nodes.push({ name: L[0] + '_' + legId + '_' + i, isSub: true, line: L[0], plan: t, leg: legId }); t += L[1] + R() * (L[2] - L[1]); }
      t -= 2; legs.push({ start: start, end: nodes.length - 1, id: legId, type: 'sub' });
    } else if (k === 'sub') {
      legId++; var n = ri(4, 10); var start = nodes.length; t += ri(2, 5);
      for (var i = 0; i < n; i++) { nodes.push({ name: '역' + legId + '_' + i, isSub: true, line: '7호선', plan: t, leg: legId }); t += ri(2, 3) + (R() < 0.3 ? 0.5 : 0); }
      t -= 2; legs.push({ start: start, end: nodes.length - 1, id: legId, type: 'sub' });
    } else if (k === 'bus') {
      legId++; var n = ri(4, 10); var start = nodes.length;
      t += (nodes.length > 1 && nodes[nodes.length - 1].isWalk) ? ri(2, 7) : ri(1, 3);
      for (var i = 0; i < n; i++) { nodes.push({ name: '정류장' + legId + '_' + i, isBus: true, line: '버스 ' + legId, plan: t, leg: legId }); t += ri(1, 3); }
      t -= 1; legs.push({ start: start, end: nodes.length - 1, id: legId, type: 'bus' });
    }
  });
  while (nodes.length && nodes[nodes.length - 1].isWalk) nodes.pop();
  if (!legs.length) { sc--; continue; }
  // 진실: 시간표 시각 + 지연(분)
  var truth = {};
  legs.forEach(function (lg) {
    var late0 = pick([0, 0, 0, 0.5, 1, 1, 2, 3]); var cum = late0;
    for (var i = lg.start; i <= lg.end; i++) {
      if (i > lg.start) cum += (R() - 0.35) * 0.4 + (R() < 0.2 ? 0.4 : 0);
      var base = nodes[i].real ? nodes[i].ttMin : nodes[i].plan;
      truth[i] = (base + Math.max(0, cum)) * 60 + (nodes[i].real ? ri(0, 59) * 0 : 0);
    }
  });
  { var AA = ANOM.split(','); legs.forEach(function (lg) { if (AA.includes('early') && R() < 0.5) { var d = -ri(2, 6) * 60; lg.shift = (lg.shift || 0) + d / 60; for (var i = lg.start; i <= lg.end; i++) truth[i] += d; } else if (AA.includes('late1') && R() < 0.5) { var d = ri(2, 8) * 60; lg.shift = (lg.shift || 0) + d / 60; for (var i = lg.start; i <= lg.end; i++) truth[i] += d; } }); }
  if (ANOM.split(',').includes('miss')) legs.forEach(function (lg, li) { if (li > 0 && R() < 0.45) { var d = ri(4, 9) * 60; lg.shift = (lg.shift || 0) + d / 60; for (var i = lg.start; i <= lg.end; i++) truth[i] += d; } });
  // ── 추가 변수(별도 난수 R2라 ANOM 에 안 쓰면 기존 시나리오는 한 칸도 안 변한다) ──
  var R2 = rng(SEED * 977 + sc * 13 + 5), A2 = ANOM.split(','), ri2 = function (a, b3) { return a + Math.floor(R2() * (b3 - a + 1)); };
  legs.forEach(function (lg) {
    var len = lg.end - lg.start;
    if (len < 3) return;
    if (A2.includes('halt') && R2() < 0.35) {            // 구간 중간에 열차가 멈췄다(신호·사고·문 끼임): 작은 정차 +1~3분(50%) 또는 큰 지연 +4~15분
      var h = lg.start + ri2(1, len - 1), d = (R2() < 0.5 ? ri2(1, 3) : ri2(4, 15)) * 60; lg.halt = [h, d / 60];
      for (var i = h; i <= lg.end; i++) truth[i] += d;
    }
    if (A2.includes('slowseg') && R2() < 0.3) {          // 서행 구간: 2~4개 역에 걸쳐 총 +2~4분이 서서히 쌓이고 그 뒤 유지
      var h2 = lg.start + ri2(1, len - 1), k = ri2(2, 4), tot = ri2(2, 4) * 60; lg.slow = [h2, tot / 60];
      for (var i = h2; i <= lg.end; i++) truth[i] += tot * Math.min(1, (i - h2 + 1) / k);
    }
    if (A2.includes('express') && lg.type === 'sub' && R2() < 0.25) {   // 구간 중간부터 일찍 달림(급행·정차 생략): 서서히 최대 2~5분 앞서간다
      var h3 = lg.start + ri2(1, len - 1), k3 = ri2(2, 4), tot3 = ri2(2, 5) * 60; lg.exp = [h3, -tot3 / 60];
      for (var i = h3; i <= lg.end; i++) truth[i] -= Math.min(tot3, tot3 * (i - h3 + 1) / k3);
    }
    if (A2.includes('traffic') && lg.type === 'bus') {     // 버스는 교통에 따라 역(정류장)마다 ±1분씩 흔들린다
      var w = 0; for (var i = lg.start + 1; i <= lg.end; i++) { w += (R2() - 0.45) * 120; truth[i] += w; }
      lg.traffic = true;
    }
  });
  legs.forEach(function (lg) { for (var i = lg.start + 1; i <= lg.end; i++) if (truth[i] < truth[i - 1] + 30) truth[i] = truth[i - 1] + 30; });
  legs.forEach(function (lg, li) { if (li > 0) { var prevEnd = truth[legs[li - 1].end]; if (truth[lg.start] < prevEnd + 120) { var d = prevEnd + 120 - truth[lg.start]; for (var i = lg.start; i <= lg.end; i++) truth[i] += d; } } });
  var destIdx = nodes.length - 1; var destTruth = truth[destIdx];
  var events = []; var trIdx = []; for (var i = 0; i < nodes.length; i++) if (truth[i] != null) trIdx.push(i);
  var A = ANOM.split(',');
  legs.forEach(function (lg) {
    var lateConfirm = (A.includes('late6') ? R() < 0.3 : R() < 0.12) ? ri(180, 360) : ri(25, 110);
    lg.lc = lateConfirm; events.push({ at: truth[lg.start] + lateConfirm, type: 'board', idx: lg.start });
    var lastAt = truth[lg.start] + lateConfirm;
    for (var i = lg.start + 1; i <= lg.end; i++) {
      if (A.includes('ug') && lg.ug == null) { lg.ug = R() < 0.7 ? [lg.start + ri(1, 3), 0] : [-1, -1]; lg.ug[1] = lg.ug[0] + ri(2, 5); }
      if (A.includes('ug') && lg.ug[0] >= 0 && i >= lg.ug[0] && i < lg.ug[1]) continue;   // 지하 구간: GPS·기지국 근거가 끊겨 위치 판단이 이 역들을 건너뜀
      var skipP = A.includes('skip3') ? 0.25 : 0.08;
      if (R() < skipP && i < lg.end) continue;
      if (R() < 0.5) { var le = truth[i] - ri(60, 170); if (le > lastAt + 5) { events.push({ at: le, type: 'adopt', idx: i, lead: true }); lastAt = le; } }
      var a = Math.max(lastAt + 5, truth[i] + ri(5, 70)); events.push({ at: a, type: 'adopt', idx: i }); lastAt = a;
      if (A.includes('pullback') && R() < 0.1 && i > lg.start + 1) events.push({ at: a + ri(10, 40), type: 'pull', idx: i - 1 });   // 위치가 한 칸 되돌아갔다 다시 오는 경우
    }
  });
  events.sort(function (x, y) { return x.at - y.at; });

  // ── 여기부터는 '앱'이 하는 일: 통과 기록을 쌓아 엔진에 보낸다(계산 없음) ──
  var inNodes = nodes.map(function (n) { return { name: n.name, isSub: !!n.isSub, isBus: !!n.isBus, isWalk: !!n.isWalk, isOrigin: !!n.isOrigin, lineName: n.line || '', planMin: n.plan }; });
  var firstLeg = legs[0];
  var ttIn = (!process.env.NOTT && firstLeg.ttTimes) ? { boardIdx: firstLeg.start, times: firstLeg.ttTimes } : null;
  var passes = [], boarded = false, rec = [], offlineLeft = 0, lastR = null;
  // TICKS=1 : 사건 사이(사건 뒤 40초·100초)에도 엔진에 물어 본다 — 통과 증거가 새로 없는 '조용한 구간'의 정확도(연착·실시간 도착정보 등)를 재기 위해
  var samples = events.map(function (ev) { return { at: ev.at, ev: ev }; });
  if (process.env.TICKS) events.forEach(function (ev, k) { var nx = events[k + 1] ? events[k + 1].at : destTruth; [40, 100].forEach(function (dt) { if (ev.at + dt < nx - 5 && ev.at + dt < destTruth) samples.push({ at: ev.at + dt, ev: { at: ev.at + dt, type: 'tick', idx: ev.idx, lead: false } }); }); });
  samples.sort(function (x, y) { return x.at - y.at; });
  samples.forEach(function (smp) {
    var ev = smp.ev;
    var nowMs = MID + ev.at * 1000;
    if (ev.type === 'board') {
      boarded = true;
      // MOVE=p : 승차 확정 때 위치 궤적에서 '움직임 시작'을 되짚어 찍을 수 있는 비율(지하 승강장 등은 궤적이 없다). 별도 난수라 다른 시나리오는 그대로다.
      var mvR = rng(SEED * 100003 + sc * 131 + ev.idx * 17 + 7), hasMv = MOVE > 0 && mvR() < MOVE;
      if (hasMv) { var lagS = -35 + mvR() * 95 + (mvR() * 16 - 8); if (ANOM.split(',').includes('badmove') && mvR() < 0.15) lagS = -(120 + mvR() * 240);   // 엉뚱한 움직임(앞서 달리던 버스·차)을 출발로 오인: 2~6분 이르게 찍힘
       passes.push({ idx: ev.idx, ms: MID + (truth[ev.idx] + lagS) * 1000, src: 'move' }); }   // 실제 출발 + (−35~+60초 ± 오차) — 앱의 startMs = 탑승 증거가 선 시각 − 60초
      else passes.push({ idx: ev.idx, ms: nowMs, src: 'board' });
    }
    else if (ev.type === 'adopt') {
      var pidx = ev.idx, xr = rng(SEED * 31337 + sc * 71 + Math.round(ev.at) * 3 + 11);
      if (ANOM.split(',').includes('falsepf') && !ev.lead && xr() < 0.08) { var dlt = [-1, 1, 2][Math.floor(xr() * 3)]; pidx = Math.max(firstLeg.start + 1, Math.min(nodes.length - 1, ev.idx + dlt)); }   // 위치 채택이 엉뚱한 역으로 찍힘
      passes.push({ idx: pidx, ms: nowMs, src: ev.lead ? 'cell' : 'pf' });
      if (ANOM.split(',').includes('dupe') && xr() < 0.12) passes.push({ idx: pidx, ms: nowMs + 20000, src: 'pf' });                                                    // 같은 역이 20초 뒤 한 번 더 채택됨
    }
    var ox = rng(SEED * 4099 + sc * 53 + Math.round(ev.at) + 3);
    if (ANOM.split(',').includes('restart') && boarded && ox() < 0.02) { passes = []; }                                       // 앱이 꺼졌다 켜져 모아 둔 증거를 잃음(탔다는 사실은 남음)
    var offlineNow = false;
    if (ANOM.split(',').includes('offline')) { if (offlineLeft > 0) { offlineLeft--; offlineNow = true; } else if (rec.length && ox() < 0.06) { offlineLeft = 2 + Math.floor(ox() * 4); offlineNow = true; } }   // 통신 끊김: 엔진 응답을 못 받아 마지막 화면 값이 남는다
    var input = { nowMs: nowMs, nodes: inNodes, passes: passes.slice(), boarded: boarded, notDeparted: false };
    if (ttIn) input.timetable = ttIn;
    if (EXTRA_OPTS || process.env.ROUND) input.opts = Object.assign({}, EXTRA_OPTS || {}, process.env.ROUND ? { rounding: process.env.ROUND } : {});
    var r;
    if (process.env.DUMP && process.env.DUMP === sc + ':' + rec.length) fs.writeFileSync(process.env.DUMP_FILE || '/dev/stderr', JSON.stringify(input));   // 디버그: 그 사건의 엔진 입력을 그대로 저장
    try { r = (offlineNow && lastR) ? lastR : E.rideEta(input); if (!offlineNow) lastR = r; } catch (e) { errs.push(String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); rec.push({ err: String(e && e.message) }); return; }
    var tl = r.arr;
    var p = tl[destIdx].split(':'); var eta = (+p[0]) * 60 + (+p[1]);
    var mono = 0; for (var q = 1; q < tl.length; q++) { var a1 = tl[q - 1].split(':'), c1 = tl[q].split(':'); var dd = ((+c1[0]) * 60 + (+c1[1])) - ((+a1[0]) * 60 + (+a1[1])); if (dd < -720) dd += 1440; if (dd < -0.01) mono++; }
    var nm = minOfDayKst(nowMs); var etaNow = eta - nm; if (etaNow < -720) etaNow += 1440; if (etaNow > 720) etaNow -= 1440;
    var ti = -1; for (var z = 0; z < trIdx.length; z++) if (truth[trIdx[z]] <= ev.at) ti = trIdx[z];
    var etaErr = (eta - destTruth / 60) % 1440; if (etaErr > 720) etaErr -= 1440; if (etaErr < -720) etaErr += 1440;
    var ps = []; var seen = {}; passes.forEach(function (x) { seen[x.idx] = x.ms; }); for (var z = 0; z < nodes.length; z++) ps.push(seen[z] == null ? null : +(((seen[z] - MID) / 60000).toFixed(1)));
    var exact = (r.etaMs[destIdx] - MID) / 60000 - destTruth / 60;
    rec.push({ mono: mono, etaNow: etaNow, at: ev.at, type: ev.type, lead: !!ev.lead, idx: ev.idx, etaErr: etaErr, etaErrX: exact, sm: null, ps: ps, here: -1, trueIdx: ti, tl: tl, delayMin: r.delayMin });
  });
  out.push({ sc: sc, kind: kind.join('>'), dir: dk, truthBoard: truth[legs[0].start] / 60, firstTransit: legs[0].start, startMin: startMin, destPlan: nodes[destIdx].plan, destTruth: destTruth / 60, nodes: nodes.length,
    legInfo: legs.map(function (l) { return { start: l.start, end: l.end, lc: l.lc, shift: l.shift || 0, ug: l.ug || null, type: l.type }; }),
    names: nodes.map(function (n) { return n.name; }), plan: nodes.map(function (n) { return n.plan; }), truthAll: nodes.map(function (n, i) { return truth[i] != null ? truth[i] / 60 : null; }), rec: rec,
    events: events.map(function (e) { return { at: e.at, type: e.type, idx: e.idx, lead: !!e.lead }; }) });
}
process.stdout.write(JSON.stringify({ errs: errs, out: out, logs: [] }));
