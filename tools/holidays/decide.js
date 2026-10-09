// 공휴일 대조 판정 — 여러 출처의 표를 모아 연도별 최종 공휴일을 정한다. (네트워크 없음 → 단위 시험 가능)
//   출처: A=정부 특일 API(공공데이터포털·한국천문연구원; 가장 믿음), B=외부 공개 API(Nager.Date), C=규칙 계산(법정 공휴일·대체공휴일; 임시공휴일·선거일은 모름)
//   표결: 날짜마다 찬성/반대 점수를 모은다. A=3점, C=2점(찬성만; 규칙에 없는 날에 반대하지 않는다), B=1점.
//         A·B 는 그 해 자료가 '완전'할 때만 반대표를 던진다(A 가 아직 그 해를 발표하지 않았으면 기권).
//   공휴일 = 찬성 ≥ 2 이고 찬성 > 반대.  → B 혼자만 주장하는 날(예: 노동절·제헌절 같은 불확실한 날)은 받아들이지 않고 '불일치'로 보고한다.
//      단 B 의 이름에 '임시'·'선거'가 있으면 2점으로 친다(임시공휴일은 규칙으로 알 수 없으므로).
//   확정도: A 가 그 해를 완전하게 줬으면 'verified', 아니면 'provisional'.
const FIXED = ['01-01', '03-01', '05-05', '06-06', '08-15', '10-03', '10-09', '12-25'];
function decide(year, src) {
  const A = src.A && src.A.ok ? src.A.dates : null, B = src.B && src.B.ok ? src.B.dates : null, C = src.C || {};
  const aComplete = !!A && Object.keys(A).length >= Math.max(10, Math.round(Object.keys(C).length * 0.8));
  const bComplete = !!B && Object.keys(B).length >= 10;
  const all = new Set([...(A ? Object.keys(A) : []), ...(B ? Object.keys(B) : []), ...Object.keys(C)]);
  const dates = {}, disagree = [];
  for (const d of [...all].sort()) {
    let yes = 0, no = 0; const votes = {};
    if (A && A[d]) { yes += 3; votes.A = 1; } else if (aComplete) { no += 3; votes.A = 0; }
    if (C[d]) { yes += 2; votes.C = 1; }
    if (B && B[d]) { yes += /임시|선거/.test(B[d]) ? 2 : 1; votes.B = 1; } else if (bComplete) { no += 1; votes.B = 0; }
    const hol = yes >= 2 && yes > no;
    if (hol) dates[d] = (A && A[d]) || C[d] || (B && B[d]);
    const vs = Object.values(votes); if ((vs.length > 1 && vs.some(v => v !== vs[0])) || (!hol && vs.some(v => v === 1))) disagree.push({ date: d, votes, result: hol ? '공휴일' : '아님', name: (A && A[d]) || C[d] || (B && B[d]) || '' });
  }
  const problems = [];
  for (const f of FIXED) if (!dates[year + '-' + f]) problems.push('고정 공휴일 ' + year + '-' + f + ' 가 빠짐');
  if (Object.keys(dates).length < 14) problems.push('공휴일 수가 너무 적음(' + Object.keys(dates).length + ')');
  const nsrc = (A ? 1 : 0) + (B ? 1 : 0) + (Object.keys(C).length ? 1 : 0);
  if (nsrc < 2) problems.push('독립 출처가 2개 미만');
  return { year, dates, status: aComplete ? 'verified' : 'provisional', sources: [A ? 'A' : null, B ? 'B' : null, 'C'].filter(Boolean), disagree, problems };
}
module.exports = { decide, FIXED };
