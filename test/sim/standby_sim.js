// 대기 모드 시뮬레이션 — 앱(웹뷰)이 없어도 네이티브(KeepAliveService)가 5초마다 엔진을 불러 안내를 이어가는 상황을 흉내 낸다.
// 실행: node test/sim/standby_sim.js [--out result.json] [--filter 정규식] [--list]
//
// 네이티브 흉내: 틱마다 {nowMs, fixes, state} 를 JSON 으로 직렬화해 엔진(handleRideStandby 와 같은 rideStandby)에 보내고, 돌려받은 state 를 그대로 들고 있다.
// 엔진 계산 결과(overlay.cur·알림·done)만 보고 판정한다 — 앱(JS)은 없다. 앱 코드는 건드리지 않는다.
//
// 변수: 여정(short5 · long25(환승 포함) · bus25(시각표 기준 아님)) × 차량 지연(-90/0/+300초) × 상황
//   clean(8m) · noisy(40m + 3% 250m 튀는 점) · tunnel(중간 6정거장 GPS 없음) · nogps(GPS 한 번도 없음)
//   sparse(GPS 가 60초에 한 번) · doze(절전: 틱이 30~90초 간격으로 늦게 옴, 그동안 GPS 는 쌓임) · kill(중간에 프로세스 종료 → 5분(kill15 는 15분) 뒤 되살아남, 그동안 틱·GPS 없음)
// 측정: ① 현위치 칸 오차(진짜 열차 위치의 정류장과 엔진이 가리킨 칸의 차이, 정류장 수) ② 알림(종류별 한 번씩, 이상적인 시각 대비 지연) ③ 도착 직전 ETA 오차 ④ 도착 후 done 시각
'use strict';
const path = require('path');
const fs = require('fs');
const { rideStandby } = require(path.join(__dirname, '..', '..', 'engine', 'ride-standby.js'));

const args = process.argv.slice(2);
const argv = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const DAY = Date.parse('2026-10-13T00:00:00+09:00');
const LAT = 37.5, LNG0 = 126.9, DL = 0.0137, M_PER_DLNG = 111320 * Math.cos(LAT * Math.PI / 180) / 1;   // 경도 1도 ≈ m
const START_MIN = 12 * 60 + 52, STEP_MIN = 2;

function rng(seed) { let s = 0; for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r()); }

function build(kind, delay) {
  const N = kind === 'short5' ? 5 : 25;
  const plan = [null]; for (let i = 1; i <= N; i++) plan.push(START_MIN + STEP_MIN * (i - 1));
  const bus = kind === 'bus25';
  const nodes = [{ name: '출발', isOrigin: true }];
  for (let i = 1; i <= N; i++) { const n = { name: 'S' + (i - 1), planMin: plan[i] }; if (bus) { n.isBus = true; n.lineName = '931'; } else { n.isSub = true; n.lineName = '1호선'; } nodes.push(n); }
  const stops = [];
  for (let i = 1; i <= N; i++) { const s = { i: i, lat: LAT, lng: LNG0 + DL * (i - 1), arrMs: DAY + plan[i] * 60000, pass: i > 1, fin: i === N }; if (bus) s.bus = true; stops.push(s); }
  const seq = []; for (let i = 1; i <= N; i++) seq.push(i);
  const targets = [{ seqPos: N - 1, nodeIdx: N, name: 'S' + (N - 1), kind: 'dest' }];
  if (kind === 'long25') targets.unshift({ seqPos: 11, nodeIdx: 12, name: 'S11', kind: 'transfer', nextLine: '2호선' });
  const cells = [], map = [];
  for (let i = 1; i <= N; i++) { cells.push({ n: 'S' + (i - 1), t: '--:--', g: i === 1 ? '1호선' : '', gp: false, gc: '#336699', lc: i > 1 ? '#336699' : '', rc: i < N ? '#336699' : '', dc: '#336699', dk: i === 1 || i === N ? 2 : 1, m: 'S' + (i - 1) + '(이동중)' }); map.push(i); }
  const eta = { nodes: nodes, passes: [{ idx: 1, ms: DAY + plan[1] * 60000 + (delay || 0) * 1000, src: 'gps' }], boarded: true, notDeparted: false, tzOffsetMin: 540 };
  if (!bus) eta.timetableFirst = true;
  const st = { v: 1, tripSig: 'SIM', eta: eta, stops: stops, trail: [], cfg: { targets: targets, seq: seq, allowed: {}, destName: 'S' + (N - 1) }, fired: {}, ovl: { cells: cells, map: map, base: 0, theme: { bg: '#fff', fg: '#111', sub: '#888' } } };
  return { N: N, plan: plan, st: st, targets: targets };
}

// 진짜 열차 위치(정류장 단위 소수): delaySec 만큼 늦게 계획대로 달린다
function trainPos(ms, delaySec, N, plan) {
  const m = (ms - delaySec * 1000 - DAY) / 60000;
  if (m <= plan[1]) return 1;
  for (let i = 1; i < N; i++) if (m <= plan[i + 1]) return i + (m - plan[i]) / (plan[i + 1] - plan[i]);
  return N;
}
function timeAtPos(pos, delaySec, plan) { return DAY + (plan[1] + (pos - 1) * STEP_MIN) * 60000 + delaySec * 1000; }

function run(sc) {
  const b = build(sc.kind, sc.delay), N = b.N, r = rng(sc.id), delay = sc.delay;
  let st = b.st;
  const t0 = timeAtPos(1, delay, b.plan) + 5000;   // 탑승 직후(영점 1번)
  const arriveMs = timeAtPos(N, delay, b.plan);
  const tEnd = arriveMs + ((sc.cond === 'leaveWalk' || sc.cond === 'leaveTaxi') ? 25 : 6) * 60000;
  const tunnelFrom = 6, tunnelTo = 12;
  const leaveStop = Math.max(3, Math.round(N / 2)), leaveMs = timeAtPos(leaveStop, delay, b.plan), leaveV = sc.cond === 'leaveTaxi' ? 12 : 1.4, leaving = sc.cond === 'leaveWalk' || sc.cond === 'leaveTaxi';   // 열차가 정류장 6~12 사이일 때 GPS 없음
  const killAt = timeAtPos(N > 6 ? Math.round(N / 2) : 3, delay, b.plan) + 20000, killGap = (sc.cond === 'kill15' ? 15 : 5) * 60000;
  const res = { expectFail: sc.kind === 'short5' && sc.cond === 'leaveWalk', id: sc.id, kind: sc.kind, delay: delay, cond: sc.cond, ticks: 0, errs: [], alerts: [], doneMs: null, etaErrAtMinus2: null, maxErr: 0, errTicks2: 0, notes: [], lastLv: 0, ovMiss: 0, bytes: 0 };
  let ms = t0, lastFixMs = 0, lastDeliveredMs = t0, resumeMs = 0;
  const alertsSeen = [];
  while (ms <= tEnd) {
    // 이번 틱에 네이티브가 모은 GPS
    let fixes = [];
    const pos = trainPos(ms, delay, N, b.plan);
    // 네이티브는 LocationManager 로 위치를 계속 모아 두었다가 틱마다 한꺼번에 보낸다(마지막 틱 이후 5초 간격 점들). sparse 는 GPS 자체가 60초에 한 번.
    const gapMs = sc.cond === 'sparse' ? 60000 : 5000;
    for (let fm = Math.max(lastFixMs + gapMs, t0); fm <= ms; fm += gapMs) {
      const fp = trainPos(fm, delay, N, b.plan);
      const dead = sc.cond === 'nogps' || (sc.cond === 'tunnel' && fp >= tunnelFrom && fp <= tunnelTo) || (res.killFromMs && fm > res.killFromMs && fm < res.killToMs);
      lastFixMs = fm;
      if (dead) continue;
      const sd = sc.cond === 'noisy' ? 40 : 8, acc = sc.cond === 'noisy' ? 35 : 15;
      let dLat = gauss(r) * sd / 111320, dLng = gauss(r) * sd / M_PER_DLNG;
      if (sc.cond === 'noisy' && r() < 0.03) { dLat += (r() - 0.5) * 2 * 250 / 111320; dLng += (r() - 0.5) * 2 * 250 / M_PER_DLNG; }
      if (fm - lastDeliveredMs > 60000) resumeMs = fm;   // 60초 넘게 끊겼다 돌아온 순간
      lastDeliveredMs = fm;
      let baseLat = LAT, baseLng = LNG0 + DL * (fp - 1);
      if (leaving && fm >= leaveMs) { baseLng = LNG0 + DL * (leaveStop - 1); baseLat = LAT + leaveV * (fm - leaveMs) / 1000 / 111320; }   // 정류장에서 내려 북쪽으로 걷거나(1.4m/s) 택시(12m/s)
      fixes.push([fm, baseLat + dLat, baseLng + dLng, acc]);
    }
    // 틱 간격(네이티브 5초 · 절전이면 30~90초 · 프로세스 종료면 5분 틱 없음)
    const body = JSON.stringify({ nowMs: ms, fixes: fixes, state: st });
    res.bytes = Math.max(res.bytes, body.length);
    let out;
    try { out = rideStandby(JSON.parse(body)); } catch (e) { res.notes.push('예외 ' + e.message); break; }
    res.ticks++;
    if (out.error) { res.notes.push('엔진 오류 ' + out.error); break; }
    st = out.state;
    if (!out.overlay) res.ovMiss++;
    const truthCell = Math.max(0, Math.min(N - 1, Math.floor(pos + 1e-9) - 1));
    const blackout = ms - lastDeliveredMs > 60000 || ms - resumeMs < 90000;   // GPS 가 없던 동안과 돌아온 뒤 90초는 오차를 재지 않는다(알 수 없는 구간 — 돌아온 뒤 얼마나 빨리 맞추는지가 아래 '재동기 지연')
    if (out.overlay && out.overlay.active && ms > t0 + 60000 && !blackout && !(leaving && ms >= leaveMs)) {
      const e = Math.abs(out.overlay.cur - truthCell);
      res.errs.push(e); if (e > res.maxErr) res.maxErr = e; if (e >= 2) res.errTicks2++;
    }
    if (out.alert) { res.alerts.push({ type: out.alert.type, ms: ms }); }
    if (res.etaErrAtMinus2 == null && ms >= arriveMs - 120000 && out.state.etaMs) res.etaErrAtMinus2 = Math.round((out.state.etaMs[N] - arriveMs) / 1000);
    if (out.done) { res.doneMs = ms; break; }
    let step = 5000;
    if (sc.cond === 'doze') step = 30000 + Math.floor(r() * 60000);
    if ((sc.cond === 'kill' || sc.cond === 'kill15') && ms < killAt && ms + step >= killAt) { step = killGap; res.notes.push('프로세스 종료 ' + Math.round(killGap / 60000) + '분'); res.killFromMs = ms; res.killToMs = ms + step; }
    ms += step;
  }
  // 알림 판정: 이상적인 시각 = 열차가 그 정거장 전 정류장을 지나는 순간
  const ideal = { near_arrive2: timeAtPos(N - 2, delay, b.plan), near_arrive: timeAtPos(N - 1, delay, b.plan), arrive: arriveMs };
  if (b.targets.length > 1) ideal.transfer1 = timeAtPos(11, delay, b.plan);
  res.idealMs = ideal;
  res.check = {};
  const count = {}; res.alerts.forEach(a => { count[a.type] = (count[a.type] || 0) + 1; });
  res.count = count;
  if (leaving) {
    const off = res.alerts.filter(a => a.type === 'offroute');
    const probsL = [];
    if (off.length !== 1) probsL.push('이탈 알림 ' + off.length + '번');
    else {
      const need = (b.kind === 'bus25' ? 350 : 600) / leaveV + 150;   // 벗어난 거리 + 판정 창(2분)·틱
      const dl = Math.round((off[0].ms - leaveMs) / 1000); res.check.offroute = dl;
      if (dl > need + 60) probsL.push('이탈 알림 ' + dl + '초 늦음(기대 ' + Math.round(need) + '초 안)');
      if (dl < 30) probsL.push('이탈 알림 너무 이름 ' + dl + '초');
      const after = res.alerts.filter(a => a.ms > off[0].ms && /near_arrive|arrive/.test(a.type));
      if (after.length) probsL.push('이탈 뒤 하차 알림 ' + after.length + '번');
      if (res.doneMs == null) probsL.push('done 없음');
    }
    res.probsLeave = probsL;
  }
  const typeIdeal = leaving ? [] : ['near_arrive2', 'near_arrive', 'arrive'];
  const probs = [];
  typeIdeal.forEach(t => {
    const got = res.alerts.filter(a => a.type === t);
    const inGap = res.killFromMs && ideal[t] > res.killFromMs && ideal[t] < res.killToMs;
    if (got.length === 0) { if (inGap && t !== 'arrive') { res.notes.push(t + ' 종료 구간에 지나가 생략(낡은 알림은 안 울림)'); return; } probs.push(t + ' 없음'); return; }
    if (got.length > 1) probs.push(t + ' ' + got.length + '번');
    // 프로세스 종료·절전 구간에 이상적인 시각이 끼면 그 구간 끝을 기준으로 삼는다
    let base = ideal[t];
    if (res.killFromMs && base > res.killFromMs && base < res.killToMs) base = res.killToMs;
    const dl = Math.round((got[0].ms - base) / 1000); res.check[t] = dl;
    const tolEarly = -45, tolLate = sc.cond === 'doze' ? 100 : 75;
    if (dl < tolEarly) probs.push(t + ' ' + (-dl) + '초 빠름'); if (dl > tolLate) probs.push(t + ' ' + dl + '초 늦음');
  });
  const tr = res.alerts.filter(a => a.type && /transfer|환승/.test(a.type));
  if (!leaving && b.targets.length > 1 && tr.length === 0) probs.push('환승 알림 없음');
  if (leaving) { (res.probsLeave || []).forEach(x => probs.push(x)); }
  else if (res.doneMs == null) probs.push('done 없음'); else { const aa = res.alerts.filter(a => a.type === 'arrive')[0]; const dd = aa ? res.doneMs - aa.ms : null; if (dd == null || dd < 175000 || dd > 180000 + 100000) probs.push('도착 알림 뒤 done 간격 이상 ' + (dd == null ? '(도착 알림 없음)' : Math.round(dd / 1000) + '초')); }
  if (res.maxErr >= 3) probs.push('현위치 칸 오차 최대 ' + res.maxErr);
  if (res.ovMiss) probs.push('overlay 없음 ' + res.ovMiss + '틱');
  res.errAvg = res.errs.length ? +(res.errs.reduce((a, c) => a + c, 0) / res.errs.length).toFixed(2) : null;
  res.problems = probs;
  res.pass = probs.length === 0;
  if (res.expectFail) { res.limit = probs.slice(); res.problems = []; res.pass = true; }
  return res;
}

const scs = [];
['short5', 'long25', 'bus25'].forEach(kind => [-90, 0, 300].forEach(delay => ['clean', 'noisy', 'sparse', 'tunnel', 'nogps', 'doze', 'kill', 'kill15', 'leaveWalk', 'leaveTaxi'].forEach(cond => {
  if ((cond === 'tunnel' || cond === 'kill15') && kind === 'short5') return;   // 짧은 여정엔 터널·15분 종료가 없다   // 짧은 여정엔 터널 구간이 없다
  scs.push({ id: kind + '/d' + delay + '/' + cond, kind: kind, delay: delay, cond: cond });
})));

if (args.includes('--list')) { scs.forEach(s => console.log(s.id)); process.exit(0); }
const flt = argv('--filter') ? new RegExp(argv('--filter')) : null;
const out = [];
for (const sc of scs) { if (flt && !flt.test(sc.id)) continue; out.push(run(sc)); }
if (argv('--out')) fs.writeFileSync(argv('--out'), JSON.stringify(out, null, 1));
const fmt = (x) => x == null ? '-' : x;
console.log('| 시나리오 | 틱 | 현위치 칸 오차(평균/최대) | 알림 지연(2전/1전/도착, 초) | 도착 2분 전 ETA 오차(초) | done(도착+초) | 결과 |');
console.log('|---|---|---|---|---|---|---|');
out.forEach(r => console.log('| ' + r.id + ' | ' + r.ticks + ' | ' + fmt(r.errAvg) + '/' + r.maxErr + ' | ' + ['near_arrive2', 'near_arrive', 'arrive'].map(t => fmt(r.check[t])).join(' / ') + ' | ' + fmt(r.etaErrAtMinus2) + ' | ' + (r.doneMs ? Math.round((r.doneMs - r.idealMs.arrive) / 1000) : '-') + ' | ' + (r.limit ? '한계(예상): 짧은 여정(8분)에서 내려 걸으면 걸어서 경로선 600m 밖으로 나가기 전에 열차가 도착해 도착 알림이 먼저 나간다' : (r.pass ? 'OK' : '**' + r.problems.join('; ') + '**')) + ' |'));
const bad = out.filter(r => !r.pass);
console.log('\n총 ' + out.length + '건, 통과 ' + (out.length - bad.length) + ', 문제 ' + bad.length + ', 요청 최대 크기 ' + Math.max.apply(null, out.map(r => r.bytes)) + '바이트');
process.exit(bad.length ? 1 : 0);
