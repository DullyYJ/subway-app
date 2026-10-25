// 경로 목록의 지하철 첫 구간 대기를 서울 실시간 도착정보로 조용히 바꾼다 (웹 _boardNextDep 규칙 · 엔진 next-train-worker.js ntLiveFirst/ntAttachPath)
// 실행: node test/next_train_live_first.test.js
const W = require('./helpers/nt_load')();
const RS = require('../engine/ride-standby.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const at = (s) => new Date(s).getTime();
const BASE = at('2026-10-14T13:00:00+09:00');            // 수요일 13:00
const mk = (fetch) => ({ fetch, id: RS.rsSubwayId, pick: RS.rsBlLivePick, table: RS.rsBlTable, rec: RS.rsBlReconcile, aheadMax: RS.RS_BL.AHEAD_MAX_MIN, ms: 2800 });
const subLeg = (line, names, acc) => ({ mode: 'subway', line, stopList: names, from: names[0], to: names[names.length - 1], min: 10, coordList: names.map((n, i) => [37 + i * 0.01, 127]) });
const outOf = (legs, acc) => ({ minTime: { legs, accessWalkMin: acc || 0, totalMin: 30 } });

(async () => {
  const nt = await W.ntEnsure({});
  ok(!!nt, '시각표 엔진 준비');
  // 시각표상 1호선 서울역 → 시청 방향의 다음 열차(분)
  const tb = nt.boardTable({ line: '1호선', from: '서울역', to: '시청', atMin: 13 * 60 + 5, baseMs: BASE });
  ok(tb && tb.depMin != null, '시각표의 다음 열차: ' + JSON.stringify(tb));
  const tblMs = BASE + (tb.depMin - 13 * 60) * 60000;                 // 13:00 기준 ms
  // 진행 방향 종착역(시각표 forward 로 가린다)
  const term = ['인천', '구로', '청량리', '의정부', '소요산', '광운대', '동인천', '병점', '천안', '신창', '서동탄'].find(t => nt.forward('1호선', '서울역', '시청', t) === true);
  const rev = ['인천', '구로', '청량리', '의정부', '소요산', '광운대', '동인천', '병점', '천안', '신창', '서동탄'].find(t => nt.forward('1호선', '서울역', '시청', t) === false);
  ok(!!term && !!rev, '정방향·역방향 종착역 후보: ' + term + ' / ' + rev);

  // ── 대상 가리기 ──
  const out1 = outOf([{ mode: 'walk', min: 3 }, subLeg('1호선', ['서울역', '시청', '종각'])], 5);
  const t1 = W.ntLiveTargets(out1, RS.rsSubwayId);
  ok(t1.length === 1 && t1[0].line === '1호선' && t1[0].from === '서울역' && t1[0].to === '시청' && t1[0].offSec === 300, '첫 대중교통이 지하철이면 대상: ' + JSON.stringify(t1));
  ok(t1[0].key === W.ntLiveKey('1호선', '서울역', '시청', 300), '키 규칙');
  const out2 = outOf([{ mode: 'bus', line: '11_100', busNo: '100', stopList: ['가', '나'] }, subLeg('1호선', ['서울역', '시청'])]);
  ok(W.ntLiveTargets(out2, RS.rsSubwayId).length === 0, '첫 대중교통이 버스면 대상 아님');
  ok(W.ntLiveTargets(outOf([subLeg('없는선', ['가', '나'])]), RS.rsSubwayId).length === 0, '실시간 도착 제공 노선이 아니면 대상 아님');
  const outDup = { a: out1.minTime, b: Object.assign({}, out1.minTime) };
  ok(W.ntLiveTargets(outDup, RS.rsSubwayId).length === 1, '같은 키는 한 번만');

  // ── 실시간 고르기 ──
  const item = (sec, t, sid) => ({ subwayId: sid || '1001', barvlDt: String(sec), bstatnNm: t, trainLineNm: t + '행' });
  const secTo = (ms) => Math.round((ms - BASE) / 1000);
  let calls = 0, paths = [];
  const fetchOf = (list) => (env, path, ms) => { calls++; paths.push(path); return Promise.resolve(list); };
  // 가) 시각표 차와 같은 차(±1분) — 실시간 채택
  const liveSec = secTo(tblMs) + 45;
  let r = await W.ntLiveFirst({}, out1, BASE, BASE, mk(fetchOf([item(liveSec, term), item(liveSec - 100, rev), item(liveSec - 200, term, '1002')])));
  const k1 = t1[0].key;
  ok(r[k1] && r[k1].src === 'realtime', '시각표와 같은 차는 실시간 채택: ' + JSON.stringify(r));
  ok(r[k1] && r[k1].ms === BASE + liveSec * 1000, '시각은 지금 + barvlDt: ' + (r[k1] && r[k1].ms));
  ok(paths[0] === 'realtimeStationArrival/1/20/' + encodeURIComponent('서울'), '중계 경로는 [탑승] 영점과 같다(캐시 공유): ' + paths[0]);
  // 나) 반대 방향·다른 호선 열차만 → 못 가림
  r = await W.ntLiveFirst({}, out1, BASE, BASE, mk(fetchOf([item(60, rev), item(90, term, '1002')])));
  ok(!r[k1], '반대 방향·다른 호선은 쓰지 않는다');
  // 다) 시각표와 4분 넘게 어긋나면 시각표
  r = await W.ntLiveFirst({}, out1, BASE, BASE, mk(fetchOf([item(secTo(tblMs) + 600, term)])));
  ok(!r[k1], '시각표와 10분 어긋난 실시간은 버린다(시각표)');
  // 라) 내가 닿기 전(접근 5분 + 30초)에 떠나는 차는 제외
  r = await W.ntLiveFirst({}, out1, BASE, BASE, mk(fetchOf([item(200, term)])));
  ok(!r[k1], '5분 걸어 닿기 전(200초 뒤)에 오는 차는 제외');
  // 마) 못 받음 / 탐색 시각이 지금이 아님 / 20분 넘게 먼 승차
  r = await W.ntLiveFirst({}, out1, BASE, BASE, mk(fetchOf(null)));
  ok(Object.keys(r).length === 0, '못 받으면 비어 있다');
  r = await W.ntLiveFirst({}, out1, BASE + 3600000, BASE, mk(fetchOf([item(liveSec, term)])));
  ok(Object.keys(r).length === 0, '예상 시각(지금과 10분 넘게 차이)은 묻지 않는다');
  const far = outOf([{ mode: 'walk', min: 30 }, subLeg('1호선', ['서울역', '시청'])], 30);
  r = await W.ntLiveFirst({}, far, BASE, BASE, mk(fetchOf([item(secTo(tblMs) + 45, term)])));
  ok(Object.keys(r).length === 0, '접근 30분(20분 넘게 먼 승차)은 시각표');
  calls = 0; await W.ntLiveFirst({}, out2, BASE, BASE, mk(fetchOf([item(60, term)]))); ok(calls === 0, '대상이 없으면 호출도 없다');
  r = await W.ntLiveFirst({}, out1, BASE, BASE, { fetch: () => Promise.reject(new Error('x')), id: RS.rsSubwayId, pick: RS.rsBlLivePick, table: RS.rsBlTable, rec: RS.rsBlReconcile, aheadMax: 20 });
  ok(Object.keys(r).length === 0, '호출이 던져도 비어 있다(경로 응답을 막지 않는다)');

  // ── 경로에 붙이기(ntAttachPath) ──
  const mkPath = (first) => ({ info: {}, subPath: [
    { trafficType: 3, startSec: 0, arriveSec: 0, endSec: 300 },
    first ? { trafficType: 2, startSec: 300, arriveSec: 300, endSec: 900, lane: [{ busNo: '100' }] } : null,
    { trafficType: 1, arriveSec: 300, startSec: 300, endSec: 900, lane: [{ name: '1호선' }], passStopList: { stations: [{ stationName: '서울역' }, { stationName: '시청' }, { stationName: '종각' }] } }
  ].filter(Boolean) });
  const pOff = mkPath(false); W.ntAttachPath(nt, pOff, BASE, false, null);
  const waitTable = pOff.subPath[1].ttWaitMs;
  ok(waitTable > 0 && !pOff.subPath[1].ttLive, '실시간이 없으면 시각표 대기: ' + waitTable);
  const liveMs = BASE + 300000 + 4 * 60000;                          // 13:09 도착 — 그 차를 탄다
  const live = {}; live[W.ntLiveKey('1호선', '서울역', '시청', 300)] = { ms: liveMs, src: 'realtime' };
  const pOn = mkPath(false); const n = W.ntAttachPath(nt, pOn, BASE, false, live);
  ok(pOn.subPath[1].ttWaitMs === 4 * 60000 && pOn.subPath[1].ttLive === true && n === 1, '실시간이 있으면 그 차까지의 대기로 교체: ' + pOn.subPath[1].ttWaitMs);
  ok(pOn.info.ttLive === 1, '경로 정보에 교체 횟수');
  ok(pOn.subPath[1].nextTrain && pOn.subPath[1].nextTrain.found !== undefined, '안내용 nextTrain 은 그대로 붙는다');
  const pBus = mkPath(true); W.ntAttachPath(nt, pBus, BASE, false, live);
  ok(pBus.subPath[2].ttLive !== true, '첫 대중교통이 버스면 뒤 지하철은 실시간으로 바꾸지 않는다');
  const tooLong = {}; tooLong[W.ntLiveKey('1호선', '서울역', '시청', 300)] = { ms: BASE + 300000 + 40 * 60000, src: 'realtime' };
  const pLong = mkPath(false); W.ntAttachPath(nt, pLong, BASE, false, tooLong);
  ok(pLong.subPath[1].ttWaitMs === waitTable && !pLong.subPath[1].ttLive, '30분 넘는 대기는 반영하지 않고 시각표');
  const pStale = mkPath(false); pStale.subPath[1].ttWaitMs = 99; pStale.subPath[1].ttLive = true; W.ntAttachPath(nt, pStale, BASE, false, null);
  ok(pStale.subPath[1].ttLive !== true && pStale.subPath[1].ttWaitMs === waitTable, '캐시된 경로에 남은 옛 값은 지운다');
  const pShift = mkPath(false); pShift.info.svcWarn = [{ shift: 120 }]; W.ntAttachPath(nt, pShift, BASE, false, live);
  ok(!pShift.subPath[1].ttLive, '운행 종료 보정(다음 날 첫차)이 걸린 경로는 실시간을 쓰지 않는다');
  console.log('next_train_live_first: pass', pass, 'fail', fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL', e && e.stack || e); process.exit(1); });
