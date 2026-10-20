// 탑승 시작 엔진(engine/ride-start.js) 시험.  실행: node test/ride_start_engine.test.js
//  ① 경로 → 대기 모드 state ② 이상한 입력 ③ 그 state 로 /ride-standby 를 5초마다 불러 끝까지 달려 보기(네이티브 흉내) ④ 워커 내장
const fs = require('fs'), path = require('path');
const RS = require('../engine/ride-start'), SB = require('../engine/ride-standby');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);

const T0 = Date.UTC(2026, 9, 20, 3, 0, 0), LAT = 37.5, LNG0 = 126.9, DL = 0.0137;
const walk = (t, ss, es) => ({ trafficType: 3, sectionTime: t, distance: t * 70, startSec: ss, endSec: es });
const subLeg = { trafficType: 1, lane: [{ name: '수도권 1호선' }], sectionTime: 10, distance: 6000, startName: 'S0', endName: 'S5', startSec: 120, endSec: 720, stopSec: [120, 240, 360, 480, 600, 720],
  passStopList: { stations: [0, 1, 2, 3, 4, 5].map(i => ({ stationName: 'S' + i, y: LAT, x: LNG0 + DL * i })) } };
const busLeg = { trafficType: 2, lane: [{ busNo: '931' }], sectionTime: 8, distance: 3000, startName: 'B0', endName: 'B3', startSec: 900, endSec: 1380,
  passStopList: { stations: [0, 1, 2, 3].map(i => ({ stationName: 'B' + i, y: LAT + 0.002, x: LNG0 + DL * 5 + 0.01 * (i + 1) })) } };
const P = { info: { totalTime: 24, transferCount: 1, pathType: 3, tab: 'fast' }, subPath: [walk(2, 0, 120), subLeg, walk(3, 720, 900), busLeg, walk(2, 1380, 1500)] };
const facts = (extra) => Object.assign({ data: { result: { path: [JSON.parse(JSON.stringify(P))] } }, tab: 'fast', a: '출발지', b: '도착지', bt: null, rb: T0, now: T0, tz: 540, th: 'dark' }, extra || {});

// ① state
const o = RS.rideStart({ cap: 18 }, facts());
ok(o.ok && o.v === 1, '탑승 시작: 성공 ' + (o.error || ''));
const st = o.state;
ok(st && st.v === 1 && st.eta.nodes[0].isOrigin && st.eta.nodes.length === 11 && st.eta.nodes[1].isSub && st.eta.nodes[7].isBus && st.eta.nodes[7].lineName === '931', '노드: 출발 + 역 6 + 정류장 4(종류·노선 이름)');
ok(st.stops.length === 10 && st.stops[0].pass === false && st.stops[1].pass === true && st.stops[9].fin === true && st.stops.filter(s => s.bus).length === 4 && st.stops.every(s => s.lat > 37 && s.arrMs > T0), '영점용 정류장: 좌표·도착 시각·마지막 표시');
ok(st.eta.timetableFirst === true && st.eta.boarded === true && st.eta.notDeparted === false && st.eta.tzOffsetMin === 540 && st.eta.boardInfo && st.eta.boardInfo.line === '수도권 1호선' && st.eta.boardInfo.to === 'S1' && st.eta.passes.length === 0, '지하철로 시작하면 시각표 기준 · 아직 첫 역 시각 전이면 통과 증거 없음');
ok(st.cfg.targets.length === 2 && st.cfg.targets[0].kind === 'transfer' && st.cfg.targets[0].name === 'S5' && st.cfg.targets[0].nextLine === '931' && st.cfg.targets[1].kind === 'dest' && st.cfg.destName === '도착지' && st.cfg.seq.length === 10, '알림 대상: 환승 하차역(S5)과 최종 하차');
ok(st.eta.nodes.slice(1).every(n => n.planMin > 0) && st.eta.nodes[1].planMin === 12 * 60 + 2 && st.eta.nodes[6].planMin === 12 * 60 + 12, '계획 시각(하루 안의 분)');
ok(/^다음 S0 12:02/.test(o.text) && o.info.first.name === 'S0' && o.info.dest === '도착지' && o.info.legs === 2, '처음 글 · 요약');
const late = RS.rideStart({ cap: 18 }, facts({ now: T0 + 200000, rb: T0 }));
const off = RS.rideStart({ cap: 18 }, Object.assign(facts(), { allowed: { transfer2: false, transfer: false } }));
ok(off.ok && off.state.cfg.allowed.transfer === false && off.state.cfg.allowed.transfer2 === false && Object.keys(o.state.cfg.allowed).length === 0, '끈 알림 종류는 allowed 로 상태에 실린다(안 끄면 비어 있다)');
const offBad = RS.rideStart({ cap: 18 }, Object.assign(facts(), { allowed: 'x' }));
ok(offBad.ok && Object.keys(offBad.state.cfg.allowed).length === 0, '이상한 allowed 는 무시');
ok(late.ok && late.state.eta.passes.length === 1 && late.state.eta.passes[0].idx === 1 && late.state.eta.passes[0].src === 'gps', '첫 역 시각이 지난 뒤 누르면 첫 역은 지난 것으로');
const busFirst = RS.rideStart({ cap: 18 }, facts({ data: { result: { path: [{ info: P.info, subPath: [walk(2, 0, 120), JSON.parse(JSON.stringify(busLeg)), walk(2, 900, 1020)] }] } } }));
ok(busFirst.ok && busFirst.state.eta.timetableFirst === undefined && busFirst.state.eta.boardInfo === undefined && busFirst.state.cfg.targets.length === 1 && busFirst.state.eta.nodes[1].isBus, '버스로 시작하면 시각표 기준 아님');

// ② 이상한 입력
ok(RS.rideStart({ cap: 5 }, facts()).ok === false, 'cap 12 미만은 거절');
ok(RS.rideStart({ cap: 18 }, null).error === 'route' && RS.rideStart({ cap: 18 }, { data: { result: { path: 'x' } } }).error === 'route', '경로가 없으면 route');
ok(RS.rideStart({ cap: 18 }, facts({ now: 0 })).error === 'now', '시각이 없으면 now');
{
  const LD = { info: { totalTime: 130, longDist: true, ldMode: 'ktx', ldGrade: 'KTX', ldDepTs: 5, ldOptions: [{ grade: 'KTX' }], distKm: 300 }, subPath: [{ trafficType: 4, lane: [{ name: 'KTX' }], sectionTime: 130, distance: 300000, startName: '서울', endName: '부산' }] };
  const x = RS.rideStart({ cap: 18 }, facts({ data: { result: { path: [LD] } }, tab: 'longdist' }));
  ok(x.ok === false && x.error === 'longdist' && /장거리/.test(x.msg), '장거리는 안내하지 않는다');
}
ok(RS.rideStart({ cap: 18 }, facts({ data: { result: { path: [{ info: { totalTime: 5 }, subPath: [walk(5, 0, 300), { trafficType: 1, lane: [{ name: '1호선' }], sectionTime: 5, startName: 'A', endName: 'B' }] }] } } })).ok === false, '구간 시각·좌표가 없는 옛 응답은 거절');

// ③ 끝까지 달려 보기(네이티브 흉내: 5초마다 위치를 모아 /ride-standby)
function posAt(ms, stops) {                 // 열차·버스가 계획대로 달린다
  if (ms <= stops[0].arrMs) return [stops[0].lat, stops[0].lng];
  for (let i = 1; i < stops.length; i++) if (ms <= stops[i].arrMs) { const a = stops[i - 1], b = stops[i], f = (ms - a.arrMs) / (b.arrMs - a.arrMs); return [a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f]; }
  const l = stops[stops.length - 1]; return [l.lat, l.lng];
}
{
  let s = JSON.parse(JSON.stringify(o.state)), alerts = [], done = false, lastTxt = '', cur = -1, steps = 0;
  const stops = s.stops;
  for (let ms = T0; ms <= T0 + 2400000 && !done; ms += 5000) {
    const p = posAt(ms, stops);
    const out = SB.rideStandby({ nowMs: ms, fixes: [[ms, p[0], p[1], 15]], state: JSON.parse(JSON.stringify(s)) });
    if (out.error) { ok(false, '엔진 오류 ' + out.error); break; }
    s = out.state; steps++;
    if (out.alert) alerts.push(out.alert.type + ':' + out.alert.key);
    lastTxt = out.ongoing.text; cur = out.curIdx; done = out.done;
  }
  const types = alerts.map(a => a.split(':')[0]);
  ok(types.includes('transfer2') && types.includes('transfer') && types.includes('near_arrive2') && types.includes('near_arrive') && types.includes('arrive'), '끝까지 달리면 환승 2·1정거장 전, 하차 2·1정거장 전, 도착 알림이 모두 울린다: ' + alerts.join(','));
  ok(done && /도착지 도착/.test(lastTxt), '도착 뒤 종료(done) · 마지막 글: ' + lastTxt);
  ok(cur >= 9, '현재 위치가 끝 정류장까지 갔다: ' + cur);
}

// ④ 워커 내장
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  ok(/\/\/ ===== RIDESTART ENGINE BEGIN =====/.test(w) && w.indexOf('if (url.pathname === "/ride/start") return handleRideStart(request);') > 0, '워커에 내장됨');
  const i = w.indexOf('// ===== RIDESTART ENGINE BEGIN ====='), j = w.indexOf('// ===== RIDESTART ENGINE END =====');
  ok(i > 0 && j > i && !/[^\x00-\x7f]/.test(w.slice(i, j)), '내장 블록은 ASCII');
}
console.log(pass + ' 통과 / ' + fail + ' 실패');
if (fail) process.exit(1);
