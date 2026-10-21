// 길동무 — 뉴스 화면 엔진(분류·거르기·중복 정리·시간 문구·상세 문구·화면 구성 JSON) 순수 계산 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수; 단일 출처)
//
// ★ 원칙(YJ): "모든 연산은 엔진이 한다. 앱은 엔진이 계산한 그림만 그린다."  (2026-10-18 서버 구동 화면 4호 — 커뮤니티 > 뉴스)
//   예전엔 뉴스 탭의 카테고리 분류 규칙·잡음(묶음 기사) 거르기·중복 정리·'전체'의 골고루 뽑기·'3일 컷'·'N분 전' 문구·상세 팝업의 요약 정리/언론사 이름이 www/index.html 안에 있었다.
//   이제 앱은 '받아 둔 기사 목록(원자료)'과 '고른 칩'만 보내고, 엔진이 무엇을 어떤 순서로 보일지·문구는 무엇인지까지 정해 화면 JSON 으로 내려 준다.
//   앱(네이티브 ScreenCore/ScreenView)은 그 JSON 을 검증해 그리기만 한다. 웹 뉴스 화면은 폴백(엔진·네이티브가 안 될 때)으로만 남는다.
//   ※ 아래 '웹에서 옮겨 온 부분'(분류 규칙·디코드·요약 정리·언론사 이름)은 www/index.html 의 _NEWS_RULES/_htmlDecode/_newsCleanDesc/_newsSourceLabel/_newsClassify 와 글자 그대로 같다
//     (test/news_engine.test.js 가 웹 함수와 같은 결과를 내는지 대조한다).
//
// 입력  newsScreen({ cap, now }, facts, rows)
//        cap   = 앱이 그릴 수 있는 화면 규격 수준(5 이상이어야 뉴스 화면을 만든다)
//        facts = { cat: 고른 칩('전체'|'증시'|…) }
//        rows  = [기사…]   기사 = [제목, 링크, 언론사, 시각(ms), 받을 때 서버가 붙인 분류, 요약]
// 출력  { ok, v:1, screen:'news', rev, cover:'tab', head:[chips], body:[news…|text|spacer], info:{cat,n,all} }
//        news{title,sub,act:{a:'call',v:'nw.<번호>',id:<링크 또는 제목>,t:<제목>,ix:<보낸 목록에서의 원래 위치>}}  — id = 기사의 고유 식별(링크, 없으면 제목)이라 목록이 바뀐 뒤에 눌러도 같은 기사가 열린다.
//          번호 = 앱이 보낸 배열의 원래 위치(옛 앱 호환용; 새 앱은 id 를 먼저 본다)
//      newsDetail({ cap, now }, row) → { ok, v:1, detail:{ cat, title, meta, desc, empty, src, notice, btn } }  상세 팝업에 그대로 쓸 문구
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var NEWS_SCREEN_V = 1;
var NW_CATS = ['전체','증시','경제','사회','정치','연예','스포츠','IT'];
var NW_QUOTE_MAX = 200;                 // 요약 노출 상한(웹 _NEWS_POLICY.quoteMaxChars)
var NW_MAX_IN = 1200;                   // 받는 기사 수 상한(웹 저장소 상한과 같다)
var NW_ALTS_MAX = 12;                  // 한 요청에 실을 수 있는 '다른 칩' 수 상한(칩 8개)
var NW_MAX_SHOW = 300;                  // 한 번에 보내는 기사 줄 수 상한
var NW_ALL_MAX = 200;                   // '전체' 칩에서 뽑는 수(웹과 같다)
var NW_FRESH_MS = 3 * 24 * 3600 * 1000; // '전체' 칩은 3일 안 기사만(웹과 같다)

// ───────── 웹에서 옮겨 온 부분(글자 그대로) ─────────
var NW_RULES = [
  // ★ 미국 증시 용어를 대폭 보강 — '뉴욕증시·월가·서학개미' 같은 기사가 경제로 새어나갔다.
  //   이 규칙이 목록 맨 앞이라 경제 규칙보다 먼저 잡힌다.
  { cat:'증시', re:/(코스피|코스닥|증시|주가|주식|상한가|하한가|급등주|급락주|시가총액|공모주|IPO\b|상장폐지|기관\s*순매수|외국인\s*순매(수|도)|배당금|ETF|나스닥|다우\s*(지수|존스)|S&P\s*5?00?|니케이|증권가|공매도|장중|종가|개장|폐장|매수세|매도세|테마주|우선주|반등장|약세장|강세장|지분\s*(인수|매각|취득)|뉴욕\s*증시|미국\s*증시|월가|서학\s*개미|동학\s*개미|필라델피아\s*반도체|VIX|러셀\s*2000|블루칩|사이드카|서킷브레이커|어닝\s*(서프라이즈|쇼크)|실적\s*발표|목표주가|증권사\s*(리포트|전망)|애널리스트|상장\s*첫날|따상|장\s*마감|프리마켓|시간외\s*거래)/ },
  { cat:'스포츠', re:/(프로야구|KBO|메이저리그|MLB|축구|K리그|프리미어리그|EPL|손흥민|이강인|김민재|농구|KBL|NBA|배구|V리그|골프|LPGA|PGA|올림픽|월드컵|아시안게임|국가대표|선발\s*투수|홈런|타율|승점|연승|연패|전적|리그\s*순위|중간순위|우승\s*후보|이적|FA\s*계약|구단|감독\s*(선임|경질)|[A-Z]{1,3}FC\b|FC\b|유나이티드|(오늘|내일|어제)의\s*경기|경기\s*결과|0-[0-9]|[0-9]-[0-9]\s*(승|패|무)|석패|완승|완봉|선두\s*경쟁|결승타|끝내기|역전승|무득점|타점|도루|삼진|안타|투구|출루|두산|기아|KIA|한화|롯데|삼성\s*라이온즈|LG\s*트윈스|키움|SSG|NC\s*다이노스|kt\s*위즈)/ },
  { cat:'연예', re:/(아이돌|가수|배우|드라마|영화|예능|방송인|콘서트|앨범|컴백|데뷔|음원|빌보드|K-?팝|아이유|BTS|방탄|블랙핑크|뉴진스|세븐틴|넷플릭스|디즈니\+|시청률|박스오피스|열애|결혼\s*발표|이혼\s*발표|소속사|팬미팅|무대\s*인사|캐스팅|OST|예능\s*출연)/ },
  { cat:'정치', re:/(대통령|국회|여당|야당|정당|의원|장관|총리|청와대|대통령실|선거|대선|총선|공천|탄핵|특검|국정감사|개각|외교부|정상회담|북한|미사일\s*발사|국방부|한미|한일|한중\s*정상|예산안|시정연설|국정\s*과제)/ },
  { cat:'경제', re:/(환율|금리|물가|인플레|기준금리|한국은행|수출|수입|무역수지|GDP|경기\s*침체|부동산|집값|전세|아파트\s*값|분양|대출|가계부채|실업률|고용\s*지표|유가|국제유가|원자재|관세|재정|세금|연금|국민연금|은행|보험|카드사|자영업|소비자물가|경상수지|내수)/ },
  { cat:'IT',   re:/(인공지능|\bAI\b|챗봇|챗GPT|ChatGPT|반도체|메모리|파운드리|스마트폰|갤럭시|아이폰|애플|삼성전자|LG전자|네이버|카카오|구글|메타|엔비디아|테슬라|전기차|배터리|자율주행|로봇|클라우드|데이터센터|해킹|보안\s*취약|개인정보\s*유출|앱\s*출시|플랫폼|스타트업|블록체인|가상자산|비트코인|코인|메타버스|통신사|5G|6G|위성|우주\s*발사|누리호)/ },
  { cat:'사회', re:/(경찰|검찰|법원|재판|판결|구속|기소|사건|사고|화재|지진|태풍|호우|폭염|한파|미세먼지|교통사고|음주운전|학교|교육|입시|수능|의료|병원|의사|간호|코로나|감염|백신|복지|출산율|고령화|지하철|버스\s*파업|철도|공항|산불|실종|구조|폭우|대설|주의보|경보)/ }
];

var NW_NOISE = /(이\s*시각\s*헤드라인|헤드라인\s*모음|주요\s*뉴스\s*브리핑|오늘의\s*주요\s*뉴스|뉴스\s*브리핑)|^\s*\[(부고|인사|동정|알림|공지|정정|사고)\]/;

function nwNoise(title){
  try{ return NW_NOISE.test(String(title || '')); }catch(e){ return false; }
}

var NW_ENT = {
  nbsp:' ', amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", ldquo:'\u201C', rdquo:'\u201D',
  lsquo:'\u2018', rsquo:'\u2019', hellip:'\u2026', middot:'\u00B7', mdash:'\u2014',
  ndash:'\u2013', laquo:'\u00AB', raquo:'\u00BB', bull:'\u2022', deg:'\u00B0',
  times:'\u00D7', copy:'\u00A9', reg:'\u00AE', trade:'\u2122', euro:'\u20AC',
  won:'\u20A9', percnt:'%', lsaquo:'\u2039', rsaquo:'\u203A', prime:'\u2032'
};

function nwDecode(str){
  var t = String(str == null ? '' : str);
  // 이중·삼중 인코딩 대비 최대 3회 반복
  for(var pass = 0; pass < 3; pass++){
    var before = t;
    t = t.replace(/&#x([0-9a-fA-F]+);/g, function(_, h){
          try{ return String.fromCodePoint(parseInt(h, 16)); }catch(e){ return _; }
        })
        .replace(/&#(\d+);/g, function(_, d){
          try{ return String.fromCodePoint(parseInt(d, 10)); }catch(e){ return _; }
        })
        .replace(/&([a-zA-Z]+);/g, function(_, name){
          var k = name.toLowerCase();
          return (NW_ENT[k] != null) ? NW_ENT[k] : _;
        });
    if(t === before) break;
  }
  return t;
}

function nwCleanDesc(raw){
  try{
    var t = String(raw || '');
    t = nwDecode(t);                                   // 엔티티 먼저 디코드
    t = t.replace(/<[^>]*>/g, ' ');                       // 그 뒤 태그 제거
    t = nwDecode(t);                                   // 태그 안에 숨어 있던 엔티티 재처리
    t = t.replace(/\s+/g,' ').trim();
    t = t.replace(/^[\(\[][^\)\]]{0,20}[\)\]]\s*/,'');    // 앞머리 (서울=연합뉴스) 등
    t = t.replace(/^[가-힣]{2,4}\s*(기자|특파원)\s*=\s*/,'');  // 기자명 서두 제거
    t = t.replace(/^[<\[]\s*(앵커|기자|리포트|출연)\s*[>\]]\s*/,'');
    t = t.replace(/^[\(\[]\s*/,'').replace(/\s*[\)\]]$/,'');
    if(t.length < 15) return '';                          // 의미 없는 조각은 버림
    if(t.length > NW_QUOTE_MAX)
      t = t.slice(0, NW_QUOTE_MAX).replace(/\s\S*$/,'') + '…';
    return t;
  }catch(e){ return ''; }
}

function nwSourceLabel(it){
  var s = (it && it.source) ? String(it.source).trim() : '';
  if(!s || s === '뉴스'){
    try{
      var h = new URL(it.link).hostname.replace(/^www\./,'');
      var map = {
        'yna.co.kr':'연합뉴스','etnews.com':'전자신문','news1.kr':'뉴스1','newsis.com':'뉴시스',
        'mk.co.kr':'매일경제','hankyung.com':'한국경제','edaily.co.kr':'이데일리','sedaily.com':'서울경제',
        'chosun.com':'조선일보','donga.com':'동아일보','joongang.co.kr':'중앙일보','hani.co.kr':'한겨레',
        'khan.co.kr':'경향신문','ytn.co.kr':'YTN','sbs.co.kr':'SBS','kbs.co.kr':'KBS','mbc.co.kr':'MBC',
        'jtbc.co.kr':'JTBC','mt.co.kr':'머니투데이','fnnews.com':'파이낸셜뉴스','asiae.co.kr':'아시아경제'
      };
      for(var k in map){ if(h === k || h.endsWith('.'+k)) return map[k]; }
      return h;
    }catch(e){ return '언론사'; }
  }
  return s;
}

function nwRuleCat(text){
  try{
    var t = String(text || '');
    for(var i=0;i<NW_RULES.length;i++){
      if(NW_RULES[i].re.test(t)) return NW_RULES[i].cat;
    }
  }catch(e){}
  return '';
}

function nwClassify(it){
  try{
    // ★ 2026-09-02: 제목으로 먼저 판단한다.
    //   요약문에는 관련기사 목록이 통째로 딸려오는 경우가 있어(구글 뉴스·종합 피드),
    //   연예 기사가 요약에 섞인 '코스피' 한 단어 때문에 증시로 넘어가곤 했다.
    var byTitle = nwRuleCat(String((it && it.title) || ''));
    if(byTitle) return byTitle;
    var byBoth = nwRuleCat(String((it && it.title) || '') + ' ' + String((it && it.desc) || ''));
    if(byBoth) return byBoth;
  }catch(e){}
  // 규칙에 안 걸리면 서버가 준 분류 유지 (단, 우리 카테고리에 있는 값만)
  var sv = (it && it.cat) ? String(it.cat).trim() : '';
  if(/^(IT|아이티|테크|과학)$/i.test(sv)) return 'IT';
  if(/^(문화|생활)$/.test(sv)) return '연예';
  if(/^(국제|세계)$/.test(sv)) return '사회';
  return (NW_CATS.indexOf(sv) > 0) ? sv : '사회';
}

// ───────── 엔진 쪽 새 부분 ─────────
function nwAgo(ts, now) {                          // 웹 _newsAgo 와 같다(현재 시각만 인자로)
  var m = Math.floor((now - ts) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return m + '분 전';
  var h = Math.floor(m / 60);
  if (h < 24) return h + '시간 전';
  return Math.floor(h / 24) + '일 전';
}
function nwStr(v, n) { return typeof v === 'string' ? v.slice(0, n) : (typeof v === 'number' ? String(v).slice(0, n) : ''); }
function nwHash(s) {                               // djb2 — 같은 화면이면 같은 rev
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function nwFacts(f) {
  f = (f && typeof f === 'object') ? f : {};
  return { cat: NW_CATS.indexOf(f.cat) >= 0 ? f.cat : '전체' };
}
// 기사 한 건 → { i, title, link, source, ts, cat, desc }  (제목이 없거나 잡음이면 null)
function nwOne(a, i, now) {
  if (!Array.isArray(a)) return null;
  var raw = typeof a[0] === 'string' ? a[0].slice(0, 300) : '';
  if (!raw || !raw.trim() || nwNoise(raw)) return null;
  var ts = Number(a[3]);
  var it = {
    i: i, key: raw.replace(/\s/g, ''),
    title: nwDecode(raw).replace(/\s+/g, ' ').trim(),
    link: nwStr(a[1], 400), source: nwDecode(nwStr(a[2], 80)).trim(),
    ts: isFinite(ts) && ts > 0 ? ts : now,
    cat: nwStr(a[4], 20), desc: nwDecode(nwStr(a[5], 400))
  };
  if (!it.title) return null;
  it.cat = nwClassify(it);
  return it;
}
function nwList(rows, now) {
  var out = [], have = {};
  if (!Array.isArray(rows)) return out;
  for (var i = 0; i < rows.length && i < NW_MAX_IN; i++) {
    var it = nwOne(rows[i], i, now);
    if (!it) continue;
    if (have[it.key] || (it.link && have['L:' + it.link])) continue;     // 제목·링크가 같은 기사는 한 번만
    have[it.key] = 1; if (it.link) have['L:' + it.link] = 1;
    out.push(it);
  }
  return out;
}
function nwPick(all, cat, now) {
  var items;
  if (cat === '전체') {
    var cut = now - NW_FRESH_MS, byCat = {};
    all.filter(function (it) { return !(it.ts && it.ts < cut); }).forEach(function (it) { (byCat[it.cat] = byCat[it.cat] || []).push(it); });
    Object.keys(byCat).forEach(function (k) { byCat[k].sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); });
    var order = NW_CATS.filter(function (c) { return c !== '전체' && byCat[c]; });
    items = [];
    for (var r = 0; items.length < NW_ALL_MAX; r++) {
      var added = false;
      for (var oi = 0; oi < order.length; oi++) { var arr = byCat[order[oi]]; if (arr && arr[r]) { items.push(arr[r]); added = true; } }
      if (!added) break;
    }
  } else {
    items = all.filter(function (it) { return it.cat === cat; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  }
  return items;
}

// 한 칩(f.cat) 분의 화면. all = nwList 로 이미 분류·정리한 기사(같은 목록의 다른 칩을 만들 때 다시 분류하지 않으려고 따로 뺐다)
function nwScreenOf(now, f, all) {
  var items = nwPick(all, f.cat, now);
  var head = [
    { t: 'chips', pad: [14, 4, 14, 6], gap: 6, h: 30, onc: 'gold', onfg: '#121214',
      items: NW_CATS.map(function (c) { return { label: c, on: c === f.cat, act: { a: 'cat', v: c } }; }) }
  ];
  var body = [];
  if (!items.length) {
    body.push({ t: 'text', s: f.cat === '전체' ? '뉴스 불러오는 중...' : f.cat + ' 뉴스를 불러오는 중...', size: 14, color: 'sub', lh: 1.8, align: 'center', pad: [20, 40, 20, 40] });
  } else {
    body.push({ t: 'spacer', h: 8 });
    for (var k = 0; k < items.length && k < NW_MAX_SHOW; k++) {
      var it = items[k];
      body.push({ t: 'news', pad: [14, 0, 14, 0], title: it.title, sub: it.cat + (it.ts ? ' · ' + nwAgo(it.ts, now) : ''), act: { a: 'call', v: 'nw.' + it.i, id: String(it.link || it.title).slice(0, 400), t: String(it.title).slice(0, 160), ix: it.i } });
    }
    body.push({ t: 'spacer', h: 72 });
  }
  var out = { ok: true, v: 1, screen: 'news', cover: 'tab', head: head, body: body, info: { cat: f.cat, n: items.length, all: all.length } };
  out.rev = 'n' + NEWS_SCREEN_V + ':' + nwHash(JSON.stringify([head, body]));
  return out;
}

function newsScreen(inp, factsIn, rowsIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 5)) return { ok: false, error: 'cap' };
  var now = Number(inp.now) > 0 ? Number(inp.now) : Date.now();
  var f = nwFacts(factsIn);
  return nwScreenOf(now, f, nwList(rowsIn, now));
}

// ★ 2026-10-19 s67 (YJ: 뉴스 칩을 누를 때마다 로딩이 길다): 칩을 누를 때마다 기사 목록 전체를 보내고 새 화면을 받던 것을,
//   같은 요청에 '다른 칩들의 사실(altsIn = { 키: { cat } } 또는 'chips' = 엔진이 가진 칩 전부)'을 실어 보내면 엔진이 한 번에 모든 칩 화면을 계산해 out.alts[키] 로 돌려준다.
//   기사 분류·정리(nwList)는 한 번만 한다. 앱은 받은 화면을 칩별로 기억해 두었다가 칩을 누르면 요청 없이 그대로 올린다(계산은 엔진, 앱은 그리기).
//   각 alts[키] 는 그 칩으로 따로 요청했을 때와 글자 하나까지 같은 화면이다(시험이 대조한다).
function newsScreens(inp, factsIn, rowsIn, altsIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 5)) return { ok: false, error: 'cap' };
  var now = Number(inp.now) > 0 ? Number(inp.now) : Date.now();
  var all = nwList(rowsIn, now);
  var out = nwScreenOf(now, nwFacts(factsIn), all);
  if (altsIn === 'chips') {                       // 앱은 어떤 칩이 있는지 모른다 — 엔진이 가진 칩 전부(지금 칩 빼고)를 만든다. 키 = 칩 이름
    altsIn = {};
    NW_CATS.forEach(function (c) { altsIn[c] = { cat: c }; });
  }
  if (altsIn && typeof altsIn === 'object' && !Array.isArray(altsIn)) {
    var ks = Object.keys(altsIn).slice(0, NW_ALTS_MAX), alts = {};
    for (var i = 0; i < ks.length; i++) {
      var a = altsIn[ks[i]];
      if (!a || typeof a !== 'object') continue;
      alts[ks[i]] = nwScreenOf(now, nwFacts(a), all);
    }
    out.alts = alts;
  }
  return out;
}

// 상세 팝업 문구(웹 _openNewsDetail 이 직접 만들던 것)
function newsDetail(inp, row) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 5)) return { ok: false, error: 'cap' };
  var now = Number(inp.now) > 0 ? Number(inp.now) : Date.now();
  var it = nwOne(row, 0, now);
  if (!it) return { ok: false, error: 'item' };
  var src = nwSourceLabel(it), clean = nwCleanDesc(it.desc);
  return { ok: true, v: 1, detail: {
    cat: it.cat, title: it.title, meta: (it.ts ? nwAgo(it.ts, now) + ' · ' : '') + src,
    desc: clean, empty: clean ? '' : '이 매체는 요약을 제공하지 않아요. 아래 버튼으로 원문에서 전체 내용을 확인하세요.',
    src: src, notice: '출처 · ' + src + '\n제목과 요약은 발췌이며 저작권은 해당 언론사에 있습니다. 전체 내용은 원문에서 확인하세요.',
    btn: src + ' 원문 보기 ›', close: '닫기', open: /^https?:\/\//i.test(it.link) ? 1 : 0 } };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { newsScreen: newsScreen, newsScreens: newsScreens, newsDetail: newsDetail, nwClassify: nwClassify, nwRuleCat: nwRuleCat, nwDecode: nwDecode, nwCleanDesc: nwCleanDesc, nwSourceLabel: nwSourceLabel, nwNoise: nwNoise, nwAgo: nwAgo, nwList: nwList, nwPick: nwPick, NW_CATS: NW_CATS };
