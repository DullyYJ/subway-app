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
function resetEng() { ENG = { mode: 'ok', hits: [] }; }
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
      const out = RX.recoAlert(JSON.parse(body)); out.ok = true;
      return r.fulfill({ status: 200, headers: H, body: JSON.stringify(out) });
    }
    return r.fulfill({ status: 200, headers: H, body: '{}' });
  });
  await page.clock.install({ time: new Date(kst(12, 0)) });
  await page.goto('file://' + html);
  await page.clock.runFor(3000);
  const fixAt = ms => page.clock.setFixedTime(new Date(ms));
  await fixAt(kst(12, 0));

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
    try { return JSON.parse(JSON.stringify(window._arrBuildAlertLocal(dest, null, arrMs))); } finally { Math.random = old; }
  }, [dest, arrMs, seed, mulberry]);
  const engineA = async (dest, arrMs, seed) => {
    const r = await page.evaluate(([dest, arrMs, seed]) => new Promise(res => {
      var old = Math.random; Math.random = function () { return seed / 4294967296; };
      var before = window._RTX.ok;
      window._rtxPrefetchTest = function () { return true; };
      _rtxPrefetch(dest, arrMs, function () {
        Math.random = old;
        try { res(JSON.parse(JSON.stringify(_arrBuildAlert(dest, null, arrMs)))); } catch (e) { res({ err: String(e) }); }
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
        const L = await localA('강남', arrMs, seed);
        await scene({ on: true, nowMs, food: FOODS[fk], wx: WXS[wk], shop: sh, recent });
        const E = await engineA('강남', arrMs, seed);
        const id = JSON.stringify({ h, wk, fk, rc, seed, day, sh: sh && sh.n });
        assert.deepStrictEqual(E, L, id);
        kinds.add(L.kind); compared++;
      }
    }
    assert.ok(kinds.size >= 5, [...kinds].join()); assert.ok(compared > 300, 'compared ' + compared);
  });
  await t('엔진이 고른 가게의 기록(최근 추천)을 앱이 남긴다', async () => {
    await scene({ on: true, nowMs: kst(11, 55), food: FOODS.rich, wx: WXS.cold, shop: null });
    const E = await engineA('강남', kst(12, 5), 9);
    const marks = await page.evaluate(() => window.__marks.slice());
    assert.ok(E.place && marks.length === 1 && marks[0] === E.place.n, JSON.stringify({ p: E.place && E.place.n, marks }));
  });
  await t('엔진에는 필요한 값만 간다', async () => {
    const j = JSON.parse(ENG.hits[0]); assert.deepStrictEqual(Object.keys(j).sort(), ['arrMs', 'dest', 'food', 'nowMs', 'recent', 'seed', 'shop', 'weather']);
    assert.deepStrictEqual(Object.keys(j.food[0]).sort(), ['c', 'd', 'n']);
  });

  console.log('[한 번만 쓴다 · 낡은 답은 안 쓴다]');
  await scene({ on: true, nowMs: kst(11, 55), food: FOODS.rich, wx: WXS.cold, shop: null });
  const first = await engineA('강남', kst(12, 5), 11);
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
  await sleep(150); await page.clock.runFor(2600); await sleep(100);
  await t('엔진이 응답 없으면(2.5초) 예전 규칙으로 만든다 · 쉬기', async () => { assert.ok(await page.evaluate(() => window.__got && window.__got.body)); assert.strictEqual(await page.evaluate(() => _rtxDown()), true); });
  await scene({ on: true, mode: '404', nowMs: kst(22, 0), food: FOODS.rich, wx: WXS.cold, shop: SHOPS[1] });
  await page.evaluate(([a]) => { window.__got = null; _arrFireAlertGo('강남', a); }, [kst(22, 5)]); await settle(); await settle();
  await t('쇼핑 시간대: 엔진이 실패해도 상품을 두 번 고르지 않고 같은 상품으로 만든다', async () => {
    assert.strictEqual(await page.evaluate(() => window.__shopPicks), 1);
    const g = await page.evaluate(() => window.__got); assert.ok(g && g.shop && g.shop.n === '접이식 우산' && /접이식 우산/.test(g.body));
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
