// 공휴일: 엔진 단일 출처(engine/holidays.js) + 규칙 계산기(tools/holidays/rules.js) + 앱과의 일치
const assert = require('assert'); const path = require('path');
const W = require('./helpers/nt_load')();
const { ruleHolidays } = require('../tools/holidays/rules');
let pass = 0, fail = 0; const t = async (n, f) => { try { await f(); pass++; console.log('  ok  ', n); } catch (e) { fail++; console.log('  FAIL', n, '\n      ', e.message.split('\n').slice(0, 4).join('\n       ')); } };
const ks = o => Object.keys(o).sort();
(async () => {
  console.log('holidays.test');
  await t('규칙 계산: 2024 — 설날 연휴+대체(2/12), 어린이날 대체(5/6), 추석 9/16~18', () => {
    const H = ruleHolidays(2024); ['2024-02-09', '2024-02-10', '2024-02-11', '2024-02-12', '2024-05-06', '2024-05-15', '2024-09-16', '2024-09-17', '2024-09-18'].forEach(d => assert.ok(H[d], d));
    assert.ok(!H['2024-10-01'], '임시공휴일은 규칙으로 알 수 없다');
  });
  await t('규칙 계산: 2025 — 삼일절 대체(3/3), 어린이날=부처님오신날 대체(5/6), 추석 10/5~7 + 대체 10/8', () => {
    const H = ruleHolidays(2025); ['2025-01-28', '2025-01-30', '2025-03-03', '2025-05-05', '2025-05-06', '2025-10-05', '2025-10-07', '2025-10-08'].forEach(d => assert.ok(H[d], d));
    assert.ok(!H['2025-01-27']);
  });
  await t('규칙 계산: 2026 — 정확히 21개(노동절 5/1·제헌절 7/17 포함, 5/25 부처님·8/17 광복절 대체, 6/6 토요일은 대체 없음)', () => {
    const H = ruleHolidays(2026); assert.deepStrictEqual(ks(H), ['2026-01-01', '2026-02-16', '2026-02-17', '2026-02-18', '2026-03-01', '2026-03-02', '2026-05-01', '2026-05-05', '2026-05-24', '2026-05-25', '2026-06-06', '2026-07-17', '2026-08-15', '2026-08-17', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25'].sort());
  });
  await t('규칙 계산: 2027 — 설날은 한국 시각 기준 2/7 중심(2/6~8)+대체 2/9, 광복절 8/16·개천절 10/4·한글날 10/11·성탄절 12/27 대체', () => {
    const H = ruleHolidays(2027); ['2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09', '2027-05-03', '2027-07-19', '2027-08-16', '2027-10-04', '2027-10-11', '2027-12-27', '2027-09-14', '2027-09-16', '2027-05-13'].forEach(d => assert.ok(H[d], d));
  });
  await t('엔진: 내장 자료로 2026·2027 날짜 판정', () => {
    W._holReset();
    assert.ok(W.holIs(2026, 5, 25) && W.holIs(2026, 8, 17) && W.holIs(2026, 10, 9) && W.holIs(2027, 2, 9) && W.holIs(2027, 10, 11));
    assert.ok(!W.holIs(2026, 10, 8) && !W.holIs(2027, 2, 10));
    assert.strictEqual(W.holName(2026, 10, 9), '한글날'); assert.ok(W.holCovers(2027));
  });
  await t('엔진: 자료가 없는 해(2035)는 양력 고정 공휴일만(설날·추석·대체공휴일은 모르므로 아니라고 한다)', () => {
    W._holReset(); assert.ok(!W.holCovers(2035)); assert.ok(W.holIs(2035, 3, 1) && W.holIs(2035, 12, 25)); assert.ok(!W.holIs(2035, 2, 19));
  });
  await t('ntDayInfo: 공휴일은 SUN·휴일, 토/일은 그대로, 대체공휴일 반영', () => {
    W._holReset(); 
    const at = (y, m, d) => Date.UTC(y, m - 1, d, 3, 0);
    assert.strictEqual(W.ntDayInfo(at(2026, 5, 25)).dayCode, 'SUN');   // 월요일이지만 대체공휴일
    assert.strictEqual(W.ntDayInfo(at(2026, 5, 26)).dayCode, 'DAY');
    assert.strictEqual(W.ntDayInfo(at(2026, 10, 10)).dayCode, 'SAT');
    assert.strictEqual(W.ntDayInfo(at(2027, 2, 9)).isHol, true);
  });
  await t('holEnsure: KV 의 새 자료가 내장본을 해 단위로 덮어쓴다(예: 임시공휴일 추가), 오래된 KV 는 무시', async () => {
    W._holReset(); const emb = W.holSnapshot();
    const newer = { version: 'hol-x', asOf: '2099-01-01T00:00:00Z', years: { '2027': { status: 'verified', dates: Object.assign({}, emb.years['2027'].dates, { '2027-03-03': '임시공휴일' }) } } };
    const env = { ROWS_KV: { get: async () => JSON.stringify(newer) } };
    await W.holEnsure(env); assert.ok(W.holIs(2027, 3, 3)); assert.ok(W.holIs(2026, 10, 9), '다른 해는 내장본 유지');
    W._holReset(); const older = Object.assign({}, newer, { asOf: '2000-01-01T00:00:00Z' });
    await W.holEnsure({ ROWS_KV: { get: async () => JSON.stringify(older) } }); assert.ok(!W.holIs(2027, 3, 3));
    W._holReset(); await W.holEnsure({ ROWS_KV: { get: async () => '{깨짐' } }); assert.ok(W.holIs(2026, 10, 9));
    W._holReset(); await W.holEnsure({ ROWS_KV: { get: async () => { throw new Error('x'); } } }); assert.ok(W.holIs(2026, 10, 9));
  });
  await t('/holidays: JSON·CORS, year 인자', async () => {
    W._holReset(); const r = await W.handleHolidays(new Request('https://x/holidays?year=2027'), {}); assert.strictEqual(r.status, 200);
    assert.strictEqual(r.headers.get('access-control-allow-origin'), '*'); const j = await r.json(); assert.deepStrictEqual(Object.keys(j.years), ['2027']); assert.ok(j.years['2027'].dates['2027-02-09']);
    const o = await W.handleHolidays(new Request('https://x/holidays', { method: 'OPTIONS' }), {}); assert.strictEqual(o.status, 204);
  });
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})();
