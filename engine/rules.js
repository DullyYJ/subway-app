// 길동무 — 앱 규칙 엔진 (route-v2 Worker 에 붙여 넣는 순수 함수; 단일 출처)
//
// ★ 원칙(YJ): "모든 연산은 엔진이 한다. 앱은 그림만 그린다."  (2026-10-20 s95 — 웹 데이터 계층에 남아 있던 규칙)
//   예전엔 웹(www/index.html)이 욕설 거르기(_containsBadWord) · 내가 탄 노선 기록(_myLinesRecord) 을 스스로 정했다. 이제 앱은 사실(글·저장값·오늘 날짜·무작위 수)만 보내고 엔진이 판정·계산한다.
//
// 입력  POST /rules  { op, … }   (모두 상태 없음: 저장값은 앱이 들고 있다가 그대로 다시 보낸다)
//   op:'check'  { texts:[제목, 본문 …], kind?:'post'|'chat' } → { ok, msg? }                         글을 올려도 되는가(비었나 · 욕설)
//   op:'mylines'{ my:[{l,n,t}…], sec:[노선 이름…], now } → { ok, my, lines }                         탄 노선 기록 쌓기(경로를 확정할 때)
//   ※ 포인트(적립 · 등급 · 현장제보 하루 한도)는 s216 에서 통째로 없앴다 — 앱에 포인트 기능이 없다.
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var RULES_V = 1;
var RULES_BAD = [
  '시발', '씨발', '시팔', '씨팔', 'ㅅㅂ', 'ㅄ', '병신', 'ㅂㅅ', '개새', '새끼', '새기', '색끼',
  '좆', '존나', '존마', '죠낸', '지랄', 'ㅈㄹ', '꺼져', '닥쳐', '엿먹', '미친놈', '미친년', '또라이',
  '등신', '멍청', '버러지', '쓰레기같', '죽어', '뒤져', '뒈져', '개같', '개소리', '걸레', '창녀',
  '느금', '니애미', '니미', '애미', '애비', '보지', '자지', '섹스', '강간', 'fuck', 'shit', 'bitch', 'asshole',
  '한남', '한녀', '김치녀', '된장녀', '맘충', '틀딱', '급식충', '노친네', '정신병자', '장애인같'
];
var RULES_BAD_MSG = '욕설·비방은 등록할 수 없어요. 바른 언어를 사용해주세요';

function rulesStr(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }
function rulesInt(v, lo, hi) { var n = Math.floor(Number(v)); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; }

// 공백을 지우고 소문자로 만든 글에 금칙어가 들어 있나(공백 끼워 넣기 우회 방지)
function rulesBad(text) {
  if (!text) return false;
  var t = String(text).toLowerCase().replace(/\s+/g, '');
  for (var i = 0; i < RULES_BAD.length; i++) if (t.indexOf(RULES_BAD[i].toLowerCase()) >= 0) return true;
  return false;
}

function rulesCheck(r) {
  var texts = Array.isArray(r.texts) ? r.texts.slice(0, 6).map(function (t) { return rulesStr(t, 5000); }) : [];
  if (r.kind === 'post') {
    if (!texts[0] || !texts[0].trim()) return { ok: false, msg: '제목을 입력해주세요' };
    if (!texts[1] || !texts[1].trim()) return { ok: false, msg: '내용을 입력해주세요' };
  }
  for (var i = 0; i < texts.length; i++) if (rulesBad(texts[i])) return { ok: false, msg: RULES_BAD_MSG };
  return { ok: true };
}

// 탄 노선 기록: 경로의 지하철 구간 이름(수도권1호선 → 1호선)을 알려진 노선으로 맞추고, 노선마다 탄 횟수와 마지막 시각을 쌓는다
function rulesKnown() { return (typeof CHT_KNOWN !== 'undefined') ? CHT_KNOWN : require('./chat').CHT_KNOWN; }
function rulesMyLines(r) {
  var known = rulesKnown(), lines = [], my = [];
  (Array.isArray(r.sec) ? r.sec.slice(0, 12) : []).forEach(function (raw) {
    var nm = String(raw == null ? '' : raw).replace(/\s+/g, ''), hit = known.indexOf(nm) >= 0 ? nm : '';
    if (!hit) known.forEach(function (k) { if (nm.indexOf(k) >= 0 && k.length > hit.length) hit = k; });
    if (hit && lines.indexOf(hit) < 0) lines.push(hit);
  });
  (Array.isArray(r.my) ? r.my.slice(0, 40) : []).forEach(function (x) {
    if (x && typeof x === 'object' && known.indexOf(x.l) >= 0) my.push({ l: x.l, n: rulesInt(x.n, 0, 1e6), t: Number(x.t) > 0 ? Math.floor(Number(x.t)) : 0 });
  });
  var now = Number(r.now) > 0 ? Math.floor(Number(r.now)) : 0;
  lines.forEach(function (l) {
    var e = null; for (var i = 0; i < my.length; i++) if (my[i].l === l) { e = my[i]; break; }
    if (!e) { e = { l: l, n: 0, t: 0 }; my.push(e); }
    e.n++; e.t = now;
  });
  return { ok: true, my: my, lines: lines };
}

function rulesRun(b) {
  b = (b && typeof b === 'object') ? b : {};
  if (b.op === 'check') return rulesCheck(b);
  if (b.op === 'mylines') return rulesMyLines(b);
  return { ok: false, error: 'op' };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { rulesRun: rulesRun, rulesBad: rulesBad, RULES_BAD: RULES_BAD };
