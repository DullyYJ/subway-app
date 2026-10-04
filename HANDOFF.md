# HANDOFF (길동무 앱 + 엔진) — 작업 묶음이 끝날 때마다 이 파일 하나를 갱신한다

**마지막 갱신: 2026-10-04 (KST 낮)** · 다음 Claude는 이 파일부터 읽고, 아래 "주의·원칙"을 지킨다.

## 0. 현재 상태 한눈에
| 대상 | 버전·커밋 | 상태 |
|---|---|---|
| 앱 `DullyYJ/subway-app` main | 마지막 앱 동작 변경 `2c883e0`(가속도계 보조화). 그 뒤는 주석 날짜 정정+이 문서뿐 | Build APK #747(`2c883e0`) 성공 — 아래 5번 표 참고 |
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
**승차 판정 (`detectBoardingState`, `www/index.html`)** — 상태 `idle → station_enter → boarding → arrived`
- 주 근거는 **GPS(속도 ≥2.5m/s · 역사 이탈+8m 이동 · 1회 20m 이동), 기지국(셀 변화, `_cellMovingState`), 시각표(예정 출발시각 경과, `_htlMinPastDeparture`)**.
- **가속도계(`_accel`/`_accelState`)는 보조 지표다.** `station_enter` 분기에서 확정 규칙: `GPS 근거` 단독 **또는** `가속도계 train` + (`기지국` 또는 `시각표`). 가속도계 단독은 확정하지 않는다. 가속도계가 위 근거와 함께일 때만 문구에 `· 진동 보조`가 붙는다(예: `속도감지 · 진동 보조`, `기지국 · 진동 보조`, `시각표 · 진동 보조`). `진동감지` 단독 문구는 없다. boarding 중 배너는 `이동 중 (진동 보조)`.
- 기지국+시각표로 승차를 확정하는 길은 **대기 모드 `_htlBoardWatch`**(승차역 이탈 / 출발시각 경과+위치 없음 / 출발 후 셀 2회 이상 변화)에 따로 있고 이번에 바꾸지 않았다. 수동 탑승 버튼 경로(`boardingState='boarding'`을 직접 세팅하는 곳들)도 그대로.
- 승차 확정 뒤 `_startTimetableAdvance` → 시각표 타이머 전진, `_doTimetableAdvance`는 지연 측정만 담당(건드리지 말 것). 도착 판정의 `accelSt !== 'train'`도 그대로.
- **별개의 두 번째 가속도 시스템**이 있다: `_pf*`(Capacitor Motion 플러그인, 위치 융합의 정차/주행 판정, `www/index.html` 46399줄 근처). `_accel`과 무관하며 이번에 안 건드렸다. 그리고 Watchdog 쪽 주석에 "가속도계 제거 — 핸드폰 위치 따라 오판 빈발"이 있다(38781줄 근처) — 가속도계는 위치에 민감하다는 선행 경험이다.
- 로그: 판정 때 `[승차판정] <근거> (GPS/기지국/시각표/가속도계)`를 콘솔에 남기고 `window._lastBoardDecision`에 보관한다.

**커뮤니티 > 실시간소통**
- 상단 칩 4개(실시간소통·게시판·뉴스·설정), 스와이프 순서 그대로. 맨 아래 줄 = `전체` + **모든 호선 칩**(`_LR_KNOWN` 18개: 1~9호선, 신분당·수인분당·경의중앙·공항철도·경춘선·GTX-A·인천1·2호선·김포골드라인) 가로 스크롤. **내가 탄 노선(`my_lines`, 경로 안내 시작 때 `startTracking()`→`_myLinesRecord()`가 기록, 많이 탄 순)은 앞쪽에 `📍`+굵은 테두리.** 안내문구 `📍 내가 탄 노선은 앞에 표시돼요`(탄 노선 없을 때만).
- 호선 방: 읽기 `GET /lroom?line=<호선>&since=<ts>`(6초마다), 쓰기 `POST /react {nick,text,line}`(AI 반응이 그 방에 달림), 제보 `POST /lroom`, 신고 `POST /lreport`, 경보 `GET /lalerts`. **`/talks`는 `line` 파라미터를 읽지 않는 "전체 모아보기"**(앱은 `?since=&limit=`만 쓴다). 전체 방에서만 닉네임 앞 `(N호선)`. 전체에서 쓴 글은 가장 많이 탄 노선 방으로 전송.
- 빈 방: `아직 {호선} 방에 글이 없어요. 첫 글을 남겨보세요!`, 로딩 `불러오는 중…`, 실패 `연결이 불안정해요…`. 공식 공지 줄(`_lrRenderOfficial`)·지연/혼잡 제보·신고는 호선 방 안에 그대로.
- 서버: board-writer가 20분마다 호선별 AI 대화를 만든다(`generateLineTalks`, 노선 비중 `LR_AI_ROOMS` 2호선 10 … 인천2호선 1, 지연·혼잡 제보는 만들지 않음, AI 글 2일 뒤 삭제). `/react`의 AI 반응은 IP당 시간당 12회 제한(넘으면 429이지만 글은 `stored:true`로 저장).

**공식 공지** — 엔진 `/line-notices`(서울교통공사 공지 API 1~8호선). 앱 `_lrRenderOfficial`: 공지 있음=`🚇 서울교통공사 공지 …`, 1~8호선 공지 없음=`✅ N호선 정상 운행 중입니다 (방금 확인)`, 경의중앙선·공항철도=`환승역 관련 공지만 가끔 올라와요`, 그 밖의 노선=`공식 공지 연동 전이에요`. 공지가 해제되면(엔진 `NTCE_RESOLVED_RE`) 자동으로 '정상 운행' 문구로 바뀐다. 공지 API 과거 300건 실측: 1~8호선이 거의 전부, 그 외 경의중앙선 4건·공항철도 3건뿐.

**지연 추정(도착 간격 기반) — 현재 중단 (YJ 결정)** — 상세는 4번.

## 3. 이번 세션(2026-10-04)에 한 일
**Code 클로드 (이 저장소 커밋)**
- subway-app `2c883e0` — **가속도계를 승차 확정 지표에서 보조 지표로**(위 2번 구조). `www/index.html`: `detectBoardingState` 확정 규칙 변경·문구 변경, `_accelStats()`(읽기 전용 요약)·직접 측정 도구 추가, 설정에 `📳 가속도계 측정 (보조 지표)` 카드(측정 시작 90초 / 지금 상태 / 중지: 상태 train·walk·still·unknown, stddev, 평균, 샘플 수·Hz, 임계값, 마지막 승차 판정 근거, 끝나면 상태 비율·stddev 최소/중앙/90%/최대 요약). `_bgDiag`에도 같은 줄 추가. 시험 `test/accel_auxiliary.ui.test.js` 20건. **수집(`_onDeviceMotion`)·상태 판정(`_accelState`)·임계값·로그·시각표 타이머·`_doTimetableAdvance`·`_htlBoardWatch`·기지국 전진은 한 줄도 바꾸지 않았다**(diff로 확인).
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

## 5. 확인 안 된 것 · 가속도계 타당성 검토
**빌드**
| 커밋 | Build APK | 결과 |
|---|---|---|
| `18ef908`(subway-app#1 병합) | #734 | 성공 |
| `60eb8d7` | #735 | 성공 |
| `6b5d2fe`(하단 호선 탭) | #743 | 성공 |
| `c26e5ea` | #746 | 성공 |
| `2c883e0`(가속도계 보조) | **#747** | 성공 (2026-10-04 확인) |
| 이 문서+주석 날짜 정정 커밋 | **#748** | 성공 (2026-10-04 확인). 문서·주석만 바뀜(동작 동일) |

**가속도계(`_accel`) 타당성 검토 결과 — 보조 지표로 낮춘 이유와 한계**
- 임계값(`TRAIN_THRESH` **1.8**, 도보 **0.8**)은 **실측값이 아니라 코드 주석의 추정**이다("도보 0.5~1.0, 열차 1.5~4.0"). 그래서 **걷기 오탐 가능성**이 있다(도보 stddev가 1.8을 넘는 사람·걸음이 있다). `STILL_THRESH`(**0.4**)는 정의돼 있지만 **`_accelState`가 쓰지 않는다** — 0.8 미만은 모두 `still`.
- 판정 창이 **최근 10샘플(기기에 따라 약 0.2초)**로 매우 짧아 순간 흔들림에 민감하다. 최소 8샘플 미만이면 `unknown`.
- **열차 출발·정차 때의 앞뒤(수평) 가속은 보지 않는다**(전체 가속도 크기의 stddev만 본다). 지하철 승차의 가장 뚜렷한 신호(출발 가속·제동)를 쓰지 않는다.
- **부드러운 구간의 열차 진동은 작아서 미탐**(train으로 안 잡힘)할 수 있다. 기기를 어떻게 들고 있는지(손/주머니)에 따라 크게 달라진다(Watchdog 주석의 "가속도계 제거 — 핸드폰 위치 따라 오판 빈발"과 같은 맥락).
- 그래서 **단독 확정을 없애고** GPS·기지국·시각표가 있을 때만 보조로 인정한다.
- **YJ가 열차에서 실측해 임계값을 정할 예정.** 방법: 설정 > `📳 가속도계 측정 (보조 지표)` 카드로 (열차 안 / 걷기 / 서 있기)를 각각 90초 측정해 요약(stddev 최소·중앙·90%·최대, 상태 비율)을 받는다. **실측 결과를 받으면 `TRAIN_THRESH`·도보 0.8·창 크기를 조정하고, 필요하면 출발·정차의 수평 가속을 쓰는 방향도 검토**한다. 조정 전에는 임계값을 바꾸지 말 것.

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
5. **가속도계 실측 반영**(5번): YJ 실측 결과를 받으면 임계값 조정.
6. **키·토큰 정리** — 기능 작업이 끝난 뒤. 앱에 새 키를 넣지 않는다. (YJ가 "이번에는 패스"라고 했다.)
7. subway-app의 옛 브랜치 `claude/jolly-darwin-dtzab9`(`ac3e4ff` 등) 삭제 — **YJ 지시를 기다릴 것.**
8. 선택: 사용자가 적은 노선(GTX-A 등)의 AI 글이 너무 적거나 어색한지 배포 서버에서 확인.

## 7. 테스트·빌드 확인 방법
- 앱 문법: `www/index.html`의 인라인 `<script>`를 `new Function`으로 검사(`type="text/x-metro-svg"` 블록은 JS가 아니라 제외).
- 앱 화면(헤드리스, 서버만 모의, 외부 요청 전부 차단, Playwright `/opt/node-tools/node_modules/playwright` + Chromium `/opt/pw-browsers/chromium-1194`): `node test/chat_line_tabs.ui.test.js [스크린샷 폴더]`(21건) · `node test/accel_auxiliary.ui.test.js`(20건: 가속도계 단독 비확정·조합별 확정·문구·수집/상태 보존·설정 카드·숨긴 개발자 카드 보존). 첫 실행 위치 안내 팝업(`locDiscOv`)은 시험에서 '확인'을 누른 상태로 시작한다.
- 중계: `node worker/test/seoul_relay.test.js`(13건, subway-app). 엔진: `node test/est_delay.test.js`(75건) · `node test/est_line_notices.test.js`(통합) — route-v2. 모의 위치·KV·BUSAPI라 네트워크가 필요 없다. board-writer: `node --check board-writer/index.js`, `node:sqlite`로 D1을 흉내 낸 모의 env로 `scheduled()`·`/talks`·`/lroom`·`/react`를 호출(Node 22).
- 빌드: main push → `Build APK` 자동. 다른 브랜치는 Actions → Run workflow. 성공하면 `subway-app-debug` 아티팩트. 서명 릴리스(AAB)는 시크릿이 있을 때만.
- Code 환경 제약: 아웃바운드가 프록시를 거치며 `workers.dev`·`apis.data.go.kr`·`api.cloudflare.com`은 막혀 있다(403). 외부 API가 필요하면 Actions 러너에서 시크릿(`TAGO_KEY`, `CF_API_TOKEN`, `CF_ACCOUNT_ID` — subway-app에만 있음)으로. 키·본문은 로그에 출력하지 말 것.

## 8. 주의·되돌릴 것
- **AI 승무원 문구는 건드리지 말 것.** 승차·대기 분할, 경로 선택 이유, 문 위치 팁은 경로 카드에만 있다 — AI 승무원에 다시 넣지 않는다(중복 금지).
- **개발자용 진단 카드 주석 블록 안에 `<!-- -->`를 넣지 말 것**(3번 사고 참고).
- 임시 파일: `ntce-lines.yml`(공지 분포 집계)은 삭제함 — 필요하면 git 히스토리 `5772a90`/`7bb6764`. Cowork 작업 폴더의 `relay.js` 초안은 저장소에 없다. 로컬 시험 스크린샷은 저장소에 없다.
- 코드 주석에 `2026-10-05`로 적었던 날짜는 오기였고 `2026-10-04`로 정정했다.

