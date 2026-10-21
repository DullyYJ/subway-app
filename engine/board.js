// 길동무 — 게시판 화면 엔진(뉴스 거르기·신고 숨김·정렬·제목 다듬기·시간 문구·메타 줄·반응/삭제/신고 단추 글·댓글 줄·화면 구성 JSON) 순수 계산 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수; 단일 출처)
//
// ★ 원칙(YJ): "모든 연산은 엔진이 한다. 앱은 엔진이 계산한 그림만 그린다."  (2026-10-18 서버 구동 화면 6호 — 커뮤니티 > 게시판)
//   예전엔 게시판의 '뉴스 글 빼기(_isNewsPost)'·신고한 글 숨김·최신순 정렬·제목 끝 지역 괄호 지우기·'N분 전' 문구·분류 딱지 색·조회/댓글 숫자 문구·
//   반응/삭제/신고 단추 글·댓글 목록 순서가 www/index.html 안에 있었다. 이제 앱은 '받아 둔 글 목록(원자료)'과 '지금 상태(더 보기 개수·두 번 누르기 대기·반응 표시)'만 보내고,
//   엔진이 무엇을 어떤 순서로 보일지·문구는 무엇인지까지 정해 화면 JSON 으로 내려 준다. 글을 펼치고 접는 것은 앱이 바로 한다(post 노드의 tog) — 펼친 내용(kids)까지 엔진이 미리 정해 보낸다.
//   앱(네이티브 ScreenCore/ScreenView)은 JSON 을 검증해 그리기만 한다. 웹 게시판 화면은 폴백(엔진·네이티브가 안 될 때)으로만 남는다.
//   ※ 글을 받아 오고 합치는 일(서버 /posts · 내 글 보관 · 로컬 글 만들기·중복 거르기)은 아직 웹 데이터 계층이 한다 — 화면에 보이는 모든 판단은 여기서 한다.
//
// 입력  boardScreen({ cap, now }, facts, rows)
//        cap   = 앱이 그릴 수 있는 화면 규격 수준(6 이상이어야 만든다)
//        facts = { n: 보일 글 수(기본 30, 더 보기 때마다 +30) · st: 'ready'|'loading' · arm: { k:'dl'|'rp', id }(두 번 눌러 확정 대기 중인 단추) ·
//                  rx: { 글번호: { like:1, lol:1, sad:1 } }(이 기기에서 누른 반응 표시) · rep: [신고한 글번호…] }
//        rows  = [글…]   글 = [번호, 분류, 제목, 본문, 글쓴이, 시각(ms), 조회, 좋아요, ㅋㅋ, ㅠㅠ, 서버 댓글 수, 표시비트, 링크, 댓글들]
//                표시비트: 1 내 글 · 2 이용자 글(신고 대상) · 4 전송 대기 · 8 서버 글 · 16 뉴스 글
//                댓글 = [번호, 글쓴이, 글, 시각, [[글쓴이, 글, 시각]… 답글]]
// 출력  { ok, v:1, screen:'board', rev, cover:'tab', head:[bar], body:[post…|button|text|spacer], info:{ n, all, ids:[post id…], idx:[원래 번호…] } }
//        post{ id:'p<번호>', title, cat, catc, nick, meta, kids:[text, btnrow, divider, cmt…, inbar] }
//        행동 이름(번호 = 앱이 보낸 배열의 원래 위치): bd.lk.<i> 좋아요 · bd.lo.<i> ㅋㅋ · bd.sd.<i> ㅠㅠ · bd.dl.<i> 삭제 · bd.rp.<i> 신고 · bd.cm.<i> 댓글 등록 · bd.more 더 보기 · bd.write 글쓰기
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var BOARD_SCREEN_V = 1;
var BRD_SHOW0 = 30, BRD_SHOW_MAX = 300, BRD_MAX_IN = 400, BRD_MAX_CMT = 60, BRD_MAX_REPLY = 10;
var BRD_CAT_COLOR = { '뉴스': '#0a84ff', '일상': '#34c759', '지연': '#ff9f0a', '혼잡': '#ff6b35', '정보': '#5e5ce6', '제보': '#ff375f' };   // 웹 _renderPost 의 CAT_COLOR 와 같다
var BRD_OTHER_COLOR = '#8e8e93';
var BRD_BLUE = '#0a84ff', BRD_RED = '#ff453a';

function brdStr(v, n) { return typeof v === 'string' ? v.slice(0, n) : (typeof v === 'number' && isFinite(v) ? String(v).slice(0, n) : ''); }
function brdInt(v, lo, hi) { var n = Math.floor(Number(v)); if (!isFinite(n)) n = lo; return n < lo ? lo : (n > hi ? hi : n); }
function brdHash(s) {                               // djb2 — 같은 화면이면 같은 rev
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
// 웹 _timeAgo 와 같다(현재 시각만 인자로)
function brdAgo(ms, now) {
  var diff = now - ms;
  if (diff < 30000) return '방금';
  if (diff < 60000) return '1분 전';
  if (diff < 120000) return '2분 전';
  if (diff < 3600000) return Math.floor(diff / 60000) + '분 전';
  if (diff < 86400000) {
    var h = Math.floor(diff / 3600000), leftMin = Math.floor((diff % 3600000) / 60000);
    if (leftMin > 0) return h + '시간 ' + leftMin + '분 전';
    return h + '시간 전';
  }
  return Math.floor(diff / 86400000) + '일 전';
}
// 웹 _isNewsPost 와 같다(뉴스 성격의 글인지 — 분류뿐 아니라 뉴스 링크·출처 표기까지 본다)
function brdIsNews(p) {
  if (!p) return false;
  if (p.cat === '뉴스' || p.news) return true;
  if (p.link && /news\.|newspaper|press|rss/i.test(String(p.link))) return true;
  if (/news\.google\.com|\[[^\]]{1,12}\]\s*보도/.test(String(p.body || ''))) return true;
  return false;
}
// 웹 _renderPost 의 제목 다듬기와 같다(끝의 지역명 괄호 지우기)
function brdTitle(t) { return String(t == null ? '' : t).replace(/\s*[\(（][^\(\)（）]*[\)）]\s*$/, '').trim(); }

function brdFacts(f) {
  f = (f && typeof f === 'object') ? f : {};
  var rx = {}, rep = {}, arm = null, i;
  if (f.rx && typeof f.rx === 'object') for (var k in f.rx) { if (Object.prototype.hasOwnProperty.call(f.rx, k) && f.rx[k] && typeof f.rx[k] === 'object') rx[String(k).slice(0, 60)] = f.rx[k]; }
  if (Array.isArray(f.rep)) for (i = 0; i < f.rep.length && i < 400; i++) rep[brdStr(f.rep[i], 60)] = 1;
  if (f.arm && typeof f.arm === 'object' && (f.arm.k === 'dl' || f.arm.k === 'rp')) arm = { k: f.arm.k, id: brdStr(f.arm.id, 60) };
  return { n: brdInt(f.n || BRD_SHOW0, BRD_SHOW0, BRD_SHOW_MAX), st: f.st === 'loading' ? 'loading' : 'ready', arm: arm, rx: rx, rep: rep };
}
function brdCmts(arr) {
  var out = [];
  if (!Array.isArray(arr)) return out;
  for (var i = 0; i < arr.length && out.length < BRD_MAX_CMT; i++) {
    var c = arr[i];
    if (!Array.isArray(c)) continue;
    var nick = brdStr(c[1], 40).trim(), text = brdStr(c[2], 400).trim();
    if (!text) continue;
    var rs = [];
    if (Array.isArray(c[4])) for (var q = 0; q < c[4].length && rs.length < BRD_MAX_REPLY; q++) {
      var r = c[4][q];
      if (Array.isArray(r) && brdStr(r[1], 400).trim()) rs.push({ nick: brdStr(r[0], 40).trim() || '익명', text: brdStr(r[1], 400).trim(), time: Number(r[2]) || 0 });
    }
    out.push({ nick: nick || '익명', text: text, time: Number(c[3]) || 0, replies: rs, ord: i });
  }
  out.sort(function (a, b) { return (a.time - b.time) || (a.ord - b.ord); });
  return out;
}
// 글 하나: 원자료 → 정리된 글. 번호/제목이 없으면 null
function brdOne(a, i) {
  if (!Array.isArray(a)) return null;
  var title = brdTitle(brdStr(a[2], 300));
  if (!title) return null;
  var fl = brdInt(a[11], 0, 255);
  return {
    i: i, id: brdStr(a[0], 60), cat: brdStr(a[1], 12), title: title, body: brdStr(a[3], 3000), nick: brdStr(a[4], 40).trim() || '익명',
    time: Number(a[5]) || 0, views: brdInt(a[6], 0, 99999999), like: brdInt(a[7], 0, 99999999), lol: brdInt(a[8], 0, 99999999), sad: brdInt(a[9], 0, 99999999),
    srv: brdInt(a[10], 0, 99999), mine: !!(fl & 1), user: !!(fl & 2), pending: !!(fl & 4), srvPost: !!(fl & 8), news: !!(fl & 16), link: brdStr(a[12], 400), cmts: brdCmts(a[13])
  };
}
// 웹 _ltIsBanned / _postSlug / _pseudoViews 와 같다(정치·분쟁 소재 글 빼기 · 역 이름만 다른 같은 글 하나만 · 서버가 조회수를 안 주면 글 번호와 경과 시간으로 정해 보이기)
var BRD_BAN_RE = /(정치|대통령|대선|총선|보궐|선거|후보\s*등록|국회|국정|의원|여당|야당|정당|민주당|국민의힘|개혁신당|진보당|장관|내각|청와대|탄핵|특검|검찰\s*수사|공수처|국정감사|시국|집회|시위|규탄|파업\s*투쟁|좌파|우파|보수\s*진영|진보\s*진영|친일|반일|반중|혐오|젠더\s*갈등|성별\s*갈등|페미|한남|한녀|종북|극우|극좌|이념)/;
function brdBanned(t) { try { return BRD_BAN_RE.test(String(t || '')); } catch (e) { return false; } }
function brdSlug(t) { return String(t || '').replace(/\{[a-z0-9]+\}/gi, '').replace(/[0-9]+/g, '').replace(/[^가-힣a-zA-Z]/g, '').slice(0, 20).toLowerCase(); }
function brdPseudoViews(id, ts, now) {
  var ageMin = Math.max(0, (now - (ts || now)) / 60000);
  var seed = ((id || 1) * 2654435761) % 233;
  return Math.floor((seed % 55) + 5 + Math.min(ageMin * 1.6, 420));
}
function brdPid(p, used) {
  var s = String(p.id).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 30);
  var id = 'p' + (s || ('i' + p.i));
  if (used[id]) id = 'p' + p.i + '_' + (s || 'x').slice(0, 20);
  used[id] = 1;
  return id;
}
function brdPostNode(p, pid, f, now) {
  var hide = (!p.cat || p.cat === '잡담' || p.cat === '일상');      // 잡담·빈 분류는 딱지 숨김(게시판은 딱지 없이 제목만)
  var cnt = Math.max(p.srv, p.cmts.length);
  var parts = [];
  if (p.pending) parts.push('전송 대기');
  parts.push(brdAgo(p.time, now)); parts.push('조회 ' + p.views);
  if (cnt > 0) parts.push('댓글 ' + cnt);
  var kids = [];
  var body = String(p.body || '').replace(/\n{2,}/g, '\n').trim();
  if (body) kids.push({ t: 'text', s: body, size: 13, lh: 1.8, pad: [0, 0, 0, 12] });
  var mineRx = f.rx[p.id] || {};
  function rb(label, n, type, verb) {
    var on = !!mineRx[type];
    var b = { label: label + ' ' + (n + (on ? 1 : 0)), act: { a: 'call', v: 'bd.' + verb + '.' + p.i, id: p.id } };
    if (on) { b.on = true; b.fill = 'rgba(10,132,255,0.13)'; b.line = BRD_BLUE; b.tc = BRD_BLUE; }
    return b;
  }
  var items = [rb('좋아요', p.like, 'like', 'lk'), rb('ㅋㅋ', p.lol, 'lol', 'lo'), rb('ㅠㅠ', p.sad, 'sad', 'sd')];
  if (p.mine) {
    var armD = f.arm && f.arm.k === 'dl' && f.arm.id === p.id;
    items.push({ label: armD ? '삭제 확인' : '삭제', right: true, tc: armD ? BRD_RED : 'sub', line: armD ? BRD_RED : 'border2', act: { a: 'call', v: 'bd.dl.' + p.i, id: p.id } });
  } else if (p.user) {
    var armR = f.arm && f.arm.k === 'rp' && f.arm.id === p.id;
    items.push({ label: armR ? '신고 확인' : '신고', right: true, tc: armR ? BRD_RED : 'sub', line: armR ? BRD_RED : 'border2', act: { a: 'call', v: 'bd.rp.' + p.i, id: p.id } });
  }
  kids.push({ t: 'btnrow', pad: [0, 0, 0, 12], gap: 8, h: 30, items: items });
  if (p.cmts.length) {
    kids.push({ t: 'divider', pad: [0, 0, 0, 10] });
    p.cmts.forEach(function (c) {
      kids.push({ t: 'cmt', pad: [0, 0, 0, 7], nick: c.nick, s: c.text, time: c.time ? brdAgo(c.time, now) : '' });
      c.replies.forEach(function (r) { kids.push({ t: 'cmt', pad: [0, 0, 0, 7], nick: r.nick, s: r.text, time: r.time ? brdAgo(r.time, now) : '', ind: true }); });
    });
  }
  kids.push({ t: 'inbar', pad: [0, p.cmts.length ? 6 : 0, 0, 0], key: 'c.' + pid.slice(1), hint: '댓글 남기기', btn: '등록', h: 36, r: 8, maxlen: 200, fill: 'card', line: 'border2', onc: BRD_BLUE, ckf: '#ffffff', act: { a: 'call', v: 'bd.cm.' + p.i, id: p.id, key: 'c.' + pid.slice(1) } });
  var n = { t: 'post', pad: [12, 0, 12, 8], id: pid, title: p.title, nick: p.nick, meta: parts.join(' · '), kids: kids };
  if (!hide) { n.cat = p.cat; n.catc = BRD_CAT_COLOR[p.cat] || BRD_OTHER_COLOR; }
  return n;
}

function boardScreen(inp, factsIn, rowsIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 6)) return { ok: false, error: 'cap' };
  var now = Number(inp.now) > 0 ? Number(inp.now) : Date.now();
  var f = brdFacts(factsIn);
  var all = [], i, seenSlug = {};
  if (Array.isArray(rowsIn)) for (i = 0; i < rowsIn.length && i < BRD_MAX_IN; i++) {
    var p = brdOne(rowsIn[i], i);
    if (!p || brdIsNews(p) || f.rep[p.id]) continue;
    if (p.srvPost) {                                              // 서버 글만: 정치·분쟁 소재 빼기 · 역 이름만 다른 같은 글 하나만 · 조회수 보정
      if (brdBanned(p.title) || brdBanned(p.body)) continue;
      var sg = brdSlug(p.title);
      if (sg) { if (seenSlug[sg]) continue; seenSlug[sg] = 1; }
      if (!p.views) p.views = brdPseudoViews(Number(p.id), p.time, now);
    }
    all.push(p);
  }
  all.sort(function (a, b) { return (b.time - a.time) || (a.i - b.i); });
  var shown = all.slice(0, f.n), used = {}, ids = [], idx = [], sid = [];
  var head = [{ t: 'bar', pad: [16, 10, 16, 8], title: '게시판', btn: '글쓰기', act: { a: 'call', v: 'bd.write' } }];
  var body = [];
  if (!all.length) {
    body.push({ t: 'text', s: f.st === 'loading' ? '게시글 불러오는 중...' : '아직 제보가 없습니다.\n첫 번째 제보자가 되어보세요!', size: 14, color: 'sub', lh: 1.8, align: 'center', pad: [20, 60, 20, 60] });
  } else {
    body.push({ t: 'spacer', h: 15 });
    shown.forEach(function (p) { var pid = brdPid(p, used); ids.push(pid); idx.push(p.i); sid.push(p.id); body.push(brdPostNode(p, pid, f, now)); });
    if (all.length > shown.length) body.push({ t: 'button', pad: [12, 4, 12, 0], s: '더 보기 · 남은 글 ' + (all.length - shown.length) + '개', size: 12, h: 40, act: { a: 'call', v: 'bd.more' } });
    body.push({ t: 'spacer', h: 28 });
  }
  var out = { ok: true, v: 1, screen: 'board', cover: 'tab', head: head, body: body, info: { n: shown.length, all: all.length, ids: ids, idx: idx, sid: sid } };
  out.rev = 'b' + BOARD_SCREEN_V + ':' + brdHash(JSON.stringify([head, body]));
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { boardScreen: boardScreen, brdBanned: brdBanned, brdSlug: brdSlug, brdPseudoViews: brdPseudoViews, brdAgo: brdAgo, brdIsNews: brdIsNews, brdTitle: brdTitle, brdFacts: brdFacts, brdOne: brdOne, BRD_CAT_COLOR: BRD_CAT_COLOR };
