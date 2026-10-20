// 서버 구동 네이티브 커뮤니티 칩 줄 ↔ 앱(JS) 연결 시험 — 2026-10-19 (s69)
//   원칙: "계산은 엔진이, 그림은 앱이". 가짜 ScreenNative 플러그인 + 가짜 엔진(POST /screen/cchips → engine/cchips.js 의 실제 출력)으로 확인한다:
//   · 플러그인이 없거나 스위치가 꺼져 있으면(기본) 호출·요청이 하나도 없다 · 웹 칩 줄이 그대로
//   · 켜면: 켜진 칸만 엔진에 보내고(cap=6, alts:'chips') 엔진 JSON 을 그대로 플러그인에 넘긴다 · 사각형은 칩 줄(#filterRow)
//   · 행동: cc.<칸> → 예전 웹 함수가 불리고 받아 둔 화면이 요청 없이 올라온다 · 허용 목록 밖은 무시 · 웹에서 칸이 바뀌어도 따라간다
//   · 폴백: 엔진이 죽으면 웹 칩 줄 · 스위치 켜고 끄기
// 실행: node test/screen_cchips_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const EQ = require('../engine/cchips');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 700)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh(opt) {
    opt = opt || {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const x = { ctx, page, errs, reqs: [], serve: opt.serve || 'ok', lastBody: '' };
    await page.route('**/*', async r => {
      const u = new URL(r.request().url()), req = r.request();
      if (u.protocol === 'file:') return r.continue();
      if (u.pathname === '/screen/cchips' && u.hostname.indexOf('route-v2') >= 0) {
        assert.strictEqual(req.method(), 'POST'); assert.ok(/text\/plain/.test(req.headers()['content-type'] || ''), '사전 요청이 필요한 형식으로 보냈다');
        const body = JSON.parse(req.postData() || '{}'); x.reqs.push(body);
        if (x.serve === 'down') return r.abort();
        const out = JSON.stringify(EQ.cchipsScreens({ cap: Number(body.cap) || 0 }, body.f, body.alts));
        { let o2 = null; try { o2 = JSON.parse(out); } catch (e) { } if (o2 && o2.alts) { delete o2.alts; x.lastBody = JSON.stringify(o2); } else x.lastBody = out; }
        return r.fulfill({ status: 200, contentType: 'application/json', body: out });
      }
      return r.abort();
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try { localStorage.setItem('locDisc', '1'); if (o.on) localStorage.setItem('gdm_scrq_on', '1'); } catch (e) {}
      window.__sn = []; window.__snL = {};
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const put = (m) => (a) => { window.__sn.push({ m, a: JSON.parse(JSON.stringify(a)) }); if (a.json != null) { try { const j = JSON.parse(a.json); if (j.v !== 1 || !Array.isArray(j.body)) throw 0; } catch (e) { return Promise.reject(new Error('invalid: 규격')); } } return Promise.resolve(); };
        const rec = (m) => (a) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { ScreenNative: {
          show: put('show'), update: put('update'), setRect: rec('setRect'), hide: rec('hide'), destroy: rec('destroy'), toast: rec('toast'), setField: rec('setField'),
          status: () => Promise.resolve({ visible: true, items: 4, age: 20, scroll: 0, cap: 8 }),
          addListener: (n, f) => { (window.__snL[n] = window.__snL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.goto('file://' + html); await page.waitForTimeout(2200);
    await page.addStyleTag({ content: '#locDiscOv{display:none !important}' });
    await page.evaluate(() => { const ov = document.getElementById('locDiscOv'); if (ov) ov.remove(); });
    await page.evaluate(() => { window._loadServerPosts = function () {}; });
    return x;
  }
  const calls = (x, m) => x.page.evaluate((m) => window.__sn.filter(c => !m || c.m === m), m || null);
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__snEmit(n, d), [n, d || {}]);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await x.page.waitForTimeout(60); } return false; };
  const puts = (x) => async () => (await calls(x, 'show')).length + (await calls(x, 'update')).length;
  const lastPut = async (x) => { const c = (await calls(x)).filter(c => (c.m === 'show' || c.m === 'update') && c.a.id === 'cchips'); return c[c.length - 1]; };
  const act = (x, d) => emit(x, 'action', Object.assign({ id: 'cchips' }, d));
  const openComm = (x) => x.page.evaluate(() => { switchTab('community', document.getElementById('ni-community')); filterCat(document.getElementById('chipBoard'), 'all'); });
  const modeOf = async (x) => { const c = await lastPut(x); return c ? JSON.parse(c.a.json).info.mode : ''; };

  console.log('[① 플러그인이 없거나 꺼져 있으면 예전 그대로]');
  await t('플러그인이 없으면(웹): 요청·호출 없음 · 설정 카드 숨김', async () => {
    const x = await fresh({ plugin: false, on: true }); await openComm(x); await x.page.waitForTimeout(1200);
    assert.strictEqual(x.reqs.length, 0); assert.strictEqual(await x.page.evaluate(() => getComputedStyle(document.getElementById('scrqSetCard')).display), 'none'); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('플러그인이 있어도 꺼져 있으면(기본) 호출·요청 없음 · 카드는 보이고 스위치는 꺼짐', async () => {
    const x = await fresh({ plugin: true, on: false }); await openComm(x); await x.page.waitForTimeout(1200);
    assert.strictEqual((await calls(x)).length, 0); assert.strictEqual(x.reqs.length, 0);
    const c = await x.page.evaluate(() => ({ d: getComputedStyle(document.getElementById('scrqSetCard')).display, on: document.getElementById('scrqSetOn').checked, s: document.getElementById('scrqSetStat').textContent }));
    assert.strictEqual(c.d, 'block'); assert.strictEqual(c.on, false); assert.ok(/꺼짐/.test(c.s), c.s); await x.ctx.close();
  });

  console.log('[② 켜면: 켜진 칸을 보내고 엔진 JSON 을 그대로 넘긴다]');
  const A = await fresh({ plugin: true, on: true });
  await t('커뮤니티 탭을 열면 cap=6·mode=board·alts:"chips" 로 요청하고 받은 글을 한 글자도 안 고치고 show · 사각형은 #filterRow', async () => {
    await openComm(A); assert.ok(await waitFor(A, async () => (await calls(A, 'show')).length >= 1), 'show 가 없다');
    const q = A.reqs[0]; assert.strictEqual(q.cap, 6); assert.strictEqual(q.f.mode, 'board'); assert.strictEqual(q.alts, 'chips');
    const s = (await lastPut(A)).a; assert.strictEqual(s.id, 'cchips'); assert.strictEqual(s.json, A.lastBody, '엔진 글과 다르다'); assert.ok(!/"alts"/.test(s.json), '플러그인에 alts 가 넘어갔다');
    const bx = await A.page.evaluate(() => { const r = document.getElementById('filterRow').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    assert.ok(Math.abs(s.x - bx.x) < 1 && Math.abs(s.y - bx.y) < 1 && Math.abs(s.w - bx.w) < 1 && Math.abs(s.h - bx.h) < 1, JSON.stringify([s.x, s.y, s.w, s.h, bx]));
    assert.strictEqual(JSON.parse(s.json).info.mode, 'board');
  });
  await t('ready 가 오면 정상(실패 0) · 카드 문구 = 엔진 문구', async () => {
    await emit(A, 'ready', { id: 'cchips' }); await A.page.waitForTimeout(200);
    const c = await A.page.evaluate(() => ({ on: document.getElementById('scrqSetOn').checked, s: document.getElementById('scrqSetStat').textContent, S: { f: window._scrCchips.S.failed, n: window._scrCchips.S.fails } }));
    assert.strictEqual(c.on, true); assert.ok(/^켜짐/.test(c.s), c.s); assert.strictEqual(c.S.f, false); assert.strictEqual(c.S.n, 0); assert.deepStrictEqual(A.errs, []);
  });

  console.log('[③ 행동]');
  await t('cc.news → 예전 웹 filterCat(뉴스)가 불리고 받아 둔 화면이 요청 없이 올라온다', async () => {
    const n0 = A.reqs.length;
    await act(A, { a: 'call', v: 'cc.news' });
    assert.ok(await waitFor(A, async () => (await modeOf(A)) === 'news'), 'news 화면이 안 올라갔다');
    assert.strictEqual(await A.page.evaluate(() => _commFilter), '뉴스'); assert.strictEqual(A.reqs.length, n0, '요청이 나갔다');
    assert.strictEqual(await A.page.evaluate(() => Array.prototype.indexOf.call(document.querySelectorAll('#filterRow .chip'), document.querySelector('#filterRow .chip.on'))), 2);
  });
  await t('cc.chat · cc.set · cc.board 도 같다 (웹 칩이 켜지고 보이는 뷰가 바뀐다)', async () => {
    const n0 = A.reqs.length;
    await act(A, { a: 'call', v: 'cc.chat' }); assert.ok(await waitFor(A, async () => (await modeOf(A)) === 'chat'));
    assert.strictEqual(await A.page.evaluate(() => document.getElementById('chipLiveTalk').classList.contains('on')), true);
    await act(A, { a: 'call', v: 'cc.set' }); assert.ok(await waitFor(A, async () => (await modeOf(A)) === 'set'));
    assert.notStrictEqual(await A.page.evaluate(() => getComputedStyle(document.getElementById('settingsTabView')).display), 'none');
    await act(A, { a: 'call', v: 'cc.board' }); assert.ok(await waitFor(A, async () => (await modeOf(A)) === 'board'));
    assert.strictEqual(await A.page.evaluate(() => _commFilter), 'all'); assert.strictEqual(A.reqs.length, n0, '칩만 눌렀는데 요청이 나갔다');
  });
  await t('허용 목록 밖 행동은 무시한다', async () => {
    const cnt = async () => (await calls(A)).filter(c => c.m !== 'setRect').length, before = await cnt();
    await act(A, { a: 'call', v: 'cc.evil' }); await act(A, { a: 'call', v: 'rm_rf' }); await act(A, { a: 'set', key: 'x', on: true }); await act(A, { a: 'web', v: 'cm' });
    await A.page.waitForTimeout(400); assert.strictEqual(await cnt(), before); assert.strictEqual(await A.page.evaluate(() => _commFilter), 'all');
  });
  await t('웹 쪽에서 칸이 바뀌어도(예: 다른 곳이 showChatTab 호출) 네이티브가 따라간다', async () => {
    await A.page.evaluate(() => showChatTab(document.getElementById('chipLiveTalk')));
    assert.ok(await waitFor(A, async () => (await modeOf(A)) === 'chat', 6000), '따라가지 않았다');
    await A.page.evaluate(() => filterCat(document.getElementById('chipBoard'), 'all')); assert.ok(await waitFor(A, async () => (await modeOf(A)) === 'board', 6000));
  });
  await t('다른 탭으로 가면 숨기고, 돌아오면 다시 올린다', async () => {
    await A.page.evaluate(() => switchTab('home', document.getElementById('ni-home')));
    assert.ok(await waitFor(A, async () => (await calls(A, 'hide')).length >= 1), '숨기지 않았다');
    const n = (await puts(A)());
    await openComm(A); assert.ok(await waitFor(A, async () => (await puts(A)()) > n, 6000), '다시 올리지 않았다'); assert.deepStrictEqual(A.errs, []);
    await A.ctx.close();
  });

  console.log('[④ 폴백·스위치]');
  await t('엔진이 죽으면(요청 실패) 그리지 않고 웹 칩 줄 그대로 · 웹 칩은 계속 눌린다', async () => {
    const x = await fresh({ plugin: true, on: true, serve: 'down' }); await openComm(x); await x.page.waitForTimeout(2500);
    assert.strictEqual((await calls(x, 'show')).length, 0);
    await x.page.evaluate(() => document.querySelectorAll('#filterRow .chip')[2].click());
    assert.strictEqual(await x.page.evaluate(() => _commFilter), '뉴스'); await x.ctx.close();
  });
  await t('플러그인 오류(error 이벤트) → 웹으로 · 스위치 껐다 켜면 복구', async () => {
    const x = await fresh({ plugin: true, on: true }); await openComm(x); await waitFor(x, async () => (await calls(x, 'show')).length >= 1);
    await emit(x, 'error', { id: 'cchips', message: 'boom', kind: 'exception' }); await x.page.waitForTimeout(200);
    let s = await x.page.evaluate(() => ({ f: window._scrCchips.S.failed, n: window._scrCchips.S.fails })); assert.ok(s.f && s.n === 1, JSON.stringify(s));
    assert.ok((await calls(x, 'destroy')).length >= 1);
    await x.page.evaluate(() => window._scrqSetUse(false)); await x.page.waitForTimeout(100); assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scrq_on')), '0');
    await x.page.evaluate(() => window._scrqSetUse(true)); await x.page.waitForTimeout(100);
    s = await x.page.evaluate(() => ({ f: window._scrCchips.S.failed, n: window._scrCchips.S.fails })); assert.ok(!s.f && s.n === 0, JSON.stringify(s)); await x.ctx.close();
  });
  await t('설정 화면 스위치(set f.scrq)로도 켜고 끌 수 있다', async () => {
    const x = await fresh({ plugin: true, on: false }); await openComm(x);
    const ok1 = await x.page.evaluate(() => { try { return typeof window._scrqSetUse === 'function'; } catch (e) { return false; } }); assert.ok(ok1);
    await x.page.evaluate(() => window._scrqSetUse(true)); assert.ok(await waitFor(x, async () => (await calls(x, 'show')).length >= 1, 8000), '켜도 안 올라온다');
    await x.ctx.close();
  });

  await b.close();
  console.log(`\nscreen_cchips_js: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
