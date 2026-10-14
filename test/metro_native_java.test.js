// 네이티브 노선도 자바 코드(안드로이드와 상관없는 부분) 검증 — 2026-10-14
//   native/MetroMapData·MetroCamera·MetroRenderer 는 android.* 를 안 써서 이 PC 의 JVM 에서 그대로 돌릴 수 있다.
//   ① 자체 점검(java MetroJvmTest check) 전부 통과
//   ② 자바가 그린 그림(java.awt) == 참조 렌더러(브라우저 Canvas2D) 그림 — 여러 배율·구역·호선 필터·lod·강조색
//   ③ 이름으로 역 찾기(findLabel) == 지금 앱의 _mapGoToStation 검색 결과
//   ④ 누른 곳의 역(hitLabel) == 브라우저가 실제 SVG 에서 누른 역(elementFromPoint)
// 실행: node test/metro_native_java.test.js   (javac · java 필요)
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('./helpers/pw');
const { decode } = require('../tools/metro-native/format');
const { drawModel } = require('../tools/metro-native/refrender');
const ROOT = path.join(__dirname, '..'), html = path.join(ROOT, 'www', 'index.html'), BIN = path.join(ROOT, 'www', 'metro_native.bin');
let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e.message || e).slice(0, 500)); } };
const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '', LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' });
const JAVA = ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-Djava.awt.headless=true'];

(async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'gdm-jvm-'));
  const cls = path.join(out, 'cls');
  fs.mkdirSync(cls);
  const srcs = ['MetroMapData', 'MetroCamera', 'MetroRenderer'].map(n => path.join(ROOT, 'native', n + '.java')).concat([path.join(__dirname, 'java', 'MetroJvmTest.java')]);
  await t('자바 컴파일(MetroMapData·MetroCamera·MetroRenderer)', async () => {
    execFileSync('javac', ['-encoding', 'UTF-8', '-Xlint:all', '-d', cls].concat(srcs), { env: ENV, stdio: 'pipe' });
  });
  const J = (args) => execFileSync('java', JAVA.concat(['-cp', cls, 'com.dullyyj.subway.MetroJvmTest']).concat(args), { env: ENV, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });

  await t('자바 자체 점검 전부 통과(파서·찾기·터치·필터·카메라·그리기 규칙)', async () => {
    let o; try { o = J(['check', BIN]); } catch (e) { o = String(e.stdout || '') + String(e.stderr || ''); }
    const bad = o.split('\n').filter(l => /^FAIL/.test(l) || /Exception/.test(l));
    assert(!bad.length && /ALL OK/.test(o), bad.join(' | ') || o.slice(-300));
  });

  const M = decode(fs.readFileSync(BIN));
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const app = await (await b.newContext({ viewport: { width: 412, height: 860 } })).newPage();
  await app.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
  await app.goto('file://' + html); await app.waitForTimeout(1200);
  const svgSrc = await app.evaluate(() => document.getElementById('metroSvgSrc').textContent);

  // ② 그림 비교
  const page = await (await b.newContext({ viewport: { width: 600, height: 700 } })).newPage();
  await page.goto('about:blank');
  await page.addScriptTag({ content: 'window.drawModel=' + drawModel.toString() });
  const modelJson = JSON.stringify(M);
  const cases = [
    ['ALL', 0.3, 0, 0, 600, 700, 1, null, '전체 축소 0.3배(lod)'],
    ['ALL', 1.0, 1000, 900, 600, 700, 0, null, '서울역 부근 1배'],
    ['ALL', 3.0, 1200, 1030, 600, 700, 0, null, '서울역 3배'],
    ['ALL', 8.0, 1262, 1070, 600, 700, 0, null, '서울역 8배'],
    ['ALL', 6.0, 245, 855, 600, 600, 0, null, '검단호수공원 구역(path 라벨) 6배'],
    ['ALL', 1.0, 300, 220, 600, 700, 0, null, '범례 구역'],
    ['ALL', 1.0, 0, 1650, 600, 700, 0, null, '한강·서해 클립 구역'],
    ['2호선', 1.0, 1000, 900, 600, 700, 0, null, '2호선 필터'],
    ['신분당선', 0.6, 800, 900, 600, 700, 0, null, '신분당선 필터 0.6배'],
    ['ALL', 6.0, 1200, 1030, 600, 700, 0, '서울역', '서울역 강조색 6배'],
  ];
  for (const [f, sc, ox, oy, w, h, lod, hl, name] of cases) {
    await t('자바 그림 == 참조 그림: ' + name, async () => {
      const png = path.join(out, 'r.png');
      const args = ['render', BIN, png, f, String(sc), String(ox), String(oy), String(w), String(h), String(lod)]; if (hl) args.push(hl);
      const o = J(args); const jDrawn = +/drawn (-?\d+)/.exec(o)[1];
      const dataUrl = 'data:image/png;base64,' + fs.readFileSync(png).toString('base64');
      const r = await page.evaluate(async ({ dataUrl, modelJson, f, sc, ox, oy, w, h, lod, hl }) => {
        const M = JSON.parse(modelJson);
        const img = new Image(); img.src = dataUrl; await img.decode();
        const A = document.createElement('canvas'); A.width = w; A.height = h; const a = A.getContext('2d'); a.drawImage(img, 0, 0);
        const B = document.createElement('canvas'); B.width = w; B.height = h; const bc = B.getContext('2d');
        // 강조색: 참조 렌더러엔 강조 인자가 없으니 해당 라벨의 글자 색을 바꾼 사본으로 그린다
        if (hl) { const i = M.ops.findIndex(o => o.kind === 2 && M.strings[o.name] === hl); M.ops[i].inst.forEach(it => { it.fill = 0xFFFF2D55; }); }
        const n = window.drawModel(bc, M, { scale: sc, ox, oy, w, h, filter: f, lod: !!lod });
        const da = a.getImageData(0, 0, w, h).data, db = bc.getImageData(0, 0, w, h).data;
        let bad = 0, sum = 0; for (let i = 0; i < da.length; i += 4) { const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2])); sum += d; if (d > 80) bad++; }
        return { n, bad: bad / (w * h), mean: sum / (w * h) };
      }, { dataUrl, modelJson, f, sc, ox, oy, w, h, lod, hl });
      assert.strictEqual(jDrawn, r.n, '그린 op 수가 다르다 java=' + jDrawn + ' ref=' + r.n);
      assert(r.n > 5, '그려진 것이 너무 적다');
      assert(r.bad < 0.004, '다른 픽셀 ' + (r.bad * 100).toFixed(2) + '% ' + JSON.stringify(r));
      assert(r.mean < (sc < 0.5 ? 2.0 : 1.5), '평균 차이 ' + r.mean.toFixed(2));   // 아주 작게 줄이면 두 그리기 엔진의 안티앨리어싱 차이가 평균에 더 드러난다
    });
  }

  // ③ 이름 찾기
  await t('역 이름 찾기 == 앱의 _mapGoToStation 검색(정확히 같은 이름 → 포함하는 이름)', async () => {
    const names = ['서울역', '서울', '교대', '강남', '양평', '총신대입구', '이수', '공원', '신', '역삼', '부평', '인천', '시청', '서울 역', '검단호수공원', '신검단중앙', '없는역xyz', '대공원', '왕십리', '잠실'];
    const exp = await app.evaluate((names) => {
      _ensureMetroSvg(); const texts = [...document.querySelectorAll('#svgContainer svg text')];
      return names.map(nm => { const nn = String(nm || '').replace(/\s+/g, ''); let k = -1;
        for (let i = 0; i < texts.length; i++) if (svgExtractName(texts[i]).replace(/\s+/g, '') === nn) { k = i; break; }
        if (k < 0) for (let j = 0; j < texts.length; j++) { const en = svgExtractName(texts[j]).replace(/\s+/g, ''); if (en && en.indexOf(nn) >= 0) { k = j; break; } }
        return k; });
    }, names);
    const got = J(['find', BIN].concat(names)).trim().split('\n').map(l => +l.split('\t')[1]);
    assert.deepStrictEqual(got, exp, JSON.stringify(names.map((n, i) => [n, got[i], exp[i]]).filter((x, i) => got[i] !== exp[i])));
  });

  // ④ 누른 곳
  await t('터치 판정: 라벨 중심을 누르면 브라우저가 누른 역과 같다(겹치는 몇 곳 제외)', async () => {
    const p2 = await (await b.newContext({ viewport: { width: 2600, height: 2600 } })).newPage();
    await p2.setContent('<!doctype html><html><body style="margin:0;background:#fff">' + svgSrc + '</body></html>');
    await p2.evaluate(() => { document.querySelectorAll('svg text').forEach(t => { t.style.pointerEvents = 'all'; }); const s = document.querySelector('svg'); s.setAttribute('width', 2551.18); s.setAttribute('height', 2551.18); s.style.display = 'block'; });
    const lab = M.ops.filter(o => o.kind === 2);
    const pts = []; lab.forEach((l, i) => { pts.push([i, l.tb[0] + l.tb[2] / 2, l.tb[1] + l.tb[3] / 2]); });
    const browser = await p2.evaluate((pts) => {
      const texts = [...document.querySelectorAll('svg text')];
      return pts.map(([i, x, y]) => { const e = document.elementFromPoint(x, y); const tx = e && (e.tagName === 'text' ? e : e.closest && e.closest('text')); return tx ? texts.indexOf(tx) : -1; });
    }, pts);
    const o = J(['hit', BIN, 'ALL', '0'].concat(pts.flatMap(([i, x, y]) => [String(x), String(y)]))).trim().split('\n').map(Number);
    let same = 0, diff = []; pts.forEach(([i], k) => { if (o[k] === browser[k]) same++; else diff.push([M.strings[lab[i].name], o[k] < 0 ? -1 : M.strings[lab[o[k]].name], browser[k] < 0 ? -1 : M.strings[lab[browser[k]].name]]); });
    console.log('      라벨 중심 일치 ' + same + '/' + pts.length + (diff.length ? '  (다른 곳 예: ' + JSON.stringify(diff.slice(0, 4)) + ')' : ''));
    assert(same / pts.length >= 0.97, '일치율 ' + (same / pts.length).toFixed(3) + ' ' + JSON.stringify(diff.slice(0, 8)));
  });

  await b.close();
  try { fs.rmSync(out, { recursive: true, force: true }); } catch (e) {}
  console.log(`\nmetro_native_java: ${pass} pass ${fail} fail`); process.exit(fail ? 1 : 0);
})();
