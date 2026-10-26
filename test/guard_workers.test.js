// 다른 워커(버스 · 음식 · 쇼핑 · 게시판 · 중계)에 입힌 API 남용 방어 시험 — 2026-10-26 (s227)
//   node test/guard_workers.test.js
const fs = require('fs'), os = require('os'), path = require('path'), { pathToFileURL } = require('url');
const W = require('../tools/guard-wrap.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('  FAIL ' + m); } };
const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-'));
const load = async name => {
  const f = path.join(tmp, name + '-' + Math.random().toString(36).slice(2) + '.mjs');
  fs.writeFileSync(f, fs.readFileSync(path.join(root, 'workers/guarded', name + '.js'), 'utf8'));
  return (await import(pathToFileURL(f).href)).default;
};
const req = (p, o) => { o = o || {}; const h = Object.assign({}, o.ip === null ? {} : { 'CF-Connecting-IP': o.ip || '203.0.113.7' }, o.iid ? { 'X-Gdm-Id': o.iid } : {}); return new Request('https://w.example' + p, { method: o.method || 'GET', headers: h, body: o.method === 'POST' ? '{}' : undefined }); };
const ctx = { waitUntil() { } };
const codes = async (w, n, p, o, env) => { const r = []; for (let i = 0; i < n; i++) { const x = await w.fetch(req(p, o), env || {}, ctx); r.push(x.status); } return r; };
const count = (a, f) => a.filter(f).length;

(async () => {
  // ① 만든 것이 최신이고, 원본은 한 글자도 바뀌지 않는다(방어 블록과 export 한 줄만 다르다)
  const built = W.build();
  for (const name of Object.keys(W.PROFILES)) {
    const cur = fs.readFileSync(path.join(root, 'workers/guarded', name + '.js'), 'utf8'), src = fs.readFileSync(path.join(root, 'workers/src', name + '.js'), 'utf8');
    ok(cur === built[name], name + ': workers/guarded 가 최신(node tools/guard-wrap.js)');
    const i = cur.indexOf('// ===== GUARD BEGIN'), j = cur.indexOf('// ===== GUARD END =====\n') + '// ===== GUARD END =====\n'.length;
    const rest = cur.slice(0, i) + cur.slice(j);
    const exp = /export \{\s*([\w$]+) as default\s*\};?/.test(src) ? src.replace(/export \{\s*([\w$]+) as default\s*\};?/, 'export default gdWrap($1);') : src.replace(/^export default \{/m, 'var __gd_inner = {').replace(/\s*$/, '\n') + 'export default gdWrap(__gd_inner);\n';
    ok(rest === W.esc(exp), name + ': 원래 코드는 그대로(방어 블록 · export 한 줄만 달라진다)');
    ok(!/[^\x00-\x7f]/.test(cur) && cur.indexOf('\r') < 0, name + ': 파일 전체가 ASCII · 줄바꿈 LF');
  }
  // ② 모양: fetch 가 있고 scheduled 는 그대로 통과
  const bus = await load('bus'), food = await load('food'), shop = await load('shop'), board = await load('board-writer'), gl = await load('gentle-lab');
  ok([bus, food, shop, board, gl].every(w => typeof w.fetch === 'function'), '다섯 워커 모두 fetch 가 있다');
  ok(typeof food.scheduled === 'function' && typeof board.scheduled === 'function', '크론(scheduled)이 있는 음식 · 게시판은 그대로 남는다');
  // ③ 정상 사용은 걸리지 않는다
  let r = await shop.fetch(req('/version'), {}, ctx);
  ok(r.status === 200 && (await r.json()).ok === true, '쇼핑: 정상 요청은 원래 응답 그대로');
  r = await bus.fetch(req('/health'), {}, ctx);
  ok(r.status === 200 && (await r.json()).service === 'gildongmu-bus-proxy', '버스: /health 원래 응답 그대로');
  let a = await codes(bus, 60, '/tago', { iid: 'phone00000001' });
  ok(count(a, s => s === 429) === 0, '버스: 화면 하나가 정류장 여러 곳을 한꺼번에 불러도 통과(60번 버스트 · 429 ' + count(a, s => s === 429) + ')');
  // ④ 매크로는 막힌다 — 종류별
  a = await codes(bus, 400, '/tago', { ip: '198.51.100.1', iid: 'macro0000001' });
  ok(count(a, s => s === 429) > 250 && a[0] !== 429, '버스: /tago 를 초당 수백 번 → 앞의 버스트만 통과 · 나머지 429 (' + count(a, s => s === 429) + '/400)');
  r = await bus.fetch(req('/health', { ip: '198.51.100.1', iid: 'macro0000001' }), {}, ctx);
  ok(r.status === 429 && Number(r.headers.get('Retry-After')) >= 1, '버스: 차단 중에는 Retry-After 가 붙는다');
  r = await bus.fetch(req('/tago', { ip: '198.51.100.1', iid: 'normal0000001' }), {}, ctx);
  ok(r.status !== 429, '버스: 같은 공유 IP 의 다른 기기는 영향 없다');
  a = await codes(food, 80, '/admin/food-run', { ip: '198.51.100.2' });
  ok(a[0] === 401 && count(a, s => s === 429) > 40, '음식: 관리 주소는 토큰 없으면 401 · 두드리면 429 (' + count(a, s => s === 429) + '/80)');
  a = await codes(food, 40, '/cells/report', { ip: '198.51.100.3', method: 'POST' });
  ok(count(a, s => s === 429) >= 15 && count(a, s => s === 429) <= 25, '음식: 쓰기(/cells/report)는 20번 뒤 막힌다 (' + count(a, s => s === 429) + '/40)');
  a = await codes(board, 60, '/post', { ip: '198.51.100.4', method: 'POST', iid: 'spam00000001' }, { DB: null });
  ok(count(a, s => s === 429) >= 30 && a.slice(0, 20).every(s => s !== 429), '게시판: 글쓰기 도배 — 처음 20개까지 통과, 이후 429 (' + count(a, s => s === 429) + '/60)');
  a = await codes(board, 30, '/gen', { ip: '198.51.100.5' }, {});
  ok(count(a, s => s === 429) >= 15 && a[0] === 401, '게시판: 관리 주소(/gen) 두드림 → 401 후 429');
  a = await codes(board, 70, '/status', { ip: '198.51.100.6', iid: 'reader0000001' }, {});
  ok(count(a, s => s === 429) === 0, '게시판: 읽기(상태 · 목록)는 70번 연달아도 통과');
  a = await codes(gl, 200, '/relay/push', { ip: '198.51.100.7', method: 'POST' }, {});
  ok(count(a, s => s === 429) === 0, '중계: /relay/* (한국 중계 서버 전용)는 검사하지 않는다');
  a = await codes(gl, 300, '/seoul', { ip: '198.51.100.8', iid: 'macro0000002' }, {});
  ok(count(a, s => s === 429) > 150, '중계: /seoul 매크로 → 429 (' + count(a, s => s === 429) + '/300)');
  a = await codes(shop, 500, '/shop', { ip: '198.51.100.9' }, {});
  ok(count(a, s => s === 429) > 100, '쇼핑: 큰 목록을 초당 수백 번 → 429 (' + count(a, s => s === 429) + '/500)');
  // ⑤ 서비스 바인딩 같은 내부 호출(CF-Connecting-IP 없음)은 검사하지 않는다
  a = await codes(gl, 300, '/seoul', { ip: null }, {});
  ok(count(a, s => s === 429) === 0, '내부 호출(IP 머리글 없음)은 통과 — 서비스 바인딩으로 부르는 엔진이 막히지 않는다');
  // ⑥ 오류가 나도 막지 않는다: 이상한 요청 주소
  r = await bus.fetch(new Request('https://w.example/health', { headers: { 'CF-Connecting-IP': '198.51.100.10', 'X-Gdm-Id': '!!!' } }), {}, ctx);
  ok(r.status === 200, '이상한 기기 번호가 와도 정상 처리(번호만 무시)');
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('guard_workers: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
