// 숨김 인계(엔진 s50) 웹 접착 — 2026-10-19 (YJ: "앱이 가려지면 응답이 몰려서 영점이 늦다 — 자바로")
//   앱이 가려지면 네이티브(KeepAliveService)가 엔진(/ride-standby)으로 안내를 이어받고, 다시 보이면 웹이 standbyTake 로 서비스가 쥔 엔진 상태를 돌려받는다.
//   이 시험은 웹 쪽만 본다: 설정 스위치 · 패킷의 handoff 표시 · 인계 중 웹의 알림/영점 요청 멈춤 · 돌려받은 상태 받아 적기(통과 시각 · 보낸 알림 · 진행도)
//   · 다른 여정/환승 바닥/웹이 이미 아는 값 무시 · 돌려받기가 안 돼도 멈춰 서지 않음. (자바는 CI 컴파일, 엔진은 ride_standby 시험)
// 실행: node test/sbh_handback.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const { rideStandby } = require(path.join(__dirname, '..', 'engine', 'ride-standby.js'));
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
const LAT0 = 37.5, LNG0 = 126.9, KX = 88000;
const ST = [['출발', -20], ['캠퍼스타운', 0], ['동막', 3], ['동춘', 5], ['원인재', 7], ['신연수', 9], ['선학', 11]];

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: LAT0, longitude: LNG0 }, permissions: ['geolocation'] });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
  await page.addInitScript(() => {
    window.__sb = { packets: [], takes: 0, takeAns: null };
    window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
    window.Capacitor.Plugins.Overlay = {
      standbyPacket: (o) => { window.__sb.packets.push({ at: Date.now(), state: o.state, url: o.url, handoff: o.handoff }); return Promise.resolve({ ok: true }); },
      standbyEnd: () => Promise.resolve({ ok: true }),
      standbyTake: () => { window.__sb.takes++; return Promise.resolve(window.__sb.takeAns || { active: false, handoff: false }); },
      keepAlive: () => Promise.resolve({ ok: true })
    };
  });
  const em = require('./helpers/eta_mock'); await em.installEtaMock(page); em.autoWait(page);
  await page.clock.install({ time: new Date('2026-10-13T18:05:00+09:00') });
  await page.goto('file://' + html); await page.clock.runFor(2500);
  await page.evaluate(([st, lat0, lng0, kx]) => {
    window.fmapDoRoute = function () {};
    const mid = new Date('2026-10-13T00:00:00+09:00'), base = (new Date('2026-10-13T18:00:00+09:00') - mid) / 60000;
    const hm = (m) => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.floor(m % 60)).slice(-2);
    _transitNodeData = st.map((s, i) => ({ name: s[0], lat: lat0, lng: lng0 + (i * 1000) / kx, isWalk: false, isOrigin: i === 0, isSub: i > 0, isBus: false, lineName: i > 0 ? '인천1호선' : '', _schedMin: base + s[1], _plan0: base + s[1], arrTime: hm(base + s[1]), planMin: base + s[1] }));
    window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null; window._trackSig = 'T'; window._trackBase = 1;
    window._htlBoarded = true; window._xferRouteRef = _transitNodeData; window._xferOK = {};
    window._nodePassMs = {}; window._nodePassSrc = {}; window._nodePassPf = {};
    for (let i = 1; i <= 2; i++) { window._nodePassMs[i] = new Date('2026-10-13T18:00:00+09:00').getTime() + st[i][1] * 60000; window._nodePassSrc[i] = 'gps'; }
    window._gpsMaxIdx = 2; window._gpsConfirmIdx = 2;
    _buildTransitAlertTargets();
    _recalcArrivalsFrom(2);
  }, [ST, LAT0, LNG0, KX]);
  await page.clock.runFor(1000);
  const T = (h, m, s) => Date.parse('2026-10-13T' + ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2) + ':' + ('0' + (s || 0)).slice(-2) + '+09:00');

  await t('설정 카드: 안드로이드 앱(standbyTake 있음)에서만 보이고, 스위치는 저장되며 기본 꺼짐', async () => {
    await page.evaluate(() => _sbhSyncCard());
    assert.strictEqual(await page.evaluate(() => document.getElementById('sbhSetCard').style.display), 'block');
    assert.strictEqual(await page.evaluate(() => _sbhOn()), false);
    assert.ok(/^꺼짐 — /.test(await page.evaluate(() => document.getElementById('sbhSetStat').textContent)));
    await page.evaluate(() => _sbhSetUse(true));
    assert.strictEqual(await page.evaluate(() => _sbhOn()), true);
    assert.ok(/^켜짐 — /.test(await page.evaluate(() => document.getElementById('sbhSetStat').textContent)));
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('gdm_sbh')), '1');
  });

  await t('맡기는 패킷에 handoff 표시가 실린다(켜면 true, 끄면 false)', async () => {
    await page.evaluate(() => { _sbhSetUse(true); window._ovlSbAt = 0; _ovlStandbyPush(true); });
    let p = await page.evaluate(() => window.__sb.packets[window.__sb.packets.length - 1]);
    assert.strictEqual(p.handoff, true);
    await page.evaluate(() => { _sbhSetUse(false); });
    p = await page.evaluate(() => window.__sb.packets[window.__sb.packets.length - 1]);
    assert.strictEqual(p.handoff, false);
    await page.evaluate(() => { _sbhSetUse(true); });
  });

  await t('인계 중(_sbHanded)에는 웹이 하차 알림도 영점 요청도 맡기기도 하지 않는다', async () => {
    const r = await page.evaluate(() => {
      let fired = 0, fetched = 0;
      const oldFire = window._fireTransitAlert, oldFetch = window.fetch;
      window._fireTransitAlert = function () { fired++; };
      window.fetch = function (u) { if (/ride-track/.test(String(u))) fetched++; return oldFetch.apply(this, arguments); };
      window._sbHanded = true;
      window._transitAlertFired = {}; _trk.at = 0; _trk.busy = false;
      const n0 = window.__sb.packets.length; window._ovlSbAt = 0;
      _checkTransitAlerts(5);   // 목적지 직전 — 평소라면 알림이 나가는 위치
      _trkRequest('t'); _ovlStandbyPush(true);
      const out = { fired, fetched, packets: window.__sb.packets.length - n0 };
      window._sbHanded = false; _checkTransitAlerts(5); out.firedAfter = fired;
      window._fireTransitAlert = oldFire; window.fetch = oldFetch; window._transitAlertFired = {};
      return out;
    });
    assert.deepStrictEqual([r.fired, r.fetched, r.packets], [0, 0, 0], JSON.stringify(r));
    assert.ok(r.firedAfter >= 1, '인계가 끝나면 알림이 다시 나간다: ' + JSON.stringify(r));
  });

  await page.clock.runFor(160000);   // 18:07:50 쯤 — 돌려받는 통과 시각(3번 18:05:20 · 4번 18:07:40)이 모두 지난 시각이어야 한다
  // 서비스가 이어받아 엔진이 만든 상태 흉내: 진짜 엔진으로 한 번 돌린 뒤 3·4번 통과와 보낸 알림을 적는다
  async function takeAns(mod) {
    await page.evaluate(() => { window._ovlSbAt = 0; _ovlStandbyPush(true); });
    const p = await page.evaluate(() => window.__sb.packets[window.__sb.packets.length - 1]);
    const r = rideStandby({ nowMs: T(18, 8, 30), fixes: [], state: JSON.parse(p.state) });
    assert.ok(!r.error, r.error);
    const st = r.state;
    st.eta.passes.push({ idx: 3, ms: T(18, 5, 20), src: 'gps' }, { idx: 4, ms: T(18, 7, 40), src: 'gps' });
    st.fired['5_2'] = 1;
    if (mod) mod(st);
    return { active: true, handoff: true, state: st, view: r.view, at: T(18, 8, 30), done: false };
  }

  await t('돌려받기: 서비스가 적은 GPS 통과 시각·진행도·보낸 알림을 그대로 받아 적고 인계 표시를 푼다', async () => {
    const ans = await takeAns();
    await page.evaluate((a) => { window.__sb.takeAns = a; window.__sb.takes = 0; window._sbHanded = true; window._transitAlertFired = {}; _sbHandback(); }, ans);
    await page.clock.runFor(300);
    const r = await page.evaluate(() => ({ h: window._sbHanded, takes: window.__sb.takes, p3: window._nodePassMs[3], p4: window._nodePassMs[4], s3: window._nodePassSrc[3], g: window._gpsMaxIdx, f: window._transitAlertFired, last: window._sbhLast }));
    assert.strictEqual(r.h, false); assert.strictEqual(r.takes, 1);
    assert.ok(Math.abs(r.p3 - T(18, 5, 20)) < 1500 && Math.abs(r.p4 - T(18, 7, 40)) < 1500, JSON.stringify(r));
    assert.strictEqual(r.s3, 'gps'); assert.ok(r.g >= 4, '진행도 ' + r.g);
    assert.strictEqual(r.f['5_2'], 1);
    assert.ok(r.last && r.last.passes === 2 && r.last.raised === true, JSON.stringify(r.last));
  });

  await t('돌려받은 값이 웹이 이미 아는 값이면(1초 안) 다시 적지 않는다', async () => {
    const ans = await takeAns();
    ans.state.eta.passes = ans.state.eta.passes.filter(p => p.idx !== 3 && p.idx !== 4).concat([{ idx: 4, ms: T(18, 7, 40) + 400, src: 'gps' }]);
    const n = await page.evaluate((a) => { window.__sb.takeAns = a; window._sbHanded = true; _sbHandback(); return 0; }, ans);
    await page.clock.runFor(300);
    assert.strictEqual(await page.evaluate(() => window._sbhLast.passes), 0);
  });

  await t('다른 여정(tripSig 다름)의 상태는 받지 않는다', async () => {
    const before = await page.evaluate(() => JSON.stringify(window._nodePassMs));
    const ans = await takeAns(st => { st.tripSig = 'OTHER'; st.eta.passes.push({ idx: 5, ms: T(18, 8, 50), src: 'gps' }); });
    await page.evaluate((a) => { window.__sb.takeAns = a; window._sbHanded = true; _sbHandback(); }, ans);
    await page.clock.runFor(300);
    assert.strictEqual(await page.evaluate(() => window._nodePassMs[5] == null), true);
    assert.strictEqual(await page.evaluate(() => window._sbHanded), false);
  });

  await t('환승완료 바닥 아래 통과는 건드리지 않는다', async () => {
    await page.evaluate(() => { delete window._nodePassMs[5]; window._rsFloor = { sig: 'T', idx: 6 }; });
    const ans = await takeAns(st => { st.eta.passes.push({ idx: 5, ms: T(18, 8, 50), src: 'gps' }); });
    await page.evaluate((a) => { window.__sb.takeAns = a; window._sbHanded = true; _sbHandback(); }, ans);
    await page.clock.runFor(300);
    assert.strictEqual(await page.evaluate(() => window._nodePassMs[5] == null), true, '바닥 아래(5 < 6) 통과가 적힘');
    await page.evaluate(() => { window._rsFloor = null; });
  });

  await t('서비스가 인계 중이 아니라고 답해도(8초 포기·옛 앱) 웹의 멈춤 표시는 풀리고 아무것도 바꾸지 않는다', async () => {
    const before = await page.evaluate(() => JSON.stringify([window._nodePassMs, window._gpsMaxIdx]));
    await page.evaluate(() => { window.__sb.takeAns = { active: false, handoff: false }; window._sbHanded = true; _sbHandback(); });
    await page.clock.runFor(300);
    assert.strictEqual(await page.evaluate(() => window._sbHanded), false);
    assert.strictEqual(await page.evaluate(() => JSON.stringify([window._nodePassMs, window._gpsMaxIdx])), before);
  });

  await t('앱이 다시 보이면(_onForegroundResume) 스위치가 켜져 있거나 인계 표시가 있을 때만 돌려받기를 부른다', async () => {
    await page.evaluate(() => { window.__sb.takes = 0; window.__sb.takeAns = { active: false, handoff: false }; _sbhSetUse(true); });
    await page.evaluate(() => { _onForegroundResume(); }); await page.clock.runFor(300);
    assert.ok(await page.evaluate(() => window.__sb.takes) >= 1, '켜져 있는데 안 부름');
    await page.evaluate(() => { _sbhSetUse(false); window.__sb.takes = 0; window._sbHanded = false; _onForegroundResume(); }); await page.clock.runFor(300);
    assert.strictEqual(await page.evaluate(() => window.__sb.takes), 0, '꺼져 있는데 부름');
    await page.evaluate(() => { window._sbHanded = true; _onForegroundResume(); }); await page.clock.runFor(300);
    assert.strictEqual(await page.evaluate(() => window.__sb.takes), 1, '인계 표시가 있는데 안 부름');
    await page.evaluate(() => { _sbhSetUse(true); });
  });

  await t('설정 화면 facts: 카드가 보일 때만 sbh 가 실린다(켜짐 여부 포함)', async () => {
    const r = await page.evaluate(() => { _sbhSyncCard(); const c = document.getElementById('sbhSetCard'); const sb = (window._scrS && window._scrS.facts) ? 1 : 0; return { disp: c.style.display, on: _sbhOn() }; });
    assert.strictEqual(r.disp, 'block'); assert.strictEqual(r.on, true);
  });

  await t('페이지 오류 없음', async () => assert.deepStrictEqual([...new Set(errs)], []));
  await b.close();
  console.log('\nsbh_handback: ' + pass + ' pass ' + fail + ' fail'); process.exit(fail ? 1 : 0);
})();
