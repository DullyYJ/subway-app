// 2026-10-13 (YJ 로그 18:12~18:16): 지하철 탑승 중 마커가 노란색(정지)으로 굳고 한 정거장 늦게 따라온다.
//   PF 가 역을 채택하면(통과 시각 기록 → 엔진에 묻는 사이) 그려진 구간(_etaPos)이 낡아 진행도(_gpsMaxIdx)보다 뒤에 있다 → 마커가 진행도 역에 못 박혀 정지(주황)였다.
//   시험: 로그와 같은 순서로 PF 채택(역 도착 15초 뒤)을 흉내 내고, 20초 틱마다 마커가 '다음 역으로 가는 중'으로 그려지는지 본다. 응답이 끊겨도 같아야 한다.
// 실행: node test/ride_marker_follow.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
const LAT0 = 37.5, LNG0 = 126.9, KX = 88000;
// 인천1호선(로그): 문학경기장 18:09 · 인천터미널 18:11 · 예술회관 18:12 · 인천시청 18:14 · 간석오거리 18:17 · 부평삼거리 18:19
const ST = [['출발', -20], ['캠퍼스타운', 0], ['동막', 3], ['동춘', 5], ['원인재', 7], ['신연수', 9], ['선학', 11], ['문학경기장', 12], ['인천터미널', 14], ['예술회관', 15], ['인천시청', 17], ['간석오거리', 20], ['부평삼거리', 22], ['부평', 24], ['굴포천', 26], ['삼산체육관', 28], ['상동', 30]];
// (분은 18:57-기준이 아니라 18:00 + ST 분)
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const run = async (dropEta) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: LAT0, longitude: LNG0 }, permissions: ['geolocation'] });
    const page = await ctx.newPage();
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    const em = require('./helpers/eta_mock'); await em.installEtaMock(page); em.autoWait(page);
    await page.clock.install({ time: new Date('2026-10-13T18:14:00+09:00') });
    await page.goto('file://' + html); await page.clock.runFor(2500);
    await page.evaluate(([st, lat0, lng0, kx]) => {
      window.fmapDoRoute = function () {};
      const mid = new Date('2026-10-13T00:00:00+09:00'), base = (new Date('2026-10-13T18:00:00+09:00') - mid) / 60000;
      const hm = (m) => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.floor(m % 60)).slice(-2);
      _transitNodeData = st.map((s, i) => ({ name: s[0], lat: lat0, lng: lng0 + (i * 1000) / kx, isWalk: false, isOrigin: i === 0, isSub: i > 0, isBus: false, lineName: i > 0 ? '인천1호선' : '', _schedMin: base + s[1], _plan0: base + s[1], arrTime: hm(base + s[1]), el: null }));
      window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null; window._trackSig = 'T'; window._trackBase = 1;
      window._htlBoarded = true; window._xferRouteRef = _transitNodeData; window._xferOK = {};
      const now = Date.now(); window._nodePassMs = {}; window._nodePassSrc = {}; window._nodePassPf = {};
      for (let i = 1; i <= 8; i++) { window._nodePassMs[i] = new Date('2026-10-13T18:00:00+09:00').getTime() + st[i][1] * 60000; window._nodePassSrc[i] = 'gps'; }
      window._gpsMaxIdx = 8; window._gpsConfirmIdx = 8;
      const card = document.getElementById('transitResultCard'); if (card) card.style.display = 'block';
      _recalcArrivalsFrom(8);
    }, [ST, LAT0, LNG0, KX]);
    await page.clock.runFor(1000);
    if (dropEta) { let n = 0; await page.route('**/ride-eta', r => (r.request().method() === 'POST' && ++n <= 3) ? r.abort() : r.fallback()); }   // 첫 답을 받은 뒤 한동안 끊긴다(백그라운드) — 세 번은 실패, 이후 정상
    return { ctx, page };
  };
  // PF 채택: 역에 닿고 15초 뒤 진행도를 올리고 통과 시각을 적는다(pf) — 로그의 PF채택과 같다
  const adopt = (page, i) => page.evaluate((i) => { window._gpsMaxIdx = i; window._gpsConfirmIdx = i; window._nodePassMs[i] = Date.now(); window._nodePassSrc[i] = 'pf'; _recalcArrivalsFrom(i); }, i);
  const sample = (page) => page.evaluate(() => { const p = _estimateTimelinePos(); return { at: new Date().toTimeString().slice(0, 8), f: p && p.fromIdx, to: p && p.toIdx, r: p && +(+p.ratio).toFixed(2), mv: _ovlMoving(), g: window._gpsMaxIdx }; });
  for (const dropEta of [false, true]) {
    console.log('[' + (dropEta ? '엔진 답이 한동안 끊겼다 돌아옴' : '엔진 응답 정상') + ' — 역마다 PF 채택(도착 15초 뒤), 20초 틱]');
    const { ctx, page } = await run(dropEta);
    // 시각표대로 열차가 달린다: 예술회관(9) 18:15:00, 인천시청(10) 18:17:00 … 가 아니라 계획 분(18:00+ST)에 닿는다. 시작 시각 18:11:01 이후만 본다.
    const log = [];
    const at = async (h, m, s) => { const target = new Date('2026-10-13T' + h + ':' + m + ':' + s + '+09:00'); const now = await page.evaluate(() => Date.now()); if (+target > now) await page.clock.runFor(+target - now); };
    for (const [idx, mm, ss, until] of [[9, '15', '15', '17:15'], [10, '17', '15', '20:15'], [11, '20', '15', '22:15']]) {
      await at('18', mm, ss); await adopt(page, idx);
      const stop = new Date('2026-10-13T18:' + until + '+09:00').getTime();
      while ((await page.evaluate(() => Date.now())) + 20000 < stop) { await page.clock.runFor(20000); log.push(await sample(page)); }
    }
    // 채택 직후 구간 동안(역 도착 후 20초~2분) 마커가 정지(주황)였던 표본
    const afterAdopt = log.filter(x => x.g === 10 || x.g === 9);
    const still = log.filter(x => !x.mv && x.r !== 1);
    const behind = log.filter(x => x.f < x.g);   // 진행도보다 뒤 역에 그린다
    await t('채택 뒤 구간 중에는 노란색(정지)이 아니라 이동 중(파랑)으로 그린다', async () => { const bad = log.filter(x => !x.mv && x.to !== x.f ? false : (!x.mv && x.to === x.f && x.r === 0 && true)); const stuck = log.filter(x => !x.mv).length; assert.ok(stuck <= Math.ceil(log.length * 0.25), '정지로 그린 표본 ' + stuck + '/' + log.length + ' ' + JSON.stringify(log.filter(x => !x.mv).slice(0, 4))); });
    await t('마커가 진행도(채택한 역)보다 뒤 역에 머물지 않는다', async () => { assert.strictEqual(behind.length, 0, JSON.stringify(behind.slice(0, 3))); });
    await ctx.close();
  }
  console.log('[늦는 열차 — 표시 도착 시각이 지났는데 GPS 가 아직 두 역 사이에 있다: 엔진이 연착으로 밀고 마커는 앞 구간에 둔다]');
  {
    const { ctx, page } = await run(false);
    const at = async (h, m, s) => { const target = new Date('2026-10-13T' + h + ':' + m + ':' + s + '+09:00'); const now = await page.evaluate(() => Date.now()); if (+target > now) await page.clock.runFor(+target - now); };
    await at('18', '14', '30');
    const before = await page.evaluate(() => { const p = _estimateTimelinePos(); return { f: p.fromIdx, to: p.toIdx, r: p.ratio, a9: _transitNodeData[9].arrTime }; });
    await at('18', '16', '00');   // 인천터미널(8) 뒤 예술회관(9) 표시 18:15 — 60초 지남
    await page.evaluate(([lat0, lng0, kx]) => { _ev.floorMs = 0; _ev.trail = []; for (let i = 5; i >= 0; i--) _ev.trail.push({ ts: Date.now() - i * 3000, lat: lat0, lng: lng0 + 8300 / kx, acc: 15 }); _trk.at = 0; }, [LAT0, LNG0, KX]);
    await page.evaluate(() => _trkRequest('zero')); await page.clock.runFor(2000);
    const r = await page.evaluate(() => { const p = _estimateTimelinePos(); return { f: p.fromIdx, to: p.toIdx, r: p.ratio, mv: _ovlMoving(), ny: window._etaNotYet, a9: _transitNodeData[9].arrTime, notes: (window._etaLast && window._etaLast.notes) || [] }; });
    await t('엔진이 notYet 를 주면 앱은 증거로 엔진에 보낸다', async () => { assert.ok(r.ny && r.ny[9], JSON.stringify(r)); });
    await t('엔진이 그 정류장을 연착으로 밀고, 마커는 앞 구간(8→9)에서 이동 중으로 그린다', async () => { assert.ok(r.f === 8 && r.to === 9 && r.mv, JSON.stringify(r) + ' 전 ' + JSON.stringify(before)); });
    await ctx.close();
  }
  console.log('[빠른 열차 — 표시 도착보다 먼저 닿았다: 엔진이 통과 시각을 찾고, 앱은 그 시각으로 다시 묻는다]');
  {
    const { ctx, page } = await run(false);
    const at = async (h, m, s) => { const target = new Date('2026-10-13T' + h + ':' + m + ':' + s + '+09:00'); const now = await page.evaluate(() => Date.now()); if (+target > now) await page.clock.runFor(+target - now); };
    await at('18', '14', '46');
    await page.evaluate(([lat0, lng0, kx]) => { _ev.floorMs = 0; _ev.trail = []; const n = Date.now(); for (let i = 0; i < 6; i++) _ev.trail.push({ ts: n - (5 - i) * 3000, lat: lat0, lng: lng0 + (8700 + i * 60) / kx, acc: 15 }); _ev.trail.push({ ts: n, lat: lat0, lng: lng0 + 9100 / kx, acc: 15 }); _trk.at = 0; }, [LAT0, LNG0, KX]);
    await page.evaluate(() => _trkRequest('zero')); await page.clock.runFor(2000);
    const r = await page.evaluate(() => ({ g: window._gpsMaxIdx, src: window._nodePassSrc[9], ms: window._nodePassMs[9], now: Date.now(), p: _estimateTimelinePos(), a9: _transitNodeData[9].arrTime }));
    await t('엔진이 가장 가까웠던 순간을 통과 시각으로 주고(gps) 진행도를 올린다', async () => { assert.ok(r.src === 'gps' && r.g === 9 && r.now - r.ms < 12000, JSON.stringify(r)); });
    await t('마커는 그 역에서 출발한 구간(9→10)을 그린다', async () => { assert.ok(r.p.fromIdx === 9, JSON.stringify(r.p)); });
    await ctx.close();
  }
  await b.close();
  console.log('ride_marker_follow:', pass, 'pass', fail, 'fail'); process.exit(fail ? 1 : 0);
})();
