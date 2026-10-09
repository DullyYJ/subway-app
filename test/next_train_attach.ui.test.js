// 엔진 Worker 연결부(engine/next-train-worker.js)가 경로마다 붙이는 ttWaitMs(타임라인 대기)가
// 앱이 예전에 타임라인에서 직접 계산하던 값(_ttNextDepForSeg + 누적 이동)과 같은지 비교하고,
// ntEnsure(KV·fetch)·/next-train·/ride-eta(boardInfo) 동작을 모의 환경에서 확인한다.
// 실행: node test/next_train_attach.ui.test.js [html 경로]
const assert = require('assert'), path = require('path'), fs = require('fs');
const { chromium } = require('./helpers/pw');
const W = require('./helpers/nt_load')();   // Worker 에 들어가는 모양 그대로 이어 붙여 불러온다
const { ntCreate, NT_INCHEON_TT, NT_STNORDER } = W;
const html = process.argv[2] || path.join(__dirname, '..', 'www', 'index.html');
const bundle = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tt_bundle.json'), 'utf8'));
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n').slice(0, 8).join('\n       ')); } };
const nt = ntCreate({ _REAL_TT: bundle.data._REAL_TT, _GIMPO_TT: bundle.data._GIMPO_TT, _INCHEON_TT: NT_INCHEON_TT, _BUILTIN_TT: bundle.data._BUILTIN_TT, LINE_SCHEDULE: bundle.data.LINE_SCHEDULE, _REAL_SEG: bundle.data._REAL_SEG, _TT_ORDER_HARD: bundle.data._TT_ORDER_HARD, STNORDER: NT_STNORDER });

let seed = 20261009; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const p = await (await b.newContext({ timezoneId: 'Asia/Seoul' })).newPage();
  await p.route('**/*', r => { const u = r.request().url(); if (u.startsWith('file:') || u.startsWith('data:')) return r.continue(); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await p.goto('file://' + html); await p.waitForTimeout(2500);
  await require('./helpers/legacy')(p);   // 옛 시각표 계산 코드를 덧붙인다(앱에서는 지웠다)
  await p.evaluate(bd => { _ttApplyBundle(bd); }, bundle);
  const lineStations = await p.evaluate(() => { const out = {}; const lines = new Set(); for (const k in _REAL_TT) lines.add(k.split('|')[0]); for (const k in _INCHEON_TT) lines.add(k); lines.add('김포골드라인'); for (const l of lines) out[l] = _ttOrderOf(l).slice(); return out; });
  const lines = Object.keys(lineStations).filter(l => lineStations[l].length >= 4);

  // ── 합성 경로 만들기 ──
  const cases = [];
  for (let n = 0; n < 4000; n++) {
    const day = ri(0, 400);                                            // 2026-01-01 ~ 2027-02 사이 임의 날짜
    const baseMs = Date.UTC(2026, 0, 1) - 9 * 3600e3 + day * 86400e3 + ri(0, 86399) * 1000;
    const bf = rnd() < 0.3;
    const legs = []; let sec = ri(0, 900);
    const nLeg = ri(1, 4);
    for (let k = 0; k < nLeg; k++) {
      const w = ri(60, 700); legs.push({ trafficType: 3, startSec: sec, endSec: sec + w, sectionTime: Math.round(w / 60) }); sec += w;
      if (rnd() < 0.2) { const bs = ri(300, 900); legs.push({ trafficType: 2, startSec: sec, endSec: sec + bs, lane: [{ busNo: '1' }], passStopList: { stations: [{ stationName: '가' }, { stationName: '나' }] } }); sec += bs; continue; }
      const line = lines[ri(0, lines.length - 1)], ord = lineStations[line];
      const len = ri(2, Math.min(9, ord.length)), i0 = ri(0, ord.length - len);
      let st = ord.slice(i0, i0 + len); if (rnd() < 0.5) st = st.reverse();
      const d = Math.max(60, len * ri(90, 170)); const wait = ri(0, 400);
      legs.push({ trafficType: 1, lane: [{ name: line }], startSec: sec + wait, endSec: sec + wait + d, passStopList: { stations: st.map(x => ({ stationName: x })) } });
      sec += wait + d;
    }
    const svcWarn = rnd() < 0.15 ? [{ shift: ri(30, 600) }] : null;
    cases.push({ baseMs, bf, legs, svcWarn });
  }
  const appWaits = (cs) => p.evaluate(cs => {
    const out = [];
    for (const c of cs) {
      window._baseTimeMs = c.baseMs;                                   // 앱의 날짜 구분(getDayCode·_isHolidayOrWeekend)이 이 시각을 보게 한다
      const shift = (!c.bf && c.svcWarn) ? c.svcWarn[0].shift * 60000 : 0;
      const _base0 = c.baseMs + shift; let _ttShiftMs = 0; const waits = [];
      for (const l of c.legs) {
        if (l.trafficType !== 1) { waits.push(null); continue; }
        const sg = { type: 1, name: l.lane[0].name, stops: l.passStopList.stations };
        window._TT_GRID_CACHE = null;
        const t = _base0 + l.startSec * 1000 + _ttShiftMs;             // 앱 타임라인 코드와 같은 식(엔진 시각이 있는 구간)
        const _d1 = new Date(t);                                       // 기기 시간대가 KST 라 getHours 가 KST
        const _bm = _d1.getHours() * 60 + _d1.getMinutes() + _d1.getSeconds() / 60;
        const _dep = _ttNextDepForSeg(sg, _bm); let w = null;
        if (_dep != null) { const _w = _dep - _bm; if (_w > 0 && _w <= _TT_MAX_WAIT) { w = Math.round(_w * 60000); _ttShiftMs += w; } }
        waits.push(w);
      }
      out.push(waits);
    }
    window._baseTimeMs = null;
    return out;
  }, cs);
  const appRes = await appWaits(cases);
  await t('기기 시간대가 KST (비교 전제)', async () => { assert.strictEqual(await p.evaluate(() => new Date(0).getTimezoneOffset()), -540); });
  await t('앱의 공휴일 목록 = 엔진 공휴일 목록', async () => { assert.deepStrictEqual(W.NT_HOLIDAYS.slice().sort(), (await p.evaluate(() => _HOLIDAYS_2026.slice())).sort()); });

  await t('ttWaitMs 가 앱의 옛 타임라인 계산과 같다(' + cases.length + '개 경로)', async () => {
    let bad = 0, nWait = 0, nSub = 0; const samples = [];
    cases.forEach((c, i) => {
      const path_ = { info: c.svcWarn ? { svcWarn: c.svcWarn } : {}, subPath: JSON.parse(JSON.stringify(c.legs)) };
      W.ntAttachPath(nt, path_, c.baseMs, c.bf);
      path_.subPath.forEach((l, k) => {
        if (l.trafficType !== 1) { if (l.ttWaitMs != null || l.nextTrain) { bad++; samples.push('비지하철에 값이 붙음 #' + i); } return; }
        nSub++;
        const exp = appRes[i][k];
        if ((l.ttWaitMs == null ? null : l.ttWaitMs) !== exp) { bad++; if (samples.length < 6) samples.push('#' + i + ' leg' + k + ' 앱=' + exp + ' 엔진=' + l.ttWaitMs + ' ' + c.legs[k].lane[0].name + ' base=' + new Date(c.baseMs + 9 * 3600e3).toISOString() + ' bf=' + c.bf); }
        if (exp != null) nWait++;
      });
    });
    console.log('      지하철 구간', nSub, '/ 대기 반영', nWait);
    assert.ok(nWait > 500, '대기가 반영된 사례가 너무 적다 ' + nWait);
    assert.strictEqual(bad, 0, bad + '건 불일치\n' + samples.join('\n'));
  });

  await t('실제 엔진 응답의 경로(test/fixtures/engine_paths.json)도 같다 — 여러 탐색 시각으로', async () => {
    const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'engine_paths.json'), 'utf8'));
    const offs = [0, 3 * 3600e3, -10 * 3600e3, 7.75 * 3600e3, 11 * 3600e3 + 1234, 20 * 3600e3 + 31000];
    const cs = []; fx.paths.forEach(P => P.forEach(pp => offs.forEach(o => offs.length && cs.push({ baseMs: fx.baseMs + o, bf: false, svcWarn: (pp.info && pp.info.svcWarn) || null, legs: pp.subPath }))));
    const exp = await appWaits(cs); let bad = 0, nWait = 0; const samples = [];
    cs.forEach((c, i) => {
      const pa = { info: c.svcWarn ? { svcWarn: c.svcWarn } : {}, subPath: JSON.parse(JSON.stringify(c.legs)) };
      W.ntAttachPath(nt, pa, c.baseMs, false);
      pa.subPath.forEach((l, k) => { if (l.trafficType !== 1) return; const e = exp[i][k]; if ((l.ttWaitMs == null ? null : l.ttWaitMs) !== e) { bad++; if (samples.length < 5) samples.push('#' + i + ' leg' + k + ' 앱=' + e + ' 엔진=' + l.ttWaitMs); } if (e != null) nWait++; });
    });
    console.log('      실제 경로', cs.length, '개 / 대기 반영', nWait);
    assert.ok(nWait > 100); assert.strictEqual(bad, 0, bad + '건 불일치\n' + samples.join('\n'));
  });

  await t('캐시된 경로 객체에 남은 이전 요청 값(ttWaitMs·nextTrain)을 지운다', async () => {
    const c = cases.find((c, i) => appRes[i].some(w => w != null));
    const path_ = { info: {}, subPath: JSON.parse(JSON.stringify(c.legs)) };
    W.ntAttachPath(nt, path_, c.baseMs, c.bf);
    path_.subPath.forEach(l => { if (l.trafficType === 1) l.ttWaitMs = 99999999; });
    W.ntAttachPath(nt, path_, c.baseMs, c.bf);
    path_.subPath.forEach(l => { assert.ok(l.ttWaitMs == null || l.ttWaitMs <= 30 * 60000); });
  });

  await t('startSec 가 없으면 nextTrain 만 붙고 ttWaitMs 는 없다', async () => {
    const leg = { trafficType: 1, lane: [{ name: '2호선' }], passStopList: { stations: [{ stationName: '강남' }, { stationName: '역삼' }] } };
    const path_ = { info: {}, subPath: [leg] };
    W.ntAttachPath(nt, path_, Date.UTC(2026, 9, 8, 0, 0), false);
    assert.ok(leg.nextTrain && leg.nextTrain.dir); assert.strictEqual(leg.ttWaitMs, undefined);
  });

  // ── TAGO·KRIC 로 채운 노선: 방향 힌트(_TT_ORIENT)와 토요일(S) 시각표 ──
  await t('방향 힌트(_TT_ORIENT)가 있는 노선은 시각표 상관보다 힌트로 방향을 정한다', async () => {
    const mk = (orient) => ntCreate({ _REAL_TT: { 'T선|가': { D: { '상': [600, 10], '하': [601, 10] } }, 'T선|나': { D: { '상': [602, 10], '하': [603, 10] } }, 'T선|다': { D: { '상': [604, 10], '하': [605, 10] } } }, _TT_ORIENT: orient, STNORDER: { 'T선': ['가', '나', '다'] } });
    const ms = Date.UTC(2026, 9, 14, 3, 0);
    const a = mk({ 'T선': { order: ['가', '나', '다'], fwd: '하' } });
    assert.strictEqual(a.segDir('T선', [{ stationName: '가' }, { stationName: '다' }], ms), '하행');
    assert.strictEqual(a.segDir('T선', [{ stationName: '다' }, { stationName: '가' }], ms), '상행');
    assert.strictEqual(a.segDir('T선', [{ stationName: '나' }, { stationName: '다' }, { stationName: '나' }].slice(0, 2), ms), '하행');
    const b = mk({ 'T선': { order: ['가', '나', '다'], fwd: '상' } });
    assert.strictEqual(b.segDir('T선', [{ stationName: '가' }, { stationName: '나' }], ms), '상행');
    // 힌트에 없는 역이면 기존 방식(상관 등)으로 넘어간다 — 오류 없이 값이 나오거나 null
    const c = mk({ 'T선': { order: ['가', '나'], fwd: '하' } });
    c.segDir('T선', [{ stationName: '가' }, { stationName: '다' }], ms);
  });
  await t('토요일(S) 시각표: 토요일에는 S, 일요일·공휴일은 W, 평일은 D (S 가 없으면 W)', async () => {
    const rec = { D: { '하': [600, 10] }, W: { '하': [700, 10] }, S: { '하': [800, 10] } }, rec2 = { D: { '하': [600, 10] }, W: { '하': [700, 10] } };
    const nt2 = ntCreate({ _REAL_TT: { 'T선|가': rec, 'U선|가': rec2 } });
    const wd = Date.UTC(2026, 9, 14, 3, 0), sat = Date.UTC(2026, 9, 17, 3, 0), sun = Date.UTC(2026, 9, 18, 3, 0);
    assert.deepStrictEqual(nt2.officialTimes('T선', '가', '하', wd), [600, 610]);
    assert.deepStrictEqual(nt2.officialTimes('T선', '가', '하', sat), [800, 810]);
    assert.deepStrictEqual(nt2.officialTimes('T선', '가', '하', sun), [700, 710]);
    assert.deepStrictEqual(nt2.officialTimes('U선', '가', '하', sat), [700, 710]);
  });
  // ── ntEnsure: KV · 서비스 바인딩 · 내장본 ──
  const bundleTxt = JSON.stringify(bundle);
  const mkKV = (init) => { const m = new Map(init || []); return { m, gets: 0, get: async function (k) { this.gets++; return m.has(k) ? m.get(k) : null; }, put: async (k, v, o) => { m.set(k, v); m.opts = o; } }; };
  const embedBundle = JSON.parse(W.NT_TT_EMBED);
  const realFetch = global.fetch; let fetchN = 0;
  global.fetch = async (u) => { fetchN++; throw new Error('gildongmu-tt 를 fetch 로 부르면 안 된다(404): ' + u); };
  await t('내장 번들: 현재 gildongmu-tt 와 같은 모양(버전·6개 키)', async () => {
    assert.ok(embedBundle.version); ['_REAL_TT', '_GIMPO_TT', '_BUILTIN_TT', 'LINE_SCHEDULE', '_REAL_SEG', '_TT_ORDER_HARD'].forEach(k => assert.ok(embedBundle.data[k], k));
  });
  await t('ntEnsure: KV·바인딩이 없으면 내장본을 쓴다(네트워크 호출 없음) / 이후엔 메모리', async () => {
    W._ntReset(); fetchN = 0; const a = await W.ntEnsure({}); assert.ok(a && a.version === embedBundle.version && a.src === 'embed'); assert.strictEqual(fetchN, 0);
    const kv = mkKV(); const a2 = await W.ntEnsure({ ROWS_KV: kv }); assert.ok(a2 === a); assert.strictEqual(kv.gets, 0);
  });
  await t('ntEnsure: KV 에 있으면 KV 를 우선한다', async () => {
    W._ntReset(); fetchN = 0; const kv = mkKV([['nt:bundle:v1', bundleTxt]]);
    const a = await W.ntEnsure({ ROWS_KV: kv }); assert.ok(a && a.src === 'kv' && a.version === bundle.version); assert.strictEqual(fetchN, 0);
  });
  await t('ntEnsure: 서비스 바인딩(TT_SVC)이 있으면 거기서 받아 KV 에 6시간 둔다', async () => {
    W._ntReset(); const kv = mkKV(); let called = 0;
    const svc = { fetch: async (u) => { called++; assert.ok(String(u).endsWith('/tt')); return { ok: true, text: async () => bundleTxt }; } };
    const a = await W.ntEnsure({ ROWS_KV: kv, TT_SVC: svc }); assert.ok(a && a.src === 'svc' && a.version === bundle.version);
    assert.strictEqual(called, 1); assert.ok(kv.m.has('nt:bundle:v1')); assert.strictEqual(kv.m.opts.expirationTtl, 21600); assert.strictEqual(fetchN, 0);
  });
  await t('ntEnsure: 서비스 바인딩이 실패하면 내장본으로 넘어간다', async () => {
    W._ntReset(); const a = await W.ntEnsure({ TT_SVC: { fetch: async () => { throw new Error('boom'); } } }); assert.ok(a && a.src === 'embed');
    W._ntReset(); const b2 = await W.ntEnsure({ TT_SVC: { fetch: async () => ({ ok: false, status: 500 }) } }); assert.ok(b2 && b2.src === 'embed');
  });
  await t('ntEnsure: KV 내용이 깨져 있어도 내장본으로 동작', async () => { W._ntReset(); const a = await W.ntEnsure({ ROWS_KV: mkKV([['nt:bundle:v1', '{깨짐']]) }); assert.ok(a && a.src === 'embed'); });
  await t('ntEnsure: 동시 호출은 한 번만 만든다', async () => { W._ntReset(); const r = await Promise.all([W.ntEnsure({}), W.ntEnsure({}), W.ntEnsure({})]); assert.ok(r[0] && r[0] === r[1] && r[1] === r[2]); });
  // 내장본까지 못 쓰는 경우(가짜) — 별도 인스턴스
  const WB = require('./helpers/nt_load')({ embed: 'not json' });
  await t('ntEnsure: 아무것도 못 쓰면 null + 사유(why), 30초간 재시도하지 않는다', async () => {
    WB._ntReset(); assert.strictEqual(await WB.ntEnsure({}), null);
    const r = await WB.handleNextTrain(new Request('https://x/next-train?op=board&line=a&from=b&atMin=1'), {}); assert.strictEqual(r.status, 503); const j = await r.json(); assert.ok(/embed/.test(j.why || ''), j.why);
  });
  await t('ntAttachAll: 시각표를 못 불러와도 응답은 그대로(값만 안 붙음)', async () => {
    WB._ntReset(); const od = { result: { path: [{ info: {}, subPath: [{ trafficType: 1, lane: [{ name: '2호선' }], startSec: 10, endSec: 100, passStopList: { stations: [{ stationName: '강남' }, { stationName: '역삼' }] } }] }] } };
    const before = JSON.stringify(od); await WB.ntAttachAll({}, od, Date.now(), false); assert.strictEqual(JSON.stringify(od), before);
  });
  await t('ntAttachAll: 지하철 구간이 없으면 시각표를 불러오지도 않는다', async () => {
    W._ntReset(); const kv = mkKV(); const E = { ROWS_KV: kv };
    await W.ntAttachAll(E, { result: { path: [{ info: {}, subPath: [{ trafficType: 3 }] }] } }, Date.now(), false); assert.strictEqual(kv.gets, 0);
    await W.ntAttachAll(E, null, Date.now(), false); await W.ntAttachAll(E, {}, Date.now(), false); await W.ntAttachAll(E, { result: { path: [] } }, Date.now(), false); assert.strictEqual(kv.gets, 0);
  });
  const ENV = { ROWS_KV: mkKV([['nt:bundle:v1', bundleTxt]]) };   // 시험용 축소 번들은 KV 로 넣는다
  await t('ntAttachAll: 경로마다 붙이고 ntVer 를 단다', async () => {
    W._ntReset(); const c = cases.find((c, i) => appRes[i].some(w => w != null));
    const od = { result: { path: [{ info: c.svcWarn ? { svcWarn: c.svcWarn } : {}, subPath: JSON.parse(JSON.stringify(c.legs)) }] } };
    await W.ntAttachAll(ENV, od, c.baseMs, c.bf); assert.strictEqual(od.ntVer, bundle.version); assert.ok(od.result.path[0].subPath.some(l => l.ttWaitMs > 0)); assert.strictEqual(od.result.path[0].info.ttApplied, true);
  });

  // ── /next-train ──
  const get = (qs) => W.handleNextTrain(new Request('https://x/next-train?' + qs), ENV).then(async r => ({ s: r.status, j: await r.json() }));
  const baseDay = Date.UTC(2026, 9, 8, 0, 0) - 9 * 3600e3;
  await t('/next-train?op=board 가 엔진 boardTable 과 같다', async () => {
    const r = await get('op=board&line=' + encodeURIComponent('2호선') + '&from=' + encodeURIComponent('강남') + '&to=' + encodeURIComponent('역삼') + '&atMin=480.5&baseMs=' + (baseDay + 8 * 3600e3));
    const e = nt.boardTable({ line: '2호선', from: '강남', to: '역삼', atMin: 480.5, baseMs: baseDay + 8 * 3600e3 });
    assert.strictEqual(r.s, 200); assert.deepStrictEqual({ dk: r.j.dk, depMin: r.j.depMin }, { dk: e.dk, depMin: e.depMin }); assert.ok(r.j.ver);
  });
  await t('/next-train?op=times, op=info', async () => {
    const q = 'line=' + encodeURIComponent('2호선') + '&from=' + encodeURIComponent('강남') + '&to=' + encodeURIComponent('역삼') + '&baseMs=' + (baseDay + 8 * 3600e3);
    const a = await get('op=times&' + q), e = nt.boardTimes({ line: '2호선', from: '강남', to: '역삼', baseMs: baseDay + 8 * 3600e3 });
    assert.deepStrictEqual(a.j.times, e.times); assert.ok(a.j.times && a.j.times.length > 100);
    const i = await get('op=info&' + q); assert.ok(i.j.info && i.j.info.dir);
  });
  await t('/next-train?op=fwd', async () => {
    const r = await get('op=fwd&line=' + encodeURIComponent('2호선') + '&from=' + encodeURIComponent('강남') + '&to=' + encodeURIComponent('잠실') + '&term=' + encodeURIComponent('성수행'));
    assert.strictEqual(r.s, 200); assert.strictEqual(r.j.fwd, nt.forward('2호선', '강남', '잠실', '성수행'));
    const r2 = await get('op=fwd&line=' + encodeURIComponent('2호선') + '&from=' + encodeURIComponent('강남') + '&term=' + encodeURIComponent('성수'));
    assert.strictEqual(r2.j.fwd, null);
  });
  await t('/next-train: 인자 부족은 400, OPTIONS 는 204', async () => {
    assert.strictEqual((await get('op=board&line=2호선')).s, 400);
    assert.strictEqual((await get('op=board&line=' + encodeURIComponent('2호선') + '&from=' + encodeURIComponent('강남'))).s, 400);
    assert.strictEqual((await W.handleNextTrain(new Request('https://x/next-train', { method: 'OPTIONS' }), ENV)).status, 204);
  });
  await t('/next-train POST 여러 건', async () => {
    const items = [{ id: 'a', op: 'board', line: '2호선', from: '강남', to: '역삼', atMin: 600, baseMs: baseDay }, { id: 'b', op: 'times', line: '2호선', from: '강남', to: '역삼', baseMs: baseDay }, { id: 'c', op: 'board', line: '2호선' }];
    const r = await W.handleNextTrain(new Request('https://x/next-train', { method: 'POST', body: JSON.stringify({ items }) }), ENV); const j = await r.json();
    assert.strictEqual(j.items.length, 3); assert.deepStrictEqual(j.items.map(x => x.id), ['a', 'b', 'c']); assert.ok(j.items[0].depMin != null); assert.ok(j.items[1].times); assert.ok(j.items[2].error);
  });
  
  // ── /ride-eta boardInfo ──
  await t('/ride-eta: boardInfo 가 오면 timetable 을 채워 기존 handleRideEta 로 넘기고, 없으면 그대로 넘긴다', async () => {
    W._ntReset(); 
    const seen = []; global.handleRideEta = (req) => req.method !== 'POST' ? Promise.resolve(new Response(null, { status: 204 })) : req.clone().json().then(b => { seen.push(b); return new Response('{}'); });
    const mk = (body) => new Request('https://x/ride-eta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    await W.handleRideEtaNT(mk({ nowMs: baseDay + 8 * 3600e3, boardInfo: { boardIdx: 2, line: '2호선', from: '강남', to: '역삼' } }), ENV);
    assert.ok(seen[0].timetable && seen[0].timetable.boardIdx === 2 && seen[0].timetable.times.length > 100); assert.strictEqual(seen[0].boardInfo, undefined);
    await W.handleRideEtaNT(mk({ nowMs: 1, timetable: { boardIdx: 1, times: [1, 2] }, boardInfo: { line: '2호선', from: '강남' } }), {});
    assert.deepStrictEqual(seen[1].timetable, { boardIdx: 1, times: [1, 2] });
    await W.handleRideEtaNT(mk({ nowMs: 1, foo: 1 }), {}); assert.strictEqual(seen[2].foo, 1);
    await W.handleRideEtaNT(new Request('https://x/ride-eta', { method: 'OPTIONS' }), {}); assert.strictEqual(seen.length, 3);
  });
  global.fetch = realFetch;
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
