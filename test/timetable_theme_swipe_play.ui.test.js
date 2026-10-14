// 시간표 시트·역 팝업: 테마(다크/파스텔) · 아래로 밀어 닫기 · 상단 캐릭터 놀이터 시험 — 2026-10-14
//   노선도에서 역을 누르면 나오는 팝업의 "🕒 시간표" → 시트. 계산은 엔진(진짜 엔진 코드를 요청 가로채기로 연결), 앱은 그리기만.
//   · 기존 팝업의 출발/도착 버튼 순서(0·1번)가 그대로인지  · 시트가 뜨고 닫히는지(✕ / 바깥 / 네이티브 지도 만짐)
//   · 시(時)별 묶음·다음 열차 강조·지난 열차 흐림  · 요일/방향/노선 전환  · 자료 없는 노선 안내  · 서버 실패 시 안내+다시 시도
//   · 네이티브 노선도에서도 같은 화면(시트가 뜨면 지도 사각형을 줄임)
// 실행: node test/station_timetable.ui.test.js [html 경로]
const assert = require('assert'), path = require('path'), fs = require('fs');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
const W = require('./helpers/nt_load')();
const { ntCreate, NT_INCHEON_TT, NT_STNORDER } = W;
const bundle = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tt_bundle.json'), 'utf8'));
const nt = ntCreate({ _REAL_TT: bundle.data._REAL_TT, _GIMPO_TT: bundle.data._GIMPO_TT, _INCHEON_TT: NT_INCHEON_TT, _BUILTIN_TT: bundle.data._BUILTIN_TT, LINE_SCHEDULE: bundle.data.LINE_SCHEDULE, _REAL_SEG: bundle.data._REAL_SEG, _TT_ORDER_HARD: bundle.data._TT_ORDER_HARD, STNORDER: NT_STNORDER });
let pass = 0, fail = 0;
const t = async (name, fn) => { if (process.env.ONLY && !name.includes(process.env.ONLY)) return; try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 500)); } };
const NOW = new Date('2026-10-14T13:00:00+09:00');   // 수요일 13:00

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // opt: { plugin, failN(처음 N번 서버 실패), noData }
  async function fresh(opt) {
    opt = opt || {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5547, longitude: 126.9726 }, permissions: ['geolocation'] });
    const page = await ctx.newPage(); const errs = [], asked = [];
    page.on('pageerror', e => errs.push(e.message));
    let fails = opt.failN || 0;
    await page.route('**/*', r => {
      const u = new URL(r.request().url());
      if (u.protocol === 'file:' || u.protocol === 'data:') return r.continue();
      if (u.pathname === '/next-train' && r.request().method() === 'POST') {
        const body = JSON.parse(r.request().postData() || '{}'); (body.items || []).forEach(it => asked.push(it));
        if (fails > 0) { fails--; return r.fulfill({ status: 500, body: 'x' }); }
        const outs = (body.items || []).map(q => Object.assign(W.ntAnswer(nt, Object.assign({}, q, { baseMs: Number(q.baseMs) })), { id: q.id }));
        return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ items: outs }) });
      }
      if (u.pathname === '/next-train') {
        const q = Object.fromEntries(u.searchParams.entries()); asked.push(q);
        if (fails > 0) { fails--; return r.fulfill({ status: 500, body: 'x' }); }
        const ans = W.ntAnswer(nt, Object.assign({}, q, { baseMs: Number(q.baseMs) }));
        return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(ans) });
      }
      return r.abort();
    });
    await page.addInitScript((o) => {
      try { localStorage.setItem('gdm_loc_disclosed', '1'); localStorage.setItem('bgPermGuided', '1'); } catch (e) {}
      window.__nm = []; window.__nmL = {};
      window.__nmEmit = (n, d) => { (window.__nmL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const rec = (m, a, ret) => { window.__nm.push({ m, a: a || null }); return Promise.resolve(ret); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { NativeMap: {
          show: (a) => { window.__nm.push({ m: 'show', a }); return Promise.resolve(); },
          setRect: (a) => rec('setRect', a), hide: () => rec('hide'), destroy: () => rec('destroy'), setFilter: (a) => rec('setFilter', a), fit: () => rec('fit'),
          ensureVisible: (a) => rec('ensureVisible', a, { found: true }), setHint: (a) => rec('setHint', a),
          snapshot: (a) => rec('snapshot', a, { data: 'data:image/jpeg;base64,/9j/AAAA' }),
          centerOn: (a) => rec('centerOn', a, { found: true, name: String(a.name) }),
          addListener: (n, f) => { (window.__nmL[n] = window.__nmL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.clock.install({ time: NOW });
    await page.goto('file://' + html); await page.clock.runFor(3500);
    return { ctx, page, errs, asked };
  }
  const go = async (x, tab, ms) => { await x.page.evaluate(n => switchTab(n, document.getElementById('ni-' + n)), tab); await x.page.clock.runFor(ms || 800); };
  const openSubway = async (x) => { await go(x, 'map', 800); await x.page.click('#mapItabSubway'); await x.page.clock.runFor(1200); };
  // 진짜 네트워크(가로챈 요청)는 가짜 시계와 별개로 흘러서, '불러오는 중'이 끝날 때까지 실제 시간으로 기다린다
  const settle = async (x) => {
    for (let i = 0; i < 100; i++) {
      const loading = await x.page.evaluate(() => { const b = document.getElementById('nmTtBody'); return !!b && /불러오는 중/.test(b.innerText); });
      if (!loading) return;
      await new Promise(r => setTimeout(r, 30)); await x.page.clock.runFor(30);
    }
  };
  const pop = (x, name, lines) => x.page.evaluate(([n, l]) => { svgShowPopup(n, l); }, [name, lines]);
  const openTt = async (x, name, lines) => {
    await pop(x, name, lines); await x.page.clock.runFor(200);
    await x.page.evaluate(() => document.getElementById('nmTtOpenBtn').click()); await x.page.clock.runFor(100); await settle(x); await x.page.clock.runFor(300);
  };
  const sheet = (x) => x.page.evaluate(() => {
    const s = document.getElementById('nmTtSheet'); if (!s) return null;
    const q = (id) => (s.querySelector('#' + id) || {}).innerText || '';
    return { title: q('nmTtTitle'), sum: q('nmTtSum'), body: q('nmTtBody'), lines: [...s.querySelectorAll('[data-nmtt-line]')].map(n => n.innerText), days: [...s.querySelectorAll('[data-nmtt-day]')].map(n => n.innerText), dirs: [...s.querySelectorAll('[data-nmtt-dk]')].map(n => n.innerText), next: (s.querySelector('#nmTtNext') || {}).innerText || null, nextBg: s.querySelector('#nmTtNext') ? getComputedStyle(s.querySelector('#nmTtNext')).backgroundColor : null };
  });
  const click = async (x, sel, i) => { await x.page.evaluate(([s, i]) => document.querySelectorAll('#nmTtSheet ' + s)[i || 0].click(), [sel, i]); await x.page.clock.runFor(100); await settle(x); await x.page.clock.runFor(300); };


  const setTheme = (x, th) => x.page.evaluate((t) => { applyTheme(t); }, th);
  const css = (x, sel) => x.page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e); return { bg: c.backgroundColor, color: c.color, bd: c.borderTopColor, shadow: c.boxShadow }; }, sel);
  const lum = (rgb) => { const m = String(rgb).match(/[\d.]+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };

  for (const th of ['dark', 'pastel']) {
    await t('테마 ' + th + ': 시트·팝업이 그 테마의 색(--card·--text 등)을 따른다 — 고정 다크색이 남지 않는다', async () => {
      const x = await fresh(); await openSubway(x); await setTheme(x, th);
      const vars = await x.page.evaluate(() => { const p = document.createElement('i'); p.style.cssText = 'background:var(--card);color:var(--text)'; document.body.appendChild(p); const c = getComputedStyle(p); const r = { card: c.backgroundColor, text: c.color }; p.remove(); return r; });
      await pop(x, '서울역', ['1호선', '4호선']); await x.page.clock.runFor(100);
      const pp = await css(x, '#svgStationPop'); const nm = await css(x, '#svgStationPop .nmp-name');
      assert.strictEqual(pp.bg, vars.card, '팝업 배경 ' + pp.bg + ' vs ' + vars.card);
      assert.strictEqual(nm.color, vars.text, '역명 글자색');
      const btn = await x.page.evaluate(() => [...document.querySelectorAll('#svgStationPop button')].map(b => getComputedStyle(b).backgroundColor));
      const blue = await x.page.evaluate(() => { const p = document.createElement('i'); p.style.cssText = 'background:var(--blue)'; document.body.appendChild(p); const r = getComputedStyle(p).backgroundColor; p.remove(); return r; });
      assert.strictEqual(btn[0], blue, '출발 버튼은 테마 파랑');
      await x.page.evaluate(() => document.getElementById('nmTtOpenBtn').click()); await x.page.clock.runFor(100); await settle(x); await x.page.clock.runFor(300);
      const sh = await css(x, '#nmTtSheet');
      assert.strictEqual(sh.bg, vars.card, '시트 배경 ' + sh.bg + ' vs ' + vars.card);
      assert.strictEqual(sh.color, vars.text, '시트 글자색');
      // 밝기 확인: 파스텔은 밝은 배경·어두운 글자, 다크는 반대
      if (th === 'pastel') { assert(lum(sh.bg) > 0.85 && lum(sh.color) < 0.3, '파스텔은 밝은 시트 ' + sh.bg + '/' + sh.color); }
      else { assert(lum(sh.bg) < 0.2 && lum(sh.color) > 0.8, '다크는 어두운 시트 ' + sh.bg + '/' + sh.color); }
      // 칩·시각 글자가 배경과 대비된다(읽을 수 있다)
      const chips = await x.page.evaluate(() => [...document.querySelectorAll('#nmTtSheet .nmtt-chip:not(.on)')].map(n => { const c = getComputedStyle(n); return [c.backgroundColor, c.color]; }));
      assert(chips.length >= 3);
      chips.forEach(([bg, fg]) => assert(Math.abs(lum(bg) - lum(fg)) > 0.25, '칩 대비 ' + bg + ' / ' + fg));
      const times = await x.page.evaluate(() => [...document.querySelectorAll('#nmTtBody .nmtt-t:not(.next):not(.past)')].slice(0, 5).map(n => getComputedStyle(n).color));
      times.forEach(fg => assert(Math.abs(lum(fg) - lum(sh.bg)) > 0.5, '시각 글자 대비 ' + fg + ' on ' + sh.bg));
      const past = await x.page.evaluate(() => { const n = document.querySelector('#nmTtBody .nmtt-t.past'); return n ? getComputedStyle(n).color : null; });
      assert(past && Math.abs(lum(past) - lum(sh.bg)) > 0.12, '지난 열차도 보이되 흐리게 ' + past);
      // 인라인 고정 다크색이 남아 있지 않다
      const bad = await x.page.evaluate(() => [...document.querySelectorAll('#svgStationPop, #svgStationPop *, #nmTtSheet, #nmTtSheet *')].filter(n => !(n.matches('[data-nmtt-line]') && /border-color/.test(n.getAttribute('style') || '')) /* 선택된 노선 칩은 노선 고유색(배경) 위의 흰 글자 */ && /#(1c1c1e|2c2c2e|444|555|fff|0a84ff|ff375f|aaa|bbb|ddd|eee|888|777)\b/i.test(n.getAttribute('style') || '')).map(n => n.id || n.className));
      assert.deepStrictEqual(bad.filter(c => !/pill|^$/.test(String(c))), [], '고정색 남음 ' + await x.page.evaluate(() => [...document.querySelectorAll('#nmTtSheet *')].filter(n => /#fff/i.test(n.getAttribute('style') || '')).map(n => n.outerHTML.slice(0, 160)).join(' || ')));
      assert.deepStrictEqual(x.errs, []); await x.ctx.close();
    });
  }

  await t('테마를 바꾸면 열려 있는 시트 색도 바로 따라 바뀐다(다시 열 필요 없음)', async () => {
    const x = await fresh(); await openSubway(x); await setTheme(x, 'dark'); await openTt(x, '서울역', ['1호선', '4호선']);
    const a = await css(x, '#nmTtSheet'); await setTheme(x, 'pastel'); await x.page.clock.runFor(100); const b2 = await css(x, '#nmTtSheet');
    assert(lum(a.bg) < 0.2 && lum(b2.bg) > 0.85, a.bg + ' → ' + b2.bg);
    await x.ctx.close();
  });

  // ── 아래로 밀어 닫기 ──
  // 가짜 시계는 설치 뒤에도 실제 시간대로 흐르므로, 속도(px/ms) 판정이 시험 환경의 지연에 흔들리지 않게 끌기 전에 시계를 멈춰 runFor 로만 움직인다
  const drag = async (x, from, to, steps, ms) => {
    if (!x.frozen) { x.frozen = true; const now = await x.page.evaluate(() => Date.now()); await x.page.clock.pauseAt(new Date(now + 1000)); }
    const m = x.page.mouse; await m.move(from[0], from[1]); await m.down();
    for (let i = 1; i <= steps; i++) { await m.move(from[0] + (to[0] - from[0]) * i / steps, from[1] + (to[1] - from[1]) * i / steps); await x.page.clock.runFor(ms || 16); }
    return m;
  };
  const rectOf = (x, sel) => x.page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height }; }, sel);

  await t('밀어 닫기(시트): 손잡이 영역을 아래로 충분히 끌면 시트가 손가락을 따라 내려가다 닫힌다', async () => {
    const x = await fresh(); await openSubway(x); await openTt(x, '서울역', ['1호선', '4호선']);
    const r0 = await rectOf(x, '#nmTtSheet'); const sx = (r0.left + r0.right) / 2;
    const m = await drag(x, [sx, r0.top + 14], [sx, r0.top + 14 + 90], 9);
    const mid = await rectOf(x, '#nmTtSheet'); assert(mid && mid.top > r0.top + 60, '끄는 동안 따라 내려간다 ' + (mid && mid.top - r0.top));
    await m.move(sx, r0.top + 14 + 220); await x.page.clock.runFor(16); await m.up(); await x.page.clock.runFor(400);
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('nmTtSheet')), false, '닫혀야 한다');
    assert.strictEqual(await x.page.evaluate(() => window._RC.playState()), null, '놀이터도 멈춘다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('밀어 닫기(시트): 조금만 끌고 놓으면 제자리로 돌아온다(닫히지 않음)', async () => {
    const x = await fresh(); await openSubway(x); await openTt(x, '서울역', ['1호선', '4호선']);
    const r0 = await rectOf(x, '#nmTtSheet'); const sx = (r0.left + r0.right) / 2;
    const m = await drag(x, [sx, r0.top + 14], [sx, r0.top + 14 + 40], 5, 30); await m.up(); await x.page.clock.runFor(500);
    const r1 = await rectOf(x, '#nmTtSheet'); assert(r1 && Math.abs(r1.top - r0.top) < 2, '제자리 ' + (r1 && r1.top) + ' vs ' + r0.top);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('밀어 닫기(시트): 짧아도 빠르게 털면 닫힌다', async () => {
    const x = await fresh(); await openSubway(x); await openTt(x, '서울역', ['1호선', '4호선']);
    const r0 = await rectOf(x, '#nmTtSheet'); const sx = (r0.left + r0.right) / 2;
    const m = await drag(x, [sx, r0.top + 14], [sx, r0.top + 14 + 70], 2, 8); await m.up(); await x.page.clock.runFor(400);
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('nmTtSheet')), false);
    await x.ctx.close();
  });
  await t('밀어 닫기(시트): 위로 끌면 아무 일 없다 · 가로로 넘기는 노선 탭은 건드리지 않는다', async () => {
    const x = await fresh(); await openSubway(x); await openTt(x, '서울역', ['1호선', '4호선']);
    const r0 = await rectOf(x, '#nmTtSheet'); const sx = (r0.left + r0.right) / 2;
    let m = await drag(x, [sx, r0.top + 20], [sx, r0.top - 60], 6); await m.up(); await x.page.clock.runFor(300);
    const r1 = await rectOf(x, '#nmTtSheet'); assert(r1 && Math.abs(r1.top - r0.top) < 2, '위로 끌어도 그대로 ' + JSON.stringify([r0, r1]));
    const lr = await rectOf(x, '#nmTtLines');
    m = await drag(x, [lr.left + 20, lr.top + 8], [lr.left + 260, lr.top + 14], 8); await m.up(); await x.page.clock.runFor(300);
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('nmTtSheet')), true, '가로 끌기는 닫지 않는다');
    await x.ctx.close();
  });
  await t('밀어 닫기(시트): 목록이 위로 스크롤된 상태에서는 아래로 끌어도 스크롤이 우선(닫히지 않음), 맨 위에서는 닫힌다', async () => {
    const x = await fresh(); await openSubway(x); await openTt(x, '서울역', ['1호선', '4호선']);
    await x.page.evaluate(() => { document.getElementById('nmTtBody').scrollTop = 400; });
    const br = await rectOf(x, '#nmTtBody'); const sx = (br.left + br.right) / 2;
    let m = await drag(x, [sx, br.top + 40], [sx, br.top + 260], 10); await m.up(); await x.page.clock.runFor(300);
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('nmTtSheet')), true, '스크롤 중에는 안 닫힘');
    await x.page.evaluate(() => { document.getElementById('nmTtBody').scrollTop = 0; });
    m = await drag(x, [sx, br.top + 40], [sx, br.top + 300], 10); await m.up(); await x.page.clock.runFor(400);
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('nmTtSheet')), false, '맨 위에서는 닫힘');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('밀어 닫기: 칩 위에서 시작해 끌어 내려도 그 칩이 눌리지 않는다(요일 칩이 바뀌지 않음)', async () => {
    const x = await fresh(); await openSubway(x); await openTt(x, '서울역', ['1호선', '4호선']);
    const before = await x.page.evaluate(() => document.querySelector('#nmTtDays .on').innerText);
    const cr = await rectOf(x, '#nmTtDays button:not(.on)'); const cx = (cr.left + cr.right) / 2;
    const askedN = x.asked.length;
    const m = await drag(x, [cx, cr.top + 6], [cx, cr.top + 30], 3, 10); await x.page.clock.runFor(30);
    const mid = await rectOf(x, '#nmTtSheet'); assert(mid, '끄는 중');
    await m.move(cx, cr.top + 240); await x.page.clock.runFor(16); await m.up(); await x.page.clock.runFor(400);
    assert.strictEqual(x.asked.length, askedN, '칩이 눌려 다시 묻지 않아야 한다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('밀어 닫기(역 팝업): 팝업도 아래로 밀면 닫히고, 그냥 버튼을 누르는 건 그대로 동작', async () => {
    const x = await fresh(); await openSubway(x); await pop(x, '서울역', ['1호선', '4호선']); await x.page.clock.runFor(100);
    const r0 = await rectOf(x, '#svgStationPop'); const sx = (r0.left + r0.right) / 2;
    const m = await drag(x, [sx, r0.top + 8], [sx, r0.top + 220], 8); await m.up(); await x.page.clock.runFor(400);
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('svgStationPop')), false, '팝업 닫힘');
    await pop(x, '서울역', ['1호선']); await x.page.clock.runFor(100);
    await x.page.evaluate(() => document.getElementById('nmTtOpenBtn').click()); await x.page.clock.runFor(100); await settle(x);
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('nmTtSheet')), true, '버튼 클릭은 그대로');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('밀어 닫기(네이티브 노선도): 닫으면 지도 사각형이 다시 넓어진다', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x); await x.page.clock.runFor(1500);
    await x.page.evaluate(() => window.__nmEmit('station', { name: '서울역', x: 195, y: 300 })); await x.page.clock.runFor(600);
    await x.page.evaluate(() => document.getElementById('nmTtOpenBtn').click()); await x.page.clock.runFor(100); await settle(x); await x.page.clock.runFor(900);
    const small = await x.page.evaluate(() => { const r = window.__nm.filter(c => c.m === 'setRect').pop(); return r && r.a && (r.a.height || r.a.h); });
    const r0 = await rectOf(x, '#nmTtSheet'); const sx = (r0.left + r0.right) / 2;
    const m = await drag(x, [sx, r0.top + 14], [sx, r0.top + 260], 8); await m.up(); await x.page.clock.runFor(1200);
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('nmTtSheet')), false);
    const big = await x.page.evaluate(() => { const r = window.__nm.filter(c => c.m === 'setRect').pop(); return r && r.a && (r.a.height || r.a.h); });
    assert(small && big && big > small + 100, '지도가 다시 커진다 ' + small + ' → ' + big);
    await x.ctx.close();
  });

  // ── 캐릭터 놀이터 ──
  const ALL = ['dolsom', 'lovel', 'dudung', 'sul', 'ppopu', 'chaeng'];
  await t('놀이터: 시간표를 열면 시트 상단 띠에 캐릭터 2~3마리(서로 다른 6종 중 무작위)가 나오고, 시간이 지나면 움직인다', async () => {
    const x = await fresh(); await openSubway(x); await openTt(x, '서울역', ['1호선', '4호선']);
    await x.page.waitForFunction(() => !!window._RC.playState(), null, { timeout: 8000 }).catch(() => {});
    for (let i = 0; i < 40 && !(await x.page.evaluate(() => !!window._RC.playState())); i++) { await new Promise(r => setTimeout(r, 50)); await x.page.clock.runFor(50); }
    const s0 = await x.page.evaluate(() => window._RC.playState()); assert(s0, '놀이터가 시작돼야 한다');
    assert(s0.length >= 2 && s0.length <= 3, '마릿수 ' + s0.length);
    assert.strictEqual(new Set(s0.map(c => c.id)).size, s0.length, '서로 다른 캐릭터');
    s0.forEach(c => assert(ALL.includes(c.id), c.id));
    const host = await rectOf(x, '#nmTtPlay'), sh = await rectOf(x, '#nmTtSheet');
    // 2026-10-14 16:07 (YJ): 시트 맨 위 큰 공백(손잡이~제목)을 없애고, 놀이터는 역명 줄의 빈 칸(제목과 ✕ 사이)에 둔다
    const ttl = await rectOf(x, '#nmTtTitle'), xb = await rectOf(x, '#nmTtX'), hd = await rectOf(x, '.nmp-handle');
    assert(host && host.h >= 40 && host.right - host.left >= 90, '놀이터 크기 ' + JSON.stringify(host));
    assert(host.left >= ttl.right - 1 && host.right <= xb.left + 1, '제목 오른쪽·✕ 왼쪽 사이 ' + JSON.stringify([ttl.right, host.left, host.right, xb.left]));
    assert(Math.abs((host.top + host.bottom) / 2 - (ttl.top + ttl.bottom) / 2) < 8, '역명과 같은 줄');
    assert(ttl.top - hd.bottom < 30, '손잡이와 제목 사이가 비어 있지 않다 ' + (ttl.top - hd.bottom) + 'px');
    assert.strictEqual(await x.page.evaluate(() => getComputedStyle(document.getElementById('nmTtPlay')).pointerEvents), 'none', '터치를 가로채지 않는다');
    // 그림이 실제로 그려진다 — file:// 의 캔버스는 픽셀을 읽을 수 없으므로(오염) 캔버스가 놀이터 띠 안에 크기를 갖고 보이는지로 확인
    await x.page.clock.runFor(600);
    const cv = await x.page.evaluate(() => [...document.querySelectorAll('#nmTtPlay canvas')].map(c => { const r = c.getBoundingClientRect(), cs = getComputedStyle(c); return { w: c.width, h: c.height, rw: r.width, rh: r.height, vis: cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0 }; }));
    assert(cv.length >= 1 && cv.every(c => c.w > 0 && c.h > 0 && c.rw > 20 && c.rh > 20 && c.vis), '캐릭터 캔버스 ' + JSON.stringify(cv));
    // 움직임: 3초 동안 x 가 바뀌고 범위 안이다
    const seen = {}; let moved = 0; let prev = s0.map(c => c.x);
    for (let i = 0; i < 60; i++) { await x.page.clock.runFor(50); const s = await x.page.evaluate(() => window._RC.playState()); s.forEach((c, k) => { seen[c.st] = 1; assert(c.x >= -2 && c.x <= host.right - host.left + 2, '범위 안 ' + c.x); if (Math.abs(c.x - prev[k]) > 0.3) moved++; prev[k] = c.x; }); }
    assert(moved > 20, '움직인다 ' + moved);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('놀이터: 걷기·콩콩·빙글·쉬기 같은 여러 놀이 동작이 섞여 나온다', async () => {
    const x = await fresh(); await openSubway(x); await openTt(x, '서울역', ['1호선', '4호선']);
    for (let i = 0; i < 40 && !(await x.page.evaluate(() => !!window._RC.playState())); i++) { await new Promise(r => setTimeout(r, 50)); await x.page.clock.runFor(50); }
    const seen = {}, dirs = {};
    for (let i = 0; i < 400; i++) { await x.page.clock.runFor(50); const s = await x.page.evaluate(() => window._RC.playState()); s.forEach(c => { seen[c.st] = 1; dirs[c.dir] = 1; }); }
    assert(seen.walk && (seen.hop || seen.spin || seen.rest), '동작 종류 ' + Object.keys(seen));
    assert(Object.keys(seen).length >= 3, '동작 ' + Object.keys(seen));
    assert(dirs[1] && dirs[-1], '좌우로 방향을 바꾼다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('놀이터: 열 때마다 캐릭터 조합이 달라진다(무작위) · 닫으면 멈추고 그림도 사라진다', async () => {
    const x = await fresh(); await openSubway(x); const sets = new Set(), seenIds = new Set();
    for (let k = 0; k < 8; k++) {
      await openTt(x, '서울역', ['1호선', '4호선']);
      for (let i = 0; i < 40 && !(await x.page.evaluate(() => !!window._RC.playState())); i++) { await new Promise(r => setTimeout(r, 40)); await x.page.clock.runFor(40); }
      const ids = await x.page.evaluate(() => (window._RC.playState() || []).map(c => c.id).sort().join(','));
      sets.add(ids); ids.split(',').forEach(i => seenIds.add(i));
      await x.page.evaluate(() => nmTtClose()); await x.page.clock.runFor(100);
      assert.strictEqual(await x.page.evaluate(() => window._RC.playState()), null, '닫으면 멈춤');
      assert.strictEqual(await x.page.evaluate(() => document.querySelectorAll('canvas.rc-play').length), 0, '캔버스 제거');
    }
    assert(sets.size >= 3, '조합이 다양하다 ' + [...sets].join(' | '));
    assert(seenIds.size >= 4, '여러 종류가 나온다 ' + [...seenIds]);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('놀이터: 시간표 조작(요일·방향 탭, 표 스크롤)과 겹치지 않는다 — 띠가 터치를 막지 않는다', async () => {
    const x = await fresh(); await openSubway(x); await openTt(x, '서울역', ['1호선', '4호선']);
    await click(x, '[data-nmtt-dk]', 1);
    const s = await sheet(x); assert(/방면/.test(s.dirs[1] || '') && s.sum, JSON.stringify(s.dirs));
    const el = await x.page.evaluate(() => { const r = document.getElementById('nmTtPlay').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e && (e.id || e.className); });
    assert(!/rc-play/.test(String(el)), '띠 위를 눌러도 캔버스가 받지 않는다: ' + el);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  // ── 장면(배경 그라데이션) · 행동 ──
  await t('놀이터 장면: 8가지 배경이 있고 다크/파스텔 두 벌 — 다크는 어둡고 파스텔은 밝다', async () => {
    const x = await fresh(); await openSubway(x);
    const sc = await x.page.evaluate(() => ({ order: window._RC.sceneOrder, s: window._RC.scenes }));
    assert(sc.order.length >= 8, '장면 수 ' + sc.order.length);
    const hex = (h) => { const n = parseInt(h.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
    sc.order.forEach(k => { const S = sc.s[k]; assert(S.p.length === 3 && S.d.length === 3, k); assert(S.p.reduce((a, c) => a + hex(c), 0) / 3 > 0.6, k + ' 파스텔은 밝다'); assert(S.d.reduce((a, c) => a + hex(c), 0) / 3 < 0.4, k + ' 다크는 어둡다'); });
    assert.strictEqual(new Set(sc.order.map(k => sc.s[k].p.join())).size, sc.order.length, '배경이 서로 다르다');
    await x.ctx.close();
  });
  await t('놀이터 장면: 열 때마다 장면이 달라지고(무작위) 시트에 data-scene 이 붙는다 · 강제 지정도 된다', async () => {
    const x = await fresh(); await openSubway(x); const seen = new Set();
    for (let k = 0; k < 12; k++) {
      await openTt(x, '서울역', ['1호선']);
      for (let i = 0; i < 40 && !(await x.page.evaluate(() => !!window._RC.playScene())); i++) { await new Promise(r => setTimeout(r, 40)); await x.page.clock.runFor(40); }
      const sn = await x.page.evaluate(() => [window._RC.playScene(), document.getElementById('nmTtPlay').getAttribute('data-scene')]);
      assert(sn[0] && sn[0] === sn[1], JSON.stringify(sn)); seen.add(sn[0]);
      await x.page.evaluate(() => nmTtClose()); await x.page.clock.runFor(100);
    }
    assert(seen.size >= 3, '장면 종류 ' + [...seen]);
    await x.page.evaluate(() => { window._rcScene = 'snow'; }); await openTt(x, '서울역', ['1호선']);
    for (let i = 0; i < 40 && !(await x.page.evaluate(() => !!window._RC.playScene())); i++) { await new Promise(r => setTimeout(r, 40)); await x.page.clock.runFor(40); }
    assert.strictEqual(await x.page.evaluate(() => window._RC.playScene()), 'snow');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('놀이터 장면: 장면에 따라 행동이 다르다 — 밤은 쉬는 시간이 많고, 눈·꽃잎은 콩콩·빙글이 많다', async () => {
    const meas = async (scene) => {
      const x = await fresh(); await openSubway(x); await x.page.evaluate((s) => { window._rcScene = s; }, scene);
      await openTt(x, '서울역', ['1호선']);
      for (let i = 0; i < 40 && !(await x.page.evaluate(() => !!window._RC.playState())); i++) { await new Promise(r => setTimeout(r, 40)); await x.page.clock.runFor(40); }
      const cnt = { walk: 0, hop: 0, spin: 0, rest: 0 }; let tot = 0;
      for (let i = 0; i < 1500; i++) { await x.page.clock.runFor(60); const st = await x.page.evaluate(() => window._RC.playState()); (st || []).forEach(c => { cnt[c.st]++; tot++; }); }
      assert.deepStrictEqual(x.errs, []); await x.ctx.close();
      return { rest: cnt.rest / tot, play: (cnt.hop + cnt.spin) / tot };
    };
    const night = await meas('night'), snow = await meas('snow');
    assert(night.rest > snow.rest + 0.1, '쉬기 night ' + night.rest.toFixed(2) + ' vs snow ' + snow.rest.toFixed(2));
    assert(snow.play > night.play + 0.1, '콩콩·빙글 snow ' + snow.play.toFixed(2) + ' vs night ' + night.play.toFixed(2));
  });
  await t('놀이터 장면: 테마를 바꿔도(다크↔파스텔) 계속 돌고 오류가 없다 · 그리기는 가벼워야 한다(1회 평균 8ms 미만)', async () => {
    const x = await fresh(); await openSubway(x); await x.page.evaluate(() => { window._rcScene = 'aurora'; window._rcPerf = { ms: 0, n: 0 }; });
    await openTt(x, '서울역', ['1호선']);
    for (let i = 0; i < 40 && !(await x.page.evaluate(() => !!window._RC.playState())); i++) { await new Promise(r => setTimeout(r, 40)); await x.page.clock.runFor(40); }
    await x.page.evaluate(() => applyTheme('dark')); await x.page.clock.runFor(1000);
    await x.page.evaluate(() => applyTheme('pastel')); await x.page.clock.runFor(1000);
    const pf = await x.page.evaluate(() => window._rcPerf); assert(pf.n > 20, '그려졌다 ' + pf.n); assert(pf.ms / pf.n < 8, '평균 ' + (pf.ms / pf.n).toFixed(2) + 'ms');
    assert(await x.page.evaluate(() => !!window._RC.playState()));
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('놀이터: 개·고양이 시트 3장이 새 렌더링(다리가 몸에 붙음)으로 교체되어 있다 — 기준선이 시트와 맞는다', async () => {
    const x = await fresh(); await x.page.waitForTimeout(100);
    const cfg = await x.page.evaluate(() => { const d = window._RC.d3; return { dolsom: d.dolsom, lovel: d.lovel, ppopu: d.ppopu }; });
    assert(cfg.dolsom.base === 248.5 && cfg.dolsom.ox === 120.8 && cfg.ppopu.ox === 120.3 && cfg.lovel.base === 249.5, JSON.stringify(cfg));
    await x.ctx.close();
  });

  await b.close();
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
