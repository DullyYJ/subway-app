// 처음 설치 때 '다른 앱 위에 표시' 설정창 안내 — 2026-10-14 (YJ: "처음 앱 설치시 다른앱 위에 표시하는 설정창도 들어갈 수 있게")
//   · 위치 안내 → 배터리 안내가 끝난 뒤 · [설정하기] 를 눌러야만 시스템 화면 요청 · 평생 한 번 · 이미 허용/웹/미지원이면 안 띄움
// 실행: node test/ovl_ask.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 300)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // opt: { ovl: bool, granted: bool, supported: false, disclosed: bool, power: 'none'|'needs'|'ignoring', askedAt }
  async function fresh(opt) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    await page.addInitScript((o) => {
      try { if (o.disclosed) localStorage.setItem('gdm_loc_disclosed', '1'); if (o.askedAt) localStorage.setItem('gdm_ovl_asked_at', String(o.askedAt)); localStorage.setItem('bgPermGuided', '1'); } catch (e) {}
      window.__ovlReq = 0; window.__batReq = 0;
      window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
      if (o.ovl) {
        const base = {
          isAvailable: () => Promise.resolve({ supported: o.supported !== false, granted: !!o.granted, shown: false }),
          requestPermission: () => { window.__ovlReq++; return Promise.resolve({ ok: true, granted: false }); }
        };
        window.Capacitor.Plugins.Overlay = new Proxy(base, { get: (t, k) => (k in t) ? t[k] : (k === 'then' ? undefined : () => Promise.resolve({})) });
      }
      if (o.power && o.power !== 'none') {
        window.Capacitor.Plugins.Power = {
          isIgnoringOptimizations: () => Promise.resolve({ ignoring: o.power === 'ignoring' }),
          requestIgnoreOptimizations: () => { window.__batReq++; return Promise.resolve({ ok: true, already: false }); }
        };
      }
    }, opt);
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.clock.install({ time: new Date('2026-10-14T09:00:00+09:00') });
    await page.goto('file://' + html);
    return { ctx, page, errs };
  }
  const shown = (x) => x.page.evaluate(() => !!document.getElementById('ovlAskOv'));
  const run = async (x, ms) => { for (let i = 0; i < ms / 500; i++) await x.page.clock.runFor(500); };

  await t('처음 설치(위치 동의 뒤, 권한 없음): 잠시 뒤 안내가 뜨고, 버튼을 누르기 전엔 시스템 화면을 요청하지 않는다', async () => {
    const x = await fresh({ ovl: true, disclosed: true });
    await run(x, 1500); assert.strictEqual(await shown(x), false, '켜자마자 뜨면 안 된다');
    await run(x, 7000); assert.strictEqual(await shown(x), true, '안내가 떠야 한다');
    const txt = await x.page.evaluate(() => document.getElementById('ovlAskOv').innerText);
    assert(/다른 앱 위에 표시/.test(txt) && /설정하기/.test(txt) && /나중에/.test(txt) && /광고는 넣지 않아요/.test(txt), txt);
    assert.strictEqual(await x.page.evaluate(() => window.__ovlReq), 0);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('[설정하기]: 시스템 설정 화면을 한 번 요청하고 오버레이를 켠 것으로 기록 · 다시 묻지 않는다', async () => {
    const x = await fresh({ ovl: true, disclosed: true });
    await run(x, 9000);
    await x.page.evaluate(() => document.getElementById('ovlAskOk').click()); await run(x, 500);
    assert.strictEqual(await x.page.evaluate(() => window.__ovlReq), 1);
    assert.strictEqual(await shown(x), false, '닫힌다');
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('ovlOn')), '1');
    await run(x, 8000); assert.strictEqual(await shown(x), false, '다시 뜨지 않는다');
    await x.page.evaluate(() => window._ovlAsk('again')); await run(x, 500); assert.strictEqual(await shown(x), false);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('[나중에]: 요청 없이 닫고 오버레이는 꺼진 채 · 다시 묻지 않는다(설정 탭 카드에서 켠다)', async () => {
    const x = await fresh({ ovl: true, disclosed: true });
    await run(x, 9000);
    await x.page.evaluate(() => document.getElementById('ovlAskNo').click()); await run(x, 500);
    assert.strictEqual(await x.page.evaluate(() => window.__ovlReq), 0);
    assert.notStrictEqual(await x.page.evaluate(() => localStorage.getItem('ovlOn')), '1');
    await run(x, 8000); assert.strictEqual(await shown(x), false); await x.ctx.close();
  });
  await t('이미 물은 적이 있으면(평생 한 번) 며칠이 지나도 안 띄운다', async () => {
    const x = await fresh({ ovl: true, disclosed: true, askedAt: new Date('2026-09-01T09:00:00+09:00').getTime() });
    await run(x, 10000); assert.strictEqual(await shown(x), false); await x.ctx.close();
  });
  await t('이미 허용돼 있으면 안 띄운다', async () => {
    const x = await fresh({ ovl: true, granted: true, disclosed: true });
    await run(x, 10000); assert.strictEqual(await shown(x), false); await x.ctx.close();
  });
  await t('웹(플러그인 없음)·안드로이드 8 미만(미지원)에서는 안 띄운다', async () => {
    let x = await fresh({ ovl: false, disclosed: true }); await run(x, 10000); assert.strictEqual(await shown(x), false); await x.ctx.close();
    x = await fresh({ ovl: true, supported: false, disclosed: true }); await run(x, 10000); assert.strictEqual(await shown(x), false); await x.ctx.close();
  });
  await t('위치 안내에 아직 답하지 않았으면 안 띄운다(위치 안내가 먼저)', async () => {
    const x = await fresh({ ovl: true, disclosed: false });
    await run(x, 10000); assert.strictEqual(await shown(x), false); await x.ctx.close();
  });
  await t('순서: 배터리 안내가 떠 있는 동안은 기다렸다가, 그 안내가 끝나면 이어서 뜬다(겹치지 않는다)', async () => {
    const x = await fresh({ ovl: true, disclosed: true, power: 'needs' });
    await run(x, 8000);
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('batAskOv')), true, '배터리 안내가 먼저');
    assert.strictEqual(await shown(x), false, '겹쳐 뜨지 않는다');
    await x.page.evaluate(() => document.getElementById('batAskNo').click());
    await run(x, 8000);
    assert.strictEqual(await shown(x), true, '배터리 안내가 끝나면 이어서');
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('batAskOv')), false);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('배터리가 이미 제외돼 있는 기기도 정상 — 배터리 안내 없이 이 안내만 뜬다', async () => {
    const x = await fresh({ ovl: true, disclosed: true, power: 'ignoring' });
    await run(x, 9000); assert.strictEqual(await shown(x), true); await x.ctx.close();
  });

  await b.close();
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
