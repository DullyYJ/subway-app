// 내 위치·도착 예정 공유(카카오톡) 시험 — 2026-10-15
//   · 혼잡도 분석 줄 오른쪽에 '📍 위치 공유' 버튼이 있고 테마(금색 테두리 알약)를 따른다
//   · 글: "출발지 - 현위치 - 도착지 (도착예정시간: 00시00분)\n[남은시간: 00시00분]" — 화면의 값(위치 역·도착 예정·남은 시간)을 그대로 쓴다
//   · 그림: 타임라인을 압축한 PNG(출발·지금 역 앞뒤·도착만, 사이는 ···) — 플러그인(GdmShare.shareImage)에 글과 함께 넘기고 카카오톡 패키지를 지정한다
//   · 경로가 없으면 안내만(플러그인 안 부름) · 플러그인이 없으면 글만 공유/복사
// 실행: node test/share_loc.ui.test.js [html 경로]
const assert = require('assert'), path = require('path'), fs = require('fs');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
const OUT = process.env.SHARE_PNG_DIR || null;
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 600)); } };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  async function fresh(opt) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', deviceScaleFactor: 2 });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = new URL(r.request().url()); return (u.protocol === 'file:' || u.protocol === 'data:') ? r.continue() : r.abort(); });
    await page.addInitScript(o => {
      if (o.theme) { try { localStorage.setItem('theme', o.theme); } catch (e) {} }
      window.__share = [];
      if (o.plugin) { window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {}; window.Capacitor.Plugins.GdmShare = { shareImage: a => { window.__share.push(a); return o.reject ? Promise.reject(new Error('x')) : Promise.resolve({ ok: true, direct: true }); } }; }
    }, opt || {});
    await page.goto('file://' + html); await page.waitForTimeout(2500);
    return { ctx, page, errs };
  }
  // 인천1호선 일부: 원인재→신연수로 가는 중(18:36 도착한 원인재 위, 신연수 18:37)
  const SETUP = (o) => {
    const names = ['계양', '귤현', '박촌', '임학', '계산', '경인교대입구', '작전', '갈산', '부평구청', '부평시장', '부평', '동수', '부평삼거리', '간석오거리', '인천시청', '예술회관', '인천터미널', '문학경기장', '선학', '신연수', '원인재', '동춘', '동막', '캠퍼스타운', '테크노파크', '지식정보단지', '인천대입구', '센트럴파크', '국제업무지구', '송도달빛축제공원'];
    const nodes = [{ name: '출발', isOrigin: true, isWalk: false, isSub: false, arrTime: '18:20' }];
    names.forEach((n, i) => { const m = 18 * 60 + 22 + i * 2; nodes.push({ name: n, isSub: true, isWalk: false, isOrigin: false, lineName: '인천1호선', arrTime: ('0' + Math.floor(m / 60)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2) }); });
    _transitNodeData = nodes; window._routeLocked = true; window._metroRouteMode = false; _baseTimeMs = null;
    window._gpsMaxIdx = o.here; window._htlBoarded = true;
    window._transitResultStartX = null;
    _transitResultStart = { name: o.from }; _transitResultDest = { name: o.to };
    window._journeyEta = function () { return { arrMs: new Date('2026-10-15T18:51:00+09:00').getTime(), rem: o.rem, src: 't' }; };
    window._estimateTimelinePos = function () { return o.pos || { fromIdx: o.here, toIdx: o.here, ratio: 0 }; };
  };

  await t('혼잡도 분석 줄 오른쪽에 위치 공유 버튼이 있다(금색 테두리 알약, 줄 안에 들어간다)', async () => {
    const { ctx, page, errs } = await fresh({ plugin: true });
    const r = await page.evaluate(() => { const e = document.getElementById('shareLocBtn'), s = e.parentElement, a = e.getBoundingClientRect(), p = s.getBoundingClientRect(); return { txt: e.textContent, right: Math.round(p.right - a.right), inside: a.left >= p.left && a.right <= p.right + 1, h: Math.round(a.height), border: getComputedStyle(e).borderColor, col: getComputedStyle(e).color, gold: getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() }; });
    assert(/위치 공유/.test(r.txt) && r.inside && r.right <= 4 && r.h < 30, JSON.stringify(r));
    assert(r.border === r.col, '테두리와 글자 색이 같은 테마 색: ' + JSON.stringify(r));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('글: 출발지 - 현위치 - 도착지 (도착예정시간: 00시00분) + [남은시간: 00시00분]', async () => {
    const { ctx, page } = await fresh({ plugin: true });
    await page.evaluate(SETUP, { here: 20, from: '계양', to: '송도달빛축제공원', rem: 29 });
    const d = await page.evaluate(() => { const x = _shLoc(); return { ok: x.ok, cur: x.cur, text: x.ok ? _shText(x) : '', n: x.ok ? x.stations.length : 0, hit: x.hit }; });
    assert(d.ok && d.cur === '신연수', JSON.stringify(d));
    assert.strictEqual(d.text, '계양 - 신연수 - 송도달빛축제공원 (도착예정시간: 18시51분)\n[남은시간: 00시29분]');
    await page.evaluate(() => { window._journeyEta = function () { return { arrMs: new Date('2026-10-15T20:05:00+09:00').getTime(), rem: 75, src: 't' }; }; });
    assert(/도착예정시간: 20시05분\)\n\[남은시간: 01시15분\]$/.test(await page.evaluate(() => _shText(_shLoc()))));
    await ctx.close();
  });
  await t('두 역 사이를 가는 중이면 "A→B 이동 중"', async () => {
    const { ctx, page } = await fresh({ plugin: true });
    await page.evaluate(SETUP, { here: 19, from: '계양', to: '송도달빛축제공원', rem: 29, pos: { fromIdx: 19, toIdx: 20, ratio: 0.5 } });
    assert.strictEqual(await page.evaluate(() => _shLoc().cur), '선학→신연수 이동 중');
    await ctx.close();
  });
  await t('버튼을 누르면 플러그인에 그림(PNG)·글·카카오톡 패키지를 넘긴다', async () => {
    const { ctx, page, errs } = await fresh({ plugin: true });
    await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
    await page.evaluate(SETUP, { here: 20, from: '계양', to: '송도달빛축제공원', rem: 29 });
    await page.evaluate(() => document.getElementById('shareLocBtn').click()); await page.waitForTimeout(300);
    const c = await page.evaluate(() => window.__share);
    assert(c.length === 1, '호출 수 ' + c.length);
    assert(c[0].pkg === 'com.kakao.talk' && /^계양 - 신연수 - 송도달빛축제공원 \(도착예정시간: 18시51분\)\n\[남은시간: 00시29분\]$/.test(c[0].text), JSON.stringify({ pkg: c[0].pkg, text: c[0].text }));
    assert(/^data:image\/png;base64,/.test(c[0].png) && c[0].png.length > 8000, 'png 길이 ' + c[0].png.length);
    const buf = Buffer.from(c[0].png.split(',')[1], 'base64');
    assert(buf.slice(1, 4).toString() === 'PNG' && buf.readUInt32BE(16) === 720 && buf.readUInt32BE(20) === 428, '크기 ' + buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20));
    if (OUT) fs.writeFileSync(path.join(OUT, 'share_dark.png'), buf);
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('파스텔 테마·역이 적은 경로에서도 그림이 만들어진다(역 3개·도착 직전)', async () => {
    const { ctx, page, errs } = await fresh({ plugin: true, theme: 'pastel' });
    await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'pastel'); });
    await page.evaluate(SETUP, { here: 20, from: '계양', to: '송도달빛축제공원', rem: 29 });
    await page.evaluate(() => { _transitNodeData = _transitNodeData.slice(0, 4); window._gpsMaxIdx = 3; });
    const r = await page.evaluate(() => { const d = _shLoc(); return d.ok ? { n: d.stations.length, hit: d.hit, len: _shPng(d).length } : { ok: false }; });
    assert(r.n === 3 && r.hit === 2 && r.len > 5000, JSON.stringify(r));
    await page.evaluate(SETUP, { here: 20, from: '계양', to: '송도달빛축제공원', rem: 12 });
    const png = await page.evaluate(() => _shPng(_shLoc()));
    if (OUT) fs.writeFileSync(path.join(OUT, 'share_pastel.png'), Buffer.from(png.split(',')[1], 'base64'));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await t('경로가 없으면 안내만 뜨고 플러그인은 부르지 않는다', async () => {
    const { ctx, page } = await fresh({ plugin: true });
    await page.evaluate(() => document.getElementById('shareLocBtn').click()); await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => window.__share.length), 0);
    assert(/경로를 먼저 탐색/.test(await page.evaluate(() => (document.getElementById('pickPop') || {}).textContent || '')), '안내 팝업 없음');
    await ctx.close();
  });
  for (const th of ['dark', 'pastel', 'light']) {
    await t('안내 팝업이 테마(' + th + ')에 맞고, 제목은 한 줄·아래 글은 두 줄(낱자 "요" 안 남김)', async () => {
      const { ctx, page, errs } = await fresh({ plugin: true, theme: th });
      await page.evaluate(t2 => { document.documentElement.setAttribute('data-theme', t2); }, th);
      await page.evaluate(() => document.getElementById('shareLocBtn').click()); await page.waitForTimeout(500);
      const r = await page.evaluate(() => {
        const p = document.getElementById('pickPop'); if (!p) return null;
        const cs = getComputedStyle(p), card = getComputedStyle(document.documentElement).getPropertyValue('--card').trim();
        const m = p.querySelector('.pp-m'), s = p.querySelector('.pp-s');
        const lh = e => parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.3;
        const probe = document.createElement('div'); probe.style.background = card; document.body.appendChild(probe);
        const want = getComputedStyle(probe).backgroundColor; probe.remove();
        return { cls: p.className, bg: cs.backgroundColor, want, mLines: Math.round(m.getBoundingClientRect().height / lh(m)), sLines: Math.round(s.getBoundingClientRect().height / lh(s)), brs: s.querySelectorAll('br').length, sTxt: s.innerText, mTxt: m.innerText };
      });
      assert(r, '팝업 없음');
      assert(/\bsh\b/.test(r.cls), '테마 클래스 없음 ' + r.cls);
      assert(r.bg === r.want, '배경이 테마 카드색이 아님 ' + r.bg + ' vs ' + r.want);
      assert(r.mLines === 1, '제목이 한 줄이 아님 ' + r.mLines);
      assert(r.sLines === 2 && r.brs === 1, '아래 글이 두 줄이 아님 ' + JSON.stringify(r));
      assert(/^경로를 먼저 탐색해 주세요$/.test(r.mTxt.trim()), r.mTxt);
      assert(!/^\s*요/m.test(r.sTxt), '낱자 요가 줄 머리에 남음 ' + r.sTxt);
      if (OUT) await page.screenshot({ path: path.join(OUT, 'popup_' + th + '.png') });
      assert(!errs.length, errs.join('|')); await ctx.close();
    });
  }
  await t('플러그인이 거절하면(카카오톡·공유창을 못 열면) 글만 공유/복사로 이어진다', async () => {
    const { ctx, page, errs } = await fresh({ plugin: true, reject: true });
    await page.evaluate(SETUP, { here: 20, from: '계양', to: '송도달빛축제공원', rem: 29 });
    await page.evaluate(() => { window.__copied = []; Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); Object.defineProperty(navigator, 'clipboard', { value: { writeText: x => { window.__copied.push(x); return Promise.resolve(); } }, configurable: true }); });
    await page.evaluate(() => document.getElementById('shareLocBtn').click()); await page.waitForTimeout(500);
    const cp = await page.evaluate(() => window.__copied);
    assert(cp.length === 1 && /^계양 - 신연수/.test(cp[0]), JSON.stringify(cp));
    assert(!errs.length, errs.join('|')); await ctx.close();
  });
  await b.close();
  console.log(`\nshare_loc: ${pass} pass ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
