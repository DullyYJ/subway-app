// 앱 규칙 엔진(engine/rules.js) 시험.  실행: node test/rules_engine.test.js
//  ① 욕설 거르기가 웹(_BAD_WORDS · _containsBadWord)과 같다 ② 글 올리기 검사(check) ③ 포인트가 없다(award · view 거절) ④ 탄 노선 기록(mylines) ⑤ 워커 내장
const fs = require('fs'), path = require('path');
const E = require('../engine/rules');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('ios-reference/index.html'), 'utf8');

// ① 웹과 같다
{
  const i = html.indexOf('var _BAD_WORDS = ['), j = html.indexOf('window._containsBadWord = _containsBadWord;', i);
  const web = new Function(html.slice(i, j) + '\nreturn { list: _BAD_WORDS, f: _containsBadWord };')();
  ok(JSON.stringify(web.list) === JSON.stringify(E.RULES_BAD), '금칙어 목록이 웹과 같다');
  const samples = ['안녕하세요', '지 랄 하네', 'FUCK you', '시 발', '좋은 하루', '', null, '병 신', '출근길 막힘', '개 소 리', 'Shit', '쓰레기같은'];
  ok(samples.every(t => web.f(t) === E.rulesBad(t)), '샘플 판정이 웹과 같다(공백 끼워 넣기 · 대소문자)');
  ok(E.rulesBad('지 랄') && E.rulesBad('FuCk') && !E.rulesBad('쓰레기통') && !E.rulesBad(''), '직접 확인');
}
const D = '2026-10-20';
// ② 검사
{
  const c = o => E.rulesRun(Object.assign({ op: 'check', day: D }, o));
  ok(c({ texts: ['제목', '내용'], kind: 'post' }).ok === true, '정상 글');
  ok(c({ texts: ['', '내용'], kind: 'post' }).msg === '제목을 입력해주세요' && c({ texts: ['제목', '  '], kind: 'post' }).msg === '내용을 입력해주세요', '비었을 때');
  ok(/욕설·비방/.test(c({ texts: ['제목', '이 병 신'], kind: 'post' }).msg) && c({ texts: ['그냥 채팅'], kind: 'chat' }).ok === true && c({ texts: ['ㅈㄹ'], kind: 'chat' }).ok === false, '욕설은 글·채팅 모두 거른다');
  ok(c({ texts: ['제목', '내용'], kind: 'post', cat: '현장제보', pt: { rc: 9, rcStr: D } }).ok === true, '현장제보도 하루 한도 없음(포인트 없음 · s216)');
}
// ③ 포인트는 없다 — 적립·요약 요청은 모르는 op 로 거절한다
{
  ok(E.rulesRun({ op: 'award', ev: 'write', day: D, rnd: 0.5 }).ok === false && E.rulesRun({ op: 'view', day: D }).ok === false, '적립(award) · 요약(view) 은 없다');
  ok(E.rulesLevel === undefined && E.rulesDraw === undefined, '등급 · 추첨 함수가 내보내지지 않는다');
}
// ④ 탄 노선 기록
{
  const m = E.rulesRun({ op: 'mylines', now: 1000, sec: ['수도권 1호선', '2호선', '수도권 1호선', '이상한선'], my: [{ l: '2호선', n: 3, t: 5 }, { l: '쓰레기', n: 9 }] });
  ok(m.ok && JSON.stringify(m.lines) === JSON.stringify(['1호선', '2호선']), '경로 노선 정리(이름 맞추기·중복 제거·모르는 선 버림): ' + JSON.stringify(m.lines));
  const two = m.my.find(x => x.l === '2호선'), one = m.my.find(x => x.l === '1호선');
  ok(two.n === 4 && two.t === 1000 && one.n === 1 && one.t === 1000 && m.my.length === 2, '횟수 +1 · 마지막 시각 · 새 노선 추가 · 모르는 기록 버림');
  ok(E.rulesRun({ op: 'mylines', sec: [], my: null }).my.length === 0, '빈 입력');
}
ok(E.rulesRun({ op: 'x' }).ok === false && E.rulesRun(null).ok === false, '모르는 op');
// ⑤ 워커 내장
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  ok(/\/\/ ===== RULES ENGINE BEGIN =====/.test(w) && w.indexOf('if (url.pathname === "/rules") return handleRules(request);') > 0, '워커에 내장됨');
}
console.log(pass + ' 통과 / ' + fail + ' 실패');
if (fail) process.exit(1);
