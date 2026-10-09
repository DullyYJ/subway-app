// 시각표 '달라짐 감시' — 자동 갱신 대상이 아닌 노선(서울 1·2·4~9호선, 인천1·2, 김포)을 TAGO 와 매주 대조해, 지금 내장 시각표와 눈에 띄게 벌어지면 알린다.
//   · 처음 실행하면 지금의 일치도를 기준선(baseline)으로 저장한다(알림 없음). 이후 일치도가 기준선보다 0.1 넘게 떨어지거나 TAGO 의 역 수가 줄면 이슈 글감을 만든다.
//   · 기준선보다 좋아지면 기준선을 올린다. 기준선이 0.3 미만인 요일(TAGO 에 자료가 없는 2·7호선 일요일 등)은 감시하지 않는다.
// 사용: node tools/collect-tt/drift.js <base.json> <raw.json> <baseline.json> <out_dir>   → out_dir/{drift.md, drift-issues.txt, baseline.json}
const fs = require('fs'), path = require('path');
const { compare, COV } = require('./compare_covered.js');
const [baseP, rawP, blP, outDir] = process.argv.slice(2);
if (!baseP || !rawP || !blP || !outDir) { console.error('사용법: drift.js <base.json> <raw.json> <baseline.json> <out_dir>'); process.exit(2); }
const MANAGED_SEOUL = new Set(['3호선']);     // refresh.js 가 직접 갱신하는 노선은 감시에서 뺀다
const rep = compare(JSON.parse(fs.readFileSync(baseP, 'utf8')), JSON.parse(fs.readFileSync(rawP, 'utf8')));
const prev = fs.existsSync(blP) ? JSON.parse(fs.readFileSync(blP, 'utf8')) : null;
const next = { asOf: new Date().toISOString().slice(0, 10), lines: {} }, issues = [], md = ['# 시각표 달라짐 감시', ''];
for (const l of COV) {
  if (MANAGED_SEOUL.has(l)) continue; const L = rep.lines[l];
  const cur = { D: L.D.avg, W: L.W.avg, inTago: L.inTago, inBundle: L.inBundle };
  const b = prev && prev.lines && prev.lines[l];
  md.push('- **' + l + '** — 평일 ' + cur.D + ' / 휴일 ' + cur.W + ' (TAGO 역 ' + cur.inTago + '/' + L.stations + ')' + (b ? ' · 기준선 ' + b.D + ' / ' + b.W : ' · 기준선 새로 저장'));
  next.lines[l] = Object.assign({}, cur);
  if (!b) continue;
  for (const k of ['D', 'W']) {
    if (b[k] == null || b[k] < 0.3) { next.lines[l][k] = b[k]; continue; }
    if (cur[k] == null) { issues.push(l + ' ' + (k === 'D' ? '평일' : '휴일') + ': TAGO 에서 자료를 받지 못함(기준선 ' + b[k] + ')'); next.lines[l][k] = b[k]; continue; }
    if (cur[k] < b[k] - 0.1) { issues.push(l + ' ' + (k === 'D' ? '평일' : '휴일') + ': 내장 시각표와 TAGO 의 일치도가 ' + b[k] + ' → ' + cur[k] + ' 로 떨어졌습니다(시각표 개정 가능성)'); next.lines[l][k] = b[k]; }
    else if (cur[k] < b[k]) next.lines[l][k] = b[k];                 // 조금 떨어진 건 기준선 유지
  }
  if (cur.inTago < b.inTago - 1) { issues.push(l + ': TAGO 에서 찾은 역이 ' + b.inTago + ' → ' + cur.inTago + ' 로 줄었습니다'); next.lines[l].inTago = b.inTago; }
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'drift.md'), md.join('\n') + '\n');
fs.writeFileSync(path.join(outDir, 'drift-issues.txt'), issues.join('\n'));
fs.writeFileSync(path.join(outDir, 'baseline.json'), JSON.stringify(next, null, 1));
console.log(md.join('\n')); console.log(issues.length ? '\n알림:\n' + issues.join('\n') : '\n알림 없음');
