// 서버 구동 네이티브 홈 혼잡도 카드(cong) 웹 연결 시험 — 2026-10-20 (s76)
//   원칙: "계산은 엔진이, 그림은 앱이". 앱은 사실(역/호선/노선/원자료)만 보내고, 글·색·막대는 엔진이 정한다.
//   · 플러그인이 없거나 꺼져 있거나 옛 APK(cap 13 미만)면 요청 없이 웹 그대로 · 켜면 #congBody 를 덮고 size 이벤트로 높이를 따른다
//   · 요청에 색·글이 없다 · 엔진이 준 info 로 카드 띠 색·배지 글을 바꾼다 · 엔진이 죽으면 웹 그대로 · 장면(.cs-on)이면 쉰다
// 실행: node test/screen_cong_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const EC = require('../engine/cong');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 700)); } };

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
      if (u.pathname === '/screen/cong' && u.hostname.indexOf('route-v2') >= 0) {
        assert.strictEqual(req.method(), 'POST'); assert.ok(/text\/plain/.test(req.headers()['content-type'] || ''), '사전 요청이 필요한 형식으로 보냈다');
        const body = JSON.parse(req.postData() || '{}'); x.reqs.push(body);
        if (x.serve === 'down') return r.abort();
        const out = JSON.stringify(EC.congScreen({ cap: Number(body.cap) || 0 }, body.f));
        return r.fulfill({ status: JSON.parse(out).ok ? 200 : 400, contentType: 'application/json', body: out });
      }
      return r.abort();
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try { localStorage.setItem('locDisc', '1'); if (o.on) localStorage.setItem('gdm_scrg_on', '1'); } catch (e) {}
      window.__sn = []; window.__snL = {};
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const put = (m) => (a) => { window.__sn.push({ m, a: JSON.parse(JSON.stringify(a)) }); if (a.json != null) { try { const j = JSON.parse(a.json); if (j.v !== 1 || !Array.isArray(j.body)) throw 0; } catch (e) { return Promise.reject(new Error('invalid: 규격')); } } return Promise.resolve(); };
        const rec = (m) => (a) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { ScreenNative: {
          show: put('show'), update: put('update'), setRect: rec('setRect'), hide: rec('hide'), destroy: rec('destroy'), toast: rec('toast'), setField: rec('setField'),
          status: () => Promise.resolve(o.oldApk ? { visible: true, items: 4, age: 20, scroll: 0, cap: 12 } : { visible: true, items: 11, age: 20, scroll: 0, cap: 13 }),
          addListener: (n, f) => { (window.__snL[n] = window.__snL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.goto('file://' + html); await page.waitForTimeout(2200);
    await page.evaluate(() => { const ov = document.getElementById('locDiscOv'); if (ov) ov.remove(); });
    await page.evaluate(() => { switchTab('home', document.getElementById('ni-home')); });
    return x;
  }
  const calls = (x, m) => x.page.evaluate((m) => window.__sn.filter(c => !m || c.m === m), m || null);
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__snEmit(n, d), [n, d || {}]);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await x.page.waitForTimeout(60); } return false; };
  const puts = async (x) => (await calls(x)).filter(c => (c.m === 'show' || c.m === 'update') && c.a.id === 'cong');
  const own = (x) => x.page.evaluate(() => document.getElementById('congBody').classList.contains('cg-own'));
  const sub = (x, stn, line) => x.page.evaluate(([s, l]) => { _cgSet({ mode: 'sub', stn: s, line: l }); }, [stn, line]);
  // 앱이 스스로 도는 첫 계산(출발역 없음)이 먼저 올라갈 수 있다 — 시험이 정한 사실의 요청이 나가고 답이 그려져 잠잠해질 때까지 기다린다
  const settle = async (x, mode) => { await waitFor(x, async () => x.reqs.some(r => r.f.mode === mode), 9000); let n = ''; for (let k = 0; k < 60; k++) { await x.page.waitForTimeout(150); const c = x.reqs.length + '/' + (await puts(x)).length; if (c === n) break; n = c; } };
  const nodesOf = (j) => JSON.parse(j).head;

  console.log('[① 플러그인이 없거나 꺼져 있거나 옛 APK 면 예전 그대로]');
  await t('플러그인이 없으면(웹): 요청 없음 · 웹 본문 그대로', async () => {
    const x = await fresh({ plugin: false, on: true }); await sub(x, '강남', '2호선'); await x.page.waitForTimeout(1200);
    assert.strictEqual(x.reqs.length, 0); assert.strictEqual(await own(x), false); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('꺼져 있으면(기본) 호출·요청 없음', async () => {
    const x = await fresh({ plugin: true, on: false }); await sub(x, '강남', '2호선'); await x.page.waitForTimeout(1500);
    assert.strictEqual((await calls(x)).filter(c => c.a && c.a.id === 'cong').length, 0); assert.strictEqual(x.reqs.length, 0);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scrg_on')), null); await x.ctx.close();
  });
  await t('옛 APK(cap 13 미만)면 켜져 있어도 요청 없음', async () => {
    const x = await fresh({ plugin: true, on: true, oldApk: true }); await sub(x, '강남', '2호선'); await x.page.waitForTimeout(1800);
    assert.strictEqual(x.reqs.length, 0); assert.strictEqual(await own(x), false); await x.ctx.close();
  });

  console.log('[② 켜면 덮고 엔진이 정한 그대로 그린다]');
  await t('지하철: 요청은 사실뿐(색·글 없음) · cap 13 · 엔진 화면을 그대로 show', async () => {
    const x = await fresh({ plugin: true, on: true }); await sub(x, '강남', '2호선');
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000), 'show 가 없다'); await settle(x, 'sub');
    const q = x.reqs[x.reqs.length - 1]; assert.strictEqual(q.cap, 13); assert.strictEqual(q.f.mode, 'sub'); assert.strictEqual(q.f.stn, '강남'); assert.strictEqual(q.f.line, '2호선');
    assert.ok(Number.isFinite(q.f.now) && q.f.now % 300000 === 0, '지금은 5분 단위 ms');
    assert.ok(!/#[0-9a-f]{3,6}|rgb|혼잡|보통|원활/i.test(JSON.stringify(q.f).replace(/강남/g, '')), '요청에 색·상태 글이 없다 ' + JSON.stringify(q.f).slice(0, 200));
    const eng = EC.congScreen({ cap: 13 }, q.f); assert.ok(eng.ok);
    const p = await puts(x); const j = JSON.parse(p[p.length - 1].a.json);
    assert.deepStrictEqual(j.head, eng.head); assert.strictEqual(j.screen, 'cong');
    assert.ok(nodesOf(p[p.length - 1].a.json).some(n => n.t === 'chart'), '막대 차트가 있다');
    assert.ok(await waitFor(x, async () => await own(x), 6000), '웹 본문 속을 안 가렸다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t("'size' 이벤트로 감싸개 높이를 따른다 · 끄면 걷고 설정이 0 으로 저장된다", async () => {
    const x = await fresh({ plugin: true, on: true }); await sub(x, '강남', '2호선');
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000)); await settle(x, 'sub');
    await emit(x, 'size', { id: 'cong', h: 321 }); await x.page.waitForTimeout(150);
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('congBody').offsetHeight), 321);
    const rc = (await calls(x, 'setRect')).concat(await calls(x, 'show')).filter(c => c.a && c.a.id === 'cong'); assert.ok(rc.length >= 1);
    await x.page.evaluate(() => window._scrgSetUse(false)); await x.page.waitForTimeout(250);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scrg_on')), '0'); assert.strictEqual(await own(x), false);
    assert.notStrictEqual(await x.page.evaluate(() => document.getElementById('congBody').offsetHeight), 321);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('엔진이 준 info 를 그대로 적용한다: 카드 왼쪽 띠 색 · 배지 글/색', async () => {
    const x = await fresh({ plugin: true, on: true }); await sub(x, '강남', '2호선');
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000)); await settle(x, 'sub');
    const q = x.reqs[x.reqs.length - 1], eng = EC.congScreen({ cap: 13 }, q.f);
    await x.page.waitForTimeout(400);
    const got = await x.page.evaluate(() => ({ bd: document.getElementById('congBadge').textContent, bc: document.getElementById('congCard').style.borderLeftColor }));
    assert.strictEqual(got.bd, eng.info.badge); assert.ok(got.bc, '띠 색이 비었다'); await x.ctx.close();
  });
  await t('역이 바뀌면 다시 요청하고 다시 그린다', async () => {
    const x = await fresh({ plugin: true, on: true }); await sub(x, '강남', '2호선');
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000)); const n0 = x.reqs.length, p0 = (await puts(x)).length; await settle(x, 'sub');
    await sub(x, '서울역', '1호선');
    assert.ok(await waitFor(x, async () => x.reqs.some(r => r.f.stn === '서울역') && (await puts(x)).length > p0, 9000), '새 역을 다시 안 그렸다');
    assert.ok(x.reqs.filter(r => r.f.stn === '서울역').length >= 1); await x.ctx.close();
  });
  await t('같은 사실이면 요청이 늘지 않는다', async () => {
    const x = await fresh({ plugin: true, on: true }); await sub(x, '강남', '2호선');
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000)); await x.page.waitForTimeout(800); const n0 = x.reqs.length; await settle(x, 'sub');
    await x.page.waitForTimeout(2500); assert.strictEqual(x.reqs.length, n0); await x.ctx.close();
  });
  await t('버스: 원자료만 보내고(노선·정류장·[시간대, 승객 수]) 엔진이 정한 화면을 그린다', async () => {
    const x = await fresh({ plugin: true, on: true });
    await x.page.evaluate(() => { _cgSet({ mode: 'bus', bus: { no: '9714', stop: '강남역', pr: [[8, 12], [9, 30], [18, 38]] } }); });
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000)); await settle(x, 'bus');
    const q = x.reqs[x.reqs.length - 1]; assert.strictEqual(q.f.mode, 'bus'); assert.strictEqual(q.f.bus.no, '9714'); assert.deepStrictEqual(q.f.bus.pr, [[8, 12], [9, 30], [18, 38]]);
    const p = await puts(x); assert.deepStrictEqual(JSON.parse(p[p.length - 1].a.json).head, EC.congScreen({ cap: 13 }, q.f).head); await x.ctx.close();
  });
  await t('출발역이 없으면(none) 엔진이 정한 빈 화면을 그린다', async () => {
    const x = await fresh({ plugin: true, on: true });
    await x.page.evaluate(() => { _cgSet({ mode: 'none' }); });
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000)); await settle(x, 'none');
    const p = await puts(x); assert.ok(JSON.parse(p[p.length - 1].a.json).head.some(n => n.t === 'cars' && n.msg)); await x.ctx.close();
  });

  console.log('[③ 폴백 · 장면과 겹치지 않기]');
  await t('엔진이 죽으면 웹 본문 그대로', async () => {
    const x = await fresh({ plugin: true, on: true, serve: 'down' }); await sub(x, '강남', '2호선');
    assert.ok(await waitFor(x, async () => x.reqs.length >= 1, 8000)); await x.page.waitForTimeout(1200);
    assert.strictEqual(await own(x), false); await x.ctx.close();
  });
  await t('장면(.cs-on)이 보이는 동안은 네이티브가 쉰다 · 장면이 사라지면 다시 그린다', async () => {
    const x = await fresh({ plugin: true, on: true }); await sub(x, '강남', '2호선');
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000)); await settle(x, 'sub');
    await x.page.evaluate(() => document.getElementById('congCard').classList.add('cs-on'));
    assert.ok(await waitFor(x, async () => (await calls(x, 'hide')).some(c => c.a && c.a.id === 'cong'), 6000), '장면 중에도 안 숨겼다');
    assert.strictEqual(await own(x), false);
    const p0 = (await calls(x)).filter(c => c.a && c.a.id === 'cong' && (c.m === 'show' || c.m === 'update')).length;
    await x.page.evaluate(() => { document.getElementById('congCard').classList.remove('cs-on'); window._scrCong.kick(); });
    assert.ok(await waitFor(x, async () => (await calls(x)).filter(c => c.a && c.a.id === 'cong' && (c.m === 'show' || c.m === 'update')).length > p0, 8000), '장면이 걷힌 뒤 다시 안 그렸다'); await x.ctx.close();
  });
  await t('네이티브가 맡는 동안 예전 그림 영역(cs:*)은 비킨다', async () => {
    const x = await fresh({ plugin: true, on: true }); await sub(x, '강남', '2호선');
    assert.ok(await waitFor(x, async () => await own(x), 9000));
    assert.strictEqual(await x.page.evaluate(() => window._scrCong.owns()), true); await x.page.waitForTimeout(1200);
    const cs = (await calls(x)).filter(c => c.a && typeof c.a.id === 'string' && /^cs:/.test(c.a.id) && (c.m === 'show' || c.m === 'update') && c.a.json);
    assert.strictEqual(cs.length, 0, '예전 그림 영역이 같이 그린다 ' + cs.length); await x.ctx.close();
  });
  await t('설정 카드: 켜짐 표시와 상태 칸이 있다', async () => {
    const x = await fresh({ plugin: true, on: true });
    const o = await x.page.evaluate(() => ({ c: !!document.getElementById('scrgSetCard'), on: !!document.getElementById('scrgSetOn'), st: !!document.getElementById('scrgSetStat') }));
    assert.deepStrictEqual(o, { c: true, on: true, st: true }); await x.ctx.close();
  });

  await b.close();
  console.log(fail ? ('FAIL ' + fail + ' / ' + (pass + fail)) : ('ALL OK ' + pass)); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
