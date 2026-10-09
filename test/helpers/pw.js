// playwright 위치가 환경마다 다르다 — 로컬 작업 환경(/opt/node-tools)을 먼저, 없으면 일반 설치(CI)를 쓴다.
try { module.exports = require('/opt/node-tools/node_modules/playwright'); }
catch (e) { module.exports = require('playwright'); }
