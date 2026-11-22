'use strict';
// route-v2 s469 — 경로 시험(147건 시간·요일 바꿔 돌리기)에서 나온 3건:
//   ① 직행·광역 후보(findDirectRed)가 '(미정차)' 지점을 승·하차 정류장으로 골랐다(예: 시청→강남 4104 '반포IC진입(미정차)' 하차, 강남→시청 3201 '교보타워사거리(미정차)' 승차)
//   ② 자정~03시: '다음 열차'(metroInfo)와 구간별 대기(ntAttachPath)가 전날 운행의 꼬리(시각표 1440분 이상 열)를 못 보고 첫차(05:xx)로 안내했다
//   ③ 버스 구간의 구간 소요(sectionTime)와 정류장별 타임라인(stopSec/endSec)이 어긋났다(판교→시청 9007: 42분 vs 74분)
// 실행: node test/s469_latenight_direct.test.js   (W_PATH=다른엔진.ascii.js 로 옛 엔진에 돌려 보면 ①③이 실패한다)
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const KST = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h, mi) - 9 * 3600e3;

// ───── ② 다음 열차 · 구간 대기 (자정 이후) ─────
const W = require('./helpers/nt_load')();
const { ntCreate, NT_INCHEON_TT, NT_STNORDER } = W;
const bundle = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tt_bundle.json'), 'utf8'));
const nt = ntCreate({ _REAL_TT: bundle.data._REAL_TT, _GIMPO_TT: bundle.data._GIMPO_TT, _INCHEON_TT: NT_INCHEON_TT, _BUILTIN_TT: bundle.data._BUILTIN_TT, LINE_SCHEDULE: bundle.data.LINE_SCHEDULE, _REAL_SEG: bundle.data._REAL_SEG, _TT_ORDER_HARD: bundle.data._TT_ORDER_HARD, STNORDER: NT_STNORDER });
const info = (b, line, from, to) => nt.metroInfo({ line, from, to, baseMs: b, mins: 0 });

// 금요일 밤 → 토요일 00:20: 금요일 시각표의 24시 이후 열차(1440+)가 있다
const sat0020 = KST(2026, 11, 28, 0, 20);
for (const [l, f, t] of [['3호선', '신사', '을지로3가'], ['2호선', '강남', '을지로입구']]) {
  const i = info(sat0020, l, f, t);
  ok(i && i.found === true && i.depMin >= 1440 + 20 && i.depMin <= 1440 + 120, '토 00:20 ' + l + ' ' + f + ' — 어젯밤 막차 구간 열차를 찾는다 ' + JSON.stringify(i));
  const dep = nt.boardTable({ line: l, from: f, to: t, atMin: 1440 + 20, baseMs: KST(2026, 11, 27, 12, 0) }).depMin;
  ok(i && i.depMin === dep, '토 00:20 ' + l + ' — 금요일 시각표(어제 요일 구분)의 25시 안팎 값과 같다 ' + (i && i.depMin) + ' vs ' + dep);
}
// 일요일 밤 → 월요일 00:40: 일요일(휴일) 시각표의 꼬리 — 남은 열차가 없으면 첫차는 '월요일' 시각표 값이어야 한다
const mon0040 = KST(2026, 12, 7, 0, 40);
{
  const i = info(mon0040, '3호선', '신사', '을지로3가');
  const mondayFirst = nt.boardTable({ line: '3호선', from: '신사', to: '을지로3가', atMin: 0, baseMs: KST(2026, 12, 7, 12, 0) }).depMin;
  if (i.found === false) ok(i.firstMin === mondayFirst % 1440, '월 00:40 열차가 없으면 첫차는 월요일 시각표 값 ' + i.firstMin + ' vs ' + mondayFirst);
  else ok(i.depMin >= 1440 + 40, '월 00:40 열차를 찾았다면 24시 이후 값 ' + JSON.stringify(i));
}
// 새벽 02:30(꼬리가 끝난 뒤)·06:00(낮 시각표)은 예전과 같다
{
  const a = info(KST(2026, 11, 24, 2, 30), '3호선', '신사', '을지로3가');
  ok(a.found === false && a.firstMin > 300 && a.firstMin < 400, '화 02:30 — 운행 종료, 첫차 05시대 ' + JSON.stringify(a));
  const b = info(KST(2026, 11, 24, 6, 0), '3호선', '신사', '을지로3가');
  ok(b.found === true && b.depMin >= 360 && b.depMin <= 372, '화 06:00 — 평소대로 다음 열차 ' + JSON.stringify(b));
  const c = info(KST(2026, 11, 24, 23, 50), '3호선', '신사', '을지로3가');
  ok(c.found === true && c.depMin >= 1430, '화 23:50 — 평소대로 ' + JSON.stringify(c));
}
// ntAttachPath — 23:40 출발, 구간이 00:10 에 탄다(자정 넘김): 이제 어젯밤 시각표 꼬리에서 대기를 찾는다
const synth = (base, startSec, names, line) => {
  const sts = names.map((n, i) => ({ stationName: n, x: 126.97 + i * 0.01, y: 37.5 - i * 0.01 }));
  return { info: { totalTime: 40, tab: 'fast', svcWarn: null, transferCount: 0, pathType: 1 }, subPath: [
    { trafficType: 3, sectionTime: 5, startSec: 0, arriveSec: 0, endSec: 300, lane: [{ name: '도보' }], startName: '내 위치', endName: names[0] },
    { trafficType: 1, sectionTime: 20, startSec, arriveSec: 300, endSec: startSec + 1200, lane: [{ name: line }], startName: names[0], endName: names[names.length - 1], passStopList: { stations: sts }, stopSec: sts.map((_, i) => startSec + i * 120) },
  ] };
};
{
  const base = KST(2026, 11, 27, 23, 40);          // 금 23:40
  const p = synth(base, 1800, ['신사', '잠원', '고속터미널'], '3호선');     // 00:10 에 탄다
  nt.__dummy = 0;
  const n = W.ntAttachPath(nt, p, base, true, null);
  const w = p.subPath[1].ttWaitMs;
  ok(w != null && w > 0 && w <= 30 * 60000, '23:40 출발·00:10 승차: 구간 대기 ttWaitMs 가 붙는다(예전엔 05시 첫차까지 320분이라 버려졌다) ' + w);
  const base2 = KST(2026, 11, 28, 0, 5);           // 토 00:05 에 검색(검색 시각 자체가 자정 이후)
  const p2 = synth(base2, 300, ['신사', '잠원', '고속터미널'], '3호선');     // 00:10 승차
  W.ntAttachPath(nt, p2, base2, true, null);
  ok(p2.subPath[1].ttWaitMs != null && p2.subPath[1].ttWaitMs <= 30 * 60000, '00:05 검색·00:10 승차도 대기가 붙는다 ' + p2.subPath[1].ttWaitMs);
  const base3 = KST(2026, 11, 24, 8, 30);          // 화 08:30 낮 — 예전과 같다
  const p3 = synth(base3, 300, ['신사', '잠원', '고속터미널'], '3호선');
  W.ntAttachPath(nt, p3, base3, true, null);
  ok(p3.subPath[1].ttWaitMs == null || (p3.subPath[1].ttWaitMs >= 0 && p3.subPath[1].ttWaitMs <= 30 * 60000), '낮 시각은 그대로');
}

// ───── ①③ 경로 엔진 함수 (워커 파일에서 잘라 쓴다) ─────
const WP = process.env.W_PATH || path.join(__dirname, '..', 'engine/route-v2-worker.ascii.js');
const S = fs.readFileSync(WP, 'utf8');
function cut(name) {
  const a = S.indexOf('function ' + name + '(');
  if (a < 0) throw new Error(name + ' 없음');
  let b = S.indexOf('__name(' + name + ',', a);
  if (b < 0) b = S.indexOf('\nfunction ', a + 20);
  return S.slice(a, b);
}
const ctx = { __name: (f) => f, __name2: (f) => f, Math, String, Array, Object, isFinite, Infinity, Set, Map, Number, JSON, parseInt, parseFloat, RegExp, console };
vm.createContext(ctx);
const constRe = (n) => { const m = new RegExp('^var ' + n + ' = [^;]+;', 'm').exec(S); if (!m) throw new Error(n + ' 상수 없음'); return m[0]; };
const consts = ['WALK_MPS', 'BUS_STOP_SEC', 'BUS_CRUISE_MPS', 'BUS_LONGHOP_LOW_M', 'BUS_LONGHOP_HIGH_M', 'BUS_HIGHWAY_MPS', 'RED_BUS_RE', '_PASS_MEMO'].map(constRe).join('\n');
vm.runInContext(consts + '\nvar DIRECT_ACCESS_M = 800, DIRECT_EGRESS_M = 1000, DIRECT_MAX_CAND = 3;\nfunction svcRunning() { return true; }\n' +
  cut('hav') + '\n' + cut('busSegSec') + '\n' + cut('isPassStop') + '\n' + cut('isPassStopRaw') + '\n' + cut('stopDispName') + '\n' + cut('_nowMinKST') + '\n' +
  (S.indexOf('function dirNoStop(') >= 0 ? cut('dirNoStop') + '\n' : '') + cut('findDirectRed') + '\n' + cut('legsToSubPath') + '\nthis.fd = findDirectRed; this.lsp = legsToSubPath;', ctx);

// ① 3201 처럼 노선의 첫 노드와 끝 노드가 '(미정차)' 인 광역 노선: 출발지에서 가장 가까운 노드가 미정차 지점
const LAT = 37.5, LNG = 127.0, M = 1 / 111320;               // 위도 1m ≈ 1/111320 도
const node = (id, nm, dN, dE) => ({ node_id: id, node_nm: nm, seq: 0, lat: LAT + dN * M, lng: LNG + dE * M / Math.cos(LAT * Math.PI / 180) });
const stopsA = [node('N0', '교보타워사거리(미정차)', 20, 0), node('N1', '강남역', 120, 0), node('N2', '양재IC(미정차)', 5000, 0), node('N3', '반포IC진입(미정차)', 9000, 0), node('N4', '서울시청', 9300, 0), node('N5', '서울역', 9900, 0)];
const GA = () => ({ routeStops: { R1: stopsA.map((s, i) => Object.assign({}, s, { seq: i })) }, routeTypeOf: { R1: '광역급행' }, noStop: { N0: 1, N2: 1, N3: 1 }, svcWin: {}, _baseMs: KST(2026, 11, 24, 13, 0) });
{
  // 출발 = N0 바로 옆(20m 안쪽)·도착 = N3 바로 옆
  const r = ctx.fd(GA(), LAT, LNG, LAT + 9010 * M, LNG, true);
  ok(r.length === 1, '후보 1건 ' + r.length);
  if (r.length) {
    const c = r[0];
    ok(c.stops[c.bi].node_id === 'N1', '승차는 미정차(N0)가 아니라 다음 실제 정류장(N1): ' + c.stops[c.bi].node_nm);
    ok(c.stops[c.ei].node_id === 'N4', '하차는 미정차(N3)가 아니라 다음 실제 정류장(N4): ' + c.stops[c.ei].node_nm);
  }
  // noStop 표가 비어 있어도 이름으로 알아본다
  const g2 = GA(); g2.noStop = {};
  const r2 = ctx.fd(g2, LAT, LNG, LAT + 9010 * M, LNG, true);
  ok(r2.length === 1 && r2[0].stops[r2[0].bi].node_id === 'N1' && r2[0].stops[r2[0].ei].node_id === 'N4', '이름에 미정차가 들어 있으면 표 없이도 제외');
  // 실제 정류장이 800m(승차)/1000m(하차) 밖이면 후보에서 뺀다
  const g3 = GA(); g3.routeStops.R1[1] = Object.assign({}, g3.routeStops.R1[1], { lat: LAT + 900 * M });
  const r3 = ctx.fd(g3, LAT, LNG, LAT + 9010 * M, LNG, true);
  ok(r3.length === 0, '승차할 수 있는 정류장이 접근 한도 밖이면 후보 없음 ' + r3.length);
}

// ③ 버스 구간: 정류장별 시각(secList)의 마지막 값과 구간 소요(min·대기)가 크게 다르면 구간 소요에 맞춘다
{
  const names = ['판교역동편', '판교역.낙생육교', '판교TG(미정차)', '금토JC(미정차)', '서울진입(미정차)', '호남고속.신세계', '서울시청'];
  const secList = [0, 343, 1221, 1586, 1900, 2243, 4457];                        // 마지막 4457초 = 74분
  const leg = { mode: 'bus', line: '31_9007', busNo: '9007', from: names[0], to: names[names.length - 1], stopList: names, coordList: names.map((_, i) => [37.39 + i * 0.03, 127.11 - i * 0.02]), secList, sec: 2520, min: 42, waitSec: 450, waitReal: false };
  const sp = ctx.lsp([leg], { accessWalkMin: 2 }, { sx: 127.11, sy: 37.39 });
  const b = sp.find((x) => x.trafficType === 2);
  const ride = (b.endSec - b.startSec) / 60, mv = b.sectionTime - b.waitSec / 60;
  ok(Math.abs(ride - mv) <= 1.5, '타임라인 탑승 ' + ride.toFixed(1) + '분 ≈ 구간 소요-대기 ' + mv.toFixed(1) + '분');
  ok(Math.abs(b.stopSec[b.stopSec.length - 1] - b.endSec) < 1, '마지막 정류장 시각 = 구간 끝');
  ok(b.stopSec.every((v, i) => i === 0 || v >= b.stopSec[i - 1]), '정류장 시각은 계속 늘어난다');
  // 이미 맞는 구간은 건드리지 않는다
  const leg2 = Object.assign({}, leg, { secList: [0, 200, 500, 900, 1300, 1700, 2070], sec: 2520, min: 42 });
  const b2 = ctx.lsp([leg2], { accessWalkMin: 2 }, { sx: 127.11, sy: 37.39 }).find((x) => x.trafficType === 2);
  ok(Math.abs((b2.endSec - b2.startSec) - 2070) < 0.5 && b2.stopSec[3] - b2.stopSec[0] === 900, '맞는 구간은 그대로 ' + (b2.endSec - b2.startSec));
}

// ④ (s470) 요청마다 다른 값인 subOff/subFirst 를 모든 요청이 같이 쓰는 _G 에서 꺼내 쓰지 않는다 — D1 을 기다리는 사이 다른 시각의 요청이 덮어써 새벽 검색에서 운행 끝난 노선이 되살아났다
ok(/const _subOffReq = subOffSet\(_G\.LN, _nk, _we\);/.test(S) && /subOff: _subOffReq,/.test(S) && /subFirst: _subFirstReq,/.test(S) && !/subOff: _G\.subOff/.test(S), 's470: G.subOff · G.subFirst 는 이 요청이 계산한 지역 값');
console.log('s469_latenight_direct: pass', pass, 'fail', fail); process.exit(fail ? 1 : 0);
