// 기지국 표 공유(서버 /cells) — 통신사별 내려받기와 저장 상한 시험. 헤드리스 Chromium.
// (사용자가 늘어 SKT·LG U+ 셀이 서버에 쌓여도 내 통신사 것만 받아 쓰고, 저장 상한에서 많이 확인된 셀을 지키는지)
// 실행: node test/cell_sync.ui.test.js [html 경로]   (Playwright: /opt/node-tools/node_modules/playwright)
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
  const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page); global.etaWait = () => __em.etaWait(page);
  await page.goto('file://' + html);
  await page.waitForTimeout(2500);

  // 서버가 세 통신사 셀을 모두 돌려주는 상황(옛 서버처럼 필터를 모름)
  const SERVER = {
    '450-8-1070-1': { s: '부평', l: '인천1호선', n: 30 }, '450-8-1070-2': { s: '동수', l: '인천1호선', n: 27 },
    '450-5-2001-1': { s: '부평', l: '인천1호선', n: 12 }, '450-5-2001-2': { s: '동수', l: '인천1호선', n: 9 },
    '450-6-3001-1': { s: '부평', l: '인천1호선', n: 5 }
  };
  const setup = async (plmn) => page.evaluate(([plmn, SERVER]) => {
    window.__urls = [];
    window.fetch = function (u) { window.__urls.push(String(u)); return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, cells: SERVER }) }); };
    _cellMapMem = {}; try { localStorage.removeItem('cellStnMap'); localStorage.removeItem('cellSyncAt'); localStorage.removeItem('cellPlmn'); } catch (e) {}
    window._cellPlmn = null; if (plmn) { window._cellPlmn = plmn; localStorage.setItem('cellPlmn', plmn); }
  }, [plmn, SERVER]);
  const pull = () => page.evaluate(async () => { _cellPull(true); await new Promise(r => setTimeout(r, 300)); return { urls: window.__urls.slice(), keys: Object.keys(_cellMap()).sort() }; });

  console.log('[내려받기]');
  await setup('450-5');
  const a = await pull();
  await t('내 통신사(SKT 450-5)를 알면 요청에 plmn 이 붙는다', async () => { assert.ok(a.urls[0].indexOf('plmn=450-5') >= 0, a.urls[0]); });
  await t('서버가 걸러 주지 않아도 내 통신사 셀만 담는다', async () => { assert.deepStrictEqual(a.keys, ['450-5-2001-1', '450-5-2001-2']); });
  await setup(null);
  const c = await pull();
  await t('통신사를 아직 모르면(첫 실행) 필터 없이 받는다(기존 동작)', async () => { assert.ok(c.urls[0].indexOf('plmn') < 0, c.urls[0]); assert.strictEqual(c.keys.length, 5); });

  console.log('[통신사 감지]');
  await setup(null);
  const d = await page.evaluate(async () => {
    _cellSeen = null; window._cellRecent = {};
    _cellNoteObservation('450-6-3001-77');
    await new Promise(r => setTimeout(r, 2200));
    return { plmn: window._cellPlmn, stored: localStorage.getItem('cellPlmn'), urls: window.__urls.slice() };
  });
  await t('관측한 셀에서 통신사를 기억한다', async () => { assert.strictEqual(d.plmn, '450-6'); assert.strictEqual(d.stored, '450-6'); });
  await t('통신사가 새로 정해지면 그 통신사 표를 바로 받는다', async () => { assert.ok(d.urls.some(u => u.indexOf('plmn=450-6') >= 0), JSON.stringify(d.urls)); });

  console.log('[저장 상한]');
  const e = await page.evaluate(() => {
    _cellMapMem = {};
    for (let i = 0; i < 3100; i++) _cellMapMem['450-8-1-' + i] = { s: 'X' + i, l: '', n: i < 100 ? 40 : 2, t: 1000 + i };   // 앞 100개는 많이 확인된 셀(가장 오래됨)
    _cellMapSave();
    const left = Object.keys(_cellMapMem);
    return { n: left.length, keptHigh: left.filter(k => _cellMapMem[k].n === 40).length };
  });
  await t('상한(3000)을 넘기면 3000개만 남는다', async () => { assert.strictEqual(e.n, 3000); });
  await t('가장 오래됐더라도 많이 확인된 셀(n=40)은 지킨다', async () => { assert.strictEqual(e.keptHigh, 100); });
  await t('JS 오류가 없다', async () => { assert.strictEqual(errs.length, 0, errs[0]); });

  console.log(`\n${pass} 통과 / ${fail} 실패`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
