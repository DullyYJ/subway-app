// 홈 엔진의 지하철역 표(engine/home-stations.js)가 앱의 역 표(STNDB)와 어긋나지 않는지 — 2026-10-19
//   엔진이 후보를 직접 거르려면 같은 표가 있어야 한다(앱이 단일 출처). 앱의 STNDB 를 고치면 `node tools/engine/gen-home-stations.js` 로 다시 만든다.
//   ① 같은 순서·같은 값(이름·호선·위도·경도) ② 생성 도구가 만드는 글이 저장소 파일과 같다 ③ 앱의 예전 후보 걸러내기(STNDB.filter → _dedupeStnByName → 8개)와 엔진 결과가 여러 검색어에서 같다
// 실행: node test/home_stations.ui.test.js [html 경로]
const assert = require('assert'), fs = require('fs'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
const E = require('../engine/home'), ST = require('../engine/home-stations').HOME_STNS, GEN = require('../tools/engine/gen-home-stations');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 900)); } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
  const page = await ctx.newPage();
  await page.route('**/*', r => (new URL(r.request().url()).protocol === 'file:' ? r.continue() : r.abort()));
  await page.addInitScript(() => { try { localStorage.setItem('locDisc', '1'); } catch (e) {} });
  await page.goto('file://' + html); await page.waitForTimeout(2000);
  const app = await page.evaluate(() => STNDB.map(s => [s.name, s.line, s.lat, s.lng]));
  await t('엔진 역 표 == 앱 STNDB (같은 순서·같은 값) — 어긋나면 gen-home-stations 를 다시 돌린다', async () => {
    assert.strictEqual(ST.length, app.length, '역 수 앱 ' + app.length + ' / 엔진 ' + ST.length + ' — node tools/engine/gen-home-stations.js');
    for (let i = 0; i < app.length; i++) assert.deepStrictEqual(ST[i], app[i], i + '번째 역이 다르다: 앱 ' + JSON.stringify(app[i]) + ' / 엔진 ' + JSON.stringify(ST[i]) + ' — node tools/engine/gen-home-stations.js');
  });
  await t('생성 도구가 만드는 파일 글 == 저장소의 engine/home-stations.js', async () => {
    assert.strictEqual(GEN.render(app), fs.readFileSync(path.join(__dirname, '..', 'engine/home-stations.js'), 'utf8'));
  });
  await t('엔진 걸러내기 == 앱의 예전 후보 걸러내기(여러 검색어)', async () => {
    const qs = ['강남', '서울', '역', '신', '수원', '용두', '부평', '인천', '시청', '공항', '대', '123', 'ㄱ', '없는이름'];
    for (const q of qs) {
      const web = await page.evaluate((q) => { const m = _dedupeStnByName(STNDB.filter(s => s.name.indexOf(q) >= 0)).slice(0, 8); return m.map(s => ({ n: s.name, l: s.lineLabel || '', line: s.line, lat: s.lat, lng: s.lng })); }, q);
      const eng = E.homeStnFind(q);
      assert.deepStrictEqual(eng.u, web.map(x => ({ n: x.n, l: x.l })), q + ' 줄');
      assert.deepStrictEqual(eng.pk, web.map(x => ({ name: x.n, line: x.line, lat: x.lat, lng: x.lng })), q + ' 고르기 값');
    }
  });
  await b.close();
  console.log(`\nhome_stations: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
