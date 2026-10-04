// 실시간소통 하단 호선 탭 화면 시험 — 헤드리스 Chromium, 서버(board-writer·engine)만 모의, 외부 요청은 전부 차단.
// 실행: node test/chat_line_tabs.ui.test.js [스크린샷 폴더]   (Playwright: /opt/node-tools/node_modules/playwright, Chromium: /opt/pw-browsers/chromium-1194)
const assert = require('assert'), path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
const shots = process.argv[2];
let pass = 0; const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.message.split('\n')[0]); process.exitCode = 1; } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  // ── 모의 서버 ──
  const rooms = {}; let seq = 100; const reacts = []; let notices = {};
  const now0 = Date.now();
  const talks = [
    { id: 'L1', nick: '지하철덕후', text: '담주 2호선 신형 열차 궁금하다', ts: now0 - 60000, line: '2호선' },
    { id: 'L2', nick: '환승의달인', text: '5호선 오늘 한산하네요', ts: now0 - 50000, line: '5호선' },
    { id: 3, nick: '옛닉', text: '노선 없는 옛 글', ts: now0 - 40000, line: null }];
  await page.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.protocol === 'file:') return route.continue();
    if (u.hostname.includes('board-writer')) {
      if (u.pathname === '/talks') return route.fulfill({ json: { ok: true, now: Date.now(), talks } });
      if (u.pathname === '/lroom') { const ln = u.searchParams.get('line'), since = +u.searchParams.get('since') || 0; return route.fulfill({ json: { ok: true, now: Date.now(), alert: { reporters: 0, stations: [] }, msgs: (rooms[ln] || []).filter(m => m.ts >= since) } }); }
      if (u.pathname === '/react') {
        const body = JSON.parse(route.request().postData() || '{}'); reacts.push(body);
        const ln = body.line; if (ln) { (rooms[ln] = rooms[ln] || []).push({ id: ++seq, kind: 'chat', nick: body.nick, text: body.text, stn: '', ts: Date.now() }); (rooms[ln]).push({ id: ++seq, kind: 'chat', nick: '칼퇴요정', text: 'ㅇㅈ 맞아요', stn: '', ts: Date.now() + 500 }); }
        return route.fulfill({ json: { ok: true, stored: true } });
      }
    }
    if (u.pathname === '/line-notices') return route.fulfill({ json: { ok: true, lines: notices } });
    return route.abort();
  });
  await page.goto('file://' + path.join(__dirname, '..', 'www', 'index.html'));
  await page.waitForTimeout(2000);
  await page.evaluate(() => { _safeLS.set(_COMM_ID_KEY, '테스터'); try { localStorage.setItem(_LOC_DISC_KEY, '1'); } catch (e) {} const o = document.getElementById('locDiscOv'); if (o) o.remove(); });   // 첫 실행 위치 안내는 사용자가 '확인'을 누른 상태로
  const openChat = () => page.evaluate(() => { switchTab('community', document.getElementById('ni-community')); showChatTab(document.getElementById('chipLiveTalk')); });
  const chips = () => page.$$eval('#chatLineChips .chat-line-chip', els => els.map(e => ({ t: e.textContent.trim(), l: e.getAttribute('data-l'), st: e.getAttribute('style') })));
  const known = await page.evaluate(() => _LR_KNOWN.slice());

  console.log('[칩 구성]');
  await page.evaluate(() => { _safeLS.set('my_lines', []); });
  await openChat(); await page.waitForTimeout(300);
  await t('내가 탄 노선이 없어도 전체 + 모든 호선 칩이 보인다(정의된 순서)', async () => {
    const c = await chips(); assert.deepStrictEqual(c.map(x => x.l), ['all'].concat(known)); assert.strictEqual(c[0].t, '전체');
    ['1호선', '9호선', '신분당선', '공항철도', '경의중앙선', '수인분당선'].forEach(n => assert.ok(c.some(x => x.l === n), n + ' 없음'));
  });
  await t('안내문구는 "내가 탄 노선은 앞에 표시돼요"로 바뀌었고 옛 문구는 없다', async () => {
    const txt = await page.$eval('#chatLineBar', e => e.textContent); assert.ok(/내가 탄 노선은 앞에 표시돼요/.test(txt)); assert.ok(!/경로 안내를 시작하면 내가 타는 노선 방이 여기 생겨요/.test(txt));
  });
  await page.evaluate(() => { _safeLS.set('my_lines', [{ l: '9호선', n: 1, t: Date.now() - 5000 }, { l: '5호선', n: 3, t: Date.now() }]); _chatBarRender(); });
  await t('my_lines 는 전체 바로 뒤 앞쪽에(많이 탄 순) 📍와 굵은 테두리로 강조된다', async () => {
    const c = await chips(); assert.deepStrictEqual(c.slice(0, 3).map(x => x.l), ['all', '5호선', '9호선']);
    assert.ok(c[1].t.startsWith('📍') && c[2].t.startsWith('📍')); assert.ok(/2px solid/.test(c[1].st)); assert.ok(!/📍/.test(c[3].t) && /1px solid/.test(c[3].st));
    assert.deepStrictEqual(c.slice(3).map(x => x.l), known.filter(l => l !== '5호선' && l !== '9호선'));
    assert.strictEqual(c.length, 1 + known.length, '칩이 중복되거나 빠짐');
  });
  await t('내가 탄 노선이 있으면 안내문구는 나오지 않는다', async () => { assert.ok(!/내가 탄 노선은 앞에 표시돼요/.test(await page.$eval('#chatLineBar', e => e.textContent))); });
  await t('칩 줄은 가로로 스크롤되고, 그 위에서 시작한 스와이프는 탭 전환으로 넘어가지 않는다', async () => {
    const m = await page.$eval('#chatLineChips', e => ({ sw: e.scrollWidth, cw: e.clientWidth, ov: getComputedStyle(e).overflowX })); assert.ok(m.sw > m.cw + 20 && /auto|scroll/.test(m.ov), JSON.stringify(m));
    assert.strictEqual(await page.evaluate(() => _swipeBlocked(document.querySelector('#chatLineChips .chat-line-chip'))), true);
  });
  if (shots) await page.screenshot({ path: path.join(shots, 'chat_all.png') });

  console.log('[전체 방]');
  await page.evaluate(() => { _ltServerPoll(); }); await page.waitForTimeout(800);
  await t('전체에는 각 호선 대화가 모이고 아이디 앞에 (N호선)이 붙는다(노선 없는 글은 그대로)', async () => {
    const nicks = await page.$$eval('#chatScroll .chat-bub-nick', els => els.map(e => e.textContent.trim()));
    assert.ok(nicks.includes('(2호선) 지하철덕후') && nicks.includes('(5호선) 환승의달인') && nicks.includes('옛닉'), JSON.stringify(nicks));
  });

  console.log('[AI 글이 없는 호선 방]');
  await page.click('#chatLineChips .chat-line-chip[data-l="경춘선"]'); await page.waitForTimeout(700);
  await t('칩을 누르면 그 호선 방으로 들어가고 전체 화면은 숨는다, 선택한 칩이 강조된다', async () => {
    const d = await page.evaluate(() => ({ chat: getComputedStyle(document.getElementById('chatTabView')).display, line: getComputedStyle(document.getElementById('lineRoomView')).display, bar: getComputedStyle(document.getElementById('chatLineBar')).display, sel: window._chatSel }));
    assert.deepStrictEqual(d, { chat: 'none', line: 'flex', bar: 'flex', sel: '경춘선' });
    const c = (await chips()).find(x => x.l === '경춘선'); assert.ok(/background:rgb|background:#|background:var/.test(c.st) && !/background:transparent/.test(c.st));
  });
  await t('비어 있는 방은 "첫 글을 남겨보세요" 빈 상태 문구를 보여 준다', async () => {
    const txt = await page.$eval('#lrScroll', e => e.textContent); assert.ok(/경춘선/.test(txt) && /첫 글을 남겨보세요/.test(txt), txt); assert.ok(!/불러오는 중/.test(txt));
  });
  await t('호선 탭에서는 아이디 앞에 (N호선)을 붙이지 않는다', async () => {
    await page.fill('#lrInput', '경춘선 처음이에요'); await page.evaluate(() => _lrSend()); await page.waitForTimeout(300);
    await page.evaluate(() => _lrPoll(false)); await page.waitForTimeout(1500); await page.evaluate(() => _lrPoll(false)); await page.waitForTimeout(500);
    const nicks = await page.$$eval('#lrScroll .chat-bub-nick', els => els.map(e => e.textContent.trim())); assert.ok(nicks.every(n => !/\(.*호선\)/.test(n)), JSON.stringify(nicks));
  });
  await t('글쓰기: 그 호선으로 /react 가 가고(line=경춘선), 내 글이 보이고 입력창이 비워진다', async () => {
    const r = reacts[reacts.length - 1]; assert.strictEqual(r.line, '경춘선'); assert.strictEqual(r.text, '경춘선 처음이에요'); assert.strictEqual(r.nick, '테스터');
    const txt = await page.$$eval('#lrScroll .chat-bub-txt', els => els.map(e => e.textContent.trim())); assert.ok(txt.includes('경춘선 처음이에요'), JSON.stringify(txt));
    assert.strictEqual(await page.$eval('#lrInput', e => e.value), '');
  });
  await t('반응 기능: 서버가 단 다른 이용자의 반응 글이 그 방에 나타난다', async () => {
    const txt = await page.$$eval('#lrScroll .chat-bub-txt', els => els.map(e => e.textContent.trim())); assert.ok(txt.includes('ㅇㅈ 맞아요'), JSON.stringify(txt));
  });
  await t('지연·혼잡 제보 버튼과 안내 영역이 그대로 있다', async () => {
    const btn = await page.$$eval('#lineRoomView button', els => els.map(e => e.textContent.trim())); assert.ok(btn.includes('🚨 지연돼요') && btn.includes('😵 붐벼요'), JSON.stringify(btn));
  });
  if (shots) await page.screenshot({ path: path.join(shots, 'chat_line_gyeongchun.png') });

  console.log('[공식 공지·다른 호선]');
  notices = { '2호선': { title: '지연', text: '2호선 신호장애로 지연', ts: Date.now() - 120000 } };
  await page.evaluate(() => { _offCache.data = null; _offCache.at = 0; });
  await page.click('#chatLineChips .chat-line-chip[data-l="2호선"]'); await page.waitForTimeout(900);
  await t('2호선 방: 공식 공지 줄이 그대로 나온다(내 노선 탭에서 옮겨 온 기능)', async () => { const o = await page.$eval('#lrOfficial', e => ({ d: getComputedStyle(e).display, t: e.textContent })); assert.strictEqual(o.d, 'block'); assert.ok(/서울교통공사 공지/.test(o.t) && /신호장애/.test(o.t), o.t); });
  notices = {}; await page.evaluate(() => { _offCache.data = null; _offCache.at = 0; });
  await page.click('#chatLineChips .chat-line-chip[data-l="3호선"]'); await page.waitForTimeout(900);
  await t('3호선 방: 공지가 없으면 "3호선 정상 운행 중입니다"', async () => { const o = await page.$eval('#lrOfficial', e => e.textContent); assert.ok(/3호선 정상 운행 중입니다/.test(o), o); });
  await page.click('#chatLineChips .chat-line-chip[data-l="신분당선"]'); await page.waitForTimeout(900);
  await t('다른 호선 방으로 옮겨도 이전 방 글이 섞이지 않는다', async () => { const txt = await page.$eval('#lrScroll', e => e.textContent); assert.ok(!/경춘선 처음이에요/.test(txt) && /첫 글을 남겨보세요/.test(txt) && /신분당선/.test(txt), txt); });

  console.log('[전체에서 글쓰기 / 스와이프]');
  await page.click('#chatLineChips .chat-line-chip[data-l="all"]'); await page.waitForTimeout(500);
  await t('전체로 돌아오면 전체 화면이 보이고 호선 방 화면은 숨는다', async () => { const d = await page.evaluate(() => ({ chat: getComputedStyle(document.getElementById('chatTabView')).display, line: getComputedStyle(document.getElementById('lineRoomView')).display })); assert.deepStrictEqual(d, { chat: 'flex', line: 'none' }); });
  await t('전체에서 쓴 글은 내가 가장 많이 탄 노선(5호선) 방으로 전송된다', async () => {
    await page.fill('#chatInput', '전체에서 인사'); await page.evaluate(() => sendChatMsg()); await page.waitForTimeout(400);
    const r = reacts[reacts.length - 1]; assert.strictEqual(r.line, '5호선'); assert.strictEqual(r.text, '전체에서 인사');
  });
  await t('스와이프 순서: 실시간소통 → 게시판 → 뉴스 → 설정 (호선 방에서도 동일)', async () => {
    await page.click('#chatLineChips .chat-line-chip[data-l="9호선"]'); await page.waitForTimeout(300);
    const seq = []; for (let i = 0; i < 4; i++) { seq.push(await page.evaluate(() => _commCurTab())); await page.evaluate(() => { if (_commCurTab() === 'news') { /* 뉴스는 카테고리 단위 */ } _commGoTab(({ chat: 'board', board: 'news', news: 'settings', settings: 'settings' })[_commCurTab()]); }); }
    assert.deepStrictEqual(seq, ['chat', 'board', 'news', 'settings']);
    const s2 = []; await openChat(); await page.evaluate(() => _chatSelect('9호선'));
    await page.evaluate(() => _commSwipeStep(-1)); s2.push(await page.evaluate(() => _commCurTab())); await page.evaluate(() => _commSwipeStep(-1)); s2.push(await page.evaluate(() => _commCurTab()));
    await page.evaluate(() => _commSwipeStep(1)); s2.push(await page.evaluate(() => _commCurTab())); await page.evaluate(() => _commSwipeStep(1)); s2.push(await page.evaluate(() => _commCurTab()));
    assert.deepStrictEqual(s2, ['board', 'news', 'board', 'chat']);
  });
  await t('게시판으로 가면 하단 호선 탭과 호선 방은 숨고, 돌아오면 보던 방이 그대로 열린다', async () => {
    await page.evaluate(() => { filterCat(document.getElementById('chipBoard'), 'all'); });
    const d1 = await page.evaluate(() => ({ bar: getComputedStyle(document.getElementById('chatLineBar')).display, line: getComputedStyle(document.getElementById('lineRoomView')).display, news: getComputedStyle(document.getElementById('newsCatBar')).display })); assert.deepStrictEqual(d1, { bar: 'none', line: 'none', news: 'none' });
    await page.evaluate(() => showChatTab(document.getElementById('chipLiveTalk'))); await page.waitForTimeout(300);
    const d2 = await page.evaluate(() => ({ sel: window._chatSel, line: getComputedStyle(document.getElementById('lineRoomView')).display, bar: getComputedStyle(document.getElementById('chatLineBar')).display })); assert.deepStrictEqual(d2, { sel: '9호선', line: 'flex', bar: 'flex' });
  });
  await t('상단 칩은 실시간소통·게시판·뉴스·설정 4개뿐(내 노선 칩 없음)', async () => { const c = await page.$$eval('#filterRow .chip', els => els.map(e => e.textContent.trim())); assert.deepStrictEqual(c, ['🔴실시간소통', '게시판', '📰뉴스', '⚙️설정']); });
  await t('화면 오류 없음', async () => assert.deepStrictEqual(errs, []));
  await b.close();
  console.log('\n통과', pass, '건' + (process.exitCode ? ' — 실패 있음' : ''));
})();
