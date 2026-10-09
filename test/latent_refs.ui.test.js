// 2026-10-09 — 예전엔 '정의된 적 없는 함수'를 불러서 조용히 실패하던 두 곳의 회귀 방지
//  ① _metroNextTrainInfo 가 방향을 항상 '하'로 잡던 것 → 반대 방향 두 구간은 반대 방향키가 나와야 한다
//  ② _stopsParamOk 의 400m 거리 검사(_hav 미정의로 건너뜀) → 가까우면 true, 멀면 false
// 실행: node test/latent_refs.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + html); await p.waitForTimeout(2500);
  await t('반대 방향 두 구간은 서로 다른 방향이 나온다(2호선·4호선·9호선)', async () => {
    const r = await p.evaluate(() => [['2호선', '시청', '을지로입구'], ['4호선', '서울역', '명동'], ['9호선', '여의도', '당산']]
      .map(([l, a, c]) => [_ttSegDir(l, [{ stationName: a }, { stationName: c }], false), _ttSegDir(l, [{ stationName: c }, { stationName: a }], false)]));
    r.forEach(([x, y]) => { assert.ok(x && y && x !== y, JSON.stringify(r)); });
  });
  await t('_metroNextTrainInfo 가 정의 안 된 함수를 부르지 않는다(방향키 상/하 모두 가능)', async () => {
    const src = await p.evaluate(() => String(_metroNextTrainInfo));
    assert.ok(!/_ttFirstOfficial/.test(src), '_ttFirstOfficial 호출이 남아 있다');
  });
  await t('주변 정류장 캐시: 400m 안이면 쓰고, 멀면 버린다', async () => {
    const r = await p.evaluate(() => { window._nearStopsCache = { stops: [1], lat: 37.5, lng: 127, ts: Date.now() }; return [_stopsParamOk(37.5, 127.001), _stopsParamOk(37.6, 127.1)]; });
    assert.deepStrictEqual(r, [true, false]);
  });
  await t('JS 오류가 없다', async () => { assert.deepStrictEqual(errs, []); });
  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
