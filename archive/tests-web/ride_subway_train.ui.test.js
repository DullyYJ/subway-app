// 지하철 — 탄 열차 식별(승차역 출발 시각 매칭)·GPS 확인·방향 필터 — 2026-10-11
//   realtimePosition 은 모의 응답(window.seoulFetch 대체)으로 시험한다. 열차 위치는 단계별로 직접 바꿔 가며 _rtPoll 을 부른다.
// 실행: node test/ride_subway_train.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh() {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.clock.install({ time: new Date('2026-10-11T12:40:00+09:00') });
    await page.goto('file://' + html); await page.clock.runFor(2500);
    // 1호선 9개 역(S0..S8, 1.2km 간격 동쪽). 노드 인덱스: 0=출발 1..9=S0..S8. 12:52 S0 출발, 역간 2분.
    await page.evaluate(() => {
      const base = new Date('2026-10-11T12:52:00+09:00'), midnight = new Date('2026-10-11T00:00:00+09:00');
      const nodes = [{ name: '출발', lat: 37.5, lng: 126.9 - 0.004, isOrigin: true, isWalk: false, isSub: false, isBus: false, _schedMin: (base - midnight) / 60000 - 5, el: null }];
      for (let i = 0; i < 9; i++) { const m = (base - midnight) / 60000 + i * 2; nodes.push({ name: 'S' + i, lat: 37.5, lng: 126.9 + 0.0137 * i, isSub: true, isBus: false, isWalk: false, isOrigin: false, lineName: '1호선', _schedMin: m, arrTime: ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.floor(m % 60)).slice(-2), el: null }); }
      _transitNodeData = nodes;
      window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null; window._trackSig = 'T1'; window._trackBase = 1;
      window._gpsMaxIdx = -1; window._gpsConfirmIdx = -1; window._nodePassMs = {}; window._htlBoarded = false;
      const card = document.getElementById('transitResultCard'); if (card) card.style.display = 'block';
      window.__trains = []; window.__feedFail = false;
      window.seoulFetch = async () => (window.__feedFail ? null : { realtimePositionList: window.__trains.map(x => Object.assign({ subwayId: '1001', statnTnm: 'T' }, x)) });
      window._ntForward = (line, from, to, terms, cb) => { const o = {}; (terms || []).forEach(tm => { o[tm] = (window.__oppTerms || []).indexOf(tm) >= 0 ? false : null; }); cb(o); };
      window.__oppTerms = [];
    });
    const app = { ctx, page, errs };
    app.trains = (list) => page.evaluate((l) => { window.__trains = l; }, list);
    app.poll = async (secsAfter) => { await page.evaluate(() => window._rtPoll()); if (secsAfter) await page.clock.runFor(secsAfter * 1000); };
    app.board = () => page.evaluate(() => { window._htlBoarded = true; window._rideEvStartMs = Date.now(); window._gpsMaxIdx = Math.max(window._gpsMaxIdx, 1); window._gpsConfirmIdx = Math.max(window._gpsConfirmIdx, 1); });
    app.st = () => page.evaluate(() => ({ lock: window._rtTrain ? { no: window._rtTrain.trainNo, v: !!window._rtTrain.verified } : null, gm: window._gpsMaxIdx, veto: window._rtVetoUntil > Date.now() }));
    app.diag = () => page.evaluate(() => { try { return (JSON.parse(localStorage.getItem('ovlDiag') || '[]') || []).map(String); } catch (e) { return []; } });
    return app;
  }
  const T = (no, stn, sttus, term, updn) => ({ trainNo: no, statnNm: stn, trainSttus: String(sttus), statnTnm: term || 'T', updnLine: String(updn == null ? 1 : updn) });

  console.log('[① 앞차를 잠갔지만 실제로 탄 열차(U)로 다시 잠근다]');
  let a = await fresh();
  await a.trains([T('L', 'S1', 1)]); await a.poll(15);                 // 승차역엔 열차가 없고, 이미 한 칸 앞서 간 L 이 가장 가깝다
  await t('탑승 전에는 가장 가까운 L 을 잠근다', async () => assert.deepStrictEqual((await a.st()).lock, { no: 'L', v: false }));
  await a.trains([T('L', 'S2', 1), T('U', 'S0', 1)]); await a.poll(15);   // U 가 승차역에 선다
  await a.trains([T('L', 'S3', 1), T('U', 'S0', 2)]); await a.poll(15);   // U 가 출발 상태
  await a.board();                                                         // 내가 움직이기 시작(탑승 확정)
  await a.trains([T('L', 'S3', 1), T('U', 'S1', 0)]); await a.poll(15);   // U 가 다음 역에서 보인다
  let s = await a.st();
  await t('탑승 후 승차역을 같은 시각에 출발한 U 로 다시 잠근다(verified)', async () => assert.deepStrictEqual(s.lock, { no: 'U', v: true }, JSON.stringify(s)));
  await t('진행도가 앞서 간 L(S3)이 아니라 내 열차 U 위치(S1)다', async () => assert.strictEqual(s.gm, 2, 'gm=' + s.gm));
  await t('진단에 열차매칭이 남는다', async () => assert.ok((await a.diag()).some(x => /열차매칭/.test(x) && /L → U/.test(x))));
  await t('JS 오류가 없다', async () => assert.deepStrictEqual([...new Set(a.errs)], []));
  await a.ctx.close();

  console.log('[② 승차역 출발 시각이 비슷한 열차가 둘이면 고르지 않고 기존 잠금을 유지한다]');
  a = await fresh();
  await a.trains([T('L', 'S1', 1)]); await a.poll(15);
  await a.trains([T('L', 'S2', 1), T('M', 'S0', 1)]); await a.poll(15);
  await a.trains([T('L', 'S3', 1), T('M', 'S1', 0), T('U', 'S0', 1)]); await a.poll(15);   // M 이 떠나자마자 U 가 들어와 선다
  await a.trains([T('L', 'S3', 1), T('M', 'S1', 1), T('U', 'S0', 2)]); await a.poll(15);
  await a.board();
  await a.trains([T('L', 'S4', 1), T('M', 'S2', 1), T('U', 'S1', 0)]); await a.poll(15);
  s = await a.st();
  await t('애매하면 기존 잠금(L)이 그대로이고 verified 가 아니다', async () => assert.deepStrictEqual(s.lock, { no: 'L', v: false }, JSON.stringify(s)));
  await t('고르지 않았다는 진단이 남는다', async () => assert.ok((await a.diag()).some(x => /열차매칭/.test(x) && /고르지 않음/.test(x))));
  await a.ctx.close();

  console.log('[③ 반대 방향 열차(다음 역으로 안 가는 열차)는 후보가 아니다]');
  a = await fresh();
  await a.trains([T('L', 'S1', 1)]); await a.poll(15);
  await a.trains([T('L', 'S2', 1), T('O', 'S0', 2, 'OPP', 0)]); await a.poll(15);   // 반대 방향 열차가 승차역에서 '출발'로 보이지만 우리 구간으로는 안 간다
  await a.board();
  await a.trains([T('L', 'S3', 1)]); await a.poll(15);
  s = await a.st();
  await t('승차역을 떠난 뒤 우리 구간에서 보이지 않는 열차는 고르지 않는다', async () => assert.deepStrictEqual(s.lock, { no: 'L', v: false }, JSON.stringify(s)));
  await a.ctx.close();

  console.log('[④ 탑승이 확정되지 않았으면 매칭하지 않는다]');
  a = await fresh();
  await a.trains([T('L', 'S1', 1)]); await a.poll(15);
  await a.trains([T('L', 'S2', 1), T('U', 'S0', 1)]); await a.poll(15);
  await a.trains([T('L', 'S3', 1), T('U', 'S1', 0)]); await a.poll(15);
  await t('승차 확정 전에는 열차가 출발해도 다시 잠그지 않는다', async () => assert.deepStrictEqual((await a.st()).lock, { no: 'L', v: false }));
  await a.ctx.close();

  console.log('[⑤ GPS 확인 — 열차 구간에서 1.5km 넘게 떨어진 GPS 가 3번 나오면 풀고 2분간 다시 잠그지 않는다]');
  a = await fresh();
  await a.trains([T('U', 'S0', 1)]); await a.poll(15);
  await a.board();
  await a.trains([T('U', 'S1', 0)]); await a.poll(15);
  await a.trains([T('U', 'S2', 1)]); await a.poll(15);
  await t('GPS 없이(지하) 잘 따라간다', async () => { const x = await a.st(); assert.ok(x.lock && x.lock.no === 'U' && x.gm >= 3, JSON.stringify(x)); });
  const far = () => a.page.evaluate(() => { _ev.trail.push({ lat: 37.5 + 0.05, lng: 126.9 + 0.0137 * 3, ts: Date.now() }); });   // 열차 구간에서 북쪽 5.5km
  for (let k = 0; k < 3; k++) { await a.trains([T('U', 'S' + (3 + k), 1)]); await far(); await a.poll(15); }
  s = await a.st();
  await t('멀리 떨어진 GPS 3번이면 잠금을 푼다', async () => assert.strictEqual(s.lock, null, JSON.stringify(s)));
  await t('풀린 뒤 2분간은 다시 잠그지 않는다', async () => assert.strictEqual(s.veto, true));
  await t('해제가 진단에 남는다', async () => assert.ok((await a.diag()).some(x => /열차매칭해제/.test(x))));
  await a.ctx.close();

  console.log('[⑥ GPS 가 열차 구간 가까이 있으면 풀지 않는다]');
  a = await fresh();
  await a.trains([T('U', 'S0', 1)]); await a.poll(15);
  await a.board();
  for (let k = 1; k <= 4; k++) {
    await a.trains([T('U', 'S' + k, 1)]);
    await a.page.evaluate((k) => { _ev.trail.push({ lat: 37.5 + 0.002, lng: 126.9 + 0.0137 * (k + 0.3), ts: Date.now() }); }, k);   // 선로에서 220m
    await a.poll(15);
  }
  await t('가까운 GPS 는 잠금을 유지한다', async () => { const x = await a.st(); assert.ok(x.lock && x.lock.no === 'U' && !x.veto, JSON.stringify(x)); });
  await a.ctx.close();

  console.log('[⑦ 처음 잠글 때 반대 방향 열차는 뺀다(엔진 방향 판정)]');
  a = await fresh();
  await a.page.evaluate(() => { window.__oppTerms = ['OPP']; });
  await a.trains([T('O', 'S0', 1, 'OPP', 0), T('F', 'S1', 1, 'FWD', 1)]); await a.poll(15);
  await t('반대 방향 열차가 더 가까워도(승차역) 진행 방향 열차를 잠근다', async () => assert.deepStrictEqual((await a.st()).lock, { no: 'F', v: false }));
  await a.ctx.close();
  a = await fresh();
  await a.trains([T('O', 'S0', 1, 'OPP', 0), T('F', 'S1', 1, 'FWD', 1)]); await a.poll(15);
  await t('방향을 못 물으면(엔진 응답 없음) 예전처럼 가장 가까운 열차를 잠근다', async () => assert.deepStrictEqual((await a.st()).lock, { no: 'O', v: false }));
  await a.ctx.close();

  console.log('[⑧ 위치 API 실패·끄기 스위치]');
  a = await fresh();
  await a.page.evaluate(() => { window.__feedFail = true; });
  await a.trains([T('U', 'S0', 1)]); await a.poll(15); await a.board(); await a.poll(15);
  await t('위치 API 가 실패하면 잠그지 않고 오류도 없다', async () => { assert.strictEqual((await a.st()).lock, null); assert.deepStrictEqual([...new Set(a.errs)], []); });
  await a.ctx.close();
  a = await fresh();
  await a.page.evaluate(() => { window._rtMatchOff = true; });
  await a.trains([T('L', 'S1', 1)]); await a.poll(15);
  await a.trains([T('L', 'S2', 1), T('U', 'S0', 1)]); await a.poll(15);
  await a.trains([T('L', 'S3', 1), T('U', 'S0', 2)]); await a.poll(15);
  await a.board();
  await a.trains([T('L', 'S3', 1), T('U', 'S1', 0)]); await a.poll(15);
  await t('_rtMatchOff 이면 기존처럼 처음 잠근 열차를 그대로 쓴다', async () => assert.deepStrictEqual((await a.st()).lock, { no: 'L', v: false }));
  await a.ctx.close();

  await b.close();
  console.log('\n' + pass + ' 통과 / ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
