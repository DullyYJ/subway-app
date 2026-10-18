// 배포용 엔진 파일(engine/route-v2-worker.ascii.js)에서 내장 노선 그래프(SUBWAY_BUNDLE)를 bundle.json 으로 꺼낸다.
// 사용: node tools/route-sweep/extract_bundle.js engine/route-v2-worker.ascii.js bundle.json
const fs = require('fs');
const [, , src, out] = process.argv;
const line = fs.readFileSync(src, 'utf8').split('\n').find(l => l.indexOf('SUBWAY_BUNDLE = ') >= 0);
if (!line) { console.error('SUBWAY_BUNDLE 를 못 찾음'); process.exit(1); }
const t = line.slice(line.indexOf('SUBWAY_BUNDLE = ') + 16).trim().replace(/;$/, '');
fs.writeFileSync(out, JSON.stringify(eval('(' + t + ')')));
console.log('ok', out);
