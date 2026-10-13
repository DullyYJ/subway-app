// 도착 뒤 안내 종료 — 2026-10-13
//   승차 확정된 여정은 시각표 기준 — 목적지 도착 15초 전부터 45초 동안 GPS 로 도착을 확인하고(잡히면 진행도 보정), 확인되면 안내(오버레이·백그라운드 위치·알림)를 종료한다.
//   GPS 로 확인이 안 되면 앱 아래·오버레이에 [안내 종료] 버튼을 띄운다. 아직 도착 전으로 보이면 종료하지 않고 90초 뒤 다시 본다.
// 실행: node test/arrival_end.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
const DEST_LNG = 126.9 + 0.0137 * 3;

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // geo: 'dest' 목적지 위치 · 'far' 5km 밖 · null 위치 권한 없음
  async function fresh(geo, opt) {
    opt = opt || {};
    const ctxOpt = { viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' };
    if (geo) { ctxOpt.geolocation = { latitude: 37.5, longitude: geo === 'dest' ? DEST_LNG : DEST_LNG + 0.06 }; ctxOpt.permissions = ['geolocation']; }
    const ctx = await b.newContext(ctxOpt);
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.clock.install({ time: new Date('2026-10-11T12:40:00+09:00') });
    await page.goto('file://' + html); await page.addStyleTag({ content: '#locDiscOv{display:none !important}' }); await page.clock.runFor(2500);
    await page.evaluate((opt) => {
      const ov = document.getElementById('locDiscOv'); if (ov) ov.remove();
      const midnight = new Date('2026-10-11T00:00:00+09:00');
      const hm = (m) => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.floor(m % 60)).slice(-2);
      const m0 = (new Date('2026-10-11T12:52:00+09:00') - midnight) / 60000;
      const nodes = [{ name: '출발', lat: 37.5, lng: 126.896, isOrigin: true, isWalk: false, isSub: false, isBus: false, _schedMin: m0 - 5, el: null }];
      for (let i = 0; i < 4; i++) nodes.push({ name: 'S' + i, lat: 37.5, lng: 126.9 + 0.0137 * i, isSub: true, isBus: false, isWalk: false, isOrigin: false, lineName: '1호선', _schedMin: m0 + i * 2, arrTime: hm(m0 + i * 2), el: null });
      if (opt.walkEnd) nodes.push({ name: '도보', lat: 37.5, lng: 126.9 + 0.0137 * 3 + 0.003, isWalk: true, isSub: false, isBus: false, isOrigin: false, _schedMin: m0 + 9, arrTime: hm(m0 + 9), el: null });
      _transitNodeData = nodes;
      window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null; window._trackSig = 'T1'; window._trackBase = 1;
      window._gpsMaxIdx = -1; window._gpsConfirmIdx = -1; window._nodePassMs = {}; window._htlBoarded = false;
      window.__closed = 0; window.closeTransitResult = function () { window.__closed++; window._routeLocked = false; };
    }, opt);
    const app = { ctx, page, errs };
    app.at = async (hhmmss) => { const target = new Date('2026-10-11T' + hhmmss + '+09:00').getTime(); const now = await page.evaluate(() => Date.now()); if (target > now) await page.clock.runFor(target - now); };
    app.arrive = () => page.evaluate(() => { window._htlBoarded = true; window._gpsMaxIdx = 4; window._gpsConfirmIdx = 4; window._nodePassMs = { 1: Date.now() - 400000, 4: Date.now() - 5000 }; });
    // n초 동안 1초씩 돌린다(옵션: 매 5초 GPS 위치를 넣는다)
    app.run = async (sec, fix) => { for (let i = 0; i < sec; i++) { if (fix && i % 5 === 0) await page.evaluate((f) => { S.lastGPSFix = { lat: f.lat, lng: f.lng, ts: Date.now(), acc: f.acc }; _evSample(Date.now()); }, fix); await page.clock.runFor(1000); } };
    app.st = () => page.evaluate(() => ({ s: window._arrEnd ? window._arrEnd.st : null, closed: window.__closed, bar: !!(document.getElementById('arrEndBar') && document.getElementById('arrEndBar').classList.contains('on')), rs: _ovlRs() }));
    app.diag = () => page.evaluate(() => { try { return (JSON.parse(localStorage.getItem('ovlDiag') || '[]') || []).map(String); } catch (e) { return []; } });
    return app;
  }

  console.log('[① 시각표 도착 15초 전부터 45초 — GPS 가 목적지 근처면 보정하고 안내 종료]');
  let a = await fresh('dest');
  await a.at('12:57:20'); await a.arrive(); await a.run(10);
  await t('도착 15초보다 전(12:57:30)에는 확인을 시작하지 않는다(시각표 기준)', async () => { const s = await a.st(); assert.strictEqual(s.s, null); assert.strictEqual(s.closed, 0); });
  await a.run(20, { lat: 37.5, lng: DEST_LNG, acc: 20 });
  await t('도착 15초 전(12:57:45)이 되어도 바로 끝내지는 않는다(엔진이 45초 창을 본다)', async () => { const s = await a.st(); assert.strictEqual(s.s, null); assert.strictEqual(s.closed, 0); });
  await t('GPS 가 목적지 근처로 잡히면 진행도가 목적지로 보정된다', async () => { assert.strictEqual(await a.page.evaluate(() => window._gpsMaxIdx), 4); });
  await a.run(25, { lat: 37.5, lng: DEST_LNG, acc: 20 });
  await t('45초 안(12:58:15)에는 아직 종료하지 않는다', async () => { const s = await a.st(); assert.strictEqual(s.closed, 0); });
  await a.run(32, { lat: 37.5, lng: DEST_LNG, acc: 20 });   // 창이 끝난 뒤 엔진 응답(8초 간격)까지
  await t('45초가 끝나면(도착 30초 뒤) 한 번이라도 가까운 위치가 잡혔으니 도착 확인 → 안내 종료(×와 같은 정리)', async () => { const s = await a.st(); assert.strictEqual(s.closed, 1); });
  await t('진단에 도착종료가 남는다', async () => assert.ok((await a.diag()).some(x => /도착종료/.test(x) && /엔진이 GPS 로 도착 확인/.test(x))));
  await a.run(60, { lat: 37.5, lng: DEST_LNG, acc: 20 });
  await t('종료는 한 번만 일어난다', async () => assert.strictEqual((await a.st()).closed, 1));
  await t('페이지 오류 없음(①)', async () => assert.deepStrictEqual([...new Set(a.errs)], []));
  await a.ctx.close();

  console.log('[② GPS 가 안 잡힘 → 종료 버튼(앱·오버레이)]');
  a = await fresh(null);
  await a.at('12:57:30'); await a.arrive(); await a.run(80);
  let s = await a.st();
  await t('45초 동안 GPS 가 없으면 종료하지 않고 버튼을 띄운다', async () => { assert.strictEqual(s.s, 'ask'); assert.strictEqual(s.closed, 0); assert.ok(s.bar); });
  await t('오버레이 맨 아래 줄에도 [안내 종료] 버튼이 간다', async () => { assert.strictEqual(s.rs.st, 'board'); assert.strictEqual(s.rs.bt, '안내 종료'); });
  await t('앱 버튼을 누르면 안내가 종료된다', async () => { await a.page.click('#arrEndBtn'); await a.page.clock.runFor(500); s = await a.st(); assert.strictEqual(s.closed, 1); assert.ok(!s.bar); });
  await a.ctx.close();

  a = await fresh(null);
  await a.at('12:57:30'); await a.arrive(); await a.run(80);
  await t('오버레이 버튼(press)을 눌러도 같다', async () => { await a.page.evaluate(() => _ovlAct('press')); s = await a.st(); assert.strictEqual(s.closed, 1); });
  await a.ctx.close();

  console.log('[③ 목적지에서 한참 먼 위치 → 아직 도착 전(엔진 notyet): 종료도 버튼도 없고, 나중에 가까운 위치가 잡히면 종료]');
  a = await fresh('far');
  await a.at('12:57:30'); await a.arrive(); await a.run(70, { lat: 37.5, lng: DEST_LNG + 0.06, acc: 20 });
  s = await a.st();
  await t('멀리 있으면 종료하지 않고 버튼도 띄우지 않는다', async () => { assert.strictEqual(s.closed, 0); assert.strictEqual(s.s, null); assert.ok(!s.bar); });
  await a.run(60, { lat: 37.5, lng: DEST_LNG + 0.06, acc: 20 });
  await t('계속 멀면 몇 분이 지나도 그대로(재탐색·종료 없음)', async () => { const x = await a.st(); assert.strictEqual(x.closed, 0); assert.ok(!x.bar); });
  await a.run(60, { lat: 37.5, lng: DEST_LNG, acc: 20 });
  await t('나중에(늦게 도착) 목적지 근처 위치가 잡히면 엔진이 confirmed 로 바꾸고 종료한다', async () => assert.strictEqual((await a.st()).closed, 1));
  await a.ctx.close();

  console.log('[④ 도착으로 보이지 않거나 해당 없음]');
  a = await fresh('dest');
  await a.at('12:54:00'); await a.page.evaluate(() => { window._htlBoarded = true; window._gpsMaxIdx = 2; window._nodePassMs = { 1: Date.now() - 100000 }; }); await a.run(90, { lat: 37.5, lng: DEST_LNG, acc: 20 });
  await t('아직 중간 역이면 확인을 시작하지 않는다', async () => { const x = await a.st(); assert.strictEqual(x.s, null); assert.strictEqual(x.closed, 0); });
  await a.ctx.close();

  a = await fresh('dest', { walkEnd: true });
  await a.at('12:57:30'); await a.arrive(); await a.run(90, { lat: 37.5, lng: DEST_LNG, acc: 20 });
  await t('마지막 칸이 도보(도착 뒤 걷기 안내)면 자동 종료하지 않는다', async () => { const x = await a.st(); assert.strictEqual(x.closed, 0); assert.strictEqual(x.s, null); });
  await a.ctx.close();

  a = await fresh('dest');
  await a.page.evaluate(() => { window._arrEndOff = true; });
  await a.at('12:57:30'); await a.arrive(); await a.run(90, { lat: 37.5, lng: DEST_LNG, acc: 20 });
  await t('_arrEndOff 면 아무것도 하지 않는다', async () => { const x = await a.st(); assert.strictEqual(x.closed, 0); assert.strictEqual(x.s, null); });
  await a.ctx.close();

  a = await fresh('dest');
  await a.at('12:57:30'); await a.arrive(); await a.run(90, { lat: 37.5, lng: DEST_LNG, acc: 300 });
  await t('정확도 150m 넘는 위치는 근거로 쓰지 않는다(버튼으로)', async () => { const x = await a.st(); assert.strictEqual(x.closed, 0); assert.strictEqual(x.s, 'ask'); });
  await a.ctx.close();

  console.log('[⑤ 중간 역 영점 — 시각표 도착 15초 전~30초 뒤 GPS 가 그 역 부근이면 진행도만 맞추고 시각표는 그대로]');
  const S1_LNG = 126.9 + 0.0137;   // 노드 2(S1, 12:54)
  const setMid = (a) => a.page.evaluate(() => { window._htlBoarded = true; window._gpsMaxIdx = 1; window._gpsConfirmIdx = 1; window._nodePassMs = { 1: Date.now() - 100000 }; window.__arr0 = _transitNodeData.map(n => n.arrTime).join(' '); });
  a = await fresh('dest');
  await a.at('12:53:20'); await setMid(a); await a.run(20, { lat: 37.5, lng: S1_LNG, acc: 25 });
  await t('도착 15초 전(12:53:45)이 지나도 도착 시각(12:54:00) 전에는 진행도를 앞당기지 않는다', async () => assert.strictEqual(await a.page.evaluate(() => window._gpsMaxIdx), 1));
  await a.run(25, { lat: 37.5, lng: S1_LNG, acc: 25 });
  await t('도착 시각이 되고 그 역 부근 GPS 가 확인됐으면 진행도가 그 역으로 맞춰진다', async () => assert.strictEqual(await a.page.evaluate(() => window._gpsMaxIdx), 2));
  await t('시각표(도착 시각)·통과 시각 기록은 바뀌지 않는다', async () => {
    const g = await a.page.evaluate(() => ({ arr: _transitNodeData.map(n => n.arrTime).join(' '), arr0: window.__arr0, pm: Object.keys(window._nodePassMs).join(',') }));
    assert.strictEqual(g.arr, g.arr0); assert.strictEqual(g.pm, '1');
  });
  await t('진단에 영점이 남는다', async () => assert.ok((await a.diag()).some(x => /영점/.test(x) && /시각표는 그대로/.test(x))));
  await t('중간 역에서는 안내를 종료하지 않는다', async () => assert.strictEqual((await a.st()).closed, 0));
  await t('페이지 오류 없음(⑤-1)', async () => assert.deepStrictEqual([...new Set(a.errs)], []));
  await a.ctx.close();

  a = await fresh('far');
  await a.at('12:53:20'); await setMid(a); await a.run(60, { lat: 37.5, lng: S1_LNG + 0.06, acc: 25 });
  await t('멀리 있는 위치만 잡히면 진행도도 시각표도 건드리지 않는다(벌 없음)', async () => {
    const g = await a.page.evaluate(() => ({ gm: window._gpsMaxIdx, arr: _transitNodeData.map(n => n.arrTime).join(' '), arr0: window.__arr0 }));
    assert.strictEqual(g.gm, 1); assert.strictEqual(g.arr, g.arr0);
  });
  await a.ctx.close();

  a = await fresh(null);
  await a.at('12:53:20'); await setMid(a); await a.run(60);
  await t('GPS 가 안 잡히면(지하) 아무것도 하지 않는다', async () => assert.strictEqual(await a.page.evaluate(() => window._gpsMaxIdx), 1));
  await a.ctx.close();

  a = await fresh('dest');
  await a.page.evaluate(() => { window._stnZeroOff = true; });
  await a.at('12:53:20'); await setMid(a); await a.run(50, { lat: 37.5, lng: S1_LNG, acc: 25 });
  await t('_stnZeroOff 면 하지 않는다', async () => assert.strictEqual(await a.page.evaluate(() => window._gpsMaxIdx), 1));
  await a.ctx.close();

  await b.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
