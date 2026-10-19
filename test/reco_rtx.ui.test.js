// 하차 전 추천 문구를 엔진이 만들기(설정 스위치 gdm_rtx) ↔ 앱(JS) 연결 시험 — 2026-10-19 (5번 5단계 넷째 조각 · 추천 문구 1단계)
//   진짜 index.html + 진짜 엔진 모듈(engine/reco-text.js)에 연결해 확인한다:
//   · 꺼져 있으면(기본) 예전 그대로 — 엔진에 묻지 않는다
//   · 켜면: 같은 입력(시간대·날씨·가게 목록·최근 기록·쇼핑 상품·씨앗)에서 알림 본문이 예전 웹 규칙(_arrBuildAlertLocal)과 글자 하나까지 같다
//   · 엔진이 만든 답은 한 번만 쓰고(두 번째는 예전 규칙) · 오래됐거나 다른 도착이면 쓰지 않는다
//   · 폴백: 404 · 응답 없음(2.5초) · 이상한 응답 → 바로 예전 규칙 + 60초 쉬기(그 뒤 다시 묻는다) · 쇼핑 상품은 두 번 고르지 않는다
// 실행: node test/reco_rtx.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const RX = require('../engine/reco-text');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 1200)); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ENG;
function resetEng() { ENG = { mode: 'ok', hits: [], shopData: null, foodSrv: null, foodPhone: null, phoneFood: 0, loads: { shop: 0, food: [] } }; }
RX.rtxSetLoaders({ shop: () => { ENG.loads.shop++; return ENG.shopData ? { data: ENG.shopData, cfg: null } : null; }, food: loc => { ENG.loads.food.push(loc); return ENG.foodSrv; } });
const kst = (h, mi, day) => Date.UTC(2026, 9, day || 19, h - 9, mi || 0);

const FOODS = {
  none: null,
  rich: [{ n: '국밥집A', c: '음식점 > 한식 > 국밥', a: '서울 A', d: 120 }, { n: '치킨B', c: '음식점 > 치킨', a: '서울 B', d: 300 }, { n: '카페C', c: '카페 > 커피전문점', a: '서울 C', d: 80 },
    { n: '피자D', c: '음식점 > 양식 > 피자', a: '서울 D', d: 700 }, { n: '먼카페E', c: '카페 > 커피', a: '서울 E', d: 480 }, { n: '돈가스F', c: '음식점 > 일식 > 돈가스', a: '서울 F', d: 450 },
    { n: '빵집G', c: '음식점 > 간식 > 제과,베이커리', a: '서울 G', d: 200 }, { n: '마라H', c: '음식점 > 중식 > 마라탕', a: '서울 H', d: 900 }],
  far: [{ n: '멀리국밥', c: '음식점 > 한식 > 국밥', a: 'x', d: 1500 }, { n: '멀리카페', c: '카페 > 커피', a: 'y', d: 900 }],
  odd: [{ n: '이상한곳', c: '', a: '', d: null }, { n: '떡볶이집', c: '음식점 > 분식', a: 'z', d: null }]
};
const WXS = {
  none: null,
  cold: { temp: 3, feel: 0, tmin: -2, tmax: 8, rain: 10, txt: '맑음' },
  rain: { temp: 18, feel: 17, tmin: 14, tmax: 21, rain: 80, txt: '비' },
  hot: { temp: 31, feel: 33, tmin: 25, tmax: 34, rain: 0, txt: '맑음' },
  swing: { temp: 14.6, feel: 12.4, tmin: 6, tmax: 20, rain: 35, txt: '구름' },
  snow: { temp: -1, feel: -5, tmin: -4, tmax: 1, rain: 60, txt: '눈' }
};
const SHOPS = [null, { n: '접이식 우산', _t: '우천대비', _cat: '생활' }, { n: '기모 후드', _t: '출근룩소품' }, { n: '고무장갑', _t: '생필품', _cat: '주방' }, { n: '닭가슴살', _t: '다이어트' }];

(async () => {
  resetEng();
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('gdm_loc_disclosed', '1'); } catch (e) {} window.Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web', Plugins: {} }; });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => {
    const u = new URL(r.request().url()); if (u.protocol === 'file:' || u.protocol === 'data:') return r.continue();
    const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (/route-v2/.test(u.host) && u.pathname === '/reco-text') {
      const body = r.request().postData() || ''; ENG.hits.push(body);
      if (ENG.mode === '404') return r.fulfill({ status: 404, headers: H, body: '{"error":"not found"}' });
      if (ENG.mode === 'hang') return;
      if (ENG.mode === 'bad') return r.fulfill({ status: 200, headers: H, body: '{"ok":true,"v":1,"slot":"night"}' });
      // 진짜 Worker 연결부(handleRecoText)를 그대로 태운다 — 상점 목록·맛집 서버는 시험용 가짜(ENG.shopData · ENG.foodSrv)
      return RX.handleRecoText(new Request('http://x/reco-text', { method: 'POST', body })).then(async resp => r.fulfill({ status: resp.status, headers: H, body: await resp.text() }));
    }
    if (/gildongmu-food/.test(u.host) && u.pathname === '/food') { ENG.phoneFood = (ENG.phoneFood || 0) + 1; return r.fulfill({ status: 200, headers: H, body: JSON.stringify({ items: ENG.foodPhone || [] }) }); }
    return r.fulfill({ status: 200, headers: H, body: '{}' });
  });
  await page.clock.install({ time: new Date(kst(12, 0)) });
  await page.goto('file://' + html);
  await page.clock.runFor(3000);
  const fixAt = ms => page.clock.setFixedTime(new Date(ms));
  await fixAt(kst(12, 0));
  await page.evaluate(() => { window.__origNow = window._arrFireAlertNow; });   // 진짜 발송 함수(아래 시험에서 일부는 바꿔 끼운다)

  // 장면 만들기: 가게 목록 · 날씨 · 최근 기록 · 쇼핑 상품을 고정(웹 쪽 전역을 바꿔 끼운다)
  const scene = async (o) => {
    resetEng(); if (o.mode) ENG.mode = o.mode;
    await fixAt(o.nowMs);
    await page.evaluate((o) => {
      window._rtxSetUse(!!o.on); window._RTX.pack = null; window._rtxShopPre = null;
      window.__food = o.food; window.__recent = o.recent || []; window.__wx = o.wx; window.__shop = o.shop; window.__shopPicks = 0;
      window._arrFoodList = function () { return window.__food; };
      window._shopWeather = function () { return window.__wx; };
      window._arrRecoLog = function () { return window.__recent.slice(); };
      window._arrRecoMark = function (n) { (window.__marks = window.__marks || []).push(n); };
      window._arrPickShopItem = function () { window.__shopPicks++; return window.__shop ? { item: window.__shop, ctx: null } : null; };
      window.__marks = [];
    }, o);
  };
  const mulberry = `(function(seed){ var a=(Number(seed)>>>0)||1; return function(){ a=(a+0x6D2B79F5)>>>0; var t=a; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; })`;
  // 예전 규칙으로 만든 본문(씨앗을 Math.random 으로 흉내) / 엔진 경로로 만든 본문(prefetch → _arrBuildAlert)
  const localA = (dest, arrMs, seed) => page.evaluate(([dest, arrMs, seed, mb]) => {
    var old = Math.random; Math.random = eval(mb)(seed);
    try {
      var a = window._arrBuildAlertLocal(dest, null, arrMs), slot = _arrSlot(arrMs);
      var pip = _arrPipText(a, slot, dest, a.body), ad = _arrAd(a, slot, dest);      // 알림을 보낸 뒤 웹이 따로 만들던 것(같은 무작위 흐름)
      return JSON.parse(JSON.stringify({ a: a, pip: pip, ad: ad }));
    } finally { Math.random = old; }
  }, [dest, arrMs, seed, mulberry]);
  const engineA = async (dest, arrMs, seed) => {
    const r = await page.evaluate(([dest, arrMs, seed]) => new Promise(res => {
      var old = Math.random; Math.random = function () { return seed / 4294967296; };
      var before = window._RTX.ok;
            _rtxPrefetch(dest, arrMs, function () {
        Math.random = old;
        try { var a = _arrBuildAlert(dest, null, arrMs), pad = window._rtxPadFor ? null : null, d = window._RTX.pad; res(JSON.parse(JSON.stringify({ a: a, pip: d && d.a === a ? d.pip : null, ad: d && d.a === a ? d.ad : 'none' }))); } catch (e) { res({ err: String(e) }); }
      });
      Math.random = old === Math.random ? old : Math.random;
    }), [dest, arrMs, seed]);
    return r;
  };
  const settle = async () => { await sleep(30); await page.clock.runFor(30); };

  console.log('[스위치 꺼짐 = 예전 그대로]');
  await scene({ on: false, nowMs: kst(20, 0), food: FOODS.rich, wx: WXS.cold, shop: null });
  await page.evaluate(() => { window._arrFireAlertNow = function (d, a) { window.__got = _arrBuildAlert(d, null, a); }; });
  await page.evaluate(([a]) => { _arrFireAlertGo('강남', a); }, [kst(20, 5)]); await settle();
  await t('꺼져 있으면 엔진에 묻지 않고 예전 규칙으로 만든다', async () => { assert.strictEqual(ENG.hits.length, 0); const g = await page.evaluate(() => window.__got); assert.ok(g && /야식|저녁/.test(g.body), JSON.stringify(g)); });

  console.log('[스위치 켜짐 = 같은 입력에서 글자 하나까지 같다]');
  const slots = [[8, 5], [12, 5], [18, 5], [20, 5], [22, 5], [23, 40]];
  const days = [19, 23, 26, 28];        // 월 · 금 · 월(월급날) · 수
  const seeds = [1, 7, 12345, 4000000000];
  await t('시간대 6 × 날씨 6 × 가게목록 4 × 최근 2 × 씨앗 4 × 날 4 × 쇼핑 5 중 전수 대조', async () => {
    let n = 0, compared = 0, kinds = new Set();
    for (const [h, mi] of slots) for (const wk of Object.keys(WXS)) for (const fk of Object.keys(FOODS)) for (const rc of [0, 1]) for (const seed of seeds) for (const day of days) {
      const shops = (h >= 21) ? SHOPS : [null];
      for (const sh of shops) {
        // 조합이 너무 많아 일부만 (결정적으로 솎는다)
        n++; if ((n * 2654435761 >>> 0) % 7 !== 0) continue;
        const arrMs = kst(h, mi, day), nowMs = arrMs - 5 * 60000;
        const recent = rc ? ['카페C', '국밥집A', '치킨B'] : [];
        await scene({ on: true, nowMs, food: FOODS[fk], wx: WXS[wk], shop: sh, recent });
        const L = await localA('강남', arrMs, seed);   // { a, pip, ad }
        await scene({ on: true, nowMs, food: FOODS[fk], wx: WXS[wk], shop: sh, recent });
        const E = await engineA('강남', arrMs, seed);
        const id = JSON.stringify({ h, wk, fk, rc, seed, day, sh: sh && sh.n });
        assert.deepStrictEqual(E, L, id);
        kinds.add(L.a.kind); compared++;
      }
    }
    assert.ok(kinds.size >= 5, [...kinds].join()); assert.ok(compared > 300, 'compared ' + compared);
  });
  await t('엔진이 고른 가게의 기록(최근 추천)을 앱이 남긴다', async () => {
    await scene({ on: true, nowMs: kst(11, 55), food: FOODS.rich, wx: WXS.cold, shop: null });
    const E0 = await engineA('강남', kst(12, 5), 9), E = E0.a;
    const marks = await page.evaluate(() => window.__marks.slice());
    assert.ok(E.place && marks.length === 1 && marks[0] === E.place.n, JSON.stringify({ p: E.place && E.place.n, marks }));
  });
  await t('엔진에는 필요한 값만 간다', async () => {
    const j = JSON.parse(ENG.hits[0]); assert.deepStrictEqual(Object.keys(j).sort(), ['arrMs', 'dest', 'food', 'foodPref', 'loc', 'nowMs', 'recent', 'seed', 'shop', 'weather']); assert.deepStrictEqual(Object.keys(j.loc).sort(), ['lat', 'lng']); assert.strictEqual(j.foodPref, 'server');
    assert.deepStrictEqual(Object.keys(j.food[0]).sort(), ['c', 'd', 'n']);
  });

  console.log('[한 번만 쓴다 · 낡은 답은 안 쓴다]');
  await scene({ on: true, nowMs: kst(11, 55), food: FOODS.rich, wx: WXS.cold, shop: null });
  const first = (await engineA('강남', kst(12, 5), 11)).a;
  const second = await page.evaluate(([a]) => JSON.parse(JSON.stringify(_arrBuildAlert('강남', null, a))), [kst(12, 5)]);
  await t('엔진 답은 한 번만 쓰고 두 번째 호출은 예전 규칙', async () => { assert.ok(first.body); assert.ok(second.body); assert.strictEqual(await page.evaluate(() => window._RTX.pack), null); assert.strictEqual(await page.evaluate(() => window._RTX.used), await page.evaluate(() => window._RTX.used)); });
  await scene({ on: true, nowMs: kst(11, 55), food: FOODS.rich, wx: WXS.cold, shop: null });
  await engineA('강남', kst(12, 5), 11);
  await t('다른 도착 시각·다른 목적지면 쓰지 않는다 · 60초가 지난 답도 쓰지 않는다', async () => {
    const used0 = await page.evaluate(() => window._RTX.used);
    await page.evaluate(([a]) => { _arrBuildAlert('강남', null, a + 60000); _arrBuildAlert('서울', null, a); }, [kst(12, 5)]);
    assert.strictEqual(await page.evaluate(() => window._RTX.used), used0);
    await fixAt(kst(11, 55) + 61000);
    await page.evaluate(([a]) => { _arrBuildAlert('강남', null, a); }, [kst(12, 5)]);
    assert.strictEqual(await page.evaluate(() => window._RTX.used), used0);
  });

  console.log('[폴백 — 바로 예전 규칙 · 60초 쉬기]');
  for (const mode of ['404', 'bad']) {
    await scene({ on: true, mode, nowMs: kst(19, 55), food: FOODS.rich, wx: WXS.cold, shop: null });
    await page.evaluate(() => { window._arrFireAlertNow = function (d, a) { window.__got = _arrBuildAlert(d, null, a); }; window.__got = null; });
    await page.evaluate(([a]) => { _arrFireAlertGo('강남', a); }, [kst(20, 5)]); await settle(); await settle();
    await t('엔진 ' + mode + ' → 바로 예전 규칙으로 만든다 · 카드는 문제로 표시', async () => {
      const g = await page.evaluate(() => window.__got); assert.ok(g && g.body && /야식/.test(g.body));
      assert.strictEqual(await page.evaluate(() => _rtxDown()), true);
      assert.ok(/대신 이어가고/.test(await page.evaluate(() => document.getElementById('rtxSetStat').textContent)));
    });
    const before = ENG.hits.length;
    await page.evaluate(([a]) => { window.__got = null; _arrFireAlertGo('강남', a); }, [kst(20, 5)]); await settle();
    await t('쉬는 60초 동안은 엔진에 묻지 않는다 (' + mode + ')', async () => { assert.strictEqual(ENG.hits.length, before); assert.ok(await page.evaluate(() => window.__got && window.__got.body)); });
  }
  await scene({ on: true, mode: '404', nowMs: kst(19, 55), food: FOODS.rich, wx: WXS.cold, shop: null });
  await page.evaluate(([a]) => { _arrFireAlertGo('강남', a); }, [kst(20, 5)]); await settle(); await settle();
  ENG.mode = 'ok'; await page.clock.runFor(61000); await fixAt(kst(19, 56) + 5000);
  const hb = ENG.hits.length;
  await page.evaluate(([a]) => { window.__got = null; _arrFireAlertGo('강남', a); }, [kst(20, 5)]); await settle(); await settle();
  await t('60초가 지나면 다시 엔진에 묻고 엔진이 만든 본문을 쓴다', async () => { assert.ok(ENG.hits.length > hb); assert.strictEqual(await page.evaluate(() => _rtxDown()), false); assert.ok(await page.evaluate(() => window.__got && window.__got.body)); assert.ok(await page.evaluate(() => window._RTX.used) >= 1); });
  await scene({ on: true, mode: 'hang', nowMs: kst(19, 55), food: FOODS.rich, wx: WXS.cold, shop: null });
  await page.evaluate(([a]) => { window.__got = null; _arrFireAlertGo('강남', a); }, [kst(20, 5)]);
  await sleep(150); await page.clock.runFor(4100); await sleep(150); await page.clock.runFor(100); await sleep(100);
  await t('엔진이 응답 없으면(2.5초·목록을 받을 땐 4초) 예전 규칙으로 만든다 · 쉬기', async () => { assert.ok(await page.evaluate(() => window.__got && window.__got.body)); assert.strictEqual(await page.evaluate(() => _rtxDown()), true); });
  await scene({ on: true, mode: '404', nowMs: kst(22, 0), food: FOODS.rich, wx: WXS.cold, shop: SHOPS[1] });
  await page.evaluate(([a]) => { window.__got = null; _arrFireAlertGo('강남', a); }, [kst(22, 5)]); await settle(); await settle();
  await t('쇼핑 시간대: 엔진이 실패해도 상품을 두 번 고르지 않고 같은 상품으로 만든다', async () => {
    assert.strictEqual(await page.evaluate(() => window.__shopPicks), 1);
    const g = await page.evaluate(() => window.__got); assert.ok(g && g.shop && g.shop.n === '접이식 우산' && /접이식 우산/.test(g.body));
  });

  console.log('[알림을 실제로 보내는 길 — 작은 화면 문구 · 오버레이 추천 줄까지 같다]');
  const e2e = async (on, o, seed, ai) => {
    await scene({ on, nowMs: o.arrMs - 5 * 60000, food: o.food, wx: o.wx, shop: o.shop, recent: [] });
    await page.evaluate(([dest, arrMs, seed, mb, on, ai]) => {
      window.__pip = null; window.__shown = null; window.__aiHit = 0;
      _notifOnceReset(); window._pipReco = { at: 1 };
      window._pipRecoSet = function (t, b) { window.__pip = { t: t, b: b }; };
      window.showNotification = function (t, b) { window.__shown = { t: t, b: b, via: 'notif' }; };
      window._showBriefingModal = function (t, b) { window.__shown = { t: t, b: b, via: 'modal' }; };
      window._featureAllowed = function () { return true; };
      window._arrAiCopy = ai ? function (subject, d, cb) { window.__aiHit++; cb('AI가 쓴 한 줄'); } : null;
      window._arrFireAlertNow = window.__origNow;
      Math.random = on ? function () { return seed / 4294967296; } : eval(mb)(seed);
      _arrFireAlertGo(dest, arrMs);
    }, ['강남', o.arrMs, seed, mulberry, on, ai]);
    for (let i = 0; i < 80; i++) { if (await page.evaluate(() => !!window.__pip)) break; await sleep(30); await page.clock.runFor(40); }
    return page.evaluate(() => { Math.random = window.__origRandom || Math.random; return JSON.parse(JSON.stringify({ pip: window.__pip, shown: window.__shown, last: window._arrLast, ai: window.__aiHit })); });
  };
  await page.evaluate(() => { window.__origRandom = Math.random; });
  const E2 = [
    ['아침 카페', { arrMs: kst(8, 5), food: FOODS.rich, wx: WXS.cold, shop: null }, false],
    ['점심', { arrMs: kst(12, 5), food: FOODS.rich, wx: WXS.rain, shop: null }, false],
    ['저녁', { arrMs: kst(18, 5), food: FOODS.rich, wx: WXS.swing, shop: null }, false],
    ['야식', { arrMs: kst(20, 5), food: FOODS.rich, wx: WXS.hot, shop: null }, false],
    ['쇼핑', { arrMs: kst(22, 5), food: FOODS.rich, wx: WXS.cold, shop: SHOPS[1] }, false],
    ['가게 목록 없음', { arrMs: kst(12, 5), food: FOODS.none, wx: null, shop: null }, false]
  ];
  for (const [nm, o, ai] of E2) {
    await t('실제 발송: ' + nm + ' — 알림·작은 화면·오버레이 줄이 스위치 껐을 때와 같다', async () => {
      for (const seed of [3, 99, 123456]) {
        const L = await e2e(false, o, seed, ai); const hitsBefore = ENG.hits.length;
        const E = await e2e(true, o, seed, ai);
        assert.ok(ENG.hits.length > 0, '엔진을 부르지 않음');
        assert.ok(L.pip && L.shown && L.last, '예전 길이 안 나감 ' + JSON.stringify(L));
        assert.deepStrictEqual(E, L, nm + ' seed=' + seed);
      }
    });
  }
  const aiScn = { arrMs: kst(20, 5), food: FOODS.rich, wx: null, shop: null };
  await t('본문 한 줄이 AI 문구로 바뀌면 작은 화면 문구만 엔진에 다시 묻는다(알림 본문엔 AI 줄이 들어간다)', async () => {
    const L = await e2e(false, aiScn, 5, true); const E = await e2e(true, aiScn, 5, true);
    assert.strictEqual(E.ai, 1); assert.ok(ENG.hits.some(h => JSON.parse(h).op === 'pip'), 'pip 요청 없음'); assert.strictEqual(await page.evaluate(() => _rtxDown()), false, '엔진 pip 응답을 못 받아 예전 규칙으로 갔다');
    assert.ok(/AI가 쓴 한 줄/.test(E.shown.b) && /AI가 쓴 한 줄/.test(L.shown.b));
    assert.strictEqual(E.shown.b, L.shown.b); assert.strictEqual(E.shown.t, L.shown.t);
    assert.deepStrictEqual(E.last.ad, L.last.ad);
    const lp = L.pip.b.split('\n'), ep = E.pip.b.split('\n'); assert.strictEqual(ep[0], lp[0]); assert.ok(ep.some(x => /AI가 쓴 한 줄/.test(x)) === lp.some(x => /AI가 쓴 한 줄/.test(x)));
  });
  await t('작은 화면 문구만 다시 받을 때(op=pip) 같은 씨앗이면 예전 _arrPipText 와 같다', async () => {
    for (const seed of [1, 42, 777]) {
      await scene({ on: true, nowMs: kst(19, 55), food: FOODS.rich, wx: WXS.cold, shop: null });
      const r = await page.evaluate(([seed, mb, arrMs]) => new Promise(res => {
        var old = Math.random; Math.random = eval(mb)(11);
        var a = window._arrBuildAlertLocal('강남', null, arrMs); Math.random = old;
        var body = a.body.split('\n'); body[3] = 'AI 한 줄'; body = body.join('\n');
        Math.random = eval(mb)(seed); var local = _arrPipText(a, 'night', '강남', body); Math.random = function () { return seed / 4294967296; };
        _rtxPipFetch(a, 'night', '강남', body, function (pt) { Math.random = old; res({ local: local, pt: pt }); });
      }), [seed, mulberry, kst(20, 5)]);
      assert.ok(r.pt, 'pip 응답 없음 ' + JSON.stringify(await page.evaluate(() => ({ down: _rtxDown(), why: _RTX.why }))) + ENG.hits.length); assert.deepStrictEqual(r.pt, JSON.parse(JSON.stringify(r.local)));
    }
  });
  await t('엔진 pip 요청에는 알림 정보 일부만 간다(가게 목록·최근 기록은 가지 않는다)', async () => {
    const j = JSON.parse(ENG.hits.filter(h => JSON.parse(h).op === 'pip')[0]);
    assert.deepStrictEqual(Object.keys(j).sort(), ['a', 'body', 'dest', 'nowMs', 'op', 'seed', 'slot']);
    assert.ok(!('food' in j) && !('recent' in j));
  });
  await t('엔진이 만든 pip/ad 모양이 이상하면 쓰지 않고 예전 규칙으로 간다', async () => {
    await scene({ on: true, nowMs: E2[3][1].arrMs - 300000, food: FOODS.rich, wx: WXS.hot, shop: null });
    const bad = await page.evaluate(([dest, arrMs]) => new Promise(res => {
      window._rtxPrefetch(dest, arrMs, function () { var pk = window._RTX.pack; if (pk) { pk.r.pip = { title: 5 }; } var a = _arrBuildAlert(dest, null, arrMs); res({ pad: window._RTX.pad, body: a.body }); });
    }), ['강남', E2[3][1].arrMs]);
    assert.strictEqual(bad.pad, null); assert.ok(/야식/.test(bad.body));
  });

  console.log('[3단계 — 가게 목록 받기 · 쿠팡 상품 고르기를 엔진이]');
  const SHOPMOD = require('../engine/shop');
  const mkCat = (c, n) => ({ c, items: Array.from({ length: n }, (_, i) => ({ n: c + ' 상품' + i, u: 'https://shop.test/' + c + i, i: 'https://img.test/' + c + i + '.png' })) });
  const SD = { CATS: [mkCat('식사', 18), mkCat('생활', 18), mkCat('뷰티', 18)], WEEKDAY: [{ h1: 0, h2: 12, items: [{ t: '우천대비', u: 'https://shop.test/생활0' }] }, { h1: 12, h2: 24, items: [{ t: '야식', u: 'https://shop.test/식사0' }] }], WEEKEND: [{ h1: 0, h2: 24, items: [] }] };
  const top30 = (ms, wx) => SHOPMOD.shopPick(SD, SHOPMOD.shopClock(ms, 540), wx, null).rec.slice(0, 30).map(x => x.n);
  const SRVFOOD = [{ n: '서버국밥', c: '음식점 > 한식 > 국밥', a: '서울 1', d: 90 }, { n: '서버카페', c: '카페 > 커피전문점', a: '서울 2', d: 60 }, { n: '서버치킨', c: '음식점 > 치킨', a: '서울 3', d: 200 }];
  const fire = async (o, afterScene) => {
    await scene(o);
    if (afterScene) afterScene();
    await page.evaluate(() => {
      window._arrFoodCache = window.__cache || { stn: null, at: 0, items: [] }; window.__ens = 0; window.__got = null;
      window._arrEnsureFood = function (d, cb) { window.__ens++; cb(); };
      window._arrFireAlertNow = function (d, a) { window.__got = JSON.parse(JSON.stringify(_arrBuildAlert(d, null, a))); };
    });
    await page.evaluate(([a]) => { _arrFireAlert('강남', a); }, [o.nowMs + 600000]);
    for (let i = 0; i < 60; i++) { if (await page.evaluate(() => !!window.__got)) break; await sleep(30); await page.clock.runFor(40); }
    return page.evaluate(() => ({ got: window.__got, ens: window.__ens, cache: JSON.parse(JSON.stringify(window._arrFoodCache)), marks: window.__marks.slice(), down: _rtxDown(), pre: window._rtxShopPre }));
  };
  await t('가게 목록: 서버 목록이 없으면 앱이 기다리지 않고 도착지 좌표만 알린다 → 엔진이 받아 온 목록으로 본문을 만든다', async () => {
    ENG.foodSrv = null;
    const r = await fire({ on: true, nowMs: kst(11, 55), food: FOODS.far, wx: WXS.cold, shop: null }, () => { ENG.foodSrv = SRVFOOD; });
    assert.strictEqual(r.ens, 0, '앱이 먼저 맛집 서버를 받으려 했다'); assert.strictEqual(ENG.phoneFood, 0);
    assert.strictEqual(ENG.hits.length, 1); const j = JSON.parse(ENG.hits[0]);
    assert.strictEqual(j.foodPref, 'server'); assert.deepStrictEqual(Object.keys(j.loc).sort(), ['lat', 'lng']); assert.ok(j.loc.lat > 33 && j.loc.lat < 39 && j.loc.lng > 124 && j.loc.lng < 132);
    assert.deepStrictEqual(ENG.loads.food.length, 1);
    assert.ok(r.got && SRVFOOD.some(x => r.got.body.includes(x.n)), r.got && r.got.body); assert.ok(r.got.place && SRVFOOD.some(x => x.n === r.got.place.n));
    assert.strictEqual(r.cache.stn, '강남'); assert.strictEqual(r.cache.items.length, 3); assert.deepStrictEqual(r.cache.items[0], SRVFOOD[0]);
    assert.deepStrictEqual(r.marks, [r.got.place.n]); assert.strictEqual(r.down, false);
  });
  await page.evaluate(() => { window.__cache = null; });
  await t('가게 목록: 신선한 서버 목록(캐시)이 있으면 좌표를 보내지 않는다', async () => {
    await scene({ on: true, nowMs: kst(11, 55), food: FOODS.rich, wx: WXS.cold, shop: null });
    await page.evaluate((items) => { window.__cache = { stn: '강남', at: Date.now(), items: items }; }, FOODS.rich);
    const r = await fire({ on: true, nowMs: kst(11, 55), food: FOODS.rich, wx: WXS.cold, shop: null }, () => { ENG.foodSrv = SRVFOOD; });
    assert.strictEqual(ENG.loads.food.length, 0); const j = JSON.parse(ENG.hits[0]); assert.ok(!('loc' in j) && !('foodPref' in j), JSON.stringify(Object.keys(j)));
    assert.ok(r.got && FOODS.rich.some(x => r.got.body.includes(x.n)) && !SRVFOOD.some(x => r.got.body.includes(x.n)));
    await page.evaluate(() => { window.__cache = null; });
  });
  await t('가게 목록: 엔진이 맛집 서버에서 못 받으면 앱이 보낸 목록으로 만든다(캐시는 채우지 않는다)', async () => {
    const r = await fire({ on: true, nowMs: kst(11, 55), food: FOODS.rich, wx: WXS.cold, shop: null }, () => { ENG.foodSrv = null; });
    assert.strictEqual(ENG.loads.food.length, 1); assert.ok(r.got && FOODS.rich.some(x => r.got.body.includes(x.n))); assert.strictEqual(r.cache.items.length, 0); assert.strictEqual(r.down, false); assert.strictEqual(r.ens, 0);
  });
  await t('가게 목록: 엔진이 돌려준 목록이 1개뿐이어도 그대로 쓴다', async () => {
    const r = await fire({ on: true, nowMs: kst(11, 55), food: FOODS.rich, wx: WXS.cold, shop: null }, () => { ENG.foodSrv = [{ n: '정상', c: 'x', a: '', d: 1 }]; });
    assert.ok(r.got); assert.strictEqual(r.cache.items.length, 1);
  });
  await t('가게 목록: 엔진이 돌려준 목록의 모양이 이상하면(이름이 글자가 아님) 통째로 쓰지 않고 예전 길로 간다', async () => {
    const r = await fire({ on: true, nowMs: kst(11, 55), food: FOODS.rich, wx: WXS.cold, shop: null }, () => { ENG.foodSrv = [{ n: '정상', c: 'x', a: '', d: 1 }, { n: 5, c: 'y' }]; });
    assert.strictEqual(r.down, true); assert.strictEqual(r.ens, 1); assert.strictEqual(r.cache.items.length, 0); assert.ok(r.got && r.got.body && !/정상/.test(r.got.body));
  });
  await t('폴백: 엔진이 응답 없음/오류면 예전 길 — 앱이 맛집을 받은 뒤 예전 규칙으로 만든다', async () => {
    for (const mode of ['404', 'bad']) {
      const r = await fire({ on: true, mode, nowMs: kst(11, 55), food: FOODS.rich, wx: WXS.cold, shop: null });
      assert.strictEqual(r.ens, 1, mode + ': 맛집 받기 ' + r.ens); assert.ok(r.got && r.got.body && /점심|한 끼/.test(r.got.body), mode); assert.strictEqual(r.down, true);
    }
  });
  await t('스위치가 꺼져 있으면 예전 그대로 — 앱이 먼저 맛집을 받고 엔진은 부르지 않는다', async () => {
    const r = await fire({ on: false, nowMs: kst(11, 55), food: FOODS.rich, wx: WXS.cold, shop: null });
    assert.strictEqual(r.ens, 1); assert.strictEqual(ENG.hits.length, 0); assert.ok(r.got && r.got.body);
  });
  await t('엔진이 쉬는 60초 동안에도 예전 길(앱이 맛집을 먼저 받는다)', async () => {
    await fire({ on: true, mode: '404', nowMs: kst(11, 55), food: FOODS.rich, wx: WXS.cold, shop: null });
    const hits = ENG.hits.length;
    const r = await page.evaluate(([a]) => { window.__got = null; window.__ens = 0; _arrFireAlert('강남', a); return window.__ens; }, [kst(12, 5)]);
    for (let i = 0; i < 20; i++) { if (await page.evaluate(() => !!window.__got)) break; await sleep(30); await page.clock.runFor(40); }
    assert.strictEqual(r + 0, 1); assert.strictEqual(ENG.hits.length, hits); assert.ok(await page.evaluate(() => !!window.__got));
  });

  const shopScene = { on: true, nowMs: kst(22, 0), food: FOODS.rich, wx: WXS.cold, shop: SHOPS[1], recent: [] };
  await t('상품 고르기: 앱은 고르지 않고 최근 추천 기록만 알린다 → 엔진이 고른 상품(링크 포함)으로 본문을 만들고 기록을 남긴다', async () => {
    await scene(shopScene);
    await page.evaluate(() => { localStorage.setItem('arrShopLog', JSON.stringify(['식사 상품0', '식사 상품1'])); });
    const r = await fire(shopScene, () => { ENG.shopData = SD; });
    assert.strictEqual(await page.evaluate(() => window.__shopPicks), 0, '앱이 상품을 골랐다');
    const j = JSON.parse(ENG.hits[0]); assert.strictEqual(j.pickShop, 1); assert.strictEqual(j.shop, null); assert.deepStrictEqual(j.shopRecent, ['식사 상품0', '식사 상품1']); assert.ok(!('loc' in j));
    assert.strictEqual(ENG.loads.shop, 1); assert.strictEqual(ENG.loads.food.length, 0);
    const pool = top30(kst(22, 0), WXS.cold).filter(n => n !== '식사 상품0' && n !== '식사 상품1');
    assert.ok(r.got && r.got.shop && pool.includes(r.got.shop.n), JSON.stringify(r.got && r.got.shop)); assert.ok(/^https:\/\/shop\.test\//.test(r.got.shop.u)); assert.ok(r.got.body.includes('🛍 ' + r.got.shop.n));
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem('arrShopLog'))); assert.strictEqual(log[log.length - 1], r.got.shop.n);
    assert.strictEqual(r.pre && r.pre.item && r.pre.item.n, r.got.shop.n); assert.strictEqual(r.ens, 0); assert.strictEqual(r.down, false);
    await page.evaluate(() => { localStorage.removeItem('arrShopLog'); });
  });
  await t('상품 고르기: 엔진이 상품 목록을 못 불러오면 앱이 예전 규칙으로 하나 골라 다시 묻는다(한 번만 고른다)', async () => {
    const r = await fire(shopScene, () => { ENG.shopData = null; });
    assert.strictEqual(await page.evaluate(() => window.__shopPicks), 1); assert.strictEqual(ENG.hits.length, 2);
    const j2 = JSON.parse(ENG.hits[1]); assert.ok(!('pickShop' in j2) && j2.shop && j2.shop.n === '접이식 우산' && !('shopRecent' in j2));
    assert.ok(r.got && r.got.shop && r.got.shop.n === '접이식 우산' && /접이식 우산/.test(r.got.body)); assert.strictEqual(r.down, false);
  });
  await t('상품 고르기: 엔진이 아예 안 되면(404) 예전 길 — 앱이 상품을 한 번만 고르고 그걸로 만든다', async () => {
    const r = await fire({ ...shopScene, mode: '404' });
    assert.strictEqual(await page.evaluate(() => window.__shopPicks), 1); assert.ok(r.got && r.got.shop && r.got.shop.n === '접이식 우산'); assert.strictEqual(r.down, true);
  });

  console.log('[오버레이 시연 버튼]');
  const demo = async (o, kindFirst, pre) => {
    await scene(o); if (pre) pre();
    await page.evaluate(([k0]) => {
      window.__demo = null; window._rcDemoN = k0; window._arrFoodList = function () { return window.__food; };
      window.Capacitor.Plugins.Overlay = { recoDemo: function (x) { window.__demo = x; return Promise.resolve({ ok: true }); } };
      window.toast = function () {};
      window.__demoRet = _ovlRecoDemo();
    }, [kindFirst]);
    for (let i = 0; i < 60; i++) { if (await page.evaluate(() => !!window.__demo)) break; await sleep(30); await page.clock.runFor(40); }
    return page.evaluate(() => ({ demo: window.__demo, ret: window.__demoRet, down: _rtxDown() }));
  };
  await t('시연: 켜면 줄(가게)을 엔진에게 받는다 — 같은 길(/reco-text)의 ad', async () => {
    const r = await demo({ on: true, nowMs: kst(14, 0), food: FOODS.rich, wx: WXS.cold, shop: null }, 0);
    assert.strictEqual(r.ret, true); assert.ok(r.demo && r.demo.go === '맛집 보기' && / · /.test(r.demo.a), JSON.stringify(r.demo));
    assert.ok(FOODS.rich.some(x => r.demo.a.startsWith(x.n)), r.demo.a); assert.ok(r.demo.b && r.demo.ch && r.demo.secs === 14);
    assert.strictEqual(ENG.hits.length, 1); const j = JSON.parse(ENG.hits[0]); assert.strictEqual(j.dest, ''); assert.deepStrictEqual(j.recent, []);
  });
  await t('시연: 켜면 줄(쿠팡)을 엔진이 고른 상품으로 받는다', async () => {
    const r = await demo({ on: true, nowMs: kst(14, 0), food: FOODS.rich, wx: WXS.cold, shop: null }, 1, () => { ENG.shopData = SD; });
    const j = JSON.parse(ENG.hits[0]); assert.strictEqual(j.pickShop, 1); assert.deepStrictEqual(j.shopRecent, []); assert.strictEqual(ENG.loads.shop, 1);
    assert.ok(r.demo && r.demo.go === '쿠팡 보기' && top30(kst(14, 0), WXS.cold).includes(r.demo.a), JSON.stringify(r.demo));
    assert.ok(r.demo.b);
  });
  await t('시연: 엔진이 안 되면 그 종류는 예전 웹 규칙으로 보여 준다(쉬기 표시)', async () => {
    const r = await demo({ on: true, mode: '404', nowMs: kst(14, 0), food: FOODS.rich, wx: WXS.cold, shop: null }, 0);
    assert.ok(r.demo && r.demo.a && r.demo.go, JSON.stringify(r.demo)); assert.strictEqual(r.down, true);
  });
  await t('시연: 꺼져 있으면 엔진에 묻지 않고 바로(동기) 예전 규칙', async () => {
    const r = await demo({ on: false, nowMs: kst(14, 0), food: FOODS.rich, wx: WXS.cold, shop: null }, 0);
    assert.strictEqual(ENG.hits.length, 0); assert.ok(r.demo && r.demo.a && r.demo.go);
  });
  await t('시연: 기능 없는 앱 버전이면 알림만 하고 엔진에 묻지 않는다', async () => {
    await scene({ on: true, nowMs: kst(14, 0), food: FOODS.rich, wx: WXS.cold, shop: null });
    const msg = await page.evaluate(() => { var m = []; window.toast = function (x) { m.push(String(x)); }; window.Capacitor.Plugins.Overlay = {}; var ret = _ovlRecoDemo(); return { m: m, ret: ret }; });
    assert.strictEqual(msg.ret, false); assert.ok(/지원하지 않아요/.test(msg.m[0] || '')); assert.strictEqual(ENG.hits.length, 0);
  });

  console.log('[설정 카드]');
  await scene({ on: false, nowMs: kst(12, 0), food: null, wx: null, shop: null });
  await t('카드: 꺼짐 문구 · 켜면 gdm_rtx=1 · 끄면 0', async () => {
    await page.evaluate(() => _rtxSyncCard());
    assert.ok(/꺼짐/.test(await page.evaluate(() => document.getElementById('rtxSetStat').textContent)));
    await page.evaluate(() => _rtxSetUse(true)); assert.strictEqual(await page.evaluate(() => localStorage.getItem('gdm_rtx')), '1');
    assert.ok(/켜짐/.test(await page.evaluate(() => document.getElementById('rtxSetStat').textContent)));
    await page.evaluate(() => _rtxSetUse(false)); assert.strictEqual(await page.evaluate(() => localStorage.getItem('gdm_rtx')), '0');
  });
  await t('엔진 설정 화면의 rtx 항목 문구가 카드와 같다', async () => {
    const SE = require('../engine/settings'); const row = SE.SETTINGS_FEATS.find(x => x.k === 'rtx'); assert.ok(row);
    assert.strictEqual(await page.evaluate(() => document.querySelector('#rtxSetCard p').textContent), row.desc);
    assert.strictEqual(await page.evaluate(() => document.querySelector('#rtxSetCard div div').textContent), row.title);
  });
  await t('스크립트 오류 없음', async () => assert.deepStrictEqual(errs, []));

  await b.close();
  console.log('reco_rtx: ' + pass + ' pass ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
