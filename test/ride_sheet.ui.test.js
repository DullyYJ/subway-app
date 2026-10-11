// 탑승 시트 · 대기 알약 — 2026-10-11
//   경로 확정 + 차량 도착 1분 전에 아래에서 올라오는 '탑승' 시트, 누르면 내려가며 승차 확정(되돌리기 가능),
//   출발 3분 뒤에도 안 눌렀고 움직임 증거가 없으면 '대기' 알약으로 줄어듦, 환승 구간도 같은 방식.
// 실행: node test/ride_sheet.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh(theme) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.clock.install({ time: new Date('2026-10-11T12:40:00+09:00') });
    await page.goto('file://' + html); await page.addStyleTag({ content: '#locDiscOv{display:none !important}' }); await page.clock.runFor(2500);
    // 노드: 0 출발 · 1~4 1호선 S0~S3(12:52 출발, 역간 2분) · 5~7 버스 58 B0~B2(13:00 도착)
    await page.evaluate((theme) => {
      const ov = document.getElementById('locDiscOv'); if (ov) ov.remove();
      if (theme) document.documentElement.setAttribute('data-theme', theme);
      const midnight = new Date('2026-10-11T00:00:00+09:00');
      const hm = (m) => ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + Math.floor(m % 60)).slice(-2);
      const m0 = (new Date('2026-10-11T12:52:00+09:00') - midnight) / 60000;
      const nodes = [{ name: '출발', lat: 37.5, lng: 126.896, isOrigin: true, isWalk: false, isSub: false, isBus: false, _schedMin: m0 - 5, el: null }];
      for (let i = 0; i < 4; i++) nodes.push({ name: 'S' + i, lat: 37.5, lng: 126.9 + 0.0137 * i, isSub: true, isBus: false, isWalk: false, isOrigin: false, lineName: '1호선', _schedMin: m0 + i * 2, arrTime: hm(m0 + i * 2), el: null });
      const m1 = (new Date('2026-10-11T13:00:00+09:00') - midnight) / 60000;
      for (let i = 0; i < 3; i++) nodes.push({ name: 'B' + i, lat: 37.5, lng: 126.9 + 0.0137 * 3 + 0.002 * (i + 1), isSub: false, isBus: true, isWalk: false, isOrigin: false, lineName: '58', _schedMin: m1 + i * 3, arrTime: hm(m1 + i * 3), el: null });
      _transitNodeData = nodes;
      window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null; window._trackSig = 'T1'; window._trackBase = 1;
      window._gpsMaxIdx = -1; window._gpsConfirmIdx = -1; window._nodePassMs = {}; window._htlBoarded = false;
      const card = document.getElementById('transitResultCard'); if (card) card.style.display = 'block';
      window.__hm = hm; window.__mid = midnight;
    }, theme);
    const app = { ctx, page, errs };
    app.at = async (hhmmss) => { const target = new Date('2026-10-11T' + hhmmss + '+09:00').getTime(); const now = await page.evaluate(() => Date.now()); if (target > now) await page.clock.runFor(target - now); };
    app.st = () => page.evaluate(() => ({ st: window._rs.st, sheet: document.getElementById('rsSheet') ? document.getElementById('rsSheet').classList.contains('on') : false,
      pill: document.getElementById('rsPill') ? document.getElementById('rsPill').classList.contains('on') : false,
      undo: document.getElementById('rsUndo') ? document.getElementById('rsUndo').classList.contains('on') : false,
      chip: (document.getElementById('rsChip') || {}).textContent, nm: (document.getElementById('rsNm') || {}).textContent, k: (document.getElementById('rsK') || {}).textContent }));
    app.diag = () => page.evaluate(() => { try { return (JSON.parse(localStorage.getItem('ovlDiag') || '[]') || []).map(String); } catch (e) { return []; } });
    app.setDep = (idx, hhmm) => page.evaluate(([i, h]) => { _transitNodeData[i].arrTime = h; }, [idx, hhmm]);
    return app;
  }

  console.log('[① 도착 1분 전에 올라오고, 어느 탭에서든 보이며, 누르면 내려가 승차를 확정한다]');
  let a = await fresh();
  await a.at('12:45:00'); await a.page.clock.runFor(1500);
  await t('도착 6분 전에는 아무것도 안 뜬다', async () => { const s = await a.st(); assert.ok(!s.sheet && !s.pill, JSON.stringify(s)); });
  await a.page.evaluate(() => switchTab('shop', document.getElementById('ni-shop')));
  await a.at('12:51:10'); await a.page.clock.runFor(1500);
  let s = await a.st();
  await t('도착 1분 안에 시트가 올라온다(쇼핑센터 탭에서도)', async () => assert.ok(s.sheet && s.st === 'board', JSON.stringify(s)));
  await t('노선·승차역이 보인다', async () => { assert.strictEqual(s.chip, '1호선'); assert.strictEqual(s.nm, 'S0역'); assert.ok(/1분 안에 도착|곧 도착/.test(s.k), s.k); });
  await t('하단 내비 바로 위에 붙어 있다', async () => {
    const r = await a.page.evaluate(() => { const sh = document.getElementById('rsSheet').getBoundingClientRect(), nv = document.querySelector('.bnav').getBoundingClientRect(); return { shB: sh.bottom, nvT: nv.top, w: sh.width }; });
    assert.ok(Math.abs(r.shB - r.nvT) <= 1 && r.w >= 389, JSON.stringify(r));
  });
  await a.page.click('#rsBtn'); await a.page.clock.runFor(600);
  s = await a.st();
  const g = await a.page.evaluate(() => ({ b: window._htlBoarded, gm: window._gpsMaxIdx, pass: window._nodePassMs[1], why: window._boardWhy, press: window._rsPressMs }));
  await t('누르면 시트가 내려가고 되돌리기 안내가 뜬다', async () => assert.ok(!s.sheet && !s.pill && s.undo, JSON.stringify(s)));
  await t('승차 확정(첫 구간)이 기록된다', async () => { assert.strictEqual(g.b, true); assert.ok(g.gm >= 1); assert.ok(g.pass > 0); assert.strictEqual(g.why, '탑승 버튼'); assert.ok(g.press > 0); });
  await t('진단에 승차확정(탑승 버튼)이 남는다', async () => assert.ok((await a.diag()).some(x => /승차확정/.test(x) && /탑승 버튼/.test(x))));
  await a.page.click('#rsUndoBtn'); await a.page.clock.runFor(1500);
  s = await a.st();
  const g2 = await a.page.evaluate(() => ({ b: window._htlBoarded, gm: window._gpsMaxIdx, pass: window._nodePassMs[1] }));
  await t('되돌리면 승차 확정이 지워지고 시트가 다시 올라온다', async () => { assert.strictEqual(g2.b, false); assert.strictEqual(g2.gm, -1); assert.strictEqual(g2.pass, undefined); assert.ok(s.sheet, JSON.stringify(s)); });
  await t('JS 오류가 없다', async () => assert.deepStrictEqual([...new Set(a.errs)], []));
  await a.ctx.close();

  console.log('[② 안 누르고 출발 3분이 지나면 알약으로 줄어들고, 다음 차가 1분 안이면 다시 올라온다]');
  a = await fresh();
  await a.at('12:51:20'); await a.page.clock.runFor(1500);
  await t('올라온다', async () => assert.ok((await a.st()).sheet));
  await a.at('12:54:30'); await a.page.clock.runFor(1500);
  await t('출발 2분 30초에는 아직 시트다', async () => assert.ok((await a.st()).sheet));
  await a.at('12:55:10'); await a.page.clock.runFor(1500);
  s = await a.st();
  await t('출발 3분 뒤(움직임 없음) 시트가 줄어 대기 알약이 된다', async () => assert.ok(!s.sheet && s.pill && s.st === 'wait', JSON.stringify(s)));
  await a.setDep(1, '12:59');   // 알고리즘이 다음 차(12:59)로 맞췄다
  await a.at('12:57:00'); await a.page.clock.runFor(1500);
  await t('다음 차가 멀면 알약 그대로', async () => { const x = await a.st(); assert.ok(x.pill && !x.sheet, JSON.stringify(x)); });
  await a.at('12:58:10'); await a.page.clock.runFor(1500);
  await t('다음 차 1분 안이면 시트로 다시 올라온다(알약은 사라진다)', async () => { const x = await a.st(); assert.ok(x.sheet && !x.pill, JSON.stringify(x)); });
  await a.ctx.close();

  console.log('[③ 알약을 누르면 열리고, 움직임 증거가 있으면 줄이지 않는다, 자동 인식은 시트를 내린다]');
  a = await fresh();
  await a.at('12:51:20'); await a.page.clock.runFor(1500);
  await a.page.evaluate(() => { window._htlBoardWatch = function () {}; window._rideEv = function () { return { now: true, riding: true }; }; });   // 움직임 증거(이동·기지국)가 있다 — 자동 승차 확정은 막고 시트만 본다
  await a.at('12:56:00'); await a.page.clock.runFor(1500);
  await t('움직임 증거가 있으면 3분이 지나도 줄이지 않는다', async () => assert.ok((await a.st()).sheet));
  await a.page.evaluate(() => { window._rideEv = function () { return { now: false, riding: false }; }; });
  await a.page.clock.runFor(1500);
  await t('증거가 사라지면 줄어든다', async () => assert.ok((await a.st()).pill));
  await a.page.evaluate(() => { window._rideEv = function () { return { now: true, riding: true }; }; });
  await a.page.clock.runFor(1500);
  await t('같은 차량은 증거가 깜빡여도 다시 올리지 않는다', async () => assert.ok((await a.st()).pill));
  await a.page.click('#rsPill'); await a.page.clock.runFor(800);
  await t('알약을 누르면 시트가 다시 열린다', async () => { const x = await a.st(); assert.ok(x.sheet && !x.pill, JSON.stringify(x)); assert.ok(/타셨다면/.test(x.k), x.k); });
  await a.page.evaluate(() => { window._htlBoarded = true; window._gpsMaxIdx = 2; window._gpsConfirmIdx = 2; });   // 기존 자동 인식이 승차를 잡았다
  await a.page.clock.runFor(1500);
  s = await a.st();
  await t('자동 인식이 탑승을 잡으면 시트가 저절로 내려간다(되돌리기 안내 없음)', async () => assert.ok(!s.sheet && !s.pill && !s.undo, JSON.stringify(s)));
  await a.ctx.close();

  console.log('[④ 환승 구간 — 앞 구간을 내린 뒤에만, 같은 방식으로]');
  a = await fresh();
  await a.at('12:51:20'); await a.page.clock.runFor(1500);
  await a.page.click('#rsBtn'); await a.page.clock.runFor(600);
  await a.page.evaluate(() => { window._gpsMaxIdx = 2; });
  await a.at('12:59:20'); await a.page.clock.runFor(1500);
  await t('버스 도착 1분 전이어도 아직 지하철 구간 중간이면 시트가 없다', async () => { const x = await a.st(); assert.ok(!x.sheet && !x.pill, JSON.stringify(x)); });
  await a.page.evaluate(() => { window._gpsMaxIdx = 4; });   // 지하철 하차역 도착
  await a.page.clock.runFor(1500);
  s = await a.st();
  await t('내린 뒤에는 버스 시트가 올라온다', async () => { assert.ok(s.sheet, JSON.stringify(s)); assert.strictEqual(s.chip, '58번'); assert.strictEqual(s.nm, 'B0'); });
  await a.page.click('#rsBtn'); await a.page.clock.runFor(600);
  const g3 = await a.page.evaluate(() => ({ gm: window._gpsMaxIdx, pass: window._nodePassMs[5], b: window._htlBoarded }));
  await t('환승 구간 탑승 확정이 기록된다', async () => { assert.ok(g3.gm >= 5 && g3.pass > 0 && g3.b === true, JSON.stringify(g3)); });
  s = await a.st();
  await t('모든 구간을 탔으면 시트가 없다', async () => assert.ok(!s.sheet && !s.pill));
  await a.ctx.close();

  console.log('[⑤ 위치 게이트 · 끄기 · 경로 바뀜 · 테마]');
  a = await fresh();
  await a.at('12:50:50'); await a.page.evaluate(() => { _ev.trail.push({ lat: 37.5, lng: 126.95, ts: Date.now() }); });   // 승차역(126.9)에서 4km 이상 떨어진 최신 위치
  await a.at('12:51:20'); await a.page.clock.runFor(1500);
  await t('최신 위치가 승차역에서 멀면 올리지 않는다', async () => { const x = await a.st(); assert.ok(!x.sheet, JSON.stringify(x)); });
  await a.page.evaluate(() => { _ev.trail.push({ lat: 37.5, lng: 126.9005, ts: Date.now() }); }); await a.page.clock.runFor(1500);
  await t('역 앞에 도착하면 올라온다', async () => assert.ok((await a.st()).sheet));
  await a.page.evaluate(() => { window._rsOff = true; }); await a.page.clock.runFor(1500);
  await t('끄기 스위치(_rsOff)를 켜면 내려간다', async () => { const x = await a.st(); assert.ok(!x.sheet && !x.pill); });
  await a.page.evaluate(() => { window._rsOff = false; window._trackSig = 'T2'; }); await a.page.clock.runFor(1500);
  await t('경로가 바뀌면 처음부터 다시 판단한다(바뀐 경로도 같은 시각이라 다시 올라온다)', async () => assert.ok((await a.st()).sheet));
  await a.page.evaluate(() => { window._routeLocked = false; }); await a.page.clock.runFor(1500);
  await t('경로 확정이 풀리면 내려간다', async () => assert.ok(!(await a.st()).sheet));
  await a.ctx.close();
  for (const th of ['pastel', 'dark']) {
    a = await fresh(th); await a.at('12:51:20'); await a.page.clock.runFor(1500);
    const c = await a.page.evaluate(() => { const bt = getComputedStyle(document.getElementById('rsBtn')); const sh = getComputedStyle(document.getElementById('rsSheet')); return { bg: bt.backgroundImage, col: bt.color, sbg: sh.backgroundColor }; });
    await t('테마 ' + th + ': 버튼·시트 색이 앱 토큰을 따른다', async () => { assert.ok(/gradient/.test(c.bg)); if (th === 'pastel') assert.strictEqual(c.sbg, 'rgb(255, 255, 255)'); else assert.strictEqual(c.sbg, 'rgb(28, 28, 30)'); });
    if (th === 'pastel') { const out = process.env.RS_SHOT; if (out) await a.page.screenshot({ path: out + '_pastel.png' }); }
    else { const out = process.env.RS_SHOT; if (out) await a.page.screenshot({ path: out + '_dark.png' }); }
    await a.ctx.close();
  }

  await b.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
