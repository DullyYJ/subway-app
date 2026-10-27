// s266 (YJ: 환승역(아라)에서 14분에 대기를 눌렀더니 14분 탑승처럼 나옴 — 그 시각엔 열차가 없다)
//   환승 대기(st.xw) 중인 지하철 구간도 시각표 다음 차를 물어(ask boardlive) 그 답으로 역 시각을 옮긴다. 실행: node test/ride_xfer_next.test.js
const RS = require('../engine/ride-start'), SB = require('../engine/ride-standby');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const T0 = Date.UTC(2026, 9, 20, 3, 0, 0), LAT = 37.5, LNG0 = 126.9, DL = 0.0137;
const walk = (t, ss, es) => ({ trafficType: 3, sectionTime: t, distance: t * 70, startSec: ss, endSec: es });
const busLeg = { trafficType: 2, lane: [{ busNo: '9701' }], sectionTime: 8, distance: 3000, startName: 'B0', endName: 'B3', startSec: 120, endSec: 600, boardStopId: 'X1', boardCc: '23',
  passStopList: { stations: [0, 1, 2, 3].map(i => ({ stationName: 'B' + i, y: LAT, x: LNG0 + 0.004 * i })) } };
const subLeg = { trafficType: 1, lane: [{ name: '인천1호선' }], sectionTime: 10, distance: 6000, startName: '아라', endName: 'S5', startSec: 780, endSec: 1380, stopSec: [780, 900, 1020, 1140, 1260, 1380],
  passStopList: { stations: [0, 1, 2, 3, 4, 5].map(i => ({ stationName: i === 0 ? '아라' : 'S' + i, y: LAT, x: LNG0 + 0.0135 + DL * i })) } };
const P = { info: { totalTime: 24, transferCount: 1, pathType: 3, tab: 'fast' }, subPath: [walk(2, 0, 120), busLeg, walk(3, 600, 780), subLeg, walk(2, 1380, 1500)] };
const facts = { data: { result: { path: [P] } }, tab: 'fast', a: '출발지', b: '도착지', bt: null, rb: T0, now: T0, tz: 540, th: 'dark' };
const o = RS.rideStart({ cap: 18 }, facts);
ok(o.ok, '시작 state 가 만들어진다 ' + (o.msg || ''));
let s = JSON.parse(JSON.stringify(o.state));
const stops = s.stops;
const posAt = (ms) => {
  if (ms <= stops[0].arrMs) return [stops[0].lat, stops[0].lng];
  for (let i = 1; i < stops.length; i++) if (ms <= stops[i].arrMs) { const a = stops[i - 1], b = stops[i], f = (ms - a.arrMs) / (b.arrMs - a.arrMs); return [a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f]; }
  const l = stops[stops.length - 1]; return [l.lat, l.lng];
};
// 버스를 타고 달려 환승역(아라)에 내리고 → 시각표 다음 차를 받고 → 그 시각이 지날 때까지. gpsOnPlatform: 내리고 나서도 승강장 근처 위치가 계속 오는가(false = 지하라 기록이 끊김)
function run(gpsOnPlatform, answerDelayMs) {
  let st = JSON.parse(JSON.stringify(o.state)), ask = null, askMs = 0, bl = null, planX = null, xwAt = 0, trainMs = 0, committed = null, flick = 0, hadXw = false;
  const xi = () => st.xw ? st.xw.i : -1;
  for (let ms = T0; ms <= T0 + 2400000; ms += 5000) {
    let p = posAt(ms), fixes = [[ms, p[0], p[1], 15]];
    const alightMs = (stops.filter(q => q.i === 4)[0] || {}).arrMs;
    if (xwAt || (alightMs && ms > alightMs + 60000)) { const hs = stops.filter(q => q.i === xi())[0] || stops.filter(q => q.i === 5)[0]; p = [hs.lat, hs.lng]; fixes = [[ms, p[0], p[1], 15]]; }      // 환승역 승강장에서 기다린다
    if (xwAt && !gpsOnPlatform) fixes = [];                          // 내린 뒤 위치 기록이 끊긴다
    const req = { nowMs: ms, fixes, state: JSON.parse(JSON.stringify(st)) };
    if (bl) { req.bl = bl; bl = null; }
    const out = SB.rideStandby(req);
    if (out.error) { ok(false, '엔진 오류 ' + out.error); break; }
    st = out.state;
    const done0 = ask && !st.xw;
    if (st.xw && !xwAt) { xwAt = ms; planX = st.xw.arrMs; hadXw = true; }
    else if (hadXw && !st.xw && !done0) flick++;
    if (out.ask && out.ask.kind === 'boardlive' && out.ask.body && out.ask.body.kind === 'sub' && st.xw && out.ask.body.i === st.xw.i && !ask) {
      ask = out.ask.body; askMs = ms; trainMs = planX + 300000;
      bl = { ok: true, kind: 'sub', i: ask.i, ms: trainMs, src: 'table', at: ms, fromMs: ask.fromMs, allowEarlier: true, maxWait: 90 };
    }
    if (ask && !committed && !st.xw) { committed = { ms, pass: (st.eta.passes || []).filter(q => q.idx === ask.i)[0] }; break; }
  }
  return { ask, planX, trainMs, xwAt, committed, flick, st };
}
const a = run(false);
ok(a.xwAt > 0, '버스에서 내려 환승 대기(xw)가 선다');
ok(a.ask && a.ask.kind === 'sub' && a.ask.line === '인천1호선' && a.ask.from === '아라' && a.ask.maxWait === 90, '환승 대기가 서면 지하철 다음 차를 묻는다 ' + JSON.stringify(a.ask));
ok(a.committed && a.committed.pass && a.committed.pass.ms === a.trainMs, '승강장 위치 기록이 끊겨도 시각표 출발 시각(계획+5분)에 자동 승차 처리된다 ' + JSON.stringify(a.committed));
ok(a.flick === 0, '한 번 선 환승 대기는 깜박이지 않는다(마커가 되돌아가지 않는다)');
const b = run(true);
ok(b.ask && b.committed && b.committed.pass && b.committed.pass.ms === b.trainMs, '승강장 위치 기록이 계속 와도 시각표 다음 차 시각에 첫 열차를 태운다(탑승 전에는 승강장 위치가 탑승으로 잡히지 않는다) ' + JSON.stringify(b.committed));
console.log(pass + ' 통과 / ' + fail + ' 실패');
if (fail) process.exit(1);
