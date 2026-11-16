// s456 (YJ 2026-11-16: "지하철 출발시간이 안 맞아. 경로 설정시에는 무조건 시간표 기반으로 해. 아라역은 06:18 출발인데 시간이 오락가락해 … 이미 지나간 것이 확정된 역은 시간 바꾸지 말고,
//   영점 조절로 시간이 밀리거나 당겨지면 아직 지나지 않은 역의 시간이 밀리거나 당겨져야 해") — 실기기 화면(991 버스 → 아라 06:18 → 계양 06:22 → …)을 그대로 달려 본다.
// 실행: node test/ride_xfer_tt.test.js      (엔진 기본값 그대로 — 실시간 없는 노선 7초 당김 포함)
'use strict';
const assert = require('assert'), path = require('path');
const SB = require(path.join(__dirname, '..', 'engine', 'ride-standby.js')), E = require(path.join(__dirname, '..', 'engine', 'ride-eta.js')), TR = require(path.join(__dirname, '..', 'engine', 'ride-track.js'));
const SC = require(path.join(__dirname, 'helpers', 'xfer_tt_scenario.js'));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e && e.message).split('\n').slice(0, 3).join('\n       ')); } };
const A = SC.ARA;                                    // 아라 = 6번 노드(앞 5개는 버스 정류장), 계양 7 · 귤현 8 · 박촌 9
const run = (o) => SC.run(SB.rideStandby, Object.assign({ attachPress: SB.rsAttachPressTT }, o));
const seq = (r, i) => { const out = []; for (const row of r.rows) { const v = row.arr ? row.arr[i] : null; if (v != null && v !== out[out.length - 1]) out.push(v); } return out; };      // 그 역의 화면 시각(HH:MM)이 바뀐 차례
const sec = (r, i, tMs) => { const row = r.rows.find((x) => x.ms === tMs); return row && row.etaMs ? Math.round((row.etaMs[i] - SC.DAY) / 1000) : null; };

// ── 1. 버스가 3분 늦어도 아라 06:18 열차는 그대로(위치 받는 방식 네 가지 모두) ──
for (const mode of ['none', 'stale', 'ground', 'live']) {
  t('버스 3분 지연 · 위치 ' + mode + ': 아라는 처음부터 끝까지 06:18 — 한 번도 안 바뀐다 · 지난 역 시각 변경 0', () => {
    const r = run({ mode });
    assert.deepStrictEqual(seq(r, A), ['06:18'], '아라 ' + seq(r, A).join(' → '));
    assert.strictEqual(r.changed.length, 0, '지난 역 시각이 바뀌었다: ' + r.changed.join(' / '));
    assert.ok(seq(r, A + 1).every((v) => v === '06:22' || v === '06:21'), '계양은 시각표(06:22) 또는 영점으로 조금 당겨진 값 ' + seq(r, A + 1).join(' → '));
    assert.ok(seq(r, A + 1).length <= 2, '계양이 오락가락하지 않는다 ' + seq(r, A + 1).join(' → '));
  });
}
t('버스를 타고 가는 동안(하차 전)에도 아라 06:18 · 계양 06:22 · 귤현 06:24 · 박촌 06:27 — 버스가 늦은 만큼 밀어 보이지 않는다(예전 06:20 · 06:21)', () => {
  const r = run({ mode: 'none' }), rows = r.rows.filter((x) => x.ms <= SC.at(6, 13, 0) && x.arr);
  assert.ok(rows.length > 90);
  for (const row of rows) assert.deepStrictEqual([row.arr[A], row.arr[A + 1], row.arr[A + 2], row.arr[A + 3]], ['06:18', '06:22', '06:24', '06:27'], row.t + ' ' + row.arr.slice(A, A + 4).join());
  assert.ok(rows.every((row) => row.arr[5] >= '06:13'), '버스 하차 정류장은 늦은 만큼 밀린다(아직 안 지난 정류장) ' + rows[rows.length - 1].arr[5]);
});
t('환승역에서 받은 시각표 답(06:18:00)은 그 역의 예정 초 자리(06:18:2x)로 — 7초 당김이 겹쳐 06:17 로 보이지 않는다', () => {
  const r = run({ mode: 'none' }), xw = r.rows.filter((x) => x.xw);
  assert.ok(xw.length > 20, '환승 대기 구간이 있다');
  assert.ok(xw.some((row) => row.notes.some((n) => /환승 다음 차\(table\)/.test(n))), '시각표 다음 차를 받았다');
  for (const row of xw) { const s = Math.round((row.etaMs[A] - SC.DAY) / 1000) - (6 * 3600 + 18 * 60); assert.ok(s >= 13 && s <= 30, row.t + ' 아라 06:18:' + s); }
  const lv = r.rows.filter((x) => x.xw).length && r.st.eta.live ? r.st.eta.live.find((q) => q.idx === A) : null;
  assert.ok(!lv || lv.tt === 1, '시각표 답에는 tt 표시');
});

// ── 2. 버스가 많이 늦어 06:18 열차를 놓치면 시각표의 다음 열차(06:28) ──
t('버스 8분 지연 + 역 시각표(node.tt): 아라 06:18 → 06:28 한 번만(06:25 · 06:26 · 06:27 같은 "예정 + 늦은 만큼"은 안 나온다) · 뒤 역도 10분씩', () => {
  const r = run({ mode: 'none', busLate: 480, tt: true, dep: 28, end: 40 });
  assert.deepStrictEqual(seq(r, A), ['06:18', '06:28'], seq(r, A).join(' → '));
  assert.deepStrictEqual(seq(r, A + 1), ['06:22', '06:32'], seq(r, A + 1).join(' → '));
  assert.deepStrictEqual(seq(r, A + 3), ['06:27', '06:37'], seq(r, A + 3).join(' → '));
  assert.strictEqual(r.changed.length, 0, r.changed.join(' / '));
});
t('버스 10분 지연 + 시각표 · 위치 ground/live: 아라 06:18 → 06:28 한 번만 · 지난 역 변경 0', () => {
  for (const mode of ['ground', 'live']) {
    const r = run({ mode, busLate: 600, tt: true, dep: 28, end: 44 });
    assert.deepStrictEqual(seq(r, A), ['06:18', '06:28'], mode + ' ' + seq(r, A).join(' → '));
    assert.strictEqual(r.changed.length, 0, mode + ' ' + r.changed.join(' / '));
  }
});
t('아슬아슬한 지연(6분 40초 — 닿는 시각이 열차 출발과 수십 초 차이): 판단이 걸음마다 뒤집히지 않는다(예전 8번 → 많아야 1번)', () => {
  for (const busLate of [380, 400, 420, 440]) {
    const r = run({ mode: 'none', busLate, tt: true, dep: 28, end: 34 }), s = seq(r, A);
    assert.ok(s.length <= 2 && s[0] === '06:18' && (s.length === 1 || s[1] === '06:28'), busLate + '초: ' + s.join(' → '));
  }
});
t('시각표를 못 실은 경로(node.tt 없음)는 예전처럼 늦은 만큼 밀다가 환승역에서 시각표 답(06:28)으로 맞춘다 — 그래도 지난 역 변경 0', () => {
  const r = run({ mode: 'none', busLate: 480, dep: 28, end: 40 }), s = seq(r, A);
  assert.strictEqual(s[0], '06:18'); assert.strictEqual(s[s.length - 1], '06:28', s.join(' → '));
  assert.strictEqual(r.changed.length, 0, r.changed.join(' / '));
});

// ── 3. 탄 뒤: 지난 역은 그대로, 영점은 아직 안 지난 역만 ──
t('열차가 2분 늦게 떠남 · 위치 계속 받음: 아라(지난 역) 06:18 그대로 · 계양은 06:22 → 06:23 → 06:24 로 밀리기만(되돌아가지 않는다) · 지난 역 변경 0', () => {
  const r = run({ mode: 'live', depLate: 120 }), s = seq(r, A + 1);
  assert.deepStrictEqual(seq(r, A), ['06:18']);
  assert.ok(s.length >= 2 && s.every((v, i) => i === 0 || v > s[i - 1]), '계양 ' + s.join(' → '));
  assert.strictEqual(s[s.length - 1], '06:24', '실제 도착(06:24)에 맞는다 ' + s.join(' → '));
  assert.strictEqual(r.changed.length, 0, r.changed.join(' / '));
});
t('열차가 2분 늦게 떠남 · 지상역 근처에서만 위치: 계양이 뒤로 되돌아가지 않는다', () => {
  const r = run({ mode: 'ground', depLate: 120 }), s = seq(r, A + 1);
  assert.ok(s.every((v, i) => i === 0 || v > s[i - 1]), '계양 ' + s.join(' → '));
  assert.strictEqual(r.changed.length, 0, r.changed.join(' / '));
});
t('지하에서 같은 좌표가 새 시각으로 계속 올 때(stale): 이미 지난 버스 정류장 · 아라의 시각을 다시 쓰지 않는다(예전: 아라역3번출구 06:14 → 06:15 → 06:16 → 06:17)', () => {
  const r = run({ mode: 'stale' });
  assert.strictEqual(r.changed.length, 0, r.changed.join(' / '));
  const end = r.rows[r.rows.length - 1];
  assert.strictEqual(end.arr[A], '06:18'); assert.ok(end.arr[5] >= '06:13' && end.arr[5] <= '06:15', '버스 하차 정류장 ' + end.arr[5]);
  const p5 = r.rows.filter((x) => x.from >= A && x.arr).map((x) => x.arr[5]);
  assert.ok(new Set(p5).size === 1, '열차에 탄 뒤 버스 하차 정류장 시각은 하나 ' + Array.from(new Set(p5)).join());
});
t('[탑승]을 눌러도(시각표 답 포함) 아라 06:18 · 계양 06:22 그대로', () => {
  for (const o of [{ mode: 'stale', press: '17:30' }, { mode: 'none', press: '18:40' }, { mode: 'ground', press: '18:10' }, { mode: 'stale', press: '19:30' }]) {
    const r = run(o);
    assert.deepStrictEqual(seq(r, A), ['06:18'], JSON.stringify(o) + ' ' + seq(r, A).join(' → '));
    assert.ok(seq(r, A + 1).every((v) => v === '06:22' || v === '06:21'), JSON.stringify(o) + ' 계양 ' + seq(r, A + 1).join(' → '));
    assert.strictEqual(r.changed.length, 0, r.changed.join(' / '));
  }
});
t('잠근 역(st.fz.m)은 마커가 닿은 역까지 — 한 번 잠근 값은 끝까지 같다 · 아직 안 지난 역은 잠그지 않는다', () => {
  for (const o of [{ mode: 'live', depLate: 120 }, { mode: 'stale' }, { mode: 'ground', busLate: 600, tt: true, dep: 28, end: 44 }]) {
    const conf = {}; let bad = '';      // conf = 통과 증거로 확정(g)된 역의 잠근 값 — 한 번 확정되면 끝까지 같아야 한다
    SC.run(SB.rideStandby, Object.assign({ rec: (req, out) => {
      const fz = out.state.fz, from = out.pos && out.pos.from != null ? out.pos.from : -1, maxP = Math.max.apply(null, out.state.eta.passes.map((p) => p.idx));
      if (!fz) return;
      for (const k of Object.keys(fz.m)) {
        if (+k > Math.max(from, maxP)) bad = bad || ('아직 안 지난 ' + k + '번을 잠갔다(마커 ' + from + ' · 통과 ' + maxP + ')');
        if (out.state.etaMs[+k] !== fz.m[k]) bad = bad || (k + '번 화면 시각이 잠근 값과 다르다');
        if (fz.g && fz.g[k]) { if (conf[k] == null) conf[k] = fz.m[k]; else if (conf[k] !== fz.m[k]) bad = bad || (k + '번 확정 뒤 값이 바뀜'); }
      }
      for (const k of Object.keys(conf)) if (fz.m[k] == null) bad = bad || (k + '번 확정한 잠금이 풀림');
    } }, o));
    assert.strictEqual(bad, '', JSON.stringify(o));
    assert.ok(Object.keys(conf).length >= 6, '확정된 역 ' + Object.keys(conf).join());
  }
});

// ── 4. 엔진 조각 ──
const DAYM = (h, m) => h * 60 + m, at = SC.at;
// 노드: 0 집 · 1~3 버스 정류장(06:01 · 06:06 · 06:11 하차) · 4 아라 06:18 · 5 계양 06:22 · 6 귤현 06:24.   X = 아라
const X = 4, nodes = (tt) => [{ name: '집', isOrigin: true }, { name: '정류장A', isBus: true, lineName: '991', planMin: DAYM(6, 1) }, { name: '정류장M', isBus: true, lineName: '991', planMin: DAYM(6, 6) }, { name: '정류장B', isBus: true, lineName: '991', planMin: DAYM(6, 11) },
  Object.assign({ name: '아라', isSub: true, lineName: '인천1호선', planMin: DAYM(6, 18) }, tt ? { tt } : {}), { name: '계양', isSub: true, lineName: '인천1호선', planMin: DAYM(6, 22) }, { name: '귤현', isSub: true, lineName: '인천1호선', planMin: DAYM(6, 24) }];
const TT = [DAYM(6, 28), DAYM(6, 38), DAYM(6, 48)];
// 버스가 lateMin 분 늦게 정류장 A · M 을 지났다(통과 증거 둘) — 지금은 M 을 막 지난 때
const eta = (lateMin, o) => E.rideEta(Object.assign({ nowMs: at(6, 6, 30) + lateMin * 60000, nodes: nodes(o && o.tt), passes: [{ idx: 1, ms: at(6, 1, 25) + lateMin * 60000, src: 'gps' }, { idx: 2, ms: at(6, 6, 25) + lateMin * 60000, src: 'gps' }], boarded: true, tzOffsetMin: 540 }, o && o.inp));
t('ride-eta: 버스 지연 0 · 3 · 5분 → 아라 06:18 그대로(xfer 0) · 8분 → 시각표 다음 열차 06:28(xfer 1) · 시각표 없으면 닿는 시각(06:20 이후)', () => {
  for (const d of [0, 3, 5]) {
    const r = eta(d, { tt: TT }); assert.deepStrictEqual([r.arr[X], r.arr[X + 1], r.arr[X + 2]], ['06:18', '06:22', '06:24'], d + '분 ' + r.arr.join()); assert.strictEqual(r.xfer[X], 0);
    if (d) assert.ok(r.notes.some((n) => /환승 지하철: 앞 구간이 늦어도 처음 안내한 시각표 열차 그대로/.test(n)) && r.arr[3] > '06:11', '버스 하차 정류장은 늦은 만큼 밀리고, 이유를 notes 에 남긴다 ' + r.arr.join());
  }
  const r8 = eta(8, { tt: TT });
  assert.deepStrictEqual([r8.arr[X], r8.arr[X + 1], r8.arr[X + 2]], ['06:28', '06:32', '06:34'], r8.arr.join()); assert.strictEqual(r8.xfer[X], 1);
  assert.ok(r8.notes.some((n) => /처음 안내한 열차는 놓친다 → 시각표의 다음 열차로/.test(n)), r8.notes.join(' / '));
  assert.strictEqual(r8.etaMs[X] - eta(0, { tt: TT }).etaMs[X], 600000, '정확히 10분 뒤 — 초 자리(:2x)는 같다');
  const r20 = eta(20, { tt: TT }); assert.strictEqual(r20.arr[X], '06:38', '두 대 놓치면 그 다음(06:38) ' + r20.arr.join());
  const n8 = eta(8, {}); assert.ok(n8.arr[X] === '06:26' && n8.arr[X + 1] === '06:30' && n8.xfer[X] === 1, '시각표 없음: 예전처럼 늦은 만큼(06:18 + 8분) — 환승역에서 /board-live 답으로 맞춘다 ' + n8.arr.join());
  const r70 = eta(70, { tt: TT }); assert.ok(r70.arr[X] >= '07:20', '시각표 범위(1시간)를 넘으면 닿는 시각으로 ' + r70.arr.join());
});
t('ride-eta: 판단 붙들기(prevXfer) — 닿는 시각이 출발 ±45초 안에서 오르내리면 직전 판단 그대로', () => {
  const P = eta(0, { tt: TT }).etaMs[X] + E.RIDE_ETA_DEFAULTS.nrtEarlySec * 1000, reachAt = (d) => { const r = eta(d, {}); return r.etaMs[X - 1] + 60000 - P; };      // 승강장에 닿는 시각(버스 하차 + 1분) − 06:18 열차 출발
  let dKeep = null, dNext = null;      // 닿는 시각이 출발보다 0~45초 늦은 지연 · 0~45초 이른 지연을 찾는다
  for (let d = 5; d <= 8; d += 1 / 12) { const x = reachAt(d); if (dNext == null && x > 2000 && x < 43000) dNext = d; if (x < -2000 && x > -43000) dKeep = d; }
  assert.ok(dKeep != null && dNext != null, '시험 조건 ' + dKeep + ' ' + dNext);
  assert.strictEqual(eta(dNext, { tt: TT }).arr[X], '06:28', '기억이 없으면 기준 그대로(놓친다)');
  assert.strictEqual(eta(dNext, { tt: TT, inp: { prevXfer: { 4: 0 } } }).arr[X], '06:18', '직전이 "그대로"였으면 45초 안쪽은 그대로');
  assert.strictEqual(eta(dKeep, { tt: TT }).arr[X], '06:18', '기억이 없으면 기준 그대로(탄다)');
  assert.strictEqual(eta(dKeep, { tt: TT, inp: { prevXfer: { 4: 1 } } }).arr[X], '06:28', '직전이 "다음 열차"였으면 45초 안쪽은 다음 열차 그대로');
  assert.strictEqual(eta(3, { tt: TT, inp: { prevXfer: { 4: 1 } } }).arr[X], '06:18', '확실히 닿으면(2분 넘게 여유) 다시 그 열차');
  assert.strictEqual(eta(8, { tt: TT, inp: { prevXfer: { 4: 0 } } }).arr[X], '06:28', '확실히 놓치면 다음 열차');
});
t('ride-eta: 첫 버스를 기다리는 중(승차 전)에도 버스가 늦는 만큼 지하철을 밀지 않는다 — 5분 늦은 버스 → 아라 06:18 그대로 · 9분 늦으면 06:28', () => {
  const pre = (lateMin, tt) => E.rideEta({ nowMs: at(5, 58), nodes: nodes(tt), passes: [], boarded: false, tzOffsetMin: 540, boardNext: { ms: at(6, 1, 25) + lateMin * 60000, src: 'realboard', allowEarlier: true, maxWaitMin: 30 } });
  const a = pre(5, TT), b = pre(9, TT), c = pre(9, null);
  assert.deepStrictEqual([a.arr[1], a.arr[3], a.arr[X], a.arr[X + 1]], ['06:06', '06:16', '06:18', '06:22'], a.arr.join());
  assert.deepStrictEqual([b.arr[1], b.arr[X], b.arr[X + 1]], ['06:10', '06:28', '06:32'], b.arr.join());
  assert.ok(c.arr[X] >= '06:21' && c.arr[X] <= '06:27', '시각표 없으면 닿는 시각 ' + c.arr.join());
  assert.strictEqual(a.xfer[X], 0); assert.strictEqual(b.xfer[X], 1);
});
t('ride-eta: 서버가 준 다음 차(live)가 그 역에 반영되면 그 값이 우선 · 시각표 답(tt)은 예정 초 자리로 — 같은 열차면 시각이 안 바뀐다', () => {
  const base = eta(3, { tt: TT }), same = eta(3, { tt: TT, inp: { live: [{ idx: X, ms: at(6, 18, 0), tt: 1 }] } }), nxt = eta(3, { tt: TT, inp: { live: [{ idx: X, ms: at(6, 28, 0), tt: 1 }] } }), raw = eta(3, { tt: TT, inp: { live: [{ idx: X, ms: at(6, 19, 30) }] } });
  assert.strictEqual(same.etaMs[X], base.etaMs[X], '같은 열차(06:18) 시각표 답 → 그대로');
  assert.strictEqual(nxt.etaMs[X] - base.etaMs[X], 600000, '다음 열차(06:28) 시각표 답 → 정확히 10분 뒤');
  assert.strictEqual(raw.etaMs[X], at(6, 19, 30) - 7000, '실시간 답은 받은 시각 그대로(초 자리를 옮기지 않는다 — 실시간 없는 노선 7초 당김만)');
  const pre = E.rideEta({ nowMs: at(6, 10), nodes: nodes(null).slice(0, 1).concat(nodes(null).slice(X)), passes: [], boarded: false, tzOffsetMin: 540, boardNext: { ms: at(6, 28, 0), src: 'realboard', tt: 1, allowEarlier: true, maxWaitMin: 30 } });
  assert.strictEqual(pre.arr[1], '06:28'); assert.ok(Math.round(pre.etaMs[1] / 1000) % 60 >= 13 && Math.round(pre.etaMs[1] / 1000) % 60 <= 30, '승차 대기의 시각표 답도 예정 초 자리(7초 당김 포함 :13~:30) ' + (Math.round(pre.etaMs[1] / 1000) % 60));
});
t('ride-eta: 잠근 역(frozen)은 GPS 통과가 다시 쓰여도 · 순서 보정으로도 안 바뀐다 — 뒤 역만 움직인다', () => {
  const ps = (ms3) => [{ idx: 1, ms: at(6, 4, 25), src: 'gps' }, { idx: 2, ms: at(6, 9, 25), src: 'gps' }, { idx: 3, ms: ms3, src: 'gps' }, { idx: X, ms: at(6, 18, 30), src: 'gps' }];
  const inp = (ms3, fz) => ({ nowMs: at(6, 20), nodes: nodes(TT), passes: ps(ms3), boarded: true, tzOffsetMin: 540, frozen: fz });
  const a = E.rideEta(inp(at(6, 14, 0), null)), fz = { 1: a.etaMs[1], 2: a.etaMs[2], 3: a.etaMs[3], 4: a.etaMs[X] };
  assert.deepStrictEqual([a.arr[3], a.arr[X]], ['06:14', '06:18'], a.arr.join());
  const b = E.rideEta(inp(at(6, 17, 40), fz)), c = E.rideEta(inp(at(6, 19, 30), fz));
  assert.deepStrictEqual([b.etaMs[1], b.etaMs[2], b.etaMs[3], b.etaMs[X]], [fz[1], fz[2], fz[3], fz[4]], '하차 정류장 통과가 06:17:40 으로 다시 쓰여도 그대로');
  assert.deepStrictEqual([c.etaMs[1], c.etaMs[2], c.etaMs[3], c.etaMs[X]], [fz[1], fz[2], fz[3], fz[4]], '통과가 아라보다 늦게(06:19:30) 쓰여도 아라는 그대로(순서 보정이 잠근 역을 끌어올리지 않는다)');
  assert.ok(c.etaMs[X + 1] >= c.etaMs[X] && c.arr[X + 1] >= '06:22', '뒤 역은 순서를 지킨다 ' + c.arr.join());
  const noFz = E.rideEta(inp(at(6, 19, 30), null));
  assert.ok(noFz.etaMs[3] !== fz[3] || noFz.etaMs[X] !== fz[4], '잠금이 없으면 예전처럼 따라 바뀐다(잠금이 막는 것을 확인) ' + noFz.arr.join());
});
t('ride-track: "아직 안 닿음"으로 올려 둔 정류장(ny)은 표시 시각이 미래여도 다시 판정한다(45초 뒤 시각표로 되돌아가 오락가락하던 것)', () => {
  const now = at(6, 23, 0), stops = (ny) => [{ i: 6, lat: 37.594118, lng: 126.71301, arrMs: at(6, 18, 22), pass: true }, Object.assign({ i: 7, lat: 37.571769, lng: 126.736319, arrMs: now + 30000, pass: true }, ny ? { ny: true } : {}), { i: 8, lat: 37.566362, lng: 126.742498, arrMs: now + 150000, pass: true, fin: true }];
  const mid = [37.583, 126.7247], q = (ny, p) => TR.rideTrack({ nowMs: now, trail: [[now - 10000, p[0] + 0.0012, p[1] - 0.0012, 15], [now - 5000, p[0] + 0.0006, p[1] - 0.0006, 15], [now, p[0], p[1], 15]], plan: { pts: [], boarded: true, notDeparted: false, stops: stops(ny), subConfirmed: true, progIsBus: false, suppress: ['standby'] }, want: { zero: true } });
  const z = (r) => (r.zero.stops || []).find((s) => s.i === 7);
  assert.ok(!(z(q(false, mid)) || {}).notYet, '표시 없으면 예전 그대로(표시 시각이 미래 → 판정하지 않음)');
  assert.strictEqual((z(q(true, mid)) || {}).notYet, true, '표시가 있으면 아라~계양 사이 · 계양에서 먼 위치 → 아직 안 닿음');
  assert.ok(!(z(q(true, [37.5722, 126.7359])) || {}).notYet, '계양에 다 왔으면(400m 안) 아직 안 닿음이 아니다');
});
// ── 5. s457 굳은 좌표(YJ: "GPS 가 지하철에서 안 흔들려야 해") ──
t('s457 지하에서 같은 좌표가 10분 동안 새 시각으로 계속 와도 마커가 승차역에 붙들리지 않는다 — 시각표대로 계양 06:22 · 귤현 06:24 · 박촌 06:27(예전: 계양 06:22 → … → 06:29 로 밀리다 마커가 4역을 한 번에 건너뜀)', () => {
  for (const o of [{ mode: 'stale', staleSec: 600, end: 30 }, { mode: 'stale', staleSec: 600, staleAcc: 25, end: 30 }, { mode: 'stale', staleSec: 600, press: '18:40', end: 30 }]) {
    const r = run(o);
    assert.deepStrictEqual([seq(r, A), seq(r, A + 1), seq(r, A + 2), seq(r, A + 3)], [['06:18'], ['06:22'], ['06:24'], ['06:27']], JSON.stringify(o) + ' ' + seq(r, A + 1).join(' → '));
    assert.strictEqual(r.changed.length, 0, r.changed.join(' / '));
    const mk = []; for (const row of r.rows) if (row.from >= A && row.from !== mk[mk.length - 1]) mk.push(row.from);
    assert.ok(mk.every((v, i) => i === 0 || v === mk[i - 1] + 1), '마커는 한 역씩 앞으로만 ' + mk.join(' → '));
    const at2410 = r.rows.find((x) => x.ms === SC.at(6, 24, 30)); assert.ok(at2410.from >= A + 2, '06:24:30 에는 귤현 근처(시각표) — 마커 ' + at2410.from);
  }
});
t('s457 ride-track: 굳은 좌표 판정 — 정확도 20m 넘고 30초 이상(4개 이상) 3m 안에 머문 좌표만 뺀다 · 정확도 좋은 GPS · 정확도 모름 · 움직이는 좌표 · 짧은 기록은 그대로 증거', () => {
  const U = SC.unitInputs(), ny = (n, acc, j) => { const z = (TR.rideTrack(U.frozenQ(n, acc, j)).zero.stops || []).find((s) => s.i === 7); return !!(z && z.notYet); };
  assert.strictEqual(ny(12, 60, 0), false, '정확도 60m · 55초 굳음 → 증거 아님');
  assert.strictEqual(ny(12, 25, 0), false, '정확도 25m 도 마찬가지');
  assert.strictEqual(ny(12, 15, 0), true, '정확도 15m(진짜 GPS)는 멈춰 있어도 증거 — 지상에서 열차가 서 있는 경우');
  assert.strictEqual(ny(12, null, 0), true, '정확도를 모르면 예전 그대로');
  assert.strictEqual(ny(3, 60, 0), true, '3개(10초)뿐이면 아직 굳었다고 보지 않는다');
  assert.strictEqual(ny(6, 21, 0), true, '25초면 아직 아니다');
  assert.strictEqual(ny(7, 60, 0), false, '30초를 채우면(7개) 굳은 것으로 본다');
  assert.strictEqual(ny(12, 60, 1), true, '5초마다 5m 씩 움직이는 좌표는 굳은 것이 아니다');
});
console.log('\nride_xfer_tt: ' + pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
