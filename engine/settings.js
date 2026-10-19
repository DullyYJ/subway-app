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
//          th: 'dark'|'pastel' · sam: 갤럭시(1|0) · samw: 앱 배터리 '제한됨'(1|0) · errn: 오류 로그 개수 · cm: 출퇴근 알림(1|0|없음) · ovl: 오버레이(1|0|없음)
//          feat: { nm|sn|htl|scr|scrs|scrf|scrn|scrb|scrc|scrt|scrh|sbh|cnd|rtf|sto|ra|npol|arw|cmw|rtx : { h: 이 기능이 있나(1|0), on: 스위치(1|0), f: 문제로 웹으로 돌아갔나(1|0), w: 문제 사유, b: 저장본 사용 중(1|0) } }
// 출력  { ok, v:1, screen:'settings', rev, cover:'tab', head:[], body:[노드…] }  ← 노드 종류는 native/ScreenCore.java 와 같다
//        panel{kids} · text · box · toggle{key} · navrow{act} · select{act:{a:'sel'}} · field{key} · button · spacer
//        act = {a:'set',key} (스위치 — 앱이 먼저 뒤집고 알린다) | {a:'call',v} (앱 안 함수 호출: saveId·clearId·pol.*·errlog) | {a:'web',v} (웹 카드 열기) | {a:'sel',v} (고르기)
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var SETTINGS_SCREEN_V = 1;

// 스위치 키 → 알림 종류 이름
var SETTINGS_NOTIF = [
  { key: 'arrive', title: '도착 임박 알림', desc: '목적지 2정거장 전 · 1정거장 전 (알림·진동·오버레이 테두리)' },
  { key: 'transfer', title: '환승 알림', desc: '환승역 1정거장 전 (알림·진동·오버레이 테두리)' },
  { key: 'arrive_reco', title: '하차 전 추천', desc: '도착 5분 전 카페·야식 추천 (오버레이 하단·앱 안 팝업)' }
];
// 실험 기능 카드 — 위에서부터 이 순서로 보인다
var SETTINGS_FEATS = [
  { k: 'nm', title: '부드러운 노선도', desc: '노선도를 기기가 직접 그려서 확대·축소·이동이 부드럽고 글자가 깨지지 않아요. 문제가 있으면 꺼서 예전 방식으로 볼 수 있어요.',
    off: '꺼짐 — 예전 웹 노선도를 쓰는 중이에요.', bad: '네이티브 지도에 문제가 있어 웹 노선도로 대신 보여주고 있어요', ok: '켜짐 — 노선도를 기기가 직접 그려 확대·축소가 부드러워요.' },
  { k: 'sn', title: '부드러운 캐릭터 장면', desc: '캐릭터 장면을 기기가 직접 그려서 더 부드럽고(최대 120Hz), 캐릭터를 꾹 눌러 옮기고 놓을 때 진동이 와요. 문제가 있으면 꺼서 예전 방식으로 볼 수 있어요.',
    off: '꺼짐 — 예전 방식(웹 화면)으로 그려요.', bad: '네이티브 장면에 문제가 있어 웹 화면으로 대신 보여주고 있어요', ok: '켜짐 — 기기가 직접 그려 더 부드럽고, 캐릭터를 놓을 때 진동이 와요.' },
  { k: 'htl', title: '네이티브 경로 화면', desc: '홈 경로 화면의 가로 타임라인과 현재 위치 점을 웹이 아니라 기기가 직접 그려요(앱 전체를 네이티브로 옮기는 첫 단계). 문제가 있으면 자동으로 예전 방식으로 돌아가요.',
    off: '꺼짐 — 예전 방식(웹 화면)으로 그려요.', bad: '네이티브 경로 화면에 문제가 있어 웹 화면으로 대신 보여주고 있어요', ok: '켜짐 — 경로 카드 머리줄·타임라인·현재 위치 점을 기기가 직접 그려요(실험 중).' },
  { k: 'scr', title: '네이티브 쇼핑 화면', desc: '쇼핑 탭의 안내 문구·쿠팡 검색줄·카테고리·상품 목록을 엔진이 화면 구성까지 정해 내려주고, 기기가 직접 그려요(부드러운 스크롤). 마지막 화면은 저장해 두어 바로 뜨고, 문제가 생기면 예전 웹 화면으로 돌아가요.',
    off: '꺼짐 — 예전 방식(웹 쇼핑 화면)으로 그려요.', bad: '네이티브 쇼핑 화면에 문제가 있어 웹 화면으로 대신 보여주고 있어요', stale: '엔진이 준 화면이 올바르지 않아 저장해 둔 화면을 쓰고 있어요', ok: '켜짐 — 쇼핑 탭의 안내·검색줄·카테고리·상품 목록을 엔진이 정한 대로 기기가 직접 그려요(실험 중).' },
  { k: 'scrs', title: '네이티브 설정 화면', desc: '지금 보고 있는 이 설정 화면을 엔진이 화면 구성까지 정해 내려주고, 기기가 직접 그려요. 끄면 예전 웹 설정 화면으로 돌아가요.',
    off: '꺼짐 — 예전 방식(웹 설정 화면)으로 그려요.', bad: '네이티브 설정 화면에 문제가 있어 웹 화면으로 대신 보여주고 있어요', stale: '엔진이 준 화면이 올바르지 않아 저장해 둔 화면을 쓰고 있어요', ok: '켜짐 — 설정 화면을 엔진이 정한 대로 기기가 직접 그려요(실험 중).' },
  { k: 'scrf', title: '네이티브 맛집 화면', desc: '맛집 탭의 머리줄·카테고리 칩·맛집 목록을 엔진이 분류·거르기·문구까지 정해 내려주고, 기기가 직접 그려요(부드러운 스크롤). 가게를 누르면 길찾기 지도가 열려요. 문제가 생기면 예전 웹 화면으로 돌아가요.',
    off: '꺼짐 — 예전 방식(웹 맛집 화면)으로 그려요.', bad: '네이티브 맛집 화면에 문제가 있어 웹 화면으로 대신 보여주고 있어요', stale: '엔진이 준 화면이 올바르지 않아 저장해 둔 화면을 쓰고 있어요', ok: '켜짐 — 맛집 탭의 머리줄·칩·목록을 엔진이 정한 대로 기기가 직접 그려요(실험 중).' },
  { k: 'scrn', title: '네이티브 뉴스 화면', desc: '커뮤니티 > 뉴스의 카테고리 칩·기사 목록을 엔진이 분류·거르기·시간 문구까지 정해 내려주고, 기기가 직접 그려요(부드러운 스크롤). 기사를 누르면 요약과 원문 보기가 열려요. 문제가 생기면 예전 웹 화면으로 돌아가요.',
    off: '꺼짐 — 예전 방식(웹 뉴스 화면)으로 그려요.', bad: '네이티브 뉴스 화면에 문제가 있어 웹 화면으로 대신 보여주고 있어요', stale: '엔진이 준 화면이 올바르지 않아 저장해 둔 화면을 쓰고 있어요', ok: '켜짐 — 뉴스 탭의 칩·기사 목록을 엔진이 정한 대로 기기가 직접 그려요(실험 중).' },
  { k: 'scrb', title: '네이티브 게시판 화면', desc: '커뮤니티 > 게시판의 글 목록·펼침·댓글·반응을 엔진이 거르기·정렬·시간 문구까지 정해 내려주고, 기기가 직접 그려요(부드러운 스크롤). 글을 누르면 그 자리에서 펼쳐져요. 문제가 생기면 예전 웹 화면으로 돌아가요.',
    off: '꺼짐 — 예전 방식(웹 게시판 화면)으로 그려요.', bad: '네이티브 게시판 화면에 문제가 있어 웹 화면으로 대신 보여주고 있어요', stale: '엔진이 준 화면이 올바르지 않아 저장해 둔 화면을 쓰고 있어요', ok: '켜짐 — 게시판의 글 목록·펼침·댓글·반응을 엔진이 정한 대로 기기가 직접 그려요(실험 중).' },
  { k: 'scrc', title: '네이티브 실시간소통 화면', desc: '커뮤니티 > 실시간소통의 노선 칩·공지 배너·대화 말풍선·입력줄을 엔진이 정해 내려주고, 기기가 직접 그려요(부드러운 스크롤). 문제가 생기면 예전 웹 화면으로 돌아가요.',
    off: '꺼짐 — 예전 방식(웹 실시간소통 화면)으로 그려요.', bad: '네이티브 실시간소통 화면에 문제가 있어 웹 화면으로 대신 보여주고 있어요', stale: '엔진이 준 화면이 올바르지 않아 저장해 둔 화면을 쓰고 있어요', ok: '켜짐 — 실시간소통의 노선 칩·공지 배너·대화 말풍선·입력줄을 엔진이 정한 대로 기기가 직접 그려요(실험 중).' },
  { k: 'scrt', title: '네이티브 탭 막대', desc: '화면 맨 아래 탭 막대(커뮤니티·노선도·홈·쇼핑센터·맛집)를 엔진이 정해 내려주고, 기기가 직접 그려요. 문제가 생기면 예전 웹 탭 막대로 돌아가요.',
    off: '꺼짐 — 예전 방식(웹 탭 막대)으로 그려요.', bad: '네이티브 탭 막대에 문제가 있어 웹 화면으로 대신 보여주고 있어요', stale: '엔진이 준 화면이 올바르지 않아 저장해 둔 화면을 쓰고 있어요', ok: '켜짐 — 화면 맨 아래 탭 막대(커뮤니티·노선도·홈·쇼핑센터·맛집)를 엔진이 정한 대로 기기가 직접 그려요(실험 중).' },
  { k: 'scrh', title: '네이티브 경로 입력', desc: '홈 탭의 출발·도착 입력칸, 자동완성 목록, 위치 감지·바꾸기·경로 탐색 단추, 기준시각 줄을 엔진이 정해 내려주고, 기기가 직접 그려요. 글자를 쓰는 동안 자동완성이 바로 따라와요. 문제가 생기면 예전 웹 카드로 돌아가요.',
    off: '꺼짐 — 예전 방식(웹 경로 입력 카드)으로 그려요.', bad: '네이티브 경로 입력에 문제가 있어 웹 카드로 대신 보여주고 있어요', stale: '엔진이 준 화면이 올바르지 않아 저장해 둔 화면을 쓰고 있어요', ok: '켜짐 — 홈 탭의 경로 입력 카드를 엔진이 정한 대로 기기가 직접 그려요(실험 중).' },
  { k: 'sbh', title: '가려진 동안 엔진이 이어받기', desc: '앱을 홈 화면이나 다른 앱으로 보낸 동안에도 엔진이 안내를 바로 이어받아 영점·도착 시각·하차 알림을 계속 맞춰요. 앱을 다시 열면 그 결과를 이어서 써요. 문제가 생기면 예전 방식(가려진 동안 웹을 깨워 계산)으로 돌아가요.',
    off: '꺼짐 — 예전 방식(가려진 동안 웹을 깨워 계산)으로 이어가요.', bad: '엔진 이어받기에 문제가 있어 예전 방식으로 대신 이어가고 있어요', ok: '켜짐 — 앱이 가려지면 엔진이 안내를 바로 이어받고, 다시 열면 그 결과를 이어서 써요(실험 중).' },
  { k: 'cnd', title: '후보 검색을 앱과 엔진이 하기', desc: '홈 탭에서 출발·도착을 입력할 때 나오는 후보 중 지하철역은 엔진이 직접 찾고, 버스정류장과 장소는 앱 본체가 직접 찾아요. 웹이 맡던 검색을 줄여 입력이 더 부드러워져요. 문제가 생기면 예전 방식으로 돌아가요.',
    off: '꺼짐 — 예전 방식(웹이 역·정류장·장소를 찾아요)으로 이어가요.', bad: '앱·엔진 검색에 문제가 있어 예전 방식으로 대신 이어가고 있어요', ok: '켜짐 — 지하철역은 엔진이, 버스정류장·장소는 앱 본체가 찾아요(실험 중).' },
  { k: 'rtf', title: '경로 요청을 앱 본체가 하기', desc: '경로를 찾을 때 경로 서버에 묻는 일과 받은 결과 보관을 웹이 아니라 앱 본체가 해요. 어떤 응답을 그릴지, 언제 다시 물을지는 엔진이 정해 주고 앱은 따라요. 문제가 생기면 예전 방식으로 돌아가요.',
    off: '꺼짐 — 예전 방식(웹이 경로 서버에 직접 요청해요)으로 이어가요.', bad: '앱 본체 요청에 문제가 있어 예전 방식으로 대신 이어가고 있어요', ok: '켜짐 — 경로 서버 요청과 가장 최근 결과 보관을 앱 본체가 해요(실험 중).' },
  { k: 'sto', title: '설정·저장값을 앱 본체에도 보관하기', desc: '설정 스위치와 즐겨찾기 같은 저장값을 웹 화면 저장소에만 두지 않고 앱 본체에도 한 벌 보관해요. 웹 화면 저장소가 지워져도 설정이 돌아오고, 앱 본체의 다른 기능도 이 값을 읽을 수 있어요. 어떤 값을 보관할지는 엔진이 정해요. 문제가 생기면 예전 방식(웹 저장소만)으로 돌아가요.',
    off: '꺼짐 — 예전 방식(웹 화면 저장소에만)으로 보관해요.', bad: '앱 본체 보관에 문제가 있어 예전 방식으로 대신 이어가고 있어요', ok: '켜짐 — 설정과 저장값을 앱 본체에도 보관해요(실험 중).' },
  { k: 'ra', title: '하차·환승 알림 시점을 엔진이 정하기', desc: '앱을 보고 있는 동안의 하차·환승 알림(환승 2정거장 전·환승 준비·목적지 2정거장 전·곧 하차·목적지 도착)이 언제 울릴지, 무슨 문구와 진동으로 울릴지, 어느 역(환승 하차역·최종 하차)에서 울릴지를 웹이 아니라 엔진이 정해요. 앱을 가렸을 때 쓰는 규칙과 같아요. 엔진에 물을 수 없으면 예전 방식으로 바로 정해요.',
    off: '꺼짐 — 예전 방식(웹이 알림 시점을 정해요)으로 이어가요.', bad: '엔진에 물을 수 없어 예전 방식으로 대신 이어가고 있어요', ok: '켜짐 — 하차·환승 알림이 울릴 때를 엔진이 정해요(실험 중).' },
  { k: 'npol', title: '알림 종류 허용 여부를 엔진이 정하기', desc: '하차·환승 알림을 상단 알림으로 보낼지, 진동을 줄지, 오버레이 하단 추천 같은 기능을 켤지를 웹이 아니라 엔진이 정해요. 설정에서 끈 알림 종류와 출퇴근 브리핑 설정은 그대로 따라요. 엔진에 물을 수 없으면 예전 방식으로 바로 정해요.',
    off: '꺼짐 — 예전 방식(웹이 알림 허용 여부를 정해요)으로 이어가요.', bad: '엔진에 물을 수 없어 예전 방식으로 대신 이어가고 있어요', ok: '켜짐 — 알림·진동 허용 여부를 엔진이 정해요(실험 중).' },
  { k: 'arw', title: '하차 전 추천 시점을 엔진이 정하기', desc: '내리기 7분 전부터 1분 전 사이에, 카페·식사·쇼핑 추천을 지금 보낼지와 도착 시간대(아침·점심·저녁·야식·쇼핑)를 웹이 아니라 엔진이 정해요. 같은 여정에 한 번만 보내는 규칙도 엔진이 지켜요. 엔진에 물을 수 없으면 예전 방식으로 바로 정해요.',
    off: '꺼짐 — 예전 방식(웹이 추천 시점을 정해요)으로 이어가요.', bad: '엔진에 물을 수 없어 예전 방식으로 대신 이어가고 있어요', ok: '켜짐 — 하차 전 추천을 언제 보낼지 엔진이 정해요(실험 중).' },
  { k: 'cmw', title: '출퇴근 브리핑 시각을 엔진이 정하기', desc: '출퇴근 브리핑 알림을 지금 보낼지(설정한 시각·요일·같은 분에 한 번만)와, 앞으로 4주치 예약 알림을 몇 월 몇 일 몇 시에 걸지를 웹이 아니라 엔진이 정해요. 알림 내용(날씨·혼잡도)과 장소는 그대로 앱에서 만들고 엔진에 보내지 않아요. 엔진에 물을 수 없으면 예전 방식으로 바로 정해요.',
    off: '꺼짐 — 예전 방식(웹이 브리핑 시각을 정해요)으로 이어가요.', bad: '엔진에 물을 수 없어 예전 방식으로 대신 이어가고 있어요', ok: '켜짐 — 출퇴근 브리핑을 언제 울릴지 엔진이 정해요(실험 중).' },
  { k: 'rtx', title: '하차 전 추천 문구를 엔진이 만들기', desc: '내리기 7분 전 추천 알림의 본문(날씨·요일에 맞춘 한 줄, 메뉴와 가게 고르기, 줄 맞춤)과 작은 화면·오버레이 추천 줄의 문구를 웹이 아니라 엔진이 만들어요. 앱은 지금 날씨와 도착지(역·정류장) 좌표, 최근 추천한 곳만 엔진에 보내요. 쿠팡 상품 고르기와 도착지 근처 가게 목록 받기도 엔진이 해요. 엔진에 물을 수 없으면 예전 방식으로 바로 만들어요.',
    off: '꺼짐 — 예전 방식(웹이 추천 문구를 만들어요)으로 이어가요.', bad: '엔진에 물을 수 없어 예전 방식으로 대신 이어가고 있어요', ok: '켜짐 — 하차 전 추천 문구를 엔진이 만들어요(실험 중).' }
];

function settingsFlag(v, def) { return v == null ? def : (v === 1 || v === true || v === '1'); }
function settingsStr(v, n) { return typeof v === 'string' ? v.slice(0, n) : ''; }
function settingsFacts(f) {
  f = (f && typeof f === 'object') ? f : {};
  var np = (f.np && typeof f.np === 'object') ? f.np : {}, feat = (f.feat && typeof f.feat === 'object') ? f.feat : {};
  var o = {
    id: settingsStr(f.id, 12), np: {}, npd: settingsFlag(f.npd, false), rl: settingsFlag(f.rl, true), th: f.th === 'dark' ? 'dark' : 'pastel',
    sam: settingsFlag(f.sam, false), samw: settingsFlag(f.samw, false), errn: Math.max(0, Math.min(999, Math.floor(Number(f.errn) || 0))),
    cm: f.cm == null ? null : settingsFlag(f.cm, false), ovl: f.ovl == null ? null : settingsFlag(f.ovl, false), feat: {}
  };
  SETTINGS_NOTIF.forEach(function (n) { o.np[n.key] = settingsFlag(np[n.key], true); });          // 알림은 기본 켜짐(저장값이 0 일 때만 꺼짐)
  SETTINGS_FEATS.forEach(function (d) {
    var x = (feat[d.k] && typeof feat[d.k] === 'object') ? feat[d.k] : {};
    o.feat[d.k] = { h: settingsFlag(x.h, false), on: settingsFlag(x.on, false), f: settingsFlag(x.f, false), w: settingsStr(x.w, 140), b: settingsFlag(x.b, false) };
  });
  return o;
}
function settingsHash(s) {                       // djb2 — 같은 화면이면 같은 rev (앱이 '바뀌었나'만 본다)
  var h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function settingsStat(d, x) {
  if (!x.on) return d.off;
  if (x.f) return d.bad + (x.w ? ' (' + x.w + ')' : '') + '. 스위치를 껐다 켜면 다시 시도해요.';
  if (x.b && d.stale) return d.stale + (x.w ? ' (' + x.w + ')' : '') + '.';
  return d.ok;
}

// ── 노드 만들기(모양 한 곳) ──
function settingsTitleN(s, mb) { return { t: 'text', s: s, size: 15, bold: true, color: 'text', pad: [0, 0, 0, mb == null ? 4 : mb], lh: 1.3 }; }
function settingsDescN(s, mb, hl) { var n = { t: 'text', s: s, size: 12, color: 'sub', lh: 1.5, pad: [0, 0, 0, mb == null ? 12 : mb] }; if (hl) n.hl = hl; return n; }
function settingsPanelN(kids, mt) { return { t: 'panel', pad: [14, mt == null ? 12 : mt, 14, 0], ip: [16, 16, 16, 16], fill: 'card', line: 'border', r: 14, kids: kids }; }
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
  var f = settingsFacts(factsIn), body = [];

  // 1) 커뮤니티 아이디
  var idKids = [settingsTitleN('커뮤니티 아이디', 6)];
  var d1 = settingsBoldN([['아이디를 등록하면 게시글 작성과 실시간 채팅에 참여할 수 있어요.\n아이디 없이도 글과 채팅을 ', 0], ['구경', 1], ['하는 건 자유롭게 가능합니다.', 0]]);
  idKids.push(settingsDescN(d1.s, 14, d1.hl));
  if (f.id) {
    var cur = settingsBoldN([['현재 아이디  ', 0], [f.id, 1]]);
    idKids.push({ t: 'box', s: cur.s, hl: cur.hl, size: 14, lh: 1.4, color: 'gold', fill: '#1c1c1e', line: '', tc: 'gold', r: 10, ip: [13, 11, 13, 11], pad: [0, 0, 0, 12] });
  }
  idKids.push({ t: 'field', key: 'cid', hint: '아이디 입력 (2~12자, 한글/영문/숫자)', value: f.id, maxlen: 12, h: 44, size: 14, r: 9, pad: [0, 0, 0, 10] });
  idKids.push({ t: 'button', s: '아이디 저장', size: 14, h: 44, r: 10, bold: true, fill: 'gold', line: 'none', tc: '#121214', act: { a: 'call', v: 'saveId' } });
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
    sk.push(settingsNavN('자동 절전 제외 설정 열기', f.samw ? '제한됨' : '', { a: 'web', v: 'sam' }, true));
    body.push(settingsPanelN(sk));
  }

  // 4) 실험 기능(있는 것만)
  SETTINGS_FEATS.forEach(function (d) {
    var x = f.feat[d.k];
    if (!x.h) return;
    var on = x.on && !x.f;
    body.push(settingsPanelN([
      { t: 'toggle', key: 'f.' + d.k, title: d.title, on: on, big: true, size: 15, vp: 0, onc: 'gold', pad: [0, 0, 0, 6] },
      settingsDescN(d.desc, 8),
      settingsStatN(settingsStat(d, x))
    ]));
  });

  // 5) 안내 정확도
  body.push(settingsPanelN([
    settingsTitleN('안내 정확도 향상', 2),
    { t: 'toggle', key: 'rl', title: '도착 오차 익명 기록', sub: '목적지에 도착하면 예상 시간과 실제 시간의 차이만 익명으로 보내요. 역 이름·위치·기기 정보는 보내지 않아요.', on: f.rl, vp: 6, size: 13.5, ssize: 11, onc: '#30d158' }
  ]));

  // 6) 웹 카드로 이어지는 기능들(복잡한 입력·시험 도구는 기존 웹 카드를 그대로 연다)
  var wk = [settingsTitleN('기능 설정', 2), settingsDescN('시간·장소·시험처럼 입력이 많은 설정은 눌러서 열어요.', 4)];
  wk.push(settingsNavN('출퇴근 브리핑 알림', f.cm == null ? '' : (f.cm ? '켜짐' : '꺼짐'), { a: 'web', v: 'cm' }, true));
  wk.push(settingsNavN('캐릭터 시계 위젯', '', { a: 'web', v: 'gw' }, true));
  wk.push(settingsNavN('하차 5분 전 추천 시험', '', { a: 'web', v: 'arr' }, true));
  wk.push(settingsNavN('다른 앱 위에 표시', f.ovl == null ? '' : (f.ovl ? '켜짐' : '꺼짐'), { a: 'web', v: 'ovl' }, true));
  wk.push(settingsNavN('개발자 도구', '', { a: 'web', v: 'dev' }, true));
  body.push(settingsPanelN(wk));

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

  var out = { ok: true, v: 1, screen: 'settings', cover: 'tab', head: [], body: body };
  out.rev = 's' + SETTINGS_SCREEN_V + ':' + settingsHash(JSON.stringify(body));
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { settingsScreen: settingsScreen, settingsFacts: settingsFacts, settingsStat: settingsStat, settingsHash: settingsHash, SETTINGS_FEATS: SETTINGS_FEATS, SETTINGS_NOTIF: SETTINGS_NOTIF };
