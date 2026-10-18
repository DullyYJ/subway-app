// 서버 구동 네이티브 뉴스 화면 ↔ 앱(JS) 연결 시험 — 2026-10-18
//   원칙: "계산은 엔진이, 그림은 앱이". 가짜 ScreenNative 플러그인 + 가짜 엔진(POST /screen/news → engine/news.js 의 실제 출력)으로 확인한다:
//   · 플러그인이 없거나 설정이 꺼져 있으면(기본) 예전 그대로 — 플러그인 호출·요청이 하나도 없다 · 웹 뉴스 목록이 그려진다
//   · 켜면: 받아 둔 기사 목록과 고른 칩을 엔진에 보내고(cap=5), 엔진이 준 JSON 글을 한 글자도 안 고치고 플러그인에 넘긴다 · 사각형은 커뮤니티 칩 줄 아래부터 · 웹 뉴스 목록은 만들지 않는다
//   · 행동: 칩(cat) → 고른 칩이 바뀌고 새 화면 · 기사(call nw.N) → 엔진에 상세 문구를 묻고 그 글로 팝업 · 뒤로가기는 팝업부터
//   · 폴백: 엔진 응답이 틀리거나 죽으면 웹 화면 · 플러그인 오류 → 웹 · 저장본은 곧바로 쓰되 눌리지 않는다
// 실행: node test/screen_news_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const E = require('../engine/news');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 700)); } };
const NOW = Date.now(), MIN = 60000, HR = 3600000;
const ITEMS = [
  { title: '코스피 2,700 돌파', link: 'https://a.example/1', source: '연합뉴스', ts: NOW - 5 * MIN, desc: '(서울=연합뉴스) 홍길동 기자 = 코스피가 2,700 선을 넘어서며 마감했다고 밝혔다.' },
  { title: '손흥민 시즌 10호골', link: 'https://a.example/2', source: '', ts: NOW - HR, desc: '' },
  { title: '아이유 새 앨범 컴백', link: 'https://a.example/3', source: '', ts: NOW - 2 * HR, desc: '' },
  { title: '기준금리 동결', link: 'https://a.example/4', source: '뉴시스', ts: NOW - 3 * HR, desc: '' },
  { title: '화재 사고 발생', link: 'https://a.example/5', source: '', ts: NOW - 4 * HR, desc: '' }
];

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // opt: { plugin, on, cache:{cat,txt}, serve:'ok'|'shape'|'down', delay, detail:'ok'|'down' }
  async function fresh(opt, ctxIn) {
    opt = opt || {};
    const ctx = ctxIn || await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const x = { ctx, page, errs, reqs: [], dreqs: [], serve: opt.serve || 'ok', delay: opt.delay || 0, detail: opt.detail || 'ok' };
    await page.route('**/*', async r => {
      const u = new URL(r.request().url());
      if (u.protocol === 'file:') return r.continue();
      if (u.pathname === '/screen/news') {
        const req = r.request();
        assert.strictEqual(req.method(), 'POST'); assert.ok(/text\/plain/.test(req.headers()['content-type'] || ''), '사전 요청이 필요한 형식으로 보냈다');
        const body = JSON.parse(req.postData() || '{}');
        if (body.d !== undefined) {
          x.dreqs.push(body);
          if (x.detail === 'down') return r.abort();
          return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(E.newsDetail({ cap: Number(body.cap) || 0 }, body.d)) });
        }
        x.reqs.push(body); x.lastReq = body;
        if (x.delay) await new Promise(res => setTimeout(res, x.delay));
        if (x.serve === 'down') return r.abort();
        let out = JSON.stringify(E.newsScreen({ cap: Number(body.cap) || 0 }, body.f, body.n));
        if (x.serve === 'shape') out = JSON.stringify({ ok: true, v: 2, screen: 'news' });
        x.lastBody = out;
        return r.fulfill({ status: 200, contentType: 'application/json', body: out });
      }
      return r.abort();
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try {
        localStorage.setItem('locDisc', '1'); if (o.on) localStorage.setItem('gdm_scrn_on', '1');
        if (o.cache) localStorage.setItem('gdm_scrn_c', JSON.stringify({ ts: Date.now(), cat: o.cache.cat, rev: 'old', txt: o.cache.txt }));
      } catch (e) {}
      window.__sn = []; window.__snL = {};
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const rec = (m, a, ret) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(ret); };
        const check = (a) => {
          if (a.json == null) return null;
          try { const j = JSON.parse(a.json); if (j.v !== 1 || !Array.isArray(j.body)) return 'invalid: 규격'; } catch (e) { return 'invalid: JSON'; }
          return null;
        };
        const put = (m) => (a) => { window.__sn.push({ m, a: JSON.parse(JSON.stringify(a)) }); const bad = check(a); if (bad) { setTimeout(() => window.__snEmit('error', { id: 'news', message: bad, kind: 'invalid' }), 5); return Promise.reject(new Error(bad)); } return Promise.resolve(); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { ScreenNative: {
          show: put('show'), update: put('update'),
          setRect: (a) => rec('setRect', a), hide: (a) => rec('hide', a), destroy: (a) => rec('destroy', a), toast: (a) => rec('toast', a),
          status: () => Promise.resolve({ visible: true, items: 10, age: 20, scroll: 0 }),
          addListener: (n, f) => { (window.__snL[n] = window.__snL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.goto('file://' + html); await page.waitForTimeout(2200);
    await page.addStyleTag({ content: '#locDiscOv{display:none !important}' });
    await page.evaluate(() => { const ov = document.getElementById('locDiscOv'); if (ov) ov.remove(); });
    // 결정적으로: 웹이 스스로 기사를 받아 오는 일은 막고(시험이 기사를 직접 놓는다), 원문 열기는 기록만 한다
    await page.evaluate(() => { window._fetchNewsFeed = function (cb) { if (cb) cb(); }; window._fetchNewsFromServer = function (cb) { if (cb) cb(false); }; window.__open = []; window._newsOpenInApp = function (u, s) { window.__open.push([u, s]); }; });
    return x;
  }
  const calls = (x, m) => x.page.evaluate((m) => window.__sn.filter(c => !m || c.m === m), m);
  const clear = (x) => x.page.evaluate(() => { window.__sn.length = 0; });
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__snEmit(n, d), [n, d || {}]);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await x.page.waitForTimeout(60); } return false; };
  const has = (x, m, n) => async () => (await calls(x, m)).length >= (n || 1);
  const last = async (x, m) => { const c = await calls(x, m); return c[c.length - 1]; };
  const anyPut = (x) => async () => (await calls(x, 'show')).length + (await calls(x, 'update')).length > 0;
  const st = (x) => x.page.evaluate(() => { const S = window._scrNews.S; return { shown: S.shown, ready: S.ready, good: S.good, failed: S.failed, fails: S.fails, why: S.why, badFresh: S.badFresh }; });
  const act = (x, d) => emit(x, 'action', Object.assign({ id: 'news' }, d));
  const putNews = (x, items) => x.page.evaluate((it) => { _newsMerge(it.map(i => Object.assign({}, i))); }, items || ITEMS);
  const openNews = (x) => x.page.evaluate(() => { switchTab('community', document.getElementById('ni-community')); filterCat(document.querySelector('#filterRow .chip[onclick*="뉴스"]'), '뉴스'); });
  const rows = (txt) => JSON.parse(txt).body.filter(n => n.t === 'news');

  console.log('[① 플러그인이 없거나 꺼져 있으면 예전 그대로]');
  await t('플러그인이 없으면(웹): 요청도 호출도 없다 · 설정 카드도 안 보인다 · 웹 뉴스 목록이 그려진다', async () => {
    const x = await fresh({ plugin: false, on: true }); await putNews(x); await openNews(x); await x.page.waitForTimeout(1500);
    assert.strictEqual(await x.page.evaluate(() => getComputedStyle(document.getElementById('scrnSetCard')).display), 'none');
    assert.strictEqual(x.reqs.length, 0);
    assert.ok(await x.page.evaluate(() => document.querySelectorAll('#commList .news-row').length) >= 3, '웹 목록이 안 그려졌다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('플러그인이 있어도 꺼져 있으면(기본) 호출·요청이 없다 · 카드는 보이고 스위치는 꺼짐 · 웹 목록 그대로', async () => {
    const x = await fresh({ plugin: true, on: false }); await putNews(x); await openNews(x); await x.page.waitForTimeout(1800);
    assert.strictEqual((await calls(x)).length, 0); assert.strictEqual(x.reqs.length, 0);
    const c = await x.page.evaluate(() => ({ d: getComputedStyle(document.getElementById('scrnSetCard')).display, on: document.getElementById('scrnSetOn').checked, s: document.getElementById('scrnSetStat').textContent, rows: document.querySelectorAll('#commList .news-row').length }));
    assert.strictEqual(c.d, 'block'); assert.strictEqual(c.on, false); assert.ok(/꺼짐/.test(c.s), c.s); assert.ok(c.rows >= 3);
    assert.strictEqual(await x.page.evaluate(() => window._scrNews.owns()), false);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  console.log('[② 켜면: 기사 목록과 칩을 보내고 엔진 JSON 을 그대로 넘긴다]');
  const A = await fresh({ plugin: true, on: true });
  await t('뉴스를 열고 기사가 놓이면 요청(cap=5: 칩·기사 배열)하고, 받은 글을 한 글자도 안 고치고 show 한다 · 사각형은 칩 줄 아래부터', async () => {
    await putNews(A); await openNews(A);
    assert.ok(await waitFor(A, has(A, 'show')), 'show 가 없다');
    const q = A.reqs[A.reqs.length - 1];
    assert.strictEqual(q.cap, 5); assert.deepStrictEqual(q.f, { cat: '전체' }); assert.strictEqual(q.n.length, 5);
    const r0 = q.n.find(r => r[0] === '코스피 2,700 돌파');
    assert.ok(r0 && r0[1] === 'https://a.example/1' && r0[2] === '연합뉴스' && typeof r0[3] === 'number' && r0.length === 6, JSON.stringify(r0));
    const s = (await last(A, 'show')).a;
    assert.strictEqual(s.id, 'news'); assert.strictEqual(s.json, A.lastBody, '엔진 글과 다르다');
    const bx = await A.page.evaluate(() => { const r = document.getElementById('tab-community').getBoundingClientRect(), f = document.getElementById('filterRow').getBoundingClientRect(); return { x: r.left, y: f.bottom, w: r.width, h: r.bottom - f.bottom }; });
    assert.ok(Math.abs(s.x - bx.x) < 1 && Math.abs(s.y - bx.y) < 1 && Math.abs(s.w - bx.w) < 1 && Math.abs(s.h - bx.h) < 1, JSON.stringify([s.x, s.y, s.w, s.h, bx]));
    assert.strictEqual(s.dpr, 2); assert.strictEqual(s.keepScroll, false);
    ['bg', 'card', 'border', 'border2', 'text', 'sub', 'gold', 'orange', 'imgbg'].forEach(k => assert.ok(typeof s.palette[k] === 'string' && s.palette[k].length > 3, k + ' ' + JSON.stringify(s.palette)));
  });
  await t('엔진 글 안에 분류·시간 문구가 들어 있다(앱은 문구를 만들지 않는다)', async () => {
    const rs = rows((await last(A, 'show')).a.json);
    assert.strictEqual(rs.length, 5); assert.strictEqual(rs[0].title, '코스피 2,700 돌파'); assert.strictEqual(rs[0].sub, '증시 · 5분 전');
    assert.ok(rs.some(r => r.sub === '스포츠 · 1시간 전'));
  });
  await t('ready 가 오면 정상: 실패 0 · 저장본이 저장된다 · 웹 뉴스 목록은 만들지 않고 웹 칩 줄은 숨는다(owns)', async () => {
    await emit(A, 'ready', { id: 'news' }); await A.page.waitForTimeout(250);
    const s = await st(A); assert.ok(s.shown && s.ready && s.good && !s.failed && s.fails === 0, JSON.stringify(s));
    const c = JSON.parse(await A.page.evaluate(() => localStorage.getItem('gdm_scrn_c'))); assert.strictEqual(c.txt, A.lastBody); assert.strictEqual(c.cat, '전체');
    assert.strictEqual(await A.page.evaluate(() => window._scrNews.owns()), true);
    assert.strictEqual(await A.page.evaluate(() => document.querySelectorAll('#commList .news-row').length), 0, '네이티브가 맡았는데 웹 줄이 남았다');
    await A.page.evaluate(() => { const l = document.getElementById('commList'); _renderNewsTab(l); });
    await A.page.waitForTimeout(150); assert.strictEqual(await A.page.evaluate(() => document.querySelectorAll('#commList .news-row').length), 0, '웹 목록을 만들었다');
    assert.strictEqual(await A.page.evaluate(() => getComputedStyle(document.getElementById('newsCatBar')).display), 'none');
    assert.deepStrictEqual(A.errs, []);
  });
  await t('설정 카드: 켜짐 문구 · 스위치 켜짐 (엔진 문구와 같다)', async () => {
    const c = await A.page.evaluate(() => ({ on: document.getElementById('scrnSetOn').checked, s: document.getElementById('scrnSetStat').textContent }));
    assert.strictEqual(c.on, true);
    assert.strictEqual(c.s, require('../engine/settings').SETTINGS_FEATS.find(d => d.k === 'scrn').ok);
  });

  console.log('[③ 행동: 칩·기사·데이터 변화]');
  await t('칩(cat 증시) → 고른 칩이 바뀌고 새 요청 → update(keepScroll 거짓: 목록이 바뀌었다)', async () => {
    await clear(A); const n0 = A.reqs.length;
    await act(A, { a: 'cat', v: '증시' });
    assert.ok(await waitFor(A, has(A, 'update')), 'update 없음');
    assert.strictEqual(await A.page.evaluate(() => _newsCatSel), '증시');
    assert.ok(A.reqs.length === n0 + 1 && A.lastReq.f.cat === '증시');
    const u = (await last(A, 'update')).a; assert.strictEqual(u.keepScroll, false);
    assert.deepStrictEqual(rows(u.json).map(r => r.title), ['코스피 2,700 돌파']);
  });
  await t('전체로 돌아오면 같은 요청이라 네트워크 없이 기억에서 바로 그린다', async () => {
    await clear(A); const n0 = A.reqs.length;
    await act(A, { a: 'cat', v: '전체' });
    assert.ok(await waitFor(A, has(A, 'update')), 'update 없음');
    assert.strictEqual(A.reqs.length, n0, '다시 요청했다'); assert.strictEqual(rows((await last(A, 'update')).a.json).length, 5);
  });
  await t('모르는 칩 이름은 무시한다', async () => {
    await clear(A); const n0 = A.reqs.length;
    await act(A, { a: 'cat', v: '해킹' }); await A.page.waitForTimeout(400);
    assert.strictEqual((await calls(A)).filter(c => c.m !== 'setRect').length, 0); assert.strictEqual(A.reqs.length, n0); assert.strictEqual(await A.page.evaluate(() => _newsCatSel), '전체');
  });
  await t('새 기사가 들어오면 새 요청 → update(keepScroll 참: 같은 칩이라 위치 유지) · 연달아 들어와도 요청은 한 번', async () => {
    await clear(A); const n0 = A.reqs.length;
    await A.page.evaluate(() => { for (let i = 0; i < 5; i++) _newsMerge([{ title: '새 코스피 기사 ' + i, link: 'https://n.example/' + i, source: '', ts: Date.now() - i * 1000, desc: '' }]); });
    assert.ok(await waitFor(A, has(A, 'update')), 'update 없음'); await A.page.waitForTimeout(500);
    assert.strictEqual(A.reqs.length - n0, 1, '요청 ' + (A.reqs.length - n0));
    const u = (await last(A, 'update')).a; assert.strictEqual(u.keepScroll, true); assert.strictEqual(rows(u.json).length, 10);
  });

  console.log('[④ 기사 → 상세 팝업 · 덮임]');
  await t('기사(call nw.N) → 엔진에 상세 문구를 묻고(cap=5, d=그 기사) 그 글로 팝업을 연다 · 네이티브는 숨는다', async () => {
    await clear(A);
    const shown = rows(A.lastBody); const first = shown[0]; const idx = Number(first.act.v.slice(3));
    await act(A, { a: 'call', v: first.act.v });
    assert.ok(await waitFor(A, async () => await A.page.evaluate(() => !!document.getElementById('newsDetailOv'))), '팝업이 없다');
    const d = A.dreqs[A.dreqs.length - 1]; assert.strictEqual(d.cap, 5); assert.strictEqual(d.d[0], first.title); assert.ok(idx >= 0);
    const p = await A.page.evaluate(() => { const ov = document.getElementById('newsDetailOv'); return { t: ov.textContent, btn: document.getElementById('newsOpenBtn').textContent }; });
    assert.ok(p.t.indexOf(first.title) >= 0 && /출처 ·/.test(p.t) && /저작권은 해당 언론사에 있습니다/.test(p.t), p.t);
    assert.ok(/원문 보기 ›$/.test(p.btn), p.btn);
    assert.ok(await waitFor(A, has(A, 'hide')), '네이티브를 숨기지 않았다');
  });
  await t('원문 보기 단추 → 인앱 브라우저(_newsOpenInApp)로 그 기사의 링크를 연다 · 닫기 · 뒤로가기는 팝업부터', async () => {
    await A.page.evaluate(() => { document.getElementById('newsOpenBtn').click(); });
    const o = await A.page.evaluate(() => window.__open[0]); assert.ok(/^https:\/\/(a|n)\.example\//.test(o[0]), JSON.stringify(o));
    await clear(A);
    assert.strictEqual(await A.page.evaluate(() => handleBackPress()), true);
    assert.strictEqual(await A.page.evaluate(() => !!document.getElementById('newsDetailOv')), false);
    assert.ok(await waitFor(A, anyPut(A), 5000), '닫은 뒤 네이티브가 다시 올라오지 않았다');
  });
  await t('요약이 있는 기사는 엔진이 정리한 요약을 보여 준다(기자 서두 제거)', async () => {
    const r = rows(A.lastBody).find(x => x.title === '코스피 2,700 돌파');
    await act(A, { a: 'call', v: r.act.v });
    assert.ok(await waitFor(A, async () => await A.page.evaluate(() => !!document.getElementById('newsDetailOv'))), '팝업이 없다');
    const txt = await A.page.evaluate(() => document.getElementById('newsDetailOv').textContent);
    assert.ok(/코스피가 2,700 선을 넘어서며/.test(txt) && txt.indexOf('홍길동 기자') < 0, txt);
    await A.page.evaluate(() => document.getElementById('newsCloseBtn').click());
    assert.strictEqual(await A.page.evaluate(() => !!document.getElementById('newsDetailOv')), false);
  });
  await t('목록에 없는 번호·모르는 행동은 무시한다', async () => {
    await A.page.waitForTimeout(400); await clear(A); const n0 = A.dreqs.length;
    await act(A, { a: 'call', v: 'nw.999' }); await act(A, { a: 'call', v: 'rm_rf' }); await act(A, { a: 'web', v: 'cm' }); await act(A, { a: 'open', url: 'https://evil.example' }); await A.page.waitForTimeout(300);
    assert.strictEqual(A.dreqs.length, n0); assert.strictEqual(await A.page.evaluate(() => !!document.getElementById('newsDetailOv')), false);
  });
  await t('다른 칩(게시판/실시간소통)으로 가면 숨기고, 뉴스로 돌아오면 다시 올린다', async () => {
    assert.ok(await waitFor(A, async () => (await st(A)).shown, 6000), '먼저 올라와 있어야 한다'); await clear(A);
    await A.page.evaluate(() => filterCat(document.getElementById('chipBoard'), 'all'));
    assert.ok(await waitFor(A, has(A, 'hide')), '게시판으로 갔는데 숨기지 않았다');
    await clear(A); await A.page.evaluate(() => filterCat(document.querySelector('#filterRow .chip[onclick*="뉴스"]'), '뉴스'));
    assert.ok(await waitFor(A, anyPut(A), 5000), '뉴스로 돌아왔는데 올리지 않았다');
    await clear(A); await A.page.evaluate(() => showChatTab(document.getElementById('chipLiveTalk')));
    assert.ok(await waitFor(A, has(A, 'hide')), '실시간소통으로 갔는데 숨기지 않았다');
    await A.page.evaluate(() => filterCat(document.querySelector('#filterRow .chip[onclick*="뉴스"]'), '뉴스')); await waitFor(A, anyPut(A), 5000);
  });
  await t('팝업이 덮으면 숨기고, 걷히면 다시 올린다 · 커뮤니티 탭을 떠나면 숨긴다', async () => {
    assert.ok(await waitFor(A, async () => (await st(A)).shown, 6000), '먼저 올라와 있어야 한다'); await clear(A);
    await A.page.evaluate(() => { const d = document.createElement('div'); d.id = 'cov'; d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;'; document.body.appendChild(d); });
    assert.ok(await waitFor(A, has(A, 'hide')), '숨기지 않았다');
    await A.page.evaluate(() => document.getElementById('cov').remove()); await clear(A);
    assert.ok(await waitFor(A, anyPut(A), 5000), '다시 올리지 않았다');
    assert.ok(await waitFor(A, async () => (await st(A)).shown, 6000)); await clear(A); await A.page.evaluate(() => switchTab('home', document.getElementById('ni-home')));
    assert.ok(await waitFor(A, has(A, 'hide')), 'hide 없음');
    assert.deepStrictEqual(A.errs, []); await A.ctx.close();
  });

  console.log('[⑤ 처음 열 때 · 저장본 · 폴백]');
  await t('탭을 열고 450ms 안에 기사가 놓이면 첫 화면이 곧바로 그 목록이다(불러오는 중 안내를 먼저 그리지 않는다)', async () => {
    const x = await fresh({ plugin: true, on: true }); await openNews(x); await x.page.waitForTimeout(150); await putNews(x);
    assert.ok(await waitFor(x, has(x, 'show')), 'show 없음'); await x.page.waitForTimeout(700);
    assert.strictEqual((await calls(x, 'show')).length, 1); assert.strictEqual(rows((await calls(x, 'show'))[0].a.json).length, 5, '첫 화면이 안내 문구였다');
    assert.ok(x.reqs.every(q => q.n.length > 0), '빈 목록으로 요청했다'); await x.ctx.close();
  });
  await t('끝내 기사가 안 오면 잠깐 뒤 불러오는 중 안내를 그린다(이모지 없이)', async () => {
    const x = await fresh({ plugin: true, on: true }); await openNews(x);
    assert.ok(await waitFor(x, has(x, 'show'), 4000), 'show 없음');
    assert.strictEqual(JSON.parse((await last(x, 'show')).a.json).body[0].s, '뉴스 불러오는 중...'); await x.ctx.close();
  });
  let CACHE = null;
  await t('같은 칩의 저장본이 있으면 느린 네트워크(5초)를 기다리지 않고 show — 이때 줄을 눌러도 무반응, 새 응답이 오면 제자리 갱신되고 눌린다', async () => {
    const x0 = await fresh({ plugin: true, on: true }); await putNews(x0); await openNews(x0); await waitFor(x0, has(x0, 'show')); await emit(x0, 'ready', { id: 'news' }); await x0.page.waitForTimeout(300);
    CACHE = JSON.parse(await x0.page.evaluate(() => localStorage.getItem('gdm_scrn_c'))); assert.ok(CACHE.txt); await x0.ctx.close();
    const x = await fresh({ plugin: true, on: true, cache: CACHE, delay: 5000 }); await putNews(x); await openNews(x);
    assert.ok(await waitFor(x, has(x, 'show'), 3000), '저장본으로 바로 그리지 못했다');
    assert.strictEqual((await calls(x, 'show'))[0].a.json, CACHE.txt);
    await act(x, { a: 'call', v: 'nw.0' }); await x.page.waitForTimeout(300);
    assert.strictEqual(x.dreqs.length, 0); assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('newsDetailOv')), false, '저장본 줄이 눌렸다');
    assert.ok(await waitFor(x, has(x, 'update'), 9000), '새 응답으로 갱신되지 않았다');
    assert.strictEqual((await last(x, 'update')).a.keepScroll, true);
    await act(x, { a: 'call', v: 'nw.0' });
    assert.ok(await waitFor(x, async () => await x.page.evaluate(() => !!document.getElementById('newsDetailOv'))), '새 화면 줄이 안 눌린다'); await x.ctx.close();
  });
  await t('저장본이 다른 칩 것이면 쓰지 않는다', async () => {
    const x = await fresh({ plugin: true, on: true, cache: { cat: '증시', txt: CACHE.txt }, delay: 2500 }); await putNews(x); await openNews(x);
    await x.page.waitForTimeout(1200); assert.strictEqual((await calls(x, 'show')).length, 0, '다른 칩 저장본을 그렸다');
    assert.ok(await waitFor(x, has(x, 'show'), 6000)); await x.ctx.close();
  });
  await t('엔진 응답이 틀린 모양이면 그리지 않는다 → 웹 뉴스 목록이 그려진다 · 설정 카드 문구', async () => {
    const x = await fresh({ plugin: true, on: true, serve: 'shape' }); await putNews(x); await openNews(x);
    await waitFor(x, async () => (await st(x)).failed, 6000);
    const s = await st(x); assert.ok(s.failed && s.fails >= 1 && !s.shown && (await calls(x, 'show')).length === 0, JSON.stringify(s));
    assert.ok(await waitFor(x, async () => (await x.page.evaluate(() => document.querySelectorAll('#commList .news-row').length)) >= 3, 4000), '웹 목록이 다시 그려지지 않았다');
    assert.ok(/문제가 있어/.test(await x.page.evaluate(() => document.getElementById('scrnSetStat').textContent)));
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('엔진이 죽어 있으면(네트워크 오류) 그리지 않고 웹 목록 그대로', async () => {
    const x = await fresh({ plugin: true, on: true, serve: 'down' }); await putNews(x); await openNews(x); await x.page.waitForTimeout(2500);
    assert.strictEqual((await calls(x, 'show')).length, 0);
    assert.ok(await x.page.evaluate(() => document.querySelectorAll('#commList .news-row').length) >= 3, '웹 목록이 없다');
    await x.ctx.close();
  });
  await t('상세 문구를 못 받으면 예전 웹 팝업(_openNewsDetail)으로 연다', async () => {
    const x = await fresh({ plugin: true, on: true, detail: 'down' }); await putNews(x); await openNews(x); await waitFor(x, has(x, 'show')); await emit(x, 'ready', { id: 'news' });
    const r = rows((await last(x, 'show')).a.json)[0]; await act(x, { a: 'call', v: r.act.v });
    assert.ok(await waitFor(x, async () => await x.page.evaluate(() => !!document.getElementById('newsDetailOv'))), '예전 팝업도 없다');
    assert.ok((await x.page.evaluate(() => document.getElementById('newsDetailOv').textContent)).indexOf(r.title) >= 0); await x.ctx.close();
  });
  await t('플러그인이 오류를 알리면 웹으로 돌아가고 웹 뉴스 목록을 다시 만든다 · 스위치를 껐다 켜면 다시 시도', async () => {
    const x = await fresh({ plugin: true, on: true }); await putNews(x); await openNews(x); await waitFor(x, has(x, 'show')); await emit(x, 'ready', { id: 'news' }); await x.page.waitForTimeout(200);
    await emit(x, 'error', { id: 'news', message: '터짐', kind: 'fatal' });
    assert.ok(await waitFor(x, async () => (await st(x)).failed, 3000), '웹으로 돌아가지 않았다');
    assert.ok(await waitFor(x, async () => (await x.page.evaluate(() => document.querySelectorAll('#commList .news-row').length)) >= 3, 4000), '웹 목록이 다시 그려지지 않았다');
    await clear(x); await x.page.evaluate(() => window._scrnSetUse(false)); await x.page.waitForTimeout(200);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scrn_on')), '0');
    await x.page.evaluate(() => window._scrnSetUse(true));
    assert.ok(await waitFor(x, has(x, 'show'), 6000), '다시 켰는데 올리지 않았다'); await x.ctx.close();
  });

  await b.close();
  console.log(`screen_news_js.ui: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
