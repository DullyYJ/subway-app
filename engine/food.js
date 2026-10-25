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
// 출력  { ok, v:1, screen:'food', rev, cover:'tab', head:[bar, chips], body:[노드…], info:{cur,pub,flt} }  ← 노드 종류는 native/shell/ScreenCore.java 와 같다
//        bar{title,sub,btn,act} · chips{items[{label,on,act:{a:'cat',v}}], onc, onfg} · place{rank,pub,name,sub,stars,badge,dist,go,act:{a:'call',v:'fm.c.<번호>'|'fm.p.<번호>'}} · divider · text · spacer
//        가게를 누르면 앱이 보냈던 목록의 그 번호 가게를 지도 시트로 연다(번호 = 앱이 보낸 배열의 원래 위치).
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var FOOD_SCREEN_V = 2;
var FOOD_CHIPS = ['전체', '카페', '밥집', '육식', '회집', '주점'];
var FOOD_CHIP_EMOJI = { '카페': '☕', '밥집': '🍚', '육식': '🍖', '회집': '🍣', '주점': '🍺' };     // 웹 .food-chip 앞 그림
var FOOD_MAX_SHOW = 150;          // 위·아래 목록 각각 최대 개수(웹과 같다)
var FOOD_MAX_IN_C = 400, FOOD_MAX_IN_P = 1500;
var FOOD_ALTS_MAX = 12;           // 한 요청에 실을 수 있는 '다른 칩' 수 상한(칩 6개)
var FOOD_STATES = ['idle', 'locating', 'noperm', 'loading', 'none', 'ready', 'done'];   // done = 앱이 '받기를 마쳤다'고만 알린다 — 목록이 있는지에 따라 ready/none 은 엔진이 정한다

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

function foodLL(v) {                              // [위도, 경도] 한 쌍 — 한국 범위 밖이면 없는 것으로 본다
  if (!Array.isArray(v) || v.length < 2) return null;
  var la = Number(v[0]), lo = Number(v[1]);
  return (isFinite(la) && isFinite(lo) && la > 30 && la < 40 && lo > 123 && lo < 133) ? [la, lo] : null;
}
function foodFacts(f) {
  f = (f && typeof f === 'object') ? f : {};
  var stn = foodStr(f.stn, 30).replace(/역$/, '');
  var st = FOOD_STATES.indexOf(f.st) >= 0 ? f.st : (stn ? 'ready' : 'idle');
  var flt = FOOD_CHIPS.indexOf(f.flt) >= 0 ? f.flt : '전체';
  var sel = (f.sel && typeof f.sel === 'object' && !Array.isArray(f.sel)) ? f.sel : null;
  return { stn: stn, st: st, flt: flt, fail: f.fail === 1 || f.fail === true || f.fail === '1',
           gps: foodLL(f.gps), dl: foodLL(f.dl), me: foodLL(f.me), ctr: foodLL(f.ctr), sel: sel,
           pn: f.pn === 1 || f.pn === true || f.pn === '1', res: (f.res && typeof f.res === 'object' && !Array.isArray(f.res)) ? f.res : {} };
}
// ── 거리·역 찾기(웹 haversineM · _foodResolveCoord · _foodLoadNearby 와 같은 계산) ──
function foodHav(la1, lo1, la2, lo2) {
  var R = 6371000, dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
  var a = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function foodStnTable() {                          // Worker 에서는 HOME 블록이 채운 전역 HOME_STNS, Node(시험)에서는 파일을 불러온다
  if (typeof HOME_STNS !== 'undefined' && HOME_STNS) return HOME_STNS;
  try { if (typeof require === 'function') return require('./home-stations').HOME_STNS; } catch (e) { /* 없음 */ }
  return [];
}
// 도착역 이름(없으면 기기 위치에서 가장 가까운 역)과 그 중심 좌표. 좌표를 못 정하면 ctr=null.
function foodResolve(f) {
  var T = foodStnTable(), i, s;
  if (f.stn) {
    var hit = null, hd = 1e12;                          // s208: 같은 이름 역이 여러 권역에 있으면(중동 등) 앱이 알려 준 도착지 좌표(dl)에 가장 가까운 역 — 없으면 표에서 처음 만난 역
    for (i = 0; i < T.length; i++) {
      s = T[i];
      if (String(s[0]).replace(/역$/, '') !== f.stn) continue;
      var dd = f.dl ? foodHav(f.dl[0], f.dl[1], s[2], s[3]) : 0;
      if (!hit || dd < hd) { hit = s; hd = dd; }
      if (!f.dl) break;
    }
    if (hit) return { stn: f.stn, ctr: [hit[2], hit[3]] };
    return { stn: f.stn, ctr: f.dl };                // 표에 없는 이름이면 앱이 알려 준 도착지 좌표
  }
  if (f.gps) {
    var best = 1e12, near = null;
    for (i = 0; i < T.length; i++) { s = T[i]; var d = foodHav(f.gps[0], f.gps[1], s[2], s[3]); if (d < best) { best = d; near = s; } }
    if (near) return { stn: String(near[0]).replace(/역$/, ''), ctr: [near[2], near[3]] };
    return { stn: '', ctr: f.gps };
  }
  return { stn: '', ctr: null };
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
    var la = Number(a[4]), lo = Number(a[5]);
    out.push({ n: n, c: foodStr(a[1], 120), a: foodStr(a[2], 160), d: isFinite(d) ? d : null, i: i, la: isFinite(la) && a[4] != null && a[4] !== '' ? la : null, lo: isFinite(lo) && a[5] != null && a[5] !== '' ? lo : null });
  }
  return out;
}
// ── 원자료 정리(웹 _foodFromServer · _fetchPublicFood · _foodMergeList 와 같은 규칙) ──
//   서버 가게  s = [{ n, c, a, d, la, lo }…]            → 위쪽 목록(순위·별점)
//   공공데이터 u = [[상호, 중분류, 소분류, 도로명주소, 지번주소, 위도, 경도]…]  → 아래쪽 목록('공공데이터' 딱지). 거리는 중심 좌표에서 엔진이 잰다.
function foodRowKey(r) { return foodKey(r[0]) + '@' + r[2]; }
function foodMergeRows(rows) {                     // 같은 상호·같은 주소 중복 정리 → 거리순(거리 모르면 맨 뒤)
  var seen = {}, out = [];
  rows.forEach(function (r) { var k = foodRowKey(r); if (!r[0] || seen[k]) return; seen[k] = 1; out.push(r); });
  out.sort(function (a, b) { return (a[3] == null ? 99999 : a[3]) - (b[3] == null ? 99999 : b[3]); });
  return out;
}
function foodRowsServer(arr) {
  var rows = [];
  if (!Array.isArray(arr)) return rows;
  for (var i = 0; i < arr.length && i < FOOD_MAX_IN_C; i++) {
    var it = arr[i];
    if (!it || typeof it !== 'object' || !foodNameOf(it.n)) continue;
    var d = it.d == null ? null : parseInt(it.d, 10);
    rows.push([foodStr(it.n, 120), foodStr(it.c, 120), foodStr(it.a, 160), isFinite(d) ? d : null, it.la == null ? null : Number(it.la), it.lo == null ? null : Number(it.lo)]);
  }
  return foodMergeRows(rows);
}
function foodRowsPublic(arr, ctr) {
  var rows = [];
  if (!Array.isArray(arr)) return rows;
  for (var i = 0; i < arr.length && i < FOOD_MAX_IN_P; i++) {
    var it = arr[i];
    if (!Array.isArray(it) || !foodNameOf(it[0])) continue;
    var la = parseFloat(it[5]), lo = parseFloat(it[6]);
    var ok = isFinite(la) && isFinite(lo);
    var dist = (ok && ctr) ? Math.round(foodHav(ctr[0], ctr[1], la, lo)) : null;
    rows.push([foodStr(it[0], 120), [foodStr(it[1], 60), foodStr(it[2], 60)].filter(Boolean).join(' '), foodStr(it[3], 160) || foodStr(it[4], 160), dist, ok ? la : null, ok ? lo : null]);
  }
  return foodMergeRows(rows);
}
function foodHash(s) {                             // djb2 — 같은 화면이면 같은 rev
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function foodMsgN(s) { return { t: 'text', s: s, size: 14, color: 'sub', lh: 1.8, align: 'center', pad: [20, 60, 20, 60] }; }
function foodPlaceN(p, rank, pub, idxPrefix, go) {
  var addr = p.a ? ' · ' + p.a.split(' ').slice(-2).join(' ') : '';
  var n = { t: 'place', pad: [12, 0, 12, 10], rank: rank, name: p.n, sub: foodCatSimple(p.c) + addr, dist: foodDist(p.d), go: '길찾기 · 지도 →', act: { a: 'call', v: 'fm.' + idxPrefix + '.' + p.i } };
  if (go && p.la != null && p.lo != null) go[idxPrefix + '.' + p.i] = [p.n, p.c, p.a, p.la, p.lo];
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
    { t: 'bar', pad: [16, 16, 16, 8], title: '🍽️ 도착역 맛집', sub: label, btn: '🔄 새로고침', act: { a: 'refresh' } },
    { t: 'chips', pad: [16, 0, 16, 12], gap: 8, h: 31, fs: 12, px: 15, onc: 'gold', onfg: '#ffffff', offf: 'card2', offb: 'border', offt: 'sub',      // 웹 .food-chip: 31px · 12px · 바탕 card2
      items: FOOD_CHIPS.map(function (c) { return { label: (FOOD_CHIP_EMOJI[c] ? FOOD_CHIP_EMOJI[c] + ' ' : '') + c, on: c === f.flt, act: { a: 'cat', v: c } }; }) }
  ];

  var body = [], go = {};
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
    for (k = 0; k < cur.length && n < FOOD_MAX_SHOW; k++, n++) body.push(foodPlaceN(cur[k], String(n + 1), false, 'c', go));
    if (pub.length) {
      body.push({ t: 'divider', pad: [12, 8, 12, 0] });
      body.push({ t: 'text', s: '공공데이터 · 주변 ' + (f.flt === '전체' ? '음식점' : f.flt) + ' ' + pub.length + '곳', size: 12, bold: true, color: 'sub', pad: [14, 12, 14, 6] });
      for (k = 0, n = 0; k < pub.length && n < FOOD_MAX_SHOW; k++, n++) body.push(foodPlaceN(pub[k], '', true, 'p', go));
    }
    body.push({ t: 'spacer', h: 80 });
  }
  var out = { ok: true, v: 1, screen: 'food', cover: 'tab', head: head, body: body, info: { cur: cur.length, pub: pub.length, flt: f.flt, stn: f.stn, ctr: f.ctr || null, go: go } };
  out.rev = 'f' + FOOD_SCREEN_V + ':' + foodHash(JSON.stringify([head, body]));
  return out;
}

// 입력 한 벌을 화면 계산에 쓸 모양으로 정리한다: 도착역·중심 좌표를 정하고(없으면 기기 위치 → 가장 가까운 역), 원자료(s·u)를 거리순 목록으로 만든다.
function foodPrep(factsIn, itemsIn) {
  var f = foodFacts(factsIn), it = (itemsIn && typeof itemsIn === 'object') ? itemsIn : {};
  var rs = foodResolve(f);
  var rawC = Array.isArray(it.s) ? foodRowsServer(it.s) : null, rawP = Array.isArray(it.u) ? foodRowsPublic(it.u, rs.ctr) : null;
  var c = rawC || (Array.isArray(it.c) ? it.c : []), p = rawP || (Array.isArray(it.p) ? it.p : []);
  return { f: f, stn: rs.stn, ctr: rs.ctr, all: foodList(c, FOOD_MAX_IN_C), allP: foodList(p, FOOD_MAX_IN_P) };
}
function foodFactsFor(f, base) {                   // 화면 하나에 쓸 사실: 도착역 이름·좌표를 채우고 'done' 을 ready/none 으로 정한다
  var o = { stn: base.stn || f.stn, st: f.st, flt: f.flt, fail: f.fail, ctr: base.ctr };
  if (o.st === 'loading' && !base.ctr && o.stn) o.st = 'none';             // 좌표를 못 정하는 도착지 — 영영 '불러오는 중'에 머물지 않게
  if (o.st === 'done') o.st = (base.all.length || base.allP.length) ? 'ready' : (f.fail ? 'ready' : 'none');
  return o;
}

function foodScreen(inp, factsIn, itemsIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 4)) return { ok: false, error: 'cap' };
  var P = foodPrep(factsIn, itemsIn);
  if (P.f.sel) return P.f.pn ? foodPanel(P.f) : foodSheet(P.f);
  return foodScreenOf(foodFactsFor(P.f, P), P.all, P.allP);
}

// ★ 2026-10-19 s67 (YJ: 도착역 맛집 로딩이 오래 걸려 — 칩을 누를 때마다 가게 목록을 다시 보내고 새 화면을 받았다):
//   같은 요청에 '다른 칩들의 사실(altsIn = { 키: { stn, st, flt, fail } } 또는 'chips' = 엔진이 가진 칩 전부)'을 실어 보내면 엔진이 한 번에 모든 칩 화면을 계산해 out.alts[키]
//   가게 목록 정리(foodList)는 한 번만 한다. 앱은 받은 화면을 칩별로 기억해 두었다가 칩을 누르면 요청 없이 그대로 올린다(계산은 엔진, 앱은 그리기).
//   각 alts[키] 는 그 칩으로 따로 요청했을 때와 글자 하나까지 같은 화면이다(시험이 대조한다).
function foodScreens(inp, factsIn, itemsIn, altsIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 4)) return { ok: false, error: 'cap' };
  var P = foodPrep(factsIn, itemsIn);
  if (P.f.sel) return P.f.pn ? foodPanel(P.f) : foodSheet(P.f);
  var out = foodScreenOf(foodFactsFor(P.f, P), P.all, P.allP);
  if (altsIn === 'chips') {                       // 앱은 어떤 칩이 있는지 모른다 — 엔진이 가진 칩 전부로 지금 사실만 칩을 바꿔 만든다. 키 = 칩 이름
    altsIn = {};
    FOOD_CHIPS.forEach(function (c) { altsIn[c] = { stn: P.f.stn, st: P.f.st, flt: c, fail: P.f.fail ? 1 : 0, gps: P.f.gps, dl: P.f.dl }; });
  }
  if (altsIn && typeof altsIn === 'object' && !Array.isArray(altsIn)) {
    var ks = Object.keys(altsIn).slice(0, FOOD_ALTS_MAX), alts = {};
    for (var i = 0; i < ks.length; i++) {
      var a = altsIn[ks[i]];
      if (!a || typeof a !== 'object') continue;
      var fa = foodFacts(a);
      if (!fa.gps) fa.gps = P.f.gps;
      if (!fa.dl) fa.dl = P.f.dl;
      var ra = foodResolve(fa);
      alts[ks[i]] = foodScreenOf(foodFactsFor(fa, { stn: ra.stn, ctr: ra.ctr, all: P.all, allP: P.allP }), P.all, P.allP);
    }
    out.alts = alts;
  }
  return out;
}

// ── 가게 시트: 가게를 누르면 앱이 info.go 에서 그 가게의 [이름, 업종, 주소, 위도, 경도] 를 f.sel 로 보내고, 엔진이 시트 화면과 열 주소(info.nv)를 정한다 ──
//   주소는 앱 스킴(app)과 웹(web)이 한 쌍 — 앱은 app 을 열어 보고 못 열면 web 을 연다. 출발지(f.me)가 있으면 '내 위치'에서 걷는 길찾기.
function foodNavUrls(sel, me) {
  var name = foodNameOf(sel.n), la = Number(sel.la), lo = Number(sel.lo), e = encodeURIComponent;
  var hasPos = isFinite(la) && isFinite(lo), nm = e(name);
  var nv = {};
  if (hasPos) {
    nv.nroute = { app: 'nmap://route/walk?' + (me ? 'slat=' + me[0] + '&slng=' + me[1] + '&sname=' + e('내 위치') + '&' : '') + 'dlat=' + la + '&dlng=' + lo + '&dname=' + nm + '&appname=com.dullyyj.subway',
                  web: 'https://map.naver.com/p/directions/' + (me ? me[1] + ',' + me[0] + ',' + e('내 위치') + ',,-1/' : '-/') + lo + ',' + la + ',' + nm + ',,-1/walk' };
    nv.kroute = { app: 'kakaomap://route?' + (me ? 'sp=' + me[0] + ',' + me[1] + '&' : '') + 'ep=' + la + ',' + lo + '&by=FOOT',
                  web: 'https://map.kakao.com/link/to/' + nm + ',' + la + ',' + lo };
  }
  nv.ninfo = { app: 'nmap://search?query=' + nm + (hasPos ? '&lat=' + la + '&lng=' + lo + '&zoom=17' : '') + '&appname=com.dullyyj.subway',
               web: 'https://map.naver.com/p/search/' + nm + (hasPos ? '?c=17.00,' + lo + ',' + la + ',0,0,0,dh' : '') };
  nv.kinfo = { app: 'kakaomap://search?q=' + nm + (hasPos ? '&p=' + la + ',' + lo : ''), web: 'https://map.kakao.com/link/search/' + nm };
  return nv;
}
// ── 카카오 장소 ID (예전 웹 _placeKakaoId): 가게 이름 + 좌표로 카카오 장소 검색(반경 500m, 거리순) 결과 중 이름이 같거나 서로 포함되는 것을 고른다.
//   이름이 정확히 같은 것 우선, 같은 급이면 가까운 것. 못 찾으면 null — 앱은 이때 이름 검색 주소로 연다. 결과 주소: 카카오맵 앱 place?id= / 웹 place.map.kakao.com/<id>.
function foodPlaceNorm(x) { return String(x || '').replace(/<[^>]*>/g, '').replace(/[\s·.,()\-_/]/g, '').toLowerCase(); }
function foodKakaoPick(docs, name) {
  var want = foodPlaceNorm(name), best = null, i;
  if (!want || !Array.isArray(docs)) return null;
  for (i = 0; i < docs.length; i++) {
    var d = docs[i], got = foodPlaceNorm(d && d.place_name);
    if (!got || !d.id) continue;
    if (got !== want && got.indexOf(want) < 0 && want.indexOf(got) < 0) continue;      // 이름이 다르면 다른 가게
    var dist = parseFloat(d.distance); if (isNaN(dist)) dist = 0;
    var exact = got === want ? 0 : 1;
    if (!best || exact < best.exact || (exact === best.exact && dist < best.dist)) best = { id: String(d.id), dist: dist, exact: exact };
  }
  return best ? best.id : null;
}
function foodKakaoLinks(id) { return /^\d{1,20}$/.test(String(id)) ? { app: 'kakaomap://place?id=' + id, web: 'https://place.map.kakao.com/' + id } : null; }
function foodKakaoQuery(name, la, lo) { return 'query=' + encodeURIComponent(String(name || '').slice(0, 60)) + '&x=' + Number(lo) + '&y=' + Number(la) + '&radius=500&sort=distance&size=10'; }
function foodSheet(f) {
  var sel = f.sel, name = foodNameOf(sel.n);
  if (!name) return { ok: false, error: 'sel' };
  var nv = foodNavUrls(sel, f.me);
  var btn = function (s, v, gold) { return { t: 'button', s: s, size: 14, h: 46, r: 11, bold: true, fill: gold ? 'gold' : 'card2', line: gold ? 'none' : 'border', tc: gold ? '#121214' : '', pad: [0, 10, 0, 0], act: { a: 'call', v: v } }; };
  var kids = [
    { t: 'text', s: name, size: 17, bold: true, color: 'text', lh: 1.35, pad: [0, 0, 0, 0] },
    { t: 'text', s: foodCatSimple(foodStr(sel.c, 120)) + (sel.a ? ' · ' + foodStr(sel.a, 160) : ''), size: 12, color: 'sub', lh: 1.5, pad: [4, 0, 0, 6] }
  ];
  if (nv.nroute) { kids.push(btn('네이버 지도로 걸어서 길찾기', 'fm.nr', true)); kids.push(btn('카카오맵으로 걸어서 길찾기', 'fm.kr', true)); }
  kids.push(btn('네이버 지도에서 가게 정보', 'fm.ni', false));
  kids.push(btn('카카오맵에서 가게 정보', 'fm.ki', false));
  var body = [{ t: 'panel', pad: [0, 0, 0, 0], ip: [16, 14, 16, 18], fill: 'card', line: 'border', r: 22, kids: kids }];
  var head = [{ t: 'bar', pad: [0, 0, 0, 4], title: '맛집', btn: '닫기', act: { a: 'call', v: 'fm.close' } }];
  body[0].kids.unshift(head[0]);
  var out = { ok: true, v: 1, screen: 'foodsheet', cover: 'tab', head: [], body: body, info: { nv: nv, n: name } };
  out.rev = 'fs' + FOOD_SCREEN_V + ':' + foodHash(JSON.stringify(body));
  return out;
}


// ── 가게 지도 펼침(웹 _foodShowMap): 가게 카드 바로 아래에 이름 · 거리 · ✕ / 출발(도착역)→도착(가게) 지도 + 도보 경로 / 안내 글 / 네이버 · 카카오 단추 ──
//   앱은 info.go 의 [이름, 업종, 주소, 위도, 경도] 를 f.sel 로, 도착역 좌표를 f.ctr, 역 이름을 f.stn 으로, 켜 달라는 뜻으로 f.pn=1 을 보낸다.
//   경로는 웹 _footRoute 와 같다: ① Valhalla 보행자(polyline6) → ② OSRM → ③ 둘 다 안 되면 출발~도착 직선. 받아 올 주소는 info.need [{k,url}] 로 알려 주고,
//   앱이 받은 글(실패하면 빈 글)을 f.res[k] 로 다시 보내면 엔진이 풀어 경로선(tmap.line)과 '약 N m' 를 정한다. 화면은 info.after(펼칠 카드의 act) 뒤에 끼운다.
var FOOD_VALHALLA = 'https://valhalla1.openstreetmap.de/route?json=';
var FOOD_OSRM = 'https://router.project-osrm.org/route/v1/foot/';
var FOOD_LINE_MAX = 300;
function foodDecode6(str) {                        // Valhalla polyline6(1e6 배율) → [[위도, 경도]…]
  var idx = 0, la = 0, lo = 0, out = [], b, shift, result;
  str = String(str || '');
  while (idx < str.length) {
    shift = 0; result = 0;
    do { b = str.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && idx < str.length + 1);
    la += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = str.charCodeAt(idx++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && idx < str.length + 1);
    lo += (result & 1) ? ~(result >> 1) : (result >> 1);
    out.push([la / 1e6, lo / 1e6]);
  }
  return out;
}
function foodThin(pts) {                           // 점이 너무 많으면 고르게 줄인다(처음 · 끝은 남긴다) · 소수 여섯째 자리
  var out = [], n = pts.length, step = n > FOOD_LINE_MAX ? (n - 1) / (FOOD_LINE_MAX - 1) : 1, i;
  for (i = 0; i < n && out.length < FOOD_LINE_MAX; i += step) { var q = pts[Math.round(i)]; out.push([Math.round(q[0] * 1e6) / 1e6, Math.round(q[1] * 1e6) / 1e6]); }
  var last = pts[n - 1];
  if (out.length && (out[out.length - 1][0] !== last[0] || out[out.length - 1][1] !== last[1])) { if (out.length >= FOOD_LINE_MAX) out.pop(); out.push([Math.round(last[0] * 1e6) / 1e6, Math.round(last[1] * 1e6) / 1e6]); }
  return out;
}
function foodRouteOf(res, s, d) {                  // → { pts, m } 경로를 얻었다 · { need } 더 받아 와야 한다 · { pts: null } 다 실패(직선)
  var r;
  if (res.rt === undefined) {
    var q = { locations: [{ lat: s[0], lon: s[1] }, { lat: d[0], lon: d[1] }], costing: 'pedestrian', units: 'kilometers', directions_options: { language: 'ko-KR' } };
    return { need: { k: 'rt', url: FOOD_VALHALLA + encodeURIComponent(JSON.stringify(q)) } };
  }
  try {
    r = JSON.parse(res.rt);
    var leg = r && r.trip && r.trip.legs && r.trip.legs[0];
    if (leg && leg.shape) {
      var cs = foodDecode6(leg.shape), len = r.trip.summary && r.trip.summary.length ? r.trip.summary.length * 1000 : 0;
      if (cs.length >= 2) return { pts: cs, m: len };
    }
  } catch (e1) { /* 다음 길 */ }
  if (res.ro === undefined) return { need: { k: 'ro', url: FOOD_OSRM + s[1] + ',' + s[0] + ';' + d[1] + ',' + d[0] + '?overview=full&geometries=geojson' } };
  try {
    r = JSON.parse(res.ro);
    var rt = r && r.routes && r.routes[0];
    if (rt && rt.geometry && Array.isArray(rt.geometry.coordinates) && rt.geometry.coordinates.length >= 2) {
      return { pts: rt.geometry.coordinates.map(function (c) { return [c[1], c[0]]; }), m: rt.distance || 0 };
    }
  } catch (e2) { /* 직선 */ }
  return { pts: null };
}
function foodPanel(f) {
  var sel = f.sel, name = foodNameOf(sel.n), la = Number(sel.la), lo = Number(sel.lo);
  if (!name || !isFinite(la) || !isFinite(lo) || !foodLL([la, lo])) return { ok: false, error: 'sel' };
  var s = f.ctr, d = [la, lo];
  var hasStn = !!s && (s[0] !== la || s[1] !== lo);
  var stn = foodStr(f.stn, 30).replace(/역$/, '');
  var distTxt = s ? foodDist(Math.round(foodHav(s[0], s[1], la, lo))) : '';
  var pts = [{ la: la, lo: lo, k: 'b', n: '도착', l: name }], need = [], line = null, meters = 0;
  if (hasStn) {
    pts.push({ la: s[0], lo: s[1], k: 'a', n: '출발', l: (stn || '출발') + '역' });
    var rr = foodRouteOf(f.res || {}, s, d);
    if (rr.need) { need.push(rr.need); line = [[s[0], s[1]], d]; }
    else if (rr.pts) { line = foodThin(rr.pts); meters = rr.m || 0; }
    else line = [[s[0], s[1]], d];
  }
  var foot = '🚶 ' + (stn ? stn + '역 → ' : '') + name + ' 도보 경로' + (meters ? ' · 약 ' + Math.round(meters) + 'm' : '');
  var map = { t: 'tmap', pad: [0, 0, 0, 0], h: 260, r: 0, pts: pts, fp: 46, fz: 18 };
  if (line) map.line = line;
  var navs = { t: 'row', pad: [8, 12, 12, 12], gap: 8, kids: [
    { t: 'button', s: '네이버 리뷰·정보', size: 13, h: 40, r: 10, bold: true, fill: '#03C75A', line: 'none', tc: '#ffffff', act: { a: 'call', v: 'fm.ni' } },
    { t: 'button', s: '카카오 리뷰·정보', size: 13, h: 40, r: 10, bold: true, fill: '#FEE500', line: 'none', tc: '#3C1E1E', act: { a: 'call', v: 'fm.ki' } } ] };
  var kids = [
    { t: 'bar', pad: [6, 12, 6, 12], title: name, sub: distTxt ? '📍 ' + distTxt : '', btn: '✕', act: { a: 'call', v: 'fm.close' } },
    map,
    { t: 'text', s: foot, size: 12, color: 'sub', lh: 1.5, pad: [8, 12, 0, 12] },
    navs
  ];
  var body = [{ t: 'panel', pad: [4, 0, 12, 0], ip: [0, 0, 0, 0], fill: 'card', line: 'border', r: 14, kids: kids }];
  var nv = foodNavUrls(sel, f.me);
  var out = { ok: true, v: 1, screen: 'foodpanel', cover: 'tab', head: [], body: body, info: { nv: nv, n: name, need: need, hasRoute: !!(line && !need.length) } };
  out.rev = 'fp' + FOOD_SCREEN_V + ':' + foodHash(JSON.stringify(body));
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { foodKakaoPick: foodKakaoPick, foodKakaoLinks: foodKakaoLinks, foodKakaoQuery: foodKakaoQuery, foodScreen: foodScreen, foodScreens: foodScreens, foodFacts: foodFacts, foodKind: foodKind, foodCatSimple: foodCatSimple, foodDist: foodDist, foodStars: foodStars, foodList: foodList, foodResolve: foodResolve, foodHav: foodHav, foodRowsServer: foodRowsServer, foodRowsPublic: foodRowsPublic, foodNavUrls: foodNavUrls, foodPanel: foodPanel, foodDecode6: foodDecode6, FOOD_CHIPS: FOOD_CHIPS };
