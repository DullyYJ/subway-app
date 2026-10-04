// 가속도계 = 보조 지표 시험 — 실제 앱(www/index.html)의 detectBoardingState / _accelState / 설정 진단을 헤드리스 Chromium 에서 호출.
// 실행: node test/accel_auxiliary.ui.test.js   (Playwright: /opt/node-tools/node_modules/playwright, Chromium: /opt/pw-browsers/chromium-1194)
const assert = require('assert'), path = require('path');
const { chromium } = require('/opt/node-tools/node_modules/playwright');
let pass = 0; const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { console.log('  FAIL', name, '\n      ', e.message.split('\n')[0]); process.exitCode = 1; } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => r.request().url().startsWith('file://') ? r.continue() : r.abort());
  await page.goto('file://' + path.join(__dirname, '..', 'www', 'index.html'));
  await page.waitForTimeout(1800);
  await page.evaluate(() => { try { localStorage.setItem(_LOC_DISC_KEY, '1'); } catch (e) {} const o = document.getElementById('locDiscOv'); if (o) o.remove(); });

  // 가속도계 표본을 원하는 stddev 로 채운다(최근 10개 기준: 평균 9.8 ± amp)
  const setAccel = (kind) => page.evaluate((kind) => {
    const amp = ({ train: 3.0, walk: 1.2, still: 0.1 })[kind];
    if (kind === 'unknown') { _accel.active = true; _accel.samples = [{ mag: 9.8, ts: Date.now() }]; return _accelState(); }
    _accel.active = true; _accel.samples = Array.from({ length: 12 }, (_, i) => ({ mag: 9.8 + (i % 2 ? amp : -amp), ts: Date.now() - (12 - i) * 20 }));
    return _accelState();
  }, kind);
  // detectBoardingState 를 station_enter 상태에서 한 번 부른다. ev: { speed, moveDist, cell, minPast, accel }
  const decide = (ev) => page.evaluate((ev) => {
    const toasts = []; window.toast = (m) => toasts.push(m);
    window._cellMovingState = () => ev.cell === undefined ? null : ev.cell;
    window._htlMinPastDeparture = () => ev.minPast === undefined ? null : ev.minPast;
    S.boardingState = 'station_enter'; S.speedSamples = ev.speed ? [ev.speed, ev.speed] : [0, 0]; S.lastMoveDistM = ev.moveDist || 0; S.route = null; S.boardedAt = null;
    window._lastBoardDecision = null;
    detectBoardingState(37.5, 127.0, { name: '강남' }, 60, 10);
    return { state: S.boardingState, toast: toasts.join('|'), banner: (document.getElementById('boardBannerTxt') || {}).textContent, decision: window._lastBoardDecision };
  }, ev);

  console.log('[승차 판정 — 가속도계 단독 확정 없음]');
  await t('가속도계 열차 진동만 있으면 승차로 바뀌지 않는다(핵심)', async () => {
    assert.strictEqual(await setAccel('train'), 'train');
    const r = await decide({ speed: 0, moveDist: 0 }); assert.strictEqual(r.state, 'station_enter', JSON.stringify(r)); assert.strictEqual(r.toast, '');
  });
  await t('가속도계 + 기지국(셀 이동 중) → 승차 확정, 문구 "기지국 · 진동 보조"', async () => {
    await setAccel('train'); const r = await decide({ cell: true });
    assert.strictEqual(r.state, 'boarding'); assert.ok(/기지국 · 진동 보조/.test(r.toast), r.toast); assert.ok(/탑승 확인\(기지국 · 진동 보조\)/.test(r.banner), r.banner); assert.strictEqual(r.decision.accel, 'train');
  });
  await t('가속도계 + 시각표(출발시각 경과) → 승차 확정, 문구 "시각표 · 진동 보조"', async () => {
    await setAccel('train'); const r = await decide({ minPast: 1.0 });
    assert.strictEqual(r.state, 'boarding'); assert.ok(/시각표 · 진동 보조/.test(r.toast), r.toast);
  });
  await t('출발시각이 아직 안 지났으면(시각표 근거 없음) 가속도계만으로는 안 바뀐다', async () => {
    await setAccel('train'); const r = await decide({ minPast: -2, cell: false }); assert.strictEqual(r.state, 'station_enter');
  });
  await t('가속도계 + GPS → 승차 확정, GPS 가 주 근거이고 "진동 보조"가 붙는다', async () => {
    await setAccel('train'); const r = await decide({ moveDist: 25 });
    assert.strictEqual(r.state, 'boarding'); assert.ok(/GPS감지 · 진동 보조/.test(r.toast), r.toast); assert.ok(!/진동감지/.test(r.toast + r.banner));
  });
  await t('GPS 속도만(가속도계 정지) → 기존처럼 승차 확정, "진동" 문구 없음', async () => {
    await setAccel('still'); const r = await decide({ speed: 3.0 });
    assert.strictEqual(r.state, 'boarding'); assert.strictEqual(r.toast, '🚇 탑승! (속도감지)'); assert.ok(!/진동/.test(r.banner));
  });
  await t('가속도계 상태 모름 + GPS 이동 → 기존처럼 확정(보조 표시 없음)', async () => {
    await setAccel('unknown'); const r = await decide({ moveDist: 30 }); assert.strictEqual(r.state, 'boarding'); assert.ok(!/진동/.test(r.toast), r.toast);
  });
  await t('기지국만(가속도계 없음) / 시각표만(가속도계 없음)으로는 이 판정에서 확정하지 않는다(기존 동작 유지)', async () => {
    await setAccel('still'); let r = await decide({ cell: true }); assert.strictEqual(r.state, 'station_enter');
    r = await decide({ minPast: 2 }); assert.strictEqual(r.state, 'station_enter');
  });
  await t('도보 진동 + 기지국 이어도 확정하지 않는다(열차 진동이 아니므로)', async () => {
    assert.strictEqual(await setAccel('walk'), 'walk'); const r = await decide({ cell: true, minPast: 1 }); assert.strictEqual(r.state, 'station_enter');
  });
  await t('boarding 중 배너는 "이동 중 (진동 보조)"로 표시된다(단독 근거 문구 없음)', async () => {
    await setAccel('train');
    const txt = await page.evaluate(() => { S.boardingState = 'boarding'; S.speedSamples = [0]; S.route = null; detectBoardingState(37.5, 127.0, { name: '역삼' }, 900, 10); return document.getElementById('boardBannerTxt').textContent; });
    assert.ok(/진동 보조/.test(txt) && !/진동감지/.test(txt), txt);
  });

  console.log('[수집·상태 판정은 그대로]');
  await t('devicemotion 이벤트가 표본으로 쌓이고(최대 30개) 상태가 stddev 로 판정된다', async () => {
    const r = await page.evaluate(() => {
      _stopAccel(); _startAccel(); const out = {};
      for (let i = 0; i < 12; i++) window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 + (i % 2 ? 0.05 : -0.05) } }));
      out.still = _accelState(); out.n1 = _accel.samples.length;
      for (let i = 0; i < 40; i++) window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 + (i % 2 ? 3 : -3) } }));
      out.train = _accelState(); out.n2 = _accel.samples.length; _stopAccel(); out.active = _accel.active; return out;
    });
    assert.deepStrictEqual(r, { still: 'still', n1: 12, train: 'train', n2: 30, active: false });
  });
  await t('표본이 8개 미만이면 unknown, 임계값 상수는 그대로(1.8 / 0.4 / 도보 0.8)', async () => {
    const r = await page.evaluate(() => { _accel.active = true; _accel.samples = Array.from({ length: 5 }, () => ({ mag: 9.8, ts: Date.now() })); return { s: _accelState(), th: [_accel.TRAIN_THRESH, _accel.STILL_THRESH], w: _accelStats().thresholds.walk }; });
    assert.deepStrictEqual(r, { s: 'unknown', th: [1.8, 0.4], w: 0.8 });
  });

  console.log('[설정 — 가속도계 상태 보기]');
  await t('설정 진단 실행(_bgDiag)에 가속도계 상태·stddev·임계값 줄이 나온다', async () => {
    await setAccel('train');
    await page.evaluate(() => { if (!document.getElementById('bgDiagLog')) { const d = document.createElement('div'); d.id = 'bgDiagLog'; document.body.appendChild(d); } document.getElementById('bgDiagLog').textContent = ''; window._bgLogBuf = []; });   // 실제 화면에선 주석 처리된 개발자 카드 안에 있다
    await Promise.race([page.evaluate(() => _bgDiag()), new Promise(r => setTimeout(r, 15000))]);
    const txt = await page.$eval('#bgDiagLog', e => e.textContent);
    assert.ok(/가속도계\(보조 지표 · 단독 확정 안 함\)/.test(txt), txt.slice(-600)); assert.ok(/상태 train · stddev 3\./.test(txt), txt.slice(-500)); assert.ok(/임계값 열차 ≥1\.8 · 도보 ≥0\.8/.test(txt));
  });
  await t('진단에 마지막 승차 판정 근거(GPS·기지국·시각표·가속도계)가 남는다', async () => {
    await setAccel('train'); await decide({ cell: true });
    await page.evaluate(() => { window._bgLogBuf = []; }); await Promise.race([page.evaluate(() => _bgDiag()), new Promise(r => setTimeout(r, 15000))]);
    const txt = await page.$eval('#bgDiagLog', e => e.textContent); assert.ok(/마지막 승차 판정: 기지국 · 진동 보조 · GPS false 기지국 true 시각표 false 가속도계 train/.test(txt), txt.slice(-400));
  });
  await t('설정 화면에 "가속도계 측정" 카드와 시작/지금 상태/중지 버튼이 보인다', async () => {
    const r = await page.evaluate(() => { const st = document.getElementById('settingsTabView'); const card = document.getElementById('accelTestOut'); return { out: !!card, inSettings: !!(st && card && st.contains(card)), btns: [...st.querySelectorAll('button')].map(b => b.textContent.trim()).filter(x => ['측정 시작', '지금 상태', '중지'].includes(x)) }; });
    assert.ok(r.out && r.inSettings); assert.deepStrictEqual(r.btns, ['측정 시작', '지금 상태', '중지']);
  });
  await t('숨겨 둔 개발자용 진단 카드(배터리/백그라운드 추적/버스 진단)는 계속 숨겨져 있다(HTML 주석 안 깨짐)', async () => {
    await page.evaluate(() => { const d = document.getElementById('bgDiagLog'); if (d) d.remove(); });    // 앞 시험이 임시로 만든 요소
    const r = await page.evaluate(() => { const st = document.getElementById('settingsTabView'); return { text: st.textContent, bg: !!st.querySelector('#bgDiagLog'), busBtn: [...st.querySelectorAll('button')].some(b => /버스 도착정보|진단 실행/.test(b.textContent)) }; });
    ['배터리 최적화 제외', '백그라운드 추적 진단', '버스 도착정보 진단'].forEach(k => assert.ok(!r.text.includes(k), k + ' 가 화면에 드러남'));
    assert.ok(!r.text.includes('-->'), "'-->' 가 글자로 보임"); assert.ok(!r.bg && !r.busBtn);
  });
  await t('"지금 상태" 버튼: 측정 없이 현재 상태·stddev·임계값과 마지막 승차 판정 근거를 보여 준다', async () => {
    await setAccel('train'); await decide({ cell: true });
    await page.evaluate(() => _accelSnapshotShow());
    const txt = await page.$eval('#accelTestOut', e => e.textContent);
    assert.ok(/가속도계: 켜짐/.test(txt) && /상태 train · stddev 3\./.test(txt) && /열차 ≥1\.8 · 도보 ≥0\.8/.test(txt), txt);
    assert.ok(/마지막 승차 판정: 기지국 · 진동 보조 · GPS false 기지국 true 시각표 false 가속도계 train/.test(txt), txt);
  });
  await t('직접 측정: 시작하면 0.5초마다 상태·stddev 가 표시되고, 끝나면 요약이 나온다', async () => {
    await page.evaluate(() => { _stopAccel(); S.boardingState = 'idle'; });
    await page.evaluate(() => { _accelLiveTestStart(); window.__t = setInterval(() => { window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: { x: 0, y: 0, z: 9.8 + (Math.random() > 0.5 ? 3 : -3) } })); }, 20); });
    await page.waitForTimeout(1800);
    const live = await page.$eval('#accelTestOut', e => e.textContent); assert.ok(/초 \| (train|walk|still|unknown) \| stddev /.test(live), live);
    await page.evaluate(() => { clearInterval(window.__t); _accelLiveTestStop(); });
    const sum = await page.$eval('#accelTestOut', e => e.textContent); assert.ok(/요약/.test(sum) && /상태 비율/.test(sum) && /stddev: 최소/.test(sum), sum);
    assert.strictEqual(await page.evaluate(() => _accel.active), false, '테스트가 켠 센서는 끝나면 꺼야 한다');
  });
  await t('직접 측정은 승차 감지 중 켜져 있던 센서를 끄지 않는다', async () => {
    await page.evaluate(() => { _stopAccel(); S.boardingState = 'station_enter'; _startAccel(); _accelLiveTestStart(); });
    await page.waitForTimeout(700);
    await page.evaluate(() => { _accelLiveTestStop(); });
    assert.strictEqual(await page.evaluate(() => _accel.active), true); await page.evaluate(() => { _stopAccel(); S.boardingState = 'idle'; });
  });
  await t('화면 오류 없음', async () => assert.deepStrictEqual(errs, []));
  await b.close();
  console.log('\n통과', pass, '건' + (process.exitCode ? ' — 실패 있음' : ''));
})();
