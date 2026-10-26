// 하차 전 추천 문구 엔진(engine/reco-text.js) 시험 — 2026-10-19 (5번 5단계 넷째 조각: 추천 문구 1단계)
//   · 같은 입력(씨앗 포함)이면 같은 결과 · 시간대별 모양(아침 카페·점심·저녁·야식·쇼핑·심야 없음)
//   · 고르는 규칙: 반경 · 최근 추천한 곳 피하기 · 파는 메뉴만 · 조사 · 상황 문구(비·추위·금요일·월급날…)
//   · Worker 내장본이 모듈과 같은 판단 · /reco-text 길 · 이상한 입력에도 죽지 않음
//   (예전 웹 코드와 글자 하나까지 같은지는 reco_rtx.ui.test.js 가 진짜 index.html 로 대조한다)
'use strict';
process.env.TZ = 'Asia/Seoul';
const assert = require('assert');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const R = require(path.join(root, 'engine/reco-text.js'));
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n     ' + (e && e.message)); } }

const kst = (h, mi, day) => Date.UTC(2026, 9, day || 19, h - 9, mi || 0);   // 2026-10-19(월) h:mi KST
const FOOD = [
  { n: '국밥집A', c: '음식점 > 한식 > 국밥', d: 120 }, { n: '치킨B', c: '음식점 > 치킨', d: 300 }, { n: '카페C', c: '카페 > 커피전문점', d: 80 },
  { n: '피자D', c: '음식점 > 양식 > 피자', d: 700 }, { n: '먼카페E', c: '카페 > 커피', d: 800 }, { n: '돈가스F', c: '음식점 > 일식 > 돈가스', d: 450 },
  { n: '멀리국밥G', c: '음식점 > 한식 > 국밥', d: 1500 }
];
const WX = { temp: 5, feel: 2, tmin: 1, tmax: 12, rain: 20, txt: '맑음' };
function ask(h, o) { return R.recoAlert(Object.assign({ arrMs: kst(h, 5), nowMs: kst(h, 0), dest: '강남', weather: WX, food: FOOD, recent: [], shop: { n: '우산', _t: '우천대비', _cat: '생활' }, seed: 7 }, o || {})); }

t('같은 입력이면 같은 결과, 씨앗이 다르면 (메뉴·가게가) 달라질 수 있다', () => {
  assert.deepStrictEqual(ask(20), ask(20));
  const set = new Set(); for (let s = 1; s < 40; s++) set.add(ask(20, { seed: s }).menu + '|' + ask(20, { seed: s }).spots.join(','));
  assert.ok(set.size > 1, '씨앗을 바꿔도 같다');
});
t('시간대별 모양: 아침 카페 · 점심 · 저녁 · 야식 · 쇼핑', () => {
  const m = ask(8); assert.strictEqual(m.slot, 'morning'); assert.strictEqual(m.kind, 'cafe'); assert.ok(/^☕ 오늘의 아침 · /m.test(m.body)); assert.ok(m.brunch); assert.ok(m.title.endsWith(' ☕'));
  const l = ask(12); assert.strictEqual(l.kind, 'lunch'); assert.ok(/🍚 이 근처 한 끼/.test(l.body)); assert.ok(l.title.endsWith(' 🍚'));
  const d = ask(18); assert.strictEqual(d.kind, 'dinner'); assert.strictEqual(d.dinner, true); assert.ok(/🍽 오늘의 저녁 · /.test(d.body));
  const n = ask(20); assert.strictEqual(n.kind, 'night'); assert.strictEqual(n.dinner, false); assert.ok(/🍗 오늘의 야식 · /.test(n.body));
  const s = ask(22); assert.strictEqual(s.kind, 'shop'); assert.ok(/🛍 우산/.test(s.body)); assert.strictEqual(s.shop, true); assert.ok(/생활 · /.test(s.body));
  const z = ask(3); assert.deepStrictEqual(z, { v: 1, slot: 'none' });
});
t('본문 첫 줄·둘째 줄: 하차 N분 전 · 목적지 도착 예정 HH:MM (한국시간)', () => {
  const a = ask(12); const L = a.body.split('\n'); assert.strictEqual(L[0], '하차 5분 전이에요.'); assert.strictEqual(L[1], '강남 도착 예정 12:05'); assert.strictEqual(L[2], '');
  const b = R.recoAlert({ arrMs: kst(12, 5), nowMs: kst(11, 0), dest: '', weather: null, food: null, recent: [], seed: 1 });
  assert.strictEqual(b.remMin, 7); assert.strictEqual(b.body.split('\n')[1], '도착 예정 12:05'); assert.ok(b.title.startsWith('🚉 하차 7분 전'));
});
t('가게 목록이 없으면 안내 줄로 · 메뉴는 풀에서 · 쇼핑 상품이 없으면 안내 줄', () => {
  const a = R.recoAlert({ arrMs: kst(12, 5), nowMs: kst(12, 0), dest: '강남', weather: null, food: null, recent: [], seed: 3 });
  assert.strictEqual(a.placeIdx, -1); assert.ok(/내리는 길에 한 끼 챙기세요/.test(a.body)); assert.ok(a.menu);
  const m = R.recoAlert({ arrMs: kst(8, 5), nowMs: kst(8, 0), dest: '강남', weather: null, food: [], recent: [], seed: 3 }); assert.ok(/내리자마자 근처 카페에 들러보세요/.test(m.body));
  const s = R.recoAlert({ arrMs: kst(22, 5), nowMs: kst(22, 0), dest: '강남', weather: null, food: null, recent: [], shop: null, seed: 3 }); assert.ok(/오늘 밤 둘러볼 만한 것들을 골라뒀어요/.test(s.body)); assert.strictEqual(s.shop, false);
});
t('가게 반경: 카페 500m · 식당 1000m 밖은 고르지 않는다', () => {
  for (let s = 1; s < 60; s++) {
    const c = ask(8, { seed: s }); if (c.placeIdx >= 0) assert.ok(FOOD[c.placeIdx].d <= 500, '카페 반경 ' + FOOD[c.placeIdx].n);
    const n = ask(20, { seed: s }); if (n.placeIdx >= 0) assert.ok(FOOD[n.placeIdx].d <= 1000);
    n.spots.forEach(x => { const f = FOOD.find(y => y.n === x); assert.ok(f && f.d <= 1000 && f.n !== '멀리국밥G'); });
  }
});
t('파는 메뉴만 권한다: 목록에 국밥·치킨·피자(양식)·돈가스만 있으면 야식 메뉴가 그 안에서 나온다', () => {
  const ok = new Set(['국밥', '치킨', '피자', '돈가스', '파스타']);   // 파스타는 '양식' 분류의 피자집이 받는다
  for (let s = 1; s < 80; s++) { const n = ask(20, { seed: s }); assert.ok(ok.has(n.menu), n.menu); assert.ok(n.spots.length >= 1); }
});
t('최근 추천한 곳은 피한다(다른 곳이 있을 때) · 전부 최근이면 그래도 고른다', () => {
  for (let s = 1; s < 40; s++) {
    const a = ask(8, { seed: s, recent: ['카페C'], food: FOOD.concat([{ n: '카페H', c: '카페 > 커피', d: 200 }]) }); assert.strictEqual(a.placeIdx >= 0 && a.placeIdx < FOOD.length ? 'C' : 'H', 'H', '최근 가게가 또 나옴');
  }
  const b = ask(8, { seed: 5, recent: ['카페C', '먼카페E'] }); assert.ok(b.placeIdx >= 0);   // 500m 안에 카페C 하나뿐이면 최근이어도 고른다
});
t('상황 문구: 비 오는 날 · 추운 날 · 금요일 · 월급날 · 더운 날', () => {
  const rain = ask(12, { weather: { temp: 18, feel: 18, tmin: 12, tmax: 20, rain: 80, txt: '비' } }); assert.ok(rain.cx.rainy); assert.strictEqual(rain.hookStrong, true); assert.ok(/비/.test(rain.hook), rain.hook);
  const hot = ask(12, { weather: { temp: 31, feel: 33, tmin: 24, tmax: 33, rain: 0, txt: '맑음' } }); assert.ok(hot.cx.hot); assert.ok(/31도/.test(hot.hook), hot.hook);
  const fri = ask(18, { arrMs: kst(18, 5, 23), nowMs: kst(18, 0, 23), weather: { temp: 15, feel: 15, tmin: 10, tmax: 18, rain: 0, txt: '맑음' } }); assert.ok(fri.cx.fri); assert.ok(/금요일|한 주/.test(fri.hook), fri.hook);
  const pay = ask(12, { arrMs: kst(12, 5, 26), nowMs: kst(12, 0, 26), weather: { temp: 15, feel: 15, tmin: 10, tmax: 18, rain: 0, txt: '맑음' } }); assert.ok(pay.cx.payday); assert.ok(/월급/.test(pay.hook), pay.hook);
  const none = ask(12, { weather: null }); assert.strictEqual(none.cx.temp, null); assert.strictEqual(none.cx.rain, -1);
});
t('조사: {menu} 뒤 이/가 · 을/를 · 으로/로 가 받침에 맞게', () => {
  assert.strictEqual(R.rtxFixJosa('국밥이 좋고 피자가 좋고', '국밥'), '국밥이 좋고 피자가 좋고');
  assert.strictEqual(R.rtxFixJosa('피자이 좋아요', '피자'), '피자가 좋아요');
  assert.strictEqual(R.rtxFixJosa('회으로 갈까', '회'), '회로 갈까');
  assert.strictEqual(R.rtxFixJosa('국밥가 좋아요', '국밥'), '국밥이 좋아요');
});
t('날짜가 바뀌면 같은 상황이라도 문구가 바뀐다(날짜 시드)', () => {
  const set = new Set(); for (let d = 1; d <= 20; d++) set.add(ask(8, { arrMs: kst(8, 5, d), nowMs: kst(8, 0, d), weather: { temp: 5, feel: 3, tmin: 2, tmax: 9, rain: 0, txt: '맑음' } }).hook.replace(/\d+/g, '#'));
  assert.ok(set.size >= 1);
});
t('이상한 입력에도 죽지 않는다', () => {
  for (const bad of [undefined, null, {}, { arrMs: 'x' }, { arrMs: kst(12, 5), nowMs: 'x' }, { arrMs: kst(12, 5), nowMs: kst(12, 0), food: 'x', recent: 5, weather: 'x', shop: 5, seed: 'q' },
    { arrMs: kst(12, 5), nowMs: kst(12, 0), food: [null, 1, { n: 5 }, { n: '가', c: 5, d: 'x' }] }]) {
    const r = R.recoAlert(bad); assert.strictEqual(r.v, 1);
  }
  const big = R.recoAlert({ arrMs: kst(12, 5), nowMs: kst(12, 0), food: new Array(1000).fill({ n: '가'.repeat(500), c: '국밥', d: 10 }), recent: new Array(500).fill('x'), seed: 1 }); assert.strictEqual(big.v, 1);
});
t('엔진은 웹 상태·저장소·전역 무작위를 건드리지 않는다', () => {
  const src = fs.readFileSync(path.join(root, 'engine/reco-text.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/localStorage|window\.|document\./.test(src)); assert.ok(!/Math\.random\(\)/.test(src.replace('var RTX_RND = Math.random;', '')), 'Math.random() 직접 호출');
});

t('작은 화면 문구(pip)와 오버레이 추천 줄(ad)이 함께 온다: 첫 줄은 상황 문구 · 가게 이름 · 거리 없음', () => {
  for (const h of [8, 12, 18, 20]) {
    const a = ask(h); assert.ok(a.pip && a.pip.title === '하차 5분 전 · 강남', JSON.stringify(a.pip)); assert.strictEqual(a.pip.lines[0], a.hook);
    assert.ok(a.pip.lines.length >= 3 && a.pip.lines.length <= 5);
    assert.ok(a.ad && (a.ad.k === 'cafe' || a.ad.k === 'food') && a.ad.m.length > 0 && a.ad.m.length <= 16 && a.ad.go.length > 0 && a.ad.go.length <= 7 && a.ad.pn, JSON.stringify(a.ad));
    assert.ok(a.ad.piIdx >= 0 && FOOD[a.ad.piIdx].n === a.ad.pn, '가게 목록 항목과 이름이 맞아야 한다');
    assert.ok(a.ad.a.indexOf(a.ad.pn) === 0 && a.ad.b.length > 3);
  }
  const s = ask(22); assert.strictEqual(s.ad.k, 'shop'); assert.strictEqual(s.ad.a, '우산'); assert.ok(s.ad.m.length > 0 && s.ad.m.length <= 16 && s.ad.go.length > 0 && s.ad.go.length <= 7, JSON.stringify(s.ad)); assert.ok(!('pn' in s.ad));
  assert.strictEqual(s.pip.lines[1], '우산');
  const none = R.recoAlert({ arrMs: kst(12, 5), nowMs: kst(12, 0), dest: '강남', weather: null, food: null, recent: [], seed: 3 }); assert.strictEqual(none.ad, null);
});
t('s237 오버레이 추천 줄: 버튼 글(go ≤7자) · 셋째 줄(m ≤16자)은 아이템 종류와 날씨·시간에 맞고, 호출(씨앗)마다 달라진다', () => {
  for (const tb of [R.RTX_GO, R.RTX_TEASE]) for (const k of Object.keys(tb)) for (const g of Object.keys(tb[k])) tb[k][g].forEach(x => assert.ok(x.length > 0 && x.length <= (tb === R.RTX_GO ? 7 : 16) && !/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(x), k + '.' + g + ': ' + x));
  const wxs = { rainy: { temp: 12, feel: 10, rain: 90, txt: '비' }, cold: { temp: 2, feel: -3, rain: 0, txt: '맑음' }, hot: { temp: 30, feel: 32, rain: 0, txt: '맑음' } };
  const kinds = [[8, 'morning'], [12, 'lunch'], [18, 'dinner'], [20, 'night'], [22, 'shop']];
  for (const [h, kd] of kinds) for (const w of Object.keys(wxs)) {
    const T = R.RTX_GO[kd], pool = (w === 'rainy' ? T.rainy : (w === 'cold' ? T.cold : T.hot)).concat(T.base.slice(0, 2)).concat(kd === 'shop' ? T.weekend || [] : []);
    for (let sd = 1; sd < 25; sd++) { const a = ask(h, { weather: wxs[w], seed: sd }).ad; assert.ok(a && pool.indexOf(a.go) >= 0, kd + ' ' + w + ' ' + (a && a.go)); }
  }
  for (const [h, kd] of kinds) { const set = new Set(); for (let sd = 1; sd < 60; sd++) { const a = ask(h, { seed: sd }).ad; set.add(a.go + '|' + a.m); } assert.ok(set.size >= 3, kd + ' 여러 모양: ' + set.size); }
  assert.deepStrictEqual(ask(12, { seed: 5 }).ad, ask(12, { seed: 5 }).ad, '같은 씨앗은 같은 글');
  const nw = ask(12, { weather: null, seed: 3 }).ad; assert.ok(R.RTX_GO.lunch.base.indexOf(nw.go) >= 0, '날씨 없으면 기본 글');
  const late = new Set(); for (let sd = 1; sd < 80; sd++) late.add(R.recoAlert({ arrMs: kst(23, 30), nowMs: kst(23, 25), dest: '강남', weather: null, shop: { n: '우산', _t: '우천대비' }, seed: sd }).ad.m); assert.ok(late.has('자기 전에 확인하세요'), '밤늦게엔 밤 문구도 섞인다');
});
t('작은 화면 문구 줄 길이: 한 줄 46자 안, 길면 …로 자르고 전체 7줄 안쪽', () => {
  const a = R.recoPip({ slot: 'night', dest: '강남', nowMs: kst(20, 0), seed: 3, body: 'a\nb\nc\n' + '가'.repeat(120), a: { remMin: 5, menu: '피자', hook: '훅', cx: { h: 20 }, spots: ['가게1', '가게2'], dinner: false } });
  a.pip.lines.forEach(l => assert.ok(l.length <= 47, l.length));
  assert.ok(a.pip.lines.some(l => /…$/.test(l)));
});
t('recoPip: 이상한 입력에도 죽지 않는다', () => {
  for (const bad of [undefined, {}, { a: {} }, { a: { cx: 5 }, nowMs: 1 }, { a: { cx: {} }, nowMs: kst(12, 0), slot: 5, body: 5, seed: 'x' }]) assert.strictEqual(R.recoPip(bad).v, 1);
});

const worker = fs.readFileSync(path.join(root, 'engine/route-v2-worker.ascii.js'), 'utf8');
t('Worker 에 내장되고 /reco-text 길이 있다', () => {
  assert.ok(/\/\/ ===== reco-text \(/.test(worker)); assert.ok(/reco-text \\ub05d =====/.test(worker));
  assert.ok(/url\.pathname === "\/reco-text"\) return handleRecoText\(request\)/.test(worker));
});
t('Worker 내장본 결과가 모듈과 같다', () => {
  const m = worker.match(/\/\/ ===== reco-text \([^\n]*\n([\s\S]*?)\/\/ ===== reco-text \\ub05d =====/); assert.ok(m);
  const arr = require(path.join(root, 'engine/arrive-reco.js')), shop = require(path.join(root, 'engine/shop.js'));
  const body = m[1].replace(/^\s*if \(typeof module[^\n]*\n/m, '');
  const mod = new Function('Response', 'arrSlot', 'arrIsDinner', 'arrRemainMin', 'SHOP_SEASON_KW', 'SHOP_NOWX', body + '; return { recoAlert: recoAlert };')(Response, arr.arrSlot, arr.arrIsDinner, arr.arrRemainMin, shop.SHOP_SEASON_KW, shop.SHOP_NOWX);
  for (const h of [3, 8, 12, 18, 20, 22]) for (let s = 1; s < 25; s++) {
    const a = { arrMs: kst(h, 5), nowMs: kst(h, 0), dest: '강남', weather: WX, food: FOOD, recent: ['카페C'], shop: { n: '우산', _t: '우천대비' }, seed: s };
    assert.deepStrictEqual(mod.recoAlert(a), R.recoAlert(a));
  }
});
async function call(method, body) {
  const req = new Request('https://x/reco-text', { method, body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) });
  const res = await R.handleRecoText(req); return { status: res.status, json: await res.json().catch(() => null) };
}
(async () => {
  let r = await call('POST', { arrMs: kst(20, 5), nowMs: kst(20, 0), dest: '강남', weather: WX, food: FOOD, recent: [], seed: 7 });
  t('POST: ok · 야식 본문', () => { assert.strictEqual(r.status, 200); assert.strictEqual(r.json.ok, true); assert.strictEqual(r.json.kind, 'night'); assert.ok(r.json.body.length > 20); });
  r = await call('POST', { op: 'pip', slot: 'night', dest: '강남', body: 'a\nb\nc\nd', nowMs: kst(20, 0), seed: 1, a: { remMin: 5, menu: '피자', hook: '훅', cx: { h: 20 }, spots: ['A'], dinner: false } });
  t('POST op=pip: 작은 화면 문구만', () => { assert.strictEqual(r.status, 200); assert.strictEqual(r.json.ok, true); assert.ok(r.json.pip && r.json.pip.lines.length >= 2); assert.ok(!('body' in r.json)); });
  r = await call('GET'); t('GET → 405', () => assert.strictEqual(r.status, 405));
  r = await call('OPTIONS'); t('OPTIONS → 204', () => assert.strictEqual(r.status, 204));
  r = await call('POST', '{no'); t('이상한 JSON → 400', () => assert.strictEqual(r.status, 400));
  r = await call('POST', 'x'.repeat(60001)); t('너무 긴 본문 → 413', () => assert.strictEqual(r.status, 413));

  // ── 3단계: 쿠팡 상품 고르기 · 도착지 가게 목록 받기를 엔진이 ──
  const SHOPMOD = require(path.join(root, 'engine/shop.js'));
  const mkCat = (c, n) => ({ c, items: Array.from({ length: n }, (_, i) => ({ n: c + ' 상품' + i, u: 'https://shop.test/' + c + i, i: 'https://img.test/' + c + i + '.png' })) });
  const SD = { CATS: [mkCat('식사', 18), mkCat('생활', 18), mkCat('뷰티', 18)], WEEKDAY: [{ h1: 0, h2: 12, items: [{ t: '우천대비', u: 'https://shop.test/생활0' }] }, { h1: 12, h2: 24, items: [{ t: '야식', u: 'https://shop.test/식사0' }, { t: '셀프케어', u: 'https://shop.test/뷰티0' }] }], WEEKEND: [{ h1: 0, h2: 24, items: [] }] };
  const top30 = (nowMs, wx) => SHOPMOD.shopPick(SD, SHOPMOD.shopClock(nowMs, 540), wx, null).rec.slice(0, 30);
  const SEXT = { shop: { data: SD, cfg: null } };
  const askShop = (o, ext) => R.recoAlert(Object.assign({ arrMs: kst(22, 5), nowMs: kst(22, 0), dest: '강남', weather: WX, food: null, recent: [], shop: null, pickShop: 1, shopRecent: [], seed: 7 }, o || {}), ext === undefined ? SEXT : ext);

  t('상품 고르기: 추천 100선 위 30개 중 하나 · 링크와 그림 주소를 함께 돌려준다', () => {
    const r = askShop(); const pool = top30(kst(22, 0), WX).map(x => x.n);
    assert.strictEqual(r.kind, 'shop'); assert.strictEqual(r.shop, true); assert.ok(r.shopItem && pool.includes(r.shopItem.n), JSON.stringify(r.shopItem));
    assert.ok(/^https:\/\/shop\.test\//.test(r.shopItem.u) && /^https:\/\/img\.test\//.test(r.shopItem.i)); assert.ok(r.shopItem._cat);
    assert.ok(r.body.includes('🛍 ' + r.shopItem.n)); assert.ok(!('shopMiss' in JSON.parse(JSON.stringify(r))));
    assert.ok(r.ad && r.ad.k === 'shop' && r.ad.a === r.shopItem.n.replace(/\s+/g, ' '), JSON.stringify(r.ad));
    assert.ok(r.pip && r.pip.lines.some(l => l.includes(r.shopItem.n)));
  });
  t('상품 고르기: 같은 씨앗이면 같은 상품 · 씨앗이 다르면 여러 상품', () => {
    assert.deepStrictEqual(askShop({ seed: 5 }), askShop({ seed: 5 }));
    const set = new Set(); for (let sd = 1; sd < 60; sd++) set.add(askShop({ seed: sd }).shopItem.n); assert.ok(set.size > 8, set.size);
  });
  t('상품 고르기: 최근 추천한 상품은 피한다(전부 최근이면 다시 허용)', () => {
    const pool = top30(kst(22, 0), WX).map(x => x.n);
    for (let sd = 1; sd < 40; sd++) { const r = askShop({ seed: sd, shopRecent: pool.slice(0, 25) }); assert.ok(pool.slice(25).includes(r.shopItem.n), r.shopItem.n); }
    const all = askShop({ seed: 3, shopRecent: pool }); assert.ok(pool.includes(all.shopItem.n));
  });
  t('상품 고르기: 앱이 이미 상품을 보냈으면 엔진은 고르지 않는다(상품 목록도 안 쓴다)', () => {
    const r = askShop({ shop: { n: '우산', _t: '우천대비', _cat: '생활' } }); assert.ok(!r.shopItem && r.shop === true); assert.ok(/🛍 우산/.test(r.body)); assert.ok(!r.shopMiss);
  });
  t('상품 고르기: 상품 목록이 없으면 shopMiss(앱이 예전 규칙으로 고르게) · 본문은 상품 없는 문구', () => {
    for (const ext of [undefined, {}, { shop: null }, { shop: { data: { CATS: [], WEEKDAY: [], WEEKEND: [] } } }]) {
      const r = askShop({}, ext === undefined ? null : ext); assert.strictEqual(r.shopMiss, true); assert.strictEqual(r.shop, false); assert.ok(!r.shopItem); assert.ok(/오늘 밤 둘러볼 만한 것들을/.test(r.body));
    }
  });
  t('상품 고르기: pickShop 이 없으면 예전 모양(shopItem·shopMiss 없음)', () => {
    const r = askShop({ pickShop: 0 }); assert.ok(!('shopItem' in r) && !('shopMiss' in r)); assert.strictEqual(r.shop, false);
  });
  t('상품 고르기: 링크가 이상한 상품(javascript: 등)은 쓰지 않는다', () => {
    const bad = JSON.parse(JSON.stringify(SD)); bad.CATS.forEach(c => c.items.forEach(x => { x.u = 'javascript:alert(1)'; }));
    const r = askShop({}, { shop: { data: bad, cfg: null } }); assert.strictEqual(r.shopMiss, true); assert.ok(!r.shopItem);
    const bi = JSON.parse(JSON.stringify(SD)); bi.CATS.forEach(c => c.items.forEach(x => { x.i = 'file:///x'; }));
    const r2 = askShop({}, { shop: { data: bi, cfg: null } }); assert.ok(r2.shopItem && r2.shopItem.i === '');
  });
  t('상품 고르기: 날씨(비)에 따라 쇼핑 엔진의 점수 순서를 따른다(앱이 보낸 날씨로 계산)', () => {
    const rain = { temp: 18, feel: 17, tmin: 14, tmax: 21, rain: 90, txt: '비' };
    const pool = top30(kst(22, 0), rain).map(x => x.n); for (let sd = 1; sd < 25; sd++) assert.ok(pool.includes(askShop({ seed: sd, weather: rain }).shopItem.n));
  });
  t('상품 고르기: 쇼핑 시간대가 아니면 pickShop 이 있어도 고르지 않는다', () => {
    const r = R.recoAlert({ arrMs: kst(12, 5), nowMs: kst(12, 0), dest: '강남', weather: WX, food: FOOD, recent: [], pickShop: 1, seed: 7 }, SEXT); assert.ok(!('shopItem' in r) && r.kind === 'lunch');
  });

  const SRV = [{ n: '서버국밥', c: '음식점 > 한식 > 국밥', a: '서울 1', d: 90 }, { n: '서버카페', c: '카페 > 커피전문점', a: '서울 2', d: 60 }, { n: '서버치킨', c: '음식점 > 치킨', a: '서울 3', d: 200 }];
  t('가게 목록: foodPref=server 이고 엔진이 받아 온 목록이 있으면 그걸 쓴다 · foods 로 돌려준다(주소 포함)', () => {
    const r = R.recoAlert({ arrMs: kst(12, 5), nowMs: kst(12, 0), dest: '강남', weather: WX, food: FOOD, recent: [], foodPref: 'server', loc: { lat: 37.5, lng: 127 }, seed: 7 }, { foods: SRV });
    assert.deepStrictEqual(r.foods, SRV); assert.ok(r.placeIdx >= 0 && r.placeIdx < SRV.length); assert.ok(SRV.some(x => r.body.includes(x.n)), r.body); assert.ok(!FOOD.some(x => r.body.includes(x.n)));
  });
  t('가게 목록: 엔진이 못 받았으면(ext 없음·빈 목록) 앱이 보낸 목록을 쓴다 · foods 없음', () => {
    for (const ext of [undefined, {}, { foods: null }, { foods: [] }]) {
      const r = R.recoAlert({ arrMs: kst(12, 5), nowMs: kst(12, 0), dest: '강남', weather: WX, food: FOOD, recent: [], foodPref: 'server', seed: 7 }, ext);
      assert.ok(!('foods' in r)); assert.ok(FOOD.some(x => r.body.includes(x.n)), r.body);
    }
  });
  t('가게 목록: foodPref 가 없으면 받아 온 목록이 있어도 쓰지 않는다(예전 모양)', () => {
    const r = R.recoAlert({ arrMs: kst(12, 5), nowMs: kst(12, 0), dest: '강남', weather: WX, food: FOOD, recent: [], seed: 7 }, { foods: SRV }); assert.ok(!('foods' in r)); assert.ok(!SRV.some(x => r.body.includes(x.n)));
  });
  t('가게 목록: 오버레이 줄·작은 화면 문구도 받아 온 목록의 이름을 쓴다(piIdx 가 foods 순서)', () => {
    const r = R.recoAlert({ arrMs: kst(12, 5), nowMs: kst(12, 0), dest: '강남', weather: WX, food: null, recent: [], foodPref: 'server', seed: 3 }, { foods: SRV });
    assert.ok(r.ad && SRV.some(x => r.ad.a.startsWith(x.n)), JSON.stringify(r.ad)); if (r.ad.piIdx >= 0) assert.strictEqual(SRV[r.ad.piIdx].n, r.ad.pn);
  });
  t('가게 목록: 앱이 보낸 목록이 없어도(null) 엔진이 받아 오면 된다', () => {
    const r = R.recoAlert({ arrMs: kst(8, 5), nowMs: kst(8, 0), dest: '강남', weather: WX, food: null, recent: [], foodPref: 'server', seed: 7 }, { foods: SRV });
    assert.ok(/서버카페/.test(r.body), r.body);
  });

  // 연결부(handleRecoText): 필요한 때만 바깥 자원을 부른다
  const L = { shop: 0, food: [], wx: [] };
  let WXRET = null;
  let SHOPRET = { data: SD, cfg: null }, FOODRET = SRV;
  R.rtxSetLoaders({ shop: () => { L.shop++; if (SHOPRET === 'throw') throw new Error('x'); return SHOPRET; }, food: loc => { L.food.push(loc); if (FOODRET === 'throw') throw new Error('y'); return FOODRET; }, wx: loc => { L.wx.push(loc); if (WXRET === 'throw') throw new Error('w'); return WXRET; } });
  const rst = () => { L.shop = 0; L.food = []; L.wx = []; };
  const base = { arrMs: kst(22, 5), nowMs: kst(22, 0), dest: '강남', weather: WX, food: null, recent: [], seed: 7 };
  rst(); r = await call('POST', Object.assign({}, base, { pickShop: 1, shopRecent: [] }));
  t('POST: 쇼핑 시간대 pickShop → 상품 목록을 한 번 불러와 shopItem 을 돌려준다 · 맛집 서버는 안 부른다', () => { assert.strictEqual(r.json.ok, true); assert.ok(r.json.shopItem && r.json.shopItem.u); assert.strictEqual(L.shop, 1); assert.strictEqual(L.food.length, 0); });
  rst(); r = await call('POST', Object.assign({}, base, { shop: { n: '우산' }, pickShop: 1 }));
  t('POST: 앱이 상품을 보냈으면 상품 목록을 부르지 않는다', () => { assert.strictEqual(L.shop, 0); assert.ok(!r.json.shopItem); });
  rst(); r = await call('POST', Object.assign({}, base, { arrMs: kst(12, 5), nowMs: kst(12, 0), loc: { lat: 37.4979, lng: 127.0276 }, foodPref: 'server', food: FOOD }));
  t('POST: 점심 foodPref=server + 좌표 → 맛집 서버 목록을 쓰고 foods 로 돌려준다 · 좌표는 5자리로 다듬는다', () => { assert.deepStrictEqual(r.json.foods, SRV); assert.strictEqual(L.food.length, 1); assert.deepStrictEqual(L.food[0], { lat: 37.4979, lng: 127.0276 }); assert.strictEqual(L.shop, 0); });
  rst(); r = await call('POST', Object.assign({}, base, { arrMs: kst(12, 5), nowMs: kst(12, 0), loc: { lat: 37.123456789, lng: 127.987654321 }, foodPref: 'server', food: FOOD }));
  t('POST: 좌표는 소수 5자리로 다듬어 쓴다', () => { assert.deepStrictEqual(L.food[0], { lat: 37.12346, lng: 127.98765 }); });
  // s237: 앱은 날씨를 안 보낸다 — 좌표가 있으면 엔진이 날씨를 받아 문구(버튼 글 · 셋째 줄 · 상황 문구)에 쓴다
  WXRET = { temp: 11, feel: 8, tmin: 6, tmax: 14, rain: 80, txt: '비' };
  rst(); r = await call('POST', { arrMs: kst(12, 5), nowMs: kst(12, 0), dest: '강남', loc: { lat: 37.4979, lng: 127.0276 }, foodPref: 'server', recent: [], seed: 7 });
  t('POST: 날씨를 안 보내고 좌표만 보내면 엔진이 그 좌표의 날씨를 한 번 받아 쓴다(비 → rainy 문구)', () => {
    assert.strictEqual(L.wx.length, 1); assert.deepStrictEqual(L.wx[0], { lat: 37.4979, lng: 127.0276 });
    assert.ok(r.json.cx && r.json.cx.rainy === true && r.json.cx.rain === 80, JSON.stringify(r.json.cx));
    assert.ok(R.RTX_GO.lunch.rainy.concat(R.RTX_GO.lunch.base.slice(0, 2)).indexOf(r.json.ad.go) >= 0, r.json.ad && r.json.ad.go);
  });
  rst(); r = await call('POST', { arrMs: kst(12, 5), nowMs: kst(12, 0), dest: '강남', loc: { lat: 37.4979, lng: 127.0276 }, weather: WX, foodPref: 'server', recent: [], seed: 7 });
  t('POST: 날씨를 보냈으면 날씨 서버를 부르지 않는다 · 좌표가 없으면 안 부른다', async () => { assert.strictEqual(L.wx.length, 0); });
  rst(); r = await call('POST', { arrMs: kst(12, 5), nowMs: kst(12, 0), dest: '강남', recent: [], seed: 7 });
  t('POST: 좌표가 없으면 날씨를 부르지 않는다', () => { assert.strictEqual(L.wx.length, 0); assert.strictEqual(r.json.ok, true); });
  rst(); WXRET = 'throw'; r = await call('POST', { arrMs: kst(12, 5), nowMs: kst(12, 0), dest: '강남', loc: { lat: 37.4979, lng: 127.0276 }, recent: [], seed: 7 });
  t('POST: 날씨를 못 받아도(예외) 날씨 없이 문구를 만든다', () => { assert.strictEqual(r.json.ok, true); assert.strictEqual(L.wx.length, 1); });
  WXRET = null;
  for (const badLoc of [null, {}, { lat: 'a', lng: 1 }, { lat: 10, lng: 127 }, { lat: 37, lng: 10 }, { lat: 91, lng: 127 }, [1, 2]]) {
    rst(); r = await call('POST', Object.assign({}, base, { arrMs: kst(12, 5), nowMs: kst(12, 0), loc: badLoc, foodPref: 'server', food: FOOD }));
    t('POST: 이상한 좌표(' + JSON.stringify(badLoc) + ')면 맛집 서버를 부르지 않고 앱 목록을 쓴다', () => { assert.strictEqual(L.food.length, 0); assert.ok(!('foods' in r.json)); assert.ok(FOOD.some(x => r.json.body.includes(x.n))); });
  }
  rst(); r = await call('POST', Object.assign({}, base, { arrMs: kst(12, 5), nowMs: kst(12, 0), loc: { lat: 37.5, lng: 127 }, food: FOOD }));
  t('POST: foodPref 가 없으면 좌표가 있어도 맛집 서버를 부르지 않는다', () => { assert.strictEqual(L.food.length, 0); assert.ok(!('foods' in r.json)); });
  rst(); r = await call('POST', Object.assign({}, base, { arrMs: kst(22, 5), loc: { lat: 37.5, lng: 127 }, foodPref: 'server', pickShop: 1 }));
  t('POST: 쇼핑 시간대에는 가게 목록을 받지 않는다 · 심야(추천 없음)에도 아무것도 부르지 않는다', async () => {
    assert.strictEqual(L.food.length, 0);
    rst(); const z = await call('POST', Object.assign({}, base, { arrMs: kst(3, 5), nowMs: kst(3, 0), loc: { lat: 37.5, lng: 127 }, foodPref: 'server', pickShop: 1 }));
    assert.strictEqual(L.food.length + L.shop, 0); assert.strictEqual(z.json.slot, 'none');
  });
  rst(); SHOPRET = null; r = await call('POST', Object.assign({}, base, { pickShop: 1 }));
  t('POST: 상품 목록을 못 불러오면 200 + shopMiss', () => { assert.strictEqual(r.status, 200); assert.strictEqual(r.json.ok, true); assert.strictEqual(r.json.shopMiss, true); });
  SHOPRET = 'throw'; FOODRET = 'throw';
  r = await call('POST', Object.assign({}, base, { pickShop: 1 })); const r2x = await call('POST', Object.assign({}, base, { arrMs: kst(12, 5), nowMs: kst(12, 0), loc: { lat: 37.5, lng: 127 }, foodPref: 'server', food: FOOD }));
  t('POST: 불러오기가 예외를 던져도 죽지 않는다(상품은 shopMiss · 가게는 앱 목록)', () => { assert.strictEqual(r.status, 200); assert.strictEqual(r.json.shopMiss, true); assert.strictEqual(r2x.status, 200); assert.ok(!('foods' in r2x.json)); assert.ok(FOOD.some(x => r2x.json.body.includes(x.n))); });
  SHOPRET = { data: SD, cfg: null }; FOODRET = SRV;
  rst(); r = await call('POST', { op: 'pip', slot: 'night', dest: '강남', body: 'a\nb\nc\nd', nowMs: kst(20, 0), seed: 1, pickShop: 1, foodPref: 'server', loc: { lat: 37.5, lng: 127 }, a: { remMin: 5, menu: '피자', hook: '훅', cx: { h: 20 }, spots: ['A'], dinner: false } });
  t('POST op=pip: 바깥 자원을 부르지 않는다', () => { assert.strictEqual(L.shop + L.food.length, 0); assert.ok(r.json.pip); });
  t('이전 앱(3단계 값 없음)이 보낸 요청은 예전과 똑같이 처리된다', () => {
    const a = R.recoAlert({ arrMs: kst(22, 5), nowMs: kst(22, 0), dest: '강남', weather: WX, food: FOOD, recent: [], shop: { n: '우산', _t: '우천대비', _cat: '생활' }, seed: 7 });
    assert.ok(!('shopItem' in a) && !('shopMiss' in a) && !('foods' in a)); assert.strictEqual(a.shop, true);
  });
  R.rtxSetLoaders(null);

  // ── 4단계(s63): ⑦ AI 위로 문구를 엔진이 받아 본문 네 번째 줄에 끼운다 ──
  const WXM = { temp: 20, feel: 20, tmin: 15, tmax: 24, rain: 0, txt: '맑음' };   // 상황 문구가 약한 날씨(추위 WX 는 항상 hookStrong)
  const NIGHT = { arrMs: kst(20, 5), nowMs: kst(20, 0), dest: '강남', weather: WXM, food: FOOD, recent: [], seed: 7 };
  const NIGHTC = Object.assign({}, NIGHT, { weather: WX });   // 추운 날: 상황 문구가 강하다
  const SHOPQ = { arrMs: kst(22, 5), nowMs: kst(22, 0), dest: '강남', weather: WXM, food: null, recent: [], shop: { n: '우산', _t: '우천대비', _cat: '생활' }, seed: 7 };
  const findSeed = (base, strong) => { for (let sd = 1; sd < 400; sd++) { const x = R.recoAlert(Object.assign({}, base, { seed: sd })); if (x.slot !== 'none' && !!x.hookStrong === strong && x.body.split('\n').length > 3) return sd; } return -1; };
  const sdWeak = findSeed(NIGHT, false), sdStrong = findSeed(NIGHTC, true);
  t('AI 문구: 시험 씨앗을 찾았다(상황 문구 약함)', () => assert.ok(sdWeak > 0, 'weak seed'));
  const wk = Object.assign({}, NIGHT, { seed: sdWeak });
  t('rtxAiClean: 문구 꺼내기 · 공백/따옴표 정리 · 60자 초과/금지어/빈 값은 null', () => {
    assert.strictEqual(R.rtxAiClean({ messages: [{ text: '  "오늘도  수고했어요"  ' }] }), '오늘도 수고했어요');
    assert.strictEqual(R.rtxAiClean({ msgs: [{ msg: '야식 한 입이면 충분해요' }] }), '야식 한 입이면 충분해요');
    assert.strictEqual(R.rtxAiClean({ messages: ['문자열 문구'] }), '문자열 문구');
    assert.strictEqual(R.rtxAiClean({ text: '단일 문구' }), '단일 문구');
    assert.strictEqual(R.rtxAiClean({ messages: [{ text: '가'.repeat(61) }] }), null);
    assert.strictEqual(R.rtxAiClean({ messages: [{ text: '가'.repeat(60) }] }), '가'.repeat(60));
    assert.strictEqual(R.rtxAiClean({ messages: [{ text: '오늘 국회 소식 보셨어요' }] }), null);
    for (const bad of [null, undefined, {}, [], { messages: [] }, { messages: [{}] }, { text: 5 }, '']) assert.strictEqual(R.rtxAiClean(bad), null);
  });
  t('rtxAiSubject: 야식·쇼핑만 · 상황 문구가 강하면 없음 · 쇼핑은 상품 이름(없으면 작은 선물)', () => {
    const n = R.recoAlert(wk); assert.strictEqual(R.rtxAiSubject(n, null), n.menu);
    const sh = R.recoAlert(Object.assign({}, SHOPQ)); assert.strictEqual(R.rtxAiSubject(sh, { shop: { n: '우산' } }), '우산'); assert.strictEqual(R.rtxAiSubject(sh, null), '작은 선물');
    const lunch = R.recoAlert({ arrMs: kst(12, 5), nowMs: kst(12, 0), dest: '강남', weather: WX, food: FOOD, recent: [], seed: 7 }); assert.strictEqual(R.rtxAiSubject(lunch, null), null);
    assert.strictEqual(R.rtxAiSubject(Object.assign({}, n, { hookStrong: true }), null), null);
    assert.strictEqual(R.rtxAiSubject(Object.assign({}, n, { body: 'a\nb\nc' }), null), null);
    assert.strictEqual(R.rtxAiSubject(Object.assign({}, n, { slot: 'shop', kind: 'shop', shopItem: null }), { shop: null }), '작은 선물');
    assert.strictEqual(R.rtxAiSubject(null, null), null);
  });
  t('recoAlert: ext.ai 가 있으면 네 번째 줄만 AI 문구로 바뀌고 ai:true · 나머지 줄은 그대로', () => {
    const a = R.recoAlert(wk), b = R.recoAlert(wk, { ai: { text: '오늘 하루도 정말 수고 많았어요' } });
    const la = a.body.split('\n'), lb = b.body.split('\n');
    assert.strictEqual(b.ai, true); assert.ok(!('ai' in a)); assert.strictEqual(lb.length, la.length);
    assert.ok(lb[3].includes('오늘 하루도 정말 수고 많았어요'), lb[3]); assert.notStrictEqual(lb[3], la[3]);
    la.forEach((l, i) => { if (i !== 3) assert.strictEqual(lb[i], l); });
    assert.strictEqual(b.title, a.title); assert.strictEqual(b.menu, a.menu);
  });
  t('recoAlert: 같은 씨앗·같은 문구면 결과가 똑같다(작은 화면 문구·오버레이 줄 포함)', () => {
    const x = R.recoAlert(wk, { ai: { text: '오늘도 고생했어요' } }), y = R.recoAlert(wk, { ai: { text: '오늘도 고생했어요' } });
    assert.deepStrictEqual(x, y); assert.ok(x.pip && x.pip.lines.length >= 2);
  });
  t('recoAlert: 작은 화면 문구·오버레이 줄은 AI 가 끼워진 본문을 기준으로 다시 만든다(형태는 그대로)', () => {
    const a = R.recoAlert(wk), b = R.recoAlert(wk, { ai: { text: '오늘도 고생했어요' } });
    assert.ok(b.pip && typeof b.pip.title === 'string'); assert.ok(b.ad === null || (typeof b.ad.k === 'string' && typeof b.ad.a === 'string'));
    assert.strictEqual(!!a.ad, !!b.ad);
  });
  t('recoAlert: 상황 문구가 강하면(hookStrong) ext.ai 가 있어도 끼우지 않는다', () => {
    if (sdStrong < 0) return;       // 이 날씨·시각에 강한 문구가 안 나오면 건너뜀
    const s = Object.assign({}, NIGHTC, { seed: sdStrong }), a = R.recoAlert(s), b = R.recoAlert(s, { ai: { text: '끼우면 안 되는 문구' } });
    assert.deepStrictEqual(b, a); assert.ok(!('ai' in b));
  });
  t('recoAlert: 야식·쇼핑이 아닌 시간대는 ext.ai 를 무시한다', () => {
    const l = { arrMs: kst(12, 5), nowMs: kst(12, 0), dest: '강남', weather: WX, food: FOOD, recent: [], seed: 7 };
    assert.deepStrictEqual(R.recoAlert(l, { ai: { text: 'x 문구' } }), R.recoAlert(l));
  });
  t('recoAlert: 쇼핑 시간대는 상품 이름을 주제로 조사를 맞춘다', () => {
    let hit = false;
    for (let sd = 1; sd < 200 && !hit; sd++) {
      const q = Object.assign({}, SHOPQ, { seed: sd }), a = R.recoAlert(q);
      if (a.slot === 'shop' && !a.hookStrong && a.body.split('\n').length > 3) { const b = R.recoAlert(q, { ai: { text: '오늘은 하나쯤은 괜찮아요' } }); assert.strictEqual(b.ai, true); assert.ok(b.body.split('\n')[3].includes('하나쯤은')); hit = true; }
    }
    assert.ok(hit);
  });
  t('이전 앱(aiCopy 없음)·ext.ai 없음이면 예전과 똑같다', () => {
    const a = R.recoAlert(wk); assert.ok(!('ai' in a) && !('aiTried' in a));
  });

  // 연결부: aiCopy 가 있을 때만 AI 서버를 부르고 aiTried 를 돌려준다
  const AIQ = [];
  let AIRET = '오늘 하루도 수고했어요';
  R.rtxSetLoaders({ ai: q => { AIQ.push(q); if (AIRET === 'throw') throw new Error('z'); return AIRET; } });
  const wbody = Object.assign({}, wk, { aiCopy: 1 });
  AIQ.length = 0; r = await call('POST', wbody);
  t('POST aiCopy:1 → AI 한 줄을 받아 끼운다 · aiTried·ai · 요청에 메뉴·남은 분·역 이름이 실린다', () => {
    assert.strictEqual(r.json.ok, true); assert.strictEqual(r.json.aiTried, true); assert.strictEqual(r.json.ai, true); assert.strictEqual(AIQ.length, 1);
    assert.strictEqual(AIQ[0].menu, r.json.menu); assert.strictEqual(AIQ[0].station, '강남'); assert.strictEqual(AIQ[0].min, r.json.remMin); assert.strictEqual(typeof AIQ[0].dinner, 'boolean');
    assert.ok(r.json.body.split('\n')[3].includes('오늘 하루도 수고했어요'));
    assert.ok(r.json.pip && r.json.pip.title.length > 0);
  });
  t('POST aiCopy:1 → 본문은 직접 recoAlert(ext.ai)한 것과 같다(같은 씨앗)', () => {
    const direct = R.recoAlert(wk, { ai: { text: '오늘 하루도 수고했어요' } });
    const got = Object.assign({}, r.json); delete got.ok; delete got.aiTried;
    assert.deepStrictEqual(got, JSON.parse(JSON.stringify(direct)));
  });
  AIQ.length = 0; r = await call('POST', wk);
  t('POST aiCopy 없음 → AI 서버를 부르지 않고 aiTried 도 없다', () => { assert.strictEqual(AIQ.length, 0); assert.ok(!('aiTried' in r.json) && !('ai' in r.json)); });
  for (const [label, ret] of [['빈 값', ''], ['60자 초과', '가'.repeat(61)], ['금지어', '정치 이야기는 잠시 내려놓고'], ['예외', 'throw'], ['null', null]]) {
    AIRET = ret; AIQ.length = 0; r = await call('POST', wbody);
    t('POST aiCopy:1 · AI ' + label + ' → 본문 그대로 + aiTried:true(ai 없음)', () => {
      assert.strictEqual(r.status, 200); assert.strictEqual(r.json.aiTried, true); assert.ok(!('ai' in r.json));
      const plain = R.recoAlert(wk); assert.strictEqual(r.json.body, plain.body);
    });
  }
  AIRET = '오늘 하루도 수고했어요';
  AIQ.length = 0; r = await call('POST', Object.assign({}, NIGHTC, { seed: sdStrong > 0 ? sdStrong : sdWeak, aiCopy: 1 }));
  t('POST aiCopy:1 · 상황 문구가 강하면 AI 서버를 부르지 않고 aiTried 도 없다', () => { if (sdStrong < 0) return; assert.strictEqual(AIQ.length, 0); assert.ok(!('aiTried' in r.json)); });
  AIQ.length = 0; r = await call('POST', { arrMs: kst(12, 5), nowMs: kst(12, 0), dest: '강남', weather: WX, food: FOOD, recent: [], seed: 7, aiCopy: 1 });
  t('POST aiCopy:1 · 점심이면 AI 서버를 부르지 않는다', () => { assert.strictEqual(AIQ.length, 0); assert.ok(!('aiTried' in r.json)); });
  AIQ.length = 0; r = await call('POST', { op: 'pip', slot: 'night', dest: '강남', body: 'a\nb\nc\nd', nowMs: kst(20, 0), seed: 1, aiCopy: 1, a: { remMin: 5, menu: '피자', hook: '훅', cx: { h: 20 }, spots: ['A'], dinner: false } });
  t('POST op=pip: aiCopy 가 있어도 AI 서버를 부르지 않는다', () => { assert.strictEqual(AIQ.length, 0); assert.ok(!('aiTried' in r.json)); });
  R.rtxSetLoaders(null);

  console.log('reco_text: ' + pass + ' pass ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
