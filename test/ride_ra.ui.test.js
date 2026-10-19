// 하차·환승 알림 시점을 엔진이 정하기(설정 스위치 gdm_ra) ↔ 앱(JS) 연결 시험 — 2026-10-19 (5번 4단계)
//   진짜 index.html + 진짜 엔진 모듈(engine/ride-alert.js)을 한 장면(1호선 6역 → 2호선 4역, 환승 1회)에 연결해 확인한다:
//   · 꺼져 있으면(기본) 예전 그대로 — 엔진에 묻지 않는다
//   · 켜면: 엔진이 정한 알림이 예전 웹 규칙과 문구·진동·종류·순서까지 똑같다(같은 장면에서 둘을 나란히 비교) · 같은 상태는 다시 묻지 않는다 · 보낸 알림은 다시 나가지 않는다
//   · 엔진에는 노선·역 이름과 순번만 간다(좌표 없음) · 사용자가 끈 알림 종류는 엔진이 막는다
//   · 숨김 인계(_sbHanded)·예상 모드(_baseTimeMs)에서는 묻지도 울리지도 않는다(예전과 같다)
//   · 폴백: 404 · 응답 없음(2.5초) · 이상한 응답 → 바로 예전 규칙으로 울린다 + 60초 동안은 엔진에 묻지 않는다(그 뒤엔 다시 묻는다)
// 실행: node test/ride_ra.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const RA = require('../engine/ride-alert');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 900)); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

let ENG; // { mode:'ok'|'404'|'hang'|'bad'|'bad2', hits:[본문 글자] }
function resetEng() { ENG = { mode: 'ok', hits: [] }; }

(async () => {
  resetEng();
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('gdm_loc_disclosed', '1'); } catch (e) {}
    window.Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web', Plugins: {} };
  });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => {
    const u = new URL(r.request().url()); if (u.protocol === 'file:' || u.protocol === 'data:') return r.continue();
    const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (/route-v2/.test(u.host) && u.pathname === '/ride-alert') {
      const body = r.request().postData() || ''; ENG.hits.push(body);
      if (ENG.mode === '404') return r.fulfill({ status: 404, headers: H, body: '{"error":"not found"}' });
      if (ENG.mode === 'hang') return;
      if (ENG.mode === 'bad') return r.fulfill({ status: 200, headers: H, body: '{"ok":true,"v":1}' });
      if (ENG.mode === 'bad2') return r.fulfill({ status: 200, headers: H, body: '{"ok":true,"v":1,"alert":{"key":"1_1","type":5,"title":"x","body":"y","vib":"z"},"extra":[]}' });
      const out = RA.rideAlert(JSON.parse(body)); out.ok = true;
      return r.fulfill({ status: 200, headers: H, body: JSON.stringify(out) });
    }
    return r.fulfill({ status: 200, headers: H, body: '{}' });
  });
  await page.clock.install({ time: new Date('2026-10-08T18:00:00+09:00') });
  await page.goto('file://' + html);
  await page.clock.runFor(3000);
  await page.clock.setFixedTime(new Date('2026-10-08T18:00:20+09:00'));   // 시각이 흐르지 않게(덧말 '약 N분 후' 가 같게) — 타이머는 계속 돈다

  // 장면: 1호선 A0~A5(6역, 2분 간격) → A5 에서 2호선 B1~B4 로 환승 → 도착 B4.  인덱스: 0 출발(도보), 1~6 = A0~A5, 7~10 = B1~B4
  const setup = async (ra, prefs) => {
    await page.evaluate(([ra, prefs]) => {
      try { localStorage.removeItem('notifPref'); localStorage.setItem('gdm_ra', ra ? '1' : '0'); } catch (e) {}
      if (typeof _notifPrefCache !== 'undefined') _notifPrefCache = null;
      if (prefs) Object.keys(prefs).forEach(k => _notifPrefSet(k, prefs[k]));
      window.fmapDoRoute = function () {};
      window._raSetUse(!!ra);
      const base = new Date('2026-10-08T18:00:00+09:00'), midnight = new Date('2026-10-08T00:00:00+09:00');
      const baseMin = (base - midnight) / 60000;
      const hm = (m) => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.floor(m % 60)).slice(-2);
      const nodes = [{ name: '출발', lat: 37.5, lng: 126.9 - 0.004, isOrigin: true, isWalk: false, isSub: false, isBus: false, _schedMin: baseMin - 5, el: null }];
      for (let i = 0; i < 6; i++) { const m = baseMin + i * 2; nodes.push({ name: 'A' + i, lat: 37.5, lng: 126.9 + 0.0137 * i, isSub: true, isBus: false, isWalk: false, isOrigin: false, lineName: '1호선', _schedMin: m, el: null, arrTime: hm(m) }); }
      for (let i = 1; i <= 4; i++) { const m = baseMin + 10 + i * 2 + 2; nodes.push({ name: 'B' + i, lat: 37.51, lng: 126.9 + 0.0137 * 5 + 0.0137 * i, isSub: true, isBus: false, isWalk: false, isOrigin: false, lineName: '2호선', _schedMin: m, el: null, arrTime: hm(m) }); }
      _transitNodeData = nodes; window._lastHtlNodes = nodes; window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null; window._sbHanded = false;
      window._trackSig = 'T' + Math.random(); window._trackBase = 1; window._gpsMaxIdx = -1; window._gpsConfirmIdx = -1; window._nodePassMs = {}; window._htlBoarded = false;
      window._transitAlertFired = {}; try { _notifOnceReset(); } catch (e) {}
      window._pipTrip = { from: '출발', to: 'B4', at: Date.now() };
      window._buildTransitAlertTargets();
      window.__sn = [];
      if (!window.__snWrapped) { window.__snWrapped = true; window.showNotification = function (title, body, opt) { window.__sn.push({ title: title, body: body, vib: opt && opt.vibrate, type: opt && opt.type }); }; }
      window._raState.asks = 0; window._raState.ok = 0; window._raState.sig = ''; window._raState.busy = false;
    }, [ra, prefs || null]);
    resetEng();
  };
  const sn = () => page.evaluate(() => window.__sn.slice());
  const settle = async () => { for (let i = 0; i < 80; i++) { if (!(await page.evaluate(() => window._raState.busy))) return; await sleep(40); await page.clock.runFor(50); } };
  const at = async (i) => { await page.evaluate((i) => { window._gpsMaxIdx = i; window._checkTransitAlerts(i); }, i); await settle(); };

  console.log('[스위치 꺼짐 = 예전 그대로]');
  await setup(false);
  for (const i of [3, 4, 5, 5, 8]) await at(i);
  await t('꺼져 있으면 엔진에 묻지 않고 예전 규칙으로 울린다', async () => { assert.strictEqual(ENG.hits.length, 0); assert.ok((await sn()).length >= 2, JSON.stringify(await sn())); });
  const LOCAL = {};
  for (const [nm, seq] of [['걸어가며', [3, 4, 5, 5, 4, 8, 9, 10, 10]], ['건너뛰며', [8]], ['환승만', [5, 6, 7]]]) {
    await setup(false); for (const i of seq) await at(i); LOCAL[nm] = await sn();
  }

  console.log('[스위치 켜짐 = 같은 장면에서 예전 규칙과 똑같다]');
  for (const [nm, seq] of [['걸어가며', [3, 4, 5, 5, 4, 8, 9, 10, 10]], ['건너뛰며', [8]], ['환승만', [5, 6, 7]]]) {
    await setup(true); for (const i of seq) await at(i);
    const got = await sn();
    await t('엔진 경로 = 예전 경로: ' + nm + ' (' + got.map(x => x.title).join(' · ') + ')', async () => {
      assert.ok(got.length > 0, '알림 없음');
      assert.deepStrictEqual(got, LOCAL[nm]);
      assert.ok(ENG.hits.length > 0, '엔진에 안 물었다');
    });
  }

  console.log('[묻는 횟수 · 보낸 것 · 보내는 내용]');
  await setup(true);
  await at(3); const h1 = ENG.hits.length;
  for (let i = 0; i < 6; i++) await at(3);
  await t('같은 상태에서 여러 번 불러도 엔진에는 한 번만 묻는다', async () => { assert.strictEqual(h1, 1); assert.strictEqual(ENG.hits.length, 1, String(ENG.hits.length)); });
  await at(5); await at(5); await at(5);
  await t('보낸 알림은 다시 나가지 않는다(환승 준비 한 번)', async () => { const s = await sn(); assert.strictEqual(s.filter(x => x.title === '환승 준비').length, 1, JSON.stringify(s)); });
  await t('엔진에는 노선·역 이름과 순번만 간다(좌표 없음)', async () => {
    const j = JSON.parse(ENG.hits[0]);
    assert.ok(Array.isArray(j.nodes) && j.nodes.length === 11 && j.nodes[1].n === 'A0' && j.nodes[1].k === 's' && j.nodes[1].l === '1호선' && j.nodes[0].k === null);
    assert.ok(!/lat|lng|latitude|longitude/i.test(ENG.hits[0]), ENG.hits[0].slice(0, 200));
    assert.strictEqual(j.curIdx, 3); assert.ok(typeof j.nowMin === 'number' && j.allowed && j.allowed.transfer === true);
  });
  await t('엔진 응답이 오기 전에는 이미 보낸 알림 목록(fired)이 채워져 있다', async () => {
    const last = JSON.parse(ENG.hits[ENG.hits.length - 1]); assert.ok(typeof last.fired === 'object');
  });

  console.log('[끈 알림 종류 · 숨김 인계 · 예상 모드]');
  await setup(true, { transfer: false });
  await at(5);
  await t('사용자가 끈 환승 알림은 엔진이 막는다(allowed=false 로 보낸다)', async () => {
    assert.ok(ENG.hits.length >= 1 && JSON.parse(ENG.hits[0]).allowed.transfer === false, ENG.hits[0]);
    assert.deepStrictEqual((await sn()).filter(x => x.type === 'transfer'), []);
  });
  await setup(true);
  await page.evaluate(() => { window._sbHanded = true; });
  await at(5);
  await t('숨김 인계 중이면 묻지도 울리지도 않는다', async () => { assert.strictEqual(ENG.hits.length, 0); assert.deepStrictEqual(await sn(), []); });
  await setup(true);
  await page.evaluate(() => { _baseTimeMs = Date.now() + 3600000; });
  await at(5);
  await t('예상(미래) 모드면 묻지도 울리지도 않는다', async () => { assert.strictEqual(ENG.hits.length, 0); assert.deepStrictEqual(await sn(), []); });
  await page.evaluate(() => { _baseTimeMs = null; });

  console.log('[폴백 — 바로 예전 규칙 · 60초 쉬기]');
  for (const mode of ['404', 'bad', 'bad2']) {
    await setup(true); ENG.mode = mode;
    await at(5);
    await t('엔진 ' + mode + ' → 바로 예전 규칙으로 울린다 · 카드는 문제로 표시', async () => {
      assert.ok((await sn()).some(x => x.title === '환승 준비'), JSON.stringify(await sn()));
      assert.strictEqual(await page.evaluate(() => _raDown()), true);
      assert.ok(/대신 이어가고/.test(await page.evaluate(() => document.getElementById('raSetStat').textContent)));
    });
    const before = ENG.hits.length;
    await at(8); await at(9);
    await t('쉬는 60초 동안은 엔진에 묻지 않고 예전 규칙으로 계속 울린다 (' + mode + ')', async () => {
      assert.strictEqual(ENG.hits.length, before);
      assert.ok((await sn()).some(x => x.title === '목적지 2정거장 전') && (await sn()).some(x => x.title === '곧 하차'), JSON.stringify(await sn()));
    });
  }
  await setup(true); ENG.mode = '404'; await at(5);
  ENG.mode = 'ok'; await page.clock.runFor(61000); await page.clock.setFixedTime(new Date('2026-10-08T18:01:25+09:00')); const hb = ENG.hits.length;
  await at(8);
  await t('60초가 지나면 다시 엔진에 묻는다', async () => { assert.ok(ENG.hits.length > hb, hb + ' → ' + ENG.hits.length); assert.strictEqual(await page.evaluate(() => _raDown()), false); assert.ok((await sn()).some(x => x.title === '목적지 2정거장 전')); });
  await setup(true); ENG.mode = 'hang';
  await page.evaluate(() => { window._gpsMaxIdx = 5; window._checkTransitAlerts(5); });
  await sleep(150); await page.clock.runFor(2600); await sleep(100);
  await t('엔진이 응답 없으면(2.5초) 예전 규칙으로 울린다', async () => { assert.ok((await sn()).some(x => x.title === '환승 준비'), JSON.stringify(await sn())); assert.strictEqual(await page.evaluate(() => _raDown()), true); });

  console.log('[설정 카드]');
  await setup(false);
  await t('카드는 있고 꺼짐 문구 · 스위치 켜면 gdm_ra=1 · 끄면 0', async () => {
    assert.ok(/꺼짐/.test(await page.evaluate(() => document.getElementById('raSetStat').textContent)));
    await page.evaluate(() => _raSetUse(true)); assert.strictEqual(await page.evaluate(() => localStorage.getItem('gdm_ra')), '1');
    assert.ok(/켜짐/.test(await page.evaluate(() => document.getElementById('raSetStat').textContent)));
    await page.evaluate(() => _raSetUse(false)); assert.strictEqual(await page.evaluate(() => localStorage.getItem('gdm_ra')), '0');
  });
  await t('엔진 설정 화면에 ra 항목이 있고 문구가 카드와 같다', async () => {
    const SE = require('../engine/settings'); const row = SE.SETTINGS_FEATS ? SE.SETTINGS_FEATS.find(x => x.k === 'ra') : null;
    assert.ok(row, 'ra 항목 없음'); assert.strictEqual(await page.evaluate(() => document.querySelector('#raSetCard p').textContent), row.desc);
  });
  await t('스크립트 오류 없음', async () => assert.deepStrictEqual(errs, []));

  await b.close();
  console.log('ride_ra: ' + pass + ' pass ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
