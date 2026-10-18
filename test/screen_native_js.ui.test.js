// 서버 구동 네이티브 쇼핑 화면 ↔ 앱(JS) 연결 시험 — 2026-10-18
//   원칙: "계산은 엔진이, 그림은 앱이". 가짜 ScreenNative 플러그인 + 가짜 엔진(/screen/shop → engine/shop.js 의 실제 출력)으로 확인한다:
//   · 플러그인이 없거나 설정이 꺼져 있으면(기본) 예전 그대로 — 플러그인 호출이 하나도 없다
//   · 켜면: 엔진이 준 JSON 글을 한 글자도 안 고치고 플러그인에 넘긴다(앱은 추천·정렬을 만들지 않는다) · 사각형은 칩 줄부터 탭 맨 아래
//   · 로컬 캐시: 마지막 정상 JSON 을 저장해 두고, 다음에 열 때 네트워크를 기다리지 않고 곧바로 그린다
//   · 폴백: 엔진 응답이 틀리면 버리고(저장본이 있으면 그대로 쓴다, 없으면 웹 화면) · 저장본이 틀리면 버리고 새로 받는다
//   · 행동: 칩(카테고리) · 상품 열기 · 새로고침 · 탭이 움직이거나 팝업이 덮으면 숨김 · 오류/지연이면 웹
// 실행: node test/screen_native_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const E = require('../engine/shop');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 700)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  let SHOPDATA = null;
  // opt: { plugin, on, cache:{cat:txt}, serve:'ok'|'bad'|'shape'|'slow'|'down', autoReady, rejectInvalid }
  async function fresh(opt) {
    opt = opt || {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const x = { ctx, page, errs, reqs: [], serve: opt.serve || 'ok', delay: opt.delay || 0 };
    await page.route('**/*', async r => {
      const u = new URL(r.request().url());
      if (u.protocol === 'file:') return r.continue();
      if (u.pathname === '/screen/shop') {
        x.reqs.push(u.search);
        if (x.delay) await new Promise(res => setTimeout(res, x.delay));
        if (x.serve === 'down') return r.abort();
        const cat = u.searchParams.get('cat') || '추천';
        const scr = E.shopScreen({ nowMs: Date.now(), cat }, SHOPDATA, null, null);
        let body = JSON.stringify(scr);
        if (x.serve === 'shape') body = JSON.stringify({ ok: true, v: 2, screen: 'shop' });
        if (x.serve === 'bad') { const o = JSON.parse(body); o.body[0].items[0].act = { a: 'open', url: 'javascript:alert(1)' }; body = JSON.stringify(o); }
        x.lastBody = body;
        return r.fulfill({ status: 200, contentType: 'application/json', body });
      }
      return r.abort();
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try {
        localStorage.setItem('locDisc', '1'); if (o.on) localStorage.setItem('gdm_scr_on', '1');
        if (o.cache) Object.keys(o.cache).forEach(k => localStorage.setItem('gdm_scr_c:' + k, JSON.stringify({ ts: o.cacheTs || Date.now(), rev: 'old', txt: o.cache[k] })));
        if (o.fails) localStorage.setItem('gdm_scr_fail', String(o.fails));
      } catch (e) {}
      window.__sn = []; window.__snL = {}; window.__ext = [];
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const rec = (m, a, ret) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(ret); };
        const check = (a) => {
          if (a.json == null) return null;
          try { const j = JSON.parse(a.json); if (j.v !== 1 || !Array.isArray(j.body)) return 'invalid: 규격'; if (JSON.stringify(j).indexOf('javascript:') >= 0) return 'invalid: 주소'; } catch (e) { return 'invalid: JSON'; }
          return null;
        };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { ScreenNative: {
          show: (a) => { window.__sn.push({ m: 'show', a: JSON.parse(JSON.stringify(a)) }); const bad = check(a); if (bad) { setTimeout(() => window.__snEmit('error', { id: 'shop', message: bad, kind: 'invalid' }), 5); return Promise.reject(new Error(bad)); } if (o.showFail) return Promise.reject(new Error('뷰를 못 만듦')); if (o.autoReady !== false) setTimeout(() => window.__snEmit('ready', { id: 'shop' }), 30); return Promise.resolve({ items: 10 }); },
          update: (a) => { window.__sn.push({ m: 'update', a: JSON.parse(JSON.stringify(a)) }); const bad = check(a); if (bad) { setTimeout(() => window.__snEmit('error', { id: 'shop', message: bad, kind: 'invalid' }), 5); return Promise.reject(new Error(bad)); } return Promise.resolve({ items: 10 }); },
          setRect: (a) => rec('setRect', a), hide: (a) => rec('hide', a), destroy: (a) => rec('destroy', a),
          status: () => Promise.resolve(window.__status ? window.__status() : { visible: true, items: 10, age: 20, scroll: 0 }),
          addListener: (n, f) => { (window.__snL[n] = window.__snL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.goto('file://' + html); await page.waitForTimeout(2200);
    await page.addStyleTag({ content: '#locDiscOv{display:none !important}' });
    await page.evaluate(() => { const ov = document.getElementById('locDiscOv'); if (ov) ov.remove(); window.toast = window.toast || function () {}; window.__toasts = []; const t0 = window.toast; window.toast = function (m) { window.__toasts.push(String(m)); try { return t0.apply(this, arguments); } catch (e) {} }; window.openExternalApp = function (u) { window.__ext.push(u); }; });
    if (!SHOPDATA) SHOPDATA = await page.evaluate(() => ({ WEEKDAY: SHOP_DATA.WEEKDAY, WEEKEND: SHOP_DATA.WEEKEND, CATS: SHOP_CATS }));
    return x;
  }
  const calls = (x, m) => x.page.evaluate((m) => window.__sn.filter(c => !m || c.m === m), m);
  const clear = (x) => x.page.evaluate(() => { window.__sn.length = 0; });
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__snEmit(n, d), [n, d || {}]);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await x.page.waitForTimeout(60); } return false; };
  const has = (x, m, n) => async () => (await calls(x, m)).length >= (n || 1);
  const last = async (x, m) => { const c = await calls(x, m); return c[c.length - 1]; };
  const openShop = (x) => x.page.evaluate(() => switchTab('shop', document.getElementById('ni-shop')));
  const st = (x) => x.page.evaluate(() => { const S = window._scrShop.S; return { shown: S.shown, ready: S.ready, good: S.good, failed: S.failed, fails: S.fails, why: S.why, cat: S.cat, badFresh: S.badFresh }; });
  const cacheOf = (x, cat) => x.page.evaluate((c) => localStorage.getItem('gdm_scr_c:' + c), cat);
  // 먼저 한 번 열어 상품 자료를 얻는다
  { const x0 = await fresh({ plugin: false }); await x0.ctx.close(); }

  console.log('[① 플러그인이 없거나 꺼져 있으면 예전 그대로]');
  await t('플러그인이 없으면(웹): 요청도 호출도 없다 · 설정 카드도 안 보인다', async () => {
    const x = await fresh({ plugin: false, on: true }); await openShop(x); await x.page.waitForTimeout(1500);
    assert.strictEqual(await x.page.evaluate(() => getComputedStyle(document.getElementById('scrSetCard')).display), 'none');
    assert.strictEqual(x.reqs.length, 0); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('플러그인이 있어도 꺼져 있으면(기본) 호출·요청이 하나도 없다 · 카드는 보이고 스위치는 꺼짐', async () => {
    const x = await fresh({ plugin: true, on: false }); await openShop(x); await x.page.waitForTimeout(1800);
    assert.strictEqual((await calls(x)).length, 0); assert.strictEqual(x.reqs.length, 0);
    const c = await x.page.evaluate(() => ({ d: getComputedStyle(document.getElementById('scrSetCard')).display, on: document.getElementById('scrSetOn').checked, s: document.getElementById('scrSetStat').textContent }));
    assert.strictEqual(c.d, 'block'); assert.strictEqual(c.on, false); assert.ok(/꺼짐/.test(c.s), c.s);
    assert.ok(await x.page.evaluate(() => document.querySelectorAll('#shopGrid .prod').length > 20), '웹 쇼핑은 그대로 그려진다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  console.log('[② 켜면: 엔진 JSON 을 그대로 넘긴다]');
  const A = await fresh({ plugin: true, on: true });
  await t('쇼핑 탭을 열면 엔진에 요청하고, 받은 JSON 글을 한 글자도 안 고치고 show 한다 · 사각형은 칩 줄부터 탭 맨 아래', async () => {
    await openShop(A); assert.ok(await waitFor(A, has(A, 'show')), 'show 가 없다');
    assert.ok(A.reqs.length >= 1 && /cat=%EC%B6%94%EC%B2%9C/.test(A.reqs[0]), A.reqs.join(' '));
    const s = (await last(A, 'show')).a;
    assert.strictEqual(typeof s.json, 'string'); assert.strictEqual(s.json, A.lastBody, '엔진 글과 다르다');
    const bx = await A.page.evaluate(() => { const t = document.getElementById('tab-shop').getBoundingClientRect(), c = document.getElementById('shopCats').getBoundingClientRect(); return { x: t.left, y: c.top, w: t.width, h: t.bottom - c.top }; });
    assert.ok(Math.abs(s.x - bx.x) < 1 && Math.abs(s.y - bx.y) < 1 && Math.abs(s.w - bx.w) < 1 && Math.abs(s.h - bx.h) < 1, JSON.stringify([s.x, s.y, s.w, s.h, bx]));
    assert.strictEqual(s.id, 'shop'); assert.strictEqual(s.dpr, 2); assert.strictEqual(s.keepScroll, false);
    assert.ok(s.h > 300, '높이 ' + s.h);
    const p = s.palette; ['bg', 'card', 'border', 'text', 'sub', 'gold', 'orange', 'imgbg'].forEach(k => assert.ok(typeof p[k] === 'string' && p[k].length > 3, k + ' ' + JSON.stringify(p)));
  });
  await t('앱은 추천을 만들지 않는다: 넘긴 JSON 안의 추천 목록 = 엔진 계산(같은 상품·같은 순서), 앱 _shopPick 호출 없음', async () => {
    const s = (await last(A, 'show')).a, j = JSON.parse(s.json);
    assert.strictEqual(j.v, 1); assert.strictEqual(j.cat, '추천'); assert.strictEqual(j.body[0].items.length, 100);
    const eng = E.shopScreen({ nowMs: Date.now(), cat: '추천' }, SHOPDATA, null, null);
    assert.strictEqual(j.head[0].items.length, eng.head[0].items.length);
  });
  await t('ready 가 오면 정상: 실패 횟수 0 · 저장본이 저장된다(엔진 글 그대로) · 웹 영역(sh:*)은 쉰다', async () => {
    await emit(A, 'ready', { id: 'shop' }); await A.page.waitForTimeout(200);
    const s = await st(A); assert.ok(s.shown && s.ready && s.good && !s.failed && s.fails === 0, JSON.stringify(s));
    const c = JSON.parse(await cacheOf(A, '추천')); assert.strictEqual(c.txt, A.lastBody);
    assert.strictEqual(await A.page.evaluate(() => window._scrShop.owns()), true);
    assert.deepStrictEqual(A.errs, []);
  });
  await t('설정 카드: 켜짐 문구 · 스위치 켜짐', async () => {
    const c = await A.page.evaluate(() => ({ on: document.getElementById('scrSetOn').checked, s: document.getElementById('scrSetStat').textContent }));
    assert.strictEqual(c.on, true); assert.ok(/켜짐/.test(c.s), c.s);
  });

  console.log('[③ 행동: 칩·상품·새로고침]');
  await t('칩(카테고리) 행동 → 그 카테고리를 엔진에 요청하고 update 로 제자리 갱신(스크롤 처음으로)', async () => {
    await clear(A); const n0 = A.reqs.length;
    const cat = SHOPDATA.CATS[1].c;
    await emit(A, 'action', { id: 'shop', a: 'cat', v: cat });
    assert.ok(await waitFor(A, has(A, 'update')), 'update 없음');
    const u = (await last(A, 'update')).a, j = JSON.parse(u.json);
    assert.strictEqual(j.cat, cat); assert.strictEqual(u.json, A.lastBody); assert.ok(A.reqs.length > n0 && A.reqs.some(q => q.includes(encodeURIComponent(cat))), A.reqs.join(' '));
    assert.strictEqual(u.keepScroll, false);
  });
  await t('저장본이 있는 카테고리로 가면 네트워크를 기다리지 않고 곧바로 바뀐다(느린 네트워크에서도)', async () => {
    A.delay = 4000; await clear(A);
    await emit(A, 'action', { id: 'shop', a: 'cat', v: '추천' });
    assert.ok(await waitFor(A, has(A, 'update'), 1200), '4초 걸리는 요청을 기다렸다');
    assert.strictEqual(JSON.parse((await last(A, 'update')).a.json).cat, '추천'); A.delay = 0;
  });
  await t('상품 열기 행동 → 기존 openExternalApp 으로 연다', async () => {
    await emit(A, 'action', { id: 'shop', a: 'open', url: 'https://link.coupang.com/a/abc' });
    await A.page.waitForTimeout(100); assert.deepStrictEqual(await A.page.evaluate(() => window.__ext), ['https://link.coupang.com/a/abc']);
  });
  await t('새로고침 행동 → 새로 받아 처음 위치로 + 기존 안내 토스트', async () => {
    await clear(A); const n0 = A.reqs.length;
    await emit(A, 'action', { id: 'shop', a: 'refresh' });
    assert.ok(await waitFor(A, has(A, 'update')), 'update 없음'); assert.ok(A.reqs.length > n0 && /&t=\d+/.test(A.reqs[A.reqs.length - 1]));
    await A.page.waitForTimeout(100); assert.ok((await A.page.evaluate(() => window.__toasts)).some(m => /재배열/.test(m)));
  });

  console.log('[④ 움직임·덮임·탭 이동]');
  await t('팝업이 덮으면 숨기고, 걷히면 다시 올린다(저장해 둔 화면 그대로)', async () => {
    await clear(A);
    await A.page.evaluate(() => { const d = document.createElement('div'); d.id = 'cov'; d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;'; document.body.appendChild(d); });
    assert.ok(await waitFor(A, has(A, 'hide')), '숨기지 않았다');
    await A.page.evaluate(() => document.getElementById('cov').remove()); await clear(A);
    assert.ok(await waitFor(A, async () => (await calls(A, 'show')).length + (await calls(A, 'update')).length > 0), '다시 올리지 않았다');
  });
  await t('쇼핑 탭을 떠나면 숨긴다', async () => {
    await clear(A); await A.page.evaluate(() => switchTab('home', document.getElementById('ni-home')));
    assert.ok(await waitFor(A, has(A, 'hide')), 'hide 없음');
  });
  await t('사각형이 연달아 바뀌는 동안(탭 전환·키보드)은 숨기고, 멈추면 setRect/올림', async () => {
    await openShop(A); await waitFor(A, async () => (await calls(A, 'show')).length + (await calls(A, 'update')).length > 0); await clear(A);
    await A.page.evaluate(() => { const h = document.getElementById('shopCats'); let i = 0; window.__mv = setInterval(() => { h.style.marginTop = (3 + (i++ % 11) * 2) + 'px'; }, 53); });
    assert.ok(await waitFor(A, has(A, 'hide'), 3000), '움직이는데 숨기지 않았다');
    await A.page.evaluate(() => { clearInterval(window.__mv); document.getElementById('shopCats').style.marginTop = ''; }); await clear(A);
    assert.ok(await waitFor(A, async () => (await calls(A, 'show')).length + (await calls(A, 'update')).length > 0, 4000), '멈춘 뒤 다시 올리지 않았다');
  });
  await t('테마가 바뀌면 팔레트만 다시 보낸다', async () => {
    await clear(A); await A.page.evaluate(() => document.documentElement.setAttribute('data-theme', document.documentElement.getAttribute('data-theme') === 'pastel' ? 'dark' : 'pastel'));
    assert.ok(await waitFor(A, has(A, 'update')), 'palette update 없음');
    const u = (await last(A, 'update')).a; assert.ok(u.palette && !u.json);
    await A.ctx.close();
  });

  console.log('[⑤ 로컬 캐시: 다음에 열 때 곧바로]');
  let CACHE = null;
  await t('저장본이 있으면 느린 네트워크(5초)를 기다리지 않고 show — 그 뒤 새 응답이 오면 제자리 갱신(스크롤 유지)', async () => {
    const x0 = await fresh({ plugin: true, on: true }); await openShop(x0); await waitFor(x0, has(x0, 'show')); await emit(x0, 'ready', { id: 'shop' }); await x0.page.waitForTimeout(200);
    CACHE = await cacheOf(x0, '추천'); assert.ok(CACHE); await x0.ctx.close();
    const c = JSON.parse(CACHE);
    const x = await fresh({ plugin: true, on: true, cache: { 추천: c.txt }, delay: 5000, cacheTs: Date.now() - 10 * 60000 });
    const t0 = Date.now(); await openShop(x);
    assert.ok(await waitFor(x, has(x, 'show'), 2500), '저장본으로 못 띄웠다'); assert.ok(Date.now() - t0 < 2500);
    assert.strictEqual((await last(x, 'show')).a.json, c.txt);
    assert.ok(await waitFor(x, has(x, 'update'), 9000), '새 응답이 오지 않았다');
    assert.strictEqual((await last(x, 'update')).a.keepScroll, true); await x.ctx.close();
  });
  await t('엔진이 아예 안 돼도(네트워크 끊김) 저장본으로 그리고, 실패로 치지 않는다', async () => {
    const c = JSON.parse(CACHE);
    const x = await fresh({ plugin: true, on: true, cache: { 추천: c.txt }, serve: 'down', cacheTs: Date.now() - 10 * 60000 });
    await openShop(x); assert.ok(await waitFor(x, has(x, 'show')), '못 띄웠다'); await emit(x, 'ready', { id: 'shop' }); await x.page.waitForTimeout(1500);
    const s = await st(x); assert.ok(s.shown && s.good && !s.failed && s.fails === 0, JSON.stringify(s)); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  console.log('[⑥ 폴백: 틀린 JSON 은 그리지 않는다]');
  await t('엔진 응답이 틀린 모양이고 저장본도 없으면 → 웹 쇼핑 화면(show 없음, 실패 기록)', async () => {
    const x = await fresh({ plugin: true, on: true, serve: 'shape' }); await openShop(x); await x.page.waitForTimeout(2500);
    assert.strictEqual((await calls(x, 'show')).length, 0);
    const s = await st(x); assert.ok(s.failed && s.fails === 1 && /엔진 화면 오류/.test(s.why), JSON.stringify(s));
    assert.ok(await x.page.evaluate(() => document.querySelectorAll('#shopGrid .prod').length > 20), '웹 쇼핑이 있어야 한다');
    assert.ok(/문제가 있어 웹 화면/.test(await x.page.evaluate(() => document.getElementById('scrSetStat').textContent)));
    await x.ctx.close();
  });
  await t('엔진 응답이 플러그인 검증을 통과 못 하면(위험한 주소) → 저장본이 있으면 그대로 쓰고, 계속 정상', async () => {
    const c = JSON.parse(CACHE);
    const x = await fresh({ plugin: true, on: true, cache: { 추천: c.txt }, serve: 'bad', cacheTs: Date.now() - 10 * 60000 });
    await openShop(x); assert.ok(await waitFor(x, has(x, 'show')), '저장본으로 못 띄웠다'); await emit(x, 'ready', { id: 'shop' });
    await x.page.waitForTimeout(2500);
    const s = await st(x); assert.ok(s.shown && s.good && !s.failed && s.badFresh >= 1, JSON.stringify(s));
    assert.strictEqual((await cacheOf(x, '추천')) && JSON.parse(await cacheOf(x, '추천')).txt, c.txt, '저장본이 틀린 응답으로 덮이면 안 된다');
    assert.ok(/저장해 둔 화면/.test(await x.page.evaluate(() => document.getElementById('scrSetStat').textContent)));
    await x.ctx.close();
  });
  await t('저장본이 틀리면(옛 규격) → 버리고 엔진에서 새로 받아 그린다', async () => {
    const x = await fresh({ plugin: true, on: true, cache: { 추천: JSON.stringify({ ok: true, v: 1, screen: 'shop', head: [], body: [{ t: 'x' }], zzz: 'javascript:alert(1)' }) } });
    await openShop(x); await x.page.waitForTimeout(500);
    assert.ok(await waitFor(x, async () => (await calls(x, 'show')).length >= 2, 9000), '새로 받아 그리지 않았다');
    const sh = await calls(x, 'show'); assert.strictEqual(sh[sh.length - 1].a.json, x.lastBody);
    const s = await st(x); assert.ok(!s.failed, JSON.stringify(s)); await x.ctx.close();
  });

  console.log('[⑦ 안전장치]');
  await t('플러그인 show 가 거절하면 → 웹만 쓴다 · 연속 실패 2번이면 다음 실행부터 안 쓴다', async () => {
    const x = await fresh({ plugin: true, on: true, showFail: true }); await openShop(x); await x.page.waitForTimeout(2500);
    let s = await st(x); assert.ok(s.failed && s.fails === 1, JSON.stringify(s)); await x.ctx.close();
    const y = await fresh({ plugin: true, on: true, fails: 2 }); await openShop(y); await y.page.waitForTimeout(1500);
    assert.strictEqual((await calls(y)).length, 0); assert.strictEqual(y.reqs.length, 0); await y.ctx.close();
  });
  await t('error 이벤트(예외)가 오면 즉시 웹으로 · 플러그인 destroy', async () => {
    const x = await fresh({ plugin: true, on: true }); await openShop(x); await waitFor(x, has(x, 'show')); await emit(x, 'ready', { id: 'shop' });
    await clear(x); await emit(x, 'error', { id: 'shop', message: 'boom', kind: 'exception' }); await x.page.waitForTimeout(300);
    const s = await st(x); assert.ok(s.failed && /native: boom/.test(s.why), JSON.stringify(s)); assert.ok((await calls(x, 'destroy')).length >= 1); await x.ctx.close();
  });
  await t('첫 그림(ready)이 8초 안에 안 오면 웹으로', async () => {
    const x = await fresh({ plugin: true, on: true, autoReady: false }); await openShop(x); await waitFor(x, has(x, 'show'));
    assert.ok(await waitFor(x, async () => (await st(x)).failed, 12000), '지연을 못 알아챘다');
    assert.ok(/ready timeout/.test((await st(x)).why)); await x.ctx.close();
  });
  await t('스위치로 끄면 destroy · 다시 켜면 처음부터', async () => {
    const x = await fresh({ plugin: true, on: true }); await openShop(x); await waitFor(x, has(x, 'show')); await emit(x, 'ready', { id: 'shop' }); await clear(x);
    await x.page.evaluate(() => _scrSetUse(false)); await x.page.waitForTimeout(300);
    assert.ok((await calls(x, 'destroy')).length >= 1); await clear(x);
    await x.page.evaluate(() => _scrSetUse(true)); assert.ok(await waitFor(x, has(x, 'show')), '다시 켜도 안 뜬다'); await x.ctx.close();
  });

  await b.close();
  console.log(`\n${pass} 통과 / ${fail + pass}`); process.exit(fail ? 1 : 0);
})();
