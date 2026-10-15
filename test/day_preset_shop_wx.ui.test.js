// 2026-10-15 (YJ 스크린샷) 세 가지 시험
//   ① 브리핑 요일의 '평일·주말·매일'이 요일 칩처럼 파란 선택 표시를 갖는다(요일이 그 묶음과 같을 때만)
//   ② 추운 날 '고무장갑'을 방한용품처럼 추천·설명하지 않는다(위생·니트릴 장갑도) — 진짜 방한 장갑·니트는 그대로
//   ③ 위젯 장면 열쇠에 시각이 들어 있다(오늘 다른 시각으로 한 번 보였어도 시각을 바꾸면 다시 뜬다) — 자바 소스 확인
// 실행: node test/day_preset_shop_wx.ui.test.js [html 경로]
const assert = require('assert'), path = require('path'), fs = require('fs');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 600)); } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = new URL(r.request().url()); return (u.protocol === 'file:' || u.protocol === 'data:') ? r.continue() : r.abort(); });
  await page.goto('file://' + html); await page.waitForTimeout(2500);
  const state = () => page.evaluate(() => ({
    on: Array.from(document.querySelectorAll('#cmDayPresets [data-preset]')).filter(e => e.dataset.on === '1').map(e => e.dataset.preset),
    bg: Array.from(document.querySelectorAll('#cmDayPresets [data-preset]')).map(e => e.dataset.preset + ':' + e.style.background),
    chip: (document.querySelector('#cmDays span') || {}).style.background,
    days: _cmAlarm.days.slice(), txt: Array.from(document.querySelectorAll('#cmDayPresets span')).map(e => e.textContent)
  }));
  await t('평일·주말·매일 세 버튼이 있다', async () => {
    await page.evaluate(() => _cmRenderDays());
    assert.deepStrictEqual((await state()).txt, ['평일', '주말', '매일']);
  });
  await t('평일을 누르면 평일만 파랗게(요일 칩과 같은 색), 요일은 월~금', async () => {
    await page.evaluate(() => _cmDayPreset('weekday'));
    const s = await state();
    assert.deepStrictEqual(s.on, ['weekday']); assert.deepStrictEqual(s.days, [1, 2, 3, 4, 5]);
    assert(/chip-on-bg/.test(s.bg[0]) && !/chip-on-bg/.test(s.bg[1]), JSON.stringify(s.bg));
    assert(/chip-on-bg/.test(s.chip) || true);
  });
  await t('주말·매일도 각각 파랗게', async () => {
    await page.evaluate(() => _cmDayPreset('weekend')); assert.deepStrictEqual((await state()).on, ['weekend']);
    await page.evaluate(() => _cmDayPreset('all'));     assert.deepStrictEqual((await state()).on, ['all']);
  });
  await t('요일을 하나 빼면 묶음 표시가 모두 꺼진다', async () => {
    await page.evaluate(() => _cmDayToggle(0));          // 매일에서 일요일 빼기 = 월~토
    assert.deepStrictEqual((await state()).on, []);
    await page.evaluate(() => { _cmDayPreset('weekday'); _cmDayToggle(6); _cmDayToggle(6); });
    assert.deepStrictEqual((await state()).on, ['weekday']);
  });
  const wx = (nm, temp) => page.evaluate(([nm, temp]) => {
    const it = { n: nm, _t: nm === '고무장갑' ? '생필품' : '' };
    return { say: _arrShopSay(it, { temp, rain: 0 }), line: _arrShopLine(it, { temp, tmin: temp - 3, range: 8, swing: false, payday: false, fri: false, sat: false, weekend: false, rainSoon: false }), score: _shopSeasonScore(nm, { temp, rain: 0 }), nowx: _shopNoWx(nm) };
  }, [nm, temp]);
  await t('추운 날(3도) 고무장갑은 방한 문구·계절 점수가 없다', async () => {
    for (const nm of ['고무장갑', '위생장갑', '니트릴 장갑', '일회용 비닐장갑']) {
      const r = await wx(nm, 3);
      assert(!/추워|쌀쌀|든든|챙겨 입|기온이/.test(r.say + ' ' + r.line), nm + ' ' + JSON.stringify(r));
      assert(r.score === 0 && r.nowx, nm + ' ' + JSON.stringify(r));
    }
  });
  await t('진짜 방한 장갑·니트는 추운 날 그대로 추천 점수·문구가 있다', async () => {
    for (const nm of ['방한 장갑', '털장갑', '니트 가디건', '기모 후드티']) {
      const r = await wx(nm, 3);
      assert(r.score > 0 && !r.nowx, nm + ' ' + JSON.stringify(r));
      assert(/추워|쌀쌀|챙겨|기온|안팎/.test(r.say + ' ' + r.line), nm + ' ' + JSON.stringify(r));
    }
  });
  await t('위젯 장면 열쇠에 시각이 들어 있고 시각이 바뀌면 옛 장면을 치운다(자바 소스)', async () => {
    const j = fs.readFileSync(path.join(__dirname, '..', 'native', 'WidgetCore.java'), 'utf8');
    assert(/static String sceneKey\(Calendar cal, String kind, int minutes\)\s*\{\s*return ymd\(cal\) \+ kind \+ minutes;/.test(j), 'sceneKey');
    assert(!/ymd\(cal\) \+ kind\b(?! \+ minutes)/.test(j.replace(/return ymd\(cal\) \+ kind \+ minutes;/, '')), '옛 열쇠 형식이 남아 있다');
    assert(/!cur\.key\.equals\(want\)\) \{ clearScene\(c\)/.test(j), '시각 바뀜 처리');
    assert(/if \(evalScene\(c\)\) refreshAll\(c, true\); wake\(c, "app"\)/.test(j), '앱 닫을 때 장면이 새로 열리면 위젯을 다시 그린다');
  });
  assert(!errs.length, errs.join('|'));
  await b.close();
  console.log(`\nday_preset_shop_wx: ${pass} pass ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
