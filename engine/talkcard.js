// 길동무 — 홈 '실시간 대화' 게시판 엔진 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수) — 2026-10-20 (s78)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
//   머리줄('실시간 대화 ›' 글·색 점) · 보여 줄 줄 수와 순서(최근 5줄, 작은 폰이면 오래된 줄부터 접음) · 줄마다 닉네임/글/시각 글(HH:MM) · 게시판 높이 · 입력줄 글(힌트·최대 글자·보내기 단추 모양)을 엔진이 정한다.
//   앱(웹)은 사실만 보낸다: 받아 둔 대화 [닉네임, 글, 시각(ms), 내 글(0|1)] 와 접어야 할 줄 수(fold) · 기기 시간대.
//   앱(기기)은 받은 화면을 그린다. 대화를 받아 오고(서버 폴링)·보내는 일·욕설 거르기·커뮤니티 아이디 확인은 웹 데이터 계층이 한다.
//
// 입력  talkScreen({ cap }, f)   cap 15 이상
//   f = { m: [[닉네임, 글, 시각(ms), 내 글(0|1)]…](오래된 것부터, 뒤쪽 8개까지만 본다), fold: 0~3(접을 줄 수; 웹이 화면 높이를 재서 정한 원자료), tzo: 기기 시간대(분, Date.getTimezoneOffset) }
// 출력  { ok, v:1, screen:'talk', cover:'tab', bg:'card', head:[lth, ltr…, spacer], body:[{t:'spacer',h:0}], foot:[inbar], info:{n, fold}, rev }
//        행동 이름: tk.open 머리줄 누름(커뮤니티 실시간소통으로) · tk.send 보내기(입력된 글은 앱이 fields['talk.in'] 으로 줌)
var LTK_CAP = 15;
var LTK_ROWS = 5, LTK_ROW_H = 20, LTK_ROW_GAP = 5, LTK_HEAD_H = 21, LTK_IN_H = 38, LTK_IN_TOP = 10, LTK_MAX_FOLD = 3;
var LTK_SEND_ICON = 'M2.01 21L23 12 2.01 3 2 10l15 2-15 2z';

function ltkStr(v, n) { return typeof v === 'string' ? v.slice(0, n) : (typeof v === 'number' && isFinite(v) ? String(v).slice(0, n) : ''); }
function ltkHash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
// 웹 _ltTime 과 같다(HH:MM) — 이 기기의 시간대로(서버는 UTC 라 tzo 분을 받아 보정한다)
function ltkTime(ts, tzo) {
  var d = new Date(Number(ts) - (Number(tzo) || 0) * 60000), p = function (n) { return (n < 10 ? '0' : '') + n; };
  return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
}

function talkScreen(inp, f) {
  inp = inp || {};
  if (!(Number(inp.cap) >= LTK_CAP)) return { ok: false, error: 'cap' };
  f = (f && typeof f === 'object') ? f : {};
  var tzo = isFinite(Number(f.tzo)) ? Number(f.tzo) : 0;
  var fold = Math.max(0, Math.min(LTK_MAX_FOLD, Math.floor(Number(f.fold)) || 0));
  var want = LTK_ROWS - fold, list = [], src = Array.isArray(f.m) ? f.m.slice(-8) : [];
  for (var i = 0; i < src.length; i++) {
    var a = src[i]; if (!Array.isArray(a)) continue;
    var text = ltkStr(a[1], 200).replace(/\s+/g, ' ').trim(); if (!text) continue;
    list.push({ nick: ltkStr(a[0], 40), text: text, time: ltkTime(a[2], tzo) });
  }
  var rows = list.slice(-LTK_ROWS).slice(-want), n = rows.length;
  var listH = LTK_ROWS * LTK_ROW_H + (LTK_ROWS - 1) * LTK_ROW_GAP - fold * (LTK_ROW_H + LTK_ROW_GAP);        // 웹 .livetalk-list 높이 120 / 95 / 70 / 45
  var head = [{ t: 'lth', pad: [0, 0, 0, 0], s: '실시간 대화', tail: '›', dot: '#ff3b30', act: { a: 'call', v: 'tk.open' } }];
  var foldable = Math.min(LTK_MAX_FOLD, Math.max(0, n - 2));                            // 웹 _sceneFit: 작은 폰에서는 오래된 줄부터 접되 2줄은 남긴다 — 앱이 잰 남는 세로로 몇 줄 접을지 정하고, 어느 줄이 접힐 수 있는지(fo)는 여기서 정한다
  for (var r = 0; r < n; r++) head.push({ t: 'ltr', pad: [0, 0, 0, r === n - 1 ? 0 : LTK_ROW_GAP], nick: rows[r].nick, s: rows[r].text, time: rows[r].time, fo: r < foldable ? r + 1 : 0 });
  var rest = listH - (n ? n * LTK_ROW_H + (n - 1) * LTK_ROW_GAP : 0);
  if (rest > 0) head.push({ t: 'spacer', h: rest });
  var foot = [{ t: 'inbar', pad: [0, LTK_IN_TOP, 0, 0], key: 'talk.in', hint: '실시간 대화 남기기...', btn: '보내기', bicon: LTK_SEND_ICON, h: LTK_IN_H, bh: LTK_IN_H, inh: 35, r: 18, size: 13, maxlen: 100, fill: 'card', line: 'border2', act: { a: 'call', v: 'tk.send' } }];
  var out = { ok: true, v: 1, screen: 'talk', cover: 'tab', bg: 'card', head: head, body: [{ t: 'spacer', h: 0 }], foot: foot, info: { n: n, fold: fold } };
  out.rev = 't1:' + ltkHash(JSON.stringify([head, foot]));
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { talkScreen: talkScreen, ltkTime: ltkTime, LTK_CAP: LTK_CAP };
