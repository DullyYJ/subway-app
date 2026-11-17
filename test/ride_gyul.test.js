// s460 (YJ 2026-11-17: "귤현에 도착했는데 계양 도착이라 뜨고 알람이 잘못 왔어. 영점조절이 제대로 되면 시간이 당겨지거나 늦춰지기에 이렇게 틀리면 안 돼 — 이 앱의 가장 중요한 건 정확도")
//   인천1호선(실시간 없는 노선) 계산→임학→박촌→귤현→계양→아라 · 열차가 박촌 뒤부터 0~4분 늦게 달릴 때 마커와 '목적지 2정거장 전 · 곧 하차 · 목적지 도착' 알림이 실제 도착 시각과 맞는가.
//   원인 둘: ① 열차가 400m 안까지 오면 '아직 안 닿음' 판정이 끊겨 시각표로 돌아가 마커가 앞 역으로 튀었다 ② 지하에서 GPS 가 드문드문이면 앵커(마지막 통과 증거)가 한참 뒤라 귤현의 '아직 안 닿음'이 무시됐다.
// 실행: node test/ride_gyul.test.js
'use strict';
const assert = require('assert'), path = require('path');
const SB = require(path.join(__dirname, '..', 'engine', 'ride-standby.js'));
const G = require(path.join(__dirname, 'helpers', 'gyul_scenario.js'));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e && e.message).split('\n').slice(0, 4).join('\n       ')); } };
const run = (mode, delaySec, o) => G.run(SB.rideStandby, Object.assign({ mode, delaySec, end: 34 }, o || {}));
const alertAt = (r, key) => { const a = r.alerts.find((x) => x.key === key); return a ? a.ms : null; };
const KEYS = [['6_2', 3], ['6_1', 4], ['6_0', 5]];      // 목적지 2정거장 전 = 귤현(3) 도착 · 곧 하차 = 계양(4) 도착 · 목적지 도착 = 아라(5) 도착(SUB 번호)

// 1) 위치가 열차를 따라 잘 잡히면 — 늦은 정도와 관계없이 알림이 실제 도착 시각 −20초 ~ +30초 안에, 한 번씩, 차례대로
for (const d of [0, 60, 120, 180, 240]) {
  t('위치 live · 열차 ' + d + '초 늦음: 알림 3개가 실제 도착 −20초~+30초 안에 한 번씩(2정거장 전 → 곧 하차 → 도착)', () => {
    const r = run('live', d);
    assert.strictEqual(r.alerts.length, 3, '알림 개수 ' + r.alerts.map((a) => a.t + ' ' + a.key).join(' | '));
    let prev = 0;
    for (const [key, si] of KEYS) {
      const ms = alertAt(r, key); assert.ok(ms != null, key + ' 알림이 없다');
      const off = Math.round((ms - r.real[si]) / 1000);
      assert.ok(off >= -20 && off <= 30, key + ' 알림이 실제 도착 대비 ' + off + '초(' + r.alerts.map((a) => a.t + ' ' + a.key).join(' | ') + ')');
      assert.ok(ms > prev, key + ' 순서'); prev = ms;
    }
  });
}
// 2) 마커 — 열차가 아직 귤현에 안 닿았는데 마커가 귤현·계양으로 앞서 가지 않는다(예전: 2분 늦으면 귤현 도착 2분 전에 마커가 계양→아라까지 감)
for (const d of [60, 120, 180, 240]) {
  t('위치 live · 열차 ' + d + '초 늦음: 마커가 실제 귤현 도착(−30초) 전에는 귤현에 닿지 않고, 계양 도착(−30초) 전에는 계양에 닿지 않는다(영점 반경 150m = 서행 25초 앞까지는 도착으로 본다)', () => {
    const r = run('live', d);
    for (const s of r.steps) {
      if (s.ms < r.real[3] - 30000) assert.ok(s.from < 4, s.t + ' 마커 ' + s.from + '→' + s.to + ' (열차는 아직 귤현 전)');
      if (s.ms < r.real[4] - 30000) assert.ok(s.from < 5, s.t + ' 마커 ' + s.from + '→' + s.to + ' (열차는 아직 계양 전)');
    }
  });
}
// 3) 지상 구간에서만 위치가 잡히는 경우(인천1호선 실제) — 위치가 처음 잡힌 뒤로는 마커가 시각표 위치에서 열차 쪽으로 돌아오고 '곧 하차'가 일찍 울리지 않는다
for (const d of [60, 120]) {
  t('위치 ground · 열차 ' + d + '초 늦음: 곧 하차 · 도착 알림이 실제 도착 −20초~+30초 안 · 마커는 열차 도착 전까지 귤현 앞', () => {
    const r = run('ground', d);
    for (const [key, si] of KEYS.slice(1)) { const off = Math.round((alertAt(r, key) - r.real[si]) / 1000); assert.ok(off >= -20 && off <= 30, key + ' 알림이 실제 도착 대비 ' + off + '초(' + r.alerts.map((a) => a.t + ' ' + a.key).join(' | ') + ')'); }
    const first = r.real[3] - (r.real[3] - (G.at(18, 21, 0))) * 0.45 + 20000;      // 박촌→귤현 55% 지점 + 20초 — 위치가 잡히기 시작한 뒤
    for (const s of r.steps) if (s.ms >= first && s.ms < r.real[3] - 30000) assert.strictEqual(s.from, 3, s.t + ' 마커가 귤현 앞(박촌→귤현)에 있어야 한다 ' + s.from + '→' + s.to);
  });
}
// 4) 제때 달리는 열차는 예전과 같다(새 규칙이 일찍·늦게 울리게 만들지 않는다)
t('위치 live · 제때: 알림이 실제 도착 −20초~+10초 · 도착 시각 표시가 오락가락하지 않는다', () => {
  const r = run('live', 0);
  for (const [key, si] of KEYS) { const off = Math.round((alertAt(r, key) - r.real[si]) / 1000); assert.ok(off >= -20 && off <= 10, key + ' ' + off + '초'); }
  for (let i = 4; i <= 6; i++) {      // 노드 4 귤현 · 5 계양 · 6 아라 — 도착하기 전 화면 시각
    const seq = []; for (const s of r.steps) { if (s.ms >= r.real[i - 1]) break; const v = s.arr ? s.arr[i] : null; if (v != null && v !== seq[seq.length - 1]) seq.push(v); }
    assert.ok(seq.length <= 2, G.NAMES[i] + ' 화면 시각이 오락가락: ' + seq.join(' → '));
  }
});
// 5) 위치가 전혀 없으면 시각표대로(알 수 없는 것은 알 수 없다) — 예전과 같은 동작
t('위치 없음: 알림이 시각표 도착 시각(귤현 18:23 · 계양 18:24 · 아라 18:28)에 맞춰 나간다 — 늦은 열차를 알 수 없다', () => {
  const r = run('none', 120);
  [['6_2', 18 * 60 + 23], ['6_1', 18 * 60 + 24], ['6_0', 18 * 60 + 28]].forEach(([key, m]) => { const off = Math.round((alertAt(r, key) - (G.DAY + m * 60000)) / 1000); assert.ok(off >= -20 && off <= 5, key + ' 시각표 대비 ' + off + '초'); });
});
// 6) 판정 한 걸음: '아직 안 닿음'이 앵커(마지막 통과) 뒤 첫 역이 아니어도 가장 앞 '아직' 역부터 올린다 — ride-eta
t('ride-eta: 앵커가 임학인데 귤현이 \'아직 안 닿음\'이면 귤현을 지금+30초로 올리고 뒤를 민다(예전: 임학만 보고 무시)', () => {
  const E = require(path.join(__dirname, '..', 'engine', 'ride-eta.js')), st = G.mkState();
  const now = G.at(18, 23, 20), r = E.rideEta({ nodes: st.eta.nodes, passes: [{ idx: 2, ms: G.at(18, 19, 0), src: 'gps' }], boarded: true, nowMs: now, tzOffsetMin: 540, timetableFirst: true, notYet: [4] });
  const ms = r.etaMs || r.ms || [];
  assert.ok(Array.isArray(ms) && ms.length, '결과 형태 ' + Object.keys(r).join());
  assert.ok(ms[4] >= now + 15000 && ms[4] <= now + 45000, '귤현 ' + G.hms(ms[4]) + '(지금 ' + G.hms(now) + ' + 30초 − 도착 당김 7초 안팎)');
  assert.ok(ms[5] > ms[4] && ms[6] > ms[5], '뒤 역도 민다');
});
console.log('\nride_gyul: pass ' + pass + ' fail ' + fail);
process.exit(fail ? 1 : 0);
