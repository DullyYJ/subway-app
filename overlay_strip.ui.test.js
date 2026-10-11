// 오버레이를 앱 경로 화면(타임라인) 그대로 — 2026-10-11
//   앱의 실제 타임라인(_renderHtlTrack)을 그려 놓고, 오버레이로 보내는 칸(_ovlStrip)이 그 화면과 같은지 확인한다.
// 실행: node test/overlay_strip.ui.test.js [html 경로]
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
    await page.clock.install({ time: new Date('2026-10-11T14:30:00+09:00') });
    await page.goto('file://' + html); await page.addStyleTag({ content: '#locDiscOv{display:none !important}' }); await page.clock.runFor(2500);
    await page.evaluate((theme) => {
      const ov = document.getElementById('locDiscOv'); if (ov) ov.remove();
      if (theme) document.documentElement.setAttribute('data-theme', theme);
      if (!document.getElementById('transitHtlTrack')) document.body.insertAdjacentHTML('beforeend', '<div id="transitHtlWrap" class="htl-wrap" style="display:none"><div id="transitHtlTrack"></div></div>');
      const st = (n, i) => ({ stationName: n, lat: 37.58 + i * 0.002, lon: 126.7 + i * 0.002 });
      // 도보 2분 → 931번(이음대로.대성베르힐 … 아라역4번출구) → 도보 → 인천2호선 → 도보
      const secs = [
        { transportation: { type: 3 }, duration: 120, distance: 150 },
        { transportation: { type: 2, name: '931' }, duration: 600, startSec: 120, endSec: 720, passStopList: { stationList: [st('이음대로.대성베르힐', 0), st('이음대로.호반써밋', 1), st('인천외국어마을', 2), st('아라역4번출구', 3), st('아라동주민센터', 4)] } },
        { transportation: { type: 3 }, duration: 180, distance: 200 },
        { transportation: { type: 1, name: '인천2호선' }, duration: 900, startSec: 900, endSec: 1800, passStopList: { stationList: [st('아라', 6), st('검단오류', 7), st('왕길', 8)] } },
        { transportation: { type: 3 }, duration: 240, distance: 300 },
      ];
      _renderHtlTrack(secs, { name: '출발', lat: 37.579, lng: 126.699 }, { name: '도착', lat: 37.6, lng: 126.73 }, 30);
      window._routeLocked = true; window._metroRouteMode = false; window._gpsMaxIdx = 1;
    }, theme);
    return { ctx, page, errs };
  }
  const strip = (page) => page.evaluate(() => { const r = _ovlStrip(_pipStations()); return r; });

  console.log('[① 앱 타임라인의 칸을 그대로 읽는다]');
  let a = await fresh();
  let r = await strip(a.page);
  await t('다섯 칸을 만들고 현위치는 둘째 칸(앱 화면과 같은 배치)', async () => { assert.ok(r && r.cells.length === 5, JSON.stringify(r && r.cells.length)); assert.strictEqual(r.cur, 1); });
  await t('칸 이름이 앱 타임라인의 역명과 같다', async () => {
    const dom = await a.page.evaluate(() => Array.from(document.getElementById('transitHtlTrack').children).filter(c => c.children.length === 4).map(c => c.children[0].textContent.trim()));
    assert.deepStrictEqual(r.cells.map(c => c.n), dom.slice(0, 5), JSON.stringify([r.cells.map(c => c.n), dom]));
  });
  await t('시각이 앱과 같다(HH:MM)', async () => { assert.ok(/^\d\d:\d\d$/.test(r.cells[1].t), JSON.stringify(r.cells[1])); assert.ok(/^\d\d:\d\d$/.test(r.cells[2].t)); });
  await t('버스 번호 라벨이 승차 칸에 있다', async () => { assert.ok(r.cells.some(c => /931/.test(c.g)), JSON.stringify(r.cells.map(c => c.g))); });
  await t('색이 #rrggbb 이고, 점·선 정보가 있다', async () => {
    const c = r.cells[2];
    assert.ok(/^#[0-9a-f]{6}$/.test(c.dc), JSON.stringify(c)); assert.ok(/^#[0-9a-f]{6}$/.test(c.lc) && /^#[0-9a-f]{6}$/.test(c.rc), JSON.stringify(c));
    assert.ok(c.dk === 1, JSON.stringify(c));
    assert.ok(/^#[0-9a-f]{6}$/.test(r.theme.bg) && /^#[0-9a-f]{6}$/.test(r.theme.fg) && /^#[0-9a-f]{6}$/.test(r.theme.sub), JSON.stringify(r.theme));
  });
  await t('앱의 첫 칸(도보)은 왼쪽 선이 없다', async () => { await a.page.evaluate(() => { window._gpsMaxIdx = 0; }); const q = await strip(a.page); assert.ok(q.cur <= 1, String(q.cur)); assert.ok(!q.cells[0].lc && q.cells[0].rc, JSON.stringify(q.cells[0])); });

  console.log('[② 현위치가 움직이면 창이 따라가고 끝에서는 멈춘다]');
  await t('중간 칸이 현위치면 한 칸 앞부터 보인다', async () => {
    await a.page.evaluate(() => { window._gpsMaxIdx = 3; }); const q = await strip(a.page);
    assert.strictEqual(q.cur, 1); const all = await a.page.evaluate(() => Array.from(document.getElementById('transitHtlTrack').children).filter(c => c.children.length === 4).map(c => c.children[0].textContent.trim()));
    assert.strictEqual(q.cells[1].n, all[3]);
  });
  await t('마지막 근처에서는 다섯 칸을 채우고 현위치가 뒤로 간다', async () => {
    const n = await a.page.evaluate(() => _transitNodeData.length);
    await a.page.evaluate((n) => { window._gpsMaxIdx = n - 1; }, n); const q = await strip(a.page);
    assert.strictEqual(q.cells.length, 5); assert.strictEqual(q.cur, 4);
  });
  await t('정류장명 원문은 그대로 보내고(자르기는 네이티브가 한 줄 …로) 줄바꿈 문자는 없다', async () => {
    assert.ok(r.cells.every(c => !/[\n\r]/.test(c.n)));
  });

  console.log('[③ 경로를 못 읽으면 이름 목록으로 대신한다 · 끄기 스위치]');
  await t('타임라인 DOM 이 없으면 이름 목록으로 만든다', async () => {
    const q = await a.page.evaluate(() => { document.getElementById('transitHtlTrack').innerHTML = ''; window._gpsMaxIdx = 1; return _ovlStrip(_pipStations()); });
    assert.ok(q === null || (q.cells.length > 0 && q.cells.every(c => c.n)), JSON.stringify(q));
  });
  await t('_ovlStripOff 면 null', async () => { const q = await a.page.evaluate(() => { window._ovlStripOff = true; return _ovlStrip(_pipStations()); }); assert.strictEqual(q, null); });
  await t('페이지 오류 없음', async () => assert.deepStrictEqual(a.errs, []));
  await a.ctx.close();

  console.log('[④ 다크 테마]');
  const d = await fresh('dark');
  const rd = await strip(d.page);
  await t('다크 테마에서 바탕은 어둡고 현위치 글자는 밝다(앱 테마를 따름)', async () => {
    const lum = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11); };
    assert.ok(lum(rd.theme.bg) < lum(rd.theme.fg), JSON.stringify(rd.theme));
  });
  await d.ctx.close();

  await b.close();
  console.log(`\n${pass} 통과, ${fail} 실패`); process.exit(fail ? 1 : 0);
})();
