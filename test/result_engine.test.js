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
  ok(o.body[0].pad[0] === 14 && o.body[0].pad[2] === 14, 's175: 경로 카드 좌우 바깥 여백 14 — 입력 카드와 같다(웹 홈과 같은 너비 · 0 이면 화면 끝까지 닿는다)');
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
// ⑤-0 예상 경로 라벨 + 무지개 테두리(웹 preview-glow)
{
  const pv = call('fast', { bt: now + 2 * 3600000 }), p0 = pv.body[0];
  ok(p0.t === 'panel' && p0.glow === true && p0.kids[0].t === 'pill' && /^예상 경로 · /.test(p0.kids[0].s), '기준시각을 정하면 경로 카드 맨 위에 예상 라벨 + glow');
  const mt = call('fast', { metro: true }), pm = mt.body[0];
  ok(pm.glow === true && pm.kids[0].s === '노선도에서 설정한 경로', '노선도에서 정한 경로 라벨');
  const pn = call('fast').body[0];
  ok(!pn.glow && pn.kids[0].t !== 'pill', '현재 기준이면 라벨도 테두리도 없다');
  const rs = screenCheck([pv, mt]);
  ok(!rs.err && rs.out.every(l => /^OK/.test(l)), '앱 검증기 통과(예상 라벨): ' + (rs.err || rs.out.join(' | ')));
}
// ⑤-a 세부경로 줄(tdrow) — cap 20 이상 앱
{
  const c20 = (extra) => E.resultScreen({ cap: 20 }, Object.assign({ data: DATA, tab: 'fast', a: '부평', b: '두정', bt: null, rb: now, now, tz: 540, th: 'pastel', fav: 1, view: 'detail', dl: { la: 36.5, lo: 127.1, n: '두정역' }, me: [37.49, 126.72] }, extra || {}));
  const o = c20(), rows = flat(o.body).filter(n => n.t === 'tdrow');
  ok(o.ok && rows.length >= 2 && !flat(o.body).some(n => n.t === 'navrow'), 'tdrow: cap 20 은 줄 노드로 보낸다(옛 글 줄 없음)');
  ok(rows[0].pos === 'f' && rows[rows.length - 1].pos === 'l' && rows.slice(1, -1).every(r => r.pos === 'm'), 'tdrow: 첫 줄 f · 마지막 줄 l · 나머지 m');
  const sub = rows.find(r => r.ic === 's'), walk = rows.find(r => r.ic === 'w');
  ok(sub && /^#[0-9a-f]{6}$/i.test(sub.col) && /^rgba\(\d+,\d+,\d+,0\.1875\)$/.test(sub.trk) && /,0\.157\)$/.test(sub.ibg) && /,0\.133\)$/.test(sub.bbg) && sub.bfg === sub.col, 'tdrow: 지하철 색 · 레일(.1875) · 아이콘(.157) · 뱃지(.133) 투명도가 웹과 같다');
  ok(sub && sub.act && /^rd\.tg\.\d+$/.test(sub.act.v) && sub.ex === true && sub.dep > 0 && sub.arr > sub.dep && /\d\d:\d\d~\d\d:\d\d/.test(sub.rng), 'tdrow: 펼침 행동 · 구간 시각(ms) · 시간대');
  ok(walk && walk.col === 'sub' && walk.trk === 'border' && walk.ibg === 'card2' && !walk.act && /^도보|^환승/.test(walk.lab), 'tdrow: 도보는 sub/border/card2 색이고 눌러도 안 열린다');
  const o1 = c20({ open: [1], bt: now }), sr = flat(o1.body).filter(n => n.t === 'tdrow' && n.op === true)[0];
  ok(sr && sr.stops.length === 3 && sr.stops[0][2] === 1 && sr.stops[1][2] === 0 && sr.stops[2][2] === 1 && /^\d\d:\d\d$/.test(sr.stops[0][1]), 'tdrow: 펼치면 정거장 [이름, 시각, 끝점]');
  const leg = E.resultScreen({ cap: 19 }, { data: DATA, tab: 'fast', a: '부평', b: '두정', now, tz: 540, th: 'pastel', view: 'detail' });
  ok(leg.ok && !flat(leg.body).some(n => n.t === 'tdrow') && flat(leg.body).some(n => n.t === 'navrow'), 'tdrow: cap 20 미만 옛 앱은 예전 글 줄 모양');
  const dk = E.resultScreen({ cap: 20 }, { data: DATA, tab: 'bus', a: '부평', b: '두정', now, tz: 540, th: 'dark', view: 'detail' }), bs = flat(dk.body).filter(n => n.t === 'tdrow' && n.ic === 'b');
  ok(bs.length >= 1 && (bs.length >= 2 || bs[0].col === '#ffffff'), 'tdrow: 버스가 하나면 어두운 테마에서 흰색 · 둘 이상이면 웹 색 순서');
  const rs = screenCheck([o, o1]);
  ok(!rs.err && rs.out.every(l => /^OK/.test(l)), '앱 검증기 통과(tdrow): ' + (rs.err || rs.out.join(' | ')));
}
// ⑤-a2 세부경로 시트 웹 모양(cap 24): 머리(shd) · 앱이 바로 펼치는 줄 · 확정/지도 단추 줄
{
  const c24 = (extra, cap) => E.resultScreen({ cap: cap || 24 }, Object.assign({ data: DATA, tab: 'less', a: '부평', b: '두정', bt: null, rb: now, now, tz: 540, th: 'pastel', fav: 1, view: 'detail', dl: { la: 36.5, lo: 127.1, n: '두정역' }, me: [37.49, 126.72] }, extra || {}));
  const o = c24(), rows = flat(o.body).filter(n => n.t === 'tdrow');
  ok(o.ok && o.head.length === 1 && o.head[0].t === 'shd' && o.head[0].act.v === 'rd.close' && /분 · 부평 → 두정$/.test(o.head[0].title) && !flat(o.body).some(n => n.t === 'bar'), 'shd: 시트 머리(제목 · 닫기)는 head 에, 본문에 옛 bar 는 없다');
  ok(o.bg === 'card' && o.fl === false && o.info.opt === '최소환승', '시트 바탕은 카드색 · 아래 줄 맨 위 선 없음 · 옵션 이름은 엔진이 준다');
  const ex = rows.filter(r => r.ex);
  ok(ex.length >= 1 && ex.every(r => typeof r.i === 'number' && Array.isArray(r.stops) && r.stops.length >= 2 && !r.op), 'tdrow: 펼칠 줄은 번호(i)와 정거장을 처음부터 갖고, 접힌 채 온다(앱이 바로 펼친다)');
  const o1 = c24({ open: [ex[0].i] }); ok(flat(o1.body).filter(n => n.t === 'tdrow' && n.op === true).length === 1, 'tdrow: 서버가 기억하던 펼침은 op 로 처음 상태만 알린다');
  const ft = o.foot;
  ok(ft.length === 3 && ft[0].t === 'button' && ft[0].s === '\u2705 이 경로로 확정하기' && ft[0].fill === '#2f7cf6' && ft[0].act.v === 'rd.confirm' && ft[0].pad.join() === '14,10,14,0', '확정 단추: 웹과 같은 파랑 · 글 · 안쪽 여백(좌 14 · 위 10 · 우 14)');
  ok(ft[1].t === 'divider' && ft[2].t === 'row' && ft[2].pad.join() === '14,12,14,16' && ft[2].kids.length === 2 && /카카오맵 길안내$/.test(ft[2].kids[0].s) && /네이버지도$/.test(ft[2].kids[1].s), '지도 단추 줄: 위 선 · 12/14/16 여백 · 카카오 · 네이버');
  const rd = c24({ ride: { on: true } });
  ok(rd.foot[0].fill === '#30a14e' && /최소환승 경로로 확정됨$/.test(rd.foot[0].s) && rd.foot[0].act.v === 'rd.done', '확정되면 초록 \'○○ 경로로 확정됨\'(다시 눌러도 아무 일 없음)');
  const lg = c24({}, 23);
  ok(!lg.head.length && lg.body.some(n => n.t === 'bar') && !('foot' in lg), 'cap 23 이하 앱은 예전 모양 그대로(머리 bar · 본문 안 단추)');
  const bt = lg.body.filter(n => n.t === 'button'), rw = lg.body.find(n => n.t === 'row');
  ok(bt.every(b => b.pad.length === 4 && b.pad[0] === 14 && b.pad[2] === 14) && rw.pad[0] === 14 && rw.pad[2] === 14, '옛 앱 단추도 좌우 14 — 오른쪽으로 넘치지 않는다');
  const rs = screenCheck([o, o1, rd]);
  ok(!rs.err && rs.out.every(l => /^OK/.test(l)), '앱 검증기 통과(세부경로 시트): ' + (rs.err || rs.out.join(' | ')));
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
  ok(flat(d1.body).filter(n => n.t === 'button' && /^rd\.(kakao|naver)$/.test(n.act.v)).length === 2, '세부경로: 길안내 단추 2개');
  const d2 = call('bus', { view: 'detail' });
  ok(d2.ok && d2.info.nav === null && !flat(d2.body).some(n => n.t === 'button' && /^rd\.(kakao|naver)$/.test(n.act.v)), '세부경로: 도착지 좌표가 없으면 길안내 단추 없음');
  ok(flat(d2.body).some(n => n.t === 'button' && n.act.v === 'rd.confirm') && !flat(d2.body).some(n => n.act && n.act.v === 'rd.stop'), '세부경로: 탑승 전에는 [이 경로로 탑승 시작]');
  const d3 = call('fast', { view: 'detail', ride: { on: 1, text: '다음 부평' } });
  ok(flat(d3.body).some(n => n.t === 'button' && n.act.v === 'rd.stop') && !flat(d3.body).some(n => n.act && n.act.v === 'rd.confirm'), '세부경로: 탑승 중에는 [탑승 안내 종료]');
  const c3 = call('fast', { ride: { on: 1, text: '다음 부평 12:03 \u00b7 두정까지 2정거장' } });
  ok(!flat(c3.body).some(n => n.t === 'box' && /탑승 안내 중/.test(n.s)) && flat(c3.body).some(n => n.t === 'button' && n.act.v === 'rh.stop') && flat(c3.body).some(n => n.t === 'button' && n.act.v === 'rh.detail'), '결과 카드: 탑승 중에는 [안내 종료] ("탑승 안내 중" 상태 박스는 없다 — 탑승 시트가 같은 줄을 보여 준다)');
  const rowA = { slot: 'transfer', label: '환승', leg: 1, can: true, anim: { kind: 'slide_down', ms: 380, ease: [0.2, 0, 0, 1], sq: 1791862800123, o: 'board' } };
  const call21 = (row) => E.resultScreen({ cap: 21 }, { data: DATA, tab: 'fast', a: '부평', b: '두정', bt: null, rb: now, now, tz: 540, th: 'pastel', fav: 1, ride: { on: 1, text: '다음 부평', row } });
  const s1 = call21(rowA), srow = flat(s1.body).find(n => n.t === 'row' && n.kids.some(q => q.act && q.act.v === 'rh.stop'));
  ok(srow && srow.kids.length === 2 && !srow.an && !srow.kids.some(q => q.act && q.act.v === 'rh.slot'), '버튼 줄: 오른쪽 [탑승/환승/도착] 칸은 없다(하단 알약과 중복 — s223)');
  const s2 = call21({ slot: 'board', label: '탑승', leg: 0, can: true, anim: { kind: 'none', ms: 0, ease: [0.2, 0, 0, 1], sq: 0, o: 'none' } }), r2 = flat(s2.body).find(n => n.t === 'row' && n.kids.some(q => q.act && q.act.v === 'rh.stop'));
  ok(r2 && r2.kids.length === 2 && !r2.an, '탑승 칸 값이 와도 칸을 안 그린다');
  const rOld = E.resultScreen({ cap: 20 }, { data: DATA, tab: 'fast', a: '부평', b: '두정', bt: null, rb: now, now, tz: 540, th: 'pastel', fav: 1, ride: { on: 1, text: '다음 부평', row: rowA } });
  ok(flat(rOld.body).find(n => n.t === 'row' && n.kids.some(q => q.act && q.act.v === 'rh.stop')).kids.length === 2, '옛 앱(cap 20)에는 칸을 안 보낸다');
  ok(call21(null) && flat(call21(null).body).find(n => n.t === 'row' && n.kids.some(q => q.act && q.act.v === 'rh.stop')).kids.length === 2, '엔진 값이 없으면 두 칸');
  const rs2 = screenCheck([s1, s2]);
  ok(!rs2.err && rs2.out.every(l => /^OK/.test(l)), '앱 검증기 통과(버튼 줄 칸): ' + (rs2.err || rs2.out.join(' | ')));
  const k0 = flat(call('fast').head.concat(call('fast').body)).find(n => n.t === 'trk');
  const lvs = call('fast', { lv: { cur: 2, pos: { from: 1, to: 2, ratio: 0.4 }, arr: ['', '12:05', '12:09', '12:20'] } });
  const k1 = flat(lvs.head.concat(lvs.body)).find(n => n.t === 'trk');
  ok(k0 && !k0.mk && k1 && k1.mk && k1.mk.r === 0.4 && k1.cells.some(c => c.t === '12:05'), '탑승 중 내 위치 마커 · 칸별 시각(lv)');
  const k2 = flat(call('fast', { lv: { cur: 1, arr: [] } }).body.concat(call('fast', { lv: { cur: 1, arr: [] } }).head)).find(n => n.t === 'trk');
  ok(k2 && k2.mk && k2.mk.r === 0, '위치(pos)를 모르면 현재 노드에 선다');
  const lvw = call('fast', { lv: { cur: 1, pos: { from: 1, to: 2, ratio: 0.4 }, arr: ['', '12:05', '12:09', '12:20'], wait: { i: 1, d: 120 } } });
  const kw = flat(lvw.head.concat(lvw.body)).find(n => n.t === 'trk');
  ok(kw && kw.mk && kw.mk.pu === 'w' && kw.mk.r === 0 && kw.mk.f === kw.mk.t && kw.mk.bt === '대기 중 · 120m', '승차 대기 중(lv.wait): 마커가 탑승 지점에 서서 주황 맥박 + 거리 배지(s225)');
  const kw2 = flat(call('fast', { lv: { cur: 1, arr: [], wait: { i: 1 } } }).body.concat(call('fast', { lv: { cur: 1, arr: [], wait: { i: 1 } } }).head)).find(n => n.t === 'trk');
  ok(kw2 && kw2.mk && kw2.mk.pu === 'w' && kw2.mk.bt === '대기 중', '위치를 모르면 배지는 거리 없이');
  const rs = screenCheck([d3, c3, lvs]);
  ok(!rs.err && rs.out.every(l => /^OK/.test(l)), '앱 검증기 통과(탑승 중): ' + (rs.err || rs.out.join(' | ')));
  ok(call('fast').body.some(n => n.t === 'button' && n.act && n.act.v === 'rh.detail') || flat(call('fast').body).some(n => n.t === 'button' && n.act && n.act.v === 'rh.detail'), '결과 카드: 세부경로 보기 단추');
  {   // s147: 안내 전 버튼 줄 = [세부경로 보기][경로 확정](웹 routeActRow) — cap 22 부터
    const idle = (cap) => E.resultScreen({ cap }, { data: DATA, tab: 'fast', a: '부평', b: '두정', bt: null, rb: now, now, tz: 540, th: 'pastel', fav: 1 });
    const rw = (s) => flat(s.body).find(n => n.t === 'row' && n.kids.some(q => q.act && q.act.v === 'rh.detail'));
    const i22 = rw(idle(22)), i21 = rw(idle(21));
    ok(i22 && i22.kids.length === 2 && i22.kids[1].act.v === 'rh.confirm' && i22.kids[1].s === '경로 확정' && i22.kids[1].fill === '#2f7cf6' && i22.kids[1].tc === '#ffffff' && !i21, '안내 전 버튼 줄: cap 22 에는 [세부경로 보기][경로 확정], 옛 앱에는 세부경로 단추 하나');
    const rs3 = screenCheck([idle(22)]);
    ok(!rs3.err && rs3.out.every(l => /^OK/.test(l)), '앱 검증기 통과(안내 전 버튼 줄): ' + (rs3.err || rs3.out.join(' | ')));
  }
  const r = screenCheck([d0, d1, d2, call('fast')]);
  ok(!r.err && r.out.every(l => /^OK/.test(l)), '앱 검증기 통과(세부경로): ' + (r.err || r.out.join(' | ')));
  ok(call('longdist', { view: 'detail' }).ok === false || true, '없는 탭이어도 죽지 않는다');
}
// ⑤ 이상한 입력
ok(E.resultScreen({ cap: 11 }, { data: DATA }).ok === false, 'cap 12 미만이면 만들지 않는다');
{
  const e1 = E.resultScreen({ cap: 18 }, null), e2 = E.resultScreen({ cap: 18 }, { data: { result: { path: 'x' } } }), e3 = E.resultScreen({ cap: 18 }, { data: { result: { path: [{ info: null, subPath: [null, 3, {}] }] } }, tab: 'fast' });
  ok(e1.ok && e2.ok && e3.ok && flat(e1.body).some(n => n.t === 'text' && n.s === '경로 정보가 없어요'), '경로가 없거나 깨져도 죽지 않고 안내를 낸다');
  { // 2026-10-25 경로 0건의 이유 — 웹 _svcShowNoRoute · '경로를 찾지 못했어요' 와 같은 갈래
    const txt = d => flat(E.resultScreen({ cap: 40000 }, { data: d }).body).filter(n => n.t === 'text').map(n => n.s).join(' | ');
    const night = txt({ result: { path: [] }, liveStat: { subOff: 20, svcOff: 76, subOffList: ['1호선'], svcOffList: [{ no: '101', state: 'after' }], subFirstTrain: '05:07' } });
    ok(/지하철·버스 지금은 운행이 끝났어요/.test(night) && /지하철 첫차 05:07/.test(night) && /노선마다 첫차가 달라요/.test(night), '밤: 운행 종료 + 첫차 — ' + night);
    const before = txt({ result: { path: [] }, liveStat: { svcOff: 5, svcOffList: [{ no: '9', state: 'before' }, { no: '8', state: 'before' }] } });
    ok(/^버스 지금은 아직 운행 시작 전이에요/.test(before) && !/지하철 첫차/.test(before), '버스만 전부 시작 전: ' + before);
    const nocov = txt({ result: { path: [] }, liveStat: {}, warnings: ['출발·도착 2.5km 안을 지나는 버스 노선이 없습니다'] });
    ok(/이 지역은 아직 길 안내 정보가 없어요/.test(nocov) && /가까운 역이나 큰 정류장/.test(nocov), '노선 자료 없는 지역: ' + nocov);
    const gen = txt({ result: { path: [] } });
    ok(/^경로 정보가 없어요/.test(gen) && /경로를 찾지 못했어요/.test(gen), '그 밖: ' + gen);
    const odd = txt({ result: { path: [] }, liveStat: 'x', warnings: 5 });
    ok(/경로 정보가 없어요/.test(odd), '이상한 입력에도 죽지 않는다');
  }
}
// ⑤-b 승차 전 '내 위치' 점(웹 htl-gps-marker-dot): 탑승 추적(lv)이 없어도 출발이 내 위치면 처음 칸, 아니면 600m 안 가까운 역·정류장 칸
{
  const trk = o => flat(o.head.concat(o.body)).find(n => n.t === 'trk');
  const t0 = trk(call('fast', { a: '내 위치', me: [37.5, 126.8] }));
  ok(t0 && t0.mk && t0.mk.f === 0 && t0.mk.t === 0 && t0.mk.ms === 0 && t0.mk.pu === 'b', '출발이 내 위치면 점이 처음 칸에 놓인다(승차 대기 아님 · 곧바로)');
  ok(!trk(call('fast', { a: '부평', me: [10, 10] })).mk, '출발이 내 위치가 아니고 역에서 멀면 점 없음');
  ok(!trk(call('fast', { a: '내 위치' })).mk && !trk(call('fast', { a: '내 위치', me: [999, 5] })).mk, '위치를 모르거나 이상하면 점 없음');
  const near = trk(call('fast', { a: '부평', me: [37.49, 126.72] }));
  ok(near && near.mk && near.mk.f >= 0, '가까운 역이 있으면 그 칸에 점');
  const lv = trk(call('fast', { a: '내 위치', me: [37.5, 126.8], lv: { cur: 1, arr: [] } }));
  ok(lv && lv.mk && lv.mk.f === 1, '탑승 추적이 있으면 추적 위치가 우선');
}
// ⑤-2 경로 통합 카드 (s217): 환승 긴 목록 상자 → 요약 칩 줄, AI 승무원이 합쳐질 자리, 세부경로 시트 맨 위 환승 순서, '부산_부산' 이름 정리
{
  const XP = JSON.parse(JSON.stringify(P3));
  XP.info.transfers = [{ kind: 'transfer', at: '광명_광명', walkMin: 3, toType: 1, toLine: '1호선', fromType: 4, fromLine: 'KTX' }, { kind: 'transfer', at: '구로', walkMin: 2, toType: 2, toLine: '77', fromType: 1, fromLine: '1호선' }];
  XP.subPath.splice(1, 0, Object.assign(sub('부산_부산', '구로', 'KTX', 10), { trafficType: 4 }));
  XP.subPath.filter(q => q.trafficType === 1).forEach((q, qi, arr) => { if (qi === 0) q.xfer = { dropCar: '4', dropDoor: '2', boardCar: '5', boardDoor: '1', to: '2', secs: 90 }; if (qi === arr.length - 1) q.exitFast = [{ fac: '엘리베이터', door: '7-2' }]; });
  const xd = { result: { path: [XP] } };
  const xc = (cap, extra) => E.resultScreen({ cap }, Object.assign({ data: xd, tab: 'fast', a: '부산_부산', b: '두정', bt: null, rb: now, now, tz: 540, th: 'pastel', fav: 1 }, extra || {}));
  const o25 = xc(25), o24 = xc(24);
  const k25 = o25.body[0].kids, k24 = o24.body[0].kids;
  ok(o25.ok && !k25.some(n => n.t === 'box' && /^환승 2번/.test(n.s)), '통합 카드: 환승 1~N번 긴 상자가 홈 카드에서 빠졌다');
  ok(k24.some(n => n.t === 'box' && /^환승 2번/.test(n.s)) && !k24.some(n => n.t === 'tags' || n.slot), '옛 앱(규격 24)은 예전 모양 그대로(상자 · 칩 줄 없음 · 자리 없음)');
  const ki = k25.findIndex(n => n.t === 'trk'), si = k25.findIndex(n => n.slot === 'ai'), bi = k25.length - 1;
  ok(!k25.some(n => n.t === 'tags') && ki > 0, 's218: 홈 카드에 요약 칩 줄이 없다(YJ 요청 — 환승 횟수는 AI 브리핑 첫 문장이 말로)');
  ok(si > ki && bi === si + 1 && k25[si].t === 'spacer' && k25[si].h === 0, 'AI 승무원 자리(slot)는 타임라인 아래 · 버튼 줄 위');
  const tf = E.resTagFacts ? E.resTagFacts : null;
  ok(!/_/.test(JSON.stringify(o25.body)), "'광명_광명' 같은 겹친 이름이 화면 어디에도 없다");
  ok(/부산 \u2192 두정/.test(k25[0].s) && !/부산_부산/.test(JSON.stringify(o25.body)), "머리줄·타임라인 어디에도 '부산_부산' 이 남지 않는다");
  const det = xc(25, { view: 'detail' });
  ok(det.ok && det.body[0].t === 'box' && /^환승 2번\n1\. 광명에서/.test(det.body[0].s) && det.body[0].s.indexOf('2. 구로에서') > 0, '세부경로 시트 맨 위에 환승 1~N번 순서');
  ok(!(xc(24, { view: 'detail' }).body || []).some(n => n.t === 'box' && /^환승 2번/.test(n.s)), '옛 앱 세부경로 시트는 그대로');
  const dbx = det.body.find(n => n.t === 'box' && /^호차·문 안내/.test(n.s));
  ok(dbx && /4호차 2번 문에서 내리면/.test(dbx.s) && /하차:/.test(dbx.s) && det.body.indexOf(dbx) === 1, 's219: 호차·문 안내가 세부경로 시트 환승 순서 바로 아래로 옮겨 왔다');
  ok(!(xc(24, { view: 'detail' }).body || []).some(n => n.t === 'box' && /^호차·문 안내/.test(n.s)), 's219: 옛 앱 세부경로 시트에는 호차·문 상자 없음');
  const chk = screenCheck([o25, det, o24]);
  ok(!chk.err && chk.out.every(l => l.startsWith('OK ')) && chk.out.every(l => Number(l.split(' ')[2]) === 0), '앱 검증기 통과 · 건너뛴 노드 없음 ' + (chk.err || chk.out.join('|')));
  ok(E.resNmFix('부산_부산') === '부산' && E.resNmFix('부산역_부산') === '부산역' && E.resNmFix('서울_1호선') === '서울_1호선' && E.resNmFix('서울') === '서울', 'resNmFix');
}
// ⑥ 워커 내장
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  ok(/\/\/ ===== RESULT ENGINE BEGIN =====/.test(w) && w.indexOf('if (url.pathname === "/screen/result") return handleScreenResult(request);') > 0, '워커에 내장됨');
}
console.log(pass + ' 통과 / ' + fail + ' 실패');
if (fail) process.exit(1);
