// 거친 시뮬(자동 판정 없음, 결과를 눈으로 본다): GPS 잡음·정차·서행·신호끊김 — 버스 따라가기·확정 지연·걷기 오탐 측정
// 실행: node test/sim_bus_noise.js [시나리오 번호 0~8]   (한 줄에 시나리오 하나, JSON)
const H = require('./helpers/ride_harness'); const BF = require('./helpers/bus_fixture');
let seed = 1; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const s0 = BF.stop(0);
const mLat = (m) => m * H.DEG_PER_M_LAT, mLng = (m) => m * H.DEG_PER_M_LNG;
function noisy(lat, lng, sig) { let s = sig; if (rnd() < 0.05) s = sig * 5; return [lat + mLat(gauss() * s), lng + mLng(gauss() * s)]; }
// 버스 x 위치(동쪽 m) 시간표: 정류장 간 400m, 순항속도 v, 정차 dwell 초
function busProfile(v, dwell, nStops) {
  const pts = []; let x = 0, t = 0; const dt = 5;
  for (let k = 0; k < nStops; k++) {
    for (let d = 0; d < dwell; d += dt) { pts.push({ x, sp: 0 }); }
    let run = 0; const L = 400;
    while (run < L) { const rem = L - run; const sp = Math.min(v, 1 + 0.9 * t_acc(run), Math.sqrt(2 * 1.2 * rem) + 0.5); const st = Math.max(0.5, sp); run += st * dt; x += st * dt; pts.push({ x: Math.min(x, (k + 1) * 400), sp: st }); }
    x = (k + 1) * 400;
  }
  return pts;
}
function t_acc(run) { return Math.sqrt(2 * run / 1.2); }
async function scenario(b, name, o) {
  seed = o.seed || 1;
  const app = await H.newApp(b, () => BF.resp('88', 480)); await app.search(); if (o.confirm !== false) await app.confirm();
  app.acc = o.acc || 10;
  // 정류장 도착 후 서 있기(잡음 포함)
  const base = { lat: s0.y, lng: s0.x - 0.0001 };
  await app.moveAlong([base], 1.3, 5);
  const feedN = async (lat, lng, sp, secs) => { const [a, c] = noisy(lat, lng, o.sig); if (o.drop && rnd() < o.drop) { await app.page.clock.runFor(secs * 1000); return; } await app.feed(a, c, sp, secs); };
  for (let k = 0; k < Math.ceil((o.wait || 60) / 5); k++) await feedN(base.lat, base.lng, 0.1, 5);
  const pre = await app.state();
  const log = { name, preLocked: pre.locked, preBoarded: pre.boarded, preGm: pre.gm };
  let lockAt = null, gms = [], maxJump = 0, last = pre.gm;
  if (o.mode === 'ride') {
    const prof = busProfile(o.v, o.dwell, o.n || 5); let i = 0;
    for (const p of prof) {
      await feedN(s0.y, s0.x + mLng(p.x), p.sp, 5); i++;
      const s = await app.state(); gms.push(s.gm);
      if (lockAt == null && s.locked) lockAt = i * 5;
      if (s.gm - last > maxJump) maxJump = s.gm - last; last = s.gm;
    }
    const fin = await app.state(); log.finalGm = fin.gm; log.finalLocked = fin.locked; log.boarded = fin.boarded; log.lockAfterSec = lockAt; log.maxJump = maxJump; log.rideSecs = prof.length * 5; log.stops = Math.round(prof[prof.length - 1].x / 400);
    log.monotone = gms.every((v, k) => k === 0 || v >= gms[k - 1]);
    log.backs = gms.reduce((n, v, k) => n + (k && v < gms[k - 1] ? 1 : 0), 0);
  } else if (o.mode === 'walk') {   // 걸어서 3정류장 거리
    const n = Math.round(1200 / 1.4 / 5); for (let i = 0; i < n; i++) { await feedN(s0.y, s0.x + mLng(i * 1.4 * 5), 1.4, 5); const s = await app.state(); if (s.gm > last) { maxJump = Math.max(maxJump, s.gm - last); last = s.gm; } }
    const fin = await app.state(); log.finalGm = fin.gm; log.finalLocked = fin.locked; log.boarded = fin.boarded; log.gmMoved = fin.gm - pre.gm;
  } else if (o.mode === 'stand') {  // 서서 10분 더(잡음)
    for (let i = 0; i < 120; i++) await feedN(base.lat, base.lng, 0.1, 5);
    const fin = await app.state(); log.finalGm = fin.gm; log.finalLocked = fin.locked; log.boarded = fin.boarded; log.errs = [...new Set(app.errs)].length;
  }
  log.errs = [...new Set(app.errs)].length;
  await app.ctx.close(); return log;
}
(async () => {
  const b = await H.launch(); const which = process.argv[2] || 'all'; const out = [];
  const S = [
    ['A 보통버스 9m/s 정차20s 잡음12m', { mode: 'ride', v: 9, dwell: 20, sig: 12, n: 5 }],
    ['B 막히는 4m/s 정차30s 잡음15m', { mode: 'ride', v: 4, dwell: 30, sig: 15, acc: 25, n: 4 }],
    ['C 매우 막힘 2.5m/s 정차40s 잡음15m', { mode: 'ride', v: 2.5, dwell: 40, sig: 15, acc: 25, n: 3 }],
    ['D 신호 30% 끊김 9m/s 잡음20m', { mode: 'ride', v: 9, dwell: 20, sig: 20, acc: 30, drop: 0.3, n: 5 }],
    ['E 확정 안 누름, 보통버스', { mode: 'ride', v: 9, dwell: 20, sig: 12, n: 5, confirm: false }],
    ['F 정류장에 서서 10분(잡음20m)', { mode: 'stand', sig: 20, acc: 30 }],
    ['G 걸어서 3정류장(잡음12m)', { mode: 'walk', sig: 12 }],['G2 걸어서(잡음20m)', { mode: 'walk', sig: 20, acc: 30 }],
    ['H 걸어서 3정류장(잡음12m), 확정 안 누름', { mode: 'walk', sig: 12, confirm: false }],
  ];
  for (let i = 0; i < S.length; i++) { if (which !== 'all' && which !== String(i)) continue; for (const sd of (S[i][1].mode === 'ride' ? [1, 2] : [1, 2, 3, 4])) { const r = await scenario(b, S[i][0] + ' seed' + sd, Object.assign({ seed: sd }, S[i][1])); console.log(JSON.stringify(r)); } }
  await b.close();
})();
