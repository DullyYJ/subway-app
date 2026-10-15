// 캐릭터 시계 위젯 ↔ 앱 연결 시험 — 2026-10-15
//   앱이 하는 일은 둘뿐: ① 출퇴근 설정을 위젯(네이티브 플러그인)에 넘기기 ② 위젯 [출근하기]/[퇴근하기]로 열렸을 때 길찾기 시작.
//   · 설정 전달(시각·요일·장소 좌표), 같은 값이면 다시 안 보냄, 바뀌면 보냄, 장소 없는 쪽은 꺼짐
//   · 위젯 버튼으로 열림(시작 시·열려 있는 중 이벤트) → 홈 탭 + 출발/도착 세팅 + 길찾기 실행, 한 번만
//   · 장소 미설정이면 안내만(길찾기 안 함)  · 위젯 추가 버튼 4종이 requestPin 에 종류를 넘김  · 플러그인 없는 웹에서는 조용함
// 실행: node test/widget_app.ui.test.js [html 경로]
const assert = require('assert'), path = require('path');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 600)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // opt: { alarm(저장된 commuteAlarm), plugin(true/false), launch('morn'|'eve'|null) }
  async function fresh(opt) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul' });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return (u.protocol === 'file:' || u.protocol === 'data:') ? r.continue() : r.abort(); });
    await page.addInitScript(o => {
      try { if (o.alarm) localStorage.setItem('commuteAlarm', JSON.stringify(o.alarm)); } catch (e) {}
      window.__calls = { setConfig: [], pin: [], take: 0 };
      window.__launch = o.launch || null;
      if (o.plugin) {
        window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
        window.Capacitor.Plugins.GdmWidget = {
          setConfig: a => { window.__calls.setConfig.push(JSON.parse(a.json)); return Promise.resolve(); },
          takeLaunch: () => { window.__calls.take++; const g = window.__launch, tb = window.__tab; window.__launch = null; window.__tab = null; return Promise.resolve({ go: g, tab: tb }); },
          requestPin: a => { window.__calls.pin.push(a.type); return Promise.resolve({ ok: true }); },
          state: () => Promise.resolve({ count: 1, scene: '', say: '', fetched: false })
        };
      }
    }, opt);
    await page.goto('file://' + html);
    await page.waitForTimeout(opt.wait || 3200);
    return { ctx, page, errs };
  }
  const ALARM = { on: false, morn: '07:40', eve: '18:20', from: '서울역', to: '강남역', days: [1, 2, 3, 4, 5], fromLat: 37.5547, fromLng: 126.9726, toLat: 37.4979, toLng: 127.0276 };

  await t('시작하면 출퇴근 설정(시각·요일·출발 좌표·켜짐)을 위젯에 한 번 넘긴다', async () => {
    const { ctx, page, errs } = await fresh({ plugin: true, alarm: ALARM });
    const c = await page.evaluate(() => window.__calls.setConfig);
    assert(c.length >= 1, '설정 전달 없음');
    const x = c[c.length - 1];
    assert(x.on === true && x.mOn === true && x.eOn === true, JSON.stringify(x));
    assert(x.morn === '07:40' && x.eve === '18:20' && JSON.stringify(x.days) === '[1,2,3,4,5]', JSON.stringify(x));
    assert(Math.abs(x.mLat - 37.5547) < 0.01 && Math.abs(x.eLat - 37.4979) < 0.05, '좌표: ' + JSON.stringify(x));   // 퇴근 출발 = 출근 도착(강남)
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('같은 값이면 다시 보내지 않고, 시각을 바꾸면 새로 보낸다', async () => {
    const { ctx, page } = await fresh({ plugin: true, alarm: ALARM });
    const n0 = await page.evaluate(() => window.__calls.setConfig.length);
    await page.evaluate(() => { _cmPersist(); });
    await page.waitForTimeout(700);
    assert.strictEqual(await page.evaluate(() => window.__calls.setConfig.length), n0, '같은 값인데 또 보냄');
    await page.evaluate(() => { _cmAlarm.morn = '08:05'; _cmPersist(); });
    await page.waitForTimeout(700);
    const c = await page.evaluate(() => window.__calls.setConfig);
    assert(c.length === n0 + 1 && c[c.length - 1].morn === '08:05', JSON.stringify(c.slice(-2))); await ctx.close();
  });
  await t('돌아다니는 시간 설정: 슬라이더 2~10분·기본 6분(추천 표기), 바꾸면 위젯에 새로 넘기고 다시 열어도 유지, 안내 문구', async () => {
    const { ctx, page, errs } = await fresh({ plugin: true, alarm: ALARM });
    const r = await page.evaluate(() => { const e = document.getElementById('gwRoam'); return { min: e.min, max: e.max, step: e.step, v: e.value, lab: document.getElementById('gwRoamVal').textContent, note: document.getElementById('gwCard').innerText }; });
    assert(r.min === '2' && r.max === '10' && r.step === '1' && r.v === '6', JSON.stringify(r));
    assert(/6분/.test(r.lab) && /추천/.test(r.lab), r.lab);
    assert(/6분 추천/.test(r.note) && /배터리 소모량이 조금 늘 수 있어요/.test(r.note), '추천·배터리 안내 문구 없음');
    assert(/시계 위젯을 눌러 앱에 들어갔다 나오면 깨어나요/.test(r.note), '깨우는 방법 안내 없음');
    let c = await page.evaluate(() => window.__calls.setConfig);
    assert(c[c.length - 1].roam === 6, '처음엔 6분을 넘겨야 한다: ' + JSON.stringify(c[c.length - 1]));
    const n0 = c.length;
    await page.evaluate(() => { const e = document.getElementById('gwRoam'); e.value = '10'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(400);
    c = await page.evaluate(() => window.__calls.setConfig);
    assert(c.length === n0 + 1 && c[c.length - 1].roam === 10, JSON.stringify(c.slice(-2)));
    assert((await page.evaluate(() => document.getElementById('gwRoamVal').textContent)) === '10분');
    await page.evaluate(() => { const e = document.getElementById('gwRoam'); e.value = '2'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(300);
    assert((await page.evaluate(() => window.__calls.setConfig.slice(-1)[0].roam)) === 2);
    await page.reload(); await page.waitForTimeout(3200);
    const after = await page.evaluate(() => ({ v: document.getElementById('gwRoam').value, c: window.__calls.setConfig.slice(-1)[0] }));
    assert(after.v === '2' && after.c.roam === 2, '다시 열어도 유지: ' + JSON.stringify(after));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('돌아다니는 시간에 이상한 값이 저장돼 있으면 6분으로 돌아간다', async () => {
    const { ctx, page } = await fresh({ plugin: true, alarm: ALARM });
    await page.evaluate(() => { localStorage.setItem('gwRoamMin', '99'); _gwRoamUI(); _gwSync(false); });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ v: document.getElementById('gwRoam').value, c: window.__calls.setConfig.slice(-1)[0].roam }));
    assert(r.v === '6' && r.c === 6, JSON.stringify(r)); await ctx.close();
  });
  await t('장소가 없으면 꺼짐(on=false, mOn=false, eOn=false)', async () => {
    const { ctx, page } = await fresh({ plugin: true, alarm: { on: true, morn: '07:30', eve: '18:30' } });
    const x = await page.evaluate(() => window.__calls.setConfig.slice(-1)[0]);
    assert(x && x.on === false && x.mOn === false && x.eOn === false, JSON.stringify(x)); await ctx.close();
  });
  await t('위젯 [출근하기]로 열리면 홈 탭에서 출발/도착을 세팅하고 길찾기를 실행한다(한 번만)', async () => {
    const { ctx, page, errs } = await fresh({ plugin: true, alarm: ALARM, launch: 'morn', wait: 600 });
    await page.evaluate(() => { window.__routed = []; window.fmapDoRoute = function () { window.__routed.push({ s: _fmapStart && _fmapStart.name, d: _fmapDest && _fmapDest.name }); }; });
    await page.waitForTimeout(3000);
    const r = await page.evaluate(() => window.__routed);
    assert(r.length === 1 && /^서울/.test(r[0].s) && /^강남/.test(r[0].d), JSON.stringify(r));
    assert((await page.evaluate(() => window.__calls.take)) >= 1, '시작 때 takeLaunch 를 안 부름');
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('[퇴근하기]는 반대 방향(강남→서울)으로 길찾기, 열려 있는 중 이벤트로도 동작', async () => {
    const { ctx, page } = await fresh({ plugin: true, alarm: ALARM });
    await page.evaluate(() => { window.__routed = []; window.fmapDoRoute = function () { window.__routed.push({ s: _fmapStart && _fmapStart.name, d: _fmapDest && _fmapDest.name }); }; window.__launch = 'eve'; window.dispatchEvent(new Event('gdmWidgetGo')); });
    await page.waitForTimeout(2200);
    const r = await page.evaluate(() => window.__routed);
    assert(r.length === 1 && /^강남/.test(r[0].s) && /^서울/.test(r[0].d), JSON.stringify(r));
    await page.evaluate(() => { window.dispatchEvent(new Event('gdmWidgetGo')); });      // 이미 가져갔으니 다시 열리지 않는다
    await page.waitForTimeout(1500);
    assert.strictEqual((await page.evaluate(() => window.__routed)).length, 1, '두 번 실행됨'); await ctx.close();
  });
  await t('장소 미설정이면 길찾기 대신 안내만 나온다', async () => {
    const { ctx, page } = await fresh({ plugin: true, alarm: { on: true, morn: '07:30', eve: '18:30' }, wait: 600 });
    await page.evaluate(() => { window.__routed = []; window.fmapDoRoute = function () { window.__routed.push(1); }; });
    await page.evaluate(() => { window.__launch = 'morn'; window.dispatchEvent(new Event('gdmWidgetGo')); });
    await page.waitForTimeout(5200);
    assert.strictEqual((await page.evaluate(() => window.__routed)).length, 0);
    const msg = await page.evaluate(() => { const e = document.getElementById('pickPop'); return e ? e.textContent : ''; });
    assert(/장소를 먼저 설정/.test(msg), '안내 없음: ' + msg); await ctx.close();
  });
  await t('위젯 본체를 눌러 열리면(tab=community) 커뮤니티 탭으로 가고, 한 번만 간다', async () => {
    const { ctx, page, errs } = await fresh({ plugin: true, alarm: ALARM });
    await page.evaluate(() => { window.__sw = []; const o = window.switchTab; window.switchTab = function (t, el) { window.__sw.push(t); return o.apply(this, arguments); }; });
    await page.evaluate(() => { window.__tab = 'community'; window.dispatchEvent(new Event('gdmWidgetGo')); });
    await page.waitForTimeout(900);
    assert.deepStrictEqual(await page.evaluate(() => window.__sw), ['community']);
    const shown = await page.evaluate(() => { const e = document.getElementById('tab-community'); const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && e.offsetParent !== null; });
    assert(shown, '커뮤니티 탭이 안 보임');
    await page.evaluate(() => { window.dispatchEvent(new Event('gdmWidgetGo')); });
    await page.waitForTimeout(600);
    assert.strictEqual((await page.evaluate(() => window.__sw)).length, 1, '두 번 이동함');
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('앱이 막 켜지는 중(탭 막대가 아직 없음)에 열려도 준비되면 커뮤니티 탭으로 간다', async () => {
    const { ctx, page } = await fresh({ plugin: true, alarm: ALARM, wait: 300 });
    await page.evaluate(() => { window.__sw = []; const o = window.switchTab; window.switchTab = function (t) { window.__sw.push(t); return o.apply(this, arguments); }; });
    await page.evaluate(() => { const ni = document.getElementById('ni-community'); window.__ni = ni; ni.removeAttribute('id'); window.__tab = 'community'; window.dispatchEvent(new Event('gdmWidgetGo')); setTimeout(function () { window.__ni.id = 'ni-community'; }, 1200); });
    await page.waitForFunction(() => window.__sw.length >= 1, null, { timeout: 15000 });     // 탭 막대가 생기는 대로(재시도 중) 이동한다
    await page.waitForTimeout(1200);
    assert.deepStrictEqual(await page.evaluate(() => window.__sw), ['community']); await ctx.close();
  });
  await t('출퇴근 장소 자동완성 목록: 역 이름이 가로 한 줄로 나오고(세로로 쪼개지지 않고) 긴 노선 안내는 줄임표로 줄어든다', async () => {
    const { ctx, page } = await fresh({ plugin: false, alarm: ALARM });
    const r = await page.evaluate(() => {
      const inp = document.getElementById('cmToStn'); inp.value = '원인재'; _cmSug(inp, 'cmToSug', 1);
      const box = document.getElementById('cmToSug'); document.body.appendChild(box);                       // 설정 탭이 숨겨져 있어도 크기를 잴 수 있게 꺼내 놓는다
      box.style.cssText = 'position:fixed;left:200px;top:20px;width:170px;display:block;z-index:99999;';
      const it = box.querySelector('.cm-sug-item'); if(!it) return { none: true };
      const nm = it.querySelector('.cm-sug-name'), ln = it.querySelector('.cm-sug-line');
      const fs = parseFloat(getComputedStyle(nm).fontSize);
      return { text: nm.textContent, h: nm.getBoundingClientRect().height, w: nm.getBoundingClientRect().width, fs, lineW: ln.getBoundingClientRect().width, itemH: it.getBoundingClientRect().height, itemW: it.getBoundingClientRect().width, nowrap: getComputedStyle(nm).whiteSpace };
    });
    assert(!r.none, '자동완성 항목이 없음');
    assert(r.h < r.fs * 1.9, '역 이름이 여러 줄로 쪼개짐: ' + JSON.stringify(r));
    assert(r.w >= r.fs * r.text.length * 0.8, '역 이름 칸이 너무 좁음: ' + JSON.stringify(r));
    assert(r.itemH < 50, '항목이 너무 높음: ' + JSON.stringify(r)); await ctx.close();
  });
  await t('위젯 추가 버튼 4종이 종류를 넘기고 안내를 띄운다', async () => {
    const { ctx, page } = await fresh({ plugin: true, alarm: ALARM });
    assert.strictEqual(await page.locator('#gwCard button').count(), 4);
    await page.evaluate(() => { document.querySelectorAll('#gwCard button').forEach(b => b.click()); });
    await page.waitForTimeout(300);
    assert.strictEqual(JSON.stringify(await page.evaluate(() => window.__calls.pin)), JSON.stringify(['hb', 'hw', 'vb', 'vw']));
    await ctx.close();
  });
  await t('플러그인이 없는 웹에서는 아무 일도 없고 추가 버튼은 안내만 한다', async () => {
    const { ctx, page, errs } = await fresh({ plugin: false, alarm: ALARM });
    await page.evaluate(() => _gwAdd('hb'));
    await page.waitForTimeout(300);
    const msg = await page.evaluate(() => { const e = document.getElementById('pickPop'); return e ? e.textContent : ''; });
    assert(/앱\(APK\)에서만/.test(msg), msg);
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await b.close();
  console.log(`\n${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
