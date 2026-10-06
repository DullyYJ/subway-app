// 지하(GPS 없음)에서 기지국이 구간마다 여러 번 바뀌어도 마커가 실제 열차보다 앞서가지 않는지 — 실제 엔진 경로(김포골드라인 8역, 역 좌표·시각 그대로)로 시뮬레이션.
// (2026-10-06 시뮬레이션에서 열차가 3분 늦을 때 `_cellHopAdvance` 가 마커를 최대 3역, 20분 가까이 앞세웠다 → PF 중앙값이 그 역에 닿았을 때만 인정하도록 제한)
// 실행: node test/cell_hop_lead.ui.test.js [html 경로]   (약 3분, Playwright: /opt/node-tools/node_modules/playwright)
const assert = require('assert'), path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
// 엔진이 돌려준 김포골드라인 마산→김포공항 구간(이름, 경도, 위도)과 도착 오프셋(초)
const ST = [['마산', 126.64434, 37.64073], ['장기', 126.66902, 37.64399], ['운양', 126.68393, 37.65387], ['걸포북변', 126.70597, 37.63165], ['사우', 126.71972, 37.62036], ['풍무', 126.73239, 37.61249], ['고촌', 126.77035, 37.60124], ['김포공항', 126.80187, 37.56236]];
const SS = [240, 467, 617, 858, 1019, 1154, 1417, 1802];
const startAt = '2026-10-06T06:19:00+09:00', DWELL = 30;
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const run = async (delay, cellModel) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    await page.clock.install({ time: new Date('2026-10-06T06:00:00+09:00') });
    await page.goto('file://' + html); await page.clock.runFor(2500);
    const rel = SS.map(x => x - SS[0]), n = ST.length;
    await page.evaluate(([st, rel, startAt]) => {
      window.__calls = { route: 0 }; window.fmapDoRoute = function () { window.__calls.route++; };
      window.__sent = []; window._ovlNative = function () { return { update: function (o) { window.__sent.push(o); return Promise.resolve(); }, keepAlive: function () { return Promise.resolve(); } }; };
      const base = new Date(startAt), midnight = new Date(startAt.slice(0, 10) + 'T00:00:00+09:00'); const baseMin = (base - midnight) / 60000;
      const hm = (m) => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.floor(m % 60)).slice(-2);
      const nodes = [{ name: '출발', lat: st[0][2], lng: st[0][1] - 0.004, isOrigin: true, isWalk: false, isSub: false, isBus: false, _schedMin: baseMin - 5, el: null }];
      st.forEach((q, i) => { const m = baseMin + rel[i] / 60; nodes.push({ name: q[0], lat: q[2], lng: q[1], isSub: true, isBus: false, isWalk: false, isOrigin: false, lineName: '김포골드라인', _schedMin: m, el: null, arrTime: hm(m) }); });
      _transitNodeData = nodes; window._lastHtlNodes = nodes; window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null;
      window._trackSig = 'T' + Math.random(); window._trackBase = 1; window._gpsMaxIdx = -1; window._gpsConfirmIdx = -1; window._nodePassMs = {}; window._htlBoarded = false;
      window._pf && (_pf.A = null); S.lastGPSFix = null; _fmapStart = { type: 'gps' };
      const card = document.getElementById('transitResultCard'); if (card) card.style.display = 'block';
      window._rideEvReset && window._rideEvReset('시험'); _ev.trail = []; _ev.cell = []; _ev.cache = null; _ev.cacheAt = 0;
      window._pipHasRoute = function () { return true; }; window._ovlUsable = function () { return true; };
      window._cellMovingState = function () { return window.__cmv === undefined ? null : window.__cmv; };
      window.__cmv = true; window.__cellKey = 'U0'; window._cellAssistAt = 0; window._cellMaxIdx = -1; window._timeMaxIdx = -1; window._cellHopAt = null; window._cellRecent = {}; _cellSeen = null; window._htlSanityAt = 0; window._driftFixAt = 0;
      window._cellPluginReady = function () { return true; }; window._cellKey = function () { return window.__cellKey; };
      window._cellNow = function (cb) { window._cellLast = { key: window.__cellKey, ts: Date.now() }; try { _cellNoteObservation(window.__cellKey); } catch (e) {} cb({}); };
      Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); window._appInBackground = true;
    }, [ST, rel, startAt]);
    await page.clock.setSystemTime(new Date(startAt));
    await page.evaluate(() => { window._htlBoarded = true; window._gpsMaxIdx = 1; window._gpsConfirmIdx = 1; window._nodePassMs = { 1: Date.now() }; });
    const total = rel[n - 1] + 90 + delay; const L = [];
    for (let sec = 0; sec < total; sec += 5) {
      const se = Math.max(0, sec - delay); let k = 0; while (k < n - 1 && se >= rel[k + 1]) k++;
      let pos = k >= n - 1 ? n - 1 : k + ((se - rel[k]) < DWELL ? 0 : Math.min(1, (se - rel[k] - DWELL) / Math.max(1, rel[k + 1] - rel[k] - DWELL)));
      const arrived = k;
      // 구간마다 셀이 2번 바뀐다(둘 다 이 앱이 학습하지 않은 셀). 'known' 모형은 도착 때부터 구간의 60% 까지 같은 셀이 이어진다.
      const key = cellModel === 'known' ? (pos - Math.floor(pos) < 0.6 ? 'K' + Math.floor(pos + 1e-9) : 'U' + Math.floor(pos)) : 'U' + Math.floor(pos * 2 + 1e-9);
      const lng = k >= n - 1 ? ST[n - 1][1] : ST[k][0] && ST[k][1] + (ST[k + 1][1] - ST[k][1]) * (pos - k), lat = k >= n - 1 ? ST[n - 1][2] : ST[k][2] + (ST[k + 1][2] - ST[k][2]) * (pos - k);
      await page.evaluate(([key, lng, lat]) => { window.__cellKey = key; try { _ovlNativeTick(); } catch (e) {} try { _cellAssist(); } catch (e) {} }, [key, lng, lat]);
      const v = await page.evaluate(() => ({ pip: _pipHereIdx() }));
      if (sec >= 60) L.push(v.pip - (1 + arrived));
      await page.clock.runFor(5000);
    }
    await ctx.close();
    return { mae: L.reduce((a, c) => a + Math.abs(c), 0) / L.length, ahead: L.filter(x => x > 0).length / L.length, worstAhead: Math.max(0, ...L), errs };
  };
  for (const [delay, model] of [[0, 'unlearned'], [180, 'unlearned'], [180, 'known']].map(x => x)) {
    const r = await run(delay, model);
    console.log('      [' + model + ' 셀 · 열차 ' + delay + '초 지연] MAE ' + r.mae.toFixed(2) + ' · 앞섬 ' + Math.round(r.ahead * 100) + '% · 최대 앞섬 ' + r.worstAhead + '역');
    await t('셀이 구간마다 바뀌어도(' + model + ', 지연 ' + delay + '초) 마커가 한 역을 넘게 앞서지 않고(앞선 시간 30% 이하) 평균 오차가 0.6역 이하다', async () => { assert.ok(r.worstAhead <= 1, '최대 앞섬 ' + r.worstAhead); assert.ok(r.ahead <= 0.3, '앞섬 ' + Math.round(r.ahead * 100) + '%'); assert.ok(r.mae <= 0.6, 'MAE ' + r.mae.toFixed(2)); });
    await t('JS 오류가 없다(' + model + ', 지연 ' + delay + '초)', async () => { assert.strictEqual(r.errs.length, 0, r.errs[0]); });
  }
  console.log(`\n${pass} 통과 / ${fail} 실패`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
