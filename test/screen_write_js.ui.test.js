// 서버 구동 네이티브 글쓰기 시트 ↔ 앱(JS) 연결 시험 — 2026-10-19 (s70)
//   원칙: "계산은 엔진이, 그림은 앱이". 가짜 ScreenNative 플러그인 + 가짜 엔진(POST /screen/write → engine/write.js 의 실제 출력)으로 확인한다:
//   · 플러그인이 없거나 꺼져 있거나 옛 APK(status 에 cap 9 없음)면 호출·요청이 하나도 없다 · 웹 시트가 그대로
//   · 켜면: 기기 사실(횟수·안내·등록 중·처음 글)만 보내고(cap=9) 엔진 JSON 을 그대로 넘긴다 · 사각형은 #wsheet · 웹 시트 속은 감춘다(자리는 그대로)
//   · 행동: wr.submit(입력칸 글을 웹 입력칸에 옮겨 submitPost) → 등록되고 닫히며 네이티브 입력칸도 비워진다 · 거절/빈 제목은 안내 글이 새 화면에 · wr.close · 허용 목록 밖 무시
//   · 폴백: 엔진이 죽으면 웹 시트 · 스위치 켜고 끄기
// 실행: node test/screen_write_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const EW = require('../engine/write');
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
      if (u.pathname === '/screen/write' && u.hostname.indexOf('route-v2') >= 0) {
        assert.strictEqual(req.method(), 'POST'); assert.ok(/text\/plain/.test(req.headers()['content-type'] || ''), '사전 요청이 필요한 형식으로 보냈다');
        const body = JSON.parse(req.postData() || '{}'); x.reqs.push(body);
        if (x.serve === 'down') return r.abort();
        const out = JSON.stringify(EW.writeScreen({ cap: Number(body.cap) || 0 }, body.f)); x.lastBody = out;
        return r.fulfill({ status: 200, contentType: 'application/json', body: out });
      }
      return r.abort();
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try { localStorage.setItem('locDisc', '1'); localStorage.setItem('mk_comm_id', JSON.stringify('시험이')); if (o.on) localStorage.setItem('gdm_scrw_on', '1'); } catch (e) {}
      window.__sn = []; window.__snL = {};
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const put = (m) => (a) => { window.__sn.push({ m, a: JSON.parse(JSON.stringify(a)) }); if (a.json != null) { try { const j = JSON.parse(a.json); if (j.v !== 1 || !Array.isArray(j.body)) throw 0; } catch (e) { return Promise.reject(new Error('invalid: 규격')); } } return Promise.resolve(); };
        const rec = (m) => (a) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { ScreenNative: {
          show: put('show'), update: put('update'), setRect: rec('setRect'), hide: rec('hide'), destroy: rec('destroy'), toast: rec('toast'), setField: rec('setField'),
          status: () => Promise.resolve(o.oldApk ? { visible: true, items: 4, age: 20, scroll: 0, cap: 8 } : { visible: true, items: 11, age: 20, scroll: 0, cap: 9 }),
          addListener: (n, f) => { (window.__snL[n] = window.__snL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.goto('file://' + html); await page.waitForTimeout(2200);
    await page.addStyleTag({ content: '#locDiscOv{display:none !important}' });
    await page.evaluate(() => { const ov = document.getElementById('locDiscOv'); if (ov) ov.remove(); });
    await page.evaluate(() => {
      window._loadServerPosts = function () {}; window.__bw = []; window.__bwMode = 'ok';
      window._bwPost = function (p, d, cb) { window.__bw.push([p, d]); if (window.__bwMode === 'reject') cb({ rejected: true, error: '링크는 올릴 수 없어요' }); else cb({ ok: true, id: 7001 }); };
    });
    return x;
  }
  const calls = (x, m) => x.page.evaluate((m) => window.__sn.filter(c => !m || c.m === m), m || null);
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__snEmit(n, d), [n, d || {}]);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await x.page.waitForTimeout(60); } return false; };
  const puts = async (x) => (await calls(x)).filter(c => (c.m === 'show' || c.m === 'update') && c.a.id === 'write');
  const lastJ = async (x) => { const p = await puts(x); return p.length ? p[p.length - 1].a.json : ''; };
  const act = (x, d) => emit(x, 'action', Object.assign({ id: 'write' }, d));
  const openW = (x) => x.page.evaluate(() => { switchTab('community', document.getElementById('ni-community')); openWriteSheet(); });
  const nodes = (j) => { const o = []; (function f(a) { a.forEach(n => { o.push(n); if (n.kids) f(n.kids); }); })(JSON.parse(j).body); return o; };
  const isOn = (x) => x.page.evaluate(() => document.getElementById('wsheet').classList.contains('on'));

  console.log('[① 플러그인이 없거나 꺼져 있거나 옛 APK 면 예전 그대로]');
  await t('플러그인이 없으면(웹): 요청·호출 없음 · 설정 카드 숨김', async () => {
    const x = await fresh({ plugin: false, on: true }); await openW(x); await x.page.waitForTimeout(1000);
    assert.strictEqual(x.reqs.length, 0); assert.strictEqual(await x.page.evaluate(() => getComputedStyle(document.getElementById('scrwSetCard')).display), 'none');
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('wsheet').classList.contains('scrw-own')), false); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('꺼져 있으면(기본) 호출·요청 없음 · 카드는 보이고 스위치는 꺼짐', async () => {
    const x = await fresh({ plugin: true, on: false }); await openW(x); await x.page.waitForTimeout(1000);
    assert.strictEqual((await calls(x)).length, 0); assert.strictEqual(x.reqs.length, 0);
    const c = await x.page.evaluate(() => ({ d: getComputedStyle(document.getElementById('scrwSetCard')).display, on: document.getElementById('scrwSetOn').checked, s: document.getElementById('scrwSetStat').textContent }));
    assert.strictEqual(c.d, 'block'); assert.strictEqual(c.on, false); assert.ok(/꺼짐/.test(c.s), c.s); await x.ctx.close();
  });
  await t('옛 APK(status 의 cap 이 9 미만)면 켜져 있어도 요청·그리기 없음 — 웹 시트가 그대로', async () => {
    const x = await fresh({ plugin: true, on: true, oldApk: true }); await openW(x); await x.page.waitForTimeout(1500);
    assert.strictEqual(x.reqs.length, 0); assert.strictEqual((await puts(x)).length, 0);
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('wsheet').classList.contains('scrw-own')), false); await x.ctx.close();
  });

  console.log('[② 켜면: 기기 사실을 보내고 엔진 JSON 을 그대로 넘긴다]');
  const A = await fresh({ plugin: true, on: true });
  await t('글쓰기 시트를 열면 cap=9 와 사실(횟수·안내 없음·등록 중 0)로 요청하고 받은 글을 그대로 show · 사각형은 #wsheet · 웹 시트 속은 감춤', async () => {
    await openW(A); assert.ok(await waitFor(A, async () => (await puts(A)).length >= 1), 'show 가 없다');
    const q = A.reqs[0]; assert.strictEqual(q.cap, 9); assert.strictEqual(q.f.busy, 0); assert.strictEqual(q.f.err, ''); assert.strictEqual(q.f.t, ''); assert.strictEqual(typeof q.f.rc, 'number');
    const s = (await calls(A, 'show'))[0].a; assert.strictEqual(s.id, 'write'); assert.strictEqual(s.json, A.lastBody, '엔진 글과 다르다');
    await A.page.waitForTimeout(500);
    const bx = await A.page.evaluate(() => { const r = document.getElementById('wsheet').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const sr = (await puts(A))[0].a;
    assert.ok(Math.abs(sr.x - bx.x) < 1.5 && Math.abs(sr.w - bx.w) < 1.5, JSON.stringify([sr.x, sr.y, sr.w, sr.h, bx]));
    const ns = nodes(s.json); assert.ok(ns.some(n => n.key === 'wt') && ns.some(n => n.key === 'wb' && n.multi === true));
    assert.strictEqual(await A.page.evaluate(() => { const e = document.getElementById('wTitle'); return getComputedStyle(e).visibility; }), 'hidden');
    assert.strictEqual(await A.page.evaluate(() => getComputedStyle(document.getElementById('wsheet')).display), 'flex');
  });
  await t('ready 가 오면 정상(실패 0) · 카드 문구 = 켜짐', async () => {
    await emit(A, 'ready', { id: 'write' }); await A.page.waitForTimeout(200);
    const c = await A.page.evaluate(() => ({ on: document.getElementById('scrwSetOn').checked, s: document.getElementById('scrwSetStat').textContent, f: window._scrWrite.S.failed, n: window._scrWrite.S.fails }));
    assert.strictEqual(c.on, true); assert.ok(/^켜짐/.test(c.s), c.s); assert.strictEqual(c.f, false); assert.strictEqual(c.n, 0);
  });

  console.log('[③ 행동]');
  await t('빈 제목으로 등록(wr.submit) → 웹이 안내 글을 놓고 → 새 화면에 빨간 안내 상자(이모지 없이) · 시트는 그대로 열려 있다', async () => {
    const n0 = (await puts(A)).length;
    await act(A, { a: 'call', v: 'wr.submit', fields: { wt: '', wb: '내용만' } });
    assert.ok(await waitFor(A, async () => { const j = await lastJ(A); return (await puts(A)).length > n0 && nodes(j).some(n => n.tc === '#ff453a' && /제목을 입력해주세요/.test(n.s)); }), '안내 상자가 안 올라갔다');
    const j = await lastJ(A); assert.ok(!nodes(j).some(n => /⚠/.test(n.s || ''))); assert.strictEqual(await isOn(A), true);
    assert.strictEqual(await A.page.evaluate(() => document.getElementById('wBody').value), '내용만', '네이티브 입력칸 글이 웹 입력칸으로 옮겨졌다');
    assert.strictEqual((await A.page.evaluate(() => window.__bw.length)), 0, '서버에 보냈다');
  });
  await t('서버가 거절하면(rejected) 그 사유가 안내 상자에 · 글은 그대로 · 등록 중 단추 글이 되돌아온다', async () => {
    await A.page.evaluate(() => { window.__bwMode = 'reject'; });
    await act(A, { a: 'call', v: 'wr.submit', fields: { wt: '제목입니다', wb: '링크 http://x' } });
    assert.ok(await waitFor(A, async () => nodes(await lastJ(A)).some(n => n.tc === '#ff453a' && /링크는 올릴 수 없어요/.test(n.s))), '거절 사유가 안 올라갔다');
    assert.strictEqual(await isOn(A), true);
    const sb = nodes(await lastJ(A)).find(n => n.act && n.act.v === 'wr.submit'); assert.strictEqual(sb.s, '제보 등록');
    assert.strictEqual((await A.page.evaluate(() => window.__bw.length)), 1);
  });
  await t('정상 등록 → 웹 _bwPost 로 제목/내용(줄바꿈 포함)이 나가고 · 시트가 닫히며 · 네이티브 입력칸이 비워지고 · 결과 토스트는 기기 토스트로 · 웹 toast 는 되돌려 놓는다', async () => {
    await A.page.evaluate(() => { window.__bwMode = 'ok'; });
    const toast0 = await A.page.evaluate(() => String(window.toast));
    await act(A, { a: 'call', v: 'wr.submit', fields: { wt: '2호선 지연', wb: '강남역\n승강장 혼잡' } });
    assert.ok(await waitFor(A, async () => !(await isOn(A)), 8000), '시트가 안 닫혔다');
    const bw = await A.page.evaluate(() => window.__bw); const last = bw[bw.length - 1];
    assert.strictEqual(last[0], '/post'); assert.strictEqual(last[1].title, '2호선 지연'); assert.strictEqual(last[1].body, '강남역\n승강장 혼잡'); assert.strictEqual(last[1].cat, '잡담');
    assert.ok(await waitFor(A, async () => (await calls(A, 'setField')).filter(c => c.a.id === 'write').length >= 2, 6000), '네이티브 입력칸을 비우지 않았다');
    const sf = (await calls(A, 'setField')).filter(c => c.a.id === 'write'); assert.ok(sf.some(c => c.a.key === 'wt' && c.a.value === '') && sf.some(c => c.a.key === 'wb' && c.a.value === ''));
    assert.ok((await calls(A, 'toast')).some(c => /글이 등록되었어요/.test(c.a.text) && !/^[^\w가-힣]/.test(c.a.text)), JSON.stringify(await calls(A, 'toast')));
    assert.ok(await waitFor(A, async () => (await calls(A, 'hide')).length >= 1), '닫힌 뒤 네이티브를 숨기지 않았다');
    assert.strictEqual(await A.page.evaluate(() => String(window.toast)), toast0, '웹 toast 를 되돌려 놓지 않았다');
    assert.strictEqual(await A.page.evaluate(() => document.getElementById('wsheet').classList.contains('scrw-own')), false);
  });
  await t('다시 열면 웹 입력칸은 비어 있고 새 화면이 올라온다 · 닫기(wr.close)는 시트를 닫고 쓰던 글을 웹 입력칸에 남긴다', async () => {
    const n0 = (await puts(A)).length; await openW(A);
    assert.ok(await waitFor(A, async () => (await puts(A)).length > n0), '다시 안 올라왔다');
    assert.strictEqual(await A.page.evaluate(() => document.getElementById('wTitle').value), '');
    await act(A, { a: 'call', v: 'wr.close', fields: { wt: '쓰다 만 제목', wb: '' } });
    assert.ok(await waitFor(A, async () => !(await isOn(A))), '닫히지 않았다'); assert.strictEqual(await A.page.evaluate(() => document.getElementById('wTitle').value), '쓰다 만 제목');
  });
  await t('허용 목록 밖 행동은 무시한다', async () => {
    await openW(A); await waitFor(A, async () => (await isOn(A))); await A.page.waitForTimeout(1500);
    const cnt = async () => (await calls(A)).filter(c => c.m !== 'setRect').length, before = await cnt(), bw0 = await A.page.evaluate(() => window.__bw.length);
    await act(A, { a: 'call', v: 'wr.evil' }); await act(A, { a: 'call', v: 'rm_rf' }); await act(A, { a: 'set', key: 'x', on: true }); await act(A, { a: 'web', v: 'cm' });
    await A.page.waitForTimeout(400); assert.strictEqual(await cnt(), before); assert.strictEqual(await A.page.evaluate(() => window.__bw.length), bw0); assert.strictEqual(await isOn(A), true);
  });
  await t('입력 중(input 이벤트)에는 키보드로 시트가 움직여도 숨기지 않는다', async () => {
    const h0 = (await calls(A, 'hide')).length; await emit(A, 'input', { id: 'write', on: true });
    await A.page.evaluate(() => { document.getElementById('wsheet').style.bottom = '120px'; });
    await A.page.waitForTimeout(900); assert.strictEqual((await calls(A, 'hide')).length, h0, '입력 중인데 숨겼다');
    await A.page.evaluate(() => { document.getElementById('wsheet').style.bottom = ''; }); await emit(A, 'input', { id: 'write', on: false });
    assert.deepStrictEqual(A.errs, []); await A.ctx.close();
  });

  console.log('[④ 폴백·스위치]');
  await t('엔진이 죽으면(요청 실패) 그리지 않고 웹 시트 그대로 · 웹 등록이 된다', async () => {
    const x = await fresh({ plugin: true, on: true, serve: 'down' }); await openW(x); await x.page.waitForTimeout(2500);
    assert.strictEqual((await puts(x)).length, 0);
    await x.page.evaluate(() => { document.getElementById('wTitle').value = '웹 제목'; document.getElementById('wBody').value = '웹 내용'; submitPost(); });
    assert.ok(await waitFor(x, async () => (await x.page.evaluate(() => window.__bw.length)) === 1, 5000)); await x.ctx.close();
  });
  await t('플러그인 오류(error 이벤트) → 웹으로(웹 시트 속이 다시 보인다) · 스위치 껐다 켜면 복구', async () => {
    const x = await fresh({ plugin: true, on: true }); await openW(x); await waitFor(x, async () => (await puts(x)).length >= 1);
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('wsheet').classList.contains('scrw-own')), true);
    await emit(x, 'error', { id: 'write', message: 'boom', kind: 'exception' }); await x.page.waitForTimeout(250);
    let s = await x.page.evaluate(() => ({ f: window._scrWrite.S.failed, n: window._scrWrite.S.fails, own: document.getElementById('wsheet').classList.contains('scrw-own') })); assert.ok(s.f && s.n === 1 && !s.own, JSON.stringify(s));
    assert.ok((await calls(x, 'destroy')).length >= 1);
    await x.page.evaluate(() => window._scrwSetUse(false)); await x.page.waitForTimeout(100); assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scrw_on')), '0');
    await x.page.evaluate(() => window._scrwSetUse(true)); await x.page.waitForTimeout(100);
    s = await x.page.evaluate(() => ({ f: window._scrWrite.S.failed, n: window._scrWrite.S.fails })); assert.ok(!s.f && s.n === 0, JSON.stringify(s)); await x.ctx.close();
  });

  await b.close();
  console.log(`\nscreen_write_js: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
