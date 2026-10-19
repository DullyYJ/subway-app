// 설정·저장값을 앱 본체에도 보관하기(설정 스위치 gdm_sto) ↔ 앱(JS) 연결 시험 — 2026-10-19 (5번 4단계)
//   진짜 index.html 을 가짜 Store 플러그인(자바 StoreCore 와 같은 구조 검사·보관은 Node 쪽 메모리에) + 진짜 엔진 모듈(engine/store-sync.js)에 연결해 확인한다:
//   · 꺼져 있으면(기본) 예전 그대로 — 엔진에 묻지 않고 앱 본체에 쓰지도 않는다
//   · 켜면: 엔진 정책에 든 키만 보관 · 값은 서버로 안 간다(키·길이·지문만) · 이후 쓰기·지우기가 앱 본체에 따라간다 · 세션 저장소·정책 밖 키는 안 간다
//   · 웹 저장소가 지워졌으면(앱 본체에만 있음): 엔진이 정한 키를 되돌리고 한 번만 다시 연다(되풀이 없음) · 스위치가 웹에서 지워졌어도 앱 본체에 켠 기록이 있으면 켠 것으로 본다
//   · 폴백: 플러그인 없음 / 보관 실패 / 옛 엔진(404) → 예전 방식(웹 저장소만) · 옛 엔진이어도 되돌리기는 된다
//   · 엔진이 정책 밖 키를 주어도 웹은 쓰지 않는다 · 웹 지문 = 엔진 지문 · 웹의 처음 정책 = 엔진 정책
// 실행: node test/store_sto.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const SS = require('../engine/store-sync');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 900)); } };
const S = SS.STORE_SENTINEL;

// ── 가짜 바깥 세상(Node 쪽): 앱 본체 저장소 · 엔진 ──
let NAT, CALLS, ENG;      // NAT: {키:글자}(앱 본체 보관) · CALLS: 플러그인 호출 기록 · ENG: { mode:'ok'|'404'|'evil', hits:[요청 본문] }
function reset(nat) { NAT = Object.assign({}, nat || {}); CALLS = { snapshot: 0, apply: [], loads: 0 }; ENG = { mode: 'ok', hits: [], pol: 0, failApply: false, evil: null }; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 9000)) { if (await fn()) return true; await sleep(60); } return false; }

async function newApp(b, opt) {
  opt = Object.assign({ plugin: true, ls: {} }, opt || {});
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5547, longitude: 126.9726 }, permissions: ['geolocation'] });
  await ctx.exposeFunction('__stNode', (op, arg) => {
    if (op === 'loaded') { CALLS.loads++; return null; }
    if (op === 'snapshot') { CALLS.snapshot++; return { ok: true, n: Object.keys(NAT).length, json: JSON.stringify(NAT) }; }
    if (op === 'apply') {
      CALLS.apply.push(arg);
      if (ENG.failApply) return { ok: false, why: 'apply' };
      const j = JSON.parse(arg.json || '{}'); (j.del || []).forEach(k => delete NAT[k]); Object.keys(j.set || {}).forEach(k => { NAT[k] = j.set[k]; });
      return { ok: true, set: Object.keys(j.set || {}).length, del: (j.del || []).length, rejected: 0, n: Object.keys(NAT).length };
    }
    return null;
  });
  await ctx.addInitScript((o) => {
    // 새 탭(저장소 비어 있음)에서만 처음 값을 넣는다 — 다시 열었을 때(reload)는 앱이 되돌린 값을 그대로 둔다
    try { if (window.top === window && location.protocol === 'file:' && !sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); Object.keys(o.ls).forEach(k => localStorage.setItem(k, o.ls[k])); localStorage.setItem('gdm_loc_disclosed', '1'); localStorage.setItem('bgPermGuided', '1'); } } catch (e) {}
    try { if (window.top === window && location.protocol === 'file:') window.__stNode('loaded'); } catch (e) {}   // 안쪽 틀(iframe)은 세지 않는다
    const plugins = {};
    if (o.plugin) plugins.Store = {
      snapshot: () => window.__stNode('snapshot'), apply: (a) => window.__stNode('apply', a),
      get: () => Promise.resolve({ ok: true, has: false }), clear: () => Promise.resolve({ ok: true }), status: () => Promise.resolve({ ok: true })
    };
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android', Plugins: plugins };
  }, opt);
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => {
    const u = new URL(r.request().url()); if (u.protocol === 'file:' || u.protocol === 'data:') return r.continue();
    const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
    if (/route-v2/.test(u.host) && u.pathname === '/store-merge') {
      const body = r.request().postData() || '';
      ENG.hits.push(body);
      if (ENG.mode === '404') return r.fulfill({ status: 404, headers: H, body: '{"error":"not found"}' });
      if (ENG.mode === 'hang') return; // 응답 없음(시간초과 확인용)
      const j = JSON.parse(body);
      const res = SS.storeMerge(j); res.ok = true;
      if (ENG.mode === 'evil') { res.toWeb = res.toWeb.concat(['shopDataCache', 'gdm_scr_c', 'evil key']); res.toNat = res.toNat.concat(['shopDataCache']); res.delNat = res.delNat.concat(['gdm_err_log']); }
      return r.fulfill({ status: 200, headers: H, body: JSON.stringify(res) });
    }
    if (/route-v2/.test(u.host) && u.pathname === '/store-policy') { ENG.pol++; return r.fulfill({ status: 200, headers: H, body: JSON.stringify(Object.assign({ ok: true }, SS.storePolicy())) }); }
    return r.fulfill({ status: 200, headers: H, body: '{}' });
  });
  await page.goto('file://' + html);
  return { ctx, page, errs };
}
const ls = (page, k) => page.evaluate(k => localStorage.getItem(k), k);

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });

  await t('웹의 처음 정책(_STO_POL0)이 엔진 storePolicy() 와 같고, 웹 지문이 엔진 지문과 같다', async () => {
    reset(); const { ctx, page } = await newApp(b);
    const w = await page.evaluate(() => ({ pol: window._STO_POL0 || (typeof _STO_POL0 !== 'undefined' ? _STO_POL0 : null), h: ['', 'a', 'foobar', '한글🚇', '{"a":[1,2,{"b":null}]}', 'x'.repeat(5000)].map(s => _stoHash(s)) }));
    assert.deepStrictEqual(w.pol, SS.storePolicy());
    assert.deepStrictEqual(w.h, ['', 'a', 'foobar', '한글🚇', '{"a":[1,2,{"b":null}]}', 'x'.repeat(5000)].map(s => SS.storeHash(s)));
    await ctx.close();
  });

  await t('꺼짐(기본): 엔진에 묻지 않고 앱 본체에 쓰지도 않는다 · 설정 카드는 보이고 꺼짐 문구', async () => {
    reset(); const { ctx, page, errs } = await newApp(b, { ls: { app_theme: 'dark', gdm_rtf: '1' } });
    await until(() => CALLS.snapshot >= 1); await sleep(800);
    await page.evaluate(() => { localStorage.setItem('mk_favorites', '[1]'); localStorage.removeItem('app_theme'); });
    await sleep(1000);
    assert.strictEqual(CALLS.apply.length, 0, '앱 본체에 쓰지 않는다'); assert.strictEqual(ENG.hits.length, 0, '엔진에 묻지 않는다');
    assert.deepStrictEqual(NAT, {});
    assert.strictEqual(await ls(page, 'mk_favorites'), '[1]', '웹 저장소는 그대로 동작');
    assert.strictEqual(errs.length, 0, errs.join('|'));
    await ctx.close();
  });

  await t('켜면 처음 한 번 맞춘다: 정책 안의 키만 앱 본체로(캐시·로그·정책 밖은 아님) · 표시가 양쪽에 생김 · 값은 서버로 안 간다', async () => {
    reset();
    const { ctx, page, errs } = await newApp(b, { ls: { gdm_sto: '1', gdm_rtf: '1', app_theme: 'dark', mk_favorites: '[{"name":"비밀집"}]', commuteAlarm: '{"on":1}', shopDataCache: 'BIG'.repeat(100), gdm_err_log: '[1]', gdm_scr_c: 'cache', gdm_scrs_why: '사유', busLmCache3: 'x', 'srv:k': 'v' } });
    assert.ok(await until(() => ENG.hits.length >= 1 && CALLS.apply.length >= 1), '맞추기 요청 + 보관');
    await sleep(300);
    ['app_theme', 'commuteAlarm', 'gdm_rtf', 'gdm_sto', S, 'mk_favorites'].forEach(k => assert.ok(k in NAT, k + ' 가 앱 본체에 있다: ' + Object.keys(NAT)));
    assert.ok(!Object.keys(NAT).some(k => !SS.storeEligible(k)), '정책 밖 키가 섞이지 않았다: ' + Object.keys(NAT));
    assert.strictEqual(NAT.mk_favorites, '[{"name":"비밀집"}]'); assert.strictEqual(NAT[S], '1');
    assert.strictEqual(await ls(page, S), '1', '웹에도 표시');
    const body = ENG.hits[0]; assert.ok(!/비밀집|dark|commuteAlarm"?:\s*"\{/.test(body.replace(/"commuteAlarm"/, '')), '값이 서버로 가지 않는다: ' + body.slice(0, 200));
    const j = JSON.parse(body); assert.ok(j.web.mk_favorites && typeof j.web.mk_favorites.h === 'string' && j.web.mk_favorites.n > 0, '키·길이·지문만');
    assert.ok(!('shopDataCache' in j.web) && !('gdm_err_log' in j.web) && !('gdm_scr_c' in j.web) && !('gdm_scrs_why' in j.web), '정책 밖 키는 보내지도 않는다');
    assert.strictEqual(errs.length, 0, errs.join('|'));
    assert.strictEqual(CALLS.loads, 1, '다시 열지 않는다');
    await ctx.close();
  });

  await t('맞춘 뒤의 쓰기·지우기가 앱 본체에 따라간다(0.5초 모아서) · 세션 저장소·정책 밖 키는 안 간다', async () => {
    reset(); const { ctx, page } = await newApp(b, { ls: { gdm_sto: '1', app_theme: 'dark' } });
    assert.ok(await until(() => CALLS.apply.length >= 1 && NAT[S] === '1'));
    const n0 = CALLS.apply.length;
    await page.evaluate(() => { localStorage.setItem('mk_favorites', '[2]'); localStorage.setItem('notifPref', '{"arrive":0}'); localStorage.setItem('shopDataCache', 'zzz'); sessionStorage.setItem('mk_radius', '9'); localStorage.setItem('gdm_scr_c', 'c'); });
    assert.ok(await until(() => NAT.mk_favorites === '[2]' && NAT.notifPref === '{"arrive":0}'), '쓰기가 따라간다');
    assert.ok(!('shopDataCache' in NAT) && !('mk_radius' in NAT) && !('gdm_scr_c' in NAT), '정책 밖·세션 저장소는 안 간다');
    assert.strictEqual(CALLS.apply.length, n0 + 1, '한 번에 모아서(0.5초) 보낸다');
    await page.evaluate(() => { localStorage.removeItem('mk_favorites'); localStorage.setItem('app_theme', 'pastel'); });
    assert.ok(await until(() => !('mk_favorites' in NAT) && NAT.app_theme === 'pastel'), '지우기·바꾸기도 따라간다');
    await page.evaluate(() => { localStorage.setItem('pfLive', '1'); localStorage.removeItem('pfLive'); localStorage.setItem('pfLive', '0'); });
    assert.ok(await until(() => NAT.pfLive === '0'), '연달아 써도 마지막 값');
    await ctx.close();
  });

  await t('웹 저장소가 지워졌다: 앱 본체에 있는 키를 엔진이 정한 대로 되돌리고 한 번만 다시 연다 · 진단 표시(_why/_fail)는 되살리지 않는다', async () => {
    reset({ gdm_sto: '1', [S]: '1', gdm_rtf: '1', gdm_sbh: '1', app_theme: 'pastel', mk_favorites: '[{"a":1}]', gdm_rtf_why: '옛 사유', gdm_nm_fail: '1' });
    const { ctx, page, errs } = await newApp(b, { ls: {} });
    assert.ok(await until(() => CALLS.loads >= 2), '되돌린 뒤 다시 연다(' + CALLS.loads + ')');
    assert.ok(await until(async () => (await ls(page, 'gdm_rtf')) === '1'), '다시 연 뒤 값이 있다');
    assert.strictEqual(await ls(page, 'app_theme'), 'pastel'); assert.strictEqual(await ls(page, 'mk_favorites'), '[{"a":1}]'); assert.strictEqual(await ls(page, 'gdm_sbh'), '1');
    assert.strictEqual(await ls(page, 'gdm_sto'), '1', '켠 기록도 돌아왔다'); assert.strictEqual(await ls(page, S), '1');
    assert.strictEqual(await ls(page, 'gdm_rtf_why'), null, '옛 사유는 안 돌아온다'); assert.strictEqual(await ls(page, 'gdm_nm_fail'), null);
    await sleep(2800);   // 다시 연 뒤 부팅 맞추기까지 기다려도 더 열리지 않는다
    assert.strictEqual(CALLS.loads, 2, '한 번만 다시 연다');
    const st = await page.evaluate(() => ({ on: _stoOn(), last: window._stoState.last }));
    assert.strictEqual(st.on, true);
    assert.strictEqual(errs.length, 0, errs.join('|'));
    await ctx.close();
  });

  await t('웹에서 gdm_sto 도 지워졌지만 앱 본체에 켠 기록이 있으면 켠 것으로 보고 되돌린다 · 앱 본체에 끈 기록(0)이면 되돌리지 않는다', async () => {
    reset({ gdm_sto: '1', [S]: '1', app_theme: 'dark' });
    let a = await newApp(b, { ls: {} });
    assert.ok(await until(() => CALLS.loads >= 2)); assert.ok(await until(async () => (await ls(a.page, 'app_theme')) === 'dark'));
    await a.ctx.close();
    reset({ gdm_sto: '0', [S]: '1', app_theme: 'dark' });
    a = await newApp(b, { ls: {} });
    await until(() => CALLS.snapshot >= 1); await sleep(2500);
    assert.strictEqual(CALLS.loads, 1, '끈 기록이면 되돌리지 않는다'); assert.strictEqual(await ls(a.page, 'app_theme'), null); assert.strictEqual(ENG.hits.length, 0);
    await a.ctx.close();
  });

  await t('웹이 살아 있으면 웹이 기준: 웹에서 일부러 지운 키는 앱 본체에서도 지우고, 다른 값은 웹 값으로 덮는다(되돌리지 않음)', async () => {
    reset({ gdm_sto: '1', [S]: '1', app_theme: 'dark', mk_favorites: '[9]', gdm_cnd: '1' });
    const { ctx, page } = await newApp(b, { ls: { gdm_sto: '1', [S]: '1', app_theme: 'pastel', gdm_cnd: '1' } });
    assert.ok(await until(() => ENG.hits.length >= 1 && NAT.app_theme === 'pastel' && !('mk_favorites' in NAT)), JSON.stringify(NAT));
    assert.strictEqual(CALLS.loads, 1, '되돌린 게 없으니 다시 열지 않는다'); assert.strictEqual(await ls(page, 'mk_favorites'), null);
    await ctx.close();
  });

  await t('옛 엔진(404): 보관·맞추기는 못 하지만 되돌리기는 된다 · 처음 올리기는 하지 않는다(아무것도 안 함) · 카드에 사유', async () => {
    reset({ gdm_sto: '1', [S]: '1', app_theme: 'dark' });
    ENG.mode = '404';
    let a = await newApp(b, { ls: {} }); ENG.mode = '404';
    assert.ok(await until(() => CALLS.loads >= 2), '404 여도 되돌려 다시 연다');
    assert.ok(await until(async () => (await ls(a.page, 'app_theme')) === 'dark'));
    await a.ctx.close();
    reset({}); ENG.mode = '404';
    a = await newApp(b, { ls: { gdm_sto: '1', app_theme: 'dark' } });
    assert.ok(await until(() => ENG.hits.length >= 1)); await sleep(800);
    assert.strictEqual(CALLS.apply.length, 0, '맞추기 없이는 올리지 않는다'); assert.deepStrictEqual(NAT, {});
    assert.strictEqual(await ls(a.page, 'app_theme'), 'dark');
    const txt = await a.page.evaluate(() => { _stoSyncCard(); return document.getElementById('stoSetStat').textContent; });
    assert.ok(/되돌리기만/.test(txt), txt);
    await a.ctx.close();
  });

  await t('엔진이 응답하지 않아도(시간초과) 앱은 멈추지 않는다 · 예전 방식으로 계속', async () => {
    reset({}); const { ctx, page, errs } = await newApp(b, { ls: { gdm_sto: '1', app_theme: 'dark' } }); ENG.mode = 'hang';
    await until(() => ENG.hits.length >= 1, 5000);
    await page.evaluate(() => localStorage.setItem('mk_favorites', '[3]'));
    assert.strictEqual(await ls(page, 'mk_favorites'), '[3]');
    assert.strictEqual(errs.length, 0, errs.join('|'));
    await ctx.close();
  });

  await t('엔진이 정책 밖·이상한 키를 주어도 웹은 쓰지 않고, 앱 본체에도 안 올린다', async () => {
    reset({ gdm_sto: '1', [S]: '1', app_theme: 'dark', shopDataCache: 'X' }); const a = await newApp(b, { ls: {} }); ENG.mode = 'evil';
    assert.ok(await until(() => CALLS.loads >= 2 || ENG.hits.length >= 1));
    await sleep(1500);
    assert.strictEqual(await ls(a.page, 'shopDataCache'), null, '정책 밖 키는 웹에 안 쓴다'); assert.strictEqual(await ls(a.page, 'gdm_scr_c'), null); assert.strictEqual(await ls(a.page, 'evil key'), null);
    assert.ok(!CALLS.apply.some(x => /shopDataCache|evil key|gdm_scr_c|gdm_err_log/.test(x.json)), '앱 본체에 정책 밖 키를 올리지도 지우라고 하지도 않는다');
    await a.ctx.close();
  });

  await t('보관 실패(apply 가 ok:false): 앱은 예전 방식으로 계속 · 카드에 사유 · 껐다 켜면 다시 시도', async () => {
    reset({}); ENG.failApply = true;
    const { ctx, page, errs } = await newApp(b, { ls: { gdm_sto: '1', app_theme: 'dark' } }); ENG.failApply = true;
    assert.ok(await until(() => page.evaluate(() => _stoBad())), '실패로 본다');
    const txt = await page.evaluate(() => { _stoSyncCard(); return document.getElementById('stoSetStat').textContent + '|' + document.getElementById('stoSetOn').checked; });
    assert.ok(/문제가 있어/.test(txt) && /false$/.test(txt), txt);
    await page.evaluate(() => localStorage.setItem('mk_favorites', '[7]')); assert.strictEqual(await ls(page, 'mk_favorites'), '[7]');
    ENG.failApply = false; const n0 = CALLS.apply.length;
    await page.evaluate(() => { _stoSetUse(false); _stoSetUse(true); });
    assert.ok(await until(() => NAT.app_theme === 'dark' && NAT.mk_favorites === '[7]'), '다시 시도해 올라간다: ' + JSON.stringify(NAT));
    assert.ok(!(await page.evaluate(() => _stoBad())), '실패가 풀렸다'); assert.ok(CALLS.apply.length > n0);
    assert.strictEqual(errs.length, 0, errs.join('|'));
    await ctx.close();
  });

  await t('플러그인이 없으면(웹 브라우저) 카드는 숨고 아무 일도 없다 · 웹 저장소는 그대로', async () => {
    reset({}); const { ctx, page, errs } = await newApp(b, { plugin: false, ls: { gdm_sto: '1' } });
    await sleep(2500);
    await page.evaluate(() => localStorage.setItem('mk_favorites', '[5]'));
    assert.strictEqual(await ls(page, 'mk_favorites'), '[5]');
    const d = await page.evaluate(() => { _stoSyncCard(); var c = document.getElementById('stoSetCard'); return c ? c.style.display : 'none'; });
    assert.ok(d === 'none', 'display=' + d);
    assert.strictEqual(CALLS.snapshot, 0); assert.strictEqual(ENG.hits.length, 0); assert.strictEqual(errs.length, 0, errs.join('|'));
    await ctx.close();
  });

  await t('설정 카드: 켜면 맞추고 켜짐 문구(보관 개수) · 설정 화면 사실(f.feat.sto)에 실린다 · 끄면 앱 본체에도 꺼짐이 남는다', async () => {
    reset({}); const { ctx, page, errs } = await newApp(b, { ls: { app_theme: 'dark', mk_favorites: '[1]' } });
    await until(() => CALLS.snapshot >= 1); await sleep(500);
    await page.evaluate(() => _stoSyncCard());
    assert.strictEqual(await page.evaluate(() => document.getElementById('stoSetCard').style.display), 'block');
    assert.ok(/꺼짐/.test(await page.evaluate(() => document.getElementById('stoSetStat').textContent)));
    await page.evaluate(() => _stoSetUse(true));
    assert.ok(await until(() => NAT[S] === '1' && NAT.app_theme === 'dark' && NAT.gdm_sto === '1'), JSON.stringify(NAT));
    const txt = await page.evaluate(() => { _stoSyncCard(); return document.getElementById('stoSetStat').textContent + '|' + document.getElementById('stoSetOn').checked; });
    assert.ok(/켜짐/.test(txt) && /개 보관 중/.test(txt) && /true$/.test(txt), txt);
    const f = await page.evaluate(() => (window._scrSet && _scrSet.facts) ? _scrSet.facts().feat.sto : 'nofacts');
    assert.deepStrictEqual(f, { h: 1, on: 1, f: 0, w: '' });
    await page.evaluate(() => _stoSetUse(false));
    assert.ok(await until(() => NAT.gdm_sto === '0'), '끈 기록이 앱 본체에도 남는다');
    const n = CALLS.apply.length; await page.evaluate(() => localStorage.setItem('mk_favorites', '[8]')); await sleep(900);
    assert.strictEqual(CALLS.apply.length, n, '꺼진 뒤에는 따라가지 않는다');
    assert.strictEqual(errs.length, 0, errs.join('|'));
    await ctx.close();
  });

  await b.close();
  console.log(`store_sto.ui: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
