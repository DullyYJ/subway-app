// 서버 구동 네이티브 결과 카드 윗부분 ↔ 앱(JS) 연결 시험 — 2026-10-20 (s71)
//   원칙: "계산은 엔진이, 그림은 앱이". 가짜 ScreenNative 플러그인 + 가짜 엔진(POST /screen/rhead → engine/rhead.js 의 실제 출력)으로 확인한다:
//   · 플러그인이 없거나 꺼져 있거나 옛 APK(status 에 cap 10 없음)면 호출·요청이 하나도 없다 · 웹 카드가 그대로
//   · 켜면: 머리줄(id rhead, part h)과 경로 탭(id rtabs, part t)을 따로 요청한다 · 사실만 보낸다(cap=10) · 엔진 JSON 을 그대로 넘긴다
//   · 사각형은 #trHeadWrap / #routeOptionTabs · 웹 줄 속은 감춘다(자리는 그대로) · 'size' 이벤트로 감싸개 높이를 따른다
//   · 행동: rh.fav → _openFavPopup · rh.close → closeTransitResult · rh.tab.<종류> → selectRouteOption · 허용 목록 밖 무시
//   · 폴백: 엔진이 죽으면 웹 카드 · 스위치 켜고 끄기
// 실행: node test/screen_rhead_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const ER = require('../engine/rhead');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 700)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh(opt) {
    opt = opt || {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const x = { ctx, page, errs, reqs: [], serve: opt.serve || 'ok' };
    await page.route('**/*', async r => {
      const u = new URL(r.request().url()), req = r.request();
      if (u.protocol === 'file:') return r.continue();
      if (u.pathname === '/screen/rhead' && u.hostname.indexOf('route-v2') >= 0) {
        assert.strictEqual(req.method(), 'POST'); assert.ok(/text\/plain/.test(req.headers()['content-type'] || ''), '사전 요청이 필요한 형식으로 보냈다');
        const body = JSON.parse(req.postData() || '{}'); x.reqs.push(body);
        if (x.serve === 'down') return r.abort();
        const out = JSON.stringify(ER.rheadScreen({ cap: Number(body.cap) || 0, part: body.part }, body.f));
        return r.fulfill({ status: 200, contentType: 'application/json', body: out });
      }
      return r.abort();
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try { localStorage.setItem('locDisc', '1'); if (o.on) { localStorage.setItem('gdm_scrr_on', '1'); localStorage.setItem('gdm_scrr2_on', '1'); } } catch (e) {}
      window.__sn = []; window.__snL = {};
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const put = (m) => (a) => { window.__sn.push({ m, a: JSON.parse(JSON.stringify(a)) }); if (a.json != null) { try { const j = JSON.parse(a.json); if (j.v !== 1 || !Array.isArray(j.body)) throw 0; } catch (e) { return Promise.reject(new Error('invalid: 규격')); } } return Promise.resolve(); };
        const rec = (m) => (a) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { ScreenNative: {
          show: put('show'), update: put('update'), setRect: rec('setRect'), hide: rec('hide'), destroy: rec('destroy'), toast: rec('toast'), setField: rec('setField'),
          status: () => Promise.resolve(o.oldApk ? { visible: true, items: 4, age: 20, scroll: 0, cap: 9 } : { visible: true, items: 11, age: 20, scroll: 0, cap: 10 }),
          addListener: (n, f) => { (window.__snL[n] = window.__snL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.goto('file://' + html); await page.waitForTimeout(2200);
    await page.addStyleTag({ content: '#locDiscOv{display:none !important}' });
    await page.evaluate(() => { const ov = document.getElementById('locDiscOv'); if (ov) ov.remove(); });
    await page.evaluate(() => {
      window.__called = [];
      window._openFavPopup = function () { window.__called.push('fav'); };
      const sel = window.selectRouteOption; window.selectRouteOption = function (t) { window.__called.push('tab:' + t); };
      window.closeTransitResult = function () { window.__called.push('close'); const c = document.getElementById('transitResultCard'); if (c) c.style.display = 'none'; };
    });
    return x;
  }
  const calls = (x, m) => x.page.evaluate((m) => window.__sn.filter(c => !m || c.m === m), m || null);
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__snEmit(n, d), [n, d || {}]);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await x.page.waitForTimeout(60); } return false; };
  const puts = async (x, id) => (await calls(x)).filter(c => (c.m === 'show' || c.m === 'update') && c.a.id === id);
  const lastJ = async (x, id) => { const p = await puts(x, id); return p.length ? p[p.length - 1].a.json : ''; };
  const act = (x, id, d) => emit(x, 'action', Object.assign({ id }, d));
  const nodes = (j) => { const o = []; (function f(a) { a.forEach(n => { o.push(n); if (n.kids) f(n.kids); }); })(JSON.parse(j).body); return o; };
  const drawCard = (x) => x.page.evaluate(() => {
    const stn = (n, i) => ({ stationName: n, x: 126.7 + i * 0.01, y: 37.4 + i * 0.01 });
    const p = { info: { totalTime: 54, transferCount: 0, pathType: 1, tab: 'fast' }, subPath: [
      { trafficType: 3, sectionTime: 3, startSec: 0, endSec: 180, lane: [{ name: '도보' }], startName: '내 위치', endName: '부평' },
      { trafficType: 1, sectionTime: 49, startSec: 180, endSec: 3120, lane: [{ name: '1호선' }], startName: '부평', endName: '두정', passStopList: { stations: [stn('부평', 0), stn('신도림', 1), stn('두정', 2)] } },
      { trafficType: 3, sectionTime: 2, startSec: 3120, endSec: 3240, lane: [{ name: '도보' }], startName: '두정', endName: '도착지' }] };
    const rt = _convertSinglePathToRoute(p);
    switchTab('home', document.getElementById('ni-home'));
    _renderTransitResultCard({ routes: [rt] }, { name: '부평역', lat: 37.49, lng: 126.72 }, { name: '두정역', lat: 36.83, lng: 127.14 }, 'engine');
    const c = document.getElementById('transitResultCard'); c.style.display = 'flex';
    return { ok: !!document.getElementById('trHeadWrap') && !!document.getElementById('routeOptionTabs'), m: (document.getElementById('transitResultMinNum') || {}).textContent };
  });
  const own = (x, id) => x.page.evaluate((id) => document.getElementById(id).classList.contains('rh-own'), id);

  console.log('[① 플러그인이 없거나 꺼져 있거나 옛 APK 면 예전 그대로]');
  await t('플러그인이 없으면(웹): 요청·호출 없음 · 설정 카드 숨김 · 웹 카드가 그대로', async () => {
    const x = await fresh({ plugin: false, on: true }); const d = await drawCard(x); assert.ok(d.ok, JSON.stringify(d)); await x.page.waitForTimeout(1200);
    assert.strictEqual(x.reqs.length, 0); assert.strictEqual(await x.page.evaluate(() => getComputedStyle(document.getElementById('scrrSetCard')).display), 'none');
    assert.strictEqual(await own(x, 'trHeadWrap'), false); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('꺼져 있으면(기본) 호출·요청 없음 · 카드는 보이고 스위치는 꺼짐', async () => {
    const x = await fresh({ plugin: true, on: false }); await drawCard(x); await x.page.waitForTimeout(1200);
    assert.strictEqual((await calls(x)).length, 0); assert.strictEqual(x.reqs.length, 0);
    const c = await x.page.evaluate(() => ({ d: getComputedStyle(document.getElementById('scrrSetCard')).display, on: document.getElementById('scrrSetOn').checked, s: document.getElementById('scrrSetStat').textContent }));
    assert.strictEqual(c.d, 'block'); assert.strictEqual(c.on, false); assert.ok(/꺼짐/.test(c.s), c.s); await x.ctx.close();
  });
  await t('옛 APK(status 의 cap 이 10 미만)면 켜져 있어도 요청·그리기 없음 — 웹 카드가 그대로', async () => {
    const x = await fresh({ plugin: true, on: true, oldApk: true }); await drawCard(x); await x.page.waitForTimeout(1800);
    assert.strictEqual(x.reqs.length, 0); assert.strictEqual((await puts(x, 'rhead')).length + (await puts(x, 'rtabs')).length, 0);
    assert.strictEqual(await own(x, 'trHeadWrap'), false); assert.strictEqual(await own(x, 'routeOptionTabs'), false); await x.ctx.close();
  });

  console.log('[② 켜면: 사실을 보내고 엔진 JSON 을 그대로 넘긴다]');
  const A = await fresh({ plugin: true, on: true });
  await t('결과 카드가 그려지면 머리줄(part h)·탭(part t)을 cap=10 과 사실로 요청하고 받은 글을 그대로 show', async () => {
    const d = await drawCard(A); assert.ok(d.ok);
    assert.ok(await waitFor(A, async () => (await puts(A, 'rhead')).length >= 1 && (await puts(A, 'rtabs')).length >= 1), 'show 가 없다: ' + JSON.stringify(A.reqs).slice(0, 300));
    const h = A.reqs.find(q => q.part === 'h'), tb = A.reqs.find(q => q.part === 't');
    assert.ok(h && tb); assert.strictEqual(h.cap, 10); assert.strictEqual(h.f.m, Number(d.m)); assert.strictEqual(h.f.a, '부평역'); assert.strictEqual(h.f.b, '두정역'); assert.strictEqual(tb.f.tab, 'fast');
    const jh = await lastJ(A, 'rhead'); const nh = nodes(jh); const rhd = nh.find(n => n.t === 'rhd');
    assert.ok(rhd && rhd.num === String(d.m) && /부평/.test(rhd.s) && /두정/.test(rhd.s), JSON.stringify(rhd));
    assert.ok(!nh.some(n => /[\u{1F300}-\u{1FAFF}]/u.test(JSON.stringify(n))), '이모지');
    const jt = await lastJ(A, 'rtabs'); const tabs = nodes(jt).filter(n => n.act && /^rh\.tab\./.test(n.act.v)); assert.ok(tabs.length >= 4, JSON.stringify(tabs.map(n => n.s)));
  });
  await t('웹 줄 속은 감추고(자리는 그대로) 사각형은 #trHeadWrap / #routeOptionTabs', async () => {
    assert.ok(await waitFor(A, async () => (await own(A, 'trHeadWrap')) && (await own(A, 'routeOptionTabs')), 6000), 'rh-own 이 안 붙었다');
    const bx = await A.page.evaluate(() => { const r = document.getElementById('trHeadWrap').getBoundingClientRect(); const e = document.getElementById('transitResultMinNum'); return { x: r.left, w: r.width, vis: getComputedStyle(e).visibility }; });
    const sr = (await puts(A, 'rhead'))[0].a; assert.ok(Math.abs(sr.x - bx.x) < 1.5 && Math.abs(sr.w - bx.w) < 1.5, JSON.stringify([sr, bx])); assert.strictEqual(bx.vis, 'hidden');
  });
  await t("'size' 이벤트: 감싸개 높이가 네이티브 내용 높이를 따른다", async () => {
    await emit(A, 'size', { id: 'rhead', h: 120 }); await emit(A, 'size', { id: 'rtabs', h: 40 }); await A.page.waitForTimeout(150);
    const h = await A.page.evaluate(() => ({ a: document.getElementById('trHeadWrap').offsetHeight, b: document.getElementById('routeOptionTabs').offsetHeight }));
    assert.strictEqual(h.a, 120); assert.strictEqual(h.b, 40);
  });
  await t('ready 가 오면 정상(실패 0) · 카드 문구 = 켜짐', async () => {
    await emit(A, 'ready', { id: 'rhead' }); await emit(A, 'ready', { id: 'rtabs' }); await A.page.waitForTimeout(200);
    const c = await A.page.evaluate(() => ({ on: document.getElementById('scrrSetOn').checked, s: document.getElementById('scrrSetStat').textContent, f: window._scrRhead.S.failed }));
    assert.strictEqual(c.on, true); assert.ok(/^켜짐/.test(c.s), c.s); assert.strictEqual(c.f, false);
  });

  console.log('[③ 행동]');
  await t('탭을 누르면(rh.tab.sub) 예전 selectRouteOption(sub) 이 불린다 · 허용 목록 밖은 무시', async () => {
    await A.page.evaluate(() => { window.__called.length = 0; });
    await act(A, 'rtabs', { a: 'call', v: 'rh.tab.sub' }); await act(A, 'rtabs', { a: 'call', v: 'rh.tab.evil' }); await act(A, 'rtabs', { a: 'call', v: 'rh.x' }); await act(A, 'rtabs', { a: 'go', v: 'rh.tab.bus' });
    await A.page.waitForTimeout(200); assert.deepStrictEqual(await A.page.evaluate(() => window.__called), ['tab:sub']);
  });
  await t('즐겨찾기(rh.fav) → _openFavPopup', async () => {
    await A.page.evaluate(() => { window.__called.length = 0; }); await act(A, 'rhead', { a: 'call', v: 'rh.fav' }); await A.page.waitForTimeout(150);
    assert.deepStrictEqual(await A.page.evaluate(() => window.__called), ['fav']);
  });
  await t('경로 없는 탭이면 머리줄이 안내 글로 바뀐다(엔진이 정한 글)', async () => {
    const n0 = (await puts(A, 'rhead')).length;
    await A.page.evaluate(() => { _showTabNoRoute('bus'); });
    assert.ok(await waitFor(A, async () => (await puts(A, 'rhead')).length > n0 && nodes(await lastJ(A, 'rhead')).some(n => /버스만으로 갈 수 있는 경로가 없어요/.test(n.name || n.msg || ''))), JSON.stringify(nodes(await lastJ(A, 'rhead'))).slice(0, 300));
  });
  await t('닫기(rh.close) → closeTransitResult · 카드가 닫히면 네이티브를 걷고 웹 줄 속을 되돌린다', async () => {
    await A.page.evaluate(() => { window.__called.length = 0; }); await act(A, 'rhead', { a: 'call', v: 'rh.close' });
    assert.ok(await waitFor(A, async () => (await calls(A, 'hide')).length >= 1, 8000), '걷지 않았다');
    assert.deepStrictEqual(await A.page.evaluate(() => window.__called), ['close']); assert.strictEqual(await own(A, 'trHeadWrap'), false);
    assert.deepStrictEqual(A.errs, []); await A.ctx.close();
  });

  console.log('[④ 폴백·스위치]');
  await t('엔진이 죽으면 웹 카드 · 실패 표시', async () => {
    const x = await fresh({ plugin: true, on: true, serve: 'down' }); await drawCard(x);
    assert.ok(await waitFor(x, async () => x.reqs.length >= 1, 8000)); await x.page.waitForTimeout(1500);
    assert.strictEqual(await own(x, 'trHeadWrap'), false); assert.strictEqual((await puts(x, 'rhead')).length, 0); await x.ctx.close();
  });
  await t('스위치를 끄면 걷고 웹 카드 · 다시 켜면 그린다', async () => {
    const x = await fresh({ plugin: true, on: true }); await drawCard(x);
    assert.ok(await waitFor(x, async () => (await puts(x, 'rhead')).length >= 1));
    await x.page.evaluate(() => window._scrrSetUse(false)); await x.page.waitForTimeout(200);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scrr_on')), '0'); assert.strictEqual(await own(x, 'trHeadWrap'), false);
    const n = (await puts(x, 'rhead')).length;
    await x.page.evaluate(() => window._scrrSetUse(true)); assert.ok(await waitFor(x, async () => (await puts(x, 'rhead')).length > n, 8000)); await x.ctx.close();
  });

  await b.close();
  console.log(fail ? ('FAIL ' + fail + ' / ' + (pass + fail)) : ('ALL OK ' + pass)); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
