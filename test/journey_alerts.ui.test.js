// 알림·오버레이 연동 시험 — 헤드리스 Chromium + 가짜 시계 + 가짜 Capacitor 플러그인(LocalNotifications·Overlay).
// 확정한 여정(환승 1회)을 따라가며 ① 환승·하차 알림이 때맞춰 한 번씩 나가는지 ② 설정의 알림 종류별 스위치가
// 정확히 그 종류만 막는지 ③ 오버레이가 같은 위치·남은시간을 받는지 ④ 하차 전 추천·출퇴근 브리핑이 나가는지 확인한다.
// 실행: node test/journey_alerts.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('gdm_loc_disclosed', '1'); localStorage.setItem('ovlOn', '1'); } catch (e) {}
    window.__ln = []; window.__ovl = []; window.__ka = [];
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
      LocalNotifications: {
        schedule: (o) => { window.__ln.push(o.notifications[0]); return Promise.resolve({ notifications: o.notifications }); },
        checkPermissions: () => Promise.resolve({ display: 'granted' }), requestPermissions: () => Promise.resolve({ display: 'granted' }),
        createChannel: () => Promise.resolve(), registerActionTypes: () => Promise.resolve(), addListener: () => Promise.resolve({ remove() {} }),
        cancel: () => Promise.resolve(), getPending: () => Promise.resolve({ notifications: [] }), removeAllDeliveredNotifications: () => Promise.resolve(),
      },
      Overlay: {
        isAvailable: () => Promise.resolve({ granted: true, supported: true }),
        requestPermission: () => Promise.resolve({ granted: true }),
        update: (o) => { window.__ovl.push(o); return Promise.resolve(); },
        keepAlive: (o) => { window.__ka.push(o); return Promise.resolve(); },
      },
    } };
  });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = new URL(r.request().url()); if (u.protocol === 'file:' || u.protocol === 'data:') return r.continue(); return r.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: '{}' }); });
  await page.clock.install({ time: new Date('2026-10-08T18:00:00+09:00') });
  await page.goto('file://' + html);
  await page.clock.runFor(3000);

  const titles = () => page.evaluate(() => window.__ln.map(n => n.title));
  const resetLN = () => page.evaluate(() => { window.__ln.length = 0; });
  // 장면: 1호선 A0~A5(6역, 2분 간격) → A5 에서 2호선 B1~B4 로 환승 → 도착 B4.  인덱스: 0 출발(도보), 1~6 = A0~A5, 7~10 = B1~B4
  const setup = async (prefs) => {
    await page.evaluate((prefs) => {
      try { localStorage.removeItem('notifPref'); } catch (e) {}
      if (typeof _notifPrefCache !== 'undefined') _notifPrefCache = null;
      if (prefs) Object.keys(prefs).forEach(k => _notifPrefSet(k, prefs[k]));
      window.fmapDoRoute = function () {};
      const startAt = '2026-10-08T18:00:00+09:00', base = new Date(startAt), midnight = new Date('2026-10-08T00:00:00+09:00');
      const baseMin = (base - midnight) / 60000;
      const hm = (m) => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.floor(m % 60)).slice(-2);
      const nodes = [{ name: '출발', lat: 37.5, lng: 126.9 - 0.004, isOrigin: true, isWalk: false, isSub: false, isBus: false, _schedMin: baseMin - 5, el: null }];
      for (let i = 0; i < 6; i++) { const m = baseMin + i * 2; nodes.push({ name: 'A' + i, lat: 37.5, lng: 126.9 + 0.0137 * i, isSub: true, isBus: false, isWalk: false, isOrigin: false, lineName: '1호선', _schedMin: m, el: null, arrTime: hm(m) }); }
      for (let i = 1; i <= 4; i++) { const m = baseMin + 10 + i * 2 + 2; nodes.push({ name: 'B' + i, lat: 37.51, lng: 126.9 + 0.0137 * 5 + 0.0137 * i, isSub: true, isBus: false, isWalk: false, isOrigin: false, lineName: '2호선', _schedMin: m, el: null, arrTime: hm(m) }); }
      _transitNodeData = nodes; window._lastHtlNodes = nodes; window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null;
      window._trackSig = 'T' + Math.random(); window._trackBase = 1; window._gpsMaxIdx = -1; window._gpsConfirmIdx = -1; window._nodePassMs = {}; window._htlBoarded = false;
      window._transitAlertFired = {}; try { _notifOnceReset(); } catch (e) {}
      window._pipTrip = { from: '출발', to: 'B4', at: Date.now() };
      window._buildTransitAlertTargets();
      const card = document.getElementById('transitResultCard'); if (card) card.style.display = 'block';
      window.__ln.length = 0;
    }, prefs || null);
  };
  const at = async (idx) => { await page.evaluate((i) => { window._gpsMaxIdx = i; window._checkTransitAlerts(i); }, idx); };

  console.log('[환승 1회 여정 — 알림이 때맞춰 한 번씩]');
  await setup(null);
  await at(3);   // A2: 환승역(A5, 인덱스 6)까지 3정거장 → 아직 없음
  await t('환승역 3정거장 전에는 알림이 없다', async () => assert.deepStrictEqual(await titles(), []));
  await at(4);   // A3: 환승역까지 2
  await t('환승 2정거장 전 알림', async () => assert.ok((await titles()).includes('환승 2정거장 전'), JSON.stringify(await titles())));
  await at(5);
  await t('환승 1정거장 전 알림(환승 준비)', async () => assert.ok((await titles()).includes('환승 준비'), JSON.stringify(await titles())));
  await at(5); await at(4);
  await t('같은 자리를 다시 지나도 같은 알림이 또 나가지 않는다', async () => { const ts = await titles(); assert.strictEqual(ts.filter(x => x === '환승 준비').length, 1); assert.strictEqual(ts.filter(x => x === '환승 2정거장 전').length, 1); });
  await at(8);   // B2: 도착(B4, 인덱스 10)까지 2
  await t('목적지 2정거장 전 알림', async () => assert.ok((await titles()).includes('목적지 2정거장 전'), JSON.stringify(await titles())));
  await at(9);
  await t('목적지 1정거장 전(곧 하차) 알림', async () => assert.ok((await titles()).includes('곧 하차'), JSON.stringify(await titles())));
  await at(10);
  await t('목적지 도착 알림', async () => assert.ok((await titles()).includes('목적지 도착'), JSON.stringify(await titles())));
  await t('알림은 총 5번(환승 2 · 하차 3)이고 채널·아이콘이 붙는다', async () => {
    const ln = await page.evaluate(() => window.__ln);
    assert.strictEqual(ln.length, 5, JSON.stringify(ln.map(n => n.title)));
    ln.forEach(n => { assert.strictEqual(n.channelId, 'subway_alerts'); assert.ok(n.smallIcon); });
  });

  console.log('[설정의 알림 종류별 스위치 — 그 종류만 막는다]');
  await setup({ transfer: 0 });
  for (const i of [4, 5, 8, 9, 10]) await at(i);
  await t('환승 알림을 끄면 환승 알림만 사라지고 하차 알림은 그대로', async () => {
    const ts = await titles();
    assert.ok(!ts.some(x => /환승/.test(x)), '환승 알림이 나감: ' + JSON.stringify(ts));
    assert.strictEqual(JSON.stringify(ts), JSON.stringify(['목적지 2정거장 전', '곧 하차', '목적지 도착']));
  });
  await setup({ arrive: 0 });
  for (const i of [4, 5, 8, 9, 10]) await at(i);
  await t('도착 임박 알림을 끄면 하차 알림만 사라지고 환승 알림은 그대로', async () => {
    const ts = await titles();
    assert.ok(!ts.some(x => /목적지|하차/.test(x)), '하차 알림이 나감: ' + JSON.stringify(ts));
    assert.strictEqual(JSON.stringify(ts), JSON.stringify(['환승 2정거장 전', '환승 준비']));
  });
  await setup({ transfer: 0, arrive: 0 });
  for (const i of [4, 5, 8, 9, 10]) await at(i);
  await t('둘 다 끄면 아무 알림도 나가지 않는다', async () => assert.deepStrictEqual(await titles(), []));

  console.log('[구형(지하철 탭) 경로의 환승·하차 알림도 같은 스위치를 따른다]');
  const legacy = async (prefs) => {
    await page.evaluate((prefs) => {
      try { localStorage.removeItem('notifPref'); } catch (e) {}
      _notifPrefCache = null; if (prefs) Object.keys(prefs).forEach(k => _notifPrefSet(k, prefs[k]));
      S.route = { path: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'], lp: ['1호선', '1호선', '1호선', '2호선', '2호선', '2호선'], transfers: ['P2'], tp: [0, 120, 120, 120, 120, 120] };
      S.boarded = true; S.curIdx = 0; _bgAlertFired = {}; window._bgAlertFired = {}; window._bgAlertSig = null; _notifOnceReset(); window.__ln.length = 0;
    }, prefs || null);
  };
  await legacy(null);
  await page.evaluate(() => { for (let i = 0; i <= 4; i++) _bgArrivalNotify(i); });
  await t('환승 한 정거장 전·목적지 한 정거장 전 알림이 나간다', async () => { const ts = await titles(); assert.ok(ts.some(x => /환승/.test(x)), JSON.stringify(ts)); assert.ok(ts.some(x => /하차/.test(x)), JSON.stringify(ts)); });
  await legacy({ transfer: 0 });
  await page.evaluate(() => { for (let i = 0; i <= 4; i++) _bgArrivalNotify(i); });
  await t('환승 알림을 끄면 구형 경로에서도 환승 알림이 나가지 않는다(하차는 나감)', async () => { const ts = await titles(); assert.ok(!ts.some(x => /환승/.test(x)), JSON.stringify(ts)); assert.ok(ts.some(x => /하차/.test(x)), JSON.stringify(ts)); });

  console.log('[오버레이 — 알림과 같은 위치·남은 시간을 받는다]');
  await setup(null);
  await page.evaluate(() => { window._htlBoarded = true; window._nodePassMs = { 1: Date.now() }; window._gpsMaxIdx = 1; window._gpsConfirmIdx = 1; });
  await page.evaluate(() => new Promise(r => { _ovlRefresh(() => r()); }));
  await page.evaluate(() => { window.__ovl.length = 0; _ovlSync(true); });
  await t('오버레이가 켜지고(active) 현재역 칸에 A0 이 들어간다', async () => {
    const o = await page.evaluate(() => window.__ovl[window.__ovl.length - 1]);
    assert.ok(o, '오버레이 갱신이 없음'); assert.strictEqual(o.active, true); assert.ok(o.track && o.track.some(x => /A0/.test(x)), JSON.stringify(o.track));
  });
  await t('남은 시간 줄이 있다', async () => { const o = await page.evaluate(() => window.__ovl[window.__ovl.length - 1]); assert.ok(/남은시간/.test(o.line2 || ''), JSON.stringify(o)); });
  await t('여정이 확정돼 있으면 네이티브에 keepAlive 를 켠다', async () => { await page.evaluate(() => { _ovlKaOn = null; _ovlKeepAliveSync(); }); const k = await page.evaluate(() => window.__ka[window.__ka.length - 1]); assert.ok(k && k.on === true, JSON.stringify(k)); });
  await page.evaluate(() => { window._gpsMaxIdx = 8; window._gpsConfirmIdx = 8; window._nodePassMs = { 1: Date.now() - 600000, 8: Date.now() }; window.__ovl.length = 0; _ovlSync(true); });
  await t('목적지 2정거장 전이면 오버레이 경고 단계가 2(천천히 도는 테두리)', async () => { const o = await page.evaluate(() => window.__ovl[window.__ovl.length - 1]); assert.strictEqual(o.alert, 2, JSON.stringify(o)); });
  await page.evaluate(() => { window._gpsMaxIdx = 9; window._gpsConfirmIdx = 9; window._nodePassMs[9] = Date.now(); window.__ovl.length = 0; _ovlSync(true); });
  await t('목적지 1정거장 전이면 경고 단계가 1(빠르게)', async () => { const o = await page.evaluate(() => window.__ovl[window.__ovl.length - 1]); assert.strictEqual(o.alert, 1, JSON.stringify(o)); });
  await page.evaluate(() => { window._routeLocked = false; _transitNodeData = null; window._lastHtlNodes = null; S.route = null; window.__ovl.length = 0; _ovlSync(true); });
  await t('여정이 끝나면 오버레이가 꺼진다(active=false)', async () => { const o = await page.evaluate(() => window.__ovl[window.__ovl.length - 1]); assert.ok(o && o.active === false, JSON.stringify(o)); });

  console.log('[하차 전 추천 · 출퇴근 브리핑]');
  await setup(null);
  await page.evaluate(() => { window.__ln.length = 0; _notifOnceReset(); _arrFireAlertNow('B4', Date.now() + 10 * 60000); });
  await page.clock.runFor(1500);
  await t('하차 10분 전 추천 알림이 나가고 [확인하기] 버튼 유형이 붙는다', async () => {
    const ln = await page.evaluate(() => window.__ln); const r = ln.find(n => n.extra && n.extra.type === 'arrive_reco');
    assert.ok(r, JSON.stringify(ln.map(n => n.title))); assert.strictEqual(r.actionTypeId, 'arrive_reco_actions');
  });
  await t('같은 여정에서는 한 번만 나간다', async () => {
    await page.evaluate(() => _arrFireAlertNow('B4', Date.now() + 9 * 60000)); await page.clock.runFor(1500);
    const ln = await page.evaluate(() => window.__ln); assert.strictEqual(ln.filter(n => n.extra && n.extra.type === 'arrive_reco').length, 1);
  });
  await page.evaluate(() => { _notifPrefSet('arrive_reco', 0); _notifOnceReset(); window.__ln.length = 0; _arrFireAlertNow('B4', Date.now() + 10 * 60000); });
  await page.clock.runFor(1500);
  await t('설정에서 하차 전 추천을 끄면 알림이 나가지 않는다', async () => assert.ok(!(await page.evaluate(() => window.__ln)).some(n => n.extra && n.extra.type === 'arrive_reco')));
  await page.evaluate(() => { _notifPrefSet('arrive_reco', 1); window.__ln.length = 0; _cmAlarm.on = false; _fireCommuteBriefing('morn'); });
  await t('출퇴근 브리핑 스위치가 꺼져 있으면 알림이 나가지 않는다', async () => assert.strictEqual((await page.evaluate(() => window.__ln)).length, 0));
  await page.evaluate(() => { _cmAlarm.on = true; window.__ln.length = 0; _fireCommuteBriefing('morn'); });
  await page.clock.runFor(500);
  await t('스위치를 켜면 출근길 브리핑 알림이 나간다', async () => { const ln = await page.evaluate(() => window.__ln); assert.ok(ln.some(n => /브리핑/.test(n.title)), JSON.stringify(ln.map(n => n.title))); });
  await t('예약 시각(07:30)·요일이 맞을 때만 자동 발사된다(_cmTick)', async () => {
    await page.evaluate(() => { _cmAlarm.on = true; _cmAlarm.days = [4]; _cmAlarm.morn = '07:30'; _cmAlarm.lastKey = ''; window.__ln.length = 0; });
    await page.clock.setSystemTime(new Date('2026-10-08T07:30:10+09:00'));
    await page.evaluate(() => _cmTick()); await page.clock.runFor(1500);
    const n1 = await page.evaluate(() => window.__ln.filter(n => /출근길 브리핑/.test(n.title)).length);
    await page.evaluate(() => { _cmAlarm.days = [1, 2, 3, 5]; _cmAlarm.lastKey = ''; window.__ln.length = 0; _cmTick(); }); await page.clock.runFor(1500);
    const n2 = await page.evaluate(() => window.__ln.filter(n => /브리핑/.test(n.title)).length);
    assert.strictEqual(n1, 1, '목요일 07:30 에 나가야 함'); assert.strictEqual(n2, 0, '선택하지 않은 요일엔 안 나가야 함');
  });

  await t('JS 오류가 없다', async () => assert.deepStrictEqual([...new Set(errs)], []));
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패');
  await b.close();
  process.exit(fail ? 1 : 0);
})();
