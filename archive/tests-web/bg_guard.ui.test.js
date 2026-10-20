// 백그라운드 위치 서비스 되살리기 — 2026-10-13 (YJ: "서비스가 끊기면 30초마다? 텀이 너무 길다 — 4.5초로")
//   네이티브 틱이 서비스 상태(1 있음 · 0 없음 · -1 모름)를 넘기면, 없을 때 웹의 켜짐 표시와 무관하게 4.5초 간격으로 다시 켠다.
// 실행: node test/bg_guard.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 300)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh() {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    await page.addInitScript(() => {
      try { localStorage.setItem('gdm_loc_disclosed', '1'); localStorage.setItem('gdm_bat_asked_at', '1'); } catch (e) {}
      window.__adds = 0;
      window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
      window.Capacitor.Plugins.BackgroundGeolocation = {
        addWatcher: () => { window.__adds++; return Promise.resolve('w' + window.__adds); },
        removeWatcher: () => Promise.resolve()
      };
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.clock.install({ time: new Date('2026-10-13T09:00:00+09:00') });
    await page.goto('file://' + html); await page.clock.runFor(1500);
    // 여정 확정 + 서비스 켜짐 상태
    await page.evaluate(() => { window._routeLocked = true; S.boarded = true; _startBgGeolocation(); });
    await page.clock.runFor(300);
    return { ctx, page, errs };
  }
  const adds = (x) => x.page.evaluate(() => window.__adds);
  const tick = (x, s) => x.page.evaluate((s) => window._ovlNativeTick(s), s);

  await t('서비스가 살아 있다고(1) 하면 다시 켜지 않는다', async () => {
    const x = await fresh(); const a0 = await adds(x);
    for (let i = 0; i < 4; i++) { await tick(x, 1); await x.page.clock.runFor(5000); }
    assert.strictEqual(await adds(x), a0); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('서비스가 없다(0)고 하면 웹의 켜짐 표시가 true 여도 바로 다시 켠다', async () => {
    const x = await fresh(); const a0 = await adds(x);
    assert.strictEqual(await x.page.evaluate(() => _bgGeoActive), true, '전제: 웹 표시는 켜짐');
    await x.page.clock.runFor(5000);   // 시작 직후 재시도 간격(4.5초)을 지난 뒤
    await tick(x, 0); await x.page.clock.runFor(100);
    assert.strictEqual(await adds(x), a0 + 1, '한 번 되살림'); await x.ctx.close();
  });

  await t('되살리는 간격은 4.5초다(그 안에는 한 번만, 5초 뒤엔 또)', async () => {
    const x = await fresh(); await x.page.clock.runFor(5000); const a0 = await adds(x);
    await tick(x, 0); await x.page.clock.runFor(100);
    await tick(x, 0); await x.page.clock.runFor(100);
    assert.strictEqual(await adds(x), a0 + 1, '4.5초 안에는 한 번');
    await x.page.clock.runFor(4600); await tick(x, 0); await x.page.clock.runFor(100);
    assert.strictEqual(await adds(x), a0 + 2, '4.5초 뒤 또 한 번'); await x.ctx.close();
  });

  await t('연달아 5번 되살려도 안 살면 30초 간격으로 물러난다 · 살아나면(1) 다시 4.5초', async () => {
    const x = await fresh(); await x.page.clock.runFor(5000); const a0 = await adds(x);
    for (let i = 0; i < 5; i++) { await tick(x, 0); await x.page.clock.runFor(4700); }
    assert.strictEqual(await adds(x), a0 + 5);
    await tick(x, 0); await x.page.clock.runFor(100); assert.strictEqual(await adds(x), a0 + 5, '물러남: 5초 뒤에도 안 켠다');
    await x.page.clock.runFor(30000); await tick(x, 0); await x.page.clock.runFor(100);
    assert.strictEqual(await adds(x), a0 + 6, '30초 뒤엔 다시 시도');
    await tick(x, 1); await x.page.clock.runFor(5000); await tick(x, 0); await x.page.clock.runFor(100);
    assert.strictEqual(await adds(x), a0 + 7, '살아난 뒤 끊기면 다시 4.5초 간격'); await x.ctx.close();
  });

  await t('모름(-1)이면 되살리지 않고, 여정이 아니면(경로 확정 전) 되살리지 않는다', async () => {
    const x = await fresh(); await x.page.clock.runFor(5000); const a0 = await adds(x);
    await tick(x, -1); await x.page.clock.runFor(100); assert.strictEqual(await adds(x), a0);
    await x.page.evaluate(() => { window._routeLocked = false; });
    await x.page.clock.runFor(5000); await tick(x, 0); await x.page.clock.runFor(100);
    assert.strictEqual(await adds(x), a0, '여정 아님'); await x.ctx.close();
  });

  await b.close();
  console.log(`\nbg_guard: ${pass} pass ${fail} fail`); process.exit(fail ? 1 : 0);
})();
