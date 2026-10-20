// 버스·차로 이동 중 '확정'을 눌렀을 때 열차 탑승으로 오인하지 않는지 시험 — 헤드리스 Chromium + 가짜 시계.
// (YJ 제보 2026-10-06: 6:18 열차 추천 → 버스 이동 중 확정 → 이미 떠난 5:58 열차로 시각이 당겨졌다)
// 실행: node test/bus_not_train.ui.test.js [html 경로]   (Playwright: /opt/node-tools/node_modules/playwright)
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
const MLNG = 1 / 88300;   // 위도 37.5 에서 1m 의 경도(도)
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
  const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page); global.etaWait = () => __em.etaWait(page);
  await page.clock.install({ time: new Date('2026-10-06T06:00:00+09:00') });
  await page.goto('file://' + html);
  await page.clock.runFor(2500);

  // 장면: 승차역 S0(경도 126.9)에서 06:18 출발, 20분 간격(05:58/06:18). 확정(locked) 상태.
  const setup = (startAt) => page.evaluate((startAt) => {
    window.__calls = { route: 0 };
    window.fmapDoRoute = function () { window.__calls.route++; };
    const base = new Date(startAt), midnight = new Date(startAt.slice(0, 10) + 'T00:00:00+09:00');
    const baseMin = (base - midnight) / 60000;
    const hm = (m) => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.floor(m % 60)).slice(-2);
    const nodes = [{ name: '출발', lat: 37.5, lng: 126.9 - 0.012, isOrigin: true, isWalk: false, isSub: false, isBus: false, _schedMin: baseMin - 10, el: null }];
    for (let i = 0; i < 6; i++) { const m = baseMin + i * 2; nodes.push({ name: 'S' + i, lat: 37.5, lng: 126.9 + 0.0137 * i, isSub: true, isBus: false, isWalk: false, isOrigin: false, lineName: '인천1호선', _schedMin: m, el: null, arrTime: hm(m) }); }
    _transitNodeData = nodes; window._lastHtlNodes = nodes; window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null;
    window._trackSig = 'T' + Math.random(); window._trackBase = 1; window._gpsMaxIdx = -1; window._gpsConfirmIdx = -1; window._nodePassMs = {}; window._htlBoarded = false;
    window._pf && (_pf.A = null); S.lastGPSFix = null; _fmapStart = { type: 'gps' };
    try { _htlWait.on = false; _htlWait.arrived = false; } catch (e) {}
    const card = document.getElementById('transitResultCard'); if (card) card.style.display = 'block';
    window._rideEvReset && window._rideEvReset('시험'); _ev.trail = []; _ev.cell = []; _ev.cache = null; _ev.cacheAt = 0;
    window.__stn = nodes[1].arrTime;
  }, startAt);
  const step = async (lng, lat) => {
    await page.evaluate(([lng, lat]) => { S.lastGPSFix = { lat: lat || 37.5, lng, ts: Date.now(), acc: 15 }; try { _pfTick(); } catch (e) {} try { _htlBoardWatch(); } catch (e) {} try { _htlWaitTick(true); } catch (e) {} }, [lng, lat]);
    await page.clock.runFor(5000);
  };
  const state = () => page.evaluate(() => ({ boarded: window._htlBoarded === true, gm: window._gpsMaxIdx, pass: Object.keys(window._nodePassMs || {}).length, arr: _transitNodeData[1].arrTime, riding: window._rideEv().riding, arrived: _htlWait.arrived === true }));

  console.log('[버스가 승차역 옆을 달려 지나감]');
  await setup('2026-10-06T06:18:00+09:00');
  await page.clock.setSystemTime(new Date('2026-10-06T06:08:00+09:00'));
  // 06:08 부터 시속 36km(10m/s)로 역 서쪽 1.1km → 역 옆을 지나 동쪽 1.5km 까지
  for (let k = 0; k <= 52; k++) await step(126.9 - 1100 * MLNG + k * 50 * MLNG);
  const s1 = await state();
  await t('역 옆을 달려 지나가도 승차 확정이 되지 않는다', async () => { assert.strictEqual(s1.boarded, false); });
  await t('승차역 도착으로도 기록되지 않는다', async () => { assert.strictEqual(s1.arrived, false); });
  await t('통과 기록·진행도가 생기지 않는다', async () => { assert.strictEqual(s1.pass, 0); assert.ok(s1.gm <= -1, 'gm=' + s1.gm); });
  await t('승차역 시각이 이미 떠난 열차(05:58)로 당겨지지 않는다', async () => { assert.strictEqual(s1.arr, '06:18', JSON.stringify(await page.evaluate(() => ({ last: window._etaLast, P: window._etaPayload() })))); });

  console.log('[걸어서 승차역에 닿아 열차를 탐]');
  await setup('2026-10-06T06:18:00+09:00');
  await page.clock.setSystemTime(new Date('2026-10-06T06:12:00+09:00'));
  // 06:12 역 서쪽 400m 에서 1.4m/s 로 걸어 역(06:12:00+~285초)에 닿고 06:18 까지 승강장에 서 있다가
  let lng = 126.9 - 400 * MLNG;
  for (let k = 0; k < 60; k++) { lng = Math.min(126.9, lng + 7 * MLNG); await step(lng); }   // 5초 × 60 = 300초
  const sw = await state();
  await t('걸어서 닿으면 승차역 도착으로 기록된다', async () => { assert.strictEqual(sw.arrived, true); });
  await t('승강장에 서 있는 동안은 승차 확정이 되지 않는다', async () => { assert.strictEqual(sw.boarded, false); });
  await page.clock.setSystemTime(new Date('2026-10-06T06:18:00+09:00'));
  await page.evaluate(() => { _ev.trail = _ev.trail.filter(p => p.ts > Date.now() - 60000); });
  // 06:18 열차 출발: 시속 54km(15m/s)로 동쪽
  for (let k = 0; k < 40; k++) await step(126.9 + k * 75 * MLNG);
  const sr = await state();
  await t('걸어서 탄 뒤 열차로 멀어지면 승차 확정이 된다(기존 기능 유지)', async () => { assert.strictEqual(sr.boarded, true); });

  console.log('[버스로 와서 역 앞에서 내려 걸어감]');
  await setup('2026-10-06T06:18:00+09:00');
  await page.clock.setSystemTime(new Date('2026-10-06T06:07:00+09:00'));
  // 역 서쪽 1.2km → 300m 까지 10m/s 로 와서 정차(내림), 이후 1.4m/s 로 걸어 역에 닿는다
  for (let k = 0; k <= 18; k++) await step(126.9 - 1200 * MLNG + k * 50 * MLNG);   // 900m 달림 → 300m 전
  let lw = 126.9 - 300 * MLNG;
  for (let k = 0; k < 14; k++) await step(lw);                                      // 70초 서 있음(하차·정차)
  for (let k = 0; k < 46; k++) { lw = Math.min(126.9, lw + 7 * MLNG); await step(lw); }
  const sb = await state();
  await t('버스에서 내려 걸어 닿으면 승차역 도착으로 기록된다', async () => { assert.strictEqual(sb.arrived, true); });
  await t('버스에서 내려 걸어 닿은 것만으로 승차 확정이 되지 않는다', async () => { assert.strictEqual(sb.boarded, false); });

  console.log('[버스 → 걸어서 역 → 06:18 열차]');
  await setup('2026-10-06T06:18:00+09:00');
  await page.clock.setSystemTime(new Date('2026-10-06T06:00:00+09:00'));
  for (let k = 0; k <= 18; k++) await step(126.9 - 1200 * MLNG + k * 50 * MLNG);   // 버스 90초
  let l4 = 126.9 - 300 * MLNG;
  for (let k = 0; k < 14; k++) await step(l4);
  for (let k = 0; k < 46; k++) { l4 = Math.min(126.9, l4 + 7 * MLNG); await step(l4); }
  await page.clock.setSystemTime(new Date('2026-10-06T06:18:00+09:00'));
  for (let k = 0; k < 40; k++) await step(126.9 + k * 75 * MLNG);                   // 06:18 열차 출발
  const s4 = await state();
  await t('버스를 탔다가 걸어서 열차를 타도 승차 확정이 된다', async () => { assert.strictEqual(s4.boarded, true); });
  await t('그때 승차 시각이 버스 출발 시각으로 당겨지지 않는다(06:15 이후)', async () => { assert.ok(s4.arr >= '06:15', 'arr=' + s4.arr); });

  console.log(`\n${pass} 통과 / ${fail} 실패`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
