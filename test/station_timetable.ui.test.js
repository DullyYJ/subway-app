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
          setRect: (a) => rec('setRect', a), follow: (a) => rec('follow', a), hide: () => rec('hide'), destroy: () => rec('destroy'), setFilter: (a) => rec('setFilter', a), fit: () => rec('fit'),
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
    const probe = await x.page.evaluate(() => { const p = document.createElement('i'); p.style.cssText = 'background:var(--blue);color:var(--nmp-past)'; document.body.appendChild(p); const c = getComputedStyle(p); const r = { blue: c.backgroundColor, past: c.color }; p.remove(); return r; });
    assert(s.nextBg === probe.blue, '강조 색은 테마 파란색(--blue)이어야 한다: ' + s.nextBg + ' vs ' + probe.blue);
    const hours = await x.page.evaluate(() => [...document.querySelectorAll('#nmTtBody > div > div:first-child')].map(n => n.innerText.split('\n')[0]));
    assert(hours.length > 15 && hours[0] === '05시' || hours[0] === '06시', hours.join());
    assert(hours.includes('13시') && hours.includes('00시'), '13시·(자정 넘은) 00시 행: ' + hours.join());
    const n24 = await x.page.evaluate(() => [...document.querySelectorAll('#nmTtBody > div')].filter(r => /익일/.test(r.innerText)).length);
    assert(n24 >= 1, '자정 넘은 열차는 "익일" 표시');
    const grey = await x.page.evaluate((pastCol) => { const sp = [...document.querySelectorAll('#nmTtBody span')].filter(n => n.id !== 'nmTtNext' && /^\d\d$/.test(n.innerText)); const dim = sp.filter(n => getComputedStyle(n).color === pastCol).length; return [dim, sp.length]; }, probe.past);
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
    assert(/시간표 자료를\s*아직 받지 못했어요/.test(s.body), s.body);
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

  await t('닫기: 시트 바깥 누르기 · 밀어 내리기 · (늦게 온 응답은 무시) — ✕ 버튼은 없다', async () => {
    const x = await fresh(); await openSubway(x); await openTt(x, '서울역', ['1호선']);
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('nmTtX')), false, '✕ 버튼은 없다');
    await x.page.evaluate(() => nmTtClose()); await x.page.clock.runFor(700);
    assert.strictEqual(await sheet(x), null);
    await openTt(x, '서울역', ['1호선']); await x.page.clock.runFor(900);
    await x.page.mouse.click(195, 60); await x.page.clock.runFor(700);              // 시트 위쪽 바깥(지도)
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

  await t('부드러운 시트: 올라올 때 · 내려갈 때 시트는 transform 애니메이션이고, 네이티브 지도는 크기를 프레임(150ms 틱)마다 바꾸지 않고 한 번에 곡선·시간(anim,e1~e4)과 함께 받는다', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x);
    await x.page.evaluate(() => window.__nmEmit('station', { name: '서울역', x: 195, y: 300 })); await x.page.clock.runFor(600);
    await x.page.evaluate(() => window.__nm.length = 0);
    await x.page.evaluate(() => document.getElementById('nmTtOpenBtn').click()); await x.page.clock.runFor(30);
    const an = await x.page.evaluate(() => { const s = document.getElementById('nmTtSheet'); return s ? { n: s.getAnimations().length, tf: (s.getAnimations()[0] && s.getAnimations()[0].effect.getKeyframes().map(k => k.transform)) } : null; });
    assert(an && an.n >= 1 && /translateY\(\d+(\.\d+)?px\)/.test(an.tf[0]) && /translateY\(0px\)/.test(an.tf[1]), '열 때 transform 애니메이션 ' + JSON.stringify(an));
    await x.page.clock.runFor(1200);
    const op = (await x.page.evaluate(() => window.__nm.filter(c => c.m === 'setRect'))).map(c => c.a);
    assert.strictEqual(op.length, 1, '시트가 올라오는 동안 지도 사각형은 한 번만 바뀐다(틱마다 X): ' + op.length);
    assert(op[0].anim === 320 && op[0].e1 === 0.2 && op[0].e2 === 0 && op[0].e3 === 0 && op[0].e4 === 1, '열기 곡선 ' + JSON.stringify(op[0]));
    const top = await x.page.evaluate(() => document.getElementById('nmTtSheet').getBoundingClientRect().top);
    assert(Math.abs(op[0].y + op[0].h - top) < 2, '지도 끝 = 시트 멈춘 자리');
    assert.strictEqual(await x.page.evaluate(() => document.getElementById('nmTtSheet').style.transform), '', '다 올라온 뒤 transform 이 남지 않는다');
    // 손가락으로 끌어내려도 지도는 그대로(틱마다 크기를 바꾸지 않음)
    await x.page.evaluate(() => { window.__nm.length = 0; const s = document.getElementById('nmTtSheet'); s.style.transform = 'translateY(120px)'; });
    await x.page.clock.runFor(600);
    assert.strictEqual((await x.page.evaluate(() => window.__nm.filter(c => c.m === 'setRect'))).length, 0, '끄는 동안 지도 사각형 변경 없음');
    await x.page.evaluate(() => { document.getElementById('nmTtSheet').style.transform = ''; window.__nm.length = 0; });
    await x.page.evaluate(() => nmTtClose());
    await x.page.clock.runFor(10);
    const cl = await x.page.evaluate(() => { const s = document.getElementById('nmTtSheet'); return s ? { closing: !!s._nmClosing, n: s.getAnimations().length, pe: s.style.pointerEvents } : null; });
    assert(cl && cl.closing && cl.pe === 'none', '내려가는 동안 시트가 남아 있다 ' + JSON.stringify(cl));
    await x.page.clock.runFor(600);
    assert.strictEqual(await sheet(x), null, '다 내려가면 시트가 사라진다');
    const rc = (await x.page.evaluate(() => window.__nm.filter(c => c.m === 'setRect'))).map(c => c.a);
    const gv = await x.page.evaluate(() => document.getElementById('gmSvgView').getBoundingClientRect().bottom);
    assert.strictEqual(rc.length, 1, '내려갈 때도 지도 사각형 변경은 한 번 ' + rc.length);
    assert(rc[0].anim === 240 && rc[0].e1 === 0.4 && rc[0].e3 === 0.2 && Math.abs(rc[0].y + rc[0].h - gv) < 2, '닫기 곡선·복원 ' + JSON.stringify(rc[0]));
    // 내려가는 중에 다른 역 시간표를 열면 옛 시트는 바로 치운다(시트 둘이 겹치지 않는다)
    await openTt(x, '서울역', ['1호선']); await x.page.clock.runFor(500);
    await x.page.evaluate(() => nmTtClose()); await x.page.clock.runFor(20);
    await x.page.evaluate(() => nmTtOpen('시청', ['1호선'])); await x.page.clock.runFor(30);
    assert.strictEqual(await x.page.evaluate(() => document.querySelectorAll('#nmTtSheet').length), 1, '시트는 하나');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('지도가 시트 위쪽 끝을 따라간다: 열기(tFrom→tTo, 팝업에서 올 땐 fullH) · 끌 때(follow 로 보이는 끝만) · 놓아 닫기(손가락 자리에서 tFrom) · 놓아 제자리(180ms 되돌림) — 역 팝업·시간표 시트 모두', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x);
    const nm = (m) => x.page.evaluate((m) => window.__nm.filter(c => c.m === m).map(c => c.a), m);
    const reset = () => x.page.evaluate(() => { window.__nm.length = 0; });
    const geo = (id) => x.page.evaluate((id) => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, h: e.offsetHeight, vh: innerHeight, l: r.left, w: r.width }; }, id);
    // ① 팝업에서 시간표를 열면: fullH(지도 전체 높이)에서 시작해 시트 위쪽 끝(vh → vh−H)을 따라 줄어든다
    await x.page.evaluate(() => window.__nmEmit('station', { name: '서울역', x: 195, y: 300 })); await x.page.clock.runFor(600);
    await reset();
    await x.page.evaluate(() => document.getElementById('nmTtOpenBtn').click()); await x.page.clock.runFor(60); await settle(x); await x.page.clock.runFor(900);
    let sr = await nm('setRect'); let g = await geo('nmTtSheet');
    assert.strictEqual(sr.length, 1, '열 때 setRect 한 번 ' + sr.length);
    assert(sr[0].tFrom === g.vh && Math.abs(sr[0].tTo - (g.vh - g.h)) < 1 && sr[0].fullH > sr[0].h, '열기: 시트 위쪽 끝 길 + 전체 높이 ' + JSON.stringify(sr[0]) + ' vh=' + g.vh + ' H=' + g.h);
    // ② 손가락으로 시트를 끌어내림 → follow(보이는 끝만), 지도 사각형(setRect)은 그대로
    await reset();
    const hx = g.l + g.w / 2, hy = g.top + 14;
    await x.page.mouse.move(hx, hy); await x.page.mouse.down(); await x.page.mouse.move(hx, hy + 40, { steps: 3 }); await x.page.clock.runFor(40);
    await x.page.mouse.move(hx, hy + 120, { steps: 4 }); await x.page.clock.runFor(40);
    let fl = await nm('follow');
    assert(fl.length >= 2, '끄는 동안 follow ' + fl.length);
    assert.strictEqual((await nm('setRect')).length, 0, '끄는 동안 setRect 없음');
    const lastF = fl[fl.length - 1];
    assert(Math.abs(lastF.bottom - (g.vh - g.h + 120 - 8)) < 40 && lastF.bottom > fl[0].bottom - 1, '지도 보이는 끝이 시트 위쪽 끝(' + (g.vh - g.h + 112) + ')을 따라 내려간다 ' + JSON.stringify(fl.map(f => Math.round(f.bottom))));
    assert(lastF.h > g.top, 'follow 는 전체 크기 사각형 ' + JSON.stringify(lastF));
    // ②-1 조금만 끌고 놓으면 제자리 — 지도도 180ms 곡선으로 되돌림
    await x.page.mouse.move(hx, hy + 30, { steps: 3 }); await x.page.clock.runFor(30); await reset();
    await x.page.mouse.up(); await x.page.clock.runFor(400);
    sr = await nm('setRect');
    assert.strictEqual(sr.length, 1, '제자리 setRect 한 번 ' + sr.length);
    assert(sr[0].anim === 180 && sr[0].e3 === 0.58 && Math.abs(sr[0].tTo - (g.vh - g.h)) < 1 && sr[0].tFrom > sr[0].tTo && Math.abs(sr[0].y + sr[0].h - (g.vh - g.h)) < 2, '되돌림 ' + JSON.stringify(sr[0]));
    assert(await sheet(x), '조금만 끌면 닫히지 않는다');
    // ③ 많이 끌고 놓으면 닫힘 — 손가락 자리(tFrom = 멈춘 자리 + dy)에서 이어 내려가고 지도는 전체로
    await reset();
    g = await geo('nmTtSheet');
    await x.page.mouse.move(hx, g.top + 14); await x.page.mouse.down(); await x.page.mouse.move(hx, g.top + 14 + 220, { steps: 6 }); await x.page.clock.runFor(40);
    await reset(); await x.page.mouse.up(); await x.page.clock.runFor(900);
    sr = await nm('setRect');
    assert.strictEqual(sr.length, 1, '닫힘 setRect 한 번 ' + sr.length);
    const gvb = await x.page.evaluate(() => document.getElementById('gmSvgView').getBoundingClientRect().bottom);
    assert(sr[0].anim === 240 && sr[0].tFrom > g.vh - g.h + 150 && sr[0].tTo === g.vh + 40 && Math.abs(sr[0].y + sr[0].h - gvb) < 2, '닫기 ' + JSON.stringify(sr[0]));
    assert.strictEqual(await sheet(x), null, '시트가 사라진다');
    // ④ 역 팝업: 끌면 follow, 놓아 닫으면 같은 방식, 바깥 눌러 닫아도 같은 방식
    await x.page.evaluate(() => window.__nmEmit('station', { name: '서울역', x: 195, y: 300 })); await x.page.clock.runFor(600);
    g = await geo('svgStationPop'); assert(g, '팝업');
    await reset();
    const px = g.l + g.w / 2, py = g.top + 14;
    await x.page.mouse.move(px, py); await x.page.mouse.down(); await x.page.mouse.move(px, py + 160, { steps: 6 }); await x.page.clock.runFor(40);
    fl = await nm('follow'); assert(fl.length >= 2, '팝업 끌기 follow ' + fl.length);
    assert.strictEqual((await nm('setRect')).length, 0, '팝업 끌기 중 setRect 없음');
    await reset(); await x.page.mouse.up(); await x.page.clock.runFor(900);
    sr = await nm('setRect');
    assert(sr.length === 1 && sr[0].anim === 240 && sr[0].tFrom > g.top + 100 && sr[0].tTo === g.vh + 40, '팝업 닫기 ' + JSON.stringify(sr));
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('svgStationPop')), false, '팝업이 사라진다');
    await x.page.evaluate(() => window.__nmEmit('station', { name: '시청', x: 195, y: 300 })); await x.page.clock.runFor(1000);
    await reset();
    await x.page.mouse.click(195, 60); await x.page.clock.runFor(20);
    const mid = await x.page.evaluate(() => { const p = document.getElementById('svgStationPop'); return p ? { closing: !!p._nmClosing, n: p.getAnimations().length } : null; });
    assert(mid && mid.closing, '바깥을 누르면 내려가는 중 ' + JSON.stringify(mid));
    await x.page.clock.runFor(700);
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('svgStationPop')), false);
    assert(!(await x.page.evaluate(() => window.__nm.some(c => c.m === 'follow'))), '바깥 누름엔 follow 없음');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('역 팝업이 열릴 때도 올라온다: 팝업 transform 애니메이션 + 지도 보이는 끝이 팝업 위쪽 끝을 따라감(tFrom=vh → tTo=vh−H, 320ms), 이미 팝업이 떠 있으면 바로 바꾼다', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x);
    await x.page.evaluate(() => { window.__nm.length = 0; });
    await x.page.evaluate(() => window.__nmEmit('station', { name: '서울역', x: 195, y: 300 })); await x.page.clock.runFor(40);
    const an = await x.page.evaluate(() => { const p = document.getElementById('svgStationPop'); return p ? { n: p.getAnimations().length, tf: p.getAnimations()[0] && p.getAnimations()[0].effect.getKeyframes().map(k => k.transform) } : null; });
    assert(an && an.n >= 1 && /translateY\(\d+(\.\d+)?px\)/.test(an.tf[0]) && /translateY\(0px\)/.test(an.tf[1]), '열 때 팝업 transform 애니메이션 ' + JSON.stringify(an));
    await x.page.clock.runFor(900);
    const sr = await x.page.evaluate(() => window.__nm.filter(c => c.m === 'setRect').map(c => c.a));
    const g = await x.page.evaluate(() => { const p = document.getElementById('svgStationPop'); return { h: p.offsetHeight, vh: innerHeight, top: p.getBoundingClientRect().top, tf: p.style.transform }; });
    assert.strictEqual(sr.length, 1, '팝업이 올라오는 동안 지도 사각형은 한 번만 바뀐다 ' + sr.length);
    assert(sr[0].anim === 320 && sr[0].tFrom === g.vh && Math.abs(sr[0].tTo - (g.vh - g.h)) < 1 && Math.abs(sr[0].y + sr[0].h - (g.vh - g.h)) < 2, '열기 곡선·길 ' + JSON.stringify(sr[0]));
    assert.strictEqual(g.tf, '', '다 올라온 뒤 transform 이 남지 않는다'); assert(Math.abs(g.top - (g.vh - g.h)) < 1, '제자리');
    // 다른 역을 누르면(이미 떠 있음) 올라오는 애니메이션 없이 바로 바뀐다
    await x.page.evaluate(() => { window.__nm.length = 0; });
    await x.page.evaluate(() => window.__nmEmit('station', { name: '시청', x: 195, y: 300 })); await x.page.clock.runFor(30);
    const an2 = await x.page.evaluate(() => { const p = document.getElementById('svgStationPop'); return p ? { n: p.getAnimations().length, tf: p.style.transform, nm: p.querySelector('.nmp-name').textContent } : null; });
    assert(an2 && an2.tf === '' && /시청/.test(an2.nm) && (await x.page.evaluate(() => window.__nm.filter(c => c.m === 'setRect').length)) === 0, '바로 교체(올라오지 않음, 지도도 안 움직임) ' + JSON.stringify(an2));
    assert(an2.n === 1, '교체는 작은 효과(페이드)만 ' + an2.n);
    // 내려가는 중에 다른 역을 누르면 새 팝업은 올라온다(가끔 애니메이션이 빠지던 것)
    await x.page.clock.runFor(400);
    await x.page.mouse.click(195, 60); await x.page.clock.runFor(20);
    await x.page.evaluate(() => window.__nmEmit('station', { name: '종각', x: 195, y: 300 })); await x.page.clock.runFor(30);
    const an3 = await x.page.evaluate(() => { const p = document.getElementById('svgStationPop'); return p ? { n: p.getAnimations().length, kf: p.getAnimations()[0] && p.getAnimations()[0].effect.getKeyframes().map(k => k.transform), cnt: document.querySelectorAll('#svgStationPop').length } : null; });
    assert(an3 && an3.cnt === 1 && an3.n >= 1 && /translateY\(\d{2,}/.test(an3.kf[0]), '내려가는 중 눌러도 올라온다 ' + JSON.stringify(an3));
    await x.page.clock.runFor(900);
    // 올라오는 도중 만져도(시간표 버튼) 문제없이 시트로 이어진다
    await x.page.evaluate(() => document.getElementById('nmTtOpenBtn').click()); await x.page.clock.runFor(900);
    assert(await sheet(x), '시트가 뜬다');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('역 팝업을 위로 밀면 시간표가 나온다 — 짧게 밀면 제자리, 아래로 밀면 닫힘은 그대로, 버튼 위에서 시작해도 된다', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x);
    const geo = () => x.page.evaluate(() => { const e = document.getElementById('svgStationPop'); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, l: r.left, w: r.width }; });
    const idle = () => x.page.waitForFunction(() => { const e = document.getElementById('svgStationPop'); return !e || e.getAnimations().length === 0; }, null, { timeout: 5000 });
    await x.page.evaluate(() => window.__nmEmit('station', { name: '서울역', x: 195, y: 300 })); await x.page.clock.runFor(600); await idle();
    let g = await geo(); const px = g.l + g.w / 2;
    // 짧게(30px) 위로 → 제자리, 시간표 안 열림
    await x.page.mouse.move(px, g.top + 20); await x.page.mouse.down(); await x.page.mouse.move(px, g.top - 10, { steps: 4 }); await x.page.clock.runFor(400);
    const mid = await x.page.evaluate(() => { const s = document.getElementById('nmTtSheet'); return s ? s.style.transform : null; });
    assert(/translateY\(\d+(\.\d+)?px\)/.test(mid), '밀면 시간표 시트가 아래에서 따라 올라온다 ' + mid);
    await x.page.mouse.up(); await x.page.clock.runFor(900);
    assert.strictEqual(await sheet(x), null, '짧게 밀면 시간표 안 열림(올라오던 시트는 도로 내려가 사라짐)'); assert(await geo(), '팝업 그대로');
    // 충분히(120px) 위로 → 시간표
    g = await geo();
    await x.page.mouse.move(px, g.top + 20); await x.page.mouse.down(); await x.page.mouse.move(px, g.top - 100, { steps: 6 }); await x.page.clock.runFor(300);
    await x.page.mouse.up(); await x.page.clock.runFor(100); await settle(x); await x.page.clock.runFor(900);
    const s = await sheet(x); assert(s && /서울역 시간표/.test(s.title), '위로 밀면 시간표 ' + JSON.stringify(s && s.title));
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('svgStationPop')), false, '팝업은 시트로 바뀐다');
    // 아래로 밀면 여전히 닫힘
    await x.page.evaluate(() => nmTtClose()); await x.page.clock.runFor(700);
    await x.page.evaluate(() => window.__nmEmit('station', { name: '서울역', x: 195, y: 300 })); await x.page.clock.runFor(600); await idle();
    g = await geo();
    await x.page.mouse.move(px, g.top + 20); await x.page.mouse.down(); await x.page.mouse.move(px, g.top + 200, { steps: 6 }); await x.page.clock.runFor(30);
    await x.page.mouse.up(); await x.page.clock.runFor(300);
    await x.page.waitForFunction(() => !document.getElementById('svgStationPop'), null, { timeout: 5000 }).catch(() => {}); await x.page.clock.runFor(300);
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('svgStationPop')), false, '아래로 밀면 닫힘');
    assert.strictEqual(await sheet(x), null);
    // 시간표 버튼 위에서 시작해 위로 밀어도 시간표가 한 번만 열린다
    await x.page.evaluate(() => window.__nmEmit('station', { name: '시청', x: 195, y: 300 })); await x.page.clock.runFor(600); await idle();
    const bt = await x.page.evaluate(() => { const r = document.getElementById('nmTtOpenBtn').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await x.page.mouse.move(bt[0], bt[1]); await x.page.mouse.down(); await x.page.mouse.move(bt[0], bt[1] - 140, { steps: 6 }); await x.page.clock.runFor(30);
    await x.page.mouse.up(); await x.page.clock.runFor(100); await settle(x); await x.page.clock.runFor(900);
    assert.strictEqual(await x.page.evaluate(() => document.querySelectorAll('#nmTtSheet').length), 1, '시트 하나');
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('팝업을 위로 댕기면 시간표가 손가락을 그대로 따라 올라온다: 끄는 중(시트 transform·지도 follow) · 놓아 올리기(손가락 자리에서 이어서, 지도 tFrom) · 모자라면 도로 내려감(팝업·캐릭터 그대로) · 되돌려 아래로', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x);
    const nm = (m) => x.page.evaluate((m) => window.__nm.filter(c => c.m === m).map(c => c.a), m);
    const reset = () => x.page.evaluate(() => { window.__nm.length = 0; });
    const idle = () => x.page.waitForFunction(() => { const e = document.getElementById('svgStationPop') || document.getElementById('nmTtSheet'); return !e || e.getAnimations().length === 0; }, null, { timeout: 5000 });
    const popGeo = () => x.page.evaluate(() => { const e = document.getElementById('svgStationPop'); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, l: r.left, w: r.width, h: e.offsetHeight, vh: innerHeight }; });
    const shInfo = () => x.page.evaluate(() => { const s = document.getElementById('nmTtSheet'); if (!s) return null; const m = /translateY\(([\d.]+)px\)/.exec(s.style.transform || ''); return { y: m ? parseFloat(m[1]) : 0, H: s.offsetHeight, pe: s.style.pointerEvents, op: s.style.opacity === '' ? null : parseFloat(s.style.opacity), canvas: !!s.querySelector('#nmTtPlay canvas.rc-play') }; });
    const popSt = () => x.page.evaluate(() => { const e = document.getElementById('svgStationPop'); if (!e) return null; const m = /translateY\((-?[\d.]+)px\)/.exec(e.style.transform || ''), b = /blur\(([\d.]+)px\)/.exec(e.style.filter || ''); return { up: m ? -parseFloat(m[1]) : 0, blur: b ? parseFloat(b[1]) : 0, op: e.style.opacity === '' ? 1 : parseFloat(e.style.opacity), raw: [e.style.transform, e.style.filter, e.style.opacity] }; });
    const popCanvas = () => x.page.evaluate(() => !!document.querySelector('#svgStationPop #nmPopPlay canvas.rc-play'));
    await x.page.evaluate(() => window.__nmEmit('station', { name: '서울역', x: 195, y: 300 })); await x.page.clock.runFor(600); await idle();
    await x.page.waitForFunction(() => !!document.querySelector('#svgStationPop #nmPopPlay canvas.rc-play'), null, { timeout: 5000 });
    let g = await popGeo(); const px = g.l + g.w / 2, cap = g.vh - g.h;
    // ① 위로 100px 댕김: 시트가 (H−100) 자리에서 손가락을 따라 올라오며 진해지고(투명→), 팝업은 같이 올라가며 서서히 블러·투명해진다(캐릭터는 아직 팝업에서), 지도 끝은 팝업 위쪽 끝을 따라 올라간다
    await reset();
    await x.page.mouse.move(px, g.top + 20); await x.page.mouse.down(); await x.page.mouse.move(px, g.top + 20 - 100, { steps: 5 }); await x.page.clock.runFor(300);
    let si = await shInfo();
    assert(si && Math.abs(si.y - (si.H - 100)) < 3, '시트가 손가락 위치(H−100)에 ' + JSON.stringify(si));
    assert.strictEqual(si.pe, 'none', '끄는 동안 시트는 지도 가림 판정에 끼지 않는다'); assert.strictEqual(si.canvas, false, '아직 시트 캐릭터는 시작 전(팝업에서 놀고 있음)');
    assert(await popCanvas(), '팝업 캐릭터는 그대로');
    const dk = (cap - (g.vh - si.H)) / si.H;                                        // 팝업은 시트가 다 올라왔을 때 위쪽 끝이 시트 위쪽 끝에 닿도록 올라간다
    let ps = await popSt();
    assert(ps && Math.abs(ps.up - 100 * dk) < 2 && Math.abs(ps.blur - (100 / si.H) * 8) < 0.6 && Math.abs(ps.op - Math.max(0, 1 - (100 / si.H) * 1.5)) < 0.03, '팝업이 올라가며 흐려진다 ' + JSON.stringify(ps) + ' dk=' + dk);
    assert(si.op != null && Math.abs(si.op - Math.min(1, (100 / si.H) * 1.3)) < 0.03, '시간표는 올라온 만큼 진해진다 ' + JSON.stringify(si));
    let fl = await nm('follow'); assert(fl.length >= 1, '끄는 중 follow ' + fl.length);
    assert.strictEqual((await nm('setRect')).length, 0, '끄는 중 setRect 없음');
    assert(Math.abs(fl[fl.length - 1].bottom - (cap - 100 * dk)) < 2, '지도 끝은 팝업 위쪽 끝(' + (cap - 100 * dk) + ')을 따라 ' + fl[fl.length - 1].bottom);
    // ② 더 댕김(450px — 팝업(316px)보다 높이 올라와야 지도 끝이 움직인다): 시트 위쪽 끝(vh−450)을 따라 지도 끝이 올라온다
    await x.page.mouse.move(px, g.top + 20 - 450, { steps: 5 }); await x.page.clock.runFor(300);
    si = await shInfo(); fl = await nm('follow');
    assert(Math.abs(si.y - (si.H - 450)) < 3, '450px ' + JSON.stringify(si));
    ps = await popSt();
    assert(ps.op < 0.05 && ps.blur > 6 && ps.up > 100 * dk, '많이 올리면 팝업은 거의 안 보인다 ' + JSON.stringify(ps)); assert(si.op > 0.95, '시간표는 거의 진하다 ' + si.op);
    assert(Math.abs(fl[fl.length - 1].bottom - Math.min(g.vh - 450, cap - 450 * dk)) < 3 && fl[fl.length - 1].bottom < fl[0].bottom, '지도 끝이 단조롭게 올라온다 ' + JSON.stringify(fl.map(f => Math.round(f.bottom))));
    // ③ 놓음 → 손가락 자리(H−450)에서 이어서 끝까지: 지도 setRect 한 번, tFrom=vh−450, tTo=vh−H
    await reset();
    await x.page.mouse.up(); await x.page.clock.runFor(60);
    const pan = await x.page.evaluate(() => { const e = document.getElementById('svgStationPop'); const a = e && e.getAnimations()[0]; return a ? { kf: a.effect.getKeyframes().map(k => [k.transform, k.filter, k.opacity]), closing: !!e._nmClosing } : null; });
    assert(pan && pan.closing && pan.kf[1][2] == 0 && /blur\(10px\)/.test(pan.kf[1][1]), '팝업은 끝까지 올라가며 완전히 흐려진 뒤 치워진다 ' + JSON.stringify(pan));
    const an = await x.page.evaluate(() => { const s = document.getElementById('nmTtSheet'); const a = s && s.getAnimations()[0]; return a ? a.effect.getKeyframes().map(k => k.transform) : null; });
    const aop = await x.page.evaluate(() => { const s = document.getElementById('nmTtSheet'); const a = s && s.getAnimations()[0]; return a ? a.effect.getKeyframes().map(k => k.opacity) : null; });
    assert(aop && aop[0] > 0.95 && aop[1] == 1, '시간표는 진한 채로 이어서 올라간다 ' + JSON.stringify(aop));
    assert(an && /translateY\(\d+(\.\d+)?px\)/.test(an[0]) && Math.abs(parseFloat(/([\d.]+)px/.exec(an[0])[1]) - (si.H - 450)) < 3 && /translateY\(0px\)/.test(an[1]), '손가락 자리에서 이어서 올라간다 ' + JSON.stringify(an));
    await idle(); await settle(x); await x.page.clock.runFor(900);
    const sr = await nm('setRect');
    assert.strictEqual(sr.length, 1, '지도 사각형 한 번 ' + sr.length);
    assert(Math.abs(sr[0].tFrom - Math.min(g.vh - 450, cap - 450 * dk)) < 3 && Math.abs(sr[0].tTo - (g.vh - si.H)) < 1 && sr[0].anim >= 170 && sr[0].anim <= 320 && sr[0].fullH > sr[0].h, '지도 끝 길 ' + JSON.stringify(sr[0]));
    si = await shInfo(); assert(si && si.y === 0 && si.pe === '' && si.op === null, '제자리(스타일 정리) ' + JSON.stringify(si));
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('svgStationPop')), false, '팝업은 시트로 바뀐다');
    assert.strictEqual(si.canvas, true, '시트에서 캐릭터가 이어서 논다');
    assert.strictEqual(await x.page.evaluate(() => document.querySelectorAll('canvas.rc-play').length), 1, '놀이터는 하나');
    // ④ 모자라게(40px) 댕기고 놓으면: 시트는 도로 내려가 사라지고 팝업·캐릭터는 그대로, 지도는 팝업 위쪽 끝으로
    await x.page.evaluate(() => nmTtClose()); await x.page.clock.runFor(700);
    await x.page.evaluate(() => window.__nmEmit('station', { name: '시청', x: 195, y: 300 })); await x.page.clock.runFor(600); await idle();
    await x.page.waitForFunction(() => !!document.querySelector('#svgStationPop #nmPopPlay canvas.rc-play'), null, { timeout: 5000 });
    g = await popGeo(); await reset();
    await x.page.mouse.move(px, g.top + 20); await x.page.mouse.down(); await x.page.mouse.move(px, g.top + 20 - 40, { steps: 4 }); await x.page.clock.runFor(400);
    assert(await shInfo(), '40px 댕기는 중 시트가 보인다'); assert((await popSt()).blur > 0, '팝업이 살짝 흐려진다');
    await x.page.mouse.up(); await x.page.clock.runFor(60);
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('nmTtSheet') && document.getElementById('nmTtSheet')._nmClosing), true, '도로 내려가는 중');
    await x.page.clock.runFor(900);
    assert.strictEqual(await shInfo(), null, '시트가 사라진다'); assert(await popGeo(), '팝업 그대로'); assert(await popCanvas(), '팝업 캐릭터 그대로');
    await x.page.waitForFunction(() => { const e = document.getElementById('svgStationPop'); return e && !e.style.transform && !e.style.filter && !e.style.opacity; }, null, { timeout: 5000 });   // 팝업은 또렷하게 제자리로(인라인 스타일 정리)
    assert.strictEqual(await x.page.evaluate(() => document.querySelectorAll('canvas.rc-play').length), 1, '놀이터는 하나');
    // ⑤ 위로 댕기다 되돌려 아래로 끌면: 시트는 조용히 치워지고 팝업이 손가락을 따라 내려가 닫힌다
    g = await popGeo(); await reset();
    await x.page.mouse.move(px, g.top + 20); await x.page.mouse.down(); await x.page.mouse.move(px, g.top - 60, { steps: 4 }); await x.page.clock.runFor(300);
    assert(await shInfo(), '위로 가는 중 시트');
    await x.page.mouse.move(px, g.top + 20 + 40, { steps: 6 }); await x.page.clock.runFor(100);
    assert.strictEqual(await shInfo(), null, '되돌리면 시트는 치워진다'); assert.deepStrictEqual((await popSt()).raw.slice(1), ['', ''], '팝업 블러·투명도는 곧바로 풀린다');
    await x.page.mouse.move(px, g.top + 20 + 220, { steps: 6 }); await x.page.clock.runFor(100);
    assert(/translateY\([1-9]\d+px\)/.test(await x.page.evaluate(() => document.getElementById('svgStationPop').style.transform)), '팝업이 손가락을 따라 내려간다');
    await x.page.mouse.up(); await x.page.clock.runFor(900);
    assert.strictEqual(await x.page.evaluate(() => !!document.getElementById('svgStationPop')), false, '내려서 닫힘');
    assert.strictEqual(await shInfo(), null);
    assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  await t('가끔 애니메이션(캐릭터)이 빠지던 것: 팝업을 닫자마자 다른 역을 눌러도 · 시트가 내려가는 중 팝업을 눌러도 · 팝업↔시트 오가도 새 칸에 캐릭터가 있고 놀이터는 하나', async () => {
    const x = await fresh({ plugin: true }); await openSubway(x);
    const cnt = () => x.page.evaluate(() => ({ all: document.querySelectorAll('canvas.rc-play').length, pop: !!document.querySelector('#svgStationPop #nmPopPlay canvas.rc-play'), sh: !!document.querySelector('#nmTtSheet #nmTtPlay canvas.rc-play') }));
    await x.page.evaluate(() => window.__nmEmit('station', { name: '서울역', x: 195, y: 300 })); await x.page.clock.runFor(700);
    await x.page.mouse.click(195, 60); await x.page.clock.runFor(20);                 // 닫히는 중
    await x.page.evaluate(() => window.__nmEmit('station', { name: '시청', x: 195, y: 300 })); await x.page.clock.runFor(100);
    await x.page.waitForFunction(() => !!document.querySelector('#svgStationPop #nmPopPlay canvas.rc-play'), null, { timeout: 5000 });
    await x.page.clock.runFor(900);
    let c = await cnt(); assert(c.all === 1 && c.pop, '닫자마자 눌러도 새 팝업에 캐릭터 ' + JSON.stringify(c));
    // 시트 → 닫는 중 → 팝업
    await x.page.evaluate(() => document.getElementById('nmTtOpenBtn').click()); await x.page.clock.runFor(900);
    c = await cnt(); assert(c.all === 1 && c.sh, '시트에 캐릭터 ' + JSON.stringify(c));
    await x.page.evaluate(() => nmTtClose()); await x.page.clock.runFor(20);
    await x.page.evaluate(() => window.__nmEmit('station', { name: '종각', x: 195, y: 300 })); await x.page.clock.runFor(100);
    await x.page.waitForFunction(() => !!document.querySelector('#svgStationPop #nmPopPlay canvas.rc-play'), null, { timeout: 5000 });
    await x.page.clock.runFor(900);
    c = await cnt(); assert(c.all === 1 && c.pop && !c.sh, '시트가 내려가는 중 팝업을 눌러도 ' + JSON.stringify(c));
    // 다른 칸의 늦은 정리는 지금 놀이터를 끄지 않는다
    const r = await x.page.evaluate(() => { const other = document.createElement('div'); document.body.appendChild(other); _RC.playStop(other); other.remove(); return !!_RC.playState(); });
    assert.strictEqual(r, true, '남의 칸 정리가 놀이터를 끄지 않는다');
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
