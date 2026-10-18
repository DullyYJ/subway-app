// 서버 구동 네이티브 홈 경로 입력 ↔ 앱(JS) 연결 시험 — 2026-10-18
//   원칙: "계산은 엔진이, 그림은 앱이". 가짜 ScreenNative 플러그인 + 가짜 엔진(POST /screen/home → engine/home.js 의 실제 출력)으로 확인한다:
//   · 플러그인이 없거나 스위치가 꺼져 있으면(기본) 예전 그대로 — 호출·요청 없음 · 웹 홈 카드가 그대로
//   · 켜면: 입력칸 글자·눌린 칸·후보(STNDB)를 엔진에 보내고(cap=7) 엔진 JSON 을 그대로 플러그인에 넘긴다 · 사각형은 감싸개(#homeRouteWrap) · 높이는 'size' 이벤트를 따른다
//   · 글자 바뀜(text 이벤트)은 웹 입력칸에 옮겨 적고 · 후보 고르기(sg.u.N)는 예전 _fmapSetLocation 으로 · 바꾸기/경로 탐색/위치 감지/기준시각은 예전 웹 함수로
//   · 폴백: 엔진이 죽으면 웹 카드
// 실행: node test/screen_home_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const EH = require('../engine/home');
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
      if (u.pathname === '/screen/home' && u.hostname.indexOf('route-v2') >= 0) {
        assert.strictEqual(req.method(), 'POST'); assert.ok(/text\/plain/.test(req.headers()['content-type'] || ''), '사전 요청이 필요한 형식으로 보냈다');
        const body = JSON.parse(req.postData() || '{}'); x.reqs.push(body);
        if (x.serve === 'down') return r.abort();
        x.lastBody = JSON.stringify(EH.homeScreen({ cap: Number(body.cap) || 0 }, body.f, body.d));
        return r.fulfill({ status: 200, contentType: 'application/json', body: x.lastBody });
      }
      return r.abort();
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try { localStorage.setItem('locDisc', '1'); if (o.on) localStorage.setItem('gdm_scrh_on', '1'); } catch (e) {}
      window.__sn = []; window.__snL = {};
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const put = (m) => (a) => { window.__sn.push({ m, a: JSON.parse(JSON.stringify(a)) }); if (a.json != null) { try { const j = JSON.parse(a.json); if (j.v !== 1 || !Array.isArray(j.body)) throw 0; } catch (e) { return Promise.reject(new Error('invalid: 규격')); } } return Promise.resolve({ items: 8 }); };
        const rec = (m) => (a) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { ScreenNative: {
          show: put('show'), update: put('update'), setRect: rec('setRect'), hide: rec('hide'), destroy: rec('destroy'), toast: rec('toast'), setField: rec('setField'),
          status: () => Promise.resolve({ visible: true, items: 10, age: 20, scroll: 0 }),
          addListener: (n, f) => { (window.__snL[n] = window.__snL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.goto('file://' + html); await page.waitForTimeout(2200);
    await page.evaluate(() => { const ov = document.getElementById('locDiscOv'); if (ov) ov.remove(); });
    // 결정적으로: 네트워크 후보(버스·카카오)는 가짜, 경로 탐색 같은 큰 일은 호출만 기록
    await page.evaluate(() => {
      window.__calls = [];
      window._busStopSearchByName = function (q, cb) { window.__calls.push(['bus', q]); setTimeout(() => cb([{ nodenm: q + '정류장', nodeid: 'N1', dist: 350, gpslati: '37.5', gpslong: '127.0' }]), 10); };
      window._kakaoLocal = function (p, qs) { window.__calls.push(['kakao', qs]); return Promise.resolve({ ok: true, json: () => Promise.resolve({ documents: [{ place_name: '강남 카페', road_address_name: '서울 강남구', y: '37.49', x: '127.03' }] }) }); };
      window.fmapDoRoute = function () { window.__calls.push(['route']); };
      window.openDtPicker = function () { window.__calls.push(['pick']); };
      window.fmapGpsLocate = function () { window.__calls.push(['gps']); };
    });
    return x;
  }
  const calls = (x, m, id) => x.page.evaluate(([m, id]) => window.__sn.filter(c => (!m || c.m === m) && (!id || (c.a && c.a.id === id))), [m, id || null]);
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__snEmit(n, d), [n, d || {}]);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await x.page.waitForTimeout(60); } return false; };
  const puts = (x) => async () => (await calls(x, 'show', 'home')).length + (await calls(x, 'update', 'home')).length;
  const lastPut = async (x) => { const c = (await calls(x, null, 'home')).filter(c => c.m === 'show' || c.m === 'update'); return c[c.length - 1]; };
  const act = (x, d) => emit(x, 'action', Object.assign({ id: 'home' }, d));
  const wcalls = (x) => x.page.evaluate(() => window.__calls.slice());
  const S = (x) => x.page.evaluate(() => { const s = window._scrHome.S; return { shown: s.shown, ready: s.ready, good: s.good, failed: s.failed, fails: s.fails, why: s.why }; });

  console.log('[① 플러그인이 없거나 꺼져 있으면 예전 그대로]');
  await t('플러그인이 없으면: 요청도 호출도 없다 · 설정 카드 안 보임 · 웹 카드 그대로(감싸개 높이 안 건드림)', async () => {
    const x = await fresh({ plugin: false, on: true }); await x.page.waitForTimeout(1500);
    assert.strictEqual(await x.page.evaluate(() => getComputedStyle(document.getElementById('scrhSetCard')).display), 'none');
    assert.strictEqual(x.reqs.length, 0);
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('homeRouteWrap').style.height), '');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('플러그인이 있어도 꺼져 있으면(기본): 호출·요청 없음 · 카드는 보이고 스위치는 꺼짐', async () => {
    const x = await fresh({ plugin: true, on: false }); await x.page.waitForTimeout(1800);
    assert.strictEqual((await calls(x)).length, 0); assert.strictEqual(x.reqs.length, 0);
    const c = await x.page.evaluate(() => ({ d: getComputedStyle(document.getElementById('scrhSetCard')).display, on: document.getElementById('scrhSetOn').checked, s: document.getElementById('scrhSetStat').textContent }));
    assert.strictEqual(c.d, 'block'); assert.strictEqual(c.on, false); assert.ok(/꺼짐/.test(c.s), c.s);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  console.log('[② 켜면]');
  const A = await fresh({ plugin: true, on: true });
  await t('처음: 원자료를 엔진에 보내고(cap=7) 받은 JSON 을 한 글자도 안 고치고 show · 사각형은 감싸개', async () => {
    assert.ok(await waitFor(A, async () => (await puts(A)()) >= 1), 'show 가 없다');
    const q = A.reqs[A.reqs.length - 1];
    assert.strictEqual(q.cap, 7); assert.strictEqual(q.f.start, ''); assert.strictEqual(q.f.dest, ''); assert.strictEqual(q.f.active, '');
    assert.strictEqual(q.f.startSet, false); assert.strictEqual(q.f.destSet, false); assert.strictEqual(q.f.base.ms, null); assert.strictEqual(q.f.base.tzo, -540);
    assert.strictEqual(q.f.base.today.length, 3);
    const c = await lastPut(A);
    assert.strictEqual(c.m, 'show'); assert.strictEqual(c.a.json, A.lastBody);
    const g = await A.page.evaluate(() => { const r = document.getElementById('homeRouteWrap').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; });
    assert.ok(Math.abs(c.a.x - g.x) < 1.5 && Math.abs(c.a.y - g.y) < 1.5 && Math.abs(c.a.w - g.w) < 1.5, '사각형 ' + JSON.stringify([c.a.x, c.a.y, c.a.w, g]));
    assert.ok(c.a.clip && c.a.clip.b > 30, 'clip');
    assert.ok(c.a.palette && c.a.palette.card2, '팔레트');
    assert.deepStrictEqual(A.errs, []);
  });
  await t("'size' 이벤트: 감싸개 높이가 네이티브 내용 높이를 따른다", async () => {
    await emit(A, 'size', { id: 'home', h: 148 });
    assert.ok(await waitFor(A, async () => (await A.page.evaluate(() => document.getElementById('homeRouteWrap').getBoundingClientRect().height)) === 148));
    await emit(A, 'size', { id: 'other', h: 999 });
    assert.strictEqual(await A.page.evaluate(() => document.getElementById('homeRouteWrap').style.height), '148px');
    assert.ok(await waitFor(A, async () => (await calls(A, 'setRect', 'home')).some(c => Math.abs(c.a.h - 148) < 1.5)), '새 높이로 setRect');
  });
  await t("text focus/edit: 웹 입력칸에 옮겨 적고 · 후보(지하철+버스+장소)를 모아 엔진에 보내고 · 받은 화면을 update", async () => {
    const n0 = await puts(A)();
    await emit(A, 'text', { id: 'home', key: 'start', value: '강남', kind: 'focus' });
    await emit(A, 'text', { id: 'home', key: 'start', value: '강남', kind: 'edit' });
    assert.strictEqual(await A.page.evaluate(() => document.getElementById('fmapStartInp').value), '강남');
    assert.ok(await waitFor(A, async () => { const q = A.reqs[A.reqs.length - 1]; return q.f.active === 'start' && q.d.u && q.d.u.length > 0 && q.d.b && q.d.b.length > 0 && q.d.p && q.d.p.length > 0; }), '후보가 안 모였다 ' + JSON.stringify(A.reqs[A.reqs.length - 1]));
    const q = A.reqs[A.reqs.length - 1];
    assert.ok(q.d.u[0].n.indexOf('강남') >= 0 && typeof q.d.u[0].l === 'string'); assert.strictEqual(q.d.b[0].n, '강남정류장'); assert.strictEqual(q.d.b[0].d, 350); assert.strictEqual(q.d.p[0].n, '강남 카페');
    assert.ok(await waitFor(A, async () => (await puts(A)()) > n0));
    const c = await lastPut(A); assert.strictEqual(c.m, 'update'); assert.strictEqual(c.a.json, A.lastBody);
    const kids = JSON.parse(c.a.json).body[0].kids; assert.ok(kids.filter(k => k.act && /^sg\./.test(k.act.v)).length >= 3, '후보 줄');
    const w = await wcalls(A); assert.strictEqual(w.filter(c => c[0] === 'bus').length, 1, '버스 검색은 글자마다 아니라 한 번(디바운스)');
  });
  await t("후보 고르기(sg.u.0): 예전 _fmapSetLocation 으로 출발이 정해지고 · 입력칸 비우기/채우기(setField) · 후보가 사라진다", async () => {
    await A.page.evaluate(() => { window.__loc = []; const o = window._fmapSetLocation; window._fmapSetLocation = function (k, l) { window.__loc.push([k, l]); return o.apply(this, arguments); }; });
    const q = A.reqs[A.reqs.length - 1], name = q.d.u[0].n;
    await emit(A, 'text', { id: 'home', key: 'start', value: '강남', kind: 'blur' });
    await act(A, { a: 'call', v: 'sg.u.0', fields: { start: '강남', dest: '' } });
    const loc = await A.page.evaluate(() => window.__loc);
    assert.strictEqual(loc.length, 1); assert.strictEqual(loc[0][0], 'start'); assert.strictEqual(loc[0][1].type, 'subway'); assert.strictEqual(loc[0][1].name, name);
    assert.strictEqual(await A.page.evaluate(() => document.getElementById('fmapStartInp').value), name);
    const sf = (await calls(A, 'setField', 'home')).pop().a; assert.strictEqual(sf.key, 'start'); assert.strictEqual(sf.value, name);
    assert.ok(await waitFor(A, async () => { const r = A.reqs[A.reqs.length - 1]; return r.f.startSet === true && r.f.active === ''; }), '출발이 정해진 상태가 안 갔다');
    const c = await lastPut(A); assert.strictEqual(JSON.parse(c.a.json).body[0].kids.filter(k => k.act && /^sg\./.test(k.act.v)).length, 0);
  });
  await t("도착 입력 + 경로 탐색(rt.go): 두 칸이 차 있으면 예전 fmapDoRoute · 비어 있으면 안 부른다", async () => {
    await A.page.evaluate(() => { document.getElementById('fmapDestInp').value = ''; });
    await act(A, { a: 'call', v: 'rt.go', fields: { start: '강남역', dest: '' } });
    assert.strictEqual((await wcalls(A)).filter(c => c[0] === 'route').length, 0);
    await act(A, { a: 'call', v: 'rt.go', fields: { start: '강남역', dest: '용두' } });
    assert.strictEqual((await wcalls(A)).filter(c => c[0] === 'route').length, 1);
    assert.strictEqual(await A.page.evaluate(() => document.getElementById('fmapDestInp').value), '용두', '글자를 웹 입력칸에 옮겨 적었다');
    await act(A, { a: 'call', v: 'rt.enter', fields: { start: '강남역', dest: '용두' } });
    assert.strictEqual((await wcalls(A)).filter(c => c[0] === 'route').length, 2);
  });
  await t("바꾸기(rt.swap) · 위치 감지(rt.gps) · 기준시각(bt.pick / bt.now)", async () => {
    await A.page.evaluate(() => { document.getElementById('fmapStartInp').value = 'A역'; document.getElementById('fmapDestInp').value = 'B역'; window.swapFmapRoute = function () { const s = document.getElementById('fmapStartInp'), d = document.getElementById('fmapDestInp'), v = s.value; s.value = d.value; d.value = v; window.__calls.push(['swap']); }; });
    await act(A, { a: 'call', v: 'rt.swap', fields: { start: 'A역', dest: 'B역' } });
    assert.ok((await wcalls(A)).some(c => c[0] === 'swap'));
    const sfs = (await calls(A, 'setField', 'home')).slice(-2).map(c => [c.a.key, c.a.value]);
    assert.deepStrictEqual(sfs, [['start', 'B역'], ['dest', 'A역']]);
    await act(A, { a: 'call', v: 'rt.gps' }); assert.ok((await wcalls(A)).some(c => c[0] === 'gps'));
    await act(A, { a: 'call', v: 'bt.pick' }); assert.ok((await wcalls(A)).some(c => c[0] === 'pick'));
    await A.page.evaluate(() => { _baseTimeMs = Date.now() + 3600000; });
    assert.ok(await waitFor(A, async () => { const r = A.reqs[A.reqs.length - 1]; return r.f.base.ms != null; }), '기준시각 ms 가 엔진에 갔다');
    const nBefore = (await wcalls(A)).length;
    await A.page.evaluate(() => { window.clearBaseTime = function () { _baseTimeMs = null; window.__calls.push(['now']); }; });
    await act(A, { a: 'call', v: 'bt.now' });
    assert.ok((await wcalls(A)).some(c => c[0] === 'now'));
    assert.ok(await waitFor(A, async () => A.reqs[A.reqs.length - 1].f.base.ms === null));
    assert.ok((await wcalls(A)).length > nBefore);
  });
  await t("허용 목록 밖의 행동은 무시한다", async () => {
    const before = (await wcalls(A)).length;
    await act(A, { a: 'call', v: 'evil.run' }); await act(A, { a: 'call', v: 'sg.x.0' }); await act(A, { a: 'open', url: 'https://x.test' });
    assert.strictEqual((await wcalls(A)).length, before);
    assert.deepStrictEqual(A.errs, []);
  });
  await A.ctx.close();

  console.log('[③ 폴백 · 스위치]');
  await t('엔진이 죽으면: 네이티브를 안 올리고 웹 카드가 그대로 · 감싸개 높이 안 건드림', async () => {
    const x = await fresh({ plugin: true, on: true, serve: 'down' }); await x.page.waitForTimeout(2500);
    assert.strictEqual((await calls(x, 'show')).length, 0);
    assert.strictEqual(await x.page.evaluate(() => window._scrHome.owns()), false);
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('homeRouteWrap').style.height), '');
    await x.ctx.close();
  });
  await t('설정 스위치를 켜고 끄면: 켜면 네이티브 · 끄면 destroy 하고 감싸개 높이가 풀린다', async () => {
    const x = await fresh({ plugin: true, on: false }); await x.page.waitForTimeout(800);
    await x.page.evaluate(() => _scrhSetUse(true));
    assert.ok(await waitFor(x, async () => (await puts(x)()) >= 1), '켰는데 show 가 없다');
    await emit(x, 'size', { id: 'home', h: 150 });
    assert.ok(await waitFor(x, async () => (await x.page.evaluate(() => document.getElementById('homeRouteWrap').style.height)) === '150px'));
    await x.page.evaluate(() => _scrhSetUse(false));
    assert.ok(await waitFor(x, async () => (await calls(x, 'destroy', 'home')).length > 0), 'destroy 가 없다');
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('homeRouteWrap').style.height), '');
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scrh_on')), '0');
    await x.ctx.close();
  });
  await t('플러그인 오류(error 이벤트) → 웹 카드로 돌아가고 카드에 사유가 보인다', async () => {
    const x = await fresh({ plugin: true, on: true });
    assert.ok(await waitFor(x, async () => (await puts(x)()) >= 1));
    await emit(x, 'error', { id: 'home', message: 'boom', kind: 'native' });
    assert.ok(await waitFor(x, async () => (await S(x)).failed));
    assert.ok(/문제가 있어/.test(await x.page.evaluate(() => document.getElementById('scrhSetStat').textContent)));
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('homeRouteWrap').style.height), '');
    await x.ctx.close();
  });

  await b.close();
  console.log(`\nscreen_home_js: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
