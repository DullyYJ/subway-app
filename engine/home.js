// 길동무 — 홈 탭 경로 입력 카드(출발/도착 입력·자동완성·위치 감지·바꾸기·경로 탐색·기준시각) 화면 엔진 순수 계산 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수; 단일 출처)
//
// ★ 원칙(YJ): "모든 연산은 엔진이 한다. 앱은 엔진이 계산한 그림만 그린다."  (2026-10-18 서버 구동 화면 8호 — 홈 탭 경로 입력)
//   예전엔 www/index.html 의 홈 카드(HTML)와 fmapSearch(자동완성 줄 그리기) · _updateBaseTimeDisplay(기준시각 글) 가 이 모두를 직접 만들었다.
//   이제 웹은 '원자료'(입력칸 글자 · 어느 칸이 눌려 있나 · 고른 출발/도착이 있나 · 지하철역/버스정류장/장소 후보 · 기준시각 ms)만 보내고,
//   엔진이 몇 줄을 어떤 순서·딱지·글로 보일지, 단추 글·흐림, 기준시각 문구를 정해 화면 JSON 으로 내려 준다. 앱(네이티브)은 그리기만 한다.
//   후보를 모으는 일(STNDB 걸러내기 · TAGO 버스정류장 · 카카오 장소 검색)과 고른 뒤 출발/도착을 정하고 경로를 찾는 일은 예전 그대로 웹 데이터 계층이 한다.
//
// 입력  homeScreen({ cap }, facts, data)
//        cap   = 앱이 그릴 수 있는 화면 규격 수준(7 이상이어야 만든다)
//        facts = { start, dest: 입력칸 글자, active: ''|'start'|'dest'(키보드가 올라온 칸), startSet, destSet: 고른 출발/도착이 있나, gps: 위치 감지 중인가,
//                  base: { ms(기준시각 ms 또는 null), tzo(분, JS getTimezoneOffset), today:[y,m,d](기기 날짜), hol(주말·공휴일) } }
//        data  = { u:[{n, l}] 지하철역 후보, b:[{n, d}] 버스정류장 후보(d = 미터), p:[{n, a}] 장소 후보 }  — 눌려 있는 칸의 글자에 대한 후보만
// 출력  { ok, v:1, screen:'home', cover:'chips', head:[], body:[panel…], info:{h, active, ready, rows} }
//        행동: rt.gps(위치 감지) · rt.swap(바꾸기) · rt.go(경로 탐색) · rt.enter(키보드 확인) · bt.pick(기준시각 열기) · bt.now(현재로) · sg.u.<i> / sg.b.<i> / sg.p.<i>(후보 고르기: 후보 배열의 순번)
//
// ★ 2026-10-19 (5번 2단계: 후보 검색을 웹 밖으로) — 지하철 후보는 엔진이 직접 걸러낸다.
//   data.u 가 배열로 오면 예전 그대로 그 후보를 쓰고(웹이 STNDB 로 걸러 보내던 방식 — 폴백), data.u 가 없으면 눌려 있는 칸의 글자로 엔진이 자기 역 표(HOME_STNS)에서 걸러
//   (같은 걸러내기·같은 이름 합치기·같은 순서·8개까지) 지하철 줄을 만든다. 이때 눌린 후보로 출발/도착을 정하려면 이름·호선·좌표가 필요하니 info.pk.u[번호] 로 함께 준다.
//   info.sx = 1 은 '이 엔진은 역을 직접 거른다'는 표시(웹이 옛 엔진인지 알아보는 데 쓴다).
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var HOME_SCREEN_V = 1;
var HOME_ROW_H = 57, HOME_TROW_H = 34, HOME_SUG_H = 44, HOME_MAX_SUG = 7, HOME_PANEL_T = 14, HOME_PANEL_B = 18;      // 웹 홈 경로 카드: 입력줄 57(+밑줄 1) · 기준시각 줄 34(+윗줄 1) · 카드 위 14 · 아래 18
var HOME_STN_MAX = 8, HOME_SX = 1;
var HOME_STNS;                                                       // Worker 에서는 앞에 붙은 engine/home-stations.js 가 채운다. Node(시험)에서는 아래에서 불러온다.
if (typeof HOME_STNS === 'undefined' || !HOME_STNS) { try { if (typeof require === 'function') HOME_STNS = require('./home-stations').HOME_STNS; } catch (eHs) {} }
var HOME_SWAP_ICON = 'M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z';   // www/index.html 의 바꾸기 단추 SVG 와 같다
function homeHash(s) {
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function homeStr(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
function homeFacts(f) {
  f = (f && typeof f === 'object') ? f : {};
  var b = (f.base && typeof f.base === 'object') ? f.base : {};
  var ms = (typeof b.ms === 'number' && isFinite(b.ms)) ? b.ms : null;
  var today = null;
  if (Array.isArray(b.today) && b.today.length === 3) {
    var y = Math.floor(Number(b.today[0])), m = Math.floor(Number(b.today[1])), d = Math.floor(Number(b.today[2]));
    if (isFinite(y) && isFinite(m) && isFinite(d)) today = [y, m, d];
  }
  var tzo = Number(b.tzo); if (!isFinite(tzo) || Math.abs(tzo) > 1000) tzo = -540;
  return {
    start: homeStr(f.start, 120), dest: homeStr(f.dest, 120),
    active: f.active === 'start' || f.active === 'dest' ? f.active : '',
    startSet: !!f.startSet, destSet: !!f.destSet, gps: !!f.gps,
    base: { ms: ms, tzo: tzo, today: today, hol: !!b.hol }
  };
}
// 기준시각 문구: '현재' | '오늘 오후 2:30' | '내일 오전 9:05' | '10/25(토) 오후 1:00'  (예전 _updateBaseTimeDisplay 와 같은 글)
function homeBaseLabel(base) {
  if (base.ms == null) return '현재';
  var d = new Date(base.ms - base.tzo * 60000);                       // 기기 시각으로 옮긴 값(UTC getter 로 읽는다)
  var by = d.getUTCFullYear(), bm = d.getUTCMonth(), bd = d.getUTCDate(), h = d.getUTCHours(), mi = d.getUTCMinutes();
  var label;
  var t = base.today;
  var diff = t ? Math.round((Date.UTC(by, bm, bd) - Date.UTC(t[0], t[1], t[2])) / 86400000) : null;
  if (diff === 0) label = '오늘';
  else if (diff === 1) label = '내일';
  else label = (bm + 1) + '/' + bd + '(' + '일월화수목금토'.charAt(d.getUTCDay()) + ')';
  return label + ' ' + (h < 12 ? '오전' : '오후') + ' ' + ((h % 12) || 12) + ':' + ('0' + mi).slice(-2);
}
function homeDist(m) {
  m = Number(m);
  if (!isFinite(m) || m <= 0) return '';
  return m >= 1000 ? (Math.round(m / 100) / 10) + 'km' : Math.round(m) + 'm';
}
// 후보 고르기: 종류마다 3줄씩 먼저, 남는 자리를 지하철 → 버스 → 장소 순으로 채워 모두 7줄까지. 보이는 순서는 지하철 · 버스 · 장소.
function homePick(data) {
  data = (data && typeof data === 'object') ? data : {};
  var kinds = [
    { k: 'u', arr: Array.isArray(data.u) ? data.u : [] },
    { k: 'b', arr: Array.isArray(data.b) ? data.b : [] },
    { k: 'p', arr: Array.isArray(data.p) ? data.p : [] }
  ];
  var take = { u: 0, b: 0, p: 0 }, left = HOME_MAX_SUG, i;
  for (i = 0; i < kinds.length; i++) { var n0 = Math.min(3, kinds[i].arr.length, left); take[kinds[i].k] = n0; left -= n0; }
  for (i = 0; i < kinds.length && left > 0; i++) { var more = Math.min(kinds[i].arr.length - take[kinds[i].k], left); take[kinds[i].k] += more; left -= more; }
  var rows = [];
  kinds.forEach(function (K) {
    for (var j = 0; j < take[K.k]; j++) {
      var c = K.arr[j];
      if (!c || typeof c !== 'object') continue;
      var name = homeStr(c.n, 120);
      if (!name) continue;
      var r = { t: 'sug', name: name, act: { a: 'call', v: 'sg.' + K.k + '.' + j } };
      if (K.k === 'u') { r.badge = '지하철'; r.bc = '#0a84ff'; r.sub = homeStr(c.l, 60); }
      else if (K.k === 'b') { r.badge = '버스'; r.bc = '#00b341'; r.sub = homeDist(c.d); }
      else { r.badge = '장소'; r.bc = '#5e5ce6'; r.sub = homeStr(c.a, 100); }
      rows.push(r);
    }
  });
  if (rows.length) rows[rows.length - 1].last = true;
  return rows;
}
// 지하철 후보: 이름에 글자가 들어 있는 역을 표 순서대로 모아 같은 이름은 하나로 합치고(호선은 ' · ' 로 이어 붙임) 8개까지. 앱의 예전 걸러내기(STNDB.filter → _dedupeStnByName → slice 8)와 같다.
function homeStnFind(q) {
  q = typeof q === 'string' ? q.trim() : '';
  var out = { u: [], pk: [] };
  if (!q || !Array.isArray(HOME_STNS)) return out;
  var reps = [], seen = {}, lines = {}, i, s;
  for (i = 0; i < HOME_STNS.length; i++) {
    s = HOME_STNS[i];
    if (!s || typeof s[0] !== 'string' || s[0].indexOf(q) < 0) continue;
    if (!Object.prototype.hasOwnProperty.call(seen, s[0])) { seen[s[0]] = 1; reps.push(s); lines[s[0]] = [s[1]]; }
    else if (lines[s[0]].indexOf(s[1]) < 0) lines[s[0]].push(s[1]);
  }
  for (i = 0; i < reps.length && i < HOME_STN_MAX; i++) {
    s = reps[i];
    out.u.push({ n: s[0], l: lines[s[0]].join(' \u00b7 ') });
    out.pk.push({ name: s[0], line: s[1], lat: s[2], lng: s[3] });
  }
  return out;
}
function homeScreen(inp, factsIn, dataIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 7)) return { ok: false, error: 'cap' };
  var f = homeFacts(factsIn);
  var txt = f.active ? (f.active === 'start' ? f.start : f.dest).trim() : '';
  var pk = null;
  if (txt && !(dataIn && typeof dataIn === 'object' && Array.isArray(dataIn.u))) {      // 웹이 지하철 후보를 안 보냈으면 엔진이 직접 거른다
    var fd = homeStnFind(txt);
    dataIn = Object.assign({}, (dataIn && typeof dataIn === 'object') ? dataIn : {}, { u: fd.u });
    pk = { u: fd.pk };
  }
  var sugs = txt ? homePick(dataIn) : [];
  var ready = (f.startSet && f.destSet) || (f.start.trim().length > 0 && f.dest.trim().length > 0);
  var act = function (v) { return { a: 'call', v: v }; };
  var kids = [];
  var inb = function (key, hint, val, dot, btn, onc, ckf, dim, act) {
    return { t: 'inbar', key: key, hint: hint, value: val, maxlen: 60, h: HOME_ROW_H, size: 15, bold: true, r: 0, fill: '', line: '', dot: dot, pad: [0, 0, 14, 0],
      ifill: 'card2', ifh: 17, ifr: 11, btn: btn, bh: 33, bsize: 12, bpx: 16, onc: onc, ckf: ckf, watch: true, dim: dim, act: act, eact: { a: 'call', v: 'rt.enter' } };
  };
  var line = { t: 'divider', c: 'border2' };
  kids.push(inb('start', '출발지 검색', f.start, '#0a84ff', f.gps ? '감지 중' : '위치 감지', '#0a84ff', '#ffffff', f.gps, act('rt.gps')));
  kids.push({ t: 'swap', size: 34, fill: '#0a84ff', line: 'bg', tc: 'white', icon: HOME_SWAP_ICON, act: act('rt.swap') });
  var rowsS = f.active === 'start' ? sugs : [], rowsD = f.active === 'dest' ? sugs : [];
  kids.push(line);
  rowsS.forEach(function (r) { kids.push(r); });
  kids.push(inb('dest', '도착지 검색', f.dest, '#ff3b30', '경로 탐색', 'gold', '#121214', !ready, act('rt.go')));
  rowsD.forEach(function (r) { kids.push(r); });
  kids.push(line);
  var custom = f.base.ms != null;
  kids.push({ t: 'trow', lb: '\uD83D\uDD50 기준시각', s: homeBaseLabel(f.base), cur: !custom, hint: custom ? '' : '(클릭해서 시간을 변경하세요)',
    day: f.base.hol ? '주말·공휴일' : '평일', dc: f.base.hol ? '#ff9500' : '#30d158', btn: '현재', act: act('bt.pick'), bact: act('bt.now'), h: HOME_TROW_H });
  var body = [{ t: 'panel', pad: [14, HOME_PANEL_T, 14, HOME_PANEL_B], ip: [0, 0, 0, 0], r: 16, kids: kids }];
  var h = HOME_PANEL_T + 2 + HOME_ROW_H + 1 + HOME_ROW_H + 1 + HOME_TROW_H + (rowsS.length + rowsD.length) * HOME_SUG_H + HOME_PANEL_B;
  var out = { ok: true, v: 1, screen: 'home', cover: 'chips', head: [], body: body, info: { h: h, active: f.active, ready: ready, rows: rowsS.length + rowsD.length, sx: HOME_SX } };
  if (pk) out.info.pk = pk;
  out.rev = 'h' + HOME_SCREEN_V + ':' + homeHash(JSON.stringify(body));
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { homeScreen: homeScreen, homeStnFind: homeStnFind, homeFacts: homeFacts, homeBaseLabel: homeBaseLabel, homePick: homePick, homeDist: homeDist, HOME_SWAP_ICON: HOME_SWAP_ICON };
