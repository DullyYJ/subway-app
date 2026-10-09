// holidays.json → engine/holidays-data.js (엔진 내장 공휴일). 사용: node tools/holidays/gen_embed.js [holidays.json]
const fs = require('fs'), path = require('path');
const src = process.argv[2] || path.join(__dirname, 'holidays.json');
const o = JSON.parse(fs.readFileSync(src, 'utf8'));
if (!o.years || !Object.keys(o.years).length) throw new Error('공휴일 자료가 비어 있음');
const txt = JSON.stringify(o);
if (/[`\\]|\$\{/.test(txt)) throw new Error('템플릿 문자열로 넣을 수 없는 문자가 있음');
fs.writeFileSync(path.join(__dirname, '..', '..', 'engine', 'holidays-data.js'),
  '// 길동무 — 공휴일 내장본 (tools/holidays/gen_embed.js 로 생성; 직접 고치지 않는다)\n// version: ' + o.version + ' asOf: ' + o.asOf + '\nvar HOL_EMBED = String.raw`' + txt + '`;\n');
console.log('ok', o.version, Object.keys(o.years).join(','));
