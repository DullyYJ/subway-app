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
// s208 (YJ: 수도권과 지방에 같은 역 이름이 있어도 구분 — 지도는 수도권 전용): 노선 이름 앞글자로 어느 권역인지 가리고, 역 이름만으로 노선을 모을 때 같은 권역 노선만 모은다.
//   예) '중동'은 수도권에서는 1호선만, 부산에서는 부산 2호선만. 그 권역에 그 이름이 아예 없으면 예전처럼 전체(빈 팝업이 되지 않게).
function mapRegionOfLine(line) {
  var l = String(line || '');
  for (var k in MAP_REGION_PREFIX) if (MAP_REGION_PREFIX.hasOwnProperty(k) && l.indexOf(MAP_REGION_PREFIX[k]) === 0) return k;
  return 'seoul';
}
function mapRegOf(f) {                              // 역 팝업·시간표가 속한 권역: 고른 노선이 있으면 그 노선의 권역, 아니면 지금 보는 권역(없으면 수도권)
  if (f && f.sl) return mapRegionOfLine(f.sl);
  return (f && MAP_REGIONS.some(function (r) { return r[0] === f.reg; })) ? f.reg : 'seoul';
}
function mapLinesOf(name, reg) {
  var T = mapStnTable(), out = [], i;
  var add = function (nm, rg) { for (i = 0; i < T.length; i++) if (T[i][0] === nm && (!rg || mapRegionOfLine(T[i][1]) === rg) && out.indexOf(T[i][1]) < 0) out.push(T[i][1]); };
  add(name, reg);
  if (MAP_ALIAS[name]) add(MAP_ALIAS[name], reg);
  if (reg && !out.length) { add(name, ''); if (MAP_ALIAS[name]) add(MAP_ALIAS[name], ''); }
  return out;
}
function mapCleanName(s) { return mapStr(s, 40).replace(/\s+/g, '').trim(); }
function mapIsStationLabel(name) {                 // 지도 글자가 역 이름처럼 보이는가(웹 _nmOnStation 의 앞부분)
  if (!name || name.length < 2) return false;
  for (var i = 0; i < MAP_SKIP.length; i++) if (name.indexOf(MAP_SKIP[i]) >= 0) return false;
  return true;
}
// 역 하나(이름 + 고른 노선 힌트) → 출발/도착으로 쓸 행(웹 svgSetRoute: 노선 힌트 → 같은 이름 첫 행)
function mapPickRow(name, line, reg) {
  var T = mapStnTable(), i, first = null, firstAny = null;
  for (i = 0; i < T.length; i++) {
    if (T[i][0] !== name) continue;
    if (line && T[i][1] === line) return T[i];
    if (!firstAny) firstAny = T[i];
    if (!first && (!reg || mapRegionOfLine(T[i][1]) === reg)) first = T[i];       // 노선을 못 골랐으면 같은 권역의 행을 먼저(같은 이름의 지방 역이 먼저 걸리지 않게)
  }
  return first || firstAny;
}
// 역 검색(웹 mapSearchStation): 공백 뺀 이름이 같은 것 → 포함하는 것 → 그 글자 그대로
function mapFind(q, reg) {
  q = mapStr(q, 40).replace(/\s+/g, '').trim();
  if (q.length < 2) return null;
  var T = mapStnTable(), i, m = null, pass, inReg = function (r) { return !reg || pass === 1 || mapRegionOfLine(r[1]) === reg; };
  for (pass = 0; pass < 2 && !m; pass++) {                                           // 0 = 이 권역 안에서 먼저, 1 = 없으면 전국(예전 그대로)
    for (i = 0; i < T.length && !m; i++) if (String(T[i][0]).replace(/\s+/g, '') === q && inReg(T[i])) m = T[i];
    for (i = 0; i < T.length && !m; i++) if (String(T[i][0]).replace(/\s+/g, '').indexOf(q) >= 0 && inReg(T[i])) m = T[i];
  }
  return { name: m ? m[0] : q, known: !!m };
}
function mapNearest(la, lo, reg) {                  // 웹 mapGoToMyLocation: 위도·경도 차의 제곱합이 가장 작은 역(s208: 지금 보는 권역의 역만 — 수도권 지도에 지방 역이 오지 않게)
  var T = mapStnTable(), best = null, bd = 1e18;
  for (var i = 0; i < T.length; i++) { if (reg && mapRegionOfLine(T[i][1]) !== reg) continue; var dx = T[i][2] - la, dy = T[i][3] - lo, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = T[i]; } }
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
    kids.push({ t: 'chips', pad: [14, 0, 14, 8], gap: 6, h: 30, onc: 'gold', onfg: '#121214', offf: 'card2', offb: 'border', offt: 'text',
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
  var rg = mapRegOf(f);
  var lines = f.sl ? [f.sl].concat(mapLinesOf(name, rg).filter(function (l) { return l !== f.sl; })) : mapLinesOf(name, rg);
  if (f.sl && mapLinesOf(name, rg).indexOf(f.sl) < 0) lines = mapLinesOf(name, rg);
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
  var row = mapPickRow(name, f.sl, rg);
  var out = { ok: true, v: 1, screen: 'mapstn', cover: 'tab', head: [], body: kids.map(mapSheetPad),
    info: { name: name, lines: lines, pick: row ? { name: row[0], line: row[1], la: row[2], lo: row[3] } : null, msg: MAP_STN_MSG } };
  return mapFinish(out);
}

// ── 시간표(웹 nmTtRender) ──
function mapClock(m) { var x = ((m % 1440) + 1440) % 1440; return (Math.floor(x / 60) < 10 ? '0' : '') + Math.floor(x / 60) + ':' + (x % 60 < 10 ? '0' : '') + (x % 60); }
function mapP2(n) { return (n < 10 ? '0' : '') + n; }
var MAP_LBAR_CAP = 26;                                                  // lbar(불러오는 중 막대) 노드를 아는 앱
function mapTimetableSheet(f, cap) {
  var name = f.stn;
  if (!mapIsStationLabel(name)) return { ok: false, error: 'stn' };
  var T = f.tt, lines = mapLinesOf(name, mapRegOf(f)).slice(0, 20), sel = (T.sel && typeof T.sel === 'object') ? T.sel : {}, res = (T.res && typeof T.res === 'object') ? T.res : {};
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
  // 머리(제목줄·칩·요약)는 head 에 둬 스크롤해도 제자리에 고정한다(웹 #nmTtSheet 의 머리 + 따로 스크롤하는 #nmTtBody). 닫기 단추는 없다 — 아래로 끌어 닫는다.
  var kids = [{ t: 'bar', pad: [0, MAP_STN_TOP, 0, 4], rw: MAP_PLAY_RW, mq: true, title: name + ' 시간표' }];
  if (lines.length) kids.push({ t: 'chips', pad: [0, 4, 0, 6], gap: 6, h: 30, onc: 'gold', onfg: '#ffffff', items: lines.map(function (l, i) {
    var kc = res[l + '|-'], nod = !!(kc && kc.noData);
    var o = { label: l, on: l === line, act: { a: 'call', v: 'mt.l.' + i } };
    if (l === line) o.c = mapLineColor(l, f.th);
    else if (nod) o.label = l + ' (자료 없음)';
    return o;
  }) });
  var head = [], dir = null, dirs = d && d.dirs ? d.dirs : [], dirIdx = 0;
  // s208 (YJ: '토·일·공휴일'과 'ㅇㅇ 방면'을 한 줄로): 요일 칩과 방면 칩을 한 줄에 이어 놓는다(넘치면 이 줄이 가로로 밀린다)
  var dayItems = (d && d.days && d.days.length) ? d.days.map(function (x) {
    return { label: mapStr(x.label, 10) + (x.code === d.today ? ' · 오늘' : ''), on: x.code === d.dayCode, act: { a: 'call', v: 'mt.d.' + mapStr(x.code, 6) } };
  }) : [];
  var dirItems = [];
  if (dirs.length) {
    for (var k = 0; k < dirs.length; k++) if (dirs[k].dk === mapStr(sel.dk, 4)) { dir = dirs[k]; dirIdx = k; }
    if (!dir) { dir = dirs[0]; dirIdx = 0; }
    dirItems = dirs.map(function (x, i) {
      return { label: x.toward ? mapStr(x.toward, 20) + ' 방면' : (x.dk === '상' ? '상행' : '하행'), on: x === dir, act: { a: 'call', v: 'mt.k.' + i } };
    });
  }
  if (dayItems.length || dirItems.length) kids.push({ t: 'chips', pad: [0, 0, 0, 8], gap: 6, h: 30, onc: 'gold', onfg: '#121214', items: dayItems.concat(dirItems) });
  head = kids.map(mapSheetPad); kids = [];                                         // 여기까지(제목줄·칩)가 머리 — 고정
  var msg = function (s, sub) { return { t: 'text', s: s, size: 13, color: 'sub', lh: 1.7, align: 'center', pad: [28, 12, 28, 12] }; };
  if (!d && st === 'loading' && !(cap >= MAP_LBAR_CAP)) kids.push(msg('시간표를 불러오는 중…'));
  else if (!d && st !== 'fail') kids.push({ t: 'lbar', ttl: (line || '시간표') + ' 시간표를 불러오는 중이에요', sub: '잠시만 기다려 주세요', pad: [0, 36, 0, 0] });       // s254: 자료를 아직 못 받았을 땐 '받지 못했어요' 대신 불러오는 중 막대(없다고 말하는 건 서버가 '자료 없음'이라 한 때만)
  else if (st === 'fail' && !d) { kids.push(msg('시간표를 불러오지 못했어요.')); kids.push({ t: 'button', s: '다시 시도', size: 13, h: 40, r: 11, bold: true, fill: 'card2', line: 'border', tc: '', pad: [0, 0, 0, 0], act: { a: 'call', v: 'mt.retry' } }); }
  else if (!d || d.noData || !dir) kids.push(msg((line || '이 노선') + '의 시간표 자료를\n아직 받지 못했어요.\n실시간 도착정보는 경로 탐색 화면에서 확인할 수 있어요.'));
  else {
    var s = '첫차 ' + mapClock(dir.first) + ' · 막차 ' + mapClock(dir.last);
    if (dir.nextMin != null) s += ' · ' + (dir.tomorrow ? '내일 첫차 ' : '다음 열차 ') + mapClock(dir.nextMin);
    head.push(mapSheetPad({ t: 'text', s: s, size: 12, color: 'gold', lh: 1.5, pad: [0, 0, 0, 8] }));            // 첫차·막차·다음 열차 요약도 머리에 고정
    var rows = [], cur = null, nx = dir.nextMin, dk = f.th === 'dark';
    (dir.times || []).forEach(function (t) { var h = Math.floor(t / 60); if (!cur || cur.h !== h) { cur = { h: h, m: [] }; rows.push(cur); } cur.m.push(t); });
    // 지금 시각(오늘 요일일 때만): 지금 시(時)의 줄을 눈에 띄게(바탕·테두리·시각 글자), 그 시 이전 줄은 흐리게(웹 .past). 지금 시 줄이 없으면(열차가 없는 시간대) 다음 열차가 든 줄.
    var isToday = !!d.today && d.dayCode === d.today && !dir.tomorrow, curH = -1;
    if (isToday && isFinite(d.nowMin)) {
      var nh = Math.floor(Number(d.nowMin) / 60);
      for (var ri = 0; ri < rows.length; ri++) if (rows[ri].h === nh || (nh < 4 && rows[ri].h === nh + 24)) curH = rows[ri].h;
      if (curH < 0 && nx != null) for (var rj = 0; rj < rows.length; rj++) if (rows[rj].m.indexOf(nx) >= 0) curH = rows[rj].h;
    } else if (isToday && nx != null) { for (var rk = 0; rk < rows.length; rk++) if (rows[rk].m.indexOf(nx) >= 0) curH = rows[rk].h; }
    var gold = dk ? '#ffb340' : '#b86e00', fk = 'n' + mapHash(line + '|' + (day || '-') + '|' + (dir ? dir.dk : ''));
    rows.forEach(function (r) {
      var label = mapP2(r.h % 24) + '시' + (r.h >= 24 ? ' 익일' : ''), txt = label + '   ', hl = [], now = r.h === curH;
      if (now) hl.push([0, label.length, gold]);
      r.m.forEach(function (t, i) {
        var mm = mapP2(t % 60);
        if (nx != null && t === nx && !dir.tomorrow) hl.push([txt.length, txt.length + 2, now ? gold : '#f5a623']);
        txt += mm + (i < r.m.length - 1 ? '  ' : '');
      });
      var past = isToday && curH >= 0 && r.h < curH;
      var n = { t: 'box', s: txt, size: 13, lh: 1.5, color: past ? 'sub' : 'text', fill: now ? (dk ? 'rgba(245,166,35,.16)' : 'rgba(245,166,35,.20)') : 'card2', line: now ? (dk ? 'rgba(245,166,35,.75)' : '#f5a623') : 'border', r: 9, ip: [10, 7, 10, 7], pad: [0, 0, 0, 4] };
      if (hl.length) n.hl = hl;
      if (now) n.fc = fk;                                                          // 지금 시 줄 — 앱이 시간표를 열 때 그 줄로 내려 보인다
      kids.push(n);
    });
  }
  var out = { ok: true, v: 1, screen: 'maptt', cover: 'tab', head: head, body: kids.map(mapSheetPad),
    info: { name: name, lines: lines, line: line, day: day, dk: dir ? dir.dk : '', dks: dirs.map(function (x) { return mapStr(x.dk, 4); }), days: (d && d.days ? d.days : []).map(function (x) { return mapStr(x.code, 6); }), need: (line && st !== 'fail' && !d) ? { line: line, day: day } : null } };
  return mapFinish(out);
}

function mapScreen(inp, factsIn, dataIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 18)) return { ok: false, error: 'cap' };
  var f = mapFacts(factsIn), ctx = {};
  if (f.part === 'stn') return mapStationSheet(f);
  if (f.part === 'tt') return mapTimetableSheet(f, Number(inp.cap));
  if (f.part === 'br') return mapBusRouteSheet(f);
  var info = { mode: f.mode, reg: f.reg, flt: f.flt };
  if (f.q) { var fd = mapFind(f.q, f.reg); info.find = fd; }
  if (f.gps) info.near = mapNearest(f.gps[0], f.gps[1], f.reg);
  if (f.part === 'h') {
    var head = mapHead(f);
    return mapFinish({ ok: true, v: 1, screen: 'map', cover: 'tab', head: head, body: [], info: info }, 'h');
  }
  var body, bhead = [];
  if (f.mode === 'subway' && f.reg === 'seoul') { body = [{ t: 'spacer', h: 1 }]; info.view = 'metro'; }
  else if (f.mode === 'subway') { body = mapRegionBody(f, ctx); info.view = 'list'; info.rs = ctx.regionStns || []; }
  else { var bb = mapBusBody(f, info); body = bb.body; bhead = bb.head; info.view = 'bus'; }
  var out = mapFinish({ ok: true, v: 1, screen: 'map', cover: 'tab', head: bhead, body: body, info: info }, 'b' + f.mode + f.reg);
  // ★ 2026-10-29 (YJ: "노선도 탭에서 좌우로 밀면 버스 ↔ 지하철이 끝없이 돌게"): 본문을 좌우로 밀면 안쪽 탭(버스 · 지하철)이 서로 바뀐다 — 둘뿐이라 어느 쪽으로 밀어도 반대편으로 넘어간다(순환).
  //   표(sw.t)는 새 화면이 오기 전에 연달아 밀어도 맞게 넘어가려고 둔다(커뮤니티 · 쇼핑 · 맛집과 같은 규칙). 머리의 지도·칩 줄에서 시작한 몸짓은 앱이 가로채지 않는다(지도 끌기).
  var toBus = { a: 'cat', v: 'm:bus' }, toSub = { a: 'cat', v: 'm:subway' };
  out.sw = f.mode === 'subway' ? { l: toBus, r: toBus, k: 'm:subway' } : { l: toSub, r: toSub, k: 'm:bus' };
  out.sw.t = { 'm:bus': { l: toSub, r: toSub }, 'm:subway': { l: toBus, r: toBus } };
  return out;
}
// ── 버스: 근처 정류장 + 도착정보(웹 loadMapNearStops / _fetchNearStops / _renderBusStop 의 규칙) ──
// 엔진은 "어느 주소를 받아 와라(need)" 만 말하고, 앱은 그 주소의 본문을 그대로 res 에 넣어 다시 보낸다. 해석은 모두 여기서 한다.
var MAP_TAGO_BASE = 'https://apis.data.go.kr/1613000/';
var MAP_SEOUL_BOX = [37.41, 37.72, 126.76, 127.19];
var MAP_EXIT_RE = /역\s*\d*\s*번?\s*출구|역\s*출구/;
var MAP_STOP_DUP_M = 3;
var MAP_NEAR_R = 300, MAP_NEAR_CAP = 8;                           // 내 주변 정류장: 지금 위치에서 300m 이내만(가까운 순 최대 8곳 — s284: 도착정보를 받는 곳이 적을수록 빨리 · 덜 비게) — 300m 밖은 하나도 넣지 않는다(없으면 '찾지 못했어요')
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
    var nid = String(s.node_id); if (cc === '23') nid = nid.replace(/^(ICB|GGB)1/, 'ICB3');                          // 인천(city 23): 우리 표(D1)는 ICB1…·GGB1…, TAGO 도착정보는 ICB3… 를 쓴다(웹 _tagoAltNodeIds · 같은 정류장) — 그대로 쓰면 도착정보가 전부 '없음'
    stops.push({ nm: String(s.node_nm || ''), id: nid, no: '', city: cc || mapCityOf(a, b), la: a, lo: b, dist: mapHav(la, lo, a, b), src: 'd1' });
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
function mapStopOrder(stops) {                       // 지금 위치에서 반경 300m 이내만(역 출구도 300m — 예외 없음 · 300m 밖은 하나도 넣지 않는다) · 역 출구 먼저 · 가까운 순 · 최대 8곳
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
function mapBusArrUrl(s, id, city) {                               // id·city: 이웃 정류장·바꿔 보는 ID 로 같은 주소를 만들 때만 준다
  if (s.src === 'topis') return 'http://ws.bus.go.kr/api/rest/stationinfo/getStationByUid?arsId=' + encodeURIComponent(s.ars);
  if (s.src === 'gbis') return MAP_GBIS_BASE + 'busarrivalservice/v2/getBusArrivalListv2?stationId=' + encodeURIComponent(s.sid) + '&format=json';
  var cc = city !== undefined ? city : (s.city || mapCityOf(s.la, s.lo));                  // 시 코드를 모르면 웹 _tagoCityCode 처럼 좌표 상자로
  return MAP_TAGO_BASE + 'ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList?serviceKey=&cityCode=' + encodeURIComponent(cc) + '&nodeId=' + encodeURIComponent(id !== undefined ? id : s.id) + '&_type=json';
}
// ── s199: 웹 _busArrFetchMerged 의 세 보강 — ① 같은 자리 이웃 정류장(60m·같은 이름) 도착정보 합치기 ② 비면 인천 ID(ICB1↔ICB3) 바꿔 다시 ③ 경유노선 뼈대(지금 오는 차가 없는 노선도 '도착정보 없음' 줄로)
//   받을 주소의 열쇠: 이웃·바꾼 ID = g(4i+j) (j 0=바꾼 ID · 1..3=이웃) / 즐겨찾기는 h · 경유노선 = t(i) / 즐겨찾기는 u. 도착정보(a·f·g·h)는 8초마다 비우고, 경유노선(t·u)은 한 번 받으면 둔다.
var MAP_PEER_M = 60, MAP_PEER_MAX = 3, MAP_NONE_SEC = 1000000000;
function mapNmKey(x) { return String(x || '').replace(/\(.*?\)/g, '').replace(/[\s.·,]/g, '').replace(/(정류장|정류소)$/, '').trim(); }    // 웹 _nmKeyStop
function mapTagoLike(s) { return s.src === 'tago' || s.src === 'd1'; }
function mapAltId(id) {                                              // 웹 _tagoAltNodeIds: 인천 우리 표는 ICB1…, TAGO 도착정보는 ICB3… (둘 다 있다)
  id = String(id || '');
  if (/^ICB1/.test(id)) return 'ICB3' + id.slice(4);
  if (/^ICB3/.test(id)) return 'ICB1' + id.slice(4);
  return '';
}
function mapPeersOf(s, pool) {                                       // 웹 _busFindPeers: 같은 지점(60m 안)에 같은 이름으로 따로 등록된 정류장 — 최대 3
  var out = [], my = mapNmKey(s.nm), alt = mapAltId(s.id);
  if (!mapTagoLike(s) || !pool) return out;
  for (var i = 0; i < pool.length && out.length < MAP_PEER_MAX; i++) {
    var p = pool[i];
    if (!p || !p.id || p.id === s.id || p.id === alt || mapHav(s.la, s.lo, p.la, p.lo) > MAP_PEER_M) continue;
    var pn = mapNmKey(p.nm);
    if (my && pn && pn !== my) continue;
    if (out.some(function (q) { return q.id === p.id; })) continue;
    out.push(p);
  }
  return out;
}
var MAP_FIX_T = 100, MAP_FIX_X = 500, MAP_FIX_M = 400;               // 좌표 보정 열쇠: 정류장 목록 t/u(100+i) · 보정 ID 도착정보 g/h(500+i)
function mapCoordUrl(s) {                                           // 웹 _tagoResolveStop 의 주소(numOfRows 30)
  return MAP_TAGO_BASE + 'BusSttnInfoInqireService/getCrdntPrxmtSttnList?serviceKey=&gpsLati=' + s.la + '&gpsLong=' + s.lo + '&cityCode=' + encodeURIComponent(s.city || mapCityOf(s.la, s.lo)) + '&numOfRows=30&pageNo=1&_type=json';
}
function mapCoordFix(s, text, peers) {                              // 같은 이름이면 300m 우대, 400m 안만 같은 지점으로 본다. 이미 물어본 ID 면 새 정보가 없으니 null
  var want = mapNmKey(s.nm), best = null, bestS = 1e18, bestD = 1e18, items = mapJsonItems(text);
  items.forEach(function (it) {
    var ila = parseFloat(it && it.gpslati), iln = parseFloat(it && it.gpslong);
    if (!isFinite(ila) || !isFinite(iln)) return;
    var d = mapHav(s.la, s.lo, ila, iln), sc = d - (want && mapNmKey(it.nodenm) === want ? 300 : 0);
    if (sc < bestS) { bestS = sc; best = it; bestD = d; }
  });
  if (!best || bestD > MAP_FIX_M || !best.nodeid) return null;
  var id = String(best.nodeid), alt = mapAltId(s.id);
  if (id === s.id || id === alt || (peers || []).some(function (p) { return p.id === id; })) return null;
  return { nodeid: id, citycode: String(best.citycode || s.city || mapCityOf(s.la, s.lo) || '') };
}
function mapThruUrl(s) {
  return MAP_TAGO_BASE + 'BusSttnInfoInqireService/getSttnThrghRouteList?serviceKey=&cityCode=' + encodeURIComponent(s.city || mapCityOf(s.la, s.lo)) + '&nodeid=' + encodeURIComponent(s.id) + '&numOfRows=100&pageNo=1&_type=json';
}
function mapThruRows(text) {                                         // 웹 _busThruRoutes: 번호가 있는 경유노선만
  var out = [];
  mapJsonItems(text).forEach(function (x) {
    var no = x && (x.routeno || x.routeNo);
    if (no) out.push({ no: String(no), sec: MAP_NONE_SEC, prev: 0, cong: 0, low: false, dir: '', rid: String(x.routeid || x.routeId || ''), tp: String(x.routetp || x.routeTp || ''), none: true });
  });
  return out;
}
function mapThruFill(rows, thru) {                                   // 웹 _thruFill: 도착정보에 없는 노선만 '도착정보 없음' 자리로
  var have = {};
  rows.forEach(function (r) { have[r.no] = 1; });
  var out = rows.slice();
  thru.forEach(function (t) { if (have[t.no]) return; have[t.no] = 1; out.push(t); });
  return out;
}
/**
 * 한 정류장의 줄들과 더 받아야 할 주소. kp = 열쇠 글자 {m 본문, x 이웃·바꾼 ID, t 경유노선}.
 * rows === null 이면 아직 그릴 수 없다('불러오는 중') — 본문을 못 받았거나, 비었는데 이웃·바꾼 ID 가 아직 안 왔다. 본문에 줄이 있으면 이웃·경유노선은 오는 대로 얹는다.
 */
function mapBusStopRows(s, i, res, kp, pool, nx) {
  var ask = [], mk = kp.m + i, rows = null;
  if (mapArrMissing(res, mk)) { ask.push({ k: mk, url: mapBusArrUrl(s) }); }
  else rows = s.src === 'topis' ? mapSeoulArr(String(res[mk] || '')) : s.src === 'gbis' ? mapGbisArr(String(res[mk] || '')) : mapTagoArr(String(res[mk] || ''));
  if (!mapTagoLike(s)) return { rows: rows, ask: ask, fx: null };
  var peers = mapPeersOf(s, pool), peerWait = false, pi;
  for (pi = 0; pi < peers.length; pi++) {
    var xk = kp.x + (i * 4 + 1 + pi);
    if (mapArrMissing(res, xk)) { peerWait = true; ask.push({ k: xk, url: mapBusArrUrl(peers[pi], peers[pi].id, peers[pi].city || mapCityOf(peers[pi].la, peers[pi].lo)) }); }
    else if (rows) rows = rows.concat(mapTagoArr(String(res[xk] || '')));
  }
  var alt = mapAltId(s.id), altWait = false;
  if (rows && !rows.length && !peerWait && alt) {
    var ak = kp.x + (i * 4);
    if (mapArrMissing(res, ak)) { altWait = true; ask.push({ k: ak, url: mapBusArrUrl(s, alt, s.city || mapCityOf(s.la, s.lo)) }); }
    else rows = rows.concat(mapTagoArr(String(res[ak] || '')));
  }
  // s202: 웹 _tagoResolveStop — 이웃·바꾼 ID 까지 봐도 비면 좌표로 가까운 TAGO 정류장을 다시 찾아 그 ID 로 도착정보를 받는다(옛 ID·다른 등록 번호로 비던 정류장)
  //   s203: 찾은 번호는 nx['fx|정류장ID'] 로 기기에 저장해 다음부터는 좌표 조회(1건)를 건너뛰고 곧장 그 번호로 받는다(웹 _tagoNodeFix 저장과 같다). 못 찾은 것은 저장하지 않는다(일시 오류를 굳히지 않게 — 웹은 굳혔다).
  var coordWait = false, fx = null;
  if (rows && !rows.length && !peerWait && !altWait && isFinite(s.la) && isFinite(s.lo)) {
    var ck = kp.t + (MAP_FIX_T + i), fk = kp.x + (MAP_FIX_X + i), fxk = 'fx|' + s.id, fxv = nx && typeof nx[fxk] === 'string' ? nx[fxk] : '', fix = null;
    if (fxv) { var fp = fxv.split('|'); if (fp[0]) fix = { nodeid: fp[0], citycode: fp[1] || '' }; }
    else if (res[ck] === undefined || mapArrErr(res[ck])) { coordWait = true; ask.push({ k: ck, url: mapCoordUrl(s) }); }
    else { fix = mapCoordFix(s, String(res[ck] || ''), peers); if (fix) fx = { k: fxk, v: (fix.nodeid + '|' + fix.citycode).slice(0, 40) }; }
    if (fix) {
      if (mapArrMissing(res, fk)) { coordWait = true; ask.push({ k: fk, url: mapBusArrUrl(s, fix.nodeid, fix.citycode) }); }
      else rows = rows.concat(mapTagoArr(String(res[fk] || '')));
    }
  }
  var arrEmpty = !!rows && !rows.length, tk = kp.t + i;
  if (res[tk] === undefined || mapArrErr(res[tk])) ask.push({ k: tk, url: mapThruUrl(s) });
  else if (rows) rows = mapThruFill(rows, mapThruRows(String(res[tk] || '')));
  if (arrEmpty && (peerWait || altWait || coordWait)) rows = null;                // 이웃·바꾼 ID 가 오기 전에 '도착정보 없음' 줄만 먼저 깔지 않는다
  return { rows: rows, ask: ask, fx: fx };
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
// 버스 즐겨찾기 규칙(s207): 몇 곳까지 · 별명 몇 글자 · 안내 글은 엔진이 정한다. 앱은 이 값으로 목록에 넣고 빼기만 한다(웹 toggleFav / _busEditAlias).
var MAP_FAVP = { max: 12, al: 10, add: '즐겨찾기 추가', rm: '즐겨찾기 해제', full: '즐겨찾기는 최대 12개' };
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
  var pos = {}; order.forEach(function (k, ix) { pos[k] = ix; });
  var tpo = function (tp) { tp = String(tp || ''); return /간선/.test(tp) ? 1 : /지선/.test(tp) ? 2 : /광역|급행/.test(tp) ? 3 : /마을/.test(tp) ? 4 : /순환/.test(tp) ? 5 : 6; };      // 웹 _paintArr 의 _tpOrder
  order.sort(function (a, b) { return (tpo(by[a][0].tp) - tpo(by[b][0].tp)) || (by[a][0].sec - by[b][0].sec) || (pos[a] - pos[b]); });                // 종류(간선→지선→광역→마을→순환→그 밖) 먼저 · 같은 종류는 빠른 도착 · 같으면(지금 오는 차가 없는 노선들) 받은 순서
  var meta = [];
  var out = order.slice(0, 20).map(function (k, ri) {
    var g = by[k], r = g[0];
    var arr = g.slice(0, 2).map(function (x) {
      if (x.est) { var eo = { s: x.prev <= 0 ? '곧 도착' : '약 ' + Math.max(1, Math.round(x.prev * MAP_EST_MIN)) + '분', sec: 0 }; if (x.prev > 0) eo.p = x.prev + '번째전'; else eo.soon = 1; return eo; }     // s270: 버스 위치로 어림한 시간(초 단위 카운트다운이 아니다)
      if (x.none) return { s: '도착정보 없음', sec: 0 };                                                    // 경유노선만 알고 지금 오는 차는 모를 때(웹 _noArr)
      var o = { s: x.sec <= 1 ? '곧 도착' : mapCdFmt(x.sec), sec: Math.round(x.sec) }; if (x.prev > 0) o.p = x.prev + '번째전'; if (x.sec <= 60) o.soon = 1; return o; });
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
// ── s199: TAGO 줄의 "→ ○○방향"(웹 _fetchBusNextStop): TAGO 도착정보는 방면을 안 줘서, 그 노선의 경유 정류장 목록에서 이 정류장 다음 정류장 이름을 쓴다(목록에 없으면 종점).
//   노선 목록은 크다 → 기기에 오래 두지 않는다: 이 함수가 이름만 뽑아 info.nx({'정류장id|노선id': 이름})로 돌려주면 기기가 저장했다가 다음 요청에 b.nx 로 실어 보낸다.
//   한 번에 MAP_NX_ASK 개 노선만, 도착정보 등 다른 받기가 다 끝난 뒤에만 부탁한다(8초 갱신을 붙들지 않게). 열쇠 r(번호)는 이번 요청 안에서만 뜻이 있다.
var MAP_NX_ASK = 4, MAP_NX_MAX = 800;
function mapNxIn(b) {
  var o = (b && b.nx && typeof b.nx === 'object' && !Array.isArray(b.nx)) ? b.nx : {}, out = {}, n = 0;
  Object.keys(o).forEach(function (k) { if (n < MAP_NX_MAX && k.length <= 80 && typeof o[k] === 'string' && o[k].length <= 40) { out[k] = o[k]; n++; } });
  return out;
}
function mapRouteStnUrl(s, rid) {
  return MAP_TAGO_RT_STN + '?serviceKey=&cityCode=' + encodeURIComponent(s.city || mapCityOf(s.la, s.lo)) + '&routeId=' + encodeURIComponent(rid) + '&numOfRows=300&pageNo=1&_type=json';
}
// ── s202: 웹 _busFindLandmark — 정류장 이름 옆 "(○○역 방향)". 이 정류장에 서는 노선(도착 줄 앞 8개 중 서로 다른 2개)의 경유 정류장 목록에서, 진행 방향(회차 전)으로 처음 만나는
//   지하철역(1순위) > 시청(2) > 구청(3) > 동사무소·주민센터(4) 를 뽑고, 노선마다 다르면 다수결. 방면 이름(nx)과 같은 목록(r)을 쓰므로 받을 주소가 늘지 않는다. 결과는 nx['lm|'+정류장ID] 에 저장(빈 값 = 찾지 못함, 다시 안 묻는다).
var MAP_LM_ROUTES = 2, MAP_LM_ROWS = 8;
function mapLmStation(nm) {                                         // 웹 _busLmStation
  var m = String(nm).match(/^(.{1,15}?역)(?:$|[0-9(.\s·]|번출구|출구|입구|환승|광역|사거리|삼거리|오거리|앞|후문|정문|건너)/);
  return m ? m[1] : null;
}
function mapLmRank(nm) {                                            // 웹 _busLmRank
  if (mapLmStation(nm)) return 1;
  if (nm.indexOf('시청') >= 0) return 2;
  if (nm.indexOf('구청') >= 0) return 3;
  if (nm.indexOf('동사무소') >= 0 || nm.indexOf('주민센터') >= 0 || nm.indexOf('주민자치센터') >= 0 || nm.indexOf('행정복지센터') >= 0) return 4;
  return 99;
}
function mapLmNorm(s) { return String(s || '').replace(/\s+/g, '').split('(')[0]; }
function mapLmOne(stn, ids, myNm) {                                 // 한 노선의 목록 하나에서 {nm, rank, ahead} 하나 (없으면 null)
  var myIdx = -1, i;
  for (i = 0; i < stn.length; i++) if (ids[stn[i][1]]) { myIdx = i; break; }
  if (myIdx < 0 && myNm) for (i = 0; i < stn.length; i++) if (mapLmNorm(stn[i][2]) === myNm) { myIdx = i; break; }
  if (myIdx < 0) return null;                                       // 내 위치를 못 찾으면 이 노선은 건너뛴다(지나온 방향 오표시 방지)
  var myDir = stn[myIdx][6], endIdx = stn.length, e;
  if (myDir >= 0) for (e = myIdx + 1; e < stn.length; e++) if (stn[e][6] !== myDir) { endIdx = e; break; }       // 회차 지점까지만(방향이 바뀌면 반대 방면)
  var found = {}, j;
  for (j = myIdx + 1; j < endIdx; j++) {
    var nm = String(stn[j][2] || '').split('(')[0].trim();
    if (!nm || mapLmNorm(nm) === myNm) continue;                    // 같은 이름이 이어지는 구간은 건너뛴다
    var r = mapLmRank(nm);
    if (r < 99 && !found[r]) found[r] = { nm: r === 1 ? (mapLmStation(nm) || nm) : nm, rank: r, ahead: j - myIdx };
    if (found[1]) break;                                            // 진행 방향 첫 역을 만나면 끝
  }
  return found[1] || found[2] || found[3] || found[4] || null;
}
function mapLmVote(list) {                                          // 웹: 노선마다 다른 답이면 다수결(많이 나온 것 → 높은 순위 → 가까운 것)
  var vote = {};
  list.forEach(function (r) {
    var v = vote[r.nm] || (vote[r.nm] = { nm: r.nm, rank: r.rank, ahead: r.ahead, n: 0 });
    v.n++; if (r.ahead < v.ahead) v.ahead = r.ahead; if (r.rank < v.rank) v.rank = r.rank;
  });
  var cand = Object.keys(vote).map(function (k) { return vote[k]; });
  cand.sort(function (a, b) { return (b.n - a.n) || (a.rank - b.rank) || (a.ahead - b.ahead); });
  return cand.length ? cand[0].nm : '';
}
function mapFxOf(list) { var o = null; list.forEach(function (r) { if (r && r.fx) { if (!o) o = {}; o[r.fx.k] = r.fx.v; } }); return o; }
// ── s270: 도착정보가 비는 정류장(회차 첫 정류장 등)의 대기시간 어림 — 노선 정류장 목록에서 이 정류장의 순번(들)을 알아 두고(nx['od|정류장|노선'] = "순번,순번" · 못 찾으면 '-'),
//   노선의 버스 위치(r4…)에서 이 순번 앞(같은 순번 포함)에 있는 가장 가까운 차 2대를 골라 정류장 수 × 1.5분으로 '약 N분'. 노선 상세(1정거장 전 · 약 2분)와 같은 계산이다.
var MAP_EST_ASK = 3, MAP_EST_AWAY = 30, MAP_EST_MIN = 1.5;
function mapOrdOf(stn, ids, myNm) {
  var o = [], k;
  for (k = 0; k < stn.length && o.length < 4; k++) if (ids[stn[k][1]] && stn[k][0] > 0) o.push(stn[k][0]);
  if (!o.length && myNm) for (k = 0; k < stn.length && o.length < 4; k++) if (mapLmNorm(stn[k][2]) === myNm && stn[k][0] > 0) o.push(stn[k][0]);
  return o.length ? o.join(',') : '-';
}
function mapBusPosUrl(s, rid) {
  return MAP_TAGO_BUS_POS + '?serviceKey=&cityCode=' + encodeURIComponent(s.city || mapCityOf(s.la, s.lo)) + '&routeId=' + encodeURIComponent(rid) + '&numOfRows=100&pageNo=1&_type=json';
}
function mapEstRows(r, od, text) {                                  // 버스 위치를 아직 못 받았거나 접근하는 차가 없으면 null (줄은 그대로 '도착정보 없음')
  if (text === undefined || mapArrErr(text)) return null;
  var P = mapBrPos(String(text), false);
  if (!P.known || !P.buses.length) return null;
  var best = null;
  String(od).split(',').forEach(function (c) {
    c = parseInt(c, 10);
    if (!isFinite(c)) return;
    var aw = [];
    P.buses.forEach(function (b) { var d = c - b[0]; if (b[0] > 0 && d >= 0 && d <= MAP_EST_AWAY) aw.push(d); });
    aw.sort(function (x, y) { return x - y; });
    if (aw.length && (!best || aw[0] < best[0])) best = aw;
  });
  if (!best) return null;
  return best.slice(0, 2).map(function (d) { return { no: r.no, sec: d * 90, prev: d, cong: 0, low: false, dir: r.dir, rid: r.rid, tp: r.tp, est: 1 }; });
}
function mapNxPass(stops, rowsOf, res, nx, pool, canAsk, more) {
  var urls = [], uidx = {}, jobs = [], seen = {}, upd = {}, changed = false;
  stops.forEach(function (s, i) {
    var rows = rowsOf[i];
    if (!rows || !mapTagoLike(s)) return;
    rows.forEach(function (r) {
      if (r.dir || !r.rid) return;
      var key = s.id + '|' + r.rid;
      var needOd = !!r.none && nx['od|' + key] === undefined;                  // s270: 도착정보가 없는 줄은 이 정류장의 노선 순번도 함께 알아 둔다(버스 위치로 대기시간을 어림하려고)
      if ((nx[key] !== undefined && !needOd) || seen[key]) return;
      seen[key] = 1;
      var url = mapRouteStnUrl(s, r.rid);
      if (uidx[url] === undefined) { uidx[url] = urls.length; urls.push(url); }
      jobs.push({ key: key, s: s, i: i, rid: r.rid, u: uidx[url], none: !!r.none });
    });
  });
  var lmJobs = [];
  stops.forEach(function (s, i) {                                    // 이름 옆 방향: 아직 모르는 정류장만 · 오는 차가 있어야(웹: arrivals 없으면 저장도 안 함)
    var rows = rowsOf[i];
    if (!rows || !mapTagoLike(s) || nx['lm|' + s.id] !== undefined || seen['lm|' + s.id]) return;
    var rids = [];
    rows.slice(0, MAP_LM_ROWS).forEach(function (r) { if (!r.none && r.rid && rids.indexOf(r.rid) < 0 && rids.length < MAP_LM_ROUTES) rids.push(r.rid); });
    if (!rids.length) return;
    seen['lm|' + s.id] = 1;
    var us = rids.map(function (rid) {
      var url = mapRouteStnUrl(s, rid);
      if (uidx[url] === undefined) { uidx[url] = urls.length; urls.push(url); }
      return { rid: rid, u: uidx[url] };
    });
    lmJobs.push({ key: 'lm|' + s.id, s: s, i: i, us: us });
  });
  var peerIds = function (j) { var ids = {}; ids[j.s.id] = 1; var a = mapAltId(j.s.id); if (a) ids[a] = 1; mapPeersOf(j.s, pool).forEach(function (p) { ids[p.id] = 1; }); return ids; };
  jobs.forEach(function (j) {
    var rk = 'r' + j.u, txt = res[rk];
    if (j.u >= MAP_NX_ASK || txt === undefined || mapArrErr(txt)) return;
    var items = mapJsonItems(String(txt));
    if (items.length && String(items[0].routeid || items[0].routeId || '') !== j.rid) return;       // 다른 노선의 본문이 섞였다 — 쓰지 않는다
    var stn = mapBrStnTago(String(txt)), ids = peerIds(j), at = -1, k;
    for (k = 0; k < stn.length; k++) if (ids[stn[k][1]]) { at = k; break; }
    var name = '';
    if (stn.length) name = at >= 0 ? stn[(at + 1) % stn.length][2] : stn[stn.length - 1][2];
    upd[j.key] = String(name || '').slice(0, 40); changed = true;
    if (j.none) upd['od|' + j.key] = mapOrdOf(stn, ids, mapLmNorm(j.s.nm));
  });
  lmJobs.forEach(function (j) {
    var list = [], ok = true, ids = peerIds(j), myNm = mapLmNorm(j.s.nm);
    j.us.forEach(function (x) {
      var txt = res['r' + x.u];
      if (x.u >= MAP_NX_ASK || txt === undefined || mapArrErr(txt)) { ok = false; return; }
      var items = mapJsonItems(String(txt));
      if (items.length && String(items[0].routeid || items[0].routeId || '') !== x.rid) { ok = false; return; }
      var one = mapLmOne(mapBrStnTago(String(txt)), ids, myNm);
      if (one) list.push(one);
    });
    j.done = ok;
    if (ok) { upd[j.key] = String(mapLmVote(list)).slice(0, 40); changed = true; }
  });
  if (more) Object.keys(more).forEach(function (k) { if (nx[k] !== more[k]) { upd[k] = more[k]; changed = true; } });      // s203: 좌표로 찾은 정류장 번호(fx)
  var out = nx;
  if (changed) { out = {}; Object.keys(nx).forEach(function (k) { out[k] = nx[k]; }); Object.keys(upd).forEach(function (k) { out[k] = upd[k]; }); }
  rowsOf.forEach(function (rows, i) {
    if (!rows || !mapTagoLike(stops[i])) return;
    rows.forEach(function (r) { if (!r.dir && r.rid) { var nm = out[stops[i].id + '|' + r.rid]; if (nm) r.dir = nm; } });
  });
  // s270: 회차 첫 정류장처럼 도착정보 API 가 줄을 비우는 정류장 — 그 노선의 버스 위치와 이 정류장 순번으로 대기시간을 어림해 '도착정보 없음' 대신 보인다(카카오처럼).
  var estK = {}, estN = 0, estList = [];
  rowsOf.forEach(function (rows, i) {
    if (!rows || !mapTagoLike(stops[i])) return;
    rows.forEach(function (r) {
      if (!r.none || !r.rid || estK[r.rid] !== undefined) return;
      var od = out['od|' + stops[i].id + '|' + r.rid];
      if (!od || od === '-' || estN >= MAP_EST_ASK) return;
      estK[r.rid] = 'r' + (MAP_NX_ASK + estN); estN++;
      estList.push({ k: estK[r.rid], url: mapBusPosUrl(stops[i], r.rid) });
    });
  });
  if (estN) rowsOf.forEach(function (rows, i) {
    if (!rows || !mapTagoLike(stops[i])) return;
    var next = [], chg = false;
    rows.forEach(function (r) {
      var est = (r.none && r.rid && estK[r.rid] !== undefined) ? mapEstRows(r, out['od|' + stops[i].id + '|' + r.rid], res[estK[r.rid]]) : null;
      if (est && est.length) { chg = true; est.forEach(function (e) { next.push(e); }); } else next.push(r);
    });
    if (chg) { rows.length = 0; next.forEach(function (e) { rows.push(e); }); }
  });
  var ask = [];
  if (canAsk) estList.forEach(function (e) { if (res[e.k] === undefined || mapArrErr(res[e.k])) ask.push(e); });
  if (canAsk) {
    var want = {};
    jobs.forEach(function (j) { if (upd[j.key] === undefined && j.u < MAP_NX_ASK) want[j.u] = 1; });
    lmJobs.forEach(function (j) { if (upd[j.key] === undefined) j.us.forEach(function (x) { if (x.u < MAP_NX_ASK) want[x.u] = 1; }); });
    Object.keys(want).forEach(function (u) { ask.push({ k: 'r' + u, url: urls[u] }); });
  }
  var lm = stops.map(function (s) { var v = out['lm|' + s.id]; return typeof v === 'string' ? v : ''; });
  return { ask: ask, nx: changed ? out : null, lm: lm };
}
function mapBusCard(s, o) {
  var c = { t: 'bcard', k: s.id, nm: s.nm, mode: o.mode, on: !!o.on, pad: [12, 12, 0, 12], act: { a: 'call', v: 'mp.pc.' + o.i, id: s.id }, edit: { a: 'call', v: 'mp.al.' + o.i } };
  if (o.n) c.n = String(o.n);
  if (o.alias) c.al = o.alias;
  if (o.lm) c.lm = o.lm;                                           // 이름 옆 '(○○역 방향)' 의 ○○역 (웹 .bus-lm)
  if (o.mode === 'near') { c.dist = mapDistFmt(s.dist); c.fv = o.fav ? 1 : 0; c.star = { a: 'call', v: 'mp.fv.' + o.i }; if (o.pi >= 0) c.pi = o.pi;
    if (o.i === 0) { c.rol = '끌어서 순서 변경'; c.rod = '완료'; }                              // 꾹 눌러 순서 바꾸기 줄 글(웹 #busReorderBar) — 첫 카드에만; 줄을 그리는 것은 앱
  }
  else {
    c.star = { a: 'call', v: 'mp.fv.' + o.i };                      // 즐겨찾기 화면의 × (제거)
    if (isFinite(s.la) && isFinite(s.lo)) c.map = { a: 'open', url: 'https://map.kakao.com/link/map/' + encodeURIComponent(s.nm || '정류장') + ',' + s.la + ',' + s.lo };
  }
  if (o.rows === null) {
    if (o.fail) { c.em = '정보 불러오기 실패'; c.rt = { a: 'call', v: 'mp.rt' }; }              // 웹 .kbus-err-row: 자동 재시도를 다 썼는데도 못 받았다 → 눌러서 다시
    else c.ld = '도착 정보 불러오는 중...';
  }
  else if (!o.rows.length) { c.em = '운행 정보 없음'; c.rt = { a: 'call', v: 'mp.rt' }; }            // 웹 .kbus-empty-row: '운행 정보 없음' + 다시 시도 ›
  else c.rows = o.rows;
  return c;
}
function mapBusTmap(pts, foc) {                                    // 고정 지도: 끌기·두 손가락 확대·± 단추·핀 누름은 앱, 핀·선택은 엔진
  return { t: 'tmap', h: 213, hv: 24, hmin: 137, hmax: 231, r: 0, pad: [0, 0, 0, 0], pts: pts, live: 1, foc: foc, bl: 1, hint: '숫자를 누르면 아래 정류장으로 이동해요' };
}
function mapBusBody(f, info) {
  var b = f.bus, vw = (b && b.vw === 'fav') ? 'fav' : 'near', al = mapBusAliases(b), sel = (b && isFinite(Number(b.sel))) ? Math.floor(Number(b.sel)) : -1;
  var head = [mapBusToggle(vw)], note = function (s) { return { t: 'text', s: s, size: 13, color: 'sub', align: 'center', lh: 1.7, pad: [28, 20, 20, 20] }; };
  if (vw === 'fav') {
    var favs = mapBusFavs(b), fres = (b && b.res && typeof b.res === 'object') ? b.res : {};
    info.bus = { st: 'ok', vw: 'fav', n: favs.length }; info.stops = favs.map(mapStopKeep); info.favp = MAP_FAVP;
    if (!favs.length) return { head: head, body: [
      { t: 'text', s: '⭐', size: 34, align: 'center', color: 'sub', pad: [44, 20, 6, 20] },
      { t: 'text', s: '즐겨찾기한 정류장이 없습니다', size: 14, bold: true, color: 'text', align: 'center', pad: [0, 20, 6, 20] },
      { t: 'text', s: '주변 정류장에서 별(☆)을 눌러\n원하는 정류장을 추가하세요', size: 12, color: 'sub', lh: 1.7, align: 'center', pad: [0, 20, 14, 20] },
      { t: 'button', s: '주변 정류장 보기', size: 13, h: 42, r: 12, bold: true, fill: 'gold', line: 'none', tc: '#121214', pad: [4, 80, 8, 80], act: { a: 'call', v: 'mp.vw.near' } }] };
    var fkp = { m: 'f', x: 'h', t: 'u' }, fnx0 = mapNxIn(b), fr = favs.map(function (s, i) { return mapBusStopRows(s, i, fres, fkp, null, fnx0); });
    var pend = fr.some(function (r) { return r.rows === null; }), fask = [], fseen = {};
    if (pend) favs.forEach(function (s, i) { fask.push({ k: 'f' + i, url: mapBusArrUrl(s) }); fseen['f' + i] = 1; });           // 즐겨찾기는 하나라도 못 받았으면 전부 다시(예전 그대로)
    fr.forEach(function (r) { r.ask.forEach(function (n) { if (!fseen[n.k]) { fseen[n.k] = 1; fask.push(n); } }); });          // 이웃·바꾼 ID·경유노선은 못 받은 것만
    var fnx = mapNxPass(favs, fr.map(function (r) { return pend ? null : r.rows; }), fres, fnx0, [], fask.length === 0, mapFxOf(fr));
    if (fnx.nx) info.nx = fnx.nx;
    fask = fask.concat(fnx.ask);
    if (fask.length) info.bus = { st: 'need', vw: 'fav', need: fask };
    var fb = [{ t: 'text', s: '⭐ 즐겨찾기 ' + favs.length + '개 · 30초마다 자동 갱신', size: 12, color: 'sub', pad: [10, 12, 0, 12] }];
    favs.forEach(function (s, i) { fb.push(mapBusCard(s, { mode: 'fav', i: i, alias: al[s.id], lm: pend ? '' : fnx.lm[i], fail: !!(b && b.fl), rows: pend ? null : mapBusRows(fr[i].rows, info, i) })); });
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
  info.stops = stops.map(mapStopKeep); info.favp = MAP_FAVP;
  var foc = (sel >= 0 && sel < stops.length) ? pidx[sel] : -1;
  head.push(mapBusTmap(pts, foc));
  // 정류장마다 따로 본다: 아직 못 받은 정류장은 '도착정보 없음'이 아니라 '불러오는 중'으로 두고, 못 받은 것만 다시 받으라고 한다(받은 것까지 다시 받지 않는다)
  var miss = [], nkp = { m: 'a', x: 'g', t: 't' }, pool = res.tn ? mapTagoStops(res.tn, la, lo) : [];                   // 이웃 정류장 후보 = TAGO 주변 목록 전체(300m 밖도)
  var nx0 = mapNxIn(b), sr = stops.map(function (s, i) { return mapBusStopRows(s, i, res, nkp, pool, nx0); }), extra = [];
  sr.forEach(function (r) { r.ask.forEach(function (n) { (/^a/.test(n.k) ? miss : extra).push(n); }); });
  miss = miss.concat(extra);                                                                       // 본문(a)이 먼저 · 이웃·바꾼 ID·경유노선은 뒤
  var nxr = mapNxPass(stops, sr.map(function (r) { return r.rows; }), res, nx0, pool, miss.length === 0, mapFxOf(sr));
  if (nxr.nx) info.nx = nxr.nx;
  miss = miss.concat(nxr.ask);
  if (miss.length) info.bus = { st: 'need', vw: 'near', need: miss };
  else info.bus = { st: 'ok', vw: 'near', n: stops.length };
  var body = [];
  stops.forEach(function (s, i) {
    body.push(mapBusCard(s, { mode: 'near', i: i, n: i + 1, alias: al[s.id], fav: !!favSet[s.id], pi: pidx[i], on: i === sel, lm: nxr.lm[i], fail: !!b.fl, rows: sr[i].rows === null ? null : mapBusRows(sr[i].rows, info, i) }));
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
// 지도 시트에서 출발·도착을 정할 때 띄우는 안내 글(s207) — 글은 엔진이 정하고 앱은 {n} 자리에 이름만 채워 띄운다.
var MAP_STN_MSG = { s: '출발역: {n} · 이제 도착역을 선택하세요', e: '도착역: {n}', e2: '도착역: {n} · 출발역도 골라 주세요' };
var MAP_BR_MSG = { same: '출발지와 다른 정류장을 눌러 주세요', s: '\uD83D\uDCCD 출발지로 설정되었습니다 · {n}', e: '\uD83C\uDFC1 도착지로 설정되었습니다 · {n}', tostn: '\uD83C\uDFC1 도착지로 설정할 역을 누르세요' };
function mapBrCls(ud) { return ud === 0 ? 'up' : ud === 1 ? 'down' : 'na'; }
function mapBusRouteSheet(f0) {
  var b = mapBrFacts(f0.br);
  if (!b.rid) return { ok: false, error: 'br' };
  var res = b.res, info = { br: { st: 'ok', need: [], msg: MAP_BR_MSG } }, ib = info.br;
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
if (typeof module !== 'undefined' && module.exports) module.exports = { mapQ: mapQ, mapRegionOfLine: mapRegionOfLine, mapLineNum: mapLineNum, mapCdFmt: mapCdFmt, mapBusRouteSheet: mapBusRouteSheet, mapBrCity: mapBrCity, mapBrStnTago: mapBrStnTago, mapBrStnGbis: mapBrStnGbis, mapBrPos: mapBrPos, mapCityOf: mapCityOf, mapGGPreferred: mapGGPreferred, mapGbisArr: mapGbisArr, mapScreen: mapScreen, mapFacts: mapFacts, mapLinesOf: mapLinesOf, mapFind: mapFind, mapNearest: mapNearest, mapIsStationLabel: mapIsStationLabel, mapPickRow: mapPickRow, mapRegionLines: mapRegionLines, mapDedupStops: mapDedupStops, mapStopOrder: mapStopOrder, mapApplyNearOrder: mapApplyNearOrder, mapBusOrd: mapBusOrd, mapBusReady: mapBusReady, MAP_FILTERS: MAP_FILTERS };
