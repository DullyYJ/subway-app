// 홈 탭 처음부터 끝까지 — 검색 → 결과 탭 → 경로 확정 → GPS 로 이동 → 환승·하차 알림 · 오버레이 · 상주 알림 · 하차 전 추천 → 안내 종료.
// 헤드리스 Chromium + 가짜 시계 + 가짜 Capacitor 플러그인(LocalNotifications·Overlay·BackgroundGeolocation) + 모의 엔진.
// 실행: node test/journey_e2e.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const { resp } = require('./helpers/engine_fixture');
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
    if (/route-v2/.test(u.host)) return r.fulfill({ status: 200, headers: H, body: JSON.stringify(resp()) });
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

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });

  console.log('[검색 → 결과]');
  let { page, errs, ctx } = await newApp(b);
  await page.click('#fmapDestInp'); await page.fill('#fmapDestInp', '수원'); await page.clock.runFor(800);
  await t('목적지 입력 시 자동완성 목록이 뜬다', async () => assert.ok((await page.evaluate(() => document.querySelectorAll('#fmapDestSug > *').length)) >= 1));
  await page.click('#fmapDestSug > *:first-child'); await page.clock.runFor(500);
  await t('자동완성을 고르면 도착지 입력칸이 채워진다', async () => assert.ok(/수원/.test(await page.inputValue('#fmapDestInp'))));
  await page.click('#fmapRouteBtn'); await page.clock.runFor(3500);
  await t('경로 탐색 → 결과 카드와 4개 탭(최단시간·최소환승·지하철·버스)이 보인다', async () => {
    const r = await page.evaluate(() => ({ card: getComputedStyle(document.getElementById('transitResultCard')).display, tabs: ['routeTabFast', 'routeTabLess', 'routeTabSub', 'routeTabBus'].map(id => getComputedStyle(document.getElementById(id)).display) }));
    assert.strictEqual(r.card, 'flex'); assert.deepStrictEqual(r.tabs, ['block', 'block', 'block', 'block']);
  });
  const hdr = () => page.evaluate(() => document.getElementById('transitResultHeader').textContent.trim());
  const h0 = await hdr();
  for (const [id, key] of [['routeTabBus', 'bus'], ['routeTabSub', 'sub'], ['routeTabLess', 'less'], ['routeTabFast', 'fast']]) {
    await page.click('#' + id); await page.clock.runFor(1200);
    await t('탭 전환(' + key + ') — 선택한 탭이 켜지고 결과가 다시 그려진다', async () => {
      const r = await page.evaluate((id) => ({ on: document.getElementById(id).className, pend: window._pendingRouteType || window._lockedRouteType, rows: document.querySelectorAll('#transitHtlWrap *').length }), id);
      assert.ok(/on/.test(r.on), r.on); assert.strictEqual(r.pend, key); assert.ok(r.rows > 5);
    });
  }
  await t('버스 탭은 지하철 탭과 다른 총 시간을 보여 준다(탭마다 다른 경로)', async () => {
    await page.click('#routeTabBus'); await page.clock.runFor(1200); const hb = await hdr();
    await page.click('#routeTabSub'); await page.clock.runFor(1200); const hs = await hdr();
    assert.notStrictEqual(hb, hs, hb + ' / ' + hs);
    await page.click('#routeTabFast'); await page.clock.runFor(1200);
  });
  await t('세부경로 보기를 누르면 상세 시트가 열리고 닫을 수 있다', async () => {
    await page.click('button[onclick="openTransitDetail()"]'); await page.clock.runFor(800);
    const open = await page.evaluate(() => { const m = document.getElementById('transitDetailModal'); return !!m && getComputedStyle(m).display !== 'none'; });
    assert.ok(open, '상세 시트가 안 열림');
    await page.evaluate(() => { const m = document.getElementById('transitDetailModal'); if (typeof closeTransitDetail === 'function') closeTransitDetail(); else m.style.display = 'none'; });
  });

  console.log('[경로 확정 → 이동 → 알림·오버레이]');
  await page.click('#mainConfirmRouteBtn'); await page.clock.runFor(2500);
  await t('경로를 확정하면 안내가 시작된다(확정·여정 기록·백그라운드 위치·상주 갱신)', async () => {
    const s = await page.evaluate(() => ({ locked: window._routeLocked, trip: window._pipTrip && window._pipTrip.to, bg: window.__bg.slice(), ka: window.__ka[window.__ka.length - 1], btn: document.getElementById('mainConfirmRouteBtn').textContent }));
    assert.strictEqual(s.locked, true); assert.ok(s.trip); assert.deepStrictEqual(s.bg, ['add']); assert.strictEqual(s.ka && s.ka.on, true); assert.ok(/확정됨/.test(s.btn), s.btn);
  });
  await t('확정 직후 오버레이가 켜지고 출발지·남은 시간을 받는다', async () => {
    const o = await page.evaluate(() => window.__ovl[window.__ovl.length - 1]); assert.ok(o && o.active === true, JSON.stringify(o)); assert.ok(/남은시간/.test(o.line2), o.line2);
  });
  const nodes = await page.evaluate(() => _transitNodeData.map((n, i) => ({ i, name: n.name, lat: n.lat, lng: n.lng, w: !!n.isWalk, sched: n._schedMin })));
  const seen = []; let prevGm = -2, mono = true, trackOk = true;
  for (const n of nodes) {
    if (n.w || n.lat == null || n.name === '내 위치') continue;
    await pass_through(page, n);
    const s = await page.evaluate(() => ({ gm: window._gpsMaxIdx, o: window.__ovl[window.__ovl.length - 1], ln: window.__ln.filter(x => x.title).map(x => x.title) }));
    if (s.gm < prevGm) mono = false; prevGm = s.gm;
    if (!(s.o.track || []).includes(n.name)) trackOk = false;
    s.step = n.i + ':' + n.name + ' gm=' + s.gm + ' alert=' + s.o.alert; seen.push(s);
  }
  const last = seen[seen.length - 1];
  await t('이동하는 동안 진행 위치가 되돌아가지 않고 끝까지 간다', async () => { assert.ok(mono, '진행 위치가 거꾸로 감'); assert.strictEqual(last.gm, nodes.filter(n => !n.w).length > 0 ? nodes.findIndex(n => n.name === '마포') : -1); });
  await t('오버레이의 현재역 칸이 지나는 역을 매번 따라간다', async () => assert.ok(trackOk));
  await t('환승 2정거장 전 → 환승 준비 → 곧 하차 → 목적지 도착 알림이 순서대로 한 번씩 나간다', async () => {
    const ts = last.ln.filter(x => /^(환승 2정거장 전|환승 준비|목적지 2정거장 전|곧 하차|목적지 도착)$/.test(x));
    const idx = ['환승 2정거장 전', '환승 준비', '곧 하차', '목적지 도착'].map(x => ts.indexOf(x));
    assert.ok(idx.every(i => i >= 0), JSON.stringify(ts)); assert.ok(idx.every((v, k) => k === 0 || v > idx[k - 1]), JSON.stringify(ts));
    assert.strictEqual(new Set(ts).size, ts.length, '중복: ' + JSON.stringify(ts));
  });
  await t('하차 전 추천 알림이 한 번 나간다', async () => assert.strictEqual(last.ln.filter(x => /하차 \d+분 전/.test(x)).length, 1, JSON.stringify(last.ln)));
  await t('이동 중 상주 알림(현재역 · 남은시간)이 갱신된다', async () => assert.ok(last.ln.filter(x => / · \d+분$/.test(x)).length >= 2, JSON.stringify(last.ln)));
  await t('오버레이 경고 단계가 0 에서 시작해 1 에 도달한다', async () => { const a = await page.evaluate(() => window.__ovl.map(o => o.alert)); assert.ok(a.includes(0) && a.includes(1) && a.indexOf(1) > a.indexOf(0), JSON.stringify(a) + ' / ' + seen.map(x => x.step).join(' | ')); });

  console.log('[안내 종료(×) — 모든 갱신이 같이 멈춘다]');
  await t('하차 전 추천 팝업이 떠 있으면 [확인]으로 닫힌다', async () => {
    assert.ok(await page.evaluate(() => !!document.getElementById('briefModalOv')), '팝업이 안 떴음');
    await page.click('#briefModalOv button:first-child'); await page.clock.runFor(300);
    assert.ok(await page.evaluate(() => !document.getElementById('briefModalOv')));
  });
  await page.click('#transitResultCard button[onclick="closeTransitResult()"]'); await page.clock.runFor(8000);
  await t('× 로 닫으면 오버레이가 꺼진다(active=false)', async () => { const o = await page.evaluate(() => window.__ovl[window.__ovl.length - 1]); assert.strictEqual(o.active, false, JSON.stringify(o)); });
  await t('백그라운드 위치 감시가 해제되고 상주 알림이 내려가며 keepAlive 가 꺼진다', async () => {
    const s = await page.evaluate(() => ({ bg: window.__bg.slice(), ka: window.__ka[window.__ka.length - 1], cancelled: window.__ln.some(x => x.cancelled) }));
    assert.deepStrictEqual(s.bg, ['add', 'remove']); assert.strictEqual(s.ka.on, false); assert.ok(s.cancelled, '상주 알림(id 1)을 내리지 않음');
  });
  await t('JS 오류가 없다', async () => assert.deepStrictEqual([...new Set(errs)], []));
  await ctx.close();

  console.log('[도중에 취소하면 이후 알림이 오지 않는다]');
  ({ page, errs, ctx } = await newApp(b));
  await search(page); await page.click('#mainConfirmRouteBtn'); await page.clock.runFor(2500);
  const nn = await page.evaluate(() => _transitNodeData.map((n, i) => ({ i, name: n.name, lat: n.lat, lng: n.lng, w: !!n.isWalk, sched: n._schedMin })));
  for (const n of nn.filter(x => !x.w && x.lat != null && x.name !== '내 위치').slice(0, 2)) await pass_through(page, n);
  await page.evaluate(() => { const m = document.getElementById('briefModalOv'); if (m) m.remove(); });
  await page.click('#transitResultCard button[onclick="closeTransitResult()"]'); await page.clock.runFor(3000);
  await page.evaluate(() => { window.__ln.length = 0; });
  for (const n of nn.filter(x => !x.w && x.lat != null && x.name !== '내 위치').slice(2)) await pass_through(page, n);
  await page.clock.runFor(60000);
  await t('취소한 뒤 위치가 계속 와도 환승·하차·추천 알림이 나가지 않는다', async () => {
    const ts = (await page.evaluate(() => window.__ln.filter(x => x.title).map(x => x.title))).filter(x => /환승|하차|목적지/.test(x));
    assert.deepStrictEqual(ts, []);
  });
  await t('취소하면 오버레이가 꺼져 있다', async () => { const o = await page.evaluate(() => window.__ovl[window.__ovl.length - 1]); assert.strictEqual(o.active, false, JSON.stringify(o)); });
  await t('JS 오류가 없다', async () => assert.deepStrictEqual([...new Set(errs)], []));
  await ctx.close();

  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
