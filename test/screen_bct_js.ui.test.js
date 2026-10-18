// 서버 구동 네이티브 게시판·실시간소통·하단 탭 막대 ↔ 앱(JS) 연결 시험 — 2026-10-18
//   원칙: "계산은 엔진이, 그림은 앱이". 가짜 ScreenNative 플러그인 + 가짜 엔진(POST /screen/board|chat|tabs → engine/*.js 의 실제 출력)으로 확인한다:
//   · 플러그인이 없거나 스위치가 꺼져 있으면(기본) 예전 그대로 — 호출·요청이 하나도 없다 · 웹 게시판/채팅/탭이 그대로
//   · 켜면: 받아 둔 원자료(_AI_POSTS · _LIVE_TALK · 노선 방 대화 · 켜진 탭)와 상태를 엔진에 보내고(cap=6) 엔진 JSON 을 그대로 플러그인에 넘긴다 · 웹 목록은 만들지 않는다
//   · 행동: 펼침(tog) · 반응 · 두 번 눌러 신고/삭제 · 댓글 · 더 보기 · 글쓰기 / 칩 · 보내기 · 신고 / 탭 이동
//   · 폴백: 엔진이 죽으면 웹 화면
// 실행: node test/screen_bct_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const EB = require('../engine/board'), EC = require('../engine/chat'), ET = require('../engine/tabs');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 700)); } };
const NOW = Date.now(), MIN = 60000;
const POSTS = [
  { id: 101, cat: '혼잡', tag: '혼잡', title: '오늘 지하철 정말 붐비네요 (강남)', body: '출근길 2호선이 너무 붐벼요', nick: '빨간모자', time: NOW - 3 * MIN, views: 12, like: 3, lol: 1, sad: 0, cmts: [{ id: 'c1', nick: '출근러', text: '저도요', time: NOW - 2 * MIN, replies: [] }], user: true },
  { id: 102, cat: '일상', tag: '일상', title: '점심 뭐 먹지', body: '', nick: '배고픈', time: NOW - 10 * MIN, views: 5, like: 0, lol: 0, sad: 0, cmts: [], mine: true },
  { id: 103, cat: '뉴스', tag: '뉴스', title: '뉴스 글은 게시판에 안 나옴', body: 'x', nick: '기자', time: NOW - 1 * MIN, views: 1, like: 0, lol: 0, sad: 0, cmts: [] },
  { id: 104, cat: '정보', tag: '정보', title: '3호선 지연 정보', body: '안내 방송 참고', nick: '정보통', time: NOW - 30 * MIN, views: 40, like: 7, lol: 0, sad: 2, cmts: [], user: true }
];

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // opt: { plugin, on:{board,chat,tabs}, serve:'ok'|'down' }
  async function fresh(opt) {
    opt = opt || {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const x = { ctx, page, errs, reqs: { board: [], chat: [], tabs: [] }, serve: opt.serve || 'ok', posts: [], lroom: { ok: true, msgs: [], alert: null }, reports: [], lastBody: {} };
    await page.route('**/*', async r => {
      const u = new URL(r.request().url()), req = r.request();
      if (u.protocol === 'file:') return r.continue();
      const m = /^\/screen\/(board|chat|tabs)$/.exec(u.pathname);
      if (m && u.hostname.indexOf('route-v2') >= 0) {
        assert.strictEqual(req.method(), 'POST'); assert.ok(/text\/plain/.test(req.headers()['content-type'] || ''), '사전 요청이 필요한 형식으로 보냈다');
        const body = JSON.parse(req.postData() || '{}'); x.reqs[m[1]].push(body);
        if (x.serve === 'down') return r.abort();
        const out = JSON.stringify(m[1] === 'board' ? EB.boardScreen({ cap: Number(body.cap) || 0 }, body.f, body.p) : m[1] === 'chat' ? EC.chatScreen({ cap: Number(body.cap) || 0 }, body.f, body.d) : ET.tabsScreen({ cap: Number(body.cap) || 0 }, body.f));
        x.lastBody[m[1]] = out;
        return r.fulfill({ status: 200, contentType: 'application/json', body: out });
      }
      if (u.pathname === '/lroom') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x.lroom) });
      if (u.pathname === '/lreport') { x.reports.push(req.postData()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
      if (u.pathname === '/line-notices') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, lines: {} }) });
      return r.abort();
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try {
        localStorage.setItem('locDisc', '1');
        const on = o.on || {}; if (on.board) localStorage.setItem('gdm_scrb_on', '1'); if (on.chat) localStorage.setItem('gdm_scrc_on', '1'); if (on.tabs) localStorage.setItem('gdm_scrt_on', '1');
      } catch (e) {}
      window.__sn = []; window.__snL = {};
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const put = (m) => (a) => { window.__sn.push({ m, a: JSON.parse(JSON.stringify(a)) }); if (a.json != null) { try { const j = JSON.parse(a.json); if (j.v !== 1 || !Array.isArray(j.body)) throw 0; } catch (e) { return Promise.reject(new Error('invalid: 규격')); } } return Promise.resolve(); };
        const rec = (m) => (a) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { ScreenNative: {
          show: put('show'), update: put('update'), setRect: rec('setRect'), hide: rec('hide'), destroy: rec('destroy'), toast: rec('toast'), setField: rec('setField'),
          status: () => Promise.resolve({ visible: true, items: 10, age: 20, scroll: 0 }),
          addListener: (n, f) => { (window.__snL[n] = window.__snL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.goto('file://' + html); await page.waitForTimeout(2200);
    await page.addStyleTag({ content: '#locDiscOv{display:none !important}' });
    await page.evaluate(() => { const ov = document.getElementById('locDiscOv'); if (ov) ov.remove(); });
    // 결정적으로: 웹이 스스로 글을 받아 오는 일은 막고(시험이 직접 놓는다)
    await page.evaluate(() => { window._loadServerPosts = function () {}; window.__wr = []; window.openWriteSheet = function () { window.__wr.push(1); }; window._bwPost = function (p, d, cb) { (window.__bw = window.__bw || []).push([p, d]); cb({ ok: true }); }; });
    return x;
  }
  const calls = (x, m, id) => x.page.evaluate(([m, id]) => window.__sn.filter(c => (!m || c.m === m) && (!id || (c.a && c.a.id === id))), [m, id || null]);
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__snEmit(n, d), [n, d || {}]);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await x.page.waitForTimeout(60); } return false; };
  const puts = (x, id) => async () => (await calls(x, 'show', id)).length + (await calls(x, 'update', id)).length;
  const hasPut = (x, id, n) => async () => (await puts(x, id)()) >= (n || 1);
  const lastPut = async (x, id) => { const c = (await calls(x, null, id)).filter(c => c.m === 'show' || c.m === 'update'); return c[c.length - 1]; };
  const act = (x, id, d) => emit(x, 'action', Object.assign({ id }, d));
  const setPosts = (x, posts) => x.page.evaluate((p) => { window._commNeedRefresh = false; _AI_POSTS = p.map(o => Object.assign({}, o)); }, posts || POSTS);
  const openBoard = (x) => x.page.evaluate(() => { switchTab('community', document.getElementById('ni-community')); filterCat(document.getElementById('chipBoard'), 'all'); });
  const openChat = (x) => x.page.evaluate(() => { switchTab('community', document.getElementById('ni-community')); showChatTab(document.getElementById('chipLiveTalk')); });
  const S = (x, k) => x.page.evaluate((k) => { const s = window[k].S; return { shown: s.shown, ready: s.ready, good: s.good, failed: s.failed, fails: s.fails, why: s.why }; }, k);

  console.log('[① 플러그인이 없거나 꺼져 있으면 예전 그대로]');
  await t('플러그인이 없으면: 요청도 호출도 없다 · 설정 카드 3개도 안 보인다 · 웹 게시판이 그려진다', async () => {
    const x = await fresh({ plugin: false, on: { board: 1, chat: 1, tabs: 1 } }); await setPosts(x); await openBoard(x); await x.page.waitForTimeout(1500);
    for (const c of ['scrbSetCard', 'scrcSetCard', 'scrtSetCard']) assert.strictEqual(await x.page.evaluate((c) => getComputedStyle(document.getElementById(c)).display, c), 'none');
    assert.strictEqual(x.reqs.board.length + x.reqs.chat.length + x.reqs.tabs.length, 0);
    assert.ok(await x.page.evaluate(() => document.querySelectorAll('#commList .dc-post').length) >= 3, '웹 게시판이 안 그려졌다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('플러그인이 있어도 꺼져 있으면(기본): 호출·요청 없음 · 카드 3개는 보이고 스위치는 꺼짐 · 웹 게시판 그대로', async () => {
    const x = await fresh({ plugin: true, on: {} }); await setPosts(x); await openBoard(x); await x.page.waitForTimeout(1800);
    assert.strictEqual((await calls(x)).length, 0); assert.strictEqual(x.reqs.board.length + x.reqs.chat.length + x.reqs.tabs.length, 0);
    const c = await x.page.evaluate(() => ['scrb', 'scrc', 'scrt'].map(k => ({ d: getComputedStyle(document.getElementById(k + 'SetCard')).display, on: document.getElementById(k + 'SetOn').checked, s: document.getElementById(k + 'SetStat').textContent })));
    c.forEach(k => { assert.strictEqual(k.d, 'block'); assert.strictEqual(k.on, false); assert.ok(/꺼짐/.test(k.s), k.s); });
    assert.ok(await x.page.evaluate(() => document.querySelectorAll('#commList .dc-post').length) >= 3);
    assert.strictEqual(await x.page.evaluate(() => window._scrBoard.owns() || window._scrChat.owns() || window._scrTabs.owns()), false);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  console.log('[② 게시판]');
  const A = await fresh({ plugin: true, on: { board: 1 } });
  await setPosts(A); await openBoard(A);
  await t('원자료(글 4개)와 상태를 엔진에 보내고(cap=6) 받은 글을 한 글자도 안 고치고 show · 사각형은 칩 줄 아래부터 · 웹 글 목록은 비움', async () => {
    assert.ok(await waitFor(A, hasPut(A, 'board')), 'show 가 없다');
    const q = A.reqs.board[A.reqs.board.length - 1];
    assert.strictEqual(q.cap, 6); assert.strictEqual(q.f.n, 30); assert.strictEqual(q.f.st, 'ready'); assert.strictEqual(q.p.length, 4);
    assert.deepStrictEqual(q.p[0].slice(0, 5), ['101', '혼잡', '오늘 지하철 정말 붐비네요 (강남)', '출근길 2호선이 너무 붐벼요', '빨간모자']);
    assert.strictEqual(q.p[0][11], 2, '이용자 글 표시비트'); assert.strictEqual(q.p[1][11], 1, '내 글 표시비트');
    assert.deepStrictEqual(q.p[0][13][0].slice(0, 4).map(String).slice(0, 3), ['c1', '출근러', '저도요']);
    const c = await lastPut(A, 'board');
    assert.strictEqual(c.m, 'show'); assert.strictEqual(c.a.json, A.lastBody.board); // 한 글자도 안 고침
    const geo = await A.page.evaluate(() => { const f = document.getElementById('filterRow').getBoundingClientRect(), tb = document.getElementById('tab-community').getBoundingClientRect(); return { top: f.bottom, bottom: tb.bottom }; });
    assert.ok(Math.abs(c.a.y - geo.top) < 1.5 && Math.abs(c.a.y + c.a.h - geo.bottom) < 1.5, '사각형 ' + JSON.stringify([c.a.y, c.a.h, geo]));
    assert.ok(c.a.palette && c.a.palette.card2 && c.a.palette.nav, '팔레트에 card2·nav');
    assert.strictEqual(await A.page.evaluate(() => document.querySelectorAll('#commList .dc-post').length), 0, '웹 글 목록은 비운다');
    const j = JSON.parse(c.a.json); assert.deepStrictEqual(j.info.ids.length, 3, '뉴스 글은 빠졌다');
    assert.deepStrictEqual(A.errs, []);
  });
  await t('펼침(tog): 조회수가 오르고 웹 열림 기록이 맞춰지고, 접으면 기록이 지워진다', async () => {
    const j = JSON.parse(A.lastBody.board), pid = j.info.ids[0];
    const before = A.reqs.board.length;
    await act(A, 'board', { a: 'tog', v: pid, on: true });
    assert.ok(await waitFor(A, async () => A.reqs.board.length > before), '조회수 바뀐 새 요청이 없다');
    const v = await A.page.evaluate(() => ({ views: _AI_POSTS.find(p => p.id === 101).views, open: Object.assign({}, window._commOpenPosts) }));
    assert.strictEqual(v.views, 13); assert.ok(v.open[101]);
    await act(A, 'board', { a: 'tog', v: pid, on: false });
    assert.strictEqual(await A.page.evaluate(() => !!(window._commOpenPosts || {})[101]), false);
  });
  await t('반응(bd.lk): 누르면 글의 좋아요가 오르고 엔진에 반응 표시를 보낸다 · 다시 누르면 취소', async () => {
    const before = A.reqs.board.length;
    await act(A, 'board', { a: 'call', v: 'bd.lk.0' });
    assert.ok(await waitFor(A, async () => A.reqs.board.length > before));
    const q = A.reqs.board[A.reqs.board.length - 1];
    assert.deepStrictEqual(q.f.rx, { '101': { like: 1 } }); assert.strictEqual(q.p[0][7], 4);
    const j = JSON.parse(A.lastBody.board); assert.ok(JSON.stringify(j.body).indexOf('"on":true') > 0, '켜진 단추');
    const b2 = A.reqs.board.length;
    await act(A, 'board', { a: 'call', v: 'bd.lk.0' });
    assert.ok(await waitFor(A, async () => A.reqs.board.length > b2));
    assert.strictEqual(await A.page.evaluate(() => _AI_POSTS.find(p => p.id === 101).like), 3);
  });
  await t('댓글(bd.cm): 입력줄 글자로 댓글이 등록되고 입력칸이 비워진다 · 아이디가 없으면 안내만(글자는 그대로)', async () => {
    await A.page.evaluate(() => { _safeLS.set('mk_comm_id', ''); });
    const j = JSON.parse(A.lastBody.board), key = 'c.' + j.info.ids[0].slice(1);
    await act(A, 'board', { a: 'call', v: 'bd.cm.0', fields: { [key]: '공감해요' } });
    await A.page.waitForTimeout(300);
    assert.strictEqual(await A.page.evaluate(() => _AI_POSTS.find(p => p.id === 101).cmts.length), 1, '아이디 없이 등록되면 안 됨');
    assert.strictEqual((await calls(A, 'setField', 'board')).length, 0);
    await A.page.evaluate(() => { _safeLS.set('mk_comm_id', '테스터'); window._serverPostComment = function () {}; });
    const before = A.reqs.board.length;
    await act(A, 'board', { a: 'call', v: 'bd.cm.0', fields: { [key]: '공감해요' } });
    assert.ok(await waitFor(A, async () => (await calls(A, 'setField', 'board')).length > 0), '입력칸 비우기 호출이 없다');
    const sf = (await calls(A, 'setField', 'board'))[0].a; assert.strictEqual(sf.key, key); assert.strictEqual(sf.value, '');
    assert.ok(await waitFor(A, async () => A.reqs.board.length > before));
    const cm = await A.page.evaluate(() => _AI_POSTS.find(p => p.id === 101).cmts.map(c => [c.nick, c.text]));
    assert.deepStrictEqual(cm[cm.length - 1], ['테스터', '공감해요']);
    const q = A.reqs.board[A.reqs.board.length - 1]; assert.strictEqual(q.p[0][13].length, 2);
  });
  await t('신고는 두 번 눌러야 한다: 첫 번째는 대기 표시만, 두 번째에 웹 신고 처리(서버 /report) · 글이 사라진다', async () => {
    await act(A, 'board', { a: 'call', v: 'bd.rp.0' });
    assert.ok(await waitFor(A, async () => { const q = A.reqs.board[A.reqs.board.length - 1]; return q.f.arm && q.f.arm.k === 'rp'; }));
    assert.strictEqual(await A.page.evaluate(() => _AI_POSTS.length), 4, '아직 안 지워졌다');
    const before = A.reqs.board.length;
    await act(A, 'board', { a: 'call', v: 'bd.rp.0' });
    assert.ok(await waitFor(A, async () => A.reqs.board.length > before));
    assert.strictEqual(await A.page.evaluate(() => _AI_POSTS.some(p => p.id === 101)), false);
    assert.deepStrictEqual(await A.page.evaluate(() => window.__bw.map(c => c[0])), ['/report']);
    const q = A.reqs.board[A.reqs.board.length - 1]; assert.ok(q.f.rep.indexOf('101') >= 0); assert.strictEqual(q.f.arm, null);
  });
  await t('더 보기 · 글쓰기', async () => {
    await act(A, 'board', { a: 'call', v: 'bd.write' });
    assert.strictEqual(await A.page.evaluate(() => window.__wr.length), 1);
    const before = A.reqs.board.length;
    await act(A, 'board', { a: 'call', v: 'bd.more' });
    assert.ok(await waitFor(A, async () => A.reqs.board.length > before)); assert.strictEqual(A.reqs.board[A.reqs.board.length - 1].f.n, 60);
  });
  await t('다른 칩(뉴스)으로 가면 숨기고, 돌아오면 다시 올린다', async () => {
    await A.page.evaluate(() => filterCat(document.querySelector('#filterRow .chip[onclick*="뉴스"]'), '뉴스'));
    assert.ok(await waitFor(A, async () => (await calls(A, 'hide', 'board')).length > 0), 'hide 가 없다');
    const n = (await calls(A, 'show', 'board')).length + (await calls(A, 'update', 'board')).length;
    await openBoard(A);
    assert.ok(await waitFor(A, async () => (await calls(A, 'show', 'board')).length + (await calls(A, 'update', 'board')).length > n), '다시 안 올렸다');
    assert.deepStrictEqual(A.errs, []);
  });
  await A.ctx.close();

  console.log('[③ 실시간소통]');
  const C = await fresh({ plugin: true, on: { chat: 1 } });
  await C.page.evaluate((n) => { _LIVE_TALK.length = 0; _LIVE_TALK.push({ nick: '빨간모자', text: '안녕하세요', time: n - 5 * 60000, mine: false, line: '2호선' }, { nick: '파란모자', text: '출근 힘드네요', time: n - 4 * 60000, mine: false }); _safeLS.set('mk_comm_id', '테스터'); }, NOW);
  await openChat(C);
  await t('전체 방: 대화 원자료·상태를 보내고(cap=6) 받은 글을 그대로 show · 웹 채팅 칩 줄은 숨긴다', async () => {
    assert.ok(await waitFor(C, hasPut(C, 'chat')), 'show 가 없다');
    const q = C.reqs.chat[C.reqs.chat.length - 1];
    assert.strictEqual(q.cap, 6); assert.strictEqual(q.f.sel, 'all'); assert.strictEqual(q.f.me, '테스터'); assert.strictEqual(q.f.tzo, -540);
    assert.deepStrictEqual(q.d.g[0], ['빨간모자', '안녕하세요', NOW - 5 * MIN, 0, '2호선']);
    assert.ok(Array.isArray(q.f.mine) && q.f.lc && /^#[0-9a-f]{6}$/i.test(q.f.lc['2호선']), '노선 색 ' + JSON.stringify(q.f.lc));
    const c = await lastPut(C, 'chat'); assert.strictEqual(c.a.json, C.lastBody.chat);
    assert.strictEqual(await C.page.evaluate(() => getComputedStyle(document.getElementById('chatLineBar')).display), 'none');
    const j = JSON.parse(c.a.json); assert.strictEqual(j.anchor, 'bottom'); assert.strictEqual(j.foot[0].key, 'chat.all');
    assert.deepStrictEqual(C.errs, []);
  });
  await t('보내기(ch.send): 커뮤니티 아이디·욕설 검사를 거쳐 대화에 올라가고 입력칸이 비워진다 · 새 화면에 내 글이 보인다', async () => {
    const before = C.reqs.chat.length;
    await act(C, 'chat', { a: 'call', v: 'ch.send', fields: { 'chat.all': '지금 2호선 사람 많아요' } });
    assert.ok(await waitFor(C, async () => (await calls(C, 'setField', 'chat')).length > 0), 'setField 가 없다');
    assert.strictEqual((await calls(C, 'setField', 'chat'))[0].a.key, 'chat.all');
    assert.ok(await waitFor(C, async () => C.reqs.chat.length > before));
    assert.ok(await waitFor(C, async () => /지금 2호선 사람 많아요/.test(C.lastBody.chat)));
    assert.ok(JSON.parse(C.lastBody.chat).body.some(n => n.t === 'msg' && n.mine));
    await act(C, 'chat', { a: 'call', v: 'ch.send', fields: { 'chat.all': '시발' } });
    await C.page.waitForTimeout(300);
    assert.strictEqual(await C.page.evaluate(() => _LIVE_TALK.filter(m => m.text === '시발').length), 0, '욕설은 올라가면 안 됨');
  });
  await t('칩(cat 2호선): 웹이 방을 열고(_lroom 폴링) 받은 글·지연 제보를 엔진에 보낸다 · 신고(ch.x)는 숨김 목록에 넣고 서버에 알린다', async () => {
    C.lroom = { ok: true, msgs: [{ id: 'm1', ts: NOW - 3 * MIN, nick: '출근러', text: '지금 지연이에요', kind: 'delay' }, { id: 'm2', ts: NOW - 2 * MIN, nick: '다른이', text: '저도요', kind: '' }], alert: { reporters: 4, stations: [{ stn: '강남', n: 4 }] } };
    const before = C.reqs.chat.length;
    await act(C, 'chat', { a: 'cat', v: '2호선' });
    assert.strictEqual(await C.page.evaluate(() => window._chatSel), '2호선');
    assert.ok(await waitFor(C, async () => { const q = C.reqs.chat[C.reqs.chat.length - 1]; return q.f.sel === '2호선' && q.d.r && q.d.r.length === 2; }), '방 대화가 안 갔다');
    const q = C.reqs.chat[C.reqs.chat.length - 1];
    assert.strictEqual(q.d.al.reporters, 4); assert.deepStrictEqual(q.d.r[0], ['m1', NOW - 3 * MIN, '출근러', '지금 지연이에요', 'delay']);
    assert.ok(await waitFor(C, async () => q.d.offOk === 1 || C.reqs.chat[C.reqs.chat.length - 1].d.offOk === 1), '공식 공지 조회 결과가 안 갔다');
    const j = JSON.parse(C.lastBody.chat); assert.ok(j.head.some(n => n.t === 'box'), '배너'); assert.strictEqual(j.foot[0].key, 'chat.room');
    await C.page.evaluate(() => { window.confirm = () => true; });
    const idx = j.body.filter(n => n.t === 'msg' && n.act).map(n => n.act.v)[0]; assert.ok(/^ch\.x\.\d+$/.test(idx), idx);
    await act(C, 'chat', { a: 'call', v: idx });
    assert.ok(await waitFor(C, async () => C.reports.length > 0), '/lreport 가 안 갔다');
    assert.ok(await waitFor(C, async () => C.reqs.chat[C.reqs.chat.length - 1].f.hid.length > 0), '숨김 목록이 안 갔다');
  });
  await t('방에서 글 보내기(ch.send): /react 로 올라가고(서버 응답 stored) 성공하면 입력칸을 비운다', async () => {
    await C.page.route('**/react', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"stored":true}' }));
    await act(C, 'chat', { a: 'call', v: 'ch.send', fields: { 'chat.room': '지금 타고 있어요' } });
    assert.ok(await waitFor(C, async () => (await calls(C, 'setField', 'chat')).some(c => c.a.key === 'chat.room' && c.a.value === '')), '방 입력칸 비우기가 없다');
  });
  await t('모르는 칩 이름은 무시한다', async () => {
    await act(C, 'chat', { a: 'cat', v: '없는호선' });
    assert.strictEqual(await C.page.evaluate(() => window._chatSel), '2호선');
  });
  await C.ctx.close();

  console.log('[④ 하단 탭 막대]');
  const T = await fresh({ plugin: true, on: { tabs: 1 } });
  await t('켜진 탭을 엔진에 보내고(cap=6) 받은 글을 그대로 show · 사각형은 웹 탭 막대 자리', async () => {
    assert.ok(await waitFor(T, hasPut(T, 'tabs')), 'show 가 없다');
    const q = T.reqs.tabs[T.reqs.tabs.length - 1]; assert.strictEqual(q.cap, 6); assert.strictEqual(q.f.tab, 'home');
    const c = await lastPut(T, 'tabs'); assert.strictEqual(c.a.json, T.lastBody.tabs);
    const g = await T.page.evaluate(() => { const r = document.querySelector('.bnav').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    assert.ok(Math.abs(c.a.y - g.y) < 1.5 && Math.abs(c.a.h - g.h) < 1.5 && Math.abs(c.a.w - g.w) < 1.5, '사각형 ' + JSON.stringify([c.a.x, c.a.y, c.a.w, c.a.h, g]));
    assert.deepStrictEqual(T.errs, []);
  });
  await t('칸을 누르면(tab.shop) 웹이 탭을 바꾸고 새 화면(켜진 칸 shop)을 받는다 · 모르는 탭 이름은 무시', async () => {
    const before = T.reqs.tabs.length;
    await act(T, 'tabs', { a: 'call', v: 'tab.shop' });
    assert.ok(await waitFor(T, async () => T.reqs.tabs.length > before && T.reqs.tabs[T.reqs.tabs.length - 1].f.tab === 'shop'), '새 요청이 없다');
    assert.strictEqual(await T.page.evaluate(() => document.getElementById('ni-shop').classList.contains('on')), true);
    await act(T, 'tabs', { a: 'call', v: 'tab.evil' });
    assert.strictEqual(await T.page.evaluate(() => document.querySelectorAll('.bnav .ni.on').length), 1);
  });
  await T.ctx.close();

  console.log('[⑤ 폴백]');
  await t('엔진이 죽으면(오류) 5초 안에 웹 게시판으로 돌아가지는 않아도 네이티브가 켜지지 않고 웹 목록이 남는다', async () => {
    const x = await fresh({ plugin: true, on: { board: 1 }, serve: 'down' }); await setPosts(x); await openBoard(x); await x.page.waitForTimeout(2500);
    assert.strictEqual((await calls(x, 'show')).length, 0);
    assert.strictEqual(await x.page.evaluate(() => window._scrBoard.owns()), false);
    assert.ok(await x.page.evaluate(() => document.querySelectorAll('#commList .dc-post').length) >= 3, '웹 목록이 안 남았다');
    await x.ctx.close();
  });
  await t('설정 스위치를 켜고 끄면: 켜면 네이티브로 · 끄면 destroy 하고 웹 게시판이 다시 그려진다', async () => {
    const x = await fresh({ plugin: true, on: {} }); await setPosts(x); await openBoard(x); await x.page.waitForTimeout(800);
    await x.page.evaluate(() => _scrbSetUse(true));
    assert.ok(await waitFor(x, hasPut(x, 'board')), '켰는데 show 가 없다');
    await x.page.evaluate(() => _scrbSetUse(false));
    assert.ok(await waitFor(x, async () => (await calls(x, 'destroy', 'board')).length > 0), 'destroy 가 없다');
    assert.ok(await waitFor(x, async () => (await x.page.evaluate(() => document.querySelectorAll('#commList .dc-post').length)) >= 3), '웹 목록이 안 돌아왔다');
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scrb_on')), '0');
    await x.ctx.close();
  });
  await t('플러그인 오류(error 이벤트) → 웹 화면으로 돌아가고 카드에 사유가 보인다', async () => {
    const x = await fresh({ plugin: true, on: { board: 1 } }); await setPosts(x); await openBoard(x);
    assert.ok(await waitFor(x, hasPut(x, 'board')));
    await emit(x, 'error', { id: 'board', message: 'boom', kind: 'native' });
    assert.ok(await waitFor(x, async () => (await S(x, '_scrBoard')).failed));
    assert.ok(await waitFor(x, async () => (await x.page.evaluate(() => document.querySelectorAll('#commList .dc-post').length)) >= 3), '웹 목록이 안 돌아왔다');
    assert.ok(/문제가 있어/.test(await x.page.evaluate(() => document.getElementById('scrbSetStat').textContent)));
    await x.ctx.close();
  });

  await b.close();
  console.log(`\nscreen_bct_js: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
