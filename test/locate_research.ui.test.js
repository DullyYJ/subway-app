// 위치 감지 다시 누르기 → 내 위치 갱신 + 같은 도착지로 자동 재탐색 — 2026-10-19
//   YJ: "경로탐색 후 다시 위치확인버튼 누르면 내 위치를 다시 갱신하고 경로탐색을 자동으로 해줘"
//   · 결과 카드가 떠 있을 때만(안내 확정 중이거나 결과가 없으면 하지 않는다) · 도착지가 있을 때만 · 끄기 스위치 window._locReSearchOff
// 실행: node test/locate_research.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 500)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh() {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9, accuracy: 10 }, permissions: ['geolocation'] });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript(() => { try { localStorage.setItem('locDisc', '1'); } catch (e) {} });
    await page.goto('file://' + html); await page.waitForTimeout(2200);
    await page.evaluate(() => {
      const ov = document.getElementById('locDiscOv'); if (ov) ov.remove();
      window.__routes = 0; window.fmapDoRoute = function () { window.__routes++; };
      window.toast = function () {};
      window._sampleBestGPS = function (ok) { setTimeout(function () { ok(37.5, 126.9, 10); }, 10); };   // 헤드리스는 위치 이벤트가 없다 — 표본 수집은 가짜
    });
    return { ctx, page, errs };
  }
  const press = async (a, setup) => {
    await a.page.evaluate(setup || (() => {}));
    await a.page.evaluate(() => { window.__routes = 0; _fmapStart = null; triggerGPS(); });
    try { await a.page.waitForFunction(() => _fmapStart && _fmapStart.type === 'gps', null, { timeout: 15000 }); } catch (e) {}
    await a.page.waitForTimeout(400);
    return a.page.evaluate(() => ({ routes: window.__routes, start: _fmapStart && _fmapStart.name, lat: _fmapStart && _fmapStart.lat }));
  };
  const withResult = () => { let c = document.getElementById('transitResultCard'); if (!c) { c = document.createElement('div'); c.id = 'transitResultCard'; document.body.appendChild(c); } c.style.display = 'flex'; window._routeLocked = false; document.getElementById('fmapDestInp').value = '강남역'; };

  console.log('[위치 감지 다시 누르기 → 자동 재탐색]');
  let a = await fresh();
  await t('결과 카드가 떠 있으면: 내 위치로 갱신하고 같은 도착지로 자동 재탐색한다', async () => {
    const q = await press(a, withResult);
    assert.strictEqual(q.start, '내 위치'); assert.ok(Math.abs(q.lat - 37.5) < 0.01, JSON.stringify(q)); assert.strictEqual(q.routes, 1, JSON.stringify(q));
  });
  await a.ctx.close();
  a = await fresh();
  await t('결과가 없으면(처음 누르기) 재탐색하지 않는다', async () => {
    const q = await press(a, () => { const c = document.getElementById('transitResultCard'); if (c) c.style.display = 'none'; document.getElementById('fmapDestInp').value = '강남역'; });
    assert.strictEqual(q.start, '내 위치'); assert.strictEqual(q.routes, 0, JSON.stringify(q));
  });
  await t('안내를 시작해 확정한 상태(_routeLocked)에서는 재탐색하지 않는다', async () => {
    const q = await press(a, () => { withResultFn(); window._routeLocked = true; function withResultFn() { let c = document.getElementById('transitResultCard'); if (!c) { c = document.createElement('div'); c.id = 'transitResultCard'; document.body.appendChild(c); } c.style.display = 'flex'; document.getElementById('fmapDestInp').value = '강남역'; } });
    assert.strictEqual(q.routes, 0, JSON.stringify(q));
  });
  await t('도착지가 비어 있으면 재탐색하지 않는다', async () => {
    const q = await press(a, () => { let c = document.getElementById('transitResultCard'); if (!c) { c = document.createElement('div'); c.id = 'transitResultCard'; document.body.appendChild(c); } c.style.display = 'flex'; window._routeLocked = false; document.getElementById('fmapDestInp').value = ''; window._fmapDest = null; try { _fmapDest = null; } catch (e) {} });
    assert.strictEqual(q.routes, 0, JSON.stringify(q));
  });
  await t('끄기 스위치(_locReSearchOff)가 켜져 있으면 하지 않는다', async () => {
    const q = await press(a, () => { let c = document.getElementById('transitResultCard'); c.style.display = 'flex'; window._routeLocked = false; document.getElementById('fmapDestInp').value = '강남역'; window._locReSearchOff = true; });
    assert.strictEqual(q.routes, 0, JSON.stringify(q));
  });
  await t('페이지 오류 없음', async () => assert.deepStrictEqual([...new Set(a.errs)], []));
  await a.ctx.close();
  await b.close();
  console.log(`\n${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
})();
