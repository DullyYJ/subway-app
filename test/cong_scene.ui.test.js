// 2026-10-15 (YJ) 혼잡도 카드 창의 3D 캐릭터 장면
//   · 경로가 없으면: 시간대(새벽·아침·점심·오후·저녁·밤)와 실제 날씨(눈·비·구름·흐림·안개)에 맞는 배경에서 캐릭터 2~3마리가 랜덤으로 나와 논다
//   · 버스 경로: 타기 전 = 한 마리가 기다림 · 타면 = 버스 안 · 내리면 = 버스에서 내려 친구들과 놀기 · 지하철→버스 환승도 버스 장면
//   · ★ (23:05 YJ) 혼잡도와 장면은 함께 보이지 않는다: 혼잡도는 '지하철 탑승 확정' 뒤에만, 그 밖(대기·버스·내림·경로 없음)은 장면만
//   · 버스에서는 '혼잡도 분석' 아래에 "지하철 탑승시 혼잡도가 나와요!"
//   · ★ "모든 연산은 엔진이 한다, 앱은 그림만": 장면 종류·구간·시간대·날씨·대표 캐릭터는 엔진(/scene, engine/scene.js)이 정하고 앱에는 그 판정 코드가 없다.
//     (시험에서는 엔진 함수를 그대로 불러 /scene 응답을 만든다)
// 실행: node test/cong_scene.ui.test.js [html 경로]
const assert = require('assert'), path = require('path'), fs = require('fs');
const { chromium } = require('./helpers/pw');
const SCENE = require('../engine/scene');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 700)); } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh(opt) {
    opt = opt || {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errs = [], st = { wx: opt.wx === undefined ? { temp: 12, rain: 10, txt: '맑음' } : opt.wx, fail: false, calls: 0, last: null };
    page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => {
      const u = new URL(r.request().url());
      if (/\/scene$/.test(u.pathname)) { st.calls++; if (st.fail) return r.fulfill({ status: 500, body: 'x' }); const body = r.request().postDataJSON(); st.last = body; return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(SCENE.sceneDecide(body, st.wx)) }); }
      return (u.protocol === 'file:' || u.protocol === 'data:') ? r.continue() : r.abort();
    });
    await page.addInitScript(() => { try { localStorage.setItem('locDisc', '1'); } catch (e) {} });
    await page.goto('file://' + html); await page.waitForTimeout(2600);
    await page.addStyleTag({ content: '#locDiscOv{display:none !important}' });
    return { ctx, page, errs, st };
  }
  const info = (page) => page.evaluate(() => _CS.info());
  const sceneBox = (page) => page.evaluate(() => { const e = document.getElementById('congScene'), cs = getComputedStyle(e), r = e.getBoundingClientRect(); return { show: cs.display !== 'none', w: Math.round(r.width), h: Math.round(r.height), mode: e.getAttribute('data-cs-mode'), slot: e.getAttribute('data-cs-slot'), wx: e.getAttribute('data-cs-wx'), hero: e.getAttribute('data-cs-hero'), tag: document.getElementById('csTag').textContent }; });
  const hintTxt = (page) => page.evaluate(() => { const e = document.getElementById('congBusHint'); return { show: getComputedStyle(e).display !== 'none', txt: e.textContent }; });
  const cardState = (page) => page.evaluate(() => ({ cs: document.getElementById('congCard').classList.contains('cs-on'), grid: getComputedStyle(document.getElementById('carGrid')).display !== 'none', bus: document.getElementById('congCard').classList.contains('bus'), lbl: document.querySelector('.cong-stn').textContent.trim(), chart: getComputedStyle(document.getElementById('chart24Wrap')).display !== 'none' }));
  // 그림이 실제로 그려졌는가(빈 캔버스·한 색이 아닌가): 장면 칸 스크린샷의 색 가짓수
  const painted = async (page) => { const buf = await (await page.$('#congScene')).screenshot(); const { PNG } = (() => { try { return require('pngjs'); } catch (e) { return {}; } })(); return buf.length; };
  const ROUTE = () => {
    window._transitNodeData = [
      { name: '출발', isOrigin: true }, { name: '도보', isWalk: true },
      { name: '이음대로', isBus: true, lineName: 'M6659', lat: 37.5, lng: 126.7, arrTime: '22:25' }, { name: '염창사거리', isBus: true, lineName: 'M6659', lat: 37.51, lng: 126.75, arrTime: '22:32' },
      { name: '염창역', isBus: true, lineName: 'M6659', lat: 37.52, lng: 126.8, arrTime: '22:39' }, { name: '도보', isWalk: true },
      { name: '염창', isSub: true, lineName: '9호선', arrTime: '22:44' }, { name: '노량진', isSub: true, lineName: '9호선', arrTime: '22:54' },
      { name: '도보', isWalk: true }, { name: '가양', isBus: true, lineName: '6633', lat: 37.5, lng: 126.85, arrTime: '23:05' }, { name: '마곡', isBus: true, lineName: '6633', lat: 37.51, lng: 126.86, arrTime: '23:12' }, { name: '도보', isWalk: true }
    ];
    window._routeLocked = true; window._metroRouteMode = false; window._baseTimeMs = null; window._estimateTimelinePos = () => null; window._htlNotDeparted = () => false; window._htlBoarded = false;
  };
  const go = async (page, idx, boarded) => { await page.evaluate(([i, bd]) => { window._gpsMaxIdx = i; window._htlBoarded = !!bd; window._fetchBusCongestion = () => Promise.resolve({ pct: 40, busNo: 'M6659', stopName: 'x', hourly: Array.from({ length: 24 }, () => 40) }); _sceneRequest('force'); }, [idx, boarded]); await page.waitForTimeout(700); };

  await t('경로가 없으면 장면이 켜지고(idle) 캐릭터 2~3마리가 나와 돌아다닌다 · 빈 혼잡도 칸은 접힌다', async () => {
    const { ctx, page, errs, st } = await fresh();
    await page.waitForTimeout(1500);
    const sb = await sceneBox(page); assert(sb.show && sb.mode === 'idle' && sb.w > 250 && sb.h === 150, JSON.stringify(sb));
    assert(/점심|아침|오후|저녁|밤|새벽/.test(sb.tag) && /맑음/.test(sb.tag), sb.tag);
    await page.evaluate(() => _CS._tick(4)); let i1 = await info(page);
    assert(i1.running && !i1.err && i1.actors.length >= 2 && i1.actors.length <= 3, JSON.stringify(i1));
    const xs0 = i1.actors.map(a => a.x).join(','); await page.evaluate(() => _CS._tick(3)); const i2 = await info(page);
    assert(i2.actors.map(a => a.x).join(',') !== xs0, '캐릭터가 움직여야 한다');
    const c = await cardState(page); assert(!c.chart && !c.grid, '출발역이 없을 땐 빈 그래프·칸별 칸을 접는다 ' + JSON.stringify(c));
    assert(!(await hintTxt(page)).show, 'idle 에는 버스 안내가 없다');
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('시간대 6가지 × 날씨 6가지: 엔진이 정한 값 그대로 배경이 바뀐다(앱이 정하지 않는다)', async () => {
    const { ctx, page, errs, st } = await fresh();
    const hours = { dawn: 5, morning: 9, noon: 12, afternoon: 15, evening: 19, night: 23 }, wxs = { clear: '맑음', cloudy: '구름많음', overcast: '흐림', rain: '비', snow: '눈', fog: '안개' };
    const sizes = new Set();
    for (const [slot, h] of Object.entries(hours)) for (const [wk, txt] of Object.entries(wxs)) {
      st.wx = { temp: 10, rain: wk === 'rain' ? 90 : 10, txt };
      await page.evaluate(h2 => { window.getBaseTimeMs = () => new Date(2026, 9, 15, h2, 30).getTime(); _sceneRequest('force'); }, h);
      await page.waitForTimeout(260);
      const sb = await sceneBox(page); assert(sb.slot === slot && sb.wx === wk && sb.mode === 'idle', slot + '/' + wk + ' → ' + JSON.stringify(sb));
      await page.evaluate(() => _CS._tick(1));
      sizes.add(require('crypto').createHash('md5').update(await (await page.$('#congScene')).screenshot()).digest('hex'));
    }
    assert(sizes.size >= 35, '36 가지 배경이 서로 다른 그림이어야 한다: ' + sizes.size);
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('날씨를 못 받으면 날씨를 지어내지 않는다(문구에 날씨 없음)', async () => {
    const { ctx, page, errs } = await fresh({ wx: null });
    const sb = await sceneBox(page); assert(sb.show && !/맑|흐|비|눈|구름|안개/.test(sb.tag) && sb.wx === 'clear', JSON.stringify(sb));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('버스 구간: 타기 전 wait(한 마리) → 타고 가는 중 ride → 내림 alight(친구들과 놀기) + 모든 구간에 "지하철 탑승시 혼잡도가 나와요!"', async () => {
    const { ctx, page, errs } = await fresh();
    await page.evaluate(ROUTE);
    await go(page, 1, false);                                  // 정류장으로 걸어가는 중
    let sb = await sceneBox(page), i = await info(page);
    assert(sb.mode === 'wait' && /기다리는/.test(sb.tag), JSON.stringify(sb));
    assert(i.actors.length === 1 && i.actors[0].hero && i.actors[0].st && !i.err, JSON.stringify(i));
    const hero = sb.hero;
    let h = await hintTxt(page); assert(h.show && h.txt === '지하철 탑승시 혼잡도가 나와요!', JSON.stringify(h));
    let c = await cardState(page); assert(c.cs && !c.grid && !c.chart, '버스 구간엔 혼잡도 없이 장면만 ' + JSON.stringify(c));
    await go(page, 2, true); sb = await sceneBox(page); assert(sb.mode === 'ride' && /타고/.test(sb.tag) && sb.hero === hero, '타고 가는 중 ' + JSON.stringify(sb));
    await go(page, 3, true); sb = await sceneBox(page); assert(sb.mode === 'ride' && /곧 내려요/.test(sb.tag), '내리기 직전(하차벨) ' + JSON.stringify(sb));
    i = await info(page); assert(i.ride && i.actors.length === 0, JSON.stringify(i));
    h = await hintTxt(page); assert(h.show, '타는 동안에도 안내가 보인다');
    await go(page, 4, false); sb = await sceneBox(page); assert(sb.mode === 'alight' && /내렸어요/.test(sb.tag) && sb.hero === hero, '내림 ' + JSON.stringify(sb));
    await page.evaluate(() => _CS._tick(12)); i = await info(page);
    assert(i.actors.length >= 3 && i.actors.filter(a => a.hero).length === 1 && i.seq && i.seq.busOn === false, '버스가 떠나고 친구들이 와서 논다 ' + JSON.stringify(i));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('지하철: 타기 전(기다림)은 지하철 장면 · 탑승 확정되면 혼잡도(칸별)만 · 지하철→버스 환승이면 다시 버스 장면(혼잡도 없음)', async () => {
    const { ctx, page, errs } = await fresh();
    await page.evaluate(ROUTE);
    await go(page, 6, true);                                   // 지하철 역에 도착, 아직 타기 전
    let sb = await sceneBox(page), c = await cardState(page);
    assert(sb.show && sb.mode === 'wait' && /열차/.test(sb.tag) && c.cs && !c.grid && !c.chart, '타기 전엔 장면 ' + JSON.stringify({ sb, c }));
    await go(page, 7, true);                                   // 탑승 확정 → 혼잡도
    sb = await sceneBox(page); c = await cardState(page); const h = await hintTxt(page);
    assert(!sb.show && !c.cs && c.grid && !c.bus && /^지하철 노량진/.test(c.lbl) && !h.show, '탑승 확정 뒤엔 혼잡도만 ' + JSON.stringify({ sb, c, h }));
    await go(page, 8, true); sb = await sceneBox(page); c = await cardState(page);          // 환승 도보 → 곧 탈 버스
    assert(sb.show && sb.mode === 'wait' && c.cs && !c.grid && !c.chart, '지하철→버스 환승 ' + JSON.stringify({ sb, c }));
    await go(page, 10, true); sb = await sceneBox(page); assert(sb.mode === 'alight', '마지막 버스 정류장 ' + JSON.stringify(sb));
    await go(page, 11, true); sb = await sceneBox(page); assert(sb.mode === 'alight', '내려서 걷는 중 ' + JSON.stringify(sb));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('버스→지하철 환승: 내린 뒤엔 지하철 대기 장면, 지하철 탑승 확정 때 혼잡도', async () => {
    const { ctx, page, errs } = await fresh();
    await page.evaluate(ROUTE);
    await go(page, 4, false); assert((await sceneBox(page)).mode === 'alight');
    await go(page, 5, false); let sb = await sceneBox(page), c = await cardState(page);
    assert(sb.show && sb.mode === 'wait' && /열차/.test(sb.tag) && c.cs && !c.grid, '내린 뒤 지하철로 걷는 중 ' + JSON.stringify({ sb, c }));
    await go(page, 7, true); sb = await sceneBox(page); c = await cardState(page);
    assert(!sb.show && c.grid && /^지하철/.test(c.lbl), '탑승 확정 ' + JSON.stringify({ sb, c }));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('비·눈이면 기다리는 캐릭터가 우산을 쓴다 · 맑으면 쓰지 않는다', async () => {
    for (const [txt, want] of [['비', true], ['눈', true], ['맑음', false]]) {
      const { ctx, page, errs } = await fresh({ wx: { temp: 5, rain: txt === '맑음' ? 0 : 90, txt } });
      await page.evaluate(ROUTE); await go(page, 1, false);
      const i = await info(page); assert(i.mode === 'wait' && i.actors[0].umb === want, txt + ' ' + JSON.stringify(i.actors));
      assert(!errs.length, errs.join('|')); await ctx.close();
    }
  });
  await t('엔진 응답이 끊기면 마지막 장면을 그대로 둔다(앱이 새로 판단하지 않는다)', async () => {
    const { ctx, page, errs, st } = await fresh();
    await page.evaluate(ROUTE); await go(page, 3, false);
    assert((await sceneBox(page)).mode === 'ride');
    st.fail = true; await go(page, 1, false);
    const sb = await sceneBox(page); assert(sb.show && sb.mode === 'ride', '엔진이 실패하면 앱은 마지막 판정을 유지 ' + JSON.stringify(sb));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('경로를 닫으면 다시 idle · 경로마다 대표 캐릭터가 새로 뽑힌다(같은 경로 동안은 그대로)', async () => {
    const { ctx, page, errs } = await fresh();
    const heroes = new Set();
    for (let k = 0; k < 8; k++) {
      await page.evaluate(ROUTE); await go(page, 1, false); heroes.add((await sceneBox(page)).hero);
      await page.evaluate(() => { window._routeLocked = false; _resetCongToWaiting(); _sceneRequest('force'); }); await page.waitForTimeout(500);
      assert((await sceneBox(page)).mode === 'idle', '닫으면 idle');
      await page.waitForTimeout(5);
    }
    assert(heroes.size >= 2, '대표 캐릭터가 골고루 뽑힌다: ' + [...heroes]);
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('앱에는 장면·구간·날씨 판정 코드가 없다(엔진 값만 그린다)', async () => {
    const src = fs.readFileSync(html, 'utf8');
    ['phaseFor', 'function slotOf', 'function wxKind', 'function seasonOf', '_congLegNode', '_congSubNodeFrom', 'function sceneDecide'].forEach(k => assert(!src.includes(k), '앱에 판정 코드가 남아 있다: ' + k));
    assert(/_SCENE_URL/.test(src) && /\/scene'/.test(src), '엔진 /scene 호출');
  });
  await t('JS 오류 없음 · 어두운/파스텔 테마 모두 그려진다', async () => {
    for (const th of ['pastel', 'dark']) {
      const { ctx, page, errs } = await fresh();
      await page.evaluate(t2 => { if (t2 === 'dark') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t2); }, th);
      await page.waitForTimeout(1500); await page.evaluate(() => _CS._tick(2)); const i = await info(page); assert(i.running && !i.err && i.frames > 0, th + ' ' + JSON.stringify(i));
      assert(!errs.length, errs.join('|')); await ctx.close();
    }
  });
  await b.close();
  console.log(`\ncong_scene: ${pass} pass ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
