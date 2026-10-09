// 방향 힌트(_TT_ORIENT)의 역 순서가 실제 선로 순서인지 점검한다. 기준 = 번들의 _REAL_SEG(실측 역간 인접 관계).
//   · 순서의 이웃한 두 역이 _REAL_SEG 에서 인접이거나, 사이 역이 순서에 없어서(자료에 없는 역) 둘 사이 한 칸 건너 이웃이면 통과.
//   · 통과하지 못한 이웃쌍이 있으면 그 노선의 힌트는 믿을 수 없다(역 번호 순서가 선로 순서와 다르다는 뜻).
// 사용: node tools/collect-tt/orient_audit.js <번들.json> [노선,노선…]
const fs = require('fs');
const nz = n => String(n || '').replace(/\(.*?\)/g, '').replace(/역$/, '').replace(/\s+/g, '').trim();
function adjOf(bundle, line) {
  const adj = {}; for (const k in (bundle.data._REAL_SEG || {})) { const p = k.split('|'); if (p[0] !== line) continue; const a = nz(p[1]), b = nz(p[2]); (adj[a] = adj[a] || new Set()).add(b); (adj[b] = adj[b] || new Set()).add(a); }
  return adj;
}
function audit(bundle, line, order) {
  const adj = adjOf(bundle, line); const inOrder = new Set(order); const bad = [];
  if (!Object.keys(adj).length) return { checked: false, bad: [], pairs: 0, noSeg: true };
  for (let i = 0; i + 1 < order.length; i++) {
    const a = order[i], b = order[i + 1]; const A = adj[a], B = adj[b];
    if (A && A.has(b)) continue;
    if (A && B && [...A].some(c => !inOrder.has(c) && B.has(c))) continue;      // 사이에 자료에 없는 역이 하나 있는 경우
    bad.push(a + '→' + b);
  }
  return { checked: true, bad, pairs: order.length - 1 };
}
module.exports = { audit };
if (require.main === module) {
  const b = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const only = (process.argv[3] || '').split(',').filter(Boolean);
  for (const l of Object.keys(b.data._TT_ORIENT)) { if (only.length && !only.includes(l)) continue; const r = audit(b, l, b.data._TT_ORIENT[l].order.map(nz)); console.log(l.padEnd(8), r.noSeg ? '(실측 인접자료 없음)' : (r.bad.length ? 'X ' + r.bad.length + '/' + r.pairs + ' ' + r.bad.join(', ') : 'OK ' + r.pairs + '쌍')); }
}
