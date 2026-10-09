// 새 번들 검증: 노선별로 (1) 인접 역쌍의 방향 판정이 서로 반대이고 노선 전체에서 일관되는지 (2) 평일/휴일 낮 시간 다음 열차가 있는지 (3) 대기시간이 합리적인지.
// 사용: node tools/collect-tt/validate_tt.js <번들.json> [노선,노선…]
const fs = require('fs'), path = require('path');
const W = require(path.join(__dirname, '..', '..', 'test', 'helpers', 'nt_load'))();
const bundle = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const d = bundle.data;
const idOrder = fs.existsSync(process.argv[2].replace(/\.json$/, '') + '.order.json') ? JSON.parse(fs.readFileSync(process.argv[2].replace(/\.json$/, '') + '.order.json', 'utf8')) : {};
const only = (process.argv[3] || '').split(',').filter(Boolean);
const nt = W.ntCreate({ _REAL_TT: d._REAL_TT, _GIMPO_TT: d._GIMPO_TT, _BUILTIN_TT: d._BUILTIN_TT, LINE_SCHEDULE: d.LINE_SCHEDULE, _REAL_SEG: d._REAL_SEG, _TT_ORDER_HARD: d._TT_ORDER_HARD, _TT_ORIENT: d._TT_ORIENT, _INCHEON_TT: W.NT_INCHEON_TT, STNORDER: W.NT_STNORDER });
const nz = n => String(n || '').replace(/\(.*?\)/g, '').replace(/역$/, '').replace(/\s+/g, '').trim();
const lines = Object.keys(W.NT_STNORDER).filter(l => Object.keys(d._REAL_TT).some(k => k.startsWith(l + '|')) && (!only.length || only.includes(l)) && !/^[1-9]호선$|^인천/.test(l));
const KST = (y, mo, dd, h, mi) => Date.UTC(y, mo - 1, dd, h - 9, mi);
const days = { 평일: KST(2026, 10, 14, 13, 0), 토요일: KST(2026, 10, 17, 13, 0), 일요일: KST(2026, 10, 18, 13, 0) };
let bad = 0;
for (const l of lines) {
  const ord = (idOrder[l] || W.NT_STNORDER[l].map(nz)).filter(n => d._REAL_TT[l + '|' + n]);   // 순서: TAGO 역 ID 순(있으면)
  const res = { 쌍: 0, 반대아님: 0, 순방향상: 0, 순방향하: 0, 방향없음: 0 };
  for (let i = 0; i + 1 < ord.length; i++) {
    const a = ord[i], b = ord[i + 1];
    const f = nt.segDir(l, [{ stationName: a }, { stationName: b }], days.평일), r = nt.segDir(l, [{ stationName: b }, { stationName: a }], days.평일);
    res.쌍++; if (!f || !r) { res.방향없음++; continue; } if (f === r) res.반대아님++; else if (f === '상행') res.순방향상++; else res.순방향하++;
  }
  const dom = Math.max(res.순방향상, res.순방향하), tot = res.순방향상 + res.순방향하;
  const incons = tot - dom;
  const w = {}; const nodata = [];
  for (const [dn, ms] of Object.entries(days)) {
    const waits = [];
    for (const s of ord) { const info = nt.metroInfo({ line: l, from: s, to: ord[Math.min(ord.length - 1, ord.indexOf(s) + 1)] === s ? ord[ord.length - 2] : ord[Math.min(ord.length - 1, ord.indexOf(s) + 1)], baseMs: ms, mins: 0 }); if (info && info.found && info.depMin != null) { waits.push(info.depMin - (13 * 60)); } else nodata.push(dn + ':' + s); }
    waits.sort((x, y) => x - y); w[dn] = waits.length ? waits[Math.floor(waits.length / 2)] + '분(중앙)/' + waits[waits.length - 1] + '분(최대)' : '없음';
  }
  const ok = res.반대아님 === 0 && incons <= Math.max(1, Math.round(tot * 0.05)) && nodata.length === 0;
  if (!ok) bad++;
  console.log((ok ? 'OK  ' : 'CHECK') + ' ' + l.padEnd(8) + ' 역' + ord.length + ' 쌍' + res.쌍 + ' 반대아님' + res.반대아님 + ' 일관성깨짐' + incons + '/' + tot + ' 방향없음' + res.방향없음 + ' 낮13시 다음열차 대기 ' + JSON.stringify(w) + (nodata.length ? ' 없음:' + nodata.slice(0, 5).join(',') : ''));
}
console.log(bad ? '점검 필요 ' + bad + '개 노선' : '모두 통과'); process.exit(bad ? 1 : 0);
