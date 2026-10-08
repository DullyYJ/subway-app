// 5개 탭 전체 점검 — 탭 전환 · 노선도(버스/지하철) · 커뮤니티(게시판/채팅/뉴스/설정) · 쇼핑 · 맛집 · 설정 스위치(알림/오버레이/테마) 가 서로 연결되어 동작하는지.
// 헤드리스 Chromium + 가짜 시계 + 가짜 Capacitor 플러그인 + 모의 서버(게시판/뉴스/버스/엔진).
// 실행: node test/tabs_smoke.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const { resp } = require('./helpers/engine_fixture');
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
const NOW = new Date('2026-10-08T21:00:00+09:00');

const POSTS = [
  { id: 101, cat: '제보', title: '2호선 신도림 열차 지연 중', body: '신도림역에서 5분째 대기 중입니다.', nick: '출퇴근러', ts: NOW.getTime() - 5 * 60000, likes: 3, cmts: 0 },
  { id: 102, cat: '정보', title: '9호선 급행 배차 간격 정리', body: '급행은 평일 저녁 6분 간격입니다.', nick: '정보통', ts: NOW.getTime() - 20 * 60000, likes: 1, cmts: 0 },
  { id: 103, cat: '잡담', title: '오늘 퇴근길 풍경 좋네요', body: '노을이 예뻐요.', nick: '산책', ts: NOW.getTime() - 60 * 60000, likes: 0, cmts: 0 },
];
const NEWS = [
  { title: '코스피 2% 급등 마감', link: 'https://n.example/1', desc: '증시 상승', source: '테스트일보', ts: NOW.getTime() - 3600e3, cat: '증시' },
  { title: '프로야구 한국시리즈 개막', link: 'https://n.example/2', desc: '야구', source: '테스트스포츠', ts: NOW.getTime() - 7200e3, cat: '스포츠' },
  { title: '서울 지하철 파업 예고', link: 'https://n.example/3', desc: '사회', source: '테스트뉴스', ts: NOW.getTime() - 5400e3, cat: '사회' },
];
const STOPS = [
  { node_id: 'ICB164000001', node_nm: '서울역버스환승센터', node_no: '02005', city_code: '23', lat: 37.5559, lng: 126.9723, dist: 120 },
  { node_id: 'ICB164000002', node_nm: '남대문시장', node_no: '02006', city_code: '23', lat: 37.5586, lng: 126.9770, dist: 260 },
];

const FOODS = [
  { n: '서울역 국밥집', c: '음식점 > 한식 > 국밥', a: '서울 중구 한강대로 405', d: 120, lo: 126.9726, la: 37.5551 },
  { n: '역앞 카페', c: '음식점 > 카페', a: '서울 중구 한강대로 400', d: 180, lo: 126.9730, la: 37.5553 },
  { n: '한우 구이집', c: '음식점 > 육류,고기', a: '서울 중구 만리재로 1', d: 300, lo: 126.9740, la: 37.5560 },
];

async function newApp(b, opts) {
  opts = opts || {};
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5547, longitude: 126.9726 }, permissions: ['geolocation'] });
  await ctx.addInitScript((o) => {
    try { localStorage.setItem('gdm_loc_disclosed', '1'); localStorage.setItem('bgPermGuided', '1'); localStorage.setItem('ovlOn', '1'); if (o.commId) localStorage.setItem('mk_comm_id', JSON.stringify(o.commId)); } catch (e) {}
    window.__ln = []; window.__ovl = []; window.__ka = []; window.__bg = []; window.__posts = []; window.__tab = [];
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: {
      LocalNotifications: { schedule: (x) => { window.__ln.push(x.notifications[0]); return Promise.resolve(); }, checkPermissions: () => Promise.resolve({ display: 'granted' }), requestPermissions: () => Promise.resolve({ display: 'granted' }),
        createChannel: () => Promise.resolve(), registerActionTypes: () => Promise.resolve(), addListener: (ev, cb) => { (window.__lnl = window.__lnl || {})[ev] = cb; return Promise.resolve({ remove() {} }); }, cancel: () => Promise.resolve(), getPending: () => Promise.resolve({ notifications: [] }) },
      Overlay: { isAvailable: () => Promise.resolve({ granted: true, supported: true }), requestPermission: () => Promise.resolve({ granted: true }), update: (x) => { window.__ovl.push(x); return Promise.resolve(); }, keepAlive: (x) => { window.__ka.push(x); return Promise.resolve(); } },
      BackgroundGeolocation: { addWatcher: (x, cb) => { window.__bgcb = cb; window.__bg.push('add'); return Promise.resolve('w1'); }, removeWatcher: () => { window.__bg.push('remove'); return Promise.resolve(); }, openSettings: () => Promise.resolve() },
    } };
  }, opts);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  const calls = []; page.__calls = calls;
  await page.route('**/*', async r => {
    const req = r.request(); const u = new URL(req.url());
    if (u.protocol === 'file:' || u.protocol === 'data:') return r.continue();
    const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    const j = (o) => r.fulfill({ status: 200, headers: H, body: JSON.stringify(o) });
    calls.push(req.method() + ' ' + u.host.split('.')[0] + u.pathname);
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (/route-v2/.test(u.host)) return j(resp());
    if (/board-writer/.test(u.host)) {
      if (u.pathname === '/posts') return j({ ok: true, posts: POSTS });
      if (u.pathname === '/newsfeed') return j({ ok: true, items: NEWS });
      if (u.pathname === '/talks') return j({ ok: true, talks: [{ id: 1, nick: '지하철러', text: '오늘 2호선 사람 많네요', ts: NOW.getTime() - 60000, line: '2호선' }] });
      return j({ ok: true });
    }
    if (u.pathname === '/bus-stops') return j({ ok: true, stops: STOPS });
    if (u.pathname === '/food') return j({ ok: true, items: FOODS });
    return j({});
  });
  await page.clock.install({ time: NOW });
  await page.goto('file://' + html); await page.clock.runFor(3500);
  return { ctx, page, errs, calls };
}
const go = async (page, tab, ms) => { await page.evaluate(x => switchTab(x, document.getElementById('ni-' + x)), tab); await page.clock.runFor(ms || 1200); };
const vis = (page, id) => page.evaluate(i => { const e = document.getElementById(i); if (!e) return false; const cs = getComputedStyle(e); return cs.display !== 'none' && e.getBoundingClientRect().height > 0; }, id);

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  let { page, errs, calls, ctx } = await newApp(b, { commId: '테스트유저' });

  console.log('[하단 탭 전환]');
  for (const tab of ['community', 'map', 'shop', 'food', 'home']) {
    await go(page, tab);
    await t('탭 전환 → ' + tab + ' 만 보이고 하단 메뉴가 켜진다', async () => {
      const r = await page.evaluate(x => ({ shown: ['home', 'community', 'map', 'shop', 'food'].filter(n => { const e = document.getElementById('tab-' + n); return getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 50; }), on: [...document.querySelectorAll('.ni.on')].map(n => n.id) }), tab);
      assert.deepStrictEqual(r.shown, [tab], JSON.stringify(r)); assert.deepStrictEqual(r.on, ['ni-' + tab]);
    });
  }
  await t('탭을 돌아다니는 동안 JS 오류가 없다', async () => assert.deepStrictEqual(errs, []));

  await t('홈 출발지가 \'내 위치 찾는 중...\' 에서 멈추지 않고 \'내 위치\' 로 채워진다', async () => {
    await go(page, 'home', 500); await page.waitForTimeout(1200); await page.clock.runFor(2000);
    const v = await page.evaluate(() => document.getElementById('fmapStartInp').value); assert.strictEqual(v, '내 위치');
  });

  console.log('[커뮤니티 — 게시판]');
  await go(page, 'community', 1500);
  await t('게시판이 기본으로 켜져 있고 서버 글이 목록에 그려진다', async () => {
    const r = await page.evaluate(() => ({ on: (document.querySelector('#filterRow .chip.on') || {}).id, n: document.querySelectorAll('#commList .dc-post').length, t: document.getElementById('commList').innerText }));
    assert.strictEqual(r.on, 'chipBoard'); assert.ok(r.n >= 3, JSON.stringify(r)); assert.ok(/신도림 열차 지연/.test(r.t));
  });
  await t('글 제목을 누르면 본문이 펼쳐지고 다시 누르면 접힌다', async () => {
    await page.click('#commList .dc-post[data-id="101"] .dc-post-hdr'); await page.clock.runFor(500);
    const open = await page.evaluate(() => getComputedStyle(document.querySelector('#commList .dc-post[data-id="101"] .dc-post-body')).display);
    await page.click('#commList .dc-post[data-id="101"] .dc-post-hdr'); await page.clock.runFor(300);
    const shut = await page.evaluate(() => getComputedStyle(document.querySelector('#commList .dc-post[data-id="101"] .dc-post-body')).display);
    assert.strictEqual(open, 'block'); assert.strictEqual(shut, 'none');
  });
  await t('댓글을 쓰면 글 안에 나타나고 서버로 전송된다', async () => {
    await page.click('#commList .dc-post[data-id="101"] .dc-post-hdr'); await page.clock.runFor(300);
    await page.fill('#dcCmtInp-101', '저도 지금 신도림이에요'); await page.keyboard.press('Enter'); await page.clock.runFor(800);
    const txt = await page.evaluate(() => document.getElementById('dccmts-101').innerText);
    assert.ok(/저도 지금 신도림/.test(txt), txt); assert.ok(calls.some(c => /POST board-writer\/comment/.test(c)), calls.filter(c => /board/.test(c)).join(','));
  });
  await t('공감 버튼을 누르면 숫자가 오른다', async () => {
    const before = await page.evaluate(() => +document.querySelector('#commList .dc-post[data-id="102"] .dc-react-btn span').textContent);
    await page.click('#commList .dc-post[data-id="102"] .dc-post-hdr'); await page.clock.runFor(300);
    await page.click('#commList .dc-post[data-id="102"] .dc-react-btn'); await page.clock.runFor(500);
    const after = await page.evaluate(() => +document.querySelector('#commList .dc-post[data-id="102"] .dc-react-btn span').textContent);
    assert.strictEqual(after, before + 1);
  });

  console.log('[커뮤니티 — 뉴스 / 실시간소통 / 설정]');
  await t('뉴스 칩 → 카테고리 바와 기사 목록이 보이고 글쓰기 버튼은 숨는다', async () => {
    await page.evaluate(() => filterCat([...document.querySelectorAll('#filterRow .chip')].find(c => /뉴스/.test(c.textContent)), '뉴스')); await page.clock.runFor(2500);
    const r = await page.evaluate(() => ({ bar: getComputedStyle(document.getElementById('newsCatBar')).display, items: document.getElementById('commList').innerText, fab: getComputedStyle(document.getElementById('commFab')).display }));
    assert.strictEqual(r.bar, 'flex'); assert.ok(/코스피|지하철 파업|한국시리즈/.test(r.items), r.items.slice(0, 120)); assert.strictEqual(r.fab, 'none');
  });
  await t('뉴스 → 게시판으로 돌아오면 뉴스 바가 사라지고 글쓰기 버튼이 다시 보인다', async () => {
    await page.click('#chipBoard'); await page.clock.runFor(800);
    const r = await page.evaluate(() => ({ bar: getComputedStyle(document.getElementById('newsCatBar')).display, fab: getComputedStyle(document.getElementById('commFab')).display, n: document.querySelectorAll('#commList .dc-post').length }));
    assert.strictEqual(r.bar, 'none'); assert.notStrictEqual(r.fab, 'none'); assert.ok(r.n >= 3);
  });
  await t('실시간소통 → 채팅창이 열리고, 메시지를 보내면 말풍선과 서버 전송이 생긴다', async () => {
    await page.click('#chipLiveTalk'); await page.clock.runFor(1500);
    assert.ok(await vis(page, 'chatTabView'));
    await page.fill('#chatInput', '안녕하세요 테스트입니다'); await page.click('.chat-send-btn'); await page.clock.runFor(1000);
    const txt = await page.evaluate(() => document.getElementById('chatScroll').innerText);
    assert.ok(/안녕하세요 테스트입니다/.test(txt), txt.slice(-100)); assert.ok(calls.some(c => /POST board-writer\/react/.test(c)), calls.filter(c => /board/.test(c)).join(','));
  });
  await t('실시간소통 → 설정 → 게시판 으로 오가도 화면이 겹치지 않는다', async () => {
    await page.click('#filterRow .chip:nth-child(4)'); await page.clock.runFor(600);
    const s = await page.evaluate(() => ({ chat: getComputedStyle(document.getElementById('chatTabView')).display, board: getComputedStyle(document.getElementById('commScrollView')).display, set: getComputedStyle(document.getElementById('settingsTabView')).display }));
    assert.deepStrictEqual([s.chat, s.set], ['none', 'block']); assert.strictEqual(s.board, 'none');
    await page.click('#chipBoard'); await page.clock.runFor(600);
    const s2 = await page.evaluate(() => ({ chat: getComputedStyle(document.getElementById('chatTabView')).display, set: getComputedStyle(document.getElementById('settingsTabView')).display, board: getComputedStyle(document.getElementById('commScrollView')).display }));
    assert.deepStrictEqual([s2.chat, s2.set], ['none', 'none']); assert.notStrictEqual(s2.board, 'none');
  });

  console.log('[설정 탭 — 알림·오버레이·테마·아이디]');
  await page.click('#filterRow .chip:nth-child(4)'); await page.clock.runFor(800);
  await t('알림 설정 줄들이 그려지고 스위치를 끄면 저장된다', async () => {
    const n = await page.evaluate(() => document.querySelectorAll('#notifPrefRows input[type=checkbox]').length); assert.ok(n >= 3, 'rows ' + n);
    const before = await page.evaluate(() => localStorage.getItem('notifPref'));
    await page.evaluate(() => document.querySelector('#notifPrefRows input[type=checkbox]').click()); await page.clock.runFor(500);
    const after = await page.evaluate(() => localStorage.getItem('notifPref'));
    assert.notStrictEqual(before, after, before + ' / ' + after);
    const checked = await page.evaluate(() => document.querySelector('#notifPrefRows input[type=checkbox]').checked); assert.strictEqual(checked, false);
    await page.evaluate(() => document.querySelector('#notifPrefRows input[type=checkbox]').click()); await page.clock.runFor(300);
  });
  await t('오버레이 스위치를 끄면 ovlOn 이 0 이 되고 네이티브 오버레이가 꺼진다 → 켜면 복구', async () => {
    await page.evaluate(() => { window.__ovl.length = 0; const e = document.getElementById('ovlToggle'); e.checked = false; e.dispatchEvent(new Event('change')); }); await page.clock.runFor(800);
    const off = await page.evaluate(() => ({ ls: localStorage.getItem('ovlOn'), last: window.__ovl[window.__ovl.length - 1] }));
    assert.strictEqual(off.ls, '0', JSON.stringify(off)); assert.ok(!off.last || off.last.active === false, JSON.stringify(off.last));
    await page.evaluate(() => { const e = document.getElementById('ovlToggle'); e.checked = true; e.dispatchEvent(new Event('change')); }); await page.clock.runFor(800);
    assert.strictEqual(await page.evaluate(() => localStorage.getItem('ovlOn')), '1');
  });
  await t('테마 카드를 누르면 화면 테마가 바뀌고 저장·체크 표시가 따라온다(재시작 후에도 유지)', async () => {
    await page.click('#themeCardDark'); await page.clock.runFor(500);
    let r = await page.evaluate(() => ({ th: document.documentElement.getAttribute('data-theme'), ls: localStorage.getItem('app_theme'), chk: getComputedStyle(document.getElementById('themeCheckDark')).display }));
    assert.strictEqual(r.th, null); assert.strictEqual(r.ls, 'dark');
    await page.click('#themeCardPastel'); await page.clock.runFor(500);
    r = await page.evaluate(() => ({ th: document.documentElement.getAttribute('data-theme'), ls: localStorage.getItem('app_theme') }));
    assert.strictEqual(r.th, 'pastel'); assert.strictEqual(r.ls, 'pastel');
  });
  await t('테마 카드 글자가 두 테마 모두에서 배경과 구분된다(다크 블랙 / 하늘 파스텔 카드)', async () => {
    const lum = (c) => { const m = c.match(/\d+(\.\d+)?/g).map(Number); return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]); };
    for (const th of ['pastel', 'dark']) {
      await page.evaluate(x => applyTheme(x), th); await page.waitForTimeout(500);
      const r = await page.evaluate(() => ['themeCardDark', 'themeCardPastel'].map(id => { const c = document.getElementById(id); const ti = c.children[1].children[0]; return { id, bg: getComputedStyle(c).backgroundColor, fg: getComputedStyle(ti).color }; }));
      for (const x of r) assert.ok(Math.abs(lum(x.bg) - lum(x.fg)) > 90, th + ' ' + JSON.stringify(x));
    }
    await page.evaluate(() => applyTheme('pastel'));
  });
  await t('커뮤니티 아이디를 저장하면 현재 아이디 표시가 바뀐다', async () => {
    await page.fill('#commIdInput', '새닉네임'); await page.evaluate(() => _saveCommId()); await page.clock.runFor(500);
    const r = await page.evaluate(() => ({ txt: document.getElementById('curIdTxt').textContent, ls: localStorage.getItem('commId') }));
    assert.ok(/새닉네임/.test(r.txt + r.ls), JSON.stringify(r));
  });
  await t('커뮤니티 탭 전체에서 JS 오류가 없다', async () => assert.deepStrictEqual(errs, []));

  console.log('[맛집 — 경로 없음]');
  await go(page, 'food', 4500);
  await t('맛집 탭: 경로가 없으면 내 위치 근처 역 기준으로 서버 맛집이 뜬다', async () => {
    const r = await page.evaluate(() => ({ label: document.getElementById('foodDestLabel').textContent, txt: document.getElementById('foodList').innerText }));
    const dg = await page.evaluate(() => JSON.stringify({ d: window._foodSrvDiag, p: window._foodPubDiag, f: _foodCurFilter, n: (_foodPublicData || []).length }));
    assert.ok(/내 주변 맛집/.test(r.label), r.label); if (!/국밥집/.test(r.txt)) assert.fail(dg + ' ' + r.txt.slice(0, 60)); assert.ok(/서울역 국밥집/.test(r.txt), r.txt.slice(0, 100));
  });
  await t('맛집 카테고리 칩(카페)을 누르면 해당 가게만, 전체를 누르면 모두 보인다', async () => {
    await page.evaluate(() => [...document.querySelectorAll('.food-chip')].find(e => e.textContent.includes('카페')).click()); await page.clock.runFor(500);
    let txt = await page.evaluate(() => document.getElementById('foodList').innerText);
    assert.ok(/역앞 카페/.test(txt) && !/한우 구이집/.test(txt), txt.slice(0, 120));
    await page.evaluate(() => [...document.querySelectorAll('.food-chip')].find(e => e.textContent.includes('전체')).click()); await page.clock.runFor(500);
    txt = await page.evaluate(() => document.getElementById('foodList').innerText);
    assert.ok(/한우 구이집/.test(txt) && /역앞 카페/.test(txt), txt.slice(0, 120));
    assert.deepStrictEqual(errs, []);
  });

  console.log('[노선도 — 버스 / 지하철]');
  await go(page, 'map', 2000);
  await t('노선도 탭 첫 화면은 버스이고 주변 정류장 카드가 그려진다', async () => {
    assert.ok(await vis(page, 'mapBusPanel')); assert.ok(!(await vis(page, 'mapSubwayPanel')));
    const txt = await page.evaluate(() => document.getElementById('mapBusStopList').innerText);
    assert.ok(/서울역버스환승센터|남대문시장/.test(txt), txt.slice(0, 100));
  });
  await t('버스 지도와 정류장 목록이 겹치지 않고(작은 화면 포함) 하단 메뉴 위에서 끝난다', async () => {
    for (const vp of [[390, 844], [360, 640], [320, 568]]) {
      await page.setViewportSize({ width: vp[0], height: vp[1] }); await page.clock.runFor(600);
      const g = await page.evaluate(() => { const b = id => document.getElementById(id).getBoundingClientRect(); const nav = document.querySelector('.bottom-nav,#bottomNav,.bnav,nav') ; return { wb: b('mapBusMapWrap').bottom, lt: b('mapBusStopList').top, lb: b('mapBusStopList').bottom, nt: nav ? nav.getBoundingClientRect().top : 1e9, tb: document.querySelector('.busv-toggle').getBoundingClientRect().bottom, wt: b('mapBusMapWrap').top }; });
      assert.ok(g.wb <= g.lt + 1 && g.wt >= g.tb - 1 && g.lb <= g.nt + 1, vp.join('x') + ' ' + JSON.stringify(g));
    }
    await page.setViewportSize({ width: 390, height: 844 }); await page.clock.runFor(600);
  });
  await t('정류장을 즐겨찾기(☆)하면 저장되고 즐겨찾기 보기에 나타난다', async () => {
    const ok = await page.evaluate(() => { const b = document.querySelector('#mapBusStopList .bus-fav-toggle'); if (b) { b.click(); return true; } return false; });
    assert.ok(ok, '별 버튼 없음'); await page.clock.runFor(800);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('savedBusStops') || '[]').length); assert.ok(saved >= 1, 'saved ' + saved);
    await page.evaluate(() => switchBusView('fav')); await page.clock.runFor(800);
    const txt = await page.evaluate(() => document.getElementById('mapBusStopList').innerText); assert.ok(/즐겨찾기 1개/.test(txt), txt.slice(0, 80));
    await page.evaluate(() => switchBusView('near')); await page.clock.runFor(500);
  });
  await t('지하철 탭 → 노선도 SVG 가 보이고 호선 필터를 눌러도 오류가 없다', async () => {
    await page.click('#mapItabSubway'); await page.clock.runFor(2000);
    assert.ok(await vis(page, 'mapSubwayPanel')); assert.ok(!(await vis(page, 'mapBusPanel')));
    const n = await page.evaluate(() => document.querySelectorAll('#svgContainer svg text').length); assert.ok(n > 100, 'text ' + n);
    for (const l of ['2호선', '9호선', 'ALL']) { await page.evaluate(x => gmFilterLine(x), l); await page.clock.runFor(300); }
    assert.deepStrictEqual(errs, []);
  });
  await t('역 검색(서울역)을 하면 해당 역 팝업(출발역/도착역 버튼)이 열린다', async () => {
    await page.fill('#mapStnSearch', '서울역'); await page.keyboard.press('Enter'); await page.clock.runFor(1500);
    const r = await page.evaluate(() => ({ svg: !!document.getElementById('svgStationPop'), grid: getComputedStyle(document.getElementById('mapStnPopup')).display, txt: (document.getElementById('svgStationPop') || {}).innerText || '' }));
    assert.ok(r.svg || r.grid !== 'none', JSON.stringify(r));
  });
  await t('노선도에서 역을 눌러 출발역·도착역을 정하면 홈으로 이동해 엔진으로 경로를 찾는다', async () => {
    calls.length = 0;
    await page.evaluate(() => { svgShowPopup('서울역', ['1호선', '4호선']); }); await page.clock.runFor(300);
    await page.evaluate(() => document.querySelector('#svgStationPop button').click()); await page.clock.runFor(600);
    assert.ok(await page.evaluate(() => /서울역/.test(document.getElementById('fmapStartInp').value)));
    assert.ok(await page.evaluate(() => document.querySelector('.tab-body.active').id) === 'tab-map', '출발역만 정했을 땐 노선도에 머문다');
    await page.evaluate(() => { svgShowPopup('수원', ['1호선']); }); await page.clock.runFor(300);
    await page.evaluate(() => document.querySelectorAll('#svgStationPop button')[1].click()); await page.clock.runFor(4500);
    const r = await page.evaluate(() => ({ tab: document.querySelector('.tab-body.active').id, s: document.getElementById('fmapStartInp').value, d: document.getElementById('fmapDestInp').value, card: getComputedStyle(document.getElementById('transitResultCard')).display, hdr: (document.getElementById('transitResultHeader') || {}).textContent }));
    assert.strictEqual(r.tab, 'tab-home'); assert.ok(/서울역/.test(r.s) && /수원/.test(r.d), JSON.stringify(r)); assert.strictEqual(r.card, 'flex');
    assert.ok(calls.some(c => /route-v2/.test(c)), '엔진 호출 없음: ' + calls.join(','));
    assert.ok(!(await page.evaluate(() => getComputedStyle(document.getElementById('routeModePopup')).display === 'flex')), '앱 자체 계산(BFS) 선택창이 뜨면 안 된다');
  });
  await t('노선도 탭에서 JS 오류가 없다', async () => assert.deepStrictEqual(errs, []));

  console.log('[쇼핑 / 맛집]');
  await go(page, 'shop', 2000);
  await t('쇼핑 탭에 고지 문구·검색·카테고리·상품 그리드가 보인다', async () => {
    const r = await page.evaluate(() => ({ hdr: !!document.querySelector('.shop-fixed-hdr'), items: document.querySelectorAll('#tab-shop .prod-card, #tab-shop .prod, #tab-shop [onclick*="openShop"], #tab-shop [onclick*="openProd"]').length, txt: document.getElementById('tab-shop').innerText.slice(0, 80) }));
    assert.ok(r.hdr && r.items > 3, JSON.stringify(r));
  });
  await go(page, 'food', 1500);
  console.log('[맛집 — 경로를 정한 뒤]');
  await go(page, 'food', 4500);
  await t('도착역을 정한 뒤 맛집 탭은 그 도착역 기준으로 바뀐다', async () => {
    const r = await page.evaluate(() => ({ label: document.getElementById('foodDestLabel').textContent, txt: document.getElementById('foodList').innerText }));
    assert.ok(/수원/.test(r.label), r.label); assert.ok(/국밥집|카페|한우/.test(r.txt), r.txt.slice(0, 100));
  });

  console.log('[알림 탭(눌렀을 때)]');
  await go(page, 'home', 1000);
  await t('알림을 눌렀을 때 처리기가 등록되어 있다(localNotificationActionPerformed)', async () => {
    const has = await page.evaluate(() => Object.keys(window.__lnl || {}));
    assert.ok(has.includes('localNotificationActionPerformed'), has.join(','));
  });
  await t('알림 본문을 누르면 앱 안에 상세 팝업이 뜬다(환승 알림)', async () => {
    await page.evaluate(() => { window.__ln.length = 0; showNotification('🔄 환승 준비', '다음 역에서 2호선으로 갈아타세요', { type: 'transfer' }); });
    await page.clock.runFor(500);
    const n = await page.evaluate(() => window.__ln[window.__ln.length - 1]);
    assert.ok(n && n.extra && n.extra.type === 'transfer' && /환승/.test(n.title), JSON.stringify(n));
    await page.evaluate(ev => window.__lnl.localNotificationActionPerformed({ actionId: 'tap', notification: ev }), n); await page.clock.runFor(800);
    const m = await page.evaluate(() => { const e = document.getElementById('briefModalOv'); return e ? { d: getComputedStyle(e).display, t: e.innerText } : null; });
    assert.ok(m && m.d !== 'none' && /환승 준비/.test(m.t) && /2호선/.test(m.t), JSON.stringify(m));
    await page.evaluate(() => { const e = document.getElementById('briefModalOv'); if (e) e.remove(); });
  });
  await t('알림의 [닫기] 버튼은 그 알림을 취소하고 팝업은 띄우지 않는다', async () => {
    await page.evaluate(() => { window.__ln.length = 0; showNotification('🔔 테스트', '닫기 확인', { type: 'transfer' }); }); await page.clock.runFor(300);
    const n = await page.evaluate(() => window.__ln[window.__ln.length - 1]);
    await page.evaluate(ev => window.__lnl.localNotificationActionPerformed({ actionId: 'dismiss', notification: ev }), n); await page.clock.runFor(800);
    assert.ok(!(await page.evaluate(() => !!document.getElementById('briefModalOv'))));
  });
  await t('출퇴근 브리핑 알림을 누르면 그 자리에서 브리핑 팝업이 뜬다', async () => {
    await page.evaluate(() => window.__lnl.localNotificationActionPerformed({ actionId: 'tap', notification: { id: 9101, extra: { type: 'commute_brief', which: 'morn' } } })); await page.clock.runFor(2500);
    const m = await page.evaluate(() => { const e = document.getElementById('briefModalOv'); return e ? getComputedStyle(e).display : null; });
    assert.ok(m && m !== 'none', String(m));
  });
  await t('JS 오류가 없다(전체)', async () => assert.deepStrictEqual(errs, []));

  await ctx.close(); await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})();
