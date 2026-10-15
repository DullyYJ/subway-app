// 캐릭터 시계 위젯 ↔ 앱 연결 시험 — 2026-10-15
//   앱이 하는 일은 둘뿐: ① 출퇴근 설정을 위젯(네이티브 플러그인)에 넘기기 ② 위젯 [출근하기]/[퇴근하기]로 열렸을 때 길찾기 시작.
//   · 설정 전달(시각·요일·장소 좌표), 같은 값이면 다시 안 보냄, 바뀌면 보냄, 장소 없는 쪽은 꺼짐
//   · 위젯 버튼으로 열림(시작 시·열려 있는 중 이벤트) → 홈 탭 + 출발/도착 세팅 + 길찾기 실행, 한 번만
//   · 장소 미설정이면 안내만(길찾기 안 함)  · 위젯 추가 버튼 4종이 requestPin 에 종류를 넘김  · 플러그인 없는 웹에서는 조용함
// 실행: node test/widget_app.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 600)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // opt: { alarm(저장된 commuteAlarm), plugin(true/false), launch('morn'|'eve'|null) }
  async function fresh(opt) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return (u.protocol === 'file:' || u.protocol === 'data:') ? r.continue() : r.abort(); });
    await page.addInitScript(o => {
      try { if (o.alarm) localStorage.setItem('commuteAlarm', JSON.stringify(o.alarm)); } catch (e) {}
      window.__calls = { setConfig: [], pin: [], take: 0 };
      window.__launch = o.launch || null;
      if (o.plugin) {
        window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
        window.Capacitor.Plugins.GdmWidget = {
          setConfig: a => { window.__calls.setConfig.push(JSON.parse(a.json)); return Promise.resolve(); },
          takeLaunch: () => { window.__calls.take++; const g = window.__launch; window.__launch = null; return Promise.resolve({ go: g }); },
          requestPin: a => { window.__calls.pin.push(a.type); return Promise.resolve({ ok: true }); },
          state: () => Promise.resolve({ count: 1, scene: '', say: '', fetched: false })
        };
      }
    }, opt);
    await page.goto('file://' + html);
    await page.waitForTimeout(opt.wait || 3200);
    return { ctx, page, errs };
  }
  const ALARM = { on: false, morn: '07:40', eve: '18:20', from: '서울역', to: '강남역', days: [1, 2, 3, 4, 5], fromLat: 37.5547, fromLng: 126.9726, toLat: 37.4979, toLng: 127.0276 };

  await t('시작하면 출퇴근 설정(시각·요일·출발 좌표·켜짐)을 위젯에 한 번 넘긴다', async () => {
    const { ctx, page, errs } = await fresh({ plugin: true, alarm: ALARM });
    const c = await page.evaluate(() => window.__calls.setConfig);
    assert(c.length >= 1, '설정 전달 없음');
    const x = c[c.length - 1];
    assert(x.on === true && x.mOn === true && x.eOn === true, JSON.stringify(x));
    assert(x.morn === '07:40' && x.eve === '18:20' && JSON.stringify(x.days) === '[1,2,3,4,5]', JSON.stringify(x));
    assert(Math.abs(x.mLat - 37.5547) < 0.01 && Math.abs(x.eLat - 37.4979) < 0.05, '좌표: ' + JSON.stringify(x));   // 퇴근 출발 = 출근 도착(강남)
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('같은 값이면 다시 보내지 않고, 시각을 바꾸면 새로 보낸다', async () => {
    const { ctx, page } = await fresh({ plugin: true, alarm: ALARM });
    const n0 = await page.evaluate(() => window.__calls.setConfig.length);
    await page.evaluate(() => { _cmPersist(); });
    await page.waitForTimeout(700);
    assert.strictEqual(await page.evaluate(() => window.__calls.setConfig.length), n0, '같은 값인데 또 보냄');
    await page.evaluate(() => { _cmAlarm.morn = '08:05'; _cmPersist(); });
    await page.waitForTimeout(700);
    const c = await page.evaluate(() => window.__calls.setConfig);
    assert(c.length === n0 + 1 && c[c.length - 1].morn === '08:05', JSON.stringify(c.slice(-2))); await ctx.close();
  });
  await t('장소가 없으면 꺼짐(on=false, mOn=false, eOn=false)', async () => {
    const { ctx, page } = await fresh({ plugin: true, alarm: { on: true, morn: '07:30', eve: '18:30' } });
    const x = await page.evaluate(() => window.__calls.setConfig.slice(-1)[0]);
    assert(x && x.on === false && x.mOn === false && x.eOn === false, JSON.stringify(x)); await ctx.close();
  });
  await t('위젯 [출근하기]로 열리면 홈 탭에서 출발/도착을 세팅하고 길찾기를 실행한다(한 번만)', async () => {
    const { ctx, page, errs } = await fresh({ plugin: true, alarm: ALARM, launch: 'morn', wait: 600 });
    await page.evaluate(() => { window.__routed = []; window.fmapDoRoute = function () { window.__routed.push({ s: _fmapStart && _fmapStart.name, d: _fmapDest && _fmapDest.name }); }; });
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => window.__routed);
    assert(r.length === 1 && /^서울/.test(r[0].s) && /^강남/.test(r[0].d), JSON.stringify(r));
    assert((await page.evaluate(() => window.__calls.take)) >= 1, '시작 때 takeLaunch 를 안 부름');
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('[퇴근하기]는 반대 방향(강남→서울)으로 길찾기, 열려 있는 중 이벤트로도 동작', async () => {
    const { ctx, page } = await fresh({ plugin: true, alarm: ALARM });
    await page.evaluate(() => { window.__routed = []; window.fmapDoRoute = function () { window.__routed.push({ s: _fmapStart && _fmapStart.name, d: _fmapDest && _fmapDest.name }); }; window.__launch = 'eve'; window.dispatchEvent(new Event('gdmWidgetGo')); });
    await page.waitForTimeout(2200);
    const r = await page.evaluate(() => window.__routed);
    assert(r.length === 1 && /^강남/.test(r[0].s) && /^서울/.test(r[0].d), JSON.stringify(r));
    await page.evaluate(() => { window.dispatchEvent(new Event('gdmWidgetGo')); });      // 이미 가져갔으니 다시 열리지 않는다
    await page.waitForTimeout(1500);
    assert.strictEqual((await page.evaluate(() => window.__routed)).length, 1, '두 번 실행됨'); await ctx.close();
  });
  await t('장소 미설정이면 길찾기 대신 안내만 나온다', async () => {
    const { ctx, page } = await fresh({ plugin: true, alarm: { on: true, morn: '07:30', eve: '18:30' }, wait: 600 });
    await page.evaluate(() => { window.__routed = []; window.fmapDoRoute = function () { window.__routed.push(1); }; });
    await page.evaluate(() => { window.__launch = 'morn'; window.dispatchEvent(new Event('gdmWidgetGo')); });
    await page.waitForTimeout(5200);
    assert.strictEqual((await page.evaluate(() => window.__routed)).length, 0);
    const msg = await page.evaluate(() => { const e = document.getElementById('pickPop'); return e ? e.textContent : ''; });
    assert(/장소를 먼저 설정/.test(msg), '안내 없음: ' + msg); await ctx.close();
  });
  await t('위젯 추가 버튼 4종이 종류를 넘기고 안내를 띄운다', async () => {
    const { ctx, page } = await fresh({ plugin: true, alarm: ALARM });
    assert.strictEqual(await page.locator('#gwCard button').count(), 4);
    await page.evaluate(() => { document.querySelectorAll('#gwCard button').forEach(b => b.click()); });
    await page.waitForTimeout(300);
    assert.strictEqual(JSON.stringify(await page.evaluate(() => window.__calls.pin)), JSON.stringify(['hb', 'hw', 'vb', 'vw']));
    await ctx.close();
  });
  await t('플러그인이 없는 웹에서는 아무 일도 없고 추가 버튼은 안내만 한다', async () => {
    const { ctx, page, errs } = await fresh({ plugin: false, alarm: ALARM });
    await page.evaluate(() => _gwAdd('hb'));
    await page.waitForTimeout(300);
    const msg = await page.evaluate(() => { const e = document.getElementById('pickPop'); return e ? e.textContent : ''; });
    assert(/앱\(APK\)에서만/.test(msg), msg);
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await b.close();
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
