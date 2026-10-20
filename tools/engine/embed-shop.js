// engine/shop.js + shop-worker.js · engine/settings.js + settings-worker.js · engine/food.js + food-worker.js · engine/news.js + news-worker.js · engine/board.js + board-worker.js · engine/chat.js + chat-worker.js · engine/tabs.js + tabs-worker.js · engine/home.js + home-worker.js 를 route-v2-worker.ascii.js 에 내장한다(비 ASCII 는 \uXXXX 로). 다시 돌려도 같은 결과(표지 사이를 갈아 끼움).
//  node tools/engine/embed-shop.js [--version route-v2-YYYY-MM-DDsNN]
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '../..');
const wp = path.join(root, 'engine/route-v2-worker.ascii.js');
let w = fs.readFileSync(wp, 'utf8');
const esc = s => s.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const SETS = [
  { name: 'SHOP', src: 'engine/shop.js', glue: 'engine/shop-worker.js', path: '/screen/shop', fn: 'handleScreenShop', anchor: '  if (url.pathname === "/scene") return handleScene(request);\n' },
  { name: 'SETTINGS', src: 'engine/settings.js', glue: 'engine/settings-worker.js', path: '/screen/settings', fn: 'handleScreenSettings', anchor: '  if (url.pathname === "/screen/shop") return handleScreenShop(request);\n' },
  { name: 'FOOD', src: 'engine/food.js', glue: 'engine/food-worker.js', path: '/screen/food', fn: 'handleScreenFood', anchor: '  if (url.pathname === "/screen/settings") return handleScreenSettings(request);\n' },
  { name: 'NEWS', src: 'engine/news.js', glue: 'engine/news-worker.js', path: '/screen/news', fn: 'handleScreenNews', anchor: '  if (url.pathname === "/screen/food") return handleScreenFood(request);\n' },
  { name: 'BOARD', src: 'engine/board.js', glue: 'engine/board-worker.js', path: '/screen/board', fn: 'handleScreenBoard', anchor: '  if (url.pathname === "/screen/news") return handleScreenNews(request);\n' },
  { name: 'CHAT', src: 'engine/chat.js', glue: 'engine/chat-worker.js', path: '/screen/chat', fn: 'handleScreenChat', anchor: '  if (url.pathname === "/screen/board") return handleScreenBoard(request);\n' },
  { name: 'TABS', src: 'engine/tabs.js', glue: 'engine/tabs-worker.js', path: '/screen/tabs', fn: 'handleScreenTabs', anchor: '  if (url.pathname === "/screen/chat") return handleScreenChat(request);\n' },
  { name: 'HOME', pre: ['engine/home-stations.js'], src: 'engine/home.js', glue: 'engine/home-worker.js', path: '/screen/home', fn: 'handleScreenHome', anchor: '  if (url.pathname === "/screen/tabs") return handleScreenTabs(request);\n' },
  { name: 'CCHIPS', src: 'engine/cchips.js', glue: 'engine/cchips-worker.js', path: '/screen/cchips', fn: 'handleScreenCchips', anchor: '  if (url.pathname === "/screen/home") return handleScreenHome(request);\n' },
  { name: 'WRITE', src: 'engine/write.js', glue: 'engine/write-worker.js', path: '/screen/write', fn: 'handleScreenWrite', anchor: '  if (url.pathname === "/screen/cchips") return handleScreenCchips(request);\n' },
  { name: 'RHEAD', src: 'engine/rhead.js', glue: 'engine/rhead-worker.js', path: '/screen/rhead', fn: 'handleScreenRhead', anchor: '  if (url.pathname === "/screen/write") return handleScreenWrite(request);\n' },
  { name: 'RESULT', src: 'engine/result.js', glue: 'engine/result-worker.js', path: '/screen/result', fn: 'handleScreenResult', anchor: '  if (url.pathname === "/screen/rhead") return handleScreenRhead(request);\n' },
  { name: 'CONG', pre: ['engine/cong-data.js'], src: 'engine/cong.js', glue: 'engine/cong-worker.js', path: '/screen/cong', fn: 'handleScreenCong', anchor: '  if (url.pathname === "/screen/rhead") return handleScreenRhead(request);\n' },
  { name: 'AICARD', src: 'engine/aicard.js', glue: 'engine/ai-worker.js', path: '/screen/ai', fn: 'handleScreenAi', anchor: '  if (url.pathname === "/screen/cong") return handleScreenCong(request);\n' },
  { name: 'TALKCARD', src: 'engine/talkcard.js', glue: 'engine/talk-worker.js', path: '/screen/talk', fn: 'handleScreenTalk', anchor: '  if (url.pathname === "/screen/ai") return handleScreenAi(request);\n' },
  { name: 'DIALOG', src: 'engine/dialog.js', glue: 'engine/dlg-worker.js', path: '/screen/dlg', fn: 'handleScreenDlg', anchor: '  if (url.pathname === "/screen/talk") return handleScreenTalk(request);\n' },
  { name: 'PVLABEL', src: 'engine/pvlabel.js', glue: 'engine/pvl-worker.js', path: '/screen/pvl', fn: 'handleScreenPvl', anchor: '  if (url.pathname === "/screen/dlg") return handleScreenDlg(request);\n' },
  { name: 'POSFUSE', src: 'engine/posfusion.js', glue: 'engine/pf-worker.js', path: '/pos-fuse', fn: 'handlePosFuse', anchor: '  if (url.pathname === "/screen/pvl") return handleScreenPvl(request);\n' },
  { name: 'MAP', src: 'engine/map.js', glue: 'engine/map-worker.js', path: '/screen/map', fn: 'handleScreenMap', anchor: '  if (url.pathname === "/pos-fuse") return handlePosFuse(request);\n' },
  { name: 'FAV', src: 'engine/fav.js', glue: 'engine/fav-worker.js', path: '/screen/fav', fn: 'handleScreenFav', anchor: '  if (url.pathname === "/screen/map") return handleScreenMap(request);\n' },
  { name: 'HCARDS', src: 'engine/hcards.js', glue: 'engine/hcards-worker.js', path: '/screen/hcards', fn: 'handleScreenHcards', anchor: '  if (url.pathname === "/screen/fav") return handleScreenFav(request);\n' },
  { name: 'RIDESTART', src: 'engine/ride-start.js', glue: 'engine/ride-start-worker.js', path: '/ride/start', fn: 'handleRideStart', anchor: '  if (url.pathname === "/screen/hcards") return handleScreenHcards(request);\n' },
  { name: 'RULES', src: 'engine/rules.js', glue: 'engine/rules-worker.js', path: '/rules', fn: 'handleRules', anchor: '  if (url.pathname === "/ride/start") return handleRideStart(request);\n' }
];
let all = '';
for (const S of SETS) {
  const cut = t => t.slice(0, t.indexOf('if (typeof module')).trimEnd();
  let src = cut(fs.readFileSync(path.join(root, S.src), 'utf8'));
  // pre: 이 모듈보다 먼저 붙는 데이터 파일(예: 홈 화면의 지하철역 표). 본문 앞에 그대로 놓는다.
  if (S.pre) src = S.pre.map(f => cut(fs.readFileSync(path.join(root, f), 'utf8')).replace(/^'use strict';\n/m, '')).join('\n') + '\n' + src;
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
