// 길동무 — 안내창(대화상자) 엔진 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수) — 2026-10-20 (s79)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
//   앱 화면 가운데 떠 있는 안내창 세 가지의 글·글자 크기·색·단추 이름·카드 크기/위치/흐림/모서리를 엔진이 정한다.
//     perm  '다른 앱 위에 표시' 권한 안내(취소 / 설정 열기)
//     diag  오버레이 진단 기록(최신이 위 · 전체 복사 / 지우기 / 닫기)
//     report 글 신고 확인(취소 / 신고)
//     exit  앱 종료 확인(아니요 / 종료)
//     pop   잠깐 떴다 사라지는 작은 알림(_pickPop: 출발지/도착지 설정 안내 · 공유 안내 …)
//   앱(웹)은 사실만 보낸다: kind · (diag) 기록 줄 목록과 복사 결과 · (pop) 글 두 줄과 모양(cls). 앱(기기)은 받은 화면을 그린다.
//
// 입력  dialogScreen({ cap }, f)   cap 16 이상
//   f = { kind:'perm'|'diag'|'pop', lines:[기록 줄…](오래된 것부터, diag), cp:0|1|2(diag 복사 결과: 0 없음 · 1 됨 · 2 실패), msg, sub, cls:''|'sh'(pop) }
// 출력  { ok, v:1, screen:'dlg', dlg:{…카드 모양}, bg, head:[…], body:[…], foot?:[…], info:{kind}, rev }
//        행동 이름: dl.ok · dl.no(perm · exit · report) · dl.copy · dl.clear · dl.close(diag). 흐린 곳을 누르면 dlg.tap(perm 만 dl.no).
var DLG_CAP = 16;
var DLG_KINDS = { perm: 1, diag: 1, pop: 1, exit: 1, report: 1 };
var DLG_MAXLINES = 600, DLG_CHUNK = 1700;
var DLG_EMOJI = /[☀-➿⬀-⯿️‍]|[\uD83C-\uD83E][\uDC00-\uDFFF]/g;

function dlgStr(v, n) { return typeof v === 'string' ? v.slice(0, n) : (typeof v === 'number' && isFinite(v) ? String(v).slice(0, n) : ''); }
function dlgHash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
function dlgClean(s, n) { return dlgStr(s, n).replace(DLG_EMOJI, '').replace(/[ \t]+\n/g, '\n').replace(/^\s+|\s+$/g, ''); }

function dlgPerm() {
  var no = { a: 'call', v: 'dl.no' };
  return {
    dlg: { w: 340, maxh: 0.85, dim: 0.5, top: 0.5, r: 18, mx: 28, tap: no }, bg: 'card',
    head: [
      { t: 'text', pad: [22, 24, 22, 10], s: '다른 앱 위에 표시', size: 17, bold: true, lh: 1.4, color: 'text' },
      { t: 'text', pad: [22, 0, 22, 6], s: '다른 앱을 쓰는 동안 현재역·남은시간을 화면 위쪽에 작게 띄우려면 \'다른 앱 위에 표시\' 권한이 필요해요.', size: 14, lh: 1.65, color: 'text' },
      { t: 'text', pad: [22, 0, 22, 20], s: '안내 정보만 보여주고 광고는 넣지 않아요. 설정 화면을 열까요?', size: 13, lh: 1.6, color: 'sub' },
      { t: 'btnrow', pad: [22, 0, 22, 24], gap: 10, h: 46, eq: true, bsize: 15, r: 11, items: [
        { label: '취소', fill: 'card2', line: 'border', tc: 'sub', act: no },
        { label: '설정 열기', fill: '#2f7cf6', line: '#2f7cf6', tc: '#ffffff', act: { a: 'call', v: 'dl.ok' } }
      ] }
    ],
    body: [{ t: 'spacer', h: 0 }], foot: null, info: {}
  };
}

function dlgReport() {
  var no = { a: 'call', v: 'dl.no' };
  return {
    dlg: { w: 320, maxh: 0.85, dim: 0.5, top: 0.5, r: 18, mx: 28, tap: no }, bg: 'card',
    head: [
      { t: 'text', pad: [22, 24, 22, 8], s: '이 글을 신고할까요?', size: 17, bold: true, lh: 1.4, color: 'text' },
      { t: 'text', pad: [22, 0, 22, 20], s: '신고가 여러 명 모이면 자동으로 숨겨져요.', size: 14, lh: 1.6, color: 'sub' },
      { t: 'btnrow', pad: [22, 0, 22, 22], gap: 10, h: 46, eq: true, bsize: 15, r: 11, items: [
        { label: '취소', fill: 'card2', line: 'border', tc: 'sub', act: no },
        { label: '신고', fill: '#ff3b30', line: '#ff3b30', tc: '#ffffff', act: { a: 'call', v: 'dl.ok' } }
      ] }
    ],
    body: [{ t: 'spacer', h: 0 }], foot: null, info: {}
  };
}

function dlgExit() {
  // 웹 종료 확인창과 같은 고정 어두운 카드(테마와 무관): 카드 #1c1c1e · 흐림 0.7 · 흐린 곳을 눌러도 닫히지 않는다
  return {
    dlg: { w: 320, maxh: 0.85, dim: 0.7, top: 0.5, r: 18, mx: 20, fill: '#1c1c1e', line: '#1c1c1e' }, bg: 'card',
    head: [
      { t: 'text', pad: [24, 28, 24, 8], s: '앱을 종료하시겠습니까?', size: 18, bold: true, lh: 1.4, align: 'center', color: 'white' },
      { t: 'text', pad: [24, 0, 24, 24], s: '길동무를 종료합니다.', size: 13, lh: 1.5, align: 'center', color: 'white', alpha: 0.56 },
      { t: 'btnrow', pad: [24, 0, 24, 24], gap: 10, h: 48, eq: true, bsize: 15, r: 12, items: [
        { label: '아니요', fill: '#1c1c1e', line: '#3a3a3c', tc: '#8e8e93', act: { a: 'call', v: 'dl.no' } },
        { label: '종료', fill: '#ff3b30', line: '#ff3b30', tc: '#ffffff', act: { a: 'call', v: 'dl.ok' } }
      ] }
    ],
    body: [{ t: 'spacer', h: 0 }], foot: null, info: {}
  };
}

function dlgDiag(f) {
  var src = Array.isArray(f.lines) ? f.lines.slice(-DLG_MAXLINES) : [], lines = [];
  for (var i = src.length - 1; i >= 0; i--) lines.push(dlgStr(src[i], 300));            // 최신이 위
  var body = [];
  if (!lines.length) body.push({ t: 'text', pad: [14, 0, 14, 0], s: '기록 없음', size: 10.5, lh: 1.5, color: 'text' });
  else {
    var cur = '';
    for (var q = 0; q < lines.length; q++) {
      if (cur.length && cur.length + lines[q].length + 1 > DLG_CHUNK) { body.push({ t: 'text', pad: [14, 0, 14, 0], s: cur, size: 10.5, lh: 1.5, color: 'text' }); cur = ''; }
      cur += (cur.length ? '\n' : '') + lines[q];
    }
    if (cur.length) body.push({ t: 'text', pad: [14, 0, 14, 0], s: cur, size: 10.5, lh: 1.5, color: 'text' });
  }
  var cpLab = f.cp === 1 ? '복사됨' : (f.cp === 2 ? '복사 실패' : '전체 복사');
  return {
    dlg: { w: 480, maxh: 0.85, dim: 0.75, top: 0.5, r: 14, mx: 14 }, bg: 'card',
    head: [
      { t: 'text', pad: [14, 14, 14, 6], s: '오버레이 진단 기록 (최신이 위)', size: 14, bold: true, lh: 1.4, color: 'text' },
      { t: 'text', pad: [14, 0, 14, 8], s: '시각 · 종류 · H(숨김)/V(보임) · bg1(백그라운드 위치 켜짐) · L(경로 확정) · 마지막 위치 경과 · 진행 번호(근거/표시) · 현재>다음\nPF = 새 판단기(역 번호·정차/주행·확신도·추정 지연 | 앱 진행도 | 센서 현재값/기준값 | 입력 횟수: g=GPS m=움직임 c=셀)', size: 10.5, lh: 1.5, color: 'sub' }
    ],
    body: body,
    foot: [{ t: 'btnrow', pad: [14, 10, 14, 14], gap: 8, h: 40, eq: true, bsize: 13, r: 10, items: [
      { label: cpLab, fill: 'card', line: 'border2', tc: 'text', act: { a: 'call', v: 'dl.copy' } },
      { label: '지우기', fill: 'card', line: 'border2', tc: 'sub', act: { a: 'call', v: 'dl.clear' } },
      { label: '닫기', fill: 'gold', line: 'gold', tc: '#121214', act: { a: 'call', v: 'dl.close' } }
    ] }],
    info: { n: lines.length }
  };
}

function dlgPop(f) {
  var msg = dlgClean(f.msg, 120), sub = dlgClean(f.sub, 240), sh = f.cls === 'sh';
  if (!msg) msg = sub, sub = '';
  var padY = sh ? 16 : 18, padX = sh ? 22 : 26, tc = sh ? 'text' : 'white';
  var head = [{ t: 'text', pad: [padX, padY, padX, sub ? (sh ? 6 : 5) : padY], s: msg, size: 16, bold: true, lh: 1.35, align: 'center', color: tc }];
  if (sub) head.push({ t: 'text', pad: [padX, 0, padX, padY], s: sub, size: 13, lh: sh ? 1.5 : 1.35, align: 'center', color: sh ? 'sub' : 'white', alpha: sh ? 1 : 0.8 });
  return {
    dlg: sh ? { w: 420, maxh: 0.6, dim: 0, top: 0.42, r: 18, mx: 32, fit: true, fill: 'card', line: 'border2' }
            : { w: 420, maxh: 0.6, dim: 0, top: 0.42, r: 18, mx: 32, fit: true, fill: 'rgba(20,22,28,0.92)' },
    bg: 'card', head: head, body: [{ t: 'spacer', h: 0 }], foot: null, info: { sh: sh ? 1 : 0 }
  };
}

function dialogScreen(inp, f) {
  inp = inp || {};
  if (!(Number(inp.cap) >= DLG_CAP)) return { ok: false, error: 'cap' };
  f = (f && typeof f === 'object') ? f : {};
  var kind = dlgStr(f.kind, 8);
  if (!DLG_KINDS[kind]) return { ok: false, error: 'kind' };
  var d = kind === 'perm' ? dlgPerm() : (kind === 'report' ? dlgReport() : kind === 'exit' ? dlgExit() : (kind === 'diag' ? dlgDiag(f) : dlgPop(f)));
  var out = { ok: true, v: 1, screen: 'dlg', dlg: d.dlg, bg: d.bg, head: d.head, body: d.body, info: d.info };
  if (d.foot) out.foot = d.foot;
  out.info.kind = kind;
  out.rev = 'd1:' + dlgHash(JSON.stringify([kind, d.dlg, d.head, d.body, d.foot || 0]));
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { dialogScreen: dialogScreen, DLG_CAP: DLG_CAP };
