// 경로 정리를 엔진이 하기(gdm_e2 · &rv=1) — 진짜 경로 탐색 흐름(fmapDoRoute → _handleRouteResults) 끝까지 시험 — 2026-10-19 (s66)
//   가짜 경로 서버가 요청에 rv=1 이 있으면 진짜 엔진 모듈(engine/route-view.js)로 정리한 result.rv 를 싣는다.
//   · 꺼짐: 요청에 rv=1 이 없고 · 예전 방식 결과 / 켜짐: rv=1 이 붙고 · 결과(탭 대표 경로 · why · 나누기 줄)가 꺼짐과 같다
//   · 폴백: 엔진이 rv 를 안 주면(옛 엔진) 켜짐이어도 예전 방식으로 같은 결과
// 실행: node test/route_view_e2e.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const { resp } = require('./helpers/engine_fixture');
const RV = require('../engine/route-view');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 1200)); } };
let HITS = [], GIVE_RV = true;
async function newApp(b, e2) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5547, longitude: 126.9726 }, permissions: ['geolocation'] });
  await ctx.addInitScript((e2) => { try { localStorage.setItem('gdm_loc_disclosed', '1'); localStorage.setItem('bgPermGuided', '1'); localStorage.setItem('gdm_e2', e2 ? '1' : '0'); } catch (x) {} window.Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web', Plugins: {} }; }, e2);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => {
    const u = new URL(r.request().url()); if (u.protocol === 'file:' || u.protocol === 'data:') return r.continue();
    const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (/route-v2/.test(u.host) && u.pathname === '/route-v2-app') {
      const rv = u.searchParams.get('rv') === '1'; HITS.push({ rv, live0: u.searchParams.get('live') === '0' });
      const r0 = resp(); if (rv && GIVE_RV) RV.rvAnnotate(r0);
      return r.fulfill({ status: 200, headers: H, body: JSON.stringify(r0) });
    }
    return r.fulfill({ status: 200, headers: H, body: '{}' });
  });
  await page.clock.install({ time: new Date('2026-10-08T21:00:00+09:00') });
  await page.goto('file://' + html); await page.clock.runFor(3500);
  return { ctx, page, errs };
}
async function search(page) {
  await page.click('#fmapDestInp'); await page.fill('#fmapDestInp', '수원'); await page.clock.runFor(800);
  await page.click('#fmapDestSug > *:first-child'); await page.clock.runFor(500); await page.waitForTimeout(200);
  if (!HITS.length) await page.click('#fmapRouteBtn');
}
async function until(page, fn, tries) { for (let i = 0; i < (tries || 60); i++) { if (await page.evaluate(fn)) return true; await page.clock.runFor(250); await page.waitForTimeout(25); } return false; }
const snap = (page) => page.evaluate(() => {
  var R = _allRouteResults, out = { tabs: {}, why: {}, split: {} };
  ['fast', 'less', 'sub', 'bus'].forEach(function (k) {
    var p = R && R[k]; if (!p) { out.tabs[k] = null; return; }
    out.tabs[k] = [p.info.tab, (p.info._tabs || []).slice(), p.info.totalTime];
    var route = _convertSinglePathToRoute(p);
    out.why[k] = route.why;
    var el = document.getElementById('transitSplitRow'); if (!el) { el = document.createElement('div'); el.id = 'transitSplitRow'; document.body.appendChild(el); }
    window._htlTlTotalMin = null; _renderSplitRow(route); out.split[k] = el.innerHTML;
  });
  return out;
});
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const run = async (e2, give) => { HITS = []; GIVE_RV = give; const x = await newApp(b, e2); await search(x.page); const ok = await until(x.page, () => !!(typeof _allRouteResults !== 'undefined' && _allRouteResults && _allRouteResults.fast)); const s = ok ? await snap(x.page) : null; const used = await x.page.evaluate(() => !!(_allRouteResults && _allRouteResults.fast && _allRouteResults.fast.info._rvWhy !== undefined)); const errs = x.errs.slice(); await x.ctx.close(); return { ok, s, used, hits: HITS.slice(), errs }; };
  const OFF = await run(false, true);
  await t('꺼짐: 경로가 그려지고 요청에 rv=1 이 없다 · 엔진 값은 쓰지 않는다', async () => { assert.ok(OFF.ok && OFF.s.tabs.fast); assert.ok(OFF.hits.length >= 1 && OFF.hits.every(h => !h.rv), JSON.stringify(OFF.hits)); assert.strictEqual(OFF.used, false); assert.ok(/전체 \d+분 · 승차/.test(OFF.s.split.fast), OFF.s.split.fast); });
  const ON = await run(true, true);
  await t('켜짐: 요청에 rv=1 · 엔진이 정리한 값을 쓴다 · 결과가 꺼짐과 같다', async () => {
    assert.ok(ON.ok); assert.ok(ON.hits.length >= 1 && ON.hits.every(h => h.rv), JSON.stringify(ON.hits)); assert.strictEqual(ON.used, true);
    assert.deepStrictEqual(ON.s, OFF.s);
  });
  const FB = await run(true, false);
  await t('켜짐인데 엔진이 rv 를 안 주면(옛 엔진) 예전 방식으로 같은 결과', async () => { assert.ok(FB.ok); assert.strictEqual(FB.used, false); assert.deepStrictEqual(FB.s, OFF.s); });
  await t('JS 오류 없음', async () => { assert.deepStrictEqual([...new Set(OFF.errs.concat(ON.errs, FB.errs))], []); });
  await b.close();
  console.log('route_view_e2e.ui: ' + pass + ' pass ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
