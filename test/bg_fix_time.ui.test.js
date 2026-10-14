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
      window.fetch = (u, o) => { if (!/ride-eta/.test(String(u))) return new Promise(() => {}); window.__fetches++; return new Promise((res, rej) => { window.__resolvers.push(res); if (o && o.signal) o.signal.addEventListener('abort', () => { window.__aborted++; rej(new Error('abort')); }); }); };
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

  await b.close();
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
