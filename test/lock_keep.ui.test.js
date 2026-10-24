// 확정 유지(2026-10-25) — 확정한 여정을 앱이 스스로 다시 찾다가(이탈·시각 어긋남·재동기화) 응답이 실패해도 확정·작은 화면 여정·오버레이가 풀리지 않는다.
// 사용자가 직접 새로 찾으면 예전처럼 풀린다. 재탐색이 성공하면 같은 유형으로 다시 확정된다.
// 헤드리스 Chromium + 가짜 시계 + 가짜 Capacitor 플러그인(LocalNotifications·Overlay·BackgroundGeolocation) + 모의 엔진.
// 실행: node test/journey_e2e.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const { resp } = require('./helpers/engine_fixture');
const { rideEta } = require(path.join(__dirname, '..', 'engine', 'ride-eta.js'));
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
const MID = new Date('2026-10-08T00:00:00+09:00').getTime();

async function newApp(b) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5547, longitude: 126.9726 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('gdm_loc_disclosed', '1'); localStorage.setItem('ovlOn', '1'); localStorage.setItem('bgPermGuided', '1'); } catch (e) {}
    window.__ln = []; window.__ovl = []; window.__ka = []; window.__bg = [];
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
      LocalNotifications: { schedule: (o) => { window.__ln.push(o.notifications[0]); return Promise.resolve(); }, checkPermissions: () => Promise.resolve({ display: 'granted' }), requestPermissions: () => Promise.resolve({ display: 'granted' }),
        createChannel: () => Promise.resolve(), registerActionTypes: () => Promise.resolve(), addListener: () => Promise.resolve({ remove() {} }), cancel: (o) => { window.__ln.push({ cancelled: o }); return Promise.resolve(); }, getPending: () => Promise.resolve({ notifications: [] }) },
      Overlay: { isAvailable: () => Promise.resolve({ granted: true, supported: true }), requestPermission: () => Promise.resolve({ granted: true }), update: (o) => { window.__ovl.push(o); return Promise.resolve(); }, keepAlive: (o) => { window.__ka.push(o); return Promise.resolve(); } },
      BackgroundGeolocation: { addWatcher: (o, cb) => { window.__bgcb = cb; window.__bg.push('add'); return Promise.resolve('w1'); }, removeWatcher: () => { window.__bg.push('remove'); return Promise.resolve(); }, openSettings: () => Promise.resolve() },
    } };
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => {
    const u = new URL(r.request().url()); if (u.protocol === 'file:' || u.protocol === 'data:') return r.continue();
    const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (/route-v2/.test(u.host)) {
      // ★ 2026-10-17: 도착 전 순서(op:'arrive')는 실제 엔진(engine/ride-eta.js)이 답한다 — 앱은 그 값만 그린다
      try { const bd = JSON.parse(r.request().postData() || '{}'); if (bd.op === 'arrive') return r.fulfill({ status: 200, headers: H, body: JSON.stringify(rideEta(bd)) }); } catch (e) {}
      if (globalThis.__fail) return r.fulfill({ status: 500, headers: H, body: '{}' });
      return r.fulfill({ status: 200, headers: H, body: JSON.stringify(resp()) });
    }
    return r.fulfill({ status: 200, headers: H, body: '{}' });
  });
  await page.clock.install({ time: new Date('2026-10-08T21:00:00+09:00') });
  await page.goto('file://' + html); await page.clock.runFor(3500);
  return { ctx, page, errs };
}
async function search(page) {
  await page.click('#fmapDestInp'); await page.fill('#fmapDestInp', '수원'); await page.clock.runFor(800);
  await page.click('#fmapDestSug > *:first-child'); await page.clock.runFor(500);
  await page.click('#fmapRouteBtn'); await page.clock.runFor(3500);
}
const pass_through = async (page, n) => {
  if (n.sched != null) await page.clock.setSystemTime(new Date(MID + n.sched * 60000));
  await page.evaluate(n => window.__bgcb({ latitude: n.lat, longitude: n.lng, accuracy: 10, speed: 12, time: Date.now() }), n);
  await page.clock.runFor(6000);
};


const st = (page) => page.evaluate(() => ({ locked: window._routeLocked, type: window._lockedRouteType, trip: !!window._pipTrip, relock: window._relockAfterReroute, snap: !!window._rrSnap, ovl: (window.__ovl[window.__ovl.length - 1] || {}).active, card: getComputedStyle(document.getElementById('transitResultCard')).display, err: getComputedStyle(document.getElementById('transitResultErr')).display }));
async function confirmed(b) { const a = await newApp(b); await search(a.page); await a.page.click('#mainConfirmRouteBtn'); await a.page.clock.runFor(2500); return a; }
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  for (const [name, fire] of [['이탈 재탐색', () => window._handleOffRoute()], ['시각 어긋남 재탐색', () => { window._etaResearchAt = 0; window._relockAfterReroute = window._lockedRouteType || 'fast'; fmapDoRoute(); }]]) {
    console.log('[' + name + ' 실패]');
    const { page, errs } = await confirmed(b);
    globalThis.__fail = true; await page.evaluate(fire);
    await t('재탐색 중에도 확정·여정이 풀리지 않는다', async () => { await page.clock.runFor(300); const s = await st(page); assert.strictEqual(s.locked, true); assert.ok(s.trip, JSON.stringify(s)); });
    await page.clock.runFor(20000);
    await t('응답이 실패해도 확정 · 작은 화면 여정 · 오버레이가 유지된다', async () => { const s = await st(page); assert.strictEqual(s.locked, true, JSON.stringify(s)); assert.strictEqual(s.type, 'fast'); assert.ok(s.trip); assert.strictEqual(s.ovl, true); });
    await t('기존 경로 카드가 되돌아오고 실패 안내는 걷힌다', async () => { const s = await st(page); assert.strictEqual(s.card, 'flex', JSON.stringify(s)); assert.strictEqual(s.err, 'none', JSON.stringify(s)); assert.strictEqual(s.snap, false); assert.strictEqual(s.relock, null); });
    await t('JS 오류가 없다', async () => assert.deepStrictEqual(errs, []));
    globalThis.__fail = false; await page.context().close();
  }
  console.log('[재탐색 성공]');
  { const { page } = await confirmed(b); await page.evaluate(() => window._handleOffRoute()); await page.clock.runFor(6000);
    await t('성공하면 같은 유형으로 다시 확정되고 보관본은 비워진다', async () => { const s = await st(page); assert.strictEqual(s.locked, true); assert.strictEqual(s.type, 'fast'); assert.ok(s.trip); assert.strictEqual(s.snap, false); assert.strictEqual(s.card, 'flex'); }); await page.context().close(); }
  console.log('[사용자가 직접 새로 찾기]');
  { const { page } = await confirmed(b); await page.evaluate(() => fmapDoRoute()); await page.clock.runFor(6000);
    await t('직접 새로 찾으면 예전처럼 확정이 풀린다(자동 재탐색만 보호)', async () => { const s = await st(page); assert.strictEqual(s.locked, false, JSON.stringify(s)); assert.strictEqual(s.snap, false); }); await page.context().close(); }
  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
