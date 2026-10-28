// 쇼핑 엔진(engine/shop.js) 시험.  실행: node test/shop_engine.test.js
//  ① 앱에 남아 있는 웹 _shopPick(폴백)과 엔진 shopPick 이 같은 입력에서 같은 결과(추천 100선·카테고리별 순서)를 내는가 — 여러 날짜·시각·날씨·운영설정
//  ② 화면 JSON 모양(칩·카드·행동)이 앱 네이티브 검증(ScreenCore)이 기대하는 것과 같은가
//  ③ route-v2 워커에 내장된 사본이 engine/shop.js 와 같은가(있을 때)
process.env.TZ = 'Asia/Seoul';
const fs = require('fs'), path = require('path'), vm = require('vm');
const E = require('../engine/shop'), screenCheck = require('./helpers/screen_check');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL', m); } }

{
  const d = E.shopDelayScreen(), r = screenCheck([d]);
  ok(!r.err && r.out.every(l => /^OK/.test(l)), '서버 지연 안내 화면은 앱 검증기를 통과한다: ' + (r.err || r.out.join(' | ')));
  ok(d.delayed === true && d.retry.join() === '4,8,15,30', '안내 화면: 재시도 간격은 엔진이 정한다');
}
const html = fs.readFileSync(path.join(__dirname, '../ios-reference/index.html'), 'utf8');
const a = html.indexOf('var SHOP_DATA={');
const bMark = 'var _shopSlotIdx=_curShopSlot();';
const b = html.indexOf(bMark, a);
if (a < 0 || b < 0) { console.log('FAIL 웹 쇼핑 코드를 못 찾음'); process.exit(1); }
const slice = html.slice(a, b + bMark.length);

function webRun(nowMs, wx, cfg) {
  const NOW = nowMs;
  class MD extends Date { constructor(...x) { if (x.length) super(...x); else super(NOW); } static now() { return NOW; } }
  const ctx = { window: {}, Date: MD, console, Math, Object, String, Array, JSON, RegExp, Error, document: { getElementById() { return null; } } };
  ctx.window._srvShopCfg = cfg || null;
  ctx._wxMem = wx ? { k: { ts: 1, data: { temp: wx.temp, rain: wx.rain } } } : {};
  vm.createContext(ctx);
  vm.runInContext(slice + '\n;this.__r={pick:_shopPick(),data:SHOP_DATA,cats:SHOP_CATS};', ctx);
  return ctx.__r;
}
const urls = l => l.map(x => x.u).join('|');


// ── 비 안 오는 날엔 우산·레인부츠 류를 추천하지 않는다 / 날마다 추천이 달라진다 ──
{
  const mk = (c, names) => ({ c, items: names.map((n, i) => ({ n, u: 'https://shop.test/' + c + i, i: 'https://img.test/' + c + i })) });
  const D = {
    CATS: [mk('패션', ['접이식 레인부츠', '3단 자동우산', '우비 판초', '방수 백팩커버', '신발 방수커버', '니트 가디건', '워커 부츠', '맨투맨']), mk('생활', ['에코백', '핸드크림', '텀블러', '보온병', '핫팩', '무릎담요', '가습기', '보조배터리'])],
    WEEKDAY: [{ h1: 0, h2: 12, items: [{ t: '우천대비', u: 'https://shop.test/패션1' }, { t: '우천대비', u: 'https://shop.test/패션0' }] }, { h1: 12, h2: 24, items: [{ t: '셀프케어', u: 'https://shop.test/생활1' }] }],
    WEEKEND: [{ h1: 0, h2: 24, items: [{ t: '우천대비', u: 'https://shop.test/패션1' }] }]
  };
  const GEAR = /우산|레인|장화|우비|판초|빗물|방수/;
  const at = (mo, d, h) => Date.UTC(2026, mo - 1, d, h - 9, 0);                    // KST
  for (const [label, wx] of [['맑음 20%', { temp: 14, rain: 20, txt: '맑음' }], ['비 0%', { temp: 14, rain: 0 }], ['날씨 못 받음', null]]) {
    for (const [mo, d, h] of [[10, 27, 6], [10, 27, 22], [10, 24, 14], [10, 25, 8]]) {                      // 평일 아침·밤 · 토·일
      const pk = E.shopPick(D, E.shopClock(at(mo, d, h), 540), wx, null);
      ok(pk.rec.slice(0, 8).every(x => !GEAR.test(x.n) && x._t !== '우천대비'), `${label} ${mo}/${d} ${h}시: 추천 위쪽에 우산·레인부츠가 없다 → ` + pk.rec.slice(0, 8).map(x => x.n).join(','));
    }
  }
  const wetPk = E.shopPick(D, E.shopClock(at(10, 27, 6), 540), { temp: 14, rain: 80, txt: '비' }, null);
  ok(wetPk.rec.slice(0, 5).some(x => GEAR.test(x.n)), '비 올 땐(80%) 우산류가 위로 올라온다: ' + wetPk.rec.slice(0, 5).map(x => x.n).join(','));
  const txtPk = E.shopPick(D, E.shopClock(at(10, 27, 6), 540), { temp: 14, rain: 10, txt: '소나기' }, null);
  ok(txtPk.rec.slice(0, 5).some(x => GEAR.test(x.n)), '날씨 글에 소나기가 있으면 확률이 낮아도 우산류 허용');
  // 날마다 1등이 같지 않다(같은 요일 같은 시각, 며칠에 걸쳐)
  const tops = new Set(); for (let d = 1; d <= 14; d++) tops.add(E.shopPick(D, E.shopClock(at(10, d, 22), 540), { temp: 14, rain: 0 }, null).rec.slice(0, 3).map(x => x.n).join('|'));
  ok(tops.size >= 5, '며칠에 걸쳐 추천 윗줄이 바뀐다: ' + tops.size + '가지');
  const sameDay = E.shopPick(D, E.shopClock(at(10, 27, 22), 540), { temp: 14, rain: 0 }, null), sameDay2 = E.shopPick(D, E.shopClock(at(10, 27, 22), 540), { temp: 14, rain: 0 }, null);
  ok(urls(sameDay.rec) === urls(sameDay2.rec), '같은 날 같은 조건이면 같은 결과(결정적)');
}


// ── alts: 모든 카테고리 화면을 한 번에 — 각각 따로 요청한 것과 글자 하나까지 같다 ──
{
  const mk = (c, n) => ({ c, items: Array.from({ length: n }, (_, i) => ({ n: c + ' 상품' + i, u: 'https://shop.test/' + c + i, i: 'https://img.test/' + c + i })) });
  const D = { CATS: [mk('식사', 12), mk('패션', 12), mk('생활', 12)], WEEKDAY: [{ h1: 0, h2: 24, items: [{ t: '야식', u: 'https://shop.test/식사0' }] }], WEEKEND: [{ h1: 0, h2: 24, items: [] }] };
  const now = Date.UTC(2026, 9, 27, 13, 0), wx = { temp: 12, rain: 10, txt: '맑음' };
  for (const cap of [0, 2]) for (const cat of ['', '식사', '패션', '없는분류']) {
    const all = E.shopScreen({ nowMs: now, cat, cap, alts: true }, D, null, wx);
    ok(all.ok && all.alts && typeof all.alts === 'object', `alts 가 온다 cap${cap} cat[${cat}]`);
    const names = Object.keys(all.alts);
    ok(!names.includes(all.cat) && names.length === 3, `alts 는 지금 카테고리를 뺀 나머지 전부 ${names}`);
    for (const c of names) {
      const one = E.shopScreen({ nowMs: now, cat: c, cap }, D, null, wx);
      ok(JSON.stringify(one) === JSON.stringify(all.alts[c]), `alts[${c}] = 따로 요청한 화면 cap${cap}`);
    }
    const base = E.shopScreen({ nowMs: now, cat, cap }, D, null, wx), cp = Object.assign({}, all); delete cp.alts;
    ok(JSON.stringify(base) === JSON.stringify(cp), 'alts 를 빼면 지금 카테고리 화면은 그대로');
    ok(!('alts' in base), 'alts 를 안 묻으면 안 준다');
  }
}

const cases = [];
const tsList = [
  Date.UTC(2026, 9, 18, 3, 10), Date.UTC(2026, 9, 18, 13, 0), Date.UTC(2026, 0, 14, 23, 30), Date.UTC(2026, 6, 4, 6, 5),
  Date.UTC(2026, 3, 11, 9, 59), Date.UTC(2026, 8, 20, 22, 0), Date.UTC(2026, 10, 25, 0, 0), Date.UTC(2026, 1, 22, 15, 0),
  Date.UTC(2026, 11, 31, 14, 59), Date.UTC(2026, 4, 17, 11, 11)
];
const wxs = [null, { temp: 3, rain: 10 }, { temp: 31, rain: 0 }, { temp: 17, rain: 80 }, { temp: -8, rain: 40 }, { temp: 12.5, rain: 33 }];
const cfgs = [null, { kw: { winter: '패딩|기모', summer: '반팔|선풍기', spring: '가디건', fall: '후드' }, w: { cur: 80, next: 0.5, opp: -60, rain: 100, temp: 90 } }, { kw: {} }];
tsList.forEach((t, i) => wxs.forEach((w, j) => { cases.push([t, w, cfgs[(i + j) % 3]]); }));

let first = null;
cases.forEach(([t, w, cfg]) => {
  const W = webRun(t, w, cfg);
  if (!first) first = W;
  const data = { WEEKDAY: W.data.WEEKDAY, WEEKEND: W.data.WEEKEND, CATS: W.cats };
  const ck = E.shopClock(t, 540);
  const P = E.shopPick(data, ck, w, cfg);
  const tag = new Date(t).toISOString() + ' ' + JSON.stringify(w) + ' cfg' + (cfg ? (cfg.kw && Object.keys(cfg.kw).length ? 'A' : 'empty') : '-');
  ok(urls(P.rec) === urls(W.pick.rec), '추천 100선 다름 ' + tag);
  ok(P.rec.length === W.pick.rec.length, '추천 개수 ' + tag);
  let same = true;
  W.pick.order.forEach(cn => { if (urls(P.byCat[cn]) !== urls(W.pick.byCat[cn])) same = false; });
  ok(same, '카테고리 순서 다름 ' + tag);
  ok(P.order.join() === W.pick.order.join(), '카테고리 목록 ' + tag);
});
console.log('동등성 대조 ' + cases.length + '건');

// ② 화면 JSON
{
  const W = first;
  const data = { WEEKDAY: W.data.WEEKDAY, WEEKEND: W.data.WEEKEND, CATS: W.cats };
  const t = Date.UTC(2026, 9, 18, 3, 10);
  const s = E.shopScreen({ nowMs: t, tzOffsetMin: 540 }, data, null, { temp: 14, rain: 20 });
  ok(s.ok && s.v === 1 && s.screen === 'shop', '기본 화면');
  ok(s.cat === '추천', '기본 카테고리 추천');
  const chips = s.head[0];
  ok(chips.t === 'chips' && chips.items.length === 1 + W.cats.length, '칩 수');
  ok(chips.items[0].on && chips.items[0].badge === '100', '추천 칩 켜짐·100');
  ok(chips.items.filter(c => c.on).length === 1, '켜진 칩 1개');
  const grid = s.body[0];
  ok(grid.t === 'grid' && grid.cols === 2 && grid.items.length === 100, '추천 카드 100');
  ok(grid.items.every(c => c.act.a === 'open' && /^https?:/.test(c.act.url) && c.name), '카드 행동·이름');
  ok(s.body.some(n => n.t === 'button' && n.act.a === 'refresh'), '새로고침 버튼');
  ok(s.body.some(n => n.t === 'text' && /쿠팡 파트너스/.test(n.s)), '파트너스 문구');
  const c1 = W.cats[1].c;
  const s2 = E.shopScreen({ nowMs: t, cat: c1 }, data, null, { temp: 14, rain: 20 });
  ok(s2.cat === c1 && s2.head[0].items.find(c => c.on).label.replace(/^\S+ /, '') === c1, '카테고리 선택');
  ok(s2.body[0].items.length === W.cats[1].items.filter(x => /^https?:/.test(x.u)).length, '카테고리 카드 수');
  ok(s2.seed === s.seed, '같은 시각이면 같은 시드(카테고리 바꿔도 순서 일관)');
  const s3 = E.shopScreen({ nowMs: t, cat: '없는카테고리' }, data, null, null);
  ok(s3.cat === '추천', '없는 카테고리는 추천');
  { // s273 순환표

    // s273: 순환표(sw.t · sw.k) — 칸마다의 다음·이전이 칩 순서와 같고, 이 화면의 l·r 과 같은 표에서 나온다(앱은 '고른 칸'으로 찾아보기만 한다)
    function swTableOk(S, chips, m) {
      const n = chips.length, t = S.sw && S.sw.t, on = chips.find(c => c.on);
      ok(!!t && Object.keys(t).length === n && S.sw.k === on.act.v, m + ': 표 크기 · 이 화면의 칸(k)');
      ok(chips.every((c, i) => t[c.act.v] && t[c.act.v].l.v === chips[(i + 1) % n].act.v && t[c.act.v].r.v === chips[(i - 1 + n) % n].act.v && t[c.act.v].l.a === 'cat'), m + ': 칸마다 왼쪽 = 다음 · 오른쪽 = 이전(끝없이 돈다)');
      ok(S.sw.l.v === t[S.sw.k].l.v && S.sw.r.v === t[S.sw.k].r.v, m + ': l·r 은 표의 k 칸과 같다');
      // 다음 칸 화면이 오기 전에 계속 밀어도 한 바퀴 돌아 제자리
      let k = S.sw.k; for (let i = 0; i < n; i++) k = t[k].l.v; ok(k === S.sw.k, m + ': 왼쪽으로 n 번 = 제자리');
    }
    swTableOk(s3, s3.head[0].items, 'shop 추천'); swTableOk(s2, s2.head[0].items, 'shop 가운데 칩');
  }
  { // s264 좌우 밀기(sw): 끝없이 돈다(처음에서 오른쪽 = 마지막 칩 · 끝에서 왼쪽 = 처음 칩)
    ok(s3.sw && s3.sw.l && s3.sw.l.a === 'cat' && s3.sw.r && s3.sw.r.a === 'cat' && s3.sw.r.v === s.head[0].items[s.head[0].items.length - 1].act.v && s3.sw.l.v === s.head[0].items[1].act.v, 'sw: 처음 칩(추천)에서는 왼쪽 = 다음 칩 · 오른쪽 = 마지막 칩(돈다)');
    { const it = s.head[0].items, k2 = it.findIndex(c => c.on === false && c.act.v === c1); ok(s2.sw && s2.sw.r && s2.sw.r.v === it[k2 - 1].act.v && s2.sw.l.v === it[k2 + 1].act.v, 'sw: 가운데 칩에서 오른쪽 = 앞 칩 · 왼쪽 = 뒤 칩'); }
    const nCats = s.head[0].items.length, lastC = s.head[0].items[nCats - 1].act.v;
    const sl = E.shopScreen({ nowMs: t, cat: lastC }, data, null, { temp: 14, rain: 20 });
    ok(sl.sw && sl.sw.l && sl.sw.l.v === s.head[0].items[0].act.v && sl.sw.r && sl.sw.r.v === s.head[0].items[nCats - 2].act.v, 'sw: 마지막 칩에서는 왼쪽 = 처음 칩(돈다)');
  }
  ok(!E.shopScreen({ nowMs: t }, { WEEKDAY: [], CATS: [] }, null, null).ok, '자료 없으면 ok:false');
  const bad = JSON.parse(JSON.stringify(data)); bad.CATS[0].items[0].u = 'javascript:alert(1)'; bad.CATS[0].items[1].i = 'file:///x';
  const s4 = E.shopScreen({ nowMs: t, cat: bad.CATS[0].c }, bad, null, null);
  ok(!s4.body[0].items.some(c => /javascript:/.test(c.act.url)), '위험한 링크는 싣지 않음');
  ok(!s4.body[0].items.some(c => c.img && !/^https?:/.test(c.img)), '위험한 이미지 주소 제외');
  ok(JSON.stringify(s).length < 60000, '추천 화면 JSON 크기 ' + JSON.stringify(s).length);
  // cap 없음(옛 앱) = 예전 모양 그대로: 칩만, cover 없음
  ok(s.head.length === 1 && s.head[0].t === 'chips' && s.cover === undefined, 'cap 없으면 옛 모양(칩만, cover 없음)');
  // cap=2(새 앱): 안내 상자 + 검색줄 + 칩
  const c2 = E.shopScreen({ nowMs: t, tzOffsetMin: 540, cap: 2 }, data, null, { temp: 14, rain: 20 });
  ok(c2.cover === 'tab' && c2.head.map(n => n.t).join() === 'box,search,chips', 'cap=2: 상자·검색줄·칩 + cover=tab');
  ok(JSON.stringify(c2.body) === JSON.stringify(s.body) && JSON.stringify(c2.head[2]) === JSON.stringify(s.head[0]), 'cap 이 있어도 본문·칩은 같다(추천 계산은 그대로)');
  const bxn = c2.head[0];
  ok(/쿠팡 파트너스 활동/.test(bxn.s) && /수수료를 제공받습니다/.test(bxn.s), '대가성 문구가 상자에 있다(공정위 표시)');
  ok(bxn.hl.length === 2 && bxn.s.slice(bxn.hl[0][0], bxn.hl[0][1]) === '쿠팡 파트너스 활동' && bxn.s.slice(bxn.hl[1][0], bxn.hl[1][1]) === '일정액의 수수료를 제공받습니다.', '굵은 구간이 웹과 같은 두 곳');
  const sch = c2.head[1];
  ok(sch.act.a === 'search' && sch.act.tpl === 'https://www.coupang.com/np/search?q={q}' && sch.act.empty === 'https://coupa.ng/coRT4D', '검색 주소·파트너스 링크는 엔진이 정한다');
  ok(sch.hint === '쿠팡에서 검색' && sch.maxlen === 60 && sch.max === 340, '검색줄 힌트·길이·폭(웹과 같다)');
  // 웹(index.html)의 안내 문구와 검색 주소·파트너스 링크가 엔진 값과 같은가(옛 웹 폴백과 어긋나면 수수료 링크가 달라진다)
  ok(html.indexOf("var _COUPANG_PARTNER_URL = 'https://coupa.ng/coRT4D'") > 0, '웹의 파트너스 링크 = 엔진 값');
  ok(html.indexOf("https://www.coupang.com/np/search?q=' + encodeURIComponent(q)") > 0, '웹의 기본 검색 주소 = 엔진 tpl 과 같은 형식');
  ok(html.indexOf('이 페이지의 상품 링크는 <b>쿠팡 파트너스 활동</b>의 일환으로,') > 0 && html.indexOf('<b>일정액의 수수료를 제공받습니다.</b>') > 0, '웹 안내 문구 = 엔진 문구(굵은 곳 포함)');
  // 워커 쿼리: cap 읽기
  const wsrc = fs.readFileSync(path.join(__dirname, '../engine/shop-worker.js'), 'utf8');
  ok(/cap: Number\(q\.get\("cap"\)\) \|\| 0/.test(wsrc), '워커가 cap 쿼리를 읽는다');
}

// ③ 워커 내장 사본
{
  const wp = path.join(__dirname, '../engine/route-v2-worker.ascii.js');
  const w = fs.readFileSync(wp, 'utf8');
  const ms = '// ===== SHOP ENGINE BEGIN =====', me = '// ===== SHOP ENGINE END =====';
  const i = w.indexOf(ms), j = w.indexOf(me);
  if (i < 0) console.log('  (워커에 쇼핑 엔진 아직 없음 — 건너뜀)');
  else {
    const esc = s => s.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    let src = fs.readFileSync(path.join(__dirname, '../engine/shop.js'), 'utf8');
    src = src.slice(0, src.indexOf('if (typeof module')).trimEnd();
    // 정규식 안의 한글은 \u 이스케이프해도 같은 뜻이다
    const body = w.slice(i + ms.length, j);
    ok(body.indexOf(esc(src)) >= 0, '워커 내장 사본이 engine/shop.js 와 같다');
  }
}
// ④ 워커 끝에서 끝까지: 가짜 쇼핑 서버·날씨로 GET /screen/shop 을 불러 본다
(async () => {
  const wp = path.join(__dirname, '../engine/route-v2-worker.ascii.js');
  const tmp = path.join(require('os').tmpdir(), 'rv2_shop_' + process.pid + '.mjs');
  fs.copyFileSync(wp, tmp);
  const W = first;
  const data = { WEEKDAY: W.data.WEEKDAY, WEEKEND: W.data.WEEKEND, CATS: W.cats };
  let weatherAsked = 0;
  globalThis.fetch = async (u) => {
    u = String(u);
    if (u.includes('gildongmu-shop')) return new Response(JSON.stringify({ ok: true, version: 't1', data }));
    if (u.includes('app-config')) return new Response(JSON.stringify({ ok: false }));
    if (u.includes('api.open-meteo.com')) { weatherAsked++; return new Response(JSON.stringify({ current: { time: '2026-10-18T12:00', temperature_2m: 4, weather_code: 61 }, hourly: { time: ['2026-10-18T12:00'], precipitation_probability: [70] }, daily: {} })); }   // s219: 날씨는 Open-Meteo 직접
    return new Response('{}', { status: 404 });
  };
  try {
    const mod = await import(tmp);
    const w = mod.default;
    const t = Date.UTC(2026, 9, 18, 3, 10);
    const r = await w.fetch(new Request('https://x/screen/shop?lat=37.5&lng=127&now=' + t), {}, { waitUntil() {} });
    const j = await r.json();
    ok(r.status === 200 && j.ok && j.screen === 'shop', '워커 응답 200');
    ok(/route-v2-2026-10-\d\ds\d\d/.test(j.ver), '엔진 버전 표시 ' + j.ver);
    ok(weatherAsked >= 1, '위치를 주면 엔진이 날씨를 받는다');
    const direct = E.shopScreen({ nowMs: t }, data, null, { temp: 4, rain: 70 });
    ok(JSON.stringify(j.body[0].items.map(c => c.act.url)) === JSON.stringify(direct.body[0].items.map(c => c.act.url)), '워커와 직접 계산이 같은 결과');
    const rc = await w.fetch(new Request('https://x/screen/shop?cap=2&now=' + t), {}, { waitUntil() {} });
    const jc = await rc.json();
    ok(jc.cover === 'tab' && jc.head.map(n => n.t).join() === 'box,search,chips', '워커: cap=2 이면 상자·검색줄 포함');
    ok(!j.cover && j.head.length === 1, '워커: cap 없으면 옛 모양');
    const r2 = await w.fetch(new Request('https://x/screen/shop?cat=' + encodeURIComponent(W.cats[2].c) + '&now=' + t), {}, { waitUntil() {} });
    const j2 = await r2.json();
    ok(j2.cat === W.cats[2].c, '워커 카테고리 선택');
    globalThis.fetch = async () => new Response('x', { status: 500 });
    // 상품 서버가 죽어도 마지막으로 받은 것이 60초 안에는 그대로 쓰인다
    const r3 = await w.fetch(new Request('https://x/screen/shop?now=' + t), {}, { waitUntil() {} });
    ok(r3.status === 200, '서버 장애여도 직전 자료로 응답');
    // 처음 켜질 때 쇼핑 서버가 한 번 실패해도 한 번 더 받아 화면을 준다(새 인스턴스 = 메모리 비어 있음)
    const mod2 = await import(tmp + '?fresh=1');
    let shopCalls = 0;
    globalThis.fetch = async (u) => {
      u = String(u);
      if (u.includes('gildongmu-shop')) { shopCalls++; return shopCalls === 1 ? new Response('x', { status: 503 }) : new Response(JSON.stringify({ ok: true, version: 't2', data })); }
      return new Response(JSON.stringify({ ok: false }));
    };
    const r4 = await mod2.default.fetch(new Request('https://x/screen/shop?now=' + t), {}, { waitUntil() {} });
    ok(r4.status === 200 && shopCalls === 2, '첫 실패 뒤 한 번 더 시도해 화면을 준다(호출 ' + shopCalls + ')');
    // 쇼핑 서버가 계속 안 되면 503 + 엔진이 주는 안내 화면(서버 연결 지연 · 재시도 간격)
    const mod3 = await import(tmp + '?fresh=2');
    globalThis.fetch = async () => new Response('x', { status: 503 });
    const r5 = await mod3.default.fetch(new Request('https://x/screen/shop?now=' + t), {}, { waitUntil() {} });
    const j5 = await r5.json();
    ok(r5.status === 503 && j5.ok === true && j5.delayed === true && j5.screen === 'shop' && Array.isArray(j5.retry) && j5.retry.length >= 3 && j5.retry.every(n => n >= 1 && n <= 120), '서버가 계속 안 되면 503 + 안내 화면 + 재시도 간격');
    ok(/서버 연결이 지연되고 있습니다/.test(JSON.stringify(j5.body)) && j5.body.some(n => n.t === 'button' && n.act.v === 'gdm_retry') && r5.headers.get('cache-control') === 'no-store', '안내 문구 · 다시 시도 단추 · 캐시 금지');
    ok(j5.body.some(n => n.t === 'text' && /HTTP 503/.test(n.s)), '안내 화면에 못 받은 이유(HTTP 503)가 작게 붙는다');
    // 워커끼리 부르는 길이 막혀도(예: error code 1042) 앱이 직접 받아 POST 로 실어 보내면 화면이 뜬다(계산은 엔진)
    const mod4 = await import(tmp + '?fresh=3');
    globalThis.fetch = async () => { throw new Error('error code: 1042'); };
    const rg = await mod4.default.fetch(new Request('https://x/screen/shop?now=' + t), {}, { waitUntil() {} });
    const jg = await rg.json();
    ok(rg.status === 503 && jg.body.some(n => n.t === 'text' && /1042/.test(n.s)), '워커끼리 호출이 막히면 안내 화면에 이유(1042)가 보인다');
    const rp = await mod4.default.fetch(new Request('https://x/screen/shop', { method: 'POST', body: JSON.stringify({ cap: 2, cat: '', now: t, shop: { ok: true, version: 'p1', data }, cfg: { ok: false } }) }), {}, { waitUntil() {} });
    const jp = await rp.json();
    ok(rp.status === 200 && jp.ok && jp.screen === 'shop' && jp.cover === 'tab' && jp.shopVer === 'p1', '앱이 실어 보낸 상품 자료로 화면을 만든다(POST)');
    const rb = await mod4.default.fetch(new Request('https://x/screen/shop', { method: 'POST', body: 'not json' }), {}, { waitUntil() {} });
    ok(rb.status === 400, 'POST 본문이 깨졌으면 400');
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  console.log(`shop_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
