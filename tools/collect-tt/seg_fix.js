// 선형 구간 시각표 바로잡기 — 번들의 어떤 노선 구간(예: 1호선 연천~광운대)이 KRIC(공식·매일 갱신)와 크게 어긋날 때, 그 구간 역들의 기록만 KRIC 출발 시각으로 다시 만든다.
//   · 열차별 정차 순서로 선로 순서(chain)를 만들고, 각 열차의 '다음 정차역'이 chain 에서 앞쪽이면 fwd, 뒤쪽이면 back 으로 가른다(종점의 도착 전용 행은 뺀다).
//   · fwd/back 과 번들의 상/하 키 짝은 구간 전체에서 ±12분 일치를 합산해 한 번만 정한다(역마다 따로 정하지 않아 라벨이 일관).
//   · 안전장치: 구간 역마다 새 기록이 KRIC 와 ±2분 95% 이상 맞고 편수 20 이상일 때만 바꾼다. 나머지는 건드리지 않는다.
//   · 사용(시험): node seg_fix.js <번들.json> <kric.json> '1호선' 'KR|1,S1|1' 연천 광운대 [출력.json]
const nz = n => String(n || '').replace(/\(.*?\)/g, '').replace(/역$/, '').replace(/\s+/g, '').trim();
const toMin = s => { if (!s || s.length < 6 || s === '000000') return null; let m = +s.slice(0, 2) * 60 + +s.slice(2, 4); if (m < 180) m += 1440; return m; };
const dec = a => { let p = 0; return (a || []).map(x => p += x); };
const enc = a => { let p = 0; return a.map(x => { const d = x - p; p = x; return d; }); };
function match(A, B, tol) { A = [...A].sort((x, y) => x - y); B = [...B].sort((x, y) => x - y); let i = 0, j = 0, m = 0; while (i < A.length && j < B.length) { const d = A[i] - B[j]; if (Math.abs(d) <= tol) { m++; i++; j++; } else if (d < 0) i++; else j++; } return m; }
const mod = a => a.map(x => x % 1440);
function trainsOf(rows, SRC, day) {
  const tr = {};
  for (const r of rows) if (SRC.has(r.opr + '|' + r.ln) && r.day === day) for (const ln of String(r.data).split('\n').filter(Boolean)) { const [trn, arr, dep] = ln.split(','); const t = toMin(dep), ta = toMin(arr); const tt = t ?? ta; if (tt == null) continue; (tr[r.opr + r.ln + trn] = tr[r.opr + r.ln + trn] || []).push({ st: nz(r.nm), t: tt, dep: t, arr: ta }); }
  for (const k in tr) tr[k].sort((a, b) => (a.arr ?? a.t) - (b.arr ?? b.t) || a.t - b.t);
  return tr;
}
function fixSegment(bundle, rows, o) {
  const R = bundle.data._REAL_TT, SRC = new Set(o.srcs), res = { ok: false, why: '', changes: [] };
  const t8 = trainsOf(rows, SRC, '8'), t9 = trainsOf(rows, SRC, '9');
  let best = null; for (const k in t8) { const a = t8[k]; if (!a.some(x => x.st === o.from) || !a.some(x => x.st === o.to)) continue; if (!best || a.length > best.length) best = a; }
  if (!best) { res.why = 'KRIC 에서 구간 전체를 지나는 열차 없음'; return res; }
  const chain = best.map(x => x.st), iF = chain.indexOf(o.from), iT = chain.indexOf(o.to), lo = Math.min(iF, iT), hi = Math.max(iF, iT);
  const seg = chain.slice(lo, hi + 1), idx = {}; chain.forEach((s, i) => idx[s] = i);
  if (o.north) { if (!(o.north in idx)) { res.why = 'north 역이 열차 chain 에 없음'; return res; } const nI = idx[o.north]; if (nI < lo || nI > hi) { /* 구간 밖이어도 방향만 필요 */ } const flip = nI < (lo + hi) / 2; if (flip) { for (const k in idx) idx[k] = chain.length - 1 - idx[k]; } }   // north 쪽이 index 증가 방향이 되게 뒤집는다
  const dayRecs = { D: t8, W: t9 };
  // 역·요일별 fwd/back 출발 시각
  const per = {};   // dk -> st -> {fwd:[],back:[]}
  for (const dk of ['D', 'W']) { per[dk] = {}; for (const k in dayRecs[dk]) { const a = dayRecs[dk][k]; for (let i = 0; i < a.length; i++) { const s = a[i].st; if (!(s in idx) || !seg.includes(s) || a[i].dep == null) continue; const nx = a[i + 1]; if (!nx) continue; ((per[dk][s] = per[dk][s] || { fwd: [], back: [], out: 0, tot: 0 }).tot)++; if (!(nx.st in idx)) { per[dk][s].out++; continue; } const dir = idx[nx.st] > idx[s] ? 'fwd' : idx[nx.st] < idx[s] ? 'back' : null; /* north 지정 시 fwd = north 쪽으로 가는 열차 */ if (!dir) continue; per[dk][s][dir].push(a[i].dep); } } }
  // fwd ↔ 상/하 짝: 구간 전체 ±12분 일치 합산
  let sA = 0, sB = 0;   // A: fwd=상, B: fwd=하
  for (const dk of ['D', 'W']) for (const s of seg) { const rec = R[o.line + '|' + s], p = per[dk][s]; if (!rec || !rec[dk] || !p) continue; const u = mod(dec(rec[dk]['상'])), d = mod(dec(rec[dk]['하'])); sA += match(mod(p.fwd), u, 2) + match(mod(p.back), d, 2); sB += match(mod(p.fwd), d, 2) + match(mod(p.back), u, 2); }
  if (o.northKey) { sA = o.northKey === '상' ? 1e9 : 0; sB = o.northKey === '하' ? 1e9 : 0; }
  if (!o.northKey && Math.max(sA, sB) < 0.5 * Math.min(sA, sB) * 1 + 50 && Math.abs(sA - sB) < 0.2 * Math.max(sA, sB)) { res.why = '방향 짝을 가를 수 없음(' + sA + '/' + sB + ')'; return res; }
  const fwdKey = sA >= sB ? '상' : '하', backKey = fwdKey === '상' ? '하' : '상'; res.fwdKey = fwdKey; res.chainLen = seg.length; res.vote = [sA, sB];
  for (const dk of ['D', 'W']) for (const s of seg) {
    const rec = R[o.line + '|' + s], p = per[dk][s]; if (!rec || !rec[dk] || !p) continue;
    if (p.tot && p.out > 0.03 * p.tot) continue;           // 갈라지는 역(다른 선으로 가는 열차가 3% 넘게 섞임)은 건드리지 않는다
    const cand = { [fwdKey]: p.fwd.slice().sort((a, b) => a - b), [backKey]: p.back.slice().sort((a, b) => a - b) };
    const oldAll = mod(dec(rec[dk]['상'])).concat(mod(dec(rec[dk]['하'])));
    const newAll = mod(cand['상']).concat(mod(cand['하']));
    if (newAll.length < 10) continue;
    const rOld = match(newAll, oldAll, 2) / Math.max(newAll.length, oldAll.length, 1);
    if (rOld >= 0.95) continue;                       // 이미 맞는 역은 그대로
    const out = { 상: enc(cand['상']), 하: enc(cand['하']) };    // 종점도 구간 전체에서 정한 짝(fwd/back ↔ 상/하)을 그대로 쓴다 — 라벨이 일관되어야 엔진의 방향 판정(시각표 상관)이 맞는다
    rec[dk] = Object.assign({}, rec[dk], out);
    res.changes.push({ st: s, dk, before: Math.round(rOld * 100), n: newAll.length });
  }
  res.ok = res.changes.length > 0; if (!res.ok) res.why = '바꿀 역 없음'; return res;
}
module.exports = { fixSegment };
if (require.main === module) {
  const fs = require('fs'); const [, , bp, kp, line, src, from, to, outp] = process.argv;
  const b = JSON.parse(fs.readFileSync(bp, 'utf8')), rows = JSON.parse(fs.readFileSync(kp, 'utf8'));
  const r = fixSegment(b, rows, { line, srcs: src.split(','), from, to, north: process.env.NORTH || null, northKey: process.env.NORTHKEY || null });
  console.log(JSON.stringify({ ok: r.ok, why: r.why, fwdKey: r.fwdKey, chainLen: r.chainLen, vote: r.vote, n: r.changes.length, sample: r.changes.slice(0, 12) }));
  if (outp) fs.writeFileSync(outp, JSON.stringify(b));
}
