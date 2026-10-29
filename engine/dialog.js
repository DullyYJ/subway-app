// 길동무 — 안내창(대화상자) 엔진 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수) — 2026-10-20 (s79)
//
// ★ 원칙(YJ): "모든 계산은 엔진이 한다. 앱은 그림만 그린다."
//   앱 화면 가운데 떠 있는 안내창 세 가지의 글·글자 크기·색·단추 이름·카드 크기/위치/흐림/모서리를 엔진이 정한다.
//     perm  '다른 앱 위에 표시' 권한 안내(취소 / 설정 열기)
//     diag  오버레이 진단 기록(최신이 위 · 전체 복사 / 지우기 / 닫기)
//     report 글 신고 확인(취소 / 신고)
//     exit  앱 종료 확인(아니요 / 종료)
//     pop   잠깐 떴다 사라지는 작은 알림(_pickPop: 출발지/도착지 설정 안내 · 공유 안내 …)
//     walk  하차 뒤 도보 안내 아래 시트(웹 walkModal): 직선거리 · 도보 예상 · 카카오맵/네이버지도 길안내 주소 · 기준 시각 — 안내창이 아니라 시트라 dlg 모양은 없다
//   앱(웹)은 사실만 보낸다: kind · (diag) 기록 줄 목록과 복사 결과 · (pop) 글 두 줄과 모양(cls). 앱(기기)은 받은 화면을 그린다.
//
// 입력  dialogScreen({ cap }, f)   cap 16 이상
//   f = { kind:'perm'|'diag'|'pop'|'walk', walk: { my:{lat,lng}|null, dest:{lat,lng,name}|null, mode:'start'|'arrive'|'manual', nowMs, tzoMin, theme },  lines:[기록 줄…](오래된 것부터, diag), cp:0|1|2(diag 복사 결과: 0 없음 · 1 됨 · 2 실패), msg, sub, cls:''|'sh'(pop) }
// 출력  { ok, v:1, screen:'dlg', dlg:{…카드 모양}, bg, head:[…], body:[…], foot?:[…], info:{kind}, rev }
//        행동 이름: dl.ok · dl.no(perm · exit · report) · dl.copy · dl.clear · dl.close(diag). 흐린 곳을 누르면 dlg.tap(perm 만 dl.no).
var DLG_CAP = 16;
var RLOAD_CAP = 19;           // rload(경로 탐색 로딩)는 runner 노드를 아는 앱(CAP 19)부터 — 옛 앱은 kind 를 몰라 그냥 쓰지 않는다
var DLG_KINDS = { perm: 1, diag: 1, pop: 1, exit: 1, report: 1, walk: 1, rload: 1, bpick: 1, reco: 1, offroute: 1 };
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

// ★ s200 (YJ: 경로탐색에서 처음에 버스를 타면 10분 안에 오는 버스를 팝업으로 골라 타게): 탈 버스 고르기 카드.
//   f = { no(노선 번호), stop(정류장 이름), items:[{ sec(몇 초 뒤 도착), ms }…] }. 단추: dl.bp.N(N 번째 버스) · dl.ok(고르지 않고 경로 시각대로 시작) · dl.no(취소).
//   info.items 는 단추 순서 그대로의 도착 시각(ms) — 앱이 고른 번호의 ms 를 시작 엔진(/ride/start)에 그대로 돌려준다(앱은 계산하지 않는다).
function dlgBpickLabel(sec) {
  var s = Math.max(0, Math.round(Number(sec) || 0)), m = Math.floor(s / 60), r = s % 60;
  if (s < 60) return s + '초 후 도착';
  return m + '분 ' + (r < 10 ? '0' : '') + r + '초 후 도착';
}
function dlgBpick(f) {
  var src = Array.isArray(f.items) ? f.items : [], items = [], k;
  for (k = 0; k < src.length && items.length < 6; k++) {
    var it = src[k], sec = it && typeof it === 'object' ? Number(it.sec) : NaN, ms = it && typeof it === 'object' ? Number(it.ms) : NaN;
    if (isFinite(sec) && sec > 0 && isFinite(ms)) items.push({ sec: Math.round(sec), ms: Math.round(ms), no: it && typeof it === 'object' ? dlgClean(it.no, 14) : '', en: it && typeof it === 'object' ? dlgClean(it.en, 24) : '' });      // s265: 줄마다 버스 번호(같은 구간을 가는 여러 번호 중 고르기) — 없으면 카드 전체 번호
  }
  var no = dlgClean(f.no, 14), stop = dlgClean(f.stop, 40), nope = { a: 'call', v: 'dl.no' }, nos = {};
  items.forEach(function (x) { if (x.no) nos[x.no] = 1; });
  var multiNo = Object.keys(nos).length > 1;
  var head = [
    { t: 'text', pad: [22, 24, 22, 6], s: f.mid ? '갈아탈 버스를 골라 주세요' : '탈 버스를 골라 주세요', size: 17, bold: true, lh: 1.4, color: 'text' },
    { t: 'text', pad: [22, 0, 22, 16], s: (stop ? stop + ' · ' : '') + (f.mid ? '추천 버스와 비슷한 때 오는 버스' : (multiNo ? '같은 곳으로 가는 10분 안에 오는 버스' : '10분 안에 오는 버스')), size: 13, lh: 1.55, color: 'sub' }
  ];
  items.forEach(function (it2, i) {
    head.push({ t: 'btnrow', pad: [22, 0, 22, 8], gap: 10, h: 50, eq: true, bsize: it2.en ? 13 : 15, r: 12, items: [
      { label: ((it2.no || no) ? (it2.no || no) + '번 ' : (i + 1) + '번째 ') + '(' + dlgBpickLabel(it2.sec).replace(' 도착', '') + ')' + (it2.en ? ' · ' + it2.en + '에서 내려요' : ''), fill: 'card2', line: 'border', tc: 'text', act: { a: 'call', v: 'dl.bp.' + i } }       // s250: '순환43번 (9분 36초 후)' — 버스 번호(예상 시간)
    ] });
  });
  head.push({ t: 'btnrow', pad: [22, 8, 22, 22], gap: 10, h: 44, eq: true, bsize: 14, r: 11, items: f.mid ? [
    { label: '추천대로 탈게요', fill: 'card2', line: 'border', tc: 'sub', act: nope }
  ] : [
    { label: '취소', fill: 'card2', line: 'border', tc: 'sub', act: nope },
    { label: '고르지 않고 시작', fill: 'card2', line: 'border', tc: 'sub', act: { a: 'call', v: 'dl.ok' } }
  ] });
  return { dlg: { w: 340, maxh: 0.85, dim: 0.5, top: 0.5, r: 18, mx: 28, tap: nope }, bg: 'card', head: head, body: [{ t: 'spacer', h: 0 }], foot: null,
    info: { items: items.map(function (x) { return { sec: x.sec, ms: x.ms, no: x.no || no }; }) } };
}

// ★ s252 (YJ: "하차추천도 앱을 키고있으면 팝업이 뜨고"): 앱 화면을 보는 중에 하차 7분 전 추천이 오면 알림 대신 뜨는 카드(웹 _showBriefingModal 과 같다).
//   f = { title, body(여러 줄), go(가게·상품 보기 단추 이름 — 없으면 단추 없음), ok(닫기 단추 이름) }. 단추: dl.go(가게·상품 열기) · dl.no(닫기, 흐린 곳 눌러도 같다). 글은 엔진(/reco-text)이 만든 그대로다.
function dlgReco(f) {
  var title = dlgClean(f.title, 60), body = dlgClean(f.body, 500), go = dlgClean(f.go, 10), ok = dlgClean(f.ok, 10) || '확인', no = { a: 'call', v: 'dl.no' };
  var items = [];
  if (go) items.push({ label: go, fill: 'gold', line: 'gold', tc: '#121214', act: { a: 'call', v: 'dl.go' } });
  items.push({ label: ok, fill: 'card2', line: 'border', tc: 'sub', act: no });
  var head = [{ t: 'text', pad: [22, 24, 22, body ? 10 : 18], s: title || '하차 추천', size: 17, bold: true, lh: 1.4, color: 'text' }];
  if (body) head.push({ t: 'text', pad: [22, 0, 22, 18], s: body, size: 14, lh: 1.65, color: 'text' });
  head.push({ t: 'btnrow', pad: [22, 0, 22, 22], gap: 10, h: 46, eq: true, bsize: 15, r: 11, items: items });
  return { dlg: { w: 340, maxh: 0.85, dim: 0.5, top: 0.5, r: 18, mx: 28, tap: no }, bg: 'card', head: head, body: [{ t: 'spacer', h: 0 }], foot: null, info: { go: go ? 1 : 0 } };
}

// ★ s320 (YJ: 경로를 벗어났어요 팝업을 테마에 맞게 · 단추 크기를 똑같이 고르게): 경로 이탈 확인 카드.
//   f = { stn(경로 첫 지하철역 이름 — 있으면 [역까지 이동]을 함께 보인다) }. 단추 폭은 모두 같다(btnrow eq).
//   행동: dl.bp.0 = 역까지 이동(stn 이 있을 때만) · dl.bp.1 = 다시 찾기 · dl.no = 계속 안내(바깥을 눌러도 같다).
function dlgOff(f) {
  var stn = dlgClean(f.stn, 14), no = { a: 'call', v: 'dl.no' };
  var body = stn
    ? '지금 위치에서 ' + stn + '까지 이동하면 남은 거리와 도착 예상 시각을 보여 드리고, 닿으면 환승 안내로 이어져요. 도착지까지 경로를 다시 찾을 수도 있어요.'
    : '지금 있는 곳에서 도착지까지 경로를 다시 찾을까요?\n다시 찾으면 지금 안내는 끝나고, 새 경로를 확정할 수 있어요.';
  var items = [];
  if (stn) items.push({ label: '역까지 이동', fill: 'gold', line: 'gold', tc: '#121214', act: { a: 'call', v: 'dl.bp.0' } });
  items.push({ label: '계속 안내', fill: 'card2', line: 'border', tc: 'sub', act: no });
  items.push({ label: '다시 찾기', fill: stn ? 'card2' : 'gold', line: stn ? 'border' : 'gold', tc: stn ? 'text' : '#121214', act: { a: 'call', v: 'dl.bp.1' } });
  return {
    dlg: { w: 350, maxh: 0.85, dim: 0.5, top: 0.5, r: 18, mx: 20, tap: no }, bg: 'card',
    head: [
      { t: 'text', pad: [22, 24, 22, 8], s: '경로를 벗어났어요', size: 17, bold: true, lh: 1.4, color: 'text' },
      { t: 'text', pad: [22, 0, 22, 20], s: body, size: 14, lh: 1.6, color: 'sub' },
      { t: 'btnrow', pad: [22, 0, 22, 22], gap: 8, h: 46, eq: true, bsize: 13, r: 11, items: items }
    ],
    body: [{ t: 'spacer', h: 0 }], foot: null, info: { stn: stn ? 1 : 0 }
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

// ── 도보 안내 시트(웹 openWalkModal · _walkUpdateMap · openKakaoNav · openNaverNav 와 같은 계산) ──
var WALK_MPM = 67, WALK_REFRESH_MS = 30000;
function wkNum(v) { var n = typeof v === 'string' ? parseFloat(v) : v; return typeof n === 'number' && isFinite(n) ? n : null; }
function wkHav(a1, o1, a2, o2) {
  var R = 6371000, r = Math.PI / 180, dA = (a2 - a1) * r, dO = (o2 - o1) * r;
  var h = Math.sin(dA / 2) * Math.sin(dA / 2) + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) * Math.sin(dO / 2);
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function wkClock(nowMs, tzoMin) {
  var t = wkNum(nowMs); if (t === null) return '';
  var z = wkNum(tzoMin); if (z === null) z = -540;
  var d = new Date(t - z * 60000), h = d.getUTCHours(), mi = d.getUTCMinutes();
  return (h < 12 ? '오전 ' : '오후 ') + ('0' + (h % 12 || 12)).slice(-2) + ':' + ('0' + mi).slice(-2);
}
// 경로 탐색 로딩(웹 #transitLoading): 가운데 카드 · 뒤 화면 70% 어둡게 · 제목 + 안내. 캐릭터는 앱이 그린다(runner 노드 — 장식).
function dlgRload() {
  return { dlg: { w: 296, maxh: 0.9, dim: 0.7, top: 0.5, r: 20, mx: 24 }, bg: 'card',
    head: [{ t: 'runner', pad: [30, 24, 30, 22], ttl: '복합경로 탐색 중', sub: '잠시만 기다려주세요' }],
    body: [{ t: 'spacer', h: 0 }], foot: null, info: {} };
}
function dlgWalk(f) {
  var w = (f.walk && typeof f.walk === 'object') ? f.walk : {};
  var mode = w.mode === 'start' || w.mode === 'arrive' ? w.mode : 'manual';
  var my = w.my && wkNum(w.my.lat) !== null && wkNum(w.my.lng) !== null ? { lat: wkNum(w.my.lat), lng: wkNum(w.my.lng) } : null;
  var dst = w.dest && wkNum(w.dest.lat) && wkNum(w.dest.lng) ? { lat: wkNum(w.dest.lat), lng: wkNum(w.dest.lng), name: dlgClean(w.dest.name, 40) } : null;
  var dName = dst ? dst.name : dlgClean(w.dest && w.dest.name, 40);
  var title = mode === 'start' ? '출발역까지 도보 안내' : (mode === 'arrive' ? '목적지까지 도보 안내' : '현재 위치 지도');
  var dist = my ? wkHav(my.lat, my.lng, dst ? dst.lat : my.lat, dst ? dst.lng : my.lng) : null;
  var min = dist === null ? null : Math.round(dist / WALK_MPM);
  var distS = dist === null ? '-' : (dist < 1000 ? Math.round(dist) + 'm' : (dist / 1000).toFixed(1) + 'km');
  var timeS = dist === null || !dst ? '-' : (min < 1 ? '1분 미만' : min + '분');
  var clock = dist === null ? '' : wkClock(w.nowMs, w.tzoMin);
  var green = w.theme === 'light' ? '#29b96a' : '#34c759';
  var nm = dName || '목적지', enc = encodeURIComponent;
  var nav = null;
  if (dst) {
    var k = 'kakaomap://route?' + (my ? 'sp=' + my.lat + ',' + my.lng + '&' : '') + 'ep=' + dst.lat + ',' + dst.lng + '&by=FOOT';
    var kw = 'https://map.kakao.com/link/to/' + enc(nm) + ',' + dst.lat + ',' + dst.lng;
    var n = 'nmap://route/walk?' + (my ? 'slat=' + my.lat + '&slng=' + my.lng + '&sname=' + enc('내위치') + '&' : '') + 'dlat=' + dst.lat + '&dlng=' + dst.lng + '&dname=' + enc(nm) + '&appname=com.dullyyj.subway';
    var nw = 'https://map.naver.com/p/directions/' + (my ? my.lng + ',' + my.lat + ',%EB%82%B4%EC%9C%84%EC%B9%98,,-1/' : '-/') + dst.lng + ',' + dst.lat + ',' + enc(nm) + ',,-1/walk';
    nav = { kakao: [k, kw], naver: [n, nw] };
  }
  var tile = function (label, val, hc) {
    var kids = [{ t: 'text', pad: [0, 0, 0, 3], s: label, size: 10, align: 'center', color: 'sub' },
      { t: 'text', s: val, size: 18, bold: true, align: 'center', color: 'text', lh: 1.3 }];
    if (hc) kids[1].hl = [[0, val.length, hc]];
    return { t: 'panel', fill: 'card2', line: 'card2', r: 10, ip: [12, 12, 12, 12], kids: kids };
  };
  var head = [
    { t: 'bar', pad: [16, 14, 16, 10], title: title, sub: dName ? '→ ' + dName : '', btn: '닫기', act: { a: 'call', v: 'wk.close' } },
    { t: 'row', pad: [12, 4, 12, 14], gap: 8, kids: [tile('직선거리', distS, ''), tile('도보 예상', timeS, green)] },
    { t: 'btnrow', pad: [12, 0, 12, 0], gap: 8, h: 48, eq: true, bsize: 14, r: 14, items: [
      { label: '카카오맵', fill: '#FEE500', line: '#FEE500', tc: '#3A1D1D', act: { a: 'call', v: 'wk.kakao' } },
      { label: '네이버지도', fill: '#03C75A', line: '#03C75A', tc: '#ffffff', act: { a: 'call', v: 'wk.naver' } }
    ] },
    { t: 'text', pad: [12, 8, 12, 24], s: clock ? clock + ' 기준' : ' ', size: 10, align: 'center', color: 'sub' }
  ];
  return { dlg: null, bg: 'card', head: head, body: [{ t: 'spacer', h: 0 }], foot: null,
    info: { nav: nav, msg: dst ? '' : '목적지 좌표를 찾을 수 없습니다', refresh: WALK_REFRESH_MS, dist: dist === null ? -1 : Math.round(dist), min: min === null ? -1 : min } };
}

function dialogScreen(inp, f) {
  inp = inp || {};
  if (!(Number(inp.cap) >= DLG_CAP)) return { ok: false, error: 'cap' };
  f = (f && typeof f === 'object') ? f : {};
  var kind = dlgStr(f.kind, 10);
  if (!DLG_KINDS[kind]) return { ok: false, error: 'kind' };
  if (kind === 'rload' && !(Number(inp.cap) >= RLOAD_CAP)) return { ok: false, error: 'cap' };
  var d = kind === 'perm' ? dlgPerm() : (kind === 'report' ? dlgReport() : kind === 'exit' ? dlgExit() : (kind === 'diag' ? dlgDiag(f) : (kind === 'walk' ? dlgWalk(f) : (kind === 'rload' ? dlgRload() : (kind === 'bpick' ? dlgBpick(f) : (kind === 'reco' ? dlgReco(f) : (kind === 'offroute' ? dlgOff(f) : dlgPop(f))))))));
  var out = { ok: true, v: 1, screen: kind === 'walk' ? 'walk' : 'dlg', bg: d.bg, head: d.head, body: d.body, info: d.info };
  if (d.dlg) out.dlg = d.dlg;
  if (d.foot) out.foot = d.foot;
  out.info.kind = kind;
  out.rev = 'd1:' + dlgHash(JSON.stringify([kind, d.dlg, d.head, d.body, d.foot || 0]));
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { dialogScreen: dialogScreen, DLG_CAP: DLG_CAP };
