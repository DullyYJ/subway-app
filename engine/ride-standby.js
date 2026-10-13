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
//           fired: {"노드_남은정거장":1}                    이미 보낸 알림
//           notYet:{노드번호:ms}, etaMs:[…], arrivedAt?, steps }
//       }
// 출력  { v:1, state(갱신본 — 네이티브는 그대로 다음 호출에 보낸다),
//         ongoing:{title,text}      알림창의 상주 알림에 그릴 문구,
//         alert:null|{key,type,title,body,vib:[ms…]}   지금 울릴 알림 하나(같은 순간에 걸린 나머지는 보낸 것으로 처리),
//         done:bool                 안내를 끝내도 된다(목적지 도착 알림 뒤 3분),
//         zero:{…}                  ride-track 영점 결과(진단용), notes:[…] }
//
// 이 파일은 ride-track.js · ride-eta.js 의 rideTrack · rideEta 를 쓴다(Worker 에서는 같은 범위의 함수, Node 시험에서는 require).
var RIDE_STANDBY_DEFAULTS = {
  trailMax: 60,            // 상태에 담는 궤적 점 수
  trailMaxAgeSec: 600,     // 이보다 오래된 점은 버린다
  notYetKeepSec: 45,       // notYet 증거를 유지하는 시간
  doneAfterSec: 180,       // 목적지 도착 알림 뒤 이 시간이 지나면 done
  maxStaleSec: 3 * 3600,   // 상태가 이보다 오래 갱신되지 않았으면 done(안전 장치)
  ongoingTitle: '길동무 경로 안내 중'
};

function rsTrackFn() { return (typeof rideTrack === 'function') ? rideTrack : require('./ride-track').rideTrack; }
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
function rsAlerts(cfg, fired, curIdx, etaMs, now) {
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
  var d = due[0], tg = d.tg, mt = rsMinTxt(etaMs, tg.nodeIdx, now, d.remain), title, body, vib;
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

function rideStandby(req) {
  req = req || {};
  var O = RIDE_STANDBY_DEFAULTS, st = req.state, now = +req.nowMs, notes = [], i;
  if (!st || !st.eta || !isFinite(now)) return { v: 1, error: 'state/nowMs 가 없다', done: true };
  st = rsClone(st);
  st.steps = (st.steps | 0) + 1;
  // 1) 궤적 갱신
  var tr = st.trail = st.trail || [], fx = req.fixes || [];
  for (i = 0; i < fx.length; i++) { var f = fx[i]; if (f && isFinite(f[0]) && isFinite(f[1]) && isFinite(f[2]) && (!tr.length || f[0] > tr[tr.length - 1][0])) tr.push([f[0], f[1], f[2], f[3] == null ? null : f[3]]); }
  while (tr.length && now - tr[0][0] > O.trailMaxAgeSec * 1000) tr.shift();
  if (tr.length > O.trailMax) tr.splice(0, tr.length - O.trailMax);
  // 2) 영점: 정류장 도착 시각을 최신 etaMs 로 맞춰 ride-track 에 묻는다 → 통과 시각(passMs)은 gps 증거로, 아직 안 닿음은 notYet 으로
  var eta = st.eta, passes = (eta.passes = eta.passes || []), notYet = (st.notYet = st.notYet || {});
  var zero = null;
  if (st.stops && st.stops.length && tr.length) {
    var stops = st.stops.map(function (s) { var o = rsClone(s); if (st.etaMs && st.etaMs[s.i] != null) o.arrMs = st.etaMs[s.i]; return o; });
    var tk = rsTrackFn()({ nowMs: now, trail: tr, plan: { pts: [], boarded: eta.boarded !== false && eta.notDeparted !== true, notDeparted: false, stops: stops, subConfirmed: true, suppress: ['standby'] }, want: { zero: true } });
    zero = tk && tk.zero ? tk.zero : null;
    if (zero && zero.stops) {
      zero.stops.forEach(function (z) {
        if (z.passMs != null && isFinite(z.passMs) && z.apply) {
          var hit = -1; for (var k = 0; k < passes.length; k++) if (passes[k].idx === z.i) { hit = k; break; }
          var np = { idx: z.i, ms: z.passMs, src: 'gps' };
          if (hit >= 0) passes[hit] = np; else passes.push(np);
          delete notYet[z.i];
          notes.push('영점 ' + z.i + '번 통과 반영');
        } else if (z.notYet) { notYet[z.i] = now; }
      });
    }
  }
  // 3) 도착 시각 계산
  var nyList = [], nk;
  for (nk in notYet) { if (now - notYet[nk] <= O.notYetKeepSec * 1000) nyList.push(+nk); else delete notYet[nk]; }
  var ein = rsClone(eta); ein.nowMs = now; ein.passes = passes; if (nyList.length && eta.timetableFirst) ein.notYet = nyList; else delete ein.notYet;
  var fired = (st.fired = st.fired || {});
  var r = rsEtaFn()(ein);
  if (!r || !r.etaMs) return { v: 1, state: st, ongoing: { title: O.ongoingTitle, text: '' }, alert: null, done: false, notes: ['도착 시각 계산 실패'] };
  st.etaMs = r.etaMs;
  if (r.delayMin != null) { eta.prevLevelMin = r.delayMin; eta.prevAnchorIdx = r.anchorIdx; }
  // 4) 지금 어느 역까지 왔나 → 알림 판정 · 상주 알림 문구
  var nodes = eta.nodes || [], cfg = st.cfg || {}, curIdx = -1;
  if (r.pos && r.pos.from != null) curIdx = r.pos.from;
  else { for (i = 0; i < nodes.length; i++) if (r.etaMs[i] != null && r.etaMs[i] <= now) curIdx = i; }
  var al = rsAlerts(cfg, fired, curIdx, r.etaMs, now);
  if (al.alert) {
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
  var done = false;
  if (st.arrivedAt && now - st.arrivedAt >= O.doneAfterSec * 1000) { done = true; notes.push('목적지 도착 ' + O.doneAfterSec + '초 뒤 종료'); }
  var lastAt = st.lastAt || now; if (now - lastAt > O.maxStaleSec * 1000) done = true;
  st.lastAt = now;
  return { v: 1, state: st, ongoing: { title: O.ongoingTitle, text: text }, alert: al.alert, done: done, curIdx: curIdx, zero: zero, notes: notes };
}

function handleRideStandby(request) {
  var H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
  if (request.method === 'OPTIONS') return Promise.resolve(new Response(null, { status: 204, headers: H }));
  if (request.method !== 'POST') return Promise.resolve(new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: H }));
  return request.json().then(function (body) {
    var out;
    try { out = rideStandby(body); } catch (e) { return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500, headers: H }); }
    return new Response(JSON.stringify(out), { headers: H });
  }, function () { return new Response(JSON.stringify({ error: 'JSON 아님' }), { status: 400, headers: H }); });
}

if (typeof module !== 'undefined') module.exports = { rideStandby: rideStandby, handleRideStandby: handleRideStandby, rsAlerts: rsAlerts, RIDE_STANDBY_DEFAULTS: RIDE_STANDBY_DEFAULTS };
