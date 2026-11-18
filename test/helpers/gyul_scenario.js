// s460 시나리오(YJ 2026-11-17 실기기: "귤현에 도착했는데 계양 도착이라 뜨고 알람이 잘못 왔어 — 이 앱의 가장 중요한 건 정확도"): 인천1호선 계산→임학→박촌→귤현→계양→아라, 18:18 탑승, 박촌 뒤부터 열차가 delaySec 늦다.
//   run(rideStandby, { mode, delaySec, delayFrom, end, rec }) → { steps:[{ms,t,from,to,ratio,alert,arr,etaMs}], alerts:[{ms,t,key,title}], real:[실제 도착 ms…], names }
//   mode : 'none' 위치 없음(시각표만) · 'ground' 박촌~귤현 끝·귤현~계양·계양~아라 앞부분(지상)에서만 위치 · 'live' 열차를 따라 정확한 위치
//   실제 열차는 시각표(귤현 18:23 · 계양 18:24 · 아라 18:28)보다 delayFrom 번째 역부터 delaySec 늦게 닿는다. rec(req, out): 걸음마다 부른다(자바 대조용 녹화)
'use strict';
const DAY = Date.parse('2026-11-16T00:00:00+09:00');
const at = (h, m, s) => DAY + ((h * 60 + m) * 60 + (s || 0)) * 1000;
const hms = (ms) => { const d = new Date(ms + 9 * 3600000); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ':' + String(d.getUTCSeconds()).padStart(2, '0'); };
const SUB = [['계산', 37.54324, 126.72844, 18], ['임학', 37.54506, 126.73864, 19], ['박촌', 37.553525, 126.744946, 21], ['귤현', 37.566362, 126.742498, 23], ['계양', 37.571769, 126.736319, 24], ['아라', 37.594118, 126.71301, 28]];
const NAMES = ['', ...SUB.map((s) => s[0])];
function mkState() {
  const nd = [{ name: '집', isOrigin: true }], stops = [];
  SUB.forEach((s) => nd.push({ name: s[0], isSub: true, lineName: '인천1호선', planMin: 18 * 60 + s[3] }));
  SUB.forEach((p, k) => stops.push({ i: k + 1, lat: p[1], lng: p[2], arrMs: DAY + (18 * 60 + p[3]) * 60000, pass: k > 0, fin: k === SUB.length - 1 }));
  const dest = SUB.length;
  return { v: 1, tripSig: 'gyul', eta: { nodes: nd, passes: [{ idx: 1, ms: at(18, 18, 0), src: 'gps' }], boarded: true, notDeparted: false, tzOffsetMin: 540 }, stops, trail: [],
    cfg: { targets: [{ seqPos: dest - 1, nodeIdx: dest, name: '아라', kind: 'dest' }], seq: SUB.map((_, k) => k + 1), allowed: {}, destName: '아라' }, fired: {}, notYet: {}, etaMs: stops.map((s) => s.arrMs), steps: 0, startedAt: at(18, 18, 0) };
}
function run(rideStandby, o) {
  o = Object.assign({ mode: 'none', delaySec: 120, delayFrom: 3, end: 31, rec: null }, o || {});
  const T = SUB.map((s, i) => at(18, s[3], 0) + (i >= o.delayFrom ? o.delaySec * 1000 : 0));
  const fixAt = (ms) => {
    if (o.mode === 'none' || ms < T[0]) return null;
    for (let i = 1; i < SUB.length; i++) if (ms <= T[i]) {
      const f = (ms - T[i - 1]) / (T[i] - T[i - 1]), fx = [ms, SUB[i - 1][1] + (SUB[i][1] - SUB[i - 1][1]) * f, SUB[i - 1][2] + (SUB[i][2] - SUB[i - 1][2]) * f, 20];
      if (o.mode === 'ground') return ((i === 3 && f > 0.55) || (i === 4 && (f < 0.5 || f > 0.8)) || (i === 5 && f < 0.3)) ? fx : null;
      return fx;
    }
    return null;
  };
  let st = mkState(); const steps = [], alerts = [];
  for (let ms = at(18, 19, 0); ms <= at(18, o.end, 0); ms += 5000) {
    const fx = fixAt(ms), req = { nowMs: ms, fixes: fx ? [fx] : [], state: JSON.parse(JSON.stringify(st)) };
    const rq = o.rec ? JSON.parse(JSON.stringify(req)) : null;
    const r = rideStandby(req); st = r.state; if (o.rec) o.rec(rq, r);
    const p = r.pos || {};
    steps.push({ ms, t: hms(ms), from: p.from, to: p.to, ratio: p.ratio, alert: r.alert ? r.alert.title : '', arr: r.arr ? r.arr.slice() : null, etaMs: st.etaMs ? st.etaMs.slice() : null });
    if (r.alert) alerts.push({ ms, t: hms(ms), key: r.alert.key, title: r.alert.title });
  }
  return { steps, alerts, real: T, names: NAMES, st };
}
module.exports = { run, SUB, NAMES, DAY, at, hms, mkState };
