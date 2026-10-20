// 길동무 — 홈 '경로 결과' 화면 엔진 (route-v2 Worker 에 붙여 넣는 순수 함수; 단일 출처)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 엔진이 계산한 그림만 그린다."  (2026-10-20 s87 — 웹 제거 · 순수 네이티브)
//   예전엔 www/index.html 의 _convertEngineRoutes · _normStop · _parseRouteOptions(탭 고르기) · _renderTransitResultCard 의 사실 모으기가
//   경로 응답(/route-v2-app)을 결과 카드용 구조로 바꾸고, 탭마다 대표 경로를 고르고, 머리줄·탭 줄·구간 타임라인에 줄 '사실'을 모았다.
//   이제 앱은 받은 경로 응답 글을 '그대로' 보내고(가공하지 않는다), 엔진이 전부 하여 화면 노드를 내려 준다. 글·색·순서·단추는 engine/rhead.js 가 정한다.
//
// 입력  resultScreen({ cap }, r)
//        cap = 앱이 그릴 수 있는 화면 규격 수준(12 이상: 머리줄 rhd 10 · 타임라인 trk+마커 12)
//        r   = { data: 경로 응답(/route-v2-app 이 준 JSON 그대로), tab: 'fast'|'less'|'sub'|'bus'|'longdist'(눌린 탭; 없으면 'fast'),
//                a, b: 출발/도착 이름, bt: 사용자가 정한 기준시각 ms|null, rb: 이번 탐색이 나간 시각 ms|null, now: 기기 시계 ms, tz: 기기 시간대(동쪽 분), th: 'dark'|'pastel', fav: 0|1 }
// 출력  { ok, v:1, screen:'result', cover:'chips', head:[], body:[결과 카드 panel], info:{has:{fast,less,sub,bus,longdist}, tab, m(총 소요 분), n(경로 수)}, rev } — body 는 홈 화면 본문 뒤에 이어 붙인다.
//        누름: rh.fav · rh.close · rh.tab.<종류> · rh.ld.<m|g>.<번호> (rhead.js 와 같다)
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var RESULT_V = 1;
var RESULT_TABS = ['fast', 'less', 'sub', 'bus', 'longdist'];
var rheadScreen_; if (typeof rheadScreen === 'undefined') { try { if (typeof require === 'function') rheadScreen_ = require('./rhead').rheadScreen; } catch (eRq) {} } else rheadScreen_ = rheadScreen;

function resNum(v, d) { v = Number(v); return isFinite(v) ? v : d; }
function resArr(v) { return Array.isArray(v) ? v : []; }

// 예전 웹 _normStop 과 같다: 정류장 한 곳의 이름·좌표·누적 초·시각을 한 모양으로.
function resNormStop(sv) {
  if (!sv) return { stationName: '', lat: null, lon: null };
  var o = { stationName: (sv.stationName || sv.name || ''),
            lat: (sv.y != null ? sv.y : (sv.lat != null ? sv.lat : null)),
            lon: (sv.x != null ? sv.x : (sv.lon != null ? sv.lon : (sv.lng != null ? sv.lng : null))) };
  var sec = null;
  if (sv.secFromStart != null) sec = parseFloat(sv.secFromStart);
  else if (sv.travelSec != null) sec = parseFloat(sv.travelSec);
  else if (sv.sec != null) sec = parseFloat(sv.sec);
  if (sec != null && isFinite(sec) && sec >= 0) o.secFromStart = sec;
  if (sv.pass) o.pass = true;
  var tv = (sv.arrTime != null ? sv.arrTime : (sv.arrivalTime != null ? sv.arrivalTime : sv.time));
  if (tv != null && tv !== '') {
    if (typeof tv === 'string' && /^\d{1,2}:\d{2}$/.test(tv)) o.arrTime = tv;
    else { var mn = parseFloat(tv); if (isFinite(mn) && mn >= 0) o.arrMin = mn; }
  }
  return o;
}

// 예전 웹 _convertSinglePathToRoute 와 같다: 경로 하나 → { summary, sections, why, rvSplit, transfers, ld }.  교통 구간이 없으면 null.
function resConvertPath(path) {
  if (!path || typeof path !== 'object') return null;
  var info = path.info || {};
  var sections = resArr(path.subPath).map(function (sp) {
    sp = sp || {};
    var tt = sp.trafficType, lane = (resArr(sp.lane)[0]) || {};
    var stops = resArr((sp.passStopList || {}).stations).map(resNormStop);
    return {
      transportation: { type: tt, name: tt === 1 ? (lane.name || lane.subwayCode || '') : tt === 2 ? (lane.busNo || lane.busID || '') : tt === 4 ? (lane.name || '') : '도보' },
      duration: (sp.sectionTime || 0) * 60, distance: sp.distance || 0,
      waitSec: (sp.waitSec != null ? sp.waitSec : null), arriveSec: (sp.arriveSec != null ? sp.arriveSec : null),
      startSec: (sp.startSec != null ? sp.startSec : null), endSec: (sp.endSec != null ? sp.endSec : null),
      stopSec: (Array.isArray(sp.stopSec) ? sp.stopSec.slice() : null),
      boardStopId: (sp.boardStopId || null), waitReal: !!sp.waitReal, waitLive: !!sp.waitLive,
      trainChanges: (Array.isArray(sp.trainChanges) ? sp.trainChanges : null),
      xpWaitSec: (sp.xpWaitSec != null ? sp.xpWaitSec : null),
      xfer: (sp.xfer || null), exitFast: (sp.exitFast || null), stnName: (sp.endName || sp.startName || ''),
      xferWaitSec: (sp.xferWaitSec != null ? sp.xferWaitSec : null), waitEstimated: !!sp.waitEstimated,
      ttWaitMs: (sp.ttWaitMs != null ? sp.ttWaitMs : null), nextTrain: (sp.nextTrain || null),
      passStopList: stops.length ? { stationList: stops } : null
    };
  });
  var has = sections.some(function (s) { var t = s.transportation.type; return t === 1 || t === 2 || t === 4; });
  if (!has) return null;
  return {
    summary: { duration: (info.totalTime || 0) * 60, distance: info.totalDistance || 0, transfers: info.transferCount || 0 },
    sections: sections,
    why: (typeof info._rvWhy === 'string') ? info._rvWhy : '',
    rvSplit: info._rvSplit || null,
    transfers: (Array.isArray(info.transfers) ? info.transfers : null),
    ld: info.longDist ? { mode: info.ldMode || null, grade: info.ldGrade || null, depTs: info.ldDepTs != null ? info.ldDepTs : null,
      options: info.ldOptions || [], noWaitMin: info.ldNoWaitMin != null ? info.ldNoWaitMin : null, fastRide: info.ldFastRide || null,
      candidates: info.candidates || [], distKm: info.distKm != null ? info.distKm : null } : null
  };
}

// 엔진이 정리해 준 result.rv 를 경로에 붙인다(예전 웹 _rvApply). 이상하면 원래 순서 그대로.
function resApplyRv(data, paths) {
  var rv = data && data.result && data.result.rv;
  if (!(rv && rv.v === 1 && rv.n === paths.length && Array.isArray(rv.keep) && rv.keep.length && rv.tabs && rv.why && rv.split)) return paths.slice();
  var seen = {}, out = [], i;
  for (i = 0; i < rv.keep.length; i++) {
    var k = rv.keep[i];
    if (!(typeof k === 'number' && k >= 0 && k < paths.length && Math.floor(k) === k) || seen[k] || !paths[k] || !paths[k].info) return paths.slice();
    seen[k] = true;
    if (!Array.isArray(rv.tabs[k]) || typeof rv.why[k] !== 'string') return paths.slice();
  }
  for (i = 0; i < rv.keep.length; i++) {
    var p = paths[rv.keep[i]], inf = p.info, sp = rv.split[rv.keep[i]];
    inf._tabs = rv.tabs[rv.keep[i]].slice();
    inf._rvWhy = rv.why[rv.keep[i]];
    inf._rvSplit = (sp && typeof sp === 'object' && isFinite(sp.ride) && isFinite(sp.wait) && isFinite(sp.walk) && isFinite(sp.tot) && typeof sp.text === 'string') ? sp : null;
    out.push(p);
  }
  return out;
}

// 탭마다 대표 경로(예전 웹 _parseRouteOptions 의 '엔진이 탭을 정해 준' 쪽). 탭 표시가 없는 옛 응답이면 첫 경로가 최단시간.
function resPickTabs(paths) {
  var byTab = {}, any = false;
  paths.forEach(function (p) {
    var inf = p.info || {}, tabs = (inf._tabs && inf._tabs.length) ? inf._tabs : (inf.tab ? [inf.tab] : []);
    tabs.forEach(function (tb) { if (!byTab[tb]) byTab[tb] = p; });
  });
  var ld = paths.filter(function (p) { var inf = p.info || {}, t = (inf._tabs && inf._tabs.length) ? inf._tabs : (inf.tab ? [inf.tab] : []); return t.indexOf('longdist') >= 0 || inf.longDist === true; })[0] || null;
  any = !!(byTab.fast || byTab.less || byTab.sub || byTab.bus);
  var first = paths[0] || null;
  if (any) return { fast: byTab.fast || byTab.less || first, less: byTab.less || byTab.direct || byTab.fast || first, sub: byTab.sub || null, bus: byTab.bus || byTab.direct || null, longdist: byTab.longdist || ld || null };
  var local = paths.filter(function (p) { return p !== ld; });
  return { fast: local[0] || first, less: local[0] || first, sub: null, bus: null, longdist: ld };
}

function resR5(v) { return (v == null || !isFinite(v)) ? null : Math.round(Number(v) * 1e5) / 1e5; }

// 머리줄 사실 (rhead part 'h')
function resHeadFacts(route, r, tab) {
  var f = { m: 0, a: String(r.a || ''), b: String(r.b || ''), fav: r.fav === 0 ? 0 : 1, sp: null, why: '', dx: [], ex: null, xs: [], u: 0, nr: '' };
  if (!route) { f.nr = tab; return f; }
  f.m = Math.round(resNum(route.summary.duration, 0) / 60);
  var rs = route.rvSplit;
  if (route.why !== undefined && rs && rs.tot === f.m) f.sp = { ride: rs.ride, wait: rs.wait, walk: rs.walk };
  f.why = route.why ? String(route.why) : '';
  resArr(route.transfers).slice(0, 8).forEach(function (t) {
    if (t) f.xs.push({ kind: t.kind, at: t.at, walkMin: t.walkMin, boardAt: t.boardAt, toType: t.toType, toLine: t.toLine, fromType: t.fromType, fromLine: t.fromLine, service: t.service });
  });
  var secs = route.sections || [], i;
  secs.forEach(function (sc) {
    var x = sc && sc.xfer;
    if (x && x.dropCar && x.dropDoor && x.boardCar && x.boardDoor && f.dx.length < 8) f.dx.push({ s: sc.stnName, dc: x.dropCar, dd: x.dropDoor, bc: x.boardCar, bd: x.boardDoor, to: x.to, secs: x.secs });
  });
  for (i = secs.length - 1; i >= 0; i--) {
    var e = secs[i] && secs[i].exitFast;
    if (e && e.length) { f.ex = { s: secs[i].stnName, l: e.slice(0, 6).map(function (q) { return { fac: q && q.fac, door: q && q.door }; }) }; break; }
  }
  return f;
}

// 구간 타임라인 사실 (rhead part 'k')
function resTrkFacts(route, r, noGeo) {
  var secs = route.sections.slice(0, 12).map(function (sec) {
    sec = sec || {};
    var tr = sec.transportation || {}, ps = sec.passStopList || {}, stops = ps.stationList || ps.stations || [];
    return { ty: tr.type || 3, nm: tr.name || '', du: sec.duration || 0, di: sec.distance || 0, ws: sec.waitSec, ar: sec.arriveSec, ss: sec.startSec, es: sec.endSec,
      sts: Array.isArray(sec.stopSec) ? sec.stopSec : null, tw: sec.ttWaitMs, we: sec.waitEstimated ? 1 : 0,
      tc: Array.isArray(sec.trainChanges) ? sec.trainChanges.slice(0, 8).map(function (c) { return c ? { at: c.at, to: c.to } : null; }).filter(Boolean) : null,
      st: stops.slice(0, 150).map(function (q) { q = q || {}; return noGeo ? [q.stationName || ''] : [q.stationName || '', resR5(q.lat != null ? q.lat : q.y), resR5(q.lon != null ? q.lon : (q.lng != null ? q.lng : q.x))]; }) };
  });
  return { lv: null, secs: secs, xf: Array.isArray(route.transfers) ? route.transfers.slice(0, 12).map(function (x) { return x ? { k: x.kind, xi: x.xferSecIdx, si: x.secIdx } : null; }).filter(Boolean) : null,
    bt: r.bt == null ? null : r.bt, rb: r.rb == null ? null : r.rb, now: resNum(r.now, 0), sw: [], tz: resNum(r.tz, 540), th: r.th === 'pastel' ? 'pastel' : 'dark' };
}

function resHash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function resPart(cap, part, facts) {
  var o = rheadScreen_({ cap: cap, part: part }, facts);
  return (o && o.ok) ? o : null;
}

function resultScreen(opt, r) {
  var cap = Math.floor(resNum(opt && opt.cap, 0));
  if (cap < 12) return { ok: false, error: 'cap' };
  r = (r && typeof r === 'object') ? r : {};
  var data = (r.data && typeof r.data === 'object') ? r.data : {};
  var raw = resArr((data.result || {}).path);
  var paths = resApplyRv(data, raw);
  var pick = resPickTabs(paths);
  var tab = RESULT_TABS.indexOf(r.tab) >= 0 ? r.tab : 'fast';
  var has = {};
  RESULT_TABS.forEach(function (t) { has[t] = !!(pick[t] && resConvertPath(pick[t])); });
  var route = has[tab] ? resConvertPath(pick[tab]) : null;
  var nodes = [], total = 0;
  var anyRoute = RESULT_TABS.some(function (t) { return has[t]; });
  var h = anyRoute ? resPart(cap, 'h', resHeadFacts(route, r, tab)) : null;
  if (anyRoute && !h) return { ok: false, error: 'head' };
  if (h) nodes = nodes.concat(h.body);
  else nodes.push({ t: 'text', s: '경로 정보가 없어요', size: 13, bold: true, color: 'sub', lh: 1.5, pad: [0, 0, 0, 0] });   // 응답에 쓸 수 있는 경로가 하나도 없을 때
  if (anyRoute) { var t = resPart(cap, 't', { m: 0, tab: tab, ld: has.longdist ? 1 : 0 }); if (t) nodes = nodes.concat(t.body); }
  if (route) {
    total = Math.round(resNum(route.summary.duration, 0) / 60);
    if (route.ld && tab === 'longdist') {
      var l = resPart(cap, 'l', { lg: route.ld }); if (l) nodes = nodes.concat(l.body);
    }
    var k = resPart(cap, 'k', resTrkFacts(route, r, false));
    if (!k) k = resPart(cap, 'k', resTrkFacts(route, r, true));
    if (k) nodes = nodes.concat(k.head).concat(k.body);
  }
  var body = nodes.length ? [{ t: 'panel', pad: [0, 4, 0, 8], ip: [12, 12, 12, 8], r: 16, kids: nodes }] : [];
  var out = { ok: true, v: RESULT_V, screen: 'result', cover: 'chips', head: [], body: body, info: { has: has, tab: tab, m: total, n: paths.length } };
  out.rev = 'e' + RESULT_V + ':' + resHash(JSON.stringify(body));
  return out;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { resultScreen: resultScreen, resConvertPath: resConvertPath, resApplyRv: resApplyRv, resPickTabs: resPickTabs, resNormStop: resNormStop };
