// 경로탐색 로딩 캐릭터 + 오버레이 추천 캐릭터 — 2026-10-13
//   로딩: 바퀴 자리에서 캐릭터 6종이 무작위로 좌→우로 달린다(캔버스). 로딩이 끝나면 멈춘다. 그림 파일이 없으면 바퀴가 그대로 남는다.
//   오버레이: 추천(reco)에 캐릭터 둘(ch, ch2)이 서로 다르게 실려 가고, 같은 추천이 보이는 동안은 안 바뀐다.
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
  await t('캐릭터 그림 6개가 있다', async () => { for (const id of IDS) { const f = path.join(__dirname, '..', 'www', 'chars', id + '.webp'); assert.ok(fs.existsSync(f) && fs.statSync(f).size > 2000, id); } });

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
    assert.ok(n > 800, 'px ' + n);
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
  await t('reco 에 서로 다른 캐릭터 둘(ch, ch2)이 실린다', async () => { const [a] = await recoOf(); assert.strictEqual(a.on, true); assert.ok(IDS.includes(a.ch) && IDS.includes(a.ch2) && a.ch !== a.ch2, a.ch + ',' + a.ch2); });
  await t('같은 추천이 보이는 동안은 캐릭터가 안 바뀐다', async () => { const [a, b] = await recoOf(); assert.strictEqual(a.ch + a.ch2, b.ch + b.ch2); });
  await t('새 추천이 뜨면 다시 뽑는다(여러 번 중 한 번은 달라진다)', async () => {
    const seen = new Set(); for (let i = 0; i < 25; i++) { const [a] = await recoOf(); seen.add(a.ch + a.ch2); } assert.ok(seen.size > 1, [...seen].join());
  });
  await t('JS 오류 없음', async () => assert.deepStrictEqual(errs, []));
  await b.close(); srv.close();
  console.log('\n' + pass + ' pass, ' + fail + ' fail'); process.exit(fail ? 1 : 0);
})();
