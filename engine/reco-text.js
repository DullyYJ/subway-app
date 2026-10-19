// 길동무 — 하차 전 추천 '문구' 엔진 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수) — 2026-10-19 (5번 5단계 넷째 조각: 판단 · 추천 문구 1단계)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
//   하차 전 추천 알림의 '본문 만들기' — ① 날씨·요일·시간으로 상황 읽기(cx) ② 상황 문구 고르기(hook) ③ 메뉴·가게 고르기(음료·브런치·밥집·근처 가게) ④ 줄 맞춰 조립(제목·본문)
//   은 예전엔 웹(www/index.html)의 _arrBuildAlert · _arrCx · _arrHook · _arrShopLine · _arrPickPlace · _arrSpotsFor … 가 했다. 이 모듈은 같은 규칙을 엔진이 하게 한다.
//   아래 표(문구 풀 · 상황 규칙 · 조사 함수)는 웹 코드를 글자 그대로 옮긴 것이라 문구가 같다. 앱(웹)은 '지금 날씨 · 근처 가게 목록 · 최근 추천한 곳 · 고른 쿠팡 상품 · 무작위 씨앗' 만 알리고,
//   돌아온 제목·본문·메뉴·가게를 그대로 보여준다. (쿠팡 상품 *고르기* · 작은 화면(PiP) 문구 · 오버레이 광고 줄은 이 조각 밖 — 웹에 남는다.)
//   시간은 한국시간 기준(예전 웹은 기기 시간대; 한국 앱이라 같다). 무작위는 씨앗(seed)으로 정해 같은 입력이면 같은 결과(시험이 가능하다).
//
// recoAlert({ arrMs, nowMs, dest, weather:{temp,feel,tmin,tmax,rain,txt}|null, food:[{n,c,d}]|null, recent:[이름…], shop:{n,_t,_cat}|null, seed })
//   → { v:1, slot, kind, title, body, remMin, dinner, menu, brunch, spots, placeIdx(-1=없음), hook, hookStrong, cx, shop(true|false) }   (슬롯이 'none' 이면 { v:1, slot:'none' })
'use strict';

var RTX_V = 1;
var RTX_KST = 9 * 3600000;
var RTX_RND = Math.random;      // 호출 때마다 씨앗으로 바뀐다
var RTX_TODAY = { y: 2026, mo: 0, d: 1 };   // 호출 때마다 '오늘'(한국시간)로 바뀐다

function rtxKst(ms) {
  var d = new Date(Number(ms) + RTX_KST);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}
function rtxMulberry(seed) {
  var a = (Number(seed) >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 계절 단어 · 날씨와 무관한 살림 용품 이름 — 쇼핑 엔진(shop.js)이 가진 표를 같이 쓴다
function rtxSeasonKw() { if (typeof SHOP_SEASON_KW !== 'undefined') return SHOP_SEASON_KW; try { return require('./shop').SHOP_SEASON_KW; } catch (e) { return {}; } }
function rtxNoWx(nm) { var re = (typeof SHOP_NOWX !== 'undefined') ? SHOP_NOWX : (function () { try { return require('./shop').SHOP_NOWX; } catch (e) { return null; } })(); return !!(re && re.test(String(nm || ''))); }
// 시간대 · 17~19시(저녁) · 남은 분 — 하차 전 추천 시점 엔진(arrive-reco.js)과 같은 규칙
function rtxArrFn(name) { var f = (name === 'slot') ? (typeof arrSlot === 'function' ? arrSlot : null) : (name === 'dinner') ? (typeof arrIsDinner === 'function' ? arrIsDinner : null) : (typeof arrRemainMin === 'function' ? arrRemainMin : null); if (f) return f; var m = require('./arrive-reco'); return name === 'slot' ? m.arrSlot : name === 'dinner' ? m.arrIsDinner : m.arrRemainMin; }

// ══════ 아래 표·조사 함수는 예전 웹(www/index.html)의 _arr… 코드를 글자 그대로 옮긴 것(이름만 rtx…) ══════
var RTX_CAFE_M  = 500;         // 카페 반경(m)
var RTX_NIGHT_M = 1000;        // 야식 식당 반경(m)

var RTX_DRINKS = ['아이스 아메리카노','따뜻한 라떼','바닐라 라떼','콜드브루','카푸치노',
  '아인슈페너','플랫화이트','헤이즐넛 아메리카노','자몽 에이드','유자차','녹차 라떼',
  '흑당 밀크티','딸기 라떼','토피넛 라떼','아이스티','캐모마일 티'];
var RTX_NIGHT_MENU = ['치킨','파스타','피자','떡볶이','국밥','마라탕','초밥','돈가스',
  '족발','라멘','부대찌개','곱창','쌀국수','회','삼겹살','햄버거','만두','덮밥'];


var RTX_CHEER_MORN = [
  '오늘 하루도 화이팅이에요',
  '당신의 하루를 응원할게요',
  '오늘도 무리하지 말고 천천히 가요',
  '좋은 일 하나쯤 있는 하루가 되길',
  '오늘의 당신도 충분히 잘하고 있어요'
];
var RTX_CLOSE_EVE = [
  '오늘 하루도 정말 수고했어요',
  '이제 푹 쉬어도 괜찮아요',
  '오늘의 당신, 충분히 잘 버텼어요',
  '집에 도착하면 편하게 쉬세요',
  '내일의 걱정은 내일의 몫으로 남겨둬요'
];


// 받침 유무에 따라 조사 보정 ('회으로' → '회로')
function rtxJosa(word, withBatchim, withoutBatchim){
  var ch = String(word||'').trim().slice(-1);
  var code = ch.charCodeAt(0);
  if(!(code >= 0xAC00 && code <= 0xD7A3)) return withBatchim;   // 한글 아니면 기본형
  var jong = (code - 0xAC00) % 28;
  return jong ? withBatchim : withoutBatchim;
}
// '로/으로'는 받침이 없거나 ㄹ 받침이면 '로' (삼겹살로 · 회로 · 치킨으로)
function rtxJosaRo(word){
  var ch = String(word||'').trim().slice(-1);
  var code = ch.charCodeAt(0);
  if(!(code >= 0xAC00 && code <= 0xD7A3)) return '으로';
  var jong = (code - 0xAC00) % 28;
  return (jong === 0 || jong === 8) ? '로' : '으로';
}
function rtxApplyJosa(txt, menu){
  // ★ 2026-09-21: 음식마다 받침이 달라 조사를 골라 붙인다 (국밥이 / 치킨이 / 피자가, 회로 / 국밥으로 / 피자로 …)
  //   예전엔 '\b' 를 썼는데 한글 사이에선 경계로 인식되지 않아 '이/을/은' 이 치환되지 않았다.
  return String(txt||'').replace(/\{menu\}(으로|로|이랑|랑|이(?![랑에라다])|가|을|를|은|는|과|와)?/g, function(_, p){
    if(!p) return menu;
    if(p === '으로' || p === '로') return menu + rtxJosaRo(menu);
    if(p === '이랑' || p === '랑')  return menu + rtxJosa(menu, '이랑', '랑');
    if(p === '이' || p === '가')    return menu + rtxJosa(menu, '이', '가');
    if(p === '을' || p === '를')    return menu + rtxJosa(menu, '을', '를');
    if(p === '은' || p === '는')    return menu + rtxJosa(menu, '은', '는');
    return menu + rtxJosa(menu, '과', '와');
  });
}
// 이미 완성된 문장(AI 가 쓴 문구 등)에서 특정 단어 뒤 조사가 받침과 안 맞으면 고친다
function rtxFixJosa(text, word){
  try{
    text = String(text || ''); word = String(word || '').trim();
    if(!text || !word) return text;
    var esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(esc + '(으로|로|이랑|랑|이|가|을|를|은|는|과|와)(?![가-힣])', 'g'), function(_, p){
      if(p === '으로' || p === '로') return word + rtxJosaRo(word);
      if(p === '이랑' || p === '랑')  return word + rtxJosa(word, '이랑', '랑');
      if(p === '이' || p === '가')    return word + rtxJosa(word, '이', '가');
      if(p === '을' || p === '를')    return word + rtxJosa(word, '을', '를');
      if(p === '은' || p === '는')    return word + rtxJosa(word, '은', '는');
      return word + rtxJosa(word, '과', '와');
    });
  }catch(e){ return text; }
}

var RTX_CAFE_RE  = /카페|커피|빵|도넛|디저트|베이커리|케이크|아이스크림|티|차/;
var RTX_NIGHT_RE = /치킨|파스타|피자|족발|보쌈|분식|중식|일식|한식|백반|회|초밥|고기|구이|국밥|찜|탕|버거|양식|마라|떡볶이|곱창|포차|호프|술|국수|덮밥|돈가스|카레|볶음|찌개|만두|샌드위치|샐러드|토스트/;
// ★ 2026-09-15: 하차 추천이 내장 CSV(STN_FOOD)를 보고 있었다.
//   그 내장본을 없앴으니 이제 맛집 탭과 같은 곳 — 전국 맛집 서버 — 에서 고른다.
//   알림은 제때 떠야 하므로 미리 받아 두고, 못 받으면 조용히 건너뛴다.

var RTX_MENU_KW = {
  '치킨':['치킨','닭'], '국밥':['국밥','설렁탕','곰탕','순대'], '회':['횟집','회','수산'], '초밥':['초밥','스시','회전'],
  '돈가스':['돈가스','돈까스','카츠'], '삼겹살':['삼겹','고기','구이','육류'], '곱창':['곱창','막창','대창'],
  '쌀국수':['쌀국수','베트남'], '마라탕':['마라','훠궈'], '라멘':['라멘','라면','일본식라면'], '족발':['족발','보쌈'],
  '떡볶이':['떡볶이','분식'], '파스타':['파스타','이탈리','양식'], '피자':['피자'], '부대찌개':['부대찌개','부대','찌개'],
  '햄버거':['햄버거','버거'], '만두':['만두'], '덮밥':['덮밥','돈부리']
};
var RTX_LUNCH_MENU = ['국밥','돈가스','덮밥','파스타','쌀국수','부대찌개','초밥','라멘','만두','햄버거','떡볶이'];

var RTX_BRUNCH = ['크로플','에그 샌드위치','베이글','프렌치토스트','아보카도 토스트',
  '수프와 바게트','팬케이크','오믈렛','샐러드볼','불고기 샌드위치','크루아상','스콘','요거트볼'];


var RTX_DINNER_MENU = ['국밥','삼겹살','돈가스','덮밥','파스타','쌀국수','부대찌개','초밥','라멘','만두','햄버거'];

function rtxFill(t, cx, menu){
  t = String(t || '').replace(/\{(temp|feel|range|rain|tmin|tmax)\}/g, function(_, k){ var v = cx ? cx[k] : null; return v == null ? '' : String(v); });
  return menu != null ? rtxApplyJosa(t, menu) : t;
}

var RTX_HOOKS = {
  morning: [
    [function(c){ return c.snowy; },            ['눈 오는 아침이에요, 따뜻하게', '눈길엔 따뜻한 한 잔이 힘이 돼요']],
    [function(c){ return c.rainy; },            ['비 오는 아침엔 따뜻한 한 잔', '빗소리엔 따뜻한 게 어울려요', '비 와서 나서기 싫은 아침이죠']],
    [function(c){ return c.freezing; },         ['체감 {feel}도, 손부터 녹여요', '영하 날씨엔 따뜻한 한 잔이죠']],
    [function(c){ return c.cold; },             ['아침 {temp}도, 따뜻한 게 당겨요', '쌀쌀한 아침엔 따뜻한 한 잔']],
    [function(c){ return c.swing; },            ['오늘 일교차가 {range}도예요', '아침저녁 {range}도 차이, 따뜻하게']],
    [function(c){ return c.hot; },              ['벌써 {temp}도예요, 시원한 한 잔', '더운 아침엔 시원한 게 제일이죠']],
    [function(c){ return c.mon; },              ['월요일 아침, 한 잔만 챙겨요', '월요병엔 한 잔이 약이죠']],
    [function(c){ return c.fri; },              ['금요일이에요, 한 잔으로 가볍게', '오늘만 지나면 주말이에요']],
    [function(c){ return c.weekend; },          ['주말 아침, 느긋하게 한 잔', '쉬는 날엔 천천히 한 잔이죠']]
  ],
  lunch: [
    [function(c){ return c.snowy; },            ['눈 오는 날 점심은 {menu}', '눈길엔 가까운 곳에서 {menu}']],
    [function(c){ return c.rainy; },            ['비 와서 멀리 가기 싫죠, {menu}', '빗길엔 가까운 곳에서 {menu}']],
    [function(c){ return c.cold; },             ['{temp}도라 점심은 {menu}로 데워요', '추운 날 점심은 {menu}가 든든해요']],
    [function(c){ return c.hot; },              ['{temp}도 더위에 점심은 {menu}', '더운 날엔 점심을 제때 먹어요']],
    [function(c){ return c.payday && !c.weekend; }, ['월급날이잖아요, 점심은 {menu}', '월급날 점심은 {menu} 어때요']],
    [function(c){ return c.fri; },              ['금요일 점심은 {menu} 어때요', '한 주 마무리 점심은 {menu}']],
    [function(c){ return c.mon; },              ['월요일 점심은 {menu}로 힘내요', '월요일엔 든든히 {menu}']],
    [function(c){ return c.weekend; },          ['주말 점심, 느긋하게 {menu}', '쉬는 날 점심은 {menu} 어때요']]
  ],
  dinner: [
    [function(c){ return c.snowy; },            ['눈 오는 퇴근길, 따끈한 {menu}', '눈길 퇴근엔 {menu}가 위로돼요']],
    [function(c){ return c.rainy; },            ['비 오는 퇴근길, 따끈한 {menu}', '빗길 퇴근엔 {menu}가 위로돼요']],
    [function(c){ return c.cold; },             ['{temp}도 퇴근길, {menu}로 데워요', '추운 날 저녁은 {menu}가 제격']],
    [function(c){ return c.hot; },              ['{temp}도에 지쳤죠, 저녁은 {menu}', '더운 하루 끝, {menu}로 힘내요']],
    [function(c){ return c.payday && !c.weekend; }, ['월급날이잖아요, 저녁은 {menu}', '월급날 저녁은 {menu} 어때요']],
    [function(c){ return c.fri; },              ['금요일 저녁은 {menu}로 마무리', '한 주 고생했어요, {menu} 어때요']],
    [function(c){ return c.mon; },              ['월요일 버텼어요, 저녁은 {menu}', '월요일 퇴근길엔 {menu} 한 끼']],
    [function(c){ return c.weekend; },          ['주말 저녁이에요, {menu} 어때요', '쉬는 날 저녁은 {menu}로']]
  ],
  night: [
    [function(c){ return c.snowy; },            ['눈 오는 밤엔 {menu}가 제격이죠', '눈 오는 밤, {menu} 시켜 둘까요']],
    [function(c){ return c.rainy; },            ['비 오는 밤엔 {menu}가 제격이죠', '비 오는 밤, {menu} 시켜 둘까요']],
    [function(c){ return c.cold; },             ['{temp}도 추운 밤, 따끈한 {menu}', '추운 밤엔 {menu} 생각나죠']],
    [function(c){ return c.hot; },              ['{temp}도 더운 밤, {menu} 어때요', '더운 밤엔 {menu}가 당기죠']],
    [function(c){ return c.fri || c.sat; },     ['내일은 쉬는 날, 오늘은 {menu}', '주말 앞둔 밤엔 {menu} 한 번쯤']],
    [function(c){ return c.sun; },              ['내일 월요일, 든든히 {menu}', '일요일 밤엔 {menu}로 마음 달래요']],
    [function(c){ return c.payday; },           ['월급날 밤, {menu} 한 번쯤 어때요', '월급날이잖아요, {menu} 어때요']]
  ],
  shop: [
    [function(c){ return c.rainy; },            ['비 오는 밤, 구경하다 가요', '빗소리 들으며 천천히 둘러봐요']],
    [function(c){ return c.cold; },             ['추운 밤, 이불 속에서 구경해요', '{temp}도 추운 밤, 따뜻하게 둘러봐요']],
    [function(c){ return c.fri; },              ['한 주 고생했어요, 이제 쉬어요', '쉬는 날 전날 밤, 천천히 구경해요']],
    [function(c){ return c.sat; },              ['내일도 쉬는 날, 천천히 구경해요', '느긋한 토요일 밤이에요']],
    [function(c){ return c.sun; },              ['내일 월요일, 오늘은 일찍 쉬어요', '일요일 밤, 내일 준비 하나쯤']],
    [function(c){ return c.payday; },           ['월급 들어온 날, 하나쯤은요', '월급날 밤, 나한테 하나쯤']]
  ]
};
var RTX_HOOK_DEFAULT = {
  morning: ['여유 있으면 한 잔 어때요', '출근 전 한 잔이면 든든해요', '아침엔 한 잔이 시작이죠'],
  lunch:   ['점심은 {menu} 어때요', '오늘 점심은 {menu}로 정해요', '{menu}로 든든하게 채워요'],
  dinner:  ['퇴근길 {menu} 한 끼 어때요', '오늘 저녁은 {menu}로 정해 볼까요', '저녁은 {menu}로 든든하게'],
  night:   ['출출한 시간이죠, {menu} 어때요', '오늘 야식은 {menu}로 골라봤어요', '자기 전 {menu} 한 번쯤 어때요'],
  shop:    ['하루 끝에 천천히 둘러봐요', '내일의 나를 편하게 해 줄 것들', '퇴근길 구경 삼아 보세요']
};

var RTX_DRINKS_ICE  = ['아이스 아메리카노','콜드브루','자몽 에이드','아이스티','딸기 라떼'];
var RTX_DRINKS_WARM = ['따뜻한 라떼','바닐라 라떼','카푸치노','아인슈페너','플랫화이트','헤이즐넛 아메리카노','유자차','녹차 라떼','흑당 밀크티','토피넛 라떼','캐모마일 티'];

var RTX_SHOP_SAY = {
  '우천대비':   [[function(c){ return c.rainSoon; }, ['비 소식 {rain}%예요, 미리 챙겨요', '비 올 확률 {rain}%, 가방에 하나']], [null, ['비는 갑자기 오니까 하나쯤', '가방에 하나 있으면 마음 놓여요']]],
  '커피음료':   [[function(c){ return c.cold; }, ['추운 아침엔 따뜻한 한 잔이죠']], [function(c){ return c.tmrRest; }, ['쉬는 날 아침 여유 한 잔']], [null, ['내일 아침 한 잔이 수월해져요', '아침에 마실 거 미리 쟁여 둬요']]],
  '아침대용식': [[function(c){ return c.tmrWork; }, ['내일 아침 바쁠 때 한 입 거리', '아침 거르기 쉬운 날 대비해요', '내일 아침 시간을 아껴 줘요']], [null, ['느긋한 아침, 간단히 한 입']]],
  '브런치':     [[function(c){ return c.tmrRest; }, ['쉬는 날 늦은 아침엔 브런치죠', '내일은 여유롭게 브런치예요']], [null, ['내일 아침은 브런치처럼']]],
  '셀프케어':   [[function(c){ return c.cold && c.swing; }, ['일교차 큰 날, 피부도 지쳐요']], [function(c){ return c.cold; }, ['추운 날엔 샤워 뒤 관리가 필수']], [null, ['고생한 하루, 나를 한 번 챙겨요', '오늘 밤 피로 풀기 좋아요']]],
  '생필품':     [[function(c){ return c.payday; }, ['월급날 겸 채워 둘 때예요']], [null, ['떨어지기 전에 채워 두면 편해요', '있는 줄 알았는데 없는 것들']]],
  '다이어트':   [[function(c){ return c.sun || c.mon; }, ['월요일부터 가볍게 시작해요']], [null, ['가볍게 먹고 싶은 밤을 위해', '내일부터 말고 오늘 한 끼부터']]],
  '저녁식재료': [[function(c){ return c.weekend || c.fri; }, ['주말 요리 재료 미리 챙겨요']], [null, ['내일 저녁은 직접 해 먹어요', '퇴근길 장보기를 줄여 줘요']]],
  '정육':       [[function(c){ return c.fri || c.sat; }, ['주말엔 고기가 빠질 수 없죠']], [null, ['고기 당기는 날 있잖아요']]],
  '신선식품마감': [[null, ['장볼 시간 없던 날 간편하게', '늦은 밤에도 신선하게 챙겨요']]],
  '캠핑나들이': [[function(c){ return c.rainSoon; }, ['비 그치면 나들이 가요']], [function(c){ return c.month >= 9 && c.month <= 11; }, ['가을 캠핑하기 좋은 철이에요']], [function(c){ return c.fri || c.sat; }, ['이번 주말 나들이 어때요']], [null, ['날 좋은 날을 위해 미리']]],
  '사무용품':   [[function(c){ return c.tmrWork; }, ['내일 책상이 조금 편해져요']], [null, ['책상에 하나 두면 손이 가요']]],
  '자기계발':   [[null, ['퇴근 후 20분, 나를 키워요', '오늘 밤 20분이면 충분해요']]],
  '야식':       [[null, ['출출한 밤에 하나쯤 두면 든든', '배달 말고 집에 쟁여 둘 야식']]],
  '취미스포츠': [[function(c){ return c.temp != null && c.temp >= 10 && c.temp <= 24 && !c.rainy; }, ['{temp}도, 운동하기 딱 좋은 날씨']], [null, ['퇴근 후 몸 쓰는 취미 어때요']]],
  '홈파티':     [[function(c){ return c.fri || c.sat; }, ['주말 모임 전에 미리 챙겨요']], [null, ['작은 모임이 생길 때 요긴해요']]],
  '대량구매':   [[null, ['자주 쓰는 건 묶음이 편해요', '쓰는 만큼 묶음으로 두면 덜 번거로워요']]],
  '출근룩소품': [[function(c){ return c.swing; }, ['일교차 큰 날 걸치기 좋아요']], [function(c){ return c.tmrWork; }, ['내일 출근룩에 포인트 하나']], [null, ['출근길 분위기를 바꿔 봐요']]]
};

function rtxShopLine(it, cx){
  var nm = String((it && it.n) || ''), t = String((it && it._t) || ''), K = rtxSeasonKw();
  var pickRule = function(rules){
    for(var i = 0; i < rules.length; i++){
      var ok = true; if(rules[i][0]){ try{ ok = !!rules[i][0](cx); }catch(e){ ok = false; } }
      if(ok) return rtxFill(rtxVar(rules[i][1], cx, nm.length), cx, null);
    }
    return '';
  };
  // 이름으로 날씨성 상품을 먼저 본다(테마 태그가 없는 상품이 3분의 2)
  var isRain = (t === '우천대비') || /우산|장화|레인|우비|방수|제습|빗물/.test(nm);
  var _nw = rtxNoWx(nm);
  var isCold = !_nw && ((K.winter && K.winter.test(nm)) || (K.fall && K.fall.test(nm)) || /조끼|바람막이|가디건|후드|맨투맨|니트(?!릴)/.test(nm));
  var isHot  = !_nw && ((K.summer && K.summer.test(nm)) || /쿨|냉감|선풍기|서큘레이터|선크림|반팔|반바지|샌들/.test(nm));
  var r = '';
  if(isRain){
    r = cx.rainSoon ? rtxFill(rtxVar(['비 소식 {rain}%예요, 미리 챙겨요', '비 올 확률 {rain}%, 가방에 하나'], cx, nm.length), cx, null)
                    : rtxVar(['비는 갑자기 오니까 하나쯤', '가방에 하나 있으면 마음 놓여요'], cx, nm.length);
  } else if(isCold && !isHot){
    if(cx.temp != null){
      if(cx.temp <= 5) r = cx.tmin != null ? '내일 아침도 ' + cx.tmin + '도 안팎이에요' : cx.temp + '도라 꽤 추워요, 챙겨 둬요';
      else if(cx.temp <= 17) r = cx.swing ? '일교차 ' + cx.range + '도, 걸칠 게 필요해요' : cx.temp + '도, 슬슬 챙겨 입을 때예요';
      else r = '곧 쌀쌀해질 거예요, 미리 준비해요';
    } else r = '아침저녁으로 쌀쌀해졌어요';
  } else if(isHot){
    if(cx.temp != null && cx.temp >= 28) r = cx.temp + '도 무더위, 시원하게 보내요';
    else if(cx.temp != null && cx.temp >= 22) r = cx.temp + '도, 슬슬 필요해질 거예요';
    else r = '더워지기 전에 미리 챙겨요';
  } else if(RTX_SHOP_SAY[t]){
    r = pickRule(RTX_SHOP_SAY[t]);
  }
  if(!r){
    if(cx.payday) r = '월급날 밤, 나한테 하나쯤';
    else if(cx.fri || cx.sat) r = '쉬는 날 전날 밤에 구경해요';
    else if(cx.weekend) r = '쉬는 날 여유 있을 때 써 봐요';
    else r = '오늘 밤 구경 삼아 둘러봐요';
  }
  return r;
}


// ══════ 여기부터는 엔진 쪽에서 새로 쓴 부분 — 예전 웹 코드와 같은 순서·같은 규칙(무작위만 씨앗으로) ══════

// 날씨·요일·시간 상황(문구 엔진이 읽는 값) — 예전 _arrCx
function rtxCx(arrMs, wx) {
  var k = rtxKst(arrMs);
  var n = function (v) { return (v != null && isFinite(v)) ? Math.round(v) : null; };
  var temp = wx ? n(wx.temp) : null, feel = (wx && n(wx.feel) != null) ? n(wx.feel) : temp;
  var tmin = wx ? n(wx.tmin) : null, tmax = wx ? n(wx.tmax) : null;
  var rain = (wx && wx.rain != null && isFinite(wx.rain)) ? Math.round(wx.rain) : -1;
  var txt = (wx && wx.txt) ? String(wx.txt) : '';
  var dow = k.dow, dom = k.d, tmr = (dow + 1) % 7;
  var range = (tmin != null && tmax != null) ? (tmax - tmin) : null;
  return {
    h: k.h, dow: dow, dom: dom, mon: dow === 1, fri: dow === 5, sat: dow === 6, sun: dow === 0,
    weekend: dow === 0 || dow === 6,
    tmrRest: tmr === 0 || tmr === 6,              // 내일이 토·일
    tmrWork: tmr >= 1 && tmr <= 5,
    payday: dom >= 24 && dom <= 26,
    temp: temp, feel: feel, tmin: tmin, tmax: tmax, range: range, rain: rain, txt: txt,
    snowy: /눈/.test(txt),
    rainy: rain >= 50 || /비|소나기|눈/.test(txt),
    rainSoon: rain >= 30,
    freezing: feel != null && feel <= 0,
    cold: feel != null && feel <= 8,
    cool: feel != null && feel <= 16,
    warm: temp != null && temp >= 22,
    hot: temp != null && temp >= 27,
    swing: range != null && range >= 10,
    month: k.mo + 1
  };
}
// 같은 날·같은 시각엔 같은 문구, 날짜가 바뀌면 다른 문구 — 예전 _arrVar (오늘 = 한국시간)
function rtxVar(list, cx, salt) {
  if (!list || !list.length) return '';
  var seed = RTX_TODAY.y * 400 + (RTX_TODAY.mo + 1) * 31 + RTX_TODAY.d + (cx && cx.h || 0) * 3 + (salt || 0);
  return list[Math.abs(seed) % list.length];
}
// slot: 'morning' | 'lunch' | 'dinner' | 'night' | 'shop' → { t: 문구, strong: 상황 규칙에 맞았는지 } — 예전 _arrHook
function rtxHook(slot, cx, menu) {
  var rules = RTX_HOOKS[slot] || [], i, list = null;
  for (i = 0; i < rules.length; i++) {
    var ok = false; try { ok = !!rules[i][0](cx); } catch (e) {}
    if (ok) { list = rules[i][1]; break; }
  }
  var strong = !!list;
  if (!list) list = RTX_HOOK_DEFAULT[slot] || [''];
  return { t: rtxFill(rtxVar(list, cx, slot.length), cx, menu), strong: strong };
}
// 날씨에 맞는 아침 음료 — 예전 _arrPickDrink
function rtxPickDrink(cx) {
  try {
    if (cx && (cx.hot || (cx.warm && !cx.rainy))) return RTX_DRINKS_ICE[Math.floor(RTX_RND() * RTX_DRINKS_ICE.length)];
    if (cx && (cx.cool || cx.rainy || cx.snowy)) return RTX_DRINKS_WARM[Math.floor(RTX_RND() * RTX_DRINKS_WARM.length)];
  } catch (e) {}
  return RTX_DRINKS[Math.floor(RTX_RND() * RTX_DRINKS.length)];
}
// 목록(food)에서 메뉴를 파는 가게 이름 — 예전 _arrSpotsFor
function rtxSpotsFor(food, menu, kind, n) {
  try {
    var arr = food;
    if (!arr || !arr.length) return [];
    var radius = (kind === 'cafe') ? RTX_CAFE_M : RTX_NIGHT_M;
    var kws = (kind === 'cafe') ? ['카페', '커피', '베이커리', '브런치', '디저트', '제과'] : (RTX_MENU_KW[menu] || [menu]);
    var list = arr.filter(function (it) {
      if (!it || !it.n) return false;
      if (it.d != null && it.d > radius) return false;
      var c = String(it.c || ''), nm = String(it.n || '');
      return kws.some(function (k) { return c.indexOf(k) >= 0 || (k.length >= 2 && nm.indexOf(k) >= 0); });
    });
    if (!list.length) return [];
    list.sort(function (a, b) { return (a.d == null ? 1e9 : a.d) - (b.d == null ? 1e9 : b.d); });
    var pool = list.slice(0, Math.max(n || 2, 6));
    var out = [];
    while (pool.length && out.length < (n || 2)) {
      var k = Math.floor(RTX_RND() * pool.length);
      var nmk = pool.splice(k, 1)[0].n;
      if (out.indexOf(nmk) < 0) out.push(nmk);
    }
    return out;
  } catch (e) { return []; }
}
// 하차지 주변에서 실제로 파는 메뉴만 추린다 — 예전 _arrMenusWithSpots
function rtxMenusWithSpots(food, pool) {
  try { return (pool || RTX_NIGHT_MENU).filter(function (m) { return rtxSpotsFor(food, m, 'night', 1).length > 0; }); }
  catch (e) { return []; }
}
// 가게 하나 고르기(최근 추천한 곳은 피한다) → { idx, it } 또는 null — 예전 _arrPickPlace
function rtxPickPlace(food, recent, kind) {
  try {
    var arr = food;
    if (!arr || !arr.length) return null;
    var radius = (kind === 'cafe') ? RTX_CAFE_M : RTX_NIGHT_M;
    var re = (kind === 'cafe') ? RTX_CAFE_RE : RTX_NIGHT_RE;
    var list = [];
    arr.forEach(function (it, idx) {
      if (!it || !it.n) return;
      if (it.d != null && it.d > radius) return;
      if (re.test(String(it.c || ''))) list.push({ idx: idx, it: it });
    });
    if (!list.length) return null;
    var fresh = list.filter(function (x) { return recent.indexOf(x.it.n) < 0; });
    var pool = fresh.length ? fresh : list;
    return pool[Math.floor(RTX_RND() * pool.length)] || null;
  } catch (e) { return null; }
}

// 알림 본문 만들기 — 예전 _arrBuildAlert 와 같은 줄·같은 순서(가게 목록·날씨·최근 기록·쇼핑 상품은 입력으로 받는다)
function rtxBuild(inp) {
  var arrMs = Number(inp.arrMs), nowMs = Number(inp.nowMs);
  var slot = rtxArrFn('slot')(arrMs);
  if (slot === 'none') return { v: RTX_V, slot: 'none' };
  var destStn = inp.dest || '';
  var food = inp.food, recent = inp.recent || [];
  var remMin = rtxArrFn('remain')(arrMs, nowMs);
  var isDinner = (slot === 'night') && rtxArrFn('dinner')(arrMs);
  var ak = rtxKst(arrMs);
  var hhmm = ('0' + ak.h).slice(-2) + ':' + ('0' + ak.mi).slice(-2);
  var cx = rtxCx(arrMs, inp.weather || null);
  RTX_RND = rtxMulberry(inp.seed);
  var nk = rtxKst(nowMs); RTX_TODAY = { y: nk.y, mo: nk.mo, d: nk.d };

  var lines = [];
  lines.push('하차 ' + remMin + '분 전이에요.');
  lines.push((destStn ? destStn + ' ' : '') + '도착 예정 ' + hhmm);
  lines.push('');

  // ── 19:31~24:00 · 쿠팡 아이템 추천 ──
  if (slot === 'shop') {
    var it = (inp.shop && inp.shop.n) ? inp.shop : null;
    var shHook = rtxHook('shop', cx);
    lines.push(shHook.t);
    if (it) {
      lines.push('🛍 ' + it.n);
      var shWhy = rtxShopLine(it, cx);
      if (it._cat) lines.push('   ' + it._cat + ' · ' + shWhy);
      else lines.push('   ' + shWhy);
    } else {
      lines.push('🛍 오늘 밤 둘러볼 만한 것들을 골라뒀어요');
    }
    lines.push('');
    lines.push(RTX_CLOSE_EVE[Math.floor(RTX_RND() * RTX_CLOSE_EVE.length)]);
    return {
      v: RTX_V, title: '🚉 하차 ' + remMin + '분 전' + (destStn ? ' · ' + destStn : '') + ' 🛍',
      body: lines.join('\n'), kind: 'shop', slot: slot, remMin: remMin,
      shop: !!it, hook: shHook.t, hookStrong: shHook.strong, cx: cx
    };
  }

  var isLunch = (slot === 'lunch');
  var isMorn = (slot === 'morning');
  var pl = rtxPickPlace(food, recent, (isLunch || isDinner) ? 'food' : (isMorn ? 'cafe' : 'night'));
  var place = pl ? pl.it : null;
  var menu;
  if (isMorn) {
    menu = rtxPickDrink(cx);
  } else {
    var _menuPool = isLunch ? RTX_LUNCH_MENU : (isDinner ? RTX_DINNER_MENU : RTX_NIGHT_MENU);
    var _avail = rtxMenusWithSpots(food, _menuPool);
    if (_avail.length) {
      menu = _avail[Math.floor(RTX_RND() * _avail.length)];
    } else {
      var cat = place ? String(place.c || '') : '';
      var matched = _menuPool.filter(function (m) { return cat.indexOf(m) >= 0; });
      menu = matched.length ? matched[0] : _menuPool[Math.floor(RTX_RND() * _menuPool.length)];
    }
  }
  var spots = rtxSpotsFor(food, menu, isMorn ? 'cafe' : 'night', isMorn ? 2 : 3);
  var brunch = isMorn ? RTX_BRUNCH[Math.floor(RTX_RND() * RTX_BRUNCH.length)] : '';

  var hk = rtxHook(isMorn ? 'morning' : (isLunch ? 'lunch' : (isDinner ? 'dinner' : 'night')), cx, menu);
  lines.push(hk.t);

  if (isLunch) {
    lines.push('🍚 이 근처 한 끼');
    if (place) {
      var d3 = (place.d != null) ? (place.d + 'm') : '가까운 곳';
      lines.push('   ' + place.n + ' · ' + d3 + (place.c ? ' · ' + place.c : ''));
    } else {
      lines.push('   내리는 길에 한 끼 챙기세요');
    }
  } else if (isMorn) {
    lines.push('☕ 오늘의 아침 · ' + menu + ' + ' + brunch);
    if (place) {
      var dist = (place.d != null) ? (place.d + 'm') : (RTX_CAFE_M + 'm 이내');
      lines.push('   ' + place.n + ' · ' + dist + (place.c ? ' · ' + place.c : ''));
    } else {
      lines.push('   내리자마자 근처 카페에 들러보세요');
    }
  } else if (isDinner) {
    lines.push('🍽 오늘의 저녁 · ' + menu);
    lines.push('   내리는 길에 들러 든든히 드세요');
    if (spots.length) {
      lines.push('   근처에서 드실 거면 · ' + spots.join(', '));
    } else if (place) {
      var d4 = (place.d != null) ? (place.d + 'm') : (RTX_NIGHT_M + 'm 이내');
      lines.push('   근처에서 드실 거면 · ' + place.n + ' ' + d4);
    }
  } else {
    lines.push('🍗 오늘의 야식 · ' + menu);
    lines.push('   도착할 때쯤 받도록 미리 시켜 둘 수 있어요');
    if (spots.length) {
      lines.push('   근처에서 드실 거면 · ' + spots.join(', '));
    } else if (place) {
      var d2 = (place.d != null) ? (place.d + 'm') : (RTX_NIGHT_M + 'm 이내');
      lines.push('   근처에서 드실 거면 · ' + place.n + ' ' + d2);
    }
  }
  lines.push('');
  lines.push((isMorn || isLunch)
    ? RTX_CHEER_MORN[Math.floor(RTX_RND() * RTX_CHEER_MORN.length)]
    : RTX_CLOSE_EVE[Math.floor(RTX_RND() * RTX_CLOSE_EVE.length)]);

  return {
    v: RTX_V,
    title: '🚉 하차 ' + remMin + '분 전' + (destStn ? ' · ' + destStn : '')
      + (isLunch ? ' 🍚' : (isMorn ? ' ☕' : (isDinner ? ' 🍽' : ' 🍗'))),
    body: lines.join('\n'),
    kind: isLunch ? 'lunch' : (isMorn ? 'cafe' : (isDinner ? 'dinner' : 'night')),
    slot: slot, remMin: remMin, dinner: isDinner,
    menu: menu, brunch: brunch,
    spots: spots,
    placeIdx: pl ? pl.idx : -1,
    hook: hk.t, hookStrong: hk.strong, cx: cx
  };
}

// 입력 다듬기(길이·형 제한) — 이상한 값이 와도 죽지 않게
function rtxStr(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }
function rtxNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
function rtxClean(b) {
  b = (b && typeof b === 'object') ? b : {};
  var wx = (b.weather && typeof b.weather === 'object') ? { temp: rtxNum(b.weather.temp), feel: rtxNum(b.weather.feel), tmin: rtxNum(b.weather.tmin), tmax: rtxNum(b.weather.tmax), rain: rtxNum(b.weather.rain), txt: rtxStr(b.weather.txt, 40) } : null;
  var food = null;
  if (Array.isArray(b.food)) food = b.food.slice(0, 300).map(function (x) { x = (x && typeof x === 'object') ? x : {}; return { n: rtxStr(x.n, 60), c: rtxStr(x.c, 100), d: rtxNum(x.d) }; });
  var recent = Array.isArray(b.recent) ? b.recent.slice(0, 40).map(function (x) { return rtxStr(x, 60); }) : [];
  var sh = (b.shop && typeof b.shop === 'object' && typeof b.shop.n === 'string' && b.shop.n) ? { n: rtxStr(b.shop.n, 120), _t: rtxStr(b.shop._t, 30), _cat: rtxStr(b.shop._cat, 40) } : null;
  return { arrMs: Number(b.arrMs), nowMs: Number(b.nowMs), dest: rtxStr(b.dest, 60), weather: wx, food: food, recent: recent, shop: sh, seed: Number(b.seed) };
}
function recoAlert(b) {
  var inp = rtxClean(b);
  if (!isFinite(inp.arrMs) || !isFinite(inp.nowMs)) return { v: RTX_V, slot: 'none', bad: true };
  return rtxBuild(inp);
}

// ── Worker 연결부 — POST /reco-text {…} (handleFetch 에 길을 둔다) ──
function handleRecoText(request) {
  var H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'cache-control': 'no-store' };
  if (request.method === 'OPTIONS') return Promise.resolve(new Response(null, { status: 204, headers: H }));
  if (request.method !== 'POST') return Promise.resolve(new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405, headers: H }));
  return request.text().then(function (raw) {
    if (raw.length > 60000) return new Response(JSON.stringify({ ok: false, error: 'body-too-long' }), { status: 413, headers: H });
    var body;
    try { body = JSON.parse(raw); } catch (e0) { return new Response(JSON.stringify({ ok: false, error: 'bad-json' }), { status: 400, headers: H }); }
    var out;
    try { out = recoAlert(body); } catch (e) { return new Response(JSON.stringify({ ok: false, error: String(e && e.message || e) }), { status: 500, headers: H }); }
    out.ok = true;
    return new Response(JSON.stringify(out), { headers: H });
  }, function () { return new Response(JSON.stringify({ ok: false, error: 'read-fail' }), { status: 400, headers: H }); });
}

if (typeof module !== 'undefined' && module.exports) module.exports = { recoAlert: recoAlert, rtxCx: rtxCx, rtxHook: rtxHook, rtxShopLine: rtxShopLine, rtxFixJosa: rtxFixJosa, rtxMulberry: rtxMulberry, handleRecoText: handleRecoText, RTX_V: RTX_V };
