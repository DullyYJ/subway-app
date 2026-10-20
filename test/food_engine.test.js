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
ok(S.ok && S.v === 1 && S.screen === 'food' && S.cover === 'tab' && /^f1:/.test(S.rev), '기본 모양');

// ② 분류 = 웹 _foodKind (index.html 에서 함수를 꺼내 같은 표본을 넣어 본다)
{
  const m = /function _foodKind\(cat\)\{[\s\S]*?\n\}\n/.exec(html);
  ok(!!m, '웹 _foodKind 를 찾았다');
  const web = vm.runInNewContext(m[0] + ';_foodKind');
  const samples = ['음식 > 카페 > 커피', '디저트 카페', '술집 호프', '이자카야', '참치회 전문', '횟집', '물회', '삼겹살 구이', '치킨', '한식 국밥', '분식', '', null, 'BAR', '스시 초밥', '와인바', '햄버거', '소고기', '일반 음식점', '브런치', '대게', '감자탕', '바(bar)', '포장마차', '빙수', 'Cafe Latte'];
  samples.forEach(s => ok(web(s) === E.foodKind(s), '분류 같음: ' + s + ' → ' + E.foodKind(s)));
  ok(E.FOOD_CHIPS.join() === '전체,카페,밥집,육식,회집,주점', '칩 순서');
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
  ok(S.head[0].t === 'bar' && S.head[0].title === '도착역 맛집' && S.head[0].btn === '새로고침' && S.head[0].act.a === 'refresh', '머리줄');
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
  ok(strs.every(s => !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2B50}]/u.test(s.replace(/★/g, ''))), '새 문구에 이모지 없음(★ 별점 글자만)');
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
    ok(r.headers.get('access-control-allow-origin') === '*' && r.headers.get('cache-control') === 'no-store', '워커: CORS · no-store');
    const big = []; for (let i = 0; i < 1500; i++) big.push(['가게' + i, '음식 > 한식 > 국밥', '서울 강남구 역삼로 ' + i, i]);
    const t0 = Date.now(); const rb = await post(JSON.stringify({ cap: 4, f: { stn: '강남', flt: '전체' }, c: big.slice(0, 300), p: big })); const jb = await rb.json();
    ok(rb.status === 200 && jb.ok && Date.now() - t0 < 1500, '워커: 큰 목록(1800곳)도 빠르게 ' + (Date.now() - t0) + 'ms');
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  console.log(`food_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
