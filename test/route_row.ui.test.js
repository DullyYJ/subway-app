// 경로 카드 맨 아래 줄: 탑승 → 환승 → 도착 칸 + 전환 연출 — 2026-10-16
//   (YJ: "경로 선택하면 탑승 버튼 — 왼쪽 두 버튼이 줄고 오른쪽에서 밀고 들어옴, 세 버튼 크기 같게 / 환승은 위에서 내려오며 탑승을 아래로 / 도착은 아래에서 올라오며 환승을 위로 /
//    모든 계산은 엔진이 그림은 앱이 · 애니메이션은 네이티브")
//   어떤 칸·어떤 전환인지는 진짜 엔진(engine/ride-eta.js op:'row')이 정한다 — 이 시험은 /ride-eta 요청을 엔진 함수로 바로 답한다.
// 실행: node test/route_row.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const { rideEta } = require('../engine/ride-eta');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 400)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh(opt) {
    opt = opt || {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    let engineDown = false; const reqs = [];
    await page.route('**/*', r => {
      const u = new URL(r.request().url());
      if (u.protocol === 'file:') return r.continue();
      if (/\/ride-eta$/.test(u.pathname)) {
        let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
        reqs.push(body);
        if (engineDown) return r.fulfill({ status: 500, body: '{}' });
        return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(rideEta(body)) });
      }
      return r.abort();
    });
    await page.addInitScript((native) => {
      try { localStorage.setItem('gdm_loc_disclosed', '1'); localStorage.setItem('gdm_bat_asked_at', '1'); localStorage.setItem('bgPermGuided', '1'); } catch (e) {}
      window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
      window.__plays = [];
      if (native) window.Capacitor.Plugins.RowNative = { play: (o) => { window.__plays.push(o); return Promise.resolve({ ok: true }); }, cancel: () => Promise.resolve() };
    }, !!opt.native);
    await page.goto('file://' + html); await page.waitForTimeout(600);
    await page.evaluate(() => {
      // 경로 카드를 띄우고 두 구간(지하철 → 버스) 경로를 둔다
      document.getElementById('transitResultBox').style.display = 'block'; const card = document.getElementById('transitResultCard'); card.style.display = 'block';
      window._metroRouteMode = false; window._htlBoarded = false; window._trackSig = 'T1';
      _transitNodeData = [{ name: '출발', isOrigin: true }, { name: 'A', isSub: true, lineName: '1호선', lat: 37.5, lng: 126.7, arrTime: '18:00' }, { name: 'B', isSub: true, lineName: '1호선', lat: 37.51, lng: 126.7, arrTime: '18:05' },
        { name: 'C', isBus: true, lineName: '6659', lat: 37.52, lng: 126.7, arrTime: '18:10' }, { name: 'D', isBus: true, lineName: '6659', lat: 37.53, lng: 126.7, arrTime: '18:20' }];
      window._lastHtlNodes = _transitNodeData;
    });
    return { ctx, page, errs, reqs, down: v => { engineDown = v; } };
  }
  const widths = (page) => page.evaluate(() => ['routeDetailBtn', 'mainConfirmRouteBtn', 'routeSlotBtn'].map(id => { const e = document.getElementById(id); return e.style.display === 'none' ? 0 : Math.round(e.getBoundingClientRect().width * 10) / 10; }));
  const sync = async (page, want) => { await page.evaluate(() => _rowSync(true)); await page.waitForFunction((w) => window._row && window._row.slot === w && !window._row.busy, want, { timeout: 4000 }); };
  const setDone = (page, d) => page.evaluate((d) => { const L = _rsLegs(); window._htlBoarded = !!d[0]; L.forEach((l, i) => { _rs.done[_rsKey(l)] = !!d[i]; }); }, d);

  await t('확정 전에는 오른쪽 칸이 없고 두 버튼은 같은 너비', async () => {
    const x = await fresh({ native: true });
    await sync(x.page, 'none'); const w = await widths(x.page);
    assert.strictEqual(w[2], 0); assert.ok(Math.abs(w[0] - w[1]) < 1.5, JSON.stringify(w));
    assert.strictEqual(await x.page.evaluate(() => window.__plays.length), 0, '연출 없음');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('경로를 확정하면 엔진이 정한 탑승 칸이 생기고 세 버튼 너비가 같다 · 네이티브가 push_in 으로 그린다(웹 버튼의 겉모양을 넘김)', async () => {
    const x = await fresh({ native: true });
    await x.page.evaluate(() => { window._routeLocked = true; });
    await sync(x.page, 'board');
    const w = await widths(x.page); assert.ok(w[0] > 0 && Math.abs(w[0] - w[1]) < 1.5 && Math.abs(w[1] - w[2]) < 1.5, '세 버튼 같은 너비 ' + JSON.stringify(w));
    const txt = await x.page.evaluate(() => document.getElementById('routeSlotBtn').textContent); assert.strictEqual(txt, '탑승');
    const pl = await x.page.evaluate(() => window.__plays); assert.strictEqual(pl.length, 1, JSON.stringify(pl));
    const p = pl[0]; assert.strictEqual(p.kind, 'push_in'); assert.ok(p.ms > 0 && p.ease.length === 4); assert.strictEqual(p.items.c.t, '탑승'); assert.ok(p.items.a.t.includes('세부경로') && p.items.b.t.length > 0);
    assert.ok(p.w > 100 && p.h > 20 && p.items.c.bg && p.items.c.fg && p.bg, JSON.stringify(p)); assert.strictEqual(p.items.o, undefined);
    assert.ok(x.reqs.some(r => r.op === 'row' && r.locked === true && r.prev === 'none' && r.legs.length === 2), '엔진에 증거만 보냈다 ' + JSON.stringify(x.reqs[x.reqs.length - 1]));
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('환승이 있으면 첫 구간 탑승 확정 뒤 환승 칸이 위에서 내려온다(slide_down, 옛 칸=탑승) · 마지막 구간 탑승 확정 뒤 도착이 아래에서 올라온다(slide_up, 옛 칸=환승)', async () => {
    const x = await fresh({ native: true });
    await x.page.evaluate(() => { window._routeLocked = true; }); await sync(x.page, 'board');
    await setDone(x.page, [true, false]); await sync(x.page, 'transfer');
    let pl = await x.page.evaluate(() => window.__plays); let p = pl[pl.length - 1];
    assert.strictEqual(p.kind, 'slide_down'); assert.strictEqual(p.items.c.t, '환승'); assert.strictEqual(p.items.o.t, '탑승');
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('routeSlotBtn').textContent), '환승');
    await setDone(x.page, [true, true]); await sync(x.page, 'arrive');
    pl = await x.page.evaluate(() => window.__plays); p = pl[pl.length - 1];
    assert.strictEqual(p.kind, 'slide_up'); assert.strictEqual(p.items.c.t, '도착'); assert.strictEqual(p.items.o.t, '환승');
    const w = await widths(x.page); assert.ok(Math.abs(w[0] - w[2]) < 1.5, JSON.stringify(w));
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('탑승 되돌림은 반대 방향(환승 → 탑승: slide_up) · 경로를 취소하면 push_out(왼쪽 두 버튼이 다시 늘어남)', async () => {
    const x = await fresh({ native: true });
    await x.page.evaluate(() => { window._routeLocked = true; }); await sync(x.page, 'board');
    await setDone(x.page, [true, false]); await sync(x.page, 'transfer');
    await setDone(x.page, [false, false]); await sync(x.page, 'board');
    let pl = await x.page.evaluate(() => window.__plays); assert.strictEqual(pl[pl.length - 1].kind, 'slide_up'); assert.strictEqual(pl[pl.length - 1].items.c.t, '탑승'); assert.strictEqual(pl[pl.length - 1].items.o.t, '환승');
    await x.page.evaluate(() => { window._routeLocked = false; }); await sync(x.page, 'none');
    pl = await x.page.evaluate(() => window.__plays); const q = pl[pl.length - 1];
    assert.strictEqual(q.kind, 'push_out'); assert.strictEqual(q.items.c.t, '탑승', '사라지는 칸의 겉모양을 넘긴다');
    assert.strictEqual((await widths(x.page))[2], 0); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('같은 칸이 계속되면(전환 없음) 연출도 요청도 다시 하지 않는다', async () => {
    const x = await fresh({ native: true });
    await x.page.evaluate(() => { window._routeLocked = true; }); await sync(x.page, 'board');
    const n0 = x.reqs.length; await x.page.waitForTimeout(2500);
    assert.strictEqual(x.reqs.length, n0, '증거가 같으면 엔진에 다시 묻지 않는다'); assert.strictEqual(await x.page.evaluate(() => window.__plays.length), 1);
    await x.page.evaluate(() => _rowSync(true)); await x.page.waitForTimeout(400); assert.strictEqual(await x.page.evaluate(() => window.__plays.length), 1, 'prev === slot → kind none');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('네이티브가 없으면 웹이 같은 수식으로 그린다(덮개가 줄 위에 뜨고 끝나면 사라짐)', async () => {
    const x = await fresh({ native: false });
    await x.page.evaluate(() => { window._routeLocked = true; });
    await x.page.evaluate(() => _rowSync(true)); await x.page.waitForFunction(() => window._row.slot === 'board', null, { timeout: 4000 });
    const mid = await x.page.evaluate(() => { const o = document.getElementById('routeActAnim'); return o ? o.children.length : -1; });
    assert.ok(mid >= 3, '연출 덮개 ' + mid);
    await x.page.waitForFunction(() => !document.getElementById('routeActAnim'), null, { timeout: 3000 });
    assert.strictEqual((await x.page.evaluate(() => window._rowLast)).native, false);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('_rowFrame(웹)은 RowCore(네이티브)와 같은 값 — 세 칸 같은 너비·간격 · 새 칸이 밀고 들어옴 · 위/아래 밀기', async () => {
    const x = await fresh({ native: false });
    const r = await x.page.evaluate(() => { const W = 358, H = 44, g = 8, w3 = (W - 2 * g) / 3, f1 = _rowFrame('push_in', 1, W, H, g), f0 = _rowFrame('push_in', 0, W, H, g), fm = _rowFrame('push_in', .5, W, H, g), d = _rowFrame('slide_down', .5, W, H, g), u = _rowFrame('slide_up', .5, W, H, g);
      return { w: [f1.a[3], f1.b[3], f1.c[3]].map(v => Math.round(v * 100) / 100), w3: Math.round(w3 * 100) / 100, end: Math.round((f1.c[1] + f1.c[3]) * 100) / 100, startC: f0.c[1], push: Math.abs(fm.c[1] - (fm.b[1] + fm.b[3] + g)) < 0.01, dd: d.o[2] - d.c[2], uu: u.c[2] - u.o[2] }; });
    assert.deepStrictEqual(r.w, [r.w3, r.w3, r.w3]); assert.strictEqual(r.end, 358); assert.ok(r.startC >= 358); assert.ok(r.push); assert.strictEqual(r.dd, 44); assert.strictEqual(r.uu, 44);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('경로 카드가 숨어 있으면 연출 없이 최종 모양만(스크롤·화면 이동으로 접힘)', async () => {
    const x = await fresh({ native: true });
    await x.page.evaluate(() => { window._routeLocked = true; document.getElementById('transitResultCard').style.display = 'none'; });
    await x.page.evaluate(() => _rowSync(true)); await x.page.waitForTimeout(500);
    assert.strictEqual(await x.page.evaluate(() => window.__plays.length), 0); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('엔진 응답이 없으면 마지막 모양을 유지하고 오류가 없다(앱이 칸을 지어내지 않는다)', async () => {
    const x = await fresh({ native: true }); x.down(true);
    await x.page.evaluate(() => { window._routeLocked = true; _rowSync(true); }); await x.page.waitForTimeout(600);
    assert.strictEqual(await x.page.evaluate(() => _row.slot), 'none'); assert.strictEqual((await widths(x.page))[2], 0);
    x.down(false); await x.page.evaluate(() => { _row.fails = 0; _row.at = 0; _rowSync(true); }); await x.page.waitForFunction(() => window._row.slot === 'board', null, { timeout: 4000 });
    assert.deepStrictEqual(x.errs.filter(e => !/Failed to fetch/.test(e)), []); await x.ctx.close();
  });
  await t('칸을 누르면: 탑승 = 탑승 시트와 같은 확정(_rsPress, 엔진이 가리킨 구간) · 도착 = 안내 종료', async () => {
    const x = await fresh({ native: true });
    await x.page.evaluate(() => { window._routeLocked = true; }); await sync(x.page, 'board');
    const r = await x.page.evaluate(() => { window.__press = []; window.__end = []; const orig = window._rsPress; _rsPress = function(){ window.__press.push(_rs.leg && _rs.leg.k); }; window._arrEndFinish = function(w){ window.__end.push(w); }; document.getElementById('routeSlotBtn').click(); return { press: window.__press.slice() }; });
    assert.deepStrictEqual(r.press, [0], JSON.stringify(r));
    await setDone(x.page, [true, false]); await sync(x.page, 'transfer');
    // 환승: 앞 구간을 내리기 전에는 누르지 못한다(탑승 시트와 같은 규칙)
    const r2 = await x.page.evaluate(() => { window.__press = []; window._gpsMaxIdx = 1; window._timeMaxIdx = -1; _rsAlightGps = function(){ return null; }; document.getElementById('routeSlotBtn').click(); return window.__press.slice(); });
    assert.deepStrictEqual(r2, [], '앞 구간 하차 전');
    const r3 = await x.page.evaluate(() => { window.__press = []; window._gpsMaxIdx = 2; document.getElementById('routeSlotBtn').click(); return window.__press.slice(); });
    assert.deepStrictEqual(r3, [1], '하차 뒤엔 두 번째 구간 확정');
    await setDone(x.page, [true, true]); await sync(x.page, 'arrive');
    const r4 = await x.page.evaluate(() => { document.getElementById('routeSlotBtn').click(); return window.__end.slice(); });
    assert.deepStrictEqual(r4, ['도착 버튼']); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('JS 오류가 없다', async () => { const x = await fresh({ native: true }); await x.page.waitForTimeout(500); assert.deepStrictEqual(x.errs, []); await x.ctx.close(); });
  await b.close();
  console.log(`\n${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
})();
