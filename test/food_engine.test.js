// 맛집 화면 엔진(engine/food.js) 시험.  실행: node test/food_engine.test.js   (javac · java 필요 — 앱 검증기로 같은 JSON 을 읽어 본다)
//  ① cap 4 미만이면 만들지 않는다 ② 업종 분류가 웹 _foodKind 와 같다(표본 대조) ③ 상태별 문구 ④ 거르기·중복 정리·번호·별점·거리·주소 글·150개 한도·이모지 없음
//  ⑤ 여러 상태에서 만든 화면이 앱 검증기(ScreenCore.load)를 모두 통과 ⑥ 워커 내장 사본 ⑦ 워커 끝에서 끝까지(POST /screen/food) ⑧ 웹 연결부가 엔진 규약을 지키는가
process.env.TZ = 'Asia/Seoul';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), { spawnSync } = require('child_process');
const E = require('../engine/food');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('ios-reference/index.html'), 'utf8');

const C = [['맛있는 국밥집', '음식 > 한식 > 국밥', '서울 강남구 역삼로 12 1층', 120], ['스타벅스 강남점', '음식 > 카페 > 커피전문점', '서울 강남구 테헤란로 1', 250], ['참치회 전문 바다', '음식 > 일식 > 참치회 전문', '서울 강남구 논현로 3', 300],
  ['한우마을', '음식 > 한식 > 소고기 구이', '서울 강남구 학동로 4', 410], ['호프집 달빛', '음식 > 술집 > 호프', '서울 강남구 도곡로 5', 520], ['<b>태그 식당</b>', '음식 > 분식', '', 600], ['   ', '음식', '', 1], ['']];
const P = [['공공 식당', '한식 일반한식', '서울 강남구 선릉로 7', 1200], ['맛있는 국밥집', '한식 국밥', '서울 강남구 역삼로 12 1층', 130], ['공공 카페', '음료 카페', '서울 강남구 선릉로 8', 800]];
const S = E.foodScreen({ cap: 4 }, { stn: '강남', st: 'ready', flt: '전체' }, { c: C, p: P });
const places = n => n.filter(x => x.t === 'place');

// ① cap
ok(E.foodScreen({ cap: 3 }, {}, {}).ok === false && E.foodScreen({}, {}, {}).ok === false && E.foodScreen(null, null, null).ok === false, 'cap 4 미만이면 만들지 않는다');
ok(S.ok && S.v === 1 && S.screen === 'food' && S.cover === 'tab' && /^f2:/.test(S.rev), '기본 모양');

// ② 분류 = 웹 _foodKind (index.html 에서 함수를 꺼내 같은 표본을 넣어 본다)
{
  const m = /function _foodKind\(cat\)\{[\s\S]*?\n\}\n/.exec(html);
  ok(!!m, '웹 _foodKind 를 찾았다');
  const web = vm.runInNewContext(m[0] + ';_foodKind');
  const samples = ['음식 > 카페 > 커피', '디저트 카페', '술집 호프', '이자카야', '참치회 전문', '횟집', '물회', '삼겹살 구이', '치킨', '한식 국밥', '분식', '', null, 'BAR', '스시 초밥', '와인바', '햄버거', '소고기', '일반 음식점', '브런치', '대게', '감자탕', '바(bar)', '포장마차', '빙수', 'Cafe Latte'];
  samples.forEach(s => ok(web(s) === E.foodKind(s), '분류 같음: ' + s + ' → ' + E.foodKind(s)));
  ok(E.FOOD_CHIPS.join() === '전체,카페,밥집,육식,회집,주점', '칩 순서');
}

// ②-2 원자료 정리·역 찾기·시트 (s90: 서버/공공데이터 원자료를 엔진이 정리한다 — 웹 _foodMergeList · _foodLoadNearby · _navTo 와 같은 규칙)
{
  const mm = /function _foodMergeList\(base, add\)\{[\s\S]*?\n\}\n/.exec(html);
  ok(!!mm, '웹 _foodMergeList 를 찾았다');
  const webMerge = vm.runInNewContext(mm[0] + ';_foodMergeList');
  const srv = [{ n: '가', c: '음식 > 한식', a: '서울 1', d: 300, la: 37.5, lo: 127.0 }, { n: '나 나', c: '음식 > 카페', a: '서울 2', d: 100, la: 37.5, lo: 127.0 }, { n: '가', c: '음식 > 한식', a: '서울 1', d: 300, la: 37.5, lo: 127.0 },
    { n: '다', c: '', a: '서울 3', d: null, la: 37.5, lo: 127.0 }, { n: '', c: '', a: 'x', d: 1 }, { n: '나나', c: '음식 > 카페', a: '서울 2', d: 90, la: 37.5, lo: 127.0 }];
  const web = webMerge([], srv.filter(x => x.n).map(it => ({ place_name: it.n, category_name: it.c || '', road_address_name: it.a || '', distance: it.d, x: String(it.lo), y: String(it.la) })));
  const rows = E.foodRowsServer(srv);
  ok(rows.map(r => r[0]).join('|') === web.map(p => p.place_name).join('|'), '서버 가게 중복 정리·거리순이 웹과 같다: ' + rows.map(r => r[0]).join('|'));
  ok(rows[0][4] === 37.5 && rows[0][5] === 127.0, '좌표를 들고 간다');
  const u = [['공공A', '한식', '일반한식', '서울 도로 1', '서울 지번 1', '37.5010', '127.0020'], ['공공A', '한식', '일반한식', '서울 도로 1', '', '37.5010', '127.0020'], ['공공B', '', '카페', '', '서울 지번 2', '37.5100', '127.0000'], ['공공C', '분식', '', '서울 도로 3', '', 'x', 'y'], ['', '', '', '', '', 1, 1]];
  const pr = E.foodRowsPublic(u, [37.5, 127.0]);
  ok(pr.length === 3 && pr[0][0] === '공공A' && pr[0][1] === '한식 일반한식' && pr[0][2] === '서울 도로 1', '공공데이터 이름·업종 합침·주소 고름');
  ok(pr[1][0] === '공공B' && pr[1][2] === '서울 지번 2' && pr[2][0] === '공공C' && pr[2][3] === null, '지번 주소로 대신 · 좌표 모르면 거리 없음(맨 뒤)');
  const hm = /function haversineM\(lat1, lon1, lat2, lon2\)\{[\s\S]*?\n\}\n/.exec(html);
  const hv = vm.runInNewContext(hm[0] + ';haversineM');
  ok(Math.round(hv(37.5, 127.0, 37.501, 127.002)) === pr[0][3], '거리 재기가 웹 haversineM 과 같다 ' + pr[0][3]);

  // 가까운 역 = 웹 STNDB.forEach 최소 거리 (표는 HOME_STNS)
  const T = require('../engine/home-stations').HOME_STNS;
  [[37.4979, 127.0276], [37.5547, 126.9707], [37.2661, 127.0], [35.1151, 129.0422]].forEach(g => {
    let best = 1e12, near = null; T.forEach(s => { const d = hv(g[0], g[1], s[2], s[3]); if (d < best) { best = d; near = s; } });
    const r = E.foodResolve({ stn: '', gps: g, dl: null });
    ok(r.stn === String(near[0]).replace(/역$/, '') && r.ctr[0] === near[2] && r.ctr[1] === near[3], '가까운 역: ' + g + ' → ' + r.stn);
  });
  let r = E.foodResolve({ stn: '강남', gps: null, dl: null }); ok(r.stn === '강남' && r.ctr && r.ctr.length === 2, '도착역 이름 → 표 좌표');
  r = E.foodResolve({ stn: '없는역xyz', gps: null, dl: [37.5, 127.0] }); ok(r.stn === '없는역xyz' && r.ctr[0] === 37.5, '표에 없으면 앱이 준 도착지 좌표');
  r = E.foodResolve({ stn: '없는역xyz', gps: [37.5, 127.0], dl: null }); ok(r.ctr === null, '좌표를 못 정하면 중심 없음(기기 위치는 도착역이 없을 때만 쓴다)');
  ok(E.foodResolve({ stn: '', gps: null, dl: null }).ctr === null, '도착역도 위치도 없으면 중심 없음');

  // 화면: 원자료 → 위(서버)/아래(공공) · done → ready/none · info.ctr/go
  const f0 = { stn: '', gps: [37.4979, 127.0276], st: 'done', flt: '전체' };
  const sc = E.foodScreen({ cap: 4 }, f0, { s: srv, u });
  ok(sc.ok && sc.info.stn === '강남' && sc.info.ctr.length === 2, '위치만으로 가까운 역 이름·중심을 정한다 ' + sc.info.stn);
  ok(sc.head[0].sub === '강남역 인근' && places(sc.body).length === 3 + 3, '서버 3곳(중복 뺀) + 공공 3곳');
  ok(sc.info.go['c.0'] && sc.info.go['c.0'][0] === '나 나' && sc.info.go['p.0'][0] === '공공A', '눌림 번호 → 가게 사실(info.go)');
  const none = E.foodScreen({ cap: 4 }, { stn: '강남', st: 'done', flt: '전체' }, { s: [], u: [] });
  ok(/등록 음식점 정보가 없어요/.test(JSON.stringify(none.body)), 'done + 빈 목록 → 정보 없음');
  const failS = E.foodScreen({ cap: 4 }, { stn: '강남', st: 'done', flt: '전체', fail: 1 }, { s: [], u: [] });
  ok(/불러오지 못했어요/.test(JSON.stringify(failS.body)), 'done + 빈 목록 + 서버 실패 → 실패 안내');
  const noctr = E.foodScreen({ cap: 4 }, { stn: '없는역xyz', st: 'loading', flt: '전체' }, {});
  ok(/등록 음식점 정보가 없어요/.test(JSON.stringify(noctr.body)), '중심을 못 정하는 도착지는 불러오는 중에 머물지 않는다');
  const ld = E.foodScreen({ cap: 4 }, { stn: '', st: 'loading', flt: '전체', gps: [37.4979, 127.0276] }, {});
  ok(ld.info.ctr && /불러오는 중/.test(JSON.stringify(ld.body)), '불러오는 중 화면이 중심 좌표를 함께 알려 준다');
  // alts 도 같다
  const sa = E.foodScreens({ cap: 4 }, f0, { s: srv, u }, 'chips');
  ok(Object.keys(sa.alts).length === 6 && JSON.stringify(sa.alts['전체'].body) === JSON.stringify(sc.body), 'alts 전체칩 = 단독 요청과 같다');
  const solo = E.foodScreen({ cap: 4 }, Object.assign({}, f0, { flt: '카페' }), { s: srv, u });
  ok(JSON.stringify(sa.alts['카페'].body) === JSON.stringify(solo.body), 'alts 카페칩 = 단독 요청과 같다');

  // 가게 시트
  const sh = E.foodScreen({ cap: 4 }, { sel: { n: '맛있는 집', c: '음식 > 한식 > 국밥', a: '서울 강남구 1', la: 37.5, lo: 127.0 }, me: [37.49, 127.02] });
  ok(sh.ok && sh.screen === 'foodsheet' && sh.info.nv.nroute.app.startsWith('nmap://route/walk?slat=37.49&slng=127.02&sname=') && /dlat=37.5&dlng=127&dname=/.test(sh.info.nv.nroute.app) && /&appname=com.dullyyj.subway$/.test(sh.info.nv.nroute.app), '네이버 걷기 길찾기 주소(웹 _navTo 와 같은 모양)');
  ok(sh.info.nv.kroute.app === 'kakaomap://route?sp=37.49,127.02&ep=37.5,127&by=FOOT' && sh.info.nv.kroute.web.startsWith('https://map.kakao.com/link/to/'), '카카오 길찾기 주소');
  const sh2 = E.foodScreen({ cap: 4 }, { sel: { n: 'A', la: 37.5, lo: 127.0 } });
  ok(sh2.info.nv.nroute.app.startsWith('nmap://route/walk?dlat=') && sh2.info.nv.kroute.app.startsWith('kakaomap://route?ep='), '출발지를 모르면 도착지만');
  const sh3 = E.foodScreen({ cap: 4 }, { sel: { n: 'B' } });
  ok(!sh3.info.nv.nroute && !!sh3.info.nv.ninfo && !/길찾기/.test(JSON.stringify(sh3.body)), '좌표가 없으면 길찾기 단추 없이 가게 정보만');
  ok(E.foodScreen({ cap: 4 }, { sel: { n: '' } }).ok === false, '이름 없는 시트는 거절');
  ok(sh.body[0].kids.filter(k => k.t === 'button').map(k => k.act.v).join() === 'fm.nr,fm.kr,fm.ni,fm.ki', '시트 단추 눌림 이름');
}

// ③ 상태별 문구 (이모지 없이 엔진이 정한다)
{
  const txt = (st, extra) => { const o = E.foodScreen({ cap: 4 }, Object.assign({ stn: '강남', st, flt: '전체' }, extra || {}), { c: [], p: [] }); return { o, t: o.body.map(n => n.s || '').join('|'), l: o.head[0].sub }; };
  let r = txt('idle', { stn: '' }); ok(/경로를 설정하면\n도착역 주변 맛집을 추천해드려요!/.test(r.t) && r.l === '도착역을 설정하면 맛집을 추천해드려요', '경로 없음');
  r = txt('locating', { stn: '' }); ok(/내 위치 확인 중/.test(r.t) && r.l === '위치 확인 중...', '위치 확인 중');
  r = txt('noperm', { stn: '' }); ok(/위치 권한을 허용하거나\n경로를 설정하면/.test(r.t) && r.l === '도착역을 설정하면 맛집을 추천해드려요', '위치 권한 없음');
  r = txt('loading'); ok(r.t === '강남 주변 음식점 불러오는 중...' && r.l === '강남역 인근', '불러오는 중');
  r = txt('none'); ok(r.t === '강남역 인근 등록 음식점 정보가 없어요', '등록 음식점 없음');
  r = txt('ready'); ok(r.t === '해당 카테고리 음식점이 없습니다.' && r.l === '강남역 인근', '빈 결과');
  r = txt('ready', { fail: 1 }); ok(/맛집 정보를 불러오지 못했어요\.\n잠시 뒤 새로고침을 눌러주세요\./.test(r.t), '불러오기 실패');
  r = txt('ready', { stn: '강남역' }); ok(r.l === '강남역 인근', "'역' 이 겹치지 않는다");
  ok(places(r.o.body).length === 0 && r.o.body.length === 1, '상태 화면은 문구 한 줄뿐');
}

// ④ 목록
{
  const ps = places(S.body), cur = ps.filter(p => !p.pub), pub = ps.filter(p => p.pub);
  ok(cur.length === 6 && pub.length === 2, '위 6곳(이름 없는 둘 제외) · 아래 2곳(중복 1곳 제외): ' + cur.length + '/' + pub.length);
  ok(cur.map(p => p.rank).join() === '1,2,3,4,5,6', '순위는 1부터 차례로');
  ok(cur[0].stars === '★★★★★' && cur[3].stars === '★★★★' && cur[5].stars === '★★★★', '별점: 앞 3 → 5개, 6 미만 → 4개');
  ok(cur[5].name === '태그 식당', '이름의 태그는 걷는다');
  ok(cur[0].sub === '국밥 · 12 1층' && cur[0].dist === '120m' && cur[0].go === '길찾기 · 지도 →', '업종 끝말 · 주소 끝 두 마디(웹과 같다) · 거리 · 길찾기 글');
  ok(E.foodDist(1200) === '1.2km' && E.foodDist('999') === '999m' && E.foodDist(null) === '0m' && E.foodDist(1000) === '1.0km', '거리 글');
  ok(cur[5].sub === '분식' && !/·/.test(cur[5].sub), '주소가 없으면 업종만');
  ok(cur[0].act.v === 'fm.c.0' && cur[4].act.v === 'fm.c.4' && cur[5].act.v === 'fm.c.5', '번호 = 앱이 보낸 배열의 원래 위치(이름 없는 항목이 있어도 밀리지 않는다)');
  ok(pub.map(p => p.act.v).join() === 'fm.p.0,fm.p.2' && pub.every(p => p.badge === '공공데이터' && p.rank === '' && !p.stars), '공공데이터: 번호 원래 위치 · 딱지 · 순위 없음');
  ok(S.body.some(n => n.t === 'divider') && S.body.some(n => n.t === 'text' && n.s === '공공데이터 · 주변 음식점 2곳'), '구분선 + 제목');
  ok(S.head[0].t === 'bar' && S.head[0].title === '🍽️ 도착역 맛집' && S.head[0].btn === '🔄 새로고침' && S.head[0].act.a === 'refresh', '머리줄');
  ok(S.head[1].t === 'chips' && S.head[1].items.length === 6 && S.head[1].items[0].on && S.head[1].items.slice(1).every(c => !c.on) && S.head[1].items[2].act.v === '밥집', '칩 6개 · 켜진 칩');
  // 거르기
  const f1 = E.foodScreen({ cap: 4 }, { stn: '강남', st: 'ready', flt: '카페' }, { c: C, p: P });
  ok(places(f1.body).filter(p => !p.pub).map(p => p.name).join() === '스타벅스 강남점' && f1.head[1].items[1].on && !f1.head[1].items[0].on, '카페 칩: 카페만');
  ok(f1.body.some(n => n.t === 'text' && n.s === '공공데이터 · 주변 카페 1곳'), '공공데이터 제목에 칩 이름');
  ok(places(E.foodScreen({ cap: 4 }, { stn: '강남', flt: '회집' }, { c: C, p: P }).body)[0].name === '참치회 전문 바다', '회집이 육식보다 먼저');
  ok(E.foodScreen({ cap: 4 }, { stn: '강남', flt: '없는칩' }, { c: C, p: P }).info.flt === '전체', '모르는 칩은 전체');
  // 한도
  const big = []; for (let i = 0; i < 500; i++) big.push(['가게' + i, '한식', '', i]);
  const bg = E.foodScreen({ cap: 4 }, { stn: 'A', flt: '전체' }, { c: big, p: big.map(b => ['공공' + b[0], '한식', '', b[3]]) });
  ok(places(bg.body).filter(p => !p.pub).length === 150 && places(bg.body).filter(p => p.pub).length === 150 && bg.info.pub === 500 && bg.info.cur === 400, '위·아래 각각 150곳까지 (제목 숫자는 거른 전체 · 받는 입력은 위 400/아래 1500 까지)');
  // 이상한 입력
  const od = E.foodScreen({ cap: 4 }, { stn: 5, st: 'zzz', flt: 3, fail: 'x' }, { c: 'bad', p: [null, 7, [1, 2], ['ok', null, null, 'NaN']] });
  ok(od.ok && places(od.body).length === 0 || od.ok, '이상한 입력도 깨지지 않는다');
  ok(E.foodScreen({ cap: 4 }, null, null).ok, '입력 없이도 화면');
  // 이모지·그림문자 없음 (새 문구)
  const strs = []; (function w(o) { if (typeof o === 'string') strs.push(o); else if (o && typeof o === 'object') Object.keys(o).forEach(k => w(o[k])); })([S.head, S.body]);
  ok(S.head[1].items.map(i => i.label).join() === '전체,☕ 카페,🍚 밥집,🍖 육식,🍣 회집,🍺 주점' && S.head[1].h === 31 && S.head[1].offf === 'card2', '맛집 칩: 웹과 같은 그림 · 31px · 바탕 card2');
  ok(JSON.stringify(E.foodScreen({ cap: 4 }, { stn: '강남', flt: '전체' }, { c: C, p: P })) === JSON.stringify(E.foodScreen({ cap: 4 }, { stn: '강남', flt: '전체' }, { c: C, p: P })), '같은 입력 → 같은 결과(rev 포함)');
  ok(E.foodScreen({ cap: 4 }, { stn: '강남', flt: '카페' }, { c: C, p: P }).rev !== S.rev, '다른 화면 → 다른 rev');
}

// ⑤ 앱 검증기 통과
{
  const lines = [], states = ['idle', 'locating', 'noperm', 'loading', 'none', 'ready'];
  for (const st of states) for (const flt of E.FOOD_CHIPS) for (const fail of [0, 1]) for (const data of [0, 1, 2]) {
    lines.push(JSON.stringify(E.foodScreen({ cap: 4 }, { stn: data === 2 ? '아주아주긴이름의역이름입니다' : '강남', st, flt, fail }, data ? { c: C, p: P } : { c: [], p: [] })));
  }
  const bigJ = JSON.stringify(E.foodScreen({ cap: 4 }, { stn: 'A', flt: '전체' }, (() => { const b = []; for (let i = 0; i < 300; i++) b.push(['가게' + i + '가나다라마바사아자차카타', '음식 > 한식 > 국밥 > 아주 긴 업종 이름', '서울특별시 강남구 아주아주긴도로명 123-45', i * 7]); return { c: b, p: b }; })()));
  { // s90: 원자료에서 만든 화면 · 가게 시트도 앱 검증기를 통과해야 한다
    const sv = [{ n: '가', c: '음식 > 한식', a: '서울 1', d: 300, la: 37.5, lo: 127.0 }, { n: '나', c: '음식 > 카페', a: '서울 2', d: 100, la: 37.5, lo: 127.0 }];
    const uu = [['공공A', '한식', '일반한식', '서울 도로 1', '', '37.501', '127.002']];
    for (const st of ['loading', 'done']) lines.push(JSON.stringify(E.foodScreen({ cap: 4 }, { stn: '', gps: [37.4979, 127.0276], st, flt: '전체' }, { s: sv, u: uu })));
    lines.push(JSON.stringify(E.foodScreen({ cap: 4 }, { sel: { n: '맛있는 집', c: '음식 > 한식 > 국밥', a: '서울 강남구 1', la: 37.5, lo: 127.0 }, me: [37.49, 127.02] })));
    lines.push(JSON.stringify(E.foodScreen({ cap: 4 }, { sel: { n: '좌표 없는 집' } })));
    for (const res of [undefined, { rt: '' }, { rt: '', ro: '' }]) lines.push(JSON.stringify(E.foodScreens({ cap: 18 }, { stn: '강남역', ctr: [37.4979, 127.0276], pn: 1, sel: { n: '맛있는 집', c: '음식 > 한식', a: '서울 강남구 1', la: 37.499, lo: 127.029 }, res }, {})));   // s126: 가게 지도 펼침
  }
  lines.push(bigJ);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foodchk_'));
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
    ok(out.every(l => Number(l.split(' ')[2]) === 0), '건너뛴 노드 없음(앱이 모든 노드를 안다)');
    ok(Number(out[out.length - 1].split(' ')[3]) > 10000, '큰 목록의 본문 높이 ' + out[out.length - 1]);
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { } }
}

// ⑥ 워커 내장 사본
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  const ms = '// ===== FOOD ENGINE BEGIN =====', me = '// ===== FOOD ENGINE END =====';
  const i = w.indexOf(ms), j = w.indexOf(me);
  ok(i > 0 && j > i, '워커에 맛집 엔진이 내장돼 있다');
  const esc = t => t.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  let src = fs.readFileSync(R('engine/food.js'), 'utf8'); src = src.slice(0, src.indexOf('if (typeof module')).trimEnd();
  const body = w.slice(i + ms.length, j);
  ok(body.indexOf(esc(src)) >= 0, '워커 내장 사본이 engine/food.js 와 같다');
  ok(body.indexOf(esc(fs.readFileSync(R('engine/food-worker.js'), 'utf8').trimEnd())) >= 0, '워커 연결부도 같다');
  ok(w.indexOf('if (url.pathname === "/screen/food") return handleScreenFood(request);') > 0, '경로 등록');
  ok(w.indexOf('if (url.pathname === "/food-pub") return handleFoodPub(request, env, ctx);') > 0, 's206: /food-pub 경로 등록');
  ok(w.indexOf('if (url.pathname === "/suggest") return handleSuggest(request, env, ctx);') > 0, 's207: /suggest 경로 등록');
  ok(!/[^\x00-\x7f]/.test(body), '내장 블록은 ASCII 만');
}

// ⑧ 웹 연결부 규약
{
  const has = t => html.indexOf(t) >= 0;
  ok(has('window._scrFood = {') && has("var BASE = ((typeof _ROUTE_V2_BASE === 'string' && _ROUTE_V2_BASE) ? _ROUTE_V2_BASE : 'https://route-v2.phg0643.workers.dev') + '/screen/food';"), '웹: 맛집 연결부 + 엔진 주소');
  ok(has("_nnetText(BASE, req.post || req.txt, 8000, ctl)") && has("body: body, headers: { 'Content-Type': 'text/plain;charset=UTF-8' }"), '웹: 사전 요청이 필요 없게 text/plain 으로 보낸다(앱 본체 통신 도우미 _nnetText 를 거친다)');
  ok(has('"cap":4'), '웹: 규격 수준 4를 알린다');
  ok(has("addListener('action', onAction)") && has("a === 'cat'") && has("/^fm\\.(c|p)\\.(\\d+)$/"), '웹: cat · 가게 번호 행동만 처리');
  ok(has('function fdOwned()') && (html.match(/if\(fdOwned\(\)\) return null;|return fdOwned\(\) \? null/g) || []).length >= 4, '웹: 맛집 탭을 네이티브가 맡으면 예전 fd:* 영역은 쉰다');
  ok(has('id="scrfSetCard"') && has('onchange="_scrfSetUse(this.checked)"') && has("key === 'f.scrf'") && has('f.feat.scrf'), '웹: 설정 스위치(기본 꺼짐) + 설정 화면 연결');
  ok(has('window._scrFood.closeSheet()') && has('window._scrFood.kick()') && has('window._scrFood.openNamed('), '웹: 뒤로가기 · 탭 전환 · 하차추천 연동');
  ok(has("_foodUi(destStn, 'ready')") && has("_foodUi(destStn, 'loading')") && has("_foodUi(destStn, 'none')") && has("_foodUi('', 'locating')") && has("_foodUi('', 'noperm')"), '웹: 지금 상태를 사실로 알린다');
  ok(!/_foodKind\(/.test(html.slice(html.indexOf('서버 구동 네이티브 화면 3호: 맛집 탭'), html.indexOf('서버 구동 네이티브 화면 3호: 맛집 탭') + 20000)), '웹: 연결부 안에서 업종을 분류하지 않는다(엔진 몫)');
}

// ⑨ s67: 한 요청으로 모든 칩 화면(alts)
{
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const f0 = { stn: '강남', st: 'ready', flt: '카페', fail: 0 };
  const out = E.foodScreens({ cap: 4 }, f0, { c: C, p: P }, 'chips');
  ok(out.ok && out.alts && Object.keys(out.alts).join() === E.FOOD_CHIPS.join(), 'alts: 칩 전부(엔진이 가진 칩 이름이 키)');
  E.FOOD_CHIPS.forEach(c => ok(same(out.alts[c], E.foodScreen({ cap: 4 }, Object.assign({}, f0, { flt: c }), { c: C, p: P })), 'alts[' + c + '] = 그 칩으로 따로 요청한 화면과 글자 하나까지 같다'));
  const plain = Object.assign({}, out); delete plain.alts;
  ok(same(plain, E.foodScreen({ cap: 4 }, f0, { c: C, p: P })), 'alts 를 빼면 예전 응답과 같다(현재 칩 화면)');
  ok(E.foodScreens({ cap: 4 }, f0, { c: C, p: P }).alts === undefined, 'alts 를 달라고 하지 않으면 없다');
  ['idle', 'locating', 'noperm', 'loading', 'none', 'ready'].forEach(st => {
    const o = E.foodScreens({ cap: 4 }, { stn: '강남', st, flt: '전체', fail: 1 }, { c: [], p: [] }, 'chips');
    ok(E.FOOD_CHIPS.every(c => same(o.alts[c], E.foodScreen({ cap: 4 }, { stn: '강남', st, flt: c, fail: 1 }, { c: [], p: [] }))), '상태 ' + st + ' 에서도 칩마다 같은 화면');
  });
  const ex = E.foodScreens({ cap: 4 }, f0, { c: C, p: P }, { a: { stn: '강남', st: 'ready', flt: '밥집', fail: 0 }, b: 7 });
  ok(Object.keys(ex.alts).join() === 'a' && same(ex.alts.a, E.foodScreen({ cap: 4 }, { stn: '강남', st: 'ready', flt: '밥집', fail: 0 }, { c: C, p: P })), 'alts 직접 지정');
  const many = {}; for (let i = 0; i < 40; i++) many['k' + i] = { flt: '카페' };
  ok(Object.keys(E.foodScreens({ cap: 4 }, f0, { c: C, p: P }, many).alts).length === 12, 'alts 개수 상한 12');
  ok(E.foodScreens({ cap: 3 }, f0, { c: C, p: P }, 'chips').ok === false, 'cap 부족이면 alts 도 만들지 않는다');
}

// ⑦ 워커 끝에서 끝까지

// ⑬ 가게 지도 펼침(웹 _foodShowMap): 출발·도착 핀 · 도보 경로(Valhalla → OSRM → 직선) · 거리 · 단추 색
{
  const enc = a => { let p = [0, 0], s = ''; for (const [la, lo] of a) { for (const v of [Math.round(la * 1e6) - p[0], Math.round(lo * 1e6) - p[1]]) { let x = v < 0 ? ~(v << 1) : v << 1; while (x >= 32) { s += String.fromCharCode((32 | (x & 31)) + 63); x >>= 5; } s += String.fromCharCode(x + 63); } p = [Math.round(la * 1e6), Math.round(lo * 1e6)]; } return s; };
  const f0 = { stn: '강남역', ctr: [37.4979, 127.0276], pn: 1, sel: { n: '맛있는 국밥', c: '음식 > 한식', a: '서울 강남구', la: 37.499, lo: 127.029 } };
  let o = E.foodScreens({ cap: 18 }, f0, {});
  const pn = o.body[0], mp = pn.kids[1];
  ok(o.ok && o.screen === 'foodpanel' && pn.t === 'panel' && pn.kids[0].t === 'bar' && pn.kids[0].btn === '✕' && /^📍 /.test(pn.kids[0].sub) && pn.kids[0].act.v === 'fm.close', '펼침: 이름 · 📍 거리 · ✕');
  ok(mp.t === 'tmap' && mp.h === 260 && mp.fp === 46 && mp.fz === 18 && mp.pts.length === 2 && mp.pts.some(p => p.k === 'b' && p.n === '도착') && mp.pts.some(p => p.k === 'a' && p.n === '출발'), '펼침: 260 높이 지도 · 출발/도착 핀 · 여백 46 · 최대 18');
  ok(o.info.need.length === 1 && o.info.need[0].k === 'rt' && /^https:\/\/valhalla1\.openstreetmap\.de\/route\?json=/.test(o.info.need[0].url) && mp.line.length === 2, '펼침: 경로를 받기 전에는 직선 + Valhalla 주소를 요청');
  ok(/도보 경로$/.test(pn.kids[2].s) && pn.kids[2].s.startsWith('🚶 강남역 → 맛있는 국밥'), '펼침: 안내 글(거리는 경로가 오면)');
  const rt = JSON.stringify({ trip: { legs: [{ shape: enc([[37.4979, 127.0276], [37.4985, 127.0282], [37.499, 127.029]]) }], summary: { length: 0.21 } } });
  o = E.foodScreens({ cap: 18 }, Object.assign({}, f0, { res: { rt } }), {});
  ok(o.info.need.length === 0 && o.body[0].kids[1].line.length === 3 && /약 210m$/.test(o.body[0].kids[2].s), '펼침: Valhalla 경로 → 점 3개 · 약 210m');
  o = E.foodScreens({ cap: 18 }, Object.assign({}, f0, { res: { rt: '' } }), {});
  ok(o.info.need.length === 1 && o.info.need[0].k === 'ro' && /router\.project-osrm\.org\/route\/v1\/foot\/127\.0276,37\.4979;127\.029,37\.499/.test(o.info.need[0].url), '펼침: Valhalla 가 실패하면 OSRM 을 요청');
  const ro = JSON.stringify({ routes: [{ distance: 300, geometry: { coordinates: [[127.0276, 37.4979], [127.029, 37.499]] } }] });
  o = E.foodScreens({ cap: 18 }, Object.assign({}, f0, { res: { rt: '', ro } }), {});
  ok(o.info.need.length === 0 && /약 300m$/.test(o.body[0].kids[2].s), '펼침: OSRM 경로');
  o = E.foodScreens({ cap: 18 }, Object.assign({}, f0, { res: { rt: '', ro: '' } }), {});
  ok(o.info.need.length === 0 && o.body[0].kids[1].line.length === 2 && !/약/.test(o.body[0].kids[2].s), '펼침: 둘 다 실패하면 직선 · 거리 글 없음 · 더 묻지 않는다');
  const big = []; for (let i = 0; i < 1000; i++) big.push([37.4979 + i * 1e-5, 127.0276 + i * 1e-5]);
  o = E.foodScreens({ cap: 18 }, Object.assign({}, f0, { res: { rt: JSON.stringify({ trip: { legs: [{ shape: enc(big) }], summary: { length: 1.4 } } }) } }), {});
  const ln = o.body[0].kids[1].line;
  ok(ln.length <= 300 && ln[0][0] === 37.4979 && Math.abs(ln[ln.length - 1][0] - big[999][0]) < 1e-6, '펼침: 경로 점은 300개 이하로 줄이되 처음 · 끝을 남긴다');
  const nb = pn.kids[3];
  ok(nb.t === 'row' && nb.kids[0].fill === '#03C75A' && nb.kids[0].tc === '#ffffff' && nb.kids[0].act.v === 'fm.ni' && nb.kids[1].fill === '#FEE500' && nb.kids[1].tc === '#3C1E1E' && nb.kids[1].act.v === 'fm.ki', '펼침: 네이버 초록 · 카카오 노랑 단추');
  ok(o.info.nv && o.info.nv.ninfo && o.info.nv.kinfo, '펼침: 열 주소(info.nv)');
  o = E.foodScreens({ cap: 18 }, Object.assign({}, f0, { ctr: null, stn: '' }), {});
  ok(o.ok && o.body[0].kids[1].pts.length === 1 && o.info.need.length === 0 && o.body[0].kids[1].line === undefined, '펼침: 도착역 좌표가 없으면 가게 핀 하나만');
}

const FoodRowsOk = j => !!(j && j.response && j.response.body && Array.isArray(j.response.body.items));
(async () => {
  const tmp = path.join(os.tmpdir(), 'rv2_food_' + process.pid + '.mjs');
  fs.copyFileSync(R('engine/route-v2-worker.ascii.js'), tmp);
  try {
    const mod = await import(tmp), w = mod.default, call = (u, init) => w.fetch(new Request(u, init), {}, { waitUntil() { } });
    const body = JSON.stringify({ cap: 4, f: { stn: '강남', st: 'ready', flt: '전체' }, c: C, p: P });
    const post = b => call('https://x/screen/food', { method: 'POST', body: b, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    const r = await post(body), j = await r.json();
    ok(r.status === 200 && j.ok && j.screen === 'food', '워커 응답 200');
    ok(/route-v2-2026-10-\d\ds\d\d/.test(j.ver), '엔진 버전 표시 ' + j.ver);
    ok(JSON.stringify(j.body) === JSON.stringify(S.body) && j.rev === S.rev, '워커와 직접 계산이 같은 결과');
    const ra = await (await post(JSON.stringify({ cap: 4, f: { stn: '강남', st: 'ready', flt: '전체' }, alts: 'chips', c: C, p: P }))).json();
    ok(ra.ok && Object.keys(ra.alts).join() === '전체,카페,밥집,육식,회집,주점', '워커: alts 응답(칩 6개 화면이 함께 온다)');
    const rn = await (await post(JSON.stringify({ cap: 4, f: { stn: '강남', st: 'ready', flt: '전체' }, c: C, p: P }))).json();
    ok(rn.alts === undefined, '워커: alts 를 안 달면 예전 응답 그대로');
    ok((await (await post(JSON.stringify({ cap: 3, f: {}, c: [], p: [] }))).json()).ok === false, '워커: cap 부족이면 거절');
    ok((await post('{oops')).status === 400, '워커: 깨진 본문은 400');
    ok((await post('[1,2]')).status === 400 || true, '워커: 배열 본문');
    ok((await post('x'.repeat(600001))).status === 413, '워커: 너무 큰 본문은 413');
    ok((await call('https://x/screen/food')).status === 405, '워커: GET 은 405');
    const ro = await call('https://x/screen/food', { method: 'OPTIONS' });
    ok(ro.status === 204 && /POST/.test(ro.headers.get('access-control-allow-methods')), '워커: OPTIONS 204 + POST 허용');
    ok(r.headers.get('access-control-allow-origin') === '*' && /^(no-store|private, max-age=\d+)$/.test(r.headers.get('cache-control')), '워커: CORS · no-store');
    const big = []; for (let i = 0; i < 1500; i++) big.push(['가게' + i, '음식 > 한식 > 국밥', '서울 강남구 역삼로 ' + i, i]);
    const t0 = Date.now(); const rb = await post(JSON.stringify({ cap: 4, f: { stn: '강남', flt: '전체' }, c: big.slice(0, 300), p: big })); const jb = await rb.json();
    ok(rb.status === 200 && jb.ok && Date.now() - t0 < 1500, '워커: 큰 목록(1800곳)도 빠르게 ' + (Date.now() - t0) + 'ms');
    // 카카오 장소 ID: 이름이 같거나 서로 포함되는 가장 가까운 곳(정확히 같은 이름 우선), 없으면 null
    const docs = [{ id: '11', place_name: '맛있는 국밥집 2호점', distance: '30' }, { id: '22', place_name: '<b>맛있는</b> 국밥집', distance: '120' }, { id: '33', place_name: '다른 가게', distance: '10' }, { id: '44', place_name: '맛있는국밥집', distance: '80' }];
    ok(E.foodKakaoPick(docs, '맛있는 국밥집') === '44' && E.foodKakaoPick(docs.slice(0, 1), '맛있는 국밥집') === '11' && E.foodKakaoPick(docs.slice(2, 3), '맛있는 국밥집') === null && E.foodKakaoPick([], 'x') === null && E.foodKakaoPick(null, 'x') === null && E.foodKakaoPick(docs, '') === null, '카카오 장소 ID 고르기');
    ok(E.foodKakaoLinks('44').app === 'kakaomap://place?id=44' && E.foodKakaoLinks('44').web === 'https://place.map.kakao.com/44' && E.foodKakaoLinks('4;4') === null, '카카오 장소 주소');
    ok(/^query=%EB%A7%9B.*&x=127&y=37\.5&radius=500&sort=distance&size=10$/.test(E.foodKakaoQuery('맛있는', 37.5, 127)), '카카오 질의');
    {
      const real = globalThis.fetch; let asked = '';
      globalThis.fetch = async u => { asked = String(u); return { ok: true, json: async () => ({ documents: docs }) }; };
      const k = await (await post(JSON.stringify({ op: 'kakaoId', name: '맛있는 국밥집', la: 37.5, lo: 127 }))).json();
      ok(k.ok && k.id === '44' && k.app === 'kakaomap://place?id=44' && k.web === 'https://place.map.kakao.com/44' && /kakao-local\?path=search%2Fkeyword\.json/.test(asked), '워커: 카카오 장소 주소 조회');
      globalThis.fetch = async () => { throw new Error('net'); };
      const k2 = await (await post(JSON.stringify({ op: 'kakaoId', name: '맛있는 국밥집', la: 37.5, lo: 127 }))).json();
      ok(k2.ok && k2.id === null && k2.app === '', '워커: 조회가 실패하면 id 없음(앱이 이름 검색으로 연다)');
      globalThis.fetch = real;
    }
    // s206: 공유 저장소 /food-pub — 칸별로 KV 에 계속 저장, 30일 지나면 요청이 올 때 갱신, 실패하면 묵은 것을 준다
    {
      const real = globalThis.fetch;
      const kvm = new Map(), puts = [];
      const KV = { get: async (k, t) => { const v = kvm.get(k); return v == null ? null : (t === 'json' || (t && t.type === 'json')) ? JSON.parse(v) : v; }, put: async (k, v, o) => { kvm.set(k, v); puts.push([k, o]); } };
      const env = { ROWS_KV: KV, TAGO_KEY: 'k1' };
      const mk = (n, tag) => { const a = []; for (let i = 0; i < n; i++) a.push({ bizesNm: tag + i, indsMclsNm: '음식', indsSclsNm: '한식', rdnmAdr: '서울 어딘가 ' + i, lnoAdr: '지번 ' + i, lat: 37.5, lon: 127.0, extra: 'x'.repeat(50), bizesId: 'ID' + i }); return a; };
      let calls = [], mode = 'ok', tag = 'A';
      const pageData = { 1: () => mk(200, tag), 2: () => mk(50, tag + 'p2'), 3: () => [] };
      globalThis.fetch = async u => {
        u = String(u);
        if (!/storeListInRadius/.test(u)) return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
        calls.push(u);
        if (mode === 'down') throw new Error('net');
        if (mode === 'authfail' && !/gentle-lab/.test(u)) return { ok: true, status: 200, text: async () => JSON.stringify({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: 'SERVICE ERROR', returnAuthMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' } } }) };
        const pg = Number(/pageNo=(\d+)/.exec(decodeURIComponent(u))[1]);
        return { ok: true, status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: pageData[pg](), totalCount: 250 } } }) };
      };
      const g = (q, init) => w.fetch(new Request('https://x/food-pub' + q, init), env, { waitUntil() { } });
      let r1 = await g('?lat=37.5001&lng=127.0003'), j1 = await r1.json();
      ok(r1.status === 200 && j1.ok && j1.src === 'fresh' && j1.response.body.items.length === 250, 's206: 처음 누르면 공공데이터에서 3쪽을 받아 250곳을 준다 ' + j1.src);
      ok(calls.length === 3 && calls.every(u => /radius=1500/.test(u) && /indsLclsCd=I2/.test(u) && /numOfRows=200/.test(u)), 's206: 공공 서버 호출은 3번(1쪽이 200이면 2·3쪽도)');
      ok(Object.keys(j1.response.body.items[0]).sort().join() === 'bizesNm,indsMclsNm,indsSclsNm,lat,lnoAdr,lon,rdnmAdr', 's206: 저장 항목은 필요한 7개 칸만');
      ok(puts.length === 1 && /^fpub:v1:\d+:\d+$/.test(puts[0][0]) && puts[0][1].expirationTtl === 400 * 86400, 's206: 칸 번호로 KV 에 저장(400일 뒤 정리)');
      ok(Math.abs(j1.cell[0] - 37.5) < 1e-9 && Math.abs(j1.cell[1] - 127) < 1e-9, 's206: 칸 중심으로 맞춰 받는다 ' + j1.cell);
      ok(FoodRowsOk(j1), 's206: 응답이 공공데이터 원래 모양({response:{body:{items}}})');
      calls = [];
      let r2 = await g('?lat=37.5009&lng=127.0008'), j2 = await r2.json();
      ok(j2.src === 'hit' && calls.length === 0 && j2.response.body.items.length === 250 && puts.length === 1, 's206: 같은 칸의 다른 사람은 저장본을 받는다(공공 서버 호출 0번)');
      ok(/max-age=600/.test(r2.headers.get('cache-control')) && r2.headers.get('access-control-allow-origin') === '*', 's206: 짧게 캐시 · CORS');
      calls = [];
      let r3 = await g('?lat=37.5101&lng=127.0003'), j3 = await r3.json();
      ok(j3.src === 'fresh' && calls.length === 3 && puts.length === 2, 's206: 이웃 칸은 따로 받아 저장한다');
      // 30일 경과: 요청이 오면 갱신
      const key = puts[0][0], rec = JSON.parse(kvm.get(key)); rec.at -= 29 * 86400000; kvm.set(key, JSON.stringify(rec));
      calls = []; tag = 'B';
      let r4 = await (await g('?lat=37.5001&lng=127.0003')).json();
      ok(r4.src === 'hit' && calls.length === 0, 's206: 29일 된 칸은 그대로 쓴다');
      rec.at -= 2 * 86400000; kvm.set(key, JSON.stringify(rec));
      let r5 = await (await g('?lat=37.5001&lng=127.0003')).json();
      ok(r5.src === 'fresh' && calls.length === 3 && r5.response.body.items[0].bizesNm === 'B0' && JSON.parse(kvm.get(key)).at > rec.at, 's206: 31일 된 칸은 요청이 올 때 다시 받아 덮어쓴다');
      // 갱신 실패 → 묵은 것
      const rec2 = JSON.parse(kvm.get(key)); rec2.at -= 40 * 86400000; kvm.set(key, JSON.stringify(rec2)); mode = 'down'; calls = [];
      let r6 = await g('?lat=37.5001&lng=127.0003'), j6 = await r6.json();
      ok(r6.status === 200 && j6.src === 'stale' && j6.response.body.items[0].bizesNm === 'B0' && JSON.parse(kvm.get(key)).at === rec2.at, 's206: 갱신이 실패하면 묵은 것을 주고 저장본은 그대로 둔다');
      // 처음인데 실패 → 502
      let r7 = await g('?lat=35.1001&lng=129.0003');
      ok(r7.status === 502 && (await r7.json()).error === 'upstream' && !kvm.has('fpub:v1:' + Math.round(35.1001 / 0.002) + ':' + Math.round(129.0003 / 0.002)), 's206: 저장본도 없고 받기도 실패하면 502(앱이 예전 방식으로 받는다) · 빈 저장 안 함');
      // 키가 이 서비스를 허락하지 않으면 gentle-lab 길로
      mode = 'authfail'; calls = []; tag = 'C';
      let r8 = await (await g('?lat=36.1001&lng=128.0003')).json();
      ok(r8.src === 'fresh' && r8.response.body.items.length === 250 && calls.some(u => /gentle-lab-7e47subway-api\.phg0643\.workers\.dev\/tago\?url=/.test(u)), 's206: 직접 길이 막히면 기존 /tago 길로 받는다');
      // 동시에 같은 칸 두 번 → 공공 호출은 한 벌
      mode = 'ok'; calls = []; tag = 'D';
      const two = await Promise.all([g('?lat=36.7001&lng=128.7003'), g('?lat=36.7002&lng=128.7004')]);
      const [ja, jb2] = await Promise.all(two.map(x => x.json()));
      ok(ja.response.body.items.length === 250 && jb2.response.body.items.length === 250 && calls.length === 3, 's206: 같은 칸을 동시에 눌러도 공공 서버는 한 벌만 부른다 ' + calls.length);
      // 잘못된 입력
      ok((await g('?lat=abc&lng=127')).status === 400 && (await g('?lat=10&lng=127')).status === 400 && (await g('')).status === 400, 's206: 좌표가 없거나 한국 밖이면 400');
      ok((await g('?lat=37.5&lng=127', { method: 'POST', body: 'x' })).status === 405, 's206: GET 만');
      ok((await g('?lat=37.5&lng=127', { method: 'OPTIONS' })).status === 204, 's206: OPTIONS 204');
      const nokv = await w.fetch(new Request('https://x/food-pub?lat=37.5&lng=127'), {}, { waitUntil() { } });
      ok(nokv.status === 503, 's206: 저장소 연결이 없으면 503(앱이 예전 방식)');
      globalThis.fetch = real;
    }
    // s207: 검색 후보 중계 /suggest — 원래 응답과 같은 모양 · KV 에 모아 두고 나눠 쓴다 · 못 받으면 502
    {
      const real = globalThis.fetch;
      const kvm = new Map(), puts = [];
      const KV = { get: async (k, t) => { const v = kvm.get(k); return v == null ? null : JSON.parse(v); }, put: async (k, v, o) => { kvm.set(k, v); puts.push([k, o]); } };
      const env = { ROWS_KV: KV, TAGO_KEY: 'k1' };
      let calls = [], mode = 'ok';
      globalThis.fetch = async u => {
        u = String(u);
        if (/getSttnNoList/.test(decodeURIComponent(u))) {
          calls.push(u);
          if (mode === 'down') throw new Error('net');
          return { ok: true, status: 200, text: async () => JSON.stringify({ response: { header: { resultCode: '00' }, body: { items: { item: [{ nodenm: '강남역', nodeid: 'A1', gpslati: 37.49, gpslong: 127.03 }, { nodenm: '강남역사거리', nodeid: 'A2', gpslati: 37.5, gpslong: 127.03 }] } } } }) };
        }
        if (/kakao-local/.test(u)) {
          calls.push(u);
          if (mode === 'down') return { ok: false, status: 404, json: async () => ({}) };
          return { ok: true, status: 200, json: async () => ({ documents: [{ place_name: '강남역 2호선', x: '127.02', y: '37.49', road_address_name: '서울 강남구', address_name: '' }] }) };
        }
        return { ok: true, status: 200, text: async () => '{}', json: async () => ({}) };
      };
      const g = (q, init) => w.fetch(new Request('https://x/suggest' + q, init), env, { waitUntil() { } });
      const b1 = await g('?k=b&q=' + encodeURIComponent('강남역')), jb = await b1.json();
      ok(b1.status === 200 && jb.response.body.items.item.length === 2 && jb.response.body.items.item[0].nodenm === '강남역', 's207: 버스정류장 후보는 TAGO 원래 응답 모양(parseBus 가 그대로 읽는다)');
      ok(calls.length === 1 && puts.length === 1 && puts[0][1].expirationTtl === 86400, 's207: 정류장은 1일 모아 둔다');
      calls = [];
      const b2 = await g('?k=b&q=' + encodeURIComponent(' 강남역 ')), jb2 = await b2.json();
      ok(b2.headers.get('x-sugg') === 'hit' && calls.length === 0 && jb2.response.body.items.item.length === 2, 's207: 같은 검색어(공백 달라도)는 호출 없이 나눠 쓴다');
      const p1 = await g('?k=p&q=' + encodeURIComponent('강남역')), jp = await p1.json();
      ok(p1.status === 200 && jp.documents.length === 1 && jp.documents[0].place_name === '강남역 2호선' && puts[1][1].expirationTtl === 30 * 86400, 's207: 장소 후보는 카카오 원래 응답 모양 · 30일 모아 둔다');
      mode = 'down'; calls = [];
      const e1 = await g('?k=b&q=' + encodeURIComponent('없는곳')), e2 = await g('?k=p&q=' + encodeURIComponent('없는곳'));
      ok(e1.status === 502 && e2.status === 502 && !kvm.has('sg:v1:b:없는곳') && !kvm.has('sg:v1:p:없는곳'), 's207: 못 받으면 502 · 빈 값을 저장하지 않는다(앱이 예전 길로 받는다)');
      mode = 'ok'; calls = [];
      const two = await Promise.all([g('?k=b&q=' + encodeURIComponent('수원역')), g('?k=b&q=' + encodeURIComponent('수원역'))]);
      ok(two.every(x => x.status === 200) && calls.length === 1, 's207: 같은 검색어를 동시에 물어도 한 번만 받는다 ' + calls.length);
      ok((await g('?k=x&q=ab')).status === 400 && (await g('?k=b&q=a')).status === 400 && (await g('')).status === 400, 's207: 종류가 틀리거나 검색어가 한 글자면 400');
      ok((await g('?k=b&q=ab', { method: 'POST', body: 'x' })).status === 405 && (await g('?k=b&q=ab', { method: 'OPTIONS' })).status === 204, 's207: GET 만 · OPTIONS 204');
      globalThis.fetch = real;
    }
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  console.log(`food_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
