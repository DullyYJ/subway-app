// 길동무 — 쇼핑 화면 엔진(추천 100선 계산 + 화면 구성 JSON) 순수 계산 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수; 단일 출처)
//
// ★ 원칙(YJ): "모든 연산은 엔진이 한다. 앱은 엔진이 계산한 그림만 그린다."  (2026-10-18 서버 구동 화면 1호 — 쇼핑 탭)
//   예전엔 www/index.html 의 _shopPick(~300줄: 시드·계절·날씨·시간대·요일 점수, 카테고리 편중 방지)이 앱 안에 있었다.
//   이제 그 계산이 여기로 옮겨졌고, 엔진은 '무엇을 어떤 순서로 보일지'까지 화면 JSON 으로 내려 준다.
//   앱(네이티브 ScreenCore/ScreenView)은 그 JSON 을 검증해 그리기만 한다. 웹의 _shopPick 은 폴백(엔진·네이티브가 안 될 때)으로만 남는다.
//
// 입력  shopScreen({ nowMs, tzOffsetMin(기본 540=KST), cat('추천'|카테고리 이름), }, data, cfg, wx)
//        data = 쇼핑 서버(gildongmu-shop) /shop 의 data  { WEEKDAY:[{h1,h2,time,label,items:[{n,t,u,i}]}], WEEKEND:[…], CATS:[{c,items:[{n,u,i}]}] }
//        cfg  = 운영 설정(/app-config?k=shop) { kw:{winter,spring,summer,fall}, w:{cur,next,opp,rain,temp} } | null
//        wx   = { temp, rain } | null  (Worker 가 subway-api /weather 에서 받는다. 못 받으면 null — 날씨를 지어내지 않는다)
// 출력  { ok, v:1, screen:'shop', rev, cat, seed, head:[노드…], body:[노드…] }  ← 노드 종류는 native/ScreenCore.java 와 같다
//        chips{items:[{label,badge,on,act}]} · grid{cols,gap,items:[card{img,fb,name,tag,act}]} · text · button · spacer
//        act = {a:'cat',v} | {a:'open',url} | {a:'refresh'}
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var SHOP_PICK_N = 100;
var SHOP_REC_CAT = '추천';     // '추천'
var SHOP_CAT_EMOJI = { '식사': '🍱', '음료': '☕', '패션': '👔', '뷰티': '💄', '건강': '💊', '생활': '🧴', '완구': '🧸' };

// 지역 시각(KST 등) 필드 — Date 의 UTC getter 를 쓰는 대신 nowMs + 오프셋으로 계산
function shopClock(nowMs, tzOffsetMin) {
  var d = new Date(nowMs + (tzOffsetMin == null ? 540 : tzOffsetMin) * 60000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), dow: d.getUTCDay() };
}
// 날짜+시간(시각) 기반 시드 — 같은 날 같은 시간대엔 동일 결과
function shopSeedOf(ck) { return ck.y * 1000000 + ck.mo * 10000 + ck.d * 100 + ck.h; }
// 시드 PRNG(mulberry32)
function shopRng(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// 상품 URL → 상황 테마 매핑 (WEEKDAY·WEEKEND 의 t)
function shopThemeMap(data) {
  var m = {};
  ['WEEKDAY', 'WEEKEND'].forEach(function (dk) {
    ((data && data[dk]) || []).forEach(function (sl) {
      ((sl && sl.items) || []).forEach(function (it) { if (it && it.u && it.t && !m[it.u]) m[it.u] = it.t; });
    });
  });
  return m;
}
function shopCurSlotIdx(slots, h) {
  for (var i = 0; i < slots.length; i++) {
    var s = slots[i];
    if (s.h2 > s.h1 ? (h >= s.h1 && h < s.h2) : (h >= s.h1 || h < s.h2)) return i;
  }
  return (h >= 1 && h < 9) ? slots.length - 1 : 0;
}
// 지금 상황(요일·시간대·날씨) 컨텍스트
function shopCtx(data, ck, wx) {
  var weekend = ck.dow === 0 || ck.dow === 6;
  var slots = (weekend ? data.WEEKEND : data.WEEKDAY) || [];
  var idx = shopCurSlotIdx(slots, ck.h);
  var now = {}, adj = {};
  var cur = slots[idx] || null;
  ((cur && cur.items) || []).forEach(function (it) { if (it && it.t) now[it.t] = 1; });
  [idx - 1, idx + 1].forEach(function (k) {
    var s2 = slots[((k % slots.length) + slots.length) % slots.length];
    ((s2 && s2.items) || []).forEach(function (it) { if (it && it.t && !now[it.t]) adj[it.t] = 1; });
  });
  return {
    weekend: weekend, slotIdx: idx, slot: cur, now: now, adj: adj,
    rain: (wx && wx.rain != null) ? wx.rain : -1,
    temp: (wx && wx.temp != null) ? wx.temp : null
  };
}

// 이름에 '장갑'·'니트'가 들어가도 날씨와 무관한 살림 용품(고무장갑·위생장갑·니트릴…)은 계절·기온 점수에서 뺀다
var SHOP_NOWX = /고무장갑|위생장갑|비닐장갑|니트릴|라텍스|설거지|주방장갑|청소장갑|일회용장갑|코팅장갑|수세미|세제|물티슈/;
var SHOP_SEASON_KW = {
  winter: /패딩|다운|기모|플리스|양털|무스탕|코트|목도리|머플러|(?<!고무|위생|니트릴|비닐|설거지|청소|라텍스|일회용|코팅|주방|세차|작업)장갑|귀도리|내복|히트텍|전기요|온수매트|핫팩|가습기|난방|방한|털슬리퍼|수면바지|극세사|롱패딩|니트(?!릴)|스웨터|부츠/,
  spring: /바람막이|윈드브레이커|가디건|트렌치|자켓|재킷|맨투맨|후드|얇은|봄|블라우스|스니커즈|황사|미세먼지|마스크|알레르기|자외선차단/,
  summer: /반팔|반바지|냉감|쿨링|냉각|린넨|메쉬|썬크림|선크림|자외선|선글라스|모자|캡모자|샌들|슬리퍼|아쿠아|수영|래시가드|선풍기|서큘레이터|제습|모기|아이스|쿨매트|부채/,
  fall:   /후드|후디|맨투맨|가디건|자켓|재킷|니트(?!릴)|스웨터|점퍼|야상|기모|트렌치|경량패딩|조끼|베스트|긴팔|스카프|부츠|워커/
};
function shopSeasonNow(ck) {
  var m = ck.mo, day = ck.d, cur, next;
  if (m === 12 || m === 1 || m === 2) { cur = 'winter'; next = 'spring'; }
  else if (m >= 3 && m <= 5) { cur = 'spring'; next = 'summer'; }
  else if (m >= 6 && m <= 8) { cur = 'summer'; next = 'fall'; }
  else { cur = 'fall'; next = 'winter'; }
  var late = ((m === 2 || m === 5 || m === 8 || m === 11) && day >= 15) || (m === 9) || (m === 12 && day >= 15);
  return { cur: cur, next: next, lean: late ? 0.7 : 0.35 };
}
function shopSeasonScore(name, ctx, cfg) {
  var nm = String(name || '');
  if (!nm) return 0;
  if (SHOP_NOWX.test(nm)) return 0;
  var se = ctx._season;
  if (cfg && cfg.kw) {                    // 운영 설정(서버)이 있으면 그 규칙, 이상하면 내장 규칙
    try {
      if (!ctx._srvKw) {
        ctx._srvKw = {};
        ['winter', 'spring', 'summer', 'fall'].forEach(function (k) {
          var pat = cfg.kw[k];
          if (typeof pat === 'string' && pat) ctx._srvKw[k] = new RegExp(pat);
        });
      }
      if (!Object.keys(ctx._srvKw).length) throw new Error('empty');
      var W = cfg.w || {};
      var kw = ctx._srvKw, sc2 = 0;
      var wCur = (W.cur != null) ? W.cur : 90, wNext = (W.next != null) ? W.next : se.lean;
      if (kw[se.cur] && kw[se.cur].test(nm)) sc2 += wCur;
      if (kw[se.next] && kw[se.next].test(nm)) sc2 += Math.round(wCur * wNext);
      var opp2 = { winter: 'summer', summer: 'winter', spring: 'winter', fall: 'summer' }[se.cur];
      if (kw[opp2] && kw[opp2].test(nm) && !(kw[se.cur] && kw[se.cur].test(nm))) sc2 += (W.opp != null) ? W.opp : -70;
      if (ctx.rain >= 50 && /우산|레인|방수|장화|우비|제습/.test(nm)) sc2 += (W.rain != null) ? W.rain : 120;
      if (ctx.temp != null) {
        var wt = (W.temp != null) ? W.temp : 110;
        if (ctx.temp <= 5 && kw.winter && kw.winter.test(nm)) sc2 += wt;
        if (ctx.temp >= 28 && kw.summer && kw.summer.test(nm)) sc2 += wt;
        if (ctx.temp <= 5 && kw.summer && kw.summer.test(nm)) sc2 -= wt * 0.8;
        if (ctx.temp >= 28 && kw.winter && kw.winter.test(nm)) sc2 -= wt * 0.8;
      }
      return sc2;
    } catch (e) { }
  }
  var sc = 0;
  if (SHOP_SEASON_KW[se.cur] && SHOP_SEASON_KW[se.cur].test(nm)) sc += 90;
  if (SHOP_SEASON_KW[se.next] && SHOP_SEASON_KW[se.next].test(nm)) sc += Math.round(90 * se.lean);
  var opp = { winter: 'summer', summer: 'winter', spring: 'winter', fall: 'summer' }[se.cur];
  if (SHOP_SEASON_KW[opp] && SHOP_SEASON_KW[opp].test(nm) && !(SHOP_SEASON_KW[se.cur] && SHOP_SEASON_KW[se.cur].test(nm))) sc -= 70;
  if (ctx.rain >= 50 && /우산|레인|방수|장화|우비|제습/.test(nm)) sc += 120;
  if (ctx.temp != null) {
    if (ctx.temp <= 5 && SHOP_SEASON_KW.winter.test(nm)) sc += 110;
    if (ctx.temp >= 28 && SHOP_SEASON_KW.summer.test(nm)) sc += 110;
    if (ctx.temp <= 5 && SHOP_SEASON_KW.summer.test(nm)) sc -= 90;
    if (ctx.temp >= 28 && SHOP_SEASON_KW.winter.test(nm)) sc -= 90;
  }
  return sc;
}
// 상품 1개 점수 — 시간대(현재/인접 슬롯) + 요일 + 날씨(강수·기온)
function shopScore(theme, ctx, rng, name, cfg) {
  var sc = rng() * 12;
  sc += shopSeasonScore(name, ctx, cfg);
  if (!theme) return sc - 12;
  if (ctx.now[theme]) sc += 100;
  else if (ctx.adj[theme]) sc += 45;
  if (theme === '우천대비') {
    if (ctx.rain >= 60) sc += 150;
    else if (ctx.rain >= 30) sc += 80;
    else if (ctx.rain >= 0) sc -= 55;
  }
  if (theme === '캠핑나들이' || theme === '취미스포츠') {
    if (ctx.rain >= 60) sc -= 60;
    else if (ctx.rain >= 30) sc -= 25;
  }
  if (ctx.temp != null) {
    if (ctx.temp <= 5) {
      if (theme === '커피음료' || theme === '야식' || theme === '셀프케어') sc += 25;
    }
    if (ctx.temp >= 28) {
      if (theme === '다이어트' || theme === '브런치') sc += 20;
      if (theme === '야식') sc -= 10;
    }
  }
  if (ctx.weekend) {
    if (theme === '캠핑나들이' || theme === '홈파티' || theme === '취미스포츠' || theme === '브런치') sc += 18;
  } else {
    if (theme === '사무용품' || theme === '출근룩소품' || theme === '커피음료') sc += 12;
  }
  return sc;
}
// 같은 이름 상품이 연달아 나오지 않도록 라운드로빈 정렬
function shopSpread(arr) {
  var g = {}, keys = [];
  arr.forEach(function (x) {
    var k = String(x.n || '').replace(/\s/g, '');
    if (!g[k]) { g[k] = []; keys.push(k); }
    g[k].push(x);
  });
  var out = [], more = true;
  for (var r = 0; more; r++) {
    more = false;
    for (var i = 0; i < keys.length; i++) { var a = g[keys[i]]; if (a[r]) { out.push(a[r]); more = true; } }
  }
  return out;
}
// 추천 100선(시간·요일·날씨 기반) + 카테고리별 전체 목록 — 앱 _shopPick 과 같은 결과여야 한다(시험이 대조)
function shopPick(data, ck, wx, cfg) {
  var rainB = (wx && wx.rain != null) ? Math.round(wx.rain / 20) : -1;
  var tempB = (wx && wx.temp != null) ? Math.round(wx.temp / 5) : -99;
  var seasonB = ck.mo * 3 + Math.min(2, Math.floor((ck.d - 1) / 10));
  var seed = shopSeedOf(ck) * 1000 + (rainB + 1) * 20 + (tempB + 20) + seasonB * 7;
  var rng = shopRng(seed);
  var cats = (data && data.CATS) || [];
  var order = cats.map(function (c) { return c.c; });
  var themes = shopThemeMap(data);
  var ctx = shopCtx(data, ck, wx);
  ctx._season = shopSeasonNow(ck);

  var byCat = {}, scored = [];
  cats.forEach(function (c) {
    var list = (c.items || []).map(function (x) { return { n: x.n, u: x.u, i: x.i, _cat: c.c, _t: themes[x.u] || '' }; });
    var spread = shopSpread(list);
    spread.forEach(function (it) { it._s = shopScore(it._t, ctx, rng, it.n, cfg); });
    spread.sort(function (a, b) { return b._s - a._s; });
    byCat[c.c] = spread;
    spread.forEach(function (it) { scored.push({ it: it, s: it._s }); });
  });
  scored.sort(function (a, b) { return b.s - a.s; });
  var cap = Math.max(12, Math.ceil(SHOP_PICK_N * 0.34));
  var cnt = {}, nmCnt = {}, used = {}, rec = [];
  [1, 2].forEach(function (nmMax) {
    for (var i = 0; i < scored.length && rec.length < SHOP_PICK_N; i++) {
      var it = scored[i].it, cn = it._cat;
      if (used[it.u]) continue;
      if ((cnt[cn] || 0) >= cap) continue;
      var nk = String(it.n || '').replace(/\s/g, '');
      if ((nmCnt[nk] || 0) >= nmMax) continue;
      cnt[cn] = (cnt[cn] || 0) + 1; nmCnt[nk] = (nmCnt[nk] || 0) + 1;
      used[it.u] = 1; rec.push(it);
    }
  });
  for (var j = 0; j < scored.length && rec.length < SHOP_PICK_N; j++) {
    var t2 = scored[j].it;
    if (used[t2.u]) continue;
    used[t2.u] = 1; rec.push(t2);
  }
  return { seed: seed, rec: rec, byCat: byCat, order: order, ctx: ctx };
}

// ── 화면 구성 JSON ──
function shopOk(u) { return typeof u === 'string' && /^https?:\/\//i.test(u); }
function shopScreen(inp, data, cfg, wx) {
  inp = inp || {};
  if (!data || !data.CATS || !data.CATS.length || !data.WEEKDAY || !data.WEEKDAY.length) return { ok: false, error: 'no-data' };
  var nowMs = isFinite(inp.nowMs) ? Number(inp.nowMs) : Date.now();
  var ck = shopClock(nowMs, inp.tzOffsetMin);
  var pick = shopPick(data, ck, wx, cfg);
  var cat = String(inp.cat || SHOP_REC_CAT);
  if (cat !== SHOP_REC_CAT && !pick.byCat[cat]) cat = SHOP_REC_CAT;
  var items = cat === SHOP_REC_CAT ? pick.rec : (pick.byCat[cat] || []);
  var tabs = [{ c: SHOP_REC_CAT, n: pick.rec.length }].concat(pick.order.map(function (cn) { return { c: cn, n: (pick.byCat[cn] || []).length }; }));
  var chips = tabs.map(function (o) {
    return { label: o.c, badge: String(o.n), on: o.c === cat, act: { a: 'cat', v: o.c } };
  });
  var cards = [];
  items.forEach(function (it) {
    if (!shopOk(it.u)) return;                       // 링크가 없거나 이상한 상품은 싣지 않는다
    var c = { t: 'card', name: String(it.n || '').slice(0, 80), tag: '최저가 ›', fb: SHOP_CAT_EMOJI[it._cat] || '🛍️', act: { a: 'open', url: it.u } };
    if (shopOk(it.i)) c.img = it.i;
    cards.push(c);
  });
  return {
    ok: true, v: 1, screen: 'shop', cat: cat, seed: pick.seed,
    rev: pick.seed + ':' + cat + ':' + cards.length,
    head: [{ t: 'chips', pad: [14, 4, 14, 4], gap: 6, h: 30, items: chips }],
    body: [
      { t: 'grid', cols: 2, gap: 8, pad: [14, 4, 14, 0], items: cards },
      { t: 'text', pad: [16, 10, 16, 0], size: 10, color: 'sub', lh: 1.5, alpha: 0.8,
        s: '이 페이지의 상품 링크는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.' },
      { t: 'spacer', h: 10 },
      { t: 'button', pad: [14, 0, 14, 0], s: '지금 바로 새로고침', size: 11, h: 40, act: { a: 'refresh' } },
      { t: 'spacer', h: 14 }
    ]
  };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { shopScreen: shopScreen, shopPick: shopPick, shopClock: shopClock, shopSeasonScore: shopSeasonScore, shopSeasonNow: shopSeasonNow, shopRng: shopRng, SHOP_PICK_N: SHOP_PICK_N, SHOP_REC_CAT: SHOP_REC_CAT };
