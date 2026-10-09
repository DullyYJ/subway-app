// holidays.json → www/index.html 의 HOL_BUILTIN 블록(앱 내장 공휴일 — 엔진에 못 닿을 때의 대비). 사용: node tools/holidays/gen_app.js [holidays.json]
const fs = require('fs'), path = require('path');
const o = JSON.parse(fs.readFileSync(process.argv[2] || path.join(__dirname, 'holidays.json'), 'utf8'));
const p = path.join(__dirname, '..', '..', 'www', 'index.html');
let s = fs.readFileSync(p, 'utf8');
const a = s.indexOf('/*HOL_BUILTIN_START*/'), b = s.indexOf('/*HOL_BUILTIN_END*/');
if (a < 0 || b < a) throw new Error('HOL_BUILTIN 표식을 찾지 못함');
const years = {}; for (const y in o.years) years[y] = { status: o.years[y].status, dates: o.years[y].dates };
const blk = '/*HOL_BUILTIN_START*/\nvar _HOL_BUILTIN = ' + JSON.stringify({ asOf: o.asOf, years }) + ';\n';
const ns = s.slice(0, a) + blk + s.slice(b);
if (ns !== s) { fs.writeFileSync(p, ns); console.log('www/index.html 공휴일 내장값 갱신', o.version); } else console.log('변경 없음');
