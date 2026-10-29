// 홈 카드 묶음 엔진(engine/hcards.js) 시험.  실행: node test/hcards_engine.test.js   (javac · java 필요)
const fs = require('fs'), path = require('path');
const E = require('../engine/hcards'), screenCheck = require('./helpers/screen_check');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const now = Date.UTC(2026, 9, 20, 23, 30, 0);              // KST 08:30 (출근 피크)
const walk = t => ({ trafficType: 3, sectionTime: t, distance: t * 70 });
const sub = (a, b, n, t) => ({ trafficType: 1, lane: [{ name: n }], sectionTime: t, distance: t * 600, startName: a, endName: b, passStopList: { stations: [{ stationName: a, y: 37.49, x: 126.72 }, { stationName: '중간', y: 37.5, x: 126.8 }, { stationName: b, y: 37.52, x: 126.9 }] } });
const bus = (no, t) => ({ trafficType: 2, lane: [{ busNo: no }], sectionTime: t, distance: t * 400, startName: '정류장A', endName: '정류장B', passStopList: { stations: [{ stationName: '정류장A' }, { stationName: '정류장B' }] } });
const mk = subPath => ({ result: { path: [{ info: { totalTime: 24, totalDistance: 9000, transferCount: 0, tab: 'fast' }, subPath }] } });
const base = (extra) => Object.assign({ now, tz: 540, th: 'dark', hol: false, gps: null, r: { data: mk([walk(3), sub('부평', '강남', '수도권 1호선', 18), walk(3)]), tab: 'fast', a: '부평', b: '강남', bt: null, rb: now }, ai: { nextAt: now + 300000, busy: false, rnd: 0.2 }, tk: { m: [['하늘', '오늘 2호선 괜찮아요', now - 60000, 0], ['나', '출근 중', now - 30000, 1]], fold: 0, tzo: -540 } }, extra || {});
const call = f => E.hcardsScreen({ cap: 18 }, f);
const flat = ns => { const o = []; (function f(a) { a.forEach(n => { o.push(n); if (n.kids) f(n.kids); }); })(ns); return o; };
const txt = ns => flat(ns).map(n => n.s || '').join('\n');

ok(E.hcardsScreen({ cap: 17 }, base()).ok === false && call({}).ok === false, 'cap 18 미만 · now 없으면 만들지 않는다');
let o = call(base());
ok(o.ok && o.screen === 'hcards' && o.body.map(n => n.t).join() === 'sec,panel,sec,panel,panel' && /^h1:/.test(o.rev), '카드 세 장 + 제목줄 둘(혼잡도 · AI 승무원 · 대화 — 웹 홈과 같은 순서)');
ok(o.body[0].s === '길동무 친구들' && o.body[0].btn === '\uD83D\uDCCD 위치 공유' && o.body[0].act.v === 'share.loc' && o.body[0].pad.join() === '14,0,14,6' && o.body[2].s === '길동무 브리핑' && o.body[2].pad.join() === '14,0,14,6', '제목줄: 혼잡도(+위치 공유 단추) · 길동무 브리핑');
ok(o.body[1].lb === 4 && o.body[1].pad.join() === '14,0,14,14' && o.body[3].ip.join() === '16,14,16,14' && o.body[3].r === 16 && o.body[4].ip.join() === '12,10,12,10' && o.body[4].r === 14 && o.body[4].pad.join() === '14,0,14,22', '카드 치수: 혼잡도 왼쪽 4px 띠 · AI 14/16 · 대화 10/12 모서리 14 · 맨 아래 22');
const nodes = flat(o.body);
const RD_SUB = { here: 1, boarded: true, key: 's', nodes: [{ name: '출발', isOrigin: true }, { name: '부평', isSub: true, lineName: '1호선' }, { name: '강남', isSub: true, lineName: '1호선' }] };      // 지하철 타고 가는 중: 웹은 이때만 장면을 접고 혼잡도 본문을 보인다
const oRide = call(base({ rd: RD_SUB })), nodesRide = flat(oRide.body);
ok(!nodes.some(n => n.t === 'cgh' || n.t === 'gauge' || n.t === 'chart') && o.body[1].kids.length === 1 && o.body[1].kids[0].t === 'scene' && o.body[1].ip.join() === '15,10,10,10', '장면이 보일 땐 혼잡도 본문을 숨기고 장면만(웹 .cs-on)');
const aih = nodes.find(n => n.t === 'aih');
ok(aih && /부평 → 강남 · 남은시간: 24분/.test(aih.s) && aih.act.v === 'ai.refresh' && aih.to === now + 300000, 'AI 제목: 출발 → 도착 · 남은시간, 새로고침, 다음 갱신 시각');
ok(o.info.ai === 'brief' && /24분/.test(txt(o.body)) && /1호선/.test(txt(o.body)), 'AI 본문: 소요·노선 문장을 엔진이 만든다');
const cgh = nodesRide.find(n => n.t === 'cgh');
ok(cgh && /부평/.test(cgh.nm + cgh.lab) && nodesRide.some(n => n.t === 'gauge') && nodesRide.some(n => n.t === 'chart') && oRide.info.cong === 'sub' && oRide.info.stn === '부평' && oRide.body[1].ip.join() === '17,14,14,14' && oRide.body[0].badge.length > 0, '혼잡도: 처음 타는 역(부평) 기준 게이지·24시간 막대');
ok(o.body[0].s2 === undefined, '제목(YJ 2026-10-29): 장면 카드일 땐 "길동무 친구들" 하나뿐(두 번째 제목 없음)');
ok(oRide.body[0].s === '혼잡도' && ((typeof oRide.body[1].sc2 === 'string' && oRide.body[1].sc2.length > 0) === (oRide.body[0].s2 === '길동무 친구들(이동중)')) && (oRide.body[0].s2 === undefined || oRide.body[0].s2 === '길동무 친구들(이동중)'), '제목: 지하철 타고 가는 중엔 "혼잡도", 객실 장면 쪽이 있으면 둘째 제목 "길동무 친구들(이동중)"을 함께 내린다');
console.log('  [info] 타는 중 둘째 쪽 =', !!oRide.body[1].sc2, '· s2 =', oRide.body[0].s2);
ok(nodes.some(n => n.t === 'ltr' && n.nick === '하늘') && nodes.some(n => n.t === 'inbar' && n.key === 'talk.in') && nodes.some(n => n.t === 'lth' && n.act.v === 'tk.open'), '대화: 최근 줄 · 입력줄 · 머리줄 누름');
// s217 경로 통합 카드: 규격 25 + 보던 경로가 있으면 AI 승무원은 제목줄 없이 into:'ai' 카드 하나로 맨 앞에 오고, 브리핑이 짧아지며, 규격 24 이하는 예전 그대로
{
  const f25 = E.hcardsScreen({ cap: 25 }, base()), f24 = E.hcardsScreen({ cap: 24 }, base());
  ok(f25.ok && f25.body.map(n => n.t).join() === 'panel,sec,panel,panel' && f25.body[0].into === 'ai' && !f25.body.some(n => n.t === 'sec' && n.s === '길동무 브리핑'), '통합: AI 카드가 맨 앞 · into:ai · 제목줄 없음');
  ok(!flat(f25.body[0].kids).some(n => n.t === 'aih'), 's218: 통합 카드의 AI 부분에는 제목줄(브리핑 · 카운트다운 · 새로고침)이 없다');
  const t25 = txt(f25.body[0].kids);
  ok(/^환승은 없고 도착은 \d\d:\d\d경 예정이에요\. 총 24분 걸려요\./.test(t25) && /부평에서 .*1호선 탑승 후 강남 하차\./.test(t25) && !/5분마다/.test(t25), '통합: 환승 · 도착 · 총 시간 한 문장 + 경로를 말로(맺음말 없음) — ' + t25.replace(/\n/g, ' / '));
  ok(f24.body.map(n => n.t).join() === 'sec,panel,sec,panel,panel' && !f24.body.some(n => n.into) && /부평 → 강남 · 남은시간: 24분/.test(flat(f24.body).find(n => n.t === 'aih').s), '규격 24 이하는 예전 모양 그대로');
  const noRoute = E.hcardsScreen({ cap: 25 }, base({ r: null, gps: [37.5, 127.0] }));
  ok(noRoute.ok && !noRoute.body.some(n => n.into) && noRoute.body.some(n => n.t === 'sec' && n.s === '길동무 브리핑'), '경로가 없으면 합칠 곳이 없어 예전 모양');
  const dup = E.hcardsScreen({ cap: 25 }, base({ r: { data: mk([walk(3), sub('부산_부산', '강남', '수도권 1호선', 18)]), tab: 'fast', a: '부산_부산', b: '강남', bt: null, rb: now } }));
  ok(!/부산_부산/.test(JSON.stringify(dup.body)), "'부산_부산' 이 브리핑에 안 나온다");
  const c = screenCheck([f25, f24]);
  ok(!c.err && c.out.every(l => l.startsWith('OK ')), '앱 검증기 통과 ' + (c.err || c.out.join('|')));
}
// s307(YJ): 장거리 '다른 편'을 고르면(ld2) 브리핑도 그 편 기준으로 바뀐다
{
  const ldp = (name, tot) => ({ info: { totalTime: tot, longDist: true, ldMode: 'train', ldGrade: name, ldDepTs: now + 600000, candidates: [], distKm: 300 }, subPath: [{ trafficType: 4, lane: [{ name }], sectionTime: tot, distance: 300000, startName: '서울', endName: '부산', passStopList: { stations: [{ stationName: '서울' }, { stationName: '부산' }] } }] });
  const D1 = { result: { path: [ldp('KTX', 180)] } }, D2 = { result: { path: [ldp('무궁화호', 300)] } };
  const lf = (extra) => base({ r: Object.assign({ data: D1, tab: 'longdist', a: '서울', b: '부산', bt: null, rb: now }, extra) });
  const t1 = txt(E.hcardsScreen({ cap: 25 }, lf({})).body), t2 = txt(E.hcardsScreen({ cap: 25 }, lf({ ld2: D2 })).body);
  ok(/서울에서 KTX 탑승 후 부산 하차\. \(3시간 소요\)/.test(t1) && !/무궁화호/.test(t1), '장거리 브리핑: 처음 고른 편(KTX)');
  ok(/서울에서 무궁화호 탑승 후 부산 하차\. \(5시간 소요\)/.test(t2) && !/KTX/.test(t2), '다른 편(ld2)을 고르면 브리핑도 그 편(무궁화호 5시간)');
  const t3 = txt(E.hcardsScreen({ cap: 25 }, lf({ ld2: D2, tab: 'fast' })).body);
  ok(!/무궁화호/.test(t3), '장거리 탭이 아니면 ld2 는 브리핑에 안 끼어든다');
}
// 기준시각을 정한 탐색 → 예상 브리핑
o = call(base({ r: { data: mk([sub('부평', '강남', '수도권 1호선', 18)]), tab: 'fast', a: '부평', b: '강남', bt: now + 3 * 3600000, rb: now } }));
ok(o.info.ai === 'preview' && /예상/.test(flat(o.body).find(n => n.t === 'aih').s), '기준시각을 정하면 예상 브리핑');
{ // 예상(기준시각을 미래로) — 혼잡도·AI 카드 맨 위에 주황 알약 + 무지개 테두리(웹 preview-glow), 현재 기준이면 없다
  const panels = o.body.filter(n => n.t === 'panel'), pills = flat(o.body).filter(n => n.t === 'pill');
  ok(panels.length >= 2 && panels[0].glow === true && panels[0].kids[0].t === 'pill' && /^예상 혼잡도 · /.test(panels[0].kids[0].s) && panels[1].glow === true && /^예상 브리핑 · /.test(panels[1].kids[0].s), '예상: 혼잡도·브리핑 카드에 라벨 + glow');
  ok(/(오늘|내일|\d+\/\d+\(.\)) (오전|오후) \d+:\d\d$/.test(pills[0].s), '예상 라벨의 기준시각 글(오늘/내일/날짜 + 오전/오후 시:분)');
  const o0 = call(base());
  ok(!flat(o0.body).some(n => n.t === 'pill') && !o0.body.some(n => n.glow), '현재 기준이면 라벨도 테두리도 없다');
}
// 첫 구간이 버스 → 버스 혼잡도 모드
o = call(base({ r: { data: mk([walk(2), bus('6', 20)]), tab: 'fast', a: '집', b: '회사', bt: null, rb: now }, rd: { here: 1, boarded: true, key: 'b', nodes: [{ name: '출발', isOrigin: true }, { name: 'A정류장', isBus: true, lineName: '6' }, { name: 'B정류장', isBus: true, lineName: '6' }] } }));
ok(o.info.cong === 'bus' && o.info.stn === '정류장A' && o.body[1].kids[0].t === 'scene', '첫 구간이 버스면 버스 혼잡도 안내');
// 경로 없음 + 위치 → 가까운 역 기준
o = call(base({ r: null, gps: [37.4979, 127.0276] }));
ok(o.info.near === '강남' && o.info.cong === 'sub' && o.info.stn === '강남' && o.info.ai === 'brief' && flat(o.body).some(n => n.t === 'aih' && /강남/.test(n.s)), '경로 없이 위치만: 가까운 역(강남) 기준 브리핑·혼잡도');
// 내 위치 공유 단추: 웹처럼 제목줄 오른쪽에 늘 있다(경로가 없으면 앱이 안내창을 띄운다)
o = call(base({ r: { data: mk([sub('부평', '강남', '수도권 1호선', 18)]), tab: 'fast', a: '부평', b: '강남', bt: null, rb: now } }));
{ const sb = flat(o.body).filter(n => n.act && n.act.v === 'share.loc'); ok(sb.length === 1 && sb[0].t === 'sec', '공유 단추: 제목줄에 하나'); }
// 아무 사실도 없음
// s216: 동 이름(f.dong)을 알면 그 이름 기준으로, 가까운 역이 없는 곳(제주 바다 한가운데 등)에서도 '내 위치' 기준으로 브리핑이 열린다
o = call(base({ r: null, gps: [37.4979, 127.0276], dong: '역삼동' }));
ok(o.info.ai === 'brief' && flat(o.body).some(n => n.t === 'aih' && /^역삼동 · /.test(n.s) && !/강남/.test(n.s)) && flat(o.body).some(n => /역삼동/.test(n.s || '') && !/aih/.test(n.t)), '경로 없이 위치+동 이름: 제목·문장이 동 이름(역삼동) 기준 ' + JSON.stringify(flat(o.body).filter(n => n.t === 'aih').map(n => n.s)));
ok(o.info.near === '강남' && o.info.cong === 'sub', '혼잡도 카드는 그대로 가까운 역 기준');
o = call(base({ r: null, gps: [33.0, 124.0] }));
ok(o.info.ai === 'brief' && flat(o.body).some(n => n.t === 'aih' && /^내 위치 · /.test(n.s)), '가까운 역도 동 이름도 없으면 내 위치 기준(빈 안내 대신 브리핑)');
o = call(base({ r: null, gps: [37.4979, 127.0276] }));
ok(flat(o.body).some(n => n.t === 'aih' && /강남/.test(n.s)), '동 이름이 없으면(옛 앱) 가까운 역 이름 그대로');
o = call(base({ r: { data: mk([walk(3), sub('부평', '강남', '수도권 1호선', 18), walk(3)]), tab: 'fast', a: '부평', b: '강남', bt: null, rb: now }, gps: [37.4979, 127.0276], dong: '역삼동' }));
ok(flat(o.body).some(n => n.t === 'aih' && /부평/.test(n.s) && !/역삼동/.test(n.s)), '경로가 있으면 동 이름은 쓰지 않는다');
o = call(base({ r: null, gps: null }));
ok(!JSON.stringify(o.body[1]).includes('길동무 브리핑') && o.body[2].s === '길동무 브리핑' && JSON.stringify(o.body[4]).includes('실시간'), '순서: 혼잡도 장면 → AI 승무원 → 실시간 대화(웹 홈과 같다)');
ok(o.ok && o.info.ai === 'empty' && o.info.cong === 'none' && o.body.length === 5, '아무것도 없으면 안내 문구');
ok(E.hcNearest(0, 0) === null && E.hcNearest(37.4979, 127.0276)[0] === '강남', '가까운 역 3km 안');
// 캐릭터 장면: 혼잡도 카드 맨 위에 엔진이 정한 장면(JSON 글)이 실린다
{
  const sc = call(base({ gps: [37.5, 127.0], wx: { wF: { temp: -3, txt: '눈', rain: 80 } } })).body[1].kids[0];
  const v = sc && sc.t === 'scene' ? JSON.parse(sc.sc) : null;
  ok(sc && sc.t === 'scene' && sc.h >= 80 && sc.sc.length < 6000 && v && v.mode === 'idle' && v.cast.length === 8 && v.hero && v.look.wk === 'snow', '혼잡도 카드 맨 위에 장면(idle · 눈) 노드가 있다');
  const a = JSON.stringify(call(base()).body[1].kids[0]), b = JSON.stringify(call(base()).body[1].kids[0]);
  ok(a === b, '같은 사실이면 같은 장면(안 흔들린다)');
  // s246 (YJ: 배경 날씨는 사용자가 있는 곳 날씨): 장면 날씨는 기기 위치(gps) 날씨만 — 위치를 모르면 경로 출발역 날씨로 대신하지 않는다
  const sw = g => { const k = call(base({ gps: g, wx: { wF: { temp: 12, txt: '비', rain: 90 } } })).body[1].kids[0]; return k && k.t === 'scene' ? JSON.parse(k.sc) : null; };
  const wg = sw([37.5, 127.0]), wn = sw(null);
  ok(wg && wg.look.wk === 'rain' && wg.look.wxKnown === true, '내 위치를 알면 그 곳 날씨(비)로 배경이 정해진다');
  ok(wn && wn.look.wk === 'clear' && wn.look.wxKnown === false, '위치를 모르면 경로 출발역 날씨로 대신하지 않는다(날씨 모름)');
  ok(wg.look.pdir === 1 || wg.look.pdir === -1, '장소가 바뀔 때 걸어 나갈 쪽(pdir)을 엔진이 보낸다: ' + wg.look.pdir);
  ok(E.hcSceneNode(now, 540, false, null, '').sc.indexOf('"wxKnown":false') > 0, '날씨를 모르면 모른다고 보낸다(지어내지 않는다)');
  // s327 (YJ): 경로 탐색 전(홈 첫 화면)에서만 장면 세로를 180 으로 고정(예전 최소 90 의 2배) · 채우기/접기 없음. 경로가 나온 화면은 150 그대로
  const idle = E.hcSceneNode(now, 540, false, null, ''), shown = E.hcSceneNode(now, 540, true, null, '');
  ok(idle.h === 180 && !idle.fit && idle.fmin === undefined, '경로 탐색 전 장면은 세로 180 고정(채우기 없음): ' + idle.h);
  ok(shown.h === 150 && !shown.fit, '경로가 나온 화면의 장면 높이는 그대로 150: ' + shown.h);
}
// 탑승 중 장면: 앱이 보낸 탑승 재료(rd)로 기다림 · 버스 타고 가는 중 · 내림, 지하철 타고 가는 동안은 장면 없음(혼잡도 카드)
{
  const nodes = [{ name: '출발', isOrigin: true }, { name: 'A정류장', isBus: true, lineName: '6001' }, { name: 'B정류장', isBus: true, lineName: '6001' }, { name: 'C정류장', isBus: true, lineName: '6001' }];
  const sn = rd => { const k = call(base({ rd })).body[1].kids[0]; return k && k.t === 'scene' ? JSON.parse(k.sc) : null; };
  const w = sn({ here: 1, boarded: false, key: 'k', nodes }), r = sn({ here: 2, boarded: true, key: 'k', nodes }), a = sn({ here: 3, boarded: true, key: 'k', nodes });
  ok(w && w.mode === 'wait' && w.venue === 'bus' && /기다리는/.test(w.tag), '탑승 재료(승차 전) → 기다리는 중 장면: ' + (w && w.tag));
  ok(r && r.mode === 'ride' && r.venue === 'bus', '버스 타고 가는 중 장면');
  ok(a && a.mode === 'alight', '내릴 정류장에 닿으면 내림 장면');
  const sub = [{ name: '출발', isOrigin: true }, { name: '강남', isSub: true, lineName: '2호선' }, { name: '역삼', isSub: true, lineName: '2호선' }];
  const sk = call(base({ rd: { here: 1, boarded: true, key: 's', nodes: sub } })).body[1].kids[0];
  ok(sk && sk.t !== 'scene', '지하철 타고 가는 동안은 장면 대신 혼잡도 카드가 맨 위');
  const bad = sn({ here: 1, nodes: [1] });
  ok(bad && bad.mode === 'idle', '탑승 재료가 이상하면 평소 대기실 장면');
}
// 날씨: 두 지점(지금 있는 곳 · 도착역)을 엔진이 정하고, Worker 가 받아 준 값(f.wx)을 AI 글에 쓴다
{
  const wp = E.hcWxPoints(base({ gps: [37.5, 127.0] }));
  ok(wp.wF[0] === 37.5 && wp.wT && Math.abs(wp.wT[0] - 37.497958) < 1e-5, '날씨 지점: 위치가 있으면 wF=위치, wT=도착역(강남)');
  const wq = E.hcWxPoints(base());
  ok(Math.abs(wq.wF[0] - 37.489457) < 1e-5 && Math.abs(wq.wT[1] - 127.027539) < 1e-5, '위치가 없으면 wF=경로 출발역(부평)');
  const wn = E.hcWxPoints(base({ r: null, gps: null }));
  ok(wn.wF === null && wn.wT === null && E.hcWxPoints(null).wF === null, '경로도 위치도 없으면 날씨 지점 없음');
  // s208: 같은 이름 역(수도권 ↔ 부산 중동)은 경로가 알려 준 그 역의 좌표에 가까운 쪽
  const jd = (nm, y, x) => ({ trafficType: 1, lane: [{ name: '1호선' }], sectionTime: 10, distance: 6000, startName: '시작', endName: nm, passStopList: { stations: [{ stationName: '시작', y: y, x: x }, { stationName: nm, y: y, x: x }] } });
  const wBusan = E.hcWxPoints(base({ r: { data: mk([jd('중동', 35.1667, 129.1686)]), tab: 'fast', a: '시작', b: '중동', bt: null, rb: now }, gps: null }));
  const wSeoul = E.hcWxPoints(base({ r: { data: mk([jd('중동', 37.4866, 126.7644)]), tab: 'fast', a: '시작', b: '중동', bt: null, rb: now }, gps: null }));
  ok(wBusan.wT && wBusan.wT[0] < 36 && wSeoul.wT && wSeoul.wT[0] > 37, 's208: 도착역 날씨 지점 — 같은 이름이면 경로 좌표에 가까운 역 ' + JSON.stringify([wBusan.wT, wSeoul.wT]));
  const wb = E.hcWxPoints(base({ r: { data: mk([walk(2), bus('6', 20)]), tab: 'fast', a: '집', b: '회사', bt: null, rb: now }, gps: null }));
  ok(wb.wF === null && wb.wT === null, '정류장 이름은 역 표에 없으니 지점 없음(지어내지 않는다)');
  const txt = o => JSON.stringify(o.body);
  const wo = call(base({ gps: [37.5, 127.0], wx: { wF: { temp: -3, txt: '눈', rain: 80 }, wT: { temp: 5, txt: '맑음', rain: 0 } } }));
  ok(wo.ok && /-3도/.test(txt(wo)) && /눈/.test(txt(wo)), '받아 온 날씨가 AI 글에 들어간다: ' + (txt(wo).match(/[^"]{0,30}-3도[^"]{0,30}/) || [''])[0]);
  ok(!/-3도/.test(txt(call(base({ gps: [37.5, 127.0] })))), '날씨 값이 없으면 날씨 말을 하지 않는다');
  ok(call(base({ wx: { wF: { temp: 'x' }, wT: 7 } })).ok, '이상한 날씨 값은 무시');
}
// 앱 검증기
{
  const screens = [call(base()), call(base({ th: 'pastel', r: { data: mk([walk(2), bus('6', 20)]), tab: 'fast', a: '집', b: '회사', bt: null, rb: now } })), call(base({ r: null, gps: [37.4979, 127.0276] })), call(base({ r: null }))];
  const r = screenCheck(screens);
  ok(!r.err && r.out.length === 4 && r.out.every(l => /^OK/.test(l)), '앱 검증기 통과: ' + (r.err || r.out.join(' | ')));
}
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  ok(/\/\/ ===== HCARDS ENGINE BEGIN =====/.test(w) && w.indexOf('if (url.pathname === "/screen/hcards") return handleScreenHcards(request);') > 0, '워커에 내장됨');
}
// s207: hol 을 안 보내면 엔진이 기준 날짜(미리보기면 고른 시각)로 정한다 — 보내면(옛 앱) 그대로 따른다
{
  const sat = Date.UTC(2026, 9, 23, 23, 30, 0);            // KST 토 08:30
  const noHol = f => { const g = base(f); delete g.hol; return g; };
  const wk = o => /주말|공휴일/.test(JSON.stringify(o));
  ok(wk(call(base({ now: sat, hol: true }))) && !wk(call(base({ now: sat, hol: false }))), 's207: (기준) hol 값이 카드 글을 바꾼다');
  ok(wk(call(noHol({ now: sat }))), 's207: 토요일엔 hol 을 안 보내도 주말·공휴일 카드');
  ok(!wk(call(noHol({}))), 's207: 수요일엔 hol 을 안 보내도 평일 카드');
  const hanguel = Date.UTC(2026, 9, 8, 23, 30, 0);          // KST 금 10/9 한글날 08:30
  ok(wk(call(noHol({ now: hanguel }))), 's207: 평일(금)이라도 공휴일(한글날)이면 주말·공휴일 카드');
}
// s232 (YJ 10-26): 지하철을 타고 가는 동안 혼잡도 카드는 '지금 지나는 역'을 따라가고(역명·호선만 조용히 바뀐다 — 출발역에 고정되지 않는다), 옆으로 밀면 객실 장면(sc2)이 나온다
{
  const names = ['임학', '박촌', '귤현', '계양', '아시아드', '검단'];
  const rdAt = h => ({ here: h, boarded: true, key: 'k232', nodes: [{ name: '출발', isOrigin: true }].concat(names.map(n => ({ name: n, isSub: true, lineName: '인천1호선' }))).concat([{ name: '도착' }]) });
  const at = h => call(base({ rd: rdAt(h) }));
  const outs = [1, 2, 3, 4].map(at);
  ok(outs.every(x => x.ok), 's232: 타고 가는 동안 카드가 만들어진다');
  ok(outs.map(x => x.info.stn).join() === '임학,박촌,귤현,계양', 's232: 혼잡도 역이 지나는 역을 따라간다: ' + outs.map(x => x.info.stn).join());
  ok(outs.every((x, i) => flat(x.body[1].kids).some(n => n.t === 'cgh' && n.nm === names[i])), 's232: 혼잡도 카드 제목줄·게이지에 지금 역 이름이 들어 있다');
  ok(outs.every(x => x.body[1].ip.join() === '17,14,14,14' && x.body[1].lb === 4), 's232: 카드 모양은 그대로(조용히 이름만 바뀜)');
  const p0 = outs[0].body[1], tr = p0.sc2 ? JSON.parse(p0.sc2) : null;
  ok(tr && tr.mode === 'train' && tr.venue === 'sub' && tr.train && tr.train.names.length >= 3 && tr.train.stops.length === tr.train.names.length && p0.sc2.length < 6000, 's232: 옆 쪽 객실 장면(sc2) 이 붙는다: mode=train · 역 ' + (tr && tr.train ? tr.train.names.length : 0) + '개');
  ok(tr.train.names[0] === '임학' && tr.train.stops.every(a => Array.isArray(a) && a.length === 3) && tr.train.stops[tr.train.stops.length - 1][1] === tr.train.stops[tr.train.stops.length - 1][0], 's232: 정차표 [타고 있던 · 내림 · 탐] 3칸 · 종점에서는 모두 내린다');
  ok(outs.every(x => JSON.parse(x.body[1].sc2).train.names.join() === tr.train.names.join()), 's232: 같은 여정이면 역이 바뀌어도 친구·승하차 계획은 같다(여정 내내 안 흔들린다)');
  ok(!call(base()).body[1].sc2, 's232: 경로가 없으면 객실 쪽이 없다');
  const busRd = { here: 1, boarded: true, key: 'b1', nodes: [{ name: '출발', isOrigin: true }, { name: '정류장A', isBus: true, lineName: '6001' }, { name: '정류장B', isBus: true, lineName: '6001' }, { name: '도착' }] };
  const ob = call(base({ rd: busRd })); ok(ob.ok && !JSON.stringify(ob.body).includes('"sc2"'), 's232: 버스를 탈 땐 객실 쪽이 없다(버스 장면은 따로)');
}
(async () => {
  const os = require('os'), tmp = path.join(os.tmpdir(), 'rv2_hc_' + process.pid + '.mjs');
  fs.copyFileSync(R('engine/route-v2-worker.ascii.js'), tmp);
  try {
    const mod = await import(tmp), wk = mod.default;
    const realFetch0 = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('offline'); };               // s220: 워커가 날씨를 직접 받으므로(인터넷이 되는 CI 에서도) 첫 계산은 날씨 없이 비교한다
    let res, j;
    try { res = await wk.fetch(new Request('https://x/screen/hcards', { method: 'POST', body: JSON.stringify({ cap: 18, f: base() }), headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }), {}, { waitUntil() { } }); j = await res.json(); } finally { globalThis.fetch = realFetch0; }
    ok(res.status === 200 && j.ok && j.body.length === 5 && JSON.stringify(j.body) === JSON.stringify(call(base()).body), '워커 안에서 직접 계산과 같은 카드 세 장');
    const r2 = await wk.fetch(new Request('https://x/screen/hcards', { method: 'POST', body: JSON.stringify({ cap: 3, f: {} }) }), {}, { waitUntil() { } });
    ok(r2.status === 400, '워커: cap 부족은 400');
    {   // s232: 워커에 내장된 엔진(scene · hcards)에도 객실 장면(sc2)이 들어 있다 — 직접 계산과 같은 글
      const rd232 = { here: 2, boarded: true, key: 'k232', nodes: [{ name: '출발', isOrigin: true }].concat(['임학', '박촌', '귤현', '계양'].map(n => ({ name: n, isSub: true, lineName: '인천1호선' }))).concat([{ name: '도착' }]) };
      const realFetch2 = globalThis.fetch; globalThis.fetch = async () => { throw new Error('offline'); };
      let jr; try { const rr = await wk.fetch(new Request('https://x/screen/hcards', { method: 'POST', body: JSON.stringify({ cap: 18, f: base({ rd: rd232 }) }), headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }), {}, { waitUntil() { } }); jr = await rr.json(); } finally { globalThis.fetch = realFetch2; }
      const dr = call(base({ rd: rd232 }));
      ok(jr && jr.ok && jr.body[1].sc2 && jr.body[1].sc2 === dr.body[1].sc2 && jr.info.stn === '박촌', 's232: 워커 안에서도 객실 장면(sc2)과 지나는 역(박촌)을 따라간다');
    }
    // 날씨: Worker 가 /weather 를 받아 f.wx 로 넣어 준다(받은 주소 · 값 확인)
    const realFetch = globalThis.fetch, asked = [];
    globalThis.fetch = async (u) => { asked.push(String(u)); return /api\.open-meteo\.com/.test(String(u)) ? new Response(JSON.stringify({ current: { time: '2026-10-26T09:00', temperature_2m: -3, weather_code: 71 }, hourly: { time: ['2026-10-26T09:00'], precipitation_probability: [80] }, daily: {} }), { headers: { 'content-type': 'application/json' } }) : realFetch(u); };
    try {
      const r3 = await wk.fetch(new Request('https://x/screen/hcards', { method: 'POST', body: JSON.stringify({ cap: 18, f: base({ gps: [37.5, 127.0] }) }), headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }), {}, { waitUntil() { } });
      const j3 = await r3.json();
      ok(r3.status === 200 && /-3도/.test(JSON.stringify(j3.body)) && asked.filter(u => /api\.open-meteo\.com/.test(u)).length === 2, '워커: 두 지점 날씨를 Open-Meteo 에서 직접 받아 AI 글에 넣는다: ' + asked.filter(u => /meteo/.test(u)).join(' '));
    } finally { globalThis.fetch = realFetch; }
  } catch (e) { fail++; console.log('  FAIL 워커 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  // s311: 한 번에 여러 탭 — alts[탭] 은 그 탭으로 따로 요청했을 때와 글자 하나까지 같다
{
  const D3 = { result: { path: [
    { info: { totalTime: 24, totalDistance: 9000, transferCount: 0, tab: 'fast' }, subPath: [walk(3), sub('부평', '강남', '수도권 1호선', 18), walk(3)] },
    { info: { totalTime: 30, totalDistance: 9000, transferCount: 1, tab: 'less' }, subPath: [walk(3), bus('6', 20), walk(3)] }] } };
  const fb = (tab) => base({ r: { data: D3, tab, a: '부평', b: '강남', bt: null, rb: now } });
  const multi = E.hcardsScreens({ cap: 25 }, fb('fast'), ['less', 'sub', 'fast', 'zzz', 'less']);
  const solo = E.hcardsScreen({ cap: 25 }, fb('less'));
  ok(multi.ok && multi.alts && Object.keys(multi.alts).join() === 'less,sub' && JSON.stringify(multi.alts.less) === JSON.stringify(solo), '여러 탭 한 번에: alts[탭] 이 따로 요청한 화면과 같다 · 지금 탭 · 모르는 탭 · 중복은 뺀다');
  ok(JSON.stringify(multi.body) === JSON.stringify(E.hcardsScreen({ cap: 25 }, fb('fast')).body) && !('alts' in E.hcardsScreens({ cap: 25 }, fb('fast'), [])) && E.hcardsScreens({ cap: 17 }, fb('fast'), ['less']).ok === false, 'alts 를 달아도 본 화면은 그대로 · alts 없으면 예전과 같다');
}
console.log(pass + ' 통과 / ' + fail + ' 실패');
if (fail) process.exit(1);
})();
