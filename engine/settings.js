// 길동무 — 설정 화면 엔진(화면 구성 JSON) 순수 계산 모듈 (route-v2 Worker 에 붙여 넣는 순수 함수; 단일 출처)
//
// ★ 원칙(YJ): "모든 연산은 엔진이 한다. 앱은 엔진이 계산한 그림만 그린다."  (2026-10-18 서버 구동 화면 2호 — 설정 탭)
//   예전엔 설정 탭의 글·순서·상태 문구가 www/index.html 안에 흩어져 있었다(켜짐/꺼짐/문제 문구, 어떤 카드를 언제 보일지 등).
//   이제 앱은 '기기 사실(facts)'만 모아 보내고, 엔진이 무엇을 어떤 순서로 보일지·문구는 무엇인지까지 정해 화면 JSON 으로 내려 준다.
//   앱(네이티브 ScreenCore/ScreenView)은 그 JSON 을 검증해 그리기만 한다. 웹 설정 화면은 폴백(엔진·네이티브가 안 될 때)으로만 남는다.
//
// 입력  settingsScreen({ cap }, facts)
//        cap   = 앱이 그릴 수 있는 화면 규격 수준(3 이상이어야 설정 화면을 만든다)
//        facts = 앱이 모은 기기 사실(전부 선택 — 없으면 기본값):
//          id: 현재 커뮤니티 아이디('' 이면 없음) · np:{arrive,transfer,arrive_reco: 1|0} · npd: 알림 권한 거부(1|0) · rl: 도착 오차 기록(1|0)
//          th: 'dark'|'pastel' · sam: 갤럭시(1|0) · samw: 앱 배터리 '제한됨'(1|0) · errn: 오류 로그 개수 · cm: 출퇴근 알림(1|0|없음) · ovl: 오버레이(1|0|없음) · pgs: 앱이 열 수 있는 하위 화면 이름들(['sam','ovl','arr'] — 없으면 모두 보인다)
// 출력  { ok, v:1, screen:'settings', rev, cover:'tab', head:[], body:[노드…] }  ← 노드 종류는 native/shell/ScreenCore.java 와 같다
//        panel{kids} · text · box · toggle{key} · navrow{act} · select{act:{a:'sel'}} · field{key} · button · spacer
//        act = {a:'set',key} (스위치 — 앱이 먼저 뒤집고 알린다) | {a:'call',v} (앱 안 함수 호출: saveId·clearId·pol.*·errlog) | {a:'web',v} (웹 카드 열기) | {a:'sel',v} (고르기)
//        ★ 2026-10-20 하위 화면(cap 8): settingsScreen({cap:8, p:'cm'|'gw'|'arr'|'ovl'|'dev'|'sam'}, facts{pf:…}) — 예전에 웹 카드 시트로 열던 6개를 같은 방식(엔진이 구성, 앱은 그리기)으로.
//          pf = 그 화면의 기기 사실(켜짐·값·고른 상태만; 문구·요일 계산·시각 글·퇴근 안내는 엔진). 행동은 call(v: pg.back · sam.open · cm.day.N …) 허용 목록만.
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var SETTINGS_SCREEN_V = 2;
var SETTINGS_PAGE_CAP = 8;
// 지하철 역 표(HOME_STNS)는 Worker 에서는 앞/뒤에 붙은 engine/home-stations.js 가 채우는 공용 전역이고(여기서 다시 선언하지 않는다), Node(시험)에서는 파일을 불러온다. 요청 때 읽는다(Worker 에서 이 블록이 먼저 평가되므로).
function settingsStns() {
  if (typeof HOME_STNS !== 'undefined' && HOME_STNS) return HOME_STNS;
  try { if (typeof require === 'function') return require('./home-stations').HOME_STNS; } catch (eHs) {}
  return null;
}

// 스위치 키 → 알림 종류 이름
var SETTINGS_NOTIF = [
  { key: 'arrive', title: '도착 임박 알림', desc: '목적지 2정거장 전 · 1정거장 전 (알림·진동·오버레이 테두리)' },
  { key: 'transfer', title: '환승 알림', desc: '환승역 1정거장 전 (알림·진동·오버레이 테두리)' },
  { key: 'arrive_reco', title: '하차 전 추천', desc: '도착 5분 전 카페·야식 추천 (오버레이 하단·앱 안 팝업)' }
];
// 규칙 엔진(rules.js): Worker 에서는 같은 범위의 함수, Node 시험에서는 불러온다
function settingsFlag(v, def) { return v == null ? def : (v === 1 || v === true || v === '1'); }
function settingsStr(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }
function settingsFacts(f) {
  f = (f && typeof f === 'object') ? f : {};
  var np = (f.np && typeof f.np === 'object') ? f.np : {};
  var o = {
    id: settingsStr(f.id, 12), np: {}, npd: settingsFlag(f.npd, false), rl: settingsFlag(f.rl, true), th: f.th === 'dark' ? 'dark' : 'pastel',
    sam: settingsFlag(f.sam, false), samw: settingsFlag(f.samw, false), errn: Math.max(0, Math.min(999, Math.floor(Number(f.errn) || 0))),
    cm: f.cm == null ? null : settingsFlag(f.cm, false), ovl: f.ovl == null ? null : settingsFlag(f.ovl, false),
    pgs: Array.isArray(f.pgs) ? f.pgs.filter(function (x) { return typeof x === 'string'; }).slice(0, 8) : null          // 앱이 실제로 열 수 있는 하위 화면 이름들(없으면 모두 보인다)
  };
  SETTINGS_NOTIF.forEach(function (n) { o.np[n.key] = settingsFlag(np[n.key], true); });          // 알림은 기본 켜짐(저장값이 0 일 때만 꺼짐)
  return o;
}
function settingsHash(s) {                       // djb2 — 같은 화면이면 같은 rev (앱이 '바뀌었나'만 본다)
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
// ── 노드 만들기(모양 한 곳) ──
function settingsTitleN(s, mb) { return { t: 'text', s: s, size: 15, bold: true, color: 'text', pad: [0, 0, 0, mb == null ? 4 : mb], lh: 1.3 }; }
function settingsDescN(s, mb, hl) { var n = { t: 'text', s: s, size: 12, color: 'sub', lh: 1.5, pad: [0, 0, 0, mb == null ? 12 : mb] }; if (hl) n.hl = hl; return n; }
function settingsPanelN(kids, mt) { return { t: 'panel', pad: [16, mt == null ? 12 : mt, 16, 0], ip: [16, 16, 16, 16], fill: 'card', line: 'border', r: 14, kids: kids }; }
function settingsBoldN(parts) {                           // [[글, 굵게 0|1], …] → { s, hl }
  var s = '', hl = [];
  parts.forEach(function (p) { if (p[1]) hl.push([s.length, s.length + p[0].length]); s += p[0]; });
  return { s: s, hl: hl };
}
function settingsStatN(s) { return { t: 'box', s: s, size: 11.5, lh: 1.6, color: 'text', fill: 'bg', line: 'border', r: 8, ip: [10, 8, 10, 8], pad: [0, 0, 0, 0] }; }
function settingsNavN(title, sub, act, top) { var n = { t: 'navrow', title: title, act: act, top: !!top, size: 13 }; if (sub) n.sub = sub; return n; }

function settingsScreen(inp, factsIn) {
  inp = inp || {};
  if (!(Number(inp.cap) >= 3)) return { ok: false, error: 'cap' };
  if (inp.p) return settingsPageScreen(inp, factsIn);
  var f = settingsFacts(factsIn), body = [];
  var pg = Number(inp.cap) >= SETTINGS_PAGE_CAP;                       // 새 앱이면 눌렀을 때 네이티브 하위 화면으로(act call pg.<이름>), 옛 앱이면 예전 웹 카드 시트로(act web)
  var pgHas = function (k) { return !f.pgs || f.pgs.indexOf(k) >= 0; };
  var pgAct = function (k) { return pg ? { a: 'call', v: 'pg.' + k } : { a: 'web', v: k }; };

  // 1) 커뮤니티 아이디
  var idKids = [settingsTitleN('커뮤니티 아이디', 6)];
  var d1 = settingsBoldN([['아이디를 등록하면 게시글 작성과 실시간 채팅에 참여할 수 있어요.\n아이디 없이도 글과 채팅을 ', 0], ['구경', 1], ['하는 건 자유롭게 가능합니다.', 0]]);
  idKids.push(settingsDescN(d1.s, 14, d1.hl));
  if (f.id) {
    var curS = '현재 아이디\n' + f.id;                                                 // 웹 #curIdBox: 작은 글 '현재 아이디' 아래 금색 굵은 아이디(두 줄)
    idKids.push({ t: 'box', s: curS, hl: [[7, curS.length]], hc: 'gold', size: 13, lh: 1.45, color: 'sub', fill: '#1c1c1e', line: '', tc: 'sub', r: 10, ip: [13, 11, 13, 11], pad: [0, 0, 0, 12] });
  }
  idKids.push({ t: 'field', key: 'cid', hint: '아이디 입력 (2~12자, 한글/영문/숫자)', value: f.id, maxlen: 12, h: 40, size: 14, r: 9, pad: [0, 0, 0, 10] });
  idKids.push({ t: 'button', s: '아이디 저장', size: 14, h: 42, r: 10, bold: true, fill: 'gold', line: 'none', tc: '#121214', act: { a: 'call', v: 'saveId' } });
  if (f.id) idKids.push({ t: 'button', s: '아이디 삭제', size: 12, h: 38, r: 10, bold: true, fill: 'none', line: 'border2', tc: '#ff453a', pad: [0, 8, 0, 0], act: { a: 'call', v: 'clearId' } });
  body.push(settingsPanelN(idKids, 16));
  body.push({ t: 'text', s: '아이디는 이 기기에만 저장되며,\n작성한 글·채팅에 표시됩니다.', size: 11, color: 'sub', lh: 1.5, align: 'center', pad: [16, 14, 16, 0] });

  // 2) 알림 설정
  var nk = [settingsTitleN('알림 설정', 4), settingsDescN('받고 싶은 알림만 골라서 켜고 끌 수 있어요. 끄면 진동도 함께 꺼져요.', 12)];
  if (f.npd) nk.push({ t: 'box', s: '알림 권한이 꺼져 있어요. 기기 설정 > 앱 > 길동무 > 알림에서 허용해주세요.', size: 12, lh: 1.5, tc: '#ff453a', color: 'text', fill: 'rgba(255,69,58,0.12)', line: 'rgba(255,69,58,0.35)', r: 10, ip: [12, 10, 12, 10], pad: [0, 0, 0, 4] });
  SETTINGS_NOTIF.forEach(function (n, i) {
    nk.push({ t: 'toggle', key: 'n.' + n.key, title: n.title, sub: n.desc, on: !!f.np[n.key], top: true, vp: 9, size: 13.5, ssize: 11, onc: '#30d158' });
  });
  body.push(settingsPanelN(nk));

  // 3) 갤럭시 전용
  if (f.sam) {
    var sk = [settingsTitleN('갤럭시 백그라운드 유지', 4)];
    var sd = settingsBoldN([['갤럭시는 며칠 안 쓴 앱을 자동 절전시켜 화면이 꺼진 동안의 하차 알림이 멈출 수 있어요. 길동무를 ', 0], ['자동으로 절전하지 않는 앱', 1], ['에 넣어 두면 안전해요.', 0]]);
    sk.push(settingsDescN(sd.s, 8, sd.hl));
    if (f.samw) sk.push({ t: 'box', s: '이 앱의 배터리 사용이 제한됨으로 되어 있어요. 앱 정보 > 배터리에서 제한 없음으로 바꿔 주세요.', size: 12, lh: 1.5, tc: '#ff9f0a', color: 'text', fill: 'rgba(255,159,10,0.12)', line: 'rgba(255,159,10,0.35)', r: 10, ip: [12, 10, 12, 10], pad: [0, 0, 0, 4] });
    if (pgHas('sam')) sk.push({ t: 'button', s: '자동 절전 제외 설정 열기', size: 13, h: 40, r: 10, bold: true, fill: 'gold', line: 'none', tc: '#121214', act: pgAct('sam') });      // 웹 samSetCard 의 금색 전체 폭 단추
    body.push(settingsPanelN(sk));
  }

  // 4) 안내 정확도
  body.push(settingsPanelN([
    settingsTitleN('안내 정확도 향상', 2),
    { t: 'toggle', key: 'rl', title: '도착 오차 익명 기록', sub: '목적지에 도착하면 예상 시간과 실제 시간의 차이만 익명으로 보내요. 역 이름·위치·기기 정보는 보내지 않아요.', on: f.rl, vp: 6, size: 13.5, ssize: 11, onc: '#30d158' }
  ]));

  // 6) 웹 설정 탭과 같은 순서의 기능 카드: 출퇴근 브리핑 → 캐릭터 시계 위젯 → 하차 추천 → 다른 앱 위에 표시 → 개발자 도구 (웹은 카드 안에 입력칸을 펼치고, 앱은 카드 아래 줄을 눌러 같은 내용의 하위 화면을 연다)
  var onTxt = function (v) { return v == null ? '' : (v ? '켜짐' : '꺼짐'); };
  if (pgHas('cm')) {
    var cmd = settingsBoldN([['설정한 시각에 ', 0], [f.pgs ? '날씨 + 혼잡도 + 준비물 한마디' : '날씨 + AI 역무원 요약', 1], ['를 알림으로 보내드려요.', 0]]);
    body.push(settingsPanelN([settingsTitleN('출퇴근 브리핑 알림', 4), settingsDescN(cmd.s, 6, cmd.hl), settingsNavN('시간 · 장소 · 요일 설정', onTxt(f.cm), pgAct('cm'), true)]));
  }
  if (pgHas('gw')) body.push(settingsPanelN([settingsTitleN('캐릭터 시계 위젯', 4),
    settingsDescN('평소엔 캐릭터들이 각자 집에서 자고 있다가, 화면을 켜면 일어나 시계 주변을 돌아다니며 시계에 매달리고 응가도 해요. 출·퇴근 시각이 되면 캐릭터가 모여 응원하고 [출근하기]·[퇴근하기] 버튼이 나와요.', 6),
    settingsNavN('위젯 추가 · 돌아다니는 시간', '', pgAct('gw'), true)]));
  if (pgHas('arr')) body.push(settingsPanelN([settingsTitleN(f.pgs ? '하차 7분 전 추천' : '하차 5분 전 추천', 4),
    settingsDescN(f.pgs ? '도착 7분 전에 시간대별로 보내는 추천이에요. 시험 버튼으로 실제 알림과 같은 내용을 미리 받아 볼 수 있어요.' : '도착 5분 전에 시간대별로 보내는 추천이에요. 시험 버튼으로 실제 알림과 같은 내용을 미리 받아 볼 수 있어요.', 6),
    settingsNavN('시험 알림 · 상태 확인', '', pgAct('arr'), true)]));
  if (pgHas('ovl')) body.push(settingsPanelN([settingsTitleN('다른 앱 위에 표시', 4),
    settingsDescN('다른 앱을 쓰는 동안 현재역 · 남은시간을 화면 위쪽에 작은 막대로 띄워요. 안내 정보만 보여주고 광고는 넣지 않아요.', 6),
    settingsNavN('표시 설정', onTxt(f.ovl), pgAct('ovl'), true)]));
  if (pgHas('dev')) body.push(settingsPanelN([settingsTitleN('개발자 도구', 4),
    settingsDescN('오버레이 시나리오 시험 같은 진단 도구예요.', 6),
    settingsNavN('도구 열기', '', pgAct('dev'), true)]));

  // 7) 테마
  var dk = f.th === 'dark';
  body.push(settingsPanelN([
    settingsTitleN('테마 설정', 4), settingsDescN('앱 전체 색상 테마를 변경할 수 있어요.', 14),
    { t: 'select', title: '다크 블랙', sub: '깊고 선명한 다크 테마', on: dk, act: { a: 'sel', v: 'dark' }, fill: '#18181a', line: 'border', onl: '#d4af37', tc: '#f2f2f7', sc: '#8e8e93', chk: '#d4af37', ckf: '#121214',
      prev: ['#121214', '#1c1c1e', '#3a3a3c', '#d4af37', '#3a3a3c'], pad: [0, 0, 0, 10] },
    { t: 'select', title: '하늘 파스텔', sub: '맑고 시원한 하늘색 테마', on: !dk, act: { a: 'sel', v: 'pastel' }, fill: 'card', line: 'border', onl: '#1d9bf0', chk: '#1d9bf0', ckf: '#ffffff',
      prev: ['#f0f4f8', '#ffffff', '#dce8f0', '#1d9bf0', '#dce8f0'] }
  ]));

  // 8) 약관
  body.push(settingsPanelN([
    settingsTitleN('약관 및 정책', 4),
    settingsNavN('개인정보처리방침', '', { a: 'call', v: 'pol.privacy' }, true),
    settingsNavN('위치기반서비스 이용약관', '', { a: 'call', v: 'pol.location' }, true),
    settingsNavN('데이터 출처 및 고지', '', { a: 'call', v: 'pol.opensource' }, true),
    settingsNavN('오류 로그', f.errn > 0 ? String(f.errn) : '', { a: 'call', v: 'errlog' }, true)
  ]));
  body.push({ t: 'spacer', h: 28 });

  var out = { ok: true, v: 1, screen: 'settings', cover: 'tab', head: [{ t: 'divider', pad: [0, 0, 0, 0], c: 'border' }], body: body };
  out.rev = 's' + SETTINGS_SCREEN_V + ':' + settingsHash(JSON.stringify(body));
  return out;
}

// ══════════════════════════════════════════════════════════════════════════
// ★ 하위 화면(cap 8) — 예전에 '웹 카드 시트'로 열던 6개: 갤럭시 절전 · 다른 앱 위에 표시 · 개발자 도구 · 하차 추천 시험 · 캐릭터 시계 위젯 · 출퇴근 브리핑.
//   앱은 pf(기기 사실)만 보낸다 — 켜짐·값·고른 칸·읽은 숫자. 글(상태 문구·시각 글·요일 안내·퇴근 힌트·시간대 이름)과 어떤 칸을 어떻게 보일지는 여기서 정한다.
//   행동(act call v): pg.back(설정으로) · sam.open · bat.req · ovl.diag · pf.live · pf.rec · dev.start.<모드> · dev.stop · arr.t.<종류> · arr.demo · arr.stat ·
//   gw.add.<hb|hw|vb|vw> · gw.roam.<dn|up> · erl.copy · erl.clear · locd.ok · locd.no · ask.ok · ask.no · cm.day.<0-6> · cm.preset.<weekday|weekend|all> · cm.tp.<morn|eve> · cm.test · cm.pick.<from|to|eFrom|eTo> ·
//   tp.ap.<am|pm> · tp.h.<1-12> · tp.m.<0-55> · tp.ok · tp.cancel · pk.save · pk.clear · pk.u.<번호> · pk.b.<번호> · pk.cancel.   스위치(toggle) 키: cm · ovl.
// ══════════════════════════════════════════════════════════════════════════
var SETTINGS_PAGES = { sam: '갤럭시 백그라운드 유지', ovl: '다른 앱 위에 표시', dev: '개발자 도구', arr: '하차 5분 전 추천', gw: '캐릭터 시계 위젯', cm: '출퇴근 브리핑 알림', polp: '개인정보처리방침', poll: '위치기반서비스 이용약관', polo: '데이터 출처 및 고지', erl: '오류 로그', locd: '위치 정보 이용 안내', askbat: '화면을 꺼도 끊기지 않게', asksam: '갤럭시 절전 제외', askovl: '다른 앱 위에 표시' };
var SETTINGS_ASK = { askbat: 1, asksam: 1, askovl: 1 };      // 처음 설치 때 이어서 묻는 기기 설정 안내 — 뒤로 가기 없이 [나중에]/[설정하기] 만
var SETTINGS_DAY_NM = ['일', '월', '화', '수', '목', '금', '토'];
var SETTINGS_BK = ['알 수 없음', '활성', '작업 집합', '자주 사용', '드물게 사용', '제한'];
var SETTINGS_PICK = { from: ['출근 출발지 (집 근처)', '지하철·버스 (예: 아라)', '현재 위치 기준'], to: ['출근 도착지 (회사 근처)', '지하철·버스 (예: 강남)', '현재 위치 기준'],
                      eFrom: ['퇴근 출발지', '비우면 회사 근처 역', '출근 도착지와 같음'], eTo: ['퇴근 도착지', '비우면 집 근처 역', '출근 출발지와 같음'] };
var SETTINGS_PICK_MAX = 12, SETTINGS_BUS_MAX = 5;

function settingsHm(v, def) { return (typeof v === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(v)) ? ('0' + v.split(':')[0]).slice(-2) + ':' + v.split(':')[1] : def; }
function settingsFmtTime(hm) {                                      // 예전 _cmFmtTime 과 같다: '07:30' → '오전 7:30'
  var p = String(hm || '07:30').split(':'), h = parseInt(p[0], 10) || 0, mi = p[1] || '00';
  return (h < 12 ? '오전' : '오후') + ' ' + ((h % 12) || 12) + ':' + mi;
}
function settingsInt(v, lo, hi, def) { v = Math.floor(Number(v)); return (isFinite(v) && v >= lo && v <= hi) ? v : def; }
// 반응 속도 기록(앱 PerfLog): d = 그리기 [횟수, 평균ms, 최대ms, 느린 수] · l = 화면 구성 [같은 모양] · n = 서버 요청 [[경로, 횟수, 평균ms, 최대ms, 실패], …]. 없으면 null(옛 앱).
function settingsPerfFacts(p) {
  if (!p || typeof p !== 'object') return null;
  var four = function (a) { a = Array.isArray(a) ? a : []; return [0, 1, 2, 3].map(function (i) { return settingsInt(a[i], 0, 99999999, 0); }); };
  var net = (Array.isArray(p.n) ? p.n : []).slice(0, 12).map(function (r) {
    r = Array.isArray(r) ? r : [];
    return { p: settingsStr(r[0], 40), n: settingsInt(r[1], 0, 99999999, 0), a: settingsInt(r[2], 0, 99999999, 0), m: settingsInt(r[3], 0, 99999999, 0), x: settingsInt(r[4], 0, 99999999, 0) };
  });
  return { d: four(p.d), l: four(p.l), n: net };
}
// 반응 속도 글: 기준(느림) = 그리기 17ms · 화면 구성 16ms 이상, 서버 평균 800ms 이상. 느린 비율이 5% 를 넘거나 최대가 100ms 를 넘으면 짚어 준다.
function settingsPerfLines(pf) {
  var d = pf.d, l = pf.l, out = [];
  var pct = function (a) { return a[0] ? Math.round(a[3] * 1000 / a[0]) / 10 : 0; };
  out.push('그리기  ' + d[0] + '회 · 평균 ' + d[1] + 'ms · 최대 ' + d[2] + 'ms · 느린 것 ' + d[3] + '회(' + pct(d) + '%)');
  out.push('화면 구성  ' + l[0] + '회 · 평균 ' + l[1] + 'ms · 최대 ' + l[2] + 'ms · 느린 것 ' + l[3] + '회(' + pct(l) + '%)');
  var slowNet = [];
  pf.n.forEach(function (r) {
    out.push('서버 ' + r.p + '  ' + r.n + '회 · 평균 ' + r.a + 'ms · 최대 ' + r.m + 'ms' + (r.x ? ' · 실패 ' + r.x + '회' : ''));
    if (r.n >= 2 && r.a >= 800) slowNet.push(r.p);
  });
  var notes = [];
  if (d[0] >= 30 && (pct(d) > 5 || d[2] > 100)) notes.push('그리기가 자주 느려요(17ms 넘는 비율 ' + pct(d) + '%, 최대 ' + d[2] + 'ms) — 한 화면에 그릴 것이 많거나 계속 다시 그리는 곳이 있다는 뜻이에요.');
  if (l[0] >= 5 && (pct(l) > 5 || l[2] > 100)) notes.push('화면 구성이 느려요(최대 ' + l[2] + 'ms) — 목록이 길거나 글이 많은 화면이에요.');
  if (slowNet.length) notes.push('서버 응답이 느려요: ' + slowNet.join(', ') + ' (평균 800ms 이상).');
  if (!notes.length) notes.push(d[0] + l[0] < 20 ? '아직 기록이 적어요. 앱을 쓰다가 다시 열어 보세요.' : '큰 문제 없음.');
  return out.concat(['', '판정: ' + notes.join(' ')]);
}
function settingsPageFacts(pf) {
  pf = (pf && typeof pf === 'object') ? pf : {};
  var tri = function (v) { return v == null ? null : settingsFlag(v, false); };
  var days = [];
  (Array.isArray(pf.days) ? pf.days : []).forEach(function (d) { d = Math.floor(Number(d)); if (d >= 0 && d <= 6 && days.indexOf(d) < 0) days.push(d); });
  days.sort();
  var tp = (pf.tp && typeof pf.tp === 'object') ? pf.tp : null, pk = (pf.pick && typeof pf.pick === 'object') ? pf.pick : null, st = (pf.st && typeof pf.st === 'object') ? pf.st : null;
  var dg = (st && st.dg && typeof st.dg === 'object') ? st.dg : {};
  return {
    sm: settingsFlag(pf.sm, false), w: settingsFlag(pf.w, false), ig: tri(pf.ig), bk: pf.bk == null ? null : settingsInt(pf.bk, 0, 5, 0), er: settingsFlag(pf.er, false), sok: tri(pf.sok),
    nat: settingsFlag(pf.nat, true), sup: tri(pf.sup), gr: tri(pf.gr), on: settingsFlag(pf.on, false), pfl: settingsFlag(pf.pfl, false), pfr: settingsFlag(pf.pfr, false), nv: settingsFlag(pf.nv, false),
    perf: settingsPerfFacts(pf.perf),
    ph: ['plain', 'reco', 'alert2', 'alert1', 'quit'].indexOf(pf.ph) >= 0 ? pf.ph : '', left: settingsInt(pf.left, 0, 600, 0), stopped: settingsFlag(pf.stopped, false),
    errs: (Array.isArray(pf.errs) ? pf.errs : []).slice(-40).map(function (e) { e = e && typeof e === 'object' ? e : {}; return { t: settingsStr(e.t, 24), m: settingsStr(e.m, 300), f: settingsStr(e.f, 200), s: settingsStr(e.s, 600), n: settingsInt(e.n, 1, 9999, 1) }; }),
    roam: settingsInt(pf.roam, 2, 10, 6), mOn: settingsFlag(pf.mOn, false), eOn: settingsFlag(pf.eOn, false),
    morn: settingsHm(pf.morn, '07:30'), eve: settingsHm(pf.eve, '18:30'), days: days,
    from: settingsStr(pf.from, 60), to: settingsStr(pf.to, 60), eFrom: settingsStr(pf.eFrom, 60), eTo: settingsStr(pf.eTo, 60),
    sub: pf.sub === 'tp' ? 'tp' : (pf.sub === 'pick' ? 'pick' : ''),
    tp: tp ? { t: tp.t === 'eve' ? 'eve' : 'morn', ap: tp.ap === 'pm' ? 'pm' : 'am', h: settingsInt(tp.h, 1, 12, 7), m: settingsInt(tp.m, 0, 55, 0) - (settingsInt(tp.m, 0, 55, 0) % 5) } : null,
    pick: pk ? { k: SETTINGS_PICK[pk.k] ? pk.k : 'from', q: settingsStr(pk.q, 60) } : null,
    st: st ? { timer: settingsFlag(st.timer, false), route: settingsFlag(st.route, false), dest: settingsStr(st.dest, 40), rem: st.rem == null ? null : settingsInt(st.rem, 0, 86400, 0),
               pre: settingsInt(st.pre, 1, 60, 10), slot: ['morning', 'lunch', 'night', 'shop', 'none'].indexOf(st.slot) >= 0 ? st.slot : 'none', dinner: settingsFlag(st.dinner, false),
               alertAt: (typeof st.alertAt === 'number' && isFinite(st.alertAt)) ? st.alertAt : null, tickAt: (typeof st.tickAt === 'number' && isFinite(st.tickAt)) ? st.tickAt : null,
               tzo: (typeof st.tzo === 'number' && isFinite(st.tzo) && Math.abs(st.tzo) <= 1000) ? st.tzo : -540, policy: settingsFlag(st.policy, false),
               dg: { stage: settingsStr(dg.stage, 60), at: (typeof dg.at === 'number' && isFinite(dg.at)) ? dg.at : null, err: settingsStr(dg.err, 100) },
               err: settingsStr(st.err, 100) } : null
  };
}
// 'HH:MM:SS' 시계 글(예전 toLocaleTimeString ko-KR 과 같은 '오후 3:07:12')
function settingsClock(ms, tzo) {
  var d = new Date(ms - tzo * 60000), h = d.getUTCHours();
  return (h < 12 ? '오전' : '오후') + ' ' + ((h % 12) || 12) + ':' + ('0' + d.getUTCMinutes()).slice(-2) + ':' + ('0' + d.getUTCSeconds()).slice(-2);
}
// 지하철 후보: 예전 _cmSug 와 같다 — 공백·끝 '역' 을 떼고, 이름이 글자로 시작하는 역을 먼저(12개까지), 글자가 들어 있는 역을 그다음에 모아 12개까지. 같은 이름은 하나.
function settingsStnFind(q) {
  q = String(q || '').replace(/\s+/g, '').replace(/역$/, '');
  var out = { u: [], pk: [] };
  var STNS = settingsStns();
  if (!q || !Array.isArray(STNS)) return out;
  var map = {}, order = [], i, s, it;
  for (i = 0; i < STNS.length; i++) {
    s = STNS[i];
    if (!s || typeof s[0] !== 'string') continue;
    if (!Object.prototype.hasOwnProperty.call(map, s[0])) { map[s[0]] = { name: s[0], plain: s[0].replace(/\s+/g, ''), lines: [] }; order.push(map[s[0]]); }
    if (map[s[0]].lines.indexOf(s[1]) < 0) map[s[0]].lines.push(s[1]);
  }
  var pre = [], mid = [];
  for (i = 0; i < order.length; i++) {
    it = order[i];
    var p = it.plain.indexOf(q);
    if (p === 0) { pre.push(it); if (pre.length >= SETTINGS_PICK_MAX) break; }
    else if (p > 0 && mid.length < SETTINGS_PICK_MAX) mid.push(it);
  }
  pre.concat(mid).slice(0, SETTINGS_PICK_MAX).forEach(function (x) {
    out.u.push({ n: x.name, l: '지하철 · ' + x.lines.slice(0, 2).join('·') + (x.lines.length > 2 ? ' 외' : '') });
    out.pk.push({ name: x.name });
  });
  return out;
}

// ── 노드 만들기 ──
function settingsCall(v) { return { a: 'call', v: v }; }
function settingsBtnN(s, v, o) {                                    // o: { gold, on, h, size, mb, tc }
  o = o || {};
  var n = { t: 'button', s: s, size: o.size || 13, h: o.h || 42, r: 10, bold: true, act: settingsCall(v) };
  if (o.gold) { n.fill = 'gold'; n.line = 'none'; n.tc = '#121214'; }
  else if (o.on) { n.fill = 'gold'; n.line = 'gold'; n.tc = '#121214'; }
  else { n.fill = o.fill || 'none'; n.line = 'border2'; n.tc = o.tc || 'text'; }
  if (o.mb != null) n.pad = [0, 0, 0, o.mb];
  return n;
}
function settingsRowN(kids, mb) { return { t: 'row', gap: 8, pad: [0, 0, 0, mb == null ? 8 : mb], kids: kids }; }
function settingsBackN(label) { return { t: 'button', s: '‹ ' + (label || '설정'), size: 14, h: 42, r: 12, bold: true, fill: 'card', line: 'border', tc: 'text', pad: [14, 12, 14, 0], act: settingsCall('pg.back') }; }
function settingsWarnN(parts, mb) { var b = settingsBoldN(parts); return { t: 'box', s: b.s, hl: b.hl, size: 12, lh: 1.5, tc: '#ff9f0a', color: 'text', fill: 'rgba(255,159,10,0.12)', line: 'rgba(255,159,10,0.35)', r: 10, ip: [12, 10, 12, 10], pad: [0, 0, 0, mb == null ? 12 : mb] }; }
function settingsTipN(parts) { var b = settingsBoldN(parts); return { t: 'box', s: b.s, hl: b.hl, size: 11.5, lh: 1.6, color: 'text', fill: 'rgba(10,132,255,0.10)', line: 'rgba(10,132,255,0.3)', r: 8, ip: [10, 8, 10, 8], pad: [0, 10, 0, 0] }; }
function settingsSmallN(s, mt, mb, hl) { var n = { t: 'text', s: s, size: 11, color: 'sub', lh: 1.55, pad: [0, mt == null ? 0 : mt, 0, mb == null ? 0 : mb] }; if (hl) n.hl = hl; return n; }
function settingsLabelN(s, mb) { return { t: 'text', s: s, size: 11, bold: true, color: 'sub', lh: 1.3, pad: [0, 0, 0, mb == null ? 5 : mb] }; }

// ── 갤럭시 백그라운드 유지 ──
function settingsPageSam(f) {
  var k = [settingsTitleN('갤럭시 백그라운드 유지', 4)];
  var d = settingsBoldN([['갤럭시는 며칠 안 쓴 앱을 자동 절전시켜 화면이 꺼진 동안의 하차 알림이 멈출 수 있어요. 길동무를 ', 0], ['자동으로 절전하지 않는 앱', 1], ['에 넣어 두면 안전해요.', 0]]);
  k.push(settingsDescN(d.s, 12, d.hl));
  if (f.w) k.push(settingsWarnN([['이 앱의 배터리 사용이 ', 0], ['제한됨', 1], ['으로 되어 있어요. 앱 정보 > 배터리에서 ', 0], ['제한 없음', 1], ['으로 바꿔 주세요.', 0]]));
  k.push(settingsBtnN('자동 절전 제외 설정 열기', 'sam.open', { gold: true, mb: 10 }));
  var st;
  if (f.sok === true) {
    var parts = [['현재 상태 · 배터리 최적화 제외: ', 0], [f.ig ? '예' : '아니요', 1], [' · 앱 배터리 제한: ', 0], [f.w ? '제한됨' : '제한 없음/최적화', 1], [' · 기기가 보는 앱 등급: ', 0], [SETTINGS_BK[f.bk == null ? 0 : f.bk], 1]];
    st = settingsBoldN(parts);
    k.push({ t: 'box', s: st.s, hl: st.hl, size: 11.5, lh: 1.6, color: 'text', fill: 'bg', line: 'border', r: 8, ip: [10, 8, 10, 8] });
  } else k.push(settingsStatN(f.sok === false || f.er ? '현재 상태: 읽지 못했어요' : '현재 상태: 확인 중…'));
  if (f.sok === true && f.ig) k.push(settingsTipN([['앱 배터리가 ', 0], ['제한 없음', 1], ['이면 삼성 목록 선택 창에 길동무가 ', 0], ['나오지 않아요', 1], ['(이미 가장 높은 설정이에요). 목록에도 넣고 싶으면 앱 정보 > 배터리를 잠시 ', 0], ['최적화', 1], ['로 바꿔 추가한 뒤 다시 ', 0], ['제한 없음', 1], ['으로 돌려 주세요.', 0]]));
  var n = settingsBoldN([['목록 오른쪽 위 + 를 누르고 길동무를 체크(안 보이면 아래 검색창에 입력)한 뒤 추가하세요. 추가됐는지는 기기에서 확인해 주세요. 이동 중 최근 앱 화면에서 ', 0], ['모두 닫기', 1], ['를 누르면 안내가 멈춰요.', 0]]);
  k.push(settingsSmallN(n.s, 10, 0, n.hl));
  return [settingsPanelN(k, 8)];
}
// ── 다른 앱 위에 표시 ──
function settingsOvlStat(f) {                                       // 예전 _ovlSyncToggle 의 상태 문구와 같다
  if (!f.nat) return '이 앱 버전에서는 지원하지 않아요.';
  if (f.sup === false) return '이 기기(안드로이드 8 미만)에서는 지원하지 않아요.';
  if (f.gr === true) return f.on ? '사용 중 · 다른 앱을 쓰는 동안 위쪽에 표시돼요.' : '권한은 허용됨 · 지금은 꺼져 있어요.';
  return f.on ? '권한이 필요해요 · 설정에서 \'다른 앱 위에 표시\'를 허용해 주세요.' : '꺼져 있어요.';
}
function settingsPageOvl(f) {
  var k = [{ t: 'toggle', key: 'ovl', title: '다른 앱 위에 표시', on: f.on, big: true, size: 15, vp: 0, onc: 'gold', pad: [0, 0, 0, 6] },
    settingsDescN('다른 앱을 쓰는 동안 현재역 · 남은시간을 화면 위쪽에 작은 막대로 띄워요. 막대를 누르면 앱으로 돌아오고, 끌어서 위치를 옮길 수 있어요. 안내 정보만 보여주고 광고는 넣지 않아요. 처음 켜면 설정에서 \'다른 앱 위에 표시\' 권한을 허용해 주세요.', 8),
    { t: 'text', s: settingsOvlStat(f), size: 11.5, color: 'sub', lh: 1.6, pad: [0, 0, 0, 10] },
    f.nv ? null : settingsBtnN('오버레이 진단 기록 보기', 'ovl.diag', { size: 12, h: 38, tc: 'sub', mb: 6 }),
    settingsBtnN(f.pfl ? '새 위치 판단기 보정: 켜짐 (누르면 끔)' : '새 위치 판단기 보정: 꺼짐 (누르면 켬 · 실험)', 'pf.live', { size: 12, h: 38, on: f.pfl, mb: 6 }),
    f.nv ? null : settingsBtnN(f.pfr ? '정답 기록 버튼: 켜짐 (누르면 끔)' : '정답 기록 버튼: 꺼짐 (테스트 탑승용)', 'pf.rec', { size: 12, h: 38, on: f.pfr })].filter(function (x) { return !!x; });   // nv(네이티브 앱)에는 웹 진단 도구가 없다
  return [settingsPanelN(k, 8)];
}
// ── 개발자 도구(오버레이 테스트) ──
var SETTINGS_DEV_PH = { plain: '평상시', reco: '추천', alert2: '2정거장 전', alert1: '1정거장 전(내릴 준비)', quit: '앱 자동종료 예약(15초 뒤)' };
function settingsPageDev(f) {
  var b = f.nv
    ? settingsBoldN([['가짜 여정(임학→아라)을 떠 있는 안내 막대에 보내 평상시·2정거장 전(주황)·1정거장 전(빨강)의 색과 글이 바뀌는지 실기기로 확인해요. \'다른 앱 위에 표시\'를 켜 두고, 버튼을 누른 뒤 ', 0], ['홈 화면으로 나가세요', 1], ['. 안내 막대는 위아래로 끌어 옮길 수 있고, 누르면 앱으로 돌아와요.', 0]])
    : settingsBoldN([['가짜 여정(임학→아라)을 오버레이에 보내 접힘·펼침·무지개·버튼을 실기기로 확인해요. \'다른 앱 위에 표시\'를 켜 두고, 버튼을 누른 뒤 ', 0], ['홈 화면으로 나가세요', 1], ['. 알약으로 접어 두려면 오버레이를 위로 쓸어 올리세요(접힌 상태는 기억돼요).', 0]]);
  var stat = f.ph ? ('진행 중 · 지금 단계: ' + SETTINGS_DEV_PH[f.ph] + ' · ' + f.left + '초 남음') : (f.stopped ? '중지했어요.' : '');
  var k = [settingsTitleN('개발자 도구', 4), settingsDescN('오버레이 테스트 · 출시 전 삭제', 4), settingsDescN(b.s, 12, b.hl),
    settingsBtnN('▶ 전체 시나리오 (75초)', 'dev.start.all', { gold: true, mb: 8 }),
    settingsSmallN(f.nv ? '0~15초 평상시(회색 막대) → 15~30초 추천(하차 추천 알림이 실제로 와요) → 30~45초 2정거장 전(주황 막대+안내 문구) → 45~60초 1정거장 전(빨간 막대+\'내릴 준비를 해주세요\') → 60~75초 마무리 후 막대가 사라져요' : '0~15초 평상시(이때 알약으로 접기) → 15~30초 추천(접혀 있어도 펼쳐짐) → 30~45초 2정거장 전(알약 둘레 무지개, 펼치지 않음) → 45~60초 1정거장 전(펼침+빠른 무지개+진동+캐릭터+\'내릴 준비를 해주세요\'+응원 문구+[앱 종료]) → 마무리', 0, 10),
    settingsRowN([settingsBtnN('평상시', 'dev.start.plain', { size: 12 }), settingsBtnN('추천', 'dev.start.reco', { size: 12 }), settingsBtnN('2정거장 전', 'dev.start.alert2', { size: 12 }), settingsBtnN('1정거장 전', 'dev.start.alert1', { size: 12 })]),
    settingsBtnN('앱 자동종료 (15초 뒤 진짜 종료)', 'dev.start.quit', { mb: 8 }),
    settingsBtnN('■ 테스트 중지', 'dev.stop')];
  if (stat) k.push(settingsSmallN(stat, 8, 0));
  if (f.perf) {                                                            // 앱이 모은 반응 속도 기록(PerfLog) — 폰에서 어디가 느린지 숫자로 읽는다
    k.push(settingsLabelN('반응 속도 기록', 5));
    k.push(settingsStatN(settingsPerfLines(f.perf).join('\n')));
    k.push(settingsBtnN('기록 지우기', 'perf.reset', { size: 12, h: 38, mb: 0 }));
  }
  k.push(settingsSmallN(f.nv ? '※ 자동종료는 진짜 앱 종료예요(이때 시계 위젯 동물이 계속 움직이는지 확인). 추천 단계는 테스트용 가짜 도착지(강남)로 실제 알림을 한 번 보내요.' : '※ [앱 종료]·자동종료는 진짜 앱 종료예요(이때 시계 위젯 동물이 계속 움직이는지 확인). 추천의 [맛집 보기]는 앱을 앞으로 가져와 가게 화면을, [확인]은 추천만 닫아요(테스트 가짜 추천이라 가게는 실제로 없어요).', 6, 0));
  return [settingsPanelN(k, 8)];
}
// ── 하차 5분 전 추천 시험 ──
function settingsArrSlot(st) {                                      // 예전 _arrStatusShow 의 시간대 이름
  if (st.slot === 'morning') return '커피 (07:01~10:00)';
  if (st.slot === 'lunch') return '점심 (10:01~16:59)';
  if (st.slot === 'night') return st.dinner ? '저녁 식사 (17:00~18:59)' : '야식 (19:00~21:00)';
  if (st.slot === 'shop') return '쇼핑 (21:01~)';
  return '추천 없는 시간대 (00:00~07:00)';
}
function settingsArrLines(st, nv) {                                     // 예전 _arrStatusShow 와 같은 줄들
  var L = [];
  if (st.err) { L.push('상태 확인 오류: ' + st.err); return L; }
  L.push(nv ? '탑승 안내: ' + (st.timer ? '동작 중 (5초마다 확인)' : '꺼져 있음') : '감시 타이머: ' + (st.timer ? '동작 중 (20초마다)' : '없음'));
  L.push('현재 경로: ' + (st.route ? ((st.dest || '-') + ' 도착 예정') : '없음 (탑승 상태 아님)'));
  if (st.rem != null) L.push('남은 시간: ' + Math.floor(st.rem / 60) + '분 ' + (st.rem % 60) + '초' + (st.rem > st.pre * 60 ? '  (' + st.pre + '분 되면 발사)' : '  (발사 구간)'));
  else L.push('남은 시간: 아직 측정 전');
  L.push('지금 시간대: ' + settingsArrSlot(st));
  L.push('마지막 발송: ' + (st.alertAt != null ? settingsClock(st.alertAt, st.tzo) + '  (30분간 재발송 안 함)' : '없음'));
  L.push('알림 정책: ' + (st.policy ? '허용됨' : '차단됨'));
  L.push('마지막 감시: ' + (st.tickAt != null ? settingsClock(st.tickAt, st.tzo) : '없음'));
  L.push('발사 경과: ' + (st.dg.stage || '없음') + (st.dg.at != null ? '  (' + settingsClock(st.dg.at, st.tzo) + ')' : ''));
  if (st.dg.err) L.push('문구 생성 오류: ' + st.dg.err);
  return L;
}
function settingsPageArr(f) {
  var k = [settingsTitleN(f.nv ? '하차 7분 전 추천' : '하차 5분 전 추천', 4),
    settingsDescN(f.nv ? '도착 7분 전에 시간대별로 보내는 추천이에요. 버튼을 누르면 그 시간대의 실제 알림과 같은 내용이 바로 알림으로 와요(도착지는 강남역으로 가정, 알림 권한이 필요해요).' : '도착 5분 전에 시간대별로 보내는 추천이에요. 실제 알림과 같은 내용으로 바로 확인해 볼 수 있어요. 버튼을 누르면 오버레이 아래에도 90초간 뜹니다(오버레이를 켜 둔 상태 — 접혀 있어도 저절로 펼쳐져요).', 12),
    settingsRowN([settingsBtnN('커피', 'arr.t.morning', { size: 12 }), settingsBtnN('점심', 'arr.t.lunch', { size: 12 }), settingsBtnN('야식', 'arr.t.night', { size: 12 }), settingsBtnN('쇼핑', 'arr.t.shop', { size: 12 })]),
    f.nv ? null : settingsBtnN('추천 캐릭터 미리보기', 'arr.demo', { mb: 6 }),
    f.nv ? null : settingsSmallN('캐릭터 하나가 오른쪽에서 추천 줄(실제 가게·쿠팡 상품 이름)을 끌고 들어오는 모습을 14초간 보여 줘요(앱 위에 바로 떠요). 누를 때마다 다른 캐릭터와 다른 종류(식당·카페·쿠팡)가 나오고, 화면을 누르면 닫혀요. \'다른 앱 위에 표시\' 권한이 필요해요.', 0, 10),
    settingsBtnN('상태 확인', 'arr.stat', { gold: true, mb: 10 }),
    settingsStatN(f.st ? settingsArrLines(f.st, f.nv).join('\n') : '\'상태 확인\'을 누르면 감시 상태와 남은 시간이 표시됩니다.')].filter(Boolean);
  return [settingsPanelN(k, 8)];
}
// ── 캐릭터 시계 위젯 ──
function settingsPageGw(f) {
  var roamTxt = f.roam + '분' + (f.roam === 6 ? ' (추천)' : '');
  var note = f.roam > 6 ? '6분 추천이에요. 그보다 길게 두면 배터리 소모량이 조금 늘 수 있어요.' : '6분 추천이에요. 그보다 길면 배터리 소모량이 조금 늘 수 있어요.';
  var on = f.mOn || f.eOn;
  var gwNote = on ? ((f.mOn ? '출근 ' + f.morn : '') + (f.mOn && f.eOn ? ' · ' : '') + (f.eOn ? '퇴근 ' + f.eve : '') + ' 에 위젯이 응원해요') : '출·퇴근 장소를 설정하면 그 쪽 버튼이 나와요.';
  var k = [settingsTitleN('캐릭터 시계 위젯', 4),
    settingsDescN('평소엔 캐릭터들이 각자 잠자리(고양이는 캣타워 · 올챙이는 물웅덩이 · 독수리는 나뭇가지에 매달려 · 강아지는 방석 · 두더지는 흙집)에서 쌔근쌔근 자고 있다가, 화면을 켜면 일어나 정해 둔 시간 동안 시계 주변을 돌아다니며 시계에 매달리고 응가도 해요. 위젯을 누르면 앱이 열리며 커뮤니티 탭으로 가요. 배경은 투명이고, 시계가 칸을 꽉 채워요. 위에서 정한 출·퇴근 시각이 되면 캐릭터가 모여 응원하고, 시계가 작아지면서 [출근하기]·[퇴근하기] 버튼이 나와요. 버튼은 3분 동안만 떠 있고, 누르면 앱이 열리며 바로 길찾기를 해요. (블랙=검정 글자, 화이트=흰 글자)', 12),
    settingsRowN([settingsBtnN('가로 블랙', 'gw.add.hb'), settingsBtnN('가로 화이트', 'gw.add.hw')]),
    settingsRowN([settingsBtnN('세로 블랙', 'gw.add.vb'), settingsBtnN('세로 화이트', 'gw.add.vw')], 6)
  ];
  k.push({ t: 'text', s: '돌아다니는 시간', size: 13, bold: true, color: 'text', lh: 1.3, pad: [0, 14, 0, 6] });
  k.push(settingsRowN([settingsBtnN('− 1분', 'gw.roam.dn', { size: 13, h: 40 }), { t: 'box', s: roamTxt, size: 14, bold: false, lh: 1.3, color: 'gold', fill: 'bg', line: 'border', r: 10, ip: [8, 9, 8, 9] }, settingsBtnN('+ 1분', 'gw.roam.up', { size: 13, h: 40 })], 4));
  k.push(settingsSmallN('2분 · 6분 추천 · 10분 사이에서 골라요', 0, 4));
  k.push(settingsSmallN(note + '\n자고 있는 동물들은 시계 위젯을 눌러 앱에 들어갔다 나오면 깨어나요.', 0, 8));
  k.push(settingsSmallN(gwNote, 4, 8));
  k.push(settingsSmallN('앱이 백그라운드에서 꺼지면 캐릭터가 화면을 켜도 자고 있을 수 있어요(3분 안에 다시 깨워요). 덜 꺼지게 하려면 아래를 눌러 보세요.', 0, 2));
  k.push(settingsNavN('배터리 최적화 제외', '', settingsCall('bat.req'), true));
  k.push(settingsNavN('갤럭시 절전 설정 열기', '', settingsCall('sam.open'), true));
  return [settingsPanelN(k, 8)];
}

// ── 출퇴근 브리핑 ──
function settingsEveHint(f) {                                       // 예전 _cmRenderEveHint
  var ef = f.eFrom.trim(), et = f.eTo.trim();
  if (!ef && !et) {
    var a = f.to.trim(), b = f.from.trim();
    return (a && b) ? ('비워 두면 출근의 반대 \u2014 ' + a + ' \u2192 ' + b + ' 로 보내요.') : '비워 두면 출근의 반대 방향으로 보내요.';
  }
  return '퇴근은 따로 설정한 곳으로 보내요.' + (ef && et ? '' : ' (한쪽만 채우면 나머지는 출근의 반대편을 써요)');
}
// 웹 입력칸 두 개(왼쪽 출발 · 오른쪽 도착): 위에 작은 이름, 아래에 입력 상자 모양 단추. 값이 없으면 웹과 같은 흐린 안내 글(placeholder). 누르면 장소 고르기.
function settingsFieldPair(k, a, b, f, mt) {
  k.push({ t: 'row', gap: 10, pad: [0, mt, 0, 5], kids: [settingsLabelN(SETTINGS_PICK[a][0], 0), settingsLabelN(SETTINGS_PICK[b][0], 0)] });
  k.push({ t: 'row', gap: 10, pad: [0, 0, 0, 8], kids: [a, b].map(function (x) {
    var v = (f[x] || '').trim();
    return { t: 'button', s: v || SETTINGS_PICK[x][1], size: 14, h: 42, r: 9, bold: false, al: 'left', fill: 'bg', line: 'border2', tc: v ? 'text' : 'sub', act: settingsCall('cm.pick.' + x) };
  }) });
}
function settingsPageCm(f) {
  var d = f.nv ? settingsBoldN([['설정한 시각에 ', 0], ['날씨 + 혼잡도 + 준비물 한마디', 1], ['를 알림으로 보내드려요.', 0]]) : settingsBoldN([['설정한 시각에 ', 0], ['날씨 + AI 역무원 요약', 1], ['을 알림으로 보내드려요.', 0]]);
  var k = [{ t: 'toggle', key: 'cm', title: '출퇴근 브리핑 알림', on: f.on, big: true, size: 15, vp: 0, onc: '#30d158', pad: [0, 0, 0, 4] }, settingsDescN(d.s, 10, d.hl)];
  settingsFieldPair(k, 'from', 'to', f, 8);
  k.push(settingsSmallN('지하철역과 버스정류장 모두 입력할 수 있어요. 검색 목록의 지하철/버스 표시로 구분돼요. 비워두면 현재 위치 기준이에요.', 8, 10));
  settingsFieldPair(k, 'eFrom', 'eTo', f, 2);
  k.push(settingsSmallN(settingsEveHint(f), 8, 12));
  k.push(settingsLabelN('보낼 요일', 6));
  var dayKids = SETTINGS_DAY_NM.map(function (nm, di) {
    var sel = f.days.indexOf(di) >= 0;
    var o = { size: 13, h: 38, on: sel };
    var n = settingsBtnN(nm, 'cm.day.' + di, o);
    if (!sel && di === 0) n.tc = '#e5484d'; else if (!sel && di === 6) n.tc = '#2f6fed';
    return n;
  });
  k.push({ t: 'row', gap: 5, pad: [0, 0, 0, 6], kids: dayKids });
  var key = f.days.slice().sort().join(',');
  var presets = [['weekday', '평일', '1,2,3,4,5'], ['weekend', '주말', '0,6'], ['all', '매일', '0,1,2,3,4,5,6']];
  k.push({ t: 'row', gap: 6, pad: [0, 0, 0, 6], kids: presets.map(function (q) { return settingsBtnN(q[1], 'cm.preset.' + q[0], { size: 13, h: 38, on: key === q[2] }); }) });
  k.push(settingsSmallN(f.days.length ? ('선택한 ' + f.days.length + '일에만 보내요.') : '요일을 하나도 고르지 않아 매일 보내요.', 0, 12));
  k.push({ t: 'row', gap: 10, pad: [0, 0, 0, 5], kids: [settingsLabelN('출근 브리핑', 0), settingsLabelN('퇴근 브리핑', 0)] });
  k.push({ t: 'row', gap: 10, pad: [0, 0, 0, 12], kids: [settingsBtnN(settingsFmtTime(f.morn), 'cm.tp.morn', { size: 15, h: 44 }), settingsBtnN(settingsFmtTime(f.eve), 'cm.tp.eve', { size: 15, h: 44 })] });
  k.push(settingsBtnN('지금 미리보기', 'cm.test', { size: 13, h: 42 }));
  if (f.nv) k.push(settingsSmallN('기기 절전 설정에 따라 알림이 몇 분 늦게 올 수 있어요. 늦어지면 \'자동 절전 제외 설정\'을 확인해 주세요.', 8, 0));
  return [settingsPanelN(k, 8)];
}
// 시각 고르기(예전 바텀시트 _cmTimePick 과 같은 칸: 오전/오후 · 시 12칸 · 분 12칸 · 취소/확인)
function settingsPageTp(f) {
  var tp = f.tp || { t: 'morn', ap: 'am', h: 7, m: 30 };
  var now = (tp.ap === 'pm' ? '오후' : '오전') + ' ' + tp.h + ':' + ('0' + tp.m).slice(-2);
  var k = [{ t: 'text', s: tp.t === 'eve' ? '퇴근 브리핑 시간' : '출근 브리핑 시간', size: 14, bold: true, color: 'sub', lh: 1.3, pad: [0, 0, 0, 4] },
    { t: 'text', s: now, size: 28, bold: true, color: 'gold', lh: 1.25, pad: [0, 0, 0, 14] },
    settingsRowN([settingsBtnN('오전', 'tp.ap.am', { size: 13, on: tp.ap === 'am' }), settingsBtnN('오후', 'tp.ap.pm', { size: 13, on: tp.ap === 'pm' })], 14),
    settingsLabelN('시', 6)];
  [[1, 6], [7, 12]].forEach(function (r, i) {
    var ks = []; for (var h = r[0]; h <= r[1]; h++) ks.push(settingsBtnN(String(h), 'tp.h.' + h, { size: 14, h: 40, on: tp.h === h }));
    k.push({ t: 'row', gap: 7, pad: [0, 0, 0, i ? 14 : 7], kids: ks });
  });
  k.push(settingsLabelN('분', 6));
  [[0, 25], [30, 55]].forEach(function (r, i) {
    var ks = []; for (var m = r[0]; m <= r[1]; m += 5) ks.push(settingsBtnN(('0' + m).slice(-2), 'tp.m.' + m, { size: 14, h: 40, on: tp.m === m }));
    k.push({ t: 'row', gap: 7, pad: [0, 0, 0, i ? 18 : 7], kids: ks });
  });
  k.push(settingsRowN([settingsBtnN('취소', 'tp.cancel', { size: 14, h: 46, tc: 'sub' }), settingsBtnN('확인', 'tp.ok', { size: 14, h: 46, gold: true })], 0));
  return [settingsPanelN(k, 8)];
}
// 장소 고르기(지하철역은 엔진 역 표에서, 버스정류장은 앱이 찾아 온 이름을 받아서)
function settingsPagePick(f, info) {
  var pk = f.pick || { k: 'from', q: '' }, P = SETTINGS_PICK[pk.k], q = pk.q.trim();
  var k = [{ t: 'text', s: P[0], size: 14, bold: true, color: 'text', lh: 1.3, pad: [0, 0, 0, 8] },
    { t: 'inbar', key: 'cmq', hint: P[1], value: pk.q, maxlen: 60, h: 44, size: 14, r: 9, fill: 'bg', line: 'border2', btn: '저장', bh: 32, bsize: 12, onc: 'gold', ckf: '#121214', watch: true, pad: [0, 0, 0, 6], act: settingsCall('pk.save'), eact: settingsCall('pk.save') }];
  var rows = [];
  if (q) {
    var st = settingsStnFind(q);
    info.pk = { u: st.pk, b: [] };
    st.u.forEach(function (c, i) { rows.push({ t: 'sug', badge: '지하철', bc: '#0a84ff', name: c.n, sub: c.l.replace(/^지하철 \u00b7 /, ''), act: settingsCall('pk.u.' + i) }); });
    var seen = {};
    f.bus.forEach(function (nm, i) {
      if (info.pk.b.length >= SETTINGS_BUS_MAX || !nm || seen[nm]) return;
      seen[nm] = 1; info.pk.b.push(i);
      rows.push({ t: 'sug', badge: '버스', bc: '#00b341', name: nm, sub: '', act: settingsCall('pk.b.' + i) });
    });
  }
  if (rows.length) rows[rows.length - 1].last = true;
  rows.forEach(function (r) { k.push(r); });
  if (!rows.length) k.push(settingsSmallN(q ? '맞는 역이나 정류장을 찾지 못했어요. 그대로 저장해도 돼요.' : '지하철역과 버스정류장 모두 입력할 수 있어요. 검색 목록의 지하철/버스 표시로 구분돼요. ' + P[2] + '(비워 두고 저장).', 8, 6));
  k.push(settingsBtnN('비우기', 'pk.clear', { size: 12, h: 38, tc: 'sub', mb: 8 }));
  k.push(settingsBtnN('취소', 'pk.cancel', { size: 12, h: 38, tc: 'sub' }));
  return [settingsPanelN(k, 8)];
}

// ── 약관 및 정책 · 오류 로그 (예전 웹 openPolicy / openErrLog 의 글 그대로) ──
var SETTINGS_POL_UPDATED = '2026-10-03';
var SETTINGS_POL = {
  polp: { title: "개인정보처리방침", paras: [
    { small: 0, parts: [["1. 수집하는 항목",1],["\n· 위치정보(GPS 좌표): 실시간 경로 안내·주변 정류장 검색\n· 이용자가 입력한 닉네임·게시글·댓글·채팅 내용\n· 노선별 실시간소통(노선 방) 이용 시: 노선명, 대화·지연·혼잡 제보 내용, 선택 입력한 역 이름, 그리고 도배·중복 제보를 막기 위한 ",0],["기기 식별 코드",1],["(IP 주소를 복원할 수 없게 일방향 암호화한 값의 앞 12자리. IP 주소 원본은 저장하지 않습니다)\n· 도착 오차 익명 기록(설정에서 끌 수 있음): 목적지 도착 시 예상 소요 분, 실제 소요 분, 환승 횟수, 노선명, 시간대(시), 평일 여부. ",0],["역 이름·좌표·기기 식별 코드는 포함하지 않으며",1],[" 개인을 식별할 수 없습니다\n· 출발지/도착지 등 이용자가 직접 설정한 값\n별도의 회원가입 절차가 없으며, 이름·연락처·주민등록번호 등은 수집하지 않습니다.",0]] },
    { small: 0, parts: [["2. 이용 목적",1],["\n대중교통 경로 안내, 실시간 도착정보 제공, 커뮤니티 서비스 운영, 경로 소요시간 예측 정확도 개선(익명 통계)에만 사용합니다.",0]] },
    { small: 0, parts: [["3. 보관 및 파기",1],["\n· 위치정보: 경로 안내 목적으로만 일시 사용하며 ",0],["서버에 저장하지 않습니다.",1],["\n· 닉네임·설정값: 이용자 기기(단말)에 저장되며 앱 삭제 시 함께 삭제됩니다.\n· 게시글·댓글·채팅: 작성일로부터 보관하며, 최신 글 기준 일정 수량 초과 시 오래된 순으로 자동 삭제됩니다.\n· 게시글은 등록 즉시 다른 모든 이용자에게 닉네임과 함께 공개됩니다. 부적절한 글은 신고할 수 있고(3명 이상 신고 시 자동 숨김), 내 글은 앱에서 직접 삭제할 수 있습니다. 본인 확인용 비밀키는 해시값으로, 도배 방지용 IP 는 원문 없이 해시값으로만 일시 기록합니다.\n· 노선 방 대화·제보와 기기 식별 코드(글 신고 시 신고한 기기의 코드 포함): 작성·신고 후 ",0],["14일이 지나면 자동 삭제",1],["됩니다. 화면에는 최근 12시간 글만 보입니다. 그 전에 삭제를 원하시면 문의처로 요청해 주세요.\n· 도착 오차 익명 기록: ",0],["1년이 지나면 자동 삭제",1],["됩니다. 이용자를 식별할 수 있는 값이 없어 개별 삭제 요청은 처리할 수 없으며, 설정 > 안내 정확도 향상에서 언제든 전송을 끌 수 있습니다.\n· 출퇴근 경로 미리 조회: 설정해 둔 출발·도착 좌표로 경로를 미리 불러올 뿐이며, 그 좌표를 따로 저장하거나 계정과 연결하지 않습니다.",0]] },
    { small: 0, parts: [["4. 제3자 제공 및 처리위탁",1],["\n이용자의 개인정보를 제3자에게 판매·제공하지 않습니다. 다만 서비스 제공을 위해 아래 외부 API를 호출하며, 이 과정에서 좌표·검색어 등 필요한 최소한의 정보가 전달됩니다.\n· 국토교통부 TAGO(버스 정보) · 서울특별시 열린데이터광장(지하철 실시간)\n· 카카오(장소·길찾기) · 네이버(장소 검색)\n· Google Gemini(안내 문구 생성) · Cloudflare(서버 인프라)",0]] },
    { small: 0, parts: [["5. 이용자의 권리",1],["\n기기 설정에서 위치 권한을 언제든지 철회할 수 있습니다. 권한을 끄면 실시간 안내 기능은 제한되지만 나머지 기능은 그대로 이용할 수 있습니다. 작성한 글·댓글은 직접 삭제할 수 있습니다.",0]] },
    { small: 0, parts: [["6. 아동의 개인정보",1],["\n만 14세 미만 아동을 대상으로 하지 않으며, 해당 정보를 고의로 수집하지 않습니다.",0]] },
    { small: 0, parts: [["7. 문의",1],["\nphg0643@gmail.com",0]] }
  ] },
  poll: { title: "위치기반서비스 이용약관", paras: [
    { small: 0, parts: [["제1조 (목적)",1],["\n본 약관은 이용자가 본 앱의 위치기반서비스를 이용함에 있어 권리·의무 및 책임사항을 규정합니다.",0]] },
    { small: 0, parts: [["제2조 (서비스 내용)",1],["\n· 현재 위치 기준 경로 탐색 및 실시간 이동 안내\n· 주변 지하철역·버스정류장 검색 및 도착정보 제공\n· 도착역 주변 장소 추천",0]] },
    { small: 0, parts: [["제3조 (위치정보의 이용 및 보유)",1],["\n위치정보는 서비스 제공 목적으로만 이용하며 ",0],["서버에 저장하거나 제3자에게 제공하지 않습니다.",1],[" 경로 안내 종료 시 해당 정보는 이용되지 않습니다.",0]] },
    { small: 0, parts: [["제4조 (백그라운드 위치 이용)",1],["\n이용자가 경로 안내를 시작한 경우에 한해, 앱이 화면에 없을 때도 하차역 알림 등을 위해 위치를 확인할 수 있습니다. 경로 안내를 종료하면 즉시 중단됩니다.",0]] },
    { small: 0, parts: [["제5조 (동의 철회)",1],["\n기기 설정 > 앱 권한에서 언제든지 위치 권한을 철회할 수 있습니다.",0]] },
    { small: 0, parts: [["제6조 (면책)",1],["\n실시간 정보는 공공기관 및 외부 API가 제공하는 데이터에 기반하며, 통신 상태·운행 사정 등에 따라 실제와 다를 수 있습니다. 이로 인한 손해에 대해 책임을 지지 않습니다.",0]] },
    { small: 0, parts: [["제7조 (문의)",1],["\nphg0643@gmail.com",0]] }
  ] },
  polo: { title: "데이터 출처 및 고지", paras: [
    { small: 0, parts: [["제휴 및 광고 고지",1],["\n쇼핑 탭의 상품 링크는 ",0],["쿠팡 파트너스 활동",1],["의 일환으로, 이에 따른 ",0],["일정액의 수수료를 제공받습니다.",1],[" 구매자에게 추가 비용은 발생하지 않습니다.",0]] },
    { small: 0, parts: [["공공데이터 출처 표시",1],["\n본 서비스는 아래 공공데이터를 이용합니다. 해당 저작물은 ",0],["공공누리 제1유형(출처표시)",1],[" 조건에 따라 이용할 수 있습니다.",0]] },
    { small: 0, parts: [["· ",0],["국토교통부",1],[" — 「국가대중교통정보센터(TAGO) 버스정류소정보·버스도착정보」\n· ",0],["서울특별시",1],[" — 「서울특별시 버스도착정보조회 서비스」, 「서울특별시 정류소정보조회 서비스」\n· ",0],["서울특별시",1],[" — 「지하철 실시간 도착정보·열차위치정보」(서울 열린데이터광장)\n· ",0],["서울교통공사",1],[" — 「서울 도시철도 환승정보」, 「빠른하차정보」(환승·하차 호차/문 위치), 「지하철 알림정보」(운행 공지)\n· ",0],["소상공인시장진흥공단",1],[" — 「상가(상권)정보」\n· ",0],["기상청",1],[" 단기예보 · Open-Meteo (날씨)\n· 카카오 (장소 검색·길찾기) · 네이버 (지역 검색)",0]] },
    { small: 1, parts: [["위 공공저작물은 공공데이터포털(data.go.kr)에서 제공받았으며, 출처 표시 외의 별도 이용 제한은 없습니다. 자세한 조건은 공공누리 제1유형 안내(kogl.or.kr)를 참고하세요.",0]] },
    { small: 0, parts: [["안내",1],["\n시각표·혼잡도 등 일부 정보는 공개 데이터를 가공한 ",0],["추정치",1],["이며 실제 운행과 다를 수 있습니다. 커뮤니티 및 실시간 대화의 일부 내용은 AI가 생성한 것입니다.",0]] },
    { small: 0, parts: [["문의",1],["\nphg0643@gmail.com",0]] }
  ] }
};
function settingsPagePol(p) {
  var d = SETTINGS_POL[p], k = [settingsTitleN(d.title, 10)];
  d.paras.forEach(function (q) {
    var b = settingsBoldN(q.parts), n = { t: 'text', s: b.s, size: q.small ? 11.5 : 12.5, color: q.small ? 'sub' : 'text', lh: 1.75, pad: [0, 0, 0, 10] };
    if (b.hl.length) n.hl = b.hl;
    k.push(n);
  });
  k.push(settingsSmallN('시행일 · 최종 개정일: ' + SETTINGS_POL_UPDATED, 8, 0));
  return [settingsPanelN(k, 8)];
}
// 오류 로그: 앱이 모아 둔 기록(pf.errs 오래된 것부터)을 최신이 위로. 복사/지우기는 앱이 한다(erl.copy · erl.clear).
function settingsPageErl(f) {
  var n = f.errs.length, k = [settingsTitleN('오류 로그' + (n ? ' ' + n + '건' : ''), 4), settingsDescN('앱이 멈추거나 문제가 생겼을 때의 기록이에요. 캡처하거나 복사해서 보내 주세요.', 8)];
  if (n) k.push(settingsRowN([settingsBtnN('복사', 'erl.copy', { size: 12, h: 38 }), settingsBtnN('지우기', 'erl.clear', { size: 12, h: 38, tc: '#ff453a' })], 6));
  if (!n) k.push({ t: 'text', s: '기록된 오류가 없습니다.', size: 13, color: 'sub', lh: 1.6, pad: [0, 18, 0, 18], align: 'center' });
  f.errs.slice().reverse().forEach(function (e) {
    k.push({ t: 'text', s: e.t + (e.n > 1 ? ' · ' + e.n + '회' : ''), size: 11, color: 'sub', lh: 1.4, pad: [0, 10, 0, 1] });
    k.push({ t: 'text', s: e.m, size: 12.5, bold: true, color: 'orange', lh: 1.45, pad: [0, 0, 0, 1] });
    if (e.f) k.push({ t: 'text', s: e.f, size: 11, color: 'sub', lh: 1.4, pad: [0, 0, 0, 1] });
    if (e.s) k.push({ t: 'text', s: e.s, size: 10.5, color: 'sub', lh: 1.4, pad: [0, 2, 0, 0] });
  });
  return [settingsPanelN(k, 8)];
}

// 위치 정보 이용 안내(백그라운드 위치 수집 동의 고지 — 예전 웹 _showLocDisclosure 의 글 그대로). 처음 위치를 쓰기 전에 앱이 띄운다.
function settingsPageLocd() {
  var a = settingsBoldN([['길동무', 1], ['는 화면이 꺼져 있거나 다른 앱을 사용하는 중에도, 앱이 ', 0], ['종료되었거나 사용 중이 아닐 때도', 1], [' 내릴 정거장을 정확히 안내하기 위해 ', 0], ['백그라운드 위치 데이터를 수집', 1], ['합니다. 수집한 위치는 ', 0], ['하차역·환승역 도착 알림', 1], ['과 ', 0], ['실시간 경로 안내', 1], ['에 사용됩니다.', 0]]);
  var b = settingsBoldN([['· 위치 정보는 경로 안내 목적으로만 이용하며, 경로 계산에 필요한 출발 위치가 경로 서버로 전송되지만 ', 0], ['저장하지 않습니다.', 1], ['\n· 백그라운드 위치 이용은 ', 0], ['경로 안내를 시작한 경우에만', 1], [' 작동하고, 안내를 종료하면 즉시 중단됩니다.\n· 기기 설정에서 언제든지 위치 권한을 철회할 수 있습니다.', 0]]);
  var ta = { t: 'text', s: a.s, size: 14, color: 'text', lh: 1.75, pad: [0, 0, 0, 14] }; if (a.hl.length) ta.hl = a.hl;
  var tb = { t: 'text', s: b.s, size: 12.5, color: 'sub', lh: 1.7, pad: [0, 0, 0, 18] }; if (b.hl.length) tb.hl = b.hl;
  return [settingsPanelN([settingsTitleN('위치 정보 이용 안내', 14), ta, tb,
    settingsRowN([settingsBtnN('거부', 'locd.no', { h: 46 }), settingsBtnN('동의', 'locd.ok', { gold: true, h: 46 })], 10),
    settingsNavN('개인정보처리방침 보기', '', { a: 'call', v: 'pol.privacy' }, true)], 24)];
}
// ── 처음 설치 때 기기 설정 안내(웹 _batAsk · _samAsk · _ovlAsk 의 글 그대로) ── 앱이 위치 안내 다음부터 한 가지씩 차례로 띄운다. 눌림은 ask.no(나중에) · ask.ok(설정하기) 둘뿐.
function settingsAskPanelN(title, bodyParts, boxParts, subParts) {
  var a = settingsBoldN(bodyParts), k = [settingsTitleN(title, 14)];
  var ta = { t: 'text', s: a.s, size: 14, color: 'text', lh: 1.75, pad: [0, 0, 0, 14] }; if (a.hl.length) ta.hl = a.hl; k.push(ta);
  if (boxParts) { var x = settingsBoldN(boxParts); k.push({ t: 'box', s: x.s, hl: x.hl, size: 12.5, lh: 1.75, color: 'text', fill: 'bg', line: 'border', r: 10, ip: [12, 10, 12, 10], pad: [0, 0, 0, 12] }); }
  var b = settingsBoldN(subParts), tb = { t: 'text', s: b.s, size: 12.5, color: 'sub', lh: 1.7, pad: [0, 0, 0, 18] }; if (b.hl.length) tb.hl = b.hl; k.push(tb);
  k.push(settingsRowN([settingsBtnN('나중에', 'ask.no', { h: 46 }), settingsBtnN('설정하기', 'ask.ok', { gold: true, h: 46 })], 0));
  return [settingsPanelN(k, 24)];
}
function settingsPageAskBat(f) {
  if (f.sm) return settingsAskPanelN('갤럭시에서 화면을 꺼도 끊기지 않게',
    [['지하철·버스를 타는 동안 화면이 꺼져 있어도 ', 0], ['내릴 정거장 알림', 1], ['과 ', 0], ['오버레이', 1], ['가 계속 움직이려면, ', 0], ['길동무를 배터리 최적화와 자동 절전에서 제외', 1], ['해 주셔야 해요. 갤럭시는 며칠 안 쓴 앱을 자동으로 절전시켜 이동 중에 멈출 수 있어요.', 0]],
    [['[설정하기] 한 번이면 이어서 안내해요\n① 열리는 목록에서 오른쪽 위 ', 0], ['+', 1], [' → ', 0], ['길동무', 1], [' 체크(안 보이면 아래 검색) → ', 0], ['추가', 1], ['\n② 돌아오면 나오는 기기 창에서 ', 0], ['허용', 1]],
    [['· 화면 모양은 기기·One UI 버전에 따라 조금 달라요.\n· 이동 중에 최근 앱 화면에서 ', 0], ['모두 닫기', 1], ['를 누르면 안내가 멈춰요.', 0]]);
  return settingsAskPanelN('화면을 꺼도 끊기지 않게',
    [['지하철·버스를 타는 동안 화면이 꺼져 있어도 ', 0], ['내릴 정거장 알림', 1], ['과 ', 0], ['오버레이', 1], ['가 계속 움직이려면, 기기의 ', 0], ['배터리 최적화에서 길동무를 제외', 1], ['해 주셔야 해요. 제외하지 않으면 일부 기기(삼성·샤오미 등)가 이동 중에 앱을 멈출 수 있어요.', 0]],
    null,
    [['· [설정하기]를 누르면 기기의 안내 창이 열려요. 거기서 ', 0], ['허용', 1], ['을 눌러 주세요.\n· 경로 안내 중에만 위치를 쓰고, 설정은 기기 설정에서 언제든 되돌릴 수 있어요.', 0]]);
}
function settingsPageAskSam() {
  return settingsAskPanelN('갤럭시 절전에서 제외해 주세요',
    [['갤럭시는 며칠 안 쓴 앱을 자동으로 ', 0], ['절전 상태', 1], ['로 만들어, 화면이 꺼진 동안의 ', 0], ['하차 알림', 1], ['이 멈출 수 있어요. 길동무를 ', 0], ['자동으로 절전하지 않는 앱', 1], ['에 넣어 주세요.', 0]],
    [['① [설정하기]를 누르면 목록 화면이 열려요\n② 오른쪽 위 ', 0], ['+', 1], ['(추가)를 누르고\n③ ', 0], ['길동무', 1], ['를 체크(안 보이면 아래 ', 0], ['검색', 1], ['에 입력)한 뒤 ', 0], ['추가', 1], ['를 눌러 주세요', 0]],
    [['· 화면 모양은 기기·One UI 버전에 따라 조금 달라요.\n· 이동 중에 최근 앱 화면에서 ', 0], ['모두 닫기', 1], ['를 누르면 안내가 멈춰요.', 0]]);
}
function settingsPageAskOvl() {
  return settingsAskPanelN('다른 앱을 보면서도 내 위치 확인',
    [['지하철·버스에서 다른 앱을 쓰는 동안에도 ', 0], ['현재 역과 남은 시간', 1], ['을 화면 위쪽에 작은 막대로 띄워 드려요. 막대를 누르면 길동무로 돌아와요.', 0]],
    [['[설정하기]를 누르면 기기 설정 화면이 열려요\n① ', 0], ['길동무', 1], ['를 찾아 눌러서\n② ', 0], ['다른 앱 위에 표시', 1], ['를 ', 0], ['켬', 1], ['으로 바꾸고 돌아오세요', 0]],
    [['· 안내 정보만 보여주고 광고는 넣지 않아요.\n· 나중에 설정 탭의 \'다른 앱 위에 표시\'에서도 켜고 끌 수 있어요.', 0]]);
}
function settingsPageScreen(inp, factsIn) {
  var p = String(inp.p || '');
  if (!(Number(inp.cap) >= SETTINGS_PAGE_CAP)) return { ok: false, error: 'cap' };
  if (!Object.prototype.hasOwnProperty.call(SETTINGS_PAGES, p)) return { ok: false, error: 'page' };
  var pf = settingsPageFacts(factsIn && typeof factsIn === 'object' ? factsIn.pf : null);
  pf.bus = (factsIn && factsIn.pf && Array.isArray(factsIn.pf.bus)) ? factsIn.pf.bus.slice(0, 12).map(function (x) { return settingsStr(x, 60).trim(); }) : [];
  var info = { page: p, sub: '' }, kids;
  if (p === 'cm' && pf.sub === 'tp') { info.sub = 'tp'; kids = settingsPageTp(pf); }
  else if (p === 'cm' && pf.sub === 'pick') { info.sub = 'pick'; kids = settingsPagePick(pf, info); }
  else if (p.indexOf('pol') === 0) kids = settingsPagePol(p);
  else kids = ({ sam: settingsPageSam, ovl: settingsPageOvl, dev: settingsPageDev, arr: settingsPageArr, gw: settingsPageGw, cm: settingsPageCm, erl: settingsPageErl, locd: settingsPageLocd, askbat: settingsPageAskBat, asksam: settingsPageAskSam, askovl: settingsPageAskOvl })[p](pf);
  var body = (p === 'locd' || SETTINGS_ASK[p] ? [] : [settingsBackN(info.sub ? SETTINGS_PAGES.cm : '')]).concat(kids, [{ t: 'spacer', h: 28 }]);
  var out = { ok: true, v: 1, screen: 'settings', cover: 'tab', head: [], body: body, info: info };
  out.rev = 's' + SETTINGS_SCREEN_V + 'p:' + settingsHash(JSON.stringify(body));
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { settingsScreen: settingsScreen, settingsPageFacts: settingsPageFacts, settingsStnFind: settingsStnFind, settingsOvlStat: settingsOvlStat, settingsArrLines: settingsArrLines, settingsFmtTime: settingsFmtTime, settingsEveHint: settingsEveHint, SETTINGS_PAGES: SETTINGS_PAGES, settingsFacts: settingsFacts, settingsHash: settingsHash, SETTINGS_NOTIF: SETTINGS_NOTIF };
