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

// ⑦ 앱 검증기
{
  const T = E.mapLinesOf('강남'), lines = [];
  const push = o => lines.push(JSON.stringify(o));
  ['bus', 'subway'].forEach(m => ['seoul', 'busan', 'daegu', 'gwangju', 'daejeon'].forEach(r => { push(call({ part: 'h', mode: m, reg: r, flt: '3호선', q: '강남' })); push(call({ part: 'b', mode: m, reg: r, th: 'dark' })); }));
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
