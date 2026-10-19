// 알림 종류 허용 여부를 엔진이 정하기(설정 스위치 gdm_npol) ↔ 앱(JS) 연결 시험 — 2026-10-19 (5번 5단계 첫 조각)
//   진짜 index.html + 진짜 엔진 모듈(engine/notif-policy.js)에 연결해 확인한다:
//   · 꺼져 있으면(기본) 예전 그대로 — 엔진에 묻지 않는다
//   · 켜면: 모든 조합(예전 모드 × 브리핑 × 분류 스위치 16가지 × 종류)에서 엔진 표의 답 = 예전 웹 규칙의 답 · 실제로 엔진 표가 답한다(hits)
//   · 상태가 바뀌면(스위치를 건드리면) 새 표가 올 때까지 예전 규칙으로 답한다(틀린 답이 나가지 않는다) · 같은 상태는 다시 묻지 않는다
//   · 엔진에는 사용자가 켜 둔 상태(스위치·브리핑 켬·예전 모드)만 간다
//   · 실제 알림 길: showNotification 이 끈 종류를 보내지 않고 켠 종류를 보낸다
//   · 폴백: 404 · 응답 없음(2.5초) · 이상한 응답 → 바로 예전 규칙 + 60초 쉬기(그 뒤 다시 묻는다)
// 실행: node test/notif_npol.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const NP = require('../engine/notif-policy');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 900)); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ENG;
function resetEng() { ENG = { mode: 'ok', hits: [] }; }
const TYPES = ['transfer', 'transfer2', 'near_arrive', 'near_arrive2', 'arrive', 'arrival', 'proximity', 'arrive_reco', 'commute_brief', 'fg_service', 'general'];
const KEYS = ['arrive', 'transfer', 'proximity', 'arrive_reco'];

(async () => {
  resetEng();
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('gdm_loc_disclosed', '1'); } catch (e) {}
    window.__sched = [];
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
      LocalNotifications: { schedule: (o) => { o.notifications.forEach(n => window.__sched.push(n)); return Promise.resolve({}); }, checkPermissions: () => Promise.resolve({ display: 'granted' }), requestPermissions: () => Promise.resolve({ display: 'granted' }), createChannel: () => Promise.resolve(), registerActionTypes: () => Promise.resolve(), addListener: () => Promise.resolve({ remove() {} }), cancel: () => Promise.resolve(), getPending: () => Promise.resolve({ notifications: [] }), removeAllDeliveredNotifications: () => Promise.resolve() }
    } };
  });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => {
    const u = new URL(r.request().url()); if (u.protocol === 'file:' || u.protocol === 'data:') return r.continue();
    const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (/route-v2/.test(u.host) && u.pathname === '/notif-policy') {
      const body = r.request().postData() || ''; ENG.hits.push(body);
      if (ENG.mode === '404') return r.fulfill({ status: 404, headers: H, body: '{"error":"not found"}' });
      if (ENG.mode === 'hang') return;
      if (ENG.mode === 'bad') return r.fulfill({ status: 200, headers: H, body: '{"ok":true,"v":1,"types":{"transfer":{"n":"yes"}}}' });
      const out = NP.notifPolicy(JSON.parse(body)); out.ok = true;
      return r.fulfill({ status: 200, headers: H, body: JSON.stringify(out) });
    }
    return r.fulfill({ status: 200, headers: H, body: '{}' });
  });
  await page.clock.install({ time: new Date('2026-10-08T18:00:00+09:00') });
  await page.goto('file://' + html);
  await page.clock.runFor(3000);
  await page.clock.setFixedTime(new Date('2026-10-08T18:00:20+09:00'));

  // 상태 맞추기: mask(분류 스위치 4개) · legacy · cm
  const setState = (mask, legacy, cm) => page.evaluate(([mask, legacy, cm, KEYS]) => {
    const p = {}; KEYS.forEach((k, i) => { p[k] = (mask >> i) & 1; });
    localStorage.setItem('notifPref', JSON.stringify(p)); _notifPrefCache = null;
    window._notifLegacy = legacy; _cmAlarm.on = cm;
  }, [mask, legacy, cm, KEYS]);
  const sigMatch = () => page.evaluate(() => window._npState2.sig === JSON.stringify(_npState()) && !!window._npState2.tbl);
  const settle = async () => { for (let i = 0; i < 100; i++) { if (await sigMatch()) return true; await page.evaluate(() => { _npAnswer('transfer', 'n'); }); await sleep(30); await page.clock.runFor(30); } return false; };
  const answers = () => page.evaluate((TYPES) => TYPES.map(ty => [_notifAllowed(ty), _vibeAllowed(ty), _featureAllowed(ty), _notifAllowedLocal(ty), _vibeAllowedLocal(ty), _featureAllowedLocal(ty)]), TYPES);
  const reset = async (on, mode) => { resetEng(); if (mode) ENG.mode = mode; await setState(15, false, false); await page.evaluate((on) => { window._npSetUse(!!on); }, on); };

  console.log('[스위치 꺼짐 = 예전 그대로]');
  await reset(false);
  await t('꺼져 있으면 엔진에 묻지 않고 예전 규칙으로 답한다', async () => {
    const a = await answers(); a.forEach(r => assert.deepStrictEqual(r.slice(0, 3), r.slice(3)));
    assert.strictEqual(ENG.hits.length, 0); assert.strictEqual(await page.evaluate(() => window._npState2.hits), 0);
  });

  console.log('[스위치 켜짐 = 모든 조합에서 예전 규칙과 같고, 실제로 엔진 표가 답한다]');
  await reset(true);
  await t('엔진 표 = 예전 규칙 (예전 모드 2 × 브리핑 2 × 분류 스위치 16 × 종류 11)', async () => {
    let n = 0;
    for (const legacy of [false, true]) for (const cm of [false, true]) for (let mask = 0; mask < 16; mask++) {
      await setState(mask, legacy, cm);
      assert.ok(await settle(), '표가 안 왔다 ' + JSON.stringify({ legacy, cm, mask }));
      const h0 = await page.evaluate(() => window._npState2.hits);
      const a = await answers();
      a.forEach((r, i) => { assert.deepStrictEqual(r.slice(0, 3), r.slice(3), TYPES[i] + ' ' + JSON.stringify({ legacy, cm, mask })); n++; });
      assert.ok((await page.evaluate(() => window._npState2.hits)) - h0 >= TYPES.length * 3, '엔진 표가 답하지 않았다');
    }
    assert.strictEqual(n, 4 * 16 * TYPES.length);
  });
  await t('같은 상태에서는 엔진에 다시 묻지 않는다', async () => {
    await setState(15, false, false); assert.ok(await settle()); const h = ENG.hits.length;
    for (let i = 0; i < 20; i++) await answers();
    assert.strictEqual(ENG.hits.length, h);
  });
  await t('상태가 바뀐 순간에는 새 표가 오기 전에도 틀린 답이 나가지 않는다(예전 규칙)', async () => {
    await setState(15, false, false); assert.ok(await settle());
    // 환승 스위치를 끈다 → 낡은 표(켬)가 아니라 바로 '꺼짐'이 나와야 한다
    const r = await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('notifPref')); p.transfer = 0; localStorage.setItem('notifPref', JSON.stringify(p)); _notifPrefCache = null; return [_notifAllowed('transfer'), _vibeAllowed('transfer'), _featureAllowed('transfer')]; });
    assert.deepStrictEqual(r, [false, false, false]);
    assert.ok(await settle());
    assert.deepStrictEqual(await page.evaluate(() => [_notifAllowed('transfer'), _notifAllowed('near_arrive')]), [false, true]);
  });
  await t('엔진에는 사용자가 켜 둔 상태만 간다(스위치·브리핑·예전 모드)', async () => {
    const j = JSON.parse(ENG.hits[ENG.hits.length - 1]);
    assert.deepStrictEqual(Object.keys(j).sort(), ['cm', 'legacy', 'prefs']);
    assert.ok(typeof j.cm === 'boolean' && typeof j.legacy === 'boolean' && typeof j.prefs === 'object');
  });

  console.log('[실제 알림 길]');
  await t('끈 종류는 상단 알림을 보내지 않고, 켠 종류는 보낸다 (엔진 표로)', async () => {
    await setState(0b1101, false, false);   // transfer(bit1) 끔
    assert.ok(await settle());
    const h0 = await page.evaluate(() => window._npState2.hits);
    await page.evaluate(() => { window.__sched.length = 0; showNotification('환승 준비', 'x', { type: 'transfer', vibrate: [1] }); showNotification('곧 하차', 'y', { type: 'near_arrive', vibrate: [1] }); });
    const s = await page.evaluate(() => window.__sched.map(n => n.title));
    assert.deepStrictEqual(s, ['곧 하차']);
    assert.ok((await page.evaluate(() => window._npState2.hits)) > h0, '엔진 표가 답했다');
  });

  console.log('[폴백 — 바로 예전 규칙 · 60초 쉬기]');
  for (const mode of ['404', 'bad']) {
    await reset(true, mode); await setState(0b1101, false, false);
    const r = await page.evaluate(() => [_notifAllowed('transfer'), _notifAllowed('near_arrive')]);
    for (let i = 0; i < 60 && !(await page.evaluate(() => _npDown())); i++) { await sleep(30); await page.clock.runFor(30); }
    await t('엔진 ' + mode + ' → 답은 예전 규칙 그대로(' + JSON.stringify(r) + ') · 카드는 문제로 표시', async () => {
      assert.deepStrictEqual(r, [false, true]);
      assert.strictEqual(await page.evaluate(() => _npDown()), true);
      assert.ok(/대신 이어가고/.test(await page.evaluate(() => document.getElementById('npolSetStat').textContent)));
    });
    const before = ENG.hits.length;
    await page.evaluate(() => { _notifAllowed('transfer'); _vibeAllowed('transfer'); });
    await t('쉬는 60초 동안은 엔진에 묻지 않는다 (' + mode + ')', async () => assert.strictEqual(ENG.hits.length, before));
  }
  await reset(true, '404');
  for (let i = 0; i < 60 && !(await page.evaluate(() => _npDown())); i++) { await sleep(30); await page.clock.runFor(30); }
  ENG.mode = 'ok'; await page.clock.runFor(61000); await page.clock.setFixedTime(new Date('2026-10-08T18:01:25+09:00'));
  await t('60초가 지나면 다시 엔진에 묻고 표가 온다', async () => {
    assert.strictEqual(await page.evaluate(() => _npDown()), false);
    assert.ok(await settle()); assert.ok(ENG.hits.length >= 2);
  });
  await page.clock.setFixedTime(new Date('2026-10-08T18:00:20+09:00')); await reset(true, 'hang');
  await sleep(150); await page.clock.runFor(2600); await sleep(100);
  await t('엔진이 응답 없으면(2.5초) 예전 규칙으로 · 쉬기', async () => { assert.strictEqual(await page.evaluate(() => _npDown()), true); assert.strictEqual(await page.evaluate(() => _notifAllowed('transfer')), true); });

  console.log('[설정 카드]');
  await reset(false);
  await t('카드: 꺼짐 문구 · 켜면 gdm_npol=1 · 끄면 0', async () => {
    assert.ok(/꺼짐/.test(await page.evaluate(() => document.getElementById('npolSetStat').textContent)));
    await page.evaluate(() => _npSetUse(true)); assert.strictEqual(await page.evaluate(() => localStorage.getItem('gdm_npol')), '1');
    assert.ok(/켜짐/.test(await page.evaluate(() => document.getElementById('npolSetStat').textContent)));
    await page.evaluate(() => _npSetUse(false)); assert.strictEqual(await page.evaluate(() => localStorage.getItem('gdm_npol')), '0');
  });
  await t('엔진 설정 화면의 npol 항목 문구가 카드와 같다', async () => {
    const SE = require('../engine/settings'); const row = SE.SETTINGS_FEATS.find(x => x.k === 'npol'); assert.ok(row);
    assert.strictEqual(await page.evaluate(() => document.querySelector('#npolSetCard p').textContent), row.desc);
  });
  await t('스크립트 오류 없음', async () => assert.deepStrictEqual(errs, []));

  await b.close();
  console.log('notif_npol: ' + pass + ' pass ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
