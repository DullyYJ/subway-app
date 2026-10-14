// 노선도 SVG(www/index.html 의 metroSvgSrc) → 네이티브 지도 데이터(www/metro_native.bin)
//   실행: node tools/metro-native/build.js            (www/metro_native.bin 을 다시 만든다)
//        node tools/metro-native/build.js --check    (파일이 현재 SVG·필터 규칙과 같은지만 확인, 다르면 exit 1 — CI 에서 쓴다)
//   · 도형·글리프·클립은 SVG 에서 직접 읽는다(절대좌표 경로만 지원 — 다른 명령이 나오면 멈춘다. 조용히 틀리게 그리지 않는다).
//   · 호선 필터별 '보임 상태'는 앱의 gmFilterLine 을 실제로 돌려 얻은 결과(computed style)를 그대로 기록한다 → 지금 앱 동작과 같다.
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require('../../test/helpers/pw');
const { encode } = require('./format');
const ROOT = path.join(__dirname, '..', '..');
const HTML = path.join(ROOT, 'www', 'index.html');
const OUT = path.join(ROOT, 'www', 'metro_native.bin');

function parseD(d) {
  const re = /([MLCHVZmlchvzSsQqTtAa])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  const cmd = [], coord = []; let m, cur = null, args = [], cx = 0, cy = 0, sx = 0, sy = 0;
  const need = { M: 2, L: 2, C: 6, H: 1, V: 1, Z: 0 };
  const flush = () => {
    if (!cur) return;
    const n = need[cur];
    if (n === 0) { cmd.push(3); cx = sx; cy = sy; args = []; return; }
    if (args.length % n) throw new Error('인자 개수 오류 ' + cur);
    for (let i = 0; i < args.length; i += n) {
      const a = args.slice(i, i + n); const first = i === 0;
      if (cur === 'M') { if (first) { cmd.push(0); coord.push(a[0], a[1]); cx = sx = a[0]; cy = sy = a[1]; } else { cmd.push(1); coord.push(a[0], a[1]); cx = a[0]; cy = a[1]; } }
      else if (cur === 'L') { cmd.push(1); coord.push(a[0], a[1]); cx = a[0]; cy = a[1]; }
      else if (cur === 'H') { cmd.push(1); coord.push(a[0], cy); cx = a[0]; }
      else if (cur === 'V') { cmd.push(1); coord.push(cx, a[0]); cy = a[0]; }
      else if (cur === 'C') { cmd.push(2); coord.push(a[0], a[1], a[2], a[3], a[4], a[5]); cx = a[4]; cy = a[5]; }
    }
    args = [];
  };
  while ((m = re.exec(d))) {
    if (m[1]) {
      if (!/[MLCHVZ]/.test(m[1])) throw new Error('지원하지 않는 경로 명령: ' + m[1]);
      flush(); cur = m[1]; if (cur === 'Z') { flush(); cur = null; }
    } else { if (!cur) throw new Error('명령 없이 숫자'); args.push(parseFloat(m[2])); }
  }
  flush();
  return { cmd, coord };
}
function color(v) {
  if (v == null) return null;
  v = String(v).trim().toLowerCase();
  if (v === 'none') return null;
  const m = /^#([0-9a-f]{6})$/.exec(v); if (!m) throw new Error('지원하지 않는 색: ' + v);
  return (0xFF000000 | parseInt(m[1], 16)) >>> 0;
}
function parseTransform(t) {
  if (!t) return null;
  let M = [1, 0, 0, 1, 0, 0]; const re = /(translate|scale|matrix)\(([^)]*)\)/g; let m, any = false;
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  while ((m = re.exec(t))) {
    any = true; const n = m[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let X;
    if (m[1] === 'translate') X = [1, 0, 0, 1, n[0], n.length > 1 ? n[1] : 0];
    else if (m[1] === 'scale') X = [n[0], 0, 0, n.length > 1 ? n[1] : n[0], 0, 0];
    else X = n;
    M = mul(M, X);
  }
  if (!any) throw new Error('지원하지 않는 transform: ' + t);
  return M;
}

async function extract() {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 412, height: 860 } });
  const page = await ctx.newPage();
  await page.route('**/*', r => { const u = new URL(r.request().url()); return u.protocol === 'file:' ? r.continue() : r.abort(); });
  await page.addInitScript(() => { try { localStorage.setItem('gdm_loc_disclosed', '1'); } catch (e) {} });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + HTML); await page.waitForTimeout(1500);
  const data = await page.evaluate(() => {
    if (!_ensureMetroSvg()) throw new Error('SVG 를 못 넣었다');
    const svg = document.querySelector('#svgContainer svg'); svg.classList.remove('lz');
    const defs = svg.querySelector('defs'); const glyph = {}, clips = {};
    defs.querySelectorAll(':scope > path').forEach(p => { glyph[p.id] = p.getAttribute('d'); });
    defs.querySelectorAll(':scope > clipPath').forEach(c => { const ps = c.querySelectorAll('path'); if (ps.length !== 1 || c.children.length !== 1) throw new Error('clipPath 구조 다름 ' + c.id); clips[c.id] = ps[0].getAttribute('d'); });
    const ops = [], els = [];
    const A = (e, k) => e.getAttribute(k);
    function walk(node, clip) {
      for (const e of node.children) {
        const tg = e.tagName.toLowerCase();
        if (tg === 'g' && e.classList.contains('lb')) {
          const txt = e.querySelector('text');
          // getBBox 는 숨은 화면에서 0 이라 속성으로 계산한다 (투명 글자: 터치 영역 = 글자 상자 + 투명 선 폭 5 의 절반)
          const tx = +A(txt, 'x'), ty = +A(txt, 'y'), fs = +A(txt, 'font-size'), tl = +A(txt, 'textLength'), sw2 = (+A(txt, 'stroke-width') || 0) / 2;
          if (!(fs > 0 && tl > 0)) throw new Error('라벨 text 속성 이상 ' + A(e, 'data-n'));
          const bb = { x: tx - sw2, y: ty - fs * 0.9 - sw2, width: tl + sw2 * 2, height: fs * 1.15 + sw2 * 2 };
          ops.push({ k: 2, n: A(e, 'data-n'), a: A(e, 'data-a'), clip, tb: [bb.x, bb.y, bb.width, bb.height],
            uses: [...e.querySelectorAll('use')].map(u => ({ h: A(u, 'href').slice(1), x: +A(u, 'x'), y: +A(u, 'y'), fill: A(u, 'fill'), en: u.classList.contains('en') })),
            // 일부 라벨(검단호수공원·신검단중앙)은 글리프 use 대신 transform 이 붙은 path 를 직접 쓴다 (g.en 안의 영문 포함)
            raw: [...e.querySelectorAll('path')].map(q => ({ d: A(q, 'd'), tr: A(q, 'transform'), fill: A(q, 'fill'), en: !!q.closest('g.en') })) });
          for (const c of e.children) {
            const ct = c.tagName.toLowerCase();
            if (!(ct === 'use' || ct === 'path' || ct === 'text' || (ct === 'g' && c.classList.contains('en') && [...c.children].every(z => z.tagName.toLowerCase() === 'path')))) throw new Error('라벨 안 지원하지 않는 요소 ' + ct + ' ' + A(e, 'data-n'));
          }
          els.push(e);
        } else if (tg === 'g') {
          const cp = A(e, 'clip-path'); let c = clip;
          if (cp) { const m = /url\(#([^)]+)\)/.exec(cp); if (!m) throw new Error('clip-path 형식'); c = m[1]; }
          for (const k of ['transform', 'opacity', 'style']) if (A(e, k)) throw new Error('g 의 ' + k + ' 는 지원하지 않는다');
          walk(e, c);
        } else if (tg === 'path') {
          ops.push({ k: 0, d: A(e, 'd'), tr: A(e, 'transform'), fill: A(e, 'fill'), stroke: A(e, 'stroke'), sw: A(e, 'stroke-width'), dash: A(e, 'stroke-dasharray'), cap: A(e, 'stroke-linecap'), rule: A(e, 'fill-rule'), clip });
          els.push(e);
        } else if (tg === 'use') {
          if (A(e, 'transform')) throw new Error('use transform');
          ops.push({ k: 1, h: A(e, 'href').slice(1), x: +A(e, 'x'), y: +A(e, 'y'), fill: A(e, 'fill'), clip });
          els.push(e);
        } else throw new Error('지원하지 않는 요소 ' + tg);
      }
    }
    for (const id of ['mapbase', 'legend', 'name_ko']) walk(svg.querySelector('#' + id), null);
    const eff = (el) => { let a = 1; for (let e = el; e && e !== svg; e = e.parentNode) { const cs = getComputedStyle(e); if (cs.display === 'none') return 0; a *= parseFloat(cs.opacity); } return Math.max(0, Math.min(255, Math.round(a * 255))); };
    const names = ['ALL', ...Object.keys(LINE_PATH_CLS)]; const filters = [];
    for (const nm of names) { gmFilterLine(nm); filters.push({ name: nm, state: els.map(eff) }); }
    gmFilterLine('ALL');
    return { ops, glyph, clips, filters, W: SVG_W, H: SVG_H };
  });
  await b.close();
  if (errs.length) throw new Error('페이지 오류: ' + errs[0]);
  return data;
}

function build(data) {
  const strings = [], sIdx = new Map(); const S = (s) => { if (!sIdx.has(s)) { sIdx.set(s, strings.length); strings.push(s); } return sIdx.get(s); };
  const shapes = [], shIdx = new Map();
  const shape = (d) => { if (!shIdx.has(d)) { shIdx.set(d, shapes.length); shapes.push(parseD(d)); } return shIdx.get(d); };
  const gl = {}; const G = (id) => { if (!(id in data.glyph)) throw new Error('글리프 없음 ' + id); return shape(data.glyph[id]); };
  const clipId = {}; Object.keys(data.clips).forEach((k, i) => { clipId[k] = i; });
  const clipShape = Object.keys(data.clips).map(k => shape(data.clips[k]));
  const bbox = (sh, m, ox, oy, pad) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const c = sh.coord;
    for (let i = 0; i < c.length; i += 2) { let x = c[i], y = c[i + 1]; if (m) { const tx = m[0] * x + m[2] * y + m[4], ty = m[1] * x + m[3] * y + m[5]; x = tx; y = ty; } x += ox; y += oy; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  };
  const un = (a, b) => a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b;
  const ops = [];
  for (const o of data.ops) {
    const clip = o.clip == null ? -1 : clipId[o.clip];
    if (o.clip != null && clip === undefined) throw new Error('clip 없음 ' + o.clip);
    if (o.k === 0) {
      const si = shape(o.d), sh = shapes[si], m = parseTransform(o.tr);
      const fill = o.fill == null ? 0xFF000000 : color(o.fill);      // fill 속성이 없으면 SVG 기본값 = 검정
      const stroke = color(o.stroke); const sw = o.sw == null ? 1 : parseFloat(o.sw);
      if (o.cap && o.cap !== 'round' && o.cap !== 'butt') throw new Error('linecap ' + o.cap);
      const dash = o.dash ? o.dash.split(/[\s,]+/).filter(Boolean).map(Number) : [];
      const pad = stroke == null ? 0.5 : sw * 2 + 0.5;
      const sc = m ? Math.max(Math.abs(m[0]), Math.abs(m[3])) : 1;
      ops.push({ kind: 0, clip, shape: si, m, fill, stroke, sw, dash, round: o.cap === 'round', evenodd: o.rule === 'evenodd', bbox: bbox(sh, m, 0, 0, pad / (sc || 1)) });
    } else if (o.k === 1) {
      const si = G(o.h); ops.push({ kind: 1, clip, shape: si, x: o.x, y: o.y, fill: color(o.fill), bbox: bbox(shapes[si], null, o.x, o.y, 0.5) });
    } else {
      let bb = null; const inst = o.uses.map(u => { const si = G(u.h); bb = un(bb, bbox(shapes[si], null, u.x, u.y, 0.5)); return { shape: si, x: u.x, y: u.y, fill: color(u.fill), en: u.en }; });
      for (const r of (o.raw || [])) {                       // transform 을 좌표에 구워 넣고 x=y=0 인 인스턴스로 둔다
        const m = parseTransform(r.tr) || [1, 0, 0, 1, 0, 0], sh0 = parseD(r.d), co = sh0.coord.slice();
        for (let i = 0; i < co.length; i += 2) { const x = co[i], y = co[i + 1]; co[i] = m[0] * x + m[2] * y + m[4]; co[i + 1] = m[1] * x + m[3] * y + m[5]; }
        const key = 'baked:' + JSON.stringify([sh0.cmd.join(''), co.map(v => Math.round(v * 1e4) / 1e4)]);
        if (!shIdx.has(key)) { shIdx.set(key, shapes.length); shapes.push({ cmd: sh0.cmd, coord: co }); }
        const si = shIdx.get(key); bb = un(bb, bbox(shapes[si], null, 0, 0, 0.5));
        inst.push({ shape: si, x: 0, y: 0, fill: r.fill == null ? 0xFF000000 : color(r.fill), en: r.en });
      }
      bb = un(bb, [o.tb[0], o.tb[1], o.tb[0] + o.tb[2], o.tb[1] + o.tb[3]]);
      ops.push({ kind: 2, clip, name: S(o.n), alt: o.a ? S(o.a) : -1, tb: o.tb, inst, bbox: bb });
    }
  }
  const filters = data.filters.map(f => ({ name: S(f.name), state: f.state }));
  return { svgW: data.W, svgH: data.H, bg: 0xFFFFFFFF, strings, shapes, clips: clipShape, ops, filters };
}

(async () => {
  const check = process.argv.includes('--check');
  const data = await extract();
  const model = build(data);
  const gz = encode(model);
  if (check) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT) : null;
    if (!cur || !require('zlib').gunzipSync(cur).equals(require('zlib').gunzipSync(gz))) { console.error('metro_native.bin 이 현재 SVG 와 다르다 — node tools/metro-native/build.js 로 다시 만들어 커밋하세요'); process.exit(1); }
    console.log('metro_native.bin 최신'); return;
  }
  fs.writeFileSync(OUT, gz);
  const ml = model.ops.filter(o => o.kind === 2).length;
  console.log('ops', model.ops.length, '(라벨', ml + ')', 'shapes', model.shapes.length, 'clips', Object.keys(data.clips).length, 'filters', model.filters.length, '→', OUT, gz.length + ' bytes');
})().catch(e => { console.error(e); process.exit(1); });
