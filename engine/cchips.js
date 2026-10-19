// 길동무 — 커뮤니티 맨 위 칩 줄(실시간소통 · 게시판 · 뉴스 · 설정) 엔진 (route-v2 Worker 에 붙여 넣는 순수 함수; 단일 출처)
//
// ★ 원칙(YJ): "모든 연산은 엔진이 한다. 앱은 엔진이 계산한 그림만 그린다."  (2026-10-19 s69 — 커뮤니티 칩 줄)
//   예전엔 www/index.html 의 #filterRow 안에 칩 네 개의 순서·글자·이모지·켜진 칸이 박혀 있었다.
//   이제 앱은 '지금 켜진 칸(mode)' 만 보내고, 엔진이 어떤 칩을 어떤 순서·글자·색으로 그릴지 정해 화면 JSON 으로 내려 준다.
//   앱(네이티브 ScreenCore/ScreenView)은 JSON 을 검증해 그리기만 하고, 칩을 누르면 {a:'call', v:'cc.<칸>'} 만 알린다(웹이 showChatTab/filterCat/showSettingsTab 을 부른다).
//   웹 칩 줄은 폴백(엔진·네이티브가 안 될 때)으로만 남는다.
//
// 입력  cchipsScreen({ cap }, facts)
//        cap   = 앱이 그릴 수 있는 화면 규격 수준(6 이상이어야 만든다)
//        facts = { mode: 'chat'|'board'|'news'|'set' }  (모르는 값은 게시판)
// 출력  { ok, v:1, screen:'cchips', cover:'tab', head:[chips], body:[], info:{mode} }
//        chips.items = [{label, on, c?, act:{a:'call', v:'cc.<칸>'}}] — 칸 순서 = 아래 CCHIPS_LIST
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var CCHIPS_SCREEN_V = 1;
// 글자는 웹 #filterRow 와 같다(이모지만 뺀다 — 새 네이티브 화면은 이모지를 쓰지 않는다). 시험이 웹과 대조한다.
var CCHIPS_LIST = [
  { id: 'chat', label: '실시간소통', c: '#ff453a' },
  { id: 'board', label: '게시판' },
  { id: 'news', label: '뉴스' },
  { id: 'set', label: '설정' }
];
function cchipsHash(s) {                              // djb2 — 같은 화면이면 같은 rev
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function cchipsFacts(f) {
  f = (f && typeof f === 'object') ? f : {};
  var mode = 'board';
  for (var i = 0; i < CCHIPS_LIST.length; i++) if (CCHIPS_LIST[i].id === f.mode) mode = f.mode;
  return { mode: mode };
}
function cchipsScreen(inp, factsIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 6)) return { ok: false, error: 'cap' };
  var f = cchipsFacts(factsIn);
  var items = CCHIPS_LIST.map(function (c) {
    var it = { label: c.label, on: c.id === f.mode, act: { a: 'call', v: 'cc.' + c.id } };
    if (c.c) it.c = c.c;
    return it;
  });
  var head = [{ t: 'chips', pad: [0, 0, 0, 0], gap: 6, h: 26, onc: 'gold', onfg: '#121214', items: items }];
  var out = { ok: true, v: 1, screen: 'cchips', cover: 'tab', head: head, body: [], info: { mode: f.mode } };
  out.rev = 'q' + CCHIPS_SCREEN_V + ':' + cchipsHash(JSON.stringify(head));
  return out;
}

// 같은 요청에 '다른 칸들의 사실(altsIn = { 키:{ mode } } 또는 'chips' = 엔진이 가진 칸 전부)'을 실어 보내면 한 번에 모든 칸 화면을 계산해 out.alts[키] 로 돌려준다(칩을 눌러도 기다리지 않게).
function cchipsScreens(inp, factsIn, altsIn) {
  var out = cchipsScreen(inp, factsIn);
  if (!out || !out.ok) return out;
  if (altsIn === 'chips') {
    altsIn = {};
    CCHIPS_LIST.forEach(function (c) { altsIn[c.id] = { mode: c.id }; });
  }
  if (altsIn && typeof altsIn === 'object' && !Array.isArray(altsIn)) {
    var ks = Object.keys(altsIn).slice(0, 10), alts = {};
    for (var i = 0; i < ks.length; i++) {
      var a = altsIn[ks[i]];
      if (!a || typeof a !== 'object') continue;
      var o2 = cchipsScreen(inp, a);
      if (o2 && o2.ok) alts[ks[i]] = o2;
    }
    out.alts = alts;
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { cchipsScreen: cchipsScreen, cchipsScreens: cchipsScreens, cchipsFacts: cchipsFacts, CCHIPS_LIST: CCHIPS_LIST };
