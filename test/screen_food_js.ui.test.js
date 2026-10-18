// 서버 구동 네이티브 맛집 화면 ↔ 앱(JS) 연결 시험 — 2026-10-18
//   원칙: "계산은 엔진이, 그림은 앱이". 가짜 ScreenNative 플러그인 + 가짜 엔진(POST /screen/food → engine/food.js 의 실제 출력)으로 확인한다:
//   · 플러그인이 없거나 설정이 꺼져 있으면(기본) 예전 그대로 — 플러그인 호출·요청이 하나도 없다
//   · 켜면: 받아 둔 가게 목록과 지금 상태를 엔진에 보내고(cap=4), 엔진이 준 JSON 글을 한 글자도 안 고치고 플러그인에 넘긴다 · 사각형은 맛집 탭 전체
//   · 행동: 칩(cat) → 고른 칩이 바뀌고 새 화면(같은 요청은 기억에서) · 새로고침 → loadFoodTab(true) · 가게(call fm.c.N) → 웹 지도 시트 · 뒤로가기는 시트부터
//   · 폴백: 엔진 응답이 틀리면 그리지 않고 웹 화면 · 같은 요청의 저장본은 곧바로 쓴다 · 플러그인 오류 → 웹
// 실행: node test/screen_food_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const E = require('../engine/food');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 700)); } };

const CUR = [
  { place_name: '맛있는 국밥집', category_name: '음식 > 한식 > 국밥', road_address_name: '서울 강남구 역삼로 12', distance: 120, x: '127.03', y: '37.50', source: 'local' },
  { place_name: '스타벅스 강남점', category_name: '음식 > 카페 > 커피전문점', road_address_name: '서울 강남구 테헤란로 1', distance: 250, x: '127.031', y: '37.501', source: 'local' },
  { place_name: '한우마을', category_name: '음식 > 한식 > 소고기 구이', road_address_name: '서울 강남구 학동로 4', distance: 410, x: '127.032', y: '37.502', source: 'local' }
];
const PUB = [
  { place_name: '공공 식당', category_name: '한식 일반한식', road_address_name: '서울 강남구 선릉로 7', distance: 1200, x: '127.04', y: '37.51', source: 'public' },
  { place_name: '공공 카페', category_name: '음료 카페', road_address_name: '서울 강남구 선릉로 8', distance: 800, x: '127.041', y: '37.511', source: 'public' }
];

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // opt: { plugin, on, cache:{txt,fk}, serve:'ok'|'shape'|'down', delay }
  async function fresh(opt, ctxIn) {
    opt = opt || {};
    const ctx = ctxIn || await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const x = { ctx, page, errs, reqs: [], serve: opt.serve || 'ok', delay: opt.delay || 0 };
    await page.route('**/*', async r => {
      const u = new URL(r.request().url());
      if (u.protocol === 'file:') return r.continue();
      if (u.pathname === '/screen/food') {
        const req = r.request();
        assert.strictEqual(req.method(), 'POST'); assert.ok(/text\/plain/.test(req.headers()['content-type'] || ''), '사전 요청이 필요한 형식으로 보냈다');
        const body = JSON.parse(req.postData() || '{}'); x.reqs.push(body); x.lastReq = body;
        if (x.delay) await new Promise(res => setTimeout(res, x.delay));
        if (x.serve === 'down') return r.abort();
        const items = { c: (body.c || []).map(a => a), p: (body.p || []).map(a => a) };
        let out = JSON.stringify(E.foodScreen({ cap: Number(body.cap) || 0 }, body.f, items));
        if (x.serve === 'shape') out = JSON.stringify({ ok: true, v: 2, screen: 'food' });
        x.lastBody = out;
        return r.fulfill({ status: 200, contentType: 'application/json', body: out });
      }
      return r.abort();
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try {
        localStorage.setItem('locDisc', '1'); if (o.on) localStorage.setItem('gdm_scrf_on', '1');
        if (o.cache) localStorage.setItem('gdm_scrf_c', JSON.stringify({ ts: Date.now(), fk: o.cache.fk, rev: 'old', txt: o.cache.txt }));
      } catch (e) {}
      window.__sn = []; window.__snL = {};
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const rec = (m, a, ret) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(ret); };
        const check = (a) => {
          if (a.json == null) return null;
          try { const j = JSON.parse(a.json); if (j.v !== 1 || !Array.isArray(j.body)) return 'invalid: 규격'; } catch (e) { return 'invalid: JSON'; }
          return null;
        };
        const put = (m) => (a) => { window.__sn.push({ m, a: JSON.parse(JSON.stringify(a)) }); const bad = check(a); if (bad) { setTimeout(() => window.__snEmit('error', { id: 'food', message: bad, kind: 'invalid' }), 5); return Promise.reject(new Error(bad)); } return Promise.resolve(); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { ScreenNative: {
          show: put('show'), update: put('update'),
          setRect: (a) => rec('setRect', a), hide: (a) => rec('hide', a), destroy: (a) => rec('destroy', a), toast: (a) => rec('toast', a),
          status: () => Promise.resolve({ visible: true, items: 10, age: 20, scroll: 0 }),
          addListener: (n, f) => { (window.__snL[n] = window.__snL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.goto('file://' + html); await page.waitForTimeout(2200);
    await page.addStyleTag({ content: '#locDiscOv{display:none !important}' });
    await page.evaluate(() => { const ov = document.getElementById('locDiscOv'); if (ov) ov.remove(); });
    // 결정적으로: 웹이 스스로 목록을 받아 오는 일(loadFoodTab)은 막고, 시험이 가게 목록·상태를 직접 놓는다
    await page.evaluate(() => { window.__lft = []; window.loadFoodTab = function (f) { window.__lft.push(!!f); }; window.__maps = []; window._foodShowMap = function (card, p) { window.__maps.push(p.place_name); }; });
    return x;
  }
  const calls = (x, m) => x.page.evaluate((m) => window.__sn.filter(c => !m || c.m === m), m);
  const clear = (x) => x.page.evaluate(() => { window.__sn.length = 0; });
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__snEmit(n, d), [n, d || {}]);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await x.page.waitForTimeout(60); } return false; };
  const has = (x, m, n) => async () => (await calls(x, m)).length >= (n || 1);
  const last = async (x, m) => { const c = await calls(x, m); return c[c.length - 1]; };
  const anyPut = (x) => async () => (await calls(x, 'show')).length + (await calls(x, 'update')).length > 0;
  const st = (x) => x.page.evaluate(() => { const S = window._scrFood.S; return { shown: S.shown, ready: S.ready, good: S.good, failed: S.failed, fails: S.fails, why: S.why, badFresh: S.badFresh }; });
  const act = (x, d) => emit(x, 'action', Object.assign({ id: 'food' }, d));
  const setData = (x, o) => x.page.evaluate((o) => {
    _foodAllData = o.c; _foodPublicData = o.p; if (o.flt) _foodCurFilter = o.flt; _foodSrvFail = !!o.fail;
    _foodUi(o.stn, o.st || 'ready'); _renderFoodList();
  }, o);
  const openFood = (x) => x.page.evaluate(() => switchTab('food', document.getElementById('ni-food')));
  const places = (txt) => JSON.parse(txt).body.filter(n => n.t === 'place');

  console.log('[① 플러그인이 없거나 꺼져 있으면 예전 그대로]');
  await t('플러그인이 없으면(웹): 요청도 호출도 없다 · 설정 카드도 안 보인다 · 웹 목록은 그대로 그려진다', async () => {
    const x = await fresh({ plugin: false, on: true }); await openFood(x); await setData(x, { c: CUR, p: PUB, stn: '강남' }); await x.page.waitForTimeout(1500);
    assert.strictEqual(await x.page.evaluate(() => getComputedStyle(document.getElementById('scrfSetCard')).display), 'none');
    assert.strictEqual(x.reqs.length, 0);
    assert.ok(await x.page.evaluate(() => document.querySelectorAll('#foodList .food-card').length) >= 3, '웹 목록이 안 그려졌다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('플러그인이 있어도 꺼져 있으면(기본) 호출·요청이 없다 · 카드는 보이고 스위치는 꺼짐', async () => {
    const x = await fresh({ plugin: true, on: false }); await openFood(x); await setData(x, { c: CUR, p: PUB, stn: '강남' }); await x.page.waitForTimeout(1800);
    assert.strictEqual((await calls(x)).length, 0); assert.strictEqual(x.reqs.length, 0);
    const c = await x.page.evaluate(() => ({ d: getComputedStyle(document.getElementById('scrfSetCard')).display, on: document.getElementById('scrfSetOn').checked, s: document.getElementById('scrfSetStat').textContent }));
    assert.strictEqual(c.d, 'block'); assert.strictEqual(c.on, false); assert.ok(/꺼짐/.test(c.s), c.s);
    assert.strictEqual(await x.page.evaluate(() => window._scrFood.owns()), false);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  console.log('[② 켜면: 가게 목록과 상태를 보내고 엔진 JSON 을 그대로 넘긴다]');
  const A = await fresh({ plugin: true, on: true });
  await t('맛집 탭을 열고 목록이 놓이면 요청(cap=4: 상태·칩·가게 배열)하고, 받은 글을 한 글자도 안 고치고 show 한다 · 사각형은 맛집 탭 전체', async () => {
    await openFood(A); await setData(A, { c: CUR, p: PUB, stn: '강남' });
    assert.ok(await waitFor(A, has(A, 'show')), 'show 가 없다');
    const q = A.reqs[A.reqs.length - 1];
    assert.strictEqual(q.cap, 4); assert.deepStrictEqual(q.f, { stn: '강남', st: 'ready', flt: '전체', fail: 0 });
    assert.deepStrictEqual(q.c[0], ['맛있는 국밥집', '음식 > 한식 > 국밥', '서울 강남구 역삼로 12', 120]); assert.strictEqual(q.c.length, 3); assert.strictEqual(q.p.length, 2);
    const s = (await last(A, 'show')).a;
    assert.strictEqual(s.id, 'food'); assert.strictEqual(s.json, A.lastBody, '엔진 글과 다르다');
    const bx = await A.page.evaluate(() => { const r = document.getElementById('tab-food').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    assert.ok(Math.abs(s.x - bx.x) < 1 && Math.abs(s.y - bx.y) < 1 && Math.abs(s.w - bx.w) < 1 && Math.abs(s.h - bx.h) < 1, JSON.stringify([s.x, s.y, s.w, s.h, bx]));
    assert.strictEqual(s.dpr, 2); assert.strictEqual(s.keepScroll, false);
    ['bg', 'card', 'border', 'border2', 'text', 'sub', 'gold', 'orange', 'imgbg'].forEach(k => assert.ok(typeof s.palette[k] === 'string' && s.palette[k].length > 3, k + ' ' + JSON.stringify(s.palette)));
  });
  await t('엔진 글 안에 순위·별점·거리·공공데이터 딱지가 들어 있다(앱은 문구를 만들지 않는다)', async () => {
    const ps = places((await last(A, 'show')).a.json);
    assert.strictEqual(ps.length, 5); assert.strictEqual(ps[0].name, '맛있는 국밥집'); assert.strictEqual(ps[0].dist, '120m'); assert.strictEqual(ps[0].stars, '★★★★★');
    assert.ok(ps[3].pub && ps[3].badge === '공공데이터');
  });
  await t('ready 가 오면 정상: 실패 0 · 저장본이 저장된다 · 예전 맛집 영역(fd:*)은 쉰다(owns)', async () => {
    await emit(A, 'ready', { id: 'food' }); await A.page.waitForTimeout(200);
    const s = await st(A); assert.ok(s.shown && s.ready && s.good && !s.failed && s.fails === 0, JSON.stringify(s));
    const c = JSON.parse(await A.page.evaluate(() => localStorage.getItem('gdm_scrf_c'))); assert.strictEqual(c.txt, A.lastBody);
    assert.strictEqual(await A.page.evaluate(() => window._scrFood.owns()), true);
    assert.deepStrictEqual(A.errs, []);
  });
  await t('설정 카드: 켜짐 문구 · 스위치 켜짐 (엔진 문구와 같다)', async () => {
    const c = await A.page.evaluate(() => ({ on: document.getElementById('scrfSetOn').checked, s: document.getElementById('scrfSetStat').textContent }));
    assert.strictEqual(c.on, true);
    assert.strictEqual(c.s, require('../engine/settings').SETTINGS_FEATS.find(d => d.k === 'scrf').ok);
  });

  console.log('[③ 행동: 칩·새로고침·데이터 변화]');
  await t('칩(cat 카페) → 고른 칩이 바뀌고(웹 칩도) 새 요청 → update(keepScroll 거짓: 목록이 바뀌었다)', async () => {
    await clear(A); const n0 = A.reqs.length;
    await act(A, { a: 'cat', v: '카페' });
    assert.ok(await waitFor(A, has(A, 'update')), 'update 없음');
    assert.strictEqual(await A.page.evaluate(() => _foodCurFilter), '카페');
    assert.ok(A.reqs.length === n0 + 1 && A.lastReq.f.flt === '카페');
    const u = (await last(A, 'update')).a; assert.strictEqual(u.keepScroll, false);
    assert.deepStrictEqual(places(u.json).map(p => p.name), ['스타벅스 강남점', '공공 카페']);
    assert.strictEqual(await A.page.evaluate(() => Array.from(document.querySelectorAll('#foodFilter .food-chip.on')).map(c => c.textContent).join()), '☕ 카페');
  });
  await t('전체로 돌아오면 같은 요청이라 네트워크 없이 기억에서 바로 그린다', async () => {
    await clear(A); const n0 = A.reqs.length;
    await act(A, { a: 'cat', v: '전체' });
    assert.ok(await waitFor(A, has(A, 'update')), 'update 없음');
    assert.strictEqual(A.reqs.length, n0, '다시 요청했다'); assert.strictEqual(places((await last(A, 'update')).a.json).length, 5);
  });
  await t('모르는 칩 이름은 무시한다', async () => {
    await clear(A); const n0 = A.reqs.length;
    await act(A, { a: 'cat', v: '해킹' }); await A.page.waitForTimeout(400);
    assert.strictEqual((await calls(A)).filter(c => c.m !== 'setRect').length, 0); assert.strictEqual(A.reqs.length, n0); assert.strictEqual(await A.page.evaluate(() => _foodCurFilter), '전체');
  });
  await t('새로고침(refresh) → 웹의 loadFoodTab(true) 를 부른다', async () => {
    await A.page.evaluate(() => { window.__lft.length = 0; });
    await act(A, { a: 'refresh' }); await A.page.waitForTimeout(150);
    assert.deepStrictEqual(await A.page.evaluate(() => window.__lft), [true]);
  });
  await t('가게 목록이 늘면(공공데이터 도착) 새 요청 → update(keepScroll 참: 같은 칩이라 위치 유지)', async () => {
    await clear(A); const n0 = A.reqs.length;
    await A.page.evaluate((P) => { _foodPublicData = _foodPublicData.concat([{ place_name: '새 공공 식당', category_name: '한식', road_address_name: '', distance: 1500 }]); _renderFoodList(); }, PUB);
    assert.ok(await waitFor(A, has(A, 'update')), 'update 없음');
    assert.ok(A.reqs.length === n0 + 1 && A.lastReq.p.length === 3);
    const u = (await last(A, 'update')).a; assert.strictEqual(u.keepScroll, true); assert.strictEqual(places(u.json).length, 6);
  });
  await t('상태가 바뀌면(불러오기 실패) 안내 문구 화면으로 바뀐다', async () => {
    await clear(A);
    await setData(A, { c: [], p: [], stn: '강남', st: 'ready', fail: true });
    assert.ok(await waitFor(A, has(A, 'update')), 'update 없음');
    const j = JSON.parse((await last(A, 'update')).a.json); assert.ok(/불러오지 못했어요/.test(j.body[0].s), JSON.stringify(j.body[0]));
    await setData(A, { c: CUR, p: PUB, stn: '강남', st: 'ready', fail: false }); await A.page.waitForTimeout(400);
  });
  await t('연달아 바뀌어도(80ms 안) 요청은 한 번만 간다', async () => {
    await clear(A); const n0 = A.reqs.length;
    await A.page.evaluate(() => { for (let i = 0; i < 6; i++) { _foodPublicData = _foodPublicData.concat([{ place_name: '연속' + i, category_name: '한식', road_address_name: '', distance: 2000 + i }]); _renderFoodList(); } });
    assert.ok(await waitFor(A, has(A, 'update')), 'update 없음'); await A.page.waitForTimeout(500);
    assert.strictEqual(A.reqs.length - n0, 1, '요청 ' + (A.reqs.length - n0));
  });

  console.log('[③-2 탭을 막 열 때 안내 문구가 깜빡 비치지 않는다]');
  await t('탭을 열고 450ms 안에 상태·목록이 놓이면 첫 화면이 곧바로 그 목록이다(경로 없음 안내를 먼저 그리지 않는다)', async () => {
    const x = await fresh({ plugin: true, on: true }); await openFood(x); await x.page.waitForTimeout(150); await setData(x, { c: CUR, p: PUB, stn: '강남' });
    assert.ok(await waitFor(x, has(x, 'show')), 'show 없음'); await x.page.waitForTimeout(700);
    assert.strictEqual((await calls(x, 'show')).length, 1); assert.strictEqual(places((await calls(x, 'show'))[0].a.json).length, 5, '첫 화면이 안내 문구였다');
    assert.ok(x.reqs.every(q => q.f.st !== 'idle'), '경로 없음 상태로 요청했다'); await x.ctx.close();
  });
  await t('끝내 아무 상태도 안 정해지면(경로 없음) 잠깐 뒤 안내 문구를 그린다', async () => {
    const x = await fresh({ plugin: true, on: true }); await openFood(x);
    assert.ok(await waitFor(x, has(x, 'show'), 4000), 'show 없음');
    assert.ok(/경로를 설정하면/.test(JSON.parse((await last(x, 'show')).a.json).body[0].s)); await x.ctx.close();
  });

  console.log('[④ 가게 → 지도 시트 · 덮임]');
  await t('가게(call fm.c.1) → 네이티브를 숨기고 웹 지도(_foodShowMap)를 그 가게로 시트에 연다 · 뒤로가기는 시트부터 닫고 네이티브가 이어받는다', async () => {
    await setData(A, { c: CUR, p: PUB, stn: '강남' }); await waitFor(A, anyPut(A), 4000); await A.page.waitForTimeout(400); await clear(A);
    await A.page.evaluate(() => { window.__maps.length = 0; });
    await act(A, { a: 'call', v: 'fm.c.1' });
    assert.ok(await waitFor(A, has(A, 'hide')), '네이티브를 숨기지 않았다');
    const s = await A.page.evaluate(() => ({ sheet: !!document.getElementById('scrfSheet'), card: document.querySelectorAll('#scrfSheet .food-card').length, maps: window.__maps.slice() }));
    assert.ok(s.sheet && s.card === 1 && s.maps.join() === '스타벅스 강남점', JSON.stringify(s));
    // 시트가 열려 있는 동안 목록이 바뀌어도 네이티브가 다시 올라오지 않는다
    await clear(A);
    await A.page.evaluate(() => { _foodPublicData = _foodPublicData.concat([{ place_name: '시트중', category_name: '한식', road_address_name: '', distance: 3000 }]); _renderFoodList(); });
    await A.page.waitForTimeout(900); assert.strictEqual((await calls(A, 'show')).length, 0, '시트 위로 올라왔다');
    assert.strictEqual(await A.page.evaluate(() => handleBackPress()), true);
    assert.strictEqual(await A.page.evaluate(() => !!document.getElementById('scrfSheet')), false);
    assert.ok(await waitFor(A, anyPut(A), 5000), '닫은 뒤 네이티브가 다시 올라오지 않았다');
    assert.ok(places((await last(A, 'show') || await last(A, 'update')).a.json).some(p => p.name === '시트중'), '시트 동안 바뀐 목록이 반영되지 않았다');
  });
  await t('공공데이터 가게(fm.p.0)도 연다 · 목록에 없는 번호·모르는 행동은 무시한다', async () => {
    await clear(A); await A.page.evaluate(() => { window.__maps.length = 0; });
    await act(A, { a: 'call', v: 'fm.p.0' }); await A.page.waitForTimeout(250);
    assert.strictEqual(await A.page.evaluate(() => window.__maps.join()), '공공 식당'); await A.page.evaluate(() => window._scrFood.closeSheet());
    await A.page.evaluate(() => { window.__maps.length = 0; });
    await act(A, { a: 'call', v: 'fm.c.99' }); await act(A, { a: 'call', v: 'rm_rf' }); await act(A, { a: 'web', v: 'cm' }); await act(A, { a: 'open', url: 'https://evil.example' }); await A.page.waitForTimeout(250);
    assert.strictEqual(await A.page.evaluate(() => window.__maps.length + (document.getElementById('scrfSheet') ? 1 : 0)), 0);
  });
  await t('하차 추천(_arrOpenPlace)의 openNamed: 받아 둔 목록에서 이름으로 찾아 시트를 연다 · 없으면 추천이 준 정보로', async () => {
    await clear(A); await A.page.evaluate(() => { window.__maps.length = 0; window._scrFood.openNamed('한우마을', {}); });
    await A.page.waitForTimeout(250); assert.strictEqual(await A.page.evaluate(() => window.__maps.join()), '한우마을');
    await A.page.evaluate(() => window._scrFood.closeSheet());
    await A.page.evaluate(() => { window.__maps.length = 0; window._scrFood.openNamed('없는 가게', { c: '카페', a: '서울 어딘가', d: 77 }); });
    assert.ok(await waitFor(A, async () => (await A.page.evaluate(() => window.__maps.length)) > 0, 6000), '없는 가게를 정보로 열지 못했다');
    assert.strictEqual(await A.page.evaluate(() => window.__maps.join()), '없는 가게'); await A.page.evaluate(() => window._scrFood.closeSheet());
  });
  await t('팝업이 덮으면 숨기고, 걷히면 다시 올린다', async () => {
    assert.ok(await waitFor(A, async () => (await st(A)).shown, 6000), '먼저 올라와 있어야 한다'); await clear(A);
    await A.page.evaluate(() => { const d = document.createElement('div'); d.id = 'cov'; d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;'; document.body.appendChild(d); });
    assert.ok(await waitFor(A, has(A, 'hide')), '숨기지 않았다');
    await A.page.evaluate(() => document.getElementById('cov').remove()); await clear(A);
    assert.ok(await waitFor(A, anyPut(A), 5000), '다시 올리지 않았다');
  });
  await t('맛집 탭을 떠나면 숨긴다', async () => {
    assert.ok(await waitFor(A, async () => (await st(A)).shown, 6000), '먼저 올라와 있어야 한다'); await clear(A); await A.page.evaluate(() => switchTab('home', document.getElementById('ni-home')));
    assert.ok(await waitFor(A, has(A, 'hide')), 'hide 없음');
    assert.deepStrictEqual(A.errs, []); await A.ctx.close();
  });

  console.log('[⑤ 저장본·폴백]');
  let CACHE = null;
  await t('같은 요청의 저장본이 있으면 느린 네트워크(5초)를 기다리지 않고 show — 새 응답이 오면 제자리 갱신', async () => {
    const x0 = await fresh({ plugin: true, on: true }); await openFood(x0); await setData(x0, { c: CUR, p: PUB, stn: '강남' }); await waitFor(x0, has(x0, 'show')); await emit(x0, 'ready', { id: 'food' }); await x0.page.waitForTimeout(200);
    CACHE = JSON.parse(await x0.page.evaluate(() => localStorage.getItem('gdm_scrf_c'))); assert.ok(CACHE.txt); await x0.ctx.close();
    const x = await fresh({ plugin: true, on: true, cache: CACHE, delay: 5000 });
    await x.page.evaluate(() => { _foodAllData = [{ place_name: '맛있는 국밥집' }]; });                    // 같은 데이터를 먼저 놓아 둔다(탭을 열기 전)
    await setData(x, { c: CUR, p: PUB, stn: '강남' });
    const t0 = Date.now(); await openFood(x);
    assert.ok(await waitFor(x, has(x, 'show'), 2500), '저장본으로 못 띄웠다'); assert.ok(Date.now() - t0 < 2500);
    assert.strictEqual((await last(x, 'show')).a.json, CACHE.txt);
    await x.ctx.close();
  });
  await t('요청이 다른 저장본(가게 목록이 다름)은 곧바로 쓰지 않고 엔진 응답을 기다린다', async () => {
    const x = await fresh({ plugin: true, on: true, cache: CACHE, delay: 1200 });
    await openFood(x); await setData(x, { c: CUR.slice(0, 2), p: [], stn: '강남' }); await x.page.waitForTimeout(700);
    assert.strictEqual((await calls(x, 'show')).length, 0, '틀린 저장본을 그렸다');
    assert.ok(await waitFor(x, has(x, 'show'), 6000), '엔진 응답으로 못 띄웠다'); assert.strictEqual(places((await last(x, 'show')).a.json).length, 2); await x.ctx.close();
  });
  await t('엔진 응답이 틀린 모양이고 저장본도 없으면: 그리지 않고 웹 맛집 화면으로(실패 기록)', async () => {
    const x = await fresh({ plugin: true, on: true, serve: 'shape' }); await openFood(x); await setData(x, { c: CUR, p: PUB, stn: '강남' }); await x.page.waitForTimeout(2500);
    assert.strictEqual((await calls(x, 'show')).length, 0); const s = await st(x); assert.ok(s.failed || s.fails >= 1, JSON.stringify(s));
    assert.ok(await x.page.evaluate(() => document.querySelectorAll('#foodList .food-card').length) >= 3, '웹 목록이 없다'); await x.ctx.close();
  });
  await t('엔진이 아예 안 되면 그리지 않는다(웹 화면 그대로) · 실패로 치지 않고 5초 뒤 다시 시도한다', async () => {
    const x = await fresh({ plugin: true, on: true, serve: 'down' }); await openFood(x); await setData(x, { c: CUR, p: PUB, stn: '강남' }); await x.page.waitForTimeout(1500);
    const s = await st(x); assert.ok(!s.shown && !s.failed && s.fails === 0, JSON.stringify(s)); assert.strictEqual((await calls(x, 'show')).length, 0);
    x.serve = 'ok'; assert.ok(await waitFor(x, has(x, 'show'), 9000), '다시 시도해 그리지 못했다'); await x.ctx.close();
  });
  await t('플러그인 오류(error 이벤트) → 웹으로 · 정리 · 카드에 사유 · 껐다 켜면 복구', async () => {
    const x = await fresh({ plugin: true, on: true }); await openFood(x); await setData(x, { c: CUR, p: PUB, stn: '강남' }); await waitFor(x, has(x, 'show'));
    await emit(x, 'error', { id: 'food', message: 'boom', kind: 'exception' }); await x.page.waitForTimeout(200);
    let s = await st(x); assert.ok(s.failed && s.fails === 1 && /boom/.test(s.why), JSON.stringify(s));
    assert.ok((await calls(x, 'destroy')).length >= 1, '네이티브 화면을 정리하지 않았다');
    const card = await x.page.evaluate(() => document.getElementById('scrfSetStat').textContent); assert.ok(/문제가 있어/.test(card) && /boom/.test(card), card);
    await x.page.evaluate(() => window._scrfSetUse(false)); await x.page.waitForTimeout(100);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scrf_on')), '0');
    await x.page.evaluate(() => window._scrfSetUse(true)); await x.page.waitForTimeout(100);
    s = await st(x); assert.ok(!s.failed && s.fails === 0, JSON.stringify(s)); await x.ctx.close();
  });
  await t('다른 화면 id 의 이벤트는 무시한다', async () => {
    const x = await fresh({ plugin: true, on: true }); await openFood(x); await setData(x, { c: CUR, p: PUB, stn: '강남' }); await waitFor(x, has(x, 'show'));
    await emit(x, 'error', { id: 'shop', message: 'x', kind: 'exception' }); await emit(x, 'action', { id: 'shop', a: 'cat', v: '카페' }); await x.page.waitForTimeout(300);
    const s = await st(x); assert.ok(!s.failed); assert.strictEqual(await x.page.evaluate(() => _foodCurFilter), '전체'); await x.ctx.close();
  });
  await t('설정 화면의 "네이티브 맛집 화면" 스위치를 끄면 네이티브가 걷히고 웹 맛집 목록이 다시 그려진다', async () => {
    const x = await fresh({ plugin: true, on: true }); await openFood(x); await setData(x, { c: CUR, p: PUB, stn: '강남' }); await waitFor(x, has(x, 'show')); await emit(x, 'ready', { id: 'food' }); await x.page.waitForTimeout(200);
    await clear(x); await x.page.evaluate(() => window._scrfSetUse(false));
    assert.ok(await waitFor(x, has(x, 'destroy')), '정리 안 됨');
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scrf_on')), '0'); assert.strictEqual(await x.page.evaluate(() => window._scrFood.owns()), false);
    await x.ctx.close();
  });

  await b.close();
  console.log(`\nscreen_food_js: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
