// 경로 요청을 앱 본체가 하기(설정 스위치 gdm_rtf) ↔ 앱(JS) 연결 시험 — 2026-10-19 (5번 3단계)
//   진짜 fmapDoRoute 를 가짜 경로 서버(engine/route-follow.js 로 follow 를 만든 응답) + 가짜 RouteFetch 플러그인(자바 RouteFetchCore 와 같은 단계 규칙)에 연결해 확인한다:
//   · 꺼져 있으면(기본) 예전 그대로 — 웹이 직접 요청하고 플러그인은 부르지 않는다
//   · 켜면: 웹은 경로 서버에 직접 요청하지 않는다(플러그인 request 한 번) · 엔진 지시(follow)대로 빠른 응답 → 전체 뒤따르기 / ldWait 면 빠른 응답은 그리지 않는다
//   · 재조회: 간격은 엔진 follow.retry, 요청에 pm/pa, 나아졌는지는 엔진 follow.better 를 따른다
//   · 폴백: 플러그인 없음 / request 거절 / 시간초과 아닌 통신 실패 / 옛 엔진(follow 없음) → 예전 방식 · 시간초과는 예전처럼 실패 안내
// 실행: node test/route_rtf.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const { resp } = require('./helpers/engine_fixture');
const RF = require('../engine/route-follow');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 900)); } };

// ── 가짜 경로 서버 ──
//   cfg: { fast:{liveStat,tt}, full:{liveStat,tt}, retry:[{liveStat,tt,forceBetter}…], legacy:bool, status:int }
let CFG = null, HITS = [];
function bodyFor(kind, u, idx) {
  const o = (kind === 'fast' ? CFG.fast : kind === 'full' ? CFG.full : (CFG.retry[Math.min(idx, CFG.retry.length - 1)])) || CFG.full;
  const r = resp(); r.liveStat = Object.assign({}, o.liveStat || {});
  if (o.tt) r.result.path.forEach(p => { if (p.info.tab === 'fast') p.info.totalTime = o.tt; });
  if (CFG.legacy) return JSON.stringify(r);
  const f = RF.routeFollow({ liveStat: r.liveStat, n: r.result.path.length, bf: false, ver: 'route-v2-test', pm: u.searchParams.get('pm'), pa: u.searchParams.get('pa') });
  if (o.forceBetter !== undefined) f.better = o.forceBetter;
  if (o.retryMs) f.retry = o.retryMs;
  return JSON.stringify(Object.assign({ follow: f }, r));
}
const fast = (tt, ls) => ({ tt, liveStat: ls || {} });

async function newApp(b, opt) {
  opt = Object.assign({ rtf: false, plugin: 'ok' }, opt || {});
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5547, longitude: 126.9726 }, permissions: ['geolocation'] });
  await ctx.addInitScript((o) => {
    try { localStorage.setItem('gdm_loc_disclosed', '1'); localStorage.setItem('bgPermGuided', '1'); if (o.rtf) localStorage.setItem('gdm_rtf', '1'); } catch (e) {}
    window.__rf = []; window.__rfL = {};
    const emit = (d) => { (window.__rfL.route || []).forEach(f => f(d)); };
    const plugins = {};
    if (o.plugin !== 'none') {
      const get = async (u) => {
        try { const r = await fetch(u + '&__via=plugin'); if (!r.ok) return { ok: false, why: 'HTTP ' + r.status }; return { ok: true, text: await r.text() }; }
        catch (e) { return { ok: false, why: 'timeout' }; }
      };
      const log = (n) => [{ ms: 5, how: '경로 ' + n + '건', n: n, ver: 'route-v2-test', err: null }];
      plugins.RouteFetch = {
        request: async (a) => {
          window.__rf.push(['request', JSON.parse(JSON.stringify(a))]);
          if (o.plugin === 'reject') throw new Error('거절');
          if (o.plugin === 'httpfail') return { id: a.id, stage: 'first', ok: false, why: 'HTTP 500', log: [] };
          if (o.plugin === 'timeout') return { id: a.id, stage: 'first', ok: false, why: 'timeout', log: [{ ms: 15000, how: '타임아웃(15000ms)', n: null, ver: null, err: null }] };
          const r0 = await get(a.url + '&live=0');
          if (!r0.ok) return { id: a.id, stage: 'first', ok: false, why: r0.why, log: [] };
          const j0 = JSON.parse(r0.text);
          if (!j0.follow) return { id: a.id, stage: 'first', ok: true, legacy: true, raw: r0.text, bytes: r0.text.length, log: [] };
          let first = r0, forced = false;
          if (j0.follow.draw === false) { const r1 = await get(a.url); if (r1.ok) first = r1; else forced = true; }
          const out = { id: a.id, stage: 'first', ok: true, raw: first.text, bytes: first.text.length, log: log(5) };
          if (forced) out.forced = true;
          if (!forced && j0.follow.draw !== false && j0.follow.next === 'full') {
            setTimeout(async () => { const r2 = await get(a.url); emit({ id: a.id, stage: 'full', ok: r2.ok, raw: r2.text, why: r2.why, bytes: (r2.text || '').length, log: log(5) }); }, 0);
          }
          return out;
        },
        once: async (a) => {
          window.__rf.push(['once', JSON.parse(JSON.stringify(a))]);
          const r = await get(a.url);
          if (!r.ok) return { id: a.id, stage: 'retry', ok: false, why: r.why, log: [] };
          const j = JSON.parse(r.text);
          return { id: a.id, stage: 'retry', ok: true, legacy: !j.follow, raw: r.text, bytes: r.text.length, log: log(5) };
        },
        last: () => Promise.resolve({ ok: false }),
        cancel: () => Promise.resolve({ ok: true }),
        status: () => Promise.resolve({ ok: true }),
        addListener: (n, f) => { (window.__rfL[n] = window.__rfL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
      };
    }
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: plugins };
  }, opt);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => {
    const u = new URL(r.request().url()); if (u.protocol === 'file:' || u.protocol === 'data:') return r.continue();
    const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (/route-v2/.test(u.host) && u.pathname === '/route-v2-app') {
      const via = u.searchParams.get('__via') === 'plugin' ? 'plugin' : 'web';
      const kind = u.searchParams.has('pm') ? 'retry' : (u.searchParams.get('live') === '0' ? 'fast' : 'full');
      const idx = HITS.filter(h => h.kind === 'retry').length;
      HITS.push({ via, kind, pm: u.searchParams.get('pm'), pa: u.searchParams.get('pa') });
      if (CFG.status) return r.fulfill({ status: CFG.status, headers: H, body: '{}' });
      return r.fulfill({ status: 200, headers: H, body: bodyFor(kind, u, idx) });
    }
    return r.fulfill({ status: 200, headers: H, body: '{}' });
  });
  await page.clock.install({ time: new Date('2026-10-08T21:00:00+09:00') });
  await page.goto('file://' + html); await page.clock.runFor(3500);
  return { ctx, page, errs };
}
async function search(page) {
  await page.click('#fmapDestInp'); await page.fill('#fmapDestInp', '수원'); await page.clock.runFor(800);
  await page.click('#fmapDestSug > *:first-child'); await page.clock.runFor(500);
  await page.waitForTimeout(200);
  // 도착지를 고르면 앱이 곧바로 탐색을 시작하기도 한다 — 이미 시작됐으면 단추를 또 누르지 않는다
  const started = (await page.evaluate(() => window.__rf.length)) + HITS.length;
  if (!started) await page.click('#fmapRouteBtn');
}
// 조건이 될 때까지 가짜 시계를 조금씩 돌린다(진짜 네트워크 응답은 실제 시간으로 온다)
async function until(page, fn, arg, tries) {
  for (let i = 0; i < (tries || 60); i++) {
    if (await page.evaluate(fn, arg)) return true;
    await page.clock.runFor(250); await page.waitForTimeout(25);
  }
  return false;
}
const fastTT = (page) => page.evaluate(() => (window._allRouteResults || _allRouteResults || {}).fast ? _allRouteResults.fast.info.totalTime : null);
// 재조회(once, id 가 숫자) 와 보조 요청(출발 시각 비교 등, id 가 g…)은 따로 센다
const rfCalls = (page, m) => page.evaluate((m) => window.__rf.filter(c => (!m || c[0] === m) && !(c[0] === 'once' && /^g/.test(c[1].id))), m || null);
const rfAux = (page) => page.evaluate(() => window.__rf.filter(c => c[0] === 'once' && /^g/.test(c[1].id)));
const drawn = (page) => until(page, () => !!(window._allRouteResults || (typeof _allRouteResults !== 'undefined' && _allRouteResults)) && !!_allRouteResults.fast);
const sync = (page) => page.evaluate(() => { _rtfSyncCard(); const c = document.getElementById('rtfSetCard'); return { shown: !!c && c.style.display === 'block', on: !!document.getElementById('rtfSetOn').checked, stat: document.getElementById('rtfSetStat').textContent }; });

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const reset = (c) => { CFG = c; HITS = []; };

  console.log('[꺼짐 = 예전 그대로]');
  reset({ fast: fast(50), full: fast(50) });
  let x = await newApp(b, { rtf: false });
  await t('꺼져 있으면: 웹이 직접 요청(live=0)하고 플러그인은 부르지 않는다', async () => {
    await search(x.page); assert.ok(await drawn(x.page), '경로가 그려지지 않았다');
    assert.ok(HITS.length >= 1 && HITS.every(h => h.via === 'web'), JSON.stringify(HITS));
    assert.strictEqual((await rfCalls(x.page)).length, 0);
    assert.strictEqual(await fastTT(x.page), 50);
  });
  await t('설정 카드는 플러그인이 있으면 보이고 꺼짐 문구', async () => {
    const s = await sync(x.page); assert.ok(s.shown && !s.on && /꺼짐/.test(s.stat), JSON.stringify(s));
  });
  await t('카드 스위치 → gdm_rtf 저장', async () => {
    await x.page.evaluate(() => _rtfSetUse(true));
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_rtf')), '1');
    assert.ok((await sync(x.page)).on);
    await x.page.evaluate(() => _rtfSetUse(false));
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_rtf')), '0');
  });
  await t('JS 오류 없음', async () => assert.deepStrictEqual([...new Set(x.errs)], []));
  await x.ctx.close();

  console.log('[플러그인 없음]');
  x = await newApp(b, { rtf: true, plugin: 'none' });
  await t('스위치가 켜져 있어도 플러그인이 없으면 예전 방식 · 카드 숨김', async () => {
    reset({ fast: fast(50), full: fast(50) });
    await search(x.page); assert.ok(await drawn(x.page));
    assert.ok(HITS.length >= 1 && HITS.every(h => h.via === 'web'), JSON.stringify(HITS));
    const s = await sync(x.page); assert.ok(!s.shown, JSON.stringify(s));
  });
  await x.ctx.close();

  console.log('[켜짐: 보통 응답]');
  reset({ fast: fast(50), full: fast(50) });
  x = await newApp(b, { rtf: true });
  await t('웹은 경로 서버에 직접 묻지 않는다 · 플러그인 request 한 번 · 주소에 live=0 이 붙지 않는다(자바가 붙인다)', async () => {
    await search(x.page); assert.ok(await drawn(x.page), '경로가 그려지지 않았다');
    const rq = await rfCalls(x.page, 'request'); assert.strictEqual(rq.length, 1);
    assert.ok(/\/route-v2-app\?SX=/.test(rq[0][1].url) && !/live=0/.test(rq[0][1].url) && rq[0][1].timeoutMs === 15000 && /^\d+$/.test(rq[0][1].id), JSON.stringify(rq[0]));
    assert.ok(HITS.length >= 1 && HITS.every(h => h.via === 'plugin'), '웹이 직접 요청함 ' + JSON.stringify(HITS));
    assert.strictEqual(await fastTT(x.page), 50);
  });
  await t('보조 요청(출발 시각 비교)도 앱 본체가 받는다 — 웹이 직접 묻지 않는다', async () => {
    assert.ok(await until(x.page, () => window.__rf.filter(c => c[0] === 'once' && /^g/.test(c[1].id)).length >= 1, null, 40), '보조 요청이 앱 본체로 가지 않았다');
    const aux = await rfAux(x.page); assert.ok(aux.every(c => /live=0/.test(c[1].url)), JSON.stringify(aux));
    assert.ok(HITS.every(h => h.via === 'plugin'), JSON.stringify(HITS));
  });
  await t('진단 줄(_routeFetchLog)에 앱 본체가 준 줄이 들어간다 · 계획 문구', async () => {
    const d = await x.page.evaluate(() => ({ log: window._routeFetchLog, plan: window._routeStagePlan }));
    assert.ok(d.log.length >= 1 && d.log[0].how === '경로 5건' && d.log[0].ver === 'route-v2-test', JSON.stringify(d));
    assert.ok(/앱 본체 1건/.test(d.plan), d.plan);
  });
  await t('카드: 켜짐 문구(마지막 응답 크기)', async () => {
    const s = await sync(x.page); assert.ok(s.shown && s.on && /켜짐/.test(s.stat) && /마지막 응답/.test(s.stat), JSON.stringify(s));
  });
  await t('JS 오류 없음', async () => assert.deepStrictEqual([...new Set(x.errs)], []));
  await x.ctx.close();

  console.log('[켜짐: 빠른 응답 → 전체 뒤따르기(livePending)]');
  reset({ fast: fast(50, { livePending: true, liveSkipFast: true }), full: fast(41, { liveApplied: 2, liveMissing: 0 }) });
  x = await newApp(b, { rtf: true });
  await t('빠른 응답을 먼저 그리고, 엔진 지시(next=full)대로 뒤따라 온 전체로 다시 그린다', async () => {
    await search(x.page); assert.ok(await drawn(x.page));
    assert.ok(await until(x.page, () => _allRouteResults && _allRouteResults.fast && _allRouteResults.fast.info.totalTime === 41), '전체로 다시 그려지지 않음 tt=' + await fastTT(x.page));
    assert.deepStrictEqual(HITS.map(h => h.kind), ['fast', 'full']);
    assert.ok(HITS.every(h => h.via === 'plugin'));
    assert.strictEqual((await rfCalls(x.page, 'request')).length, 1);
  });
  await x.ctx.close();

  console.log('[켜짐: ldWait — 빠른 응답은 그리지 않는다]');
  reset({ fast: fast(99, { ldWait: true, livePending: true }), full: fast(44, {}) });
  x = await newApp(b, { rtf: true });
  await t('전체가 first 로 와서 그것만 그린다(빠른 응답의 값 99 는 한 번도 그려지지 않는다)', async () => {
    await x.page.evaluate(() => { window.__tts = []; const iv = setInterval(() => { try { if (_allRouteResults && _allRouteResults.fast) window.__tts.push(_allRouteResults.fast.info.totalTime); } catch (e) {} }, 20); window.__iv = iv; });
    await search(x.page); assert.ok(await drawn(x.page));
    await x.page.clock.runFor(1500);
    const tts = await x.page.evaluate(() => window.__tts);
    assert.ok(tts.length > 0 && tts.every(v => v === 44), JSON.stringify(tts));
    assert.deepStrictEqual(HITS.slice(0, 2).map(h => h.kind), ['fast', 'full'], JSON.stringify(HITS));
    assert.ok(HITS.every(h => h.via === 'plugin'), '웹이 직접 요청함 ' + JSON.stringify(HITS));
  });
  await x.ctx.close();

  console.log('[켜짐: 재조회 — 엔진이 간격·나아짐을 정한다]');
  reset({ fast: fast(50, { liveMissing: 2, liveApplied: 0 }), full: fast(50, { liveMissing: 2, liveApplied: 0 }),
          retry: [{ tt: 48, liveStat: { liveMissing: 1, liveApplied: 1 }, retryMs: [3000, 5000] }, { tt: 47, liveStat: { liveMissing: 0, liveApplied: 3 } }] });
  x = await newApp(b, { rtf: true });
  await t('엔진이 준 간격(3초·5초)으로 once 를 부르고, 요청에 직전 값(pm/pa)을 싣고, 엔진이 나아졌다고 하면 다시 그린다', async () => {
    await search(x.page); assert.ok(await drawn(x.page));
    assert.strictEqual(await fastTT(x.page), 50);
    // 첫 응답 follow.retry 는 기본 12초 — 3초 만에는 아직 안 부른다
    await x.page.clock.runFor(3500);
    assert.strictEqual((await rfCalls(x.page, 'once')).length, 0, '엔진 간격(기본 12초)을 안 따르고 일찍 불렀다');
    assert.ok(await until(x.page, () => window.__rf.filter(c => c[0] === 'once' && !/^g/.test(c[1].id)).length >= 1, null, 80), '12초 뒤 재조회가 없다');
    const o1 = (await rfCalls(x.page, 'once'))[0][1];
    assert.ok(/pm=2&pa=0/.test(o1.url) && /baseMs=\d+/.test(o1.url), o1.url);
    assert.ok(await until(x.page, () => _allRouteResults.fast.info.totalTime === 48), '나아진 응답으로 다시 그려지지 않음');
    // 그 응답 follow.retry=[3000,5000]: 두 번째 간격은 5초
    assert.ok(await until(x.page, () => window.__rf.filter(c => c[0] === 'once' && !/^g/.test(c[1].id)).length >= 2, null, 80), '두 번째 재조회 없음');
    const o2 = (await rfCalls(x.page, 'once'))[1][1];
    assert.ok(/pm=1&pa=1/.test(o2.url), 'pm/pa 는 직전에 그린 값이어야 한다: ' + o2.url);
    assert.ok(await until(x.page, () => _allRouteResults.fast.info.totalTime === 47));
    assert.ok(HITS.every(h => h.via === 'plugin'));
  });
  await x.ctx.close();

  reset({ fast: fast(50, { liveMissing: 2, liveApplied: 0 }), full: fast(50, { liveMissing: 2, liveApplied: 0 }),
          retry: [{ tt: 40, liveStat: { liveMissing: 0, liveApplied: 9 }, forceBetter: false }] });
  x = await newApp(b, { rtf: true });
  await t('엔진이 better:false 라고 하면 숫자가 나아 보여도 다시 그리지 않는다(판단은 엔진)', async () => {
    await search(x.page); assert.ok(await drawn(x.page));
    assert.ok(await until(x.page, () => window.__rf.filter(c => c[0] === 'once' && !/^g/.test(c[1].id)).length >= 1, null, 80));
    await x.page.clock.runFor(1500); await x.page.waitForTimeout(100);
    assert.strictEqual(await fastTT(x.page), 50);
  });
  await x.ctx.close();

  console.log('[폴백 → 예전 방식]');
  for (const [mode, label, re] of [['reject', 'request 거절', /거절/], ['httpfail', '시간초과가 아닌 통신 실패', /통신 실패/]]) {
    reset({ fast: fast(50), full: fast(50) });
    x = await newApp(b, { rtf: true, plugin: mode });
    await t(label + ': 예전 방식으로 이어서 경로를 그리고, 카드에 사유 · 다시 켜면 재시도', async () => {
      await search(x.page); assert.ok(await drawn(x.page), '경로가 그려지지 않았다');
      assert.ok(HITS.length >= 1 && HITS.every(h => h.via === 'web'), JSON.stringify(HITS));
      const s = await sync(x.page); assert.ok(/예전 방식/.test(s.stat) && re.test(s.stat), JSON.stringify(s));
      assert.ok(await x.page.evaluate(() => _rtfBad()));
      await x.page.evaluate(() => _rtfSetUse(true)); assert.ok(!(await x.page.evaluate(() => _rtfBad())), '껐다 켜면 다시 시도');
    });
    await x.ctx.close();
  }
  reset({ fast: fast(50), full: fast(50), legacy: true });
  x = await newApp(b, { rtf: true });
  await t('옛 엔진(follow 없음): 예전 방식으로 이어서 그리고 스위치를 쓰지 않은 것처럼 동작', async () => {
    await search(x.page); assert.ok(await drawn(x.page));
    assert.ok(HITS.some(h => h.via === 'web'), JSON.stringify(HITS));
    assert.ok(await x.page.evaluate(() => _rtfBad()));
    const s = await sync(x.page); assert.ok(/후속 지시/.test(s.stat), s.stat);
  });
  await x.ctx.close();

  reset({ fast: fast(50), full: fast(50) });
  x = await newApp(b, { rtf: true, plugin: 'timeout' });
  await t('시간초과: 예전처럼 실패 안내(웹으로 다시 묻지 않는다) · 스위치는 그대로', async () => {
    await search(x.page);
    assert.ok(await until(x.page, () => { const e = document.getElementById('transitResultErr'); return !!e && e.dataset.fail === '1'; }, null, 60), '실패 안내가 없다');
    assert.strictEqual(HITS.length, 0, '웹이 다시 물었다');
    assert.ok(!(await x.page.evaluate(() => _rtfBad())));
    const d = await x.page.evaluate(() => window._routeFetchLog);
    assert.ok(d.length >= 1 && /타임아웃/.test(d[0].how), JSON.stringify(d));
  });
  await x.ctx.close();

  await b.close();
  console.log(`\n${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
})();
