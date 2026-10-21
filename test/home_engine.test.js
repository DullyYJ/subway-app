// 홈 탭 경로 입력 엔진(engine/home.js) 시험.  실행: node test/home_engine.test.js   (javac · java 필요)
//  ① cap 7 미만이면 만들지 않는다 ② 입력줄·바꾸기·기준시각 모양 ③ 후보 고르기(종류별 3줄 먼저·모두 7줄·순서·행동 번호) ④ 기준시각 문구
//  ⑤ 앱 검증기 통과 + 앱이 배치한 높이 == info.h ⑥ 워커 내장 사본 ⑦ 워커 끝에서 끝까지 ⑧ 웹 연결부 규약
const fs = require('fs'), path = require('path'), os = require('os');
const E = require('../engine/home'), screenCheck = require('./helpers/screen_check');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('ios-reference/index.html'), 'utf8');
const kids = s => s.body[0].kids;
const U = n => Array.from({ length: n }, (_, i) => ({ n: '강남' + i, l: '2호선' })), B = n => Array.from({ length: n }, (_, i) => ({ n: '정류장' + i, d: 120 + i * 400 })), P = n => Array.from({ length: n }, (_, i) => ({ n: '장소' + i, a: '서울 주소' + i }));

// ── ① cap ──
{
  ok(E.homeScreen({ cap: 6 }, {}).ok === false && E.homeScreen({}, {}).ok === false && E.homeScreen(null, null).ok === false, 'cap 7 미만이면 만들지 않는다');
}
// ── ② 기본 모양 ──
{
  const s = E.homeScreen({ cap: 7 }, { start: '', dest: '' }, {});
  ok(s.ok && s.v === 1 && s.screen === 'home' && s.head.length === 0 && s.body.length === 1 && s.body[0].t === 'panel' && /^h1:/.test(s.rev), '기본 모양');
  const k = kids(s);
  ok(k.map(x => x.t).join() === 'inbar,swap,divider,inbar,divider,trow', '줄 순서: 출발 · 바꾸기 · 선 · 도착 · 선 · 기준시각 ' + k.map(x => x.t));
  ok(k[0].key === 'start' && k[0].hint === '출발지 검색' && k[0].dot === '#0a84ff' && k[0].btn === '위치 감지' && k[0].act.v === 'rt.gps' && k[0].watch === true, '출발 줄');
  ok(k[3].key === 'dest' && k[3].hint === '도착지 검색' && k[3].dot === '#ff3b30' && k[3].btn === '경로 탐색' && k[3].act.v === 'rt.go' && k[3].watch === true, '도착 줄');
  { const g = kids(E.homeScreen({ cap: 7 }, { gps: true }))[0]; ok(g.btn === '감지 중' && g.dim === true && k[0].dim === false, '위치 감지 중이면 단추 글 [감지 중] · 흐림'); }
  ok(k[1].act.v === 'rt.swap' && k[1].icon === E.HOME_SWAP_ICON, '바꾸기 단추');
  ok(k[3].dim === true && s.info.ready === false, '입력이 비면 경로 탐색 단추는 흐림');
  ok(k[5].lb.indexOf('기준시각') > 0 && k[5].s === '현재' && k[5].cur === true && k[5].hint.indexOf('클릭해서') === 1 && k[5].day === '평일' && k[5].dc === '#30d158' && k[5].act.v === 'bt.pick' && k[5].btn === '현재' && k[5].bact.v === 'bt.now' && k[5].h === 34, '기준시각 줄(현재)');
  ok(s.body[0].pad.join() === '14,14,14,18' && s.body[0].r === 16 && k[0].h === 57 && k[0].bh === 33 && k[0].bpx === 16 && k[0].ifill === 'card2' && k[0].pad.join() === '0,0,14,0' && k[2].c === 'border2', '웹 홈 경로 카드 치수(카드 14 여백 · 입력줄 57 · 단추 33 · 입력 띠)');
  ok(E.homeScreen({ cap: 7 }, { start: '강남', dest: '용두' }).body[0].kids[3].dim === false, '출발·도착 글자가 있으면 경로 탐색 활성');
  ok(E.homeScreen({ cap: 7 }, { startSet: true, destSet: true }).info.ready === true, '고른 출발·도착이 있으면 활성');
  ok(E.homeScreen({ cap: 7 }, { start: '강남', dest: '용두' }).rev !== E.homeScreen({ cap: 7 }, { start: '강', dest: '용두' }).rev, '글자가 다르면 rev 가 다르다');
}
// ── ③ 후보 ──
{
  const f = a => ({ start: '강', dest: '', active: a });
  let s = E.homeScreen({ cap: 7 }, f('start'), { u: U(8), b: B(5), p: P(5) });
  let k = kids(s);
  let sg = k.filter(x => x.t === 'sug' && x.act.v.startsWith('sg.'));
  ok(k.map(x => x.t).join() === 'inbar,swap,divider,sug,sug,sug,sug,sug,sug,sug,inbar,divider,trow', '출발 후보는 출발 줄 아래(바꾸기 다음)에 ' + k.map(x => x.t));
  ok(sg.length === 7 && s.info.rows === 7, '후보는 모두 7줄까지');
  { const q = E.homeScreen({ cap: 7 }, f('start'), { u: U(8), b: [], p: [] }); ok(kids(q).filter(x => x.t === 'sug' && x.act.v.startsWith('sg.')).length === 7, '지하철만 있으면 7줄 모두 지하철'); }
  ok(sg.map(x => x.act.v).join() === 'sg.u.0,sg.u.1,sg.u.2,sg.b.0,sg.b.1,sg.b.2,sg.p.0', '종류마다 3줄씩 먼저(지하철 → 버스 → 장소 순, 7줄까지) ' + sg.map(x => x.act.v));
  ok(sg[sg.length - 1].last === true && sg.slice(0, -1).every(x => !x.last), '마지막 후보 줄만 last');
  ok(sg[0].badge === '지하철' && sg[0].bc === '#0a84ff' && sg[0].name === '강남0' && sg[0].sub === '2호선', '지하철 줄');
  const bus = sg.find(x => x.act.v === 'sg.b.1'); ok(bus.badge === '버스' && bus.bc === '#00b341' && bus.sub === '520m', '버스 줄(거리 m)');
  ok(E.homeDist(1500) === '1.5km' && E.homeDist(999) === '999m' && E.homeDist(0) === '' && E.homeDist('x') === '', '거리 글');
  const pl = sg.find(x => x.act.v === 'sg.p.0'); ok(pl.badge === '장소' && pl.bc === '#5e5ce6' && pl.sub === '서울 주소0', '장소 줄');
  s = E.homeScreen({ cap: 7 }, { start: '', dest: '용', active: 'dest' }, { u: U(2), b: [], p: P(1) });
  k = kids(s);
  ok(k.map(x => x.t).join() === 'inbar,swap,divider,inbar,sug,sug,sug,divider,trow', '도착 후보는 도착 줄 아래에 ' + k.map(x => x.t));
  ok(E.homeScreen({ cap: 7 }, { start: '', dest: '', active: 'dest' }, { u: U(3) }).body[0].kids.every(x => !(x.act && x.act.v.startsWith('sg.'))), '글자가 비면 후보를 안 보인다');
  ok(E.homeScreen({ cap: 7 }, { start: '강', active: '' }, { u: U(3) }).body[0].kids.every(x => !(x.act && x.act.v.startsWith('sg.'))), '칸이 눌려 있지 않으면 후보를 안 보인다');
  s = E.homeScreen({ cap: 7 }, f('start'), { u: [{ n: '' }, null, 5, { n: '역', l: 'x'.repeat(200) }], b: 'x', p: undefined });
  sg = kids(s).filter(x => x.t === 'sug' && x.act.v.startsWith('sg.'));
  ok(sg.length === 1 && sg[0].sub.length === 60 && sg[0].act.v === 'sg.u.3', '이상한 후보는 건너뛴다(번호는 원래 배열 순번)');
  s = E.homeScreen({ cap: 7 }, f('start'), { u: U(2) });
  ok(s.info.h === 14 + 2 + 57 + 1 + 57 + 1 + 34 + 2 * 44 + 18, 'info.h 계산');
}
// ── ④ 기준시각 문구 ──
{
  const tzo = -540, today = [2026, 9, 19];                                  // 2026-10-19(월) 한국 기준
  const ms = (y, mo, d, h, mi) => Date.UTC(y, mo, d, h, mi) + tzo * 60000;
  const L = (m, t) => E.homeBaseLabel({ ms: m, tzo, today: t === undefined ? today : t });
  ok(L(null) === '현재', '현재');
  ok(L(ms(2026, 9, 19, 14, 30)) === '오늘 오후 2:30', '오늘 오후 2:30 → ' + L(ms(2026, 9, 19, 14, 30)));
  ok(L(ms(2026, 9, 20, 9, 5)) === '내일 오전 9:05', '내일 오전 9:05');
  ok(L(ms(2026, 9, 25, 13, 0)) === '10/25(일) 오후 1:00', '날짜 글 → ' + L(ms(2026, 9, 25, 13, 0)));
  ok(L(ms(2026, 9, 19, 0, 10)) === '오늘 오전 12:10' && L(ms(2026, 9, 19, 12, 0)) === '오늘 오후 12:00', '12시 처리');
  ok(L(ms(2026, 9, 19, 14, 30), null).indexOf('10/19(') === 0, '오늘 날짜를 모르면 날짜 글');
  const s = E.homeScreen({ cap: 7 }, { base: { ms: ms(2026, 9, 19, 14, 30), tzo, today, hol: true } });
  const t = kids(s)[5]; ok(t.s === '오늘 오후 2:30' && t.cur === false && t.hint === '' && t.day === '주말·공휴일' && t.dc === '#ff9500' && t.btn === '현재' && t.bact.v === 'bt.now', '기준시각을 골랐으면 단추 [현재]가 생긴다');
}
// ── ⑤ 앱 검증기 + 높이 ──
{
  const cases = [
    [{}, {}], [{ start: '강', active: 'start' }, { u: U(8), b: B(5), p: P(5) }], [{ dest: '용두', active: 'dest' }, { u: U(1), b: B(1), p: [] }],
    [{ start: 'a', dest: 'b', startSet: true, destSet: true, base: { ms: Date.UTC(2026, 9, 19, 5, 0), tzo: -540, today: [2026, 9, 19], hol: false } }, {}]
  ].map(([f, d]) => E.homeScreen({ cap: 7 }, f, d));
  const r = screenCheck(cases);
  ok(!r.err && r.out.length === cases.length && r.out.every(l => l.startsWith('OK ')), '모든 화면이 앱 검증기를 통과 ' + (r.err || r.out.filter(l => !l.startsWith('OK ')).join('|')));
  ok(r.out.every(l => Number(l.split(' ')[2]) === 0), '건너뛴 노드 없음');
  ok(r.out.every((l, i) => Math.abs(Number(l.split(' ')[3]) - cases[i].info.h) < 0.02), '앱이 배치한 본문 높이 == info.h ' + r.out.map((l, i) => l.split(' ')[3] + '/' + cases[i].info.h));
}
// ── ⑨ 지하철 후보를 엔진이 직접 거른다 (2026-10-19) ──
{
  const ST = require('../engine/home-stations').HOME_STNS;
  ok(Array.isArray(ST) && ST.length > 900 && ST.every(r => Array.isArray(r) && r.length === 4 && typeof r[0] === 'string' && typeof r[1] === 'string' && isFinite(r[2]) && isFinite(r[3])), '역 표 모양');
  const sg = s => kids(s).filter(x => x.t === 'sug' && x.act.v.startsWith('sg.'));
  // 예전 웹 방식과 같은 결과: 걸러내기(이름에 글자 포함) → 같은 이름은 하나로(호선을 ' · ' 로) → 8개까지
  const ref = q => { const m = ST.filter(r => r[0].indexOf(q) >= 0), seen = new Set(), reps = m.filter(r => !seen.has(r[0]) && seen.add(r[0])); return reps.slice(0, 8).map(r => ({ n: r[0], l: m.filter(x => x[0] === r[0]).map(x => x[1]).filter((v, i, a) => a.indexOf(v) === i).join(' \u00b7 '), r })); };
  for (const q of ['강남', '서울', '역', '신', '수원', '용두', '없는역이름']) {
    const f = E.homeStnFind(q), want = ref(q);
    ok(f.u.length === want.length && f.u.every((x, i) => x.n === want[i].n && x.l === want[i].l) && f.pk.every((x, i) => x.name === want[i].r[0] && x.line === want[i].r[1] && x.lat === want[i].r[2] && x.lng === want[i].r[3]), '예전 웹 걸러내기와 같다: ' + q + ' ' + f.u.length + '개');
  }
  ok(E.homeStnFind('').u.length === 0 && E.homeStnFind('   ').u.length === 0 && E.homeStnFind(null).u.length === 0 && E.homeStnFind(5).u.length === 0, '빈 글자·이상한 값은 후보 없음');
  ok(E.homeStnFind('  강남  ').u.length === E.homeStnFind('강남').u.length, '앞뒤 공백은 무시');
  ok(E.homeStnFind('역').u.length === 8, '8개까지');
  // 화면: data.u 가 없으면 엔진이 거른다 + info.pk + info.sx
  let s = E.homeScreen({ cap: 7 }, { start: '강남', active: 'start' }, { b: B(1), p: [] });
  ok(s.info.sx === 1 && s.info.pk && s.info.pk.u.length === E.homeStnFind('강남').u.length, 'info.sx · info.pk.u');
  ok(sg(s)[0].badge === '지하철' && sg(s)[0].act.v === 'sg.u.0' && sg(s)[0].name === E.homeStnFind('강남').u[0].n && sg(s)[0].sub === E.homeStnFind('강남').u[0].l, '엔진이 거른 지하철 줄');
  ok(sg(s).some(x => x.act.v === 'sg.b.0'), '버스 줄은 웹이 보낸 그대로');
  s = E.homeScreen({ cap: 7 }, { start: '', dest: '용두', active: 'dest' }, {});
  ok(sg(s).length > 0 && s.info.pk.u[0].name.indexOf('용두') >= 0, '도착 칸이 눌려 있으면 도착 글자로 거른다');
  // 호환: 웹이 u 배열을 보내면(폴백) 그 후보를 그대로 쓰고 pk 는 없다
  s = E.homeScreen({ cap: 7 }, { start: '강남', active: 'start' }, { u: U(2) });
  ok(sg(s).length === 2 && sg(s)[0].name === '강남0' && s.info.pk === undefined && s.info.sx === 1, '웹이 u 를 보내면 예전 그대로(폴백)');
  s = E.homeScreen({ cap: 7 }, { start: '강남', active: 'start' }, { u: [] });
  ok(sg(s).length === 0 && s.info.pk === undefined, '웹이 빈 u 를 보내도 그대로(엔진이 덮지 않는다)');
  s = E.homeScreen({ cap: 7 }, { start: '', active: 'start' }, {});
  ok(sg(s).length === 0 && s.info.pk === undefined, '글자가 비면 거르지 않는다');
  s = E.homeScreen({ cap: 7 }, { start: '강남', active: '' }, {});
  ok(sg(s).length === 0 && s.info.pk === undefined, '칸이 눌려 있지 않으면 거르지 않는다');
  const r2 = screenCheck([E.homeScreen({ cap: 7 }, { start: '강남', active: 'start' }, { b: B(3), p: P(3) })]);
  ok(!r2.err && r2.out.every(l => l.startsWith('OK ')), '엔진이 거른 화면도 앱 검증기를 통과 ' + (r2.err || r2.out.join('|')));
}
// ── ⑥ 워커 내장 ──
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  const ms = '// ===== HOME ENGINE BEGIN =====', me = '// ===== HOME ENGINE END =====', i = w.indexOf(ms), j = w.indexOf(me);
  ok(i > 0 && j > i, '워커에 홈 엔진이 내장돼 있다');
  const esc = t => t.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  let src = fs.readFileSync(R('engine/home.js'), 'utf8'); src = src.slice(0, src.indexOf('if (typeof module')).trimEnd();
  const body = w.slice(i + ms.length, j);
  ok(body.indexOf(esc(src)) >= 0 && body.indexOf(esc(fs.readFileSync(R('engine/home-worker.js'), 'utf8').trimEnd())) >= 0, '워커 내장 사본이 소스와 같다');
  ok(w.indexOf('if (url.pathname === "/screen/home") return handleScreenHome(request);') > 0, '경로 등록');
  ok(!/[^\x00-\x7f]/.test(body), '내장 블록은 ASCII 만');
  { let st = fs.readFileSync(R('engine/home-stations.js'), 'utf8'); st = st.slice(0, st.indexOf('if (typeof module')).trimEnd().replace(/^'use strict';\n/m, ''); ok(body.indexOf(esc(st)) >= 0, '워커에 지하철역 표가 내장돼 있다(소스와 같다)'); }
  const other = w.slice(0, i) + w.slice(j);
  ok(['homeScreen', 'homeStnFind', 'HOME_STNS', 'HOME_SX', 'HOME_STN_MAX', 'homeFacts', 'homeHash', 'homeStr', 'homeBaseLabel', 'homePick', 'homeDist', 'HOME_SWAP_ICON', 'HOME_SCREEN_V', 'HOME_ROW_H', 'handleScreenHome'].every(n => !new RegExp('^(async\\s+)?(function|var)\\s+' + n + '\\b', 'm').test(other)), '다른 엔진과 이름이 겹치지 않는다');
}
// ── ⑦ 워커 끝에서 끝까지 ──
(async () => {
  const tmp = path.join(os.tmpdir(), 'rv2_home_' + process.pid + '.mjs');
  fs.copyFileSync(R('engine/route-v2-worker.ascii.js'), tmp);
  try {
    const w = (await import(tmp)).default, call = (u, init) => w.fetch(new Request(u, init), {}, { waitUntil() { } });
    const post = b => call('https://x/screen/home', { method: 'POST', body: b, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    const r = await post(JSON.stringify({ cap: 7, f: { start: '강', active: 'start' }, d: { u: [{ n: '강남', l: '2호선' }] } })), j = await r.json();
    ok(r.status === 200 && j.ok && j.screen === 'home' && j.body[0].kids.some(x => x.t === 'sug' && x.act.v === 'sg.u.0') && /route-v2-2026-10-\d\ds\d\d/.test(j.ver), '워커 응답 200 ' + j.ver);
    ok((await (await post(JSON.stringify({ cap: 6, f: {} }))).json()).ok === false, '워커: cap 부족이면 거절');
    { const j2 = await (await post(JSON.stringify({ cap: 7, f: { start: '강남', active: 'start' }, d: { b: [], p: [] } }))).json(), want = E.homeStnFind('강남');
      ok(j2.ok && j2.info.sx === 1 && j2.info.pk.u.length === want.u.length && j2.info.pk.u[0].name === want.pk[0].name && j2.body[0].kids.filter(x => x.t === 'sug').length >= want.u.length, '워커: u 를 안 보내면 엔진이 역을 거른다(내장된 역 표) ' + (j2.info && j2.info.pk && j2.info.pk.u.length)); }
    { const j3 = await (await post(JSON.stringify({ cap: 7, f: { start: '강남', active: 'start' }, d: { u: [{ n: 'X', l: 'y' }] } }))).json(); ok(j3.info.pk === undefined && j3.body[0].kids.some(x => x.t === 'sug' && x.name === 'X'), '워커: u 를 보내면 예전 그대로'); }
    ok((await post('{oops')).status === 400 && (await post('x'.repeat(40001))).status === 413 && (await call('https://x/screen/home')).status === 405, '워커: 깨진 본문 400 · 큰 본문 413 · GET 405');
    const ro = await call('https://x/screen/home', { method: 'OPTIONS' });
    ok(ro.status === 204 && r.headers.get('access-control-allow-origin') === '*' && /^(no-store|private, max-age=\d+)$/.test(r.headers.get('cache-control')), '워커: OPTIONS 204 · CORS · no-store');
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  // ── ⑧ 웹 연결부 규약 (연결부를 쓴 뒤에 켜진다 — 없으면 건너뜀) ──
  if (html.indexOf('window._scrHome = ') >= 0) {
    const has = t => html.indexOf(t) >= 0;
    ok(has("'/screen/home'") && has('cap: 7'), '웹: 홈 연결부 + 엔진 주소 + 규격 수준 7');
    ok(has('id="homeRouteWrap"'), '웹: 홈 카드 감싸개');
  }
  console.log(`home_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
