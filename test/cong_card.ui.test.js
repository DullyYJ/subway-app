// 2026-10-15 (YJ 스크린샷) 혼잡도 분석 카드
//   · 버스: 칸별 혼잡도 숨김 + 그래프 키움(--bars-h 160px, 막대 배율 1.38) · 지하철: 칸별 복원 + 112px
//   · 버스→지하철 환승(GPS 구간 전환)에서 칸별이 돌아온다(예전엔 _congMode='bus' 가 지하철 갱신을 막았다) · 지하철→버스는 다시 사라진다
//   · 상태("보통 😐")는 카드 맨 윗줄 오른쪽(화살표 자리) · 현재 시각 막대는 그래프 가운데 · 현재 막대 테두리는 밝은 테마 검정/어두운 테마 흰색
//   · 버스 정보를 못 받으면 앞 지하철 수치·그래프를 버스 이름 아래 남기지 않는다
// 실행: node test/cong_card.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 600)); } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh(theme) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return (u.protocol === 'file:' || u.protocol === 'data:') ? r.continue() : r.abort(); });
    await page.addInitScript(th => { if (th) { try { localStorage.setItem('theme', th); } catch (e) {} } }, theme || '');
    await page.goto('file://' + html); await page.waitForTimeout(2500);
    if (theme) await page.evaluate(t2 => document.documentElement.setAttribute('data-theme', t2), theme);
    if (theme === 'dark') await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
    return { ctx, page, errs };
  }
  const snap = (page) => page.evaluate(() => {
    const r = id => document.getElementById(id), vis = e => e && getComputedStyle(e).display !== 'none';
    const top = document.querySelector('#congCard .cong-top'), st = r('congStatusTxt');
    return { bus: r('congCard').classList.contains('bus'), grid: vis(r('carGrid')), ttl: vis(r('carTtl')), barsH: Math.round(r('bars24').getBoundingClientRect().height), statusInTop: !!(top && top.contains(st)), status: st.textContent };
  });
  await t('상태(보통 😐)가 카드 맨 윗줄 안(오른쪽)에 있다', async () => {
    const { ctx, page, errs } = await fresh();
    await page.evaluate(() => updateCong({ name: '부평', line: '1호선' }, true)); await page.waitForTimeout(400);
    const r = await page.evaluate(() => { const top = document.querySelector('#congCard .cong-top').getBoundingClientRect(), st = document.getElementById('congStatusTxt').getBoundingClientRect(), stn = document.querySelector('.cong-stn').getBoundingClientRect(); return { right: st.right <= top.right + 1 && st.left > stn.right - 1, cy: Math.abs((st.top + st.height / 2) - (top.top + top.height / 2)) < 14, txt: document.getElementById('congStatusTxt').textContent }; });
    assert(r.right && r.cy && /😊|😐|😰|😱/.test(r.txt), JSON.stringify(r));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('지하철: 칸별 혼잡도 보임 · 그래프 112px / 버스: 칸별 숨김 · 그래프 160px', async () => {
    const { ctx, page, errs } = await fresh();
    await page.evaluate(() => updateCong({ name: '부평', line: '1호선' }, true)); await page.waitForTimeout(300);
    const s = await snap(page); assert(s.grid && s.ttl && !s.bus && s.barsH === 112, JSON.stringify(s));
    await page.evaluate(() => { _fetchBusCongestion = () => Promise.resolve({ pct: 34, busNo: '인천e음88', stopName: '갈현', rawCgst: 14, maxCgst: 30, hourly: Array.from({ length: 24 }, (_, h) => (h < 5 ? 0 : 20 + h)) }); updateBusCong({ name: '인천e음88', stops: [{ stationName: 'a', lat: 37.5, lon: 126.7 }], curStopIdx: 0 }); });
    await page.waitForTimeout(500);
    const b2 = await snap(page); assert(!b2.grid && !b2.ttl && b2.bus && b2.barsH === 160, JSON.stringify(b2));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('버스→지하철 환승: 지하철 갱신이 막히지 않고 칸별 혼잡도가 돌아온다(GPS 구간 전환 경로의 force 호출)', async () => {
    const { ctx, page, errs } = await fresh();
    await page.evaluate(() => { _fetchBusCongestion = () => Promise.resolve({ pct: 34, busNo: '88', stopName: 'x', hourly: Array.from({ length: 24 }, () => 30) }); updateBusCong({ name: '88', stops: [{ stationName: 'a', lat: 37.5, lon: 126.7 }], curStopIdx: 0 }); });
    await page.waitForTimeout(400); assert((await snap(page)).bus);
    await page.evaluate(() => updateCong({ name: '부평', line: '1호선' }, true)); await page.waitForTimeout(300);
    const s = await snap(page); assert(s.grid && s.ttl && !s.bus && s.barsH === 112, JSON.stringify(s));
    const src = require('fs').readFileSync(html, 'utf8');
    assert(/updateCong\(\{ name: _cgBest\.name, line: _cgBest\.lineName \|\| '' \}, true\)/.test(src), '지하철 구간 전환 호출에 force 가 없다');
    await page.evaluate(() => { _fetchBusCongestion = () => Promise.resolve({ pct: 50, busNo: '9', stopName: 'y', hourly: Array.from({ length: 24 }, () => 40) }); updateBusCong({ name: '9', stops: [{ stationName: 'a', lat: 37.5, lon: 126.7 }], curStopIdx: 0 }); }); await page.waitForTimeout(400);
    assert(!(await snap(page)).grid, '지하철→버스는 칸별이 다시 사라져야 한다');
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('버스 정보를 못 받으면 앞 지하철 수치·그래프가 남지 않는다', async () => {
    const { ctx, page, errs } = await fresh();
    await page.evaluate(() => updateCong({ name: '부평', line: '1호선' }, true)); await page.waitForTimeout(300);
    await page.evaluate(() => { _fetchBusCongestion = () => Promise.resolve(null); updateBusCong({ name: '인천e음88', stops: [], curStopIdx: 0 }); }); await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ st: document.getElementById('congStatusTxt').textContent, bars: document.getElementById('bars24').children.length, grid: getComputedStyle(document.getElementById('carGrid')).display }));
    assert(r.st === '정보 없음' && r.bars === 0 && r.grid === 'none', JSON.stringify(r));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  for (const th of ['dark', 'pastel']) {
    await t('현재 시각 막대가 그래프 가운데 · 테두리 ' + (th === 'dark' ? '흰색' : '검정') + '(' + th + ')', async () => {
      const { ctx, page, errs } = await fresh(th);
      await page.evaluate(() => { const c = document.querySelector('.tab-content, #tab-home, body'); updateCong({ name: '부평', line: '1호선' }, true); });
      await page.waitForTimeout(1200);
      const r = await page.evaluate(() => {
        const sc = document.getElementById('chart24Scroll'), cur = document.querySelector('#bars24 .bar24-col.cur');
        if (!cur) return null;
        sc.scrollIntoView({ block: 'center' });
        const sr = sc.getBoundingClientRect(), cr = cur.getBoundingClientRect();
        return { off: Math.round((cr.left + cr.width / 2) - (sr.left + sr.width / 2)), ol: getComputedStyle(cur.querySelector('.bar24-fill')).outlineColor, lbl: getComputedStyle(cur.querySelector('.bar24-lbl')).color, h: new Date().getHours() };
      });
      assert(r, '현재 시각 막대 없음');
      assert(Math.abs(r.off) <= 3, '가운데가 아님 ' + JSON.stringify(r));
      const want = th === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(17, 17, 17)';
      assert(r.ol === want && r.lbl === want, th + ' 테두리·라벨색 ' + JSON.stringify(r));
      assert(!errs.length, errs.join('|')); await ctx.close();
    });
  }
  await t('저녁 21시·아침 6시·밤 23시도 가운데에 온다(양끝 여백)', async () => {
    const { ctx, page, errs } = await fresh();
    for (const hh of [6, 21, 23]) {
      await page.evaluate(h => { window.getBaseTimeMs = () => new Date(2026, 9, 15, h, 10).getTime(); updateCong({ name: '부평', line: '1호선' }, true); document.getElementById('bars24')._chartSig = ''; renderChart24('부평', '1호선'); }, hh);
      await page.waitForTimeout(900);
      const off = await page.evaluate(() => { const sc = document.getElementById('chart24Scroll'), cur = document.querySelector('#bars24 .bar24-col.cur'); if (!cur) return 999; const sr = sc.getBoundingClientRect(), cr = cur.getBoundingClientRect(); return Math.round((cr.left + cr.width / 2) - (sr.left + sr.width / 2)); });
      assert(Math.abs(off) <= 3, hh + '시 편차 ' + off);
    }
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('(22:12 YJ) 그래프 가운데의 "현재 시각 · 퍼센트" 줄이 없다', async () => {
    const { ctx, page, errs } = await fresh();
    await page.evaluate(() => updateCong({ name: '부평', line: '1호선' }, true)); await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({ row: !!document.querySelector('#congCard .chart-tooltip'), t: !!document.getElementById('chartTooltipTime') }));
    assert(!r.row && !r.t, JSON.stringify(r));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  const ROUTE = () => {
    // 버스(M6659) → 도보 → 9호선(염창·노량진) → 도보 → 공항철도(김포공항)
    _transitNodeData = [
      { name: '출발', isOrigin: true, isSub: false, isBus: false, isWalk: false },
      { name: '이음대로', isBus: true, isSub: false, lineName: 'M6659', lat: 37.5, lng: 126.7, arrTime: '22:25' },
      { name: '염창역', isBus: true, isSub: false, lineName: 'M6659', lat: 37.51, lng: 126.8, arrTime: '22:39' },
      { name: '도보', isWalk: true, isSub: false, isBus: false },
      { name: '염창', isSub: true, isBus: false, lineName: '9호선', arrTime: '22:44' },
      { name: '노량진', isSub: true, isBus: false, lineName: '9호선', arrTime: '22:54' },
      { name: '도보', isWalk: true, isSub: false, isBus: false },
      { name: '김포공항', isSub: true, isBus: false, lineName: '공항철도', arrTime: '23:10' }
    ];
    window._routeLocked = true; window._metroRouteMode = false; window._baseTimeMs = null; _baseTimeMs = null;
    window._estimateTimelinePos = () => null; window._htlNotDeparted = () => false;
  };
  const card = (page) => page.evaluate(() => ({ lbl: document.querySelector('.cong-stn').textContent.trim(), grid: getComputedStyle(document.getElementById('carGrid')).display !== 'none', bus: document.getElementById('congCard').classList.contains('bus'), meta: document.getElementById('congMeta').textContent, st: document.getElementById('congStatusTxt').textContent }));
  await t('(22:12 YJ) 버스 혼잡도를 못 받으면 경로의 지하철 혼잡도를 보여준다', async () => {
    const { ctx, page, errs } = await fresh();
    await page.evaluate(ROUTE);
    await page.evaluate(() => { _fetchBusCongestion = () => Promise.resolve(null); _congLegSig = ''; window._gpsMaxIdx = 0; _congSyncRoute(); });
    await page.waitForTimeout(600);
    const c = await card(page);
    assert(/^지하철 염창/.test(c.lbl) && c.grid && !c.bus && /버스 정보가 없어/.test(c.meta) && /😊|😐|😰|😱/.test(c.st), JSON.stringify(c));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('(22:12 YJ) 환승하면 혼잡도가 바뀐다: 버스→지하철(칸별 복귀)·지하철→지하철(역·노선 바뀜)', async () => {
    const { ctx, page, errs } = await fresh();
    await page.evaluate(ROUTE);
    await page.evaluate(() => { _fetchBusCongestion = () => Promise.resolve({ pct: 40, busNo: 'M6659', stopName: 'x', hourly: Array.from({ length: 24 }, () => 40) }); _congLegSig = ''; window._gpsMaxIdx = 1; _congSyncRoute(); });
    await page.waitForTimeout(500);
    let c = await card(page); assert(/^버스/.test(c.lbl) && !c.grid && c.bus, '버스 구간 ' + JSON.stringify(c));
    await page.evaluate(() => { window._gpsMaxIdx = 4; _congSyncRoute(); }); await page.waitForTimeout(400);
    c = await card(page); assert(/^지하철 염창/.test(c.lbl) && c.grid && !c.bus, '9호선 첫 역 ' + JSON.stringify(c));
    await page.evaluate(() => { window._gpsMaxIdx = 5; _congSyncRoute(); }); await page.waitForTimeout(400);
    c = await card(page); assert(/^지하철 노량진/.test(c.lbl), '다음 역 ' + JSON.stringify(c));
    await page.evaluate(() => { window._gpsMaxIdx = 6; _congSyncRoute(); }); await page.waitForTimeout(400);       // 환승 도보 중 → 곧 탈 공항철도
    c = await card(page); assert(/^지하철 김포공항/.test(c.lbl) && c.grid, '지하철→지하철 환승 ' + JSON.stringify(c));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('카드 폭이 바뀌어도(화면 크기·탭 전환) 현재 시각이 가운데에 남는다', async () => {
    const { ctx, page, errs } = await fresh();
    await page.evaluate(() => { window.getBaseTimeMs = () => new Date(2026, 9, 15, 21, 10).getTime(); updateCong({ name: '부평', line: '1호선' }, true); });
    await page.waitForTimeout(900);
    await page.setViewportSize({ width: 340, height: 800 }); await page.waitForTimeout(700);
    const off = await page.evaluate(() => { const sc = document.getElementById('chart24Scroll'), cur = document.querySelector('#bars24 .bar24-col.cur'); const sr = sc.getBoundingClientRect(), cr = cur.getBoundingClientRect(); return Math.round((cr.left + cr.width / 2) - (sr.left + sr.width / 2)); });
    assert(Math.abs(off) <= 3, '편차 ' + off);
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await b.close();
  console.log(`\ncong_card: ${pass} pass ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
