// 2026-10-09 — 예전엔 '정의된 적 없는 함수'를 불러서 조용히 실패하던 곳의 회귀 방지
//  · _stopsParamOk 의 400m 거리 검사(_hav 미정의로 건너뜀) → 가까우면 true, 멀면 false
//  (_metroNextTrainInfo 의 방향 판정은 시각표 계산과 함께 엔진으로 옮겼다 — 엔진 쪽 방향 판정은 next_train_parity 가 옛 계산과 비교한다)
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
  await t('주변 정류장 캐시: 400m 안이면 쓰고, 멀면 버린다', async () => {
    const r = await p.evaluate(() => { window._nearStopsCache = { stops: [1], lat: 37.5, lng: 127, ts: Date.now() }; return [_stopsParamOk(37.5, 127.001), _stopsParamOk(37.6, 127.1)]; });
    assert.deepStrictEqual(r, [true, false]);
  });
  await t('JS 오류가 없다', async () => { assert.deepStrictEqual(errs, []); });
  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
