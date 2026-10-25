// 길동무 — 커뮤니티 '제보 글쓰기' 시트 엔진 (route-v2 Worker 에 붙여 넣는 순수 함수; 단일 출처)
//
// ★ 원칙(YJ): "모든 연산은 엔진이 한다. 앱은 엔진이 계산한 그림만 그린다."  (2026-10-19 s70 — 글쓰기 시트)
//   예전엔 www/index.html 의 #wsheet 안에 제목·안내·입력칸·단추 글이 박혀 있었다.
//   이제 앱은 '기기 사실'(오늘 현장제보 횟수 · 지금 보이는 안내 글 · 등록 중인지 · 입력칸에 처음 놓을 글)만 보내고,
//   엔진이 시트의 글·순서·입력칸·단추를 정해 화면 JSON 으로 내려 준다. 앱(네이티브 ScreenCore/ScreenView)은 그리기만 하고,
//   단추를 누르면 {a:'call', v:'wr.close'|'wr.submit'} 과 입력칸 글자(fields)만 알린다. 욕설 거르기·서버 등록은 예전 웹 함수(submitPost)가 그대로 한다.
//   웹 시트는 폴백(엔진·네이티브가 안 될 때)으로만 남는다.
//
// 입력  writeScreen({ cap }, facts)
//        cap   = 앱이 그릴 수 있는 화면 규격 수준(9 이상이어야 만든다 — 여러 줄 입력칸이 9)
//        facts = { rc: 오늘 현장제보 횟수(0~), err: 지금 보이는 안내 글, busy: 등록 중(0|1), t: 제목 처음 글, b: 내용 처음 글 }
// 출력  { ok, v:1, screen:'write', cover:'tab', head:[], body:[panel], info:{} }
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var WRITE_SCREEN_V = 1;
var WRITE_TITLE_MAX = 60, WRITE_BODY_MAX = 1000, WRITE_ERR_MAX = 120;
// 안내 글에 앞붙이로 붙는 이모지(⚠️ 등)는 새 네이티브 화면 규칙대로 뺀다
var WRITE_EMOJI = /[←-⯿️‍]|[\uD83C-\uD83E][\uDC00-\uDFFF]/g;
function writeHash(s) {                              // djb2 — 같은 화면이면 같은 rev
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function writeStr(v, max) {
  if (v == null) return '';
  var s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}
function writeFacts(f) {
  f = (f && typeof f === 'object') ? f : {};
  var rc = Math.floor(Number(f.rc));
  if (!isFinite(rc) || rc < 0) rc = 0;
  if (rc > 99) rc = 99;
  var err = writeStr(f.err, 400).replace(WRITE_EMOJI, '').replace(/\s+/g, ' ').trim();
  if (err.length > WRITE_ERR_MAX) err = err.slice(0, WRITE_ERR_MAX);
  return { rc: rc, err: err, busy: (f.busy === 1 || f.busy === true) ? 1 : 0, t: writeStr(f.t, WRITE_TITLE_MAX), b: writeStr(f.b, WRITE_BODY_MAX) };
}
function writeLabel(s, mt) { return { t: 'text', s: s, size: 11, bold: true, color: 'sub', lh: 1.3, pad: [0, mt == null ? 12 : mt, 0, 5] }; }
function writeScreen(inp, factsIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 9)) return { ok: false, error: 'cap' };
  var f = writeFacts(factsIn);
  var kids = [
    { t: 'bar', pad: [0, 0, 0, 4], title: '제보 글쓰기', btn: '닫기', act: { a: 'call', v: 'wr.close' } },
    writeLabel('카테고리', 8),
    { t: 'box', s: '잡담', size: 13, lh: 1.3, color: 'text', fill: 'card2', line: 'border', r: 11, ip: [12, 11, 12, 11], pad: [0, 0, 0, 0] },
    { t: 'text', s: '현장제보 오늘 ' + f.rc + '/3회 사용 (제보 시 3~8P 랜덤 적립)', size: 11, color: 'gold', lh: 1.4, pad: [2, 10, 0, 0] }
  ];
  if (f.err) kids.push({ t: 'box', s: f.err, size: 12, lh: 1.45, color: 'text', tc: '#ff453a', fill: 'rgba(255,69,58,0.12)', line: 'rgba(255,69,58,0.35)', r: 10, ip: [12, 9, 12, 9], pad: [0, 10, 0, 0] });
  kids.push(writeLabel('제목', 12));
  kids.push({ t: 'field', key: 'wt', hint: '제목을 입력하세요', value: f.t, maxlen: WRITE_TITLE_MAX, h: 44, size: 14, fill: 'card2', line: 'border', r: 11, pad: [0, 0, 0, 0] });
  kids.push(writeLabel('내용', 12));
  kids.push({ t: 'field', key: 'wb', hint: '현장 상황을 알려주세요', value: f.b, maxlen: WRITE_BODY_MAX, h: 96, size: 14, multi: true, fill: 'card2', line: 'border', r: 11, pad: [0, 0, 0, 0] });
  kids.push({ t: 'button', s: f.busy ? '등록 중...' : '제보 등록', size: 14, h: 46, r: 11, bold: true, fill: 'gold', line: 'none', tc: '#121214', pad: [0, 16, 0, 0], act: { a: 'call', v: 'wr.submit' } });
  var body = [{ t: 'panel', pad: [0, 0, 0, 0], ip: [16, 14, 16, 18], fill: 'card', line: 'border', r: 22, kids: kids }];
  var out = { ok: true, v: 1, screen: 'write', cover: 'tab', head: [], body: body, info: { rc: f.rc, busy: f.busy } };
  out.rev = 'w' + WRITE_SCREEN_V + ':' + writeHash(JSON.stringify(body));
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { writeScreen: writeScreen, writeFacts: writeFacts };
