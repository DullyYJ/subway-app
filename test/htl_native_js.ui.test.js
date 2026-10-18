// 네이티브 홈 경로 타임라인(P1) ↔ 앱(JS) 연결 시험 — 2026-10-17
//   원칙: "계산은 엔진이, 그림은 앱이". 가짜 HtlNative 플러그인으로 확인한다:
//   · 플러그인이 없거나 설정이 꺼져 있으면(기본) 예전 그대로 — 플러그인 호출이 하나도 없다
//   · 켜면: 웹이 그린 칸(DOM)을 그대로 읽어 넘기고(이름·시각·점/선 색), 칸 사각형·스크롤·마커 이동만 알려 준다
//   · 칸이 움직이는 동안·팝업이 덮는 동안은 네이티브를 숨기고(웹 타임라인이 이어받는다) 멈추면 다시 켠다
//   · 오류·show 거절이면 웹만 쓴다 · 연속 실패면 다음부터 안 쓴다 · 설정 스위치로 끄고 켠다
// 실행: node test/htl_native_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 600)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // opt: { plugin, on, showFail, fails }
  async function fresh(opt) {
    opt = opt || {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try { localStorage.setItem('locDisc', '1'); if (o.on) localStorage.setItem('gdm_htl_on', '1'); if (o.fails) localStorage.setItem('gdm_htl_fail', String(o.fails)); } catch (e) {}
      window.__hn = []; window.__hnL = {};
      window.__hnEmit = (n, d) => { (window.__hnL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const rec = (m, a, ret) => { window.__hn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(ret); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { HtlNative: {
          show: (a) => { window.__hn.push({ m: 'show', a: JSON.parse(JSON.stringify(a)) }); return o.showFail ? Promise.reject(new Error('뷰를 못 만듦')) : Promise.resolve({ cells: (a.cells || []).length }); },
          setRect: (a) => rec('setRect', a), update: (a) => rec('update', a, { cells: (a.cells || []).length }), scroll: (a) => rec('scroll', a), marker: (a) => rec('marker', a),
          hide: (a) => rec('hide', a), destroy: (a) => rec('destroy', a),
          status: () => Promise.resolve(window.__status ? window.__status() : { visible: true, cells: 99, age: 20 }),
          addListener: (n, f) => { (window.__hnL[n] = window.__hnL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.goto('file://' + html); await page.waitForTimeout(2200);
    await page.addStyleTag({ content: '#locDiscOv{display:none !important}' });
    await page.evaluate(() => {
      const ov = document.getElementById('locDiscOv'); if (ov) ov.remove();
      // 타임라인을 눈에 보이는 시험용 상자로 옮긴다(실제 화면에서는 홈 경로 카드 안에 있다)
      const wrap = document.getElementById('transitHtlWrap');
      const box = document.createElement('div'); box.id = 'hbox'; box.style.cssText = 'position:fixed;left:0;top:200px;width:390px;z-index:5;background:#fff;';
      document.body.appendChild(box); const hd = document.getElementById('transitResultHeader'); box.appendChild(hd.parentElement); const tabs = document.getElementById('routeOptionTabs'); tabs.style.display = 'flex'; tabs.style.margin = '0 14px 10px'; box.appendChild(tabs); box.appendChild(wrap); wrap.style.display = 'block'; hd.parentElement.style.cssText = 'display:flex;align-items:center;gap:8px;margin:6px 14px 8px;'; window._openFavPopup = () => { window.__fav = (window.__fav || 0) + 1; }; window.selectRouteOption = (k) => { window.__tab = k; };
      hd.style.cssText = 'display:flex;align-items:baseline;gap:5px;overflow:hidden;width:200px;flex:none;';
      window.__setHd = (min, s, d) => { hd.innerHTML = '<span id="transitResultMinNum" style="font-size:28px;font-weight:900;color:var(--text);line-height:1;">' + min + '</span><span id="transitResultMinUnit" style="font-size:14px;color:var(--sub);margin-right:8px;">분</span><span style="font-size:12px;color:var(--sub);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;">' + s + ' → ' + d + '</span>'; };
      window.__setHd(30, '출발', '도착');
      const st = (n, i) => ({ stationName: n, lat: 37.58 + i * 0.002, lon: 126.7 + i * 0.002 });
      const secs = [
        { transportation: { type: 3 }, duration: 120, distance: 150 },
        { transportation: { type: 2, name: '931' }, duration: 600, startSec: 120, endSec: 720, passStopList: { stationList: [st('이음대로.대성베르힐', 0), st('이음대로.호반써밋', 1), st('인천외국어마을', 2), st('아라역4번출구', 3), st('아라동주민센터', 4)] } },
        { transportation: { type: 3 }, duration: 180, distance: 200 },
        { transportation: { type: 1, name: '인천2호선' }, duration: 900, startSec: 900, endSec: 1800, passStopList: { stationList: [st('아라', 6), st('검단오류', 7), st('왕길', 8)] } },
        { transportation: { type: 3 }, duration: 240, distance: 300 },
      ];
      window.__secs = secs;
      _renderHtlTrack(secs, { name: '출발', lat: 37.579, lng: 126.699 }, { name: '도착', lat: 37.6, lng: 126.73 }, 30);
      window._routeLocked = true; window._metroRouteMode = false;
    });
    return { ctx, page, errs };
  }
  const calls = (x, m, id) => x.page.evaluate(([m, id]) => window.__hn.filter(c => (!m || c.m === m) && (id === '*' || !c.a || !c.a.id || c.a.id === (id || 'tl'))), [m, id || 'tl']);      // 기본은 타임라인('tl') 영역 호출만
  const clear = (x) => x.page.evaluate(() => { window.__hn.length = 0; });
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__hnEmit(n, d), [n, d || {}]);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 9000)) { if (await fn()) return true; await x.page.waitForTimeout(80); } return false; };
  const has = (x, m, id) => async () => (await calls(x, m, id)).length > 0;
  const wrapBox = (x) => x.page.evaluate(() => { const w = document.getElementById('transitHtlWrap'), tr = document.getElementById('transitHtlTrack'), r = w.getBoundingClientRect(), tb = tr.getBoundingClientRect(); return { x: r.left + w.clientLeft, y: tb.top, w: w.clientWidth, h: tr.offsetHeight, sw: tr.scrollWidth }; });
  const lastCall = async (x, m, id) => { const c = await calls(x, m, id); return c[c.length - 1]; };

  console.log('[① 플러그인이 없거나 꺼져 있으면 예전 그대로]');
  await t('플러그인이 없으면(웹): 아무 일도 없다 · 설정 카드도 안 보인다', async () => {
    const x = await fresh({ plugin: false, on: true }); await x.page.waitForTimeout(1500);
    const card = await x.page.evaluate(() => getComputedStyle(document.getElementById('htlSetCard')).display);
    assert.strictEqual(card, 'none'); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('플러그인이 있어도 설정이 꺼져 있으면(기본) 호출이 하나도 없다 · 카드는 보이고 스위치는 꺼짐', async () => {
    const x = await fresh({ plugin: true, on: false }); await x.page.waitForTimeout(1800);
    assert.strictEqual((await calls(x, '', '*')).length, 0, JSON.stringify(await calls(x, '', '*')));
    const c = await x.page.evaluate(() => ({ d: getComputedStyle(document.getElementById('htlSetCard')).display, on: document.getElementById('htlSetOn').checked, s: document.getElementById('htlSetStat').textContent }));
    assert.strictEqual(c.d, 'block'); assert.strictEqual(c.on, false); assert.ok(/꺼짐/.test(c.s), c.s);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  console.log('[② 켜면: 웹이 그린 칸을 그대로 읽어 넘긴다]');
  const A = await fresh({ plugin: true, on: true });
  await t('가만히 있으면 show 한 번: 사각형(웹 칸과 같음) · 칸 목록 · 트랙 폭 · 테마', async () => {
    assert.ok(await waitFor(A, has(A, 'show')), '켜지지 않았다'); await emit(A, 'ready');      // 진짜 기기는 첫 그림 뒤 ready 를 보낸다
    const s = (await lastCall(A, 'show')).a, bx = await wrapBox(A);
    assert.ok(Math.abs(s.x - bx.x) < 1 && Math.abs(s.y - bx.y) < 1 && Math.abs(s.w - bx.w) < 1 && Math.abs(s.h - bx.h) < 1, JSON.stringify([s.x, s.y, s.w, s.h, bx]));
    assert.ok(s.dpr === 2, 'dpr'); assert.ok(s.clip && s.clip.r > 100, JSON.stringify(s.clip));
    assert.ok(Math.abs(s.tw - bx.sw) < 1, s.tw + '/' + bx.sw); assert.strictEqual(s.sx, 0);
    assert.ok(/^rgba\(/.test(s.theme.bg) && /^#[0-9a-f]{6}$/.test(s.theme.fg), JSON.stringify(s.theme));
  });
  await t('칸 이름·시각·노선 라벨이 DOM 과 같고, 칸 자리(x·폭)가 DOM 과 같다', async () => {
    const s = (await lastCall(A, 'show')).a;
    const dom = await A.page.evaluate(() => Array.from(document.getElementById('transitHtlTrack').children).filter(c => c.children.length === 4).map(c => ({ n: c.children[0].textContent.trim(), t: c.children[3].textContent.trim(), g: c.children[1].textContent.trim(), x: c.offsetLeft, w: c.offsetWidth })));
    assert.strictEqual(s.cells.length, dom.length, s.cells.length + '/' + dom.length);
    dom.forEach((d, i) => { const c = s.cells[i]; assert.strictEqual(c.n, d.n); assert.strictEqual(c.t, d.t); assert.strictEqual(c.g, d.g, i + '번 노선 라벨'); assert.strictEqual(c.x, d.x); assert.strictEqual(c.w, d.w); });
    assert.ok(s.cells.some(c => /931/.test(c.g)), '버스 번호 라벨');
  });
  await t('점·선·글자 색이 rgba 로 오고 점 모양이 맞다(끝점=꽉 찬 14, 중간역=속 빈 12, 도보 가운데=6)', async () => {
    const s = (await lastCall(A, 'show')).a, cs = s.cells;
    assert.strictEqual(cs[0].dk, 2); assert.ok(!cs[0].lc && /^rgba\(/.test(cs[0].rc), JSON.stringify(cs[0]));
    assert.strictEqual(cs[cs.length - 1].dk, 2); assert.ok(/^rgba\(/.test(cs[cs.length - 1].lc) && !cs[cs.length - 1].rc, JSON.stringify(cs[cs.length - 1]));
    const mid = cs.find(c => c.dk === 1); assert.ok(mid && /^rgba\(/.test(mid.dc) && /^rgba\(/.test(mid.lc) && /^rgba\(/.test(mid.rc) && /^rgba\(/.test(mid.nc) && /^rgba\(/.test(mid.tc), JSON.stringify(mid));
    assert.ok(cs.some(c => c.dk === 3), '도보 점'); assert.ok(cs.every(c => c.nf > 5 && c.tf > 5), '글자 크기');
    assert.ok(cs.some(c => c.gp && /^rgba\(/.test(c.gc)), '환승/장거리 배지');
  });
  await t('네이티브가 첫 그림을 그린 뒤(ready)부터 웹 타임라인은 visibility:hidden 으로 가린다 — 레이아웃(칸 위치·폭)은 그대로', async () => {
    assert.ok(await waitFor(A, async () => await A.page.evaluate(() => document.getElementById('transitHtlWrap').classList.contains('htl-nat-on'))), '웹 타임라인을 안 가렸다');
    const o = await A.page.evaluate(() => { const tr = document.getElementById('transitHtlTrack'); return { vis: getComputedStyle(tr).visibility, w: tr.offsetWidth, h: tr.offsetHeight, c: tr.children[1].offsetLeft }; });
    assert.strictEqual(o.vis, 'hidden'); assert.ok(o.w > 300 && o.h > 90 && o.c > 0, JSON.stringify(o));
  });
  console.log('[③ 마커]');
  await t('웹이 마커를 처음 놓으면: 네이티브도 그 자리에 바로 놓는다(snap) — 트랙 좌표 · 점 가운데 y', async () => {
    await clear(A);
    await A.page.evaluate(() => { window._gpsMarkerNeedsSnap = true; _placeGpsMarkerSmooth(_transitNodeData[1], _transitNodeData[1], 0); });
    assert.ok(await waitFor(A, has(A, 'marker')), '마커 호출 없음');
    const dom = await A.page.evaluate(() => { const d = document.getElementById('htl-gps-marker-dot'); return { l: parseFloat(d.style.left), t: parseFloat(d.style.top) }; });
    const m = (await lastCall(A, 'marker')).a;
    assert.strictEqual(m.on, true); assert.ok(Math.abs(m.x - dom.l) < 1.5 && Math.abs(m.y - (dom.t + 7)) < 1.5, JSON.stringify([m, dom]));
  });
  await t('이어 움직이면: 목표 · 걸리는 시간(ms) · snap=false 를 그대로 넘긴다', async () => {
    await clear(A);
    await A.page.evaluate(() => { window._markerMaxProg = null; window._markerMaxX = null; window._markerTransMsOverride = 4000; _placeGpsMarkerSmooth(_transitNodeData[2], _transitNodeData[2], 0); });
    assert.ok(await waitFor(A, has(A, 'marker')), '마커 호출 없음');
    const dom = await A.page.evaluate(() => { const d = document.getElementById('htl-gps-marker-dot'); return { l: parseFloat(d.style.left) }; });
    const m = (await calls(A, 'marker')).map(c => c.a).filter(a => a.x != null).pop();
    assert.ok(m.snap === false && m.ms === 4000 && Math.abs(m.x - dom.l) < 1.5, JSON.stringify([m, dom]));
  });
  await t('승차 대기(주황)와 뱃지가 켜지면: 위치 없이 wait·badge 만 넘긴다', async () => {
    await clear(A);
    await A.page.evaluate(() => { _htlWaitBadge(true, '3분 뒤 승차'); });
    assert.ok(await waitFor(A, async () => (await calls(A, 'marker')).some(c => c.a.wait === true)), '대기 표시 없음');
    const m = (await calls(A, 'marker')).map(c => c.a).filter(a => a.wait === true).pop();
    assert.ok(m.on === true && m.x === undefined && m.badge === '3분 뒤 승차', JSON.stringify(m));
    await A.page.evaluate(() => { _htlWaitBadge(false); });
    assert.ok(await waitFor(A, async () => (await calls(A, 'marker')).some(c => c.a.wait === false && c.a.x === undefined)), '대기 해제 없음');
  });

  console.log('[④ 가로 스크롤은 따라가고, 세로로 움직이거나 덮이면 숨긴다]');
  await t('가로로 넘기면: scroll({sx}) 로 따라간다(숨기지 않는다)', async () => {
    await clear(A);
    await A.page.evaluate(() => { document.getElementById('transitHtlWrap').scrollLeft = 120; });
    assert.ok(await waitFor(A, has(A, 'scroll')), 'scroll 호출 없음');
    const s = (await lastCall(A, 'scroll')).a; assert.ok(Math.abs(s.sx - 120) < 1.5, JSON.stringify(s));
    assert.strictEqual((await calls(A, 'hide')).length, 0, '가로 스크롤에 숨으면 안 된다');
  });
  await t('칸이 세로로 움직이면(페이지 스크롤·화면 전환) 숨기고, 멈추면 새 자리로 다시 켠다', async () => {
    await clear(A);
    const y0 = (await wrapBox(A)).y;
    await A.page.evaluate(() => { document.getElementById('hbox').style.top = '260px'; });
    assert.ok(await waitFor(A, has(A, 'hide')), '움직이는데 안 숨었다');
    assert.ok(await waitFor(A, has(A, 'show')), '멈췄는데 안 켜졌다');
    const s = (await lastCall(A, 'show')).a, bx = await wrapBox(A);
    assert.ok(Math.abs(s.y - bx.y) < 1 && Math.abs(bx.y - (y0 + 60)) < 2, JSON.stringify([s.y, bx, y0]));
    assert.ok(Math.abs(s.sx - 120) < 1.5, '스크롤 위치도 이어서 ' + s.sx);
    assert.ok(Math.abs(s.x - bx.x) < 1);
  });
  await t('네이티브가 숨으면 웹 타임라인이 먼저 돌아온다(빈 화면이 없게) — hide 호출 시점에 이미 가림이 풀려 있다', async () => {
    await A.page.evaluate(() => { window.__webAtHide = null; const P = window.Capacitor.Plugins.HtlNative, h = P.hide; P.hide = () => { window.__webAtHide = document.getElementById('transitHtlWrap').classList.contains('htl-nat-on'); return h(); }; });
    await clear(A);
    await A.page.evaluate(() => { document.getElementById('hbox').style.top = '270px'; });
    assert.ok(await waitFor(A, has(A, 'hide')), '안 숨었다');
    assert.strictEqual(await A.page.evaluate(() => window.__webAtHide), false, 'hide 때 웹이 아직 가려져 있다');
    assert.ok(await waitFor(A, has(A, 'show')), '다시 안 켜졌다');
    assert.ok(await waitFor(A, async () => await A.page.evaluate(() => document.getElementById('transitHtlWrap').classList.contains('htl-nat-on'))), '다시 켜졌는데 웹을 안 가렸다');
  });
  await t('웹 팝업이 덮으면 숨고, 걷히면 다시 켠다', async () => {
    await clear(A);
    await A.page.evaluate(() => { const o = document.createElement('div'); o.id = 'testPop'; o.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.5)'; document.body.appendChild(o); });
    assert.ok(await waitFor(A, has(A, 'hide')), '덮였는데 안 숨었다');
    await clear(A);
    await A.page.waitForTimeout(700);
    assert.strictEqual((await calls(A, 'show')).length, 0, '덮여 있는 동안엔 켜면 안 된다');
    await A.page.evaluate(() => document.getElementById('testPop').remove());
    assert.ok(await waitFor(A, has(A, 'show')), '걷혔는데 안 켜졌다');
  });
  await t('다시 켤 때 마커도 웹 점이 있는 자리에 바로 놓는다', async () => {
    const c = await calls(A, 'marker');
    assert.ok(c.length && c[0].a.on === true && c[0].a.snap === true, JSON.stringify(c.slice(0, 2)));
  });

  console.log('[⑤ 경로가 바뀌면 칸을 다시 보낸다]');
  await t('타임라인을 다시 그리면(칸 달라짐) update 로 새 칸 목록을 보낸다', async () => {
    await clear(A);
    await A.page.evaluate(() => { const s = window.__secs.slice(0, 3); _renderHtlTrack(s, { name: '출발', lat: 37.579, lng: 126.699 }, { name: '도착', lat: 37.6, lng: 126.73 }, 20); });
    assert.ok(await waitFor(A, async () => (await calls(A)).some(c => (c.m === 'update' || c.m === 'show') && c.a.cells && c.a.cells.length < 8)), '새 칸을 안 보냈다');
    const dom = await A.page.evaluate(() => Array.from(document.getElementById('transitHtlTrack').children).filter(c => c.children.length === 4).length);
    const c = (await calls(A)).filter(c => (c.m === 'update' || c.m === 'show') && c.a.cells).pop(); assert.strictEqual(c.a.cells.length, dom);
  });
  await t('테마가 바뀌면(파스텔→다크) 색이 바뀐 칸을 다시 보낸다', async () => {
    await clear(A);
    await A.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const okT = await waitFor(A, async () => (await calls(A)).some(c => (c.m === 'update' || c.m === 'show') && c.a.theme));
    assert.ok(okT, '테마 변화를 안 보냈다');
  });
  await A.ctx.close();

  console.log('[⑤-2 그림 영역 — 머리줄 행(hd)·경로 옵션 탭(tb): 웹이 배치한 상자·글자를 그대로 넘기고, 눌림은 웹이 받는다]');
  const boxOf = (x, sel) => x.page.evaluate((sel) => { const h = document.querySelector(sel), r = h.getBoundingClientRect(); return { x: r.left + h.clientLeft, y: r.top + h.clientTop, w: h.clientWidth, h: h.clientHeight }; }, sel);
  const HDSEL = '#transitResultHeader';
  const hdRowBox = (x) => x.page.evaluate(() => { const h = document.getElementById('transitResultHeader').parentElement, r = h.getBoundingClientRect(); return { x: r.left + h.clientLeft, y: r.top + h.clientTop, w: h.clientWidth, h: h.clientHeight }; });
  const centerOf = (x, sel) => x.page.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  await t('머리줄 행(id hd)이 별도 뷰로 켜진다: 사각형이 웹 행과 같고, 글자(분 숫자·"분"·구간명·즐겨찾기·×)와 상자(즐겨찾기 테두리)가 자리·크기·색과 함께 온다', async () => {
    const B = await fresh({ plugin: true, on: true }); await waitFor(B, has(B, 'show', 'hd'));
    const s = (await lastCall(B, 'show', 'hd')).a, bx = await hdRowBox(B);
    assert.ok(Math.abs(s.x - bx.x) < 1 && Math.abs(s.y - bx.y) < 1 && Math.abs(s.w - bx.w) < 1 && Math.abs(s.h - bx.h) < 1, JSON.stringify([s.x, s.y, s.w, s.h, bx]));
    assert.ok(s.runs && !s.cells, JSON.stringify(s.runs));
    const tx = s.runs.filter(r => r.k !== 'r'), bxs = s.runs.filter(r => r.k === 'r');
    assert.deepStrictEqual(tx.map(r => r.t), ['30', '분', '출발 → 도착', '⭐ 즐겨찾기', '×']);
    const [a, b, c] = tx;
    assert.ok(a.s === 28 && a.b === true && /^rgba\(/.test(a.c), JSON.stringify(a)); assert.ok(b.s === 14 && b.b === false, JSON.stringify(b)); assert.ok(c.s === 12);
    assert.ok(b.x > a.x + 10 && c.x > b.x + 10 && a.x >= 0 && a.x < 4, JSON.stringify(tx.map(r => r.x)));
    assert.ok(c.w > 20 && c.x + c.w <= bx.w + 1, '구간명은 보이는 폭 안 ' + JSON.stringify(c));
    const fav = bxs.find(r => r.sc); assert.ok(fav && fav.sw === 1 && fav.r >= 10 && /^rgba\(/.test(fav.sc) && fav.w > 40 && fav.h > 10, JSON.stringify(bxs));
    assert.ok(s.runs.indexOf(fav) < s.runs.indexOf(tx[3]), '상자가 자기 글자보다 먼저(아래에) 온다 — DOM 순서');
    assert.ok(/^rgba\(/.test(s.theme.bg), JSON.stringify(s.theme));
    assert.strictEqual((await lastCall(B, 'show', 'tl')).a.id, 'tl', '타임라인 영역도 따로 켜진다');
    await B.ctx.close();
  });
  await t('머리줄: 네이티브가 그리는 동안 웹은 투명(opacity 0)으로 제자리에 남고, 즐겨찾기 버튼은 그대로 눌린다 · 숫자가 바뀌면 update', async () => {
    const B = await fresh({ plugin: true, on: true }); await waitFor(B, has(B, 'show', 'hd')); await emit(B, 'ready', { id: 'hd' });
    assert.ok(await waitFor(B, async () => await B.page.evaluate(() => document.getElementById('transitResultHeader').parentElement.classList.contains('htl-nat-op'))), '웹 행을 안 가렸다');
    const o = await B.page.evaluate(() => { const h = document.getElementById('transitResultHeader').parentElement; return { op: getComputedStyle(h).opacity, w: h.clientWidth, n: h.firstElementChild.offsetWidth }; });
    assert.strictEqual(o.op, '0'); assert.ok(o.w > 100 && o.n > 10, JSON.stringify(o));
    const c = await centerOf(B, '#favToggleBtn2'); await B.page.mouse.click(c.x, c.y);
    assert.strictEqual(await B.page.evaluate(() => window.__fav), 1, '투명이어도 즐겨찾기 버튼이 눌려야 한다');
    await clear(B); await B.page.evaluate(() => { document.getElementById('transitResultMinNum').textContent = '31'; });
    assert.ok(await waitFor(B, async () => (await calls(B, 'update', 'hd')).some(c => c.a.runs && c.a.runs[0].t === '31')), '바뀐 숫자를 안 보냈다');
    await B.ctx.close();
  });
  await t('글자가 여러 줄로 접히면 줄별로 읽는다 — 줄마다 자리(y)가 다르고 이어 붙이면 원문 그대로(이모지 포함)', async () => {
    const B = await fresh({ plugin: true, on: true }); await waitFor(B, has(B, 'show', 'hd'));
    const r = await B.page.evaluate(() => {
      const h = document.getElementById('transitResultHeader'); h.style.width = '120px'; h.style.display = 'block'; h.lastChild.style.cssText = 'white-space:normal;display:inline;font-size:12px;';
      const src = '아주아주아주아주 긴 출발지 이름 🚇 → 아주아주아주아주 긴 도착지 이름'; h.lastChild.textContent = src;
      const it = window._htlNat.paintOf(h.parentElement); const tx = it.filter(x => !x.k && x.s === 12);
      return { src, lines: tx.map(x => ({ t: x.t, y: Math.round(x.y), x: Math.round(x.x) })) };
    });
    assert.ok(r.lines.length >= 3, JSON.stringify(r.lines));
    assert.ok(new Set(r.lines.map(l => l.y)).size === r.lines.length, '줄마다 y 가 다르다 ' + JSON.stringify(r.lines));
    assert.strictEqual(r.lines.map(l => l.t).join('').replace(/\s/g, ''), r.src.replace(/\s/g, ''), '이어 붙이면 원문');
    await B.ctx.close();
  });
  await t('그릴 수 없는 것(그라데이션 배경·그림·::before 내용)이 있으면 그 영역은 웹이 그린다', async () => {
    const B = await fresh({ plugin: true, on: true }); await waitFor(B, has(B, 'show', 'hd'));
    const r = await B.page.evaluate(() => {
      const h = document.getElementById('transitResultHeader').parentElement, out = {};
      const fav = document.getElementById('favToggleBtn2'), old = fav.style.cssText;
      fav.style.backgroundImage = 'linear-gradient(red, blue)'; out.grad = window._htlNat.paintOf(h); fav.style.cssText = old;
      const im = document.createElement('img'); im.width = 4; im.height = 4; h.appendChild(im); out.img = window._htlNat.paintOf(h); im.remove();
      out.ok = !!window._htlNat.paintOf(h); return out;
    });
    assert.strictEqual(r.grad, null, '그라데이션'); assert.strictEqual(r.img, null, '그림'); assert.strictEqual(r.ok, true, '원래대로면 읽힌다');
    await B.ctx.close();
  });
  await t('경로 옵션 탭(id tb): 버튼 상자(채움·테두리·둥근 모서리)와 글자가 오고, 선택한 탭의 색이 바뀌면 update, 탭은 투명이어도 그대로 눌린다', async () => {
    const B = await fresh({ plugin: true, on: true }); await waitFor(B, has(B, 'show', 'tb')); await emit(B, 'ready', { id: 'tb' });
    const s = (await lastCall(B, 'show', 'tb')).a, bx = await boxOf(B, '#routeOptionTabs');
    assert.ok(Math.abs(s.x - bx.x) < 1 && Math.abs(s.y - bx.y) < 1 && Math.abs(s.w - bx.w) < 1, JSON.stringify([s.x, s.y, s.w, bx]));
    const bxs = s.runs.filter(r => r.k === 'r'), tx = s.runs.filter(r => r.k !== 'r');
    assert.strictEqual(bxs.length, 4, '보이는 탭 4개(장거리 탭은 숨김) ' + JSON.stringify(bxs.map(b => b.w)));
    assert.ok(bxs.every(b => b.r >= 8 && b.sw >= 1 && /^rgba\(/.test(b.f) && /^rgba\(/.test(b.sc)), JSON.stringify(bxs[0]));
    assert.deepStrictEqual(tx.map(r => r.t), ['⚡ 최단시간', '🔀 최소환승', '🚇 지하철', '🚌 버스']);
    assert.ok(tx.every((r, i) => r.x >= bxs[i].x && r.x + 1 < bxs[i].x + bxs[i].w), '글자는 자기 버튼 안');
    assert.ok(await waitFor(B, async () => await B.page.evaluate(() => document.getElementById('routeOptionTabs').classList.contains('htl-nat-op'))), '웹 탭을 안 가렸다');
    const c = await centerOf(B, '#routeTabLess'); await B.page.mouse.click(c.x, c.y);
    assert.strictEqual(await B.page.evaluate(() => window.__tab), 'less', '투명이어도 탭이 눌려야 한다');
    await clear(B);
    await B.page.evaluate(() => { const a = document.getElementById('routeTabFast'), l = document.getElementById('routeTabLess'); a.style.background = 'var(--card2)'; a.style.color = 'var(--sub)'; l.style.background = 'var(--gold)'; l.style.color = '#fff'; });
    assert.ok(await waitFor(B, async () => (await calls(B, 'update', 'tb')).length > 0), '선택이 바뀌었는데 안 보냈다');
    const u = (await lastCall(B, 'update', 'tb')).a; assert.notStrictEqual(JSON.stringify(u.runs), JSON.stringify(s.runs));
    await B.ctx.close();
  });
  await t('안내 문구 줄(공식 안내 등): 호스트 자신의 배경·테두리·안쪽 여백까지 테두리 상자로 덮고, 여러 줄 글자를 줄별로 보낸다 · 내용이 바뀌면 update', async () => {
    const B = await fresh({ plugin: true, on: true });
    await B.page.evaluate(() => { const r = document.getElementById('transitOfficialRow'); document.getElementById('hbox').appendChild(r); r.style.display = 'block'; r.style.margin = '0 14px 8px'; r.innerHTML = '공식 안내: <b>인천2호선</b>은 현재 정상 운행 중이에요. 평소보다 5분 일찍 출발하면 환승이 여유로워요.'; });
    await waitFor(B, has(B, 'show', 'r:transitOfficialRow'));
    const s = (await lastCall(B, 'show', 'r:transitOfficialRow')).a, bx = await B.page.evaluate(() => { const r = document.getElementById('transitOfficialRow').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    assert.ok(Math.abs(s.x - bx.x) < 1 && Math.abs(s.y - bx.y) < 1 && Math.abs(s.w - bx.w) < 1 && Math.abs(s.h - bx.h) < 1, '테두리 상자와 같다 ' + JSON.stringify([s.x, s.y, s.w, s.h, bx]));
    const host = s.runs[0]; assert.ok(host.k === 'r' && host.x === 0 && host.y === 0 && Math.abs(host.w - bx.w) < 1 && host.sw >= 1 && host.r >= 8 && /^rgba\(/.test(host.f), JSON.stringify(host));
    const tx = s.runs.filter(r => !r.k); assert.ok(tx.length >= 3, '여러 줄 ' + JSON.stringify(tx.map(t => t.t)));
    assert.ok(tx.some(t => t.b === true && /인천2호선/.test(t.t)), '굵은 글씨');
    assert.ok(tx.every(t => t.x >= 8), '안쪽 여백(padding)을 지킨다');
    await clear(B); await B.page.evaluate(() => { document.getElementById('transitOfficialRow').innerHTML = '짧은 안내'; });
    assert.ok(await waitFor(B, async () => (await calls(B, '', 'r:transitOfficialRow')).some(c => c.a && c.a.runs && c.a.runs.some(r => r.t === '짧은 안내'))), '바뀐 내용을 안 보냈다');
    await B.ctx.close();
  });
  await t('환승 안내 줄(transitXferRow): 엔진이 준 환승 문장을 줄별로 그대로 넘기고(앱은 읽기만), 내용이 바뀌면 update', async () => {
    const B = await fresh({ plugin: true, on: true });
    await B.page.evaluate(() => { const r = document.getElementById('transitXferRow'); document.getElementById('hbox').appendChild(r); r.style.margin = '0 14px 8px';
      _renderXferRow({ transfers: [{ kind: 'line', at: '구로', boardAt: '구로', fromType: 1, fromLine: '1호선', toType: 1, toLine: '천안급행', walkMin: 1 }] }); });
    await waitFor(B, has(B, 'show', 'r:transitXferRow'));
    const s = (await lastCall(B, 'show', 'r:transitXferRow')).a, tx = s.runs.filter(r => !r.k).map(r => r.t).join('');
    assert.ok(s.runs[0].k === 'r', '배경 상자'); assert.ok(/환승1번/.test(tx.replace(/\s/g, '')) && /구로/.test(tx) && /천안급행/.test(tx), tx);
    await clear(B); await B.page.evaluate(() => { _renderXferRow({ transfers: [{ kind: 'walk', at: '아라', boardAt: '아라역', toType: 2, toLine: '931', walkMin: 5 }] }); });
    assert.ok(await waitFor(B, async () => (await calls(B, '', 'r:transitXferRow')).some(c => c.a && c.a.runs && c.a.runs.some(r => /931/.test(r.t || '')))), '바뀐 환승 문장을 안 보냈다');
    await B.ctx.close();
  });
  await t('혼잡도 카드(2026-10-18): 상단 글자·게이지·칸별 칸·제목이 영역으로 그려지고(웹은 투명 · 눌림 그대로), 내용이 바뀌면 update, 24시간 막대는 영역이 아니다 · 끄면 호출 없음', async () => {
    const B = await fresh({ plugin: true, on: true });
    await B.page.evaluate(() => {
      const c = document.getElementById('congCard'); document.getElementById('hbox').appendChild(c); c.style.margin = '0 14px 8px';
      document.getElementById('congStn').textContent = '부평'; document.getElementById('congMeta').textContent = '시간표 기반';
      document.getElementById('congStatusTxt').textContent = '여유'; document.getElementById('congStatusTxt').style.color = '#2ecc71';
      const g = document.getElementById('congGaugeWrap'); g.style.display = 'block'; document.getElementById('congGaugePct').textContent = '35%';
      const f = document.getElementById('congGaugeFill'); f.style.transition = 'none'; f.style.width = '35%';
      document.getElementById('carGrid').innerHTML = [1, 2, 3, 4].map(i => '<div class="car-cell"><span>' + i + '</span><b>' + (i % 2 ? '보통' : '여유') + '</b></div>').join('');
    });
    await waitFor(B, has(B, 'show', 'cs:top')); await waitFor(B, has(B, 'show', 'cs:gauge')); await waitFor(B, has(B, 'show', 'cs:cars'));
    const top = (await lastCall(B, 'show', 'cs:top')).a, txt = top.runs.filter(r => !r.k).map(r => r.t).join('');
    assert.ok(/부평/.test(txt) && /시간표 기반/.test(txt) && /여유/.test(txt), '상단 글자 ' + txt);
    const g = (await lastCall(B, 'show', 'cs:gauge')).a; assert.ok(g.runs.some(r => r.k === 'r') && g.runs.some(r => /35%/.test(r.t || '')), '게이지: 채움 막대 상자 + 글자 ' + JSON.stringify(g.runs).slice(0, 300));
    const cars = (await lastCall(B, 'show', 'cs:cars')).a; assert.strictEqual(cars.runs.filter(r => r.k === 'r').length, 4, '칸 4개의 테두리 상자'); assert.ok(cars.runs.filter(r => !r.k).length >= 8, '칸 글자');
    assert.ok(await waitFor(B, async () => await B.page.evaluate(() => ['congStn', 'congGaugeWrap', 'carGrid'].every(id => { const e = document.getElementById(id); const h = id === 'congStn' ? e.closest('.cong-top') : e; return h.classList.contains('htl-nat-op'); }))), '웹을 안 가렸다');
    const regs = await B.page.evaluate(() => (window.__hn || []).filter(c => c.m === 'show').map(c => c.a && c.a.id));
    assert.ok(!regs.some(id => /chart|bars/.test(String(id))), '24시간 막대는 영역이 아니다 ' + regs.join(','));
    await clear(B); await B.page.evaluate(() => { document.getElementById('congStatusTxt').textContent = '혼잡'; });
    assert.ok(await waitFor(B, async () => (await calls(B, '', 'cs:top')).some(c => c.a && c.a.runs && c.a.runs.some(r => r.t === '혼잡'))), '바뀐 상태를 안 보냈다');
    await B.ctx.close();
    const O = await fresh({ plugin: true, on: false });
    await O.page.evaluate(() => { const c = document.getElementById('congCard'); document.getElementById('hbox').appendChild(c); document.getElementById('congStn').textContent = '부평'; });
    await new Promise(r => setTimeout(r, 1500));
    assert.strictEqual(await O.page.evaluate(() => (window.__hn || []).length), 0, '끄면(기본) 플러그인 호출이 하나도 없다');
    await O.ctx.close();
  });
  await t('맛집 탭(2026-10-18): 머리·칩 6개·맛집 칸이 영역으로 그려지고(웹은 투명 · 눌림 그대로), 칩을 바꾸면 update, 안내 문구(빈 상태)도 · 끄면 호출 없음', async () => {
    const setup = () => { const f = document.getElementById('tab-food'); f.style.cssText = 'display:flex;position:fixed;left:0;top:0;width:390px;height:700px;z-index:9;background:#fff;flex-direction:column;overflow:hidden;'; document.body.appendChild(f);
      document.getElementById('foodDestLabel').textContent = '부평역 인근'; const l = document.getElementById('foodList'); l.innerHTML = '';
      [1, 2, 3].forEach(i => l.appendChild(_foodMakeCard({ place_name: '맛집' + i, category_name: '음식점 > 한식 > 국밥', road_address_name: '인천 부평구 부평대로 ' + i, distance: String(100 * i) }, i - 1, false))); };
    const B = await fresh({ plugin: true, on: true });
    await B.page.evaluate(setup);
    await waitFor(B, has(B, 'show', 'fd:hdr')); await waitFor(B, has(B, 'show', 'fd:k0')); await waitFor(B, has(B, 'show', 'fd:c0')); await waitFor(B, has(B, 'show', 'fd:c2'));
    const hd = (await lastCall(B, 'show', 'fd:hdr')).a, ht = hd.runs.filter(r => !r.k).map(r => r.t).join('');
    assert.ok(/도착역 맛집/.test(ht) && /부평역 인근/.test(ht) && /새로고침/.test(ht), '머리 글자 ' + ht);
    const k0 = (await lastCall(B, 'show', 'fd:k0')).a; assert.ok(k0.runs.some(r => r.k === 'r') && k0.runs.some(r => /전체/.test(r.t || '')), '칩: 상자 + 글자 ' + JSON.stringify(k0.runs).slice(0, 200));
    const c0 = (await lastCall(B, 'show', 'fd:c0')).a, ct = c0.runs.filter(r => !r.k).map(r => r.t).join('|');
    assert.ok(/맛집1/.test(ct) && /국밥/.test(ct) && /길찾기/.test(ct), '맛집 칸 글자 ' + ct);
    assert.ok(c0.runs.filter(r => r.k === 'r').length >= 3, '칸 상자 + 순위 동그라미 + 거리 알약 ' + c0.runs.filter(r => r.k === 'r').length);
    assert.ok(await waitFor(B, async () => await B.page.evaluate(() => document.querySelector('#tab-food .food-header').classList.contains('htl-nat-op') && document.querySelectorAll('#foodList > .food-card')[0].classList.contains('htl-nat-op'))), '웹이 투명으로 제자리에 안 남았다');
    assert.strictEqual((await calls(B, 'show', 'fd:c3')).length, 0, '칸이 3개뿐이면 4번째 영역은 안 켜진다');
    await clear(B); await B.page.evaluate(() => { document.querySelectorAll('.food-chip')[1].click ? foodFilterCat(document.querySelectorAll('.food-chip')[1], '카페') : 0; });
    assert.ok(await waitFor(B, async () => (await calls(B, '', 'fd:k1')).length > 0 && (await calls(B, '', 'fd:k0')).length > 0), '바뀐 칩 상태를 안 보냈다');
    await clear(B); await B.page.evaluate(() => { document.getElementById('foodList').innerHTML = '<div class="food-empty">😢<br>해당 카테고리 음식점이 없습니다.</div>'; });
    assert.ok(await waitFor(B, has(B, 'show', 'fd:msg')), '빈 상태 문구 영역이 안 켜졌다');
    await B.ctx.close();
    const O = await fresh({ plugin: true, on: false });
    await O.page.evaluate(setup); await new Promise(r => setTimeout(r, 1500));
    assert.strictEqual(await O.page.evaluate(() => (window.__hn || []).length), 0, '끄면(기본) 플러그인 호출이 하나도 없다');
    await O.ctx.close();
  });
  await t('머리줄이 팝업에 덮이면 숨고, 영역마다 따로 판단한다', async () => {
    const B = await fresh({ plugin: true, on: true }); await waitFor(B, has(B, 'show', 'hd')); await waitFor(B, has(B, 'show', 'tl'));
    await clear(B); await B.page.evaluate(() => { const hb = document.getElementById('transitResultHeader').parentElement.getBoundingClientRect(); const o = document.createElement('div'); o.id = 'popHd'; o.style.cssText = 'position:fixed;left:0;width:390px;top:' + (hb.top - 4) + 'px;height:' + (hb.height + 8) + 'px;z-index:9999;background:#000'; document.body.appendChild(o); });
    assert.ok(await waitFor(B, has(B, 'hide', 'hd')), '덮였는데 안 숨었다');
    assert.strictEqual((await calls(B, 'hide', 'tl')).length, 0, '덮이지 않은 타임라인은 그대로여야 한다');
    await B.ctx.close();
  });

  console.log('[⑥ 안전장치]');
  await t('네이티브 error 이벤트 → 즉시 destroy · 더는 켜지 않는다 · 실패 횟수 저장 · 설정 문구', async () => {
    const x = await fresh({ plugin: true, on: true }); assert.ok(await waitFor(x, has(x, 'show')));
    await clear(x); await emit(x, 'error', { message: '뷰 오류' });
    assert.ok(await waitFor(x, has(x, 'destroy')), 'destroy 없음');
    await clear(x); await x.page.evaluate(() => { document.getElementById('hbox').style.top = '230px'; }); await x.page.waitForTimeout(900);
    assert.strictEqual((await calls(x, 'show')).length, 0, '실패 뒤에 다시 켜졌다');
    const st = await x.page.evaluate(() => ({ f: localStorage.getItem('gdm_htl_fail'), w: localStorage.getItem('gdm_htl_why'), s: document.getElementById('htlSetStat').textContent, on: document.getElementById('htlSetOn').checked }));
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('transitHtlWrap').classList.contains('htl-nat-on')), false, '실패했는데 웹 타임라인이 가려진 채다');
    assert.strictEqual(st.f, '1'); assert.ok(/뷰 오류/.test(st.w)); assert.ok(/문제가 있어/.test(st.s), st.s); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('show 가 거절되면 웹만 쓴다', async () => {
    const x = await fresh({ plugin: true, on: true, showFail: true }); assert.ok(await waitFor(x, has(x, 'destroy')), 'destroy 없음');
    const f = await x.page.evaluate(() => localStorage.getItem('gdm_htl_fail')); assert.strictEqual(f, '1');
    const n = (await calls(x, 'show')).length; await x.page.waitForTimeout(900); assert.strictEqual((await calls(x, 'show')).length, n, '계속 두드린다'); await x.ctx.close();
  });
  await t('이미 두 번 실패한 기기는 처음부터 안 쓴다(호출 없음)', async () => {
    const x = await fresh({ plugin: true, on: true, fails: 2 }); await x.page.waitForTimeout(1800);
    assert.strictEqual((await calls(x, '', '*')).length, 0, JSON.stringify(await calls(x, '', '*'))); await x.ctx.close();
  });
  await t('첫 그림 준비 신호(ready)가 오면 실패 횟수를 0 으로 되돌린다', async () => {
    const x = await fresh({ plugin: true, on: true, fails: 1 }); assert.ok(await waitFor(x, has(x, 'show')));
    await emit(x, 'ready'); const f = await x.page.evaluate(() => localStorage.getItem('gdm_htl_fail')); assert.strictEqual(f, '0'); await x.ctx.close();
  });
  await t('상태 점검: 네이티브가 숨어 있다고 하면 되살리고, 3번 연속이면 웹만 쓴다', async () => {
    const x = await fresh({ plugin: true, on: true }); assert.ok(await waitFor(x, has(x, 'show')));
    await x.page.evaluate(() => { window.__status = () => ({ visible: false, cells: 9, age: 10 }); });
    assert.ok(await waitFor(x, async () => (await x.page.evaluate(() => window._htlNat.H.hFail)) >= 1, 12000), '이상을 못 알아챘다');
    assert.ok(await waitFor(x, has(x, 'destroy'), 20000), '3번 이상이어도 웹으로 안 돌아갔다');
    const w = await x.page.evaluate(() => localStorage.getItem('gdm_htl_why')); assert.ok(/숨어/.test(w), w); await x.ctx.close();
  });

  console.log('[⑦ 설정 스위치]');
  await t('끄면 destroy 하고 웹만, 다시 켜면 다시 켠다(실패 기록도 지운다)', async () => {
    const x = await fresh({ plugin: true, on: true }); assert.ok(await waitFor(x, has(x, 'show')));
    await clear(x); await x.page.evaluate(() => { const c = document.getElementById('htlSetOn'); c.checked = false; c.dispatchEvent(new Event('change')); });
    assert.ok(await waitFor(x, has(x, 'destroy')), '끄기 안 됨');
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_htl_on')), '0');
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('transitHtlWrap').classList.contains('htl-nat-on')), false, '끄면 웹 타임라인이 다시 보여야 한다');
    await clear(x); await x.page.evaluate(() => { document.getElementById('hbox').style.top = '240px'; }); await x.page.waitForTimeout(900);
    assert.strictEqual((await calls(x, 'show')).length, 0, '꺼졌는데 켜졌다');
    await x.page.evaluate(() => { const c = document.getElementById('htlSetOn'); c.checked = true; c.dispatchEvent(new Event('change')); });
    assert.ok(await waitFor(x, has(x, 'show')), '다시 켜기 안 됨');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await b.close();
  console.log(`\n${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
})();
