// 위치 판단기(PosFusion) 엔진(engine/posfusion.js) 시험.  실행: node test/posfusion_engine.test.js
//  ① 웹 원본(ios-reference/index.html 의 PosFusion)과 같은 결과인가: 한 번에 돌릴 때는 소수 끝까지 같고, 상태를 오가며 나눠 돌려도(JSON 반올림) 채택 역이 같다
//  ② 입력 거절 · 상태 이어받기 · 오래된 fix/미래 이벤트 · 알고리즘 성질(앞으로만 진행, GPS가 가리키는 역으로 수렴)
//  ③ 워커 내장 사본 · 이름 충돌 · 끝에서 끝
const fs = require('fs'), path = require('path'), vm = require('vm');
const E = require('../engine/posfusion');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);

// ── 웹 원본 꺼내기 ──
const html = fs.readFileSync(R('ios-reference/index.html'), 'utf8');
const a = html.indexOf("(function(root){\n'use strict';\n\nvar C = {\n  DWELL_S: 30"), b = html.indexOf("else root.PosFusion = api;\n})(typeof window !== 'undefined' ? window : this);");
ok(a > 0 && b > a, '웹 원본 PosFusion 을 찾았다');
const ctx = { Math, Date, console }; vm.createContext(ctx);
vm.runInContext(html.slice(a, b + "else root.PosFusion = api;\n})(typeof window !== 'undefined' ? window : this);".length).replace("typeof window !== 'undefined' ? window : this", 'this'), ctx);
const ORIG = ctx.PosFusion;
ok(ORIG && typeof ORIG.create === 'function', '원본 create');

// ── 시나리오 ──
let seedR = 12345; const rnd = () => (seedR = (seedR * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const T0 = Date.UTC(2026, 9, 20, 0, 0, 0);
const N = 24, ST = [];
for (let i = 0; i < N; i++) ST.push({ lat: 37.50 + i * 0.011 + (i % 3) * 0.001, lng: 127.00 + i * 0.006, schedMs: T0 + i * 150000, xferFromPrev: i === 9, name: 'S' + i });
// 사건 목록: 열차가 시각표보다 40초 늦게 달린다. 3초마다 GPS(잡음 30m), 가끔 기지국
function truth(tMs) { // 시각 → 위치(역 번호 실수)
  const x = (tMs - T0 - 40000) / 150000; return Math.max(0, Math.min(N - 1, x));
}
const EV = [];
for (let t = T0 + 5000; t < T0 + 50 * 60000; t += 3000) {
  if (t > T0 + 24 * 150000 + 60000) break;
  const x = truth(t), i0 = Math.floor(x), i1 = Math.min(N - 1, i0 + 1), f = x - i0;
  const lat = ST[i0].lat + (ST[i1].lat - ST[i0].lat) * f + (rnd() - 0.5) * 0.0005, lng = ST[i0].lng + (ST[i1].lng - ST[i0].lng) * f + (rnd() - 0.5) * 0.0005;
  EV.push({ t: 'gps', at: t, fix: { lat, lng, ts: t - 500, acc: 20 + rnd() * 30 } });
  if (rnd() < 0.05) EV.push({ t: 'cell', at: t + 1, idx: Math.round(x), conf: 0.6 });
  if (rnd() < 0.04) EV.push({ t: 'motion', at: t + 2, state: rnd() < 0.5 ? 'moving' : 'stopped', conf: 0.8 });
}
EV.sort((p, q) => p.at - q.at);
const END = EV[EV.length - 1].at + 4000;

// ── 원본을 이 사건들로 돌린다 ──
function runOrig(upto, snapshots) {
  const f = ORIG.create(ST.map(s => Object.assign({}, s))); f.seed(0, 0.9, EV[0].at);
  const out = [];
  for (const e of EV) {
    if (e.at > upto) break;
    f.predict(e.at);
    if (e.t === 'gps') f.gps({ lat: e.fix.lat, lng: e.fix.lng, ts: e.fix.ts, acc: e.fix.acc }, e.at);
    else if (e.t === 'motion') f.motion(e.state, e.at, e.conf);
    else if (e.t === 'cell') f.cell(e.idx, e.conf, e.at);
    if (snapshots && snapshots.has(e.at)) out.push(f.best());
  }
  f.predict(upto);
  return { f, best: f.best(), median: f.median() };
}
const O = runOrig(END);

// ① 한 번에: 소수 끝까지 같다
{
  const r = E.posFuseRun({ nowMs: END, stations: ST, seed: { idx: 0, conf: 0.9 }, startMs: EV[0].at, ev: EV });
  ok(r.ok && r.best.idx === O.best.idx && r.best.conf === O.best.conf && r.best.kind === O.best.kind && r.best.delayS === O.best.delayS, '한 번에 돌린 결과가 웹 원본과 소수 끝까지 같다 idx ' + r.best.idx + ' conf ' + r.best.conf + ' vs ' + O.best.conf);
  ok(r.median.idx === O.median.idx && r.median.delayS === O.median.delayS, '중앙값도 같다 ' + r.median.idx);
  ok(r.best.idx >= 15, '시나리오 끝에서 진행도가 앞쪽으로 가 있다(원본과 같은 값) ' + r.best.idx);
  ok(r.fed.gps > 500 && r.fed.cell > 5 && r.fed.motion > 5, '증거 개수 gps ' + r.fed.gps + ' cell ' + r.fed.cell + ' motion ' + r.fed.motion);
}
// ① 나눠서(상태를 JSON 으로 오가며): 채택 역이 구간마다 같다
{
  let state = null, mism = 0, maxd = 0, chunks = 0, bytes = 0;
  const CH = 20000;
  for (let t = EV[0].at + CH; t <= END + CH; t += CH) {
    const now = Math.min(t, END);
    const evs = EV.filter(e => e.at > t - CH && e.at <= now);
    const inp = { nowMs: now, stations: ST, state, seed: { idx: 0, conf: 0.9 }, startMs: EV[0].at, ev: evs };
    const r = E.posFuseRun(JSON.parse(JSON.stringify(inp)));
    state = JSON.parse(JSON.stringify(r.state)); bytes = Math.max(bytes, JSON.stringify(r.state).length);
    const o = runOrig(now);
    chunks++; if (r.best.idx !== o.best.idx) mism++; maxd = Math.max(maxd, Math.abs(r.best.conf - o.best.conf));
    if (now === END) break;
  }
  ok(chunks > 20 && mism === 0, '20초씩 나눠(상태 오가기) 돌려도 채택 역이 원본과 같다 구간 ' + chunks + ' 다른 곳 ' + mism);
  ok(maxd < 0.01, '확신도 차이가 작다 최대 ' + maxd.toFixed(5));
  ok(bytes < 40000, '상태 크기 ' + bytes + ' 바이트(24역)');
}
// ② 거절 · 이어받기 · 경계
{
  ok(E.posFuseRun(null).error === 'nowMs' && E.posFuseRun({ nowMs: T0 }).error === 'stations' && E.posFuseRun({ nowMs: T0, stations: [ST[0]] }).error === 'stations', '입력이 이상하면 거절');
  const base = E.posFuseRun({ nowMs: T0 + 1000, stations: ST, ev: [] });
  ok(base.ok && base.best.idx === 0 && base.best.conf > 0.8, '이벤트 없이도 처음 상태');
  const bad = E.posFuseRun({ nowMs: T0 + 2000, stations: ST, state: { w: [1], P: [[1]] }, ev: [] });
  ok(bad.ok && bad.best.idx === 0, '맞지 않는 상태는 버리고 새로 시작');
  const fut = E.posFuseRun({ nowMs: T0 + 1000, stations: ST, ev: [{ t: 'gps', at: T0 + 99999999, fix: ST[5] }, { t: 'zzz', at: T0 + 10 }, null, { t: 'gps', at: -5 }] });
  ok(fut.ok && fut.fed.gps === 0 && fut.fed.skipped >= 2, '미래·모르는 이벤트는 건너뜀 ' + JSON.stringify(fut.fed));
  const stale = E.posFuseRun({ nowMs: T0 + 100000, stations: ST, ev: [{ t: 'gps', at: T0 + 100000, fix: { lat: ST[8].lat, lng: ST[8].lng, ts: T0 + 50000, acc: 20 } }] });
  ok(stale.fed.gps === 0, '10초보다 오래된 fix 는 안 쓴다');
  const bad2 = E.posFuseRun({ nowMs: T0 + 100000, stations: ST, ev: [{ t: 'gps', at: T0 + 100000, fix: { lat: ST[8].lat, lng: ST[8].lng, ts: T0 + 99500, acc: 300 } }] });
  ok(bad2.fed.gps === 0, '오차 80m 넘는 fix 는 안 쓴다');
  const sk = E.posFuseRun({ nowMs: T0 + 60000, stations: ST, seed: { idx: 5 }, startMs: T0, ev: [] });
  ok(sk.best.idx === 5, 'seed 역에서 시작 ' + sk.best.idx);
}
// 앞으로만: 역 3 근처 GPS 를 계속 주면 3 으로 수렴, 그 뒤 역 0 쪽 GPS 한 번이 채택 역을 되돌리지 못한다
{
  let t = T0 + 400000; const evs = [];
  for (let k = 0; k < 40; k++) { evs.push({ t: 'gps', at: t, fix: { lat: ST[3].lat, lng: ST[3].lng, ts: t - 200, acc: 15 } }); t += 3000; }
  const r1 = E.posFuseRun({ nowMs: t, stations: ST, startMs: T0 + 390000, ev: evs });
  ok(Math.abs(r1.best.idx - 3) <= 1, '역 3 근처 GPS 로 수렴 ' + r1.best.idx);
  const r2 = E.posFuseRun({ nowMs: t + 3000, stations: ST, state: r1.state, ev: [{ t: 'gps', at: t + 3000, fix: { lat: ST[0].lat, lng: ST[0].lng, ts: t + 2800, acc: 50 } }] });
  ok(r2.best.idx >= r1.best.idx - 1, '한 번의 엉뚱한 GPS 로 크게 되돌아가지 않는다 ' + r1.best.idx + '→' + r2.best.idx);
}
// ③ 워커
{
  const W = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  ok(/handlePosFuse/.test(W) && /function posFuseRun/.test(W) && /url\.pathname === "\/pos-fuse"/.test(W), '워커에 /pos-fuse 가 내장돼 있다');
  const blk = (W.match(/\/\/ ===== POSFUSE ENGINE BEGIN =====[\s\S]*?\/\/ ===== POSFUSE ENGINE END =====/) || [''])[0];
  ok(blk.length > 3000, '워커 사본이 있다');
  const names = [...fs.readFileSync(R('engine/posfusion.js'), 'utf8').matchAll(/^(?:function|var) ([A-Za-z0-9_]+)/gm)].map(m => m[1]);
  const others = W.replace(/\/\/ ===== POSFUSE ENGINE BEGIN =====[\s\S]*?\/\/ ===== POSFUSE ENGINE END =====/, '');
  names.forEach(n => { const re = new RegExp('(?:^|\\n)(?:async )?(?:function|var|let|const) ' + n + '\\b', 'g'); ok(!re.test(others), '이름 충돌 없음 ' + n); });
  const c2 = { Response: class { constructor(b, o) { this.b = b; this.status = (o && o.status) || 200; } }, console, ENGINE_VERSION: 'x', Math, Date }; vm.createContext(c2);
  try {
    vm.runInContext(blk + '\nthis.__h = handlePosFuse;', c2);
    const rq = (obj, method) => ({ method: method || 'POST', text: () => Promise.resolve(typeof obj === 'string' ? obj : JSON.stringify(obj)) });
    const inp = { nowMs: END, stations: ST, seed: { idx: 0, conf: 0.9 }, startMs: EV[0].at, ev: EV.slice(0, 300) };
    Promise.all([c2.__h(rq(inp)), c2.__h(rq({})), c2.__h(rq('{bad')), c2.__h(rq({}, 'GET'))]).then(([x, y, z, w]) => {
      const jx = JSON.parse(x.b), local = E.posFuseRun(inp);
      ok(x.status === 200 && jx.ok && jx.best.idx === local.best.idx && jx.best.conf === local.best.conf, '워커 사본이 요청을 끝까지 처리하고 엔진 파일과 같다');
      ok(y.status === 400 && z.status === 400 && w.status === 405, '이상한 입력 400 · 나쁜 JSON 400 · GET 405');
      done();
    }, e => { ok(false, '워커 요청 오류 ' + e.message); done(); });
  } catch (e) { ok(false, '워커 블록 실행 오류 ' + e.message); done(); }
}
function done() { console.log(fail ? ('posfusion_engine: ' + pass + ' pass, ' + fail + ' FAIL') : ('posfusion_engine: ' + pass + ' pass, 0 fail')); process.exit(fail ? 1 : 0); }
