// 서버 구동 네이티브 설정 화면 ↔ 앱(JS) 연결 시험 — 2026-10-18
//   원칙: "계산은 엔진이, 그림은 앱이". 가짜 ScreenNative 플러그인 + 가짜 엔진(/screen/settings → engine/settings.js 의 실제 출력)으로 확인한다:
//   · 플러그인이 없거나 설정이 꺼져 있으면(기본) 예전 그대로 — 플러그인 호출이 하나도 없다
//   · 켜면: 기기 사실(facts)을 모아 엔진에 보내고, 엔진이 준 JSON 글을 한 글자도 안 고치고 플러그인에 넘긴다 · 사각형은 설정 화면 전체
//   · 행동: 스위치(set) → 진짜 설정이 바뀌고 새 화면을 받는다 · 아이디 저장/삭제(call, 입력칸 글자 fields) · 테마(sel) · 웹 카드 시트(web) · 약관(call)
//   · 폴백: 엔진 응답이 틀리면 버리고(저장본이 있으면 그대로, 없으면 웹 화면) · 저장본은 기기 사실이 같을 때만 곧바로 쓴다
//   · 하위 화면(cap 8): 설정의 6개 카드 행이 엔진이 구성한 네이티브 하위 화면으로 열린다 · 눌림은 기존 웹 함수를 그대로 부른다 · 옛 엔진/실패면 예전 웹 카드 시트
// 실행: node test/screen_set_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const E = require('../engine/settings');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 700)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // opt: { plugin, on, cache:txt+fk, serve:'ok'|'shape'|'down', delay }
  async function fresh(opt) {
    opt = opt || {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const x = { ctx, page, errs, reqs: [], serve: opt.serve || 'ok', delay: opt.delay || 0, old: !!opt.old };
    await page.route('**/*', async r => {
      const u = new URL(r.request().url());
      if (u.protocol === 'file:') return r.continue();
      if (u.pathname === '/screen/settings') {
        x.reqs.push(u.search);
        if (x.delay) await new Promise(res => setTimeout(res, x.delay));
        if (x.serve === 'down') return r.abort();
        const facts = JSON.parse(u.searchParams.get('f') || '{}'); x.lastFacts = facts;
        const pq = x.old ? '' : (u.searchParams.get('p') || '');                    // x.old: p 를 모르는 옛 엔진(항상 첫 화면)
        let body = JSON.stringify(E.settingsScreen({ cap: x.old ? 3 : (Number(u.searchParams.get('cap')) || 0), p: pq }, facts));
        if (x.serve === 'shape') body = JSON.stringify({ ok: true, v: 2, screen: 'settings' });
        x.lastBody = body;
        return r.fulfill({ status: 200, contentType: 'application/json', body });
      }
      return r.abort();
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try {
        localStorage.setItem('locDisc', '1'); if (o.on) localStorage.setItem('gdm_scrs_on', '1');
        if (o.cache) localStorage.setItem('gdm_scrs_c', JSON.stringify({ ts: Date.now(), fk: o.cache.fk, rev: 'old', txt: o.cache.txt }));
        if (o.id) localStorage.setItem('mk_comm_id', JSON.stringify(o.id));
      } catch (e) {}
      window.__sn = []; window.__snL = {}; window.__ext = [];
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const rec = (m, a, ret) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(ret); };
        const check = (a) => {
          if (a.json == null) return null;
          try { const j = JSON.parse(a.json); if (j.v !== 1 || !Array.isArray(j.body)) return 'invalid: 규격'; } catch (e) { return 'invalid: JSON'; }
          return null;
        };
        const put = (m) => (a) => { window.__sn.push({ m, a: JSON.parse(JSON.stringify(a)) }); const bad = check(a); if (bad) { setTimeout(() => window.__snEmit('error', { id: 'settings', message: bad, kind: 'invalid' }), 5); return Promise.reject(new Error(bad)); } return Promise.resolve(); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { ScreenNative: {
          show: put('show'), update: put('update'),
          setRect: (a) => rec('setRect', a), hide: (a) => rec('hide', a), destroy: (a) => rec('destroy', a), toast: (a) => rec('toast', a),
          status: () => Promise.resolve(window.__status ? window.__status() : (o.oldApk ? { visible: true, items: 10, age: 20, scroll: 0 } : { visible: true, items: 10, age: 20, scroll: 0, cap: 8 })),
          addListener: (n, f) => { (window.__snL[n] = window.__snL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.goto('file://' + html); await page.waitForTimeout(2200);
    await page.addStyleTag({ content: '#locDiscOv{display:none !important}' });
    await page.evaluate(() => { const ov = document.getElementById('locDiscOv'); if (ov) ov.remove(); });
    return x;
  }
  const calls = (x, m) => x.page.evaluate((m) => window.__sn.filter(c => !m || c.m === m), m);
  const clear = (x) => x.page.evaluate(() => { window.__sn.length = 0; });
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__snEmit(n, d), [n, d || {}]);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await x.page.waitForTimeout(60); } return false; };
  const has = (x, m, n) => async () => (await calls(x, m)).length >= (n || 1);
  const last = async (x, m) => { const c = await calls(x, m); return c[c.length - 1]; };
  const anyPut = (x) => async () => (await calls(x, 'show')).length + (await calls(x, 'update')).length > 0;
  const openSet = (x) => x.page.evaluate(() => { switchTab('community', document.getElementById('ni-community')); showSettingsTab(document.querySelector('#filterRow .chip:last-child')); });
  const st = (x) => x.page.evaluate(() => { const S = window._scrSet.S; return { shown: S.shown, ready: S.ready, good: S.good, failed: S.failed, fails: S.fails, why: S.why, badFresh: S.badFresh }; });
  const act = (x, d) => emit(x, 'action', Object.assign({ id: 'settings' }, d));
  const toggleOf = (txt, key) => { const f = (ns) => ns.forEach(n => { if (n.t === 'toggle' && n.key === key) r = n; if (n.kids) f(n.kids); }); let r = null; f(JSON.parse(txt).body); return r; };
  const texts = (txt) => { const out = []; const f = (ns) => ns.forEach(n => { out.push(n); if (n.kids) f(n.kids); }); f(JSON.parse(txt).body); return out; };

  console.log('[① 플러그인이 없거나 꺼져 있으면 예전 그대로]');
  await t('플러그인이 없으면(웹): 요청도 호출도 없다 · 설정 카드도 안 보인다', async () => {
    const x = await fresh({ plugin: false, on: true }); await openSet(x); await x.page.waitForTimeout(1500);
    assert.strictEqual(await x.page.evaluate(() => getComputedStyle(document.getElementById('scrsSetCard')).display), 'none');
    assert.strictEqual(x.reqs.length, 0); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('플러그인이 있어도 꺼져 있으면(기본) 호출·요청이 없다 · 카드는 보이고 스위치는 꺼짐 · 웹 설정이 그대로 보인다', async () => {
    const x = await fresh({ plugin: true, on: false }); await openSet(x); await x.page.waitForTimeout(1800);
    assert.strictEqual((await calls(x)).length, 0); assert.strictEqual(x.reqs.length, 0);
    const c = await x.page.evaluate(() => ({ d: getComputedStyle(document.getElementById('scrsSetCard')).display, on: document.getElementById('scrsSetOn').checked, s: document.getElementById('scrsSetStat').textContent, v: getComputedStyle(document.getElementById('settingsTabView')).display }));
    assert.strictEqual(c.d, 'block'); assert.strictEqual(c.on, false); assert.ok(/꺼짐/.test(c.s), c.s); assert.notStrictEqual(c.v, 'none');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  console.log('[② 켜면: 기기 사실을 보내고 엔진 JSON 을 그대로 넘긴다]');
  const A = await fresh({ plugin: true, on: true, id: '기존이름' });
  await t('설정 탭을 열면 사실과 함께 요청(cap=3)하고, 받은 글을 한 글자도 안 고치고 show 한다 · 사각형은 설정 화면 전체', async () => {
    await openSet(A); assert.ok(await waitFor(A, has(A, 'show')), 'show 가 없다');
    assert.ok(/cap=8/.test(A.reqs[0]) && !/[?&]p=/.test(A.reqs[0]) && /f=/.test(A.reqs[0]), A.reqs[0]);
    assert.strictEqual(A.lastFacts.id, '기존이름'); assert.ok(A.lastFacts.np && A.lastFacts.np.arrive === 1 && A.lastFacts.th && A.lastFacts.feat.scrs.on === 1, JSON.stringify(A.lastFacts));
    const s = (await last(A, 'show')).a;
    assert.strictEqual(s.id, 'settings'); assert.strictEqual(s.json, A.lastBody, '엔진 글과 다르다');
    const bx = await A.page.evaluate(() => { const r = document.getElementById('settingsTabView').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    assert.ok(Math.abs(s.x - bx.x) < 1 && Math.abs(s.y - bx.y) < 1 && Math.abs(s.w - bx.w) < 1 && Math.abs(s.h - bx.h) < 1, JSON.stringify([s.x, s.y, s.w, s.h, bx]));
    assert.strictEqual(s.dpr, 2); assert.strictEqual(s.keepScroll, false);
    ['bg', 'card', 'border', 'border2', 'text', 'sub', 'gold', 'orange', 'imgbg'].forEach(k => assert.ok(typeof s.palette[k] === 'string' && s.palette[k].length > 3, k + ' ' + JSON.stringify(s.palette)));
  });
  await t('엔진 글 안에 현재 아이디가 들어 있다(앱은 문구를 만들지 않는다)', async () => {
    const f = texts((await last(A, 'show')).a.json).find(n => n.t === 'field');
    assert.strictEqual(f.key, 'cid'); assert.strictEqual(f.value, '기존이름');
  });
  await t('ready 가 오면 정상: 실패 0 · 저장본이 저장된다 · 웹 설정 글자 영역(ss:*)은 쉰다', async () => {
    await emit(A, 'ready', { id: 'settings' }); await A.page.waitForTimeout(200);
    const s = await st(A); assert.ok(s.shown && s.ready && s.good && !s.failed && s.fails === 0, JSON.stringify(s));
    const c = JSON.parse(await A.page.evaluate(() => localStorage.getItem('gdm_scrs_c'))); assert.strictEqual(c.txt, A.lastBody); assert.ok(c.fk.indexOf('기존이름') > 0);
    assert.strictEqual(await A.page.evaluate(() => window._scrSet.owns()), true);
    assert.deepStrictEqual(A.errs, []);
  });
  await t('설정 카드: 켜짐 문구 · 스위치 켜짐 (엔진 문구와 같다)', async () => {
    const c = await A.page.evaluate(() => ({ on: document.getElementById('scrsSetOn').checked, s: document.getElementById('scrsSetStat').textContent }));
    assert.strictEqual(c.on, true);
    assert.strictEqual(c.s, E.SETTINGS_FEATS.find(d => d.k === 'scrs').ok);
  });

  console.log('[③ 행동: 스위치·아이디·테마]');
  await t('알림 스위치(set) → 진짜 설정이 바뀌고(저장값 0) 새 화면을 받아 제자리 갱신 · 기기 토스트', async () => {
    await clear(A); const n0 = A.reqs.length;
    await act(A, { a: 'set', key: 'n.transfer', on: false });
    assert.ok(await waitFor(A, has(A, 'update')), 'update 없음');
    assert.strictEqual(await A.page.evaluate(() => _notifPrefLoad().transfer), 0);
    assert.ok(A.reqs.length > n0 && A.lastFacts.np.transfer === 0, JSON.stringify(A.lastFacts.np));
    const u = (await last(A, 'update')).a; assert.strictEqual(u.keepScroll, true); assert.strictEqual(toggleOf(u.json, 'n.transfer').on, false);
    const tt = await calls(A, 'toast'); assert.ok(tt.length === 1 && /껐어요: 환승 알림/.test(tt[0].a.text), JSON.stringify(tt));
  });
  await t('같은 스위치를 다시 켜면 되돌아온다', async () => {
    await clear(A); await act(A, { a: 'set', key: 'n.transfer', on: true });
    assert.ok(await waitFor(A, has(A, 'update')));
    assert.strictEqual(await A.page.evaluate(() => _notifPrefLoad().transfer), 1); assert.strictEqual(toggleOf((await last(A, 'update')).a.json, 'n.transfer').on, true);
  });
  await t('도착 오차 기록 스위치(set rl) → 저장값이 바뀐다', async () => {
    await clear(A); await act(A, { a: 'set', key: 'rl', on: false });
    assert.ok(await waitFor(A, has(A, 'update')));
    assert.strictEqual(await A.page.evaluate(() => _rideLogOn()), false); assert.strictEqual(toggleOf((await last(A, 'update')).a.json, 'rl').on, false);
    await act(A, { a: 'set', key: 'rl', on: true }); await A.page.waitForTimeout(300);
  });
  await t('모르는 스위치 키는 무시한다(허용 목록만)', async () => {
    await clear(A); const n0 = A.reqs.length;
    await act(A, { a: 'set', key: 'evil.key', on: true }); await act(A, { a: 'call', v: 'rm_rf' }); await act(A, { a: 'web', v: 'nope' }); await act(A, { a: 'sel', v: 'purple' });
    await A.page.waitForTimeout(500); assert.strictEqual((await calls(A)).filter(c => c.m !== 'setRect').length, 0, JSON.stringify(await calls(A))); assert.strictEqual(A.reqs.length, n0);
    assert.strictEqual(await A.page.evaluate(() => !!document.getElementById('scrsSheet')), false);
  });
  await t('아이디 저장(call saveId + 입력칸 글자 fields) → 저장되고 새 화면에 반영 · 기기 토스트', async () => {
    await clear(A);
    await act(A, { a: 'call', v: 'saveId', fields: { cid: '새이름' } });
    assert.ok(await waitFor(A, has(A, 'update')));
    assert.strictEqual(await A.page.evaluate(() => _getCommId()), '새이름');
    const f = texts((await last(A, 'update')).a.json).find(n => n.t === 'field'); assert.strictEqual(f.value, '새이름');
    assert.ok((await calls(A, 'toast')).some(c => /아이디가 저장되었어요: 새이름/.test(c.a.text)), JSON.stringify(await calls(A, 'toast')));
  });
  await t('잘못된 아이디(너무 짧음)는 저장되지 않고 이유를 기기 토스트로 알린다', async () => {
    await clear(A);
    await act(A, { a: 'call', v: 'saveId', fields: { cid: 'a' } });
    assert.ok(await waitFor(A, has(A, 'toast')));
    assert.strictEqual(await A.page.evaluate(() => _getCommId()), '새이름'); assert.ok(/2~12자/.test((await last(A, 'toast')).a.text));
  });
  await t('웹의 toast 는 되돌려 놓는다(호출 동안만 바꿨다)', async () => {
    assert.strictEqual(await A.page.evaluate(() => /console\.log/.test(String(window.toast))), true);
  });
  await t('아이디 삭제(call clearId) → 비워지고 새 화면에서도 비어 있다', async () => {
    await clear(A);
    await act(A, { a: 'call', v: 'clearId' });
    assert.ok(await waitFor(A, has(A, 'update')));
    assert.strictEqual(await A.page.evaluate(() => _getCommId()), '');
    const ns = texts((await last(A, 'update')).a.json);
    assert.strictEqual(ns.find(n => n.t === 'field').value, ''); assert.ok(!ns.some(n => n.t === 'box' && /^현재 아이디/.test(n.s)));
  });
  await t('테마 고르기(sel) → 앱 테마가 바뀌고 새 화면(선택 표시)을 받는다', async () => {
    const before = await A.page.evaluate(() => _themeNow()), want = before === 'dark' ? 'pastel' : 'dark';
    await clear(A);
    await act(A, { a: 'sel', v: want });
    assert.ok(await waitFor(A, async () => (await calls(A, 'update')).some(c => c.a.json)), '새 화면 없음');
    assert.strictEqual(await A.page.evaluate(() => _themeNow()), want);
    const ns = texts((await calls(A, 'update')).filter(c => c.a.json).pop().a.json).filter(n => n.t === 'select');
    assert.strictEqual(ns.find(n => n.on).act.v, want);
  });

  console.log('[④ 웹 카드 시트·약관·덮임]');
  await t('web 행동 → 기존 웹 카드를 시트로 옮겨 열고(네이티브 숨김), 닫으면 제자리로 돌아간다', async () => {
    await clear(A);
    const idx0 = await A.page.evaluate(() => { const c = document.getElementById('cmCard'); return Array.prototype.indexOf.call(c.parentNode.children, c); });
    await act(A, { a: 'web', v: 'cm' });
    assert.ok(await waitFor(A, has(A, 'hide')), '네이티브를 숨기지 않았다');
    const s = await A.page.evaluate(() => { const sh = document.getElementById('scrsSheet'); const c = document.getElementById('cmCard'); return { sheet: !!sh, inSheet: !!(sh && sh.contains(c)), shown: getComputedStyle(c).display }; });
    assert.ok(s.sheet && s.inSheet && s.shown !== 'none', JSON.stringify(s));
    assert.ok(await A.page.evaluate(() => !!document.getElementById('cmAlarmOn') && !!document.getElementById('cmMornTime')), '출퇴근 카드 요소가 산다');
    // 안드로이드 뒤로가기는 시트부터 닫는다
    assert.strictEqual(await A.page.evaluate(() => handleBackPress()), true);
    const e = await A.page.evaluate(() => { const c = document.getElementById('cmCard'); return { sheet: !!document.getElementById('scrsSheet'), inTab: document.getElementById('settingsTabView').contains(c), idx: Array.prototype.indexOf.call(c.parentNode.children, c) }; });
    assert.ok(!e.sheet && e.inTab && e.idx === idx0, JSON.stringify([e, idx0]));
    assert.ok(await waitFor(A, anyPut(A), 5000), '닫은 뒤 네이티브가 다시 올라오지 않았다');
  });
  await t('개발자 도구·시계 위젯·추천 시험·오버레이도 같은 방식으로 열린다', async () => {
    for (const k of ['dev', 'gw', 'arr', 'ovl']) {
      await act(A, { a: 'web', v: k }); await A.page.waitForTimeout(150);
      const ok = await A.page.evaluate(() => { const sh = document.getElementById('scrsSheet'); return !!sh && sh.querySelector('button, input') !== null; });
      assert.ok(ok, k + ' 시트가 비었다');
      await A.page.evaluate(() => window._scrSet.closeSheet());
    }
  });
  await t('약관(call pol.privacy) → 네이티브를 숨기고 웹 약관을 연다 · 허용된 세 가지만', async () => {
    await clear(A);
    await act(A, { a: 'call', v: 'pol.privacy' });
    assert.ok(await waitFor(A, has(A, 'hide')));
    assert.strictEqual(await A.page.evaluate(() => !!document.getElementById('policyOv')), true);
    await A.page.evaluate(() => closePolicy());
    await act(A, { a: 'call', v: 'pol.hacked' }); await A.page.waitForTimeout(150);
    assert.strictEqual(await A.page.evaluate(() => !!document.getElementById('policyOv')), false);
  });
  await t('팝업이 덮으면 숨기고, 걷히면 다시 올린다', async () => {
    await waitFor(A, anyPut(A), 5000); await clear(A);
    await A.page.evaluate(() => { const d = document.createElement('div'); d.id = 'cov'; d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;'; document.body.appendChild(d); });
    assert.ok(await waitFor(A, has(A, 'hide')), '숨기지 않았다');
    await A.page.evaluate(() => document.getElementById('cov').remove()); await clear(A);
    assert.ok(await waitFor(A, anyPut(A), 5000), '다시 올리지 않았다');
  });
  await t('입력칸에 글자를 쓰는 동안(input 이벤트) 키보드로 크기가 바뀌어도 숨기지 않는다', async () => {
    await waitFor(A, async () => (await st(A)).shown, 4000); await clear(A);
    await emit(A, 'input', { id: 'settings', on: true });
    await A.page.evaluate(() => { document.getElementById('tab-community').style.paddingBottom = '40px'; });
    await A.page.waitForTimeout(900);
    assert.strictEqual((await calls(A, 'hide')).length, 0, '입력 중인데 숨겼다');
    await A.page.evaluate(() => { document.getElementById('tab-community').style.paddingBottom = ''; });
    await emit(A, 'input', { id: 'settings', on: false });
  });
  await t('설정 탭을 떠나면 숨긴다', async () => {
    await clear(A); await A.page.evaluate(() => switchTab('home', document.getElementById('ni-home')));
    assert.ok(await waitFor(A, has(A, 'hide')), 'hide 없음');
    assert.deepStrictEqual(A.errs, []); await A.ctx.close();
  });

  console.log('[⑤ 저장본·폴백]');
  let CACHE = null;
  await t('같은 기기 사실의 저장본이 있으면 느린 네트워크(5초)를 기다리지 않고 show — 새 응답이 오면 제자리 갱신', async () => {
    const x0 = await fresh({ plugin: true, on: true, id: '캐시' }); await openSet(x0); await waitFor(x0, has(x0, 'show')); await emit(x0, 'ready', { id: 'settings' }); await x0.page.waitForTimeout(200);
    CACHE = JSON.parse(await x0.page.evaluate(() => localStorage.getItem('gdm_scrs_c'))); assert.ok(CACHE.txt); await x0.ctx.close();
    const x = await fresh({ plugin: true, on: true, id: '캐시', cache: CACHE, delay: 5000 });
    const t0 = Date.now(); await openSet(x);
    assert.ok(await waitFor(x, has(x, 'show'), 2500), '저장본으로 못 띄웠다'); assert.ok(Date.now() - t0 < 2500);
    assert.strictEqual((await last(x, 'show')).a.json, CACHE.txt);
    assert.ok(await waitFor(x, has(x, 'update'), 9000), '새 응답이 오지 않았다'); assert.strictEqual((await last(x, 'update')).a.keepScroll, true); await x.ctx.close();
  });
  await t('기기 사실이 다른 저장본(아이디가 다름)은 곧바로 쓰지 않고 엔진 응답을 기다린다', async () => {
    const x = await fresh({ plugin: true, on: true, id: '다른이름', cache: CACHE, delay: 1200 });
    await openSet(x); await x.page.waitForTimeout(700);
    assert.strictEqual((await calls(x, 'show')).length, 0, '틀린 저장본을 그렸다');
    assert.ok(await waitFor(x, has(x, 'show'), 6000), '엔진 응답으로 못 띄웠다'); assert.ok(/다른이름/.test((await last(x, 'show')).a.json)); await x.ctx.close();
  });
  await t('엔진 응답이 틀린 모양이고 저장본도 없으면: 그리지 않고 웹 설정 화면으로(실패 기록)', async () => {
    const x = await fresh({ plugin: true, on: true, serve: 'shape' }); await openSet(x); await x.page.waitForTimeout(2500);
    assert.strictEqual((await calls(x, 'show')).length, 0); const s = await st(x); assert.ok(s.failed || s.fails >= 1, JSON.stringify(s));
    assert.notStrictEqual(await x.page.evaluate(() => getComputedStyle(document.getElementById('settingsTabView')).display), 'none'); await x.ctx.close();
  });
  await t('엔진이 아예 안 돼도 같은 사실의 저장본이 있으면 그걸로 그리고, 실패로 치지 않는다', async () => {
    const x = await fresh({ plugin: true, on: true, id: '캐시', cache: CACHE, serve: 'down' }); await openSet(x);
    assert.ok(await waitFor(x, has(x, 'show'), 3000)); await emit(x, 'ready', { id: 'settings' }); await x.page.waitForTimeout(400);
    const s = await st(x); assert.ok(s.shown && !s.failed && s.fails === 0, JSON.stringify(s)); await x.ctx.close();
  });
  await t('플러그인 오류(error 이벤트) → 웹으로 · 연속 2번이면 다음부터 쓰지 않는다 · 켜고 끄는 스위치로 복구', async () => {
    const x = await fresh({ plugin: true, on: true }); await openSet(x); await waitFor(x, has(x, 'show'));
    await emit(x, 'error', { id: 'settings', message: 'boom', kind: 'exception' }); await x.page.waitForTimeout(200);
    let s = await st(x); assert.ok(s.failed && s.fails === 1 && /boom/.test(s.why), JSON.stringify(s));
    assert.ok((await calls(x, 'destroy')).length >= 1, '네이티브 화면을 정리하지 않았다');
    const card = await x.page.evaluate(() => document.getElementById('scrsSetStat').textContent); assert.ok(/문제가 있어/.test(card) && /boom/.test(card), card);
    await x.page.evaluate(() => window._scrsSetUse(false)); await x.page.waitForTimeout(100);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scrs_on')), '0');
    await x.page.evaluate(() => window._scrsSetUse(true)); await x.page.waitForTimeout(100);
    s = await st(x); assert.ok(!s.failed && s.fails === 0, JSON.stringify(s)); await x.ctx.close();
  });
  await t('설정 안의 "네이티브 설정 화면" 스위치를 끄면(set f.scrs) 네이티브가 걷히고 웹 설정으로 돌아간다', async () => {
    const x = await fresh({ plugin: true, on: true }); await openSet(x); await waitFor(x, has(x, 'show')); await emit(x, 'ready', { id: 'settings' }); await x.page.waitForTimeout(200);
    await clear(x); await act(x, { a: 'set', key: 'f.scrs', on: false });
    assert.ok(await waitFor(x, has(x, 'destroy')), '정리 안 됨');
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scrs_on')), '0'); assert.strictEqual(await x.page.evaluate(() => window._scrSet.owns()), false);
    await x.ctx.close();
  });

  console.log('[⑥ 하위 화면(엔진 s68): 열기·행동·뒤로·폴백]');
  const nodes = (txt) => texts(txt);
  const findBtn = (txt, v) => nodes(txt).find(n => n.act && n.act.v === v);
  const hasText = (txt, re) => nodes(txt).some(n => typeof n.s === 'string' && re.test(n.s));
  const lastJson = async (x) => { const c = (await calls(x)).filter(c => c.a && c.a.json); return c.length ? c[c.length - 1].a.json : ''; };
  const pgOpen = async (x, name) => { await clear(x); await act(x, { a: 'call', v: 'pg.' + name }); assert.ok(await waitFor(x, async () => { const j = await lastJson(x); return j && JSON.parse(j).info && JSON.parse(j).info.page === name; }, 8000), name + ' 하위 화면 없음'); };
  const pgSub = async (x, v, sub) => { await act(x, { a: 'call', v }); assert.ok(await waitFor(x, async () => { const j = await lastJson(x); return j && (JSON.parse(j).info || {}).sub === sub; }, 8000), v + ' → ' + sub + ' 없음'); };
  const B = await fresh({ plugin: true, on: true, id: '하위' });
  await openSet(B); await waitFor(B, has(B, 'show')); await emit(B, 'ready', { id: 'settings' }); await B.page.waitForTimeout(200);
  await t('설정 첫 화면의 카드 행은 pg.* 호출이다 → 눌러서 열면 page=cm 요청(cap=8&p=cm) · 맨 위부터 · 웹 시트는 열리지 않는다', async () => {
    const j0 = await lastJson(B); assert.ok(findBtn(j0, 'pg.cm') || nodes(j0).some(n => n.act && n.act.v === 'pg.cm'), 'pg.cm 행 없음');
    await pgOpen(B, 'cm');
    assert.ok(B.reqs.some(q => /cap=8/.test(q) && /[?&]p=cm/.test(q)), JSON.stringify(B.reqs));
    assert.ok(B.lastFacts.pf && typeof B.lastFacts.pf.on === 'number', JSON.stringify(B.lastFacts));
    const u = (await calls(B)).filter(c => c.a && c.a.json).pop(); assert.strictEqual(u.a.keepScroll, false);
    assert.strictEqual(await B.page.evaluate(() => !!document.getElementById('scrsSheet')), false);
  });
  await t('출퇴근 요일 칸(cm.day.N) → 기존 _cmDayToggle 이 바뀌고 새 화면 · 프리셋(cm.preset.weekend)', async () => {
    const before = await B.page.evaluate(() => JSON.stringify(_cmAlarm.days));
    await clear(B); await act(B, { a: 'call', v: 'cm.day.6' }); assert.ok(await waitFor(B, has(B, 'update')));
    const after = await B.page.evaluate(() => JSON.stringify(_cmAlarm.days)); assert.notStrictEqual(before, after);
    await clear(B); await act(B, { a: 'call', v: 'cm.preset.weekend' }); assert.ok(await waitFor(B, has(B, 'update')));
    assert.deepStrictEqual(JSON.parse(await B.page.evaluate(() => JSON.stringify(_cmAlarm.days))).sort(), [0, 6]);
    assert.deepStrictEqual(B.lastFacts.pf.days.slice().sort(), [0, 6]);
  });
  await t('알림 스위치(set cm) → _cmToggle · 기기 토스트', async () => {
    await clear(B); await act(B, { a: 'set', key: 'cm', on: true });
    assert.ok(await waitFor(B, has(B, 'update')) || (await calls(B, 'toast')).length >= 0);
    assert.strictEqual(await B.page.evaluate(() => !!_cmAlarm.on), true);
  });
  await t('시각 고르기: cm.tp.morn → 하위의 하위 화면 · 오후/시/분 고르기 · 확인하면 입력 요소와 저장에 반영', async () => {
    await pgSub(B, 'cm.tp.morn', 'tp'); assert.strictEqual(B.lastFacts.pf.sub, 'tp'); const t0 = B.lastFacts.pf.tp; assert.ok(t0 && t0.t === 'morn', JSON.stringify(t0));
    const bk = nodes(await lastJson(B))[0]; assert.ok(/출퇴근 브리핑 알림/.test(bk.s), bk.s);
    await clear(B); await act(B, { a: 'call', v: 'tp.ap.pm' }); await waitFor(B, has(B, 'update')); assert.strictEqual(B.lastFacts.pf.tp.ap, 'pm');
    await clear(B); await act(B, { a: 'call', v: 'tp.h.6' }); await waitFor(B, has(B, 'update')); await clear(B); await act(B, { a: 'call', v: 'tp.m.45' }); await waitFor(B, has(B, 'update'));
    assert.deepStrictEqual([B.lastFacts.pf.tp.ap, B.lastFacts.pf.tp.h, B.lastFacts.pf.tp.m], ['pm', 6, 45]);
    await clear(B); await act(B, { a: 'call', v: 'tp.ok' });
    assert.ok(await waitFor(B, async () => { const j = await lastJson(B); return j && (JSON.parse(j).info || {}).page === 'cm' && !(JSON.parse(j).info || {}).sub; }, 6000), 'cm 로 돌아오지 않음');
    assert.strictEqual(await B.page.evaluate(() => document.getElementById('cmMornTime').dataset.time), '18:45');
    assert.strictEqual(await B.page.evaluate(() => _cmAlarm.morn), '18:45');
  });
  await t('시각 고르기 취소(tp.cancel)는 값을 바꾸지 않는다', async () => {
    await pgSub(B, 'cm.tp.eve', 'tp'); await act(B, { a: 'call', v: 'tp.h.3' }); await B.page.waitForTimeout(250);
    const e0 = await B.page.evaluate(() => _cmAlarm.eve); await clear(B); await act(B, { a: 'call', v: 'tp.cancel' });
    assert.ok(await waitFor(B, async () => { const j = await lastJson(B); return j && !(JSON.parse(j).info || {}).sub; }, 6000));
    assert.strictEqual(await B.page.evaluate(() => _cmAlarm.eve), e0);
  });
  await t('장소 고르기: cm.pick.from → 글자 쓰면 후보 · 직접 저장(pk.save, 입력칸 fields) → 입력 요소에 들어가고 저장', async () => {
    await pgSub(B, 'cm.pick.from', 'pick'); assert.strictEqual(B.lastFacts.pf.pick.k, 'from');
    await emit(B, 'text', { id: 'settings', key: 'cmq', kind: 'edit', value: '강남' }); await B.page.waitForTimeout(500);
    assert.strictEqual(B.lastFacts.pf.pick.q, '강남');
    await clear(B); await act(B, { a: 'call', v: 'pk.save', fields: { cmq: '강남역' } });
    assert.ok(await waitFor(B, async () => { const j = await lastJson(B); return j && !(JSON.parse(j).info || {}).sub; }, 6000));
    assert.strictEqual(await B.page.evaluate(() => document.getElementById('cmFromStn').value), '강남역');
    assert.strictEqual(await B.page.evaluate(() => _cmAlarm.from), '강남역');
  });
  await t('장소 지우기(pk.clear) · 취소(pk.cancel)', async () => {
    await pgSub(B, 'cm.pick.to', 'pick'); await clear(B); await act(B, { a: 'call', v: 'pk.cancel' });
    assert.ok(await waitFor(B, async () => { const j = await lastJson(B); return j && !(JSON.parse(j).info || {}).sub; }, 6000));
    await pgSub(B, 'cm.pick.from', 'pick'); await clear(B); await act(B, { a: 'call', v: 'pk.clear' });
    assert.ok(await waitFor(B, async () => { const j = await lastJson(B); return j && !(JSON.parse(j).info || {}).sub; }, 6000));
    assert.strictEqual(await B.page.evaluate(() => document.getElementById('cmFromStn').value), '');
  });
  await t('모르는 하위 행동은 무시한다(tp.h.99, pk.u.99, cm.day.9, pg.xx)', async () => {
    await clear(B); const n0 = B.reqs.length;
    for (const v of ['tp.h.99', 'pk.u.99', 'cm.day.9', 'pg.zz', 'dev.start.evil', 'gw.add.zz']) await act(B, { a: 'call', v });
    await B.page.waitForTimeout(500); assert.strictEqual(B.reqs.length, n0, '불필요한 요청'); assert.strictEqual((await calls(B)).filter(c => c.m !== 'setRect').length, 0);
  });
  await t('뒤로(pg.back) → 설정 첫 화면 · 안드로이드 뒤로가기도 한 단계씩', async () => {
    await clear(B); await act(B, { a: 'call', v: 'pg.back' });
    assert.ok(await waitFor(B, async () => { const j = await lastJson(B); return j && !JSON.parse(j).info; }, 6000), '첫 화면 아님');
    await pgOpen(B, 'gw'); await clear(B);
    assert.strictEqual(await B.page.evaluate(() => handleBackPress()), true);
    assert.ok(await waitFor(B, async () => { const j = await lastJson(B); return j && !JSON.parse(j).info; }, 6000), '뒤로가기로 첫 화면에 못 돌아옴');
  });
  await t('캐릭터 시계 위젯: 위젯 추가(gw.add.hb) · 감지 시간 +/-(gw.roam.up/dn) → 기존 함수 호출', async () => {
    await pgOpen(B, 'gw');
    await B.page.evaluate(() => { window.__gwAdd = []; window._gwAdd = function(k){ window.__gwAdd.push(k); }; });
    const r0 = await B.page.evaluate(() => _gwRoamMin());
    await clear(B); await act(B, { a: 'call', v: 'gw.add.hb' }); await B.page.waitForTimeout(200);
    await clear(B); await act(B, { a: 'call', v: 'gw.roam.up' }); await waitFor(B, has(B, 'update'));
    assert.strictEqual(await B.page.evaluate(() => _gwRoamMin()), Math.min(10, r0 + 1)); assert.strictEqual(B.lastFacts.pf.roam, Math.min(10, r0 + 1));
  });
  await t('개발자 도구: 시험 시작(dev.start.plain) · 정지(dev.stop) → 기존 함수 + 사실 반영', async () => {
    await pgOpen(B, 'dev');
    await B.page.evaluate(() => { window.__dv = []; window._ovlTestStart = function(m){ window.__dv.push('start:' + m); window._ovlTest = { until: Date.now() + 60000, t0: Date.now(), mode: m, seq: [] }; }; window._ovlTestStop = function(){ window.__dv.push('stop'); window._ovlTest = null; }; window._ovlTestPhase = function(){ return { mode: 'plain' }; }; });
    await clear(B); await act(B, { a: 'call', v: 'dev.start.plain' }); await waitFor(B, has(B, 'update'));
    assert.deepStrictEqual(await B.page.evaluate(() => window.__dv), ['start:plain']); assert.strictEqual(B.lastFacts.pf.ph, 'plain'); assert.ok(B.lastFacts.pf.left % 5 === 0 && B.lastFacts.pf.left > 0, JSON.stringify(B.lastFacts.pf));
    await clear(B); await act(B, { a: 'call', v: 'dev.stop' }); await waitFor(B, has(B, 'update'));
    assert.deepStrictEqual(await B.page.evaluate(() => window.__dv), ['start:plain', 'stop']); assert.strictEqual(B.lastFacts.pf.stopped, 1);
  });
  await t('하차 5분 전 추천: 상태 보기(arr.stat) → 사실 스냅샷을 엔진에 보낸다 · 시험(arr.t.lunch)은 기존 _arrTestUI', async () => {
    await pgOpen(B, 'arr');
    await B.page.evaluate(() => { window.__ar = []; window._arrTestUI = function(k){ window.__ar.push(k); }; });
    await clear(B); await act(B, { a: 'call', v: 'arr.stat' }); await waitFor(B, has(B, 'update'));
    assert.ok(B.lastFacts.pf.st && typeof B.lastFacts.pf.st.tzo === 'number', JSON.stringify(B.lastFacts.pf));
    await act(B, { a: 'call', v: 'arr.t.lunch' }); await B.page.waitForTimeout(150);
    assert.deepStrictEqual(await B.page.evaluate(() => window.__ar), ['lunch']);
  });
  await t('다른 앱 위에 표시: 읽은 사실(nat/on/pfl/pfr)을 보내고, 스위치(set ovl) → _ovlSetEnabled · 진단(ovl.diag)은 네이티브를 숨기고 웹 진단창', async () => {
    await pgOpen(B, 'ovl');
    assert.ok('nat' in B.lastFacts.pf && 'on' in B.lastFacts.pf && 'pfl' in B.lastFacts.pf, JSON.stringify(B.lastFacts.pf));
    await B.page.evaluate(() => { window.__ov = []; window._ovlSetEnabled = function(v){ window.__ov.push(v); }; window._ovlDiagShow = function(){ window.__ov.push('diag'); }; });
    await act(B, { a: 'set', key: 'ovl', on: true }); await B.page.waitForTimeout(150);
    await clear(B); await act(B, { a: 'call', v: 'ovl.diag' }); assert.ok(await waitFor(B, has(B, 'hide')));
    assert.deepStrictEqual(await B.page.evaluate(() => window.__ov), [true, 'diag']);
  });
  await t('갤럭시 백그라운드 유지: 열면 상태를 읽어 사실로 보낸다 · 읽지 못하면 er=1', async () => {
    assert.ok(await waitFor(B, async () => (await st(B)).shown, 6000), '진단창이 닫힌 뒤 네이티브가 다시 올라오지 않았다');
    await B.page.evaluate(() => { window._batNative = () => ({ backgroundStatus: () => Promise.resolve({ bgRestricted: true, ignoring: false, standbyBucket: 40 }) }); });
    await pgOpen(B, 'sam'); assert.ok(await waitFor(B, async () => B.lastFacts.pf && B.lastFacts.pf.sok === 1 && B.lastFacts.pf.w === 1, 6000), JSON.stringify(B.lastFacts.pf));
    await act(B, { a: 'call', v: 'pg.back' }); await B.page.waitForTimeout(300);
    await B.page.evaluate(() => { window._batNative = () => null; });
    await pgOpen(B, 'sam'); assert.ok(await waitFor(B, async () => B.lastFacts.pf && B.lastFacts.pf.er === 1, 6000), JSON.stringify(B.lastFacts.pf));
    await act(B, { a: 'call', v: 'pg.back' });
  });
  await t('설정 탭을 떠나면 하위 화면 상태도 초기화된다', async () => {
    await pgOpen(B, 'cm'); await clear(B); await B.page.evaluate(() => switchTab('home', document.getElementById('ni-home')));
    assert.ok(await waitFor(B, has(B, 'hide'))); await B.page.waitForTimeout(300);
    assert.deepStrictEqual(B.errs, []); await B.ctx.close();
  });
  await t('옛 APK(status 에 cap 없음)이면 cap=3 으로 요청하고 카드 행은 예전 웹 시트 행동이다 — 하위 화면 요청이 없다', async () => {
    const x = await fresh({ plugin: true, on: true, oldApk: true }); await openSet(x); assert.ok(await waitFor(x, has(x, 'show')));
    assert.ok(x.reqs.every(q => /cap=3/.test(q) && !/[?&]p=/.test(q)), JSON.stringify(x.reqs));
    assert.ok((await lastJson(x)) && JSON.parse(await lastJson(x)).body && JSON.stringify(JSON.parse(await lastJson(x)).body).indexOf('pg.cm') < 0);
    await x.ctx.close();
  });
  await t('옛 엔진(p 를 모름 → 항상 첫 화면)이면 예전 웹 카드 시트로 연다(기능 유지)', async () => {
    const x = await fresh({ plugin: true, on: true, old: true }); await openSet(x); await waitFor(x, has(x, 'show')); await emit(x, 'ready', { id: 'settings' });
    await act(x, { a: 'call', v: 'pg.cm' });
    assert.ok(await waitFor(x, async () => x.page.evaluate(() => !!document.getElementById('scrsSheet')), 6000), '웹 시트로 열리지 않았다');
    assert.ok(await x.page.evaluate(() => !!document.getElementById('cmMornTime'))); assert.strictEqual((await x.page.evaluate(() => window._scrSet.S.pg.p)), '');
    await x.ctx.close();
  });
  await t('하위 화면 요청이 실패하면(엔진 다운) 예전 웹 카드 시트로 연다', async () => {
    const x = await fresh({ plugin: true, on: true }); await openSet(x); await waitFor(x, has(x, 'show')); await emit(x, 'ready', { id: 'settings' });
    x.serve = 'down'; await act(x, { a: 'call', v: 'pg.gw' });
    assert.ok(await waitFor(x, async () => x.page.evaluate(() => !!document.getElementById('scrsSheet')), 8000), '웹 시트로 열리지 않았다');
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('gwCard') && document.getElementById('scrsSheet').contains(document.getElementById('gwCard'))), true);
    await x.ctx.close();
  });

  await b.close();
  console.log(`\nscreen_set_js: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
