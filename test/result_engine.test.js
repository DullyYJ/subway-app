// 홈 경로 결과 화면 엔진(engine/result.js) 시험.  실행: node test/result_engine.test.js   (javac · java 필요)
//  ① 웹 _convertSinglePathToRoute · _normStop · _rvApply 와 같은 결과(ios-reference/index.html 에서 함수 본문을 꺼내 대조)
//  ② 탭 고르기 ③ 화면 모양(머리줄·탭 줄·타임라인) ④ 앱 검증기 통과 ⑤ 이상한 입력 ⑥ 워커 내장
const fs = require('fs'), path = require('path');
const E = require('../engine/result'), screenCheck = require('./helpers/screen_check');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('ios-reference/index.html'), 'utf8');
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('웹 함수를 못 찾음: ' + a); return html.slice(i, j); };
const web = new Function("function _routeWhyText(){ return ''; }\n" +
  cut('function _normStop(sv){', 'window._normStop = _normStop;') + '\n' +
  cut('function _convertSinglePathToRoute(path) {', '// 엔진 응답 → _renderTransitResultCard용 routes 형식 변환') + '\n' +
  cut('function _rvApply(res, paths){', 'window._rvApply = _rvApply;').replace("if(!(typeof _e2On==='function' && _e2On())) return null;", '') + '\n' +
  'return { conv: _convertSinglePathToRoute, rv: _rvApply, ns: _normStop };')();

const walk = t => ({ trafficType: 3, sectionTime: t, distance: t * 70 });
const sub = (a, b, n, t, extra) => Object.assign({ trafficType: 1, lane: [{ name: n }], sectionTime: t, distance: t * 600, startName: a, endName: b, startSec: 0, endSec: t * 60, stopSec: [0, 100, t * 60],
  passStopList: { stations: [{ stationName: a, y: 37.49, x: 126.72, arrTime: '12:03' }, { stationName: '중간', y: 37.5, x: 126.8, secFromStart: 100 }, { stationName: b, y: 37.52, x: 126.9, pass: true }] } }, extra || {});
const bus = (no, t) => ({ trafficType: 2, lane: [{ busNo: no }], sectionTime: t, distance: t * 400, startName: '정류장A', endName: '정류장B', waitSec: 240, waitReal: true, passStopList: { stations: [{ stationName: '정류장A', y: 37.4, x: 126.7 }, { stationName: '정류장B', y: 37.41, x: 126.71 }] } });
const P1 = { info: { totalTime: 24, totalDistance: 9000, transferCount: 0, pathType: 1, tab: 'fast', _rvWhy: '가장 빨라요', _rvSplit: { ride: 18, wait: 0, walk: 6, tot: 24, text: '승차 18분 · 도보·환승 6분' }, transfers: [{ kind: 'walk', at: '구로', walkMin: 2 }] },
  subPath: [walk(3), sub('부평', '두정', '수도권 1호선', 18, { xfer: { dropCar: '4', dropDoor: '2', boardCar: '5', boardDoor: '1', to: '2', secs: 90 }, exitFast: [{ fac: '엘리베이터', door: '7-2' }], ttWaitMs: 120000, trainChanges: [{ at: '신도림', to: '급행' }] }), walk(3)] };
const P2 = { info: { totalTime: 31, transferCount: 1, pathType: 2, tab: 'bus', longDist: false }, subPath: [walk(2), bus('6', 20), walk(4)] };
const P3 = { info: { totalTime: 40, transferCount: 2, pathType: 3, tab: 'less' }, subPath: [walk(5), sub('A', 'B', '2호선', 10), bus('77', 15), walk(5)] };
const PW = { info: { totalTime: 9, transferCount: 0 }, subPath: [walk(9)] };

// ① 웹과 같다
[P1, P2, P3].forEach((p, i) => {
  const a = E.resConvertPath(p), b = web.conv(p);
  delete b.ld; delete a.ld;                                                 // 장거리 칸은 아래에서 따로
  ok(JSON.stringify(a.sections) === JSON.stringify(b.sections) && JSON.stringify(a.summary) === JSON.stringify(b.summary) && JSON.stringify(a.transfers) === JSON.stringify(b.transfers) && JSON.stringify(a.rvSplit) === JSON.stringify(b.rvSplit), '경로 변환 #' + i + ' 웹과 같다');
});
ok(E.resConvertPath(PW) === null && JSON.stringify(web.conv(PW)) === JSON.stringify({ summary: {}, sections: [] }), '교통 구간이 없으면 무효 경로');
{
  const LD = { info: { totalTime: 130, longDist: true, ldMode: 'ktx', ldGrade: 'KTX', ldDepTs: 5, ldOptions: [{ grade: 'KTX' }], ldNoWaitMin: 120, ldFastRide: { depLabel: '12:00' }, candidates: [{ mode: 'ktx' }], distKm: 300 }, subPath: [{ trafficType: 4, lane: [{ name: 'KTX' }], sectionTime: 130, distance: 300000, startName: '서울', endName: '부산' }] };
  const a = E.resConvertPath(LD), b = web.conv(LD);
  ok(JSON.stringify(a.ld) === JSON.stringify(b.ld) && a.sections[0].transportation.name === 'KTX', '장거리 칸이 웹과 같다');
}
{
  const ps = [P1, P2, P3].map(p => JSON.parse(JSON.stringify(p)));
  const data = { result: { path: ps, rv: { v: 1, n: 3, keep: [2, 0], tabs: { 0: ['fast', 'sub'], 2: ['less'] }, why: { 0: '빨라요', 2: '환승이 적어요' }, split: { 0: { ride: 1, wait: 2, walk: 3, tot: 6, text: 't' }, 2: null } } } };
  const mine = E.resApplyRv({ result: JSON.parse(JSON.stringify(data.result)) }, JSON.parse(JSON.stringify(ps)));
  const theirs = web.rv(JSON.parse(JSON.stringify(data)), JSON.parse(JSON.stringify(ps)));
  ok(JSON.stringify(mine) === JSON.stringify(theirs), 'rv 적용이 웹과 같다(순서·탭·이유·나눔)');
  const bad = JSON.parse(JSON.stringify(data)); bad.result.rv.keep = [5];
  ok(E.resApplyRv(bad, ps).length === 3 && web.rv(bad, ps) === null, '이상한 rv 는 원래 순서 그대로');
}
// ② 탭 고르기
{
  const ps = [JSON.parse(JSON.stringify(P1)), JSON.parse(JSON.stringify(P2)), JSON.parse(JSON.stringify(P3))];
  const pk = E.resPickTabs(ps);
  ok(pk.fast === ps[0] && pk.less === ps[2] && pk.bus === ps[1] && pk.sub === null && pk.longdist === null, '탭 표시가 있으면 그 경로');
  const old = E.resPickTabs([{ info: { totalTime: 10 }, subPath: [] }]);
  ok(old.fast && old.sub === null && old.bus === null, '탭 표시 없는 옛 응답은 첫 경로가 최단시간');
}
// ③ 화면
const now = Date.UTC(2026, 9, 20, 3, 0, 0);
const DATA = { result: { path: [P1, P2, P3], rv: { v: 1, n: 3, keep: [0, 1, 2], tabs: { 0: ['fast', 'sub'], 1: ['bus'], 2: ['less'] }, why: { 0: '가장 빨라요', 1: '버스만 타요', 2: '환승이 적어요' }, split: { 0: { ride: 18, wait: 0, walk: 6, tot: 24, text: '승차 18분 · 도보·환승 6분' }, 1: null, 2: null } } } };
const call = (tab, extra) => E.resultScreen({ cap: 18 }, Object.assign({ data: DATA, tab, a: '부평', b: '두정', bt: null, rb: now, now, tz: 540, th: 'pastel', fav: 1 }, extra || {}));
const flat = ns => { const o = []; (function f(a) { a.forEach(n => { o.push(n); if (n.kids) f(n.kids); if (n.cells) o.push(...n.cells); }); })(ns); return o; };
{
  const o = call('fast');
  const ns = flat(o.body);
  ok(o.ok && o.screen === 'result' && o.body.length === 1 && o.body[0].t === 'panel' && /^e1:/.test(o.rev), '화면 모양(panel 하나)');
  ok(ns.some(n => n.t === 'rhd' && n.num === '24' && n.s === '부평 → 두정'), '머리줄: 24분 부평 → 두정');
  ok(ns.some(n => n.t === 'text' && /^전체 24분/.test(n.s)) && ns.some(n => n.t === 'text' && n.s === '가장 빨라요'), '요약 줄·이유');
  ok(ns.some(n => n.t === 'trk') && ns.some(n => n.s === '최단시간') && o.info.has.sub && o.info.has.bus && !o.info.has.longdist, '타임라인 · 탭 줄 · 있는 탭');
  ok(ns.some(n => /호차/.test(n.s || '')), '환승 호차·문 안내가 실린다');
  ok(o.info.m === 24 && o.info.n === 3 && o.info.tab === 'fast', 'info');
  ok(JSON.stringify(o.info.sec) === JSON.stringify(['수도권 1호선']) && JSON.stringify(call('bus').info.sec) === '[]', 'info.sec: 보이는 경로의 지하철 구간 이름');
}
{
  const o = call('bus'), ns = flat(o.body);
  ok(ns.some(n => n.t === 'rhd' && n.num === '31'), '버스 탭은 31분 경로');
  const s = call('sub', { data: { result: { path: [P2], rv: { v: 1, n: 1, keep: [0], tabs: { 0: ['bus'] }, why: { 0: '' }, split: { 0: null } } } } });
  ok(flat(s.body).some(n => n.t === 'rhd' && /지하철만/.test(n.msg || '')) && !flat(s.body).some(n => n.t === 'trk'), '지하철 경로가 없으면 안내만');
  ok(call('zzz').info.tab === 'fast', '모르는 탭은 최단시간');
}
// ④ 앱 검증기
{
  const screens = ['fast', 'less', 'bus'].map(t => call(t)).concat([call('sub', { data: { result: { path: [P2], rv: { v: 1, n: 1, keep: [0], tabs: { 0: ['bus'] }, why: { 0: '' }, split: { 0: null } } } } })]);
  const r = screenCheck(screens);
  ok(!r.err && r.out.length === 4 && r.out.every(l => /^OK/.test(l)), '앱 검증기 통과: ' + (r.err || r.out.join(' | ')));
}
// ④-b 장거리 다시 고르기 · 공지·제보 줄
{
  const mkLd = (grade, dep) => ({ info: { totalTime: 130, longDist: true, ldMode: 'train', ldGrade: grade, ldDepTs: dep, ldOptions: [{ grade: 'KTX', depTs: 100, depLabel: '10:00', fare: 59800 }, { grade: 'ITX', depTs: 200, depLabel: '11:00', fare: 40000 }], candidates: [{ mode: 'train', depTs: 100, depLabel: '10:00', totalMin: 130 }, { mode: 'expbus', depTs: 300, depLabel: '10:30', totalMin: 200 }], distKm: 300 },
    subPath: [{ trafficType: 4, lane: [{ name: grade }], sectionTime: 130, distance: 300000, startName: '서울', endName: '부산' }] });
  const D1 = { result: { path: [mkLd('KTX', 100)] } };
  const c = (extra) => E.resultScreen({ cap: 18 }, Object.assign({ data: D1, tab: 'longdist', a: '서울', b: '부산', now, tz: 540, th: 'dark', fav: 1 }, extra || {}));
  const o = c();
  ok(o.info.ld && o.info.ld.m.join() === '&ldMode=train&ldDepTs=100,&ldMode=expbus&ldDepTs=300' && o.info.ld.g[1] === '&ldMode=train&ldGrade=ITX&ldDepTs=200', '장거리 칩 눌림 번호 → 다시 물을 질의(엔진이 만든다)');
  ok(call('fast').info.ld === null, '장거리 탭이 아니면 ld 없음');
  const o2 = c({ ld2: { result: { path: [mkLd('ITX', 200)] } } });
  ok(JSON.stringify(flat(o2.body)).includes('ITX') && o2.info.ld.g.length === 2, '다시 받은 응답의 장거리 경로로 바꿔 끼운다');
  const o3 = c({ ld2: { result: { path: [] } } });
  ok(o3.ok && JSON.stringify(flat(o3.body)).includes('KTX'), '다시 받은 응답에 장거리가 없으면 그대로');
  const off = { ok: true, lines: { '수도권 1호선': { text: '수도권 1호선 열차 지연 안내', title: '지연', ts: now - 300000, estimated: 0 } } };
  const al = { ok: true, lines: { '수도권 1호선': { reporters: 4, stations: [{ stn: '부평', n: 3 }] } } };
  const n0 = call('fast'), n1 = call('fast', { off, al });
  ok(!flat(n0.body).some(n => /지연 제보/.test(n.s || '')) && flat(n1.body).some(n => /서울교통공사 공지/.test(n.s || '')) && flat(n1.body).some(n => /지연 제보 4명 \(부평 부근\)/.test(n.s || '')), '공지·제보 줄: 없으면 안 보이고, 있으면 엔진이 문장을 만든다');
  const rm = flat(n1.body).find(n => n.t === 'button' && n.s === '노선 방 보기');
  ok(rm && rm.act.v === 'rh.room.0' && n1.info.sec[0] === '수도권 1호선', '노선 방 보기 번호 = info.sec 번호');
  const r = screenCheck([o, o2, n1]);
  ok(!r.err && r.out.every(l => /^OK/.test(l)), '앱 검증기 통과(장거리·공지): ' + (r.err || r.out.join(' | ')));
}
// ⑤-b 세부경로 시트
{
  const dl = { la: 36.5, lo: 127.1, n: '두정역' };
  const d0 = call('fast', { view: 'detail', dl, me: [37.49, 126.72] });
  const f0 = flat(d0.body);
  ok(d0.ok && d0.screen === 'rdetail' && f0[0].t === 'bar' && f0[0].act.v === 'rd.close' && /^24분/.test(f0[0].title), '세부경로: 머리줄(분·닫기)');
  ok(f0.some(n => n.t === 'navrow' && /수도권 1호선/.test(n.title) && n.act.v === 'rd.tg.1') && d0.info.exp.join() === '1', '세부경로: 지하철 구간은 펼침 줄, info.exp = 구간 번호');
  ok(f0.some(n => n.t === 'text' && /도보/.test(n.s)), '세부경로: 도보 줄');
  ok(!f0.some(n => /^\u25cb|^\u25cf/.test(n.s || '')), '세부경로: 접힌 상태에는 정거장 목록이 없다');
  const d1 = call('fast', { view: 'detail', open: [1], dl, me: [37.49, 126.72], bt: now });
  const bx = flat(d1.body).find(n => n.t === 'box' && /\u25cf/.test(n.s || ''));
  ok(bx && bx.s.split('\n').length === 3 && /\d\d:\d\d$/.test(bx.s.split('\n')[0]) && bx.hl.length === 2, '세부경로: 펼치면 정거장마다 시각, 처음·끝 강조');
  ok(d1.info.nav && /^kakaomap:\/\/route\?sp=37.49,126.72&ep=36.5,127.1/.test(d1.info.nav.kakao[0]) && /^nmap:\/\/route\/public\?slat=37.49/.test(d1.info.nav.naver[0]) && /^https:/.test(d1.info.nav.kakao[1]) && /^https:/.test(d1.info.nav.naver[1]), '세부경로: 길안내 주소(앱·웹 대체)');
  ok(flat(d1.body).filter(n => n.t === 'button').length === 2, '세부경로: 길안내 단추 2개');
  const d2 = call('bus', { view: 'detail' });
  ok(d2.ok && d2.info.nav === null && !flat(d2.body).some(n => n.t === 'button'), '세부경로: 도착지 좌표가 없으면 길안내 단추 없음');
  ok(call('fast').body.some(n => n.t === 'button' && n.act && n.act.v === 'rh.detail') || flat(call('fast').body).some(n => n.t === 'button' && n.act && n.act.v === 'rh.detail'), '결과 카드: 세부경로 보기 단추');
  const r = screenCheck([d0, d1, d2, call('fast')]);
  ok(!r.err && r.out.every(l => /^OK/.test(l)), '앱 검증기 통과(세부경로): ' + (r.err || r.out.join(' | ')));
  ok(call('longdist', { view: 'detail' }).ok === false || true, '없는 탭이어도 죽지 않는다');
}
// ⑤ 이상한 입력
ok(E.resultScreen({ cap: 11 }, { data: DATA }).ok === false, 'cap 12 미만이면 만들지 않는다');
{
  const e1 = E.resultScreen({ cap: 18 }, null), e2 = E.resultScreen({ cap: 18 }, { data: { result: { path: 'x' } } }), e3 = E.resultScreen({ cap: 18 }, { data: { result: { path: [{ info: null, subPath: [null, 3, {}] }] } }, tab: 'fast' });
  ok(e1.ok && e2.ok && e3.ok && flat(e1.body).some(n => n.t === 'text' && n.s === '경로 정보가 없어요'), '경로가 없거나 깨져도 죽지 않고 안내를 낸다');
}
// ⑥ 워커 내장
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  ok(/\/\/ ===== RESULT ENGINE BEGIN =====/.test(w) && w.indexOf('if (url.pathname === "/screen/result") return handleScreenResult(request);') > 0, '워커에 내장됨');
}
console.log(pass + ' 통과 / ' + fail + ' 실패');
if (fail) process.exit(1);
