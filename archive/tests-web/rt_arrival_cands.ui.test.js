// 실시간 지하철 도착정보 → 엔진 입력 시험(헤드리스 Chromium, 서버·엔진 모의).
// 앱은 '가장 빨리 오는 한 대'를 고르지 않고, 이 역에 오는 열차 후보(앞차·내 열차·뒤차)를 전부 엔진에 넘긴다(어느 열차가 내 열차인지는 엔진이 정한다).
// 실행: node test/rt_arrival_cands.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
  await page.goto('file://' + html);
  await page.waitForTimeout(2500);

  const run = (list) => page.evaluate(async (list) => {
    window._rtArrAt = 0; window._etaLive = []; window.__req = [];
    window._baseTimeMs = null; window._metroRouteMode = false;
    let card = document.getElementById('transitResultCard'); if (!card) { card = document.createElement('div'); card.id = 'transitResultCard'; document.body.appendChild(card); } card.style.display = 'block';
    window._rtCurrentSubLeg = () => ({ lineName: '2호선', boardIdx: 1, alightIdx: 5 });
    window._rtCovered = () => false; window._RT_ARR_LINE2ID['2호선'] = '1002'; window._rtArrCovered = () => true;
    window._transitNodeData = [{ isOrigin: true }, { name: '강남', isSub: true, _schedMin: 1000 }, { name: '역삼', isSub: true, _schedMin: 1003 }, { name: '선릉', isSub: true, _schedMin: 1005 }, { name: '삼성', isSub: true, _schedMin: 1007 }, { name: '종합운동장', isSub: true, _schedMin: 1009 }];
    window._gpsMaxIdx = 1;
    window._rtArrForward = () => true;
    window.seoulFetch = async () => ({ realtimeArrivalList: list });
    window._etaRequest = (why) => { window.__req.push(why); };
    await _rtArrPoll();
    return { live: (window._etaLive || []).map(x => ({ idx: x.idx, sec: Math.round((x.ms - x.at) / 1000) })), req: window.__req.slice() };
  }, list);

  console.log('[도착정보 → 엔진 입력]');
  const a = await run([{ subwayId: '1002', barvlDt: '95', bstatnNm: '성수' }, { subwayId: '1002', barvlDt: '310', bstatnNm: '성수' }, { subwayId: '1002', barvlDt: '40', bstatnNm: '성수' }, { subwayId: '1003', barvlDt: '10', bstatnNm: '구파발' }]);
  await t('이 역에 오는 같은 노선 열차를 모두 오름차순 후보로 넘긴다(앞차 40초 · 95초 · 뒤차 310초)', async () => { assert.deepStrictEqual(a.live.map(x => x.sec), [40, 95, 310]); assert.ok(a.live.every(x => x.idx === 2)); });
  await t('엔진 요청(live)을 보낸다', async () => { assert.deepStrictEqual(a.req, ['live']); });
  const c = await run([{ subwayId: '1002', barvlDt: '0', bstatnNm: '성수' }, { subwayId: '1002', barvlDt: '-5', bstatnNm: '성수' }]);
  await t('남은 시간이 없거나 0 이하면 보내지 않는다', async () => { assert.strictEqual(c.live.length, 0); assert.strictEqual(c.req.length, 0); });
  const d = await run([1, 2, 3, 4, 5, 6].map(i => ({ subwayId: '1002', barvlDt: String(60 * i), bstatnNm: '성수' })));
  await t('후보는 가까운 4대까지만 보낸다', async () => { assert.deepStrictEqual(d.live.map(x => x.sec), [60, 120, 180, 240]); });
  await t('JS 오류가 없다', async () => { assert.deepStrictEqual(errs, []); });
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패');
  await b.close(); process.exit(fail ? 1 : 0);
})();
