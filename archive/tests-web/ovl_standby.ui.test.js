// 대기 모드 맡겨 두기 — 2026-10-13 (YJ: "카카오지하철처럼 안내 로직을 네이티브로")
//   웹뷰가 살아 있는 동안 앱은 '여정 상태'를 네이티브(Overlay.standbyPacket)에 맡겨 둔다. 이 상태를 진짜 엔진(rideStandby)에 넣어도 바로 돌아야 한다.
//   여정이 끝나면 standbyEnd. (실제 이어받기는 KeepAliveService — 자바라 이 환경에서는 CI 컴파일로만 확인)
// 실행: node test/ovl_standby.ui.test.js [html 경로]
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
    window.__sb = { packets: [], ends: 0 };
    window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
    window.Capacitor.Plugins.Overlay = {
      standbyPacket: (o) => { window.__sb.packets.push({ at: Date.now(), state: o.state, url: o.url }); return Promise.resolve({ ok: true }); },
      standbyEnd: () => { window.__sb.ends++; return Promise.resolve({ ok: true }); },
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
    _transitNodeData = st.map((s, i) => ({ name: s[0], lat: lat0, lng: lng0 + (i * 1000) / kx, isWalk: false, isOrigin: i === 0, isSub: i > 0, isBus: false, lineName: i > 0 ? '인천1호선' : '', _schedMin: base + s[1], _plan0: base + s[1], arrTime: hm(base + s[1]), el: null }));
    window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null; window._trackSig = 'T'; window._trackBase = 1;
    window._htlBoarded = true; window._xferRouteRef = _transitNodeData; window._xferOK = {};
    window._nodePassMs = {}; window._nodePassSrc = {}; window._nodePassPf = {};
    for (let i = 1; i <= 2; i++) { window._nodePassMs[i] = new Date('2026-10-13T18:00:00+09:00').getTime() + st[i][1] * 60000; window._nodePassSrc[i] = 'gps'; }
    window._gpsMaxIdx = 2; window._gpsConfirmIdx = 2;
    _buildTransitAlertTargets();
    _recalcArrivalsFrom(2);
  }, [ST, LAT0, LNG0, KX]);
  await page.clock.runFor(1000);

  await t('여정 상태가 네이티브에 맡겨진다(엔진 응답을 받을 때 8초에 한 번 이내)', async () => {
    await page.evaluate(() => { _etaRequest('pass'); }); await page.clock.runFor(1500);
    const n = await page.evaluate(() => window.__sb.packets.length);
    assert.ok(n >= 1, '맡긴 적이 없다');
    await page.clock.runFor(40000);
    const n2 = await page.evaluate(() => window.__sb.packets.length);
    assert.ok(n2 <= 8, '너무 자주 맡긴다 ' + n2);
  });

  await t('맡긴 상태를 진짜 엔진(rideStandby)에 그대로 넣으면 돈다 — 문구·대상·허용 종류가 있다', async () => {
    await page.evaluate(() => _ovlStandbyPush(true));
    const p = await page.evaluate(() => window.__sb.packets[window.__sb.packets.length - 1]);
    assert.ok(/\/ride-standby$/.test(p.url), p.url);
    const st = JSON.parse(p.state), now = await page.evaluate(() => Date.now());
    assert.ok(st.eta && st.eta.nodes.length === ST.length && st.eta.timetableFirst === true && st.eta.nowMs === undefined, 'eta');
    assert.ok(st.stops.length >= 5 && st.stops.some(s => s.fin), '정류장·최종 목적지');
    assert.ok(st.cfg.targets.some(x => x.kind === 'dest') && st.cfg.seq.length === ST.length - 1, '알림 대상');
    ['transfer2', 'transfer', 'near_arrive2', 'near_arrive', 'arrive'].forEach(k => assert.strictEqual(typeof st.cfg.allowed[k], 'boolean', k));
    const r = rideStandby({ nowMs: now, fixes: [], state: st });
    assert.ok(!r.error, r.error); assert.strictEqual(r.overlay, null, 'DOM 칸이 없으면 그림 틀도 없다(오버레이 없음)'); assert.ok(/^다음 /.test(r.ongoing.text), r.ongoing.text); assert.ok(r.state.etaMs.length === ST.length);
  });

  await t('보낸 하차 알림은 상태의 fired 에 실려 네이티브도 안다(같은 알림을 또 울리지 않게)', async () => {
    await page.evaluate(() => { window._transitAlertFired = { '6_2': 1 }; _ovlStandbyPush(true); });
    const p = await page.evaluate(() => window.__sb.packets[window.__sb.packets.length - 1]);
    assert.strictEqual(JSON.parse(p.state).fired['6_2'], 1);
  });

  await t('승차 전이면 맡기지 않는다(탑승 확정 뒤에 맡긴다)', async () => {
    const n0 = await page.evaluate(() => window.__sb.packets.length);
    await page.evaluate(() => { window._htlBoarded = false; window._ovlSbAt = 0; _ovlStandbyPush(true); });
    assert.strictEqual(await page.evaluate(() => window.__sb.packets.length), n0);
    await page.evaluate(() => { window._htlBoarded = true; });
  });

  await t('여정이 끝나면(_cleanupBgTracking) 네이티브에 끝났다고 알린다', async () => {
    await page.evaluate(() => _cleanupBgTracking());
    assert.strictEqual(await page.evaluate(() => window.__sb.ends), 1);
  });

  await t('페이지 오류 없음', async () => assert.deepStrictEqual([...new Set(errs)], []));
  await b.close();
  console.log('\novl_standby: ' + pass + ' pass ' + fail + ' fail'); process.exit(fail ? 1 : 0);
})();
