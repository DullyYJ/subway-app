// 네이티브 노선도 데이터(www/metro_native.bin) 검증 — 2026-10-14 (YJ: "노선도를 네이티브로, 기능은 지금처럼 완벽히")
//   ① 파일이 현재 SVG·필터 규칙에서 다시 만든 것과 같다(오래되면 실패 — node tools/metro-native/build.js 로 갱신)
//   ② 데이터를 참조 렌더러(Canvas2D, 자바와 같은 규칙)로 그린 그림이 원본 SVG 그림과 같다(여러 배율·구역·호선 필터)
//   ③ 역 라벨·별칭·글리프 구조가 지금 앱이 쓰는 것과 같다
// 실행: node test/metro_native_data.test.js
const assert = require('assert'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('./helpers/pw');
const { decode } = require('../tools/metro-native/format');
const { drawModel } = require('../tools/metro-native/refrender');
const html = path.join(__dirname, '..', 'www', 'index.html'), BIN = path.join(__dirname, '..', 'www', 'metro_native.bin');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 400)); } };

(async () => {
  const M = decode(fs.readFileSync(BIN));
  await t('파일이 현재 SVG·필터 규칙과 같다(--check)', async () => {
    execFileSync('node', [path.join(__dirname, '..', 'tools', 'metro-native', 'build.js'), '--check'], { stdio: 'pipe' });
  });
  await t('구조: 라벨 655 · 별칭(서울역→서울, 총신대입구→이수) · 필터 25개 · 클립 87', async () => {
    const labels = M.ops.filter(o => o.kind === 2);
    assert.strictEqual(labels.length, 655);
    const by = {}; labels.forEach(l => { by[M.strings[l.name]] = l; });
    assert(by['서울역'] && M.strings[by['서울역'].alt] === '서울');
    assert(by['총신대입구'] && M.strings[by['총신대입구'].alt] === '이수');
    assert.strictEqual(M.filters.length, 25); assert.strictEqual(M.strings[M.filters[0].name], 'ALL');
    assert.strictEqual(M.clips.length, 87);
    assert(labels.every(l => l.inst.length > 0 && l.tb[2] > 0 && l.tb[3] > 0), '라벨마다 글자·영역이 있어야 한다');
    const all = M.filters[0].state; assert(all.every(v => v === 255), 'ALL 은 전부 보임');
    const l2 = M.filters[M.filters.findIndex(f => M.strings[f.name] === '2호선')].state;
    assert(l2.some(v => v === 0) && l2.some(v => v === 255), '2호선 필터는 일부만 보인다');
  });

  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  // 원본 SVG(ALL)와, 앱의 gmFilterLine 을 돌린 뒤의 SVG(호선별)를 문자열로 받는다
  const app = await (await b.newContext({ viewport: { width: 412, height: 860 } })).newPage();
  await app.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
  await app.goto('file://' + html); await app.waitForTimeout(1200);
  const svgs = await app.evaluate(() => {
    _ensureMetroSvg(); const svg = document.querySelector('#svgContainer svg'); svg.classList.remove('lz'); svg.setAttribute('width', 2551.18); svg.setAttribute('height', 2551.18);
    const out = {}; for (const nm of ['ALL', '2호선', '신분당선']) { gmFilterLine(nm); out[nm] = new XMLSerializer().serializeToString(svg); } gmFilterLine('ALL'); svg.classList.add('lz'); out.LZ = new XMLSerializer().serializeToString(svg); svg.classList.remove('lz'); return out;
  });
  await app.close();

  const page = await (await b.newContext({ viewport: { width: 600, height: 700 } })).newPage();
  await page.goto('about:blank');
  await page.addScriptTag({ content: 'window.drawModel=' + drawModel.toString() });
  const modelJson = JSON.stringify(M);
  async function compare(filter, scale, ox, oy, w, h, lod) {
    return page.evaluate(async ({ svgText, modelJson, filter, scale, ox, oy, w, h, lod }) => {
      const M = JSON.parse(modelJson);
      const img = new Image(); const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' })); img.src = url; await img.decode();
      const A = document.createElement('canvas'); A.width = w; A.height = h; const a = A.getContext('2d');
      a.fillStyle = '#fff'; a.fillRect(0, 0, w, h);
      // 원본: SVG 를 같은 배율로 같은 구역만 그린다
      a.save(); a.scale(scale, scale); a.translate(-ox, -oy); a.drawImage(img, 0, 0, 2551.18, 2551.18); a.restore();
      const B = document.createElement('canvas'); B.width = w; B.height = h; const bc = B.getContext('2d');
      const n = window.drawModel(bc, M, { scale, ox, oy, w, h, filter, lod });
      const da = a.getImageData(0, 0, w, h).data, db = bc.getImageData(0, 0, w, h).data;
      let bad = 0, sum = 0; for (let i = 0; i < da.length; i += 4) { const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])); sum += d; if (d > 80) bad++; }
      return { n, bad: bad / (w * h), mean: sum / (w * h) };
    }, { svgText: lod ? svgs.LZ : svgs[filter], modelJson, filter, scale, ox, oy, w, h, lod });
  }
  const cases = [
    ['ALL', 0.3, 0, 0, 600, 700, true, '전체 축소(0.3배)'],
    ['ALL', 1.0, 1000, 900, 600, 700, false, '서울역 부근 1배'],
    ['ALL', 3.0, 1200, 1030, 600, 700, false, '서울역 3배(영문 글자 포함)'],
    ['ALL', 8.0, 1262, 1070, 600, 700, false, '서울역 8배(글자 윤곽)'],
    ['ALL', 6.0, 245, 855, 600, 600, false, '검단호수공원·신검단중앙(path 로 쓴 라벨) 6배'],
    ['ALL', 6.0, 245, 855, 600, 600, true, '같은 구역, 영문 숨김(lod)'],
    ['ALL', 1.0, 300, 220, 600, 700, false, '범례 구역(좌상단) 1배'],
    ['ALL', 1.0, 0, 1650, 600, 700, false, '한강·서해 물결 클립 구역'],
    ['2호선', 1.0, 1000, 900, 600, 700, false, '2호선 필터 1배'],
    ['신분당선', 0.6, 800, 900, 600, 700, false, '신분당선 필터 0.6배'],
  ];
  for (const [f, sc, ox, oy, w, h, lod, name] of cases) {
    await t('원본 SVG 와 같은 그림: ' + name, async () => {
      const r = await compare(f, sc, ox, oy, w, h, lod);
      assert(r.n > 20, '그려진 도형이 너무 적다 ' + JSON.stringify(r));
      assert(r.bad < 0.004, '다른 픽셀 ' + (r.bad * 100).toFixed(2) + '% (' + JSON.stringify(r) + ')');
      assert(r.mean < 1.5, '평균 차이 ' + r.mean.toFixed(2));
    });
  }
  await b.close();
  console.log(`\nmetro_native_data: ${pass} pass ${fail} fail`); process.exit(fail ? 1 : 0);
})();
