// 속도 패치 3: addBus 결과 재사용 — 같은 정류장 행 묶음(rows 배열 동일)·같은 분(分)·같은 요일이면 엣지/노선표를 다시 만들지 않는다.
// addBus 는 G.adj 에 엣지를 '덧붙이기'만 하고(읽지 않음) 다른 곳에서 엣지·노선표를 수정하지 않으므로, 임시 G 에 만들어 둔 뒤 요청마다 덧붙이면 동일하다.
const fs = require('fs');
let s = fs.readFileSync(process.argv[2], 'utf8');
function rep(a, b) { const n = s.split(a).length - 1; if (n !== 1) throw new Error('anchor ' + n + ': ' + a.slice(0, 70)); s = s.replace(a, () => b); }
rep('function addBus(G, rows, B) {\n', `var AB_MEMO = [];
function addBus(G, rows, B) {
  if (!G || G._baseMs == null || !rows || !rows.length || !G.ST) return addBusRaw(G, rows, B);
  const _t = new Date(G._baseMs + 324e5);
  const nowMin = _t.getUTCHours() * 60 + _t.getUTCMinutes(), dow = _t.getUTCDay();
  let hit = null;
  for (let i = 0; i < AB_MEMO.length; i++) {
    const m = AB_MEMO[i];
    if (m.rows === rows && m.len === rows.length && m.B === B && m.ST === G.ST && m.nowMin === nowMin && m.dow === dow) { hit = m; AB_MEMO.splice(i, 1); AB_MEMO.unshift(m); break; }
  }
  if (!hit) {
    const G2 = { adj: Object.create(null), ST: G.ST, _baseMs: G._baseMs };
    const ret = addBusRaw(G2, rows, B);
    const f = {};
    for (const k in G2) if (k !== "adj" && k !== "ST" && k !== "_baseMs") f[k] = G2[k];
    hit = { rows, len: rows.length, B, ST: G.ST, nowMin, dow, add: G2.adj, f, ret };
    AB_MEMO.unshift(hit);
    if (AB_MEMO.length > 2) AB_MEMO.length = 2;
  }
  const adj = G.adj, add = hit.add;
  for (const k in add) {
    const L = add[k], cur = adj[k];
    if (cur === void 0) adj[k] = L;
    else for (let i = 0; i < L.length; i++) cur.push(L[i]);
  }
  for (const k in hit.f) G[k] = hit.f[k];
  return hit.ret;
}
__name(addBus, "addBus");
function addBusRaw(G, rows, B) {
`);
fs.writeFileSync(process.argv[3], s);
console.log('ok3');
