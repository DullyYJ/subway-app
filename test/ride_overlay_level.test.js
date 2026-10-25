// 오버레이 하이라이트 단계 · 환승 칸 대기 · 진동 신호 시험 (s198) — 웹 _ovlAlertLevelRaw · _ovlXferCell · _ovlLines 의 규칙을 엔진(ride-standby)이 그대로 따른다
// 실행: node test/ride_overlay_level.test.js
'use strict';
const assert = require('assert');
const path = require('path');
const { rideStandby } = require(path.join(__dirname, '..', 'engine', 'ride-standby.js'));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e && e.message).split('\n')[0]); } };
const DAY = Date.parse('2026-10-13T00:00:00+09:00');
const at = (h, m, s) => DAY + ((h * 60 + m) * 60 + (s || 0)) * 1000;
const LAT = 37.5, LNG0 = 126.9, DL = 0.0137;
// 노드 1~3 = 1호선(S0..S2), 노드 4~6 = 2호선(T0..T2). 3 에서 내려 4 에서 갈아탄다. 칸 사이 3 뒤에 환승 걷기 칸(map -1). 계획: 노드 n = 12:50 + 2(n-1)분 (+3 환승 걷기).
function mk(allowed) {
  const nd = [{ name: '출발', isOrigin: true }], PL = [null], cells = [], map = [], stops = [], seq = [];
  for (let i = 1; i <= 6; i++) {
    const a = i <= 3; PL[i] = 12 * 60 + 50 + 2 * (i - 1) + (a ? 0 : 3);
    nd.push({ name: (a ? 'S' : 'T') + (a ? i - 1 : i - 4), isSub: true, lineName: a ? '1호선' : '2호선', planMin: PL[i] });
    cells.push({ n: nd[i].name, t: '--:--', dc: a ? '#336699' : '#00a84d', dk: 1, m: nd[i].name + '(이동중)' }); map.push(i);
    if (i === 3) { cells.push({ n: '환승 도보', t: '', dk: 3, dc: '#888' }); map.push(-1); }
    stops.push({ i: i, lat: LAT, lng: LNG0 + DL * (i - 1), arrMs: DAY + PL[i] * 60000, pass: true, fin: i === 6 }); seq.push(i);
  }
  return { v: 1, tripSig: 'X1', eta: { nodes: nd, passes: [{ idx: 1, ms: at(12, 50, 0), src: 'gps' }], boarded: true, notDeparted: false, timetableFirst: true, tzOffsetMin: 540 },
    stops: stops, trail: [], cfg: { targets: [{ seqPos: 2, nodeIdx: 3, name: 'S2', kind: 'transfer', nextLine: '2호선' }, { seqPos: 5, nodeIdx: 6, name: 'T2', kind: 'dest' }], seq: seq, allowed: allowed || {}, destName: 'T2' }, fired: {},
    ovl: { cells: cells, map: map, base: 0, theme: { bg: '#fff', fg: '#111', sub: '#888' } } };
}
const hm = ms => new Date(ms + 9 * 3600e3).toISOString().slice(11, 16);
function run(allowed, pressAt) {
  let st = mk(allowed); const rows = [];
  for (let ms = at(12, 50, 10); ms <= at(13, 5, 0); ms += 5000) {
    const r = rideStandby({ nowMs: ms, fixes: [], state: JSON.parse(JSON.stringify(st)), act: pressAt && ms >= pressAt && ms < pressAt + 5000 ? 'press' : undefined }); st = r.state;
    if (r.overlay && r.overlay.active) rows.push({ ms: ms, o: r.overlay, st: st });
  }
  return rows;
}
const rows = run({}, at(12, 58, 0)); if (process.env.DBG) rows.forEach(r => console.log(hm(r.ms), r.o.alert, r.o.getoff.on, !!r.o.xfer, r.o.rs.st));
const seq = (f) => rows.map(f).filter((x, i, a) => i === 0 || x !== a[i - 1]);

t('환승역: 2정거장 전은 알리지 않고(환승은 1정거장 전부터), 래치가 켜진 단계는 내린 뒤 걷는 동안·환승 대기 동안 이어진다', () => {
  const lv = seq(r => r.o.alert);
  assert.deepStrictEqual(lv, [0, 1, 2, 1, 0], '단계 순서: ' + lv.join(','));      // 0(타는 중) → 1(환승역 1정거장 전·유지) → 2(둘째 구간 목적지 2정거장 전) → 1 → 0(도착)
  const first1 = rows.find(r => r.o.alert === 1), board = rows.find(r => r.st.eta.passes.some(p => p.idx === 4));
  assert.ok(first1 && board && first1.ms < board.ms);
  const between = rows.filter(r => r.ms >= first1.ms && r.ms < board.ms);
  assert.ok(between.length > 20 && between.every(r => r.o.alert === 1), '환승역 도착 전부터 승차 확인까지 계속 1');
  assert.ok(between.some(r => r.st.xw), '환승 대기 중에도 유지');
});
t('환승 하이라이트는 환승 알림 설정(transfer)을 따라 진동하고, 최종 구간은 도착 알림 설정(near_arrive)을 따른다', () => {
  const v = (a, pred) => run(a, at(12, 58, 0)).filter(pred).map(r => r.o.alertVibe);
  const isTr = r => r.o.alert === 1 && r.ms < at(12, 58, 0), isFin = r => r.o.alert > 0 && r.ms > at(12, 59, 30);
  assert.ok(v({}, isTr).every(x => x === true) && v({}, isFin).every(x => x === true));
  assert.ok(v({ transfer: false }, isTr).every(x => x === false) && v({ transfer: false }, isFin).every(x => x === true), '환승 알림만 끄면 환승 진동만 꺼진다');
  assert.ok(v({ near_arrive: false }, isFin).every(x => x === false) && v({ near_arrive: false }, isTr).every(x => x === true));
  assert.ok(rows.filter(r => r.o.alert === 0).every(r => r.o.alertVibe === false), '단계가 꺼져 있으면 진동 신호도 없다');
});
t('alertAt 은 단계가 새로 켜지거나 바뀔 때만 갱신된다(오버레이가 이 시각이 새로울 때 한 번 진동)', () => {
  const ats = seq(r => r.o.alertAt).filter(x => x > 0);
  assert.strictEqual(ats.length, 3, '환승 1 → 최종 2 → 최종 1: ' + ats.length);
  assert.ok(ats[0] < ats[1] && ats[1] < ats[2]);
});
t('환승 탑승 시트가 떠 있는 동안 현위치 칸은 환승 걷기 칸에서 대기하고(xfer) 움직임 표시는 꺼진다', () => {
  const xr = rows.filter(r => r.o.xfer);
  assert.ok(xr.length >= 1, '환승 대기 칸 ' + xr.length);
  xr.forEach(r => { assert.strictEqual(r.o.cur, 3, '환승 걷기 칸(셋째 역 뒤)'); assert.strictEqual(r.o.moving, false); assert.strictEqual(r.o.pill, ''); assert.ok(r.o.rs.st === 'board' || r.o.rs.st === 'wait'); });
  assert.ok(rows.filter(r => !r.o.xfer && r.o.rs.st !== 'board').every(r => r.o.cur !== 3), '시트가 없으면 걷기 칸에 서지 않는다');
});
t('환승 승차를 누르면 래치가 풀리고 새 구간에서 다시 계산한다(둘째 구간 목적지 2정거장 전 = 2)', () => {
  const pr = rows.find(r => r.st.eta.passes.some(p => p.idx === 4));
  const after = rows.filter(r => r.ms > pr.ms && r.o.alert > 0);
  assert.ok(after.length && after[0].o.alert === 2 && !after[0].st.ovlLatch.fin === false, '풀린 뒤 첫 단계 ' + after[0].o.alert);
  assert.strictEqual(after[0].st.ovlLatch.a, 6);
});
t('내릴 준비 줄(getoff)은 마지막 구간 한 정거장 전에만 — 환승역 한 정거장 전에는 안 나온다', () => {
  assert.ok(rows.filter(r => r.o.getoff.on).every(r => r.ms > at(12, 59, 0)), '환승역에서는 안 나온다');
  assert.ok(rows.filter(r => r.o.alert === 1 && r.ms > at(12, 59, 0)).every(r => r.o.getoff.on), '마지막 구간 한 정거장 전에는 계속 나온다');
  assert.ok(rows.some(r => r.o.getoff.on));
  assert.ok(rows.filter(r => r.o.alert === 1 && r.ms < at(12, 58, 0)).every(r => !r.o.getoff.on));
});
t('승차 대기(st.wait) 중에는 단계가 켜지지 않는다', () => {
  const s = mk(); s.wait = { i: 1, arrMs: at(12, 50, 0) };
  const r = rideStandby({ nowMs: at(12, 52, 30), fixes: [], state: s });
  assert.strictEqual(r.overlay.alert, 0);
});
console.log('ride_overlay_level: pass', pass, 'fail', fail); process.exit(fail ? 1 : 0);
