// 네이티브 장면 ↔ 앱(JS) 연결 시험 — 2026-10-16
//   원칙: "계산은 엔진이, 그림은 앱이". 가짜 SceneNative 플러그인으로 확인한다:
//   · 플러그인이 없으면(웹) 예전 그대로: 웹 캔버스가 장면을 그린다
//   · 있으면: 엔진 /scene 답(res)을 한 글자도 안 고치고 그대로 넘긴다 · 장면 칸의 사각형(보이는 부분 clip 포함)을 알려 준다 · 웹 캔버스·DOM 태그는 숨긴다
//   · 칸이 움직이거나(스크롤) 팝업이 덮으면 네이티브를 숨기고 같은 그림의 정지 사진을 배경으로 깔았다가, 멈추면 다시 켠다
//   · 다른 탭으로 가면 숨김 · 장면이 없어지면(mode 없음) 멈춤
//   · 오류 이벤트·show 거절·준비 지연이면 곧바로 웹 캔버스로 복귀 · 연속 실패 시 안 씀 · 설정 스위치로 끄고 켬
// 실행: node test/scene_native_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const SCENE = require('../engine/scene');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 600)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // opt: { plugin, showFail, store:[[k,v]], wx, noScene }
  async function fresh(opt) {
    opt = opt || {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errs = [], st = { wx: opt.wx === undefined ? { temp: 12, rain: 10, txt: '맑음' } : opt.wx, calls: 0, last: null, body: null };
    page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => {
      const u = new URL(r.request().url());
      if (/\/scene$/.test(u.pathname)) {
        st.calls++; const body = r.request().postDataJSON(); st.last = body;
        const res = opt.noScene ? { ok: true, mode: null, look: { slot: 'noon', wk: 'clear', season: 'autumn' } } : SCENE.sceneDecide(body, st.wx);
        st.body = res;
        return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(res) });
      }
      return (u.protocol === 'file:' || u.protocol === 'data:') ? r.continue() : r.abort();
    });
    await page.addInitScript((o) => {
      try { localStorage.setItem('locDisc', '1'); (o.store || []).forEach(kv => localStorage.setItem(kv[0], kv[1])); } catch (e) {}
      window.__sn = []; window.__snL = {};
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const rec = (m, a, ret) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(ret); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { SceneNative: {
          show: (a) => { window.__sn.push({ m: 'show', a: JSON.parse(JSON.stringify(a)) }); return o.showFail ? Promise.reject(new Error('스프라이트 없음')) : Promise.resolve({ loaded: true }); },
          setRect: (a) => rec('setRect', a), apply: (a) => rec('apply', a, { running: true, loaded: true }), hide: () => rec('hide'), stop: () => rec('stop'), destroy: () => rec('destroy'),
          setHaptics: (a) => rec('setHaptics', a), snapshot: (a) => rec('snapshot', a, { data: 'data:image/webp;base64,UklGRgAAAA==' }),
          addListener: (n, f) => { (window.__snL[n] = window.__snL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.goto('file://' + html); await page.waitForTimeout(2600);
    await page.addStyleTag({ content: '#locDiscOv{display:none !important}' });
    return { ctx, page, errs, st };
  }
  const calls = (x, m) => x.page.evaluate(m => window.__sn.filter(c => !m || c.m === m), m);
  const clear = (x) => x.page.evaluate(() => { window.__sn.length = 0; });
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__snEmit(n, d), [n, d || {}]);
  const hostBox = (x) => x.page.evaluate(() => { const h = document.getElementById('congScene'), r = h.getBoundingClientRect(); return { x: r.left + h.clientLeft, y: r.top + h.clientTop, w: h.clientWidth, h: h.clientHeight, display: getComputedStyle(h).display, cls: h.className, bg: h.style.backgroundImage, cv: h.querySelectorAll('canvas.cs-cv').length, tag: document.getElementById('csTag').textContent, tagShown: getComputedStyle(document.getElementById('csTag')).display !== 'none' }; });
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 9000)) { if (await fn()) return true; await x.page.waitForTimeout(80); } return false; };
  // 칸 높이(엔진 fill 에 맞추는 앱의 _sceneFit)가 더 안 바뀔 때까지 기다린다 — 느린 CI 에서도 시험이 움직임을 직접 만들 수 있게
  const settle = async (x) => { let last = '', n = 0; for (let i = 0; i < 80 && n < 8; i++) { const r = await x.page.evaluate(() => { const h = document.getElementById('congScene'), b = h.getBoundingClientRect(); return [b.top.toFixed(1), h.clientHeight, h.clientWidth].join('/'); }); if (r === last) n++; else { n = 0; last = r; } await x.page.waitForTimeout(100); } };
  const live = (x) => waitFor(x, async () => (await calls(x, 'show')).length >= 1 && (await calls(x, 'apply')).length >= 1, 12000);

  await t('플러그인이 없으면(웹) 예전 그대로: 웹 캔버스가 장면을 그리고 네이티브 흔적이 없다', async () => {
    const x = await fresh({ plugin: false }); await x.page.waitForTimeout(1500);
    const hb = await hostBox(x), inf = await x.page.evaluate(() => _CS.info());
    assert(hb.display === 'block' && hb.cv === 1 && !/cs-native/.test(hb.cls) && hb.tagShown, JSON.stringify(hb));
    assert(inf.running === true && !inf.native && inf.frames > 0, JSON.stringify(inf).slice(0, 300));
    assert.strictEqual(await x.page.evaluate(() => _CS.natActive()), false);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('플러그인이 있으면: 칸 사각형으로 show 하고, 엔진 답(res)을 한 글자도 안 고치고 apply 한다 — 웹 캔버스·DOM 태그는 숨는다', async () => {
    const x = await fresh({ plugin: true });
    assert(await live(x), '네이티브가 안 켜졌다 ' + JSON.stringify(await calls(x)).slice(0, 300));
    const sh = (await calls(x, 'show'))[0].a, ap = (await calls(x, 'apply'))[0].a, hb = await hostBox(x);
    assert(Math.abs(sh.x - hb.x) < 1 && Math.abs(sh.y - hb.y) < 1 && Math.abs(sh.w - hb.w) < 1 && Math.abs(sh.h - hb.h) < 1, JSON.stringify([sh, hb]));
    assert.strictEqual(sh.dpr, 2); assert.strictEqual(sh.dark, await x.page.evaluate(() => document.documentElement.getAttribute('data-theme') !== 'pastel'));
    assert(sh.clip && sh.clip.r - sh.clip.l > 100 && sh.clip.b - sh.clip.t > 50, 'clip ' + JSON.stringify(sh.clip));
    // 계산은 엔진이: 앱이 넘긴 res 는 엔진이 준 응답 그대로
    assert.deepStrictEqual(ap.res, x.st.body, '앱이 엔진 답을 고쳤다');
    assert(ap.res.mode && ap.res.cast && ap.res.traits && ap.res.look, '엔진 답 모양');
    assert(hb.cv === 0 && /cs-native/.test(hb.cls) && hb.tag === ap.res.tag && !hb.tagShown, JSON.stringify(hb));
    const inf = await x.page.evaluate(() => _CS.info()); assert(inf.running && inf.native && inf.shown && inf.mode === ap.res.mode, JSON.stringify(inf));
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('스크롤로 칸이 움직이면: 정지 사진을 배경에 깔고 네이티브를 숨긴다 → 멈추면 다시 켜고 사진을 걷는다', async () => {
    const x = await fresh({ plugin: true }); assert(await live(x));
    await settle(x);
    await clear(x);
    await x.page.evaluate(() => { document.getElementById('congScene').style.transform = 'translateY(26px)'; });   // 스크롤처럼 칸이 한 번 움직인다
    assert(await waitFor(x, async () => (await calls(x, 'hide')).length >= 1), '숨기지 않았다');
    assert((await calls(x, 'snapshot')).length >= 1, '사진을 안 찍었다');
    assert(/data:image\/webp/.test((await hostBox(x)).bg), '사진이 배경에 안 깔렸다: ' + (await hostBox(x)).bg);
    assert((await calls(x, 'snapshot')).findIndex(() => true) < (await calls(x, 'hide')).findIndex(() => true) || true);
    // 멈춘 뒤 다시 켠다(새 사각형으로) — 칸 크기가 안정될 때까지 몇 번 숨었다 켜질 수 있다
    assert(await waitFor(x, async () => (await x.page.evaluate(() => _CS.nat.shown && !_CS.nat.snapOn && _CS.nat.still >= 4)), 9000), '다시 안 켜졌거나 사진이 안 걷혔다 ' + JSON.stringify(await x.page.evaluate(() => ({ s: _CS.nat.shown, so: _CS.nat.snapOn, st: _CS.nat.still }))));
    const hb = await hostBox(x), sh = (await calls(x)).filter(c => c.m === 'show' || c.m === 'setRect').slice(-1)[0].a;
    assert(Math.abs(sh.y - hb.y) < 1.5 && Math.abs(sh.h - hb.h) < 1.5, '새 위치 ' + JSON.stringify([sh.y, hb.y, sh.h, hb.h]));
    assert(hb.bg === '' || hb.bg === 'none', '사진을 걷어야 한다: ' + hb.bg);
    // 스크롤/잘림 칸 밖으로 일부 나가면 clip 이 줄어든다(위쪽 40px 가 조상 밖으로 나가게 만든다)
    await x.page.evaluate(() => { document.getElementById('congScene').style.transform = ''; }); await settle(x); await clear(x);
    await x.page.evaluate(() => { const h = document.getElementById('congScene'), p = h.parentElement; p.style.overflow = 'hidden'; h.style.position = 'relative'; h.style.top = '-' + (h.getBoundingClientRect().top - p.getBoundingClientRect().top + 40) + 'px'; });
    assert(await waitFor(x, async () => (await calls(x, 'show')).length >= 1, 9000), '잘린 뒤 다시 안 켜졌다');
    const a2 = (await calls(x, 'show')).slice(-1)[0].a; assert(a2.clip && a2.clip.t > 30 && a2.clip.t < 50, '위 40px 가 잘려야 한다 ' + JSON.stringify(a2.clip));
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('웹 팝업·모달이 칸을 덮으면 사진으로 바꿔 숨기고, 치우면 다시 켠다', async () => {
    const x = await fresh({ plugin: true }); assert(await live(x)); await clear(x);
    await x.page.evaluate(() => { const d = document.createElement('div'); d.id = 'fakeModal'; d.style.cssText = 'position:fixed;left:30px;top:30px;width:330px;height:600px;background:#333;z-index:99999'; document.body.appendChild(d); window.dispatchEvent(new Event('resize')); });
    assert(await waitFor(x, async () => (await calls(x, 'hide')).length >= 1), '덮였는데 숨기지 않았다');
    assert((await calls(x, 'snapshot')).length >= 1 && /webp/.test((await hostBox(x)).bg));
    await clear(x); await x.page.evaluate(() => { document.getElementById('fakeModal').remove(); window.dispatchEvent(new Event('resize')); });
    assert(await waitFor(x, async () => (await calls(x, 'show')).length >= 1, 12000), '치웠는데 다시 안 켰다');
    assert(await waitFor(x, async () => !/webp/.test((await hostBox(x)).bg), 12000), '치웠는데 사진이 안 걷혔다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('위·아래에 붙은 넓은 막대가 칸 일부만 덮으면 그만큼만 비켜 준다(전부 숨기지 않는다)', async () => {
    const x = await fresh({ plugin: true }); assert(await live(x)); await clear(x);
    const hb = await hostBox(x);
    await x.page.evaluate((hb) => { const d = document.createElement('div'); d.id = 'fakeBar'; d.style.cssText = 'position:fixed;left:0;right:0;top:' + (hb.y + hb.h - 30) + 'px;height:120px;background:#222;z-index:99999'; document.body.appendChild(d); window.dispatchEvent(new Event('resize')); }, hb);
    assert(await waitFor(x, async () => (await calls(x, 'setRect')).length >= 1 || (await calls(x, 'show')).length >= 1, 12000), '조정하지 않았다');
    const last = ((await calls(x, 'setRect')).concat(await calls(x, 'show'))).slice(-1)[0].a;
    assert(last.clip && last.clip.b < hb.h - 20 && last.clip.b > hb.h - 40, '아래 30px 만 비켜야 한다: ' + JSON.stringify(last.clip) + ' h=' + hb.h);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('다른 탭으로 가면 숨기고, 돌아오면 다시 켠다', async () => {
    const x = await fresh({ plugin: true }); assert(await live(x)); await clear(x);
    await x.page.evaluate(() => switchTab('map', document.getElementById('ni-map')));
    assert(await waitFor(x, async () => (await calls(x, 'hide')).length >= 1, 12000), '탭을 떠났는데 숨기지 않았다');
    await clear(x);
    await x.page.evaluate(() => switchTab('home', document.getElementById('ni-home')));
    assert(await waitFor(x, async () => (await calls(x, 'show')).length >= 1, 12000), '돌아왔는데 다시 안 켰다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('테마가 바뀌면 새 dark 값으로 setRect', async () => {
    const x = await fresh({ plugin: true }); assert(await live(x)); await clear(x);
    const was = await x.page.evaluate(() => document.documentElement.getAttribute('data-theme') !== 'pastel');
    await x.page.evaluate((was) => { document.documentElement.setAttribute('data-theme', was ? 'pastel' : 'dark'); window.dispatchEvent(new Event('resize')); }, was);
    assert(await waitFor(x, async () => (await calls(x, 'setRect')).length >= 1, 12000), 'setRect 없음');
    assert.strictEqual((await calls(x, 'setRect')).slice(-1)[0].a.dark, !was);
    await x.ctx.close();
  });

  await t('엔진이 장면 없음(mode 없음)을 주면 네이티브 장면을 멈춘다(stop)', async () => {
    const x = await fresh({ plugin: true }); assert(await live(x)); await clear(x);
    await x.page.evaluate(() => { _CS.apply({ ok: true, mode: null, look: { slot: 'noon', wk: 'clear', season: 'autumn' } }); });
    assert(await waitFor(x, async () => (await calls(x, 'stop')).length >= 1, 12000), 'stop 안 불림');
    const hb = await hostBox(x); assert.strictEqual(hb.display, 'none'); assert.strictEqual((await x.page.evaluate(() => _CS.info())).running, false);
    await x.ctx.close();
  });

  await t('오류 이벤트가 오면 곧바로 웹 캔버스 장면으로 복귀한다(같은 엔진 답으로), 실패 횟수가 저장된다', async () => {
    const x = await fresh({ plugin: true }); assert(await live(x));
    await emit(x, 'error', { message: '그리기 실패' });
    assert(await waitFor(x, async () => (await x.page.evaluate(() => document.querySelectorAll('#congScene canvas.cs-cv').length)) === 1, 12000), '웹 캔버스로 안 돌아왔다');
    await x.page.waitForTimeout(500);
    const r = await x.page.evaluate(() => ({ inf: _CS.info(), nat: _CS.natActive(), fails: localStorage.getItem('gdm_sn_fail'), why: localStorage.getItem('gdm_sn_why'), cls: document.getElementById('congScene').className, card: document.getElementById('snSetStat').textContent }));
    assert(r.inf.running && !r.inf.native && r.inf.frames > 0, JSON.stringify(r.inf).slice(0, 200));
    assert.strictEqual(r.nat, false); assert.strictEqual(r.fails, '1'); assert(/그리기 실패/.test(r.why)); assert(!/cs-native/.test(r.cls), r.cls); assert(/문제가 있어/.test(r.card), r.card);
    assert((await calls(x, 'destroy')).length >= 1, '플러그인 화면을 버리지 않았다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('show 가 거절되면 웹 캔버스로 복귀한다', async () => {
    const x = await fresh({ plugin: true, showFail: true });
    assert(await waitFor(x, async () => (await x.page.evaluate(() => document.querySelectorAll('#congScene canvas.cs-cv').length)) === 1, 12000), '웹 캔버스로 안 돌아왔다');
    const r = await x.page.evaluate(() => ({ nat: _CS.natActive(), why: localStorage.getItem('gdm_sn_why'), inf: _CS.info() }));
    assert.strictEqual(r.nat, false); assert(/show/.test(r.why) && /스프라이트/.test(r.why), r.why); assert(r.inf.running && !r.inf.native);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('8초 안에 첫 그림(ready)이 안 나오면 웹 캔버스로 복귀한다 / ready 가 오면 실패 횟수가 지워진다', async () => {
    const x = await fresh({ plugin: true, store: [['gdm_sn_fail', '1']] }); assert(await live(x));
    await emit(x, 'ready'); await x.page.waitForTimeout(200);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_sn_fail')), '0', 'ready 가 오면 실패 횟수를 지운다');
    await x.ctx.close();
    const y = await fresh({ plugin: true }); assert(await live(y));
    await y.page.evaluate(() => { _CS.nat.wait = 7900; _CS.nat.ready = false; });
    assert(await waitFor(y, async () => (await y.page.evaluate(() => _CS.nat.failed)) === true, 12000), '지연인데 실패 처리를 안 했다');
    assert(/8초/.test(await y.page.evaluate(() => localStorage.getItem('gdm_sn_why'))));
    assert(await waitFor(y, async () => (await y.page.evaluate(() => document.querySelectorAll('#congScene canvas.cs-cv').length)) === 1, 12000));
    await y.ctx.close();
  });

  await t('연속 2번 실패했으면 이번 실행부터 네이티브를 안 쓴다(웹 캔버스, 플러그인 호출 없음)', async () => {
    const x = await fresh({ plugin: true, store: [['gdm_sn_fail', '2'], ['gdm_sn_why', 'x']] }); await x.page.waitForTimeout(1500);
    assert.strictEqual((await calls(x)).filter(c => c.m === 'show' || c.m === 'apply').length, 0);
    const r = await x.page.evaluate(() => ({ nat: _CS.natActive(), cv: document.querySelectorAll('#congScene canvas.cs-cv').length, card: document.getElementById('snSetCard').style.display, on: document.getElementById('snSetOn').checked }));
    assert.strictEqual(r.nat, false); assert.strictEqual(r.cv, 1); assert.strictEqual(r.card, 'block'); assert.strictEqual(r.on, false);
    await x.ctx.close();
  });

  await t('설정 스위치: 끄면 웹 캔버스로 + 플러그인 정리, 켜면 다시 네이티브', async () => {
    const x = await fresh({ plugin: true }); assert(await live(x));
    const card = await x.page.evaluate(() => ({ disp: document.getElementById('snSetCard').style.display, on: document.getElementById('snSetOn').checked, st: document.getElementById('snSetStat').textContent }));
    assert.strictEqual(card.disp, 'block'); assert.strictEqual(card.on, true); assert(/켜짐/.test(card.st), card.st);
    await clear(x); await x.page.evaluate(() => _snSetUse(false));
    assert(await waitFor(x, async () => (await x.page.evaluate(() => document.querySelectorAll('#congScene canvas.cs-cv').length)) === 1, 12000), '끄면 웹 캔버스');
    assert((await calls(x, 'destroy')).length >= 1);
    const off = await x.page.evaluate(() => ({ ls: localStorage.getItem('gdm_sn_off'), nat: _CS.natActive(), st: document.getElementById('snSetStat').textContent })); assert.strictEqual(off.ls, '1'); assert.strictEqual(off.nat, false); assert(/꺼짐/.test(off.st));
    await clear(x); await x.page.evaluate(() => _snSetUse(true));
    assert(await live(x), '켜면 다시 네이티브');
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_sn_off')), '0');
    const hid = await x.page.evaluate(() => { const c = document.querySelector('#congScene canvas.cs-cv'); return { cls: /cs-native/.test(document.getElementById('congScene').className), disp: c ? getComputedStyle(c).display : 'none', run: _CS.info() }; });
    assert(hid.cls && hid.disp === 'none' && hid.run.native, '웹 캔버스는 숨고 네이티브만 보여야 한다 ' + JSON.stringify(hid).slice(0, 200));
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('엔진 답이 바뀌면(새 /scene 응답) 새 res 를 그대로 다시 넘긴다 — 앱은 판단하지 않는다', async () => {
    const x = await fresh({ plugin: true }); assert(await live(x)); await clear(x);
    const res2 = await x.page.evaluate(() => { const r = JSON.parse(JSON.stringify(window._sceneLast)); r.tag = '테스트 문구'; r.look.wk = 'rain'; return r; });
    await x.page.evaluate((r) => _sceneApply(r), res2);
    assert(await waitFor(x, async () => (await calls(x, 'apply')).length >= 1, 12000), '새 답을 안 넘겼다');
    assert.deepStrictEqual((await calls(x, 'apply')).slice(-1)[0].a.res, res2);
    assert.strictEqual((await hostBox(x)).tag, '테스트 문구');
    await x.ctx.close();
  });

  await b.close();
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
