// 서버 구동 네이티브 미리보기 라벨(pvl: 경로 · 혼잡도 · AI 승무원 카드 위 알약) 웹 연결 시험 — 2026-10-20 (s81)
//   원칙: "계산은 엔진이, 그림은 앱이". 앱은 사실(kind · mode(예상/노선도) · 웹이 보여 주던 기준 시각 글)만 보내고, 라벨 글·색·크기는 엔진이 정한다.
//   · 플러그인이 없거나 꺼져 있거나 옛 APK(cap 17 미만)면 요청 없이 웹 라벨 · 켜면 웹 라벨을 감추고 엔진 화면을 그대로 show · 미리보기가 꺼지면 걷는다
// 실행: node test/screen_talk_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const ET = require('../engine/pvlabel');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 800)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh(opt) {
    opt = opt || {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 2600 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const x = { ctx, page, errs, reqs: [], serve: opt.serve || 'ok' };
    await page.route('**/*', async r => {
      const u = new URL(r.request().url()), req = r.request();
      if (u.protocol === 'file:') return r.continue();
      if (u.pathname === '/screen/pvl' && u.hostname.indexOf('route-v2') >= 0) {
        assert.strictEqual(req.method(), 'POST'); assert.ok(/text\/plain/.test(req.headers()['content-type'] || ''), '사전 요청이 필요한 형식으로 보냈다');
        const body = JSON.parse(req.postData() || '{}'); x.reqs.push(body);
        if (x.serve === 'down') return r.abort();
        const out = JSON.stringify(ET.pvlScreen({ cap: Number(body.cap) || 0 }, body.f)); 
        return r.fulfill({ status: JSON.parse(out).ok ? 200 : 400, contentType: 'application/json', body: out });
      }
      return r.abort();
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try { localStorage.setItem('locDisc', '1'); if (o.on) localStorage.setItem('gdm_scrp_on', '1'); } catch (e) {}
      window.__sn = []; window.__snL = {}; window.__clip = []; try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__clip.push(t); return Promise.resolve(); } }, configurable: true }); } catch (e) {}
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const put = (m) => (a) => { window.__sn.push({ m, a: JSON.parse(JSON.stringify(a)) }); if (a.json != null) { try { const j = JSON.parse(a.json); if (j.v !== 1 || !Array.isArray(j.body)) throw 0; } catch (e) { return Promise.reject(new Error('invalid: 규격')); } } return Promise.resolve(); };
        const rec = (m) => (a) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { ScreenNative: {
          show: put('show'), update: put('update'), setRect: rec('setRect'), hide: rec('hide'), destroy: rec('destroy'), toast: rec('toast'), setField: rec('setField'),
          status: () => Promise.resolve(o.oldApk ? { visible: true, items: 4, age: 20, scroll: 0, cap: 16 } : { visible: true, items: 11, age: 20, scroll: 0, cap: 17 }),
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
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__snEmit(n, d), [n, d || {}]);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await x.page.waitForTimeout(60); } return false; };
  const puts = async (x, id) => (await calls(x)).filter(c => (c.m === 'show' || c.m === 'update') && c.a.id === id);
  const hides = async (x, id) => (await calls(x, 'hide')).filter(c => c.a && c.a.id === id);
  const lastPut = async (x, id) => { const p = await puts(x, id); return JSON.parse(p[p.length - 1].a.json); };
  const IDS = { cong: 'pvc', ai: 'pva', route: 'pvr' };
  // 기준 시각을 미래로(예상) 또는 노선도 모드로 바꾸고 하이라이트를 갱신한다
  const setPv = (x, st, lbl) => x.page.evaluate(([st, lbl]) => {
    var d = document.getElementById('baseTimeDisplay'); if (!d) { d = document.createElement('span'); d.id = 'baseTimeDisplay'; d.style.display = 'none'; document.body.appendChild(d); } d.textContent = lbl || '';
    _baseTimeMs = st === 'custom' ? Date.now() + 3600000 : null; window._metroRouteMode = st === 'metro';
    var c = document.getElementById('transitResultCard'); if (c) { for (var e = c; e && e !== document.body; e = e.parentElement) { if (getComputedStyle(e).display === 'none') e.style.display = e === c ? 'flex' : 'block'; } }      // 시험: 경로 결과 카드가 보이게 한다
    _updatePreviewHighlight();
  }, [st, lbl || '']);
  const webLab = (x, id) => x.page.evaluate((id) => { var e = document.getElementById(id); return e ? getComputedStyle(e).display : 'none'; }, id);

  console.log('[① 플러그인이 없거나 꺼져 있거나 옛 APK 면 웹 라벨 그대로]');
  await t('플러그인이 없으면(웹): 요청 없음 · 웹 라벨 3개가 뜬다', async () => {
    const x = await fresh({ plugin: false, on: true }); await setPv(x, 'custom', '오후 2:30'); await x.page.waitForTimeout(800);
    assert.strictEqual(x.reqs.length, 0);
    for (const id of ['routePreviewLabel', 'congPreviewLabel', 'aiPreviewLabel']) assert.notStrictEqual(await webLab(x, id), 'none', id);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('꺼져 있으면(기본) 호출·요청 없음', async () => {
    const x = await fresh({ plugin: true, on: false }); await setPv(x, 'custom', '오후 2:30'); await x.page.waitForTimeout(1500);
    assert.strictEqual((await calls(x)).filter(c => c.a && /^pv[rca]$/.test(c.a.id || '')).length, 0); assert.strictEqual(x.reqs.length, 0);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scrp_on')), null); assert.notStrictEqual(await webLab(x, 'congPreviewLabel'), 'none'); await x.ctx.close();
  });
  await t('옛 APK(cap 17 미만)면 켜져 있어도 요청 없음 · 웹 라벨', async () => {
    const x = await fresh({ plugin: true, on: true, oldApk: true }); await setPv(x, 'custom', '오후 2:30'); await x.page.waitForTimeout(1800);
    assert.strictEqual(x.reqs.length, 0); assert.notStrictEqual(await webLab(x, 'congPreviewLabel'), 'none'); await x.ctx.close();
  });

  console.log('[② 켜면 웹 라벨을 감추고 엔진 화면을 그대로 그린다]');
  await t('예상: 카드마다 요청은 사실뿐 · 엔진 글 그대로 show · 웹 라벨 감춤', async () => {
    const x = await fresh({ plugin: true, on: true }); await x.page.waitForTimeout(400); await setPv(x, 'custom', '오후 2:30');
    for (const k of ['cong', 'ai', 'route']) assert.ok(await waitFor(x, async () => (await puts(x, IDS[k])).length >= 1, 9000), k + ' show 가 없다');
    for (const k of ['cong', 'ai', 'route']) {
      const q = x.reqs.filter(r => r.f.kind === k).pop(); assert.strictEqual(q.cap, 17); assert.deepStrictEqual(q.f, { kind: k, mode: 'custom', lbl: '오후 2:30' });
      const j = await lastPut(x, IDS[k]); assert.deepStrictEqual(j, JSON.parse(JSON.stringify(ET.pvlScreen({ cap: 17 }, q.f)))); assert.strictEqual(j.screen, 'pvl');
    }
    assert.ok((await lastPut(x, 'pvc')).head[0].s === '예상 혼잡도 · 오후 2:30' && (await lastPut(x, 'pva')).head[0].s === '예상 브리핑 · 오후 2:30');
    for (const id of ['routePreviewLabel', 'congPreviewLabel', 'aiPreviewLabel']) assert.strictEqual(await webLab(x, id), 'none', id + ' 가 안 감춰졌다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('노선도 모드 글 · 기준 시각 글이 바뀌면 다시 그린다', async () => {
    const x = await fresh({ plugin: true, on: true }); await x.page.waitForTimeout(400); await setPv(x, 'metro');
    assert.ok(await waitFor(x, async () => (await puts(x, 'pvc')).length >= 1, 9000)); assert.strictEqual((await lastPut(x, 'pvc')).head[0].s, '노선도에서 설정한 경로');
    await setPv(x, 'custom', '오후 5:00'); assert.ok(await waitFor(x, async () => (await lastPut(x, 'pvc')).head[0].s === '예상 혼잡도 · 오후 5:00', 9000)); await x.ctx.close();
  });
  await t("'size' 이벤트로 자리 높이를 따른다 · 미리보기가 꺼지면 걷고 웹 라벨도 숨김 그대로", async () => {
    const x = await fresh({ plugin: true, on: true }); await x.page.waitForTimeout(400); await setPv(x, 'custom', '오후 2:30');
    assert.ok(await waitFor(x, async () => (await puts(x, 'pvc')).length >= 1, 9000));
    await emit(x, 'size', { id: 'pvc', h: 36 }); await x.page.waitForTimeout(150);
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('congPvlNat').offsetHeight), 36);
    await setPv(x, 'off'); assert.ok(await waitFor(x, async () => (await hides(x, 'pvc')).length >= 1, 6000), '걷지 않았다');
    assert.strictEqual(await x.page.evaluate(() => getComputedStyle(document.getElementById('congPvlNat')).display), 'none'); await x.ctx.close();
  });

  console.log('[③ 폴백 · 설정]');
  await t('엔진이 죽으면 웹 라벨이 다시 보인다', async () => {
    const x = await fresh({ plugin: true, on: true, serve: 'down' }); await x.page.waitForTimeout(400); await setPv(x, 'custom', '오후 2:30');
    assert.ok(await waitFor(x, async () => x.reqs.length >= 1, 8000)); await x.page.waitForTimeout(1500);
    assert.notStrictEqual(await webLab(x, 'congPreviewLabel'), 'none'); await x.ctx.close();
  });
  await t('설정 카드가 있고 스위치가 세 라벨을 함께 켜고 끈다', async () => {
    const x = await fresh({ plugin: true, on: true });
    const o = await x.page.evaluate(() => ({ c: !!document.getElementById('scrpSetCard'), on: !!document.getElementById('scrpSetOn'), st: !!document.getElementById('scrpSetStat') }));
    assert.deepStrictEqual(o, { c: true, on: true, st: true });
    await x.page.evaluate(() => window._scrpSetUse(false)); await x.page.waitForTimeout(200);
    assert.strictEqual(await x.page.evaluate(() => Object.keys(_ndpvl.kits).map(k => _ndpvl.kits[k].S.on).join()), 'false,false,false');
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scrp_on')), '0'); await x.ctx.close();
  });

  await b.close();
  console.log(fail ? ('FAIL ' + fail + ' / ' + (pass + fail)) : ('ALL OK ' + pass)); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
