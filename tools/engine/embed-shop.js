// engine/shop.js + shop-worker.js 와 engine/settings.js + settings-worker.js 를 route-v2-worker.ascii.js 에 내장한다(비 ASCII 는 \uXXXX 로). 다시 돌려도 같은 결과(표지 사이를 갈아 끼움).
//  node tools/engine/embed-shop.js [--version route-v2-YYYY-MM-DDsNN]
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../..');
const wp = path.join(root, 'engine/route-v2-worker.ascii.js');
let w = fs.readFileSync(wp, 'utf8');
const esc = s => s.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const SETS = [
  { name: 'SHOP', src: 'engine/shop.js', glue: 'engine/shop-worker.js', path: '/screen/shop', fn: 'handleScreenShop', anchor: '  if (url.pathname === "/scene") return handleScene(request);\n' },
  { name: 'SETTINGS', src: 'engine/settings.js', glue: 'engine/settings-worker.js', path: '/screen/settings', fn: 'handleScreenSettings', anchor: '  if (url.pathname === "/screen/shop") return handleScreenShop(request);\n' }
];
let all = '';
for (const S of SETS) {
  let src = fs.readFileSync(path.join(root, S.src), 'utf8');
  src = src.slice(0, src.indexOf('if (typeof module')).trimEnd();
  const glue = fs.readFileSync(path.join(root, S.glue), 'utf8').trimEnd();
  const BEGIN = '// ===== ' + S.name + ' ENGINE BEGIN =====', END = '// ===== ' + S.name + ' ENGINE END =====';
  const block = BEGIN + '\n' + esc(src) + '\n' + esc(glue) + '\n' + END + '\n';
  all += block;
  let i = w.indexOf(BEGIN), j = w.indexOf(END);
  if (i >= 0 && j > i) w = w.slice(0, i) + block + w.slice(j + END.length + 1);
  else { const k = w.indexOf('async function handleFetch(request, env, ctx) {'); if (k < 0) throw new Error('handleFetch 없음'); w = w.slice(0, k) + block + '\n' + w.slice(k); }
  const route = '  if (url.pathname === "' + S.path + '") return ' + S.fn + '(request);\n';
  if (w.indexOf(route) < 0) {
    if (w.indexOf(S.anchor) < 0) throw new Error(S.path + ' 앞 경로 없음');
    w = w.replace(S.anchor, S.anchor + route);
  }
}
const vi = process.argv.indexOf('--version');
if (vi > 0) w = w.replace(/var ENGINE_VERSION = "[^"]+";/, 'var ENGINE_VERSION = "' + process.argv[vi + 1] + '";');
if (/[^\x00-\x7f]/.test(all)) throw new Error('내장 블록에 비 ASCII 가 남음');
fs.writeFileSync(wp, w);
console.log('내장 완료', all.length, 'bytes');
