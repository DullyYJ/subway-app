// 길동무 — 지도 탭 화면 엔진(지하철 노선도 머리줄·역 팝업·시간표·지역 노선, 버스) 순수 계산 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수; 단일 출처)
//
// ★ 원칙(YJ): "모든 연산은 엔진이 한다. 앱은 엔진이 계산한 그림만 그린다."  (2026-10-20 s91 — 지도 탭)
//   웹의 지도 탭 규칙(안쪽 탭, 지역 탭, 호선 필터 칩, 역 검색 규칙, 역 → 노선 표(MSM·별칭), 역 팝업, 시간표 요약·시(時)별 묶기, 지방 노선 목록)을 여기로 옮겼다.
//   앱은 노선도 그림(MetroMapView 비트맵)과 손가락·위치·통신만 맡는다.
//
// 입력  mapScreen({ cap }, f, d)
//        f.part = 'h' 머리 · 'b' 본문 · 'stn' 역 팝업 · 'tt' 시간표
//        f.mode = 'bus' | 'subway' (안쪽 탭)  f.reg = 'seoul'|'busan'|'daegu'|'gwangju'|'daejeon'  f.flt = 호선 필터('ALL'|'1호선'…)  f.th = 'dark'|'pastel'
//        stn:  f.stn = 역 이름(지도 글자)  f.sl = 누른 노선(지방 노선 목록에서 눌렀을 때)
//        tt:   f.stn · f.tt = { sel:{ line, day, dk }, st:'loading'|'ok'|'fail', res:{ '<노선>|<요일>': 시간표 응답 }, now }   ← 응답은 GET/POST /next-train?op=timetable 의 것 그대로
//        q:    f.q = 역 검색어 → 출력 info.find = { name } (노선도에서 찾아갈 역)  f.gps = [위도, 경도] → info.near = 가장 가까운 역
// 출력  { ok, v:1, screen:'map'|'mapstn'|'maptt', rev, cover:'tab', head, body, info }
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var MAP_SCREEN_V = 1;
var MAP_REGIONS = [['seoul', '수도권'], ['busan', '부산'], ['daegu', '대구'], ['gwangju', '광주'], ['daejeon', '대전']];
var MAP_REGION_PREFIX = { busan: '부산', daegu: '대구', gwangju: '광주', daejeon: '대전' };
var MAP_REGION_COLORS = { '부산1호선': '#F06A00', '부산2호선': '#81BF48', '부산3호선': '#BB8C00', '부산4호선': '#217DCB', '대구1호선': '#D93F5C', '대구2호선': '#00AA80', '대구3호선': '#FFB100', '광주1호선': '#009088', '대전1호선': '#007448' };
// 호선 필터 칩(웹 #lineFilterBar 와 같다): [이름(노선도 필터 이름), 칩 글자, 색]
var MAP_FILTERS = [['ALL', '전체', '#f5a623'], ['1호선', '1호선', '#0052a4'], ['2호선', '2호선', '#00b140'], ['3호선', '3호선', '#ef7c1c'], ['4호선', '4호선', '#00a5de'], ['5호선', '5호선', '#8b4ea6'],
  ['6호선', '6호선', '#c55a11'], ['7호선', '7호선', '#b4bf00'], ['8호선', '8호선', '#e6186c'], ['9호선', '9호선', '#c8b87a'], ['공항철도', '공항', '#0090d2'], ['경의중앙선', '경의중앙', '#77c4a3'],
  ['수인분당선', '수인분당', '#f5a200'], ['신분당선', '신분당', '#d31145']];
var MAP_SKIP = ['호선', '경전철', '수도권', '도시철도', '한강버스', '지하철망', '노선도', '환승'];     // 지도 글자 중 역이 아닌 것(웹 _NM_SKIP)
var MAP_ALIAS = { '서울역': '서울', '총신대입구': '이수' };                                          // 웹 _METRO_ALIAS
var MAP_DAY_ORDER = ['DAY', 'SAT', 'SUN'];

function mapStr(v, n) { return typeof v === 'string' ? v.slice(0, n) : (typeof v === 'number' ? String(v).slice(0, n) : ''); }
function mapHash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function mapStnTable() {                           // Worker 에서는 HOME 블록의 전역 HOME_STNS, Node(시험)에서는 파일
  if (typeof HOME_STNS !== 'undefined' && HOME_STNS) return HOME_STNS;
  try { if (typeof require === 'function') return require('./home-stations').HOME_STNS; } catch (e) { /* 없음 */ }
  return [];
}
var mapLineColorFn = (typeof rheadTrkColor === 'function') ? rheadTrkColor : null;
if (!mapLineColorFn) { try { if (typeof require === 'function') mapLineColorFn = require('./rhead').rheadTrkColor; } catch (eRq) { /* 없음 */ } }
function mapLineColor(line, th) {
  if (MAP_REGION_COLORS[line]) return MAP_REGION_COLORS[line];
  return mapLineColorFn ? mapLineColorFn(1, line, th === 'dark' ? 'dark' : 'pastel') : '#5a5a5f';
}
function mapHav(la1, lo1, la2, lo2) {
  var R = 6371000, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
  var a = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── 역 → 노선 (웹 MSM · _metroLines) ──
function mapLinesOf(name) {
  var T = mapStnTable(), out = [], i;
  var add = function (nm) { for (i = 0; i < T.length; i++) if (T[i][0] === nm && out.indexOf(T[i][1]) < 0) out.push(T[i][1]); };
  add(name);
  if (MAP_ALIAS[name]) add(MAP_ALIAS[name]);
  return out;
}
function mapCleanName(s) { return mapStr(s, 40).replace(/\s+/g, '').trim(); }
function mapIsStationLabel(name) {                 // 지도 글자가 역 이름처럼 보이는가(웹 _nmOnStation 의 앞부분)
  if (!name || name.length < 2) return false;
  for (var i = 0; i < MAP_SKIP.length; i++) if (name.indexOf(MAP_SKIP[i]) >= 0) return false;
  return true;
}
// 역 하나(이름 + 고른 노선 힌트) → 출발/도착으로 쓸 행(웹 svgSetRoute: 노선 힌트 → 같은 이름 첫 행)
function mapPickRow(name, line) {
  var T = mapStnTable(), i, first = null;
  for (i = 0; i < T.length; i++) {
    if (T[i][0] !== name) continue;
    if (line && T[i][1] === line) return T[i];
    if (!first) first = T[i];
  }
  return first;
}
// 역 검색(웹 mapSearchStation): 공백 뺀 이름이 같은 것 → 포함하는 것 → 그 글자 그대로
function mapFind(q) {
  q = mapStr(q, 40).replace(/\s+/g, '').trim();
  if (q.length < 2) return null;
  var T = mapStnTable(), i, m = null;
  for (i = 0; i < T.length && !m; i++) if (String(T[i][0]).replace(/\s+/g, '') === q) m = T[i];
  for (i = 0; i < T.length && !m; i++) if (String(T[i][0]).replace(/\s+/g, '').indexOf(q) >= 0) m = T[i];
  return { name: m ? m[0] : q, known: !!m };
}
function mapNearest(la, lo) {                       // 웹 mapGoToMyLocation: 위도·경도 차의 제곱합이 가장 작은 역
  var T = mapStnTable(), best = null, bd = 1e18;
  for (var i = 0; i < T.length; i++) { var dx = T[i][2] - la, dy = T[i][3] - lo, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = T[i]; } }
  return best ? { name: best[0], line: best[1], la: best[2], lo: best[3] } : null;
}

function mapFacts(f) {
  f = (f && typeof f === 'object') ? f : {};
  var part = ['h', 'b', 'stn', 'tt'].indexOf(f.part) >= 0 ? f.part : 'h';
  var reg = MAP_REGIONS.some(function (r) { return r[0] === f.reg; }) ? f.reg : 'seoul';
  var flt = MAP_FILTERS.some(function (r) { return r[0] === f.flt; }) ? f.flt : 'ALL';
  var gps = (Array.isArray(f.gps) && f.gps.length >= 2 && isFinite(Number(f.gps[0])) && isFinite(Number(f.gps[1]))) ? [Number(f.gps[0]), Number(f.gps[1])] : null;
  return { part: part, mode: f.mode === 'subway' ? 'subway' : 'bus', reg: reg, flt: flt, th: f.th === 'dark' ? 'dark' : 'pastel',
           stn: mapCleanName(f.stn), sl: mapStr(f.sl, 30), q: mapStr(f.q, 40), gps: gps, tt: (f.tt && typeof f.tt === 'object') ? f.tt : {}, bus: (f.bus && typeof f.bus === 'object') ? f.bus : null };
}

function mapSheetPad(n) { var p = Array.isArray(n.pad) ? n.pad.slice() : [0, 0, 0, 0]; p[0] += 16; p[2] += 16; if (n === mapSheetPad.first) p[1] += 10; n.pad = p; return n; }
function mapFinish(out, key) { out.rev = 'm' + MAP_SCREEN_V + ':' + mapHash(JSON.stringify([out.head, out.body, key || ''])); return out; }
function mapChip(label, on, v, c) { var o = { label: label, on: !!on, act: { a: 'cat', v: v } }; if (c) o.c = c; return o; }

// ── 머리줄 ──
function mapHead(f) {
  var head = [{ t: 'chips', pad: [14, 8, 14, 6], gap: 8, h: 32, onc: 'gold', onfg: '#121214',
    items: [mapChip('버스', f.mode === 'bus', 'm:bus'), mapChip('지하철', f.mode === 'subway', 'm:subway')] }];
  if (f.mode === 'subway') {
    head.push({ t: 'chips', pad: [14, 0, 14, 6], gap: 6, h: 28, onc: 'gold', onfg: '#121214',
      items: MAP_REGIONS.map(function (r) { return mapChip(r[1], f.reg === r[0], 'r:' + r[0]); }) });
    if (f.reg === 'seoul') {
      head.push({ t: 'inbar', pad: [14, 0, 14, 6], key: 'mq', hint: '역 검색 (예: 부평)', value: f.q, maxlen: 20, h: 38, btn: '찾기', act: { a: 'call', v: 'mp.find' }, eact: { a: 'call', v: 'mp.find' } });
      var items = [{ label: '내 위치', on: false, act: { a: 'call', v: 'mp.loc' } }];
      MAP_FILTERS.forEach(function (x) { items.push({ label: x[1], on: f.flt === x[0], c: x[2], act: { a: 'cat', v: 'f:' + x[0] } }); });
      head.push({ t: 'chips', pad: [14, 0, 14, 6], gap: 6, h: 28, onc: 'gold', onfg: '#121214', items: items });
    }
  }
  return head;
}

// ── 지방 노선 목록(웹 renderRegionSvg) ──
function mapRegionLines(reg) {
  var T = mapStnTable(), pre = MAP_REGION_PREFIX[reg], groups = {}, order = [], i;
  if (!pre) return [];
  for (i = 0; i < T.length; i++) {
    if (String(T[i][1]).indexOf(pre) !== 0) continue;
    if (!groups[T[i][1]]) { groups[T[i][1]] = []; order.push(T[i][1]); }
    groups[T[i][1]].push(T[i]);
  }
  return order.map(function (l) { return { line: l, stns: groups[l] }; });
}
function mapRegionBody(f, ctx) {
  var lines = mapRegionLines(f.reg), body = [], all = [], name = '';
  MAP_REGIONS.forEach(function (r) { if (r[0] === f.reg) name = r[1]; });
  if (!lines.length) {
    body.push({ t: 'text', s: name + ' 노선도\n홈 탭 검색창에서 역명을 검색하시면\n경로 탐색이 가능합니다.', size: 13, color: 'sub', lh: 1.8, align: 'center', pad: [28, 40, 28, 40] });
    return body;
  }
  body.push({ t: 'text', s: name + ' 지하철 노선도', size: 16, bold: true, color: 'gold', align: 'center', pad: [14, 14, 14, 10] });
  lines.forEach(function (g) {
    var col = mapLineColor(g.line, f.th), kids = [];
    var xfer = function (s) { return lines.some(function (o) { return o.line !== g.line && o.stns.some(function (t) { return t[0] === s[0]; }); }); };
    kids.push({ t: 'pill', s: g.line + ' (' + g.stns.length + '개 역)', size: 13, bold: true, fill: col, tc: '#ffffff', ph: 12, pv: 6, r: 10, pad: [14, 8, 14, 8] });
    kids.push({ t: 'chips', pad: [14, 0, 14, 8], gap: 6, h: 30, onc: 'gold', onfg: '#121214',
      items: g.stns.map(function (s) {
        var idx = all.length; all.push([s[0], s[1]]);
        return { label: (xfer(s) ? '환승 ' : '') + s[0], on: false, act: { a: 'call', v: 'mr.' + idx } };
      }) });
    kids.forEach(function (k) { body.push(k); });
  });
  body.push({ t: 'text', s: '역명을 누르거나 홈 탭 검색창에서 역명을 입력하면 전국 최단 경로를 탐색할 수 있어요.', size: 12, color: 'sub', lh: 1.7, align: 'center', pad: [8, 16, 8, 24] });
  ctx.regionStns = all;
  return body;
}

// ── 역 팝업(웹 svgShowPopup) ──
function mapStationSheet(f) {
  var name = f.stn;
  if (!mapIsStationLabel(name)) return { ok: false, error: 'stn' };
  var lines = f.sl ? [f.sl].concat(mapLinesOf(name).filter(function (l) { return l !== f.sl; })) : mapLinesOf(name);
  if (f.sl && mapLinesOf(name).indexOf(f.sl) < 0) lines = mapLinesOf(name);
  var kids = [
    { t: 'bar', pad: [0, 0, 0, 4], title: name, btn: '닫기', act: { a: 'call', v: 'mp.close' } }
  ];
  if (lines.length) kids.push({ t: 'chips', pad: [0, 4, 0, 10], gap: 7, h: 30, onc: 'gold', onfg: '#ffffff', items: lines.slice(0, 12).map(function (l) { return { label: l, on: true, c: mapLineColor(l, f.th), act: { a: 'sel', v: 'mp.line' } }; }) });
  else kids.push({ t: 'text', s: '노선 정보 없음', size: 13, color: 'sub', pad: [0, 4, 0, 10] });
  kids.push({ t: 'row', pad: [0, 0, 0, 10], gap: 10, kids: [
    { t: 'button', s: '출발역', size: 14, h: 48, r: 12, bold: true, fill: '#0a84ff', line: 'none', tc: '#ffffff', pad: [0, 0, 0, 0], act: { a: 'call', v: 'mp.start' } },
    { t: 'button', s: '도착역', size: 14, h: 48, r: 12, bold: true, fill: '#ff2d55', line: 'none', tc: '#ffffff', pad: [0, 0, 0, 0], act: { a: 'call', v: 'mp.dest' } }] });
  kids.push({ t: 'button', s: '시간표', size: 14, h: 44, r: 12, bold: true, fill: 'card2', line: 'border', tc: '', pad: [0, 0, 0, 0], act: { a: 'call', v: 'mp.tt' } });
  var row = mapPickRow(name, f.sl);
  var out = { ok: true, v: 1, screen: 'mapstn', cover: 'tab', head: [], body: kids.map(mapSheetPad),
    info: { name: name, lines: lines, pick: row ? { name: row[0], line: row[1], la: row[2], lo: row[3] } : null } };
  return mapFinish(out);
}

// ── 시간표(웹 nmTtRender) ──
function mapClock(m) { var x = ((m % 1440) + 1440) % 1440; return (Math.floor(x / 60) < 10 ? '0' : '') + Math.floor(x / 60) + ':' + (x % 60 < 10 ? '0' : '') + (x % 60); }
function mapP2(n) { return (n < 10 ? '0' : '') + n; }
function mapTimetableSheet(f) {
  var name = f.stn;
  if (!mapIsStationLabel(name)) return { ok: false, error: 'stn' };
  var T = f.tt, lines = mapLinesOf(name).slice(0, 20), sel = (T.sel && typeof T.sel === 'object') ? T.sel : {}, res = (T.res && typeof T.res === 'object') ? T.res : {};
  var st = ['loading', 'ok', 'fail'].indexOf(T.st) >= 0 ? T.st : 'loading';
  var line = lines.indexOf(sel.line) >= 0 ? sel.line : '';
  // 처음엔 시간표 자료가 있는 첫 노선을 고른다(웹: 이 역의 모든 노선을 한 번에 묻고 자료 있는 첫 노선)
  if (!line) {
    for (var i = 0; i < lines.length; i++) { var r0 = res[lines[i] + '|-']; if (r0 && !r0.noData && r0.dirs) { line = lines[i]; break; } }
    if (!line) line = lines[0] || '';
  }
  var day = mapStr(sel.day, 6);
  var d = res[line + '|' + (day || '-')] || null;
  if (!day && d && d.dayCode) day = d.dayCode;
  var kids = [{ t: 'bar', pad: [0, 0, 0, 4], title: name + ' 시간표', btn: '닫기', act: { a: 'call', v: 'mp.close' } }];
  if (lines.length) kids.push({ t: 'chips', pad: [0, 4, 0, 6], gap: 6, h: 30, onc: 'gold', onfg: '#ffffff', items: lines.map(function (l, i) {
    var kc = res[l + '|-'], nod = !!(kc && kc.noData);
    var o = { label: l, on: l === line, act: { a: 'call', v: 'mt.l.' + i } };
    if (l === line) o.c = mapLineColor(l, f.th);
    else if (nod) o.label = l + ' (자료 없음)';
    return o;
  }) });
  var dir = null, dirs = d && d.dirs ? d.dirs : [], dirIdx = 0;
  if (d && d.days && d.days.length) kids.push({ t: 'chips', pad: [0, 0, 0, 6], gap: 6, h: 28, onc: 'gold', onfg: '#121214', items: d.days.map(function (x) {
    return { label: mapStr(x.label, 10) + (x.code === d.today ? ' · 오늘' : ''), on: x.code === d.dayCode, act: { a: 'call', v: 'mt.d.' + mapStr(x.code, 6) } };
  }) });
  if (dirs.length) {
    for (var k = 0; k < dirs.length; k++) if (dirs[k].dk === mapStr(sel.dk, 4)) { dir = dirs[k]; dirIdx = k; }
    if (!dir) { dir = dirs[0]; dirIdx = 0; }
    kids.push({ t: 'chips', pad: [0, 0, 0, 8], gap: 6, h: 30, onc: 'gold', onfg: '#121214', items: dirs.map(function (x, i) {
      return { label: x.toward ? mapStr(x.toward, 20) + ' 방면' : (x.dk === '상' ? '상행' : '하행'), on: x === dir, act: { a: 'call', v: 'mt.k.' + i } };
    }) });
  }
  var msg = function (s, sub) { return { t: 'text', s: s, size: 13, color: 'sub', lh: 1.7, align: 'center', pad: [28, 12, 28, 12] }; };
  if (st === 'loading' && !d) kids.push(msg('시간표를 불러오는 중…'));
  else if (st === 'fail' && !d) { kids.push(msg('시간표를 불러오지 못했어요.')); kids.push({ t: 'button', s: '다시 시도', size: 13, h: 40, r: 11, bold: true, fill: 'card2', line: 'border', tc: '', pad: [0, 0, 0, 0], act: { a: 'call', v: 'mt.retry' } }); }
  else if (!d || d.noData || !dir) kids.push(msg((line || '이 노선') + '의 시간표 자료를\n아직 받지 못했어요.\n실시간 도착정보는 경로 탐색 화면에서 확인할 수 있어요.'));
  else {
    var s = '첫차 ' + mapClock(dir.first) + ' · 막차 ' + mapClock(dir.last);
    if (dir.nextMin != null) s += ' · ' + (dir.tomorrow ? '내일 첫차 ' : '다음 열차 ') + mapClock(dir.nextMin);
    kids.push({ t: 'text', s: s, size: 12, color: 'gold', lh: 1.5, pad: [0, 0, 0, 8] });
    var rows = [], cur = null, nx = dir.nextMin;
    (dir.times || []).forEach(function (t) { var h = Math.floor(t / 60); if (!cur || cur.h !== h) { cur = { h: h, m: [] }; rows.push(cur); } cur.m.push(t); });
    rows.forEach(function (r) {
      var label = mapP2(r.h % 24) + '시' + (r.h >= 24 ? ' 익일' : ''), txt = label + '   ', hl = [];
      r.m.forEach(function (t, i) {
        var mm = mapP2(t % 60);
        if (nx != null && t === nx && !dir.tomorrow) hl.push([txt.length, txt.length + 2, '#f5a623']);
        txt += mm + (i < r.m.length - 1 ? '  ' : '');
      });
      var n = { t: 'box', s: txt, size: 13, lh: 1.5, color: 'text', fill: 'card2', line: 'border', r: 9, ip: [10, 7, 10, 7], pad: [0, 0, 0, 4] };
      if (hl.length) n.hl = hl;
      kids.push(n);
    });
  }
  var out = { ok: true, v: 1, screen: 'maptt', cover: 'tab', head: [], body: kids.map(mapSheetPad),
    info: { name: name, lines: lines, line: line, day: day, dk: dir ? dir.dk : '', dks: dirs.map(function (x) { return mapStr(x.dk, 4); }), days: (d && d.days ? d.days : []).map(function (x) { return mapStr(x.code, 6); }), need: (line && st !== 'fail' && !d) ? { line: line, day: day } : null } };
  return mapFinish(out);
}

function mapScreen(inp, factsIn, dataIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 18)) return { ok: false, error: 'cap' };
  var f = mapFacts(factsIn), ctx = {};
  if (f.part === 'stn') return mapStationSheet(f);
  if (f.part === 'tt') return mapTimetableSheet(f);
  var info = { mode: f.mode, reg: f.reg, flt: f.flt };
  if (f.q) { var fd = mapFind(f.q); info.find = fd; }
  if (f.gps) info.near = mapNearest(f.gps[0], f.gps[1]);
  if (f.part === 'h') {
    var head = mapHead(f);
    return mapFinish({ ok: true, v: 1, screen: 'map', cover: 'tab', head: head, body: [], info: info }, 'h');
  }
  var body;
  if (f.mode === 'subway' && f.reg === 'seoul') { body = [{ t: 'spacer', h: 1 }]; info.view = 'metro'; }
  else if (f.mode === 'subway') { body = mapRegionBody(f, ctx); info.view = 'list'; info.rs = ctx.regionStns || []; }
  else { body = mapBusBody ? mapBusBody(f) : [{ t: 'spacer', h: 1 }]; info.view = 'bus'; }
  return mapFinish({ ok: true, v: 1, screen: 'map', cover: 'tab', head: [], body: body, info: info }, 'b' + f.mode + f.reg);
}
var mapBusBody = null;

if (typeof module !== 'undefined' && module.exports) module.exports = { mapScreen: mapScreen, mapFacts: mapFacts, mapLinesOf: mapLinesOf, mapFind: mapFind, mapNearest: mapNearest, mapIsStationLabel: mapIsStationLabel, mapPickRow: mapPickRow, mapRegionLines: mapRegionLines, MAP_FILTERS: MAP_FILTERS };
