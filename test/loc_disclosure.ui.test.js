// 위치 사전 공개(Prominent Disclosure) — 2026-10-12
//   Play 정책: 위치 권한을 요청하기 전에 앱 안에서 용도를 밝히고, 사용자가 직접 [동의]해야 한다.
//   · 바깥 터치로는 닫히지 않는다 · [거부]하면 위치를 요청하지 않는다 · 백그라운드 추적도 동의 뒤에만 시작한다
// 실행: node test/loc_disclosure.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh() {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    // 진짜 위치 요청이 몇 번 나갔는지 센다(앱 코드가 감싸기 전 원본에서)
    await page.addInitScript(() => {
      window.__realGeo = 0;
      const P = Geolocation.prototype, g = P.getCurrentPosition, w = P.watchPosition;
      P.getCurrentPosition = function () { window.__realGeo++; return g.apply(this, arguments); };
      P.watchPosition = function () { window.__realGeo++; return w.apply(this, arguments); };
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.clock.install({ time: new Date('2026-10-12T09:00:00+09:00') });
    await page.goto('file://' + html); await page.clock.runFor(2500);
    return { ctx, page, errs };
  }
  const closeAll = async (x) => { await x.ctx.close(); };

  await t('안내는 [동의]·[거부] 두 버튼과 백그라운드 위치 수집 문구를 가진다', async () => {
    const x = await fresh();
    await x.page.evaluate(() => { try { navigator.geolocation.getCurrentPosition(function () {}, function () {}); } catch (e) {} });
    const r = await x.page.evaluate(() => { const o = document.getElementById('locDiscOv'); return o && { ok: !!o.querySelector('#locDiscOk'), no: !!o.querySelector('#locDiscNo'), txt: o.textContent }; });
    assert(r, '안내가 떠야 한다'); assert(r.ok && r.no, '동의·거부 버튼');
    assert(/백그라운드 위치 데이터를 수집/.test(r.txt) && /종료되었거나 사용 중이 아닐 때/.test(r.txt) && /화면이 꺼져 있거나 다른 앱/.test(r.txt), '필수 문구');
    await closeAll(x);
  });

  await t('바깥 터치로는 닫히지 않고, 동의 전에는 위치 요청이 나가지 않는다', async () => {
    const x = await fresh();
    await x.page.evaluate(() => { navigator.geolocation.getCurrentPosition(function () {}, function () {}); });
    await x.page.evaluate(() => { document.getElementById('locDiscOv').click(); });
    assert(await x.page.evaluate(() => !!document.getElementById('locDiscOv')), '바깥 터치로 닫히면 안 된다');
    assert.strictEqual(await x.page.evaluate(() => window.__realGeo), 0, '동의 전 위치 요청 0건');
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_loc_disclosed')), null, '동의로 저장되면 안 된다');
    await closeAll(x);
  });

  await t('[거부]하면 위치를 요청하지 않고 오류(권한 거부)로 돌려준다 · 이번 실행엔 다시 묻지 않는다', async () => {
    const x = await fresh();
    const got = await x.page.evaluate(() => new Promise(res => {
      navigator.geolocation.getCurrentPosition(function () { res('ok'); }, function (e) { res('err' + e.code); });
      document.getElementById('locDiscNo').click();
    }));
    assert.strictEqual(got, 'err1');
    assert(await x.page.evaluate(() => !document.getElementById('locDiscOv')), '안내가 닫혀야 한다');
    const again = await x.page.evaluate(() => new Promise(res => { navigator.geolocation.getCurrentPosition(function () { res('ok'); }, function (e) { res('err' + e.code + (document.getElementById('locDiscOv') ? '+ov' : '')); }); }));
    assert.strictEqual(again, 'err1', '다시 묻지 않고 바로 거부로 돌려준다');
    assert.strictEqual(await x.page.evaluate(() => window.__realGeo), 0);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_loc_disclosed')), null, '거부는 저장하지 않는다(다음 실행에 다시 묻는다)');
    await closeAll(x);
  });

  await t('[동의]하면 저장하고, 기다리던 요청이 그제야 나간다 · 이후엔 안내가 안 뜬다', async () => {
    const x = await fresh();
    await x.page.evaluate(() => { navigator.geolocation.getCurrentPosition(function () {}, function () {}); navigator.geolocation.watchPosition(function () {}, function () {}); });
    await x.page.evaluate(() => { document.getElementById('locDiscOk').click(); });
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_loc_disclosed')), '1');
    assert(await x.page.evaluate(() => window.__realGeo) >= 2, '대기하던 두 요청 모두 나가야 한다');
    await x.page.evaluate(() => { navigator.geolocation.getCurrentPosition(function () {}, function () {}); });
    assert(await x.page.evaluate(() => !document.getElementById('locDiscOv')), '두 번째부터는 안내가 없다');
    await closeAll(x);
  });

  const bgMock = () => { window.__bg = []; window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {}; window.Capacitor.Plugins.BackgroundGeolocation = { addWatcher: function (o) { window.__bg.push(o); return 'w1'; }, removeWatcher: function () { return Promise.resolve(); }, openSettings: function () {} }; };

  await t('백그라운드 추적은 동의 전에는 시작하지 않고, 동의하면 시작한다(알림 문구 포함)', async () => {
    const x = await fresh();
    await x.page.evaluate(bgMock);
    await x.page.evaluate(() => { _bgGeoActive = false; _startBgGeolocation(); });
    assert.strictEqual(await x.page.evaluate(() => window.__bg.length), 0, '동의 전 addWatcher 0건');
    assert(await x.page.evaluate(() => !!document.getElementById('locDiscOv')), '안내가 떠야 한다');
    await x.page.evaluate(() => { document.getElementById('locDiscOk').click(); });
    assert.strictEqual(await x.page.evaluate(() => window.__bg.length), 1, '동의 뒤 addWatcher 1건');
    const o = await x.page.evaluate(() => window.__bg[0]);
    assert(/위치 추적/.test(o.backgroundMessage) && o.backgroundTitle, '상주 알림에 위치 추적 중임이 보여야 한다');
    await closeAll(x);
  });

  await t('백그라운드 추적: 거부하면 시작하지 않고, 이미 동의한 사용자는 안내 없이 바로 시작한다', async () => {
    const x = await fresh();
    await x.page.evaluate(bgMock);
    await x.page.evaluate(() => { _bgGeoActive = false; _startBgGeolocation(); });
    await x.page.evaluate(() => { document.getElementById('locDiscNo').click(); });
    assert.strictEqual(await x.page.evaluate(() => window.__bg.length), 0);
    await x.page.evaluate(() => { _bgGeoActive = false; _startBgGeolocation(); });
    assert.strictEqual(await x.page.evaluate(() => window.__bg.length), 0, '거부 뒤 다시 불러도 시작 안 함');
    await closeAll(x);
    const y = await fresh();
    await y.page.evaluate(() => { localStorage.setItem('gdm_loc_disclosed', '1'); const o = document.getElementById('locDiscOv'); if (o) o.remove(); });
    await y.page.evaluate(bgMock);
    await y.page.evaluate(() => { _bgGeoActive = false; _startBgGeolocation(); });
    assert.strictEqual(await y.page.evaluate(() => window.__bg.length), 1);
    assert(await y.page.evaluate(() => !document.getElementById('locDiscOv')));
    await closeAll(y);
  });

  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
