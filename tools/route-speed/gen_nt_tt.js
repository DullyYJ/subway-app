// gildongmu-tt 시각표 번들(JSON) → engine/next-train-tt.js (엔진 안에 들어가는 내장본)
// 사용: node tools/route-speed/gen_nt_tt.js <번들.json>   (번들 = gildongmu-tt 워커의 GET /tt 응답 본문 = 워커 소스의 TT_BUNDLE)
// 왜 내장하나: route-v2 워커가 gildongmu-tt 의 workers.dev 주소를 직접 부르면 404 가 온다(같은 계정 워커 간 호출 제한).
//   그래서 번들을 엔진에 넣어 두고, 서비스 바인딩(TT_SVC)이나 KV 캐시에 더 새 것이 있으면 그것을 우선한다.
const fs = require('fs'), path = require('path');
const src = process.argv[2];
if (!src) { console.error('사용: node gen_nt_tt.js <번들.json>'); process.exit(1); }
const txt = fs.readFileSync(src, 'utf8').trim();
const o = JSON.parse(txt);
if (!o.version || !o.data || !o.data._REAL_TT) throw new Error('번들 모양이 아님');
if (/[`\\]|\$\{/.test(txt)) throw new Error('백틱/역슬래시/${ 가 있어 String.raw 로 넣을 수 없음');
const out = '// 길동무 — gildongmu-tt 시각표 번들 내장본 (tools/route-speed/gen_nt_tt.js 로 생성; 직접 고치지 않는다)\n' +
  '// version: ' + o.version + '\n' +
  'var NT_TT_EMBED = String.raw`' + txt + '`;\n';
fs.writeFileSync(path.join(__dirname, '..', '..', 'engine', 'next-train-tt.js'), out);
console.log('ok', o.version, out.length);
