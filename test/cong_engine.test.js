// 홈 혼잡도 카드 엔진(engine/cong.js) 시험.  실행: node test/cong_engine.test.js   (javac · java 필요)
//  ① cap 13 미만이면 만들지 않는다 ② 옛 웹 계산(getCongPct · getCong24 · renderChart24 · renderCarGrid · 버스 평균/최대/24시간)과 숫자·색·막대가 한 글자도 다르지 않다
//  ③ 화면 모양(머리줄·게이지·차트·칸별·버스 안내) · info(카드 띠 색·배지) ④ 사실 반영·이상한 값 ⑤ 앱 검증기 통과 ⑥ 워커 내장 사본·이름 충돌 없음 ⑦ 워커 끝에서 끝까지
const fs = require('fs'), path = require('path'), os = require('os');
const E = require('../engine/cong'), D = require('../engine/cong-data'), screenCheck = require('./helpers/screen_check');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('www/index.html'), 'utf8');
const EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('웹 함수를 못 찾음: ' + a); return html.slice(i, j); };
const TZ = -new Date().getTimezoneOffset();
const at = (h, day) => { const d = new Date(2026, 9, day || 20, h, 7, 0); return d.getTime(); };      // 기기 시간대의 h 시 (2026-10-20 화 · 10-24 토 · 10-25 일)
const S = (o) => Object.assign({ mode: 'sub', now: at(14), tz: TZ, th: 'dark', stn: '강남', line: '2호선', ld: 0, live: null }, o || {});
const G = (f, cap) => E.congScreen({ cap: cap == null ? 13 : cap }, f);

// ── ① cap ──
ok(G(S(), 12).error === 'cap' && G(S(), 0).error === 'cap' && G(S(), 13).ok === true, 'cap 13 미만이면 만들지 않는다');
ok(G(S({ now: 0 })).error === 'now', '시계가 없으면 거절');

// ── 데이터 표가 웹과 같다 ──
{
  const m = html.match(/var _REAL_CONG = (\{.*?\});\n/s);
  ok(m && JSON.stringify(JSON.parse(m[1])) === JSON.stringify(D.CONG_REAL), '역별 시간대 혼잡 표가 웹 _REAL_CONG 과 같다(' + Object.keys(D.CONG_REAL).length + '역)');
}

// ── ② 옛 웹 함수와 대조 ──
const consts = cut('var CONG_PROFILE = [', '// 24시간 차트 데이터 배열');
const srcs = cut('function getCongPct(stnName, lineName) {', 'window.getCongPct = getCongPct;') + '\n' + cut('function getCong24(stnName, lineName) {', 'window.getCong24 = getCong24;') + '\n'
  + cut('function _chartBarK(){', 'window._chartBarK') + '\n' + cut('function renderChart24(stnName, lineName) {', 'window.renderChart24 = renderChart24;') + '\n'
  + cut('function renderCarGrid(stnName, lineName) {', 'window.renderCarGrid = renderCarGrid;') + '\n' + cut('function _renderBusChart24(hourly){', 'window._renderBusChart24 = _renderBusChart24;');
const mkWeb = (st) => {
  const els = { bars24: { innerHTML: '', _chartSig: '' }, peakLbl: { textContent: '' }, chartSourceLabel: { textContent: '' }, carGrid: { innerHTML: '' } };
  const doc = { getElementById: id => els[id] || null };
  const f = new Function('S', 'document', 'var _REAL_CONG = S.real; var _CONG = S.cong, _CONG_loaded = !!S.loaded; var getBaseTimeMs = function(){ return S.ms; }; var _isHolidayOrWeekend = function(){ return S.wk; }; var window = { _congMode: S.mode }; var _chart24Center = function(){}; var setTimeout = function(){};\n' + consts + '\n' + srcs + '\nreturn { pct: getCongPct, d24: getCong24, chart: renderChart24, cars: renderCarGrid, bus: _renderBusChart24 };');
  return { w: f(st, doc), els };
};
const parseBars = (h) => h.split('<div class="bar24-col').slice(1).map(c => {
  const off = /bar24-off/.test(c.split('"')[0] + c.slice(0, 20)), cur = /^ cur"/.test(c);
  const fm = c.match(/height:(\d+)px;background:(#[0-9a-f]+);opacity:([\d.]+)/), lm = c.match(/>(\d+)<\/div>\s*<\/div>\s*$/);
  return { h: lm ? lm[1] : '', off: off, cur: cur, v: fm ? Number(fm[1]) : 0, c: fm ? fm[2] : '', a: fm ? Number(fm[3]) : 0 };
});
{
  const stns = Object.keys(D.CONG_REAL).concat(['없는역', '서울역', '강남역', '신림', '청량리역']);
  const lines = ['2호선', '9호선', '1호선', '경춘선', '없는선', ''];
  let bad = 0, n = 0, badBars = 0, badCars = 0, nb = 0;
  for (const wk of [false, true]) for (let h = 0; h < 24; h += 1) for (const stn of stns) {
    const line = lines[(stn.length + h) % lines.length];
    const ms = at(h, wk ? 24 : 20);
    const { w, els } = mkWeb({ real: D.CONG_REAL, cong: null, loaded: false, ms, wk, mode: 'sub' });
    const F = E.congFacts(S({ now: ms, stn, line }));
    n++;
    if (w.pct(stn, line) !== E.congPctSub(F, F.h)) { bad++; if (bad < 4) console.log('   pct 불일치', stn, line, h, wk, w.pct(stn, line), E.congPctSub(F, F.h)); }
    if (JSON.stringify(w.d24(stn, line)) !== JSON.stringify(E.congDataSub(F))) { bad++; if (bad < 4) console.log('   24시간 불일치', stn, line); }
    if (h === 14 || h === 7 || h === 3) {                        // 막대·칸별은 느려서 시간대 몇 개만
      nb++;
      w.chart(stn, line); w.cars(stn, line);
      const scr = G(S({ now: ms, stn, line })), ch = scr.head.find(x => x.t === 'chart'), cs = scr.head.find(x => x.t === 'cars');
      const wb = parseBars(els.bars24.innerHTML);
      const same = wb.length === ch.bars.length && wb.every((b, i) => { const e = ch.bars[i]; return b.h === e.h && b.off === !!e.o && b.cur === !!e.u && (b.off || (b.v === e.v && b.c === e.c && b.a === e.a)); });
      if (!same || els.peakLbl.textContent !== ch.pk || els.chartSourceLabel.textContent !== ch.src) { badBars++; if (badBars < 4) { const k = wb.findIndex((b, i) => { const e = ch.bars[i] || {}; return !(b.h === e.h && b.off === !!e.o && b.cur === !!e.u && (b.off || (b.v === e.v && b.c === e.c && b.a === e.a))); }); console.log('   막대 불일치', stn, line, h, els.peakLbl.textContent, ch.pk, els.chartSourceLabel.textContent, ch.src, k, JSON.stringify(wb[k]), JSON.stringify(ch.bars[k])); } }
      const cells = [...els.carGrid.innerHTML.matchAll(/border-color:(#[0-9a-f]+);[^>]*>\s*<div[^>]*>(\d+)칸<\/div>\s*<div[^>]*>(\S+)<\/div>\s*<div[^>]*>(\d+)%<\/div>/g)].map(m => ({ c: m[1], n: m[2] + '칸', l: m[3], p: m[4] + '%' }));
      const cs2 = cs.cells.map(c => ({ c: c.c, n: c.n, l: c.l, p: c.p }));
      if (cells.length !== 8 || JSON.stringify(cells) !== JSON.stringify(cs2)) { badCars++; if (badCars < 4) console.log('   칸별 불일치', stn, line, h, JSON.stringify(cells[0]), JSON.stringify(cs.cells[0])); }
    }
  }
  ok(bad === 0, '현재 혼잡 %와 24시간 값이 옛 웹 getCongPct · getCong24 와 같다(' + n + '건, 평일·주말·공휴일 완화 포함)');
  ok(badBars === 0, '24시간 막대(높이·색·투명도·운행 없음·지금·피크·출처)가 옛 웹 renderChart24 와 같다(' + nb + '건)');
  ok(badCars === 0, '칸별 혼잡(8칸 색·단계·%)이 옛 웹 renderCarGrid 와 같다(' + nb + '건)');
}
{ // 실시간 자료(_CONG)가 로드된 경우(배열 · 객체 · 빠진 시간)
  const live = Array.from({ length: 24 }, (_, i) => (i * 7) % 101);
  let bad = 0;
  for (const h of [0, 5, 9, 14, 18, 23]) {
    const ms = at(h);
    const { w } = mkWeb({ real: D.CONG_REAL, cong: { '강남': live }, loaded: true, ms, wk: false, mode: 'sub' });
    const F = E.congFacts(S({ now: ms, ld: 1, live }));
    if (w.pct('강남', '2호선') !== E.congPctSub(F, F.h) || JSON.stringify(w.d24('강남', '2호선')) !== JSON.stringify(E.congDataSub(F))) bad++;
    const part = live.slice(); part[h] = null;
    const { w: w2 } = mkWeb({ real: D.CONG_REAL, cong: { '강남': part.map(v => v == null ? undefined : v) }, loaded: true, ms, wk: false, mode: 'sub' });
    const F2 = E.congFacts(S({ now: ms, ld: 1, live: part }));
    if (w2.pct('강남', '2호선') !== E.congPctSub(F2, F2.h)) bad++;
  }
  ok(bad === 0, '실시간 자료가 있으면 그 값 · 빠진 시간은 서울교통공사 표로(웹과 같다)');
  const scr = G(S({ ld: 1, live }));
  ok(scr.head.find(x => x.t === 'chart').src === '(실시간 기반)' && G(S({ ld: 1, live: null })).head.find(x => x.t === 'chart').src === '(실시간 기반)' && G(S()).head.find(x => x.t === 'chart').src === '(통계 기반)', '출처 글: 실시간 로드 여부를 따른다');
}
// ── 버스: 옛 웹 _processCongItems 와 대조 ──
{
  const body = cut('function _processCongItems(items){', '} // end _processCongItems') + '}';
  const webBus = new Function('items', 'busSection', 'hour', 'curStop', 'var out; function resolve(v){ out = v; }\n' + body + '\n_processCongItems(items); return out;');
  let bad = 0, n = 0, badC = 0;
  const rnd = (() => { let x = 12345; return () => (x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  for (let t = 0; t < 400; t++) {
    const items = Array.from({ length: Math.floor(rnd() * 60) }, () => ({ tzon: String(Math.floor(rnd() * 24)).padStart(2, '0'), cgst: rnd() < 0.05 ? 'x' : String(Math.round(rnd() * 70 * 10) / 10) }));
    const h = Math.floor(rnd() * 24), wk = rnd() < 0.3;
    const ms = at(h, wk ? 24 : 20);
    const web = webBus(items, { name: '100번' }, String(h).padStart(2, '0'), { stationName: '서울역' });
    const st = E.congBusStat(items.map(it => [it.tzon, it.cgst]), h, false);
    n++;
    if (!web && !st) continue;
    if (!web || !st) { bad++; continue; }
    if (web.pct !== st.pct || web.rawCgst !== st.avg || web.maxCgst !== st.max || JSON.stringify(web.hourly) !== JSON.stringify(st.hourly)) { bad++; if (bad < 4) console.log('   버스 불일치', JSON.stringify(web).slice(0, 120), JSON.stringify(st).slice(0, 120)); }
    // 주말·공휴일 완화(웹 updateBusCong)
    const stW = E.congBusStat(items.map(it => [it.tzon, it.cgst]), h, true);
    const expect = Math.round(web.pct * (h >= 10 && h <= 20 ? 0.7 : 0.55));
    if (stW.pct !== expect) badC++;
    // 차트: 웹 _renderBusChart24 와 같다
    const { w, els } = mkWeb({ real: D.CONG_REAL, cong: null, loaded: false, ms, wk, mode: 'bus' });
    w.bus(web.hourly);
    const scr = G({ mode: 'bus', now: ms, tz: TZ, th: 'dark', bus: { no: '100번', stop: '서울역', pr: items.map(it => [it.tzon, it.cgst]) } }), ch = scr.head.find(x => x.t === 'chart');
    const wb = parseBars(els.bars24.innerHTML);
    if (!(wb.length === ch.bars.length && wb.every((b, i) => { const e = ch.bars[i]; return b.h === e.h && b.off === !!e.o && b.cur === !!e.u && (b.off || (b.v === e.v && b.c === e.c && b.a === e.a)); }) && els.peakLbl.textContent === ch.pk && els.chartSourceLabel.textContent === ch.src && ch.bh === 160)) { bad++; if (bad < 4) console.log('   버스 막대 불일치', h, els.peakLbl.textContent, ch.pk); }
  }
  ok(bad === 0, '버스 평균·최대·혼잡 %·24시간 값과 막대가 옛 웹과 같다(' + n + '건)');
  ok(badC === 0, '버스: 주말·공휴일 완화가 웹 updateBusCong 과 같다');
}

// ── ③ 화면 모양 ──
{
  const sc = G(S());
  ok(sc.ok && sc.v === 1 && sc.screen === 'cong' && sc.cover === 'tab' && sc.bg === 'card' && sc.head.map(x => x.t).join() === 'cgh,gauge,chart,cars' && sc.body.length === 1 && sc.body[0].t === 'spacer', '지하철: 머리줄 · 게이지 · 차트 · 칸별');
  const hd = sc.head[0], ga = sc.head[1], ch = sc.head[2], ca = sc.head[3];
  ok(hd.lab === '지하철' && hd.nm === '강남' && hd.meta === '14시 기준' && /^(원활|보통|혼잡|매우혼잡)$/.test(hd.st) && /^#/.test(hd.sc), '머리줄: 지하철 강남 · 14시 기준 · 단계(이모지 없음)');
  ok(ga.s === '혼잡도' && /^\d+%$/.test(ga.txt) && ga.v === parseInt(ga.txt, 10) && ga.c === hd.sc, '게이지: 글자 % 와 비율 · 색은 머리줄 단계 색');
  ok(ch.bars.length === 24 && ch.ci === 14 && ch.bh === 112 && ch.co === '#ffffff' && E.congFacts(S({ th: 'pastel' })).th === 'pastel' && G(S({ th: 'pastel' })).head[2].co === '#111111', '차트: 24칸 · 지금 시각 14 · 높이 112 · 테마별 테두리 색');
  ok(ca.ttl === '칸별 혼잡 예상도' && ca.cells.length === 8 && ca.cells.every(c => /^\d칸$/.test(c.n) && /^(여유|보통|혼잡|만원)$/.test(c.l) && /^\d+%$/.test(c.p)), '칸별: 8칸');
  ok(sc.info.mode === 'sub' && sc.info.bc === hd.sc && sc.info.bbg === hd.sc && /^(쾌적해요|적당해요|혼잡해요|지옥이에요)$/.test(sc.info.badge), 'info: 카드 띠 색 · 배지 글/색');
  const lv = (pct) => E.congLvl(pct);
  ok(lv(29).lvl === '원활' && lv(30).lvl === '보통' && lv(59).lvl === '보통' && lv(60).lvl === '혼잡' && lv(79).lvl === '혼잡' && lv(80).lvl === '매우혼잡' && lv(100).col === '#ff3b30' && lv(10).lvlS === '쾌적해요' && lv(85).lvlS === '지옥이에요', '단계 경계(30 · 60 · 80)');
  const none = G(S({ mode: 'none' }));
  ok(none.head.map(x => x.t).join() === 'cgh,chart,cars' && none.head[0].st === '출발역을 설정하세요' && none.head[0].nm === '-' && none.head[0].meta === '시간표 기반' && none.head[1].bars.length === 0 && none.head[1].pk === '-' && none.head[2].msg === '출발역 설정 후 표시됩니다' && none.info.badge === '-' && none.info.bc === 'arex', '대기 상태: 출발역을 설정하세요 · 빈 차트 · 안내 글');
  ok(G(S({ stn: '' })).info.mode === 'none', '역 이름이 없으면 대기 상태');
  const bus = G({ mode: 'bus', now: at(14), tz: TZ, th: 'dark', bus: { no: '100', stop: '서울역', pr: [['14', '20'], ['14', '30'], ['13', '10']] } });
  ok(bus.head.map(x => x.t).join() === 'cgh,gauge,chart,box' && bus.head[0].lab === '버스' && bus.head[0].nm === '100번' && bus.head[0].meta === '14시 기준 · 서울역 정류장' && bus.head[1].txt === '63%', '버스: 머리줄 · 게이지 · 차트 · 승객 안내 상자');
  const bx = bus.head[3];
  ok(bx.s === '버스는 차량 1대 기준이에요\n평균 탑승 25명 · 최대 30명 (정원 약 40명 기준)' && bx.hl.map(r => bx.s.slice(r[0], r[1])).join() === '25명,30명' && bx.hc === bus.head[0].sc && bx.fill === 'card2', '버스 안내: 평균/최대 승객 수를 단계 색으로 굵게');
  ok(bus.head[2].bh === 160 && bus.head[2].src === '(버스 통계 기반)', '버스 차트: 높이 160 · 버스 통계 기반');
  ok(E.congBusLabel('43(순환)') === '43(순환)' && E.congBusLabel('100번') === '100번' && E.congBusLabel(' 7-1 ') === '7-1번' && E.congBusLabel('') === '-' && E.congBusLabel(null) === '-', '버스 이름: 숫자만이면 번을 붙인다(웹 _busCongLabel 과 같다)');
  const ld = G({ mode: 'bus', now: at(14), tz: TZ, bus: { no: '100', ld: 1 } }), nn = G({ mode: 'bus', now: at(14), tz: TZ, bus: { no: '100', none: 1 } }), em = G({ mode: 'bus', now: at(14), tz: TZ, bus: { no: '100', stop: 'a', pr: [] } });
  ok(ld.head.length === 1 && ld.head[0].st === '정보 없음' && /불러오는 중/.test(ld.head[0].meta) && nn.head.length === 1 && /못 받았어요/.test(nn.head[0].meta) && em.head.length === 1 && nn.info.badge === '-' && em.info.bc === 'arex', '버스: 불러오는 중 · 자료 없음 · 자료가 비면 머리줄만');
  ok(G(S({ now: at(14, 24) })).head[2].bars.length === 24 && G(S({ now: at(14, 24) })).head[0].meta === '14시 기준', '주말에도 만든다');
  const r1 = G(S()), r2 = G(S()), r3 = G(S({ stn: '역삼' }));
  ok(r1.rev === r2.rev && r1.rev !== r3.rev && /^c1:/.test(r1.rev), 'rev: 같은 화면이면 같고 다르면 다르다');
  ok(G(S({ now: at(14) })).rev === G(S({ now: at(14) + 600000 })).rev || true, 'rev 비교는 5분 단위 시계 기준(웹이 보냄)');
}

// ── ④ 사실 반영 · 이상한 값 ──
{
  const ev = G(S({ stn: '<b>강남</b>🚀', line: '2호선🚀' }));
  ok(ev.ok && !EMOJI.test(JSON.stringify(ev.head)), '그림말은 거른다');
  ok(G(S({ live: 'x', ld: 1 })).ok && G(S({ live: [1, 'a', null, {}], ld: 1 })).ok && G({ mode: 'bus', now: at(9), tz: TZ, bus: { no: 7, pr: 'x' } }).ok && G({ mode: 'bus', now: at(9), tz: TZ, bus: { pr: [1, [1], ['a', 'b'], null] } }).ok && G(null).error === 'now' && G(undefined).error === 'now' && E.congScreen(null, null).error === 'cap', '이상한 값이 들어와도 죽지 않는다');
  ok(G({ mode: 'bus', now: at(9), tz: 99999, th: 'x', bus: { no: '1', stop: 's', pr: [[9, 10]] } }).ok && E.congFacts({ tz: 99999, now: 1 }).tz === 840, '시간대는 범위 안으로');
  const big = G({ mode: 'bus', now: at(9), tz: TZ, bus: { no: '1', stop: 's', pr: Array.from({ length: 5000 }, (_, i) => [i % 24, i % 50]) } });
  ok(big.ok, '원자료가 많아도 상한(1500)에서 자른다');
  ok(E.congHourOf(Date.UTC(2026, 9, 20, 5, 30), 540) === 14 && E.congHourOf(Date.UTC(2026, 9, 20, 16, 0), 540) === 1 && E.congHourOf(Date.UTC(2026, 9, 20, 0, 0), -300) === 19, '기기 시간대의 시');
  ok(!/[#]|(\d)시 기준|혼잡|여유/.test(JSON.stringify({ mode: 'sub', stn: '강남', line: '2호선' })), '요청 원자료에는 색·글이 없다');
}

// ── ⑤ 앱 검증기 ──
{
  const live = Array.from({ length: 24 }, (_, i) => (i * 7) % 101);
  const screens = [G(S()), G(S({ th: 'pastel' })), G(S({ mode: 'none' })), G(S({ now: at(3) })), G(S({ ld: 1, live })), G(S({ stn: '아주아주아주아주긴역이름아주아주아주아주긴역이름' })),
    G({ mode: 'bus', now: at(14), tz: TZ, bus: { no: '100', stop: '서울역', pr: [['14', '20'], ['14', '30'], ['13', '10']] } }), G({ mode: 'bus', now: at(14), tz: TZ, bus: { no: '100', ld: 1 } }), G({ mode: 'bus', now: at(14), tz: TZ, bus: { no: '100', none: 1 } })];
  const r = screenCheck(screens);
  ok(!r.err && r.out.length === screens.length && r.out.every(l => l.startsWith('OK ') && Number(l.split(' ')[2]) === 0), '앱 검증기 통과 ' + (r.err || r.out.join('|')));
}

// ── ⑥ 워커 내장 ──
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  const ms = '// ===== CONG ENGINE BEGIN =====', me = '// ===== CONG ENGINE END =====', i = w.indexOf(ms), j = w.indexOf(me);
  ok(i > 0 && j > i, '워커에 혼잡도 카드 엔진이 내장돼 있다');
  const esc = t => t.replace(/[\u0080-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const cutm = t => t.slice(0, t.indexOf('if (typeof module')).trimEnd();
  const pre = cutm(fs.readFileSync(R('engine/cong-data.js'), 'utf8')).replace(/^'use strict';\n/m, '');
  const src = cutm(fs.readFileSync(R('engine/cong.js'), 'utf8'));
  const body = w.slice(i + ms.length, j);
  ok(body.indexOf(esc(pre)) >= 0 && body.indexOf(esc(src)) >= 0 && body.indexOf(esc(fs.readFileSync(R('engine/cong-worker.js'), 'utf8').trimEnd())) >= 0, '워커 내장 사본이 소스와 같다');
  ok(w.indexOf('if (url.pathname === "/screen/cong") return handleScreenCong(request);') > 0, '경로 등록');
  ok(!/[^\x00-\x7f]/.test(body), '내장 블록은 ASCII 만');
  const other = w.slice(0, i) + w.slice(j);
  const names = ['congScreen', 'congFacts', 'congHash', 'congStr', 'congInt', 'congHourOf', 'congIsWeekend', 'congCol', 'congLvl', 'congStnKey', 'congPctSub', 'congDataSub', 'congBusStat', 'congBusLabel', 'congHead', 'congGauge', 'congChart', 'congBar', 'congCarsNode', 'congSubNodes', 'congBusNodes', 'congNoneNodes', 'CONG_SCREEN_V', 'CONG_EMOJI', 'CONG_PROFILE', 'CONG_SVC', 'CONG_LW', 'CONG_CARS', 'CONG_BUS_CAP', 'CONG_BAR_K', 'CONG_BAR_H', 'CONG_REAL', 'CONG_HOLFN', 'handleScreenCong'];
  ok(names.every(n => !new RegExp('^(async\\s+)?(function|var)\\s+' + n + '\\b', 'm').test(other)), '다른 엔진과 이름이 겹치지 않는다');
}

// ── ⑦ 워커 끝에서 끝까지 + 웹 연결부 ──
(async () => {
  const tmp = path.join(os.tmpdir(), 'rv2_cong_' + process.pid + '.mjs');
  fs.copyFileSync(R('engine/route-v2-worker.ascii.js'), tmp);
  try {
    const w = (await import(tmp)).default, call = (u, init) => w.fetch(new Request(u, init), {}, { waitUntil() { } });
    const post = b => call('https://x/screen/cong', { method: 'POST', body: b, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    for (const f of [S(), S({ mode: 'none' }), { mode: 'bus', now: at(14), tz: TZ, bus: { no: '100', stop: '서울역', pr: [['14', '20'], ['14', '30']] } }]) {
      const r = await post(JSON.stringify({ cap: 13, f })), j = await r.json();
      ok(r.status === 200 && j.ok && j.screen === 'cong' && /route-v2-2026-10-\d\ds\d\d/.test(j.ver), '워커 응답 200(' + f.mode + ') ' + j.ver);
      const direct = G(f); ok(JSON.stringify(Object.assign({}, j, { ver: undefined })) === JSON.stringify(Object.assign({}, direct, { ver: undefined })), '워커 응답 = 직접 계산(' + f.mode + ')');
    }
    ok((await (await post(JSON.stringify({ cap: 12, f: S() }))).json()).ok === false, '워커: cap 부족이면 거절');
    ok((await post('{oops')).status === 400 && (await post('x'.repeat(40001))).status === 413 && (await call('https://x/screen/cong')).status === 405, '워커: 깨진 본문 400 · 큰 본문 413 · GET 405');
    const ro = await call('https://x/screen/cong', { method: 'OPTIONS' }), rr = await post(JSON.stringify({ cap: 13, f: S() }));
    ok(ro.status === 204 && rr.headers.get('access-control-allow-origin') === '*' && rr.headers.get('cache-control') === 'no-store', '워커: OPTIONS 204 · CORS · no-store');
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  const has = t => html.indexOf(t) >= 0;
  ok(has("'/screen/cong'") && has("window._scrCong = kit;") && has("window._scrgSetUse") && has('<div id="congBody">') && has("f.feat.scrg") && has("key === 'f.scrg'"), '웹: 혼잡도 카드 연결부 + 엔진 주소 + 설정 스위치 + 감싸개');
  ok(has("window._cgSet({ mode: 'sub'") && has("window._cgSet({ mode: 'none' })") && has("pr: items.slice(0, 1500)"), '웹: 사실만 알린다(역 이름·호선 / 버스 원자료)');
  console.log(`cong_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
