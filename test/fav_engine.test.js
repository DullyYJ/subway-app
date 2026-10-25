// 즐겨찾기 화면 엔진(engine/fav.js) 시험.  실행: node test/fav_engine.test.js   (javac · java 필요)
const fs = require('fs'), path = require('path');
const E = require('../engine/fav'), screenCheck = require('./helpers/screen_check');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const call = f => E.favScreen({ cap: 18 }, f);
const flat = ns => { const o = []; (function f(a) { a.forEach(n => { o.push(n); if (n.kids) f(n.kids); }); })(ns); return o; };
ok(E.favScreen({ cap: 17 }, {}).ok === false, 'cap 18 미만이면 만들지 않는다');
let o = call({ list: [], cur: { s: '부평', d: '강남역' } });
ok(o.ok && o.info.list.length === 0 && flat(o.body).some(n => n.t === 'button' && n.act.v === 'fv.add' && /부평→강남/.test(n.s)) && flat(o.body).some(n => /저장된 즐겨찾기가 없습니다/.test(n.s || '')), '빈 목록 + 현재 경로 빠른 등록 단추(끝의 역은 뗀다)');
o = call({ list: [], cur: { s: '부평', d: '강남' }, op: { k: 'quick' } });
ok(o.info.list.length === 1 && o.info.list[0].name === '부평→강남' && /등록 완료/.test(o.info.msg) && flat(o.body).some(n => /등록됨/.test(n.s || '')) && !flat(o.body).some(n => n.t === 'button' && n.act.v === 'fv.add'), '빠른 등록');
const again = call({ list: o.info.list, cur: { s: '부평', d: '강남' }, op: { k: 'quick' } });
ok(again.info.list.length === 1 && again.info.msg === '이미 등록된 경로예요', '같은 경로 중복 불가');
ok(call({ list: [], cur: { s: '부평', d: '부평' }, op: { k: 'quick' } }).info.msg === '출발역과 도착역이 같아요', '출발=도착 불가');
ok(call({ list: [], cur: { s: '아무데나', d: '강남' }, op: { k: 'quick' } }).info.msg.length > 0, '역이 아니면 등록 안 됨');
const eight = []; for (let i = 0; i < 8; i++) eight.push({ s: '부평', d: '강남', name: 'x' + i }); 
const L8 = ['강남', '역삼', '선릉', '삼성', '잠실', '사당', '이수', '홍대입구'].map((d, i) => ({ s: '부평', d, name: '이름' + i }));
ok(call({ list: eight }).info.list.length === 1 && call({ list: L8.concat(L8) }).info.list.length === 8, '목록 정리: 같은 출발-도착은 하나, 최대 8개');
ok(call({ list: L8, cur: { s: '부평', d: '신도림' }, op: { k: 'quick' } }).info.msg === '즐겨찾기는 최대 8개', '8개가 차면 막는다');
o = call({ list: L8, op: { k: 'del', i: 1 } });
ok(o.info.list.length === 7 && o.info.list[1].d === '선릉' && o.info.msg === '즐겨찾기 삭제', '삭제');
o = call({ list: L8.slice(0, 2) });
const btn = flat(o.body).filter(n => n.t === 'button').map(n => n.act.v);
ok(btn.join() === 'fv.new,fv.go.0,fv.del.0,fv.go.1,fv.del.1', '단추: 새로 등록 / 누르면 찾기 / 삭제 ' + btn.join());
ok(o.info.go[0] && o.info.go[0].s[0] === '부평' && o.info.go[0].d[0] === '강남' && typeof o.info.go[0].s[2] === 'number', '경로 찾기용 역 정보(이름·노선·좌표)는 엔진이 준다');
ok(call({ list: [{ s: '없는역', d: '강남', name: 'q' }] }).info.go[0] === null, '표에 없는 역은 go null');
// s208: 같은 이름 역(수도권 ↔ 지방) 구분 — 여러 권역에 있는 지방 역만 이름 뒤에 권역 표시
{
  const F = E.favFind, C = E.favCands;
  ok(F('중동')[0] === '중동' && F('중동')[1] === '1호선' && F('중동(부산)')[0] === '중동(부산)' && F('중동(부산)')[1] === '부산2호선' && F('중동(부산)')[2] < 36, '글: 표시 없으면 수도권 · 표시가 있으면 그 권역');
  ok(F('중동', '부산2호선')[0] === '중동(부산)' && F('중동', '1호선')[0] === '중동' && F('중동', '엉뚱한선')[0] === '중동', '노선 힌트로 어느 쪽인지 · 힌트가 안 맞으면 수도권');
  ok(F('서면')[0] === '서면' && F('서면')[1].indexOf('부산') === 0, '권역이 하나뿐인 지방 역은 표시 없이 그대로(예전 저장 이름도 그대로)');
  ok(F('중동(대구)') === null && F('zzzz(부산)') === null, '없는 권역 · 없는 이름은 null');
  const cc = C('중동').map(c => c.name + ':' + c.lines.join('/'));
  ok(cc.indexOf('중동:1호선') >= 0 && cc.indexOf('중동(부산):부산2호선') >= 0, '후보: 권역별로 따로 + 이름 뒤 표시 ' + cc.join(' | '));
  ok(C('중동(부').some(c => c.name === '중동(부산)') && E.favResolve('중동(부산)') === '중동(부산)' && E.favResolve('중동') === '중동', '쓰다 만 표시 글도 후보를 찾고 정확한 표시는 그대로 그 역');
  let g = call({ list: [{ s: '중동(부산)', d: '서면', name: '출근' }] }).info.go[0];
  ok(g && g.s[0] === '중동' && g.s[1] === '부산2호선' && g.s[2] < 36 && g.d[0] === '서면', 'go: 앱에는 표시를 뗀 이름 + 그 권역 역의 노선·좌표');
  g = call({ list: [{ s: '중동', d: '강남', name: '출근' }] }).info.go[0];
  ok(g && g.s[1] === '1호선' && g.s[2] > 37, 'go: 예전에 저장한 표시 없는 이름은 수도권(그대로)');
  const q = call({ list: [], cur: { s: '중동', d: '서면', sl: '부산2호선', dl: '부산2호선' }, op: { k: 'quick' } });
  ok(q.info.list.length === 1 && q.info.list[0].s === '중동(부산)' && q.info.list[0].d === '서면' && q.info.msg === '중동(부산)→서면 등록 완료', '빠른 등록: 현재 경로의 노선 힌트로 지방 중동을 구분해 저장 ' + JSON.stringify(q.info.list));
  const q2 = call({ list: [], cur: { s: '중동', d: '강남' }, op: { k: 'quick' } });
  ok(q2.info.list[0].s === '중동' && q2.info.list[0].d === '강남', '힌트가 없으면 예전처럼(수도권)');
}
// 새로 등록 폼
{
  const C = E.favCands;
  ok(C('강남').length >= 1 && C('강남')[0].name === '강남' && C('강남').length <= 6 && C('강남').every(c => c.name.indexOf('강남') >= 0 && c.lines.length >= 1), '후보: 이름이 같은 역이 맨 앞, 최대 6개, 노선 모음: ' + JSON.stringify(C('강남').slice(0, 3)));
  ok(C('').length === 0 && C('강남역')[0].name === '강남' && C('  부 평 ')[0].name === '부평', '후보: 빈 글 없음 · 끝의 역 · 공백 무시');
  ok(E.favResolve('강남역') === '강남' && E.favResolve('zzzz') === '' && E.favResolve('') === '', '이름이 정확하면 그 역');
  const one = E.favCands('수원시청') ; ok(one.length === 1 ? E.favResolve('수원시') === '수원시청' : true, '후보가 하나뿐이면 그 역으로 본다');
  o = call({ list: [], form: { n: '', s: '강', d: '', act: 's' } });
  const sugs = flat(o.body).filter(n => n.t === 'sug');
  ok(sugs.length >= 2 && sugs.every(n => /^fv\.pick\.s\.\d$/.test(n.act.v)) && flat(o.body).some(n => n.t === 'inbar' && n.key === 'fvs' && n.value === '강' && n.watch === true) && flat(o.body).some(n => n.t === 'field' && n.key === 'fvn'), '쓰는 칸에만 후보 줄이 뜨고 글자는 그대로 보인다');
  ok(!flat(call({ list: [], form: { s: '강', act: '' } }).body).some(n => n.t === 'sug'), '쓰는 칸이 없으면 후보 없음');
  o = call({ list: [], form: { n: '출근길', s: '강', d: '', act: 's' }, op: { k: 'pick', w: 's', j: 0 } });
  ok(o.info.form.s === C('강')[0].name && o.info.form.act === '' && o.info.form.n === '출근길', '후보 줄을 고르면 칸이 채워지고 후보가 닫힌다');
  o = call({ list: [], form: { n: '출근길', s: '부평', d: '강남역', act: '' }, op: { k: 'new' } });
  ok(o.info.list.length === 1 && o.info.list[0].s === '부평' && o.info.list[0].d === '강남' && o.info.list[0].name === '출근길' && /출근길 등록 완료/.test(o.info.msg) && o.info.form.s === '' && o.info.form.n === '', '등록: 이름 · 역 이름 정리 · 폼 비움');
  o = call({ list: [], form: { n: '', s: '부평', d: '강남', act: '' }, op: { k: 'new' } });
  ok(o.info.list[0].name === '부평→강남', '이름을 안 쓰면 A→B');
  const bad = (form, list) => call({ list: list || [], form: form, op: { k: 'new' } });
  ok(bad({ s: '부평', d: '' }).info.msg === '출발역과 도착역을 정확히 선택하세요' && bad({ s: '부평', d: '부평' }).info.msg === '출발역과 도착역이 같아요' && bad({ s: '부평', d: '강남' }, [{ s: '부평', d: '강남', name: 'x' }]).info.msg === '이미 등록된 경로예요' && bad({ s: '부평', d: '강남' }, L8).info.msg === '즐겨찾기는 최대 8개', '등록 실패: 비었음 · 같은 역 · 중복 · 8개');
  ok(bad({ s: '부평', d: '' }).info.form.s === '부평', '실패하면 쓰던 글은 남긴다');
  ok(call({ list: [], form: { n: 'x'.repeat(50), s: '부평', d: '강남' }, op: { k: 'new' } }).info.list[0].name.length === 20, '이름은 20자까지');
}
const r = screenCheck([call({ list: [], form: { s: '강', d: '시', act: 'd' } }), call({ list: [], cur: { s: '부평', d: '강남' } }), call({ list: L8, cur: { s: '부평', d: '신도림' } }), o]);
ok(!r.err && r.out.every(l => /^OK/.test(l)), '앱 검증기 통과: ' + (r.err || r.out.join(' | ')));
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  ok(/\/\/ ===== FAV ENGINE BEGIN =====/.test(w) && w.indexOf('if (url.pathname === "/screen/fav") return handleScreenFav(request);') > 0 && /ENGINE_VERSION = "route-v2-2026-10-\d\ds\d+"/.test(w), '워커에 내장됨');
}
console.log(pass + ' 통과 / ' + fail + ' 실패');
if (fail) process.exit(1);
