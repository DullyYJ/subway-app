#!/usr/bin/env node
// 앱(www/index.html)의 지하철역 표(STNDB: 이름·호선·위도·경도, 실측 좌표 보정 뒤)를 엔진 데이터 파일(engine/home-stations.js)로 뽑는다 — 2026-10-19.
//   홈 화면 엔진이 지하철 후보를 직접 걸러내려면 같은 표가 있어야 한다. 표는 앱이 단일 출처이고, 이 도구가 복사본을 만든다.
//   (어긋나면 test/home_stations.test.js 가 잡는다.)
// 사용: node tools/engine/gen-home-stations.js [www/index.html]      (playwright 필요 — test/helpers/pw)
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../..');
const { chromium } = require(path.join(root, 'test/helpers/pw'));
const html = path.resolve(process.argv[2] || path.join(root, 'www/index.html'));
async function dump(file) {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
    const page = await ctx.newPage();
    await page.route('**/*', r => (new URL(r.request().url()).protocol === 'file:' ? r.continue() : r.abort()));
    await page.addInitScript(() => { try { localStorage.setItem('locDisc', '1'); } catch (e) {} });
    await page.goto('file://' + file); await page.waitForTimeout(2000);
    return await page.evaluate(() => STNDB.map(s => [s.name, s.line, s.lat, s.lng]));
  } finally { await b.close(); }
}
function render(rows) {
  const lines = rows.map(r => '  ' + JSON.stringify(r));
  return '// 길동무 — 홈 화면 엔진의 지하철역 표 (자동 생성: node tools/engine/gen-home-stations.js — 직접 고치지 않는다; 단일 출처는 www/index.html 의 STNDB)\n' +
    '//   [이름, 호선, 위도, 경도] — 앱 STNDB 와 같은 순서(후보 순서가 같아야 한다).\n' +
    "'use strict';\nvar HOME_STNS = [\n" + lines.join(',\n') + '\n];\n\n' +
    "if (typeof module !== 'undefined' && module.exports) module.exports = { HOME_STNS: HOME_STNS };\n";
}
if (require.main === module) {
  dump(html).then(rows => {
    if (!Array.isArray(rows) || rows.length < 500) throw new Error('STNDB 가 이상합니다: ' + (rows && rows.length));
    fs.writeFileSync(path.join(root, 'engine/home-stations.js'), render(rows));
    console.log('engine/home-stations.js', rows.length, '역');
  }).catch(e => { console.error(e); process.exit(1); });
}
module.exports = { dump: dump, render: render };
