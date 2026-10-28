// 길동무 — 탑승 시작(경로 확정) 엔진 (route-v2 Worker 에 붙여 넣는 순수 함수)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."  (2026-10-20 s94 — 4번 탑승 추적)
//   예전엔 웹이 경로 화면을 짓는 중에 만든 노드 목록(_transitNodeData)·도착시각 증거(_etaPayload)·영점용 정류장(_arrEndStops)·알림 대상(_buildTransitAlertTargets)을
//   네이티브 대기 모드(KeepAliveService)에 '여정 상태'로 맡겼다. 웹이 없는 앱에서는 그 상태를 엔진이 직접 만든다.
//   앱은 지금 보고 있는 경로 응답(받은 그대로)과 눌린 탭을 보내고, 돌아온 state 를 그대로 들고 있다가 5초마다 /ride-standby 에 실어 보낸다(해석하지 않는다).
//
// 입력  rideStart({ cap(12 이상) }, r)    r = 결과 화면 사실과 같다: { data(경로 응답 그대로), tab, a, b, bt, rb, now, tz, th, allowed? }
// 출력  { ok:true, v:1, state(/ride-standby 의 state), info:{ n(노드 수), first:{name,hm}, dest, tab, legs }, text(처음 보일 상주 알림 글) }
//       | { ok:false, error:'route'|'longdist'|'notimes'|…, msg(사용자에게 보일 글) }
// 1단계 범위: 지하철·버스 구간(장거리 열차·버스는 안내하지 않는다). 탑승 확정은 사용자가 누르는 시점에 이미 탔다고 본다(승차 전 대기 판정은 하지 않는다).
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var RST_V = 1;

function rstDeps() {
  var d = {};
  d.apply = (typeof resApplyRv === 'function') ? resApplyRv : require('./result').resApplyRv;
  d.pick = (typeof resPickTabs === 'function') ? resPickTabs : require('./result').resPickTabs;
  d.conv = (typeof resConvertPath === 'function') ? resConvertPath : require('./result').resConvertPath;
  d.facts = (typeof resTrkFacts === 'function') ? resTrkFacts : require('./result').resTrkFacts;
  d.prep = (typeof rheadTrkPrep === 'function') ? rheadTrkPrep : require('./rhead').rheadTrkPrep;
  d.points = (typeof rheadTrkPoints === 'function') ? rheadTrkPoints : require('./rhead').rheadTrkPoints;
  d.targets = (typeof raTargets === 'function') ? raTargets : require('./ride-alert').raTargets;
  return d;
}
function rstHash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function rstHmMin(hm) { var m = String(hm || '').match(/(\d{1,2}):(\d{2})/); return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null; }
function rstFail(error, msg) { return { ok: false, error: error, msg: msg }; }

// 떠 있는 안내(오버레이)가 그릴 칸 틀: 정류장 이름 · 도착 시각 · 노선 라벨(첫 칸·환승 칸) · 점과 선 색 · 이동 중 문구 · 테마 색.
//   색·점 모양·라벨은 엔진이 정한다(앱 경로 화면의 타임라인과 같은 규칙: 지나는 칸 속 빈 점, 출발·도착 꽉 찬 점, 환승 칸은 노선 배지).
function rstOvl(pts, th) {
  var last = pts.length - 1;
  var cells = pts.map(function (p, q) {
    var nm = String(p.nm || '').slice(0, 24), lbl = String(p.lineLabel || p.lineNm || '').slice(0, 12), col = String(p.col || '#8e8e93');
    var c = { n: nm, t: String(p.arrT || ''), m: nm ? nm + ' (이동중)' : '', dk: (q === 0 || q === last) ? 2 : 1, dc: col };
    if (q > 0) c.lc = String(p.lC || col);
    if (q < last) c.rc = col;
    if (lbl && (q === 0 || p.xfIn)) { c.g = (q === 0 ? '' : '↔ ') + lbl; c.gp = q !== 0; c.gc = col; }
    return c;
  });
  return { cells: cells, map: pts.map(function (p, q) { return q + 1; }), base: 0,
    theme: th === 'pastel' ? { bg: '#ffffff', fg: '#1a2533', sub: '#6b8299' } : { bg: '#1c1c1e', fg: '#f2f2f7', sub: '#8e8e93' } };
}

function rideStart(opt, r) {
  var cap = Math.floor(Number(opt && opt.cap) || 0);
  if (cap < 12) return rstFail('cap', '앱을 업데이트해 주세요');
  r = (r && typeof r === 'object') ? r : {};
  var D = rstDeps();
  var data = (r.data && typeof r.data === 'object') ? r.data : {};
  var raw = ((data.result || {}).path);
  raw = Array.isArray(raw) ? raw : [];
  var pick = D.pick(D.apply(data, raw));
  var tab = ['fast', 'less', 'sub', 'bus', 'longdist'].indexOf(r.tab) >= 0 ? r.tab : 'fast';
  var route = pick[tab] ? D.conv(pick[tab]) : null;
  if (!route) return rstFail('route', '경로 정보가 없어요');
  if (tab === 'longdist' || route.ld) return rstFail('longdist', '장거리 경로는 탑승 안내를 지원하지 않아요');
  var tz = isFinite(Number(r.tz)) ? Number(r.tz) : 540, now = Number(r.now);
  if (!isFinite(now) || now <= 0) return rstFail('now', '시각을 알 수 없어요');
  var tf = D.facts(route, r, false);
  var pp = D.prep(tf);
  if (pp.error) return rstFail(pp.error, '이 경로는 시각 정보가 없어 안내할 수 없어요');
  var pts = D.points(pp.facts).filter(function (p) { return p.type === 'stn' && !p.ld; });
  if (pts.length < 2) return rstFail('nopoints', '안내할 정류장이 부족해요');
  // ★ s265 (YJ: 같은 구간을 가는 버스가 여러 번호일 때 사용자가 고른 번호로): 팝업에서 고른 번호(r.pick.no)가 경로가 알려 준 대체 번호(첫 버스 구간의 altBus)에 있으면
  //   첫 버스 구간의 노선 번호를 그 번호로 바꿔 안내한다(실시간 도착을 그 번호로 따라가고, 오버레이·타임라인에도 그 번호가 보인다). 시간은 경로의 것을 그대로 쓴다(같은 정류장 사이를 가는 버스).
  var pickNo = (r.pick && typeof r.pick === 'object' && r.pick.no != null) ? String(r.pick.no).replace(/\s+/g, '').slice(0, 14) : '';
  var firstAlts = [], firstEnds = {};
  try {
    var rawSub0 = (pick[tab] && Array.isArray(pick[tab].subPath)) ? pick[tab].subPath : [], fs0 = null, q0;
    for (q0 = 0; q0 < rawSub0.length; q0++) { var s0 = rawSub0[q0]; if (s0 && (s0.trafficType === 1 || s0.trafficType === 2 || s0.trafficType === 4)) { fs0 = s0; break; } }
    if (fs0 && fs0.trafficType === 2 && fs0.altEnd && typeof fs0.altEnd === 'object') {      // s293b: 대체 번호마다 내리는 곳(정류장 이름 · 계획 하차 지점에서 m · 좌표) — 환승역은 번호마다 출구가 다를 수 있다
      Object.keys(fs0.altEnd).slice(0, 6).forEach(function (kk) {
        var e0 = fs0.altEnd[kk], no0 = String(kk).replace(/\s+/g, '').slice(0, 14);
        if (!no0 || !e0 || typeof e0 !== 'object') return;
        var d0 = Number(e0.d), la0 = Number(e0.la), lo0 = Number(e0.lo);
        firstEnds[no0] = { n: String(e0.n == null ? '' : e0.n).slice(0, 24), d: isFinite(d0) && d0 >= 0 && d0 <= 400 ? Math.round(d0) : 0, la: isFinite(la0) && Math.abs(la0) <= 90 ? la0 : null, lo: isFinite(lo0) && Math.abs(lo0) <= 180 ? lo0 : null };
      });
    }
    if (fs0 && fs0.trafficType === 2 && Array.isArray(fs0.altBus)) firstAlts = fs0.altBus.map(function (x) { return String(x).replace(/\s+/g, ''); }).filter(function (x) { return x.length > 0 && x.length <= 14; }).slice(0, 6);
  } catch (eA) { firstAlts = []; }
  var planNo = pts[0].sty === 2 ? String(pts[0].lineNm || '') : '';
  var renamed = false, endSwap = null;
  if (pickNo && planNo && pickNo !== planNo && firstAlts.indexOf(pickNo) >= 0) {
    var endK = -1;
    for (k = 0; k < pts.length; k++) {
      if (pts[k].sty !== 2 || String(pts[k].lineNm || '') !== planNo) break;           // 첫 버스 구간(같은 번호로 이어지는 칸)까지만
      pts[k].lineNm = pickNo; if (pts[k].lineLabel != null) pts[k].lineLabel = pickNo;
      renamed = true; endK = k;
    }
    // s293b (YJ: 환승역이면 탈 수 있는 버스마다 내리는 출구가 다르다): 고른 번호가 계획과 다른 정류장(40m 넘게)에서 내려 주면 하차 칸의 이름·좌표를 그 정류장으로 바꾼다 — 하차 알림·영점이 그 정류장 기준이 된다.
    //   시각은 계획 그대로(같은 구간 다른 번호) — 내린 뒤 걷는 거리 차이는 알 수 없어 시각표는 건드리지 않는다(알림 글에 정류장 이름이 나온다).
    var en = firstEnds[pickNo];
    if (endK >= 0 && en && en.n && (en.d >= 40 || en.n !== pts[endK].nm) && en.la != null && en.lo != null) {
      endSwap = { n: en.n, d: en.d, from: pts[endK].nm };
      pts[endK].nm = en.n; pts[endK].la = en.la; pts[endK].lo = en.lo;
    }
  }

  var aName = String(r.a || '').slice(0, 40), bName = String(r.b || '').slice(0, 40);
  var nodes = [{ name: aName || '출발', isOrigin: true }], tnodes = [{ k: null }], stops = [], etaMs = [null], prevMin = null, last = pts.length - 1, i, k;
  for (k = 0; k < pts.length; k++) {
    var p = pts[k], idx = k + 1, pm = rstHmMin(p.arrT);
    if (pm != null) { if (prevMin != null && pm < prevMin) pm += 1440; prevMin = pm; }      // 자정을 넘기는 경로
    nodes.push({ name: p.nm, isSub: p.sty === 1, isBus: p.sty === 2, lineName: String(p.lineNm || ''), planMin: pm });
    tnodes.push({ k: p.sty === 1 ? 's' : 'b', l: String(p.lineNm || ''), n: p.nm });
    var ms = (p.ms != null && isFinite(p.ms)) ? Math.round(p.ms) : null;
    etaMs.push(ms);
    if (p.la != null && p.lo != null && ms != null) stops.push({ i: idx, lat: p.la, lng: p.lo, arrMs: ms, pass: k > 0, fin: k === last, bus: p.sty === 2 });
  }
  if (stops.length < 2) return rstFail('nocoords', '정류장 위치를 알 수 없어요');
  var tg = D.targets(tnodes);
  var dest = bName || pts[last].nm;
  // ★ s196: 첫 구간이 버스면 승차 대기 중 실시간 재보정(/board-live)이 정류장을 바로 알 수 있게 도시코드·정류장 ID 를 싣는다(경로 응답의 첫 대중교통 구간 boardCc · boardStopId).
  var firstBl = null;
  try {
    var rawSub = (pick[tab] && Array.isArray(pick[tab].subPath)) ? pick[tab].subPath : [], fsp = null, qq;
    for (qq = 0; qq < rawSub.length; qq++) { var sp0 = rawSub[qq]; if (sp0 && (sp0.trafficType === 1 || sp0.trafficType === 2 || sp0.trafficType === 4)) { fsp = sp0; break; } }
    if (fsp && fsp.trafficType === 2 && fsp.boardStopId) { var cc0 = String(fsp.boardCc || fsp.line || '').split('_')[0]; if (/^[0-9]{2,5}$/.test(cc0)) firstBl = { kind: 'bus', i: 1, cc: cc0, sid: String(fsp.boardStopId) }; }
  } catch (eBl) { firstBl = null; }
  // ★ s200 (YJ: 첫 구간이 버스면 10분 안에 오는 버스를 팝업으로 골라 타게): 앱이 고른 버스의 도착 시각(ms). 승차 대기 중 실시간 재보정(/board-live)이 그 차를 따라간다.
  var pickMs = (r.pick && typeof r.pick === 'object' && isFinite(Number(r.pick.ms))) ? Math.round(Number(r.pick.ms)) : null;
  if (firstBl && pickMs != null && Math.abs(pickMs - now) <= 30 * 60000) firstBl.pickMs = pickMs;
  if (firstBl && firstAlts.length) firstBl.alts = firstAlts;                                  // s265: 같은 구간을 가는 다른 번호들(팝업이 쓴다)
  if (firstBl && Object.keys(firstEnds).length) firstBl.ends = firstEnds;                      // s293b: 대체 번호별 내리는 곳(선택창이 '○○ 하차'를 보인다)
  if (firstBl && renamed) firstBl.no = pickNo;
  if (firstBl && endSwap) firstBl.endSwap = endSwap;
  var firstSub = pts[0].sty === 1, passes = [];
  if (etaMs[1] != null && now >= etaMs[1]) passes.push({ idx: 1, ms: etaMs[1], src: 'gps' });      // 첫 정류장 시각이 이미 지났다면 지난 것으로
  var eta = { nodes: nodes, passes: passes, boarded: true, notDeparted: false, tzOffsetMin: tz };
  if (firstSub) { eta.timetableFirst = true; eta.boardInfo = { boardIdx: 1, line: String(pts[0].lineNm || ''), from: pts[0].nm, to: pts[1] ? pts[1].nm : '' }; }
  var allowed = (r.allowed && typeof r.allowed === 'object') ? r.allowed : {};
  var sig = rstHash(nodes.map(function (n) { return n.name + '|' + (n.lineName || ''); }).join('>') + '@' + Math.floor(now / 3600000));
  var state = { v: 1, tripSig: sig, eta: eta, stops: stops, trail: [], cfg: { targets: tg.targets, seq: tg.seq, allowed: allowed, destName: dest, waitBoard: r.wait !== false, bl: firstBl, pfLive: r.pf === true }, fired: {}, notYet: {}, etaMs: etaMs, steps: 0, startedAt: now,
    ovl: rstOvl(pts, r.th) };   // 떠 있는 안내(오버레이)가 그릴 칸 틀: 정류장 이름 · 도착 시각
  var legs = 0; for (i = 1; i < tnodes.length; i++) if (i === 1 || tnodes[i].l !== tnodes[i - 1].l) legs++;
  return { ok: true, v: RST_V, state: state, text: '다음 ' + pts[0].nm + (pts[0].arrT ? ' ' + pts[0].arrT : '') + ' · ' + dest + '까지 ' + (tg.seq.length ? tg.seq.length - 1 : 0) + '정거장',
    info: { n: nodes.length, first: { name: pts[0].nm, hm: pts[0].arrT || '' }, dest: dest, tab: tab, legs: legs, sig: sig } };
}

// ── ★ s200 첫 구간이 버스일 때 '10분 안에 오는 버스' 고르기 ──
//   rideBusAsk(opt, r)   : 이 경로의 첫 대중교통 구간이 버스면 { cc, sid, no, stop } (도시코드 · 정류장 ID · 노선 번호 · 정류장 이름), 아니면 null. 시작 엔진과 같은 계산을 쓴다.
//   rideBusItems(list, nowMs) : 정류장 도착정보(초 목록)에서 10분 안에 오는 차를 빠른 순 최대 4대로 — [{ sec, ms }]
var RST_PICK_MAX_SEC = 600, RST_PICK_MAX_N = 4;
function rideBusAsk(opt, r) {
  var s = rideStart(opt, r);
  if (!s || !s.ok || !s.state || !s.state.cfg) return null;
  var b = s.state.cfg.bl;
  if (!b || b.kind !== 'bus' || !b.cc || !b.sid) return null;
  var nd = s.state.eta && s.state.eta.nodes ? s.state.eta.nodes[b.i] : null;
  var no = nd && nd.isBus ? String(nd.lineName || '') : '';
  if (!no) return null;
  var nds = s.state.eta.nodes, ek = b.i, end = nd.name ? String(nd.name) : '';      // s293c: 내 번호가 내리는 곳(첫 버스 구간의 마지막 칸 이름)
  while (nds[ek + 1] && nds[ek + 1].isBus && String(nds[ek + 1].lineName || '') === no) ek++;
  if (nds[ek] && nds[ek].name) end = String(nds[ek].name);
  return { cc: String(b.cc), sid: String(b.sid), no: no, stop: nd.name ? String(nd.name) : '', end: end, alts: Array.isArray(b.alts) ? b.alts.slice(0, 6) : [], ends: (b.ends && typeof b.ends === 'object') ? b.ends : {} };
}
function rideBusItems(list, nowMs) {
  var out = [], k, n = Number(nowMs);
  if (!Array.isArray(list) || !isFinite(n)) return out;
  var s = list.map(Number).filter(function (v) { return isFinite(v) && v > 0 && v <= RST_PICK_MAX_SEC; }).sort(function (a, b) { return a - b; });
  for (k = 0; k < s.length && out.length < RST_PICK_MAX_N; k++) out.push({ sec: Math.round(s[k]), ms: Math.round(n + s[k] * 1000) });
  return out;
}
// s265 (YJ: 같은 곳으로 가는 버스가 여러 번호면 팝업에서 고르게): 정류장 도착정보 맵(번호 → 초 목록)에서 내 번호 + 대체 번호들의 10분 안 도착을 번호마다 가장 빠른 2대씩 모아
//   빠른 순 최대 6줄 — [{ no, sec, ms }]. noOf(번호) = 도착정보 맵의 열쇠 규칙(숫자만 남기기 등)을 워커가 넘긴다(없으면 번호 그대로).
function rideBusItemsMulti(map, nos, nowMs, noOf) {
  var out = [], seen = {}, k;
  if (!map || typeof map !== 'object' || !Array.isArray(nos)) return out;
  for (k = 0; k < nos.length; k++) {
    var no = String(nos[k] || ''); if (!no || seen[no]) continue; seen[no] = 1;
    var list = map[no] || (typeof noOf === 'function' ? map[noOf(no)] : null);
    rideBusItems(list, nowMs).slice(0, 2).forEach(function (it) { out.push({ no: no, sec: it.sec, ms: it.ms }); });
  }
  out.sort(function (a, b) { return a.sec - b.sec; });
  return out.slice(0, 6);
}

if (typeof module !== 'undefined' && module.exports) module.exports = { rideStart: rideStart, RST_V: RST_V, rideBusAsk: rideBusAsk, rideBusItems: rideBusItems, rideBusItemsMulti: rideBusItemsMulti };
