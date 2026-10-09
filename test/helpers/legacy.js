// 옛 앱의 시각표 계산 코드(test/fixtures/legacy_timetable.js)를 현재 앱 페이지에 덧붙인다 — 엔진 이전 결과 비교용.
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'legacy_timetable.js'), 'utf8');
module.exports = async function injectLegacy(page) {
  await page.addScriptTag({ content: src });
  await page.waitForTimeout(600);        // 인천 시각표는 옛 코드에서 setTimeout 으로 채워진다
};
