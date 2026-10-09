// TAGO 로 시험 수집한 서울 1~9·인천·김포 시각표(raw.json)를 지금 번들과 역·요일·방향별로 대조한다.
// 사용: node tools/collect-tt/compare_covered.js <base.json> <raw.json> [report.json]
const fs = require('fs');
const [baseP, rawP, outP] = process.argv.slice(2);
const base = JSON.parse(fs.readFileSync(baseP, 'utf8')), raw = JSON.parse(fs.readFileSync(rawP, 'utf8'));
const { NT_STNORDER } = require('../../engine/next-train-data.js');
const nz = n => String(n || '').replace(/\(.*?\)/g, '').replace(/역$/, '').replace(/\s+/g, '').trim();
const RT = base.data._REAL_TT;
const dec = a => { if (!a || !a.length) return []; const o = [a[0]]; for (let i = 1; i < a.length; i++) o.push(o[i - 1] + a[i]); return o; };
const toMin = s => { if (!s || s === '0' || !/^\d{6}$/.test(s)) return null; let m = (+s.slice(0, 2)) * 60 + (+s.slice(2, 4)); if (m < 180) m += 1440; return m; };
const COV = ['1호선', '2호선', '3호선', '4호선', '5호선', '6호선', '7호선', '8호선', '9호선', '인천1호선', '인천2호선', '김포골드라인'];
const lineOfRec = (r, id) => {   // 역 ID 접두로 노선 가리기
  const m = id.match(/^MTRS[19](\d)/); if (m) return m[1] + '호선';   // MTRS1+노선숫자(1~8), MTRS9+9(9호선)
  const k = id.match(/^MTRKR(\d)/); if (k) return k[1] + '호선';
  if (/^MTRGMG/.test(id)) return '김포골드라인';
  if (/^MTR(NU|IC|GU)/.test(id)) { const d = String(r.route).match(/^(\d)호선$/); return d ? d[1] + '호선' : null; }   // 서울 노선이 경기·인천으로 이어지는 구간
  return null;
};
const prefixes = {};
const rec = {};   // line|nm -> {D:{U,D}, W..., S...}
for (const id in raw) {
  const r = raw[id]; const p = id.replace(/\d+$/, '').slice(0, 7); prefixes[p + '|' + r.route] = (prefixes[p + '|' + r.route] || 0) + 1;
  let line = lineOfRec(r, id);
  if (!line) {   // 인천 등: 이름과 호선 숫자로 인천1/2 중 하나
    const c = /^인천[12]호선$/.test(String(r.route).replace(/\s+/g, '')) ? [String(r.route).replace(/\s+/g, '')] : [];
    line = c.find(l => NT_STNORDER[l] && NT_STNORDER[l].some(s => nz(s) === r.nm)) || null;
  }
  if (!line || !NT_STNORDER[line] || !NT_STNORDER[line].some(s => nz(s) === r.nm)) continue;
  const o = rec[line + '|' + r.nm] = rec[line + '|' + r.nm] || { id, tt: {} };
  const days = { D: '01', S: '02', W: '03' };
  for (const [dn, dc] of Object.entries(days)) for (const ud of ['U', 'D']) {
    const rows = (r.tt[dc + ud] || []).filter(x => nz(x[2]) !== r.nm);
    (o.tt[dn] = o.tt[dn] || {})[ud] = Array.from(new Set(rows.map(x => toMin((x[1] && x[1] !== '0') ? x[1] : x[0])).filter(x => x != null))).sort((a, b) => a - b);
  }
}
// 같은 열차인지: 초 단위를 분으로 자르는 방식 차이로 ±1분은 같은 열차로 본다(두 자료는 같은 원본 시각표). 순서대로 하나씩 짝짓기.
const jac = (a, b) => { let i = 0, j = 0, m = 0; while (i < a.length && j < b.length) { const d = a[i] - b[j]; if (Math.abs(d) <= 1) { m++; i++; j++; } else if (d < 0) i++; else j++; } const u = a.length + b.length - m; return u ? m / u : 1; };
const rep = { prefixes, lines: {}, worst: [] };
for (const l of COV) {
  const sts = NT_STNORDER[l].map(nz); const L = rep.lines[l] = { stations: sts.length, inBundle: 0, inTago: 0, cmp: 0, exact: 0, high: 0, swapped: 0, bundleOnly: 0, tagoOnly: 0, countDiff: 0, sumJ: 0, nTago: 0, nBundle: 0 };
  for (const nm of sts) {
    const b = RT[l + '|' + nm], t = rec[l + '|' + nm]; if (b) L.inBundle++; if (t) L.inTago++;
    if (!b || !t) { if (b && !t) L.bundleOnly++; if (t && !b) L.tagoOnly++; continue; }
    for (const dn of ['D', 'W']) {
      const bd = b[dn]; const td = t.tt[dn]; if (!bd || !td) continue;
      const B = { 상: dec(bd['상']), 하: dec(bd['하']) }, T = { U: td.U, D: td.D };
      // 방향 이름이 어느 쪽에 맞는지 — 둘 다 보고 더 맞는 쪽을 택하되 뒤집혔으면 센다
      const straight = jac(B['상'], T.U) + jac(B['하'], T.D), flipped = jac(B['상'], T.D) + jac(B['하'], T.U);
      const sw = flipped > straight + 0.2;
      const pairs = sw ? [[B['상'], T.D], [B['하'], T.U]] : [[B['상'], T.U], [B['하'], T.D]];
      for (const [x, y] of pairs) { if (!x.length && !y.length) continue; L.cmp++; const j = jac(x, y); const pd = L['day' + dn] = L['day' + dn] || { n: 0, s: 0, empT: 0 }; pd.n++; pd.s += j; if (!y.length) pd.empT++; L.sumJ += j; if (j === 1) L.exact++; if (j >= 0.9) L.high++; L.nTago += y.length; L.nBundle += x.length;
        if (Math.abs(x.length - y.length) > 0.1 * Math.max(x.length, y.length, 1)) L.countDiff++;
        if (j < 0.6) rep.worst.push({ line: l, st: nm, day: dn, j: +j.toFixed(2), nb: x.length, nt: y.length, sw }); }
      if (sw) L.swapped++;
    }
  }
  for (const k of ['dayD','dayW']) if (L[k]) { L[k].avg = +(L[k].s / L[k].n).toFixed(3); delete L[k].s; }
  L.avgJ = L.cmp ? +(L.sumJ / L.cmp).toFixed(3) : null; delete L.sumJ;
}
rep.worst.sort((a, b) => a.j - b.j); rep.worstN = rep.worst.length; rep.worst = rep.worst.slice(0, 40);
if (outP) fs.writeFileSync(outP, JSON.stringify(rep, null, 1));
console.log(JSON.stringify(rep.prefixes)); for (const l of COV) console.log(l, JSON.stringify(rep.lines[l])); console.log('worst', rep.worstN, JSON.stringify(rep.worst.slice(0, 15)));
