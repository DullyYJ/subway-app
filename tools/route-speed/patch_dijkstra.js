// 경로 엔진 속도 패치 1: dijkstra 탐색 루프의 자료구조 교체 (결과 동일 — 엣지 순회 순서·힙 비교 순서·갱신 조건을 그대로 이식)
// 사용: node patch_dijkstra.js in.js out.js
const fs = require('fs');
let s = fs.readFileSync(process.argv[2], 'utf8');
function rep(a, b) { const n = s.split(a).length - 1; if (n !== 1) throw new Error('anchor ' + n + ': ' + a.slice(0, 60)); s = s.replace(a, () => b); }

// 1) 전역 자료구조(함수 dijkstra 바로 앞)
rep('function dijkstra(G, busCoord, busNm, sLat, sLng, eLat, eLng, mode, opt) {\n',
`// ===== 속도 패치: 노드 문자열 → 정수 상태 (dijkstra 전용) =====
var DJ_IDS = new Map(), DJ_NAMES = [];
function djId(name) {
  var i = DJ_IDS.get(name);
  if (i === void 0) { i = DJ_NAMES.length; DJ_NAMES.push(name); DJ_IDS.set(name, i); }
  return i;
}
var DJ_CAP = 0, DJ_DIST = null, DJ_STAMP = null, DJ_PREV = null, DJ_PK = null, DJ_PL = null, DJ_CUR = 0;
var DJ_HCAP = 0, DJ_HP = null, DJ_HV = null;
function djEnsure(n) {
  if (n <= DJ_CAP) return;
  var c = Math.max(n + 1024, DJ_CAP * 2, 1 << 17);
  var d = new Float64Array(c), st = new Int32Array(c), pv = new Int32Array(c), pk = new Array(c), pl = new Array(c);
  if (DJ_CAP) { d.set(DJ_DIST); st.set(DJ_STAMP); pv.set(DJ_PREV); for (var i = 0; i < DJ_CAP; i++) { pk[i] = DJ_PK[i]; pl[i] = DJ_PL[i]; } }
  DJ_DIST = d; DJ_STAMP = st; DJ_PREV = pv; DJ_PK = pk; DJ_PL = pl; DJ_CAP = c;
}
function djHeapEnsure(n) {
  if (n <= DJ_HCAP) return;
  var c = Math.max(n + 1024, DJ_HCAP * 2, 1 << 16);
  var p = new Float64Array(c), v = new Int32Array(c);
  if (DJ_HCAP) { p.set(DJ_HP); v.set(DJ_HV); }
  DJ_HP = p; DJ_HV = v; DJ_HCAP = c;
}
function dijkstra(G, busCoord, busNm, sLat, sLng, eLat, eLng, mode, opt) {
`);

// 2) 탐색 루프 교체
const A0 = '  const dist = {}, prev = {}, pk = {}, pl = {};\n  const pq = new MinHeap();\n';
const A1 = '  if (!best) return null;\n  const path = [];\n  let c = best;\n  while (c !== void 0) {\n    path.unshift(c);\n    c = prev[c];\n  }\n';
const i0 = s.indexOf(A0), i1 = s.indexOf(A1);
if (i0 < 0 || i1 < 0 || s.indexOf(A0, i0 + 1) >= 0 || i1 < i0) throw new Error('loop anchors');
const NEW = `  // ★ 속도 패치: dist/prev/pk/pl 을 정수 상태(노드*2+단계) 배열로, 힙을 평행 배열로. 순회·비교 순서는 원본과 동일.
  djEnsure(DJ_NAMES.length * 2 + 4096);
  const _cur = ++DJ_CUR;
  let dA = DJ_DIST, stamp = DJ_STAMP, prevA = DJ_PREV, pkA = DJ_PK, plA = DJ_PL, cap = DJ_CAP;
  let hP = null, hV = null, hn = 0;
  djHeapEnsure(1 << 16); hP = DJ_HP; hV = DJ_HV;
  const hpush = (p, v) => {
    if (hn >= DJ_HCAP) { djHeapEnsure(hn + 1); hP = DJ_HP; hV = DJ_HV; }
    let i = hn++;
    while (i > 0) {
      const par = i - 1 >> 1;
      if (hP[par] <= p) break;
      hP[i] = hP[par]; hV[i] = hV[par];
      i = par;
    }
    hP[i] = p; hV[i] = v;
  };
  for (const [s, w] of starts) {
    if (noS && isSub(s)) continue;
    const s0 = djId(s) * 2;
    if (s0 >= cap) { djEnsure(s0 + 2); dA = DJ_DIST; stamp = DJ_STAMP; prevA = DJ_PREV; pkA = DJ_PK; plA = DJ_PL; cap = DJ_CAP; }
    if (stamp[s0] !== _cur || w * wpen < dA[s0]) {
      stamp[s0] = _cur;
      dA[s0] = w * wpen;
      prevA[s0] = -1;
      pkA[s0] = "access";
      plA[s0] = void 0;
      hpush(dA[s0], s0);
    }
  }
  let best = -1, bd = 1e9;
  const _stopIds = new Map();
  const gI = new Map();
  for (const g in gmap) gI.set(djId(g), gmap[g]);
  const _hasG = gI.size > 0;
  if (G.__adjAOf !== adj) { G.__adjAOf = adj; G.__adjA = []; }
  const adjA = G.__adjA;
  const _live = G.live;
  let _pure = !G.rtw && !G.accessSec;
  if (_pure && _live) { for (const _k in _live) { _pure = false; break; } }
  let _bwM = null;
  if (_pure) { _bwM = G.__bwM2 || (G.__bwM2 = new Map()); } else if (G.__bwM2) G.__bwM2 = null;
  while (hn > 0) {
    const d = hP[0], u = hV[0];
    {
      const lp = hP[hn - 1], lv = hV[hn - 1];
      hn--;
      if (hn > 0) {
        const n = hn;
        let i = 0;
        for (; ; ) {
          const l = 2 * i + 1, r = l + 1;
          let m = i, pm = lp;
          if (l < n && hP[l] < pm) { m = l; pm = hP[l]; }
          if (r < n && hP[r] < pm) { m = r; }
          if (m === i) break;
          hP[i] = hP[m]; hV[i] = hV[m];
          i = m;
        }
        hP[i] = lp; hV[i] = lv;
      }
    }
    DJ_STAT.pops++;
    if (d > dA[u]) continue;
    if (cutoff !== null && best === -1 && d > cutoff) {
      G.__djPruned = true;
      break;
    }
    const un = u >> 1, ust = mustS ? u & 1 : 0;
    const ub = DJ_NAMES[un];
    const _gw = _hasG ? gI.get(un) : void 0;
    if (_gw !== void 0 && (!mustS || ust === 1) && !(noS && isSub(ub))) {
      const t = d + _gw * wpen;
      if (t < bd) {
        bd = t;
        best = u;
      }
    }
    if (d > bd) break;
    let _ul = adjA[un];
    if (_ul === void 0) { _ul = adj[ub] || null; adjA[un] = _ul; }
    if (!_ul) continue;
    for (let _ei = 0; _ei < _ul.length; _ei++) {
      const e = _ul[_ei];
      const ek = e.kind;
      const ride = ek === "ride" || ek === "sub-xfer" || ek === "xpress";
      if (noS && (ride || isSub(e.to))) continue;
      if (ride && G.subOff && G.subOff.has(e.line)) continue;
      if (nearIds && ust === 0 && (ek === "ride" || ek === "sub-xfer" || ek === "xpress")) {
        if (!(isSub(ub) && nearIds.has(ub.slice(2)))) continue;
      }
      const isW = ek === "walk";
      const isX = ek === "sub-xfer" || ek === "walk";
      const busXfer = ek === "bus" && pkA[u] === "bus" && plA[u] !== e.line;
      const board = ek === "bus" && (pkA[u] !== "bus" || busXfer);
      let bw = 0;
      if (board) {
        if (_bwM !== null) {
          if (e.bwE === _bwM) { G.__waitSrc = e.bwS; bw = e.bwV; }
          else {
            let _sid = _stopIds.get(un);
            if (_sid === void 0) { _sid = stopIdOf(ub); _stopIds.set(un, _sid); }
            bw = busWaitAt(G, e.line, _sid);
            e.bwE = _bwM; e.bwV = bw; e.bwS = G.__waitSrc;
          }
        } else {
          let _sid = _stopIds.get(un);
          if (_sid === void 0) { _sid = stopIdOf(ub); _stopIds.set(un, _sid); }
          bw = busWaitAt(G, e.line, _sid);
        }
      }
      let xw = 0, ew = e.w;
      if (ek === "xpress") {
        const _xw = xpWait(G, e, d);
        if (_xw == null) continue;
        ew = XP_LAST_HOP;
        xw = Math.max(0, _xw - (e.bw || XP_BASE_WAIT));
      }
      const nd = d + (isW ? ew * wpen : ew) + (isX || busXfer ? xpen : 0) + bw + xw;
      let ti = e.ti;
      if (ti === void 0) { ti = djId(e.to); e.ti = ti; }
      const to = ti * 2 + (mustS ? ride ? 1 : ust : 0);
      if (to >= cap) { djEnsure(to + 2); dA = DJ_DIST; stamp = DJ_STAMP; prevA = DJ_PREV; pkA = DJ_PK; plA = DJ_PL; cap = DJ_CAP; }
      if (stamp[to] !== _cur || nd < dA[to]) {
        stamp[to] = _cur;
        dA[to] = nd;
        prevA[to] = u;
        pkA[to] = ek;
        plA[to] = e.line;
        hpush(nd, to);
      }
    }
  }
  if (best === -1) return null;
  const _encS = (st) => mustS ? DJ_NAMES[st >> 1] + "#" + (st & 1) : DJ_NAMES[st >> 1];
  const _pathI = [];
  for (let c0 = best; c0 !== -1; c0 = prevA[c0]) _pathI.push(c0);
  _pathI.reverse();
  const path = _pathI.map(_encS);
  const dist = {}, pk = {}, pl = {};
  for (let i = 0; i < _pathI.length; i++) { const k = path[i], st = _pathI[i]; dist[k] = dA[st]; pk[k] = pkA[st]; pl[k] = plA[st]; }
  best = path[path.length - 1];
`;
s = s.slice(0, i0) + NEW + s.slice(i1 + A1.length);
fs.writeFileSync(process.argv[3], s);
console.log('ok');
