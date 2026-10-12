// 탑승 시뮬레이션용 가상 세계 — 2026-10-12
//   지도는 미터(x 동쪽, y 북쪽) 좌표로 만들고, 위경도로 바꿔서 엔진 응답(route-v2-app 모의)을 만든다.
//   출발 O=(0,0), 도착 D=(7000,0). 모든 노선은 O→D 방향(동쪽)으로 달린다.
//   · 계획 경로(5가지 구성): bus / sub / bus_sub / sub_sub / sub_bus
//   · 엔진이 후보로 함께 주는 다른 버스(급행97: 북쪽으로 불룩) — '엔진이 아는 다른 차'
//   · 엔진이 모르는 경로(남쪽으로 불룩한 차·택시) — '유추해서 다시 찾아야 하는 길'
const { DEG_PER_M_LNG, DEG_PER_M_LAT } = require('../helpers/ride_harness');

// 목적지 '수원'(검색 결과 좌표 37.266162,126.999821)에서 서쪽으로 7km 떨어진 곳을 출발점 O 로 삼는다 — 앱이 마지막 노드를 검색 좌표에 놓으므로 세계가 어긋나지 않게
const DEST_LL = { lat: 37.266162, lng: 126.999821 };
const START = { lat: DEST_LL.lat, lng: +(DEST_LL.lng - 7000 * DEG_PER_M_LNG).toFixed(6) };
const xy = (x, y) => ({ x: +(START.lng + x * DEG_PER_M_LNG).toFixed(6), y: +(START.lat + y * DEG_PER_M_LAT).toFixed(6) });
const fromLL = (lat, lng) => ({ x: (lng - START.lng) / DEG_PER_M_LNG, y: (lat - START.lat) / DEG_PER_M_LAT });
const D = { x: 7000, y: 0 };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ── 선로 모양 ────────────────────────────────────────────────
// 직선 위 정류장: x0 부터 gap 간격으로 n 개, y 는 yFn(x)
const line = (prefix, x0, gap, n, yFn) => Array.from({ length: n }, (_, k) => { const x = x0 + k * gap; return { name: prefix + k, x, y: yFn ? yFn(x) : 0 }; });
const bulge = (h, x0, x1) => (x) => h * Math.sin(Math.PI * Math.max(0, Math.min(1, (x - x0) / (x1 - x0))));

// ── 엔진 응답 조각(helpers/engine_fixture·bus_fixture 와 같은 구조) ─────────
const asLL = (p) => Object.assign({ stationName: p.name }, xy(p.x, p.y));
function walkSec(a, b, min, s0) { const A = xy(a.x, a.y), B = xy(b.x, b.y); return { trafficType: 3, sectionTime: min, startSec: s0, arriveSec: s0, endSec: s0 + min * 60, distance: 0, lane: [{ name: '도보' }], startName: a.name || '출발', endName: b.name || '도착', startX: A.x, startY: A.y, endX: B.x, endY: B.y }; }
function rideSec(kind, label, stops, s0, gapSec, extra) {
  const sts = stops.map(asLL), stopSec = stops.map((_, k) => s0 + k * gapSec);
  const o = { trafficType: kind === 'bus' ? 2 : 1, sectionTime: Math.round((stops.length - 1) * gapSec / 60), startSec: s0, arriveSec: s0, endSec: s0 + (stops.length - 1) * gapSec, stopSec, distance: 0,
    lane: [kind === 'bus' ? { busNo: label } : { name: label }], startName: stops[0].name, endName: stops[stops.length - 1].name,
    startX: sts[0].x, startY: sts[0].y, endX: sts[sts.length - 1].x, endY: sts[sts.length - 1].y, passStopList: { stations: sts },
    xpWaitSec: null, waitSec: kind === 'bus' ? 300 : null, waitReal: false, waitLive: false, waitEstimated: false, boardStopId: kind === 'bus' ? 'SIM' + stops[0].name : null };
  return Object.assign(o, extra || {});
}
const wrap = (tab, subPath, totalMin, trip) => ({ info: { totalTime: totalMin, totalDistance: 0, transferCount: subPath.filter(s => s.trafficType !== 3).length - 1, pathType: 3, tab, svcWarn: null, longDist: false, trip: trip || { from: '내 위치', to: '수원역', arrSec: totalMin * 60 } }, subPath });

// ── 계획 경로 구성 ───────────────────────────────────────────
// 반환: { id, legs:[{kind:'walk'|'bus'|'sub', label, stops:[{name,x,y}], s0, gapSec, dwell, ug}], path(tab) }
//   s0: 구간 첫 정류장 출발 시각(요청 기준 초). 버스 간격 450m/90초, 지하철 1000m/150초(정차 30초 포함).
const BUS_GAP = 450, BUS_SEC = 90, SUB_GAP = 1000, SUB_SEC = 150;
function layout(id) {
  const O = { name: '내 위치', x: 0, y: 0 }, Dd = { name: '수원역', x: D.x, y: D.y };
  let legs = [];
  if (id === 'bus') {
    legs = [{ kind: 'bus', label: '88', stops: line('B', 250, BUS_GAP, 14), s0: 480, gapSec: BUS_SEC }];
  } else if (id === 'sub') {
    legs = [{ kind: 'sub', label: '1호선', stops: line('L', 400, SUB_GAP, 7), s0: 420, gapSec: SUB_SEC, ug: true }];
  } else if (id === 'bus_sub') {
    legs = [{ kind: 'bus', label: '88', stops: line('B', 250, BUS_GAP, 5), s0: 480, gapSec: BUS_SEC },
            { kind: 'sub', label: '1호선', stops: line('L', 2300, SUB_GAP, 5), s0: 480 + 4 * BUS_SEC + 360, gapSec: SUB_SEC, ug: true }];
  } else if (id === 'sub_sub') {
    legs = [{ kind: 'sub', label: '1호선', stops: line('L', 400, SUB_GAP, 4), s0: 420, gapSec: SUB_SEC, ug: true },
            { kind: 'sub', label: '2호선', stops: line('M', 3400, SUB_GAP, 4, () => 300), s0: 420 + 3 * SUB_SEC + 420, gapSec: SUB_SEC, ug: true }];
  } else if (id === 'sub_bus') {
    legs = [{ kind: 'sub', label: '1호선', stops: line('L', 400, SUB_GAP, 4), s0: 420, gapSec: SUB_SEC, ug: true },
            { kind: 'bus', label: '7', stops: line('C', 3700, BUS_GAP, 8), s0: 420 + 3 * SUB_SEC + 360, gapSec: BUS_SEC }];
  } else throw new Error('unknown layout ' + id);
  // 걷는 구간(앞·사이·뒤) 추가 — 시간은 거리/1.3m/s
  const withWalks = [];
  let prev = O, t = 0;
  legs.forEach((lg, i) => {
    const first = lg.stops[0], wmin = Math.max(1, Math.round(dist(prev, first) / 1.3 / 60));
    withWalks.push({ kind: 'walk', label: '도보', from: prev, to: first, stops: [], s0: t, min: wmin });
    withWalks.push(lg);
    prev = lg.stops[lg.stops.length - 1]; t = lg.s0 + (lg.stops.length - 1) * lg.gapSec;
  });
  withWalks.push({ kind: 'walk', label: '도보', from: prev, to: Dd, stops: [], s0: t, min: Math.max(1, Math.round(dist(prev, Dd) / 1.3 / 60)) });
  const totalMin = Math.round((t + 60 * (withWalks[withWalks.length - 1].min)) / 60);
  const mk = (tab) => wrap(tab, withWalks.map(l => l.kind === 'walk' ? walkSec(l.from, l.to, l.min, l.s0) : rideSec(l.kind, l.label, l.stops, l.s0, l.gapSec)), totalMin);
  return { id, legs: withWalks, rides: legs, totalMin, path: mk, O, D: Dd };
}

// 엔진이 후보로 함께 주는 다른 버스(급행97): O 근처 가정류장에서 북쪽으로 불룩하게 돌아 D 근처로
function altBus() {
  const stops = line('X', 250, 600, 11, bulge(1400, 250, 6250)); // 11개 정류장, 6250까지
  const O = { name: '내 위치', x: 0, y: 0 }, Dd = { name: '수원역', x: D.x, y: D.y };
  const leg = { kind: 'bus', label: '급행97', stops, s0: 480, gapSec: 70 };
  const w1 = { kind: 'walk', label: '도보', from: O, to: stops[0], min: 2, s0: 0 }, w2 = { kind: 'walk', label: '도보', from: stops[stops.length - 1], to: Dd, min: 12, s0: 480 + 10 * 70 };
  const legs = [w1, leg, w2];
  return { legs, rides: [leg], path: (tab) => wrap(tab, legs.map(l => l.kind === 'walk' ? walkSec(l.from, l.to, l.min, l.s0) : rideSec(l.kind, l.label, l.stops, l.s0, l.gapSec)), 40) };
}
// 엔진이 모르는 길(남쪽으로 불룩한 차 / 택시): 시험에서 사용자가 실제로 타는 것
const unknownBusStops = () => line('U', 250, 600, 11, (x) => -bulge(1500, 250, 6250)(x));
const taxiPts = () => [{ x: 0, y: 0 }, { x: 1500, y: -900 }, { x: 3500, y: -1600 }, { x: 5500, y: -900 }, { x: 7000, y: 0 }];

// ── 엔진 모의: 첫 탐색은 계획 경로, 이후 탐색(재탐색)은 요청한 출발 위치에서 도착지까지 새 경로 ─────────
//   재탐색 응답: 사용자 위치 근처 정류장(1분 도보) → 버스 R(450m 간격, 도착지 쪽으로 직진) → 3분 도보. 후보 5개 모두 같은 경로.
function makeEngine(lay, opts) {
  opts = opts || {};
  const alt = altBus();
  const calls = [];
  const fn = (qs) => {
    const sx = parseFloat(qs.SX), sy = parseFloat(qs.SY);
    const me = fromLL(sy, sx);
    calls.push({ qs, me });
    const nearO = dist(me, { x: 0, y: 0 }) < 300;
    if (nearO) {
      const P = (tab) => lay.path(tab);
      return { result: { path: [P('fast'), P('less'), P('walk'), P('sub'), opts.noAlt ? P('bus') : alt.path('bus')] }, hasBusOnly: true, engVer: 'sim', engineVersion: 'sim', warnings: [], liveStat: {} };
    }
    // 재탐색: 현재 위치에서 도착지까지 직진 버스
    const dx = D.x - me.x, dy = D.y - me.y, L = Math.hypot(dx, dy), n = Math.max(2, Math.min(14, Math.floor(L / 450)));
    const sts = Array.from({ length: n }, (_, k) => ({ name: 'R' + calls.length + '_' + k, x: me.x + dx * (k + 0.1) / n * 0.98 + 40, y: me.y + dy * (k + 0.1) / n * 0.98 }));
    const w1 = { kind: 'walk', label: '도보', from: Object.assign({ name: '내 위치' }, me), to: sts[0], min: 1, s0: 0 }, leg = { kind: 'bus', label: 'R', stops: sts, s0: 150, gapSec: BUS_SEC };
    const w2 = { kind: 'walk', label: '도보', from: sts[sts.length - 1], to: { name: '수원역', x: D.x, y: D.y }, min: 3, s0: 150 + (n - 1) * BUS_SEC };
    const L2 = [w1, leg, w2], P2 = (tab) => wrap(tab, L2.map(l => l.kind === 'walk' ? walkSec(l.from, l.to, l.min, l.s0) : rideSec(l.kind, l.label, l.stops, l.s0, l.gapSec)), 30);
    return { result: { path: ['fast', 'less', 'walk', 'sub', 'bus'].map(P2) }, hasBusOnly: true, engVer: 'sim', engineVersion: 'sim', warnings: [], liveStat: {} };
  };
  fn.calls = calls;
  return fn;
}

module.exports = { START, D, xy, fromLL, dist, line, bulge, layout, altBus, unknownBusStops, taxiPts, makeEngine, BUS_GAP, BUS_SEC, SUB_GAP, SUB_SEC, DEG_PER_M_LNG, DEG_PER_M_LAT };
