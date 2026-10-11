// 오버레이 도착 전 추천 — 2026-10-11
//   하차 10분 전 추천이 만든 문구(시간대 규칙·근처 가게·쿠팡 아이템 그대로)를 도착 3분 전부터 오버레이 맨 아래 줄(두 줄 + [보기] [확인])로 보여 준다. 윗줄(경로)은 그대로.
// 실행: node test/overlay_reco.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
  const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
  await page.clock.install({ time: new Date('2026-10-11T12:30:00+09:00') });
  await page.goto('file://' + html); await page.addStyleTag({ content: '#locDiscOv{display:none !important}' }); await page.clock.runFor(2500);
  const lines = (opts) => page.evaluate((o) => {
    window._ovlRecoOff = !!o.off;
    window._pipReco = o.reco === null ? null : { title: '하차 10분 전 · 아라', body: '점심시간이에요. 제육볶음 어떠세요?\n근처엔 한솥, 맘스터치 있어요.\n오늘도 수고했어요.', at: Date.now() - (o.ageMin || 0) * 60000, ovlAt: Date.now() - 60000 };
    window._arrHomeEta = () => (o.rem == null ? null : { arrMs: Date.now() + o.rem * 1000, rem: o.rem });
    return _ovlLines().l3;
  }, opts);

  console.log('[① 도착 3분 전부터 하단 추천 줄(reco) — 윗줄(경로)은 그대로]');
  const recoOf = (opts) => page.evaluate((o) => {
    window._ovlRecoOff = !!o.off; window._ovlRecoDismissAt = undefined;
    window._pipReco = o.reco === null ? null : { title: '하차 10분 전 · 아라', body: o.body || '점심시간이에요. 제육볶음 어떠세요?\n근처엔 한솥, 맘스터치 있어요.\n오늘도 수고했어요.', at: Date.now() - (o.ageMin || 0) * 60000, ovlAt: Date.now() - 60000 };
    window._arrLast = o.last ? Object.assign({ at: window._pipReco.at }, o.last) : null;
    window._arrHomeEta = () => (o.rem == null ? null : { arrMs: Date.now() + o.rem * 1000, rem: o.rem });
    return _ovlLines().reco;
  }, opts);
  await t('도착 10분 전엔 하단 추천이 없다', async () => assert.ok(!(await recoOf({ rem: 600 })) || (await recoOf({ rem: 600 })).on !== true));
  await t('도착 3분 전부터 추천 첫 두 줄이 하단에 뜬다', async () => { const x = await recoOf({ rem: 170 }); assert.strictEqual(x.on, true); assert.strictEqual(x.a, '점심시간이에요. 제육볶음 어떠세요?'); assert.strictEqual(x.b, '근처엔 한솥, 맘스터치 있어요.'); });
  await t('도착 직전(10초 전)에도 보인다', async () => assert.strictEqual((await recoOf({ rem: 10 })).on, true));
  await t('도착한 지 30초가 넘으면 사라진다', async () => { const x = await recoOf({ rem: -60 }); assert.ok(!x || x.on !== true); });
  await t('3분보다 이르면(4분 전) 아직 안 뜬다', async () => { const x = await recoOf({ rem: 240 }); assert.ok(!x || x.on !== true); });
  await t('추천이 나간 적 없으면(00~07시 등) 아무것도 안 뜬다', async () => { const x = await recoOf({ rem: 120, reco: null }); assert.ok(!x || x.on !== true); });
  await t('25분 넘은 옛 추천은 쓰지 않는다', async () => { const x = await recoOf({ rem: 120, ageMin: 40 }); assert.ok(!x || x.on !== true); });
  await t('끄기 스위치(_ovlRecoOff)가 동작한다', async () => { const x = await recoOf({ rem: 120, off: true }); assert.ok(!x || x.on !== true); });
  await t('윗줄(line3)에는 추천 문구가 섞이지 않는다 (제목 20초가 지난 뒤)', async () => {
    const x = await page.evaluate(() => { window._ovlRecoOff = false; window._ovlRecoDismissAt = undefined; window._pipReco = { title: 't', body: '가\n나', at: Date.now(), ovlAt: Date.now() - 60000 }; window._arrHomeEta = () => ({ arrMs: Date.now() + 100000, rem: 100 }); return _ovlLines().l3; });
    assert.strictEqual(x, '');
  });
  await t('긴 문장은 한 줄 26자로 줄인다', async () => {
    const x = await recoOf({ rem: 100, body: '가'.repeat(60) + '\n' + '나'.repeat(60) });
    assert.ok(x.a.length <= 27 && x.b.length <= 27, x.a.length + ',' + x.b.length);
  });
  await t('한 줄짜리 추천이면 둘째 줄은 비어 있다', async () => { const x = await recoOf({ rem: 100, body: '아침이에요' }); assert.strictEqual(x.a, '아침이에요'); assert.strictEqual(x.b, ''); });
  await t('추천 알림을 설정에서 꺼 두면 오버레이에도 안 뜬다', async () => {
    const x = await page.evaluate(() => { _notifPrefSet('arrive_reco', 0); window._ovlRecoOff = false; window._ovlRecoDismissAt = undefined; window._pipReco = { title: 't', body: '가\n나', at: Date.now(), ovlAt: Date.now() - 60000 }; window._arrHomeEta = () => ({ arrMs: Date.now() + 100000, rem: 100 }); const r = _ovlLines().reco; const al = _notifAllowed('arrive_reco'); _notifPrefSet('arrive_reco', 1); return [al, !!(r && r.on)]; });
    assert.strictEqual(JSON.stringify(x), JSON.stringify([false, false]));
  });

  console.log('[①-2 보기 버튼 이름 · 보기/확인 동작]');
  await t('맛집(낮·아침·17~19시)은 [맛집 보기]', async () => assert.strictEqual((await recoOf({ rem: 100, last: { slot: 'lunch', action: { label: '맛집 위치 보기', call: '_arrGoFoodTab()' } } })).go, '맛집 보기'));
  await t('쿠팡 아이템(21시 이후)은 [쿠팡 보기]', async () => assert.strictEqual((await recoOf({ rem: 100, last: { slot: 'shop', action: { kind: 'shop', item: {} } } })).go, '쿠팡 보기'));
  await t('야식은 [주문하기]', async () => assert.strictEqual((await recoOf({ rem: 100, last: { slot: 'night', action: { kind: 'delivery', menu: '치킨' } } })).go, '주문하기'));
  const act = (a, last) => page.evaluate(([a, last]) => {
    window._ovlRecoOff = false; window._ovlRecoDismissAt = undefined;
    window._pipReco = { title: 't', body: '가\n나', at: Date.now(), ovlAt: Date.now() - 60000 };
    window._arrLast = last ? { at: window._pipReco.at, action: last, title: '제목', body: '본문' } : null;
    window._arrHomeEta = () => ({ arrMs: Date.now() + 100000, rem: 100 });
    const calls = []; window._arrShopOpen = () => calls.push('shop'); window._arrGoFoodTab = () => calls.push('food'); window._showBriefingModal = (t, b, x, ac) => calls.push('deli:' + t + ':' + (ac && ac.kind));
    const before = !!(_ovlLines().reco && _ovlLines().reco.on);
    window._ovlAct(a);
    const after = _ovlLines().reco; return { before, after: !!(after && after.on), calls };
  }, [a, last]);
  await t('[확인] → 추천이 사라지고 어디로도 안 간다', async () => { const x = await act('recoOk', { label: 'x', call: '_arrGoFoodTab()' }); assert.deepStrictEqual(x, { before: true, after: false, calls: [] }); });
  await t('[보기] 맛집 → 맛집 탭 + 추천 닫힘', async () => { const x = await act('recoGo', { label: 'x', call: '_arrGoFoodTab()' }); assert.deepStrictEqual(x, { before: true, after: false, calls: ['food'] }); });
  await t('[보기] 쿠팡 아이템 → 쿠팡 열기 + 추천 닫힘', async () => { const x = await act('recoGo', { kind: 'shop', item: {} }); assert.deepStrictEqual(x, { before: true, after: false, calls: ['shop'] }); });
  await t('[보기] 야식 → 팝업 없이 바로 배달앱 쪽으로(0.7초 뒤) + 추천 닫힘', async () => {
    const x = await page.evaluate(async () => { window._ovlRecoOff = false; window._ovlRecoDismissAt = undefined; window._pipReco = { title: 't', body: '가\n나', at: Date.now(), ovlAt: Date.now() - 60000 }; window._arrLast = { at: window._pipReco.at, action: { kind: 'delivery', menu: '쌀국수' }, title: '제목', body: '본문' }; window._arrHomeEta = () => ({ arrMs: Date.now() + 100000, rem: 100 });
      const calls = []; const keepAuto = window._arrOrderAuto; window._showBriefingModal = () => calls.push('popup'); window._arrOrderAuto = (m) => calls.push('auto:' + m); window._ovlAct('recoGo'); const early = calls.slice(); await new Promise(r => setTimeout(r, 900)); window._arrOrderAuto = keepAuto; return { early, calls, after: !!(_ovlLines().reco && _ovlLines().reco.on) }; });
    assert.strictEqual(JSON.stringify(x), JSON.stringify({ early: [], calls: ['auto:쌀국수'], after: false }));
  });
  console.log('[①-3 설치된 배달앱 바로 켜기 · 없으면 맛집 탭의 가게]');
  const dlv = (plug, menu) => page.evaluate(async ([plug, menu]) => {
    const tried = []; const toasts = []; window.toast = (m) => toasts.push(m);
    window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
    if (plug === 'none') delete window.Capacitor.Plugins.AppLauncher;
    else window.Capacitor.Plugins.AppLauncher = { openUrl: async ({ url }) => { tried.push(url.split(':')[0]); const ok = plug.indexOf(url.split(':')[0]) >= 0; return { completed: ok }; } };
    return await new Promise(res => _dlvOpenInstalled(menu, (ok, k) => res({ ok, k, tried })));
  }, [plug, menu]);
  await t('배민이 있으면 배민을 켠다(한 번만 시도)', async () => assert.deepStrictEqual(await dlv(['baemin', 'yogiyo', 'coupangeats'], '쌀국수'), { ok: true, k: 'baemin', tried: ['baemin'] }));
  await t('배민이 없고 요기요가 있으면 요기요', async () => assert.deepStrictEqual(await dlv(['yogiyo'], '쌀국수'), { ok: true, k: 'yogiyo', tried: ['baemin', 'yogiyo'] }));
  await t('쿠팡이츠만 있으면 쿠팡이츠', async () => assert.deepStrictEqual(await dlv(['coupangeats'], '치킨'), { ok: true, k: 'coupangeats', tried: ['baemin', 'yogiyo', 'coupangeats'] }));
  await t('셋 다 없으면 ok=false', async () => assert.deepStrictEqual(await dlv([], '치킨'), { ok: false, k: undefined, tried: ['baemin', 'yogiyo', 'coupangeats'] }));
  await t('AppLauncher 가 없어도 ok=false(오류 없이)', async () => { const r = await dlv('none', '치킨'); assert.strictEqual(r.ok, false); });
  await t('설치된 앱이 있으면 맛집 탭으로 가지 않는다 / 없으면 간다', async () => {
    const r = await page.evaluate(async () => { const calls = []; const keep = window._arrFoodShowPlace; window._arrFoodShowPlace = (m, p) => calls.push('food:' + m + ':' + p); window._arrPlace = { n: '맛나식당' };
      window.Capacitor.Plugins.AppLauncher = { openUrl: async () => ({ completed: true }) }; _arrOrderAuto('쌀국수'); await new Promise(r => setTimeout(r, 50)); const a = calls.slice();
      window.Capacitor.Plugins.AppLauncher = { openUrl: async () => ({ completed: false }) }; _arrOrderAuto('쌀국수'); await new Promise(r => setTimeout(r, 50)); window._arrFoodShowPlace = keep; return { a, b: calls.slice() }; });
    assert.strictEqual(JSON.stringify(r), JSON.stringify({ a: [], b: ['food:쌀국수:맛나식당'] }), JSON.stringify(r));
  });
  await t('맛집 탭에서 추천 가게(없으면 메뉴 종류가 맞는 가게)의 카드를 연다', async () => {
    const r = await page.evaluate(async () => {
      document.getElementById('foodList') || document.body.insertAdjacentHTML('beforeend', '<div id="foodList"></div>');
      window._arrGoFoodTab = () => {}; const opened = []; window.toast = () => {};
      const mk = (nm, cat) => ({ place_name: nm, category_name: cat, x: '126.9', y: '37.5', distance: 100 });
      const render = (items) => { window._foodAllData = items; const l = document.getElementById('foodList'); l.innerHTML = ''; items.forEach(p => { const c = document.createElement('div'); c.className = 'food-card'; c.innerHTML = '<div class="food-name">' + p.place_name + '</div>'; c.addEventListener('click', () => opened.push(p.place_name)); l.appendChild(c); }); };
      render([mk('가나다국밥', '음식점 > 한식 > 국밥'), mk('포메인', '음식점 > 아시아음식 > 베트남음식'), mk('맛나식당', '음식점 > 한식')]);
      _arrFoodShowPlace('쌀국수', '맛나식당'); await new Promise(r => setTimeout(r, 700));
      _arrFoodShowPlace('쌀국수', null); await new Promise(r => setTimeout(r, 700));
      _arrFoodShowPlace('피자', null); await new Promise(r => setTimeout(r, 700));
      return opened; });
    assert.strictEqual(JSON.stringify(r), JSON.stringify(['맛나식당', '포메인']), JSON.stringify(r));
  });

  await t('[확인] 후 새 추천(다른 at)이 오면 다시 뜬다', async () => {
    const x = await page.evaluate(() => { window._ovlRecoOff = false; window._ovlRecoDismissAt = 12345; window._pipReco = { title: 't', body: '가\n나', at: Date.now(), ovlAt: Date.now() - 60000 }; window._arrHomeEta = () => ({ arrMs: Date.now() + 100000, rem: 100 }); const r = _ovlLines().reco; return !!(r && r.on); });
    assert.strictEqual(x, true);
  });
  await t('실제 추천 발사(_arrFireAlertNow)가 _arrLast 에 같은 at·행동을 남긴다', async () => {
    await page.evaluate(() => { try{ _notifPrefSet('arrive_reco', 1); _notifOnceReset(); }catch(e){} window._arrLast = null; window._pipReco = null; const arrMs = new Date('2026-10-11T22:30:00+09:00').getTime(); _arrFireAlertNow('아라', arrMs); });
    await page.clock.runFor(8000);
    const x = await page.evaluate(() => window._arrLast ? { atOk: window._arrLast.at === (window._pipReco && window._pipReco.at) && window._arrLast.at > 0, kind: window._arrLast.action && window._arrLast.action.kind } : { diag: JSON.stringify(window._arrDiag) });
    assert.ok(x.atOk === true, JSON.stringify(x));
  });
  await t('Overlay.update 로 가는 값에 reco 가 실린다', async () => {
    const x = await page.evaluate(() => { window._ovlRecoOff = false; window._ovlRecoDismissAt = undefined; window._pipReco = { title: 't', body: '아침이에요\n근처엔 스타벅스 있어요.', at: Date.now(), ovlAt: 0 }; window._arrHomeEta = () => ({ arrMs: Date.now() + 100000, rem: 100 }); const L = _ovlLines(); return { reco: L.reco, l3: L.l3 }; });
    assert.strictEqual(x.reco.a, '아침이에요'); assert.strictEqual(x.reco.b, '근처엔 스타벅스 있어요.'); assert.ok(!/스타벅스/.test(x.l3 || ''));
  });

  await t('테스트 미리보기(_ovlRecoForceUntil)는 도착이 멀어도 오버레이에 뜨고, 시간이 지나면 꺼진다', async () => {
    const r = await page.evaluate(() => { window._ovlRecoOff = false; window._ovlRecoDismissAt = undefined; window._pipReco = { title: 't', body: '가\n나', at: Date.now(), ovlAt: Date.now() - 60000 }; window._arrHomeEta = () => ({ arrMs: Date.now() + 900000, rem: 900 });
      const off = !!(_ovlLines().reco && _ovlLines().reco.on); window._ovlRecoForceUntil = Date.now() + 90000; const on = !!(_ovlLines().reco && _ovlLines().reco.on); window._ovlRecoForceUntil = Date.now() - 1; const exp = !!(_ovlLines().reco && _ovlLines().reco.on); return [off, on, exp]; });
    assert.strictEqual(JSON.stringify(r), JSON.stringify([false, true, false]));
  });
  await t('설정의 추천 테스트 버튼(_arrTestUI)이 미리보기를 켠다', async () => {
    const r = await page.evaluate(() => { window._ovlRecoForceUntil = 0; try{ _notifOnceReset(); }catch(e){} _arrTestUI('lunch'); return window._ovlRecoForceUntil > Date.now(); });
    assert.strictEqual(r, true);
  });

  console.log('[② 문구는 기존 규칙(시간대·근처 가게·쿠팡 아이템) 그대로 만든 것]');
  const slotText = (hhmm) => page.evaluate((h) => {
    const arrMs = new Date('2026-10-11T' + h + ':00+09:00').getTime();
    const slot = _arrSlot(arrMs); if (slot === 'none') return { slot, lines: [] };
    const a = _arrBuildAlert('아라', null, arrMs);
    return { slot, lines: _arrPipText(a, slot, '아라', a.body).lines };
  }, hhmm);
  for (const [h, slot, re] of [['08:30', 'morning', /아침|카페|커피/], ['12:30', 'lunch', /점심/], ['17:30', 'night', /저녁/], ['20:00', 'night', /야식/], ['22:30', 'shop', /오늘의 추천/], ['03:00', 'none', null]]) {
    await t(h + ' 도착 → ' + slot + (slot === 'shop' ? ' (쿠팡 아이템)' : ''), async () => { const x = await slotText(h); assert.strictEqual(x.slot, slot); if (slot === 'none') assert.deepStrictEqual(x.lines, []); else { assert.ok(x.lines.length >= 2, JSON.stringify(x)); assert.ok(re.test(x.lines.join(' ')), JSON.stringify(x)); } });
  }
  await t('페이지 오류 없음', async () => assert.deepStrictEqual([...new Set(errs)], []));
  await ctx.close(); await b.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
