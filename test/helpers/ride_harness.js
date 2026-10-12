// 버스 탑승·위치추적 시험용 공용 도구 — 헤드리스 Chromium + 가짜 시계 + 가짜 Capacitor 플러그인 + 모의 엔진(요청 횟수를 센다).
// GPS 는 context.setGeolocation(앱의 navigator.geolocation)과 BackgroundGeolocation 콜백(확정 뒤 백그라운드 위치)에 같이 넣는다.
const path = require('path');
const { chromium } = require('./pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', '..', 'www', 'index.html');
const DEG_PER_M_LNG = 1 / (111320 * Math.cos(37.5547 * Math.PI / 180)), DEG_PER_M_LAT = 1 / 110574;

async function launch() { return chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] }); }

async function newApp(b, respFn, start) {
  start = start || { lat: 37.5547, lng: 126.9755 };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: start.lat, longitude: start.lng }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('gdm_loc_disclosed', '1'); localStorage.setItem('ovlOn', '1'); localStorage.setItem('bgPermGuided', '1'); } catch (e) {}
    window.__ln = []; window.__ovl = []; window.__bg = [];
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
      LocalNotifications: { schedule: (o) => { window.__ln.push(o.notifications[0]); return Promise.resolve(); }, checkPermissions: () => Promise.resolve({ display: 'granted' }), requestPermissions: () => Promise.resolve({ display: 'granted' }), createChannel: () => Promise.resolve(), registerActionTypes: () => Promise.resolve(), addListener: () => Promise.resolve({ remove() {} }), cancel: () => Promise.resolve() },
      Overlay: { isAvailable: () => Promise.resolve({ granted: true, supported: true }), requestPermission: () => Promise.resolve({ granted: true }), update: (o) => { window.__ovl.push(o); return Promise.resolve(); }, addListener: () => Promise.resolve({ remove() {} }) },
      BackgroundGeolocation: { addWatcher: (o, cb) => { window.__bgcb = cb; window.__bg.push('add'); return Promise.resolve('w1'); }, removeWatcher: () => { window.__bg.push('remove'); return Promise.resolve(); } },
    } };
  });
  const page = await ctx.newPage(); const errs = []; const stat = { routeReq: 0, msgs: [] };
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { const t = m.text(); if (/되돌림|재앵커|놓쳤/.test(t)) stat.msgs.push(t.slice(0, 160)); });
  await page.route('**/*', r => { const u = new URL(r.request().url()); if (u.protocol === 'file:' || u.protocol === 'data:') return r.continue();
    const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    // 실시간 차량 위치 워커(gildongmu-ride) 모의 — stat.vehFn(body) 가 돌려주는 JSON 을 그대로 응답(없으면 {ok:false}). 요청 본문은 stat.veh 에 쌓는다.
    if (/gildongmu-ride/.test(u.host)) {
      if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, H) });
      let bd = null; try { bd = JSON.parse(r.request().postData() || 'null'); } catch (e) {}
      (stat.veh = stat.veh || []).push(bd);
      let o = { ok: false }; try { if (stat.vehFn) o = stat.vehFn(bd); } catch (e) { o = { ok: false, error: String(e.message) }; }
      if (o === 500) return r.fulfill({ status: 500, headers: H, body: '{}' });
      return r.fulfill({ status: 200, headers: H, body: JSON.stringify(o) });
    }
    if (/route-v2/.test(u.host) && /route-v2-app/.test(u.pathname)) { stat.routeReq++; const qs = Object.fromEntries(u.searchParams); (stat.routeQs = stat.routeQs || []).push(qs); return r.fulfill({ status: 200, headers: H, body: JSON.stringify(respFn(qs)) }); }   // respFn 은 요청 쿼리(SX,SY,EX,EY…)를 받을 수 있다(기존 시험은 인자를 안 쓴다)
    if (/route-v2/.test(u.host)) return r.fulfill({ status: 200, headers: H, body: '{}' });
    return r.fulfill({ status: 200, headers: H, body: '{}' }); });
  await page.clock.install({ time: new Date('2026-10-08T21:00:00+09:00') });
  await page.goto('file://' + html); await page.clock.runFor(3500);
  const app = { b, ctx, page, errs, stat, cur: { lat: start.lat, lng: start.lng } };
  // 한 점으로 GPS 를 보내고 secs 초 흘린다
  app.feed = async (lat, lng, speed, secs) => {
    app.cur = { lat, lng };
    const has = await page.evaluate(() => typeof window.__bgcb === 'function');
    if (has) await page.evaluate(([la, ln, sp]) => window.__bgcb({ latitude: la, longitude: ln, accuracy: (window.__acc || 10), speed: sp, time: Date.now() }), [lat, lng, speed]);
    await ctx.setGeolocation({ latitude: lat, longitude: lng, accuracy: app.acc || 10 }); if (app.acc) await page.evaluate((a) => { window.__acc = a; }, app.acc);
    await page.clock.runFor(secs * 1000);
  };
  // 점들을 이은 선을 따라 mps 로 이동(tick 초마다 GPS)
  app.moveAlong = async (pts, mps, tick, each) => {
    for (const q of pts) {
      let guard = 0;
      while (guard++ < 5000) {
        const dx = (q.lng - app.cur.lng) / DEG_PER_M_LNG, dy = (q.lat - app.cur.lat) / DEG_PER_M_LAT, d = Math.hypot(dx, dy);
        if (d < 1) break;
        const step = Math.min(d, mps * tick), f = step / d;
        await app.feed(app.cur.lat + (q.lat - app.cur.lat) * f, app.cur.lng + (q.lng - app.cur.lng) * f, mps, tick);
        if (each) await each();
      }
    }
  };
  app.search = async () => {
    await page.click('#fmapDestInp'); await page.fill('#fmapDestInp', '수원'); await page.clock.runFor(800);
    await page.click('#fmapDestSug > *:first-child'); await page.clock.runFor(500);
    await page.click('#fmapRouteBtn'); await page.clock.runFor(3500);
  };
  app.confirm = async () => { await page.click('#mainConfirmRouteBtn'); await page.clock.runFor(2500); };
  app.state = () => page.evaluate(() => ({ gm: window._gpsMaxIdx, gc: window._gpsConfirmIdx, boarded: window._htlBoarded, locked: window._routeLocked, riding: window._rideEv().riding, now: window._rideEv().now,
    names: (typeof _transitNodeData !== 'undefined' ? _transitNodeData.map(n => n.name) : []), pend: window._pendingRouteType }));
  return app;
}
module.exports = { launch, newApp, DEG_PER_M_LNG, DEG_PER_M_LAT };
