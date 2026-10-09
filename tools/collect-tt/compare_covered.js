// TAGO 로 수집한 서울 1~9·인천·김포 시각표(raw)를 지금 번들과 역·요일·방향별로 대조한다. (drift.js 가 불러 쓰고, 단독 실행도 된다)
// 단독: node tools/collect-tt/compare_covered.js <base.json> <raw.json> [report.json]
//   · 두 자료는 같은 원본이라 같은 열차를 초 단위 버림 차이로 ±1분 다르게 적는다 → ±1분은 같은 열차로 본다(순서대로 짝짓기).
//   · 일치도 = 짝지은 수 / 합집합 수. 3·5·6·8호선, 인천1호선, 김포골드라인은 0.94~0.99 로 맞는다(2026-10-09 실측).
const fs = require('fs'), crypto = require('crypto');
const { NT_STNORDER, NT_INCHEON_TT } = require('../../engine/next-train-data.js');
const nz = n => String(n || '').replace(/\(.*?\)/g, '').replace(/역$/, '').replace(/\s+/g, '').trim();
const COV = ['1호선', '2호선', '3호선', '4호선', '5호선', '6호선', '7호선', '8호선', '9호선', '인천1호선', '인천2호선', '김포골드라인'];
const dec = a => { if (!a || !a.length) return []; const o = [a[0]]; for (let i = 1; i < a.length; i++) o.push(o[i - 1] + a[i]); return o; };
const toMin = s => { if (!s || s === '0' || !/^\d{6}$/.test(s)) return null; let m = (+s.slice(0, 2)) * 60 + (+s.slice(2, 4)); if (m < 180) m += 1440; return m; };
const norm = a => Array.from(new Set((a || []).map(x => x % 1440))).sort((x, y) => x - y);
const lineOfRec = (r, id) => {   // 역 ID 접두로 노선 가리기 (TAGO 노선 이름이 '1호선'처럼 도시 구분이 없다)
  const m = id.match(/^MTRS[19](\d)/); if (m) return m[1] + '호선';   // MTRS1+노선숫자(1~8), MTRS9+9(9호선)
  const k = id.match(/^MTRKR(\d)/); if (k) return k[1] + '호선';
  if (/^MTRGMG/.test(id)) return '김포골드라인';
  if (/^MTR(NU|IC|GU)/.test(id)) { const d = String(r.route).match(/^(\d)호선$/); if (d) return d[1] + '호선'; }   // 서울 노선이 경기·인천으로 이어지는 구간
  const rt = String(r.route).replace(/\s+/g, ''); if (/^인천[12]호선$/.test(rt)) return rt;
  return null;
};
// TAGO raw → {line|역: {D:{U,D}, S, W}} (그 역이 종착인 열차는 뺌)
function tagoRecords(raw) {
  const rec = {}, prefixes = {};
  for (const id in raw) {
    const r = raw[id]; const p = id.replace(/\d+$/, '').slice(0, 7); prefixes[p + '|' + r.route] = (prefixes[p + '|' + r.route] || 0) + 1;
    const line = lineOfRec(r, id);
    if (!line || !NT_STNORDER[line] || !NT_STNORDER[line].some(s => nz(s) === r.nm)) continue;
    const o = rec[line + '|' + r.nm] = rec[line + '|' + r.nm] || { id, tt: {} };
    for (const [dn, dc] of Object.entries({ D: '01', S: '02', W: '03' })) for (const ud of ['U', 'D']) {
      const rows = (r.tt[dc + ud] || []).filter(x => nz(x[2]) !== r.nm);
      (o.tt[dn] = o.tt[dn] || {})[ud] = Array.from(new Set(rows.map(x => toMin((x[1] && x[1] !== '0') ? x[1] : x[0])).filter(x => x != null))).sort((a, b) => a - b);
    }
  }
  return { rec, prefixes };
}
const lineHash = (rec, l) => { const h = crypto.createHash('sha1'); for (const nm of NT_STNORDER[l].map(nz)) { const t = rec[l + '|' + nm]; h.update(nm + ':' + JSON.stringify(t ? t.tt : null) + ';'); } return h.digest('hex').slice(0, 16); };
const jac = (a, b) => { let i = 0, j = 0, m = 0; while (i < a.length && j < b.length) { const d = a[i] - b[j]; if (Math.abs(d) <= 1) { m++; i++; j++; } else if (d < 0) i++; else j++; } const u = a.length + b.length - m; return u ? m / u : 1; };
// 인천·김포는 _REAL_TT 가 아니라 따로 둔 표(엔진 내장 NT_INCHEON_TT, 번들 _GIMPO_TT)를 쓴다 — 같은 모양으로 맞춘다.
function altOf(base, l, nm) {
  if (l === '김포골드라인') { const g = base.data._GIMPO_TT && base.data._GIMPO_TT[nm]; if (!g) return null; const f = a => norm((a || []).map(x => x[0] * 60 + x[1])); return { D: { 상: f(g.up.wd), 하: f(g.down.wd) }, W: { 상: f(g.up.hd), 하: f(g.down.hd) } }; }
  const t = NT_INCHEON_TT[l] && NT_INCHEON_TT[l][nm]; if (!t) return null;
  return { D: { 상: norm(t['평일상']), 하: norm(t['평일하']) }, W: { 상: norm(t['휴일상']), 하: norm(t['휴일하']) } };
}
function compare(base, raw) {
  const RT = base.data._REAL_TT; const { rec, prefixes } = tagoRecords(raw);
  const rep = { prefixes, lines: {}, worst: [] };
  for (const l of COV) {
    const sts = NT_STNORDER[l].map(nz);
    const L = rep.lines[l] = { stations: sts.length, inBundle: 0, inTago: 0, cmp: 0, high: 0, swapped: 0, bundleOnly: 0, tagoOnly: 0, nTago: 0, nBundle: 0, hash: lineHash(rec, l), D: { n: 0, s: 0, empT: 0 }, W: { n: 0, s: 0, empT: 0 }, minCount: 1 };
    for (const nm of sts) {
      const t = rec[l + '|' + nm]; const rt = RT[l + '|' + nm];
      const alt = (!rt && /^인천|^김포/.test(l)) ? altOf(base, l, nm) : null;
      if (rt || alt) L.inBundle++; if (t) L.inTago++;
      if (!(rt || alt) || !t) { if ((rt || alt) && !t) L.bundleOnly++; if (t && !(rt || alt)) L.tagoOnly++; continue; }
      for (const dn of ['D', 'W']) {
        const td = t.tt[dn]; if (!td) continue;
        const B = alt ? alt[dn] : (rt[dn] ? { 상: norm(dec(rt[dn]['상'])), 하: norm(dec(rt[dn]['하'])) } : null); if (!B) continue;
        const T = { U: norm(td.U), D: norm(td.D) };
        // 방향 이름이 어느 쪽에 맞는지 — 뒤집혀 있으면 뒤집어 짝짓는다(상/하 이름은 비교 대상이 아니라 시각표 내용이 같은지가 대상)
        const sw = (jac(B['상'], T.D) + jac(B['하'], T.U)) > (jac(B['상'], T.U) + jac(B['하'], T.D)) + 0.2;
        const pairs = sw ? [[B['상'], T.D], [B['하'], T.U]] : [[B['상'], T.U], [B['하'], T.D]];
        if (sw) { L.swapped++; (L.swList = L.swList || []).push(nm + ':' + dn); }
        for (const [x, y] of pairs) {
          if (!x.length && !y.length) continue;
          L.cmp++; const j = jac(x, y); const pd = L[dn]; pd.n++; pd.s += j; if (!y.length) pd.empT++; if (j >= 0.9) L.high++;
          L.nTago += y.length; L.nBundle += x.length; if (x.length >= 20) L.minCount = Math.min(L.minCount, y.length / x.length);
          if (j < 0.6) rep.worst.push({ line: l, st: nm, day: dn, j: +j.toFixed(2), nb: x.length, nt: y.length, sw });
        }
      }
    }
    for (const k of ['D', 'W']) { const d = L[k]; d.avg = d.n ? +(d.s / d.n).toFixed(3) : null; d.empShare = d.n ? +(d.empT / d.n).toFixed(2) : null; delete d.s; }
    L.minCount = +L.minCount.toFixed(2); L.avgJ = L.cmp ? +((L.D.avg * L.D.n + L.W.avg * L.W.n) / (L.D.n + L.W.n)).toFixed(3) : null;
  }
  rep.worst.sort((a, b) => a.j - b.j); rep.worstN = rep.worst.length; rep.worst = rep.worst.slice(0, 40);
  return rep;
}
module.exports = { compare, tagoRecords, COV, lineHash };
if (require.main === module) {
  const [baseP, rawP, outP] = process.argv.slice(2);
  const rep = compare(JSON.parse(fs.readFileSync(baseP, 'utf8')), JSON.parse(fs.readFileSync(rawP, 'utf8')));
  if (outP) fs.writeFileSync(outP, JSON.stringify(rep, null, 1));
  for (const l of COV) { const L = rep.lines[l]; console.log(l, '역 번들' + L.inBundle + '/TAGO' + L.inTago + '/전체' + L.stations, '평일 ' + L.D.avg + (L.D.empShare ? '(TAGO 빈 ' + L.D.empShare + ')' : ''), '휴일 ' + L.W.avg + (L.W.empShare ? '(TAGO 빈 ' + L.W.empShare + ')' : ''), '편수비 최소 ' + L.minCount); }
}
