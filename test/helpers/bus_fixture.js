// 버스로 시작하는 경로의 모의 엔진 응답 — 정류장은 동쪽으로 약 400m 간격 일직선(위도 37.5547 고정, 경도 +0.0045 씩).
// 구조는 helpers/engine_fixture.js 와 같다(trafficType 2 버스·3 도보). 시험에서 정류장 좌표를 그대로 GPS 로 쓴다.
const LAT = 37.5547, LNG0 = 126.9780, DLNG = 0.0045;
const stop = (i) => ({ x: +(LNG0 + i * DLNG).toFixed(6), y: LAT });
const st = (n, i) => Object.assign({ stationName: n }, stop(i));
const walk = (a, b, min, s0, p0, p1) => ({ trafficType: 3, sectionTime: min, startSec: s0, arriveSec: s0, endSec: s0 + min * 60, distance: 0, lane: [{ name: '도보' }], startName: a, endName: b, startX: p0.x, startY: p0.y, endX: p1.x, endY: p1.y });
// 정류장 이름·번호 i0..: names[k] 가 stop(i0+k)
const bus = (no, names, i0, s0, gap, wait) => {
  const sts = names.map((n, k) => st(n, i0 + k)); const stopSec = names.map((_, k) => s0 + k * gap);
  return { trafficType: 2, sectionTime: Math.round((names.length - 1) * gap / 60), startSec: s0, arriveSec: s0, endSec: s0 + (names.length - 1) * gap, stopSec, distance: 0, lane: [{ busNo: no }], startName: names[0], endName: names[names.length - 1], startX: sts[0].x, startY: sts[0].y, endX: sts[sts.length - 1].x, endY: sts[sts.length - 1].y, passStopList: { stations: sts }, xpWaitSec: null, waitSec: wait == null ? 300 : wait, waitReal: false, waitLive: false, waitEstimated: false, boardStopId: 'GGB1' };
};
const NAMES = ['가정류장', '나정류장', '다정류장', '라정류장', '마정류장', '바정류장', '사정류장', '아정류장'];
// 내 위치 → (도보 2분) → 가정류장 → 버스 no → 아정류장 → (도보 3분) → 도착지
function path(no, tab, s0, extra) {
  const me = { x: stop(0).x - 0.0025, y: LAT }, dst = { x: stop(7).x + 0.003, y: LAT };
  const p = { info: { totalTime: 40, totalDistance: 0, transferCount: 0, pathType: 2, tab: tab || 'fast', svcWarn: null, longDist: false, trip: { from: '내 위치', to: '도착지', arrSec: 2400 } },
    subPath: [walk('내 위치', NAMES[0], 2, 0, me, stop(0)), bus(no, NAMES, 0, s0 == null ? 480 : s0, 90), walk(NAMES[7], '도착지', 3, (s0 == null ? 480 : s0) + 7 * 90, stop(7), dst)] };
  return Object.assign(p, extra || {});
}
function resp(no, s0) {
  const a = path(no || '88', 'fast', s0), b = path(no || '88', 'less', s0), c = path(no || '88', 'walk', s0), d = path(no || '88', 'sub', s0), e = path(no || '88', 'bus', s0);
  return { result: { path: [a, b, c, d, e] }, hasBusOnly: true, engVer: 'test', engineVersion: 'test', warnings: [], liveStat: {} };
}
// 같은 승차 정류장(가정류장)에서 출발해 가운데부터 북동쪽으로 갈라지는 다른 버스(급행) — 정류장 i(≥1)는 위도 +0.0030·i 에 둔다.
const stopAlt = (i) => (i === 0 ? stop(0) : { x: +(LNG0 + i * DLNG * 0.8).toFixed(6), y: +(LAT + i * 0.0030).toFixed(6) });
const NAMES_ALT = ['가정류장', '급1정류장', '급2정류장', '급3정류장', '급4정류장', '급5정류장', '급6정류장', '급7정류장'];
function pathAlt(no, tab, s0) {
  const me = { x: stop(0).x - 0.0025, y: LAT }, last = stopAlt(7), dst = { x: last.x + 0.003, y: last.y };
  const sts = NAMES_ALT.map((n, k) => Object.assign({ stationName: n }, stopAlt(k)));
  const g = 60, ss = s0 == null ? 480 : s0;
  const b = { trafficType: 2, sectionTime: Math.round(7 * g / 60), startSec: ss, arriveSec: ss, endSec: ss + 7 * g, stopSec: sts.map((_, k) => ss + k * g), distance: 0, lane: [{ busNo: no }], startName: sts[0].stationName, endName: sts[7].stationName, startX: sts[0].x, startY: sts[0].y, endX: sts[7].x, endY: sts[7].y, passStopList: { stations: sts }, xpWaitSec: null, waitSec: 300, waitReal: false, waitLive: false, waitEstimated: false, boardStopId: 'GGB1' };
  return { info: { totalTime: 35, totalDistance: 0, transferCount: 0, pathType: 2, tab: tab || 'bus', svcWarn: null, longDist: false, trip: { from: '내 위치', to: '도착지', arrSec: 2100 } },
    subPath: [walk('내 위치', NAMES_ALT[0], 2, 0, me, stop(0)), b, walk(NAMES_ALT[7], '도착지', 3, ss + 7 * g, last, dst)] };
}
// 최단·최소환승·도보·지하철 탭은 88번, 버스 탭은 급행97 (엔진이 후보로 함께 준다)
function respWithAlt(s0) {
  const a = path('88', 'fast', s0), b = path('88', 'less', s0), c = path('88', 'walk', s0), d = path('88', 'sub', s0), e = pathAlt('급행97', 'bus', s0);
  return { result: { path: [a, b, c, d, e] }, hasBusOnly: true, engVer: 'test', engineVersion: 'test', warnings: [], liveStat: {} };
}
module.exports = { resp, respWithAlt, path, pathAlt, stop, stopAlt, NAMES, NAMES_ALT, LAT, LNG0, DLNG };
