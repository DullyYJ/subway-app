// 도착전(하차·환승) 알림 규칙 무작위 대량 시험 — engine/ride-alert.js · engine/ride-standby.js(rsAlerts)
//   · 무작위 경로(구간 길이·노선 바뀜·걷기 노드·한 정거장짜리 구간·같은 노선 이어짐) × 진행 방식(한 칸씩 · 건너뛰기 · 제자리 · 가끔 뒷걸음) × 끈 알림 32가지 조합
//   · 성질: ① 같은 키가 두 번 울리지 않는다 ② 알림은 '지금 남은 정거장'과 키가 맞고 종류·제목·진동이 규칙대로다 ③ 한 번에 하나만 울린다(extra 는 alert 와 다르고, 지금 걸린 키뿐)
//          ④ 한 칸씩 가면 켜진 알림은 빠짐없이 '울렸거나 같은 순간의 더 급한 것에 묻혔다' ⑤ 끈 종류는 울리지도 묻히지도 않는다 ⑥ 건너뛰면 지난 알림은 늦게 울리지 않는다
//          ⑦ 문구에 역 이름·환승 노선이 들어간다 ⑧ 엉뚱한 입력(null · 빈 배열 · 이상한 curIdx)에 죽지 않는다
// 실행: node test/s471_alert_fuzz.test.js
'use strict';
const assert = require('assert');
const path = require('path');
const { rideAlert, raTargets } = require(path.join(__dirname, '..', 'engine', 'ride-alert.js'));
const { rsAlerts } = require(path.join(__dirname, '..', 'engine', 'ride-standby.js'));
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e && e.message).split('\n').slice(0, 3).join(' | ')); } };

let seed = 20261121;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// 무작위 경로: 구간(지하철 s · 버스 b)마다 1~8 개 노드, 구간 사이에 걷기 노드(k:null)가 끼기도 한다. 같은 노선 이름이 이어질 수도 있다(환승이 아니다).
function mkRoute() {
  const nodes = [{ k: null, l: '', n: '출발' }]; let n = 0;
  const legs = ri(1, 5), lines = ['1호선', '2호선', '3호선', '신분당선', '7016', '472', '9호선'];
  let prevLine = null;
  for (let g = 0; g < legs; g++) {
    const k = rnd() < 0.7 ? 's' : 'b';
    let ln = lines[ri(0, lines.length - 1)];
    if (rnd() < 0.15 && prevLine) ln = prevLine;
    prevLine = ln;
    const len = rnd() < 0.3 ? ri(1, 2) : ri(2, 8);
    for (let i = 0; i < len; i++) nodes.push({ k: k, l: ln, n: '역' + (++n) });
    if (rnd() < 0.5) nodes.push({ k: null, l: '', n: '걷기' + g });
  }
  return nodes;
}
const TYPES = ['transfer2', 'transfer', 'near_arrive2', 'near_arrive', 'arrive'];
const typeOf = (tg, R) => tg.kind === 'transfer' ? (R === 2 ? 'transfer2' : 'transfer') : (R === 2 ? 'near_arrive2' : (R === 1 ? 'near_arrive' : 'arrive'));
// 알림이 켜져야 하는 (대상, 남은) — 규칙: 남은 2·1(환승·하차) · 0(목적지만) · 그 노드를 지났을 때(seqPos-R >= 0)
function dueAt(tg, R, curPos) { return tg.seqPos - curPos === R && (R === 2 || R === 1 || (R === 0 && tg.kind === 'dest')); }
const TITLE = { transfer2: '환승 2정거장 전', transfer: '환승 준비', near_arrive2: '목적지 2정거장 전', near_arrive: '곧 하차', arrive: '목적지 도착' };

// 한 여정 돌려 보기: steps = 호출마다의 curIdx 목록. 엔진처럼 alert.key 와 extra 를 fired 에 넣는다.
function drive(nodes, steps, allowed) {
  const tg = raTargets(nodes), fired = {}, alerts = [], log = [];
  steps.forEach((c, si) => {
    const r = rideAlert({ nodes: nodes, allowed: allowed, fired: fired, curIdx: c, nowMin: 600, eta: {}, jr: 20 });
    // 엔진(rideStandby)이 하는 것: 알림과 extra 를 보낸 것으로 기록
    if (r.alert) { assert.ok(!fired[r.alert.key], '이미 보낸 키가 또 울림 ' + r.alert.key); fired[r.alert.key] = 1; alerts.push({ si: si, c: c, a: r.alert, curPos: r.curPos }); }
    (r.extra || []).forEach(k => {
      assert.ok(!fired[k], 'extra 가 이미 보낸 키 ' + k); fired[k] = 1;
      assert.ok(r.alert && r.alert.key !== k, 'extra 에 알림 자신이 들어 있다');
      // 울리는 것은 같은 순간 걸린 것 중 가장 급한(남은 정거장이 가장 적은) 것이다
      assert.ok(+/_(\d)$/.exec(r.alert.key)[1] <= +/_(\d)$/.exec(k)[1], '덜 급한 알림이 먼저 울림: ' + r.alert.key + ' vs ' + k);
    });
    assert.ok(!(r.extra && r.extra.length) || r.alert, 'extra 만 있고 알림이 없다');
    log.push(r);
  });
  return { tg: tg, fired: fired, alerts: alerts, log: log };
}

t('무작위 600 경로 × 한 칸씩 진행: 켜진 알림은 빠짐없이 울리거나 같은 순간의 더 급한 것에 묻히고, 두 번 울리지 않는다', () => {
  let nAlert = 0, nMuted = 0, nRoutes = 0;
  for (let it = 0; it < 600; it++) {
    const nodes = mkRoute(), tg = raTargets(nodes);
    if (!tg.seq.length) continue;
    const steps = []; for (let c = -1; c < nodes.length; c++) steps.push(c);
    const d = drive(nodes, steps, {});
    nRoutes++; nAlert += d.alerts.length;
    // 기대 키: 모든 (대상, R) 중 그 노드를 지난 것
    const want = [];
    tg.targets.forEach(x => [2, 1, 0].forEach(R => { if (R === 0 && x.kind !== 'dest') return; if (x.seqPos - R >= 0) want.push(x.nodeIdx + '_' + R); }));
    want.forEach(k => assert.ok(d.fired[k], '켜졌어야 할 알림이 없다 ' + k + ' @ ' + JSON.stringify(nodes.map(n => n.k ? n.k + n.l : '-').join(' '))));
    Object.keys(d.fired).forEach(k => assert.ok(want.indexOf(k) >= 0, '엉뚱한 키 ' + k));
    nMuted += Object.keys(d.fired).length - d.alerts.length;
    // 알림 순서: 걸린 위치(curPos)는 줄지 않는다 · 같은 호출에 하나뿐
    for (let i = 1; i < d.alerts.length; i++) assert.ok(d.alerts[i].curPos >= d.alerts[i - 1].curPos, '순서가 거꾸로');
    // 도착 알림은 마지막
    const arr = d.alerts.filter(x => x.a.type === 'arrive'); assert.ok(arr.length <= 1);
  }
  assert.ok(nRoutes > 500 && nAlert > 1500, '시험이 너무 작다 ' + nRoutes + '/' + nAlert);
  console.log('      (경로 ' + nRoutes + ' · 울린 알림 ' + nAlert + ' · 같은 순간 더 급한 것에 묻힌 것 ' + nMuted + ')');
});

t('알림의 키·종류·제목·진동·문구가 규칙대로: 환승은 역 이름과 다음 노선, 하차는 역 이름이 들어간다', () => {
  for (let it = 0; it < 400; it++) {
    const nodes = mkRoute(), tg = raTargets(nodes);
    if (!tg.seq.length) continue;
    const steps = []; for (let c = -1; c < nodes.length; c++) steps.push(c);
    const d = drive(nodes, steps, {});
    d.alerts.forEach(x => {
      const m = /^(\d+)_(\d)$/.exec(x.a.key); assert.ok(m, '키 모양 ' + x.a.key);
      const tgt = tg.targets.find(q => q.nodeIdx === +m[1]); assert.ok(tgt, '대상 없는 키 ' + x.a.key);
      const R = +m[2]; assert.strictEqual(tgt.seqPos - x.curPos, R, '남은 정거장과 키가 안 맞음 ' + x.a.key + ' curPos=' + x.curPos);
      assert.strictEqual(x.a.type, typeOf(tgt, R)); assert.strictEqual(x.a.title, TITLE[x.a.type]);
      assert.ok(x.a.body.indexOf(tgt.name) >= 0, '역 이름이 문구에 없다: ' + x.a.body);
      if (tgt.kind === 'transfer') assert.ok(x.a.body.indexOf(tgt.nextLine) >= 0, '다음 노선이 없다: ' + x.a.body);
      assert.ok(Array.isArray(x.a.vib) && x.a.vib.length === (x.a.type === 'transfer2' || x.a.type === 'near_arrive2' ? 3 : 5));
      assert.ok(/^[^\n]{4,80}$/.test(x.a.body), '문구가 비정상 ' + x.a.body);
      if (x.a.type === 'arrive') assert.ok(!/약 \d+분 후/.test(x.a.body), '목적지 도착에 덧말이 붙음');
    });
  }
});

t('끈 알림 종류 32가지 조합: 끈 것은 울리지도 묻히지도 않고, 켠 것은 빠짐없이 나온다', () => {
  for (let mask = 0; mask < 32; mask++) {
    const allowed = {}; TYPES.forEach((ty, i) => { if (mask & (1 << i)) allowed[ty] = false; });
    for (let it = 0; it < 40; it++) {
      const nodes = mkRoute(), tg = raTargets(nodes);
      if (!tg.seq.length) continue;
      const steps = []; for (let c = -1; c < nodes.length; c++) steps.push(c);
      const d = drive(nodes, steps, allowed);
      d.alerts.forEach(x => assert.ok(allowed[x.a.type] !== false, '끈 종류가 울림 ' + x.a.type));
      const want = [];
      tg.targets.forEach(x => [2, 1, 0].forEach(R => { if (R === 0 && x.kind !== 'dest') return; if (x.seqPos - R >= 0 && allowed[typeOf(x, R)] !== false) want.push(x.nodeIdx + '_' + R); }));
      want.forEach(k => assert.ok(d.fired[k], '켠 알림이 빠짐 ' + k + ' mask=' + mask));
      Object.keys(d.fired).forEach(k => assert.ok(want.indexOf(k) >= 0, '끈 종류가 묻힘으로라도 기록됨 ' + k + ' mask=' + mask));
    }
  }
});

t('건너뛰기·제자리·가끔 뒷걸음(위치 흔들림)에서도: 두 번 울리지 않고, 남은 정거장과 지금 위치가 맞고, 지난 알림은 늦게 울리지 않는다', () => {
  for (let it = 0; it < 800; it++) {
    const nodes = mkRoute(), tg = raTargets(nodes);
    if (!tg.seq.length) continue;
    const steps = []; let c = -1;
    while (c < nodes.length + 1) {
      const r = rnd();
      if (r < 0.25) { /* 제자리 */ } else if (r < 0.3) c = Math.max(-1, c - ri(1, 2)); else c += ri(1, 4);
      steps.push(Math.min(c, nodes.length - 1));
      if (c >= nodes.length - 1) { steps.push(nodes.length - 1, nodes.length - 1); break; }
    }
    const d = drive(nodes, steps, {});
    d.alerts.forEach(x => {
      const m = /^(\d+)_(\d)$/.exec(x.a.key), tgt = tg.targets.find(q => q.nodeIdx === +m[1]);
      assert.strictEqual(tgt.seqPos - x.curPos, +m[2], '지금 위치와 남은 정거장이 안 맞음');
      assert.ok(x.c === steps[x.si], '입력과 다른 위치');
    });
    // 같은 호출에서 두 알림은 없다(응답 하나에 alert 하나) — drive 가 호출 수만큼만 알림을 받는다
    assert.ok(d.alerts.length <= steps.length);
  }
});

t('한 정거장짜리 구간이 이어질 때(환승 2번 연속 · 환승 바로 뒤 하차): 가장 급한 알림 하나만 울리고 나머지는 묻힌 것으로 기록된다', () => {
  // 역1(A) → 역2(A) | 역3(B) | 역4(C) → 역5(C): 환승 대상 2개(역2·역3)가 붙어 있다
  const nodes = [{ k: null }, { k: 's', l: 'A', n: '역1' }, { k: 's', l: 'A', n: '역2' }, { k: 's', l: 'B', n: '역3' }, { k: 's', l: 'C', n: '역4' }, { k: 's', l: 'C', n: '역5' }];
  const tg = raTargets(nodes);
  assert.deepStrictEqual(tg.targets.map(x => x.name + ':' + x.kind), ['역2:transfer', '역3:transfer', '역5:dest']);
  const d = drive(nodes, [-1, 0, 1, 2, 3, 4, 5], {});
  // 켜진 키 전부가 fired 에 있고(울렸거나 묻혔거나) 알림 개수는 그보다 적다
  assert.ok(Object.keys(d.fired).length > d.alerts.length, '묻힌 것이 있어야 한다');
  assert.ok(d.alerts.every(x => x.a.type !== 'near_arrive2' || x.a.body.indexOf('역5') >= 0));
  assert.strictEqual(d.alerts[d.alerts.length - 1].a.type, 'arrive');
});

t('엉뚱한 입력에도 죽지 않고 알림이 없다: null · 빈 배열 · NaN/음수/큰 curIdx · 이상한 allowed · 노드에 null', () => {
  [null, undefined, {}, { nodes: null }, { nodes: [] }, { nodes: [null, 5, {}, { k: 's' }] }, { nodes: [{ k: 's', l: 'A', n: 'x' }, { k: 's', l: 'A', n: 'y' }], curIdx: NaN },
    { nodes: [{ k: 's', l: 'A', n: 'x' }, { k: 's', l: 'A', n: 'y' }], curIdx: -5 }, { nodes: [{ k: 's', l: 'A', n: 'x' }, { k: 's', l: 'A', n: 'y' }], curIdx: 1e9 },
    { nodes: [{ k: 's', l: 'A', n: 'x' }, { k: 's', l: 'A', n: 'y' }], curIdx: 1, allowed: 'x', fired: 7 }, { cfg: { targets: 'x', seq: 3 } }].forEach(o => {
    const r = rideAlert(o); assert.ok(r && r.v === 1);
  });
  // 큰 curIdx 는 끝까지 간 것으로: 목적지 도착 하나
  const r = rideAlert({ nodes: [{ k: 's', l: 'A', n: 'x' }, { k: 's', l: 'A', n: 'y' }], curIdx: 1e9, fired: {} });
  assert.ok(r.alert === null || r.alert.type === 'arrive');
});

t('시각 덧말(약 N분 후): eta 가 있으면 그 노드까지 0~240분일 때만 · 자정 넘김 · 없으면 여정 남은 분 · 목적지 도착은 없음 — 무작위 시각 400번', () => {
  for (let it = 0; it < 400; it++) {
    const nowMin = ri(0, 1439), dm = ri(-30, 300), etaMin = (((nowMin + dm) % 1440) + 1440) % 1440;
    const hm = String(Math.floor(etaMin / 60)).padStart(2, '0') + ':' + String(etaMin % 60).padStart(2, '0');
    const nodes = [{ k: 's', l: 'A', n: 'a' }, { k: 's', l: 'A', n: 'b' }, { k: 's', l: 'A', n: 'c' }, { k: 's', l: 'A', n: 'd' }];
    const eta = { 3: hm };
    const r = rideAlert({ nodes: nodes, curIdx: 1, fired: {}, nowMin: nowMin, eta: eta, jr: null });
    assert.ok(r.alert && r.alert.type === 'near_arrive2', '목적지 2정거장 전이어야 한다(curIdx 1 → 남은 2)');
    // 규칙을 따로 한 번 더 적어 맞춰 본다: 예정까지 td(분, 12시간 접힘)가 0 이상 240 미만이면 '(약 N분 후)'
    let td = etaMin - nowMin; if (td < -720) td += 1440; if (td > 720) td -= 1440;
    const m = /\(약 (\d+)분 후\)/.exec(r.alert.body);
    if (td >= 0 && td < 240) { assert.ok(m && +m[1] === Math.max(1, Math.round(td)), '덧말 ' + r.alert.body + ' td=' + td); } else assert.ok(!m, '덧말이 없어야 한다 td=' + td + ' ' + r.alert.body);
    // eta 가 없고 jr(여정 남은 분)이 있으면 그 분수 — 목적지 도착(남은 0)에는 붙이지 않는다
    const r2 = rideAlert({ nodes: nodes, curIdx: 1, fired: {}, nowMin: nowMin, eta: {}, jr: 17 });
    assert.ok(/\(약 17분 후\)/.test(r2.alert.body), 'jr 덧말 ' + r2.alert.body);
    const r3 = rideAlert({ nodes: nodes, curIdx: 3, fired: {}, nowMin: nowMin, eta: eta, jr: 17 });
    assert.ok(r3.alert && r3.alert.type === 'arrive' && !/약 \d+분 후/.test(r3.alert.body), '목적지 도착 덧말 ' + (r3.alert && r3.alert.body));
  }
});

console.log('\n' + pass + ' 통과 · ' + fail + ' 실패');
process.exit(fail ? 1 : 0);
