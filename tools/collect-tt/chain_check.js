// 선형 노선의 '선로 순서(가장 긴 열차의 정차 순서)'를 KRIC 열차별 정차에서 뽑고, 번들의 상/하 라벨이 그 순서 기준으로 일관된지 본다.
// 사용: node tools/collect-tt/chain_check.js <번들.json> <kric.json> <노선> <opr|ln,…>   (일관되면 한 줄 순서 방향 힌트를 만들 수 있다)
const fs = require('fs');
const [, , bp, kp, L, src] = process.argv; const SRC = new Set(src.split(','));
const d = JSON.parse(fs.readFileSync(bp, 'utf8')).data;
const nz = n => String(n || '').replace(/\(.*?\)/g, '').replace(/역$/, '').replace(/\s+/g, '').trim();
const toMin = s => { if (!s || s.length < 6) return null; let m = +s.slice(0, 2) * 60 + +s.slice(2, 4); if (m < 180) m += 1440; return m; };
const rows = JSON.parse(fs.readFileSync(kp, 'utf8')).filter(r => SRC.has(r.opr + '|' + r.ln) && r.day === '8');
const trains = {};
for (const r of rows) for (const ln of String(r.data).split('\n').filter(Boolean)) { const [trn, arr, dep] = ln.split(','); const t = toMin(dep) ?? toMin(arr); if (t == null) continue; (trains[trn] = trains[trn] || []).push({ st: nz(r.nm), t }); }
let best = null; for (const k in trains) { const a = trains[k].sort((x, y) => x.t - y.t); if (!best || a.length > best.length) best = a; }
const order = best.map(x => x.st);
const pairs = {}; for (const k in trains) { const a = trains[k]; for (let i = 0; i + 1 < a.length; i++) { if (a[i + 1].t - a[i].t > 20) continue; (pairs[a[i].st + '>' + a[i + 1].st] = pairs[a[i].st + '>' + a[i + 1].st] || []).push(a[i].t); } }
const dec = a => { let p = 0; return a.map(x => p += x); };
const idx = {}; order.forEach((n, i) => idx[n] = i);
const cnt = { 상: 0, 하: 0, '?': 0 }; const detail = [];
for (let i = 0; i + 1 < order.length; i++) {
  const A = order[i], B = order[i + 1], k = A + '>' + B; const rec = d._REAL_TT[L + '|' + A]; if (!rec || !rec.D || !pairs[k]) { cnt['?']++; continue; }
  const h = {}; for (const key of ['상', '하']) { const bt = rec.D[key] ? dec(rec.D[key]) : []; h[key] = pairs[k].filter(t => bt.some(x => Math.abs(x - t) <= 2)).length / pairs[k].length; }
  const tk = h['상'] > h['하'] + 0.1 ? '상' : h['하'] > h['상'] + 0.1 ? '하' : '?'; cnt[tk]++; detail.push([k, tk, Math.round(h['상'] * 100), Math.round(h['하'] * 100)]);
}
console.log(L, '선로 순서', order.length, '역:', order.join(','));
console.log('순서가 커지는 방향의 정답 키 — 상:', cnt['상'], '하:', cnt['하'], '불명:', cnt['?']);
const maj = cnt['상'] >= cnt['하'] ? '상' : '하'; console.log('다수:', maj, ' 어긋난 쌍:', detail.filter(x => x[1] !== maj).map(x => x.join(' ')).join(' | '));
