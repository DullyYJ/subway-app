// 설정 > 🧪 오버레이 테스트(출시 전 삭제 예정) — 2026-10-16
// 가짜 여정을 오버레이에 보내 접힘·펼침·2정거장 무지개·1정거장·추천 줄·버튼 이름을 실기기로 확인하게 해 주는 버튼들이 제대로 동작하는지 본다.
// 실행: node test/overlay_test_buttons.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
  const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
  await page.clock.install({ time: new Date('2026-10-16T18:30:00+09:00') });
  await page.goto('file://' + html); await page.addStyleTag({ content: '#locDiscOv{display:none !important}' }); await page.clock.runFor(2500);
  await page.evaluate(() => {
    window.__ups = []; window.__ka = [];
    window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
    window.Capacitor.Plugins.Overlay = { update: (p) => { window.__ups.push(JSON.parse(JSON.stringify(p))); return Promise.resolve({ ok: true }); }, keepAlive: (o) => { window.__ka.push(o.on); return Promise.resolve({}); }, isAvailable: () => Promise.resolve({ granted: true, supported: true }) };
    window.toast = (m) => { window.__toast = m; };
  });
  const last = () => page.evaluate(() => window.__ups[window.__ups.length - 1]);

  console.log('[설정 카드]');
  await t('설정에 테스트 카드(전체 시나리오·평상시·추천·2정거장 전·1정거장 전·중지)가 있고 삭제 표시가 붙어 있다', async () => {
    const x = await page.evaluate(() => { const c = document.getElementById('ovlTestCard'); return c ? Array.from(c.querySelectorAll('button')).map(b => b.textContent.trim()) : null; });
    assert.deepStrictEqual(x, ['▶ 전체 시나리오 (75초)', '평상시', '추천', '2정거장 전', '1정거장 전', '⏱ 앱 자동종료 (15초 뒤 진짜 종료)', '■ 테스트 중지']);
    const src = require('fs').readFileSync(html, 'utf8');
    assert.ok(src.includes('TEST-BUTTONS:BEGIN') && src.includes('TEST-BUTTONS:END'));
  });
  await t('오버레이가 꺼져 있으면 시작하지 않고 안내한다', async () => {
    const x = await page.evaluate(() => { window._ovlUsable = () => false; _ovlTestStart('plain'); return [!!window._ovlTest, window.__toast]; });
    assert.strictEqual(x[0], false); assert.ok(/다른 앱 위에 표시/.test(x[1]), x[1]);
  });
  await page.evaluate(() => { window._ovlUsable = () => true; });

  console.log('[단계별 값]');
  await t('평상시: 경고 0 · 추천 없음 · 다섯 칸 · 현위치 박촌', async () => { await page.evaluate(() => _ovlTestStart('plain')); const u = await last(); assert.strictEqual(u.active, true); assert.strictEqual(u.alert, 0); assert.strictEqual(u.reco.on, false); assert.strictEqual(u.cells.length, 5); assert.strictEqual(u.cells[u.cur].n, '박촌'); });
  await t('2정거장 전: alert 2 · 현위치 굴현(아라까지 2역) · 진동 신호', async () => { await page.evaluate(() => _ovlTestStart('alert2')); const u = await last(); assert.strictEqual(u.alert, 2); assert.strictEqual(u.cells[u.cur].n, '굴현'); assert.ok(u.alertAt > 0 && u.alertVibe === true); });
  await t('1정거장 전: alert 1 · 현위치 계양', async () => { await page.evaluate(() => _ovlTestStart('alert1')); const u = await last(); assert.strictEqual(u.alert, 1); assert.strictEqual(u.cells[u.cur].n, '계양'); });
  await t('추천: 버튼은 맛집 보기 · 확인 둘뿐이다(주변버스 보기·종료는 없다)', async () => { await page.evaluate(() => _ovlTestStart('reco')); const u = await last(); assert.strictEqual(u.reco.on, true); assert.strictEqual(u.reco.go, '맛집 보기'); assert.strictEqual(u.reco.ok, '확인'); assert.ok(u.reco.bus === undefined && u.reco.end === undefined, JSON.stringify(u.reco)); });
  await t('추천의 [확인]을 누르면(웹이 받으면) 추천이 닫힌다', async () => {
    const x = await page.evaluate(() => { window._ovlAct('recoOk'); return window.__ups[window.__ups.length - 1].reco.on; });
    assert.strictEqual(x, false);
  });
  await t('1정거장 전: 내릴 준비 줄(getoff) — 제목 · 응원 문구 · [앱 종료] 하나, 추천 줄은 비운다', async () => {
    await page.evaluate(() => _ovlTestStart('alert1')); const u = await last();
    assert.strictEqual(u.getoff.on, true); assert.strictEqual(u.getoff.a, '내릴 준비를 해주세요'); assert.ok(u.getoff.b && u.getoff.b.length > 3); assert.strictEqual(u.getoff.end, '앱 종료'); assert.strictEqual(u.reco.on, false);
    await page.evaluate(() => _ovlTestStart('alert2')); const v = await last(); assert.strictEqual(v.getoff.on, false, '2정거장 전엔 내릴 준비 줄이 없다');
  });
  await t('앱 자동종료 예약: 15초 뒤 시각을 quit.at 으로 보낸다', async () => {
    await page.evaluate(() => _ovlTestStart('quit')); const ups = await page.evaluate(() => window.__ups.filter(u => u.quit)); const q = ups[ups.length - 1].quit;
    assert.ok(q && q.at > 0, JSON.stringify(ups.map(u => u.quit)));
  });
  await t('시험 중에는 앱이 가려져도 네이티브가 웹을 깨우도록 keepAlive 를 켠다', async () => { await page.evaluate(() => _ovlTestStart('plain')); const ka = await page.evaluate(() => window.__ka); assert.ok(ka.includes(true), JSON.stringify(ka)); });

  console.log('[전체 시나리오 75초]');
  await t('전체: 평상시 → 추천 → 2정거장 → 1정거장 → 평상시 순서로 단계가 바뀐다', async () => {
    await page.evaluate(() => { window.__ups.length = 0; _ovlTestStart('all'); });
    const seen = [];
    for (let s = 0; s < 70; s += 5) {
      await page.clock.runFor(5000); await page.evaluate(() => _ovlSync());
      const u = await last(); const tag = u.reco.on ? 'reco' : (u.alert === 2 ? 'a2' : (u.alert === 1 ? 'a1' : 'plain'));
      if (seen[seen.length - 1] !== tag) seen.push(tag);
    }
    assert.deepStrictEqual(seen, ['plain', 'reco', 'a2', 'a1', 'plain']);
  });
  await t('75초가 지나면 저절로 끝나 오버레이를 거둔다(active=false)', async () => {
    await page.clock.runFor(20000); await page.evaluate(() => _ovlSync());
    const x = await page.evaluate(() => [!!window._ovlTest, window.__ups[window.__ups.length - 1].active]);
    assert.deepStrictEqual(x, [false, false]);
  });
  await t('[중지]를 누르면 바로 거둔다', async () => {
    await page.evaluate(() => _ovlTestStart('alert1')); await page.evaluate(() => _ovlTestStop());
    const x = await page.evaluate(() => [!!window._ovlTest, window.__ups[window.__ups.length - 1].active]);
    assert.deepStrictEqual(x, [false, false]);
  });
  await t('JS 오류 없음', async () => assert.deepStrictEqual(errs, []));
  await b.close();
  console.log('\n' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
})();
