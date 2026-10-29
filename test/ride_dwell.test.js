// s321 마커 정차 15초 시험 — node test/ride_dwell.test.js
'use strict';
const assert = require('assert'), path = require('path');
const { rideStandby } = require(path.join(__dirname, '..', 'engine', 'ride-standby.js'));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e && e.message).split('\n')[0]); } };
const DAY = Date.parse('2026-10-13T00:00:00+09:00');
const at = (h, m, s) => DAY + ((h * 60 + m) * 60 + (s || 0)) * 1000;
const LAT = 37.5, LNG0 = 126.9, DL = 0.0137;
const PLAN = [null, 12 * 60 + 52, 12 * 60 + 54, 12 * 60 + 56, 12 * 60 + 58, 13 * 60];
const nodes = [{ name: '출발', isOrigin: true }].concat([0, 1, 2, 3, 4].map(i => ({ name: 'S' + i, isSub: true, lineName: '인천1호선', planMin: PLAN[i + 1] })));
function mkState() {
  const stops = [], seq = [1, 2, 3, 4, 5];
  for (let i = 1; i <= 5; i++) stops.push({ i: i, lat: LAT, lng: LNG0 + DL * (i - 1), arrMs: DAY + PLAN[i] * 60000, pass: i > 1, fin: i === 5 });
  return { v: 1, tripSig: 'T1', eta: { nodes: nodes, passes: [{ idx: 1, ms: at(12, 52, 0), src: 'gps' }], boarded: true, notDeparted: false, timetableFirst: true, tzOffsetMin: 540 },
    stops: stops, trail: [], cfg: { targets: [{ seqPos: 4, nodeIdx: 5, name: 'S4', kind: 'dest' }], seq: seq, allowed: {}, destName: 'S4' }, fired: {} };
}

// ★ s321 (YJ: "GPS 도착 확정 후 15초는 노랑 마커로 멈췄다가 파랑으로 이동 · GPS 판정이 안 되면 시각표 도착 시각에 15초 서 있다가 이동 · 서 있는 도중 영점이 잡혀도 15초 타이머를 리셋하지 마")
t('s321: 시각표만으로도 역에 닿으면 마커가 15초 서 있다가(정차) 이동한다 — 시작 시각은 st.dw 에 붙잡힌다', () => {
  let st = mkState(), still = [], dw0 = null, movedAfter = false, hit2 = false;
  for (let ms = at(12, 52, 5); ms <= at(12, 57, 0); ms += 5000) {
    const r = rideStandby({ nowMs: ms, fixes: [], state: JSON.parse(JSON.stringify(st)) }); st = r.state;
    if (r.pos && r.pos.from === 2 && r.pos.ratio === 0 && !r.pos.moving) { still.push(ms); hit2 = true; if (!dw0 && st.dw && st.dw.i === 2) dw0 = st.dw; }
    else if (hit2 && r.pos && r.pos.from === 2 && r.pos.ratio > 0) movedAfter = true;
  }
  assert.ok(dw0 && still.length >= 2 && still.length <= 4, '15초 안팎(5초 걸음 3번) 정차 ' + still.length);
  assert.ok(still[still.length - 1] - dw0.s <= 15000 && movedAfter, '정차 뒤 이동');
});
t('s321: 서 있는 도중 GPS 영점이 잡혀도 15초 타이머는 리셋하지 않는다 · 정차가 끝나면 이동한다', () => {
  let st = mkState(), snap = null;
  for (let ms = at(12, 52, 5); ms <= at(12, 57, 0) && !snap; ms += 5000) {
    const r = rideStandby({ nowMs: ms, fixes: [], state: JSON.parse(JSON.stringify(st)) }); st = r.state;
    if (st.dw && st.dw.i === 2 && r.pos.ratio === 0) snap = { st: JSON.parse(JSON.stringify(st)), ms: ms, s: st.dw.s };
  }
  assert.ok(snap, '정차 시작');
  const t1 = snap.ms + 5000, zero = JSON.parse(JSON.stringify(snap.st));
  zero.eta.passes.push({ idx: 2, ms: t1 - 2000, src: 'gps' });
  const b = rideStandby({ nowMs: t1, fixes: [], state: zero });
  assert.strictEqual(b.state.dw.s, snap.s, '영점이 잡혀도 정차 시작은 그대로(리셋 없음)');
  assert.ok(b.pos.from === 2 && b.pos.ratio === 0 && !b.pos.moving, '여전히 정차');
  const end = snap.s + 15000, c = rideStandby({ nowMs: end + 6000, fixes: [], state: JSON.parse(JSON.stringify(b.state)) });
  assert.ok(c.pos.ratio > 0 || c.pos.from > 2, '15초 뒤에는 이동 ' + JSON.stringify(c.pos).slice(0, 120));
});
t('s321: GPS 도착 확정이 처음이면 그 확정 시각부터 15초(통과 시각이 더 일러도) · 이미 멀리 간 마커는 되돌리지 않는다', () => {
  const st0 = mkState(); st0.eta.passes = [{ idx: 1, ms: at(12, 52, 0), src: 'gps' }];
  const now = at(12, 54, 40);                       // 시각표 도착(12:54:2x)보다 한참 뒤 — 마커는 이미 S1 을 떠나 이동 중
  const far = rideStandby({ nowMs: now, fixes: [], state: JSON.parse(JSON.stringify(st0)) });
  assert.ok(far.pos.from === 2 && far.pos.ratio > 0.1, '이미 떠난 마커(대조) ' + far.pos.ratio);
  const g = JSON.parse(JSON.stringify(far.state)); g.eta.passes.push({ idx: 2, ms: now - 9000, src: 'gps' });
  const r = rideStandby({ nowMs: now + 5000, fixes: [], state: g });
  assert.ok(r.pos.moving && r.pos.ratio >= far.pos.ratio - 0.01, '멀리 간 마커는 되돌아가 서지 않고 계속 간다 ' + r.pos.ratio);
  // 시각표 도착 직전(마커가 아직 S1 앞) 에 GPS 가 먼저 확정하면 그 시각부터 15초
  const early = at(12, 53, 50), a = rideStandby({ nowMs: early, fixes: [], state: JSON.parse(JSON.stringify(st0)) });
  const g2 = JSON.parse(JSON.stringify(a.state)); g2.eta.passes.push({ idx: 2, ms: early - 3000, src: 'gps' });
  const b = rideStandby({ nowMs: early + 5000, fixes: [], state: g2 });
  assert.ok(b.state.dw && b.state.dw.i === 2 && b.state.dw.g === 1 && b.state.dw.s === early + 5000, 'GPS 확정 시각 = 정차 시작 ' + JSON.stringify(b.state.dw));
  assert.ok(b.pos.from === 2 && b.pos.ratio === 0 && !b.pos.moving, '확정 직후 정차(노랑)');
  const c = rideStandby({ nowMs: early + 5000 + 14000, fixes: [], state: JSON.parse(JSON.stringify(b.state)) }), d = rideStandby({ nowMs: early + 5000 + 17000, fixes: [], state: JSON.parse(JSON.stringify(b.state)) });
  assert.ok(c.pos.ratio === 0 && d.pos.ratio > 0, '14초엔 정차 · 17초엔 이동');
});
t('s321: 지하라 GPS 가 늦게 들어와 시각표보다 일찍 도착을 확정해도(간석오거리 18:00 vs 시각표 18:01) 확정한 순간부터 15초 선다', () => {
  let st = mkState(), conf = null, still = [];
  const lng = ms => (ms <= at(12, 53, 0) ? LNG0 + DL * ((ms - at(12, 52, 0)) / 60000) : ms <= at(12, 53, 30) ? LNG0 + DL : LNG0 + DL + DL * ((ms - at(12, 53, 30)) / 90000));
  for (let ms = at(12, 52, 5); ms <= at(12, 54, 40); ms += 5000) {
    const fx = ms >= at(12, 53, 40) ? [[ms, LAT, lng(ms), 15]] : [];
    const r = rideStandby({ nowMs: ms, fixes: fx, state: JSON.parse(JSON.stringify(st)) }); st = r.state;
    if (r.pos.from === 2 && r.pos.ratio === 0 && !r.pos.moving) { if (!conf) conf = ms; still.push(ms); }
  }
  assert.ok(conf && conf >= at(12, 53, 40), '확정(GPS 가 들어온 뒤)에 선다');
  assert.ok(still.length >= 3 && still[still.length - 1] - conf >= 10000 && still[still.length - 1] - conf <= 15000, '확정부터 15초 정차 ' + still.length);
});

console.log('ride_dwell: pass', pass, 'fail', fail); process.exit(fail ? 1 : 0);
