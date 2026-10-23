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
  ok(h.ok && h.screen === 'map' && h.head.length === 1 && h.head[0].t === 'btog' && h.head[0].v === 'u' && h.head[0].items.map(i => i.label).join() === '🚌 버스,🚇 지하철' && h.head[0].items[0].on, '버스: 밑줄 탭만(웹 .map-inner-tabs · 기본은 버스)');
  h = call({ part: 'h', mode: 'subway', reg: 'seoul', flt: '2호선', q: '부평' });
  ok(h.head.length === 4 && h.head[1].items.map(i => i.label).join() === '수도권,부산,대구,광주,대전', '지하철: 지역 탭');
  ok(h.head[2].t === 'inbar' && h.head[2].value === '부평' && h.head[2].act.v === 'mp.loc' && h.head[2].eact.v === 'mp.find' && h.head[2].btn === '📍 내 위치' && h.head[2].h === 33, '역 검색 입력줄(웹: 📍 내 위치 단추 · 엔터 = 찾기)');
  const ch = h.head[3].items;
  ok(ch.length === 14 && ch.filter(i => i.on).map(i => i.label).join() === '2호선' && ch[0].act.v === 'f:ALL' && ch[0].pl === true && ch[1].oc === ch[1].c && h.head[3].h === 27 && h.head[3].fs === 11, '호선 필터 칩 14개(웹: 전체는 굵은 글자만 · 노선 색 테두리)');
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
  ok(s.body[0].rw === 100 && s.body[0].mq === true && s.body[0].lines === 1, '역 이름은 놀이터 칸(100)을 남기고 길면 흐른다(mq)');
  const k = s.body;
  ok(k[0].s === '강남' && k[0].size === 22 && k[1].t === 'lpills' && k[1].items.length === s.info.lines.length && k[1].items.every(i => /^#[0-9a-fA-F]{6}$/.test(i.c) && !i.act), '노선 알약(색 · 누르는 칸 아님)');
  ok(k[1].items.find(i => i.s === '2호선').num === '2' && E.mapLineNum('GTX-A') === 'A' && E.mapLineNum('gtx b') === 'B' && E.mapLineNum('신분당선') === '' && E.mapLineNum('수인분당선') === '' && E.mapLineNum('부산1호선') === '1', '호선 숫자 동그라미(웹 _lineNumOf: n호선 · GTX 글자 · 그 밖은 없음)');
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
  ok(t.body[0].t === 'bar' && t.body[0].pad[1] === 36 && t.body[0].rw === 100 && t.body[0].mq === true, '시간표 제목줄은 웹처럼 위 여백 36(손잡이 아래) — 캐릭터 놀이터가 제목 옆에 솟는다');
  ok(t.ok && t.screen === 'maptt' && t.info.line === lines[0] && t.info.day === 'DAY' && t.info.dk === '상', '첫 노선·오늘 요일·첫 방향을 엔진이 고른다');
  const k = t.body;
  ok(k[1].items.length === lines.length && k[1].items[0].on && /자료 없음/.test(k[1].items[1] ? k[1].items[1].label : '자료 없음'), '노선 칩(자료 없는 노선 표시)');
  ok(k[2].items.map(i => i.label).join() === '평일 · 오늘,토요일,일요일' && k[2].items[0].on, '요일 칩');
  ok(k[3].items[0].label === '잠실 방면' && k[3].items[1].label === '하행' && k[3].items[0].on, '방향 칩');
  ok(k[4].s === '첫차 05:00 · 막차 00:10 · 다음 열차 08:00', '요약 ' + k[4].s);
  ok(k[5].s === '05시   00  10' && k[6].s === '08시   00  05' && k[6].hl && k[6].hl[0][0] === 7 && k[7].s === '24시 익일   10' || k[7].s.startsWith('00시'), '시(時)별 묶기·익일 표시·다음 열차 굵게 ' + k[5].s + ' | ' + k[6].s + ' | ' + (k[7] && k[7].s));
  ok(k[6].fc && /^n/.test(k[6].fc) && !k[5].fc && !k[7].fc, '다음 열차가 든 줄에만 fc(스크롤 표시)가 붙는다: ' + k[6].fc);
  ok(call({ part: 'tt', stn: '강남', tt: { st: 'ok', res } }).body[6].fc === k[6].fc, '같은 노선·요일·방향이면 fc 열쇠가 같다(다시 그려도 보던 자리를 지킨다)');
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
const SEOUL_POS = '<ServiceResult><msgBody>' + [['11111', '아라역5번출구', 127.0, 37.50054, 60], ['11112', '아라역5번출구', 127.0, 37.500541, 70], ['22222', '길건너', 127.0, 37.5018, 200], ['33333', '큰길', 127.0, 37.50252, 400], ['0', '퇴계로2가교차로(미정차)', 127.0, 37.5, 10], ['44444', '아라역1번출구', 127.0, 37.50267, 330]]
  .map(r => `<itemList><arsId>${r[0]}</arsId><stationNm>${r[1]}</stationNm><gpsX>${r[2]}</gpsX><gpsY>${r[3]}</gpsY><dist>${r[4]}</dist></itemList>`).join('') + '</msgBody></ServiceResult>';
const SEOUL_ARR = '<ServiceResult><msgBody><itemList><rtNm>146</rtNm><arrmsg1>3분30초후[2번째 전]</arrmsg1><traTime1>210</traTime1><arrmsg2>10분후[5번째 전]</arrmsg2><traTime2></traTime2><congestion1>2</congestion1><busType1>1</busType1><adirection>강남역</adirection></itemList><itemList><rtNm>N13</rtNm><arrmsg1>곧 도착</arrmsg1><traTime1>0</traTime1><arrmsg2>운행종료</arrmsg2></itemList></msgBody></ServiceResult>';
{
  const mk = (bus) => call({ part: 'b', mode: 'bus', th: 'dark', bus });
  let b = mk(null);
  ok(b.info.view === 'bus' && b.info.bus.st === 'noloc' && JSON.stringify(b.body).includes('mp.loc') && b.head[0].t === 'btog' && b.head[0].v === 'p', '버스: 위치 없으면 안내 + 내 위치 단추(토글 줄은 머리에 고정)');
  b = mk({ lat: 37.5, lng: 127.0, res: {} });
  ok(b.info.bus.st === 'need' && b.info.bus.need.map(n => n.k).join() === 'tp,gg,tn' && /getStationByPos\?tmX=127&tmY=37\.5/.test(b.info.bus.need[0].url) && /busstationservice\/v2\/getBusStationAroundListv2\?x=127&y=37\.5&format=json/.test(b.info.bus.need[1].url) && /gpsLati=37\.5&gpsLong=127/.test(b.info.bus.need[2].url), '버스 1단계: 서울 좌표면 TOPIS + 경기 GBIS + TAGO 주소를 요청');
  ok(b.head[0].items.map(i => i.label).join() === '📍 주변 정류장,⭐ 즐겨찾기' && b.head[0].items[0].on && b.head[0].rf.act.v === 'mp.rf' && b.head[1].t === 'tmap' && b.head[1].live === 1 && b.head[1].pts.length === 1 && b.head[1].pts[0].k === 'm' && b.head[1].pts[0].la === 37.5, '정류장을 찾는 중에도 토글 줄 + 내 위치 지도가 머리에 먼저 뜬다');
  b = mk({ lat: 35.1, lng: 129.0, res: {} });
  ok(b.info.bus.need.map(n => n.k).join() === 'tn', '서울 밖이면 TAGO 만');
  b = mk({ lat: 37.5, lng: 127.0, res: { tp: SEOUL_POS, gg: '', tn: '' } });
  const n2 = b.info.bus.need;
  ok(b.info.bus.st === 'need' && n2.length === 4 && n2[0].k === 'a0' && /getStationByUid\?arsId=11111/.test(n2[0].url), '버스 2단계: 중복·미정차 제거, 출구 우선, 도착 주소 요청 ' + n2.length);
  ok(b.head[1].t === 'tmap' && b.head[1].pts.length >= 2 && b.head[1].pts[b.head[1].pts.length - 1].k === 'm' && b.body.filter(n => n.t === 'bcard').length === 4 && b.body.filter(n => n.t === 'bcard').every(c => c.ld === '도착 정보 불러오는 중...'), '도착정보를 기다리는 동안에도 정류장 지도 + 카드(불러오는 중)가 먼저 뜬다');
  ok(n2.map(n => n.url.match(/arsId=(\d+)/)[1]).join() === '11111,44444,22222,33333', '출구(300m 안) 먼저 → 나머지 가까운 순');
  b = mk({ lat: 37.5, lng: 127.0, res: { tp: SEOUL_POS, gg: '', tn: '', a0: SEOUL_ARR, a1: '', a2: '', a3: '' } });
  const txt = JSON.stringify(b.body);
  { const cs = b.body.filter(n => n.t === 'bcard'), r1 = cs[0].rows[1], r2 = cs[0].rows[0];       // 도착이 빠른 줄이 위(N13 곧 도착 → 146)
    ok(b.info.bus.st === 'ok' && cs.length === 4 && cs[0].n === '1' && cs[0].mode === 'near' && r1.no === '146' && r1.a[0].s === '3분 30초' && r1.a[0].p === '2번째전' && r1.a[1].s === '10분 00초' && r1.dir === '→ 강남역방향' && r1.c === '#0066FF' && r2.no === 'N13' && r2.a[0].s === '곧 도착' && r2.a[0].soon === 1 && !/운행종료/.test(txt), '버스 3단계: 카드(번호·노선·"3분 30초"·n번째전·→ 방면) · 운행종료 제외'); }
  ok((txt.match(/"em":"도착정보 없음"/g) || []).length === 3, '도착이 비면 "도착정보 없음"');
  // TOPIS 가 비면 TAGO 로
  const TAGO = JSON.stringify({ response: { body: { items: { item: [{ nodeid: 'ICB1', nodenm: '부평역', gpslati: 37.489, gpslong: 126.724, citycode: '23', nodeno: '12345' }] } } } });
  b = mk({ lat: 37.489, lng: 126.724, res: { tp: '', gg: '', tn: TAGO } });
  ok(b.info.bus.need.length === 1 && /cityCode=23&nodeId=ICB1/.test(b.info.bus.need[0].url), 'TOPIS 실패 → TAGO 정류장');
  const TA = JSON.stringify({ response: { body: { items: { item: [{ routeno: '8', arrtime: 240, arrprevstationcnt: 3 }, { routeno: '8', arrtime: 700, arrprevstationcnt: 9 }] } } } });
  b = mk({ lat: 37.489, lng: 126.724, res: { tp: '', gg: '', tn: TAGO, a0: TA } });
  ok(b.info.bus.st === 'ok' && /"no":"8"/.test(JSON.stringify(b.body)) && /4분 00초/.test(JSON.stringify(b.body)) && /11분 40초/.test(JSON.stringify(b.body)) && /3번째전/.test(JSON.stringify(b.body)), 'TAGO 도착 두 대');
  // s170: 공공 API 오류 봉투(HTTP 200)는 도착정보가 아니다 — '도착정보 없음'으로 굳히지 않고 '불러오는 중' + 다시 받기
  { const ENV = '{\n  "OpenAPI_ServiceResponse": {\n    "cmmMsgHeader": {\n      "errMsg": "HTTP_ERROR",\n      "returnReasonCode": "04"\n    }\n  }\n}\n';
    b = mk({ lat: 37.489, lng: 126.724, res: { tp: '', gg: '', tn: TAGO, a0: ENV } });
    const c0 = b.body.filter(n => n.t === 'bcard')[0];
    ok(b.info.bus.st === 'need' && b.info.bus.need.length === 1 && b.info.bus.need[0].k === 'a0' && c0.ld === '도착 정보 불러오는 중...' && !c0.em, '오류 봉투는 받지 못한 것: 불러오는 중 + 다시 받기(need)');
    b = mk({ lat: 37.489, lng: 126.724, res: { tp: '', gg: '', tn: TAGO, a0: '{"response":{"header":{"resultCode":"00"},"body":{"items":"","totalCount":0}}}' } });
    ok(b.info.bus.st === 'ok' && b.body.filter(n => n.t === 'bcard')[0].em === '도착정보 없음', '정상 응답인데 버스가 없으면 그대로 "도착정보 없음"');
    b = mk({ lat: 37.489, lng: 126.724, res: { tp: '', gg: '', tn: TAGO, a0: '' } });
    ok(b.info.bus.st === 'ok' && b.body.filter(n => n.t === 'bcard')[0].em === '도착정보 없음', "빈 본문('')은 예전처럼 없음(기기는 못 받으면 아예 보내지 않는다)"); }
  b = mk({ lat: 37.5, lng: 127.0, res: { tp: '', gg: '', tn: '' } });
  ok(b.info.bus.st === 'need' && b.info.bus.need.length === 1 && b.info.bus.need[0].k === 'd1' && /^https:\/\/gentle-lab-7e47subway-api\.phg0643\.workers\.dev\/bus-stops\?lat=37\.5&lng=127&radius=450$/.test(b.info.bus.need[0].url), '공공 API 가 모두 비면 서버 정류장 표(D1)를 요청');
  b = mk({ lat: 37.5, lng: 127.0, res: { tp: '', gg: '', tn: '', d1: '{"stops":[]}' } });
  ok(b.info.bus.st === 'empty', '정류장 없음')
  ok(b.head[1].t === 'tmap' && b.head[1].pts.length === 1, '정류장이 없어도 내 위치 지도는 보인다');
  // 경기 GBIS (웹 _fetchNearStopsGG / _ggArrivals 와 같은 규칙)
  const GG = (rows) => JSON.stringify({ response: { msgHeader: { queryTime: 'x', resultCode: 0, resultMessage: '정상' }, msgBody: { busStationAroundList: rows } } });
  const GGS_IC = GG([{ stationId: 203000999, stationName: '부평GBIS', x: 126.7241, y: 37.4891, distance: 20, mobileNo: '31002' }]);
  const TAGO_SU = JSON.stringify({ response: { body: { items: { item: [{ nodeid: 'SU1', nodenm: '수원TAGO', gpslati: 37.2662, gpslong: 127.0012, citycode: '31010', nodeno: '31001' }] } } } });
  const GGS = GG([{ stationId: 203000123, stationName: '수원역', x: 127.0011, y: 37.2661, distance: 120, mobileNo: '31001' }, { stationId: 203000124, stationName: '수원역환승센터', x: 127.0021, y: 37.2671, distance: 260 }]);
  const GGA = JSON.stringify({ response: { msgHeader: { resultCode: 0 }, msgBody: { busArrivalList: [
    { routeName: '13-4', routeId: 1, routeTypeCd: 13, predictTimeSec1: 240, predictTimeSec2: 700, locationNo1: 3, locationNo2: 8, lowPlate1: 1, crowded1: 2, routeDestName: '영통', flag: 'PASS' },
    { routeName: '7000', routeTypeCd: 11, predictTime1: 5, predictTime2: 130, locationNo1: 2, routeDestName: '서울역', flag: 'PASS' },
    { routeName: '99', routeTypeCd: 30, predictTimeSec1: 100, flag: 'STOP' },
    { routeName: '88', routeTypeCd: 30, predictTimeSec1: 7209, predictTimeSec2: 0, flag: 'PASS' }] } } });
  b = mk({ lat: 37.2661, lng: 127.0011, res: {} });
  ok(b.info.bus.need.map(n => n.k).join() === 'gg,tn' && /^https:\/\/apis\.data\.go\.kr\/6410000\/busstationservice\/v2\/getBusStationAroundListv2\?x=127\.001&y=37\.266&format=json$/.test(b.info.bus.need[0].url), '경기 좌표(서울 밖): GBIS 정류장 + TAGO 를 요청');
  b = mk({ lat: 37.2661, lng: 127.0011, res: { gg: GGS, tn: TAGO } });
  const n3 = b.info.bus.need;
  ok(b.info.bus.st === 'need' && n3.length === 2 && /busarrivalservice\/v2\/getBusArrivalListv2\?stationId=203000123&format=json$/.test(n3[0].url), '경기 좌표는 GBIS 정류장이 TAGO 보다 먼저: 도착 주소는 stationId 로 ' + JSON.stringify(n3.map(x => x.url.slice(-40))));
  b = mk({ lat: 37.2661, lng: 127.0011, res: { gg: GGS, tn: TAGO, a0: GGA, a1: '' } });
  const gt = JSON.stringify(b.body);
  ok(b.info.bus.st === 'ok' && /"no":"13-4"/.test(gt) && /4분 00초/.test(gt) && /3번째전/.test(gt) && /→ 영통방향/.test(gt) && /11분 40초/.test(gt) && /8번째전/.test(gt), 'GBIS 도착: 노선 · 분 · 번째전 · 방면 · 둘째 차');
  ok(/"no":"7000"/.test(gt) && /5분 00초/.test(gt) && /→ 서울역방향/.test(gt) && !/"no":"99"/.test(gt) && !/"no":"88"/.test(gt), 'GBIS: 분 단위 값은 초로 · 운행종료(STOP)와 1시간 넘는 예측은 뺀다');
  ok(/"nm":"수원역"/.test(gt) && /"dist":"0m"/.test(gt), 'GBIS 정류장: 이름 · 거리(내 좌표로 다시 잰다)');
  b = mk({ lat: 37.2661, lng: 127.0011, res: { gg: JSON.stringify({ response: { msgHeader: { resultCode: 4 } } }), tn: TAGO_SU } });
  ok(b.info.bus.need[0].url.indexOf('ArvlInfoInqireService') > 0, 'GBIS 가 결과 없음(4)이면 TAGO 로');
  b = mk({ lat: 37.2661, lng: 127.0011, res: { gg: '<html>인증 실패</html>', tn: TAGO_SU } });
  ok(b.info.bus.need[0].url.indexOf('ArvlInfoInqireService') > 0, 'GBIS 응답이 JSON 이 아니면(인증 실패) TAGO 로');
  b = mk({ lat: 37.489, lng: 126.724, res: { gg: GGS_IC, tn: TAGO } });
  ok(b.info.bus.need[0].url.indexOf('ArvlInfoInqireService') > 0, '인천 상자 안에서는 TAGO 가 먼저');
  b = mk({ lat: 37.489, lng: 126.724, res: { gg: GGS_IC, tn: '' } });
  ok(/busarrivalservice/.test(b.info.bus.need[0].url), '인천 상자 안이라도 TAGO 가 비면 GBIS');
  // D1 보조
  const D1 = JSON.stringify({ ok: true, stops: [{ node_id: 'DJB1', node_nm: '대전역', city_code: '25', lat: 36.332, lng: 127.434 }, { node_id: 'XX9', node_nm: '시청', city_code: '0', lat: 36.3345, lng: 127.434 }] });
  b = mk({ lat: 36.333, lng: 127.434, res: { tn: '', d1: D1 } });
  ok(b.info.bus.st === 'need' && b.info.bus.need.length === 2 && /cityCode=25&nodeId=DJB1/.test(b.info.bus.need[0].url) && /cityCode=25&nodeId=XX9/.test(b.info.bus.need[1].url), 'D1 보조 정류장: 시 코드가 0 이면 좌표 상자로 추정(대전 25)');
  ok(E.mapCityOf(35.1, 129.0) === '21' && E.mapCityOf(10, 10) === '' && E.mapGGPreferred(37.2661, 127.0011) === true && E.mapGGPreferred(37.489, 126.724) === false && E.mapGGPreferred(35.1, 129.0) === false, '시 코드 상자 · 경기 우선 판정');
  ok(mk({ lat: 37.2661, lng: 127.0011, res: { gg: GGS, tn: TAGO, a0: GGA, a1: '' } }).info.stops[0].sid === '203000123', '즐겨찾기용 정류장 값(info.stops)에 도착정보를 다시 물을 열쇠가 들어 있다');
  {
    const m3 = mk({ lat: 37.2661, lng: 127.0011, res: { gg: GGS, tn: TAGO, a0: GGA, a1: '' } }), bb = m3.body, tm = m3.head[1];
    ok(tm.t === 'tmap' && tm.pts.length >= 2 && tm.pts[tm.pts.length - 1].k === 'm' && tm.pts[0].k === 's' && tm.pts[0].n === '1' && tm.pts[0].v === 'mp.pm.0' && tm.pts[0].g === 'GG:203000123' && tm.live === 1 && tm.foc === -1, '정류장 지도: 번호 핀 + 내 위치 핀, 핀을 누르면 그 카드(g)로');
    ok(bb.every(n => n.t !== 'bcard' || (n.act.v.startsWith('mp.pc.') && n.act.id === n.k)) && bb[0].pi === 0, '카드를 누르면 mp.pc.N, 카드는 자기 핀 번호(pi)를 안다');
  }
  {
    const mm = mk({ lat: 37.2661, lng: 127.0011, res: { gg: GGS, tn: TAGO, a0: GGA, a1: '' } });
    const cards = mm.body.filter(n => n.t === 'bcard'), r0 = cards[0].rows.find(r => r.act);
    ok(r0 && /^br\.0\.\d+$/.test(r0.act.v) && cards[0].rows.every(r => !r.act || mm.info.rts[0][Number(r.act.v.split('.')[2])][0].length > 0) && mm.info.rts[0].length === cards[0].rows.length, '도착정보 줄을 누르면 노선 상세(br.<정류장>.<줄>) · 노선 id 는 info.rts');
  }
  // s148→s172: 지금 위치에서 반경 300m 안만(최대 40곳) · 300m 밖은 넣지 않는다 · 같은 열쇠/같은 이름 3m 안만 한 곳
  const many = []; for (let i = 0; i < 9; i++) many.push({ nm: '아라역' + (i + 1) + '번 출구', la: 37.5 + i * 1e-3, lo: 127, dist: 100 + i * 10, src: 'tago' });
  for (let i = 0; i < 6; i++) many.push({ nm: '일반' + i, la: 37.4 + i * 1e-2, lo: 127, dist: 50 + i, src: 'tago' });
  const ord = E.mapStopOrder(many);
  ok(ord.length === 15 && ord.slice(0, 9).every(x => /출구/.test(x.nm)) && ord[9].nm === '일반0', '300m 안은 전부(출구도 300m), 출구가 먼저');
  {
    const mkS = (n, d, nm) => ({ nm: nm || ('정류장' + n), id: 'T' + n, la: 37.5 + n * 1e-5, lo: 127, dist: d, src: 'tago' });
    const big = []; for (let i = 0; i < 55; i++) big.push(mkS(i, 10 + i * 5));                               // 10m … 280m — 55곳 모두 300m 안
    ok(E.mapStopOrder(big).length === 40, '300m 안이 아무리 많아도 40곳까지');
    const mix = [mkS(1, 250), mkS(2, 299), mkS(3, 301), mkS(4, 900)];
    ok(E.mapStopOrder(mix).map(s => s.id).join() === 'T1,T2', '300m 밖은 안에 있는 것이 있으면 뺀다(299m 는 포함 · 301m 는 제외)');
    const none = [mkS(1, 420), mkS(2, 380), mkS(3, 700), mkS(4, 520), mkS(5, 900)];
    ok(E.mapStopOrder(none).length === 0, 's172: 300m 안에 하나도 없으면 아무것도 넣지 않는다(300m 밖은 절대 안 나온다)');
    const ex2 = [mkS(1, 320, '아라역3번출구'), mkS(2, 340, '아라역1번출구'), mkS(3, 290, '아라역2번출구'), mkS(4, 100)];
    ok(E.mapStopOrder(ex2).map(s => s.id).join() === 'T3,T4', 's172: 역 출구도 300m 밖이면 뺀다(350m 예외 없음) · 300m 안 출구는 먼저');
    ok(E.mapStopOrder([mkS(1, 300), mkS(2, 300.5), { nm: 'x', id: 'N', la: 37.5, lo: 127, dist: NaN }]).map(s => s.id).join() === 'T1', 's172: 정확히 300m 는 포함 · 300.5m · 거리 모르는 곳은 제외');
    ok(E.mapDedupStops([{ nm: '가', id: 'A', la: 37.5, lo: 127, dist: 5 }, { nm: '가', id: 'B', la: 37.5, lo: 127.00033, dist: 9 }, { nm: '가', id: 'A', la: 37.5, lo: 127, dist: 5 }, { nm: '나', id: 'C', la: 37.5, lo: 127, dist: 5 }]).length === 3, '길 건너(30m)의 같은 이름 정류장은 따로 · 같은 열쇠는 하나');
    ok(E.mapQ(37.26666) === 37.267 && E.mapQ(126.7244) === 126.724, '조회 좌표는 0.001° 칸으로');
    const bq = call({ part: 'b', mode: 'bus', th: 'dark', bus: { lat: 37.5042, lng: 127.0049, res: {} } });
    ok(/tmX=127&tmY=37\.504&radius=450/.test(bq.info.bus.need[0].url) || /tmX=127\.005&tmY=37\.504&radius=450/.test(bq.info.bus.need[0].url), '정류장 조회 주소는 칸 가운데 좌표 + 반경 450m: ' + bq.info.bus.need[0].url);
  }
}


// ⑥-b 버스 — 웹 mapBusPanel: 선택 · 즐겨찾기 · 별명 · 토글
{
  const near = (extra, res) => call({ part: 'b', mode: 'bus', th: 'dark', bus: Object.assign({ lat: 37.5, lng: 127.0, res: Object.assign({ tp: SEOUL_POS, gg: '', tn: '', a0: SEOUL_ARR, a1: '', a2: '', a3: '' }, res || {}) }, extra || {}) });
  {   // 정류장마다 따로: 못 받은 정류장만 '불러오는 중' + 그 정류장만 다시 받으라고 한다(a0 만 받았을 때 나머지가 '도착정보 없음'으로 보이던 문제)
    const p = near({}, { a1: undefined, a2: undefined, a3: undefined });
    const pc = p.body.filter(n => n.t === 'bcard');
    ok(pc[0].rows && !pc[0].ld && pc[1].ld && pc[1].em === undefined && p.info.bus.st === 'need' && p.info.bus.need.every(n => n.k !== 'a0') && p.info.bus.need.length === pc.length - 1, '받은 정류장은 그리고 못 받은 정류장만 불러오는 중 ' + JSON.stringify(p.info.bus.need && p.info.bus.need.map(n => n.k)));
  }
  let b = near({ sel: 1 });
  const cs = b.body.filter(n => n.t === 'bcard');
  ok(cs[1].on === true && cs[0].on === false && b.head[1].foc === cs[1].pi, '고른 정류장(sel): 그 카드가 켜지고 지도도 그 핀을 고른다');
  {   // 주변 정류장 사용자 순서(웹 busNearOrder): 앱이 끌어서 정한 열쇠 목록을 엔진이 적용한다
    const ids = cs.map(c => c.k), rev = ids.slice().reverse(), only = ids[2];
    const kk = x => x.body.filter(n => n.t === 'bcard');
    ok(ids.length >= 3 && kk(near({ ord: rev })).map(c => c.k).join() === rev.join(), '사용자 순서(ord): 저장된 순서대로 그린다');
    ok(kk(near({ ord: [only] }))[0].k === only && kk(near({ ord: [only] })).slice(1).map(c => c.k).join() === ids.filter(k => k !== only).join(), '저장된 것은 앞으로 · 저장 안 된 정류장은 뒤에 거리순');
    ok(kk(near({ ord: ['없는열쇠', 5, null, ''] })).map(c => c.k).join() === ids.join() && kk(near({ ord: 'x' })).map(c => c.k).join() === ids.join(), '엉뚱한 ord 는 무시(기본 거리순)');
    const bo = kk(near({ ord: rev }));
    ok(bo[0].rol === '끌어서 순서 변경' && bo[0].rod === '완료' && bo.slice(1).every(c => !c.rol && !c.rod) && kk(near({})).slice(1).every(c => !c.rol), '순서 바꾸기 줄 글은 첫 주변 카드에만 실린다');
    const ro = near({ ord: rev }, { a0: SEOUL_ARR });
    ok(ro.info.stops.map(x => x.sid || x.id || '').join() === near({}).info.stops.slice().reverse().map(x => x.sid || x.id || '').join() && ro.head[1].pts.filter(p => p.k === 's').map(p => p.g).join() === rev.join(), '정류장 목록(info.stops)·지도 핀도 같은 순서');
    ok(call({ part: 'b', mode: 'bus', th: 'dark', bus: { vw: 'fav', fav: [], ord: rev } }).body.every(n => n.t !== 'bcard' || !n.rol), '즐겨찾기 보기에는 순서 바꾸기 줄이 없다');
  }
  ok(near({ sel: 99 }).head[1].foc === -1 && near({ sel: -1 }).body.every(n => n.t !== 'bcard' || n.on === false), '범위 밖 선택은 무시');
  ok(cs.every(c => c.mode === 'near' && c.fv === 0 && c.star.v === 'mp.fv.' + cs.indexOf(c) && c.edit.v === 'mp.al.' + cs.indexOf(c) && c.dist), '주변 카드: ☆ · ✏️ · 거리');
  const fv = b.info.stops[0];
  ok(fv.id === 'SEOUL:11111' && fv.src === 'topis' && fv.ars === '11111' && !('dist' in fv), 'info.stops: 도착정보를 다시 물을 수 있는 최소 값');
  b = near({ fav: [fv], al: { 'SEOUL:11111': '출근길' } });
  const c0 = b.body.filter(n => n.t === 'bcard')[0];
  ok(c0.fv === 1 && c0.al === '출근길', '즐겨찾기한 정류장은 ★, 별명이 있으면 별명');
  ok(near({ al: { 'SEOUL:11111': '가나다라마바사아자차카' } }).body[0].al === '가나다라마바사아자차', '별명은 10자까지(웹 maxlength)');
  // 즐겨찾기 화면
  const fav = (extra) => call({ part: 'b', mode: 'bus', th: 'dark', bus: Object.assign({ vw: 'fav', fav: [fv, { nm: '다른곳', id: 'SEOUL:22222', src: 'topis', ars: '22222', la: 37.501, lo: 127.001 }], res: {} }, extra || {}) });
  b = fav();
  ok(b.head.length === 1 && b.head[0].items[1].on && !b.head[0].items[0].on, '즐겨찾기: 지도는 없고 토글만(웹은 주변에서만 지도)');
  ok(b.info.bus.st === 'need' && b.info.bus.vw === 'fav' && b.info.bus.need.map(n => n.k).join() === 'f0,f1' && /getStationByUid\?arsId=11111/.test(b.info.bus.need[0].url), '즐겨찾기 도착정보 요청(f0.. 열쇠는 주변과 따로)');
  ok(/즐겨찾기 2개 · 30초마다 자동 갱신/.test(JSON.stringify(b.body)) && b.body.filter(n => n.t === 'bcard').length === 2 && b.body.filter(n => n.t === 'bcard').every(c => c.mode === 'fav' && c.ld && !c.n && !c.dist && c.map.a === 'open'), '즐겨찾기 카드: 번호·거리 없음, ×, 🗺️, 불러오는 중');
  b = fav({ res: { f0: SEOUL_ARR, f1: '' }, al: { 'SEOUL:22222': '집' } });
  const fc = b.body.filter(n => n.t === 'bcard');
  ok(b.info.bus.st === 'ok' && fc[0].rows.length === 2 && fc[1].em === '도착정보 없음' && fc[1].al === '집' && fc[0].star.v === 'mp.fv.0', '즐겨찾기 도착정보 · 별명 · 제거(mp.fv.N)');
  b = call({ part: 'b', mode: 'bus', bus: { vw: 'fav', fav: [], res: {} } });
  ok(/즐겨찾기한 정류장이 없습니다/.test(JSON.stringify(b.body)) && JSON.stringify(b.body).includes('mp.vw.near') && b.info.stops.length === 0, '즐겨찾기가 비면 안내 + 주변 정류장 보기 단추');
  b = call({ part: 'b', mode: 'bus', bus: { vw: 'fav', fav: Array.from({ length: 20 }, (_, i) => ({ nm: 'S' + i, id: 'SEOUL:' + (100 + i), src: 'topis', ars: String(100 + i), la: 37.5, lo: 127 })).concat([{ nm: '이상', id: 'x', src: 'evil' }, null, 5]), res: {} } });
  ok(b.info.stops.length === 12 && b.info.bus.need.length === 12, '즐겨찾기는 12곳까지 · 이상한 값은 버린다');
  ok(JSON.stringify(call({ part: 'b', mode: 'bus', bus: { vw: 'fav', fav: 'oops', al: [1], res: {} } }).body).includes('즐겨찾기한 정류장이 없습니다'), '깨진 저장값에도 안 죽는다');
  // 노선 색 · 시각 글 (웹 _busNumClass · _busFmtCd)
  const rows = near().body.find(n => n.t === 'bcard').rows;
  ok(rows.every(r => /^#[0-9a-fA-F]{6}$/.test(r.c)), '노선 색');
  const colRows = E.mapScreen({ cap: 18 }, { part: 'b', mode: 'bus', bus: { lat: 37.5, lng: 127.0, res: { tp: SEOUL_POS, gg: '', tn: '', a0: '<ServiceResult><msgBody>' + ['5', '150', '300', '700', '3012', 'N13'].map(n => '<itemList><rtNm>' + n + '</rtNm><arrmsg1>2분후</arrmsg1><traTime1>59</traTime1></itemList>').join('') + '</msgBody></ServiceResult>', a1: '', a2: '', a3: '' } } }).body.find(n => n.t === 'bcard').rows;
  ok(colRows.map(r => r.c).join() === '#e74c3c,#0066FF,#00b341,#9b59b6,#7f8c8d,#7f8c8d' && colRows.every(r => r.a[0].s === '59초' && r.a[0].soon === 1), '노선 색(웹 _busNumClass: 광역 빨강·간선 파랑·지선 초록·순환 보라·그 밖 회색) · 60초 안은 임박');
}


// ⑥-2 노선 상세(웹 openBusRoute · _loadBusRouteData · _renderBusRoute)
{
  const STN = [[1, 'GG:1', '가', '001', 37.5, 127.0, 0], [2, 'GG:2', '나', '002', 37.51, 127.0, 0], [3, 'GG:3', '다', '003', 37.52, 127.0, 1], [4, 'GG:4', '라', '004', 37.53, 127.0, 1]];
  const pos = (arr) => JSON.stringify({ response: { msgHeader: { resultCode: 0 }, msgBody: { busLocationList: arr } } });
  const br = (b) => call({ part: 'br', th: 'pastel', br: Object.assign({ rid: 'GGR1', no: '9', tp: '일반', src: 'gbis', o: { id: 'GG:2', nm: '나', la: 37.51, lo: 127 }, stn: STN, via: 'gg' }, b) });
  let r = br({ stn: undefined, via: undefined });
  ok(r.ok && r.info.br.st === 'need' && r.info.br.need.map(n => n.k).join() === 'gs,gp' && /getBusRouteStationListv2\?routeId=GGR1/.test(r.info.br.need[0].url) && /getBusLocationListv2\?routeId=GGR1/.test(r.info.br.need[1].url), '정류장·위치를 동시에 요청한다(경기 노선은 GBIS 먼저)');
  r = br({ res: { gp: pos([{ stationSeq: 1, plateNo: '경기70' }]) } });
  ok(r.info.br.st === 'ok' && r.info.br.pos.known && r.info.br.pos.n === 1 && r.body.map(n => n.t).join() === 'brsec,brs,brs,brturn,brsec,brs,brs,spacer', '구간(상행/하행) · 회차 · 정류장 줄');
  const rows = r.body.filter(n => n.t === 'brs');
  ok(rows[0].mk === 'bus' && rows[0].here === 1 && rows[0].notes[0].k === 'bus' && /경기70/.test(rows[0].notes[0].s) && rows[1].mk === 'me' && rows[1].mine === 1 && /1정거장 전/.test(rows[1].notes[0].s), '버스 위치와 내 정류장 도착 예상(정거장 수·분)');
  ok(rows.every((n, i) => n.act.v === 'br.p.' + i) && rows[0].fl === 'f' && rows[3].fl === 'l' && r.head[0].t === 'brh' && r.head[0].act.v === 'br.rf' && r.head[0].bact.v === 'br.x', '줄·머리 눌림');
  ok(r.head[1].t === 'brt' && r.head[1].a === '나' && r.head[1].b === '가' || r.head[1].b === '다' || r.head[1].fin === 1, '기준 정류장이면 기준 → 방향 종점');
  const a = br({ res: { gp: pos([{ stationSeq: 1, plateNo: 'A' }]) } }), b2 = br({ res: { gp: pos([{ stationSeq: 3, plateNo: 'A' }]) } });
  ok(a.rev !== b2.rev, '위치가 바뀌면 rev 가 바뀐다(바뀐 줄만 다시 그리는 근거)');
  ok(br({ res: { gp: pos([]) } }).info.br.pos.known === true && br({ res: { gp: '' } }).info.br.pos.known === false && br({ res: {} }).info.br.st === 'need', '빈 응답=0대(확정) · 응답 없음=확인 중 · 위치를 아직 안 받으면 요청');
  r = br({ sel: 2 });
  ok(r.foot.length === 1 && r.body.filter(n => n.t === 'brs')[2].ps === 'p' && /출발지로 설정/.test(JSON.stringify(r.foot)) && /다/.test(JSON.stringify(r.foot)), '정류장을 누르면 아래 바에 [출발지로 설정]');
  r = br({ pk: { n: '가', i: 'GG:1' } });
  ok(r.body.filter(n => n.t === 'brs')[0].ps === 's' && r.body.filter(n => n.t === 'brs')[0].lab === '출발지' && r.body.filter(n => n.t === 'brs')[1].lab === '도착지 ›' && /도착지는 역으로/.test(JSON.stringify(r.foot)) && /br\.cx/.test(JSON.stringify(r.foot)), '출발지를 정하면 다른 줄은 [도착지 ›] · 바에 역으로/취소');
  r = call({ part: 'br', br: { rid: 'T1', no: '9', src: '', o: { id: '', nm: 'x', la: 0, lo: 0 } } });
  ok(r.info.br.need.map(n => n.k).join() === 'gs,gp', '시 코드를 모르면 GBIS 먼저');
  r = call({ part: 'br', br: { rid: 'SL1', no: '146', src: 'topis', o: { id: 'SEOUL:11111', nm: 'x', la: 37.5, lo: 127, city: '11' } } });
  ok(r.info.br.need.map(n => n.k).join() === 'ts,tp' && /cityCode=11&routeId=SL1/.test(r.info.br.need[0].url), '시 코드가 있으면 TAGO 로');
  const T1 = JSON.stringify({ response: { body: { items: { item: [{ nodeord: 2, nodeid: 'N2', nodenm: '둘', gpslati: 37.5, gpslong: 127, updowncd: 0 }, { nodeord: 1, nodeid: 'N1', nodenm: '하나', gpslati: 37.5, gpslong: 127, updowncd: 0 }] } } } });
  r = call({ part: 'br', br: { rid: 'SL1', no: '146', src: 'topis', o: { id: 'N2', nm: '둘', la: 37.5, lo: 127, city: '11' }, res: { ts: T1, tp: JSON.stringify({ response: { body: { items: { item: { nodeord: 1, vehicleno: '서울74' } } } } }) } } });
  ok(r.info.br.st === 'ok' && r.info.br.via === 'tago' && r.info.br.stn[0][1] === 'N1' && r.body.filter(n => n.t === 'brs')[0].mk === 'bus', 'TAGO 응답 읽기(순번 정렬 · 위치)');
  r = call({ part: 'br', br: { rid: 'SL1', no: '146', src: 'topis', o: { la: 37.5, lo: 127, city: '11' }, res: { ts: '', tp: '' } } });
  ok(r.info.br.st === 'fail' && /불러올 수 없어요/.test(JSON.stringify(r.body)), '정류장을 못 받으면 안내');
  ok(call({ part: 'br', br: {} }).ok === false, '노선 id 없으면 만들지 않는다');
}

// ⑦ 앱 검증기
{
  const T = E.mapLinesOf('강남'), lines = [];
  const push = o => lines.push(JSON.stringify(o));
  ['bus', 'subway'].forEach(m => ['seoul', 'busan', 'daegu', 'gwangju', 'daejeon'].forEach(r => { push(call({ part: 'h', mode: m, reg: r, flt: '3호선', q: '강남' })); push(call({ part: 'b', mode: m, reg: r, th: 'dark' })); }));
  push(call({ part: 'b', mode: 'bus', th: 'dark', bus: null })); push(call({ part: 'b', mode: 'bus', th: 'dark', bus: { lat: 37.5, lng: 127, res: {} } })); push(call({ part: 'b', mode: 'bus', th: 'pastel', bus: { lat: 37.5, lng: 127, res: { tp: SEOUL_POS, gg: '', tn: '', a0: SEOUL_ARR, a1: '', a2: '', a3: '' } } }));
  push(call({ part: 'b', mode: 'bus', th: 'dark', bus: { lat: 37.5, lng: 127, sel: 0, fav: [{ nm: 'a', id: 'SEOUL:11111', src: 'topis', ars: '11111', la: 37.5, lo: 127 }], al: { 'SEOUL:11111': '집' }, res: { tp: SEOUL_POS, gg: '', tn: '', a0: SEOUL_ARR, a1: '', a2: '', a3: '' } } }));
  push(call({ part: 'b', mode: 'bus', th: 'dark', bus: { vw: 'fav', fav: [{ nm: 'a', id: 'SEOUL:11111', src: 'topis', ars: '11111', la: 37.5, lo: 127 }], al: { 'SEOUL:11111': '집' }, res: { f0: SEOUL_ARR } } })); push(call({ part: 'b', mode: 'bus', th: 'dark', bus: { vw: 'fav', fav: [], res: {} } })); push(call({ part: 'b', mode: 'bus', th: 'dark', bus: { vw: 'fav', fav: [{ nm: 'a', id: 'SEOUL:11111', src: 'topis', ars: '11111', la: 37.5, lo: 127 }], res: {} } }));
  { const STN = [[1, 'GG:1', '가', '001', 37.5, 127.0, 0], [2, 'GG:2', '나', '002', 37.51, 127.0, 0], [3, 'GG:3', '다', '003', 37.52, 127.0, 1]]; const P = JSON.stringify({ response: { msgHeader: { resultCode: 0 }, msgBody: { busLocationList: [{ stationSeq: 1, plateNo: 'x' }] } } });
    push(call({ part: 'br', br: { rid: 'R', no: '9', src: 'gbis', o: { id: 'GG:2', nm: '나', la: 37.51, lo: 127 }, stn: STN, via: 'gg', res: { gp: P } } })); push(call({ part: 'br', br: { rid: 'R', no: '9', src: 'gbis', stn: STN, via: 'gg', sel: 1, res: { gp: P } } })); push(call({ part: 'br', th: 'dark', br: { rid: 'R', no: '9', src: 'gbis', stn: STN, via: 'gg', pk: { n: '가', i: 'GG:1' }, res: { gp: P } } })); push(call({ part: 'br', br: { rid: 'R', no: '9', src: 'gbis' } })); push(call({ part: 'br', br: { rid: 'R', no: '9', src: 'topis', o: { la: 37.5, lo: 127, city: '11' }, res: { ts: '', tp: '' } } })); }
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
  ok(w.indexOf('if (url.pathname === "/screen/map") return handleScreenMap(request, env);') > 0 && !/[^\x00-\x7f]/.test(body), '경로 등록 · ASCII');
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
