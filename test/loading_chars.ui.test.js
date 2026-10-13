// 경로탐색 로딩 캐릭터 + 오버레이 추천 캐릭터 — 2026-10-13
//   로딩: 바퀴 자리에서 캐릭터 6종이 무작위로 3D 동작(걷기·뛰기·날기·헤엄·땅에서 솟기)으로 좌→우로 지나간다(캔버스). 로딩이 끝나면 멈춘다. 옛 한 장 그림 방식은 없다(2026-10-13).
//   오버레이(2026-10-14): 추천(reco)에 캐릭터 하나(ch)가 무작위로 실려 가고(오른쪽에서 줄을 끌고 들어옴), 같은 추천이 보이는 동안은 안 바뀐다.
//   줄 첫 줄에는 실제 가게·쿠팡 상품 이름(_arrAd)이 실린다. 네이티브 추천 줄은 캐릭터가 잘리지 않는 칸 높이를 갖는다(소스 점검).
// 실행: node test/loading_chars.ui.test.js [html 경로]
const assert = require('assert'), path = require('path'), fs = require('fs'), http = require('http');
const { chromium } = require('./helpers/pw');
const html = process.argv[2] && /\.html$/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, '..', 'www', 'index.html');
const IDS = ['dolsom', 'lovel', 'dudung', 'sul', 'ppopu', 'chaeng'];
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message).split('\n')[0]); } };
(async () => {
  // file:// 에서는 그림 파일 때문에 캔버스가 '오염'돼 픽셀을 못 읽으므로, www 폴더를 로컬 서버로 연다(외부 요청은 그대로 전부 차단).
  const root = path.dirname(html);
  const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', f.endsWith('.webp') ? 'image/webp' : f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream'); r.end(d); }); });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok)); const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Seoul', geolocation: { latitude: 37.5, longitude: 126.9 }, permissions: ['geolocation'] });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = new URL(r.request().url()); return (u.protocol === 'file:' || u.hostname === '127.0.0.1') ? r.continue() : r.abort(); });
  await page.goto(base + path.basename(html)); await page.addStyleTag({ content: '#locDiscOv{display:none !important}' }); await page.waitForTimeout(2500);
  const show = () => page.evaluate(() => { document.getElementById('transitResultBox').style.display = 'block'; document.getElementById('transitLoading').style.display = 'flex'; });
  const hide = () => page.evaluate(() => { document.getElementById('transitLoading').style.display = 'none'; });

  console.log('[① 그림 파일]');
  await t('3D 동작 시트 7개가 있다', async () => { for (const f of IDS.map(i => i + '.webp').concat(['dudung_intro.webp'])) { const q = path.join(__dirname, '..', 'www', 'chars3d', f); assert.ok(fs.existsSync(q) && fs.statSync(q).size > 20000, f); } });
  await t('옛 한 장 그림 폴더(www/chars)는 없다', async () => assert.ok(!fs.existsSync(path.join(__dirname, '..', 'www', 'chars'))));

  console.log('[② 로딩 화면]');
  await page.evaluate(() => _RC.ready() || 0); await page.waitForTimeout(2200);
  await t('그림이 모두 읽혀 준비됨', async () => assert.strictEqual(await page.evaluate(() => _RC.ready()), true));
  await t('로딩이 켜지면 캔버스가 생기고 바퀴는 숨는다', async () => {
    await show(); await page.waitForTimeout(300);
    const s = await page.evaluate(() => { const tr = document.querySelector('.rtl-track'); const w = tr.querySelector('.rtl-wheel'); return { on: tr.classList.contains('rc-on'), cv: !!tr.querySelector('canvas.rc-cv'), wheel: getComputedStyle(w).display }; });
    assert.deepStrictEqual(s, { on: true, cv: true, wheel: 'none' });
  });
  await t('캔버스에 실제로 그려진다(투명하지 않은 픽셀이 있다)', async () => {
    const n = await page.evaluate(() => { const c = document.querySelector('canvas.rc-cv'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) k++; return k; });
    assert.ok(n > 300, 'px ' + n);
  });
  for (const id of IDS) {
    await t(id + ': 좌→우로 이동하며 그려진다', async () => {
      await hide(); await page.evaluate(i => { window._rcForce = i; }, id); await show();
      const xs = [];
      for (let k = 0; k < 4; k++) {
        await page.waitForTimeout(380);
        xs.push(await page.evaluate(() => { const c = document.querySelector('canvas.rc-cv'); const W = c.width, H = c.height, d = c.getContext('2d').getImageData(0, 0, W, H).data; let sx = 0, n = 0; for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 200) { sx += x; n++; } return n > 60 ? sx / n / W : -1; }));
      }
      assert.ok(xs.every(v => v >= 0), '안 그려짐 ' + xs);
      assert.ok(xs[3] > xs[0] + 0.1 || xs.some((v, i) => i && v > xs[i - 1] + 0.1), '안 움직임 ' + xs);
    });
  }
  await t('로딩이 끝나면 멈춘다(그리기 중단)', async () => {
    await hide(); await page.waitForTimeout(300);
    const a = await page.evaluate(() => document.querySelector('canvas.rc-cv').toDataURL()); await page.waitForTimeout(400);
    const b2 = await page.evaluate(() => document.querySelector('canvas.rc-cv').toDataURL());
    assert.strictEqual(a, b2);
  });
  await t('다시 켜면 또 달린다', async () => {
    await page.evaluate(() => { window._rcForce = null; }); await show(); await page.waitForTimeout(300);
    const a = await page.evaluate(() => document.querySelector('canvas.rc-cv').toDataURL()); await page.waitForTimeout(350);
    const b2 = await page.evaluate(() => document.querySelector('canvas.rc-cv').toDataURL()); assert.notStrictEqual(a, b2);
  });
  await t('기존 문구(복합경로 탐색 중...)는 그대로', async () => assert.ok((await page.evaluate(() => document.getElementById('transitLoading').textContent)).includes('복합경로 탐색 중')));
  await hide();

  console.log('[③ 오버레이 추천에 실리는 캐릭터]');
  const recoOf = () => page.evaluate(() => {
    window._ovlRecoOff = false; window._ovlRecoDismissAt = undefined;
    window._pipReco = { title: '하차 10분 전 · 아라', body: '점심시간이에요. 제육볶음 어떠세요?\n근처엔 한솥, 맘스터치 있어요.', at: Date.now(), ovlAt: Date.now() - 60000 };
    window._arrLast = null; window._arrHomeEta = () => ({ arrMs: Date.now() + 100000, rem: 100 });
    const a = _ovlLines().reco, b = _ovlLines().reco; return [a, b];
  });
  await t('reco 에 캐릭터 하나(ch)가 실린다(ch2 는 없다)', async () => { const [a] = await recoOf(); assert.strictEqual(a.on, true); assert.ok(IDS.includes(a.ch), a.ch); assert.strictEqual(a.ch2, undefined); });
  await t('같은 추천이 보이는 동안은 캐릭터가 안 바뀐다', async () => { const [a, b] = await recoOf(); assert.strictEqual(a.ch, b.ch); });
  await t('새 추천이 뜨면 다시 뽑는다(여러 번 중 한 번은 달라진다)', async () => {
    const seen = new Set(); for (let i = 0; i < 40; i++) { const [a] = await recoOf(); seen.add(a.ch); } assert.ok(seen.size > 1, [...seen].join());
  });
  console.log('[③-2 광고에 실제 가게·상품 이름과 날씨·시간 맞춤 설명 (2026-10-14)]');
  const withAd = (ad) => page.evaluate((ad) => {
    window._ovlRecoOff = false; window._ovlRecoDismissAt = undefined;
    window._pipReco = { title: '하차 10분 전 · 아라', body: '점심시간이에요. 제육볶음 어떠세요?\n근처엔 한솥, 맘스터치 있어요.', at: Date.now(), ovlAt: Date.now() - 60000, ad };
    window._arrLast = { at: window._pipReco.at, action: ad && ad.k === 'shop' ? { kind: 'shop' } : { label: '맛집 위치 보기' } }; window._arrHomeEta = () => ({ arrMs: Date.now() + 100000, rem: 100 });
    return _ovlLines().reco;
  }, ad);
  await t('식당 광고: 첫 줄에 실제 가게 이름, 둘째 줄에 추천 설명, m 에 거리·종류', async () => { const r = await withAd({ k: 'food', a: '스타벅스 인천터미널점', b: '비 오는 아침엔 따뜻한 한 잔 · 따뜻한 라떼 + 소금빵 어때요?', m: '120m · 커피전문점 · 걸어서 2분' }); assert.strictEqual(r.a, '스타벅스 인천터미널점'); assert.ok(/따뜻한 라떼 \+ 소금빵/.test(r.b), r.b); assert.strictEqual(r.m, '120m · 커피전문점 · 걸어서 2분'); assert.strictEqual(r.go, '맛집 보기'); });
  await t('설명은 두 줄 분량(64자)까지 보낸다', async () => { const long = '가'.repeat(30) + ' ' + '나'.repeat(30) + ' ' + '다'.repeat(20); const r = await withAd({ k: 'food', a: '대박국밥', b: long, m: '' }); assert.ok(r.b.length > 26 && r.b.length <= 65, String(r.b.length)); });
  await t('쿠팡 광고: 첫 줄에 실제 상품 이름, 버튼은 쿠팡 보기', async () => { const r = await withAd({ k: 'shop', a: '코멕스 3단 자동 우산 대형 튼튼한 방풍 우산', b: '비 소식 70%예요, 미리 챙겨요', m: '생활 · 쿠팡' }); assert.ok(r.a.startsWith('코멕스 3단 자동 우산'), r.a); assert.strictEqual(r.go, '쿠팡 보기'); assert.ok(r.a.length <= 41, r.a); assert.strictEqual(r.m, '생활 · 쿠팡'); });
  await t('실제 이름이 없으면(ad 없음) 예전 문구 두 줄로 간다', async () => { const r = await withAd(null); assert.ok(/점심시간이에요/.test(r.a), r.a); assert.strictEqual(r.m, ''); });
  const CXR = () => Object.assign(_arrCx(Date.now()), {});
  await t('_arrAd 카페(아침): 이름·메뉴+브런치 권유·상황 문구(비)·거리/종류/걸어서 분', async () => {
    const r = await page.evaluate(() => { const cx = Object.assign(_arrCx(Date.now()), { rainy: true, rain: 80, snowy: false, freezing: false, cold: false });
      return _arrAd({ place: { n: '이디야커피 ☕ 아라점', d: 230, c: '음식점 > 카페 > 커피전문점' }, spots: [], menu: '따뜻한 라떼', brunch: '소금빵', cx }, 'morning', ''); });
    assert.strictEqual(r.k, 'cafe'); assert.strictEqual(r.a, '이디야커피 아라점'); assert.strictEqual(r.m, '230m · 커피전문점 · 걸어서 3분');
    assert.ok(/비|빗/.test(r.b) && /따뜻한 라떼 \+ 소금빵 어때요\?/.test(r.b), r.b);
  });
  await t('_arrAd 점심: 메뉴에 맞는 가게(spots)가 있으면 그 가게와 그 메뉴를 권한다', async () => {
    const r = await page.evaluate(() => _arrAd({ place: { n: '맘스터치', d: 90, c: '음식점 > 패스트푸드 > 햄버거' }, spots: ['한솥도시락', '김밥천국'], menu: '도시락', cx: Object.assign(_arrCx(Date.now()), { rainy: false, snowy: false, cold: false, hot: false, payday: false, fri: false, mon: false, weekend: false }) }, 'lunch', ''));
    assert.strictEqual(r.a, '한솥도시락'); assert.ok(/도시락/.test(r.b), r.b); assert.ok(!/햄버거/.test(r.b), r.b);
  });
  await t('_arrAd 점심: 메뉴와 상관없이 고른 가게(place)만 있으면 그 가게 업종으로 말한다(안 파는 메뉴를 권하지 않는다)', async () => {
    const r = await page.evaluate(() => _arrAd({ place: { n: '대박국밥', d: 1340, c: '음식점 > 한식 > 국밥' }, spots: [], menu: '제육볶음', cx: _arrCx(Date.now()) }, 'lunch', ''));
    assert.strictEqual(r.a, '대박국밥'); assert.ok(/국밥/.test(r.b), r.b); assert.ok(!/제육볶음/.test(r.b), r.b); assert.strictEqual(r.m, '1.3km · 국밥'); assert.ok(r.b.length > 14 && r.b.length <= 64, '설명이 짧다: ' + r.b);
  });
  await t('_arrAd 저녁·야식·이모지 제거·정보 없음', async () => {
    const r = await page.evaluate(() => [
      _arrAd({ place: { n: '굽네치킨 🍗 아라점', d: 480, c: '음식점 > 치킨' }, spots: [], menu: '치킨', dinner: false, cx: _arrCx(Date.now()) }, 'night', ''),
      _arrAd({ place: null, spots: [], menu: '' }, 'lunch', ''),
      _arrAd({ shop: null }, 'shop', '')]);
    assert.strictEqual(r[0].a, '굽네치킨 아라점'); assert.ok(/치킨/.test(r[0].b), r[0].b); assert.strictEqual(r[0].m, '480m · 치킨 · 걸어서 7분');
    assert.strictEqual(r[1], null); assert.strictEqual(r[2], null);
  });
  await t('_arrAd 쿠팡: 이름 + 상품에 맞춘 설명(비 올 확률) + 분류·쿠팡', async () => {
    const r = await page.evaluate(() => { const cx = Object.assign(_arrCx(Date.now()), { rain: 70, rainSoon: true, rainy: true });
      return [_arrAd({ shop: { n: '코멕스 3단 자동 우산', _cat: '생활', _t: '우천대비' }, cx }, 'shop'),
              _arrAd({ shop: { n: '코멕스 3단 자동 우산', _cat: '생활', _t: '우천대비' }, cx, hook: '비 오는 밤, 구경하다 가요', hookStrong: true }, 'shop')]; });
    assert.strictEqual(r[0].k, 'shop'); assert.strictEqual(r[0].a, '코멕스 3단 자동 우산'); assert.ok(/비 올 확률이 70%/.test(r[0].b), r[0].b); assert.strictEqual(r[0].m, '생활 · 쿠팡');
    assert.ok(r[1].b.length > 0 && r[1].b.length <= 64, r[1].b);
  });
  await t('실제 발사 경로(_arrFireAlertNow)가 만든 추천에 ad 가 실린다(도착지도 넘긴다)', async () => {
    const r = await page.evaluate(() => /_pipReco\.ad\s*=\s*_arrAd\(a, slot, destStn\)/.test(String(_arrFireAlertNow)));
    assert.strictEqual(r, true);
  });
  console.log('[④ 3D 렌더링 동작 프레임 (2026-10-13)]');
  await t('시트가 읽히고 크기가 1024×1024(256px 칸 4×4)다', async () => {
    const r = await page.evaluate(async () => { const o = {}; for (const id of ['dolsom', 'lovel', 'dudung', 'sul', 'ppopu', 'chaeng', 'dudung_intro']) o[id] = await new Promise(ok => { const im = new Image(); im.onload = () => ok(im.naturalWidth + 'x' + im.naturalHeight); im.onerror = () => ok('err'); im.src = 'chars3d/' + id + '.webp'; }); return o; });
    for (const k in r) assert.strictEqual(r[k], '1024x1024', k + ' ' + r[k]);
  });
  const sig = () => page.evaluate(() => { const c = document.querySelector('canvas.rc-cv'); const W = c.width, H = c.height, d = c.getContext('2d').getImageData(0, 0, W, H).data; let n = 0, sx = 0, sy = 0, hsh = 0; for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const a = d[(y * W + x) * 4 + 3]; if (a > 200) { n++; sx += x; sy += y; hsh = (hsh * 31 + d[(y * W + x) * 4] + 7 * d[(y * W + x) * 4 + 1]) | 0; } } return { n, cx: n ? sx / n / W : -1, cy: n ? sy / n / H : -1, h: hsh }; });
  await t('3D 모드로 돈다(준비됨 · 캔버스에 표시)', async () => {
    assert.strictEqual(await page.evaluate(() => _RC.ready()), true);
    await hide(); await page.evaluate(() => { window._rcForce = 'lovel'; }); await show(); await page.waitForTimeout(900);   // 화면 왼쪽 밖에서 들어오는 시간
    assert.ok((await sig()).n > 300, '안 그려짐');
  });
  for (const id of IDS) {
    await t(id + ': 동작 프레임이 시간에 따라 바뀐다(몸짓)', async () => {
      await hide(); await page.evaluate(i => { window._rcForce = i; }, id); await show();
      await page.waitForTimeout(700); const hs = new Set(); for (let k = 0; k < 8; k++) { await page.waitForTimeout(110); const g = await sig(); if (g.n > 150) hs.add(g.h); }   // 처음 0.7초는 화면 왼쪽 밖에서 들어오는 중
      assert.ok(hs.size >= 5, '서로 다른 프레임 ' + hs.size);
    });
  }
  await t('두덩: 땅에서 솟아 나온 뒤(약 1초) 걸어 나간다', async () => {
    await hide(); await page.evaluate(() => { window._rcForce = 'dudung'; }); await show();
    const xs = []; for (let k = 0; k < 9; k++) { await page.waitForTimeout(220); xs.push((await sig()).cx); }
    assert.ok(Math.abs(xs[1] - xs[0]) < 0.02 && Math.abs(xs[2] - xs[1]) < 0.02, '솟는 동안은 제자리 ' + xs.map(v => v.toFixed(2)));
    assert.ok(xs[8] > xs[3] + 0.04, '그 뒤 오른쪽으로 걷는다 ' + xs.map(v => v.toFixed(2)));
  });
  await t('시트 읽기가 어긋나도 다시 받아 3D 로 그린다(옛 방식 없음)', async () => {
    const pg = await ctx.newPage(); const e2 = []; pg.on('pageerror', e => e2.push(e.message)); let bad = 0;
    await pg.route('**/*', r => { const u = new URL(r.request().url()); if (/\/chars3d\/(dolsom|dudung_intro)\.webp$/.test(u.pathname) && bad < 3) { bad++; return r.abort(); } return (u.protocol === 'file:' || u.hostname === '127.0.0.1') ? r.continue() : r.abort(); });
    await pg.goto(base + path.basename(html)); await pg.addStyleTag({ content: '#locDiscOv{display:none !important}' });
    await pg.evaluate(() => { window._rcForce = 'dolsom'; document.getElementById('transitResultBox').style.display = 'block'; document.getElementById('transitLoading').style.display = 'flex'; });
    let ok = false; for (let k = 0; k < 30 && !ok; k++) { await pg.waitForTimeout(500); ok = await pg.evaluate(() => _RC.ready()); }
    assert.ok(bad >= 1, '일부러 막은 요청이 없음'); assert.ok(ok, '다시 받아도 준비 안 됨');
    await pg.waitForTimeout(1200);
    const r = await pg.evaluate(() => { const c = document.querySelector('canvas.rc-cv'); const d = c && c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; if (d) for (let i = 3; i < d.length; i += 4 * 3) if (d[i] > 200) n++; return n; });
    assert.ok(r > 300, '3D 가 안 그려짐 ' + r); assert.deepStrictEqual(e2, []);
    await pg.close();
  });
  console.log('[⑤ 원본 그대로의 3D 캐릭터(2026-10-14) · 추천 캐릭터 미리보기 버튼]');
  await t('D3 의 바닥줄(base)과 몸 가로 중심(ox)이 시트 그림과 맞는다(발이 줄에 닿는다)', async () => {
    const r = await page.evaluate(async () => {
      const o = {};
      for (const id of ['dolsom', 'lovel', 'dudung', 'sul', 'ppopu', 'chaeng']) {
        const im = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = 'chars3d/' + id + '.webp'; });
        const c = document.createElement('canvas'); c.width = c.height = 1024; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, 1024, 1024).data;
        let low = -1, top = 999;
        for (let f = 0; f < 16; f++) { const ox = (f % 4) * 256, oy = Math.floor(f / 4) * 256; for (let y = 0; y < 256; y++) for (let xx = 0; xx < 256; xx += 2) if (d[((oy + y) * 1024 + ox + xx) * 4 + 3] > 24) { if (y > low) low = y; if (y < top) top = y; } }
        o[id] = { low: low + 1, top: top, base: _RC.d3[id].base };
      }
      return o;
    });
    for (const id in r) assert.ok(Math.abs(r[id].low - r[id].base) <= 3, id + ' 맨 아래 ' + r[id].low + ' ≠ base ' + r[id].base);
  });
  await t('설정에 [추천 캐릭터 미리보기] 버튼이 있다', async () => assert.strictEqual(await page.evaluate(() => !!document.getElementById('rcDemoBtn') && /추천 캐릭터 미리보기/.test(document.getElementById('rcDemoBtn').textContent)), true));
  await t('버튼을 누르면 오버레이에 시연(recoDemo)을 시키고, 누를 때마다 다른 캐릭터 하나가 실려 6종이 모두 나온다', async () => {
    const r = await page.evaluate(() => {
      window.Capacitor = window.Capacitor || {}; window.Capacitor.Plugins = window.Capacitor.Plugins || {};
      window._foodPublicData = [{ place_name: '스타벅스 인천터미널점', category_name: '음식점 > 카페 > 커피전문점', distance: '120' }, { place_name: '대박국밥', category_name: '음식점 > 한식 > 국밥', distance: '340' }, { place_name: '굽네치킨 아라점', category_name: '음식점 > 치킨', distance: '480' }];
      window._shopPick = () => ({ rec: [{ n: '코멕스 3단 자동 우산', _cat: '생활', _t: '우천대비' }], ctx: null });
      const calls = []; window.Capacitor.Plugins.Overlay = { recoDemo: (o) => { calls.push(o); return Promise.resolve({ ok: true }); } };
      for (let i = 0; i < 6; i++) document.getElementById('rcDemoBtn').click();
      return calls;
    });
    assert.strictEqual(r.length, 6);
    const seen = new Set(); for (const c of r) { assert.ok(IDS.includes(c.ch) && c.ch2 === undefined, c.ch); assert.ok(c.a && c.secs >= 10, JSON.stringify(c)); seen.add(c.ch); }
    assert.strictEqual(seen.size, 6, [...seen].join());
  });
  await t('시연 줄에는 실제 가게·쿠팡 상품 이름과 맞춤 설명이 실리고 식당(카페)·쿠팡이 번갈아 나온다', async () => {
    const r = await page.evaluate(() => {
      const calls = []; window.Capacitor.Plugins.Overlay = { recoDemo: (o) => { calls.push(o); return Promise.resolve({ ok: true }); } };
      for (let i = 0; i < 6; i++) document.getElementById('rcDemoBtn').click();
      return calls;
    });
    const names = new Set(['스타벅스 인천터미널점', '대박국밥', '굽네치킨 아라점', '코멕스 3단 자동 우산']);
    for (const c of r) { assert.ok(names.has(c.a), c.a); assert.ok(c.b && c.b.length >= 6, '설명 없음: ' + JSON.stringify(c)); assert.ok(c.m && c.m.length > 0, 'm 없음: ' + JSON.stringify(c)); }
    assert.ok(r.some(c => c.go === '쿠팡 보기' && c.a === '코멕스 3단 자동 우산' && /쿠팡/.test(c.m)), JSON.stringify(r.map(c => c.go)));
    assert.ok(r.some(c => c.go === '맛집 보기' && c.a !== '코멕스 3단 자동 우산'), JSON.stringify(r.map(c => c.go)));
  });
  await t('가게 목록이 하나도 없어도 가짜 가게 이름을 만들지 않고 안내 문구를 싣는다(쿠팡도 없을 때)', async () => {
    const r = await page.evaluate(() => {
      window._foodPublicData = []; window._shopPick = () => ({ rec: [] });
      const calls = []; window.Capacitor.Plugins.Overlay = { recoDemo: (o) => { calls.push(o); return Promise.resolve({ ok: true }); } };
      document.getElementById('rcDemoBtn').click(); return calls[0];
    });
    assert.ok(/가게 이름이 여기에 나와요/.test(r.a), r.a);
  });
  await t('네이티브 추천 줄: 캐릭터 칸이 몸 높이+띄운 높이보다 높아 위아래가 잘리지 않고, 글자는 키웠고, 줄을 가리는 clipRect 가 없다', async () => {
    const j = fs.readFileSync(path.join(__dirname, '..', 'native', 'OverlayPlugin.java'), 'utf8');
    const rv = j.slice(j.indexOf('private class RecoView'), j.indexOf('private class WaitChip'));
    const rowMin = +/rowHdp = Math\.max\((\d+)f, barHdp/.exec(rv)[1];
    const body = id => { const m = new RegExp('"' + id + '".equals\\(id\\)\\) return ([\\d.]+)f;').exec(rv.slice(rv.indexOf('private float bodyDp'))); return m ? +m[1] : 58; };
    const raise = id => { const m = new RegExp('"' + id + '".equals\\(id\\)\\) return new float\\[\\] \\{ [\\d.]+f, [\\d.]+f, [\\d.]+f, [\\d.]+f, ([\\d.]+)f').exec(rv); return m ? +m[1] : 0; };
    for (const id of IDS) assert.ok(body(id) + raise(id) <= rowMin - 4, id + ' ' + body(id) + '+' + raise(id) + ' > ' + (rowMin - 4));
    assert.ok(!/clipRect/.test(rv), 'clipRect 있음');
    assert.ok(/cv\.scale\(-1f, 1f/.test(rv), '왼쪽으로 갈 때 좌우 반전 없음');
    assert.ok(!/rcCh2/.test(rv), '둘째 캐릭터를 그리면 안 된다');
    assert.ok(/fitSp\(rcA, textW, 16f/.test(rv) && /wrap\(rcB, textW, 2, 13\.5f\)/.test(rv), '이름 16sp · 설명 13.5sp 두 줄');
    assert.ok(/stack = \(barW - btnArea - padL\) < dp\(210\)/.test(rv), '좁은 화면 버튼 아래 배치');
  });
  await t('권한이 없으면 안내 문구가 뜨고, 이 버전에 기능이 없으면 그렇게 알린다', async () => {
    const m = await page.evaluate(async () => {
      const msgs = []; const old = window.toast; window.toast = (x) => msgs.push(String(x));
      window.Capacitor.Plugins.Overlay = { recoDemo: () => Promise.resolve({ ok: false, error: 'permission' }) };
      _ovlRecoDemo(); await new Promise(ok => setTimeout(ok, 80));
      window.Capacitor.Plugins.Overlay = {}; _ovlRecoDemo();
      window.toast = old; return msgs;
    });
    assert.ok(/다른 앱 위에 표시/.test(m[0] || ''), JSON.stringify(m)); assert.ok(/지원하지 않아요/.test(m[1] || ''), JSON.stringify(m));
  });
  await t('JS 오류 없음', async () => assert.deepStrictEqual(errs, []));
  await b.close(); srv.close();
  console.log('\n' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
})();
