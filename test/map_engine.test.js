// 지도 탭 화면 엔진(engine/map.js) 시험.  실행: node test/map_engine.test.js   (javac · java 필요)
//  ① cap ② 머리줄(안쪽 탭·지역·검색·호선 필터) ③ 역 → 노선(웹 MSM·별칭) · 검색 · 가까운 역 ④ 역 팝업 ⑤ 시간표 ⑥ 지방 노선 목록
//  ⑦ 모든 화면이 앱 검증기(ScreenCore.load)를 통과 ⑧ 워커 내장 사본·끝에서 끝까지(POST /screen/map)
process.env.TZ = 'Asia/Seoul';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), { spawnSync } = require('child_process');
const E = require('../engine/map');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('ios-reference/index.html'), 'utf8');
const call = (f, d) => E.mapScreen({ cap: 18 }, f, d);
const strs = n => JSON.stringify(n);

// ① cap
ok(E.mapScreen({ cap: 17 }, {}, {}).ok === false && E.mapScreen({}, {}, {}).ok === false, 'cap 18 미만이면 만들지 않는다');

// ② 머리줄
{
  let h = call({ part: 'h', mode: 'bus' });
  ok(h.ok && h.screen === 'map' && h.head.length === 1 && h.head[0].items.map(i => i.label).join() === '버스,지하철' && h.head[0].items[0].on, '버스: 안쪽 탭만(웹 기본은 버스)');
  h = call({ part: 'h', mode: 'subway', reg: 'seoul', flt: '2호선', q: '부평' });
  ok(h.head.length === 4 && h.head[1].items.map(i => i.label).join() === '수도권,부산,대구,광주,대전', '지하철: 지역 탭');
  ok(h.head[2].t === 'inbar' && h.head[2].value === '부평' && h.head[2].act.v === 'mp.find', '역 검색 입력줄');
  const ch = h.head[3].items;
  ok(ch[0].label === '내 위치' && ch.length === 1 + 14 && ch.filter(i => i.on).map(i => i.label).join() === '2호선' && ch[1].act.v === 'f:ALL', '호선 필터 칩 14개 + 내 위치');
  h = call({ part: 'h', mode: 'subway', reg: 'busan' });
  ok(h.head.length === 2, '지방은 검색·호선 필터 없음');
  // 웹 필터 이름과 같은가
  const names = [...html.matchAll(/gmFilterLine\('([^']+)'\)"\s+id="gf/g)].map(m => m[1]);
  ok(names.join() === E.MAP_FILTERS.map(f => f[0]).join(), '호선 필터 이름·순서가 웹과 같다 ' + names.length);
}

// ③ 역 → 노선 · 검색 · 가까운 역
{
  const gn = E.mapLinesOf('강남');
  ok(gn.indexOf('2호선') >= 0 && gn.indexOf('신분당선') >= 0, '강남: 2호선·신분당선 ' + gn);
  const sl = E.mapLinesOf('서울역'), s2 = E.mapLinesOf('서울');
  ok(sl.length > 0 && s2.every(l => sl.indexOf(l) >= 0), '별칭 서울역 → 서울의 노선도 합친다');
  ok(E.mapLinesOf('없는역xyz').length === 0, '모르는 이름은 노선 없음');
  ok(E.mapIsStationLabel('강남') && !E.mapIsStationLabel('2호선') && !E.mapIsStationLabel('환승안내') && !E.mapIsStationLabel('가'), '역이 아닌 지도 글자 거르기(웹 _NM_SKIP)');
  ok(E.mapFind(' 부 평 ').name === '부평' && E.mapFind('부') === null, '검색: 공백 무시 · 한 글자는 안 찾음');
  ok(E.mapFind('강남').known && E.mapFind('강남').name === '강남', '검색: 이름이 같은 것 먼저');
  ok(E.mapFind('평택지').known === true || E.mapFind('평택지').known === false, '검색: 포함 검색 동작');
  const nr = E.mapNearest(37.4979, 127.0276);
  ok(nr && nr.name === '강남', '가까운 역 ' + (nr && nr.name));
  const mm = /var MSM = \(function\(\)\{[\s\S]*?\}\)\(\);/.exec(html);
  ok(!!mm, '웹 MSM 정의를 찾았다');
  const T = require('../engine/home-stations').HOME_STNS;
  const web = vm.runInNewContext('var STNDB=' + JSON.stringify(T.map(s => ({ name: s[0], line: s[1], lat: s[2], lng: s[3] }))) + ';' + mm[0] + ';MSM');
  let same = 0, diff = 0; Object.keys(web).forEach(k => { if (k === '서울역' || k === '총신대입구') return; if (web[k].join() === E.mapLinesOf(k).join()) same++; else diff++; });   // 별칭 두 개는 웹 _metroLines 가 합치는 것(아래에서 따로)
  ok(E.mapLinesOf('총신대입구').join() === '4호선,7호선' && diff === 0 && same > 500, '역 → 노선 표가 웹 MSM 과 모두 같다 ' + same + '/' + (same + diff));
  const q = call({ part: 'h', mode: 'subway', q: '부평', gps: [37.4979, 127.0276] });
  ok(q.info.find.name === '부평' && q.info.near.name === '강남', '머리줄 응답에 찾을 역·가까운 역');
}

// ④ 역 팝업
{
  const s = call({ part: 'stn', stn: ' 강 남 ', th: 'dark' });
  ok(s.ok && s.screen === 'mapstn' && s.info.name === '강남' && s.info.lines.indexOf('2호선') >= 0, '팝업 이름·노선');
  const k = s.body;
  ok(k[0].title === '강남' && k[1].items.length === s.info.lines.length && k[1].items.every(i => /^#[0-9a-fA-F]{6}$/.test(i.c)), '노선 칩(색)');
  ok(k[2].kids.map(x => x.act.v).join() === 'mp.start,mp.dest' && k[3].act.v === 'mp.tt', '출발역·도착역·시간표 단추');
  ok(s.info.pick && s.info.pick.name === '강남' && s.info.pick.la > 37 && s.info.pick.lo > 127, '출발/도착으로 쓸 행(좌표 포함)');
  const s3 = call({ part: 'stn', stn: '부산', sl: '부산1호선' });
  ok(s3.ok && s3.info.pick.line === '부산1호선' && s3.info.lines[0] === '부산1호선', '지방 역 팝업(누른 노선 힌트)');
  ok(call({ part: 'stn', stn: '2호선' }).ok === false && call({ part: 'stn', stn: '' }).ok === false, '역이 아닌 글자는 거절');
  ok(/노선 정보 없음/.test(strs(call({ part: 'stn', stn: '없는역xyz' }).body)), '노선 모르면 안내');
}

// ⑤ 시간표
{
  const dirs = [{ dk: '상', toward: '잠실', times: [300, 310, 480, 485, 1450], first: 300, last: 1450, nextMin: 480 }, { dk: '하', toward: '', times: [310], first: 310, last: 310, nextMin: null, tomorrow: false }];
  const data = { dayCode: 'DAY', today: 'DAY', days: [{ code: 'DAY', label: '평일' }, { code: 'SAT', label: '토요일' }, { code: 'SUN', label: '일요일' }], nowMin: 470, dirs, noData: false };
  const lines = E.mapLinesOf('강남');
  const res = {}; res[lines[0] + '|-'] = data; if (lines[1]) res[lines[1] + '|-'] = { noData: true };
  let t = call({ part: 'tt', stn: '강남', tt: { st: 'ok', res } });
  ok(t.ok && t.screen === 'maptt' && t.info.line === lines[0] && t.info.day === 'DAY' && t.info.dk === '상', '첫 노선·오늘 요일·첫 방향을 엔진이 고른다');
  const k = t.body;
  ok(k[1].items.length === lines.length && k[1].items[0].on && /자료 없음/.test(k[1].items[1] ? k[1].items[1].label : '자료 없음'), '노선 칩(자료 없는 노선 표시)');
  ok(k[2].items.map(i => i.label).join() === '평일 · 오늘,토요일,일요일' && k[2].items[0].on, '요일 칩');
  ok(k[3].items[0].label === '잠실 방면' && k[3].items[1].label === '하행' && k[3].items[0].on, '방향 칩');
  ok(k[4].s === '첫차 05:00 · 막차 00:10 · 다음 열차 08:00', '요약 ' + k[4].s);
  ok(k[5].s === '05시   00  10' && k[6].s === '08시   00  05' && k[6].hl && k[6].hl[0][0] === 7 && k[7].s === '24시 익일   10' || k[7].s.startsWith('00시'), '시(時)별 묶기·익일 표시·다음 열차 굵게 ' + k[5].s + ' | ' + k[6].s + ' | ' + (k[7] && k[7].s));
  t = call({ part: 'tt', stn: '강남', tt: { st: 'ok', res, sel: { line: lines[0], day: 'SAT', dk: '하' } } });
  ok(t.info.need && t.info.need.day === 'SAT', '요일 고르면 그 응답이 없을 때 앱이 받아야 할 것을 알려 준다');
  t = call({ part: 'tt', stn: '강남', tt: { st: 'loading', res: {} } });
  ok(/불러오는 중/.test(strs(t.body)) && t.info.need && t.info.need.line, '불러오는 중');
  t = call({ part: 'tt', stn: '강남', tt: { st: 'fail', res: {} } });
  ok(/불러오지 못했어요/.test(strs(t.body)) && /mt.retry/.test(strs(t.body)), '실패 + 다시 시도');
  t = call({ part: 'tt', stn: '강남', tt: { st: 'ok', res: { [lines[0] + '|-']: { noData: true } } } });
  ok(/아직 받지 못했어요/.test(strs(t.body)), '자료 없는 노선은 지어내지 않는다');
}

// ⑥ 지방 노선 목록
{
  const b = call({ part: 'b', mode: 'subway', reg: 'busan', th: 'dark' });
  ok(b.info.view === 'list' && b.body[0].s === '부산 지하철 노선도' && b.body.filter(n => n.t === 'pill').length === 4, '부산 4개 노선 카드');
  const pills = b.body.filter(n => n.t === 'pill'), p1 = { kids: [pills[0], b.body[b.body.indexOf(pills[0]) + 1]] };
  ok(p1.kids[0].s.startsWith('부산1호선 (') && p1.kids[1].items.length > 20 && b.info.rs.length > 80, '노선 카드: 이름·역 칩');
  ok(b.body.filter(n => n.t === 'pill').every(p => p.fill === { '부산1호선': '#F06A00', '부산2호선': '#81BF48', '부산3호선': '#BB8C00', '부산4호선': '#217DCB' }[p.s.split(' ')[0]]), '노선 색(웹 표)');
  ok(call({ part: 'b', mode: 'subway', reg: 'daegu' }).body.filter(n => n.t === 'pill').length === 3, '대구 3개 노선');
  ok(call({ part: 'b', mode: 'subway', reg: 'gwangju' }).body.filter(n => n.t === 'pill').length === 1 && call({ part: 'b', mode: 'subway', reg: 'daejeon' }).body.filter(n => n.t === 'pill').length === 1, '광주·대전 1개 노선');
  const s = call({ part: 'b', mode: 'subway', reg: 'seoul' });
  ok(s.info.view === 'metro', '수도권은 노선도 그림(앱 View)');
}

// ⑥ 버스 — 근처 정류장 · 도착정보
const SEOUL_POS = '<ServiceResult><msgBody>' + [['11111', '아라역5번출구', 127.0, 37.5, 60], ['11112', '아라역5번출구', 127.00001, 37.50001, 70], ['22222', '길건너', 127.001, 37.501, 200], ['33333', '큰길', 127.002, 37.502, 400], ['0', '퇴계로2가교차로(미정차)', 127.0, 37.5, 10], ['44444', '아라역1번출구', 127.003, 37.503, 330]]
  .map(r => `<itemList><arsId>${r[0]}</arsId><stationNm>${r[1]}</stationNm><gpsX>${r[2]}</gpsX><gpsY>${r[3]}</gpsY><dist>${r[4]}</dist></itemList>`).join('') + '</msgBody></ServiceResult>';
const SEOUL_ARR = '<ServiceResult><msgBody><itemList><rtNm>146</rtNm><arrmsg1>3분30초후[2번째 전]</arrmsg1><traTime1>210</traTime1><arrmsg2>10분후[5번째 전]</arrmsg2><traTime2></traTime2><congestion1>2</congestion1><busType1>1</busType1><adirection>강남역</adirection></itemList><itemList><rtNm>N13</rtNm><arrmsg1>곧 도착</arrmsg1><traTime1>0</traTime1><arrmsg2>운행종료</arrmsg2></itemList></msgBody></ServiceResult>';
{
  const mk = (bus) => call({ part: 'b', mode: 'bus', th: 'dark', bus });
  let b = mk(null);
  ok(b.info.view === 'bus' && b.info.bus.st === 'noloc' && JSON.stringify(b.body).includes('mp.loc'), '버스: 위치 없으면 안내 + 내 위치 단추');
  b = mk({ lat: 37.5, lng: 127.0, res: {} });
  ok(b.info.bus.st === 'need' && b.info.bus.need.map(n => n.k).join() === 'tp,gg,tn' && /getStationByPos\?tmX=127&tmY=37\.5/.test(b.info.bus.need[0].url) && /busstationservice\/v2\/getBusStationAroundListv2\?x=127&y=37\.5&format=json/.test(b.info.bus.need[1].url) && /gpsLati=37\.5&gpsLong=127/.test(b.info.bus.need[2].url), '버스 1단계: 서울 좌표면 TOPIS + 경기 GBIS + TAGO 주소를 요청');
  b = mk({ lat: 35.1, lng: 129.0, res: {} });
  ok(b.info.bus.need.map(n => n.k).join() === 'tn', '서울 밖이면 TAGO 만');
  b = mk({ lat: 37.5, lng: 127.0, res: { tp: SEOUL_POS, gg: '', tn: '' } });
  const n2 = b.info.bus.need;
  ok(b.info.bus.st === 'need' && n2.length === 4 && n2[0].k === 'a0' && /getStationByUid\?arsId=11111/.test(n2[0].url), '버스 2단계: 중복·미정차 제거, 출구 우선, 도착 주소 요청 ' + n2.length);
  ok(n2.map(n => n.url.match(/arsId=(\d+)/)[1]).join() === '11111,44444,22222,33333', '출구(350m 안) 먼저 → 나머지 가까운 순');
  b = mk({ lat: 37.5, lng: 127.0, res: { tp: SEOUL_POS, gg: '', tn: '', a0: SEOUL_ARR, a1: '', a2: '', a3: '' } });
  const txt = JSON.stringify(b.body);
  ok(b.info.bus.st === 'ok' && /146 {2}4분 · 2번째 전 · 보통 · 저상/.test(txt) && /강남역 방면/.test(txt) && /N13 {2}곧 도착/.test(txt) && !/운행종료/.test(txt), '버스 3단계: 도착 줄(분·번째 전·혼잡·저상·방면) · 운행종료 제외');
  ok((txt.match(/도착 정보 없음/g) || []).length === 3, '도착이 비면 "도착 정보 없음"');
  // TOPIS 가 비면 TAGO 로
  const TAGO = JSON.stringify({ response: { body: { items: { item: [{ nodeid: 'ICB1', nodenm: '부평역', gpslati: 37.489, gpslong: 126.724, citycode: '23', nodeno: '12345' }] } } } });
  b = mk({ lat: 37.489, lng: 126.724, res: { tp: '', gg: '', tn: TAGO } });
  ok(b.info.bus.need.length === 1 && /cityCode=23&nodeId=ICB1/.test(b.info.bus.need[0].url), 'TOPIS 실패 → TAGO 정류장');
  const TA = JSON.stringify({ response: { body: { items: { item: [{ routeno: '8', arrtime: 240, arrprevstationcnt: 3 }, { routeno: '8', arrtime: 700, arrprevstationcnt: 9 }] } } } });
  b = mk({ lat: 37.489, lng: 126.724, res: { tp: '', gg: '', tn: TAGO, a0: TA } });
  ok(b.info.bus.st === 'ok' && /8 {2}4분 · 3번째 전/.test(JSON.stringify(b.body)) && /12분/.test(JSON.stringify(b.body)), 'TAGO 도착 두 대');
  b = mk({ lat: 37.5, lng: 127.0, res: { tp: '', gg: '', tn: '' } });
  ok(b.info.bus.st === 'need' && b.info.bus.need.length === 1 && b.info.bus.need[0].k === 'd1' && /^https:\/\/gentle-lab-7e47subway-api\.phg0643\.workers\.dev\/bus-stops\?lat=37\.5&lng=127&radius=800$/.test(b.info.bus.need[0].url), '공공 API 가 모두 비면 서버 정류장 표(D1)를 요청');
  b = mk({ lat: 37.5, lng: 127.0, res: { tp: '', gg: '', tn: '', d1: '{"stops":[]}' } });
  ok(b.info.bus.st === 'empty', '정류장 없음')
  // 경기 GBIS (웹 _fetchNearStopsGG / _ggArrivals 와 같은 규칙)
  const GG = (rows) => JSON.stringify({ response: { msgHeader: { queryTime: 'x', resultCode: 0, resultMessage: '정상' }, msgBody: { busStationAroundList: rows } } });
  const GGS = GG([{ stationId: 203000123, stationName: '수원역', x: 127.0011, y: 37.2661, distance: 120, mobileNo: '31001' }, { stationId: 203000124, stationName: '수원역환승센터', x: 127.0021, y: 37.2671, distance: 260 }]);
  const GGA = JSON.stringify({ response: { msgHeader: { resultCode: 0 }, msgBody: { busArrivalList: [
    { routeName: '13-4', routeId: 1, routeTypeCd: 13, predictTimeSec1: 240, predictTimeSec2: 700, locationNo1: 3, locationNo2: 8, lowPlate1: 1, crowded1: 2, routeDestName: '영통', flag: 'PASS' },
    { routeName: '7000', routeTypeCd: 11, predictTime1: 5, predictTime2: 130, locationNo1: 2, routeDestName: '서울역', flag: 'PASS' },
    { routeName: '99', routeTypeCd: 30, predictTimeSec1: 100, flag: 'STOP' },
    { routeName: '88', routeTypeCd: 30, predictTimeSec1: 7209, predictTimeSec2: 0, flag: 'PASS' }] } } });
  b = mk({ lat: 37.2661, lng: 127.0011, res: {} });
  ok(b.info.bus.need.map(n => n.k).join() === 'gg,tn' && /^https:\/\/apis\.data\.go\.kr\/6410000\/busstationservice\/v2\/getBusStationAroundListv2\?x=127\.0011&y=37\.2661&format=json$/.test(b.info.bus.need[0].url), '경기 좌표(서울 밖): GBIS 정류장 + TAGO 를 요청');
  b = mk({ lat: 37.2661, lng: 127.0011, res: { gg: GGS, tn: TAGO } });
  const n3 = b.info.bus.need;
  ok(b.info.bus.st === 'need' && n3.length === 2 && /busarrivalservice\/v2\/getBusArrivalListv2\?stationId=203000123&format=json$/.test(n3[0].url), '경기 좌표는 GBIS 정류장이 TAGO 보다 먼저: 도착 주소는 stationId 로 ' + JSON.stringify(n3.map(x => x.url.slice(-40))));
  b = mk({ lat: 37.2661, lng: 127.0011, res: { gg: GGS, tn: TAGO, a0: GGA, a1: '' } });
  const gt = JSON.stringify(b.body);
  ok(b.info.bus.st === 'ok' && /13-4 일반 {2}4분 · 3번째 전 · 보통 · 저상/.test(gt) && /영통 방면/.test(gt) && /12분 · 8번째 전/.test(gt), 'GBIS 도착: 노선 유형 · 분 · 번째 전 · 혼잡도 · 저상 · 방면 · 둘째 차');
  ok(/7000 직행좌석 {2}5분 · 2번째 전/.test(gt) && /서울역 방면/.test(gt) && !/99 마을/.test(gt) && !/88 마을/.test(gt), 'GBIS: 분 단위 값은 초로 · 운행종료(STOP)와 1시간 넘는 예측은 뺀다');
  ok(/수원역 {2}120m {2}·/.test(gt) && /31001/.test(gt), 'GBIS 정류장: 이름 · 거리 · 정류장 번호');
  b = mk({ lat: 37.2661, lng: 127.0011, res: { gg: JSON.stringify({ response: { msgHeader: { resultCode: 4 } } }), tn: TAGO } });
  ok(b.info.bus.need[0].url.indexOf('ArvlInfoInqireService') > 0, 'GBIS 가 결과 없음(4)이면 TAGO 로');
  b = mk({ lat: 37.2661, lng: 127.0011, res: { gg: '<html>인증 실패</html>', tn: TAGO } });
  ok(b.info.bus.need[0].url.indexOf('ArvlInfoInqireService') > 0, 'GBIS 응답이 JSON 이 아니면(인증 실패) TAGO 로');
  b = mk({ lat: 37.489, lng: 126.724, res: { gg: GGS, tn: TAGO } });
  ok(b.info.bus.need[0].url.indexOf('ArvlInfoInqireService') > 0, '인천 상자 안에서는 TAGO 가 먼저');
  b = mk({ lat: 37.489, lng: 126.724, res: { gg: GGS, tn: '' } });
  ok(/busarrivalservice/.test(b.info.bus.need[0].url), '인천 상자 안이라도 TAGO 가 비면 GBIS');
  // D1 보조
  const D1 = JSON.stringify({ ok: true, stops: [{ node_id: 'DJB1', node_nm: '대전역', city_code: '25', lat: 36.332, lng: 127.434 }, { node_id: 'XX9', node_nm: '시청', city_code: '0', lat: 36.35, lng: 127.385 }] });
  b = mk({ lat: 36.333, lng: 127.434, res: { tn: '', d1: D1 } });
  ok(b.info.bus.st === 'need' && b.info.bus.need.length === 2 && /cityCode=25&nodeId=DJB1/.test(b.info.bus.need[0].url) && /cityCode=25&nodeId=XX9/.test(b.info.bus.need[1].url), 'D1 보조 정류장: 시 코드가 0 이면 좌표 상자로 추정(대전 25)');
  ok(E.mapCityOf(35.1, 129.0) === '21' && E.mapCityOf(10, 10) === '' && E.mapGGPreferred(37.2661, 127.0011) === true && E.mapGGPreferred(37.489, 126.724) === false && E.mapGGPreferred(35.1, 129.0) === false, '시 코드 상자 · 경기 우선 판정');
  ok(/map\.kakao\.com\/link\/map\/%EC%88%98%EC%9B%90%EC%97%AD,37\.2661,127\.0011/.test(JSON.stringify(mk({ lat: 37.2661, lng: 127.0011, res: { gg: GGS, tn: TAGO, a0: GGA, a1: '' } }).body)) && JSON.stringify(mk({ lat: 37.2661, lng: 127.0011, res: { gg: GGS, tn: TAGO, a0: GGA, a1: '' } }).body).includes('link/to/'), '정류장마다 위치 보기 · 길찾기(외부 지도) 단추');
  // 웹과 같은 규칙: 같은 이름 25m 안은 한 곳으로, 출구가 많으면 목록이 늘어난다
  const many = []; for (let i = 0; i < 9; i++) many.push({ nm: '아라역' + (i + 1) + '번 출구', la: 37.5 + i * 1e-3, lo: 127, dist: 100 + i * 10, src: 'tago' });
  for (let i = 0; i < 6; i++) many.push({ nm: '일반' + i, la: 37.4 + i * 1e-2, lo: 127, dist: 50 + i, src: 'tago' });
  const ord = E.mapStopOrder(many);
  ok(ord.length === 12 && ord.slice(0, 9).every(x => /출구/.test(x.nm)) && ord[9].nm === '일반0', '출구 9곳이면 12곳까지, 출구가 먼저');
}

// ⑦ 앱 검증기
{
  const T = E.mapLinesOf('강남'), lines = [];
  const push = o => lines.push(JSON.stringify(o));
  ['bus', 'subway'].forEach(m => ['seoul', 'busan', 'daegu', 'gwangju', 'daejeon'].forEach(r => { push(call({ part: 'h', mode: m, reg: r, flt: '3호선', q: '강남' })); push(call({ part: 'b', mode: m, reg: r, th: 'dark' })); }));
  push(call({ part: 'b', mode: 'bus', th: 'dark', bus: null })); push(call({ part: 'b', mode: 'bus', th: 'dark', bus: { lat: 37.5, lng: 127, res: {} } })); push(call({ part: 'b', mode: 'bus', th: 'pastel', bus: { lat: 37.5, lng: 127, res: { tp: SEOUL_POS, gg: '', tn: '', a0: SEOUL_ARR, a1: '', a2: '', a3: '' } } }));
  push(call({ part: 'stn', stn: '강남' })); push(call({ part: 'stn', stn: '없는역xyz' }));
  const data = { dayCode: 'DAY', today: 'DAY', days: [{ code: 'DAY', label: '평일' }], dirs: [{ dk: '상', toward: '잠실', times: [300, 310, 480, 1450], first: 300, last: 1450, nextMin: 480 }] };
  push(call({ part: 'tt', stn: '강남', tt: { st: 'ok', res: { [T[0] + '|-']: data } } })); push(call({ part: 'tt', stn: '강남', tt: { st: 'loading' } })); push(call({ part: 'tt', stn: '강남', tt: { st: 'fail' } }));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapchk_'));
  try {
    const f = path.join(dir, 'in.jsonl'), cls = path.join(dir, 'c');
    fs.writeFileSync(f, lines.join('\n') + '\n'); fs.mkdirSync(cls);
    const ENV = Object.assign({}, process.env, { JAVA_TOOL_OPTIONS: '' });
    let r = spawnSync('javac', ['-encoding', 'UTF-8', '-d', cls, R('native/shell/ScreenCore.java'), R('test/java/ScreenCheck.java')], { env: ENV, encoding: 'utf8' });
    ok(r.status === 0, 'ScreenCheck 컴파일 ' + (r.stderr || '').slice(0, 300));
    r = spawnSync('java', ['-Dfile.encoding=UTF-8', '-Dstdout.encoding=UTF-8', '-cp', cls, 'com.dullyyj.subway.ScreenCheck', f], { env: ENV, encoding: 'utf8' });
    const out = (r.stdout || '').split('\n').filter(Boolean);
    ok(out.length === lines.length, '모든 화면에 결과가 나왔다 ' + out.length + '/' + lines.length);
    ok(out.every(l => l.startsWith('OK ')), '모든 화면이 앱 검증기를 통과 ' + out.filter(l => !l.startsWith('OK ')).slice(0, 3).join(' | '));
    ok(out.every(l => Number(l.split(' ')[2]) === 0), '건너뛴 노드 없음');
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { } }
}

// ⑧ 워커
(async () => {
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  const ms = '// ===== MAP ENGINE BEGIN =====', me = '// ===== MAP ENGINE END =====';
  const i = w.indexOf(ms), j = w.indexOf(me);
  ok(i > 0 && j > i, '워커에 지도 엔진이 내장돼 있다');
  const esc = t => t.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  let src = fs.readFileSync(R('engine/map.js'), 'utf8'); src = src.slice(0, src.indexOf('if (typeof module')).trimEnd();
  const body = w.slice(i + ms.length, j);
  ok(body.indexOf(esc(src)) >= 0 && body.indexOf(esc(fs.readFileSync(R('engine/map-worker.js'), 'utf8').trimEnd())) >= 0, '워커 내장 사본이 같다');
  ok(w.indexOf('if (url.pathname === "/screen/map") return handleScreenMap(request);') > 0 && !/[^\x00-\x7f]/.test(body), '경로 등록 · ASCII');
  const tmp = path.join(os.tmpdir(), 'rv2_map_' + process.pid + '.mjs');
  fs.copyFileSync(R('engine/route-v2-worker.ascii.js'), tmp);
  try {
    const mod = await import(tmp), wk = mod.default, c2 = (u, init) => wk.fetch(new Request(u, init), {}, { waitUntil() { } });
    const post = b => c2('https://x/screen/map', { method: 'POST', body: b, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    const r = await post(JSON.stringify({ cap: 18, f: { part: 'stn', stn: '강남', th: 'dark' } })), j2 = await r.json();
    ok(r.status === 200 && j2.ok && j2.screen === 'mapstn' && /route-v2-2026-10-\d\ds\d\d/.test(j2.ver), '워커 응답 200');
    ok(JSON.stringify(j2.body) === JSON.stringify(call({ part: 'stn', stn: '강남', th: 'dark' }).body), '워커와 직접 계산이 같다');
    ok((await (await post(JSON.stringify({ cap: 3, f: {} }))).json()).ok === false && (await post('{oops')).status === 400 && (await c2('https://x/screen/map')).status === 405, '워커: cap 부족·깨진 본문·GET 거절');
    const hb = await (await post(JSON.stringify({ cap: 18, f: { part: 'h', mode: 'subway', q: '부평' } }))).json();
    ok(hb.info.find.name === '부평', '워커: 검색 결과');
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  console.log(`map_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
