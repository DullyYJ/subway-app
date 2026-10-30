'use strict';
// 다중 모달 시뮬레이션(s335·s336) — 가상 세계(참 위치 · GPS · 서울/버스 도착정보 · 시각표)에서 5초 루프로 엔진을 돌려
//   ① 시나리오별 API 호출 수 · 마커 위치 오차 · 되돌아감을 요약하고(node test/sim/multimodal_sim.js [A|B|C|D|D2|D3|E])
//   ② --record <파일> 로 대표 장면(승강장 신호 끊김 승차 · 후보 고정 · 거리 트리거 · 버스트 · 종착 고정 · 표본)의 입력/출력을 녹화한다 — ride_local 시험이 이 녹화를 자바 쌍둥이와 숫자 끝자리까지 비교한다.
// 다중 모달 시뮬레이션 — 가상 세계(참 위치·GPS·서울/버스 도착정보·시각표)와 앱 흉내(5초 루프)
const path = require('path');
const ROOT = process.env.GILDONGMU_ROOT || path.join(__dirname, '..', '..');
const E = require(path.join(ROOT, 'engine', 'ride-standby.js'));
const { rideStandby, rsBoardLive } = E;

const DAY = Date.parse('2026-10-13T00:00:00+09:00');
const T = (h, m, s) => DAY + ((h * 60 + m) * 60 + (s || 0)) * 1000;
const LAT = 37.5, LNG0 = 126.9, MX = 1 / (111320 * Math.cos(LAT * Math.PI / 180));
const lngOf = (x) => LNG0 + x * MX;
const hms = (ms) => { const s = Math.round((ms - DAY) / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), q = s % 60; return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(q).padStart(2, '0'); };
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ── 세계 만들기 ────────────────────────────────────────────────
// spec = { start:{x,t}, blackout:[[t0,t1]…], legs:[{kind:'bus'|'sub', line, rt?, tn?, headSec, cc?, sid?, stops:[{name,x,plan:[h,m],act:[h,m,s]}…]}] }
function buildWorld(spec) {
  const WALK = 1.2, ALIGHT_DELAY = 20000, BOARD_DELAY = 10000, DWELL = { bus: 20000, sub: 30000 };
  const nodes = [{ name: '출발', isOrigin: true }], stops = [], nodeX = [0], nodeLeg = [-1], truthArr = [null];
  const segs = [];
  let cx = spec.start.x, ct = spec.start.t, idx = 0;
  const legs = spec.legs.map((L, li) => {
    const first = idx + 1;
    L.stops.forEach((s, j) => {
      idx++; s.node = idx; s.aA = T(s.act[0], s.act[1], s.act[2] || 0); s.aD = s.aA + DWELL[L.kind];
      nodes.push(L.kind === 'bus' ? { name: s.name, isBus: true, lineName: L.line, planMin: s.plan[0] * 60 + s.plan[1] } : { name: s.name, isSub: true, lineName: L.line, planMin: s.plan[0] * 60 + s.plan[1] });
      nodeX[idx] = s.x; nodeLeg[idx] = li; truthArr[idx] = s.aA;
      const o = { i: idx, lat: LAT, lng: lngOf(s.x), arrMs: DAY + (s.plan[0] * 60 + s.plan[1]) * 60000, pass: idx > 1 };
      if (L.kind === 'bus') { o.bus = true; o.lg = li + 1; }
      stops.push(o);
    });
    return Object.assign({ li: li, first: first, last: idx }, L);
  });
  stops[stops.length - 1].fin = true;
  // 사용자 동선: 걷기 → (정류장 기다림) → 탑승 → 하차 → 걷기 …
  legs.forEach((L, li) => {
    const b = L.stops[0], dist = Math.abs(b.x - cx), tw = ct + (li ? ALIGHT_DELAY : 0) + dist / WALK * 1000 - (li ? 0 : 0);
    const t0 = ct + (li ? ALIGHT_DELAY : 0);
    if (li) segs.push({ t0: ct, t1: t0, x0: cx, x1: cx, type: 'wait', leg: li - 1, note: '하차' });
    segs.push({ t0: t0, t1: t0 + dist / WALK * 1000, x0: cx, x1: b.x, type: 'walk', leg: li });
    const arrive = t0 + dist / WALK * 1000, board = b.aA + BOARD_DELAY;
    if (arrive > board) L.missed = true;
    segs.push({ t0: arrive, t1: Math.max(arrive, board), x0: b.x, x1: b.x, type: 'wait', leg: li, note: '정류장 대기' });
    let t = Math.max(arrive, board);
    segs.push({ t0: t, t1: b.aD, x0: b.x, x1: b.x, type: 'dwell', leg: li, j: 0 });
    for (let j = 1; j < L.stops.length; j++) {
      const p = L.stops[j - 1], s = L.stops[j];
      segs.push({ t0: p.aD, t1: s.aA, x0: p.x, x1: s.x, type: 'ride', leg: li, j: j });
      segs.push({ t0: s.aA, t1: s.aD, x0: s.x, x1: s.x, type: 'dwell', leg: li, j: j });
    }
    const z = L.stops[L.stops.length - 1];
    cx = z.x; ct = z.aA + BOARD_DELAY;      // 하차
  });
  segs.push({ t0: ct, t1: ct + 600000, x0: cx, x1: cx, type: 'wait', leg: legs.length - 1, note: '도착' });
  const tEnd = legs[legs.length - 1].stops.slice(-1)[0].aA;
  const segAt = (t) => { for (let i = 0; i < segs.length; i++) if (t >= segs[i].t0 && t <= segs[i].t1) return segs[i]; return t < segs[0].t0 ? segs[0] : segs[segs.length - 1]; };
  const xAt = (t) => { const s = segAt(t); if (s.t1 <= s.t0) return s.x1; return s.x0 + (s.x1 - s.x0) * Math.min(1, Math.max(0, (t - s.t0) / (s.t1 - s.t0))); };
  const idxAt = (t) => { const s = segAt(t); if (s.type === 'ride') { const L = legs[s.leg]; return L.stops[s.j - 1].node + (t - s.t0) / (s.t1 - s.t0); } if (s.type === 'dwell') return legs[s.leg].stops[s.j].node; return null; };
  const gpsOn = (t) => {
    if ((spec.blackout || []).some((b) => t >= b[0] && t < b[1])) return false;
    const s = segAt(t); if (s.type === 'walk' || s.type === 'wait') return true;
    const L = legs[s.leg]; if (L.kind === 'bus' || L.surface) return true;
    if (s.type === 'dwell') return true;
    const x = xAt(t); return L.stops.some((q) => Math.abs(q.x - x) <= 200);      // 지하: 역 200m 안에서만 신호
  };
  const rand = rng(7);
  const fixesBetween = (a, b) => {
    const out = [];
    for (let t = Math.ceil((a + 1) / 1000) * 1000; t <= b; t += 1000) {
      if (!gpsOn(t)) continue;
      const x = xAt(t) + (rand() - 0.5) * 16, acc = 10 + Math.round(rand() * 14);
      out.push([t, LAT + (rand() - 0.5) * 1.2e-4, lngOf(x), acc]);
    }
    return out;
  };
  const nodeXAt = (f) => { const i = Math.floor(f), r = f - i; if (i < 1) return nodeX[1]; if (i >= nodeX.length - 1) return nodeX[nodeX.length - 1]; return nodeX[i] + (nodeX[i + 1] - nodeX[i]) * r; };
  return { spec, legs, nodes, stops, nodeX, nodeLeg, truthArr, segs, tEnd, t0: spec.start.t, xAt, idxAt, gpsOn, fixesBetween, nodeXAt, segAt };
}

function initState(W) {
  const seq = [], targets = [];
  W.nodes.forEach((n, i) => { if (i >= 1) seq.push(i); });
  W.legs.forEach((L, li) => {
    const z = L.stops[L.stops.length - 1];
    if (li < W.legs.length - 1) targets.push({ seqPos: z.node - 1, nodeIdx: z.node, name: z.name, kind: 'transfer', nextLine: W.legs[li + 1].line });
    else targets.push({ seqPos: z.node - 1, nodeIdx: z.node, name: z.name, kind: 'dest' });
  });
  const L0 = W.legs[0], cfg = { targets: targets, seq: seq, allowed: {}, destName: W.legs[W.legs.length - 1].stops.slice(-1)[0].name, waitBoard: true };
  if (L0.kind === 'bus') cfg.bl = { kind: 'bus', i: 1, cc: L0.cc, sid: L0.sid, no: L0.line };
  return { v: 1, tripSig: 'SIM', eta: { nodes: W.nodes, passes: [], boarded: true, notDeparted: false, timetableFirst: true, tzOffsetMin: 540 }, stops: JSON.parse(JSON.stringify(W.stops)), trail: [], cfg: cfg, fired: {} };
}

// ── 가짜 서버(서울 도착정보 · 버스 도착정보 · 시각표) ────────────────────
const SIM = { now: 0, W: null, api: [] };
function kst(ms) { const d = new Date(ms + 9 * 3600000); return d.toISOString().slice(0, 19).replace('T', ' '); }
function installMocks(W) {
  SIM.W = W;
  global.liveCityOk = () => true;
  global.ntEnsure = async () => ({
    forward: () => true,
    boardTable: (q) => {
      const L = W.legs.find((l) => l.kind === 'sub' && l.line === q.line && l.stops.some((s) => s.name === q.from)); if (!L) return null;
      const s = L.stops.find((z) => z.name === q.from), p = s.plan[0] * 60 + s.plan[1], hd = (L.headSec || 360) / 60;
      let dep = p + Math.ceil((q.atMin - p) / hd) * hd; if (q.atMin - p < -60) dep = p - Math.floor((p - q.atMin) / hd) * hd;     // 계획 시각 + k*배차
      return { dk: '상', depMin: dep };
    }
  });
  global.fetchStopArrivalsAny = async (cc, sid) => {
    const L = W.legs.find((l) => l.kind === 'bus' && l.sid === sid); if (!L) return null;
    const m = {}, a = L.stops[0].aA, out = [];
    for (let k = -2; k <= 3; k++) { const secs = Math.round((a + k * L.headSec * 1000 - SIM.now) / 1000); if (secs > 0) out.push(secs); }
    m[L.line] = out; return m;
  };
}
function mockEnv() {
  return { BUSAPI: { fetch: async (req) => {
    const u = new URL(req.url), p = decodeURIComponent(u.searchParams.get('path') || ''), st = p.split('/').pop();
    const L = SIM.W.legs.find((l) => l.kind === 'sub' && l.rt && l.stops.some((s) => s.name === st));
    if (!L) return new Response(JSON.stringify({ realtimeArrivalList: [] }), { status: 200 });
    const s = L.stops.find((z) => z.name === st), list = [];
    for (let k = -2; k <= 2; k++) {
      const arr = s.aA + k * L.headSec * 1000, rem = Math.round((arr - SIM.now) / 1000); if (rem < -20) continue;
      const tn = String(+L.tn + k * 2);
      let cd = '99', bd = String(Math.max(0, rem));
      if (rem <= 25) { cd = '1'; bd = '0'; } else if (rem <= 90) { cd = '0'; bd = '0'; }
      list.push({ subwayId: ({ '1호선': '1001', '2호선': '1002' })[L.line] || '1001', updnLine: '상행', bstatnNm: '종착', barvlDt: bd, arvlCd: cd, arvlMsg2: rem <= 25 ? '도착' : (rem <= 90 ? '진입' : '운행중'), recptnDt: kst(SIM.now), btrainNo: tn, statnNm: st });
    }
    if (L.decoy != null) {      // 시각표에 없는 열차(다른 방면·지선·회송)가 우리 열차보다 먼저 들어오는 것처럼 목록에 낀다 — 번호 'X' + 우리 열차 번호
      const dRem = Math.round((s.aA + L.decoy * 1000 - SIM.now) / 1000);
      if (dRem >= -20 && dRem < 900) { let cd = '99', bd = String(Math.max(0, dRem)); if (dRem <= 25) { cd = '1'; bd = '0'; } else if (dRem <= 90) { cd = '0'; bd = '0'; } list.unshift({ subwayId: ({ '1호선': '1001', '2호선': '1002' })[L.line] || '1001', updnLine: '상행', bstatnNm: '지선', barvlDt: bd, arvlCd: cd, arvlMsg2: dRem <= 25 ? '도착' : (dRem <= 90 ? '진입' : '운행중'), recptnDt: kst(SIM.now), btrainNo: 'X' + L.tn, statnNm: st }); }
    }
    return new Response(JSON.stringify({ realtimeArrivalList: list }), { status: 200 });
  } } };
}



const S = (name, x, plan, act) => ({ name, x, plan, act });
const split = (sec) => [Math.floor(sec / 3600), Math.floor(sec % 3600 / 60), sec % 60];
// 계획(분) + 지연(초) → 실제 도착
function line(kind, lineName, prefix, x0, startPlan, n, d0, dStep, extra) {
  return Object.assign({ kind: kind, line: lineName, stops: Array.from({ length: n }, (_, k) => {
    const pm = startPlan[0] * 60 + startPlan[1] + 3 * k, dl = extra && extra.delays ? extra.delays[k] : d0 + dStep * k;
    return S(prefix + k, x0 + 1500 * k, [Math.floor(pm / 60), pm % 60], split(pm * 60 + dl));
  }) }, extra);
}
const BUS = (sid) => ({
  kind: 'bus', line: '9701', cc: '23', sid: sid, headSec: 600,
  stops: [S('B0', 0, [12, 8], [12, 9, 20]), S('B1', 2000, [12, 12], [12, 13, 50]), S('B2', 4000, [12, 16], [12, 17, 40]), S('B3', 6000, [12, 20], [12, 22, 10])]
});
const RT = (x0, startPlan, d0, tn, extra) => line('sub', '1호선', 'R', x0, startPlan, 6, d0, 8, Object.assign({ rt: true, tn: tn, headSec: 300 }, extra));
const RT2 = (x0, startPlan, d0, tn, extra) => line('sub', '2호선', 'Q', x0, startPlan, 6, d0, 8, Object.assign({ rt: true, tn: tn, headSec: 300 }, extra));
const NR = (x0, startPlan, n, d0, dStep) => line('sub', '인천1호선', 'N', x0, startPlan, n, d0, dStep, { rt: false, headSec: 360 });

const SCENARIOS = {
  A: {
    name: '시나리오 A: 실시간 1호선 → 시각표 인천1호선 환승',
    spec: {
      start: { x: -350, t: T(12, 3, 0) },
      blackout: [[T(12, 16, 30), T(12, 25, 30)], [T(12, 36, 0), T(12, 43, 0)]],
      legs: [RT(0, [12, 10], 70, '4017'), NR(7620, [12, 30], 5, 50, 20)]
    }
  },
  B: {
    name: '시나리오 B: 버스 → 실시간 1호선',
    spec: {
      start: { x: -250, t: T(12, 3, 0) },
      blackout: [[T(12, 31, 30), T(12, 41, 30)]],
      legs: [BUS('BS-A'), RT(6200, [12, 27], 50, '5521')]
    }
  },
  C: {
    name: '시나리오 C: 버스 → 시각표 인천1호선 (장거리, 실시간 없음)',
    spec: {
      start: { x: -250, t: T(12, 3, 0) },
      blackout: [[T(12, 36, 0), T(12, 43, 0)]],
      legs: [BUS('BS-A'), NR(6200, [12, 28], 8, 40, 17)]
    }
  },
  D: {
    name: '시나리오 D: 버스 → 실시간 1호선 → 시각표 인천1호선 (2번 환승)',
    spec: {
      start: { x: -250, t: T(12, 3, 0) },
      blackout: [[T(12, 31, 30), T(12, 41, 30)], [T(12, 55, 0), T(13, 2, 0)]],
      legs: [BUS('BS-A'), RT(6200, [12, 27], 50, '5521'), NR(13820, [12, 47], 6, 40, 18)]
    }
  },
  D2: {
    name: '시나리오 D2: 버스 → 실시간 1호선(지상 구간·GPS 계속) → 시각표 인천1호선 — 열차가 중간에 4분 지연(로컬 우선, 오차 시에만 API)',
    spec: {
      start: { x: -250, t: T(12, 3, 0) },
      blackout: [[T(12, 59, 0), T(13, 5, 0)]],
      legs: [BUS('BS-A'), RT(6200, [12, 27], 50, '5521', { surface: true, delays: [50, 58, 66, 310, 318, 326] }), NR(13820, [12, 47], 6, 430, 18)]
    }
  },
  D3: {
    name: '시나리오 D3: 버스 → 실시간 1호선(터널 3분 신호 끊김 뒤 복구 · 1분 반 어긋남) → 시각표 인천1호선',
    spec: {
      start: { x: -250, t: T(12, 3, 0) },
      blackout: [[T(12, 35, 0), T(12, 38, 0)], [T(12, 55, 0), T(13, 2, 0)]],
      legs: [BUS('BS-A'), RT(6200, [12, 27], 50, '5521', { surface: true, delays: [50, 58, 66, 165, 173, 181] }), NR(13820, [12, 47], 6, 70, 18)]
    }
  },
  E: {
    name: '시나리오 E(보강): 실시간 1호선 → 실시간 2호선 — 환승 시 btrainNo 가 새 열차로 바뀌는지, 옛 번호로 튀지 않는지',
    spec: {
      start: { x: -350, t: T(12, 3, 0) },
      blackout: [[T(12, 16, 30), T(12, 25, 30)], [T(12, 36, 30), T(12, 45, 30)]],
      legs: [RT(0, [12, 10], 70, '4017'), RT2(7620, [12, 30], 60, '7788')]
    }
  },
  // ── s337 최종 안정화: 비실시간 · 위치 없음 · 버튼 · 환승 리셋 · 엉뚱한 열차 ──
  N1: { name: 'N1 비실시간 첫 구간(GPS 정상 → 승강장에서 끊김)', spec: { start: { x: -350, t: T(12, 3, 0) }, blackout: [[T(12, 12, 0), T(12, 20, 0)]], legs: [NR(0, [12, 10], 6, 50, 20)] } },
  N2: { name: 'N2 실시간 첫 구간 · GPS 전혀 없음 · [탑승] 버튼', spec: { start: { x: -350, t: T(12, 3, 0) }, blackout: [[T(12, 0, 0), T(12, 30, 0)]], legs: [RT(0, [12, 10], 70, '4017')] }, acts: [{ t: T(12, 10, 0) + 70000 + 12000, act: 'press' }] },
  N3: { name: 'N3 실시간 첫 구간 · GPS 전혀 없음 · 버튼 없음', spec: { start: { x: -350, t: T(12, 3, 0) }, blackout: [[T(12, 0, 0), T(12, 30, 0)]], legs: [RT(0, [12, 10], 70, '4017')] } },
  N4: { name: 'N4 승강장 직전부터 GPS 끊김 · 버튼 없음', spec: { start: { x: -350, t: T(12, 3, 0) }, blackout: [[T(12, 8, 0), T(12, 30, 0)]], legs: [RT(0, [12, 10], 70, '4017')] } },
  N5: { name: 'N5 환승 · 환승역 GPS 없음 · [환승] 버튼', spec: { start: { x: -350, t: T(12, 3, 0) }, blackout: [[T(12, 16, 30), T(12, 45, 30)]], legs: [RT(0, [12, 10], 70, '4017'), RT2(7620, [12, 30], 60, '7788')] }, acts: [{ t: T(12, 31, 12), act: 'press' }] },
  N6: { name: 'N6 실시간 목록에 시각표에 없는 열차(95초 먼저) → 비실시간 환승', spec: { start: { x: -350, t: T(12, 3, 0) }, blackout: [[T(12, 16, 30), T(12, 25, 30)]], legs: [RT(0, [12, 10], 70, '4017', { decoy: -95 }), NR(7620, [12, 30], 5, 50, 20)] } }
};

// ── 5초 루프(앱 흉내) ────────────────────────────────────────────
const clone = (o) => JSON.parse(JSON.stringify(o));
async function run(sc, rec, hook) {
  const acts = (sc.acts || []).map((a) => Object.assign({}, a));
  const W = buildWorld(sc.spec); installMocks(W);
  const env = mockEnv();
  let st = initState(W), now = W.t0, last = now - 1, pending = null, prevMk = null;
  const stat = { api: 0, errM: [], steps: 0, regress: 0 };
  const dest = W.nodes.length - 1, truthDest = W.truthArr[dest], endBy = truthDest + 5 * 60000;
  while (now <= endBy) {
    SIM.now = now;
    const req = { nowMs: now, fixes: W.fixesBetween(last, now), state: clone(st) };
    if (pending) { req.bl = pending; pending = null; }
    for (const ac of acts) if (!ac.done && now >= ac.t) { ac.done = true; req.act = ac.act; if (ac.act === 'press') { try { E.rsAttachPressTT(req, await global.ntEnsure()); const pq = E.rsPressQuery(req); if (pq) E.rsAttachPressLive(req, await E.rsFetchSeoulArrivals(env, pq)); } catch (e0) { } } }
    const pre = rec ? clone(req) : null;
    const r = rideStandby(req);
    if (r.error) throw new Error('엔진 오류: ' + r.error);
    if (rec) rec.push({ sc: sc.name.slice(0, 8), in: pre, out: clone(r) });
    stat.steps++; last = now; st = r.state;
    if (r.ask) { stat.api++; pending = await rsBoardLive(env, clone(r.ask.body)); }
    const tIdx = W.idxAt(now);
    if (r.pos && r.pos.from != null) {
      const mk = r.pos.from + r.pos.ratio;
      if (tIdx != null) stat.errM.push({ e: W.nodeXAt(mk) - W.nodeXAt(tIdx), leg: W.nodeLeg[Math.floor(tIdx)] });
      if (prevMk != null && mk < prevMk - 0.003) stat.regress++;
      prevMk = mk;
    }
    if (hook) hook(now, r, st, W, req);
    if (r.done) break;
    now += Math.max(2500, Math.min(10000, r.nextMs || 5000));
  }
  return { W, stat };
}
function summary(sc, res) {
  const { W, stat } = res, out = [sc.name, '  API 호출 ' + stat.api + '회 (엔진 ' + stat.steps + '걸음) · 마커 되돌아감 ' + stat.regress + '회'];
  W.legs.forEach((L, li) => {
    const a = stat.errM.filter((x) => x.leg === li).map((x) => Math.abs(x.e)); if (!a.length) return;
    const s = a.slice().sort((p, q) => p - q);
    out.push('  마커 오차(m) ' + (L.kind === 'bus' ? '버스 ' : '') + L.line + ': 평균 ' + Math.round(a.reduce((p, q) => p + q, 0) / a.length) + ' · 95% ' + Math.round(s[Math.floor(s.length * 0.95)]) + ' · 최대 ' + Math.round(s[s.length - 1]));
  });
  return out.join('\n');
}
// 대표 장면 고르기: 새 기능이 일어난 걸음의 입력(직전 상태) + 균등 표본
function pick(R) {
  const pats = [/위치 없/, /내 열차 번호를 붙이려/, /실시간 보정 거절/, /수동 확정/, /승강장에서 신호가/, /집중 확인/, /거리 \d+m/, /종착 도착 뒤/, /내 열차 기억/, /승차 확정/, /실시간 보정:/, /실시간 보정 준비/, /도착 확정 역 되돌아감/, /실시간 재보정\(/];
  const idx = new Set(), cnt = pats.map(() => 0);
  R.forEach((r, i) => { const n = (r.out.notes || []).join('|'); pats.forEach((p, pi) => { if (p.test(n) && cnt[pi] < (pi <= 8 || pi === 12 ? 2 : 1)) { cnt[pi]++; idx.add(i); } }); });
  let nc = 0, np = 0;
  R.forEach((r, i) => { const s = r.out.state || {}; if (s.bl && s.bl.cand && nc < 3 && i % 7 === 0) { idx.add(i); nc++; } if (s.wait && s.wait.pf && np < 2) { idx.add(i); np++; } });
  const last = {}; R.forEach((r, i) => { last[r.sc] = i; });
  Object.keys(last).forEach((k) => { for (let j = 0; j < 2; j++) idx.add(last[k] - j); });
  for (let i = 0; i < R.length; i += 1200) idx.add(i);
  return Array.from(idx).filter((i) => i >= 0).sort((a, b) => a - b).map((i) => JSON.stringify({ fn: 'standby', v: 337, in: R[i].in, out: R[i].out }));
}
async function recordLines() { const R = []; for (const k of Object.keys(SCENARIOS)) await run(SCENARIOS[k], R); return pick(R); }
module.exports = { recordLines, run, summary, SCENARIOS, T, hms, E, RT, RT2, NR, BUS };
if (require.main === module) (async () => {
  const a = process.argv.slice(2), ri = a.indexOf('--record');
  if (ri >= 0) { const lines = await recordLines(); require('fs').writeFileSync(a[ri + 1], lines.join('\n') + '\n'); console.log('recorded ' + lines.length); return; }
  for (const k of Object.keys(SCENARIOS)) { if (a[0] && a[0] !== k) continue; console.log(summary(SCENARIOS[k], await run(SCENARIOS[k]))); }
})();
