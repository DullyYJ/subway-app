// 하단 탭 막대 엔진(engine/tabs.js) 시험.  실행: node test/tabs_engine.test.js   (javac · java 필요)
//  ① cap 6 미만이면 만들지 않는다 ② 칸 순서·글자·아이콘이 웹 .bnav 와 글자 그대로 같다 ③ 켜진 칸·배지 ④ 앱 검증기 통과 ⑤ 워커 내장 사본 ⑥ 워커 끝에서 끝까지 ⑦ 웹 연결부 규약
const fs = require('fs'), path = require('path'), os = require('os');
const E = require('../engine/tabs'), screenCheck = require('./helpers/screen_check');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('ios-reference/index.html'), 'utf8');

// ── ② 웹 .bnav 대조 ──
{
  const nav = html.slice(html.indexOf('<nav class="bnav"'), html.indexOf('</nav>', html.indexOf('<nav class="bnav"')));
  const items = [...nav.matchAll(/<div class="ni[^"]*" id="ni-(\w+)"[^>]*>\s*<svg[^>]*><path d="([^"]+)"\/><\/svg>\s*<span>([^<]+)<\/span>/g)].map(m => ({ id: m[1], icon: m[2], label: m[3] }));
  ok(items.length === 5, '웹 탭 다섯 개를 찾았다 ' + items.length);
  ok(JSON.stringify(items.map(i => i.id)) === JSON.stringify(E.TABS_LIST.map(t => t.id)), '탭 순서가 웹과 같다 ' + items.map(i => i.id));
  items.forEach((w, i) => { const t = E.TABS_LIST[i]; ok(t && t.label === w.label, '글자 같음: ' + w.label); ok(t && t.icon === w.icon, '아이콘 같음: ' + w.id); });
}
// ── ① cap · ③ 켜진 칸·배지 ──
{
  ok(E.tabsScreen({ cap: 5 }, {}).ok === false && E.tabsScreen({}, {}).ok === false && E.tabsScreen(null, null).ok === false, 'cap 6 미만이면 만들지 않는다');
  const s = E.tabsScreen({ cap: 6 }, { tab: 'shop' });
  ok(s.ok && s.v === 1 && s.screen === 'tabs' && s.cover === 'tab' && s.head.length === 0 && s.body.length === 1 && s.body[0].t === 'tabbar' && s.body[0].h === 56 && /^t1:/.test(s.rev), '기본 모양');
  const it = s.body[0].items;
  ok(it.length === 5 && it.filter(x => x.on).length === 1 && it[3].on && it.every((x, i) => x.act.a === 'call' && x.act.v === 'tab.' + E.TABS_LIST[i].id), '켜진 칸 하나 · 행동 tab.<이름>');
  ok(E.tabsScreen({ cap: 6 }, { tab: '없는탭' }).info.tab === 'home' && E.tabsScreen({ cap: 6 }, null).info.tab === 'home', '모르는 탭은 홈');
  const b = E.tabsScreen({ cap: 6 }, { tab: 'home', badge: { community: 3, food: 25, shop: 0, map: -1, home: 'x' } }).body[0].items;
  ok(b[0].badge === '3' && b[4].badge === '9+' && b[3].badge === undefined && b[1].badge === undefined && b[2].badge === undefined, '배지: 양수만 · 10 이상은 9+');
  ok(E.tabsScreen({ cap: 6 }, { tab: 'shop' }).rev === s.rev && E.tabsScreen({ cap: 6 }, { tab: 'food' }).rev !== s.rev, '같은 입력 → 같은 rev, 켜진 칸이 다르면 다름');
}
// ── ④ 앱 검증기 ──
{
  const sc = E.TABS_LIST.map(t => E.tabsScreen({ cap: 6 }, { tab: t.id, badge: { community: 12 } }));
  const r = screenCheck(sc);
  ok(!r.err && r.out.length === sc.length && r.out.every(l => l.startsWith('OK ')), '모든 화면이 앱 검증기를 통과 ' + (r.err || r.out.filter(l => !l.startsWith('OK ')).join('|')));
  ok(r.out.every(l => Number(l.split(' ')[2]) === 0), '건너뛴 노드 없음');
}
// ── ⑤ 워커 내장 ──
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  const ms = '// ===== TABS ENGINE BEGIN =====', me = '// ===== TABS ENGINE END =====', i = w.indexOf(ms), j = w.indexOf(me);
  ok(i > 0 && j > i, '워커에 탭 엔진이 내장돼 있다');
  const esc = t => t.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  let src = fs.readFileSync(R('engine/tabs.js'), 'utf8'); src = src.slice(0, src.indexOf('if (typeof module')).trimEnd();
  const body = w.slice(i + ms.length, j);
  ok(body.indexOf(esc(src)) >= 0 && body.indexOf(esc(fs.readFileSync(R('engine/tabs-worker.js'), 'utf8').trimEnd())) >= 0, '워커 내장 사본이 소스와 같다');
  ok(w.indexOf('if (url.pathname === "/screen/tabs") return handleScreenTabs(request);') > 0, '경로 등록');
  ok(!/[^\x00-\x7f]/.test(body), '내장 블록은 ASCII 만');
  const other = w.slice(0, i) + w.slice(j);
  ok(['tabsScreen', 'tabsFacts', 'tabsHash', 'TABS_LIST', 'TABS_SCREEN_V', 'handleScreenTabs'].every(n => !new RegExp('^(async\\s+)?(function|var)\\s+' + n + '\\b', 'm').test(other)), '다른 엔진과 이름이 겹치지 않는다');
}
// ── ⑥ 워커 끝에서 끝까지 ──
// ── ⑦ s67: 한 요청으로 모든 탭 화면(alts) ──
{
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const f0 = { tab: 'home', badge: { community: 3, food: 12 } };
  const out = E.tabsScreens({ cap: 6 }, f0, 'tabs');
  ok(out.ok && Object.keys(out.alts).join() === 'community,map,home,shop,food', 'alts: 탭 다섯 개(엔진이 가진 탭 이름이 키)');
  Object.keys(out.alts).forEach(k => ok(same(out.alts[k], E.tabsScreen({ cap: 6 }, Object.assign({}, f0, { tab: k }))), 'alts[' + k + '] = 그 탭으로 따로 요청한 화면과 글자 하나까지 같다'));
  ok(E.tabsScreens({ cap: 6 }, f0).alts === undefined, 'alts 를 달라고 하지 않으면 없다');
  ok(E.tabsScreens({ cap: 5 }, f0, 'tabs').ok === false, 'cap 부족이면 alts 도 만들지 않는다');
  const ex = E.tabsScreens({ cap: 6 }, f0, { x: { tab: 'shop' }, y: 4 });
  ok(Object.keys(ex.alts).join() === 'x' && ex.alts.x.info.tab === 'shop', 'alts 직접 지정 · 이상한 항목은 건너뜀');
}
(async () => {
  const tmp = path.join(os.tmpdir(), 'rv2_tabs_' + process.pid + '.mjs');
  fs.copyFileSync(R('engine/route-v2-worker.ascii.js'), tmp);
  try {
    const w = (await import(tmp)).default, call = (u, init) => w.fetch(new Request(u, init), {}, { waitUntil() { } });
    const post = b => call('https://x/screen/tabs', { method: 'POST', body: b, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    const ra = await (await post(JSON.stringify({ cap: 6, f: { tab: 'map' }, alts: 'tabs' }))).json();
    ok(ra.ok && Object.keys(ra.alts).length === 5, '워커: alts 응답(탭 다섯 화면이 함께 온다)');
    const r = await post(JSON.stringify({ cap: 6, f: { tab: 'map' } })), j = await r.json();
    ok(r.status === 200 && j.ok && j.screen === 'tabs' && j.body[0].items[1].on && /route-v2-2026-10-\d\ds\d\d/.test(j.ver), '워커 응답 200 ' + j.ver);
    ok((await (await post(JSON.stringify({ cap: 5, f: {} }))).json()).ok === false, '워커: cap 부족이면 거절');
    ok((await post('{oops')).status === 400 && (await post('x'.repeat(20001))).status === 413 && (await call('https://x/screen/tabs')).status === 405, '워커: 깨진 본문 400 · 큰 본문 413 · GET 405');
    const ro = await call('https://x/screen/tabs', { method: 'OPTIONS' });
    ok(ro.status === 204 && r.headers.get('access-control-allow-origin') === '*' && /^(no-store|private, max-age=\d+)$/.test(r.headers.get('cache-control')), '워커: OPTIONS 204 · CORS · no-store');
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  // ── ⑦ 웹 연결부 규약 (연결부를 쓴 뒤에 켜진다 — 없으면 건너뜀) ──
  if (html.indexOf('window._scrTabs = {') >= 0) {
    const has = t => html.indexOf(t) >= 0;
    ok(has("'/screen/tabs'") && has('cap: 6'), '웹: 탭 연결부 + 엔진 주소 + 규격 수준 6');
    ok(has("/^tab\\.(\\w+)$/"), '웹: tab.<이름> 행동만 처리');
  }
  console.log(`tabs_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
