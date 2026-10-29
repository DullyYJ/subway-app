// 오프닝 대본(engine/open.js) → 앱 assets/open.json.   사용: node tools/engine/gen-open.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..');
const { openScript } = require(path.join(root, 'engine', 'open.js'));
const out = path.join(root, 'shell-android', 'app', 'src', 'main', 'assets', 'open.json');
fs.writeFileSync(out, JSON.stringify(openScript()) + '\n');
console.log('wrote', out, fs.statSync(out).size, 'bytes');
