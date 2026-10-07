// 위치 근거(GPS·기지국)가 끊겼을 때(지하·백그라운드) 마커·오버레이가 마지막 역에 굳지 않는지 시험 — 헤드리스 Chromium + 가짜 시계.
// (YJ 제보 2026-10-06: "오버레이에서 시간은 줄고 있는데 역은 안 바뀌어", "동수인데 부평으로 나와")
// 실행: node test/overlay_stale.ui.test.js [html 경로]   (Playwright: /opt/node-tools/node_modules/playwright)
const assert = require('assert'), path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
  const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page); global.etaWait = () => __em.etaWait(page);
  await page.clock.install({ time: new Date('2026-10-06T06:00:00+09:00') });
  await page.goto('file://' + html);
  await page.clock.runFor(2500);

  // 장면: 06:19 출발, 역 8개(2분 간격), 확정(locked). boarded 면 승차 확정 + 첫 역 통과 기록.
  const setup = async (boarded) => {
    await page.evaluate(() => {
      window.fmapDoRoute = function () {};
      const startAt = '2026-10-06T06:19:00+09:00', base = new Date(startAt), midnight = new Date('2026-10-06T00:00:00+09:00');
      const baseMin = (base - midnight) / 60000;
      const hm = (m) => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.floor(m % 60)).slice(-2);
      const nodes = [{ name: '출발', lat: 37.5, lng: 126.9 - 0.004, isOrigin: true, isWalk: false, isSub: false, isBus: false, _schedMin: baseMin - 5, el: null }];
      for (let i = 0; i < 8; i++) { const m = baseMin + i * 2; nodes.push({ name: 'S' + i, lat: 37.5, lng: 126.9 + 0.0137 * i, isSub: true, isBus: false, isWalk: false, isOrigin: false, lineName: '인천1호선', _schedMin: m, el: null, arrTime: hm(m) }); }
      _transitNodeData = nodes; window._lastHtlNodes = nodes; window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null;
      window._trackSig = 'T' + Math.random(); window._trackBase = 1; window._gpsMaxIdx = -1; window._gpsConfirmIdx = -1; window._nodePassMs = {}; window._htlBoarded = false;
      window._pf && (_pf.A = null); S.lastGPSFix = null; _fmapStart = { type: 'gps' };
      try { _htlWait.on = false; _htlWait.arrived = false; } catch (e) {}
      const card = document.getElementById('transitResultCard'); if (card) card.style.display = 'block';
      window._rideEvReset && window._rideEvReset('시험'); _ev.trail = []; _ev.cell = []; _ev.cache = null; _ev.cacheAt = 0;
      window._cellMovingState = function () { return window.__cmv === undefined ? null : window.__cmv; };
    });
    await page.clock.setSystemTime(new Date('2026-10-06T06:19:00+09:00'));
    if (boarded) await page.evaluate(() => { window._htlBoarded = true; window._gpsMaxIdx = 1; window._gpsConfirmIdx = 1; window._nodePassMs = { 1: Date.now() }; window.__cmv = undefined; });
    else await page.evaluate(() => { window.__cmv = undefined; });
  };
  const here = () => page.evaluate(() => ({ pip: _pipHereIdx(), gm: window._gpsMaxIdx, stale: window._evStaleMs() }));
  const advance = async (sec) => { for (let s = 0; s < sec; s += 5) { await page.evaluate(() => { try { _ovlNativeTick(); } catch (e) {} }); await page.clock.runFor(5000); } };

  console.log('[탑승 확정 후 근거가 끊김]');
  await setup(true);
  await advance(60);
  const a60 = await here();
  await t('근거가 끊긴 지 90초 안에는 시각표로 앞서가지 않는다(마지막 확인 역 +1까지)', async () => { assert.ok(a60.pip <= 2, 'pip=' + a60.pip); assert.strictEqual(a60.stale, -1); });
  await advance(240);   // 06:24 — 예정상 3번째 역(S3, 인덱스 4)을 막 지남
  const a300 = await here();
  await t('근거 없이 5분이 흘러도 오버레이 위치가 시각표를 따라 나아간다(≥ 인덱스 2: 근거가 전혀 없을 땐 PF 가 지연을 넉넉히 가정한다)', async () => { assert.ok(a300.pip >= 2, 'pip=' + a300.pip); });
  await t('시각표를 따라가도 예정보다 앞서지는 않는다(예정 도착 인덱스 이하)', async () => { assert.ok(a300.pip <= 4, 'pip=' + a300.pip); });
  await advance(600);   // 06:34 — 노선 끝
  const a900 = await here();
  await t('끝까지 따라가고 종점을 넘지 않는다', async () => { assert.ok(a900.pip >= 7 && a900.pip <= 8, 'pip=' + a900.pip); });

  console.log('[기지국이 정차 중이라고 하면 따라가지 않는다]');
  await setup(true);
  await page.evaluate(() => { window.__cmv = false; });
  await advance(300);
  const c = await here();
  await t('정차 중(셀 변화 없음) 신호가 있으면 마지막 확인 역에서 더 나아가지 않는다', async () => { assert.ok(c.pip <= 2, 'pip=' + c.pip); assert.strictEqual(c.stale, -1); });

  console.log('[탑승 전에는 시각표로 앞서가지 않는다]');
  await setup(false);
  await advance(300);
  const n = await here();
  await t('승차 확정 전에는 근거가 없어도 승차역 위치(≤ 인덱스 1)에 머문다', async () => { assert.ok(n.pip <= 1, 'pip=' + n.pip); assert.strictEqual(n.stale, -1); });

  console.log('[근거가 돌아오면]');
  await setup(true);
  await advance(300);
  await page.evaluate(() => { S.lastGPSFix = { lat: 37.5, lng: 126.9 + 0.0137 * 1, ts: Date.now(), acc: 15 }; });   // 실제는 아직 2번째 역(인덱스 2) 근처
  const r = await here();
  await t('GPS 가 다시 오면 끊김 상태가 풀린다', async () => { assert.strictEqual(r.stale, -1); });
  await t('풀리면 확정 진행도 +1역 상한이 다시 적용된다(근거 없이 앞서지 않음)', async () => { assert.ok(r.pip <= r.gm + 1, 'pip=' + r.pip + ' gm=' + r.gm); });

  console.log('[기존: 근거가 있는 동안은 PF·상한이 그대로]');
  await setup(true);
  let bad = 0;
  for (let s = 0; s < 300; s += 5) {
    await page.evaluate((s) => { S.lastGPSFix = { lat: 37.5, lng: 126.9 + 0.0137 * (1 + s / 140), ts: Date.now(), acc: 15 }; try { _updateTransitGps(); } catch (e) {} try { _ovlNativeTick(); } catch (e) {} }, s);
    const h = await here(); if (h.stale !== -1) bad++;
    await page.clock.runFor(5000);
  }
  await t('GPS 가 계속 오는 동안은 끊김 상태가 한 번도 켜지지 않는다', async () => { assert.strictEqual(bad, 0); });
  console.log('[GPS 로 타다가 지하에서 끊김 — 열차 위치와 비교]');
  const blindRun = async (delay) => {
    await page.goto('file://' + html); await page.clock.runFor(2500);
    await setup(true);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); window._appInBackground = true; });
    const L = [];
    for (let sec = 0; sec < 600; sec += 5) {
      const se = Math.max(0, sec - delay), kk = Math.min(7, Math.floor(se / 120)), w = se % 120;
      const frac = kk >= 7 ? 0 : (w < 30 ? 0 : Math.min(1, (w - 30) / 90));
      const lng = 126.9 + 0.0137 * (kk + frac);
      await page.evaluate(([lng, on]) => { if (on) S.lastGPSFix = { lat: 37.5, lng, ts: Date.now(), acc: 15 }; try { _ovlNativeTick(); } catch (e) {} }, [lng, sec < 100]);
      if (sec >= 100) { const h = await here(); L.push(h.pip - (1 + kk)); }
      await page.clock.runFor(5000);
    }
    const mae = L.reduce((a, b) => a + Math.abs(b), 0) / L.length;
    return { mae, min: Math.min(...L), max: Math.max(...L), ahead: L.filter(x => x > 0).length / L.length };
  };
  const b0 = await blindRun(0);
  await t('열차가 시각표대로 가면 지하에서 8분 동안 오차 평균 0.3역 이하, 1역 넘게 어긋나지 않는다', async () => { assert.ok(b0.mae <= 0.3, 'mae=' + b0.mae); assert.ok(b0.min >= -1 && b0.max <= 1, b0.min + '/' + b0.max); });
  const b1 = await blindRun(150);
  await t('열차가 2분 30초 늦어도(GPS 로 지연을 배운 뒤 끊김) 오차 평균 0.3역 이하', async () => { assert.ok(b1.mae <= 0.3, 'mae=' + b1.mae); });
  await t('그때 실제보다 앞서 표시되는 시간이 25% 이하이고 1역 넘게 앞서지 않는다', async () => { assert.ok(b1.ahead <= 0.25, 'ahead=' + b1.ahead); assert.ok(b1.max <= 1, 'max=' + b1.max); });

  console.log('[기지국: 모르는 셀 / 학습된 셀]');
  const cellSetup = async () => {
    await page.goto('file://' + html); await page.clock.runFor(2500);   // 앞 장면의 PF·셀 상태가 남지 않게 새로 연다
    await setup(true);
    await page.evaluate(() => {
      window.__cmv = true; window.__cellKey = 'U0'; window._cellAssistAt = 0;
      window._cellMaxIdx = -1; window._timeMaxIdx = -1; window._cellHopAt = null; window._cellRecent = {}; _cellSeen = null; window._htlSanityAt = 0; window._driftFixAt = 0;
      window._cellPluginReady = function () { return true; };
      window._cellKey = function () { return window.__cellKey; };
      window._cellNow = function (cb) { window._cellLast = { key: window.__cellKey, ts: Date.now() }; try { _cellNoteObservation(window.__cellKey); } catch (e) {} cb({}); };
      window._cellMapMem = { KS1: { s: 'S1', l: '인천1호선', n: 10, t: Date.now() } };   // 학습된 셀: S1(인덱스 2)
    });
  };
  const cellAdvance = async (sec, keyAt) => {
    for (let s = 0; s < sec; s += 5) {
      await page.evaluate((k) => { if (k) window.__cellKey = k; try { _ovlNativeTick(); } catch (e) {} try { _cellAssist(); } catch (e) {} }, keyAt && keyAt(s));
      await page.clock.runFor(5000);
    }
  };
  await cellSetup();
  await cellAdvance(300, () => 'U0');   // 학습 안 된 셀 하나에 붙어 있음(움직이지만 어느 역인지는 모름)
  const u = await here();
  await t('학습 안 된 셀만 보이고 위치 근거가 없으면 시각표를 따라간다(≥ 인덱스 2)', async () => { assert.ok(u.pip >= 2, 'pip=' + u.pip); });
  await cellSetup();
  await cellAdvance(240, () => 'U0');   // 06:23 — 예정은 S2~S3 사이
  await cellAdvance(30, () => 'KS1');                         // 실제로는 열차가 늦어 S1(인덱스 2)의 셀에 붙어 있다
  const k = await here();
  await t('학습된 셀이 S1 을 가리키면 진행도가 그 역으로 확정된다(시각표가 더 앞서 있어도)', async () => { assert.strictEqual(k.gm, 2); });
  await t('그 뒤 오버레이 위치가 확정 진행도 +1역을 넘지 않는다', async () => { assert.ok(k.pip <= 3, 'pip=' + k.pip); });

  await t('JS 오류가 없다', async () => { assert.strictEqual(errs.length, 0, errs[0]); });

  console.log(`\n${pass} 통과 / ${fail} 실패`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
