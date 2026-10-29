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
t('s322: 역 근처 GPS 가 잡히는 동안(문 열림)은 계속 서 있고, 끊기면 10초 뒤 출발 — 마커가 앞으로 튀지 않는다 · 기존 15초는 바닥', () => {
  let st = mkState(), rows = [];
  const stn = LNG0 + DL;                                  // S1(노드 2) 좌표
  for (let ms = at(12, 52, 5); ms <= at(12, 54, 50); ms += 5000) {
    const open = ms >= at(12, 53, 40) && ms <= at(12, 54, 10);       // 문이 열려 GPS 가 잡히는 구간
    const fx = open ? [[ms, LAT, stn, 12]] : [];
    const r = rideStandby({ nowMs: ms, fixes: fx, state: JSON.parse(JSON.stringify(st)) }); st = r.state;
    rows.push({ ms, from: r.pos.from, ratio: r.pos.ratio, moving: r.pos.moving });
  }
  const at2 = rows.filter(x => x.from === 2), still = at2.filter(x => x.ratio === 0 && !x.moving);
  assert.ok(still.some(x => x.ms === at(12, 54, 10)), '문 열림(마지막 GPS) 때까지 서 있다');
  assert.ok(still.some(x => x.ms === at(12, 54, 15)), '끊긴 직후 10초 안에는 아직 선다(깜빡임 방지)');
  const first = at2.find(x => x.ms > at(12, 54, 10) && x.moving);
  assert.ok(first && first.ms >= at(12, 54, 20) && first.ms <= at(12, 54, 30), '끊긴 뒤 10초쯤 뒤에 출발 ' + (first && first.ms - at(12, 54, 0)));
  assert.ok(first.ratio < 0.12, '출발할 때 앞으로 튀지 않는다 ' + first.ratio);
  const lurch = at2.filter(x => x.ms > first.ms).every((x, i, a) => i === 0 || x.ratio >= a[i - 1].ratio - 0.001);
  assert.ok(lurch, '그 뒤 계속 앞으로');
});
t('s322: 오래 GPS 가 잡혀도(지상 역 등) 3분이 최대 — 그 뒤엔 출발한다 · 출발한 뒤 역 근처 GPS 가 더 들어와도 다시 서지 않는다', () => {
  let st = mkState(), rel = null, after = [];
  const stn = LNG0 + DL;
  for (let k = 2; k < 5; k++) st.stops[k].arrMs += 30 * 60000;                       // 다음 역 도착이 한참 뒤인 긴 구간 — 정차 상한만 시험한다
  st.eta.nodes = st.eta.nodes.map(n => Object.assign({}, n));                        // nodes 는 모듈 공용 — 복사해서 바꾼다
  for (let k = 3; k < 6; k++) st.eta.nodes[k].planMin += 30;
  for (let ms = at(12, 52, 5); ms <= at(12, 59, 0); ms += 5000) {
    const r = rideStandby({ nowMs: ms, fixes: ms >= at(12, 53, 0) ? [[ms, LAT, stn, 10]] : [], state: JSON.parse(JSON.stringify(st)) }); st = r.state;
    if (rel == null && st.dw && st.dw.i === 2 && st.dw.e != null) rel = { ms: ms, dw: JSON.parse(JSON.stringify(st.dw)) };
    else if (rel) after.push(r.pos.from + r.pos.ratio);
  }
  assert.ok(rel && rel.dw.e - rel.dw.s <= 180000, '정차 최대 3분 ' + JSON.stringify(rel));
  assert.ok(after.length > 3 && after.every((x, i, a) => i === 0 || x >= a[i - 1] - 0.001), '출발 뒤 계속 앞으로(다시 서지 않음)');
});
// ★ s323
t('s323: 늦게 출발하면 다음 역 도착도 같은 만큼 늦어진다 — 마커 속도가 출발 전 계획 속도와 같다(가속 없음)', () => {
  const stn = LNG0 + DL, run = (withGps) => {
    let st = mkState(), rows = [];
    for (let ms = at(12, 52, 5); ms <= at(12, 57, 0); ms += 5000) {
      const open = withGps && ms >= at(12, 53, 40) && ms <= at(12, 54, 40);                        // 문이 길게 열려 있다
      const r = rideStandby({ nowMs: ms, fixes: open ? [[ms, LAT, stn, 12]] : [], state: JSON.parse(JSON.stringify(st)) }); st = r.state;
      rows.push({ ms: ms, from: r.pos.from, ratio: r.pos.ratio, t0: r.pos.t0, t1: r.pos.t1, moving: r.pos.moving });
    }
    return rows;
  };
  const base = run(false), late = run(true);
  const b0 = base.find(x => x.from === 2 && x.moving), l0 = late.find(x => x.from === 2 && x.moving);
  assert.ok(b0 && l0 && l0.ms > b0.ms + 20000, '문이 길게 열려 늦게 출발 ' + (l0 && b0 && (l0.ms - b0.ms)));
  const bd = base.find(x => x.from === 2 && x.t1).t1 - base.find(x => x.from === 2 && x.moving).t0, ld = l0.t1 - l0.t0;
  assert.ok(Math.abs(ld - bd) <= 2000, '구간 소요(출발→도착)는 시각표와 같다 ' + bd + ' vs ' + ld);
  const seg = late.filter(x => x.from === 2 && x.moving), inc = seg.slice(1, 6).map((x, i) => x.ratio - seg[i].ratio);
  assert.ok(inc.every(d => Math.abs(d - inc[0]) <= 0.004), '정속 ' + inc.join(','));
  const sp0 = (base.filter(x => x.from === 2 && x.moving)[2].ratio - base.filter(x => x.from === 2 && x.moving)[1].ratio);
  assert.ok(Math.abs(inc[0] - sp0) <= 0.004, '늦게 출발해도 속도는 계획과 같다 ' + inc[0] + ' vs ' + sp0);
});
t('s323: 늦게 닿은 다음 역에서도 마커가 15초 선다(정차가 시각표 도착으로 끝나 있지 않다)', () => {
  const stn = LNG0 + DL;
  let st = mkState(), still3 = 0, ever3 = false;
  for (let ms = at(12, 52, 5); ms <= at(12, 58, 30); ms += 5000) {
    const open = ms >= at(12, 53, 40) && ms <= at(12, 54, 40);
    const r = rideStandby({ nowMs: ms, fixes: open ? [[ms, LAT, stn, 12]] : [], state: JSON.parse(JSON.stringify(st)) }); st = r.state;
    if (r.pos.from === 3) { ever3 = true; if (r.pos.ratio === 0 && !r.pos.moving) still3++; }
  }
  assert.ok(ever3 && still3 >= 2 && still3 <= 4, '다음 역에서도 15초쯤 정차 ' + still3);
});
t('s323: GPS 가 안 끊겨도(지상) 역에서 멀어지며 4m/s 이상이면 곧바로 출발한다', () => {
  const stn = LNG0 + DL, M = 1 / 111320 / Math.cos(LAT * Math.PI / 180);                // 경도 1m
  let st = mkState(), rel = null, rows = [];
  for (let ms = at(12, 52, 5); ms <= at(12, 56, 0); ms += 2000) {
    let fx = [];
    if (ms >= at(12, 53, 40)) { const mv = ms >= at(12, 54, 10) ? (ms - at(12, 54, 10)) / 1000 * 15 : 0; fx = [[ms, LAT, stn + mv * M, 8]]; }       // 54:10 부터 15m/s 로 떠난다
    const r = rideStandby({ nowMs: ms, fixes: fx, state: JSON.parse(JSON.stringify(st)) }); st = r.state;
    rows.push({ ms: ms, from: r.pos.from, moving: r.pos.moving, ratio: r.pos.ratio });
    if (rel == null && st.dw && st.dw.i === 2 && st.dw.go != null) rel = ms;
  }
  assert.ok(rel != null && rel <= at(12, 54, 25), '움직이기 시작한 지 15초 안에 출발 판정 ' + (rel && (rel - at(12, 54, 10)) / 1000));
  const m = rows.find(x => x.from === 2 && x.moving && x.ms >= rel);
  assert.ok(m && m.ms <= rel + 4000 && m.ratio < 0.1, '판정 직후 파랑으로 이동 · 튀지 않음 ' + JSON.stringify(m));
  assert.ok(st.dw.go != null, '속도 판정이 h(끊김 대기)를 대신한다');
});
t('s323: 걷는 속도(1.2m/s)나 제자리 흔들림은 출발로 보지 않는다', () => {
  const stn = LNG0 + DL, M = 1 / 111320 / Math.cos(LAT * Math.PI / 180);
  let st = mkState(), go = false;
  for (let ms = at(12, 53, 40); ms <= at(12, 54, 8); ms += 2000) {
    const jit = ((ms / 2000) % 2 ? 1 : -1) * 30 * M, walk = (ms - at(12, 53, 40)) / 1000 * 1.2 * M;
    const r = rideStandby({ nowMs: ms, fixes: [[ms, LAT, stn + jit + walk, 10]], state: JSON.parse(JSON.stringify(st)) }); st = r.state;
    if (st.dw && st.dw.go != null) go = true;
  }
  assert.ok(!go, '출발 오판 없음');
});

console.log('ride_dwell: pass', pass, 'fail', fail); process.exit(fail ? 1 : 0);
