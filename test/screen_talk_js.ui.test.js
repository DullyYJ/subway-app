// 서버 구동 네이티브 홈 '실시간 대화' 게시판(talk) 웹 연결 시험 — 2026-10-20 (s78)
//   원칙: "계산은 엔진이, 그림은 앱이". 앱은 사실(받아 둔 대화 · 접을 줄 수 · 시간대)만 보내고, 머리줄·줄 수·시각 글·높이·입력줄은 엔진이 정한다.
//   · 플러그인이 없거나 꺼져 있거나 옛 APK(cap 15 미만)면 요청 없이 웹 그대로 · 켜면 #homeTalkInner 를 덮고 size 이벤트로 높이를 따른다
//   · 웹이 DOM 으로 그린 최근 5줄(닉네임·글·시각)과 엔진이 내려준 줄이 한 글자도 다르지 않다 · 접힘(data-hf) 줄 수 · 머리줄(tk.open) · 보내기(tk.send)
// 실행: node test/screen_talk_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const ET = require('../engine/talkcard');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 800)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh(opt) {
    opt = opt || {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const x = { ctx, page, errs, reqs: [], serve: opt.serve || 'ok' };
    await page.route('**/*', async r => {
      const u = new URL(r.request().url()), req = r.request();
      if (u.protocol === 'file:') return r.continue();
      if (u.pathname === '/screen/talk' && u.hostname.indexOf('route-v2') >= 0) {
        assert.strictEqual(req.method(), 'POST'); assert.ok(/text\/plain/.test(req.headers()['content-type'] || ''), '사전 요청이 필요한 형식으로 보냈다');
        const body = JSON.parse(req.postData() || '{}'); x.reqs.push(body);
        if (x.serve === 'down') return r.abort();
        const out = JSON.stringify(ET.talkScreen({ cap: Number(body.cap) || 0 }, body.f)); 
        return r.fulfill({ status: JSON.parse(out).ok ? 200 : 400, contentType: 'application/json', body: out });
      }
      return r.abort();
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try { localStorage.setItem('locDisc', '1'); if (o.on) localStorage.setItem('gdm_sclt_on', '1'); } catch (e) {}
      window.__sn = []; window.__snL = {};
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const put = (m) => (a) => { window.__sn.push({ m, a: JSON.parse(JSON.stringify(a)) }); if (a.json != null) { try { const j = JSON.parse(a.json); if (j.v !== 1 || !Array.isArray(j.body)) throw 0; } catch (e) { return Promise.reject(new Error('invalid: 규격')); } } return Promise.resolve(); };
        const rec = (m) => (a) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { ScreenNative: {
          show: put('show'), update: put('update'), setRect: rec('setRect'), hide: rec('hide'), destroy: rec('destroy'), toast: rec('toast'), setField: rec('setField'),
          status: () => Promise.resolve(o.oldApk ? { visible: true, items: 4, age: 20, scroll: 0, cap: 14 } : { visible: true, items: 11, age: 20, scroll: 0, cap: 15 }),
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
    await page.evaluate(() => { document.querySelector('.livetalk-board').scrollIntoView({ block: 'center' }); });      // 화면 밖의 카드는 기기가 그리지 않는다 — 보이게 둔다
    await page.waitForTimeout(300);
    return x;
  }
  const calls = (x, m) => x.page.evaluate((m) => window.__sn.filter(c => !m || c.m === m), m || null);
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__snEmit(n, d), [n, d || {}]);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await x.page.waitForTimeout(60); } return false; };
  const puts = async (x) => (await calls(x)).filter(c => (c.m === 'show' || c.m === 'update') && c.a.id === 'talk');
  const own = (x) => x.page.evaluate(() => document.getElementById('homeTalkInner').classList.contains('lt-own'));
  const lastReq = (x) => x.reqs[x.reqs.length - 1];
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const T0 = Date.UTC(2026, 9, 20, 5, 41);      // 2026-10-20 14:41 KST
  // 대화를 시험이 정한 것으로 바꾼다(앱 스스로 만드는 가짜 대화는 멈춘다)
  const setTalk = (x, rows) => x.page.evaluate((rows) => {
    try { clearTimeout(window._ltTimer); } catch (e) {} window._scheduleLiveTalk = function () {}; window._ltGenerate = function () {};
    _LIVE_TALK.length = 0; rows.forEach(r => _LIVE_TALK.push({ nick: r[0], text: r[1], time: r[2], mine: !!r[3] })); _renderLiveTalk();
  }, rows);
  const ROWS = [['가나다', '첫째 글', T0], ['라마', '둘째 글입니다', T0 + 60000], ['바사', '셋째', T0 + 120000, 1], ['아자', '넷째 글', T0 + 180000], ['차카', '다섯째 글', T0 + 240000], ['타파', '여섯째 글', T0 + 300000]];
  const webRows = (x) => x.page.evaluate(() => Array.from(document.querySelectorAll('#liveTalkList .livetalk-msg')).map(r => [r.querySelector('.livetalk-nick').textContent, r.querySelector('.livetalk-text').textContent, r.querySelector('.livetalk-time').textContent]));
  const engRows = (j) => j.head.filter(n => n.t === 'ltr').map(n => [n.nick, n.s, n.time]);
  const lastPut = async (x) => { const p = await puts(x); return JSON.parse(p[p.length - 1].a.json); };

  console.log('[① 플러그인이 없거나 꺼져 있거나 옛 APK 면 예전 그대로]');
  await t('플러그인이 없으면(웹): 요청 없음 · 웹 게시판 그대로', async () => {
    const x = await fresh({ plugin: false, on: true }); await setTalk(x, ROWS); await x.page.waitForTimeout(1200);
    assert.strictEqual(x.reqs.length, 0); assert.strictEqual(await own(x), false); assert.strictEqual((await webRows(x)).length, 5); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('꺼져 있으면(기본) 호출·요청 없음', async () => {
    const x = await fresh({ plugin: true, on: false }); await setTalk(x, ROWS); await x.page.waitForTimeout(1500);
    assert.strictEqual((await calls(x)).filter(c => c.a && c.a.id === 'talk').length, 0); assert.strictEqual(x.reqs.length, 0);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_sclt_on')), null); await x.ctx.close();
  });
  await t('옛 APK(cap 15 미만)면 켜져 있어도 요청 없음', async () => {
    const x = await fresh({ plugin: true, on: true, oldApk: true }); await setTalk(x, ROWS); await x.page.waitForTimeout(1800);
    assert.strictEqual(x.reqs.length, 0); assert.strictEqual(await own(x), false); await x.ctx.close();
  });

  console.log('[② 켜면 덮고 엔진이 정한 그대로 그린다]');
  await t('요청은 사실뿐(머리줄·시각 글 없음) · cap 15 · 엔진 화면을 그대로 show · 웹 속을 가린다', async () => {
    const x = await fresh({ plugin: true, on: true }); await setTalk(x, ROWS);
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1 && x.reqs.some(r => r.f.m.length && r.f.m[r.f.m.length - 1][1] === '여섯째 글'), 9000), 'show 가 없다');
    const q = x.reqs.filter(r => r.f.m.length && r.f.m[r.f.m.length - 1][1] === '여섯째 글').pop();
    assert.strictEqual(q.cap, 15); assert.strictEqual(q.f.m.length, 6); assert.deepStrictEqual(q.f.m[2], ['바사', '셋째', T0 + 120000, 1]); assert.strictEqual(q.f.fold, 0); assert.strictEqual(q.f.tzo, -540);
    assert.ok(!/실시간 대화|14:4|보내기/.test(JSON.stringify(q.f)), '요청에 문구·시각 글이 있다');
    const j = await lastPut(x), eng = ET.talkScreen({ cap: 15 }, q.f); assert.deepStrictEqual(j, JSON.parse(JSON.stringify(eng))); assert.strictEqual(j.screen, 'talk');
    assert.ok(await waitFor(x, async () => await own(x), 6000), '웹 게시판 속을 안 가렸다'); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t("'size' 이벤트로 감싸개 높이를 따른다 · 끄면 걷고 설정이 0 으로 저장된다", async () => {
    const x = await fresh({ plugin: true, on: true }); await setTalk(x, ROWS);
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000));
    const nat = await x.page.evaluate(() => document.getElementById('homeTalkInner').offsetHeight);
    assert.ok(Math.abs(nat - 189) <= 4, '웹 게시판 속 높이(' + nat + ')가 엔진이 계산한 189(머리 21 + 줄 120 + 간격 10 + 입력 38)와 다르다');
    await emit(x, 'size', { id: 'talk', h: 150 }); await x.page.waitForTimeout(150);
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('homeTalkInner').offsetHeight), 150);
    await x.page.evaluate(() => window._scltSetUse(false)); await x.page.waitForTimeout(250);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_sclt_on')), '0'); assert.strictEqual(await own(x), false);
    assert.notStrictEqual(await x.page.evaluate(() => document.getElementById('homeTalkInner').offsetHeight), 150); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  console.log('[③ 웹이 그리던 최근 줄과 엔진 줄이 같다]');
  await t('최근 5줄: 닉네임 · 글 · 시각이 웹 DOM 과 한 글자도 다르지 않다', async () => {
    const x = await fresh({ plugin: true, on: true }); await setTalk(x, ROWS);
    assert.ok(await waitFor(x, async () => x.reqs.length >= 1 && (await puts(x)).length >= 1, 9000)); await x.page.waitForTimeout(500);
    const web = await webRows(x), j = await lastPut(x), eng = engRows(j);
    assert.strictEqual(web.length, 5); assert.deepStrictEqual(eng.map(r => r.map(norm)), web.map(r => r.map(norm)), JSON.stringify(web) + ' vs ' + JSON.stringify(eng));
    assert.strictEqual(web[0][2], '14:42'); await x.ctx.close();
  });
  await t('줄이 모자라거나 비어도 게시판 높이(120)는 그대로 · 시각은 이 기기 시간대', async () => {
    for (const rows of [[], ROWS.slice(0, 2)]) {
      const x = await fresh({ plugin: true, on: true }); await setTalk(x, rows);
      assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1 && x.reqs.some(r => r.f.m.length === rows.length), 9000));
      const web = await webRows(x), j = await lastPut(x); assert.deepStrictEqual(engRows(j).map(r => r.map(norm)), web.map(r => r.map(norm)));
      const h = j.head.reduce((s, n) => s + (n.t === 'ltr' ? 20 : n.t === 'spacer' ? n.h : 0), 0) + 5 * Math.max(0, j.head.filter(n => n.t === 'ltr').length - 1); assert.strictEqual(h, 120);
      await x.ctx.close();
    }
  });
  await t('작은 폰에서 웹이 줄을 접으면(data-hf) 사실(fold)로 알리고 엔진이 줄 수·높이를 줄인다', async () => {
    const x = await fresh({ plugin: true, on: true }); await setTalk(x, ROWS);
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000));
    for (const fold of [2, 1, 3, 0]) {
      const n0 = x.reqs.length; await x.page.evaluate((f) => { const h = document.getElementById('tab-home'); if (f) h.setAttribute('data-hf', String(f)); else h.removeAttribute('data-hf'); }, fold);
      assert.ok(await waitFor(x, async () => x.reqs.length > n0 && lastReq(x).f.fold === fold, 8000), 'fold ' + fold + ' 를 안 알렸다');
      assert.ok(await waitFor(x, async () => (await lastPut(x)).info.fold === fold, 8000));
      const j = await lastPut(x); assert.strictEqual(j.head.filter(n => n.t === 'ltr').length, 5 - fold);
    }
    await x.ctx.close();
  });
  await t('새 대화가 들어오면 다시 그린다 · 같은 사실이면 요청이 늘지 않는다', async () => {
    const x = await fresh({ plugin: true, on: true }); await setTalk(x, ROWS);
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000)); await x.page.waitForTimeout(900);
    const n0 = x.reqs.length; await x.page.waitForTimeout(2200); assert.strictEqual(x.reqs.length, n0, '가만히 있는데 요청이 늘었다');
    await x.page.evaluate((t) => { _ltAdd({ nick: '새손님', text: '방금 온 글', time: t, mine: false }); }, T0 + 360000);
    assert.ok(await waitFor(x, async () => x.reqs.length > n0 && lastReq(x).f.m.slice(-1)[0][1] === '방금 온 글', 8000));
    assert.ok(await waitFor(x, async () => engRows(await lastPut(x)).slice(-1)[0][1] === '방금 온 글', 8000)); await x.ctx.close();
  });

  console.log('[④ 누르는 동작: 머리줄 · 보내기]');
  await t('머리줄(tk.open)은 커뮤니티 실시간소통으로 · 모르는 행동은 무시', async () => {
    const x = await fresh({ plugin: true, on: true }); await setTalk(x, ROWS); assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000));
    await x.page.evaluate(() => { window.__go = 0; window._goCommunityChat = function () { window.__go++; }; });
    await emit(x, 'action', { id: 'talk', a: 'call', v: 'tk.open' }); await x.page.waitForTimeout(100);
    assert.strictEqual(await x.page.evaluate(() => window.__go), 1);
    await emit(x, 'action', { id: 'talk', a: 'call', v: 'tk.evil' }); await emit(x, 'action', { id: 'talk', a: 'open', url: 'https://x.test' }); await x.page.waitForTimeout(100);
    assert.strictEqual(await x.page.evaluate(() => window.__go), 1); await x.ctx.close();
  });
  await t('보내기(tk.send): 입력된 글을 예전 보내기 함수로 넘기고, 올라가면 입력칸을 비운다', async () => {
    const x = await fresh({ plugin: true, on: true }); await setTalk(x, ROWS); assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000));
    await x.page.evaluate(() => { window.__sent = []; window._requireCommId = function () { return true; }; window._getCommId = function () { return '시험이'; }; window._serverPostTalk = function (n, t) { window.__sent.push([n, t]); }; });
    await emit(x, 'action', { id: 'talk', a: 'call', v: 'tk.send', fields: { 'talk.in': '  안녕하세요 반가워요  ' } }); await x.page.waitForTimeout(250);
    assert.deepStrictEqual(await x.page.evaluate(() => window.__sent), [['시험이', '안녕하세요 반가워요']]);
    const sf = (await calls(x, 'setField')).filter(c => c.a.id === 'talk' && c.a.key === 'talk.in'); assert.ok(sf.length >= 1 && sf[sf.length - 1].a.value === '', '입력칸을 안 비웠다');
    assert.ok(await waitFor(x, async () => engRows(await lastPut(x)).slice(-1)[0][1] === '안녕하세요 반가워요', 8000), '내 글이 안 올라왔다');
    // 빈 글 · 아이디 없음 · 욕설은 올리지 않고 입력칸도 그대로
    const sf0 = (await calls(x, 'setField')).length;
    await emit(x, 'action', { id: 'talk', a: 'call', v: 'tk.send', fields: { 'talk.in': '   ' } });
    await x.page.evaluate(() => { window._requireCommId = function () { return false; }; });
    await emit(x, 'action', { id: 'talk', a: 'call', v: 'tk.send', fields: { 'talk.in': '아이디 없음' } }); await x.page.waitForTimeout(250);
    assert.strictEqual((await x.page.evaluate(() => window.__sent)).length, 1); assert.strictEqual((await calls(x, 'setField')).length, sf0, '실패했는데 입력칸을 비웠다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  console.log('[⑤ 폴백]');
  await t('엔진이 죽으면 웹 게시판 그대로', async () => {
    const x = await fresh({ plugin: true, on: true, serve: 'down' }); await setTalk(x, ROWS);
    assert.ok(await waitFor(x, async () => x.reqs.length >= 1, 8000)); await x.page.waitForTimeout(1200);
    assert.strictEqual(await own(x), false); assert.strictEqual((await webRows(x)).length, 5); await x.ctx.close();
  });
  await t('설정 카드가 있다', async () => {
    const x = await fresh({ plugin: true, on: true });
    const o = await x.page.evaluate(() => ({ c: !!document.getElementById('scltSetCard'), on: !!document.getElementById('scltSetOn'), st: !!document.getElementById('scltSetStat') }));
    assert.deepStrictEqual(o, { c: true, on: true, st: true }); await x.ctx.close();
  });

  await b.close();
  console.log(fail ? ('FAIL ' + fail + ' / ' + (pass + fail)) : ('ALL OK ' + pass)); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
