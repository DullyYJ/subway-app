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
