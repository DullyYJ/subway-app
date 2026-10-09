// playwright 위치·브라우저 경로가 환경마다 다르다.
//  - 로컬 작업 환경: /opt/node-tools 의 playwright + 고정 경로 Chromium
//  - CI(GitHub Actions): 일반 설치(npm) + `playwright install` 이 받은 Chromium
// 테스트 파일은 고정 경로(executablePath)를 그대로 쓰되, 그 파일이 없으면 Playwright 기본 브라우저로 바꿔 실행한다.
const fs = require('fs');
let pw;
try { pw = require('/opt/node-tools/node_modules/playwright'); }
catch (e) { pw = require('playwright'); }
const orig = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = (o = {}) => {
  if (o.executablePath && !fs.existsSync(o.executablePath)) { o = Object.assign({}, o); delete o.executablePath; }
  return orig(o);
};
module.exports = pw;
