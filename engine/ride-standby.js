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
// 출력  { v:1, state(갱신본 — 네이티브는 그대로 다음 호출에 보낸다),
//         ongoing:{title,text}      알림창의 상주 알림에 그릴 문구,
//         alert:null|{key,type,title,body,vib:[ms…]}   지금 울릴 알림 하나(같은 순간에 걸린 나머지는 보낸 것으로 처리),
//         done:bool                 안내를 끝내도 된다(목적지 도착 알림 뒤 3분),
//         overlay:null|{…}          네이티브 오버레이에 그릴 값(OverlayPlugin.update 와 같은 모양 — state.ovl 그림 틀이 있을 때만),
//         view:{text,line1,line2,curIdx,at}   앱을 다시 열었을 때 보여 줄 마지막 상태,
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
  var rs = arrived ? { st: 'board', bt: '안내 종료', k: '목적지에 도착했어요', ch: '도착', nm: destName || '', bar: -1, cbg: '', cfg: '#0a84ff' } : { st: 'hidden' };
  var out = { active: true, line1: line1, pill: pill, track: [], cur: cur, base: ov.base || 0, line2: line2, line3: '', alert: arrived ? 0 : lv, alertAt: oa.at || 0, alertVibe: false, banner: banner, destName: destName || '', pre: !arrived && pre === 1, moving: !!moving, rs: rs, reco: { on: false }, cells: cells };
  if (ov.theme) out.theme = ov.theme;
  return out;
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
  if (rsResync(st, now, notes)) newPass = true;   // 2.5) 버스: 오래 끊겼던 GPS 가 돌아오면 앞쪽 정류장 통과로 다시 맞춘다(시각표 기준 여정은 시각표가 이어가므로 해당 없음)
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
  if (offActive) text = '경로를 벗어났어요 · 앱을 열면 다시 찾아 드려요';
  var done = false;
  if (st.arrivedAt && now - st.arrivedAt >= O.doneAfterSec * 1000) { done = true; notes.push('목적지 도착 ' + O.doneAfterSec + '초 뒤 종료'); }
  if (offActive && st.offOn && now - st.offOn >= O.offGiveUpSec * 1000) { done = true; notes.push('경로를 벗어난 채 ' + O.offGiveUpSec + '초 — 안내 종료'); }
  var lastAt = st.lastAt || now; if (now - lastAt > O.maxStaleSec * 1000) done = true;
  st.lastAt = now;
  var moving = !!(r.pos && r.pos.moving), overlay = null;
  // 버스는 네비게이션식 — 엔진이 본 '지금 달리는 중인가'(motion)를 따른다(null 이면 모른다 → 계산 값 유지)
  if (progBus && tk && tk.motion && tk.motion.moving != null) moving = tk.motion.moving === true;
  var nextMs = rsNextMs(st, r, now, O);
  try { overlay = rsOverlay(st, r, curIdx, al.curPos, now, dest, cfg.destName || (dest && dest.name) || '', moving, done); } catch (eOv) { notes.push('오버레이 계산 실패: ' + (eOv && eOv.message)); }
  if (offActive && overlay && overlay.active) { overlay.alert = 0; overlay.pre = false; overlay.banner = '경로를 벗어났어요 — 앱을 열면 다시 찾아 드려요'; }
  var view = { text: text, line1: overlay && overlay.line1 || '', line2: overlay && overlay.line2 || '', curIdx: curIdx, at: now };
  return { v: 1, state: st, ongoing: { title: O.ongoingTitle, text: text }, alert: al.alert, done: done, curIdx: curIdx, overlay: overlay, view: view, zero: zero, nextMs: done ? O.stepMs : nextMs, motion: tk && tk.motion ? tk.motion : null, notes: notes };
}

function handleRideStandby(request) {
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
    try { out = rideStandby(body); } catch (e) { return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500, headers: H }); }
    return new Response(JSON.stringify(out), { headers: H });
  }, function () { return new Response(JSON.stringify({ error: '요청을 읽지 못함' }), { status: 400, headers: H }); });
}

if (typeof module !== 'undefined') module.exports = { rideStandby: rideStandby, rsNextMs: rsNextMs, rsResync: rsResync, handleRideStandby: handleRideStandby, rsAlerts: rsAlerts, RIDE_STANDBY_DEFAULTS: RIDE_STANDBY_DEFAULTS };
