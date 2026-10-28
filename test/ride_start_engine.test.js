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
ok(st.ovl && st.ovl.cells.length === 10 && st.ovl.cells[0].n === 'S0' && st.ovl.map.length === 10 && st.ovl.map[0] === 1 && st.ovl.map[9] === 10, '떠 있는 안내 그림 틀(ovl): 정류장마다 칸 + 노드 번호');
ok(st.ovl.cells[0].dk === 2 && st.ovl.cells[9].dk === 2 && st.ovl.cells[4].dk === 1 && st.ovl.cells[0].lc === undefined && st.ovl.cells[0].rc && st.ovl.cells[9].rc === undefined && st.ovl.cells[5].lc && st.ovl.cells[4].m === 'S4 (이동중)' && st.ovl.theme && /^#/.test(st.ovl.theme.bg), '그림 틀: 점 모양 · 선 색 · 이동 중 문구 · 테마 색을 엔진이 정한다');
{
  const ov = SB.rideStandby({ nowMs: T0 + 130000, fixes: [[T0 + 130000, LAT, LNG0, 12]], state: JSON.parse(JSON.stringify(st)) }).overlay;
  ok(ov && ov.active && /S\d/.test(ov.line1) && typeof ov.line2 === 'string', '탑승 중 /ride-standby 가 오버레이 값(line1·line2)을 돌려준다: ' + (ov && ov.line1));
}
const late = RS.rideStart({ cap: 18 }, facts({ now: T0 + 200000, rb: T0 }));
const off = RS.rideStart({ cap: 18 }, Object.assign(facts(), { allowed: { transfer2: false, transfer: false } }));
ok(off.ok && off.state.cfg.allowed.transfer === false && off.state.cfg.allowed.transfer2 === false && Object.keys(o.state.cfg.allowed).length === 0, '끈 알림 종류는 allowed 로 상태에 실린다(안 끄면 비어 있다)');
const offBad = RS.rideStart({ cap: 18 }, Object.assign(facts(), { allowed: 'x' }));
ok(offBad.ok && Object.keys(offBad.state.cfg.allowed).length === 0, '이상한 allowed 는 무시');
ok(late.ok && late.state.eta.passes.length === 1 && late.state.eta.passes[0].idx === 1 && late.state.eta.passes[0].src === 'gps', '첫 역 시각이 지난 뒤 누르면 첫 역은 지난 것으로');
const busFirst = RS.rideStart({ cap: 18 }, facts({ data: { result: { path: [{ info: P.info, subPath: [walk(2, 0, 120), JSON.parse(JSON.stringify(busLeg)), walk(2, 900, 1020)] }] } } }));
ok(busFirst.ok && busFirst.state.eta.timetableFirst === undefined && busFirst.state.eta.boardInfo === undefined && busFirst.state.cfg.targets.length === 1 && busFirst.state.eta.nodes[1].isBus, '버스로 시작하면 시각표 기준 아님');

{   // s196: 첫 구간이 버스면 승차 대기 중 실시간 재보정(/board-live)이 정류장을 바로 알 수 있게 도시코드·정류장 ID 를 싣는다
  const bl = JSON.parse(JSON.stringify(busLeg)); bl.boardStopId = 'ICB123'; bl.boardCc = '23';
  const bb = RS.rideStart({ cap: 18 }, facts({ data: { result: { path: [{ info: P.info, subPath: [walk(2, 0, 120), bl, walk(2, 900, 1020)] }] } } }));
  ok(bb.ok && bb.state.cfg.bl && bb.state.cfg.bl.kind === 'bus' && bb.state.cfg.bl.i === 1 && bb.state.cfg.bl.cc === '23' && bb.state.cfg.bl.sid === 'ICB123', '첫 구간 버스: cfg.bl = 도시코드·정류장 ID ' + JSON.stringify(bb.state && bb.state.cfg.bl));
  ok(busFirst.ok && !busFirst.state.cfg.bl, '정류장 ID 를 모르면 cfg.bl 없음(묻지 않는다)');
  ok(o.ok && !o.state.cfg.bl, '첫 구간이 지하철이면 cfg.bl 없음(지하철은 노선·역 이름으로 묻는다)');
  const ask = SB.rideStandby({ nowMs: T0 - 300000, fixes: [[T0 - 300000, LAT, LNG0 - 0.004, 10]], state: JSON.parse(JSON.stringify(bb.state)) });
  ok(ask.ask && ask.ask.body.kind === 'bus' && ask.ask.body.sid === 'ICB123' && ask.ask.body.no === '931', '그 state 로 승차 대기 중 /ride-standby 가 버스 정류장 질의를 낸다 ' + JSON.stringify(ask.ask) + JSON.stringify(ask.notes));
}

{   // s200: 첫 구간이 버스면 10분 안에 오는 버스를 골라 타게 — 엔진이 묻고(rideBusAsk) · 목록을 만들고(rideBusItems) · 고른 차를 state 에 실어 따라가게(pickMs) 한다
  const bl = JSON.parse(JSON.stringify(busLeg)); bl.boardStopId = 'ICB123'; bl.boardCc = '23';
  const fb = ex => facts(Object.assign({ data: { result: { path: [{ info: P.info, subPath: [walk(2, 0, 120), JSON.parse(JSON.stringify(bl)), walk(2, 900, 1020)] }] } } }, ex || {}));
  const ask = RS.rideBusAsk({ cap: 18 }, fb());
  ok(ask && ask.cc === '23' && ask.sid === 'ICB123' && ask.no === '931' && ask.stop === 'B0', 's200: 첫 구간이 버스면 정류장·노선을 알려 준다 ' + JSON.stringify(ask));
  ok(RS.rideBusAsk({ cap: 18 }, facts()) === null && RS.rideBusAsk({ cap: 18 }, busFirst.ok ? facts({ data: { result: { path: [{ info: P.info, subPath: [walk(2, 0, 120), JSON.parse(JSON.stringify(busLeg)), walk(2, 900, 1020)] }] } } }) : null) === null && RS.rideBusAsk({ cap: 5 }, fb()) === null, 's200: 첫 구간이 지하철이거나 정류장 ID 를 모르면 묻지 않는다');
  const it = RS.rideBusItems([700, 400, 90, 0, -5, 'x', 250, 30, 590], T0);
  ok(it.length === 4 && it.map(x => x.sec).join() === '30,90,250,400' && it[0].ms === T0 + 30000 && it[3].ms === T0 + 400000, 's200: 10분(600초) 안에 오는 차만 빠른 순 최대 4대 ' + JSON.stringify(it));
  ok(RS.rideBusItems(null, T0).length === 0 && RS.rideBusItems([100], NaN).length === 0 && RS.rideBusItems([601], T0).length === 0, 's200: 목록이 없거나 시각이 이상하거나 10분 밖이면 비어 있다');
  const pk = RS.rideStart({ cap: 18 }, fb({ pick: { ms: T0 + 240000 } }));
  ok(pk.ok && pk.state.cfg.bl.pickMs === T0 + 240000, 's200: 고른 버스의 도착 시각이 cfg.bl.pickMs 로 실린다');
  ok(RS.rideStart({ cap: 18 }, fb({ pick: { ms: T0 + 99 * 60000 } })).state.cfg.bl.pickMs === undefined && RS.rideStart({ cap: 18 }, fb({ pick: 'x' })).state.cfg.bl.pickMs === undefined && RS.rideStart({ cap: 18 }, fb()).state.cfg.bl.pickMs === undefined, 's200: 30분 넘게 떨어진 값 · 이상한 값 · 안 고름은 싣지 않는다');
  // 승차 대기 중: 고른 차를 따라간다(직전에 따라간 시각에 가장 가까운 도착)
  const stepAsk = state => SB.rideStandby({ nowMs: T0 - 300000, fixes: [[T0 - 300000, LAT, LNG0 - 0.004, 10]], state: JSON.parse(JSON.stringify(state)) });
  const a1 = stepAsk(pk.state);
  ok(a1.ask && a1.ask.body.kind === 'bus' && a1.ask.body.near === T0 + 240000, 's200: 질의에 near(고른 차의 도착 시각)가 실린다 ' + JSON.stringify(a1.ask && a1.ask.body));
  const a0 = stepAsk(RS.rideStart({ cap: 18 }, fb()).state);
  ok(a0.ask && a0.ask.body.near === undefined, 's200: 안 골랐으면 near 없음(예전 그대로 — 탈 수 있는 첫 차)');
  ok(SB.rsBlBusPick({ '931': [200, 400, 900] }, { no: '931', nowMs: T0, fromMs: T0 + 60000 }) === T0 + 200000 && SB.rsBlBusPick({ '931': [200, 400, 900] }, { no: '931', nowMs: T0, fromMs: T0 + 60000, near: T0 + 410000 }) === T0 + 400000, 's200: near 가 있으면 가장 가까운 차를 고르고 없으면 첫 차');
  ok(SB.rsBlBusPick({ '931': [200, 900] }, { no: '931', nowMs: T0, fromMs: T0 + 60000, near: T0 + 500000 }) === T0 + 200000, 's200: 고른 차가 2분 반 넘게 어긋나면(지나갔다) 탈 수 있는 첫 차로');
}

{   // s265 (YJ: 같은 곳으로 가는 버스가 여러 번호면 사용자가 고른 번호로 안내) — 경로가 대체 번호(altBus)를 알려 주고, 고른 번호(pick.no)로 첫 버스 구간이 바뀐다
  const bl = JSON.parse(JSON.stringify(busLeg)); bl.boardStopId = 'ICB123'; bl.boardCc = '23'; bl.altBus = ['931', '932', '9 03'];
  const fb = ex => facts(Object.assign({ data: { result: { path: [{ info: P.info, subPath: [walk(2, 0, 120), JSON.parse(JSON.stringify(bl)), walk(2, 900, 1020)] }] } } }, ex || {}));
  const a = RS.rideBusAsk({ cap: 18 }, fb());
  ok(a && a.no === '931' && a.alts.join() === '931,932,903', 's265: rideBusAsk 가 대체 번호들을 알려 준다 ' + JSON.stringify(a));
  const pk = RS.rideStart({ cap: 18 }, fb({ pick: { ms: T0 + 240000, no: '932' } }));
  ok(pk.ok && pk.state.eta.nodes[1].lineName === '932' && pk.state.cfg.bl.no === '932' && pk.state.cfg.bl.pickMs === T0 + 240000, 's265: 고른 번호(932)로 첫 버스 구간 이름이 바뀐다 ' + JSON.stringify(pk.state.eta.nodes[1]));
  const bad = RS.rideStart({ cap: 18 }, fb({ pick: { ms: T0 + 240000, no: '777' } }));
  ok(bad.ok && bad.state.eta.nodes[1].lineName === '931' && bad.state.cfg.bl.no === undefined, 's265: 대체 번호에 없는 번호는 무시(계획 번호 그대로)');
  const none = RS.rideStart({ cap: 18 }, fb());
  ok(none.ok && none.state.eta.nodes[1].lineName === '931', 's265: 안 골랐으면 계획 번호 그대로');
  const m = RS.rideBusItemsMulti({ '931': [700, 400, 90, 250], '932': [60, 800], '903': [10] }, ['931', '932', '903', '931'], T0, null);
  ok(m.map(x => x.no + ':' + x.sec).join() === '903:10,932:60,931:90,931:250', 's265: 번호마다 빠른 2대씩 모아 빠른 순 ' + JSON.stringify(m));
  ok(RS.rideBusItemsMulti(null, ['1'], T0).length === 0 && RS.rideBusItemsMulti({}, null, T0).length === 0, 's265: 이상한 입력은 빈 목록');
}

{   // s293 (YJ: 경로 일치가 아니라 목적지 일치 — 내 목적지·환승 지점에 가는 버스면 후보): 내리는 곳에서 300m 안에 서는 번호까지 대체 번호로
  const W2 = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8'), vm2 = require('vm');
  const fn = W2.slice(W2.indexOf('var ALT_BUS_DEST_M'), W2.indexOf('\n}\n', W2.indexOf('function busAltNos(G, L)')) + 3);
  const cx = { noKey: x => String(x).replace(/\D/g, ''), hav: (a, b, c, d) => Math.hypot((a - c) * 111000, (b - d) * 88000) };
  vm2.createContext(cx); vm2.runInContext(fn + '\nthis.f = busAltNos;', cx);
  const st = (lat, lng) => ({ lat, lng }), B = [37.5, 127.0], A = [37.52, 127.0];
  const G2 = { routeNoOf: { '1_77': '77', '1_9903': '9903', '1_55': '55', '1_44': '44' }, routeStops: {
    '1_77': [st(37.5, 127.0), st(37.52, 127.0)], '1_9903': [st(37.5, 127.0), st(37.5205, 127.0016)], '1_55': [st(37.5, 127.0), st(37.5260, 127.0)], '1_44': [st(37.5, 127.0003), st(37.51, 127.0)] } };
  const L2 = { mode: 'bus', line: '1_77', busNo: '77', coordList: [B, A] };
  const got = cx.f(G2, L2);
  ok(Array.isArray(got) && got.join() === '9903', 's293: 목적지 근처(약 200m)에 서는 9903 은 대체 번호 · 먼 곳(55)·내리는 곳에 안 가는 번호(44)·자기 번호는 뺀다 ' + JSON.stringify(got));
}

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
// ⑤ 승차 대기 → 승차 감지(첫 승차역 S0 출발 = T0+120초)
{
  const mPerLng = 111320 * Math.cos(LAT * Math.PI / 180);
  const run = (posAt, endMs) => {
    let st = RS.rideStart({ cap: 18 }, facts()).state, out = null, log = [], t = T0, trail = [];
    for (; t <= endMs; t += 5000) {
      const p = posAt(t);
      out = SB.rideStandby({ nowMs: t, fixes: [[t, p[0], p[1], 12]], state: st });
      st = out.state; log.push({ t: t, out: out });
    }
    return { st: st, out: out, log: log };
  };
  // 역에서 약 620m 떨어진 곳에서 시작해 걸어 와(1.3m/s → 약 8분 걸리지만 여기서는 빨리 와서) 역에서 기다리다 열차를 타고 동쪽으로 달린다.
  const toStation = t => { const f = Math.min(1, (t - T0) / 60000); return [LAT, LNG0 - 0.007 * (1 - f)]; };          // 60초 동안 역으로 걸어 도착
  const train = t => { const dt = (t - (T0 + 140000)) / 1000; return [LAT, LNG0 + Math.max(0, dt) * 12 / mPerLng]; };      // 140초에 출발 12m/s
  const aboard = t => t < T0 + 140000 ? toStation(t) : train(t);
  const w1 = run(aboard, T0 + 100000);
  ok(w1.st.wait && w1.st.eta.boarded === false && /^승차 대기 · S0/.test(w1.out.ongoing.text) && w1.out.alert === null, '시작 직후엔 승차 대기: 상주 글 · 알림 없음 · 아직 안 탐: ' + w1.out.ongoing.text);
  ok(w1.log.some(x => (x.out.state.steps === 1)) && w1.log[0].out.state.wait && w1.log[0].out.state.wait.seen === false, '첫 틱에 대기가 걸리고, 역과 떨어진 위치라 아직 역에 오지 않음');
  const w2 = run(aboard, T0 + 130000);
  ok(w2.st.wait && w2.st.wait.seen === true, '역에 오면(150m 안) 역에 왔다고 기록');
  const w3 = run(aboard, T0 + 200000);
  ok(!w3.st.wait && w3.st.eta.boarded === true && w3.st.eta.notDeparted === false, '역에서 빠르게 멀어지면 승차 확정: 대기 해제');
  const ps = w3.st.eta.passes.find(p => p.idx === 1);
  ok(ps && ps.src === 'gps' && ps.ms >= T0 + 60000 && ps.ms <= T0 + 150000, '첫 승차역 통과 증거(gps)가 역을 떠나기 직전 시각으로 들어간다');
  ok(!/승차 대기/.test(w3.out.ongoing.text) && /^다음 /.test(w3.out.ongoing.text), '승차 뒤엔 평소 안내 글: ' + w3.out.ongoing.text);
  // 역에 와서 기다리기만(열차 안 탐) — 시각이 한참 지나도 걸어서 멀어지면 탄 걸로 보지 않지만, 8분 뒤엔 시각표대로 이어간다
  const waitOnly = t => t < T0 + 60000 ? toStation(t) : [LAT, LNG0 - 0.0005 + (t - T0 - 60000) / 1000 * 1.3 / mPerLng];   // 역에서 1.3m/s 로 걸어 멀어짐
  const w4 = run(waitOnly, T0 + 400000);
  ok(w4.st.wait && w4.st.eta.boarded === false, '걸어서 멀어지는 건 승차가 아니다(출발 시각 뒤 4분이 지나도 대기)');
  const w5 = run(waitOnly, T0 + 120000 + 500000);
  ok(!w5.st.wait && w5.st.eta.boarded === true && w5.log.some(x => x.out.state.eta && /시각표대로/.test(JSON.stringify(x.out.notes || []))), '출발 시각 8분 뒤까지 감지 못 하면 시각표대로 이어간다');
  // 이미 출발 시각보다 한참 늦게 시작(=이미 탐): 대기를 걸지 않는다
  let stLate = RS.rideStart({ cap: 18 }, facts({ now: T0 + 250000, rb: T0 })).state;
  const oL = SB.rideStandby({ nowMs: T0 + 250000, fixes: [[T0 + 250000, LAT, LNG0 + 0.003, 12]], state: stLate });
  ok(!oL.state.wait && oL.state.eta.boarded === true, '출발 시각보다 90초 넘게 늦게 시작하면 이미 탄 것으로 본다');
  // 대기를 끈 상태(r.wait:false)
  const oN = SB.rideStandby({ nowMs: T0 + 5000, fixes: [[T0 + 5000, LAT, LNG0 - 0.007, 12]], state: RS.rideStart({ cap: 18 }, facts({ wait: false })).state });
  ok(!oN.state.wait && oN.state.eta.boarded === true, 'r.wait:false 면 대기 없이 바로 탄 것으로 시작');
  // 대기 중 하차 알림은 울리지 않는다(예정 시각이 지났어도)
  const w6 = run(waitOnly, T0 + 300000);
  ok(w6.log.every(x => x.out.alert === null || x.out.alert.type === 'offroute'), '대기 중엔 하차·환승 알림이 없다');
}
// ⑤ 새 위치 판단기 보정(실험): 꺼져 있으면 영향 없음, 켜면 정확도가 낮아 영점이 못 잡는 구간을 판단기가 메운다
{
  const subOnly = { info: { totalTime: 14, transferCount: 0, pathType: 1, tab: 'fast' }, subPath: [walk(2, 0, 120), subLeg, walk(3, 720, 900)] };
  const fz = (pf) => Object.assign(facts({ now: T0 + 100000, pf }), { data: { result: { path: [JSON.parse(JSON.stringify(subOnly))] } } });
  const run = (pf) => {
    const o2 = RS.rideStart({ cap: 18 }, fz(pf)); let s2 = o2.state; const notes = [];
    for (let t = T0 + 100000; t <= T0 + 600000; t += 5000) {
      const k = (t - T0) / 1000, x = LNG0 + DL * Math.max(0, Math.min(5, (k - 120) / 120));
      const r = SB.rideStandby({ nowMs: t, fixes: [[t, LAT, x, 70]], state: s2 }); s2 = r.state; (r.notes || []).forEach(n => notes.push(n));
    }
    return { st: s2, notes };
  };
  const off2 = run(false), on2 = run(true);
  ok(RS.rideStart({ cap: 18 }, fz(true)).state.cfg.pfLive === true && RS.rideStart({ cap: 18 }, fz(false)).state.cfg.pfLive === false, '보정 스위치가 cfg.pfLive 로 실린다');
  ok(!off2.st.pf && !off2.notes.some(n => /위치 판단기/.test(n)), '꺼져 있으면 판단기를 안 쓴다(상태에 pf 없음)');
  ok(on2.st.pf && on2.st.eta.passes.length >= 4, '켜면 정확도 낮은 위치로도 지나온 역을 통과로 적는다: ' + JSON.stringify(on2.st.eta.passes.map(p => p.idx)));
  ok(JSON.stringify(on2.st.pf).length < 20000, '판단기 상태 크기가 작다: ' + JSON.stringify(on2.st.pf).length);
  const w = RS.rideStart({ cap: 18 }, Object.assign(fz(true), { now: T0 - 600000, rb: T0 })).state, wr = SB.rideStandby({ nowMs: T0 - 600000 + 5000, fixes: [[T0 - 600000 + 5000, LAT, LNG0, 20]], state: w });
  ok(!wr.state.pf, '승차 대기 중에는 판단기를 안 쓴다');
}

// s200: 워커 내장 /ride/buspick — 정류장 도착정보를 받아 10분 안에 오는 버스를 고르는 안내창을 낸다(받아 오는 함수는 흉내)
(async () => {
  const W = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8'), vm = require('vm');
  ok(W.indexOf('if (url.pathname === "/ride/buspick") return handleRideBusPick(request, env);') > 0 && /function rideBusAsk/.test(W) && /function dlgBpick/.test(W), 's200: 워커에 /ride/buspick · rideBusAsk · dlgBpick 가 들어 있다');
  const blk = n => (W.match(new RegExp('// ===== ' + n + ' ENGINE BEGIN =====[\\s\\S]*?// ===== ' + n + ' ENGINE END ====='))) [0];
  const rd = (W.match(/\/\/ ===== RESULT ENGINE BEGIN =====[\s\S]*?\/\/ ===== RESULT ENGINE END =====/) || [''])[0], rh = (W.match(/\/\/ ===== RHEAD ENGINE BEGIN =====[\s\S]*?\/\/ ===== RHEAD ENGINE END =====/) || [''])[0];
  let seen = null, arr = { '931': [200, 500, 800, 1200] };
  const ctx = { Response: class { constructor(b, o) { this.b = b; this.status = (o && o.status) || 200; } }, console, setTimeout, clearTimeout, ENGINE_VERSION: 'x', LIVE_BUDGET_REF: { used: 0 },
    liveCityOk: () => true, noKey: x => String(x), fetchStopArrivalsAny: async (cc, sid) => { seen = [cc, sid]; return arr; } };
  vm.createContext(ctx);
  try {
    const ra = W.slice(W.indexOf('// ===== ride-alert ('), W.indexOf('// ===== ride-alert \\ub05d =====')); ok(ra.length > 500, 's200: ride-alert 구간을 찾았다');
    vm.runInContext(rd + '\n' + rh + '\n' + ra + '\n' + blk('DIALOG') + '\n' + blk('RIDESTART') + '\nthis.__h = handleRideBusPick;', ctx);
    const rq = (obj, method) => ({ method: method || 'POST', text: () => Promise.resolve(typeof obj === 'string' ? obj : JSON.stringify(obj)) });
    const bl = JSON.parse(JSON.stringify(busLeg)); bl.boardStopId = 'ICB123'; bl.boardCc = '23';
    const fb = (ex) => facts(Object.assign({ data: { result: { path: [{ info: P.info, subPath: [walk(2, 0, 120), JSON.parse(JSON.stringify(bl)), walk(2, 900, 1020)] }] } } }, ex || {}));
    const a = await ctx.__h(rq({ cap: 23, r: fb() }), { }), ja = JSON.parse(a.b);
    ok(a.status === 200 && ja.ask === true && ja.screen === 'dlg' && seen && seen[0] === '23' && seen[1] === 'ICB123' && ja.info.items.length === 2 && ja.info.items[0].ms === T0 + 200000 && ja.info.items[1].sec === 500, 's200: 첫 구간이 버스면 정류장 도착정보로 10분 안의 두 대를 안내창에 낸다 ' + a.b.slice(0, 160));
    arr = { '931': [900, 1200] };
    const b = JSON.parse((await ctx.__h(rq({ cap: 23, r: fb() }))).b);
    ok(b.ok && b.ask === false, 's200: 10분 안에 오는 차가 없으면 묻지 않는다');
    arr = { '931': [300, 1200] };
    const one = JSON.parse((await ctx.__h(rq({ cap: 23, r: fb() }))).b);
    ok(one.ok && one.ask === false && one.auto && one.auto.ms === T0 + 300000 && one.auto.sec === 300 && !one.screen, 's250: 10분 안에 오는 차가 하나뿐이면 묻지 않고 그 차의 도착 시각(auto.ms)만 돌려준다');
    {   // s265: 같은 구간을 가는 번호가 여럿이면 번호마다 모아 한 팝업에 — 번호 하나씩만 오더라도 서로 다른 번호면 묻는다
      const bl2 = JSON.parse(JSON.stringify(bl)); bl2.altBus = ['931', '932'];
      const fb2 = () => facts({ data: { result: { path: [{ info: P.info, subPath: [walk(2, 0, 120), bl2, walk(2, 900, 1020)] }] } } });
      arr = { '931': [300], '932': [100] };
      const mu = JSON.parse((await ctx.__h(rq({ cap: 23, r: fb2() }))).b);
      ok(mu.ok && mu.ask === true && mu.info.items.length === 2 && mu.info.items[0].no === '932' && mu.info.items[1].no === '931' && mu.info.items[0].ms === T0 + 100000, 's265: 번호가 다른 차가 둘이면 묻는다(줄마다 번호) ' + JSON.stringify(mu.info && mu.info.items));
      arr = { '932': [200] };
      const o2 = JSON.parse((await ctx.__h(rq({ cap: 23, r: fb2() }))).b);
      ok(o2.ok && o2.ask === false && o2.auto && o2.auto.no === '932' && o2.auto.ms === T0 + 200000, 's265: 대체 번호의 차 하나뿐이면 묻지 않고 그 번호·시각을 돌려준다 ' + JSON.stringify(o2.auto));
    }
    arr = null;
    ok(JSON.parse((await ctx.__h(rq({ cap: 23, r: fb() }))).b).ask === false, 's200: 도착정보를 못 받아도 묻지 않고 그냥 시작하게 둔다');
    arr = { '931': [100] };
    ok(JSON.parse((await ctx.__h(rq({ cap: 23, r: facts() }))).b).ask === false, 's200: 첫 구간이 지하철이면 묻지 않는다');
    const x = await Promise.all([ctx.__h(rq('{bad')), ctx.__h(rq({}, 'GET')), ctx.__h(rq({}, 'OPTIONS'))]);
    ok(x[0].status === 400 && x[1].status === 405 && x[2].status === 204, 's200: 나쁜 JSON 400 · GET 405 · OPTIONS 204');
  } catch (e) { ok(false, 's200: 워커 /ride/buspick 시험 예외 ' + (e && e.stack || e)); }
  console.log(pass + ' 통과 / ' + fail + ' 실패');
  if (fail) process.exit(1);
})();

