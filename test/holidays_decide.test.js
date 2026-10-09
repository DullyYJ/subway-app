// 공휴일 대조 판정(tools/holidays/decide.js) 시험
const assert = require('assert'); const { decide } = require('../tools/holidays/decide'); const { ruleHolidays } = require('../tools/holidays/rules');
let pass = 0, fail = 0; const t = (n, f) => { try { f(); pass++; console.log('  ok  ', n); } catch (e) { fail++; console.log('  FAIL', n, '\n      ', e.message.split('\n').slice(0, 4).join('\n       ')); } };
console.log('holidays_decide.test');
const C27 = ruleHolidays(2027), B27 = { '2027-01-01': '새해', '2027-02-06': '설날', '2027-02-08': '설날', '2027-02-09': '설날', '2027-03-01': '3·1절', '2027-05-03': '노동절', '2027-05-05': '어린이날', '2027-05-13': '부처님 오신 날', '2027-06-06': '현충일', '2027-07-19': '제헌절', '2027-08-16': '광복절', '2027-09-14': '추석', '2027-09-15': '추석', '2027-09-16': '추석', '2027-10-04': '개천절', '2027-10-11': '한글날', '2027-12-25': '크리스마스' };
t('A 없음: B 혼자 주장하는 노동절·제헌절은 받아들이지 않고 불일치로 보고, 규칙(C)이 아는 12/27 대체는 B가 빠뜨려도 받아들인다', () => {
  const r = decide(2027, { A: { ok: false }, B: { ok: true, dates: B27 }, C: C27 });
  assert.ok(!r.dates['2027-05-03'] && !r.dates['2027-07-19']); assert.ok(r.dates['2027-12-27'] && r.dates['2027-02-07'], '설날 연휴(일요일 포함)'); assert.ok(r.dates['2027-06-06']);
  assert.strictEqual(r.status, 'provisional'); assert.ok(r.disagree.some(x => x.date === '2027-05-03')); assert.deepStrictEqual(r.problems, []);
});
t('A 가 완전하면 A 를 따른다: 정부가 노동절·제헌절을 공휴일로 주면 받아들이고, 정부가 뺀 규칙상 날은 뺀다', () => {
  const A = Object.assign({}, C27, { '2027-05-03': '노동절', '2027-07-19': '제헌절' }); delete A['2027-12-27'];
  const r = decide(2027, { A: { ok: true, dates: A }, B: { ok: true, dates: B27 }, C: C27 });
  assert.ok(r.dates['2027-05-03'] && r.dates['2027-07-19']); assert.ok(!r.dates['2027-12-27']); assert.strictEqual(r.status, 'verified');
});
t('임시공휴일: A 가 없어도 B 이름에 임시가 있으면 받아들인다 / 이름이 없으면 받아들이지 않는다', () => {
  const r1 = decide(2027, { A: { ok: false }, B: { ok: true, dates: Object.assign({}, B27, { '2027-04-02': '임시공휴일' }) }, C: C27 }); assert.ok(r1.dates['2027-04-02']);
  const r2 = decide(2027, { A: { ok: false }, B: { ok: true, dates: Object.assign({}, B27, { '2027-04-02': '어떤 날' }) }, C: C27 }); assert.ok(!r2.dates['2027-04-02']);
});
t('A 가 그 해를 아직 발표하지 않아 거의 비어 있으면(불완전) 반대표를 던지지 않는다', () => {
  const r = decide(2027, { A: { ok: true, dates: { '2027-01-01': '신정' } }, B: { ok: true, dates: B27 }, C: C27 });
  assert.ok(r.dates['2027-02-07'] && r.dates['2027-12-27']); assert.strictEqual(r.status, 'provisional');
});
t('출처가 규칙(C)뿐이면 검증 실패(독립 출처 2개 미만)', () => {
  const r = decide(2027, { A: { ok: false }, B: { ok: false }, C: C27 }); assert.ok(r.problems.some(p => /출처/.test(p)));
});
t('고정 공휴일이 빠지면 검증 실패', () => {
  const A = Object.assign({}, C27); delete A['2027-10-09']; const C = Object.assign({}, C27); delete C['2027-10-09']; delete C['2027-10-11'];
  const r = decide(2027, { A: { ok: true, dates: A }, B: { ok: true, dates: {} }, C }); assert.ok(r.problems.some(p => /2027-10-09/.test(p)));
});
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
