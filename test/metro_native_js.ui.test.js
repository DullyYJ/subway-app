// 네이티브 노선도 ↔ 앱(JS) 연결 시험 — 2026-10-14
//   가짜 NativeMap 플러그인으로: 지도 사각형 맞춤 · 호선 필터 · 역 누르기→팝업 · 팝업이 뜨면 지도 영역 줄임 · 손가락 닿으면 팝업 닫힘 ·
//   검색/내 위치 찾아가기 · 모달이 덮으면 사진으로 대체+숨김 · 탭을 떠나면 숨김 · 오류/지연/거절 때 웹 SVG 로 복귀 · 연속 실패 시 안 씀 · 설정 스위치
//   플러그인이 없는 환경(웹)은 예전 그대로인지도 확인한다.
// 실행: node test/metro_native_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 400)); } };
const NOW = new Date('2026-10-14T13:00:00+09:00');

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // opt: { plugin, showFail, found(찾기 결과), store(localStorage) }
  async function fresh(opt) {
    opt = opt || {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5547, longitude: 126.9726 }, permissions: ['geolocation'] });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return (u.protocol === 'file:' || u.protocol === 'data:') ? r.continue() : r.abort(); });
    await page.addInitScript((o) => {
      try { localStorage.setItem('gdm_loc_disclosed', '1'); localStorage.setItem('bgPermGuided', '1'); (o.store || []).forEach(kv => localStorage.setItem(kv[0], kv[1])); } catch (e) {}
      window.__nm = []; window.__nmL = {}; window.__nmFound = o.found !== false;
      window.__nmEmit = (n, d) => { (window.__nmL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const rec = (m, a, ret) => { window.__nm.push({ m, a: a || null }); return Promise.resolve(ret); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { NativeMap: {
          show: (a) => { window.__nm.push({ m: 'show', a }); return o.showFail ? Promise.reject(new Error('데이터 없음')) : Promise.resolve(); },
          setRect: (a) => rec('setRect', a), hide: () => rec('hide'), destroy: () => rec('destroy'), setFilter: (a) => rec('setFilter', a), fit: () => rec('fit'),
          ensureVisible: (a) => rec('ensureVisible', a, { found: true }), setHint: (a) => rec('setHint', a),
          snapshot: (a) => rec('snapshot', a, { data: 'data:image/jpeg;base64,/9j/AAAA' }),
          centerOn: (a) => { window.__nm.push({ m: 'centerOn', a }); return Promise.resolve(window.__nmFound ? { found: true, name: String(a.name) } : { found: false }); },
          addListener: (n, f) => { (window.__nmL[n] = window.__nmL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.clock.install({ time: NOW });
    await page.goto('file://' + html); await page.clock.runFor(3500);
    return { ctx, page, errs };
  }
  const go = async (x, tab, ms) => { await x.page.evaluate(n => switchTab(n, document.getElementById('ni-' + n)), tab); await x.page.clock.runFor(ms || 800); };
  const openSubway = async (x) => { await go(x, 'map', 800); await x.page.click('#mapItabSubway'); await x.page.clock.runFor(1200); };
  const calls = (x, m) => x.page.evaluate(m => window.__nm.filter(c => !m || c.m === m), m);
  const clear = (x) => x.page.evaluate(() => { window.__nm.length = 0; });
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__nmEmit(n, d), [n, d || {}]);
  const popup = (x) => x.page.evaluate(() => { const p = document.getElementById('svgStationPop'); return p ? p.innerText : null; });

  await t('플러그인이 없으면(웹) 예전 그대로: SVG 가 DOM 에 있고 터치가 바인딩된다', async () => {
    const x = await fresh({ plugin: false }); await openSubway(x);
    const r = await x.page.evaluate(() => ({ act: _nmActive(), svg: document.querySelectorAll('#svgContainer svg text').length, bound: document.querySelectorAll('#svgContainer svg text[data-clickable]').length }));
    assert.strictEqual(r.act, false); assert(r.svg > 600 && r.bound === r.svg, JSON.stringify(r)); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('플러그인이 있으면: SVG 를 DOM 에 안 넣고, 지도 영역 사각형으로 show(fit) 한다', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x);
    const r = await x.page.evaluate(() => { const g = document.getElementById('gmSvgView').getBoundingClientRect(); return { svg: document.querySelectorAll('#svgContainer svg').length, co: getComputedStyle(document.getElementById('svgContainer')).display, g: [g.left, g.top, g.width, g.height], dpr: devicePixelRatio }; });
    const sh = await calls(x, 'show');
    assert.strictEqual(r.svg, 0, 'SVG 를 넣으면 안 된다'); assert.strictEqual(r.co, 'none');
    assert.strictEqual(sh.length, 1, 'show 호출 ' + sh.length);
    const a = sh[0].a; assert(Math.abs(a.x - r.g[0]) < 1 && Math.abs(a.y - r.g[1]) < 1 && Math.abs(a.w - r.g[2]) < 1 && Math.abs(a.h - r.g[3]) < 1, JSON.stringify([a, r.g]));
    assert.strictEqual(a.fit, true); assert.strictEqual(a.filter, 'ALL'); assert.strictEqual(a.dpr, r.dpr);
    assert(a.h > 200, '지도 높이 ' + a.h);
    const hint = (await calls(x, 'setHint'))[0]; assert(hint && /역 이름 탭/.test(hint.a.text), JSON.stringify(hint));
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('호선 버튼 → 네이티브에 필터 이름만 전달(버튼 표시는 그대로 바뀐다), 전체 → ALL', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x); await clear(x);
    await x.page.evaluate(() => gmFilterLine('2호선')); await x.page.clock.runFor(300);
    let f = await calls(x, 'setFilter'); assert.deepStrictEqual(f.map(c => c.a.name), ['2호선']);
    const on = await x.page.evaluate(() => [...document.querySelectorAll('.lf-btn.active')].map(b => b.dataset.line)); assert.deepStrictEqual(on, ['2호선']);
    await x.page.evaluate(() => document.getElementById('gfALL').click()); await x.page.clock.runFor(300);
    f = await calls(x, 'setFilter'); assert.deepStrictEqual(f.map(c => c.a.name), ['2호선', 'ALL']);
    await x.page.evaluate(() => gmFilterLine('9호선')); await clear(x); await x.page.evaluate(() => resetMapStyles());
    f = await calls(x, 'setFilter'); assert.deepStrictEqual(f.map(c => c.a.name), ['ALL'], 'resetMapStyles 는 웹과 같이 전부 보이게');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('역을 누르면(station 이벤트) 예전 클릭과 같은 팝업(역명·노선 배지·출발/도착)이 뜬다', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x);
    await emit(x, 'station', { name: '서울역', alt: '서울', x: 100, y: 200 }); await x.page.clock.runFor(300);
    const p = await popup(x); assert(p && /서울역/.test(p) && /출발역/.test(p) && /도착역/.test(p), String(p));
    assert(/1호선/.test(p) && /4호선/.test(p), '노선 배지(별칭 서울 포함): ' + p);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('제외어·한 글자 이름은 무시한다(예전과 같음)', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x);
    for (const n of ['2호선 노선도', '환승', '역', '', '  ']) { await emit(x, 'station', { name: n }); }
    await x.page.clock.runFor(300); assert.strictEqual(await popup(x), null); await x.ctx.close();
  });

  await t('팝업이 뜨면 지도 영역을 팝업 위까지 줄이고(setRect), 역이 가려지지 않게 ensureVisible, 닫히면 원래 크기로', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x);
    const full = (await calls(x, 'show'))[0].a; await clear(x);
    await emit(x, 'station', { name: '강남' }); await x.page.clock.runFor(500);
    const top = await x.page.evaluate(() => document.getElementById('svgStationPop').getBoundingClientRect().top);
    const sr = await calls(x, 'setRect'); assert(sr.length >= 1, 'setRect 없음');
    const last = sr[sr.length - 1].a; assert(Math.abs(last.y + last.h - top) < 1.5, `팝업 위쪽 ${top} / 지도 아래쪽 ${last.y + last.h}`); assert(last.h < full.h - 100, '줄어야 한다');
    const ev = await calls(x, 'ensureVisible'); assert.deepStrictEqual(ev.map(c => c.a.name), ['강남']);
    await clear(x);
    await emit(x, 'gesture'); await x.page.clock.runFor(500);
    assert.strictEqual(await popup(x), null, '손가락이 닿으면 팝업이 닫힌다');
    const sr2 = await calls(x, 'setRect'); const l2 = sr2[sr2.length - 1].a; assert(Math.abs(l2.h - full.h) < 1.5, `원래 크기로 ${l2.h} vs ${full.h}`);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('다른 시트(bdrop.on)가 열려 있으면 지도 손가락이 팝업을 닫지 않는다(웹과 같음)', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x);
    await x.page.evaluate(() => svgShowPopup('강남', ['2호선'])); await x.page.clock.runFor(300);
    await x.page.evaluate(() => { const d = document.getElementById('bdrop'); if (d) d.classList.add('on'); });
    await emit(x, 'gesture'); assert.notStrictEqual(await popup(x), null);
    await x.ctx.close();
  });

  await t('역 검색 → centerOn(zoom 1.6) 후 centered 가 오면 그 역 팝업', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x); await clear(x);
    await x.page.fill('#mapStnSearch', '부평'); await x.page.keyboard.press('Enter'); await x.page.clock.runFor(300);
    const c = await calls(x, 'centerOn'); assert.strictEqual(c.length, 1); assert.strictEqual(c[0].a.name, '부평'); assert.strictEqual(c[0].a.zoom, 1.6); assert.strictEqual(c[0].a.flash, true);
    assert.strictEqual(await popup(x), null, '이동이 끝나기 전엔 아직');
    await emit(x, 'centered', { name: '부평' }); await x.page.clock.runFor(300);
    const p = await popup(x); assert(p && /부평/.test(p), String(p));
    await x.page.clock.runFor(2000); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('centered 가 안 와도 1.1초 뒤 팝업은 뜬다', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x);
    await x.page.evaluate(() => mapSearchStation('시청')); await x.page.clock.runFor(1500);
    const p = await popup(x); assert(p && /시청/.test(p), String(p)); await x.ctx.close();
  });

  await t('못 찾는 역이면 팝업을 띄우지 않는다', async () => {
    const x = await fresh({ plugin: true, found: false }); await openSubway(x);
    await x.page.evaluate(() => mapSearchStation('없는역이름')); await x.page.clock.runFor(1800);
    assert.strictEqual(await popup(x), null); await x.ctx.close();
  });

  await t('📍 내 위치 → 가장 가까운 역으로 centerOn', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x); await clear(x);
    await x.page.evaluate(() => mapGoToMyLocation()); await x.page.clock.runFor(1500);
    const c = await calls(x, 'centerOn'); assert.strictEqual(c.length, 1); assert(/서울역|서울|남영|숙대입구/.test(c[0].a.name), c[0].a.name);
    await x.ctx.close();
  });

  await t('웹 모달이 지도 위를 덮으면: 사진(snapshot)을 깔고 네이티브를 숨긴다. 모달이 닫히면 다시 보이고 사진은 지운다', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x);
    await emit(x, 'ready'); await clear(x);
    await x.page.evaluate(() => { const d = document.createElement('div'); d.id = 'tstModal'; d.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999'; document.body.appendChild(d); });
    await x.page.clock.runFor(600);
    let names = (await calls(x)).map(c => c.m); assert(names.indexOf('snapshot') >= 0 && names.indexOf('hide') > names.indexOf('snapshot'), names.join(','));
    const bg = await x.page.evaluate(() => document.getElementById('gmSvgView').style.backgroundImage); assert(/data:image\/jpeg/.test(bg), bg);
    await clear(x);
    await x.page.evaluate(() => document.getElementById('tstModal').remove()); await x.page.clock.runFor(600);
    names = (await calls(x)).map(c => c.m); assert(names.indexOf('show') >= 0, names.join(','));
    const bg2 = await x.page.evaluate(() => document.getElementById('gmSvgView').style.backgroundImage); assert.strictEqual(bg2, '', '사진 지움');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('아래/위에 붙은 가로 막대(하단 카드 등)는 지도 영역을 줄여 피하고, 떠 있는 버튼은 덮개로 본다', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x);
    const full = (await calls(x, 'show'))[0].a; await emit(x, 'ready'); await clear(x);
    const add = (css) => x.page.evaluate((css) => { const d = document.createElement('div'); d.id = 'tstBar'; d.style.cssText = css; document.body.appendChild(d); }, css);
    const rm = () => x.page.evaluate(() => { const d = document.getElementById('tstBar'); if (d) d.remove(); });
    const lastRect = async () => { const sr = await calls(x, 'setRect'); return sr.length ? sr[sr.length - 1].a : null; };
    await add('position:fixed;left:0;right:0;bottom:0;height:140px;background:#222;z-index:9999'); await x.page.clock.runFor(500);
    let bar = await x.page.evaluate(() => document.getElementById('tstBar').getBoundingClientRect().top);
    let r = await lastRect(); assert(r && Math.abs(r.y + r.h - bar) < 1.5 && Math.abs(r.y - full.y) < 1.5, JSON.stringify([r, bar, full]));
    assert.strictEqual((await calls(x, 'hide')).length, 0, '막대는 숨길 필요 없다');
    await rm(); await x.page.clock.runFor(500);
    await clear(x);
    await add('position:fixed;left:0;right:0;top:' + (full.y + 1) + 'px;height:60px;background:#222;z-index:9999'); await x.page.clock.runFor(500);
    r = await lastRect(); assert(r && r.y > full.y + 50 && Math.abs(r.y + r.h - (full.y + full.h)) < 1.5, JSON.stringify([r, full]));
    await rm(); await x.page.clock.runFor(500); await clear(x);
    await add('position:fixed;left:150px;top:' + (full.y + full.h / 2 - 20) + 'px;width:60px;height:40px;background:#f00;z-index:9999'); await x.page.clock.runFor(500);
    const names = (await calls(x)).map(c => c.m); assert(names.indexOf('hide') >= 0, '가운데 떠 있는 것은 덮개: ' + names.join(','));
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('다른 탭으로 가면 숨기고, 돌아오면 다시 보여 주며 맞춤(fit)한다', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x); await emit(x, 'ready'); await clear(x);
    await go(x, 'home', 800); await x.page.clock.runFor(500);
    assert((await calls(x, 'hide')).length >= 1, 'hide 없음');
    await clear(x); await go(x, 'map', 800); await x.page.clock.runFor(800);
    const sh = await calls(x, 'show'); assert(sh.length >= 1 && sh[0].a.fit === true, JSON.stringify(sh));
    await x.ctx.close();
  });

  await t('첫 그림이 8초 안에 안 나오면 웹 노선도로 돌아간다(SVG 주입 + 터치 바인딩 + 필터 유지)', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x);
    await x.page.evaluate(() => gmFilterLine('2호선'));
    await x.page.clock.runFor(8600);
    const r = await x.page.evaluate(() => ({ act: _nmActive(), failed: _nm.failed, svg: document.querySelectorAll('#svgContainer svg text').length, bound: document.querySelectorAll('#svgContainer svg text[data-clickable]').length, co: getComputedStyle(document.getElementById('svgContainer')).display, fail: localStorage.getItem('gdm_nm_fail'), hidden: [...document.querySelectorAll('#svgContainer svg [style*="display: none"]')].length }));
    assert.strictEqual(r.act, false); assert.strictEqual(r.failed, true); assert(r.svg > 600 && r.bound === r.svg, JSON.stringify(r)); assert.notStrictEqual(r.co, 'none'); assert.strictEqual(r.fail, '1');
    assert(r.hidden > 100, '2호선 필터가 웹 SVG 에도 적용돼야 한다 ' + r.hidden);
    assert((await calls(x, 'destroy')).length >= 1, 'destroy 없음'); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('준비(ready)가 오면 8초가 지나도 웹으로 돌아가지 않고, 연속 실패 기록을 지운다', async () => {
    const x = await fresh({ plugin: true, store: [['gdm_nm_fail', '1']] }); await openSubway(x);
    await x.page.clock.runFor(1000); await emit(x, 'ready'); await x.page.clock.runFor(12000);
    const r = await x.page.evaluate(() => ({ act: _nmActive(), fail: localStorage.getItem('gdm_nm_fail') })); assert.strictEqual(r.act, true); assert.strictEqual(r.fail, '0'); await x.ctx.close();
  });

  await t('네이티브 error 이벤트 / show 거절 → 즉시 웹으로 돌아간다', async () => {
    let x = await fresh({ plugin: true }); await openSubway(x); await emit(x, 'error', { message: '지도가 비어 있다' }); await x.page.clock.runFor(500);
    let r = await x.page.evaluate(() => ({ act: _nmActive(), why: _nm.why, svg: document.querySelectorAll('#svgContainer svg text').length })); assert.strictEqual(r.act, false); assert(/비어/.test(r.why), r.why); assert(r.svg > 600); await x.ctx.close();
    x = await fresh({ plugin: true, showFail: true }); await openSubway(x); await x.page.clock.runFor(600);
    r = await x.page.evaluate(() => ({ act: _nmActive(), why: _nm.why, svg: document.querySelectorAll('#svgContainer svg text').length })); assert.strictEqual(r.act, false); assert(/show/.test(r.why), r.why); assert(r.svg > 600);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('웹으로 돌아간 뒤에는 검색·팝업이 예전 웹 방식으로 동작한다', async () => {
    const x = await fresh({ plugin: true, showFail: true }); await openSubway(x); await x.page.clock.runFor(800); await clear(x);
    await x.page.fill('#mapStnSearch', '서울역'); await x.page.keyboard.press('Enter'); await x.page.clock.runFor(1500);
    const p = await popup(x); assert(p && /서울역/.test(p) && /출발역/.test(p), String(p));
    assert.strictEqual((await calls(x, 'centerOn')).length, 0, '네이티브를 부르면 안 된다'); await x.ctx.close();
  });

  await t('연속 2번 실패 기록이 있으면 아예 네이티브를 쓰지 않는다 / 설정 스위치로 다시 켠다', async () => {
    const x = await fresh({ plugin: true, store: [['gdm_nm_fail', '2'], ['gdm_nm_why', '예전 오류']] }); await openSubway(x);
    let r = await x.page.evaluate(() => ({ act: _nmActive(), svg: document.querySelectorAll('#svgContainer svg text').length, card: getComputedStyle(document.getElementById('nmSetCard')).display, stat: document.getElementById('nmSetStat').textContent, on: document.getElementById('nmSetOn').checked }));
    assert.strictEqual(r.act, false); assert(r.svg > 600); assert.strictEqual(r.card, 'block'); assert(/문제가 있어/.test(r.stat) && /예전 오류/.test(r.stat), r.stat); assert.strictEqual(r.on, false);
    assert.strictEqual((await calls(x, 'show')).length, 0);
    await x.page.evaluate(() => _nmSetUse(true)); await x.page.clock.runFor(800);
    r = await x.page.evaluate(() => ({ act: _nmActive(), fail: localStorage.getItem('gdm_nm_fail'), off: localStorage.getItem('gdm_nm_off'), on: document.getElementById('nmSetOn').checked }));
    assert.strictEqual(r.act, true); assert.strictEqual(r.fail, '0'); assert.strictEqual(r.on, true);
    assert((await calls(x, 'show')).length >= 1, '다시 켜면 지도 화면이 떠야 한다');
    await x.page.evaluate(() => _nmSetUse(false)); await x.page.clock.runFor(800);
    r = await x.page.evaluate(() => ({ act: _nmActive(), off: localStorage.getItem('gdm_nm_off'), svg: document.querySelectorAll('#svgContainer svg text').length, stat: document.getElementById('nmSetStat').textContent }));
    assert.strictEqual(r.act, false); assert.strictEqual(r.off, '1'); assert(r.svg > 600); assert(/꺼짐/.test(r.stat)); assert((await calls(x, 'destroy')).length >= 1);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('플러그인이 없으면 설정 카드는 숨겨진다', async () => {
    const x = await fresh({ plugin: false }); await x.page.clock.runFor(800);
    assert.strictEqual(await x.page.evaluate(() => getComputedStyle(document.getElementById('nmSetCard')).display), 'none'); await x.ctx.close();
  });

  await b.close();
  console.log(`\nmetro_native_js: ${pass} pass ${fail} fail`); process.exit(fail ? 1 : 0);
})();
