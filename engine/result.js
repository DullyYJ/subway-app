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

var resTrkColor = (typeof rheadTrkColor === 'function') ? rheadTrkColor : null;
if (!resTrkColor) { try { if (typeof require === 'function') resTrkColor = require('./rhead').rheadTrkColor; } catch (eRq2) {} }

var resPvl = (typeof pvlPillNode === 'function') ? pvlPillNode : null;
if (!resPvl) { try { if (typeof require === 'function') resPvl = require('./pvlabel').pvlPillNode; } catch (eRq3) {} }

var resDoorLines = (typeof rheadDoorLines === 'function') ? rheadDoorLines : null;
if (!resDoorLines) { try { if (typeof require === 'function') resDoorLines = require('./rhead').rheadDoorLines; } catch (eRq5) {} }
var resXferBox = (typeof rheadXferBox === 'function') ? rheadXferBox : null;
if (!resXferBox) { try { if (typeof require === 'function') resXferBox = require('./rhead').rheadXferBox; } catch (eRq4) {} }
// 시스템 이름이 '부산_부산' 처럼 같은 말 두 번으로 오면 한 번만(s217)
function resNmFix(s) {
  s = String(s == null ? '' : s).trim();
  var i = s.indexOf('_');
  if (i > 0) { var a = s.slice(0, i).trim(), b = s.slice(i + 1).trim(); if (a && a.replace(/역$/, '') === b.replace(/역$/, '')) return a.length >= b.length ? a : b; }
  return s;
}
var RES_TAGS_CAP = 25;                                                          // 알약 줄(tags) · 경로 통합 카드 자리(slot)를 아는 앱

function resNum(v, d) { v = Number(v); return isFinite(v) ? v : d; }
function resArr(v) { return Array.isArray(v) ? v : []; }

// 예전 웹 _normStop 과 같다: 정류장 한 곳의 이름·좌표·누적 초·시각을 한 모양으로.
function resNormStop(sv) {
  if (!sv) return { stationName: '', lat: null, lon: null };
  var o = { stationName: resNmFix(sv.stationName || sv.name || ''),
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
  var f = { m: 0, a: resNmFix(r.a), b: resNmFix(r.b), fav: r.fav === 0 ? 0 : 1, sp: null, why: '', dx: [], ex: null, xs: [], u: 0, nr: '' };
  if (!route) { f.nr = tab; return f; }
  f.m = Math.round(resNum(route.summary.duration, 0) / 60);
  var rs = route.rvSplit;
  if (route.why !== undefined && rs && rs.tot === f.m) f.sp = { ride: rs.ride, wait: rs.wait, walk: rs.walk };
  f.why = route.why ? String(route.why) : '';
  resArr(route.transfers).slice(0, 8).forEach(function (t) {
    if (t) f.xs.push({ kind: t.kind, at: resNmFix(t.at), walkMin: t.walkMin, boardAt: resNmFix(t.boardAt), toType: t.toType, toLine: t.toLine, fromType: t.fromType, fromLine: t.fromLine, service: t.service });
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
// 탑승 중 내 위치 마커·칸별 도착 시각: 앱이 대기 모드 엔진 답에서 받아 둔 pos(노드 번호 from→to, 구간 비율)·arr(노드별 HH:MM)·curIdx 를 그대로 넘겨 준 것(r.lv).
//   노드 0 은 출발지라 칸 번호는 하나씩 당긴다. 위치를 모르면 마커 없이 시각만 고친다.
function resLiveFacts(r) {
  var L = r && r.lv;
  if (!L || typeof L !== 'object') return null;
  var na = resArr(L.arr).slice(0, 62).map(function (v) { return typeof v === 'string' ? v.slice(0, 8) : ''; });
  var f = null, t = null, ratio = 0, pos = (L.pos && typeof L.pos === 'object') ? L.pos : null;
  if (pos && isFinite(Number(pos.from))) { f = Math.floor(Number(pos.from)); t = isFinite(Number(pos.to)) ? Math.floor(Number(pos.to)) : f; ratio = resNum(pos.ratio, 0); }
  else { var cur = Math.floor(resNum(L.cur, -1)); if (cur >= 1) { f = cur; t = f; } }
  var w = null, wt = (L.wait && typeof L.wait === 'object') ? L.wait : null;                 // 승차 대기 중: 마커는 탑승 지점에 서서 주황 맥박 + '대기 중 · 120m'
  if (wt && isFinite(Number(wt.i)) && Number(wt.i) >= 1) {
    f = Math.floor(Number(wt.i)); t = f; ratio = 0;
    w = { d: (wt.d != null && isFinite(Number(wt.d)) && Number(wt.d) >= 0) ? Number(wt.d) : null };
  }
  return { pn: (f != null && f >= 1) ? { f: f, t: t, r: ratio } : null, w: w, na: na.length ? na : null };
}
// 요약 칩 줄(rhead part 'g') 사실: 총 분 · 환승 횟수 · 이동 수단 묶음(장거리 이름 → 지하철 → 버스) · 환승·거점 이름(겹치는 이름은 한 번만)
function resTagFacts(route, hf) {
  var kinds = { ld: [], sub: 0, bus: 0 }, hubs = [];
  route.sections.forEach(function (sc) {
    var tr = (sc && sc.transportation) || {};
    if (tr.type === 4) { var nm = String(tr.name || '').replace(/\s+/g, ' ').trim().slice(0, 10) || '장거리'; if (kinds.ld.indexOf(nm) < 0) kinds.ld.push(nm); }
    else if (tr.type === 1) kinds.sub = 1;
    else if (tr.type === 2) kinds.bus = 1;
  });
  var mix = kinds.ld.slice(0, 2);
  if (kinds.sub) mix.push('지하철');
  if (kinds.bus) mix.push('버스');
  hf.xs.forEach(function (t) { var a = String(t.at || '').replace(/역$/, '').trim(); if (a && hubs.indexOf(a) < 0) hubs.push(a); });
  return { m: hf.m, n: hf.xs.length, mix: mix.slice(0, 4), hubs: hubs.slice(0, 4) };
}
function resTrkFacts(route, r, noGeo) {
  var secs = route.sections.slice(0, 12).map(function (sec) {
    sec = sec || {};
    var tr = sec.transportation || {}, ps = sec.passStopList || {}, stops = ps.stationList || ps.stations || [];
    return { ty: tr.type || 3, nm: tr.name || '', du: sec.duration || 0, di: sec.distance || 0, ws: sec.waitSec, ar: sec.arriveSec, ss: sec.startSec, es: sec.endSec,
      sts: Array.isArray(sec.stopSec) ? sec.stopSec : null, tw: sec.ttWaitMs, we: sec.waitEstimated ? 1 : 0,
      tc: Array.isArray(sec.trainChanges) ? sec.trainChanges.slice(0, 8).map(function (c) { return c ? { at: c.at, to: c.to } : null; }).filter(Boolean) : null,
      st: stops.slice(0, 150).map(function (q) { q = q || {}; return noGeo ? [q.stationName || ''] : [q.stationName || '', resR5(q.lat != null ? q.lat : q.y), resR5(q.lon != null ? q.lon : (q.lng != null ? q.lng : q.x))]; }) };
  });
  return { lv: resLiveFacts(r), secs: secs, xf: Array.isArray(route.transfers) ? route.transfers.slice(0, 12).map(function (x) { return x ? { k: x.kind, xi: x.xferSecIdx, si: x.secIdx } : null; }).filter(Boolean) : null,
    bt: r.bt == null ? null : r.bt, rb: r.rb == null ? null : r.rb, now: resNum(r.now, 0), sw: [], tz: resNum(r.tz, 540), th: r.th === 'pastel' ? 'pastel' : 'dark',
    me: (Array.isArray(r.me) && r.me.length === 2) ? [resNum(r.me[0], null), resNum(r.me[1], null)] : null, ra: typeof r.a === 'string' ? r.a.slice(0, 40) : '' };
}

// 장거리 고르기 눌림 → 다시 물을 때 덧붙일 질의(웹 _ldReselect). m = 수단/시각 칩, g = 등급/시각 칩. 번호는 엔진이 칩을 만든 순서와 같다.
function resLdQuery(ld) {
  var enc = function (v) { return encodeURIComponent(String(v == null ? '' : v)); };
  var cands = resArr(ld.candidates).slice(0, 8), opts = resArr(ld.options).slice(0, 8);
  return {
    m: cands.map(function (c) { return (c && c.mode) ? '&ldMode=' + enc(c.mode) + (c.depTs ? '&ldDepTs=' + enc(c.depTs) : '') : ''; }),
    g: opts.map(function (o) { return (o && o.grade && ld.mode) ? '&ldMode=' + enc(ld.mode) + '&ldGrade=' + enc(o.grade) + (o.depTs ? '&ldDepTs=' + enc(o.depTs) : '') : ''; })
  };
}
// 공지·지연 제보 줄(rhead part n)의 사실. 내 경로의 지하철 노선(앞 6개)에 대해서만, 서버가 준 원자료(r.off · r.al)를 그대로 넘긴다.
function resNoteFacts(route, r) {
  var ln = [];
  route.sections.forEach(function (sc) { var tr = (sc && sc.transportation) || {}; if (tr.type === 1 && tr.name && ln.indexOf(String(tr.name)) < 0 && ln.length < 6) ln.push(String(tr.name)); });
  if (!ln.length || route.why === undefined) return null;
  var f = { ln: ln, off: {}, offAt: 0, al: {}, now: Math.floor(resNum(r.now, 0) / 60000) * 60000 };
  var o = r.off && r.off.lines, a = r.al && r.al.lines;
  ln.forEach(function (l) {
    var n = o && o[l];
    if (n && typeof n === 'object') f.off[l] = { text: n.text, title: n.title, ts: n.ts, estimated: n.estimated ? 1 : 0, suspect: n.suspect ? 1 : 0 };
    var x = a && a[l];
    if (x && typeof x === 'object') f.al[l] = { reporters: x.reporters, stations: resArr(x.stations).slice(0, 1) };
  });
  return f;
}
// ── 세부경로 시트(웹 _buildTransitDetailNow): 구간마다 한 줄(노선 · 소요 · 시각 범위), 누르면 경유 정류장을 시각과 함께 펼친다. ──
function resClock(ms, tz) { var d = new Date(Number(ms) + Number(tz) * 60000), p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()); }
function resNavUrls(r) {
  var dl = r.dl && typeof r.dl === 'object' ? r.dl : null;
  if (!dl || !isFinite(Number(dl.la)) || !isFinite(Number(dl.lo))) return null;
  var la = Number(dl.la), lo = Number(dl.lo), nm = String(dl.n || '').slice(0, 60), me = (Array.isArray(r.me) && isFinite(Number(r.me[0])) && isFinite(Number(r.me[1]))) ? [Number(r.me[0]), Number(r.me[1])] : null;
  var e = encodeURIComponent;
  return {
    kakao: ['kakaomap://route?' + (me ? 'sp=' + me[0] + ',' + me[1] + '&' : '') + 'ep=' + la + ',' + lo + '&by=PUBLICTRANSIT', 'https://map.kakao.com/link/to/' + e(nm) + ',' + la + ',' + lo],
    naver: ['nmap://route/public?' + (me ? 'slat=' + me[0] + '&slng=' + me[1] + '&sname=' + e('내 위치') + '&' : '') + 'dlat=' + la + '&dlng=' + lo + '&dname=' + e(nm) + '&appname=com.dullyyj.subway',
            'https://map.naver.com/p/directions/' + (me ? me[1] + ',' + me[0] + ',' + e('내 위치') + ',,-1/' : '-/') + lo + ',' + la + ',' + e(nm) + ',,-1/transit']
  };
}
function resRgba(hex, a) {                                       // '#rrggbb' + 투명도 → 'rgba(r,g,b,a)' (웹 col+'28' 같은 8자리 hex 와 같은 색)
  var m = /^#([0-9a-fA-F]{6})$/.exec(String(hex || ''));
  if (!m) return '';
  var n = parseInt(m[1], 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}
var RES_TD_CAP = 20;                                             // tdrow(세부경로 줄) 노드를 아는 앱
var RES_SHD_CAP = 24;                                            // shd(웹 세부경로 시트 머리: 손잡이 · 제목 · 동그란 ×) + 앱 안에서 바로 펼치는 구간 + 웹 같은 아래 단추 줄을 아는 앱
var RES_OPT_NAMES = { fast: '최단시간', less: '최소환승', sub: '지하철', bus: '버스', longdist: '장거리' };   // 웹 confirmSelectedRoute optName
var RES_BUS_LEG_COLS = ['#30d158', '#bf5af2', '#ff6482', '#40c8e0', '#ffd60a'];   // 웹 _BUS_LEG_COLS
function resDetailScreen(route, r, tab, cap) {
  if (cap < RES_TD_CAP) return resDetailLegacy(route, r, tab);
  var tz = resNum(r.tz, 540), now = resNum(r.now, 0), base = r.bt != null ? resNum(r.bt, now) : (resNum(r.rb, 0) || now), th = r.th === 'pastel' ? 'pastel' : 'dark';
  var total = Math.round(resNum(route.summary.duration, 0) / 60), open = {};
  resArr(r.open).forEach(function (i) { i = Math.floor(Number(i)); if (i >= 0 && i < 40) open[i] = 1; });
  var web = cap >= RES_SHD_CAP, ttl = total + '분 · ' + String(r.a || '') + ' → ' + String(r.b || ''), optName = RES_OPT_NAMES[tab] || '선택한';
  var kids = web ? [] : [{ t: 'bar', pad: [16, 0, 0, 8], title: ttl, btn: '닫기', act: { a: 'call', v: 'rd.close' } }];
  var cum = base, busN = 0, busIdx = {}, exp = [], rows = [];
  if (cap >= RES_TAGS_CAP && resXferBox) {                          // s217: 홈 카드에서 뺀 '환승 1~N번' 순서가 여기 맨 위로 온다
    var xb = resXferBox(resArr(route.transfers).slice(0, 8).filter(function (t) { return t; }).map(function (t) { return { kind: t.kind, at: resNmFix(t.at), walkMin: t.walkMin, boardAt: resNmFix(t.boardAt), toType: t.toType, toLine: t.toLine, fromType: t.fromType, fromLine: t.fromLine, service: t.service }; }), [14, 6, 14, 10]);
    if (xb) kids.push(xb);
    if (resDoorLines) {                                              // s219: 홈 카드 머리에서 옮겨 온 호차·문 / 빠른 하차 안내
      var hf2 = resHeadFacts(route, r, tab), dl2 = resDoorLines(hf2.dx, hf2.ex);
      if (dl2.length) kids.push({ t: 'box', s: '호차·문 안내\n' + dl2.join('\n'), hl: [[0, 7]], size: 12, lh: 1.55, color: 'text', fill: 'rgba(10,132,255,0.10)', line: 'rgba(10,132,255,0.35)', r: 10, ip: [10, 7, 10, 7], pad: [14, 0, 14, 10] });
    }
  }
  route.sections.forEach(function (s, i) { if (s && s.transportation && s.transportation.type === 2) busIdx[i] = busN++; });
  route.sections.forEach(function (sec, si) {                    // 웹 세부경로 줄(.tdsec-row)과 같은 값: 색 · 아이콘 · 뱃지 · 경유 · 시간대
    sec = sec || {};
    var tr = sec.transportation || {}, ty = tr.type, secSec = resNum(sec.duration, 0), secMin = Math.round(secSec / 60), dep = cum, arr = cum + secSec * 1000;
    cum = arr;
    var mt = secMin < 1 ? '1분 미만' : secMin + '분';
    var row = { t: 'tdrow', dep: dep, arr: arr, time: mt };
    if (ty === 3) {
      var dist = Math.round(resNum(sec.distance, 0));
      row.ic = 'w'; row.col = 'sub'; row.lab = (typeof sec.distance === 'number' && dist <= 0) ? '환승 이동' : '도보 ' + (dist >= 1000 ? (dist / 1000).toFixed(1) + 'km' : dist + 'm');
      row.trk = 'border'; row.ibg = 'card2'; row.bbg = 'card2'; row.bfg = 'sub'; row.tcol = 'sub';
    } else {
      var isSub = ty === 1, isBus = ty === 2;
      var col = isSub ? (resTrkColor ? resTrkColor(1, tr.name, th) : '#2f7cf6') : isBus ? (busN >= 2 ? RES_BUS_LEG_COLS[busIdx[si] % RES_BUS_LEG_COLS.length] : (th === 'pastel' ? '#1a1a1a' : '#ffffff')) : 'sub';
      var hex = /^#[0-9a-fA-F]{6}$/.test(col);
      row.ic = isSub ? 's' : isBus ? 'b' : 'w'; row.col = col; row.tcol = hex ? col : 'sub';
      row.trk = hex ? resRgba(col, 0.1875) : 'border'; row.ibg = hex ? resRgba(col, 0.157) : 'card2'; row.bbg = hex ? resRgba(col, 0.133) : 'card2'; row.bfg = hex ? col : 'sub';
      row.lab = String(tr.name || '이동').slice(0, 24);
      var stops = ((sec.passStopList || {}).stationList) || [], from = stops.length ? String(stops[0].stationName || '') : '', to = stops.length > 1 ? String(stops[stops.length - 1].stationName || '') : '';
      if (from) row.path = (from + (to ? ' → ' + to : '')).slice(0, 60);
      if (stops.length > 2) row.cnt = (stops.length - 2) + '정거장 경유';
      row.rng = resClock(dep, tz) + '~' + resClock(arr, tz);
      if (stops.length >= 2) {                                    // 펼칠 수 있는 구간만 눌림 · 정거장 목록
        exp.push(si);
        row.act = { a: 'call', v: 'rd.tg.' + si };
        row.ex = true;
        if (web) row.i = si;                                       // 앱이 서버를 거치지 않고 바로 펼치는 구간 번호
        if (open[si]) row.op = true;
        if (web || open[si]) {
          var ss = (ty === 1 && Array.isArray(sec.stopSec) && sec.stopSec.length === stops.length) ? sec.stopSec : null, even = secSec * 1000 / (stops.length - 1), cm = 0;
          row.stops = stops.slice(0, 60).map(function (st, k) {
            var off;
            if (k === 0) off = 0;
            else if (ss && isFinite(ss[k]) && isFinite(ss[0])) { cm = Math.max(cm, (ss[k] - ss[0]) * 1000); off = cm; }
            else { cm += even; off = cm; }
            return [String(st.stationName || '').slice(0, 30), resClock(dep + off, tz), (k === 0 || k === stops.length - 1) ? 1 : 0];
          });
        }
      }
    }
    rows.push(row);
  });
  rows.forEach(function (row, i) { row.pos = rows.length === 1 ? 'o' : i === 0 ? 'f' : i === rows.length - 1 ? 'l' : 'm'; kids.push(row); });
  var nav = resNavUrls(r), onRide = !!(r.ride && r.ride.on);
  if (web) {                                                     // 웹 transitDetailModal: 확정 단추(파랑 → 확정되면 초록) · 위 선 · 카카오맵/네이버지도
    var foot = [onRide ? { t: 'button', s: '\u2705 ' + optName + ' 경로로 확정됨', size: 15, h: 48, r: 12, bold: true, fill: '#30a14e', line: 'none', tc: '#ffffff', pad: [14, 10, 14, 0], act: { a: 'call', v: 'rd.done' } }
      : { t: 'button', s: '\u2705 이 경로로 확정하기', size: 15, h: 48, r: 12, bold: true, fill: '#2f7cf6', line: 'none', tc: '#ffffff', pad: [14, 10, 14, 0], act: { a: 'call', v: 'rd.confirm' } }];
    if (nav) foot.push({ t: 'divider', pad: [0, 0, 0, 0] });
    else foot[0].pad = [14, 10, 14, 16];
    if (nav) foot.push({ t: 'row', pad: [14, 12, 14, 16], gap: 8, kids: [
      { t: 'button', s: '\ud83d\uddfa\ufe0f 카카오맵 길안내', size: 13, h: 46, r: 12, bold: true, fill: '#fee500', line: 'none', tc: '#3a1d1d', act: { a: 'call', v: 'rd.kakao' } },
      { t: 'button', s: '\ud83d\uddfa\ufe0f 네이버지도', size: 13, h: 46, r: 12, bold: true, fill: '#03c75a', line: 'none', tc: '#ffffff', act: { a: 'call', v: 'rd.naver' } }] });
    var outW = { ok: true, v: RESULT_V, screen: 'rdetail', cover: 'tab', bg: 'card', fl: false, head: [{ t: 'shd', title: ttl, act: { a: 'call', v: 'rd.close' } }], body: kids, foot: foot, info: { exp: exp, nav: nav, m: total, tab: tab, opt: optName } };
    outW.rev = 'd' + RESULT_V + ':' + resHash(JSON.stringify([outW.head, kids, foot]));
    return outW;
  }
  if (nav) kids.push({ t: 'row', pad: [14, 10, 14, 14], gap: 8, kids: [
    { t: 'button', s: '카카오맵 길안내', size: 13, h: 46, r: 12, bold: true, fill: '#fee500', line: 'none', tc: '#3a1d1d', act: { a: 'call', v: 'rd.kakao' } },
    { t: 'button', s: '네이버지도', size: 13, h: 46, r: 12, bold: true, fill: '#03c75a', line: 'none', tc: '#ffffff', act: { a: 'call', v: 'rd.naver' } }] });
  kids.push(onRide ? { t: 'button', s: '탑승 안내 종료', size: 14, h: 48, r: 12, bold: true, fill: 'card2', line: 'border', tc: 'orange', pad: [14, 10, 14, 14], act: { a: 'call', v: 'rd.stop' } }
    : { t: 'button', s: '이 경로로 탑승 시작', size: 14, h: 48, r: 12, bold: true, fill: 'gold', line: 'none', tc: '#121214', pad: [14, 10, 14, 14], act: { a: 'call', v: 'rd.confirm' } });
  var out = { ok: true, v: RESULT_V, screen: 'rdetail', cover: 'tab', head: [], body: kids, info: { exp: exp, nav: nav, m: total, tab: tab } };
  out.rev = 'd' + RESULT_V + ':' + resHash(JSON.stringify(kids));
  return out;
}

function resDetailLegacy(route, r, tab) {   // cap 20 미만 앱(tdrow 를 모르는 옛 앱)용 — 글 줄 모양
  var tz = resNum(r.tz, 540), now = resNum(r.now, 0), base = r.bt != null ? resNum(r.bt, now) : (resNum(r.rb, 0) || now), th = r.th === 'pastel' ? 'pastel' : 'dark';
  var total = Math.round(resNum(route.summary.duration, 0) / 60), open = {};
  resArr(r.open).forEach(function (i) { i = Math.floor(Number(i)); if (i >= 0 && i < 40) open[i] = 1; });
  var kids = [{ t: 'bar', pad: [16, 0, 0, 8], title: total + '분 · ' + String(r.a || '') + ' → ' + String(r.b || ''), btn: '닫기', act: { a: 'call', v: 'rd.close' } }];
  var cum = base, busN = 0, busIdx = {}, exp = [];
  route.sections.forEach(function (s, i) { if (s && s.transportation && s.transportation.type === 2) busIdx[i] = busN++; });
  var BUSCOL = ['#30d158', '#0a84ff', '#ff9f0a', '#bf5af2'];
  route.sections.forEach(function (sec, si) {
    sec = sec || {};
    var tr = sec.transportation || {}, ty = tr.type, secSec = resNum(sec.duration, 0), secMin = Math.round(secSec / 60), dep = cum, arr = cum + secSec * 1000;
    cum = arr;
    var mt = secMin < 1 ? '1분 미만' : secMin + '분';
    if (ty === 3) {
      var dist = Math.round(resNum(sec.distance, 0));
      var lab = (typeof sec.distance === 'number' && dist <= 0) ? '환승 이동' : '도보 ' + (dist >= 1000 ? (dist / 1000).toFixed(1) + 'km' : dist + 'm');
      kids.push({ t: 'text', s: lab + '  ' + mt, size: 12, color: 'sub', pad: [4, 6, 6, 6] });
      return;
    }
    var col = ty === 1 ? (resTrkColor ? resTrkColor(1, tr.name, th) : '#2f7cf6') : ty === 2 ? (busN >= 2 ? BUSCOL[busIdx[si] % BUSCOL.length] : '#30d158') : '#ff9500';
    var stops = ((sec.passStopList || {}).stationList) || [], from = stops.length ? stops[0].stationName : '', to = stops.length > 1 ? stops[stops.length - 1].stationName : '';
    var cnt = stops.length > 2 ? (stops.length - 2) + '정거장 경유' : '';
    var rng = resClock(dep, tz) + '~' + resClock(arr, tz);
    var path = (from ? from + (to ? ' \u2192 ' + to : '') : '') + (cnt ? ' \u00b7 ' + cnt : '');
    var title = (tr.name || '이동') + '  ' + mt;
    if (stops.length >= 2) {
      exp.push(si);
      kids.push({ t: 'navrow', title: title, sub: rng, tc: col, act: { a: 'call', v: 'rd.tg.' + si }, size: 13 });
      if (path) kids.push({ t: 'text', s: path.slice(0, 80), size: 11, color: 'sub', pad: [0, 6, 4, 6] });
      if (open[si]) {
        var ss = (ty === 1 && Array.isArray(sec.stopSec) && sec.stopSec.length === stops.length) ? sec.stopSec : null, even = secSec * 1000 / (stops.length - 1), cm = 0, lines = [], hl = [], pos = 0;
        stops.forEach(function (st, k) {
          var off;
          if (k === 0) off = 0;
          else if (ss && isFinite(ss[k]) && isFinite(ss[0])) { cm = Math.max(cm, (ss[k] - ss[0]) * 1000); off = cm; }
          else { cm += even; off = cm; }
          var end = (k === 0 || k === stops.length - 1), nm = String(st.stationName || ''), line = (end ? '● ' : '○ ') + nm + '  ' + resClock(dep + off, tz);
          if (end) hl.push([pos, pos + line.length, col]);
          lines.push(line); pos += line.length + 1;
        });
        var bx = { t: 'box', s: lines.join('\n'), size: 12, lh: 1.6, color: 'text', fill: 'card2', line: 'border', r: 9, ip: [12, 8, 12, 8], pad: [0, 0, 0, 6] };
        if (hl.length) bx.hl = hl;
        kids.push(bx);
      }
    } else kids.push({ t: 'box', s: title + '\n' + path + '  ' + rng, size: 12, lh: 1.5, color: 'text', fill: 'card2', line: 'border', r: 9, ip: [12, 8, 12, 8], pad: [0, 0, 0, 6], hl: [[0, title.length, col]] });
  });
  var nav = resNavUrls(r);
  if (nav) kids.push({ t: 'row', pad: [10, 0, 0, 14], gap: 8, kids: [
    { t: 'button', s: '카카오맵 길안내', size: 13, h: 46, r: 12, bold: true, fill: '#fee500', line: 'none', tc: '#3a1d1d', act: { a: 'call', v: 'rd.kakao' } },
    { t: 'button', s: '네이버지도', size: 13, h: 46, r: 12, bold: true, fill: '#03c75a', line: 'none', tc: '#ffffff', act: { a: 'call', v: 'rd.naver' } }] });
  var onRide = !!(r.ride && r.ride.on);
  kids.push(onRide ? { t: 'button', s: '탑승 안내 종료', size: 14, h: 48, r: 12, bold: true, fill: 'card2', line: 'border', tc: 'orange', pad: [10, 0, 0, 14], act: { a: 'call', v: 'rd.stop' } }
    : { t: 'button', s: '이 경로로 탑승 시작', size: 14, h: 48, r: 12, bold: true, fill: 'gold', line: 'none', tc: '#121214', pad: [10, 0, 0, 14], act: { a: 'call', v: 'rd.confirm' } });
  var out = { ok: true, v: RESULT_V, screen: 'rdetail', cover: 'tab', head: [], body: kids, info: { exp: exp, nav: nav, m: total, tab: tab } };
  out.rev = 'd' + RESULT_V + ':' + resHash(JSON.stringify(kids));
  return out;
}

function resHash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function resPart(cap, part, facts) {
  var o = rheadScreen_({ cap: cap, part: part }, facts);
  return (o && o.ok) ? o : null;
}

// ── 경로 카드 버튼 줄 오른쪽 칸(웹 routeSlotBtn) ─────────────────────────────────────────────
//   r.ride.row = 대기 모드 엔진(ride-standby)의 row { slot, label, leg, can, anim:{kind,ms,ease,sq,o} }. 칸 색은 웹 _ROW_COLORS 와 같다.
//   an = 전환 연출(앱이 sq 가 방금일 때만 그린다): { k, ms, e[4], sq, bg(가리개 색), o:{ s, fill, tc } 바뀌기 전 칸 }
var RES_ROW_CAP = 21;
var RES_CONF_CAP = 22;                                                          // 안내 전 버튼 줄의 [경로 확정](웹 mainConfirmRouteBtn)을 그릴 수 있는 앱 수준
var RES_ROW_COLORS = { board: { fill: '#0a84ff', tc: '#ffffff' }, transfer: { fill: '#bf5af2', tc: '#ffffff' }, arrive: { fill: '#e8b84a', tc: '#121214' } };
var RES_ROW_LABELS = { board: '탑승', transfer: '환승', arrive: '도착' };
function resSlotNode(row) {
  if (!row || typeof row !== 'object' || !RES_ROW_COLORS[row.slot]) return null;
  var c = RES_ROW_COLORS[row.slot], btn = { t: 'button', s: String(row.label || RES_ROW_LABELS[row.slot]).slice(0, 6), size: 13, h: 42, r: 12, bold: true, fill: c.fill, line: 'none', tc: c.tc, act: { a: 'call', v: 'rh.slot' } };
  var a = row.anim, an = null;
  if (a && typeof a === 'object' && ['push_in', 'push_out', 'slide_down', 'slide_up'].indexOf(a.kind) >= 0 && resNum(a.ms, 0) > 0 && resNum(a.sq, 0) > 0) {
    var ez = resArr(a.ease).map(function (x) { return resNum(x, 0); });
    an = { k: a.kind, ms: Math.max(1, Math.min(1500, Math.round(resNum(a.ms, 0)))), e: ez.length === 4 ? ez : [0.2, 0, 0, 1], sq: Math.round(resNum(a.sq, 0)), bg: 'card' };
    var oc = RES_ROW_COLORS[a.o];
    if (oc) an.o = { s: RES_ROW_LABELS[a.o], fill: oc.fill, tc: oc.tc };
  }
  return { btn: btn, an: an };
}

// ★ 2026-10-25 (웹 대조): 경로가 0건일 때 웹은 이유를 알려 줬다(_svcShowNoRoute 운행 종료 안내 · '이 출발지·도착지 사이의 경로를 찾지 못했어요').
//   네이티브는 '경로 정보가 없어요' 한 줄이었다. 이유는 엔진 응답이 이미 갖고 있다 — liveStat.subOff/svcOff(+svcOffList[].state · subFirstTrain) · warnings.
//   웹 _svcHeadSuffix 와 같은 규칙: 지하철이 끝났으면 '운행이 끝났어요', 버스만이고 전부 '아직 시작 전'(before)이면 '아직 운행 시작 전이에요'.
function resNoRouteNodes(data) {
  var ls = (data && data.liveStat && typeof data.liveStat === 'object') ? data.liveStat : {};
  var warns = resArr(data && data.warnings).map(function (x) { return String(x); });
  var subOff = resNum(ls.subOff, 0) > 0, busOff = resNum(ls.svcOff, 0) > 0;
  var title = '경로 정보가 없어요', lines = [];
  if (subOff || busOff) {
    var modes = [];
    if (subOff) modes.push('지하철');
    if (busOff) modes.push('버스');
    var sts = resArr(ls.svcOffList).map(function (x) { return x && typeof x === 'object' ? x.state : null; }).filter(function (x) { return x; });
    var before = !subOff && sts.length > 0 && sts.every(function (x) { return x === 'before'; });
    title = modes.join('·') + ' 지금은 ' + (before ? '아직 운행 시작 전이에요' : '운행이 끝났어요');
    var fs = /^[0-9]{1,2}:[0-9]{2}$/.test(String(ls.subFirstTrain || '')) ? String(ls.subFirstTrain) : '';
    if (subOff && fs) lines.push('지하철 첫차 ' + fs + ' 이후에 다시 찾아 보세요.');
    if (busOff) lines.push('버스는 노선마다 첫차가 달라요. 노선도 > 버스 탭에서 정류장별 도착정보를 확인해 주세요.');
  } else if (warns.some(function (w) { return /버스 노선이 없습니다|탈 것이 없습니다/.test(w); })) {
    title = '이 지역은 아직 길 안내 정보가 없어요';
    lines.push('출발·도착 근처를 지나는 버스·지하철 노선 자료가 없어요. 가까운 역이나 큰 정류장으로 바꿔 보세요.');
  } else lines.push('이 출발지·도착지 사이의 경로를 찾지 못했어요. 출발·도착을 확인하거나 잠시 뒤 다시 시도해 주세요.');
  var out = [{ t: 'text', s: title, size: 13, bold: true, color: 'sub', lh: 1.5, pad: [0, 0, 0, 0] }];
  lines.forEach(function (l) { out.push({ t: 'text', s: l, size: 12, color: 'sub', lh: 1.5, pad: [0, 4, 0, 0] }); });
  return out;
}

function resultScreen(opt, r) {
  var cap = Math.floor(resNum(opt && opt.cap, 0));
  if (cap < 12) return { ok: false, error: 'cap' };
  r = (r && typeof r === 'object') ? r : {};
  var data = (r.data && typeof r.data === 'object') ? r.data : {};
  var raw = resArr((data.result || {}).path);
  var paths = resApplyRv(data, raw);
  var pick = resPickTabs(paths);
  if (r.ld2 && typeof r.ld2 === 'object') {                      // 장거리 '다른 편' 을 골라 다시 받은 응답: 그 안의 장거리 경로만 바꿔 끼운다(웹 _ldReselect)
    var p2 = resArr((r.ld2.result || {}).path).filter(function (q) { return q && q.info && q.info.longDist === true; })[0];
    if (p2) pick.longdist = p2;
  }
  var tab = RESULT_TABS.indexOf(r.tab) >= 0 ? r.tab : 'fast';
  var has = {};
  RESULT_TABS.forEach(function (t) { has[t] = !!(pick[t] && resConvertPath(pick[t])); });
  var route = has[tab] ? resConvertPath(pick[tab]) : null;
  if (r.view === 'detail') return route ? resDetailScreen(route, r, tab, cap) : { ok: false, error: 'route' };
  var nodes = [], total = 0;
  var anyRoute = RESULT_TABS.some(function (t) { return has[t]; });
  var fuse = cap >= RES_TAGS_CAP && !!route, hfacts = anyRoute ? resHeadFacts(route, r, tab) : null;
  if (hfacts && fuse) hfacts.cp = 1;                              // 통합 카드: 긴 환승 목록 상자는 빼고 아래 칩 줄 · 세부경로 시트가 맡는다
  var h = anyRoute ? resPart(cap, 'h', hfacts) : null;
  if (anyRoute && !h) return { ok: false, error: 'head' };
  if (h) nodes = nodes.concat(h.body);
  else nodes = nodes.concat(resNoRouteNodes(data));   // 응답에 쓸 수 있는 경로가 하나도 없을 때 — 왜 없는지(운행 종료 · 노선 데이터 없음 · 그 밖)를 말해 준다
  if (anyRoute) { var t = resPart(cap, 't', { m: 0, tab: tab, ld: has.longdist ? 1 : 0 }); if (t) nodes = nodes.concat(t.body); }
  if (route) {
    total = Math.round(resNum(route.summary.duration, 0) / 60);
    if (route.ld && tab === 'longdist') {
      var l = resPart(cap, 'l', { lg: route.ld }); if (l) nodes = nodes.concat(l.body);
    }
    var nf = resNoteFacts(route, r);
    if (nf) { var nn = resPart(cap, 'n', nf); if (nn && nn.body.length && nn.body[0].t !== 'spacer') nodes = nodes.concat(nn.body); }
    // s218: 칩 줄(part g)은 YJ 요청으로 뺐다 — 환승 횟수·시간은 아래 AI 브리핑 첫 문장이 말로 알려 준다(엔진 part g · tags 노드는 그대로 둔다)
    var k = resPart(cap, 'k', resTrkFacts(route, r, false));
    if (!k) k = resPart(cap, 'k', resTrkFacts(route, r, true));
    if (k) nodes = nodes.concat(k.head).concat(k.body);
    if (fuse) nodes.push({ t: 'spacer', h: 0, slot: 'ai' });          // 홈 카드의 AI 승무원 브리핑이 합쳐져 들어올 자리(앱이 into:'ai' 카드를 여기로 옮긴다; 못 옮기면 그대로 0 높이)
    if (r.ride && r.ride.on) {
      // s223(YJ): 카드 오른쪽 [탑승/환승/도착] 칸은 뺐다 — 하단 알약의 버튼과 겹쳐 중복이다(resSlotNode · rh.slot 은 그대로 둔다)
      var rowKids = [
        { t: 'button', s: '세부경로 보기', size: 13, h: 42, r: 12, bold: true, fill: 'card2', line: 'border', tc: 'gold', act: { a: 'call', v: 'rh.detail' } },
        { t: 'button', s: '안내 종료', size: 13, h: 42, r: 12, bold: true, fill: 'card2', line: 'border', tc: 'orange', act: { a: 'call', v: 'rh.stop' } }];
      var rowNode = { t: 'row', pad: [8, 12, 0, 4], gap: 8, kids: rowKids };      // s269(YJ: 글자와 버튼이 너무 붙음 — 위 간격을 버튼 아래 간격(4 + 카드 안쪽 8 = 12)과 같게)
      if (typeof r.ride.dt === 'string' && r.ride.dt) nodes.push({ t: 'text', s: r.ride.dt.slice(0, 60), size: 13, bold: true, color: 'gold', lh: 1.4, pad: [8, 6, 0, 4] });      // s229 역까지 이동: 남은 거리·시간(엔진 ongoing.text)
      nodes.push(rowNode);
    } else if (cap >= RES_CONF_CAP) nodes.push({ t: 'row', pad: [8, 12, 0, 4], gap: 8, kids: [                // 웹 routeActRow(안내 전): [세부경로 보기][경로 확정(파랑)]
      { t: 'button', s: '세부경로 보기', size: 13, h: 42, r: 12, bold: true, fill: 'card2', line: 'border', tc: 'gold', act: { a: 'call', v: 'rh.detail' } },
      { t: 'button', s: '경로 확정', size: 13, h: 42, r: 12, bold: true, fill: '#2f7cf6', line: 'none', tc: '#ffffff', act: { a: 'call', v: 'rh.confirm' } }] });
    else nodes.push({ t: 'button', s: '세부경로 보기', size: 13, h: 42, r: 12, bold: true, fill: 'card2', line: 'border', tc: 'gold', pad: [8, 12, 0, 4], act: { a: 'call', v: 'rh.detail' } });
  }
  var pvPill = (nodes.length && resPvl) ? resPvl('route', r.bt == null ? null : resNum(r.bt, null), r.metro === true, resNum(r.now, 0), resNum(r.tz, 540)) : null;   // 예상 경로 라벨 + 무지개 테두리(웹 preview-glow)
  if (pvPill) nodes.unshift(pvPill);
  var body = nodes.length ? [{ t: 'panel', pad: [14, 4, 14, 8], ip: [12, 12, 12, 8], r: 16, kids: nodes }] : [];             // 좌우 14 — 웹 홈은 입력 카드 · 결과 카드가 같은 바깥 여백(14)을 쓴다(예전엔 0 이라 결과 카드만 화면 끝까지 닿았다)
  if (pvPill && body.length) body[0].glow = true;
  var sec = [];                                                  // 지금 보이는 경로의 지하철 구간 이름(실시간소통이 '내 노선'을 앞에 둘 때 쓴다)
  if (route) route.sections.forEach(function (sc) { var tr = (sc && sc.transportation) || {}; if (tr.type === 1 && tr.name && sec.length < 6 && sec.indexOf(String(tr.name)) < 0) sec.push(String(tr.name)); });
  var out = { ok: true, v: RESULT_V, screen: 'result', cover: 'chips', head: [], body: body, info: { has: has, tab: tab, m: total, n: paths.length, sec: sec, ld: (route && route.ld && tab === 'longdist') ? resLdQuery(route.ld) : null } };
  out.rev = 'e' + RESULT_V + ':' + resHash(JSON.stringify(body));
  return out;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { resNoRouteNodes: resNoRouteNodes, resTrkFacts: resTrkFacts, resultScreen: resultScreen, resConvertPath: resConvertPath, resApplyRv: resApplyRv, resPickTabs: resPickTabs, resNormStop: resNormStop, resNmFix: resNmFix };
