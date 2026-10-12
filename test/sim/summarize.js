// 시뮬 결과(JSON 여러 개)를 합쳐 표로 요약한다.  node test/sim/summarize.js a.json b.json ... > 요약.md
const fs = require('fs');
const all = [];
process.argv.slice(2).forEach(f => JSON.parse(fs.readFileSync(f, 'utf8')).results.forEach(r => all.push(r)));
// 오버레이 오차는 '도보' 칸(이름이 겹쳐 노드를 특정할 수 없음)을 빼고 다시 센다
const pct = (a, q) => { if (!a.length) return null; const t = a.slice().sort((x, y) => x - y); return t[Math.min(t.length - 1, Math.floor(q * (t.length - 1)))]; };
all.forEach(r => { const o = r.samples.filter(s => s.ovlM != null && s.ovlCur && s.ovlCur !== '도보').map(s => s.ovlM); r.judge.info.ovlP95 = pct(o, 0.95); r.judge.info.ovlMax = o.length ? Math.max(...o) : null; });
all.sort((a, b) => a.id.localeCompare(b.id));
const avg = (a) => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : '-';
const mx = (a) => a.length ? Math.max(...a) : '-';
const pf = (r) => { const f = r.samples.find(s => false); return f; };
// 재탐색 이후 표본에서 오버레이가 켜져 있던 비율
function ovlAfterReroute(r) {
  const ev = r.events.find(e => e.kind === 'reroute'); if (!ev) return null;
  const S = r.samples.filter(s => s.t > ev.t + 30); if (!S.length) return null;
  return Math.round(S.filter(s => s.ovlOn).length / S.length * 100);
}
const groups = {};
all.forEach(r => { const k = r.beh + ' | ' + (r.fsm || 'asis'); (groups[k] = groups[k] || []).push(r); });
console.log('## 행동 × 위치상태머신 입력별 요약\n');
console.log('| 행동 | FSM | 건수 | 통과 | 문제 | 재탐색 발생 | 이탈→재탐색 평균(초) | 재탐색 후 오버레이 켜짐(평균%) | 마커 오차 95%(최대 m) | 오버레이 오차 95%(최대 m) |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
Object.keys(groups).sort().forEach(k => {
  const g = groups[k], [beh, fsm] = k.split(' | ');
  const pass = g.filter(r => r.judge.verdict !== 'FAIL').length;
  const rer = g.filter(r => r.judge.info.reroutes > 0 || r.judge.info.adopted > 0).length;
  const det = g.map(r => r.judge.info.detectSec).filter(x => x != null);
  const oa = g.map(ovlAfterReroute).filter(x => x != null);
  const m95 = g.map(r => r.judge.info.markerP95).filter(x => x != null), o95 = g.map(r => r.judge.info.ovlP95).filter(x => x != null);
  console.log(`| ${beh} | ${fsm} | ${g.length} | ${pass} | ${g.length - pass} | ${rer}/${g.length} | ${avg(det)} | ${avg(oa)} | ${avg(m95)} (${mx(m95)}) | ${avg(o95)} (${mx(o95)}) |`);
});
console.log('\n## 시나리오별 결과\n');
console.log('| id | 판정 | 재탐색 | 경로맞춤 | 이탈감지(초) | 재탐색 위치오차(m) | 마커 P95/최대(m) | 오버레이 P95/최대(m) | 오버레이 켜짐(%) | 비고 |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
all.forEach(r => { const i = r.judge.info; console.log(`| ${r.id} | ${r.judge.verdict} | ${i.reroutes} | ${i.adopted} | ${i.detectSec == null ? '-' : i.detectSec} | ${i.rerouteErrM == null ? '-' : i.rerouteErrM} | ${i.markerP95 == null ? '-' : i.markerP95}/${i.markerMax == null ? '-' : i.markerMax} | ${i.ovlP95 == null ? '-' : i.ovlP95}/${i.ovlMax == null ? '-' : i.ovlMax} | ${Math.round((i.ovlOnRatio || 0) * 100)} | ${r.judge.issues.join('; ')} |`); });
