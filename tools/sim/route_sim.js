// 실제 엔진 경로(역 좌표·시각)로 오버레이/마커 위치를 시뮬레이션한다. 사용: node route_sim.js <html> <scn.json> [filter] [outfile]
// (2026-10-06 세션 하네스. playwright 경로·크로미움 경로는 환경에 맞게 고칠 것. scn.json = /route-v2-app 응답에서 뽑은 역 좌표 st[[이름,lng,lat]]·역 도착 초 ss)
const fs = require('fs');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const html = process.argv[2], SC = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')), FILT = process.argv[4] || '';
const startAt = '2026-10-06T06:19:00+09:00', DWELL = 30;
const RUNS = [];
for (const s of SC) { if (FILT && s.tag.indexOf(FILT) < 0) continue;
  RUNS.push({ s, mode: 'gps', delay: 0, cell: 'N' });
  for (const delay of [0, 180]) for (const mode of ['blind100', 'nogps']) for (const cell of (process.env.CELLS||'N,after,narrow').split(',')) RUNS.push({ s, mode, delay, cell }); }
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  for (const R of RUNS) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    await page.clock.install({ time: new Date('2026-10-06T06:00:00+09:00') });
    await page.goto('file://' + html); await page.clock.runFor(2500);
    const st = R.s.st, off0 = R.s.ss[0], rel = R.s.ss.map(x => x - off0), n = st.length;
    await page.evaluate(([st, rel, startAt, line, cell]) => {
      window.__calls = { route: 0 }; window.fmapDoRoute = function () { window.__calls.route++; };
      window.__sent = []; window._ovlNative = function () { return { update: function (o) { window.__sent.push(o); return Promise.resolve(); }, keepAlive: function () { return Promise.resolve(); } }; };
      const base = new Date(startAt), midnight = new Date(startAt.slice(0, 10) + 'T00:00:00+09:00'); const baseMin = (base - midnight) / 60000;
      const hm = (m) => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.floor(m % 60)).slice(-2);
      const nodes = [{ name: '출발', lat: st[0][2], lng: st[0][1] - 0.004, isOrigin: true, isWalk: false, isSub: false, isBus: false, _schedMin: baseMin - 5, el: null }];
      st.forEach((q, i) => { const m = baseMin + rel[i] / 60; nodes.push({ name: q[0], lat: q[2], lng: q[1], isSub: true, isBus: false, isWalk: false, isOrigin: false, lineName: line, _schedMin: m, el: null, arrTime: hm(m) }); });
      _transitNodeData = nodes; window._lastHtlNodes = nodes; window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null;
      window._trackSig = 'T' + Math.random(); window._trackBase = 1; window._gpsMaxIdx = -1; window._gpsConfirmIdx = -1; window._nodePassMs = {}; window._htlBoarded = false;
      window._pf && (_pf.A = null); S.lastGPSFix = null; _fmapStart = { type: 'gps' };
      const card = document.getElementById('transitResultCard'); if (card) card.style.display = 'block';
      window._rideEvReset && window._rideEvReset('시험'); _ev.trail = []; _ev.cell = []; _ev.cache = null; _ev.cacheAt = 0;
      window._pipHasRoute = function () { return true; }; window._ovlUsable = function () { return true; };
      window._cellMovingState = function () { return window.__cmv === undefined ? null : window.__cmv; };
      if (cell) {
        window.__cmv = true; window.__cellKey = 'K0'; window._cellAssistAt = 0; window._cellMaxIdx = -1; window._timeMaxIdx = -1; window._cellHopAt = null; window._cellRecent = {}; _cellSeen = null; window._htlSanityAt = 0; window._driftFixAt = 0;
        window._cellPluginReady = function () { return true; }; window._cellKey = function () { return window.__cellKey; };
        window._cellNow = function (cb) { window._cellLast = { key: window.__cellKey, ts: Date.now() }; try { _cellNoteObservation(window.__cellKey); } catch (e) {} cb({}); };
        const m = {}; st.forEach((q, i) => { m['K' + i] = { s: q[0], l: line, n: 10, t: Date.now() }; }); window._cellMapMem = m;
      }
      Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); window._appInBackground = true;
    }, [st, rel, startAt, R.s.ln, R.cell !== 'N']);
    await page.clock.setSystemTime(new Date(startAt));
    await page.evaluate(() => { window._htlBoarded = true; window._gpsMaxIdx = 1; window._gpsConfirmIdx = 1; window._nodePassMs = { 1: Date.now() }; });
    const total = rel[n - 1] + 90 + R.delay; const rows = [];
    for (let sec = 0; sec < total; sec += 5) {
      const se = Math.max(0, sec - R.delay); let k = 0; while (k < n - 1 && se >= rel[k + 1]) k++;
      let lng, lat, arrived;
      if (k >= n - 1) { lng = st[n - 1][1]; lat = st[n - 1][2]; arrived = n - 1; }
      else { const w = se - rel[k], seg = rel[k + 1] - rel[k]; const f = (w < DWELL) ? 0 : Math.min(1, (w - DWELL) / Math.max(1, seg - DWELL)); lng = st[k][1] + (st[k + 1][1] - st[k][1]) * f; lat = st[k][2] + (st[k + 1][2] - st[k][2]) * f; arrived = k; }
      const trueArrived = 1 + arrived;   // 노드 인덱스(출발 노드가 0)
      const gpsOn = R.mode === 'gps' ? true : (R.mode === 'blind100' ? sec < 100 : false);
      const pos = arrived + (k < n - 1 ? Math.min(1, Math.max(0, (se - rel[k] - DWELL) / Math.max(1, rel[k + 1] - rel[k] - DWELL))) : 0); const near = Math.round(pos);
      const ck = R.cell === 'unk' ? 'U' + Math.floor(pos * 2 + 1e-9) : R.cell === 'after' ? (pos - Math.floor(pos) < 0.6 ? 'K' + Math.floor(pos + 1e-9) : 'U' + Math.floor(pos)) : R.cell === 'narrow' ? (Math.abs(pos - near) <= 0.2 ? 'K' + near : 'U' + Math.floor(pos)) : 'K' + near;
      await page.evaluate(([lng, lat, gpsOn, ck, cell]) => {
        if (gpsOn) S.lastGPSFix = { lat, lng, ts: Date.now(), acc: 15 };
        if (cell) window.__cellKey = ck;
        try { _ovlNativeTick(); } catch (e) {}
        if (cell) { try { _cellAssist(); } catch (e) {} }
      }, [lng, lat, gpsOn, ck, R.cell !== 'N']);
      const v = await page.evaluate(() => ({ pip: _pipHereIdx(), gm: window._gpsMaxIdx, bd: window._htlBoarded === true }));
      rows.push([sec, trueArrived, v.pip, v.bd]);
      await page.clock.runFor(5000);
    }
    const L = rows.filter(r => r[3] && r[0] >= 60).map(r => r[2] - r[1]);
    const mae = L.reduce((a, c) => a + Math.abs(c), 0) / L.length, beh = L.filter(x => x < 0).length, ahd = L.filter(x => x > 0).length;
    const worstB = Math.min(0, ...L), worstA = Math.max(0, ...L);
    // 정지 시간 중 가장 길게 틀린 구간(초): |오차|>=1 연속
    let run = 0, maxRun = 0; rows.forEach(r => { if (r[3] && r[0] >= 60 && Math.abs(r[2] - r[1]) >= 1) { run += 5; maxRun = Math.max(maxRun, run); } else run = 0; });
    const out = [R.s.tag, R.mode, 'delay=' + R.delay, 'cell=' + R.cell, 'MAE=' + mae.toFixed(2), 'behind=' + beh, 'ahead=' + ahd + '/' + L.length, 'worstBehind=' + worstB, 'worstAhead=' + worstA, 'maxErrRun=' + maxRun + 's', 'errs=' + errs.length].join(' | ');
    console.log(out);
    if (process.env.DUMP) fs.writeFileSync('/tmp/sim_dump_' + [R.s.tag, R.mode, R.delay, R.cell].join('_') + '.json', JSON.stringify(rows));
    await ctx.close();
  }
  await b.close();
})();
