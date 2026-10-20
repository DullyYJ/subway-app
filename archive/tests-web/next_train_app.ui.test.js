// 앱이 '다음 열차'를 엔진 값으로 그리는지 확인한다 (2026-10-09 시각표 계산을 앱에서 엔진으로 옮긴 뒤).
//  · 경로 응답의 구간별 ttWaitMs(엔진 계산)를 타임라인이 그대로 더해 그린다 / 없으면 대기 0 (옛 엔진·시각표 없음에도 안전)
//  · 브리핑 '다음 열차'(_metroNextTrainInfo)는 구간의 nextTrain 을 문장 재료로 옮긴다
//  · 승차 시각 재조회·방향 판정·승차역 시각표는 /next-train 으로 엔진에 묻는다 — 여기서는 실제 엔진 코드(engine/*.js)가 그 요청에 답한다
// 실행: node test/next_train_app.ui.test.js [html 경로]
const assert = require('assert'), path = require('path'), fs = require('fs');
const { chromium } = require('./helpers/pw');
const { resp } = require('./helpers/engine_fixture');
const W = require('./helpers/nt_load')();
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const bundleTxt = fs.readFileSync(path.join(__dirname, 'fixtures', 'tt_bundle.json'), 'utf8');
global.fetch = async () => ({ ok: true, text: async () => bundleTxt });     // 엔진의 시각표 번들(gildongmu-tt) 모의
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n').slice(0, 5).join('\n       ')); } };

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext({ timezoneId: 'Asia/Seoul', viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage(); const errs = []; const reqs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.route('**/*', async r => {
    const req = r.request(), u = new URL(req.url());
    if (u.protocol === 'file:' || u.protocol === 'data:') return r.continue();
    const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: H });
    if (u.pathname === '/next-train') {                    // 실제 엔진 코드가 답한다
      reqs.push(req.method() + ' ' + u.search + (req.postData() || ''));
      const er = await W.handleNextTrain(new Request(req.url(), { method: req.method(), body: req.method() === 'POST' ? req.postData() : undefined }), {});
      return r.fulfill({ status: er.status, headers: H, body: await er.text() });
    }
    return r.fulfill({ status: 200, headers: H, body: '{}' });
  });
  await p.goto('file://' + html); await p.waitForTimeout(2500);

  const draw = (waits) => p.evaluate((waits) => {
    const path0 = JSON.parse(JSON.stringify(window.__path0));
    let k = 0; path0.subPath.forEach(l => { if (l.trafficType === 1) { const w = waits[k++]; if (w !== undefined) l.ttWaitMs = w; } });
    const route = _convertSinglePathToRoute(path0);
    window._routeBaseMs = Date.now();
    _renderHtlTrack(route.sections, { name: '서울역' }, { name: '수원역' }, 50);
    return { wait: window._htlWaitMin, tl: window._htlTlTotalMin };
  }, waits);
  await p.evaluate(path0 => { window.__path0 = path0; }, resp().result.path[0]);

  await t('엔진이 준 구간별 대기(ttWaitMs)를 타임라인이 그대로 더해 그린다', async () => {
    const base = await draw([]);
    const withW = await draw([240000, 90000]);
    assert.ok(Math.abs(withW.wait - 5.5) < 1e-6, 'wait ' + withW.wait);
    assert.ok(Math.abs((withW.tl - base.tl) - 5.5) < 1e-6, '총 소요 증가분 ' + (withW.tl - base.tl));
    assert.strictEqual(base.wait, 0);
  });
  await t('ttWaitMs 가 없거나 0·음수·이상한 값이면 대기 0(옛 엔진·시각표 없음에도 안전)', async () => {
    const base = await draw([]);
    for (const w of [[null, null], [0, 0], [-5000, undefined], [NaN, 'x']]) { const r = await draw(w); assert.strictEqual(r.wait, 0, JSON.stringify(w)); assert.strictEqual(r.tl, base.tl); }
  });
  await t('앞 구간 대기는 뒤 구간 출발·도착에 이어진다', async () => {
    const r = await p.evaluate(() => {
      const path0 = JSON.parse(JSON.stringify(window.__path0)); const subs = path0.subPath.filter(l => l.trafficType === 1); subs[0].ttWaitMs = 180000;
      const route = _convertSinglePathToRoute(path0); window._routeBaseMs = Date.now();
      _renderHtlTrack(route.sections, { name: '서울역' }, { name: '수원역' }, 50);
      return { tl: window._htlTlTotalMin, w: window._htlWaitMin };
    });
    const base = await draw([]);
    assert.ok(Math.abs(r.tl - base.tl - 3) < 1e-6 && Math.abs(r.w - 3) < 1e-6, JSON.stringify([r, base]));
  });
  await t('경로 변환이 ttWaitMs·nextTrain 을 구간에 실어 준다', async () => {
    const r = await p.evaluate(() => { const path0 = JSON.parse(JSON.stringify(window.__path0)); const s = path0.subPath.find(l => l.trafficType === 1); s.ttWaitMs = 1000; s.nextTrain = { found: true, depMin: 600, firstMin: null, dir: '하' }; const a = _convertSinglePathToRoute(path0).sections.find(x => x.transportation.type === 1); const b = _convertEngineRoutes({ result: { path: [path0] } }).routes[0].sections.find(x => x.transportation.type === 1); return [a.ttWaitMs, a.nextTrain, b.ttWaitMs, b.nextTrain]; });
    assert.deepStrictEqual(r, [1000, { found: true, depMin: 600, firstMin: null, dir: '하' }, 1000, { found: true, depMin: 600, firstMin: null, dir: '하' }]);
  });

  // ── 브리핑 '다음 열차' ──
  const info = (nt, ageMs, mins, type) => p.evaluate(({ nt, ageMs, mins, type }) => {
    window._transitResultData = { routes: [{ summary: { duration: 3000 }, sections: [{ transportation: { type: type || 1, name: '2호선' }, duration: 600, passStopList: { stationList: [{ stationName: '강남' }, { stationName: '역삼' }, { stationName: '선릉' }] }, nextTrain: nt }] }] };
    window._routeBaseMs = Date.now() - ageMs;
    window.kstMinutesAdj = () => 600;
    return _metroNextTrainInfo(mins);
  }, { nt, ageMs, mins, type });
  await t('브리핑: 엔진이 준 다음 열차를 그대로 옮긴다(도착 = 출발 + 소요)', async () => {
    const r = await info({ found: true, depMin: 605, firstMin: null, dir: '하' }, 1000, 25);
    assert.deepStrictEqual([r.found, r.depMin, r.arrMin, r.firstMin, r.line, r.stn, r.dir], [true, 605, 630, null, '2호선', '강남', '하']);
  });
  await t('브리핑: 막차 뒤면 첫차 시각을 옮긴다', async () => {
    const r = await info({ found: false, depMin: null, firstMin: 330, dir: '상' }, 1000, 25);
    assert.deepStrictEqual([r.found, r.depMin, r.firstMin, r.dir], [false, null, 330, '상']);
  });
  await t('브리핑: 엔진이 모르는 구간(nextTrain 없음·버스 첫 구간)은 모름(found:null)', async () => {
    assert.strictEqual((await info(null, 1000, 25)).found, null);
    assert.strictEqual((await info({ found: true, depMin: 605, dir: '하' }, 1000, 25, 2)).found, null);
  });
  await t('브리핑: 탐색한 지 오래됐고 이미 떠난 열차면 보여 주지 않고, 엔진에 지금 기준으로 다시 묻는다', async () => {
    reqs.length = 0;
    const r = await info({ found: true, depMin: 590, firstMin: null, dir: '하' }, 10 * 60000, 25);
    assert.strictEqual(r.found, null);
    await p.waitForTimeout(500);
    assert.ok(reqs.some(q => /op=info/.test(q) && /line=2%ED%98%B8%EC%84%A0/.test(q)), JSON.stringify(reqs));
  });

  // ── 승차 시각 재조회: 엔진 /next-train ──
  await t('승차역 다음 열차(_boardNextDepTable)는 엔진이 답한다(실시간 없는 노선)', async () => {
    reqs.length = 0;
    const r = await p.evaluate(() => new Promise(res => { window._baseTimeMs = null; _boardNextDepTable({ lineName: '2호선', name: '강남' }, { name: '역삼' }, 600.25, (m, dk) => res([m, dk])); }));
    assert.ok(typeof r[0] === 'number' && r[0] >= 600.25 && r[0] < 600.25 + 30, JSON.stringify(r));
    assert.ok(r[1] === '상' || r[1] === '하');
    assert.ok(reqs.some(q => /op=board/.test(q) && /atMin=600.25/.test(q)), JSON.stringify(reqs));
  });
  await t('승차역 정보가 없거나 시각표가 없으면 null (앱이 대신 계산하지 않는다)', async () => {
    const r = await p.evaluate(() => new Promise(res => { _boardNextDepTable(null, null, 600, (m) => res(['a', m])); }));
    assert.deepStrictEqual(r, ['a', null]);
    const r2 = await p.evaluate(() => new Promise(res => { _boardNextDepTable({ lineName: '없는노선', name: '없는역' }, null, 600, (m, dk) => res(['b', m, dk])); }));
    assert.strictEqual(r2[0], 'b');
  });
  await t('열차 진행 방향(_ntForward): 한 번에 묻고 결과를 기억한다 / 못 물으면 null', async () => {
    reqs.length = 0;
    const a = await p.evaluate(() => new Promise(res => _ntForward('2호선', '강남', '잠실', ['성수', '신도림', '성수'], res)));
    assert.deepStrictEqual(Object.keys(a).sort(), ['성수', '신도림'].sort());
    assert.ok(reqs.filter(q => q.startsWith('POST')).length === 1);
    const n = reqs.length;
    const a2 = await p.evaluate(() => new Promise(res => _ntForward('2호선', '강남', '잠실', ['성수'], res)));
    assert.strictEqual(reqs.length, n, '두 번째는 기억해 둔 값');
    assert.deepStrictEqual(a2['성수'], a['성수']);
  });
  await t('엔진에 못 닿으면 방향 판정은 null(거르지 않음)·시각표는 null', async () => {
    const q = await b.newContext({ timezoneId: 'Asia/Seoul' }); const pg = await q.newPage();
    await pg.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:') || u.startsWith('data:')) return r.continue(); return r.abort('failed'); });
    await pg.goto('file://' + html); await pg.waitForTimeout(2000);
    const r = await pg.evaluate(() => Promise.all([new Promise(res => _ntForward('2호선', '강남', '잠실', ['성수'], res)), new Promise(res => _boardNextDepTable({ lineName: '2호선', name: '강남' }, null, 600, (m) => res(m)))]));
    assert.deepStrictEqual(r, [{ '성수': null }, null]);
    await q.close();
  });
  await t('_resolveTrainDepartMs: 출발지 시각표를 엔진에 물어 대기·표시 시각을 만든다', async () => {
    const r = await p.evaluate(() => new Promise(res => { S.start = { line: '2호선', name: '강남' }; S.dest = { name: '역삼' }; _resolveTrainDepartMs(Date.now(), res); }));
    assert.ok(r && (r.depTime === null || /^\d\d:\d\d$/.test(r.depTime)), JSON.stringify(r));
    assert.ok(['상행', '하행'].includes(await p.evaluate(() => S._nextTrainDir)));
  });
  await t('엔진 요청(_etaPayload)에는 시각표 대신 승차역 정보(boardInfo)만 실린다', async () => {
    const P = await p.evaluate(() => {
      window._transitNodeData = [{ isOrigin: true, name: '내 위치' }, { isWalk: true, name: '도보' }, { isSub: true, lineName: '2호선', name: '강남', _schedMin: 600 }, { isSub: true, lineName: '2호선', name: '역삼', _schedMin: 603 }];
      window._htlBoarded = true;
      return _etaPayload();
    });
    assert.deepStrictEqual(P.boardInfo, { boardIdx: 2, line: '2호선', from: '강남', to: '역삼' }); assert.strictEqual(P.timetable, undefined);
  });
  await t('앱에 시각표 데이터·계산이 남아 있지 않다(엔진으로 이전)', async () => {
    const gone = await p.evaluate(() => ['_REAL_TT', '_INCHEON_TT', '_GIMPO_TT', '_BUILTIN_TT', '_TT_ORDER_HARD', '_ttSegDir', '_ttNextDepForSeg', '_ttOfficialTimes', 'getNextDepartureMins', '_ttApplyBundle', 'tagoGetNextDep', '_rtArrForward', '_boardDirKey', '_htlTagoWarm', 'loadTimetable'].filter(n => typeof window[n] !== 'undefined'));
    assert.deepStrictEqual(gone, []);
  });
  await t('예상 시각 모드면 경로 요청에 bf=1 을 붙인다(소스 확인)', async () => {
    const src = fs.readFileSync(html, 'utf8');
    assert.ok(/_baseTimeMs !== 'undefined' && _baseTimeMs != null\) \? '&bf=1' : ''/.test(src));
  });
  await t('JS 오류가 없다', async () => { assert.deepStrictEqual(errs, []); });
  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
