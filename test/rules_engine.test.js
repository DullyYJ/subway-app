// 앱 규칙 엔진(engine/rules.js) 시험.  실행: node test/rules_engine.test.js
//  ① 욕설 거르기가 웹(_BAD_WORDS · _containsBadWord)과 같다 ② 글 올리기 검사(check) ③ 포인트(award · view) ④ 탄 노선 기록(mylines) ⑤ 워커 내장
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
  ok(c({ texts: ['제목', '내용'], kind: 'post', cat: '현장제보', pt: { rc: 2, rcStr: D } }).ok === true, '현장제보 2번째까지는 가능');
  const full = c({ texts: ['제목', '내용'], kind: 'post', cat: '현장제보', pt: { rc: 3, rcStr: D } });
  ok(full.ok === false && /하루 3회까지/.test(full.msg) && /3\/3/.test(full.msg), '현장제보 하루 3회 제한');
  ok(c({ texts: ['제목', '내용'], kind: 'post', cat: '현장제보', pt: { rc: 3, rcStr: '2026-10-19' } }).ok === true, '날짜가 바뀌면 다시 가능');
  ok(c({ texts: ['제목', '내용'], kind: 'post', cat: '잡담', pt: { rc: 9, rcStr: D } }).ok === true, '잡담은 제한 없음');
}
// ③ 포인트
{
  const a = o => E.rulesRun(Object.assign({ op: 'award', day: D, rnd: 0.5 }, o));
  const w = a({ ev: 'write', pt: { total: 5, today: 5, todayStr: D } });
  ok(w.ok && w.add === 10 && w.pt.total === 15 && w.pt.today === 15 && /글이 등록되었어요! \+10P/.test(w.msg), '글쓰기 +10P');
  ok(/연결되면 모두에게 보여요/.test(a({ ev: 'write', sent: false }).msg), '보류 글 문구');
  const nd = a({ ev: 'write', pt: { total: 100, today: 40, todayStr: '2026-10-19' } });
  ok(nd.pt.total === 110 && nd.pt.today === 10 && nd.pt.todayStr === D, '날짜가 바뀌면 오늘 값부터 다시');
  ok(a({ ev: 'ride' }).add === 10 && /탑승 안내 시작 \+10P/.test(a({ ev: 'ride' }).msg), '탑승 안내 시작 +10P');
  // 현장제보: 3~8P 차등, 확률표 35/25/18/12/7/3
  const draw = r => E.rulesDraw(r);
  ok(draw(0) === 3 && draw(0.349) === 3 && draw(0.35) === 4 && draw(0.59) === 4 && draw(0.6) === 5 && draw(0.78) === 6 && draw(0.9) === 7 && draw(0.97) === 8 && draw(0.999) === 8 && draw(NaN) === 4, '추첨표');
  let cnt = { 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 }; for (let i = 0; i < 10000; i++) cnt[draw(i / 10000)]++;
  ok(cnt[3] === 3500 && cnt[4] === 2500 && cnt[5] === 1800 && cnt[6] === 1200 && cnt[7] === 700 && cnt[8] === 300, '추첨 비율 35/25/18/12/7/3');
  const r = a({ ev: 'report', rnd: 0.0, pt: { rc: 1, rcStr: D, total: 0, today: 0, todayStr: D } });
  ok(r.add === 3 && r.pt.rc === 2 && /현장제보 등록! \+3P \(오늘 2\/3\)/.test(r.msg), '현장제보 포인트와 횟수');
  ok(a({ ev: 'zzz' }).ok === false, '모르는 사건');
  const odd = a({ ev: 'write', pt: { total: 'x', today: -4, rc: 1e12 } });
  ok(odd.ok && odd.pt.total === 10 && odd.pt.rc === 0, '이상한 저장값은 0 으로');
  const v = E.rulesRun({ op: 'view', day: D, pt: { total: 120, today: 15, todayStr: D, rc: 2, rcStr: D } });
  ok(v.ok && v.level === '탑승객' && v.next === '지하철러' && v.need === 30 && v.today === 15 && v.rc === 2, '요약: 등급·다음 등급까지');
  ok(E.rulesLevel(0).name === '입문자' && E.rulesLevel(1000).name === '철도마스터' && E.rulesLevel(1000).next === '' && E.rulesLevel(599).name === '환승왕', '등급 경계');
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
