// 서버 구동 네이티브 구간 타임라인(rhead part k) ↔ 웹 타임라인 일치 시험 — 2026-10-20 (s74)
//   원칙: "계산은 엔진이, 그림은 앱이". 웹이 DOM 으로 그린 타임라인(예전 계산)과, 앱이 보낸 원자료로 엔진이 내려준 칸(cell)이 칸마다 같은지 확인한다:
//   · 이름 · 배지 글 · 시각 글 · 왼쪽/오른쪽 선 색 · 점 종류와 색 · 칸 폭  — 지하철/버스/도보/환승/장거리/급행 환승/파스텔 테마/좌표 폴백
//   · 플러그인이 없거나 꺼져 있거나 엔진이 시각을 못 주면 웹 그대로 · 켜면 #transitHtlWrap 을 덮고 size 이벤트로 높이를 따른다
// 실행: node test/screen_rhead_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const ER = require('../engine/rhead');
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
      if (u.pathname === '/screen/rhead' && u.hostname.indexOf('route-v2') >= 0) {
        assert.strictEqual(req.method(), 'POST'); assert.ok(/text\/plain/.test(req.headers()['content-type'] || ''), '사전 요청이 필요한 형식으로 보냈다');
        const body = JSON.parse(req.postData() || '{}'); x.reqs.push(body);
        if (x.serve === 'down') return r.abort();
        const out = JSON.stringify(ER.rheadScreen({ cap: Number(body.cap) || 0, part: body.part }, body.f));
        return r.fulfill({ status: JSON.parse(out).ok ? 200 : 400, contentType: 'application/json', body: out });
      }
      return r.abort();
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try { localStorage.setItem('locDisc', '1'); if (o.on) { localStorage.setItem('gdm_scrr_on', '1'); localStorage.setItem('gdm_scrr2_on', '1'); } } catch (e) {}
      window.__sn = []; window.__snL = {};
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const put = (m) => (a) => { window.__sn.push({ m, a: JSON.parse(JSON.stringify(a)) }); if (a.json != null) { try { const j = JSON.parse(a.json); if (j.v !== 1 || !Array.isArray(j.body)) throw 0; } catch (e) { return Promise.reject(new Error('invalid: 규격')); } } return Promise.resolve(); };
        const rec = (m) => (a) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { ScreenNative: {
          show: put('show'), update: put('update'), setRect: rec('setRect'), hide: rec('hide'), destroy: rec('destroy'), toast: rec('toast'), setField: rec('setField'),
          status: () => Promise.resolve(o.oldApk ? { visible: true, items: 4, age: 20, scroll: 0, cap: 9 } : { visible: true, items: 11, age: 20, scroll: 0, cap: o.cap10 ? 10 : 11 }),
          addListener: (n, f) => { (window.__snL[n] = window.__snL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.goto('file://' + html); await page.waitForTimeout(2200);
    await page.addStyleTag({ content: '#locDiscOv{display:none !important}' });
    await page.evaluate(() => { const ov = document.getElementById('locDiscOv'); if (ov) ov.remove(); });
    await page.evaluate(() => {
      window.__called = [];
      window._openFavPopup = function () { window.__called.push('fav'); };
      const sel = window.selectRouteOption; window.selectRouteOption = function (t) { window.__called.push('tab:' + t); };
      window.closeTransitResult = function () { window.__called.push('close'); const c = document.getElementById('transitResultCard'); if (c) c.style.display = 'none'; };
    });
    return x;
  }
  const calls = (x, m) => x.page.evaluate((m) => window.__sn.filter(c => !m || c.m === m), m || null);
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__snEmit(n, d), [n, d || {}]);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await x.page.waitForTimeout(60); } return false; };
  const puts = async (x, id) => (await calls(x)).filter(c => (c.m === 'show' || c.m === 'update') && c.a.id === id);
  const lastJ = async (x, id) => { const p = await puts(x, id); return p.length ? p[p.length - 1].a.json : ''; };
  const act = (x, id, d) => emit(x, 'action', Object.assign({ id }, d));
  const nodes = (j) => { const o = []; (function f(a) { a.forEach(n => { o.push(n); if (n.kids) f(n.kids); }); })(JSON.parse(j).body); return o; };

  const own = (x, id) => x.page.evaluate((id) => document.getElementById(id).classList.contains('rh-own'), id);
  const cardOpenFx = (x) => x.page.evaluate(() => {
    const stn = (n, i) => ({ stationName: n, x: 126.7 + i * 0.01, y: 37.4 + i * 0.01 });
    const p = { info: { totalTime: 54, transferCount: 0, pathType: 1, tab: 'fast' }, subPath: [
      { trafficType: 3, sectionTime: 3, startSec: 0, endSec: 180, lane: [{ name: '도보' }], startName: '내 위치', endName: '부평' },
      { trafficType: 1, sectionTime: 49, startSec: 180, endSec: 3120, lane: [{ name: '1호선' }], startName: '부평', endName: '두정', passStopList: { stations: [stn('부평', 0), stn('신도림', 1), stn('두정', 2)] } },
      { trafficType: 3, sectionTime: 2, startSec: 3120, endSec: 3240, lane: [{ name: '도보' }], startName: '두정', endName: '도착지' }] };
    const rt = _convertSinglePathToRoute(p);
    switchTab('home', document.getElementById('ni-home'));
    _renderTransitResultCard({ routes: [rt] }, { name: '부평역', lat: 37.49, lng: 126.72 }, { name: '두정역', lat: 36.83, lng: 127.14 }, 'engine');
    document.getElementById('transitResultCard').style.display = 'flex';
    return !!document.getElementById('transitHtlWrap');
  });
  const S = (ty, nm, du, di, ss, es, st, extra) => Object.assign({ transportation: { type: ty, name: nm }, duration: du, distance: di, startSec: ss, endSec: es, passStopList: { stationList: (st || []).map((n, i) => (typeof n === 'string' ? { stationName: n, lat: 37.4 + i * 0.01, lon: 126.7 + i * 0.012 } : n)) } }, extra || {});
  const FX = {
    mixed: { secs: [S(3, '', 180, 200, 0, 180, []), S(2, '6', 900, 5000, 240, 840, ['아라역4번출구', '중간정류장', '부평역'], { arriveSec: 180, waitEstimated: true }), S(3, '', 240, 300, 840, 1080, []),
      S(1, '수도권 1호선', 1200, 9000, 1080, 2280, ['부평', '부개', '송내', '두정'], { stopSec: [1080, 1200, 1500, 2280], ttWaitMs: 120000 }), S(3, '', 120, 150, 2280, 2400, [])], xf: [{ kind: 'x', xferSecIdx: 2 }] },
    longd: { secs: [S(3, '', 120, 100, 0, 120, []), S(1, '1호선', 600, 6000, 120, 720, ['가산디지털단지', '독산', '광명'], { stopSec: [120, 400, 720] }),
      S(4, 'KTX', 11100, 400000, 900, 12000, ['광명', '부산']), S(3, '', 300, 400, 12000, 12300, []), S(2, '1003', 600, 3000, 12420, 13020, ['부산역', '초량', '범일'])], xf: [] },
    chg: { secs: [S(2, '8', 300, 1500, 60, 360, ['정류장A', '부평역'], { arriveSec: 30 }), S(1, '수도권 1호선', 1500, 14000, 400, 1900, ['부평', '신도림', '가산디지털단지', '구로', '노량진', '용산'], { stopSec: [400, 700, 1000, 1200, 1500, 1900], trainChanges: [{ at: '가산디지털단지역', to: 'express' }, { at: '용산', to: 'local' }] }),
      S(2, '9', 400, 1600, 1950, 2350, ['용산역앞', '삼각지', '이태원']), S(2, '110', 300, 1200, 2400, 2700, ['이태원', '한남', '옥수'])], xf: [{ kind: 'train' }, { kind: 'x', secIdx: 2 }] },
    geo: { secs: [S(3, '', 60, 50, 0, 60, []), S(2, '88', 1200, 7000, 120, 1320, ['가', '나', '다', '라', '마'], { waitSec: 90 }),
      S(2, '99-1', 600, 3000, null, null, ['마', '바', '사']), S(1, '2호선', 900, 8000, 1500, 2400, ['사당', '낙성대', '서울대입구'])], xf: [] },
    notimes: { secs: [S(3, '', 60, 50, null, null, []), S(2, '88', 1200, 7000, null, null, ['가', '나', '다']), S(3, '', 60, 50, null, null, [])], xf: [] }
  };
  const hexOf = (c) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || ''); if (!m) return ''; return '#' + [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join(''); };
  // 웹이 그린 타임라인 → 칸마다 읽는다
  const webCells = (x) => x.page.evaluate(() => {
    const rgb = (c) => { const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || ''); return m ? '#' + [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('') : ''; };
    return Array.from(document.getElementById('transitHtlTrack').children).map(nd => {
      const rows = nd.children, ax = rows[2];
      const o = { w: parseFloat(nd.style.width), n: rows[0].textContent.trim(), g: rows[1].textContent.trim(), t: rows[3].textContent.trim(), lc: '', rc: '', dk: '', dc: '' };
      Array.from(ax.children).forEach(e => {
        const st = e.getAttribute('style') || '';
        if (/width:50%/.test(st) && /left:0/.test(st)) o.lc = rgb(getComputedStyle(e).backgroundColor);
        else if (/width:50%/.test(st) && /left:50%/.test(st)) o.rc = rgb(getComputedStyle(e).backgroundColor);
        else if (/width:14px/.test(st) && /border-radius:50%/.test(st) && /z-index:3/.test(st)) { o.dk = 'e'; o.dc = rgb(getComputedStyle(e).backgroundColor); }
        else if (/width:12px/.test(st) && /z-index:3/.test(st)) { o.dk = 'r'; o.dc = rgb(getComputedStyle(e).borderTopColor); }
        else if (/width:6px/.test(st) && /gradient/.test(st)) { o.dk = 'm'; }
      });
      return o;
    });
  });
  const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  async function parity(label, fxName, o) {
    await t('웹 타임라인과 칸마다 같다 — ' + label, async () => {
      const x = await fresh({ plugin: true, on: true }); assert.ok(await cardOpenFx(x));
      await x.page.evaluate((th) => { if (th) document.documentElement.setAttribute('data-theme', th); }, (o && o.theme) || null);
      await x.page.waitForTimeout(500);
      const nReq = x.reqs.filter(q => q.part === 'k').length;
      await x.page.evaluate(([fx, withX]) => {
        window._routeBaseMs = Date.now() - 1000;
        _renderHtlTrack(fx.secs, { name: '출발' }, { name: '도착' }, 0, fx.xf);
        document.getElementById('transitHtlWrap').scrollIntoView({ block: 'center' });
      }, [FX[fxName], true]);
      assert.ok(await waitFor(x, async () => x.reqs.filter(q => q.part === 'k').length > nReq, 9000), 'part k 요청이 없다');
      const req = x.reqs.filter(q => q.part === 'k').pop();
      assert.strictEqual(req.cap, 11);
      const eng = ER.rheadTrackScreen(req.f); assert.ok(eng.ok, JSON.stringify(eng));
      const cells = eng.head[0].cells, web = await webCells(x);
      assert.strictEqual(cells.length, web.length, '칸 수 ' + cells.length + ' vs ' + web.length + ' ' + JSON.stringify(web.map(w => w.n)));
      cells.forEach((c, i) => {
        const w = web[i], at = ' (칸 ' + i + ' ' + c.n + ')';
        assert.strictEqual(c.w, w.w, '폭' + at);
        assert.strictEqual(norm(c.n), w.n, '이름' + at);
        assert.strictEqual(norm(c.g || ''), norm(w.g), '배지' + at);
        assert.strictEqual(norm(c.t), w.t, '시각' + at + ' ' + c.t + ' / ' + w.t);
        assert.strictEqual(c.lc, w.lc, '왼쪽 선' + at); assert.strictEqual(c.rc, w.rc, '오른쪽 선' + at);
        assert.strictEqual(c.dk, w.dk, '점 종류' + at);
        if (c.dk === 'e' || c.dk === 'r') assert.strictEqual(c.dc, w.dc, '점 색' + at);
      });
      // 앱에 내려간 것도 같은 칸이다
      assert.ok(await waitFor(x, async () => (await puts(x, 'rtrk')).length >= 1, 6000), 'rtrk show 가 없다');
      const j = JSON.parse(await lastJ(x, 'rtrk')); assert.strictEqual(j.head[0].t, 'trk'); assert.strictEqual(j.head[0].cells.length, cells.length);
      assert.deepStrictEqual(x.errs, []); await x.ctx.close();
    });
  }

  console.log('[① 플러그인이 없거나 꺼져 있거나 옛 APK 면 예전 그대로]');
  await t('플러그인이 없으면(웹): 요청 없음 · 웹 타임라인이 그대로', async () => {
    const x = await fresh({ plugin: false, on: true }); await cardOpenFx(x); await x.page.waitForTimeout(800);
    await x.page.evaluate((fx) => { window._routeBaseMs = Date.now() - 1000; _renderHtlTrack(fx.secs, { name: 'a' }, { name: 'b' }, 0, fx.xf); }, FX.mixed); await x.page.waitForTimeout(800);
    assert.strictEqual(x.reqs.length, 0); assert.strictEqual(await own(x, 'transitHtlWrap'), false); assert.ok((await webCells(x)).length >= 8); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('꺼져 있으면(기본) 호출·요청 없음', async () => {
    const x = await fresh({ plugin: true, on: false }); await cardOpenFx(x);
    await x.page.evaluate((fx) => { window._routeBaseMs = Date.now() - 1000; _renderHtlTrack(fx.secs, { name: 'a' }, { name: 'b' }, 0, fx.xf); }, FX.mixed); await x.page.waitForTimeout(1200);
    assert.strictEqual((await calls(x)).length, 0); assert.strictEqual(x.reqs.length, 0); await x.ctx.close();
  });
  await t('s71 APK(규격 10 — 머리줄은 알지만 trk 는 모름)면 타임라인 요청이 없고 웹 그대로 · 다른 줄은 그대로 그린다', async () => {
    const x = await fresh({ plugin: true, on: true, cap10: true }); await cardOpenFx(x);
    await x.page.evaluate((fx) => { window._routeBaseMs = Date.now() - 1000; _renderHtlTrack(fx.secs, { name: 'a' }, { name: 'b' }, 0, fx.xf); document.getElementById('transitHtlWrap').scrollIntoView({ block: 'center' }); }, FX.mixed);
    assert.ok(await waitFor(x, async () => x.reqs.filter(q => q.part === 'h').length >= 1, 9000), '머리줄은 요청해야 한다'); await x.page.waitForTimeout(1200);
    assert.strictEqual(x.reqs.filter(q => q.part === 'k').length, 0); assert.strictEqual(await own(x, 'transitHtlWrap'), false); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('옛 APK(cap 10 미만)면 켜져 있어도 요청 없음', async () => {
    const x = await fresh({ plugin: true, on: true, oldApk: true }); await cardOpenFx(x);
    await x.page.evaluate((fx) => { window._routeBaseMs = Date.now() - 1000; _renderHtlTrack(fx.secs, { name: 'a' }, { name: 'b' }, 0, fx.xf); }, FX.mixed); await x.page.waitForTimeout(1500);
    assert.strictEqual(x.reqs.filter(q => q.part === 'k').length, 0); assert.strictEqual(await own(x, 'transitHtlWrap'), false); await x.ctx.close();
  });

  console.log('[② 웹 타임라인과 엔진 칸이 같다]');
  await parity('도보·버스(예상)·환승 도보·지하철(대기)', 'mixed');
  await parity('장거리 열차 출발/도착 · 총 소요', 'longd');
  await parity('급행 환승 · 버스끼리 환승 · 중복 역 제거', 'chg');
  await parity('좌표 거리 비례(역별 시각 없음) · 일부 구간 시각 없음', 'geo');
  await parity('파스텔 테마(원색 노선 색 · 다른 점 색)', 'mixed', { theme: 'pastel' });
  await parity('파스텔 테마 · 장거리', 'longd', { theme: 'pastel' });

  console.log('[③ 켜면 덮고 높이를 따른다 · 폴백]');
  await t('구간 시각이 하나도 없으면 엔진이 거절 → 웹 그대로(가리지 않는다)', async () => {
    const x = await fresh({ plugin: true, on: true }); await cardOpenFx(x);
    await x.page.evaluate(() => document.getElementById('transitHtlWrap').scrollIntoView({ block: 'center' }));
    assert.ok(await waitFor(x, async () => (await puts(x, 'rtrk')).length >= 1, 9000), '먼저 정상 경로는 그려진다'); const p0 = (await puts(x, 'rtrk')).length;
    const n0 = x.reqs.filter(q => q.part === 'k').length;
    await x.page.evaluate((fx) => { window._routeBaseMs = Date.now() - 1000; _renderHtlTrack(fx.secs, { name: 'a' }, { name: 'b' }, 0, fx.xf); document.getElementById('transitHtlWrap').scrollIntoView({ block: 'center' }); }, FX.notimes);
    assert.ok(await waitFor(x, async () => x.reqs.filter(q => q.part === 'k').length > n0, 8000)); await x.page.waitForTimeout(1500);
    assert.strictEqual(await own(x, 'transitHtlWrap'), false, '낡은 화면이 웹 타임라인을 가린 채다');
    assert.strictEqual((await puts(x, 'rtrk')).length, p0, '거절된 경로를 새로 그리면 안 된다');
    assert.ok((await calls(x, 'hide')).some(c => c.a && c.a.id === 'rtrk'), '낡은 네이티브 화면을 숨겨야 한다');
    const n1 = x.reqs.filter(q => q.part === 'k').length; await x.page.waitForTimeout(1500);
    assert.strictEqual(x.reqs.filter(q => q.part === 'k').length, n1, '같은 거절 요청을 계속 다시 묻지 않는다'); await x.ctx.close();
  });
  await t("켜면: #transitHtlWrap 을 덮고(속을 가린다) 'size' 이벤트로 높이를 따른다 · 끄면 걷는다", async () => {
    const x = await fresh({ plugin: true, on: true }); await cardOpenFx(x);
    await x.page.evaluate((fx) => { window._routeBaseMs = Date.now() - 1000; _renderHtlTrack(fx.secs, { name: 'a' }, { name: 'b' }, 0, fx.xf); document.getElementById('transitHtlWrap').scrollIntoView({ block: 'center' }); }, FX.mixed);
    assert.ok(await waitFor(x, async () => (await puts(x, 'rtrk')).length >= 1, 9000), 'rtrk show 가 없다');
    assert.ok(await waitFor(x, async () => await own(x, 'transitHtlWrap'), 6000), '웹 타임라인 속을 안 가렸다');
    await emit(x, 'size', { id: 'rtrk', h: 105 }); await x.page.waitForTimeout(150);
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('transitHtlWrap').offsetHeight), 105);
    const rc = (await calls(x, 'setRect')).concat(await calls(x, 'show')).filter(c => c.a && c.a.id === 'rtrk'); assert.ok(rc.length >= 1);
    // 예전 그림 영역(tl)은 비킨다
    assert.strictEqual(await x.page.evaluate(() => window._htlNat && window._htlNat.H ? !!window._htlNat.H.shown : false), false);
    await x.page.evaluate(() => window._scrrSetUse(false)); await x.page.waitForTimeout(250);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scrr5_on')), '0'); assert.strictEqual(await own(x, 'transitHtlWrap'), false);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('엔진이 죽으면 웹 타임라인 그대로', async () => {
    const x = await fresh({ plugin: true, on: true, serve: 'down' }); await cardOpenFx(x);
    await x.page.evaluate((fx) => { window._routeBaseMs = Date.now() - 1000; _renderHtlTrack(fx.secs, { name: 'a' }, { name: 'b' }, 0, fx.xf); document.getElementById('transitHtlWrap').scrollIntoView({ block: 'center' }); }, FX.mixed);
    assert.ok(await waitFor(x, async () => x.reqs.filter(q => q.part === 'k').length >= 1, 8000)); await x.page.waitForTimeout(1200);
    assert.strictEqual(await own(x, 'transitHtlWrap'), false); await x.ctx.close();
  });
  await t('요청은 원자료뿐: 노선 색·시각 글·배지 글이 없다 (cap 11 · part k · 시각은 ms)', async () => {
    const x = await fresh({ plugin: true, on: true }); await cardOpenFx(x);
    await x.page.evaluate((fx) => { window._routeBaseMs = Date.now() - 1000; _renderHtlTrack(fx.secs, { name: 'a' }, { name: 'b' }, 0, fx.xf); document.getElementById('transitHtlWrap').scrollIntoView({ block: 'center' }); }, FX.mixed);
    assert.ok(await waitFor(x, async () => x.reqs.some(q => q.part === 'k' && q.f.secs.length === 5), 8000));
    const q = x.reqs.filter(q => q.part === 'k' && q.f.secs.length === 5).pop(), txt = JSON.stringify(q);
    assert.strictEqual(q.cap, 11); assert.ok(Array.isArray(q.f.secs) && q.f.secs.length === 5 && typeof q.f.now === 'number' && q.f.tz === 540 && (q.f.th === 'dark' || q.f.th === 'pastel'), txt.slice(-260));
    assert.ok(!/#[0-9a-fA-F]{6}/.test(txt), '색이 요청에 들어 있다'); assert.ok(!/\d\d:\d\d/.test(txt), '시각 글이 요청에 들어 있다');
    assert.ok(txt.length < 38000); await x.ctx.close();
  });

  await b.close();
  console.log(fail ? ('FAIL ' + fail + ' / ' + (pass + fail)) : ('ALL OK ' + pass)); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
