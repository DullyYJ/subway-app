// engine/next-train-tt.js 에 내장된 번들(JSON)을 꺼내 파일로 쓴다.  사용: node tools/collect-tt/extract_embed.js <출력.json>
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'engine', 'next-train-tt.js'), 'utf8');
const a = src.indexOf('String.raw`'), b = src.lastIndexOf('`;');
if (a < 0 || b < a) { console.error('내장 번들을 찾지 못했습니다'); process.exit(1); }
const txt = src.slice(a + 'String.raw`'.length, b);
const o = JSON.parse(txt);                       // 깨졌으면 여기서 실패
if (!o.version || !o.data || !o.data._REAL_TT) { console.error('번들 모양이 아닙니다'); process.exit(1); }
fs.writeFileSync(process.argv[2], txt); console.log('base', o.version, Object.keys(o.data._REAL_TT).length, '역');
