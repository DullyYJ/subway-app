// 대기 모드 엔진(engine/ride-standby.js) 단위 시험 — 브라우저 없이 Node 만으로 돈다.
// 실행: node test/ride_standby.test.js
//   웹뷰가 사라져도 네이티브가 5초마다 이 엔진을 불러 영점·시각 밀고 당기기·하차 알림을 이어간다. 상태(state)는 요청에 실려 오가고 서버는 기억하지 않는다.
'use strict';
const assert = require('assert');
const path = require('path');
const { rsRecoFresh, rsMonoPos, rideStandby, rsAlerts, handleRideStandby, rsPressQuery, rsAttachPressTT, rsPickMs, rsPickLive, rsAttachPressLive, rsFetchSeoulArrivals } = require(path.join(__dirname, '..', 'engine', 'ride-standby.js'));

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '\n      ', String(e && e.message).split('\n')[0]); } };
t('s271: 받아 둔 추천 글의 하차 N분 전 · 도착 예정 시각을 엔진이 지금 값으로 고친다(앱 계산 제거)', () => {
  const ARR = 1760000000000;   // KST 17:53
  const fr = rsRecoFresh(['🚉 하차 7분 전 · 부평 ☕', '하차 7분 전이에요.\n부평 도착 예정 07:30\n\n카푸치노'], ARR, ARR - 120000);
  assert.deepStrictEqual(fr, ['🚉 하차 2분 전 · 부평 ☕', '하차 2분 전이에요.\n부평 도착 예정 17:53\n\n카푸치노']);
  assert.strictEqual(rsRecoFresh(['하차 7분 전'], ARR, ARR - 3600000)[0], '하차 7분 전', '한참 남았으면 7분');
  assert.strictEqual(rsRecoFresh(['하차 7분 전'], ARR, ARR + 60000)[0], '하차 1분 전', '지났으면 1분');
  assert.strictEqual(rsRecoFresh(null, 1, 1), null);
  assert.strictEqual(rsRecoFresh(['하차 7분 전'], 0, 5)[0], '하차 7분 전', '입력이 이상하면 그대로');
  assert.deepStrictEqual(rsRecoFresh(['a', null], ARR, ARR - 60000), ['a', null]);
});

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

t('도착 5분 뒤 done, 그 전에는 done 이 아니다(s237: 3분 → 5분)', () => {
  let arrAt = null, doneAt = null;
  ride(mkState(), at(12, 53, 0), at(13, 10, 0), 0, (ms, l) => { if (l.alert && l.alert.type === 'arrive') arrAt = ms; if (l.done && !doneAt) doneAt = ms; });
  assert.ok(arrAt && doneAt, '도착과 종료가 있어야 한다');
  assert.ok(doneAt - arrAt >= 300000 && doneAt - arrAt <= 310000, '도착 ' + arrAt + ' 종료 ' + doneAt);
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
  // s207: 그림 아래 한 줄과 글머리는 엔진이 정한다 — 앱(ShareCore/ShareArt)은 글을 짓지 않는다
  assert.ok(shs.every(x => x.foot === (x.moving && x.next ? '다음 역 ' + x.next + ' 이동 중 · ' + x.left + '개 역 남음' : (x.left > 0 ? x.left + '개 역 남음' : '도착했어요'))), '아래 한 줄(foot)');
  assert.ok(shs.some(x => /이동 중 · \d+개 역 남음$/.test(x.foot)) && z.foot === '도착했어요', '이동 중 줄 · 도착 줄');
  assert.deepStrictEqual(a.lb, { t: '길동무 · 내 위치', a: '도착예정시간: ', r: '남은시간 ' });
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
    assert.strictEqual(o.alertVibe, o.alert > 0);   // s198: 웹 _ovlLines 와 같다 — 단계가 켜져 있고 설정(cfg.allowed)이 허용하면 오버레이가 진동한다(엔진이 정하고 오버레이는 울리기만)
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

t('이탈: 정거장에서 내려 택시로 멀어지면 이탈 알림이 한 번 나가고, 그 뒤 하차 알림은 보류되며, 시간이 아무리 지나도 안내는 끝나지 않는다(확정은 사용자가 끝내거나 도착할 때까지)', () => {
  let st = mkState(), alerts = [], doneAt = null, texts = [], offs = [];
  const leaveMs = at(12, 56, 0), stopLng = LNG0 + DL * 2;   // 3번 정거장(12:56)에서 내린다
  for (let ms = at(12, 53, 0); ms <= at(15, 0, 0); ms += 5000) {      // 2시간 넘게 이탈 상태
    const onTrain = ms < leaveMs;
    const lat = onTrain ? LAT : LAT + 12 * (ms - leaveMs) / 1000 / 111320, lng = onTrain ? trainLng(ms, 0) : stopLng;
    const r = rideStandby({ nowMs: ms, fixes: [[ms, lat, lng, 15]], state: JSON.parse(JSON.stringify(st)) }); st = r.state;
    if (r.alert) alerts.push({ ms: ms, a: r.alert });
    texts.push(r.ongoing.text);
    if (r.off) offs.push({ ms: ms, at: r.off.at });
    if (r.done) { doneAt = ms; break; }
  }
  const off = alerts.filter(x => x.a.type === 'offroute');
  assert.strictEqual(off.length, 1, JSON.stringify(alerts.map(x => x.a.type)));
  assert.ok(off[0].ms - leaveMs > 30000 && off[0].ms - leaveMs < 260000, '이탈 알림 시각 ' + (off[0].ms - leaveMs) / 1000 + '초 뒤');
  assert.ok(!alerts.some(x => x.ms > off[0].ms && /near_arrive|arrive/.test(x.a.type)), '이탈 뒤 하차 알림');
  assert.ok(texts.some(x => /경로를 벗어났어요/.test(x)));
  assert.strictEqual(doneAt, null, '경로를 벗어나도 안내는 스스로 끝나지 않는다: ' + doneAt);
  // 앱이 '지금 위치에서 다시 찾을까요?'를 한 번 묻도록 엔진이 이탈 중임을 알린다(off.at = 벗어나기 시작한 시각 — 같은 이탈 동안 바뀌지 않는다)
  assert.ok(offs.length > 100 && offs[0].ms > leaveMs && offs.every(x => x.at === offs[0].at), '이탈 중 off.at 이 계속 같은 값: ' + offs.length);
  assert.ok(offs[0].ms === off[0].ms, '이탈 알림과 같은 걸음부터 off 가 나온다');
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
  const st = mkState(); st.eta.opts = { planSecOffset: 50 };      // s294: 도착 초는 기본이 노드마다 20~30초 난수 — 이 시험은 고정 :50 약속으로 짠 것
  st.eta.nodes = st.eta.nodes.map(n => n.isBus ? Object.assign({}, n, { isBus: false, isSub: true, lineName: '인천1호선' }) : n);      // s268: 지하철 구간(시각표 우선) 기준 — 앞선 버스 시험이 공용 nodes 를 버스로 바꿔 둔다
  // 3번 역 도착 12:56:00 (etaMs 가 없으면 stops.arrMs)
  const near = [at(12, 55, 31), at(12, 56, 0), at(12, 56, 39)], far = [at(12, 55, 10), at(12, 56, 45)];      // s266: 승차 노드(12:52 쯤) 앞뒤 3분(환승·탑승 확인 창)도 짧은 간격이라 12:55:00 은 '가까움'
  near.forEach(ms => { const r = rideStandby({ nowMs: ms, fixes: [], state: JSON.parse(JSON.stringify(st)) }); assert.strictEqual(r.nextMs, 2500, 'near '+new Date(ms).toISOString() + ' ' + r.nextMs); });
  far.forEach(ms => { const r = rideStandby({ nowMs: ms, fixes: [], state: JSON.parse(JSON.stringify(st)) }); assert.strictEqual(r.nextMs, 5000, 'far '+new Date(ms).toISOString() + ' ' + r.nextMs); });
  const s2 = mkState(); s2.eta.notDeparted = true;
  assert.strictEqual(rideStandby({ nowMs: at(12, 56, 0), fixes: [], state: s2 }).nextMs, 5000, '승차 전');
  { const q = rideStandby({ nowMs: at(12, 53, 0), fixes: [], state: Object.assign(mkState(), { arrivedAt: at(12, 47, 0) }) }); assert.ok(q.done && q.nextMs === 5000, '끝나면 기본 간격 ' + q.nextMs); }
});


// ── 오버레이 하단 줄 · 탑승 줄 · 앱 종료 (s109) ─────────────────────────────────────
const stepO = (st, ms, extra, fix) => rideStandby(Object.assign({ nowMs: ms, fixes: fix === false ? [] : [[ms, LAT, trainLng(ms, 0), 20]], state: JSON.parse(JSON.stringify(st)) }, extra || {}));
t('추천 줄은 한 정거장 전에도 그대로 나오고(s237: 내릴 준비 줄이 덮지 않는다), 앱 종료 줄은 도착 3분 뒤에야 나온다', () => {
  let st = withOvl(mkState()), pre = [], post = [], rcSent = false, arr = null;
  for (let ms = at(12, 53, 0); ms <= at(13, 10, 0); ms += 5000) {
    const r = stepO(st, ms, rcSent ? null : { rc: { a: '맛있는집', b: '점심 한 끼', m: '눌러서 위치 확인', go: '메뉴 보러가기' } }); rcSent = true; st = r.state;
    if (r.done) break;
    if (st.arrivedAt && !arr) arr = st.arrivedAt;
    const o = r.overlay; if (!o) continue;
    if (!arr && o.alert === 1) pre.push({ ms: ms, reco: o.reco, getoff: o.getoff.on });
    if (o.getoff && o.getoff.on) post.push({ ms: ms, g: o.getoff });
  }
  assert.ok(pre.length > 3, '한 정거장 전 구간이 있다');
  assert.ok(pre.every(x => x.getoff === false), '도착 전에는 앱 종료 줄이 없다');
  assert.ok(pre.some(x => x.reco.on && x.reco.go === '메뉴 보러가기' && x.reco.m === '눌러서 위치 확인'), '한 정거장 전에도 추천 줄(아이템에 맞춘 버튼 글 · 셋째 줄)이 나온다');
  assert.ok(arr && post.length > 3 && post[0].ms - arr >= 180000 && post[0].ms - arr <= 190000, '앱 종료 줄은 도착 3분 뒤: ' + (post.length ? post[0].ms - arr : 'none'));
  assert.ok(post.every(x => x.g.a === '도착했어요' && x.g.end === '앱 종료' && x.g.b.length > 0 && x.g.b.length <= 40 && /^(dolsom|lovel|dudung|sul|ppopu|chaeng)$/.test(x.g.ch)));
  assert.ok(new Set(post.map(x => x.g.ch)).size === 1, '같은 도착 동안 캐릭터는 그대로');
});
t('추천 줄 버튼 글(go)은 엔진이 정한 대로 7~8자 안에서 그대로 전달된다(없으면 맛집 보기)', () => {
  const g = (rc) => stepO(withOvl(mkState()), at(12, 50, 0), { rc: rc }).state.rcAd.go;
  assert.strictEqual(g({ a: 'x', b: 'y', go: '비 피할 맛집' }), '비 피할 맛집');
  assert.strictEqual(g({ a: 'x', b: 'y', go: '쿠팡 보기' }), '쿠팡 보기');
  assert.strictEqual(g({ a: 'x', b: 'y' }), '맛집 보기');
  assert.strictEqual(g({ a: 'x', b: 'y', go: '아주아주 길고 긴 버튼 이름' }).length, 8);
});
t('s258 추천 동기화: rcDis -1 = 지금 보이는 추천 줄 닫기(앱 팝업·알림에서 처리하면 오버레이 줄도 사라진다) · rcRetry 는 못 보낸 추천을 다시 판정하게 한다', () => {
  let st = withOvl(mkState());
  let r = stepO(st, at(12, 50, 0), { rc: { a: '맛있는집', b: '점심 한 끼', m: '120m · 한식', go: '맛집 보기' } }); st = r.state;
  r = stepO(st, at(12, 54, 0)); st = r.state;
  assert.ok(r.overlay.reco.on, '7분 안엔 오버레이 줄이 있다');
  r = stepO(st, at(12, 54, 5), { rcDis: -1 }); st = r.state;
  assert.strictEqual(r.overlay.reco.on, false, 'rcDis -1 로 앱에서 처리하면 오버레이 줄이 사라진다');
  r = stepO(st, at(12, 54, 20)); st = r.state;
  assert.strictEqual(r.overlay.reco.on, false, '다시 뜨지 않는다');
  st.recoKey = 'k|d'; st.recoAt = at(12, 54, 0);
  r = stepO(st, at(12, 54, 30), { rcRetry: 1 }); st = r.state;
  assert.ok(r.reco && r.reco.fire === true, 'rcRetry: 추천 기록을 비워 같은 걸음에서 다시 판정해 보낸다(창이 열려 있는 동안)');
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
  let r = stepO(waitState(), at(12, 40, 0), null, false);
  assert.strictEqual(r.overlay.rs.st, 'wait', '출발 12분 전: 아직 알약');
  r = stepO(r.state, at(12, 40, 5), { act: 'pill' }, false); assert.strictEqual(r.overlay.rs.st, 'board');
  r = stepO(r.state, at(12, 40, 10), { act: 'close' }, false); assert.strictEqual(r.overlay.rs.st, 'wait');
  r = stepO(r.state, at(12, 42, 5), null, false); assert.strictEqual(r.overlay.rs.st, 'wait', 's256: 사용자가 접어 둔 건 2분 전까지 알약');
  assert.strictEqual(stepO(waitState(), at(12, 42, 5), null, false).overlay.rs.st, 'board', 's256: 안 접었으면 출발 10분 전부터 [탑승] 버튼이 보이는 줄');
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
t('도착 5분 뒤 done 과 함께 quit:true(앱도 끝낸다), 오래 갱신 안 된 상태는 quit 아님', () => {
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
// ★ s293 (YJ: 아라역에서 환승을 안 눌렀는데 열차를 탔다 — GPS 로 이동이 보이면 자동 탑승 · 마커·장면이 대기에 멈추지 않게)
t('s293 환승 자동 탑승: 역에서 걷는 속도로 머문 뒤 400m 넘게 4m/s 이상으로 벗어나면 누르지 않아도 탄 것으로 확정(통과는 역에서 떠난 시각) · 걸어서 멀어지면 아니다', () => {
  const M = 1 / (111320 * Math.cos(LAT * Math.PI / 180)), lng4 = LNG0 + DL * 3;
  let r = stepX(xferState(), at(12, 55, 0)), D = r.state.etaMs[4];
  assert.ok(r.state.xw && r.state.xw.i === 4, '환승 대기');
  const still = [0, 1, 2, 3].map(k => [D - 60000 + k * 10000, LAT, lng4 + (k % 2) * 2 * M, 10]);
  r = stepX(r.state, D - 25000, { fixes: still });
  assert.ok(r.state.xw && r.state.xGo && r.state.xGo.ts > 0, '역에 머문 것을 기억한다(아직 대기)');
  const seenAt = r.state.xGo.ts;
  const fast = []; for (let k = 1; k <= 14; k++) fast.push([D - 25000 + k * 5000, LAT, lng4 + 6 * 5 * k * M, 10]);
  const done = stepX(r.state, D + 46000, { fixes: fast });
  assert.ok(!done.state.xw && done.state.eta.passes.some(p => p.idx === 4 && p.ms === seenAt && p.src === 'gps'), '자동 탑승 확정 ' + JSON.stringify(done.state.xw) + ' ' + done.notes.filter(n => /자동/.test(n)));
  assert.ok(done.notes.some(n => /환승 열차 자동 탑승\(4번\)/.test(n)), '이유가 notes 에 남는다');
  const walk = []; for (let k = 1; k <= 14; k++) walk.push([D - 25000 + k * 5000, LAT, lng4 + 1.4 * 5 * k * M, 10]);
  const w = stepX(r.state, D + 46000, { fixes: walk });
  assert.ok(w.state.xw && w.state.xw.i === 4, '걷는 속도로는 확정하지 않는다');
  const jump = stepX(r.state, D + 46000, { fixes: [[D + 44000, LAT, lng4 + 900 * M, 10], [D + 46000, LAT, lng4 + 905 * M, 10]] });
  assert.ok(jump.state.xw && jump.state.xw.i === 4, '좌표가 두 개뿐이면(빠른 속도 증거 부족) 확정하지 않는다');
});
t('s293 환승 자동 탑승: 시각표 다음 차(bl.x)를 못 구해도 계획 출발 4분이 지나도록 증거가 없으면 시각표대로 탄 것으로 이어간다 · 그 전에는 대기', () => {
  let r = stepX(xferState(), at(12, 55, 0)); const D = r.state.etaMs[4];
  const a = stepX(r.state, D + 230000); assert.ok(a.state.xw && a.state.xw.i === 4, '230초: 아직 대기');
  const b = stepX(r.state, D + 241000);
  assert.ok(!b.state.xw && b.state.eta.passes.some(p => p.idx === 4 && p.ms === D), '4분 뒤: 시각표 출발로 확정 ' + JSON.stringify(b.state.xw));
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
const LV = (o) => Object.assign({ subwayId: '1002', trainLineNm: '신도림행 - T1방면', arvlCd: '99', barvlDt: '120', updnLine: '하행' }, o || {});
t('실시간 도착(웹 규칙): 방향(dk → 상행/하행, 모르면 하행)이 맞는 열차 중 barvlDt 가 가장 작은 것 · 진입·도착은 지금', () => {
  const x0 = stepX(xferState(), at(12, 55, 0)), q = rsPressQuery(pressReq(x0.state, at(12, 55, 20))), N = at(12, 55, 20);
  assert.strictEqual(rsPickLive([LV({ barvlDt: '300' }), LV({ barvlDt: '90' })], q, N, '하'), N + 90000, '더 빨리 오는 열차');
  assert.strictEqual(rsPickLive([LV({ updnLine: '상행', barvlDt: '30' }), LV({ barvlDt: '200' })], q, N, '하'), N + 200000, '하행만');
  assert.strictEqual(rsPickLive([LV({ updnLine: '상행', barvlDt: '30' }), LV({ barvlDt: '200' })], q, N, '상'), N + 30000, '상행만');
  assert.strictEqual(rsPickLive([LV({ updnLine: '상행', barvlDt: '30' }), LV({ barvlDt: '200' })], q, N, null), N + 200000, '방향을 모르면 하행(웹 기본값)');
  assert.strictEqual(rsPickLive([LV({ arvlCd: '1', barvlDt: '0' })], q, N, '하'), N, '도착(1)은 지금');
  assert.strictEqual(rsPickLive([LV({ arvlCd: '0', barvlDt: '55' })], q, N, '하'), N, '진입(0)은 barvlDt 와 상관없이 지금');
  assert.strictEqual(rsPickLive([LV({ arvlCd: '3', barvlDt: '25' })], q, N, '하'), N + 25000, '그 밖의 상태는 barvlDt 초 뒤');
  assert.strictEqual(rsPickLive([LV({ barvlDt: '-5', arvlCd: '3' })], q, N, '하'), N, '음수는 0');
  assert.strictEqual(rsPickLive([LV({ barvlDt: String(30 * 60) })], q, N, '하'), N + 1800000, '시간 한도를 두지 않는다(웹과 같다)');
  assert.strictEqual(rsPickLive(null, q, N, '하'), null); assert.strictEqual(rsPickLive([], q, N, '하'), null);
});
t('실시간 도착: 호선 → subwayId 는 웹의 실기기 확인값(경의중앙선 1063 · 경춘선 1067 · 서해선 1093 · 경강선 1081 · 신림선 1094)', () => {
  const x0 = stepX(xferState(), at(12, 55, 0)), N = at(12, 55, 20);
  const mk = (line) => { const s = JSON.parse(JSON.stringify(x0.state)); s.eta.nodes[4].lineName = line; return rsPressQuery(pressReq(s, N)); };
  [['경의중앙선', '1063'], ['경춘선', '1067'], ['서해선', '1093'], ['경강선', '1081'], ['신림선', '1094'], ['수인분당선', '1075'], ['신분당선', '1077'], ['공항철도', '1065'], ['우이신설선', '1092'], ['9호선', '1009']].forEach(([ln, id]) => {
    assert.strictEqual(rsPickLive([LV({ subwayId: id, barvlDt: '60' })], mk(ln), N, '하'), N + 60000, ln);
    assert.strictEqual(rsPickLive([LV({ subwayId: '1004', barvlDt: '60' })], mk(ln), N, '하'), null, ln + ' — 다른 호선은 거른다');
  });
  assert.strictEqual(rsPickLive([LV({ barvlDt: '60' })], mk('인천1호선'), N, '하'), null, '도착정보가 없는 노선은 시각표');
});
t('실시간 도착(웹 약점 보완): 다른 호선 열차 거르기 · 내선/외선은 다음 역 방면으로 · 이미 출발한 열차는 건너뛰기', () => {
  const x0 = stepX(xferState(), at(12, 55, 0)), q = rsPressQuery(pressReq(x0.state, at(12, 55, 20))), N = at(12, 55, 20);
  assert.strictEqual(rsPickLive([LV({ subwayId: '1004', barvlDt: '20' }), LV({ barvlDt: '150' })], q, N, '하'), N + 150000, '환승역에서 다른 호선(4호선) 열차를 집지 않는다');
  assert.strictEqual(rsPickLive([LV({ subwayId: '1004', barvlDt: '20' })], q, N, '하'), null, '우리 호선 열차가 없으면 시각표로');
  const T = q.to;
  assert.strictEqual(rsPickLive([LV({ updnLine: '내선', trainLineNm: '성수행 - 다른역방면', barvlDt: '40' }), LV({ updnLine: '외선', trainLineNm: '성수행 - ' + T + '방면', barvlDt: '90' })], q, N, '하'), N + 90000, '방향이 안 걸러지면 다음 역 방면으로');
  assert.strictEqual(rsPickLive([LV({ updnLine: '내선', trainLineNm: 'A행 - 다른역방면', barvlDt: '70' }), LV({ updnLine: '외선', trainLineNm: 'B행 - 또다른역방면', barvlDt: '40' })], q, N, '하'), N + 40000, '방면도 안 맞으면 웹처럼 전부 중 가장 빠른 것');
  assert.strictEqual(rsPickLive([LV({ arvlCd: '2', barvlDt: '0' })], q, N, '하'), null, '이미 출발한 열차뿐이면 시각표(방금 떠난 차 규칙)로');
  assert.strictEqual(rsPickLive([LV({ arvlCd: '2', barvlDt: '0' }), LV({ barvlDt: '180' })], q, N, '하'), N + 180000, '출발한 열차는 건너뛰고 다음 열차');
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
  rsAttachPressTT(rq, fakeNt(12 * 60 + 53)); assert.strictEqual(rsAttachPressLive(rq, null), false);
  r = rideStandby(rq);
  assert.ok(r.state.eta.passes.some(p => p.idx === 1 && p.ms === at(12, 53, 30)), '실시간을 못 받으면 시각표');
});

// ── s196: 승차 대기 중 실시간 재보정(웹 _applyRealBoardTime · _boardNextDep · _htlResyncBoard · _htlWaitArrived) ─────────────────────────────────────────
const M_DEG = 88320;      // 위도 37.5 에서 경도 1도 ≈ 88,320m
const blState = (kind) => {
  const st = waitState();
  if (kind === 'bus') { st.eta.nodes = st.eta.nodes.map(n => n.isOrigin ? n : Object.assign({}, n, { isSub: false, isBus: true, lineName: '100' })); st.cfg.bl = { kind: 'bus', i: 1, cc: '23', sid: 'ICB1', no: '100' }; }
  else st.eta.nodes = st.eta.nodes.map(n => n.isOrigin ? n : Object.assign({}, n, { isSub: true, isBus: false, lineName: '2호선' }));
  st.cfg.waitBoard = true; return st;
};
const blStep = (st, ms, mDist, extra) => rideStandby(Object.assign({ nowMs: ms, fixes: mDist == null ? [] : [[ms, LAT, LNG0 - mDist / M_DEG, 10]], state: JSON.parse(JSON.stringify(st)) }, extra || {}));
t('승차 대기 실시간: 역까지 걸어가는 중 — 15초마다 묻는다 · 내가 역에 닿는 시각은 도보 ETA(직선 × 1.25 ÷ 1.2m/s) · 멀면 앞당김은 허용 안 함', () => {
  const T = at(12, 45, 0);
  let r = blStep(blState(), T, 600);
  assert.ok(r.ask && r.ask.kind === 'boardlive', JSON.stringify(r.ask));
  const b = r.ask.body;
  assert.strictEqual(b.kind, 'sub'); assert.strictEqual(b.i, 1); assert.strictEqual(b.line, '2호선'); assert.strictEqual(b.from, 'S0'); assert.strictEqual(b.to, 'S1');
  assert.ok(Math.abs(b.fromMs - (T + 600 * 1.25 / 1.2 * 1000)) < 4000, '도보 ETA ' + (b.fromMs - T));
  assert.strictEqual(b.allowEarlier, false); assert.strictEqual(b.maxWait, 30); assert.strictEqual(b.nowMs, T);
  r = blStep(r.state, T + 5000, 590); assert.strictEqual(r.ask, null, '5초 뒤엔 안 묻는다(15초 간격)');
  r = blStep(r.state, T + 14000, 580); assert.strictEqual(r.ask, null);
  r = blStep(r.state, T + 15000, 570); assert.ok(r.ask, '15초 뒤엔 다시 묻는다');
});
t('승차 대기 실시간: 승차역 250m 안이면 앞당김 허용 · 그 시각엔 이미 그 자리에 있다(fromMs = 지금)', () => {
  const T = at(12, 45, 0), r = blStep(blState(), T, 200);
  assert.ok(r.ask && r.ask.body.allowEarlier === true && r.ask.body.fromMs === T, JSON.stringify(r.ask));
});
t('승차 대기 실시간: 역에 닿은 첫 순간은 즉시 · 앞당김 허용 · 최대 90분까지, 이후엔 평소(30분)', () => {
  const T = at(12, 45, 0);
  let r = blStep(blState(), T, 100);
  assert.ok(r.ask && r.ask.body.maxWait === 90 && r.ask.body.allowEarlier === true && r.state.wait.seen === true, JSON.stringify(r.ask));
  r = blStep(r.state, T + 5000, 90); assert.strictEqual(r.ask, null, '닿은 순간 한 번뿐');
  r = blStep(r.state, T + 15000, 90); assert.ok(r.ask && r.ask.body.maxWait === 30 && r.ask.body.allowEarlier === true, JSON.stringify(r.ask));
});
t('승차 대기 실시간: 역에 닿아 예정 출발 30초 전 ~ 2분 뒤에는 다음 차로 밀지 않는다(지금 그 차를 타는 중일 수 있다)', () => {
  let r = blStep(blState(), at(12, 49, 0), 50); assert.ok(r.ask, '닿은 순간');
  const dep = r.state.etaMs[1];       // 화면에 보이는 승차 시각
  r = blStep(r.state, dep - 100000, 50);
  r = blStep(r.state, dep - 60000, 50); assert.ok(r.ask, '출발 1분 전엔 묻는다(웹: -0.5분부터 보류)');
  r = blStep(r.state, dep - 20000, 50); assert.strictEqual(r.ask, null, '출발 20초 전');
  r = blStep(r.state, dep - 4000, 50); assert.strictEqual(r.ask, null, '출발 직전');
  r = blStep(r.state, dep + 60000, 50); assert.strictEqual(r.ask, null, '출발 1분 뒤');
  r = blStep(r.state, dep + 130000, 50); assert.ok(r.ask, '2분이 지나면 다시 묻는다');
});
t('승차 대기 실시간: 위치를 못 받은 지 1분이 넘으면(도보 ETA 를 모른다) 묻지 않는다 · 지하철 노선이 아니고 버스 정류장 정보도 없으면 묻지 않는다', () => {
  const T = at(12, 45, 0);
  let r = blStep(blState(), T, 600); assert.ok(r.ask);
  r = blStep(r.state, T + 100000, null); assert.strictEqual(r.ask, null, 'GPS 100초 끊김');
  const bus = blState('bus'); delete bus.cfg.bl;
  assert.strictEqual(blStep(bus, T, 600).ask, null, '정류장 ID 를 모르는 버스');
  const ok = blStep(blState('bus'), T, 600);
  assert.ok(ok.ask && ok.ask.body.kind === 'bus' && ok.ask.body.cc === '23' && ok.ask.body.sid === 'ICB1' && ok.ask.body.no === '100' && ok.ask.body.line === undefined, JSON.stringify(ok.ask));
});
const blAns = (o) => Object.assign({ ok: true, kind: 'sub', i: 1, ms: at(12, 55, 0), src: 'realtime', at: at(12, 45, 0), fromMs: at(12, 45, 0), allowEarlier: false, maxWait: 30 }, o || {});
t('승차 대기 실시간: 받은 답으로 열차가 3분 늦으면 승차역 이후 모든 시각을 3분 민다(ride-eta boardNext) · 도착 시각도 같이', () => {
  const T = at(12, 45, 5), base = blStep(blState(), T, 200);
  const r = blStep(blState(), T, 200, { bl: blAns() });
  assert.ok(r.state.eta.boardNext && r.state.eta.boardNext.ms === at(12, 55, 0) && r.state.eta.boardNext.src === 'realboard', JSON.stringify(r.state.eta.boardNext));
  const d1 = r.state.etaMs[1] - base.state.etaMs[1], d5 = r.state.etaMs[5] - base.state.etaMs[5];
  assert.strictEqual(r.state.etaMs[1], at(12, 55, 0), '승차역 시각 = 다음 차 출발 시각');
  assert.ok(d1 > 0 && d5 === d1, '도착 시각도 같은 만큼 밀린다 ' + d1 + '/' + d5);
  assert.ok(/실시간 재보정\(realtime\)/.test(r.notes.join('|')), r.notes.join('|'));
  assert.strictEqual(r.state.wait.arrMs, r.state.etaMs[1], '감지 유예 기준도 새 시각으로');
});
t('승차 대기 실시간: 앞당김은 allowEarlier(역 근처·도착 순간·실시간 값)일 때만 · 허용 범위(maxWait)를 넘는 늦춤은 버린다', () => {
  const T = at(12, 45, 5), base = blStep(blState(), T, 200).state.etaMs;
  const early = at(12, 50, 0), bn = (x) => assert.ok(x.state.eta.boardNext, 'boardNext');
  let r = blStep(blState(), T, 200, { bl: blAns({ ms: early, src: 'table', allowEarlier: false }) });
  assert.strictEqual(r.state.etaMs[1], base[1], '시각표 값으로는 멀리서 앞당기지 않는다');
  r = blStep(blState(), T, 200, { bl: blAns({ ms: early, src: 'table', allowEarlier: true }) });
  assert.strictEqual(r.state.etaMs[1], early, '역 근처면 앞당김 허용');
  r = blStep(blState(), T, 200, { bl: blAns({ ms: early, src: 'realtime', allowEarlier: false }) });
  assert.strictEqual(r.state.etaMs[1], early, '실시간 값은 권위가 있다(웹: src === realtime 이면 앞당김 허용)');
  r = blStep(blState(), T, 200, { bl: blAns({ ms: at(13, 40, 0), maxWait: 30 }) });
  assert.strictEqual(r.state.etaMs[1], base[1], '48분 뒤 차는 30분 한도 밖');
  r = blStep(blState(), T, 200, { bl: blAns({ ms: at(13, 40, 0), maxWait: 90 }) });
  assert.strictEqual(r.state.etaMs[1], at(13, 40, 0), '도착 순간(90분)엔 허용');
});
t('승차 대기 실시간: 오래된 답(90초 넘음) · 다른 정류장 답 · ms 없는 답은 버린다(직전 값 유지)', () => {
  const T = at(12, 45, 5), base = blStep(blState(), T, 200).state.etaMs;
  for (const bad of [{ at: T - 91000 }, { at: T + 10000 }, { i: 2 }, { ms: null }]) {
    const r = blStep(blState(), T, 200, { bl: blAns(bad) });
    assert.strictEqual(r.state.etaMs[1], base[1], JSON.stringify(bad));
  }
  let r = blStep(blState(), T, 200, { bl: blAns() });
  r = blStep(r.state, T + 5000, 190, { bl: blAns({ ms: null, at: T + 5000 }) });
  assert.strictEqual(r.state.etaMs[1], at(12, 55, 0), 'ms 없는 답은 직전 반영을 지우지 않는다');
});
t('승차 대기 실시간: 승차 확정(수동 [탑승] · 감지)되면 증거를 지우고 더는 묻지 않는다 — 탑승 뒤 서버 요청 0', () => {
  const T = at(12, 50, 5);
  let r = blStep(blState(), T, 100, { bl: blAns({ at: T }) });
  assert.ok(r.state.eta.boardNext && r.state.bl);
  const p = blStep(r.state, T + 10000, 20, { act: 'press' });
  assert.ok(!p.state.wait && !p.state.eta.boardNext && !p.state.eta.boardArriveMs && !p.state.bl, JSON.stringify(p.state.eta));
  assert.strictEqual(p.ask, null);
  for (let k = 1; k <= 8; k++) { const q = blStep(p.state, T + 10000 + k * 15000, 20); assert.strictEqual(q.ask, null, '탑승 뒤 ' + k); }
  const g = blState(); g.wait.arrMs = at(12, 40, 0);
  r = blStep(g, at(12, 49, 0), 100, { bl: blAns({ at: at(12, 49, 0) }) });
  assert.ok(!r.state.wait && !r.state.eta.boardNext, '감지 유예 시간이 지나 승차 확정 → 증거를 지운다 ' + JSON.stringify(r.notes));
});
t('승차 대기 실시간: 되돌리기(undo)로 대기로 돌아오면 다시 묻는다', () => {
  const T = at(12, 50, 5);
  let r = blStep(blState(), T, 100, { bl: blAns({ at: T }) });
  r = blStep(r.state, T + 5000, 20, { act: 'press' });
  r = blStep(r.state, T + 10000, 20, { act: 'undo' });
  assert.ok(r.state.wait, '대기로 복귀');
  r = blStep(r.state, T + 30000, 20); assert.ok(r.ask, '다시 묻는다');
});

// 서버 쪽 — 서울 실시간 도착 목록에서 고르는 규칙(웹 _boardNextDep)
const { rsBlLivePick, rsBlReconcile, rsBlTable, rsBlBusPick, rsBoardLive, handleBoardLive } = require(path.join(__dirname, '..', 'engine', 'ride-standby.js'));
const BQ = { line: '2호선', from: 'S0', to: 'S1', nowMs: at(12, 45, 0), fromMs: at(12, 47, 0), tz: 540 };
const ntFwd = (bad) => ({ forward: (line, a, b, term) => (term === bad ? false : (term === 'ZZ' ? null : true)), boardTable: (q) => ({ dk: '상', depMin: 12 * 60 + 50 }) });
t('서버 실시간 고르기: 호선(subwayId)·도착까지 남은 초(>0)·진행 방향(종착역)·내가 닿은 뒤(+30초) 조건에서 가장 빠른 열차', () => {
  const L = (o) => Object.assign({ subwayId: '1002', barvlDt: '300', bstatnNm: '신도림' }, o);
  const list = [L({ barvlDt: '60' }), L({ barvlDt: '90', subwayId: '1003' }), L({ barvlDt: '0' }), L({ barvlDt: '200', bstatnNm: '반대' }), L({ barvlDt: '400' }), L({ barvlDt: '700' })];
  // 지금 12:45, 내가 닿는 시각 12:47 = 120초 뒤 → 60초 열차는 내가 닿기 전에 떠난다. 200초(반대 방향)는 방향 때문에, 90초(다른 호선)·0초는 조건 때문에 빠진다 → 400초 열차
  assert.strictEqual(rsBlLivePick(list, BQ, ntFwd('반대')), BQ.nowMs + 400000);
  assert.strictEqual(rsBlLivePick(list, BQ, null), BQ.nowMs + 200000, '방향을 못 물으면 거르지 않는다(웹: 판단 불가 = 거르지 않음)');
  assert.strictEqual(rsBlLivePick([L({ bstatnNm: 'ZZ', barvlDt: '500' })], BQ, ntFwd('반대')), BQ.nowMs + 500000, 'null(판단 불가)도 거르지 않는다');
  assert.strictEqual(rsBlLivePick([L({ barvlDt: '110' })], BQ, ntFwd('반대')), null, '내가 닿기 10초 전 출발 → 제외(+30초 여유)');
  assert.strictEqual(rsBlLivePick([L({ barvlDt: '150' })], BQ, ntFwd('반대')), BQ.nowMs + 150000, '내가 닿고 30초 뒤면 탈 수 있다');
  assert.strictEqual(rsBlLivePick([L({ subwayId: '1003' })], BQ, null), null, '우리 호선 열차가 없으면 null');
  assert.strictEqual(rsBlLivePick([L()], Object.assign({}, BQ, { to: '' }), ntFwd('신도림')), BQ.nowMs + 300000, '다음 역을 모르면 방향을 거르지 않는다');
});
t('서버 실시간 ↔ 시각표 맞춤: 4분 안이면 실시간(지연·조기 반영) · 더 어긋나면 시각표 · 한쪽만 있으면 그쪽', () => {
  const tb = { ms: at(12, 50, 0), dk: '상' };
  assert.deepStrictEqual(rsBlReconcile(at(12, 53, 50), tb), { ms: at(12, 53, 50), src: 'realtime', dk: '상' });
  assert.deepStrictEqual(rsBlReconcile(at(12, 46, 10), tb), { ms: at(12, 46, 10), src: 'realtime', dk: '상' });
  assert.deepStrictEqual(rsBlReconcile(at(12, 54, 30), tb), { ms: at(12, 50, 0), src: 'table', dk: '상' });
  assert.deepStrictEqual(rsBlReconcile(null, tb), { ms: at(12, 50, 0), src: 'table', dk: '상' });
  assert.deepStrictEqual(rsBlReconcile(at(12, 50, 0), null), { ms: at(12, 50, 0), src: 'realtime', dk: null });
  assert.strictEqual(rsBlReconcile(null, null), null);
  assert.deepStrictEqual(rsBlTable(BQ, ntFwd()), { ms: at(12, 50, 0), dk: '상' }, '시각표 분(12:50) → 그날 ms');
  const mid = Object.assign({}, BQ, { nowMs: at(23, 50, 0), fromMs: at(23, 52, 0) });
  assert.strictEqual(rsBlTable(mid, { boardTable: () => ({ dk: '하', depMin: 24 * 60 + 5 }) }).ms, DAY + (24 * 60 + 5) * 60000, '자정을 넘기는 시각표(1445분)');
});
t('서버 버스 고르기: 번호가 정확히 같은 노선만(웹의 1 ↔ 10 섞임 약점 보완) · 내가 닿은 뒤(+30초) 가장 빠른 차', () => {
  const m = { '100': [30, 200, 500], '1000': [10], '10': [40], __names: ['100'] };
  assert.strictEqual(rsBlBusPick(m, { no: '100', nowMs: 1000000, fromMs: 1000000 + 100000 }), 1000000 + 200000);
  assert.strictEqual(rsBlBusPick(m, { no: '100', nowMs: 1000000, fromMs: 1000000 + 600000 }), null);
  assert.strictEqual(rsBlBusPick(m, { no: '1', nowMs: 1000000, fromMs: 1000000 }), null, '1번 버스를 10·100·1000 으로 착각하지 않는다');
  assert.strictEqual(rsBlBusPick(null, { no: '100', nowMs: 1, fromMs: 1 }), null);
});
const blHttp = async () => {
  const prev = global.ntEnsure, prevF = global.fetchStopArrivalsAny, prevL = global.liveCityOk;
  global.ntEnsure = async () => ntFwd('반대');
  try {
    let asked = '';
    const mk = (lst) => ({ BUSAPI: { fetch: async (req) => { asked = decodeURIComponent(new URL(req.url).searchParams.get('path')); return new Response(JSON.stringify({ realtimeArrivalList: lst }), { status: 200 }); } } });
    const q = () => JSON.parse(JSON.stringify(Object.assign({ kind: 'sub', i: 1, allowEarlier: true, maxWait: 30 }, BQ)));
    let r = await rsBoardLive(mk([{ subwayId: '1002', barvlDt: '300', bstatnNm: '신도림' }]), q());
    assert.ok(/^realtimeStationArrival\/1\/20\/S0$/.test(asked), asked);
    assert.deepStrictEqual([r.ok, r.ms, r.src, r.i, r.at, r.fromMs, r.allowEarlier, r.maxWait, r.dk], [true, BQ.nowMs + 300000, 'realtime', 1, BQ.nowMs, BQ.fromMs, true, 30, '상'], JSON.stringify(r));
    r = await rsBoardLive(mk([{ subwayId: '1002', barvlDt: '900', bstatnNm: '신도림' }]), q());
    assert.deepStrictEqual([r.ms, r.src], [at(12, 50, 0), 'table'], '실시간이 시각표와 4분 넘게 어긋나면 시각표 ' + JSON.stringify(r));
    r = await rsBoardLive(mk(null), q()); assert.deepStrictEqual([r.ms, r.src], [at(12, 50, 0), 'table'], '실시간을 못 받으면 시각표');
    r = await rsBoardLive({}, q()); assert.deepStrictEqual([r.ms, r.src], [at(12, 50, 0), 'table'], 'BUSAPI 바인딩이 없어도 시각표');
    asked = ''; const far = q(); far.fromMs = far.nowMs + 25 * 60000;
    r = await rsBoardLive(mk([{ subwayId: '1002', barvlDt: '300', bstatnNm: '신도림' }]), far);
    assert.strictEqual(asked, '', '승차까지 20분 넘게 남으면 실시간을 부르지 않는다(웹 _RT_ARR_MAX_AHEAD)'); assert.strictEqual(r.src, 'table');
    asked = ''; const inc = q(); inc.line = '인천1호선';
    r = await rsBoardLive(mk([{ subwayId: '1002', barvlDt: '300', bstatnNm: '신도림' }]), inc); assert.strictEqual(asked, '', '도착정보가 없는 노선은 부르지 않는다'); assert.strictEqual(r.src, 'table');
    const t0 = Date.now(); r = await rsBoardLive({ BUSAPI: { fetch: () => new Promise(() => { }) } }, q());
    assert.ok(Date.now() - t0 < 3600 && r.src === 'table', '응답이 없어도 3초 안에 시각표로 ' + (Date.now() - t0));
    // 버스
    global.liveCityOk = () => true;
    global.fetchStopArrivalsAny = async (cc, sid) => { assert.deepStrictEqual([cc, sid], ['23', 'ICB1']); return { '100': [40, 260, 700], __names: ['100'] }; };
    const bq = { kind: 'bus', i: 1, cc: '23', sid: 'ICB1', no: '100', nowMs: BQ.nowMs, fromMs: BQ.nowMs + 120000, allowEarlier: false, maxWait: 30 };
    r = await rsBoardLive({}, JSON.parse(JSON.stringify(bq))); assert.deepStrictEqual([r.ms, r.src], [BQ.nowMs + 260000, 'realtime'], JSON.stringify(r));
    global.fetchStopArrivalsAny = async () => { throw new Error('boom'); };
    r = await rsBoardLive({}, JSON.parse(JSON.stringify(bq))); assert.strictEqual(r.ms, null); assert.strictEqual(r.ok, true);
    global.liveCityOk = () => false; global.fetchStopArrivalsAny = async () => ({ '100': [300] });
    r = await rsBoardLive({}, JSON.parse(JSON.stringify(bq))); assert.strictEqual(r.ms, null, '지원 안 하는 도시는 건너뛴다');
    // HTTP
    const post = (b, env) => handleBoardLive(new Request('https://x.test/board-live', { method: 'POST', body: b }), env || {}).then(x => x.json().then(j => [x.status, j]));
    const [s1, j1] = await post(JSON.stringify(q())); assert.strictEqual(s1, 200); assert.strictEqual(j1.ms, at(12, 50, 0));
    const [s2] = await post('JSON 아님'); assert.strictEqual(s2, 400);
    const [s3, j3] = await post('{}'); assert.strictEqual(s3, 200); assert.strictEqual(j3.ok, false);
    const g = await handleBoardLive(new Request('https://x.test/board-live'), {}); assert.strictEqual(g.status, 405);
  } finally { if (prev) global.ntEnsure = prev; else delete global.ntEnsure; if (prevF) global.fetchStopArrivalsAny = prevF; else delete global.fetchStopArrivalsAny; if (prevL) global.liveCityOk = prevL; else delete global.liveCityOk; }
};

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


// ── s231: 첫 승차 뒤 3정거장부터는 도착 확정 없이 역을 건너뛰지 않는다 · 연쇄 2회 실패 → 5분 GPS 탐색 · 실시간 노선은 영점 직후 내 열차 실시간 보정 ──
const { rsRtPick, rsRtAsk, rsRtApply } = require(path.join(__dirname, '..', 'engine', 'ride-standby.js'));
function longState(lineName) {
  const nd = [{ name: '출발', isOrigin: true }], stops = [], P = [];
  for (let i = 1; i <= 8; i++) { P[i] = 12 * 60 + 50 + 2 * i; nd.push({ name: 'L' + (i - 1), isSub: true, lineName: lineName, planMin: P[i] }); stops.push({ i: i, lat: LAT, lng: LNG0 + DL * (i - 1), arrMs: DAY + P[i] * 60000, pass: i > 1, fin: i === 8 }); }
  return { v: 1, tripSig: 'T9', eta: { nodes: nd, passes: [{ idx: 1, ms: at(12, 52, 0), src: 'gps' }], boarded: true, notDeparted: false, timetableFirst: true, tzOffsetMin: 540, opts: { planSecOffset: 50 } },
    stops: stops, trail: [], cfg: { targets: [{ seqPos: 7, nodeIdx: 8, name: 'L7', kind: 'dest' }], seq: [1, 2, 3, 4, 5, 6, 7, 8], allowed: {}, destName: 'L7' }, fired: {} };
}
const stepL = (st, ms, fixes, extra) => rideStandby(Object.assign({ nowMs: ms, fixes: fixes || [], state: JSON.parse(JSON.stringify(st)) }, extra || {}));
function runUntil(st, from, to, cond, fixFn) {
  let r = null, ms;
  for (ms = from; ms <= to; ms += 5000) { r = stepL(st, ms, fixFn ? fixFn(ms) : []); st = r.state; if (cond && cond(r, ms)) break; }
  return { r: r, st: st, ms: ms };
}
// ★ 2026-10-28 s267 (YJ: 버스에서 환승한 지하철에서 임학·계산·경인교대 사이 이동이 안 그려지고 마커가 역에서 역으로 건너뜀 — 역 도착 판정은 그대로)
function busSubState() {
  const nd = [{ name: '출발', isOrigin: true }, { name: 'B1', isBus: true, lineName: '9701', planMin: 12 * 60 + 40 }, { name: 'B2', isBus: true, lineName: '9701', planMin: 12 * 60 + 46 }], stops = [];
  for (let i = 3; i <= 9; i++) nd.push({ name: 'S' + (i - 3), isSub: true, lineName: '인천1호선', planMin: 12 * 60 + 50 + 2 * (i - 3) });
  nd.forEach((n, i) => { if (i >= 1) stops.push({ i: i, lat: LAT, lng: LNG0 + DL * (i - 1), arrMs: DAY + n.planMin * 60000, pass: i > 1, fin: i === nd.length - 1 }); });
  return { v: 1, tripSig: 'T10', eta: { nodes: nd, passes: [{ idx: 1, ms: at(12, 40, 0), src: 'gps' }, { idx: 2, ms: at(12, 46, 0), src: 'gps' }, { idx: 3, ms: at(12, 50, 0), src: 'board' }], boarded: true, notDeparted: false, tzOffsetMin: 540 },
    stops: stops, trail: [], cfg: { targets: [{ seqPos: 8, nodeIdx: 9, name: 'S6', kind: 'dest' }], seq: [1, 2, 3, 4, 5, 6, 7, 8, 9], allowed: {}, destName: 'S6' }, fired: {} };
}
t('s267 버스→지하철 환승 뒤에도 역 사이 중간 위치(pos)가 매 구간 나오고 마커가 되돌아가지 않는다 · 영점(GPS 통과)은 그대로 잡힌다', () => {
  let st = busSubState(), prev = -1, seenMid = {}, maxJump = 0;
  const stops = st.stops, posAt = ms => { if (ms <= stops[0].arrMs) return [stops[0].lat, stops[0].lng]; for (let i = 1; i < stops.length; i++) if (ms <= stops[i].arrMs) { const a = stops[i - 1], b = stops[i], f = (ms - a.arrMs) / (b.arrMs - a.arrMs); return [a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f]; } const e = stops[stops.length - 1]; return [e.lat, e.lng]; };
  for (let ms = at(12, 50, 10); ms <= at(13, 4, 0); ms += 5000) {
    const p = posAt(ms), r = stepL(st, ms, [[ms, p[0], p[1], 15]]); st = r.state;
    if (st.eta.passes.some(q => q.idx === 9)) break;      // 목적지 도착 — 그 뒤는 구간 위치가 없다
    assert.ok(r.pos && r.pos.from != null, '지하철 구간은 구간 중간 위치(pos)를 낸다 ' + ms);
    const v = r.pos.from + r.pos.ratio; if (prev >= 0) { assert.ok(v >= prev - 0.003, '되돌아가지 않는다 ' + prev + ' → ' + v); maxJump = Math.max(maxJump, v - prev); } prev = v;
    if (r.pos.ratio > 0.2 && r.pos.ratio < 0.8) seenMid[r.pos.from] = 1;
    assert.ok(r.pos.hold == null, '역 앞 대기(s231)는 이 경로에 쓰지 않는다');
  }
  assert.ok(maxJump < 0.35, '한 걸음에 한 칸씩 건너뛰지 않는다: ' + maxJump);
  assert.ok(Object.keys(seenMid).length >= 5, '역 사이 중간 위치가 구간마다 나온다: ' + Object.keys(seenMid));
  assert.ok(st.eta.passes.filter(q => q.src === 'gps').length >= 6, 'GPS 영점은 기존대로 잡힌다');
});
// ★ 2026-10-28 s268 (YJ: 지하철 규칙 2가지 — 서울 실시간 노선은 영점 연속 3회 실패 시 API 로 내 열차 맞추기, API 없는 노선(인천1호선)은 GPS 만 · 하차까지 반복 · 영점 실패 중에도 마커는 시각표대로 전진)
const lastPos = (o) => o.r.pos.from + o.r.pos.ratio;
t('s294 도착이 판정된 역은 되돌아가지 못한다 — 새 계산이 앞 역을 가리켜도 마커는 닿은 가장 앞 역 이후 구간에 머문다 · 되돌리기(사용자)만 푼다', () => {
  const st = longState('인천1호선');
  const r1 = stepL(st, at(12, 57, 40)), f1 = r1.pos.from;
  assert.ok(f1 >= 2 && r1.state.mkFloor && r1.state.mkFloor.n === f1, '닿은 역을 붙잡는다 ' + f1 + ' ' + JSON.stringify(r1.state.mkFloor));
  const hacked = JSON.parse(JSON.stringify(r1.state)); hacked.mkFloor.n = f1 + 2; delete hacked.mk;        // 어떤 이유로 새 계산이 f1 을 가리켜도(가정)
  const r2 = stepL(hacked, at(12, 57, 45));
  assert.ok(r2.pos.from >= f1 + 2, '붙잡은 역(' + (f1 + 2) + ') 앞으로는 가지 않는다 ' + r2.pos.from + ' ' + r2.notes.filter(n => /되돌아감/.test(n)));
  assert.ok(r2.notes.some(n => /도착 확정 역 되돌아감 방지/.test(n)), '이유가 notes 에 남는다');
  const r3 = stepL(r1.state, at(12, 57, 50)); assert.ok(r3.pos.from >= f1, '평소에도 줄지 않는다');
});
t('s268 영점이 계속 없어도 마커는 역 앞에서 멈추지 않고 시각표대로 간다 · 실패 역은 pos.miss 로 센다(첫 역부터, 예정 +60초 뒤)', () => {
  const o1 = runUntil(longState('인천1호선'), at(12, 52, 5), at(12, 54, 50), null);
  assert.strictEqual(o1.st.xf || 0, 0, '2번 역 예정 직후엔 아직 실패가 아니다(60초 여유) ' + o1.st.xf);
  const o2 = runUntil(longState('인천1호선'), at(12, 52, 5), at(12, 55, 30), null);
  assert.strictEqual(o2.st.xf, 1, '첫 역부터 센다 ' + o2.st.xf);
  const o3 = runUntil(longState('인천1호선'), at(12, 52, 5), at(13, 1, 0), null);
  assert.ok(o3.st.xf >= 4, '실패가 쌓인다(연속) ' + o3.st.xf);
  assert.ok(o3.r.pos.from >= 5 && o3.r.pos.hold == null, '마커는 시각표대로 계속 간다(역 앞 대기 없음) ' + JSON.stringify(o3.r.pos));
  assert.ok(o3.r.curIdx >= 5, '알림 위치도 시각표대로 ' + o3.r.curIdx);
});
t('s268 영점이 잡히면 그 역까지의 실패가 지워진다(연속 실패만 센다)', () => {
  const o = runUntil(longState('인천1호선'), at(12, 52, 5), at(12, 59, 0), null);
  assert.ok(o.st.xf >= 3, 'xf ' + o.st.xf);
  const st = o.st; st.eta.passes.push({ idx: 4, ms: o.ms - 30000, src: 'gps' });
  const r = stepL(st, o.ms + 5000, []);
  assert.strictEqual(r.state.xf || 0, 0, '4번 영점 → 4번 이하 실패는 지워진다(그 뒤 역은 아직 예정 전) ' + r.state.xf);
});
t('s268 인천1호선(API 없는 노선): 연속 2회 실패 → GPS 5분 탐색, 몇 번을 실패해도 실시간 API 는 부르지 않는다 · 탐색으로 잡으면 영점이 적힌다', () => {
  const o = runUntil(longState('인천1호선'), at(12, 52, 5), at(13, 3, 0), (r) => r.state.srch);
  assert.ok(o.st.srch && o.st.srch.i === 3 && o.st.xf === 2 && o.st.sd === 3, JSON.stringify(o.st.srch) + ' xf ' + o.st.xf);
  const later = runUntil(o.st, o.ms + 5000, at(13, 8, 0), null);
  assert.ok(!later.st.rt && !later.r.ask, '실시간 위치를 모르는 노선은 API 를 부르지 않는다: ' + JSON.stringify(later.st.rt));
  // 3번 역(경도 LNG0+DL*2) 곁을 지나간 흔적이 있으면 탐색이 영점을 적는다
  const nowMs = o.ms + 30000, fx = [[nowMs - 50000, LAT, LNG0 + DL * 2 - 0.0008, 30], [nowMs - 40000, LAT, LNG0 + DL * 2, 30], [nowMs - 30000, LAT, LNG0 + DL * 2 + 0.0010, 30], [nowMs - 5000, LAT, LNG0 + DL * 2 + 0.0030, 30]];
  const r = stepL(o.st, nowMs, fx);
  assert.ok(r.state.eta.passes.some(p => p.idx === 3 && p.src === 'gps'), JSON.stringify(r.notes));
  assert.ok(!r.state.srch, '탐색 끝');
});
t('s268 탐색 5분 안에 못 잡으면 탐색만 끝낸다(마커는 계속 시각표대로) · 같은 역으로 다시 탐색하지 않는다', () => {
  const o = runUntil(longState('인천1호선'), at(12, 52, 5), at(13, 3, 0), (r) => r.state.srch);
  const r = stepL(o.st, o.ms + 301000, []);
  assert.ok(!r.state.eta.passes.some(p => p.idx === 3) && (!r.state.srch || r.state.srch.i !== 3), JSON.stringify(r.notes));      // 끝난 탐색 자리에 새 실패 역(5번)이 생기면 그 역으로는 다시 시작할 수 있다
  const r2 = stepL(r.state, o.ms + 306000, []);
  assert.ok(!r2.state.srch || r2.state.srch.i > 3, '같은 역(3번)은 다시 탐색하지 않는다 ' + JSON.stringify(r2.state.srch));
});
t('s268 서울 실시간 노선(1호선): 영점 연속 3회 실패 → 다음 역 도착정보로 내 열차를 맞춘다 · 답이 오면 실시간 시각으로 · 3회 더 실패하면 또(하차까지 반복)', () => {
  const o = runUntil(longState('1호선'), at(12, 52, 5), at(13, 3, 0), (r) => r.state.rt);
  assert.ok(o.st.rt && o.st.rt.i0 === 4 && o.st.rt.i1 === 5 && o.st.rt.line === '1호선' && o.st.mb === 4, JSON.stringify(o.st.rt) + ' mb ' + o.st.mb);
  assert.ok(o.r.ask && o.r.ask.kind === 'boardlive' && o.r.ask.body.kind === 'subrt' && o.r.ask.body.i === 5 && o.r.ask.body.from === 'L4' && o.r.ask.body.prev === 'L3', JSON.stringify(o.r.ask));
  const quiet = stepL(o.st, o.ms + 5000, []);
  assert.ok(!quiet.ask, '15초 안에는 다시 묻지 않는다');
  const baseEta = stepL(quiet.state, o.ms + 20000, []).state.etaMs[5];
  const live = o.ms + 20000 + 150000;
  const a = stepL(quiet.state, o.ms + 20000, [], { bl: { ok: true, kind: 'subrt', i: 5, ms: live, src: 'realtime', at: o.ms + 20000 } });
  assert.ok(a.state.rt.done === 1 && a.state.eta.live.length === 1 && a.state.eta.live[0].idx === 5, JSON.stringify(a.notes));
  assert.ok(Math.abs(a.state.etaMs[5] - live) < Math.abs(baseEta - live), '실시간 쪽으로 맞춰진다');
  // 답이 없으면(못 찾음) 한 번의 시도에서 최대 2번만 묻는다
  let s2 = o.st, asks = 1;
  for (let ms = o.ms + 5000; ms < o.ms + 170000; ms += 5000) { const q = stepL(s2, ms, []); s2 = q.state; if (q.ask) asks++; if (s2.rt && s2.rt.i0 !== 4) break; }
  assert.strictEqual(asks, 2, '최대 2번 ' + asks);
  // 하차까지 반복: 보정 뒤 다시 3회(새 실패) 쌓이면 또 맞춘다 — 4번 이후 역 5·6·7 이 실패
  const again = runUntil(a.state, o.ms + 25000, at(13, 14, 0), (r) => r.state.rt && r.state.rt.i0 > 4);
  assert.ok(again.st.rt && again.st.rt.i0 > 4 && again.st.mb > 4, '두 번째 보정 ' + JSON.stringify(again.st.rt) + ' mb ' + again.st.mb);
});
t('s268 구간별 규칙 판정(rsTtNow): 지하철 구간은 시각표 우선 · 버스 구간·환승 사이는 GPS 우선 · 대기 중·통과 없음·목적지 뒤는 처음 값 그대로', () => {
  const { rsTtNow } = require(path.join(__dirname, '..', 'engine', 'ride-standby.js'));
  const nd = [{ name: '출발', isOrigin: true }, { name: 'S0', isSub: true, lineName: '1호선' }, { name: 'S1', isSub: true, lineName: '1호선' }, { name: 'B0', isBus: true, lineName: '9701' }, { name: 'B1', isBus: true, lineName: '9701' }, { name: 'T0', isSub: true, lineName: '인천1호선' }, { name: 'T1', isSub: true, lineName: '인천1호선' }];
  const mk = (tf, last, o) => ({ st: Object.assign({}, o || {}), eta: { nodes: nd, boarded: true, timetableFirst: tf, passes: last < 0 ? [] : [{ idx: 1, src: 'gps' }].concat(last > 1 ? [{ idx: last, src: 'gps' }] : []) } });
  const v = (tf, last, o) => { const m = mk(tf, last, o); return rsTtNow(m.st, m.eta, m.eta.passes); };
  assert.strictEqual(v(true, 1), true, '지하철로 시작해 타고 가는 중');
  assert.strictEqual(v(false, 1), true, '버스로 시작해도 지하철 구간이면 시각표 우선');
  assert.strictEqual(v(true, 2), false, '지하철을 내린 뒤 다음이 버스(환승 사이)면 GPS 우선');
  assert.strictEqual(v(true, 3), false, '버스를 타고 가는 중이면 지하철로 시작했어도 GPS 우선(버스 규칙)');
  assert.strictEqual(v(false, 5), true, '버스 다음 지하철(인천1호선)을 타고 가는 중 → 시각표 우선');
  assert.strictEqual(v(true, 6), true, '목적지에 닿은 뒤는 처음 값');
  assert.strictEqual(v(false, 6), false, '목적지 뒤(처음 값 false)');
  assert.strictEqual(v(false, -1), false, '통과가 없으면 처음 값'); assert.strictEqual(v(true, -1), true);
  assert.strictEqual(v(true, 3, { xw: { i: 5 } }), true, '환승 대기 중에는 처음 값 그대로'); assert.strictEqual(v(false, 4, { xw: { i: 5 } }), false);
  assert.strictEqual(v(true, 1, { wait: { i: 1 } }), true, '첫 승차 대기 중에는 처음 값');
});
t('s231 rsRtPick: 내 방향으로 오는 가장 가까운 열차 — 이미 역에 들어온 차(도착·출발)·다른 호선·반대 방향은 뺀다', () => {
  const q = { line: '1호선', prev: 'A', from: 'B', nowMs: 1000000 };
  const nt = { forward: (l, a, b, term) => (term === 'BAD' ? false : true) };
  const L = (o) => Object.assign({ subwayId: '1001', arvlCd: '99', barvlDt: '100', bstatnNm: 'OK' }, o);
  assert.strictEqual(rsRtPick([L({ barvlDt: '200' }), L({ barvlDt: '90' })], q, nt), 1090000);
  assert.strictEqual(rsRtPick([L({ arvlCd: '1', barvlDt: '0' }), L({ arvlCd: '2', barvlDt: '30' }), L({ barvlDt: '210' })], q, nt), 1210000, '도착·출발한 차는 내 앞의 차');
  assert.strictEqual(rsRtPick([L({ subwayId: '1002', barvlDt: '30' }), L({ bstatnNm: 'BAD', barvlDt: '40' })], q, nt), null);
  assert.strictEqual(rsRtPick([], q, nt), null);
  assert.strictEqual(rsRtPick([L({ barvlDt: '60' })], { line: '인천1호선', prev: 'A', from: 'B', nowMs: 0 }, nt), null, '실시간 위치를 모르는 노선');
});

// s257: 마커 되돌아감 방지 — 새 시각표가 지금 마커 자리보다 뒤여도 마커는 뒤로 가지 않고 그 자리에서 이어 간다
t('s257 마커는 GPS 도착 확정 뒤 시각표가 늦게 맞춰져도 뒤로 가지 않는다', () => {
  const N = at(12, 55, 0), st = { eta: { nodes: nodes } };
  const mkPos = (t0, t1) => ({ from: 2, to: 3, t0: t0, t1: t1, ratio: 0, moving: false, segs: [{ from: 2, to: 3, a: t0 - 20000, t0: t0, t1: t1 }, { from: 3, to: 4, a: t1, t0: t1 + 20000, t1: t1 + 120000 }] });
  const notes = [];
  const r1 = { pos: mkPos(N - 40000, N + 80000) }; rsMonoPos(st, r1, N, notes);                  // 첫 호출: 구간의 1/3 지점
  const p1 = (N - (N - 40000)) / 120000;
  const N2 = N + 10000;
  const r2 = { pos: mkPos(N2 - 5000, N2 + 115000) };                                              // 엔진이 시각표를 늦게 다시 맞췄다(마커가 0.03 으로 떨어질 상황)
  rsMonoPos(st, r2, N2, notes);
  const p2 = r2.pos.ratio, prev = (N2 - (N - 40000)) / 120000;
  assert.ok(p2 >= prev - 0.01, '되돌아가지 않음 ' + p2 + ' vs ' + prev + ' ' + JSON.stringify(notes));
  assert.ok(r2.pos.segs[0].t1 === N2 + 115000, '도착 시각 t1 은 그대로');
  assert.ok(r2.pos.ttFrom === 2 && r2.pos.from === 2);
  const N3 = N2 + 30000, r3 = { pos: mkPos(N3 - 5000, N3 + 90000) }; rsMonoPos(st, r3, N3, notes);   // 한참 뒤엔 앞으로 간다
  assert.ok(r3.pos.ratio >= p2, '계속 앞으로');
  const stB = { eta: { nodes: nodes } }, rb = { pos: mkPos(N - 5000, N + 115000) }; rsMonoPos(stB, rb, N, []);
  assert.strictEqual(rb.pos.segs[0].t0, N - 5000, '뒤로 갈 일이 없으면 손대지 않는다');
});

const liveHttpTest = async () => {
  const x0 = stepX(xferState(), at(12, 55, 0)), N = at(12, 55, 20), prev = global.ntEnsure;
  global.ntEnsure = async () => fakeNt(12 * 60 + 58);
  try {
    const mk = (fn) => ({ BUSAPI: { fetch: fn } });
    const post = (env, rq) => handleRideStandby(new Request('https://x.test/ride-standby', { method: 'POST', body: JSON.stringify(rq) }), env).then(r => r.json());
    let asked = '';
    const ok = mk(async (req) => { asked = decodeURIComponent(new URL(req.url).searchParams.get('path')); return new Response(JSON.stringify({ realtimeArrivalList: [LV({ barvlDt: '90' })] }), { status: 200 }); });
    const a = await post(ok, pressReq(x0.state, N));
    assert.ok(/^realtimeStationArrival\/1\/20\/T0$/.test(asked), asked);
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
  .then(() => blHttp()).then(() => { pass++; console.log('  ok   HTTP 처리: /board-live — 실시간 ↔ 시각표 맞춤 · 20분 넘게 남으면 시각표 · 응답 없으면 3초 안에 시각표 · 버스'); }, (e) => { fail++; console.log('  FAIL HTTP board-live', String(e && e.stack || e).split('\n').slice(0, 4).join(' | ')); })
  .then(() => httpTest()).then(() => { pass++; console.log('  ok   HTTP 처리: 평문 JSON 도 gzip 으로 눌러 보낸 JSON 도 같은 답을 준다(데이터 절약)'); }, (e) => { fail++; console.log('  FAIL HTTP 처리', String(e && e.message).split('\n')[0]); })
  .then(() => { console.log('ride_standby: pass', pass, 'fail', fail); process.exit(fail ? 1 : 0); });

t('s266: 환승 하차·탑승 전후 3분은 승차 대기 중이어도 2.5초 간격(환승 목적지 도착 · 환승 대중교통 탑승 확인용), 그 밖은 5초', () => {
  const st = mkState(); st.eta.nodes = st.eta.nodes.slice(); // 구간 둘: 노드 1~2 = 1호선(승차 1 · 하차 2) → 노드 3~5 = 2호선(환승 승차 3 · 마지막 하차 5)
  st.eta.nodes = [st.eta.nodes[0]].concat([1, 2].map(i => ({ name: 'S' + i, isSub: true, lineName: '1호선', planMin: PLAN[i] })), [3, 4, 5].map(i => ({ name: 'S' + i, isSub: true, lineName: '2호선', planMin: PLAN[i] })));
  st.stops.forEach(q => { q.arrMs = DAY + (PLAN[q.i] || 0) * 60000; });
  const ai = DAY + PLAN[2] * 60000, bi = DAY + PLAN[3] * 60000;
  assert.strictEqual(rideStandby({ nowMs: ai - 170000, fixes: [], state: JSON.parse(JSON.stringify(st)) }).nextMs, 2500, '환승 하차 3분 전');
  assert.strictEqual(rideStandby({ nowMs: bi + 170000, fixes: [], state: JSON.parse(JSON.stringify(st)) }).nextMs, 2500, '환승 탑승 3분 뒤');
  const far = rideStandby({ nowMs: (ai + bi) / 2 + 600000, fixes: [], state: JSON.parse(JSON.stringify(st)) }).nextMs;
  assert.ok(far === 5000 || far === 2500, '창 밖 값은 기본 또는 정류장 근처 규칙 ' + far);
});
