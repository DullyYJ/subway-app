// 오버레이 도착 전 추천 — 2026-10-11
//   하차 10분 전 추천이 만든 문구(시간대 규칙·근처 가게·쿠팡 아이템 그대로)를 도착 3분 전부터 오버레이 윗줄(line3)에 두 줄로 보여 준다.
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

  console.log('[① 도착 3분 전부터 추천 문구 두 줄]');
  await t('도착 10분 전엔(제목 20초가 지난 뒤) 윗줄이 비어 있다', async () => assert.strictEqual(await lines({ rem: 600 }), ''));
  await t('도착 3분 전부터 추천 첫 두 줄이 윗줄에 뜬다', async () => { const x = await lines({ rem: 170 }); assert.strictEqual(x, '점심시간이에요. 제육볶음 어떠세요?\n근처엔 한솥, 맘스터치 있어요.'); });
  await t('도착 직전(10초 전)에도 보인다', async () => assert.ok((await lines({ rem: 10 })).includes('근처엔')));
  await t('도착한 지 30초가 넘으면 사라진다', async () => assert.strictEqual(await lines({ rem: -60 }), ''));
  await t('3분보다 이르면(4분 전) 아직 안 뜬다', async () => assert.strictEqual(await lines({ rem: 240 }), ''));
  await t('추천이 나간 적 없으면(00~07시 등) 아무것도 안 뜬다', async () => assert.strictEqual(await lines({ rem: 120, reco: null }), ''));
  await t('25분 넘은 옛 추천은 쓰지 않는다', async () => assert.strictEqual(await lines({ rem: 120, ageMin: 40 }), ''));
  await t('끄기 스위치(_ovlRecoOff)가 동작한다', async () => assert.strictEqual(await lines({ rem: 120, off: true }), ''));
  await t('긴 문장은 한 줄 26자로 줄인다', async () => {
    const x = await page.evaluate(() => { window._ovlRecoOff = false; window._pipReco = { title: 't', body: '가'.repeat(60) + '\n' + '나'.repeat(60), at: Date.now(), ovlAt: 0 }; window._arrHomeEta = () => ({ arrMs: Date.now() + 100000, rem: 100 }); return _ovlLines().l3; });
    x.split('\n').forEach(l => assert.ok(l.length <= 27, l.length));
  });
  await t('추천 알림을 설정에서 꺼 두면 오버레이에도 안 뜬다', async () => {
    const x = await page.evaluate(() => { _notifPrefSet('arrive_reco', 0); window._ovlRecoOff = false; window._pipReco = { title: 't', body: '가\n나', at: Date.now(), ovlAt: Date.now() - 60000 }; window._arrHomeEta = () => ({ arrMs: Date.now() + 100000, rem: 100 }); const r = [_notifAllowed('arrive_reco'), _ovlLines().l3]; _notifPrefSet('arrive_reco', 1); return r; });
    assert.ok(JSON.stringify(x) === JSON.stringify([false, '']), 'got ' + JSON.stringify(x));
  });
  await t('오버레이로 가는 값(Overlay.update 의 line3)도 같은 문구다', async () => {
    const x = await page.evaluate(() => { window._ovlRecoOff = false; window._pipReco = { title: 't', body: '아침이에요\n근처엔 스타벅스 있어요.', at: Date.now(), ovlAt: 0 }; window._arrHomeEta = () => ({ arrMs: Date.now() + 100000, rem: 100 }); return _ovlLines(); });
    assert.strictEqual(x.l3, '아침이에요\n근처엔 스타벅스 있어요.');
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
