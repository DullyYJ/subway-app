// 길동무 — 실시간소통 화면 엔진(노선 칩 순서·색·내 노선 표시·공식 공지/지연 제보 배너 문구·말풍선 줄·시각 문구·빈/불러오는 상태 글·입력줄·화면 구성 JSON) 순수 계산 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수; 단일 출처)
//
// ★ 원칙(YJ): "모든 연산은 엔진이 한다. 앱은 엔진이 계산한 그림만 그린다."  (2026-10-18 서버 구동 화면 7호 — 커뮤니티 > 실시간소통)
//   예전엔 실시간소통의 칩 순서(_chatItems: 전체 → 내가 탄 노선 → 나머지 호선)·내 노선 강조·공식 공지/지연 제보 배너 문구(_offText·_lrRenderOfficial·_lrRenderAlert)·
//   말풍선 줄(_chatBubbleHtml·_lrAppend)·시각 문구(_lrTime)·빈 방/불러오는 중 안내가 www/index.html 안에 있었다.
//   이제 앱은 '받아 둔 대화(원자료)'와 '지금 상태(고른 방·내 노선·숨긴 글·시간대)'만 보내고, 엔진이 무엇을 어떤 순서로 보일지·문구는 무엇인지까지 정해 화면 JSON 으로 내려 준다.
//   앱(네이티브 ScreenCore/ScreenView)은 JSON 을 검증해 그리기만 한다. 웹 실시간소통 화면은 폴백(엔진·네이티브가 안 될 때)으로만 남는다.
//   ※ 대화를 받아 오고(서버 /talks · /lroom 6초 폴링) 보내는 일(/react)·커뮤니티 아이디 확인은 아직 웹 데이터 계층이 한다 — 화면에 보이는 모든 판단은 여기서 한다.
//
// 입력  chatScreen({ cap, now }, facts, data)
//        cap   = 앱이 그릴 수 있는 화면 규격 수준(6 이상이어야 만든다)
//        facts = { sel: 'all'|노선이름 · mine: [내가 탄 노선…](많이 탄 순, 지금 경로 노선 먼저) · lc: { 노선: '#rrggbb' }(칩 색) · st: 'ready'|'loading'|'fail' ·
//                  tzo: 이 기기의 시간대(분, Date.getTimezoneOffset) · me: 내 아이디 · hid: [내가 신고해 숨긴 글번호…] }
//        data  = { g: [[글쓴이, 글, 시각(ms), 내것(0|1), 노선]…](전체 방) · r: [[번호, 시각, 글쓴이, 글, 종류('delay'|'crowd'|'')]…](노선 방) ·
//                  off: 이 노선의 공식 공지 { text, title, ts, estimated, suspect } | null · offOk: 공지 조회가 됐나(0|1) · offAt: 조회 시각 · al: { reporters, stations:[{stn,n}] } | null }
// 출력  { ok, v:1, screen:'chat', rev, cover:'tab', anchor:'bottom', head:[chips, text?, box?, box?], body:[msg…|text], foot:[inbar], info:{ sel, n } }
//        행동 이름: ch.send 보내기 · ch.x.<번호> 노선 방 글 신고(번호 = 앱이 보낸 r 배열의 원래 위치) · 칩은 {a:'cat', v:노선|'all'}
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var CHAT_SCREEN_V = 1;
var CHT_ALTS_MAX = 24;                // 한 요청에 실을 수 있는 '다른 방' 수 상한(전체 + 호선 18개)
var CHT_COMMON = ['1호선', '2호선', '3호선', '4호선', '5호선', '6호선', '7호선', '8호선', '9호선', '신분당선', '수인분당선', '경의중앙선', '공항철도', '경춘선', 'GTX-A'];   // 웹 _LR_COMMON
var CHT_KNOWN = CHT_COMMON.concat(['인천1호선', '인천2호선', '김포골드라인']);                                                                                          // 웹 _LR_KNOWN
var CHT_MAX_G = 120, CHT_MAX_R = 150, CHT_IN_G = 300, CHT_IN_R = 400;

function chtStr(v, n) { return typeof v === 'string' ? v.slice(0, n) : (typeof v === 'number' && isFinite(v) ? String(v).slice(0, n) : ''); }
function chtHash(s) {                               // djb2 — 같은 화면이면 같은 rev
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function chtCssColor(c) { return (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) ? c : ''; }
// 웹 _lrTime 과 같다(HH:MM) — 이 기기의 시간대로(서버는 UTC 라 tzo 분을 받아 보정한다)
function chtTime(ts, tzo) {
  var d = new Date(Number(ts) - (Number(tzo) || 0) * 60000), p = function (n) { return (n < 10 ? '0' : '') + n; };
  return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
}
// 웹 _offAgo 와 같다
function chtOffAgo(ts, now) { var m = Math.max(0, Math.round((now - ts) / 60000)); return m < 1 ? '방금' : (m < 60 ? m + '분 전' : Math.round(m / 60) + '시간 전'); }

function chtFacts(f) {
  f = (f && typeof f === 'object') ? f : {};
  var sel = chtStr(f.sel, 30) || 'all';
  if (sel !== 'all' && CHT_KNOWN.indexOf(sel) < 0) sel = 'all';
  var mine = [];
  if (Array.isArray(f.mine)) f.mine.forEach(function (l) { if (CHT_KNOWN.indexOf(l) >= 0 && mine.indexOf(l) < 0 && mine.length < 8) mine.push(l); });
  var lc = {};
  if (f.lc && typeof f.lc === 'object') CHT_KNOWN.forEach(function (l) { var c = chtCssColor(f.lc[l]); if (c) lc[l] = c; });
  var hid = {};
  if (Array.isArray(f.hid)) f.hid.forEach(function (i, q) { if (q < 400) hid[chtStr(i, 40)] = 1; });
  return { sel: sel, mine: mine, lc: lc, st: (f.st === 'loading' || f.st === 'fail') ? f.st : 'ready', tzo: isFinite(Number(f.tzo)) ? Number(f.tzo) : 0, me: chtStr(f.me, 40), hid: hid };
}
// 칩 순서(웹 _chatItems): 전체 → 내가 탄 노선 → 나머지 호선. 목록 밖 노선(알림 등으로 연 방)이면 맨 뒤에 붙인다.
function chtItems(f) {
  var rest = CHT_KNOWN.filter(function (l) { return f.mine.indexOf(l) < 0; });
  return ['all'].concat(f.mine, rest);
}

// 배너 글: 조각 [글, 굵게] 들을 이어 붙이고 굵은 구간 [시작,끝] 목록을 만든다
function chtJoin(parts) {
  var s = '', hl = [];
  parts.forEach(function (p) { if (p[1] && p[0].length) hl.push([s.length, s.length + p[0].length]); s += p[0]; });
  return { s: s, hl: hl };
}
function chtOffParts(l, n, now) {                  // 웹 _offText 와 같은 문구(그림말 제외)
  if (n && n.estimated) {
    var txt = String(n.text || '').replace(/\s+/g, ' ').trim();
    return n.suspect
      ? [[l + ' 지연 의심 (도착 간격 기준 추정)', 1], [' · ' + txt + ' (' + chtOffAgo(n.ts, now) + ' · 공식 공지 아님)', 0]]
      : [[l + ' 정상 운행 중으로 보여요 (도착 간격 기준)', 1], [' (' + chtOffAgo(n.ts, now) + ')', 0]];
  }
  var t = String(n.text || n.title || '').replace(/\s+/g, ' ').trim();
  if (t.length > 110) t = t.slice(0, 108).replace(/\s+\S*$/, '') + '…';
  var pre = (t.indexOf(l) === 0) ? '' : l + ' — ';
  return [['서울교통공사 공지', 1], [' · ' + pre + t + ' (' + chtOffAgo(n.ts, now) + ')', 0]];
}
var CHT_ALERT = { fill: 'rgba(10,132,255,.12)', line: 'rgba(10,132,255,.35)' }, CHT_QUIET = { fill: 'rgba(142,142,147,.10)', line: 'rgba(142,142,147,.28)' }, CHT_WARN = { fill: 'rgba(255,159,10,.14)', line: 'rgba(255,159,10,.4)' }, CHT_STRONG = { fill: 'rgba(255,69,58,.14)', line: 'rgba(255,69,58,.4)' };
function chtBox(parts, col) {
  var j = chtJoin(parts), b = { t: 'box', pad: [12, 4, 12, 0], ip: [11, 8, 11, 8], s: j.s, size: 12, lh: 1.5, color: 'text', fill: col.fill, line: col.line, r: 10 };
  if (j.hl.length) b.hl = j.hl;
  return b;
}
// 공식 공지 배너(웹 _lrRenderOfficial). 조회가 안 됐으면 배너 없음
function chtOfficial(line, data, now) {
  if (!data || !data.offOk) return null;
  var n = data.off && typeof data.off === 'object' ? data.off : null;
  if (n && n.estimated) return chtBox(chtOffParts(line, n, now), n.suspect ? CHT_WARN : CHT_QUIET);
  if (n) return chtBox(chtOffParts(line, n, now), CHT_ALERT);
  var at = Number(data.offAt) > 0 ? Number(data.offAt) : now;
  if (line === '경의중앙선' || line === '공항철도') return chtBox([[line + '은(는) 서울교통공사 환승역 관련 공지만 가끔 올라와요 · 지금은 없어요 · 아래 이용자 제보로 알려 드려요', 0]], CHT_QUIET);
  if (/^[1-8]호선$/.test(line)) return chtBox([[line + ' 정상 운행 중입니다', 1], [' (' + chtOffAgo(at, now) + ' 확인)', 0]], CHT_QUIET);
  if (/선$/.test(line) || /^(공항철도|경의중앙|수인분당|신분당|경춘|경강|서해|GTX)/.test(line)) return chtBox([[line + '은(는) 공식 공지 연동 전이에요 · 아래 이용자 제보로 알려 드려요', 0]], CHT_QUIET);
  return null;
}
// 지연 제보 집계 배너(웹 _lrRenderAlert)
function chtAlert(al) {
  var n = Math.floor(Number(al && al.reporters)) || 0;
  if (!n) return null;
  var st = (Array.isArray(al.stations) ? al.stations : []).slice(0, 6).map(function (x) { return chtStr(x && x.stn, 20) + ' ' + (Math.floor(Number(x && x.n)) || 0) + '명'; }).join(', ');
  var strong = n >= 3;
  return chtBox([[strong ? '지연 제보가 모이고 있어요' : '지연 제보가 있어요', 1], [' · 최근 30분 ' + n + '명' + (st ? ' (' + st + ')' : '') + (strong ? '' : ' — 아직 확인 중이에요'), 0]], strong ? CHT_STRONG : CHT_WARN);
}

function chtMsgG(a, f) {
  if (!Array.isArray(a)) return null;
  var text = chtStr(a[1], 400).trim();
  if (!text) return null;
  var line = chtStr(a[4], 20), ts = Number(a[2]) || 0, mine = a[3] === 1 || a[3] === true;
  var n = { t: 'msg', pad: [12, 0, 12, 10], s: text, time: chtTime(ts, f.tzo) };
  if (mine) n.mine = true; else { n.nick = chtStr(a[0], 40) || '익명'; if (line) n.pre = '(' + line + ')'; }
  return { ts: ts, node: n };
}
function chtMsgR(a, i, f) {
  if (!Array.isArray(a)) return null;
  var id = chtStr(a[0], 40), text = chtStr(a[3], 400).trim();
  if (!text || f.hid[id]) return null;
  var ts = Number(a[1]) || 0, nick = chtStr(a[2], 40) || '익명', mine = !!(f.me && nick === f.me), kind = chtStr(a[4], 10);
  var n = { t: 'msg', pad: [12, 0, 12, 10], s: text, time: chtTime(ts, f.tzo) };
  if (mine) n.mine = true; else { n.nick = nick; n.go = '신고'; n.act = { a: 'call', v: 'ch.x.' + i }; }
  if (kind === 'delay') { n.badge = '지연'; n.bc = '#ff453a'; } else if (kind === 'crowd') { n.badge = '혼잡'; n.bc = '#ff9f0a'; }
  return { ts: ts, i: i, node: n };
}

function chatScreen(inp, factsIn, dataIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 6)) return { ok: false, error: 'cap' };
  var now = Number(inp.now) > 0 ? Number(inp.now) : Date.now();
  var f = chtFacts(factsIn), d = (dataIn && typeof dataIn === 'object') ? dataIn : {}, i;
  var chips = chtItems(f).map(function (l) {
    var it = { label: l === 'all' ? '전체' : (f.mine.indexOf(l) >= 0 ? '내 ' + l : l), on: l === f.sel, act: { a: 'cat', v: l } };
    if (l !== 'all' && f.lc[l]) it.c = f.lc[l];
    return it;
  });
  var head = [{ t: 'chips', pad: [16, 4, 16, 4], gap: 6, h: 30, onc: 'gold', onfg: '#ffffff', items: chips }];
  if (!f.mine.length) head.push({ t: 'text', s: '내가 탄 노선은 앞에 표시돼요', size: 11, color: 'sub', pad: [18, 0, 16, 4] });
  var body = [], n = 0;
  if (f.sel === 'all') {
    var gs = [];
    if (Array.isArray(d.g)) for (i = Math.max(0, d.g.length - CHT_IN_G); i < d.g.length; i++) { var g = chtMsgG(d.g[i], f); if (g) gs.push(g); }
    gs.sort(function (a, b) { return a.ts - b.ts; });
    gs = gs.slice(-CHT_MAX_G); n = gs.length;
    if (!gs.length) body.push({ t: 'text', s: f.st === 'fail' ? '연결이 불안정해요. 잠시 후 다시 불러올게요.' : '대화를 불러오는 중...', size: 13, color: 'sub', lh: 1.7, align: 'center', pad: [20, 40, 20, 40] });
    body = [{ t: 'spacer', h: 4 }].concat(gs.length ? gs.map(function (x) { return x.node; }).concat([{ t: 'spacer', h: 4 }]) : body);
  } else {
    var off = chtOfficial(f.sel, d, now), al = chtAlert(d.al);
    if (off) head.push(off);
    if (al) head.push(al);
    var rs = [];
    if (Array.isArray(d.r)) for (i = 0; i < d.r.length && i < CHT_IN_R; i++) { var r = chtMsgR(d.r[i], i, f); if (r) rs.push(r); }
    rs.sort(function (a, b) { return (a.ts - b.ts) || (a.i - b.i); });
    rs = rs.slice(-CHT_MAX_R); n = rs.length;
    if (!rs.length) {
      var s = f.st === 'loading' ? '불러오는 중…' : f.st === 'fail' ? '연결이 불안정해요. 잠시 후 다시 불러올게요.'
        : '아직 ' + f.sel + ' 방에 글이 없어요.\n첫 글을 남겨보세요! 지금 타고 계신다면 한마디 어때요?';
      body.push({ t: 'text', s: s, size: 13, color: 'sub', lh: 1.7, align: 'center', pad: [20, 40, 20, 40] });
    } else body = [{ t: 'spacer', h: 4 }].concat(rs.map(function (x) { return x.node; }), [{ t: 'spacer', h: 4 }]);
  }
  var foot = [{ t: 'inbar', pad: [12, 10, 12, 10], key: f.sel === 'all' ? 'chat.all' : 'chat.room', hint: f.sel === 'all' ? '메시지를 입력하세요...' : '이 노선 이용자에게 한마디…', btn: '전송', h: 38, r: 19, maxlen: f.sel === 'all' ? 200 : 120, fill: 'card', line: 'border2', act: { a: 'call', v: 'ch.send' } }];
  var out = { ok: true, v: 1, screen: 'chat', cover: 'tab', anchor: 'bottom', head: head, body: body, foot: foot, info: { sel: f.sel, n: n } };
  out.rev = 'c' + CHAT_SCREEN_V + ':' + chtHash(JSON.stringify([head, body, foot]));
  return out;
}

// ★ 2026-10-19 s67 (YJ: 실시간소통에서 각 호선을 누를 때 로딩이 너무 오래 걸려): 같은 요청에 '다른 방들의 사실·자료(altsIn = { 키:{ f, d } })'를 실어 보내면
//   엔진이 한 번에 모든 방 화면을 계산해 out.alts[키] 로 돌려준다. 앱은 받은 화면을 방별로 기억해 두었다가 칩을 누르면 요청 없이 그대로 올린다(계산은 엔진, 앱은 그리기).
//   각 alts[키] 는 그 방으로 따로 요청했을 때와 글자 하나까지 같은 화면이다(시험이 대조한다).
function chatScreens(inp, factsIn, dataIn, altsIn) {
  var out = chatScreen(inp, factsIn, dataIn);
  if (!out || !out.ok) return out;
  if (altsIn && typeof altsIn === 'object' && !Array.isArray(altsIn)) {
    var ks = Object.keys(altsIn).slice(0, CHT_ALTS_MAX), alts = {};
    for (var i = 0; i < ks.length; i++) {
      var a = altsIn[ks[i]];
      if (!a || typeof a !== 'object') continue;
      var o2 = chatScreen(inp, a.f, a.d);
      if (o2 && o2.ok) alts[ks[i]] = o2;
    }
    out.alts = alts;
  }
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { chatScreen: chatScreen, chatScreens: chatScreens, chtFacts: chtFacts, chtItems: chtItems, chtTime: chtTime, chtOfficial: chtOfficial, chtAlert: chtAlert, CHT_KNOWN: CHT_KNOWN };
