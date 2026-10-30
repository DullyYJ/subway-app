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
//        행동 이름: ch.send 보내기 · ch.x.<번호> 노선 방 글 신고(번호 = 앱이 보낸 r 배열의 원래 위치 · act.id = 그 글의 고유 id — 새 앱은 id 를 먼저 쓴다) · 칩은 {a:'cat', v:노선|'all'}
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var CHAT_SCREEN_V = 3;
var chtTrkColor = (typeof rheadTrkColor === 'function') ? rheadTrkColor : null;      // 노선 색은 타임라인(rhead)과 같은 표를 쓴다. Node 시험에서는 아래에서 불러온다.
if (!chtTrkColor) { try { if (typeof require === 'function') chtTrkColor = require('./rhead').rheadTrkColor; } catch (eRq) {} }
var CHT_ALTS_MAX = 24;                // 한 요청에 실을 수 있는 '다른 방' 수 상한(전체 + 호선 18개)
var CHT_COMMON = ['1호선', '2호선', '3호선', '4호선', '5호선', '6호선', '7호선', '8호선', '9호선', '신분당선', '수인분당선', '경의중앙선', '공항철도', '경춘선', 'GTX-A'];   // 웹 _LR_COMMON
var CHT_KNOWN = CHT_COMMON.concat(['인천1호선', '인천2호선', '김포골드라인']);                                                                                          // 웹 _LR_KNOWN
var CHT_MAX_G = 120, CHT_MAX_R = 150, CHT_IN_G = 300, CHT_IN_R = 400;
// ★ 2026-10-29 (YJ: "커뮤니티 아이디 호선별로 다 다르게, 같은 호선에는 같은 아이디 불가. 전체 탭에선 아이디 앞의 호선은 지워줘"):
//   서버(board-writer)가 대화를 채우는 AI 말투 30명(NICKS)의 이름은 모든 호선이 똑같이 쓰고 있어 같은 이름이 호선마다 나왔다.
//   그래서 엔진이 보여 줄 때 (호선, 이름) → 그 호선만의 아이디로 바꾼다: 같은 호선 안에서 한 사람은 늘 같은 아이디(같은 사람이 계속 말한다), 서로 다른 사람은 다른 아이디,
//   호선이 다르면 아이디가 하나도 겹치지 않는다(18개 호선 × 30명 = 540개를 1,600가지 조합에서 겹치지 않게 뽑는다). 이용자가 직접 정한 아이디(내 것·남의 것)는 그대로 둔다.
var CHT_PERSONAS = ['회식거절마스터', '지하철덕후', '지하철폐인', '대학원노예', '출근지옥러', '자취N년차', '삼성역출퇴근', '판교셔틀버스', '여의도금융맨', '구로공단아재', '성수동힙스터', '칼퇴요정', '월급루팡꿈나무', '환승의달인', '급행만타는사람',
  '막차의전설', '첫차타는사람', '9호선생존자', '점심메뉴고민중', '퇴사각재는중', '신입사원1일차', '부장님피하기달인', '재택희망자', '야근수당러버', '주말출근싫어', '불금기다림', '카페인수혈중', '다이어트내일부터', '운동간다말만', '집이최고야'];
var CHT_ID_ADJ = ['졸린', '배고픈', '지친', '신난', '바쁜', '느긋한', '수다쟁이', '조용한', '퇴근하는', '출근하는', '야근하는', '막차탄', '첫차탄', '급행탄', '환승하는', '서있는', '앉고싶은', '졸고있는', '늦잠잔', '일찍온',
  '커피마신', '도시락싼', '우산든', '패딩입은', '이어폰낀', '책읽는', '게임하는', '음악듣는', '창밖보는', '손잡이잡은', '가방멘', '마스크쓴', '모자쓴', '안경쓴', '운동하는', '산책하는', '웃는', '투덜대는', '꿈꾸는', '기다리는'];
var CHT_ID_NOUN = ['직장인', '대학생', '승객', '곰돌이', '여우', '고양이', '다람쥐', '펭귄', '너구리', '햄스터', '토끼', '거북이', '고래', '부엉이', '두더지', '코알라', '판다', '수달', '오리', '참새',
  '강아지', '사슴', '라쿤', '하마', '기린', '알파카', '쿼카', '돌고래', '병아리', '고슴도치', '미어캣', '치타', '오소리', '청설모', '물개', '비버', '양', '염소', '당나귀', '주민'];
function chtLineNick(line, nick) {
  var pi = CHT_PERSONAS.indexOf(nick), li = CHT_KNOWN.indexOf(line);
  if (pi < 0 || li < 0) return nick;
  var c = ((li * CHT_PERSONAS.length + pi) * 37) % (CHT_ID_ADJ.length * CHT_ID_NOUN.length);      // 37 과 1600 은 서로소 → (호선, 사람) 마다 다른 조합
  return CHT_ID_ADJ[c % CHT_ID_ADJ.length] + CHT_ID_NOUN[Math.floor(c / CHT_ID_ADJ.length)];
}

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

// s330(YJ: 내가 친 대화가 너무 늦게 떠 · 0.1초 안에): 앱이 방금 보낸 글(전송 중)을 [글, 시각] 로 알려 주면 서버 글에 아직 없을 때만 내 말풍선으로 맨 끝에 보탠다.
//   서버 글에 같은 글(내 것 · 시각이 비슷)이 생기면 자연히 빠진다 — 판단은 엔진, 앱은 보낸 글을 적어 두기만 한다.
var CHT_PEND_TIME = '전송 중';
function chtPend(a) {
  var out = [];
  if (Array.isArray(a)) a.slice(0, 5).forEach(function (x) { if (Array.isArray(x)) { var t = chtStr(x[0], 400).trim(), ts = Number(x[1]) || 0; if (t) out.push({ t: t, ts: ts }); } });
  return out;
}
function chtPendNodes(f, mineMsgs) {            // mineMsgs: 서버 글 중 내 것 [{ s, ts }]
  var out = [];
  f.pend.forEach(function (p) {
    var done = mineMsgs.some(function (m) { return m.s === p.t && (!p.ts || !m.ts || m.ts >= p.ts - 90000); });
    if (!done) out.push({ t: 'msg', pad: [12, 0, 12, 10], s: p.t, time: CHT_PEND_TIME, mine: true });
  });
  return out;
}
function chtFacts(f) {
  f = (f && typeof f === 'object') ? f : {};
  var sel = chtStr(f.sel, 30) || 'all';
  if (sel !== 'all' && CHT_KNOWN.indexOf(sel) < 0) sel = 'all';
  var mine = [];
  if (Array.isArray(f.mine)) f.mine.forEach(function (l) { if (CHT_KNOWN.indexOf(l) >= 0 && mine.indexOf(l) < 0 && mine.length < 8) mine.push(l); });
  else mine = chtMineLines(f.sec, f.my, f.ride);                      // 앱은 지금 경로의 지하철 구간 이름(sec)과 탄 기록(my)만 준다 — 앞에 둘 노선은 엔진이 정한다
  var lc = {};
  if (f.lc && typeof f.lc === 'object') CHT_KNOWN.forEach(function (l) { var c = chtCssColor(f.lc[l]); if (c) lc[l] = c; });
  var th = f.th === 'pastel' ? 'pastel' : 'dark';
  if (chtTrkColor) CHT_KNOWN.forEach(function (l) { if (!lc[l]) lc[l] = chtTrkColor(1, l, th); });   // 노선 색은 타임라인과 같은 표(rhead)에서
  var hid = {};
  if (Array.isArray(f.hid)) f.hid.forEach(function (i, q) { if (q < 400) hid[chtStr(i, 40)] = 1; });
  return { my: Array.isArray(f.my) ? f.my : [], sel: sel, mine: mine, lc: lc, st: (f.st === 'loading' || f.st === 'fail') ? f.st : 'ready', tzo: isFinite(Number(f.tzo)) ? Number(f.tzo) : 0, me: chtStr(f.me, 40), hid: hid, pend: chtPend(f.pend) };
}
// 지금 경로의 지하철 노선(웹 _routeSubLines): 경로 순서 노선만 앞에 둔다(최대 8개). 경로가 없으면 빈 목록 = 호선 순서 원래대로.
//   sec = 경로의 지하철 구간 이름들, my = 탄 기록(칩 순서에는 더 쓰지 않는다 — 글 붙일 노선(info.pl)만 쓴다)
//   ride = 탑승 안내 중이면 { here(지금 노드 번호), nodes:[{isSub, lineName}…] } — 이미 지나온 노선은 빼고 '지금 타는 노선부터 남은 노선'만 앞에 둔다
//          (1호선→2호선→3호선 경로: 1호선 타는 동안 1·2·3 · 2호선으로 갈아타면 2·3 · 3호선이면 3). 안내가 끝나 경로가 없으면 sec 도 비어 와서 원래 순서로 돌아간다.
function chtLineHit(raw) {
  var nm = String(raw == null ? '' : raw).replace(/\s+/g, '');
  if (!nm) return '';
  var hit = CHT_KNOWN.indexOf(nm) >= 0 ? nm : '';
  if (!hit) CHT_KNOWN.forEach(function (k) { if (nm.indexOf(k) >= 0 && k.length > hit.length) hit = k; });
  return hit;
}
function chtRideLines(ride) {
  if (!ride || typeof ride !== 'object' || !Array.isArray(ride.nodes)) return null;
  var here = Math.floor(Number(ride.here)), out = [];
  if (!isFinite(here) || here < 1) here = 1;
  ride.nodes.slice(0, 80).forEach(function (n, i) {
    if (i < here || !n || typeof n !== 'object' || !n.isSub) return;
    var h = chtLineHit(n.lineName);
    if (h && out.indexOf(h) < 0) out.push(h);
  });
  return out.length ? out : null;
}
function chtMineLines(sec, my, ride) {
  var cur = [];
  if (Array.isArray(sec)) sec.forEach(function (raw) {
    var hit = chtLineHit(raw);
    if (hit && cur.indexOf(hit) < 0) cur.push(hit);
  });
  var rl = cur.length ? chtRideLines(ride) : null;        // 경로가 없으면 탑승 정보도 쓰지 않는다
  if (rl) cur = rl;
  return cur.slice(0, 8);                                  // s318(YJ): 탄 기록(my)으로 앞에 붙잡아 두지 않는다 — 경로가 끝나면 호선 순서는 원래대로
}
// 탄 기록(웹 _myLinesList): 자주 탄 순 — 글을 붙일 기본 노선(info.pl)을 정할 때만 쓴다
function chtMyOrder(my) {
  if (!Array.isArray(my)) return [];
  return my.filter(function (x) { return x && CHT_KNOWN.indexOf(x.l) >= 0; })
    .sort(function (x, y) { return ((y.n || 0) - (x.n || 0)) || ((y.t || 0) - (x.t || 0)); }).map(function (x) { return x.l; });
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
  if (n && n.estimated) return n.suspect ? chtBox(chtOffParts(line, n, now), CHT_WARN) : null;               // '정상 운행 중으로 보여요' 추정 상자도 그리지 않는다(지연 의심만)
  if (n) return chtBox(chtOffParts(line, n, now), CHT_ALERT);
  return null;                                                    // s355(YJ): 올라온 공지가 없을 때의 안내 상자(정상 운행 중 · 연동 전 · 공지 없음)는 그리지 않는다 — 실제 공지·지연 의심만 보인다
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
  if (mine) n.mine = true; else n.nick = chtLineNick(line, chtStr(a[0], 40) || '익명');           // 전체 방: 아이디 앞의 (호선) 표기는 없앴다(YJ 10-29) — 아이디가 호선마다 달라 구분된다
  return { ts: ts, node: n };
}
function chtMsgR(a, i, f) {
  if (!Array.isArray(a)) return null;
  var id = chtStr(a[0], 40), text = chtStr(a[3], 400).trim();
  if (!text || f.hid[id]) return null;
  var ts = Number(a[1]) || 0, nick = chtStr(a[2], 40) || '익명', mine = !!(f.me && nick === f.me), kind = chtStr(a[4], 10);
  var n = { t: 'msg', pad: [12, 0, 12, 10], s: text, time: chtTime(ts, f.tzo) };
  if (mine) n.mine = true; else { n.nick = chtLineNick(f.sel, nick); n.go = '신고'; n.act = { a: 'call', v: 'ch.x.' + i, id: id }; }
  if (kind === 'delay') { n.badge = '지연'; n.bc = '#ff453a'; } else if (kind === 'crowd') { n.badge = '혼잡'; n.bc = '#ff9f0a'; }
  return { ts: ts, i: i, node: n };
}

function chatScreen(inp, factsIn, dataIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 6)) return { ok: false, error: 'cap' };
  var now = Number(inp.now) > 0 ? Number(inp.now) : Date.now();
  var f = chtFacts(factsIn), d = (dataIn && typeof dataIn === 'object') ? dataIn : {}, i;
  var chips = chtItems(f).map(function (l) {
    var mine = l !== 'all' && f.mine.indexOf(l) >= 0, col = l !== 'all' && f.lc[l] ? f.lc[l] : '';
    var it = { label: l === 'all' ? '전체' : (mine ? '\ud83d\udccd ' + l : l), on: l === f.sel, act: { a: 'cat', v: l } };       // 웹: 내가 탄 노선은 📍 + 노선 색 2px 테두리 · 켜진 칸은 1.5px
    if (col) it.c = col;
    if (it.on) it.bw = 1.5; else if (mine) { it.bw = 2; if (col) it.ob = col; }
    return it;
  });
  var head = [{ t: 'chips', pad: [14, 0, 14, 2], gap: 6, h: 31, fs: 12.5, px: 15, onc: 'gold', onfg: '#ffffff', offb: 'border2', offt: 'text', items: chips }];       // 웹 .chat-line-chip: 12.5px · 높이 31 · 아래 2
  if (!f.mine.length) head.push({ t: 'text', s: '📍 내가 탄 노선은 앞에 표시돼요', size: 11, color: 'sub', lh: 1.4, pad: [16, 3, 16, 2] });
  head.push({ t: 'divider', pad: [0, f.mine.length ? 6 : 4, 0, 0], c: 'border' });                    // 웹 .comm-fixed-top 아래 1px 줄 (머리 103)
  var body = [], n = 0;
  if (f.sel === 'all') {
    var gs = [];
    if (Array.isArray(d.g)) for (i = Math.max(0, d.g.length - CHT_IN_G); i < d.g.length; i++) { var g = chtMsgG(d.g[i], f); if (g) gs.push(g); }
    gs.sort(function (a, b) { return a.ts - b.ts; });
    gs = gs.slice(-CHT_MAX_G); n = gs.length;
    var pn = chtPendNodes(f, gs.filter(function (x) { return x.node.mine; }).map(function (x) { return { s: x.node.s, ts: x.ts }; }));
    if (!gs.length) body.push({ t: 'text', s: f.st === 'fail' ? '연결이 불안정해요. 잠시 후 다시 불러올게요.' : '대화를 불러오는 중...', size: 13, color: 'sub', lh: 1.7, align: 'center', pad: [20, 40, 20, 40] });
    body = [{ t: 'spacer', h: 4 }].concat(gs.length || pn.length ? gs.map(function (x) { return x.node; }).concat(pn, [{ t: 'spacer', h: 4 }]) : body);
  } else {
    var off = chtOfficial(f.sel, d, now), al = chtAlert(d.al);
    if (off) head.push(off);
    if (al) head.push(al);
    var rs = [];
    if (Array.isArray(d.r)) for (i = 0; i < d.r.length && i < CHT_IN_R; i++) { var r = chtMsgR(d.r[i], i, f); if (r) rs.push(r); }
    rs.sort(function (a, b) { return (a.ts - b.ts) || (a.i - b.i); });
    rs = rs.slice(-CHT_MAX_R); n = rs.length;
    var pn = chtPendNodes(f, rs.filter(function (x) { return x.node.mine; }).map(function (x) { return { s: x.node.s, ts: x.ts }; }));
    if (!rs.length && !pn.length) {
      var s = f.st === 'loading' ? '불러오는 중…' : f.st === 'fail' ? '연결이 불안정해요. 잠시 후 다시 불러올게요.'
        : '아직 ' + f.sel + ' 방에 글이 없어요.\n첫 글을 남겨보세요! 지금 타고 계신다면 한마디 어때요?';
      body.push({ t: 'text', s: s, size: 13, color: 'sub', lh: 1.7, align: 'center', pad: [20, 40, 20, 40] });
    } else body = [{ t: 'spacer', h: 4 }].concat(rs.map(function (x) { return x.node; }), pn, [{ t: 'spacer', h: 4 }]);
  }
  var foot = [{ t: 'inbar', pad: [12, 10, 12, 10], key: f.sel === 'all' ? 'chat.all' : 'chat.room', hint: f.sel === 'all' ? '메시지를 입력하세요...' : '이 노선 이용자에게 한마디…', btn: '전송', h: 38, inh: 37, bh: 38, bicon: 'M5 3L21 12L5 21L8.5 12Z', ckf: '#121214', r: 18.5, maxlen: f.sel === 'all' ? 200 : 120, fill: 'card', line: 'border2', act: { a: 'call', v: 'ch.send' } }];       // 웹 .chat-inputbar: 입력 37 + 파란 동그라미 ➤ 38 · 위 1px 줄 + 위아래 10
  foot.unshift({ t: 'divider', pad: [0, 0, 0, 0], c: 'border' });
  var out = { ok: true, v: 1, screen: 'chat', cover: 'tab', anchor: 'bottom', head: head, body: body, foot: foot, info: { sel: f.sel, n: n, pl: chtMyOrder(f.my)[0] || '', echo: { t: 'msg', pad: [12, 0, 12, 10], s: '', time: CHT_PEND_TIME, mine: true } } };
  var ci = -1; chips.forEach(function (c, k) { if (c.on) ci = k; });
  if (chips.length > 1 && ci >= 0) {                                       // t = 칸마다의 다음·이전(다음 화면이 오기 전에도 이어 넘긴다) · k = 이 화면의 칸
    var cn = chips.length, ct = {};
    chips.forEach(function (c, k) { ct[c.act.v] = { l: chips[(k + 1) % cn].act, r: chips[(k - 1 + cn) % cn].act }; });
    out.sw = { l: chips[(ci + 1) % cn].act, r: chips[(ci - 1 + cn) % cn].act, k: chips[ci].act.v, t: ct };
  }      // 좌우 밀기: 호선 칩을 끝없이 돈다(마지막 호선 → 전체 → … 처음의 오른쪽 밀기는 마지막 호선)
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

if (typeof module !== 'undefined' && module.exports) module.exports = { chtLineNick: chtLineNick, CHT_PERSONAS: CHT_PERSONAS, chtMineLines: chtMineLines, chtMyOrder: chtMyOrder, chatScreen: chatScreen, chatScreens: chatScreens, chtFacts: chtFacts, chtItems: chtItems, chtTime: chtTime, chtOfficial: chtOfficial, chtAlert: chtAlert, CHT_KNOWN: CHT_KNOWN };
