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
// 탑승 중 내 위치 마커·칸별 도착 시각: 앱이 대기 모드 엔진 답에서 받아 둔 pos(노드 번호 from→to, 구간 비율)·arr(노드별 HH:MM)·curIdx 를 그대로 넘겨 준 것(r.lv).
//   노드 0 은 출발지라 칸 번호는 하나씩 당긴다. 위치를 모르면 마커 없이 시각만 고친다.
function resLiveFacts(r) {
  var L = r && r.lv;
  if (!L || typeof L !== 'object') return null;
  var na = resArr(L.arr).slice(0, 62).map(function (v) { return typeof v === 'string' ? v.slice(0, 8) : ''; });
  var f = null, t = null, ratio = 0, pos = (L.pos && typeof L.pos === 'object') ? L.pos : null;
  if (pos && isFinite(Number(pos.from))) { f = Math.floor(Number(pos.from)); t = isFinite(Number(pos.to)) ? Math.floor(Number(pos.to)) : f; ratio = resNum(pos.ratio, 0); }
  else { var cur = Math.floor(resNum(L.cur, -1)); if (cur >= 1) { f = cur; t = f; } }
  return { pn: (f != null && f >= 1) ? { f: f, t: t, r: ratio } : null, w: null, na: na.length ? na : null };
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
    bt: r.bt == null ? null : r.bt, rb: r.rb == null ? null : r.rb, now: resNum(r.now, 0), sw: [], tz: resNum(r.tz, 540), th: r.th === 'pastel' ? 'pastel' : 'dark' };
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
function resDetailScreen(route, r, tab) {
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
  if (r.view === 'detail') return route ? resDetailScreen(route, r, tab) : { ok: false, error: 'route' };
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
    var nf = resNoteFacts(route, r);
    if (nf) { var nn = resPart(cap, 'n', nf); if (nn && nn.body.length && nn.body[0].t !== 'spacer') nodes = nodes.concat(nn.body); }
    var k = resPart(cap, 'k', resTrkFacts(route, r, false));
    if (!k) k = resPart(cap, 'k', resTrkFacts(route, r, true));
    if (k) nodes = nodes.concat(k.head).concat(k.body);
    if (r.ride && r.ride.on) {
      var rt = String(r.ride.text || '').slice(0, 120);
      nodes.push({ t: 'box', s: '탑승 안내 중' + (rt ? '\n' + rt : ''), hl: [[0, 6]], size: 12, lh: 1.5, color: 'text', fill: 'card2', line: 'gold', r: 10, ip: [12, 8, 12, 8], pad: [8, 0, 0, 4] });
      nodes.push({ t: 'row', pad: [8, 0, 0, 4], gap: 8, kids: [
        { t: 'button', s: '세부경로 보기', size: 13, h: 42, r: 12, bold: true, fill: 'card2', line: 'border', tc: 'gold', act: { a: 'call', v: 'rh.detail' } },
        { t: 'button', s: '안내 종료', size: 13, h: 42, r: 12, bold: true, fill: 'card2', line: 'border', tc: 'orange', act: { a: 'call', v: 'rh.stop' } }] });
    } else nodes.push({ t: 'button', s: '세부경로 보기', size: 13, h: 42, r: 12, bold: true, fill: 'card2', line: 'border', tc: 'gold', pad: [8, 0, 0, 4], act: { a: 'call', v: 'rh.detail' } });
  }
  var body = nodes.length ? [{ t: 'panel', pad: [0, 4, 0, 8], ip: [12, 12, 12, 8], r: 16, kids: nodes }] : [];
  var sec = [];                                                  // 지금 보이는 경로의 지하철 구간 이름(실시간소통이 '내 노선'을 앞에 둘 때 쓴다)
  if (route) route.sections.forEach(function (sc) { var tr = (sc && sc.transportation) || {}; if (tr.type === 1 && tr.name && sec.length < 6 && sec.indexOf(String(tr.name)) < 0) sec.push(String(tr.name)); });
  var out = { ok: true, v: RESULT_V, screen: 'result', cover: 'chips', head: [], body: body, info: { has: has, tab: tab, m: total, n: paths.length, sec: sec, ld: (route && route.ld && tab === 'longdist') ? resLdQuery(route.ld) : null } };
  out.rev = 'e' + RESULT_V + ':' + resHash(JSON.stringify(body));
  return out;
}
if (typeof module !== 'undefined' && module.exports) module.exports = { resTrkFacts: resTrkFacts, resultScreen: resultScreen, resConvertPath: resConvertPath, resApplyRv: resApplyRv, resPickTabs: resPickTabs, resNormStop: resNormStop };
