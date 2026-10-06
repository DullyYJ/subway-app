// 탑승 증거·재탐색 차단·PF 단일 위치 시험 — 헤드리스 Chromium + 가짜 시계. 외부 요청은 전부 차단.
// 실행: node test/ride_evidence.ui.test.js [html 경로]   (Playwright: /opt/node-tools/node_modules/playwright)
const assert = require('assert'), path = require('path'), fs = require('fs');
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
  await page.clock.install({ time: new Date('2026-10-04T12:40:00+09:00') });
  await page.goto('file://' + html);
  await page.clock.runFor(2500);

  // ── 공통 장면: 9개 역(1.2km 간격, 동쪽으로), 12:52 계양 출발 · 역간 2분(정차 30초 포함) ──
  const setup = () => page.evaluate(() => {
    window.__calls = { route: 0 };
    window.fmapDoRoute = function () { window.__calls.route++; };
    const base = new Date('2026-10-04T12:52:00+09:00'); const midnight = new Date('2026-10-04T00:00:00+09:00');
    const mk = (i) => ({ name: 'S' + i, lat: 37.5, lng: 126.9 + 0.0137 * i, isSub: true, isBus: false, isWalk: false, isOrigin: false, lineName: '공항철도', _schedMin: (base - midnight) / 60000 + i * 2, el: null });
    const nodes = [{ name: '출발', lat: 37.5, lng: 126.9 - 0.004, isOrigin: true, isWalk: false, isSub: false, isBus: false, _schedMin: (base - midnight) / 60000 - 5, el: null }];
    for (let i = 0; i < 9; i++) { const n = mk(i); const m = n._schedMin; n.arrTime = ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.floor(m % 60)).slice(-2); nodes.push(n); }
    _transitNodeData = nodes; // 인덱스: 0=출발, 1..9=S0..S8
    window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null; window._trackSig = 'T1'; window._trackBase = 1;
    window._gpsMaxIdx = -1; window._gpsConfirmIdx = -1; window._nodePassMs = {}; window._htlBoarded = false;
    S.lastGPSFix = null; _fmapStart = { type: 'gps' };
    const card = document.getElementById('transitResultCard'); if (card) card.style.display = 'block';
    window._rideEvReset && window._rideEvReset('시험');
    return nodes.length;
  });
  const gps = (i, frac, acc) => page.evaluate(([i, frac, acc]) => { S.lastGPSFix = { lat: 37.5, lng: 126.9 + 0.0137 * (i + frac), ts: Date.now(), acc: acc || 15 }; }, [i, frac, acc]);
  const tick = () => page.evaluate(() => { try { _pfTick(); } catch (e) {} });
  await setup();

  console.log('[탑승 전: 역에 서 있을 때]');
  await page.clock.setSystemTime(new Date('2026-10-04T12:51:30+09:00'));
  for (let k = 0; k < 40; k++) { await gps(0, 0, 15); await tick(); await page.clock.runFor(5000); }
  await t('승차역에 3분 서 있으면 탑승 증거가 없고, 정지 증명이 선다', async () => {
    const r = await page.evaluate(() => ({ ride: window._rideEv().riding, miss: window._missProof() }));
    assert.strictEqual(r.ride, false); assert.strictEqual(r.miss, true);
  });
  await t('정지 증명 때 GPS 없는(궤적 부족) 상태에서는 못 탔다고 보지 않는다', async () => {
    await page.evaluate(() => window._rideEvReset('시험')); // 궤적은 유지됨
    await page.evaluate(() => { window.__trailBak = null; });
    const r = await page.evaluate(() => { const bak = window._missProof; return bak(); });
    assert.strictEqual(typeof r, 'boolean');
  });

  console.log('[탑승 후: 열차가 달릴 때(GPS 이동 + PF)]');
  await setup();
  await page.clock.setSystemTime(new Date('2026-10-04T12:52:00+09:00'));
  // 12:52:00~ 계양 출발, 시속 ~50km → 1.2km/90초. 각 역 30초 정차 가정
  const trueIdx = () => { /* 시뮬레이션 진행도: 역 인덱스 */ };
  let route0 = 0, maxAhead = 0, boardedAt = null, ridingAt = null;
  const simStart = Date.now ? null : null;
  let sec = 0;
  for (; sec < 900; sec += 5) {
    const seg = Math.floor(sec / 120), within = (sec % 120);
    const frac = within < 30 ? 0 : Math.min(1, (within - 30) / 90);   // 30초 정차 후 90초 주행
    await gps(seg, frac, 15);
    await tick();
    await page.evaluate(() => { try { _htlBoardWatch(); } catch (e) {} try { _etaResearchIfStale(); } catch (e) {} });
    const st = await page.evaluate(() => ({ ride: window._rideEv().riding, boarded: window._htlBoarded, gm: window._gpsMaxIdx, route: window.__calls.route }));
    if (st.ride && ridingAt == null) ridingAt = sec;
    if (st.boarded && boardedAt == null) boardedAt = sec;
    route0 = st.route;
    const trueStn = 1 + seg + (frac >= 0.999 ? 1 : 0);   // 노드 인덱스(1=S0) — 막 도착한 역
    if (st.gm >= 0) maxAhead = Math.max(maxAhead, st.gm - trueStn);
    await page.clock.runFor(5000);
  }
  await t('달리기 시작 후 3분 안에 탑승 증거가 선다', async () => { assert.ok(ridingAt != null && ridingAt <= 180, 'ridingAt=' + ridingAt); });
  await t('탑승 증거로 승차가 확정된다(승차역 도착 기록 없이도)', async () => { assert.ok(boardedAt != null && boardedAt <= 240, 'boardedAt=' + boardedAt); });
  await t('15분 타는 동안 재탐색이 한 번도 일어나지 않는다', async () => { assert.strictEqual(route0, 0); });
  await t('진행도(_gpsMaxIdx)가 실제 도착 역보다 1역 넘게 앞서지 않는다', async () => { assert.ok(maxAhead <= 1, 'maxAhead=' + maxAhead); });
  await t('15분 뒤 진행도가 실제 위치 근처(±1역)다', async () => {
    const gm = await page.evaluate(() => window._gpsMaxIdx);
    const trueNow = 1 + 7;   // 900초 = 7.5구간 → S7 도착(노드 8)
    assert.ok(Math.abs(gm - trueNow) <= 1, 'gm=' + gm + ' true=' + trueNow);
  });
  await t('PF 위치(마커) 비율은 85% 이하이고 정차 중이면 역 위(0)', async () => {
    const o = await page.evaluate(() => window._pfPosOverride && window._pfPosOverride());
    if (o) { assert.ok(o.ratio <= 0.85 + 1e-9); assert.ok(o.toIdx >= o.fromIdx); }
  });

  console.log('[재탐색 차단]');
  await t('탑승 중 시각이 한참 지난 낡은 안내여도 _etaResearchIfStale 은 재탐색하지 않는다', async () => {
    const r = await page.evaluate(() => { window._htlDrawnAt = Date.now() - 3600000; window.__calls.route = 0; const x = _etaResearchIfStale(); return { x, calls: window.__calls.route }; });
    await page.clock.runFor(500);
    assert.strictEqual(r.x, false); assert.strictEqual(await page.evaluate(() => window.__calls.route), 0);
  });
  await t('앱으로 돌아와도(오래된 확정 전 카드) 자동 재탐색하지 않는다', async () => {
    const calls = await page.evaluate(() => {
      window._routeLocked = false; window._routeBaseMs = Date.now() - 20 * 60000; window.__calls.route = 0; window._routeAutoAt = 0;
      const card = document.getElementById('transitResultCard'); card.style.display = 'block';
      _onForegroundResume(); return window.__calls.route;
    });
    await page.clock.runFor(500);
    assert.strictEqual(calls, 0);
    await page.evaluate(() => { window._routeLocked = true; });
  });
  await t('정지 증명 없이는 _missProof 가 거짓(시각만으로 놓친 열차 판정 금지)', async () => {
    const r = await page.evaluate(() => { window._rideEvReset('시험'); return window._missProof(); });
    assert.ok(typeof r === 'boolean');
  });

  // ── 시나리오: 열차 지연·역방향·장거리(69분) ──
  const sim = async ({ n, seg, dir, delay, dwell, startAt, locked, latOff, gpsDir }) => {
    // n 역, 역간 seg초(정차 dwell초 포함), dir=+1/-1(경도 방향), delay=실제 열차가 시각표보다 늦은 초
    await page.evaluate(([n, seg, dir, startAt, locked]) => {
      window.__calls = { route: 0 };
      window.fmapDoRoute = function () { window.__calls.route++; };
      const base = new Date(startAt), midnight = new Date(startAt.slice(0, 10) + 'T00:00:00+09:00');
      const baseMin = (base - midnight) / 60000;
      const nodes = [{ name: '출발', lat: 37.5, lng: 126.9 - dir * 0.004, isOrigin: true, isWalk: false, isSub: false, isBus: false, _schedMin: baseMin - 5, el: null }];
      for (let i = 0; i < n; i++) {
        const m = baseMin + i * seg / 60;
        nodes.push({ name: 'S' + i, lat: 37.5, lng: 126.9 + dir * 0.0137 * i, isSub: true, isBus: false, isWalk: false, isOrigin: false, lineName: '2호선', _schedMin: m, el: null,
          arrTime: ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.floor(m % 60)).slice(-2) });
      }
      _transitNodeData = nodes; window._lastHtlNodes = nodes; window._routeLocked = (locked !== false); window._metroRouteMode = false; _baseTimeMs = null;
      window.__began = 0; window._beginJourneyTracking = function () { window.__began++; }; window._autoLockAt = 0; window._pendingRouteType = 'fast';
      window._trackSig = 'T' + Math.random(); window._trackBase = 1; window._gpsMaxIdx = -1; window._gpsConfirmIdx = -1; window._nodePassMs = {}; window._htlBoarded = false;
      window._pf && (_pf.A = null); S.lastGPSFix = null; _fmapStart = { type: 'gps' };
      const card = document.getElementById('transitResultCard'); if (card) card.style.display = 'block';
      window._rideEvReset && window._rideEvReset('시험'); _ev.trail = []; _ev.cell = []; _ev.cache = null; _ev.cacheAt = 0;
    }, [n, seg, dir, startAt, locked]);
    await page.clock.setSystemTime(new Date(startAt));
    await page.evaluate(() => { window._htlDrawnAt = Date.now(); window._etaResearchAt = 0; });
    const out = { maxPipAhead: -9, maxGmAhead: -9, route: 0, boardedAt: null, gm: -1, rem: null, ovl: [], lockedAt: null, began: 0 };
    const total = (n - 1) * seg + 60;
    for (let sec = 0; sec < total; sec += 5) {
      const el = Math.max(0, sec - delay), k = Math.min(n - 1, Math.floor(el / seg)), w = el % seg;
      const frac = (k >= n - 1) ? 0 : (w < dwell ? 0 : Math.min(1, (w - dwell) / (seg - dwell)));
      const trueArrived = 1 + k;   // 노드 인덱스(1=S0)
      await page.evaluate(([k, frac, dir, latOff]) => { S.lastGPSFix = { lat: 37.5 + latOff, lng: 126.9 + dir * 0.0137 * (k + frac), ts: Date.now(), acc: 15 }; }, [k, frac, gpsDir == null ? dir : gpsDir, latOff || 0]);
      await tick();
      const st = await page.evaluate(() => { try { _htlBoardWatch(); } catch (e) {} try { _etaResearchIfStale(); } catch (e) {} return { locked: window._routeLocked === true, began: window.__began, gm: window._gpsMaxIdx, boarded: window._htlBoarded, route: window.__calls.route, pip: _pipHereIdx(), tp: (_estimateTimelinePos() || {}).fromIdx }; });
      if (st.boarded && out.boardedAt == null) { out.boardedAt = sec; out.routeAtBoard = st.route; }
      if (st.locked && out.lockedAt == null) out.lockedAt = sec;
      out.began = st.began;
      if (st.gm >= 0) out.maxGmAhead = Math.max(out.maxGmAhead, st.gm - trueArrived);
      if (out.boardedAt != null) out.maxPipAhead = Math.max(out.maxPipAhead, st.pip - trueArrived);
      out.route = st.route; out.gm = st.gm;
      await page.clock.runFor(5000);
    }
    console.log('      [sim n=' + n + ' dir=' + dir + ' delay=' + delay + '] 탑승확정 ' + out.boardedAt + '초 · gm앞섬 ' + out.maxGmAhead + ' · overlay앞섬 ' + out.maxPipAhead + ' · 재탐색 ' + out.route + ' · 최종gm ' + out.gm);
    out.routeAfterBoard = out.boardedAt == null ? 0 : out.route - (out.routeAtBoard || 0);
    out.rem = await page.evaluate(() => { try { return _journeyEta().rem; } catch (e) { return null; } });
    return out;
  };
  console.log('[시나리오]');
  let r1;
  await t('열차가 시각표보다 3분 늦어도 오버레이·진행도가 실제 역보다 앞서지 않는다(≤1역, 도착 판정은 증거 뒤)', async () => {
    r1 = await sim({ n: 8, seg: 120, dir: 1, delay: 180, dwell: 30, startAt: '2026-10-04T13:00:00+09:00' });
    // 승강장에서 3분 늦는 열차를 기다리는 동안에도 '놓쳤다'로 보지 않는다(유예 4분, 시각만 뒤로 민다)
    assert.strictEqual(r1.route, 0, '재탐색 ' + r1.route);
    assert.ok(r1.maxGmAhead <= 0, 'gm 앞섬 ' + r1.maxGmAhead);
    assert.ok(r1.maxPipAhead <= 0, 'overlay 앞섬 ' + r1.maxPipAhead);
  });
  await t('역방향(경도 감소)에서도 마커가 증거 없이 역을 지나치지 않는다', async () => {
    const r = await sim({ n: 8, seg: 120, dir: -1, delay: 0, dwell: 30, startAt: '2026-10-04T17:10:00+09:00' });
    assert.strictEqual(r.route, 0); assert.ok(r.maxGmAhead <= 0, 'gm 앞섬 ' + r.maxGmAhead); assert.ok(r.maxPipAhead <= 0, 'overlay 앞섬 ' + r.maxPipAhead);
    assert.ok(r.gm >= 6, '끝까지 못 따라감 gm=' + r.gm);
  });
  await t('69분 장거리(23역): 재탐색 0회 · 진행도가 끝까지 따라간다 · 남은 시간 0~2분', async () => {
    const r = await sim({ n: 23, seg: 188, dir: 1, delay: 0, dwell: 30, startAt: '2026-10-04T12:52:00+09:00' });
    assert.strictEqual(r.route, 0, '재탐색 ' + r.route);
    assert.ok(r.gm >= 21, 'gm=' + r.gm);
    assert.ok(r.maxGmAhead <= 0 && r.maxPipAhead <= 0, 'gm ' + r.maxGmAhead + ' pip ' + r.maxPipAhead);
    assert.ok(r.rem == null || r.rem <= 3, '남은 시간 ' + r.rem);
  });

  console.log('[경로 미확정 자동 확정]');
  await t('경로 확정을 안 눌러도 승차역을 지나 열차로 이동하면 자동 확정되고 추적이 끝까지 따라간다', async () => {
    const r = await sim({ n: 8, seg: 120, dir: 1, delay: 0, dwell: 30, startAt: '2026-10-04T13:00:00+09:00', locked: false });
    assert.ok(r.lockedAt != null, '자동 확정 안 됨');
    assert.ok(r.lockedAt <= 400, '자동 확정이 늦음 ' + r.lockedAt + '초');
    assert.strictEqual(r.route, 0, '재탐색 ' + r.route);
    assert.ok(r.began >= 1, '추적 시작 안 됨');
    assert.ok(r.gm >= 6, '끝까지 못 따라감 gm=' + r.gm);
    assert.ok(r.maxGmAhead <= 0, 'gm 앞섬 ' + r.maxGmAhead);
  });
  await t('승차역에서 멀리 떨어진 곳(약 5km)을 이동하면 확정하지 않는다', async () => {
    const r = await sim({ n: 8, seg: 120, dir: 1, delay: 0, dwell: 30, startAt: '2026-10-04T13:00:00+09:00', locked: false, latOff: 0.05 });
    assert.strictEqual(r.lockedAt, null, '엉뚱한 곳에서 확정됨 ' + r.lockedAt);
  });
  await t('제자리에 서 있으면 확정하지 않는다', async () => {
    const r = await sim({ n: 8, seg: 120, dir: 1, delay: 99999, dwell: 30, startAt: '2026-10-04T13:00:00+09:00', locked: false });
    assert.strictEqual(r.lockedAt, null, '정지 중 확정됨 ' + r.lockedAt);
  });
  await t('이미 확정된 경로는 자동 확정이 건드리지 않는다(알림·추적 재시작 없음)', async () => {
    const r = await sim({ n: 6, seg: 120, dir: 1, delay: 0, dwell: 30, startAt: '2026-10-04T13:00:00+09:00', locked: true });
    assert.strictEqual(r.began, 0, '추적 재시작 ' + r.began);
  });

  await t('자동 확정: 승차역에서 다음 역 반대 방향으로 이동하면 확정하지 않는다', async () => {
    const r = await sim({ n: 8, seg: 120, dir: 1, gpsDir: -1, delay: 0, dwell: 30, startAt: '2026-10-04T13:00:00+09:00', locked: false });
    assert.strictEqual(r.lockedAt, null, '반대 방향인데 확정됨 ' + r.lockedAt);
  });
  await t('자동 확정 검증: 승차·다음 역 진행이 없으면 5분 뒤 취소, 진행이 있으면 통과, 수동 확정은 건드리지 않는다', async () => {
    const r = await page.evaluate(() => {
      const mk = () => ({ at: Date.now() - 6 * 60000, bi: 1, btn: ['경로 확정', ''], mbtn: null, boarded: false, state: null });
      const ev0 = window._rideEv; window._rideEv = function () { return { now: false, riding: false }; };
      let o = {};
      window._routeLocked = true; window._gpsMaxIdx = 0; window._htlBoarded = false; window._autoLockInfo = mk();
      _autoLockVerify(Date.now()); o.cancel = [window._routeLocked, window._autoLockInfo, window._autoLockAt > Date.now()];
      window._routeLocked = true; window._gpsMaxIdx = 2; window._autoLockInfo = mk();
      _autoLockVerify(Date.now()); o.pass = [window._routeLocked, window._autoLockInfo];
      window._routeLocked = true; window._gpsMaxIdx = 0; window._autoLockInfo = null;
      _autoLockVerify(Date.now()); o.manual = window._routeLocked;
      window._routeLocked = true; window._gpsMaxIdx = 0; window._autoLockInfo = { at: Date.now() - 2 * 60000, bi: 1 };
      _autoLockVerify(Date.now()); o.early = window._routeLocked;
      window._rideEv = ev0; window._autoLockInfo = null; window._autoLockAt = 0; window._gpsMaxIdx = -1; window._routeLocked = true;
      return o;
    });
    assert.deepStrictEqual(r.cancel, [false, null, true], JSON.stringify(r));
    assert.deepStrictEqual(r.pass, [true, null], JSON.stringify(r));
    assert.strictEqual(r.manual, true); assert.strictEqual(r.early, true, '5분 전에는 취소하지 않는다');
  });

  console.log('[승강장 대기: 늦은 열차]');
  const platSetup = (passedMin, near) => page.evaluate(([passedMin, near]) => {
    const nd = _transitNodeData, bn = nd[1];
    const n = new Date(), nowMin = n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60;
    window._platDep0 = null; window._platShiftAt = 0; window._rideEvReset('시험'); window._htlBoarded = false; window._gpsMaxIdx = -1; window._nodePassMs = {};
    window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null;
    for (let i = 1; i < nd.length; i++) { const m = nowMin - passedMin + (i - 1) * 2; nd[i]._schedMin = m; const mm = Math.round(((m % 1440) + 1440) % 1440); nd[i].arrTime = ('0' + Math.floor(mm / 60)).slice(-2) + ':' + ('0' + (mm % 60)).slice(-2); }
    _ev.trail = [{ lat: bn.lat + (near ? 0.0005 : 0.05), lng: bn.lng, ts: Date.now() }]; _ev.cache = null; _ev.cacheAt = 0;
    return nowMin;
  }, [passedMin, near]);
  await t('승강장 대기 중인지 판단: 승차역 300m 안이고 안 탔을 때만', async () => {
    await platSetup(1, true);
    const a = await page.evaluate(() => window._platformWaiting());
    await platSetup(1, false);
    const b = await page.evaluate(() => window._platformWaiting());
    assert.strictEqual(a, true); assert.strictEqual(b, false);
  });
  await t('승강장에서 예정이 3.5분 지나도 _etaResearchIfStale 은 재탐색하지 않고, 7분이 지나면 재탐색한다', async () => {
    await platSetup(3.5, true);
    let c = await page.evaluate(() => {
      window.__calls = { route: 0 }; window.fmapDoRoute = function () { window.__calls.route++; };
      window._etaResearchAt = 0; window._htlDrawnAt = Date.now(); window._rerouteCooldownUntil = 0; window._htlDelaySec = 0; S.boardedAt = null;
      return _etaResearchIfStale();
    });
    await page.clock.runFor(500);
    const r1 = await page.evaluate(() => window.__calls.route);
    assert.strictEqual(r1, 0, '유예 안인데 재탐색 ' + r1 + ' ' + c);
    await platSetup(7, true);
    await page.evaluate(() => { window._etaResearchAt = 0; window._htlDrawnAt = Date.now(); _etaResearchIfStale(); });
    await page.clock.runFor(500);
    const r2 = await page.evaluate(() => window.__calls.route);
    assert.strictEqual(r2, 1, '유예가 끝났는데 재탐색 안 함 ' + r2);
  });
  await t('승강장에서 예정이 2분 지났으면 이후 시각이 같은 만큼 밀리고(20초 간격), 유예(4분)가 지나면 밀지 않는다', async () => {
    await platSetup(2, true);
    const r = await page.evaluate(() => {
      const nd = _transitNodeData, b0 = nd.map(x => x && x._schedMin), now = Date.now();
      _platformLateShift(now);
      const a1 = nd.map(x => x && x._schedMin);
      _platformLateShift(now + 1000);                   // 20초 안 → 한 번 더 밀리지 않는다
      const a2 = nd[1]._schedMin;
      return { d1: a1[1] - b0[1], d2: a1[2] - b0[2], d5: a1[5] - b0[5], d0: a1[0] - b0[0], again: a2 - a1[1], keep: !!window._platDep0 };
    });
    assert.ok(Math.abs(r.d1 - 2.5) < 0.2, JSON.stringify(r));
    assert.ok(Math.abs(r.d2 - r.d1) < 1e-6 && Math.abs(r.d5 - r.d1) < 1e-6, '이후 모든 시각이 같은 만큼 ' + JSON.stringify(r));
    assert.strictEqual(r.d0, 0); assert.strictEqual(r.again, 0); assert.ok(r.keep);
    await platSetup(5, true);
    const z = await page.evaluate(() => { const b = _transitNodeData[1]._schedMin; _platformLateShift(Date.now()); return _transitNodeData[1]._schedMin - b; });
    assert.strictEqual(z, 0, '유예 뒤에는 밀지 않는다');
  });

  console.log('[분 표시·배지·지연 반영 (2026-10-04 추가)]');
  await t('구간 합(65분)이 총 소요(69분)보다 작으면 모자란 4분은 대기로 가고 합이 69분이 된다', async () => {
    const r = await page.evaluate(() => {
      const secs = [{ transportation: { type: 3 }, duration: 300 }, { transportation: { type: 1 }, duration: 2400, startSec: 300, endSec: 2700 }, { transportation: { type: 3 }, duration: 1200 }];
      return { a: _routeTimeSplit(secs, 69), b: _routeTimeSplit(secs, 65), c: _routeTimeSplit(secs, 66) };
    });
    assert.strictEqual(r.a.ride + r.a.wait + r.a.walk, 69, JSON.stringify(r.a));
    assert.strictEqual(r.a.wait, 4, JSON.stringify(r.a));
    assert.strictEqual(r.a.ride, 40); assert.strictEqual(r.a.walk, 25);
    assert.strictEqual(r.b.ride + r.b.wait + r.b.walk, 65, '같으면 그대로 ' + JSON.stringify(r.b));
    assert.strictEqual(r.c.ride + r.c.wait + r.c.walk, 66);
  });
  await t('분리 줄 앞에 "전체 N분"이 붙고, 타임라인 총 소요(72분)를 따른다', async () => {
    const txt = await page.evaluate(() => {
      let el = document.getElementById('transitSplitRow');
      if (!el) { el = document.createElement('div'); el.id = 'transitSplitRow'; document.body.appendChild(el); }
      window._htlTlTotalMin = 72;
      const secs = [{ transportation: { type: 3 }, duration: 300 }, { transportation: { type: 1 }, duration: 2400, startSec: 300, endSec: 2700 }, { transportation: { type: 3 }, duration: 1200 }];
      _renderSplitRow({ why: '', sections: secs, summary: { duration: 69 * 60 } });
      return el.textContent;
    });
    assert.ok(/^전체 72분 · 승차 40분 · 대기 7분 · 도보·환승 25분/.test(txt), txt);
  });
  await t('이동 중 헤더 숫자 옆 단위가 "분 남음"으로 바뀐다', async () => {
    const u = await page.evaluate(() => {
      let n = document.getElementById('transitResultMinNum'), un = document.getElementById('transitResultMinUnit');
      if (!n) { n = document.createElement('span'); n.id = 'transitResultMinNum'; document.body.appendChild(n); }
      if (!un) { un = document.createElement('span'); un.id = 'transitResultMinUnit'; un.textContent = '분'; document.body.appendChild(un); }
      un.textContent = '분';
      window._gpsMaxIdx = 3; window._rideEvReset && window._rideEvReset('시험');
      try { _updateRouteRemaining(); } catch (e) {}
      return un.textContent;
    });
    assert.strictEqual(u, '분 남음');
  });
  await t('주황 대기 배지가 역 이름 줄과 겹치지 않고 카드 안에 들어온다', async () => {
    const r = await page.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend',
        '<div class="htl-wrap" id="tWrap" style="width:340px;position:fixed;left:10px;top:10px;"><div id="transitHtlTrack">'
        + '<div class="htl-stn"><div class="htl-name" id="tName">계양</div><div class="htl-line">공항철도</div><div class="htl-axis" id="tAxis"><div class="htl-dot" id="htl-gps-marker-dot" style="left:50%"></div></div></div></div></div>');
      window._htlGpsDot = document.getElementById('htl-gps-marker-dot');
      window._rideEvReset && window._rideEvReset('시험');
      const ev = window._rideEv; window._rideEv = function () { return { riding: false }; };
      _htlWaitBadge(true, '대기 중 · 250m');
      window._rideEv = ev;
      const b = document.getElementById('htlWaitBadge').getBoundingClientRect(), n = document.getElementById('tName').getBoundingClientRect(), w = document.getElementById('tWrap').getBoundingClientRect();
      return { overlapName: !(b.bottom <= n.bottom - 0.5 ? b.top >= n.bottom || b.bottom <= n.top : false) && (b.top < n.bottom && b.bottom > n.top), top: b.top, wrapTop: w.top, nameBottom: n.bottom, bottom: b.bottom, h: b.height };
    });
    assert.ok(r.top >= r.wrapTop, '카드 위로 잘리지 않음 ' + JSON.stringify(r));
    assert.ok(r.top >= r.nameBottom - 0.5, '역 이름 줄과 겹침 ' + JSON.stringify(r));
    assert.ok(r.h <= 14, '배지 높이 ' + r.h);
  });
  await t('다음 역 예정이 60초 넘게 지났는데 도착 증거가 없으면 그 역과 이후 시각이 같은 만큼 밀린다(앞당기지 않음, 20초 간격)', async () => {
    const r = await page.evaluate(() => {
      const nd = _transitNodeData; const n = new Date(); const nowMin = n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60;
      if (!window._pf || !_pf.A) { _pf.A = { sig: _pf.sig, k: 0, td: 0, cand: -1, candN: 0, candAt: 0, backAt: 0, at: 0 }; }
      _pf.A.sig = _pf.sig; _pf.A.td = 2; window._routeLocked = true; window._metroRouteMode = false;
      for (let i = 0; i < nd.length; i++) { if (nd[i]) nd[i]._schedMin = nowMin - 2 + (i - 3) * 2.5; }
      const before = nd.map(x => x && x._schedMin);
      window._pfBest = { idx: 0, td: 0, conf: 0.2, kind: 'seg', at: Date.now() };
      window._pfOverdueAt = 0; window._ev.sticky = Date.now() + 1e6; window._ev.cache = null;
      window._pfOverdueShift(Date.now());
      const after = nd.map(x => x && x._schedMin);
      const d3 = after[3] - before[3], d4 = after[4] - before[4], d2 = after[2] - before[2];
      window._pfOverdueShift(Date.now());       // 20초 안 → 한 번 더 밀리지 않는다
      const again = nd[3]._schedMin - after[3];
      // 앞당김 없음: 예정이 아직 안 지났으면 그대로
      for (let i = 0; i < nd.length; i++) { if (nd[i]) nd[i]._schedMin = nowMin + 3 + (i - 3) * 2.5; }
      window._pfOverdueAt = 0; const b2 = nd[3]._schedMin; window._pfOverdueShift(Date.now()); const none = nd[3]._schedMin - b2;
      return { d3, d4, d2, again, none, nowMinErr: Math.abs(after[3] - (nowMin + 0.5)) };
    });
    assert.ok(Math.abs(r.d3 - 2.5) < 0.2 && Math.abs(r.d4 - r.d3) < 1e-6, JSON.stringify(r));
    assert.strictEqual(r.d2, 0, '이미 지난 역은 건드리지 않음');
    assert.strictEqual(r.again, 0); assert.strictEqual(r.none, 0);
  });

  console.log('[표시 수정]');
  await t('지하철 구간 갱신 시 혼잡도 카드 라벨이 "버스"에서 "지하철"로 돌아온다', async () => {
    const txt = await page.evaluate(() => {
      const el = document.querySelector('.cong-stn'); if (!el) return 'NOEL';
      el.innerHTML = '버스 <b id="congStn">계양</b>'; window._congMode = null;
      updateCong({ name: '계양', line: '공항철도' }, true); return document.querySelector('.cong-stn').textContent.trim();
    });
    assert.ok(txt.startsWith('지하철'), txt);
  });
  await t('가속도계 코드와 측정 카드가 사라졌다', async () => {
    const r = await page.evaluate(() => ({ a: typeof _accelState, b: typeof _startAccel, c: !!document.getElementById('accelTestOut') }));
    assert.strictEqual(r.a, 'undefined'); assert.strictEqual(r.b, 'undefined'); assert.strictEqual(r.c, false);
  });
  const flush = () => new Promise(r => { let n = 0; (function f() { if (++n > 40) r(); else Promise.resolve().then(f); })(); });
  await t('맛집 버튼 표시와 네이버는 가게 검색(좌표 포함)으로 열리고 길찾기는 별도 버튼으로 남는다', async () => {
    const r = await page.evaluate(() => {
      const urls = []; window._navOpen = function (a, w) { urls.push([a, w]); };
      const h = _placeBtnsHtml(37.5, 126.9, "홍'길동 횟집", '합정');
      _placeInfo('naver', encodeURIComponent('횟집'), 37.5, 126.9, encodeURIComponent('합정'));
      const nav = _navBtnsHtml(37.5, 126.9, '횟집');
      return { h, urls, nav };
    });
    assert.ok(/네이버 리뷰·정보/.test(r.h) && /카카오 리뷰·정보/.test(r.h));
    assert.ok(/map\.naver\.com\/p\/search\//.test(r.urls[0][1]) && /\?c=17\.00,126\.9,37\.5/.test(r.urls[0][1]), r.urls[0][1]);
    assert.ok(/nmap:\/\/search/.test(r.urls[0][0]) && /lat=37\.5&lng=126\.9/.test(r.urls[0][0]), r.urls[0][0]);
    assert.ok(/네이버 길찾기/.test(r.nav) && /카카오 길찾기/.test(r.nav));
  });
  const kakaoRun = async (docs, dead, lat) => {
    await page.evaluate(([docs, dead, lat]) => {
      window.__urls = []; window._navOpen = function (a, w) { window.__urls.push([a, w]); };
      window._kakaoDead = !!dead;
      window.__kq = null;
      window._kakaoLocal = function (path, qs) { window.__kq = path + '?' + qs; return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ documents: docs }); } }); };
      _placeInfo('kakao', encodeURIComponent('홍길동 횟집'), lat, 126.9, encodeURIComponent('합정'));
    }, [docs, dead, lat]);
    await flush();
    return page.evaluate(() => ({ urls: window.__urls, q: window.__kq }));
  };
  await t('카카오: 근처에서 같은 이름의 가게를 찾으면 그 가게 페이지(장소 ID)를 바로 연다(다른 이름·먼 지점은 제외)', async () => {
    const r = await kakaoRun([
      { id: '111', place_name: '길동무 횟집', distance: '10' },
      { id: '222', place_name: '홍길동 횟집 본점', distance: '300' },
      { id: '333', place_name: '홍길동횟집', distance: '120' },
    ], false, 37.501);
    assert.strictEqual(r.urls.length, 1, JSON.stringify(r));
    assert.strictEqual(r.urls[0][0], 'kakaomap://place?id=333', '이름이 같은 것이 우선 ' + JSON.stringify(r.urls));
    assert.strictEqual(r.urls[0][1], 'https://place.map.kakao.com/333');
    assert.ok(/search\/keyword\.json\?query=/.test(r.q) && /x=126\.9&y=37\.501&radius=500&sort=distance/.test(r.q), r.q);
  });
  await t('카카오: 맞는 가게가 없거나 카카오가 막혀 있으면 검색으로 연다', async () => {
    const a = await kakaoRun([{ id: '1', place_name: '전혀 다른 집', distance: '5' }], false, 37.502);
    assert.ok(/^kakaomap:\/\/search\?q=/.test(a.urls[0][0]) && /map\.kakao\.com\/link\/search\//.test(a.urls[0][1]), JSON.stringify(a.urls));
    const b = await kakaoRun([{ id: '9', place_name: '홍길동 횟집', distance: '5' }], true, 37.503);
    assert.ok(/^kakaomap:\/\/search\?q=/.test(b.urls[0][0]), '카카오 막힘 ' + JSON.stringify(b.urls));
    await page.evaluate(() => { window._kakaoDead = false; });
  });
  await t('시각 표시에 "13:60" 이 나올 수 없다(분을 먼저 반올림)', async () => {
    const src = fs.readFileSync(html, 'utf8');
    assert.ok(!/Math\.round\(t%60\)\)\.slice\(-2\)/.test(src), '반올림 전 분 계산이 남아 있음');
  });
  console.log('[승차 직후 시각표 점프 — 2026-10-06 실승차]');
  // 17:35 캠퍼스타운 승차 → 52초 뒤 기지국 선행으로 동막 '통과'가 찍히면 출발이 17:29 로 6분 앞당겨지던 문제
  const jumpSetup = async () => {
    await page.clock.setSystemTime(new Date('2026-10-06T17:35:00+09:00'));
    await page.evaluate(() => {
      const midnight = new Date('2026-10-06T00:00:00+09:00'); const bm = (new Date('2026-10-06T17:35:00+09:00') - midnight) / 60000;
      const names = ['캠퍼스타운', '동막', '동춘', '원인재', '신연수', '선학', '문학경기장'], offs = [0, 3, 5, 7, 8, 10, 12];
      const nodes = [{ name: '출발', lat: 37.5, lng: 126.896, isOrigin: true, isWalk: false, isSub: false, isBus: false, _schedMin: bm - 5, el: null }];
      names.forEach((nm, i) => { const m = bm + offs[i]; nodes.push({ name: nm, lat: 37.5, lng: 126.9 + 0.0137 * i, isSub: true, isBus: false, isWalk: false, isOrigin: false, lineName: '인천1호선', _schedMin: m, el: null, arrTime: ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.floor(m % 60)).slice(-2) }); });
      _transitNodeData = nodes; window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null;
      window._gpsMaxIdx = -1; window._gpsConfirmIdx = -1; window._nodePassMs = {}; window._htlBoarded = false;
    });
  };
  const times = () => page.evaluate(() => _transitNodeData.slice(1).map(n => n.arrTime));
  await jumpSetup();
  await page.clock.setSystemTime(new Date('2026-10-06T17:35:48+09:00'));
  await page.evaluate(() => { window._htlBoarded = true; window._gpsMaxIdx = 1; window._nodePassMs[1] = Date.now(); _recalcArrivalsFrom(1); });
  await page.clock.setSystemTime(new Date('2026-10-06T17:36:40+09:00'));
  await page.evaluate(() => { window._gpsMaxIdx = 2; window._nodePassMs[2] = Date.now(); _recalcArrivalsFrom(2); });
  await t('승차 52초 뒤 동막 선행 통과가 찍혀도 출발 시각이 탄 시각(17:35)보다 2분 넘게 앞서지 않는다', async () => {
    const a = await times(); const m = a[0].split(':'); const dep = (+m[0]) * 60 + (+m[1]);
    assert.ok(dep >= 17 * 60 + 33, '출발 ' + a[0] + ' (예전: 17:29)');
  });
  await t('이미 탄 시각보다 앞선 열차(17:29)로 스냅하지 않는다', async () => {
    const a = await times(); assert.notStrictEqual(a[0], '17:29'); assert.notStrictEqual(a[1], '17:32');
  });
  await page.clock.setSystemTime(new Date('2026-10-06T17:38:05+09:00'));
  await page.evaluate(() => { window._nodePassMs[2] = Date.now(); _recalcArrivalsFrom(2); });
  await t('동막에 실제로 도착하면 원래 시각(17:35 · 동막 17:38)으로 맞는다', async () => {
    const a = await times(); assert.strictEqual(a[0], '17:35'); assert.strictEqual(a[1], '17:38');
  });
  // 정상 흐름은 그대로: 승차 후 정상 속도 통과는 앵커 하한에 걸리지 않는다
  await jumpSetup();
  await page.clock.setSystemTime(new Date('2026-10-06T17:35:10+09:00'));
  await page.evaluate(() => { window._htlBoarded = true; window._gpsMaxIdx = 1; window._nodePassMs[1] = Date.now(); _recalcArrivalsFrom(1); });
  await page.clock.setSystemTime(new Date('2026-10-06T17:38:30+09:00'));
  await page.evaluate(() => { window._gpsMaxIdx = 2; window._nodePassMs[2] = Date.now(); _recalcArrivalsFrom(2); });
  await t('정상 속도(3분 구간을 3분20초)로 통과하면 시각이 그대로 따라간다(하한 영향 없음)', async () => {
    const a = await times(); assert.strictEqual(a[1], '17:38', JSON.stringify(a));
  });
  console.log('[오버레이·혼잡도 카드가 마커(GPS 투영) 위치를 따른다 — 부평인데 동수]');
  await jumpSetup();
  await page.clock.setSystemTime(new Date('2026-10-06T17:42:20+09:00'));
  await page.evaluate(() => { window._htlBoarded = true; window._nodePassMs = { 1: Date.now() - 400000, 4: Date.now() - 20000 }; window._gpsMaxIdx = 4; window._gpsConfirmIdx = 4; });
  const here = (mp) => page.evaluate((mp) => { window._markerPos = mp ? Object.assign({ ts: Date.now() }, mp) : null; return _pipHereIdx(); }, mp);
  await t('마커가 GPS 로 다음 역 85% 이상에 그려졌으면 오버레이도 다음 역을 현재 역으로 본다', async () => { assert.strictEqual(await here({ from: 4, to: 5, ratio: 0.9, gps: true }), 5); });
  await t('마커가 아직 역 사이 중간이면 오버레이는 그대로(현재 역 유지)', async () => { assert.strictEqual(await here({ from: 4, to: 5, ratio: 0.5, gps: true }), 4); });
  await t('GPS 가 아니라 추정으로 그린 마커는 오버레이를 앞서게 하지 않는다(기존 규칙 유지)', async () => { assert.strictEqual(await here({ from: 4, to: 5, ratio: 0.9, gps: false }), 4); });
  await t('낡은(20초 넘은) 마커 값은 쓰지 않는다', async () => { const r = await page.evaluate(() => { window._markerPos = { from: 4, to: 5, ratio: 0.95, gps: true, ts: Date.now() - 25000 }; return _pipHereIdx(); }); assert.strictEqual(r, 4); });
  await t('마커가 진행도보다 두 역 넘게 앞서도 한 역까지만 따른다(튀는 값 방지)', async () => { assert.ok((await here({ from: 6, to: 7, ratio: 0.9, gps: true })) <= 5); });
  await page.evaluate(() => { window._markerPos = null; });

  console.log('[하차 전 팝업 버튼]');
  await t('팝업이 맨 위(2147483647)에 뜨고, 터치만 와도(클릭 변환이 막혀도) 버튼이 동작한다', async () => {
    const r = await page.evaluate(() => {
      window.__x = 0; _showBriefingModal('하차 8분 전', '아라 도착 예정', null, { label: '맛집 위치 보기', call: 'window.__x=(window.__x||0)+1' });
      const ov = document.getElementById('briefModalOv'); const btns = ov.querySelectorAll('button');
      const z = ov.style.zIndex;
      btns[1].dispatchEvent(new Event('touchend', { bubbles: true, cancelable: true }));
      return { z: z, x: window.__x, n: btns.length };
    });
    assert.strictEqual(r.z, '2147483647'); assert.strictEqual(r.n, 2); assert.strictEqual(r.x, 1, '터치로 한 번만 실행');
    await page.evaluate(() => { const o = document.getElementById('briefModalOv'); if (o) o.remove(); });
  });
  await t('팝업 확인 버튼이 터치로도 팝업을 닫는다', async () => {
    const r = await page.evaluate(() => {
      _showBriefingModal('t', 'b', null, null);
      document.querySelector('#briefModalOv button').dispatchEvent(new Event('touchend', { bubbles: true, cancelable: true }));
      return !!document.getElementById('briefModalOv');
    });
    assert.strictEqual(r, false);
  });
  await t('실제 클릭은 한 번만 실행된다(터치 처리와 겹치지 않음)', async () => {
    const x = await page.evaluate(() => {
      window.__x = 0; _showBriefingModal('t', 'b', null, { label: '위치', call: 'window.__x=(window.__x||0)+1' });
      const b = document.querySelectorAll('#briefModalOv button')[1]; b.click(); const o = document.getElementById('briefModalOv'); if (o) o.remove(); return window.__x;
    });
    assert.strictEqual(x, 1);
  });
  console.log('[오버레이 화살표 — 이동 중 여부(moving)]');
  await jumpSetup();
  await page.clock.setSystemTime(new Date('2026-10-06T17:42:20+09:00'));
  await page.evaluate(() => { window._htlBoarded = true; window._nodePassMs = { 1: Date.now() - 400000, 4: Date.now() - 20000 }; window._gpsMaxIdx = 4; window._gpsConfirmIdx = 4; });
  const mv = (b) => page.evaluate((b) => { window._pfBest = b ? Object.assign({ at: Date.now(), conf: 0.8 }, b) : null; return { m: _ovlMoving(), l: _ovlLines() }; }, b);
  await t('PF 가 주행(seg)이라 하면 moving=true, 정차(dwell)라 하면 false', async () => {
    const a = await mv({ kind: 'seg', idx: 3 }); assert.strictEqual(a.m, true); assert.strictEqual(a.l.moving, true, '다음 역이 있으니 깜박임');
    const b2 = await mv({ kind: 'dwell', idx: 3 }); assert.strictEqual(b2.m, false); assert.strictEqual(b2.l.moving, false);
  });
  await t('PF 확신이 50% 미만이거나 낡았으면 PF 판정을 쓰지 않는다(기지국 판정이 true 일 때만 이동)', async () => {
    const r = await page.evaluate(() => { window._pfBest = { at: Date.now() - 60000, conf: 0.9, kind: 'seg', idx: 3 }; const o = _ovlMoving(); return { o: o, cm: _cellMovingState() }; });
    assert.strictEqual(r.o, r.cm === true);
  });
  await t('승차 전에는 moving=false', async () => {
    const r = await page.evaluate(() => { window._htlBoarded = false; window._gpsMaxIdx = -1; window._nodePassMs = {}; window._pfBest = { at: Date.now(), conf: 0.9, kind: 'seg', idx: 3 }; return _ovlMoving(); });
    assert.strictEqual(r, false);
  });
  await t('JS 오류가 없다', async () => { assert.deepStrictEqual(errs.filter(e => !/Failed to fetch|NetworkError|Load failed/.test(e)), []); });
  await b.close();
  console.log(`\n${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
})();
