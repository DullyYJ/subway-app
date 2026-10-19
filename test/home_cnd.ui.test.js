// 홈 후보 검색을 앱과 엔진이 하기(설정 스위치 gdm_cnd) ↔ 앱(JS) 연결 시험 — 2026-10-19 (5번 2단계)
//   가짜 ScreenNative · 가짜 HomeSearch 플러그인 + 가짜 엔진(POST /screen/home → engine/home.js 의 실제 출력)으로 확인한다:
//   · 꺼져 있으면(기본) 예전 그대로 — STNDB 로 걸러 u 를 보내고, 버스·카카오는 웹 함수가 부르고, HomeSearch 호출 없음
//   · 켜면: 요청에 지하철 후보(u)가 없고(엔진이 거른다) · 버스·장소는 HomeSearch.query 한 번(글자마다 아니라) · 웹 검색 호출 없음 · 'cands' 이벤트가 다음 요청의 b·p 가 된다
//   · 고르기: sg.u.N 은 응답의 info.pk 로, sg.b.N·sg.p.N 은 이벤트의 raw 로 — 예전 _fmapSetLocation 에 같은 값이 간다
//   · 폴백: 플러그인이 없음/query 거절/옛 엔진(info.sx 없음) → 예전 방식 · 한 종류만 실패하면 그 종류만 웹으로 · 옛 검색어의 늦은 응답은 무시
// 실행: node test/home_cnd.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const EH = require('../engine/home');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 900)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // opt: { cnd: 스위치 켬, hs: 'ok'|'reject'|'none'(플러그인 없음), engine: 'new'|'old' }
  async function fresh(opt) {
    opt = Object.assign({ cnd: false, hs: 'ok', engine: 'new' }, opt || {});
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const x = { ctx, page, errs, reqs: [], lastBody: '' };
    await page.route('**/*', async r => {
      const u = new URL(r.request().url()), req = r.request();
      if (u.protocol === 'file:') return r.continue();
      if (u.pathname === '/screen/home' && u.hostname.indexOf('route-v2') >= 0) {
        const body = JSON.parse(req.postData() || '{}'); x.reqs.push(body);
        let out;
        if (opt.engine === 'old') {                                              // 옛 엔진: 역을 거르지 못한다 → u 가 없으면 빈 후보, sx·pk 없음
          out = EH.homeScreen({ cap: Number(body.cap) || 0 }, body.f, Object.assign({ u: [] }, body.d)); if (out && out.info) { delete out.info.sx; delete out.info.pk; }
        } else out = EH.homeScreen({ cap: Number(body.cap) || 0 }, body.f, body.d);
        x.lastBody = JSON.stringify(out);
        return r.fulfill({ status: 200, contentType: 'application/json', body: x.lastBody });
      }
      return r.abort();
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try { localStorage.setItem('locDisc', '1'); localStorage.setItem('gdm_scrh_mig1', '1'); localStorage.setItem('gdm_scrh_on', '1'); if (o.cnd) localStorage.setItem('gdm_cnd', '1'); } catch (e) {}
      window.__sn = []; window.__snL = {}; window.__hs = []; window.__hsL = {}; window.__hsC = [];
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      window.__hsEmit = (d) => { (window.__hsL.cands || []).forEach(f => f(d)); };
      const put = (m) => (a) => { window.__sn.push({ m, a: JSON.parse(JSON.stringify(a)) }); return Promise.resolve({ items: 8 }); };
      const rec = (m) => (a) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(); };
      const plugins = { ScreenNative: {
        show: put('show'), update: put('update'), setRect: rec('setRect'), hide: rec('hide'), destroy: rec('destroy'), toast: rec('toast'), setField: rec('setField'),
        status: () => Promise.resolve({ visible: true, items: 10, age: 20, scroll: 0 }),
        addListener: (n, f) => { (window.__snL[n] = window.__snL[n] || []).push(f); return Promise.resolve({ remove() {} }); } } };
      if (o.hs !== 'none') plugins.HomeSearch = {
        query: (a) => { window.__hs.push(JSON.parse(JSON.stringify(a))); return o.hs === 'reject' ? Promise.reject(new Error('거절')) : Promise.resolve({ ok: true, gen: window.__hs.length }); },
        cancel: () => { window.__hsC.push(1); return Promise.resolve({ ok: true }); },
        status: () => Promise.resolve({ ok: true }),
        addListener: (n, f) => { (window.__hsL[n] = window.__hsL[n] || []).push(f); return Promise.resolve({ remove() {} }); } };
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: plugins };
    }, opt);
    await page.goto('file://' + html); await page.waitForTimeout(2200);
    await page.evaluate(() => { const ov = document.getElementById('locDiscOv'); if (ov) ov.remove(); });
    await page.evaluate(() => {
      window.__calls = []; window.__loc = [];
      window._busStopSearchByName = function (q, cb) { window.__calls.push(['bus', q]); setTimeout(() => cb([{ nodenm: q + '정류장', nodeid: 'W1', dist: 350, gpslati: '37.5', gpslong: '127.0' }]), 10); };
      window._kakaoLocal = function (p, qs) { window.__calls.push(['kakao', qs]); return Promise.resolve({ ok: true, json: () => Promise.resolve({ documents: [{ place_name: '웹 카페', road_address_name: '서울 어딘가', x: '127.1', y: '37.5' }] }) }); };
      const o = window._fmapSetLocation; window._fmapSetLocation = function (k, l) { window.__loc.push([k, l]); try { return o.apply(this, arguments); } catch (e) { } };
      window.fmapDoRoute = function () { }; window.openDtPicker = function () { }; window.fmapGpsLocate = function () { };
    });
    return x;
  }
  const calls = (x, m, id) => x.page.evaluate(([m, id]) => window.__sn.filter(c => (!m || c.m === m) && (!id || (c.a && c.a.id === id))), [m, id || null]);
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__snEmit(n, d), [n, d || {}]);
  const hsEmit = (x, d) => x.page.evaluate((d) => window.__hsEmit(d), d);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 15000)) { if (await fn()) return true; await x.page.waitForTimeout(60); } return false; };
  const puts = (x) => async () => (await calls(x, 'show', 'home')).length + (await calls(x, 'update', 'home')).length;
  const lastPut = async (x) => { const c = (await calls(x, null, 'home')).filter(c => c.m === 'show' || c.m === 'update'); return c[c.length - 1]; };
  const act = (x, d) => emit(x, 'action', Object.assign({ id: 'home' }, d));
  const wcalls = (x) => x.page.evaluate(() => window.__calls.slice());
  const hsCalls = (x) => x.page.evaluate(() => window.__hs.slice());
  const lastReq = x => x.reqs[x.reqs.length - 1];
  const type = async (x, k, v) => { await emit(x, 'text', { id: 'home', key: k, value: v, kind: 'focus' }); await emit(x, 'text', { id: 'home', key: k, value: v, kind: 'edit' }); };
  const sugRows = async (x) => { const c = await lastPut(x); return JSON.parse(c.a.json).body[0].kids.filter(k => k.t === 'sug' && k.act && /^sg\./.test(k.act.v)); };
  const ready = async (x) => assert.ok(await waitFor(x, async () => (await puts(x)()) >= 1), 'show 가 없다');

  console.log('[① 꺼져 있으면(기본) 예전 그대로]');
  let REF;
  await t('스위치 꺼짐: u 를 STNDB 로 걸러 보내고 · 버스·카카오는 웹이 · HomeSearch 호출 없음 · 카드는 보이고 꺼짐', async () => {
    const x = await fresh({ cnd: false }); await ready(x);
    await type(x, 'start', '강남');
    assert.ok(await waitFor(x, async () => { const q = lastReq(x); return q.f.active === 'start' && q.d.u && q.d.u.length > 0 && q.d.b && q.d.b.length > 0 && q.d.p && q.d.p.length > 0; }), '후보가 안 모였다 ' + JSON.stringify(lastReq(x).d));
    assert.strictEqual((await hsCalls(x)).length, 0, 'HomeSearch 를 부르면 안 된다');
    const w = await wcalls(x); assert.strictEqual(w.filter(c => c[0] === 'bus').length, 1); assert.strictEqual(w.filter(c => c[0] === 'kakao').length, 1);
    assert.strictEqual(await x.page.evaluate(() => window._scrHome.S.info.pk === undefined), true, '웹이 u 를 보냈으니 pk 가 없다');
    const c = await x.page.evaluate(() => ({ d: getComputedStyle(document.getElementById('cndSetCard')).display, on: document.getElementById('cndSetOn').checked, s: document.getElementById('cndSetStat').textContent }));
    assert.strictEqual(c.d, 'block'); assert.strictEqual(c.on, false); assert.ok(/꺼짐/.test(c.s), c.s);
    REF = (await sugRows(x)).filter(r => /^sg\.u\./.test(r.act.v)).map(r => [r.name, r.sub]);
    assert.ok(REF.length >= 2, '지하철 줄 ' + JSON.stringify(REF)); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  console.log('[② 켜면: 지하철은 엔진이 · 버스·장소는 앱 본체가]');
  const A = await fresh({ cnd: true });
  await ready(A);
  await t('글자를 쓰면: 요청에 u 가 없다 · HomeSearch.query 한 번 · 웹 검색 호출 없음', async () => {
    await type(A, 'start', '강남');
    assert.ok(await waitFor(A, async () => (await hsCalls(A)).length >= 1), 'query 가 없다');
    await type(A, 'start', '강남'); await A.page.waitForTimeout(500);
    const hs = await hsCalls(A); assert.strictEqual(hs.length, 1, 'query 는 같은 글자에 한 번 ' + JSON.stringify(hs)); assert.strictEqual(hs[0].q, '강남'); assert.ok(/^https:\/\//.test(hs[0].base), 'base ' + hs[0].base);
    const q = lastReq(A); assert.strictEqual(q.f.active, 'start'); assert.ok(!('u' in q.d), 'u 를 보내면 안 된다 ' + JSON.stringify(q.d));
    assert.strictEqual((await wcalls(A)).filter(c => c[0] === 'bus' || c[0] === 'kakao').length, 0, '웹 검색은 부르지 않는다');
  });
  await t('엔진이 거른 지하철 줄이 그려진다(예전 웹 방식과 같은 이름·호선) · info.pk', async () => {
    assert.ok(await waitFor(A, async () => (await sugRows(A)).some(r => /^sg\.u\./.test(r.act.v))), '지하철 줄이 없다');
    const rows = (await sugRows(A)).filter(r => /^sg\.u\./.test(r.act.v)).map(r => [r.name, r.sub]);
    assert.deepStrictEqual(rows, REF, '꺼짐일 때와 같은 지하철 줄');
    const pk = await A.page.evaluate(() => window._scrHome.S.info.pk); assert.ok(pk && pk.u.length === rows.length && pk.u[0].name === rows[0][0]);
  });
  await t("'cands' 이벤트(버스·장소)가 다음 요청의 b·p 가 되고 줄로 나온다", async () => {
    const raw = [{ nodenm: '앱정류장', nodeid: 'N7', citycode: 11, gpslati: 37.49, gpslong: 127.02, dist: 120 }], praw = [{ place_name: '앱 카페', road_address_name: '서울 강남대로 1', x: '127.02', y: '37.49' }];
    await hsEmit(A, { q: '강남', kind: 'b', ok: true, raw, disp: [{ n: '앱정류장', d: 120 }] });
    await hsEmit(A, { q: '강남', kind: 'p', ok: true, raw: praw, disp: [{ n: '앱 카페', a: '서울 강남대로 1' }] });
    assert.ok(await waitFor(A, async () => { const q = lastReq(A); return q.d.b && q.d.b.length === 1 && q.d.p && q.d.p.length === 1; }), '요청에 b·p 가 안 갔다 ' + JSON.stringify(lastReq(A).d));
    const q = lastReq(A); assert.deepStrictEqual(q.d.b, [{ n: '앱정류장', d: 120 }]); assert.deepStrictEqual(q.d.p, [{ n: '앱 카페', a: '서울 강남대로 1' }]); assert.ok(!('u' in q.d));
    assert.ok(await waitFor(A, async () => { const r = await sugRows(A); return r.some(x => x.name === '앱정류장') && r.some(x => x.name === '앱 카페'); }), '줄이 안 나왔다');
  });
  await t('옛 검색어의 늦은 응답은 무시한다', async () => {
    await type(A, 'start', '강남역'); await A.page.waitForTimeout(400);
    await hsEmit(A, { q: '강남', kind: 'b', ok: true, raw: [{ nodenm: '늦은정류장', nodeid: 'L1' }], disp: [{ n: '늦은정류장', d: 0 }] });
    await A.page.waitForTimeout(500);
    const q = lastReq(A); assert.ok(!(q.d.b || []).some(x => x.n === '늦은정류장'), '늦은 응답이 들어갔다 ' + JSON.stringify(q.d));
    assert.strictEqual((await hsCalls(A)).pop().q, '강남역');
  });
  await t('한 글자: 앱 본체 검색은 안 하고(2글자 미만) 지하철은 엔진이 거른다', async () => {
    const n0 = (await hsCalls(A)).length;
    await type(A, 'start', '신'); await A.page.waitForTimeout(500);
    assert.strictEqual((await hsCalls(A)).length, n0);
    assert.ok(await waitFor(A, async () => (await sugRows(A)).some(r => /^sg\.u\./.test(r.act.v))), '한 글자도 엔진이 거른다');
  });
  await A.ctx.close();

  console.log('[③ 고르기 — 예전 _fmapSetLocation 에 같은 값]');
  await t('sg.u.0: 응답의 info.pk 로 {type:subway,name,line,lat,lng} — 앱 STNDB 의 같은 역과 같다', async () => {
    const x = await fresh({ cnd: true }); await ready(x);
    await type(x, 'dest', '용두');
    assert.ok(await waitFor(x, async () => (await sugRows(x)).some(r => /^sg\.u\./.test(r.act.v))));
    const name = (await sugRows(x)).find(r => /^sg\.u\./.test(r.act.v)).name;
    await emit(x, 'text', { id: 'home', key: 'dest', value: '용두', kind: 'blur' });
    await act(x, { a: 'call', v: 'sg.u.0', fields: { start: '', dest: '용두' } });
    const loc = await x.page.evaluate(() => window.__loc); assert.strictEqual(loc.length, 1); assert.strictEqual(loc[0][0], 'dest');
    const st = await x.page.evaluate((nm) => { const s = STNDB.find(z => z.name === nm); return { line: s.line, lat: s.lat, lng: s.lng }; }, name);
    assert.deepStrictEqual(loc[0][1], { type: 'subway', name, line: st.line, lat: st.lat, lng: st.lng });
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('fmapDestInp').value), name);
    assert.ok(await waitFor(x, async () => lastReq(x).f.destSet === true && lastReq(x).f.active === ''), '도착이 정해진 상태가 안 갔다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('sg.b.0 · sg.p.0: 이벤트의 원본(raw)으로 정류장·장소 위치가 정해진다', async () => {
    const x = await fresh({ cnd: true }); await ready(x);
    await type(x, 'start', '강남'); assert.ok(await waitFor(x, async () => (await hsCalls(x)).length === 1));
    await hsEmit(x, { q: '강남', kind: 'b', ok: true, raw: [{ nodenm: '앱정류장', nodeid: 'N7', citycode: 11, gpslati: 37.49, gpslong: 127.02 }], disp: [{ n: '앱정류장', d: 0 }] });
    await hsEmit(x, { q: '강남', kind: 'p', ok: true, raw: [{ place_name: '앱 카페', x: '127.02', y: '37.49' }], disp: [{ n: '앱 카페', a: '' }] });
    assert.ok(await waitFor(x, async () => { const r = await sugRows(x); return r.some(z => z.act.v === 'sg.b.0') && r.some(z => z.act.v === 'sg.p.0'); }));
    await act(x, { a: 'call', v: 'sg.b.0', fields: { start: '강남', dest: '' } });
    let loc = await x.page.evaluate(() => window.__loc); assert.strictEqual(loc[0][1].type, 'bus'); assert.strictEqual(loc[0][1].name, '앱정류장'); assert.strictEqual(loc[0][1].nodeId, 'N7'); assert.ok(Math.abs(loc[0][1].lat - 37.49) < 1e-9 && Math.abs(loc[0][1].lng - 127.02) < 1e-9);
    await type(x, 'dest', '강남'); assert.ok(await waitFor(x, async () => (await hsCalls(x)).length === 2));
    await hsEmit(x, { q: '강남', kind: 'p', ok: true, raw: [{ place_name: '앱 카페', x: '127.02', y: '37.49' }], disp: [{ n: '앱 카페', a: '' }] });
    assert.ok(await waitFor(x, async () => (await sugRows(x)).some(z => z.act.v === 'sg.p.0')));
    await act(x, { a: 'call', v: 'sg.p.0', fields: { start: '앱정류장', dest: '강남' } });
    loc = await x.page.evaluate(() => window.__loc); assert.deepStrictEqual(loc[1][1], { type: 'address', name: '앱 카페', lat: 37.49, lng: 127.02 });
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  console.log('[④ 폴백]');
  await t('한 종류만 실패(ok:false) → 그 종류만 웹이 예전 방식으로 다시 찾는다', async () => {
    const x = await fresh({ cnd: true }); await ready(x);
    await type(x, 'start', '서울'); assert.ok(await waitFor(x, async () => (await hsCalls(x)).length === 1));
    await hsEmit(x, { q: '서울', kind: 'b', ok: false, why: 'HTTP 502' });
    assert.ok(await waitFor(x, async () => (await wcalls(x)).some(c => c[0] === 'bus' && c[1] === '서울')), '웹 버스 검색이 안 불렸다');
    assert.strictEqual((await wcalls(x)).filter(c => c[0] === 'kakao').length, 0, '장소는 아직 앱 본체 몫');
    assert.ok(await waitFor(x, async () => (lastReq(x).d.b || []).some(z => z.n === '서울정류장')), '웹 결과가 요청에 갔다');
    assert.strictEqual(await x.page.evaluate(() => window._cndBad()), false, '한 종류 실패로 전체를 끄지는 않는다');
    await hsEmit(x, { q: '서울', kind: 'p', ok: false, why: 'HTTP 404' });
    assert.ok(await waitFor(x, async () => (await wcalls(x)).some(c => c[0] === 'kakao')), '웹 장소 검색');
    await x.ctx.close();
  });
  await t('query 가 거절되면: 예전 방식으로 돌아간다(u 를 다시 보내고 웹이 버스·카카오) · 카드에 사유', async () => {
    const x = await fresh({ cnd: true, hs: 'reject' }); await ready(x);
    await type(x, 'start', '강남');
    assert.ok(await waitFor(x, async () => await x.page.evaluate(() => window._cndBad())), '꺼지지 않았다');
    assert.ok(await waitFor(x, async () => { const q = lastReq(x); return q.d.u && q.d.u.length > 0; }), 'u 를 다시 보내지 않았다 ' + JSON.stringify(lastReq(x).d));
    assert.ok(await waitFor(x, async () => (await wcalls(x)).some(c => c[0] === 'bus') && (await wcalls(x)).some(c => c[0] === 'kakao')), '웹이 대신 찾지 않았다');
    assert.ok(await waitFor(x, async () => (await sugRows(x)).some(r => /^sg\.u\./.test(r.act.v))), '지하철 줄');
    const s = await x.page.evaluate(() => document.getElementById('cndSetStat').textContent); assert.ok(/문제가 있어/.test(s), s);
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('cndSetOn').checked), false);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('옛 엔진(info.sx 없음)이면: 예전 방식으로 돌아가 지하철 줄이 나온다', async () => {
    const x = await fresh({ cnd: true, engine: 'old' }); await ready(x);
    await type(x, 'start', '강남');
    assert.ok(await waitFor(x, async () => await x.page.evaluate(() => window._cndBad())), '옛 엔진을 알아채지 못했다');
    assert.ok(await waitFor(x, async () => { const q = lastReq(x); return q.d.u && q.d.u.length > 0; }), 'u 를 다시 보내지 않았다');
    assert.ok(await waitFor(x, async () => (await sugRows(x)).some(r => /^sg\.u\./.test(r.act.v))), '지하철 줄이 안 나왔다');
    assert.ok(/엔진이 아직 역 검색을 못 해요/.test(await x.page.evaluate(() => localStorage.getItem('gdm_cnd_why'))));
    assert.ok(await waitFor(x, async () => (await wcalls(x)).some(c => c[0] === 'bus')), '웹이 버스를 다시 찾는다');
    await x.ctx.close();
  });
  await t('플러그인이 없으면(켜져 있어도): 예전 그대로 · 카드는 숨김', async () => {
    const x = await fresh({ cnd: true, hs: 'none' }); await ready(x);
    await type(x, 'start', '강남');
    assert.ok(await waitFor(x, async () => { const q = lastReq(x); return q.d.u && q.d.u.length > 0 && q.d.b && q.d.b.length > 0; }));
    assert.strictEqual(await x.page.evaluate(() => getComputedStyle(document.getElementById('cndSetCard')).display), 'none');
    assert.strictEqual(await x.page.evaluate(() => window._cndAvail()), false);
    await x.ctx.close();
  });

  console.log('[⑤ 설정 스위치]');
  await t('_cndSetUse: 켜고 끄면 저장값이 바뀌고 · 끄면 앱 본체 검색을 취소하고 · 예전 방식으로', async () => {
    const x = await fresh({ cnd: false }); await ready(x);
    await x.page.evaluate(() => _cndSetUse(true));
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_cnd')), '1');
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('cndSetOn').checked), true);
    assert.ok(/켜짐/.test(await x.page.evaluate(() => document.getElementById('cndSetStat').textContent)));
    await type(x, 'start', '강남'); assert.ok(await waitFor(x, async () => (await hsCalls(x)).length === 1));
    await x.page.evaluate(() => _cndSetUse(false));
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_cnd')), '0');
    assert.ok(await waitFor(x, async () => (await x.page.evaluate(() => window.__hsC.length)) >= 1), 'cancel 을 안 불렀다');
    await type(x, 'start', '강남'); assert.ok(await waitFor(x, async () => { const q = lastReq(x); return q.d.u && q.d.u.length > 0; }));
    assert.strictEqual((await hsCalls(x)).length, 1, '끈 뒤엔 query 가 늘지 않는다');
    await x.ctx.close();
  });
  await t('설정 탭 연결: 사실(feat.cnd)·스위치 키(f.cnd)가 웹 설정 접착에 있고, 설정 엔진에도 같은 키가 있다', async () => {
    const src = require('fs').readFileSync(html, 'utf8'), E = require('../engine/settings');
    assert.ok(src.indexOf("f.feat.cnd = { h: 1, on: (_cndOn() && !_cndBad()) ? 1 : 0, f: _cndBad() ? 1 : 0") > 0, 'feat.cnd 사실');
    assert.ok(src.indexOf("else if(key === 'f.cnd') window._cndSetUse(on);") > 0, '스위치 키');
    const d = E.SETTINGS_FEATS.find(z => z.k === 'cnd'); assert.ok(d && d.title && d.desc && d.off && d.bad && d.ok, '설정 엔진 항목');
    const x = await fresh({ cnd: true }); await ready(x);
    const card = await x.page.evaluate(() => ({ d: getComputedStyle(document.getElementById('cndSetCard')).display, on: window._cndOn() }));
    assert.strictEqual(card.d, 'block'); assert.strictEqual(card.on, true);
    await x.ctx.close();
  });

  await b.close();
  console.log(`\nhome_cnd: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
