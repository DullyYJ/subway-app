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
  const names = ['rheadScreen', 'rheadFacts', 'rheadHash', 'rheadStr', 'rheadInt', 'rheadJosa', 'rheadDoor', 'rheadList', 'rheadXferLine', 'rheadDoorLines', 'rheadHeadNodes', 'rheadTabNodes', 'rheadAgo', 'rheadJoin', 'rheadOffParts', 'rheadNoteNodes', 'RHEAD_LD_MODE', 'rheadWon', 'rheadNum', 'rheadLdNodes', 'RHEAD_SCREEN_V', 'RHEAD_TABS', 'RHEAD_EMOJI', 'handleScreenRhead', 'RTRK_LC', 'RTRK_ALIAS', 'RTRK_BUS_COLS', 'RTRK_W', 'RTRK_WLD', 'RTRK_DWELL', 'RTRK_MINGAP', 'RTRK_GREY', 'RTRK_DOT', 'rheadTrkNm', 'rheadTrkNum', 'rheadTrkHex2', 'rheadTrkBright', 'rheadTrkColor', 'rheadTrkHM', 'rheadTrkHav', 'rheadTrkSec', 'rheadTrkHasEng', 'rheadTrkOffsets', 'rheadTrkLabel', 'rheadTrkPoints', 'rheadTrkCells', 'rheadTrackScreen', 'RTRK_MK', 'rheadTrkMark'];
  ok(names.every(n => !new RegExp('^(async\\s+)?(function|var)\\s+' + n + '\\b', 'm').test(other)), '다른 엔진과 이름이 겹치지 않는다');
}
// ── ⑨ 공식 공지 · 지연 제보 줄(part n): 옛 웹 _offText 와 문구가 같다 ──
{
  const webN = new Function('_ltEsc', '_offAgo', cut('function _offText(l, n){', 'function _lrRenderOfficial') + '\nreturn _offText;');
  const NOW = 1760000000000, esc = x => String(x), ago = ts => { const m = Math.max(0, Math.round((NOW - ts) / 60000)); return m < 1 ? '방금' : (m < 60 ? m + '분 전' : Math.round(m / 60) + '시간 전'); };
  const wt = webN(esc, ago), strip = h => h.replace(/<[^>]+>/g, '').replace(/[☀-➿⬀-⯿️‍]|[\uD83C-\uD83E][\uDC00-\uDFFF]/g, '').replace(/^\s+/, '');
  const N = f => E.rheadScreen({ cap: 10, part: 'n' }, Object.assign({ now: NOW }, f));
  const cases = [
    ['2호선', { text: '2호선 신도림역 무정차 통과 중입니다', ts: NOW - 5 * 60000 }],
    ['1호선', { text: '열차 지연', title: '', ts: NOW - 90 * 60000 }],
    ['3호선', { text: 'x '.repeat(80), ts: NOW - 30000 }],
    ['4호선', { text: '도착 간격이 벌어졌어요', ts: NOW - 3 * 60000, estimated: true, suspect: true }],
  ];
  cases.forEach(c => {
    const o = N({ ln: [c[0]], off: { [c[0]]: c[1] } }), b = o.body[0];
    ok(b && b.t === 'box' && b.s === strip(wt(c[0], c[1])).replace(/\s+$/, ''), '공지 문구가 웹과 같다(' + c[0] + '): ' + (b && b.s));
    ok(b.fill === 'rgba(10,132,255,0.12)' && b.hl && b.hl[0][0] === 0, '파란 상자 + 앞부분 굵게(' + c[0] + ')');
  });
  const none = N({ ln: ['2호선'], off: { '2호선': { text: '정상', ts: NOW, estimated: true } } });
  ok(none.body.length === 1 && none.body[0].t === 'spacer' && none.body[0].h === 0, '짐작한 정상은 올리지 않는다 → 높이 0');
  ok(N({}).body[0].t === 'spacer', '아무 사실이 없으면 높이 0');
  const two = N({ ln: ['2호선', '1호선'], off: { '2호선': { text: 'a', ts: NOW }, '1호선': { text: 'b', ts: NOW } } });
  ok(two.body[0].s.split('\n').length === 2 && two.body[0].hl.length === 2, '노선이 둘이면 한 상자 두 줄 · 굵게 둘');
  const al = N({ ln: ['2호선', '인천2호선'], al: { '2호선': { reporters: 2, stations: [{ stn: '강남', n: 2 }] }, '인천2호선': { reporters: 4, stations: [{ stn: '검단오류', n: 3 }] } } });
  ok(al.body.length === 2 && al.body[0].s === '인천2호선 최근 30분 지연 제보 4명 (검단오류 부근) — 시간 여유를 두고 이동하세요.', '제보 3명 이상만: ' + (al.body[0] && al.body[0].s));
  ok(al.body[1].kids[0].act.v === 'rh.room.1' && al.body[0].fill === 'rgba(255,69,58,0.12)', '노선 방 보기 단추(rh.room.<순번>) + 빨간 상자');
  const both = N({ ln: ['2호선'], off: { '2호선': { text: 'a', ts: NOW } }, al: { '2호선': { reporters: 3, stations: [] } } });
  ok(both.body.length === 3 && both.body[0].fill.indexOf('10,132,255') > 0 && both.body[1].s.indexOf('2호선 최근 30분 지연 제보 3명 — ') === 0, '공지 + 제보 + 단추 세 덩이');
  {
    const sc = [N({ ln: ['2호선'], off: { '2호선': { text: 'a', ts: NOW } }, al: { '2호선': { reporters: 5, stations: [{ stn: 'x', n: 1 }] } } }), none, N({}), both];
    const r = screenCheck(sc); ok(!r.err && r.out.length === sc.length && r.out.every(l => l.startsWith('OK ') && Number(l.split(' ')[2]) === 0), '앱 검증기 통과(part n) ' + (r.err || r.out.join('|')));
  }
  ok(!flat(both.body).some(n => EMOJI.test(JSON.stringify(n))), 'part n 에 이모지 없음');
  const bad = N({ ln: ['2호선', 5, null, 'x'.repeat(99)], off: 'zz', al: [1, 2], now: 'abc' }); ok(bad.ok && bad.body.length >= 1, '이상한 값에도 죽지 않는다');
  ok(E.rheadScreen({ cap: 10, part: 'n' }, { ln: ['2호선'], off: { '2호선': { text: 'a', ts: NOW } }, now: NOW }).rev !== E.rheadScreen({ cap: 10, part: 'h' }, { m: 5 }).rev, 'rev 가 부분마다 다르다');
}
// ── ⑩ 장거리 고르기(part l): 웹 _renderLdGradeChips 와 같은 판단(선택 표시·후보 수 조건)·문구 ──
{
  const L = lg => E.rheadScreen({ cap: 10, part: 'l' }, { lg });
  const labels = o => flat(o.body).filter(n => n.t === 'btnrow').flatMap(n => n.items);
  const base = { mode: 'train', grade: 'KTX', depTs: 5, noWaitMin: 80, fastRide: { depLabel: '13:47', rideMin: 70, noWaitMin: 75 },
    candidates: [{ mode: 'train', depTs: 5, depLabel: '13:47', totalMin: 89 }, { mode: 'expbus', depTs: 6, depLabel: '13:50', totalMin: 120 }, { mode: 'train', depTs: 7, depLabel: '14:20', totalMin: 95 }],
    options: [{ grade: 'KTX', depTs: 5, depLabel: '13:47', fare: 12300 }, { grade: '무궁화', depTs: 9, depLabel: '14:00', fare: 8500 }] };
  const o = L(base), it = labels(o);
  ok(it.map(x => x.label).join('|') === '열차 13:47 · 89분|고속버스 13:50 · 120분|열차 14:20 · 95분|KTX 13:47 · 12,300원|무궁화 14:00 · 8,500원', '후보 라벨(수단·시각·소요) · 등급 라벨(요금 쉼표): ' + it.map(x => x.label).join('|'));
  ok(it.filter(x => x.on).map(x => x.label).join('|') === '열차 13:47 · 89분|KTX 13:47 · 12,300원', '선택 표시: 모드+정확한 시각이 같은 것 / 등급+시각이 같은 것');
  ok(it[0].act.v === 'rh.ld.m.0' && it[2].act.v === 'rh.ld.m.2' && it[3].act.v === 'rh.ld.g.0' && it[4].act.v === 'rh.ld.g.1', '누르면 원자료 번호(rh.ld.m|g.<번호>)');
  const note = flat(o.body).find(n => n.t === 'text'); ok(note && note.s === '대기 시간을 빼면 약 80분 (다른 지도앱은 대기를 빼고 표시해요)\n이동만 가장 빠른 편: 13:47 출발, 열차 70분 (대기 제외 총 75분)', '대기 제외 안내 두 줄');
  ok(labels(L(Object.assign({}, base, { depTs: null }))).filter(x => x.on).length === 3, 'depTs 가 없으면 모드·등급만 맞아도 선택(예전 응답 호환: 열차 둘 + KTX)');
  const one = L({ mode: 'train', grade: 'KTX', candidates: [base.candidates[0]], options: [base.options[0]] });
  ok(one.body.length === 1 && one.body[0].t === 'spacer', '후보·등급이 하나뿐이고 안내도 없으면 높이 0');
  ok(L(null).body[0].t === 'spacer' && L({}).body[0].t === 'spacer', '원자료가 없으면 높이 0');
  const skip = L({ mode: 'train', candidates: [null, { mode: 'train', depLabel: 'a' }, { mode: 'expbus', depLabel: 'b' }], options: [] }); const si = labels(skip);
  ok(si.length === 2 && si[0].act.v === 'rh.ld.m.1' && si[1].act.v === 'rh.ld.m.2', '이상한 항목은 건너뛰어도 번호는 원자료 그대로');
  const long = L({ mode: 'train', candidates: [{ mode: 'train', depLabel: '가'.repeat(30) }, { mode: 'train', depLabel: 'b' }] }); ok(labels(long).every(x => x.label.length <= 24), '라벨은 24자 안');
  {
    const sc = [o, L({ mode: 'train', noWaitMin: 5 }), L(null), L(Object.assign({}, base, { candidates: Array.from({ length: 8 }, (_, i) => ({ mode: 'train', depTs: i, depLabel: '1' + i + ':00', totalMin: 90 + i })) }))];
    const r = screenCheck(sc); ok(!r.err && r.out.length === sc.length && r.out.every(l => l.startsWith('OK ') && Number(l.split(' ')[2]) === 0), '앱 검증기 통과(part l) ' + (r.err || r.out.join('|')));
  }
  ok(!flat(o.body).some(n => EMOJI.test(JSON.stringify(n))), 'part l 에 이모지 없음');
  ok(E.rheadScreen({ cap: 10, part: 'l' }, { lg: base }).rev !== E.rheadScreen({ cap: 10, part: 'n' }, { lg: base }).rev, 'rev 가 부분마다 다르다');
}
// ── ⑦-2 구간 타임라인(part k) ──
{
  const now = Date.UTC(2026, 9, 20, 3, 0, 0);               // 12:00 KST
  const st = (a) => a.map((n, i) => [n, 37.4 + i * 0.01, 126.7 + i * 0.012]);
  const secs = [
    { ty: 3, nm: '', du: 180, di: 200, ss: 0, es: 180, st: [] },
    { ty: 2, nm: '6', du: 900, di: 5000, ss: 240, es: 840, ar: 180, we: 1, st: st(['아라역4번출구', '중간', '부평역']) },
    { ty: 3, nm: '', du: 240, di: 300, ss: 840, es: 1080, st: [] },
    { ty: 1, nm: '수도권 1호선', du: 1200, di: 9000, ss: 1080, es: 2280, tw: 120000, sts: [1080, 1200, 1500, 2280], st: st(['부평', '부개', '송내', '두정']) },
    { ty: 3, nm: '', du: 120, di: 150, ss: 2280, es: 2400, st: [] }];
  const F = (o) => Object.assign({ secs: JSON.parse(JSON.stringify(secs)), xf: [{ k: 'x', xi: 2 }], bt: null, rb: null, now, sw: [], tz: 540, th: 'dark' }, o || {});
  const o = E.rheadScreen({ cap: 12, part: 'k' }, F());
  ok(o.ok && o.screen === 'rhead' && o.cover === 'tab' && o.bg === 'card' && o.head.length === 1 && o.head[0].t === 'trk' && o.body.length === 1 && o.body[0].t === 'spacer' && o.body[0].h === 0 && o.info.part === 'k', 'part k 모양');
  const cells = o.head[0].cells;
  ok(cells.length === 10 && o.info.n === 10 && o.info.w === 640 && /^r1k:/.test(o.rev), '칸 10개 · 폭 합 640 · rev');
  ok(cells.map(c => c.t).join('|') === '3분|12:04|12:11|12:19|4분|12:20|12:22|12:27|12:40|2분', '시각: 탐색 12:00 기준 · 버스 대기 뒤 승차 · 지하철 시각표 대기 +2분 · 도보는 분');
  ok(cells[0].dk === 'e' && cells[0].dc === '#d4af37' && cells[0].lc === '' && cells[9].dk === 'e' && cells[9].dc === '#ff2d55' && cells[9].rc === '', '시작/끝 점은 끝점 색(어두운 테마) · 바깥 선 없음');
  ok(cells[1].g === '6 · 예상' && cells[1].gk === 't' && cells[1].gc === '#30d158' && cells[1].ti === 1, '추정 대기 버스는 예상 표시 · 노선 글자 배지');
  ok(cells[4].n === '환승' && cells[4].nc === 'gold' && cells[4].dk === 'm' && cells[4].dc === '#30d158' && cells[4].dc2 === '#8e8e93' && cells[4].ti === -1, '엔진이 알린 환승 도보는 환승 · 가운데 점은 앞뒤 색 그라데이션');
  ok(cells[4].g === '↔ 수도권 1호선' && cells[4].gk === 'p' && cells[4].gc === '#00c4ff' && cells[5].lc === '#8e8e93', '환승 칸 배지는 다음 노선 알약 · 밝힌 1호선 색(어두운 테마)');
  ok(cells.every(c => c.w === 64) && cells.every(c => /^#[0-9a-f]{6}$/.test(c.lc || '#000000') && /^#[0-9a-f]{6}$/.test(c.rc || '#000000')), '칸 폭 64 · 색은 모두 #rrggbb');
  // 파스텔: 원색 · 다른 점 색
  const pa = E.rheadScreen({ cap: 12, part: 'k' }, F({ th: 'pastel' })).head[0].cells;
  ok(pa[0].dc === '#1d9bf0' && pa[9].dc === '#e0455a' && pa[5].dc === '#0052a4' && pa[4].g === '↔ 수도권 1호선' && pa[4].gc === '#0052a4', '파스텔 테마: 원색 노선 · 시작/끝 점 색');
  // 시간축: 예상 시각 모드 · 막차 뒤 첫차 이동 · 오래된 탐색 · 기기 시간대
  const T = (f) => E.rheadScreen({ cap: 12, part: 'k' }, F(f)).head[0].cells.map(c => c.t)[1];
  ok(T({ bt: Date.UTC(2026, 9, 20, 6, 0, 0) }) === '15:04', '사용자가 정한 예상 시각이 기준');
  ok(T({ rb: now - 60000 }) === '11:59' || T({ rb: now - 60000 }) === '12:03', '이번 탐색 시각(5분 안)이 기준');
  ok(T({ rb: now - 600000, sw: [30] }) === '12:34', '탐색 시각이 오래되면 기기 시계 + 첫차까지 이동 30분');
  ok(T({ bt: Date.UTC(2026, 9, 20, 6, 0, 0), sw: [30] }) === '15:04', '예상 시각 모드에서는 첫차 이동을 더하지 않는다');
  ok(T({ tz: 0 }) === '03:04', '기기 시간대(분)를 따른다');
  // 장거리: 출발/도착 알약 · 총 소요 · 폭 108 · 앞뒤 같은 이름 역을 지우지 않는다
  const ld = E.rheadScreen({ cap: 12, part: 'k' }, F({ xf: [], secs: [
    { ty: 3, nm: '', du: 120, di: 100, ss: 0, es: 120, st: [] },
    { ty: 1, nm: '1호선', du: 600, di: 6000, ss: 120, es: 720, sts: [120, 400, 720], st: st(['가산디지털단지', '독산', '광명']) },
    { ty: 4, nm: 'KTX', du: 11100, di: 400000, ss: 900, es: 12000, st: [['광명'], ['부산']] },
    { ty: 3, nm: '', du: 300, di: 400, ss: 12000, es: 12300, st: [] }] })).head[0].cells;
  const dep = ld.find(c => c.g === 'KTX 출발'), arr = ld.find(c => c.g === 'KTX 도착');
  ok(dep && arr && dep.w === 108 && arr.w === 108 && dep.n === '광명' && arr.n === '부산' && dep.nc === '#ff9500' && dep.gk === 'p' && dep.gx === 5, '장거리: 출발/도착 알약 · 넓은 칸 · 주황');
  ok(/^\d\d:\d\d · 총 3시간5분$/.test(arr.t) && dep.t === '12:15' && arr.tc === 'gold' && arr.t.startsWith('15:20'), '장거리: 도착 시각 + 총 소요(3시간5분) · 금색');
  ok(ld.filter(c => c.n === '광명').length === 2, '장거리 앞 지하철의 마지막 역과 같은 이름이어도 승차역을 지우지 않는다');
  // 같은 이름 역 중복 제거(바로 이어 탐) · 급행 환승 · 버스끼리 환승
  const ch = E.rheadScreen({ cap: 12, part: 'k' }, F({ xf: [{ k: 'train' }, { k: 'x', si: 2 }], secs: [
    { ty: 2, nm: '8', du: 300, di: 1500, ss: 60, es: 360, ar: 30, st: st(['정류장A', '부평역']) },
    { ty: 1, nm: '수도권 1호선', du: 1500, di: 14000, ss: 400, es: 1900, sts: [400, 700, 1000, 1200], st: st(['부평', '신도림', '가산디지털단지', '구로']), tc: [{ at: '가산디지털단지역', to: 'express' }] },
    { ty: 2, nm: '9', du: 400, di: 1600, ss: 1950, es: 2350, st: st(['용산역앞', '삼각지']) },
    { ty: 2, nm: '110', du: 300, di: 1200, ss: 2400, es: 2700, st: st(['삼각지', '한남', '옥수']) }] })).head[0].cells;
  ok(ch.map(c => c.n).join(',') === '정류장A,부평,신도림,가산디지털단지,구로,용산역앞,삼각지,한남,옥수', '같은 이름 역은 바로 이어 탈 때 한 번만(' + ch.map(c => c.n).join(',') + ')');
  ok(ch.some(c => c.g === '↔ 급행 환승' && c.n === '가산디지털단지'), '같은 노선 일반→급행 환승 역에 배지');
  ok(ch.filter(c => c.g && /^↔ 110/.test(c.g)).length === 1 || ch.filter(c => c.g && /110/.test(c.g)).length >= 1, '버스끼리 환승: 다음 버스 알약');
  const bc = ch.filter(c => c.dk === 'r' && c.dc !== '#00c4ff').map(c => c.dc);
  ok(bc[0] === '#30d158' && bc.includes('#bf5af2') && bc.includes('#ff6482'), '버스 구간이 여럿이면 구간마다 다른 색(' + bc + ' · ' + ch[ch.length - 1].lc + ')');
  // 좌표 거리 비례 · 역별 시각 없음
  const g = E.rheadScreen({ cap: 12, part: 'k' }, F({ xf: [], secs: [{ ty: 2, nm: '88', du: 1200, di: 7000, ss: 120, es: 1320, ws: 90, st: st(['가', '나', '다', '라', '마']) }] })).head[0].cells;
  ok(g.length === 5 && g[0].t === '12:02' && g[4].t === '12:22' && g.every((c, i) => i === 0 || c.t >= g[i - 1].t), '좌표 비례 시각: 첫 12:02 · 끝 12:22 · 단조 증가');
  // 입력 거르기·거절
  ok(E.rheadScreen({ cap: 10, part: 'k' }, F()).ok === false && E.rheadScreen({ cap: 11, part: 'k' }, F()).error === 'cap', 'cap 10·11 이면 만들지 않는다(trk 노드 + 마커 mk 는 규격 12)');
  ok(E.rheadScreen({ cap: 12, part: 'k' }, F({ secs: [] })).error === 'empty' && E.rheadScreen({ cap: 12, part: 'k' }, F({ now: 0 })).error === 'now', '구간이 없거나 시계가 없으면 거절');
  ok(E.rheadScreen({ cap: 12, part: 'k' }, F({ secs: secs.map(s => Object.assign({}, s, { ss: null, es: null })) })).error === 'notimes', '구간 시각을 하나도 못 받으면 거절(웹이 그린다)');
  const evil = E.rheadScreen({ cap: 12, part: 'k' }, F({ secs: [{ ty: 1, nm: '<b>1호선</b>\uD83D\uDE80', du: 'x', di: -5, ss: 0, es: 60, st: [['\uD83D\uDE80역', 'a', null], ['정상', 1, 2]] }, 7, null] }));
  ok(evil.ok === true && !EMOJI.test(JSON.stringify(evil.head[0].cells)), '이상한 값이 들어와도 죽지 않고 그림말은 거른다');
  const wide = E.rheadScreen({ cap: 12, part: 'k' }, F({ secs: Array.from({ length: 30 }, (_, i) => ({ ty: 1, nm: '2호선', du: 60, di: 1, ss: i * 60, es: i * 60 + 60, st: Array.from({ length: 300 }, (_, q) => ['역' + q, 0, 0]) })) }));
  ok(wide.ok && wide.head[0].cells.length <= 12 * 150, '구간·역 수는 상한을 넘지 않는다');
  ok(!/[#]|\d\d:\d\d/.test(JSON.stringify(F())) , '요청 원자료에는 색·시각 글이 없다');
  // 2단계: 내 위치 마커 · 대기 배지 · 지금 보이는 시각 덮어쓰기
  const K = (lv, o2) => E.rheadScreen({ cap: 12, part: 'k' }, F(Object.assign({ lv }, o2 || {}))).head[0];
  ok(K(null).mk === undefined && K({ p: null, w: null, ea: null }).mk === undefined, 'lv 가 없거나 위치가 없으면 마커 없음');
  const m1 = K({ p: { f: 1, t: 2, r: 0.5, sn: 0 }, w: null, ea: null }).mk;
  ok(m1 && m1.f === 1 && m1.t === 2 && m1.r === 0.5 && m1.ms === 3000 && m1.pu === 'b' && m1.c === '#0a84ff' && m1.bc === '#ffffff' && m1.d === 14 && m1.pms === 1300 && m1.bt === undefined, '마커: 파랑 · 깜박임 · 3초 이동 · 배지 없음');
  const cl = K({ p: { f: 1, t: 2, r: 0.5, sn: 0 } }).cells;
  ok(cl[m1.f].ti === 1 && cl[m1.t].ti === 2, '마커 칸 번호는 추적 번호(ti)를 칸 위치로 바꾼 값');
  const mw = K({ p: { f: 3, t: 3, r: 0.9, sn: 1 }, w: { d: 350 } }).mk;
  ok(mw.f === mw.t && mw.r === 0 && mw.ms === 0 && mw.pu === 'w' && mw.c === '#ff9f0a' && mw.bt === '대기 중 · 350m' && mw.bg === '#ff9f0a' && mw.btc === '#ffffff' && mw.bz === 9 && mw.pms === 1600, '대기: 주황 맥박 · 배지 글(미터) · 같은 칸이면 비율 0 · 점프(sn)면 즉시');
  ok(K({ p: { f: 0, t: 0, r: 0 }, w: { d: 1520 } }).mk.bt === '대기 중 · 1.5km' && K({ p: { f: 0, t: 0, r: 0 }, w: { d: null } }).mk.bt === '대기 중' && K({ p: { f: 0, t: 0, r: 0 }, w: { d: 999.6 } }).mk.bt === '대기 중 · 1000m', '대기 배지: 1km 이상은 km · 거리 모르면 글만');
  ok(K({ p: { f: 99, t: 0, r: 0 } }).mk === undefined && K({ p: { f: 'x' } }).mk === undefined && K({ p: { f: 1, t: 77, r: 0.4 } }).mk.t === K({ p: { f: 1, t: 77, r: 0.4 } }).mk.f, '없는 칸 번호는 마커를 그리지 않거나 제자리');
  ok(K({ p: { f: 1, t: 2, r: -3 } }).mk.r === 0 && K({ p: { f: 1, t: 2, r: 9 } }).mk.r === 1, '비율은 0~1 로 자른다');
  // 시각 덮어쓰기: 웹이 지금 보여 주는 시각(칸 수가 맞을 때만)
  const e1 = K({ ea: ['', '12:09', '12:12', '12:21', '12:23', '12:24', '12:30', '12:41', ''] }).cells;
  ok(e1[1].t === '12:09' && e1[3].t === '12:21' && e1[5].t === '12:23' && e1[8].t === '12:41' && e1[0].t === '3분' && e1[4].t === '4분' && e1[9].t === '2분', '시각 덮어쓰기: 역 칸만 웹 값으로 · 도보 분은 그대로');
  ok(K({ ea: ['x', 'ab:cd'] }).cells.map(c => c.t).join('|') === cells.map(c => c.t).join('|') && K({ ea: ['12:09'] }).cells[1].t === cells[1].t, '칸 수가 다르거나 시각 모양이 아니면 덮지 않는다');
  ok(E.rheadScreen({ cap: 12, part: 'k' }, F({ lv: { p: { f: 1, t: 2, r: 0.5 } } })).rev !== o.rev && E.rheadScreen({ cap: 12, part: 'k' }, F({ lv: { p: { f: 1, t: 2, r: 0.5 } } })).rev === E.rheadScreen({ cap: 12, part: 'k' }, F({ lv: { p: { f: 1, t: 2, r: 0.5 } } })).rev, 'rev 는 마커·시각이 바뀌면 바뀌고 같으면 같다');
  const ldE = E.rheadScreen({ cap: 12, part: 'k' }, F({ xf: [], secs: [
    { ty: 3, nm: '', du: 120, di: 100, ss: 0, es: 120, st: [] },
    { ty: 4, nm: 'KTX', du: 11100, di: 400000, ss: 900, es: 12000, st: [['광명'], ['부산']] },
    { ty: 3, nm: '', du: 300, di: 400, ss: 12000, es: 12300, st: [] }], lv: { ea: ['', '12:16', '15:21', ''] } })).head[0].cells;
  ok(ldE.find(c => c.g === 'KTX 출발').t === '12:16' && ldE.find(c => c.g === 'KTX 도착').t === '15:21 · 총 3시간5분', '장거리: 시각만 바뀌고 총 소요는 그대로 붙는다');
  const vm = screenCheck([E.rheadScreen({ cap: 12, part: 'k' }, F({ lv: { p: { f: 1, t: 2, r: 0.5, sn: 0 }, w: null, ea: null } })), E.rheadScreen({ cap: 12, part: 'k' }, F({ lv: { p: { f: 0, t: 0, r: 0, sn: 1 }, w: { d: 350 }, ea: null } }))]);
  ok(!vm.err && vm.out.length === 2 && vm.out.every(l => l.startsWith('OK ') && Number(l.split(' ')[2]) === 0), '앱 검증기 통과(마커·대기 배지) ' + (vm.err || vm.out.join('|')));
  const vr = screenCheck([o, E.rheadScreen({ cap: 12, part: 'k' }, F({ th: 'pastel' }))]);
  ok(!vr.err && vr.out.length === 2 && vr.out.every(l => l.startsWith('OK ') && Number(l.split(' ')[2]) === 0), '앱 검증기 통과(part k) ' + (vr.err || vr.out.join('|')));
}
// ── ⑧ 워커 끝에서 끝까지 ──
(async () => {
  const tmp = path.join(os.tmpdir(), 'rv2_rhead_' + process.pid + '.mjs');
  fs.copyFileSync(R('engine/route-v2-worker.ascii.js'), tmp);
  try {
    const w = (await import(tmp)).default, call = (u, init) => w.fetch(new Request(u, init), {}, { waitUntil() { } });
    const post = b => call('https://x/screen/rhead', { method: 'POST', body: b, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } });
    const f = { m: 31, a: '신도림역', b: '수원역', fav: 1, sp: { ride: 25, wait: 2, walk: 4 }, why: '가장 빨리 도착하는 경로예요.', xs: [{ at: '신도림', fromType: 1, fromLine: '1호선', toType: 1, toLine: '2호선', walkMin: 3 }], tab: 'sub', ld: 0 };
    for (const part of ['h', 't', 'n', 'l']) {
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
    ok(has("'/screen/rhead'") && has("/^rh\\.(fav|close|room\\.(\\d)|ld\\.([mg])\\.(\\d)|tab\\.(fast|less|sub|bus|longdist))$/"), '웹: 결과 카드 연결부 + 엔진 주소 + rh.<행동> 만 처리');
  }
  console.log(`rhead_engine: ${pass} pass, ${fail} fail`);
  process.exit(fail ? 1 : 0);
})();
