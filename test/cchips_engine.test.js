// 커뮤니티 칩 줄 엔진(engine/cchips.js) 시험.  실행: node test/cchips_engine.test.js   (javac · java 필요)
//  ① cap 6 미만이면 만들지 않는다 ② 칸 순서·글자가 웹 #filterRow 와 같다(이모지만 뺌) ③ 켜진 칸 ④ 앱 검증기 통과 ⑤ 워커 내장 사본 ⑥ 워커 끝에서 끝까지 ⑦ alts
const fs = require('fs'), path = require('path'), os = require('os');
const E = require('../engine/cchips'), screenCheck = require('./helpers/screen_check');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('www/index.html'), 'utf8');
const EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

// ── ② 웹 #filterRow 대조 ──
{
  const i = html.indexOf('<div class="filter-row" id="filterRow">'), seg = html.slice(i, html.indexOf('</div>\n\n', i));
  const chips = [...seg.matchAll(/<div class="chip[^"]*"[^>]*onclick="([^"]+)"[^>]*>([^<]+)<\/div>/g)].map(m => ({ on: m[1], label: m[2].replace(/[^\w가-힣]+/gu, '') }));
  ok(chips.length === 4, '웹 칩 네 개를 찾았다 ' + chips.length);
  ok(chips.map(c => c.label).join() === E.CCHIPS_LIST.map(c => c.label).join(), '글자·순서가 웹과 같다(이모지 뺀) ' + chips.map(c => c.label));
  ok(/showChatTab/.test(chips[0].on) && /filterCat\(this,'all'\)/.test(chips[1].on) && /filterCat\(this,'뉴스'\)/.test(chips[2].on) && /showSettingsTab/.test(chips[3].on), '웹 칩이 부르는 함수 4종');
}
// ── ① cap · ③ 켜진 칸 ──
{
  ok(E.cchipsScreen({ cap: 5 }, {}).ok === false && E.cchipsScreen({}, {}).ok === false && E.cchipsScreen(null, null).ok === false, 'cap 6 미만이면 만들지 않는다');
  const s = E.cchipsScreen({ cap: 6 }, { mode: 'news' });
  ok(s.ok && s.v === 1 && s.screen === 'cchips' && s.cover === 'tab' && s.head.length === 1 && s.body.length === 0 && s.head[0].t === 'chips' && /^q1:/.test(s.rev), '기본 모양');
  const it = s.head[0].items;
  ok(it.length === 4 && it.filter(x => x.on).length === 1 && it[2].on && it.every((x, i) => x.act.a === 'call' && x.act.v === 'cc.' + E.CCHIPS_LIST[i].id), '켜진 칩 하나 · 행동 cc.<이름>');
  ok(!JSON.stringify(s).split('"').some(x => EMOJI.test(x)), '이모지 없음');
  ok(E.cchipsScreen({ cap: 6 }, { mode: '없는칸' }).info.mode === 'board' && E.cchipsScreen({ cap: 6 }, null).info.mode === 'board', '모르는 값은 게시판');
  ok(E.cchipsScreen({ cap: 6 }, { mode: 'news' }).rev === s.rev && E.cchipsScreen({ cap: 6 }, { mode: 'set' }).rev !== s.rev, '같은 입력 → 같은 rev, 켜진 칸이 다르면 다름');
}
// ── ④ 앱 검증기 ──
{
  const sc = E.CCHIPS_LIST.map(c => E.cchipsScreen({ cap: 6 }, { mode: c.id }));
  const r = screenCheck(sc);
  ok(!r.err && r.out.length === sc.length && r.out.every(l => l.startsWith('OK ')), '모든 화면이 앱 검증기를 통과 ' + (r.err || r.out.filter(l => !l.startsWith('OK ')).join('|')));
  ok(r.out.every(l => Number(l.split(' ')[2]) === 0), '건너뛴 노드 없음');
}
// ── ⑤ 워커 내장 ──
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  const ms = '// ===== CCHIPS ENGINE BEGIN =====', me = '// ===== CCHIPS ENGINE END =====', i = w.indexOf(ms), j = w.indexOf(me);
  ok(i > 0 && j > i, '워커에 칩 줄 엔진이 내장돼 있다');
  const esc = t => t.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  let src = fs.readFileSync(R('engine/cchips.js'), 'utf8'); src = src.slice(0, src.indexOf('if (typeof module')).trimEnd();
  const body = w.slice(i + ms.length, j);
  ok(body.indexOf(esc(src)) >= 0 && body.indexOf(esc(fs.readFileSync(R('engine/cchips-worker.js'), 'utf8').trimEnd())) >= 0, '워커 내장 사본이 소스와 같다');
  ok(w.indexOf('if (url.pathname === "/screen/cchips") return handleScreenCchips(request);') > 0, '경로 등록');
  ok(!/[^\x00-\x7f]/.test(body), '내장 블록은 ASCII 만');
  const other = w.slice(0, i) + w.slice(j);
  ok(['cchipsScreen', 'cchipsScreens', 'cchipsFacts', 'cchipsHash', 'CCHIPS_LIST', 'CCHIPS_SCREEN_V', 'handleScreenCchips'].every(n => !new RegExp('^(async\\s+)?(function|var)\\s+' + n + '\\b', 'm').test(other)), '다른 엔진과 이름이 겹치지 않는다');
}
// ── ⑦ alts ──
{
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const out = E.cchipsScreens({ cap: 6 }, { mode: 'board' }, 'chips');
  ok(out.ok && Object.keys(out.alts).join() === 'chat,board,news,set', 'alts: 칸 네 개(엔진이 가진 칸 이름이 키)');
  Object.keys(out.alts).forEach(k => ok(same(out.alts[k], E.cchipsScreen({ cap: 6 }, { mode: k })), 'alts[' + k + '] = 그 칸으로 따로 요청한 화면과 같다'));
  ok(E.cchipsScreens({ cap: 6 }, { mode: 'board' }).alts === undefined && E.cchipsScreens({ cap: 5 }, {}, 'chips').ok === false, 'alts 안 달라면 없다 · cap 부족이면 거절');
  const ex = E.cchipsScreens({ cap: 6 }, {}, { x: { mode: 'set' }, y: 4 });
  ok(Object.keys(ex.alts).join() === 'x' && ex.alts.x.info.mode === 'set', 'alts 직접 지정 · 이상한 항목은 건너뜀');
}
// ── ⑥ 워커 끝에서 끝까지 ──
(async () => {
  const tmp = path.join(os.tmpdir(), 'rv2_cchips_' + process.pid + '.mjs');
  fs.copyFileSync(R('engine/route-v2-worker.ascii.js'), tmp);
  try {
    const w = (await import(tmp)).default, call = (u, init) => w.fetch(new Request(u, init), {}, { waitUntil() { } });
    const post = b => call('https://x/screen/cchips', { method: 'POST', body: b, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    const ra = await (await post(JSON.stringify({ cap: 6, f: { mode: 'chat' }, alts: 'chips' }))).json();
    ok(ra.ok && Object.keys(ra.alts).length === 4, '워커: alts 응답(칸 네 화면이 함께 온다)');
    const r = await post(JSON.stringify({ cap: 6, f: { mode: 'set' } })), j = await r.json();
    ok(r.status === 200 && j.ok && j.screen === 'cchips' && j.head[0].items[3].on && /route-v2-2026-10-\d\ds\d\d/.test(j.ver), '워커 응답 200 ' + j.ver);
    ok((await (await post(JSON.stringify({ cap: 5, f: {} }))).json()).ok === false, '워커: cap 부족이면 거절');
    ok((await post('{oops')).status === 400 && (await post('x'.repeat(20001))).status === 413 && (await call('https://x/screen/cchips')).status === 405, '워커: 깨진 본문 400 · 큰 본문 413 · GET 405');
    const ro = await call('https://x/screen/cchips', { method: 'OPTIONS' });
    ok(ro.status === 204 && r.headers.get('access-control-allow-origin') === '*' && r.headers.get('cache-control') === 'no-store', '워커: OPTIONS 204 · CORS · no-store');
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  // ── 웹 연결부 규약 (연결부를 쓴 뒤에 켜진다 — 없으면 건너뜀) ──
  if (html.indexOf('window._scrCchips = ') >= 0) {
    const has = t => html.indexOf(t) >= 0;
    ok(has("'/screen/cchips'") && has("/^cc\\.(chat|board|news|set)$/"), '웹: 칩 줄 연결부 + 엔진 주소 + cc.<칸> 행동만 처리');
  }
  console.log(`cchips_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
