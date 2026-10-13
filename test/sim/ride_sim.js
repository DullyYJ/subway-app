// 탑승 시뮬레이션 — 2026-10-12
//   '실제로 탄 것처럼' GPS 를 흘려 보내 앱이 (1) 계획대로 갈 때 얌전한지, (2) 시각표와 다르게 움직일 때,
//   (3) 엔진이 안내한 차와 다른 차를 탔을 때 경로를 유추해 다시 찾는지, (4) 마커(앱)·오버레이가 따라가는지 잰다.
//   앱 코드는 건드리지 않는다. 엔진(route-v2)은 world.js 의 모의 엔진, 열차·버스 위치 API 는 없는 상태(GPS 만).
// 실행: node test/sim/ride_sim.js [--filter 정규식] [--out 파일.json] [--shard i/n] [--list]
const fs = require('fs'), path = require('path');
const H = require('../helpers/ride_harness');
const W = require('./world');

// ── 난수(시드 고정) ────────────────────────────────────────
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

const dbg = (m) => { if (process.env.SIM_DEBUG) console.error('[dbg ' + new Date().toISOString().slice(17, 23) + '] ' + m); };
const NOISE = {
  clean: { sigma: 8, outlier: 0, acc: 10 },
  noisy: { sigma: 40, outlier: 0.03, acc: 50 },       // 40m 흔들림 + 3% 는 250m 튄 점
};

// ── 진행 도구: 사용자의 '진짜' 위치를 움직이며 앱에 GPS 를 흘린다 ──────────────
async function makeRunner(app, lay, o) {
  const R = { app, lay, pos: { x: 0, y: 0 }, simT: 0, passed: null, onVeh: false, devAt: null, ticks: 0, samples: [], events: [], errs: [], note: [] };
  const rnd = rng(hash(o.id));
  const noise = NOISE[o.noise || 'clean'];
  const baseMs = parseFloat(app.stat.routeQs[0].baseMs);
  R.baseMs = baseMs;
  const nowSim = async () => ((await app.page.evaluate(() => Date.now())) - baseMs) / 1000;
  R.simT = await nowSim();
  // 계획 경로선(편차 계산용): 출발 → 모든 정류장 → 도착
  const plan = [{ x: 0, y: 0 }]; lay.rides.forEach(l => l.stops.forEach(p => plan.push(p))); plan.push(W.D);
  const segDist = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy; let t = L2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)); };
  const offPlan = (p) => { let m = Infinity; for (let i = 0; i < plan.length - 1; i++) m = Math.min(m, segDist(p, plan[i], plan[i + 1])); return m; };
  R.offPlan = offPlan;
  const baseBursts = () => burstsOf(app.stat.routeQs);
  R.bursts0 = baseBursts().length;

  // 표본: 앱 상태 + 정답과의 차이
  R.sample = async () => {
    const s = await app.page.evaluate(() => {
      const nd = (typeof _transitNodeData !== 'undefined' && _transitNodeData) ? _transitNodeData : [];
      const ov = window.__ovl.length ? window.__ovl[window.__ovl.length - 1] : null;
      let cn = null; if (ov && ov.cells && ov.cells[ov.cur]) cn = ov.cells[ov.cur].n;
      return { tm: window._timeMaxIdx, pfo: (function(){ try { const o = window._pfPosOverride(); return o ? [o.fromIdx, o.toIdx, +(o.ratio||0).toFixed(2)] : null; } catch (e) { return -1; } })(), tl: (function(){ try { const o = window._estimateTimelinePos(); return o ? [o.fromIdx, o.toIdx, +(o.ratio||0).toFixed(2)] : null; } catch (e) { return -1; } })(), gm: window._gpsMaxIdx, gc: window._gpsConfirmIdx, boarded: window._htlBoarded === true, locked: window._routeLocked === true, mp: window._markerPos || null,
        nodes: nd.map(n => [n.name, n.lat, n.lng, n.isWalk ? 1 : 0]), ovl: ov && { active: ov.active, cur: ov.cur, curName: cn, alert: ov.alert, l1: ov.l1 || ov.line1 || '' }, ovN: window.__ovl.length, now: Date.now(),
        src: window._lastRouteSrc || null,
        pip: [(function(){ try { return _pipHasRoute() ? 1 : 0; } catch (e) { return -1; } })(), (function(){ try { return _ovlUsable() ? 1 : 0; } catch (e) { return -1; } })(), window._pipTrip ? 1 : 0, window._routeLocked ? 1 : 0, (typeof LOCFSM !== 'undefined' ? LOCFSM.state : '-')] };
    });
    const names = s.nodes.map(n => n[0]);
    const truthIdx = R.passed ? names.indexOf(R.passed) : -1;
    // 마커 위치(미터) = 앱이 그린 두 노드 사이 보간
    let markerM = null, mk = null;
    if (s.mp && s.now - s.mp.ts <= 20000) {
      const a = s.nodes[s.mp.from], b = s.nodes[s.mp.to];
      if (a && a[1] != null) { const q = (b && b[1] != null) ? { lat: a[1] + (b[1] - a[1]) * (s.mp.ratio || 0), lng: a[2] + (b[2] - a[2]) * (s.mp.ratio || 0) } : { lat: a[1], lng: a[2] }; mk = W.fromLL(q.lat, q.lng); markerM = W.dist(mk, R.pos); }
    }
    let ovlM = null;
    if (s.ovl && s.ovl.active && s.ovl.curName) { const i = names.indexOf(s.ovl.curName); if (i >= 0 && s.nodes[i][1] != null) ovlM = W.dist(W.fromLL(s.nodes[i][1], s.nodes[i][2]), R.pos); }
    const smp = { t: Math.round(R.simT), gm: s.gm, truthIdx, boarded: s.boarded, locked: s.locked, markerM: markerM == null ? null : Math.round(markerM), ovlM: ovlM == null ? null : Math.round(ovlM),
      ovlOn: !!(s.ovl && s.ovl.active), ovlCur: s.ovl ? s.ovl.curName : null, off: Math.round(offPlan(R.pos)), nNodes: s.nodes.length, bursts: baseBursts().length - R.bursts0, onVeh: R.onVeh, tm: s.tm, pfo: s.pfo, tl: s.tl, src: s.src, pip: s.pip, mp: s.mp ? [s.mp.from, s.mp.to, +(s.mp.ratio || 0).toFixed(2), s.mp.gps ? 1 : 0] : null };
    R.samples.push(smp);
    // 재탐색 이벤트: 새 요청 묶음이 생겼는가
    const bs = baseBursts();
    if (bs.length - R.bursts0 > R.events.filter(e => e.kind === 'reroute').length) {
      const b = bs[bs.length - 1], me = W.fromLL(parseFloat(b.SY), parseFloat(b.SX));
      R.events.push({ kind: 'reroute', t: R.simT, errM: Math.round(W.dist(me, R.pos)), sameDest: b.EX === app.stat.routeQs[0].EX && b.EY === app.stat.routeQs[0].EY, off: Math.round(offPlan(R.pos)), nodesAfter: s.nodes.length });
    }
    return smp;
  };

  // 한 칸(dt초) 진행: 사용자 위치를 pos 로 두고 GPS 를 보낸다. ug 면 지하 — GPS 없음.
  R.tick = async (dt, speed, ug) => {
    R.simT += dt; R.ticks++;
    if (R.devAt == null && R.expectDev && offPlan(R.pos) > 350) R.devAt = R.simT;
    if (ug) {
      await app.page.clock.runFor(dt * 1000);
    } else {
      let nx = 0, ny = 0, acc = noise.acc;
      if (noise.sigma) { nx = gauss(rnd) * noise.sigma; ny = gauss(rnd) * noise.sigma; }
      if (noise.outlier && rnd() < noise.outlier) { const a = rnd() * 2 * Math.PI; nx += Math.cos(a) * 250; ny += Math.sin(a) * 250; acc = 120; }
      const ll = W.xy(R.pos.x + nx, R.pos.y + ny);
      app.acc = acc;
      await app.feed(ll.y, ll.x, speed, dt);
      // fsm:'wired' — 앱의 위치 상태 머신(locOnGps)에 백그라운드 GPS 를 넣어 주는 가정(현재 앱은 승차 대기 틱에서만 넣는다). 앱 코드는 그대로, 시험에서 앱 함수를 호출만 한다.
      if (o.fsm === 'wired') await app.page.evaluate(([la, ln, ac, sp]) => { try { window.locOnGps(la, ln, ac, sp); window.locTick(); } catch (e) {} }, [ll.y, ll.x, acc, speed]);
    }
    if (R.ticks % 3 === 0) await R.sample();
  };
  R.moveTo = async (p, mps, o2) => {
    o2 = o2 || {}; const dt = o2.dt || 10; let guard = 0;
    while (guard++ < 4000) {
      const d = W.dist(R.pos, p); if (d < 1) break;
      const step = Math.min(d, mps * dt), f = step / d;
      R.pos = { x: R.pos.x + (p.x - R.pos.x) * f, y: R.pos.y + (p.y - R.pos.y) * f };
      await R.tick(step / mps, mps, o2.ug);
      if (R.simT > R.maxSim) return;
    }
  };
  R.wait = async (sec, o2) => { o2 = o2 || {}; let left = sec; while (left > 0 && R.simT <= R.maxSim) { const dt = Math.min(o2.dt || 10, left); await R.tick(dt, 0.1, o2.ug); left -= dt; } };
  R.waitUntil = async (t, o2) => { while (R.simT < t && R.simT <= R.maxSim) await R.tick(Math.min(10, t - R.simT), 0.1, o2 && o2.ug); };
  // 정류장 열을 따라 달린다(정차 포함). stops: [{name,x,y}], gap: 정류장 간 계획 시간(초), dwell: 정차 초
  R.ride = async (stops, gap, dwell, o2) => {
    o2 = o2 || {};
    R.onVeh = true;
    for (let k = 0; k < stops.length; k++) {
      if (k > 0) { const d = W.dist(stops[k - 1], stops[k]), mps = d / Math.max(10, gap - dwell); await R.moveTo(stops[k], mps, { ug: o2.ug, dt: 10 }); }
      R.passed = stops[k].name; if (o2.truthName) R.passed = o2.truthName(stops[k], k);
      if (k < stops.length - 1 || o2.dwellLast) await R.wait(dwell, { dt: 10, ug: o2.ug });
      if (R.simT > R.maxSim) break;
    }
    R.onVeh = false;
  };
  R.ug = (leg) => !!(leg.ug && o.underground !== false);
  R.maxSim = o.maxSim || 3600;
  return R;
}

// 요청 묶음: 같은 (SX,SY) 로 연달아 온 요청은 한 번의 탐색
function burstsOf(qs) {
  const out = []; (qs || []).forEach(q => { const last = out[out.length - 1]; if (last && last.SX === q.SX && last.SY === q.SY) return; out.push(q); }); return out;
}

// ── 행동 정의 ────────────────────────────────────────────────
const dwellOf = (leg) => leg.kind === 'sub' ? 28 : 12;
async function rideLeg(R, leg, offsetSec, upto) {
  const stops = upto == null ? leg.stops : leg.stops.slice(0, upto + 1);
  await R.walkBoard(leg, offsetSec);
  await R.ride(stops, leg.gapSec, dwellOf(leg), { ug: R.ug(leg) });
}
function attachCommon(R, lay) {
  // 승차 지점으로 걸어가 출발(예정+offset)까지 서서 기다린다
  R.walkBoard = async (leg, offsetSec) => {
    const first = leg.stops[0];
    await R.moveTo({ x: first.x - 4, y: first.y }, 1.3, { dt: 5 });
    await R.waitUntil(leg.s0 + (offsetSec || 0) - 8, {});
    await R.moveTo({ x: first.x, y: first.y }, 1.3, { dt: 2 });
    R.passed = null;
  };
}
const BEH = {
  // 정상 탑승(offset: 차량이 시각표보다 늦/빠른 초)
  faithful: async (R, lay, p) => {
    for (const l of lay.legs) { if (l.kind === 'walk') await R.moveTo(l.to, 1.3, { dt: 5 }); else await rideLeg(R, l, p.offset || 0); }
    await R.wait(60);
  },
  // 같은 출발·도착, 엔진이 후보로 준 다른 버스(급행97)를 탐
  alt_vehicle: async (R, lay, p) => {
    const alt = W.altBus(), leg = alt.rides[0];
    R.expectDev = true;
    await R.walkBoard(leg, 0); await R.ride(leg.stops, leg.gapSec, 12, {}); await R.moveTo(W.D, 1.3, { dt: 5 }); await R.wait(60);
  },
  // 엔진이 모르는 다른 버스(남쪽으로 불룩)를 탐
  unknown_vehicle: async (R, lay, p) => {
    const st = W.unknownBusStops(), leg = { stops: st, s0: 480, gapSec: 70 };
    R.expectDev = true;
    await R.walkBoard(leg, 0); await R.ride(st, 70, 12, {}); await R.moveTo(W.D, 1.3, { dt: 5 }); await R.wait(60);
  },
  // 택시(정류장 없이 빠르게, 엔진이 모르는 길)
  taxi: async (R, lay, p) => {
    R.expectDev = true;
    await R.wait(150); R.onVeh = true;
    const pts = W.taxiPts(); for (let i = 1; i < pts.length; i++) await R.moveTo(pts[i], 14, { dt: 5 });
    R.onVeh = false; await R.wait(60);
  },
  // 반대 방향 차를 탐(서쪽)
  wrong_dir: async (R, lay, p) => {
    const first = lay.rides[0], leg = first; R.expectDev = true;
    await R.walkBoard(leg, 0);
    const west = [0, 1, 2, 3, 4, 5, 6].map(k => ({ name: 'W' + k, x: first.stops[0].x - k * 450, y: first.stops[0].y }));
    await R.ride(west, 90, 12, {}); await R.wait(120);
  },
  // 계획 차를 타고 가다 중간에 내려 엉뚱한 곳(북쪽)으로 걸어감
  strange_place: async (R, lay, p) => {
    const leg = lay.rides[0];
    await R.walkBoard(leg, 0);
    const j = Math.min(3, leg.stops.length - 2);
    await R.ride(leg.stops.slice(0, j + 1), leg.gapSec, dwellOf(leg), { ug: R.ug(leg), dwellLast: true });
    R.expectDev = true; R.devRef = leg.stops[j];
    await R.moveTo({ x: leg.stops[j].x, y: leg.stops[j].y + 1500 }, 1.3, { dt: 5 });
    await R.wait(120);
  },
  // 환승역에서 내리지 않고 같은 차를 계속 탐(같은 방향으로 3정류장 더)
  skip_transfer: async (R, lay, p) => {
    const l0 = lay.rides[0];
    await rideLeg(R, l0, 0);
    const last = l0.stops[l0.stops.length - 1], more = [1, 2, 3].map(k => ({ name: 'N' + k, x: last.x + k * (l0.kind === 'sub' ? 1000 : 450), y: last.y }));
    R.skipped = true;
    await R.ride(more, l0.gapSec, dwellOf(l0), { ug: R.ug(l0), truthName: () => null });
    await R.wait(120);
  },
  // 타지 않고 집으로(서쪽) 돌아감
  stay_home: async (R, lay, p) => {
    const leg = lay.rides[0];
    await R.moveTo({ x: leg.stops[0].x - 4, y: 0 }, 1.3, { dt: 5 }); await R.wait(240, { dt: 15 });
    await R.moveTo({ x: -600, y: 0 }, 1.3, { dt: 10 }); await R.wait(300, { dt: 15 });
  },
  // 놓치고(안 타고) 노선을 따라 걸어감
  walk_along: async (R, lay, p) => {
    const leg = lay.rides[0];
    await R.moveTo({ x: leg.stops[0].x - 4, y: 0 }, 1.3, { dt: 5 });
    await R.waitUntil(leg.s0 + 90);
    await R.moveTo({ x: leg.stops[0].x + 1200, y: 0 }, 1.3, { dt: 10 }); await R.wait(60);
  },
};

// ── 시나리오 목록 ────────────────────────────────────────────
function scenarios() {
  const L = ['bus', 'sub', 'bus_sub', 'sub_sub', 'sub_bus'], out = [];
  const add = (layout, beh, extra) => { const e = Object.assign({ layout, beh, noise: 'clean', offset: 0 }, extra || {}); e.id = [layout, beh, e.noise, e.offset ? 'off' + e.offset : '', e.fsm === 'wired' ? 'wired' : ''].filter(Boolean).join('/'); out.push(e); };
  L.forEach(l => {
    add(l, 'faithful'); add(l, 'faithful', { noise: 'noisy' }); add(l, 'faithful', { offset: 240 }); add(l, 'faithful', { offset: -60 }); add(l, 'faithful', { offset: 480, noise: 'noisy' });
    add(l, 'alt_vehicle'); add(l, 'alt_vehicle', { noise: 'noisy' });
    add(l, 'unknown_vehicle'); add(l, 'unknown_vehicle', { noise: 'noisy' });
    add(l, 'taxi'); add(l, 'wrong_dir');
    add(l, 'strange_place'); add(l, 'strange_place', { noise: 'noisy' });
    add(l, 'stay_home'); add(l, 'walk_along');
  });
  ['bus_sub', 'sub_sub', 'sub_bus'].forEach(l => { add(l, 'skip_transfer'); add(l, 'skip_transfer', { noise: 'noisy' }); });
  // 위치 상태 머신에 GPS 가 들어간다고 가정한 대조군(이탈 감지가 켜진 세계)
  L.forEach(l => { add(l, 'faithful', { fsm: 'wired' }); add(l, 'faithful', { fsm: 'wired', noise: 'noisy' }); ['alt_vehicle', 'unknown_vehicle', 'taxi', 'wrong_dir', 'strange_place'].forEach(bh => add(l, bh, { fsm: 'wired' })); });
  return out;
}

// ── 한 시나리오 실행 ─────────────────────────────────────────
async function runOne(b, sc) {
  const lay = W.layout(sc.layout), eng = W.makeEngine(lay);
  const app = await H.newApp(b, eng, { lat: W.START.lat, lng: W.START.lng });
  const t0 = Date.now();
  let R = null, crashed = null;
  try {
    dbg('search'); await app.search(); dbg('confirm'); await app.confirm(); dbg('runner');
    R = await makeRunner(app, lay, sc);
    attachCommon(R, lay);
    R.maxSim = 3000;
    dbg('behave'); await BEH[sc.beh](R, lay, sc); dbg('done');
    await R.sample();
  } catch (e) { crashed = String(e && e.message || e).split('\n')[0]; }
  const diag = await app.page.evaluate(() => { try { return (JSON.parse(localStorage.getItem('ovlDiag') || '[]') || []).map(String); } catch (e) { return []; } }).catch(() => []);
  const adopted = diag.filter(x => /경로맞춤/.test(x)).length;
  const rec = { id: sc.id, layout: sc.layout, beh: sc.beh, noise: sc.noise, offset: sc.offset, fsm: sc.fsm || 'asis', wallSec: Math.round((Date.now() - t0) / 1000), crashed, pageErrors: [...new Set(app.errs)].slice(0, 5), adopted, diagAll: process.env.SIM_FULLDIAG ? diag.map(s => s.slice(0, 220)) : undefined, diagTail: diag.slice(-6).map(s => s.slice(0, 140)),
    trkCalls: app.stat.trk || 0, trkKey: (app.stat.trkLog || []).filter((x, i, a) => i === 0 || x.off !== a[i - 1].off || x.ridden !== a[i - 1].ridden || x.nC !== a[i - 1].nC || x.miss !== a[i - 1].miss).slice(0, 60), diagKey: diag.filter(x => /경로이탈|경로맞춤|경로판정|승차확정|승차판단/.test(x)).slice(0, 30).map(s => s.slice(0, 160)),
    events: R ? R.events : [], devAt: R ? R.devAt : null, simEnd: R ? Math.round(R.simT) : 0, requests: app.stat.routeQs ? burstsOf(app.stat.routeQs).length : 0, samples: R ? R.samples : [] };
  await app.ctx.close();
  return rec;
}

// ── 판정(정답 기준) ───────────────────────────────────────────
const pct = (a, q) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]; };
function judge(r, lay) {
  const S = r.samples, ev = r.events, issues = [], info = {};
  const rer = ev.filter(e => e.kind === 'reroute');
  const ahead = S.filter(s => s.truthIdx >= 0 && s.gm != null && s.gm >= 0).map(s => s.gm - s.truthIdx);
  const mk = S.filter(s => s.markerM != null).map(s => s.markerM), ov = S.filter(s => s.ovlM != null).map(s => s.ovlM);
  info.reroutes = rer.length; info.adopted = r.adopted; info.maxAhead = ahead.length ? Math.max(...ahead) : null; info.maxBehind = ahead.length ? -Math.min(...ahead) : null;
  info.markerP50 = pct(mk, 0.5); info.markerP95 = pct(mk, 0.95); info.markerMax = mk.length ? Math.max(...mk) : null;
  info.ovlP50 = pct(ov, 0.5); info.ovlP95 = pct(ov, 0.95); info.ovlMax = ov.length ? Math.max(...ov) : null;
  info.ovlOnRatio = S.length ? +(S.filter(s => s.ovlOn).length / S.length).toFixed(2) : null;
  const first = rer[0]; info.detectSec = (first && r.devAt != null) ? Math.round(first.t - r.devAt) : null; info.rerouteErrM = first ? first.errM : null;
  const last = S[S.length - 1]; info.finalGm = last ? last.gm : null; info.names = last ? last.nNodes : 0;
  if (r.crashed) issues.push('시뮬 중단: ' + r.crashed);
  if (r.pageErrors.length) issues.push('JS 오류 ' + r.pageErrors.length + '건: ' + r.pageErrors[0].slice(0, 80));
  let expect = '';
  switch (r.beh) {
    case 'faithful': {
      expect = '재탐색 0회 · 진행도가 실제보다 1정류장 넘게 앞서지 않음 · 마커 오차 작음';
      if (rer.length) issues.push('계획대로 가는데 재탐색 ' + rer.length + '회');
      if (r.adopted) issues.push('계획대로 가는데 다른 경로로 갈아탐(경로맞춤 ' + r.adopted + '회)');
      if (info.maxAhead != null && info.maxAhead > 1) issues.push('진행도가 실제보다 ' + info.maxAhead + '정류장 앞섬');
      if (info.markerP95 != null && info.markerP95 > 600) issues.push('마커 오차 95% ' + info.markerP95 + 'm');
      if (info.markerMax != null && info.markerMax > 1500) issues.push('마커 최대 오차 ' + info.markerMax + 'm');
      break; }
    case 'alt_vehicle': case 'unknown_vehicle': case 'taxi': case 'wrong_dir': case 'strange_place': {
      expect = '경로를 벗어난 뒤 재탐색(현재 위치·같은 도착지)하거나 엔진 후보 경로로 이어서 안내';
      const reacted = rer.length > 0 || r.adopted > 0;
      if (!reacted) issues.push('경로를 벗어났는데 재탐색·경로맞춤이 일어나지 않음');
      // strange_place 는 새 경로를 무시하고 1.5km 를 계속 반대로 걸어간다 — 쿨다운(180초)마다 다시 이탈이 맞으므로 5회까지 허용
      if (rer.length > (r.beh === 'strange_place' ? 5 : 3)) issues.push('재탐색이 ' + rer.length + '회로 잦음');
      if (first && first.errM > 600) issues.push('재탐색 출발 위치가 실제 위치와 ' + first.errM + 'm 어긋남');
      if (first && !first.sameDest) issues.push('재탐색의 도착지가 바뀜');
      if (info.detectSec != null && info.detectSec > 420) issues.push('이탈 후 재탐색까지 ' + info.detectSec + '초');
      break; }
    case 'skip_transfer': expect = '(관찰) 환승역에서 내리지 않고 계속 탔을 때 앱의 반응'; if (info.maxAhead != null && info.maxAhead > 2) issues.push('진행도가 실제보다 ' + info.maxAhead + '정류장 앞섬'); break;
    case 'stay_home': {
      expect = '타지 않았으면 진행도·마커가 승차 정류장 너머로 가지 않고 재탐색도 없음';
      const mx = Math.max(...S.map(s => (s.gm == null ? -1 : s.gm)));
      info.maxGm = mx;
      if (rer.length) issues.push('타지 않았는데 재탐색 ' + rer.length + '회');
      break; }
    case 'walk_along': expect = '타지 않았으면 진행도가 승차 정류장 너머로 가지 않음'; break;
  }
  // 타지 않는 행동: 진행도 상한 = 승차 정류장 노드(도보 1개 뒤)
  if (r.beh === 'stay_home' || r.beh === 'walk_along') {
    const mx = Math.max(-1, ...S.map(s => (s.gm == null ? -1 : s.gm)));
    info.maxGm = mx; info.boardNode = 2;
    // 걸어서 노선을 따라가다 다음 역 앞을 지나면(지하철은 역 간격 1km) 진행도가 그 역까지 오르는 것은 '사람의 위치 추적'이지 탑승이 아니다 → walk_along 은 승차 확정 여부만 본다(2026-10-12).
    if (mx > 2 && r.beh === 'stay_home') issues.push('타지 않았는데 진행도가 승차 정류장(2) 너머 ' + mx + ' 까지 올라감');
    if (S.some(s => s.boarded)) issues.push('타지 않았는데 승차 확정됨');
  }
  return { expect, info, issues, verdict: issues.length ? 'FAIL' : (r.beh === 'skip_transfer' ? 'INFO' : 'PASS') };
}

// ── 메인 ─────────────────────────────────────────────────────
(async () => {
  const argv = process.argv.slice(2), arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  let list = scenarios();
  if (arg('--filter')) { const re = new RegExp(arg('--filter')); list = list.filter(s => re.test(s.id)); }
  if (argv.includes('--list')) { list.forEach(s => console.log(s.id)); console.log(list.length + '개'); return; }
  if (arg('--shard')) { const [i, n] = arg('--shard').split('/').map(Number); list = list.filter((_, k) => k % n === i); }
  const out = arg('--out'), b = await H.launch(), results = [];
  for (const sc of list) {
    const r = await runOne(b, sc), lay = W.layout(sc.layout), j = judge(r, lay);
    const rec = Object.assign({}, r, { judge: j }); delete rec.samples; rec.samples = r.samples.filter((_, k) => k % 2 === 0);   // 파일 크기를 줄이려고 절반만 남긴다
    results.push(rec);
    console.log((j.verdict === 'PASS' ? '  ok  ' : j.verdict === 'INFO' ? ' info ' : ' FAIL ') + sc.id + '  [' + r.wallSec + 's] ' + (j.issues.length ? '— ' + j.issues.join(' / ') : ''));
    if (out) fs.writeFileSync(out, JSON.stringify({ at: new Date().toISOString(), results }, null, 1));
  }
  await b.close();
  const f = results.filter(r => r.judge.verdict === 'FAIL').length;
  console.log('\n' + results.length + '개 중 통과 ' + results.filter(r => r.judge.verdict === 'PASS').length + ' · 관찰 ' + results.filter(r => r.judge.verdict === 'INFO').length + ' · 문제 ' + f);
  process.exit(0);
})();
