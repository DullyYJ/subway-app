// 홈 경로 결과 카드 윗부분 엔진(engine/rhead.js) 시험.  실행: node test/rhead_engine.test.js   (javac · java 필요)
//  ① cap 10 미만이면 만들지 않는다 ② 문장이 옛 웹 함수(_xferLine · _doorTipLines · _routeSplitText)와 한 글자도 다르지 않다
//  ③ 머리줄·요약 줄·환승 상자 모양 ④ 탭 줄 ⑤ 사실 반영·이상한 값 ⑥ 앱 검증기 통과 ⑦ 워커 내장 사본·이름 충돌 없음 ⑧ 워커 끝에서 끝까지
const fs = require('fs'), path = require('path'), os = require('os');
const E = require('../engine/rhead'), screenCheck = require('./helpers/screen_check');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  FAIL', m); } }
const R = p => path.join(__dirname, '..', p);
const html = fs.readFileSync(R('www/index.html'), 'utf8');
const EMOJI = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const flat = ns => { const o = []; (function f(a) { a.forEach(n => { o.push(n); if (n.kids) f(n.kids); }); })(ns); return o; };
const H = (f, cap) => E.rheadScreen({ cap: cap == null ? 10 : cap, part: 'h' }, f);
const T = (f, cap) => E.rheadScreen({ cap: cap == null ? 10 : cap, part: 't' }, f);

// ── ② 옛 웹 함수와 대조: index.html 에서 함수 본문을 꺼내 같은 입력으로 돌린다 ──
const cut = (a, b) => { const i = html.indexOf(a), j = html.indexOf(b, i); if (i < 0 || j < 0) throw new Error('웹 함수를 못 찾음: ' + a); return html.slice(i, j); };
const web = new Function(
  cut('function _arrJosa(word, withBatchim', "// '로/으로'") + '\n' +
  cut('function _xferLine(t){', 'function _renderXferRow(route)') + '\n' +
  cut('function _doorLabel(d){', 'window._doorTipLines=_doorTipLines;') + '\n' +
  cut('function _routeSplitText(sp){', 'window._routeSplitText') + '\n' +
  'return { xl: _xferLine, dl: _doorTipLines, st: _routeSplitText };')();
{
  const xs = [
    { kind: 'train', at: '구로', service: 'express', fromLine: '1호선' },
    { kind: 'train', at: '신길', service: 'normal', fromLine: '' },
    { kind: 'walk', at: '구로', walkMin: 1, boardAt: '구로', toType: 1, toLine: '천안급행' },
    { kind: 'walk', at: '서울역', walkMin: 0, boardAt: '시청', toType: 2, toLine: '9714' },
    { kind: 'walk', at: '서울역', walkMin: 3, boardAt: '', toType: 2, toLine: '' },
    { at: '신도림', fromType: 1, fromLine: '1호선', toType: 1, toLine: '2호선', walkMin: 4 },
    { at: '교대', fromType: 2, fromLine: '9714', toType: 1, toLine: '3호선' },
    { at: '교대', fromType: 1, fromLine: '', toType: 2, toLine: '' },
    { at: '강남', fromType: 2, fromLine: '146-1', toType: 2, toLine: '3412', walkMin: 2.4 }
  ];
  xs.forEach((t, i) => ok(E.rheadXferLine(t) === web.xl(t), '환승 문장 #' + i + ' 웹과 같다: ' + E.rheadXferLine(t) + ' | ' + web.xl(t)));
  const sections = [
    { stnName: '구로', xfer: { dropCar: '4', dropDoor: '2', boardCar: '5', boardDoor: '1', to: '2', secs: 130 } },
    { stnName: '신도림', xfer: { dropCar: '3', dropDoor: '1', boardCar: '8', boardDoor: '4', to: '급행', secs: 20 } },
    { stnName: '', xfer: { dropCar: '1', dropDoor: '1', boardCar: '1', boardDoor: '2', to: '1', secs: 0 } },
    { stnName: '두정', exitFast: [{ fac: '엘리베이터', door: '7-2' }, { fac: '', door: '8 - 1' }, { fac: '계단', door: 'x' }] }
  ];
  // 웹 글루가 하는 사상(sections → dx/ex)과 같은 규칙: xfer 가 있는 구간들 · 뒤에서부터 처음 exitFast 가 있는 구간
  const toFacts = secs => {
    const dx = [], ex = null; let exx = null;
    secs.forEach(sc => { const x = sc && sc.xfer; if (x) dx.push({ s: sc.stnName, dc: x.dropCar, dd: x.dropDoor, bc: x.boardCar, bd: x.boardDoor, to: x.to, secs: x.secs }); });
    for (let i = secs.length - 1; i >= 0; i--) { const e = secs[i] && secs[i].exitFast; if (e && e.length) { exx = { s: secs[i].stnName, l: e.map(f => ({ fac: f.fac, door: f.door })) }; break; } }
    return { dx, ex: exx };
  };
  [sections, sections.slice(0, 2), sections.slice(3), [], [{ stnName: 'A', xfer: { dropCar: '1', dropDoor: '', boardCar: '2', boardDoor: '3' } }]].forEach((secs, i) => {
    const f = toFacts(secs), a = E.rheadDoorLines(f.dx, f.ex), b = web.dl(secs);
    ok(JSON.stringify(a) === JSON.stringify(b), '호차·문 줄 #' + i + ' 웹과 같다: ' + JSON.stringify(a) + ' | ' + JSON.stringify(b));
  });
  [{ ride: 18, wait: 3, walk: 3 }, { ride: 30, wait: 0, walk: 0 }, { ride: 5, wait: 0, walk: 7 }, { ride: 0, wait: 4, walk: 0 }].forEach((sp, i) => {
    const nd = flat(H({ m: 1, sp }).body).find(n => n.bold && /^전체 /.test(n.s));
    ok(nd && nd.s === '전체 ' + (sp.ride + sp.wait + sp.walk) + '분 · ' + web.st(sp), '요약 줄 #' + i + ' 웹과 같다: ' + (nd && nd.s) + ' | ' + web.st(sp));
  });
}
// ── ② 웹 DOM 대조: 탭 글자 · 즐겨찾기 글자 ──
{
  const i = html.indexOf('<div id="routeOptionTabs"'), seg = html.slice(i, html.indexOf('<!-- ── 장거리', i));
  const web = {}; ['Fast', 'Less', 'Sub', 'Bus', 'Longdist'].forEach(k => { const m = new RegExp('id="routeTab' + k + '"[\\s\\S]*?>\\s*([^<]+?)\\s*</button>').exec(seg); web[k.toLowerCase()] = m && m[1].replace(/^[^가-힣]+/, ''); });
  const nodes = flat(T({ m: 1, ld: 1 }).body).filter(n => n.t === 'button');
  const got = nodes.map(n => n.act.v.replace('rh.tab.', '') + ':' + n.s).join(',');
  ok(got === ['fast', 'less', 'sub', 'bus', 'longdist'].map(k => k + ':' + web[k]).join(','), '탭 글자 = 웹 탭 글자(이모지만 뺌): ' + got + ' | ' + JSON.stringify(web));
  const j = html.indexOf('id="favToggleBtn2"'), fm = />\s*[^가-힣<]*([^<]+?)\s*<\/span>/.exec(html.slice(j, j + 400));
  ok(fm && flat(H({ m: 1, fav: 1 }).body).some(n => n.t === 'rhd' && n.btn === fm[1].trim()), '즐겨찾기 글자 = 웹 (' + (fm && fm[1]) + ')');
}
// ── ① cap · ③ 모양 ──
{
  ok(H({}, 9).ok === false && E.rheadScreen({}, {}).ok === false && E.rheadScreen(null, null).ok === false, 'cap 10 미만이면 만들지 않는다');
  const s = H({ m: 24, a: '부평역', b: '두정역', fav: 1, sp: { ride: 18, wait: 3, walk: 3 }, why: '가장 빨리 도착하는 경로예요.' });
  ok(s.bg === 'card' && T({ m: 1 }).bg === 'card', '카드 안 화면이라 바탕은 card');
  ok(s.ok && s.v === 1 && s.screen === 'rhead' && s.cover === 'tab' && s.head.length === 0 && /^r1h:/.test(s.rev) && s.info.part === 'h', '기본 모양');
  const hd = s.body[0];
  ok(hd.t === 'rhd' && hd.num === '24' && hd.unit === '분' && hd.s === '부평 \u2192 두정' && hd.btn === '즐겨찾기' && hd.act.v === 'rh.fav' && hd.xact.v === 'rh.close', '머리줄: 24 분 · 역 글자 뗀 구간명 · 즐겨찾기 · 닫기');
  ok(H({ m: 9, a: '가', b: '나', fav: 0 }).body[0].btn === undefined && H({ m: 9, fav: 0 }).body[0].act === undefined, '즐겨찾기를 안 보이면 알약 없음(닫기만)');
  ok(H({ m: 9 }).body[0].s === '' && H({ m: 9, a: '서울역', b: '' }).body[0].s === '서울 \u2192 ', '구간명이 없으면 빈 글');
  ok(s.body.length === 3 && s.body[1].bold === true && s.body[1].color === 'text' && s.body[2].color === 'sub' && s.body[2].s === '가장 빨리 도착하는 경로예요.', '요약 줄: 굵은 전체 줄 + 이유 줄');
  const x = H({ m: 5, xs: [{ kind: 'walk', at: '구로', walkMin: 1, boardAt: '구로', toType: 1, toLine: '천안급행' }, { at: '신도림', fromType: 1, fromLine: '1호선', toType: 1, toLine: '2호선' }] });
  const bx = x.body.find(n => n.t === 'box');
  ok(bx && bx.s.split('\n')[0] === '환승 2번' && bx.hl[0][0] === 0 && bx.hl[0][1] === '환승 2번'.length && bx.s.split('\n')[1] === '1. 구로 하차 → 도보 1분 → 천안급행 승차' && bx.s.split('\n').length === 3, '환승 상자: 머리 굵게 + 번호 줄');
  ok(bx && bx.fill === 'rgba(255,159,10,0.12)' && bx.line === 'rgba(255,159,10,0.4)' && bx.size === 12, '환승 상자 색 = 웹 색');
  ok(!H({ m: 5 }).body.some(n => n.t === 'box') && H({ m: 5 }).body.length === 1, '요약·환승이 없으면 머리줄만');
  const last = H({ m: 5, sp: { ride: 1, wait: 0, walk: 0 }, why: 'x' }).body; ok(last[last.length - 1].pad[3] === 8 && last[0].pad[3] === 8, '줄 묶음 아래 여백 8');
  const all = flat(H({ m: 3, a: '⭐가', why: '⚡ 빨라요', xs: [{ kind: 'train', at: '🚇구로', service: 'express', fromLine: '1호선' }], ex: { s: '두정', l: [{ fac: '출구', door: '7-2' }] }, dx: [] }).body);
  ok(!JSON.stringify(all).split('"').some(t => EMOJI.test(t)), '이모지 없음');
}
// ── 이동 중 단위 · 경로 없는 탭 ──
{
  ok(H({ m: 12, u: 1 }).body[0].unit === '분 남음' && H({ m: 12, u: 0 }).body[0].unit === '분' && H({ m: 12 }).body[0].unit === '분', '이동 중이면 단위가 "분 남음" (웹 _updateRouteRemaining 와 같은 글)');
  ok(/'분 남음' : '분'/.test(html) && /_ue\.textContent = _under \? '분 남음'/.test(html), '웹에도 같은 단위 글이 있다');
  const nr = H({ m: 9, nr: 'sub', a: '가', b: '나', sp: { ride: 1, wait: 1, walk: 1 }, why: 'x', xs: [{ kind: 'train', at: 'A' }] });
  ok(nr.body.length === 1 && nr.body[0].t === 'rhd' && nr.body[0].msg === '지하철만으로 갈 수 있는 경로가 없어요' && nr.body[0].num === undefined && nr.body[0].act.v === 'rh.fav' && nr.body[0].xact.v === 'rh.close', '경로 없는 탭: 안내 한 줄만(요약·환승은 숨김) · 즐겨찾기·닫기는 그대로');
  ok(H({ nr: 'bus' }).body[0].msg === '버스만으로 갈 수 있는 경로가 없어요' && H({ nr: 'longdist' }).body[0].msg === '이 수단만으로 갈 수 있는 경로가 없어요', '버스 · 그 밖은 "이 수단"');
  ok(/label=\(type==='sub'\)\?'지하철':\(type==='bus'\?'버스':'이 수단'\)/.test(html) && html.indexOf("'+label+'만으로 갈 수 있는 경로가 없어요</span>") >= 0, '웹 _showTabNoRoute 문구와 같다');
  ok(H({ nr: 'S U<b>' }).body[0].msg === '이 수단만으로 갈 수 있는 경로가 없어요' || H({ nr: 'S U<b>' }).body[0].msg !== undefined, '이상한 nr 도 죽지 않는다');
}
// ── ④ 탭 ──
{
  const t = T({ m: 1, tab: 'less' }), row = t.body[0];
  ok(t.ok && t.screen === 'rhead' && /^r1t:/.test(t.rev) && t.info.part === 't' && row.t === 'row' && row.kids.length === 4, '탭 줄: row 네 칸(장거리 없음)');
  ok(row.kids.map(k => k.s).join() === '최단시간,최소환승,지하철,버스' && row.kids.filter(k => k.fill === 'gold').length === 1 && row.kids.find(k => k.fill === 'gold').act.v === 'rh.tab.less', '고른 탭만 금색');
  ok(T({ tab: 'longdist', ld: 1 }).body[0].kids.length === 5 && T({ tab: 'longdist', ld: 1 }).body[0].kids[4].fill === 'gold', '장거리가 있으면 다섯 칸');
  ok(T({ tab: 'nonsense' }).body[0].kids[0].fill === 'gold' && T({}).body[0].kids[0].fill === 'gold', '모르는 탭은 최단시간');
  ok(row.kids.every(k => k.t === 'button' && k.act.a === 'call' && /^rh\.tab\.(fast|less|sub|bus|longdist)$/.test(k.act.v)), '탭 행동은 rh.tab.<종류> 뿐');
}
// ── ⑤ 사실 · 이상한 값 ──
{
  ok(H({ m: -5 }).body[0].num === '0' && H({ m: 'x' }).body[0].num === '0' && H({ m: 99999 }).body[0].num === '9999' && H({ m: 23.6 }).body[0].num === '24', '분은 0~9999 정수');
  ok(H(null).ok && H('x').ok && H({ sp: 'x', dx: 'x', xs: 'x', ex: 5 }).ok, '이상한 사실도 죽지 않는다');
  ok(H({ m: 1, why: '가'.repeat(900) }).body.find(n => n.color === 'sub').s.length === 400, '이유는 400자까지');
  ok(H({ m: 1, xs: Array.from({ length: 30 }, () => ({ kind: 'train', at: 'A', fromLine: '1호선' })) }).body.find(n => n.t === 'box').s.split('\n').length === 9, '환승은 8개까지');
  ok(H({ m: 7, a: '가'.repeat(100) }).body[0].s.length <= 40 + 4 + 2, '이름은 40자까지');
  ok(H({ m: 1, sp: { ride: 3.4, wait: -2, walk: 'a' } }).body.find(n => n.bold).s === '전체 3분 · 승차 3분', '나눈 분은 정수 · 음수/문자는 0');
  ok(H({ m: 2 }).rev === H({ m: 2 }).rev && H({ m: 3 }).rev !== H({ m: 2 }).rev && T({ tab: 'bus' }).rev !== T({ tab: 'sub' }).rev && H({ m: 2 }).rev !== T({ m: 2 }).rev, '같은 입력 → 같은 rev, 다르면 다름');
}
// ── ⑥ 앱 검증기 ──
{
  const f = { m: 24, a: '부평역', b: '두정역', fav: 1, sp: { ride: 18, wait: 3, walk: 3 }, why: '가장 빨리 도착하는 경로예요. 환승 1회로 가는 경로는 4분 더 걸려요.', dx: [{ s: '구로', dc: '4', dd: '2', bc: '5', bd: '1', to: '2', secs: 130 }], ex: { s: '두정', l: [{ fac: '출구', door: '7-2' }] }, xs: [{ kind: 'walk', at: '구로', walkMin: 1, boardAt: '구로', toType: 1, toLine: '천안급행' }], tab: 'fast', ld: 1 };
  const sc = [H(f), H({ m: 3 }), H({ m: 3, fav: 0 }), H({ m: 3, nr: 'bus' }), H({ m: 3, u: 1 }), T(f), T({ tab: 'bus', ld: 0 }), H({ m: 120, a: '아주아주아주아주아주아주아주아주긴이름', b: '아주아주아주아주아주아주긴이름', fav: 1 })];
  const r = screenCheck(sc);
  ok(!r.err && r.out.length === sc.length && r.out.every(l => l.startsWith('OK ')), '모든 화면이 앱 검증기를 통과 ' + (r.err || r.out.filter(l => !l.startsWith('OK ')).join('|')));
  ok(r.out.every(l => Number(l.split(' ')[2]) === 0), '건너뛴 노드 없음');
}
// ── ⑦ 워커 내장 ──
{
  const w = fs.readFileSync(R('engine/route-v2-worker.ascii.js'), 'utf8');
  const ms = '// ===== RHEAD ENGINE BEGIN =====', me = '// ===== RHEAD ENGINE END =====', i = w.indexOf(ms), j = w.indexOf(me);
  ok(i > 0 && j > i, '워커에 결과 카드 윗부분 엔진이 내장돼 있다');
  const esc = t => t.replace(/[\u0080-\uFFFF]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  let src = fs.readFileSync(R('engine/rhead.js'), 'utf8'); src = src.slice(0, src.indexOf('if (typeof module')).trimEnd();
  const body = w.slice(i + ms.length, j);
  ok(body.indexOf(esc(src)) >= 0 && body.indexOf(esc(fs.readFileSync(R('engine/rhead-worker.js'), 'utf8').trimEnd())) >= 0, '워커 내장 사본이 소스와 같다');
  ok(w.indexOf('if (url.pathname === "/screen/rhead") return handleScreenRhead(request);') > 0, '경로 등록');
  ok(!/[^\x00-\x7f]/.test(body), '내장 블록은 ASCII 만');
  const other = w.slice(0, i) + w.slice(j);
  const names = ['rheadScreen', 'rheadFacts', 'rheadHash', 'rheadStr', 'rheadInt', 'rheadJosa', 'rheadDoor', 'rheadList', 'rheadXferLine', 'rheadDoorLines', 'rheadHeadNodes', 'rheadTabNodes', 'RHEAD_SCREEN_V', 'RHEAD_TABS', 'RHEAD_EMOJI', 'handleScreenRhead'];
  ok(names.every(n => !new RegExp('^(async\\s+)?(function|var)\\s+' + n + '\\b', 'm').test(other)), '다른 엔진과 이름이 겹치지 않는다');
}
// ── ⑧ 워커 끝에서 끝까지 ──
(async () => {
  const tmp = path.join(os.tmpdir(), 'rv2_rhead_' + process.pid + '.mjs');
  fs.copyFileSync(R('engine/route-v2-worker.ascii.js'), tmp);
  try {
    const w = (await import(tmp)).default, call = (u, init) => w.fetch(new Request(u, init), {}, { waitUntil() { } });
    const post = b => call('https://x/screen/rhead', { method: 'POST', body: b, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    const f = { m: 31, a: '신도림역', b: '수원역', fav: 1, sp: { ride: 25, wait: 2, walk: 4 }, why: '가장 빨리 도착하는 경로예요.', xs: [{ at: '신도림', fromType: 1, fromLine: '1호선', toType: 1, toLine: '2호선', walkMin: 3 }], tab: 'sub', ld: 0 };
    for (const part of ['h', 't']) {
      const r = await post(JSON.stringify({ cap: 10, part, f })), j = await r.json();
      ok(r.status === 200 && j.ok && j.screen === 'rhead' && j.info.part === part && /route-v2-2026-10-\d\ds\d\d/.test(j.ver), '워커 응답 200(' + part + ') ' + j.ver);
      const direct = E.rheadScreen({ cap: 10, part }, f); ok(JSON.stringify(Object.assign({}, j, { ver: undefined })) === JSON.stringify(Object.assign({}, direct, { ver: undefined })), '워커 응답 = 직접 계산(' + part + ')');
    }
    ok((await (await post(JSON.stringify({ cap: 9, f: {} }))).json()).ok === false, '워커: cap 부족이면 거절');
    ok((await post('{oops')).status === 400 && (await post('x'.repeat(40001))).status === 413 && (await call('https://x/screen/rhead')).status === 405, '워커: 깨진 본문 400 · 큰 본문 413 · GET 405');
    const ro = await call('https://x/screen/rhead', { method: 'OPTIONS' }), rr = await post(JSON.stringify({ cap: 10, f }));
    ok(ro.status === 204 && rr.headers.get('access-control-allow-origin') === '*' && rr.headers.get('cache-control') === 'no-store', '워커: OPTIONS 204 · CORS · no-store');
  } catch (e) { fail++; console.log('  FAIL 워커 시험 예외', e && e.stack || e); }
  try { fs.unlinkSync(tmp); } catch (e) { }
  if (html.indexOf('window._scrRhead = ') >= 0) {
    const has = t => html.indexOf(t) >= 0;
    ok(has("'/screen/rhead'") && has("/^rh\\.(fav|close|tab\\.(fast|less|sub|bus|longdist))$/"), '웹: 결과 카드 연결부 + 엔진 주소 + rh.<행동> 만 처리');
  }
  console.log(`rhead_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
