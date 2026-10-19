// 길동무 — 아래 탭 막대 화면 엔진(탭 목록·글자·아이콘·켜진 칸·화면 구성 JSON) 순수 계산 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수; 단일 출처)
//
// ★ 원칙(YJ): "모든 연산은 엔진이 한다. 앱은 엔진이 계산한 그림만 그린다."  (2026-10-18 서버 구동 화면 5호 — 하단 탭 막대)
//   예전엔 www/index.html 의 <nav class="bnav"> 안에 탭 다섯 개의 순서·글자·아이콘(SVG)·켜진 칸 표시가 박혀 있었다.
//   이제 앱은 '지금 켜진 탭 이름' 만 보내고, 엔진이 어떤 탭을 어떤 순서·글자·아이콘으로 그릴지 정해 화면 JSON 으로 내려 준다.
//   앱(네이티브 ScreenCore/ScreenView)은 JSON 을 검증해 그리기만 하고, 칸을 누르면 {a:'call', v:'tab.<이름>'} 만 알린다(웹이 switchTab 을 부른다).
//   웹 탭 막대는 폴백(엔진·네이티브가 안 될 때)으로만 남는다.
//
// 입력  tabsScreen({ cap }, facts)
//        cap   = 앱이 그릴 수 있는 화면 규격 수준(6 이상이어야 만든다)
//        facts = { tab: 켜진 탭('community'|'map'|'home'|'shop'|'food'), badge: { 탭이름: 숫자 } (선택) }
// 출력  { ok, v:1, screen:'tabs', cover:'tab', head:[], body:[tabbar], info:{tab} }
//        tabbar{ h:56, items:[{label, icon(SVG path d), on, badge, act:{a:'call', v:'tab.<이름>'}}] }  — 칸 순서 = 아래 TABS_LIST
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var TABS_SCREEN_V = 1;
// 아이콘 경로는 www/index.html 의 .bnav 안 SVG 와 글자 그대로 같다(test/tabs_engine.test.js 가 대조한다)
var TABS_LIST = [
  { id: 'community', label: '커뮤니티', icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z' },
  { id: 'map', label: '노선도', icon: 'M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z' },
  { id: 'home', label: '홈', icon: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z' },
  { id: 'shop', label: '쇼핑센터', icon: 'M19 6h-2c0-2.76-2.24-5-5-5S7 3.24 7 6H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-7-3c1.66 0 3 1.34 3 3H9c0-1.66 1.34-3 3-3zm7 17H5V8h14v12z' },
  { id: 'food', label: '맛집', icon: 'M18.06 22.99h1.66c.84 0 1.53-.64 1.63-1.46L23 5.05h-5V1h-1.97v4.05h-4.97l.3 2.34c1.71.47 3.31 1.32 4.27 2.26 1.44 1.42 2.43 2.89 2.43 5.29v8.05zM1 21.99V21h15.03v.99c0 .55-.45 1-1.01 1H2.01c-.56 0-1.01-.45-1.01-1zm15.03-7c0-4.5-6.72-5-8.03-5-1.31 0-8.03.5-8.03 5h16.06zm-4.7-9.5c-.7-.79-2.69-1.5-4.33-1.5C5.37 3.99 3 5 3 6.5h13.33c0-1-.46-2-4.97-3z' }
];
function tabsHash(s) {                              // djb2 — 같은 화면이면 같은 rev
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function tabsFacts(f) {
  f = (f && typeof f === 'object') ? f : {};
  var tab = 'home';
  for (var i = 0; i < TABS_LIST.length; i++) if (TABS_LIST[i].id === f.tab) tab = f.tab;
  var badge = {};
  if (f.badge && typeof f.badge === 'object') {
    for (var k = 0; k < TABS_LIST.length; k++) {
      var n = Number(f.badge[TABS_LIST[k].id]);
      if (isFinite(n) && n > 0) badge[TABS_LIST[k].id] = n > 9 ? '9+' : String(Math.floor(n));
    }
  }
  return { tab: tab, badge: badge };
}
function tabsScreen(inp, factsIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 6)) return { ok: false, error: 'cap' };
  var f = tabsFacts(factsIn);
  var items = TABS_LIST.map(function (t) {
    var it = { label: t.label, icon: t.icon, on: t.id === f.tab, act: { a: 'call', v: 'tab.' + t.id } };
    if (f.badge[t.id]) it.badge = f.badge[t.id];
    return it;
  });
  var body = [{ t: 'tabbar', h: 56, items: items }];
  var out = { ok: true, v: 1, screen: 'tabs', cover: 'tab', head: [], body: body, info: { tab: f.tab } };
  out.rev = 't' + TABS_SCREEN_V + ':' + tabsHash(JSON.stringify(body));
  return out;
}

// ★ 2026-10-19 s67 (YJ: 하단 탭을 누를 때 막대가 늦게 바뀐다): 같은 요청에 '다른 탭들의 사실(altsIn = { 키:{ tab, badge } })'을 실어 보내면
//   엔진이 한 번에 모든 탭 화면을 계산해 out.alts[키] 로 돌려준다(앱은 받은 화면을 탭별로 기억해 두었다가 요청 없이 올린다).
function tabsScreens(inp, factsIn, altsIn) {
  var out = tabsScreen(inp, factsIn);
  if (!out || !out.ok) return out;
  if (altsIn === 'tabs') {                        // 엔진이 가진 탭 전부(키 = 탭 이름). 배지는 지금 값 그대로
    var bf = tabsFacts(factsIn);
    altsIn = {};
    TABS_LIST.forEach(function (t) { altsIn[t.id] = { tab: t.id, badge: factsIn && factsIn.badge }; });
  }
  if (altsIn && typeof altsIn === 'object' && !Array.isArray(altsIn)) {
    var ks = Object.keys(altsIn).slice(0, 10), alts = {};
    for (var i = 0; i < ks.length; i++) {
      var a = altsIn[ks[i]];
      if (!a || typeof a !== 'object') continue;
      var o2 = tabsScreen(inp, a);
      if (o2 && o2.ok) alts[ks[i]] = o2;
    }
    out.alts = alts;
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { tabsScreen: tabsScreen, tabsScreens: tabsScreens, tabsFacts: tabsFacts, TABS_LIST: TABS_LIST };
