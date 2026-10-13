// 탭 섞임 방지 — 엔진이 지하철만/버스만 경로를 못 만들었을 때(sub/bus 없음) 앱은 다른 탭 경로로 바꿔치기하지 않고
// "~만으로 갈 수 있는 경로가 없어요"만 보여 준다. 최단시간↔최소환승 탭은 그대로 경로를 그린다.
// 실행: node test/tab_no_mix.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const { resp } = require('./helpers/engine_fixture');
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
let DROP = [];
const mkResp = () => { const r = resp(); r.result.path = r.result.path.filter(p => !DROP.includes(p.info.tab)); return r; };

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
    if (/route-v2/.test(u.host)) return r.fulfill({ status: 200, headers: H, body: JSON.stringify(mkResp()) });
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

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const hdr = (page) => page.evaluate(() => document.getElementById('transitResultHeader').textContent.trim());
  const vis = (page, id) => page.evaluate((id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; }, id);

  for (const [drop, tab, label] of [[['sub'], 'routeTabSub', '지하철'], [['bus'], 'routeTabBus', '버스']]) {
    DROP = drop;
    console.log('[' + label + ' 경로 없음]');
    const { page, errs, ctx } = await newApp(b);
    await page.click('#fmapDestInp'); await page.fill('#fmapDestInp', '수원'); await page.clock.runFor(800);
    await page.click('#fmapDestSug > *:first-child'); await page.clock.runFor(500);
    await page.click('#fmapRouteBtn'); await page.clock.runFor(3500);
    const h0 = await hdr(page);
    await page.click('#' + tab); await page.clock.runFor(1200);
    await t(label + ' 탭: "' + label + '만으로 갈 수 있는 경로가 없어요"만 보인다(다른 경로로 대체 안 함)', async () => {
      const h = await hdr(page); assert.ok(h.includes(label + '만으로 갈 수 있는 경로가 없어요'), h);
      assert.ok(!(await vis(page, 'transitHtlWrap')), '타임라인이 남아 있다');
    });
    await t(label + ' 탭: 경로 확정 버튼이 숨겨진다 / 탭 버튼은 그대로', async () => {
      assert.ok(!(await page.evaluate(() => { const r = document.getElementById('mainConfirmRouteBtn').parentNode; return getComputedStyle(r).display !== 'none'; })));
      assert.ok(await vis(page, 'routeTabFast')); assert.ok(await vis(page, tab));
    });
    await page.click('#routeTabLess'); await page.clock.runFor(1200);
    await t('최소환승 탭으로 돌아가면 경로 카드가 정상 복원된다', async () => {
      const h = await hdr(page); assert.ok(!/경로가 없어요/.test(h), h);
      assert.ok(await vis(page, 'transitHtlWrap'));
      assert.ok(await page.evaluate(() => getComputedStyle(document.getElementById('mainConfirmRouteBtn').parentNode).display !== 'none'));
      assert.ok(await page.evaluate(() => document.querySelectorAll('#transitHtlWrap *').length > 5));
    });
    await page.click('#routeTabFast'); await page.clock.runFor(1200);
    await t('최단시간 탭도 정상(헤더 시간 숫자)', async () => assert.ok(/^\d+분/.test((await hdr(page)).replace(/\s/g, '')) || /\d+/.test(await hdr(page))));
    await t('JS 오류가 없다', async () => assert.deepStrictEqual([...new Set(errs)], []));
    await ctx.close();
  }

  console.log('[둘 다 있을 때는 각자 경로]');
  DROP = [];
  const { page, errs, ctx } = await newApp(b);
  await page.click('#fmapDestInp'); await page.fill('#fmapDestInp', '수원'); await page.clock.runFor(800);
  await page.click('#fmapDestSug > *:first-child'); await page.clock.runFor(500);
  await page.click('#fmapRouteBtn'); await page.clock.runFor(3500);
  for (const [id, key] of [['routeTabSub', 'sub'], ['routeTabBus', 'bus']]) {
    await page.click('#' + id); await page.clock.runFor(1200);
    await t(key + ' 탭: 엔진 경로가 그려진다(없음 메시지 아님)', async () => {
      assert.ok(!/경로가 없어요/.test(await hdr(page))); assert.ok(await vis(page, 'transitHtlWrap'));
    });
  }
  await t('JS 오류가 없다', async () => assert.deepStrictEqual([...new Set(errs)], []));
  await ctx.close();

  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
