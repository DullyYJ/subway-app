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

  const OV = { active: true, line1: '동막 ▸ 동춘', line2: '남은시간: 00시간 14분 · 18:19도착', cur: 1, moving: true, alert: 2, banner: '선학까지 2정거장 남았어요', destName: '선학',
    cells: [
      { n: '캠퍼스타운', t: '18:05', g: '인천1호선', gp: true, gc: '#7ca8d5', lc: '', rc: '#7ca8d5', dc: '#7ca8d5', dk: 2 },
      { n: '동막', t: '18:08', g: '', lc: '#7ca8d5', rc: '#7ca8d5', dc: '#7ca8d5', dk: 1 },
      { n: '도보', t: '', g: '', lc: '#8e8e93', rc: '#8e8e93', dc: '#8e8e93', dk: 3 },
      { n: '동춘', t: '18:12', g: '', lc: '#7ca8d5', rc: '#7ca8d5', dc: '#7ca8d5', dk: 1 },
      { n: '선학', t: '18:19', g: '', lc: '#7ca8d5', rc: '', dc: '#7ca8d5', dk: 2 } ] };
  const a = await open({ active: true, view: { text: '다음 동춘 18:12 · 선학까지 3정거장', line1: '동막 ▸ 동춘', line2: '남은시간: 00시간 14분 · 18:19도착', curIdx: 3, at: 1 }, overlay: OV });
  await t('엔진이 만든 overlay 가 있으면 전체 화면으로 그린다 — 칸·현재 칸·이동 중·남은시간·하차 임박 문구가 엔진 값 그대로', async () => {
    const d = await a.page.evaluate(() => { const e = document.getElementById('sbScreen'); if (!e) return null; return { l1: e.querySelector('#sbScL1').textContent, l2: e.querySelector('#sbScL2').textContent, bn: e.querySelector('#sbScBanner').textContent, dest: e.querySelector('#sbScDest').textContent, rows: e.querySelectorAll('#sbScList > div').length, cur: e.querySelectorAll('[data-cur="1"]').length, text: e.querySelector('#sbScList').textContent }; });
    assert.ok(d, '전체 화면이 없다');
    assert.strictEqual(d.l1, '동막 ▸ 동춘'); assert.ok(/18:19도착/.test(d.l2)); assert.strictEqual(d.bn, '선학까지 2정거장 남았어요'); assert.strictEqual(d.dest, '선학행');
    assert.strictEqual(d.rows, 5); assert.strictEqual(d.cur, 1); assert.ok(/이동 중/.test(d.text) && /인천1호선/.test(d.text) && /18:12/.test(d.text), d.text);
    assert.ok(await a.page.evaluate(() => !document.getElementById('sbCard')), '전체 화면이 있으면 작은 카드는 없다');
  });
  await t('5초마다 다시 묻고 엔진 값이 바뀌면 현재 칸이 따라간다', async () => {
    await a.page.evaluate((ov) => { window.__sc.status = { active: true, overlay: Object.assign({}, ov, { cur: 3, moving: false, banner: '다음 정거장 선학 — 내릴 준비하세요', alert: 1 }) }; }, OV);
    await a.page.clock.runFor(5200);
    const d = await a.page.evaluate(() => { const e = document.getElementById('sbScreen'); const cur = e.querySelector('[data-cur="1"]'); return { bn: e.querySelector('#sbScBanner').textContent, cur: cur ? cur.textContent : '' }; });
    assert.ok(/내릴 준비/.test(d.bn) && /동춘/.test(d.cur) && /현재/.test(d.cur), JSON.stringify(d));
    assert.ok(await a.page.evaluate(() => window.__sc.asks) >= 2);
  });
  await t('[홈 보기]로 닫으면 작은 카드가 남고, 카드를 누르면 전체 화면으로 돌아온다', async () => {
    await a.page.evaluate(() => document.getElementById('sbScHome').click());
    assert.ok(await a.page.evaluate(() => !document.getElementById('sbScreen')));
    await a.page.clock.runFor(5200);
    assert.ok(await a.page.evaluate(() => !!document.getElementById('sbCard') && !document.getElementById('sbScreen')));
    await a.page.evaluate(() => document.getElementById('sbCardBody').click()); await a.page.clock.runFor(500);
    assert.ok(await a.page.evaluate(() => !!document.getElementById('sbScreen')));
  });
  await t('전체 화면의 [안내 종료]를 누르면 네이티브에 끝내라고 알리고 화면이 사라진다', async () => {
    await a.page.evaluate(() => document.getElementById('sbScEnd').click());
    assert.strictEqual(await a.page.evaluate(() => window.__sc.ends), 1);
    assert.ok(await a.page.evaluate(() => !document.getElementById('sbScreen') && !document.getElementById('sbCard')));
    const n = await a.page.evaluate(() => window.__sc.asks); await a.page.clock.runFor(12000);
    assert.strictEqual(await a.page.evaluate(() => window.__sc.asks), n, '끝난 뒤에는 더 묻지 않는다');
  });
  await t('페이지 오류 없음', async () => assert.deepStrictEqual([...new Set(a.errs)], []));
  await a.ctx.close();

  const d2 = await open({ active: true, view: { text: '다음 원인재 18:15', line2: '' } });
  await t('overlay 가 아직 없으면(엔진 첫 답 전) 작은 카드로 view 문구를 보이고 [안내 종료]가 된다', async () => {
    assert.ok(await d2.page.evaluate(() => /다음 원인재/.test(document.getElementById('sbCardTx').textContent)));
    await d2.page.evaluate(() => document.getElementById('sbCardEnd').click());
    assert.strictEqual(await d2.page.evaluate(() => window.__sc.ends), 1);
  });
  await d2.ctx.close();

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
