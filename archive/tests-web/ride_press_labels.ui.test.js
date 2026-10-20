// 2026-10-13 (YJ 로그): ① 탑승·환승 버튼이 PF·기지국이 먼저 찍은 가짜 통과 시각을 덮어쓰고, 버튼 직후 GPS 가 승차역에서 멀면(엔진 /ride-track press) 되돌린다
//   ② 엔진 응답이 끊겨도 마커가 굳지 않는다(pos.segs 에서 지금 시각의 구간을 찾아 그림) ③ 오버레이 이름은 엔진이 줄이고(6글자 …) 이동 중엔 '다음역(이동중)'
// 실행: node test/ride_press_labels.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
const KX = 88000, LAT0 = 37.5, LNG0 = 126.9;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const mk = async (opts) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: LAT0, longitude: LNG0 }, permissions: ['geolocation'] });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    const em = require('./helpers/eta_mock'); await em.installEtaMock(page); em.autoWait(page);
    await page.clock.install({ time: new Date('2026-10-13T17:50:00+09:00') });
    await page.goto('file://' + html); await page.clock.runFor(2500);
    await page.evaluate(([lat0, lng0, kx]) => {
      window.fmapDoRoute = function () {};
      const midnight = new Date('2026-10-13T00:00:00+09:00'), base = (new Date('2026-10-13T17:56:00+09:00') - midnight) / 60000;
      const hm = (m) => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.floor(m % 60)).slice(-2);
      const nd = (name, x, min, o) => Object.assign({ name, lat: lat0, lng: lng0 + x / kx, isWalk: false, isOrigin: false, isSub: false, isBus: false, _schedMin: base + min, _plan0: base + min, arrTime: hm(base + min), el: null }, o);
      // 출발 → 버스(B0,B1) → 지하철(테크노파크 x=3000, 송도국제도시역앞 x=5000, 원인재 x=7000, 신연수 x=9000)
      _transitNodeData = [nd('출발', 0, -3, { isOrigin: true }), nd('B0', 500, -2, { isBus: true, lineName: '순환43' }), nd('B1', 2900, 1, { isBus: true, lineName: '순환43' }),
        nd('테크노파크', 3000, 3, { isSub: true, lineName: '인천1호선' }), nd('송도국제도시역앞', 5000, 5, { isSub: true, lineName: '인천1호선' }), nd('원인재', 7000, 7, { isSub: true, lineName: '인천1호선' }), nd('신연수', 9000, 9, { isSub: true, lineName: '인천1호선' })];
      window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null; window._trackSig = 'T'; window._trackBase = 1;
      window._gpsMaxIdx = 3; window._gpsConfirmIdx = 3; window._htlBoarded = true;
      const card = document.getElementById('transitResultCard'); if (card) card.style.display = 'block';
    }, [LAT0, LNG0, KX]);
    await page.clock.setSystemTime(new Date('2026-10-13T17:53:30+09:00'));
    return { ctx, page, errs };
  };

  console.log('[버튼 — 가짜 추정 시각을 덮어쓴다]');
  {
    const { ctx, page, errs } = await mk();
    const r = await page.evaluate(() => {
      const old = Date.now() - 15 * 60000;
      window._nodePassMs = { 3: old, 4: old + 60000 }; window._nodePassSrc = { 3: 'pf', 4: 'cell' }; window._nodePassPf = {};
      _rs.leg = _rsLegs()[1]; _rsPress(true);
      return { old, now: Date.now(), p3: window._nodePassMs[3], s3: window._nodePassSrc[3], p4: window._nodePassMs[4], leg: _rs.leg && _rs.leg.name };
    });
    await t('추정(pf) 시각이 누른 시각으로 바뀐다', async () => { assert.ok(Math.abs(r.p3 - r.now) < 3000 && r.s3 === 'board', JSON.stringify(r)); });
    await t('이 역 뒤의 추정(cell) 통과 시각은 지운다', async () => { assert.strictEqual(r.p4, undefined, JSON.stringify(r)); });
    await ctx.close();
  }
  {
    const { ctx, page } = await mk();
    const r = await page.evaluate(() => {
      const old = Date.now() - 15 * 60000; window._nodePassMs = { 3: old, 4: old + 60000 }; window._nodePassSrc = { 3: 'gps', 4: 'gps' };
      _rs.leg = _rsLegs()[1]; _rsPress(true);
      return { old, p3: window._nodePassMs[3], p4: window._nodePassMs[4] };
    });
    await t('GPS 로 확인한 시각은 건드리지 않는다', async () => { assert.ok(r.p3 === r.old && r.p4 === r.old + 60000, JSON.stringify(r)); });
    await ctx.close();
  }
  console.log('[버튼 — 직후 GPS 확인(엔진 /ride-track press)]');
  for (const [label, dx, expectUndo] of [['승차역에서 3km 떨어져 있으면 버튼을 거둔다', 6000, true], ['승차역 근처면 그대로 둔다', 3050, false]]) {
    const { ctx, page } = await mk();
    const old = await page.evaluate(([dx, lat0, lng0, kx]) => {
      const o = Date.now() - 15 * 60000; window._nodePassMs = { 3: o }; window._nodePassSrc = { 3: 'pf' }; window._nodePassPf = {};
      _ev.trail = []; for (let i = 6; i >= 0; i--) _ev.trail.push({ ts: Date.now() - i * 3000, lat: lat0, lng: lng0 + dx / kx, acc: 10 });
      _rs.leg = _rsLegs()[1]; _rsPress(true); return o;
    }, [dx, LAT0, LNG0, KX]);
    await page.clock.runFor(1500);
    const r = await page.evaluate(() => ({ p3: window._nodePassMs[3], boarded: window._htlBoarded, why: window._boardWhy }));
    await t(label, async () => { if (expectUndo) assert.strictEqual(r.p3, old, JSON.stringify(r)); else assert.ok(Math.abs(r.p3 - old) > 60000 && r.why === '탑승 버튼', JSON.stringify(r)); });
    await ctx.close();
  }

  console.log('[마커 — 엔진 응답이 끊겨도 굳지 않는다]');
  {
    const { ctx, page } = await mk();
    await page.route('**/ride-eta', r => r.abort());
    const out = await page.evaluate(() => {
      const n = Date.now(), m = 60000;
      window._etaPosAt = n; window._gpsMaxIdx = 3; window._gpsConfirmIdx = 3; window._xferRouteRef = _transitNodeData; window._xferOK = { 3: true };
      window._etaPos = { from: 3, to: 4, t0: n - 30000, t1: n + 90000, ratio: .2, moving: true, floor: 3, segs: [
        { from: 3, to: 4, a: n - 60000, t0: n - 30000, t1: n + 90000 }, { from: 4, to: 5, a: n + 90000, t0: n + 115000, t1: n + 3 * m }, { from: 5, to: 6, a: n + 3 * m, t0: n + 3 * m + 25000, t1: n + 5 * m } ] };
      return { tt: _ttFirstOn() };
    });
    const at = async (sec) => { const pn = await page.evaluate(() => Date.now()); await page.clock.setSystemTime(new Date(pn + sec * 1000)); return page.evaluate(() => ({ tp: _estimateTimelinePos(), mv: _ovlMoving() })); };
    await t('구간 안이면 이동 중으로 그린다', async () => { assert.ok(out.tt); const r = await at(0); assert.ok(r.mv && r.tp.fromIdx === 3 && r.tp.toIdx === 4, JSON.stringify(r)); });
    await t('응답 없이 2분이 지나도 다음 구간(4→5)을 이어 그린다(굳지 않는다)', async () => { const r = await at(120); assert.ok(r.mv && r.tp.fromIdx === 4 && r.tp.toIdx === 5 && r.tp.ratio > 0 && r.tp.ratio < 1, JSON.stringify(r)); });
    await t('응답 없이 4분이 지나도 5→6 구간을 그린다', async () => { const r = await at(120); assert.ok(r.tp.fromIdx === 5 && r.tp.toIdx === 6, JSON.stringify(r)); });
    await ctx.close();
  }

  console.log('[오버레이 이름 — 엔진이 줄이고, 이동 중엔 다음역(이동중)]');
  {
    const { ctx, page } = await mk();
    await page.evaluate(() => { _ovlLabelsEnsure(); });
    await page.clock.runFor(1500);
    const r = await page.evaluate(() => {
      const n = Date.now(); window._gpsMaxIdx = 3; window._gpsConfirmIdx = 3; window._xferRouteRef = _transitNodeData; window._xferOK = { 3: true };
      window._etaPosAt = n; window._etaPos = { from: 3, to: 4, t0: n - 30000, t1: n + 90000, ratio: .3, moving: true, floor: 3, segs: [{ from: 3, to: 4, a: n - 60000, t0: n - 30000, t1: n + 90000 }] };
      const L = _ovlLines(); return { l1: L.l1, pill: L.pill, track: L.track, moving: L.moving, n: _ovlLab.labels && Object.keys(_ovlLab.labels).length };
    });
    await t('엔진이 이름을 줄여 준다(받은 값)', async () => { assert.ok(r.n >= 4, JSON.stringify(r)); });
    await t('이동 중이면 알약 문구가 다음역(이동중) — 6글자 넘으면 …', async () => { assert.ok(r.moving && r.pill === '송도국제도시…(이동중)', JSON.stringify(r)); });
    await t('윗줄·칸 이름도 6글자 …', async () => { assert.ok(r.l1.indexOf('송도국제도시…') >= 0 && r.track.indexOf('송도국제도시…') >= 0, JSON.stringify(r)); });
    const r2 = await page.evaluate(() => { const n = Date.now(); window._etaPos = { from: 3, to: 4, t0: n + 30000, t1: n + 150000, ratio: 0, moving: false, floor: 3, segs: [{ from: 3, to: 4, a: n - 20000, t0: n + 30000, t1: n + 150000 }] }; const L = _ovlLines(); return { pill: L.pill, moving: L.moving }; });
    await t('정차 중이면 알약 문구는 비워 현재 역을 그대로 쓴다', async () => { assert.ok(!r2.moving && r2.pill === '', JSON.stringify(r2)); });
    await ctx.close();
  }
  console.log('[영점 — 일찍·늦게 닿은 열차의 통과 시각을 엔진이 찾아 주면 앱은 그 시각을 증거로 다시 보낸다]');
  {
    const { ctx, page } = await mk();
    const r = await page.evaluate(() => {
      const now = Date.now(); let calls = 0; const orig = window._etaRequest; window._etaRequest = function () { calls++; };
      window._nodePassMs = { 3: now - 6 * 60000, 4: now - 100000 }; window._nodePassSrc = { 3: 'gps', 4: 'pf' }; window._nodePassPf = {};
      const stops = _arrEndStops();
      const out = { passFlags: stops.map(s => s.i + ':' + (s.pass ? 1 : 0)).join(',') };
      _zeroFollow({ stops: [{ i: 4, apply: true, state: 'near', passMs: now - 20000, passEarlySec: -92, dtSec: -70 }], final: null });
      out.p4 = now - window._nodePassMs[4]; out.s4 = window._nodePassSrc[4]; out.calls = calls;
      // 앞 역(3)보다 이르게 찍힌 값은 버린다
      _zeroFollow({ stops: [{ i: 5, apply: true, state: 'near', passMs: now - 7 * 60000, passEarlySec: -90, dtSec: -70 }], final: null });
      out.p5 = window._nodePassMs[5];
      // 이미 GPS 로 못 박은 같은 값은 다시 보내지 않는다
      const c0 = calls; _zeroFollow({ stops: [{ i: 4, apply: true, state: 'near', passMs: now - 20000, passEarlySec: -92, dtSec: -70 }], final: null }); out.again = calls - c0;
      window._etaRequest = orig; return out;
    });
    await t('승차역(첫 교통 노드) 뒤 역에만 통과 시각 요청(pass) — GPS 로 확정한 역은 제외', async () => { assert.ok(r.passFlags.indexOf('3:0') >= 0 && r.passFlags.indexOf('4:1') >= 0 && r.passFlags.indexOf('1:0') >= 0, r.passFlags); });
    await t('엔진이 준 통과 시각을 gps 증거로 적고 엔진에 다시 묻는다', async () => { assert.ok(Math.abs(r.p4 - 20000) < 1500 && r.s4 === 'gps' && r.calls >= 1, JSON.stringify(r)); });
    await t('앞 역보다 이른 통과 시각은 버린다', async () => { assert.strictEqual(r.p5, undefined, JSON.stringify(r)); });
    await t('같은 값은 다시 보내지 않는다', async () => { assert.strictEqual(r.again, 0, JSON.stringify(r)); });
    await ctx.close();
  }
  await b.close();
  console.log('ride_press_labels:', pass, 'pass', fail, 'fail'); process.exit(fail ? 1 : 0);
})();
