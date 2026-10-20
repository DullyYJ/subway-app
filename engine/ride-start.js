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
  var firstSub = pts[0].sty === 1, passes = [];
  if (etaMs[1] != null && now >= etaMs[1]) passes.push({ idx: 1, ms: etaMs[1], src: 'gps' });      // 첫 정류장 시각이 이미 지났다면 지난 것으로
  var eta = { nodes: nodes, passes: passes, boarded: true, notDeparted: false, tzOffsetMin: tz };
  if (firstSub) { eta.timetableFirst = true; eta.boardInfo = { boardIdx: 1, line: String(pts[0].lineNm || ''), from: pts[0].nm, to: pts[1] ? pts[1].nm : '' }; }
  var allowed = (r.allowed && typeof r.allowed === 'object') ? r.allowed : {};
  var sig = rstHash(nodes.map(function (n) { return n.name + '|' + (n.lineName || ''); }).join('>') + '@' + Math.floor(now / 3600000));
  var state = { v: 1, tripSig: sig, eta: eta, stops: stops, trail: [], cfg: { targets: tg.targets, seq: tg.seq, allowed: allowed, destName: dest }, fired: {}, notYet: {}, etaMs: etaMs, steps: 0, startedAt: now };
  var legs = 0; for (i = 1; i < tnodes.length; i++) if (i === 1 || tnodes[i].l !== tnodes[i - 1].l) legs++;
  return { ok: true, v: RST_V, state: state, text: '다음 ' + pts[0].nm + (pts[0].arrT ? ' ' + pts[0].arrT : '') + ' · ' + dest + '까지 ' + (tg.seq.length ? tg.seq.length - 1 : 0) + '정거장',
    info: { n: nodes.length, first: { name: pts[0].nm, hm: pts[0].arrT || '' }, dest: dest, tab: tab, legs: legs, sig: sig } };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { rideStart: rideStart, RST_V: RST_V };
