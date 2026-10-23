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
var MAP_SCREEN_V = 7;
var MAP_PLAY_RW = 100;                                                  // 이름/제목 오른쪽에 남겨 둘 놀이터 칸(90 + 사이 10) — 이름이 길면 이 칸만 남기고 이름이 좌우로 흐른다(앱 s142)
var MAP_STN_TOP = 36;                                                   // 웹 팝업 위 여백 16 + 손잡이 4 + 16 (손잡이는 앱 뷰가 그린다)
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
// 웹 _lineNumOf: '2호선' → '2', 'GTX-A' → 'A', 그 밖(경의중앙선·신분당선 등)은 ''
function mapLineNum(line) {
  var l = String(line || '').trim(), m = l.match(/(\d+)\s*호선/);
  if (m) return m[1];
  var g = l.match(/GTX[-\s]?([A-Z])/i);
  return g ? g[1].toUpperCase() : '';
}
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
  var part = ['h', 'b', 'stn', 'tt', 'br'].indexOf(f.part) >= 0 ? f.part : 'h';
  var reg = MAP_REGIONS.some(function (r) { return r[0] === f.reg; }) ? f.reg : 'seoul';
  var flt = MAP_FILTERS.some(function (r) { return r[0] === f.flt; }) ? f.flt : 'ALL';
  var gps = (Array.isArray(f.gps) && f.gps.length >= 2 && isFinite(Number(f.gps[0])) && isFinite(Number(f.gps[1]))) ? [Number(f.gps[0]), Number(f.gps[1])] : null;
  return { part: part, mode: f.mode === 'subway' ? 'subway' : 'bus', reg: reg, flt: flt, th: f.th === 'dark' ? 'dark' : 'pastel',
           stn: mapCleanName(f.stn), sl: mapStr(f.sl, 30), q: mapStr(f.q, 40), gps: gps, tt: (f.tt && typeof f.tt === 'object') ? f.tt : {}, bus: (f.bus && typeof f.bus === 'object') ? f.bus : null, br: (f.br && typeof f.br === 'object') ? f.br : null };
}

function mapSheetPad(n) { var p = Array.isArray(n.pad) ? n.pad.slice() : [0, 0, 0, 0]; p[0] += 16; p[2] += 16; if (n === mapSheetPad.first) p[1] += 10; n.pad = p; return n; }
function mapFinish(out, key) { out.rev = 'm' + MAP_SCREEN_V + ':' + mapHash(JSON.stringify([out.head, out.body, key || ''])); return out; }
function mapChip(label, on, v, c) { var o = { label: label, on: !!on, act: { a: 'cat', v: v } }; if (c) o.c = c; return o; }

// ── 머리줄 ──
function mapHead(f) {
  var head = [{ t: 'btog', v: 'u', h: 42, pad: [0, 0, 0, 0], items: [      // 웹 .map-inner-tabs: 밑줄 탭
    { label: '🚌 버스', on: f.mode === 'bus', act: { a: 'cat', v: 'm:bus' } },
    { label: '🚇 지하철', on: f.mode === 'subway', act: { a: 'cat', v: 'm:subway' } }] }];
  if (f.mode === 'subway') {
    head.push({ t: 'chips', pad: [14, 8, 14, 9], gap: 6, h: 27, fs: 11, px: 15, onc: 'gold', onfg: '#ffffff', offf: 'card2', offb: 'border', offt: 'sub',       // 웹 .rtab: 27px · 11px 굵게
      items: MAP_REGIONS.map(function (r) { return mapChip(r[1], f.reg === r[0], 'r:' + r[0]); }) });
    if (f.reg === 'seoul') {
      head.push({ t: 'inbar', pad: [12, 7, 12, 8], key: 'mq', hint: '🔍 역 검색 (예: 부평)', value: f.q, maxlen: 20, h: 33, btn: '📍 내 위치', act: { a: 'call', v: 'mp.loc' }, eact: { a: 'call', v: 'mp.find' } });      // 웹: 입력칸 + 파란 '📍 내 위치'(엔터 = 찾기)
      var items = [];
      MAP_FILTERS.forEach(function (x) { var it = { label: x[1], on: f.flt === x[0], act: { a: 'cat', v: 'f:' + x[0] } }; if (x[0] === 'ALL') it.pl = true; else { it.c = x[2]; it.oc = x[2]; } items.push(it); });     // 웹 .lf-btn: '전체'는 굵은 글자만 · 노선은 노선 색 테두리/글자(켜지면 노선 색으로 채움)
      head.push({ t: 'chips', pad: [10, 6, 10, 6], gap: 5, h: 27, fs: 11, px: 12, onc: 'gold', onfg: '#ffffff', items: items });
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
  var dk = f.th === 'dark';                                                                   // 웹 .nmp: 이름 22 굵게 · 노선 알약 · 🚉/🏁 버튼(패딩 15, 반지름 14) · 🕒 시간표(패딩 13). 손잡이는 앱이 맨 위에 그린다.
  var kids = [
    { t: 'text', s: name, size: 22, bold: true, color: 'text', lines: 1, rw: MAP_PLAY_RW, mq: true, pad: [0, MAP_STN_TOP, 0, 12] }
  ];
  if (lines.length) kids.push({ t: 'lpills', pad: [0, 0, 0, 20], gap: 7, items: lines.slice(0, 12).map(function (l) { var o = { s: l, c: mapLineColor(l, f.th) }, nm = mapLineNum(l); if (nm) o.num = nm; return o; }) });      // 웹 _linePillHtml: 호선 숫자(GTX 는 글자)가 있으면 왼쪽에 반투명 흰 동그라미 · 줄 바꿈 알약(누르는 알약 아님)
  else kids.push({ t: 'text', s: '노선 정보 없음', size: 12, color: 'sub', pad: [0, 0, 0, 20] });
  kids.push({ t: 'row', pad: [0, 0, 0, 10], gap: 10, kids: [
    { t: 'button', s: '🚉 출발역', size: 15, h: 48, r: 14, bold: true, fill: dk ? '#0a84ff' : '#1d9bf0', line: 'none', tc: '#ffffff', pad: [0, 0, 0, 0], act: { a: 'call', v: 'mp.start' } },
    { t: 'button', s: '🏁 도착역', size: 15, h: 48, r: 14, bold: true, fill: dk ? '#ff2d55' : '#e0455a', line: 'none', tc: '#ffffff', pad: [0, 0, 0, 0], act: { a: 'call', v: 'mp.dest' } }] });
  kids.push({ t: 'button', s: '🕒 시간표', size: 15, h: 44, r: 14, bold: true, fill: 'card2', line: 'none', tc: '', pad: [0, 0, 0, 36], act: { a: 'call', v: 'mp.tt' } });
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
  var kids = [{ t: 'bar', pad: [0, MAP_STN_TOP, 0, 4], rw: MAP_PLAY_RW, mq: true, title: name + ' 시간표', btn: '닫기', act: { a: 'call', v: 'mp.close' } }];
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
      if (hl.length) { n.hl = hl; n.fc = 'n' + mapHash(line + '|' + (day || '-') + '|' + (dir ? dir.dk : '')); }      // 지금 시각 다음 열차가 든 줄 — 앱이 시간표를 열 때 그 줄로 내려 보인다
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
  if (f.part === 'br') return mapBusRouteSheet(f);
  var info = { mode: f.mode, reg: f.reg, flt: f.flt };
  if (f.q) { var fd = mapFind(f.q); info.find = fd; }
  if (f.gps) info.near = mapNearest(f.gps[0], f.gps[1]);
  if (f.part === 'h') {
    var head = mapHead(f);
    return mapFinish({ ok: true, v: 1, screen: 'map', cover: 'tab', head: head, body: [], info: info }, 'h');
  }
  var body, bhead = [];
  if (f.mode === 'subway' && f.reg === 'seoul') { body = [{ t: 'spacer', h: 1 }]; info.view = 'metro'; }
  else if (f.mode === 'subway') { body = mapRegionBody(f, ctx); info.view = 'list'; info.rs = ctx.regionStns || []; }
  else { var bb = mapBusBody(f, info); body = bb.body; bhead = bb.head; info.view = 'bus'; }
  return mapFinish({ ok: true, v: 1, screen: 'map', cover: 'tab', head: bhead, body: body, info: info }, 'b' + f.mode + f.reg);
}
// ── 버스: 근처 정류장 + 도착정보(웹 loadMapNearStops / _fetchNearStops / _renderBusStop 의 규칙) ──
// 엔진은 "어느 주소를 받아 와라(need)" 만 말하고, 앱은 그 주소의 본문을 그대로 res 에 넣어 다시 보낸다. 해석은 모두 여기서 한다.
var MAP_TAGO_BASE = 'https://apis.data.go.kr/1613000/';
var MAP_SEOUL_BOX = [37.41, 37.72, 126.76, 127.19];
var MAP_EXIT_RE = /역\s*\d*\s*번?\s*출구|역\s*출구/;
var MAP_STOP_DUP_M = 3;
var MAP_NEAR_R = 300, MAP_NEAR_CAP = 40;                          // 내 주변 정류장: 지금 위치에서 300m 이내만(최대 40곳) — 300m 밖은 하나도 넣지 않는다(없으면 '찾지 못했어요')
var MAP_Q = 1000, MAP_QR = 450;                                    // 조회 좌표는 0.001°(약 100m) 칸의 가운데로 맞춘다(서버·기기 캐시가 같은 칸에서 맞는다) — 그만큼 반경을 300 → 450m 로 넉넉히 받고, 거리는 늘 내 진짜 좌표로 다시 잰다
function mapQ(v) { return Math.round(Number(v) * MAP_Q) / MAP_Q; }
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
    var hasXY = !(isNaN(gx) || isNaN(gy));
    if (!hasXY) { gx = lo; gy = la; }
    stops.push({ nm: nm, id: 'SEOUL:' + ars, ars: ars, la: gy, lo: gx, dist: (hasXY || !isFinite(d)) ? mapHav(la, lo, gy, gx) : d, src: 'topis' });
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
    stops.push({ nm: String(it.stationName || ''), id: 'GG:' + id, sid: String(id), no: it.mobileNo ? String(it.mobileNo) : '', la: a, lo: b, dist: mapHav(la, lo, a, b), src: 'gbis' });
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
    rows.push({ no: String(rt), sec: s1, prev: isFinite(n1) ? n1 : 0, cong: isFinite(cg) && cg > 0 ? cg : 0, low: low, dir: dir, tp: tp, rid: it.routeId !== undefined && it.routeId !== null ? String(it.routeId) : '' });
    if (s2 > 0) rows.push({ no: String(rt), sec: s2, prev: isFinite(n2) ? n2 : 0, cong: 0, low: false, dir: dir, tp: tp, rid: it.routeId !== undefined && it.routeId !== null ? String(it.routeId) : '' });
  });
  return rows;
}
function mapStopExit(s) { return MAP_EXIT_RE.test(s.nm || ''); }
function mapDedupStops(stops) {
  var key = function (v) { return String(v || '').replace(/\s/g, ''); }, out = [];
  stops.forEach(function (st) {
    var dup = null;
    for (var i = 0; i < out.length; i++) if (out[i].id === st.id || (key(out[i].nm) === key(st.nm) && mapHav(out[i].la, out[i].lo, st.la, st.lo) <= MAP_STOP_DUP_M)) { dup = out[i]; break; }   // 같은 정류장(같은 열쇠 · 같은 이름이 3m 안)만 하나로 — 길 건너편은 다른 방향이라 따로 둔다
    if (!dup) out.push(st); else if (st.dist < dup.dist) out[out.indexOf(dup)] = st;
  });
  return out;
}
function mapStopOrder(stops) {                       // 지금 위치에서 반경 300m 이내만(역 출구도 300m — 예외 없음 · 300m 밖은 하나도 넣지 않는다) · 역 출구 먼저 · 가까운 순 · 최대 40곳
  var byD = function (a, b) { return a.dist - b.dist; }, ex = [], rest = [];
  stops.forEach(function (s) {
    if (!isFinite(s.dist) || s.dist > MAP_NEAR_R) return;
    if (mapStopExit(s)) ex.push(s); else rest.push(s);
  });
  ex.sort(byD); rest.sort(byD);
  return ex.concat(rest).slice(0, MAP_NEAR_CAP);
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
  var need = [], ql = mapQ(la), qo = mapQ(lo);                     // 조회는 0.001° 칸의 가운데 좌표로(같은 칸이면 서버·기기 캐시가 바로 맞는다)
  if (mapInSeoul(la, lo)) need.push({ k: 'tp', url: 'http://ws.bus.go.kr/api/rest/stationinfo/getStationByPos?tmX=' + qo + '&tmY=' + ql + '&radius=' + MAP_QR });
  if (mapInGG(la, lo)) need.push({ k: 'gg', url: MAP_GBIS_BASE + 'busstationservice/v2/getBusStationAroundListv2?x=' + qo + '&y=' + ql + '&format=json' });
  need.push({ k: 'tn', url: MAP_TAGO_BASE + 'BusSttnInfoInqireService/getCrdntPrxmtSttnList?serviceKey=&gpsLati=' + ql + '&gpsLong=' + qo + '&numOfRows=50&pageNo=1&_type=json' });
  need.push({ k: 'd1', url: MAP_D1_BASE + '/bus-stops?lat=' + ql + '&lng=' + qo + '&radius=' + MAP_QR });          // s177: 서버 정류장 표(D1)도 동시에 — TAGO 와 같은 정류장을 0.3초에 준다(TAGO 는 느릴 때 5~10초)
  return need;
}
function mapStopsOf(k, text, la, lo) {                          // 한 출처 본문 → 300m 안 정류장 수
  if (!text) return 0;
  var s = k === 'tp' ? mapSeoulStops(text, la, lo) : k === 'gg' ? mapGbisStops(text, la, lo) : k === 'tn' ? mapTagoStops(text, la, lo) : k === 'd1' ? mapD1Stops(text, la, lo) : [];
  return mapStopOrder(mapDedupStops(s)).length;
}
/**
 * s177: 정류장 목록을 그리기에 충분히 받았나 — 출처를 우선순위 순서로 보아, 앞 출처가 정류장을 줬으면 뒤 출처를 기다리지 않는다.
 * 우선순위: 서울 TOPIS(tp) → 경기 GBIS(gg, 인천 상자 안은 TAGO 먼저) → TAGO 칸(tn 또는 D1 — 같은 정류장이라 먼저 온 쪽). 아직 안 온 출처(undefined)가 앞에 있으면 기다린다.
 * 서버가 이 함수로 '충분하면 나머지는 기다리지 않고' 도착정보 단계로 넘어간다(느린 TAGO 한 곳 때문에 5~10초 기다리지 않게). 모두 비면 true(빈 화면).
 */
function mapBusReady(f) {
  var b = f && f.bus, res = (b && b.res && typeof b.res === 'object') ? b.res : {}, la = Number(b && b.lat), lo = Number(b && b.lng);
  if (!isFinite(la) || !isFinite(lo)) return true;
  var steps = [], tago = ['tn', 'd1'];
  if (mapInSeoul(la, lo)) steps.push(['tp']);
  if (mapInGG(la, lo)) { if (mapGGPreferred(la, lo)) { steps.push(['gg']); steps.push(tago); } else { steps.push(tago); steps.push(['gg']); } }
  else steps.push(tago);
  for (var i = 0; i < steps.length; i++) {
    var unfinished = false;
    for (var j = 0; j < steps[i].length; j++) {
      var k = steps[i][j], v = res[k];
      if (v === undefined) { if (k !== 'd1') unfinished = true; continue; }                       // D1 은 덤(없어도 기다리지 않는다) — 기다리는 것은 tn
      if (mapStopsOf(k, v, la, lo) > 0) return true;
    }
    if (unfinished) return false;
  }
  return true;
}
function mapArrErr(t) {                                    // 공공 API 가 HTTP 200 으로 건넨 오류 봉투({"OpenAPI_ServiceResponse":…"HTTP_ERROR"})인가 — 도착정보가 아니다(웹 _safeParseResponse 와 같은 글자). 받지 못한 것으로 친다
  var x = typeof t === 'string' ? t : '';
  return x.length > 0 && x.length < 4000 && /OpenAPI_ServiceResponse|cmmMsgHeader|SERVICE_KEY_IS_NOT_REGISTERED_ERROR|LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR/.test(x);
}
function mapArrMissing(res, k) { return res[k] === undefined || mapArrErr(res[k]); }     // 아직 못 받았거나 오류 봉투만 받았다 → '도착정보 없음'이 아니라 '불러오는 중'으로 그리고 다시 받는다
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
      if (sec > 0) rows.push({ no: rt, sec: sec, prev: pm ? parseInt(pm[1], 10) : 0, cong: isFinite(cg) ? cg : 0, low: parseInt(mapXmlVal(ch, 'busType' + n), 10) === 1, dir: dir, rid: mapXmlVal(ch, 'busRouteId'), tp: '' });
    });
  });
  return rows;
}
function mapTagoArr(text) {
  return mapJsonItems(text).map(function (a) {
    return { no: String(a.routeno || a.routeNo || ''), sec: parseInt(a.arrtime || a.arrTime || 0, 10) || 0, prev: parseInt(a.arrprevstationcnt || a.arrPrevStationCnt || 0, 10) || 0,
             cong: parseInt(a.congestion || a.congestionCase || 0, 10) || 0, low: /저상/.test(String(a.vehicletp || '')), dir: '', rid: String(a.routeid || a.routeId || ''), tp: String(a.routetp || a.routeTp || '') };
  }).filter(function (r) { return r.no && r.sec > 0; });
}
function mapCdFmt(sec) {                                           // 웹 _busFmtCd: 곧 도착 · N초 · M분 SS초
  sec = Math.round(Number(sec));
  if (!isFinite(sec) || sec <= 0) return '곧 도착';
  if (sec < 60) return sec + '초';
  var m = Math.floor(sec / 60), r = sec % 60;
  return m + '분 ' + (r < 10 ? '0' : '') + r + '초';
}
function mapRouteColor(no) {                                       // 웹 _busNumClass 의 색: 광역(<100) 빨강 · 간선(<200) 파랑 · 지선(<500) 초록 · 순환(<1000) 보라 · 그 밖 회색
  var n = String(no || '');
  if (/^[0-9]+$/.test(n)) { var v = parseInt(n, 10); if (v < 100) return '#e74c3c'; if (v < 200) return '#0066FF'; if (v < 500) return '#00b341'; if (v < 1000) return '#9b59b6'; }
  return '#7f8c8d';
}
function mapDistFmt(m) { m = Math.round(m || 0); return m >= 1000 ? (m / 1000).toFixed(1) + 'km' : m + 'm'; }

// ── 웹 mapBusPanel: [주변 정류장][즐겨찾기][새로고침] 토글 → 고정 지도(주변만) → 정류장 카드 ──
var MAP_FAV_MAX = 12, MAP_ALIAS_MAX = 10, MAP_SRCS = ['topis', 'gbis', 'tago', 'd1'];
function mapStopKeep(s) {                                          // 즐겨찾기로 저장해도 도착정보를 다시 물을 수 있는 최소 값
  var o = { nm: mapStr(s.nm, 40), id: mapStr(s.id, 40), src: s.src, la: Number(s.la), lo: Number(s.lo) };
  ['ars', 'sid', 'no', 'city'].forEach(function (k) { if (s[k]) o[k] = mapStr(s[k], 30); });
  return o;
}
function mapBusFavs(b) {
  var out = [], seen = {};
  (b && Array.isArray(b.fav) ? b.fav : []).forEach(function (s) {
    if (!s || typeof s !== 'object' || out.length >= MAP_FAV_MAX) return;
    var id = mapStr(s.id, 40), nm = mapStr(s.nm, 40);
    if (!id || !nm || seen[id] || MAP_SRCS.indexOf(s.src) < 0) return;
    seen[id] = 1;
    var o = { nm: nm, id: id, src: s.src, la: Number(s.la), lo: Number(s.lo) };
    ['ars', 'sid', 'no', 'city'].forEach(function (k) { if (s[k]) o[k] = mapStr(s[k], 30); });
    out.push(o);
  });
  return out;
}
function mapBusAliases(b) {
  var out = {};
  if (b && b.al && typeof b.al === 'object' && !Array.isArray(b.al)) Object.keys(b.al).slice(0, 60).forEach(function (k) { var v = mapStr(b.al[k], MAP_ALIAS_MAX).trim(); if (v) out[mapStr(k, 40)] = v; });
  return out;
}
function mapBusToggle(vw) {
  return { t: 'btog', v: 'p', pad: [10, 12, 10, 12], h: 38, items: [
    { label: '📍 주변 정류장', on: vw === 'near', act: { a: 'call', v: 'mp.vw.near' } },
    { label: '⭐ 즐겨찾기', on: vw === 'fav', act: { a: 'call', v: 'mp.vw.fav' } }],
    rf: { label: '🔄', act: { a: 'call', v: 'mp.rf' } } };
}
function mapBusRows(rows, info, si) {                              // 노선+방면마다 한 줄: 노선 번호 · → 방면 · 첫 도착(+둘째 도착). 노선 id 가 있으면 줄을 눌러 노선 상세(info.rts[si][줄] = [노선 id, 번호, 종류])
  var by = {}, order = [];
  rows.forEach(function (r) { var k = r.no + '|' + r.dir; if (!by[k]) { by[k] = []; order.push(k); } by[k].push(r); });
  order.forEach(function (k) { by[k].sort(function (a, b) { return a.sec - b.sec; }); });
  order.sort(function (a, b) { return by[a][0].sec - by[b][0].sec; });
  var meta = [];
  var out = order.slice(0, 20).map(function (k, ri) {
    var g = by[k], r = g[0];
    var arr = g.slice(0, 2).map(function (x) { var o = { s: x.sec <= 1 ? '곧 도착' : mapCdFmt(x.sec), sec: Math.round(x.sec) }; if (x.prev > 0) o.p = x.prev + '번째전'; if (x.sec <= 60) o.soon = 1; return o; });
    var row = { no: r.no, c: mapRouteColor(r.no), a: arr, bell: 1 };
    if (r.dir) row.dir = '→ ' + r.dir + '방향';
    var rid = mapStr(r.rid, 40);
    meta.push([rid, mapStr(r.no, 16), mapStr(r.tp, 16)]);
    if (info && si >= 0 && rid) row.act = { a: 'call', v: 'br.' + si + '.' + ri };
    return row;
  });
  if (info && si >= 0) { if (!info.rts) info.rts = {}; info.rts[si] = meta; }
  return out;
}
// ── 주변 정류장 사용자 순서(웹 _applyBusNearOrder · busNearOrder): 앱이 끌어서 바꾼 정류장 열쇠 목록(b.ord)을 받아, 저장된 것은 그 순서로 · 저장 안 된 새 정류장은 뒤에 거리순.
function mapBusOrd(b) {
  var o = (b && Array.isArray(b.ord)) ? b.ord : [], out = [], i;
  for (i = 0; i < o.length && out.length < 60; i++) if (typeof o[i] === 'string' && o[i].length > 0 && o[i].length <= 64) out.push(o[i]);
  return out;
}
function mapApplyNearOrder(stops, ord) {
  if (!ord.length) return stops;
  var pos = {}, i, hit = false;
  for (i = 0; i < ord.length; i++) if (pos[ord[i]] === undefined) pos[ord[i]] = i;
  for (i = 0; i < stops.length; i++) if (pos[stops[i].id] !== undefined) hit = true;
  if (!hit) return stops;                                                         // 저장된 열쇠가 하나도 안 맞으면(다른 동네) 원래 순서
  return stops.map(function (s, k) { return { s: s, k: k }; }).sort(function (a, b) {
    var ia = pos[a.s.id], ib = pos[b.s.id];
    if (ia === undefined && ib === undefined) return a.k - b.k;                       // 둘 다 모르면 엔진이 정한 원래 순서(가까운 순 · 역 출구 먼저)
    if (ia === undefined) return 1;
    if (ib === undefined) return -1;
    return ia - ib;
  }).map(function (x) { return x.s; });
}
function mapBusCard(s, o) {
  var c = { t: 'bcard', k: s.id, nm: s.nm, mode: o.mode, on: !!o.on, pad: [12, 12, 0, 12], act: { a: 'call', v: 'mp.pc.' + o.i, id: s.id }, edit: { a: 'call', v: 'mp.al.' + o.i } };
  if (o.n) c.n = String(o.n);
  if (o.alias) c.al = o.alias;
  if (o.mode === 'near') { c.dist = mapDistFmt(s.dist); c.fv = o.fav ? 1 : 0; c.star = { a: 'call', v: 'mp.fv.' + o.i }; if (o.pi >= 0) c.pi = o.pi;
    if (o.i === 0) { c.rol = '끌어서 순서 변경'; c.rod = '완료'; }                              // 꾹 눌러 순서 바꾸기 줄 글(웹 #busReorderBar) — 첫 카드에만; 줄을 그리는 것은 앱
  }
  else {
    c.star = { a: 'call', v: 'mp.fv.' + o.i };                      // 즐겨찾기 화면의 × (제거)
    if (isFinite(s.la) && isFinite(s.lo)) c.map = { a: 'open', url: 'https://map.kakao.com/link/map/' + encodeURIComponent(s.nm || '정류장') + ',' + s.la + ',' + s.lo };
  }
  if (o.rows === null) c.ld = '도착 정보 불러오는 중...';
  else if (!o.rows.length) c.em = '도착정보 없음';
  else c.rows = o.rows;
  return c;
}
function mapBusArrView(s, res, key, info, si) {
  var txt = String(res[key] || '');
  var rows = s.src === 'topis' ? mapSeoulArr(txt) : s.src === 'gbis' ? mapGbisArr(txt) : mapTagoArr(txt);
  return mapBusRows(rows, info, si);
}
function mapBusTmap(pts, foc) {                                    // 고정 지도: 끌기·두 손가락 확대·± 단추·핀 누름은 앱, 핀·선택은 엔진
  return { t: 'tmap', h: 213, hv: 24, hmin: 137, hmax: 231, r: 0, pad: [0, 0, 0, 0], pts: pts, live: 1, foc: foc, bl: 1, hint: '숫자를 누르면 아래 정류장으로 이동해요' };
}
function mapBusBody(f, info) {
  var b = f.bus, vw = (b && b.vw === 'fav') ? 'fav' : 'near', al = mapBusAliases(b), sel = (b && isFinite(Number(b.sel))) ? Math.floor(Number(b.sel)) : -1;
  var head = [mapBusToggle(vw)], note = function (s) { return { t: 'text', s: s, size: 13, color: 'sub', align: 'center', lh: 1.7, pad: [28, 20, 20, 20] }; };
  if (vw === 'fav') {
    var favs = mapBusFavs(b), fres = (b && b.res && typeof b.res === 'object') ? b.res : {};
    info.bus = { st: 'ok', vw: 'fav', n: favs.length }; info.stops = favs.map(mapStopKeep);
    if (!favs.length) return { head: head, body: [
      { t: 'text', s: '⭐', size: 34, align: 'center', color: 'sub', pad: [44, 20, 6, 20] },
      { t: 'text', s: '즐겨찾기한 정류장이 없습니다', size: 14, bold: true, color: 'text', align: 'center', pad: [0, 20, 6, 20] },
      { t: 'text', s: '주변 정류장에서 별(☆)을 눌러\n원하는 정류장을 추가하세요', size: 12, color: 'sub', lh: 1.7, align: 'center', pad: [0, 20, 14, 20] },
      { t: 'button', s: '주변 정류장 보기', size: 13, h: 42, r: 12, bold: true, fill: 'gold', line: 'none', tc: '#121214', pad: [4, 80, 8, 80], act: { a: 'call', v: 'mp.vw.near' } }] };
    var pend = favs.some(function (s, i) { return mapArrMissing(fres, 'f' + i); });
    if (pend) info.bus = { st: 'need', vw: 'fav', need: favs.map(function (s, i) { return { k: 'f' + i, url: mapBusArrUrl(s) }; }) };
    var fb = [{ t: 'text', s: '⭐ 즐겨찾기 ' + favs.length + '개 · 30초마다 자동 갱신', size: 12, color: 'sub', pad: [10, 12, 0, 12] }];
    favs.forEach(function (s, i) { fb.push(mapBusCard(s, { mode: 'fav', i: i, alias: al[s.id], rows: pend ? null : mapBusArrView(s, fres, 'f' + i, info, i) })); });
    fb.push({ t: 'spacer', h: 16 });
    return { head: head, body: fb };
  }
  if (!b || !isFinite(Number(b.lat)) || !isFinite(Number(b.lng))) {
    info.bus = { st: 'noloc', vw: 'near' };
    return { head: head, body: [{ t: 'text', s: '내 주변 정류장 도착정보', size: 16, bold: true, color: 'gold', align: 'center', pad: [28, 24, 6, 24] },
            { t: 'text', s: '위 ‘내 위치’ 를 누르면\n가까운 정류장과 버스 도착 시간을 보여드려요.', size: 13, color: 'sub', lh: 1.8, align: 'center', pad: [4, 30, 10, 30] },
            { t: 'button', s: '내 위치로 찾기', size: 14, h: 46, r: 12, bold: true, fill: 'gold', line: 'none', tc: '#121214', pad: [8, 60, 8, 60], act: { a: 'call', v: 'mp.loc' } }] };
  }
  var la = Number(b.lat), lo = Number(b.lng), res = (b.res && typeof b.res === 'object') ? b.res : {};
  var need0 = mapBusNeedStops(la, lo);
  var mine = { la: la, lo: lo, k: 'm', n: '', l: '내 위치' };
  var wait = function (txt) { return { head: head.concat([mapBusTmap([mine], -1)]), body: [note(txt)] }; };
  if (!mapBusReady(f)) {                                                                // 출처 우선순위에서 앞 출처가 아직 안 왔다 — 아직 못 받은 주소만 받는다(받은 것은 다시 받지 않는다)
    var miss0 = need0.filter(function (n) { return res[n.k] === undefined; });
    if (miss0.length) { info.bus = { st: 'need', vw: 'near', need: miss0 }; return wait('주변 정류장 찾는 중...'); }
  }
  var stops = mapApplyNearOrder(mapBusStops(f), mapBusOrd(b));                          // 사용자가 끌어서 정한 순서(b.ord) 먼저 · 새 정류장은 뒤에 거리순
  if (!stops.length && res.d1 === undefined) {                                           // 공공 API 가 모두 비었으면 서버 정류장 표(D1)로
    info.bus = { st: 'need', vw: 'near', need: [{ k: 'd1', url: MAP_D1_BASE + '/bus-stops?lat=' + mapQ(la) + '&lng=' + mapQ(lo) + '&radius=' + MAP_QR }] };
    return wait('주변 정류장 찾는 중...');
  }
  if (!stops.length) { info.bus = { st: 'empty', vw: 'near' }; return wait('주변에 정류장을 찾지 못했어요.'); }
  // 정류장 지도: 정류장마다 번호 핀(좌표가 있는 것만) + 내 위치. 핀을 누르면 그 카드(g)로, 카드를 누르면 그 핀(pi)으로 간다.
  var pts = [], pidx = [], favSet = {};
  mapBusFavs(b).forEach(function (s) { favSet[s.id] = 1; });
  stops.forEach(function (s, i) {
    var sla = Number(s.la), slo = Number(s.lo);
    if (isFinite(sla) && isFinite(slo) && (sla !== 0 || slo !== 0)) { pidx[i] = pts.length; pts.push({ la: sla, lo: slo, k: 's', n: String(i + 1), l: s.nm || '정류장', v: 'mp.pm.' + i, g: s.id }); } else pidx[i] = -1;
  });
  pts.push(mine);
  info.stops = stops.map(mapStopKeep);
  var foc = (sel >= 0 && sel < stops.length) ? pidx[sel] : -1;
  head.push(mapBusTmap(pts, foc));
  // 정류장마다 따로 본다: 아직 못 받은 정류장은 '도착정보 없음'이 아니라 '불러오는 중'으로 두고, 못 받은 것만 다시 받으라고 한다(받은 것까지 다시 받지 않는다)
  var miss = [];
  stops.forEach(function (s, i) { if (mapArrMissing(res, 'a' + i)) miss.push({ k: 'a' + i, url: mapBusArrUrl(s) }); });
  if (miss.length) info.bus = { st: 'need', vw: 'near', need: miss };
  else info.bus = { st: 'ok', vw: 'near', n: stops.length };
  var body = [];
  stops.forEach(function (s, i) {
    body.push(mapBusCard(s, { mode: 'near', i: i, n: i + 1, alias: al[s.id], fav: !!favSet[s.id], pi: pidx[i], on: i === sel, rows: mapArrMissing(res, 'a' + i) ? null : mapBusArrView(s, res, 'a' + i, info, i) }));
  });
  body.push({ t: 'text', s: '도착 시간은 실시간 정보라 조금씩 달라질 수 있어요.', size: 11, color: 'sub', align: 'center', pad: [10, 16, 18, 16] });
  return { head: head, body: body };
}

// ═══ 노선 상세(웹 openBusRoute · _loadBusRouteData · _renderBusRoute): 노선 전체 정류장 + 지금 버스 위치 ═══
// 엔진은 "어느 주소를 받아 와라(need)" 만 말하고, 앱은 그 본문을 res 에 넣어 다시 보낸다(정류장 목록은 한 번 받으면 stn 으로 돌려받아 두고, 8초마다는 위치만 다시 받는다).
//   정류장: 경기(GBIS)이거나 시 코드를 모르면 GBIS 먼저(실패·빈 결과면 TAGO) · 그 밖은 TAGO.  위치: 정류장을 받은 쪽과 같은 출처.
var MAP_TAGO_RT_STN = MAP_TAGO_BASE + 'BusRouteInfoInqireService/getRouteAcctoThrghSttnList';
var MAP_TAGO_BUS_POS = MAP_TAGO_BASE + 'BusLcInfoInqireService/getRouteAcctoBusLcList';
var MAP_NODE_CITY = { ICB: '23', SEB: '11', BSB: '21', DGB: '22', GWB: '24', DJB: '25', USB: '26', SJB: '12' };
function mapBrCity(o) {                                            // 웹 _tagoCityCode: 정류장의 시 코드 → nodeId 접두어 → 좌표 상자 → 빈 값
  if (!o) return '';
  var cc = mapStr(o.city, 4).trim();
  if (cc && cc !== '0' && cc !== 'null' && cc !== 'undefined') return cc;
  var pre = String(o.id || '').toUpperCase().slice(0, 3);
  if (MAP_NODE_CITY[pre]) return MAP_NODE_CITY[pre];
  return (isFinite(Number(o.la)) && isFinite(Number(o.lo)) && (Number(o.la) || Number(o.lo))) ? mapCityOf(Number(o.la), Number(o.lo)) : '';
}
function mapBrFacts(b) {
  b = (b && typeof b === 'object') ? b : {};
  var o = (b.o && typeof b.o === 'object') ? { id: mapStr(b.o.id, 40), nm: mapStr(b.o.nm, 40), la: Number(b.o.la), lo: Number(b.o.lo), city: mapStr(b.o.city, 4) } : null;
  var stn = null;
  if (Array.isArray(b.stn) && b.stn.length) {
    stn = [];
    b.stn.slice(0, 400).forEach(function (r) {
      if (!Array.isArray(r) || r.length < 7) return;
      stn.push([parseInt(r[0], 10) || 0, mapStr(r[1], 40), mapStr(r[2], 40), mapStr(r[3], 20), Number(r[4]), Number(r[5]), r[6] === 0 || r[6] === 1 ? r[6] : -1]);
    });
    if (!stn.length) stn = null;
  }
  var res = (b.res && typeof b.res === 'object') ? b.res : {};
  var me = (Array.isArray(b.me) && b.me.length >= 2 && isFinite(Number(b.me[0])) && isFinite(Number(b.me[1]))) ? [Number(b.me[0]), Number(b.me[1])] : null;
  var pk = (b.pk && typeof b.pk === 'object' && mapStr(b.pk.n, 40)) ? { n: mapStr(b.pk.n, 40), i: mapStr(b.pk.i, 40) } : null;
  return { rid: mapStr(b.rid, 40), no: mapStr(b.no, 16), tp: mapStr(b.tp, 16), src: b.src === 'gbis' || b.src === 'topis' ? b.src : '', o: o, cc: mapStr(b.cc, 4) || mapBrCity(o),
           me: me, stn: stn, via: b.via === 'gg' || b.via === 'tago' ? b.via : '', res: res, sel: isFinite(Number(b.sel)) ? Math.floor(Number(b.sel)) : -1, pk: pk };
}
function mapBrStnTago(text) {
  var out = mapJsonItems(text).map(function (it) {
    return [parseInt(it.nodeord, 10) || 0, String(it.nodeid || it.nodeId || ''), String(it.nodenm || it.nodeNm || ''), it.nodeno === undefined || it.nodeno === null ? '' : String(it.nodeno),
            parseFloat(it.gpslati), parseFloat(it.gpslong), (String(it.updowncd) === '0' ? 0 : String(it.updowncd) === '1' ? 1 : -1)];
  }).filter(function (r) { return r[1] || r[2]; });
  out.sort(function (a, b) { return a[0] - b[0]; });
  return out.slice(0, 400);
}
function mapBrStnGbis(text) {
  var j = mapGgJson(text), out = [], turn = 0;
  if (!j || !mapGgOk(j)) return out;
  var items = mapGgList(j, ['busRouteStationList']);
  items.forEach(function (it) { var t = parseInt(it.turnSeq, 10); if (isFinite(t) && t > turn) turn = t; });
  items.forEach(function (it) {
    var sid = it.stationId, seq = parseInt(it.stationSeq, 10);
    if (!sid || !isFinite(seq)) return;
    out.push([seq, 'GG:' + sid, String(it.stationName || ''), it.mobileNo !== undefined && it.mobileNo !== null ? String(it.mobileNo) : '', parseFloat(it.y), parseFloat(it.x), (turn > 0 && seq > turn) ? 1 : 0]);
  });
  out.sort(function (a, b) { return a[0] - b[0]; });
  return out.slice(0, 400);
}
function mapBrPos(text, gg) {                                      // → { known, buses:[[순번, 차량번호]…] }  known = 응답을 제대로 받았다(비어 있어도)
  var t = String(text || '');
  if (!t) return { known: false, buses: [] };
  var buses = [];
  if (gg) {
    var j = mapGgJson(t);
    if (!j || !mapGgOk(j)) return { known: false, buses: [] };
    mapGgList(j, ['busLocationList']).forEach(function (it) { var q = parseInt(it.stationSeq, 10); if (isFinite(q)) buses.push([q, String(it.plateNo || '')]); });
    return { known: true, buses: buses };
  }
  var okJson = false;
  try { var o = JSON.parse(t); okJson = !!(o && o.response); } catch (e) { okJson = false; }
  if (!okJson) return { known: false, buses: [] };
  mapJsonItems(t).forEach(function (it) { buses.push([parseInt(it.nodeord, 10) || 0, String(it.vehicleno || '')]); });
  return { known: true, buses: buses };
}
function mapBrCls(ud) { return ud === 0 ? 'up' : ud === 1 ? 'down' : 'na'; }
function mapBusRouteSheet(f0) {
  var b = mapBrFacts(f0.br);
  if (!b.rid) return { ok: false, error: 'br' };
  var res = b.res, info = { br: { st: 'ok', need: [] } }, ib = info.br;
  var tryGG = b.src === 'gbis' || !b.cc;
  var stn = b.stn, via = b.via;
  var url = function (k) {
    var rid = b.rid.replace(/^GG:/, '');
    if (k === 'gs') return MAP_GBIS_BASE + 'busrouteservice/v2/getBusRouteStationListv2?routeId=' + encodeURIComponent(rid) + '&format=json';
    if (k === 'gp') return MAP_GBIS_BASE + 'buslocationservice/v2/getBusLocationListv2?routeId=' + encodeURIComponent(rid) + '&format=json';
    if (k === 'ts') return MAP_TAGO_RT_STN + '?serviceKey=&cityCode=' + encodeURIComponent(b.cc) + '&routeId=' + encodeURIComponent(b.rid) + '&numOfRows=300&pageNo=1&_type=json';
    return MAP_TAGO_BUS_POS + '?serviceKey=&cityCode=' + encodeURIComponent(b.cc) + '&routeId=' + encodeURIComponent(b.rid) + '&numOfRows=100&pageNo=1&_type=json';
  };
  var need = function (ks) { ib.st = 'need'; ib.need = ks.map(function (k) { return { k: k, url: url(k) }; }); };
  var title = function (rest) { return rest; };
  if (!stn) {
    if (tryGG) {
      if (res.gs === undefined) { need(['gs', 'gp']); }
      else {
        var g = mapBrStnGbis(res.gs);
        if (g.length) { stn = g; via = 'gg'; }
        else if (!b.cc) ib.st = 'fail';
        else if (res.ts === undefined) { need(['ts', 'tp']); }
        else { var t0 = mapBrStnTago(res.ts); if (t0.length) { stn = t0; via = 'tago'; } else ib.st = 'fail'; }
      }
    } else if (res.ts === undefined) { need(['ts', 'tp']); }
    else { var t1 = mapBrStnTago(res.ts); if (t1.length) { stn = t1; via = 'tago'; } else ib.st = 'fail'; }
  }
  var head = [{ t: 'brh', no: b.no || '-', tp: b.tp, c: mapRouteColor(b.no), act: { a: 'call', v: 'br.rf' }, bact: { a: 'call', v: 'br.x' } }];
  if (ib.st === 'fail') {
    return mapFinish({ ok: true, v: 1, screen: 'mapbr', cover: 'tab', head: head, body: [{ t: 'text', s: '노선 정류장 정보를 불러올 수 없어요.\n(API 응답 없음)', size: 13, color: 'sub', lh: 1.7, align: 'center', pad: [40, 20, 40, 20] }], foot: [], info: info }, 'brfail');
  }
  if (!stn) {
    return mapFinish({ ok: true, v: 1, screen: 'mapbr', cover: 'tab', head: head, body: [{ t: 'text', s: '🚌 노선 정보 불러오는 중...', size: 13, color: 'sub', align: 'center', pad: [40, 20, 40, 20] }], foot: [], info: info }, 'brload');
  }
  ib.stn = stn; ib.via = via; ib.cc = b.cc;
  var posKey = via === 'gg' ? 'gp' : 'tp';
  if (res[posKey] === undefined) { ib.st = 'need'; ib.need = [{ k: posKey, url: url(posKey) }]; }
  var P = mapBrPos(res[posKey], via === 'gg');
  ib.pos = { known: P.known, n: P.buses.length };
  var busAt = {};
  P.buses.forEach(function (x) { (busAt[x[0]] = busAt[x[0]] || []).push(x[1]); });
  // 기준 정류장: 눌러서 들어온 정류장(id → 좌표 300m → 이름) → 없으면 내 위치(800m)
  var org = b.o, myOrd = null, anchorNm = '', anchorIsStop = false, i, d, bd;
  if (org) {
    if (org.id) for (i = 0; i < stn.length; i++) { var sid = String(stn[i][1] || stn[i][3] || ''); if (sid && sid === org.id) { myOrd = stn[i][0]; break; } }
    if (myOrd === null && isFinite(org.la) && isFinite(org.lo)) {
      bd = 1e18;
      stn.forEach(function (r) { if (!isFinite(r[4]) || !isFinite(r[5])) return; d = mapHav(org.la, org.lo, r[4], r[5]); if (d < bd) { bd = d; myOrd = r[0]; } });
      if (bd > 300) myOrd = null;
    }
    if (myOrd === null && org.nm) {
      var onm = org.nm.replace(/\s/g, '');
      for (i = 0; i < stn.length; i++) if (String(stn[i][2]).replace(/\s/g, '') === onm) { myOrd = stn[i][0]; break; }
    }
    if (myOrd !== null) { anchorNm = org.nm || ''; anchorIsStop = true; }
  }
  if (myOrd === null && b.me) {
    bd = 1e18;
    stn.forEach(function (r) { if (!isFinite(r[4]) || !isFinite(r[5])) return; d = mapHav(b.me[0], b.me[1], r[4], r[5]); if (d < bd) { bd = d; myOrd = r[0]; } });
    if (bd > 800) myOrd = null;
  }
  var myEta = '', anchorLabel = anchorIsStop ? (anchorNm || '이 정류장') : '📍 내 위치';
  if (myOrd !== null) {
    var appr = null;
    P.buses.forEach(function (x) { if (x[0] <= myOrd && (appr === null || x[0] > appr)) appr = x[0]; });
    if (appr !== null) { var away = myOrd - appr; if (away <= 0) myEta = '곧 도착'; else myEta = away + '정거장 전 · 약 ' + Math.max(1, Math.round(away * 1.5)) + '분'; }
    else myEta = '접근 중인 버스 없음';
  }
  var groups = [], cur = null;
  stn.forEach(function (r, idx) { var cls = mapBrCls(r[6]); if (!cur || cur.cls !== cls) { cur = { cls: cls, items: [] }; groups.push(cur); } cur.items.push({ r: r, idx: idx }); });
  var myCls = '', myDirEnd = '', myDirTxt = '';
  if (myOrd !== null) {
    var mine = null; for (i = 0; i < stn.length; i++) if (stn[i][0] === myOrd) { mine = stn[i]; break; }
    if (mine) {
      myCls = mapBrCls(mine[6]); myDirTxt = myCls === 'up' ? '상행' : myCls === 'down' ? '하행' : '';
      for (i = stn.length - 1; i >= 0; i--) if (mapBrCls(stn[i][6]) === myCls) { myDirEnd = stn[i][2] || ''; break; }
    }
  }
  var first = stn[0][2] || '', last = stn[stn.length - 1][2] || '', runN = P.buses.length;
  var runTxt = P.known ? ('🚌 운행 ' + runN + '대') : (runN ? ('🚌 운행 ' + runN + '대') : '🚌 위치 확인 중...');
  var chips = [{ s: runTxt, k: runN ? 'on' : '' }, { s: '정류장 ' + stn.length + '개', k: '' }];
  if (myEta) chips.push({ s: anchorLabel + ' · ' + myEta, k: 'me' });
  var brt = { t: 'brt', a: anchorIsStop && myDirEnd ? anchorNm : first, b: anchorIsStop && myDirEnd ? myDirEnd : last, fin: anchorIsStop && myDirEnd ? 1 : 0, chips: chips };
  if (anchorIsStop && myDirEnd && myDirTxt) { brt.tag = myDirTxt; brt.tk = myCls; }
  head.push(brt);
  var body = [], sel = b.sel, pk = b.pk;
  groups.forEach(function (g, gi) {
    if (gi > 0) body.push({ t: 'brturn', s: '회차 ↻' });
    var endNm = g.items[g.items.length - 1].r[2] || '';
    body.push({ t: 'brsec', k: g.cls, s: endNm, tag: g.cls === 'up' ? '상행' : g.cls === 'down' ? '하행' : '운행' });
    g.items.forEach(function (o, k) {
      var r = o.r, ord = r[0], here = busAt[ord], isMine = myOrd !== null && ord === myOrd;
      var row = { t: 'brs', k: g.cls, i: o.idx, nm: r[2] || '', id: r[3] || r[1] || '', act: { a: 'call', v: 'br.p.' + o.idx } };
      if (k === 0) row.fl = 'f';
      if (k === g.items.length - 1) row.fl = (row.fl || '') + 'l';
      if (k < g.items.length - 1 && k % 2 === 0) row.ar = 1;
      var notes = [];
      if (here) { row.mk = 'bus'; row.here = 1; var vno = here.filter(Boolean).join(', '); notes.push({ s: '🚌 ' + (vno || '버스 도착'), k: 'bus' }); }
      else if (isMine) row.mk = 'me';
      if (isMine) { row.mine = 1; notes.push({ s: anchorLabel + ' 승차' + (myEta ? ' · ' + myEta : ''), k: 'me' }); }
      if (notes.length) row.notes = notes;
      var isStart = !!(pk && ((pk.i && pk.i === (r[1] || '')) || (!pk.i && pk.n === (r[2] || ''))));
      if (isStart) row.ps = 's'; else if (!pk && sel === o.idx) row.ps = 'p';
      row.lab = isStart ? '출발지' : (pk ? '도착지 ›' : '선택 ›');
      body.push(row);
    });
  });
  body.push({ t: 'spacer', h: 24 });
  // 아래 바(웹 _brPickRender): 출발지를 정했으면 안내 + [도착지는 역으로 설정][취소] · 정류장을 눌렀으면 [출발지로 설정]
  var foot = [];
  var msgN = function (s, hl) { var n = { t: 'text', s: s, size: 13.5, color: 'text', lh: 1.5, pad: [12, 16, 10, 16] }; if (hl) n.hl = [hl]; return n; };
  var bar = null;
  if (pk) {
    var s1 = '📍 출발지 ' + pk.n + '\n다른 정류장을 누르면 도착지로 설정됩니다', a1 = s1.indexOf(pk.n);
    var m1 = msgN(s1, [a1, a1 + pk.n.length]); var a2 = s1.indexOf('도착지로 설정'); m1.hl = [[a1, a1 + pk.n.length], [a2, a2 + 6]];
    bar = [m1, { t: 'row', pad: [0, 16, 14, 16], gap: 8, kids: [
      { t: 'button', s: '🚇 도착지는 역으로 설정', size: 15, h: 48, r: 14, bold: true, fill: '#2f7cf6', line: 'none', tc: '#ffffff', pad: [0, 0, 0, 0], act: { a: 'call', v: 'br.st' } },
      { t: 'button', s: '취소', size: 15, h: 48, r: 14, bold: true, fill: 'card2', line: 'border', tc: '', pad: [0, 0, 0, 0], act: { a: 'call', v: 'br.cx' } }] }];
  } else if (sel >= 0 && sel < stn.length) {
    var nm = stn[sel][2] || '', mm = msgN(nm, [0, nm.length]);
    bar = [mm, { t: 'row', pad: [0, 16, 14, 16], gap: 8, kids: [
      { t: 'button', s: '출발지로 설정', size: 15, h: 48, r: 14, bold: true, fill: '#2f7cf6', line: 'none', tc: '#ffffff', pad: [0, 0, 0, 0], act: { a: 'call', v: 'br.ss' } }] }];
  }
  if (bar) foot = [{ t: 'panel', pad: [0, 0, 0, 0], ip: [0, 0, 0, 0], r: 0, fill: 'card', line: 'border', kids: bar }];
  return mapFinish({ ok: true, v: 1, screen: 'mapbr', cover: 'tab', head: head, body: body, foot: foot, info: info }, 'br' + (pk ? 'p' : '') + sel);
}
if (typeof module !== 'undefined' && module.exports) module.exports = { mapQ: mapQ, mapLineNum: mapLineNum, mapCdFmt: mapCdFmt, mapBusRouteSheet: mapBusRouteSheet, mapBrCity: mapBrCity, mapBrStnTago: mapBrStnTago, mapBrStnGbis: mapBrStnGbis, mapBrPos: mapBrPos, mapCityOf: mapCityOf, mapGGPreferred: mapGGPreferred, mapGbisArr: mapGbisArr, mapScreen: mapScreen, mapFacts: mapFacts, mapLinesOf: mapLinesOf, mapFind: mapFind, mapNearest: mapNearest, mapIsStationLabel: mapIsStationLabel, mapPickRow: mapPickRow, mapRegionLines: mapRegionLines, mapDedupStops: mapDedupStops, mapStopOrder: mapStopOrder, mapApplyNearOrder: mapApplyNearOrder, mapBusOrd: mapBusOrd, mapBusReady: mapBusReady, MAP_FILTERS: MAP_FILTERS };
