// 대기 모드 재개 카드 — 2026-10-13 (YJ: "카카오 방식 — 앱을 밀어 닫아도 안내가 이어진다")
//   앱을 밀어 닫아도 네이티브가 안내를 이어 왔다. 다시 열면(웹은 새로 떠서 여정을 모른다) 네이티브에 상태를 물어 카드로 보여 주고 [안내 종료]를 준다.
//   문구는 엔진이 만든 view 를 그대로 그린다. 돌고 있지 않으면 카드가 없다.
// 실행: node test/standby_card.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function open(status) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    await page.addInitScript((st) => {
      window.__sc = { ends: 0, asks: 0, status: st };
      window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
      window.Capacitor.Plugins.Overlay = {
        standbyStatus: () => { window.__sc.asks++; return Promise.resolve(window.__sc.status); },
        standbyEnd: () => { window.__sc.ends++; window.__sc.status = { active: false }; return Promise.resolve({ ok: true }); },
        keepAlive: () => Promise.resolve({ ok: true }), update: () => Promise.resolve({ ok: true })
      };
    }, status);
    const em = require('./helpers/eta_mock'); await em.installEtaMock(page); em.autoWait(page);
    await page.clock.install({ time: new Date('2026-10-13T18:05:00+09:00') });
    await page.goto('file://' + html); await page.addStyleTag({ content: '#locDiscOv{display:none !important}' });
    await page.clock.runFor(3000);
    return { ctx, page, errs };
  }

  const a = await open({ active: true, view: { text: '다음 동춘 18:12 · 선학까지 3정거장', line1: '동막 ▸ 동춘', line2: '남은시간: 00시간 14분 · 18:19도착', curIdx: 3, at: 1 } });
  await t('대기 모드가 돌고 있으면 카드가 뜨고 엔진이 만든 문구가 그대로 나온다', async () => {
    const tx = await a.page.evaluate(() => { const e = document.getElementById('sbCardTx'); return e ? e.textContent : null; });
    assert.ok(tx && /다음 동춘 18:12/.test(tx) && /00시간 14분 · 18:19도착/.test(tx), String(tx));
    assert.ok(await a.page.evaluate(() => !!document.getElementById('sbCardEnd')));
  });
  await t('5초마다 다시 묻고 문구가 바뀌면 따라간다', async () => {
    await a.page.evaluate(() => { window.__sc.status = { active: true, view: { text: '다음 원인재 18:15', line2: '' } }; });
    await a.page.clock.runFor(5200);
    assert.ok(await a.page.evaluate(() => /다음 원인재/.test(document.getElementById('sbCardTx').textContent)));
    assert.ok(await a.page.evaluate(() => window.__sc.asks) >= 2);
  });
  await t('[안내 종료]를 누르면 네이티브에 끝내라고 알리고 카드가 사라진다', async () => {
    await a.page.evaluate(() => document.getElementById('sbCardEnd').click());
    assert.strictEqual(await a.page.evaluate(() => window.__sc.ends), 1);
    assert.ok(await a.page.evaluate(() => !document.getElementById('sbCard')));
    const n = await a.page.evaluate(() => window.__sc.asks); await a.page.clock.runFor(12000);
    assert.strictEqual(await a.page.evaluate(() => window.__sc.asks), n, '끝난 뒤에는 더 묻지 않는다');
  });
  await t('페이지 오류 없음', async () => assert.deepStrictEqual([...new Set(a.errs)], []));
  await a.ctx.close();

  const c = await open({ active: false });
  await t('대기 모드가 아니면 카드가 없고, 더 묻지 않는다', async () => {
    assert.ok(await c.page.evaluate(() => !document.getElementById('sbCard')));
    const n = await c.page.evaluate(() => window.__sc.asks); await c.page.clock.runFor(15000);
    assert.strictEqual(await c.page.evaluate(() => window.__sc.asks), n);
  });
  await t('페이지 오류 없음(비대기)', async () => assert.deepStrictEqual([...new Set(c.errs)], []));
  await b.close();
  console.log('\nstandby_card: ' + pass + ' pass ' + fail + ' fail'); process.exit(fail ? 1 : 0);
})();
