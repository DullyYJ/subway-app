// 게시판 화면 엔진(engine/board.js) 시험.  실행: node test/board_engine.test.js   (javac · java 필요)
//  ① cap 6 미만이면 만들지 않는다 ② '뉴스 글' 판정·'N분 전'이 웹 함수와 같다 ③ 거르기(뉴스·신고)·정렬·제목 다듬기·딱지·메타·번호 ④ 반응/삭제/신고 단추 ⑤ 댓글·답글·입력줄
//  ⑥ 더 보기·빈 상태 ⑦ 앱 검증기 통과 ⑧ 워커 내장 ⑨ 워커 끝에서 끝까지 ⑩ 웹 연결부 규약
process.env.TZ = 'Asia/Seoul';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const E = require('../engine/board'), screenCheck = require('./helpers/screen_check');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('www/index.html'), 'utf8');
const NOW = Date.UTC(2026, 9, 18, 3, 0, 0), MIN = 60000, HR = 3600000, DAY = 24 * HR;

// ── ② 웹 함수 대조 ──
{
  const grab = (re, label) => { const m = re.exec(html); ok(!!m, '웹에서 찾았다: ' + label); return m ? m[0] : ''; };
  const src = grab(/function _timeAgo\(ms\) \{[\s\S]*?\n\}\n/, '_timeAgo') + grab(/function _isNewsPost\(p\)\{[\s\S]*?\n\}\n/, '_isNewsPost');
  let cur = NOW;
  const ctx = { window: {}, Date: { now: () => cur }, console };
  vm.createContext(ctx);
  vm.runInContext(src + ';this.W={ago:_timeAgo,news:_isNewsPost}', ctx);
  [0, 10e3, 29e3, 31e3, 59e3, 61e3, 119e3, 121e3, 59 * MIN, 61 * MIN, 2 * HR, 2 * HR + 5 * MIN, 23 * HR + 59 * MIN, 25 * HR, 3 * DAY].forEach(d => ok(ctx.W.ago(NOW - d) === E.brdAgo(NOW - d, NOW), 'N분 전 같음: ' + d));
  const posts = [{ cat: '뉴스' }, { isNews: true }, { cat: '혼잡', link: 'https://news.example.com/a' }, { cat: '혼잡', link: 'https://example.com/press/1' }, { cat: '혼잡', link: 'https://example.com/a' }, { body: '출처 news.google.com 기사' }, { body: '[연합뉴스] 보도 내용' }, { body: '[아주아주긴출처이름이에요12345] 보도' }, { cat: '정보', body: '평범한 글' }, null, {}];
  posts.forEach(p => { const e = p ? { cat: p.cat, news: p.isNews, link: p.link, body: p.body } : p; ok(!!ctx.W.news(p) === !!E.brdIsNews(e), '뉴스 글 판정 같음: ' + JSON.stringify(p)); });
}
// 글 표본: [번호, 분류, 제목, 본문, 글쓴이, 시각, 조회, 좋아요, ㅋㅋ, ㅠㅠ, 서버 댓글 수, 표시비트, 링크, 댓글들]
const row = (id, o) => Object.assign([id, '혼잡', '제목 ' + id, '본문 ' + id, '빨간모자', NOW - 5 * MIN, 12, 3, 1, 0, 0, 2, '', []], o || {});
const ROWS = [
  row('a', { 2: '오늘 지하철 정말 붐비네요 (강남)', 5: NOW - 3 * MIN }),
  row('b', { 1: '일상', 2: '점심 뭐 먹지', 5: NOW - 1 * HR, 11: 1 }),
  row('c', { 1: '뉴스', 2: '뉴스 분류 글', 5: NOW }),
  row('d', { 2: '신고한 글', 5: NOW - 2 * MIN }),
  row('e', { 2: '뉴스 링크 글', 12: 'https://news.x.com/1', 5: NOW }),
  row('f', { 1: '', 2: '분류 없는 글', 5: NOW - 4 * HR - 20 * MIN, 11: 4 }),
  row('g', { 1: '지연', 2: '2호선 지연', 5: NOW - 10 * MIN, 10: 5, 13: [['k1', '출근러', '저도요', NOW - 8 * MIN, [['답글러', 'ㅋㅋ', NOW - 6 * MIN]]], ['k2', '', '먼저 단 글', NOW - 9 * MIN, []], ['k3', 'x', '', NOW, []]] }),
  row('h', { 2: '' }),                                  // 제목 없음 → 뺀다
  '이상한 줄', [123]
];
const post = o => o.body.filter(n => n.t === 'post');
const S = E.boardScreen({ cap: 6, now: NOW }, { rep: ['d'] }, ROWS);

// ── ① ③ ──
ok(E.boardScreen({ cap: 5, now: NOW }, {}, ROWS).ok === false && E.boardScreen({}, {}, ROWS).ok === false && E.boardScreen(null, null, null).ok === false, 'cap 6 미만이면 만들지 않는다');
ok(S.ok && S.v === 1 && S.screen === 'board' && S.cover === 'tab' && /^b1:/.test(S.rev) && S.head[0].t === 'bar' && S.head[0].title === '게시판' && S.head[0].btn === '글쓰기' && S.head[0].act.v === 'bd.write', '기본 모양 · 글쓰기 단추');
{
  const ps = post(S);
  ok(ps.length === 4, '뉴스 글 3개 · 신고한 글 · 제목 없는 글을 뺀다 ' + ps.map(p => p.title).join('|'));
  ok(ps.map(p => p.id).join() === 'pa,pg,pb,pf' && S.info.ids.join() === 'pa,pg,pb,pf', '최신순 정렬 + id');
  ok(S.info.idx.join() === '0,6,1,5' && S.info.all === 4 && S.info.n === 4, '번호 = 보낸 배열의 원래 위치 ' + JSON.stringify(S.info));
  ok(ps[0].title === '오늘 지하철 정말 붐비네요', '제목 끝 지역 괄호를 지운다 ' + ps[0].title);
  ok(ps[0].cat === '혼잡' && ps[0].catc === '#ff6b35' && ps[1].cat === '지연' && ps[1].catc === '#ff9f0a', '분류 딱지 색(웹과 같다)');
  const wc = html.slice(html.indexOf('var CAT_COLOR = {'), html.indexOf('};', html.indexOf('var CAT_COLOR = {')));
  Object.keys(E.BRD_CAT_COLOR).forEach(k => ok(wc.indexOf("'" + k + "'") >= 0 || wc.indexOf(k) >= 0, '웹 CAT_COLOR 에도 있다: ' + k));
  ok(ps[2].cat === undefined && ps[3].cat === undefined, '일상·빈 분류는 딱지를 숨긴다');
  ok(ps[0].meta === '3분 전 · 조회 12' && ps[1].meta === '10분 전 · 조회 12 · 댓글 5', '메타 줄: ' + ps[0].meta + ' / ' + ps[1].meta);
  ok(ps[3].meta.startsWith('전송 대기 · 4시간 20분 전'), '전송 대기 표시 ' + ps[3].meta);
  ok(ps[0].nick === '빨간모자', '글쓴이');
  const sparse = E.boardScreen({ cap: 6, now: NOW }, {}, [row('z', { 4: '  ' })]);
  ok(post(sparse)[0].nick === '익명', '글쓴이 없으면 익명');
  ok(E.boardScreen({ cap: 6, now: NOW }, {}, ROWS).rev !== S.rev && E.boardScreen({ cap: 6, now: NOW }, { rep: ['d'] }, ROWS).rev === S.rev, '같은 입력 → 같은 rev');
}
// ── ④ 단추 ──
{
  const kidsOf = (o, id) => post(o).find(p => p.id === id).kids, brow = (o, id) => kidsOf(o, id).find(k => k.t === 'btnrow').items;
  const a = brow(S, 'pa');
  ok(a.map(i => i.label).join() === '좋아요 3,ㅋㅋ 1,ㅠㅠ 0,신고' && a[0].act.v === 'bd.lk.0' && a[1].act.v === 'bd.lo.0' && a[2].act.v === 'bd.sd.0' && a[3].right && a[3].act.v === 'bd.rp.0', '이용자 글: 반응 3개 + 오른쪽 신고');
  const my = E.boardScreen({ cap: 6, now: NOW }, {}, [row('m', { 11: 1 | 2 })]);
  const m = brow(my, 'pm');
  ok(m[3].label === '삭제' && m[3].act.v === 'bd.dl.0', '내 글: 삭제 단추(신고 없음)');
  const sys = E.boardScreen({ cap: 6, now: NOW }, {}, [row('s', { 11: 0 })]);
  ok(brow(sys, 'ps').length === 3, '이용자 글이 아니면(자동 글) 오른쪽 단추 없음');
  const rx = brow(E.boardScreen({ cap: 6, now: NOW }, { rx: { a: { like: 1, sad: 1 } } }, ROWS), 'pa');
  ok(rx[0].on && rx[2].on && !rx[1].on && rx[0].tc === '#0a84ff' && /rgba\(10,132,255/.test(rx[0].fill), '누른 반응은 켜진 모양');
  const arm = brow(E.boardScreen({ cap: 6, now: NOW }, { arm: { k: 'rp', id: 'a' } }, ROWS), 'pa')[3];
  ok(arm.label === '신고 확인' && arm.tc === '#ff453a' && brow(E.boardScreen({ cap: 6, now: NOW }, { arm: { k: 'dl', id: 'a' } }, ROWS), 'pa')[3].label === '신고', '두 번 눌러 확정: 신고 확인(빨강) · 다른 종류는 그대로');
  const armM = brow(E.boardScreen({ cap: 6, now: NOW }, { arm: { k: 'dl', id: 'm' } }, [row('m', { 11: 3 })]), 'pm')[3];
  ok(armM.label === '삭제 확인', '삭제 확인');
}
// ── ⑤ 댓글·입력줄 ──
{
  const g = post(S).find(p => p.id === 'pg').kids;
  const cm = g.filter(k => k.t === 'cmt');
  ok(cm.length === 3 && cm[0].nick === '익명' && cm[0].s === '먼저 단 글' && cm[1].nick === '출근러' && cm[2].ind === true && cm[2].nick === '답글러', '댓글 시간순 · 닉네임 없으면 익명 · 빈 글 제외 · 답글은 들여쓰기');
  ok(cm[1].time === '8분 전' && cm[2].time === '6분 전', '댓글 시각 문구');
  ok(g.some(k => k.t === 'divider') && g[g.length - 1].t === 'inbar' && g[g.length - 1].key === 'c.g' && g[g.length - 1].act.v === 'bd.cm.6' && g[g.length - 1].btn === '등록', '구분선 + 입력줄(key c.<번호>, 행동 bd.cm.<원래 번호>)');
  const a = post(S).find(p => p.id === 'pa').kids;
  ok(a[0].t === 'text' && a[0].s === '본문 a' && !a.some(k => k.t === 'divider' || k.t === 'cmt'), '본문 + 단추 줄 + 입력줄(댓글 없으면 구분선 없음)');
  const ids = E.boardScreen({ cap: 6, now: NOW }, {}, [row('x y!'), row('x y!', { 2: '같은 번호' }), row('')]);
  const pids = post(ids).map(p => p.id);
  ok(pids.length === 3 && new Set(pids).size === 3 && pids.every(p => /^p[A-Za-z0-9_.:-]+$/.test(p)), '이상한 번호도 올바른 id 로 · 겹치면 구분 ' + pids);
}
// ── ⑥ 더 보기·빈 상태 ──
{
  const many = []; for (let i = 0; i < 100; i++) many.push(row('r' + i, { 5: NOW - i * MIN }));
  const s1 = E.boardScreen({ cap: 6, now: NOW }, {}, many), b1 = s1.body.find(n => n.t === 'button');
  ok(post(s1).length === 30 && b1 && b1.s === '더 보기 · 남은 글 70개' && b1.act.v === 'bd.more' && s1.info.all === 100, '30개씩 · 더 보기 단추');
  const s2 = E.boardScreen({ cap: 6, now: NOW }, { n: 60 }, many);
  ok(post(s2).length === 60 && s2.body.find(n => n.t === 'button').s === '더 보기 · 남은 글 40개', 'n 만큼 더');
  ok(post(E.boardScreen({ cap: 6, now: NOW }, { n: 999999 }, many)).length === 100 && !E.boardScreen({ cap: 6, now: NOW }, { n: 999999 }, many).body.some(n => n.t === 'button'), '다 보이면 더 보기 없음');
  const t = (f, rows) => E.boardScreen({ cap: 6, now: NOW }, f, rows).body.map(n => n.s || '').join('|');
  ok(t({}, []) === '아직 제보가 없습니다.\n첫 번째 제보자가 되어보세요!' && t({ st: 'loading' }, null) === '게시글 불러오는 중...', '빈 상태 문구(이모지 없이)');
  ok(E.boardScreen({ cap: 6, now: NOW }, {}, [row('n1', { 1: '뉴스' })]).info.all === 0, '뉴스 글만 있으면 빈 상태');
}
// ── ⑦ 앱 검증기 ──
{
  const sc = [S, E.boardScreen({ cap: 6, now: NOW }, {}, []), E.boardScreen({ cap: 6, now: NOW }, { rx: { a: { like: 1 } }, arm: { k: 'rp', id: 'a' } }, ROWS)];
  const many = []; for (let i = 0; i < 400; i++) many.push(row('r' + i, { 2: '아주 긴 제목 ' + '가나다라마바사'.repeat(8) + i, 3: '긴 본문 '.repeat(120), 13: [['c1', '닉', '댓글 '.repeat(30), NOW - MIN, [['답', '답글 '.repeat(20), NOW]]]] }));
  sc.push(E.boardScreen({ cap: 6, now: NOW }, { n: 300 }, many));
  const r = screenCheck(sc);
  ok(!r.err && r.out.length === sc.length && r.out.every(l => l.startsWith('OK ')), '모든 화면이 앱 검증기를 통과 ' + (r.err || r.out.filter(l => !l.startsWith('OK ')).slice(0, 3).join('|')));
  ok(r.out.every(l => Number(l.split(' ')[2]) === 0), '건너뛴 노드 없음');
}
// ── ⑧ 워커 내장 ──
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  const ms = '// ===== BOARD ENGINE BEGIN =====', me = '// ===== BOARD ENGINE END =====', i = w.indexOf(ms), j = w.indexOf(me);
  ok(i > 0 && j > i, '워커에 게시판 엔진이 내장돼 있다');
  const esc = t => t.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  let src = fs.readFileSync(R('engine/board.js'), 'utf8'); src = src.slice(0, src.indexOf('if (typeof module')).trimEnd();
  const body = w.slice(i + ms.length, j);
  ok(body.indexOf(esc(src)) >= 0 && body.indexOf(esc(fs.readFileSync(R('engine/board-worker.js'), 'utf8').trimEnd())) >= 0, '워커 내장 사본이 소스와 같다');
  ok(w.indexOf('if (url.pathname === "/screen/board") return handleScreenBoard(request);') > 0, '경로 등록');
  ok(!/[^\x00-\x7f]/.test(body), '내장 블록은 ASCII 만');
  const other = w.slice(0, i) + w.slice(j);
  const names = [...src.matchAll(/^(?:function|var)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]).concat(['handleScreenBoard']);
  ok(names.every(n => !new RegExp('^(async\\s+)?(function|var)\\s+' + n + '\\b', 'm').test(other)), '다른 엔진과 이름이 겹치지 않는다 (' + names.length + '개)');
}
// ── ⑨ 워커 끝에서 끝까지 ──
(async () => {
  const tmp = path.join(os.tmpdir(), 'rv2_board_' + process.pid + '.mjs');
  fs.copyFileSync(R('engine/route-v2-worker.ascii.js'), tmp);
  try {
    const w = (await import(tmp)).default, call = (u, init) => w.fetch(new Request(u, init), {}, { waitUntil() { } });
    const post_ = b => call('https://x/screen/board', { method: 'POST', body: b, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    const rows = ROWS.map(r => Array.isArray(r) && typeof r[5] === 'number' ? Object.assign([], r, { 5: Date.now() - 5 * MIN }) : r);
    const r = await post_(JSON.stringify({ cap: 6, f: { rep: ['d'] }, p: rows })), j = await r.json();
    ok(r.status === 200 && j.ok && j.screen === 'board' && post(j).length === 4 && /route-v2-2026-10-\d\ds\d\d/.test(j.ver), '워커 응답 200 ' + j.ver);
    ok((await (await post_(JSON.stringify({ cap: 5, f: {}, p: [] }))).json()).ok === false, '워커: cap 부족이면 거절');
    ok((await post_('{oops')).status === 400 && (await post_('x'.repeat(1500001))).status === 413 && (await call('https://x/screen/board')).status === 405, '워커: 깨진 본문 400 · 큰 본문 413 · GET 405');
    const ro = await call('https://x/screen/board', { method: 'OPTIONS' });
    ok(ro.status === 204 && /POST/.test(ro.headers.get('access-control-allow-methods')) && r.headers.get('access-control-allow-origin') === '*' && r.headers.get('cache-control') === 'no-store', '워커: OPTIONS 204 · CORS · no-store');
    const big = []; for (let i = 0; i < 400; i++) big.push(row('w' + i, { 3: '본문 '.repeat(100), 13: [['c', '닉', '댓글 '.repeat(20), Date.now(), []]] }));
    const body = JSON.stringify({ cap: 6, f: { n: 300 }, p: big }), t0 = Date.now(), rb = await post_(body), jb = await rb.json();
    ok(rb.status === 200 && jb.ok && Date.now() - t0 < 1500, '워커: 큰 목록(' + Math.round(body.length / 1024) + 'KB)도 빠르게 ' + (Date.now() - t0) + 'ms');
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  console.log(`board_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
