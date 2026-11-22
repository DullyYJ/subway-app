// s471~s473 시험 도우미 — 가상 이동(위치 · 시각표 답)으로 탑승 엔진(ride-standby)을 처음부터 끝까지 돌리고 걸음마다 rec(req, out) 로 알려 준다.
//   ride_local.test.js 가 이 걸음을 녹화해 폰 안 자바(RideStandbyJ)와 서버 JS 의 답·상태를 걸음마다 견준다(s471 건너뜀 방지 · xFree · s472 이른 시각표 · s473 버스→버스 환승).
//   경로: transfer() = 지하철 1호선→2호선 환승(걷기 4분) · uloop() = 김포 841번 사우역 U자 → 골드라인 · 실제 서비스가 만든 상태 2개(판교→광교중앙 · 동탄→수서, test/fixtures/s473_*_bus_state.json).
'use strict';
const path = require('path');
const RS = require(path.join(__dirname, '..', '..', 'engine', 'ride-start.js'));

const T0 = Date.UTC(2026, 10, 23, 0, 0, 0);     // 월 09:00 KST
const walk = (m, ss, es) => ({ trafficType: 3, sectionTime: m, distance: m * 70, startSec: ss, endSec: es });
const mk = (P) => ({ data: { result: { path: [P] } }, tab: 'fast', a: '출발지', b: '도착지', bt: null, rb: T0, now: T0, tz: 540, th: 'dark' });

function transfer() {
  const LAT = 37.5, LNG0 = 126.9, DL = 0.0137;
  const subA = { trafficType: 1, lane: [{ name: '수도권 1호선' }], sectionTime: 6, distance: 3600, startName: 'S0', endName: 'S3', startSec: 120, endSec: 480, stopSec: [120, 240, 360, 480],
    passStopList: { stations: [0, 1, 2, 3].map(i => ({ stationName: 'S' + i, y: LAT, x: LNG0 + DL * i })) } };
  const subB = { trafficType: 1, lane: [{ name: '수도권 2호선' }], sectionTime: 4, distance: 2400, startName: 'X3', endName: 'X5', startSec: 720, endSec: 960, stopSec: [720, 840, 960],
    passStopList: { stations: [3, 4, 5].map(i => ({ stationName: 'X' + i, y: LAT, x: LNG0 + DL * i })) } };
  const P = { info: { totalTime: 18, transferCount: 1, pathType: 1, tab: 'fast' }, subPath: [walk(2, 0, 120), subA, walk(4, 480, 720), subB, walk(2, 960, 1080)] };
  return RS.rideStart({ cap: 18 }, mk(P)).state;
}
function uloop() {
  const C = { 1: [37.64257, 126.70943], 2: [37.63658, 126.71035], 3: [37.63207, 126.71135], 4: [37.62682, 126.71213], 5: [37.62107, 126.71723], 6: [37.62010, 126.71920], 7: [37.62137, 126.71753], 8: [37.62036, 126.71972], 9: [37.61249, 126.73239], 10: [37.60124, 126.77035], 11: [37.56236, 126.80187] };
  const NM = { 1: '차량등록사업소', 2: '걸포중앙공원입구', 3: '김포우리병원', 4: '북변환승센터', 5: '사우역.김포고', 6: '사우지하차도(미정차)', 7: '사우역.김포고(김포초교방면)' };
  const bus = { trafficType: 2, lane: [{ busNo: '841' }], sectionTime: 12, distance: 6000, startName: NM[1], endName: NM[7], startSec: 120, endSec: 829,
    passStopList: { stations: [1, 2, 3, 4, 5, 6, 7].map(i => ({ stationName: NM[i], y: C[i][0], x: C[i][1] })) } };
  const sub = { trafficType: 1, lane: [{ name: '김포골드라인' }], sectionTime: 10, distance: 9000, startName: '사우', endName: '김포공항', startSec: 1080, endSec: 1863, stopSec: [1080, 1215, 1478, 1863],
    passStopList: { stations: [8, 9, 10, 11].map((i, q) => ({ stationName: ['사우', '풍무', '고촌', '김포공항'][q], y: C[i][0], x: C[i][1] })) } };
  const P = { info: { totalTime: 32, transferCount: 1, pathType: 3, tab: 'fast' }, subPath: [walk(2, 0, 120), bus, walk(4, 829, 1080), sub, walk(2, 1863, 1980)] };
  return RS.rideStart({ cap: 18 }, mk(P)).state;
}
function fixture(name) { return JSON.parse(JSON.stringify(require(path.join(__dirname, '..', 'fixtures', 's473_' + name + '_bus_state.json')))); }
// s474: 실제 서비스가 만든 지하철 → 버스 → 버스 경로(공휴일 12/25 10:00 의정부→홍대입구: 1호선 → 1102 → 7101). 도봉산역(4번)과 도봉산역(중)(5번)은 95m.
function fixture474() { return JSON.parse(JSON.stringify(require(path.join(__dirname, '..', 'fixtures', 's474_hol_subbus_state.json')))); }

const hav = (a, b, c, d) => { const R = 6371000, k = Math.PI / 180, x = (c - a) * k, y = (d - b) * k * Math.cos((a + c) / 2 * k); return Math.sqrt(x * x + y * y) * R; };

// st0 를 처음부터 끝까지. opts: { realMove, walkFirst, answer(b, now) → {ms, src} | null, gps(ft, p, STOPS) → true 면 위치 기록을 준다, noise(m), seed, rec(req, out), stepMs }
function run(SB, st0, opts) {
  opts = opts || {};
  const STOPS = st0.stops.slice().sort((a, b) => a.i - b.i), T = STOPS.map(s => s.arrMs), last = STOPS.length - 1;
  let seed = opts.seed || 7; const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  const posAt = (ts) => {
    if (ts <= T[0]) return [STOPS[0].lat, STOPS[0].lng];
    for (let k = 0; k < last; k++) if (ts <= T[k + 1]) {
      let f = T[k + 1] > T[k] ? (ts - T[k]) / (T[k + 1] - T[k]) : 1;
      if (opts.realMove) {      // 계획 구간이 느리면(기다림이 들어 있음) 정류장에서 기다리다 마지막에 움직인다
        const dd = hav(STOPS[k].lat, STOPS[k].lng, STOPS[k + 1].lat, STOPS[k + 1].lng), dts = (T[k + 1] - T[k]) / 1000;
        if (dts > 120 && dd / dts < 3) {
          if (opts.walkFirst) { const el = (ts - T[k]) / 1000, wk = Math.max(15, dd / 1.3); f = Math.min(1, Math.max(0, el / wk)); }      // s474: 내리자마자 걸어 다음 정류장에서 기다린다(realMove 는 서 있다 마지막에 움직임)
          else { const mv = Math.max(20, dd / 6), tl = (T[k + 1] - ts) / 1000; f = tl >= mv ? 0 : 1 - tl / mv; }
        }
      }
      return [STOPS[k].lat + (STOPS[k + 1].lat - STOPS[k].lat) * f, STOPS[k].lng + (STOPS[k + 1].lng - STOPS[k].lng) * f];
    }
    return [STOPS[last].lat, STOPS[last].lng];
  };
  let st = JSON.parse(JSON.stringify(st0)), pend = null; const alerts = [], notes = [], rows = []; let doneAt = null;
  const rel = ms => Math.round((ms - T[0]) / 1000), stepMs = opts.stepMs || 4000, noise = opts.noise || 0;
  for (let now = T[0] - 120000; now <= T[last] + 420000; now += stepMs) {
    const fixes = [];
    for (let ft = now - 3000; ft <= now; ft += 3000) {
      const p = posAt(ft);
      if (opts.gps && !opts.gps(ft, p, STOPS)) continue;
      const dl = noise ? (rnd() - 0.5) * 2 * noise : 0, dn = noise ? (rnd() - 0.5) * 2 * noise : 0;
      fixes.push([ft, p[0] + dl / 111000, p[1] + dn / (111000 * Math.cos(p[0] * Math.PI / 180)), Math.max(10, noise)]);
    }
    const req = { nowMs: now, fixes: fixes, state: JSON.parse(JSON.stringify(st)) }; if (pend) { req.bl = pend; pend = null; }
    const rq = opts.rec ? JSON.parse(JSON.stringify(req)) : null;
    const r = SB.rideStandby(req); st = r.state;
    if (opts.rec) opts.rec(rq, r);
    (r.notes || []).forEach(n => notes.push(rel(now) + ' ' + n));
    if (r.ask && r.ask.body && opts.answer) {
      const b = r.ask.body, a = opts.answer(b, now, STOPS);
      pend = a ? { ok: true, kind: b.kind, i: b.i, ms: a.ms, src: a.src, at: b.nowMs, fromMs: b.fromMs, allowEarlier: !!b.allowEarlier, maxWait: b.maxWait } : { ok: true, kind: b.kind, i: b.i, ms: null, src: null, at: b.nowMs, fromMs: b.fromMs, allowEarlier: !!b.allowEarlier, maxWait: b.maxWait };
    }
    if (r.alert) alerts.push({ t: rel(now), key: r.alert.key, type: r.alert.type, ci: r.curIdx });
    rows.push({ t: rel(now), ci: r.curIdx });
    if (r.done) { doneAt = rel(now); break; }
  }
  return { alerts, notes, rows, doneAt, state: st, plan: STOPS.map(s => rel(s.arrMs)), at: (key) => { const a = alerts.filter(x => x.key === key); return a.length ? a[0].t : null; } };
}


// s474: 합성 지하철 → 버스(→ 버스) 경로 — 1호선 4역(S0~S3) 내린 뒤 정류장 B0 까지 D m 를 걷고 W 초 기다렸다 버스(B0~B5, 500m/90초)를 탄다. third 면 B5 에서 400m 걸어 다음 버스(C0~C4)로 환승.
// build: sub S0..S3 (3.6km, 120s/stn) → [walk D m, wait W s] → bus B0..B5 (500m each, 90s) [→ optional 2nd bus C0..C4]
function subBus(D, W, third) {
  const LAT=37.5, LNG0=127.0, DL=0.0137;
  const subStart=120, subEnd=subStart+360;
  const st=[0,1,2,3].map(i=>({stationName:'S'+i,y:LAT,x:LNG0+DL*i}));
  const sub={trafficType:1,lane:[{name:'수도권 1호선'}],sectionTime:6,distance:3600,startName:'S0',endName:'S3',startSec:subStart,endSec:subEnd,stopSec:[120,240,360,480],passStopList:{stations:st}};
  const sx=LNG0+DL*3, dLng=D/(111000*Math.cos(LAT*Math.PI/180));
  const busStart=subEnd+W, nB=6;
  const bs=[...Array(nB)].map((_,i)=>({stationName:'B'+i,y:LAT+ (i*0.0045)*0.3,x:sx+dLng+i*0.0052}));
  const busEnd=busStart+(nB-1)*90;
  const bus={trafficType:2,lane:[{busNo:'1102'}],sectionTime:Math.round((busEnd-busStart)/60),distance:2500,startName:'B0',endName:'B'+(nB-1),startSec:busStart,endSec:busEnd,passStopList:{stations:bs}};
  const sp=[walk(2,0,120),sub,bus];
  let end=busEnd;
  if(third){ // bus→bus: next bus boards at a stop 400 m away
    const last=bs[nB-1], nC=5, cStart=busEnd+240;
    const cs=[...Array(nC)].map((_,i)=>({stationName:'C'+i,y:last.y+0.0036+i*0.0004,x:last.x+0.0030+i*0.0052}));
    const cEnd=cStart+(nC-1)*90;
    sp.push({trafficType:2,lane:[{busNo:'7101'}],sectionTime:Math.round((cEnd-cStart)/60),distance:2000,startName:'C0',endName:'C'+(nC-1),startSec:cStart,endSec:cEnd,passStopList:{stations:cs}}); end=cEnd;
  }
  sp.push(walk(2,end,end+120));
  const P={info:{totalTime:Math.round(end/60)+4,transferCount:third?2:1,pathType:3,tab:'fast'},subPath:sp};
  const r=RS.rideStart({ cap: 18 }, mk(P)); if(!r.state) throw new Error(JSON.stringify(r).slice(0,200));
  return r.state;
}

module.exports = { T0, transfer, uloop, fixture, fixture474, subBus, run, hav };
