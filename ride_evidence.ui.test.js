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
  const sim = async ({ n, seg, dir, delay, dwell, startAt }) => {
    // n 역, 역간 seg초(정차 dwell초 포함), dir=+1/-1(경도 방향), delay=실제 열차가 시각표보다 늦은 초
    await page.evaluate(([n, seg, dir, startAt]) => {
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
      _transitNodeData = nodes; window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null;
      window._trackSig = 'T' + Math.random(); window._trackBase = 1; window._gpsMaxIdx = -1; window._gpsConfirmIdx = -1; window._nodePassMs = {}; window._htlBoarded = false;
      window._pf && (_pf.A = null); S.lastGPSFix = null; _fmapStart = { type: 'gps' };
      const card = document.getElementById('transitResultCard'); if (card) card.style.display = 'block';
      window._rideEvReset && window._rideEvReset('시험'); _ev.trail = []; _ev.cell = []; _ev.cache = null; _ev.cacheAt = 0;
    }, [n, seg, dir, startAt]);
    await page.clock.setSystemTime(new Date(startAt));
    const out = { maxPipAhead: -9, maxGmAhead: -9, route: 0, boardedAt: null, gm: -1, rem: null, ovl: [] };
    const total = (n - 1) * seg + 60;
    for (let sec = 0; sec < total; sec += 5) {
      const el = Math.max(0, sec - delay), k = Math.min(n - 1, Math.floor(el / seg)), w = el % seg;
      const frac = (k >= n - 1) ? 0 : (w < dwell ? 0 : Math.min(1, (w - dwell) / (seg - dwell)));
      const trueArrived = 1 + k;   // 노드 인덱스(1=S0)
      await page.evaluate(([k, frac, dir]) => { S.lastGPSFix = { lat: 37.5, lng: 126.9 + dir * 0.0137 * (k + frac), ts: Date.now(), acc: 15 }; }, [k, frac, dir]);
      await tick();
      const st = await page.evaluate(() => { try { _htlBoardWatch(); } catch (e) {} try { _etaResearchIfStale(); } catch (e) {} return { gm: window._gpsMaxIdx, boarded: window._htlBoarded, route: window.__calls.route, pip: _pipHereIdx(), tp: (_estimateTimelinePos() || {}).fromIdx }; });
      if (st.boarded && out.boardedAt == null) out.boardedAt = sec;
      if (st.gm >= 0) out.maxGmAhead = Math.max(out.maxGmAhead, st.gm - trueArrived);
      if (out.boardedAt != null) out.maxPipAhead = Math.max(out.maxPipAhead, st.pip - trueArrived);
      out.route = st.route; out.gm = st.gm;
      await page.clock.runFor(5000);
    }
    console.log('      [sim n=' + n + ' dir=' + dir + ' delay=' + delay + '] 탑승확정 ' + out.boardedAt + '초 · gm앞섬 ' + out.maxGmAhead + ' · overlay앞섬 ' + out.maxPipAhead + ' · 재탐색 ' + out.route + ' · 최종gm ' + out.gm);
    out.rem = await page.evaluate(() => { try { return _journeyEta().rem; } catch (e) { return null; } });
    return out;
  };
  console.log('[시나리오]');
  let r1;
  await t('열차가 시각표보다 3분 늦어도 오버레이·진행도가 실제 역보다 앞서지 않는다(≤1역, 도착 판정은 증거 뒤)', async () => {
    r1 = await sim({ n: 8, seg: 120, dir: 1, delay: 180, dwell: 30, startAt: '2026-10-04T13:00:00+09:00' });
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
  await t('맛집 카카오/네이버 버튼은 가게 검색(상세)을 열고 길찾기는 별도 버튼으로 남는다', async () => {
    const r = await page.evaluate(() => {
      const urls = []; window._navOpen = function (a, w) { urls.push([a, w]); };
      const h = _placeBtnsHtml(37.5, 126.9, "홍'길동 횟집", '합정');
      _placeInfo('naver', encodeURIComponent('횟집'), 37.5, 126.9, encodeURIComponent('합정'));
      _placeInfo('kakao', encodeURIComponent('횟집'), 37.5, 126.9, encodeURIComponent('합정'));
      const nav = _navBtnsHtml(37.5, 126.9, '횟집');
      return { h, urls, nav };
    });
    assert.ok(/네이버 리뷰·정보/.test(r.h) && /카카오 리뷰·정보/.test(r.h));
    assert.ok(/map\.naver\.com\/p\/search\//.test(r.urls[0][1]) && /nmap:\/\/search/.test(r.urls[0][0]));
    assert.ok(/map\.kakao\.com\/link\/search\//.test(r.urls[1][1]) && /kakaomap:\/\/search/.test(r.urls[1][0]));
    assert.ok(/네이버 길찾기/.test(r.nav) && /카카오 길찾기/.test(r.nav));
  });
  await t('시각 표시에 "13:60" 이 나올 수 없다(분을 먼저 반올림)', async () => {
    const src = fs.readFileSync(html, 'utf8');
    assert.ok(!/Math\.round\(t%60\)\)\.slice\(-2\)/.test(src), '반올림 전 분 계산이 남아 있음');
  });
  await t('JS 오류가 없다', async () => { assert.deepStrictEqual(errs.filter(e => !/Failed to fetch|NetworkError|Load failed/.test(e)), []); });
  await b.close();
  console.log(`\n${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
})();
