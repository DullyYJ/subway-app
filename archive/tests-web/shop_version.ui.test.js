// 쇼핑 상품 서버 버전 확인 시험 — 쇼핑 화면을 열면 /version 만 불러 비교하고, 달라졌을 때만 /shop 을 받아 바로 그린다.
// 실행: node test/shop_version.ui.test.js [html 경로]   (Playwright: /opt/node-tools/node_modules/playwright)
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).slice(0, 300)); } };
const mkData = (nm) => {
  const it = (n, k) => ({ n, u: 'https://link.coupang.com/a/' + k, i: 'https://thumbnail.coupangcdn.com/thumbnails/remote/492x492ex/image/x/' + k + '.jpg' });
  const slot = (items) => ({ h1: 9, h2: 11, time: '09:00~11:00', label: '오전', items });
  const items = [it(nm, 'AAA')];
  return { CATS: [{ c: '생활', items }], WEEKDAY: [slot(items)], WEEKEND: [slot(items)] };
};
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const hits = { version: 0, shop: 0 };
  let serverVer = 'v1', serverName = '구상품';
  await page.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.protocol === 'file:') return r.continue();
    if (u.hostname === 'gildongmu-shop.phg0643.workers.dev') {
      if (u.pathname === '/version') { hits.version++; return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, version: serverVer }) }); }
      if (u.pathname === '/shop') { hits.shop++; return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, version: serverVer, data: mkData(serverName) }) }); }
    }
    return r.abort();
  });
  await page.clock.install({ time: new Date('2026-10-05T10:00:00+09:00') });
  await page.goto('file://' + html);
  await page.clock.runFor(4000);

  console.log('[시작 직후]');
  await t('첫 실행: 저장본이 없으면 서버 상품(v1)을 받는다', async () => {
    const v = await page.evaluate(() => (JSON.parse(localStorage.getItem('shopDataCache') || 'null') || {}).version);
    assert.strictEqual(v, 'v1');
  });

  console.log('[서버 상품이 바뀌었을 때]');
  serverVer = 'v2'; serverName = '신상품';
  const h0 = { ...hits };
  await page.clock.runFor(60 * 1000);            // 2분 간격 이내: 요청 없음
  await page.evaluate(() => renderShop());
  await t('2분 안에는 다시 확인하지 않는다(요청 폭주 방지)', async () => {
    await page.clock.runFor(500);
    assert.strictEqual(hits.version, h0.version);
  });
  await page.clock.runFor(2 * 60 * 1000);
  await page.evaluate(() => { _shopActiveCat = '생활'; try { switchTab && 0; } catch (e) {} });
  await page.evaluate(() => renderShop());
  await page.clock.runFor(1500);
  await t('쇼핑 화면을 열면 /version 이 불리고, 달라졌으니 /shop 을 받는다', async () => {
    assert.ok(hits.version > h0.version, 'version 호출 없음');
    assert.ok(hits.shop > h0.shop, 'shop 호출 없음');
    const v = await page.evaluate(() => JSON.parse(localStorage.getItem('shopDataCache')).version);
    assert.strictEqual(v, 'v2');
  });
  await t('받은 즉시 화면에 신상품이 그려진다(예외 없이)', async () => {
    const txt = await page.evaluate(() => (document.getElementById('shopGrid') || {}).innerText || '');
    assert.ok(/신상품/.test(txt), '그리드에 신상품 없음: ' + txt.slice(0, 80));
  });

  console.log('[버전이 같을 때]');
  const h1 = { ...hits };
  await page.clock.runFor(3 * 60 * 1000);
  await page.evaluate(() => renderShop());
  await page.clock.runFor(1500);
  await t('버전이 같으면 가벼운 /version 만 부르고 /shop 은 받지 않는다', async () => {
    assert.ok(hits.version > h1.version);
    assert.strictEqual(hits.shop, h1.shop);
  });

  console.log('[서버가 죽었을 때]');
  await page.unroute('**/*');
  await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
  await page.clock.runFor(3 * 60 * 1000);
  await page.evaluate(() => renderShop());
  await page.clock.runFor(5000);
  await t('서버 요청이 실패해도 저장본 그대로 화면이 유지되고 오류가 없다', async () => {
    const txt = await page.evaluate(() => (document.getElementById('shopGrid') || {}).innerText || '');
    assert.ok(/신상품/.test(txt));
    assert.deepStrictEqual(errs.filter(e => /shop|Shop|undefined/.test(e)), []);
  });
  console.log(`\n${pass} 통과, ${fail} 실패`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
