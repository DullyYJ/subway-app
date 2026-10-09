// 처음 한 번: 규칙 계산(+알려진 임시/선거 공휴일)으로 holidays.json 초안을 만든다. 이후에는 refresh 워크플로가 대조해 갱신한다.
const fs = require('fs'), path = require('path');
const { ruleHolidays } = require('./rules');
const KNOWN_EXTRA = { '2026-06-03': '지방선거일' };   // 법정 공휴일은 아니지만 공휴일로 지정된 날(선거일·임시공휴일) — 2026 은 지난 일이라 확정
const years = {};
for (const y of [2026, 2027, 2028]) {
  const dates = ruleHolidays(y); for (const k in KNOWN_EXTRA) if (k.startsWith(y + '-')) dates[k] = KNOWN_EXTRA[k];
  years[y] = { status: y === 2026 ? 'verified' : 'provisional', dates: Object.fromEntries(Object.keys(dates).sort().map(k => [k, dates[k]])) };
}
const out = { version: 'hol-init', asOf: '2026-10-09T00:00:00Z', years };
fs.writeFileSync(path.join(__dirname, 'holidays.json'), JSON.stringify(out, null, 1));
console.log(Object.entries(years).map(([y, v]) => y + ':' + Object.keys(v.dates).length).join(' '));
