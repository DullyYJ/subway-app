// 방향 판정 정답 대조: TAGO 행의 '종착역'으로 알아낸 방향(U/D가 가는 쪽)과 엔진의 segDir 결과를 인접 역쌍마다 비교한다.
// 사용: node tools/collect-tt/orient_check.js <번들.json> <raw1.json> [raw2.json …]   (번들 옆의 .order.json 필요)
const fs = require('fs'), path = require('path');
const W = require(path.join(__dirname, '..', '..', 'test', 'helpers', 'nt_load'))();
const bundle = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const d = bundle.data;
const order = JSON.parse(fs.readFileSync(process.argv[2].replace(/\.json$/, '') + '.order.json', 'utf8'));
const nz = n => String(n || '').replace(/\(.*?\)/g, '').replace(/역$/, '').replace(/\s+/g, '').trim();
const nt = W.ntCreate({ _REAL_TT: d._REAL_TT, _GIMPO_TT: d._GIMPO_TT, _BUILTIN_TT: d._BUILTIN_TT, LINE_SCHEDULE: d.LINE_SCHEDULE, _REAL_SEG: d._REAL_SEG, _TT_ORDER_HARD: d._TT_ORDER_HARD, _TT_ORIENT: d._TT_ORIENT, _INCHEON_TT: W.NT_INCHEON_TT, STNORDER: W.NT_STNORDER });
const rec = {};   // line -> nm -> {U:{end:count}, D:{…}}
for (const f of process.argv.slice(3)) { const raw = JSON.parse(fs.readFileSync(f)); for (const id in raw) { const r = raw[id]; const o = ((rec[r.line] = rec[r.line] || {})[r.nm] = {}); for (const ud of ['U', 'D']) { o[ud] = {}; (r.tt['01' + ud] || []).forEach(x => { const e = nz(x[2]); o[ud][e] = (o[ud][e] || 0) + 1; }); } } }
const MSS = [Date.UTC(2026, 9, 14, 4, 0), Date.UTC(2026, 9, 17, 4, 0), Date.UTC(2026, 9, 18, 4, 0)];   // 평일·토·일
let totalBad = 0;
for (const l in order) {
  const o = order[l], idx = {}; o.forEach((n, i) => idx[n] = i);
  // 각 역에서 U 열차가 가는 쪽(종착역이 낮은/높은 번호 쪽)
  const side = (nm, ud) => { let lo = 0, hi = 0; const c = (rec[l] || {})[nm]; if (!c) return 0; for (const e in c[ud]) { if (idx[e] == null) continue; if (idx[e] < idx[nm]) lo += c[ud][e]; else if (idx[e] > idx[nm]) hi += c[ud][e]; } return hi > lo ? 1 : lo > hi ? -1 : 0; };
  let n = 0, bad = 0, skip = 0, nul = 0; const badList = [];
  for (let i = 0; i + 1 < o.length; i++) {
    const a = o[i], b = o[i + 1]; if (!d._REAL_TT[l + '|' + a] || !d._REAL_TT[l + '|' + b]) { skip++; continue; }
    const sa = side(a, 'U'), sb = side(b, 'U'); if (!sa || sa !== sb) { skip++; continue; }       // 두 역의 U 방향이 확실히 같을 때만 정답으로 쓴다
    for (const [x, y, fw] of [[a, b, true], [b, a, false]]) {
      const truth = (fw ? sa > 0 : sa < 0) ? '상행' : '하행';      // x→y 가 U 가 가는 쪽이면 상행(U)
      let got = null, gotAll = []; for (const ms of MSS) gotAll.push(nt.segDir(l, [{ stationName: x }, { stationName: y }], ms)); n++;
      got = gotAll.every(g => g === gotAll[0]) ? gotAll[0] : (gotAll.find(g => g !== truth) || gotAll[0]);   // 요일 중 하나라도 틀리면 틀린 것으로
      if (!got) { nul++; badList.push(x + '→' + y + ' 판정없음'); } else if (got !== truth) { bad++; badList.push(x + '→' + y); }
    }
  }
  totalBad += bad + nul;
  console.log((bad + nul ? 'CHECK ' : 'OK    ') + l.padEnd(8) + ' 비교 ' + n + ' 틀림 ' + bad + ' 판정없음 ' + nul + ' 제외 ' + skip + (badList.length ? ' → ' + badList.slice(0, 8).join(', ') : ''));
}
process.exit(totalBad ? 1 : 0);
