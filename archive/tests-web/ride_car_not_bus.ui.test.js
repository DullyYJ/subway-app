// 버스로 시작하는 경로에서 버스를 안 타고 승용차를 탔을 때(2026-10-13 YJ: "버스 안 타고 승용차를 탔는데 역으로 인식한다")
// 엔진(/ride-track)이 '버스가 아니다'를 가르고 앱은 그 답을 따른다 — 역으로 진행도를 올리지 않고, 지하철 탑승 확정으로 보지 않고, 현재 위치에서 다시 찾는다.
// 진짜 버스를 탄 경우는 건드리지 않고, 버스 탑승 중엔 엔진이 GPS 를 더 쓰는 모드를 준다.
// 실행: node test/ride_car_not_bus.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
const KX = 88000, LAT0 = 37.5, LNG0 = 126.9;                  // 동쪽 m → 경도
const X = (m) => LNG0 + m / KX;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const mk = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: LAT0, longitude: LNG0 }, permissions: ['geolocation'] });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    const em = require('./helpers/eta_mock');
    await em.installEtaMock(page); em.autoWait(page);
    await page.clock.install({ time: new Date('2026-10-04T12:40:00+09:00') });
    await page.goto('file://' + html); await page.clock.runFor(2500);
    await page.evaluate(([lat0, lng0, kx]) => {
      window.__calls = { route: 0 }; window.fmapDoRoute = function () { window.__calls.route++; };
      const midnight = new Date('2026-10-04T00:00:00+09:00');
      const t0 = new Date('2026-10-04T12:41:00+09:00');
      const hm = (m) => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.floor(m % 60)).slice(-2);
      const base = (t0 - midnight) / 60000;
      // 원점(x=500) → 버스 [승차 B0 x=0 → B1 x=1500 → 하차 B2 x=3000] → 도보 → 지하철 S(x=3150) → S2(x=6000)
      const nd = (name, x, minAfter, o) => Object.assign({ name, lat: lat0, lng: lng0 + x / kx, isWalk: false, isOrigin: false, isSub: false, isBus: false, _schedMin: base + minAfter, _plan0: base + minAfter, arrTime: hm(base + minAfter), el: null }, o);
      const nodes = [nd('출발', 500, 0, { isOrigin: true }),
        nd('B0', 0, 2, { isBus: true, lineName: '순환43' }), nd('B1', 1500, 7, { isBus: true, lineName: '순환43' }), nd('B2', 3000, 12, { isBus: true, lineName: '순환43' }),
        nd('S', 3150, 15, { isSub: true, lineName: '인천1호선' }), nd('S2', 6000, 21, { isSub: true, lineName: '인천1호선' })];
      _transitNodeData = nodes; window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null; window._trackSig = 'T1'; window._trackBase = 1;
      window._gpsMaxIdx = -1; window._gpsConfirmIdx = -1; window._nodePassMs = {}; window._htlBoarded = false;
      S.lastGPSFix = null; _fmapStart = { type: 'gps' };
      const card = document.getElementById('transitResultCard'); if (card) card.style.display = 'block';
      window._rideEvReset && window._rideEvReset('시험');
    }, [LAT0, LNG0, KX]);
    await page.clock.setSystemTime(new Date('2026-10-04T12:41:00+09:00'));
    return { ctx, page, errs };
  };
  const tick = async (page, lat, lng) => {
    await page.evaluate(([la, ln]) => { S.lastGPSFix = { lat: la, lng: ln, ts: Date.now(), acc: 12 }; try { _pfTick(); } catch (e) {} try { window._trk.at = 0; _updateTransitGps(); } catch (e) { window.__err = String(e && e.message); } }, [lat, lng]);
    await page.clock.runFor(5000);
  };
  const snap = (page) => page.evaluate(() => ({ g: window._gpsMaxIdx, sub: window._trkSubConfirmed ? window._trkSubConfirmed() : _trkSubConfirmed(), route: window.__calls.route, bus: window._trk.last && window._trk.last.bus, mode: window._trk.last && window._trk.last.mode, boarded: window._htlBoarded, err: window.__err }));

  console.log('[승용차 — 출발지에서 승용차로 달려 지하철역 곁을 지나간다]');
  {
    const { ctx, page, errs } = await mk();
    let everSub = false, maxG = -1, snaps = [];
    // 30초 서 있다가(승차 정류장 B0 에서 500m 떨어진 출발지) 승용차로 달린다(시속 50km, 3km 를 3.5분에)
    for (let s = 0; s < 30; s += 5) await tick(page, LAT0, X(500));
    await page.evaluate(() => { window._rideEvStartMs = Date.now(); window._htlBoarded = true; window._boardWhy = '복합증거 GPS1 기지국0 PF0'; });
    for (let s = 0; s < 240; s += 5) {
      await tick(page, LAT0, X(500 + s * 14));
      const r = await snap(page); snaps.push(r); if (r.sub) everSub = true; if (r.g > maxG) maxG = r.g;
    }
    const last = snaps[snaps.length - 1];
    await t('엔진이 버스가 아니라고 답한다(승차 정류장을 지난 적 없음)', async () => { assert.ok(snaps.some(r => r.bus && r.bus.state === 'notBus'), JSON.stringify(snaps.map(r => r.bus && r.bus.state + ':' + r.bus.why).slice(0, 30))); });
    await t('승용차로 역 곁을 지나도 지하철 탑승 확정으로 보지 않는다', async () => { assert.strictEqual(everSub, false, JSON.stringify(snaps.map(r => r.g + '/' + r.sub))); });
    await t('현재 위치에서 다시 찾는다(재탐색 요청)', async () => { assert.ok(last.route >= 1, JSON.stringify(last)); });
    await t('JS 오류가 없다', async () => { assert.deepStrictEqual(errs.filter(e => !/Failed to fetch|NetworkError|Load failed/.test(e)), []); assert.ok(!last.err, last.err); });
    await ctx.close();
  }

  console.log('[진짜 버스 — 승차 정류장에서 기다렸다 타고 간다]');
  {
    const { ctx, page, errs } = await mk();
    // 승차 정류장 B0(x=0)에서 1분 기다린 뒤 버스(시속 25km)로 간다. 계획 시각대로.
    await page.evaluate(() => { _transitNodeData[0].lng = 126.9 + 0 / 88000; });
    let snaps = [];
    for (let s = 0; s < 60; s += 5) await tick(page, LAT0, X(0));
    await page.evaluate(() => { window._rideEvStartMs = Date.now(); window._htlBoarded = true; window._boardWhy = '복합증거 GPS1 기지국0 PF0'; window._gpsMaxIdx = 1; window._gpsConfirmIdx = 1; window._nodePassMs = { 1: Date.now() }; });
    for (let s = 0; s < 200; s += 5) { await tick(page, LAT0, X(s * 7)); snaps.push(await snap(page)); }
    const last = snaps[snaps.length - 1];
    await t('승차 정류장을 지났으니 버스로 본다(재탐색 없음)', async () => { assert.strictEqual(last.route, 0, JSON.stringify(last)); assert.ok(!snaps.some(r => r.bus && r.bus.state === 'notBus'), JSON.stringify(snaps.map(r => r.bus && r.bus.state))); });
    await t('엔진이 GPS 를 더 쓰는 버스 모드를 준다', async () => { assert.ok(last.mode && last.mode.kind === 'bus' && last.mode.gps === 'heavy', JSON.stringify(last.mode)); });
    await t('진행도가 GPS 를 따라 올라간다', async () => { assert.ok(last.g >= 2, JSON.stringify(last)); });
    await t('JS 오류가 없다', async () => { assert.deepStrictEqual(errs.filter(e => !/Failed to fetch|NetworkError|Load failed/.test(e)), []); assert.ok(!last.err, last.err); });
    await ctx.close();
  }
  await b.close();
  console.log('ride_car_not_bus:', pass, 'pass', fail, 'fail'); process.exit(fail ? 1 : 0);
})();
