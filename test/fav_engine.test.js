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
ok(btn.join() === 'fv.close'.replace('fv.close', '') + 'fv.go.0,fv.del.0,fv.go.1,fv.del.1' || btn.join() === 'fv.go.0,fv.del.0,fv.go.1,fv.del.1', '단추: 누르면 찾기 / 삭제 ' + btn.join());
ok(o.info.go[0] && o.info.go[0].s[0] === '부평' && o.info.go[0].d[0] === '강남' && typeof o.info.go[0].s[2] === 'number', '경로 찾기용 역 정보(이름·노선·좌표)는 엔진이 준다');
ok(call({ list: [{ s: '없는역', d: '강남', name: 'q' }] }).info.go[0] === null, '표에 없는 역은 go null');
const r = screenCheck([call({ list: [], cur: { s: '부평', d: '강남' } }), call({ list: L8, cur: { s: '부평', d: '신도림' } }), o]);
ok(!r.err && r.out.every(l => /^OK/.test(l)), '앱 검증기 통과: ' + (r.err || r.out.join(' | ')));
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  ok(/\/\/ ===== FAV ENGINE BEGIN =====/.test(w) && w.indexOf('if (url.pathname === "/screen/fav") return handleScreenFav(request);') > 0 && /ENGINE_VERSION = "route-v2-2026-10-20s9\d"/.test(w), '워커에 내장됨');
}
console.log(pass + ' 통과 / ' + fail + ' 실패');
if (fail) process.exit(1);
