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
  // (offGiveUpSec 는 없앴다 — 2026-10-26 YJ: "경로는 확정되면 사용자가 강제로 취소하거나 도착할 때까지 풀리면 안 된다". 경로를 벗어나도 알림만 하고 안내는 끝내지 않는다.)
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
    req.pressTT = { i: q.i, nowM: q.atMin, depMin: dep != null && isFinite(dep) ? dep : null, late: ok ? dep : null, dk: bl && bl.dk ? bl.dk : null };
    return true;
  } catch (e) { return false; }
}
// ── 서울 지하철 실시간 도착정보로 '타는 열차' 가리기 — 웹 fetchRealtimeArrival · _filterByDirection · resolveRealtimeDepartMs 와 같은 규칙 + 웹의 약점 보완 ─────────
//   ★ 2026-10-25 s192~s194 (YJ: "서울지하철은 실시간 위치를 어떻게든 받아야 해 · 최대 3초" · "앱이라 다 똑같이 하고 약점은 개선해 · 100% 네이티브화, 웹은 데이터용"):
//   웹은 [탑승] 영점을 시각표가 아니라 서울시 realtimeStationArrival 로 잡는다(못 받을 때만 시각표). 규칙은 웹 그대로이고, 웹의 약점 넷만 고쳤다.
//   · 요청: /seoul?path=realtimeStationArrival/1/20/역명(끝의 '역' 뗀 것). 웹은 1/5 — 환승역에서 다른 호선 열차 5대가 답을 채워 우리 호선이 빠지던 것을 줄이려 20으로. 기다리는 시간은 웹 5초 → 2.8초(YJ 3초 한도)
//   · 방향(웹 그대로): 시각표가 정한 방향(boardTable 의 dk '상'/'하' → 상행/하행, 모르면 하행)과 updnLine 이 같거나 포함하는 열차, 하나도 없으면 전부
//   · 고르기(웹 그대로): barvlDt(도착까지 남은 초)가 가장 작은 열차 · arvlCd 0(진입)·1(도착)이면 지금, 아니면 barvlDt 초 뒤(음수는 0)
//   · 약점 보완 ① 호선(subwayId)이 다른 열차는 거른다(웹은 환승역에서 다른 호선 열차를 집었다). 우리 호선 열차가 하나도 없으면 시각표로
//     ② 방향이 안 걸러질 때(2호선 내선·외선 등 updnLine 이 상행/하행이 아닌 때)는 도착정보의 '△△방면'(= 우리 경로의 다음 역)으로 가린다
//     ③ 이미 출발(arvlCd 2)한 열차는 쓰지 않는다(웹은 '지금'으로 잡았다 — 놓친 열차다). 남는 열차가 없으면 시각표(방금 떠난 차 인정 규칙이 있다)
//   못 받으면(null) 시각표 그대로 — 웹과 같다.
// ★ 호선 → 서울 도착정보 subwayId: 웹의 _RT_LINE2ID + _RT_ARR_LINE2ID(실기기 진단으로 확인한 값). 웹에는 getSubwayIdByLine 이라는 다른 표도 있는데 경의중앙·경춘·경강·신림 값이 달라 쓰지 않았다(s195 정정).
var RS_SUBWAY_ID = { '1호선': '1001', '2호선': '1002', '3호선': '1003', '4호선': '1004', '5호선': '1005', '6호선': '1006', '7호선': '1007', '8호선': '1008', '9호선': '1009', '경의중앙선': '1063', '수인분당선': '1075', '공항철도': '1065', '경춘선': '1067', '신분당선': '1077', '서해선': '1093', '경강선': '1081', '신림선': '1094', '우이신설선': '1092' };
function rsSubwayId(lineName) { return RS_SUBWAY_ID[lineName] || RS_SUBWAY_ID[String(lineName || '').replace(/호선$/, '') + '호선'] || ''; }
function rsStnKey(n) { return String(n || '').replace(/\(.*?\)/g, '').replace(/\s+/g, '').replace(/역$/, ''); }
// 서울 역 도착정보 목록 → 타는 열차의 도착 시각(ms) 또는 null. list = realtimeArrivalList, dk = 시각표가 정한 방향('상'/'하')
function rsPickLive(list, q, nowMs, dk) {
  try {
    if (!list || !list.length || !isFinite(nowMs)) return null;
    var sid = q ? rsSubwayId(q.line) : '', k, it, same = [];
    if (!sid) return null;
    for (k = 0; k < list.length; k++) { it = list[k]; if (it && String(it.subwayId) === sid && parseInt(it.arvlCd, 10) !== 2) same.push(it); }      // 약점 ① ③
    if (!same.length) return null;
    var dir = dk === '상' ? '상행' : '하행', byDir = [];
    for (k = 0; k < same.length; k++) { var ud = String(same[k].updnLine || ''); if (ud === dir || ud.indexOf(dir) >= 0) byDir.push(same[k]); }
    var c = byDir;
    if (!c.length) {                                             // 웹은 여기서 전부를 쓴다 — 약점 ②: 다음 역 방면이 맞는 열차가 있으면 그것만
      var to = rsStnKey(q.to), byTo = [];
      if (to) for (k = 0; k < same.length; k++) { var m = /[-–—]\s*([^\s]+?)\s*방면/.exec(String(same[k].trainLineNm || '')); if (m && rsStnKey(m[1]) === to) byTo.push(same[k]); }
      c = byTo.length ? byTo : same;
    }
    c = c.slice().sort(function (a, b) { return parseInt(a.barvlDt || 9999, 10) - parseInt(b.barvlDt || 9999, 10); });
    var t = c[0], cd = parseInt(t.arvlCd || '99', 10), bv = parseInt(t.barvlDt || '0', 10);
    return (cd === 0 || cd === 1) ? nowMs : nowMs + Math.max(0, (isFinite(bv) ? bv : 0) * 1000);
  } catch (e) { return null; }
}
// 위 결과를 req.pressTT.liveMs 로 붙인다(시각표가 없어도 만든다). 붙였으면 true
function rsAttachPressLive(req, list) {
  try {
    var q = rsPressQuery(req); if (!q) return false;
    var ms = rsPickLive(list, q, +req.nowMs, req.pressTT && req.pressTT.dk); if (ms == null) return false;
    if (!req.pressTT || req.pressTT.i !== q.i) req.pressTT = { i: q.i, nowM: q.atMin, depMin: null, late: null };
    req.pressTT.liveMs = ms;
    return true;
  } catch (e) { return false; }
}
// 서울 중계(/seoul)에서 이 역의 도착정보를 받는다 — 시간 한도 안에 못 받으면 null(시각표로). 서비스 바인딩 BUSAPI 로 부른다.
var RS_LIVE_MS = 2800;
// 서울 중계(/seoul)에서 path 를 받는다 — ms 안에 못 받으면 null. 서비스 바인딩 BUSAPI 로 부른다(키는 중계가 넣는다).
function rsFetchSeoulPath(env, path, ms) {
  if (!env || !env.BUSAPI || typeof env.BUSAPI.fetch !== 'function') return Promise.resolve(null);
  var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  var timer = null;
  var cut = new Promise(function (res) { timer = setTimeout(function () { try { if (ctl) ctl.abort(); } catch (e) { } res(null); }, ms); });
  var go = Promise.resolve().then(function () { return env.BUSAPI.fetch(new Request('https://busapi.internal/seoul?path=' + encodeURIComponent(path), ctl ? { signal: ctl.signal } : void 0)); })
    .then(function (r) { return r && r.status === 200 ? r.json() : null; })
    .then(function (j) { return j && j.realtimeArrivalList && j.realtimeArrivalList.length ? j.realtimeArrivalList : null; })
    .catch(function () { return null; });
  return Promise.race([go, cut]).then(function (v) { if (timer) clearTimeout(timer); return v; });
}
function rsFetchSeoulArrivals(env, q) {
  if (!q || !rsSubwayId(q.line)) return Promise.resolve(null);
  return rsFetchSeoulPath(env, 'realtimeStationArrival/1/20/' + encodeURIComponent(String(q.from).replace(/역$/, '').trim()), RS_LIVE_MS);
}
// 승차 통과 시각(ms): 방금 떠난 차(late) → 그 출발 시각 · 없으면 다음 차(depMin, 12분 안) → 그 시각 · 아니면 누른 시각
function rsPickMs(tt, i, now) {
  if (!tt || tt.i !== i) return now;
  if (tt.liveMs != null && isFinite(tt.liveMs)) return +tt.liveMs;      // ★ s192: 서울 실시간 도착정보로 가린 열차가 있으면 시각표보다 먼저(웹 resolveRealtimeDepartMs 와 같은 규칙)
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
  st.xw = { i: L.bi, k: L.k, mode: L.mode, line: L.line, name: L.name, arrMs: dep, seen: keep ? !!keep.seen : (st.xSeen === L.bi), shr: keep ? !!keep.shr : false };
  if (st.xPend && st.xPend.i === L.bi && dep - now <= RS_EARLY_MS) { var pv = rsXCommit(st, L.bi, now, st.xPend.lv != null && isFinite(st.xPend.lv) ? +st.xPend.lv : null); notes.push('환승 예약 확정(' + L.bi + '번)'); if (st.rsUndo && st.rsUndo.x) st.rsUndo.prev = pv; }
}
function rsContrast(hex) {
  var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return '#ffffff';
  var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? '#121214' : '#ffffff';
}

// ── s229 역까지 이동 (YJ: 자차로 이탈했을 때 '역까지 이동'을 누르면 경로의 첫 역까지 GPS 로 안내하고, 역에 닿으면 그 시각 가장 빠른 지하철로 경로를 조용히 바꾸고 환승 버튼을 띄운다) ──────────
//   st.dt = { i(첫 지하철 승차 노드), name, at, arr?(역에 닿은 시각) } — 사용자가 [역까지 이동] 을 누른 동안만 있다. 그동안은 영점·재동기·이탈 판정·하차 알림을 쉰다(차로 달리는 중이라 버스 정류장을 지나도 통과가 아니다).
//   역에 닿으면(arr) 승차 시각표를 한 번 읽어(워커 dtTT · 폰은 needsTable) 가장 빠른 열차로 이어 붙인다 — 읽지 못하면 계획 시각표(없으면 5분 뒤)로.
var RS_DT_ARRIVE_M = 150;       // 역(승차 지점)에서 이 거리 안(정확도 뺀 값)이면 닿았다
var RS_DT_PLATFORM_SEC = 120;   // 역에 닿아 승강장까지 가는 시간 — 이 뒤에 출발하는 열차부터
var RS_DT_TT_WAIT_MS = 10000;   // 닿은 뒤 시각표 답이 이만큼 안 오면 계획 시각표로 이어 붙인다
var RS_DT_FALLBACK_MS = 300000; // 시각표도 계획도 못 쓰면 승강장 도착 뒤 이만큼 기다린다고 본다
// 경로의 첫 지하철 구간 승차 노드(앞에 버스 구간이 있을 때만) — 위치(승차 지점 좌표)까지 알면 { i, k, name, line, lat, lng }, 아니면 null
function rsHas(x) { return x != null && isFinite(x); }
function rsDtTarget(st) {
  var eta = st && st.eta; if (!eta) return null;
  var legs = rsLegsOf(eta), k, nodes = eta.nodes || [], pm = rsMaxPass(eta);
  for (k = 0; k < legs.length; k++) {
    if (legs[k].mode !== 'sub') continue;
    if (k === 0) return null;
    var bi = legs[k].bi, s = rsStopOf(st, bi), q0;
    for (q0 = bi - 1; !s && q0 >= bi - 3 && q0 >= 1; q0--) s = rsStopOf(st, q0);      // 승차 노드에 좌표가 없으면 바로 앞(환승 걷기 앞 하차 정류장)
    if (!s || !rsHas(s.lat) || !rsHas(s.lng)) return null;
    if (pm >= bi - 1 || (st.rsDone || {})[bi]) return null;
    var nm = (nodes[bi] && nodes[bi].name) || '';
    return { i: bi, k: legs[k].k, name: nm + (nm && !/역$/.test(nm) ? '역' : ''), line: legs[k].line, lat: s.lat, lng: s.lng };
  }
  return null;
}
// 시각표 질문: 역에 닿았고 아직 이어 붙이기 전이면 { i, line, from, to, atMin, baseMs } — atMin 은 승강장까지 가는 시간을 더한 분
function rsDetourQuery(req) {
  if (!req || !req.state || !req.state.eta || !req.state.dt || !req.state.dt.arr || !isFinite(+req.nowMs)) return null;
  var st = req.state, i = st.dt.i, nodes = st.eta.nodes || [], n = nodes[i], nx = nodes[i + 1];
  if (!n || !n.isSub || n.isBus || !n.lineName || !n.name) return null;
  var tz = st.eta.tzOffsetMin != null && isFinite(+st.eta.tzOffsetMin) ? +st.eta.tzOffsetMin : 540, at = +req.nowMs + RS_DT_PLATFORM_SEC * 1000;
  return { i: i, line: n.lineName, from: n.name, to: (nx && nx.name) || '', atMin: Math.floor((((at / 60000 + tz) % 1440) + 1440) % 1440), baseMs: at };
}
function rsAttachDetourTT(req, nt) {
  try {
    var q = rsDetourQuery(req); if (!q || !nt || typeof nt.boardTable !== 'function') return false;
    var bl = nt.boardTable({ line: q.line, from: q.from, to: q.to, atMin: q.atMin, baseMs: q.baseMs });
    req.dtTT = { i: q.i, nowM: q.atMin, depMin: bl && bl.depMin != null && isFinite(bl.depMin) ? bl.depMin : null };
    return true;
  } catch (e) { return false; }
}
function rsDtActStart(st, now, notes) {
  if (st.dt || st.wait) return;
  var tg = rsDtTarget(st); if (!tg) return;
  st.dt = { i: tg.i, name: tg.name, at: now }; st.offOn = 0; st.offAlertAt = 0; st.rsOpen = 0;
  notes.push('역까지 이동 시작(' + tg.name + ')');
}
// 계획 시각(하루 안의 분, 자정 넘으면 1440 이상) 눈금에 맞춘 ms 의 분
function rsDtPlanMin(ms, tz, ref) {
  var m = Math.floor(rsMinOfDay(ms, tz)), best = m, k, c;
  for (k = -1; k <= 1; k++) { c = m + 1440 * k; if (Math.abs(c - ref) < Math.abs(best - ref)) best = c; }
  return Math.round(best);
}
// 역에 닿았다: 첫 지하철 구간을 가장 빠른 열차에 맞춰 조용히 바꾼다(앞 버스 구간은 지난 것으로, 뒤 노드 계획 시각은 열차 시각만큼 밀거나 당긴다)
function rsDtRebase(st, tg, now, tt, notes) {
  var k, eta = st.eta, nodes = eta.nodes || [], bi = tg.i, tz = eta.tzOffsetMin != null && isFinite(+eta.tzOffsetMin) ? +eta.tzOffsetMin : 540, j, passes = (eta.passes = eta.passes || []);
  var plat = now + RS_DT_PLATFORM_SEC * 1000, planDep = (st.etaMs && rsHas(st.etaMs[bi])) ? st.etaMs[bi] : null, dep = null, src = '';
  if (tt && tt.i === bi && rsHas(tt.depMin) && tt.nowM != null) {
    var d = tt.depMin - tt.nowM; if (d < -720) d += 1440; if (d > 720) d -= 1440;
    if (d >= 0 && d <= 45) { dep = (plat - (plat % 60000)) + d * 60000 + 30000; if (dep < plat) dep = plat; src = 'tt'; }
  }
  if (dep == null) { if (planDep != null && planDep >= plat) { dep = planDep; src = 'plan'; } else { dep = plat + RS_DT_FALLBACK_MS; src = 'wait'; } }
  var ref = nodes[bi] && rsHas(nodes[bi].planMin) ? +nodes[bi].planMin : null;
  if (ref == null) { for (j = bi; j < nodes.length; j++) if (nodes[j] && rsHas(nodes[j].planMin)) { ref = +nodes[j].planMin; break; } }
  // 지금까지 통과한 마지막 노드(m)와 지금(역 도착) 사이 노드는 시각을 고르게 나눠 '지난 것'으로 적는다(안 적으면 ride-eta 가 못 지난 정류장으로 보고 뒤 시각을 밀어 버린다)
  var m = 0, lastMs = now, mk;
  for (k = 0; k < passes.length; k++) if (passes[k] && passes[k].idx < bi && passes[k].idx > m) { m = passes[k].idx; lastMs = rsHas(passes[k].ms) ? Math.min(+passes[k].ms, now) : now; }
  var cnt = bi - 1 - m, ms2 = {};
  for (j = m + 1; j <= bi - 1; j++) ms2[j] = cnt > 0 ? Math.round(lastMs + (now - lastMs) * (j - m) / cnt) : now;
  if (ref != null) {
    var depPm = rsDtPlanMin(dep, tz, ref), delta = depPm - (nodes[bi] && rsHas(nodes[bi].planMin) ? +nodes[bi].planMin : ref);
    for (j = 0; j < nodes.length; j++) {
      var nd = nodes[j]; if (!nd || !rsHas(nd.planMin)) continue;
      if (j >= bi) nd.planMin = +nd.planMin + delta;
      else if (ms2[j] != null) nd.planMin = rsDtPlanMin(ms2[j], tz, ref);
    }
  }
  for (j = m + 1; j <= bi - 1; j++) {
    if (j !== bi - 1 && nodes[j] && nodes[j].isWalk) continue;
    var h2 = -1; for (k = 0; k < passes.length; k++) if (passes[k].idx === j) { h2 = k; break; }
    var np2 = { idx: j, ms: ms2[j], src: 'gps' };
    if (h2 >= 0) passes[h2] = np2; else passes.push(np2);
  }
  eta.boarded = true; eta.notDeparted = false; delete st.wait; st.dr = false;
  if (st.notYet) { for (j = 1; j < bi; j++) delete st.notYet[j]; }
  var fd = (st.fired = st.fired || {}), tgs = (st.cfg && st.cfg.targets) || [], r2;
  for (k = 0; k < tgs.length; k++) if (tgs[k] && tgs[k].nodeIdx < bi) for (r2 = 0; r2 <= 2; r2++) fd[tgs[k].nodeIdx + '_' + r2] = 1;      // 조용히: 이 역 앞의 하차·환승 알림은 보낸 것으로
  st.xSeen = bi; st.rsOpen = now + 20000; st.offOn = 0; st.offAlertAt = 0;
  st.dtDone = { at: now, i: bi, dep: dep, src: src };
  delete st.dt;
  notes.push('역까지 이동 끝 — ' + tg.name + ' ' + (src === 'tt' ? '시각표 가장 빠른 열차' : src === 'plan' ? '계획 시각표' : '승강장 도착 뒤 5분') + '으로 이어 붙임');
}
// ★ 2026-10-26 s231 (YJ: 임학은 도착하지도 않았는데 박촌 이동중 — 지하철은 도착 확정 연쇄 2회 실패하면 5분동안 GPS 를 탐색해서 다음 역의 영점을 무조건 맞춰):
//   확정 실패 = 마커가 통과 증거가 없는 역 앞에서 기다린 일(ride-eta pos.hold). 서로 다른 역에서 연달아 2번 실패하면(그 사이 제때 확정된 역이 없으면) 그 역을 5분 동안 '찾는다':
//   최근 2분~5분 사이 좌표 중 그 역에 가장 가까웠던 순간(정확도 400m 이하 · 350m 안)을 통과 시각으로 강제로 적는다(평소 영점은 150m·정확도 100m — 여기서는 터널·역사 안에서도 잡히게 넓힌다).
//   가장 가까운 순간이 지난 뒤(더 멀어졌거나 8초 경과)에만 적는다. 5분 안에 못 잡으면 탐색만 끝내고 마커는 계속 그 역 앞에서 기다린다.
var RS_SRCH_MS = 300000, RS_SRCH_BACK_MS = 120000, RS_SRCH_NEAR_M = 350, RS_SRCH_ACC_M = 400, RS_SRCH_SETTLE_MS = 8000, RS_SRCH_AWAY_M = 60;
function rsSearch(st, tr, now, passes, notYet, notes) {
  var sr = st.srch; if (!sr) return false;
  if (now > sr.until) { delete st.srch; notes.push('GPS 탐색 종료(5분) — ' + sr.i + '번 영점 못 잡음'); return false; }
  var s = null, i, j; for (i = 0; i < (st.stops || []).length; i++) if (st.stops[i] && st.stops[i].i === sr.i) { s = st.stops[i]; break; }
  if (!s || !isFinite(s.lat) || !isFinite(s.lng) || !tr.length) return false;
  var best = null, bi = -1;
  for (i = 0; i < tr.length; i++) {
    var q = tr[i]; if (q[0] < sr.from) continue;
    if (q[3] != null && isFinite(q[3]) && q[3] > RS_SRCH_ACC_M) continue;
    var d = rsHav(q[1], q[2], s.lat, s.lng) - (q[3] != null && isFinite(q[3]) ? Math.min(+q[3] * 0.5, 100) : 0);
    if (d <= RS_SRCH_NEAR_M && (best === null || d < best)) { best = d; bi = i; }
  }
  if (bi < 0) return false;
  var conf = now - tr[bi][0] >= RS_SRCH_SETTLE_MS;
  for (j = bi + 1; !conf && j < tr.length; j++) if (rsHav(tr[j][1], tr[j][2], s.lat, s.lng) >= best + RS_SRCH_AWAY_M) conf = true;
  if (!conf) return false;
  var hit = -1; for (j = 0; j < passes.length; j++) if (passes[j].idx === sr.i) { hit = j; break; }
  var np = { idx: sr.i, ms: tr[bi][0], src: 'gps' };
  if (hit >= 0) passes[hit] = np; else passes.push(np);
  delete notYet[sr.i]; delete st.srch; st.xf = 0;
  notes.push('GPS 탐색: ' + sr.i + '번 영점 강제(' + Math.round(best) + 'm)');
  rsRtArm(st, sr.i, now, notes);
  return true;
}
// ★ s231 (YJ: 실시간 위치 API 가 붙은 노선은 2회 연속 실패 → GPS 5분 탐색으로 영점이 맞으면, 거기서 내가 탄 열차의 실시간 도착정보를 불러 정확하게 맞추고 다시 GPS 영점으로 — API 호출은 아껴야 한다):
//   · GPS 가 시각표와 오차 안에서 맞는 동안은 부르지 않는다. 연쇄 2회 실패 → 탐색으로 영점이 잡힌 바로 그 순간에만, 다음 역(i+1) 한 곳의 도착정보를 최대 RS_RT_MAXTRY(2)번 묻는다(15초 간격 · 3분 안).
//   · 실시간 위치를 모르는 노선(rsSubwayId 가 비는 노선: 인천1호선 등)은 부르지 않는다 — GPS 탐색만.
//   · 폰은 묻기만 한다: ask(kind boardlive, body.kind 'subrt') → POST /board-live → 답을 다음 걸음 요청의 bl 에 실어 주면 eta.live 로 적는다. 이 노드를 GPS 로 지나면 live 는 자연히 쓸모가 없어진다(ride-eta 가 anchor 이하는 무시).
var RS_RT_STEP_MS = 15000, RS_RT_WINDOW_MS = 180000, RS_RT_MAXTRY = 2, RS_RT_ANS_MS = 90000, RS_RT_MAXAHEAD_MS = 600000;
function rsRtArm(st, i, now, notes) {
  try {
    var nodes = (st.eta && st.eta.nodes) || [], n = nodes[i], n1 = nodes[i + 1];
    if (!n || !n1 || !n.isSub || n.isBus || !n1.isSub || n1.isBus || !n1.name || !n.name || !n1.lineName || String(n.lineName) !== String(n1.lineName)) return false;
    if (!rsSubwayId(n1.lineName)) return false;                                  // 실시간 위치를 모르는 노선은 GPS 만
    st.rt = { i0: i, i1: i + 1, line: String(n1.lineName), stn: String(n1.name), prev: String(n.name), at: now, n: 0 };
    notes.push('실시간 보정 준비(' + n1.name + ')');
    return true;
  } catch (e) { return false; }
}
// 이번 걸음에 서버에 물을 것 — { kind:'subrt', i, nowMs, fromMs, line, from, prev } | null
function rsRtAsk(st, now) {
  var rt = st.rt; if (!rt || rt.done) return null;
  var passes = (st.eta && st.eta.passes) || [], k;
  for (k = 0; k < passes.length; k++) if (passes[k] && passes[k].idx >= rt.i1) { rt.done = 4; return null; }       // 이미 그 역을 GPS 로 지났다
  if (now - rt.at > RS_RT_WINDOW_MS) { rt.done = 3; return null; }
  if (rt.n >= RS_RT_MAXTRY) return null;                                                    // 최대 2번 — 마지막 답은 아직 기다린다(창 3분)
  if (rt.askAt && now - rt.askAt < RS_RT_STEP_MS) return null;
  rt.askAt = now; rt.n++;
  return { kind: 'subrt', i: rt.i1, nowMs: now, fromMs: now, line: rt.line, from: rt.stn, prev: rt.prev };
}
function rsRtApply(st, req, now, notes) {
  var b = req && req.bl, rt = st && st.rt, eta = st && st.eta;
  if (!b || b.kind !== 'subrt' || !rt || !eta || rt.done || +b.i !== rt.i1 || (rt.lastAt != null && +b.at === rt.lastAt)) return;
  var at = +b.at; if (!isFinite(at) || now - at > RS_RT_ANS_MS || at > now + 5000) return;
  rt.lastAt = at;
  if (b.ms == null || !isFinite(+b.ms) || +b.ms < now - 10000 || +b.ms > now + RS_RT_MAXAHEAD_MS) { notes.push('실시간 보정: 내 열차를 못 찾음(' + rt.n + '회)'); return; }
  var lv = (eta.live || []).filter(function (x) { return x && +x.idx !== rt.i1; });
  lv.push({ idx: rt.i1, ms: Math.round(+b.ms) }); eta.live = lv; rt.done = 1; rt.ms = Math.round(+b.ms);
  notes.push('실시간 보정: ' + rt.stn + ' 도착 ' + Math.round((+b.ms - now) / 1000) + '초 뒤로 맞춤');
}
// 한 걸음: 남은 거리·시간을 계산하고, 닿았으면 이어 붙인다. 돌려주는 값 = { name, distM, etaSec, arrived } 또는 null(해제됨)
function rsDtTick(st, tr, now, req, notes) {
  var dt = st.dt; if (!dt) return null;
  var tg = rsDtTarget(st);
  if (!tg || tg.i !== dt.i) { delete st.dt; notes.push('역까지 이동 해제(경로가 바뀌었거나 이미 지남)'); return null; }
  var q = tr.length ? tr[tr.length - 1] : null, info = { name: tg.name, distM: null, etaSec: null, arrived: !!dt.arr };
  if (q) {
    var d = rsHav(q[1], q[2], tg.lat, tg.lng), acc = q[3] != null && isFinite(q[3]) ? Math.min(+q[3], 50) : 0, eff = Math.max(0, d - acc), o = null, i, mps = 0;
    for (i = tr.length - 2; i >= 0; i--) if (q[0] - tr[i][0] >= 20000) { o = tr[i]; break; }
    if (o && q[0] - o[0] <= 120000) mps = rsHav(o[1], o[2], q[1], q[2]) / ((q[0] - o[0]) / 1000);
    info.distM = Math.round(eff);
    info.etaSec = Math.round(eff / (mps >= 2 ? mps : 6));
    if (!dt.arr && eff <= RS_DT_ARRIVE_M && now - q[0] <= 30000) { dt.arr = now; info.arrived = true; notes.push('역 도착(' + tg.name + ' ' + Math.round(eff) + 'm)'); }
  }
  if (dt.arr) {
    var tt = req && req.dtTT && req.dtTT.i === dt.i ? req.dtTT : null;
    if (tt || now - dt.arr >= RS_DT_TT_WAIT_MS) { rsDtRebase(st, tg, now, tt, notes); return null; }
  }
  return info;
}
// 이탈 알림 출력: 경로 첫 지하철역까지 이동을 고를 수 있으면 역 이름(stn)도 실어 준다(앞 버스 구간이 있고 아직 그 역을 안 지났을 때)
function rsOffOut(st, now) {
  var o = { at: st.offOn || now }, tg = rsDtTarget(st);
  if (tg && !st.wait) o.stn = tg.name;
  return o;
}
function rsDtKm(m) { return m >= 950 ? (Math.round(m / 100) / 10) + 'km' : (Math.round(m / 10) * 10) + 'm'; }
function rsDtText(info) {
  if (!info) return '';
  if (info.distM == null) return info.name + '까지 이동 중';
  var mins = Math.max(1, Math.round(info.etaSec / 60));
  return info.arrived ? info.name + ' 도착 · 가장 빠른 열차로 바꾸는 중' : info.name + '까지 ' + rsDtKm(info.distM) + ' · 약 ' + mins + '분';
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
  if (a === 'detour') rsDtActStart(st, now, notes);
  else if (a === 'open' || a === 'pill') { st.rsOpen = now + 20000; if (st.xw) st.xw.shr = false; }
  else if (a === 'close') { st.rsOpen = 0; if (st.xw && st.xw.arrMs != null && st.xw.arrMs - now <= RS_LEAD_MS) st.xw.shr = true; }   // 도착 2분 안에 닫은 차량은 대기 알약으로(다시 올리지 않음) · 2분보다 먼 때 닫은 것은 2분 안이 되면 자동으로 다시 올라온다
  else if (a === 'press' && !st.wait && st.xw && !st.xPend) {
    var x = st.xw, tt = req.pressTT && req.pressTT.i === x.i ? req.pressTT : null, dN = rsDistToStop(st, st.trail || [], x.i);
    var lateHit = !!(tt && tt.late != null && !(dN != null && dN > RS_NEAR_M));      // 방금 떠난 차가 있으면 예약하지 않고 바로 확정
    if (!lateHit && x.arrMs != null && x.arrMs - now > RS_EARLY_MS) {      // 도착 1분 반보다 일찍 누른 것은 예약만(마커가 튀지 않게) — 그 시각이 되거나 탄 증거가 잡히면 확정
      st.xPend = { i: x.i, at: now }; if (tt && tt.liveMs != null && isFinite(tt.liveMs)) st.xPend.lv = +tt.liveMs; st.rsOpen = 0; x.seen = true;      // s192: 실시간으로 가린 열차 시각을 예약에 적어 둔다 — 확정 때 그 시각을 쓴다
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
    eta.boarded = true; eta.notDeparted = false; delete st.wait; rsBlClear(st); st.rsOpen = 0;
    notes.push('승차 수동 확정(오버레이 탑승 버튼)' + (np.ms !== now ? (tw && tw.liveMs != null && np.ms === +tw.liveMs ? ' · 실시간 ' : ' · 시각표 ') + Math.round((np.ms - now) / 1000) + '초' : ''));
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
    else if (x.shr && dt > 0) stt = 'wait';      // s229: 닫아 둔 알약도 차가 오는 시각(탑승·환승 때)이 되면 다시 펼쳐 버튼을 보여 준다
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
function rsRows(st, r, now, dest, finLv, arrived) {
  var cfg = st.cfg || {}, ad = st.rcAd, dn = dest ? dest.nodeIdx : -1, k = 0, reco = null, getoff = null;
  var rem = (dn >= 0 && r.etaMs && r.etaMs[dn] != null && isFinite(r.etaMs[dn])) ? Math.round((r.etaMs[dn] - now) / 1000) : null;
  if (!arrived && finLv === 1 && !st.wait) {
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
  var arrived = !!(dest && curPos >= dest.seqPos);
  var rs = arrived ? { st: 'board', end: true, bt: '안내 종료', k: '목적지에 도착했어요', ch: '도착', nm: destName || '', bar: -1, cbg: '', cfg: '#0a84ff' } : rsRsState(st, r, now);
  // ★ 2026-10-19 (YJ: "환승버튼이 나오면 마커가 환승에가서 대기해야해", s198 엔진으로): 환승 탑승 버튼(시트·알약)이 떠 있는 동안 현위치 칸은 환승 걷기 칸(없으면 환승 직전 역)에서 멈춰 기다린다.
  //   줄 문구(line1)는 원래 현위치 기준 그대로 두고, 칸 표시·움직임만 바뀐다.
  var xf = false, cur0 = cur;
  if (!arrived && !st.wait && st.xw && rs && (rs.st === 'board' || rs.st === 'wait')) {
    var xj = rsXferCell(map, cur, st.xw.i);
    if (xj > cur) { cur = xj; xf = true; }
  }
  if (xf) moving = false;
  var nextJ = -1;
  for (j = cur0 + 1; j < cells.length; j++) if (map[j] != null && map[j] >= 0) { nextJ = j; break; }
  var cn = cells[cur0] ? cells[cur0].n : '', nn = nextJ >= 0 ? cells[nextJ].n : '';
  var line1 = nn ? cn + ' ▸ ' + nn : '● ' + cn;
  var pill = (moving && nextJ >= 0) ? (cells[nextJ].m || '') : '';
  // 남은시간 줄 — 목적지 도착 시각 기준
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; }, line2 = '';
  var dn = dest ? dest.nodeIdx : -1;
  if (dn >= 0 && r.etaMs && r.etaMs[dn] != null) {
    var mm = Math.max(0, Math.round((r.etaMs[dn] - now) / 60000));
    line2 = '남은시간: ' + p2(Math.floor(mm / 60)) + '시간 ' + p2(mm % 60) + '분' + (r.arr && r.arr[dn] ? ' · ' + r.arr[dn] + '도착' : '');
  }
  // 앱 화면(재개 화면)이 크게 보여 줄 문구 — 문구도 엔진이 정한다(남은 정거장 1·2 인 대상 기준)
  var lv = 0, tg = (st.cfg && st.cfg.targets) || [], i, bTg = null;
  for (i = 0; i < tg.length; i++) {
    var rem = tg[i].seqPos - curPos;
    if (curPos >= 0 && (rem === 1 || rem === 2)) { if (!lv || rem < lv) { lv = rem; bTg = tg[i]; } }
  }
  var banner = '';
  if (bTg && !(dest && curPos >= dest.seqPos)) {
    banner = bTg.kind === 'transfer' ? (lv === 1 ? '다음 정거장 ' + bTg.name + ' — ' + (bTg.nextLine || '다음 노선') + ' 환승 준비' : bTg.name + '에서 ' + (bTg.nextLine || '다음 노선') + ' 환승 · 2정거장 전')
      : (lv === 1 ? '다음 정거장 ' + bTg.name + ' — 내릴 준비하세요' : bTg.name + '까지 2정거장 남았어요');
  } else if (dest && curPos >= dest.seqPos) banner = (destName || dest.name || '목적지') + '에 도착했어요';
  // ★ 하이라이트 단계(웹 _ovlAlertLevelRaw): 타고 있는 구간 기준, 환승역은 1정거장 전부터, 최종은 2·1정거장 전, 한 번 켜진 단계는 환승 승차/하차 판정까지 유지
  var al = rsOvlLevel(st, curIdx, curPos);
  var oa = st.ovlAlert || (st.ovlAlert = { lv: 0, at: 0 });
  if (oa.lv !== al.lv) { oa.lv = al.lv; if (al.lv > 0) oa.at = now; }
  var allowed = (st.cfg && st.cfg.allowed) || {};
  var vibe = !arrived && al.lv > 0 && allowed[al.fin ? 'near_arrive' : 'transfer'] !== false;
  var rows = rsRows(st, r, now, dest, al.finLv, arrived);
  var out = { active: true, line1: line1, pill: pill, track: [], cur: cur, base: ov.base || 0, line2: line2, line3: '', alert: arrived ? 0 : al.lv, alertAt: oa.at || 0, alertVibe: vibe, banner: banner, destName: destName || '', pre: !arrived && al.lv === 0 && al.pre === 1, moving: !!moving, rs: rs, reco: rows.reco, getoff: rows.getoff, cells: cells };
  out.pillTxt = rsPillTxt(rs, line1, line2, pill, cells, cur0);
  if (xf) out.xfer = true;
  if (ov.theme) out.theme = ov.theme;
  var sh = rsShare(st, r, cells, map, cur0, moving, dest, destName, now);
  if (sh) out.share = sh;
  return out;
}

// 접힌 알약에 보일 한 줄(웹 OverlayPlugin.pillText): 탑승 대기면 '대기 · 탈 것', 탄 뒤에는 '현위치 · HH:MM 도착'(이동 중이면 현위치 대신 '다음역(이동중)'). 오버레이는 이 글을 그대로 그린다.
function rsPillTxt(rs, line1, line2, pill, cells, cur) {
  if (rs && !rs.end && (rs.st === 'wait' || rs.st === 'board')) {      // s229(YJ: 대기 알약에는 정류장·역 이름이 나와야 한다): 대기 · 이름 · 노선 (너무 길면 이름만)
    var nm0 = rs.ch ? '' : String(rs.nm || ''), cp0 = String(rs.ch || rs.chip || ''), lab = nm0 && cp0 ? nm0 + ' · ' + cp0 : (nm0 || cp0);
    if (nm0 && lab.length > 18) lab = nm0;
    return lab ? '대기 · ' + lab : '대기';
  }
  var c = String(line1 || ''), k = c.indexOf(' ▸ ');
  if (k > 0) c = c.slice(0, k);
  if (c.indexOf('● ') === 0) c = c.slice(2);
  c = c.trim();
  if (pill) c = pill;
  if (!c && cells && cells[cur] && cells[cur].n) c = String(cells[cur].n);
  var m = /(\d{1,2}:\d{2})\s*도착/.exec(String(line2 || '')), arr = m ? m[1] : '';
  if (!c) return arr ? arr + ' 도착' : '';
  return arr ? c + ' · ' + arr + ' 도착' : c;
}
// 환승 칸: 다음 구간 탑승 노드(bi) 앞의 환승 걷기 칸(노드가 아닌 칸) — 없으면 탑승 노드 바로 앞 칸. 현위치 칸(cur) 뒤가 아니면 -1.
function rsXferCell(map, cur, bi) {
  var bj = -1, j;
  for (j = 0; j < map.length; j++) if (map[j] === bi) { bj = j; break; }
  if (bj <= cur) return -1;
  for (j = bj - 1; j > cur; j--) if (!(map[j] != null && map[j] >= 0)) return j;
  return (bj - 1 > cur) ? bj - 1 : -1;
}
// 하차·환승 하이라이트 단계 — 웹 _ovlAlertLevelRaw 를 옮겼다. 반환 { lv(0|1|2), fin(마지막 구간 여부), pre(최종 3정거장 전), finLv(마지막 구간 한 정거장 전) }.
//   · 타고 있는 구간(승차 대기·환승 대기가 아니고 차량 노드 위)의 하차 대상까지 남은 정거장: 2 → 2, 1 이하 → 1, 환승역(뒤에 더 탈 구간)은 2정거장 전을 알리지 않는다.
//   · 한 번 켜진 단계는 래치(st.ovlLatch)로 붙잡는다 — 2→1 로만. 환승이면 다음 구간 승차가 확인될 때(탑승 기록·통과 증거·진행도), 마지막이면 하차 노드를 지날 때 푼다.
function rsOvlLevel(st, curIdx, curPos) {
  var cfg = st.cfg || {}, tg = cfg.targets || [], eta = st.eta || {}, nodes = eta.nodes || [], i;
  var L = st.ovlLatch || (st.ovlLatch = { a: -1, lv: 0, fin: true });
  if (L.a >= 0) {
    var legs = rsLegsOf(eta), bNext = -1, released;
    for (i = 0; i < legs.length; i++) if (legs[i].bi > L.a) { bNext = legs[i].bi; break; }
    if (bNext >= 0) released = !!(st.rsDone || {})[bNext] || rsMaxPass(eta) >= bNext || (curIdx > bNext && !(st.xw && st.xw.i === bNext));
    else released = curIdx > L.a;
    if (released) { L.a = -1; L.lv = 0; }
  }
  var lv = 0, pre = 0, fin = true, aNow = -1, seg = null;
  var nd = nodes[curIdx], riding = curPos >= 0 && !!nd && !nd.isOrigin && !nd.isWalk && (nd.isBus || nd.isSub) && !st.wait && !st.xw;
  if (riding) {
    for (i = 0; i < tg.length; i++) if (tg[i].seqPos >= curPos && (!seg || tg[i].seqPos < seg.seqPos)) seg = tg[i];
    if (seg) {
      aNow = seg.nodeIdx;
      var rem = seg.seqPos - curPos;
      lv = rem === 2 ? 2 : (rem <= 1 ? 1 : 0);
      fin = seg.kind !== 'transfer';
      if (!fin && lv === 2) lv = 0;
      pre = (fin && rem === 3) ? 1 : 0;
    }
  }
  if (lv > 0 && aNow >= 0) {
    if (L.a !== aNow) { L.a = aNow; L.lv = lv; L.fin = fin; }
    else if (L.lv === 0 || lv < L.lv) L.lv = lv;
  }
  var latched = L.a >= 0;
  return { lv: latched ? L.lv : lv, fin: latched ? L.fin !== false : fin, pre: pre, finLv: (latched ? (L.fin !== false && L.lv === 1) : (fin && lv === 1)) ? 1 : 0 };
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
    stations: stn, hit: hit, moving: mv, left: Math.max(0, stn.length - 1 - hit), next: nextName,
    foot: (function (left) { return mv ? '다음 역 ' + nextName + ' 이동 중 · ' + left + '개 역 남음' : (left > 0 ? left + '개 역 남음' : '도착했어요'); })(Math.max(0, stn.length - 1 - hit)),
    lb: { t: '길동무 · 내 위치', a: '도착예정시간: ', r: '남은시간 ' } };      // 공유 그림의 아래 한 줄과 글머리는 엔진이 정한다(s207)
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
  eta.boarded = true; eta.notDeparted = false; delete st.wait; rsBlClear(st);
  notes.push('승차 확정(' + why + ')');
}

// ── ★ 2026-10-25 s196 (YJ: "웹의 모든 기능은 네이티브로 다 앱에 옮겨야 해") 승차 대기 중 실시간 재보정 ─────────────────────────────────────────────
//   웹 _applyRealBoardTime · _boardNextDep · _htlResyncBoard · _htlWaitArrived 를 엔진으로 옮겼다. 확정한 경로를 따라 승차역으로 가는 동안(승차 대기 st.wait)
//   15초마다 '내가 탈 수 있는 다음 차'의 실제 도착(지하철 = 서울 실시간 도착정보 ↔ 시각표, 버스 = 정류장 도착정보)을 묻고, 열차·버스가 당겨지거나 밀리면
//   승차역 이후의 모든 시각을 그만큼 옮긴다(ride-eta 의 boardNext). 승차가 확정되면(st.wait 가 사라지면) 더는 묻지 않는다 — 탑승 뒤 서버 요청 0 은 그대로.
//   · 엔진은 묻지 못한다(순수 함수) → 응답에 ask:{kind:'boardlive', body} 를 실어 '지금 물어라'고 알린다. 폰이 POST /board-live 로 보내고, 받은 답을 다음 걸음 요청의 bl 에 실어 준다.
//   · 웹과 같은 규칙: 15초 간격(도착 순간은 즉시 · 90분까지 허용) · 승차역 250m 안이면 앞당김도 허용(밖이면 늦춤만) · 내가 닿기 전에 떠나는 차는 제외(내가 닿는 시각 + 30초) ·
//     역에 닿아 예정 시각 ±2분 안이면 다음 차로 밀지 않는다(지금 그 차를 타는 중일 수 있다) · 승차까지 20분 넘게 남으면 실시간은 건너뛰고 시각표 · 실시간이 시각표와 4분 넘게 어긋나면 시각표.
//   · 웹의 약점 보완: 버스는 웹처럼 '번호가 비슷한 노선'(1 과 10)을 섞지 않고 정확히 같은 번호만 · 정류장은 경로가 아는 ID 를 그대로(웹은 출발지 둘레 정류장을 다시 찾았다) ·
//     서울 도착정보를 20건까지(웹 10건 — 환승역에서 다른 호선이 목록을 채워 우리 호선이 빠지던 것을 줄임) · [탑승]과 같은 주소(1/20)로 받아 서울 중계의 캐시를 함께 쓴다(역마다 따로 받으면 일일 한도를 두 배로 쓴다) · 도착 답이 늦게 온 것(90초 넘음)은 버린다.
var RS_BL_STEP_MS = 15000;        // 묻는 간격(웹 _htlResyncBoard 의 15초)
var RS_BL_NEAR_M = 250;           // 승차역에서 이 안이면 '역 근처'(웹 _htlBoardNear) — 앞당김 허용
var RS_BL_FIX_MS = 60000;         // 위치가 이보다 오래됐으면 도보 ETA 를 모른다 → 묻지 않는다
var RS_BL_WALK_MPS = 1.2, RS_BL_DETOUR = 1.25;     // 웹 _BOARD_WALK_MPS · _BOARD_ETA_DETOUR
var RS_BL_HOLD_MIN = 2;           // 웹 _HTL_BOARD_HOLD_MIN
var RS_BL_AHEAD_MAX_MIN = 20;     // 웹 _RT_ARR_MAX_AHEAD
var RS_BL_PICK_TOL_MS = 150000;   // s200: 고른 버스를 따라갈 때 허용하는 어긋남(2분 반)
var RS_BL_BUF_MS = 30000;         // 웹 _BOARD_CATCH_BUFFER_MIN 0.5분
var RS_BL_SNAP_MS = 4 * 60000;    // 웹 _RT_SNAP_TOL
var RS_BL_MAXWAIT = 30, RS_BL_MAXWAIT_ARR = 90;     // 반영할 최대 대기(분): 평소 30 · 역에 닿은 순간 90
var RS_BL_ANS_MS = 90000;         // 이보다 오래된 답은 버린다

// 지금 승차 대기의 대상 — { kind:'sub', line, from, to } | { kind:'bus', cc, sid, no } | null
function rsBlTarget(st) {
  var w = st && st.wait, eta = st && st.eta; if (!w || !eta) return null;
  var nodes = eta.nodes || [], n = nodes[w.i], nx = nodes[w.i + 1];
  if (!n) return null;
  if (n.isSub && !n.isBus && n.lineName && n.name) return { kind: 'sub', line: String(n.lineName), from: String(n.name), to: (nx && nx.name) ? String(nx.name) : '' };
  var b = st.cfg && st.cfg.bl;
  if (n.isBus && !n.isSub && b && b.kind === 'bus' && b.i === w.i && b.cc && b.sid && n.lineName) return { kind: 'bus', cc: String(b.cc), sid: String(b.sid), no: String(n.lineName) };
  return null;
}
// 이번 걸음에 서버에 물을 것 — { kind, i, …, nowMs, fromMs, allowEarlier, maxWait, tz } | null. 물을 때만 st.bl 을 갱신한다.
function rsBlAsk(st, tr, now) {
  try {
    var w = st.wait, tg = rsBlTarget(st); if (!w || !tg || !tr.length) return null;
    var q = tr[tr.length - 1]; if (!q || now - q[0] > RS_BL_FIX_MS || !isFinite(q[1]) || !isFinite(q[2])) return null;
    var bl = st.bl = st.bl || {};
    var dist = rsHav(q[1], q[2], w.lat, w.lng), near = !!w.seen || dist <= RS_BL_NEAR_M;
    var arrivedNow = !!w.seen && !bl.arr;                                    // 승차역에 닿은 첫 순간(웹 _htlWaitArrived): 즉시 · 앞당김 허용 · 90분까지
    if (!arrivedNow) {
      if (now - (bl.askAt || 0) < RS_BL_STEP_MS) return null;                // 15초 간격
      var dep = st.etaMs && st.etaMs[w.i];
      if (w.seen && dep != null && isFinite(dep)) { var past = (now - dep) / 60000; if (past >= -0.5 && past <= RS_BL_HOLD_MIN) return null; }   // 지금 그 차를 타는 중일 수 있다
    }
    bl.askAt = now; if (arrivedNow) bl.arr = 1;
    var tz = st.eta.tzOffsetMin != null && isFinite(+st.eta.tzOffsetMin) ? +st.eta.tzOffsetMin : 540;
    var fromMs = near ? now : now + (dist * RS_BL_DETOUR / RS_BL_WALK_MPS) * 1000;      // 승차역에 있게 되는 시각(웹 _boardEtaMin)
    var o = { kind: tg.kind, i: w.i, nowMs: now, fromMs: Math.round(fromMs), allowEarlier: near || arrivedNow, maxWait: arrivedNow ? RS_BL_MAXWAIT_ARR : RS_BL_MAXWAIT, tz: tz };
    if (tg.kind === 'sub') { o.line = tg.line; o.from = tg.from; o.to = tg.to; } else {
      o.cc = tg.cc; o.sid = tg.sid; o.no = tg.no;
      var cb = st.cfg && st.cfg.bl;
      if (cb && cb.pickMs != null && isFinite(+cb.pickMs)) o.near = Math.round(st.bl && st.bl.ms != null && isFinite(+st.bl.ms) ? +st.bl.ms : +cb.pickMs);      // s200: 사용자가 팝업에서 고른 버스 — 직전에 따라간 도착 시각에 가장 가까운 차를 계속 따라간다
    }
    return o;
  } catch (e) { return null; }
}
// 받아 온 답(req.bl)을 다음 차 시각(eta.boardNext)으로 반영한다 — 승차역 이후 시각을 옮기는 일은 ride-eta 가 한다.
function rsBlApply(st, req, now, notes) {
  var b = req && req.bl, w = st && st.wait, eta = st && st.eta;
  if (!b || !w || !eta || b.i !== w.i || b.kind === 'subrt') return;
  var at = +b.at; if (!isFinite(at) || now - at > RS_BL_ANS_MS || at > now + 5000) return;       // 오래됐거나 미래의 답은 버린다
  if (b.ms == null || !isFinite(+b.ms)) return;                                                     // 못 받음 → 직전 값 유지(웹 applyDelay(null))
  var mw = (b.maxWait != null && isFinite(+b.maxWait)) ? +b.maxWait : RS_BL_MAXWAIT;
  eta.boardNext = { ms: +b.ms, src: 'realboard', allowEarlier: !!b.allowEarlier || b.src === 'realtime', maxWaitMin: mw };
  if (b.fromMs != null && isFinite(+b.fromMs)) eta.boardArriveMs = +b.fromMs;                      // 웹 _htlBoardFixWait: 승차역 시각 ≥ 내가 닿는 시각
  var bl = st.bl = st.bl || {}; bl.src = b.src || ''; bl.ms = +b.ms; bl.okAt = now;
  notes.push('실시간 재보정(' + (b.src || '?') + ') 다음 차 ' + Math.round((+b.ms - now) / 1000) + '초 뒤');
}
// 승차 확정(대기 끝) — 승차 전 증거는 지운다
function rsBlClear(st) { if (st.eta) { delete st.eta.boardNext; delete st.eta.boardArriveMs; } delete st.bl; }

// ── 서버 쪽: POST /board-live — 웹 _boardNextDep 와 같은 규칙으로 '내가 탈 수 있는 다음 차'의 시각(ms)을 낸다 ──
function rsMinOfDay(ms, tz) { return (((ms / 60000 + tz) % 1440) + 1440) % 1440; }
// 서울 실시간 도착 목록 → 내가 닿은 뒤 가장 빨리 오는 내 방향 열차의 도착 시각(ms) | null (웹 _boardNextDep 의 realtime 쪽)
//   list = realtimeArrivalList, nt = 다음 열차 엔진(forward), q = { line, from, to, nowMs, fromMs }
function rsBlLivePick(list, q, nt) {
  try {
    var sid = rsSubwayId(q.line); if (!sid || !list || !list.length) return null;
    var best = null, k, it, sec, term;
    for (k = 0; k < list.length; k++) {
      it = list[k]; if (!it || String(it.subwayId || '') !== sid) continue;
      sec = parseInt(it.barvlDt, 10); if (!isFinite(sec) || sec <= 0) continue;
      term = String(it.bstatnNm || '');
      if (q.to && nt && typeof nt.forward === 'function') { var fw = nt.forward(q.line, q.from, q.to, term); if (fw === false) continue; }       // 반대 방향 열차는 뺀다(판단 불가 = 거르지 않음)
      var arr = q.nowMs + sec * 1000;
      if (arr < q.fromMs + RS_BL_BUF_MS) continue;                                                     // 내가 닿기 전에 떠나는 차는 제외
      if (best == null || arr < best) best = arr;
    }
    return best;
  } catch (e) { return null; }
}
// ★ s231: 영점이 강제로 잡힌 직후 '내가 탄 열차' — 방금 지난 역의 다음 역(q.from) 도착정보에서, 내 진행 방향(q.prev → q.from)으로 오는 열차 중 가장 먼저 닿는 것.
//   이미 그 역에 들어와 있거나(arvlCd 1 도착·2 출발) 내 앞을 가는 열차는 뺀다. 호선(subwayId)이 다른 열차도 뺀다. 못 고르면 null.
function rsRtPick(list, q, nt) {
  try {
    var sid = rsSubwayId(q.line); if (!sid || !list || !list.length) return null;
    var best = null, k, it, sec, cd, term;
    for (k = 0; k < list.length; k++) {
      it = list[k]; if (!it || String(it.subwayId || '') !== sid) continue;
      cd = parseInt(it.arvlCd, 10); if (cd === 1 || cd === 2) continue;
      sec = parseInt(it.barvlDt, 10); if (!isFinite(sec) || sec <= 0) continue;
      term = String(it.bstatnNm || '');
      if (q.prev && nt && typeof nt.forward === 'function') { var fw = nt.forward(q.line, q.prev, q.from, term); if (fw === false) continue; }
      var arr = q.nowMs + sec * 1000;
      if (best == null || arr < best) best = arr;
    }
    return best;
  } catch (e) { return null; }
}
// 시각표의 다음 열차 시각(ms) — { ms, dk } | null
function rsBlTable(q, nt) {
  try {
    if (!nt || typeof nt.boardTable !== 'function') return null;
    var tz = q.tz != null && isFinite(+q.tz) ? +q.tz : 540, mod = rsMinOfDay(q.fromMs, tz);
    var bt = nt.boardTable({ line: q.line, from: q.from, to: q.to || '', atMin: mod, baseMs: q.fromMs });
    if (!bt || bt.depMin == null || !isFinite(bt.depMin)) return null;
    return { ms: Math.round(q.fromMs - mod * 60000 + bt.depMin * 60000), dk: bt.dk || null };
  } catch (e) { return null; }
}
// 실시간 ↔ 시각표 맞춤(웹: 시각표가 1순위, 실시간은 그 열차의 지연·조기 보정 — 4분 넘게 어긋나면 시각표)
function rsBlReconcile(live, tbl) {
  if (live == null) return tbl ? { ms: tbl.ms, src: 'table', dk: tbl.dk } : null;
  if (!tbl) return { ms: live, src: 'realtime', dk: null };
  return Math.abs(live - tbl.ms) <= RS_BL_SNAP_MS ? { ms: live, src: 'realtime', dk: tbl.dk } : { ms: tbl.ms, src: 'table', dk: tbl.dk };
}
function rsBlSub(env, q, nt) {
  var tbl = function () { return rsBlTable(q, nt); };
  var ahead = (q.fromMs - q.nowMs) / 60000;
  if (!rsSubwayId(q.line) || ahead > RS_BL_AHEAD_MAX_MIN) return Promise.resolve(rsBlReconcile(null, tbl()));       // 먼 미래엔 실시간 목록에 그 열차가 없다 → 시각표
  return rsFetchSeoulPath(env, 'realtimeStationArrival/1/20/' + encodeURIComponent(String(q.from).replace(/역$/, '').trim()), RS_LIVE_MS).then(function (list) {
    return rsBlReconcile(rsBlLivePick(list, q, nt), tbl());
  }, function () { return rsBlReconcile(null, tbl()); });
}
// 버스: 정류장 도착정보(번호가 정확히 같은 노선만)에서 내가 닿은 뒤 가장 빨리 오는 차의 시각(ms) | null
function rsBlBusPick(m, q) {
  try {
    if (!m) return null;
    var list = m[q.no] || (typeof noKey === 'function' ? m[noKey(q.no)] : null);
    if (!Array.isArray(list) || !list.length) return null;
    var sorted = list.slice().sort(function (a, b) { return a - b; }), k, cand = [];
    for (k = 0; k < sorted.length; k++) { var arr = q.nowMs + sorted[k] * 1000; if (sorted[k] > 0 && arr >= q.fromMs + RS_BL_BUF_MS) cand.push(arr); }
    if (!cand.length) return null;
    if (q.near != null && isFinite(+q.near)) {                                                      // s200: 고른 버스가 있으면 그 차(직전 시각에 가장 가까운 도착)를 따라간다 — 2분 반 넘게 어긋나면(지나갔거나 못 찾음) 다음에 탈 수 있는 차로
      var bi = -1, bd = 1e18, d;
      for (k = 0; k < cand.length; k++) { d = Math.abs(cand[k] - +q.near); if (d < bd) { bd = d; bi = k; } }
      if (bi >= 0 && bd <= RS_BL_PICK_TOL_MS) return cand[bi];
    }
    return cand[0];
  } catch (e) { return null; }
}
function rsBlBus(env, q) {
  if (typeof fetchStopArrivalsAny !== 'function' || !q.cc || !q.sid || !q.no) return Promise.resolve(null);
  try { if (typeof liveCityOk === 'function' && !liveCityOk(env, q.cc, q.sid)) return Promise.resolve(null); } catch (e0) { }
  var timer = null, cut = new Promise(function (res) { timer = setTimeout(function () { res(null); }, RS_LIVE_MS); });
  var go = Promise.resolve().then(function () { return fetchStopArrivalsAny(q.cc, q.sid, env, Date.now() + RS_LIVE_MS, typeof LIVE_BUDGET_REF !== 'undefined' ? LIVE_BUDGET_REF : { used: 0 }, null); })
    .then(function (m) { var ms = rsBlBusPick(m, q); return ms == null ? null : { ms: Math.round(ms), src: 'realtime', dk: null }; }, function () { return null; });
  return Promise.race([go, cut]).then(function (v) { if (timer) clearTimeout(timer); return v; });
}
// 질의 한 건 → 답 { ok, kind, i, ms|null, src, at, fromMs, allowEarlier, maxWait } (못 구하면 ms:null — 폰은 직전 값을 그대로 둔다)
function rsBoardLive(env, q) {
  q = q || {};
  var base = { ok: true, kind: q.kind, i: q.i, ms: null, src: null, at: +q.nowMs, fromMs: +q.fromMs, allowEarlier: !!q.allowEarlier, maxWait: isFinite(+q.maxWait) ? +q.maxWait : RS_BL_MAXWAIT };
  if (!isFinite(base.at) || !isFinite(base.fromMs)) return Promise.resolve(Object.assign(base, { ok: false }));
  q.nowMs = base.at; q.fromMs = base.fromMs;
  var fin = function (r) { if (r && r.ms != null && isFinite(r.ms)) { base.ms = r.ms; base.src = r.src; if (r.dk) base.dk = r.dk; } return base; };
  if (q.kind === 'sub') {
    return Promise.resolve().then(function () { return typeof ntEnsure === 'function' ? ntEnsure(env) : null; }).then(function (nt) { return rsBlSub(env, q, nt); }, function () { return rsBlSub(env, q, null); }).then(fin, function () { return base; });
  }
  if (q.kind === 'bus') return rsBlBus(env, q).then(fin, function () { return base; });
  if (q.kind === 'subrt') {                                           // s231: 내 열차의 실시간 도착 — 실시간 노선만
    if (!rsSubwayId(q.line) || !q.from) return Promise.resolve(Object.assign(base, { ok: false }));
    var path = 'realtimeStationArrival/1/20/' + encodeURIComponent(String(q.from).replace(/역$/, '').trim());
    return Promise.all([rsFetchSeoulPath(env, path, RS_LIVE_MS), Promise.resolve().then(function () { return typeof ntEnsure === 'function' ? ntEnsure(env) : null; }).then(function (nt) { return nt; }, function () { return null; })]).then(function (rr) {
      var ms = rsRtPick(rr[0], q, rr[1]); return fin(ms == null ? null : { ms: Math.round(ms), src: 'realtime' });
    }, function () { return base; });
  }
  return Promise.resolve(Object.assign(base, { ok: false }));
}
function handleBoardLive(request, env) {
  var H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
  if (request.method === 'OPTIONS') return Promise.resolve(new Response(null, { status: 204, headers: H }));
  if (request.method !== 'POST') return Promise.resolve(new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: H }));
  return request.text().then(function (txt) {
    var q; try { q = JSON.parse(txt); } catch (e) { return new Response(JSON.stringify({ error: 'JSON 아님' }), { status: 400, headers: H }); }
    return rsBoardLive(env, q).then(function (r) { return new Response(JSON.stringify(r), { headers: H }); }, function () { return new Response(JSON.stringify({ ok: false }), { headers: H }); });
  }, function () { return new Response(JSON.stringify({ error: '요청을 읽지 못함' }), { status: 400, headers: H }); });
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
  rsBlApply(st, req, now, notes);                 // 1.45) 받아 온 실시간 다음 차(s196)
  rsRtApply(st, req, now, notes);                 // 1.46) s231 받아 온 '내 열차' 실시간 도착
  rsWait(st, tr, now, O, notes);                  // 1.5) 승차 대기 · 승차 감지
  rsXwait(st, tr, now, notes);                    // 1.55) 환승 구간 승차 대기
  var askBl = rsBlAsk(st, tr, now);               // 1.56) 승차 대기 중 실시간 다음 차를 물을 때인가(s196)
  rsActs(st, req, now, notes);                    // 1.6) 앱이 알려 준 추천 줄 · 닫기 · 오버레이 탑승 손짓
  // 1.7) s229 역까지 이동: 남은 거리·시간 · 역에 닿으면 가장 빠른 열차로 조용히 이어 붙임(그동안은 아래 영점·재동기·이탈 판정·하차 알림을 쉰다)
  var dtInfo = null;
  if (st.dt) { dtInfo = rsDtTick(st, tr, now, req, notes); if (!st.dt && st.dtDone && st.dtDone.at === now) rsXwait(st, tr, now, notes); }
  var dtHold = !!st.dt || !!(st.dtDone && st.xw && st.xw.i === st.dtDone.i);     // 역까지 이동 중이거나, 이어 붙인 열차를 아직 안 탄 동안은 위치로 통과를 인정하지 않는다(역 안에서 기다리는 중이다)
  // 2) 영점: 정류장 도착 시각을 최신 etaMs 로 맞춰 ride-track 에 묻는다 → 통과 시각(passMs)은 gps 증거로, 아직 안 닿음은 notYet 으로
  var eta = st.eta, passes = (eta.passes = eta.passes || []), notYet = (st.notYet = st.notYet || {});
  var zero = null, newPass = false, tk = null;
  // ★ 2026-10-19: 지금 진행 노드(가장 뒤 통과)가 버스 정류장이면 엔진이 버스 위치(busPos)·움직임(motion)까지 본다 — 앱이 가려져도 웹과 같은 판정.
  var enodes = eta.nodes || [], progMax = -1, progBus = false;
  for (i = 0; i < passes.length; i++) if (passes[i] && passes[i].idx > progMax) progMax = passes[i].idx;
  if (progMax >= 0 && enodes[progMax] && enodes[progMax].isBus && !enodes[progMax].isWalk) progBus = true;
  if (st.stops && st.stops.length && tr.length && !dtHold) {
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
          if (st.hdLast !== z.i) st.xf = 0;                                      // s231: 제때 확정된 역이 있으면 '연달아 실패'는 처음부터
          if (st.srch && z.i >= st.srch.i) { delete st.srch; st.xf = 0; rsRtArm(st, z.i, now, notes); }
          notes.push('영점 ' + z.i + '번 통과 반영');
        } else if (z.notYet) { notYet[z.i] = now; }
      });
    }
  }
  if (st.srch && rsSearch(st, tr, now, passes, notYet, notes)) newPass = true;      // 2.2) s231 연쇄 2회 실패 뒤 5분 GPS 탐색
  if (st.hd != null) {                                                              // s231: 기다리는 역에 통과 증거가 생기면 풀고, 아직이면 연착으로 밀도록(notYet) 계속 알린다
    var cfd = false; for (i = 0; i < passes.length; i++) if (passes[i] && passes[i].idx >= st.hd && (passes[i].src === 'gps' || passes[i].src === 'move' || passes[i].src === 'pf')) cfd = true;
    if (cfd) { notes.push('도착 확정(' + st.hd + '번) — 대기 해제'); delete st.hd; }
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
  if (!dtHold && rsResync(st, now, notes)) newPass = true;
  if (!dtHold && st.cfg && st.cfg.pfLive === true && rsFuse(st, fx, now, notes)) newPass = true;   // 2.6) 새 위치 판단기 보정(실험 · 설정에서 켠 때만)   // 2.5) 버스: 오래 끊겼던 GPS 가 돌아오면 앞쪽 정류장 통과로 다시 맞춘다(시각표 기준 여정은 시각표가 이어가므로 해당 없음)
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
  if (st.wait && eta.boardNext && r.etaMs[st.wait.i] != null && isFinite(r.etaMs[st.wait.i])) st.wait.arrMs = r.etaMs[st.wait.i];     // 다음 차가 밀리면(당겨지면) 감지 유예도 그 시각 기준(s196)
  if (r.delayMin != null) { eta.prevLevelMin = r.delayMin; eta.prevAnchorIdx = r.anchorIdx; }
  // 4) 지금 어느 역까지 왔나 → 알림 판정 · 상주 알림 문구
  var nodes = eta.nodes || [], cfg = st.cfg || {}, curIdx = -1;
  if (r.pos && r.pos.from != null) curIdx = r.pos.ttFrom != null ? r.pos.ttFrom : r.pos.from;      // s231: 마커가 도착 확정을 기다려 멈춰 있어도 알림은 시각표 위치로(지하에서 GPS 가 없어도 하차 알림은 나가야 한다)
  else { for (i = 0; i < nodes.length; i++) if (r.etaMs[i] != null && r.etaMs[i] <= now) curIdx = i; }
  if (r.pos && r.pos.hold != null && st.hd !== r.pos.hold) {                        // s231: 새 역에서 도착 확정 실패 — 연달아 2번이면 5분 GPS 탐색
    st.hd = r.pos.hold; st.hdLast = r.pos.hold; st.xf = (st.xf || 0) + 1;
    notes.push('도착 확정 실패 ' + st.xf + '회(' + r.pos.hold + '번 역) — 마커는 그 역 앞에서 기다림');
    if (st.xf >= 2 && !st.srch) { st.srch = { i: r.pos.hold, from: now - RS_SRCH_BACK_MS, until: now + RS_SRCH_MS }; notes.push('GPS 탐색 5분 시작(' + r.pos.hold + '번 역)'); }
  }
  var askRt = rsRtAsk(st, now);                     // s231 실시간 노선의 영점 강제 직후 한 번(최대 2회) 내 열차를 묻는다
  var al = rsAlerts(cfg, fired, curIdx, r.etaMs, now);
  // ★ 2026-10-14 (YJ: "고치지 못한 것 전부 진행 — 카카오지하철처럼 네이티브 활용"): 앱을 닫은 뒤에도 경로를 벗어나면(중간에 내려 걷거나 택시) 알림으로 알린다.
  //   판정은 ride-track rtOff(지하철 탑승 확정 중에는 '신선하고 정확한 좌표가 2분 가까이 전부 경로선 600m 밖'일 때만). 벗어난 동안에는 하차 알림을 울리지 않는다(내린 사람에게 '곧 하차'는 거짓).
  var offRes = null, offActive = false;
  try {
    var ptsO = (st.stops || []).filter(function (q) { return q && isFinite(q.lat) && isFinite(q.lng); }).map(function (q) { return { lat: q.lat, lng: q.lng }; });
    // ★ 2026-10-25 (YJ: 경로확정이 계속 풀려): 아직 안 탄 대기 중(st.wait · eta.boarded:false · notDeparted)에는 이탈을 보지 않는다.
    //   역으로 걸어가는 사람은 경로선(차량이 달리는 선)에서 멀리 있는 게 당연한데, 아래 판정은 plan.boarded:true 로 부르기 때문에
    //   걷는 동안 '이탈'로 읽혀 알림이 나가고 offGiveUpSec(15분) 뒤 안내가 끝나 확정이 풀렸다. 탔다고 확정된 뒤부터만 본다.
    var preBoard = !!st.wait || eta.boarded === false || eta.notDeparted === true;
    if (preBoard) { st.offOn = 0; st.offAlertAt = 0; }
    if (!preBoard && tr.length && ptsO.length >= 2 && !(st.arrivedAt) && !st.dt) {
      var tfO = eta.timetableFirst === true;
      var ot = rsTrackFn()({ nowMs: now, trail: tr, plan: { pts: ptsO, progIsSub: tfO, subConfirmed: tfO, boarded: true, notDeparted: false, suppress: [] }, want: { off: true, ridden: false, miss: false, bus: false, board: false } });
      offRes = ot && ot.off ? ot.off : null;
    }
  } catch (eOff) { notes.push('이탈 판정 실패: ' + (eOff && eOff.message)); }
  if (offRes && offRes.confirmed) { if (!st.offOn) { st.offOn = now; } offActive = true; }
  else if (offRes && offRes.why === 'on_path') { st.offOn = 0; st.offAlertAt = 0; }   // 경로선으로 돌아오면 이탈이 끝난 것 — 다음에 벗어나면 다시 알린다
  else if (st.offOn) offActive = true;   // 판단 근거가 부족한 틱(GPS 끊김 등)은 직전 상태를 유지한다
  if (st.dt) { offActive = false; st.offOn = 0; st.offAlertAt = 0; }   // s229: 역까지 이동 중에는 이탈 알림·질문을 하지 않는다(사용자가 고른 길이다)
  if (st.dt && al.alert) { al.alert = null; al.extra = []; }     // s229: 차로 달리는 중 계획 시각표대로 '곧 하차' 를 울리지 않는다
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
  if (dtInfo) text = rsDtText(dtInfo);
  var done = false, quit = false;
  if (st.arrivedAt && now - st.arrivedAt >= O.doneAfterSec * 1000) { done = true; quit = true; notes.push('목적지 도착 ' + O.doneAfterSec + '초 뒤 종료'); }
  var lastAt = st.lastAt || now; if (now - lastAt > O.maxStaleSec * 1000) done = true;
  st.lastAt = now;
  var moving = !!(r.pos && r.pos.moving), overlay = null;
  // 버스는 네비게이션식 — 엔진이 본 '지금 달리는 중인가'(motion)를 따른다(null 이면 모른다 → 계산 값 유지)
  if (progBus && tk && tk.motion && tk.motion.moving != null) moving = tk.motion.moving === true;
  var nextMs = rsNextMs(st, r, now, O);
  try { overlay = rsOverlay(st, r, curIdx, al.curPos, now, dest, cfg.destName || (dest && dest.name) || '', moving, done); } catch (eOv) { notes.push('오버레이 계산 실패: ' + (eOv && eOv.message)); }
  if (offActive && overlay && overlay.active) { overlay.alert = 0; overlay.pre = false; overlay.banner = '경로를 벗어났어요 — 앱을 열면 다시 찾아 드려요'; }
  if (dtInfo && overlay && overlay.active) { overlay.line2 = rsDtText(dtInfo); overlay.pillTxt = rsDtText(dtInfo); overlay.alert = 0; overlay.pre = false; overlay.moving = true; }
  var reco = { fire: false };
  try { if (!done) reco = rsReco(st, r, dest, cfg.destName || (dest && dest.name) || '', now, offActive); } catch (eRc) { notes.push('추천 판단 실패: ' + (eRc && eRc.message)); }
  var view = { text: text, line1: overlay && overlay.line1 || '', line2: overlay && overlay.line2 || '', curIdx: curIdx, at: now };
  var row = done ? null : rsRowOut(st, now);
  return { v: 1, state: st, ongoing: { title: O.ongoingTitle, text: text }, row: row, alert: al.alert, off: offActive && !done ? rsOffOut(st, now) : undefined, dt: dtInfo && !done ? { n: dtInfo.name, d: dtInfo.distM, s: dtInfo.etaSec, a: dtInfo.arrived ? 1 : 0 } : undefined, done: done, quit: quit, curIdx: curIdx, overlay: overlay, reco: reco, view: view, pos: r.pos ? { from: r.pos.from, to: r.pos.to, ratio: r.pos.ratio, moving: !!r.pos.moving, t0: r.pos.t0 == null ? null : r.pos.t0, t1: r.pos.t1 == null ? null : r.pos.t1, hold: r.pos.hold == null ? undefined : r.pos.hold, segs: (r.pos.segs || []).slice(0, 14) } : null, arr: r.arr || null, zero: zero, nextMs: done ? O.stepMs : nextMs, motion: tk && tk.motion ? tk.motion : null, ask: askBl ? { kind: 'boardlive', body: askBl } : (askRt ? { kind: 'boardlive', body: askRt } : null), notes: notes };
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
    // ★ s192: 같은 때에 서울 실시간 도착정보도 받는다(최대 RS_LIVE_MS) — 받으면 시각표보다 먼저 쓰고, 못 받으면 시각표 그대로
    var pq = typeof ntEnsure === 'function' ? rsPressQuery(body) : null;
    var dq = typeof ntEnsure === 'function' && !pq ? rsDetourQuery(body) : null;        // s229: 역까지 이동으로 역에 닿은 걸음 — 가장 빠른 열차를 시각표에서 한 번 읽는다
    if (dq) return Promise.resolve().then(function () { return ntEnsure(env); }).then(function (nt) { rsAttachDetourTT(body, nt); }, function () { }).then(function () { return run(); }, function () { return run(); });
    if (pq) {
      var pTT = Promise.resolve().then(function () { return ntEnsure(env); }).then(function (nt) { rsAttachPressTT(body, nt); }, function () { });
      var pLV = rsFetchSeoulArrivals(env, pq).then(function (list) { return list; }, function () { return null; });
      return Promise.all([pTT, pLV]).then(function (r) { rsAttachPressLive(body, r[1]); return run(); }, function () { return run(); });
    }
    return run();
  }, function () { return new Response(JSON.stringify({ error: '요청을 읽지 못함' }), { status: 400, headers: H }); });
}

if (typeof module !== 'undefined') module.exports = { rideStandby: rideStandby, rsPressQuery: rsPressQuery, rsDetourQuery: rsDetourQuery, rsAttachDetourTT: rsAttachDetourTT, rsDtTarget: rsDtTarget, rsAttachPressTT: rsAttachPressTT, rsPickMs: rsPickMs, rsPickLive: rsPickLive, rsAttachPressLive: rsAttachPressLive, rsFetchSeoulArrivals: rsFetchSeoulArrivals, rsLegsOf: rsLegsOf, rsXwait: rsXwait, rsWait: rsWait, rsNextMs: rsNextMs, rsResync: rsResync, rsFuse: rsFuse, handleRideStandby: handleRideStandby, rsBlAsk: rsBlAsk, rsBlApply: rsBlApply, rsBlLivePick: rsBlLivePick, rsBlTable: rsBlTable, rsBlReconcile: rsBlReconcile, rsBlBusPick: rsBlBusPick, rsRtPick: rsRtPick, rsRtArm: rsRtArm, rsRtAsk: rsRtAsk, rsRtApply: rsRtApply, rsBoardLive: rsBoardLive, handleBoardLive: handleBoardLive, RS_BL: { STEP_MS: RS_BL_STEP_MS, AHEAD_MAX_MIN: RS_BL_AHEAD_MAX_MIN }, rsSubwayId: rsSubwayId, rsFetchSeoulPath: rsFetchSeoulPath, rsAlerts: rsAlerts, RIDE_STANDBY_DEFAULTS: RIDE_STANDBY_DEFAULTS };
