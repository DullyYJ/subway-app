// engine/guard.js + engine/guard-worker.js 를 route-v2-worker.ascii.js 의 GUARD ENGINE 표지 사이에 내장한다(비 ASCII 는 \uXXXX). 다시 돌려도 같은 결과.
//  node tools/engine/embed-guard.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../..');
const wp = path.join(root, 'engine/route-v2-worker.ascii.js');
let w = fs.readFileSync(wp, 'utf8');
const esc = s => s.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const cut = x => x.slice(0, x.indexOf('if (typeof module')).trimEnd();
const src = esc(cut(fs.readFileSync(path.join(root, 'engine/guard.js'), 'utf8'))), glue = esc(fs.readFileSync(path.join(root, 'engine/guard-worker.js'), 'utf8').trimEnd());
const B = '// ===== GUARD ENGINE BEGIN =====\n', E = '\n// ===== GUARD ENGINE END =====';
const i = w.indexOf(B), j = w.indexOf(E);
if (i < 0 || j < i) { console.error('GUARD ENGINE 표지를 찾지 못했다'); process.exit(1); }
w = w.slice(0, i) + B + src + '\n' + glue + w.slice(j);
fs.writeFileSync(wp, w);
console.log('GUARD ENGINE 내장 완료');
