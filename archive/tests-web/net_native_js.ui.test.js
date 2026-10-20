// 네이티브 통신(앱 본체가 엔진 화면 요청을 대신 보냄) 웹 연결 시험 — 2026-10-20 (s82)
//   · 스위치가 꺼져 있거나 옛 APK(cap 18 미만)면 예전 웹 fetch · 켜면 엔진 요청을 플러그인 post 로 보내고 받은 글을 그대로 쓴다
//   · post 가 막히면 같은 요청을 웹 fetch 로 다시 보낸다(화면은 그대로 뜬다) · 연속 3번 실패하면 이번 실행 동안 접는다 · 서버가 4xx 로 답한 건 통신 실패로 세지 않는다
// 실행: node test/screen_talk_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const ET = require('../engine/dialog');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 800)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh(opt) {
    opt = opt || {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const x = { ctx, page, errs, reqs: [], posts: [], serve: opt.serve || 'ok', netMode: opt.netMode || 'ok' };
    await page.exposeFunction('__netPost', async (url, body, ms) => {
      x.posts.push({ url, body, ms });
      if (x.netMode === 'reject') throw new Error('net: down');
      if (x.netMode === '503') return { status: 503, body: 'x' };
      const j = JSON.parse(body); return { status: 200, body: JSON.stringify(ET.dialogScreen({ cap: Number(j.cap) || 0 }, j.f)) };
    });
    await page.route('**/*', async r => {
      const u = new URL(r.request().url()), req = r.request();
      if (u.protocol === 'file:') return r.continue();
      if (u.pathname === '/screen/dlg' && u.hostname.indexOf('route-v2') >= 0) {
        assert.strictEqual(req.method(), 'POST'); assert.ok(/text\/plain/.test(req.headers()['content-type'] || ''), '사전 요청이 필요한 형식으로 보냈다');
        const body = JSON.parse(req.postData() || '{}'); x.reqs.push(body);
        if (x.serve === 'down') return r.abort();
        const out = JSON.stringify(ET.dialogScreen({ cap: Number(body.cap) || 0 }, body.f)); 
        return r.fulfill({ status: JSON.parse(out).ok ? 200 : 400, contentType: 'application/json', body: out });
      }
      return r.abort();
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try { localStorage.setItem('locDisc', '1'); if (o.on) localStorage.setItem('gdm_scrd_on', '1'); if (o.net) localStorage.setItem('gdm_nnet_on', '1'); } catch (e) {}
      window.__sn = []; window.__snL = {}; window.__clip = []; try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__clip.push(t); return Promise.resolve(); } }, configurable: true }); } catch (e) {}
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const put = (m) => (a) => { window.__sn.push({ m, a: JSON.parse(JSON.stringify(a)) }); if (a.json != null) { try { const j = JSON.parse(a.json); if (j.v !== 1 || !Array.isArray(j.body)) throw 0; } catch (e) { return Promise.reject(new Error('invalid: 규격')); } } return Promise.resolve(); };
        const rec = (m) => (a) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { ScreenNative: {
          post: (a) => window.__netPost(a.url, a.body, a.timeoutMs),
          show: put('show'), update: put('update'), setRect: rec('setRect'), hide: rec('hide'), destroy: rec('destroy'), toast: rec('toast'), setField: rec('setField'),
          status: () => Promise.resolve(o.oldApk ? { visible: true, items: 4, age: 20, scroll: 0, cap: 17 } : { visible: true, items: 11, age: 20, scroll: 0, cap: 18 }),
          addListener: (n, f) => { (window.__snL[n] = window.__snL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.goto('file://' + html); await page.waitForTimeout(2200);
    await page.evaluate(() => { const ov = document.getElementById('locDiscOv'); if (ov) ov.remove(); });
    await page.evaluate(() => {
      switchTab('home', document.getElementById('ni-home'));
      window._fetchWeather = function (la, ln, cb) { cb({ temp: 12, txt: '맑음', rain: 0 }); };
    });
    await page.waitForTimeout(600);
    return x;
  }
  const calls = (x, m) => x.page.evaluate((m) => window.__sn.filter(c => !m || c.m === m), m || null);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await x.page.waitForTimeout(60); } return false; };
  const puts = async (x) => (await calls(x)).filter(c => (c.m === 'show' || c.m === 'update') && c.a.id === 'dlg');
  const lastPut = async (x) => { const p = await puts(x); return JSON.parse(p[p.length - 1].a.json); };
  const pop = (x, m) => x.page.evaluate((m) => { _pickPop(m, '둘째'); }, m);
  const H = 'https://route-v2.phg0643.workers.dev/screen/dlg';

  console.log('[① 꺼짐 · 옛 APK 는 예전 웹 fetch]');
  await t('스위치 꺼짐(기본): post 를 안 부르고 웹 fetch 로 엔진 화면이 뜬다', async () => {
    const x = await fresh({ plugin: true, on: true }); await x.page.waitForTimeout(600); await pop(x, '하나');
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000)); assert.strictEqual(x.posts.length, 0); assert.ok(x.reqs.length >= 1);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_nnet_on')), null); await x.ctx.close();
  });
  await t('옛 APK(cap 18 미만)면 켜져 있어도 post 를 안 부른다', async () => {
    const x = await fresh({ plugin: true, on: true, net: true, oldApk: true }); await x.page.waitForTimeout(600); await x.page.evaluate(() => { _nnet.use(); }); await x.page.waitForTimeout(400);
    await x.page.evaluate(() => { window._ndlg.close(); }); await pop(x, '하나');
    await x.page.waitForTimeout(1800); assert.strictEqual(x.posts.length, 0); await x.ctx.close();
  });

  console.log('[② 켜면 앱 본체가 대신 보낸다]');
  await t('엔진 요청이 post 로 가고(웹 fetch 없음) 받은 글 그대로 그려진다', async () => {
    const x = await fresh({ plugin: true, on: true, net: true }); await x.page.waitForTimeout(600); await x.page.evaluate(() => { _nnet.use(); }); await x.page.waitForTimeout(400);
    const w0 = x.reqs.length; await pop(x, '앱 본체');
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000), 'show 가 없다');
    assert.ok(x.posts.length >= 1 && x.posts[0].url === H && x.reqs.length === w0, 'post ' + x.posts.length + ' / 웹 ' + (x.reqs.length - w0));
    assert.strictEqual(JSON.parse(x.posts[0].body).f.msg, '앱 본체'); assert.strictEqual((await lastPut(x)).head[0].s, '앱 본체'); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('post 가 막히면 같은 요청을 웹 fetch 로 다시 보내 화면이 뜬다', async () => {
    const x = await fresh({ plugin: true, on: true, net: true, netMode: 'reject' }); await x.page.waitForTimeout(600); await x.page.evaluate(() => { _nnet.use(); }); await x.page.waitForTimeout(400);
    await pop(x, '되돌림'); assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000), 'show 가 없다');
    assert.ok(x.posts.length >= 1 && x.reqs.length >= 1); assert.strictEqual((await lastPut(x)).head[0].s, '되돌림'); await x.ctx.close();
  });
  await t('연속 3번 실패하면 이번 실행 동안 접고(설정 카드에 알림) 이후엔 post 를 안 부른다', async () => {
    const x = await fresh({ plugin: true, on: true, net: true, netMode: 'reject' }); await x.page.waitForTimeout(600); await x.page.evaluate(() => { _nnet.use(); }); await x.page.waitForTimeout(400);
    for (let i = 0; i < 4; i++) { await x.page.evaluate((i) => { window._ndlg.close(); _pickPop('실패 ' + i, ''); }, i); await x.page.waitForTimeout(500); }
    assert.ok(await waitFor(x, async () => await x.page.evaluate(() => _nnet.S.bad), 6000), '접지 않았다');
    const n = x.posts.length; await x.page.evaluate(() => { window._ndlg.close(); _pickPop('접은 뒤', ''); }); await x.page.waitForTimeout(900); assert.strictEqual(x.posts.length, n);
    assert.ok(/문제가 있어/.test(await x.page.evaluate(() => document.getElementById('nnetSetStat').textContent))); await x.ctx.close();
  });
  await t('서버가 5xx 로 답해도 통신 실패로 세지 않는다(웹 fetch 가 대신 받는다)', async () => {
    const x = await fresh({ plugin: true, on: true, net: true, netMode: '503' }); await x.page.waitForTimeout(600); await x.page.evaluate(() => { _nnet.use(); }); await x.page.waitForTimeout(400);
    for (let i = 0; i < 4; i++) { await x.page.evaluate((i) => { window._ndlg.close(); _pickPop('오류 ' + i, ''); }, i); await x.page.waitForTimeout(450); }
    assert.strictEqual(await x.page.evaluate(() => _nnet.S.bad), false); assert.ok(x.posts.length >= 3); await x.ctx.close();
  });

  console.log('[③ 설정]');
  await t('설정 카드가 있고 스위치가 저장된다', async () => {
    const x = await fresh({ plugin: true, on: true });
    await x.page.waitForTimeout(1500);
    const o = await x.page.evaluate(() => ({ c: !!document.getElementById('nnetSetCard'), on: !!document.getElementById('nnetSetOn'), st: !!document.getElementById('nnetSetStat'), disp: document.getElementById('nnetSetCard').style.display }));
    assert.deepStrictEqual(o, { c: true, on: true, st: true, disp: 'block' });
    await x.page.evaluate(() => window._nnetSetUse(true)); assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_nnet_on')), '1');
    await x.page.evaluate(() => window._nnetSetUse(false)); assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_nnet_on')), '0'); await x.ctx.close();
  });

  await b.close();
  console.log(fail ? ('FAIL ' + fail + ' / ' + (pass + fail)) : ('ALL OK ' + pass)); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
