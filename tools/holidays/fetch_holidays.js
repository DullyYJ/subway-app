// 공휴일 자동 갱신 — 출처 수집(A 정부 API, B Nager.Date, C 규칙) → decide.js 로 대조 → out/holidays.json·report.md·changed.txt
// 환경: TAGO_KEY(공공데이터포털 키; 특일 API 활용신청이 되어 있으면 A 사용), PRIOR(이전 holidays.json 경로; 없으면 tools/holidays/holidays.json), YEARS(쉼표; 기본 올해·내년)
const fs = require('fs'), path = require('path');
const { ruleHolidays } = require('./rules'); const { decide } = require('./decide');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const KEY = process.env.TAGO_KEY || '';
const kstYear = new Date(Date.now() + 9 * 3600e3).getUTCFullYear();
const years = (process.env.YEARS || '').split(',').filter(Boolean).map(Number); if (!years.length) years.push(kstYear, kstYear + 1);
const get = async (url, tries = 3) => { let last; for (let i = 0; i < tries; i++) { try { const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'gildongmu-holiday-bot' } }); const t = await r.text(); return { status: r.status, text: t }; } catch (e) { last = e; await new Promise(r => setTimeout(r, 2000)); } } throw last; };
async function srcA(y) {
  if (!KEY) return { ok: false, err: 'no key' };
  try {
    const ds = {};
    for (const op of ['getRestDeInfo']) {
      const { status, text } = await get('https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/' + op + '?solYear=' + y + '&numOfRows=100&_type=json&ServiceKey=' + encodeURIComponent(KEY));
      if (status !== 200 || text.trim()[0] !== '{') return { ok: false, err: 'status ' + status };
      const j = JSON.parse(text); const h = j.response && j.response.header; if (!h || h.resultCode !== '00') return { ok: false, err: 'code ' + (h && h.resultCode) };
      let it = j.response.body && j.response.body.items && j.response.body.items.item; if (!it) it = []; if (!Array.isArray(it)) it = [it];
      for (const x of it) if (x.isHoliday === 'Y') { const s = String(x.locdate); ds[s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8)] = x.dateName; }
    }
    return { ok: true, dates: ds };
  } catch (e) { return { ok: false, err: String(e.message).replace(KEY, '***').slice(0, 100) }; }
}
async function srcB(y) {
  try {
    const { status, text } = await get('https://date.nager.at/api/v3/PublicHolidays/' + y + '/KR'); if (status !== 200) return { ok: false, err: 'status ' + status };
    const ds = {}; for (const x of JSON.parse(text)) if ((x.types || []).includes('Public')) ds[x.date] = x.localName; return { ok: true, dates: ds };
  } catch (e) { return { ok: false, err: String(e.message).slice(0, 100) }; }
}
(async () => {
  const priorP = process.env.PRIOR || path.join(__dirname, 'holidays.json');
  const prior = fs.existsSync(priorP) ? JSON.parse(fs.readFileSync(priorP, 'utf8')) : { years: {} };
  const outYears = {}; for (const y in prior.years) if (+y >= kstYear - 1) outYears[y] = prior.years[y];      // 이전 자료 유지(오래된 해만 정리)
  const md = ['# 공휴일 갱신 보고', ''], raw = {}; let issues = [];
  for (const y of years) {
    const [A, B] = [await srcA(y), await srcB(y)]; const C = ruleHolidays(y); raw[y] = { A, B, C };
    const r = decide(y, { A, B, C });
    md.push('## ' + y + ' — ' + r.status + ' (출처 ' + r.sources.join('+') + (A.ok ? '' : '; A 불가: ' + A.err) + (B.ok ? '' : '; B 불가: ' + B.err) + ')');
    if (r.problems.length) { md.push('- ⚠ 검증 실패: ' + r.problems.join(', ') + ' → 이전 자료 유지'); issues.push(y + '년: ' + r.problems.join(', ')); continue; }
    const old = prior.years[y]; const was = old ? JSON.stringify(old.dates) : '';
    // 확정(verified)이던 해가 provisional 로 떨어지는 건(A 가 일시적으로 안 될 때) 날짜가 같을 때만 상태만 유지
    if (old && old.status === 'verified' && r.status !== 'verified') { if (JSON.stringify(r.dates) === was) { md.push('- A 불가였으나 날짜 동일 → 기존 확정 유지'); outYears[y] = old; continue; } }
    outYears[y] = { status: r.status, dates: r.dates };
    const add = Object.keys(r.dates).filter(d => !old || !old.dates[d]), del = old ? Object.keys(old.dates).filter(d => !r.dates[d]) : [];
    md.push('- 공휴일 ' + Object.keys(r.dates).length + '개' + (add.length ? ', 추가: ' + add.map(d => d + '(' + r.dates[d] + ')').join(' ') : '') + (del.length ? ', 삭제: ' + del.join(' ') : ''));
    if (r.disagree.length) { md.push('- 출처 불일치 ' + r.disagree.length + '건:'); r.disagree.forEach(x => md.push('  - ' + x.date + ' ' + x.name + ' ' + JSON.stringify(x.votes) + ' → ' + x.result)); }
  }
  for (const y of Object.keys(outYears).sort()) outYears[y].dates = Object.fromEntries(Object.keys(outYears[y].dates).sort().map(k => [k, outYears[y].dates[k]]));
  const same = JSON.stringify(Object.fromEntries(Object.entries(outYears).map(([y, v]) => [y, [v.status, v.dates]]))) === JSON.stringify(Object.fromEntries(Object.entries(prior.years).filter(([y]) => outYears[y]).map(([y, v]) => [y, [v.status, v.dates]])));
  const final = { version: 'hol-' + new Date().toISOString().slice(0, 10), asOf: new Date().toISOString(), years: outYears };
  fs.writeFileSync(path.join(OUT, 'holidays.json'), JSON.stringify(final, null, 1));
  fs.writeFileSync(path.join(OUT, 'holidays-raw.json'), JSON.stringify(raw));
  fs.writeFileSync(path.join(OUT, 'changed.txt'), same ? 'no' : 'yes');
  fs.writeFileSync(path.join(OUT, 'issues.txt'), issues.join('\n'));
  fs.writeFileSync(path.join(OUT, 'report.md'), md.join('\n') + '\n'); console.log(md.join('\n'));
})().catch(e => { console.error('실패', e.message); process.exit(1); });
