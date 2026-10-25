// 대기 모드 엔진(engine/ride-standby.js) 단위 시험 — 브라우저 없이 Node 만으로 돈다.
// 실행: node test/ride_standby.test.js
//   웹뷰가 사라져도 네이티브가 5초마다 이 엔진을 불러 영점·시각 밀고 당기기·하차 알림을 이어간다. 상태(state)는 요청에 실려 오가고 서버는 기억하지 않는다.
'use strict';
const assert = require('assert');
const path = require('path');
const { rideStandby, rsAlerts, handleRideStandby, rsPressQuery, rsAttachPressTT, rsPickMs, rsPickLive, rsAttachPressLive, rsFetchSeoulArrivals } = require(path.join(__dirname, '..', 'engine', 'ride-standby.js'));

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
t('내 위치 공유: 출발 - 현재 - 도착 (도착예정시간) [남은시간] 글과 압축 타임라인 재료(도보 칸은 뺀다)', () => {
  let st = withOvl(mkState()), shs = [];
  for (let ms = at(12, 53, 0); ms <= at(13, 1, 0); ms += 5000) {
    const r = rideStandby({ nowMs: ms, fixes: [[ms, LAT, trainLng(ms, 0), 20]], state: JSON.parse(JSON.stringify(st)) }); st = r.state;
    if (r.overlay && r.overlay.share) shs.push(r.overlay.share);
  }
  assert.ok(shs.length > 20, '공유 재료가 계속 나온다 ' + shs.length);
  const a = shs[0], z = shs[shs.length - 1];
  assert.ok(a.stations.length === 5 && a.stations.every(x => x.n && !/^도보$/.test(x.n)), '도보 칸 제외 ' + JSON.stringify(a.stations.map(x => x.n)));
  assert.ok(/^\S+ - .+ - \S+ \(도착예정시간: \d\d시\d\d분\)\n\[남은시간: \d\d시\d\d분\]$/.test(a.text), a.text);
  assert.strictEqual(a.from, a.stations[0].n); assert.strictEqual(a.to, a.stations[4].n);
  assert.ok(shs.some(x => x.moving && / 이동 중$/.test(x.cur) && /→/.test(x.cur)), '가는 중엔 A→B 이동 중');
  for (let i = 1; i < shs.length; i++) assert.ok(shs[i].hit >= shs[i - 1].hit, '뒤로 감');
  assert.strictEqual(z.hit, 4); assert.strictEqual(z.left, 0);
  assert.ok(shs.every(x => x.hit >= 0 && x.hit < x.stations.length && x.left === x.stations.length - 1 - x.hit));
  assert.ok(/^\d\d시\d\d분$/.test(a.arr) && /^\d\d시\d\d분$/.test(a.rem));
  const kst = new Date(at(13, 0, 0) + 9 * 3600000); assert.ok(typeof kst.getUTCHours() === 'number');
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


// ── 오버레이 하단 줄 · 탑승 줄 · 앱 종료 (s109) ─────────────────────────────────────
const stepO = (st, ms, extra, fix) => rideStandby(Object.assign({ nowMs: ms, fixes: fix === false ? [] : [[ms, LAT, trainLng(ms, 0), 20]], state: JSON.parse(JSON.stringify(st)) }, extra || {}));
t('내릴 준비 줄: 목적지 한 정거장 전에만 나오고(앱 종료 버튼 · 응원 문구), 추천 줄은 그때 내려간다', () => {
  let st = withOvl(mkState()), seen = [], rcSent = false;
  for (let ms = at(12, 53, 0); ms <= at(13, 1, 0); ms += 5000) {
    const r = stepO(st, ms, rcSent ? null : { rc: { a: '맛있는집', b: '점심 한 끼', m: '120m · 한식', go: '맛집 보기' } }); rcSent = true; st = r.state;
    if (r.done) break;
    const o = r.overlay; if (o && o.getoff && o.getoff.on) seen.push({ ms: ms, g: o.getoff, alert: o.alert, reco: o.reco.on });
  }
  assert.ok(seen.length > 3, '내릴 준비 줄이 나온다 ' + seen.length);
  assert.ok(seen.every(x => x.g.a === '내릴 준비를 해주세요' && x.g.end === '앱 종료' && x.g.b.length > 0 && x.g.b.length <= 40 && /^(dolsom|lovel|dudung|sul|ppopu|chaeng)$/.test(x.g.ch)));
  assert.ok(seen.slice(0, 5).every(x => x.alert === 1 && x.reco === false), '한 정거장 전에는 추천 대신 내릴 준비');
  assert.ok(new Set(seen.map(x => x.g.ch)).size === 1, '같은 경고 동안 캐릭터는 그대로');
});
t('추천 줄: /reco-text 의 ad 를 req.rc 로 알려 주면 도착 7분 안에 [보기][확인] 줄로 나오고, rcDis 로 닫으면 사라진다', () => {
  let st = withOvl(mkState());
  let r = stepO(st, at(12, 50, 0), { rc: { a: '맛있는집', b: '점심 한 끼', m: '120m · 한식', go: '맛집 보기' } }); st = r.state;
  assert.strictEqual(r.overlay.reco.on, false, '도착 10분 전엔 아직');
  r = stepO(st, at(12, 54, 0)); st = r.state;
  const rc = r.overlay.reco;
  assert.ok(rc.on && rc.a === '맛있는집' && rc.b === '점심 한 끼' && rc.m === '120m · 한식' && rc.go === '맛집 보기' && rc.ok === '확인' && rc.at === at(12, 50, 0), JSON.stringify(rc));
  r = stepO(st, at(12, 54, 5), { rcDis: rc.at }); st = r.state;
  assert.strictEqual(r.overlay.reco.on, false, '확인을 누르면 닫힌다');
  r = stepO(st, at(12, 55, 0), { rc: { a: '맛있는집', b: '점심 한 끼', m: '120m · 한식', go: '맛집 보기' } });
  assert.strictEqual(r.overlay.reco.on, false, '같은 추천을 다시 알려도 다시 안 뜬다');
  const k = stepO(withOvl(mkState({ allowed: { arrive_reco: false } })), at(12, 54, 0), { rc: { a: 'x', b: 'y' } });
  assert.strictEqual(k.overlay.reco.on, false, '알림 끔이면 줄도 없다');
  const sh = stepO(withOvl(mkState()), at(12, 54, 0), { rc: { a: '쿠팡템', b: '', go: '쿠팡 보기' } });
  assert.strictEqual(sh.overlay.reco.go, '쿠팡 보기');
});
t('하단 줄은 한 번 보이면 30초 붙잡는다(입력이 흔들려도 깜박이지 않는다)', () => {
  let st = withOvl(mkState()), r = stepO(st, at(12, 50, 0), { rc: { a: '가게', b: '설명' } }); st = r.state;
  r = stepO(st, at(12, 54, 0)); st = r.state; assert.ok(r.overlay.reco.on);
  const w = JSON.parse(JSON.stringify(st)); w.wait = { i: 1, lat: LAT, lng: LNG0, arrMs: at(13, 30, 0), since: at(12, 0, 0), seen: false, nearTs: 0 }; w.waitChk = 1;
  r = stepO(w, at(12, 54, 10), null, false);
  assert.ok(r.overlay.reco.on, '10초 뒤엔 붙잡는다');
  r = stepO(r.state, at(12, 54, 40), null, false);
  assert.strictEqual(r.overlay.reco.on, false, '30초가 지나면 내려간다');
});
function waitState() {
  const st = mkState(); st.wait = { i: 1, lat: LAT, lng: LNG0, arrMs: at(12, 52, 0), since: at(12, 40, 0), seen: false, nearTs: 0 }; st.waitChk = 1;
  st.eta.boarded = false; st.eta.notDeparted = true; st.eta.passes = []; return withOvl(st);
}
t('탑승 전 대기: 역으로 걸어가느라 경로선에서 멀리 있어도 이탈 알림·안내 종료가 없다(확정이 풀리지 않는다)', () => {
  // 출발 시각 12:52 인데 사용자는 경로선에서 북쪽 3km 쯤에서 30분 동안 걷고 있다 = 아직 역에 못 간 상태
  let st = waitState(), offN = 0, doneAt = null, texts = [];
  for (let ms = at(12, 20, 0); ms <= at(12, 50, 0); ms += 5000) {
    const r = rideStandby({ nowMs: ms, fixes: [[ms, LAT + 3000 / 111320, LNG0 + (ms - at(12, 20, 0)) / 1000 * 1.6e-5, 15]], state: JSON.parse(JSON.stringify(st)) }); st = r.state;   // 걸어서(초속 1.4m) 움직인다
    if (r.alert && r.alert.type === 'offroute') offN++;
    texts.push(r.ongoing.text);
    if (r.done) { doneAt = ms; break; }
  }
  assert.strictEqual(offN, 0, '대기 중 이탈 알림');
  assert.strictEqual(doneAt, null, '대기 중 15분 뒤 안내 종료');
  assert.ok(!texts.some(x => /경로를 벗어났어요/.test(x)), '대기 중 상주 알림이 이탈 문구');
  assert.ok(!st.offOn, '대기 중엔 이탈 시각을 적지 않는다');
});
t('오버레이 탑승 줄: 대기 알약 → (알약 누름 · 출발 2분 전) 탑승 줄 → [탑승] → [되돌리기]', () => {
  let r = stepO(waitState(), at(12, 47, 0), null, false);
  assert.strictEqual(r.overlay.rs.st, 'wait');
  r = stepO(r.state, at(12, 47, 5), { act: 'pill' }, false); assert.strictEqual(r.overlay.rs.st, 'board');
  r = stepO(r.state, at(12, 47, 10), { act: 'close' }, false); assert.strictEqual(r.overlay.rs.st, 'wait');
  r = stepO(r.state, at(12, 50, 30), null, false);
  assert.ok(r.overlay.rs.st === 'board' && r.overlay.rs.bt === '탑승' && /S0/.test(r.overlay.rs.k) && /승차 대기/.test(r.ongoing.text), JSON.stringify(r.overlay.rs));
  r = stepO(r.state, at(12, 50, 35), { act: 'press' }, false);
  assert.ok(r.overlay.rs.st === 'undo' && r.overlay.rs.bt === '되돌리기' && !r.state.wait && r.state.eta.boarded === true && r.state.eta.passes.some(p => p.idx === 1 && p.ms === at(12, 50, 35)));
  r = stepO(r.state, at(12, 50, 40), { act: 'undo' }, false);
  assert.ok(r.overlay.rs.st === 'board' && r.state.wait && r.state.wait.i === 1 && r.state.eta.boarded === false && r.state.eta.notDeparted === true && !r.state.eta.passes.some(p => p.idx === 1));
  r = stepO(r.state, at(12, 50, 45), { act: 'press' }, false);
  r = stepO(r.state, at(12, 51, 10), null, false);
  assert.strictEqual(r.overlay.rs.st, 'hidden', '20초가 지나면 되돌리기도 사라진다');
  const n = stepO(r.state, at(12, 51, 15), { act: 'undo' }, false);
  assert.ok(!n.state.wait, '시간이 지난 뒤 되돌리기는 무시');
});
t('도착 3분 뒤 done 과 함께 quit:true(앱도 끝낸다), 경로 이탈 포기는 quit 아님', () => {
  let st = withOvl(mkState()), q = null, done = null;
  for (let ms = at(12, 53, 0); ms <= at(13, 10, 0); ms += 5000) {
    const r = stepO(st, ms); st = r.state;
    if (r.done) { q = r.quit; done = ms; break; }
  }
  assert.ok(done && q === true);
  const s2 = mkState(); s2.lastAt = at(12, 0, 0);
  const r2 = rideStandby({ nowMs: at(12, 55, 0) + 4 * 3600000, fixes: [], state: s2 });
  assert.ok(r2.done === true && r2.quit === false, '오래 갱신 안 된 상태는 quit 아님');
});

// ── s143: 탑승 시트 — 환승 구간 승차('환승완료') · 시트가 그릴 풍부한 값 ─────────────────────────────────
// 노드 1~3 = 1호선(S0..S2), 노드 4~6 = 2호선(T0..T2). 노드 3 에서 내려 노드 4 에서 갈아탄다. 계획: 노드 n 은 12:50 + 2(n-1)분.
function xferState() {
  const nd = [{ name: '출발', isOrigin: true }], PL = [null], cells = [], map = [], stops = [], seq = [];
  for (let i = 1; i <= 6; i++) {
    const a = i <= 3; PL[i] = 12 * 60 + 50 + 2 * (i - 1) + (a ? 0 : 3);          // 환승 걷기 3분
    nd.push({ name: (a ? 'S' : 'T') + (a ? i - 1 : i - 4), isSub: true, lineName: a ? '1호선' : '2호선', planMin: PL[i] });
    cells.push({ n: nd[i].name, t: '--:--', dc: a ? '#336699' : '#00a84d', dk: 1, m: nd[i].name + '(이동중)' }); map.push(i);
    stops.push({ i: i, lat: LAT, lng: LNG0 + DL * (i - 1), arrMs: DAY + PL[i] * 60000, pass: true, fin: i === 6 }); seq.push(i);
  }
  return { v: 1, tripSig: 'X1', eta: { nodes: nd, passes: [{ idx: 1, ms: at(12, 50, 0), src: 'gps' }, { idx: 2, ms: at(12, 52, 0), src: 'gps' }, { idx: 3, ms: at(12, 54, 0), src: 'gps' }], boarded: true, notDeparted: false, timetableFirst: true, tzOffsetMin: 540 },
    stops: stops, trail: [], cfg: { targets: [{ seqPos: 5, nodeIdx: 6, name: 'T2', kind: 'dest' }], seq: seq, allowed: {}, destName: 'T2' }, fired: {},
    ovl: { cells: cells, map: map, base: 0, theme: { bg: '#fff', fg: '#111', sub: '#888' } } };
}
const stepX = (st, ms, extra) => rideStandby(Object.assign({ nowMs: ms, fixes: [], state: JSON.parse(JSON.stringify(st)) }, extra || {}));
t('탑승 시트(환승): 앞 구간을 내린 뒤 출발 2분 전에 올라와 [환승완료] → [되돌리기], 노선 글·색·문구도 엔진이 정한다', () => {
  let r = stepX(xferState(), at(12, 55, 0));
  assert.ok(r.state.xw && r.state.xw.i === 4 && r.state.xw.k === 1, '환승 대기 ' + JSON.stringify(r.state.xw));
  assert.strictEqual(r.overlay.rs.st, 'hidden', '도착이 2분보다 멀면 안 올린다');
  const D = r.state.etaMs[4];                                   // 환승 열차 출발(도착) 시각 — 엔진이 정한 값
  r = stepX(r.state, D - 100000);
  let rs = r.overlay.rs;
  assert.ok(rs.st === 'board' && rs.bt === '환승완료' && rs.x === 1 && rs.mode === 'sub' && rs.chip === '2호선' && rs.cbg === '#00a84d' && /^#/.test(rs.cfg) && rs.nm === 'T0역' && /^2분 안에 도착/.test(rs.kick) && rs.bar === -1, JSON.stringify(rs));
  r = stepX(r.state, D - 60000);
  assert.ok(/^1분 안에 도착/.test(r.overlay.rs.kick), r.overlay.rs.kick);
  r = stepX(r.state, D - 50000, { act: 'press' });
  assert.ok(r.overlay.rs.st === 'undo' && r.overlay.rs.bt === '되돌리기' && /환승 완료/.test(r.overlay.rs.k) && !r.state.xw, JSON.stringify(r.overlay.rs));
  assert.ok(r.state.eta.passes.some(p => p.idx === 4 && p.ms === D - 50000 && p.src === 'gps'), '승차 통과가 기록된다');
  const u = stepX(r.state, D - 45000, { act: 'undo' });
  assert.ok(!u.state.eta.passes.some(p => p.idx === 4) && u.state.xw && u.state.xw.i === 4 && u.overlay.rs.st === 'board', '되돌리면 통과 기록이 지워지고 시트가 다시 열린다');
  const g = stepX(r.state, D - 20000);
  assert.ok(g.overlay.rs.st === 'hidden' && !g.state.xw, '눌러 확정하면 이 구간은 더 안 나온다');
});
t('탑승 시트(환승): 일찍 누르면 예약(알약) → 도착 1분 반 전에 확정, 앞 구간 하차 전엔 안 나오고, 3분 넘게 안 누르면 알약·"환승하셨다면"', () => {
  const st0 = xferState(); st0.eta.passes = st0.eta.passes.slice(0, 2);
  let r = stepX(st0, at(12, 52, 30));
  assert.ok(!r.state.xw && r.overlay.rs.st === 'hidden', '앞 구간(노드 3)을 내리기 전에는 환승 대기가 없다');
  const x0 = stepX(xferState(), at(12, 55, 0)), D = x0.state.etaMs[4];
  r = stepX(x0.state, at(12, 55, 5), { act: 'open' });
  assert.strictEqual(r.overlay.rs.st, 'board', '쓸어 올리면 도착이 멀어도 연다');
  r = stepX(r.state, at(12, 55, 10), { act: 'press' });
  assert.ok(r.overlay.rs.st === 'undo' && /예정/.test(r.overlay.rs.k) && r.state.xPend && !r.state.eta.passes.some(p => p.idx === 4), JSON.stringify(r.overlay.rs));
  r = stepX(r.state, D - 80000);
  assert.ok(!r.state.xPend && r.state.eta.passes.some(p => p.idx === 4) && r.overlay.rs.st === 'hidden', '예약은 도착 1분 반 전에 확정된다');
  const x2 = stepX(x0.state, D - 60000); const l = stepX(x2.state, D + 190000);
  assert.ok(l.overlay.rs.st === 'wait' && /^환승하셨다면 눌러 주세요/.test(l.overlay.rs.kick) && l.overlay.rs.late === true, JSON.stringify(l.overlay.rs));
  const c = stepX(x2.state, D - 50000, { act: 'close' });
  assert.strictEqual(c.overlay.rs.st, 'wait', '도착 2분 안에 닫으면 알약으로');
  assert.strictEqual(stepX(c.state, D - 30000).overlay.rs.st, 'wait', '다시 올리지 않는다');
  assert.strictEqual(stepX(c.state, D - 20000, { act: 'pill' }).overlay.rs.st, 'board', '알약을 누르면 다시 연다');
  const e = stepX(x0.state, D - 150000);
  assert.strictEqual(e.overlay.rs.st, 'hidden', '처음 올리기 전에는 숨김');
  const far = stepX(stepX(x0.state, D - 140000, { act: 'open' }).state, D - 130000, { act: 'close' });
  assert.strictEqual(far.overlay.rs.st, 'wait', '2분보다 먼 때 닫은 것은 알약');
  assert.strictEqual(stepX(far.state, D - 100000).overlay.rs.st, 'board', '2분 안이 되면 자동으로 다시 올라온다');
});
t('탑승 시트(첫 구간): 같은 값(kick · chip · 색 · 막대)도 채운다', () => {
  const w0 = waitState(); w0.eta.nodes = w0.eta.nodes.map(n => Object.assign({}, n, n.isOrigin ? {} : { isSub: true, isBus: false, lineName: '인천1호선' }));
  const r = stepO(w0, at(12, 50, 20), null, false), rs = r.overlay.rs;
  assert.ok(rs.st === 'board' && rs.bt === '탑승' && rs.x === 0 && rs.mode === 'sub' && rs.chip === '인천1호선' && rs.cbg === '#336699' && /^2분 안에 도착/.test(rs.kick), JSON.stringify(rs));
  const lt = stepO(r.state, at(12, 53, 0), null, false).overlay.rs;
  assert.ok(lt.bar > 0.6 && lt.bar < 1 && /^곧 도착|^도착했어요/.test(lt.kick), JSON.stringify(lt));
});

// ── s144: 탑승 버튼 보정 — 방금 떠난 차 인정 · 어느 차를 탔나(시각표) · 승차역에서 먼 곳에서 누르면 거두기 ─────────────────
const fakeNt = (dep) => ({ boardTable: (q) => ({ dk: '상', depMin: typeof dep === 'function' ? dep(q) : dep }) });
const pressReq = (st, ms, extra) => Object.assign({ nowMs: ms, fixes: [], state: JSON.parse(JSON.stringify(st)), act: 'press' }, extra || {});
t('탑승 버튼 보정: 시각표에 물을 것(rsPressQuery) — 누를 때 · 지하철 구간만, 방금/다음 차는 rsAttachPressTT 가 정한다', () => {
  const x0 = stepX(xferState(), at(12, 55, 0));
  assert.strictEqual(rsPressQuery({ nowMs: at(12, 55, 20), state: x0.state }), null, '누르는 손짓이 아니면 묻지 않는다');
  const q = rsPressQuery(pressReq(x0.state, at(12, 55, 20)));
  assert.ok(q && q.i === 4 && q.line === '2호선' && q.from === 'T0' && q.to === 'T1' && q.atMin === 12 * 60 + 55, JSON.stringify(q));
  const bus = JSON.parse(JSON.stringify(x0.state)); bus.eta.nodes[4].isSub = false; bus.eta.nodes[4].isBus = true;
  assert.strictEqual(rsPressQuery(pressReq(bus, at(12, 55, 20))), null, '버스는 시각표가 없다');
  const rq = pressReq(x0.state, at(12, 55, 20));
  assert.ok(rsAttachPressTT(rq, fakeNt(12 * 60 + 55)) && rq.pressTT.late === 775 && rq.pressTT.depMin === 775 && rq.pressTT.i === 4, JSON.stringify(rq.pressTT));
  const rq2 = pressReq(x0.state, at(12, 55, 20)); rsAttachPressTT(rq2, fakeNt(12 * 60 + 58));
  assert.ok(rq2.pressTT.late === null && rq2.pressTT.depMin === 778, '다음 차: late 없음');
  const rq3 = pressReq(x0.state, at(12, 55, 20)); rsAttachPressTT(rq3, fakeNt(12 * 60 + 40));
  assert.strictEqual(rq3.pressTT.late, null, '1분보다 더 오래 전에 떠난 차는 인정하지 않는다');
  assert.strictEqual(rsPickMs({ i: 4, nowM: 775, depMin: 790, late: null }, 4, at(12, 55, 20)), at(12, 55, 20), '다음 차가 12분보다 멀면 누른 시각');
});
t('탑승 버튼 보정(환승): 일찍 눌러도 방금 떠난 차가 있으면 예약 없이 그 차 출발(:30)로 바로 확정', () => {
  const x0 = stepX(xferState(), at(12, 55, 0));
  const rq = pressReq(x0.state, at(12, 55, 40)); rsAttachPressTT(rq, fakeNt(12 * 60 + 55));
  const r = rideStandby(rq);
  assert.ok(!r.state.xPend && !r.state.xw && r.state.eta.passes.some(p => p.idx === 4 && p.ms === at(12, 55, 30) && p.src === 'gps'), JSON.stringify(r.state.eta.passes) + JSON.stringify(r.notes));
  assert.strictEqual(r.overlay.rs.st, 'undo');
  const u = rideStandby({ nowMs: at(12, 55, 45), fixes: [], state: r.state, act: 'undo' });
  assert.ok(!u.state.eta.passes.some(p => p.idx === 4) && u.state.xw, '되돌리면 지워진다');
  const rq2 = pressReq(x0.state, at(12, 55, 40)); rsAttachPressTT(rq2, fakeNt(12 * 60 + 58));
  const r2 = rideStandby(rq2);
  assert.ok(r2.state.xPend && !r2.state.eta.passes.some(p => p.idx === 4), '방금 떠난 차가 없으면 예약');
  const rq3 = pressReq(x0.state, at(12, 55, 40)); rq3.pressTT = null;
  assert.ok(rideStandby(rq3).state.xPend, '시각표를 못 읽어도 평소처럼 예약');
});
t('탑승 버튼 보정: 방금 떠난 차 인정은 승차역에서 600m 넘게 멀면 하지 않는다', () => {
  const x0 = stepX(xferState(), at(12, 55, 0));
  const T = at(12, 55, 40), stop = x0.state.stops.filter(s => s.i === 4)[0];
  const rq = pressReq(x0.state, T, { fixes: [[T - 3000, stop.lat + 0.0072, stop.lng, 10]] }); rsAttachPressTT(rq, fakeNt(12 * 60 + 55));
  const r = rideStandby(rq);
  assert.ok(r.state.xPend && !r.state.eta.passes.some(p => p.idx === 4), JSON.stringify(r.notes));
});
t('탑승 버튼 보정(첫 구간): 누른 시각이 아니라 방금 떠난 차 · 다음 차 시각을 승차 통과로 적는다', () => {
  const w0 = waitState(); w0.eta.nodes = w0.eta.nodes.map(n => Object.assign({}, n, n.isOrigin ? {} : { isSub: true, isBus: false, lineName: '인천1호선' }));
  const T = at(12, 50, 35);
  let rq = { nowMs: T, fixes: [], state: JSON.parse(JSON.stringify(withOvl(w0))), act: 'press' };
  rsAttachPressTT(rq, fakeNt(12 * 60 + 50));
  let r = rideStandby(rq);
  assert.ok(r.state.eta.passes.some(p => p.idx === 1 && p.ms === at(12, 50, 30)), '방금 떠난 12:50 차 → 12:50:30 ' + JSON.stringify(r.state.eta.passes));
  rq = { nowMs: T, fixes: [], state: JSON.parse(JSON.stringify(withOvl(w0))), act: 'press' };
  rsAttachPressTT(rq, fakeNt(12 * 60 + 53));
  r = rideStandby(rq);
  assert.ok(r.state.eta.passes.some(p => p.idx === 1 && p.ms === at(12, 53, 30)), '다음 차(3분 뒤) → 12:53:30');
  const u = rideStandby({ nowMs: T + 5000, fixes: [], state: r.state, act: 'undo' });
  assert.ok(u.state.wait && !u.state.eta.passes.some(p => p.idx === 1), '되돌리기 정상');
});
t('탑승 버튼 보정: 승차역에서 800m 넘게 먼 곳에서 누르면 버튼을 거두고 알린다 · 역 근처나 위치 없음은 그대로', () => {
  const x0 = stepX(xferState(), at(12, 55, 0));
  const T = at(12, 56, 20), stop = x0.state.stops.filter(s => s.i === 4)[0], D = x0.state.etaMs[4];
  const near = pressReq(x0.state, D - 50000, { fixes: [[D - 52000, stop.lat, stop.lng, 10]] });
  assert.ok(rideStandby(near).state.eta.passes.some(p => p.idx === 4), '역에 있으면 확정');
  const away = rideStandby(pressReq(x0.state, D - 50000, { fixes: [[D - 52000, stop.lat + 0.012, stop.lng, 10]] }));
  assert.ok(!away.state.eta.passes.some(p => p.idx === 4) && away.state.xw && away.state.xw.i === 4, '멀면 확정이 취소된다 ' + JSON.stringify(away.notes));
  assert.ok(away.overlay.rs.st === 'board' && /떨어져 있어요/.test(away.overlay.rs.kick), JSON.stringify(away.overlay.rs));
  const later = rideStandby({ nowMs: D - 46000, fixes: [], state: away.state });
  assert.ok(/떨어져 있어요/.test(later.overlay.rs.kick), '안내는 몇 초 붙어 있다');
  const gone = rideStandby({ nowMs: D + 10000, fixes: [], state: later.state });
  assert.ok(!/떨어져/.test(gone.overlay.rs.kick) && !gone.state.rsToast, '시간이 지나면 사라진다');
  const none = rideStandby(pressReq(x0.state, D - 50000));
  assert.ok(none.state.eta.passes.some(p => p.idx === 4), '위치가 없으면(지하) 시각표를 믿는다');
  const wL = waitState(); const wr = rideStandby({ nowMs: at(12, 50, 35), fixes: [[at(12, 50, 33), LAT + 0.02, LNG0, 10]], state: JSON.parse(JSON.stringify(withOvl(wL))), act: 'press' });
  assert.ok(wr.state.wait && wr.state.eta.boarded === false, '첫 구간도 멀면 거둔다 ' + JSON.stringify(wr.notes));
});

// ── s146: 경로 카드 버튼 줄의 오른쪽 칸(탑승 → 환승 → 도착) — 칸의 뜻·전환은 엔진이 정한다 ─────────────────────────────
t('버튼 줄 칸: 처음엔 탑승(밀고 들어옴) → 첫 구간 뒤 환승(위에서 내려옴) → 마지막 구간 뒤 도착(아래에서 올라옴), 누를 수 있는지(can)도 엔진이 말한다', () => {
  let r = stepO(waitState(), at(12, 47, 0), null, false);
  assert.ok(r.row && r.row.slot === 'board' && r.row.label === '탑승' && r.row.leg === 0 && r.row.can === true && r.row.anim.kind === 'push_in' && r.row.anim.sq === at(12, 47, 0) && r.row.anim.ms === 420 && r.row.anim.o === 'none', JSON.stringify(r.row));
  r = stepO(r.state, at(12, 47, 5), null, false);
  assert.ok(r.row.anim.kind === 'push_in' && r.row.anim.sq === at(12, 47, 0), '전환은 다음 전환까지 그대로 들고 있다(시각이 안 바뀐다)');
  r = stepO(r.state, at(12, 50, 35), { act: 'press' }, false);
  assert.ok(r.row.slot === 'arrive' && r.row.label === '도착' && r.row.leg === -1 && r.row.anim.kind === 'slide_up' && r.row.anim.o === 'board' && r.row.anim.sq === at(12, 50, 35), JSON.stringify(r.row));
  const xs0 = xferState(); xs0.eta.passes = xs0.eta.passes.slice(0, 1);
  let x = stepX(xs0, at(12, 51, 0));
  assert.ok(x.row.slot === 'transfer' && x.row.label === '환승' && x.row.leg === 1 && x.row.can === false && x.row.anim.kind === 'push_in', '앞 구간을 내리기 전: 환승 칸은 있지만 아직 누를 수 없다 ' + JSON.stringify(x.row));
  const x1 = stepX(xferState(), at(12, 55, 0));
  assert.ok(x1.row.slot === 'transfer' && x1.row.can === true, '내린 뒤에는 누를 수 있다');
  const D = x1.state.etaMs[4];
  const x2 = stepX(x1.state, D - 50000, { act: 'press' });
  assert.ok(x2.row.slot === 'arrive' && x2.row.anim.kind === 'slide_up' && x2.row.anim.o === 'transfer', JSON.stringify(x2.row));
  const x3 = stepX(x2.state, D - 45000, { act: 'undo' });
  assert.ok(x3.row.slot === 'transfer' && x3.row.anim.kind === 'slide_down' && x3.row.anim.o === 'arrive', '되돌리면 반대 방향 전환 ' + JSON.stringify(x3.row));
  assert.strictEqual(stepO(withOvl(mkState()), at(12, 59, 0)).row.slot !== undefined, true);
});

// ── s192: 서울 지하철 실시간 도착정보로 [탑승] 영점(웹 resolveRealtimeDepartMs 규칙) ─────────────────
const LV = (o) => Object.assign({ subwayId: '1002', trainLineNm: '신도림행 - T1방면', arvlCd: '99', barvlDt: '120', updnLine: '내선' }, o || {});
t('실시간 도착: 호선·방향(다음 역 방면)이 맞는 열차만, 가장 먼저 오는 것을 가린다', () => {
  const x0 = stepX(xferState(), at(12, 55, 0)), q = rsPressQuery(pressReq(x0.state, at(12, 55, 20))), N = at(12, 55, 20);
  assert.strictEqual(rsPickLive([LV({ barvlDt: '300' }), LV({ barvlDt: '90' })], q, N), N + 90000, '더 빨리 오는 열차');
  assert.strictEqual(rsPickLive([LV({ trainLineNm: '성수행 - T9방면', barvlDt: '30' }), LV({ barvlDt: '200' })], q, N), N + 200000, '반대 방향(다른 방면)은 건너뛴다');
  assert.strictEqual(rsPickLive([LV({ subwayId: '1003', barvlDt: '30' })], q, N), null, '다른 호선은 쓰지 않는다');
  assert.strictEqual(rsPickLive([LV({ arvlCd: '1', barvlDt: '0' })], q, N), N, '도착(1)은 지금');
  assert.strictEqual(rsPickLive([LV({ arvlCd: '0', barvlDt: '0' })], q, N), N, '진입(0)은 지금');
  assert.strictEqual(rsPickLive([LV({ arvlCd: '2', barvlDt: '0' })], q, N), null, '이미 출발(2)한 열차는 건너뛴다');
  assert.strictEqual(rsPickLive([LV({ barvlDt: '0' })], q, N), null, '시각을 모르면 건너뛴다');
  assert.strictEqual(rsPickLive([LV({ barvlDt: String(13 * 60) })], q, N), null, '12분보다 먼 열차는 쓰지 않는다');
  assert.strictEqual(rsPickLive([LV({ trainLineNm: '신도림행 - T1역방면' })], q, N), N + 120000, "'역' 글자는 무시");
  assert.strictEqual(rsPickLive(null, q, N), null); assert.strictEqual(rsPickLive([], q, N), null);
});
t('실시간 도착: pressTT.liveMs 가 시각표보다 먼저 — 시각표가 없어도 붙는다, 못 받으면 시각표 그대로', () => {
  const x0 = stepX(xferState(), at(12, 55, 0)), N = at(12, 55, 20);
  const rq = pressReq(x0.state, N); rsAttachPressTT(rq, fakeNt(12 * 60 + 58));
  assert.ok(rsAttachPressLive(rq, [LV({ barvlDt: '150' })]) && rq.pressTT.liveMs === N + 150000 && rq.pressTT.depMin === 778);
  assert.strictEqual(rsPickMs(rq.pressTT, 4, N), N + 150000, '실시간이 먼저');
  const rq2 = pressReq(x0.state, N); assert.ok(rsAttachPressLive(rq2, [LV({ barvlDt: '150' })]) && rq2.pressTT.liveMs === N + 150000 && rq2.pressTT.late === null);
  let rq3 = pressReq(x0.state, N); rsAttachPressTT(rq3, fakeNt(12 * 60 + 58));
  assert.strictEqual(rsAttachPressLive(rq3, null), false); assert.strictEqual(rq3.pressTT.liveMs, undefined);
  assert.strictEqual(rsPickMs(rq3.pressTT, 4, N), at(12, 58, 30), '실시간이 없으면 시각표');
  const r = rideStandby(rq);
  assert.ok(r.state.xPend && r.state.xPend.lv === N + 150000, '일찍 누르면 예약 — 실시간으로 가린 열차 시각을 예약에 적어 둔다 ' + JSON.stringify(r.state.xPend));
  const arr = r.state.xw.arrMs, c = rideStandby({ nowMs: arr - 60000, fixes: [], state: r.state });
  assert.ok(!c.state.xPend && c.state.eta.passes.some(p => p.idx === 4 && p.ms === N + 150000), '예약 확정 때 그 시각을 통과로 적는다 ' + JSON.stringify(c.state.eta.passes) + JSON.stringify(c.notes));
  const r0 = rideStandby(rq3 = pressReq(x0.state, N)); assert.ok(r0.state.xPend && r0.state.xPend.lv === undefined, '실시간이 없으면 예전처럼');
});
t('실시간 도착: 첫 승차 [탑승](st.wait) 도 실시간 도착 시각을 통과 시각으로 잡는다 · 못 받으면 시각표', () => {
  const w0 = waitState(); w0.eta.nodes = w0.eta.nodes.map(n => Object.assign({}, n, n.isOrigin ? {} : { isSub: true, isBus: false, lineName: '2호선' }));
  const T = at(12, 50, 35), q0 = rsPressQuery({ nowMs: T, fixes: [], state: JSON.parse(JSON.stringify(withOvl(w0))), act: 'press' });
  assert.ok(q0 && q0.i === 1, JSON.stringify(q0));
  const lv = LV({ trainLineNm: '종점행 - ' + q0.to + '방면', barvlDt: '100' });
  let rq = { nowMs: T, fixes: [], state: JSON.parse(JSON.stringify(withOvl(w0))), act: 'press' };
  rsAttachPressTT(rq, fakeNt(12 * 60 + 53));
  assert.ok(rsAttachPressLive(rq, [lv]));
  let r = rideStandby(rq);
  assert.ok(r.state.eta.passes.some(p => p.idx === 1 && p.ms === T + 100000) && /실시간 100초/.test(r.notes.join('|')), JSON.stringify(r.state.eta.passes) + JSON.stringify(r.notes));
  rq = { nowMs: T, fixes: [], state: JSON.parse(JSON.stringify(withOvl(w0))), act: 'press' };
  rsAttachPressTT(rq, fakeNt(12 * 60 + 53)); rsAttachPressLive(rq, [LV({ subwayId: '1005' })]);
  r = rideStandby(rq);
  assert.ok(r.state.eta.passes.some(p => p.idx === 1 && p.ms === at(12, 53, 30)), '맞는 열차가 없으면 시각표');
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

const liveHttpTest = async () => {
  const x0 = stepX(xferState(), at(12, 55, 0)), N = at(12, 55, 20), prev = global.ntEnsure;
  global.ntEnsure = async () => fakeNt(12 * 60 + 58);
  try {
    const mk = (fn) => ({ BUSAPI: { fetch: fn } });
    const post = (env, rq) => handleRideStandby(new Request('https://x.test/ride-standby', { method: 'POST', body: JSON.stringify(rq) }), env).then(r => r.json());
    let asked = '';
    const ok = mk(async (req) => { asked = decodeURIComponent(new URL(req.url).searchParams.get('path')); return new Response(JSON.stringify({ realtimeArrivalList: [LV({ barvlDt: '90' })] }), { status: 200 }); });
    const a = await post(ok, pressReq(x0.state, N));
    assert.ok(/^realtimeStationArrival\/0\/20\/T0$/.test(asked), asked);
    assert.ok(a.state.eta.passes.some(p => p.idx === 4 && p.ms === N + 90000) || a.state.xPend, JSON.stringify(a.notes));
    const pend = mk(async () => new Response(JSON.stringify({ ok: false, error: 'relay pending' }), { status: 503 }));
    const b = await post(pend, pressReq(x0.state, N));
    assert.ok(b.state.xPend && !b.state.eta.passes.some(p => p.idx === 4), '중계가 준비 중이면 시각표 그대로(예약)');
    const t0 = Date.now(), hang = mk(() => new Promise(() => { }));
    const c = await post(hang, pressReq(x0.state, N)), dt = Date.now() - t0;
    assert.ok(dt >= 2700 && dt < 3600 && c.state, '응답이 없어도 3초 안에 시각표로 넘어간다 ' + dt);
    const d = await post({}, pressReq(x0.state, N)); assert.ok(d.state, 'BUSAPI 바인딩이 없어도 동작');
  } finally { if (prev) global.ntEnsure = prev; else delete global.ntEnsure; }
};
liveHttpTest().then(() => { pass++; console.log('  ok   HTTP 처리: 서울 실시간 도착을 받으면 먼저 쓰고, 못 받거나 늦으면(3초) 시각표로'); }, (e) => { fail++; console.log('  FAIL HTTP 서울 실시간', String(e && e.message).split('\n')[0]); })
  .then(() => httpTest()).then(() => { pass++; console.log('  ok   HTTP 처리: 평문 JSON 도 gzip 으로 눌러 보낸 JSON 도 같은 답을 준다(데이터 절약)'); }, (e) => { fail++; console.log('  FAIL HTTP 처리', String(e && e.message).split('\n')[0]); })
  .then(() => { console.log('ride_standby: pass', pass, 'fail', fail); process.exit(fail ? 1 : 0); });
