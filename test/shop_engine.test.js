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
  ok(s2.cat === c1 && s2.head[0].items.find(c => c.on).label === c1, '카테고리 선택');
  ok(s2.body[0].items.length === W.cats[1].items.filter(x => /^https?:/.test(x.u)).length, '카테고리 카드 수');
  ok(s2.seed === s.seed, '같은 시각이면 같은 시드(카테고리 바꿔도 순서 일관)');
  const s3 = E.shopScreen({ nowMs: t, cat: '없는카테고리' }, data, null, null);
  ok(s3.cat === '추천', '없는 카테고리는 추천');
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
    if (u.includes('/weather')) { weatherAsked++; return new Response(JSON.stringify({ ok: true, temp: 4, rain: 70, txt: '비' })); }
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
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  console.log(`shop_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
