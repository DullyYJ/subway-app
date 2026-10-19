// 길동무 — 맛집 화면 엔진(분류·거르기·중복 정리·문구·화면 구성 JSON) 순수 계산 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수; 단일 출처)
//
// ★ 원칙(YJ): "모든 연산은 엔진이 한다. 앱은 엔진이 계산한 그림만 그린다."  (2026-10-18 서버 구동 화면 3호 — 맛집 탭)
//   예전엔 맛집 탭의 업종 분류(_foodKind)·카테고리 거르기·공공데이터와 중복 정리·거리 글자·별점·'길찾기' 문구·빈 상태 문구가 www/index.html 안에 있었다.
//   이제 앱은 '받아 둔 가게 목록(원자료)'과 '지금 상태(도착역·불러오는 중·고른 칩)'만 보내고, 엔진이 무엇을 어떤 순서로 보일지·문구는 무엇인지까지 정해 화면 JSON 으로 내려 준다.
//   앱(네이티브 ScreenCore/ScreenView)은 그 JSON 을 검증해 그리기만 한다. 웹 맛집 화면은 폴백(엔진·네이티브가 안 될 때)으로만 남는다.
//
// 입력  foodScreen({ cap }, facts, items)
//        cap   = 앱이 그릴 수 있는 화면 규격 수준(4 이상이어야 맛집 화면을 만든다)
//        facts = { stn: 도착역(또는 가장 가까운 역) 이름('역' 없이) · st: 'idle'|'locating'|'noperm'|'loading'|'none'|'ready' · flt: 고른 칩 · fail: 맛집 서버 요청 실패(1|0) }
//        items = { c: [가게…], p: [가게…] }   가게 = [이름, 업종, 도로명주소, 거리(m)]
//                c = 내장·추천 목록(위쪽에 순위와 별점으로), p = 공공데이터·서버 목록(아래쪽에 '공공데이터' 딱지로)
// 출력  { ok, v:1, screen:'food', rev, cover:'tab', head:[bar, chips], body:[노드…], info:{cur,pub,flt} }  ← 노드 종류는 native/ScreenCore.java 와 같다
//        bar{title,sub,btn,act} · chips{items[{label,on,act:{a:'cat',v}}], onc, onfg} · place{rank,pub,name,sub,stars,badge,dist,go,act:{a:'call',v:'fm.c.<번호>'|'fm.p.<번호>'}} · divider · text · spacer
//        가게를 누르면 앱이 보냈던 목록의 그 번호 가게를 지도 시트로 연다(번호 = 앱이 보낸 배열의 원래 위치).
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var FOOD_SCREEN_V = 1;
var FOOD_CHIPS = ['전체', '카페', '밥집', '육식', '회집', '주점'];
var FOOD_MAX_SHOW = 150;          // 위·아래 목록 각각 최대 개수(웹과 같다)
var FOOD_MAX_IN_C = 400, FOOD_MAX_IN_P = 1500;
var FOOD_ALTS_MAX = 12;           // 한 요청에 실을 수 있는 '다른 칩' 수 상한(칩 6개)
var FOOD_STATES = ['idle', 'locating', 'noperm', 'loading', 'none', 'ready'];

// 업종 → 칩 분류. 순서가 중요하다(회집을 육식보다 먼저 — '참치회 전문'에 '참치'가 육류로 오인되지 않게)
function foodKind(cat) {
  cat = String(cat || '').toLowerCase();
  if (/카페|커피|디저트|베이커리|제과|빵집|브런치|티하우스|아이스크림|빙수|도넛|스무디|밀크티|차전문|카페테리아/.test(cat)) return '카페';
  if (/술집|주점|호프|생맥주|맥주|포장마차|포차|와인|칵테일|위스키|사케|이자카야|펍|유흥|바\(|bar/.test(cat)) return '주점';
  if (/회\/초밥|회\s*전문|횟집|물회|생선회|해산물|조개|오징어|장어|해물|수산|스시|초밥|사시미|대게|킹크랩|낙지|문어|전복|굴|참치|연어|광어|우럭|방어|아구|복어/.test(cat)) return '회집';
  if (/고기|육류|구이|삼겹|목살|갈비|곱창|막창|대창|치킨|닭|오리|스테이크|바비큐|숯불|훈제|족발|보쌈|돼지|소고기|한우|양꼬치|육회|햄버거|버거|정육|샤브|불고기|돈가스|부대찌개|감자탕/.test(cat)) return '육식';
  return '밥집';
}
function foodCatSimple(cat) {                      // '음식 > 한식 > 국밥' → '국밥'
  if (!cat) return '음식점';
  var c = String(cat).split(/\s*>\s*/);
  return c[c.length - 1] || c[0] || '음식점';
}
function foodDist(m) {
  m = parseInt(m, 10) || 0;
  return m >= 1000 ? (m / 1000).toFixed(1) + 'km' : m + 'm';
}
function foodStars(idx) {                          // 순위로 별점 추정(인기순 정렬이라)
  return idx < 3 ? '★★★★★' : idx < 6 ? '★★★★' : idx < 10 ? '★★★' : '★★';
}
function foodStr(v, n) { return typeof v === 'string' ? v.slice(0, n) : (typeof v === 'number' ? String(v).slice(0, n) : ''); }
function foodNameOf(v) { return foodStr(v, 120).replace(/<[^>]*>/g, '').trim(); }
function foodKey(name) { return String(name || '').replace(/\s/g, ''); }

function foodFacts(f) {
  f = (f && typeof f === 'object') ? f : {};
  var stn = foodStr(f.stn, 30).replace(/역$/, '');
  var st = FOOD_STATES.indexOf(f.st) >= 0 ? f.st : (stn ? 'ready' : 'idle');
  var flt = FOOD_CHIPS.indexOf(f.flt) >= 0 ? f.flt : '전체';
  return { stn: stn, st: st, flt: flt, fail: f.fail === 1 || f.fail === true || f.fail === '1' };
}
// 가게 배열 [이름, 업종, 주소, 거리, 위도, 경도] → { n, c, a, d, i(원래 번호) }. 이름 없는 건 뺀다(빈 카드 방지)
function foodList(arr, max) {
  var out = [];
  if (!Array.isArray(arr)) return out;
  for (var i = 0; i < arr.length && i < max; i++) {
    var a = arr[i];
    if (!Array.isArray(a)) continue;
    var n = foodNameOf(a[0]);
    if (!n) continue;
    var d = Number(a[3]);
    out.push({ n: n, c: foodStr(a[1], 120), a: foodStr(a[2], 160), d: isFinite(d) ? d : null, i: i });
  }
  return out;
}
function foodHash(s) {                             // djb2 — 같은 화면이면 같은 rev
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function foodMsgN(s) { return { t: 'text', s: s, size: 14, color: 'sub', lh: 1.8, align: 'center', pad: [20, 60, 20, 60] }; }
function foodPlaceN(p, rank, pub, idxPrefix) {
  var addr = p.a ? ' · ' + p.a.split(' ').slice(-2).join(' ') : '';
  var n = { t: 'place', pad: [12, 0, 12, 10], rank: rank, name: p.n, sub: foodCatSimple(p.c) + addr, dist: foodDist(p.d), go: '길찾기 · 지도 →', act: { a: 'call', v: 'fm.' + idxPrefix + '.' + p.i } };
  if (pub) { n.pub = true; n.badge = '공공데이터'; } else n.stars = foodStars(Number(rank) - 1);
  return n;
}

// 한 칩(f.flt) 분의 화면. all·allP = foodList 로 이미 정리한 위·아래 목록(같은 목록의 다른 칩을 만들 때 다시 정리하지 않으려고 따로 뺐다)
function foodScreenOf(f, all, allP) {
  var match = function (p) { return f.flt === '전체' || foodKind(p.c) === f.flt; };
  var cur = all.filter(match), pub = allP.filter(match);
  var seen = {};                                    // 위쪽 목록에 이미 있는 상호는 공공데이터에서 뺀다(중복 방지)
  cur.forEach(function (p) { seen[foodKey(p.n)] = 1; });
  pub = pub.filter(function (p) { return !seen[foodKey(p.n)]; });

  var label = f.stn && (f.st === 'ready' || f.st === 'loading' || f.st === 'none') ? f.stn + '역 인근' : (f.st === 'locating' ? '위치 확인 중...' : '도착역을 설정하면 맛집을 추천해드려요');
  var head = [
    { t: 'bar', pad: [16, 16, 16, 8], title: '도착역 맛집', sub: label, btn: '새로고침', act: { a: 'refresh' } },
    { t: 'chips', pad: [16, 0, 16, 12], gap: 8, h: 30, onc: 'gold', onfg: '#121214',
      items: FOOD_CHIPS.map(function (c) { return { label: c, on: c === f.flt, act: { a: 'cat', v: c } }; }) }
  ];

  var body = [];
  if (f.st === 'idle') body.push(foodMsgN('경로를 설정하면\n도착역 주변 맛집을 추천해드려요!'));
  else if (f.st === 'locating') body.push(foodMsgN('내 위치 확인 중...'));
  else if (f.st === 'noperm') body.push(foodMsgN('위치 권한을 허용하거나\n경로를 설정하면 맛집을 추천해드려요!'));
  else if (!cur.length && !pub.length) {
    if (f.st === 'loading') body.push(foodMsgN((f.stn || '이곳') + ' 주변 음식점 불러오는 중...'));
    else if (f.st === 'none' && !all.length && !allP.length) body.push(foodMsgN((f.stn || '이곳') + '역 인근 등록 음식점 정보가 없어요'));
    else if (f.fail) body.push(foodMsgN('맛집 정보를 불러오지 못했어요.\n잠시 뒤 새로고침을 눌러주세요.'));
    else body.push(foodMsgN('해당 카테고리 음식점이 없습니다.'));
  } else {
    var n = 0, k;
    for (k = 0; k < cur.length && n < FOOD_MAX_SHOW; k++, n++) body.push(foodPlaceN(cur[k], String(n + 1), false, 'c'));
    if (pub.length) {
      body.push({ t: 'divider', pad: [12, 8, 12, 0] });
      body.push({ t: 'text', s: '공공데이터 · 주변 ' + (f.flt === '전체' ? '음식점' : f.flt) + ' ' + pub.length + '곳', size: 12, bold: true, color: 'sub', pad: [14, 12, 14, 6] });
      for (k = 0, n = 0; k < pub.length && n < FOOD_MAX_SHOW; k++, n++) body.push(foodPlaceN(pub[k], '', true, 'p'));
    }
    body.push({ t: 'spacer', h: 80 });
  }
  var out = { ok: true, v: 1, screen: 'food', cover: 'tab', head: head, body: body, info: { cur: cur.length, pub: pub.length, flt: f.flt } };
  out.rev = 'f' + FOOD_SCREEN_V + ':' + foodHash(JSON.stringify([head, body]));
  return out;
}

function foodScreen(inp, factsIn, itemsIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 4)) return { ok: false, error: 'cap' };
  var f = foodFacts(factsIn), it = (itemsIn && typeof itemsIn === 'object') ? itemsIn : {};
  return foodScreenOf(f, foodList(it.c, FOOD_MAX_IN_C), foodList(it.p, FOOD_MAX_IN_P));
}

// ★ 2026-10-19 s67 (YJ: 도착역 맛집 로딩이 오래 걸려 — 칩을 누를 때마다 가게 목록을 다시 보내고 새 화면을 받았다):
//   같은 요청에 '다른 칩들의 사실(altsIn = { 키: { stn, st, flt, fail } } 또는 'chips' = 엔진이 가진 칩 전부)'을 실어 보내면 엔진이 한 번에 모든 칩 화면을 계산해 out.alts[키] 로 돌려준다.
//   가게 목록 정리(foodList)는 한 번만 한다. 앱은 받은 화면을 칩별로 기억해 두었다가 칩을 누르면 요청 없이 그대로 올린다(계산은 엔진, 앱은 그리기).
//   각 alts[키] 는 그 칩으로 따로 요청했을 때와 글자 하나까지 같은 화면이다(시험이 대조한다).
function foodScreens(inp, factsIn, itemsIn, altsIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 4)) return { ok: false, error: 'cap' };
  var it = (itemsIn && typeof itemsIn === 'object') ? itemsIn : {};
  var all = foodList(it.c, FOOD_MAX_IN_C), allP = foodList(it.p, FOOD_MAX_IN_P);
  var out = foodScreenOf(foodFacts(factsIn), all, allP);
  if (altsIn === 'chips') {                       // 앱은 어떤 칩이 있는지 모른다 — 엔진이 가진 칩 전부로 지금 사실만 칩을 바꿔 만든다. 키 = 칩 이름
    var bf = foodFacts(factsIn);
    altsIn = {};
    FOOD_CHIPS.forEach(function (c) { altsIn[c] = { stn: bf.stn, st: bf.st, flt: c, fail: bf.fail ? 1 : 0 }; });
  }
  if (altsIn && typeof altsIn === 'object' && !Array.isArray(altsIn)) {
    var ks = Object.keys(altsIn).slice(0, FOOD_ALTS_MAX), alts = {};
    for (var i = 0; i < ks.length; i++) {
      var a = altsIn[ks[i]];
      if (!a || typeof a !== 'object') continue;
      alts[ks[i]] = foodScreenOf(foodFacts(a), all, allP);
    }
    out.alts = alts;
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { foodScreen: foodScreen, foodScreens: foodScreens, foodFacts: foodFacts, foodKind: foodKind, foodCatSimple: foodCatSimple, foodDist: foodDist, foodStars: foodStars, foodList: foodList, FOOD_CHIPS: FOOD_CHIPS };
