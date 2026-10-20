// 서버 구동 네이티브 안내창(dlg: 권한 안내 · 오버레이 진단 기록 · 잠깐 뜨는 알림) 웹 연결 시험 — 2026-10-20 (s79)
//   원칙: "계산은 엔진이, 그림은 앱이". 앱은 사실(종류 · 기록 줄 · 알림 글 두 줄)만 보내고, 문구·단추·크기·색은 엔진이 정한다.
//   · 플러그인이 없거나 꺼져 있거나 옛 APK(cap 16 미만)면 요청 없이 예전 웹 안내창 · 켜면 웹 안내창 대신 엔진 화면을 그대로 show
//   · 누르는 동작(dl.ok / dl.no / dl.copy / dl.clear / dl.close)과 뒤로가기 · 알림은 1.5초 뒤 저절로 닫힘 · 엔진이 죽으면 웹 안내창으로 돌아간다
// 실행: node test/screen_talk_js.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const ET = require('../engine/dialog');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 800)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh(opt) {
    opt = opt || {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
    const x = { ctx, page, errs, reqs: [], serve: opt.serve || 'ok' };
    await page.route('**/*', async r => {
      const u = new URL(r.request().url()), req = r.request();
      if (u.protocol === 'file:') return r.continue();
      if (u.pathname === '/screen/dlg' && u.hostname.indexOf('route-v2') >= 0) {
        assert.strictEqual(req.method(), 'POST'); assert.ok(/text\/plain/.test(req.headers()['content-type'] || ''), '사전 요청이 필요한 형식으로 보냈다');
        const body = JSON.parse(req.postData() || '{}'); x.reqs.push(body);
        if (x.serve === 'down') return r.abort();
        const out = JSON.stringify(ET.dialogScreen({ cap: Number(body.cap) || 0 }, body.f)); 
        return r.fulfill({ status: JSON.parse(out).ok ? 200 : 400, contentType: 'application/json', body: out });
      }
      return r.abort();
    });
    const __em = require('./helpers/eta_mock'); await __em.installEtaMock(page); __em.autoWait(page);
    await page.addInitScript((o) => {
      try { localStorage.setItem('locDisc', '1'); if (o.on) localStorage.setItem('gdm_scrd_on', '1'); } catch (e) {}
      window.__sn = []; window.__snL = {}; window.__clip = []; try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { window.__clip.push(t); return Promise.resolve(); } }, configurable: true }); } catch (e) {}
      window.__snEmit = (n, d) => { (window.__snL[n] || []).forEach(f => f(d)); };
      if (o.plugin) {
        const put = (m) => (a) => { window.__sn.push({ m, a: JSON.parse(JSON.stringify(a)) }); if (a.json != null) { try { const j = JSON.parse(a.json); if (j.v !== 1 || !Array.isArray(j.body)) throw 0; } catch (e) { return Promise.reject(new Error('invalid: 규격')); } } return Promise.resolve(); };
        const rec = (m) => (a) => { window.__sn.push({ m, a: a === undefined ? null : JSON.parse(JSON.stringify(a)) }); return Promise.resolve(); };
        window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: { ScreenNative: {
          show: put('show'), update: put('update'), setRect: rec('setRect'), hide: rec('hide'), destroy: rec('destroy'), toast: rec('toast'), setField: rec('setField'),
          status: () => Promise.resolve(o.oldApk ? { visible: true, items: 4, age: 20, scroll: 0, cap: 15 } : { visible: true, items: 11, age: 20, scroll: 0, cap: 16 }),
          addListener: (n, f) => { (window.__snL[n] = window.__snL[n] || []).push(f); return Promise.resolve({ remove() {} }); }
        } } };
      }
    }, opt);
    await page.goto('file://' + html); await page.waitForTimeout(2200);
    await page.evaluate(() => { const ov = document.getElementById('locDiscOv'); if (ov) ov.remove(); });
    await page.evaluate(() => {
      switchTab('home', document.getElementById('ni-home'));
      window._fetchWeather = function (la, ln, cb) { cb({ temp: 12, txt: '맑음', rain: 0 }); };
    });
    await page.waitForTimeout(600);
    return x;
  }
  const calls = (x, m) => x.page.evaluate((m) => window.__sn.filter(c => !m || c.m === m), m || null);
  const emit = (x, n, d) => x.page.evaluate(([n, d]) => window.__snEmit(n, d), [n, d || {}]);
  const waitFor = async (x, fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { if (await fn()) return true; await x.page.waitForTimeout(60); } return false; };
  const puts = async (x) => (await calls(x)).filter(c => (c.m === 'show' || c.m === 'update') && c.a.id === 'dlg');
  const hides = async (x) => (await calls(x, 'hide')).filter(c => c.a && c.a.id === 'dlg');
  const lastPut = async (x) => { const p = await puts(x); return JSON.parse(p[p.length - 1].a.json); };
  const webHas = (x, id) => x.page.evaluate((id) => !!document.getElementById(id), id);
  const act = (x, v) => emit(x, 'action', { id: 'dlg', a: 'call', v });
  const lastReq = (x) => x.reqs[x.reqs.length - 1];
  const setLog = (x, lines) => x.page.evaluate((l) => { localStorage.setItem('ovlDiag', JSON.stringify(l)); window._ovlDiagBuf = null; try { _ovlDiagBuf = null; } catch (e) {} }, lines);

  console.log('[① 플러그인이 없거나 꺼져 있거나 옛 APK 면 예전 웹 안내창]');
  await t('플러그인이 없으면(웹): 요청 없음 · 웹 안내창 3종이 그대로 뜬다', async () => {
    const x = await fresh({ plugin: false, on: true });
    await x.page.evaluate(() => { window.__r = []; _showOvlPermDialog(() => window.__r.push('ok'), () => window.__r.push('no')); });
    assert.ok(await webHas(x, 'ovlPermOverlay'), '웹 권한 안내가 없다');
    await x.page.evaluate(() => { document.getElementById('ovlPermOverlay').remove(); _ovlDiagShow(); _pickPop('출발지 설정', '강남역'); });
    assert.ok(await webHas(x, 'ovlDiagOv') && await webHas(x, 'pickPop')); assert.strictEqual(x.reqs.length, 0); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('꺼져 있으면(기본) 호출·요청 없음 · 웹 안내창', async () => {
    const x = await fresh({ plugin: true, on: false });
    await x.page.evaluate(() => { _showOvlPermDialog(() => {}, () => {}); }); await x.page.waitForTimeout(1200);
    assert.ok(await webHas(x, 'ovlPermOverlay')); assert.strictEqual((await calls(x)).filter(c => c.a && c.a.id === 'dlg').length, 0); assert.strictEqual(x.reqs.length, 0);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scrd_on')), null); await x.ctx.close();
  });
  await t('옛 APK(cap 16 미만)면 켜져 있어도 요청 없음 · 웹 안내창', async () => {
    const x = await fresh({ plugin: true, on: true, oldApk: true }); await x.page.waitForTimeout(800);
    await x.page.evaluate(() => { _showOvlPermDialog(() => {}, () => {}); }); await x.page.waitForTimeout(600);
    await x.page.evaluate(() => { var o = document.getElementById('ovlPermOverlay'); if (o) o.remove(); _showOvlPermDialog(() => {}, () => {}); });
    assert.ok(await webHas(x, 'ovlPermOverlay')); assert.strictEqual(x.reqs.length, 0); await x.ctx.close();
  });

  console.log('[② 켜면 웹 대신 엔진 화면을 그대로 그린다]');
  await t('권한 안내: 요청은 사실뿐 · 엔진 화면 그대로 show · 웹 안내창 없음', async () => {
    const x = await fresh({ plugin: true, on: true }); await x.page.waitForTimeout(500);
    await x.page.evaluate(() => { window.__r = []; _showOvlPermDialog(() => window.__r.push('ok'), () => window.__r.push('no')); });
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000), 'show 가 없다');
    const q = x.reqs[x.reqs.length - 1]; assert.strictEqual(q.cap, 16); assert.deepStrictEqual(q.f, { kind: 'perm' });
    const j = await lastPut(x); assert.deepStrictEqual(j, JSON.parse(JSON.stringify(ET.dialogScreen({ cap: 16 }, { kind: 'perm' })))); assert.strictEqual(j.screen, 'dlg');
    assert.ok(!(await webHas(x, 'ovlPermOverlay')), '웹 안내창도 떴다'); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('권한 안내 행동: dl.ok → 설정 열기 콜백 · dl.no / 뒤로가기 → 취소 콜백 · 닫힘', async () => {
    for (const how of ['dl.ok', 'dl.no', 'back']) {
      const x = await fresh({ plugin: true, on: true }); await x.page.waitForTimeout(500);
      await x.page.evaluate(() => { window.__r = []; _showOvlPermDialog(() => window.__r.push('ok'), () => window.__r.push('no')); });
      assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000));
      if (how === 'back') assert.strictEqual(await x.page.evaluate(() => window._ndlg.back()), true); else await act(x, how);
      await x.page.waitForTimeout(200);
      assert.deepStrictEqual(await x.page.evaluate(() => window.__r), [how === 'dl.ok' ? 'ok' : 'no'], how);
      assert.ok((await hides(x)).length >= 1, '닫지 않았다'); assert.strictEqual(await x.page.evaluate(() => window._ndlg.isOpen()), false);
      await act(x, 'dl.ok'); assert.strictEqual((await x.page.evaluate(() => window.__r)).length, 1, '닫힌 뒤 행동이 또 실행됐다'); await x.ctx.close();
    }
  });
  await t('모르는 행동은 무시', async () => {
    const x = await fresh({ plugin: true, on: true }); await x.page.waitForTimeout(500);
    await x.page.evaluate(() => { window.__r = []; _showOvlPermDialog(() => window.__r.push('ok'), () => window.__r.push('no')); });
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000));
    await act(x, 'dl.evil'); await emit(x, 'action', { id: 'dlg', a: 'open', url: 'https://x.test' }); await x.page.waitForTimeout(150);
    assert.deepStrictEqual(await x.page.evaluate(() => window.__r), []); assert.strictEqual(await x.page.evaluate(() => window._ndlg.isOpen()), true); await x.ctx.close();
  });

  console.log('[②-2 앱 종료 확인]');
  await t('플러그인이 없으면 웹 종료 확인창 · 켜면 엔진 화면(웹 확인창 없음) · 아니요/뒤로가기/종료', async () => {
    const w = await fresh({ plugin: false, on: true }); await w.page.evaluate(() => { _showExitPopup(); });
    assert.strictEqual(await w.page.evaluate(() => document.getElementById('exitConfirmPopup').style.display), 'flex'); await w.ctx.close();
    for (const how of ['dl.no', 'back', 'dl.ok']) {
      const x = await fresh({ plugin: true, on: true }); await x.page.waitForTimeout(500);
      await x.page.evaluate(() => { window.__ex = 0; window._exitConfirm = function () { window.__ex++; }; window._backPressCount = 1; _showExitPopup(); });
      assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000), 'show 가 없다');
      assert.deepStrictEqual(x.reqs[x.reqs.length - 1].f, { kind: 'exit' });
      assert.deepStrictEqual(await lastPut(x), JSON.parse(JSON.stringify(ET.dialogScreen({ cap: 16 }, { kind: 'exit' }))));
      assert.notStrictEqual(await x.page.evaluate(() => document.getElementById('exitConfirmPopup').style.display), 'flex');
      if (how === 'back') assert.strictEqual(await x.page.evaluate(() => handleBackPress()), true); else await act(x, how);
      await x.page.waitForTimeout(200);
      assert.strictEqual(await x.page.evaluate(() => window.__ex), how === 'dl.ok' ? 1 : 0, how); assert.ok((await hides(x)).length >= 1, '닫지 않았다');
      if (how !== 'dl.ok') assert.strictEqual(await x.page.evaluate(() => window._backPressCount), 0);
      assert.deepStrictEqual(x.errs, []); await x.ctx.close();
    }
  });

  console.log('[③ 오버레이 진단 기록]');
  await t('기록 줄만 사실로 보낸다 · 엔진 화면 그대로 · 복사 / 지우기 / 닫기', async () => {
    const x = await fresh({ plugin: true, on: true }); await x.page.waitForTimeout(500);
    const L = ['12:00 H bg1 L 첫째', '12:01 V bg1 L 둘째', '12:02 V bg1 L 셋째']; await setLog(x, L);
    await x.page.evaluate(() => { _ovlDiagShow(); });
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000));
    const q = x.reqs[x.reqs.length - 1]; assert.strictEqual(q.f.kind, 'diag'); assert.deepStrictEqual(q.f.lines, L); assert.strictEqual(q.f.cp, 0);
    assert.ok(!/전체 복사|최신이 위/.test(JSON.stringify(q.f)), '요청에 문구가 있다');
    const j = await lastPut(x); assert.deepStrictEqual(j, JSON.parse(JSON.stringify(ET.dialogScreen({ cap: 16 }, q.f)))); assert.ok(!(await webHas(x, 'ovlDiagOv')));
    await act(x, 'dl.copy');
    assert.deepStrictEqual(await x.page.evaluate(() => window.__clip), [L.join('\n')], '복사한 글');
    assert.ok(await waitFor(x, async () => lastReq(x).f.cp === 1, 6000), '복사 결과를 사실로 안 알렸다');
    assert.ok(await waitFor(x, async () => JSON.stringify(await lastPut(x)).includes('복사됨'), 6000));
    assert.ok(await waitFor(x, async () => { const t = JSON.stringify(await lastPut(x)); return t.includes('전체 복사') && !t.includes('복사됨'); }, 6000), '복사 표시가 안 돌아온다');
    await act(x, 'dl.close'); await x.page.waitForTimeout(150); assert.ok((await hides(x)).length >= 1); assert.strictEqual(await x.page.evaluate(() => JSON.parse(localStorage.getItem('ovlDiag')).length), 3, '닫기가 기록을 지웠다');
    await x.ctx.close();
  });
  await t('지우기(dl.clear): 기록을 지우고 닫는다', async () => {
    const x = await fresh({ plugin: true, on: true }); await x.page.waitForTimeout(500); await setLog(x, ['a', 'b']);
    await x.page.evaluate(() => { _ovlDiagShow(); }); assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000));
    await act(x, 'dl.clear'); await x.page.waitForTimeout(200);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('ovlDiag')), null); assert.ok((await hides(x)).length >= 1); assert.strictEqual(await x.page.evaluate(() => window._ndlg.isOpen()), false); await x.ctx.close();
  });

  console.log('[④ 잠깐 뜨는 알림]');
  await t('알림: 글 두 줄과 모양만 보낸다 · 이모지는 엔진이 지운다 · 1.5초 뒤 저절로 닫힌다', async () => {
    const x = await fresh({ plugin: true, on: true }); await x.page.waitForTimeout(500);
    await x.page.evaluate(() => { _pickPop('출발지 설정 ✅', '강남역', 'sh'); });
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000));
    const q = x.reqs[x.reqs.length - 1]; assert.deepStrictEqual(q.f, { kind: 'pop', msg: '출발지 설정 ✅', sub: '강남역', cls: 'sh' });
    const j = await lastPut(x); assert.strictEqual(j.head[0].s, '출발지 설정'); assert.strictEqual(j.info.sh, 1); assert.ok(!(await webHas(x, 'pickPop')));
    assert.strictEqual((await hides(x)).length, 0); assert.ok(await waitFor(x, async () => (await hides(x)).length >= 1, 4000), '저절로 안 닫힌다');
    assert.strictEqual(await x.page.evaluate(() => window._ndlg.isOpen()), false); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });
  await t('알림 위에 알림: 앞의 것은 닫고 새 것을 보여준다', async () => {
    const x = await fresh({ plugin: true, on: true }); await x.page.waitForTimeout(500);
    await x.page.evaluate(() => { _pickPop('하나', ''); });
    assert.ok(await waitFor(x, async () => (await puts(x)).length >= 1, 9000));
    await x.page.evaluate(() => { _pickPop('둘', '보조'); });
    assert.ok(await waitFor(x, async () => (await lastPut(x)).head[0].s === '둘', 9000)); assert.deepStrictEqual(x.errs, []); await x.ctx.close();
  });

  console.log('[⑤ 폴백]');
  await t('엔진이 죽으면 몇 초 안에 예전 웹 안내창이 뜬다(권한 안내가 사라지지 않는다)', async () => {
    const x = await fresh({ plugin: true, on: true, serve: 'down' }); await x.page.waitForTimeout(500);
    await x.page.evaluate(() => { window.__r = []; _showOvlPermDialog(() => window.__r.push('ok'), () => window.__r.push('no')); });
    assert.ok(await waitFor(x, async () => await webHas(x, 'ovlPermOverlay'), 9000), '웹 안내창으로 안 돌아갔다');
    assert.strictEqual(await x.page.evaluate(() => window._ndlg.isOpen()), false); await x.ctx.close();
  });
  await t('설정 카드가 있다', async () => {
    const x = await fresh({ plugin: true, on: true });
    const o = await x.page.evaluate(() => ({ c: !!document.getElementById('scrdSetCard'), on: !!document.getElementById('scrdSetOn'), st: !!document.getElementById('scrdSetStat') }));
    assert.deepStrictEqual(o, { c: true, on: true, st: true });
    await x.page.evaluate(() => window._scrdSetUse(false)); await x.page.waitForTimeout(200);
    assert.strictEqual(await x.page.evaluate(() => localStorage.getItem('gdm_scrd_on')), '0'); await x.ctx.close();
  });

  await b.close();
  console.log(fail ? ('FAIL ' + fail + ' / ' + (pass + fail)) : ('ALL OK ' + pass)); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
