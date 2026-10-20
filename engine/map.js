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
  else { body = mapBusBody(f, info); info.view = 'bus'; }
  return mapFinish({ ok: true, v: 1, screen: 'map', cover: 'tab', head: [], body: body, info: info }, 'b' + f.mode + f.reg);
}
// ── 버스: 근처 정류장 + 도착정보(웹 loadMapNearStops / _fetchNearStops / _renderBusStop 의 규칙) ──
// 엔진은 "어느 주소를 받아 와라(need)" 만 말하고, 앱은 그 주소의 본문을 그대로 res 에 넣어 다시 보낸다. 해석은 모두 여기서 한다.
var MAP_TAGO_BASE = 'https://apis.data.go.kr/1613000/';
var MAP_SEOUL_BOX = [37.41, 37.72, 126.76, 127.19];
var MAP_EXIT_RE = /역\s*\d*\s*번?\s*출구|역\s*출구/;
var MAP_STOP_DUP_M = 25, MAP_EXIT_NEAR_M = 350, MAP_NEAR_BASE = 6, MAP_NEAR_MAX = 16;
function mapInSeoul(la, lo) { return la >= MAP_SEOUL_BOX[0] && la <= MAP_SEOUL_BOX[1] && lo >= MAP_SEOUL_BOX[2] && lo <= MAP_SEOUL_BOX[3]; }
function mapXmlItems(text, tag) {
  var out = [], re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'g'), m;
  text = String(text || '');
  while ((m = re.exec(text)) !== null) { out.push(m[1]); if (out.length > 400) break; }
  return out;
}
function mapXmlVal(chunk, tag) {
  var m = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>').exec(chunk);
  return m ? String(m[1]).replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
}
function mapJsonItems(text) {
  try { var o = JSON.parse(String(text || '')), it = o.response.body.items.item || []; return Array.isArray(it) ? it : [it]; } catch (e) { return []; }
}
function mapSeoulStops(text, la, lo) {
  var stops = [];
  mapXmlItems(text, 'itemList').forEach(function (ch) {
    var ars = mapXmlVal(ch, 'arsId'), nm = mapXmlVal(ch, 'stationNm');
    if (!ars || !nm || String(ars).replace(/^0+/, '') === '') return;       // arsId 0 = 미정차
    var gx = parseFloat(mapXmlVal(ch, 'gpsX')), gy = parseFloat(mapXmlVal(ch, 'gpsY')), d = parseFloat(mapXmlVal(ch, 'dist'));
    if (isNaN(gx) || isNaN(gy)) { gx = lo; gy = la; }
    stops.push({ nm: nm, id: 'SEOUL:' + ars, ars: ars, la: gy, lo: gx, dist: isFinite(d) ? d : mapHav(la, lo, gy, gx), src: 'topis' });
  });
  return stops;
}
function mapTagoStops(text, la, lo) {
  var stops = [];
  mapJsonItems(text).forEach(function (it) {
    var a = parseFloat(it.gpslati), b = parseFloat(it.gpslong);
    if (isNaN(a) || isNaN(b) || !it.nodeid) return;
    stops.push({ nm: String(it.nodenm || ''), id: String(it.nodeid), no: it.nodeno ? String(it.nodeno) : '', city: it.citycode ? String(it.citycode) : '', la: a, lo: b, dist: mapHav(la, lo, a, b), src: 'tago' });
  });
  return stops;
}
var MAP_GG_BOX = [36.9, 38.3, 126.3, 127.9];                    // 경기 전역(남,북,서,동) — 웹 _GG_BOX
var MAP_INCHEON_BOX = [37.29, 37.66, 126.34, 126.81];            // 인천: 이 안에서는 TAGO 가 정상이라 먼저 본다(웹 _isGGPreferred)
var MAP_D1_BASE = 'https://gentle-lab-7e47subway-api.phg0643.workers.dev';
var MAP_GBIS_BASE = 'https://apis.data.go.kr/6410000/';
var MAP_GG_MAX_ARR_SEC = 3600;
var MAP_CITY_BOX = [['23', 37.29, 37.66, 126.34, 126.81], ['11', 37.41, 37.72, 126.76, 127.19], ['21', 34.99, 35.40, 128.75, 129.32], ['22', 35.61, 36.02, 128.35, 128.77],
                    ['24', 35.03, 35.26, 126.64, 126.96], ['25', 36.18, 36.50, 127.25, 127.56], ['26', 35.44, 35.72, 129.06, 129.47], ['12', 36.42, 36.72, 127.15, 127.40]];
function mapInBox(b, la, lo) { return la >= b[0] && la <= b[1] && lo >= b[2] && lo <= b[3]; }
function mapInGG(la, lo) { return mapInBox(MAP_GG_BOX, la, lo); }
function mapGGPreferred(la, lo) { return mapInGG(la, lo) && !mapInBox(MAP_INCHEON_BOX, la, lo); }
function mapCityOf(la, lo) {                                      // D1 보조 정류장에 시 코드가 없을 때 좌표 상자로 추정(웹 _tagoCityCode)
  for (var i = 0; i < MAP_CITY_BOX.length; i++) { var b = MAP_CITY_BOX[i]; if (la >= b[1] && la <= b[2] && lo >= b[3] && lo <= b[4]) return b[0]; }
  return '';
}
function mapGgJson(text) { var t = String(text || '').trim(); if (!t || t.charAt(0) !== '{') return null; try { return JSON.parse(t); } catch (e) { return null; } }
function mapGgOk(j) {                                             // resultCode 0(정상)·4(결과 없음)만 정상
  var hd = j && ((j.response && j.response.msgHeader) || j.msgHeader);
  if (!hd) return false;
  var cd = String(hd.resultCode);
  return cd === '0' || cd === '4';
}
function mapGgList(j, keys) {
  var body = j && ((j.response && j.response.msgBody) || j.msgBody), v = null, i;
  if (!body) return [];
  for (i = 0; i < keys.length; i++) if (body[keys[i]] !== undefined && body[keys[i]] !== null) { v = body[keys[i]]; break; }
  if (v === null) { var ks = Object.keys(body); for (i = 0; i < ks.length; i++) if (Array.isArray(body[ks[i]])) { v = body[ks[i]]; break; } }
  if (v === null || v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}
function mapGbisStops(text, la, lo) {
  var j = mapGgJson(text), stops = [];
  if (!j || !mapGgOk(j)) return stops;
  mapGgList(j, ['busStationAroundList', 'busStationList']).forEach(function (it) {
    var id = it.stationId, a = parseFloat(it.y), b = parseFloat(it.x);
    if (!id || isNaN(a) || isNaN(b)) return;
    var d = parseFloat(it.distance);
    stops.push({ nm: String(it.stationName || ''), id: 'GG:' + id, sid: String(id), no: it.mobileNo ? String(it.mobileNo) : '', la: a, lo: b, dist: isFinite(d) ? d : mapHav(la, lo, a, b), src: 'gbis' });
  });
  return stops;
}
function mapD1Stops(text, la, lo) {                               // 서버 정류장 표(D1) — 공공 API 가 모두 비었을 때의 보조
  var j = null, stops = [];
  try { j = JSON.parse(String(text || '')); } catch (e) { return stops; }
  (j && Array.isArray(j.stops) ? j.stops : []).forEach(function (s) {
    var a = Number(s.lat), b = Number(s.lng);
    if (!s.node_id || !isFinite(a) || !isFinite(b)) return;
    var cc = (s.city_code && String(s.city_code) !== '0') ? String(s.city_code) : '';
    stops.push({ nm: String(s.node_nm || ''), id: String(s.node_id), no: '', city: cc || mapCityOf(a, b), la: a, lo: b, dist: mapHav(la, lo, a, b), src: 'd1' });
  });
  stops.sort(function (x, y) { return x.dist - y.dist; });
  return stops;
}
function mapGbisRouteType(cd) {
  var m = { 11: '직행좌석', 12: '좌석', 13: '일반', 14: '광역급행', 15: '따복', 16: '순환', 21: '직행좌석', 22: '좌석', 23: '일반', 30: '마을', 41: '고속시외', 42: '좌석시외', 43: '시외', 51: '리무진공항', 52: '좌석공항', 53: '공항' };
  return m[parseInt(cd, 10)] || '';
}
function mapGbisArr(text) {
  var j = mapGgJson(text), rows = [];
  if (!j || !mapGgOk(j)) return rows;
  mapGgList(j, ['busArrivalList']).forEach(function (it) {
    var rt = it.routeName;
    if (rt === undefined || rt === null || rt === '') return;
    if (String(it.flag || '') === 'STOP') return;                   // 운행종료
    var sec = function (s, m) { var v = parseInt(s, 10); if (isFinite(v) && v > 0) return v; var mm = parseInt(m, 10); return (isFinite(mm) && mm > 0) ? mm * 60 : 0; };
    var s1 = sec(it.predictTimeSec1, it.predictTime1), s2 = sec(it.predictTimeSec2, it.predictTime2);
    if (s1 > MAP_GG_MAX_ARR_SEC) s1 = 0;
    if (s2 > MAP_GG_MAX_ARR_SEC) s2 = 0;
    if (s1 <= 0 && s2 <= 0) return;
    var n1 = parseInt(it.locationNo1, 10), n2 = parseInt(it.locationNo2, 10);
    if (s1 <= 0) { s1 = s2; s2 = 0; n1 = n2; }
    var dir = String(it.routeDestName || '').trim(), tp = mapGbisRouteType(it.routeTypeCd), low = parseInt(it.lowPlate1, 10) === 1, cg = parseInt(it.crowded1, 10);
    rows.push({ no: String(rt), sec: s1, prev: isFinite(n1) ? n1 : 0, cong: isFinite(cg) && cg > 0 ? cg : 0, low: low, dir: dir, tp: tp });
    if (s2 > 0) rows.push({ no: String(rt), sec: s2, prev: isFinite(n2) ? n2 : 0, cong: 0, low: false, dir: dir, tp: tp });
  });
  return rows;
}
function mapStopExit(s) { return MAP_EXIT_RE.test(s.nm || ''); }
function mapDedupStops(stops) {
  var key = function (v) { return String(v || '').replace(/\s/g, ''); }, out = [];
  stops.forEach(function (st) {
    var dup = null;
    for (var i = 0; i < out.length; i++) if (key(out[i].nm) === key(st.nm) && mapHav(out[i].la, out[i].lo, st.la, st.lo) <= MAP_STOP_DUP_M) { dup = out[i]; break; }
    if (!dup) out.push(st); else if (st.dist < dup.dist) out[out.indexOf(dup)] = st;
  });
  return out;
}
function mapStopOrder(stops) {                       // 가까운 순 + 역 출구(350m 안)는 전부 앞으로, 길이는 출구 수만큼 늘림
  var byD = function (a, b) { return a.dist - b.dist; }, ex = [], rest = [];
  stops.forEach(function (s) { if (mapStopExit(s) && s.dist <= MAP_EXIT_NEAR_M) ex.push(s); else rest.push(s); });
  ex.sort(byD); rest.sort(byD);
  var lim = ex.length ? Math.min(MAP_NEAR_MAX, Math.max(MAP_NEAR_BASE, ex.length + 3)) : MAP_NEAR_BASE;
  return ex.concat(rest).slice(0, lim);
}
function mapBusStops(f) {
  var b = f.bus, res = b.res || {}, la = Number(b.lat), lo = Number(b.lng);
  var s = res.tp ? mapSeoulStops(res.tp, la, lo) : [];                                   // 서울: TOPIS 먼저
  if (!s.length) {
    var gg = res.gg ? mapGbisStops(res.gg, la, lo) : [], tn = res.tn ? mapTagoStops(res.tn, la, lo) : [];
    s = mapGGPreferred(la, lo) ? (gg.length ? gg : tn) : (tn.length ? tn : gg);          // 경기(인천 상자 밖)는 GBIS 먼저, 인천 상자 안은 TAGO 먼저
  }
  if (!s.length && res.d1) s = mapD1Stops(res.d1, la, lo);
  return mapStopOrder(mapDedupStops(s));
}
function mapBusNeedStops(la, lo) {
  var need = [];
  if (mapInSeoul(la, lo)) need.push({ k: 'tp', url: 'http://ws.bus.go.kr/api/rest/stationinfo/getStationByPos?tmX=' + lo + '&tmY=' + la + '&radius=800' });
  if (mapInGG(la, lo)) need.push({ k: 'gg', url: MAP_GBIS_BASE + 'busstationservice/v2/getBusStationAroundListv2?x=' + lo + '&y=' + la + '&format=json' });
  need.push({ k: 'tn', url: MAP_TAGO_BASE + 'BusSttnInfoInqireService/getCrdntPrxmtSttnList?serviceKey=&gpsLati=' + la + '&gpsLong=' + lo + '&numOfRows=50&pageNo=1&_type=json' });
  return need;
}
function mapBusArrUrl(s) {
  if (s.src === 'topis') return 'http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid?arsId=' + encodeURIComponent(s.ars);
  if (s.src === 'gbis') return MAP_GBIS_BASE + 'busarrivalservice/v2/getBusArrivalListv2?stationId=' + encodeURIComponent(s.sid) + '&format=json';
  return MAP_TAGO_BASE + 'ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList?serviceKey=&cityCode=' + encodeURIComponent(s.city) + '&nodeId=' + encodeURIComponent(s.id) + '&_type=json';
}
function mapSecOfMsg(msg) {
  var t = String(msg || '');
  if (/곧 도착|출발대기|운행종료/.test(t)) return /곧 도착/.test(t) ? 1 : 0;
  var mm = /(\d+)\s*분/.exec(t), ss = /(\d+)\s*초/.exec(t);
  return (mm ? parseInt(mm[1], 10) * 60 : 0) + (ss ? parseInt(ss[1], 10) : 0);
}
function mapSeoulArr(text) {
  var rows = [];
  if (/Key인증실패|SERVICE\s*KEY\s*IS\s*NOT\s*REGISTERED/i.test(text) || /<headerCd>\s*[1-9]/.test(text)) return rows;
  mapXmlItems(text, 'itemList').forEach(function (ch) {
    var rt = mapXmlVal(ch, 'rtNm') || mapXmlVal(ch, 'busRouteAbrv');
    if (!rt) return;
    var dir = mapXmlVal(ch, 'adirection') || mapXmlVal(ch, 'nxtStn');
    [1, 2].forEach(function (n) {
      var msg = mapXmlVal(ch, 'arrmsg' + n), t = parseInt(mapXmlVal(ch, 'traTime' + n), 10);
      var sec = (isFinite(t) && t > 0) ? t : mapSecOfMsg(msg);
      var pm = /(\d+)\s*번째/.exec(msg), cg = parseInt(mapXmlVal(ch, 'congestion' + n), 10);
      if (sec > 0) rows.push({ no: rt, sec: sec, prev: pm ? parseInt(pm[1], 10) : 0, cong: isFinite(cg) ? cg : 0, low: parseInt(mapXmlVal(ch, 'busType' + n), 10) === 1, dir: dir });
    });
  });
  return rows;
}
function mapTagoArr(text) {
  return mapJsonItems(text).map(function (a) {
    return { no: String(a.routeno || a.routeNo || ''), sec: parseInt(a.arrtime || a.arrTime || 0, 10) || 0, prev: parseInt(a.arrprevstationcnt || a.arrPrevStationCnt || 0, 10) || 0,
             cong: parseInt(a.congestion || a.congestionCase || 0, 10) || 0, low: /저상/.test(String(a.vehicletp || '')), dir: '' };
  }).filter(function (r) { return r.no && r.sec > 0; });
}
function mapArrFmt(sec) { if (!sec || sec <= 1) return '곧 도착'; if (sec < 60) return sec + '초'; var m = Math.round(sec / 60); return m <= 1 ? '곧 도착' : m + '분'; }
function mapRouteColor(no) {
  var n = String(no || '');
  if (/^[0-9]+$/.test(n)) { var v = parseInt(n, 10); if (v < 100) return '#d9433a'; if (v < 200) return '#2f6fdb'; if (v < 500) return '#2e9e5b'; if (v < 1000) return '#e0a020'; }
  return '#7a7f8c';
}
function mapDistFmt(m) { m = Math.round(m || 0); return m >= 1000 ? (m / 1000).toFixed(1) + 'km' : m + 'm'; }
function mapBusStopView(s, rows) {
  var kids = [{ t: 'text', s: s.nm + '  ' + mapDistFmt(s.dist) + (s.no || s.ars ? '  ·  ' + (s.no || s.ars) : ''), size: 14, bold: true, color: 'text', pad: [12, 14, 6, 2] }];
  if (isFinite(s.la) && isFinite(s.lo)) {                          // 웹 _busShowMap(정류장 위치 지도) 대신 외부 지도 앱으로 — 위치 보기 · 길찾기
    var en = encodeURIComponent(s.nm || '정류장');
    kids.push({ t: 'row', pad: [0, 14, 4, 14], gap: 8, kids: [
      { t: 'button', s: '위치 보기', size: 12, h: 34, r: 9, bold: true, fill: 'card2', line: 'border', tc: 'sub', act: { a: 'open', url: 'https://map.kakao.com/link/map/' + en + ',' + s.la + ',' + s.lo } },
      { t: 'button', s: '길찾기', size: 12, h: 34, r: 9, bold: true, fill: 'card2', line: 'border', tc: 'sub', act: { a: 'open', url: 'https://map.kakao.com/link/to/' + en + ',' + s.la + ',' + s.lo } }] });
  }
  var by = {}, order = [];
  rows.forEach(function (r) { var k = r.no + '|' + r.dir; if (!by[k]) { by[k] = []; order.push(k); } by[k].push(r); });
  order.forEach(function (k) { by[k].sort(function (a, b) { return a.sec - b.sec; }); });
  order.sort(function (a, b) { return by[a][0].sec - by[b][0].sec; });
  if (!order.length) kids.push({ t: 'text', s: '도착 정보 없음', size: 12, color: 'sub', pad: [2, 14, 6, 6] });
  order.slice(0, 8).forEach(function (k) {
    var g = by[k], r = g[0], cg = ['', '여유', '보통', '혼잡', '매우혼잡'][r.cong] || '';
    var s1 = r.no, hl = [[0, s1.length, mapRouteColor(r.no)]];
    var txt = s1 + (r.tp ? ' ' + r.tp : '') + '  ' + mapArrFmt(r.sec) + (r.prev > 0 ? ' · ' + r.prev + '번째 전' : '') + (cg ? ' · ' + cg : '') + (r.low ? ' · 저상' : '');
    if (g[1]) txt += '\n' + ' '.repeat(s1.length + (r.tp ? r.tp.length + 1 : 0) + 2) + mapArrFmt(g[1].sec) + (g[1].prev > 0 ? ' · ' + g[1].prev + '번째 전' : '');
    if (r.dir) txt += '\n' + r.dir + ' 방면';
    kids.push({ t: 'box', s: txt, hl: hl, size: 13, lh: 1.5, color: 'text', fill: 'card2', line: 'border', r: 9, ip: [10, 7, 10, 7], pad: [0, 14, 4, 14] });
  });
  return kids;
}
function mapBusBody(f, info) {
  var b = f.bus;
  if (!b || !isFinite(Number(b.lat)) || !isFinite(Number(b.lng))) {
    info.bus = { st: 'noloc' };
    return [{ t: 'text', s: '내 주변 정류장 도착정보', size: 16, bold: true, color: 'gold', align: 'center', pad: [28, 24, 6, 24] },
            { t: 'text', s: '위 ‘내 위치’ 를 누르면\n가까운 정류장과 버스 도착 시간을 보여드려요.', size: 13, color: 'sub', lh: 1.8, align: 'center', pad: [4, 30, 10, 30] },
            { t: 'button', s: '내 위치로 찾기', size: 14, h: 46, r: 12, bold: true, fill: 'gold', line: 'none', tc: '#121214', pad: [8, 60, 8, 60], act: { a: 'call', v: 'mp.loc' } }];
  }
  var la = Number(b.lat), lo = Number(b.lng), res = (b.res && typeof b.res === 'object') ? b.res : {};
  var need0 = mapBusNeedStops(la, lo);
  if (need0.some(function (n) { return res[n.k] === undefined; })) { info.bus = { st: 'need', need: need0 }; return [{ t: 'text', s: '주변 정류장 찾는 중...', size: 13, color: 'sub', align: 'center', pad: [40, 20, 40, 20] }]; }
  var stops = mapBusStops(f);
  if (!stops.length && res.d1 === undefined) {                                           // 공공 API 가 모두 비었으면 서버 정류장 표(D1)로
    info.bus = { st: 'need', need: [{ k: 'd1', url: MAP_D1_BASE + '/bus-stops?lat=' + la + '&lng=' + lo + '&radius=800' }] };
    return [{ t: 'text', s: '주변 정류장 찾는 중...', size: 13, color: 'sub', align: 'center', pad: [40, 20, 40, 20] }];
  }
  if (!stops.length) { info.bus = { st: 'empty' }; return [{ t: 'text', s: '주변 800m 안에 정류장을 찾지 못했어요.', size: 13, color: 'sub', align: 'center', lh: 1.7, pad: [40, 20, 20, 20] }]; }
  if (res.a0 === undefined) { info.bus = { st: 'need', need: stops.map(function (s, i) { return { k: 'a' + i, url: mapBusArrUrl(s) }; }) }; return [{ t: 'text', s: '도착정보 가져오는 중...', size: 13, color: 'sub', align: 'center', pad: [40, 20, 40, 20] }]; }
  var body = [{ t: 'text', s: '내 주변 정류장 ' + stops.length + '곳', size: 12, color: 'sub', pad: [10, 14, 0, 4] }];
  stops.forEach(function (s, i) {
    var txt = String(res['a' + i] || ''), rows = s.src === 'topis' ? mapSeoulArr(txt) : s.src === 'gbis' ? mapGbisArr(txt) : mapTagoArr(txt);
    mapBusStopView(s, rows).forEach(function (n) { body.push(n); });
  });
  body.push({ t: 'button', s: '내 위치로 다시 찾기', size: 13, h: 42, r: 12, bold: true, fill: 'card2', line: 'border', tc: '', pad: [10, 60, 4, 60], act: { a: 'call', v: 'mp.loc' } });
  body.push({ t: 'text', s: '도착 시간은 실시간 정보라 조금씩 달라질 수 있어요.', size: 11, color: 'sub', align: 'center', pad: [6, 16, 16, 16] });
  info.bus = { st: 'ok', n: stops.length };
  return body;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { mapCityOf: mapCityOf, mapGGPreferred: mapGGPreferred, mapGbisArr: mapGbisArr, mapScreen: mapScreen, mapFacts: mapFacts, mapLinesOf: mapLinesOf, mapFind: mapFind, mapNearest: mapNearest, mapIsStationLabel: mapIsStationLabel, mapPickRow: mapPickRow, mapRegionLines: mapRegionLines, mapDedupStops: mapDedupStops, mapStopOrder: mapStopOrder, MAP_FILTERS: MAP_FILTERS };
