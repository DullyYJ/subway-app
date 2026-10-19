// 홈 'AI 승무원' 브리핑 문장을 엔진이 만들기(설정 스위치 gdm_e2) ↔ 앱(JS) 연결 시험 — 2026-10-19 (s65)
//   진짜 index.html + 진짜 엔진 모듈(engine/home-brief.js)에 연결해 확인한다:
//   · 꺼져 있으면(기본) 예전 그대로 — 엔진에 묻지 않는다
//   · 켜면: 같은 입력(경로 구간 · 시각 · 혼잡 · 날씨 · 노선도 · 다음 열차 · 휴일)에서 카드 HTML 이 예전 웹 규칙과 글자 하나까지 같다
//   · 엔진에 보내는 값은 '지금 상태'뿐(문장·HTML 없음)
//   · 폴백: 404 · 응답 없음(2.5초) · 이상한 응답 → 바로 예전 규칙 + 60초 쉬기 · 더 최신 브리핑이 오면 늦은 답은 버린다
// 실행: node test/home_brief_e2.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const HB = require('../engine/home-brief');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 1500)); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ENG;
function resetEng() { ENG = { mode: 'ok', hits: [], delays: [] }; }
const kst = (h, mi) => Date.UTC(2026, 9, 19, h - 9, mi || 0);

const SEGS = {
  none: null,
  one: [{ type: 1, line: '2호선', from: '강남', to: '시청', min: 25 }],
  two: [{ type: 1, line: '2호선', from: '강남', to: '시청', min: 15 }, { type: 1, line: '1호선', from: '시청', to: '종로3가', min: 10 }],
  three: [{ type: 1, line: '2호선', from: '강남', to: '시청', min: 15 }, { type: 1, line: '공항철도', from: '서울역', to: '홍대입구', min: 10 }, { type: 1, line: '5호선', from: '공덕', to: '여의도', min: 12 }],
  bus: [{ type: 2, line: '146', from: '강남역', to: '서울역', min: 20 }, { type: 1, line: '4호선', from: '서울역', to: '명동', min: 8 }],
  ld: [{ type: 1, line: '2호선', from: '강남', to: '서울', min: 20 }, { type: 4, line: 'KTX', from: '서울', to: '부산', min: 150, depClock: '10:00', arrClock: '12:30', rideMin: 140 }, { type: 1, line: '1호선', from: '부산', to: '시청', min: 20 }],
  ldNoClock: [{ type: 4, line: '고속버스', from: '서울', to: '대전', min: 120 }],
  ldBare: [{ type: 4, line: 'KTX', from: '서울', to: '부산', min: 150, depClock: '10:00', arrClock: '12:30' }]
};
const WXS = {
  none: null,
  cold: { temp: 1, txt: '맑음', rain: 10 }, chilly: { temp: 6, txt: '흐림', rain: 45 }, hot: { temp: 30, txt: '맑음', rain: 0 },
  rain: { temp: 18, txt: '비', rain: 80 }, mild: { temp: 17, txt: '구름', rain: 20 }
};

(async () => {
  resetEng();
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('gdm_loc_disclosed', '1'); } catch (e) {} window.Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web', Plugins: {} }; });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', async r => {
    const u = new URL(r.request().url()); if (u.protocol === 'file:' || u.protocol === 'data:') return r.continue();
    const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (/route-v2/.test(u.host) && u.pathname === '/home-brief') {
      const body = r.request().postData() || ''; ENG.hits.push(body);
      const d = ENG.delays.length ? ENG.delays.shift() : 0; if (d) await sleep(d);
      if (ENG.mode === '404') return r.fulfill({ status: 404, headers: H, body: '{"error":"not found"}' });
      if (ENG.mode === 'hang') return;
      if (ENG.mode === 'bad') return r.fulfill({ status: 200, headers: H, body: '{"ok":true,"v":1,"paras":[]}' });
      if (ENG.mode === 'bad2') return r.fulfill({ status: 200, headers: H, body: '{"ok":true,"v":1,"paras":[5]}' });
      // 진짜 Worker 연결부(handleHomeBrief)를 그대로 태운다
      return HB.handleHomeBrief(new Request('http://x/home-brief', { method: 'POST', body })).then(async resp => r.fulfill({ status: resp.status, headers: H, body: await resp.text() }));
    }
    return r.fulfill({ status: 200, headers: H, body: '{}' });
  });
  await page.clock.install({ time: new Date(kst(12, 0)) });
  await page.goto('file://' + html);
  await page.clock.runFor(3000);
  await page.clock.setFixedTime(new Date(kst(14, 0)));
  const settle = async (ms) => { for (let i = 0; i < Math.ceil((ms || 200) / 50); i++) { await sleep(40); await page.clock.runFor(50); } };

  // 장면 고정: 경로 · 좌표 · 날씨 · 노선도 · 다음 열차 · 휴일 (웹 쪽 전역을 바꿔 끼운다)
  const scene = async (o) => {
    await page.evaluate((o) => {
      window.__sc = o;
      window._buildRouteBrief = function () { return window.__sc.segs || window.__sc.mins ? { totalMin: window.__sc.mins || 0, segments: window.__sc.segs ? JSON.parse(JSON.stringify(window.__sc.segs)) : null } : null; };
      window._homeRouteBaseMin = 0;
      window._homeBriefCoord = function (w) { if (window.__sc.noCoord) return null; return w === 'from' ? { lat: 1, lng: 1 } : { lat: 2, lng: 2 }; };
      window._fetchWeather = function (lat, lng, cb) { var w = lat === 1 ? window.__sc.wF : window.__sc.wT; setTimeout(function () { cb(w ? Object.assign({}, w) : null); }, 0); };
      window._isHolidayOrWeekend = function () { return !!window.__sc.hol; };
      window._metroNextTrainInfo = function () { return window.__sc.nt || null; };
      window._htlDepArrTimes = function () { return window.__sc.tl || null; };
      window._journeyEta = function () { return window.__sc.arrMs ? { arrMs: window.__sc.arrMs } : null; };
      window.kstMinutesAdj = function () { return window.__sc.nowMin == null ? 840 : window.__sc.nowMin; };
      window._metroRouteMode = !!window.__sc.metro;
      window._depCmpMsg = window.__sc.dm ? { key: 'k1', msg: window.__sc.dm } : null; window._lastCoordQs = 'k1';
      var rnd = window.__sc.rnd == null ? 0.3 : window.__sc.rnd; Math.random = function () { return rnd; };
    }, o);
  };
  const render = async (o, e2, wait) => {
    await scene(o);
    await page.evaluate((on) => { try { localStorage.setItem('gdm_e2', on ? '1' : '0'); } catch (e) {} window._E2.bad = false; window._E2.until = 0; var b = document.getElementById('homeAiBody'); if (b) { b.innerHTML = ''; b.style.opacity = '1'; } }, !!e2);
    await page.evaluate((o) => { _renderHomeConductorBrief(o.from == null ? '강남' : o.from, o.to == null ? '시청' : o.to, o.hour == null ? 14 : o.hour, o.cong == null ? 20 : o.cong, null); }, o);
    await settle(wait || 400);
    return page.evaluate(() => document.getElementById('homeAiBody').innerHTML);
  };

  // ── 같은 장면에서 꺼짐/켜짐 결과가 같다 ──
  const cases = [];
  for (const sk of Object.keys(SEGS)) for (const [hour, cong, hol] of [[14, 20, false], [8, 80, false], [23, 60, false], [12, 50, true], [18, 10, false]]) for (const wk of [['none', 'none'], ['cold', 'rain'], ['chilly', 'hot'], ['mild', 'mild']]) {
    cases.push({ name: sk + '/' + hour + '/' + wk.join('-'), o: { segs: SEGS[sk], mins: sk === 'none' ? 25 : 40, hour, cong, hol, wF: WXS[wk[0]], wT: WXS[wk[1]], arrMs: kst(hour, 5) + 40 * 60000, dm: (hour === 8 ? '<b>5분 빨리</b>' : '') } });
  }
  console.log('[꺼짐 = 예전 그대로]');
  resetEng();
  let off = await render({ segs: SEGS.two, mins: 30, wF: WXS.cold, wT: WXS.rain }, false);
  await t('꺼져 있으면 엔진에 묻지 않는다', async () => { assert.strictEqual(ENG.hits.length, 0); assert.ok(/home-ai-msg/.test(off) && /종로3가|시청/.test(off), off); });

  console.log('[켜짐 = 같은 결과]');
  let n = 0, bad = [];
  // 가볍게 전부 돌리면 오래 걸려 일부를 고른다(모든 구간 종류 × 시간대 × 날씨 조합 중 3개 중 1개)
  const picked = cases.filter((c, i) => i % 3 === 0);
  for (const c of picked) {
    resetEng();
    const a = await render(c.o, false), hits0 = ENG.hits.length;
    const bb = await render(c.o, true);
    n++;
    if (a !== bb || ENG.hits.length !== 1 || hits0 !== 0) bad.push(c.name + '\n  OFF ' + a + '\n  ON  ' + bb + ' hits=' + ENG.hits.length);
    if (bad.length > 2) break;
  }
  await t('경로 · 시간대 · 날씨 ' + picked.length + '가지: 카드 HTML 이 예전과 같다', async () => { assert.ok(n >= 25); assert.strictEqual(bad.length, 0, bad.join('\n')); });

  // 노선도 모드 · 다음 열차 · 첫차
  const metroCases = [
    { n: '다음 열차', o: { metro: true, segs: SEGS.two, mins: 30, nt: { found: true, depMin: 14 * 60 + 5.4, arrMin: 14 * 60 + 35.6 } } },
    { n: '타임라인 우선', o: { metro: true, segs: SEGS.one, mins: 30, nt: { found: true, depMin: 800, arrMin: 830 }, tl: { dep: '13:21', arr: '13:51' } } },
    { n: '막차 후 첫차', o: { metro: true, segs: SEGS.one, mins: 30, hour: 23, nowMin: 1430, nt: { found: false, firstMin: 5 * 60 + 33 } } },
    { n: '막차 후 첫차 없음', o: { metro: true, segs: SEGS.one, mins: 0, nt: { found: false } } },
    { n: '다음 열차 정보 없음', o: { metro: true, segs: SEGS.one, mins: 30, nt: null } },
    { n: '첫차 분 60 올림', o: { metro: true, segs: SEGS.one, mins: 20, nowMin: 300, nt: { found: false, firstMin: 5 * 60 + 59.7 } } }
  ];
  for (const c of metroCases) await t('노선도: ' + c.n, async () => { resetEng(); const a = await render(c.o, false), bb = await render(c.o, true); assert.strictEqual(bb, a); assert.strictEqual(ENG.hits.length, 1); });

  // 목적지 미설정 · 좌표 없음 · 소요 모름 · 기준값
  const odd = [
    { n: '목적지 없음', o: { to: '', wF: WXS.chilly, hour: 8, cong: 80 } },
    { n: '목적지=출발', o: { to: '강남', wF: WXS.rain, hour: 23 } },
    { n: '좌표 없음', o: { noCoord: true, segs: SEGS.one, mins: 20 } },
    { n: '소요 모름(경로 없음)', o: { segs: null, mins: 0 } },
    { n: '비·더위 겹침', o: { segs: SEGS.bus, mins: 33, wF: WXS.hot, wT: WXS.rain } },
    { n: '마무리 문구 다른 값', o: { segs: SEGS.one, mins: 20, rnd: 0.9 } },
    { n: '장거리(시각 없음)', o: { segs: SEGS.ldNoClock, mins: 120 } }
  ];
  for (const c of odd) await t('같은 결과: ' + c.n, async () => { resetEng(); const a = await render(c.o, false), bb = await render(c.o, true); assert.strictEqual(bb, a, '\nOFF ' + a + '\nON  ' + bb); assert.strictEqual(ENG.hits.length, 1); });

  await t('도착 시각 id(homeAiArr · homeAiDep)가 그대로 있다(별도 갱신기가 덮어쓴다)', async () => {
    resetEng();
    const bb = await render({ segs: SEGS.one, mins: 30, arrMs: kst(14, 30), dm: '<b>3분 일찍</b>' }, true);
    assert.ok(/<span id="homeAiArr">도착은 <b>14:30<\/b>경 예정이에요\.<\/span> <span id="homeAiDep"><b>3분 일찍<\/b><\/span>/.test(bb), bb);
  });
  await t('엔진에 보내는 값: 지금 상태만(문장 · HTML · 색 없음)', async () => {
    resetEng();
    await render({ segs: SEGS.bus, mins: 33, wF: WXS.cold, wT: WXS.rain, arrMs: kst(14, 30), dm: '<b>x</b>' }, true);
    const q = JSON.parse(ENG.hits[0]);
    const keys = Object.keys(q).sort();
    assert.deepStrictEqual(keys, ['arrMs', 'cong', 'dm', 'from', 'hol', 'hour', 'metro', 'mins', 'nowMin', 'nowMs', 'nt', 'rnd', 'segs', 'tl', 'to', 'wF', 'wT']);
    assert.deepStrictEqual(Object.keys(q.segs[0]).sort(), ['arrClock', 'depClock', 'from', 'line', 'min', 'rideMin', 'to', 'type']);
    assert.deepStrictEqual(Object.keys(q.wF).sort(), ['rain', 'temp', 'txt']);
    assert.ok(!/<(span|b|i)\b|color|badge/.test(ENG.hits[0].replace(/"dm":"[^"]*"/, '')), ENG.hits[0]);
    assert.ok(q.rnd >= 0 && q.rnd < 1);
  });

  console.log('[폴백]');
  const FB = { segs: SEGS.two, mins: 30, wF: WXS.cold, wT: WXS.rain };
  const ref = await render(FB, false);
  for (const mode of ['404', 'bad', 'bad2']) {
    await t('엔진 ' + mode + ' → 예전 방식으로 바로 그린다 + 60초 쉬기', async () => {
      resetEng(); ENG.mode = mode;
      const a = await render(FB, true);
      assert.strictEqual(a, ref); assert.strictEqual(ENG.hits.length, 1);
      const st = await page.evaluate(() => ({ bad: window._E2.bad, down: window._E2.until > Date.now() }));
      assert.strictEqual(st.bad, true); assert.strictEqual(st.down, true);
      // 쉬는 동안은 묻지 않는다
      await page.evaluate(() => { var b = document.getElementById('homeAiBody'); b.innerHTML = ''; _renderHomeConductorBrief('강남', '시청', 14, 20, null); });
      await settle(400); assert.strictEqual(ENG.hits.length, 1);
      const a2 = await page.evaluate(() => document.getElementById('homeAiBody').innerHTML); assert.strictEqual(a2, ref);
    });
  }
  await t('엔진 응답 없음(2.5초) → 예전 방식', async () => {
    resetEng(); ENG.mode = 'hang';
    await scene(FB);
    await page.evaluate(() => { localStorage.setItem('gdm_e2', '1'); window._E2.bad = false; window._E2.until = 0; document.getElementById('homeAiBody').innerHTML = ''; _renderHomeConductorBrief('강남', '시청', 14, 20, null); });
    await settle(1000); const mid = await page.evaluate(() => document.getElementById('homeAiBody').innerHTML);
    assert.ok(!/home-ai-msg/.test(mid) || /준비 중/.test(mid), '기다리는 동안 문장이 먼저 나오지 않는다');
    await settle(2400);
    const a = await page.evaluate(() => document.getElementById('homeAiBody').innerHTML);
    assert.strictEqual(a, ref); assert.strictEqual(ENG.hits.length, 1);
  });
  await t('쉬는 시간이 지나면 다시 엔진에 묻는다', async () => {
    resetEng();
    await scene(FB);
    await page.evaluate(() => { window._E2.until = 0; window._E2.bad = false; document.getElementById('homeAiBody').innerHTML = ''; _renderHomeConductorBrief('강남', '시청', 14, 20, null); });
    await settle(400); assert.strictEqual(ENG.hits.length, 1);
    assert.strictEqual(await page.evaluate(() => document.getElementById('homeAiBody').innerHTML), ref);
  });
  await t('비상 스위치 window._hbeOff → 엔진에 묻지 않는다', async () => {
    resetEng(); await scene(FB);
    await page.evaluate(() => { window._hbeOff = true; window._E2.until = 0; document.getElementById('homeAiBody').innerHTML = ''; _renderHomeConductorBrief('강남', '시청', 14, 20, null); });
    await settle(400); await page.evaluate(() => { window._hbeOff = false; });
    assert.strictEqual(ENG.hits.length, 0); assert.strictEqual(await page.evaluate(() => document.getElementById('homeAiBody').innerHTML), ref);
  });
  await t('더 최신 브리핑이 오면 늦게 온 엔진 답은 버린다', async () => {
    resetEng(); ENG.delays = [1200, 0];
    await scene(FB);
    await page.evaluate(() => { localStorage.setItem('gdm_e2', '1'); window._E2.until = 0; window._E2.bad = false; document.getElementById('homeAiBody').innerHTML = ''; });
    await page.evaluate(() => { _renderHomeConductorBrief('강남', '시청', 14, 20, null); });
    await settle(150);
    await page.evaluate(() => { _renderHomeConductorBrief('강남', '종로', 14, 20, null); });
    await settle(2200);
    const a = await page.evaluate(() => document.getElementById('homeAiBody').innerHTML);
    assert.ok(/<b>종로<\/b>/.test(a), a);
    assert.strictEqual(ENG.hits.length, 2);
  });
  await t('설정 카드 · 켜면 상태 글자', async () => {
    const r = await page.evaluate(() => { window._e2SetUse(true); window._e2SyncCard(); var s = document.getElementById('e2SetStat'); return { has: !!document.getElementById('e2SetCard'), t: s ? s.textContent : null }; });
    assert.ok(r.has); assert.ok(/켜짐/.test(r.t), r.t);
    await page.evaluate(() => { window._e2SetUse(false); });
  });
  await t('화면 오류 없음', async () => { assert.deepStrictEqual(errs.filter(e => !/Failed to fetch|Load failed|NetworkError/.test(e)), []); });

  await b.close();
  console.log('home_brief_e2.ui: ' + pass + ' pass ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})();
