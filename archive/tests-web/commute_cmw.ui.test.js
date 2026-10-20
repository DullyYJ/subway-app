// 출퇴근 브리핑 시각을 엔진이 정하기(설정 스위치 gdm_cmw) ↔ 앱(JS) 연결 시험 — 2026-10-19 (5번 5단계 셋째 조각)
//   진짜 index.html + 진짜 엔진 모듈(engine/commute-alarm.js)에 연결해 확인한다:
//   · 꺼져 있으면(기본) 예전 그대로 — 엔진에 묻지 않는다
//   · 켜면: 같은 시각·설정에서 '지금 보낼까'가 예전 웹 규칙(_cmTickLocal)과 같다 · 4주치 예약 시각 목록이 예전(_cmOccurrences)과 같다
//   · 엔진이 '아직 멀다'고 한 동안은 다시 묻지 않는다 · 시각·요일을 바꾸면 바로 다시 묻는다 · 같은 분에 두 번 보내지 않는다
//   · 폴백: 404 · 응답 없음(2.5초) · 이상한 응답 → 바로 예전 규칙 + 60초 쉬기(그 뒤 다시 묻는다)
// 실행: node test/commute_cmw.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const CM = require('../engine/commute-alarm');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 900)); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ENG;
function resetEng() { ENG = { mode: 'ok', hits: [] }; }
const MON0 = new Date('2026-10-19T00:00:00+09:00').getTime();
const at = (hm, s) => MON0 + (parseInt(hm.slice(0, 2)) * 60 + parseInt(hm.slice(3))) * 60000 + (s || 0) * 1000;

(async () => {
  resetEng();
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
  await ctx.addInitScript(() => { try { localStorage.setItem('gdm_loc_disclosed', '1'); } catch (e) {} window.Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web', Plugins: {} }; });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => {
    const u = new URL(r.request().url()); if (u.protocol === 'file:' || u.protocol === 'data:') return r.continue();
    const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (/route-v2/.test(u.host) && u.pathname === '/commute-alarm') {
      const body = r.request().postData() || ''; ENG.hits.push(body);
      if (ENG.mode === '404') return r.fulfill({ status: 404, headers: H, body: '{"error":"not found"}' });
      if (ENG.mode === 'hang') return;
      if (ENG.mode === 'bad') return r.fulfill({ status: 200, headers: H, body: '{"ok":true,"v":1,"fire":"yes","due":["x"]}' });
      const j = JSON.parse(body); const out = j.op === 'occ' ? CM.cmOccurrences(j) : j.op === 'pre' ? CM.cmPreDue(j) : CM.cmDue(j); out.ok = true;
      return r.fulfill({ status: 200, headers: H, body: JSON.stringify(out) });
    }
    return r.fulfill({ status: 200, headers: H, body: '{}' });
  });
  await page.clock.install({ time: new Date(at('12:00')) });
  await page.goto('file://' + html);
  await page.clock.runFor(3000);
  const fixAt = ms => page.clock.setFixedTime(new Date(ms));
  await fixAt(at('12:00'));

  const setup = async (on, mode, cfg) => {
    resetEng(); if (mode) ENG.mode = mode;
    await fixAt(at('06:00'));
    await page.evaluate(([on, cfg]) => {
      window._cmwSetUse(!!on); window._cmwStat.nextAt = 0; window._cmwStat.sig = '';
      Object.assign(_cmAlarm, { on: true, morn: '07:30', eve: '18:30', days: [1, 2, 3, 4, 5], lastKey: '' }, cfg || {});
      window._cmOsOk = false; window.__briefs = [];
      window._fireCommuteBriefing = function (w) { window.__briefs.push(w); };
    }, [!!on, cfg || null]);
  };
  const settle = async () => { for (let i = 0; i < 80; i++) { if (!(await page.evaluate(() => window._cmwStat.busy))) return; await sleep(40); await page.clock.runFor(40); } };
  const briefs = () => page.evaluate(() => window.__briefs.slice());
  const tick = async () => { await page.evaluate(() => { _cmTick(); }); await settle(); };

  console.log('[스위치 꺼짐 = 예전 그대로]');
  await setup(false);
  await fixAt(at('07:30', 5)); await tick();
  await t('꺼져 있으면 엔진에 묻지 않고 예전 규칙으로 보낸다', async () => { assert.strictEqual(ENG.hits.length, 0); assert.deepStrictEqual(await briefs(), ['morn']); assert.strictEqual(await page.evaluate(() => _cmAlarm.lastKey), 'Mon Oct 19 2026|07:30'); });

  console.log('[스위치 켜짐 = 같은 시각에서 예전 규칙과 같다]');
  const times = []; for (const hm of ['00:00', '06:59', '07:29', '07:30', '07:31', '12:00', '18:29', '18:30', '18:31', '23:59']) for (const s of [0, 30, 59]) for (const dd of [0, 5, 6]) times.push(at(hm, s) + dd * 86400000);
  const cfgs = [{}, { days: [] }, { days: [0, 6] }, { morn: '18:30' }, { on: false }];
  await t('시각 90 × 설정 5종: 보낼까·보낸 종류·기록이 예전 규칙과 같다', async () => {
    let n = 0, fires = 0;
    for (const cfg of cfgs) for (const ms of times) {
      await setup(true, 'ok', cfg);
      await fixAt(ms);
      const loc = await page.evaluate(() => { window.__briefs = []; _cmAlarm.lastKey = ''; _cmTickLocal(); return { b: window.__briefs.slice(), k: _cmAlarm.lastKey }; });
      await page.evaluate(() => { window.__briefs = []; _cmAlarm.lastKey = ''; window._cmwStat.nextAt = 0; });
      await tick();
      const eng = { b: await briefs(), k: await page.evaluate(() => _cmAlarm.lastKey) };
      assert.deepStrictEqual(eng, loc, JSON.stringify({ cfg, ms: new Date(ms).toISOString() }));
      n++; fires += loc.b.length;
    }
    assert.strictEqual(n, 450); assert.ok(fires > 0 && fires < n, '보냄 ' + fires + '/' + n);
  });
  await t('엔진에는 시각·켜짐·요일·기록만 간다 — 장소·내용은 가지 않는다', async () => {
    await setup(true); await fixAt(at('07:30', 5)); await tick();
    const j = JSON.parse(ENG.hits[0]); assert.deepStrictEqual(Object.keys(j).sort(), ['days', 'eve', 'lastKey', 'morn', 'nowMs', 'on', 'osOk']);
  });

  console.log('[묻는 횟수 · 중복]');
  await setup(true); await fixAt(at('06:00')); await tick();
  const h1 = ENG.hits.length;
  for (let i = 0; i < 6; i++) { await fixAt(at('06:00', 30 * (i + 1))); await tick(); }
  await t('대상 시각이 멀면 엔진이 길게 기다리라 해서 다시 묻지 않는다', async () => { assert.strictEqual(h1, 1); assert.strictEqual(ENG.hits.length, 1, String(ENG.hits.length)); assert.deepStrictEqual(await briefs(), []); });
  await page.evaluate(() => { _cmAlarm.morn = '06:10'; });
  await fixAt(at('06:00', 210)); await tick();
  await t('출근 시각을 바꾸면 기다리지 않고 바로 다시 묻는다', async () => assert.strictEqual(ENG.hits.length, 2));
  await setup(true); await fixAt(at('07:29', 0)); await tick(); await fixAt(at('07:30', 5)); await tick(); await fixAt(at('07:30', 35)); await tick();
  await t('같은 분에 두 번 보내지 않는다', async () => assert.deepStrictEqual(await briefs(), ['morn']));
  await setup(true); await page.evaluate(() => { window._cmOsOk = true; }); await fixAt(at('07:30', 5)); await tick();
  await t('OS 예약이 걸려 있으면 묻지도 보내지도 않는다', async () => { assert.strictEqual(ENG.hits.length, 0); assert.deepStrictEqual(await briefs(), []); });
  await setup(true, 'ok', { on: false }); await fixAt(at('07:30', 5)); await tick();
  await t('브리핑을 꺼 두면 묻지도 보내지도 않는다', async () => { assert.strictEqual(ENG.hits.length, 0); assert.deepStrictEqual(await briefs(), []); });

  console.log('[4주치 예약 시각]');
  const ln = () => page.evaluate(() => (window.__sched || []).map(n => ({ id: n.id, at: new Date(n.schedule.at).getTime(), which: n.extra && n.extra.which })));
  const sched = async (on, mode, cfg, nowMs) => {
    await setup(on, mode, cfg); await fixAt(nowMs);
    await page.evaluate(() => {
      window.__sched = [];
      window.Capacitor.Plugins.LocalNotifications = { cancel: () => Promise.resolve(), schedule: (o) => { o.notifications.forEach(n => window.__sched.push(n)); return Promise.resolve(); } };
      window._notifAllowed = function () { return true; };
      window._cmScheduleOS();
    });
    for (let i = 0; i < 60; i++) { await sleep(40); await page.clock.runFor(40); if ((await page.evaluate(() => window.__sched.length)) > 0) break; }
    await sleep(60); return ln();
  };
  await t('설정 4종 × 시각 3종: 예약 목록(id·시각·출근/퇴근)이 예전과 같다', async () => {
    let n = 0;
    for (const cfg of [{}, { days: [] }, { days: [0, 6] }, { morn: '23:59', eve: '00:00' }]) for (const now of [at('06:00'), at('07:30', -1) , at('07:30', 1) + 6 * 86400000]) {
      const a = await sched(false, 'ok', cfg, now); const hitsOff = ENG.hits.length;
      const e = await sched(true, 'ok', cfg, now);
      assert.strictEqual(hitsOff, 0); assert.ok(ENG.hits.length >= 1 && JSON.parse(ENG.hits[0]).op === 'occ');
      assert.ok(a.length >= 20, '예약 수 ' + a.length); assert.deepStrictEqual(e, a, JSON.stringify({ cfg, now })); n++;
    }
    assert.strictEqual(n, 12);
  });
  await t('엔진에는 시각·요일만 간다(op=occ)', async () => {
    await sched(true, 'ok', {}, at('06:00')); const j = JSON.parse(ENG.hits[0]); assert.deepStrictEqual(Object.keys(j).sort(), ['days', 'eve', 'morn', 'nowMs', 'op']);
  });
  for (const mode of ['404', 'bad']) {
    await t('예약: 엔진 ' + mode + ' → 바로 예전 규칙으로 예약 · 문제로 표시', async () => {
      const a = await sched(false, 'ok', {}, at('06:00')); const e = await sched(true, mode, {}, at('06:00'));
      assert.deepStrictEqual(e, a); assert.strictEqual(await page.evaluate(() => _cmwDown()), true);
      assert.ok(/대신 이어가고/.test(await page.evaluate(() => document.getElementById('cmwSetStat').textContent)));
    });
  }
  await t('예약: 엔진이 응답 없으면(2.5초) 예전 규칙으로 예약한다', async () => {
    const a = await sched(false, 'ok', {}, at('06:00'));
    await setup(true, 'hang'); await fixAt(at('06:00'));
    await page.evaluate(() => { window.__sched = []; window.Capacitor.Plugins.LocalNotifications = { cancel: () => Promise.resolve(), schedule: (o) => { o.notifications.forEach(n => window.__sched.push(n)); return Promise.resolve(); } }; window._notifAllowed = function () { return true; }; window._cmScheduleOS(); });
    await sleep(150); await page.clock.runFor(2600); await sleep(150);
    assert.deepStrictEqual(await ln(), a); assert.strictEqual(await page.evaluate(() => _cmwDown()), true);
  });

  console.log('[폴백 — 바로 예전 규칙 · 60초 쉬기]');
  for (const mode of ['404', 'bad']) {
    await setup(true, mode); await fixAt(at('07:30', 5)); await tick();
    await t('엔진 ' + mode + ' → 바로 예전 규칙으로 보낸다 · 카드는 문제로 표시', async () => {
      assert.deepStrictEqual(await briefs(), ['morn']);
      assert.strictEqual(await page.evaluate(() => _cmwDown()), true);
      assert.ok(/대신 이어가고/.test(await page.evaluate(() => document.getElementById('cmwSetStat').textContent)));
    });
    const before = ENG.hits.length;
    await page.evaluate(() => { _cmAlarm.lastKey = ''; window.__briefs = []; });
    await fixAt(at('07:30', 20)); await tick();
    await t('쉬는 60초 동안은 엔진에 묻지 않고 예전 규칙으로 계속 정한다 (' + mode + ')', async () => { assert.strictEqual(ENG.hits.length, before); assert.deepStrictEqual(await briefs(), ['morn']); });
  }
  await setup(true, '404'); await fixAt(at('07:30', 5)); await tick();
  ENG.mode = 'ok'; await page.clock.runFor(61000); await fixAt(at('07:31', 10));
  await page.evaluate(() => { _cmAlarm.lastKey = ''; _cmAlarm.morn = '07:31'; window.__briefs = []; });
  const hb = ENG.hits.length; await tick();
  await t('60초가 지나면 다시 엔진에 묻고 엔진이 정한 대로 보낸다', async () => { assert.ok(ENG.hits.length > hb); assert.strictEqual(await page.evaluate(() => _cmwDown()), false); assert.deepStrictEqual(await briefs(), ['morn']); });
  await setup(true, 'hang'); await fixAt(at('07:30', 5));
  await page.evaluate(() => { _cmTick(); });
  await sleep(150); await page.clock.runFor(2600); await sleep(100);
  await t('엔진이 응답 없으면(2.5초) 예전 규칙으로 보낸다 · 쉬기', async () => { assert.deepStrictEqual(await briefs(), ['morn']); assert.strictEqual(await page.evaluate(() => _cmwDown()), true); });

  console.log('[s64 — 출퇴근 경로 미리 받기 때]');
  const preSetup = async (on, mode, cfg, coords) => {
    await setup(on, mode, cfg);
    await page.evaluate((co) => {
      Object.assign(_cmAlarm, co === false ? { from: '', fromLat: null, fromLng: null, to: '', toLat: null, toLng: null, eFrom: '', eTo: '' } : { from: '집', fromLat: 37.5, fromLng: 127.0, to: '회사', toLat: 37.4, toLng: 127.1, eFrom: '', eTo: '' });
      window._cmPf.at = {}; window._cmPf.busy = false; window._cmPf.age = {}; window._cmPf.seq++;
      window.__pre = [];
      window._routeGetJson = function (u) { window.__pre.push(u); return Promise.resolve({ result: { path: [1] } }); };
    }, coords === false ? false : true);
  };
  const preRun = async () => {
    await page.evaluate(() => { _commutePrefetch('test'); });
    for (let i = 0; i < 80; i++) { if (!(await page.evaluate(() => window._cmPf.busy))) break; await sleep(40); await page.clock.runFor(40); }
    return page.evaluate(() => window.__pre.slice());
  };
  await t('스위치 꺼짐: 엔진에 묻지 않고 예전 규칙으로 미리 받는다', async () => {
    await preSetup(false); await fixAt(at('07:00')); const r = await preRun();
    assert.strictEqual(ENG.hits.length, 0); assert.strictEqual(r.length, 1); assert.ok(/SX=127&SY=37\.5&EX=127\.1&EY=37\.4/.test(r[0]), r[0]);
  });
  const ptimes = []; for (const hm of ['00:00', '06:44', '06:45', '07:30', '07:50', '07:51', '12:00', '17:44', '17:45', '18:30', '18:50', '18:51', '23:59']) for (const dd of [0, 5, 6]) ptimes.push(at(hm, 20) + dd * 86400000);
  await t('시각 39 × 설정 4종: 미리 받는 구간이 예전 규칙과 같다(요일 · 자정 · 중복)', async () => {
    let n = 0, hits = 0;
    for (const cfg of [{}, { days: [] }, { days: [0, 6] }, { morn: '18:30', eve: '07:30' }]) for (const ms of ptimes) {
      await preSetup(false, 'ok', cfg); await fixAt(ms); const a = await preRun();
      await preSetup(true, 'ok', cfg); await fixAt(ms); const e = await preRun();
      assert.deepStrictEqual(e, a, JSON.stringify({ cfg, ms: new Date(ms).toISOString() })); n++; hits += a.length;
    }
    assert.strictEqual(n, 156); assert.ok(hits > 10 && hits < n, '받음 ' + hits);
  });
  await t('엔진에는 시각·요일·경과 시간만 간다 — 장소 이름·좌표는 가지 않는다(op=pre)', async () => {
    await preSetup(true); await fixAt(at('07:00')); await preRun();
    const j = JSON.parse(ENG.hits[0]); assert.deepStrictEqual(Object.keys(j).sort(), ['ageEve', 'ageMorn', 'days', 'eve', 'morn', 'nowMs', 'op']); assert.strictEqual(j.op, 'pre');
    assert.ok(!/37\.|127|집|회사/.test(ENG.hits[0]), ENG.hits[0]);
  });
  await t('같은 구간은 20분 안에 두 번 받지 않는다 · 20분이 지나면 다시 받는다(경과 시간을 엔진에 알린다)', async () => {
    await preSetup(true); await fixAt(at('07:00')); const a = await preRun(); assert.strictEqual(a.length, 1);
    await fixAt(at('07:10')); const b = await preRun(); assert.strictEqual(b.length, 1, '10분 뒤에 또 받음');
    assert.strictEqual(JSON.parse(ENG.hits[1]).ageMorn, 600000);
    await fixAt(at('07:21')); const c = await preRun(); assert.strictEqual(c.length, 2);
  });
  await t('저장된 장소(좌표)가 없으면 미리 받지 않는다', async () => {
    await preSetup(true, 'ok', {}, false); await fixAt(at('07:00')); assert.deepStrictEqual(await preRun(), []);
  });
  for (const mode of ['404', 'bad']) {
    await t('미리 받기: 엔진 ' + mode + ' → 바로 예전 규칙으로 받는다 · 문제로 표시 · 60초는 엔진에 묻지 않는다', async () => {
      await preSetup(true, mode); await fixAt(at('07:00')); const e = await preRun();
      assert.strictEqual(e.length, 1); assert.strictEqual(await page.evaluate(() => _cmwDown()), true);
      const before = ENG.hits.length; await page.evaluate(() => { window._cmPf.at = {}; window.__pre = []; }); await fixAt(at('07:00', 20)); const e2 = await preRun();
      assert.strictEqual(ENG.hits.length, before); assert.strictEqual(e2.length, 1);
    });
  }
  await t('미리 받기: 엔진이 응답 없으면(2.5초) 예전 규칙으로 받는다', async () => {
    await preSetup(true, 'hang'); await fixAt(at('07:00'));
    await page.evaluate(() => { _commutePrefetch('test'); }); await sleep(150); await page.clock.runFor(2600); await sleep(150);
    for (let i = 0; i < 20; i++) { if (!(await page.evaluate(() => window._cmPf.busy))) break; await sleep(40); await page.clock.runFor(40); }
    assert.strictEqual((await page.evaluate(() => window.__pre.length)), 1); assert.strictEqual(await page.evaluate(() => _cmwDown()), true);
  });

  console.log('[설정 카드]');
  await setup(false);
  await t('카드: 꺼짐 문구 · 켜면 gdm_cmw=1 · 끄면 0', async () => {
    await page.evaluate(() => _cmwSyncCard());
    assert.ok(/꺼짐/.test(await page.evaluate(() => document.getElementById('cmwSetStat').textContent)));
    await page.evaluate(() => _cmwSetUse(true)); assert.strictEqual(await page.evaluate(() => localStorage.getItem('gdm_cmw')), '1');
    assert.ok(/켜짐/.test(await page.evaluate(() => document.getElementById('cmwSetStat').textContent)));
    await page.evaluate(() => _cmwSetUse(false)); assert.strictEqual(await page.evaluate(() => localStorage.getItem('gdm_cmw')), '0');
  });
  await t('엔진 설정 화면의 cmw 항목 문구가 카드와 같다', async () => {
    const SE = require('../engine/settings'); const row = SE.SETTINGS_FEATS.find(x => x.k === 'cmw'); assert.ok(row);
    assert.strictEqual(await page.evaluate(() => document.querySelector('#cmwSetCard p').textContent), row.desc);
    assert.strictEqual(await page.evaluate(() => document.querySelector('#cmwSetCard div div').textContent), row.title);
  });
  await t('스크립트 오류 없음', async () => assert.deepStrictEqual(errs, []));

  await b.close();
  console.log('commute_cmw: ' + pass + ' pass ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
