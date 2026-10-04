# HANDOFF (길동무 앱 + 엔진) — 작업 묶음이 끝날 때마다 이 파일 하나를 갱신한다

**마지막 갱신: 2026-10-04 (KST 밤)** · 다음 Claude는 이 파일부터 읽고, 아래 "주의·원칙"을 지킨다.

## 0. 현재 상태 한눈에
| 대상 | 버전·커밋 | 상태 |
|---|---|---|
| 앱 `DullyYJ/subway-app` main | 마지막 앱 동작 변경 `43e816b`(탑승 중 재탐색 차단·PF 단일 위치원·복합 승차판정·가속도계 삭제). 그 뒤는 시험 파일 정리와 이 문서뿐 | Build APK #754(`43e816b`) 성공 · #755 성공 — 5번 표 참고. **실기기 검증은 아직 안 함(다음 승차에서)** |
| 엔진 `DullyYJ/route-v2` main | `ENGINE_VERSION = route-v2-2026-10-04bw`, 병합 커밋 `a504d1a` | main push 시 Cloudflare Workers Builds 자동 배포. 지연 추정은 `EST_ENABLED` 꺼짐 |
| board-writer (`route-v2/board-writer/index.js`, main) | 신버전(호선 방 `line` 저장·`/talks` 모으기·호선별 AI 글) | **대시보드에 배포됨** — Cowork 클로드 확인: `/talks` 항목에 `line` 필드·`L숫자` id, `/lroom?line=…` 정상, 경춘선·GTX-A는 빈 방으로 열림 |
| 중계 gentle-lab (`subway-app/worker/index.js`) | 강화 코드(재시도·키 정리·진단) | **대시보드에 붙여 넣어 배포됨**(YJ가 Deploy). `SEOUL_DEBUG` 변수는 진단 후 YJ가 삭제. 배치(Placement)는 AWS ap-northeast-2로 바꿨으나 swopenapi 차단에는 효과 없음 |

## 1. 저장소·배포 방법
| 저장소 | 역할 | 배포 |
|---|---|---|
| `DullyYJ/subway-app` | 앱. 화면 `www/index.html`, 방침 `www/privacy.html`, 중계 `worker/index.js`, 시험 `test/`·`worker/test/` | Actions `Build APK`(build-apk.yml): **main push 때만 자동**, 다른 브랜치는 수동 실행. 결과 아티팩트 `subway-app-debug`. 중계(gentle-lab)는 자동 배포 꺼짐 → **대시보드 Deploy**(코드 붙여넣기) |
| `DullyYJ/route-v2` | 경로 엔진 `route-v2-worker.js` + 게시판/실시간소통 서버 `board-writer/index.js`(별도 워커) + 시험 `test/` | 엔진은 main push → Workers Builds 자동 배포. board-writer는 병합만으로 배포 안 됨 → **대시보드에 파일 전체 붙여넣기** |

- 서버 주소: 엔진 `route-v2.phg0643.workers.dev`, 게시판 `board-writer.phg0643.workers.dev`, 중계 `gentle-lab-7e47subway-api.phg0643.workers.dev`
- 작업 방식: YJ가 두 저장소 main 직접 push와 대시보드 배포를 허용했다. 단 **병합·Deploy·프로덕션 설정 클릭은 YJ가 직접 누른다**(자동 승인 분류기가 Cowork의 그런 클릭을 막은 적이 있다).
- 브랜치: route-v2의 옛 `claude/jolly-darwin-dtzab9`는 삭제됨. **subway-app의 같은 이름 브랜치는 미완성 커밋 `ac3e4ff`('설정에서 이용 노선 직접 고르기') 등이 있다 — YJ 지시가 있을 때까지 삭제하지 말 것.** 그 커밋은 하단 호선 탭 개편으로 대체돼 폐기 대상이고, 그 브랜치의 HANDOFF.md는 옛 사본이다.

## 2. 구조 요약 (이어받는 사람용)
**위치·승차 판정 (2026-10-04 저녁 개편, `www/index.html` 끝부분 `PosFusion` 주변 46500~46900줄 + 7500~7900·11300~11900·13400~14700줄)**
- **위치의 단일 출처는 PF(PosFusion, 은닉 마르코프 필터)다.** 마커·오버레이(한 정거장 앞)·혼잡도 카드·알림·도착 예상은 모두 `_gpsMaxIdx`(=PF가 채택한 '마지막으로 도착한 역')를 읽는다. 시각표는 역 사이 보간에만 쓰며 증거보다 앞서 나가지 못한다. 채택 로직: `_pfTrusted`(신뢰 조건) → `_pfPosOverride`(역↔역 사이 비율, 최대 0.85, 정차 중이면 역 위에 고정) → `_pfAdopt`(역 전진 채택, 히스테리시스로 아현↔충정로 같은 깜빡임 억제) → `_pfApplyLive`. PF 상수 `_PF_HM_ON=0.28, _PF_HM_MEAN=0.30, _PF_COH=0.7, _PF_SHAKE=1.8`(46512줄). PF 의 동작(Capacitor Motion `_pfM*` 가속 파이프라인)은 그대로이고, 아래 3번에서 지운 옛 `_accel`과는 별개다.
- **승차 증거 모듈(`_ev`, `_rideEv()`, `_evSample`, `_evSpan`, `_evNearNode`, `_missProof`)**: GPS 이동(150초 창에서 350m·4.5m/s 이상=2점, 200m·3.5m/s=1점) + 기지국 변화(180초 안 2회=1점, 3회=1.5점) + PF 주행 확률(≥0.7)을 **함께** 본다. 한 번 확인되면 20분 유지(지하 신호 약화로 풀리지 않게). `_missProof()`는 '정말 못 탔다'의 증명(최근 2분간 GPS가 역 근처에서 거의 안 움직였고 기지국도 안 바뀌었고 PF도 주행 아님)일 때만 true — **시각만으로는 놓침 판정 불가**.
- **재탐색 차단**: 탑승 증거가 있으면 `_etaResearchIfStale`·시각 기반 '열차 놓침' 3곳(14347·14635·14681줄 근처)·앱 복귀(`_onForegroundResume`)가 재탐색하지 않는다(복귀 시에는 토스트만). 원인(2026-10-04 열차 시험): GPS 가 재획득될 때마다·몇 분마다 '방금 지난 역에서 다음 열차를 탄다'로 재탐색해 시각표 기준점(`_routeBaseMs/_trackSig`)과 PF 가 리셋됐다.
- **대기 중 승차(`_htlBoardWatch`)**: 기존(승차역 이탈/출발시각 경과+위치 없음/셀 2회 변화) 외에 **증거 분기** 추가 — 이미 승강장에 있다가 일찍 탄 열차도 GPS·기지국·PF 증거로 확정(로그 `승차확정`). 승차역 근처가 아니면 확정 안 함(근접 가드 `_evNearNode`).
- **환승**: `_xferHoldIdx/_xferDeparted`(GPS+기지국+시각)로 '환승 후 다음 열차를 실제로 탔는지'를 확인한다. 환승 승차 전에는 셀 변화·드리프트 전진이 막힌다(13437줄 등). 사용자가 앱이 제안한 열차를 못 탈 수 있다는 전제.
- **지연·도착은 증거 기반**: 실제 통과 시각 `_nodePassMs[idx]`(PF 채택 때 기록)를 닻으로 이후 시각표를 같은 만큼 민다(11700~11900줄). 도착(하차) 확정은 시각이 아니라 위치 증거.
- 표시 수정: 시각 `13:60` 오류(분 올림) 수정, 혼잡도 카드 라벨이 지하철에서 `버스`로 남던 것(`updateCong`에서 라벨 리셋), 환승 이동 `도보 0m` → `환승 이동`, 알림 ETA는 알림 노드의 `arrTime`에서 계산, 탑승 중 주황 대기 배지 숨김.
- 로그 태그(`_ovlDiag`/`_evLog`): `승차판단`(탑승 증거 확인·초기화·미탑승 증명 정지), `승차확정`(대기 모드에서 확정, 근거와 출발 경과), `PF채택`(역 전진 때 PF 위치·신뢰도·지연). 기록 모드 로그에서 이 세 줄로 이번 개편의 동작을 대조한다.
- 맛집 탭: 카카오/네이버 버튼은 길찾기가 아니라 **가게 상세·리뷰**를 연다(`_placeInfo`: 앱 `nmap://search`·`kakaomap://search` → 웹 `map.naver.com/p/search/…`·`map.kakao.com/link/search/…` 폴백). 길찾기는 `_navBtnsHtml`로 별도 버튼(`네이버 길찾기`·`카카오 길찾기`)으로 남겼다. 가게 이름 검색이라 장소 ID 직링크는 아니다.
- 승차 판정 일부(`detectBoardingState`의 GPS·기지국·시각표 근거, 수동 탑승 버튼 경로)와 `_startTimetableAdvance`·`_doTimetableAdvance`(지연 측정)는 그대로다.

**커뮤니티 > 실시간소통**
- 상단 칩 4개(실시간소통·게시판·뉴스·설정), 스와이프 순서 그대로. 맨 아래 줄 = `전체` + **모든 호선 칩**(`_LR_KNOWN` 18개: 1~9호선, 신분당·수인분당·경의중앙·공항철도·경춘선·GTX-A·인천1·2호선·김포골드라인) 가로 스크롤. **내가 탄 노선(`my_lines`, 경로 안내 시작 때 `startTracking()`→`_myLinesRecord()`가 기록, 많이 탄 순)은 앞쪽에 `📍`+굵은 테두리.** 안내문구 `📍 내가 탄 노선은 앞에 표시돼요`(탄 노선 없을 때만).
- 호선 방: 읽기 `GET /lroom?line=<호선>&since=<ts>`(6초마다), 쓰기 `POST /react {nick,text,line}`(AI 반응이 그 방에 달림), 제보 `POST /lroom`, 신고 `POST /lreport`, 경보 `GET /lalerts`. **`/talks`는 `line` 파라미터를 읽지 않는 "전체 모아보기"**(앱은 `?since=&limit=`만 쓴다). 전체 방에서만 닉네임 앞 `(N호선)`. 전체에서 쓴 글은 가장 많이 탄 노선 방으로 전송.
- 빈 방: `아직 {호선} 방에 글이 없어요. 첫 글을 남겨보세요!`, 로딩 `불러오는 중…`, 실패 `연결이 불안정해요…`. 공식 공지 줄(`_lrRenderOfficial`)·지연/혼잡 제보·신고는 호선 방 안에 그대로.
- 서버: board-writer가 20분마다 호선별 AI 대화를 만든다(`generateLineTalks`, 노선 비중 `LR_AI_ROOMS` 2호선 10 … 인천2호선 1, 지연·혼잡 제보는 만들지 않음, AI 글 2일 뒤 삭제). `/react`의 AI 반응은 IP당 시간당 12회 제한(넘으면 429이지만 글은 `stored:true`로 저장).

**공식 공지** — 엔진 `/line-notices`(서울교통공사 공지 API 1~8호선). 앱 `_lrRenderOfficial`: 공지 있음=`🚇 서울교통공사 공지 …`, 1~8호선 공지 없음=`✅ N호선 정상 운행 중입니다 (방금 확인)`, 경의중앙선·공항철도=`환승역 관련 공지만 가끔 올라와요`, 그 밖의 노선=`공식 공지 연동 전이에요`. 공지가 해제되면(엔진 `NTCE_RESOLVED_RE`) 자동으로 '정상 운행' 문구로 바뀐다. 공지 API 과거 300건 실측: 1~8호선이 거의 전부, 그 외 경의중앙선 4건·공항철도 3건뿐.

**지연 추정(도착 간격 기반) — 현재 중단 (YJ 결정)** — 상세는 4번.

## 3. 이번 세션(2026-10-04)에 한 일
**저녁: 열차 시험(계양 12:52 → 잠실 14:01, 69분) 문제 일괄 수정 — Cowork 클로드가 직접 수정·push**
- 앱 `7a63fc1`(줄바꿈이 CRLF 로 들어가 폐기) → **`43e816b`**(LF 로 재커밋, 실제 반영본). 위 2번 구조 전부가 이 커밋. 가속도계(`_accel`·`_startAccel`·`_accelState`·`'진동 보조'` 문구·설정의 측정 카드·`_bgDiag` 줄)를 **전부 삭제**했다. 실측(열차 운행 98회 샘플, stddev 최소 0.06/중앙 0.16/90% 0.17/최대 0.38)이 임계 `TRAIN_THRESH 1.8` 보다 한참 낮았고 걷기보다 작아 구분 불가였다. 가속도 쪽 신호는 PF 의 `_pfM*`(정차/주행 확률)만 남는다.
- 시험: `test/ride_evidence.ui.test.js`(19건)를 추가하고 `test/accel_auxiliary.ui.test.js`는 삭제(이력에 있음). 시나리오: 승차역에서 3분 서 있어도 승차증거 없음·정지 증명, 역방향(경도 감소) 17:10 마커가 역을 지나치지 않음, **23역·188초 간격 69분 시나리오에서 재탐색 0회·남은 시간 0~2분**, 그려 둔 지 1시간이 지난 경로도 `_etaResearchIfStale` 가 탑승 중엔 재탐색 안 함, 앱 복귀 재탐색 없음, 맛집/네이버 버튼, `13:60` 잔존 여부, 가속도 코드 삭제 확인.
- 코드 검토에서 나온 논리 오류는 모두 고쳤다(증거 캐시의 시각 역행 등). 검토가 지적했으나 **안 고친 것**은 6번 목록.
- **커밋 방법(이 환경 제약)**: 6.7MB 파일은 GitHub 편집기가 안 열린다. 내장 브라우저(GitHub 로그인된 DullyYJ)에서 `POST /DullyYJ/subway-app/tree-save/main/<경로>`(필드: message, placeholder_message, description, commit-choice=direct, target_branch=main, quick_pull, guidance_task, commit=현재 head oid, same_repo=1, pr, content_changed, filename, new_filename, value, authenticity_token; 헤더 accept json·github-verified-fetch true·x-fetch-nonce·x-requested-with)로 저장한다. 토큰·oid 는 편집 페이지 `script[data-target="react-app.embeddedData"]`. 새 파일은 `/create/main/<폴더>`(파일명에 폴더를 넣으면 최상위로 올라간다 — 폴더 경로로 POST 하고 이름만 넣을 것, 잘못 올리면 `new_filename`으로 이동 가능), 삭제는 `DELETE` 로 `blob/main/<경로>`. **함정: Chrome FormData 멀티파트가 값의 LF 를 CRLF 로 바꾼다 → LF 파일은 `Blob`으로 멀티파트 본문을 직접 만들고(파트 사이만 `\r\n`) content-type 헤더에 boundary 를 지정.** 올린 뒤 `raw/main/…` 를 sha256 으로 대조한다.
- 장기 시험 실행: `nohup node test/ride_evidence.ui.test.js <html 경로> &`(약 4분, 포그라운드로는 시간 초과).

**Code 클로드 (이 저장소 커밋)**
- subway-app `2c883e0` — (저녁에 삭제됨, 기록용) **가속도계를 승차 확정 지표에서 보조 지표로**. `www/index.html`: `detectBoardingState` 확정 규칙 변경·문구 변경, `_accelStats()`(읽기 전용 요약)·직접 측정 도구 추가, 설정에 `📳 가속도계 측정 (보조 지표)` 카드(측정 시작 90초 / 지금 상태 / 중지: 상태 train·walk·still·unknown, stddev, 평균, 샘플 수·Hz, 임계값, 마지막 승차 판정 근거, 끝나면 상태 비율·stddev 최소/중앙/90%/최대 요약). `_bgDiag`에도 같은 줄 추가. 시험 `test/accel_auxiliary.ui.test.js` 20건. **수집(`_onDeviceMotion`)·상태 판정(`_accelState`)·임계값·로그·시각표 타이머·`_doTimetableAdvance`·`_htlBoardWatch`·기지국 전진은 한 줄도 바꾸지 않았다**(diff로 확인).
  - 시험 중 발견한 사고: 설정 화면의 **개발자용 진단 카드 3종(배터리 최적화 제외·백그라운드 추적 진단·버스 도착정보 진단)은 HTML 주석 안에 숨겨져 있다**(YJ 요청, 2026-09-29, `www/index.html` 19441~19510줄 근처). 그 안에 `<!-- -->`를 넣으면 HTML 주석은 중첩되지 않아 바깥 주석이 끊기고 숨긴 카드가 드러나며 `-->`가 글자로 보인다. 처음에 그렇게 넣었다가 시험이 잡아 **주석 밖으로 옮겼다**. 시험 `숨겨 둔 개발자용 진단 카드…는 계속 숨겨져 있다`가 이를 지킨다(고의로 사고를 재현해 실패함을 확인).
- subway-app `6b5d2fe`(Build #743 성공) — 하단 줄을 호선별 채팅방 탭으로 개편(2번 구조). 시험 `test/chat_line_tabs.ui.test.js` 21건. board-writer 변경 없음.
- route-v2 `26b58cc`(엔진 04bw) — 지연 추정 스위치 `EST_ENABLED`(기본 꺼짐), 시험 75건. 같은 날 앞서: `b66fe7d`(04bt)·`a4beb05`(04bu 기준선)·`4d922cb`(04bv 거절 시 10분 쉼)·`cd0b195`(시험).
- subway-app `2a594a9`·`2c26859` — 중계 `/seoul` 강화(본문 없는 4xx 재시도 std→plain→http, 빈 400 대신 JSON 오류+30초 쿨다운, `SEOUL_API_KEY` 따옴표·공백 제거)와 진단(`SEOUL_DEBUG=1`일 때만 `/seoul?…&debug=1`, 키 값은 어디에도 안 나옴). 시험 `worker/test/seoul_relay.test.js` 13건. **YJ가 대시보드에 붙여 넣어 배포함.**
- 공지 문구: `16abcfe`(경의중앙선·공항철도 '환승역 관련 공지만 가끔'), `60eb8d7`(1~8호선 `N호선 정상 운행 중입니다`, #735 성공), `04c2da3`(추정 표시 — 지금은 추정이 오지 않아 안 보임).
- route-v2#1(board-writer 노선별 실시간소통) 병합 `a504d1a`(YJ가 ready로 바꿔 병합). 병합 뒤 main 빌드 성공, 엔진 04bw 유지.

**Cowork 클로드가 한 일 (브라우저·대시보드 쪽)**
- gentle-lab 중계에 강화 코드를 대시보드로 붙여 넣어 배포(YJ가 Deploy 클릭). `SEOUL_DEBUG`는 진단 후 YJ가 삭제. 배치를 AWS ap-northeast-2로 바꿨으나 효과 없음.
- **서울 swopenapi가 Cloudflare 출구 IP를 거부**함을 진단: 한글 경로는 즉시 빈 400, ASCII 경로는 522(지연). 해결에는 **한국 IP 중계**가 필요. Oracle Cloud 무료 서버는 가입 화면의 홈 리전 목록에 한국이 없어 중단(일본·싱가포르는 리전 변경이 안 되고 서울 API의 해외 IP 허용 여부도 불명이라 선택 안 함). Cowork 작업 폴더에 중계 Node 초안(`relay.js`: `x-relay-token` 인증, `SEOUL_API_KEY` 환경변수, 허용 경로 정규식, 10초·15초 캐시, 키 마스킹)이 있으나 **저장소에는 올리지 않았다.**
- 호선별 채팅방(#743)의 서버 쪽 확인: 배포된 board-writer는 이미 신버전, `/lroom` 호선별 조회, 경춘선·GTX-A 빈 방 정상. (위 0번 표)
- route-v2 옛 브랜치 삭제(subway-app 쪽은 YJ 지시 대기).

## 4. 지연 추정 중단 (YJ 결정) — 막힌 원인과 다시 켤 조건
- **결정:** 9호선 포함 지연 추정 전체 비활성. 엔진 환경변수 **`EST_ENABLED`가 `"1"`/`"true"`일 때만 켜지고 기본 꺼짐**. 꺼짐 상태: 서울 `realtimePosition`·KV 호출 0건, `/line-notices`에 추정 없음(저장돼 있던 상태도 안 내보냄), `/est-status`는 `enabled:false`와 5개 노선(9호선·신분당·공항철도·경의중앙·수인분당) 모두 `hold:"disabled"`, 앱은 아무것도 표시하지 않음. **1~8호선 공식 공지는 그대로 정상.**
- **막힌 원인:** 서울 지하철 서버(`swopenapi.seoul.go.kr`)가 **Cloudflare 출구 주소를 거부**한다. 코드·진단으로 키/헤더/스킴/Worker 일반 외부 호출 문제는 배제됐다(공개 `sample` 키·http·헤더 변경에도 동일, 같은 Worker의 `/tago`→apis.data.go.kr는 정상, 배치 변경 무효). 이 Code 환경은 서울 서버를 호출할 수 없어 직접 재현은 못 했고 YJ·Cowork의 진단에 따른다.
- **코드는 지우지 않았다.** 판정(같은 방향 인접 열차 간격 ≥ `min(2×배차간격, 배차간격+6분)` 연속 2회 → 의심, 정상 연속 2회 → 해제), 9호선 시간표 기준(`SUBWAY_BUNDLE.lines[*].tt`), 시간표 없는 4개 노선의 기준선(최근 관측 간격 중앙값: 표본 20개·30분 이상 쌓이기 전 보류, 지연 중 표본 제외), 보류 조건(첫차+30분 전·막차−60분 이후·23시 이후·막차 열차·자료 오래됨/부족), 하루 호출 상한 `EST_DAILY_CAP`(기본 400), 거절 시 10분 쉼, `/est-status` 진단이 모두 남아 있다. 진입점 `estimateNotices`·`estimateCached`·`estRefreshLine`·`/est-status`에 스위치 검사. 데이터는 엔진이 `env.BUSAPI`(gentle-lab `/seoul`, 키 `SEOUL_API_KEY`는 gentle-lab 시크릿)로 호출 — 엔진에 새 시크릿 없음, 앱은 직접 호출 금지.
- **다시 켤 조건 = 한국 IP 중계 확보.** 순서: ① 그 중계에서 swopenapi가 200으로 오는지 먼저 확인(Cowork의 `relay.js` 초안 참고) ② gentle-lab `/seoul`의 업스트림을 그 중계로 돌리는 수정(키는 중계/Worker 시크릿에만, 앱에 넣지 않음) ③ Deploy 후 `SEOUL_DEBUG=1`로 `debug=1`의 `hint`·`probes` 확인(끝나면 변수 삭제) ④ 엔진에 `EST_ENABLED=1` ⑤ `/est-status`에서 `enabled:true`, 9호선 `hold` 비고 시간표 없는 노선의 `baseline.samples`가 느는지 확인 ⑥ 며칠간 오탐(`lastMaxGapSec` vs `thresholdSec`)·호출량(`budget.usedToday`) 관찰. 다른 대안: 서울시에 Cloudflare 출구 허용 문의. 앱에서 직접 호출은 키가 앱에 들어가므로 권하지 않는다.
- **같은 중계를 쓰는 기존 기능도 영향:** 앱의 평소 도착정보(`realtimeStationArrival`)와 앱의 `realtimePosition` 기존 기능(RT 진단·구간 열차 위치 `_rtPosParam`)은 `/seoul` 중계를 지나므로 중계가 막힌 동안 실패하고 **시간표 폴백으로 동작**하는 것으로 보인다(확인 필요 — 6번).
- 운영 원칙: **앱은 표시 전용, 처리는 서버에서.** 기존 기능은 반드시 보존. 키·토큰 정리는 마지막.

## 5. 확인 안 된 것 · 빌드 · 가속도계 삭제 근거
**빌드**
| 커밋 | Build APK | 결과 |
|---|---|---|
| `18ef908`(subway-app#1 병합) | #734 | 성공 |
| `60eb8d7` | #735 | 성공 |
| `6b5d2fe`(하단 호선 탭) | #743 | 성공 |
| `c26e5ea` | #746 | 성공 |
| `2c883e0`(가속도계 보조) | **#747** | 성공 (2026-10-04 확인) |
| 이 문서+주석 날짜 정정 커밋 | **#748** | 성공 (2026-10-04 확인). 문서·주석만 바뀜(동작 동일) |
| `7a63fc1`(CRLF 로 올라간 첫 수정본) | #753 | 성공(폐기본) |
| **`43e816b`(재탐색 차단·PF 단일 위치원, LF)** | **#754** | **성공** (2026-10-04 확인) |
| `4d205d9`(새 시험 파일, 최상위에 잘못 올라감) | #755 | 성공 |
| `956aa85`(시험을 test/로 이동) · `16ffdca`(가속도계 시험 삭제) | #756·#757 | 확인 시점에 진행 중 — Actions 에서 결과 확인 |

**가속도계(`_accel`) — 삭제됨(2026-10-04 저녁).** 실측으로 열차 구간 stddev 가 임계(1.8)의 1/10 수준이라 판정 근거가 될 수 없음이 확인됐다(2번·3번). 앞의 '보조 지표'(`2c883e0`, #747·#748) 도입분과 설정의 측정 카드도 함께 지웠다. **되살리지 말 것** — 위치 증거는 GPS·기지국·PF 이다. 옛 시험은 `test/accel_auxiliary.ui.test.js`(이력 `2c883e0`)에 있다.

**그 밖의 미확인**
- 엔진 04bw 자동 배포 결과: Code 환경은 Cloudflare·workers.dev에 접속할 수 없어 못 본다. 루트 `version`이 `route-v2-2026-10-04bw`인지, `/est-status`가 `enabled:false`·`hold:"disabled"`인지 확인 필요(코드·시험으로는 확인됨). 과거 PR 브랜치에서 Workers Builds가 0초 만에 실패한 적이 있다 — main 결과 확인.
- 실제 Gemini 경로(호선별 AI 글)는 못 돌려 봤다(시험은 폴백 경로). 폴백은 6개월 중복 금지 때문에 글이 적게 나온다. 배포된 서버에서 방별 글 수가 비중대로 나오는지 확인.
- `S.route.lp`의 노선 이름 형식(`2호선` 등)은 코드로만 확인. 실기기 경로 안내로 `my_lines`가 쌓이는지 확인. lp에서 못 찾으면 `_lrRouteLines()`(검색 결과 1번 경로)로 대체하므로, 다른 경로를 골랐다면 어긋날 수 있다.
- 노선 칸이 빈 공지 33건은 엔진에서 어느 노선에도 표시되지 않는다(고치지 않음). ride_log는 **0건**(역 이름이 없어 역별 편차는 못 냄).
- 지연 추정을 다시 켤 때 확인할 것(지금은 꺼짐): 서울 `realtimePosition` 실호출·필드명(`statnNm, trainNo, updnLine, recptnDt, lstcarAt`)·BUSAPI 내부 경로, 서울 키 일일 한도(주석상 키 1개 1,000건, 앱 도착정보와 공유), `tt`가 일반열차만의 간격인지, 기준선 방식의 오탐(공항철도 직통·일반 혼합, 경의중앙·수인분당 분기), 판정 구간·임계값(YJ 규칙+해석의 합).

## 6. 남은 과제 (우선순위 없이)
1. **한국 IP 중계로 서울 실시간 복구** → 그 뒤 `EST_ENABLED=1`(4번 순서). 중계 방식은 YJ 결정.
2. **앱 도착정보가 실시간인지 시간표 폴백인지 확인** — 서울 `/seoul`이 막혀 있으면 시간표로 동작할 것으로 보인다. 실기기에서 확인.
3. **경로 검색 지연 프로파일링**(0.6~2.4초).
4. **환승 보정**: ride_log n≥30, 환승 1회 이상, 일관된 2분 내외일 때만 역별 편차로. `xfer_pos.secs` 평균(255초)을 통째로 쓰지 말 것. ride_log가 0건이라 보류.
5. **다음 승차 실기기 검증(가장 중요)**: 기록 모드를 켜고 ① 탑승 중 재탐색이 없는지(`경로 N역 시작`이 안 나오는지) ② 마커·오버레이·혼잡도 카드가 PF 위치와 같은지(`PF채택` 로그) ③ 승강장에 이미 서 있다가 일찍 탄 열차를 `승차확정`으로 잡는지 ④ 백그라운드 갔다 와도 재탐색 안 되는지 ⑤ 역방향(잠실→강변) ⑥ 계양→잠실 69분 도착 예상이 실제 14:01 과 맞는지 ⑦ 환승 1~2정거장 전 무지개 하이라이트를 확인한다.
5-1. **남은 개선(검토에서 지적, 미수정)**: ⓐ 목록 카드 분(69/72)과 세부경로 분(65) 불일치 — 엔진 총합에 첫 도보가 포함됐을 가능성, 원인 미확정 ⓑ 'PF 채택' 사이 구간의 주기적 지연 재계산 없음(검토 #8) ⓒ 남은 시간 '8분' vs 승차 '16분' 라벨 혼선 ⓓ 주황 대기 배지의 카드 밖 잘림 CSS(탑승 중엔 숨기기만 함) ⓔ 잠금(`_routeLocked`)이 아닌 경로는 PF 가 꺼져 옛 로직으로 동작(재탐색 방어는 `_ev` 표본으로 유지됨) ⓕ 맛집 버튼은 장소 ID 가 아니라 이름 검색.
6. **키·토큰 정리** — 기능 작업이 끝난 뒤. 앱에 새 키를 넣지 않는다. (YJ가 "이번에는 패스"라고 했다.)
7. subway-app의 옛 브랜치 `claude/jolly-darwin-dtzab9`(`ac3e4ff` 등) 삭제 — **YJ 지시를 기다릴 것.**
8. 선택: 사용자가 적은 노선(GTX-A 등)의 AI 글이 너무 적거나 어색한지 배포 서버에서 확인.

## 7. 테스트·빌드 확인 방법
- 앱 문법: `www/index.html`의 인라인 `<script>`를 `new Function`으로 검사(`type="text/x-metro-svg"` 블록은 JS가 아니라 제외).
- 앱 화면(헤드리스, 서버만 모의, 외부 요청 전부 차단, Playwright `/opt/node-tools/node_modules/playwright` + Chromium `/opt/pw-browsers/chromium-1194`): `node test/chat_line_tabs.ui.test.js [스크린샷 폴더]`(21건) · `node test/ride_evidence.ui.test.js [html 경로]`(19건, 약 4분 — 백그라운드로 실행: 재탐색 차단·승차 증거·69분 시나리오·역방향·버튼·가속도 삭제 확인). 첫 실행 위치 안내 팝업(`locDiscOv`)은 시험에서 '확인'을 누른 상태로 시작한다.
- 중계: `node worker/test/seoul_relay.test.js`(13건, subway-app). 엔진: `node test/est_delay.test.js`(75건) · `node test/est_line_notices.test.js`(통합) — route-v2. 모의 위치·KV·BUSAPI라 네트워크가 필요 없다. board-writer: `node --check board-writer/index.js`, `node:sqlite`로 D1을 흉내 낸 모의 env로 `scheduled()`·`/talks`·`/lroom`·`/react`를 호출(Node 22).
- 빌드: main push → `Build APK` 자동. 다른 브랜치는 Actions → Run workflow. 성공하면 `subway-app-debug` 아티팩트. 서명 릴리스(AAB)는 시크릿이 있을 때만.
- Code 환경 제약: 아웃바운드가 프록시를 거치며 `workers.dev`·`apis.data.go.kr`·`api.cloudflare.com`은 막혀 있다(403). 외부 API가 필요하면 Actions 러너에서 시크릿(`TAGO_KEY`, `CF_API_TOKEN`, `CF_ACCOUNT_ID` — subway-app에만 있음)으로. 키·본문은 로그에 출력하지 말 것.

## 8. 주의·되돌릴 것
- **AI 승무원 문구는 건드리지 말 것.** 승차·대기 분할, 경로 선택 이유, 문 위치 팁은 경로 카드에만 있다 — AI 승무원에 다시 넣지 않는다(중복 금지).
- **개발자용 진단 카드 주석 블록 안에 `<!-- -->`를 넣지 말 것**(3번 사고 참고).
- 임시 파일: `ntce-lines.yml`(공지 분포 집계)은 삭제함 — 필요하면 git 히스토리 `5772a90`/`7bb6764`. Cowork 작업 폴더의 `relay.js` 초안은 저장소에 없다. 로컬 시험 스크린샷은 저장소에 없다.
- 코드 주석에 `2026-10-05`로 적었던 날짜는 오기였고 `2026-10-04`로 정정했다.

- 줄바꿈: `www/index.html`·`HANDOFF.md`는 LF(파일 끝 CRLF 한 줄만 예외). 커밋 도구가 CRLF 로 바꾸지 않았는지 올린 뒤 sha256/`CR` 개수로 확인.
