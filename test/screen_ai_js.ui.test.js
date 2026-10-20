// 서버 구동 네이티브 홈 AI 승무원 카드(ai) 웹 연결 시험 — 2026-10-20 (s77)
//   원칙: "계산은 엔진이, 그림은 앱이". 앱은 사실(출발/도착·기준 시각·혼잡도·날씨·경로 구간…)만 보내고, 제목·문장·색·마감 시각은 엔진이 정한다.
//   · 플러그인이 없거나 꺼져 있거나 옛 APK(cap 14 미만)면 요청 없이 웹 그대로 · 켜면 #homeAiInner 를 덮고 size 이벤트로 높이를 따른다
//   · 웹이 DOM 으로 그린 제목·미리보기·브리핑 문장(예전 계산)과 엔진이 내려준 글이 한 글자도 다르지 않다 · 새로고침 단추 · 생성 중이면 단추가 눌리지 않는다
// 실행: node test/screen_ai_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const EA = require('../engine/aicard');
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
      if (u.pathname === '/screen/ai' && u.hostname.indexOf('route-v2') >= 0) {
        assert.strictEqual(req.method(), 'POST'); assert.ok(/text\/plain/.test(req.headers()['content-type'] || ''), '사전 요청이 필요한 형식으로 보냈다');
        const body = JSON.parse(req.postData() || '{}'); x.reqs.push(body);
        if (x.serve === 'down') return r.abort();
        const out = JSON.stringify(EA.aiScreen({ cap: Number(body.cap) || 0 }, body.f)); 
        return r.fulfill({ status: JSON.parse(out).ok ? 200 : 400, contentType: 'application/json', body: out });
      }
      return r.abort();
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try { localStorage.setItem('locDisc', '1'); if (o.on) localStorage.setItem('gdm_scra_on', '1'); } catch (e) {}
      window.__sn = []; window.__snL = {};
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const put = (m) => (a) => { window.__sn.push({ m, a: JSON.parse(JSON.stringify(a)) }); if (a.json != null) { try { const j = JSON.parse(a.json); if (j.v !== 1 || !Array.isArray(j.body)) throw 0; } catch (e) { return Promise.reject(new Error('invalid: 규격')); } } return Promise.resolve(); };
        const rec = (m) => (a) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { ScreenNative: {
          show: put('show'), update: put('update'), setRect: rec('setRect'), hide: rec('hide'), destroy: rec('destroy'), toast: rec('toast'), setField: rec('setField'),
          status: () => Promise.resolve(o.oldApk ? { visible: true, items: 4, age: 20, scroll: 0, cap: 13 } : { visible: true, items: 11, age: 20, scroll: 0, cap: 14 }),
          addListener: (n, f) => { (window.__snL[n] = window.__snL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.goto('file://' + html); await page.waitForTimeout(2200);
    await page.evaluate(() => { const ov = document.getElementById('locDiscOv'); if (ov) ov.remove(); });
    await page.evaluate(() => {
      switchTab('home', document.getElementById('ni-home'));
      window.__refresh = 0; window.requestHomeBrief = function () { window.__refresh++; };     // 웹의 데이터 계층(서버·날씨 호출)은 이 시험의 대상이 아니다
      window._fetchWeather = function (la, ln, cb) { cb({ temp: 12, txt: '맑음', rain: 0 }); };
    });
    await page.waitForFunction(() => window._haiV > 0, null, { timeout: 7000 }).catch(() => {});      // 앱이 스스로 도는 첫 브리핑(현위치)이 끝나길 기다린 뒤 주기를 멈춘다 — 이후 사실은 시험이 직접 정한다
    await page.waitForTimeout(600);
    await page.evaluate(() => { try { stopHomeAI(); } catch (e) {} window.__refresh = 0; document.getElementById('homeAiCard').scrollIntoView({ block: 'center' }); });      // 화면 밖의 카드는 기기가 그리지 않는다 — 보이게 둔다
    await page.waitForTimeout(300);
    return x;
  }
  const calls = (x, m) => x.page.evaluate((m) => window.__sn.filter(c => !m || c.m === m), m || null);
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__snEmit(n, d), [n, d || {}]);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await x.page.waitForTimeout(60); } return false; };
  const puts = async (x) => (await calls(x)).filter(c => (c.m === 'show' || c.m === 'update') && c.a.id === 'ai');
  const own = (x) => x.page.evaluate(() => document.getElementById('homeAiInner').classList.contains('ai-own'));
  const lastReq = (x) => x.reqs[x.reqs.length - 1];
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const NOON = Date.UTC(2026, 9, 20, 5, 5);      // 2026-10-20 14:05 KST
  // 웹이 이미 그린 제목·문단(예전 계산) 읽기
  const webCard = (x) => x.page.evaluate(() => ({ title: document.getElementById('homeAiTitle').textContent, ps: Array.from(document.querySelectorAll('#homeAiBody p')).map(p => p.textContent) }));
  const setBase = (x, ms) => x.page.evaluate((ms) => { window._baseTimeMs = ms; }, ms);

  console.log('[① 플러그인이 없거나 꺼져 있거나 옛 APK 면 예전 그대로]');
  await t('플러그인이 없으면(웹): 요청 없음 · 웹 카드 그대로', async () => {
    const x = await fresh({ plugin: false, on: true }); await x.page.evaluate(() => _haiSet({ mode: 'loading' })); await x.page.waitForTimeout(1200);
    assert.strictEqual(x.reqs.length, 0); assert.strictEqual(await own(x), false); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('꺼져 있으면(기본) 호출·요청 없음', async () => {
    const x = await fresh({ plugin: true, on: false }); await x.page.evaluate(() => _haiSet({ mode: 'loading' })); await x.page.waitForTimeout(1500);
    assert.strictEqual((await calls(x)).filter(c => c.a && c.a.id === 'ai').length, 0); assert.strictEqual(x.reqs.length, 0);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scra_on')), null); await x.ctx.close();
  });
  await t('옛 APK(cap 14 미만)면 켜져 있어도 요청 없음', async () => {
    const x = await fresh({ plugin: true, on: true, oldApk: true }); await x.page.evaluate(() => _haiSet({ mode: 'loading' })); await x.page.waitForTimeout(1800);
    assert.strictEqual(x.reqs.length, 0); assert.strictEqual(await own(x), false); await x.ctx.close();
  });

  console.log('[② 켜면 덮고 엔진이 정한 그대로 그린다]');
  await t('요청은 사실뿐(제목·문장·색 없음) · cap 14 · 엔진 화면을 그대로 show · 웹 속을 가린다', async () => {
    const x = await fresh({ plugin: true, on: true });
    await x.page.evaluate((ms) => { window._baseTimeMs = null; _renderHomeConductorBrief('부평', '', 14, 50, null); }, NOON);
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1 && x.reqs.some(r => r.f.mode === 'brief' && r.f.from === '부평'), 9000), 'brief show 가 없다');
    const q = x.reqs.filter(r => r.f.mode === 'brief' && r.f.from === '부평').pop(); assert.strictEqual(q.cap, 14); assert.strictEqual(q.f.from, '부평'); assert.ok(Number.isFinite(q.f.now) && q.f.now % 60000 === 0);
    const bad = JSON.stringify(q.f).replace(/부평|맑음/g, '');
    assert.ok(!/#[0-9a-f]{3,6}|rgb|걸려요|예정이에요|AI 승무원|도착은/i.test(bad), '요청에 색·문장이 있다 ' + bad.slice(0, 300));
    const p = await puts(x); const j = JSON.parse(p[p.length - 1].a.json); const eng = EA.aiScreen({ cap: 14 }, p.length ? x.reqs[x.reqs.length - 1].f : null);
    assert.deepStrictEqual(j.head, eng.head); assert.strictEqual(j.screen, 'ai');
    assert.ok(await waitFor(x, async () => await own(x), 6000), '웹 카드 속을 안 가렸다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t("'size' 이벤트로 감싸개 높이를 따른다 · 끄면 걷고 설정이 0 으로 저장된다", async () => {
    const x = await fresh({ plugin: true, on: true }); await x.page.evaluate(() => _renderHomeConductorBrief('부평', '', 14, 50, null));
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000));
    await emit(x, 'size', { id: 'ai', h: 234 }); await x.page.waitForTimeout(150);
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('homeAiInner').offsetHeight), 234);
    const rc = (await calls(x, 'setRect')).concat(await calls(x, 'show')).filter(c => c.a && c.a.id === 'ai'); assert.ok(rc.length >= 1);
    await x.page.evaluate(() => window._scraSetUse(false)); await x.page.waitForTimeout(250);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scra_on')), '0'); assert.strictEqual(await own(x), false);
    assert.notStrictEqual(await x.page.evaluate(() => document.getElementById('homeAiInner').offsetHeight), 234);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  console.log('[③ 웹이 그리던 예전 계산과 엔진 글이 같다]');
  await t('실시간 · 목적지 없음: 제목과 모든 문단이 웹 계산과 같다(시각 글은 크로미엄의 한국어 시각)', async () => {
    const x = await fresh({ plugin: true, on: true });
    await x.page.evaluate(() => { window._baseTimeMs = null; _renderHomeConductorBrief('부평', '', 14, 50, null); _renderHomeBriefLocal('부평', '', 14, 50); });
    assert.ok(await waitFor(x, async () => x.reqs.some(r => r.f.mode === 'brief' && r.f.from === '부평'), 9000));
    await x.page.waitForTimeout(500);
    const web = await webCard(x), q = x.reqs.filter(r => r.f.mode === 'brief' && r.f.from === '부평').pop(), eng = EA.aiScreen({ cap: 14 }, Object.assign({}, q.f, { rnd: 0 }));
    assert.strictEqual(norm(web.title), norm(eng.head[0].s), '제목 ' + web.title + ' | ' + eng.head[0].s);
    const ep = eng.head.filter(n => n.t === 'text').map(n => norm(n.s));
    assert.strictEqual(web.ps.length, ep.length, '문단 수 ' + JSON.stringify(web.ps) + ' vs ' + JSON.stringify(ep));
    web.ps.forEach((w, i) => { if (i < ep.length - 1) assert.strictEqual(norm(w.replace(/ /g, ' ')), ep[i], '문단 ' + i); else assert.ok(/드릴게요/.test(w) && /드릴게요/.test(ep[i]), '마무리 문단'); });
    await x.ctx.close();
  });
  await t('미리보기(기준 시각을 옮김): 제목 · 날짜 문장 · 혼잡 전망이 웹 계산과 같다', async () => {
    for (const [ms, cong, to] of [[NOON, 50, '두정'], [Date.UTC(2026, 9, 20, 23, 30), 80, ''], [Date.UTC(2026, 9, 24, 3, 0), 20, '강남'], [Date.UTC(2026, 9, 20, 15, 0), 10, '']]) {
      const x = await fresh({ plugin: true, on: true });
      await setBase(x, ms);
      await x.page.evaluate(([to, cong]) => { _renderHomeBriefLocal('부평', to, new Date(getBaseTimeMs()).getHours(), cong); }, [to, cong]);
      assert.ok(await waitFor(x, async () => x.reqs.some(r => r.f.mode === 'preview'), 9000), '미리보기 요청이 없다');
      const web = await webCard(x), q = x.reqs.filter(r => r.f.mode === 'preview').pop(), eng = EA.aiScreen({ cap: 14 }, q.f);
      assert.strictEqual(q.f.tk, 'preview'); assert.strictEqual(q.f.base, ms);
      assert.strictEqual(norm(web.title), norm(eng.head[0].s), '제목 ' + web.title + ' | ' + eng.head[0].s);
      const ep = eng.head.filter(n => n.t === 'text').map(n => norm(n.s));
      assert.deepStrictEqual(web.ps.map(norm), ep, JSON.stringify(web.ps) + ' vs ' + JSON.stringify(ep));
      await x.ctx.close();
    }
  });
  await t('실시간 경로 있음: 요청에 구간·날씨 원자료가 가고 문장은 home-brief 와 같다', async () => {
    const x = await fresh({ plugin: true, on: true });
    await x.page.evaluate(() => { window._baseTimeMs = null; window._homeRouteBaseMin = 54; _renderHomeConductorBrief('부평', '두정', 14, 50, null); });
    assert.ok(await waitFor(x, async () => x.reqs.some(r => r.f.mode === 'brief' && r.f.from === '부평' && r.f.to === '두정'), 9000));
    const q = x.reqs.filter(r => r.f.mode === 'brief' && r.f.from === '부평').pop(); assert.strictEqual(q.f.mins, 54); assert.ok(typeof q.f.rnd === 'number' && q.f.rnd >= 0 && q.f.rnd < 1);
    const eng = EA.aiScreen({ cap: 14 }, q.f); assert.ok(eng.ok); assert.ok(/부평에서 두정까지는 약 54분 걸려요\./.test(eng.head[1].s), eng.head[1].s);
    await x.ctx.close();
  });

  console.log('[④ 새로고침 · 생성 중 · 카운트다운]');
  await t('새로고침 단추: 허용 목록(ai.refresh)만 requestHomeBrief(true) 를 부른다', async () => {
    const x = await fresh({ plugin: true, on: true }); await x.page.evaluate(() => _renderHomeConductorBrief('부평', '', 14, 50, null));
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000));
    await x.page.evaluate(() => { window.__refresh = 0; });
    await emit(x, 'action', { id: 'ai', a: 'call', v: 'ai.refresh' }); await x.page.waitForTimeout(150);
    assert.strictEqual(await x.page.evaluate(() => window.__refresh), 1);
    await emit(x, 'action', { id: 'ai', a: 'call', v: 'ai.evil' }); await emit(x, 'action', { id: 'ai', a: 'open', url: 'https://x.test' }); await x.page.waitForTimeout(150);
    assert.strictEqual(await x.page.evaluate(() => window.__refresh), 1); await x.ctx.close();
  });
  await t('생성 중(웹 단추가 눌린 채)이면 엔진이 단추를 빼고, 끝나면 되살린다', async () => {
    const x = await fresh({ plugin: true, on: true }); await x.page.evaluate(() => _renderHomeConductorBrief('부평', '', 14, 50, null));
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000));
    let p = await puts(x); assert.ok(JSON.parse(p[p.length - 1].a.json).head[0].act, '처음엔 단추가 눌린다'); const n0 = p.length;
    await x.page.evaluate(() => { document.getElementById('homeAiRefreshBtn').disabled = true; _haiSet({ mode: 'loading' }); });
    assert.ok(await waitFor(x, async () => (await puts(x)).length > n0, 8000)); p = await puts(x);
    let j = JSON.parse(p[p.length - 1].a.json); assert.strictEqual(j.head[0].bd, true); assert.ok(!j.head[0].act); assert.ok(j.head.some(n => n.s === '브리핑 생성 중...'), '생성 중 안내');
    assert.ok(!/[\u{1F000}-\u{1FFFF}]/u.test(JSON.stringify(j)), '이모지 없음');
    const n1 = p.length; await x.page.evaluate(() => { document.getElementById('homeAiRefreshBtn').disabled = false; _renderHomeConductorBrief('부평', '', 14, 50, null); });
    assert.ok(await waitFor(x, async () => (await puts(x)).length > n1, 8000)); p = await puts(x); j = JSON.parse(p[p.length - 1].a.json); assert.ok(j.head[0].act && !j.head[0].bd); await x.ctx.close();
  });
  await t('다음 갱신 마감 시각: 웹 카운트다운이 돌 때만 엔진이 알약을 준다(초 단위 ms)', async () => {
    const x = await fresh({ plugin: true, on: true });
    await x.page.evaluate(() => { _renderHomeConductorBrief('부평', '', 14, 50, null); });
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000));
    await x.page.evaluate(() => { stopHomeAI(); _homeAiNextAt = Date.now() + 245000; _startHomeCountdown(); _haiSet({}); });
    assert.ok(await waitFor(x, async () => { const p = await puts(x); const j = JSON.parse(p[p.length - 1].a.json); return !!j.head[0].to; }, 8000), '마감 시각이 없다');
    const q = lastReq(x); assert.ok(q.f.nextAt > Date.now() + 200000 && q.f.nextAt % 1000 === 0, 'nextAt ' + q.f.nextAt);
    await x.page.evaluate(() => stopHomeAI()); await x.page.evaluate(() => _haiSet({}));
    assert.ok(await waitFor(x, async () => lastReq(x).f.nextAt === 0, 8000), '멈추면 알약이 없어야 한다'); await x.ctx.close();
  });
  await t('남은 분이 바뀌면(웹이 정한 원자료) 제목이 다시 그려진다 · 같은 사실이면 요청이 늘지 않는다', async () => {
    const x = await fresh({ plugin: true, on: true });
    await x.page.evaluate(() => { window._baseTimeMs = null; window._homeRouteBaseMin = 54; _renderHomeConductorBrief('부평', '두정', 14, 50, null); });
    assert.ok(await waitFor(x, async () => x.reqs.some(r => r.f.mode === 'brief' && r.f.from === '부평' && r.f.to === '두정'), 9000)); await x.page.waitForTimeout(900);
    const n0 = x.reqs.length; await x.page.waitForTimeout(2500); assert.strictEqual(x.reqs.length, n0, '가만히 있는데 요청이 늘었다');
    await x.page.evaluate(() => { window._etaRemainMin = function () { return 31; }; });
    assert.ok(await waitFor(x, async () => x.reqs.length > n0 && lastReq(x).f.rem === 31, 8000), '남은 분 변화를 안 알렸다');
    assert.ok(await waitFor(x, async () => { const p = await puts(x); return /남은시간: 31분/.test(JSON.parse(p[p.length - 1].a.json).head[0].s); }, 8000), '제목이 31분으로 안 바뀌었다 ' + JSON.stringify(await x.page.evaluate(() => { const S = window._scrAi.S; return { good: S.good, why: S.why, fails: S.fails, failed: S.failed, fk: S.fk, inflight: S.inflight, bad: S.badFresh }; })) + JSON.stringify(await Promise.all([puts(x).then(p => p.map(c => JSON.parse(c.a.json).head[0].s)), Promise.resolve(x.reqs.map(r => [r.f.mode, r.f.from, r.f.rem]))]))); await x.ctx.close();
  });

  console.log('[⑤ 폴백]');
  await t('엔진이 죽으면 웹 카드 그대로', async () => {
    const x = await fresh({ plugin: true, on: true, serve: 'down' }); await x.page.evaluate(() => _renderHomeConductorBrief('부평', '', 14, 50, null));
    assert.ok(await waitFor(x, async () => x.reqs.length >= 1, 8000)); await x.page.waitForTimeout(1200);
    assert.strictEqual(await own(x), false); await x.ctx.close();
  });
  await t('설정 카드가 있다', async () => {
    const x = await fresh({ plugin: true, on: true });
    const o = await x.page.evaluate(() => ({ c: !!document.getElementById('scraSetCard'), on: !!document.getElementById('scraSetOn'), st: !!document.getElementById('scraSetStat') }));
    assert.deepStrictEqual(o, { c: true, on: true, st: true }); await x.ctx.close();
  });

  await b.close();
  console.log(fail ? ('FAIL ' + fail + ' / ' + (pass + fail)) : ('ALL OK ' + pass)); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
