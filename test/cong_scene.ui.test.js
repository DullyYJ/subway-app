// 2026-10-15 (YJ) 혼잡도 카드 창의 3D 캐릭터 장면
//   · 경로가 없으면: 시간대(새벽·아침·점심·오후·저녁·밤)와 실제 날씨(눈·비·구름·흐림·안개)에 맞는 배경에서 캐릭터 2~3마리가 랜덤으로 나와 논다
//   · 버스 경로: 타기 전 = 한 마리가 기다림 · 타면 = 버스 안 · 내리면 = 버스에서 내려 친구들과 놀기 · 지하철→버스 환승도 버스 장면
//   · ★ (23:05 YJ) 혼잡도와 장면은 함께 보이지 않는다: 혼잡도는 '지하철 탑승 확정' 뒤에만, 그 밖(대기·버스·내림·경로 없음)은 장면만
//   · 버스에서는 '혼잡도 분석' 제목줄에 "지하철을 타면 혼잡도가 표시돼요"
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
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 2, hasTouch: !!opt.touch, isMobile: !!opt.touch });
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
    const sb = await sceneBox(page); assert(sb.show && sb.mode === 'idle' && sb.w > 250, JSON.stringify(sb));
    // (07:43 YJ) 경로가 없을 땐 홈 화면 전체(검색·혼잡도·AI 승무원·실시간 대화)가 스크롤 없이 한 화면에 딱 맞는다 — 장면 높이가 남는 만큼 늘고 줄어든다
    await page.waitForTimeout(1500);
    const fit = await page.evaluate(() => { const h = document.getElementById('tab-home'), hr = h.getBoundingClientRect(); let bot = 0; [...h.children].forEach(k => { if (!k.offsetParent) return; const r = k.getBoundingClientRect(); if (r.height) bot = Math.max(bot, r.bottom + (parseFloat(getComputedStyle(k).marginBottom) || 0)); }); const sc = document.getElementById('congScene').getBoundingClientRect(); return { sceneH: Math.round(sc.height), slack: Math.round(hr.bottom - bot), over: h.scrollHeight - h.clientHeight, fill: window._sceneLast && window._sceneLast.fill }; });
    assert(fit.fill === true && fit.sceneH >= 90 && fit.slack >= 8 && fit.slack <= 30 && fit.over <= 2, '한 화면에 딱 맞는다 ' + JSON.stringify(fit));
    assert(/점심|아침|오후|저녁|밤|새벽/.test(sb.tag) && /맑음/.test(sb.tag), sb.tag);
    await page.evaluate(() => _CS._tick(4)); let i1 = await info(page);
    assert(i1.running && !i1.err && i1.actors.length >= 2 && i1.actors.length <= 3, JSON.stringify(i1));
    const pos0 = i1.actors.map(a => a.x + '/' + a.z).join(','); let moved = false; for (let k = 0; k < 6 && !moved; k++) { await page.evaluate(() => _CS._tick(3)); moved = (await info(page)).actors.map(a => a.x + '/' + a.z).join(',') !== pos0; }
    assert(moved, '캐릭터가 움직여야 한다');
    const c = await cardState(page); assert(!c.chart && !c.grid, '출발역이 없을 땐 빈 그래프·칸별 칸을 접는다 ' + JSON.stringify(c));
    const hi = await hintTxt(page); assert(hi.show && hi.txt === '지하철을 타면 혼잡도가 표시돼요', '(09:21 YJ) 경로 없음에도 같은 안내 문구 ' + JSON.stringify(hi));
    assert((await page.evaluate(() => document.querySelector('#tab-home .sec').firstChild.textContent.trim())) === '혼잡도', "제목은 '혼잡도'");
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
  await t('버스 구간: 타기 전 wait(한 마리) → 타고 가는 중 ride → 내림 alight(친구들과 놀기) + 모든 구간에 "지하철을 타면 혼잡도가 표시돼요"', async () => {
    const { ctx, page, errs } = await fresh();
    await page.evaluate(ROUTE);
    await go(page, 1, false);                                  // 정류장으로 걸어가는 중
    let sb = await sceneBox(page), i = await info(page);
    assert(sb.mode === 'wait' && /기다리는/.test(sb.tag), JSON.stringify(sb));
    assert(i.actors.length === 1 && i.actors[0].hero && i.actors[0].st && !i.err, JSON.stringify(i));
    const hero = sb.hero;
    let h = await hintTxt(page); assert(h.show && h.txt === '지하철을 타면 혼잡도가 표시돼요', JSON.stringify(h));
    const pos = await page.evaluate(() => { const e = document.getElementById('congBusHint'), t = document.querySelector('#congCard').previousElementSibling; const r = e.getBoundingClientRect(), tr = t.getBoundingClientRect(); return { sameRow: e.parentElement === t, dy: Math.abs((r.top + r.bottom) / 2 - (tr.top + tr.bottom) / 2), w: r.width, sh: document.getElementById('congScene').getBoundingClientRect().height }; });
    assert(pos.sameRow && pos.dy < 14 && pos.w > 60 && pos.sh === 150, '"혼잡도 분석" 제목줄에 문구, 버스 장면은 150px ' + JSON.stringify(pos));
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
  await t('(07:43 YJ) 경로 결과가 나오기 시작하면(확정 전) 장면이 평소 크기(150px)로 돌아가고, 경로가 닫히면 다시 한 화면에 맞춘다', async () => {
    const { ctx, page, errs } = await fresh();
    await page.waitForTimeout(1500);
    const hh = () => page.evaluate(() => ({ h: Math.round(document.getElementById('congScene').getBoundingClientRect().height), fill: window._sceneLast && window._sceneLast.fill, st: document.getElementById('congScene').style.height }));
    const a = await hh(); assert(a.fill === true && a.h !== 150 || a.h === 150 && a.fill === true, JSON.stringify(a));
    await page.evaluate(() => { document.getElementById('transitResultBox').style.display = 'block'; document.getElementById('transitResultCard').style.display = 'flex'; });
    await page.waitForTimeout(1800);
    const b2 = await hh(); assert(b2.fill === false && b2.h === 150 && b2.st === '', '경로 결과가 나오면 150px ' + JSON.stringify(b2));
    assert((await sceneBox(page)).mode === 'idle', '확정 전엔 여전히 idle 장면');
    await page.evaluate(() => { document.getElementById('transitResultCard').style.display = 'none'; document.getElementById('transitResultBox').style.display = 'none'; });
    await page.waitForTimeout(2200);
    const c2 = await hh(); assert(c2.fill === true && c2.h !== 150 && c2.st !== '', '닫으면 다시 맞춤 ' + JSON.stringify(c2));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('(10:12 YJ) 다른 탭에 다녀와도 장면 높이가 줄었다 커지지 않는다 — 떠나 있는 동안 높이를 지우지 않고, 돌아오면 애니메이션 없이 바로 맞춘다', async () => {
    const { ctx, page, errs } = await fresh();
    await page.setViewportSize({ width: 390, height: 1500 }); await page.waitForTimeout(2200);
    const hh = () => page.evaluate(() => ({ h: Math.round(document.getElementById('congScene').getBoundingClientRect().height), st: document.getElementById('congScene').style.height, tr: document.getElementById('congScene').style.transition }));
    const a = await hh(); assert(a.st !== '' && a.h > 160, '처음엔 한 화면에 맞춰 커져 있다 ' + JSON.stringify(a));
    await page.evaluate(() => switchTab('community', document.getElementById('ni-community')));
    await page.evaluate(() => { _sceneFit(); _sceneFit(); });      // 네이티브 장면은 홈이 숨어 있어도 1초마다 맞춤(FIT)을 부른다 — 이때 높이가 지워지면 안 된다
    await page.waitForTimeout(700);
    const away = await hh(); assert(away.st === a.st, '다른 탭에 가 있는 동안 맞춰 둔 높이를 지우지 않는다 ' + JSON.stringify([a, away]));
    // 돌아온 직후(애니메이션 없이) 높이가 그대로 — 프레임마다 재서 한 번도 줄지 않았는지 본다
    await page.evaluate(() => { window.__hs = []; const sc = document.getElementById('congScene'); (function f(){ window.__hs.push(Math.round(sc.getBoundingClientRect().height)); if (window.__hs.length < 40) requestAnimationFrame(f); })(); switchTab('home', document.getElementById('ni-home')); });
    await page.waitForTimeout(900);
    const hs = await page.evaluate(() => window.__hs.filter(v => v > 0));
    assert(hs.length > 5 && Math.min(...hs) >= a.h - 3, '돌아온 뒤 높이가 한 번도 줄지 않는다 ' + JSON.stringify({ a: a.h, hs }));
    const b2 = await hh(); assert(Math.abs(b2.h - a.h) <= 3 && b2.tr === '', '돌아오면 같은 높이 · 전환 효과는 다시 켜 둔다 ' + JSON.stringify([a, b2]));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  // 캐릭터 화면 좌표(칸 안 좌표 → 화면)
  const where = (page) => page.evaluate(() => { const i = _CS.info(), r = document.getElementById('congScene').getBoundingClientRect(); return { W: i.W, H: i.H, r: { l: r.left, t: r.top, w: r.width, h: r.height }, actors: i.actors.map(a => ({ id: a.id, st: a.st, x: a.x, z: a.z, held: a.held, sx: r.left + a.x / i.W * r.width, sy: r.top + a.cy / i.H * r.height })) }; });
  await t('(09:21 YJ) 캐릭터를 꾹 누르면 들려 손가락을 따라오고, 놓은 자리에 내려앉아 잠깐 머문다', async () => {
    const { ctx, page, errs } = await fresh();
    await page.waitForTimeout(1500);
    // 가운데로 모아 두고(시험용: 엔진이 정한 장면은 그대로, 위치만 고정) 잡는다
    await page.evaluate(() => _CS._tick(6));
    let w = await where(page); const a0 = w.actors.filter(a => a.sx > w.r.l + 20 && a.sx < w.r.l + w.r.w - 20)[0]; assert(a0, '화면 안 캐릭터 ' + JSON.stringify(w.actors));
    await page.mouse.move(a0.sx, a0.sy); await page.mouse.down(); await page.waitForTimeout(520);
    let i = await info(page); assert(i.drag && i.actors.some(a => a.held), '꾹 누르면 잡힌다 ' + JSON.stringify(i.actors));
    const tx = w.r.l + w.r.w * .8, ty = w.r.t + w.r.h * .72;
    await page.mouse.move(tx, ty, { steps: 8 }); await page.waitForTimeout(700);
    w = await where(page); const h = w.actors.find(a => a.held); assert(h && Math.abs(h.sx - tx) < 14, '손가락을 따라온다 ' + JSON.stringify(h) + ' target ' + tx);
    // ★ 2026-10-17(2): 놓은 뒤 몇 번 훑어보는 방식은 느린 CI 에서 캐릭터가 이미 걸어 나간 뒤를 보게 돼 또 간헐 실패했다 → 놓기 전부터 프레임마다 상태를 기록해 두고,
    //   '들려 있다가 처음 놓인 프레임'의 자리가 손가락을 놓은 자리와 같은지를 본다(그 뒤 걸음 속도와 무관).
    const wantX = Math.round((tx - w.r.l) / w.r.w * w.W);
    await page.evaluate(() => { window.__rec = []; (function f(){ try{ const i = _CS.info(); window.__rec.push(i.actors.map(a => ({ id: a.id, st: a.st, x: a.x, held: !!a.held, land: a.land || '' }))); }catch(e){} if(window.__rec.length < 600) requestAnimationFrame(f); })(); });
    await page.waitForTimeout(120);
    await page.mouse.up();
    await page.waitForTimeout(1500);
    const rec = await page.evaluate(() => window.__rec);
    // 들려 있던 캐릭터(누구든)가 처음 놓인 프레임
    let fr = null, heldId = null;
    for (let k = 0; k < rec.length && !fr; k++) { const hh = rec[k].find(a => a.held); if (hh) heldId = hh.id; else if (heldId) fr = rec[k].find(a => a.id === heldId) || null; }
    let landed = !!fr && Math.abs(fr.x - wantX) < 40;
    i = await info(page); let d = i.actors.find(a => a.id === a0.id);
    assert(landed, '놓은 자리에 내려앉는다 ' + JSON.stringify({ wantX, heldId, fr, n: rec.length, held: rec.filter(r => r.some(a => a.held)).length }));
    await page.waitForTimeout(1500); i = await info(page); const d2 = i.actors.find(a => a.id === a0.id); assert(d2 && !d2.held && d2.st !== 'fall', '놓자마자 가만있지 않고 바로 움직인다(동작·걷기) ' + JSON.stringify([d, d2]));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('(10:18 YJ) 손가락(터치)으로도 따라다닌다 — 길게 누른 뒤 pointercancel·lostpointercapture 가 와도 놓은 것으로 보지 않고, touchend 로만 놓는다 · 잡은 동안 화면은 스크롤되지 않는다', async () => {
    const { ctx, page, errs } = await fresh({ touch: true });
    await page.evaluate(() => { document.getElementById('transitResultBox').style.display = 'block'; document.getElementById('transitResultCard').style.display = 'flex'; _sceneRequest('force'); });
    await page.waitForTimeout(2500); await page.evaluate(() => { document.getElementById('congScene').scrollIntoView({ block: 'center' }); _CS._tick(6); }); await page.waitForTimeout(500);
    const cdp = await ctx.newCDPSession(page), tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const w = await where(page), a = w.actors.filter(a => a.sx > w.r.l + 30 && a.sx < w.r.l + w.r.w - 30)[0]; assert(a, JSON.stringify(w.actors)); const cx = w.r.l + w.r.w / 2, ddx = (cx - a.sx) / 10;
    const st0 = await page.evaluate(() => document.getElementById('tab-home').scrollTop);
    // 투명 판: 캐릭터 몸 위에는 touch-action:none 판이 놓인다
    const pad = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.className + '|' + getComputedStyle(e).touchAction; }, [a.sx, a.sy]); assert(/cs-pad\|none/.test(pad), '캐릭터 위에 판 ' + pad);
    await tp('touchStart', a.sx, a.sy); await page.waitForTimeout(550);
    assert((await info(page)).drag, '꾹 누르면 잡힌다');
    await page.evaluate(() => { const h = document.getElementById('congScene'); ['pointercancel', 'lostpointercapture'].forEach(n => h.dispatchEvent(new PointerEvent(n, { pointerId: 1, pointerType: 'touch', bubbles: true }))); });
    assert((await info(page)).drag, '가짜 pointercancel 로는 놓지 않는다');
    for (let k = 1; k <= 10; k++) { await tp('touchMove', a.sx + k * ddx, a.sy - k * 3); await page.waitForTimeout(40); }
    await page.waitForTimeout(300);
    const w2 = await where(page), h = w2.actors.find(x => x.held); const fx = a.sx + 10 * ddx;
    assert(h && Math.abs(h.sx - fx) < 12, '손가락을 따라온다 ' + JSON.stringify(h) + ' finger ' + fx);
    assert((await page.evaluate(() => document.getElementById('tab-home').scrollTop)) === st0, '잡은 동안 스크롤되지 않는다');
    await tp('touchEnd'); await page.waitForTimeout(1200);
    assert(!(await info(page)).drag, 'touchend 로 놓는다');
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('하늘 한가운데에서 놓으면 땅으로 떨어진다 · 길게 누르기 전에 손가락이 움직이면 잡히지 않는다(스크롤 우선)', async () => {
    const { ctx, page, errs } = await fresh();
    await page.waitForTimeout(1500); await page.evaluate(() => _CS._tick(6));
    let w = await where(page); const a0 = w.actors.filter(a => a.sx > w.r.l + 20 && a.sx < w.r.l + w.r.w - 20)[0]; assert(a0);
    await page.mouse.move(a0.sx, a0.sy); await page.mouse.down(); await page.mouse.move(a0.sx + 30, a0.sy + 4, { steps: 3 }); await page.waitForTimeout(600);
    assert(!(await info(page)).drag, '움직이면 잡히지 않는다'); await page.mouse.up();
    w = await where(page); const b = w.actors.filter(a => a.sx > w.r.l + 20 && a.sx < w.r.l + w.r.w - 20)[0]; assert(b);
    await page.mouse.move(b.sx, b.sy); await page.mouse.down(); await page.waitForTimeout(520);
    await page.mouse.move(w.r.l + w.r.w * .5, w.r.t + w.r.h * .12, { steps: 6 }); await page.waitForTimeout(500);
    const sky = (await where(page)).actors.find(a => a.held); assert(sky && sky.sy < w.r.t + w.r.h * .45, '하늘 높이 들려 있다 ' + JSON.stringify(sky));
    await page.mouse.up(); await page.waitForTimeout(1800);
    const i = await info(page), d = i.actors.find(a => a.id === sky.id); assert(d && !d.held && ['act', 'walk', 'stand', 'hop', 'spin', 'rest', 'emerge'].includes(d.st) && (d.land === 'fly' || d.z <= -.1), '도로 건너편 끝에 내려앉는다 ' + JSON.stringify(d));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('버스 안(ride)에서는 잡히지 않는다 · 정류장 대기의 대표 캐릭터는 잡아서 옮기면 그 자리에 머문다', async () => {
    const { ctx, page, errs } = await fresh();
    await page.evaluate(ROUTE); await go(page, 3, true);
    assert((await sceneBox(page)).mode === 'ride');
    const r = await page.evaluate(() => { const e = document.getElementById('congScene').getBoundingClientRect(); return { l: e.left, t: e.top, w: e.width, h: e.height }; });
    await page.mouse.move(r.l + r.w * .46, r.t + r.h * .6); await page.mouse.down(); await page.waitForTimeout(520);
    assert(!(await info(page)).drag, 'ride 에서는 잡히지 않는다'); await page.mouse.up();
    await go(page, 1, false); await page.evaluate(() => _CS._tick(2));
    let w = await where(page); const hh = w.actors[0]; assert(hh && (await sceneBox(page)).mode === 'wait');
    // ★ 2026-10-17: 캐릭터가 걷는 중이라 위치를 읽은 뒤 누르기까지 자리를 벗어나 간헐 실패했다 → 누르기 직전에 위치를 다시 읽고, 못 잡으면 최대 4번 다시 시도한다.
    let grabbed = false;
    for (let k = 0; k < 4 && !grabbed; k++) {
      w = await where(page); const h2 = w.actors[0] || hh;
      await page.mouse.move(h2.sx, h2.sy); await page.mouse.down(); await page.waitForTimeout(520);
      grabbed = !!(await info(page)).drag; if (!grabbed) await page.mouse.up();
    }
    assert(grabbed, '대기 캐릭터도 잡힌다');
    await page.mouse.move(r.l + r.w * .85, r.t + r.h * .7, { steps: 6 }); await page.waitForTimeout(500); await page.mouse.up(); await page.waitForTimeout(1500);
    await page.evaluate(() => _CS._tick(5)); const i = await info(page); const d = i.actors[0];
    assert(d.x > w.W * .7 && !d.held, '놓은 자리에 머문다(정류장으로 되돌아가지 않는다) ' + JSON.stringify(d));
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
  await t('(12:00 YJ) 캐릭터별 동작·착지 연출: 엔진 대본(traits)의 모든 동작이 오류 없이 돌아가고, 놓으면 엔진이 정한 land 대로 내려앉은 뒤 바로 움직인다', async () => {
    const { ctx, page, errs } = await fresh({ wx: { temp: -2, rain: 80, txt: '눈' } });     // 눈 → 다이빙(dive)까지 포함
    await page.waitForTimeout(1200);
    const traits = await page.evaluate(() => _CS.last().traits); const LAND = { dolsom: 'cotton', ppopu: 'pose', dudung: 'dig', lovel: 'flip', sul: 'fly', chaeng: 'puddle' };
    for (const id of Object.keys(LAND)) {
      assert(traits[id] && traits[id].land === LAND[id], id + ' 착지 연출은 엔진이 준다: ' + JSON.stringify(traits[id]));
      const acts = [...new Set(traits[id].acts.filter(x => !['walk', 'hop', 'spin', 'rest'].includes(x)))];
      for (const act of acts) {
        await page.evaluate(([id, act]) => _CS._play(id, act, true), [id, act]);
        for (let k = 0; k < 6; k++) { await page.evaluate(() => _CS._tick(1)); const i = await info(page); assert(!i.err, id + ':' + act + ' ' + i.err); }
        const a = (await info(page)).actors[0]; assert(a && ['act', 'walk', 'stand', 'hop', 'spin', 'rest', 'emerge'].includes(a.st), id + ':' + act + ' 끝나면 이어서 움직인다 ' + JSON.stringify(a));
      }
      await page.evaluate(i => _CS._drop(i, 70, true), id);
      const seen = new Set(); for (let k = 0; k < 14; k++) { await page.evaluate(() => _CS._tick(.5)); const a = (await info(page)).actors[0]; if (a) { seen.add(a.act || a.st); assert(!a.held, id + ' 놓았는데 들려 있다'); } }
      assert(seen.has('L_' + LAND[id]) || LAND[id] === 'fly' && seen.has('flyaway'), id + ' 착지 연출이 나온다: ' + [...seen]);
      const z = (await info(page)).actors[0]; assert(z && z.st !== 'fall' && z.st !== 'held' && z.vis, id + ' 연출 뒤 멈춰 있지 않다 ' + JSON.stringify(z));
    }
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('(12:00 YJ) 동작을 고르는 코드가 앱에 없다 — 엔진 traits 이름대로만 한다', async () => {
    const src = fs.readFileSync(html, 'utf8');
    assert(!/var km = a\.km, t = S\.t, w = \{ walk/.test(src), '앱이 가중치로 동작을 고르던 코드가 남아 있다');
    assert(/S\.res\.traits\[a\.id\]/.test(src) && /function landOf/.test(src), '엔진 traits 를 따른다');
  });
  await t('앱에는 장면·구간·날씨 판정 코드가 없다(엔진 값만 그린다)', async () => {
    const src = fs.readFileSync(html, 'utf8');
    ['phaseFor', 'function slotOf', 'function wxKind', 'function seasonOf', '_congLegNode', '_congSubNodeFrom', 'function sceneDecide'].forEach(k => assert(!src.includes(k), '앱에 판정 코드가 남아 있다: ' + k));
    assert(/last\.fill === true/.test(src), '키울지 말지는 엔진의 fill 값을 따른다');
    assert(!/res\.hero && _RC\.d3\[res\.hero\] \? res\.hero : '/.test(src), '대표 캐릭터를 엔진이 안 줬다고 앱이 대신 고르면 안 된다');
    assert(!/S\.res\.cast : _RC\.order/.test(src), '등장 순서를 엔진이 안 줬다고 앱이 대신 정하면 안 된다');
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
  await t('(17:45 YJ) 장면이 바뀌면(경로 탐색·취소 등) TV 전원처럼 꺼졌다 켜진다 — 같은 장면 재적용·크기 변경은 아님, 못 집음', async () => {
    const { ctx, page, errs } = await fresh(); await page.waitForTimeout(800);
    const r = await page.evaluate(() => {
      const last = JSON.parse(JSON.stringify(_CS.last())), w = JSON.parse(JSON.stringify(last)); w.mode = last.mode === 'wait' ? 'idle' : 'wait';
      const out = { before: _CS.info().tv };
      _CS.apply(w); out.tv0 = _CS.info().tv;
      _CS._tick(.2); out.tvOff = _CS.info().tv;                                     // 꺼지는 중: 옛 장면이 납작해지고 가장자리는 어두워진다
      _CS._tick(.17); out.tvHold = _CS.info().tv;   // 암전
      _CS._tick(.3); out.tvOn = _CS.info().tv;                                        // 켜지는 중
      _CS._tick(.5); out.tvEnd = _CS.info().tv;
      _CS.apply(w); out.tvSame = _CS.info().tv;                                       // 같은 장면 재적용: 전환 없음
      return out;
    });
    assert.strictEqual(r.before, -1, 'TV 전환은 평소엔 없다');
    assert.strictEqual(r.tv0, 0, '장면이 바뀌는 순간 시작');
    assert(r.tvOff > .15 && r.tvOff < .3, '꺼지는 중 ' + r.tvOff);
    assert(r.tvHold > .3 && r.tvHold < .38, '암전 ' + r.tvHold);
    assert(r.tvOn > .38 && r.tvOn < .8, '켜지는 중 ' + r.tvOn);
    assert.strictEqual(r.tvEnd, -1, '0.8초 뒤 끝난다');
    assert.strictEqual(r.tvSame, -1, '같은 장면은 전환 없음');
    assert.deepStrictEqual(errs, []); await ctx.close();
  });
  await b.close();
  console.log(`\ncong_scene: ${pass} pass ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
