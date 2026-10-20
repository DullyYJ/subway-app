// 하차 전 추천 시점을 엔진이 정하기(설정 스위치 gdm_arw) ↔ 앱(JS) 연결 시험 — 2026-10-19 (5번 5단계 둘째 조각)
//   진짜 index.html + 진짜 엔진 모듈(engine/arrive-reco.js)에 연결해 확인한다:
//   · 꺼져 있으면(기본) 예전 그대로 — 엔진에 묻지 않는다
//   · 켜면: 같은 입력(남은 초 × 지난 기록 × 목적지)에서 '보낼까'가 예전 웹 규칙과 같다(보낸 목적지·도착 시각·기록 키까지) · 엔진이 알려 준 시간대·저녁 여부를 쓴다
//   · 엔진이 '아직 이르다'고 한 동안은 다시 묻지 않는다(20초마다 도는 감시가 여정 내내 부르지 않게) · 기다리는 사이 이미 보냈으면 두 번 안 보낸다
//   · 예상(미래) 모드에서는 묻지도 보내지도 않는다
//   · 폴백: 404 · 응답 없음(2.5초) · 이상한 응답 → 바로 예전 규칙 + 60초 쉬기(그 뒤 다시 묻는다)
// 실행: node test/arrive_arw.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const AR = require('../engine/arrive-reco');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 900)); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ENG;
function resetEng() { ENG = { mode: 'ok', hits: [] }; }
const NOW = new Date('2026-10-08T18:00:20+09:00').getTime();

(async () => {
  resetEng();
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('gdm_loc_disclosed', '1'); } catch (e) {} window.Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web', Plugins: {} }; });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => {
    const u = new URL(r.request().url()); if (u.protocol === 'file:' || u.protocol === 'data:') return r.continue();
    const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (/route-v2/.test(u.host) && u.pathname === '/arrive-reco') {
      const body = r.request().postData() || ''; ENG.hits.push(body);
      if (ENG.mode === '404') return r.fulfill({ status: 404, headers: H, body: '{"error":"not found"}' });
      if (ENG.mode === 'hang') return;
      if (ENG.mode === 'bad') return r.fulfill({ status: 200, headers: H, body: '{"ok":true,"v":1,"fire":"yes"}' });
      const out = AR.arrRecoWhen(JSON.parse(body)); out.ok = true;
      return r.fulfill({ status: 200, headers: H, body: JSON.stringify(out) });
    }
    return r.fulfill({ status: 200, headers: H, body: '{}' });
  });
  await page.clock.install({ time: new Date(NOW) });
  await page.goto('file://' + html);
  await page.clock.runFor(3000);
  const fixAt = ms => page.clock.setFixedTime(new Date(ms));
  await fixAt(NOW);

  const setup = async (on, mode) => {
    resetEng(); if (mode) ENG.mode = mode;
    await fixAt(NOW);
    await page.evaluate((on) => {
      window._arwSetUse(!!on); window._arwStat.nextAt = 0;
      _baseTimeMs = null; window._arrAlertKey = null; window._arrAlertAt = 0; window._arwDec = null;
      window._arrAlightCoord = { name: '강남', lat: 37.5, lng: 127.0 };
      window.__fired = [];
      window._arrFireAlert = function (dest, arrMs) { window.__fired.push({ dest: dest, arrMs: arrMs, key: window._arrAlertKey }); };
    }, !!on);
  };
  const settle = async () => { for (let i = 0; i < 80; i++) { if (!(await page.evaluate(() => window._arwStat.busy))) return; await sleep(40); await page.clock.runFor(40); } };
  const fired = () => page.evaluate(() => window.__fired.slice());
  const call = async (arrMs, rem) => { await page.evaluate(([a, r]) => { window._arrCheckPreAlert(a, r); }, [arrMs, rem]); await settle(); };

  console.log('[스위치 꺼짐 = 예전 그대로]');
  await setup(false);
  await call(NOW + 300000, 300);
  await t('꺼져 있으면 엔진에 묻지 않고 예전 규칙으로 보낸다', async () => { assert.strictEqual(ENG.hits.length, 0); const f = await fired(); assert.strictEqual(f.length, 1); assert.strictEqual(f[0].dest, '강남'); });

  console.log('[스위치 켜짐 = 같은 입력에서 예전 규칙과 같다]');
  const rems = [0, 30, 59, 60, 61, 200, 419, 420, 421, 900];
  const lastKeys = ['', 'same', 'other'], lastAts = ['none', 'recent', 'old'], dests = ['강남', ''];
  const arrMs = NOW + 400000;
  const run = async (on, rem, lk, la, dest) => {
    await setup(on);
    await page.evaluate(([lk, la, dest, arrMs, NOW]) => {
      window._arrAlightCoord = dest ? { name: dest } : null;
      try{ window._arrDestName = function () { return null; }; }catch(e){}
      window._arrAlertKey = lk === '' ? null : (lk === 'same' ? String(arrMs) + '|' + dest : 'other|x');
      window._arrAlertAt = la === 'none' ? 0 : (la === 'recent' ? NOW - 60000 : NOW - 31 * 60000);
    }, [lk, la, dest, arrMs, NOW]);
    await call(arrMs, rem);
    return { f: await fired(), key: await page.evaluate(() => window._arrAlertKey), at: await page.evaluate(() => window._arrAlertAt) };
  };
  await t('모든 조합에서 예전 규칙과 같은 판정·같은 기록 (남은 초 10 × 지난 기록 3 × 시각 3 × 목적지 2)', async () => {
    let n = 0, fires = 0;
    for (const rem of rems) for (const lk of lastKeys) for (const la of lastAts) for (const dest of dests) {
      const a = await run(false, rem, lk, la, dest), e = await run(true, rem, lk, la, dest);
      const id = JSON.stringify({ rem, lk, la, dest });
      assert.deepStrictEqual(e.f.map(x => [x.dest, x.arrMs]), a.f.map(x => [x.dest, x.arrMs]), id);
      assert.strictEqual(e.key, a.key, id + ' key'); assert.strictEqual(e.at === 0, a.at === 0, id + ' at');
      n++; fires += a.f.length;
    }
    assert.strictEqual(n, 180); assert.ok(fires > 0 && fires < n, '보냄 ' + fires + '/' + n);
  });
  await t('엔진이 알려 준 시간대·저녁 여부를 쓴다(예전 _arrSlot/_arrIsDinner 와 같은 값)', async () => {
    await setup(true);
    const arr = Date.UTC(2026, 9, 8, 9, 5); const slotLocal = await page.evaluate((a) => [_arrSlotLocal(a), _arrIsDinnerLocal(a)], arr);
    await call(arr, 300);
    const got = await page.evaluate((a) => [window._arwDec && window._arwDec.arrMs === a, _arrSlot(a), _arrIsDinner(a)], arr);
    assert.deepStrictEqual(got, [true, slotLocal[0], slotLocal[1]]); assert.strictEqual(slotLocal[0], 'night'); assert.strictEqual(slotLocal[1], true);
    const other = await page.evaluate(() => [_arrSlot(1), _arrSlotLocal(1)]); assert.strictEqual(other[0], other[1]);
  });

  console.log('[묻는 횟수 · 중복]');
  await setup(true);
  await call(NOW + 3600000, 3600);
  const h1 = ENG.hits.length;
  for (let i = 0; i < 6; i++) await call(NOW + 3600000, 3600 - i);
  await t('남은 시간이 많으면 엔진이 길게 기다리라 해서 다시 묻지 않는다', async () => { assert.strictEqual(h1, 1); assert.strictEqual(ENG.hits.length, 1, String(ENG.hits.length)); assert.deepStrictEqual(await fired(), []); });
  await fixAt(NOW + 61000);
  await call(NOW + 3600000, 3540);
  await t('기다리라던 시간이 지나면 다시 묻는다', async () => assert.strictEqual(ENG.hits.length, 2));
  await setup(true);
  await call(arrMs, 300); await fixAt(NOW + 61000); await call(arrMs, 240); await fixAt(NOW + 130000); await call(arrMs, 180);
  await t('이미 보냈으면 다시 보내지 않는다(여정당 1회)', async () => assert.strictEqual((await fired()).length, 1));
  await t('엔진에는 필요한 값만 간다', async () => { const j = JSON.parse(ENG.hits[0]); assert.deepStrictEqual(Object.keys(j).sort(), ['arrMs', 'dest', 'lastAt', 'lastKey', 'nowMs', 'remSec']); });
  await setup(true);
  await page.evaluate(() => { _baseTimeMs = Date.now() + 3600000; });
  await call(arrMs, 300);
  await t('예상(미래) 모드면 묻지도 보내지도 않는다', async () => { assert.strictEqual(ENG.hits.length, 0); assert.deepStrictEqual(await fired(), []); });
  await page.evaluate(() => { _baseTimeMs = null; });

  console.log('[폴백 — 바로 예전 규칙 · 60초 쉬기]');
  for (const mode of ['404', 'bad']) {
    await setup(true, mode);
    await call(arrMs, 300);
    await t('엔진 ' + mode + ' → 바로 예전 규칙으로 보낸다 · 카드는 문제로 표시', async () => {
      assert.strictEqual((await fired()).length, 1);
      assert.strictEqual(await page.evaluate(() => _arwDown()), true);
      assert.ok(/대신 이어가고/.test(await page.evaluate(() => document.getElementById('arwSetStat').textContent)));
    });
    const before = ENG.hits.length;
    await page.evaluate(() => { window._arrAlertKey = null; window._arrAlertAt = 0; });
    await call(arrMs + 1000, 300);
    await t('쉬는 60초 동안은 엔진에 묻지 않고 예전 규칙으로 계속 정한다 (' + mode + ')', async () => { assert.strictEqual(ENG.hits.length, before); assert.strictEqual((await fired()).length, 2); });
  }
  await setup(true, '404'); await call(arrMs, 300);
  ENG.mode = 'ok'; await page.clock.runFor(61000); await fixAt(NOW + 65000);
  await page.evaluate(() => { window._arrAlertKey = null; window._arrAlertAt = 0; });
  const hb = ENG.hits.length;
  await call(arrMs, 240);
  await t('60초가 지나면 다시 엔진에 묻고 엔진이 정한 대로 보낸다', async () => { assert.ok(ENG.hits.length > hb); assert.strictEqual(await page.evaluate(() => _arwDown()), false); assert.strictEqual((await fired()).length, 2); });
  await setup(true, 'hang');
  await page.evaluate((a) => { window._arrCheckPreAlert(a, 300); }, arrMs);
  await sleep(150); await page.clock.runFor(2600); await sleep(100);
  await t('엔진이 응답 없으면(2.5초) 예전 규칙으로 보낸다 · 쉬기', async () => { assert.strictEqual((await fired()).length, 1); assert.strictEqual(await page.evaluate(() => _arwDown()), true); });

  console.log('[설정 카드]');
  await setup(false);
  await t('카드: 꺼짐 문구 · 켜면 gdm_arw=1 · 끄면 0', async () => {
    assert.ok(/꺼짐/.test(await page.evaluate(() => document.getElementById('arwSetStat').textContent)));
    await page.evaluate(() => _arwSetUse(true)); assert.strictEqual(await page.evaluate(() => localStorage.getItem('gdm_arw')), '1');
    assert.ok(/켜짐/.test(await page.evaluate(() => document.getElementById('arwSetStat').textContent)));
    await page.evaluate(() => _arwSetUse(false)); assert.strictEqual(await page.evaluate(() => localStorage.getItem('gdm_arw')), '0');
  });
  await t('엔진 설정 화면의 arw 항목 문구가 카드와 같다', async () => {
    const SE = require('../engine/settings'); const row = SE.SETTINGS_FEATS.find(x => x.k === 'arw'); assert.ok(row);
    assert.strictEqual(await page.evaluate(() => document.querySelector('#arwSetCard p').textContent), row.desc);
  });
  await t('스크립트 오류 없음', async () => assert.deepStrictEqual(errs, []));

  await b.close();
  console.log('arrive_arw: ' + pass + ' pass ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
