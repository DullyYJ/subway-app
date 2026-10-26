// 배포된 워커(게시판 · 버스 · 음식 · 쇼핑 · 중계) 소스에 API 남용 방어(engine/guard.js + engine/guard-worker.js)를 입힌다 — 2026-10-26 (s227).
//   node tools/guard-wrap.js            → workers/src/<이름>.js 를 읽어 workers/guarded/<이름>.js 를 만든다(다시 돌려도 같은 결과)
//   node tools/guard-wrap.js --check    → 만들어 둔 것이 최신인지만 확인
// 원칙: 원래 코드는 한 글자도 바꾸지 않는다. 마지막의 export 만 gdWrap(...) 으로 감싼다(scheduled 등 다른 진입점은 그대로 통과).
// 블록은 ASCII 만 쓴다(붙여넣기 문제 방지). 종류별 한도는 각 워커의 실제 호출 모양에 맞춘다(아래 PROFILES).
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const esc = s => s.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const cut = x => x.slice(0, x.indexOf('if (typeof module')).trimEnd();

const PROFILES = {
  bus: {   // gildongmu-bus: /tago 는 공공 API 를 부른다(무거움) · /usage 는 관리 화면
    cls: 'function (p, m) { if (p === "/tago") return "heavy"; if (p === "/usage" || p === "/usage.json") return "admin"; return "light"; }',
    cfg: { heavy: { cap: 80, rate: 4 }, admin: { cap: 10, rate: 0.2 } }, heavyMax: 64
  },
  food: {  // gildongmu-food: /food 는 공공 API + D1 · /cells/report 는 쓰기 · /admin/* 은 토큰이 따로 있다(여기서는 속도만)
    cls: 'function (p, m) { if (p.indexOf("/admin/") === 0) return "admin"; if (p === "/cells/report") return "write"; if (p === "/food" || p === "/health" || p === "/") return "heavy"; return "light"; }',
    cfg: { light: { cap: 120, rate: 10 }, heavy: { cap: 40, rate: 2 }, admin: { cap: 30, rate: 0.5 } }, heavyMax: 64
  },
  shop: {  // gildongmu-shop: 상품 목록(큰 JSON)만 준다 · 길찾기 엔진이 서버에서 부르기도 하므로 넉넉하게
    cls: 'function (p, m) { return "light"; }',
    cfg: { light: { cap: 200, rate: 20 } }, heavyMax: 64
  },
  'board-writer': {   // 게시판 · 실시간 소통: 모든 POST 는 쓰기(도배 방지) · /gen /post/delete /reports 는 관리(토큰 따로)
    cls: 'function (p, m) { if (p === "/gen" || p === "/post/delete" || p === "/reports") return "admin"; if (m === "POST") return "write"; if (p === "/newsfeed") return "heavy"; return "light"; }',
    cfg: { light: { cap: 80, rate: 6 }, heavy: { cap: 20, rate: 1 }, write: { cap: 20, rate: 0.5 }, admin: { cap: 10, rate: 0.1 } }, heavyMax: 64
  },
  'gentle-lab': {     // 중계: /tago /seoul /kakao-local /bus-stops 는 외부 API(키 있음) · /relay/* 는 한국 중계 서버(토큰) 전용이라 검사하지 않는다
    cls: 'function (p, m) { if (p.indexOf("/relay/") === 0) return "free"; if (p.indexOf("/admin/") === 0) return "admin"; if (p === "/tago" || p === "/seoul" || p === "/kakao-local" || p === "/bus-stops") return "heavy"; return "light"; }',
    cfg: { heavy: { cap: 60, rate: 3 }, light: { cap: 120, rate: 10 }, admin: { cap: 30, rate: 0.5 } }, heavyMax: 64
  }
};

function block(name) {
  const P = PROFILES[name];
  const core = esc(cut(fs.readFileSync(path.join(root, 'engine/guard.js'), 'utf8')));
  const glue = esc(fs.readFileSync(path.join(root, 'engine/guard-worker.js'), 'utf8').trimEnd());
  const opt = 'var GD_OPT = { cls: ' + P.cls + ', cfg: ' + JSON.stringify(P.cfg) + ', heavyMax: ' + P.heavyMax + ' };';
  const wrap = [
    'function gdWrap(inner) {',
    '  var out = {};',
    '  for (var k in inner) out[k] = inner[k];',
    '  out.fetch = async function (request, env, ctx) {',
    '    var g = await guardEnter(request, env, GD_OPT);',
    '    if (g.res) return g.res;',
    '    try { return await inner.fetch(request, env, ctx); } finally { g.done(); }',
    '  };',
    '  return out;',
    '}'
  ].join('\n');
  return '// ===== GUARD BEGIN (API abuse protection, tools/guard-wrap.js) =====\n' + core + '\n' + glue + '\n' + opt + '\n' + wrap + '\n// ===== GUARD END =====\n';
}

function declared(code) {
  const ids = new Set();
  code.replace(/^(?:async\s+)?(?:var|function|const|let)\s+([A-Za-z_$][\w$]*)/gm, (m, id) => { ids.add(id); return m; });
  return [...ids];
}

function wrapSource(name, src) {
  if (!PROFILES[name]) throw new Error('모르는 워커: ' + name);
  if (src.indexOf('GUARD BEGIN') >= 0) throw new Error(name + ': 이미 방어가 들어 있다(원본 소스를 넣어야 한다)');
  const blk = block(name);
  for (const id of declared(blk)) {
    if (new RegExp('(^|[^\\w$.])' + id.replace(/\$/g, '\\$') + '(?![\\w$])').test(src)) throw new Error(name + ': 이름 충돌 ' + id);
  }
  let out;
  const m1 = /export \{\s*([A-Za-z_$][\w$]*) as default\s*\};?/.exec(src);
  if (m1) {                                   // esbuild 모양: export { X as default };
    out = src.slice(0, m1.index) + blk + 'export default gdWrap(' + m1[1] + ');' + src.slice(m1.index + m1[0].length);
  } else {
    const n = (src.match(/^export default \{/gm) || []).length;
    if (n !== 1) throw new Error(name + ': export default 모양을 찾지 못했다(' + n + ')');
    out = src.replace(/^export default \{/m, 'var __gd_inner = {').replace(/\s*$/, '\n') + blk + 'export default gdWrap(__gd_inner);\n';
  }
  return out;
}

function build() {
  const res = {};
  for (const name of Object.keys(PROFILES)) res[name] = wrapSource(name, fs.readFileSync(path.join(root, 'workers/src', name + '.js'), 'utf8'));
  return res;
}
module.exports = { PROFILES, wrapSource, build, block };

if (require.main === module) {
  const check = process.argv.includes('--check');
  const out = build();
  let bad = 0;
  for (const name of Object.keys(out)) {
    const p = path.join(root, 'workers/guarded', name + '.js');
    if (check) { const cur = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; if (cur !== out[name]) { console.log('오래됨: ' + name); bad++; } }
    else { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, out[name]); console.log('만듦: workers/guarded/' + name + '.js (' + out[name].length + '자)'); }
  }
  if (check) { console.log(bad ? '다시 만들어야 한다: node tools/guard-wrap.js' : '모두 최신'); process.exit(bad ? 1 : 0); }
}
