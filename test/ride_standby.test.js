// 대기 모드 엔진(engine/ride-standby.js) 단위 시험 — 브라우저 없이 Node 만으로 돈다.
// 실행: node test/ride_standby.test.js
//   웹뷰가 사라져도 네이티브가 5초마다 이 엔진을 불러 영점·시각 밀고 당기기·하차 알림을 이어간다. 상태(state)는 요청에 실려 오가고 서버는 기억하지 않는다.
'use strict';
const assert = require('assert');
const path = require('path');
const { rideStandby, rsAlerts, handleRideStandby } = require(path.join(__dirname, '..', 'engine', 'ride-standby.js'));

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e && e.message).split('\n')[0]); } };

const DAY = Date.parse('2026-10-13T00:00:00+09:00');
const at = (h, m, s) => DAY + ((h * 60 + m) * 60 + (s || 0)) * 1000;
// 노드 0 = 출발, 1~5 = 역 S0..S4 (계획 12:52 부터 2분 간격). 역간 약 1.2km (동쪽으로).
const LAT = 37.5, LNG0 = 126.9, DL = 0.0137;
const PLAN = [null, 12 * 60 + 52, 12 * 60 + 54, 12 * 60 + 56, 12 * 60 + 58, 13 * 60];
const nodes = [{ name: '출발', isOrigin: true }].concat([0, 1, 2, 3, 4].map(i => ({ name: 'S' + i, isSub: true, lineName: '인천1호선', planMin: PLAN[i + 1] })));
function mkState(opt) {
  opt = opt || {};
  const stops = [], seq = [1, 2, 3, 4, 5];
  for (let i = 1; i <= 5; i++) stops.push({ i: i, lat: LAT, lng: LNG0 + DL * (i - 1), arrMs: DAY + PLAN[i] * 60000, pass: i > 1, fin: i === 5 });
  return {
    v: 1, tripSig: 'T1',
    eta: { nodes: nodes, passes: [{ idx: 1, ms: at(12, 52, 0), src: 'gps' }], boarded: true, notDeparted: false, timetableFirst: true, tzOffsetMin: 540 },
    stops: stops, trail: [],
    cfg: { targets: [{ seqPos: 4, nodeIdx: 5, name: 'S4', kind: 'dest' }], seq: seq, allowed: opt.allowed || {}, destName: 'S4' },
    fired: {}
  };
}
// 열차 위치(경도): 계획대로 달린다(delaySec 만큼 늦음)
function trainLng(ms, delaySec) {
  const m = (ms - delaySec * 1000 - DAY) / 60000;
  if (m <= PLAN[1]) return LNG0;
  for (let i = 1; i < 5; i++) if (m <= PLAN[i + 1]) return LNG0 + DL * (i - 1 + (m - PLAN[i]) / (PLAN[i + 1] - PLAN[i]));
  return LNG0 + DL * 4;
}
// 5초마다 엔진을 부르는 네이티브 흉내
function ride(state, from, to, delaySec, hook) {
  let st = state, fixes = [], alerts = [], last = null, steps = 0;
  for (let ms = from; ms <= to; ms += 5000) {
    fixes = [[ms, LAT, trainLng(ms, delaySec || 0), 20]];
    last = rideStandby({ nowMs: ms, fixes: fixes, state: JSON.parse(JSON.stringify(st)) });   // 직렬화 왕복: 네이티브는 state 를 그대로 들고 있다
    assert.ok(!last.error, last.error);
    st = last.state; steps++;
    if (last.alert) alerts.push({ ms: ms, a: last.alert });
    if (hook) hook(ms, last);
    if (last.done) break;
  }
  return { st: st, alerts: alerts, last: last };
}

t('계획대로 달리면 목적지 2정거장 전·1정거장 전·도착 알림이 한 번씩, 순서대로 나간다', () => {
  const r = ride(mkState(), at(12, 53, 0), at(13, 1, 0), 0);
  assert.deepStrictEqual(r.alerts.map(x => x.a.title), ['목적지 2정거장 전', '곧 하차', '목적지 도착']);
  assert.deepStrictEqual(r.alerts.map(x => x.a.type), ['near_arrive2', 'near_arrive', 'arrive']);
  assert.ok(r.alerts[0].ms < r.alerts[1].ms && r.alerts[1].ms < r.alerts[2].ms);
  assert.ok(/S4/.test(r.alerts[0].a.body));
  assert.ok(Array.isArray(r.alerts[1].a.vib) && r.alerts[1].a.vib.length === 5);
});

t('하차 7분 전 추천: 한 여정에 한 번, 목적지 도착 7분~1분 사이에만, 도착 좌표와 시간대를 싣는다', () => {
  const fires = [];
  ride(mkState(), at(12, 50, 0), at(13, 1, 0), 0, (ms, l) => { if (l.reco && l.reco.fire) fires.push({ ms: ms, r: l.reco }); });
  assert.strictEqual(fires.length, 1, '한 번만: ' + fires.length);
  const f = fires[0];
  assert.ok(f.ms >= at(12, 53, 0) - 1 && f.ms <= at(12, 59, 0), '7분~1분 창: ' + new Date(f.ms).toISOString());
  assert.strictEqual(f.r.dest, 'S4'); assert.strictEqual(f.r.slot, 'lunch');                     // 13시 도착 = 점심
  assert.ok(f.r.loc && Math.abs(f.r.loc.lat - LAT) < 1e-9 && f.r.arrMs > f.ms && /^[^|]*$/.test(String(f.r.key)) === false);
  assert.ok(f.r.remMin >= 1 && f.r.remMin <= 7);
});
t('하차 추천: 알림 끔(arrive_reco:false)이면 안 보낸다 · 승차 대기 중에도 안 보낸다', () => {
  let n = 0;
  ride(mkState({ allowed: { arrive_reco: false } }), at(12, 50, 0), at(13, 1, 0), 0, (ms, l) => { if (l.reco && l.reco.fire) n++; });
  assert.strictEqual(n, 0);
  const w = mkState(); w.wait = { i: 1 };
  assert.strictEqual(rideStandby({ nowMs: at(12, 55, 0), fixes: [], state: w }).reco.fire, false);
});

t('같은 알림은 두 번 나가지 않는다(fired 가 상태에 실려 돈다)', () => {
  const r = ride(mkState(), at(12, 53, 0), at(13, 1, 0), 0);
  assert.strictEqual(r.alerts.length, 3);
  assert.ok(r.st.fired['5_2'] && r.st.fired['5_1'] && r.st.fired['5_0']);
});

t('상주 알림 문구: 다음 역·도착 시각·목적지까지 남은 정거장', () => {
  let txt = null;
  ride(mkState(), at(12, 53, 0), at(12, 56, 30), 0, (ms, l) => { if (ms === at(12, 56, 30)) txt = l.ongoing.text; });
  assert.ok(/^다음 S\d \d\d:\d\d · S4까지 \d정거장$/.test(txt), txt);
});

t('도착 알림 3분 뒤 done, 그 전에는 done 이 아니다', () => {
  let arrAt = null, doneAt = null;
  ride(mkState(), at(12, 53, 0), at(13, 10, 0), 0, (ms, l) => { if (l.alert && l.alert.type === 'arrive') arrAt = ms; if (l.done && !doneAt) doneAt = ms; });
  assert.ok(arrAt && doneAt, '도착과 종료가 있어야 한다');
  assert.ok(doneAt - arrAt >= 180000 && doneAt - arrAt <= 190000, '도착 ' + arrAt + ' 종료 ' + doneAt);
});

t('열차가 빨리 가면 GPS 통과 시각으로 영점이 잡혀 뒤 도착 시각이 당겨진다(밀고 당기기)', () => {
  // 열차가 90초 빠르다(delaySec = -90)
  let first = null, lastEta = null;
  ride(mkState(), at(12, 53, 0), at(12, 59, 0), -90, (ms, l) => { if (!first) first = l.state.etaMs.slice(); lastEta = l.state.etaMs.slice(); });
  assert.ok(lastEta[5] <= first[5] - 60000, '목적지 도착 시각이 당겨져야 한다: ' + new Date(first[5]).toISOString() + ' → ' + new Date(lastEta[5]).toISOString());
});

t('열차가 늦으면 도착 시각이 밀린다', () => {
  let first = null, lastEta = null;
  ride(mkState(), at(12, 53, 0), at(12, 59, 30), 120, (ms, l) => { if (!first) first = l.state.etaMs.slice(); lastEta = l.state.etaMs.slice(); });
  assert.ok(lastEta[5] >= first[5] + 60000, '목적지 도착 시각이 밀려야 한다: ' + new Date(first[5]).toISOString() + ' → ' + new Date(lastEta[5]).toISOString());
});

t('설정에서 끈 알림 종류는 나가지 않는다(allowed:false) — 나머지는 그대로', () => {
  const r = ride(mkState({ allowed: { near_arrive2: false } }), at(12, 53, 0), at(13, 1, 0), 0);
  assert.deepStrictEqual(r.alerts.map(x => x.a.type), ['near_arrive', 'arrive']);
});

t('환승역이 있으면 환승 1정거장 전 알림이 나가고, 같은 순간 걸린 목적지 알림은 보낸 것으로 처리된다', () => {
  const a = rsAlerts({ targets: [{ seqPos: 1, nodeIdx: 2, name: 'X', kind: 'transfer', nextLine: '2호선' }, { seqPos: 3, nodeIdx: 4, name: 'Y', kind: 'dest' }], seq: [1, 2, 3, 4] }, {}, 1, [], 0);
  // curPos=0: 환승 remain 1, 목적지 remain 3 → 환승만
  assert.strictEqual(a.alert.title, '환승 준비'); assert.deepStrictEqual(a.extra, []);
  const b = rsAlerts({ targets: [{ seqPos: 2, nodeIdx: 3, name: 'X', kind: 'transfer', nextLine: '2호선' }, { seqPos: 3, nodeIdx: 4, name: 'Y', kind: 'dest' }], seq: [1, 2, 3, 4] }, {}, 2, [], 0);
  // curPos=1: 환승 remain 1, 목적지 remain 2 → 급한 환승이 울리고 목적지 2정거장 전은 보낸 것으로
  assert.strictEqual(b.alert.title, '환승 준비'); assert.deepStrictEqual(b.extra, ['4_2']);
});

t('GPS 가 한 번도 없어도(지하) 시각표대로 이어서 알림이 나간다', () => {
  let st = mkState(), alerts = [];
  for (let ms = at(12, 53, 0); ms <= at(13, 1, 0); ms += 5000) {
    const r = rideStandby({ nowMs: ms, fixes: [], state: JSON.parse(JSON.stringify(st)) }); st = r.state; if (r.alert) alerts.push(r.alert.type);
  }
  assert.deepStrictEqual(alerts, ['near_arrive2', 'near_arrive', 'arrive']);
});

t('상태가 없거나 시각이 없으면 오류로 알리고 done 으로 끝낸다(네이티브가 멈추게)', () => {
  assert.strictEqual(rideStandby({}).done, true);
  assert.ok(rideStandby({ nowMs: 1, state: {} }).error);
});

t('요청 하나의 크기 — 상태 JSON 이 가볍다(5초마다 보낸다)', () => {
  const r = ride(mkState(), at(12, 53, 0), at(12, 58, 0), 0);
  const size = JSON.stringify({ nowMs: 1, fixes: [[1, 1, 1, 1]], state: r.st }).length;
  assert.ok(size < 12000, '요청 크기 ' + size);
});

// ── 오버레이 ─────────────────────────────────────────────
function withOvl(st) {
  const cells = [], map = [];
  for (let i = 1; i <= 5; i++) {
    cells.push({ n: 'S' + (i - 1), t: '--:--', g: i === 1 ? '인천1호선' : '', gp: false, gc: '#336699', lc: i > 1 ? '#336699' : '', rc: i < 5 ? '#336699' : '', dc: '#336699', dk: i === 1 || i === 5 ? 2 : 1, m: 'S' + (i - 1) + '(이동중)' });
    map.push(i);
    if (i === 2) { cells.push({ n: '도보', t: '', g: '', dk: 3, dc: '#8e8e93' }); map.push(-1); }
  }
  st.ovl = { cells: cells, map: map, base: 0, theme: { bg: '#ffffff', fg: '#111114', sub: '#8e8e93' } };
  return st;
}
t('오버레이: 그림 틀이 없으면 overlay 는 null, 있으면 칸·현위치·시각이 채워진다', () => {
  assert.strictEqual(rideStandby({ nowMs: at(12, 55, 0), fixes: [], state: mkState() }).overlay, null);
  const r = rideStandby({ nowMs: at(12, 55, 0), fixes: [], state: withOvl(mkState()) });
  const o = r.overlay;
  assert.ok(o && o.active === true && o.cells.length === 6);
  assert.ok(/^\d\d:\d\d$/.test(o.cells[0].t), '시각 ' + o.cells[0].t);
  assert.strictEqual(o.cells[5].t.length, 5);
  assert.strictEqual(o.base, 0); assert.deepStrictEqual(o.theme, { bg: '#ffffff', fg: '#111114', sub: '#8e8e93' });
});
t('오버레이: 열차가 가는 대로 현위치 칸이 움직이고(도보 칸은 건너뜀) 이동 중이면 알약에 다음역(이동중)', () => {
  let st = withOvl(mkState()), curs = [], pills = new Set(), l1 = [];
  for (let ms = at(12, 53, 0); ms <= at(13, 1, 0); ms += 5000) {
    const r = rideStandby({ nowMs: ms, fixes: [[ms, LAT, trainLng(ms, 0), 20]], state: JSON.parse(JSON.stringify(st)) }); st = r.state;
    curs.push(r.overlay.cur); if (r.overlay.pill) pills.add(r.overlay.pill); l1.push(r.overlay.line1);
  }
  for (let i = 1; i < curs.length; i++) assert.ok(curs[i] >= curs[i - 1], '뒤로 감');
  assert.strictEqual(curs[curs.length - 1], 5);
  assert.ok(!curs.includes(2), '도보 칸(2번)이 현위치가 됨');
  assert.ok(pills.size >= 2 && [...pills].every(x => /\(이동중\)$/.test(x)), [...pills].join());
  assert.ok(l1.some(x => / ▸ /.test(x)) && /^● /.test(l1[l1.length - 1]));
});
t('오버레이: 남은시간 줄(목적지 기준)과 하차 임박 단계(2→1→도착하면 0)·[안내 종료] 줄', () => {
  let st = withOvl(mkState()), lv = [], rsSeen = null, l2 = null, pre = false, atFirst = 0, banners = [];
  for (let ms = at(12, 53, 0); ms <= at(13, 1, 0); ms += 5000) {
    const r = rideStandby({ nowMs: ms, fixes: [[ms, LAT, trainLng(ms, 0), 20]], state: JSON.parse(JSON.stringify(st)) }); st = r.state;
    if (r.done) break;
    const o = r.overlay; if (!o || !o.active) continue;
    if (!l2) l2 = o.line2; if (o.pre) pre = true; if (o.banner && banners[banners.length - 1] !== o.banner) banners.push(o.banner);
    if (lv[lv.length - 1] !== o.alert) { lv.push(o.alert); if (o.alert === 2) atFirst = o.alertAt; }
    if (o.rs.st === 'board') rsSeen = o.rs;
    assert.strictEqual(o.alertVibe, false);   // 진동은 알림이 한다(중복 방지)
  }
  assert.ok(/^남은시간: \d\d시간 \d\d분 · 13:00도착$/.test(l2), l2);
  assert.deepStrictEqual(lv.filter((x, i) => i === 0 || x !== lv[i - 1]).filter(x => x > 0), [2, 1]);
  assert.ok(lv[lv.length - 1] === 0 && atFirst > 0 && pre === true);
  assert.ok(rsSeen && rsSeen.bt === '안내 종료' && rsSeen.nm === 'S4');
  assert.ok(banners.some(b => /S4까지 2정거장/.test(b)) && banners.some(b => /다음 정거장 S4/.test(b)) && /S4에 도착/.test(banners[banners.length - 1]), banners.join(' | '));
});
t('오버레이: 안내가 끝나면(done) active:false 로 내려가고, view 에는 재개 카드용 마지막 문구가 있다', () => {
  let st = withOvl(mkState()), last = null;
  for (let ms = at(12, 53, 0); ms <= at(13, 6, 0); ms += 5000) {
    last = rideStandby({ nowMs: ms, fixes: [[ms, LAT, trainLng(ms, 0), 20]], state: JSON.parse(JSON.stringify(st)) }); st = last.state; if (last.done) break;
  }
  assert.ok(last.done && last.overlay && last.overlay.active === false);
  assert.ok(last.view && /도착/.test(last.view.text) && last.view.curIdx >= 5);
});

t('버스처럼 시각표 기준이 아닌 여정(timetableFirst 없음)도 GPS 통과로 영점이 잡혀 알림이 나간다', () => {
  const st = withOvl(mkState());
  delete st.eta.timetableFirst;
  st.eta.nodes.forEach(n => { if (n.isSub) { n.isSub = false; n.isBus = true; n.lineName = '931'; } });
  st.stops.forEach(s => { s.bus = true; });
  const r = ride(st, at(12, 53, 0), at(13, 1, 0), 60);   // 1분 늦게 달린다
  assert.deepStrictEqual(r.alerts.map(x => x.a.type), ['near_arrive2', 'near_arrive', 'arrive']);
  assert.ok(r.last.overlay && r.last.overlay.cells.length === 6);
  const arrTxt = r.last.overlay.cells[5].t; assert.ok(/^\d\d:\d\d$/.test(arrTxt), arrTxt);
});

t('버스: GPS 가 15분 끊겼다 돌아오면 앞쪽 정류장 통과로 다시 맞춘다(재동기) — 시각표 기준 여정이 아닐 때만', () => {
  // 정류장 12개(2분 간격, 1.2km). 3번 통과 뒤 GPS 가 끊기고, 15분 뒤 열차가 10번 정류장에 선 채 좌표 두 점이 들어온다.
  function busState(n) {
    const nodesB = [{ name: '출발', isOrigin: true }], stopsB = [], seqB = [];
    for (let i = 1; i <= n; i++) { nodesB.push({ name: 'B' + i, isBus: true, lineName: '931', planMin: PLAN[1] + 2 * (i - 1) }); stopsB.push({ i: i, lat: LAT, lng: LNG0 + DL * (i - 1), arrMs: DAY + (PLAN[1] + 2 * (i - 1)) * 60000, pass: i > 1, fin: i === n, bus: true }); seqB.push(i); }
    return { v: 1, eta: { nodes: nodesB, passes: [{ idx: 1, ms: at(12, 52, 0), src: 'gps' }, { idx: 2, ms: at(12, 54, 0), src: 'gps' }, { idx: 3, ms: at(12, 56, 0), src: 'gps' }], boarded: true, tzOffsetMin: 540 }, stops: stopsB, trail: [], cfg: { targets: [{ seqPos: n - 1, nodeIdx: n, name: 'B' + n, kind: 'dest' }], seq: seqB, allowed: {}, destName: 'B' + n }, fired: {} };
  }
  let st = busState(12);
  const t1 = at(13, 11, 0);   // 15분 뒤: 계획대로면 10번(12:52+18분=13:10)에 선 시각
  let r = rideStandby({ nowMs: t1, fixes: [[t1 - 6000, LAT, LNG0 + DL * 9, 15], [t1, LAT, LNG0 + DL * 9 + 0.0001, 15]], state: st });
  assert.ok(!r.error);
  assert.ok(r.state.eta.passes.some(p => p.idx === 10), '10번 통과가 반영돼야 한다: ' + JSON.stringify(r.state.eta.passes.map(p => p.idx)));
  assert.ok(r.curIdx >= 10, 'curIdx ' + r.curIdx);
  // 반대로 3번 통과 1분 뒤에 10번 근처 좌표가 잡히면(불가능한 점프 — 튄 점·겹치는 길) 건너뛰지 않는다
  st = busState(12);
  const t2 = at(12, 57, 0);
  r = rideStandby({ nowMs: t2, fixes: [[t2 - 6000, LAT, LNG0 + DL * 9, 15], [t2, LAT, LNG0 + DL * 9, 15]], state: st });
  assert.ok(!r.state.eta.passes.some(p => p.idx === 10), '불가능한 점프를 받아들임');
  // 점이 하나뿐이면 재동기는 하지 않는다(영점 창 안에 든 점은 기존 영점 규칙이 따로 처리한다)
  st = busState(12);
  r = rideStandby({ nowMs: t1, fixes: [[t1, LAT, LNG0 + DL * 9, 15]], state: st });
  assert.ok(!r.notes.some(x => /재동기/.test(x)), '점 하나로 재동기');
});

t('이탈: 정거장에서 내려 택시로 멀어지면 이탈 알림이 한 번 나가고, 그 뒤 하차 알림은 보류되며, 15분이 지나면 안내를 끝낸다', () => {
  let st = mkState(), alerts = [], doneAt = null, texts = [];
  const leaveMs = at(12, 56, 0), stopLng = LNG0 + DL * 2;   // 3번 정거장(12:56)에서 내린다
  for (let ms = at(12, 53, 0); ms <= at(13, 20, 0); ms += 5000) {
    const onTrain = ms < leaveMs;
    const lat = onTrain ? LAT : LAT + 12 * (ms - leaveMs) / 1000 / 111320, lng = onTrain ? trainLng(ms, 0) : stopLng;
    const r = rideStandby({ nowMs: ms, fixes: [[ms, lat, lng, 15]], state: JSON.parse(JSON.stringify(st)) }); st = r.state;
    if (r.alert) alerts.push({ ms: ms, a: r.alert });
    texts.push(r.ongoing.text);
    if (r.done) { doneAt = ms; break; }
  }
  const off = alerts.filter(x => x.a.type === 'offroute');
  assert.strictEqual(off.length, 1, JSON.stringify(alerts.map(x => x.a.type)));
  assert.ok(off[0].ms - leaveMs > 30000 && off[0].ms - leaveMs < 260000, '이탈 알림 시각 ' + (off[0].ms - leaveMs) / 1000 + '초 뒤');
  assert.ok(!alerts.some(x => x.ms > off[0].ms && /near_arrive|arrive/.test(x.a.type)), '이탈 뒤 하차 알림');
  assert.ok(texts.some(x => /경로를 벗어났어요/.test(x)));
  assert.ok(doneAt && doneAt - off[0].ms >= 880000 && doneAt - off[0].ms <= 960000, '안내 종료 ' + (doneAt - off[0].ms) / 1000);
});
t('이탈: 열차를 계속 타고 가면(지하 GPS 없음·지상 구간) 이탈 알림이 나가지 않는다', () => {
  const r = ride(mkState(), at(12, 53, 0), at(13, 1, 0), 0);
  assert.ok(!r.alerts.some(x => x.a.type === 'offroute'));
  let st = mkState(), n = 0;
  for (let ms = at(12, 53, 0); ms <= at(13, 1, 0); ms += 5000) { const q = rideStandby({ nowMs: ms, fixes: [], state: JSON.parse(JSON.stringify(st)) }); st = q.state; if (q.alert && q.alert.type === 'offroute') n++; }
  assert.strictEqual(n, 0);
});
t('버스: GPS 가 3분 넘게 없으면 계획 시각표대로 이어가 알림이 나가고, GPS 통과가 다시 잡히면 해제된다', () => {
  function busS() { const s0 = mkState(); delete s0.eta.timetableFirst; s0.eta.nodes.forEach(n => { if (n.isSub) { n.isSub = false; n.isBus = true; n.lineName = '931'; } }); s0.stops.forEach(q => { q.bus = true; }); return s0; }
  let st = busS(), types = [], drSeen = false;
  for (let ms = at(12, 53, 0); ms <= at(13, 1, 0); ms += 5000) {
    const r = rideStandby({ nowMs: ms, fixes: [], state: JSON.parse(JSON.stringify(st)) }); st = r.state;   // GPS 가 한 번도 없다
    if (r.alert) types.push(r.alert.type); if (st.dr) drSeen = true;
  }
  assert.ok(drSeen, '끊김 이어가기가 켜져야 한다');
  assert.deepStrictEqual(types, ['near_arrive2', 'near_arrive', 'arrive']);
});


// ── 2026-10-19: 버스 위치(busPos)·움직임(motion)·다음 호출 간격(nextMs) ──
function busState2(n) {
  const nodesB = [{ name: '출발', isOrigin: true }], stopsB = [], seqB = [];
  for (let i = 1; i <= n; i++) {
    nodesB.push({ name: 'B' + i, isBus: true, lineName: '931', planMin: PLAN[1] + 2 * (i - 1) });
    stopsB.push({ i: i, lat: LAT, lng: LNG0 + DL * (i - 1), arrMs: DAY + (PLAN[1] + 2 * (i - 1)) * 60000, lg: 1, bus: true, pass: i > 1, fin: i === n });
    seqB.push(i);
  }
  return { v: 1, eta: { nodes: nodesB, passes: [{ idx: 1, ms: at(12, 52, 0), src: 'gps' }], boarded: true, tzOffsetMin: 540 }, stops: stopsB, trail: [],
    cfg: { targets: [{ seqPos: n - 1, nodeIdx: n, name: 'B' + n, kind: 'dest' }], seq: seqB, allowed: {}, destName: 'B' + n }, fired: {} };
}
// 버스 위치(경도): 정류장 사이를 달리다 정류장마다 dwellSec 멈춘다. earlySec 만큼 계획보다 이르다.
function busLng(ms, earlySec, dwellSec) {
  const m = (ms + earlySec * 1000 - DAY) / 60000;
  if (m <= PLAN[1]) return { lng: LNG0, moving: false };
  const k = Math.min(10, Math.floor((m - PLAN[1]) / 2)), segStart = PLAN[1] + 2 * k, f = (m - segStart) / 2;
  const sec = (m - segStart) * 60;
  if (sec < (dwellSec || 0)) return { lng: LNG0 + DL * k, moving: false };
  const g = Math.min(1, (sec - (dwellSec || 0)) / (120 - (dwellSec || 0)));
  return { lng: LNG0 + DL * (k + g), moving: true };
}
t('버스: 정류장을 이은 선 위 위치(busPos)로 이르게 지난 정류장의 통과 시각이 증거로 적히고 남은 시각이 당겨진다', () => {
  let st = busState2(10), first = null, last = null, stamped = [];
  for (let ms = at(12, 52, 10); ms <= at(12, 64, 0); ms += 5000) {
    const b = busLng(ms, 90, 0);   // 계획보다 90초 이르다
    const r = rideStandby({ nowMs: ms, fixes: [[ms, LAT, b.lng, 15]], state: JSON.parse(JSON.stringify(st)) });
    assert.ok(!r.error, r.error); st = r.state; last = r;
    if (!first && r.state.etaMs) first = r.state.etaMs.slice();
    r.notes.forEach(x => { if (/버스위치|영점/.test(x)) stamped.push(x); });
  }
  const gps = st.eta.passes.filter(p => p.src === 'gps' && p.idx >= 3);
  assert.ok(gps.length >= 3, '통과 증거 ' + gps.length + ': ' + JSON.stringify(st.eta.passes.map(p => p.idx)));
  // 이른 통과는 계획 시각보다 앞선 시각으로 적혀야 한다(90초 안팎)
  const p4 = st.eta.passes.find(p => p.idx === 4);
  assert.ok(p4 && Math.abs((p4.ms - (DAY + (PLAN[1] + 6) * 60000)) + 90000) < 40000, '4번 통과 ' + (p4 && (p4.ms - (DAY + (PLAN[1] + 6) * 60000)) / 1000));
  assert.ok(last.state.etaMs[10] < first[10] - 40000, '목적지 도착 시각이 당겨져야 한다: ' + (first[10] - last.state.etaMs[10]) / 1000 + '초');
});
t('버스: 달리는 중(motion)은 오버레이의 이동중 표시를, 서 있으면 정지를 따른다', () => {
  let st = busState2(10), moves = [], stops = [];
  for (let ms = at(12, 52, 10); ms <= at(12, 60, 0); ms += 5000) {
    const b = busLng(ms, 0, 40);
    const q = withOvl(st);
    const r = rideStandby({ nowMs: ms, fixes: [[ms, LAT, b.lng, 15]], state: JSON.parse(JSON.stringify(q)) }); st = r.state;
    if (r.motion && r.motion.moving === true) moves.push(r.overlay && r.overlay.pill);
    if (r.motion && r.motion.moving === false) stops.push(r.overlay && r.overlay.pill);
  }
  assert.ok(moves.length > 10 && stops.length > 3, '달림 ' + moves.length + ' 정지 ' + stops.length);
  assert.ok(moves.some(x => /\(이동중\)$/.test(x || '')), '달리는 중엔 이동중 표시 ' + JSON.stringify(moves.slice(0, 4)));
  assert.ok(stops.every(x => !/\(이동중\)$/.test(x || '')), '서 있는데 이동중 표시: ' + JSON.stringify(stops.filter(x => /\(이동중\)$/.test(x || ''))));
});
t('다음 호출 간격: 표시 도착 시각 앞 30초~뒤 40초 안에는 2.5초, 그 밖에는 5초, 승차 전에는 5초', () => {
  const st = mkState();
  // 3번 역 도착 12:56:00 (etaMs 가 없으면 stops.arrMs)
  const near = [at(12, 55, 31), at(12, 56, 0), at(12, 56, 39)], far = [at(12, 55, 0), at(12, 56, 45)];
  near.forEach(ms => { const r = rideStandby({ nowMs: ms, fixes: [], state: JSON.parse(JSON.stringify(st)) }); assert.strictEqual(r.nextMs, 2500, 'near '+new Date(ms).toISOString() + ' ' + r.nextMs); });
  far.forEach(ms => { const r = rideStandby({ nowMs: ms, fixes: [], state: JSON.parse(JSON.stringify(st)) }); assert.strictEqual(r.nextMs, 5000, 'far '+new Date(ms).toISOString() + ' ' + r.nextMs); });
  const s2 = mkState(); s2.eta.notDeparted = true;
  assert.strictEqual(rideStandby({ nowMs: at(12, 56, 0), fixes: [], state: s2 }).nextMs, 5000, '승차 전');
  { const q = rideStandby({ nowMs: at(12, 53, 0), fixes: [], state: Object.assign(mkState(), { arrivedAt: at(12, 49, 0) }) }); assert.ok(q.done && q.nextMs === 5000, '끝나면 기본 간격 ' + q.nextMs); }
});

const httpTest = async () => {
  const zlib = require('zlib');
  const body = JSON.stringify({ nowMs: at(12, 55, 0), fixes: [], state: withOvl(mkState()) });
  const call = (buf, hdr) => handleRideStandby(new Request('https://x.test/ride-standby', { method: 'POST', body: buf, headers: hdr || {} })).then(r => r.json().then(j => [r.status, j]));
  const [s1, j1] = await call(body);
  const gz = zlib.gzipSync(Buffer.from(body));
  const [s2, j2] = await call(gz, { 'content-encoding': 'gzip' });
  assert.strictEqual(s1, 200); assert.strictEqual(s2, 200);
  assert.deepStrictEqual(j2.overlay, j1.overlay);
  assert.ok(gz.length < body.length / 3, '압축 ' + gz.length + '/' + body.length);
  const [s3] = await call('이건 JSON 이 아님'); assert.strictEqual(s3, 400);
};

httpTest().then(() => { pass++; console.log('  ok   HTTP 처리: 평문 JSON 도 gzip 으로 눌러 보낸 JSON 도 같은 답을 준다(데이터 절약)'); }, (e) => { fail++; console.log('  FAIL HTTP 처리', String(e && e.message).split('\n')[0]); })
  .then(() => { console.log('ride_standby: pass', pass, 'fail', fail); process.exit(fail ? 1 : 0); });
