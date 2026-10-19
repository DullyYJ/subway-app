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
//          feat: { nm|sn|htl|scr|scrs|scrf|scrn|scrb|scrc|scrt|scrq|scrw|scrh|scrr|sbh|cnd|rtf|sto|ra|npol|arw|cmw|rtx|e2 : { h: 이 기능이 있나(1|0), on: 스위치(1|0), f: 문제로 웹으로 돌아갔나(1|0), w: 문제 사유, b: 저장본 사용 중(1|0) } }
// 출력  { ok, v:1, screen:'settings', rev, cover:'tab', head:[], body:[노드…] }  ← 노드 종류는 native/ScreenCore.java 와 같다
//        panel{kids} · text · box · toggle{key} · navrow{act} · select{act:{a:'sel'}} · field{key} · button · spacer
//        act = {a:'set',key} (스위치 — 앱이 먼저 뒤집고 알린다) | {a:'call',v} (앱 안 함수 호출: saveId·clearId·pol.*·errlog) | {a:'web',v} (웹 카드 열기) | {a:'sel',v} (고르기)
//        ★ 2026-10-20 하위 화면(cap 8): settingsScreen({cap:8, p:'cm'|'gw'|'arr'|'ovl'|'dev'|'sam'}, facts{pf:…}) — 예전에 웹 카드 시트로 열던 6개를 같은 방식(엔진이 구성, 앱은 그리기)으로.
//          pf = 그 화면의 기기 사실(켜짐·값·고른 상태만; 문구·요일 계산·시각 글·퇴근 안내는 엔진). 행동은 call(v: pg.back · sam.open · cm.day.N …) 허용 목록만.
// 맨 아래 module.exports 는 시험(Node)용이고 Worker 에서는 함수 선언만 쓰인다.
'use strict';
var SETTINGS_SCREEN_V = 1;
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
  { k: 'scrq', title: '네이티브 커뮤니티 칩 줄', desc: '커뮤니티 맨 위 칩 줄(실시간소통·게시판·뉴스·설정)을 엔진이 정해 내려주고, 기기가 직접 그려요. 문제가 생기면 예전 웹 칩 줄로 돌아가요.',
    off: '꺼짐 — 예전 방식(웹 칩 줄)으로 그려요.', bad: '네이티브 칩 줄에 문제가 있어 웹 칩 줄로 대신 보여주고 있어요', stale: '엔진이 준 화면이 올바르지 않아 저장해 둔 화면을 쓰고 있어요', ok: '켜짐 — 커뮤니티 맨 위 칩 줄(실시간소통·게시판·뉴스·설정)을 엔진이 정한 대로 기기가 직접 그려요(실험 중).' },
  { k: 'scrw', title: '네이티브 글쓰기 시트', desc: '커뮤니티 \'제보 글쓰기\' 시트의 글·입력칸·단추를 엔진이 정해 내려주고, 기기가 직접 그려요. 문제가 생기면 예전 웹 시트로 돌아가요.',
    off: '꺼짐 — 예전 방식(웹 글쓰기 시트)으로 그려요.', bad: '네이티브 글쓰기 시트에 문제가 있어 웹 시트로 대신 보여주고 있어요', stale: '엔진이 준 화면이 올바르지 않아 저장해 둔 화면을 쓰고 있어요', ok: '켜짐 — 커뮤니티 \'제보 글쓰기\' 시트를 엔진이 정한 대로 기기가 직접 그려요(실험 중).' },
  { k: 'scrh', title: '네이티브 경로 입력', desc: '홈 탭의 출발·도착 입력칸, 자동완성 목록, 위치 감지·바꾸기·경로 탐색 단추, 기준시각 줄을 엔진이 정해 내려주고, 기기가 직접 그려요. 글자를 쓰는 동안 자동완성이 바로 따라와요. 문제가 생기면 예전 웹 카드로 돌아가요.',
    off: '꺼짐 — 예전 방식(웹 경로 입력 카드)으로 그려요.', bad: '네이티브 경로 입력에 문제가 있어 웹 카드로 대신 보여주고 있어요', stale: '엔진이 준 화면이 올바르지 않아 저장해 둔 화면을 쓰고 있어요', ok: '켜짐 — 홈 탭의 경로 입력 카드를 엔진이 정한 대로 기기가 직접 그려요(실험 중).' },
  { k: 'scrr', title: '네이티브 경로 결과 윗부분', desc: '홈 경로 결과 카드의 머리줄(소요 시간·구간·즐겨찾기·닫기), 승차·대기·도보 요약, 환승 안내, 경로 탭(최단시간·최소환승·지하철·버스), 공식 공지·지연 제보 줄을 엔진이 정해 내려주고, 기기가 직접 그려요. 문제가 생기면 예전 웹 카드로 돌아가요.',
    off: '꺼짐 — 예전 방식(웹 결과 카드)으로 그려요.', bad: '네이티브 결과 카드 윗부분에 문제가 있어 웹 카드로 대신 보여주고 있어요', stale: '엔진이 준 화면이 올바르지 않아 저장해 둔 화면을 쓰고 있어요', ok: '켜짐 — 결과 카드의 머리줄·요약·환승 안내·경로 탭·공지 줄을 엔진이 정한 대로 기기가 직접 그려요(실험 중).' },
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
    off: '꺼짐 — 예전 방식(웹이 추천 문구를 만들어요)으로 이어가요.', bad: '엔진에 물을 수 없어 예전 방식으로 대신 이어가고 있어요', ok: '켜짐 — 하차 전 추천 문구를 엔진이 만들어요(실험 중).' },
  { k: 'e2', title: '남은 계산을 엔진이 하기', desc: '홈 AI 승무원 브리핑 문장(소요시간·환승 안내·시각·혼잡·날씨 준비물)과 경로 결과 정리(겹친 경로 합치기·왜 이 경로인지·승차/대기/도보 나눔)처럼 앱에 남아 있던 계산을 웹이 아니라 엔진이 해요. 노선 색 배지와 굵은 글씨는 앱이 그려요. 엔진에 물을 수 없으면 예전 방식으로 바로 만들어요.',
    off: '꺼짐 — 예전 방식(웹이 계산해요)으로 이어가요.', bad: '엔진에 물을 수 없어 예전 방식으로 대신 이어가고 있어요', ok: '켜짐 — 남은 계산을 엔진이 해요(실험 중).' }
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
  if (inp.p) return settingsPageScreen(inp, factsIn);
  var f = settingsFacts(factsIn), body = [];
  var pg = Number(inp.cap) >= SETTINGS_PAGE_CAP;                       // 새 앱이면 눌렀을 때 네이티브 하위 화면으로(act call pg.<이름>), 옛 앱이면 예전 웹 카드 시트로(act web)
  var pgAct = function (k) { return pg ? { a: 'call', v: 'pg.' + k } : { a: 'web', v: k }; };

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
    sk.push(settingsNavN('자동 절전 제외 설정 열기', f.samw ? '제한됨' : '', pgAct('sam'), true));
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
  wk.push(settingsNavN('출퇴근 브리핑 알림', f.cm == null ? '' : (f.cm ? '켜짐' : '꺼짐'), pgAct('cm'), true));
  wk.push(settingsNavN('캐릭터 시계 위젯', '', pgAct('gw'), true));
  wk.push(settingsNavN('하차 5분 전 추천 시험', '', pgAct('arr'), true));
  wk.push(settingsNavN('다른 앱 위에 표시', f.ovl == null ? '' : (f.ovl ? '켜짐' : '꺼짐'), pgAct('ovl'), true));
  wk.push(settingsNavN('개발자 도구', '', pgAct('dev'), true));
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

// ══════════════════════════════════════════════════════════════════════════
// ★ 하위 화면(cap 8) — 예전에 '웹 카드 시트'로 열던 6개: 갤럭시 절전 · 다른 앱 위에 표시 · 개발자 도구 · 하차 추천 시험 · 캐릭터 시계 위젯 · 출퇴근 브리핑.
//   앱은 pf(기기 사실)만 보낸다 — 켜짐·값·고른 칸·읽은 숫자. 글(상태 문구·시각 글·요일 안내·퇴근 힌트·시간대 이름)과 어떤 칸을 어떻게 보일지는 여기서 정한다.
//   행동(act call v): pg.back(설정으로) · sam.open · bat.req · ovl.diag · pf.live · pf.rec · dev.start.<모드> · dev.stop · arr.t.<종류> · arr.demo · arr.stat ·
//   gw.add.<hb|hw|vb|vw> · gw.roam.<dn|up> · cm.day.<0-6> · cm.preset.<weekday|weekend|all> · cm.tp.<morn|eve> · cm.test · cm.pick.<from|to|eFrom|eTo> ·
//   tp.ap.<am|pm> · tp.h.<1-12> · tp.m.<0-55> · tp.ok · tp.cancel · pk.save · pk.clear · pk.u.<번호> · pk.b.<번호> · pk.cancel.   스위치(toggle) 키: cm · ovl.
// ══════════════════════════════════════════════════════════════════════════
var SETTINGS_PAGES = { sam: '갤럭시 백그라운드 유지', ovl: '다른 앱 위에 표시', dev: '개발자 도구', arr: '하차 5분 전 추천', gw: '캐릭터 시계 위젯', cm: '출퇴근 브리핑 알림' };
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
function settingsPageFacts(pf) {
  pf = (pf && typeof pf === 'object') ? pf : {};
  var tri = function (v) { return v == null ? null : settingsFlag(v, false); };
  var days = [];
  (Array.isArray(pf.days) ? pf.days : []).forEach(function (d) { d = Math.floor(Number(d)); if (d >= 0 && d <= 6 && days.indexOf(d) < 0) days.push(d); });
  days.sort();
  var tp = (pf.tp && typeof pf.tp === 'object') ? pf.tp : null, pk = (pf.pick && typeof pf.pick === 'object') ? pf.pick : null, st = (pf.st && typeof pf.st === 'object') ? pf.st : null;
  var dg = (st && st.dg && typeof st.dg === 'object') ? st.dg : {};
  return {
    w: settingsFlag(pf.w, false), ig: tri(pf.ig), bk: pf.bk == null ? null : settingsInt(pf.bk, 0, 5, 0), er: settingsFlag(pf.er, false), sok: tri(pf.sok),
    nat: settingsFlag(pf.nat, true), sup: tri(pf.sup), gr: tri(pf.gr), on: settingsFlag(pf.on, false), pfl: settingsFlag(pf.pfl, false), pfr: settingsFlag(pf.pfr, false),
    ph: ['plain', 'reco', 'alert2', 'alert1', 'quit'].indexOf(pf.ph) >= 0 ? pf.ph : '', left: settingsInt(pf.left, 0, 600, 0), stopped: settingsFlag(pf.stopped, false),
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
    settingsBtnN('오버레이 진단 기록 보기', 'ovl.diag', { size: 12, h: 38, tc: 'sub', mb: 6 }),
    settingsBtnN(f.pfl ? '새 위치 판단기 보정: 켜짐 (누르면 끔)' : '새 위치 판단기 보정: 꺼짐 (누르면 켬 · 실험)', 'pf.live', { size: 12, h: 38, on: f.pfl, mb: 6 }),
    settingsBtnN(f.pfr ? '정답 기록 버튼: 켜짐 (누르면 끔)' : '정답 기록 버튼: 꺼짐 (테스트 탑승용)', 'pf.rec', { size: 12, h: 38, on: f.pfr })];
  return [settingsPanelN(k, 8)];
}
// ── 개발자 도구(오버레이 테스트) ──
var SETTINGS_DEV_PH = { plain: '평상시', reco: '추천', alert2: '2정거장 전', alert1: '1정거장 전(내릴 준비)', quit: '앱 자동종료 예약(15초 뒤)' };
function settingsPageDev(f) {
  var b = settingsBoldN([['가짜 여정(임학→아라)을 오버레이에 보내 접힘·펼침·무지개·버튼을 실기기로 확인해요. \'다른 앱 위에 표시\'를 켜 두고, 버튼을 누른 뒤 ', 0], ['홈 화면으로 나가세요', 1], ['. 알약으로 접어 두려면 오버레이를 위로 쓸어 올리세요(접힌 상태는 기억돼요).', 0]]);
  var stat = f.ph ? ('진행 중 · 지금 단계: ' + SETTINGS_DEV_PH[f.ph] + ' · ' + f.left + '초 남음') : (f.stopped ? '중지했어요.' : '');
  var k = [settingsTitleN('개발자 도구', 4), settingsDescN('오버레이 테스트 · 출시 전 삭제', 4), settingsDescN(b.s, 12, b.hl),
    settingsBtnN('▶ 전체 시나리오 (75초)', 'dev.start.all', { gold: true, mb: 8 }),
    settingsSmallN('0~15초 평상시(이때 알약으로 접기) → 15~30초 추천(접혀 있어도 펼쳐짐) → 30~45초 2정거장 전(알약 둘레 무지개, 펼치지 않음) → 45~60초 1정거장 전(펼침+빠른 무지개+진동+캐릭터+\'내릴 준비를 해주세요\'+응원 문구+[앱 종료]) → 마무리', 0, 10),
    settingsRowN([settingsBtnN('평상시', 'dev.start.plain', { size: 12 }), settingsBtnN('추천', 'dev.start.reco', { size: 12 }), settingsBtnN('2정거장 전', 'dev.start.alert2', { size: 12 }), settingsBtnN('1정거장 전', 'dev.start.alert1', { size: 12 })]),
    settingsBtnN('앱 자동종료 (15초 뒤 진짜 종료)', 'dev.start.quit', { mb: 8 }),
    settingsBtnN('■ 테스트 중지', 'dev.stop')];
  if (stat) k.push(settingsSmallN(stat, 8, 0));
  k.push(settingsSmallN('※ [앱 종료]·자동종료는 진짜 앱 종료예요(이때 시계 위젯 동물이 계속 움직이는지 확인). 추천의 [맛집 보기]는 앱을 앞으로 가져와 가게 화면을, [확인]은 추천만 닫아요(테스트 가짜 추천이라 가게는 실제로 없어요).', 6, 0));
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
function settingsArrLines(st) {                                     // 예전 _arrStatusShow 와 같은 줄들
  var L = [];
  if (st.err) { L.push('상태 확인 오류: ' + st.err); return L; }
  L.push('감시 타이머: ' + (st.timer ? '동작 중 (20초마다)' : '없음'));
  L.push('현재 경로: ' + (st.route ? ((st.dest || '-') + ' 도착 예정') : '없음 (탑승 상태 아님)'));
  if (st.rem != null) L.push('남은 시간: ' + Math.floor(st.rem / 60) + '분 ' + (st.rem % 60) + '초' + (st.rem > st.pre * 60 ? '  (10분 되면 발사)' : '  (발사 구간)'));
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
  var k = [settingsTitleN('하차 5분 전 추천', 4),
    settingsDescN('도착 5분 전에 시간대별로 보내는 추천이에요. 실제 알림과 같은 내용으로 바로 확인해 볼 수 있어요. 버튼을 누르면 오버레이 아래에도 90초간 뜹니다(오버레이를 켜 둔 상태 — 접혀 있어도 저절로 펼쳐져요).', 12),
    settingsRowN([settingsBtnN('커피', 'arr.t.morning', { size: 12 }), settingsBtnN('점심', 'arr.t.lunch', { size: 12 }), settingsBtnN('야식', 'arr.t.night', { size: 12 }), settingsBtnN('쇼핑', 'arr.t.shop', { size: 12 })]),
    settingsBtnN('추천 캐릭터 미리보기', 'arr.demo', { mb: 6 }),
    settingsSmallN('캐릭터 하나가 오른쪽에서 추천 줄(실제 가게·쿠팡 상품 이름)을 끌고 들어오는 모습을 14초간 보여 줘요(앱 위에 바로 떠요). 누를 때마다 다른 캐릭터와 다른 종류(식당·카페·쿠팡)가 나오고, 화면을 누르면 닫혀요. \'다른 앱 위에 표시\' 권한이 필요해요.', 0, 10),
    settingsBtnN('상태 확인', 'arr.stat', { gold: true, mb: 10 }),
    settingsStatN(f.st ? settingsArrLines(f.st).join('\n') : '\'상태 확인\'을 누르면 감시 상태와 남은 시간이 표시됩니다.')];
  return [settingsPanelN(k, 8)];
}
// ── 캐릭터 시계 위젯 ──
function settingsPageGw(f) {
  var roamTxt = f.roam + '분' + (f.roam === 6 ? ' (추천)' : '');
  var note = f.roam > 6 ? '6분 추천이에요. 그보다 길게 두면 배터리 소모량이 조금 늘 수 있어요.' : '6분 추천이에요. 그보다 길면 배터리 소모량이 조금 늘 수 있어요.';
  var on = f.mOn || f.eOn;
  var gwNote = on ? ((f.mOn ? '출근 ' + f.morn : '') + (f.mOn && f.eOn ? ' · ' : '') + (f.eOn ? '퇴근 ' + f.eve : '') + ' 에 위젯이 응원해요') : '출·퇴근 장소를 설정하면 그 쪽 버튼이 나와요.';
  var k = [settingsTitleN('캐릭터 시계 위젯', 4),
    settingsDescN('평소엔 캐릭터들이 각자 집(개집·바구니·굴·둥지·연못)에서 자고 있다가, 화면을 켜면 일어나 정해 둔 시간 동안 시계 주변을 돌아다니며 시계에 매달리고 응가도 해요. 위젯을 누르면 앱이 열리며 커뮤니티 탭으로 가요. 배경은 투명이고, 시계가 칸을 꽉 채워요. 위에서 정한 출·퇴근 시각이 되면 캐릭터가 모여 응원하고, 시계가 작아지면서 [출근하기]·[퇴근하기] 버튼이 나와요. 버튼은 3분 동안만 떠 있고, 누르면 앱이 열리며 바로 길찾기를 해요. (블랙=검정 글자, 화이트=흰 글자)', 12),
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
function settingsPageCm(f) {
  var d = settingsBoldN([['설정한 시각에 ', 0], ['날씨 + AI 역무원 요약', 1], ['을 알림으로 보내드려요.', 0]]);
  var k = [{ t: 'toggle', key: 'cm', title: '출퇴근 브리핑 알림', on: f.on, big: true, size: 15, vp: 0, onc: '#30d158', pad: [0, 0, 0, 4] }, settingsDescN(d.s, 10, d.hl)];
  ['from', 'to'].forEach(function (x, i) { k.push(settingsNavN(SETTINGS_PICK[x][0], f[x] || '비어 있음', settingsCall('cm.pick.' + x), true)); });
  k.push(settingsSmallN('지하철역과 버스정류장 모두 입력할 수 있어요. 검색 목록의 지하철/버스 표시로 구분돼요. 비워두면 현재 위치 기준이에요.', 8, 10));
  ['eFrom', 'eTo'].forEach(function (x) { k.push(settingsNavN(SETTINGS_PICK[x][0], f[x] || '비어 있음', settingsCall('cm.pick.' + x), true)); });
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

function settingsPageScreen(inp, factsIn) {
  var p = String(inp.p || '');
  if (!(Number(inp.cap) >= SETTINGS_PAGE_CAP)) return { ok: false, error: 'cap' };
  if (!Object.prototype.hasOwnProperty.call(SETTINGS_PAGES, p)) return { ok: false, error: 'page' };
  var pf = settingsPageFacts(factsIn && typeof factsIn === 'object' ? factsIn.pf : null);
  pf.bus = (factsIn && factsIn.pf && Array.isArray(factsIn.pf.bus)) ? factsIn.pf.bus.slice(0, 12).map(function (x) { return settingsStr(x, 60).trim(); }) : [];
  var info = { page: p, sub: '' }, kids;
  if (p === 'cm' && pf.sub === 'tp') { info.sub = 'tp'; kids = settingsPageTp(pf); }
  else if (p === 'cm' && pf.sub === 'pick') { info.sub = 'pick'; kids = settingsPagePick(pf, info); }
  else kids = ({ sam: settingsPageSam, ovl: settingsPageOvl, dev: settingsPageDev, arr: settingsPageArr, gw: settingsPageGw, cm: settingsPageCm })[p](pf);
  var body = [settingsBackN(info.sub ? SETTINGS_PAGES.cm : '')].concat(kids, [{ t: 'spacer', h: 28 }]);
  var out = { ok: true, v: 1, screen: 'settings', cover: 'tab', head: [], body: body, info: info };
  out.rev = 's' + SETTINGS_SCREEN_V + 'p:' + settingsHash(JSON.stringify(body));
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { settingsScreen: settingsScreen, settingsPageFacts: settingsPageFacts, settingsStnFind: settingsStnFind, settingsOvlStat: settingsOvlStat, settingsArrLines: settingsArrLines, settingsFmtTime: settingsFmtTime, settingsEveHint: settingsEveHint, SETTINGS_PAGES: SETTINGS_PAGES, settingsFacts: settingsFacts, settingsStat: settingsStat, settingsHash: settingsHash, SETTINGS_FEATS: SETTINGS_FEATS, SETTINGS_NOTIF: SETTINGS_NOTIF };
