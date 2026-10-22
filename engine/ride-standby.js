// 길동무 — 대기 모드(웹뷰가 사라져도 네이티브가 이어받는 안내) 엔진 (route-v2 Worker 에 붙여 넣는 순수 함수)
//
// ★ 원칙(YJ): "계산은 엔진이, 그림은 앱이." 네이티브(KeepAliveService)는 GPS 를 모아 이 엔진에 보내고,
//   돌려받은 알림·상태 문구를 그리기만 한다. 영점·도착 시각 밀고 당기기·하차 알림 규칙은 전부 여기(+ride-track·ride-eta)에서 정한다.
// ★ 2026-10-13 (YJ: "카카오지하철처럼 안내 로직을 네이티브로"): 앱을 최근 목록에서 밀어 닫으면 웹뷰(JS)가 사라져 안내가 멈췄다.
//   웹뷰가 살아 있는 동안 JS 가 '여정 상태'(state)를 네이티브에 맡겨 두고, 웹뷰가 사라지면 네이티브가 5초마다 이 엔진을 불러 이어간다.
//
// 상태 없음(stateless): 서버는 아무것도 기억하지 않는다. 상태(state)는 요청에 실려 가서 갱신된 채로 돌아온다 — 네이티브는 state 를 해석하지 않고 그대로 들고 있다.
//
// 입력  { nowMs, fixes?:[[ts,lat,lng,acc?]…]   마지막 호출 이후 새로 모은 위치(오래된 것 먼저),
//         state: {
//           v:1, tripSig?,
//           eta:   /ride-eta 입력과 같은 모양(앱 _etaPayload — nowMs 는 매번 엔진이 덮어쓴다). nodes·passes·boarded·notDeparted·timetableFirst·tzOffsetMin·boardInfo …
//           stops: [{i,lat,lng,arrMs,fin?,pass?,bus?}…]   영점용 정류장(앱 _arrEndStops) — arrMs 는 엔진이 매번 최신 도착 시각(etaMs)으로 맞춘다.
//           trail: [[ts,lat,lng,acc?]…]                    최근 궤적(엔진이 fixes 를 덧붙이고 60개·10분으로 자른다).
//           cfg:   { targets:[{seqPos,nodeIdx,name,kind,nextLine?}…], seq:[노드번호…], allowed:{type:bool}, destName }   하차·환승 알림 대상(앱 _buildTransitAlertTargets)
//           ovl:   { cells:[…], map:[…], base, theme }       오버레이 그림 틀(웹이 앱 경로 화면에서 읽은 칸 — 선택)
//           fired: {"노드_남은정거장":1}                    이미 보낸 알림
//           notYet:{노드번호:ms}, etaMs:[…], arrivedAt?, steps }
//       }
//   ★ s109 추가 입력(최상위): rc:{a,b,m,go}   앱이 /reco-text 의 ad 줄(가게·상품)을 한 번 알려 준다(엔진이 받은 시각을 at 으로 찍는다) · rcDis:at   [확인]/[보기]로 닫은 추천 ·
//        act:'press'|'undo'|'open'|'close'|'pill'   오버레이 탑승 줄 손짓(수동 탑승 · 되돌리기 20초 · 줄 열고 닫기).   추가 출력: overlay.reco · overlay.getoff(하단 줄) · overlay.rs(탑승 줄) · quit(도착 3분 뒤 done 이면 true — 앱 화면까지 끝낸다).
// 출력  { v:1, state(갱신본 — 네이티브는 그대로 다음 호출에 보낸다),
//         ongoing:{title,text}      알림창의 상주 알림에 그릴 문구,
//         alert:null|{key,type,title,body,vib:[ms…]}   지금 울릴 알림 하나(같은 순간에 걸린 나머지는 보낸 것으로 처리),
//         done:bool                 안내를 끝내도 된다(목적지 도착 알림 뒤 3분),
//         overlay:null|{…}          네이티브 오버레이에 그릴 값(OverlayPlugin.update 와 같은 모양 — state.ovl 그림 틀이 있을 때만),
//         reco:{fire,why,dest,remSec?,slot?,dinner?,alertAt,key?,arrMs?,remMin?,loc?}   하차 7분 전 추천을 지금 보낼 때인가(arrive-reco 규칙 · 한 여정 한 번) — 글은 /reco-text. fire 가 아니어도 남은 초·시간대는 실려 '상태 확인'이 쓴다,
//         view:{text,line1,line2,curIdx,at}   앱을 다시 열었을 때 보여 줄 마지막 상태,
//         pos:null|{from,to,ratio,moving}  지금 위치(노드 번호 from→to, 구간 비율) — 결과 카드의 내 위치 마커용, arr:[HH:MM…] 노드별 도착 시각,
//         zero:{…}                  ride-track 영점 결과(진단용), notes:[…] }
//
// 이 파일은 ride-track.js · ride-eta.js 의 rideTrack · rideEta 를 쓴다(Worker 에서는 같은 범위의 함수, Node 시험에서는 require).
var RIDE_STANDBY_DEFAULTS = {
  trailMax: 60,            // 상태에 담는 궤적 점 수
  trailMaxAgeSec: 600,     // 이보다 오래된 점은 버린다
  notYetKeepSec: 45,       // notYet 증거를 유지하는 시간
  gpsGapDeadReckonSec: 180, // 시각표 기준이 아닌 여정(버스): GPS 가 이만큼 끊기면 계획 시각표대로 이어간다(멈춰 서 있지 않게)
  offGiveUpSec: 900,       // 경로를 벗어난 채 이만큼 지나면 안내를 끝낸다(내리고도 서비스가 계속 도는 것을 막는다)
  doneAfterSec: 180,       // 목적지 도착 알림 뒤 이 시간이 지나면 done
  maxStaleSec: 3 * 3600,   // 상태가 이보다 오래 갱신되지 않았으면 done(안전 장치)
  // ★ 2026-10-19 (YJ: "영점은 역·정류장 도착 후 5초 안에"): 다음 호출까지의 간격도 엔진이 정한다(네이티브는 nextMs 를 그대로 따른다).
  //   표시 도착 시각 앞 nearBeforeSec ~ 뒤 nearAfterSec 안에는 nearStepMs, 그 밖에는 stepMs. (웹 _trkGapMs 와 같은 창)
  stepMs: 5000, nearStepMs: 2500, nearBeforeSec: 30, nearAfterSec: 40,
  // ★ 2026-10-21 승차 대기: 시작 때 첫 승차역 출발 시각 전이면 '아직 안 탔다'로 두고, 위치로 열차를 탄 것(역 근처 → 빠르게 멀어짐)을 감지하면 승차 확정으로 바꾼다.
  waitNearM: 150,          // 승차역에서 이 거리 안(정확도 뺀 값)에 한 번이라도 있었으면 '역에 왔다'
  waitAwayM: 400,          // 그 뒤 이 거리 밖으로 벗어나고
  waitMoveMps: 4.0,        // 최근 속도가 이 이상(걷는 속도 3.0 보다 빠름)이면 열차를 탄 것
  waitSpanSec: 15, waitWinSec: 60, waitFreshSec: 25,
  waitStartLateSec: 90,    // 시작이 첫 승차역 시각보다 이만큼 이상 늦었으면 이미 탄 것으로 본다(대기 없음)
  waitGraceSec: 480,       // 시각 뒤 이만큼 지나도 감지 못 하면 탔다고 보고 시각표대로 이어간다(알림이 영영 안 울리는 것을 막는다)
  ongoingTitle: '길동무 경로 안내 중'
};

function rsTrackFn() { return (typeof rideTrack === 'function') ? rideTrack : require('./ride-track').rideTrack; }
function rsRowFn() { return (typeof rideRow === 'function') ? rideRow : require('./ride-eta').rideRow; }
function rsEtaFn() { return (typeof rideEta === 'function') ? rideEta : require('./ride-eta').rideEta; }
function rsClone(o) { return JSON.parse(JSON.stringify(o)); }

// 'HH:MM' 이 아니라 etaMs 로 분 단위 남은 시간을 말한다(앱 문구 규칙 그대로: 0~4분 안일 때만 '(약 N분 후)').
function rsMinTxt(etaMs, idx, now, remain) {
  if (remain === 0 || !etaMs || etaMs[idx] == null) return '';
  var td = (etaMs[idx] - now) / 60000;
  return (td >= 0 && td < 4) ? ' (약 ' + Math.max(1, Math.round(td)) + '분 후)' : '';
}
function rsAlertType(tg, remain) {
  return (tg.kind === 'transfer') ? (remain === 2 ? 'transfer2' : 'transfer')
    : (remain === 2 ? 'near_arrive2' : (remain === 1 ? 'near_arrive' : 'arrive'));
}
// 앱 _checkTransitAlerts / _fireTransitAlert 의 규칙을 그대로 옮겼다: 환승·하차 2·1정거장 전, 목적지 도착. 한 번의 판정에는 가장 급한(남은 정거장이 적은) 하나만 울린다.
// mtFn(tg, remain) → '(약 N분 후)' 같은 덧말 — 안 주면 대기 모드 규칙(rsMinTxt: 0~4분 안일 때만). 앞 화면 알림(ride-alert)은 자기 규칙을 넘긴다.
function rsAlerts(cfg, fired, curIdx, etaMs, now, mtFn) {
  var targets = cfg.targets || [], seq = cfg.seq || [], allowed = cfg.allowed || {}, curPos = -1, i;
  for (i = 0; i < seq.length; i++) { if (seq[i] <= curIdx) curPos = i; else break; }
  if (curPos < 0) return { alert: null, extra: [], curPos: curPos };
  var due = [];
  targets.forEach(function (tg) {
    var remain = tg.seqPos - curPos;
    if (remain === 2 || remain === 1 || (remain === 0 && tg.kind === 'dest')) {
      var type = rsAlertType(tg, remain), key = tg.nodeIdx + '_' + remain;
      if (!fired[key] && allowed[type] !== false) due.push({ tg: tg, remain: remain, key: key, type: type });
    }
  });
  if (!due.length) return { alert: null, extra: [], curPos: curPos };
  due.sort(function (a, b) { return a.remain - b.remain; });
  var d = due[0], tg = d.tg, mt = mtFn ? mtFn(tg, d.remain) : rsMinTxt(etaMs, tg.nodeIdx, now, d.remain), title, body, vib;
  if (tg.kind === 'transfer') {
    if (d.remain === 2) { title = '환승 2정거장 전'; body = tg.name + '에서 ' + (tg.nextLine || '다음 노선') + ' 환승이에요. 곧 준비하세요' + mt; vib = [400, 150, 400]; }
    else { title = '환승 준비'; body = '다음 정거장 ' + tg.name + '에서 ' + (tg.nextLine || '다음 노선') + ' 환승 — 내릴 준비하세요' + mt; vib = [300, 100, 300, 100, 300]; }
  } else {
    if (d.remain === 2) { title = '목적지 2정거장 전'; body = tg.name + '까지 2정거장 남았어요' + mt; vib = [400, 150, 400]; }
    else if (d.remain === 1) { title = '곧 하차'; body = '다음 정거장 ' + tg.name + ' — 내릴 준비하세요' + mt; vib = [300, 100, 300, 100, 300]; }
    else { title = '목적지 도착'; body = tg.name + '에 도착했습니다. 수고하셨어요'; vib = [300, 100, 300, 100, 300]; }
  }
  return { alert: { key: d.key, type: d.type, title: title, body: body, vib: vib }, extra: due.slice(1).map(function (x) { return x.key; }), curPos: curPos };
}


// ── 오버레이 하단 줄(추천 · 내릴 준비) · 탑승 줄(rs) · 수동 탑승 ─────────────────────────────────
// ★ 2026-10-21 (s109): 옛 웹이 만들던 값을 엔진이 만든다. 앱은 /reco-text 의 'ad'(가게·상품 줄)를 req.rc 로 한 번 알려 주고(엔진이 받은 시각을 at 으로 찍는다),
//   [확인]을 누르면 req.rcDis(=at)를, 오버레이 탑승 줄 손짓은 req.act('press'|'undo'|'open'|'close'|'pill')를 보낸다. 무엇을 언제 보일지는 모두 여기서 정한다.
function rsCheerFn() { return (typeof reArrCheer === 'function') ? reArrCheer : (function () { try { return require('./ride-eta').reArrCheer; } catch (e) { return null; } })(); }
var RS_CHARS = ['dolsom', 'lovel', 'dudung', 'sul', 'ppopu', 'chaeng'];
function rsChar(at) { return RS_CHARS[Math.abs(Math.floor((+at || 0) / 1000)) % RS_CHARS.length]; }
function rsClampTxt(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// ── 탑승 시트(앱 화면 · 오버레이 공통): 환승 구간 승차 ───────────────────────────────────────────
// 웹 _rsLegs · _rsNotDeparted · _rsAlightGps · _rsPress 의 계산을 엔진으로 옮긴 것. 첫 구간은 위(rsWait)가 맡고, 둘째 구간부터는 여기서 '환승 대기'(st.xw)를 만든다.
var RS_LEAD_MS = 120000;     // 도착 2분 전부터 시트를 올린다
var RS_EARLY_MS = 90000;     // 도착 1분 반보다 일찍 누른 것은 '예약'
var RS_SHRINK_MS = 180000;   // 출발 3분이 지나도 안 눌렀으면 알약으로 줄인다
var RS_ALIGHT_M = 150;       // 앞 구간 하차를 못 잡았어도 위치가 다음 승차 지점 150m 안에서 멈춰 있으면 내린 것으로 본다
// 노선(모드·노선명)이 바뀔 때마다 한 구간: [{k, bi(승차 노드), ai(하차 노드), mode, line, name}]
function rsLegsOf(eta) {
  var nodes = (eta && eta.nodes) || [], out = [], cur = null, i, n, mode, ln;
  for (i = 1; i < nodes.length; i++) {
    n = nodes[i];
    if (!n || n.isWalk || !(n.isSub || n.isBus)) { cur = null; continue; }
    mode = n.isSub ? 'sub' : 'bus'; ln = n.lineName || '';
    if (cur && cur.mode === mode && cur.line === ln) cur.ai = i;
    else { cur = { k: out.length, bi: i, ai: i, mode: mode, line: ln, name: n.name || '' }; out.push(cur); }
  }
  return out;
}
function rsMaxPass(eta) { var ps = (eta && eta.passes) || [], m = -1, i; for (i = 0; i < ps.length; i++) if (ps[i] && ps[i].idx > m) m = ps[i].idx; return m; }
function rsAlightGps(st, tr, bi) {
  var stops = st.stops || [], s = null, i;
  for (i = 0; i < stops.length; i++) if (stops[i].i === bi) { s = stops[i]; break; }
  if (!s || !tr.length || !isFinite(s.lat) || !isFinite(s.lng)) return false;
  var q = tr[tr.length - 1], o = null;
  if (rsHav(q[1], q[2], s.lat, s.lng) > RS_ALIGHT_M) return false;
  for (i = tr.length - 2; i >= 0; i--) if (q[0] - tr[i][0] >= 20000) { o = tr[i]; break; }
  if (!o || q[0] - o[0] > 120000) return false;
  return rsHav(o[1], o[2], q[1], q[2]) / ((q[0] - o[0]) / 1000) <= 2.5;
}
// ── 탑승 버튼 보정(웹 _rsLateCheck · _rsPressTrain · _rsPressVerify 를 엔진으로) ─────────────────────────
//   · 어느 차를 탔나: 누른 시각 기준 시각표상 '방금(1분 안에) 떠난 차'가 있으면 그 차, 없으면 다음 차(12분 안) — 출발 시각(:30)을 승차 통과 시각으로 적는다.
//   · 일찍 눌러 예약이 될 것이라도 방금 떠난 차가 있으면 예약하지 않고 바로 확정한다(실시간 위치가 없는 노선에서 조금 늦게 누른 경우).
//   · 승차역에서 분명히 먼 곳(800m 밖)에서 눌렀으면 버튼을 거두고 알린다(ride-track press).
//   시각표는 비동기라 순수 함수에서 못 읽는다 → 워커 연결부(handleRideStandby)가 rsPressQuery 로 물을 것을 정해 시각표에서 읽어 req.pressTT 로 넣어 준다.
var RS_NEAR_M = 600;          // 승차역에서 이보다 멀면 '방금 떠난 차' 인정을 하지 않는다
var RS_LATE_BACK_MIN = 1;     // 방금 = 지금 분 · 한 분 전
var RS_PICK_MAX_MIN = 12;     // 다음 차가 이보다 멀면 건드리지 않는다
// 지금 누르면 대상이 되는 정류장 번호(첫 구간 대기 → st.wait, 아니면 환승 대기 → st.xw)
function rsPressTarget(st) { if (!st) return -1; if (st.wait) return st.wait.i; if (st.xw && !st.xPend) return st.xw.i; return -1; }
// 시각표에 물을 것: { i, line, from, to, atMin, baseMs } — 지하철 구간이 아니거나 누르는 손짓이 아니면 null
function rsPressQuery(req) {
  if (!req || req.act !== 'press' || !req.state || !req.state.eta || !isFinite(+req.nowMs)) return null;
  var st = req.state, i = rsPressTarget(st), nodes = st.eta.nodes || [], n = nodes[i], nx = nodes[i + 1];
  if (i < 0 || !n || !n.isSub || n.isBus || !n.lineName || !n.name) return null;
  var tz = st.eta.tzOffsetMin != null && isFinite(+st.eta.tzOffsetMin) ? +st.eta.tzOffsetMin : 540;
  var atMin = Math.floor((((+req.nowMs / 60000 + tz) % 1440) + 1440) % 1440);
  return { i: i, line: n.lineName, from: n.name, to: (nx && nx.name) || '', atMin: atMin, baseMs: +req.nowMs };
}
// 시각표(nt.boardTable)에서 답을 읽어 req.pressTT = { i, nowM, depMin, late } 로 붙인다. late = 방금 떠난 차의 출발 분(없으면 null)
function rsAttachPressTT(req, nt) {
  try {
    var q = rsPressQuery(req); if (!q || !nt || typeof nt.boardTable !== 'function') return false;
    var bl = nt.boardTable({ line: q.line, from: q.from, to: q.to, atMin: q.atMin - RS_LATE_BACK_MIN, baseMs: q.baseMs });
    var dep = bl && bl.depMin, ok = dep != null && isFinite(dep) && dep <= q.atMin && dep >= q.atMin - RS_LATE_BACK_MIN;
    req.pressTT = { i: q.i, nowM: q.atMin, depMin: dep != null && isFinite(dep) ? dep : null, late: ok ? dep : null };
    return true;
  } catch (e) { return false; }
}
// 승차 통과 시각(ms): 방금 떠난 차(late) → 그 출발 시각 · 없으면 다음 차(depMin, 12분 안) → 그 시각 · 아니면 누른 시각
function rsPickMs(tt, i, now) {
  if (!tt || tt.i !== i) return now;
  var m = tt.late != null && isFinite(tt.late) ? tt.late : (tt.depMin != null && isFinite(tt.depMin) ? tt.depMin : null);
  if (m == null) return now;
  var d = m - tt.nowM; if (d < -720) d += 1440; if (d > 720) d -= 1440;
  if (d > RS_PICK_MAX_MIN) return now;
  return now - (now % 60000) + d * 60000 + 30000;       // 시각표 06:17 → 06:17:30 출발(영점의 :30 규칙과 같다)
}
function rsStopOf(st, i) { var stops = st.stops || [], k; for (k = 0; k < stops.length; k++) if (stops[k].i === i) return stops[k]; return null; }
// 승차역까지의 거리(m) — 위치나 좌표를 모르면 null
function rsDistToStop(st, tr, i) {
  var s = rsStopOf(st, i); if (!s || !tr.length || !isFinite(s.lat) || !isFinite(s.lng)) return null;
  var q = tr[tr.length - 1]; return rsHav(q[1], q[2], s.lat, s.lng);
}
// 눌러서(또는 예약 시각이 되어) 그 구간 차량을 탔다고 기록한다. 되돌릴 때 쓸 이전 통과 기록을 돌려준다.
function rsXCommit(st, i, now, ms) {
  var eta = st.eta, passes = eta.passes = eta.passes || [], hit = -1, k;
  for (k = 0; k < passes.length; k++) if (passes[k].idx === i) { hit = k; break; }
  var prev = hit >= 0 ? passes[hit] : null, np = { idx: i, ms: ms != null ? ms : now, src: 'gps' };
  if (hit >= 0) passes[hit] = np; else passes.push(np);
  (st.rsDone = st.rsDone || {})[i] = 1;
  delete st.xw; delete st.xPend; st.rsOpen = 0;
  return prev;
}
// 환승 대기: 아직 안 탄 첫 환승 구간이 있고 앞 구간을 내렸으면 st.xw = {i,k,mode,line,name,arrMs,seen,shr}. 예약(xPend)은 그 시각이 되면 확정한다.
function rsXwait(st, tr, now, notes) {
  var eta = st.eta;
  if (st.wait || !eta) { delete st.xw; delete st.xPend; return; }
  var legs = rsLegsOf(eta), pm = rsMaxPass(eta), L = null, i, done = st.rsDone || {};
  for (i = 1; i < legs.length; i++) { if (pm >= legs[i].bi || done[legs[i].bi]) continue; L = legs[i]; break; }
  if (!L) { delete st.xw; delete st.xPend; return; }
  var dep = (st.etaMs && st.etaMs[L.bi] != null && isFinite(st.etaMs[L.bi])) ? st.etaMs[L.bi] : null;
  if (dep == null) { var sp = (st.stops || []).filter(function (q) { return q.i === L.bi; })[0]; dep = sp && isFinite(sp.arrMs) ? sp.arrMs : null; }
  var prevAt = st.etaMs && st.etaMs[L.bi - 1] != null && isFinite(st.etaMs[L.bi - 1]) ? st.etaMs[L.bi - 1] : null;      // 웹 _timeMaxIdx: 시각표상 앞 구간 하차 시각이 지났으면 내린 것으로 본다
  if (dep == null || !(pm >= L.bi - 1 || (prevAt != null && prevAt <= now) || rsAlightGps(st, tr, L.bi))) { delete st.xw; if (st.xPend && st.xPend.i !== L.bi) delete st.xPend; return; }
  var keep = st.xw && st.xw.i === L.bi ? st.xw : null;
  st.xw = { i: L.bi, k: L.k, mode: L.mode, line: L.line, name: L.name, arrMs: dep, seen: keep ? !!keep.seen : false, shr: keep ? !!keep.shr : false };
  if (st.xPend && st.xPend.i === L.bi && dep - now <= RS_EARLY_MS) { var pv = rsXCommit(st, L.bi, now); notes.push('환승 예약 확정(' + L.bi + '번)'); if (st.rsUndo && st.rsUndo.x) st.rsUndo.prev = pv; }
}
function rsContrast(hex) {
  var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return '#ffffff';
  var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? '#121214' : '#ffffff';
}

// 앱이 알려 준 추천 줄 · 닫기 · 탑승 줄 손짓을 상태에 반영한다(승차 대기 판정 직후).
function rsActs(st, req, now, notes) {
  var rc = req.rc, eta = st.eta, k, w, passes;
  if (st.rsUndo && now >= st.rsUndo.until) delete st.rsUndo;
  if (rc && typeof rc === 'object' && String(rc.a || '').length) {
    var sig = String(rc.a) + '|' + String(rc.b || '');
    if (!st.rcAd || st.rcAd.sig !== sig) st.rcAd = { sig: sig, at: now, a: rsClampTxt(rc.a, 40), b: rsClampTxt(rc.b, 64), m: rsClampTxt(rc.m, 32), go: rc.go === '쿠팡 보기' ? '쿠팡 보기' : '맛집 보기' };
  }
  if (isFinite(req.rcDis) && +req.rcDis > 0) st.rcDis = +req.rcDis;
  var a = req.act;
  if (a === 'open' || a === 'pill') { st.rsOpen = now + 20000; if (st.xw) st.xw.shr = false; }
  else if (a === 'close') { st.rsOpen = 0; if (st.xw && st.xw.arrMs != null && st.xw.arrMs - now <= RS_LEAD_MS) st.xw.shr = true; }   // 도착 2분 안에 닫은 차량은 대기 알약으로(다시 올리지 않음) · 2분보다 먼 때 닫은 것은 2분 안이 되면 자동으로 다시 올라온다
  else if (a === 'press' && !st.wait && st.xw && !st.xPend) {
    var x = st.xw, tt = req.pressTT && req.pressTT.i === x.i ? req.pressTT : null, dN = rsDistToStop(st, st.trail || [], x.i);
    var lateHit = !!(tt && tt.late != null && !(dN != null && dN > RS_NEAR_M));      // 방금 떠난 차가 있으면 예약하지 않고 바로 확정
    if (!lateHit && x.arrMs != null && x.arrMs - now > RS_EARLY_MS) {      // 도착 1분 반보다 일찍 누른 것은 예약만(마커가 튀지 않게) — 그 시각이 되거나 탄 증거가 잡히면 확정
      st.xPend = { i: x.i, at: now }; st.rsOpen = 0; x.seen = true;
      st.rsUndo = { w: { i: x.i }, x: true, pend: true, prev: null, until: now + 20000 };
      notes.push('환승 예약(' + x.i + '번 · 도착 ' + Math.round((x.arrMs - now) / 1000) + '초 전)');
    } else {
      st.rsUndo = { w: { i: x.i }, x: true, prev: rsXCommit(st, x.i, now, rsPickMs(tt && (dN == null || dN <= RS_NEAR_M || tt.late == null) ? tt : null, x.i, now)), until: now + 20000 };
      notes.push('환승 수동 확정(' + x.i + '번)' + (lateHit ? ' · 방금 떠난 차 인정' : ''));
      rsPressVerify(st, x.i, now, notes);
    }
  } else if (a === 'undo' && st.rsUndo && now < st.rsUndo.until && st.rsUndo.x) rsDoUndo(st, now, notes);
  else if (a === 'press' && st.wait) {
    w = st.wait; passes = eta.passes = eta.passes || [];
    var tw = req.pressTT && req.pressTT.i === w.i ? req.pressTT : null, dW = rsDistToStop(st, st.trail || [], w.i);
    var hit = -1;
    for (k = 0; k < passes.length; k++) if (passes[k].idx === w.i) { hit = k; break; }
    st.rsUndo = { w: w, prev: hit >= 0 ? passes[hit] : null, until: now + 20000 };
    var np = { idx: w.i, ms: rsPickMs(tw && !(dW != null && dW > RS_NEAR_M && tw.late != null) ? tw : null, w.i, now), src: 'gps' };
    if (hit >= 0) passes[hit] = np; else passes.push(np);
    eta.boarded = true; eta.notDeparted = false; delete st.wait; st.rsOpen = 0;
    notes.push('승차 수동 확정(오버레이 탑승 버튼)' + (np.ms !== now ? ' · 시각표 ' + Math.round((np.ms - now) / 1000) + '초' : ''));
    rsPressVerify(st, w.i, now, notes);
  } else if (a === 'undo' && st.rsUndo && now < st.rsUndo.until && !st.rsUndo.x) rsDoUndo(st, now, notes);
}
// 되돌리기: 환승 확정(예약 포함) 또는 첫 구간 탑승 확정을 이전 기록으로 돌린다
function rsDoUndo(st, now, notes) {
  var eta = st.eta, ux = st.rsUndo, pxs = eta.passes || [], ki;
  if (!ux) return;
  if (ux.x) {
    if (ux.pend) delete st.xPend;
    else {
      for (ki = pxs.length - 1; ki >= 0; ki--) if (pxs[ki].idx === ux.w.i) { if (ux.prev) pxs[ki] = ux.prev; else pxs.splice(ki, 1); }
      if (st.rsDone) delete st.rsDone[ux.w.i];
    }
    delete st.rsUndo; st.rsOpen = now + 20000; rsXwait(st, st.trail || [], now, notes); if (st.xw) { st.xw.shr = false; st.xw.seen = true; }
    notes.push('환승 확정 되돌림');
  } else {
    for (ki = pxs.length - 1; ki >= 0; ki--) if (pxs[ki].idx === ux.w.i) { if (ux.prev) pxs[ki] = ux.prev; else pxs.splice(ki, 1); }
    eta.boarded = false; eta.notDeparted = true; st.wait = ux.w; delete st.rsUndo; st.rsOpen = 0;
    notes.push('승차 확정 되돌림(오버레이)');
  }
}
// ── 경로 카드 버튼 줄의 오른쪽 칸(웹 routeSlotBtn): 탑승 → 환승 → 도착. 칸의 뜻·전환 연출은 ride-eta 의 rideRow 가 정하고, 여기서는 탑승 확정 증거(구간별 done)만 모아 넘긴다.
//   출력 row = { slot, label, leg, can(지금 누르면 먹히나), anim:{kind,ms,ease,sq(전환이 일어난 시각 ms),o(바뀌기 전 칸)} } — 전환은 한 번 정해지면 다음 전환까지 그대로 들고 있고, 앱은 sq 가 방금(2초 안)일 때만 연출한다.
function rsRowOut(st, now) {
  try {
    var legs = rsLegsOf(st.eta), pm = rsMaxPass(st.eta), done = st.rsDone || {}, ev = [], k;
    for (k = 0; k < legs.length; k++) ev.push({ done: (k === 0 ? !st.wait : false) || pm >= legs[k].bi || !!done[legs[k].bi], mode: legs[k].mode });
    var prev = st.rowSlot || 'none', r = rsRowFn()({ op: 'row', locked: true, legs: ev, prev: prev });
    if (r.slot !== prev) { st.rowAnim = { kind: r.anim.kind, ms: r.anim.ms, ease: r.anim.ease, sq: now, o: prev }; st.rowSlot = r.slot; }
    var an = st.rowAnim || { kind: 'none', ms: 0, ease: r.anim.ease, sq: 0, o: 'none' };
    return { slot: r.slot, label: r.label, leg: r.leg, can: r.slot === 'arrive' || !!(st.wait || (st.xw && !st.xPend)), anim: an };
  } catch (e) { return null; }
}
// 누른 순간 승차역에 있나(ride-track press): 800m 밖('away')이면 버튼을 거두고 알린다. 가깝거나 위치를 모르면(지하) 그대로 시각표를 따른다.
function rsPressVerify(st, i, now, notes) {
  try {
    var s = rsStopOf(st, i), tr = st.trail || [];
    if (!s || !isFinite(s.lat) || !isFinite(s.lng) || !tr.length || !st.rsUndo) return;
    var res = rsTrackFn()({ nowMs: now, trail: tr, plan: { pts: [], pressPt: { lat: s.lat, lng: s.lng } }, want: { off: false, ridden: false, miss: false, bus: false, press: true } });
    var pr = res && res.press;
    if (!pr) return;
    notes.push('승차역확인 ' + pr.state + (pr.distM != null ? ' ' + pr.distM + 'm' : '') + (pr.why ? ' (' + pr.why + ')' : ''));
    if (pr.state === 'away') {
      rsDoUndo(st, now, notes);
      st.rsToast = { t: '승차역에서 ' + pr.distM + 'm 떨어져 있어요. 도착해서 다시 눌러 주세요', until: now + 8000 };
      notes.push('승차역에서 멀어 버튼을 거둠');
    }
  } catch (e) { notes.push('승차역확인 실패: ' + (e && e.message)); }
}
// 탑승 줄(앱 탑승 시트 · 오버레이 공통): 대기 중이면 도착 2분 전부터(또는 손잡이·알약을 눌러 20초) 'board', 아니면 'wait'(알약). 탑승을 누른 직후 20초는 'undo'. 아니면 'hidden'.
//   앱 시트가 그릴 값: kick(곧 도착 문구) · mode('sub'|'bus') · chip(노선 글) · cbg/cfg(노선 색) · bar(출발 뒤 줄어드는 막대 0~1, 없으면 -1) · x(환승 구간이면 1) · late(출발 3분 뒤)
function rsKick(dt, late, x) {
  if (late) return x ? '환승하셨다면 눌러 주세요' : '타셨다면 눌러 주세요';
  if (dt > 150000) return x ? '환승 예정' : '탑승 예정';
  if (dt > 90000) return '2분 안에 도착';
  if (dt > 45000) return '1분 안에 도착';
  if (dt > -30000) return '곧 도착해요';
  return '도착했어요';
}
function rsRsState(st, r, now) {
  var o = rsRsState0(st, r, now);
  if (st.rsToast && now < st.rsToast.until && o && o.st && o.st !== 'hidden' && o.st !== 'undo') { o.kick = st.rsToast.t; o.late = false; }
  else if (st.rsToast && now >= st.rsToast.until) delete st.rsToast;
  return o;
}
function rsRsState0(st, r, now) {
  var base = { bar: -1, cbg: '', cfg: '#0a84ff', ch: '', um: '', kick: '', mode: '', chip: '', x: 0, late: false };
  var mk = function (stt, k, nm, bt) { var o = {}, q; for (q in base) o[q] = base[q]; o.st = stt; o.k = k; o.nm = nm; o.bt = bt; return o; };
  var nodes = (st.eta && st.eta.nodes) || [];
  var rich = function (o, i, dep, x, late) {
    var n = nodes[i] || {}, line = n.lineName || '', dt = dep - now, cells = (st.ovl && st.ovl.cells) || [], map = (st.ovl && st.ovl.map) || [], j, col = '';
    for (j = 0; j < map.length; j++) if (map[j] === i) { col = (cells[j] && cells[j].dc) || ''; break; }
    o.mode = n.isBus ? 'bus' : 'sub'; o.x = x ? 1 : 0; o.late = !!late;
    o.chip = n.isBus ? (line + (/번$/.test(line) ? '' : '번')) : line;
    if (col) { o.cbg = col; o.cfg = rsContrast(col); }
    var hm = r.arr && r.arr[i] ? r.arr[i] : '';
    o.kick = rsKick(dt, late, x) + (hm ? ' · ' + hm : '');
    if (dt <= 0 && !late) o.bar = Math.max(0, Math.min(1, 1 - (-dt) / RS_SHRINK_MS));
    o.nm = (n.name || '') + (!n.isBus && n.name && !/역$/.test(n.name) ? '역' : '');
    return o;
  };
  if (st.rsUndo && now < st.rsUndo.until) {
    var u0 = st.rsUndo, uw = u0.w, un = (nodes[uw.i] && nodes[uw.i].name) || '';
    var uo = mk('undo', u0.x ? (u0.pend ? '환승 예정으로 기록했어요' : '환승 완료로 기록했어요') : '탑승으로 기록했어요', un, '되돌리기');
    if (nodes[uw.i]) { rich(uo, uw.i, now, !!u0.x, false); uo.k = u0.x ? (u0.pend ? '환승 예정으로 기록했어요' : '환승 완료로 기록했어요') : '탑승으로 기록했어요'; uo.bar = -1; }
    return uo;
  }
  if (st.wait) {
    var w = st.wait, nm = (nodes[w.i] && nodes[w.i].name) || '', hm = r.arr && r.arr[w.i] ? r.arr[w.i] : '';
    var open = now >= w.arrMs - RS_LEAD_MS || (st.rsOpen || 0) > now;
    var wo = mk(open ? 'board' : 'wait', nm + (hm ? ' ' + hm : '') + ' 출발', nm, '탑승');
    if (nodes[w.i]) rich(wo, w.i, w.arrMs, false, now - w.arrMs >= RS_SHRINK_MS);
    return wo;
  }
  if (st.xw) {
    var x = st.xw, dt = x.arrMs - now, late = -dt >= RS_SHRINK_MS, forced = (st.rsOpen || 0) > now, stt;
    if (st.xPend) stt = 'wait';
    else if (forced) { stt = 'board'; x.seen = true; }
    else if (dt > RS_LEAD_MS || late) stt = x.seen ? 'wait' : 'hidden';
    else if (x.shr) stt = 'wait';
    else { stt = 'board'; x.seen = true; }
    if (stt === 'hidden') return { st: 'hidden' };
    var xn = (nodes[x.i] && nodes[x.i].name) || '', xh = r.arr && r.arr[x.i] ? r.arr[x.i] : '';
    var xo = mk(stt, xn + (xh ? ' ' + xh : '') + ' 출발', xn, '환승완료');
    rich(xo, x.i, x.arrMs, true, late);
    return xo;
  }
  return { st: 'hidden' };
}
// 하단 줄: 우선순위 내릴 준비(2) > 추천(1) > 없음, 한 번 보인 줄은 30초 붙잡는다(입력이 흔들려도 깜박이지 않게).
function rsRows(st, r, now, dest, lv, bTg, arrived) {
  var cfg = st.cfg || {}, ad = st.rcAd, dn = dest ? dest.nodeIdx : -1, k = 0, reco = null, getoff = null;
  var rem = (dn >= 0 && r.etaMs && r.etaMs[dn] != null && isFinite(r.etaMs[dn])) ? Math.round((r.etaMs[dn] - now) / 1000) : null;
  if (!arrived && lv === 1 && bTg && bTg.kind === 'dest' && !st.wait) {
    var cf = rsCheerFn(), cheer = '오늘도 수고 많았어요';
    try { if (cf) cheer = cf(now, (st.eta && st.eta.tzOffsetMin) != null ? st.eta.tzOffsetMin : 540, null) || cheer; } catch (e) { }
    var gat = (st.ovlAlert && st.ovlAlert.at) || 0;
    getoff = { on: true, ch: rsChar(gat), a: '내릴 준비를 해주세요', b: rsClampTxt(cheer, 40), end: '앱 종료', at: gat }; k = 2;
  } else if (ad && (cfg.allowed || {}).arrive_reco !== false && st.rcDis !== ad.at && now - ad.at < 25 * 60000 && rem != null && rem <= 7 * 60 && rem > -30 && !st.wait) {
    reco = { on: true, ch: rsChar(ad.at), a: ad.a, b: ad.b, m: ad.m, go: ad.go, ok: '확인', at: ad.at }; k = 1;
  }
  var rh = st.rowHold || (st.rowHold = { k: 0, at: 0, reco: null, getoff: null });
  if (k >= rh.k || now - rh.at >= 30000) {
    if (k > 0) { rh.k = k; rh.at = now; rh.reco = reco; rh.getoff = getoff; } else rh.k = 0;
  } else {
    var dead = (rh.k === 1 && rh.reco && st.rcDis === rh.reco.at) || (st.arrivedAt && now - st.arrivedAt >= 150000);
    if (dead) rh.k = 0; else { reco = rh.reco; getoff = rh.getoff; }
  }
  return { reco: reco || { on: false }, getoff: getoff || { on: false } };
}

// ── 오버레이(앱 경로 화면과 같은 칸 줄) ─────────────────────────────────────────────
// ★ 2026-10-13 (YJ: "카카오 방식 — 앱이 사라져도 네이티브가 안내를 그린다"): 웹이 사라진 동안 네이티브 오버레이가 그릴 값을 엔진이 만든다.
//   state.ovl = { cells:[앱 타임라인 칸(n·t·g·gp·gc·lc·rc·dc·dk + m(이동 중 문구))], map:[칸→노드 번호 또는 -1], theme:{bg,fg,sub} } 는 웹이 맡겨 둔 '그림 틀'(색·이름·노선 라벨)이고,
//   엔진은 시각(t)·현위치 칸(cur)·이동 중(moving)·알약 문구·남은시간 줄·하차 임박 단계(alert)·[안내 종료] 줄(rs)만 채운다. 출력은 OverlayPlugin.update 가 받는 모양 그대로다.
function rsOverlay(st, r, curIdx, curPos, now, dest, destName, moving, done) {
  var ov = st.ovl;
  if (done) return { active: false };
  if (!ov || !ov.cells || !ov.cells.length) return null;
  var map = ov.map || [], cells = [], j, cur = -1, firstNode = -1;
  for (j = 0; j < ov.cells.length; j++) {
    var c = rsClone(ov.cells[j]), ni = map[j] != null ? map[j] : -1;
    if (ni >= 0 && r.arr && r.arr[ni]) c.t = r.arr[ni];
    cells.push(c);
    if (ni >= 0) { if (firstNode < 0) firstNode = j; if (ni <= curIdx) cur = j; }
  }
  if (cur < 0) cur = firstNode >= 0 ? firstNode : 0;
  var nextJ = -1;
  for (j = cur + 1; j < cells.length; j++) if (map[j] != null && map[j] >= 0) { nextJ = j; break; }
  var cn = cells[cur] ? cells[cur].n : '', nn = nextJ >= 0 ? cells[nextJ].n : '';
  var line1 = nn ? cn + ' ▸ ' + nn : '● ' + cn;
  var pill = (moving && nextJ >= 0) ? (cells[nextJ].m || '') : '';
  // 남은시간 줄 — 목적지 도착 시각 기준
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; }, line2 = '';
  var dn = dest ? dest.nodeIdx : -1;
  if (dn >= 0 && r.etaMs && r.etaMs[dn] != null) {
    var mm = Math.max(0, Math.round((r.etaMs[dn] - now) / 60000));
    line2 = '남은시간: ' + p2(Math.floor(mm / 60)) + '시간 ' + p2(mm % 60) + '분' + (r.arr && r.arr[dn] ? ' · ' + r.arr[dn] + '도착' : '');
  }
  // 하차 임박 단계: 환승·목적지 2정거장 전 = 2, 1정거장 전 = 1 (앱 _ovlAlertLevel 과 같은 규칙), 목적지 3정거장 전 = pre
  var lv = 0, pre = 0, tg = (st.cfg && st.cfg.targets) || [], i, bTg = null;
  for (i = 0; i < tg.length; i++) {
    var rem = tg[i].seqPos - curPos;
    if (curPos >= 0 && (rem === 1 || rem === 2)) { if (!lv || rem < lv) { lv = rem; bTg = tg[i]; } }
    if (curPos >= 0 && tg[i].kind === 'dest' && rem === 3) pre = 1;
  }
  // 앱 화면(재개 화면)이 크게 보여 줄 문구 — 문구도 엔진이 정한다
  var banner = '';
  if (bTg && !(dest && curPos >= dest.seqPos)) {
    banner = bTg.kind === 'transfer' ? (lv === 1 ? '다음 정거장 ' + bTg.name + ' — ' + (bTg.nextLine || '다음 노선') + ' 환승 준비' : bTg.name + '에서 ' + (bTg.nextLine || '다음 노선') + ' 환승 · 2정거장 전')
      : (lv === 1 ? '다음 정거장 ' + bTg.name + ' — 내릴 준비하세요' : bTg.name + '까지 2정거장 남았어요');
  } else if (dest && curPos >= dest.seqPos) banner = (destName || dest.name || '목적지') + '에 도착했어요';
  var oa = st.ovlAlert || (st.ovlAlert = { lv: 0, at: 0 });
  if (oa.lv !== lv) { oa.lv = lv; if (lv > 0) oa.at = now; }
  var arrived = !!(dest && curPos >= dest.seqPos);
  var rs = arrived ? { st: 'board', end: true, bt: '안내 종료', k: '목적지에 도착했어요', ch: '도착', nm: destName || '', bar: -1, cbg: '', cfg: '#0a84ff' } : rsRsState(st, r, now);
  var rows = rsRows(st, r, now, dest, lv, bTg, arrived);
  var out = { active: true, line1: line1, pill: pill, track: [], cur: cur, base: ov.base || 0, line2: line2, line3: '', alert: arrived ? 0 : lv, alertAt: oa.at || 0, alertVibe: false, banner: banner, destName: destName || '', pre: !arrived && pre === 1, moving: !!moving, rs: rs, reco: rows.reco, getoff: rows.getoff, cells: cells };
  if (ov.theme) out.theme = ov.theme;
  var sh = rsShare(st, r, cells, map, cur, moving, dest, destName, now);
  if (sh) out.share = sh;
  return out;
}

// 내 위치 공유(예전 웹 _shLoc · _shText): 출발 - 현재 - 도착 (도착예정시간) [남은시간] 글과, 그림용 압축 타임라인 재료. 한국 시각 기준.
//   stations = 칸 중 실제 역·정류장(같은 자리 연속은 한 번만) { n, t }, hit = 지금 위치의 stations 번호, left = 남은 역 수.
function rsShare(st, r, cells, map, cur, moving, dest, destName, now) {
  var stn = [], at = [], j, nm;
  for (j = 0; j < cells.length; j++) {
    nm = cells[j] && cells[j].n ? String(cells[j].n) : '';
    if (!(map[j] != null && map[j] >= 0) || !nm) { at.push(stn.length - 1); continue; }
    if (stn.length && stn[stn.length - 1].n === nm) { at.push(stn.length - 1); continue; }
    stn.push({ n: nm, t: String(cells[j].t || '') });
    at.push(stn.length - 1);
  }
  var dn = dest ? dest.nodeIdx : -1;
  if (!stn.length || dn < 0 || !r.etaMs || r.etaMs[dn] == null || !isFinite(r.etaMs[dn])) return null;
  var hit = Math.max(0, Math.min(stn.length - 1, at[cur] != null ? at[cur] : 0));
  var arrMs = r.etaMs[dn], rem = Math.max(0, Math.round((arrMs - now) / 60000));
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var kst = new Date(arrMs + 9 * 3600000), hm = p2(kst.getUTCHours()) + '시' + p2(kst.getUTCMinutes()) + '분', dur = p2(Math.floor(rem / 60)) + '시' + p2(rem % 60) + '분';
  var nextName = hit < stn.length - 1 ? stn[hit + 1].n : '';
  var mv = !!(moving && nextName);
  var curTxt = mv ? stn[hit].n + '→' + nextName + ' 이동 중' : (st.wait ? stn[hit].n + ' 승차 대기' : stn[hit].n);
  var from = stn[0].n, to = destName || (dest && dest.name) || stn[stn.length - 1].n;
  return { text: from + ' - ' + curTxt + ' - ' + to + ' (도착예정시간: ' + hm + ')\n[남은시간: ' + dur + ']', from: from, cur: curTxt, to: to, arr: hm, rem: dur,
    stations: stn, hit: hit, moving: mv, left: Math.max(0, stn.length - 1 - hit), next: nextName };
}

function rsRecoFn() { return (typeof arrRecoWhen === 'function') ? arrRecoWhen : (function () { try { return require('./arrive-reco').arrRecoWhen; } catch (e) { return null; } })(); }
// 하차 7분 전 추천(맛집·커피·쇼핑 문구)을 지금 보낼 때인가. 판단만 하고 글은 /reco-text 가 만든다. 한 여정에 한 번(st.recoKey), 30분 안에 보냈으면 다시 안 한다(st.recoAt).
//   반환 { fire, key, arrMs, dest, slot, dinner, remMin, loc:{lat,lng}|null } — 앱은 fire 일 때만 /reco-text 에 이 값을 그대로 보낸다.
function rsReco(st, r, dest, destName, now, off) {
  var cfg = st.cfg || {}, fn = rsRecoFn();
  var base = { fire: false, dest: destName || '', alertAt: st.recoAt || 0 };
  if (!fn || !dest || st.wait || off || (cfg.allowed || {}).arrive_reco === false) { base.why = 'off'; return base; }
  var dn = dest.nodeIdx, arrMs = (r.etaMs && dn >= 0) ? r.etaMs[dn] : null;
  if (arrMs == null || !isFinite(arrMs)) { base.why = 'noeta'; return base; }
  var remSec = Math.round((arrMs - now) / 1000);
  var w = fn({ arrMs: arrMs, remSec: remSec, nowMs: now, dest: destName || '', lastKey: st.recoKey || '', lastAt: st.recoAt || 0 });
  base.remSec = remSec; base.slot = w ? w.slot : 'none'; base.dinner = !!(w && w.dinner); base.why = w ? w.why : 'input';
  if (!w || !w.fire) return base;
  st.recoKey = w.key; st.recoAt = now; base.alertAt = now;
  var loc = null, stops = st.stops || [], q;
  for (q = 0; q < stops.length; q++) if (stops[q].i === dn) { loc = { lat: stops[q].lat, lng: stops[q].lng }; break; }
  base.fire = true; base.key = w.key; base.arrMs = arrMs; base.remMin = w.remMin; base.loc = loc;
  return base;
}

function rsDistM(aLat, aLng, bLat, bLng) {
  var R = 6371000, dLat = (bLat - aLat) * Math.PI / 180, dLng = (bLng - aLng) * Math.PI / 180;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
// ★ 2026-10-14 (시뮬: 버스는 GPS 가 10분 넘게 끊겼다 돌아오면 영점이 영영 안 잡혔다): ride-track 영점은 '표시 도착 시각 앞 5분~뒤 7분' 창 안의 GPS 만 본다.
//   시각표 기준이 아닌 여정(버스)에서 GPS 가 오래 끊겨 창이 밀렸다가 돌아오면, 지금 위치가 앞쪽 정류장 근처인데도 창 밖이라 무시됐다.
//   → 신선한 정확한 좌표 두 점(5초 이상 간격)이 모두 앞쪽 정류장 150m 안이고, 마지막 통과 정류장에서 계획 소요의 40% 이상 지났으면 그 정류장 통과로 본다(정류장 건너뛰기 포함).
function rsResync(st, now, notes) {
  var eta = st.eta, tr = st.trail || [], stops = st.stops || [], passes = eta.passes || [], i, k;
  if (eta.timetableFirst || tr.length < 2 || !stops.length) return false;
  var maxIdx = 0, lastPass = null;
  for (i = 0; i < passes.length; i++) if (passes[i].idx > maxIdx) { maxIdx = passes[i].idx; lastPass = passes[i]; }
  if (!lastPass) return false;
  var a = tr[tr.length - 1], b = null;
  if (now - a[0] > 30000 || (a[3] != null && a[3] > 60)) return false;
  for (i = tr.length - 2; i >= 0; i--) { if (a[0] - tr[i][0] >= 5000 && a[0] - tr[i][0] <= 60000 && (tr[i][3] == null || tr[i][3] <= 60)) { b = tr[i]; break; } }
  if (!b) return false;
  var lastStop = null; for (i = 0; i < stops.length; i++) if (stops[i].i === maxIdx) lastStop = stops[i];
  var best = null, bestD = 1e9;
  for (k = 0; k < stops.length; k++) {
    var s = stops[k]; if (s.i <= maxIdx) continue;
    var da = rsDistM(a[1], a[2], s.lat, s.lng), db = rsDistM(b[1], b[2], s.lat, s.lng);
    if (da > 150 || db > 150) continue;
    var gap = lastStop ? (s.arrMs - lastStop.arrMs) : 0;
    if (gap > 0 && lastPass.ms != null && a[0] - lastPass.ms < 0.4 * gap) continue;   // 계획 소요의 40% 도 안 지났으면 건너뛸 수 없다
    if (da < bestD) { bestD = da; best = s; }
  }
  if (!best) return false;
  passes.push({ idx: best.i, ms: a[0], src: 'gps' });
  if (st.notYet) delete st.notYet[best.i];
  notes.push('재동기 ' + best.i + '번(GPS 끊김 뒤 위치로 통과 인정, ' + Math.round(bestD) + 'm)');
  return true;
}

// 다음 호출까지 몇 ms 기다릴지 — 표시 도착 시각(정류장·역) 앞 nearBeforeSec ~ 뒤 nearAfterSec 안이면 짧게(영점이 도착 5초 안에 잡히게), 아니면 기본.
function rsNextMs(st, r, now, O) {
  var stops = st.stops || [], i;
  if (!st.eta || st.eta.boarded === false || st.eta.notDeparted === true) return O.stepMs;
  for (i = 0; i < stops.length; i++) {
    var s = stops[i], am = (r && r.etaMs && r.etaMs[s.i] != null) ? r.etaMs[s.i] : s.arrMs;
    if (am == null || !isFinite(am)) continue;
    var dt = now - am;
    if (dt >= -O.nearBeforeSec * 1000 && dt <= O.nearAfterSec * 1000) return O.nearStepMs;
  }
  return O.stepMs;
}

function rsHav(a, b, c, d) {
  var R = 6371000, p = Math.PI / 180, dLa = (c - a) * p, dLo = (d - b) * p;
  var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a * p) * Math.cos(c * p) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

// 승차 대기: 처음 위치를 받은 틱에 대기를 걸지 정하고(첫 승차역 출발 시각 전이면 대기), 대기 중에는 승차(역 근처 → 빠르게 멀어짐)를 감지한다.
// 대기 중 eta.boarded=false · notDeparted=true 라 ride-eta 가 승차역 이후를 예정 시각 그대로 둔다. 승차가 확정되면 첫 승차역 통과 증거(gps)를 넣고 평소 흐름으로 간다.
function rsWait(st, tr, now, O, notes) {
  var eta = st.eta, stops = st.stops || [], b = null, i;
  for (i = 0; i < stops.length; i++) if (stops[i] && stops[i].pass === false && isFinite(stops[i].lat) && isFinite(stops[i].lng)) { b = stops[i]; break; }
  if (st.waitChk === undefined) {
    if (!tr.length) return;                                   // 위치를 처음 받는 틱까지 미룬다
    st.waitChk = 1;
    if (!st.cfg || st.cfg.waitBoard !== true) return;           // 대기는 시작 엔진(ride-start)이 켠 여정에서만
    var am = (st.etaMs && st.etaMs[b ? b.i : 0] != null) ? st.etaMs[b.i] : (b ? b.arrMs : null);
    if (!b || am == null || !isFinite(am) || now > am + O.waitStartLateSec * 1000 || eta.boarded === false) return;
    st.wait = { i: b.i, lat: b.lat, lng: b.lng, arrMs: am, since: now, seen: false, nearTs: 0 };
    eta.boarded = false; eta.notDeparted = true;
    notes.push('승차 대기 시작(' + b.i + '번 정류장 출발 ' + Math.round((am - now) / 1000) + '초 뒤)');
  }
  var w = st.wait; if (!w) return;
  var k, q, d, last = null;
  for (k = 0; k < tr.length; k++) {
    q = tr[k]; if (q[0] < w.since - 60000) continue;
    if (q[3] != null && q[3] > 150) continue;
    d = rsHav(q[1], q[2], w.lat, w.lng) - (q[3] == null ? 30 : q[3]);
    if (d <= O.waitNearM) { w.seen = true; if (q[0] > w.nearTs) w.nearTs = q[0]; }
    last = q;
  }
  var boarded = false, why = '';
  if (w.seen && last && now - last[0] <= O.waitFreshSec * 1000) {
    var dl = rsHav(last[1], last[2], w.lat, w.lng);
    if (dl >= O.waitAwayM) {
      var win = tr.filter(function (z) { return now - z[0] <= O.waitWinSec * 1000 && (z[3] == null || z[3] <= 150); });
      if (win.length >= 3) {
        var f0 = win[0], f1 = win[win.length - 1], dt = (f1[0] - f0[0]) / 1000;
        if (dt >= O.waitSpanSec) { var sp = rsHav(f0[1], f0[2], f1[1], f1[2]) / dt; if (sp >= O.waitMoveMps) { boarded = true; why = '역에서 ' + Math.round(dl) + 'm · ' + sp.toFixed(1) + 'm/s'; } }
      }
    }
  }
  if (!boarded && now > w.arrMs + O.waitGraceSec * 1000) { boarded = true; why = '출발 시각 ' + Math.round((now - w.arrMs) / 60000) + '분 뒤까지 감지 못 해 시각표대로'; }
  if (!boarded) return;
  var passes = eta.passes = eta.passes || [], ms = w.nearTs > 0 ? w.nearTs : now, hit = -1;
  for (k = 0; k < passes.length; k++) if (passes[k].idx === w.i) { hit = k; break; }
  var np = { idx: w.i, ms: ms, src: 'gps' };
  if (hit >= 0) passes[hit] = np; else passes.push(np);
  eta.boarded = true; eta.notDeparted = false; delete st.wait;
  notes.push('승차 확정(' + why + ')');
}

// ★ 2026-10-21 (s101): 새 위치 판단기 보정(실험, cfg.pfLive) — 위치 판단기(PosFusion, 은닉 마르코프)가 받은 위치들로 '지금 어느 역에 서 있나'를 확률로 낸다.
//   확신이 높고(0.9 이상) 그 역에 서 있거나 막 떠났다고 판단하며(dwell·seg) 아직 통과로 안 적힌 앞쪽 역(최대 3개 앞)이면 통과 증거로 보탠다. GPS 끊김(터널·지하)에서 영점이 놓친 역을 메운다.
//   판단기 상태(st.pf)는 요청에 실려 오가며(역 10개 7KB · 40개 32KB) 엔진은 기억하지 않는다. 꺼져 있으면(기본) 아무것도 하지 않는다.
function rsFuseFn() { return (typeof posFuseRun === 'function') ? posFuseRun : (function () { try { return require('./posfusion').posFuseRun; } catch (e) { return null; } })(); }
function rsFuse(st, fx, now, notes) {
  var stops = st.stops || [], fn = rsFuseFn(), eta = st.eta || {}, passes = eta.passes = eta.passes || [], enodes = eta.nodes || [], q, k;
  if (!fn || stops.length < 2 || st.wait || eta.boarded === false) return false;
  var maxIdx = 0, maxK = 0;
  for (k = 0; k < passes.length; k++) if (passes[k] && passes[k].idx > maxIdx) maxIdx = passes[k].idx;
  for (q = 0; q < stops.length; q++) if (stops[q].i <= maxIdx) maxK = q;
  var stations = stops.map(function (s, j) {
    var prev = j > 0 ? enodes[stops[j - 1].i] : null, cur = enodes[s.i], ms = (st.etaMs && st.etaMs[s.i] != null) ? st.etaMs[s.i] : s.arrMs;
    return { lat: s.lat, lng: s.lng, schedMs: (ms != null && isFinite(ms)) ? ms : null, xferFromPrev: !!(prev && cur && String(prev.lineName || '') !== String(cur.lineName || '')) };
  });
  var ev = [];
  (fx || []).forEach(function (f) { if (f && isFinite(f[0]) && isFinite(f[1]) && isFinite(f[2])) ev.push({ t: 'gps', at: f[0], fix: { lat: f[1], lng: f[2], ts: f[0], acc: f[3] == null ? 30 : f[3] } }); });
  var out;
  try { out = fn({ nowMs: now, stations: stations, state: st.pf || undefined, seed: { idx: maxK, conf: 0.8 }, ev: ev }); } catch (e) { notes.push('위치 판단기 실패: ' + (e && e.message)); return false; }
  if (!out || !out.ok || !out.state) return false;
  st.pf = out.state;
  var b = out.best;
  if (!b || !(b.conf >= 0.9)) return false;                      // dwell = 그 역에 서 있다 · seg = 그 역을 떠나 다음 역으로 가는 중 — 둘 다 그 역은 지났다
  var s = stops[b.idx];
  if (!s || s.i <= maxIdx || b.idx > maxK + 3) return false;
  var hit = -1; for (k = 0; k < passes.length; k++) if (passes[k].idx === s.i) { hit = k; break; }
  if (hit >= 0) return false;
  passes.push({ idx: s.i, ms: now, src: 'gps' });
  if (st.notYet) delete st.notYet[s.i];
  notes.push('위치 판단기 ' + s.i + '번 역 도착 반영(확신 ' + Math.round(b.conf * 100) + '%)');
  return true;
}

function rideStandby(req) {
  req = req || {};
  var O = RIDE_STANDBY_DEFAULTS, st = req.state, now = +req.nowMs, notes = [], i;
  if (!st || !st.eta || !isFinite(now)) return { v: 1, error: 'state/nowMs 가 없다', done: true };
  st = rsClone(st);
  st.steps = (st.steps | 0) + 1;
  // 1) 궤적 갱신
  var tr = st.trail = st.trail || [], fx = req.fixes || [];
  for (i = 0; i < fx.length; i++) { var f = fx[i]; if (f && isFinite(f[0]) && isFinite(f[1]) && isFinite(f[2]) && (!tr.length || f[0] > tr[tr.length - 1][0])) tr.push([f[0], f[1], f[2], f[3] == null ? null : f[3]]); }
  for (i = 0; i < fx.length; i++) { if (fx[i] && isFinite(fx[i][0]) && (!st.lastFixMs || fx[i][0] > st.lastFixMs)) st.lastFixMs = fx[i][0]; }
  if (!st.firstAt) st.firstAt = now;
  while (tr.length && now - tr[0][0] > O.trailMaxAgeSec * 1000) tr.shift();
  if (tr.length > O.trailMax) tr.splice(0, tr.length - O.trailMax);
  rsWait(st, tr, now, O, notes);                  // 1.5) 승차 대기 · 승차 감지
  rsXwait(st, tr, now, notes);                    // 1.55) 환승 구간 승차 대기
  rsActs(st, req, now, notes);                    // 1.6) 앱이 알려 준 추천 줄 · 닫기 · 오버레이 탑승 손짓
  // 2) 영점: 정류장 도착 시각을 최신 etaMs 로 맞춰 ride-track 에 묻는다 → 통과 시각(passMs)은 gps 증거로, 아직 안 닿음은 notYet 으로
  var eta = st.eta, passes = (eta.passes = eta.passes || []), notYet = (st.notYet = st.notYet || {});
  var zero = null, newPass = false, tk = null;
  // ★ 2026-10-19: 지금 진행 노드(가장 뒤 통과)가 버스 정류장이면 엔진이 버스 위치(busPos)·움직임(motion)까지 본다 — 앱이 가려져도 웹과 같은 판정.
  var enodes = eta.nodes || [], progMax = -1, progBus = false;
  for (i = 0; i < passes.length; i++) if (passes[i] && passes[i].idx > progMax) progMax = passes[i].idx;
  if (progMax >= 0 && enodes[progMax] && enodes[progMax].isBus && !enodes[progMax].isWalk) progBus = true;
  if (st.stops && st.stops.length && tr.length) {
    var stops = st.stops.map(function (s) { var o = rsClone(s); if (st.etaMs && st.etaMs[s.i] != null) o.arrMs = st.etaMs[s.i]; return o; });
    tk = rsTrackFn()({ nowMs: now, trail: tr, plan: { pts: [], boarded: eta.boarded !== false && eta.notDeparted !== true, notDeparted: false, stops: stops, subConfirmed: !progBus, progIsBus: progBus, suppress: ['standby'] }, want: { zero: true, bus: progBus } });
    zero = tk && tk.zero ? tk.zero : null;
    if (zero && zero.stops) {
      zero.stops.forEach(function (z) {
        if (z.passMs != null && isFinite(z.passMs) && z.apply) {
          var hit = -1; for (var k = 0; k < passes.length; k++) if (passes[k].idx === z.i) { hit = k; break; }
          var np = { idx: z.i, ms: z.passMs, src: 'gps' };
          if (hit >= 0) passes[hit] = np; else passes.push(np);
          newPass = true;
          delete notYet[z.i];
          notes.push('영점 ' + z.i + '번 통과 반영');
        } else if (z.notYet) { notYet[z.i] = now; }
      });
    }
  }
  // ★ 2026-10-19: 버스 위치 — 정류장을 이은 선 위에서 이미 지난 정류장(시각을 알면 통과 시각)을 통과 증거로 적는다. 이미 GPS 로 확인한 통과는 건드리지 않는다.
  if (tk && tk.busPos && tk.busPos.passed) {
    tk.busPos.passed.forEach(function (p) {
      if (!p || p.i == null || !isFinite(p.ms)) return;
      var nd0 = enodes[p.i]; if (!nd0 || !nd0.isBus) return;
      var hit = -1; for (var k = 0; k < passes.length; k++) if (passes[k].idx === p.i) { hit = k; break; }
      if (hit >= 0 && (passes[hit].src === 'gps' || passes[hit].src === 'move')) return;
      var np = { idx: p.i, ms: p.ms, src: 'gps' };
      if (hit >= 0) passes[hit] = np; else passes.push(np);
      newPass = true; delete notYet[p.i];
      notes.push('버스위치 ' + p.i + '번 통과 반영');
    });
  }
  if (rsResync(st, now, notes)) newPass = true;
  if (st.cfg && st.cfg.pfLive === true && rsFuse(st, fx, now, notes)) newPass = true;   // 2.6) 새 위치 판단기 보정(실험 · 설정에서 켠 때만)   // 2.5) 버스: 오래 끊겼던 GPS 가 돌아오면 앞쪽 정류장 통과로 다시 맞춘다(시각표 기준 여정은 시각표가 이어가므로 해당 없음)
  // 3) 도착 시각 계산
  var nyList = [], nk;
  for (nk in notYet) { if (now - notYet[nk] <= O.notYetKeepSec * 1000) nyList.push(+nk); else delete notYet[nk]; }
  // ★ 2026-10-14 (시뮬: 시각표가 없는 버스가 GPS 를 못 받으면 마커가 멈추고 하차 알림이 영영 안 울렸다): GPS 가 gpsGapDeadReckonSec 넘게 끊기면 계획 시각표대로 이어간다.
  //   GPS 로 통과 증거(영점·재동기)가 다시 잡힐 때까지 이어간다(증거 없음을 연착으로 밀어 마커가 도로 뒤로 가는 것을 막는다). 시각표 기준 여정(지하철)은 원래 이렇게 돈다.
  if (!eta.timetableFirst && eta.boarded !== false) {
    var gapMs = now - (st.lastFixMs || st.firstAt || now);
    if (gapMs >= O.gpsGapDeadReckonSec * 1000 && !st.dr) { st.dr = true; notes.push('GPS 끊김 ' + Math.round(gapMs / 1000) + '초 — 계획 시각표대로 이어감'); }
    else if (st.dr && newPass) { st.dr = false; notes.push('GPS 통과 증거 복귀 — 시각표 이어가기 해제'); }
  } else st.dr = false;
  var ein = rsClone(eta); ein.nowMs = now; if (st.dr) ein.timetableFirst = true; ein.passes = passes; if (nyList.length && eta.timetableFirst) ein.notYet = nyList; else delete ein.notYet;
  var fired = (st.fired = st.fired || {});
  var r = rsEtaFn()(ein);
  if (!r || !r.etaMs) return { v: 1, state: st, ongoing: { title: O.ongoingTitle, text: '' }, alert: null, done: false, nextMs: O.stepMs, notes: ['도착 시각 계산 실패'] };
  st.etaMs = r.etaMs;
  if (r.delayMin != null) { eta.prevLevelMin = r.delayMin; eta.prevAnchorIdx = r.anchorIdx; }
  // 4) 지금 어느 역까지 왔나 → 알림 판정 · 상주 알림 문구
  var nodes = eta.nodes || [], cfg = st.cfg || {}, curIdx = -1;
  if (r.pos && r.pos.from != null) curIdx = r.pos.from;
  else { for (i = 0; i < nodes.length; i++) if (r.etaMs[i] != null && r.etaMs[i] <= now) curIdx = i; }
  var al = rsAlerts(cfg, fired, curIdx, r.etaMs, now);
  // ★ 2026-10-14 (YJ: "고치지 못한 것 전부 진행 — 카카오지하철처럼 네이티브 활용"): 앱을 닫은 뒤에도 경로를 벗어나면(중간에 내려 걷거나 택시) 알림으로 알린다.
  //   판정은 ride-track rtOff(지하철 탑승 확정 중에는 '신선하고 정확한 좌표가 2분 가까이 전부 경로선 600m 밖'일 때만). 벗어난 동안에는 하차 알림을 울리지 않는다(내린 사람에게 '곧 하차'는 거짓).
  var offRes = null, offActive = false;
  try {
    var ptsO = (st.stops || []).filter(function (q) { return q && isFinite(q.lat) && isFinite(q.lng); }).map(function (q) { return { lat: q.lat, lng: q.lng }; });
    if (tr.length && ptsO.length >= 2 && !(st.arrivedAt)) {
      var tfO = eta.timetableFirst === true;
      var ot = rsTrackFn()({ nowMs: now, trail: tr, plan: { pts: ptsO, progIsSub: tfO, subConfirmed: tfO, boarded: true, notDeparted: false, suppress: [] }, want: { off: true, ridden: false, miss: false, bus: false, board: false } });
      offRes = ot && ot.off ? ot.off : null;
    }
  } catch (eOff) { notes.push('이탈 판정 실패: ' + (eOff && eOff.message)); }
  if (offRes && offRes.confirmed) { if (!st.offOn) { st.offOn = now; } offActive = true; }
  else if (offRes && offRes.why === 'on_path') { st.offOn = 0; st.offAlertAt = 0; }   // 경로선으로 돌아오면 이탈이 끝난 것 — 다음에 벗어나면 다시 알린다
  else if (st.offOn) offActive = true;   // 판단 근거가 부족한 틱(GPS 끊김 등)은 직전 상태를 유지한다
  if (offActive) {
    if (al.alert) { al.alert = null; al.extra = []; }   // 벗어난 동안 하차·환승 알림은 보류(보낸 것으로 처리하지 않는다)
    var offCfg = (cfg.allowed || {}).offroute;
    if (offCfg !== false && !st.offAlertAt) {
      st.offAlertAt = now;
      al.alert = { key: 'offroute_' + now, type: 'offroute', title: '경로를 벗어났어요', body: '앱을 열면 지금 위치에서 다시 찾아 드려요', vib: [0, 300, 150, 300] };
      notes.push('이탈 알림(' + (offRes ? offRes.why + ' ' + offRes.distM + 'm' : '유지') + ')');
    }
  }
  if (st.wait) { al.alert = null; al.extra = []; }     // 아직 안 탔으면 하차·환승 알림을 울리지 않는다(보낸 것으로도 처리하지 않는다)
  if (al.alert && al.alert.type !== 'offroute') {
    fired[al.alert.key] = 1; al.extra.forEach(function (k) { fired[k] = 1; });
    if (/_0$/.test(al.alert.key) && !st.arrivedAt) st.arrivedAt = now;
  }
  var seq = cfg.seq || [], dest = null, nextIdx = -1;
  (cfg.targets || []).forEach(function (t) { if (t.kind === 'dest') dest = t; });
  for (i = 0; i < seq.length; i++) if (seq[i] > curIdx) { nextIdx = seq[i]; break; }
  var text;
  if (dest && al.curPos >= dest.seqPos) text = (cfg.destName || dest.name || '목적지') + ' 도착';
  else if (nextIdx >= 0) {
    var nm = (nodes[nextIdx] && nodes[nextIdx].name) || '', ar = r.arr && r.arr[nextIdx] ? r.arr[nextIdx] : '';
    text = '다음 ' + nm + (ar ? ' ' + ar : '') + (dest && al.curPos >= 0 ? ' · ' + (cfg.destName || dest.name || '목적지') + '까지 ' + Math.max(0, dest.seqPos - al.curPos) + '정거장' : '');
  } else text = '';
  if (st.wait) text = '승차 대기 · ' + ((nodes[st.wait.i] && nodes[st.wait.i].name) || '') + (r.arr && r.arr[st.wait.i] ? ' ' + r.arr[st.wait.i] : '') + ' · ' + (cfg.destName || (dest && dest.name) || '목적지') + '까지';
  if (offActive) text = '경로를 벗어났어요 · 앱을 열면 다시 찾아 드려요';
  var done = false, quit = false;
  if (st.arrivedAt && now - st.arrivedAt >= O.doneAfterSec * 1000) { done = true; quit = true; notes.push('목적지 도착 ' + O.doneAfterSec + '초 뒤 종료'); }
  if (offActive && st.offOn && now - st.offOn >= O.offGiveUpSec * 1000) { done = true; notes.push('경로를 벗어난 채 ' + O.offGiveUpSec + '초 — 안내 종료'); }
  var lastAt = st.lastAt || now; if (now - lastAt > O.maxStaleSec * 1000) done = true;
  st.lastAt = now;
  var moving = !!(r.pos && r.pos.moving), overlay = null;
  // 버스는 네비게이션식 — 엔진이 본 '지금 달리는 중인가'(motion)를 따른다(null 이면 모른다 → 계산 값 유지)
  if (progBus && tk && tk.motion && tk.motion.moving != null) moving = tk.motion.moving === true;
  var nextMs = rsNextMs(st, r, now, O);
  try { overlay = rsOverlay(st, r, curIdx, al.curPos, now, dest, cfg.destName || (dest && dest.name) || '', moving, done); } catch (eOv) { notes.push('오버레이 계산 실패: ' + (eOv && eOv.message)); }
  if (offActive && overlay && overlay.active) { overlay.alert = 0; overlay.pre = false; overlay.banner = '경로를 벗어났어요 — 앱을 열면 다시 찾아 드려요'; }
  var reco = { fire: false };
  try { if (!done) reco = rsReco(st, r, dest, cfg.destName || (dest && dest.name) || '', now, offActive); } catch (eRc) { notes.push('추천 판단 실패: ' + (eRc && eRc.message)); }
  var view = { text: text, line1: overlay && overlay.line1 || '', line2: overlay && overlay.line2 || '', curIdx: curIdx, at: now };
  var row = done ? null : rsRowOut(st, now);
  return { v: 1, state: st, ongoing: { title: O.ongoingTitle, text: text }, row: row, alert: al.alert, done: done, quit: quit, curIdx: curIdx, overlay: overlay, reco: reco, view: view, pos: r.pos ? { from: r.pos.from, to: r.pos.to, ratio: r.pos.ratio, moving: !!r.pos.moving } : null, arr: r.arr || null, zero: zero, nextMs: done ? O.stepMs : nextMs, motion: tk && tk.motion ? tk.motion : null, notes: notes };
}

function handleRideStandby(request, env) {
  var H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
  if (request.method === 'OPTIONS') return Promise.resolve(new Response(null, { status: 204, headers: H }));
  if (request.method !== 'POST') return Promise.resolve(new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: H }));
  // ★ 2026-10-13: 네이티브는 5초마다 상태(그림 틀 포함)를 보낸다 — 데이터를 아끼려고 gzip 으로 눌러 보낼 수 있다(앞 두 바이트 1f 8b 로 알아본다. 엣지가 이미 풀어 줬어도 그대로 읽는다).
  return request.arrayBuffer().then(function (buf) {
    var u8 = new Uint8Array(buf);
    if (u8.length > 2 && u8[0] === 0x1f && u8[1] === 0x8b && typeof DecompressionStream === 'function') return new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
    return new TextDecoder().decode(u8);
  }).then(function (txt) {
    var body, out;
    try { body = JSON.parse(txt); } catch (e0) { return new Response(JSON.stringify({ error: 'JSON 아님' }), { status: 400, headers: H }); }
    var run = function () {
      try { out = rideStandby(body); } catch (e) { return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500, headers: H }); }
      return new Response(JSON.stringify(out), { headers: H });
    };
    // 탑승 버튼을 눌렀고 지하철 구간이면 시각표(방금 떠난 차 · 다음 차)를 읽어 붙인다 — 시각표를 못 불러와도 그냥 누른 시각으로 확정한다
    if (typeof ntEnsure === 'function' && rsPressQuery(body)) {
      return Promise.resolve().then(function () { return ntEnsure(env); }).then(function (nt) { rsAttachPressTT(body, nt); return run(); }, function () { return run(); });
    }
    return run();
  }, function () { return new Response(JSON.stringify({ error: '요청을 읽지 못함' }), { status: 400, headers: H }); });
}

if (typeof module !== 'undefined') module.exports = { rideStandby: rideStandby, rsPressQuery: rsPressQuery, rsAttachPressTT: rsAttachPressTT, rsPickMs: rsPickMs, rsLegsOf: rsLegsOf, rsXwait: rsXwait, rsWait: rsWait, rsNextMs: rsNextMs, rsResync: rsResync, rsFuse: rsFuse, handleRideStandby: handleRideStandby, rsAlerts: rsAlerts, RIDE_STANDBY_DEFAULTS: RIDE_STANDBY_DEFAULTS };
