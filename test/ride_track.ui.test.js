// 경로 이탈·승차 안 함 판정이 엔진(/ride-track)을 거쳐 앱에 적용되는지 — 헤드리스 Chromium + 가짜 시계 + 진짜 엔진(eta_mock).
// 앱은 판정하지 않는다: 엔진 응답이 오면 따르고, 엔진이 안 열리면 마지막 판정을 유지한다(재탐색 안 함).
// 실행: node test/ride_track.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const mk = async (opts) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    const em = require('./helpers/eta_mock');
    await em.installEtaMock(page); em.autoWait(page);
    if (opts && opts.noTrack) { await page.route('**/ride-track', r => r.abort()); }     // 나중에 등록한 규칙이 먼저 적용된다
    await page.clock.install({ time: new Date('2026-10-04T12:40:00+09:00') });
    await page.goto('file://' + html); await page.clock.runFor(2500);
    await page.evaluate(() => {
      window.__calls = { route: 0 }; window.fmapDoRoute = function () { window.__calls.route++; };
      const base = new Date('2026-10-04T12:52:00+09:00'), midnight = new Date('2026-10-04T00:00:00+09:00');
      const mkn = (i) => { const m = (base - midnight) / 60000 + i * 2; return { name: 'S' + i, lat: 37.5, lng: 126.9 + 0.0137 * i, isSub: true, isBus: false, isWalk: false, isOrigin: false, lineName: '공항철도', _schedMin: m, arrTime: ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.floor(m % 60)).slice(-2), el: null }; };
      const nodes = [{ name: '출발', lat: 37.5, lng: 126.9 - 0.004, isOrigin: true, isWalk: false, isSub: false, isBus: false, _schedMin: (base - midnight) / 60000 - 5, el: null }];
      for (let i = 0; i < 9; i++) nodes.push(mkn(i));
      _transitNodeData = nodes; window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null; window._trackSig = 'T1'; window._trackBase = 1;
      window._gpsMaxIdx = -1; window._gpsConfirmIdx = -1; window._nodePassMs = {}; window._htlBoarded = false;
      S.lastGPSFix = null; _fmapStart = { type: 'gps' };
      const card = document.getElementById('transitResultCard'); if (card) card.style.display = 'block';
      window._rideEvReset && window._rideEvReset('시험');
    });
    return { ctx, page, errs };
  };
  const feed = (page, lat, lng, acc) => page.evaluate(([la, ln, ac]) => { S.lastGPSFix = { lat: la, lng: ln, ts: Date.now(), acc: ac || 15 }; try { _pfTick(); } catch (e) {} }, [lat, lng, acc]);
  const req = async (page) => { await page.evaluate(() => { window._trk.at = 0; window._trkRequest('시험'); }); await page.clock.runFor(100); };
  const ride = async (page, secs, latOf, lngOf) => { for (let s = 0; s < secs; s += 5) { await feed(page, latOf(s), lngOf(s)); await page.clock.runFor(5000); if (s % 10 === 0) await req(page); } await req(page); };
  const KM = 0.0137 / 1.2;       // 경도 1km ≈ 0.0137/1.2
  const LAT = (m) => 37.5 + m / 111000;

  console.log('[경로 이탈 — 엔진 판정을 따른다]');
  {
    const { ctx, page, errs } = await mk();
    await page.evaluate(() => { window._htlBoarded = true; window._gpsMaxIdx = 3; window._gpsConfirmIdx = 3; });
    await page.clock.setSystemTime(new Date('2026-10-04T12:58:00+09:00'));
    // 경로(위도 37.5) 위에서 달린다
    await ride(page, 60, () => 37.5, (s) => 126.9 + 0.0137 * (3 + s / 100));
    await t('경로 위를 달리면 재탐색하지 않는다', async () => { assert.strictEqual(await page.evaluate(() => window.__calls.route), 0); });
    // 경로에서 800m 북쪽으로 벗어난 채 계속 달린다 — 지하철 탑승이 확정된 상태(진행 노드가 지하철)에서는 이탈 판정을 하지 않는다(2026-10-12 YJ)
    await ride(page, 120, () => LAT(800), (s) => 126.9 + 0.0137 * (3.6 + s / 100));
    await t('지하철 탑승이 확정이면 경로에서 800m 벗어나도 재탐색하지 않는다', async () => {
      const r = await page.evaluate(() => ({ c: window.__calls.route, off: window._trk.last && window._trk.last.off }));
      assert.strictEqual(r.c, 0, JSON.stringify(r));
    });
    await t('JS 오류가 없다', async () => { assert.deepStrictEqual(errs.filter(e => !/Failed to fetch|NetworkError|Load failed/.test(e)), []); });
    await ctx.close();
  }
  console.log('[경로 이탈 — 버스 진행 중에는 엔진 판정을 따른다]');
  {
    const { ctx, page, errs } = await mk();
    await page.evaluate(() => { _transitNodeData.forEach((n) => { if (!n.isOrigin) { n.isSub = false; n.isBus = true; } }); window._htlBoarded = true; window._gpsMaxIdx = 3; window._gpsConfirmIdx = 3; });
    await page.clock.setSystemTime(new Date('2026-10-04T12:58:00+09:00'));
    await ride(page, 60, () => 37.5, (s) => 126.9 + 0.0137 * (3 + s / 100));
    await t('경로 위를 달리면 재탐색하지 않는다', async () => { assert.strictEqual(await page.evaluate(() => window.__calls.route), 0); });
    await ride(page, 120, () => LAT(800), (s) => 126.9 + 0.0137 * (3.6 + s / 100));
    await t('경로에서 800m 벗어난 채 2분 가면 엔진이 이탈을 판정하고 앱이 재탐색한다', async () => {
      const r = await page.evaluate(() => ({ c: window.__calls.route, off: window._trk.last && window._trk.last.off }));
      assert.ok(r.c >= 1, JSON.stringify(r));
    });
    await t('재탐색 3분 쿨다운 안에서는 다시 재탐색하지 않는다', async () => {
      const c0 = await page.evaluate(() => window.__calls.route);
      await ride(page, 60, () => LAT(900), (s) => 126.9 + 0.0137 * (4.5 + s / 100));
      assert.strictEqual(await page.evaluate(() => window.__calls.route), c0);
    });
    await t('JS 오류가 없다', async () => { assert.deepStrictEqual(errs.filter(e => !/Failed to fetch|NetworkError|Load failed/.test(e)), []); });
    await ctx.close();
  }
  console.log('[엔진이 안 열릴 때 — 마지막 판정 유지, 앱이 대신 계산하지 않는다]');
  {
    const { ctx, page } = await mk({ noTrack: true });
    await page.evaluate(() => { window._htlBoarded = true; window._gpsMaxIdx = 3; window._gpsConfirmIdx = 3; });
    await page.clock.setSystemTime(new Date('2026-10-04T12:58:00+09:00'));
    await ride(page, 150, () => LAT(800), (s) => 126.9 + 0.0137 * (3 + s / 100));
    await t('엔진 응답이 없으면 이탈로 재탐색하지 않는다', async () => { assert.strictEqual(await page.evaluate(() => window.__calls.route), 0); });
    await t('엔진 응답이 없으면 못 탔다는 증명도 서지 않는다(_missProof 거짓)', async () => { assert.strictEqual(await page.evaluate(() => window._missProof()), false); });
    await ctx.close();
  }
  console.log('[끊긴 GPS — 낡은 위치로 못 탔다고 하지 않는다]');
  {
    const { ctx, page } = await mk();
    await page.clock.setSystemTime(new Date('2026-10-04T12:51:30+09:00'));
    for (let k = 0; k < 30; k++) { await feed(page, 37.5, 126.9, 15); await page.clock.runFor(5000); }
    await req(page);
    await t('역에 서 있으면(신선한 GPS) 정지 증명이 선다', async () => { assert.strictEqual(await page.evaluate(() => window._missProof()), true); });
    await page.clock.runFor(60000);            // 지하로 들어가 GPS 가 끊긴 채 1분
    await req(page);
    await t('GPS 가 끊긴 지 25초가 넘으면 같은 자리라도 정지 증명이 서지 않는다', async () => { assert.strictEqual(await page.evaluate(() => window._missProof()), false); });
    await ctx.close();
  }
  console.log('[승차 안 함 — 걸어서 멀어져도 열차를 탄 것이 아니다(지하철 먼저 계획)]');
  const walkTest = async (name, speedMps, expectBoarded) => {
    const { ctx, page } = await mk();
    await page.clock.setSystemTime(new Date('2026-10-04T12:51:00+09:00'));
    // 승차역(S0, 노드1)에 도착해 기다리다가 출발 시각이 지난 뒤 서쪽으로 이동
    await page.evaluate(() => { try { _htlWait.arrived = true; } catch (e) {} });
    for (let k = 0; k < 24; k++) { await feed(page, 37.5, 126.9, 15); await page.clock.runFor(5000); }
    const lng0 = 126.9; let m = 0;
    for (let s = 0; s < 480; s += 5) {
      m += speedMps * 5; await feed(page, 37.5, lng0 - m / 1000 * (0.0137 / 1.2), 15); await page.clock.runFor(5000);
      if (s % 10 === 0) { await req(page); await page.evaluate(() => { try { _htlBoardWatch(); } catch (e) {} }); }
    }
    await t(name, async () => { const r = await page.evaluate(() => ({ b: window._htlBoarded === true, w: window._boardWhy, bd: window._trk.last && window._trk.last.board })); assert.strictEqual(r.b, expectBoarded, JSON.stringify(r)); });
    await ctx.close();
  };
  await walkTest('걷는 속도(1.3m/s)로 승차역에서 멀어지면 승차 확정하지 않는다', 1.3, false);
  await walkTest('열차 속도(14m/s)로 멀어지면 승차로 확정된다(엔진이 막지 않는다)', 14, true);
  console.log(`\n${pass} 통과, ${fail} 실패`); await b.close(); process.exit(fail ? 1 : 0);
})();
