// 갤럭시(삼성) '자동 절전 제외' 안내 — 2026-10-14 (YJ: "이앱은 대부분 갤럭시에서 구동될거야")
//   · 삼성 기기에서만, 평생 한 번, [설정하기]를 눌러야만 삼성 목록 화면을 연다(자동 이동 없음)
//   · 배터리 최적화 안내와 겹치지 않고 이어진다: [나중에] 직후 / 시스템 화면에서 돌아온 직후
//   · 설정 탭 카드는 삼성에서만 보이고, 앱 배터리가 '제한됨'이면 경고가 켜진다
//   · 계산은 없다: 삼성 여부·상태는 네이티브가 알려 주고 앱은 그리기만 한다
// 실행: node test/sam_ask.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 300)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // opt: { plugin, samsung, ignoring, disclosed, batAsked, samAsked, bgRestricted, target }
  async function fresh(opt) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    await page.addInitScript((o) => {
      try {
        if (o.disclosed) localStorage.setItem('gdm_loc_disclosed', '1');
        if (o.batAsked) localStorage.setItem('gdm_bat_asked_at', String(Date.now() - 86400000));
        if (o.samAsked) localStorage.setItem('gdm_sam_asked_at', String(Date.now() - 86400000));
      } catch (e) {}
      window.__batReq = 0; window.__samOpen = 0; window.__appCb = null;
      if (o.plugin) {
        window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
        window.Capacitor.Plugins.Power = {
          isIgnoringOptimizations: () => Promise.resolve({ ignoring: !!o.ignoring }),
          requestIgnoreOptimizations: () => { window.__batReq++; return Promise.resolve({ ok: true, already: false }); },
          deviceInfo: () => Promise.resolve({ manufacturer: o.samsung ? 'samsung' : 'Google', model: 'X', sdk: 34, samsung: !!o.samsung }),
          backgroundStatus: () => Promise.resolve({ bgRestricted: !!o.bgRestricted, standbyBucket: 2, ignoring: !!o.ignoring }),
          openAutoSleepSettings: () => { window.__samOpen++; return Promise.resolve({ ok: true, target: o.target || 'samsung_never_sleeping' }); }
        };
        window.Capacitor.Plugins.App = { addListener: (ev, cb) => { if (ev === 'appStateChange') window.__appCb = cb; return Promise.resolve({ remove() {} }); } };
      }
    }, opt);
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.clock.install({ time: new Date('2026-10-14T09:00:00+09:00') });
    await page.goto('file://' + html);
    return { ctx, page, errs };
  }
  const has = (x, id) => x.page.evaluate((i) => !!document.getElementById(i), id);
  const click = (x, id) => x.page.evaluate((i) => document.getElementById(i).click(), id);

  await t('삼성 + 이미 배터리 제외: 앱을 켜고 9초쯤 뒤 안내가 뜨고, 누르기 전엔 화면을 열지 않는다', async () => {
    const x = await fresh({ plugin: true, samsung: true, ignoring: true, disclosed: true });
    await x.page.clock.runFor(3000); assert.strictEqual(await has(x, 'samAskOv'), false, '곧바로 뜨면 안 된다');
    await x.page.clock.runFor(8000);
    assert.strictEqual(await has(x, 'samAskOv'), true, '안내가 떠야 한다');
    const txt = await x.page.evaluate(() => document.getElementById('samAskOv').innerText);
    assert(/갤럭시/.test(txt) && /자동으로 절전하지 않는 앱/.test(txt) && /설정하기/.test(txt) && /나중에/.test(txt) && /모두 닫기/.test(txt), txt);
    assert.strictEqual(await x.page.evaluate(() => window.__samOpen), 0);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('[설정하기]를 누르면 그때 삼성 목록 화면을 한 번 연다', async () => {
    const x = await fresh({ plugin: true, samsung: true, ignoring: true, disclosed: true });
    await x.page.clock.runFor(11000);
    await click(x, 'samAskOk'); await x.page.clock.runFor(200);
    assert.strictEqual(await x.page.evaluate(() => window.__samOpen), 1);
    assert.strictEqual(await has(x, 'samAskOv'), false); await x.ctx.close();
  });

  await t('목록 화면을 못 열어 앱 정보로 갔으면 "제한 없음" 안내줄을 그린다', async () => {
    const x = await fresh({ plugin: true, samsung: true, ignoring: true, disclosed: true, target: 'app_details' });
    await x.page.clock.runFor(11000);
    await click(x, 'samAskOk'); await x.page.clock.runFor(300);
    const txt = await x.page.evaluate(() => (document.getElementById('samNote') || {}).innerText || '');
    assert(/제한 없음/.test(txt), '안내줄이 있어야 한다: ' + txt);
    await x.page.clock.runFor(9000);
    assert.strictEqual(await has(x, 'samNote'), false, '8초 뒤 사라진다'); await x.ctx.close();
  });

  await t('[나중에]는 열지 않고 닫고, 다시 묻지 않는다', async () => {
    const x = await fresh({ plugin: true, samsung: true, ignoring: true, disclosed: true });
    await x.page.clock.runFor(11000);
    await click(x, 'samAskNo');
    assert.strictEqual(await x.page.evaluate(() => window.__samOpen), 0);
    await x.page.evaluate(() => window._samAsk('again')); await x.page.clock.runFor(600);
    assert.strictEqual(await has(x, 'samAskOv'), false); await x.ctx.close();
  });

  await t('한 번 물었으면 며칠이 지나도 다시 묻지 않는다(평생 한 번)', async () => {
    const x = await fresh({ plugin: true, samsung: true, ignoring: true, disclosed: true, samAsked: true });
    await x.page.clock.runFor(15000);
    assert.strictEqual(await has(x, 'samAskOv'), false); await x.ctx.close();
  });

  await t('삼성이 아니면 띄우지 않는다', async () => {
    const x = await fresh({ plugin: true, samsung: false, ignoring: true, disclosed: true });
    await x.page.clock.runFor(15000);
    assert.strictEqual(await has(x, 'samAskOv'), false); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('웹(네이티브 플러그인 없음)에서는 띄우지 않는다', async () => {
    const x = await fresh({ plugin: false, disclosed: true });
    await x.page.clock.runFor(15000);
    assert.strictEqual(await has(x, 'samAskOv'), false); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('위치 동의를 하지 않은 사용자에게는 앱을 켠 뒤 저절로 띄우지 않는다', async () => {
    const x = await fresh({ plugin: true, samsung: true, ignoring: true, disclosed: false });
    await x.page.clock.runFor(15000);
    assert.strictEqual(await has(x, 'samAskOv'), false); await x.ctx.close();
  });

  await t('배터리 안내가 떠 있는 동안은 겹치지 않고, [나중에] 직후에 이어서 뜬다', async () => {
    const x = await fresh({ plugin: true, samsung: true, ignoring: false, disclosed: true });
    await x.page.clock.runFor(10500);
    assert.strictEqual(await has(x, 'batAskOv'), true, '배터리 안내가 먼저');
    assert.strictEqual(await has(x, 'samAskOv'), false, '겹치면 안 된다');
    await click(x, 'batAskNo'); await x.page.clock.runFor(900);
    assert.strictEqual(await has(x, 'samAskOv'), true, '이어서 갤럭시 안내'); await x.ctx.close();
  });

  await t('배터리 [설정하기] 후에는 시스템 화면에서 앱으로 돌아온 뒤에 이어서 뜬다', async () => {
    const x = await fresh({ plugin: true, samsung: true, ignoring: false, disclosed: true });
    await x.page.clock.runFor(10500);
    await click(x, 'batAskOk'); await x.page.clock.runFor(1500);
    assert.strictEqual(await x.page.evaluate(() => window.__batReq), 1);
    assert.strictEqual(await has(x, 'samAskOv'), false, '시스템 화면이 떠 있는 동안엔 안 뜬다');
    await x.page.evaluate(() => window.__appCb && window.__appCb({ isActive: true })); await x.page.clock.runFor(1500);
    assert.strictEqual(await has(x, 'samAskOv'), true, '돌아오면 이어서'); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('위치 [동의] 직후: 배터리 안내 → (나중에) → 갤럭시 안내 순서, 겹치지 않는다', async () => {
    const x = await fresh({ plugin: true, samsung: true, ignoring: false, disclosed: false });
    await x.page.clock.runFor(1500);
    await x.page.evaluate(() => { try { navigator.geolocation.getCurrentPosition(function () {}, function () {}); } catch (e) {} });
    await x.page.clock.runFor(2000);
    assert.strictEqual(await has(x, 'locDiscOv'), true);
    await click(x, 'locDiscOk'); await x.page.clock.runFor(1200);
    assert.strictEqual(await has(x, 'batAskOv'), true);
    assert.strictEqual(await has(x, 'samAskOv'), false);
    await click(x, 'batAskNo'); await x.page.clock.runFor(900);
    assert.strictEqual(await has(x, 'samAskOv'), true); await x.ctx.close();
  });

  await t('설정 탭 카드: 삼성에서만 보이고 [열기]가 목록을 연다', async () => {
    const x = await fresh({ plugin: true, samsung: true, ignoring: true, disclosed: false });
    await x.page.clock.runFor(1500);
    assert.strictEqual(await x.page.evaluate(() => getComputedStyle(document.getElementById('samSetCard')).display), 'block');
    assert.strictEqual(await x.page.evaluate(() => getComputedStyle(document.getElementById('samSetWarn')).display), 'none', '제한됨이 아니면 경고 없음');
    await x.page.evaluate(() => document.querySelector('#samSetCard button').click()); await x.page.clock.runFor(100);
    assert.strictEqual(await x.page.evaluate(() => window.__samOpen), 1); await x.ctx.close();
    const y = await fresh({ plugin: true, samsung: false, ignoring: true, disclosed: false });
    await y.page.clock.runFor(1500);
    assert.strictEqual(await y.page.evaluate(() => getComputedStyle(document.getElementById('samSetCard')).display), 'none', '삼성이 아니면 숨김');
    await y.ctx.close();
  });

  await t('앱 배터리가 "제한됨"이면 설정 카드에 경고가 켜진다', async () => {
    const x = await fresh({ plugin: true, samsung: true, ignoring: true, disclosed: false, bgRestricted: true });
    await x.page.clock.runFor(1500);
    assert.strictEqual(await x.page.evaluate(() => getComputedStyle(document.getElementById('samSetWarn')).display), 'block');
    await x.ctx.close();
  });

  await b.close();
  console.log(`\nsam_ask: ${pass} pass ${fail} fail`); process.exit(fail ? 1 : 0);
})();
