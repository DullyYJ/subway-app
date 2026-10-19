// 앞 화면 하차·환승 알림 시점 엔진(engine/ride-alert.js) 시험 — 2026-10-19 (5번 4단계: 알림)
//   · 알림 대상: 교통 노드 순서 · 노선이 바뀌는 곳의 앞 노드 = 환승 하차역 · 마지막 교통 노드 = 최종 하차 (예전 웹 _buildTransitAlertTargets 와 같다)
//   · 시점: 남은 정거장 2·1(환승·하차)·0(목적지) · 가장 급한 하나만 울리고 나머지는 보낸 것으로 · 이미 보낸 것·사용자가 끈 종류는 제외
//   · 덧말: 그 노드 도착 예정까지 0~240분 · 자정 넘김 · 예정이 없으면 여정 전체 남은 분 · 목적지 도착은 없음 (예전 웹 _fireTransitAlert 와 같다)
//   · 대기 모드(ride-standby)의 규칙과 같은 문구·진동 무늬 · Worker 내장본이 모듈과 같은 판단 · /ride-alert 길
'use strict';
const assert = require('assert');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const M = require(path.join(root, 'engine/ride-alert.js'));
const { rideAlert, raTargets, raHm } = M;
const { rsAlerts } = require(path.join(root, 'engine/ride-standby.js'));
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok  ' + name); } catch (e) { fail++; console.log('  FAIL ' + name + '\n     ' + (e && e.message)); } }

// 신도림(2호선) → 환승 → 서울역(1호선) → 걷기 → 버스 → 도착
const N = [
  { k: 's', l: '2호선', n: '강남' }, { k: 's', l: '2호선', n: '교대' }, { k: 's', l: '2호선', n: '신도림' },
  { k: 's', l: '1호선', n: '신도림' }, { k: 's', l: '1호선', n: '영등포' }, { k: 's', l: '1호선', n: '서울역' },
  { k: null, l: '', n: '걷기' }, { k: 'b', l: '7016', n: '남대문' }, { k: 'b', l: '7016', n: '도착정류장' }
];

t('대상: 교통 노드만 순서(seq)에 · 노선이 바뀌는 곳의 앞 노드는 환승 · 마지막 교통 노드는 최종 하차', () => {
  const r = raTargets(N);
  assert.deepStrictEqual(r.seq, [0, 1, 2, 3, 4, 5, 7, 8]);
  assert.deepStrictEqual(r.targets, [
    { seqPos: 2, nodeIdx: 2, name: '신도림', kind: 'transfer', nextLine: '1호선' },
    { seqPos: 5, nodeIdx: 5, name: '서울역', kind: 'transfer', nextLine: '7016' },
    { seqPos: 7, nodeIdx: 8, name: '도착정류장', kind: 'dest' }
  ]);
});
t('대상: 한 노선뿐이면 최종 하차만 · 교통 노드가 없으면 아무것도 없다 · 엉뚱한 입력에도 죽지 않는다', () => {
  assert.deepStrictEqual(raTargets([{ k: 's', l: 'A', n: 'x' }, { k: 's', l: 'A', n: 'y' }]).targets, [{ seqPos: 1, nodeIdx: 1, name: 'y', kind: 'dest' }]);
  assert.deepStrictEqual(raTargets([{ k: null }, { k: null }]), { targets: [], seq: [] });
  raTargets(); raTargets(null); raTargets([null, 5, {}, { k: 's' }]); raTargets('x');
});
t('시점: 환승역 2정거장 전 → 1정거장 전 → 목적지 2·1·0 순서로 하나씩, 문구·진동은 대기 모드와 같다', () => {
  const fired = {}, seen = [];
  for (let c = 0; c <= 8; c++) {
    const r = rideAlert({ nodes: N, curIdx: c, fired, allowed: {} });
    if (r.alert) { seen.push([c, r.alert.type, r.alert.title]); fired[r.alert.key] = 1; r.extra.forEach(k => { fired[k] = 1; }); }
  }
  assert.deepStrictEqual(seen.map(x => x[0] + ':' + x[1]), ['0:transfer2', '1:transfer', '3:transfer2', '4:transfer', '5:near_arrive2', '7:near_arrive', '8:arrive']);
  assert.strictEqual(seen[0][2], '환승 2정거장 전'); assert.strictEqual(seen[1][2], '환승 준비'); assert.strictEqual(seen[6][2], '목적지 도착');
});
t('시점: 같은 입력이면 대기 모드(rsAlerts)와 문구·진동·키가 같다(규칙은 한 곳)', () => {
  const tg = raTargets(N);
  for (let c = 0; c <= 8; c++) {
    const a = rideAlert({ nodes: N, curIdx: c, fired: {}, allowed: {} });
    const b = rsAlerts({ targets: tg.targets, seq: tg.seq, allowed: {} }, {}, c, null, 0, function () { return ''; });
    assert.deepStrictEqual(a.alert, b.alert, 'curIdx ' + c); assert.deepStrictEqual(a.extra, b.extra);
  }
});
t('시점: 환승역과 목적지가 같은 순간에 걸리면 가장 급한(남은 정거장이 적은) 하나만 · 나머지는 extra 로 보낸 것 처리', () => {
  const nodes = [{ k: 's', l: 'A', n: 'a' }, { k: 's', l: 'A', n: 'b' }, { k: 's', l: 'A', n: 'c' }, { k: 's', l: 'B', n: 'c' }, { k: 's', l: 'B', n: 'd' }];
  // seq 0..4 · 환승(c, seqPos2) · 목적지(d, seqPos4). curIdx 2 → 환승 remain0(대상 아님), 목적지 remain 2
  const r = rideAlert({ nodes, curIdx: 2, fired: {}, allowed: {} });
  assert.strictEqual(r.alert.type, 'near_arrive2');
  const nodes2 = [{ k: 's', l: 'A', n: 'a' }, { k: 's', l: 'A', n: 'b' }, { k: 's', l: 'B', n: 'b' }, { k: 's', l: 'B', n: 'c' }];
  // 환승(b, seqPos1) · 목적지(c, seqPos3). curIdx 1 → 환승 remain0 아님 / 목적지 remain 2 · curIdx 2 → 환승 없음(지남)
  const r2 = rideAlert({ nodes: nodes2, curIdx: 1, fired: {}, allowed: {} });
  assert.strictEqual(r2.alert.type, 'near_arrive2');
  const nodes3 = [{ k: 's', l: 'A', n: 'a' }, { k: 's', l: 'A', n: 'b' }, { k: 's', l: 'B', n: 'b' }, { k: 's', l: 'B', n: 'c' }, { k: 's', l: 'B', n: 'd' }];
  // 환승(b, seqPos1) · 목적지(d, seqPos4): curIdx 0 → 환승 remain 1 · 목적지 remain 4(없음)
  const r3 = rideAlert({ nodes: nodes3, curIdx: 0, fired: {}, allowed: {} });
  assert.strictEqual(r3.alert.type, 'transfer');
  const tgs = { targets: [{ seqPos: 3, nodeIdx: 3, name: 'X', kind: 'transfer', nextLine: 'B' }, { seqPos: 4, nodeIdx: 4, name: 'Y', kind: 'dest' }], seq: [0, 1, 2, 3, 4] };
  const r4 = rideAlert({ cfg: tgs, curIdx: 2, fired: {}, allowed: {} });   // 환승 remain 1(transfer), 목적지 remain 2 → 급한 것 = 환승
  assert.strictEqual(r4.alert.type, 'transfer'); assert.deepStrictEqual(r4.extra, ['4_2']);
});
t('시점: 이미 보낸 것은 다시 울리지 않고, 사용자가 끈 종류(false)는 걸러진다 · 끄지 않은 종류는 그대로', () => {
  let r = rideAlert({ nodes: N, curIdx: 0, fired: {}, allowed: {} }); assert.strictEqual(r.alert.type, 'transfer2');
  r = rideAlert({ nodes: N, curIdx: 0, fired: { '2_2': 1 }, allowed: {} }); assert.strictEqual(r.alert, null);
  r = rideAlert({ nodes: N, curIdx: 0, fired: {}, allowed: { transfer2: false } }); assert.strictEqual(r.alert, null);
  r = rideAlert({ nodes: N, curIdx: 0, fired: {}, allowed: { arrive: false, near_arrive: false } }); assert.strictEqual(r.alert.type, 'transfer2');
  r = rideAlert({ nodes: N, curIdx: 8, fired: {}, allowed: { arrive: false } }); assert.strictEqual(r.alert, null);
});
t('시점: 아직 첫 교통 노드에 닿기 전(curIdx<0)이거나 대상이 없으면 알림 없음', () => {
  assert.strictEqual(rideAlert({ nodes: N, curIdx: -1, fired: {}, allowed: {} }).alert, null);
  assert.strictEqual(rideAlert({ nodes: [], curIdx: 3 }).alert, null);
  assert.strictEqual(rideAlert({ nodes: N, curIdx: 'abc' }).alert, null);
});
t('덧말: 그 노드 도착 예정까지 남은 분(0~240분 안일 때만) · 가까운 정거장은 1분 이상으로 올림 처리', () => {
  const r = rideAlert({ nodes: N, curIdx: 0, fired: {}, allowed: {}, nowMin: 8 * 60 + 29.5, eta: { 2: '08:34' } });
  assert.ok(/ \(약 5분 후\)$/.test(r.alert.body), r.alert.body);
  const r1 = rideAlert({ nodes: N, curIdx: 0, fired: {}, allowed: {}, nowMin: 8 * 60 + 34, eta: { 2: '08:34' } });
  assert.ok(/ \(약 1분 후\)$/.test(r1.alert.body), r1.alert.body);
  const r2 = rideAlert({ nodes: N, curIdx: 0, fired: {}, allowed: {}, nowMin: 8 * 60, eta: { 2: '13:00' } });   // 300분 뒤: 범위 밖 → 덧말 없음(여정 남은 분으로도 안 넘어간다)
  assert.ok(!/\(약/.test(r2.alert.body), r2.alert.body);
  const r2b = rideAlert({ nodes: N, curIdx: 0, fired: {}, allowed: {}, nowMin: 8 * 60, eta: { 2: '13:00' }, jr: 33 });
  assert.ok(!/\(약/.test(r2b.alert.body), r2b.alert.body);
});
t('덧말: 자정을 넘기는 예정(23:58 → 00:03)도 5분 후로 · 이미 지난 예정(음수)은 덧말 없음', () => {
  const r = rideAlert({ nodes: N, curIdx: 0, fired: {}, allowed: {}, nowMin: 23 * 60 + 58, eta: { 2: '00:03' } });
  assert.ok(/\(약 5분 후\)$/.test(r.alert.body), r.alert.body);
  const r2 = rideAlert({ nodes: N, curIdx: 0, fired: {}, allowed: {}, nowMin: 9 * 60, eta: { 2: '08:50' } });
  assert.ok(!/\(약/.test(r2.alert.body), r2.alert.body);
});
t('덧말: 노드 도착 예정이 없으면 여정 전체 남은 분(jr) · 둘 다 없으면 덧말 없음 · 목적지 도착(남은 0)은 덧말 없음', () => {
  const r = rideAlert({ nodes: N, curIdx: 0, fired: {}, allowed: {}, nowMin: 600, jr: 17 });
  assert.ok(/ \(약 17분 후\)$/.test(r.alert.body), r.alert.body);
  const r2 = rideAlert({ nodes: N, curIdx: 0, fired: {}, allowed: {}, nowMin: 600 });
  assert.ok(!/\(약/.test(r2.alert.body));
  const r3 = rideAlert({ nodes: N, curIdx: 8, fired: {}, allowed: {}, nowMin: 600, jr: 5, eta: { 8: '10:05' } });
  assert.strictEqual(r3.alert.title, '목적지 도착'); assert.ok(!/\(약/.test(r3.alert.body));
  const r4 = rideAlert({ nodes: N, curIdx: 0, fired: {}, allowed: {}, nowMin: 600, eta: { 2: 'xx' }, jr: 9 });
  assert.ok(/ \(약 9분 후\)$/.test(r4.alert.body), '읽을 수 없는 예정은 없는 것으로: ' + r4.alert.body);
});
t('HH:MM 읽기: 한 자리 시·앞뒤 글자·잘못된 글자', () => {
  assert.strictEqual(raHm('8:05'), 485); assert.strictEqual(raHm('오전 08:05 도착'), 485); assert.strictEqual(raHm('23:59'), 1439);
  assert.strictEqual(raHm(''), null); assert.strictEqual(raHm(null), null); assert.strictEqual(raHm(830), null); assert.strictEqual(raHm('abc'), null);
});
t('입력이 비어도·엉뚱해도 죽지 않는다', () => {
  rideAlert(); rideAlert(null); rideAlert({}); rideAlert({ nodes: 5, cfg: 7, fired: 'x', allowed: [], eta: 3, jr: 'a' }); rideAlert({ cfg: { targets: 'x', seq: 3 }, curIdx: 2 });
  const r = rideAlert({}); assert.strictEqual(r.alert, null); assert.strictEqual(r.v, 1);
});

// ── Worker 내장본 ──
const W = fs.readFileSync(path.join(root, 'engine/route-v2-worker.ascii.js'), 'utf8');
t('Worker 에 모듈 구간이 정확히 한 곳 내장돼 있다', () => {
  assert.strictEqual(W.split('// ===== ride-alert (').length, 2);
  assert.strictEqual(W.split('// ===== ride-alert \\ub05d =====').length, 2);
});
t('Worker 내장 본문이 모듈과 같은 판단을 한다(끝에서 끝까지 · 대기 모드 rsAlerts 와 한 범위로)', () => {
  const a = W.indexOf('// ===== ride-alert (');
  const s = W.indexOf('\n', a) + 1, e = W.indexOf('// ===== ride-alert \\ub05d');
  const body = W.slice(s, e);
  assert.ok(!/[^\x00-\x7f]/.test(body), 'ASCII 만');
  const sa = W.indexOf('// ===== ride-standby ('), se = W.indexOf('// ===== ride-standby \\ub05d');
  const rs = W.slice(W.indexOf('\n', sa) + 1, se);
  const f = new Function(rs + '\n' + body + '\nreturn { rideAlert: rideAlert, raTargets: raTargets, raHm: raHm };')();
  const inputs = [
    { nodes: N, curIdx: 0, fired: {}, allowed: {} }, { nodes: N, curIdx: 2, fired: { '2_2': 1 }, allowed: { transfer: false } },
    { nodes: N, curIdx: 8, fired: {}, allowed: {} }, { nodes: N, curIdx: 0, fired: {}, allowed: {}, nowMin: 23 * 60 + 58, eta: { 2: '00:03' } },
    { nodes: N, curIdx: 1, fired: {}, allowed: {}, nowMin: 600, jr: 12 }, {}, { cfg: { targets: [{ seqPos: 3, nodeIdx: 3, name: 'X', kind: 'transfer' }], seq: [0, 1, 2, 3] }, curIdx: 2 }
  ];
  inputs.forEach(i => assert.deepStrictEqual(f.rideAlert(i), rideAlert(i), JSON.stringify(i).slice(0, 80)));
  assert.deepStrictEqual(f.raTargets(N), raTargets(N)); assert.strictEqual(f.raHm('8:05'), 485);
});
t('Worker 길: /ride-alert(POST · 크기 제한 · 잘못된 JSON 400)', () => {
  assert.ok(/url\.pathname === "\/ride-alert"\) return handleRideAlert\(request\)/.test(W), '/ride-alert 길');
  const i = W.indexOf('function handleRideAlert(');
  assert.ok(i > 0, 'handleRideAlert');
  const seg = W.slice(i, i + 2200);
  assert.ok(/rideAlert\(body\)/.test(seg) && /status: 413/.test(seg) && /bad-json/.test(seg) && /POST only/.test(seg), '크기·JSON·메서드 검사');
});

console.log(pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
