// 역 시간표 화면 시험 — 2026-10-14
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
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 500)); } };
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

  await t('기존 팝업: 출발역·도착역 버튼이 0·1번 그대로, 시간표는 그 뒤(2번)', async () => {
    const x = await fresh(); await openSubway(x); await pop(x, '서울역', ['1호선', '4호선']);
    const r = await x.page.evaluate(() => [...document.querySelectorAll('#svgStationPop button')].map(b => b.innerText));
    assert.deepStrictEqual(r, ['🚉 출발역', '🏁 도착역', '🕒 시간표']);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('시간표 버튼 → 팝업은 사라지고 시트가 뜬다. 엔진에는 op=timetable·노선·역·baseMs 만 묻는다', async () => {
    const x = await fresh(); await openSubway(x); await openTt(x, '서울역', ['1호선', '4호선']);
    const s = await sheet(x);
    assert(s && /서울역 시간표/.test(s.title), JSON.stringify(s));
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('svgStationPop')), false);
    assert.deepStrictEqual(x.asked.map(q => q.line), ['1호선', '4호선'], '이 역의 모든 노선을 한 번에 묻는다'); const q = x.asked[0];
    assert.strictEqual(q.op, 'timetable'); assert.strictEqual(q.line, '1호선'); assert.strictEqual(q.from, '서울역'); assert(Number(q.baseMs) > 1.7e12);
    assert(!('day' in q), '처음엔 요일을 지정하지 않고 엔진이 정한 오늘을 쓴다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('본문: 시(時)별로 묶이고, 다음 열차(13시 이후 첫 열차)가 강조되며 요약에 첫차·막차·다음 열차가 나온다', async () => {
    const x = await fresh(); await openSubway(x); await openTt(x, '서울역', ['1호선', '4호선']);
    const s = await sheet(x);
    const want = W.ntAnswer(nt, { op: 'timetable', line: '1호선', from: '서울역', baseMs: NOW.getTime() });
    const d0 = want.dirs[0];
    assert(/^첫차 \d\d:\d\d · 막차 \d\d:\d\d · 다음 열차 13:\d\d$/.test(s.sum), s.sum);
    assert.strictEqual(s.next, String(d0.nextMin % 60).padStart(2, '0'));
    assert(/^13:/.test(s.sum.split('다음 열차 ')[1]) && Number(s.sum.slice(-2)) === d0.nextMin % 60, s.sum + ' vs ' + d0.nextMin);
    assert(s.nextBg === 'rgb(10, 132, 255)', '강조 색 ' + s.nextBg);
    const hours = await x.page.evaluate(() => [...document.querySelectorAll('#nmTtBody > div > div:first-child')].map(n => n.innerText.split('\n')[0]));
    assert(hours.length > 15 && hours[0] === '05시' || hours[0] === '06시', hours.join());
    assert(hours.includes('13시') && hours.includes('00시'), '13시·(자정 넘은) 00시 행: ' + hours.join());
    const n24 = await x.page.evaluate(() => [...document.querySelectorAll('#nmTtBody > div')].filter(r => /익일/.test(r.innerText)).length);
    assert(n24 >= 1, '자정 넘은 열차는 "익일" 표시');
    const grey = await x.page.evaluate(() => { const sp = [...document.querySelectorAll('#nmTtBody span')].filter(n => n.id !== 'nmTtNext' && /^\d\d$/.test(n.innerText)); const dim = sp.filter(n => getComputedStyle(n).color === 'rgb(85, 85, 85)').length; return [dim, sp.length]; });
    assert(grey[0] > 20 && grey[0] < grey[1], '지난 열차만 흐리게 ' + grey);
    // 개수: 화면에 그려진 분 칩 수 = 엔진 times 수
    const cnt = await x.page.evaluate(() => [...document.querySelectorAll('#nmTtBody span')].filter(n => /^\d\d$/.test(n.innerText)).length);
    assert.strictEqual(cnt, d0.times.length);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('방향 탭: "OO 방면"(엔진이 준 이름) 두 개, 누르면 그 방향 시각으로 바뀐다(다시 묻지 않음)', async () => {
    const x = await fresh(); await openSubway(x); await openTt(x, '서울역', ['1호선']);
    const want = W.ntAnswer(nt, { op: 'timetable', line: '1호선', from: '서울역', baseMs: NOW.getTime() });
    let s = await sheet(x);
    assert.deepStrictEqual(s.dirs, want.dirs.map(d => d.toward + ' 방면'));
    const before = s.sum; const n = x.asked.length;
    await click(x, '[data-nmtt-dk]', 1);
    s = await sheet(x);
    assert.notStrictEqual(s.sum, before); assert.strictEqual(x.asked.length, n, '방향만 바꿀 땐 새로 묻지 않는다');
    assert(s.sum.indexOf(String(want.dirs[1].nextMin % 60).padStart(2, '0')) > 0, s.sum);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('요일 칩: 평일·토일공휴일(오늘 표시). 일요일 탭 → day=SUN 으로 묻고, 오늘이 아니니 "다음 열차"·강조 없음', async () => {
    const x = await fresh(); await openSubway(x); await openTt(x, '서울역', ['1호선']);
    let s = await sheet(x);
    assert.deepStrictEqual(s.days, ['평일 · 오늘', '토·일·공휴일']);
    await click(x, '[data-nmtt-day]', 1);
    assert.strictEqual(x.asked[x.asked.length - 1].day, 'SUN');
    s = await sheet(x);
    assert.deepStrictEqual(s.days, ['평일 · 오늘', '토·일·공휴일']);
    assert(!/다음 열차/.test(s.sum) && s.next === null, s.sum + ' / ' + s.next);
    await click(x, '[data-nmtt-day]', 0);                       // 평일로 돌아오면 캐시(1분 안)라 다시 묻지 않는다
    const n = x.asked.length; s = await sheet(x);
    assert(/다음 열차/.test(s.sum) && s.next !== null); assert.strictEqual(x.asked.length, n);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('노선 탭: 두 노선 이상이면 탭이 생기고, 공식 시각표 자료가 없는 노선은 지어내지 않고 안내만 한다', async () => {
    const x = await fresh(); await openSubway(x); await openTt(x, '서울역', ['1호선', '신분당선']);
    let s = await sheet(x);
    assert.deepStrictEqual(s.lines, ['1호선', '신분당선']);
    assert.deepStrictEqual(x.asked.map(q => q.line), ['1호선', '신분당선'], '처음에 이 역의 모든 노선을 한 번에 묻는다');
    const n0 = x.asked.length;
    await click(x, '[data-nmtt-line]', 1);
    assert.strictEqual(x.asked.length, n0, '노선 탭 전환은 새로 묻지 않는다 ' + JSON.stringify(x.asked));
    s = await sheet(x);
    assert(/공식 시각표 자료가 없어/.test(s.body), s.body);
    assert.deepStrictEqual(s.dirs, []); assert.strictEqual(s.sum, '');
    await click(x, '[data-nmtt-line]', 0);
    s = await sheet(x); assert(/다음 열차/.test(s.sum));
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('서버가 실패하면 안내 + "다시 시도" — 누르면 다시 묻고 성공하면 표가 나온다', async () => {
    const x = await fresh({ failN: 1 }); await openSubway(x); await openTt(x, '서울역', ['1호선']);
    let s = await sheet(x);
    assert(/불러오지 못했어요/.test(s.body), s.body);
    await x.page.evaluate(() => document.getElementById('nmTtRetry').click()); await x.page.clock.runFor(100); await settle(x); await x.page.clock.runFor(300);
    s = await sheet(x); assert.strictEqual(x.asked.length, 2); assert(/다음 열차/.test(s.sum), s.sum);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('응답이 6초 안에 안 오면 실패 안내, 늦게 닫아도 오류 없음', async () => {
    const x = await fresh(); await openSubway(x);
    await x.page.evaluate(() => { window.__fetch0 = window.fetch; window.fetch = (u, o) => /next-train/.test(String(u)) ? new Promise(() => {}) : window.__fetch0(u, o); });
    await pop(x, '서울역', ['1호선']); await x.page.clock.runFor(200);
    await x.page.evaluate(() => document.getElementById('nmTtOpenBtn').click()); await x.page.clock.runFor(300);
    assert(/불러오는 중/.test((await sheet(x)).body));
    await x.page.clock.runFor(6500);
    assert(/불러오지 못했어요/.test((await sheet(x)).body));
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('닫기: ✕ · 시트 바깥 누르기 · (늦게 온 응답은 무시)', async () => {
    const x = await fresh(); await openSubway(x); await openTt(x, '서울역', ['1호선']);
    await x.page.evaluate(() => document.getElementById('nmTtX').click()); await x.page.clock.runFor(200);
    assert.strictEqual(await sheet(x), null);
    await openTt(x, '서울역', ['1호선']); await x.page.clock.runFor(900);
    await x.page.mouse.click(195, 60); await x.page.clock.runFor(300);              // 시트 위쪽 바깥(지도)
    assert.strictEqual(await sheet(x), null);
    // 열자마자 닫기 → 응답이 늦게 와도 시트가 다시 생기지 않는다
    await openTt(x, '서울역', ['1호선']);
    await x.page.evaluate(() => { nmTtClose(); }); await x.page.clock.runFor(1000);
    assert.strictEqual(await sheet(x), null);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('시트 안을 누르면(탭 전환 등) 닫히지 않는다', async () => {
    const x = await fresh(); await openSubway(x); await openTt(x, '서울역', ['1호선', '신분당선']); await x.page.clock.runFor(900);
    const box = await x.page.evaluate(() => { const r = document.querySelector('#nmTtSheet [data-nmtt-line]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await x.page.mouse.click(box[0] + 100, box[1]); await x.page.clock.runFor(400);
    assert(await sheet(x), '시트 안 누름으로 닫히면 안 된다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('네이티브 노선도: 역 누름 → 팝업 → 시간표 시트. 시트가 뜨면 지도 사각형이 시트 위까지로 줄고, 지도를 만지면(gesture) 시트가 닫히고 되돌아온다', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x);
    await x.page.evaluate(() => window.__nm.length = 0);
    await x.page.evaluate(() => window.__nmEmit('station', { name: '서울역', x: 195, y: 300 })); await x.page.clock.runFor(600);
    assert(await x.page.evaluate(() => !!document.getElementById('svgStationPop')));
    await x.page.evaluate(() => document.getElementById('nmTtOpenBtn').click()); await x.page.clock.runFor(100); await settle(x); await x.page.clock.runFor(800);
    const s = await sheet(x); assert(s && /서울역 시간표/.test(s.title) && /다음 열차/.test(s.sum), JSON.stringify(s));
    const top = await x.page.evaluate(() => document.getElementById('nmTtSheet').getBoundingClientRect().top);
    const rects = (await x.page.evaluate(() => window.__nm.filter(c => c.m === 'setRect' || c.m === 'show'))).map(c => c.a);
    const last = rects[rects.length - 1];
    assert(last && Math.abs((last.y + last.h) - top) < 2, '지도 아래 끝 ' + (last && (last.y + last.h)) + ' / 시트 위 ' + top);
    await x.page.evaluate(() => window.__nmEmit('gesture', {})); await x.page.clock.runFor(700);
    assert.strictEqual(await sheet(x), null, '지도를 만지면 시트가 닫힌다');
    const r2 = (await x.page.evaluate(() => window.__nm.filter(c => c.m === 'setRect' || c.m === 'show'))).map(c => c.a);
    const gv = await x.page.evaluate(() => { const g = document.getElementById('gmSvgView').getBoundingClientRect(); return g.bottom; });
    const l2 = r2[r2.length - 1]; assert(Math.abs((l2.y + l2.h) - gv) < 2, '닫힌 뒤 지도 영역 복원 ' + (l2.y + l2.h) + ' vs ' + gv);
    assert.strictEqual((await x.page.evaluate(() => window.__nm.filter(c => c.m === 'snapshot'))).length, 0, '시트는 사진으로 가리지 않고 영역을 줄여 피한다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('웹 노선도의 실제 SVG 역 글자를 눌러도 시간표까지 간다(예전 경로 그대로)', async () => {
    const x = await fresh(); await openSubway(x);
    const ok = await x.page.evaluate(() => {
      const el = [...document.querySelectorAll('#svgContainer svg text')].find(e => svgExtractName(e).replace(/\s+/g, '') === '서울역');
      if (!el) return false; el.dispatchEvent(new MouseEvent('click', { bubbles: true })); return true;
    });
    assert(ok, '서울역 글자를 찾지 못했다'); await x.page.clock.runFor(300);
    assert(await x.page.evaluate(() => !!document.getElementById('svgStationPop')));
    await x.page.evaluate(() => document.getElementById('nmTtOpenBtn').click()); await x.page.clock.runFor(100); await settle(x); await x.page.clock.runFor(400);
    const s = await sheet(x); assert(s && /서울역 시간표/.test(s.title) && s.lines.length >= 2, JSON.stringify(s));
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await b.close();
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
