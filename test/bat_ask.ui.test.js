// 배터리 최적화 제외 안내 — 2026-10-13 (YJ: "앱 설치 시 배터리 최적화 제외 설정도 요청하면 되겠네")
//   · 위치 안내 [동의] 직후 · 앱을 켤 때 · 경로 확정 때, 제외가 안 돼 있으면 설명 안내를 띄운다
//   · [설정하기] 를 눌러야만 시스템 화면 요청 · [나중에] 는 7일 뒤 다시 · 이미 제외돼 있으면 안 띄운다 · 웹(플러그인 없음)에선 안 띄운다
// 실행: node test/bat_ask.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 300)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // opt: { plugin: bool, ignoring: bool, disclosed: bool, askedAt: ms|null }
  async function fresh(opt) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    await page.addInitScript((o) => {
      try { if (o.disclosed) localStorage.setItem('gdm_loc_disclosed', '1'); if (o.askedAt) localStorage.setItem('gdm_bat_asked_at', String(o.askedAt)); } catch (e) {}
      window.__batReq = 0;
      if (o.plugin) {
        window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
        window.Capacitor.Plugins.Power = {
          isIgnoringOptimizations: () => Promise.resolve({ ignoring: !!o.ignoring }),
          requestIgnoreOptimizations: () => { window.__batReq++; return Promise.resolve({ ok: true, already: false }); }
        };
      }
    }, opt);
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.clock.install({ time: new Date('2026-10-13T09:00:00+09:00') });
    await page.goto('file://' + html);
    return { ctx, page, errs };
  }
  const shown = (x) => x.page.evaluate(() => !!document.getElementById('batAskOv'));

  await t('위치 동의를 마친 사용자가 앱을 켜면 5초쯤 뒤 안내가 뜬다(제외 안 된 기기)', async () => {
    const x = await fresh({ plugin: true, ignoring: false, disclosed: true });
    await x.page.clock.runFor(2000); assert.strictEqual(await shown(x), false, '곧바로 뜨면 안 된다');
    await x.page.clock.runFor(5000);
    assert.strictEqual(await shown(x), true, '안내가 떠야 한다');
    const txt = await x.page.evaluate(() => document.getElementById('batAskOv').innerText);
    assert(/배터리 최적화/.test(txt) && /설정하기/.test(txt) && /나중에/.test(txt), txt);
    assert.strictEqual(await x.page.evaluate(() => window.__batReq), 0, '버튼을 누르기 전엔 시스템 화면을 요청하지 않는다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('[설정하기]를 누르면 그때 시스템 요청을 한다', async () => {
    const x = await fresh({ plugin: true, ignoring: false, disclosed: true });
    await x.page.clock.runFor(7000);
    await x.page.evaluate(() => document.getElementById('batAskOk').click());
    await x.page.clock.runFor(200);
    assert.strictEqual(await x.page.evaluate(() => window.__batReq), 1);
    assert.strictEqual(await shown(x), false, '안내가 닫힌다'); await x.ctx.close();
  });

  await t('[나중에]는 요청 없이 닫고, 7일 안에는 다시 묻지 않는다', async () => {
    const x = await fresh({ plugin: true, ignoring: false, disclosed: true });
    await x.page.clock.runFor(7000);
    await x.page.evaluate(() => document.getElementById('batAskNo').click());
    assert.strictEqual(await x.page.evaluate(() => window.__batReq), 0);
    assert.strictEqual(await shown(x), false);
    await x.page.evaluate(() => window._batAsk('journey')); await x.page.clock.runFor(500);
    assert.strictEqual(await shown(x), false, '바로 다시 뜨면 안 된다'); await x.ctx.close();
  });

  await t('7일이 지난 뒤에는 다시 묻는다', async () => {
    const x = await fresh({ plugin: true, ignoring: false, disclosed: true, askedAt: new Date('2026-10-05T09:00:00+09:00').getTime() });
    await x.page.clock.runFor(7000);
    assert.strictEqual(await shown(x), true); await x.ctx.close();
  });

  await t('이미 제외돼 있으면 띄우지 않는다', async () => {
    const x = await fresh({ plugin: true, ignoring: true, disclosed: true });
    await x.page.clock.runFor(8000);
    assert.strictEqual(await shown(x), false); await x.ctx.close();
  });

  await t('웹(네이티브 플러그인 없음)에서는 띄우지 않는다', async () => {
    const x = await fresh({ plugin: false, disclosed: true });
    await x.page.clock.runFor(8000);
    assert.strictEqual(await shown(x), false); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('위치 안내가 떠 있는 동안에는 겹쳐 띄우지 않고, [동의] 직후에 띄운다', async () => {
    const x = await fresh({ plugin: true, ignoring: false, disclosed: false });
    await x.page.clock.runFor(1500);
    await x.page.evaluate(() => { try { navigator.geolocation.getCurrentPosition(function () {}, function () {}); } catch (e) {} });
    await x.page.clock.runFor(6000);
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('locDiscOv')), true, '위치 안내가 떠 있다');
    assert.strictEqual(await shown(x), false, '겹치면 안 된다');
    await x.page.evaluate(() => document.getElementById('locDiscOk').click());
    await x.page.clock.runFor(1500);
    assert.strictEqual(await shown(x), true, '동의 직후 배터리 안내'); await x.ctx.close();
  });

  await b.close();
  console.log(`\nbat_ask: ${pass} pass ${fail} fail`); process.exit(fail ? 1 : 0);
})();
