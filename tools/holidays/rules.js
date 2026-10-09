// 대한민국 법정 공휴일을 '규칙'으로 계산한다(외부 자료와 대조하는 세 번째 눈). 임시공휴일·선거일처럼 법으로 정해지지 않은 날은 여기서 알 수 없다.
//   · 고정(양력): 신정 1/1, 삼일절 3/1, 노동절 5/1, 어린이날 5/5, 현충일 6/6, 제헌절 7/17, 광복절 8/15, 개천절 10/3, 한글날 10/9, 성탄절 12/25
//     (노동절·제헌절은 2026년부터 공휴일 — 정부 특일 API 로 확인. 대체공휴일 적용도 API 가 같다)
//   · 음력: 설날(1/1 앞뒤 하루씩 3일), 부처님오신날(4/8), 추석(8/15 앞뒤 하루씩 3일)  — 음력은 Intl 중국력(Asia/Seoul)으로 환산
//   · 대체공휴일(공휴일에 관한 법률 제3조): 설날·추석 연휴는 일요일이나 다른 공휴일과 겹치면, 삼일절·노동절·어린이날·제헌절·광복절·개천절·한글날·부처님오신날·성탄절은
//     토·일요일이나 다른 공휴일과 겹치면 그다음 첫 번째 '공휴일이 아닌 날'(평일)을 대체공휴일로 한다. 신정·현충일은 대체 없음.
const fmt = (y, m, d) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
const dow = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const addDays = (y, m, d, n) => { const t = new Date(Date.UTC(y, m - 1, d + n)); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };
const cn = new Intl.DateTimeFormat('en-u-ca-chinese', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' });
// 양력 해 y 안에서 음력 (lm월 ld일, 윤달 제외)에 해당하는 양력 날짜 찾기
function lunarToSolar(y, lm, ld) {
  for (let t = Date.UTC(y, 0, 1); t < Date.UTC(y + 1, 0, 1); t += 86400000) {
    const parts = cn.formatToParts(new Date(t + 12 * 3600000)); const mo = parts.find(p => p.type === 'month').value, da = parts.find(p => p.type === 'day').value;
    if (String(mo) === String(lm) && +da === ld) { const x = new Date(t); return [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()]; }
  }
  return null;
}
function ruleHolidays(y) {
  const H = {};            // 'YYYY-MM-DD' -> 이름
  const sub = [];          // 대체공휴일 후보 [이름, [날짜들], 일요일만겹침?]
  const add = (ymd, nm) => { H[ymd] = H[ymd] ? H[ymd] : nm; };
  add(fmt(y, 1, 1), '신정'); add(fmt(y, 6, 6), '현충일');
  const fixed = [[3, 1, '삼일절'], [5, 1, '노동절'], [5, 5, '어린이날'], [7, 17, '제헌절'], [8, 15, '광복절'], [10, 3, '개천절'], [10, 9, '한글날'], [12, 25, '성탄절']];
  fixed.forEach(([m, d, n]) => { add(fmt(y, m, d), n); sub.push([n, [[y, m, d]], false]); });
  const seol = lunarToSolar(y, 1, 1), bud = lunarToSolar(y, 4, 8), chu = lunarToSolar(y, 8, 15);
  if (seol) { const ds = [-1, 0, 1].map(n => addDays(seol[0], seol[1], seol[2], n)); ds.forEach(x => add(fmt(...x), '설날')); sub.push(['설날', ds, true]); }
  if (chu) { const ds = [-1, 0, 1].map(n => addDays(chu[0], chu[1], chu[2], n)); ds.forEach(x => add(fmt(...x), '추석')); sub.push(['추석', ds, true]); }
  if (bud) { add(fmt(...bud), '부처님오신날'); sub.push(['부처님오신날', [bud], false]); }
  // 대체공휴일: 날짜순으로 처리(앞선 대체일이 뒤 계산에 영향을 줄 수 있어 반복)
  sub.sort((a, b) => fmt(...a[1][0]).localeCompare(fmt(...b[1][0])));
  for (const [nm, ds, sundayOnly] of sub) {
    let overlap = 0;
    for (const x of ds) { const w = dow(...x); const others = Object.keys(H).filter(k => k === fmt(...x) && H[k] !== nm); if (w === 0 || (!sundayOnly && w === 6) || others.length) overlap++; }
    // 한 날짜가 두 이름에 걸친 경우(예: 부처님오신날=어린이날)는 위 others 로 잡힌다
    while (overlap-- > 0) {
      let t = addDays(...ds[ds.length - 1], 1);
      while (dow(...t) === 0 || dow(...t) === 6 || H[fmt(...t)]) t = addDays(...t, 1);
      add(fmt(...t), '대체공휴일');
    }
  }
  return H;
}
module.exports = { ruleHolidays, lunarToSolar };
if (require.main === module) { const y = +process.argv[2] || new Date().getFullYear(); const H = ruleHolidays(y); Object.keys(H).sort().forEach(k => console.log(k, H[k])); }
