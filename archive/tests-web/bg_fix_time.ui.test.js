// 백그라운드 위치 시각 · 엔진 요청 굳음 복구 — 2026-10-14 (실기기 로그: 앱을 켜자 쌓였던 위치가 모두 '지금' 시각으로 찍혀 지난 역 전부가 방금 지난 것으로 읽혔다 /
//   가려진 동안 응답 없는 엔진 요청이 '진행 중'으로 굳어 26분 동안 구간표가 갱신되지 않아 마커가 부평에서 멈췄다)
// 실행: node test/bg_fix_time.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 300)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh(opt) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    await page.addInitScript(() => {
      try { localStorage.setItem('gdm_loc_disclosed', '1'); localStorage.setItem('gdm_bat_asked_at', '1'); localStorage.setItem('bgPermGuided', '1'); } catch (e) {}
      window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
      window.Capacitor.Plugins.BackgroundGeolocation = {
        addWatcher: (o, cb) => { window.__bgCb = cb; return Promise.resolve('w1'); },
        removeWatcher: () => Promise.resolve()
      };
    });
    await page.clock.install({ time: new Date('2026-10-14T19:00:00+09:00') });
    await page.goto('file://' + html); await page.clock.runFor(1500);
    await page.evaluate(() => { window._routeLocked = true; S.boarded = true; _startBgGeolocation(); });
    await page.clock.runFor(300);
    return { ctx, page, errs };
  }

  await t('백그라운드 위치는 위치가 잡힌 시각(location.time)으로 궤적에 들어간다 — 몰려 와도 제 시각 · 순서대로 · 중복 없음', async () => {
    const x = await fresh(); const now = await x.page.evaluate(() => Date.now());
    const r = await x.page.evaluate((now) => {
      const cb = window.__bgCb; if (!cb) return { err: 'no cb' };
      cb({ latitude: 37.54, longitude: 126.7, accuracy: 12, time: now - 120000 }, null);            // 먼저 온 최신 뒤에 같은 시각이 또 와도 중복 없음
      [[-590, 37.50], [-480, 37.51], [-360, 37.52], [-240, 37.53], [-120, 37.54], [-1, 37.55]].forEach(a => cb({ latitude: a[1], longitude: 126.7, accuracy: 12, time: now + a[0] * 1000 }), null);
      const tr = _ev.trail.filter(q => q.ts > now - 700000);
      return { n: tr.length, ts: tr.map(q => Math.round((q.ts - now) / 1000)), last: Math.round((S.lastGPSFix.ts - now) / 1000) };
    }, now);
    assert(!r.err, r.err); assert.strictEqual(r.n, 6, JSON.stringify(r)); assert.deepStrictEqual(r.ts, [-590, -480, -360, -240, -120, -1]); assert.strictEqual(r.last, -1);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('time 이 없거나 미래·1시간 전처럼 말이 안 되면 받은 시각을 쓴다(예전과 같다)', async () => {
    const x = await fresh(); const now = await x.page.evaluate(() => Date.now());
    const r = await x.page.evaluate((now) => {
      const cb = window.__bgCb, out = [];
      [undefined, now + 600000, now - 7200000, 0].forEach(tm => { cb({ latitude: 37.5, longitude: 126.7, accuracy: 12, time: tm }, null); out.push(Math.abs(S.lastGPSFix.ts - Date.now()) < 3000); });
      return out;
    }, now);
    assert.deepStrictEqual(r, [true, true, true, true]); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('엔진 요청이 응답 없이 굳으면(제한 시간 + 3초 넘김) 끊고 새로 보낸다 · 옛 요청의 뒤늦은 응답은 버린다', async () => {
    const x = await fresh();
    const r = await x.page.evaluate(async () => {
      window.__fetches = 0; window.__aborted = 0; window.__resolvers = [];
      window.fetch = (u, o) => { if (!/ride-eta/.test(String(u))) return new Promise(() => {}); if (o && /"op":"(row|arrive)"/.test(String(o.body || ''))) return new Promise(() => {}); window.__fetches++; return new Promise((res, rej) => { window.__resolvers.push(res); if (o && o.signal) o.signal.addEventListener('abort', () => { window.__aborted++; rej(new Error('abort')); }); }); };
      window._metroRouteMode = false; window._routeLocked = true;
      _transitNodeData = [{ name: '출발', isOrigin: true, _schedMin: 1140, lat: 37.50, lng: 126.70 }, { name: 'A', isSub: true, lineName: '인천1호선', _schedMin: 1141, lat: 37.51, lng: 126.70 }, { name: 'B', isSub: true, lineName: '인천1호선', _schedMin: 1143, lat: 37.52, lng: 126.70 }];
      _etaRequest('pass'); const f1 = window.__fetches, busy1 = _etaSt.busy;
      return { f1, busy1 };
    });
    assert.strictEqual(r.f1, 1, JSON.stringify(r)); assert.strictEqual(r.busy1, true);
    await x.page.clock.runFor(5000);
    let r2 = await x.page.evaluate(() => { _etaRequest('pass'); return { f: window.__fetches, busy: _etaSt.busy, ab: window.__aborted }; });
    assert.strictEqual(r2.f, 1, '8초 안에는 새로 보내지 않는다 ' + JSON.stringify(r2));
    await x.page.clock.runFor(8000);   // 13초 경과 — 제한 시간 8초 + 3초를 넘김(요청 자체의 abort 타이머가 먼저 끊을 수도 있다)
    const r3 = await x.page.evaluate(() => { _etaRequest('pass'); return { f: window.__fetches, busy: _etaSt.busy }; });
    assert(r3.f >= 2, '새 요청이 나간다 ' + JSON.stringify(r3));
    // 옛 요청이 뒤늦게 응답해도 상태를 망가뜨리지 않는다
    await x.page.evaluate(() => { window.__resolvers[0]({ ok: true, json: () => Promise.resolve({ etaMs: [], arr: [] }) }); });
    await x.page.clock.runFor(200);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  // ── 2026-10-16 (YJ 로그: 가려진 동안 '엔진 요청이 15초째 응답 없음 — 끊고 다시 보냄' 이 15초마다 · 동막 18:02 / 진행 4→3→4→5) ──
  const NODES = `[{ name: '출발', isOrigin: true, _schedMin: 1140, lat: 37.50, lng: 126.70 }, { name: 'A', isSub: true, lineName: '인천1호선', _schedMin: 1141, lat: 37.51, lng: 126.70 }, { name: 'B', isSub: true, lineName: '인천1호선', _schedMin: 1143, lat: 37.52, lng: 126.70 }, { name: 'C', isSub: true, lineName: '인천1호선', _schedMin: 1145, lat: 37.53, lng: 126.70 }]`;
  await t('가려진 동안(15초에 한 번 깨어남)에는 응답이 와 있어도 끊지 않고, 늦게 온 답도 더 새것이 없으면 그린다', async () => {
    const x = await fresh();
    const r = await x.page.evaluate(async (NODES) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      window.__fetches = 0; window.__aborted = 0; window.__resolvers = [];
      window.fetch = (u, o) => { if (!/ride-eta/.test(String(u))) return new Promise(() => {}); if (o && /"op":"(row|arrive)"/.test(String(o.body || ''))) return new Promise(() => {}); window.__fetches++; return new Promise((res, rej) => { window.__resolvers.push(res); if (o && o.signal) o.signal.addEventListener('abort', () => { window.__aborted++; rej(new Error('abort')); }); }); };
      window._metroRouteMode = false; window._routeLocked = true;
      _transitNodeData = eval(NODES); window._trackSig = 'S1';
      _etaRequest('pass'); return { f: window.__fetches };
    }, NODES);
    assert.strictEqual(r.f, 1);
    await x.page.clock.runFor(16000);       // 가려진 웹뷰가 15초 만에 깨어난 상황
    const r2 = await x.page.evaluate(() => { _etaRequest('tick'); return { f: window.__fetches, ab: window.__aborted, busy: _etaSt.busy }; });
    assert.strictEqual(r2.ab, 0, '끊지 않는다 ' + JSON.stringify(r2)); assert.strictEqual(r2.f, 1, '새로 보내지 않고 기다린다 ' + JSON.stringify(r2)); assert.strictEqual(r2.busy, true);
    const r3 = await x.page.evaluate(async () => {
      window.__resolvers[0]({ ok: true, json: () => Promise.resolve({ arr: ['18:00', '18:01', '18:02', '18:03'], etaMs: [1, 2, 3, 4], delayMin: 0, anchorIdx: 1 }) });
      await new Promise(r => setTimeout(r, 0)); return { arr: _transitNodeData.map(n => n.arrTime), busy: _etaSt.busy };
    });
    await x.page.clock.runFor(100);
    const arr = await x.page.evaluate(() => _transitNodeData.map(n => n.arrTime));
    assert.deepStrictEqual(arr, ['18:00', '18:01', '18:02', '18:03'], JSON.stringify(r3)); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  const pfSetup = (gmSrc) => `(() => {
    const now = Date.now(); window._routeLocked = true; window._metroRouteMode = false; window._htlBoarded = true;
    _transitNodeData = ${NODES};
    window._gpsMaxIdx = 3; window._gpsConfirmIdx = 3; window._nodePassMs = { 3: now - 20000 }; window._nodePassSrc = { 3: '${gmSrc}' }; window._nodePassPf = {};
    _pf.sig = 'T1'; _pf.st = [{ _td: 1, name: 'A' }, { _td: 2, name: 'B' }, { _td: 3, name: 'C' }]; _pf.A = { sig: 'T1', k: 0, td: 1, cand: -1, candN: 0, candAt: 0, backAt: 0, at: 0 };
    return now; })()`;
  await t('PF 의 느린 "앞으로" 채택은 GPS 로 이미 확정한 진행도(4→3)를 되돌리거나 통과 기록을 지우지 않는다', async () => {
    const x = await fresh();
    const r = await x.page.evaluate((setup) => {
      const now = eval(setup); const ms3 = window._nodePassMs[3];
      _pfAdopt(1, { conf: 0.9, kind: 'seg', delayS: 0, idx: 1 }, now, '앞');
      return { gm: window._gpsMaxIdx, ms3: window._nodePassMs[3] === ms3, src3: window._nodePassSrc[3], pfTd: _pf.A.td };
    }, pfSetup('gps'));
    assert.strictEqual(r.gm, 3, JSON.stringify(r)); assert.ok(r.ms3, JSON.stringify(r)); assert.strictEqual(r.src3, 'gps'); assert.strictEqual(r.pfTd, 2, 'PF 자신은 따라잡는다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('"뒤로" 채택도 GPS 영점으로 2분 안에 확정한 역은 낮추지 않는다(영점이 아닌 기록이면 예전처럼 낮춘다)', async () => {
    const x = await fresh();
    const a = await x.page.evaluate((setup) => { const now = eval(setup); _pfAdopt(1, { conf: 0.9, kind: 'seg', delayS: 0, idx: 1 }, now, '뒤'); return window._gpsMaxIdx; }, pfSetup('gps'));
    assert.strictEqual(a, 3);
    const b2 = await x.page.evaluate((setup) => { const now = eval(setup); _pfAdopt(1, { conf: 0.9, kind: 'seg', delayS: 0, idx: 1 }, now, '뒤'); return window._gpsMaxIdx; }, pfSetup('pf'));
    assert.strictEqual(b2, 2, '낮춤(PF 기록): td=2'); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('엔진이 준 hold(영점 뒤 10초) 안에서는 현위치 역을 정지(노란색)로 그리고, 끝나면 이동(파랑)', async () => {
    const x = await fresh();
    const r = await x.page.evaluate((setup) => {
      const now = eval(setup); window._pfBest = { at: now, conf: 0.9, kind: 'seg', idx: 3 }; window._etaPos = null;
      const moving0 = _ovlMoving();
      window._etaHold = { idx: 3, untilMs: now + 8000, src: 'gps' }; const held = _ovlMoving();
      window._etaHold = { idx: 2, untilMs: now + 8000, src: 'gps' }; const other = _ovlMoving();     // 다른 역의 hold 는 현위치와 무관
      window._etaHold = { idx: 3, untilMs: now - 1, src: 'gps' }; const expired = _ovlMoving();
      return { moving0, held, other, expired };
    }, pfSetup('gps'));
    assert.deepStrictEqual(r, { moving0: true, held: false, other: true, expired: true }, JSON.stringify(r)); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('_etaApply 가 엔진의 hold 를 받아 두고 hold 가 없으면 지운다', async () => {
    const x = await fresh();
    const r = await x.page.evaluate((NODES) => {
      _transitNodeData = eval(NODES); const base = { arr: ['18:00', '18:01', '18:02', '18:03'], etaMs: [1, 2, 3, 4], delayMin: 0, anchorIdx: 1 };
      _etaApply(Object.assign({ hold: { idx: 2, untilMs: Date.now() + 5000, src: 'gps' } }, base), { boarded: true });
      const a = window._etaHold && window._etaHold.idx; _etaApply(Object.assign({ hold: null }, base), { boarded: true }); return { a, b: window._etaHold };
    }, NODES);
    assert.deepStrictEqual(r, { a: 2, b: null }, JSON.stringify(r)); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('탑승 버튼 없이 자동 감지로 탄 지하철도 시각표 기준이 켜진다(진행이 승차역을 넘으면) · 승차역 전이면 꺼짐 · 엔진이 버스 아님이라 하면 꺼짐', async () => {
    const x = await fresh();
    const r = await x.page.evaluate((NODES) => {
      window._routeLocked = true; window._metroRouteMode = false; window._htlBoarded = false; _transitNodeData = eval(NODES); window._nodePassMs = {};
      window._gpsMaxIdx = 0; const before = _ttFirstOn();
      window._gpsMaxIdx = 2; const after = _ttFirstOn();
      window._busVerdict = { state: 'notBus', at: Date.now() }; const car = _ttFirstOn(); window._busVerdict = null;
      window._routeLocked = false; const unlocked = _ttFirstOn();
      return { before, after, car, unlocked };
    }, NODES);
    assert.deepStrictEqual(r, { before: false, after: true, car: false, unlocked: false }, JSON.stringify(r)); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('시각표 기준(엔진 pos 있음)에서는 늦은 영점·PF 의 hold 가 마커를 멈춰 세우지 않는다(엔진 pos 가 정차·이동을 정한다)', async () => {
    const x = await fresh();
    const r = await x.page.evaluate((NODES) => {
      window._routeLocked = true; window._metroRouteMode = false; window._htlBoarded = true; _transitNodeData = eval(NODES); window._gpsMaxIdx = 2; window._gpsConfirmIdx = 2; window._nodePassMs = {};
      const n = Date.now(); window._etaPos = { from: 2, to: 3, t0: n - 30000, t1: n + 60000, ratio: .3, moving: true, floor: 2, segs: [{ from: 2, to: 3, a: n - 40000, t0: n - 30000, t1: n + 60000 }] }; window._etaPosAt = n;
      window._etaHold = { idx: 2, untilMs: n + 8000, src: 'pf' };
      return { tt: _ttFirstOn(), moving: _ovlMoving() };
    }, NODES);
    assert.deepStrictEqual(r, { tt: true, moving: true }, JSON.stringify(r)); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await b.close();
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
