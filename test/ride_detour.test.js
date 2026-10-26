// 대기 모드 엔진 s229 — 역까지 이동(자차 이탈) · 대기 알약 이름 · 닫은 알약 다시 펼침
// 실행: node test/ride_detour.test.js
'use strict';
const assert = require('assert');
const path = require('path');
const E = require(path.join(__dirname, '..', 'engine', 'ride-standby.js'));
const { rideStandby, rsDetourQuery, rsAttachDetourTT } = E;
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e && e.stack).split('\n').slice(0, 3).join(' | ')); } };
const DAY = Date.parse('2026-10-26T00:00:00+09:00');
const at = (h, m, s) => DAY + ((h * 60 + m) * 60 + (s || 0)) * 1000;
// 순환43 한진 → 선광 → … → 테크노파크(버스) → 환승 → 테크노파크역(인천1호선) → … → 아라
const P = (h, m) => h * 60 + m;
const nodes = [
  { name: '도보', isOrigin: true },
  { name: '한진', isBus: true, lineName: '순환43', planMin: P(17, 37) },
  { name: '선광', isBus: true, lineName: '순환43', planMin: P(17, 39) },
  { name: '테크노파크', isBus: true, lineName: '순환43', planMin: P(17, 55) },
  { name: '환승', isWalk: true, planMin: P(17, 57) },
  { name: '테크노파크', isSub: true, lineName: '인천1호선', planMin: P(18, 4) },
  { name: '센트럴파크', isSub: true, lineName: '인천1호선', planMin: P(18, 6) },
  { name: '아라', isSub: true, lineName: '인천1호선', planMin: P(18, 55) },
];
const STN = { lat: 37.3816, lng: 126.6560 };           // 테크노파크역
function mkState(extra) {
  const st = {
    v: 1, tripSig: 'D1',
    eta: { nodes: JSON.parse(JSON.stringify(nodes)), passes: [{ idx: 1, ms: at(17, 37, 20), src: 'gps' }], boarded: true, notDeparted: false, tzOffsetMin: 540 },
    stops: [
      { i: 1, lat: 37.3472, lng: 126.6281, arrMs: at(17, 37, 0) }, { i: 2, lat: 37.3472, lng: 126.6362, arrMs: at(17, 39, 0) },
      { i: 3, lat: 37.3818, lng: 126.6568, arrMs: at(17, 55, 0) }, { i: 5, lat: STN.lat, lng: STN.lng, arrMs: at(18, 4, 0) },
      { i: 6, lat: 37.3900, lng: 126.6440, arrMs: at(18, 6, 0) }, { i: 7, lat: 37.5, lng: 126.7, arrMs: at(18, 55, 0), fin: true }],
    trail: [],
    cfg: { targets: [{ seqPos: 6, nodeIdx: 7, name: '아라', kind: 'dest' }, { seqPos: 3, nodeIdx: 3, name: '테크노파크', kind: 'transfer', nextLine: '인천1호선' }], seq: [1, 2, 3, 5, 6, 7], allowed: {}, destName: '아라' },
    ovl: { cells: nodes.map((n, i) => ({ n: n.name, t: '', dc: '#1e9e48' })), map: nodes.map((n, i) => i === 0 ? -1 : i), base: 0, theme: { bg: '#1c1c1e', fg: '#fff', sub: '#aaa' } },
    fired: {}
  };
  return Object.assign(st, extra || {});
}
const step = (st, ms, fix, extra) => { const r = rideStandby(Object.assign({ nowMs: ms, fixes: fix ? [fix] : [], state: JSON.parse(JSON.stringify(st)) }, extra || {})); assert.ok(!r.error, r.error); return r; };
// 차로 달려 역으로: 출발 위치(역에서 4km 남쪽)에서 역까지 시속 40km 로
function carFix(ms, t0, kmh) { const m = (ms - t0) / 1000 * (kmh / 3.6), dLat = Math.max(0, 4000 - m) / 111320; return [ms, STN.lat - dLat, STN.lng, 15]; }

t('역까지 이동: 누르면 st.dt 가 생기고 남은 거리·시간이 나온다(이탈 알림은 쉰다)', () => {
  let st = mkState(), t0 = at(17, 46, 0), r = step(st, t0, carFix(t0, t0, 40), { act: 'detour' });
  assert.ok(r.state.dt && r.state.dt.i === 5, JSON.stringify(r.state.dt));
  assert.strictEqual(r.dt.n, '테크노파크역');
  assert.ok(r.dt.d > 3000 && r.dt.d < 4100, 'd=' + r.dt.d);
  for (let k = 1; k <= 6; k++) { const ms = t0 + k * 5000; r = step(r.state, ms, carFix(ms, t0, 40)); }
  assert.ok(r.dt && r.dt.s > 0 && /테크노파크역까지/.test(r.ongoing.text), r.ongoing.text);
  assert.ok(!r.off && !(r.alert && r.alert.type === 'offroute'));
});
t('역까지 이동 중에는 하차·환승 알림을 울리지 않는다(버스 계획 시각표대로 흐르지만 차로 달리는 중)', () => {
  let st = mkState({ dt: { i: 5, name: '테크노파크역', at: at(17, 46, 0) } }), alerts = [], t0 = at(17, 50, 0);
  for (let ms = t0; ms <= at(17, 58, 0); ms += 5000) { const r = step(st, ms, carFix(ms, t0, 8)); st = r.state; if (r.alert) alerts.push(r.alert); }
  assert.deepStrictEqual(alerts, []);
});
t('역에 닿으면(150m 안) 시각표 답이 있을 때 그 시각 가장 빠른 열차로 이어 붙이고, 환승 대기(xw)가 서고 시트가 열린다', () => {
  let st = mkState({ dt: { i: 5, name: '테크노파크역', at: at(17, 46, 0) } }), now = at(17, 52, 0);
  let r = step(st, now, [now, STN.lat + 0.0006, STN.lng, 12]);       // 약 67m
  assert.ok(r.state.dt && r.state.dt.arr === now, '도착 표시 ' + JSON.stringify(r.state.dt));
  const q = rsDetourQuery({ nowMs: now + 5000, state: r.state });
  assert.ok(q && q.i === 5 && q.line === '인천1호선' && q.from === '테크노파크' && q.to === '센트럴파크', JSON.stringify(q));
  const nowM = q.atMin, dep = nowM + 3;                              // 승강장까지 2분 뒤부터 가장 빠른 열차 = 3분 뒤
  r = step(r.state, now + 5000, [now + 5000, STN.lat + 0.0005, STN.lng, 12], { dtTT: { i: 5, nowM: nowM, depMin: dep } });
  assert.ok(!r.state.dt && r.state.dtDone && r.state.dtDone.src === 'tt', JSON.stringify(r.state.dtDone));
  const depMs = r.state.dtDone.dep;
  assert.ok(depMs > now + 100000 && depMs < now + 400000, '출발 ' + (depMs - now));
  assert.ok(r.state.xw && r.state.xw.i === 5, 'xw ' + JSON.stringify(r.state.xw));
  assert.strictEqual(Math.abs(r.state.etaMs[5] - depMs) < 60000, true, 'etaMs[5]=' + r.state.etaMs[5] + ' dep=' + depMs);
  assert.ok(r.state.etaMs[7] > depMs && r.state.etaMs[7] - depMs < 60 * 60000, '아라 ' + new Date(r.state.etaMs[7]).toISOString());
  assert.ok(r.row && r.row.slot === 'transfer', 'row ' + JSON.stringify(r.row && r.row.slot));
  assert.ok(r.overlay && r.overlay.rs && (r.overlay.rs.st === 'board' || r.overlay.rs.st === 'wait'), JSON.stringify(r.overlay && r.overlay.rs && r.overlay.rs.st));
  assert.ok(!r.alert, '조용히');
});
t('시각표 답이 안 와도 10초 뒤에는 계획 시각표(없으면 5분 뒤)로 이어 붙인다', () => {
  let st = mkState({ dt: { i: 5, name: '테크노파크역', at: at(17, 46, 0), arr: at(17, 52, 0) } });
  let r = step(st, at(17, 52, 5), [at(17, 52, 5), STN.lat, STN.lng, 10]);
  assert.ok(r.state.dt, '아직 기다림');
  r = step(r.state, at(17, 52, 12), [at(17, 52, 12), STN.lat, STN.lng, 10]);
  assert.ok(!r.state.dt && r.state.dtDone && /plan|wait/.test(r.state.dtDone.src), JSON.stringify(r.state.dtDone));
  assert.ok(r.state.xw && r.state.xw.i === 5);
});
t('이탈 알림에 첫 지하철역 이름이 실린다(역까지 이동 버튼용) · 이미 지난 뒤나 지하철이 없으면 없다', () => {
  const st = mkState(); const base = at(17, 40, 0);
  // 경로선에서 한참 벗어난 위치를 2분 넘게 보낸다
  let r = null, s = st;
  for (let k = 0; k < 40; k++) { const ms = base + k * 5000; r = step(s, ms, [ms, 37.30, 126.80, 10]); s = r.state; }
  if (r.off) assert.strictEqual(r.off.stn, '테크노파크역');
  const noSub = mkState(); noSub.eta.nodes = nodes.slice(0, 4).map(n => Object.assign({}, n));
  assert.strictEqual(E.rsDtTarget(noSub), null);
});
t('대기 알약 문구: 대기 · 정류장/역 이름 · 노선(길면 이름만)', () => {
  const w = mkState(); w.eta.passes = []; w.eta.boarded = false; w.eta.notDeparted = true; w.wait = { i: 1, arrMs: at(17, 37, 0) };
  let r = step(w, at(17, 36, 0), null);
  assert.strictEqual(r.overlay.pillTxt, '대기 · 한진 · 순환43번');
  const x = mkState({ xw: null }); x.eta.passes = [1, 2, 3, 4].map(i => ({ idx: i, ms: DAY + nodes[i].planMin * 60000, src: 'gps' }));
  r = step(x, at(18, 2, 40), null);
  assert.ok(r.state.xw && /^대기 · 테크노파크역 · 인천1호선$/.test(r.overlay.pillTxt), r.overlay.pillTxt + ' ' + JSON.stringify(r.state.xw));
});
t('닫아 둔(shr) 환승 알약도 열차 시각이 되면 다시 펼쳐진다(board) — 시각 전에는 알약(wait) 그대로', () => {
  const x = mkState(); x.eta.passes = [1, 2, 3, 4].map(i => ({ idx: i, ms: DAY + nodes[i].planMin * 60000, src: 'gps' }));
  let r = step(x, at(18, 2, 40), null);
  const st1 = JSON.parse(JSON.stringify(r.state)); st1.xw.shr = true; st1.xw.seen = true;
  r = step(st1, at(18, 3, 0), null);          // 출발 1분 반 전 — 닫아 둔 알약
  assert.strictEqual(r.overlay.rs.st, 'wait');
  r = step(r.state, r.state.xw.arrMs + 10000, null);     // 출발 시각 지남 — 펼침
  assert.strictEqual(r.overlay.rs.st, 'board', JSON.stringify(r.overlay.rs));
  assert.ok(r.overlay.rs.bt);
});
t('s230: 열차가 시각표보다 3분 앞서 가도, 지하 역사의 정확도 90m 좌표로 영점이 잡혀 마커가 따라잡는다(60m 넘는 좌표를 버리던 때는 시각표에 갇혔다)', () => {
  const names = ['문학경기장', '인천터미널', '예술회관', '인천시청', '간석오거리', '부평삼거리'], plan = [P(18, 12), P(18, 14), P(18, 15), P(18, 17), P(18, 20), P(18, 22)];
  const nds = [{ name: '도보', isOrigin: true }].concat(names.map((n, i) => ({ name: n, isSub: true, lineName: '인천1호선', planMin: plan[i] })));
  const pos = i => 126.69 + i * 0.011, stops = names.map((n, i) => ({ i: i + 1, lat: 37.43, lng: pos(i), arrMs: DAY + plan[i] * 60000, pass: i > 0, fin: i === names.length - 1 }));
  let st = { v: 1, tripSig: 'E', eta: { nodes: nds, passes: [{ idx: 1, ms: at(18, 12, 0), src: 'gps' }], boarded: true, notDeparted: false, tzOffsetMin: 540, timetableFirst: true }, stops, trail: [],
    cfg: { targets: [{ seqPos: 5, nodeIdx: 6, name: '부평삼거리', kind: 'dest' }], seq: [1, 2, 3, 4, 5, 6], allowed: {}, destName: '부평삼거리' }, ovl: { cells: nds.map(n => ({ n: n.name, t: '', dc: '#1e9e48' })), map: nds.map((n, i) => i === 0 ? -1 : i), base: 0, theme: { bg: '#1c1c1e', fg: '#fff', sub: '#aaa' } }, fired: {} };
  const realT = i => DAY + plan[i] * 60000 - 180000;
  const realLng = ms => { for (let i = 0; i < names.length - 1; i++) if (ms <= realT(i + 1)) return pos(i) + Math.max(0, (ms - realT(i)) / (realT(i + 1) - realT(i))) * (pos(i + 1) - pos(i)); return pos(names.length - 1); };
  let r = null, atFrom = null;
  for (let ms = at(18, 12, 0); ms <= at(18, 16, 0); ms += 5000) {
    const fx = []; for (let q = ms - 4000; q <= ms; q += 1000) fx.push([q, 37.43, realLng(q), 90, null]);
    r = rideStandby({ nowMs: ms, fixes: fx.map(f => f.slice(0, 4)), state: JSON.parse(JSON.stringify(st)) }); st = r.state;
    if (ms === at(18, 15, 30)) atFrom = r.pos.from;
  }
  assert.ok(atFrom >= 4, '18:15:30 마커는 인천시청(노드 4) 이후여야 한다(시각표만 따르면 예술회관 구간): from=' + atFrom);
});
console.log('ride_detour: pass', pass, 'fail', fail);
process.exit(fail ? 1 : 0);
