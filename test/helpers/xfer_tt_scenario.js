// s456 시나리오(YJ 2026-11-16 실기기 화면 재현): 991 버스 → 아라역3번출구 하차 → 인천1호선 아라 06:18 → 계양 06:22 → 귤현 06:24 → 박촌 06:27 → …
//   run(rideStandby, { mode, busLate, depLate, tt, press, end, rec }) → { rows, changed, st, names }
//   mode   : 'none' 하차 1분 뒤부터 지하(위치 없음) · 'stale' 지하에서도 같은 좌표가 새 시각으로 계속 옴(정확도 60m) · 'ground' 지상역(계양·귤현) 근처에서만 위치 · 'live' 열차를 따라 정확한 위치
//   staleSec: stale 방식에서 열차 출발 뒤 같은 좌표가 계속 오는 시간(초, 기본 210) · staleAcc: 그 좌표의 정확도(m, 기본 60)
//   busLate: 버스가 계획보다 늦는 초 · dep: 내가 타는 열차의 시각표 출발 분(06:dep, 기본 18) · depLate: 그 열차가 시각표보다 늦게 떠나는 초 · tt: 승차역 node.tt(그 역 시각표)를 싣는다(/ride/start 가 실어 준 경우)
//   press  : 'M:S' — 그 시각(06:M:S)에 [탑승]을 누른다(attachPress = rsAttachPressTT 를 주면 서버처럼 시각표 답을 붙인다) · end: 끝낼 분(06:end) · rec(req, out): 걸음마다 부른다(자바 대조용 녹화)
'use strict';
const DAY = Date.parse('2026-11-16T00:00:00+09:00');
const at = (h, m, s) => DAY + ((h * 60 + m) * 60 + (s || 0)) * 1000;
const hms = (ms) => { const d = new Date(ms + 9 * 3600000); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ':' + String(d.getUTCSeconds()).padStart(2, '0'); };
const BUS = [
  ['이음1로.모아미래도엘리트파크', 37.5935, 126.6720, 6 * 60 + 1],
  ['인천해든초등학교', 37.5950, 126.6800, 6 * 60 + 4],
  ['한신더휴어반파크', 37.5965, 126.6900, 6 * 60 + 7],
  ['아라역4번출구', 37.5950, 126.7095, 6 * 60 + 10],
  ['아라역3번출구', 37.5944, 126.7125, 6 * 60 + 11],
];
const SUB = [
  ['아라', 37.594118, 126.71301, 6 * 60 + 18], ['계양', 37.571769, 126.736319, 6 * 60 + 22], ['귤현', 37.566362, 126.742498, 6 * 60 + 24], ['박촌', 37.553525, 126.744946, 6 * 60 + 27],
  ['임학', 37.54506, 126.73864, 6 * 60 + 29], ['계산', 37.54324, 126.72844, 6 * 60 + 31], ['경인교대입구', 37.53827, 126.7226, 6 * 60 + 33], ['작전', 37.53027, 126.72255, 6 * 60 + 35],
  ['갈산', 37.51712, 126.72157, 6 * 60 + 37], ['부평구청', 37.50877, 126.72055, 6 * 60 + 39],
];
const TT_ARA = [6 * 60 + 8, 6 * 60 + 18, 6 * 60 + 28, 6 * 60 + 38, 6 * 60 + 48];      // 아라역 평일 하행(계양 방면) 시각표 — fixtures/incheon_tt.json 과 같다
const ARA = BUS.length + 1;      // 아라 노드 번호(6)
const NT = { boardTable: (q) => ({ dk: '하', depMin: (TT_ARA.find((t) => t >= q.atMin) != null ? TT_ARA.find((t) => t >= q.atMin) : null) }) };      // 시각표 흉내(아라역 하행)
function mkState(o) {
  const nd = [{ name: '아라1동', isOrigin: true }], stops = [];
  BUS.forEach((b) => nd.push({ name: b[0], isBus: true, lineName: '991', planMin: b[3] }));
  SUB.forEach((s, si) => { const n = { name: s[0], isSub: true, lineName: '인천1호선', planMin: s[3] }; if (si === 0 && o.tt) n.tt = TT_ARA.filter((t) => t > s[3] && t <= s[3] + 60); nd.push(n); });
  const all = BUS.concat(SUB);
  all.forEach((p, k) => { const i = k + 1; stops.push({ i, lat: p[1], lng: p[2], arrMs: DAY + p[3] * 60000, pass: k > 0, fin: k === all.length - 1, bus: k < BUS.length }); });
  return { v: 1, tripSig: 'YJ1116', eta: { nodes: nd, passes: [{ idx: 1, ms: at(6, 4, 0), src: 'gps' }], boarded: true, notDeparted: false, tzOffsetMin: 540 },
    stops, trail: [], cfg: { targets: [{ seqPos: 4, nodeIdx: 5, name: '아라역3번출구', kind: 'transfer', nextLine: '인천1호선' }, { seqPos: all.length - 1, nodeIdx: all.length, name: SUB[SUB.length - 1][0], kind: 'dest' }], seq: all.map((_, k) => k + 1), allowed: {}, destName: SUB[SUB.length - 1][0] }, fired: {}, notYet: {}, steps: 0, startedAt: at(6, 3, 0) };
}
function run(rideStandby, opts) {
  const o = Object.assign({ mode: 'none', busLate: 180, dep: 18, depLate: 0, tt: false, press: '', end: 26, staleSec: null, staleAcc: 60 }, opts || {});
  const REAL_DEP = at(6, o.dep, 0) + 1000 * o.depLate, ALIGHT = DAY + BUS[4][3] * 60000 + o.busLate * 1000;
  const busPos = (ms) => {
    const T = BUS.map((b) => DAY + b[3] * 60000 + o.busLate * 1000);
    if (ms <= T[0]) return [BUS[0][1], BUS[0][2]];
    for (let i = 1; i < BUS.length; i++) if (ms <= T[i]) { const f = (ms - T[i - 1]) / (T[i] - T[i - 1]); return [BUS[i - 1][1] + (BUS[i][1] - BUS[i - 1][1]) * f, BUS[i - 1][2] + (BUS[i][2] - BUS[i - 1][2]) * f]; }
    return null;
  };
  const fixAt = (ms) => {
    const b = busPos(ms);
    if (b) return [ms, b[0], b[1], 12];
    if (ms <= ALIGHT + 60000) { const f = (ms - ALIGHT) / 60000; return [ms, BUS[4][1] + (SUB[0][1] - BUS[4][1]) * f, BUS[4][2] + (SUB[0][2] - BUS[4][2]) * f, 15]; }
    if (o.mode === 'none') return null;
    if (o.mode === 'stale') return ms <= REAL_DEP + (o.staleSec != null ? o.staleSec * 1000 : 210000) ? [ms, SUB[0][1] + 0.0001, SUB[0][2] + 0.0001, o.staleAcc] : null;
    if (ms <= REAL_DEP) return o.mode === 'ground' ? (ms <= REAL_DEP - 120000 ? [ms, SUB[0][1], SUB[0][2], 20] : null) : [ms, SUB[0][1], SUB[0][2], 20];
    const T = SUB.map((s) => REAL_DEP + (s[3] - SUB[0][3]) * 60000);
    for (let i = 1; i < SUB.length; i++) if (ms <= T[i]) {
      const f = (ms - T[i - 1]) / (T[i] - T[i - 1]), fx = [ms, SUB[i - 1][1] + (SUB[i][1] - SUB[i - 1][1]) * f, SUB[i - 1][2] + (SUB[i][2] - SUB[i - 1][2]) * f, 20];
      if (o.mode === 'ground') return ((f > 0.8 && (i === 1 || i === 2)) || (f < 0.15 && (i === 2 || i === 3))) ? fx : null;      // 계양·귤현(지상역) 근처에서만 위치가 잡힌다
      return fx;
    }
    return null;
  };
  const boardLive = (q) => {      // 서버 /board-live(시각표) 흉내: fromMs 이후 첫 출발(분:00)
    const m = (q.fromMs - DAY) / 60000, dep = TT_ARA.find((t) => t >= m);
    return dep == null ? null : { ok: true, kind: q.kind, i: q.i, ms: DAY + dep * 60000, src: 'table', at: q.nowMs, fromMs: q.fromMs, allowEarlier: !!q.allowEarlier, maxWait: q.maxWait };
  };
  const PRESS = o.press ? at(6, +o.press.split(':')[0], +o.press.split(':')[1]) : 0;
  let st = mkState(o), bl = null; const seen = {}, changed = [], rows = [], names = st.eta.nodes.map((n) => n.name);
  for (let ms = at(6, 4, 5); ms <= at(6, o.end, 0); ms += 5000) {
    const fx = fixAt(ms), req = { nowMs: ms, fixes: fx ? [fx] : [], state: JSON.parse(JSON.stringify(st)) };
    if (bl) { req.bl = bl; bl = null; }
    if (PRESS && ms === PRESS) { req.act = 'press'; if (o.attachPress) o.attachPress(req, NT); }      // [탑승]: 서버(워커)가 시각표를 읽어 붙이는 것과 같이(rsAttachPressTT)
    const rq = o.rec ? JSON.parse(JSON.stringify(req)) : null;
    const r = rideStandby(req); st = r.state;
    if (o.rec) o.rec(rq, r);
    // 지난 역 = 마커가 이미 떠난 역(번호 < 마커의 역) 또는 뒤에 통과 증거가 있는 역 — 그 역의 화면 시각(HH:MM)이 바뀐 횟수를 센다
    const from = r.pos && r.pos.from != null ? r.pos.from : -1, maxP = Math.max.apply(null, st.eta.passes.map((p) => p.idx));
    if (r.arr) for (let i = 1; i < r.arr.length; i++) {
      if (!(i < maxP || (from >= 0 && i < from))) continue;
      if (seen[i] == null) seen[i] = r.arr[i]; else if (seen[i] !== r.arr[i]) { changed.push(hms(ms) + ' ' + names[i] + ' ' + seen[i] + '→' + r.arr[i]); seen[i] = r.arr[i]; }
    }
    if (r.ask && r.ask.body && r.ask.body.kind === 'sub') bl = boardLive(r.ask.body);
    rows.push({ ms, t: hms(ms), arr: r.arr ? r.arr.slice() : null, etaMs: r.state.etaMs ? r.state.etaMs.slice() : null, from, cur: r.curIdx, xw: !!st.xw, wait: !!st.wait, notes: r.notes || [] });
  }
  return { rows, changed, st, names, ARA, at, hms };
}
// 자바 쌍둥이(RideEtaJ · RideTrackJ) 대조용 낱개 입력 — 엔진 기본값 그대로(opts 없음). ride_local.test.js 가 서버 JS 답과 한 줄씩 견준다.
function unitInputs() {
  const M = (h, m) => h * 60 + m, TT = [M(6, 28), M(6, 38), M(6, 48)];
  const nodes = (tt) => [{ name: '집', isOrigin: true }, { name: '정류장A', isBus: true, lineName: '991', planMin: M(6, 1) }, { name: '정류장M', isBus: true, lineName: '991', planMin: M(6, 6) }, { name: '정류장B', isBus: true, lineName: '991', planMin: M(6, 11) },
    Object.assign({ name: '아라', isSub: true, lineName: '인천1호선', planMin: M(6, 18) }, tt ? { tt } : {}), { name: '계양', isSub: true, lineName: '인천1호선', planMin: M(6, 22) }, { name: '귤현', isSub: true, lineName: '인천1호선', planMin: M(6, 24) }];
  const eta = [], track = [];
  const ride = (lateMin, tt, extra) => Object.assign({ nowMs: at(6, 6, 30) + lateMin * 60000, nodes: nodes(tt), passes: [{ idx: 1, ms: at(6, 1, 25) + lateMin * 60000, src: 'gps' }, { idx: 2, ms: at(6, 6, 25) + lateMin * 60000, src: 'gps' }], boarded: true, tzOffsetMin: 540 }, extra || {});
  for (let d = 0; d <= 12; d += 0.5) { eta.push(ride(d, TT)); eta.push(ride(d, null)); eta.push(ride(d, TT, { prevXfer: { 4: 0 } })); eta.push(ride(d, TT, { prevXfer: { 4: 1 } })); }
  [20, 45, 70].forEach((d) => eta.push(ride(d, TT)));
  eta.push(ride(3, TT, { live: [{ idx: 4, ms: at(6, 18, 0), tt: 1 }] })); eta.push(ride(3, TT, { live: [{ idx: 4, ms: at(6, 28, 0), tt: 1 }] })); eta.push(ride(3, TT, { live: [{ idx: 4, ms: at(6, 19, 30) }] })); eta.push(ride(3, TT, { live: [{ idx: 4, ms: at(6, 28, 0), tt: true }] }));
  for (let d = 0; d <= 12; d += 1) [TT, null].forEach((tt) => eta.push({ nowMs: at(5, 58), nodes: nodes(tt), passes: [], boarded: false, tzOffsetMin: 540, boardNext: { ms: at(6, 1, 25) + d * 60000, src: 'realboard', allowEarlier: true, maxWaitMin: 30 } }));
  eta.push({ nowMs: at(6, 10), nodes: nodes(null).slice(0, 1).concat(nodes(null).slice(4)), passes: [], boarded: false, tzOffsetMin: 540, boardNext: { ms: at(6, 28, 0), src: 'realboard', tt: 1, allowEarlier: true, maxWaitMin: 30 } });
  const ps = (ms3) => [{ idx: 1, ms: at(6, 4, 25), src: 'gps' }, { idx: 2, ms: at(6, 9, 25), src: 'gps' }, { idx: 3, ms: ms3, src: 'gps' }, { idx: 4, ms: at(6, 18, 30), src: 'gps' }];
  const fz = { 1: at(6, 4, 25), 2: at(6, 9, 25), 3: at(6, 14, 0), 4: at(6, 18, 30) };
  [at(6, 14, 0), at(6, 17, 40), at(6, 19, 30)].forEach((ms3) => { eta.push({ nowMs: at(6, 20), nodes: nodes(TT), passes: ps(ms3), boarded: true, tzOffsetMin: 540, frozen: fz }); eta.push({ nowMs: at(6, 20), nodes: nodes(TT), passes: ps(ms3), boarded: true, tzOffsetMin: 540 }); });
  const now = at(6, 23, 0), stops = (ny) => [{ i: 6, lat: 37.594118, lng: 126.71301, arrMs: at(6, 18, 22), pass: true }, Object.assign({ i: 7, lat: 37.571769, lng: 126.736319, arrMs: now + 30000, pass: true }, ny ? { ny: true } : {}), { i: 8, lat: 37.566362, lng: 126.742498, arrMs: now + 150000, pass: true, fin: true }];
  const q = (ny, p) => ({ nowMs: now, trail: [[now - 10000, p[0] + 0.0012, p[1] - 0.0012, 15], [now - 5000, p[0] + 0.0006, p[1] - 0.0006, 15], [now, p[0], p[1], 15]], plan: { pts: [], boarded: true, notDeparted: false, stops: stops(ny), subConfirmed: true, progIsBus: false, suppress: ['standby'] }, want: { zero: true } });
  [[37.583, 126.7247], [37.5722, 126.7359], [37.59, 126.717]].forEach((p) => { track.push(q(false, p)); track.push(q(true, p)); });
  // s457 굳은 좌표: 아라역 근처 같은 좌표가 5초마다 n 번(정확도 acc) — 계양(7번)이 '아직 안 닿음'인가
  const frozenQ = (n, acc, jitter) => { const tr = []; for (let k = n - 1; k >= 0; k--) tr.push([now - k * 5000, 37.5941 + (jitter ? k * 0.00005 : 0), 126.7131, acc]); return { nowMs: now, trail: tr, plan: { pts: [], boarded: true, notDeparted: false, stops: stops(true), subConfirmed: true, progIsBus: false, suppress: ['standby'] }, want: { zero: true } }; };
  [[12, 60, 0], [12, 25, 0], [12, 15, 0], [12, null, 0], [3, 60, 0], [7, 60, 0], [12, 60, 1], [6, 21, 0]].forEach((a) => track.push(frozenQ(a[0], a[1], a[2])));
  return { eta, track, TT, nodes, frozenQ };
}
module.exports = { run, at, hms, ARA, DAY, BUS, SUB, TT_ARA, unitInputs };
