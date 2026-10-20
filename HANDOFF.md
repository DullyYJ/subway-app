# HANDOFF (길동무 앱 + 엔진) — 작업 묶음이 끝날 때마다 이 파일 하나를 갱신한다

**마지막 갱신: 2026-10-19 (KST) — 맨 아래 "2026-10-19 엔진 s49 — 환승완료 규칙·12초 정차·:30 도착·버스 GPS(네비식)·영점 5초·위치감지 재탐색" · 그 앞 "2026-10-19 서버 구동 네이티브 화면 8호 — 홈 탭 경로 입력 카드(s48)" · 그 앞 "2026-10-19 엔진 s47 짧은 버스 한 구간 → 걷기" · 이전: "2026-10-18 (밤 10) 서버 구동 네이티브 화면 5·6·7호(게시판·실시간소통·하단 탭 막대)" · 이전: "2026-10-18 (밤 9) 서버 구동 네이티브 화면 4호(커뮤니티 > 뉴스)" · 이전: "2026-10-18 (밤 8) 서버 구동 네이티브 화면 3호(맛집)" · 이전: "2026-10-18 (밤 5) 서버 구동 네이티브 화면 1호(쇼핑)" · 이전: "2026-10-18 (밤) 엔진 s40·엔진 원본 백업·전 노선 점검·GPS 영점 보수화·혼잡도 카드 네이티브" · 이전: 맨 아래 "09:21 추가(캐릭터 잡기·문구 통일·엔진 s30)" · 이전: 맨 아래 "07:43 추가(한 화면 맞춤·엔진 s29)" · 이전: 맨 아래 "06:00 추가(장면 세로 확장·제목줄 문구, 엔진 s28)" · 이전: 맨 아래 "22:32~23:05 추가(혼잡도 장면·/scene s27)" · 이전: 맨 아래 "11:49 추가(캐릭터 시계 위젯)" 참고 · 이전 2026-10-14 "2026-10-14(5)" · 이전 갱신 2026-10-06** · 다음 Claude는 이 파일부터 읽고, 아래 "주의·원칙"을 지킨다. **작업 3·4(서구청→서해구청 표기, 번들 누락역 추가)는 [`HANDOFF-작업3-4-서해구청-누락역.md`](HANDOFF-작업3-4-서해구청-누락역.md)로 넘겼다.** **2026-10-06 세션의 최신 변경(엔진 인천2호선 수정 06a~d, 총시간/타임라인 정합 06e·06f, 라이브 스윕 시험, 앱 셀 수정, 시험·시뮬 하네스, 작업 방법·남은 일)은 [`HANDOFF-2026-10-06.md`](HANDOFF-2026-10-06.md)에 있다 — 함께 읽을 것. 원칙: 모든 결정은 엔진이, 앱은 그리기만.**

## 0. 현재 상태 한눈에
| 대상 | 버전·커밋 | 상태 |
|---|---|---|
| 앱 `DullyYJ/subway-app` main | 마지막 앱 동작 변경 `fc0a74a`(자동 확정 오탐 방지·승강장 늦은 열차 4분 유예). 그 앞 `fd48d76`이 경로 미확정 시 탑승 감지 자동 확정·카카오 장소 ID 직링크·네이버 좌표 검색, 그 앞 `df32cdb`가 분 표시 통일·승차/대기 합 보정·'분 남음'·주황 배지·역 사이 지연 반영, 그 앞 `43e816b`가 재탐색 차단·PF 단일 위치원·복합 승차판정·가속도계 삭제. 그 뒤는 시험 파일과 이 문서뿐 | Build APK #759(`df32cdb`) 성공, `fd48d76` #762, `fc0a74a` #765 성공. **실기기 검증은 아직 안 함(다음 승차에서)** |
| 엔진 `DullyYJ/route-v2` main | `ENGINE_VERSION = route-v2-2026-10-06f` (06e·06f 총시간/타임라인 정합 + 라이브 스윕 시험 `test/live_sweep.js` — `HANDOFF-2026-10-06.md` 2-1·3-1b; 인천2호선 중간역 누락 수정 06a~d; 그 앞은 05g 버스 실측 `예상` 줄이기 — 3-1번) | main push 시 Cloudflare Workers Builds 자동 배포. 지연 추정은 `EST_ENABLED` 꺼짐 |
| board-writer (`route-v2/board-writer/index.js`, main) | 신버전(호선 방 `line` 저장·`/talks` 모으기·호선별 AI 글) | **대시보드에 배포됨** — Cowork 클로드 확인: `/talks` 항목에 `line` 필드·`L숫자` id, `/lroom?line=…` 정상, 경춘선·GTX-A는 빈 방으로 열림 |
| 중계 gentle-lab (`subway-app/worker/index.js`) | 강화 코드(재시도·키 정리·진단) + **한국 IP 중계 수신부(`/relay/wanted`·`/relay/push`, 4-1번)** | 강화 코드까지는 **대시보드에 붙여 넣어 배포됨**(YJ가 Deploy). **수신부도 배포됨**(`RELAY_TOKEN` 등록·Deploy 완료, 응답 헤더 `x-seoul-cache: RELAY` 확인 — 3-1번). `SEOUL_DEBUG` 변수는 진단 후 YJ가 삭제. 배치(Placement)는 AWS ap-northeast-2로 바꿨으나 swopenapi 차단에는 효과 없음 |

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
- **총 소요 분 통일(`df32cdb`)**: 카드 숫자·`전체 N분 · 승차 · 대기 · 도보·환승` 줄·AI 승무원 예상시간이 모두 **화면 타임라인의 총 소요**(`_renderHtlTrack`이 `window._htlTlTotalMin = (끝 시각 − 탐색 기준시각)/60000` 으로 기록, 엔진 `totalTime`과 15분 넘게 다르면 엔진 값 유지)를 따른다. 원인: 엔진 총합은 앱이 얹는 지하철 시각표 대기(`_ttShiftMs`)·구간 사이 틈을 몰라 카드 69분 / 분리 합 65분 / 타임라인 72분처럼 따로 놀았다. `_routeTimeSplit`은 구간 합이 총 소요보다 작으면(15분 이내) 모자란 만큼을 **대기**에 더한다. 이동 중에는 헤더 단위가 `분 남음`으로 바뀐다(`transitResultMinUnit`, `_updateRouteRemaining`) — 분리 줄은 '처음 계획 전체'라 `전체 N분`을 앞에 붙여 구별.
- **역 사이 지연 반영(`_pfOverdueShift`, `_pfTick` 끝에서 호출)**: 탑승 증거가 있고 PF가 채택한 역(`_pf.A.td`) 다음 역의 예정 시각 + 60초가 지났는데 PF가 그 역 이후라고 보지 않으면(`_pfBest.td < 다음 역` 또는 확신 50% 미만), 다음 역을 '지금 + 30초'로 미루고 그 뒤 시각을 같은 만큼(최대 15분) 민다. 20초에 한 번만, **앞당기지는 않는다**(당김은 PF 채택 때 `_recalcArrivalsFrom`/`_htlSanityCheck`). 로그 태그 `지연반영`. 이로써 늦는 열차에서 남은 시간이 0분에 굳지 않는다.
- 주황 대기 배지(`.htl-wait-badge`): 역 이름 줄(30px)과 겹치던 것을 노선 줄(18px) 높이 안(`top:-18px; height:12px`)에 들어가게 줄였다. 시험이 이름 줄과 안 겹치고 카드 안에 있음을 확인한다. 실기기 확인 필요.
- 표시 수정: 시각 `13:60` 오류(분 올림) 수정, 혼잡도 카드 라벨이 지하철에서 `버스`로 남던 것(`updateCong`에서 라벨 리셋), 환승 이동 `도보 0m` → `환승 이동`, 알림 ETA는 알림 노드의 `arrTime`에서 계산, 탑승 중 주황 대기 배지 숨김.
- 로그 태그(`_ovlDiag`/`_evLog`): `승차판단`(탑승 증거 확인·초기화·미탑승 증명 정지), `승차확정`(대기 모드에서 확정, 근거와 출발 경과), `PF채택`(역 전진 때 PF 위치·신뢰도·지연). 기록 모드 로그에서 이 세 줄로 이번 개편의 동작을 대조한다.
- 맛집 탭: 카카오/네이버 버튼은 길찾기가 아니라 **가게 상세·리뷰**를 연다(`_placeInfo`: 앱 `nmap://search`·`kakaomap://search` → 웹 `map.naver.com/p/search/…`·`map.kakao.com/link/search/…` 폴백). 길찾기는 `_navBtnsHtml`로 별도 버튼(`네이버 길찾기`·`카카오 길찾기`)으로 남겼다. **카카오**는 `_placeKakaoId(name,lat,lng)`가 `_kakaoLocal('search/keyword.json')`(반경 500m·거리순)으로 같은 이름(정규화 후 일치·포함) 가게를 찾아 ID 를 얻으면 `kakaomap://place?id=ID`/`https://place.map.kakao.com/ID`로 가게 페이지를 바로 연다(4초 제한, 캐시, 실패·`_kakaoDead`면 검색으로 폴백). **네이버**는 장소 ID 를 얻을 방법이 없어 검색으로 열되 좌표 편향(`nmap://search…&lat&lng&zoom=17`, 웹 `?c=17.00,lng,lat,…`)을 줘 같은 이름의 다른 지점이 앞에 오지 않게 했다 — 네이버 직링크는 불가(한계).
- **경로 미확정 자동 확정(`_autoLockOnRide`, 46924줄 근처)**: '경로 확정'을 안 누르면 `_routeLocked`가 false 라 추적·PF·시각 보정이 모두 꺼졌다. `_pfTick`의 미확정 분기가 이 함수를 부른다. 조건: 미확정·지하철 경로(노선도 미리보기·예상 모드 아님)·`_lastHtlNodes` 있음, 지금 실제 이동 증거(`_rideEv().now`), 승차역 400m 안을 지났음(`_evNearNode`), 승차 예정 −15분~+25분 안, 마지막 시도 60초 뒤. 만족하면 `_routeLocked=true`, `_lockedRouteType=_pendingRouteType||'fast'`, 버튼 문구 '탑승 감지로 확정됨', 토스트, `_beginJourneyTracking()`, `_pipArmNow()`, 로그 `자동확정`. 서 있거나 승차역에서 멀면 확정하지 않는다. **2026-10-04 보강(`fc0a74a`)**: ① `_evTowardNext(bi)` — 승차역 근처 점에서 다음 역 쪽으로 150m 이상 가까워졌을 때만 확정(반대 방향·다른 길이면 안 함). ② `_autoLockVerify`(`_pfTick` 확정 분기에서 호출) — 확정 뒤 5분(아직 이동 중이면 10분) 안에 `_htlBoarded` 또는 `_gpsMaxIdx>승차역`이 안 보이면 오탐으로 보고 `_routeLocked=false`·버튼 문구·`S.boarded` 복원·토스트·로그 `자동확정 취소`(5분간 재확정 금지). 사용자가 직접 확정하면(`confirmSelectedRoute/confirmCurrentRoute`가 `_autoLockInfo=null`) 검증·취소 대상이 아니다.
- **승강장에서 늦은 열차 기다리기(`fc0a74a`)**: 승차역 300m 안·미승차(`_platformWaiting`)면 예정 출발 후 4분(`_PLAT_GRACE_MIN`)까지는 '놓쳤다'(재동기화·재탐색 3곳 + `_etaResearchIfStale`)로 보지 않고(`_platGrace`) `_platformLateShift`가 승차역·이후 시각을 20초 간격으로 '지금+30초'로 민다(로그 `지연반영 승강장 대기 중`). 유예(원래 예정 기준 4분)가 지나도 안 타면 기존대로 정지 증명(`_missProof`)이 있을 때 놓침 처리. 원래 예정 시각은 `_platDep0`에 보관.
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
- 시험: `test/ride_evidence.ui.test.js`(처음 19건, 이후 24건, 30건, 현재 35건)를 추가하고 `test/accel_auxiliary.ui.test.js`는 삭제(이력에 있음). 시나리오: 승차역에서 3분 서 있어도 승차증거 없음·정지 증명, 역방향(경도 감소) 17:10 마커가 역을 지나치지 않음, **23역·188초 간격 69분 시나리오에서 재탐색 0회·남은 시간 0~2분**, 그려 둔 지 1시간이 지난 경로도 `_etaResearchIfStale` 가 탑승 중엔 재탐색 안 함, 앱 복귀 재탐색 없음, 맛집/네이버 버튼, `13:60` 잔존 여부, 가속도 코드 삭제 확인.
- 코드 검토에서 나온 논리 오류는 모두 고쳤다(증거 캐시의 시각 역행 등). 검토가 지적했으나 **안 고친 것**은 6번 목록.
- **커밋 방법(이 환경 제약)**: 6.7MB 파일은 GitHub 편집기가 안 열린다. 내장 브라우저(GitHub 로그인된 DullyYJ)에서 `POST /DullyYJ/subway-app/tree-save/main/<경로>`(필드: message, placeholder_message, description, commit-choice=direct, target_branch=main, quick_pull, guidance_task, commit=현재 head oid, same_repo=1, pr, content_changed, filename, new_filename, value, authenticity_token; 헤더 accept json·github-verified-fetch true·x-fetch-nonce·x-requested-with)로 저장한다. 토큰·oid 는 편집 페이지 `script[data-target="react-app.embeddedData"]`. 새 파일은 `/create/main/<폴더>`(파일명에 폴더를 넣으면 최상위로 올라간다 — 폴더 경로로 POST 하고 이름만 넣을 것, 잘못 올리면 `new_filename`으로 이동 가능), 삭제는 `DELETE` 로 `blob/main/<경로>`. **함정: Chrome FormData 멀티파트가 값의 LF 를 CRLF 로 바꾼다 → LF 파일은 `Blob`으로 멀티파트 본문을 직접 만들고(파트 사이만 `\r\n`) content-type 헤더에 boundary 를 지정.** 올린 뒤 `raw/main/…` 를 sha256 으로 대조한다.
- 장기 시험 실행: `nohup node test/ride_evidence.ui.test.js <html 경로> &`(약 4분, 포그라운드로는 시간 초과).

**2026-10-05 추가 (Cowork 클로드)**
- 맛집 카드(`_foodShowMap`) 하단의 네이버·카카오 길찾기 버튼 제거(리뷰·정보 버튼만 유지, YJ 요청 — 리뷰 화면에서 길찾기 가능). 정류장 지도(`_busShowMap`)의 길찾기 버튼과 `_navBtnsHtml` 함수는 그대로. 앱 `a5d6e61`(Build #788 성공).
- 서울 버스 실시간 도착: route-v2 엔진 05k(`7879aa6`, 05j `15d80ed`에서 한도 휴식 20분→5분) — `fetchSeoulArrivals`(서울시 버스도착정보 `ws.bus.go.kr/api/rest/arrive/getLowArrInfoByStId`, 같은 공공데이터포털 키, traTime 초). SEL+9자리 정류장만 조회(서울 stId 는 형제 id 규칙 적용 금지). 한도 응답이면 키2, 둘 다면 5분 휴식, 끄기: 환경변수 `SEOUL_BUS_LIVE=0`. 시험 `route-v2/test/seoul_live.test.js` 9건. 임시 진단 `/seoul-bus-test` 는 삭제함. 실측: 시청→강남 경로에서 `liveStat.via=seoul`, 472번 `waitLive`, `liveMissing 0`. 남은 것: 경기 버스(GGB, 경기버스정보 API 15080346 승인·시험 필요), 서울 하루 1만건 한도(사용자 늘면 키2·휴식 로직이 흡수, 초과 시 '예상' 유지).

- 경기 버스 실시간 도착: route-v2 엔진 05l~05n(`250f59a`·`0ed39e1`·`b72a9e2`) — 경기도_버스도착정보 v2(`apis.data.go.kr/6410000/busarrivalservice/v2/getBusArrivalListv2`, 같은 공공데이터포털 키 승인됨, v1 `getBusArrivalList` 는 폐기). GGB+9자리 정류장을 `stationId`로 조회, 응답 `busArrivalList[]`의 `routeName`·`predictTime1/2`(분 단위 — 초×60으로 환산, 최대 1분 오차)·`flag`(STOP 이면 제외). `tagoFetch(env, qs, baseUrl, parseFn, hedgeMs)` 의 길 경쟁(직접 vs 바인딩, 경기는 300ms 뒤 바인딩 추가)을 재사용, 실패하면 기존 TAGO 경로로 한 번 더. 경기 정류장은 형제 id 호출 안 함(호출 상한 30 소진 방지). 끄기: `GBIS_BUS_LIVE=0`. 시험 `test/gbis_live.test.js` 8건. 실측: 수원 경로에서 `via=gbis-env-key`, 92번 `waitLive`, `liveMissing 0`. **남은 문제**: Cloudflare→apis.data.go.kr 직접 호출이 간헐적으로 막혀(차단기 `live-breaker`) 일부 요청은 경기·TAGO 모두 '예상'(앱이 12·16·20초 뒤 재조회). 근본 해결은 NCP 중계 확대 검토.
- **엔진 커밋 주의**: `raw.githubusercontent.com/.../main/...` 는 최대 5분 캐시라 방금 커밋한 내용이 안 보일 수 있다 — 수정 기반 파일은 `commits/main/<파일>` 페이지의 최신 oid 로 `raw/<oid>/<파일>` 을 받을 것(캐시본을 기반으로 올리면 직전 커밋이 덮인다. 05k 가 그렇게 덮여 05l 에서 복구함).
- **웹 커밋 줄바꿈 주의**: 깃허브 편집 화면으로 올릴 때 `FormData` 로 보내면 모든 줄바꿈이 CRLF 로 바뀌어 커밋된다(2026-10-05 `www/index.html` 에서 발생 → `90b3f33` 로 복구). 직접 만든 multipart 를 `Blob` 으로 보내되 **`content-type: multipart/form-data; boundary=...` 를 헤더에 직접 지정**할 것(Blob 의 type 만 믿으면 500). 올린 뒤에는 `raw/<oid>/<파일>` 의 sha256 과 `\r` 개수를 확인한다.
- 실시간소통 호선 칩 좌우 스와이프(앱 `1c25b5c`→`90b3f33`, YJ 요청): `_commSwipeStep` 이 실시간소통에서는 칩 순서(`_chatItems()` = 전체 → 내가 탄 노선 → 나머지 호선)로 먼저 이웃 칩을 고르고, 마지막 호선에서 왼쪽으로 밀면 종전처럼 게시판으로 넘어간다. 전체에서 오른쪽은 그대로 멈춘다. 칩 바·입력창·가로 스크롤 영역에서 시작한 스와이프는 기존 `_swipeBlocked` 규칙대로 무시. 시험은 `test/chat_line_tabs.ui.test.js`(24건).
- 엔진 05o(공유 캐시): 같은 정류장 도착정보를 25초 안에 다시 물으면 Cache API 의 직전 성공값을 그대로 쓴다(`LIVE_SHARE_MS=25000`, 끄려면 0). 호출 수·한도를 아끼고 응답이 4.3초→0.6~1.4초로 줄었다. 4분 보관값(`LIVE_STALE_MS`)은 실패 시 대체용으로 그대로.
- 엔진 05p: 서울 한도 휴식(5분) 중인 서울 구간은 `liveMissing` 에서 뺀다(앱이 12·16·20초 재조회를 해도 같은 답이라 헛호출). 05q: 외부 도착정보 API 하루 호출량 계측 — `GET /live-usage?days=N` (항목: `seoul.call/.err/.quota`, `gbis.<경로>(.err)`, `tago.<경로>(.err)`, `share.hit`). 메모리 카운터를 60초마다 D1 `live_usage` 표에 합산. 05r: 표 이름을 `api_usage` 에서 `live_usage` 로 변경(`api_usage` 는 같은 D1 에 다른 구조로 이미 있어 쓰기가 조용히 실패했음). 한도 임박(서울 하루 1만건)을 미리 보려는 내부 진단용이며 사용자 화면과 무관.
- 서울 버스 `busType`(일반/저상) 확인: API 가 노선 전체를 돌려주고(저상 전용 아님) 문제 없음. 연결 예열(cron 으로 data.go.kr 연결을 미리 여는 안)은 isolate 마다 연결이 따로라 효과가 불확실해 하지 않기로 함. NCP 중계 확장(경기 직접 호출 간헐 지연 대응)은 YJ 결정으로 **사용자가 늘면** 진행.

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

## 3-1. 2026-10-05 세션 — NCP 중계 가동 · 버스 '예상' 줄이기
- **서울 실시간 지하철 중계 가동(노트북 대신 NCP 서버):** NCP Micro 서버 `seoul-relay`(Ubuntu 24.04, 서비스 `gildongmu-relay`, 경로 `/opt/subway-app`)가 `tools/seoul-relay/relay.js`로 서울 API를 한국 IP에서 받아 워커에 푸시한다. 워커 `/seoul`은 `x-seoul-cache: RELAY`로 답한다(첫 요청은 `503 relay pending`). 호출은 **05~24시에 하루 1,000건을 고르게** 분산한다. 조절값은 서버 `.env`의 `SERVICE_START_HOUR`·`SERVICE_END_HOUR`·`BURST_MAX`·`DAILY_BUDGET_PER_KEY`, 키는 `SEOUL_API_KEYS`(쉼표로 여러 개). 서버 갱신 순서: `cd /opt/subway-app && git pull && systemctl restart gildongmu-relay && node tools/seoul-relay/relay.js --check`. 추가 서울 키 2개(위치정보·시간표)는 **나중에** `.env`에 쉼표로 붙인다(워커 `SEOUL_API_KEY`와 겹치는지 먼저 확인). `EST_ENABLED`는 꺼둔 채(YJ 결정 대기).
- **NCP 비용:** Micro 1년 무료(2027년 10월 말까지). 공인 IP 월 약 4,032원은 크레딧(2027-01-31까지)이 덮는다. 무료가 끝나면 Micro 월 16,600원(공식 계산기, 디스크 50GB, VAT 별도). 서버를 멈춰도 과금된다. 서버·공인 IP 삭제는 YJ만 한다. 아웃바운드는 월 20GB까지 무료, 초과 GB당 100원.
- **버스 '예상' 줄이기(엔진 `05f`~`05g`):** Cloudflare→apis.data.go.kr(TAGO) 직접 호출이 간헐적으로 522(연결 시간초과, 20~40초)로 막힌다. NCP 한국 IP 중계를 버스에도 쓰는 안은 YJ가 **당분간 안 하기로** 했다(버스는 Cloudflare만). 대응: ① `tagoFetch` 길 경주 — 직접 호출이 `TAGO_HEDGE_MS`(800ms) 안에 안 끝나면 다른 길(바인딩 gentle-lab)만 추가로 부르고 먼저 성공한 답을 쓴다. 키2(`TAGO_KEY2`)는 **키1이 호출량 초과 같은 응답 오류를 낼 때만 순서대로** 쓴다(동시 사용 안 함, YJ 지시). 막힌 길이 판명되면 10분간 성공한 길을 앞에 둔다(`TAGO_PREF`). ② 동시 호출 상한 `LIVE_CONC`=6 ③ 직전 성공값 보관(Cache API, 4분 이내, 지난 시간만큼 보정, 요청당 호출 상한을 다 쓴 경우엔 쓰지 않음) ④ 차단기 `LIVE_BRK_MS`=8초 ⑤ 실측 총시간 `LIVE_BUDGET_MS`=3500, 호출당 `LIVE_TIMEOUT_MS`=1500. 측정(검단→서울 경로): 한 곳 이상 실제 반영된 비율 8회 중 7회(이전 2~5회). 막힘이 심한 순간엔 한 요청이 4~5초 걸린다.
- **05g — 10~20초 뒤 다시 조회:** 엔진 응답 `liveStat.liveMissing` = '조회를 시도했는데 못 받았거나 4분 전 보관값으로 메운 버스 구간 수'. 조회가 닿았는데 노선이 없는 구간, 서울(11)·경기(31xxx) 구간(TAGO 미지원)은 세지 않는다(다시 물어도 같은 답). 앱(Build APK #786~)은 `liveMissing > 0`이거나 실시간 반영본을 못 받은 빠른 응답이면, 화면이 열려 있는 동안 12·16·20초 뒤 **최대 3번** 같은 요청을 `baseMs`를 지금으로 바꿔 다시 보내고(화면 시간축 `_routeBaseMs`도 같이 옮김), 실제값이 더 많아진 응답이 오면 다시 그린다(`_estRetry`, 결과 카드로 스크롤하지 않음). 하지 않는 경우: 기준시각을 직접 고른 탐색, 새 탐색이 시작됨, 이미 탑승, 세부경로 모달이 열림·화면 숨김(잠시 뒤 재확인). 확정한 경로는 타기 전일 때만 같은 유형으로 다시 확정한다. 구엔진(`liveMissing` 없음)에서는 아무것도 하지 않는다. 시험: 노드 모의 6개 시나리오(개선 후 종료·변화 없음·기준시각 지정·구엔진 등)만 — **실기기 미확인.**
- **남은 '예상'의 구조적 원인:** (해결됨 — 서울·경기 버스도 05j~05n 에서 실시간 조회로 연동했다. 지금 '예상'이 남는 경우는 조회 실패·한도 휴식·노선 없음뿐이고, 앱이 12·16·20초 뒤 조용히 다시 조회한다.)
- **TAGO 한도:** 버스도착정보 운영계정 하루 500,000건(YJ 확인). 동시 세션 30개는 앱과 공유.
- 시험 파일: `route-v2/test/tago_hedge.test.js`(11), `live_stale.test.js`(8).

## 4. 지연 추정 중단 (YJ 결정) — 막힌 원인과 다시 켤 조건
- **결정:** 9호선 포함 지연 추정 전체 비활성. 엔진 환경변수 **`EST_ENABLED`가 `"1"`/`"true"`일 때만 켜지고 기본 꺼짐**. 꺼짐 상태: 서울 `realtimePosition`·KV 호출 0건, `/line-notices`에 추정 없음(저장돼 있던 상태도 안 내보냄), `/est-status`는 `enabled:false`와 5개 노선(9호선·신분당·공항철도·경의중앙·수인분당) 모두 `hold:"disabled"`, 앱은 아무것도 표시하지 않음. **1~8호선 공식 공지는 그대로 정상.**
- **막힌 원인:** 서울 지하철 서버(`swopenapi.seoul.go.kr`)가 **Cloudflare 출구 주소를 거부**한다. 코드·진단으로 키/헤더/스킴/Worker 일반 외부 호출 문제는 배제됐다(공개 `sample` 키·http·헤더 변경에도 동일, 같은 Worker의 `/tago`→apis.data.go.kr는 정상, 배치 변경 무효). 이 Code 환경은 서울 서버를 호출할 수 없어 직접 재현은 못 했고 YJ·Cowork의 진단에 따른다.
- **코드는 지우지 않았다.** 판정(같은 방향 인접 열차 간격 ≥ `min(2×배차간격, 배차간격+6분)` 연속 2회 → 의심, 정상 연속 2회 → 해제), 9호선 시간표 기준(`SUBWAY_BUNDLE.lines[*].tt`), 시간표 없는 4개 노선의 기준선(최근 관측 간격 중앙값: 표본 20개·30분 이상 쌓이기 전 보류, 지연 중 표본 제외), 보류 조건(첫차+30분 전·막차−60분 이후·23시 이후·막차 열차·자료 오래됨/부족), 하루 호출 상한 `EST_DAILY_CAP`(기본 400), 거절 시 10분 쉼, `/est-status` 진단이 모두 남아 있다. 진입점 `estimateNotices`·`estimateCached`·`estRefreshLine`·`/est-status`에 스위치 검사. 데이터는 엔진이 `env.BUSAPI`(gentle-lab `/seoul`, 키 `SEOUL_API_KEY`는 gentle-lab 시크릿)로 호출 — 엔진에 새 시크릿 없음, 앱은 직접 호출 금지.
- **다시 켤 조건 = 한국 IP 중계 확보.** 순서: ① 그 중계에서 swopenapi가 200으로 오는지 먼저 확인(Cowork의 `relay.js` 초안 참고) ② gentle-lab `/seoul`의 업스트림을 그 중계로 돌리는 수정(키는 중계/Worker 시크릿에만, 앱에 넣지 않음) ③ Deploy 후 `SEOUL_DEBUG=1`로 `debug=1`의 `hint`·`probes` 확인(끝나면 변수 삭제) ④ 엔진에 `EST_ENABLED=1` ⑤ `/est-status`에서 `enabled:true`, 9호선 `hold` 비고 시간표 없는 노선의 `baseline.samples`가 느는지 확인 ⑥ 며칠간 오탐(`lastMaxGapSec` vs `thresholdSec`)·호출량(`budget.usedToday`) 관찰. 다른 대안: 서울시에 Cloudflare 출구 허용 문의. 앱에서 직접 호출은 키가 앱에 들어가므로 권하지 않는다.
- **같은 중계를 쓰는 기존 기능도 영향:** 앱의 평소 도착정보(`realtimeStationArrival`)와 앱의 `realtimePosition` 기존 기능(RT 진단·구간 열차 위치 `_rtPosParam`)은 `/seoul` 중계를 지나므로 중계가 막힌 동안 실패하고 **시간표 폴백으로 동작**하는 것으로 보인다(확인 필요 — 6번).
- 운영 원칙: **앱은 표시 전용, 처리는 서버에서.** 기존 기능은 반드시 보존. 키·토큰 정리는 마지막.

## 4-1. 한국 IP 중계 — NCP 서버에서 가동 중 (아래 설계는 그대로, 실행 장소만 노트북→서버)
> 2026-10-05: 아래 "노트북"은 NCP 서버 `seoul-relay`로 대체돼 가동 중이다(3-1번). `.env`·`--check`·자동 시작은 서버에서 systemd(`gildongmu-relay`)로 한다.
- 구조: 노트북은 **밖으로만** 호출한다(사용자 요청을 직접 받지 않음). 앱 → `/seoul` → ① 메모리 ② 엣지 캐시 ③ **중계 값(D1 `relay_cache`)** ④ (중계가 죽었을 때만) 옛 직접 호출. 노트북 `tools/seoul-relay/relay.js`는 8초마다 `GET /relay/wanted`(앱이 최근 150초 안에 찾은 경로)를 받아 **없거나 오래된 경로만** 서울 API에서 받아 `POST /relay/push`로 올린다. 값이 신선하면 앱 수만 명이 같은 경로를 찾아도 서울 호출은 1번이다.
- 신선도: 도착정보 75초·위치 90초·기타 30분 이내만 사용. 노트북은 도착 25초·위치 30초 지난 것만 다시 받는다. 중계 소식(heartbeat)이 180초 넘게 없으면 '꺼짐'으로 보고 옛 동작(앱은 정적 시각표)으로 돌아간다. 중계가 살아 있는데 값이 아직 없으면 `503 relay pending`(Retry-After 5)을 주고 그 경로를 '찾는 목록'에 올리므로 **첫 요청은 실패하고 수 초 뒤부터 채워진다**.
- 워커: `RELAY_TOKEN`(16자 이상, 노트북 `.env`와 같은 값) 시크릿이 필요하다. 새 바인딩은 없다(기존 D1 `DB`). 표 3개(`relay_cache`·`relay_want`·`relay_state`)는 첫 호출 때 자동 생성, 24시간 지나면 정리. 한도·키 오류(`ERROR-*`·`INFO-100`)는 올리지 않는다(`INFO-200` 없음 응답은 허용).
- 노트북: 키별 하루 예산(기본 950)을 남은 운행시간에 고르게 쓰고(토큰 버킷), `ERROR-337`/`INFO-100`/`ERROR-336` 때 다음 키로 넘어간다. 상태 `state.json`, 로그 `relay.log`. `node relay.js --check`로 설정·서울 응답(한국 IP에서)·워커 인증을 한 번에 점검한다. 설치 순서는 `tools/seoul-relay/README.md`(Node LTS → `.env` → `--check` → `install-autostart.ps1` → `schtasks /Run /TN GildongmuRelay`). `run-forever.bat`은 라벨 없는 `for /l` 반복문(GitHub가 LF로 저장해도 동작).
- 서울 한도: 실시간 지하철 API는 **키당 하루 1,000건**. 열린데이터광장 '활용사례 갤러리'에 앱을 등록하고 그 키를 쓰면 한도가 풀린다(YJ가 직접). 워커 무료 플랜 요청 상한(하루 10만 건)은 별개의 규모 문제 — 수만 명 규모면 엣지 캐시 히트가 대부분이어야 한다.
- 시험(클라우드, 모의): `worker/test/relay_push.test.js` 8건, `tools/seoul-relay/relay.test.js` 9건(종단 간). **실제 서울 API·노트북 환경은 미검증.**
- 남은 순서: ① 워커 시크릿 `RELAY_TOKEN` 등록 ② 대시보드에 `worker/index.js` 붙여 넣고 Deploy(YJ) ③ 노트북에 Node 설치·`.env`(키·토큰)·`--check`·자동 시작 등록 ④ 앱에서 `x-seoul-cache: RELAY` 확인 ⑤ 4번 순서대로 `EST_ENABLED=1`.

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
| `956aa85`(시험을 test/로 이동) · `16ffdca`(가속도계 시험 삭제) · HANDOFF 커밋 | #756·#757·#758 | 성공 |
| **`df32cdb`(남은 문제 4건 수정)** | **#759** | **성공** (2026-10-04 확인) |
| `da309ca`(시험 5건 추가) | #760 | **성공** |
| **`fd48d76`(자동 확정·카카오 ID)** | **#762** | **성공** (2026-10-04 확인) |
| `0a62dad`(시험 30건) | #763 | **성공** (APK 는 `fd48d76` 과 같은 앱) |
| **`fc0a74a`(자동 확정 보강·승강장 유예)** | **#765** | **성공** (2026-10-04 확인) |
| `3f811e8`(시험 35건) | #766 | **성공** (APK 는 `fc0a74a` 와 같은 앱) |

**가속도계(`_accel`) — 삭제됨(2026-10-04 저녁).** 실측으로 열차 구간 stddev 가 임계(1.8)의 1/10 수준이라 판정 근거가 될 수 없음이 확인됐다(2번·3번). 앞의 '보조 지표'(`2c883e0`, #747·#748) 도입분과 설정의 측정 카드도 함께 지웠다. **되살리지 말 것** — 위치 증거는 GPS·기지국·PF 이다. 옛 시험은 `test/accel_auxiliary.ui.test.js`(이력 `2c883e0`)에 있다.

**그 밖의 미확인**
- 엔진 04bw 자동 배포 결과: Code 환경은 Cloudflare·workers.dev에 접속할 수 없어 못 본다. 루트 `version`이 `route-v2-2026-10-04bw`인지, `/est-status`가 `enabled:false`·`hold:"disabled"`인지 확인 필요(코드·시험으로는 확인됨). 과거 PR 브랜치에서 Workers Builds가 0초 만에 실패한 적이 있다 — main 결과 확인.
- 실제 Gemini 경로(호선별 AI 글)는 못 돌려 봤다(시험은 폴백 경로). 폴백은 6개월 중복 금지 때문에 글이 적게 나온다. 배포된 서버에서 방별 글 수가 비중대로 나오는지 확인.
- `S.route.lp`의 노선 이름 형식(`2호선` 등)은 코드로만 확인. 실기기 경로 안내로 `my_lines`가 쌓이는지 확인. lp에서 못 찾으면 `_lrRouteLines()`(검색 결과 1번 경로)로 대체하므로, 다른 경로를 골랐다면 어긋날 수 있다.
- 노선 칸이 빈 공지 33건은 엔진에서 어느 노선에도 표시되지 않는다(고치지 않음). ride_log는 **0건**(역 이름이 없어 역별 편차는 못 냄).
- 지연 추정을 다시 켤 때 확인할 것(지금은 꺼짐): 서울 `realtimePosition` 실호출·필드명(`statnNm, trainNo, updnLine, recptnDt, lstcarAt`)·BUSAPI 내부 경로, 서울 키 일일 한도(주석상 키 1개 1,000건, 앱 도착정보와 공유), `tt`가 일반열차만의 간격인지, 기준선 방식의 오탐(공항철도 직통·일반 혼합, 경의중앙·수인분당 분기), 판정 구간·임계값(YJ 규칙+해석의 합).

## 6. 남은 과제 (우선순위 없이)
1. **서울 실시간 지하철은 NCP 중계로 복구됨(3-1번).** 남은 것: 추가 서울 키 2개 등록, `EST_ENABLED=1` 여부는 YJ 결정(4번 순서). 서울·경기 버스 도착 연동은 완료(05j~05n, 위 2026-10-05 항목).
2. **앱 도착정보가 실시간인지 시간표 폴백인지 확인** — 서울 `/seoul`이 막혀 있으면 시간표로 동작할 것으로 보인다. 실기기에서 확인.
3. **경로 검색 지연 프로파일링**(0.6~2.4초).
4. **환승 보정**: ride_log n≥30, 환승 1회 이상, 일관된 2분 내외일 때만 역별 편차로. `xfer_pos.secs` 평균(255초)을 통째로 쓰지 말 것. ride_log가 0건이라 보류.
5. **다음 승차 실기기 검증(가장 중요)**: 기록 모드를 켜고 ① 탑승 중 재탐색이 없는지(`경로 N역 시작`이 안 나오는지) ② 마커·오버레이·혼잡도 카드가 PF 위치와 같은지(`PF채택` 로그) ③ 승강장에 이미 서 있다가 일찍 탄 열차를 `승차확정`으로 잡는지 ④ 백그라운드 갔다 와도 재탐색 안 되는지 ⑤ 역방향(잠실→강변) ⑥ 계양→잠실 69분 도착 예상이 실제 14:01 과 맞는지 ⑦ 환승 1~2정거장 전 무지개 하이라이트를 확인한다.
5-1. **남은 개선(미수정)**: ⓐ 네이버 맛집 버튼은 장소 ID 를 못 얻어 좌표 편향 검색(카카오는 ID 직링크로 해결) ⓑ 자동 확정은 방향 확인과 5분 검증 취소가 붙었지만 휴리스틱이라 실기기 확인 필요(버스 노선이 지하철과 나란할 때 등) ⓒ 승강장 유예 4분은 경험값 — 실제로 놓친 경우 '다음 열차 맞춤'이 4분+1.5분 늦게 뜬다 ⓓ (해결) 서울 실시간 도착은 NCP 중계로 가동 중(3-1번) ⓔ 총 소요가 '엔진 총합'과 '화면 타임라인'이 어긋나는 실제 원인은 코드·합성 시험으로만 확인했다 — 실기기에서 카드 숫자·`전체 N분` 줄·도착 시각이 서로 맞는지 확인(어긋나면 기록 모드 로그와 `window._htlTlTotalMin` 값 대조). (이전에 여기 있던 분 불일치·'8분 vs 16분' 라벨·주황 배지·역 사이 지연 재계산 4건은 `df32cdb`에서 고쳤다.)
6. **키·토큰 정리** — 기능 작업이 끝난 뒤. 앱에 새 키를 넣지 않는다. (YJ가 "이번에는 패스"라고 했다.)
7. subway-app의 옛 브랜치 `claude/jolly-darwin-dtzab9`(`ac3e4ff` 등) 삭제 — **YJ 지시를 기다릴 것.**
8. 선택: 사용자가 적은 노선(GTX-A 등)의 AI 글이 너무 적거나 어색한지 배포 서버에서 확인.

## 7. 테스트·빌드 확인 방법
- 앱 문법: `www/index.html`의 인라인 `<script>`를 `new Function`으로 검사(`type="text/x-metro-svg"` 블록은 JS가 아니라 제외).
- 앱 화면(헤드리스, 서버만 모의, 외부 요청 전부 차단, Playwright `/opt/node-tools/node_modules/playwright` + Chromium `/opt/pw-browsers/chromium-1194`): `node test/chat_line_tabs.ui.test.js [스크린샷 폴더]`(21건) · `node test/ride_evidence.ui.test.js [html 경로]`(35건, 약 6분 — 백그라운드로 실행: 재탐색 차단·승차 증거·69분 시나리오·역방향·버튼·가속도 삭제 확인). 첫 실행 위치 안내 팝업(`locDiscOv`)은 시험에서 '확인'을 누른 상태로 시작한다.
- 중계: `node worker/test/seoul_relay.test.js`(13건)·`node worker/test/relay_push.test.js`(8건)·`node tools/seoul-relay/relay.test.js`(9건) (subway-app). 엔진: `node test/est_delay.test.js`(75건) · `node test/est_line_notices.test.js`(통합) — route-v2. 모의 위치·KV·BUSAPI라 네트워크가 필요 없다. board-writer: `node --check board-writer/index.js`, `node:sqlite`로 D1을 흉내 낸 모의 env로 `scheduled()`·`/talks`·`/lroom`·`/react`를 호출(Node 22).
- 빌드: main push → `Build APK` 자동. 다른 브랜치는 Actions → Run workflow. 성공하면 `subway-app-debug` 아티팩트. 서명 릴리스(AAB)는 시크릿이 있을 때만.
- Code 환경 제약: 아웃바운드가 프록시를 거치며 `workers.dev`·`apis.data.go.kr`·`api.cloudflare.com`은 막혀 있다(403). 외부 API가 필요하면 Actions 러너에서 시크릿(`TAGO_KEY`, `CF_API_TOKEN`, `CF_ACCOUNT_ID` — subway-app에만 있음)으로. 키·본문은 로그에 출력하지 말 것.

## 8. 주의·되돌릴 것
- **AI 승무원 문구는 건드리지 말 것.** 승차·대기 분할, 경로 선택 이유, 문 위치 팁은 경로 카드에만 있다 — AI 승무원에 다시 넣지 않는다(중복 금지).
- **개발자용 진단 카드 주석 블록 안에 `<!-- -->`를 넣지 말 것**(3번 사고 참고).
- 임시 파일: `ntce-lines.yml`(공지 분포 집계)은 삭제함 — 필요하면 git 히스토리 `5772a90`/`7bb6764`. 예전 Cowork 초안 `relay.js`는 폐기하고 `tools/seoul-relay/`로 대체했다. 로컬 시험 스크린샷은 저장소에 없다.
- 코드 주석에 `2026-10-05`로 적었던 날짜는 오기였고 `2026-10-04`로 정정했다.

- 줄바꿈: `www/index.html`·`HANDOFF.md`는 LF(파일 끝 CRLF 한 줄만 예외). 커밋 도구가 CRLF 로 바꾸지 않았는지 올린 뒤 sha256/`CR` 개수로 확인.

- **쇼핑 상품 즉시 반영(2026-10-05)**: 앱이 쇼핑 화면을 열 때·켤 때 gildongmu-shop `/version` 만 가볍게 확인(2분 간격)하고 저장본과 다르면 `/shop` 을 받아 바로 그린다(`_shopCheck`). 같은 시기에 `_shopFetch` 가 받은 뒤 `_renderShopGrid()` 를 인자 없이 불러 새 상품이 다음 렌더까지 안 뜨던 숨은 버그도 `renderShop()` 으로 고쳤다. 시험: `test/shop_version.ui.test.js`. 상품 교체 = 서버 PAYLOAD 교체 + version 올리기 + 대시보드 Deploy(코드 편집 화면은 iframe 이라 전체 코드를 클립보드에 넣고 붙여넣는다). 현재 913개(v20261005-2130). 엑셀 `카테고리별_분류결과_7종.xlsx` 양식: 번호·추천 아이템·연결링크·이미지URL, 시트=카테고리.

- 서울 버스 도착 API(하루 1만 건) 보호 (2026-10-05): ①서버 gildongmu-bus 워커에 정류장별 공유 캐시 추가 — ws.bus.go.kr getStationByUid 20초, getStationByPos 60초, TAGO/경기 도착정보 15초, 같은 요청 동시 진입 시 1회만 상위 호출(INFLIGHT 합치기), 정상 응답(headerCd 0/4, resultCode 00/0/4)만 캐시하고 오류·인증실패는 캐시 안 함, 그 외 경로(노선 경유정류장 등)는 기존 그대로 통과. 응답 헤더 x-gm-cache(HIT/MISS/JOIN)와 /health 의 cache.entries 로 확인. 워커는 Cache API 가 workers.dev 에서 안 돼서 isolate 메모리 Map + 상위 fetch 의 cacheTtlByStatus 를 같이 쓴다. 배포: 대시보드 편집 화면(iframe)에 클립보드 붙여넣기 후 배포. 코드에 역슬래시가 있으면 javascript_tool 전달 중 사라지니 자리표시자로 보낸 뒤 페이지에서 되돌리고 sha256 으로 확인할 것. ②앱 _refreshMapBusArrivals 간격 조절(_busPollGap): 화면에 보이고 가장 빠른 도착이 10분 이내면 30초(기존 그대로), 10분보다 멀거나 도착 정보가 없으면 60초, 화면 밖·숨은 탭 카드는 90초. 남은 시간은 1초 카운트다운이 계속 흘리므로 화면은 같다. 시험: node test/bus_poll_gap.test.js (10개). 앱 반영은 새 APK 필요, 서버 캐시는 즉시 적용.


## 2026-10-05 API 호출량 집계 페이지 (/usage)
공개 링크: https://gildongmu-bus.phg0643.workers.dev/usage (JSON: /usage.json). 2026-09-01부터 날짜별 전체 표시, 호출명(공공데이터포털 서비스/오퍼레이션)별 x 키별(키1=TAGO_KEY, 키2=TAGO_KEY2, 중계서버=gentle-lab, 앱 버스서버=gildongmu-bus), CSV 내려받기 지원.
데이터는 D1 subway-db 의 live_usage(day,k,n) 에 저장. gildongmu-bus(바인딩 DB=subway-db)는 bus.* 키, route-v2 는 tago.* gbis.* seoul.k1/k2 ld.TrainInfo|ExpBusInfo|SuburbsBusInfo.* xfer.* ntce.* kric.* est.* share.hit 키를 기록(약 1분 단위 flush, 근사치).
집계 시작일은 2026-10-05. 그 이전(9월) 호출량은 이 서버에 기록이 없으므로 공공데이터포털 활용현황에서 확인해야 함.
(2026-10-06 정정: 예전에 배포본에만 있던 집계·KRIC 상한 패치는 06a 에서 route-v2 소스로 되살려 이제 배포본과 저장소 소스가 같다.) gentle-lab 은 아직 미계측(binding 경유 /tago 는 route-v2 쪽 'binding' 카운트로만 확인 가능).

## 2026-10-06 밤 — YJ 실승차(캠퍼스타운→아라) 개선 4건
상세 원인·로그 근거는 저장소 밖 기록 `IMPROVEMENTS_2026-10-06.md` 요약. 코드 위치:
1. **승차 직후 시각표 6분 점프(17:35→17:29)** — `_recalcArrivalsFrom`(앵커 하한: 승차 확정 + 시각표 구간 소요 60%)·`_htlSnapBoardArr`(승차 2분 전보다 앞선 열차로 스냅 금지). 원인: 기지국 선행이 승차 52초 뒤 '다음 역 통과'를 찍어 앵커가 3분 앞섬 → 정적 시간표의 더 이른 열차로 스냅. 시험: `test/ride_evidence.ui.test.js` '승차 직후 시각표 점프'.
2. **오버레이·혼잡도 카드가 마커보다 한 역 늦음(부평/동수)** — `window._markerPos`(마커가 GPS 로 그려진 위치)를 `_pipHereIdx`·혼잡도 카드가 따름(85%↑이면 다음 역, 한 역까지만 앞섬). PF·기지국 규칙은 그대로.
3. **하차 전 팝업 버튼 먹통** — 원인 미특정. 팝업 최상단 z-index·touchend 대체·가림 요소 점검/진단(`_ovlDiag('팝업', …)`). 재발 시 설정 → 오버레이 진단 기록에서 `팝업` 줄을 볼 것.
4. **오버레이 화살표(-->)** — `native/OverlayPlugin.java`(ArrowView, 깜박임 0.55초) + `_ovlMoving()`(PF seg/dwell → `moving`). **APK 재빌드 필요.**
- 손대지 않은 것: PF 채택 문턱(60%)·셀 혼선(문학경기장 17:46~47 에서 PF 5↔6 왕복으로 ≈1분 지연) — 다음 로그에서 `PF▶`→`PF채택` 간격을 더 모은 뒤 조정.
- **기준 시각 보정(2026-10-06 밤, 무작위 시뮬레이션 `test/fuzz/` 결과)**: `_recalcArrivalsFrom` 이 같은 열차에서 승차 이후 찍힌 통과가 2개 이상이면 최근 3개 지연값(통과 시각−시각표) 중 최댓값을 기준으로 삼음(`window._ANCHOR_MODE`: 'max3' 기본 · 'med3' · 'last'=예전). 기지국 선행(항상 이른 쪽 오차)이 도착 예정을 끌어당기던 것을 막음. 시뮬레이션(시드 41·55, 70경로씩): 도착 예정 오차 2.9→1.4분, 1.5분 넘는 튐 180→41~62회, 오버레이 2역 이상 어긋남 54~68→9~13회. 승차 확정 지연(3~6분)·버스 실시간 보정은 아직 손대지 않음.


### 2026-10-07 새벽 — 셀 선행 통과시각 교체 + 전 노선 시뮬
- `_cellHopAdvance` 가 찍은 통과 stamp(`_cellStampMs[idx]`, 값 비교로 식별)는 실제보다 1~3분 이르다. 같은 역을 PF 가 채택하면(`_pfAdopt`, td==gm) 채택시각−35초로 교체(10초 넘게 늦을 때만). 도착예정이 선행 stamp 에 끌려 5분 일찍 고정되던 경우 보정. 시뮬(140경로): 평균 오차 1.9→1.6분, 도착 직전 1.3→1.0분, ETA 튐 증가 없음.
- 진단 기록(설정 → 오버레이 진단 기록)에 '정확도'(역마다 화면 시각 vs 실제 통과 시각, 도착 시 처음 말한 도착예정 오차)와 '통과시각'(교체 사건) 줄 추가. 다음 실주행 뒤 전체 복사해 오면 실제 오차를 숫자로 볼 수 있다.
- 시뮬 도구: test/fuzz/route_fuzz_real.js(인천1호선 실제 시간표 상·하행), route_fuzz_alllines.js(21개 노선 프로파일·급행·심야 자정 넘김·새벽 포함). 사용: `ANOM=pullback,skip3,late6 LEADFIX=2 node <파일> <index.html> <N> <seed>`.
- (같은 날) `_htlSnapBoardArr`: 승차 뒤 실제 통과 기록(idx > 승차역)이 하나라도 있으면 정적 시간표 스냅을 하지 않는다 — 앵커(`_recalcArrivalsFrom`)가 만든 시각을 시간표의 더 이른 열차로 끌어당겼다 놓았다 하던 문제. 이상상황(승차확인 3~6분 지연·위치 되돌림·역 건너뜀) 시뮬: 평균 1.52→1.34분, 도착 직전 0.74→0.44분, 최악 10.9→7.9분.

### 2026-10-07 아침 — 전국·이상상황 시뮬에서 잡은 3건
- **타임라인 시각 역전**: 위치 판단이 건너뛴 역(통과 기록 없음)이 이웃 역보다 이르거나 늦게 나왔다(`_schedMin` 이 기록 있는 역만 통과 시각으로 덮이므로). `_recalcArrivalsFrom`·`_htlSanityCheck` 에서 기록 있는 두 역 사이의 역은 예정 비율로 배분, 순서 단조 보장. 자정 넘는 경로는 `_schedMin` 이 25:28/01:28 로 섞이므로 앵커와의 차이를 ±12시간으로 접어 비교한다(시뮬 역전 300+건 → 0).
- **환승 뒤 승차 시각 하한**: 일찍 탄 열차가 일찍 가도 환승해 탈 열차·버스는 시각표대로 출발한다. 노드마다 `_plan0`(처음 안내받은 `_schedMin`)를 두고, 앞으로 탈 승차 구간의 시작이 `_plan0` 보다 이르지 않게 한다(recalc·sanity 양쪽). 늦으면 종전처럼 그대로 뒤로 전파.
- 시뮬 도구 route_fuzz_alllines.js 에 ANOM 추가: `early`(2~6분 일찍 탐)·`late1`(2~8분 늦게 탐)·`ug`(지하: 2~5개 역 근거 끊김)·`miss`·`late6`·`pullback`·`skip3`, 부산·대구·대전·광주·KTX 프로파일, 규칙 위반 자동 검사(역전·도착예정이 이미 지난 시각). 결과(80경로, 수정 전→후 평균오차): 일찍/늦게 3.7→2.1분, 지하 2.9→1.2분, 복합 3.9→2.2분, 도착직전 ≤0.5분.
- (같은 날) **앞 구간 시각 고정**: 환승해 탄 뒤에는 앵커가 속한 승차 구간 앞쪽 노드(앞 열차·도보)를 `_recalcArrivalsFrom`·`_htlSanityCheck` 모두 건드리지 않는다. 시뮬에서 지나간 역 시각이 뒤 구간 지연에 끌려 최대 17분 바뀌던 것이 775회→230회·최대 4분으로. 마지막 안전망 `_monoDisplayFix()` 가 표시 순서 역전을 막는다. 남은 230회는 같은 구간 안에서 근거가 늦게 들어와 시각이 정정되는 정상 정정.

### 2026-10-07 낮 — ★ 도착시각 계산을 전부 엔진으로 (YJ 절대 규칙: "논리계산은 엔진, 앱은 그림만")
- **엔진 `engine/ride-eta.js`**(route-v2 Worker 에 `POST /ride-eta` 로 붙인다. 합치는 법 = 배포 폴더 `build.js`: 덤프한 route-v2 에 이 파일을 `handleFetch` 앞에 넣고 `handleFetch` 맨 앞에 `if (url.pathname === "/ride-eta") return handleRideEta(request);`). 순수·무상태: 입력은 '지금까지의 증거 전부'(통과 기록+출처 gps/pf/cell/drift/board, 승차 여부, 승강장 대기, 실시간 도착정보 `live`, 다음 차 시각 `boardNext`, 내가 승차역에 닿는 시각 `boardArriveMs`, 첫 승차역 시각표 `timetable`, 각 노드의 처음 예정 `planMin`), 출력은 노드별 `arr`(HH:MM)·`schedMin`·`delayMin`·`boardShiftMin`·`notes`. 시험 `node test/ride_eta.test.js`(63개), 시뮬 `test/fuzz/ride_eta_sim.js`(README 주석 참고: `<N> <seed>`, ANOM/OPTS/TICKS 환경변수).
- **앱 `www/index.html`**: `_recalcArrivalsFrom`·`_htlSanityCheck`·`_htlSnapBoardArr`·`_htlShiftFrom`·`_htlDelayTrack`·`_htlEarlyTrack`·`_htlBoardFixWait`·`_platformLateShift`·`_pfOverdueShift`·`_rtArrPoll`·`applyDelay`·`_resyncBoardToNextTrain`·`_pfAdopt` 안의 시각 계산을 지웠다(이름은 호출처가 많아 남겨 두고 `_etaRequest(...)` 만 한다). 앱은 증거를 모아 `/ride-eta` 로 보내고(`_etaPayload`/`_etaRequest`, 15초 `tick`·증거 변화는 즉시, 직렬화·재시도) 돌려받은 `arr` 를 그대로 그린다(`_etaApply`). 응답을 못 받는 동안은 마지막 값이 남는다(앱이 대신 계산하지 않는다). 통과 출처는 `window._nodePassSrc[idx]`, PF 채택 원값은 `_nodePassPf`, 라이브·다음 차·닿는 시각은 `_etaLive`·`_etaBoardNext`·`_etaBoardArrive`. 경로가 바뀌면 `_etaResetEvidence()`.
- **배포 순서 주의**: 앱이 `/ride-eta` 를 부르므로 **엔진(Worker)을 먼저 배포**하고 앱 APK 를 낸다. 엔진 없이 앱만 나가면 시각이 예정 그대로(갱신 없음)다.
- **UI 시험**: `test/helpers/eta_mock.js` 가 `/ride-eta` 요청을 Node 에서 진짜 엔진으로 답한다(`installEtaMock`, `autoWait`, `etaWait`). 모든 `*.ui.test.js` 가 이걸 쓴다. 시각을 직접 주입하던 옛 시험은 '증거를 주고 엔진 응답을 기다린 뒤 그려진 값'을 보는 방식으로 바꿨다. `ONLY='정규식'` 환경변수로 일부만 돌릴 수 있다(앞 시험이 만든 상태에 기대는 것이 있어 단독 실행하면 실패하는 것이 있다).
- 정확도(시뮬 80×4 조건 + 12개 새 시드, 사건 단위): p50 0.26분 · p90 0.62분 · p99 1.00분 · 최대 3.13분, 82% ≤ 0.5분, 99% ≤ 1분. 남은 큰 오차는 '늦은 승차 확정 vs 늦은 열차'를 구분할 정보가 없는 구간(승차 확정 직후 1~3개 역)이다. 0.5분 최악은 정보 한계로 불가 — 승차 전 위치 흔적(역에 처음 나타난 시각)을 엔진 입력에 넣는 것이 다음 단계.
- 엔진 수정(같은 날): 승강장 대기 지연을 '내가 닿는 시각' 바닥보다 먼저 적용(바닥이 먼저면 이미 역에 서 있을 때 늦음 증거가 사라졌다).

### 2026-10-07 오후 — 엔진 입력에 '움직임 시작'(src `move`) 추가 · 승차 직후 오차 측정
- 앱이 승차를 '위치 증거'로 확정할 때 찍는 통과 시각(`_rideEvStartMs` = 탑승 증거가 선 시각 − 60초)은 확정 시각이 아니라 되짚어 찍은 출발 근사값이다. 엔진에 `src:'move'` 로 보낸다(`_etaSrc(bi,'move')`). 엔진은 실제 출발이 −35~+60초 안에 있다고 보고(`moveLagMinSec/MaxSec`, 오차 ±10초) 지연 가능도를 만든다. **이 분포는 가정이다** — 실차 진단 기록('승차판단' 줄과 첫 역 통과 시각)으로 보정할 것.
- 위치 증거가 없는 확정(지하 승강장·GPS 없음)은 종전대로 `board`(3~6분 늦은 확정 가능성을 감안).
- 시뮬: `MOVE=p`(승차 확정 때 move 증거를 줄 수 있는 비율, 별도 난수라 다른 시나리오는 그대로). 승차 확정 직후 사건까지 포함한 오라클 대비 오차(16 시드×80): MOVE=0 p99 2.02분·최대 4.59 → MOVE=0.5 p99 1.70 → MOVE=1 p99 1.05·최대 3.53. 즉 '승차 직후 위치 흔적이 얼마나 자주 남느냐'가 승차 직후 큰 오차를 좌우한다.
- 남은 큰 오차는 알 수 없는 것: 지하 구간(증거 끊김) 뒤 확정, 노선 자체의 지연, 도착 뒤에 늦게 찍힌 확정.

### 2026-10-07 저녁 — 돌발 변수 9종 시뮬 + 엔진 '변화점 필터(HMM)'
- 시뮬(`test/fuzz/ride_eta_sim.js`) ANOM 추가(별도 난수라 기존 시나리오는 그대로): `halt`(구간 중 2~6분 정차) `slowseg`(몇 구간 서행) `express`(구간 건너뜀·빨라짐) `traffic`(앞 열차 간격 정체) `falsepf`(엉뚱한 역 통과 오탐) `dupe`(같은 통과 중복) `restart`(앱 재시작→증거 유실) `offline`(통신 끊김) `badmove`(움직임 시작 시각이 크게 틀림). 매트릭스 도구: 스크래치 mat.sh(12조건×3시드).
- 문제: 종전 엔진은 '지연이 천천히 변한다'만 가정해, 정차·서행으로 지연이 계단식으로 바뀌면 다음 사건 하나 뒤에도 2분 넘게 틀렸다(halt 후 첫 사건 ≤1분 23%).
- 해결: `_reLegModel` 에 구간 지연 격자(0.05분) 위의 **변화점 순방향 필터**(`opts.hmm=1`). 전이 = 완만한 변동 + 비대칭 점프(위로 4분·아래로 1.5분 규모, 역 수에 비례). 방출 = 이상치 혼합(오탐 1개가 전체를 끌지 않게). 초기 사전분포는 '일찍'보다 '늦게' 쪽이 넓다. 최근 60개 통과만 사용. 셀 힌트·정적 시간표 스냅은 최종 분포에 그대로 얹는다. 옵션: hmm, epsJump, epsOut, robustFloor, jumpUpScaleMin, jumpDnScaleMin, jumpUpW, priorNegWideSd, looseOnlyAtStart(기본값은 코드 참조). `hmm:0` 으로 끄면 종전 동작.
- 결과(오라클 대비, 3시드×80, 승차 확정 포함): base p50 0.29/p99 1.50, halt p99 4.8(첫 사건 ≤1분 98%), slowseg 1.5, express 1.7, traffic 1.5, falsepf 2.8, dupe 2.0, restart 1.9, offline 2.0, badmove 1.9, 종전 7종 복합 2.0, 전부 겹친 극단 p99 9.6. 표준 4조건 새 시드 p99 0.9~1.2(퇴보 없음). 호출당 계산 ≈5ms(40개 역).
- 남은 한계: 정차 직후 첫 사건·`offline`(통신 끊김=화면 갱신 불가)·전부 겹친 극단은 정보 부족. `move` 의 지연 분포(−35~+60초)는 가정이라 실주행 로그로 보정해야 한다.
- 시험: `node test/ride_eta.test.js` 66개 통과(계단식 변화 시험 추가).

### 2026-10-07 오후 — 실서비스 검증(HMM 엔진) + 경로 검색 속도 기준선
- 배포 확인: workers.dev 에서 `/ride-eta` 4건(계단식 지연·정시·move+pf)이 로컬 엔진과 도착시각·지연값 모두 일치(지연 3.53/3.38/−0.22/0.26분).
- 경로 검색 속도(`/route-v2-app`, live=0, 70개 대표 구간, 내장 브라우저에서 측정 — 이 브라우저는 LAX 엣지로 접속해 기본 왕복 ≈0.3초가 포함됨, `cf-placement: remote-ICN`): 처음 호출 p50 1.57s·p90 2.29s·p99 3.32s, 같은 요청 재호출 p50 1.11s·p90 1.67s·p99 2.64s. 짧은 구간(≤30분) 0.7~1.4s, 장거리(KTX 포함) 1.7~3.3s. `live=1` 은 +0.35s 안팎. 캐시 효과는 약 30%뿐 → 장거리는 계산이 지배.
- 주의: bench/compare.py 의 카카오 대조는 시각이 다른 참고값(21건)이라 정확도 지표로 부적합(같은 질의가 몇 분 사이 KTX 출발 변경으로 176→246분). 정확도 비교는 출발시각을 고정해 같은 시각에 수집해야 한다.

### 2026-10-07 오후(2) — 실시간 도착정보(live)를 지연 필터로 · 후보 전부 전달 · 동승자 기록은 효과 없음(폐기)
- 발견(시뮬 `LIVE=p`/`LIVEC=min|all`, 3시드×80, 다음 역 도착시각 오차 — `near.js`): **옛 엔진의 live 처리(가장 가까운 역 한 곳을 그 시각으로 맞추고 뒤를 통째로 밂)는 엉뚱한 열차 값이 섞이면 live 가 없을 때보다 나빴다**(앞 1번째 역 오차 ≤1분 93.2% → 78.4%, p99 2.5 → 6.4분). 앱이 '가장 빨리 오는 한 대'만 보내 앞차가 뽑히면 그대로 틀어진다.
- 엔진: `opts.liveHmm=1`(기본) — 현재 구간에서 아직 안 지난 역의 live 를 변화점 필터의 측정값으로(가우시안 sd `liveSdSec`=30초 + 이상치 `epsLive`=0.35). 같은 역에 여러 열차 후보(`live` 에 같은 idx 가 여럿, 최대 4)가 오면 후보 혼합으로 내 열차를 통과 기록과 맞춰 고른다. 구간 밖 역은 종전 방식(`liveMinSec` 이상 어긋나면 뒤를 민다). `liveHmm:0` 이면 옛 동작.
- 앱: `_rtArrPoll` 이 가장 빨리 오는 한 대를 고르지 않고 이 역에 오는 같은 노선 열차 후보 전부(가까운 4대)를 `_etaLive` 로 넘긴다(고르는 일은 엔진). 시험 `test/rt_arrival_cands.ui.test.js`(5).
- 결과(live 있는 시나리오, 앞 1번째 역 ≤1분 / 3번째 / 5번째): live 없음 93.2 / 78.1 / 61.4 → 새 엔진+앱이 한 대만 보냄 92.0 / 79.7 / 63.7 → **새 엔진+후보 전부 95.2 / 84.2 / 68.0**. 앞 1번째 역 ≤0.5분 67 → 73%. 엉뚱한 열차 35%의 극단에서도 91.8%(live 없음 93.2, 옛 방식 76). 전부 겹친 극단 시나리오: 62.6 → 69.3%. live 입력이 없으면 출력은 이전과 바이트 단위로 같다.
- **동승자 기록 공유(peers)는 시뮬에서 효과가 없었다 → 코드 폐기**: 같은 열차 다른 승객의 통과 기록(역마다 50% 존재, 10% 다른 열차)을 별도 측정값/지하 구간 대체로 넣어도 다음 역 오차는 ±0.5%p(중립). 지하 구간에서 지연은 천천히 변해 내 기록 없이도 오차가 작고, 큰 오차는 '앞으로 생길 정차'라 남의 과거 기록이 못 줄인다. 실주행 로그로 '지하 구간이 긴 노선'의 효과를 다시 보기 전에는 만들지 않는다.
- 시뮬 환경변수 추가: `LIVE=p`(live 입력 비율) `LIVEBAD=1`(엉뚱한 열차 35%) `LIVEC=min|all`.

### 2026-10-07 밤 — 경로 정확도 기준표(카카오 대조, 같은 시각 70건)
- `test/bench/route_cmp_20261007.json` + `route_cmp_score.py`(수집 절차 `kakao_collect.md`). 기준선: 시내·광역 **54.5%** 가 ±max(3분,10%) 이내, 장거리는 같은 기준(대기 제외) **90.9%**(대기 포함 총시간은 정의 차이로 +37분).
- 정의 차이(결함 아님): 카카오 시내는 출발지→역 도보·출구까지 걷기 포함, 장거리는 대기 제외·가장 빠른 열차.
- 진짜 결함 후보: **1호선 급행 미반영**(서울역→오산/수원/평택 계열: 카카오 48/63/79분 vs 엔진 51~57/78~83/80~98분). 그 밖에 엔진이 9~19분 빠른 케이스(43,31,111,32,14)·느린 케이스(53,29,42)는 개별 확인 필요.
- **1호선 급행 조사 결과(결함 아님으로 판단)**: D1 `kric_xp` 에 서울역→오산(hop 68분)·수원(53분) 급행 간선이 있고 `xpWait` 가 시각·배차로 쓴다. 공식 시간표(KRIC)의 해당 시간대 최속 열차(K1937)는 서울역 16:18→오산 17:27(69.5분, 정차 11곳)이라 엔진 값이 시간표와 맞다. 카카오의 "1호선 급행 56분·8개 역"에 해당하는 열차는 시간표 데이터에 없다 — 카카오는 **대기 없는 정적 운행시간**이라 비교 기준이 다르다(같은 화면의 '일반' 1호선도 1시간28분, 환승 경로는 4호선 일반급행→금정→1호선 급행). 따라서 이 격차는 엔진이 아니라 카카오 값의 성격 차이로 보고 고치지 않았다. 확실히 가리려면 실제 탑승 기록(승하차 시각)이 필요하다.
- 수집 스크립트 `test/bench/kakao_collect.js`, 케이스 좌표 `route_cases_70.json` 추가.

### 2026-10-07 밤(2) — 경로 검색 속도: 엔진 계산 2~3배 (재배포 필요, 결과 동일)
- 원인 진단: 워커 안의 `Date.now()` 는 계산 중 멈춰서(`liveStat.msBreak` 의 total 이 5ms 로 찍힘) 엔진 내부 시간표시가 의미 없다. 대신 실제 정류장 3만 행·지하철 급행 데이터를 D1 에서 받아 로컬에서 같은 코드를 돌려 프로파일: 요청당 ①탐색(노드당 ~10µs, 문자열 키 객체) ②주변 정류장 찾기(accessNodes 가 3만 개 전수×여러 번, ~140ms) ③addBus(그래프 생성 100~300ms) ④급행 대기(xpWait 의 Date 생성).
- 패치(`tools/route-speed/`, 앵커 실패 시 중단): 탐색 자료구조 교체 · 지도 칸 색인 · xpWait Date 제거 · addBus 결과 재사용. **결과는 원본과 동일** — 무작위 탐색 수천 건(옵션 7종·라이브/rtw/accessSec 상태 포함, 부작용 통계까지) + 전체 응답 13건 차이 0.
- 로컬(따뜻한 상태) 요청당: 서울역→수원 461→217ms, 강남→수원 296→164, 단거리 56→15. 탐색만 노드당 9.9→4.0µs.
- 배포본 `route-v2-worker-with-ride-eta.js`(엔진 버전 `route-v2-2026-10-07s1`). 배포 후 같은 70건으로 실측 비교 필요(이전: 브라우저 측정 중앙 767ms·p90 1570ms, 왕복 ≈0.3~0.4초 포함).
- 아직 안 한 것: 콜드 스타트(격리 첫 요청, JIT·KV 읽기), 장거리(KTX 등) 구간의 ld 처리 시간(로컬 재현 데이터 없음 — 배포 후 실측으로 판단), 앱의 '빠른 경로 먼저' 분할(전체가 1초 안이면 불필요).

### 2026-10-07 밤(3) — 장거리(ld) 캐시 콜드 I/O 단축 (s2, 재배포 필요, 결과 동일)
- 원인: live=0 일 때 `ldTagoCached` 가 KV 캐시 미스마다 `ld:`/`ldn:` 병렬 읽기 → 다시 `ld2:` 직렬 읽기를 하며(후보 열차·구간마다) 콜드 격리에서 ldTrainMs ≈ 830~890ms.
- 패치 `tools/route-speed/patch_ldcache.js`: ①`ld:`·`ldn:`·`ld2:` 3개를 한 번에 병렬 읽기(+`cacheTtl:60`, `ld2:` 중복 읽기 제거) ②`live=0` 에서 KV 미스가 확인된 키는 격리 안에서 60초간 KV 재조회 생략(별도 `LD_MISS` 메모, `LD_TAGO_NEG` 와 분리 → 이후 live 호출이 막히지 않음). 반환값(items/via)은 기존과 동일 — `ld_cache_test.mjs` 모의 KV 로 5개 시나리오 확인(미스 경로 2단→1단, 두 번째 호출 읽기 0).
- 엔진 버전 `route-v2-2026-10-07s2`. kric(KV 캐싱)는 D1 쿼리 자체가 ~25ms 라 이득이 불확실해 보류.
- 빌드: `IN=.../route-v2-worker.mjs tools/route-speed/make.sh out.js` (dijkstra→access→addbus→ldcache→version).
- **s2 배포 후 실측(2026-10-07 21:50, 70건×2회, live=0, 내장 브라우저·왕복 기준선 ≈300ms)**: 처음 호출 p50 1082 / p90 1608 / p99 2356ms, 재호출 p50 717 / p90 1358 / p99 1931ms (이전 s0: 1570/2290/3320 · 1110/1670/2640). 구간별 재호출 p50: 시내 A 364·H 445, 광역 B 782, C 973, 장거리 D 894·E 891·G 768. 1초 초과 12건(재호출), 대부분 C/D/E. 70건 중 69건이 `cacheTier:"kv"` — 요청마다 다른 격리로 가서 매번 콜드 경로(rows 풀기·addBus·kric)를 탄다. 다음 병목은 격리 재사용 실패(콜드 비용).

### 2026-10-07 밤(4) — s3: 콜드/따뜻 CPU 추가 정리 (결과 동일, 재배포 필요)
- 진단: s2 실측에서 `cacheTier:"kv"` 69/70 은 '격리 재사용 실패'가 아니라 **지역 키(0.005° 반올림 bbox)가 케이스마다 달라 6칸 메모리 캐시에 안 걸린 것**이다. KV 읽기+JSON+rowsUnpack 은 30000행 기준 ≈10ms(로컬)이라 KV/Cache API 로 바꿔도 이득이 없다(D1 d1Ms 9~15ms 도 확인).
- 진짜 비용은 요청당 JS 계산: 로컬 콜드 부산 ≈800ms vs 따뜻 ≈230ms(JIT 지배), 서울→수원 콜드 ≈500ms. prod 는 ≈2.2배 느림.
- `patch_s3.js` 3종(위 README). 따뜻 장거리 ≈12%↓, 콜드 변화 미미. 70건 전체 응답·퍼즈 차이 0.
- 한계/다음: 콜드 JIT 는 코드로 못 줄인다. 선택지: (a) 앱 시작 시 가벼운 워밍업 호출(엔진에 `/warm` 추가, 요청 수 증가 비용), (b) ld 순위 계산(터미널별 dijkstra 18~25회)의 후보 가지치기 — 결과가 바뀔 수 있어 별도 검증 필요.
- **s3 배포 확인·실측(2026-10-07 22:50 KST, 70건×2회, live=0, 요청마다 왕복 기준선을 같이 측정)**: 버전 `route-v2-2026-10-07s3` 확인, 오류 0. 왕복 중앙 315ms. 서버 몫(총시간−왕복) 처음 호출 p50 470 / p90 965 / p99 1652ms, 재호출 p50 356 / p90 951 / p99 1837ms. 구간별 재호출 p50: 시내 A 74·H 141, 광역 B 378·C 591, 장거리 D 816·E 532·G 630. 서버 몫이 1초를 넘는 건 5~6/70(대부분 C·D·G 꼬리). 주의: 심야(22시 이후)라 버스·열차 구성이 낮과 달라 s2(21:50) 수치와 직접 비교는 불가. 같은 질의 응답 내용은 s2 때와 동일(서울역→수원 66분/버스 80분 등).

### 2026-10-07 밤(5) — s4: `/warm` 예열 엔드포인트
- 목적: 첫 검색이 느린 이유(격리 첫 요청의 JIT·kric·rows)를 앱이 시작 때 `GET /warm` 한 번으로 미리 치르게 한다. 엔진만 변경(앱은 아직 호출하지 않음). 효과는 격리 재접속에 달려 있어 실서비스에서 `busDiag.iso`(같은 값이면 같은 격리)로 먼저 확인한 뒤 앱에 한 줄을 넣는다.
- **s4 배포 완료(사용자 Chrome 의 Cloudflare 편집기에 붙여넣고 배포, 엔진 버전 `route-v2-2026-10-07s4` 확인). 배포 후 응답(서울역→수원, 강남→양재)은 s3 와 동일.**
- **`/warm` 실측 결과 — 효과 불확실, 앱에 연결하지 않음**: 한 클라이언트의 연속 요청이 최소 4개 격리(`busDiag.iso`)에 분산됐다. `/warm` 두 번이 서로 다른 격리를 데웠고(둘 다 `warmed:true`), 이후 검색 일부는 데워지지 않은 격리(isoN=1)로 갔다. 격리 친화성이 약해 앱 시작 때 한 번 부르는 방식은 일부만 데운다. 엔진에는 남겨 둠(속도제한 적용, 60초 내 재호출은 즉시 반환).
- **새로 발견한 큰 변수 — 지역 KV 미스(`cacheTier:"none"`, D1 경로)**: 70건 벤치 구간은 이미 KV 에 쌓여 `kv` 로 나오지만, 새 좌표(0.005° 반올림 bbox 가 처음인 곳)는 D1 조회 후 KV 에 기록하느라 1.4~3.5초(왕복 포함)가 걸렸다. 실사용 좌표는 대부분 다양하므로 이 경로 비중이 크다. 엔진에는 이미 **버스 타일 모드(`bt=1`, 0.04° 타일을 KV 에 미리 채워 조립, `btFillTile`/채우기 라우트 존재)**가 있으나 앱이 보내지 않고 기본값도 꺼져 있다. 켜기 전 타일 조립 결과와 D1 결과의 동일성(`onlyTile/onlyD1` 진단 라우트) 검증과 타일 사전 채우기 범위 확인이 필요.

## 2026-10-08 (아침) bt=1 타일 검증·전국 사전 채움 (s5 배포, s6 미배포)

- **s5 배포됨 (운영 중)**: `/bt-verify` 강화(patch_btverify.js) — 실제 경로와 같은 JOIN SQL(고아 route_key 제외)로 D1 bbox 조회 후 busRowsSort → 13필드 전부·순서까지 비교. (기존 검증은 JOIN 없이 세서 고아 행 4개가 onlyD1로 잘못 잡혔었음: bus_route_stops 중 bus_routes에 없는 행 20,984개/280노선)
- **타일 == D1 bbox 행 검증**: 지정 10개 구역 + 무작위 60개 구역, onlyTile/onlyD1/rowDiff 전부 0 (최대 24,881행).
- **전국 타일 사전 채움 완료**: `/bt-fill r=4` 격자 순회(ix 3153..3277, iy 834..961 중심, 9타일 간격, 210구역, 4동시). 오류 0, dense 0. 빈 타일도 저장(`s:[]`). 약 15분. BT_TTL 14일(만료 시 재채움 필요) — 데이터 갱신 시 BT_VER 올릴 것.
- **종단 비교(70건, bt=1 vs bt=0, rc=0, live=0, baseMs 고정)**: 경로 결과 동일. 타일 경로 29건 중 28건은 `warnings`만 다름, 1건(케이스 20)은 `rtwStat.miss`만 다름.
  - warnings 차이 원인: 캐시(mem/KV/tile) 경로에서 `busDiag.nearRoutes`가 0 → "2.5km 안 버스 노선 없음" 경고가 **운영 캐시 응답에도 이미 잘못 붙어 있음**(결과엔 무영향, 진단/콘솔 경고만). 수정본 = patch_nearcount.js(s6, 빌드만 됨·**미배포**; Chrome 편집기가 붙여넣기 후 3회 멈춰 중단).
  - rows 차이 원인(케이스 20): D1 경로가 `restLimit = MAX_STOPS - near행수`로 rest를 자른 뒤 dedupe → near+rest > 30000이면 합집합(19,156)이 아닌 17,825행만 남음(D1 스캔 순서 의존으로 임의 정류장 누락). 타일은 완전한 합집합. **기존 D1 경로의 조용한 누락 버그** — 수정은 결과가 바뀌므로 사용자 결정 대기.
- **속도**: 신규 지역 16곳에서 D1 경로 d1Ms 12–105ms(D1 따뜻함; 직전 전체 읽기로 데워짐), 타일 경로 ≈ 280ms(콜드 KV 병렬 읽기). 즉 D1이 따뜻하면 타일이 오히려 느림. 타일의 이점은 D1 콜드(1.4–3.5s) 구간 회피뿐 → **타일 모드 기본 활성화 보류**.
- 빌드: make.sh = dijkstra→access→addbus_memo→s3→ldcache→warm→btverify→nearcount→version(s6). 운영 = s5(= s6에서 nearcount 제외).

## 2026-10-08 (낮) s6 배포 — rest 상한 누락 수정 + nearRoutes 진단 수정 (운영 중: route-v2-2026-10-07s6)

- **버그 수정 (patch_restlimit.js)**: D1 경로가 `rest`를 `slice(0, MAX_STOPS - near행수)`로 자른 뒤 dedupe → near+rest 합집합이 30000 미만이어도 일부 정류장 누락(케이스 20: 합집합 19,156행인데 17,825행만 사용). 이제 rest 전체를 순회하며 미확인 행만 추가, 총 행이 MAX_STOPS에 닿으면 중단. 합성 데이터 재현: s5 15,000행 → s6 27,000행(기대 27,000). 로컬 70건 s5 대비 출력 동일. 운영 70건 bt=1 vs bt=0: 케이스 20 포함 결과·warnings 일치.
- **진단 수정 (patch_nearcount.js)**: 캐시(mem/KV/tile) 경로의 `busDiag.nearRoutes`가 0이라 "2.5km 안 버스 노선 없음" 경고가 캐시 응답에 잘못 붙던 문제. 이제 rows에서 near 박스 안 노선 수를 계산(최대 600). 한계: near 박스(±0.025°)가 bbox 밖으로 삐져나오는 경우 D1 경로 값보다 약간 작을 수 있음(204 vs 206 등) — 진단값일 뿐 결과 무영향.
- **타일 모드 결론: 기본 활성화 보류(휴면 유지)**. 무작위 지역 40곳(bt=1 vs bt=0 교차, rc=0): D1 경로 d1Ms p50 22 / p90 70 / max 151 ms, 타일 경로 p50 284 / p90 301 ms(콜드 KV 병렬 읽기). 행 수 차이 0, 타일 40/40 적중. 지금은 D1이 훨씬 빠름 → 타일은 이득 없음. 전국 타일은 채워져 있으나(14일 TTL로 자연 만료) 앱은 bt=1을 보내지 않으므로 영향 없음. D1이 느려지는 시간대(과거 1.4–3.5s 관측)가 다시 보이면 `rc=0&bt=0/1` 교차로 d1Ms 재측정 후 판단.
- 관찰: 용량 큰 장거리 케이스(40, 105; 양쪽 모두 D1 경로)에서 한 번 해시가 달랐으나(live=0, baseMs 고정) 8회 반복·교차에서는 재현 안 됨 → 일시적(콜드 isolate 상태 의존 추정). 원인 미확정, 재현되면 조사.
- Chrome 배포 팁: Cloudflare 편집기는 695KB 붙여넣기 후 2~4분 렌더러가 멈춤. 붙여넣기 → 3분 대기 → ctrl+f로 새 코드 검색해 반영 확인 → 배포. 전달용 임시 페이지에는 안내 문구(<p>) 넣지 말 것(복사 때 섞여 문법 오류).

## 2026-10-08 (오후) s7 배포 — 장거리 전용 응답의 진단 경고 정리 (운영 중: route-v2-2026-10-08s7)

- patch_ldwarn.js: `out.longDistance`만 있고 minTime/minTransfer/minWalk/bus 가 모두 없는 응답(예: 서울→부산)에서 "버스만으로…못했습니다", "경로없음: 모든 모드가 비었습니다", "정류장 상한 도달" 경고를 내지 않는다. `warnings` 필드만 변경, 경로 계산·결과 무변경. 로컬 70건 s6와 출력 동일.
- 운영 검증(33건: 시내·광역·장거리, SN/EN 포함 앱 방식 요청, baseMs 고정): bt=1 vs bt=0 응답 전부 동일(warnings 포함), 전 케이스 경로 있음. 장거리 15건 중 11건은 경고 없음. 나머지 4건(21,40,43,74)은 장거리+시내 모드가 같이 있는 혼합 응답이라 경고가 그대로 남는다 — 정류장 30,000 상한 도달은 실제 사실(넓은 bbox에서 버스 정류장이 잘림).
- **남은 한계**: 중거리(서울→천안·수원, 인천→춘천 등) 넓은 bbox는 정류장이 30,000개에서 잘려 시내 버스 모드 일부 노선이 빠질 수 있음(원래부터). 해결하려면 거리별 정류장 선별(예: 먼 구간은 간선만) 같은 엔진 로직 변경이 필요 → 결과가 바뀌므로 별도 결정 사항.
- 앱 UI 직접 클릭 테스트는 불가(앱은 Capacitor APK, 웹 호스팅 없음; 아티팩트 페이지는 외부 fetch 차단). 대신 앱이 보내는 요청 형식(SN/EN/baseMs 포함)으로 엔진 응답 계약(전체 JSON 해시)이 변하지 않음을 확인.

## 2026-10-08 — 수동 입력 시 4개 탭 경로가 전부 같게 나오던 문제 (앱 수정, 엔진 변경 없음)
- 증상: 서울역→수원을 직접 입력하면 최단시간/최소환승/지하철/버스 탭이 전부 같은 경로(GTX-A/수인분당선).
- 원인: 직접 친 역 이름이 STNDB 로 풀려 type 'subway' 가 되고, `fmapDoRoute` 의 `useBFS`(역↔역 같은 도시) 분기가
  앱 자체 BFS(`doRoute` + `_renderBfsToTransitBox`)로 한 경로만 그렸다. 엔진은 탭별 후보를 따로 주는데 쓰지 않았다
  (YJ 절대규칙 위반: 논리계산은 엔진).
- 수정(www/index.html): `useBFS=false` 고정 → 모든 검색이 엔진 분기로. 같은 BFS 경로를 쓰던 입구도 엔진으로 연결:
  `_applyFavRoute`(즐겨찾기/최근), `applyMapRouteToHome`(노선도 시트→홈), 설정시트 검색(`mk_r` 저장부).
  노선도 탭의 경로 시트(`calcFmapRouteMap`/`_showMapRouteSheet`) 자체는 기존 BFS 표시 그대로 유지.
- 확인: 헤드리스 브라우저에서 앱 코드로 서울역→수원 입력 → `route-v2-app?SX..&SN=서울역&EN=수원` 요청이 나가고 엔진 응답으로 탭 렌더(BFS 호출 없음).
- 폰 반영: main 푸시 → GitHub Actions `Build APK` 로 새 APK 생성 → 설치해야 보인다(엔진만 배포하는 것과 달리 앱 변경은 APK 필요).

## 2026-10-08 (오후 늦게) s8 배포 — 상한(3만) 걸린 요청 '복도 우선 선정' 실험 장치 (기본 꺼짐, 켜지 않기로 결론)
- 배경: bbox 안 정류장이 3만을 넘으면(MAX_STOPS) near 이후 rest 가 ORDER BY 없이 임의로 잘림. 로컬 mock(rows.json=3만 행 표본)은 실제 빈도를 못 보여 줌 → 실제 D1/운영 워커로 측정.
- 실제 D1 bbox 행 수: 서울 단거리 5천~2만(안 걸림), 20~37km급 2만~12만(걸림).
- patch_corridor.js(s8): `?cs=1`일 때만, 상한에 닿은 요청에서 출발~도착 직선 복도(박스 2~16개, 반폭 기본 0.04°, `?cw=`)를 한 번 더 조회해 near → 복도 → 기존 rest 순으로 채움. 기본 `CS_DEFAULT=false`(`?cs=0`/미지정은 기존 동작), 캐시 키는 `c8:` 접두로 분리.
- 운영 A/B(rc=0, live=0, 70건, cs=0 vs cs=1, 내장 브라우저): 상한 걸린 요청 40건 / 안 걸린 30건. 안 걸린 30건은 전부 동일. 걸린 40건 중 31건 동일(서울~수원·인천·성남 등 20~37km급 21·22·23·25·27·29·32·34 전부 동일), 9건만 차이(대부분 장거리 마지막 탭의 몇 분 차이, 75·81은 장거리에서 후보가 하나 이상 추가).
- 비용: 걸린 요청 d1Ms 중앙값 291→598ms, 전체 응답 중앙값 2030→2326ms(+300ms). → **이득 없이 느려져서 기본 켜지 않음.** 걸린 요청은 원래 중앙값 2.0초로 느림(안 걸린 요청 ~0.5초) — 속도 개선 여지는 상한 자체(3만 행 로딩·계산)에 있음.
- 운영 상태: 엔진 버전 `route-v2-2026-10-08s8`(동작은 s7과 동일, cs 미지정 시 기존 경로). 롤백은 s7 재배포.

## 2026-10-08 (저녁) 운영 엔진(s8) 정확도·속도 종합 측정 — 100구간(기존 70 + 시내 주소↔주소 30)
- 방법: 내장 브라우저(map.kakao.com 탭)에서 구간마다 엔진(live=0 첫 호출·재호출·전체(live))을 연달아 부르고 카카오 대중교통 목록(숨은 iframe)을 같은 시각에 수집. 왕복 기준선(엔진 루트 `/`)을 빼서 서버 몫만 계산. 새 30구간(ci 200~229, /tmp 한정 목록)은 서울·경기·부산·대구·대전·광주·울산 등 장소↔장소.
- 속도(서버 몫 ms, p50/p90): live=0 첫 호출 742/1360(p99 1859), 재호출 403/893, 전체(실시간 포함) 1565/3685(최대 3969 — 실시간 도착 조회 상한). 거리별 live=0 p50: <5km 345, 5~20km 446, 20~60km 958, 60~150km 933, >150km 942, 주소 복합 863.
- 정확도(장거리·카카오 실패 제외 74건, 엔진 최단 vs 카카오 목록 최단): ±max(3분,10%) 이내 64%, 엔진 3분↑빠름 28·3분↑느림 6, 편차 중앙 −2분, |편차| p50 3분·p90 9분. 10/07 측정(54.5%, 빠름 19·느림 10)보다 느림 쪽이 줄었다. 카카오는 출발지 좌표→역 도보를 합산하므로 가까운 구간은 엔진이 짧게 나오는 게 정상(큰 차이 9건 중 8건이 엔진이 더 빠름, 1건 +14분: ci 111).
- 일관성: 같은 입력 연속 2회 결과 동일 98/100. 불일치 2건(ci 34 fast 43↔46, ci 205 less 83↔82)은 정류장 상한/near LIMIT 600 쿼리가 ORDER BY 없이 임의 부분집합을 돌려주는 것이 원인으로 추정(10/08 낮의 ci 40·105 일시 불일치와 같은 계열) — 미수정.
- 탭 의미: 'fast'(최단시간)보다 'sub'(지하철) 총시간이 짧은 경우 2/100(ci 21: fast 52 vs sub 47, ci 41: fast 82 vs sub 76) — 최단시간 탭이 도보 가중치(walkPenalty minTime 1.6) 때문인지 확인 필요, 미수정.

## 2026-10-08 (밤) s9/s10 배포 — ① '결과 불일치' 원인 규명 ② '최단시간 탭 역전' 수정
**① 같은 입력인데 결과가 다르다 → 엔진 비결정성이 아니라 '시각 의존'이었다 (코드 수정 없음)**
- 엔진은 baseMs(요청 시각, 미지정 시 지금)로 지하철 시간표 대기·막차를 계산한다. 연속 호출은 시각이 달라 결과가 달라질 수 있고, 위 100구간 측정의 불일치 2건(ci 34·205)도 baseMs를 고정하지 않은 측정 방식 때문이었다(정류장 상한 ORDER BY 추정은 철회).
- 검증: baseMs 고정 + live=0 으로 15구간 × 12회 = 180호출 → 전부 동일. 20초 단위로 시각만 바꾸면 시간표 경계에서 1~3분 단위로 바뀌는 구간이 재현됨. 상한(3만) 걸린 요청도 고정 baseMs 에선 동일.
- 앱이 같은 시각 결과를 원하면 baseMs 를 넘기면 된다(미지정이 기본 동작).

**② 최단시간(fast) 탭이 다른 탭보다 오래 걸리던 역전 — 원인 2가지, 엔진에서 수정**
- 원인 A(s9): minTime 탐색은 환승당 480초·도보 1.6배를 얹은 '가중 비용'으로 고르므로, 실제론 짧아도 환승이 하나 더 있으면 밀린다. 기존 후처리는 minTransfer/minWalk 와만 비교했다 → 같은 규칙(실제 totalMin 이 엄격히 짧으면 교체)을 subway/bus/direct 까지 확장(`patch_fasttab.js` 앞부분).
- 원인 B(s10): 장거리 경로가 fast 로는 "8분/8% 이상 빠를 때만", less 로는 "환승 적고 1.25배+5분 이내"면 올라가서, less 탭(175분)이 fast(184→181분)보다 짧은 경우가 남았다. buildAppResponse 에서 최종 탭 경로 중 fast 보다 엄격히 짧은 것이 있으면 fast 를 그 경로로 교체(`patch_fasttab.js` 뒷부분).
- 전후 비교(운영 엔진 s8 → s9 → s10, 100구간 × 3개 시각(baseMs 고정) = 300건, live=0):
  - 역전(fast > 다른 탭) 건수: s8 10건 → s9 1건 → s10 **0건**. fast ≠ 전체 탭 최솟값인 건수 0.
  - 바뀐 건은 fast 값이 달라진 10건뿐이고 전부 더 짧아짐(악화 0): 21@1 62→60, 41@1 91→87, 43@1 184→175, 51@1 77→73, 201@0 71→70, 215@0/1/2 44→38, 228@0/1 63→60.
  - 나머지 290건은 해시까지 완전 동일. 다른 탭(less/walk/sub/bus) 변경 0, 탭 구성 변경 0.
  - 응답 시간 중앙/p90: s8 666/1311ms → s10 549/1120ms(차이는 캐시 상태 영향, 악화 없음).
- 파일: tools/route-speed/patch_fasttab.js, make.sh(체인에 corridor·fasttab 추가), patch_version.js(s10). 운영 엔진 버전 `route-v2-2026-10-08s10`. 롤백은 s8 재배포.

## 2026-10-08 (밤) 전 탭 기능 점검 — 알림·오버레이·탭 연결 (앱 수정 5건, 엔진 변경 없음)
요청: "각 탭의 모든 기능이 정상 작동하나, 알림·오버레이 포함 유기적으로 연결되는지 점검". 헤드리스 Chromium(가짜 시계·가짜 Capacitor 플러그인·모의 서버)으로 시나리오 시험을 새로 만들어 돌렸다.
**새 시험(모두 `node test/<파일>`로 실행, 현재 전부 통과)**
- `test/journey_alerts.ui.test.js`(26) — 환승·하차 알림 순서/중복, 설정 스위치별 차단, 구형 경로 알림, 오버레이 갱신·경고 단계·keepAlive, 하차 전 추천, 출퇴근 브리핑.
- `test/journey_e2e.ui.test.js`(24) — 홈 검색→결과 4탭→세부경로→경로 확정→GPS 이동→알림·오버레이·상주알림→× 종료·도중 취소.
- `test/tabs_smoke.ui.test.js`(37) — 5개 탭 전환, 커뮤니티(게시판·댓글·공감·뉴스·실시간소통·설정 스위치·테마·아이디), 노선도(버스 주변/즐겨찾기·지하철 SVG·역 팝업→홈·엔진 호출), 쇼핑, 맛집(경로 없음/있음), 알림 탭 처리(환승 알림 팝업·닫기·출퇴근 브리핑).
- `test/helpers/engine_fixture.js` — 모의 엔진 응답.
**고친 것(전부 `www/index.html`)**
1. 알림 설정 스위치가 엉뚱한 알림을 막음: `_fireTransitAlert`/`_bgArrivalNotify`가 알림 종류(transfer/near_arrive/arrive 등)를 `showNotification`·`_notifAllowed`·`_vibrateFor`에 넘기지 않아 '환승 알림 끔'이 도착 알림까지, 반대로 도착 끔이 환승까지 영향. 종류별로 넘기도록 수정(기본값 동일).
2. 홈 결과 카드의 × (`closeTransitResult`)가 오버레이·백그라운드 GPS·상주 알림·남은 알림을 안 껐음 → `_cleanupBgTracking()` 호출 추가.
3. 맛집 탭을 다시 열면(공공데이터 캐시 10분) `_fetchPublicFood`가 `_foodPublicData=c.data`로 덮어써 서버 맛집이 사라짐 → `_foodMergeList`로 병합.
4. 하늘 파스텔 테마에서 설정의 '다크 블랙' 카드 제목이 흰 글씨(배경만 밝아짐)라 안 보임 → 파스텔일 때 글자색도 테마색으로(CSS).
5. 홈 출발지가 '내 위치 찾는 중...'에서 멈출 수 있음(첫 `getCurrentPosition` 무응답) → 실시간 위치 구독(`_startMyLocationLiveWatch`)이 위치를 받으면 그때 '내 위치'로 채움(수동·기존 출발지는 건드리지 않음).
**확인했지만 문제 아님**: 노선도 지하철 탭의 역 선택→홈은 `svgSetRoute`→`fmapDoRoute`(엔진)로 간다. `onMapStnClick`/`mspSetRoute`/`_goHome`(앱 자체 BFS+경로 유형 선택창)은 호출처가 없는 옛 코드(죽은 코드, 지우지 않음). 버스 지도·목록은 320~412px 폭에서 겹치지 않음.
**이 환경에서 못 본 것(실기기 필요)**: 실제 서버 응답(gentle-lab `/bus-stops`·`/tago`·`/weather`, board-writer, 맛집 서버 — 샌드박스에서 workers.dev 접속 불가), 실제 지도 타일, 안드로이드 알림·오버레이·백그라운드 위치 권한 동작. **새 APK 빌드 필요**(main push → Actions `Build APK`).

## 2026-10-08 (밤, 이어서) 추가 수정 4건 — 글 사라짐·맛집 서버 실패 안내·5분 뒤 옛 경로 팝업
1. **게시판에 쓴 글이 약 3분 뒤 사라짐**: 글은 기기 안(`_AI_POSTS`)에만 있고 서버에 받는 라우트가 없어(board-writer에 글 등록 POST 없음), 서버 목록으로 갈아끼울 때 지워졌다. → `localStorage 'myPosts'`(최대 50개·30일)에 따로 보관해 서버 목록 위에 매번 얹는다(`_myPostsMerge`). id 는 `Date.now()`(서버 글 id 100번대와 겹침 방지). 캐시(`commPostsCache`)에는 넣지 않는다. **다른 사람에게는 여전히 보이지 않는다 — 공유하려면 board-writer에 글 등록 라우트(+검열)가 필요(YJ 결정 사항).**
2. **맛집 서버 실패 안내**: 내장 목록(`STN_FOOD`)이 비어 있어 전부 서버 의존인데, 실패하면 스피너가 안 꺼지거나 "음식점이 없습니다"로 잘못 안내. → `_foodSrvFail` 표시 후 "맛집 정보를 불러오지 못했어요 · 새로고침" 안내. 서버가 성공했지만 비어 있으면 기존 문구.
3. **노선도에서 경로를 정하면 5분 뒤 옛 '경로 유형 선택' 팝업이 뜸**: `startAutoRefresh`(5분 주기)와 `clearBaseTime`이 `S.start&&S.dest` 만 보고 옛 `doRoute`(앱 자체 BFS)를 불렀다. 엔진 경로(`_fmapDest` 있음)면 부르지 않도록 가드. (옛 BFS 코드 자체는 지우지 않음 — `toggleDestSearch`·`calcFmapRoute` 등 일부 호출처가 남아 있어 별도 정리 과제.)
4. 쓸모없는 `X-Frame-Options` meta 제거(콘솔 오류 제거).
시험: `test/tabs_smoke.ui.test.js` 41개(내 글 유지·맛집 실패/빈/복구·11분 경과 팝업 없음 추가) 전체 통과, 기존 시험 전부 통과.

## 2026-10-09 — 내가 쓴 글을 모든 사용자가 보게 + 옛 계산코드 정리

### 1) 공유 게시글 (board-writer 서버 + 앱)
- **서버(배포 완료, 2026-10-09 00:24 KST)**: `DullyYJ/route-v2` `board-writer/index.js` (커밋 192eadd). 시험 `test/board_writer_userposts.test.mjs`(16개, `cd test && node board_writer_userposts.test.mjs`).
  - 새 경로: `POST /post`(닉·제목·본문·cat·owner_key), `POST /post/mine-delete`(owner_key 일치만), `POST /report`(3건 누적 시 자동 숨김),
    관리자 `GET /reports?token=` · `GET /post/delete?id=&token=` (ADMIN_TOKEN).
  - posts 테이블에 `user`, `hidden`, `owner` 컬럼을 **첫 글 등록 때 자동 ALTER**(ensureUserPostCols). owner 는 SHA-256 해시만 저장, IP 도 해시로만(신고 기록 14일 뒤 삭제).
  - 한도: IP당 시간 5·하루 15건, 광고/링크/전화번호/욕설 차단, MAX_POSTS=500 초과분은 id 오래된 순으로 정리(AI 글 포함).
  - 배포 방법: Cloudflare 대시보드 편집기에 코드 통째로 붙여넣기(자동화 브라우저 클립보드가 막혀 사람이 Ctrl+A/V → Deploy). 배포 직후 라이브 POST→목록→본인삭제 확인함.
- **앱**: `submitPost` 가 서버에 올리고(실패·오프라인이면 '⏳ 전송 대기'로 두었다가 재시도, 중복 없음), `_loadServerPosts` 가 남의 글도 `user:1` 로 받아 표시. 내 글 🗑 삭제, 남의 글 🚩 신고(두 번 눌러 확인, 내 기기에서는 즉시 숨김). 글쓰기 오류는 `#wErr` 에 인라인(토스트는 앱 전체에서 꺼져 있음).
- 개인정보: 앱 안 처리방침(`_POLICY_DOCS.privacy`)·`www/privacy.html` 에 "글은 모든 사용자에게 공개·신고·삭제" 문구 추가.
- 한계: 댓글에는 신고 버튼이 없음, 닉네임만 있고 로그인은 없음(owner_key 로 본인 글만 삭제).

### 2) 옛 계산코드 정리 (YJ 절대규칙: 계산은 엔진, 앱은 그리기만)
- 시험(48개 UI 흐름)에 호출 계측을 걸어 보니 정상 흐름에서 옛 코드는 한 번도 안 불렸고, 아래만 실제 사용자 경로로 남아 있었다:
  - **홈 ⇅ 바꾸기 버튼**(`swapFmapRoute`): 엔진 상태(_fmapStart/_fmapDest)는 안 바꾸고 옛 BFS+'경로 유형 선택' 팝업을 띄웠고, 내 위치·장소·정류장이면 아무 일도 안 했음 → 엔진 상태를 서로 바꾸고 `fmapDoRoute()` 로 다시 탐색.
  - `calcFmapRoute`/`calcFmapRouteMap`(노선도 검색줄)·`doRoute` → 전부 엔진 호출로 바꿈(`doRoute` 는 호환용 얇은 껍데기: S.start/S.dest 를 엔진 입력으로 옮기고 `fmapDoRoute()`).
- **삭제**: `_showRouteModePopup/_closeRouteModePopup/_selectRouteMode/_applyRoute`, 경로 유형 선택 팝업(`#routeModePopup` HTML·CSS), 옛 역 팝업(`#mapStnPopup`·`onMapStnClick`·`mspSetRoute`), `_goHome`, `calcOptimal`, `findPath`, `_fetchPublicRouteTime`, `_applyApiRouteData`, `_applyExpressTime/EXPRESS_SEGMENTS`, 옛 doRoute 본문(약 700줄).
- **폴백도 삭제(YJ 지시: 정확하지 않은 임의 경로는 보여주지 않는다)**: 앱 자체 BFS(`bfsMinTime/bfsMinXfer/bfs`, 고정 구간시간 표 기반이라 시간표·실시간이 없어 부정확), `_renderBfsToTransitBox`, 노선 그래프 `G`+`edge()` 데이터 1,150여 줄, 급행 메타(`EXPRESS_*`), 우선순위 큐 헬퍼, `lineOrder` 까지 제거. 지방역을 `STNDB` 에 추가하는 코드는 유지(엣지 연결만 뺌).
  - 엔진이 응답하지 못하면: `_routeFailShow()` 가 홈 결과 영역에 **이유 + [다시 시도]** 를 보여준다(연결 실패 / 경로 없음 / 응답 지연 3종). 토스트는 앱 전체가 꺼져 있어 예전엔 아무 안내도 안 떴다. 첫 실패는 기존처럼 8.5초 뒤 1회 자동 재시도(실패 안내는 '결과'로 치지 않음).
  - 남은 것: `S.route` 를 쓰는 옛 '지하철 탭 관제'(renderPath/updateRouteDetailUI/startTracking 등)는 엔진 경로에서 S.route=null 이라 휴면 상태 — 다음 정리 후보.
- 시험: `tabs_smoke.ui.test.js` 52개(바꾸기 2개·옛 코드 제거 확인 1개·엔진 실패 안내 1개·공유글 8개 포함) + 나머지 12개 파일 전부 통과(병렬로 돌리면 타이밍 시험 몇 개가 느려 실패할 수 있으니 단독 재실행. `journey_alerts.ui.test.js` 의 '하차 10분 전 추천 알림' 은 정리 전 코드에서도 4번 중 1번꼴로 흔들리는 기존 타이밍 flake).

### 안 쓰는 코드 정리 (2026-10-09)
- 어디서도 참조되지 않는 함수 111개 + 미사용 변수/헬퍼 6개(`_batNativeAvailable` 등), `switchRouteTab` 및 `.kakao-tab` 제거. acorn 도달성 분석 + 블록별 `node --check` + 미선언 식별자 diff(기준선 112개와 동일)로 검증.
- **2차(같은 날)**: `S.route` 는 운영에서 항상 null(대입은 전부 null)이라는 전제로 AST 상수 접기를 적용 → 죽은 `if(S.route…)` 분기 73곳 제거, 연쇄로 호출이 끊긴 함수 35개와 껍데기가 된 함수 7개(`_updateTrackingHUD`·`_rebaseAllFromNow`·`checkArrivalAlerts` 등)와 호출부 제거(약 570KB 감소). 옛 지하철 탭 알림 테스트(`_bgArrivalNotify`) 삭제. 아래 '남겨둔 것'은 1차 시점 기록이며, 남은 `S.route` 참조는 약 90곳(대부분 `startTracking`·`_doArrival`·`startApiPoll` 체인 안쪽).
- **(1차 기록) 남겨둔 것**: `S.route` 가 null 인 운영 환경에서 사실상 휴면인 "지하철 탭 관제" 서브시스템(`startTracking/_doArrival/startApiPoll/detectBoardingState` 등). `_updateTrackingHUD`, `advanceToNextStation`, `_rebaseAllFromNow` 등 13개 가드 함수를 지우면 12곳의 호출이 남아 끊어지므로(여러 살아있는 함수와 얽힘) 되돌렸다. 지우려면 진입점부터 호출 체인 전체를 한 번에 걷어내야 한다.
- 테스트는 단독 실행 권장(병렬 시 타이밍 flake).
- **3차(2026-10-09)**: 숨김(display:none !important) 영역 `#boardSection`의 버튼(toggleTracking/manualBoard/stopTracking)과 한 번도 열리지 않는 모달 `#boardConfirmModal`·`#boardAskModal`이 관제 체인(`startTracking`→`_onGPSUpdate`→`_doArrival`→`onStationArrival` 등)의 유일한 진입점이었음을 확인 → 해당 onclick/모달 제거 후 도달 불가가 된 함수 52개(`startTracking`, `_onGPSUpdate`, `_doArrival`, `renderMap`, `checkRouteOperating`, `calcOptimalDeparture` 등) 제거. 이제 `S.route` 는 조건식 읽기 몇 곳에만 남음. 검증: 12개 스위트 전부 통과 + 무작위 클릭 1,600회 이전 버전과 오류 집합 동일(0건).

### 알림 중복 정리 (2026-10-09, YJ: "출퇴근 알람이 두 번씩 온다 / 같은 시간에 두 번 올 필요 없다")
- **출퇴근 브리핑**: 같은 시각에 ①요일 반복 OS 예약(9110+d·9120+d) ②'정확한 시각' OS 예약(9101·9102) ③앱이 켜져 있을 때 `_cmTick` 이 모두 울렸다. → 반복 예약 폐지, '정확한 시각(at)' 예약만 앞으로 28일치(선택한 요일만) 걸어 둔다(id 9200+i 출근 · 9300+i 퇴근). 앱 시작 4초 뒤와 앞으로 돌아올 때(30분 간격 제한) 다시 채운다. 예전 id 는 취소 목록에 남겨 기존 설치본의 반복 예약도 지운다. `window._cmOsOk===true` 면 `_cmTick` 은 보내지 않는다(웹·예약 실패 때만 직접 발송).
- **하차 10분 전 추천**: 앱을 보는 중에는 팝업+상단 알림이 같이 떴다 → 앱 화면을 보는 중이면 팝업만, 아니면(화면 꺼짐·다른 앱 위) 상단 알림만. PiP 는 코드째 제거했다(아래 PiP 제거 항목). 정책상 '조용히'인 알림이 `navigator.vibrate` 로 울리던 것도 제거(`showNotification` 맨 위 `_vibrateFor` 한 곳에서만 정책대로 울림).
- **환승·하차 알림**: 한 번의 판정에서 둘이 겹치면(환승역과 목적지가 가까울 때) 가장 급한 하나만 보내고 나머지는 보낸 것으로 처리.
- 브리핑 본문의 '피크 시간대' 중복 문구 제거. `_initLocalNotifications` 한 번만 초기화(탭 리스너 중복 방지).
- 28일 넘게 앱을 한 번도 안 열면 예약이 끊긴다(앱을 열면 다시 채워짐).

### PiP(작은 요약 화면) 제거 (2026-10-09, YJ: "pip 죽이고 오버레이 했잖아")
- `_PIP_FEATURE=false` 로 꺼 둔 PiP 의 화면·네이티브 신호·설정 UI 를 코드째 삭제: `_pipEnabled/_pipSetEnabled/_pipEl/_pipPaint/_pipRecoPaint/_pipFit/_pipWant/_pipGrow/_pipSizeOpts/_pipNative/_pipNativeSync/_pipOnResize/_pipSyncToggle/_pipPreview/_pipShow/_pipHide/_pipCheerPaint/_pipMinText`, 관련 상수·리스너·타이머, 설정의 숨김 HTML(주석 처리돼 있던 스위치·미리보기).
- **남긴 것(오버레이가 같이 쓴다)**: `_pipTrip*`·`_pipHasRoute`·`_pipHereIdx`·`_pipStations`·`_pipData`·`_pipClampText/_pipClampLines`·`_pipReco*`(오버레이 3째 줄 추천)·`_arrPipText`·`_pipArmNow`·`_pipIsRealName`·`_pipResultDestName`. 이름만 pip 일 뿐 오버레이·알림·남은시간 계산이 쓴다.
- 1초 감시 루프는 이름을 `_pipTick/_pipTickLoop/_pipWatchTimer` → `_ovlTick/_ovlTickLoop/_ovlWatchTimer` 로 바꾸고, 하는 일을 `_ovlSync()`+`_ovlKeepAliveSync()` 둘로 줄였다(오버레이 갱신·백그라운드 깨우기는 이 루프가 맡는다).
- 네이티브 PiP 는 다음 항목("깨끗하게 정리")에서 걷어냈다.

### 깨끗하게 정리 (2026-10-09, YJ: "확인하고 깨끗하게 정리해줘")
- **앱(www/index.html)**: 어디서도 읽히지 않는 최상위 변수 70개와 함수 3개, 어떤 요소·클래스·토큰에서도 쓰이지 않는 CSS 규칙 209개(@keyframes 포함) 삭제. 6,343,457 → 6,307,758 자. 방법: acorn 으로 사용처 분석 + 동적 클래스(접두어 조합) 검사 + 화면 캡처 비교(홈·노선도·경로 결과 동일).
- **네이티브**: `native/PipPlugin.java` 삭제, 워크플로에서 `registerPlugin(PipPlugin.class)`·`onUserLeaveHint`·`onPictureInPictureModeChanged`·미사용 import 제거. 매니페스트 패치는 `resizeableActivity="true"` 와 configChanges(폴드 화면 변화)만 남김(`supportsPictureInPicture` 는 더 넣지 않음). **APK 설치 후 오버레이·알림·폴드 화면 전환을 실기기에서 한 번 확인할 것**(네이티브는 이 환경에서 테스트 불가).
- **저장소**: PiP 설치 안내였던 루트 `README.md` 삭제(내용이 현재 구조와 맞지 않음).
- **일부러 남긴 것**: `window.median_back_pressed`(외부 Median 브리지가 호출), 이미 정의돼 있지 않던 `rmSuggest` 핸들러(기존부터 있던 것이라 건드리지 않음).
- 검증: 누락 식별자 신규 0건(기준 대비), 스크립트 블록 12개 문법 통과, 테스트 13개 스위트 전부 통과(ride_evidence 62, ride_eta 68 포함), 무작위 클릭 3시드 오류 0.

### 빌드 전 테스트 + 조용히 실패하던 호출 정리 (2026-10-09)
- **CI**: `.github/workflows/build-apk.yml` 에 `test` 작업 추가 — 테스트 14개를 파일별 머신에서 돌리고, 하나라도 실패하면 `build`(APK)가 실행되지 않는다. 테스트 파일은 `test/helpers/pw.js` 로 Playwright 를 불러 로컬(/opt)·CI 양쪽에서 돈다. 새 테스트 파일을 만들면 워크플로의 `matrix.file` 목록에도 넣을 것.
- **정의된 적 없는 이름을 부르던 곳**(정의되지 않은 식별자 110 → 점검): 대부분은 브라우저·Capacitor 전역이거나 `window.x=` 로 만든 전역(오탐). 진짜 문제는 아래 셋.
  - `_metroNextTrainInfo`(노선도 경로 AI 브리핑의 '다음 열차'): 방향 판정이 한 번도 정의된 적 없는 함수를 불러 항상 '하'였다 → 경로 카드와 같은 `_ttSegDir` 로 교체(수정함).
  - `_stopsParamOk`: 거리 검사가 `_hav`(없음)라 try/catch 에 삼켜져 400m 검사가 항상 건너뛰어졌다 → `_distM` 으로 교체(수정함).
  - **(→ 아래 '다음 열차 엔진 이전'에서 TAGO 지하철 코드째 삭제)** `tagoGetNextDep` 이 `_tagoFindNext`(없음)를 불러, TAGO 시각표를 받은 뒤 예외 → 5회 누적 시 TAGO 조회 자동 비활성화. 고치면 실서버 TAGO 호출이 늘어나고 이 환경에서 검증할 수 없어 보류. 쓸지 말지 결정 필요(쓰려면 '정렬된 분 목록에서 baseMin 이상 첫 값' 함수 하나 추가).
  - 남겨둔 무해한 죽은 가드: `typeof closeWriteSheet/clearRoute/clearRouteHighlight==='function'`(정의 없음 → 그냥 건너뜀), `_ttNorm` 대체 람다.

### 지하철 '다음 열차' 계산을 엔진으로 이전 (2026-10-09, YJ: "엔진으로 다 옮겨서 계산은 엔진이 그림은 앱이 그리기로 했잖아")
- **원칙 그대로**: 시각표 데이터·방향 판정·다음 열차 계산은 앱에서 전부 지웠다. 앱은 엔진이 준 값을 그리기만 한다. (앱 −215KB)
- **엔진(route-v2 s11, `route-v2-2026-10-09s11`)** — 소스는 `engine/next-train.js`(계산), `engine/next-train-data.js`(인천 1·2호선 시각표 [차분 압축]·지방 노선 역순서), `engine/next-train-worker.js`(Worker 연결부). `tools/route-speed/patch_nexttrain.js` 가 route-v2 에 앵커 기반으로 끼운다(make.sh 에 포함).
  - `/route-v2-app` 응답의 지하철 구간마다 `ttWaitMs`(다음 열차까지 기다리는 시간, ms; 0~30분일 때만)·`nextTrain`({found,depMin,firstMin,dir}) + 응답에 `ntVer`(시각표 번들 버전). 대기는 앞 구간 대기가 뒤 구간 시각에 이어지게(앱이 합산) 계산한다 — 옛 앱 타임라인과 같은 식.
  - `&bf=1` 쿼리: 앱이 '예상 시각' 모드(기준시각을 직접 고름)일 때 막차 뒤 보정(svcWarn.shift)을 대기 계산에 쓰지 않게 알린다(옛 앱 규칙).
  - `GET/POST /next-train` — `op=board`(승차역에서 atMin 이후 첫 열차 + 방향키) · `op=times`(그날 방향별 출발 분 배열) · `op=info`(첫차/막차 안내) · `op=fwd`(실시간 도착정보 열차가 내 진행 방향인지). POST `{items:[…]}` 는 한 번에 최대 20건.
  - `/ride-eta` 가 `boardInfo:{boardIdx,line,from,to}` 를 받으면 시각표를 엔진이 채운다(옛 `timetable` 이 같이 오면 그걸 우선).
  - 시각표 번들은 gildongmu-tt(`/tt`)에서 받아 KV(`nt:bundle:v1`, 6시간)에 둔다 — **gildongmu-tt 워커는 계속 필요**하다(시각표를 고치면 그 워커만 재배포, 엔진은 최대 6시간 안에 반영). 못 받으면 경로는 그대로 나가고 값(`ttWaitMs`·`nextTrain`)만 빠진다 — 앱은 대기 0 으로 그린다.
  - **배포 순서**: 엔진(s11)을 먼저 배포 → 그 뒤 새 APK. 새 앱 + 옛 엔진이면 지하철 승차 대기가 0 으로 그려진다(오류는 없음). 옛 앱 + 새 엔진은 문제 없다(새 필드를 무시).
- **앱 변경**: ① 경로 변환이 구간의 `ttWaitMs`·`nextTrain` 을 싣는다 ② 타임라인은 `ttWaitMs` 를 더해 그린다 ③ 브리핑 '다음 열차'(`_metroNextTrainInfo`)는 첫 구간의 `nextTrain` 을 옮긴다(탐색 90초 후엔 엔진에 지금 기준으로 다시 묻고 다음 브리핑부터 반영) ④ 승차 시각 재조회(`_boardNextDepTable`/`_boardNextDep`/`_resyncBoardToNextTrain`/`_resolveTrainDepartMs`)는 `/next-train` 비동기 ⑤ 실시간 열차 방향 판정은 `_ntForward`(엔진 `op=fwd`, 결과 기억) ⑥ `/ride-eta` 로는 `boardInfo` 만 보낸다 ⑦ 예상 시각 모드면 요청에 `&bf=1`.
- **앱에서 지운 것**: `_REAL_TT/_GIMPO_TT/_INCHEON_TT/_BUILTIN_TT/LINE_SCHEDULE/_REAL_SEG/_TT_ORDER_HARD` 데이터와 `_ttSegDir/_ttNextDepForSeg/_ttOfficialTimes/getNextDepartureMins/_realNextDep/_incheonNextDep/_gimpoNextDep/_genNextDep/_ttDerivedTimes/_ttOrderOf/_rtArrForward/_boardDirKey` 등 계산 함수, 시각표 번들 내려받기(`_ttApplyBundle/_ttHydrate/_ttFetchBundle`, localStorage `ttBundle`), `loadTimetable`(timetable.json), TAGO 지하철 시각표(`tagoGetNextDep`·`_htlTagoWarm`; 버스용 TAGO 는 그대로).
- **달라진 점(의도)**: ① 환승 후 구간의 승차역을 '그 구간의 진짜 첫 역'으로 본다(옛 앱은 중복 역 제거 때문에 2번째 역을 쓰는 경우가 있었다) ② 날짜 구분(평일/휴일)은 '탐색 요청 시각' 기준(옛 앱은 그릴 때의 기기 시각) ③ 상세 화면의 역별 시각(`_toggleDetailSec` 목록)은 앱의 실측 역간시간 대신 엔진의 `stopSec` ④ 탐색 후 5분이 지나 타임라인 기준이 기기 시계로 바뀐 경우, 대기(ttWaitMs)는 탐색 시각 기준 값 그대로(옛 앱은 그릴 때마다 다시 계산) — 이때는 어차피 재탐색을 안내한다.
- **검증**: ① `test/next_train_parity.ui.test.js` — 엔진 vs 옛 앱 계산(`test/fixtures/legacy_timetable.js`, 앱에서 지운 원본 그대로) 15만 건+진행 방향 1.5만 건 차이 0 ② `test/next_train_attach.ui.test.js` — 경로 4,000개(합성)+실제 엔진 응답 경로 990개의 구간별 대기가 옛 타임라인 계산과 같음, KV/fetch/`/next-train`/`/ride-eta` 모의 ③ `test/next_train_app.ui.test.js` — 앱이 엔진 값을 그리고(실제 엔진 코드가 `/next-train` 에 답함) 앱에 시각표 계산이 남지 않음 ④ 옛 앱 vs 새 앱 실제 응답 990회 렌더 비교(대기 737건 포함): 대기·총 소요·모든 시각 라벨 동일 ⑤ 엔진 s10 vs s11 전체 응답 70건 비교: 기존 필드 차이 0(새 필드만 추가).
- **못 한 것**: 실제 단말·운영 서버에서의 확인(샌드박스에서 workers.dev 접근 불가). 배포 후 확인: `/route-v2-app?...` 응답에 `ntVer`·구간 `ttWaitMs`/`nextTrain`, `/next-train?op=info&line=2호선&from=강남&to=역삼`.

### 시각표 번들 출처 (s13, 2026-10-09) — 중요
- route-v2 워커가 `gildongmu-tt.phg0643.workers.dev` 를 fetch 로 직접 부르면 **404** 가 온다(같은 계정 워커끼리 workers.dev 호출 제한; 브라우저·앱에서는 정상). s11/s12 는 이 때문에 값이 안 붙었다.
- s13 부터 번들(`gildongmu-tt` 의 TT_BUNDLE, tt-2026-09-06)을 엔진에 **내장**(`engine/next-train-tt.js`, 생성: `node tools/route-speed/gen_nt_tt.js <번들.json>`). 우선순위: KV(`nt:bundle:v1`) → 서비스 바인딩 `env.TT_SVC` → 내장본.
- gildongmu-tt 시각표를 새로 배포하면: 새 번들 JSON 을 위 스크립트로 다시 내장하고 엔진을 다시 배포한다(또는 route-v2 에 서비스 바인딩 `TT_SVC` → gildongmu-tt 를 연결하면 엔진 재배포 없이 6시간 안에 반영된다).
- 확인: `GET /next-train?op=info&line=2호선&from=강남&to=역삼` 응답의 `ver`(번들 버전)·`src`(embed|kv|svc).

### 시각표 확장 (s14, 2026-10-09) — 수도권 광역·지방 도시철도 역별 시각표
- 번들(`engine/next-train-tt.js` 에 내장)에 **520역** 추가: 신분당선·수인분당선·에버라인·경의중앙선·GTX-A·서해선·경춘선·경강선·의정부선·우이신설선(TAGO), 대구1~3·대전1·광주1·신림선·공항철도(KRIC, D1 `kric_tt`), 부산1~4호선(부산교통공사 웹). 서울 1~9호선 등 기존 기록은 그대로(`RT[key]` 가 이미 있으면 건드리지 않음).
- 출처·수집 도구(모두 GitHub Actions 수동 실행, 결과는 orphan 브랜치):
  - TAGO: `collect-subway-tt.yml` (tools/collect-tt/collect.js, 비밀 TAGO_KEY) → `data/subway-tt`
  - KRIC(D1 내보내기): `export-kric-tt.yml` → `data/kric-tt`
  - 부산: `collect-busan.yml` (tools/collect-tt/busan.js; POST view.do 에 `updown=0|1` 로 양방향, 행을 파싱해 저장) → `data/busan-tt`
  - 가져오기: `git fetch -q origin +data/<이름>:refs/remotes/origin/<이름>` (force-push 라 `+` 필요) → `git show origin/<이름>:<파일>`
- 변환: `node tools/collect-tt/build_tt.js <기존번들.json> <출력.json> --tago a.json b.json --kric k1.json k2.json --busan busan.json` → `validate_tt.js`(방향 일관성·낮 시간 대기시간) → `node tools/route-speed/gen_nt_tt.js <출력.json>` 로 내장 → 엔진 빌드(make.sh; deploy/speed 의 patch_*.js 는 repo tools/route-speed 것으로 먼저 복사).
- 번들 형식 확장: `_REAL_TT[노선|역] = {D:평일, W:일·공휴일, S:토요일(자료 있을 때만)}`; 엔진은 토요일에 S 가 있으면 S, 없으면 W. `_TT_ORIENT[노선]={order:[역…], fwd:'상'|'하'}` — 'order 번호가 커지는 쪽으로 가는 열차'의 방향 키. 있으면 `_ttSegDir` 가 시각표 상관(xcorr) 대신 이것으로 방향을 정한다(밀집 노선에서 xcorr 가 불안정).
- 알려진 빈칸(엔진은 파생/격자 시각으로 대체): 수인분당 청량리·신길온천, 경의중앙 지평·문산(토)·운천·임진강, 경춘 광운대, 대전 토요일 자료 없음(일요일 대용), 경의중앙은 갈라지는 노선이라 방향을 xcorr 로 정함.
- 시각표는 스냅샷(2026-10-09). 개정되면 위 절차로 다시 수집·내장·배포하거나 TT_SVC 바인딩 사용.

### 시각표 분기 자동 갱신 (s15) — `.github/workflows/refresh-subway-tt.yml`
- 자동 실행: 1·4·7·10월 3일 03:17 KST(cron `17 18 2 1,4,7,10 *` UTC). 수동 실행 시 `dry=true` 면 커밋·KV 쓰기 없이 보고서(Actions 요약)만.
- 흐름: 내장 번들 꺼내기(`extract_embed.js`) → TAGO(10개 노선, `LINES`)·KRIC(D1 `PAIRS`)·부산 수집 → `refresh.js` 가 관리 대상 21개 노선(MANAGED)만 다시 만들어 **달라진 역만** 반영 → 달라졌으면 ① `engine/next-train-tt.js` 재생성·시험·main 커밋 ② **KV `nt:bundle:v1`(route-v2-rows-cache)에 전체 번들 PUT** → 엔진은 재배포 없이 최대 1시간 안에(KV cacheTtl 3600) 새 시각표 사용.
- 안전장치(노선 단위, 걸리면 그 노선은 옛 기록 유지 + GitHub 이슈 자동 생성): 역 수 90% 미만 / 옛 평일 20편 이상 역 중 절반 미만으로 준 역이 30% 초과 / validate_tt 방향 검증이 옛것보다 나빠짐. 새 자료에 없는 역은 옛 기록 유지. 변경이 없으면 버전도 안 올림.
- 엔진 규칙(s15): KV·서비스 바인딩 번들의 `version` 이 내장본보다 사전순으로 작으면 무시하고 내장본을 쓴다(오래된 KV가 새 내장본을 가리지 않도록). 버전 문자열 `tt-날짜+tago-날짜`.
- KRIC 쪽은 엔진이 D1 `kric_tt` 를 크론으로 갱신해 두는 값을 읽는다(별도 갱신 불필요). MANAGED 밖(서울 1·2·4~9호선, 인천, 김포)은 자동 갱신 대상이 아니다 — 아래 '서울·인천·김포 시각표 점검' 참조. 실행 주기는 이후 **매달 3일**로 늘렸다(달라진 게 없으면 아무것도 안 바뀐다).
- 번들 형식 기능(_TT_ORIENT·S)은 엔진 s14 이상이 필요하다 — 엔진 배포 전에 KV 에 새 형식 번들을 올리지 말 것(force 도 엔진 s15 배포 확인 뒤에만).
- 필요한 시크릿: TAGO_KEY, CF_API_TOKEN(D1 읽기 + Workers KV 쓰기), CF_ACCOUNT_ID. KV 권한은 `kv-probe.yml` 로 확인 가능.
- 코레일(KRIC) 보충: TAGO 에 없는 역(신길온천·광운대 등)은 `--kric-fill`(FILL_MAP K1→수인분당선, K2→경춘선, K4→경의중앙선)로 채우고, 방향은 TAGO 종착역 U/D 다수결 + 몇 곳(HAND)만 지리로 직접 지정.

### 공휴일 단일 출처 + 매일 자동 갱신 (s16, 2026-10-09) — `.github/workflows/refresh-holidays.yml`
- **왜**: 엔진·앱에 공휴일 목록이 따로따로 하드코딩돼 있었고 틀렸다(2026 노동절 5/1·제헌절 7/17 누락 — 2026년부터 둘 다 공휴일, 5/25·8/17 대체, 6/3 지방선거 등).
- **구조**: `engine/holidays.js`(단일 출처) → 다음열차(`ntDayInfo`), KTX(LD) 요일 구분, 버스 배차·지하철 주말 판정(`holDowKST`), 앱(`GET /holidays`)이 모두 이걸 쓴다. 데이터 우선순위: KV `nt:holidays:v1` → 내장(`engine/holidays-data.js`). KV가 내장보다 옛것(asOf)이면 무시. 내장본이 없는 해는 고정 양력 공휴일만 인식.
- **자동 갱신(매일 03:40 KST)**: A=정부 특일 API(가중 3, `TAGO_KEY` 그대로 사용 — data.go.kr '특일 정보' 신청 완료), B=Nager.Date(1), C=규칙 계산(2, `tools/holidays/rules.js`: 양력 고정+음력 `Intl` chinese+대체공휴일 법규). 공휴일 = 찬성 ≥2 이고 찬성 > 반대. A가 '완전'하면 `verified`, 아니면 `provisional`. 고정 공휴일 누락·14개 미만·독립 출처 2개 미만이면 이전 자료를 유지하고 이슈("공휴일 자동 갱신: 확인 필요")로 알림. 바뀌면 KV 쓰기(+읽기검증) → 내장본(`holidays.json`, `holidays-data.js`, `www/index.html` HOL_BUILTIN 블록)을 main에 커밋.
- **앱**: `_holName(y,m,d)` — 내장값 + `/holidays`(6시간마다, 로드 2.5초 후, 화면 복귀 시) 캐시 `gdm_hol_v1`.
- **수동 도구**: `node tools/holidays/make_initial.js; gen_embed.js; gen_app.js` (초기값 재생성), 워크플로 `dry` 입력으로 시험 실행.
- **테스트**: `test/holidays.test.js`, `test/holidays_decide.test.js`, `test/next_train_attach.ui.test.js`(앱 내장 공휴일 = 엔진 공휴일, 2026~2028 전 날짜).
- **빌드**: `tools/route-speed/patch_*.js` 를 `deploy/speed/` 로 복사한 뒤 `make.sh`. s16 = 이 모든 것 + 신길온천·광운대 시각표 + '옛 KV 번들 무시' 규칙.
- **미해결/주의**: board-writer(대시보드 배포 서버)에 별도 공휴일 목록이 있으면 `/holidays` 를 부르도록 바꿔야 함(대시보드 배포 필요). 2028년은 정부 API 미공표라 `provisional`.

### 서울·인천·김포 시각표 점검 (s16 이후, 2026-10-09) — 왜 서울 3호선만 자동 갱신인가
- **수집**: `collect-covered-tt.yml`(수동; `COVERED_MODE=1 node tools/collect-tt/collect.js`, 역 ID 접두로 노선을 가림 — TAGO 노선 이름이 '1호선'처럼 도시 구분이 없다. MTRS1<숫자>=서울교통공사 1~8, MTRS99=9호선, MTRKR<숫자>=코레일 구간, MTRGMG=김포, 인천은 노선 이름 '인천1호선' 등). `OUT_DIR` 로 출력 폴더를 바꿀 수 있다.
- **대조**(`tools/collect-tt/compare_covered.js`): 지금 번들과 TAGO 를 역·요일·방향별로 ±1분 허용 짝짓기로 비교(두 자료는 같은 원본이라 초 단위 버림 차이로 ±1분 다르다). 실측 일치도(평일/휴일): 3호선 .95/.96, 5호선 .98/.98, 6호선 .95/.95, 8호선 .94/.95, 인천1호선 .97, 김포 .95/.99 → 같은 원본. 1호선 .59/.63(갈라지는 선로), 4호선 .64/.86, 9호선 .67/.66, 인천2호선 .50 → 차이 큼. **2·7호선은 TAGO 에 일요일 자료가 아예 없다**(03 코드 빈 응답), 토요일(02)은 서울 전 노선 없음.
- **방향이 핵심**: `NT_STNORDER`(앱 역 목록)의 서울 노선 순서는 선로 순서가 아니다. 방향 힌트(`_TT_ORIENT`)는 선로 순서가 확실해야만 맞다. `build_tt.js` 가 번들의 `_REAL_SEG`(실측 인접)로 TAGO 역들의 이웃 그래프를 만들어 '한 줄 경로'(`physicalPath`)나 '첫 역에서 바깥으로 뻗는 나무'(`outwardTreeOK`)일 때만 서울 노선에 힌트를 만든다. 역 ID 순서가 선로 순서와 다른 노선이 있다(7호선 석남→장암 끊김, 8호선 별내선 뒤섞임, 9호선 노량진 위치, 4호선 초지/신길온천). `orient_audit.js` 로 기존 힌트를 점검했고 s14 때 넣은 노선들은 모두 이상 없음.
- **결론**: 서울 3호선만 `refresh.js` 의 MANAGED 에 넣었다(TAGO 일치 .95, 선로 순서가 `_REAL_SEG` 로 43/43 확인, 새 데이터로 바꾸니 방향 판정 오류가 0 — 옛 번들은 종점역에서 방향 라벨이 거꾸로이고 인접 역쌍 2/43 이 같은 방향으로 나왔다). 나머지는 TAGO 로 통째 교체하면 방향 검증(`validate_tt`)이 나빠지거나(5·8·9호선) 일요일 자료가 없어(2·7호선) 자동 교체하지 않는다.
- **감시**: `watch-covered-tt.yml`(매주 월요일 04:10 KST) → `tools/collect-tt/drift.js` 가 나머지 노선의 일치도를 기준선(`drift-baseline.json`)과 비교해 0.1 넘게 떨어지거나 TAGO 역 수가 줄면 이슈 '시각표 달라짐 감시: 확인 필요'를 만든다(바꾸지는 않음).
- **인천·김포는 별도 표**: 인천1·2호선은 엔진 내장 `NT_INCHEON_TT`(`test/fixtures/incheon_tt.json` → `tools/route-speed/gen_nt_data.js`), 김포는 번들 `_GIMPO_TT`. `_REAL_TT` 에 같은 노선을 또 넣으면 두 표가 겹치므로 넣지 않았다.
- 버전 문자열: 같은 날 두 번 바뀌어도 `…2026-10-09.2` 처럼 뒤에 번호를 붙여 사전순으로 커지게 한다(엔진은 내장보다 작은 KV 번들을 무시).
- 앞으로 할 수 있는 것: 7호선(일요일 자료를 다른 출처에서 구하면), 5·6·8·9호선(`outwardTreeOK` 를 잡음 있는 `_REAL_SEG` 에도 견디게 고치고 8호선 별내선 U/D 라벨 확인), 2호선(고리라 `_TT_ORIENT` 모델이 맞지 않음).
- **적용 상태 (2026-10-09 저녁)**: 3호선 TAGO 데이터 + 방향 힌트가 저장소 내장본(`engine/next-train-tt.js`, 버전 `…2026-10-09.2`)과 KV(`nt:bundle:v1`)에 올라갔고 라이브(s16)가 `src:"kv"` 로 읽는다. 확인: 대화→마두=하행, 일원→경찰병원=하행(옛 번들은 둘 다 상행으로 틀렸음).
- **주간 감시 오탐 방지**: 첫 실행이 갱신 워크플로와 동시에 TAGO 를 두드려 호출이 막혀(`UND_ERR_CONNECT_TIMEOUT`) 4·5호선이 '떨어졌다'고 잘못 알렸다(이슈 #2, 닫음). 이제 ① TAGO 를 쓰는 워크플로(`refresh-subway-tt`, `watch-covered-tt`, `collect-*`)는 `concurrency: tago-collect` 로 한 번에 하나만 ② `drift.js` 는 수집 실패 2% 초과·TAGO 쪽 빈 비율 5%p 증가·TAGO 역 수 감소면 '판정 보류'. TAGO 가 통째로 먹통이면 `refresh.js` 의 안전장치(역 수 90% 미만 등)가 옛 기록을 지킨다.
- **갱신 워크플로의 시험 단계**는 Playwright 가 필요하다(변경이 있을 때만 돈다 — 처음 force 실행에서 브라우저 미설치로 실패해 고침).
- **앱이 지원하는 33개 노선 중 시각표 역 누락**: 대구1(5), 대구2(4), 광주1(4), 대전1(3)역 — `NT_STNORDER`(앱 역 목록)와 KRIC 역 이름이 달라서다(대구1 목록에 2호선 역이 섞여 있음 등). 엔진 시각표 문제가 아니라 앱 역 목록(STNDB) 쪽 정리가 필요하다.

### 서울 4·5·6·9호선도 자동 갱신으로 (2026-10-09 밤) — KRIC 사용
- **발견**: KRIC(우리 D1 `kric_tt`, 엔진 크론이 매일 갱신 — S1:1~8·S9:9·KR:1/3/4·NU·GU·IC·GM 등)와 TAGO 는 서로, 그리고 옛 번들과도 같은 원본(±2분)이다. 문제는 옛 번들의 **방향 라벨**: 노선·역마다 뒤집혀 있어 엔진 `segDir` 가 인접 역쌍의 25~30%(5·9호선 실측)에서 같은 방향을 양쪽에 답하거나 못 정했다. 새 자료는 라벨이 일관(KRIC: 도착역 코드가 이 역보다 크면 '하')이고 역 코드 순서가 선로 순서라 `_TT_ORIENT` 힌트를 만들 수 있다 → 모호 0%, 먼 거리 쌍 오류도 0(옛 번들은 소수파 10~30%).
- **채택 규칙**: 서울 노선은 힌트를 만들기 전에 `orient_audit.js` 로 번들의 `_REAL_SEG`(실측 인접)와 대조 — 어긋난 이웃쌍이 2개 이하이고 5% 이하일 때만(갈라짐·자료에 없는 역 정도). 통과: 3호선(TAGO) 0/43, 4호선 2/50(초지가 `_REAL_SEG` 에 없음), 5호선 2/55(마천·하남 갈라짐), 6호선 0/32, 9호선 0/37. 6호선은 응암 순환 역(응암·역촌·불광·독바위·연신내·구산)을 힌트 순서에서 빼고(`ORIENT_EXCLUDE`) 그 역들은 시각표 상관으로 둔다.
- **MANAGED**(refresh.js): 서울 3(TAGO)·4·5·6·9(KRIC) + 기존 20개. 갱신 워크플로 `PAIRS` 에 `S1:4,S1:5,S1:6,S9:9,KR:4,NU:4` 추가. 감시(`drift.js`)에서는 이 노선들을 뺐다.
- **아직 아닌 노선과 이유**: 1호선(갈라짐 10곳 어긋남·코레일 코드 혼재), 2호선(순환선·일요일 자료 없음), 7호선(일요일 자료 없음 + 코드 순서가 석남→장암에서 끊김), 8호선(별내선 코드 어긋남 5곳), 인천·김포(별도 표). 7·2호선은 KRIC(S1:7, S1:2)에도 휴일(9) 자료가 없다 — 같은 원본.
- 대조 허용 오차: ±1분 → ±2분 (9호선은 도착/출발 시각 차이로 2분까지 벌어진다). 감시 기준선도 새로 만들었다.

### 지방 노선 역 목록 정정 + 공휴일 표 통일 + 엔진 s17 (2026-10-09 밤)
- **역 목록 정정**: 대구1(23→35역)·2(23→29)·3(21→30)·광주1(21→20)·대전1(23→22). 앱의 옛 목록은 2호선 역이 1호선에 섞이고(죽전·감삼·두류·내당), 없는 역이 많고, 이름이 바뀐 역(대공원→수성알파시티)·엉뚱한 역(죽곡·태평로·벤처밸리·서광주·용산·시청·광주터미널·용운·대전시청·봉명)이 있었다. 이제 KRIC·TAGO 시각표 역 이름과 100% 일치(검증: 번들 `_REAL_TT` 키와 1:1).
- **좌표 출처**: 공공데이터포털 15093755 「국가철도공단_도시광역철도_역사정보」= 철도 데이터 포털(KRIC) 파일데이터 `전체_도시철도역사정보_20260630.xlsx`(기준 2026-06-30). 받은 방법: `tools/station-coords/probe.js`(워크플로 `probe-station-coords.yml`, 수동) — `https://data.kric.go.kr/rips/dataset/download.file?type=filedata&id=32&operation=1`. 이 자료의 좌표를 `tools/station-coords/regional_coords.json` 에 남기고 `www/index.html` 의 지방 역(`_REGIONAL_STNS`)에 반영. (ODsay 저장본·OpenStreetMap 과 대조해 보니 평균 수십 m 안에서 일치했지만, 최종은 공식 자료를 썼다.)
- **순서 규칙(중요)**: 앱 `_REGIONAL_STNS` 순서 = 엔진 `NT_STNORDER` 순서 = KRIC 역 코드가 커지는 방향(= 하). 광주1호선은 녹동→평동. 앱과 엔진의 방향 판정이 이 순서를 같이 쓰므로(`next_train_parity` 시험이 잡아냄) 한쪽만 바꾸면 방향이 뒤집힌다.
- **KRIC 방향 판정 보정**(`build_tt.js`): 대구1호선 중앙로의 KRIC 역 코드가 3140 이라(나머지는 0115~0149) '코드가 큰 쪽으로 가는 열차=하' 규칙이 모든 열차를 상으로 분류하고 방향 힌트에서도 맨 끝으로 밀렸다. `ORDER_FIX`(대구1·2·광주1·대전1 = `NT_STNORDER`)의 선로 순서로 비교하도록 고침 — KRIC·TAGO 두 경로 모두.
- **공휴일**: 엔진(`route-v2-worker.js`)에는 `LD_HOLIDAYS`(장거리 시간표) 한 곳뿐이었고 `patch_nexttrain.js` 가 이미 `holIs` 로 바꿔 준다. 두 번째 표는 게시판 글쓰기 워커 `board-writer/index.js` 의 `HOLIDAY_NAMES`(2026·2027만) — 이제 시작·크론마다 엔진 `/holidays` 를 받아(6시간 캐시, 4초 시간 제한) 받은 자료에 있는 해는 그것만 쓰고, 못 받으면 옛 표로 대체. 배포는 board-writer 를 따로 Deploy 해야 한다(엔진 재배포와 별개). 저장소 `DullyYJ/route-v2` 커밋 `02f05f0`.
- **엔진 s17**: `NT_STNORDER` 변경 반영(버전 문자열만 s17). s16 대비 차이 = 위 데이터 + 내장 시각표 `.3`. 검증: 구문 검사, `/next-train` 13쌍(대구1·2·3, 광주1, 대전1 양방향) 방향 일치, 앱 시험(attach·parity·app·ride_eta·journey_e2e·latent_refs) 통과.
- **남은 것**: 위 시각표 변경(중앙로 방향 정정)은 갱신 워크플로(`refresh-subway-tt.yml`)를 한 번 돌려야 KV·내장에 반영된다.
- **route-v2 저장소 자동 배포 해제 (2026-10-09 밤)**: 저장소(`DullyYJ/route-v2`) main 푸시가 Cloudflare Workers Builds 로 route-v2 워커를 옛 소스(06f)로 덮어쓴 사고가 있었다. 연결(트리거 `b3bbe542-…`)을 `tools/cf/builds_triggers.js`(워크플로 `cf-builds-triggers.yml`, list/delete)로 끊어 지금은 푸시해도 배포되지 않는다(확인: 푸시 후 check-run 0, 라이브 s17 유지). 저장소의 `route-v2-worker.js` 도 운영 엔진(s17)과 같게 맞췄고 README 에 적어 두었다. 엔진을 새로 빌드하면 그 저장소 파일도 같은 것으로 바꿔 둘 것. 배포는 항상 대시보드에서 직접. 자동 배포를 다시 켜려면 대시보드 Builds 에서 연결(켜기 전 저장소 파일이 운영 엔진과 같은지 확인).

### 경의중앙선·7호선 방향 힌트, 인천·김포 검증 (2026-10-09 밤)
- **경의중앙선**: `build_tt.js` 의 `FIXED_ORDER`(고정 순서) + TAGO 일관성 97% 검사로 `_TT_ORIENT` 를 만든다. KRIC 정답 106쌍 모두 일치(시뮬레이션). 갱신 실행에서 내장에 반영.
- **7호선**: 시각표 자료는 그대로(일요일 자료 없음) 두고 방향 힌트(`_TT_ORIENT`)만 `tools/collect-tt/hints.js` 로 붙인다. KRIC 열차별 정차 순서(가장 긴 열차)를 선로 순서로 쓰고, KRIC 정답과 어긋나는 인접쌍이 늘거나 새로 틀리는 쌍이 생기면 그 쌍의 역을 순서에서 빼고 재확인(최대 6번), 끝내 나빠지면 안 붙인다. 결과: 어긋난 쌍 3→0(논현>학동, 면목>상봉, 먹골>태릉입구). `refresh.js` 5b 단계가 하고, 갱신 워크플로의 'KRIC(D1) 내보내기 — 방향 힌트용' 단계가 `kric-hint.json`(KR:1,S1:1,S1:7,IC:7)을 만든다(`OUT_FILE` 환경변수).
- **1호선**: 힌트를 시험했으나 개선 없음(어긋난 2쌍 = 신창>온양온천, 동인천>제물포: 끝 역 라벨이 반대) → 붙이지 않고 보고서에 '미적용'으로만 적는다. 1호선에는 KRIC 와 시각이 80% 미만으로 맞는 쌍이 74개 있다(소요산~의정부 구간 등) — 어느 쪽이 맞는지는 제3의 출처가 필요해 미해결.
- **8호선·2호선**: KRIC 와 방향 판정이 이미 모두 일치(틀림 0) — 바꿀 것 없음.
- **방향 힌트만 바뀌어도 '변경'** 으로 보고 버전을 올린다(엔진은 KV 번들을 `cacheTtl 3600` 으로 읽고 같은 버전이면 바뀐 줄 모른다).
- **인천1·2호선·김포**: KRIC(IC:I1, IC:I2, GM:G1) 출발 시각과 앱 표를 역·요일별로 맞춰 보니 인천1 99~100%, 인천2 99~100%, 김포 97~100%(±2분, 출발 시각만 비교; 종점의 도착 전용 행은 제외해야 맞는다). 즉 지금 표는 정답이다 — 갱신할 이유 없음. 토요일 자료는 KRIC 에도 없다(평일·휴일만).
- **2·7호선 일요일 자료**: KRIC·TAGO 에 없다. 후보 출처는 서울 열린데이터광장 「서울교통공사_역코드로 지하철 열차 시간표 검색」(OA-101, 1~8호선, 평일/토/일, 2026-10-09 갱신)이며 인증키(시간표용)가 필요하고 한국 IP 중계 경유가 필요할 수 있다. 키 확보 전엔 진행 불가.

### 서울 열린데이터광장 시간표 API 연결 + 종점 역 출발 시각 정정 (2026-10-09 밤)
- **API**: 「서울교통공사_역코드로 지하철 열차 시간표 검색」 `http://openapi.seoul.go.kr:8088/{KEY}/json/SearchSTNTimeTableByFRCodeService/{from}/{to}/{FR_CODE}/{WEEK_TAG}/{INOUT_TAG}/` — WEEK_TAG 1 평일·2 토·3 휴일(일), INOUT_TAG 1 상행·내선 / 2 하행·외선. 키는 GitHub Actions 시크릿 **`SEOUL_TT_KEY`**(일반인증키, YJ 등록). **GitHub Actions 에서 호출 가능**(Cloudflare 출구는 따로 시험 안 함 — 실시간 API 는 거부했음). FR 코드 = 2호선 201~243, 3호선 309~, 4호선 405~, 5호선 510~, 6호선 610~, 7호선 709~761, 8호선 804~. **1호선·9호선은 이 API 에 없다**(코드 100~899 훑어 확인 — 1호선 미해결은 그대로).
- **도구**: `tools/seoul-tt/probe.js`(시험), `collect.js`(1~8호선 298역×평일·토·일×상·하 = 약 29만 행, 약 4분; 키는 로그·결과에서 가림), `compare.js`(번들과 대조), `terminals.js`(종점 역 정정). 수동 워크플로 `probe-seoul-tt.yml`·`collect-seoul-tt.yml`(결과 브랜치 `data/seoul-tt`, `data/seoul-tt-all`). 갱신 워크플로(`refresh-subway-tt.yml`)가 매번 수집(실패해도 계속)해서 `refresh.js --seoul` 의 5c 단계가 종점 정정을 한다.
- **대조 결과**: 2~8호선 평일·일요일 모두 번들과 98~99% 일치(±2분). **토요일 시간표 = 일요일 시간표(100% 동일)** 라 토요일에 휴일 기록(W)을 쓰는 지금 동작이 맞다 — S 기록 추가 불필요. 2·7호선 일요일 자료는 이미 맞았다(출처 확인 완료).
- **종점 역 정정**: 번들의 종점 역 기록 일부에 '출발'이 아니라 들어오는 열차의 '도착' 시각이 들어 있었다(예: 7호선 장암 평일 05:48 = 도착, 실제 출발 05:35). 서울 시간표의 출발 시각(LEFTTIME)으로 그 역·요일·방향 키만 바꾼다. 조건: 서울 출발 행이 한 방향뿐(종점) · 번들도 한 방향 키뿐 · ±2분 일치 90% 미만 · ±12분 일치 80% 이상 · 편수 차이 8% 이내. 바꾼 곳(.6): 7호선 장암·석남, 8호선 별내·모란 등 8곳. KRIC 와도 일치해 7호선 '시각일치낮음' 2→0. 이미 맞는 곳은 건드리지 않아 멱등.
- **공휴일 → 게시판**: 같은 계정 워커끼리 workers.dev 로 부르면 404(진단 `bw_diag` k=holidays status 404). 그래서 갱신 워크플로(`refresh-holidays.yml`)가 D1 `holidays_live` 표에도 사본을 두고, board-writer 가 `env.DB` 로 읽는다. 배포 후 `bw_diag` 에 `ok:true, years:[2026,2027,2028]` 확인.

### 1호선 구간 시각표 KRIC 재작성 (2026-10-09 밤, 번들 .7)
- `tools/collect-tt/seg_fix.js`: 1호선 구간(연천~광운대, 광운대~구로, 구로~인천, 구로~신창)을 KRIC 출발 시각으로 다시 만든다(`refresh.js` 5b). 방향은 `north`(`northKey:'상'`)로 명시. 갈라지는 역(금천구청 등)은 정차 순서 밖 다음 역이 3% 넘으면 건너뛰고, 열차 10대 미만이면 건너뛴다. 광명·서동탄 지선은 새 어긋난 쌍(금천구청>광명)이 생겨 제외.
- 안전장치: 다시 만든 뒤 `hints.wrongPairs` 가 늘거나 새 어긋난 쌍이 생기면 되돌린다. 두 번째 실행은 '변경 없음'(멱등).
- 확인: 소요산>동두천 첫 열차 등 웹 시간표와 일치.

### 버스 운행시간 — '타는 시각' 기준 재탐색 + 막차 뒤 분류 정정, 엔진 s18 (2026-10-09 밤)
- **증상(YJ 제보, 인천 서구 아라동 → 구의, 23:15 출발)**: 버스만으로 총 113분, 타임라인 00:20~00:36인데 배너가 "버스이(가) 아직 운행 시작 전이에요 / 2000번(아직 운행 전) / 아래 시각은 버스 첫차 05:30 기준". 재현은 1700번(막차 22:30)으로 됐다 — 같은 종류.
- **원인 3가지**: ①엔진 그래프는 '출발 시각'에 운행 중인 노선만 넣고, 타는 시각 확인(`svcAtBoard`)은 경로를 다 고른 뒤 경고만 붙였다 → 타는 시각엔 끝난 버스로 경로가 나옴. ②`svcOffState` 가 자정 넘은 시각(막차 뒤)을 '첫차 전(before)'으로 분류. ③앱이 버스에도 "첫차 기준"이라 적었지만 엔진은 지하철만 첫차로 옮기고 버스 시각은 옮기지 않는다.
- **엔진(`tools/route-speed/patch_svcboard.js`, make.sh 에 추가, 버전 s18)**: ①`svcOffState` = 막차 끝난 뒤 경과 vs 첫차까지 남은 시간(원형)으로 가까운 쪽(after/before). ②`dijkstra` 를 감싸(`dijkstraRaw`) 결과에 버스 경고(`svcWarn` type=bus)가 있으면 그 노선을 막고(`G.svcBan`) 최대 8번 다시 탐색. 경고 없는 결과를 얻으면 그걸 쓰고(`svcRerouted:true`), 못 얻으면 원래 경로 + 경고(정직한 안내). 모든 `dijkstra` 호출(탭 전부·장거리 접근/이탈 포함)에 적용. `svcWarn` 버스 항목에 `rk`(노선 키)·`first` 추가.
- **검증**: 합성 시험 `tools/route-speed/test/svc_board.test.mjs <엔진.js>`(낮 경고 없음 / 23:20 출발 X노선 → Y노선 재탐색 / 대안 없음 → after 경고). s17 대비 무작위 질의 비교 — 16시: 420건 차이 0, 23:10·00:40: 버스 경고가 없던 결과는 전부 동일(차이 0), 경고가 있던 결과의 약 60~65%가 경고 없는 경로로 바뀜(나머지는 대안 없음). 밤에는 재탐색 때문에 탐색 시간이 늘 수 있다(질의당 약 2배, 경고 있는 질의만).
- **앱(`www/index.html`)**: `_svcModeText` 조사(버스가/지하철이), `_svcFootText` 신설 — "첫차 기준" 문구는 지하철에만, 버스는 엔진 state 그대로(before: 첫차 이후부터 탈 수 있어요·옮기지 않았어요 / after: 막차가 지난 시각이에요). 앱은 계산하지 않고 옮겨 적기만 한다.
- **배포**: 엔진 s18 파일을 Cloudflare 에서 Deploy(YJ).

### 게시판·실시간소통 로딩 단축 (2026-10-10)
- **원인(코드 추적, 실측 아님)**: ①board-writer `fetch` 가 모든 요청 앞에서 `holRefresh`(D1 왕복 3번)를 기다림 — 격리가 새로 뜨는 첫 요청이 그만큼 늦음. ②`ensureLineRoom` 이 격리마다 표 만들기 3번을 차례로 기다림. ③workers.dev 에서는 엣지 캐시(`caches.default`)가 동작하지 않는다(Cloudflare 문서: 사용자 지정 도메인에서만) → `/posts`·`/talks`·`/lroom` 의 '5~30초 캐시'가 사실상 없었고 6초 폴링이 매번 D1 로 감. ④`/lroom` 은 대화·지연 제보 집계(질의 3개)를 차례로, `/posts` 는 열 목록 조회 2개를 차례로 읽음. ⑤앱 호선 방은 첫 응답까지 '불러오는 중…'만 보임(게시판·전체 대화는 이미 사본이 있었음).
- **서버(`route-v2/board-writer/index.js`)**: 공휴일 읽기는 `ctx.waitUntil`(응답과 별개) · `ensureLineRoom` 은 batch 1번을 응답과 별개로 보내고 표가 없다는 오류가 나면 기다렸다 한 번 재시도 · `/posts`(15초)·`/talks`·`/lroom`(5초) 격리 메모리 스냅샷(글·제보·댓글 POST 때 비움) · `/lroom` 대화+집계 동시 조회, `lrAlerts` 두 질의 동시, `/posts` 열 조회 동시 · 댓글 표 색인 `idx_comments_post`(post_id, ts) 1회 생성. 시험: `test/board_writer_userposts.test.mjs`(16), 신규 `test/board_writer_speed.test.mjs`(쓰기 직후 읽기·메모리 캐시·표 없음 재시도).
- **앱(`www/index.html`)**: 호선 방을 열면 6시간 안에 받아 둔 사본(`lrc:<호선>`, 최근 60줄)을 먼저 그리고 새 글만 이어 붙임 · `/lroom` 요청 12초 제한(응답 없을 때 busy 가 안 풀리던 문제).
- **배포**: board-writer 는 대시보드에서 붙여 넣고 Deploy(YJ). 앱은 main push → APK.
- **미확인**: 실제 단축 폭은 이 환경에서 workers.dev 에 못 붙어 측정하지 못했다. 배포 뒤 앱에서 체감 확인.

### 게시글·댓글·실시간소통이 밤새 멈추고 문장이 깨지던 문제 (2026-10-10)
- **원인(D1 실측)**: ①무료 Gemini 키는 `gemini-2.5-flash-lite` 하루 약 20회뿐(이 키에서 2.5-flash·2.0-flash 는 404). 소통방 18개가 4시간치씩 미리 만드느라 오후 16시 한도 초기화 직후 16회를 써 버리고, 21:30경부터 다음 날 오후까지 429 → 글·댓글·소통방 모두 정지(템플릿 폴백은 6개월 중복 원장에 걸려 0개). ②temperature 1.15 가 flash-lite 에서 "치맥… 🍗… 🤤" 같은 말줄임표 조각을 만들었다.
- **서버(`board-writer/index.js`)**: 한도가 따로 잡히는 Gemma(`gemma-3-27b-it`, `-12b-it`)를 예비 모델에 추가, 소통방 대량 생성은 Gemma 먼저(`GEM_BULK_ORDER`) · gemini-* 는 24시간 `GEMINI_TALK_BUDGET`=8회까지만 소통방에 씀(나머지는 게시글·댓글 몫, 사용량은 bw_diag `gemuse`) · 400·403 도 다음 모델로 넘어감 · ListModels 로 이 키에서 쓸 수 있는 모델 탐색(bw_diag `gemmodels`, 3시간에 한 번) · temperature 0.9~0.95 · `parseJsonArr`(설명 문구가 붙어도 JSON 추출) · `aiJunk`(말줄임표 2개 이상·이모지 2개 이상·글자 없음 거름, 소통방·글·댓글 모두) · 소통방 미리 만드는 길이 4→6시간, 시간당 최소 9→6개, 한 번에 최대 60개 · 읽을 때도 AI 글 중 말줄임표 2개 이상은 숨김(`LR_HIDDEN_SQL`, 행은 지우지 않음, 이용자 글은 대상 아님).
- **시험**: `test/board_writer_gemma.test.mjs`(flash-lite 429 → Gemma 로 459개 생성, 깨진 문장 저장 안 됨, 기존 깨진 AI 글 /lroom·/talks 에서 숨김, 이용자 글 유지) + 기존 16개·speed 통과.
- **배포 뒤 확인**: `SELECT k,v FROM bw_diag WHERE k IN ('gemmodels','gemuse','linetalks') ORDER BY ts DESC LIMIT 10` — gemmodels 에 gemma 가 있고 linetalks.gem.model 이 gemma 인지. 이 키에서 Gemma 도 404/429 면 같은 정지가 반복되므로 Gemini 유료 전환(결제 설정) 또는 다른 키가 필요.
- **미확인**: 이 환경에서 Gemini API 에 직접 못 붙어 Gemma 가 이 키에서 실제로 응답하는지는 확인하지 못했다(모의 응답으로만 시험).

### 오버레이를 앱 경로 화면 모양으로 · 환승 합치기 엔진 s19 (2026-10-11 오후)
- **오버레이(`native/OverlayPlugin.java`, `www/index.html`)**: 검정 바탕 3칸(지나간 곳·현위치·다음) 대신 앱 경로 화면(타임라인)과 같은 **카드(테마의 `--card`) + 다섯 칸**(정류장명 · 노선 라벨 `931번`/`↔ 노선` 배지 · 점과 선 · 시각)으로 그린다. 현위치 칸(앱 화면처럼 둘째 칸, 끝에서는 뒤로 밀림) 글씨만 테마 글자색(밝은 테마에서 검정), 나머지는 `--sub` 회색. 현위치 점은 주황+은은한 테두리. **정류장명은 한 줄, 칸보다 길면 `…`** (`TextUtils.ellipsize`). 남은시간·추천 제목 줄도 회색.
- **데이터**: `_ovlStrip()` 이 `_transitNodeData[_pipHereIdx()].el` 의 부모(타임라인 줄)에서 칸 네 줄(이름·라벨·axis·시각)을 DOM 그대로 읽어 `{n,t,g,gp,gc,lc,rc,dc,dk}` 로 `Overlay.update({cells, cur, theme:{bg,fg,sub}})` 에 보낸다(웹이 정하고 네이티브는 그리기만). 타임라인 DOM 을 못 읽으면 `_pipStations().path` 이름 목록으로 대신, 끄기 `window._ovlStripOff=true`(예전 track 3칸 데이터만 보냄 — 이 경우 네이티브는 `line1` 한 줄만 보여 준다). 이동 중(`moving`)이면 현위치↔다음 칸 사이 선이 깜박인다(예전 화살표 `-->` 대체, 정차 중엔 그대로). 하차 임박 무지개 테두리·탭하면 앱 열기·드래그 이동은 그대로.
- **APK 재빌드 필요**(네이티브 변경). 컴파일은 CI 에서만 확인(로컬에 Android SDK 없음) — Build APK 가 실패하면 `OverlayPlugin.java` 의 `StripView`/`update()` 부분부터 볼 것.
- 시험: `test/overlay_strip.ui.test.js` 13건(실제 `_renderHtlTrack` 로 그린 타임라인과 칸 대조, 창 이동, 다크 테마, 예비 경로, 끄기 스위치). `overlay_stale`·`journey_alerts`·`journey_e2e`·`tabs_smoke`·`ride_sheet` 회귀 통과.
- **엔진 s19 (route-v2 `4e4e5b9`, 저장소 파일만 갱신 — 배포는 대시보드에서 직접)**: `collapseLeapfrog` — 첫 버스 R1 → R2 환승인데 R2 가 R1 의 승차 정류장 S 도 지나고 S→환승 정류장 X 구간이 있으면, 환승 대기를 R2 실제 도착(S 의 실시간 목록 + 이미 지난 앞 차 가상 1~2대)으로 다시 계산해 직행(S 에서 R2)이 환승보다 180초 안쪽으로 늦으면 한 구간으로 합친다(`transfers`·`totalMin` 같이 보정). 환승이 정말 빠르면 그대로 두고 대기만 늘려 잡는다(`raise`). 순환 노선 제외. 시험 `test/leapfrog.test.js` 6건. 증상: 75번→인천e음89(갈현교입구) 가 처음부터 e음89 와 같은 시간인데 환승으로 나옴.

## 2026-10-11 추천 문구 엔진 (광고처럼 보이지 않게 — 날씨·요일·시간·월급날을 읽는다)
- `www/index.html`: `_arrCx(arrMs)`(상황: 기온·체감·강수확률·일교차·요일·내일 휴일 여부·24~26일) / `_arrHook(slot, cx, menu)`(아침·점심·저녁·야식·쇼핑별 규칙표 `_ARR_HOOKS`, 맞는 규칙이 없으면 `_ARR_HOOK_DEFAULT`) / `_arrPickDrink(cx)`(더우면 아이스·추우면 따뜻한 음료) / `_arrShopLine(it, cx)`(쿠팡 아이템 한 줄: 비·추위·더위 상품은 이름으로 먼저, 그다음 테마 `_ARR_SHOP_SAY`).
- 규칙: ① 사실만(없는 값은 말하지 않고 다음 규칙으로) ② '추천·할인·구매·지금 주문' 같은 광고 말투 금지 ③ 모든 한 줄 26자 이하(오버레이 한 줄). 같은 날·같은 시각엔 같은 문구, 날짜가 바뀌면 바뀐다.
- `_arrBuildAlert`: 본문 4번째 줄 = 상황 문구(예전 `_ARR_WIT_*` 위트 대신). 쇼핑은 '오늘의 추천 ·' 라벨을 없애고 상품 이름 + 상황 이유. 반환값에 `hook`·`hookStrong`·`cx`. `_arrPipText`(오버레이 a/b 줄): 음식 = 상황 문구 + 근처 가게(없으면 부드러운 문장), 쇼핑 = 상황 이유 + 상품 이름.
- `_arrFireAlertNow`: 상황 규칙에 맞은 문구(`hookStrong`)는 AI 문구(`_arrAiCopy`)로 덮어쓰지 않는다. 평범한 날(규칙 없음)엔 예전처럼 AI 문구.
- 쿠팡 아이템 팝업(`_showBriefingModal` shop)에 상품 사진(`item.i`, 없거나 못 불러오면 숨김). 밥집·카페는 사진 데이터가 없어 넣지 않았다(소상공인 CSV·D1·카카오에 사진 없음 — Google Places 사진은 유료·키 필요).
- 시험: `test/overlay_reco.ui.test.js` 50건(③ 엔진: 26자·금칙어, 비/추위 우선순위, 날씨 없을 때 지어내지 않음, 월급날, 음료·기온, 아이템 테마 전부, AI 덮어쓰기 조건, 사진). 앞쪽 테스트가 바꾼 함수를 ②부터 되돌리도록 정리.
- 실기기 확인 필요: 실제 날씨(/weather)가 들어온 상태의 문구, 오버레이 하단 두 줄 길이.

## 2026-10-12 상단 알림·진동·오버레이 테두리를 세 시점으로 제한
- YJ: "오버레이 알림은 환승 1정거장 전 · 목적지 2정거장 전 · 1정거장 전에 엣지 하이라이트와 진동. 상단 알림도 이 부분만 하고 나머지는 다 없애줘."
- 세 시점 = 환승 1정거장 전(`transfer`, 제목 '환승 준비') · 목적지 2정거장 전(`near_arrive2`) · 목적지 1정거장 전(`near_arrive`, '곧 하차'). `_NOTIF_TOP` 에 있는 종류만 `_notifAllowed`(상단 알림)·`_vibeAllowed`(진동)가 true. 환승 2정거장 전·목적지 도착·GPS 근접·하차 전 추천 알림·출퇴근 브리핑 예약·이동 중 상주 알림(id 1, 꺼질 때 남은 것 한 번 지움)은 나가지 않는다. 예전 동작: `window._notifLegacy = true`.
- 기능 스위치는 따로: `_featureAllowed(type)` = 예전 `_notifAllowed`(설정 토글 기준). 하차 전 추천의 오버레이 하단 줄·앱 안 팝업은 이걸 본다(상단 알림만 빠짐). 화면 밖일 때 추천은 오버레이 하단으로만 보인다(진단 문구도 그렇게 표시).
- 오버레이 테두리: `_ovlAlertLevel` 이 `_ovlAlertLevelRaw` 를 감싼다. 뒤에 더 탈 구간이 있는 구간(환승역)은 2단계 없이 1정거장 전(1단계)부터, 최종 구간은 2단계→1단계. 구간 끝 = 걷기 노드 또는 노선(lineName) 변경. 단계가 켜지거나 바뀐 시각을 `window._ovlAlertAt` 에 남겨 `alertAt` 으로 보낸다.
- 오버레이 진동(네이티브 `OverlayPlugin.vibrateAlert`): update() 의 `alert>0 && alertVibe && alertAt 이 새것(마지막 진동 시각과 다름, 20초 이내)` 일 때 한 번. 2단계 = 두 번, 1단계 = 세 번. 웹의 `alertVibe` 는 설정의 환승/도착 알림 스위치를 따른다. **네이티브 변경 — APK 재빌드 필요**(컴파일은 CI 에서만 확인).
- 남은 상시 알림: 백그라운드 위치(@capacitor-community/background-geolocation)가 안드로이드 규칙상 쓰는 포그라운드 서비스 알림 '길동무 경로 안내'는 없앨 수 없다(없애면 화면이 꺼진 동안 위치 추적이 끊긴다).
- 설정 > 알림 종류 목록에서 'GPS 근접' 행 삭제, 설명 갱신.
- 시험: journey_alerts 47건(새 정책·환승 오버레이 장면·예전 동작 보존), journey_e2e 24건, overlay_reco 50건 갱신. **실기기 확인 필요**: 오버레이 진동 세기·횟수, 환승역 1정거장 전 테두리.

## 2026-10-12 오버레이 칸이 40개에서 끊기던 문제
- 증상(YJ: "오버레이가 신길에서 끊겼어"): 버스 정류장·1호선 역이 많은 긴 경로에서 오버레이 맨 끝으로 넘기면 40번째 칸(신길)에서 끝났다. 앱 타임라인은 공덕·청구까지 계속 있었다.
- 원인: `_ovlStrip` 이 N=40 칸만 잘라 보냈다(네이티브 상한도 60). 긴 경로는 칸이 50개를 넘는다.
- 수정: 웹 N=120, 네이티브 `Math.min(arr.length(), 150)`. 시험: overlay_strip 에 '칸 45+개 긴 경로가 끝까지 간다' 추가(이전 코드에서는 40/57 로 실패).
- 참고: 칸이 많아질수록 오버레이 갱신 JSON 이 커진다(120칸 ≈ 20KB). 값이 바뀔 때와 20초 하트비트에만 보낸다.

## 2026-10-13 인천1호선 시험 주행 제보 — 늦게 누른 탑승 · 오버레이 한 역 늦음 · 도착 뒤 종료 · 센서 끔
**원칙(YJ 재확인): 모든 계산은 엔진, 앱은 증거를 모아 보내고 답을 그림만 그린다.** 이번 건의 판정은 전부 엔진에 있다 → **엔진 3개 파일을 Cloudflare 에 다시 배포해야 동작**한다(`engine/ride-track.js`, `engine/next-train-worker.js`, `engine/ride-eta.js`). 배포 전 엔진이면 앱은 아무것도 안 바꾸고 기존대로 간다(영점·도착 종료 없음, 1분 전 차량 인정 없음 = 예약).
- **1분 전 차량 인정**: 엔진 `/next-train?op=late&line&from&to&atMin&back=1&baseMs` → `{dk, depMin, late}`; 시각표상 지금 분~한 분 전에 떠난 차가 있으면 `late`=그 출발 분, 없으면 null. 앱 `_rsLateCheck` 는 승차역 600m 넘게 먼 위치가 분명하면 묻지 않고(증거 확인), 답에 `late` 가 있고 예약·구간이 그대로면 `_rsPress(true)`. 끄기 `window._rsLateOff = true`. 시험 `next_train_late.test.js` 9건, `ride_sheet` ⑩.
- **영점 · 도착 확인**: 엔진 `/ride-track` 에 `plan.stops:[{i,lat,lng,arrMs,fin?}]` + `want.zero:true` 를 보내면 `zero:{stops:[…], final}` 로 답한다. 각 정류장(중간 포함) 시각표 도착 15초 전~30초 뒤(45초)에 정확도 150m 이하 GPS 가 정류장 200m(최종 250m, 오차 반경 뺌) 안이면 `state:'near'`(`apply:true` — 도착 3초 전부터). 앱 `_zeroFollow` 는 apply 인 정류장까지 `_gpsMaxIdx`/`_gpsConfirmIdx` 만 올린다. **시각표(arrTime)·통과 시각(_nodePassMs)·엔진 증거는 건드리지 않는다**(GPS 가 오차범위에서 잡혔다 = 제대로 달리는 중이라는 확인일 뿐). 안 잡혀도 벌 없음. 최종 목적지 `final.verdict`: `confirmed` → `_arrEndFinish`(= × 와 같은 정리: 오버레이·백그라운드 위치·상주 알림·예약 알림), `unknown` → 앱 아래 `#arrEndBar` + 오버레이 맨 아래 줄 **[안내 종료]** 버튼, `notyet`/`verify` → 아무것도 안 함(버튼이 떠 있었다면 내림). 늦게 도착해도 30분까지 최근 45초로 다시 판정. 마지막 칸이 도보인 경로는 보내지 않는다. 앱은 승차 확정 뒤 1초 틱(`_arrEndPoll`)에서 8초 간격으로 요청만 한다(위치 소식이 끊긴 지하에서도 '위치 없음'을 엔진이 알 수 있게). 확인 창이 열려 있고 앱이 보이면 위치를 10초마다 한 번 더 받아 증거로 쌓는다. 끄기 `window._arrEndOff = true`(`_stnZeroOff` 도 같은 효과). 시험 `ride_track.test.js` 53건(엔진), `arrival_end.ui.test.js` 28건(진짜 엔진으로 응답 — CI 매트릭스 등록).
- **오버레이가 한 정거장씩 늦음**: PF 위치(`_pfPosOverride`)는 구간 비율이 85% 에서 막히는데 `_pipHereIdx` 다음 역 문턱이 0.9 라 PF 가 다음 역을 채택할 때까지 현재 역에 머물렀다 → `_OVL_NEXT_RATIO = 0.75`. (앱이 혼자 한 역 앞서 읽던 PF lead 는 **걷어냈다** — 계산은 엔진. 증거가 끊긴 백그라운드에서는 GPS 가 잡혀야 영점으로 따라잡는다.)
- **앱이 뒤로 갈 때 즉시 갱신**: 웹 `앱→뒤`·`visibilitychange(hidden)` 에서 `_ovlSync(true)`, 네이티브 `handleOnStop` 에서 0.3·1.5초 뒤 웹을 깨움(`wakeWebSoon`). 진단 `오버레이송신`.
- **이동 중 다음 역 이름 진하게**(네이티브 `StripView.onDraw`).
- **가속도 센서 끔**: `_pfMotionStart()` 가 `window._pfSensorOn !== true` 면 바로 반환.
- **탑승 확정 뒤 시각표 기준 이동(YJ 결정, 2026-10-13)**: 지하철 탑승이 확정되면(`_ttFirstOn()` = `_trkSubConfirmed`) 앱이 `/ride-eta` 에 `timetableFirst:true` 를 보낸다. 엔진은 ① '증거가 없다 = 연착'으로 도착시각을 미는 연착 푸시를 끄고 ② 정차 25초(`stopDwellSec`)로 `pos:{from,to,t0,t1,ratio,moving,floor}`(어느 역에서 어느 역으로, 몇 시부터 몇 시까지)를 답한다. 앱은 `window._etaPos` 에 받아 `_estimateTimelinePos` 가 시각→비율로 **그리기만** 한다(바닥 = `_gpsMaxIdx`, 환승 대기 `_xferHoldIdx` 유지). 오버레이는 같은 pos 에서 here=`fromIdx`, 이동 중=ratio∈(0,1) (`_pipHereIdx`/`_ovlMoving` 의 `_ttf` 분기) → 앱 마커와 오버레이 마커가 한 데이터. 도착(중간 경유 포함)은 위 영점(GPS)이 확인하되 시각표는 안 바꾼다. 끄기 `window._ttFirstOff = true`(옛 증거 우선·PF/셀 경로가 그대로 남아 있다). 옛 엔진(pos 없음)이면 `_etaPos=null` 이라 옛 경로로 간다.
- **알려진 한계**: GPS 없는 지하에서 기지국 선행 기록이 실제 통과보다 늦게 찍히면 엔진이 '선행 → 1~3분 뒤 통과'로 읽어 도착시각이 뒤로 밀리고 마커가 한 역쯤 뒤처진다(`cell_hop_lead` 정시·미학습 셀 MAE 0.82, 한계 0.9 로 완화). 실기기 기지국 기록 지연은 미검증. 증거가 오래 끊긴 채 열차가 실제로 늦으면 시각표 기준 마커가 열차보다 앞설 수 있다(GPS 영점이 잡히면 바닥이 올라가 따라잡는다 — 앞서는 쪽은 못 내린다).
- **실기기 확인 필요**: 엔진 배포 후 영점·도착 종료·버튼·시각표 기준 이동, 네이티브 즉시 갱신·다음 역 강조(APK 재빌드), 백그라운드에서 탑승~도착까지 앱이 살아 있는지(보장 안 됨).


## 2026-10-13 캐릭터 3D 렌더링 — 경로탐색 로딩 · 오버레이 추천 (YJ: "고양이는 걷고 강아지는 뛰고 독수리는 날고 올챙이는 수영하고 두더지는 땅에서 나오게 · 예전 방식은 안 돼, 무조건 3D")
- **방식**: 3D 모델(three.js 로 만든 6종 — 돌솜·뽀푸 강아지 둘, 러블 고양이, 챙챙 올챙이, 술 독수리, 두덩 두더지)을 미리 렌더링한 **동작 프레임 시트**를 시간 순으로 그릴 뿐이다(변형 없음). 실시간 3D 연산은 없다. 시트 = `www/chars3d/<id>.webp`(256px 칸 4×4, 16프레임 루프) + `dudung_intro.webp`(14프레임, 땅에서 솟는 장면). 동작: 고양이 걷기(대각 다리), 돌솜·뽀푸 뛰기(공중에 뜸), 술 날갯짓, 챙챙 꼬리 물결 헤엄, 두덩 솟은 뒤 뒤뚱 걷기.
- **앱 로딩(`_RC`)**: 옛 한 장 그림(가로줄 일그러뜨림) 방식과 `www/chars/` 는 **지웠다**(폴백 없음). 시트는 앱 시작 때 바로 읽어 두고, 읽기가 어긋나면 700ms×n 간격(최대 12회)으로 다시 받는다. 시트를 받는 동안에만 예전 로딩 바퀴가 보인다. 두덩은 `x0`(화면 16%)에서 솟은 뒤(1초) 걸어 나가고, 나머지는 왼쪽 밖에서 들어와 오른쪽으로 지나간다. 크기·속도·바닥 높이는 `_RC.d3`(cell/base/ox/fps/T/lift).
- **오버레이 추천(네이티브 `OverlayPlugin.RecoView`)**: 같은 시트(`public/chars3d/<id>.webp`)를 줄 뒤에서 올라온 자리에서 제자리 프레임으로 재생(독수리 +16dp·올챙이 +6dp 띄움). 옛 `bmp()`·손으로 짠 까딱 모션은 지웠다. 시트 읽기에 실패하면 1.5초 뒤 다시 읽는다(그동안은 그리지 않음). 시트는 지금 쓰는 두 캐릭터만 메모리에 둔다(시트 하나 ≈ 4MB). 문구·시각·갈 곳은 그대로 웹이 정한다.
- **다시 렌더링하려면** `tools/chars3d/`(models.js = 모델·동작, render.html = 카메라·조명, export.js = 프레임 뽑기, assemble.py = 시트 만들기; 사용법은 export.js 머리 주석). 모델을 고치면 시트를 다시 뽑아 `www/chars3d` 로 복사하고, 크기·바닥 높이가 달라지면 `_RC.d3` 와 `OverlayPlugin.cfg3` 도 같이 맞출 것.
- **시험**: `loading_chars.ui.test.js` 28건(시트 크기·동작 프레임 변화·두덩 솟기·읽기 실패 뒤 재시도·reco 캐릭터 둘).
- **한계·미확인**: 3D 모델은 원본 그림을 본떠 직접 만든 것이라 원본과 똑같지는 않다(색·비율·소품은 맞췄지만 털결·표정은 다르다). 실기기에서 보지 못했다 — 네이티브 오버레이 그리기(APK 재빌드 필요, 컴파일은 CI 에서 확인), 로딩 크기 비율, 시트 4MB 비트맵의 메모리·부드러움.

## 2026-10-13 캐릭터를 원본 그림 그대로 3D화 + '추천 캐릭터 미리보기' 버튼 (YJ: "2D 이미지와 너무 다르게 생겼다 · 똑같이 3D화 · 도착 추천 때 어떻게 나오는지 보게 테스트 버튼")
- **원본 얼굴·가슴·배를 3D 머리에 덧씌움(decal)**: 원본 스프라이트(`tools/chars3d/src2d/*.webp`)에서 머리(독수리 가슴, 두더지 주둥이·배 포함)를 잘라(`prep_tex.py` → `tex.js`, 투명 가장자리 색 번짐 처리) 모델 머리의 +x 반구에 평면 투영한 구 조각으로 붙인다(`models.js decal()`, 발광 0.5 + 틴트 0x9a9a9a 로 조명에 안 죽게). 그래서 눈·코·표정·털 무늬가 원본과 같다. 몸은 둥근 치비 비율로 다듬었다(강아지 머리 0.66×0.58×0.72, 몸통 털뭉치 제거 + 범프맵 털결, 뽀푸 목걸이 반지름 0.34).
- **각도**: 모델은 +x 를 보고 카메라는 +z. yaw -π/2 가 정면이라 **yaw -0.85(3/4 정면)** — 강아지·고양이·두더지 -0.85, 올챙이·독수리 -0.8. 옛 -0.4 는 옆모습에 가까워 얼굴이 돌아가 보였다.
- **다시 뽑는 순서**: `prep_tex.py`(원본 자르기, 사각형 표는 파일 안) → `export.js`(프레임, 2패스 자동 카메라, `fr/meta.json` 에 view/base/ox) → `assemble.py`(시트) → 시트를 `www/chars3d` 로 복사 → `fr/meta.json` 의 base·ox 를 `index.html _RC.d3` 와 `OverlayPlugin.cfg3` 에 옮김. 올챙이 꼬리는 한 덩어리 메쉬를 프레임마다 CPU 로 휘게 한다(`P.tailUpdate`). `tex.js`·`three.min.js`·`fr/`·`out/` 는 커밋하지 않는다(three r160 min 을 같은 폴더에 두고 실행).
- **현재 `_RC.d3`**: dolsom cell86 base250 ox121 / lovel 88·249.5·133 / ppopu 88·248.5·120.5 / chaeng 88·244.5·154.5(lift12) / sul 104·230.5·131 / dudung 106·222.5·128(intro14). `loading_chars` 시험 ⑤ 가 D3 base 와 시트의 가장 낮은 불투명 행(±3)을 대조한다.
- **미리보기 버튼**: 설정 > '하차 10분 전 추천' 카드의 **[추천 캐릭터 미리보기]**(`#rcDemoBtn`, `_ovlRecoDemo()`). 누를 때마다 다른 두 캐릭터 조합(6쌍 순환)으로 오버레이 추천을 **14초** 보여 주고, 아무 곳이나 누르면 닫힌다. 앱이 화면에 있어도 뜬다. '다른 앱 위에 표시' 권한이 없으면 토스트. 네이티브 `OverlayPlugin.recoDemo({ch,ch2,a,b,go,secs})`: 현재 오버레이 상태를 저장(`demoSaved`) → 데모 칸 3개(지나간 곳/미리보기/다음 정거장)와 추천 필드를 채우고 `demoUntil` 까지 `refresh()` 가 `show = wanted && (!appVisible || demoActive())` 로 강제 표시. 데모 중 웹 `update()` 는 무시, 끝나면(`endDemo`) 저장해 둔 상태로 복원. 구버전 앱에서는 '이 앱 버전에서는 미리보기를 지원하지 않아요'. **네이티브 변경 — APK 재빌드 필요(컴파일은 CI)**.
- **시험**: `loading_chars.ui.test.js` 32건(미리보기 버튼 6회 클릭 → 서로 다른 유효 조합이 6캐릭터를 모두 덮음·문구 26자 이하·권한/미지원 토스트).
- **알려진 플레이크**: `tabs_smoke` 의 '내 글 삭제'는 CPU 경합 때 타이밍으로 가끔 실패(3D 이전 버전에서도 재현). 실패 잡만 다시 돌리면 통과.
- **한계·미확인**: 푸들·비숑 털뭉치, 고양이 다리, 독수리 날개의 세부는 원본과 다르다(얼굴·색·비율 위주로 맞춤). 실기기에서 오버레이의 모양·크기와 미리보기 버튼, 시트 4MB 비트맵 메모리는 보지 못했다.

## 2026-10-14 추천 오버레이: 캐릭터 하나가 오른쪽에서 줄을 끌고 들어옴 · 위아래 잘림 수정 · 광고에 실제 가게·상품 이름 (YJ: "좌우로 움직이게 · 랜덤 하나가 우측에서 광고를 쫙 당겨서 · 위아래로 잘림 · 실제 식당명·카페명·쿠팡 제품명")
- **연출(네이티브 `OverlayPlugin.RecoView`, 전면 교체)**: 추천이 뜨면 웹이 무작위로 정한 캐릭터 **하나**(`reco.ch`, `ch2` 는 더 이상 보내지도 그리지도 않는다)가 줄 왼쪽 칸(58dp)에 서고, 캐릭터+줄 묶음이 오른쪽 화면 밖에서 왼쪽으로 1.15초 동안 들어온다(처음부터 걷다가 끝에서 서서히 멈춤, 앞으로 5° 숙임). 시트는 오른쪽을 보는 그림이라 **왼쪽으로 갈 때는 좌우 반전**(`cv.scale(-1,1)`), 줄을 다 끌어온 0.3초 뒤 줄 쪽으로 돌아서서 동작을 0.6배 속도로 늦춘다. 캐릭터→줄 사이에 밧줄(선 뒤에는 약간 처짐).
- **잘림 수정**: 예전엔 캐릭터가 줄 '뒤'에서 올라와 `clipRect` 로 윗부분만 보였고 줄 높이만 늘어났다. 지금은 캐릭터가 줄 옆 칸 전체(`rowDp()` 62dp)를 쓰고 `clipRect` 가 없다. 몸 높이(`bodyDp`: 일반 50 · 챙챙 46 · 술 38) + 띄운 높이(`cfg3[4]`: 챙챙 6 · 술 16) ≤ 58dp. 새 캐릭터·크기를 넣을 땐 이 부등식을 지킬 것(시험이 소스를 읽어 확인한다).
- **광고 문구**: 웹 `_arrAd(a, slot)` → `{k, a, b}`. a = 실제 가게 이름(`a.place.n`, 없으면 `a.spots[0]`) 또는 쿠팡 상품 이름(`a.shop.n`), b = '거리 · 업종'(식당·카페) 또는 지금 상황에 맞춘 한 줄(`_arrShopLine`). `_arrFireAlertNow` 의 `send()` 가 `window._pipReco.ad` 에 싣고, `_ovlLines().reco` 가 `ad` 가 있으면 a(40자)·b(28자)를 첫·둘째 줄로 보낸다(없으면 예전 문구 두 줄 — 가게 후보가 하나도 없는 곳에서만). 네이티브는 이름을 13sp→10.5sp 까지 줄여 맞추고 그래도 길면 '…'. 알림 본문·[보기] 가 가리키는 곳과 같은 가게다(이미 `_arrBuildAlert` 가 고른 것).
- **[추천 캐릭터 미리보기]**: 이제 캐릭터 하나 + 실제 데이터 — `_ovlAdSample(kind)` 가 카페·식당은 맛집 탭이 들고 있는 근처 목록(`_foodPublicData`, 업종 정규식 `_ARR_CAFE_RE`/`_ARR_NIGHT_RE`), 쿠팡은 `_shopPick().rec` 에서 고른다(추천 기록은 건드리지 않는다). 누를 때마다 캐릭터(6종 순환, 시작은 무작위)와 종류(카페→쿠팡→식당)가 바뀐다. 목록이 하나도 없으면 가짜 이름을 만들지 않고 '가게 이름이 여기에 나와요 / 맛집 탭을 한 번 열면…' 안내만 보인다.
- **시험**: `loading_chars.ui.test.js` 40건(reco 에 ch 하나·ch2 없음, `_arrAd` 규칙, 광고가 reco 줄에 실리는지, 시연 줄에 실제 이름, 네이티브 소스의 칸 높이·clipRect 없음·좌우 반전).
- **실기기 확인 필요(보지 못함)**: 줄이 끌려오는 속도·밧줄 모양·돌아서는 타이밍, 좁은 폰에서 긴 상품 이름이 줄어드는 정도, 캐릭터 크기(50dp). 네이티브 변경이라 APK 재빌드 필요(컴파일은 CI).

## 2026-10-14(2) 추천 줄: 글자 키움 · 추천 설명 두 줄 · 업종별 한마디 (YJ: "광고판에 문구가 너무 없다 — 제품·식당·카페별로 추천 음식이나 제품을 날씨·시간에 맞게 설명 · 글자 키워줘")
- **글자 크기(네이티브 `RecoView`)**: 이름 16sp(길면 12sp 까지 줄임, 그래도 길면 …) · 설명 13.5sp 최대 **두 줄**(띄어쓰기에서 끊고 마지막 줄만 …) · 거리/종류 12sp · 버튼 13sp(높이 34dp). 줄 높이는 글 양에 맞춰 달라진다(`layoutFor`: 최소 70dp, 캐릭터 칸 = 몸 58·52·44dp + 띄움 ≤ 66dp). 새 필드 `reco.m`(거리·종류, `recoDemo` 의 `m` 도).
- **배치**: 글자 칸이 210dp 이상이면 버튼은 오른쪽 가운데, 거리·종류는 이름 줄 오른쪽(안 들어가면 따로 한 줄). 폰처럼 좁으면(`stack`) 버튼을 글 아래 줄로 내리고 거리·종류는 그 줄 왼쪽. 폰 폭 360dp 에서 줄 높이 약 120dp(시뮬레이션 기준)로 커진다 — 부담스러우면 `layoutFor` 의 desc 줄 수(2)를 1 로.
- **설명 문구(웹 `_arrAd(a, slot, destStn)` → `{a, b, m}`)**: 식당·카페 = 상황 문구 엔진(`_arrHook`: 날씨·기온·요일·월급날) + (아침이면 메뉴+브런치 권유) + 문구가 짧으면 업종별 한마디(`_ARR_FOOD_PITCH` — 국밥·치킨·햄버거·피자·고기·분식·중식·일식·한식·카페 + 기본). 메뉴에 맞는 가게(spots)가 있으면 그 가게+메뉴, place 만 있으면 그 가게 업종 이름으로 말한다(안 파는 메뉴를 권하지 않음). `m` = 거리 · 업종 · 걸어서 N분(1km 이하, 70m/분). 가게 상세(거리·업종)는 `_arrFoodList(destStn)` 에서 이름으로 찾는다. 쿠팡 = `_arrShopSay`(기온·강수·상품 성격) + 상품별 이유 `_arrShopLine`(너무 일반적이면 대체, 숫자가 겹치면 생략), `m` = 상품 분류 · 쿠팡.
- **미리보기 버튼**: 실제 발사와 같은 길로 만든다 — 식당은 `_arrBuildAlert('', null, 지금+10분)` → `_arrAd`(21시 이후·심야면 18:30 저녁 시간대로), 쿠팡은 `_shopPick`. 가게 추천 기록(`_arrRecoMark`)이 한 번 남는 부작용이 있다(발송 기록은 아님).
- **시험**: `loading_chars.ui.test.js` 45건(`_arrAd` 카페·점심(spots/place)·저녁·야식·쿠팡 규칙, 설명 길이, 시연 줄에 이름·설명·m, 네이티브 글자 크기·stack 규칙).
- **실기기 확인 필요**: 글자 크기가 적당한지, 폰 폭에서 줄 높이(약 120dp), 설명이 잘리는 정도. 설명 문구는 문구 엔진 후보를 날짜·시각으로 고르는 방식이라 같은 날·같은 시각엔 같은 문구가 나온다.


## 2026-10-13(2) 경로 탭 섞임 수정: 최단=복합 최단 · 최소환승=복합 최소환승 · 버스=버스만 · 지하철=지하철만 (YJ: "탭을 누르면 각자 맞는 경로가 나와야 해, 지금 혼합된다")
- **원인(엔진)**: ① `XPEN.minTransfer` 가 900초라 "환승 1번 줄이려고 15분 더 걸리는 경로"는 안 골라 최소환승이 환승 3번짜리가 나왔다. ② 지하철 탭(`o.subway`)이 `mustSubway` 만 걸려 있어 중간에 버스가 섞였다. **원인(앱)**: `_doSelectRouteOption` 폴백 체인이 sub/bus 경로가 없으면 다른 탭(fast/less/…) 경로로 바꿔 그렸다.
- **엔진(`route-v2-worker.js`, `route-v2-2026-10-13s2`)**: `XPEN = {minTime:480, minTransfer:7200, minWalk:150}` (최소환승은 시간보다 환승 횟수 우선, 같으면 빠른 쪽). `dijkstraRaw` 에 `opt.noBus` 추가(버스 노드·버스 간선 금지). `_search()`: `subway = {mustSubway, subwayNearest, noBus}`, `bus = {noSubway}`. 지하철 탭은 `subwayTabRoute()`: 가까운 역이 걸어서 12분 이내면 버스 없이 지하철만(noBus), 12분 넘게 멀거나 지하철만으론 못 가면 버스+지하철(역까지 버스) 중 더 빠른 쪽 — YJ 정정: "버스를 타야 하는 경우는 버스를 태워야지, 경로없음은 말이 안 된다". 둘 다 없을 때만 null. 시험: `test/tab_modes.test.js` 8건.
- **앱(`www/index.html`)**: `_showTabNoRoute(type)` — 지하철/버스 탭에 엔진 경로가 없으면 "지하철만으로(버스만으로) 갈 수 있는 경로가 없어요"만 보이고 타임라인·확정 버튼은 숨긴다(`window._tabNoRoute`). 다음에 경로가 그려지면 `_renderTransitResultCard` 첫 줄의 `_clearTabNoRoute()` 가 복원. 폴백 체인은 최단↔최소환승 사이에만 남고 `all[]` 순회도 fast/less 만. 앱은 계산·대체하지 않고 엔진이 준 경로만 그린다. 시험: `test/tab_no_mix.ui.test.js` 13건(예전 앱에서는 4건 실패).
- **주의**: 지하철 탭의 "없음"은 지하철 경로가 정말 하나도 없을 때만 나온다. 버스 탭은 지하철 금지(버스만으로 못 가면 "없음"). 엔진 배포 전까지는 앱만 바뀐 상태 — 엔진을 배포해야 실제 경로가 바뀐다.
- **실데이터 확인 못 함**: 송도 사례는 이 환경에서 라이브 엔진을 못 불러 합성 그래프 시험으로만 검증했다. 배포 후 송도에서 4개 탭을 직접 눌러 확인 필요.

## 2026-10-13(3) 엔진 s3: 새벽버스 저녁 운행 · 한 정거장 버스 · 최소환승 50분 도보 (YJ 실기기 스크린샷: 송도→고려대)
- **새벽A148이 19:20 에 나옴**: 서울 새벽·심야 노선은 `bus_routes.start_time/end_time` 이 null 이라 기본 04~24시로 취급됐다. `busSvcNameWindow()` — 이름이 `새벽*` 이면 03:30~05:30, 심야버스 `N숫자` 면 23:30~05:00(자료에 시각이 있으면 그것이 우선). 시각은 추정치(공식 시간표 아님).
- **같은 곳에서 타고 내림(지식정보단지역(4번출구)→지식정보단지역 240m)**: 원인은 정류장→역 도보 연결 `addBus`. 격자(CELL 0.003°≈265~333m)를 ±1칸만 훑어 '500m 안'이 실제론 265~530m 로 들쭉날쭉 → 걸을 수 있는 정류장이 연결 안 돼 버스 한 정거장을 타야 했다. ±2칸으로 넓혀 500m 를 정확히 지킨다. 추가로 `HOP_WALK_M`(600m) 안 한 정거장 버스 뒤에 곧장 걷는 길이 있으면 걷기로 바꾸는 후처리를 `dijkstraRaw` 에 넣었다. **주의**: 정류장↔역 도보 연결이 늘어나 경로 전반이 약간 달라질 수 있다.
- **최소환승이 53분 걸음**: 처음 걷는 구간은 환승으로 세지 않아 환승 1번(XPEN 7200)보다 걷기가 싸게 계산됐다. `WPEN.minTransfer` 1→5 (약 24분 걷기 ≈ 환승 1번).
- 시험: `test/tab_modes.test.js` 12건(옛 엔진은 3건 실패 — 한 정거장·새벽·최소환승 도보). 로컬 재현: 송도(37.355,126.66)→고려대, D1 에서 버스 정류장 2218행을 받아 엔진을 직접 돌림(`순환43`·`앰코코리아(블루오션골프클럽)` 가 스크린샷과 일치). ENGINE_VERSION `route-v2-2026-10-13s3`.
- 미확인: 실제 배포 엔진에서 송도 4개 탭 재확인 필요. 새벽 버스 운행 시각은 추정.

## 2026-10-13(4) 엔진 s4: 시뮬로 찾은 최소환승 직행 놓침 + 로컬 시뮬레이터
- **시뮬 결과(서울·수원·부산·송도 정류장 자료, 750쌍×4지역, 5개 시간대)**: 지하철 탭 버스 섞임 위반 예전 엔진 133~375건 → 새 엔진 0건. 새벽버스 시간 위반 서울 146건 → 0건. 최소환승 평균 환승 서울 0.49→0.44, 수원 0.89→0.71, 부산 0.79→0.60, 송도 0.38→0.32(소요 +1~4분). 최단시간 평균은 그대로(31.2→31.3 등).
- **새로 찾은 문제**: 탐색 중엔 같은 정류장에서 노선만 바꿔도 환승(XPEN)으로 세지만 나중에 `collapseLeapfrog` 가 '그냥 계속 타기'로 합쳐 실제 환승은 0 이다. 환승 비용을 7200 으로 키우니 환승 0번 직행(26분)을 놓치고 환승 1번(47분)을 고르는 경우가 생겼다. → `pickMinTransfer()` : 최소환승 탭은 후처리까지 끝나 환승 수가 확정된 후보(minTransfer·minTime·minWalk·지하철·버스) 중에서 환승 적은 순 → 빠른 순으로 고른다(처음 걷기 20분 초과 제외, 전부 길면 그대로).
- **남은 것**: 한 정거장(<600m) 버스 구간이 전체의 1~1.4%(서울 20건은 350m 미만) — 대부분 버스→버스 환승 사이의 2정거장이다. 수원 똑버스(수요응답)는 출발·도착 정류장 이름이 같게 나온다.
- **로컬 시뮬레이터** `test/sim_tabs.js <엔진> <D1결과.json> <쌍수> <라벨>` — D1 의 `bus_route_stops JOIN bus_routes` 결과(지역 bbox)를 파일로 받아 엔진을 직접 돌린다(라이브 접속 불필요). ENGINE_VERSION `route-v2-2026-10-13s4`.

## 2026-10-13(5) 엔진 s5: 지하철 탭 — 탄 버스가 바로 닿는 역이 있으면 환승시키지 않는다 (YJ 스크린샷: 순환43 → 테크노파크 → 6777-1 → 지식정보단지역)
- 원인: `subwayTabRoute` 의 버스+지하철 경로가 `subwayNearest`(출발지에서 가장 가까운 역에서만 승차) 를 강제 → 첫 버스가 바로 테크노파크역에 닿는데도 버스를 갈아타 가까운 역(지식정보단지)까지 갔다.
- 수정: 버스로 역까지 가는 경우는 어느 역이든 승차 가능(`mustSubway` 만). 후보 = minTime·minTransfer 탐색 + 순수 지하철(있으면). 가장 빠른 것보다 5분·20% 넘게 느리거나 처음 걷기 25분 초과는 제외, 남은 것 중 환승 적은 순 → 빠른 순. 가까운 역이 걸어서 12분 이내면 예전처럼 순수 지하철.
- 시뮬(4지역 750쌍): 지하철 탭 평균 소요 수원 51.5→47.4분, 환승 1.90→1.32회, 버스 2번 이상 쓰는 경로 송도 104→40, 부산 66→31, 수원 303→210. 시험 `tab_modes.test.js` 14건. ENGINE_VERSION `route-v2-2026-10-13s5`.

## 2026-10-13(6) 승용차를 탔는데 역으로 잡힘 + 버스는 GPS 더 / 지하철은 시각표+역마다 영점 (YJ 스크린샷 17:38, "역으로 지나가지도 않았는데 역으로 잡혔어")
- **원인(시험으로 재현)**: 위치 판단기 PF(`_pfApplyLive`→`_pfAdopt`) 의 상태가 지하철역뿐이라, 버스로 시작하는 경로에서 승용차로 달리기만 해도 '역에 있다'는 믿음이 정규화돼 첫 채택(conf≥0.6)이 **버스 정류장을 건너뛰고 지하철역으로 진행도(`_gpsMaxIdx`)를 올렸다**(역 근처를 지나지 않아도). 그러면 `_trkSubConfirmed()` 가 참 → 이탈 판정 중단·시각표 우선(`_ttFirstOn`)까지 이어졌다. 승차 '확정'도 차량 속도만으로 서므로 승용차·택시가 버스로 읽혔다.
- **엔진 `/ride-track`(engine/ride-track.js, 워커에 내장 → ENGINE_VERSION `route-v2-2026-10-13s6`)**:
  - `bus` 판정(요청 `plan.busLeg={boardPt,boardIdx,proof?}`, `plan.stops[].planMs/bus`): `confirmed`(탑승 버튼·실시간 차량 매칭) · `plausible`(승차 정류장 150m 안을 지났고 계획보다 앞서 달리지 않음) · `notBus`(차량 속도로 움직이는데 승차 정류장을 지난 적 없음[`no_stop`], 또는 뒤 정류장 2곳 이상에 처음 계획보다 5분 넘게 먼저 닿음[`ahead`]) · `idle` · `unknown`(궤적이 움직임 시작을 덮지 못함 — 아무 일도 안 함). 움직임 시작 시각을 앱이 모르면 엔진이 궤적 맨 앞의 정지→출발로 찾는다. 지하철 '확정'이어도 버스를 안 탔으면 거짓이라 notBus.
  - `mode`(위치를 무엇으로 잡을지, 엔진이 정함): 지하철 탑승 확정 = `{kind:'sub',gps:'zero'}`(시각표로 움직이고 GPS 는 역마다 영점 — 기존 `timetableFirst`·`want.zero` 그대로) · 버스 탑승(confirmed/plausible) = `{kind:'bus',gps:'heavy',snapM:500,advanceSec:8}`(GPS 정류장 투영 반경 200→500m, GPS 로 정류장을 올리는 간격 15→8초).
- **앱(www/index.html, 판정 없음 — 증거를 보내고 답을 따른다)**: `_trkBusLeg()`(승차 정류장 좌표·증거 이름 전송) · `_trkPlanMs()` · `_trkApply`: notBus 두 번 연속이면 `_handleOffRoute()`(현재 위치에서 재탐색, 쿨다운 2분) · notBus 동안 `_trkSubConfirmed()` 거짓 + 진행도 올리지 않음 · 버스 모드일 때 `_snapM`/`_advMs9` 를 엔진 값으로. **`_busGapBetween()`**: 아직 지나지 않은 버스 정류장 너머의 역으로는 PF 채택·셀 추정(`_cellAssist`)이 진행도를 올리지 못한다(근본 수정).
- **시험**: `test/ride_track.test.js` 73건(bus·mode 추가), `test/ride_car_not_bus.ui.test.js` 8건(승용차 시나리오 — 옛 앱 4건 실패, 새 앱 통과; 진짜 버스는 재탐색 없이 bus 모드). 워커 `/ride-track` 직접 호출로 확인.
- **한계(정직)**: 실기기·라이브 검증 없음. 승차 정류장 150m 안에서 승용차로 출발해 계획 시각대로 달리면 plausible 로 남는다(속도만으로 버스와 승용차를 가를 수 없다 — 탑승 버튼·차량 매칭이 확실한 증거). 승용차 상태가 계속되면 재탐색이 2분 간격으로 반복될 수 있다.
- **배포 순서**: 엔진(워커 s6)을 먼저 배포하고 APK. 엔진 없이 앱만 나가면 notBus 판정이 안 와서 `_busGapBetween`(PF 건너뜀 차단)만 작동한다.

## 2026-10-13(7) 시각표 창 밖에서 닿은 열차의 시각 영점 + 마커 안 굳기 + 오버레이 이름 (YJ 로그 17:35~18:07, "선학에 시간표보다 빠르게 왔는데 위치는 맞고 시간이 안 맞춰져")
- **원인(로그로 확인)**: ① 영점(`rtZeroStop`)은 '표시 도착 15초 전 ~ 30초 뒤' 창에서만 GPS 를 본다. 열차가 표시보다 1~2분 빨리 닿으면 창 밖이라 못 보고(선학: 표시 18:08, 실제 ~18:06:48), 위치(진행도)만 다른 길(PF·기지국·복귀 스냅)로 올라가고 통과 시각은 엔진에 가지 않았다(`정확도` 줄이 선학엔 없음). 또 `_maybeRecordPass` 는 이미 PF·기지국 시각이 찍힌 역이면 GPS 통과를 버렸다. ② 영점 로그가 '시각표는 그대로' — 영점은 진행도만 올렸다.
- **엔진 `/ride-track` zero(워커 `route-v2-2026-10-13s7`)**: 요청 `plan.stops[].pass:true` 인 정류장은 표시 도착 시각 앞 5분~뒤 7분(`passAheadSec`·`passLateSec`)의 넓은 창에서 **정확도 60m 이하** 좌표가 **150m 안**에 든 가장 가까운 순간을 `passMs`(+`passDistM`, `passEarlySec`=통과−표시 초)로 돌려주고 `apply:true`. 판정·시각은 전부 엔진, 앱은 적기만 한다.
- **앱**: `_arrEndStops` 가 승차역 뒤·환승 승차역 아닌·아직 GPS 로 못 박지 않은 역에 `pass:true`. `_zeroFollow` → `_zeroStampPass(s)`: `passMs` 를 `_nodePassMs[i]`·src `gps` 로 적고(PF·기지국의 약한 시각은 덮어씀) `_recalcArrivalsFrom(i)` 로 엔진에 다시 묻는다 → 엔진(`/ride-eta`)이 뒤 시각을 밀거나 당긴다(시험: 신연수 −1.45분·선학 −1.5분 GPS → 수준 −1.22분, 문학경기장 18:09→18:08). 앞 역보다 이르게 찍힌 값·뒤 GPS 역보다 늦은 값·이미 같은 값은 버린다. 로그: `영점 … 통과 −1.5분(표시 대비) 시각 반영`.
- **마커 굳음(노란색)**: 백그라운드에서 `/ride-eta` 응답이 끊기면 마지막 `pos` 구간이 끝난 채 굳어 `_ovlMoving()` 이 false(= 주황). 엔진이 `pos.segs`(앞으로 14구간)를 함께 주고 앱 `_estimateTimelinePos` 가 지금 시각이 드는 구간을 찾아 이어 그린다(찾기만 한다). 원인은 로그로 확정하지 못했고(추정) 진단 줄 `시각표위치`가 다음 로그에 남는다.
- **오버레이 이름**: 엔진 `/ride-eta` `op:'labels'` 가 6글자 + `…`, 이동 중 `다음역(이동중)` 을 만든다. 앱은 받은 값을 그린다. 네이티브 `pill` 필드는 APK 필요.
- **시험**: ride_track 88 · ride_eta 74 · ride_press_labels.ui 16(버튼 덮어쓰기·GPS 확인·마커 segs·이름·영점 통과 시각) · ride_car_not_bus.ui 8.
- **한계(정직)**: 지하 구간은 GPS 정확도가 100m 대라(`GPS무시`) 60m 이하 좌표가 없으면 통과 시각을 못 찾는다 — 그 역은 PF·기지국 시각(약한 증거)으로 남는다. 실기기 검증 없음. 테스트 중 시계 어긋남·환승 승차 고정(`_xferOK`)으로 마커 시험이 잠시 실패했던 건 시험 쪽 문제였다.
- **배포 순서**: 워커 s7 먼저, 그다음 APK.

### 2026-10-13(7) 추가 — 밀고 당기는 영점 · 마커가 계속 엔진에 묻기 (YJ: "박촌과 굴현 도착시간이 같아", "역 도착 때마다 시간을 앞뒤로 밀고 영점", "마커도 계속 엔진에 위치를 물어봐라", 워커 `route-v2-2026-10-13s9`)
- **원칙 확인**: 계산은 엔진, 앱은 증거를 보내고 받은 값을 그린다. 이번에 앱이 구간·비율을 계산하던 분기(진행도가 구간표보다 앞설 때)를 **뺐다** — 대신 엔진에 다시 묻는다.
- **엔진 `/ride-eta`(영점 따라가기, `zeroFollow:1`)**: 가장 최근 통과가 GPS(src `gps`)면 `지연 수준 = 통과 − 예정` 그대로(deadband·부드러운 추정 없이) → 뒤 시각을 일찍 닿으면 당기고 늦게 닿으면 민다. 두 GPS 통과 사이 약한 증거(PF·기지국) 역은 두 GPS 시각 사이를 예정 비율로 나눈다. 약한 증거끼리는 예정 간격의 `minRunRatio`(0.6)만큼 앞서게 해 같은 시각으로 뭉치지 않는다(PF 몰림 → 박촌=굴현 18:38 증상). GPS 통과가 추정과 `zeroMaxJumpMin`(6분) 넘게 다르면 이상치로 보고 쓰지 않는다.
- **엔진 `/ride-eta` `notYet:[idx]`**: GPS 가 '아직 안 닿았다'고 한 다음 정류장은 시각표 기준에서도 연착으로 본다(지금+0.5분으로 올리고 뒤를 민다). 증거 없음만으로는 안 민다.
- **엔진 `/ride-track` zero**: `plan.stops[].pass:true` 정류장에 `passMs`(일찍·늦게 닿은 열차의 통과 시각, 넓은 창 −5분~+7분, 정확도 60m 이하·150m 안)와 `notYet`(표시 도착이 지났는데 신선한 GPS 가 앞 정류장과 이 정류장 '사이'에서 400m 넘게 멂)을 준다.
- **앱(그리기·전달만)**: `_zeroFollow` — 진행도가 오르면 즉시 `_etaRequest('pass')` · `passMs` 를 gps 증거로 적고 엔진에 다시 묻기(`_zeroStampPass`) · `notYet` 를 `_etaNotYet` 에 모아 `/ride-eta` 입력 `notYet` 으로 보내기 · `_etaApply` 후 오버레이 즉시 갱신 · 가려진 동안에도 네이티브 틱마다 `_etaRequest('tick')`(15초 간격) · `_estimateTimelinePos` 는 진행도가 받은 구간보다 앞서면 엔진에 다시 묻고(4초 간격) 그동안만 그 역에 둔다 · `마커` 진단 줄(30초마다 시각표기준·엔진구간·그림·이동·진행도).
- **시험**: ride_eta 76 · ride_track 96 · ride_marker_follow.ui 8(옛 앱은 엔진 구간이 낡으면 정지·한 역 늦음으로 재현, 새 앱 통과; 늦는 열차 notYet·빠른 열차 passMs 끝에서 끝까지) · ride_press_labels.ui 16.
- **한계(정직)**: 지하 구간은 GPS 정확도가 60m 넘는 경우가 많아 그때는 영점이 없다(PF·기지국·시각표로 감). 엔진 답이 계속 안 오면(백그라운드 네트워크 끊김) 진행도가 앞선 역에서 마커가 굳을 수 있다 — `마커` 진단 줄로 확인. 실기기 검증 없음.
- **후보 경로 오탐 수정**: 추천 안 한 버스(급행 등)로 경로를 바꾼 직후 엔진 `bus` 가 notBus('ahead')로 답해 재탐색이 도는 회귀가 있었다 → 앱이 `_applyRiddenRoute` 뒤 `proof:'ridden'` 을 보내고(엔진 `rtBus` 가 confirmed 로 인정), 엔진은 `ridden.ok` 인데 notBus 면 plausible(`candidate_route`)로 낮춘다. ride_bus_guard 25/0 · ride_car_not_bus 8/0.
- **엔진 질문 간격 5초**(YJ: "15초는 너무 길다, 앱·오버레이 모두 5초"): `_ETA_TICK_MS` 15000→4500(네이티브 오버레이 틱 5초가 쓸려 나가지 않게 약간 짧게). 오버레이 네이티브 틱(`TICK_MS`)은 원래 5초. 엔진 호출이 3배 늘지만 워커 한 번이 가볍다.
- **배터리 최적화 제외 안내**(YJ: "설치 시 배터리 최적화 제외도 요청"): `_batAsk(why)` — 위치 안내 [동의] 직후 · 앱 켠 지 5초 뒤(동의한 사용자) · 경로 확정 2.5초 뒤, 아직 제외 안 됐으면 이유 설명 창(나중에/설정하기). [설정하기] 를 눌러야만 `Power.requestIgnoreOptimizations`. 평생 한 번(`gdm_bat_asked_at` — YJ: 처음 설치 때 한 번만; 이후엔 설정 화면 카드), 이미 제외·웹·다른 안내(`locDiscOv`·`bgPermOv`)가 떠 있으면 건너뜀. 시험 `test/bat_ask.ui.test.js` 7개. ⚠ Play 심사: REQUEST_IGNORE_BATTERY_OPTIMIZATIONS 는 제한 권한 — 콘솔 '권한 선언'에서 핵심 기능(화면 꺼진 채 하차 알림·경로 안내)을 사유로 적어야 한다.
- **백그라운드 위치 서비스 되살리기 4.5초**(YJ: "30초는 너무 길다"): 예전 30초 점검은 웹 표시 `_bgGeoActive` 만 봐서 서비스가 죽어도 true 로 남아 되살리기가 일어나지 않았다. 이제 `OverlayPlugin.bgServiceState()`(ActivityManager 로 `BackgroundGeolocationService` 가 도는지 · 1/0/-1)를 5초 틱이 `_ovlNativeTick(svc)` 로 넘기고 `_ovlBgGuard` 가 0 이면 표시를 리셋하고 `_startBgGeolocation()` 을 4.5초 간격으로 다시 부른다(5번 연속 실패하면 30초로 물러남, -1 이면 아무것도 안 함). 시험 `test/bg_guard.ui.test.js` 5개. **APK 빌드 필요 · 실기기 미확인**(백그라운드에서 서비스 시작이 Android 12+ 에서 막힐 수 있다). 상주 알림: Android 14+ 는 사용자가 밀어 지울 수 있고 앱이 막을 수 없다(지워도 서비스는 계속 돈다); 앱 자체 상주 알림(LocalNotifications id 1)은 정책으로 꺼 둠.
- **프로세스 유지 서비스 `KeepAliveService`**(YJ: "경로 이동 중 앱이 죽는 예외를 다 막아야, 카카오지하철은 안 죽는다"): 위치 플러그인의 포그라운드 서비스는 '앱이 화면에서 사라질 때' 뒤늦게 켜진다 → 경로 확정(`OverlayPlugin.keepAlive(on)`) 순간 앱이 보일 때 우리 서비스(위치 유형 FGS, 알림 최소 중요도 '길동무 경로 안내 중')를 먼저 켜 두 겹으로 지킨다. 5초 틱이 서비스가 없으면 다시 켠다. `START_NOT_STICKY`(프로세스가 죽으면 웹뷰도 죽어 되살려 봐야 알림만 남는다). 여정 끝/액티비티 종료 때 끈다. CI(`build-apk.yml`)가 파일을 복사하고 매니페스트에 `<service … foregroundServiceType=location stopWithTask=false>` 를 넣는다. **이 환경에서 컴파일 못 함 → 푸시 후 Actions 결과로 확인.**
- **못 막는 것(정직)**: ① 최근 앱 목록에서 앱을 밀어 닫으면 액티비티·웹뷰(JS)가 사라진다(우리 로직은 JS 라서 서비스만 남아도 안내가 멈춘다 — 카카오지하철은 로직이 네이티브라 버틴다) ② 제조사 '모두 닫기'·강제 중지 ③ 여정 상태가 저장되지 않아 프로세스가 죽으면 다시 켜도 경로를 잃는다. 근본 해결은 여정 상태 저장 + 앱 재시작 시 복원(다음 과제).
- **대기 모드 1단계 — 안내를 네이티브가 이어받기**(YJ: "카카오지하철처럼 안내 로직을 네이티브로", 방식: 단계적 이전). 원칙 그대로 **계산은 엔진, 네이티브는 GPS 모아 보내고 받은 값을 그리기만**.
  - **엔진 `/ride-standby`**(`engine/ride-standby.js`, 워커 s11): 요청 `{nowMs, fixes, state}` → 응답 `{state(갱신본), ongoing{title,text}, alert{key,type,title,body,vib}|null, done}`. 상태(state)는 요청에 실려 오가고 서버는 기억하지 않는다. 안에서 `rideTrack`(영점 passMs·notYet) → `rideEta`(밀고 당기기) → 하차·환승 알림 규칙(앱 `_checkTransitAlerts`/`_fireTransitAlert` 와 같은 규칙: 환승 2·1정거장 전, 목적지 2·1정거장 전·도착, 한 번에 가장 급한 하나) → 상주 알림 문구. 도착 알림 3분 뒤 done. 시험 `test/ride_standby.test.js` 11개.
  - **앱(JS)**: `_ovlStandbyBuild/_ovlStandbyPush/_ovlStandbyEnd` — 지하철 탑승 확정(`_ttFirstOn`) 여정의 상태(`_etaPayload`·`_arrEndStops`·알림 대상·허용 종류·이미 보낸 알림·최근 궤적 60개)를 엔진 응답마다(8초 간격) `Overlay.standbyPacket` 로 맡긴다. 알림을 보내면 즉시 다시 맡긴다(fired 공유). `_cleanupBgTracking` 이 `standbyEnd`.
  - **네이티브**(`KeepAliveService`): 액티비티가 사라지면(`OverlayPlugin.handleOnDestroy`, 여정 중 + 맡긴 상태 있음) ACTIVATE → 위치(GPS·네트워크) 직접 수집 → 5초마다 `/ride-standby` 호출 → 상주 알림 문구 갱신·알림 표시·done 이면 종료. 알림에 [안내 종료] 단추. 부분 웨이크락. 웹이 다시 뜨면 `keepAlive(off)` 로 끄지 않는다(대기 모드 중엔 무시); `keepAlive(on)` 이면 DEACTIVATE(주도권 반환).
  - **1단계 한계(정직)**: ① 지하철 탑승 확정 여정만(버스는 프로세스 유지만) ② 대기 중에는 오버레이(알약)·앱 화면 없음 — 상주 알림 문구와 하차 알림만 ③ 앱을 다시 열면 웹이 여정을 복원하지 못해(여정 상태 저장·복원 없음) 화면은 빈 홈이고 대기 모드는 계속 돈다(알림의 [안내 종료]로 끔) — 2단계에서 복원 ④ 제조사 '모두 닫기'·강제 중지는 못 막음 ⑤ **자바는 이 환경에서 컴파일·실행 못 함 — CI 컴파일 + 실기기 확인 필요**. 다음 단계: 여정 상태 저장·복원 → 오버레이를 서비스로 → 버스 포함.
- **대기 모드 2단계 — 오버레이·재개 카드·버스**(YJ: "웹뷰를 안 쓰고 네이티브로 가능하면 그렇게, 카카오 방식으로, 끝까지"). 원칙 그대로 **계산은 엔진, 그리기는 네이티브**.
  - **엔진**(`engine/ride-standby.js`, 워커 s12): 응답에 `overlay`(OverlayPlugin.update 와 같은 모양: cells·cur·base·theme·line1·pill·line2·alert·alertAt·pre·moving·rs)와 `view`(재개 카드용 {text,line1,line2,curIdx,at}) 추가. 입력 state 에 `ovl` = 웹이 맡겨 둔 **그림 틀**(`cells`: 앱 경로 화면 칸의 이름·노선 라벨·점/선 색 + 이동 중 문구 `m`, `map`: 칸→노드 번호(도보 칸 -1), `base`, `theme`)이 있을 때만 `overlay` 를 만든다. 엔진이 채우는 것: 칸 시각(`arr`), 현위치 칸(도보 칸 제외), 이동 중(`pos.moving` — 시각표 기준일 때만), 알약 문구(다음역(이동중)), 남은시간 줄(목적지 기준), 하차 임박 단계(2→1, 목적지 3정거장 전 pre), 도착하면 rs=[안내 종료] 줄, done 이면 `active:false`. 오버레이 진동은 끈다(알림이 진동한다 — 중복 방지).
  - **앱(JS)**: `_ovlStrip(st, full)`(처음 칸부터 전부 + 칸→노드 `map`), `_ovlStandbyFrame()`(그림 틀, 같은 경로면 60초 캐시, 끄기 `_ovlStripOff`)를 `_ovlStandbyBuild` 가 state.ovl 로 맡긴다. **버스 포함**: `_ttFirstOn` 조건 제거(승차 전 `_htlNotDeparted` 는 맡기지 않음) — 엔진이 시각표/GPS 증거를 가려 계산. 앱을 다시 열면 1.8초 뒤 `Overlay.standbyStatus()` 로 물어 **'경로 안내가 이어지고 있어요' 카드**(엔진 view 문구 + [안내 종료], 5초마다 갱신)를 띄운다(`_ovlStandbyCardPoll/Draw`, `#sbCard`). 대기 모드가 돌려준 오버레이를 웹이 되받을 때(`keepAlive(on)` 전환) 오버레이 키를 비워 바로 다시 보낸다.
  - **네이티브**: `OverlayPlugin` — `update()` 본문을 `applyUpdate(JSONObject)` 로 분리(웹·대기 모드 공용). 액티비티가 사라져 대기 모드로 넘어갈 때 오버레이 창을 내리지 않고 `hosted` 로 쥔다(`hostedOk` = 넘길 때 오버레이를 쓰던 경우만). `KeepAliveService.step()` 이 엔진 답의 `overlay` 를 `OverlayPlugin.standbyPush` 로 넘겨 그린다; `view` 는 prefs 에 적어 `standbyStatus()` 가 돌려준다. 앱을 다시 열면(새 인스턴스 `load()`) 쥐기를 이어받고 옛 창은 거둔다(다시 밀어 닫아도 이어짐: `handOver = (journeyOn||hosted) && hasPacket`). hosted 동안 웹 `update` 는 무시, 5초 틱·서비스 끄기 로직은 건너뜀. 손짓: 알약/손잡이=앱 열기, [안내 종료]=서비스 STOP, 그 밖(탑승·되돌리기·추천)은 웹이 있어야 하는 일이라 안 함. 대기 모드가 끝나면(`stopStandbyLoop`) `standbyHide` 로 창을 내린다.
  - **한계 우회 라운드**(YJ: "한계를 우회해줘, 카카오처럼 / 탑승 확정되면 시간표 기준으로 전진하고 GPS 는 영점 / 모든 계산은 엔진, 앱은 그림만"; 워커 s13): ① **전체 화면 이어보기**(`#sbScreen`, `_sbScreenDraw`) — 앱을 다시 열면 빈 홈 대신, 엔진이 준 `overlay`(칸·현위치·배너·남은시간·도착 시 [안내 종료])를 그대로 그리는 전체 화면을 띄운다. 웹은 계산 없음(엔진 응답을 그리기만). [홈 보기]=카드로 접기, [안내 종료]=서비스 STOP. ② **엔진 배너**(`overlay.banner`: 하차/환승 임박 문구 "OO까지 2정거장 남았어요"·"다음 정거장 OO — 내릴 준비하세요"·"OO에 도착했어요")·`destName` 추가. ※ "시각표 기준 진행 중" 같은 기준 표시는 화면에 **없다**(YJ: 사용자는 내 위치와 마커만 맞으면 됨) — 탑승 확정 후 시각표로 전진하고 GPS 는 영점만 쓰는 건 엔진 내부 동작일 뿐 보여주지 않는다. ③ **프로세스가 죽어도 되살리기**: `KeepAliveService` START_STICKY — `intent==null` 재시작이면 prefs 에 저장해 둔 상태(`state`·`view`·`overlay`)로 대기 루프를 이어 알림·알림음을 계속한다(안드로이드 12+ 의 FGS 재시작 제한이면 `showForeground` 가 잡고 stopSelf). 되살아난 프로세스엔 Activity/Bridge 가 없어 **오버레이 창은 못 띄움(알림만)**.
  - **한계(정직)**: ① 앱 '타임라인 지도 화면' 자체의 복구는 못 함 — 전체 화면 이어보기(엔진이 그린 칸 목록)로 대체. 완전한 복구는 확정 경로 원본(`secs`)을 저장·복원해야 함(미구현, 위험) ② 대기 중 오버레이/이어보기에서 [탑승]/추천/되돌리기 없음 ③ 탑승 **전** 여정은 대기 모드로 안 넘김(탑승 확정은 웹 로직) ④ 버스 대기 모드는 GPS 증거 기반이라 지하·터널에서 지하철보다 정확도 낮음 ⑤ 제조사 '모두 닫기'·강제 중지는 못 막음(카카오도 동일) ⑥ **자바(OverlayPlugin hosted·KeepAliveService·sticky)는 이 환경에서 컴파일·실행 못 함 — CI 컴파일 + 실기기 확인 필요**. 확인할 것: 앱 밀어 닫은 뒤 알림·오버레이 계속 갱신, 다시 열면 전체 화면 이어보기, [홈 보기]→카드, [안내 종료], 최근 앱에서 지운 뒤/프로세스 종료 뒤 알림이 되살아나는가.
- **시뮬 재확인 라운드 (2026-10-14, 워커 s14)**: YJ "내가 문제 제기했던 부분들 시뮬 돌려봐" → `test/sim/ride_sim.js` 116개 재실행 + 새 `test/sim/standby_sim.js` 66개(대기 모드). 결과·해석은 `test/sim/RESULTS_2026-10-14.md`. 고친 것 2가지: ① **버스 정상 탑승이 10분쯤 뒤 '승용차'로 오판돼 재탐색**(5efa1c9 회귀) — `rtBus` 가 궤적이 점 수 상한(240)·10분 창 끝까지 찼으면 '승차 정류장을 지난 적 없음'을 단정하지 않는다(`trail_capped`), ② **버스(시각표 기준 아님) 대기 모드에서 GPS 가 10분 넘게 끊겼다 돌아오면 영점이 영영 안 잡혀 알림이 하나도 안 나감** — `engine/ride-standby.js rsResync`(앞쪽 정류장 150m 안의 신선한 정확한 두 점 + 계획 소요 40% 경과 시 통과로 인정). 남은 것: 지하철 먼저 계획의 이탈(다른 차·중간 하차)은 설계상 재탐색 안 함 / 4분 넘게 늦는 버스는 정류장에서 3분 서 있으면 재탐색 / sub_sub 마커 최대 1정거장 어긋남(지하 GPS 없음).
- **시뮬 추가 라운드 (2026-10-14, 워커 s15)**: YJ "고치지 못한 것 전부 진행 · 계산은 엔진 · 카카오지하철처럼 네이티브 활용". ① `ride-track rtOffSubRiding` — 지하철 탑승 확정 중에도 정확한 지상 좌표가 2분 가까이 전부 경로선 600m 밖이면 이탈(후보 경로 갈아타기는 계속 막음). ② 앱 `_PLAT_GRACE_BUS_MIN`=10분(늦는 버스를 놓친 것으로 보지 않음). ③ 대기 모드 엔진: GPS 3분 끊기면 버스도 계획 시각표대로 이어감(`st.dr`), 대기 모드 이탈 알림(`type:'offroute'`, 한 번, 벗어난 동안 하차 알림 보류, 15분 뒤 종료) — 네이티브 자바는 변경 없음(엔진이 준 알림을 그리기만). 시뮬 116개 문제 36→10, 정상 탑승 재탐색 0/35, 대기 모드 84건 통과. 결과·남은 한계: `test/sim/RESULTS_2026-10-14.md` §3.
- **배포 순서**: 워커 s15 먼저(s14 이하는 지하철 중 이탈·대기 모드 이탈 알림·버스 GPS 끊김 시각표 이어가기가 없음)(s12 이하에는 banner/destName 이 없어 배너만 빠짐, s11 에는 overlay/view 도 없어 오버레이가 안 뜸 — 앱은 깨지지 않음), 그다음 APK.
- **갤럭시 절전 제외 (2026-10-14, 앱+APK만 — 워커 변경 없음)**: YJ "이앱은 대부분 갤럭시에서 구동될거야 · 우리앱에 필요한거 추가해줘 · 계산은 엔진 · 그림은 앱". 삼성 One UI 는 일반 '배터리 최적화 제외'와 별개로 Sleeping(약 3일 미사용: Job·Alarm·**포그라운드 서비스까지** 제한)·Deep sleeping(16일 등 장기 미사용)을 둔다 → 사용자가 '자동으로 절전하지 않는 앱(Never sleeping)'에 넣어 줘야 한다(출처: developer.samsung.com/mobile/app-management.html, dontkillmyapp.com/samsung).
  - **네이티브**(`PowerPlugin`, 추가 메서드 3개): `deviceInfo()`(제조사·모델·sdk·`samsung`), `backgroundStatus()`(`bgRestricted`=앱 배터리 '제한됨', `standbyBucket` 1~5, `ignoring`), `openAutoSleepSettings()`(삼성 `com.samsung.android.sm.ACTION_OPEN_CHECKABLE_LISTACTIVITY` + 패키지 `com.samsung.android.lool` + `activity_type=2`; 못 열면 앱 정보 화면, 결과 `target`). 계산 없음.
  - **앱**: `_samAsk(why)` — 삼성에서만, **평생 한 번**(`gdm_sam_asked_at`), [설정하기]를 눌러야만 화면 이동. 순서: 위치 [동의] 1.8초 뒤 / 앱 켠 지 9초 뒤(동의한 사용자) / 배터리 안내의 [나중에] 직후 / 배터리 시스템 화면에서 앱으로 돌아온 직후. 다른 안내(`batAskOv`·`locDiscOv`·`bgPermOv`)가 떠 있으면 겹치지 않고 건너뜀. 설정 탭에 삼성에서만 보이는 카드 `#samSetCard`(다시 열기 + 앱 배터리 '제한됨' 경고). 안내문에 "최근 앱 화면에서 **모두 닫기**를 누르면 안내가 멈춘다"를 적음.
  - ⚠ 발견한 기존 결함: `toast()` 는 콘솔에만 쓰는 함수라 사용자에게 안 보인다 → 앱 정보로 빠졌을 때 안내(배터리 `fallback` 포함)는 `_samNote()` 가 화면 아래 안내줄을 직접 그린다. 다른 곳의 `toast()` 호출은 그대로(이번 범위 밖).
  - 시험: `test/sam_ask.ui.test.js` 13개 + `test/bat_ask.ui.test.js` 7개 둘 다 CI 매트릭스에 추가(bat_ask 는 그동안 CI 에 없었음). 네이티브는 스텁으로 javac 컴파일만 확인 — **실기기 검증은 못 했다**.
  - **한계(정직)**: ① 앱이 Never sleeping 목록에 들어갔는지는 읽을 방법이 없다(그래서 "설정됨" 표시 없음, 화면만 열어 줌). ② 삼성 딥링크가 막힌 One UI 버전은 앱 정보 화면으로 대체된다. ③ 최근 앱 "모두 닫기"·강제 중지는 어떤 앱도 못 막는다. ④ Play 심사: 배터리 최적화 제외 권한 사유 필요(위 배터리 안내 항목).
  - **실기기 확인 체크리스트(YJ)**: 첫 실행 → 위치 동의 → 배터리 안내(허용) → 갤럭시 안내 → [설정하기] → 목록 화면에서 + 로 길동무 추가 → 설정 탭에 '갤럭시 백그라운드 유지' 카드 보임 → 여정 시작 후 화면 끄고 5분 → 상주 알림이 계속 갱신되는지.
  - **누르는 횟수 줄이기 (2026-10-14, YJ: "누르는 횟수를 줄이게 해줘")**: 접근성 서비스로 설정 화면을 대신 누르는 자동화는 Play 심사·One UI 버전별 깨짐·사용자가 접근성을 따로 켜야 하는 번거로움 때문에 쓰지 않는다. 대신 갤럭시에서 배터리 안내가 필요한 경우 **두 안내 창을 한 창으로 합쳤다**(`_batAsk` 가 `deviceInfo` 로 삼성 확인 → 두 단계 설명). [설정하기] 한 번 → 기기 허용 창 → 앱으로 돌아오면 두 번째 창 없이 곧바로 삼성 목록(`window._samAuto`). 터치 수: 이전 6(설정하기·허용·설정하기·+·길동무·추가) → 5. [나중에]면 둘 다 건너뜀(설정 탭 카드에서 다시). 이미 배터리 제외했거나 배터리 안내를 이전에 본 갤럭시는 예전처럼 단독 갤럭시 안내(설정하기 → + → 길동무 → 추가). 더 줄이려면 목록 화면 위에 '+ 를 누르세요' 힌트를 띄우는 방법(다른 앱 위 표시 권한 사용)이 있으나 터치 수는 같고 헷갈림만 줄어든다 — 실기기 사용 뒤 필요하면.
  - **실기기 확인 + 순서 뒤집기 (2026-10-14, YJ 갤럭시 스크린샷)**: 앱 배터리가 **제한 없음**이면 삼성 '자동 절전 예외 앱' 선택 목록(제목은 "모든 앱")에 길동무가 **나오지 않는다**. 같은 화면에서 배터리를 **최적화**로 바꾸자 목록에 길동무가 나타남(YJ 확인, 11:37). 이전 순서(기기 허용 → 삼성 목록)는 허용하는 순간 목록에서 앱이 사라져 헛걸음이었다 → **순서를 뒤집음**: 합친 안내 [설정하기] → 삼성 목록(`_samOpen`, 이때는 아직 '최적화'라 보임) → 앱으로 돌아오면(`window._samFirst`) 기기 허용 창(`_batRequest`). 목록을 못 열어도 허용 창은 이어진다. 이미 '제한 없음'인 갤럭시는 단독 갤럭시 안내를 띄우지 않고(헛걸음 방지), 설정 탭 카드에 `#samSetTip`(목록에 안 나오는 이유 + 잠시 '최적화'로 바꿔 추가하고 되돌리는 방법)를 보인다.
  - **아직 모르는 것(정직)**: ① 삼성 목록에 먼저 넣고 나서 배터리를 '제한 없음'으로 바꿔도 목록 항목이 **유지되는지**(YJ 확인 대기). ② '제한 없음' 하나만으로 Sleeping 에서 보호되는지(삼성 문서에 없음 — 선택 목록에서 빼는 걸 보면 이미 제외 취급일 가능성이 크지만 확정 아님). ③ 앱 정보의 "사용하지 않는 앱 관리"(미사용 앱 권한 자동 삭제) 스위치가 켜져 있으면 몇 달 뒤 위치·알림 권한이 회수될 수 있다 — 앱에서 읽고 설정 화면을 여는 방법은 아직 안 만듦. ④ YJ 기기는 '다른 앱 위에 표시'가 꺼져 있어 오버레이가 안 뜬다(권한 안내는 별도).


## 2026-10-14(3) 네이티브 노선도 + 역 시간표 (YJ: "지하철 노선도가 확대 축소를 할때 렉이 걸리고 깨진다 → 네이티브지도화면을 기능을 현재처럼 완벽히 구현할 수 있으면 진행해줘 · 추가로 역을 눌렀을 때 시간표도 볼 수 있게")
원칙 그대로: **계산은 엔진, 앱(웹·네이티브)은 그림만.**

### A. 네이티브 노선도 (APK 재빌드 필요 · **실기기 검증 못 함**)
- **왜 부드러워지나**: 웹은 거대한 SVG(글자 600+개·선 수천 개)를 확대할 때마다 다시 그려 렉·깨짐이 났다. 네이티브는 노선도를 비트맵으로 한 번 그려 두고 손가락 중에는 GPU 행렬로만 확대·이동, 멈추면 선명하게 다시 그린다(주변 20% 여유 · 배율 0.6 미만에서는 영문 글자 생략 = 웹 `.lz` 규칙).
- **구조**
  - 데이터: `tools/metro-native/build.js` 가 SVG → `www/metro_native.bin`(GMN1, gzip, little-endian; 도형·라벨 글리프·클립·필터 25종 상태)를 만든다. **SVG 를 고치면 `node tools/metro-native/build.js` 로 다시 만들 것** — CI 가 `--check` 로 낡았는지 본다. 필터 상태는 앱의 진짜 `gmFilterLine` 을 돌려 기록한다.
  - 순수 Java(안드로이드 클래스 없음, JVM 에서 시험): `MetroMapData`(파서·역 찾기·누른 곳 판정) · `MetroCamera`(배율·이동·범위) · `MetroRenderer`(무엇을 어떤 순서로 그릴지; `Sink` 인터페이스).
  - 안드로이드 얇은 껍데기(CI 컴파일로만 확인): `MetroMapView`(비트맵 캐시·제스처·flash·hint) · `NativeMapPlugin`(Capacitor `NativeMap`: show/setRect/hide/destroy/setFilter/fit/centerOn/ensureVisible/setHint/snapshot/status, 이벤트 station·gesture·ready·error·centered).
  - 웹(`www/index.html`, `_nm*` 블록): 네이티브 View 를 WebView 위 사각형(CSS px × dpr)에 얹는다. 하단 막대·역 팝업·시간표 시트는 **지도 사각형을 줄여 피하고**, 지도 한가운데를 덮는 모달은 지도를 사진(snapshot)으로 깔고 네이티브를 숨긴다(`_nmDesired`).
- **기능 동등성**: 호선 필터(25종, 흐림 단계 포함) · 역 탭→같은 팝업 · 역 검색·내 위치 찾아가기(깜박임) · 처음 맞춤(서울역 중앙, 화면 높이에 전체 높이) · 최대 20배 · 지도 밖으로 안 밀림 · 안내 문구.
- **안전장치(자동으로 예전 웹 SVG 로 복귀)**: 플러그인 없음(웹/구 APK) · error 이벤트 · show 거절 · 보인 지 8초 안에 `ready` 없음 · 빈 그림. 연속 2번 실패하면 네이티브를 끈다. 설정 탭 `#nmSetCard` 스위치(`_nmSetUse`). localStorage: `gdm_nm_fail`, `gdm_nm_why`, `gdm_nm_off`.
- **시험(전부 CI 매트릭스)**: `metro_native_data`(원본 SVG ↔ 데이터 12) · `metro_native_java`(Java ↔ Canvas2D 기준 렌더러 픽셀 비교 14) · `metro_native_js.ui`(가짜 플러그인으로 앱 연결 20). 기준 렌더러 자체는 원본 SVG 와 픽셀로 맞춰 검증돼 있다.
- **실기기 확인 체크리스트(YJ)**: ① 지하철 지도 탭에서 두 손가락 확대·축소가 부드러운지 · 멈춘 뒤 글자가 선명해지는지 ② 호선 버튼 필터 · 역 이름 탭 → 팝업 · 검색·내 위치 ③ 팝업/시간표가 뜰 때 지도 깜박임 ④ 다른 탭 갔다 와도 지도 살아 있는지 ⑤ 설정 탭에서 네이티브 지도를 끄면 예전 웹 지도로 돌아오는지.
- **한계(정직)**: 안드로이드 자바 코드는 이 환경에서 **컴파일·실행을 못 해 봤다**(CI 컴파일만). 부드러움은 측정 못 함. WebView 위에 네이티브 View 를 얹는 방식이라 모달이 뜨는 순간 작은 깜박임이 있을 수 있다. 문제가 있으면 설정 스위치로 끄면 이전과 똑같다.

### B. 역 시간표 (엔진 + 앱 · 워커 s16 배포 필요)
- **엔진** `engine/next-train.js` `timetable(q)` + `engine/next-train-worker.js` `op=timetable`: `GET /next-train?op=timetable&line=&from=&day=DAY|SAT|SUN&baseMs=` (POST items 도 가능) → `{dayCode, today, days:[{code,label}], nowMin, dirs:[{dk,toward,times,first,last,nextMin,tomorrow}], noData}`.
  - 공식 시각표가 있는 노선(서울 1~9 · 인천1·2 · 김포골드라인)만. 없는 노선(신분당·경의중앙·공항철도…)은 `noData:true` — **지어내지 않는다**.
  - 토요일 자료가 따로 있는 노선만 평일/토/일 세 갈래, 아니면 평일 / 토·일·공휴일.
  - 방향 이름(`toward`): 노선 순서 끝 역. 2호선(순환+지선)과 두 방향이 모호한 경우는 비워 두고 앱이 상행/하행으로 표시. 지선이 있는 노선은 "OO 방면"이 부정확할 수 있음.
  - 자정 직후(04시 전)에는 전날 영업일의 1440+ 열차까지 보고, 오늘 남은 열차가 없으면 `tomorrow=true` + 내일 첫차.
  - 시험: `test/next_train_timetable.test.js`(493 확인). 워커 `/home/claude/route-v2/route-v2-worker.js` 에 이식(ENGINE_VERSION `route-v2-2026-10-14s16`) — **YJ 가 대시보드에 붙여 넣어야 앱에서 시간표가 나온다**(배포 전에는 "불러오지 못했어요" + 다시 시도).
- **앱** (`www/index.html`, `nmTtOpen/nmTtClose/nmTtLoad/nmTtRender`): 역 팝업의 3번째 버튼 `🕒 시간표`(출발역·도착역 0·1번 순서는 그대로) → 아래 시트 `#nmTtSheet`. 노선 탭(이 역의 모든 노선을 한 번에 POST — 시각표가 있는 첫 노선을 자동 선택) · 요일 칩(엔진 `days`) · 방향 탭 · 시(時)별 분 목록 · 다음 열차 강조/지난 열차 흐림 · 자정 넘은 열차 "익일". 같은 (노선·요일) 응답은 60초 재사용. 웹 노선도·네이티브 노선도 모두 같은 시트(네이티브에서는 시트 위까지로 지도 사각형을 줄이고, 지도를 만지면 닫힘).
  - 시험: `test/station_timetable.ui.test.js` 12개(진짜 엔진 코드를 요청 가로채기로 연결). CI 매트릭스에 `next_train_timetable.test.js`·`station_timetable.ui.test.js` 추가.
- **배포 순서**: 워커 s16 먼저 → APK(또는 웹 배포). 워커가 구버전이면 시간표만 실패 안내가 나오고 나머지는 그대로.

### 2026-10-14(4) 실기기 점검 후 수정 — ㅁ·ㅂ 글자 · 시간표 "자료 없음" · 워커 한글 깨짐 (엔진 s17)
- **ㅁ·ㅂ 이 이상하게 나옴(네이티브 지도)**: 글자(글리프) 도형 2286개 중 1084개가 `fill-rule="evenodd"` 로 안쪽 구멍(ㅁ·ㅂ·ㅍ·ㅇ 일부)을 뚫는데 데이터에 이 규칙을 담지 않아 구멍이 막힌 채 칠해졌다(마곡나루 → "▮곡나루"). 이전 시험은 글자를 가까이서 비교하지 않아 놓쳤다(임계치 0.4% 가 글자 몇 개를 못 잡음). 수정: 글리프 use·라벨 조각의 shape 번호 맨 윗비트에 evenodd 를 실었다(`format.js`·`build.js`·`refrender.js`·`MetroMapData.opEo/inEo`·`MetroRenderer`·flash 그리기). 시험에 글자 10배 확대 엄격 비교(임계 0.12%) 4건 + 자바 2건 추가 — 옛 데이터에서는 실패함을 확인.
- **시간표가 "공식 자료 없음"**: 엔진 자체는 지도의 모든 (역, 노선) 824쌍에 시각표가 있다(TAGO·KRIC·서울 열린데이터 묶음 `tt-2026-09-06+tago-2026-10-09.7`). 실제 원인은 아래 **워커 한글 깨짐**. 남은 1건(7호선 총신대입구 = 이수)은 엔진에 별칭 `_TT_ALIAS` 추가로 해결. 새 시험 `test/timetable_coverage.ui.test.js`(앱의 진짜 역 목록 × `_metroLines` × 엔진 전수, 평일/휴일) — 하나라도 비면 실패, CI 매트릭스에 포함.
- **워커 한글 깨짐(중요)**: 13:26 에 배포된 route-v2 워커를 Cloudflare 에서 읽어 보니 모든 한글이 깨져 있었다('평일' → 'ÌèâÏùº'). 휴대폰에서 파일을 열어 복사할 때 UTF-8 로 못 읽은 것으로 보인다 → 경로 탐색까지 위험. 대책: `route-v2` 저장소 `make-ascii.js` 가 워커를 **ASCII 전용(\uXXXX)** 으로 바꾼다(acorn 토큰 비교로 동일함 검증 + 두 워커 응답 동일 확인). **대시보드에 붙여 넣을 파일은 항상 `route-v2-worker.ascii.js` 를 쓸 것.** 엔진 `route-v2-2026-10-14s17`.

### 2026-10-14(5) 경로 탭 규칙 재정리 · 걷기 15분 규칙 · 시간표 테마/밀어 닫기/캐릭터 놀이터 · 강아지·고양이 재렌더링 (엔진 s18~s19)
- **엔진 s18 (탭 규칙, route-v2 `ca38d95`)**: 최단시간 = 모든 후보 중 가장 빠른 것 · 최소환승 = `pickMinTransfer`(환승 최소, 같으면 빠른 쪽, 최단시간 탭보다 환승이 많을 수 없음 — `tabNormalize` 가 마지막에 다시 확인) · 지하철 탭 = `pickSubwayTab`(버스 타는 시간이 가장 짧은 것, 버스 여러 번 갈아타면 한 번당 10분 가산, 후보에 `dijkstra opt.busW`(버스 시간 배수 3·8)로 찾은 경로 포함) · 버스 탭 = 버스만 타는 후보 중 가장 빠른 것(`isBusOnlyRoute`, 지하철·열차 든 경로는 절대 안 들어감). 심야버스(`심야A21`·`N`·`12심야` 등 이름 기준)는 운행시각이 없어도 야간 창(밤~새벽)만 운행으로 본다(`busSvcNameWindow`). 시험 `test/tab_modes.test.js`.
- **엔진 s19 (걷기 15분 규칙, route-v2 `9882ea9`)**: 상수 `WALK_MAX_MIN = 15` (조절 변수, 0 이하면 꺼짐). 처음·마지막 걷기가 15분(표시 분 반올림 기준) 이상이면 그 정류장·역을 후보에서 빼고 걷기가 짧은 다른 정류장·역에서 버스/지하철을 타는 경로를 쓴다(`walkCapNodes`, `dijkstraRaw` 의 출발/도착 후보에 적용 — 모든 탭 공통, 탭별 기존 규칙은 그대로). 15분 안쪽 후보가 하나도 없으면(주변에 정류장·역이 없음) 어쩔 수 없이 그대로 두고 경로에 `walkOver:true` 를 붙인다. 15분 안쪽 정류장만으로 목적지에 닿지 못하면 상한을 풀고 다시 찾는다(경로없음보다 오래 걷는 경로). `shiftBoard`(순환 보정)와 직행 빨간버스 접근 거리도 상한 안. 최소환승(20·35분)·지하철 탭(25·12분)의 기존 걷기 기준은 `WALK_MAX_MIN` 을 넘지 않게 따라간다. **앱은 아무 계산도 안 한다**(엔진이 준 경로를 그리기만). 시험 `tab_modes.test.js` 6건(옛 엔진 s18 은 이 6건 실패), 합성 퍼즈에서 15분 이상 걷는 경로 182→81건(남은 건 모두 근처 정류장 없음 + `walkOver` 표시).
- **배포**: 엔진 s18·s19 는 YJ 가 `route-v2-worker.ascii.js` 를 Cloudflare 대시보드에 붙여 넣어야 적용(푸시만으로는 배포 안 됨). 배포 뒤 실제 엔진으로 탭 규칙 확인(`window.__run` 스윕)이 남아 있다 — 지금까지는 합성 노선망·단위시험으로만 검증.
- **앱: 시간표 시트·역 팝업 테마** — 고정 다크색을 CSS 클래스(`.nmp-*`, `.nmtt-*`)로 바꿔 다크/파스텔 변수(`--card`·`--text`·`--blue` …)를 따른다. 테마를 바꾸면 열려 있는 시트도 바로 바뀐다.
- **앱: 밀어서 닫기** — `_nmDragDismiss(el, closeFn, {scroller})` 공용(팝업·시트). 손가락을 따라 내려가고, 25% 이상 또는 빠르게 털면 닫히고, 모자라면 제자리. 목록이 위로 스크롤돼 있으면 스크롤 우선, 가로 끌기·칩 위 시작도 안전(끈 뒤 버튼 눌림 삼킴, 바깥 눌림으로 오인 방지 `_nmDragLast`). 네이티브 노선도에서는 닫으면 지도 사각형이 다시 넓어진다.
- **앱: 캐릭터 놀이터** — (16:07 수정, YJ "위쪽 공백 제거, 역명 옆 빈 칸에서 놀게, 배경 그라데이션 다양하게, 배경에 따라 행동도 다르게") 손잡이~제목 사이 띠를 없애고 놀이터(`#nmTtPlay`, 터치 안 가로챔)를 **역명 줄의 제목↔✕ 사이 빈 칸**(높이 46)에 둔다. 열 때마다 장면 8가지(`_RC.scenes`: day·sunset·meadow·candy·snow·sea·night·aurora) 중 하나 + 6종 캐릭터 중 2~3마리를 무작위로 뽑는다(`window._rcScene` 로 고정 가능). 장면마다 다크/파스텔 그라데이션 두 벌 · 배경 장식(구름·노을·나비·꽃잎·눈·파도·별·오로라) · 행동 비중/속도(밤=쉬기·느림+z 표시, 눈·꽃잎=콩콩·빙글·빠름, 풀밭=친구에게 다가가기, 노을=느긋). 버벅임 방지: 캐릭터 16프레임을 그릴 크기로 한 번 줄인 아틀라스, 배경 그라데이션·바닥 캐시(테마 바뀔 때만 재생성), 30fps 제한, 화면 숨김 시 정지(1회 그리기 평균 약 0.3ms, `window._rcPerf` 로 측정). 순수 장식 — 경로·시간 계산은 없다. 네이티브(Java) 그리기로 옮기는 것은 시트가 웹 DOM 이라 위치·터치·테마를 맞춰야 해 실기기 검증 없이 넣기 위험해서 하지 않았다(필요하면 다음 과제).
- **강아지(돌솜·뽀푸)·고양이(러블) 재렌더링** — `tools/chars3d/models.js` 에 다리 관절(`leg2`, `setLeg`)을 몸에 붙여 걷기·뛰기에서 몸과 다리가 떨어지지 않게 새로 만들고 스프라이트 3장(`www/chars3d/{dolsom,lovel,ppopu}.webp`) 교체, `D3` 기준선(base/ox)과 네이티브 `OverlayPlugin.cfg3` 도 새 시트에 맞춤. 시험 `test/timetable_theme_swipe_play.ui.test.js` 16건(CI 매트릭스에 추가), `loading_chars.ui.test.js` 가 기준선↔시트 일치 확인.
- **한계**: 실기기에서 보지 못했다(캐릭터 겉모습은 렌더 이미지로만, 네이티브 Java 는 CI 컴파일로만 확인). 엔진 규칙은 합성 망 기준 — 배포 후 실제 데이터 스윕 필요.
- **(16:47~17:00 추가, YJ) 놀이터 칸 없애기 · 캐릭터별 행동 · ✕ 제거** — 놀이터는 더 이상 칸(테두리·배경)이 아니다: 제목 오른쪽부터 시트 오른쪽 끝까지(높이 70, 위로 24px 트임), 배경(하늘·장식·바닥·나무·웅덩이)은 따로 그려 **좌우·위 가장자리를 투명 마스크로 흐려** 시트 배경과 섞는다. 캐릭터별 행동(`_RC.playStart` 상태기계): 두더지=땅속 두둑 이동→솟아남(솟는 3D 시트)→걷기→삽질(흙 튐)→거꾸로 쏙 들어감, 올챙이=웅덩이 헤엄→펄쩍 나와 돌아다님→웅덩이로 풍덩, 독수리=하늘 비행→내려앉아 걷기→다시 이륙, 고양이=나무로 가서 오름(몸 세움)→가지에 앉음→뛰어내리거나 뒷걸음으로 내려옴, 강아지=킁킁·쭈그려 응가(바닥에 남았다 사라짐). 장식물은 그 캐릭터가 있을 때만 나온다(고양이→나무, 올챙이→웅덩이). 시험용 훅: `window._rcIds`(캐릭터 고정)·`_rcScene`·`_rcClimb`, `_RC.playInfo()`. 시트의 ✕ 버튼은 삭제(밀어 내리기·바깥 누르기·네이티브 지도 만지기로 닫힘). 시험: `timetable_theme_swipe_play.ui.test.js` 21건(캐릭터별 행동은 시드 고정 난수로 240초 분량 시뮬레이션).
- **(18:03~18:10 추가, YJ) 역 팝업에도 놀이터 · 시간표로 이어받기** — 역을 누르면 나오는 팝업(`#svgStationPop`)의 역명 줄 오른쪽 빈 칸(`#nmPopPlay`, 시트의 `#nmTtPlay` 와 같은 칸 없는 스타일)에서 같은 놀이터가 돈다. 🕒 시간표를 누르면 `nmTtOpen` 이 팝업에서 놀던 장면을 `_RC.playSnap()`(장면·캐릭터·서 있던 가로 비율·방향·나무/웅덩이 자리)으로 받아 `playStart(host, snap)` 에 넘겨 같은 배경·같은 캐릭터가 같은 자리에서 이어 논다(팝업→시트 때 캔버스는 항상 1개). 팝업을 거치지 않고 시트를 열면 예전처럼 무작위. `svgRemovePopup()` 이 놀이터도 멈춘다. 그림 상태일 뿐 계산 없음(엔진 규칙 그대로). YJ 가 "화면전환 부드럽게 네이티브 가능하면 네이티브"라 했지만 팝업·시트는 웹 DOM 이라 네이티브로 그릴 수 없어(지도 위에 덮는 웹 화면) 웹 캔버스 최적화 + 장면 이어받기로 끊김을 줄였다. 시험: `timetable_theme_swipe_play.ui.test.js` 에 4건 추가(25건).
- **(19:00~19:15 추가, YJ) 인천1호선 도착 15초 늦음 → 중간역 10초 일찍 판정 (엔진 s20, route-v2 `6d3e160`)** — 원인: 시각표 기준 위치(pos)는 표시 도착 시각이 지나야 '그 역에 닿음'으로 본다(승차역 시각표 기준·실시간 위치 없는 노선). `ride-eta` 조절값 `arriveEarlySec: 10`(0 이면 끔) — `_rePos` 가 중간 경로역(승차역·최종 목적지 제외)의 도착을 이만큼 일찍 보고 from/to/t0/t1/segs 를 준다. 표시하는 도착 시각(etaMs·arr)은 그대로. **호선 구분 없이 지하철 탑승 확정(timetableFirst) 전 호선에 적용.** 영점 창(`ride-track` `zeroLeadSec`) 도착 15초 전 → 25초 전(끝은 도착 30초 뒤 그대로, `zeroWinSec` 55, 최종 목적지 '최근 구간' 재판정은 `zeroSlideSec` 45 유지). 버스 정류장도 같은 창을 쓴다 — YJ: 버스는 지상이라 GPS 가 계속 되니 일단 유지, 나중에 시험해 보고 수정. 영점 계산(GPS 통과 → 시각 밀고 당기기·notYet)은 그대로. 앱 코드 변경 없음(엔진이 계산, 앱은 받은 구간을 그린다). 시험: `ride_eta.test.js` 2건·`ride_track.test.js` 4건 추가. **배포 필요**: `route-v2-worker.ascii.js`(엔진 `route-v2-2026-10-14s20`)를 Cloudflare 에 붙여 넣어야 적용.
- **처음 설치 때 '다른 앱 위에 표시' 설정창 안내** — `_ovlAsk()` (평생 한 번, 키 `gdm_ovl_asked_at`): 위치 동의 → 배터리/삼성 절전 안내가 끝난 뒤(2.5초마다 살펴보다 다른 안내가 없을 때) 아직 권한이 없으면 이유를 설명하는 창을 띄우고, [설정하기] 를 누르면 시스템 '다른 앱 위에 표시' 화면을 연다(`Overlay.requestPermission`)·오버레이를 켠 것(`ovlOn=1`)으로 기록. [나중에] 는 요청 없이 닫고 꺼진 채(설정 탭 카드에서 켠다). 이미 허용·웹·안드로이드 8 미만은 건너뜀. 배터리·삼성 안내(`_batAsk`/`_samAsk`)의 '다른 안내 떠 있음' 검사에 `ovlAskOv` 추가. 시험 `test/ovl_ask.ui.test.js` 9건(CI 매트릭스 추가).
- **(19:20 추가, YJ 실기기 로그: 부평에서 마커 멈춤 · 갈산 뒤 도착시각 이상) 엔진 s21 + 앱** — 로그 분석(백그라운드 H 상태): ① 가려진 동안 엔진 응답이 18:46 이후 갱신되지 않았다 — 구간표(`pos.segs`)가 14구간(`posSegCount`)뿐이라 19:12 부평에서 끝나 마커가 `그림=16→16 이동=0` 으로 굳었다(앱을 켜면 다시 물어 풀림) → 엔진 `posSegCount` 14→80(남은 구간 전부). 앱 `_etaRequest`: 응답 없는 요청이 `_etaSt.busy` 로 굳어 새 요청이 막혔을 가능성(가려진 동안 중단 타이머가 안 돎) → 제한 시간+3초 넘기면 끊고 새로 보내며 옛 요청의 뒤늦은 응답은 seq 로 버린다. ② 앱을 켠 19:16:12 에 쌓였던 위치가 한꺼번에 와 모두 '지금' 시각(`Date.now()`)이 찍혔다 → 엔진 영점이 동수 +6.2분·부평 +4.2분·부평시장 +2.2분…(통과 시각이 전부 19:16)으로 읽었다 → 앱: BG 위치 콜백이 `location.time`(잡힌 시각)을 쓰고(없거나 미래·1시간 전이면 받은 시각), `_evAddFix` 로 궤적(`_ev.trail`)에 제 시각 순서대로 넣는다. 엔진 `rtSane`(ride-track, `trailMaxSpeedMps` 60): 같은 시각인데 멀리 떨어진 좌표는 사실일 수 없어 뒤에서부터 보며 버리고 최신 것만 쓴다(영점·통과·아직안닿음 모두). 시험: `ride_track` 4건·`ride_eta` 1건(엔진), `bg_fix_time.ui.test.js` 3건. '갈산 → 작전 19:51(+34분)' 은 로그가 19:16:22 에서 끝나 확정하지 못했다 — 위 몰림 증거 때문일 가능성이 높다(배포 뒤 재현되면 로그 요청). **엔진 재배포 필요**(`route-v2-worker.ascii.js`, `route-v2-2026-10-14s21`).
- **(19:36 추가, YJ) 게시판 한 번에 한 글만 펼침** — `_renderPost` 헤더를 누르면 이미 열린 다른 글은 접고(`window._commOpenPosts` 를 새 글 하나로 교체), 위쪽 글이 접혀 화면이 밀리지 않게 스크롤 보정. 시험: `tabs_smoke` 의 '한 번에 한 글만' 항목.
- **(19:38 추가, YJ 실기기 로그: 계양역에서 아라역 가는 중 갑자기 버스 경로로 바뀜) 지하철 탑승 확정 중 버스 전환 금지** — 원인: 엔진 쪽 `suppress:'subRiding'` 은 이탈 판정에만 걸려 있었고, 앱의 실시간 차량 매칭(`_vehTick/_vehApply`)이 계양역 곁(327m)의 버스 30번을 잡아 `_applyRiddenRoute` 로 경로를 갈아 끼웠다. 수정: `_trkSubConfirmed()`(탔다 확정 + 지하철 + 엔진이 버스 아님이 아님) 이면 차량 매칭은 묻지도 않고 이미 잠긴 차량은 풀며, `_applyRiddenRoute` 도 false. 시험: `ride_vehicle_app` ⑨(38/0).
- **(19:34 추가, YJ) 영점 초 단위 밀고 당김 (엔진 s22)** — 엔진은 이미 ms·소수 분으로 계산했지만 (가) 통과 시각이 '가장 가까운 샘플'이라 샘플 간격만큼 틀렸고 (나) 앱 `_zeroStampPass` 가 15초 안 변화를 '같은 값'으로 버려 초가 쌓였다. 수정: `rtPassTime` 이 앞뒤 두 샘플(간격 ≤ `passInterpMaxGapSec` 30초, 정확도 통과) 사이에서 역에 가장 가까운 순간을 직선 보간(ms), 앱 임계값 15초→1초. 시험: ride_track(보간 5건), ride_eta('초 단위까지' — 통과 12초 차이는 뒤 etaMs 12초 차이, 이전 수준 24초 안이어도 영점이면 유지 안 함). 표시(HH:MM)는 여전히 분 반올림이지만 내부 etaMs 는 초 단위로 쌓이지 않고 매번 통과 − 예정으로 다시 계산된다.
- **배포**: 엔진 s20~s22 는 `route-v2-worker.ascii.js` 를 Cloudflare 에 붙여 넣어야 적용. 실기기 미확인.
- **(20:28 추가, YJ) 시간표 시트 오르내림을 120Hz 처럼 부드럽게** — 원인: ① 시트를 열 땐 애니메이션이 없었고 ② 닫을 땐 시트가 움직이는 동안 150ms 틱(`_nmTick`→`_nmSync`)이 시트의 '움직이는 위치'를 보고 네이티브 지도 크기를 계속 바꿔(`setRect` → 비트맵 재생성) 계단처럼 끊겼다. 수정: 시트는 WAAPI transform(`_nmSheetMove`, 열기 320ms `cubic-bezier(.2,0,0,1)` / 닫기 240ms `(.4,0,.2,1)`, 합성기가 돌려 메인 스레드가 바빠도 부드러움, WAAPI 없으면 CSS transition). `_nmDesired` 는 시트의 '멈출 자리'(`_nmRest`: innerHeight−offsetHeight, 닫는 중엔 `_nmTop`=innerHeight)를 기준으로 해 움직이는 동안 지도 사각형이 바뀌지 않는다. 지도는 `_nm.animNext` 로 같은 시간·곡선을 받아 `NativeMap.setRect({anim,e1..e4})` 한 번 — 네이티브(`NativeMapPlugin.animateRect`)가 실제 크기는 한 번만 바꾸고 그 사이는 `setClipBounds` 로 '보이는 아래쪽 끝'을 ValueAnimator(PathInterpolator)로 옮긴다(커질 땐 먼저 큰 크기+잘라내기, 줄 땐 끝에서 크기 변경). `MetroMapView.dispatchTouchEvent` 는 잘라낸 아래쪽 만짐을 받지 않아 아래 시트가 받는다. 닫을 땐 시트가 지도 확장이 시작된 뒤(`_nmAfterSync`, 최대 120ms)에 내려가고 `pointer-events:none`+`_nmClosing` 으로 지도 가림 판정에서 빠진다; 끌어서 닫을 땐 손가락 위치(dy)에서 이어 내려간다. 시험: `station_timetable` '부드러운 시트'. 한계: 실기기 미확인(특히 clipBounds 가 MetroMapView 에서 기대대로 보이는지 · 크기 변경 시점의 지도 한 번 튐), 네이티브 Java 는 스텁 컴파일만 해 봤고 진짜는 CI 가 컴파일. 역 팝업(`svgStationPop`)은 아직 예전 방식.
- **(21:42 추가, YJ 사진: 시간표가 올라오는 도중 지도 아래가 흰 빈 공간 · 역 팝업도 부드럽게 · 내려가는 만큼 뒤의 지도가 자연스럽게 나오게) 지도가 시트 위쪽 끝을 따라간다** — 원인: 앞 수정(20:28)은 지도의 '보이는 끝'을 처음→최종 크기로 곡선 이동시켰는데 시트가 가는 길(화면 아래→멈춘 자리)과 범위가 달라, 시트가 아직 도착 전인 자리가 흰 빈칸으로 보였다(지도는 이미 줄어든 최종 크기). 수정: ① `NativeMap.setRect` 에 `tFrom`·`tTo`(시트 위쪽 끝의 CSS y 시작·끝)와 `fullH`(팝업이 사라진 뒤의 지도 전체 높이) — 네이티브(`animateRect`)가 같은 시간·곡선의 진행도 p 로 `보이는 끝 = clamp(tFrom+(tTo−tFrom)·p)` 를 매 프레임 계산 → 시트가 지나간 자리에 지도가 바로 이어진다. ② 신규 `NativeMap.follow({x,y,w,h,bottom,dpr})` — 손가락으로 끄는 동안 지도를 전체 크기로 두고 보이는 끝만 프레임당 한 번 따라 옮긴다(`_nmFollowStart/Move/Snap`, `_nm.following` 동안 `_nmSync` 는 지도 크기를 안 건드림, 8초 안전장치). 놓아서 닫을 땐 손가락 자리(tFrom=멈춘 자리+dy)에서 setRect, 모자라면 180ms 되돌림(`_nm.rect=null` 로 다시 보냄). ③ 시트는 지도가 시작을 받은 뒤(`_nmAfterSync`, 최대 120ms)에 올라오고 내려간다. ④ **역 팝업도 같은 방식**: `svgClosePopup(dy)`(끌어서·바깥 눌러서 닫기, 다른 곳의 `svgRemovePopup` 은 즉시 제거 그대로), `_nmRest`·follow. 팝업 '열기' 애니메이션은 아직 없다. 시험: `station_timetable`(14) 신규 '지도가 시트 위쪽 끝을 따라간다'. 한계: 실기기 미확인(follow 호출이 프레임당 1회 브리지 — 느리면 끊길 수 있음), Java 는 스텁 컴파일만 + CI.
- **(06:05 추가, YJ) 역 팝업 열릴 때도 올라오는 애니메이션** — `svgShowPopup` 이 `_nmSheetPrepareIn(pop)`(시간표 시트와 같은 320ms 곡선, 팝업 transform + 지도 보이는 끝이 팝업 위쪽 끝 vh→vh−H 를 따라 줄어듦, `fullH`) 을 쓴다. 이미 팝업이 떠 있다가 다른 역을 누르면 애니메이션 없이 바로 교체(`_hadPop`). 시험: `station_timetable`(15) '역 팝업이 열릴 때도 올라온다'. 한계: 실기기 미확인.
- **(06:38 추가, YJ: 가끔 팝업 애니메이션이 안 나옴 · 팝업을 위로 밀면 시간표) ** — ① 애니메이션이 빠지던 원인: `svgShowPopup` 이 '이미 팝업이 있으면 바로 교체'로 판단했는데, 닫히는 중이거나 아직 올라오는 중인 옛 팝업(`_nmClosing`/`_nmIn`)도 '있는 것'으로 쳤다(닫자마자·연달아 누를 때). 이제 자리 잡은 팝업만 '떠 있음'으로 치고, 그 경우 교체엔 작은 페이드(180ms)를 준다. ② `_nmDragDismiss` 에 `o.onUp`: 위로 밀기(−8px 넘으면 시작, 손가락을 30%만 따라가는 고무줄, 56px 넘게 또는 빠르게 털면 실행, 모자라면 제자리, 되돌려 아래로 가면 아래로 끌기로 전환). 역 팝업만 `onUp → nmTtOpen(name, _ls)`(시간표). 시험: `station_timetable`(16) '위로 밀면 시간표'. `timetable_theme_swipe_play` 의 팝업 놀이터 시험은 올라오는 애니메이션이 끝난 뒤 자리를 재도록 고쳤다.
- **(08:05 추가, YJ 사진 3장: 역 팝업을 위로 댕겨도 시간표가 부드럽게 안 나옴 · 팝업 오른쪽 애니메이션(캐릭터)이 가끔 빠짐)** — ① **캐릭터가 빠지던 진짜 원인**: 놀이터(`_RC` 의 `play`)는 전역에 하나뿐인데 (가) 옛 팝업·시트가 닫히며 늦게 부르는 `playStop()` 이 새 팝업의 놀이터까지 껐고 (나) 닫히는 중인 옛 호스트가 쥐고 있으면 새 `playStart` 가 조용히 false 로 끝났다. 수정: `playStart` 는 가장 나중에 부른 쪽이 이김(`S.host`), `playStop(only)` 는 그 칸(host)의 놀이터일 때만 멈춤, `svgRemovePopup`/`svgClosePopup`/`nmTtClose` 는 자기 칸만 정리(시트는 내려가는 애니메이션이 끝난 뒤). ② **위로 댕기면 시간표가 손가락을 따라 올라옴**: `_nmDragDismiss` 에 `onUpStart/onUpMove/onUpEnd` 훅. 댕기기 시작하면 `nmTtOpen(name, lines, pop)`(drag 모드)이 시트를 화면 아래에 만들어 `_nmTtDragCtl` 컨트롤러를 돌려주고, 손가락 위치만큼 시트 transform, 뒤의 네이티브 지도는 `follow`(보이는 끝 = min(시트 위쪽 끝, 팝업 위쪽 끝))로 따라간다(팝업은 그대로 · 캐릭터도 팝업에서 계속 놂). 놓으면: 56px 넘게/빠르게 → 올라온 자리에서 이어서 끝까지(`_nmSheetPrepareIn(s, fromDy, tFrom)`, 지도 setRect tFrom=손가락 자리) 후 팝업 제거·캐릭터를 시트로 이어받음, 모자라면 도로 내림(`nmTtClose(false, fromDy, {tFrom,tTo})`, 팝업·캐릭터 그대로), 위로 가다 되돌려 아래로 끌면 시트는 조용히 치우고 아래로 닫기. 곁다리 수정: 팝업 바깥 눌림 닫기에 `_nmDragLast` 검사(끌다 바깥에서 놓아도 안 닫힘), 팝업 `user-select:none`, 마우스 mousedown 때 남은 글자 선택 해제(끌어가기 가로채기 방지). 시험: `station_timetable.ui.test.js`(위로 댕기기 전 과정, 캐릭터 소유권 2개 시험). **실기기 미확인** — 네이티브 `follow` 가 프레임마다 브리지를 거쳐 기기에서 끊길 수 있음. 엔진 변경 없음.
- **(09:41 추가, YJ 사진: 버스 경로에서 정류장을 누르면 지도·위치가 나옴 → 없애고 출발/도착 설정 흐름으로)** — 버스 경로 시트(`#busRouteModal`)의 정류장 줄을 누르면 더는 지도·네이버/카카오 길찾기 패널이 펼쳐지지 않는다(`_brStopMap` → `_brStopPick`; 근처 정류장 카드의 🗺️ 버튼은 그대로). 흐름: ① 정류장 누름 → 시트 하단 바(`#brPickBar`)에 [출발지로 설정] ② 누르면 '출발지로 설정되었습니다' 팝업(`_pickPop`, 앱엔 토스트가 없다) + `_fmapSetLocation('start', {type:'bus',…})`(이전 도착지는 먼저 비움 — 안 비우면 옛 도착지로 바로 탐색), 경로 화면 유지, 하단은 '다른 정류장을 누르면 도착지로 설정됩니다' + [도착지는 역으로 설정]·[취소] ③ 다른 정류장 누름(출발지와 같은 이름은 무시) → '도착지로 설정되었습니다' + `_fmapSetLocation('dest', …)`(두 곳이 갖춰지면 기존 코드가 `fmapDoRoute` 를 부름 = 엔진 탐색) + 홈 이동 ④ [도착지는 역으로 설정] → 노선도 탭·지하철 화면(`_pickDestMode`, 하단 안내 글 `svgHint` 가 '도착지로 설정할 역을 누르세요'), 역을 누르면(`svgShowPopup` 이 가로채 `_pickStationTt`) 출발/도착 팝업 없이 시간표 시트 + 하단 [도착지로 설정]만(`#nmTtPick`) → 누르면 `_fmapSetLocation('dest', {type:'subway',…})` + 홈. 출발지를 정한 상태는 15분간 유지(`window._pick`, 닫았다 열어도 이어짐), 노선도 탭을 떠나거나 버스 화면으로 가면 '역 고르기'는 끝난다. 노선도 탭이 처음 열릴 때 버스로 되돌리는 MutationObserver 를 `_mapBusOpened=1` 로 막는다. 경로 계산은 전부 엔진(fmapDoRoute) — 앱은 선택 상태·화면만. 시험: `bus_pick_flow.ui.test.js`(CI 매트릭스에 추가). 실기기 미확인. 엔진 변경 없음.
- **(10:16 추가, YJ 사진: 하단 버튼이 가려짐 · 사람 모양 캐릭터 지워 달라)** — ① 버스 경로 시트 하단 바(`.brp-bar`)가 하단 탭(`.bnav`, 56px)에 가려져 [출발지로 설정] 버튼이 안 보였다 → 바 아래 여백에 탭 높이(56px)를 더해 탭 위로 올림(목록 `.bus-route-body` 도 아래 56px 여백). 시험: `bus_pick_flow` 에 '버튼 한가운데가 그 버튼에 닿고 탭 위쪽을 넘지 않음' 검사. ② 사람 모양처럼 보이던 것은 정류장 이모지 🚏(삼성 이모지로 사람이 서 있는 모양) — 앱 안 두 곳(노선 상단 칩·승차 줄의 기준 정류장 이름 앞, 하단 바)에서 모두 제거(`🚏` 0건). 경로 안내의 도보 🚶 아이콘은 '걷기' 구분 표시라 그대로 둠.
- **(10:33 추가, YJ: 출발지만 고르고 화면을 벗어나면 출발지를 없애고 처음부터)** — `_pickSetStart` 가 고르기 전 앱 상태(`_fmapStart/_fmapDest/S.start/S.dest`·입력창·화면 글자)를 `_pickSnap` 으로 적어 두고, 경로 화면을 벗어나면(`closeBusRoute` — ✕·바깥 누름·탭 이동) / [취소] / 역 고르기 중 노선도 탭을 떠나거나 버스 화면으로 가면 `_pickAbandon` 이 그 상태로 되돌리고 흐름을 끝낸다(다음엔 처음부터). 그 사이 출발지를 다른 곳에서 바꿨으면 건드리지 않는다. 예외: [도착지는 역으로 설정] 으로 가는 이동은 `_pickKeep` 플래그로 유지. 이전의 '닫았다 열어도 도착지 고르기가 이어짐'은 없앴다. 15분 지나도 같은 방식으로 정리. 시험: `bus_pick_flow` 6개(복원·바깥 눌러 닫기·탭 이동·역 고르기 유지/이탈).
- **(10:35 추가, YJ: 팝업을 위로 올리면 시간표가 팝업을 '가리는' 게 아니라 팝업이 올라가면서 시간표로 전환 — 팝업은 올라온 높이만큼 서서히 블러, 시간표는 진해지게)** — `_nmTtDragCtl` 이 손가락 높이 rev(0~H)로 진행도 p=rev/H 를 잡아 매 프레임: 시트 `translateY(H−rev)` + 투명도 `min(1, p·1.3)`, 팝업 `translateY(−rev·dk)` + `blur(p·8px)` + 투명도 `max(0, 1−p·1.5)`(dk=(팝업 위쪽 끝 − 시트 위쪽 끝)/H — 다 올라오면 팝업 위쪽 끝이 시트 위쪽 끝(vh−H)에 닿는다). 네이티브 지도 끝은 min(시트 위쪽 끝, 팝업 위쪽 끝)을 `follow` 로 따라가(`_nmFollowMove(dy, bottom)`) 지도가 줄었다 늘지 않고 단조롭게 시트 자리로 이어진다. 놓아서 올림: 시트(`_nmSheetPrepareIn(s, fromDy, tFrom, op0)` — `_nmSheetMove` 가 opacity 키프레임도 받음)와 팝업(끝까지 올라가며 blur 10px·투명 0 → 끝나면 제거, `_nmClosing`)이 같은 곡선·시간으로 마무리, 모자라면 시트는 내려가며 옅어지고(`PrepareOut` 의 `ov.o0`) 팝업은 또렷하게 제자리로(인라인 스타일 정리), 되돌려 아래로 끌면 팝업 스타일을 곧바로 풀고 시트는 치운다. `_nmDragDismiss` 는 up 모드에서 `onUpEnd` 가 있으면 팝업 transform 을 건드리지 않는다(컨트롤러가 담당). 계산은 손가락 위치→그림 값 변환뿐(엔진 무관). 시험: `station_timetable` '팝업을 위로 댕기면…' 보강. 실기기 미확인 — 매 프레임 blur·follow 가 기기에서 무거울 수 있음.
- **(11:00 추가, YJ: 시간표를 아래로 내리면 출발역·도착역 버튼이 있는 팝업이 다시 보이게, 올릴 때와 반대 애니메이션)** — 올릴 때의 `_nmTtDragCtl` 을 거꾸로 쓴다(`_nmTtDragCtl(sh, snap, popEl, rv)` 의 `rv`=되돌림). 시트를 끌어내리기 시작하면(`nmTtOpen` 이 등록한 `_nmDragDismiss` 의 `onStart`) `svgShowPopup(name, ls, {back:true})` 로 같은 역의 팝업을 만들어 (애니메이션·캐릭터 시작 없이) 시트가 다 올라온 때의 모습(위로 dk·H, 블러 8px, 투명)으로 대기시키고, 손가락이 내려간 만큼 rev=H−dy 로 같은 그림 함수를 쓴다: 시트는 `translateY(dy)`·점점 옅어지고(`min(1,p·1.3)`), 팝업은 위에서 내려오며 블러가 풀리고 또렷해진다. 지도 끝=min(시트 위쪽 끝, 팝업 위쪽 끝)을 `follow`. 놓을 때: 닫힘(25%·빠른 털기) → `end(false)` = 시트는 손가락 자리에서 내려가며 사라지고(240ms) 팝업은 같은 곡선으로 제자리·블러 0·불투명, 지도 setRect tFrom=끄던 끝 → tTo=팝업 위쪽 끝, 캐릭터는 `playSnap` 으로 팝업이 이어받음; 모자람 → `end(true)` = 시트가 도로 올라와 또렷해지고 팝업은 올라가며 흐려진 뒤 제거(시트 캐릭터 그대로). 도착지 고르기 모드(`_pickDestMode`)에선 되돌아갈 팝업이 없어 예전처럼 그냥 내려간다. 바깥 누르기·네이티브 지도 만지기로 닫는 길은 그대로(팝업 없이 닫힘). 시험 스위치 `window._nmNoBack`(옛 동작). 시험: `station_timetable` 신규 1건(19건) + 옛 '지도가 시트 위쪽 끝을 따라간다'는 `_nmNoBack` 으로 옛 경로 유지. 계산은 손가락 위치→그림 값 변환뿐, 엔진 변경 없음(s22 그대로). 실기기 미확인 — 팝업을 끌기 시작할 때 DOM 으로 새로 만들어 첫 프레임이 살짝 무거울 수 있고, 매 프레임 blur·follow 비용은 올릴 때와 같다.
- **(11:49 추가, YJ: 캐릭터 시계 위젯 — 가로·세로 × 블랙·화이트 4종, 시계 주변을 캐릭터가 돌아다님, 출퇴근 시각엔 응원/위로 + [출근하기]/[퇴근하기] → 앱 열려 길찾기; 12:07 "버튼 나올 땐 시계가 줄어들어도 좋겠다")** — 전부 네이티브(`native/`), 앱은 설정 전달·열림 처리뿐, 문구는 엔진, 길찾기는 기존 엔진 경로탐색.
  · **구조**: `WidgetGeo`(자리 계산, dp)·`WidgetSim`(캐릭터 상태기계: 걷기·쉬기·콩콩·시계 위 걷기·뛰어오르기·매달리기(진자)·강아지/고양이 응가(최대 3개, 8초 뒤 사라짐)·출퇴근 줄서기 cheer/comfort/warn)·`WidgetArt`(Surface 인터페이스로 그리기)는 android 와 무관한 순수 자바 → JVM 에서 시험(`test/java/WidgetJvmTest.java check`). `WidgetCore`(설정·장면·알람·RemoteViews·비트맵 갱신·화면 켜짐/꺼짐 수신) + `GdmWidgetBase/HB/HW/VB/VW/Receiver/Plugin`(Capacitor 플러그인 이름 `GdmWidget`: setConfig·takeLaunch·state·requestPin) + `native/res/`(레이아웃 4·위젯정의 4·배경 그림·문구).
  · **시계 글자는 시스템 TextClock**(분이 바뀌어도 깨울 필요 없음, 세로형은 시/분 두 줄). 캐릭터는 TextClock 위에 겹친 ImageView 비트맵을 프레임마다 `partiallyUpdateAppWidget` 으로 갈아 끼운다(10fps, 화면이 켜져 있을 때 45초만; 이후 바닥에서 쉬는 자세로 마지막 그림 → 정지 → 시트 해제; 화면 꺼지면 즉시 정지). 깨우기: 화면 켜짐/잠금해제(동적 수신기), 위젯 탭, 런처 갱신, 알람, 설정 변경.
  · **출퇴근 장면**: 앱이 `setConfig({on,mOn,eOn,morn,eve,days,mLat,mLng,eLat,eLng})` 전달(`_gwSync`, `_cmPersist` 뒤·시작·복귀 때, 같은 값이면 안 보냄). `on/mOn/eOn` 은 장소가 해석되는(= `_cmRouteFor` 성공) 쪽만 켠다 — 브리핑 알림 스위치와 별개. 위젯이 `evalScene`(요일·[시각, +90분)·오늘 끝낸 건 제외)으로 장면을 만들고 `scheduleNext` 가 정확 알람 1개만 건다(위젯이 없으면 알람 없음). 장면 시작 시 기본 문구 → 엔진 `GET /widget-say?kind&baseMs&lat&lng` 응답(`say`≤2줄·`mood`·`btn`)으로 교체. 버튼 → 앱 실행 + 인텐트 extra `gdm_widget_go` → `MainActivity`(CI 템플릿)가 `WidgetCore.captureLaunch` → JS `takeLaunch()` → `_gwGo(kind)` = `_cmRouteFor` → `_cmBriefRoute` → `_cmRouteFromBriefing()`(기존 브리핑 [경로탐색]과 같은 흐름). 열리면 그 장면은 끝난 것으로 침(`lastDone`).
  · **시계 축소(12:07)**: 장면 동안 `WidgetGeo.setCommute(true)` → 시계 글자 ×0.62(최소 14dp), 줄 서는 폭 `stageW` 은 캐릭터 3마리가 겹치지 않을 만큼 확보, 남는 폭을 말풍선·버튼에 준다. `WidgetCore.applyCommute` 가 바뀔 때만 글꼴을 다시 잰다. **위젯 칸 크기 자체는 런처가 정하므로 앱이 못 줄인다**(그 안에서 시계만 줄임).
  · **엔진 s23**: `/widget-say` (요일×출퇴근 문구 풀, 비·기온·공휴일·노선 공지 우선순위 위로/경고, 날씨는 좌표가 한국 범위일 때만). 시험 `route-v2/test/widget_say.test.js`. **YJ가 `route-v2-worker.ascii.js` 를 배포해야 s23 문구가 나온다** — 미배포여도 위젯은 기본 문구("오늘도 화이팅!"/"오늘도 수고 많았어요")로 동작.
  · **CI**: build-apk.yml 에 위젯 java 11개 + `native/res` 복사, MainActivity(`registerPlugin(GdmWidgetPlugin)`, `captureLaunch`, `onNewIntent` → JS 이벤트 `gdmWidgetGo`), 매니페스트 리시버 5개(위젯 4 + 알람/부팅/시간변경/앱업데이트 수신기). 시험 2개 추가: `widget_native_java.test.js`(JVM 자체점검 + android 스텁 컴파일 + XML 검증 + 워크플로·매니페스트 패치 실행), `widget_app.ui.test.js`(8건: 설정 전달·중복 방지·장소 없음·열림 → 길찾기·반대 방향·미설정 안내·추가 버튼·웹 폴백). 설정 화면 '🕒 캐릭터 시계 위젯' 카드(4종 추가 버튼 → `requestPin`).
  · **미확인(실기기 없음)**: RemoteViews 레이아웃·TextClock 숫자 상자와 실측(Paint) 정렬(삼성 One UI 글꼴), 런처의 부분 갱신 제한, 시트 메모리, 핀 요청 지원 런처. 로컬엔 진짜 android.jar 가 없어 android 부분은 손으로 쓴 스텁(`test/android-stubs`)으로만 컴파일했다 — **진짜 컴파일은 CI(gradle)가 처음**이다. 한계: 앱 프로세스가 죽어 있으면 화면 켜짐만으로는 움직임이 안 시작된다(위젯 탭·런처 갱신·알람 때는 시작). 배터리: 상시 서비스·폴링 없음, 알람 1개 + 화면 켜진 45초 동안만 10fps.
  · **위젯 CI 메모(12:50~)**: ① `.gitignore` 의 `android/` 규칙이 `test/android-stubs/android/**` 를 가려 CI 에서 스텁이 빠졌다 → `!test/android-stubs/android/` 예외 추가. ② 진짜 빌드(aapt)에서 `android:format24Hr` 속성 오타가 처음 드러났다 → `format24Hour/format12Hour`(시험에 속성 이름 대조 추가). 이제 **진짜 gradle 빌드 통과**(run 38681289051, debug APK 생성; 실기기 동작은 여전히 미확인). ③ CI 가 실패하면 시험 실패 항목·gradle 오류를 주석(annotation)으로 남기도록 워크플로 수정(로그 전체를 못 내려받아도 `gh api repos/.../check-runs/<job id>/annotations` 로 읽는다). ④ `tabs_smoke`·`station_timetable` 은 부하가 걸리면 가끔 실패하는 기존 흔들림이다(변경 전 코드도 로컬 부하 시험 4번 중 1번 실패) — 실패하면 `gh api -X POST repos/DullyYJ/subway-app/actions/runs/<id>/rerun-failed-jobs`.
- **(14:14 추가, YJ 실기기 스크린샷 보고: 배경 투명 + 위젯 크기를 시계 크기로 크게 + 버튼은 생성 후 3분만)** — ① 배경 없음: 레이아웃 루트의 `gdm_bg_*` 제거(파일 삭제), 시계 글자에 옅은 그림자, 말풍선·버튼은 판이 있는 모양(블랙=옅은 흰 판+검정 버튼, 화이트=진한 반투명 판+흰 버튼). **'블랙'=검정 글자, '화이트'=흰 글자**로 뜻을 바꿨다(레이아웃 파일 이름 `_dark`=블랙 변종은 그대로). 날짜 글자는 뺐다(GONE). ② 크기: 위젯 기본 칸을 가로 3×1·세로 2×2 로 줄이고(`targetCellWidth/Height`, 최소 크기 조정) `WidgetGeo` 를 다시 짜서 시계가 칸을 꽉 채운다 — 캐릭터가 올라설 머리 공간(charH+4)만 남기고 아래쪽에 크게 둔다(`T=min(높이 기준, 폭 기준)`, 최대 120dp). 시계가 칸을 채워 바깥 모서리 자리가 없으면 매달리기는 숫자 앞(안쪽 모서리)에서 한다(`hangX`). ③ 출퇴근 장면의 시계 축소는 최대 0.5배(+말풍선·버튼 자리가 모자라면 더; 세로는 아래 자리 계산 `fit`, 가로는 폭 `W-136`), 줄 서는 폭 `stageW`. ④ **버튼 3분**: 장면은 시작 시각부터 최대 90분 '대기'하지만 **화면이 켜져 처음 그려지는 순간(wake: 화면 켜짐·위젯 탭·런처 갱신·알람 때 화면이 켜져 있으면)부터 3분**(`armScene`, `SHOW_MS`)만 보이고, 알람이 3분 뒤 장면을 치우며 시계로 돌아간다. 안 눌렀어도 `lastDone` 에 기록해 같은 장면을 다시 띄우지 않는다. 설정 전달(`wake(…,"cfg")`)은 앱을 만지는 중이라 세지 않는다. 시험: `WidgetJvmTest check` 크기 7종(가로 230×90·180×80·300×100·360×160, 세로 170×210·130×250·160×320)에서 '시계가 칸에 크게', '(출퇴근) 말풍선·버튼 겹침 없음·말풍선 크기', '매달리기'. **3분 로직(armScene)은 안드로이드 쪽(SharedPreferences·알람)이라 JVM 시험이 없다 — 스텁 컴파일만 했고 실기기 확인이 필요하다.**
- **(15:04 추가, YJ 실기기: ① 위젯 고르는 화면에 시계 화면이 보이게 ② 강아지 두 종류에 꼬리 ③ 화면을 켤 때마다 캐릭터 교체; 15:13 비숑=길고 곱슬한 꼬리, 푸들=짧고 부드러운 꼬리)** — ① 위젯 4종의 provider xml 에 `android:previewImage`(`native/res/drawable-nodpi/gdm_preview_{hb,hw,vb,vw}.png`) 추가. 그림은 `WidgetJvmTest preview`(시계 화면 + 캐릭터가 시계 위·매달림·걷는 장면을 찾아 그림, 옅은 바탕 카드 위; 실제 위젯은 투명). 위젯 크기를 바꾸면 `java … WidgetJvmTest preview <시트 png 폴더> <out.png> <h|v> <W> <H> <dark|light> 10:09` 로 다시 만든다. ② 꼬리: 원인은 3D 모델(`tools/chars3d/models.js buildDog`)의 꼬리가 몸통 뒤 낮은 공 하나라 3/4 시점에서 머리·엉덩이에 가려진 것. 이제 **비숑(돌솜)=털공 7개가 등 뒤로 솟아 끝이 앞으로 말리는 긴 곱슬 꼬리, 푸들(뽀푸)=3개짜리 짧은 둥근 꼬리**(`o.tail:'long'|'short'`), 위로 솟아 머리 왼쪽에 보인다. **카메라는 예전 값 그대로**(`export.js` 에 `FIXV` 환경변수 추가: `FIXV='{"dolsom":[2.501,1.054,0.07],"ppopu":[2.6,1.101,0.078]}' node export.js dolsom,ppopu 16 14 && python3 assemble.py`) — 그래서 시트 크기·바닥줄·중심(앱 D3·`cfg`의 base/ox)이 하나도 안 바뀐다. 렌더 환경: three r160 은 `/home/claude/mrdoob/three.js/build/three.min.js`(npm 은 이 샌드박스에서 막힘), `NODE_PATH=/opt/node-tools/node_modules`. 앱 전체(로딩 캐릭터·시간표 놀이터·위젯)가 같은 시트를 쓰므로 모두 꼬리가 생긴다. 시험: `widget_native_java` 에 '꼬리가 보이고 칸 밖으로 안 잘린다'(꼬리 없던 옛 시트로 돌리면 실패하는 것 확인). ③ 화면 켜짐(`ACTION_SCREEN_ON`)마다 `reshuffle` 로 3마리를 새로 뽑아 갈아 끼운다(`WidgetSim.pickSet` — 직전과 다른 구성, 6마리 골고루; JVM 시험 포함). 잠금해제(`USER_PRESENT`)는 켜짐 직후 이어서 오므로 다시 안 바꾼다. 켜짐 경로에 빠져 있던 `refreshAll` 도 넣었다(장면이 시작될 때 말풍선·버튼이 엔진 응답을 기다리지 않고 바로 뜸 — 엔진이 실패해도 기본 문구로 뜬다). 한계: 켜짐 수신기는 앱 프로세스가 살아 있을 때만 동작(죽어 있으면 위젯 탭·런처 갱신 때 새 프로세스가 무작위로 뽑는다). 실기기 미확인.
- **(16:04~16:30 추가, YJ 실기기: 다른 앱을 쓰다 홈으로 돌아오면 캐릭터가 멈춰 있음 → "1~2분 움직이다 잠자기. 잘 땐 동물마다 종류에 맞는 집이 그라데이션으로 무작위 자리에 생기고 거기 들어가 자고, 자동으로 깨는 건 무작위, 사람이 위젯을 누르면 깨어나 돌아다니기")** — 원인: 예전엔 켜짐·잠금해제·위젯 탭·런처 갱신 뒤 45초만 움직이고 멈췄고, '홈으로 돌아옴'은 안드로이드가 위젯에 알려 주지 않아 앱이 그 순간을 알 수 없다. 그래서 화면이 켜져 있는 동안 순환한다: **놀기 1~2분(`AWAKE_MIN/MAX_MS`, 매번 무작위) → 잘 시간(`WidgetSim.bed`): 동물 종류별 집이 무작위 가로 자리에 0.9초에 걸쳐 서서히 생기고(스케일 0.82→1 + 투명도 0→1, 세로 그라데이션 색) 모두 자기 집으로 걸어가 들어감(`BED_WALK`→`ENTER`→`SLEEP`) → 동물마다 20~60초 뒤 무작위로 깨어 나오고(`EXIT`, 집은 서서히 사라짐) 모두 깨어 집이 없어지면 다시 놀기.** 집: 돌솜·뽀푸=개집(돌솜 크림벽+파란 지붕, 뽀푸 갈색벽+붉은 지붕), 러블=분홍 쿠션 바구니, 두덩=흙 굴, 술=나뭇가지 둥지, 챙챙=연잎 연못(`WidgetSim.houseKind`; `hides`: 개집·굴은 몸이 안 보이게 쏙 들어가고, 바구니·둥지·연못은 웅크린 몸이 보이며 앞벽 `houseFront` 가 아래를 덮음). 머리 위 zzz 는 시각으로 계산해 떠오르며(`WidgetArt.zed`, `Ch.zz` 로 서서히 진해짐) 멈춘 프레임에서도 보인다. 그라데이션을 위해 `WidgetArt.Surface.polyGrad`(안드로이드 `LinearGradient`, PC `GradientPaint`) 추가 — 시험용 스텁 `android/graphics/{Shader,LinearGradient}.java` 추가. 마지막으로 깨운 뒤 `SESSION_MS`(10분)가 지나 잘 시간이 되면 '깨울 때까지' 모드(`bed(true)`)로 모두 집에서 자는 모습(zzz)으로 멈춘다(`endAsleep`, 배터리 상한). 화면 켜짐·잠금해제·위젯 탭(`wake`→`resume`→`wakeAll`)은 자는 중에도 한 마리씩 시차(0.25초)로 즉시 깨운다(자러 가는 길·시계에서 뛰어내리는 중이어도). 출퇴근 장면은 안 잔다(옛 방식: 45초 뒤 줄 선 자세로 멈춤; 자러 가거나 자는 중 장면이 시작되면 깨어 줄을 서고 집은 사라짐 — `bedding` 플래그). 프레임: 깨어 있는 동안·집에 들어가는 동안 10fps, 모두 잠든 동안 5fps(`SLEEP_FRAME_MS`). 시험: `WidgetJvmTest check` '잠자리' 항목들(가로·세로 각각 40판: 종류 맞음·서서히 생김·자리 무작위·걸어 들어감·zzz 진해짐·20~60초 무작위로 깸·집 사라짐 + 깨울 때까지 모드·wakeAll·자러 가는 중 깨움·출퇴근 때 안 잠·자다가 출퇴근 시작·그림에 Z 3개씩+그라데이션) + `render … sleep|beddingMid` 그림으로 눈으로 확인(집 모양·앞벽·zzz). 한계: `WidgetCore` 의 위상 전환(phase 0/1/2, `bedUntil` 20초 타임아웃, `snapBed`, `endAsleep`)은 안드로이드 코드라 스텁 컴파일만 했고 실행 시험은 없다. 앱 프로세스가 죽어 있으면 이 순환도 못 돈다(위젯 탭·런처 갱신·알람이 깨움; 항상 돌리려면 포그라운드 서비스 토글이 따로 필요 — 논의만 했고 만들지 않음). 집 그림은 PC 에서 렌더해 본 것이고 실기기 모습은 미확인. '그라데이션'은 '서서히 나타남 + 집 색을 위→아래 그라데이션'으로 해석했다.
- **(16:27~16:55 추가, YJ: "동물들은 정해진 시간에 돌아다니게" → 곧바로 "안돼, 잠자는 건 최소화. 깨울 수 있는 신호를 받으면 일어나서 돌아다니고, 한 번 돌아다니면 2분 돌아다니게 하고 그냥 재워" + "시계 위젯을 누르면 앱이 열리며 커뮤니티 탭으로")** — ① 최종 동작(`16:30` 항목의 '1~2분 놀고 무작위로 자고 깨기' 순환과 중간에 만들었다 되돌린 '매시 정각 2분'제를 **대체**): 평소엔 모두 종류별 집(무작위 자리, 그라데이션)에서 zzz 하며 자고 있고(그림 한 장, 루프·갱신 없음), **깨울 수 있는 신호가 오면**(화면 켜짐 `ACTION_SCREEN_ON`·잠금 해제·런처의 위젯 갱신 `onUpdate`·크기 변경·알람) 마리마다 무작위(`ROAM_SPREAD`=0~3초)로 일어나 나와 **2분**(`WidgetSim.ROAM_LEN_MS`) 돌아다니다가 집으로 들어가 잔다(`bed(true)` → `endAsleep`: 다음 신호까지). 이미 돌아다니는 중에 오는 신호는 시간을 늘리지 않는다(켜짐 직후 잠금 해제가 이어서 와도 2분 그대로; 자러 가는 중이면 다시 일어난다). 화면을 켤 때마다 캐릭터 셋을 바꾸고 곧장 깨어난 모습으로 시작(`awakeHold`), 화면이 꺼지거나 2분이 끝나면 집에서 자는 모습(`settleFrame`). **앱 프로세스가 죽어 있으면 화면 켜짐을 들을 수 없으므로**, `ROAM_EVERY_MIN`(=10) 분마다 정각 기준 정확 알람(기존 `scheduleNext` 한 슬롯에 다음 출퇴근·장면 끝과 함께 가장 빠른 것을 건다; 소리·알림 없는 조용한 내부 타이머)이 프로세스를 되살려 수신기를 다시 달고, 그때 화면이 켜져 있으면 2분 돌아다닌다(화면이 꺼져 있으면 아무것도 안 함). 알람 간격은 상수 한 줄(60 의 약수). 배터리: 하루 144번의 짧은 깨어남 + 화면이 켜진 채 다른 앱을 쓰는 중에도 10분마다 2분 움직임(홈이 보이는지는 알 수 없으므로) — 실측 못 함. 앱 안에서 설정을 바꿀 때(`cfg`)는 동물을 깨우지 않는다. 출퇴근 장면은 그대로(안 잠, 45초 뒤 줄 선 자세로 멈춤). **위젯을 누르면 더 이상 동물을 깨우지 않는다**(누르면 커뮤니티 탭으로 가므로; 옛 `ACTION_POKE` 는 이미 깔린 위젯의 낡은 버튼용으로만 남김). ② 위젯 본체·말풍선을 누르면 `communityIntent`(런처 인텐트 + extra `gdm_widget_tab=community`) → `captureLaunch` 가 `pendingTab` 에 담고 → 플러그인 `takeLaunch()` 가 `{go, tab}` 을 돌려주고 → 앱 JS `_gwCheckLaunch` → `_gwOpenTab('community')` → `switchTab('community', #ni-community)`(막 켜져 탭 막대가 없으면 0.5초 간격 12번 기다림). 버튼([출근하기]/[퇴근하기])은 그대로 `gdm_widget_go`. 시험: JVM 알람 시각 계산(5개 시간대)·`asleepNow`·`wakeAll(20)` 무작위 기상(가로·세로) + UI 시험 2개(커뮤니티 탭 이동·한 번만 / 탭 막대가 늦게 생겨도 이동). 한계: `WidgetCore` 의 신호 처리·알람·위상 전환은 안드로이드 코드라 스텁 컴파일만 했고 실행 시험은 없다. 실기기 미확인 — 특히 삼성에서 '알람 및 리마인더' 권한이 꺼져 있으면 알람이 정확하지 않고, 화면 켜짐 수신기는 앱 프로세스가 죽으면 다음 알람(최대 10분) 때까지 못 듣는다.
- **(17:02 추가, YJ: "앱을 살리는 신호를 계속 넣어주면 안돼?" → 알림 없이 배터리 예외 + 알람 간격 줄이기)** — 알람 간격 10분 → **3분**(`ROAM_EVERY_MIN`, 60 의 약수). 알람은 프로세스를 되살리고 화면 켜짐 수신기를 다시 다는 용도이므로, 알람마다 2분씩 움직이면 배터리만 쓴다 → 마지막 움직임이 끝난 지 `ROAM_ALARM_COOLDOWN_MS`(10분)가 안 됐으면 알람으로는 안 움직인다(프로세스가 막 되살아나 `lastRoamEnd` 가 0 이면 움직임; 화면 켜짐·잠금해제·런처 갱신은 쿨다운 없이 항상 깨움). 배터리 최적화 제외·삼성 '절전 안 함'은 앱에 이미 있는 기능(`PowerPlugin`, 설정 탭 `_batRequest`/`_samOpen`)을 위젯 설정 카드에서 링크 두 줄로 바로 열게 했다(같은 앱 프로세스를 지켜 주므로 위젯에도 그대로 적용). 한계: 알람은 Doze(화면 꺼진 채 가만히 있음) 중엔 시스템이 약 9분에 한 번으로 미룰 수 있어 3분이 지켜지지 않을 수 있고, 삼성 '알람 및 리마인더' 권한이 꺼져 있으면 정확하지 않다. 화면 켜짐 신호는 프로세스가 죽은 동안 못 듣는다(다음 알람까지 최대 몇 분). 항상 켜져 있는 포그라운드 서비스(상단바 알림)는 YJ 가 알림 없는 쪽을 골라 만들지 않았다. 실기기 미확인.
- **(17:23~ 추가, YJ 스크린샷 3장: ① 부드러운 노선도 토글이 반응 없고 켜짐/꺼짐 모양이 안 맞음 ② 출퇴근 장소 자동완성에서 역 이름이 세로로 나옴 ③ 위젯 말풍선 칸이 너무 크고 버튼이 작음)** — ① `#nmSetOn:checked ~ #nmSetKnob/#nmSetDot` CSS 규칙이 인라인 style 에 져서 모양이 안 바뀌던 것 → `!important`(`_nmSyncCard` 가 인라인으로 칠하는 값과 겹치지 않게). 시험: `metro_native_js` '스위치: 켜짐=금색+점 오른쪽, 꺼짐=회색+점 왼쪽 — 눌러서 바뀌고 글자와 항상 같다'. ② `.cm-sug-name{flex:0 0 auto;max-width:72%;white-space:nowrap;ellipsis}` + 노선 안내 `.cm-sug-line` 은 줄임표로 먼저 줄어듦(역·버스 두 템플릿 모두). 시험: `widget_app.ui.test.js` '자동완성 목록: 역 이름이 가로 한 줄'. ③ **출퇴근 장면 크기 위계 = 시계 > 말풍선 글자 > 버튼 글자**(`WidgetGeo.sizeText`): 말풍선 글자 `bubTs`=세로는 상자 폭/12.5(13~18dp), 가로는 높이×0.11(12~18dp)에서 시작해 가로형은 높이가 모자라면 줄이고, 시계 글자보다 항상 작게; 버튼 글자 `btnTs`=말풍선×0.88; 버튼 높이=`btnTs×2.5`(최소 24~30dp, 옛 30dp·14dp보다 커짐), 가로 패딩 `btnTs×1.8`. **말풍선 상자는 글 줄 수만큼만**: `bubbleHeight()=줄수×bubTs×1.3+2×bubPad`(옛: 남는 높이를 전부 차지). 줄 수는 `WidgetCore.bubbleLines`(Paint.measureText 로 띄어쓰기 줄바꿈 시뮬)로 재서 `setCommute(true, lines)` 에 넣고, 줄 수↔글자 크기가 서로 오가면 큰 줄 수로 잡는다. **시계는 필요한 만큼만 줄어든다**: 세로형 시계 크기=`(H−머리공간−(캐릭터줄+말풍선+버튼+여백))/…`와 원래 크기 중 작은 쪽(옛 ×0.5 강제 축소 폐지), 가로형은 옆 칸 폭만큼만. 레이아웃 4종: 말풍선·버튼 `wrap_content`, `gw_cmt` `gravity=bottom`(아래 버튼부터 쌓임 — 줄 수를 잘못 재도 버튼은 안 밀림). 런타임에 글자 크기·버튼 패딩·말풍선 패딩을 `views()` 가 넣는다. 시험: `WidgetJvmTest check`(크기 7종: 글자 위계, 버튼 비례, 말풍선 높이=줄 수, 세로 시계 아래 자리 충분·남는 자리 적음, 줄 수 1→4 때 위젯 밖으로 안 나감) + 미리보기 그림(`render … -DbubLines=N`)으로 비율 확인. **한계(실기기 미확인)**: 말풍선 줄 수는 내 글꼴 측정 기준이라 삼성 글꼴·줄 간격과 오차가 있을 수 있다(그래도 아래부터 쌓여 버튼은 제자리, 어긋나면 말풍선 위쪽 간격만 변함); `WidgetCore.bubbleLines`/`applyCommute` 는 안드로이드 코드라 스텁 컴파일만. 가로형 낮은 위젯(예 180×80)에서는 글자가 10dp 안팎까지 작아진다.
- **(17:53 추가, YJ: "길동무 앱을 열었다가 닫으면 동물들이 다시 움직이게")** — 앱과 위젯은 같은 프로세스라 신호를 바로 줄 수 있다. CI 가 쓰는 `MainActivity` 에 `onStop()`(앱 화면이 안 보이게 될 때 = 홈·다른 앱으로 나감) 추가 → `WidgetCore.onAppLeft` = `evalScene` + `wake(c,"app")`: 집에서 자던 동물이 일어나 2분 돌아다니고 다시 잔다(이미 돌아다니는 중이면 시간 연장 없음, 알람 쿨다운은 적용 안 함, 화면이 꺼져 있으면 안 함). 앱을 *여는* 순간엔 안 움직인다(위젯이 안 보이므로). 출퇴근 때가 됐으면 같은 길로 장면이 뜬다. 시험: `widget_native_java` 에 워크플로의 `onStop`/`onAppLeft` 연결 검사 + 스텁 컴파일. MainActivity 는 CI 가 생성하는 파일이라 로컬에선 문자열 연결만 확인 — **진짜 컴파일·동작은 CI·실기기 확인 필요.** 한계: 화면을 끄는 순간에도 `onStop` 이 오지만 `wake` 가 화면 꺼짐이면 아무것도 안 해서 무해. 앱 안에서 팝업·권한창으로 잠깐 가려질 때는 `onStop` 이 안 와서(onPause 만) 움직이지 않는다.
- **(17:58 추가, YJ: "돌아다니는 시간을 설정에서 2~10분으로, 6분 추천·그 이상은 배터리 소모 조금 증가 표기, 동물을 깨우려면 시계를 눌러 앱에 접속하면 된다고 표기")** — 위젯 설정 카드에 '🐾 돌아다니는 시간' 슬라이더(2~10분, 1분 단위, 기본 **6분**, 6분 옆에 '추천' 표기) + 안내 두 줄('6분 추천이에요. 그보다 길면 배터리 소모량이 조금 늘 수 있어요.' / '자고 있는 동물들은 시계 위젯을 눌러 앱에 들어갔다 나오면 깨어나요.'). 값은 `localStorage.gwRoamMin`(범위 밖이면 6), 바꿀 때 `_gwSync` 가 설정 JSON 에 `roam`(분)을 실어 위젯에 새로 넘긴다. 네이티브: `Cfg.roamMin`(`WidgetSim.roamMs` 로 2~10 밖은 6 으로), `WidgetCore.roamMs(ctx)` 가 `wake` 의 깨어 있는 시간(`burstUntil`)에 쓴다(출퇴근 장면 45초는 그대로). 기본이 2분 → 6분으로 바뀜(`ROAM_LEN_MS`=6분). 이미 돌아다니는 중에 바꾸면 그 회차엔 적용 안 되고 다음 깨어남부터. 알람 쿨다운(10분)은 그대로. '깨우는 방법' 문구는 실제 동작 기준: 위젯을 눌러 앱이 열렸다가 **닫힐 때**(`onStop`) 깨어난다(앱을 여는 순간엔 안 움직임). 시험: `WidgetJvmTest` `roamMs` 경계, `widget_app.ui.test.js` 신규 2건(슬라이더 범위·기본·문구·전달·유지·이상한 값). `WidgetCore.cfg` 의 JSON 해석은 안드로이드 코드라 스텁 컴파일만. 배터리 영향 미측정.
  · **(17:58 CI 메모)** 앱 닫을 때 깨우기용 `MainActivity.onStop()` 을 `protected` 로 만들었다가 CI 컴파일 실패(`BridgeActivity.onStop()` 이 public — 접근 범위를 줄일 수 없음). `public void onStop()` 으로 수정. 로컬엔 MainActivity 를 컴파일할 길이 없어(CI 가 생성) 문자열 검사만 했던 탓 — 이후 MainActivity 를 건드릴 땐 상위 클래스 메서드의 접근 수준을 확인할 것.
- **(18:39 추가, YJ: 스크린샷 — 신연수에 도착하지 않았는데 마커가 신연수(원인재→신연수 구간) → "당긴 시간 몇 초? → 5초로")** — 당김 값은 엔진 `ride-eta` 의 `arriveEarlySec`(중간역 도착을 표시 시각보다 앞당겨 마커·오버레이 위치 pos 만 당김, 승차역·최종 목적지 제외, 표시 시각 etaMs·arr 은 그대로). 10초 → **5초**(엔진 `route-v2-2026-10-15s24`, route-v2 repo 커밋 `엔진 s24`; 앱 repo `engine/ride-eta.js` 사본·`test/ride_eta.test.js`(기준 5초: 7초 전은 앞 역, 4초 전은 도착, 구간 시각 −5초) 같이 수정). 영점 창 `zeroLeadSec` 25초와 정차 `stopDwellSec` 25초는 그대로. **배포 필요**: `route-v2-worker.ascii.js` 를 Cloudflare 에 붙여 넣어야 적용(s23 위젯 멘트도 같이 나간다). 앱 코드 변경 없음. 원인 추정만 했고 그 순간의 엔진 값은 확인 못 함 — 시각표가 분 단위 표시라 신연수 예정이 18:36:5x 였다면 10초 당김으로 올라갔을 수 있다. 5초로 줄이면 인천1호선 '도착 표시 15초 늦음'(10-14)이 일부 되살아날 수 있다. 시험: `ride_eta` 80/80, `ride_track` 120/120.
- **(19:00 추가, YJ: "계속 5초씩 땡기니까 안 맞는다 — 경유역 도착하며 영점을 맞추고 도착시간을 다시 초 단위로 조절한 뒤, 이후 마커 도착 시간 표시를 5초 땡기자")** — 엔진 s25(route-v2 `엔진 s25`): `arriveEarlySec`(5초) 당김을 **GPS 영점(`passes` 의 src 'gps')이 하나라도 잡힌 뒤, 그 영점 역보다 뒤의 중간역에만** 적용(`arriveEarlyAfterZero: true`). 영점이 없으면(승차 직후·지하·약한 증거 pf/move/board 뿐) 시각표 그대로 — 당기지 않는다. 영점 역 자신은 당기지 않는다(실제 통과 시각이 기준). 영점이 잡히면 뒤 도착 시각(etaMs)은 이미 s22 로 **초 단위**로 밀고 당겨지고(`ride-track` 영점 보간), 그 맞춰진 시각에서 5초만 당긴다. 되돌리는 스위치: `opts.arriveEarlyAfterZero=false`(예전: 항상 당김). 앱 사본 `engine/ride-eta.js`·시험 `ride_eta.test.js`(81건: 영점 없으면 안 당김, pf 만 있어도 안 당김, 8초 늦은 영점 뒤 동춘은 맞춘 시각 4초 전 도착·6초 전 아직 동막, 영점 역은 안 당김, 옛 스위치) 갱신, `ride_track` 120/120. **배포 필요**: `route-v2-worker.ascii.js`(`route-v2-2026-10-15s25`). 한계: 영점이 안 잡히는 지하 구간은 이제 5초 당김이 없어 인천1호선 '도착 표시 15초 늦음'(10-14)이 그 구간에선 되살아날 수 있다 — 영점이 자주 잡히는 구간(지상·역 근처 GPS)에서만 당김이 켜진다.
- **(18:52~19:00 추가, YJ: 내 위치·도착시간을 카카오톡으로 — 혼잡도 분석 줄 오른쪽에 위치 공유 버튼, 빨간 부분(타임라인) 압축)** — ① 버튼 `#shareLocBtn`('📍 위치 공유', 즐겨찾기와 같은 `--gold` 테두리 알약, 혼잡도 분석 제목 줄 오른쪽 `margin-left:auto`). ② `_shLoc()` 이 화면에 이미 있는 값만 모은다 — 현위치 역은 마커와 같은 `_pipHereIdx`(두 역 사이면 `_estimateTimelinePos` 로 'A→B 이동 중', 승차 전이면 '승차 대기'), 도착·남은 시간은 화면 헤더와 같은 `_journeyEta`, 출발·도착은 `_journeyFromFixed`/`_transitResultStart`/`Dest`. 새 계산 없음. 글: `출발지 - 현위치 - 도착지 (도착예정시간: 18시51분)\n[남은시간: 00시29분]`(YJ 양식 그대로 — 남은시간은 `00시29분`, 75분이면 `01시15분`). ③ `_shPng()` 이 타임라인을 압축한 360×214(×2) PNG 를 캔버스로 그린다: 출발·지금 역 앞뒤·도착만 남기고 사이는 `··· N`, 지난 역은 흐리게, 지금 역은 파란 점+번짐, 색은 테마 CSS 변수(`--card/--text/--sub/--arex/--blue`)를 읽어 따른다, 이름은 칸 폭에 맞춰 …. ④ 보내기: 새 네이티브 플러그인 `GdmShare.shareImage({png, text, pkg:'com.kakao.talk'})`(`native/GdmSharePlugin.java`) — 그림을 앱 캐시 `cache/gdmshare` 에 쓰고 `FileProvider`(권한 `<패키지>.gdmshare`, 경로 정의 `native/res/xml/gdm_share_paths.xml`, 매니페스트는 워크플로 파이썬이 패치)로 `ACTION_SEND`(image/png + 글). 카카오톡이 있으면 그 앱의 대화 고르기를 바로 열고(없거나 못 열면 안드로이드 공유 목록), **누구에게 보낼지는 사용자가 카톡에서 고른다**(자동 발송 없음). 플러그인이 없거나 실패하면 `navigator.share`/클립보드로 글만. 워크플로: 복사 목록·`registerPlugin(GdmSharePlugin.class)`·FileProvider 매니페스트·시험 매트릭스에 `share_loc.ui.test.js` 추가. 시험: `share_loc.ui.test.js` 7건(버튼 위치·테마, 글 양식, 이동 중 표기, 플러그인 호출 인자·PNG 크기 720×428, 역 3개·파스텔, 경로 없을 때 안내, 거절 시 복사) + `widget_native_java`(스텁 컴파일에 GdmShare 포함·FileProvider 패치 확인). **한계(실기기 미확인)**: ① 카카오톡이 **그림과 글을 함께** 받을지(앱에 따라 글을 버리고 그림만 보낼 수 있음 — 그래서 글 내용이 그림 안에도 들어 있다) ② 카카오톡 직접 열기가 안 되면 공유 목록이 뜬다 ③ `GdmSharePlugin` 은 스텁 컴파일만 — 진짜 컴파일·동작은 CI·실기기. 지금 공유하는 건 '현재 역 이름·도착 예정'뿐이고 좌표·실시간 위치 추적 링크는 보내지 않는다.
- **(20:12~20:16 추가, YJ: ① 위치공유 팝업 테마·한 줄/두 줄·누르면 검은 화면 ② 퇴근 20:15인데 퇴근 버튼 안 뜸 ③ 평일·주말·매일을 요일처럼 파랗게 ④ 추운 날 고무장갑 추천 개선)**
  · ① `_pickPop(msg, sub, 'sh')` — 테마 카드색(`--card`·`--text`·`--sub`)·테두리, 제목 한 줄(`nowrap`), 아래 글은 `\n`→`<br>` 두 줄(`word-break:keep-all`로 낱자 "요"가 줄 머리에 안 남음). 검은 화면 원인은 **추정**(KakaoTalk 을 `setPackage` 로 곧장 띄운 것) → `GdmSharePlugin` 을 공유창(chooser)+`ClipData`+`EXTRA_INITIAL_INTENTS`(카카오톡을 맨 앞에 고정)+Activity 컨텍스트로 변경. **실기기 미검증.** 시험: `share_loc.ui.test.js` 10개(dark·pastel·light 팝업 색·줄 수).
  · ② 가장 유력한 원인(추정): 위젯 장면 열쇠가 `날짜+eve` 라서, 오늘 앞서 다른 시각(18:30 기본)에 장면이 한 번 보였거나 버튼을 눌러 `lastDone` 이 찍혔으면 시각을 20:15로 바꿔도 "이미 끝난 장면"으로 취급돼 안 떴다. → `sceneKey = 날짜+kind+시작분`, 시각이 바뀌면 옛 장면 치움, `evalScene` 이 boolean 반환(앱 닫을 때·잠금 해제 때 새 장면이 열리면 `refreshAll`). 알람 지연·권한 문제는 코드로 확인 못 함(USE_EXACT_ALARM 선언은 있음). **실기기 미검증.**
  · ③ `#cmDayPresets` 를 `_cmRenderDays` 가 그린다 — 요일이 평일/주말/매일과 정확히 같을 때만 `--chip-on-bg` 파랑(요일 칩과 같은 변수).
  · ④ 원인: `_SHOP_SEASON_KW.winter` 의 `장갑`(그리고 fall/winter 의 `니트`)이 고무장갑·위생장갑·니트릴 장갑에 걸려 "쌀쌀해서 하나쯤 있으면 든든해요"가 나왔다. → `_SHOP_NOWX`(고무장갑·위생장갑·비닐장갑·니트릴·설거지·수세미·세제·물티슈…)는 계절·기온 점수 0, `_arrShopLine/_arrShopSay/_arrShopReason` 에서 방한·더위 문구 제외, `장갑` 정규식에 부정 lookbehind, `니트(?!릴)`. 서버가 내려주는 규칙(`_cfg.kw`)을 써도 `_shopSeasonScore` 맨 앞에서 0 으로 막는다. 시험: `day_preset_shop_wx.ui.test.js` 7개(CI 목록에 추가).
- **(21:09 추가, YJ: 퇴근 말풍선 "늦게까지 정말 수고했어요"가 매일 달라지는 하루 마무리 응원이게 / 출근은 하루 시작 멘트 / 퇴근하기 버튼 폭을 문구 폭과 같게)** — ① 엔진 s26(`route-v2` repo, YJ 가 `route-v2-worker.ascii.js` 를 붙여 넣어야 반영): `WSAY_CLOSE`(30)·`WSAY_START`(30)·`WSAY_CLOSE_LATE`(12)·`WSAY_LATE_TIP`(4) — 날짜 시드로 순환(같은 날은 같은 말, 28일 동안 겹치지 않음을 시험). 21시 이후 퇴근은 첫 줄=늦은 마무리 멘트, 둘째 줄=막차 안내류. 날씨·공지·공휴일 분기는 그대로, 날씨 말이 없는 날 둘째 줄이 고정문구("오늘도 수고 많았어요/오늘도 화이팅!")에서 마무리(퇴근)·시작(출근) 멘트로. 엔진에 닿지 않을 때의 앱 기본 문구는 그대로. ② 버튼 `gw_btn` 폭을 `match_parent` 로(말풍선과 같은 좌우 여백 안이라 폭이 같다), 가로형 `WidgetGeo.btnW = bubW`. "문구" = 말풍선(글 상자)으로 해석했다. 시험: `WidgetJvmTest`(btnW==bubW), `widget_native_java`(4개 레이아웃 match_parent), `widget_say` 12개. **실기기 미검증.**
- **(21:26 추가, YJ 스크린샷: 혼잡도 분석 카드 — 버스는 칸별 필요 없으니 그래프를 키우고, 지하철 환승 때 칸별을 보이고, 지하철→버스면 다시 숨기고, "보통 😐" 을 화살표 자리로, 그래프 칸을 넓히고, 현재 시각 막대를 가운데로, 밝은 테마에서 안 보이던 흰 테두리를 검정으로)** — ① `_congApplyMode(mode)`(칸별 제목·칸·버스 안내 표시/숨김 + `#congCard.bus` 클래스)를 `updateBusCong` 맨 앞(비동기 응답 전)·`updateCong`·`_resetCongToWaiting` 에서 부른다. 버스 정보를 못 받으면(`res` null) 앞 지하철의 수치·그래프를 지우고 "정보 없음". ② **버그**: GPS 구간 전환 경로(~14845)의 `updateCong` 이 force 없이 불려, 버스 표시 중(`_congMode==='bus'`)엔 지하철 갱신이 통째로 무시됐다(= 버스→지하철 환승에도 칸별이 안 돌아옴) → `true` 전달. ③ `congStatusTxt` 를 `.cong-top` 오른쪽(세로 가운데)으로. ④ 그래프: `--bars-h` 112px(지하철)/160px(버스, `.cong-card.bus`), 막대 배율 `_chartBarK()` 0.9/1.38. ⑤ `_chart24Center`: 실제 막대 위치로 가운데 맞춤 + 양끝 반 폭 여백(옛 계산은 막대 폭을 30·38 로 잘못 가정해 오른쪽으로 치우쳤고, 끝쪽 시각은 스크롤 한계로 가운데가 불가능했다) · `initChart24Scroll` 의 2초 뒤 복귀도 같은 함수. 안 보이는 탭이면 IntersectionObserver 로 보일 때 맞춤. ⑥ 현재 시각 값을 기본으로 보여 준다("현재 21시  38%", 줄 가운데 정렬 — "해당시간의 혼잡도를 가운데로"를 막대·값 둘 다로 해석). ⑦ 현재 막대 테두리·라벨 색 `--cur-ol`: 다크 #fff, 파스텔 #111. 시험 `cong_card.ui.test.js` 7개(CI 목록 추가). `ride_evidence.ui.test.js` 는 이 샌드박스에서 변경 전에도 끝나지 않는다(로컬 한정, CI 는 통과해 왔다). **실기기 미검증.**
- **(22:12 추가, YJ 스크린샷: M6659 "정보 없음" + 빈 그래프 — 가운데 "현재 시각·퍼센트" 줄 삭제 / 버스 혼잡도가 없으면 경로의 지하철을 / 지하철도 환승하면 바뀌어야 / 현재 시각 그래프 가운데)** — ① `.chart-tooltip` 줄(HTML)과 기본 툴팁 호출 삭제(`showChartTooltip` 은 null 안전으로 남김). ② `_congFallbackSubway()`: 버스 응답 null 이면 경로에서 지금 위치(`_pipHereIdx`) 이후 첫 지하철 노드(없으면 마지막으로 지난 것)를 `updateCong(...,true)` 로 보여 주고 meta 에 "버스 정보가 없어 경로의 지하철을 보여줘요". 경로에 지하철이 없으면 "정보 없음" 그대로. ③ `_congSyncRoute()` + 4초 폴링: GPS 가 없어도(시각표 추정 포함) `_pipHereIdx` 가 가리키는 '타고 있거나 곧 탈' 구간(`_congLegNode`: 버스·지하철 노드면 그것, 도보면 다음 탈것)으로 카드를 따라간다 → 버스→지하철, 지하철→지하철(노선·역 바뀜) 환승 모두 반영. 서명(`_congLegSig`)으로 같은 구간은 다시 부르지 않는다(GPS 경로와 공유). ④ 현재 막대 가운데: `ResizeObserver` 로 카드 폭이 바뀔 때도 다시 맞춘다. 실기기에서 21:26 버전이 가운데로 안 왔던 원인은 화면(빈 그래프)만으로 알 수 없었다 — 폭 변화·탭이 숨어 있다 보일 때를 보강했을 뿐 **실기기 미검증**. 시험 `cong_card.ui.test.js` 11개.
- **(22:32~23:05 추가, YJ: ① 러블(러시안블루) 고양이 다듬기 ② 경로 없을 때 혼잡도 파란 창에 시간대·날씨별 3D 캐릭터 놀이 장면 ③ 버스 구간 대기·탑승·하차 장면 ④ 버스 탑승 시 "지하철 탑승시 혼잡도가 나와요!" ⑤(23:05) 혼잡도와 장면은 함께 보이지 않는다 — 혼잡도는 지하철 탑승 확정 뒤에만)** — ★ "계산은 엔진, 앱은 그림만" 규칙(22:45 재강조)을 지켰다.
  · **엔진 `POST /scene` (s27, `engine/scene.js` = route-v2 워커에 그대로 내장, `test/scene.test.js` 가 동일성 검사)**: 앱이 보낸 근거(노드·here·boarded·key·GPS·시각)로 엔진이 구간(`sceneLegNode`)·단계(wait/ride/alight)·장소(bus/sub/street)·시간대(새벽4–6·아침7–10·점심11–13·오후14–17·저녁18–20·밤21–3, KST)·날씨(`WSAY_WX_URL` 을 엔진이 직접 가져옴, 10분 캐시·2.5초 제한 / 못 받으면 날씨 문구 없음)·대표 캐릭터·등장 무리·문구·안내문·혼잡도 여부(`cong`)를 정한다. 지하철을 탄 것이 확정(타는 중)일 때만 `mode:null`+`cong`(앱이 기존 `updateCong` 호출), 그 밖은 전부 장면. 버스 구간은 혼잡도 없음(21:26의 '버스 그래프 키우기'·22:12의 '버스 정보 없으면 지하철 혼잡도' 동작은 이 규칙으로 대체됨).
  · **앱 `_CS`(www/index.html)**: 엔진 응답을 그리기만 한다 — 캔버스 2D 의사 3D(깊이 줄·배경 레이어 캐시·구름·비·눈·안개·별·새·차량·정류장/지하철 입구 소품), 캐릭터는 미리 렌더한 스프라이트 시트. 장면이 켜지면 `#congCard.cs-on` 으로 게이지·그래프·상태·칸별·배지를 전부 숨김. `_scenePayload`/`_sceneRequest`/`_sceneApply` 가 배관. 앱에는 구간·날씨·시간대 판정 코드가 없다(시험이 확인).
  · **고양이(러블)**: 모델 재작업(귀·통통한 다리·꼬리), 시트 `www/chars3d/lovel.webp` 교체, `models.js`·`OverlayPlugin.java` 의 기준 크기(base 250, ox 117.9) 갱신.
  · **시험**: `scene_engine.test.js`(11), `cong_scene.ui.test.js`(11, CI 목록에 추가), `cong_card.ui.test.js`(11, 23:05 규칙으로 개정), route-v2 `scene.test.js`·`widget_say.test.js`(s27). 회귀(loading_chars·latent_refs·share_loc·day_preset_shop_wx·station_timetable·timetable_theme_swipe_play) 통과. tabs_smoke 는 돌릴 때마다 다른 1건이 시간초과로 흔들림(기준선에선 통과 · 이전부터 알려진 불안정).
  · **한계(정직)**: 실기기에서 확인하지 못했다(그림·움직임·성능). 네이티브 자바는 로컬에서 스텁 컴파일만, 실제 컴파일은 CI. **엔진 s27 을 YJ 가 Cloudflare 에 붙여 넣어야 한다**(`route-v2-worker.ascii.js`) — 안 붙이면 `/scene` 응답이 없어 장면이 안 바뀌고 마지막 상태가 남는다. 이전부터 앱에 있던 일부 계산(혼잡도 노드 고르기 `_cgBest`/`_pf`, 쇼핑 추천·장갑 제외·요일 프리셋)은 이번에도 엔진으로 옮기지 못했다.
- **(06:00 추가, YJ 스크린샷: ① 경로 없을 땐 장면을 세로로 키워 홈 화면을 꽉 채우기 ② 버스 장면일 때 '혼잡도 분석' 제목줄(체크한 자리)에 "지하철을 타면 혼잡도가 나와요")** — 엔진 **s28**(`route-v2-2026-10-16s28`): 안내 문구 `SCENE_HINT_BUS` 를 "지하철을 타면 혼잡도가 나와요" 로 바꿨다(문구는 엔진이 정한다 → **엔진 s28 을 다시 붙여 넣어야 문구가 바뀐다**; 안 붙이면 s27 문구 "지하철 탑승시 혼잡도가 나와요!"가 제목줄에 나온다).
  · 앱: `#congBusHint` 를 카드 밑에서 '혼잡도 분석' 제목줄(배지와 [위치 공유] 사이)로 옮김(한 줄·말줄임). `_sceneFit()` — 엔진이 idle 이라고 한 동안 `#congScene` 높이를 `#tabContentWrap` 남는 세로(하단 탭 바로 위)까지 늘린다(배치 계산뿐, 장면 종류는 엔진이 정함; `resize`·1초 점검·장면 적용 때 다시 맞춤). 버스·지하철 장면은 150px 그대로. `_CS.boot` 에 배율 k(세로로 큰 장면은 같은 그림을 최대 2배로 키워 하늘·건물·캐릭터가 함께 커짐; 폭 200 이상 유지)와 `geom` 의 tall 변형(인도를 넓혀 돌아다닐 자리)을 추가.
  · 시험: `cong_scene.ui.test.js`(꽉 채움·제목줄 문구·버스 150px), `scene_engine`·route-v2 `scene`/`widget_say`/`tab_modes`(s28) 통과. 로컬에서 `timetable_theme_swipe_play` 는 시간 초과(이전부터 로컬에서 느림, CI 에서 확인).
  · 한계: 실기기 미확인(큰 화면에서 캐릭터 크기·성능). 홈 화면 아래의 AI 승무원·실시간 대화는 장면 아래로 내려가 스크롤해야 보인다.
- **(07:43 추가, YJ 스크린샷: 장면이 너무 커서 스크롤해야 함 → ① 경로 없는 대기 땐 홈 화면 전체(검색·혼잡도·AI 승무원·실시간 대화)가 스크롤 없이 폰 화면 크기에 딱 맞게 ② 경로 결과가 나오기 시작하면(확정 전이라도) 기존 크기로 부드럽게 복귀)** — 06:00 의 '남는 세로 전부 채우기'(장면이 화면보다 커짐)를 고쳤다. 엔진 **s29**(`route-v2-2026-10-16s29`): `/scene` 이 `fill`(경로·경로 결과 둘 다 없을 때만 true)을 정해 준다 — 앱은 근거 `routeShown`(경로 결과 카드가 보이는가)만 보낸다.
  · 앱 `_sceneFit()`: 엔진이 fill:true 인 동안 `#tab-home` 내용 아래에 남는(모자란) 세로를 재서 장면 칸 높이를 그만큼 늘리거나 줄인다(최소 90px). 그래도 모자란 작은 폰은 실시간 대화의 오래된 줄부터 접는다(`#tab-home[data-hf]`, 최소 2줄 남김). fill:false 가 되면 높이를 비워 150px 로 돌아가며(CSS height 전환 .5s, 캔버스는 `object-fit:cover` 로 늘어나지 않게, 전환이 끝나면 `_CS.refit()` 으로 다시 그림). `_CS.boot` 배율 k: 150px 보다 낮으면 같은 그림을 줄여 그림(최소 .55), 크면 키움(최대 2). 장면이 보일 땐 카드 안쪽 여백도 줄였다. 경로 결과 카드(`transitResultCard`/`Box`)의 style 변화를 MutationObserver 가 보고 곧바로 엔진에 다시 묻는다.
  · 확인한 화면(헤드리스, 같은 내용 기준): 412×915 → 장면 약 131px 로 한 화면에 딱 맞음, 390×844 → 약 110px + 대화 3줄, 430×932 → 약 127px. **360×740 같은 작은 폰은 장면 90px·대화 2줄로도 100px 쯤 모자라 스크롤이 조금 남는다**(숨길 수 있는 건 장면·대화 줄뿐). AI 승무원 글 길이에 따라 높이가 달라지므로 1초마다 다시 맞춘다.
  · 시험: `cong_scene.ui.test.js` 12건(한 화면에 맞음·경로 결과 시 150px 복귀·닫으면 다시 맞춤·fill 은 엔진값), `scene_engine` 12건(fill), route-v2 `scene`/`widget_say`/`tab_modes`(s29). **엔진 s29 를 붙여 넣어야** 한다(안 붙이면 `fill` 이 없어 장면이 기본 150px 로만 보인다).
- **(09:21 추가, YJ 스크린샷: ① 경로 확정 전에도 제목줄에 안내 문구 통일 ② '혼잡도 분석' → '혼잡도' ③ 애니메이션 캐릭터를 꾹 눌러 잡아 원하는 곳에 두기)** — 엔진 **s30**(`route-v2-2026-10-16s30`): 안내 문구를 "지하철을 타면 혼잡도가 표시돼요" 로 바꾸고, 경로 없음(idle)·경로 결과만 나온 때·대기·버스·내림 모두 같은 문구를 준다(`hint`; 지하철 탑승 확정으로 혼잡도가 보일 땐 null). **엔진 s30 을 붙여 넣어야 문구가 바뀐다**(안 붙이면 s29 문구 "…나와요").
  · 앱: 제목줄 '혼잡도'. `_CS` 에 '잡아서 옮기기' 추가 — 캐릭터를 꾹(.38초) 누르면 손에 들려(진동 14ms, 먼지, 1.12배, 손가락이 앞서면 몸이 뒤로 흔들림, 손가락 위로 26px 떠서 가리지 않음) 손가락을 따라다니고, 놓으면 떨어져 한 번 튕긴 뒤 그 자리에 서서 6~9초 머문 뒤 다시 돌아다닌다(하늘에서 놓으면 도로 건너편 끝에 내려앉음). 길게 누르기 전에 손가락이 10px 넘게 움직이면 잡지 않고 평소처럼 화면이 스크롤된다(`touch-action:pan-y`, 잡은 뒤에는 touchmove preventDefault 로 화면 스크롤 막음). 버스 안(ride)에서는 잡히지 않는다. 대기 장면의 대표 캐릭터는 놓은 자리에 머문다(`pinned` — 정류장으로 되돌아가지 않음), 하차 장면의 걷던 길은 놓은 자리에서 이어서. 잡는 동안 프레임 상한 30→~60fps. 판단·계산 없음(손가락 위치→그림 자리 변환과 떨어지는 모양뿐).
  · **네이티브는 쓰지 않았다**: 장면 전체(배경·날씨·스프라이트)가 WebView 캔버스라 드래그만 네이티브로 옮길 수 없고, 장면 전체를 자바로 다시 만드는 건 실기기 확인 없이는 위험이 크다. 대신 잡는 동안 60fps 로 올리고 부드럽게 따라오게 보간했다. 실기기에서 끊기면 그때 네이티브(SurfaceView) 이전을 검토.
  · 시험: `cong_scene.ui.test.js` 15건(꾹 눌러 잡기·따라오기·놓은 자리 머물기·하늘에서 떨어짐·움직이면 안 잡힘·ride 불가·대기 대표 캐릭터), CDP 실제 터치 이벤트로도 확인(잡은 동안 스크롤 147→147 변화 없음, 빠른 스와이프는 147→42 스크롤·잡힘 없음). scene_engine 12건, route-v2 s30 통과.
- **(10:18~10:23 추가, YJ: ① 캐릭터가 손가락을 안 따라다님 ② 버스 대기 때 독수리만 나옴)** — ① 실기기 원인은 확인하지 못했다(헤드리스에서는 따라옴). 안드로이드 WebView 에서 길게 누른 직후 `pointercancel`/`lostpointercapture` 가 와서 '놓은 것'으로 처리되던 것으로 의심 → 터치는 `touchend`/`touchcancel` 로만 놓고, 손가락 위치는 `touchmove` 로도 받는다. 캐릭터 몸 위에만 투명 판(`.cs-pad`, `touch-action:none`)을 깔아 거기서 시작한 손가락은 브라우저가 스크롤로 가져가지 않게 했다(대신 캐릭터 몸 위에서 시작한 쓸기는 스크롤되지 않음). 시험: 가짜 pointercancel 을 보내도 안 놓고 따라옴. ② 엔진 **s31**: 대표 캐릭터(`hero`)·등장 순서를 경로 확정 키 + 탈것 구간(leg)마다 새로 뽑는다(같은 경로라도 구간이 바뀌면 다른 캐릭터, 360번 시험에서 6종이 골고루·구간별로 다름). 독수리가 계속 나온 정확한 원인은 못 찾았다 — 해시 분포는 고르다. 가능성: 같은 경로를 같은 키로 다시 보는 경우. **엔진 s31 을 붙여 넣어야** 한다.
- **(10:39 YJ: "모든 계산은 엔진이, 앱은 그림만 그린다 원칙 지켜야 해" — 점검 결과)** 앱 안에 엔진이 정하지 않은 결정 두 곳이 남아 있어 제거했다: ① 엔진이 `hero` 를 안 줬을 때 앱이 `'lovel'` 로 대신 정하던 것 → 안 주면 주인공 장면 대신 배경만 그린다(idle 로 그림), ② 엔진이 `cast` 를 안 줬을 때 앱의 `_RC.order` 로 등장 순서를 대신 정하던 것 → 안 나온다. 정적 검사(`앱에는 …판정 코드가 없다`)에 이 둘이 다시 생기지 않게 추가. 남은 것은 그림 연출뿐(걸음 걸이·동동·하품 같은 장식 동작, 손가락 좌표→그림 좌표 변환, 놓은 자리에 내려앉는 모양). 장면 종류·캐릭터·순서·키울지·안내문은 전부 엔진 값.
- **(12:00~12:30 YJ: 놓으면 바로 움직이기 · 캐릭터별 동작 다양화(TXT) · 캐릭터별 착지 연출)** 엔진 **s32**: `/scene` 응답에 `traits:{id:{land, acts[]}}` 추가(`engine/scene.js` `SCENE_LAND`·`SCENE_ACTS`·`sceneTraits`). 동작 대본은 전용 동작을 시드로 섞고 사이에 기본 동작(걷기·콩콩·돌기·쉬기)을 끼운 것, 낙엽 다이빙(dive)은 가을·눈 올 때만. **앱은 이름대로 그리기만 한다**: `ACT` 표(몸 기울이기·늘이기·소품·반짝이·땅 위 그림), `nextName` 이 엔진 `acts` 를 차례로 꺼낸다(앱의 가중치 랜덤 삭제). 착지(`land`): dolsom=cotton(몸이 부풀었다 복구 + 하트) · ppopu=pose(두 발 착지 + 포즈 + 씨익 스티커) · dudung=dig(땅속 2초 → 나와서 화냄) · lovel=flip(앞 한 바퀴) · sul=fly(날개 펴고 다른 곳에 착지) · chaeng=puddle(웅덩이 + 첨벙). 놓자마자 바로 다음 동작(엔진 대본)을 한다(예전엔 6~9초 쉬었음). **원칙 주의(YJ)**: 하얀강아지 '솜사탕'은 별도 그림을 덧붙이지 않고 캐릭터 몸 자체가 자연스럽게 커졌다 복구되게 했다(정체성 보호). 소품(선글라스·쌍안경·개껌·돋보기·깃발·상자·거울 …)은 TXT 대로 덧그린다. 캐릭터 그림은 미리 렌더링한 걷기 16장뿐이라 새 동작은 기울이기·늘이기·돌리기(옆면 뒤집기)로 흉내낸다 — 팔·표정이 바뀌는 진짜 동작은 아님. 실기기 미확인. 네이티브 미채택(이유는 보고). 테스트: `cong_scene.ui.test.js` 18개(6종 모든 동작·착지가 오류 없이 돈다), `scene_engine.test.js` 14개. 임시 훅 `_CS._play/_drop`(시험 전용).

## 2026-10-16 캐릭터 장면 네이티브화 (YJ: "우리 앱 자체를 네이티브로 — 백엔드 엔진(/scene)과 캐릭터/놀이터 비즈니스 로직·데이터 구조는 그대로, 프론트엔드·렌더링을 Kotlin/Jetpack Compose Canvas + 햅틱으로 · 60~120fps · 6종 캐릭터 드래그/착륙 햅틱 · 360x740 반응형·스크롤 꼬임 해결")

**범위(내가 정한 해석)**: 혼잡도 카드 위 '캐릭터 장면'(렌더링·터치·진동)만 네이티브로 옮겼다. 앱 전체(검색·경로·설정 등)는 여전히 WebView(HTML) 화면이다 — 한 번에 앱 전체를 Kotlin 으로 다시 짜는 건 엔진/로직을 그대로 두는 조건과 검증 가능성 모두에서 현실적이지 않아서 장면부터 했다. **엔진(`/scene`, `engine/scene.js`)과 웹 `_CS` 로직은 한 줄도 바꾸지 않았다**(웹 `_CS` 는 플러그인이 없거나 실패하면 그대로 자동 대체 화면).

### 구조 (계산은 엔진, 그림은 네이티브)
- 엔진 `/scene` 답 JSON → 앱(JS `_CS.apply`)이 **한 글자도 안 고치고** `SceneNative.apply({res})` 로 전달 → `SceneDriver` → `SceneCore`(**순수 자바**, android.* 없음; 움직임·그림·터치·진동 이름 결정) → `SceneCv` 인터페이스 → `AndroidCv` → Compose `Canvas` 의 `nativeCanvas`(GPU).
- 파일(`native/`): `SceneCore/Acts/Art/Model/Util/Cv/Haptics.java`(순수 자바 코어, 웹 `_CS` 이식), `AndroidCv.java`, `SceneDriver.java`, `SceneHost.java`(터치 투명), `SceneNativePlugin.java`(Capacitor 플러그인 "SceneNative"), `SceneCompose.kt`(ComposeView + `withFrameNanos` 프레임 시계), `inject_kotlin_compose.py`(CI 가 `cap add android` 뒤 Gradle 에 Kotlin 1.9.22·Compose 컴파일러 1.5.8·BOM 2024.02.00 주입).
- 프레임: 평소 60Hz(배터리), 만지거나 잡거나 놓은 뒤 3.2초(착륙 연출)는 화면 주사율 그대로(최대 120Hz, `preferredRefreshRate` 힌트).
- 진동(`SceneHaptics`): grab·release·flap·land(_cotton/pose/dig/flip/fly/puddle)·angry·hearts·grin·thud·splash → `VibrationEffect.createWaveform`. 설정 카드에서 끌 수 있고 플러그인 `setHaptics` 로 전달.
- **스크롤 꼬임 해결**: `MainActivity.dispatchTouchEvent` → `SceneNativePlugin.route(ev)`. 캐릭터 위 DOWN 은 코어가 '대기'로 받고(꾹 0.38초, 10dp 이내) 웹뷰에도 동시에 전달. 10dp 넘게 움직이면 웹뷰 스크롤(코어는 포기), 꾹 눌러 잡히면 웹뷰에 CANCEL 을 직접 보내고 이후 MOVE/UP 은 장면이 삼킴 → 스크롤과 드래그가 섞이지 않는다.
- **스크롤·팝업과의 동기화**: 오버레이는 웹 스크롤을 지연 없이 못 따라가므로 JS 가 칸이 움직이거나(스크롤)·덮이거나(`elementFromPoint` 격자)·다른 탭이면 네이티브를 `hide` 하고 같은 그림의 WebP 정지 사진(`snapshot`)을 호스트 배경으로 깔았다가, 4프레임 정지 후 다시 `show`. 스크롤 영역 밖으로 나간 부분은 `clip` 으로 자른다. 위/아래에 붙은 넓은 막대는 그만큼만 비켜 준다.
- **안전장치**: 플러그인 오류 이벤트·`show` 거절·8초 안에 첫 그림(ready) 없음 → 즉시 웹 캔버스 장면으로 복귀(같은 엔진 답), 실패 횟수 `gdm_sn_fail` 저장(연속 2회면 다음 실행부터 안 씀), 설정 카드(`#snSetCard`) 스위치(`gdm_sn_off`)로 끄기/켜기.

### CI(`.github/workflows/build-apk.yml`)
네이티브 파일 복사·플러그인 등록·`MainActivity` 터치 전달 수정·`inject_kotlin_compose.py` 실행이 추가됐고, 시험 매트릭스에 `scene_native_java.test.js`·`scene_native_js.ui.test.js` 가 들어갔다. **Gradle/Compose 실제 빌드는 CI 에서만 확인된다**(로컬은 npm/maven 접근 불가). 빌드가 깨지면 workflow_dispatch 의 `skip_tests` 로 Gradle 쪽만 반복하며 고친다.

### 시험(로컬 통과)
- `test/java/SceneJvmTest.java` + `scene_native_java.test.js`(14, 진짜 android.jar API33 로 안드로이드 계층 컴파일·kotlinc 로 Kotlin 컴파일·Gradle 주입·CI 템플릿): 웹↔자바 **같은 시드 난수로 초 단위 상태·픽셀 비교**(장면 14종 + 6종 착지)가 일치.
- `scene_native_js.ui.test.js`(14, 가짜 SceneNative): 엔진 답 무가공 전달·사각형/clip/dpr/dark·스크롤/팝업/막대/탭 전환 숨김·복귀·stop·오류/거절/8초 지연 폴백·실패 카운터·설정 스위치·플러그인 없는 웹 무변화.
- 기존 `cong_scene`·`scene_engine`·`cong_card`·`metro_native_js` 등 회귀 통과.

### 한계(정직)
- **실기기 미검증**: 햅틱 세기/타이밍, 120Hz, 주사율 힌트, 터치 분배, 스크롤 시 사진 교체 체감은 CI 빌드 APK 로 YJ 가 확인해야 한다. Compose 컴파일도 CI 에서 처음 검증된다.
- 스크롤을 시작하면 2~4프레임 지연 뒤 정지 사진으로 바뀌고, 스크롤 중엔 캐릭터가 멈춰 보인다(멈추면 이어서 움직임).
- 앱의 나머지 화면은 아직 WebView. 장면 코드는 웹 `_CS`(JS)와 네이티브 코어(Java) 두 벌 — 장면 규칙을 바꿀 땐 둘 다 맞춰야 한다(패리티 시험이 어긋남을 잡는다).
- **웹 `_CS` 버그 발견**: `dance` 동작이 음표를 영영 안 낸다(`a.act.n` 과 `S.every(A,'n',…)` 키 충돌). 패리티를 위해 자바에 `WEB_DANCE_NOTE_BUG=true` 로 똑같이 재현. 고치려면 웹·자바 양쪽 키 이름을 바꾸고 이 상수를 false 로.
- 끄는 법: 설정 → 네이티브 장면 스위치(`gdm_sn_off`=1). 문제가 계속 나면 자동으로도 꺼진다.

## 2026-10-16(2) 키보드가 올라와도 화면을 줄이지 않기 (YJ 스크린샷: "키보드 올라올 때 화면축소 시키지 마, 키보드만 올라오는 거야")
- 원인: Capacitor 기본 매니페스트 `windowSoftInputMode="adjustResize"` — 키보드가 뜨면 웹뷰 높이를 줄여 홈 화면이 찌그러지고 하단 탭이 키보드 위로 올라붙었다.
- 수정: CI 의 매니페스트 패치(파이썬)가 `adjustPan` 으로 바꾼다(속성이 없으면 MainActivity 에 추가). 웹뷰 크기는 그대로, 키보드가 위에 덮이고, 입력칸이 가려질 때만 창을 밀어 올린다. 웹 쪽 `initKeyboardGuard`(visualViewport 로 하단 탭 올리기)는 높이가 안 변하므로 자연히 작동하지 않는다(그대로 둠).
- 시험: `test/keyboard_pan.test.js`(CI 의 패치 코드를 꺼내 가짜 매니페스트에 실행: adjustResize→adjustPan, 속성 없음→추가, 기존 폴드 패치 유지, 다른 곳에서 되돌리지 않음).
- 한계: APK 를 다시 빌드해야 적용된다. 실기기 확인 못 함 — 하단 근처 입력칸(채팅 등)에서 키보드에 가려지지 않고 창이 밀려 올라오는지, 밀려 올라온 뒤 키보드를 닫으면 제자리로 오는지 YJ 가 확인해야 한다. 문제가 있으면 알려 주면 `adjustNothing`+웹에서 직접 스크롤로 바꿀 수 있다.

## 2026-10-16(3) 스크롤 흔들면 장면이 멈춤 대책 + TV 전원 전환 (YJ: "스크롤을 위아래로 흔들면 애니메이션이 먹통" · "경로 탐색·취소·애니메이션이 바뀌면 TV 처럼 꺼졌다 켜지게, 네이티브로")
- **먹통**: 실기기 원인은 특정하지 못했다(로컬에서 숨김/표시 상태 기계는 브리지 지연 5~120ms 로 4초 흔들어도 정상 복귀). 그래서 원인과 무관하게 막는다 — ① 네이티브: 숨길 때마다 Compose 를 부수고 다시 만들던 것을 없앴다(`SceneDriver.setPaused` 로 쉬기만, 3초 넘게 숨어 있을 때만 `lateDispose` 가 거둔다. 프레임 시계가 1.5초 넘게 안 불렸으면 `show` 가 새로 만든다). `status` 가 `age`(프레임 시계 나이)·`visible`·`running` 을 알려 준다. ② JS `natHealth`: 보이는 동안 2초마다 `status` 를 보고 어긋남/멈춤/시계 죽음이면 다시 켜고, 3번 연속이면 웹 캔버스로 복귀(`gdm_sn_why` = "멈춤 3번 …" — 설정 카드에 이유가 나온다). ③ 응답이 2.5초 넘게 안 오는 호출(`busy`/`snapBusy`)은 놓아준다. 시험: `scene_native_js.ui.test.js` 19건(고착·어긋남·멈춤·시계 죽음·정상 시 무동작). **다시 멈추면 설정 카드의 문구(문제가 있어…(이유))를 알려 줄 것.**
- **TV 전원 전환**(`SceneCore.tvDraw` = 네이티브, 웹 `_CS.tvDraw` = 예비 화면, 같은 수식): 장면 종류(mode)가 바뀔 때만(엔진이 정한다) — 꺼짐 0.30초(옛 장면이 납작한 선 → 점) · 암전 0.08초 · 켜짐 0.42초(점 → 가로선 → 위아래로 열리며 새 장면이 번쩍). 같은 장면 재적용·크기 변경·장면 없음(stop)은 전환 없음, 전환 중엔 캐릭터를 못 집고 주사율을 끝까지 쓴다(`interactive()`), 움직임 줄이기면 생략. 시험: JVM 7번 항목 · `cong_scene` 19번째(시계 단계) · `java SceneJvmTest tvframes …`(눈으로 보는 프레임 덤프). 실기기 미확인.

## 2026-10-16(4) 도착시각 엔진 응답 굳음 · 진행도 역행/건너뜀 · 영점 뒤 10초 정차 (YJ 로그 + "도착하면 마커가 바로 다음역으로 넘어간다", 엔진 s33)
- **로그 분석**: ① 가려진 동안(`H`) `도착시각 … 엔진 요청이 15초째 응답 없음 — 끊고 다시 보냄` 이 15초마다 37번 → 화면 시각이 시각표 그대로 굳음(동막 화면 18:02, 실제 18:00:55). 원인: 가려진 웹뷰는 15초에 한 번만 깨어나는데(`틱간격 15초`), 응답은 그 사이 이미 와 있는데 깨어나자마자 '오래 걸린 요청 끊기'가 먼저 돌아 막 도착한 답을 seq 불일치로 버렸다. 네이티브 장면 전환과 무관(10-14 로그에서 이미 같은 증상, 장면은 그림만 그린다). ② 동막 도착 → 진행도 4 → PF채택 `앞 2→3`(PF 가 5~70초 늦게 따라오는 것)이 `_pfAdopt` 의 `td<gm` 분기로 진행도를 3 으로 되돌리고 동막 통과 기록(GPS 시각)을 지워 18:00:55(PF 시각)로 다시 찍힘 → 곧 다시 4 → 동춘에서 5 로 보여 '건너뜀'처럼 보임.
- **수정(앱)**: `_etaRequest` — 가려진 동안은 60초까지 끊지 않고 기다림, 중단 타이머도 가려졌으면 안 끊음, 늦게 온 답도 더 새로 그려진 답(`appliedSeq`)이 없으면 그림. `_pfAdopt` — PF 의 '앞으로' 채택이 진행도보다 뒤 역이면 PF 상태만 따라잡고 진행도·통과 기록은 그대로, '뒤로' 채택도 GPS 영점(src gps)으로 2분 안에 확정한 역은 안 낮춤(순서: 시각표 1순위 · GPS 영점 2순위 · PF 3순위). `마커` 진단 줄에 `시각표기준=0` 이유 추가(`승차미확정`·`엔진버스아님판정` 등) — 로그에서 계속 0 이었던 원인은 아직 모른다(다음 로그 확인).
- **영점 뒤 정차(엔진 s33)**: `ride-eta` 가 `hold:{idx,src,atMs,untilMs}` 를 준다 — 가장 앞선 통과(gps·pf·move) 역에서 통과 시각(영점은 실제 통과 시각) + `markerDwellSec`(10초) 동안. 승차 확정·기지국 선행·목적지는 제외. `stopDwellSec` 25→10(시각표 기준 pos 의 정차도 10초). 앱은 `_etaHold` 를 받아 `_ovlMoving()` 이 그 역이 현위치인 동안 정지(노란색)로 그린다(계산 없음, 폰 시계 `Date.now()` 기준 절대 시각). 영점마다 5초 당김은 기존 `arriveEarlySec 5`(영점 뒤 중간역) 그대로.
- **시험**: `ride_eta` +2건(83), `bg_fix_time.ui` +5건(8). **배포 필요**: `route-v2-worker.ascii.js`(엔진 `route-v2-2026-10-16s33`) 를 Cloudflare 에 붙여 넣어야 정차(hold)가 적용된다(앱만 먼저 나가도 안전 — hold 가 없으면 예전대로). **한계**: 실기기 미확인. 앱을 가린 채 15초 주기 깨어남에서 답이 늦게 그려지므로 가린 동안 화면 시각은 최대 15초 늦다. 지하에서 GPS 정확도 60m 초과면 영점 없음(시각표 기준).

## 2026-10-16(5) 시각표 1순위 · 정차 10초 · 탑승/환승/도착 버튼 행 (YJ: "시간표는 부동의 1순위, GPS·PF는 값이 오면 오차만 조절" · "탑승 버튼 애니메이션")
- **원칙(YJ)**: 지하철을 타고 있으면(`_ttFirstOn`) 마커는 엔진 `/ride-eta` 의 `pos`(구간표 `segs`)대로만 움직인다. 역 도착 판정(시각표상 도착) 순간 **10초 정차(노란색)** → 다음 구간 이동은 엔진이 정한다. GPS 영점·PF 채택은 늦거나 없어도 마커를 멈추거나 움직이지 않고, **값이 도착했을 때만** 진행도(`_gpsMaxIdx`)·오차를 고친다. 엔진 답이 늦으면(숨김 15초 깨움) 받아 둔 구간표로 이어 그린다. 영점 뒤 정차(`hold`)는 시각표 기준이 아닐 때만 쓴다.
- **`_trkSubConfirmed` 완화**: 예전엔 `_htlBoarded`(명시 확정)까지 요구해 자동 감지로 탄 여정은 로그 두 번 모두 `시각표기준=0`(원인 가설, 실기기 미확인 — `마커` 진단줄에 꺼진 이유가 찍힌다). 이제 `_routeLocked` + 진행역이 지하철 + 출발 전 아님이면 탄 것으로 본다. **단 지하철 앞에 버스 구간이 있으면** 엔진 판정 confirmed/plausible 을 한 번이라도 받아야 한다(승용차 규칙 유지, `ride_car_not_bus` 가 잡았다).
- **PF 보류**: PF '앞'이 확정 진행도보다 뒤거나 PF '뒤'가 GPS 영점(120초 이내)과 어긋나면 진행도는 안 건드린다(`PF보류` 진단). 도착시각 엔진 응답이 늦게 와도 버리지 않는다(`_etaRequest`).
- **탑승/환승/도착 버튼 행**(`#routeActRow`): 경로 확정 후 [세부경로][확정됨] 줄어들며 [탑승]이 오른쪽에서 밀고 들어옴(셋 같은 너비) → 환승이 있으면 [환승]이 위에서 내려오며 [탑승]을 아래로 → 마지막 탑승 확정 뒤 [도착]이 아래에서 올라오며 [환승]을 위로. **무엇을 보일지·언제는 엔진**(`/ride-eta op:'row'`, s34), 앱은 받은 대로 그린다. **애니메이션은 네이티브**(`RowCore`/`RowOverlayView`/`RowNativePlugin`, 웹 버튼은 항상 최종 모양, 네이티브가 0.4초 위에 떠서 전환을 그림; 플러그인이 없으면 같은 수식 `_rowFrame` 웹 폴백). 엔진이 `op:'row'` 를 모르면 행은 숨는다.
- **시험**: `ride_eta` 85, `bg_fix_time.ui` 10, `route_row.ui` 11, `row_native` 5, `RowJvmTest` 26. **배포 필요**: 엔진 `route-v2-worker.ascii.js`(`route-v2-2026-10-16s34`) 를 Cloudflare 에 붙여 넣어야 정차(hold)·행(row)이 적용된다.
- **한계**: 실기기 미검증(애니메이션 체감·네이티브 오버레이 위치). 네이티브 자바는 android.jar+스텁으로만 컴파일했고 Gradle/Compose 는 CI 에서 처음 검증된다.

## 2026-10-16(6) 오버레이 추천: 접힘에서도 펼침 · 5분 전 · 2정거장 무지개 · 광고 버튼 셋 (YJ 스크린샷)
- **접힌 알약에서도 추천이 보인다**: 알약(접힘) 중에 새 추천(`reco.at`)이 오면 알약이 저절로 펼쳐져 추천 줄을 보여 준다(경고 펼침과 같은 방식: 맨 위로 이동, 끝나면 원래 자리의 알약으로). 사용자가 그 추천으로 다시 접으면 같은 추천으로는 다시 펼치지 않는다(`dismissedRecoAt`). 설정의 추천 테스트 버튼(90초 미리보기)도 같다.
- **도착 5분 전**: `_ARR_PRE_MIN` 10 → 5 (알림이 나가는 때). 오버레이 추천 줄도 같은 값(예전엔 3분 전 고정이라 알림보다 2분 늦게 뜸 → 알림과 같이 뜬다). 문구·설정 설명도 5분으로.
- **2정거장 전 / 1정거장 전**: 접힌 알약은 2정거장 전(`alert 2`)에 **알약 둘레에 무지개 테두리**(6초에 한 바퀴)만 돌고 펼치지 않는다. 1정거장 전(`alert 1`, 환승 1정거장 전 포함)에 **펼친다**(진동은 기존대로). 테두리는 알약 모양(반지름 15dp) 그대로 둘러싼다.
- **광고 버튼 [맛집 보기] [주변버스 보기] [종료]**: 오버레이 추천 줄과 앱 안 도착 팝업이 같은 셋. [맛집 보기]는 쿠팡 슬롯이면 [쿠팡 보기], 야식이면 [주문하기]로 이름만 바뀐다(예전 규칙 유지). [주변버스 보기] = 노선도 탭 > 버스 > 주변 정류장(앱을 앞으로 가져온다), [종료] = 이 추천 끄기(예전 [확인]). **버튼 자리**: 글 아래 줄로 내리지 않고 오른쪽 블록(1행 [맛집 보기][종료], 2행 [주변버스 보기])에 모아 줄 높이를 줄였다(≈99dp → 글 높이에 맞춰 약 68dp).
- **시험**: `overlay_reco.ui`(53, 5분 전 창·버튼 이름·recoBus·팝업 버튼), 새 `overlay_pill_native`(8, 네이티브 규칙 소스 확인), `loading_chars.ui`(버튼 블록), `scene_native_java`(RowNativePlugin 스텁 누락 수정). CI 매트릭스에 `overlay_pill_native`·`overlay_reco.ui` 추가.
- **한계**: 실기기 미검증(알약 무지개·버튼 블록 위치·펼침 타이밍). `OverlayPlugin.java` 는 android.jar 로 문법·타입만 확인(Capacitor 스텁 한계로 전체 링크는 CI). 앱 안 팝업의 야식/쿠팡 아래 줄은 그대로 둠. (정정 2026-10-16 19:59 YJ: "종료는 앱 종료로 정확히, 도착 거의 전이니 앱 종료해도 상관없다") **[종료] = 앱 완전 종료**: 네이티브 `quitApp` — 웹에 `recoEnd`(추천 닫기 + `_exitConfirm`) 통보 → 0.35초 뒤 대기 서비스 중지·화면 켜 둠 해제·오버레이 내림·알림 모두 지움·`finishAndRemoveTask`. **프로세스는 죽이지 않는다**(YJ 20:17: "앱 종료 전 시계 위젯은 살려둬야 동물들이 돌아다니지" — 위젯 동물은 앱과 같은 프로세스의 핸들러로 돈다, `WidgetCore`). 그래서 웹이 `closeTransitResult`(백그라운드 GPS·알림·타이머 정리)를 하고 `WidgetCore.onAppLeft` 로 위젯을 바로 깨운다. 앱 안 도착 팝업의 [종료]도 `_exitConfirm`. 미리보기(시연) 중에는 시연만 닫는다. 한계: 종료 뒤 도착 기록·마지막 위치 저장은 하지 않는다. 프로세스가 남아도 안드로이드가 메모리 때문에 나중에 정리할 수 있다(그땐 위젯이 알람으로 다시 깨운다).

## 2026-10-16(7) 설정 > 🧪 오버레이 테스트 버튼 (YJ: "설정에 테스트 버튼 넣어줘. 출시 전에 없앨 거야")
- 목적: 이번에 만든 네이티브 오버레이 동작(접힘에서 추천 펼침 · 2정거장 전 알약 무지개 · 1정거장 전 펼침 · 버튼 3개 · [종료]=앱 종료 + 시계 위젯 유지)을 **실제 여정 없이** 실기기로 확인한다.
- 방식(JS만, 네이티브 변경 없음): 설정 카드(`#ovlTestCard`)의 버튼이 가짜 여정(임학→박촌→굴현→계양→아라)을 `Overlay.update` 로 직접 보낸다. `_ovlSync` 맨 앞의 `_ovlTest` 줄이 진짜 값 대신 이 값을 보내고, 시험 중엔 `keepAlive` 를 켜 앱이 가려져도 네이티브가 웹을 깨운다. 버튼: ▶전체 시나리오(75초: 0~15 평상시 → 추천 → 2정거장 전 → 1정거장 전 → 마무리) · 평상시 · 추천 · 2정거장 전 · 1정거장 전 · ■중지. 쓰는 법: '다른 앱 위에 표시'를 켜고 → 버튼 → 홈으로 나가기 → (알약으로 접으려면 오버레이를 위로 쓸기).
- **출시 전 삭제**: `www/index.html` 에서 `TEST-BUTTONS:BEGIN` ~ `TEST-BUTTONS:END` 두 구간(설정 카드 HTML, JS 블록) + `_ovlSync`·`_ovlKeepAliveSync`·`_ovlNativeTick` 안의 `// TEST-BUTTONS (출시 전 삭제)` 한 줄씩 + `test/overlay_test_buttons.ui.test.js` + CI 매트릭스 한 줄.
- 시험: `overlay_test_buttons.ui` 12.
- 한계: 실제 여정·엔진 판단은 거치지 않는다(네이티브가 그리는 모습만 확인). [종료]는 진짜 앱 종료다.

## 2026-10-16(8) 도착 광고 문구 재설계 + 커뮤니티 제목 제거 + 맛집 헤더 정리 (YJ 스크린샷)
- 광고(`_arrAd`): 식당·카페 첫 줄 = "가게 이름 · 추천 메뉴", 둘째 줄 = 날씨·요일·월급날 문구(`_arrHook`) + 그 메뉴 권유 한 문장(카페는 아침 음료). 거리·종류·"걸어서 N분"(`m`)은 비운다. 쿠팡도 같은 느낌: 첫 줄 = 상품 이름, 둘째 줄 = 상황 감성 한 줄(`_arrShopLine`, 없으면 `_arrShopSay`), 분류·"쿠팡" 표기 삭제. 앱 JS만 변경(네이티브는 `m` 이 비면 그리지 않음 — 기존 동작).
- 커뮤니티 탭: 상단 "🔥 커뮤니티" 제목 줄 삭제 → 칩 줄이 그만큼 위로(하단 탭이 이름을 알려 준다).
- 맛집 탭: "내 주변 맛집" 글자 삭제, "📍 ○○역 인근"을 "도착역 맛집" 제목 옆으로. 도착역이 있을 때도 같은 자리에 "○○역 인근".
- 시험: `loading_chars.ui` 45 · `tabs_smoke.ui` 53 · overlay_reco/test_buttons/journey_alerts/journey_e2e 통과.
- 한계: 실제 가게·메뉴는 알림을 만든 `_arrBuildAlert` 가 고른 것을 그대로 쓰므로, 가게 목록이 비면 예전 문구 줄로 간다. 화면 배치는 실기기 확인 전(헤더 줄바꿈은 flex-wrap).

## 2026-10-17(9) 도착 전 순서 개편 — 기준 = 마지막 대중교통 하차 (YJ: "최종 목적지 도착이 아니라 경로의 마지막 대중교통을 내리는 순서 · 모든 계산은 엔진이, 앱은 그림만 · 네이티브도 변경", 엔진 s35)
- **기준**: 최종 목적지가 아니라 경로의 마지막 대중교통(버스·지하철) 하차 노드. 내린 뒤 10분을 더 걸어도 같다. 엔진 `/ride-eta` 새 `op:'arrive'`(`rideArrive`, route-v2 s35)가 하차 노드·시각, 추천을 보일 창(`reco.fromMs`=하차 7분 전 ~ 하차+30초), 두/한 정거장 전 단계(`level` 2/1, `pre` 3정거장 전), 내릴 준비 문구(`getoff` — 날짜·시간·날씨별 응원), 하차 판정 시각(`alightedAt`)과 앱 종료 시각(`quitAtMs`=판정+180초)을 정한다. 앱은 증거(노드별 도착 시각·현재 진행 노드·차량 안인지·환승 대기인지·도착 확인 여부)만 보내고 받은 값을 그린다(`_arriveEnsure`·`_arrAlightEta`·`_arrHomeEta`). 엔진 답이 없으면 추천·내릴 준비·자동종료는 만들지 않는다(두/한 정거장 전만 예전 계산). 끄기: `window._arriveOff = true`.
- **추천(7분 전)**: `_ARR_PRE_MIN` 5→7. 추천 가게는 마지막 하차 정류장·역(`_arrAlightCoord`) 근처에서 고른다. 버튼은 **[맛집 보기](쿠팡이면 [쿠팡 보기]) · [확인]** 둘뿐(주변버스 보기·종료 삭제, 오버레이·앱 팝업 같다). [맛집 보기] = `_arrOpenPlace`(맛집 탭에서 그 가게 카드를 찾아 지도 패널까지 연다, 4초 안에 목록에 없으면 추천이 들고 있던 정보로 카드를 만든다) · [쿠팡 보기] = `_arrShopOpen`(그 상품 링크를 `openExternalApp` 으로).
- **2정거장 전**: 알약이면 둘레 무지개(펼치지 않음), 펼쳐 있으면 경로 둘레 하이라이트 — 단계는 엔진 `level`. **1정거장 전**: 화면 펼침 + 캐릭터 + "내릴 준비를 해주세요" + 응원 문구(엔진 `getoff`) + [앱 종료] 버튼(네이티브 `getoff` 키, 추천 줄 자리에 우선 싣는다).
- **하차 판정 3분 뒤 앱 자동 종료**: 판정 = 진행 노드가 마지막 대중교통 노드를 지나 도보 구간에 들어섬(또는 도착 확인). 엔진이 준 `quitAtMs` 를 네이티브 `quit.at` 로 보내면 네이티브 타이머가 그 시각에 `quitApp`(웹이 멈춰도, 시계 위젯용 프로세스는 유지). 도착 확인(`_arrEndFinish`)은 여정을 닫기 전에 엔진에 한 번 더 물어 시각을 받아 둔다. 새 여정이면 예약 취소(`quit.at=0`).
- **네이티브**(`OverlayPlugin.java`): 추천 줄 버튼 2개(한 줄), `rcKind`(0 추천/1 내릴 준비), `rcHideAt`(확인으로 닫은 추천은 다시 안 그림), `quitAtMs`·`setQuitAt`.
- **설정 테스트 카드**에 "⏱ 앱 자동종료(15초 뒤 진짜 종료)" 추가, 1정거장 전 단계에 내릴 준비 줄 포함(출시 전 삭제 구간 그대로).
- 시험: `ride_eta` 91(arrive 6) · `overlay_pill_native` 11 · `overlay_reco.ui` 54 · `overlay_test_buttons.ui` 14 · `journey_e2e.ui` 27(실제 엔진 `rideEta` 로 arrive 응답) · `loading_chars.ui` 45 · `bg_fix_time.ui`(arrive 요청은 세지 않음). 전체 CI 매트릭스 56개를 로컬로 돌려 병렬 부하·시간 초과 외 실패 없음(cong_scene 은 간헐).
- **배포**: 엔진 s35 는 사용자가 Cloudflare 에 `route-v2-worker.ascii.js` 를 붙여 넣어야 적용된다(그 전에는 추천·내릴 준비·자동종료가 나오지 않고 두/한 정거장 전만 예전 계산).
- **한계**: 실기기 확인 전(오버레이 그림·[앱 종료]·3분 뒤 종료는 설정의 테스트 카드로 확인). `하차 판정`은 GPS 진행이 도보 구간에 들어선 순간 또는 도착 확인이며, 마지막 하차 뒤 GPS 가 늦게 잡히면 종료도 그만큼 늦다.

## 2026-10-17(9) 도착 전 순서 개편 — 마지막 대중교통 하차 기준 (YJ: "이 알람 기준은 최종 목적지가 아니라 마지막 대중교통을 하차하는 순서" · 엔진 s35, 네이티브 변경)
- **기준**: 최종 목적지가 아니라 경로의 **마지막 대중교통을 내리는 노드**. 내린 뒤 10분을 더 걸어도 같다. 엔진 `/ride-eta op:'arrive'`(`rideArrive`)가 정한다 — 하차 노드·시각, 추천 창(`reco.fromMs`=하차−7분 ~ 하차+30초), 마지막 구간 단계(`level` 2=두 정거장 전·1=한 정거장 전, `pre`=세 정거장 전), 내릴 준비 문구(`getoff`: 날짜·시간·날씨 응원), 하차 판정 `alightedAt`과 앱 종료 시각 `quitAtMs`(판정+180초). 앱은 증거(노드 시각·진행 노드·타는 중/환승 대기·도착 확인)만 보내고 받은 값을 그린다. 엔진 답이 없으면 추천·내릴 준비·자동종료는 만들지 않는다(두/한 정거장 전만 예전 계산).
- **순서**: ① 하차 7분 전 추천(`_ARR_PRE_MIN` 7) — 버튼 [맛집 보기](쿠팡이면 [쿠팡 보기])·[확인] ② 두 정거장 전: 알약이면 둘레 무지개, 펼친 상태면 경로 하이라이트 ③ 한 정거장 전: 화면 펼침 + 캐릭터 + "내릴 준비를 해주세요" + 응원 문구 + [앱 종료] ④ 하차 판정 3분 뒤 앱 자동 종료.
- **버튼 동작**: [맛집 보기] = 앱을 앞으로 가져와 맛집 탭에서 **그 가게 카드**를 열어 지도 패널까지(`_arrOpenPlace`; 목록에 없으면 추천이 들고 있던 가게 정보로 카드를 만든다). 추천 가게는 마지막 하차 정류장·역 좌표 근처에서 고른다(`_arrAlightCoord`). [쿠팡 보기] = 그 상품 링크를 `openExternalApp`(허용된 쿠팡 주소만)으로. [확인] = 추천만 닫음. [주변버스 보기]·[종료] 버튼은 없앴다.
- **네이티브(`OverlayPlugin`)**: RecoView 한 줄 버튼(추천: [보기][확인] / 내릴 준비: [앱 종료] 하나, `rcKind`), `getoff` 페이로드, `quit:{at}` 예약(`setQuitAt` — 웹이 멈춰도 그 시각에 `quitApp`, `at:0`=취소·새 여정), [확인]은 `rcHideAt` 으로 같은 추천을 다시 그리지 않는다. 시계 위젯은 `quitApp`(프로세스 유지)로 그대로 산다.
- **테스트 카드**: 설정 > 오버레이 테스트에 "⏱ 앱 자동종료(15초 뒤 진짜 종료)" 추가, 1정거장 전은 내릴 준비 줄. 출시 전 삭제 구간(TEST-BUTTONS)에 포함.
- 시험: `ride_eta` 91(arrive 6개 추가) · `overlay_reco.ui` 57 · `overlay_test_buttons.ui` 14 · `overlay_pill_native` 11 · `journey_e2e.ui` 27 · `loading_chars.ui` 45 · `journey_alerts.ui` 50.
- **엔진 배포 필요**: route-v2 `route-v2-worker.ascii.js`(버전 `route-v2-2026-10-17s35`)를 Cloudflare 에 붙여 넣어야 `op:'arrive'` 가 켜진다. 배포 전에는 앱이 엔진 답을 못 받아 추천·내릴 준비·자동종료가 나오지 않는다(예전 두/한 정거장 전 계산은 계속).
- 한계: 네이티브 컴파일·실기기 확인은 CI APK 로 한다(이 컨테이너엔 android.jar 가 없어 OverlayPlugin 을 javac 로 돌리지 못했다). 하차 판정은 앱이 가진 도착 확인 증거(`_arrEnd` done) 또는 진행 노드가 하차 노드를 지난 것을 엔진에 넘겨 정한다.

## 2026-10-17(10) 네이티브 이전 로드맵 — 화면 단위 점진 이전, 첫 화면 = 홈 경로 화면 (YJ: "앱 자체를 웹뷰에서 네이티브로 구현하는 개선작업도 추가 진행" → 점진 이전 · 홈 경로 화면 선택)
**원칙(변하지 않음)**: 계산은 엔진이, 앱은 엔진이 계산한 그림만. 화면마다 ① 웹 화면은 폴백으로 남긴다 ② 설정 스위치(기본 꺼짐으로 시작 → 실기기 확인 뒤 기본 켜짐) ③ 실패·8초 무응답이면 자동으로 웹 복귀 + 실패 횟수 저장 ④ 같은 데이터로 웹·자바 패리티 시험.

**이미 네이티브인 것(재사용 대상)**: 오버레이 전체(알약·펼침·추천·내릴 준비·무지개·`StripView` 가로 칸 그리기) · 장면(Compose Canvas, `SceneNativePlugin`) · 탑승/환승/도착 버튼 행 연출(`RowNativePlugin`) · 노선도(`MetroMapView`) · 위젯. JS 쪽 '웹 칸 위에 네이티브를 얹는 연결'(`natMeasure`·`natCover`·`natDesired`·스냅샷·건강 확인·실패 카운터)은 장면 전용 코드로 `www/index.html` 의 `cs-native` 블록에 있다.

**홈 경로 화면의 구성(`#transitResultCard`)과 이전 순서**
| 단계 | 내용 | 데이터(엔진/앱이 이미 가진 것) | 비고 |
|---|---|---|---|
| P1 | 가로 타임라인(`#transitHtlTrack`) 칸 그리기 + 가로 스크롤(관성) | `_ovlStrip(st, true)` 가 이미 만드는 칸 목록(역명·노선 라벨·점/선 색·시각·점 모양) · 현위치 칸 `cur` | 오버레이 `StripView` 의 그리기를 `HtlView`(순수 자바 `HtlCore` + 안드로이드 뷰)로 일반화. 웹 칸은 `visibility:hidden` 으로 레이아웃만 유지 |
| P2 | 현위치 마커·대기 뱃지·깜박임·지나간 역 흐림 | 엔진 `/ride-eta` `pos`(구간표)·`hold`·상태 문구 | 웹은 `htl-gps-here`·`htl-gps-wait`·`htl-passed` 클래스로 그린다 — 같은 상태 이름을 네이티브가 읽는다 |
| P3 | 칸 탭(역 정보 열기)·길게 누르기·환승 도보 칸 상세 | 웹 `onclick` 이 부르는 함수 이름만 넘기고 실행은 웹 | 손짓은 `MainActivity.dispatchTouchEvent` 분배(장면과 같은 방식) |
| P4 | 경로 카드 머리줄(소요시간·요금·옵션 탭)·버튼 행(세부경로·확정·탑승…) 통합 | 엔진 `row` 답 | `RowNativePlugin` 과 합친다 |
이후 화면 후보(위험 작은 순): 맛집 탭 → 쇼핑 탭 → 설정 → 커뮤니티 → 하단 탭 막대(가장 마지막).

**왜 한 번에 못 하나(정직)**: 홈 화면 하나만 해도 `www/index.html`(약 660만 자)에서 타임라인 DOM·CSS 상태 10여 가지·타이머·터치가 얽혀 있고, 네이티브를 웹뷰 위에 얹으면 세로 스크롤·팝업·탭 전환 때 따로 움직이는 문제(장면에서 스냅샷+가림 판정+건강 확인으로 겨우 푼 것)가 매번 생긴다. 이 환경에선 실기기·Gradle 빌드를 직접 확인할 수 없어(CI APK 로만 확인) 한 번에 크게 바꾸면 되돌릴 수 없는 회귀 위험이 크다. 그래서 P1 만 설정 스위치(기본 꺼짐) 뒤에서 먼저 넣고, 실기기에서 스크롤·팝업·탭 전환·다크모드가 맞는지 보고 P2 로 간다.

**P1 착수 조건/다음 할 일**
1. 이번 APK 에서 도착 전 순서(오버레이 네이티브 변경)가 실기기에서 잘 도는지 확인(`🧪 오버레이 테스트`).
2. P1: `HtlCore.java`(순수 자바: 칸 폭·스크롤 한계·현위치 가운데 맞춤·관성) + `HtlView`/`HtlNativePlugin`(Capacitor "HtlNative": show·setRect·update·hide·snapshot·status) + JS 연결을 장면의 `nat*` 함수들에서 공통 함수로 뽑아 두 군데가 같이 쓰게 한다. 패리티 시험: 같은 칸 목록을 웹 DOM 과 자바 코어가 같은 칸 위치·색·글자로 내는지.
3. 설정 카드에 스위치 + 실패 이유 표시(장면 카드 `#snSetCard` 와 같은 모양).

## 2026-10-17(11) 네이티브 이전 P1 구현 — 홈 경로 화면 가로 타임라인 (설정 스위치 `🧪 네이티브 경로 화면`, 기본 꺼짐)
(YJ: "핸드오프는 실패했어. 일단 점진적 네이티브 진행해줘" — 실패 원인은 불안정한 `cong_scene.ui` 시험이었고 (커밋 1046c14) 안정화함)

**구조(원칙 그대로: 계산은 엔진·웹이, 그림은 네이티브가)**
- `native/HtlCore.java` — 순수 자바(안드로이드·네트워크·시계 없음). 칸을 가로 좌표에 놓기 · 스크롤 한계 · 보이는 칸 · 마커의 선형 이동(웹 `left Nms linear` 와 같음) · CSS 색(`#rgb`·`#rrggbb`·`#aarrggbb`·`rgb()`·`rgba()`) 읽기. JVM 시험 `test/java/HtlJvmTest.java`(29개).
- `native/HtlView.java` — 칸 4줄(이름·노선 라벨/배지·선과 점·시각)과 마커(점·번지는 고리·승차 대기 주황 맥박·뱃지)를 그린다. 손가락은 받지 않는다(`dispatchTouchEvent`/`onTouchEvent` 가 false) → 웹뷰가 그대로 스크롤·탭을 받는다.
- `native/HtlNativePlugin.java` — Capacitor "HtlNative": `show · setRect · update · scroll · marker · hide · destroy · status`, 이벤트 `ready`(첫 그림)·`error`. `marker` 는 `x` 가 없으면 `wait`·`badge` 만 바꾼다.
- `www/index.html` — `_placeGpsMarkerSmooth` 뒤의 즉시실행 블록(`window._htlNat`): 웹이 그린 DOM 칸을 읽어(이름·시각·노선 라벨·점/선/글자 색(rgba·투명도 반영)·글자 크기·칸 x/폭) 플러그인에 넘기고, 칸 사각형·가로 스크롤·마커(`_placeGpsMarkerSmooth` 끝의 `_htlNatMk` 훅이 목표 x·y·ms·snap 을 알림)만 전달. `_renderHtlTrack` 끝에서 `_htlNat.kick()`.
- 설정 카드 `#htlSetCard`(플러그인이 있을 때만 보임) · 키 `gdm_htl_on`(기본 꺼짐) · `gdm_htl_fail` · `gdm_htl_why`.

**동작 규칙**
- 칸이 세로로 움직이는 동안(페이지 스크롤·화면 전환)·팝업이 덮는 동안·다른 탭에서는 네이티브를 숨긴다 — 웹 타임라인을 숨기지 않고 늘 그려 두기 때문에 곧바로 웹이 이어받는다. 약 4프레임 가만히 있으면 다시 켠다. 가로 스크롤은 숨기지 않고 `scroll({sx})` 로 따라간다.
- 다시 켤 때 마커는 웹 점이 있는 자리(이동 중이면 그 순간의 위치)에 먼저 놓고 남은 이동을 잇는다.
- 안전장치: `error` 이벤트·`show` 거절·8초 안에 첫 그림(`ready`) 없음·상태 점검(2초마다) 3번 이상 → `fail()` = destroy + 웹만 사용 + 실패 횟수 저장, 2번 누적되면 다음 실행부터 안 씀. `ready` 가 오면 횟수 0. 설정 스위치를 껐다 켜면 다시 시도.
- 상태 점검에서 `age`(마지막 그림 후 경과)는 마커가 보일 때만 본다(정지 화면은 다시 그리지 않으므로).

**시험**: `test/htl_native.test.js`(JVM·android.jar 컴파일·구조) · `test/htl_native_js.ui.test.js`(가짜 플러그인: 꺼짐/없음=호출 0, 칸·색·점 모양·자리 패리티, 마커 snap/이동/대기 뱃지, 가로 스크롤 추적, 세로 이동·팝업 덮임 시 숨김/재개, 재렌더·테마 변경 시 update, error·show 거절·누적 실패·ready·상태 이상 3번·스위치 끔/켬). CI 매트릭스에 둘 다 등록, `MainActivity` 생성부에 `registerPlugin(HtlNativePlugin.class)`.

**정직한 한계 / 실기기에서 볼 것**
- 아직 실기기 미확인(APK 로 확인 필요). 웹 타임라인이 네이티브 밑에 그대로 그려져 있어 지금 단계는 '그림 주체 교체'일 뿐 배터리·속도 이득은 거의 없다(P2 이후 웹 칸을 숨기면서 생김).
- 가로 스크롤을 웹뷰가 받고 네이티브가 따라가므로 1~2프레임 늦게 따라올 수 있다 — 거슬리면 스크롤 중에도 숨기는 쪽으로 바꿀 수 있다(`H.fast` 구간).
- 글꼴은 웹(Noto Sans KR)과 기기 기본(Typeface.DEFAULT)이 달라 글자 폭이 조금 다를 수 있다. 마커는 점·고리·대기 맥박·뱃지만 재현.
- 칸 탭·길게 누르기(P3), 지나간 역 흐림 등 CSS 상태 완전 이관(P2), 카드 머리줄·버튼 행(P4)은 아직.
- 확인 순서: 설정 → `🧪 네이티브 경로 화면` 켜기 → 경로 화면에서 ① 칸 모양이 웹과 같은지 ② 가로로 넘길 때 ③ 위아래로 스크롤할 때 깜박임 ④ 팝업이 덮일 때 ⑤ 현재 위치 점이 움직일 때 ⑥ 다크/파스텔 전환.

## 2026-10-17(12) 홈 복귀 시 장면 높이 + 네이티브 P2(웹 타임라인 가리기)
**① 다른 탭에 다녀오면 장면이 줄었다 커지던 문제(YJ 스크린샷)**
- 원인: 네이티브 장면(`natTick`)은 홈이 숨어 있어도 1초마다 `FIT`(= `_sceneFit`)를 불렀고, 홈이 숨으면 `offsetParent` 가 없어 `fill=false` 로 판정돼 맞춰 둔 높이가 지워졌다(150px 로 접힘). 돌아온 뒤에야 다시 키웠다.
- 수정: `_sceneFit` — 엔진이 fill 이라 한 상태에서 '탭이 숨어 있기만 한' 경우엔 높이를 지우지 않고 그냥 돌아온다. `switchTab('home')` — 애니메이션을 끄고 바로 `_sceneFit`+`_CS.refit()`, 두 프레임 뒤 전환 효과 복구, 350ms 뒤 한 번 더 보정.
- 시험: `cong_scene.ui` (10:12 YJ) — 떠나 있는 동안 `_sceneFit` 를 불러도 높이가 그대로, 돌아온 뒤 프레임마다 재도 줄지 않음(수정 전 코드에선 실패 확인).
**② P2 — 네이티브가 그리는 동안 웹 타임라인을 가린다**
- `.htl-nat-on #transitHtlTrack{visibility:hidden}`(레이아웃은 그대로라 측정·마커 좌표 동일). 네이티브 `ready`(또는 0.4초) + 0.12초 뒤부터 가리고, 네이티브를 숨기기 '전에' 먼저 풀어 웹이 곧바로 이어받는다. 실패·끄기·덮임·움직임 모두 같다. 끄기 스위치: `window._htlKeepWeb = true`.
- 시험: htl_native_js.ui — 가림·레이아웃 유지·hide 호출 시점에 이미 풀려 있음·실패/끄기 때 풀림.
- 실기기에서 볼 것: 켜졌을 때 깜박임·빈 칸이 생기는지, 가로 스크롤이 1~2프레임 늦는지(웹이 가려져 있어 이제 네이티브만 보임).

## 2026-10-17(13) 네이티브 P4a — 경로 카드 머리줄('NN분 출발 → 도착')을 네이티브로 + 영역(region) 구조
(YJ: "진행해줘" — 머리줄은 글자만이라 먼저. 카드의 즐겨찾기·× 버튼과 경로 옵션 탭은 눌림이 있어 웹 그대로 둔다.)
- **구조 변경**: 플러그인 `HtlNative` 가 영역(id)마다 뷰를 따로 가진다(`"tl"` 타임라인=기본, `"hd"` 머리줄). 모든 호출은 `id`(없으면 tl). `hide`/`destroy` 는 id 없으면 모든 영역. `ready` 이벤트에 `id`.
- **글자 덩어리(`runs`)**: 웹이 이미 배치한 한 줄 글자를 `TreeWalker`+`Range.getClientRects()` 로 읽어 `{t,x,y,w,h,s(글자 크기),c(rgba),b(굵게)}` 로 넘긴다. 네이티브(`HtlView` runs 모드)는 줄바꿈·배치를 하지 않고 그 자리에 그리며, 기준선은 코어 `HtlCore.baseline`(글꼴 상자를 글자 상자 가운데에)으로 잡고, 폭을 넘으면 말줄임(웹의 `text-overflow:ellipsis` 와 같게; 보이는 오른쪽 끝은 overflow 조상까지). 글자가 여러 줄로 접히면 읽지 않는다(웹이 그린다).
- **JS**: `www/index.html` 의 네이티브 경로 화면 블록을 `makeRegion(id, cfg)` 공장으로 재구성 — 영역마다 상태·반복 확인·덮임 판정·웹 가리기·상태 점검이 따로, 설정 스위치·실패 카운터·`error` 는 공통(어느 영역이든 실패하면 모두 웹으로). 머리줄은 `#transitResultHeader` 를 감시(MutationObserver)해 숫자가 바뀌면 `update`. 웹 가리기는 머리줄 안의 글자만(`#transitResultHeader.htl-nat-on-hd > *{visibility:hidden}` — 영역 자신은 남겨 덮임 판정이 정상).
- **시험**: htl_native_js.ui 26개(머리줄: 별도 뷰·사각형/글자 자리·크기·색, 가림, 숫자 변경 update, 접힌 글자 안 읽음, 영역별 덮임 판정 포함) · htl_native 7개(영역별 뷰·runs 코드 구조) · JVM 32개.
- **한계**: 글꼴이 웹(Noto Sans KR)과 기기 기본이라 글자 폭이 조금 다를 수 있어 말줄임이 웹과 한두 글자 다를 수 있다. 진짜 기기에서 머리줄 위치(세로 기준선)가 웹과 맞는지 확인 필요.
- **다음 후보**: 같은 `runs` 방식으로 분리·대기·출발 문구줄(`transitSplitRow` 등 — 글자가 여러 줄이면 못 읽으므로 한 줄짜리만), 그다음 눌림이 필요한 탭·버튼 행(P3: 네이티브가 누른 자리만 웹에 알리고 실행은 웹 함수).

## 2026-10-17(14) 네이티브 P4b — '그림 영역' 범용화: 상자(배경·테두리·둥근 모서리) + 여러 줄 글자, 눌림은 투명한 웹이 받는다
(YJ: "목표는 기능을 100% 유지하며 전부 네이티브로" — 이 방식이 그 방향의 기본 도구다.)
**원리(모든 화면에 재사용)**: 웹(DOM)은 레이아웃·상태·눌림을 그대로 맡고(기능 100% 유지), 네이티브가 그 위에 그림만 그린다. 네이티브가 그리는 동안 웹 요소는 `opacity:0`(CSS `.htl-nat-op`)로 제자리에 남는다 — opacity 는 눌림 판정에 영향이 없고, 네이티브 뷰는 손가락을 안 받으므로(`dispatchTouchEvent` false) 버튼·탭·링크가 지금과 똑같이 눌린다. 네이티브를 숨기기 전에 먼저 웹을 되살린다.
- `paintOf(host)`(index.html): 호스트 안을 DOM 순서로 돌며 상자(`{k:'r',x,y,w,h,r,f,sc,sw}` — 배경색·균일 테두리·평균 모서리 반지름)와 글자 줄(`{t,x,y,w,h,s,c,b}`)을 읽는다. 글자는 글자마다 자리를 재서 줄별로 나눈다(이모지 코드포인트 단위, 접힌 공백 제외). 말줄임이 필요한 줄만 보이는 끝에서 자르고 나머지는 호스트 오른쪽까지 여유(글꼴 폭 차이로 '…' 이 생기지 않게). 투명도(opacity 곱)는 색의 알파로 반영. **그리지 못하는 것**(img·canvas·svg·video·input·select, 그라데이션 배경, `::before/::after` 내용, 변마다 다른 테두리)이 하나라도 있으면 `null` = 그 영역은 웹이 그린다.
- 영역(region) 목록: `tl`(타임라인·마커) · `hd`(머리줄 행: 분 숫자·구간명·즐겨찾기·×) · `tb`(경로 옵션 탭) · `r:transitSplitRow` · `r:transitDepRow` · `r:transitOfficialRow` · `r:transitAlertRow`(안내 문구 줄들, 호스트 자신의 배경·테두리·안쪽 여백까지 테두리 상자로). 새 영역 추가 = `makeRegion('id', paintCfg(function(){ return 호스트요소; }))` 한 줄.
- 자바: `HtlCore.Run` 에 상자 필드(`box,r,fill,stroke,sw`)와 `clampRadius`; `HtlView` runs 모드가 목록 순서대로 상자(채움+테두리)·글자를 그린다; 플러그인 `runs` 항목의 `k:'r'` 이 상자.
- 시험: htl_native_js.ui 29개(상자·글자·여러 줄·이모지·그릴 수 없는 것 폴백·투명이어도 눌림(즐겨찾기·탭)·내용 변경 update·호스트 상자·영역별 덮임 판정), htl_native 7개, JVM 34개.
- **한계/정직**: 이것은 '웹뷰가 레이아웃과 눌림을 맡고 네이티브가 그린다'는 구조라 앱 전체를 Compose 로 새로 짜는 것(웹뷰 제거)과는 다르다. 웹뷰를 완전히 없애려면 ① 화면별 상태/로직 JS(약 660만 자)를 코틀린으로 옮기고 ② 엔진 호출·저장소·GPS·알림을 네이티브로 다시 연결해야 한다 — 이 환경에선 실기기 확인이 안 돼 한 번에 하면 회귀 위험이 크다. 지금 방식으로 화면을 하나씩 '그리기만' 네이티브로 옮기고, 각 화면이 실기기에서 확인되면 그 화면의 웹 그리기를 영구 제거 → 마지막에 로직 이전 순서로 간다.
- **다음 후보(눌림 없는 것부터)**: 혼잡도 카드(`congCard`: 칸별 게이지·24시간 막대는 그라데이션/캔버스 여부 확인 필요), AI 승무원 카드, 실시간 대화 목록, 하단 탭 막대(아이콘 svg → 그릴 수 없어 웹 그대로이므로 svg 경로 그리기가 먼저), 맛집/쇼핑 탭 목록(이미지 → 이미지 그리기 필요).

## 2026-10-17(15) 환승 표시 + 장거리 고르기 상자 정리 + 네이티브 P4c(환승 줄) — 엔진 s36 재배포 필요
(YJ 13:00: "최단시간에 저 고르는 게 왜 뜨지? 환승이 필요한 부분은 알려줘야해. 수정하고 다음 네이티브. 모든 계산은 엔진이 앱은 그림만")
**① 최단시간 탭에 뜬 '열차 13:47 ▾'**: 부평→두정처럼 80km 이상이면 엔진이 최단시간 경로로 장거리(열차) 경로를 고르는데, 그 경로에 `route.ld` 가 붙어 있어 `_renderLdGradeChips` 가 어느 탭에서든 그렸다. 수정: 장거리 탭이 그릴 때(`cacheSource==='engine_longdist'`)만 그린다. 열차↔고속버스 고르기는 `🚄 장거리` 탭에서 그대로 된다(기능 보존).
**② 환승 표시 — 엔진(route-v2 s36)이 정하고 앱은 그린다**
- 엔진: `info.transfers[]` = `{kind:'line'|'walk'|'bus'|'train', at, boardAt, fromType/fromLine, toType/toLine, walkMin, secIdx, xferSecIdx, (train) service/stopIdx}` + 구간 `trainChanges`. **같은 1호선 안에서 일반→급행으로 갈아타는 경우(구로에서 천안급행)** 는 길찾기에서 구간이 하나라 환승으로 안 잡혔다 → 간선 종류가 `ride`↔`xpress` 로 바뀌는 역을 `leg.swaps` 로 기록. 순위·환승 횟수(`transferCount`)는 건드리지 않았다(그래서 헤더 '환승 N' 과 이 목록 개수는 다를 수 있다).
- 앱: ① `#transitXferRow`(주황 상자): "구로에서 1호선 → 천안급행 환승 · 도보 1분" 등 문장 ② 타임라인 환승 이동 노드는 '도보' 대신 **환승**(굵게) + 갈아탈 노선 배지(6.5px→8px) ③ 같은 노선 일반↔급행 역에 `↔ 급행 환승` 배지. 옛 엔진 응답(`transfers` 없음)이면 아무것도 지어내지 않고 숨긴다 → **엔진 s36 을 올려야 보인다** (`route-v2-worker.ascii.js`).
- 시험: 엔진 `test/transfers.test.js`(8) · 앱 `transfer_row.ui.test.js`(7: 문장·타임라인·옛 엔진·고르기 상자 탭별 노출·다시 그려도 같음) · CI 매트릭스에 추가.
**③ 네이티브 P4c**: `r:transitXferRow` 를 그림 영역에 추가(문장을 줄별로 넘김, 눌림 없음). 시험 `htl_native_js.ui` 30개.
**④ 같이 고친 실제 버그(P4b)**: 덮임 판정(`coverOf`)이 표본점에서 *조상*(부모·카드)을 '덮는 것'으로 오판했다. 둥근 모서리 줄은 소수점 높이에서 모서리 표본이 바깥(부모)을 짚어 네이티브가 영영 안 켜질 수 있었다 → 조상은 덮개가 아님.
- 한계: 기기 미검증(APK 필요). 환승 문구의 정확도는 엔진 그래프(급행 간선)에 달려 있다 — 카카오와 다른 환승점이 나오면 엔진 쪽 문제로 본다.

## 2026-10-18 (밤) 엔진 s40 · 엔진 원본 백업 · 전 노선 점검 · GPS 영점 보수화 · 혼잡도 카드 네이티브
(다른 Claude가 s37~s39를 배포했지만 문서·원본이 저장소에 없었다. 이 절이 그 빈자리를 메운다.)

**① 엔진 원본 복구** — 저장소 `engine/route-v2-worker.ascii.js` = 배포 엔진(ASCII 이스케이프 번들, 한글은 `\uXXXX`)의 **s40 사본**이다. 이 저장소가 엔진 원본 백업이다(`DullyYJ/route-v2`에는 s39 소스·시험이 없다). 배포 방법: 이 파일 전체를 Cloudflare 대시보드 `route-v2` → Edit code에 붙여 넣고 Deploy (YJ가 직접). 배포 후 `/route-v2-app` 응답의 `engineVersion`이 `route-v2-2026-10-18s40`이면 반영된 것.
- s37~s39는 문서가 없다. 코드에서 확인된 것만: `patchSubwayBundle`(초지·광운대 등 번들 누락역 보강), `trainSwap` 환승 벌점(10-17), `expressVia`(급행 두 역 사이 중간역 BFS, 10-17), 도착 연산(s35). 그 외 s37~39 변경은 **원인 미상** — 필요하면 s39(`route-v2-worker.deployed-s39`)와 s40을 diff 하면 s40의 변경만 나온다(아래 ②③).

**② 되돌림(루프) 버그 — 부평→두정에서 영등포·신길을 두 번 지나던 경로** (다른 Claude 조사 이어받음)
- 원인: 같은 노선에서 급행↔급행(또는 일반↔급행)으로 갈아탈 때, **방금 지나온 역 쪽으로 되돌아가는** 간선이 허용됐다(예: 송내→신길 인천급행 다음 신길→두정 천안급행). 최단 시간 탐색은 급행 간선이 싸서 이런 경로를 골랐다.
- 수정(s40): `dijkstraRaw` 간선 루프에 되돌림 검사를 넣었다.
  · **급행(xpress) 간선**이 직전 구간(급행·일반)과 같은 노선에서 방금 지나온 역 쪽으로 되돌아가면(`isTrainBacktrack`, 역 사슬 `rideChain` 비교) 건너뛴다.
  · **일반(ride) 간선**은 직전이 급행일 때만 따진다(`isRideEscape`): 급행이 지나친 구간(급행 출발역~도착역 사이)을 일반열차로 **되돌아오는 것은 허용**한다 — 목적지가 급행 미정차역일 때의 정상 경로(덕정→관악·석수, 언주→한성백제, 오산→신도림). 단 급행 출발역 너머로 더 가거나, 되돌아오는 구간이 5정거장을 넘으면 막는다.
  · 처음 버전은 이 예외 없이 모든 되돌림을 막아 정상 경로가 최대 12분 늘었다 → 전수 점검의 '시간 악화' 비교로 발견해 두 번 다듬었다. 교훈: **이상 0건**만 보지 말고 수정 전후 소요시간 비교(`cmp2.js`)를 같이 볼 것.
- 하네스: `tools/route-sweep/`(README 참고). 노선별 모든 역 쌍 × 평일 07:00·12:40·17:20(1호선) / 17:20·일 14:00(그 외)로 `/route-v2-app`을 로컬에서 부르고 이상(`dupInLeg` 같은 역 두 번·`revisit` 비환승역 재방문·`timeBack` 정차 시각 역행)을 센다.
- 결과(수정 전 → s40 최종): 전 노선·역 쌍·시각 점검. **1호선** 32,136건(평일 07:00·12:40·17:20): 이상 경로 883건 → 9건(전부 오탐: 급행이 서지 않고 지나친 역이 통과역 목록에 한 번, 되돌아오는 일반열차에 한 번 나와 중복으로 잡힘 — 오산→신도림·동두천→의왕 등). **9호선** 2,812건: 5 → 0. **공항철도·GTX-A·4호선·경의중앙선·수인분당선** 이상 0(수정 전후 같음). 시간이 늘어난 구간은 대부분 ±1분(시각표 반올림)이고, 큰 변화는 모두 되돌림 경로가 사라지며 다른 탭이 더 빨라진 쪽(예: 의정부→대방 최소환승 189→62분, 오산→동인천 최단 92→87분). 늘어난 것은 디지털미디어시티→회기(+2, 환승 경로 대신 경의중앙선 직통 41분으로 바뀜) 등 극소수 — 원인은 끝까지 못 밝힘(되돌림 차단 구간에는 걸리지 않는 경로라 후보 선택의 동률 차이로 추정). 부평→두정은 05:00~23:40 20분 간격 평일·일요일 전 시각에서 이상 없음.
- **함정**: 워커에 IP 당 10초 40건 제한이 있어 하네스가 한 IP로 돌리면 429가 '결과 없음=이상 없음'으로 보인다 — 하네스는 요청마다 `CF-Connecting-IP`를 바꿔 보낸다. 처음 한 번 이 때문에 '이상 없음' 결과를 잘못 믿을 뻔했다.

**③ GPS 영점 보수화 (`engine/ride-eta.js`, 옵션 `zeroSoloMaxMin: 8`)** — GPS 통과 기록이 현재 구간에서 **딱 하나**뿐이고 기준(앱이 그린 지연 `prevLevelMin`, 없으면 시각표 0분)에서 **8분** 넘게 벗어나면 그 하나로는 시각을 옮기지 않고 노트('영점: … 참고만 함')만 남긴다. 두 번째 GPS 통과가 오면 그때 따른다. 0이면 옛 동작. 시험 `ride_eta.test.js` '영점 보수화'(92개). 임베드된 엔진(워커 안 ride-eta)에도 같은 값으로 넣었다(s40).
- **교훈(CI #1158 실패)**: 처음엔 3분이었는데 `test/sim/standby_sim.js`(d300 = 5분 늦은 열차)가 '현위치 칸 오차 최대 3'·'도착 300초 빠름' 27건으로 깨졌다 — 진짜 5분 지연의 첫 GPS 통과를 '의심'으로 오인해 따라가지 않았다. 8분으로 올리니 84/84. **ride-eta를 만지면 `node test/ride_eta.test.js` 뿐 아니라 `node test/sim/standby_sim.js`도 반드시 돌릴 것**(이전 베이스라인 통과 84, 문제 0).
- **기기 미검증.**

**④ 혼잡도 카드 네이티브(`www/index.html`, 영역 5개 `cs:top·gauge·carttl·cars·busnote`)** — 그림 영역 틀(`makeRegion`) 위에 추가. 캔버스·SVG·그라디언트가 있으면 그 영역만 웹으로 남는다. 시험 `htl_native_js.ui.test.js` 31개. **기기 미검증**(설정 '네이티브 경로 화면'을 켜야 보임).

**⑤ 남은 일**: 실기기에서 ③④ 확인, 시험용 버튼 제거(TEST-BUTTONS), `DullyYJ/route-v2` 저장소에 s40 소스·시험 반영 여부는 YJ 판단(지금은 이 저장소가 원본).

## 2026-10-18 (밤 2) 네이티브 이전 5번째 화면 — 맛집 탭 (`www/index.html` 영역 틀 + `test/htl_native_js.ui.test.js`)
같은 영역 틀(`makeRegion`·`paintCfg`) 위에 영역만 추가했다. 자바(플러그인·뷰) 변경 없음 — `HtlNative`가 영역 id만 다르게 받아 그린다. 설정 스위치 '네이티브 경로 화면'이 꺼져 있으면 예전과 똑같다.
- 영역: `fd:hdr`(머리: 제목·'○○역 인근'·새로고침 단추) · `fd:k0~k5`(카테고리 칩 6개 — 가로로 밀리는 줄이라 줄 전체가 아니라 칩마다 따로, 밀리는 동안은 영역이 '움직임'으로 보아 웹이 그린다) · `fd:msg`(빈 상태·불러오기 실패 문구) · `fd:c0~c19`(맛집 칸 앞 20개). 뒤쪽 칸·공공데이터 구분줄·'불러오는 중' 빙글이(테두리 색이 달라 읽을 수 없음)는 계속 웹.
- 맛집 목록이 새로 그려지면(`#foodList` childList) `watchFood()`의 관찰자가 `kick()`을 불러 영역들이 새 칸을 읽는다. `switchTab` 첫 줄에도 `_htlNat.kick()`을 넣었다(꺼져 있으면 아무 일 없음).
- 한계(정직): ① 칸을 누를 때 웹의 `:active{transform:scale(.98)}` 줄어듦은 투명한 웹에서만 일어나 안 보인다(눌러서 지도 여는 동작은 그대로). ② 스크롤 중엔 웹이 그리다 멈추면(≈0.07초) 네이티브로 바뀐다 — 그 전환이 눈에 띄는지는 **실기기 확인 필요**(글꼴 두께·줄 간격 차이). ③ 칸이 21개 이상이면 뒤쪽은 웹(같은 모양이라야 이질감이 없다 — 이것도 실기기에서 볼 것).
- 시험: `htl_native_js.ui.test.js` 32개(맛집 탭 1개 추가: 머리 글자·칩 상자/글자·칸 글자/상자 3개 이상·웹 투명·4번째 칸 영역 없음·칩 바꾸면 update·빈 상태 영역·끄면 호출 0). `tabs_smoke` 53 · `cong_card` 11 · `route_row` 11 · `transfer_row` 7 · `journey_e2e` 27 통과.
- 추가 수정: ① `tick()` 에서 호스트가 사라지면(`!w`, 예: 맛집 목록이 다시 그려져 칸이 없어짐) 보이던 네이티브 뷰를 `hideNative()` 로 내린다(예전엔 그대로 남을 수 있었다). ② 시험 교훈 — 가짜 플러그인 `show` 는 `autoReady`(30ms 뒤 `ready` 전송)로 진짜처럼 만들 것(안 보내면 8초 감시가 '첫 그림이 안 나왔다'로 끈다). ③ 영역이 먼저 켜졌을 수 있으니 `clear()` 직후 같은 영역의 `show` 를 기다리지 말 것(같은 글자면 update 도 안 간다). ④ 타임라인 hide 순서 시험은 `id==='tl'` 인 hide 만 본다(다른 영역 hide 가 덮어써 부하 때 흔들림). 부하(병렬 6회) 6/6 통과 확인.
- 다음 후보(위험 작은 순): 쇼핑 탭(상품 이미지가 섞여 칸 단위로만 가능) → 설정 → 커뮤니티 → 하단 탭 막대(맨 마지막).

## 2026-10-18 (밤 3) 네이티브 이전 6번째 화면 — 쇼핑 탭 (`www/index.html` 영역 틀 + `test/htl_native_js.ui.test.js`)
**원칙(YJ 재확인)**: 웹 기능은 그대로 이식(눌림·열기는 투명하게 제자리에 남은 웹 요소가 받는다) · 렉 없이 · 목표는 100% 네이티브 · **계산은 엔진, 앱은 그림만** — 이 화면 이전도 DOM 이 이미 정한 값(글자·색·자리)을 읽어 그리기만 한다(새 계산 없음). 설정 '네이티브 경로 화면'이 꺼져 있으면 예전과 똑같다. 자바 변경 없음.
- 영역: `sh:note`(대가성 안내 상자) · `sh:k0~k9`(카테고리 칩, 가로 스크롤이라 칩마다) · `sh:foot`(하단 안내 문구) · `sh:p0~p13`(상품 칸의 **이름+최저가 줄** — 지금 스크롤 영역에 걸친 앞 14개를 문서 순서로 배정, `shopRows()` 가 0.12초 안엔 다시 안 잰다). 상품 사진은 그림이라 웹이 그대로 그린다(사진 칸은 투명 처리 안 함), 검색 입력줄(입력칸)·새로고침 단추(아이콘)도 웹.
- 스크롤: 움직이는 동안은 웹이 그리고(영역이 '움직임'으로 판단), 멈추면 그 자리의 줄을 다시 읽어 네이티브가 그린다. 줄이 다른 상품으로 바뀌어도 이전 줄에 `htl-nat-op`(투명)이 남지 않게 줄 영역만 `webIs/webSet` 을 덮어 썼다(남으면 글자가 사라져 보인다) — 시험이 확인.
- `paintOf` 일반 개선: `-webkit-line-clamp`(상품명 2줄)는 넘친 줄의 글자를 마지막 줄에 이어 붙이고 그 줄을 요소 오른쪽 끝에서 잘라 네이티브가 '…'로 줄이게 한다(예전엔 넘친 줄까지 다 그렸을 것).
- 시험: `htl_native_js.ui.test.js` 33개(쇼핑 1개 추가: 안내·칩·이름줄·2줄 제한·14개 상한·사진 칸 비투명·스크롤 후 줄 교체·지나간 줄 투명 해제·칩 다시 그리기·끄면 호출 0). 스크롤 4초 연속(100개 상품)에서 프레임 최대 간격이 켬/끔 같음(17ms).
- 한계(정직): 사진이 없는 칸(이모지)만 시험했다. 실기기에서 ① 멈춘 뒤 웹→네이티브 전환 때 글꼴 두께·줄 간격 차이 ② 이름이 길 때 '…' 위치가 웹과 같은지 ③ 칸 눌림 효과 확인 필요. 점검: 배포 엔진 루트 `version` = `route-v2-2026-10-18s40` 확인됨(YJ 배포 반영).
- **스크롤 부드러움(YJ: '120Hz 느낌으로 매우 부드럽게')**: 스크롤 자체는 웹뷰(컴포지터)가 하고 네이티브는 멈춘 뒤에만 그리므로 스크롤은 웹 그대로다. 우리 JS 가 스크롤 중 하는 일을 줄였다 — ① 움직이는 영역은 덮임 검사(`elementFromPoint` 최대 15번)를 건너뜀 ② 어디선가 스크롤 중(0.5초 안)이면 가만히 있는 영역의 재검사도 미룸 ③ 스크롤 이벤트는 프레임당 한 번 모아, 스크롤한 요소 '안'의 영역만 깨움(이미 프레임마다 보는 중이면 다시 깨우지 않고, 안 보이는 탭 영역은 깨우지 않음). 쇼핑 100개 상품 1.5초 스크롤: `elementFromPoint` 654번 → 6번(시험 '부드러운 스크롤', 40번 이하). **실기기 120Hz 체감은 미확인** — 남은 위험: 스크롤 시작 순간 영역 십수 개의 `hide` 호출이 한꺼번에 나가는 것(다음에 한 번에 묶는 호출 `hideAll` 고려), 네이티브 `hide` 가 도는 1~3프레임 동안 글자가 잠깐 안 따라오는 것.
- 다음 후보: 설정 → 커뮤니티 → 하단 탭 막대(맨 마지막). *(설정은 아래 7번째로 진행됨)*

## 2026-10-18 (밤 4) 네이티브 이전 7번째 화면 — 설정 탭 (`www/index.html` + `test/htl_native_js.ui.test.js`)
**원칙(YJ 재확인)**: 계산은 엔진, 앱은 그림만 — 이 화면도 DOM 이 이미 정한 글자·색·자리를 읽어 그리기만 한다. 웹 기능은 그대로(입력·스위치·눌림은 투명하게 제자리에 남은 웹 요소가 받는다). 설정 '네이티브 경로 화면'이 꺼져 있으면 예전과 똑같다. 자바 변경 없음.
- 영역 `ss:b0~b23`: 설정 탭(`#settingsTabView`)의 **글자 블록**을 화면에 보이는 앞 24개까지. 블록 = 입력칸·그림·SVG 가 없고 글자가 있는 가장 큰 요소(카드가 글자·단추뿐이면 카드째; 입력칸이 든 카드는 안으로 들어가 제목·설명·단추만). 입력칸·스위치·아이디 입력·테마 고르기 등은 웹이 그대로 그린다. `display:none` 카드는 블록이 아니다. 투명도가 걸린 블록(조상 포함)은 읽지 않는다(웹이 그린다). 블록 목록은 `ssBuild()`(변화 관찰자가 '다시 만들 것'만 표시, 0.3초 이상 간격), 보이는 것만 `ssVisible()`(0.12초 메모).
- **칸 고정 배정(`stableSlots`)**: 영역 번호 ↔ 요소를 '보이는 동안은 같은 칸'으로 고정한다(쇼핑 줄도 같이 적용). 목록 번호로 배정하면 앞쪽 블록이 늘고 줄 때마다 모든 영역의 칸이 밀려 전부 새로 읽혀 깜박인다.
- **영역이 가리키는 요소가 바뀌면 예전 내용을 버린다**(`tick` 의 `hostEl` 비교: `H.cur=null` → 웹이 그리다 새로 읽은 뒤 네이티브). 예전엔 칸이 바뀐 뒤 최대 0.6초 동안 이전 글자가 새 칸 위에 그려질 수 있었다(쇼핑 줄에서 발견). 스크롤 중(마지막 스크롤 이벤트 0.1초 안)엔 글자 읽기(`refresh`)도 미룬다(120Hz).
- **되먹임 깜박임 2건 수정**: ① `syncCard()` 가 같은 상태 글자를 계속 다시 써서(`textContent=`) 변화 관찰자가 깨어났다 → 같으면 안 쓴다. ② 블록 투명도 검사가 **우리가 건 `htl-nat-op`(웹을 가리는 opacity:0)** 를 '투명한 블록'으로 읽어 그릴 때마다 꺼졌다 켜졌다 했다 → 우리가 건 것은 셈하지 않는다. 시험('가만히 두면 3초 동안 hide/show/update 0')이 잡는다. **교훈: 영역 읽기에서 `htl-nat-op` 효과를 계산에 넣지 말 것 · 영역을 깨우는 관찰자가 영역이 만든 변화(상태 글자·클래스)에 다시 깨어나지 않게 할 것.**
- 설정 탭 열 때 `showSettingsTab` 끝에서 `_htlNat.kick()` 을 부른다(꺼져 있으면 아무 일 없음).
- 시험: `htl_native_js.ui.test.js` 35개(설정 1개 추가: 글자·단추 그리기·입력칸 비투명·입력은 웹이 받음·가만히 두면 깜박임 0·스크롤 뒤 새 블록·이전 글자 잔상 0·화면 밖 투명 0·투명도 걸리면 웹·끄면 호출 0). 부하 6/6 통과.
- 한계(정직): 스위치(입력칸이 든 라벨)와 입력칸은 웹이 그린다(눈에 보이는 글자는 네이티브·스위치는 웹이라 섞여 보임). 카드의 배경·테두리는 입력칸이 든 카드에선 웹이 그린다(글자 블록만 네이티브). 실기기 확인 필요: 글꼴 두께·줄 간격 차이, 설정 스크롤 감촉, 테마 바꿀 때 색 따라가는지.

## 2026-10-18 (밤 5) 서버 구동 네이티브 화면 1호 — 쇼핑 탭 (엔진 s41 `/screen/shop` + `native/Screen*.java` + 앱 접착 `_scrShop`)
**YJ 최종 목표: "웹뷰를 100% 네이티브로".** 선택한 방식 = **엔진이 화면 구성까지 내려주는 방식(server-driven UI)**. 반영한 보완 3가지(YJ가 Gemini 의견을 첨부): ① **로컬 캐시** — 플러그인이 받아들인 마지막 정상 JSON 을 카테고리별로 저장(`gdm_scr_c:<카테고리>`)해 두고, 쇼핑 탭을 열면 네트워크를 기다리지 않고 곧바로 그린다(5분 넘은 저장본이면 뒤에서 새로 받아 제자리 갱신, 스크롤 유지). ② **폴백** — 엔진 JSON 이 틀린 모양이면 그리지 않는다: 저장본이 있으면 그걸 계속 쓰고(설정 카드에 표시), 없으면 예전 웹 쇼핑 화면. 저장본이 틀리면(앱 규격이 바뀐 경우) 버리고 새로 받는다. ③ **단계적 전환** — 쇼핑 → 설정 → 맛집 → 커뮤니티 → 하단 탭 막대 순, 화면마다 설정 스위치(기본 꺼짐)로 되돌릴 수 있고 앱 스토어 심사 없이 엔진 배포만으로 화면 구성이 바뀐다.

**역할(절대규칙: 계산은 엔진, 앱은 그림만)**
- **엔진 `GET /screen/shop?cat=&lat=&lng=[&now=&tz=]`** (route-v2 워커에 내장, 원본 `engine/shop.js` + `engine/shop-worker.js`, 내장 도구 `node tools/engine/embed-shop.js [--version …]`, `ENGINE_VERSION` = `route-v2-2026-10-18s41`). 앱 `_shopPick`(시드·mulberry32·계절·날씨·시간대·요일 점수·카테고리 편중 방지) **전부를 엔진으로 옮겼다.** 상품은 쇼핑 서버(`gildongmu-shop` `/shop`)에서 60초 메모리로(서버가 죽으면 마지막 것, 없으면 503), 계절 규칙은 `gildongmu-food /app-config?k=shop` 10분, 날씨는 장면 엔진과 같은 `sceneWeather(lat,lng)`(subway-api `/weather`) — 앱은 위치만 보낸다(GPS 없으면 마지막 날씨 격자). 응답은 화면 JSON: 칩 줄(`chips`) · 카드 격자(`grid` 2열) · 문구(`text`) · 단추(`button`) · 간격(`spacer`), 행동 `act` = `cat`/`open`/`refresh`. 색은 역할 이름(`text/sub/gold/orange/card…`)만 쓰고 실제 색은 앱 테마에서 온다.
- **네이티브 `ScreenCore`(순수 자바)**: 작은 JSON 파서(깊이 24·크기 3MB·노드 6000 한도) + **검증**(규격 `v:1`, 알려진 노드의 필드 모양·범위·http(s) 주소·모르는 행동 거절; 모르는 노드 종류는 건너뛰어 앞으로 늘려도 옛 앱이 안 깨짐; 이상한 그림 주소는 그림만 뺌) + 배치(줄바꿈·2줄 말줄임·카드 높이 = 같은 줄 최대·본문 높이) + 보이는 조각 이진 탐색 + 눌림 찾기. `ScreenView`(안드로이드): 캔버스로 그리기, 자체 스크롤(`OverScroller` 관성·`VelocityTracker`·화면 박자 `postInvalidateOnAnimation`), 그릴 때 새 객체 없음, 그림은 백그라운드 3스레드로 받아 LruCache + 파일 캐시(40MB 상한). `ScreenNativePlugin`(`ScreenNative`): `show/update/setRect/hide/destroy/status` + 이벤트 `ready/error/action`; JSON 이 검증을 못 넘으면 `invalid` 오류.
- **앱 접착 `_scrShop`**(`www/index.html`, 쇼핑 섹션 끝): 엔진 JSON **글을 한 글자도 안 고치고** 플러그인에 넘기고 행동만 처리(칩 → 그 카테고리 요청/저장본, 상품 → 기존 `openExternalApp`, 새로고침 → 강제 새로 받기 + 기존 토스트). 덮는 범위 = **카테고리 칩 줄부터 탭 맨 아래**(안내 상자와 쿠팡 검색 입력줄은 웹 — 입력칸은 아직 네이티브가 아님). 탭 전환·키보드로 사각형이 연달아 바뀌는 동안·팝업이 덮는 동안은 숨겨 웹이 이어받는다. 안전장치: show 거절·`error`(예외)·첫 그림 8초 지연·상태 3번 이상 → 즉시 웹, 연속 2번이면 다음 실행부터 웹. 웹 쇼핑(`renderShop`)은 늘 뒤에서 그려져 있다. 네이티브가 쇼핑을 맡는 동안 예전 `sh:*` 영역은 쉰다(`shOwned()`). 다른 카테고리는 한가할 때 미리 받아 저장 → 칩을 누르면 곧바로 바뀐다. **설정 카드 '네이티브 쇼핑 화면'(기본 꺼짐)**, 안드로이드 앱에서만 보임.
- **버그 발견·수정**: 앱 `_shopScore` 의 테마 글자가 `'캔핑나들이'`(캔) 로 오타라 캠핑 테마의 주말 +18·비 -60/-25 점수가 **한 번도 적용되지 않았다**(상품 데이터는 '캠핑나들이'). 앱·엔진 모두 '캠핑나들이'로 맞췄다 → 주말엔 캠핑 상품이, 비 오는 날엔 덜 올라온다(의도된 동작).

**시험(전부 통과)**: `shop_engine.test.js` 264(앱 `_shopPick` 원본 코드를 vm 으로 돌려 **엔진과 같은 입력 60가지(날짜·시각·날씨·운영설정)에서 추천 100선·카테고리 순서가 같음**, 화면 JSON 모양, 위험한 링크 제외, 워커 끝에서 끝까지(가짜 상품서버·날씨) 6개, 워커 내장 사본 = `engine/shop.js`) · `screen_native.test.js`(JVM 자체 점검 69개 — 파서 거절·검증·배치·눌림·1000장 배치 14ms·범위 찾기 10만 번 17ms; 안드로이드 계층 컴파일은 CI) · `screen_native_js.ui.test.js` 23(꺼짐=호출 0 · JSON 글 그대로 전달 · 사각형 · 칩/열기/새로고침 · 저장본 즉시 · 네트워크 끊김 · 틀린 JSON 3가지 · 덮임/탭 이동/움직임 · 8초 지연 · 스위치). 이웃: `htl_native_js` 35 · `tabs_smoke` 53 · `day_preset_shop_wx` · `shop_version` · `cong_scene` 20 · `journey_e2e` 27 · `cong_card` 11 · `transfer_row` 7 · `route_row` 11(부하에서 1회 흔들림, 단독 통과) · `scene_native_js` · `loading_chars` 45 · `latent_refs` · `keyboard_pan` 통과.

**YJ가 해야 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s41) 전체를 붙여 넣고 Deploy. 확인: 루트 `version` = `route-v2-2026-10-18s41`, `…/screen/shop?cat=추천` 이 `ok:true` JSON. 그 뒤 APK 를 받아 설정 → '네이티브 쇼핑 화면' 켜기. (새 워커는 필요 없다.)
**실기기 미검증(정직)**: 안드로이드 계층(`ScreenView`·플러그인)은 로컬에 `android.jar` 가 없어 문법만 확인, 실제 컴파일은 CI. ① 스크롤 120Hz 체감·관성 ② 글꼴 폭 차이로 말줄임 위치 ③ 그림 로딩 속도·깜박임 ④ 웹→네이티브 전환 시 겹침(칩 줄 위쪽 간격 4px 가정) ⑤ 키보드 올라올 때(검색줄 입력) 숨김/복귀 ⑥ 다크/파스텔 색. 엔진의 `rain` 값이 앱 날씨(`_wxMem`)와 같은 필드인지는 같은 `/weather` 응답이라 가정(실제 값은 라이브에서 확인).
**다음**: 쇼핑 검색 입력줄(네이티브 EditText) → 설정 → 맛집 → 커뮤니티 → 하단 탭 막대 순으로 같은 틀(`ScreenCore` 노드 종류 추가 + 엔진 화면 JSON)로 옮긴다. 노드가 늘 때는 `ScreenJvmTest` 와 `screen_native_js` 에 검증/폴백 시험을 같이 넣을 것(규격 변경은 `v` 를 올리고 옛 `v` 는 앱이 거절 → 저장본/웹으로 폴백).

## 2026-10-18 (밤 6) 서버 구동 네이티브 쇼핑 — 안내 상자·쿠팡 검색줄까지 (엔진 s42, `ScreenCore` 노드 `box`·`search`)
**목표**: 쇼핑 탭에서 웹으로 남아 있던 맨 위 두 조각(대가성 안내 상자, 쿠팡 검색 입력줄)을 네이티브로. 이제 네이티브가 **탭 맨 위부터** 덮는다. 계산은 엔진·앱은 그림 원칙 그대로.
- **엔진 `/screen/shop?cap=2`**: 앱이 `cap=2`(= 상자·검색줄을 그릴 수 있다)를 보내면 `head` 가 `[box, search, chips]` 이고 `cover:'tab'`. 안 보내면(옛 앱) 예전 모양 그대로 `[chips]`. → **엔진을 먼저 배포해도, APK 를 먼저 받아도 서로 안 깨진다**(옛 APK + 새 엔진 = 칩만 / 새 APK + 옛 엔진 = 예전처럼 칩 줄부터 덮고 안내·검색줄은 웹). 저장본이 옛 모양이면 새 응답이 올 때 사각형을 다시 재서 `setRect`.
  · 검색 주소 템플릿(`https://www.coupang.com/np/search?q={q}`)과 파트너스 추적 링크(`https://coupa.ng/coRT4D`, 검색어 없이 누르면 이 링크 → 수수료 인식)는 **엔진이 정한다**(`SHOP_SEARCH_TPL`/`SHOP_PARTNER_URL`). 웹은 앱을 여는 일(`_openCoupangQuery(q, tpl)` 의 AppLauncher/intent/웹 순서)만 한다. 웹의 옛 상수와 같은 값인지 `shop_engine.test.js` 가 대조.
  · 대가성 문구는 `shopRich` 로 글 + 굵은 구간(`hl`)을 엔진이 만든다(웹과 같은 두 곳이 굵게).
- **`ScreenCore`(검증·배치)**: `box{pad,ip,s,hl,size,lh,color,fill,line,r}` · `search{pad,max,hint,badge,accent,maxlen,act:{a:'search',tpl,empty}}` · `screen.cover`. 색은 역할 이름 또는 CSS 색(읽을 수 없으면 화면 전체 거절). `search` 행동은 tpl 에 `{q}` 가 있는 http(s) 와 http(s) empty 가 없으면 거절. 머리 조각은 `fixed`(상자·검색줄)와 칩(가로로 밈)으로 나뉘고 `chipsTop/chipsBot` 이 칩 줄 범위. 굵은 구간은 줄바꿈 뒤 줄별 조각(`segs/segBold`)으로 미리 쪼개 그릴 때 새 객체를 안 만든다(줄바꿈은 굵은 폭으로 재서 넘치지 않게). 모르는 노드는 건너뛴다 → 옛 앱이 새 JSON 을 받아도 칩만 그림.
- **`ScreenView`**: 상자·검색줄(알약·C 배지·돋보기 단추) 그리기. 검색 입력은 **진짜 `EditText`**(한글 조합·붙여넣기·키보드 검색 키는 안드로이드가 한다)를 검색줄 입력 자리에 올린다 — 뷰가 안 보이거나 잘리면(clip) 내리고, 목록을 밀기 시작하거나 칩을 누르면 키보드를 내린다. 검색 키/돋보기 단추 → 플러그인 `action {a:'search', v:검색어, url:tpl, empty}`. 머리는 칩 줄에서만 가로로 밀린다.
- **웹 접착(`_scrShop`)**: 요청에 `&cap=2`, 사각형 위쪽은 `cover==='tab'` 이면 탭 맨 위. 플러그인 `input` 이벤트(검색 입력 포커스)가 켜져 있는 동안은 **키보드가 올라와 웹뷰 크기가 연달아 바뀌어도 숨기지 않고 따라간다**(안 그러면 키보드가 켜지자마자 네이티브가 숨겨져 키보드가 닫힌다).
- **시험**: `ScreenJvmTest` 109(+40: 검증 거절 12종·머리 배치·검색줄 자리·굵은 구간 조각·고정/밀림 눌림·옛 앱 건너뜀) · `shop_engine` 277(+13: cap 유무·문구·검색 주소/링크 = 웹 값·워커 cap) · `screen_native_js` 29(+6 ⑧: cap=2 요청·옛 엔진·저장본 cover 전환·검색 행동 2종·입력 중 숨김 안 함) · `screen_native` 7(+1: EditText·검색 키·길이·포커스·잘림·키보드 내리기).
- **기기 미검증(정직)**: 안드로이드 계층(`EditText` 얹기·z순서·IME)은 로컬에 `android.jar` 가 없어 문법만 눈으로 점검, 실제 컴파일은 CI. 실기기에서 확인: ① 입력칸이 알약 안 제자리에 정확히 얹히는지(1px 어긋남·글자 높이) ② 키보드가 올라올 때 웹뷰가 줄어드는 방식(adjustResize/Pan)에서 네이티브 뷰·입력칸이 따라오는지, 입력 중 깜박임 ③ 검색 → 쿠팡 앱/웹 열림 ④ 다크/파스텔에서 입력 글자·힌트 색 ⑤ 안내 상자 줄바꿈 위치가 웹과 같은지(굵은 글자 폭으로 재서 웹보다 한 줄 더 나올 수 있음).
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s42) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-18s42`, `…/screen/shop?cap=2` 의 `head` 가 `box,search,chips`. 새 APK 에서 설정 '네이티브 쇼핑 화면'이 켜져 있으면 바로 적용.
- **다음**: 설정 탭(스위치·입력칸 노드 필요: `switch`, `field` 등) → 맛집 → 커뮤니티 → 하단 탭 막대. 노드를 늘 때는 지금처럼 `cap` 을 올려(3…) 옛 앱과 새 엔진이 서로 안 깨지게 할 것.


## 2026-10-18 (밤 7) 서버 구동 네이티브 화면 2호 — 설정 탭 (엔진 s43 `/screen/settings`, `ScreenCore` 노드 8종 추가, 앱 접착 `_scrSet`)
- **범위(YJ 선택: '사용자용 카드만 네이티브')**: 커뮤니티 아이디(입력칸·저장·삭제) · 알림 설정 3종 + 권한 거부 안내 · 갤럭시 절전(웹 카드 시트로) · 부드러운 노선도/캐릭터 장면/네이티브 경로 화면/쇼핑 화면/**설정 화면** 스위치 + 상태 문구 · 도착 오차 기록 · 테마 고르기 · 약관/오류 로그. 입력이 많거나 시험용인 카드(출퇴근 브리핑·캐릭터 시계 위젯·하차 5분 전 추천 시험·다른 앱 위에 표시·개발자 도구·갤럭시 절전)는 `›` 행으로 두고, 누르면 **기존 웹 카드를 그대로 '웹 카드 시트'로 옮겨** 연다(아이디·핸들러가 그대로 살고, 닫으면 제자리로 돌아감, 안드로이드 뒤로가기는 시트부터 닫음).
- **엔진**(`engine/settings.js` + `engine/settings-worker.js`, 내장 `node tools/engine/embed-shop.js --version route-v2-2026-10-18s43` — 이 도구가 이제 쇼핑·설정 두 블록을 내장): `GET /screen/settings?cap=3&f=<기기 사실 JSON>`. **앱은 사실만 보낸다**(아이디·알림 켜짐·권한 거부·테마·갤럭시·오류 개수·기능 스위치 `feat.{nm,sn,htl,scr,scrs}={h,on,f,w,b}`); 무엇을 어떤 순서·문구로 보일지(켜짐/꺼짐/문제/저장본 사용 문구 포함)는 전부 엔진이 정해 화면 JSON(`cover:'tab'`)으로 내린다. 사실이 이상해도(긴 아이디·엉뚱한 타입) 걸러서 기본값으로. 같은 입력 → 같은 출력, `rev` = 본문 해시. 새 화면 글에는 이모지를 쓰지 않는다. `cap` 3 미만이면 `{ok:false}` — 옛 앱은 이 경로를 아예 부르지 않는다.
- **`ScreenCore`(검증·배치) 새 노드**: `panel{kids}`(안에 panel/grid/chips/search 금지, 모르는 자식은 건너뜀) · `toggle{key,title,sub,on,big,top,onc}`(행동 `set`) · `navrow{title,sub,act,top}` · `select{title,sub,on,act:{a:'sel'},fill,line,onl,chk,ckf,prev[5]}` · `field{key,hint,value,maxlen,h}` · `box.tc`(글자색) · `button{fill,line,tc,bold,r}` 변형 · 색 역할 `border2`/`none`. 새 행동: `set{key}` · `call{v}` · `web{v}` · `sel{v}` (v/key 는 영문·숫자·`_.:-` 40자). 레이아웃은 `stack()` 재귀(패널 안 자식은 패널 안쪽 폭), 눌림은 `Layout.hits`(스위치는 스위치+8dp 만).
- **`ScreenView`**: 패널·스위치(켜짐 색 `onc`, 꺼짐 `border2`)·이동줄·고르기 카드(미리보기 5색+체크 원)·입력칸 그리기. **스위치는 누르면 화면이 바로 뒤집히고**(`pi.on = !pi.on`) 플러그인 `action {a:'set',key,on}` 으로 알린다 — 앱이 진짜 설정을 바꾼 뒤 엔진 새 화면이 오면 그걸로 덮어쓴다(못 바꿨으면 제자리로). **입력칸(`field`)은 평소엔 캔버스가 글자만 그리고, 눌렀을 때만 진짜 `EditText` 를 그 자리에 올린다**(편집 중엔 키보드로 웹뷰가 줄어도 칸이 보이게 자동 스크롤, 끝나면 글자를 `fields` 에 보관하고 입력칸을 뗀다). 모든 `action` 이벤트에 `fields`(키→글자)가 실린다. 플러그인에 `toast({text})` 추가(웹 toast 는 네이티브 뷰 밑에 가려지므로 기기 토스트로).
- **웹 접착(`_scrSet`, `www/index.html`)**: 기본 꺼짐 스위치(설정의 '네이티브 설정 화면' 카드 `scrsSetCard`, 키 `gdm_scrs_on/fail/why/c`). 사각형 = `#settingsTabView` 전체. 기기 사실 수집(`facts()`: 읽기만) → `fetch ?cap=3&f=` → 받은 글 그대로 `show/update`(id `settings`). 사실이 바뀌면(0.7초마다 읽음) 새로 받아 제자리 갱신(스크롤 유지). 저장본은 **기기 사실이 같을 때만** 곧바로 그리고 그 뒤 엔진 최신본으로 한 번 갱신. 행동은 **허용 목록만**: `set`(알림 3종·`rl`·`f.nm/sn/htl/scr/scrs` → 기존 setter), `call`(`saveId`: 입력칸 글자 `fields.cid` → `#commIdInput` → `_saveCommId`, `clearId`, `pol.privacy|location|opensource`, `errlog`), `sel`(`applyTheme`), `web`(시트). 약관·오류 로그·시트가 덮으면(`covered`) 네이티브를 숨기고 웹이 이어받는다. 실패는 쇼핑과 같은 규칙(8초 ready 지연·status 이상·플러그인 오류 → 웹, 연속 2번이면 다음 실행부터 웹). 네이티브 설정이 탭을 맡는 동안 밤 4 의 `ss:*` 글자 영역은 쉰다(`ssOwned`).
- **시험**: `ScreenJvmTest` 154 · `settings_engine` 61(모양·숨김 규칙·**서로 다른 사실 64가지로 만든 화면이 모두 앱 검증기(`ScreenCheck.java` → `ScreenCore.load`+배치)를 통과**·웹 문구 = 엔진 문구·워커 내장 사본·워커 끝에서 끝까지) · `screen_set_js.ui` 27(플러그인 없음/꺼짐=호출 0·사실 전송·사각형·스위치 set·아이디 저장/삭제/거절·토스트 복원·테마·시트 열기/닫기/뒤로가기·약관·덮임·입력 중 안 숨김·저장본 사실 일치·폴백) · `screen_native` 8(+설정 노드). CI 매트릭스에 `settings_engine`·`screen_set_js.ui` 추가.
- **기기 미검증(정직)**: 안드로이드 계층(`ScreenView`/`ScreenNativePlugin` 의 패널·스위치·입력칸 편집·토스트)은 로컬에 `android.jar` 가 없어 눈으로만 점검, 실제 컴파일은 CI. 실기기에서 확인: ① 스위치 눌림 감 + 켜짐/꺼짐 색(파스텔에서 `border2`) ② 입력칸을 눌렀을 때 키보드가 올라오며 칸이 가려지지 않는지·입력 글자 위치가 칸과 맞는지 ③ 아이디 저장 후 기기 토스트 ④ 웹 카드 시트(출퇴근 브리핑의 역 자동완성 목록·시간 고르기 팝업, 시계 위젯 슬라이더)가 시트 안에서 정상인지 ⑤ 약관 팝업이 네이티브 위로 뜨는지(네이티브가 숨겨지는지) ⑥ 긴 화면의 스크롤 부드러움.
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s43) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-18s43`, `…/screen/settings?cap=3` 가 `ok:true`. 새 APK 의 설정 탭 안 '네이티브 설정 화면' 스위치를 켜면 적용(기본 꺼짐).
- **다음**: 맛집 → 커뮤니티 → 하단 탭 막대. 노드를 늘 때는 `cap` 을 올려(4…) 옛 앱과 새 엔진이 서로 안 깨지게 할 것.


## 2026-10-18 (밤 8) 서버 구동 네이티브 화면 3호 — 맛집 탭 (엔진 s44 `POST /screen/food`, `ScreenCore` 노드 3종 추가, 앱 접착 `_scrFood`) + 네이티브 글꼴 = 웹 Noto Sans KR
- **글꼴(YJ: '네이티브 글자가 너무 작아 — 기존 웹과 같은 크기로')**: 웹이 쓰는 Noto Sans KR 400/700 을 CI 가 받아 `assets/fonts/NotoSansKR-{Regular,Bold}.ttf` 로 넣고(가변 글꼴 인스턴스화 + 한글 부분집합, 단계 'Bundle Noto Sans KR') `ScreenView.face(bold)` 가 쓴다(없으면 기기 기본). 재기·그리기·입력칸·`HtlView` 모두 같은 글꼴. 크기 숫자 자체는 웹과 같다 — 그래도 작으면 크기를 따로 조정할 것(기기 미검증).
- **범위**: 맛집 탭 전체(머리줄 '도착역 맛집 ○○역 인근' + 새로고침, 칩 6개, 순위·별점 카드, 공공데이터 구분선·카드, 안내/빈 상태 문구). 가게를 누르면 **기존 웹 지도(`_foodShowMap`: 도보 길찾기·네이버/카카오 앱 열기)를 '시트'에 띄운다**(뒤로가기는 시트부터). 가게 목록을 받아 오는 일(내장 STN_FOOD · 맛집 서버 · 공공데이터 API)은 예전 그대로 웹이 한다.
- **엔진**(`engine/food.js` + `engine/food-worker.js`, 내장 `node tools/engine/embed-shop.js --version route-v2-2026-10-18s44` — 쇼핑·설정·맛집 세 블록): `POST /screen/food` (본문 JSON 글, `Content-Type: text/plain` 으로 보내 사전 요청 회피) `{cap:4, f:{stn,st,flt,fail}, c:[[이름,업종,주소,거리]…], p:[…]}`. **업종 분류(`foodKind`, 웹 `_foodKind` 와 표본 대조)·칩 거르기·위쪽과 중복인 공공데이터 제거·순위·별점·거리 글·주소 끝 두 마디·'길찾기 · 지도 →'·빈/로딩/실패 문구·화면 구성은 전부 엔진**. 눌린 가게 번호(`fm.c.<n>`/`fm.p.<n>`) = 앱이 보낸 배열의 원래 위치. 위·아래 각각 150곳, 입력은 위 400 / 아래 1500 까지, 본문 600KB 한도.
- **`ScreenCore` 새 노드(cap 4)**: `bar{title,sub,btn,act}`(머리줄: 제목 + 같은 줄 금색 작은 글(좁으면 아래 줄) + 오른쪽 알약 단추, 단추만 눌림) · `place{rank,pub,name,sub,stars,badge,dist,go,act}`(장소 카드 — 웹 `.food-card` 치수) · `divider` · `chips.onc/onfg`(켜진 칩 바탕·글자색; 없으면 예전 주황 → 쇼핑 그대로, 지정하면 꺼진 칩도 카드색 바탕). 이모지 대신 ★ 글자.
- **웹 접착(`_scrFood`, `www/index.html`)**: 기본 꺼짐 스위치(설정 '네이티브 맛집 화면' 카드 `scrfSetCard`, 키 `gdm_scrf_on/fail/why/c`; 설정 엔진 `SETTINGS_FEATS` 에 `scrf` 추가). 사각형 = `#tab-food` 전체. 웹은 지금 상태를 사실로만 적는다(`_foodUi(stn, st)`: idle/locating/noperm/loading/none/ready) → 가게 목록이 바뀔 때(`_renderFoodList` 시작에서 `changed()`) 80ms 모아 한 번 요청 → 받은 글 그대로 `show/update`(id `food`). 같은 요청(칩을 오감)은 이번 실행의 기억에서 네트워크 없이, 같은 요청의 저장본은 처음 열 때 바로. 탭을 막 열어 아직 '경로 없음'이면 450ms 기다려 안내 문구가 깜빡이지 않게. 시트·팝업이 덮는 동안은 네이티브 숨김(그 사이 바뀐 목록은 쌓았다가 올림). 하차 추천의 '맛집 보기'(`_arrOpenPlace`)는 `openNamed` 로 받아 둔 목록에서 이름으로 찾아 같은 시트를 연다. 켜진 동안 예전 `fd:*` 영역은 쉰다(`fdOwned`). 웹 목록은 늘 뒤에서 그려진다(폴백).
- **시험**: `ScreenJvmTest` 184(+30: 맛집 노드 검증 거절·머리줄/카드/구분선 치수·눌림·긴 이름·300장 시간) · `food_engine` 91(분류 = 웹 `_foodKind`·상태별 문구·거르기/중복/번호/별점/한도·**상태 6×칩 6×실패 2×자료 3 + 큰 목록이 모두 앱 검증기 통과**·워커 내장 사본·워커 POST 끝에서 끝까지) · `screen_food_js.ui` 27(플러그인 없음/꺼짐=호출 0·요청 모양·그대로 show·칩/새로고침/데이터 변화·연속 변화 1회 요청·가게→시트→뒤로가기·덮임·저장본/틀린 응답/엔진 다운/오류 폴백) · `screen_native` 10. CI 매트릭스에 `food_engine`·`screen_food_js.ui` 추가.
- **기기 미검증(정직)**: 안드로이드 계층(`drawBar`/`drawPlace`/칩 색)은 로컬에 `android.jar` 가 없어 눈으로만 점검, 실제 컴파일은 CI. 실기기에서 확인: ① 새 글꼴이 웹과 같은 크기·굵기로 보이는지(설정·맛집·타임라인) ② 머리줄 제목/작은 글 밑선·알약 단추 모양, 카드 줄 간격·★ 글자 폭 ③ 칩을 누른 뒤 새 목록이 올 때까지(네트워크 왕복, 같은 칩 재선택은 즉시) 체감 지연 — 길면 칩 누름 즉시 표시를 앱 쪽에 넣거나 목록 요청 크기를 줄일 것(요청은 가게 최대 1100곳 ≈ 수십~200KB) ④ 가게 → 지도 시트 → 뒤로 → 네이티브 복귀 때 스크롤 위치 ⑤ 스크롤 부드러움(카드 150~300장).
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s44) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-18s44`. 새 APK 의 설정 탭 안 '네이티브 맛집 화면' 스위치를 켜면 적용(기본 꺼짐; s44 가 배포돼야 켜진다 — 안 되면 알아서 웹 맛집 화면으로 돌아간다).
- **다음**: 커뮤니티(실시간소통·게시판·뉴스) → 하단 탭 막대. 설정에 남은 웹 카드(출퇴근·위젯·시험·오버레이·개발자)도 나중에 노드로.

## 2026-10-18 (밤 9) 서버 구동 네이티브 화면 4호 — 커뮤니티 > 뉴스 (엔진 s45 `POST /screen/news`, `ScreenCore` 노드 1종 추가, 앱 접착 `_scrNews`)
- **YJ 지시 재확인**: "모든 계산은 엔진이, 앱이 그림을 그린다는 규칙 유지". 그래서 웹 `index.html` 에 있던 **뉴스 분류 규칙(`_NEWS_RULES`)·잡음/묶음 기사 거르기·제목+링크 중복 정리·HTML 글자 코드 풀기·'전체'에서 분류를 돌아가며 뽑기(200)·3일 컷·'N분 전' 문구·상세 팝업의 요약 정리(`_newsCleanDesc`)·언론사 이름(`_newsSourceLabel`)·안내 글·화면 구성은 전부 엔진**(`engine/news.js` 가 웹 코드를 글자 그대로 옮긴 것 + 새 부분; `news_engine.test.js` 가 웹 함수와 같은 결과인지 표본 대조). 앱 접착 코드는 분류·시간·요약·언론사 계산을 하지 않는다(시험이 접착 구간에 그런 함수 이름이 없는지 검사).
- **범위**: 커뮤니티 칩 줄(실시간소통·게시판·뉴스·설정)은 **웹 그대로**, 그 아래 뉴스 칩 8개(전체·증시·경제·사회·정치·연예·스포츠·IT) + 기사 목록(최대 300줄, '전체' 200)을 네이티브로. 기사를 받아 오는 일(서버 `/news/all`·`/newsfeed`·저장본·`_newsMerge`)은 예전 그대로 웹. 기사를 누르면 **엔진이 준 상세 문구**(분류 딱지·제목·'N분 전 · 언론사'·정리된 요약 또는 안내·출처 안내·'○○ 원문 보기 ›')로 웹 팝업(`#newsDetailOv`)을 띄우고 원문은 인앱 브라우저(`_newsOpenInApp`). 엔진 상세 응답이 없으면 예전 `_openNewsDetail`. 뒤로가기는 팝업부터.
- **엔진**(`engine/news.js` + `engine/news-worker.js`, 내장 `node tools/engine/embed-shop.js --version route-v2-2026-10-18s45` — 쇼핑·설정·맛집·뉴스 네 블록): 목록 `POST /screen/news` `{cap:5, f:{cat}, n:[[제목,링크,언론사,시각ms,서버분류,요약]…]}` → 화면 JSON(`screen:'news'`, head=칩 1줄, body=`news{title,sub,act:{a:'call',v:'nw.<번호>'}}` 줄들 + 간격, 번호 = 앱이 보낸 배열의 원래 위치). 상세 `{cap:5, d:기사}` → `{detail:{cat,title,meta,desc,empty,src,notice,btn,close,open}}`. 시각은 **엔진 시계**(Date.now) — 요청에는 5분 단위 구간을 해시에 넣어 같은 목록도 5분이 지나면 새로 받는다('N분 전'이 낡지 않게). 본문 한도 1.5M 글자, 기사 1200건·300줄 한도. 설정 엔진 `SETTINGS_FEATS` 에 `scrn` 추가.
- **`ScreenCore` 새 노드(cap 5)**: `news{pad,title,sub,act}` — 금색 막대(3) · 제목(14 굵게, 최대 4줄 …) · 작은 글(11) · 오른쪽 › · 아래 가는 선(웹 `.news-row` 치수: 위아래 13, 좌우 4, 간격 10). 칩은 기존 `chips`(onc 'gold', onfg #121214).
- **웹 접착(`_scrNews`, `www/index.html`)**: 기본 꺼짐 스위치(설정 '네이티브 뉴스 화면' 카드 `scrnSetCard`, 키 `gdm_scrn_on/fail/why/c`). 사각형 = 커뮤니티 칩 줄 아래 ~ 탭 맨 아래(`#filterRow` 하단 기준). `_commFilter==='뉴스'` + `#commScrollView` 보임일 때만 올라오고, 게시판/실시간소통/설정/다른 탭으로 가면 숨김(`filterCat`·`showChatTab`·`showSettingsTab`·`switchTab` 끝에서 `kick()`). 네이티브가 맡는 동안 웹 뉴스 줄은 비우고(`webClear`) `_renderNewsTab` 은 아무것도 안 만든다(`owns()` → `changed()` 만) — 실패/끄기 시 `webBack()` 으로 곧바로 다시 만든다. 기사가 바뀔 때(`_newsMerge` 끝) 80ms 모아 한 번 요청. 같은 요청은 기억에서, 같은 칩의 저장본은 처음 열 때 바로(**저장본 화면은 줄이 눌리지 않는다** — 새 응답이 오면 눌림; 저장본에는 어느 기사인지 풀 스냅샷이 없어서). 막 열었는데 기사가 아직 없으면 450ms 기다림(깜빡 '불러오는 중' 방지).
- **한계**: 네이티브 위에서는 **좌우 스와이프로 탭/카테고리 넘기기가 안 된다**(칩을 누른다). 기사 요청이 최대 1200건(≈ 수백 KB; 보통 ~300KB)이라 칩을 처음 누를 때는 네트워크 왕복이 든다(같은 칩 재선택은 기억에서 즉시) — 길면 칩 누름 즉시 표시나 요청 줄이기(서버가 기사를 들고 있게 해서 칩 이름만 보내기) 필요.
- **시험**: `ScreenJvmTest` 197(+13: 뉴스 노드 검증·치수·4줄 …·눌림·300줄 시간) · `news_engine` 111(웹 함수 대조 — 분류 504건·잡음·디코드·요약·언론사·'N분 전' / 거르기·중복·3일 컷·골고루·번호·상세 문구 / **칩 8×자료 3 화면이 모두 앱 검증기 통과**·워커 내장 사본·이름 충돌 없음·워커 POST 끝에서 끝까지) · `screen_news_js.ui` 24(플러그인 없음/꺼짐=호출 0·요청 모양·그대로 show·사각형·웹 줄 비움·칩/기사/상세 팝업/원문 열기/뒤로가기·연속 변화 1회 요청·탭/칩 전환 숨김·덮임·저장본(눌림 없음→갱신 후 눌림)·틀린 응답/엔진 다운/오류 폴백·상세 폴백) · `screen_native` 11. CI 매트릭스에 `news_engine`·`screen_news_js.ui` 추가.
- **기기 미검증(정직)**: 안드로이드 계층(`drawNews`)은 로컬에 `android.jar` 가 없어 눈으로만 점검, 실제 컴파일은 CI. 실기기에서 확인: ① 뉴스 줄 제목 줄바꿈·막대·› 모양이 웹과 같은지 ② 칩 줄이 웹 칩 줄 바로 밑에 붙는지(사각형 위쪽 경계) ③ 칩 첫 클릭 지연 ④ 스와이프 불가가 거슬리는지 ⑤ 기사 → 팝업 → 원문 브라우저 → 돌아오면 네이티브 복귀 ⑥ 300줄 스크롤.
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s45) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-18s45`. 새 APK 의 설정 탭 '네이티브 뉴스 화면' 스위치를 켜면 적용(기본 꺼짐; s45 배포 전이면 알아서 웹 뉴스로 돌아간다).
- **다음**: 커뮤니티 게시판(글 목록·펼침·댓글·공감·글쓰기) → 실시간소통(채팅 방·입력) → 하단 탭 막대. 뉴스 칩 줄 스와이프는 필요하면 네이티브 제스처로.

## 2026-10-18 (밤 10) 서버 구동 네이티브 화면 5·6·7호 — 커뮤니티 > 게시판 · 실시간소통 + 하단 탭 막대 (엔진 s46 `POST /screen/board|chat|tabs`, `ScreenCore` 노드 6종·`foot`·`anchor` 추가, 앱 접착 공용 틀 `_scrKit`)
- **YJ 지시**: "1,2,3 한번에 실행해" + "최종목표는 웹으로 구동되는 것은 하나도 없는거야" + "모든 계산은 엔진이, 앱이 그림을 그린다". 세 화면을 한 번에 했고 각각 설정 스위치(기본 꺼짐)·cap 6.
- **엔진**(`engine/board.js`·`chat.js`·`tabs.js` + `*-worker.js`, 내장 `node tools/engine/embed-shop.js --version route-v2-2026-10-18s46` — 이제 7블록): 
  · 게시판 `POST /screen/board` `{cap:6, f:{n,st,arm,rx,rep}, p:[[번호,분류,제목,본문,글쓴이,시각,조회,좋아요,ㅋㅋ,ㅠㅠ,서버댓글수,표시비트(1내글·2이용자·4전송대기·8서버·16뉴스),링크,댓글들]…]}` → 뉴스 글·신고한 글 빼기(웹 `_isNewsPost` 와 같은 판정)·최신순·제목 끝 지역 괄호 지우기·분류 딱지 색(웹 CAT_COLOR)·메타 줄('전송 대기 · N분 전 · 조회 · 댓글'; `_timeAgo` 와 같다)·반응/삭제/신고 단추 글('삭제 확인'/'신고 확인' 두 번 누르기 상태는 앱이 `arm` 으로 보낸다)·댓글/답글 줄·'더 보기 · 남은 글 N개'를 정해 `post{kids}` 노드로 내려준다. 행동 `bd.lk|lo|sd|dl|rp|cm.<번호>`·`bd.more`·`bd.write`, `info.ids/idx`(글 id ↔ 보낸 배열 번호).
  · 실시간소통 `POST /screen/chat` `{cap:6, f:{sel,mine,lc,st,tzo,me,hid}, d:{g,r,off,offOk,offAt,al}}` → 칩 순서(전체→내 노선→나머지; 웹 `_chatItems`)·노선 색·공식 공지/지연 제보 배너 문구(웹 `_offText`/`_lrRenderOfficial`/`_lrRenderAlert` 를 이모지 없이)·말풍선(전체 방은 `(노선)` 접두, 노선 방은 지연/혼잡 딱지·남의 글 신고)·시각 HH:MM(기기 시간대 `tzo`)·빈/불러오는/실패 문구·아래 고정 입력줄을 정한다. `anchor:'bottom'`. 행동 `ch.send`·`ch.x.<번호>`·칩 `cat`.
  · 탭 막대 `POST /screen/tabs` `{cap:6, f:{tab,badge}}` → 5칸(커뮤니티·노선도·홈·쇼핑센터·맛집; 아이콘 경로는 웹 `.bnav` SVG 와 글자 그대로 — 시험이 대조) · 행동 `tab.<이름>`.
  · 설정 엔진 `SETTINGS_FEATS` 에 `scrb`·`scrc`·`scrt` 추가(설정 화면 스위치).
- **`ScreenCore`/`ScreenView` 새 기능(cap 6)**: 노드 `post`(펼침 카드 — 머리만 보이다 누르면 그 자리에서 아코디언으로 펼침, 한 번에 하나, 스크롤 고정; `tog` 행동은 앱이 바로 처리하고 `onSet` 으로 알림)·`cmt`(댓글, `ind` 답글)·`btnrow`(작은 단추 줄, 좁으면 `right` 단추가 둘째 줄로)·`inbar`(입력칸+단추; 키보드 보내기도 단추)·`msg`(말풍선 — 내 글 오른쪽)·`tabbar`(아이콘 경로를 코어가 파싱: M L C Z 절대 좌표 + 호는 곡선으로) + 칩 항목 색 `c` + 팔레트 `card2`·`nav` + 화면 `foot`(맨 아래 고정 줄 — 키보드가 올라와도 입력줄이 위로 따라옴) + `anchor:'bottom'`(처음·맨 아래 80dp 안일 때 새 글이 오면 맨 아래로). 플러그인 `setField({id,key,value})`(보낸 뒤 입력칸 비우기).
- **웹 접착**(`www/index.html`, 공용 틀 `window._scrKit(cfg)` → `_scrBoard`·`_scrChat`·`_scrTabs`): 뉴스 접착과 같은 구조(캐시·기억·폴백·워치독·사각형 따라가기·덮임/움직임 숨김) + 입력 중(`input` 이벤트) 키보드로 웹뷰가 줄어도 숨기지 않기 + 원자료 바뀜 감시(`sig`). 글·대화를 받아 오는 일(서버 `/posts`·`/comments`·`/talks`·`/lroom` 6초 폴링)·보내는 일(`/post`·`/comment`·`/react`·`/report`·`/lreport`)·커뮤니티 아이디·욕설 검사는 **그대로 웹**(`dcAddComment(pid, 글자)`·`sendChatMsg(글자)`·`_lrSend(글자, 성공콜백)` 에 글자를 직접 받는 길을 추가했고 성공 여부를 돌려준다; 신고/삭제는 웹 `dcReport`/`dcDeleteMine` 를 껍데기 단추로 불러 같은 처리). 네이티브가 맡는 동안 웹 글 목록/말풍선은 만들지 않는다(`renderCommList`·`_renderChatTab`·`_lrAppend` 가 `owns()` 면 `changed()`/`feed()` 만) — 실패/끄기 시 `webBack()` 이 곧바로 다시 만든다. 반응은 이 기기에서 누르면 +1, 다시 누르면 취소(웹은 늘 +1 이었음 — 네이티브만 취소 가능). 탭 막대는 `.bnav`(position:fixed 라 `offsetParent` 대신 크기·보임으로 판단) 위에 덮이고 `tab.<이름>` → `switchTab`.
- **한계**: 아직 웹인 것 — 글쓰기 시트(`openWriteSheet`)·글 쓰기 후 팝업·삭제 실패 안내 일부·커뮤니티 칩 줄(실시간소통·게시판·뉴스·설정)·홈 탭·경로 입력/검색 등. 네이티브 위 좌우 스와이프로 칩 넘기기 불가. 데이터 계층(글/대화 받기·합치기·중복 거르기·6초 폴링)은 웹 JS 에 남아 있다(= 화면은 네이티브지만 WebView 가 살아 있어야 한다). 엔진 왕복이 필요한 눌림(반응·두 번 누르기·보내기 후 새 화면)은 ≈100~300ms 후 반영(체감 지연은 기기 확인 필요).
- **시험**: `ScreenJvmTest` 253 · `screen_native` 12 · `tabs_engine` 29 · `board_engine` 75 · `chat_engine` 74 (웹 함수 대조·거르기·두 번 누르기·배너 문구·tz·앱 검증기 통과·워커 내장 사본·이름 충돌 없음·워커 POST) · `screen_bct_js.ui` 19(플러그인 없음/꺼짐=호출 0·그대로 show·사각형·웹 목록 비움·펼침/반응/댓글/신고 2단계/더 보기/글쓰기·전체 방 보내기/방 칩/신고/방 보내기·탭 이동·폴백 3종·스위치 켜고 끄기). CI 매트릭스에 4개 추가.
- **기기 미검증(정직)**: 안드로이드 계층(`drawPostHead/drawCmt/drawRbtn/drawInbar/drawMsg/drawTab`·`foot`·`anchor`·아코디언 스크롤 보정·`setField`)은 로컬에 `android.jar` 가 없어 CI 컴파일로만 확인. 실기기에서 확인: ① 입력줄 터치 → 키보드 → 입력줄이 키보드 위로 올라오는지(채팅/댓글) ② 글 펼침/접힘 때 머리가 화면에서 안 튀는지 ③ 탭 막대가 웹 막대 자리에 정확히 겹치는지(키보드/`rs-up` 때 따라가는지) ④ 채팅 새 글이 맨 아래에 붙는지 ⑤ 반응·신고 눌림 지연 ⑥ 말풍선 폭/글꼴/아이콘 모양이 웹과 비슷한지 ⑦ 글 많을 때(300) 스크롤.
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s46) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-18s46`. 새 APK 설정 탭의 '네이티브 게시판 화면'·'네이티브 실시간소통 화면'·'네이티브 탭 막대' 스위치를 켜면 적용(모두 기본 꺼짐; s46 배포 전이면 알아서 웹으로 돌아간다). 아직 켜지 않았다면 s45 뉴스 스위치도.
- **다음**: 설정에 남은 웹 카드(출퇴근 브리핑·캐릭터 시계 위젯·하차 추천 시험·다른 앱 위에 표시·개발자 도구·갤럭시 절전)·홈 탭(경로 입력/검색·경로 카드)·커뮤니티 칩 줄·글쓰기 시트/팝업을 노드로. 최종 목표(WebView 없이 100% 네이티브)를 위해서는 데이터 계층(글/대화 받기·합치기·폴링·아이디/욕설 검사)을 엔진/네이티브로 옮기는 단계가 따로 필요하다.

## 2026-10-19 엔진 s47: 짧은 버스 한 구간 → 버스 환승이면 걷기로 (YJ 스크린샷: 검단대성베르힐 → 용두)
- **증상**: 순환83 을 검단대성베르힐→이음대로.대성베르힐 3분만 타고(두 정류장 사이 약 174m) 곧바로 1101 로 갈아타는 경로가 나왔다. 걸으면 되는데 버스를 타라고 한다.
- **원인**: s3 의 `HOP_WALK_M`(600m) 후처리는 '짧은 버스 한 구간 뒤에 곧장 걷는 길'(버스→도보)만 걷기로 바꿨다. 버스→버스 환승은 대상이 아니었다.
- **수정(`dijkstraRaw`, 같은 후처리 바로 뒤)**: 같은 노선이 아닌 버스를 이어 타는 한 구간이 `HOP_WALK_M` 안이면 걷기로 바꾼다. ① 그 구간이 출발 정류장(path[0])에서 시작하면 첫 정류장을 빼고 둘째 정류장을 출발점으로(접근 도보는 `starts` 에 이미 있고, 둘째 정류장 접근 도보가 첫째보다 500초 넘게 길면 바꾸지 않는다) ② 중간 구간이면 두 정류장 사이 도보 간선이 있을 때만 도보로. 조건이 안 맞으면 예전 그대로.
- **검증 상태**: 문법 검사만 통과. 합성 시험·실데이터 재현은 못 했다(운영 엔진이 s43 이고 같은 시각·출발점으로 순환83 경로가 재현되지 않았다 — 순환83 은 야간 시각표가 있을 때만 잡히는 것으로 보임). **배포 후 같은 출발지·목적지로 확인 필요**. ENGINE_VERSION `route-v2-2026-10-18s47`.

## 2026-10-19 서버 구동 네이티브 화면 8호 — 홈 탭 경로 입력 카드 (엔진 s48 `POST /screen/home`, `ScreenCore` 노드 확장 inbar·swap·sug, 앱 접착 `_scrHome`)
- **YJ 지시**: "모든 계산은 엔진이 앱은 그림만 그린다 유지" + "1. 홈탭 경로 입력 탐색부터 네이티브해". 설정 스위치(기본 꺼짐) '네이티브 경로 입력'(`scrh`).
- **범위**: 홈 탭 맨 위 카드 — 출발/도착 입력칸(동그라미·굵은 글·`위치 감지`·`경로 탐색` 단추)·출발↔도착 바꾸기 동그란 단추·자동완성 목록·기준시각 줄. **웹 카드(HTML)는 폴백으로 그대로 두고 네이티브가 그 위(`#homeRouteWrap`)를 덮는다.** 경로 결과 카드(타임라인·혼잡도 등)는 아직 웹.
- **엔진**(`engine/home.js` + `engine/home-worker.js`, 내장 `node tools/engine/embed-shop.js --version route-v2-2026-10-18s48` — 이제 8블록): `POST /screen/home` `{cap:7, f:{start,dest,active,startSet,destSet,gps,base:{ms,tzo,today,hol}}, d:{u:[{n,l}],b:[{n,d}],p:[{n,a}]}}` → 입력줄 2·바꾸기·분리선·후보 줄·기준시각 줄을 담은 `panel`. 엔진이 정하는 것: 후보 몇 줄을 어떤 순서·딱지·문구로(종류마다 3줄 먼저, 최대 7줄 — 지하철 → 버스 → 장소), 거리 글(m/km), `경로 탐색` 단추를 흐리게(`dim`)할지(출발·도착 글자 없고 고른 것도 없을 때), `위치 감지` → `감지 중`, 기준시각 문구('현재'|'오늘 오후 2:30'|'내일 …'|'10/25(일) …')와 평일/주말·공휴일, 기준시각을 골랐을 때만 `현재` 단추. 행동 `rt.gps|swap|go|enter` · `bt.pick|now` · `sg.<u|b|p>.<번호>`. `info.h` = 앱이 배치하는 높이와 같다(시험이 대조). 설정 엔진 `SETTINGS_FEATS` 에 `scrh` 추가.
- **`ScreenCore`/`ScreenView`/플러그인 새 기능(cap 7)**: `inbar` 확장(`dot` 동그라미 · `bold` · `bh`/`bsize` 단추 높이·글자 · `watch` 글자 바뀔 때 알림 · `dim` 흐린 단추 · `eact` 키보드 확인 키 행동) · `swap`(두 줄 경계 한가운데 얹힌 동그란 단추 — 높이 안 차지, 눌림은 뒤에서부터 찾아 위에 그려진 게 먼저) · `sug`(딱지+이름+작은 글+오른쪽 작은 단추, 높이 44). 플러그인 새 이벤트 `text {id,key,value,kind: focus|edit|blur}`(watch 입력줄만; 웹이 비운 글은 안 알림) · `size {id,h}`(그린 내용 높이 dp). 글자 입력은 기존 진짜 `EditText` 방식.
- **웹 접착**(`www/index.html`, `_scrHome`): 입력칸 글자는 웹 `fmapStartInp`/`fmapDestInp` 에 그대로 옮겨 적는다(예전 웹 로직이 같은 값을 읽음). 후보는 예전 `fmapSearch` 와 같은 자료(STNDB 걸러내기 · `_busStopSearchByName` · 카카오 `_kakaoLocal`, 300ms 디바운스)를 원자료로 엔진에 보낸다. 고르기는 예전 `_fmapSetLocation`, 단추는 `fmapGpsLocate`·`swapFmapRoute`·`fmapDoRoute`·`openDtPicker`·`clearBaseTime` 그대로. 감싸개 높이는 `size` 이벤트를 따른다(`flex-shrink:0; overflow:hidden`). 사각형은 홈 탭 스크롤 영역과 겹치는 부분만(`clip`) — 헤더/하단 탭 밑으로 스크롤되면 네이티브가 넘치지 않는다. 팝업(기준시각 선택 등)이 덮으면 자동으로 숨는다.
- **공용 틀 수정 2건**: ① `_scrKit.place()` 가 `id` 를 안 실어 `setRect` 가 늘 'shop' 화면으로 갔다(설정·맛집·뉴스·게시판·실시간소통·탭 막대 모두 — 높이/키보드로 사각형이 바뀌어도 따라가지 못하던 숨은 버그) → 모든 `place()` 에 `id` 추가. ② `place()` 가 `r.clip` 을 받는다.
- **한계**: 카드 위에서 시작한 손가락 끌기는 네이티브가 가져가서 홈 페이지가 안 스크롤된다(카드 바깥을 끌면 된다). 카드 높이는 웹보다 조금 크다(기준시각 줄 44). 후보 모으기(STNDB·TAGO·카카오)와 출발/도착 정하기·경로 찾기는 아직 웹 데이터 계층.
- **시험**: `ScreenJvmTest` 264 · `screen_native` 13 · `home_engine` 45(후보 고르기·기준시각 문구·앱 검증기 통과+높이==info.h·워커 내장·워커 끝에서 끝까지) · `screen_home_js.ui` 12(가짜 플러그인+엔진: 꺼짐/없음 무호출 · show · size→높이 · text→웹 입력칸·후보 모으기 · 고르기 · 경로/바꾸기/위치/기준시각 · 허용 목록 밖 무시 · 폴백 · 스위치).
- **기기 미검증(정직)**: 안드로이드 계층(`drawSug/drawSwap/drawInbar` 확장·`TextWatcher`·`onContentH`)은 로컬에 `android.jar` 가 없어 CI 컴파일로만 확인. 실기기에서 확인: ① 입력줄 동그라미·굵은 글·단추 모양이 웹과 같은지 ② 글을 쓰는 동안 자동완성이 끊기지 않는지(엔진 왕복 지연) ③ 바꾸기 단추 위치/눌림 ④ 키보드 올라올 때 카드가 따라가는지 ⑤ 기준시각 선택 팝업이 위에 뜨는지.
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s48) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-18s48`(s47 의 짧은 버스 → 걷기 수정 포함). 새 APK 설정 탭의 '네이티브 경로 입력' 스위치를 켜면 적용(기본 꺼짐).
- **다음**: 홈 경로 결과 카드 → 설정에 남은 웹 카드 → 커뮤니티 칩 줄 → 글쓰기 시트/팝업 → 데이터 계층을 웹뷰 밖으로.

## 2026-10-19 엔진 s49 — 환승완료 규칙 · 12초 정차 · :30 도착 · 버스 GPS(네비게이션식) · 영점 5초 · 위치감지 재탐색 (YJ 요청 묶음)
- **규칙(모두 엔진이 계산, 앱은 그림만)**
  · **환승완료/탑승 버튼 = 그 시각에 다음 대중교통을 탔다**. 누른 분을 기준으로 엔진(`/next-train op=late`)이 가른다: 시각표상 지금 분·한 분 전에 막 떠난 차가 있으면 그 차(`late`), 아니면 다음 차(`depMin`; 12분 넘게 멀면 건드리지 않음). 답의 시각 +30초를 승차역 통과(board)로 적고 시각을 다시 짠다(`_rsPressTrain`, 끄기 `_rsPickOff`). 다음 역에서 평소처럼 영점(GPS)이 바로잡는다. `_rsLateCheck` 가 이미 물은 답은 다시 묻지 않고 그대로 쓴다.
  · **버튼 바닥(`_rsFloor`)**: 누른 노드 아래로는 GPS 되돌림(`_pbOk`)·진행도 가드(`_progGuard`)·PF 채택(`_pfAdopt`)이 진행도를 내리지 못한다(원인: 18분 환승완료 → GPS 되돌림이 진행도를 내려 통과 기록이 지워져 17→27 로 감).
  · **지하철 역 정차 12초**(`stopDwellSec`/`markerDwellSec` = 12, 버스는 정차 없음 — GPS 기준): 도착하면 12초 동안 역 위(ratio 0, hold) → 그 뒤 이동. 정차 동안 GPS 영점. 
  · **시각표 도착 06:38 → 06:38:30 에 도착으로 확정**(`planSecOffset` 30) · 표시는 분 내림(`rounding:'floor'`). GPS 영점이 잡히면 그 통과 시각이 우선.
  · **환승 버튼이 떠 있는 동안 오버레이 마커는 환승 칸(도보)에서 기다린다**(`_ovlXferCell`, `out.xfer`).
- **버스(네비게이션식)** — `engine/ride-track.js` 에 `motion`(최근 14초 좋은 좌표 순 이동 속도 → moving true/false/null)과 `busPos`(같은 구간 `plan.stops[].lg` 의 버스 정류장을 이은 선 위 위치·이미 지난 정류장 `passed:[{i,ms}]`(선 위 거리로 초 단위 보간)·`passedUnknown`) 추가. 앱: `_trkApply` 가 `window._trkMotion` 에 두고 `_ovlMoving` 이 버스 노드면 PF 대신 이 값을 그린다(노랑 고착 수정) · `_busPosFollow` 가 진행도를 올리고 시각을 아는 정류장은 통과 증거(gps)로 적어 엔진에 다시 보낸다(이미 gps 로 확정된 정류장은 건드리지 않음) → `ride-eta` 가 남은 정류장을 당기고 민다(새벽·야간; 시험 `ride_eta` 에 추가). 버스 구간에서는 `_pfAdopt` 가 지하철 역을 채택하지 않는다. 끄기: `_busPosOff`·`_busMotionOff`·`_pfBusGuardOff`.
- **영점 5초**: 표시 도착 시각 앞 30초~뒤 40초 안에는 `/ride-track` 요청 간격 2.5초(그 밖 8초; `_trkGapMs`, 끄기 `_trkNearGapOff`). 한계: 앱이 가려지면(웹뷰 정지) 응답이 앱이 다시 보일 때 몰려 온다 — 네이티브 대기 모드 인수(Java)가 필요하고 로컬에서 검증 불가.
- **위치 감지 재누름**: 결과 카드가 떠 있고(안내 확정 전) 도착지가 있으면 새 위치를 출발지로 정한 뒤 `fmapDoRoute` 를 자동 실행(`_locReSearchOff` 로 끔). 시험 `locate_research.ui` 6.
- **도구**: `tools/engine/sync-module.js <engine/모듈.js …> [--version v]` — Worker 붙여넣기 파일 안의 그 모듈 구간(`// ===== 이름 (…) 시작` ~ `이름 끝`)을 모듈 파일 본문(ASCII 이스케이프, 'use strict' 줄 뺌)으로 통째로 바꾼다. 이번에 `ride-eta`·`ride-track` 을 동기화했다. 버전 시험(`*_engine.test.js`)은 날짜를 고정하지 않도록 `10-\d\ds\d\d` 로 풀었다.
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s49) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-19s49`. 설정 탭 스위치(s45 뉴스 · s46 게시판/실시간소통/탭 막대 · s48 경로 입력)는 기본 꺼짐.
- **기기 미검증(정직)**: 버스 `motion`/`busPos` 임계값(1.4m/s·0.7m/s·선에서 150m·14초 창)은 시뮬/합성 궤적으로만 확인했다. 실제 버스 GPS(터널·고가 아래 끊김)에서 `moving:null` 이 얼마나 나오는지·정류장 선(직선)과 실제 도로의 차이는 실기기 로그로 확인 필요 — `_ovlDiag` 의 `버스위치` 줄과 진단 로그로 본다. 영점 2.5초 간격이 서버 호출량을 얼마나 늘리는지(도착 창 안에서만)도 확인 필요.

## 2026-10-19 엔진 s50 — 5번(데이터 계층을 웹뷰 밖으로) 1단계: 숨김 인계 (앱이 가려지면 자바 서비스가 엔진으로 안내를 이어받는다)
- **YJ 지시**: "5번 진행해줘"(순서 근거: 1~4번 화면을 먼저 네이티브로 만들면 웹 접착을 두 번 쓰게 된다 → 데이터·상태를 자바로 먼저). 최종 목표 '웹으로 구동되는 것은 하나도 없게'. 규칙 "모든 계산은 엔진이, 앱은 그림만".
- **왜 이 단계**: 앱이 가려지면(홈 화면·다른 앱·화면 끔) 웹뷰 JS 가 드물게 돌아 `/ride-track` 응답이 몰려 영점이 늦었다. 앱을 밀어 닫았을 때 이미 있던 대기 모드(KeepAliveService → `/ride-standby`)를 **가려지는 순간부터** 쓰게 넓혔다.
- **흐름**: 설정 '가려진 동안 엔진이 이어받기'(`sbh`, 키 `gdm_sbh`, 기본 꺼짐) ON → 웹이 맡기는 패킷에 `handoff:true` → `OverlayPlugin.handleOnStop` 이 조건(스위치·여정 중·맡긴 상태 있음)이 맞으면 `startHandoffSoon`(웹에 `_ovlStandbyPush(true)` 시키고 0.7초 뒤) → `tryHandoff`(`hosted=true`·`handoff=true`·`KeepAliveService.ACT_ACTIVATE`, 웹에 `window._sbHanded=true`). 서비스는 5초(엔진이 정한 `nextMs`: 도착 앞 30초~뒤 40초 안 2.5초)마다 `/ride-standby` 를 불러 영점·시각 밀고 당기기·하차 알림·오버레이를 이어간다. 다시 보이면(`handleOnStart`) 1초 간격으로 웹의 `_sbHandback()` 을 재촉 → 웹이 `standbyTake()` 로 서비스가 쥔 엔진 상태를 받아 `_sbAdopt`(GPS 통과 시각·진행도·보낸 알림만 받아 적는다 — 계산 없음). 8초 안에 못 받으면 `endHandoff(true)` 로 서비스를 멈추고 웹이 예전처럼 스스로 잇는다(폴백). 인계가 안 되는 조건이면 예전 `wakeWebSoon` 이 그대로 돈다.
- **엔진 `engine/ride-standby.js`**(워커 사본 동기화, 버전 `route-v2-2026-10-19s50`): ① 응답에 `nextMs`(`rsNextMs` — 웹 `_trkGapMs` 와 같은 창 30초 앞~40초 뒤 → 2500, 그 밖 5000, 승차 전·끝나면 5000) ② 버스: 진행 노드가 버스면 `plan.progIsBus` 로 `rideTrack` 의 `busPos`/`motion` 을 쓴다 — `busPos.passed` 를 통과 증거(src gps)로 적고(이미 gps/move 인 통과는 건드리지 않음), `motion.moving` 이 오버레이 이동중 표시를 정한다(웹 `_ovlMoving` 과 같은 규칙) ③ 응답에 `motion` 추가.
- **자바**: `KeepAliveService` — `nextDelayMs`(엔진 `nextMs` 2~8초만 인정), `handoff`/`liveState`/`liveAt`/`liveDone` 정적 값, `savePacket` 은 인계 중 낡은 웹 값으로 덮지 않음, `standbyTakeJson`, `step()` 은 응답이 늦게 도착했을 때 대기 모드가 이미 끝났으면 버림. `OverlayPlugin` — `handoffOk`/`handoff`/`handback` 재촉 러너/`HANDBACK_GIVEUP_MS`=8초, `standbyTake`(@PluginMethod), `endHandoff`(오버레이 창은 내리지 않고 `wanted=hostedOk` 로 돌려줌·깨우기 틱 되살림), `keepAlive` 는 인계 중 서비스를 끄지 않음, `handleOnDestroy` 는 인계 표시를 풀고 기존 '앱 닫힘 대기 모드'로 이어짐.
- **웹 `www/index.html`**: `_sbhOn`/`_sbhSetUse`/`_sbhSyncCard`(설정 카드 `sbhSetCard`, 엔진 설정 화면 `f.sbh`), `_sbAdopt`/`_sbHandback`, `_ovlStandbyPush` 가 `handoff` 를 싣는다. 인계 중(`_sbHanded`)에는 `_checkTransitAlerts`·`_trkRequest`·`_ovlStandbyPush` 가 아무것도 하지 않는다(같은 알림 이중 발사 방지). `_onForegroundResume`·`visibilitychange` 도 돌려받기를 부른다. 환승완료 바닥(`_rsFloorIdx`) 아래 통과·다른 여정(tripSig)·웹이 이미 아는 값(1초 안)은 받지 않는다.
- **설정 엔진** `engine/settings.js`: `sbh` 카드 추가(워커 사본 `embed-shop.js --version …s50`).
- **시험**: `ride_standby` 24(+3: 버스 busPos 통과 증거·이른 도착 당김, motion 이동중/정지 표시, nextMs 창) · `sbh_handback.ui` 11(스위치·패킷 handoff·인계 중 웹 정지·돌려받기 받아 적기·무시 규칙·폴백·복귀 호출) · `sbh_native` 9(자바 소스 약속: 이름·순서·8초 포기·가드 — 자바는 이 환경에서 못 돌려 소스 글로 점검) · `settings_engine` 69. CI 매트릭스에 `sbh_native.test.js`·`sbh_handback.ui.test.js` 추가.
- **기기 미검증(정직)**: 안드로이드 계층은 로컬에 `android.jar` 가 없어 javac 문법 검사(파싱 오류 없음)와 소스 글 점검뿐 — 실제 컴파일은 CI. 실기기에서 확인할 것: ① 스위치 켜고 지하철/버스 안내 중 홈으로 나갔다 오면 오버레이·알림이 끊기지 않고, 다시 열었을 때 통과 시각이 이어지는가 ② 인계 중 하차 알림이 한 번만 울리는가(웹과 서비스 이중 발사) ③ 화면을 껐다 켰을 때 ④ 돌려받기가 8초 안에 되는가(안 되면 서비스가 멈추고 웹이 잇는다 — 진단 기록에 '인계' 줄) ⑤ 버스 임계값(motion/busPos)은 합성 궤적으로만 확인.
- **알려진 한계**: 서비스는 `_ovlStandbyBuild` 가 만든 상태만 이어받는다(승차 전·기준시각 미래 모드·확정 전 경로는 인계 안 함). 인계 중 환승완료 버튼은 없다(앱이 가려져 있으므로). 서비스가 쥔 상태 중 웹이 받아 쓰는 것은 GPS 통과·보낸 알림뿐 — 이탈 판정은 서비스가 알림으로만 알리고 웹은 돌아온 뒤 자기 판정으로 잇는다.
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s50) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-19s50`. 새 APK 설정 탭의 '가려진 동안 엔진이 이어받기'를 켜고 실제로 타 보며 위 ①~④ 확인(진단 기록 '인계' 줄 복사).
- **다음(5번 2단계~)**: 후보 검색(지하철역 거르기·버스정류장·장소)을 자바로 → 경로 탐색 요청·결과 상태를 자바로 → 저장값·설정·알림 → 그 뒤 홈 결과 카드 등 1~4번.

## 2026-10-19 엔진 s51 — 5번(데이터 계층을 웹뷰 밖으로) 2단계: 후보 검색 (지하철역은 엔진이, 버스정류장·장소는 앱 본체(자바)가)
- **YJ 지시**: "다음 진행해줘"(5번 계획의 2단계). 규칙: 모든 계산은 엔진이 · 앱은 그림만 · 예전 웹 방식은 폴백으로 그대로 · 새 스위치는 기본 꺼짐.
- **왜 이렇게 나눴나**: 홈 자동완성 후보는 세 갈래다. ① 지하철역 = 앱 안의 역 표(STNDB)를 글자로 거르기(순수 계산) ② 버스정류장 = TAGO 를 서버(/tago)로 조회 ③ 장소 = 카카오 로컬을 서버(/kakao-local)로 조회. ①은 '계산'이라 엔진 몫, ②③은 '통신'이라 앱 본체(자바) 몫이다. 웹은 결과를 받아 엔진 요청에 끼워 줄 뿐이다.
- **엔진 `engine/home.js` + 새 데이터 `engine/home-stations.js`**(워커 HOME 블록에 같이 내장 — `tools/engine/embed-shop.js` 의 HOME 항목에 `pre:` 추가): `homeStnFind(q)` = 이름에 글자가 든 역을 표 순서대로 모아 같은 이름은 하나로(호선은 ` · ` 로 이음) 8개까지 — 앱의 예전 `STNDB.filter → _dedupeStnByName → slice(0,8)` 과 같다. `data.u` 가 **배열로 오면 예전 그대로**(웹이 걸러 보낸 후보 사용 — 폴백), **없으면** 엔진이 눌린 칸의 글자로 직접 거른다. 이때 고르기에 필요한 값은 응답 `info.pk.u[번호] = {name,line,lat,lng}` 로 준다. 모든 응답에 `info.sx = 1`(이 엔진은 역을 직접 거른다 — 웹이 옛 엔진인지 알아보는 표시). 역 표는 앱이 단일 출처: `node tools/engine/gen-home-stations.js`(playwright 로 앱을 띄워 STNDB 를 뽑아 파일 생성). 앱 역 표를 고치면 이 도구를 다시 돌려야 하고, 안 돌리면 `home_stations.ui.test.js` 가 잡는다.
- **자바 `native/HomeSearchCore.java`**(순수 — android·네트워크·시계 없음, JVM 시험): 주소 만들기(웹과 글자까지 같음: `/tago?url=<TAGO 주소>` · `/kakao-local?path=search/keyword.json&qs=query=<q>&size=5`), 응답 읽기(`parseBus`: response.body.items.item 이 객체·배열·없음(`"items":""` 포함) 모두 처리, 앞 5개 / `parsePlaces`: x·y 가 0 이 아닌 것만 앞 5개), 엔진 입력 줄(`busDisp` {n,d} · `placeDisp` {n,a}), 이벤트 JSON, 저장본 `Cache`(LRU+기한: 장소 90일·300개, 버스 10분·60개, 깨진 저장본은 무시), `ScreenCore.parse` 재사용.
- **자바 `native/HomeSearchPlugin.java`**(플러그인 이름 `HomeSearch`; 통신·타이머·저장만): `query({q,base,delay})` — 2글자 이상, **디바운스 300ms**, 새 query 가 이전 것을 취소(`gen`), 버스·장소를 병렬로 찾아 종류마다 `cands` 이벤트 `{q,kind:'b'|'p',ok:true,raw:[원본…],disp:[엔진 줄…]}` 또는 `{ok:false,why}`; 장소 저장본은 SharedPreferences(`gdm_homesearch`)에 남음; 빈 결과는 저장 안 함(예전 웹 규칙); 통신 제한 6초/8초, 200 이 아니면 실패. `cancel` · `status`. `ScreenNativePlugin` 은 여전히 통신이 없다(섞지 않음). CI 워크플로가 두 파일을 복사하고 `registerPlugin(HomeSearchPlugin.class)` 를 넣는다.
- **웹 `www/index.html`(`_scrHome`)**: 새 설정 스위치 `cnd`(키 `gdm_cnd`, 카드 `cndSetCard`, 엔진 설정 화면 `f.cnd`, 기본 꺼짐; 카드는 HomeSearch 플러그인이 있을 때만). 켜면 `request()` 가 `d.u` 를 **보내지 않고**(`d:{b,p}`), `gather()` 는 STNDB 를 안 쓰고 `HomeSearch.query` 를 같은 글자에 한 번만 부르며, `cands` 이벤트의 `disp`/`raw` 를 후보로 받는다(글자가 다른 늦은 응답은 무시). 고르기(`choose`)는 지하철이면 응답 `info.pk.u`, 버스·장소면 `raw` 로 **예전과 같은** `_fmapSetLocation` 값을 만든다. `_scrKit` 에 `cfg.onPresent(j,z)` 훅 추가(홈이 응답의 `info.sx` 를 살핀다).
- **폴백(전부 자동)**: ① 플러그인이 없음 → 스위치가 켜져 있어도 예전 방식·카드 숨김 ② `query` 가 거절·예외 → `cndFail` : 예전 방식으로(u 를 다시 보내고 `webBus`·`webPlace` 가 현재 글자를 다시 찾음), 카드에 사유 ③ 옛 엔진(응답에 `info.sx` 없음) → 같은 방식으로 복귀, 사유 '엔진이 아직 역 검색을 못 해요' ④ 한 종류만 통신 실패(`ok:false`) → 그 종류만 웹 `webBus`/`webPlace` 로 다시(전체를 끄지는 않음). 스위치를 껐다 켜면 다시 시도. 예전 코드(`webBus`·`webPlace`·STNDB 걸러내기)는 그대로 남아 있다.
- **설정 엔진** `engine/settings.js` 에 `cnd` 카드('후보 검색을 앱과 엔진이 하기') — 워커 사본 동기화 `embed-shop.js --version route-v2-2026-10-19s51`.
- **시험**: `home_engine` 70(+23: 엔진 걸러내기 == 예전 웹 방식 7개 검색어·`data.u` 있음/없음/빈 배열·info.pk/sx·워커 끝에서 끝까지·역 표 내장) · `home_stations.ui` 3(앱 STNDB == 엔진 표·생성 도구 글 == 파일·여러 검색어에서 예전 걸러내기 == 엔진) · `home_search_native` 8(+1 건너뜀: android.jar 필요) · `HomeSearchJvmTest` 31 · `home_cnd.ui` 14(꺼짐=예전·켜짐=u 없음·query 한 번·cands→요청 b/p·늦은 응답 무시·고르기 3종·폴백 4종·스위치) · `settings_engine` 70. CI 매트릭스 78 → 81.
- **기기 미검증(정직)**: `HomeSearchPlugin` 은 로컬에 `android.jar`·Capacitor 가 없어 최소 스텁 컴파일(문법·이름·타입)과 소스 글 점검뿐 — 실제 컴파일은 CI. 실기기에서 확인할 것: ① 설정 탭 '후보 검색을 앱과 엔진이 하기' 카드가 보이는지(플러그인이 등록됐다는 뜻) ② 켜고 홈 탭에서 '강남' 입력 시 지하철 줄이 바로(엔진 응답 한 번 안에) 나오고 곧이어 버스·장소 줄이 붙는지 ③ 후보를 눌러 출발/도착이 정해지고 경로 탐색이 되는지(지하철·버스·장소 각각) ④ 비행기 모드 등으로 통신이 막히면 웹 방식 폴백이 되는지 ⑤ 서버 `/tago`·`/kakao-local` 이 실제 앱(WebView 가 아닌 HttpURLConnection)에서도 같은 응답을 주는지(이 환경에서는 workers.dev 접속 불가라 실서버 응답은 못 봤다) ⑥ 입력이 예전보다 부드러운지.
- **알려진 한계**: 지하철 후보는 엔진 응답 한 번 안에서 나오므로 입력 직후 엔진 왕복(네이티브 경로 입력이 이미 그렇게 동작)만큼 걸린다. 앱 본체 검색은 이 홈 후보 입력에만 쓰인다(노선도 탭 `fmapSearchMap`·기타 검색은 아직 웹). 카카오 `_kakaoLocal` 의 웹 저장본과 앱 본체 저장본은 따로다. 역 표가 엔진에 한 벌 더 있다(생성 도구 + 어긋남 시험으로 관리).
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s51) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-19s51`(엔진을 먼저 배포해야 새 방식이 쓰인다; 안 하면 앱이 알아채고 예전 방식으로 돌아간다). 새 APK 에서 설정 탭 '후보 검색을 앱과 엔진이 하기'(안드로이드 앱에서만 보임)를 켜고 위 ①~⑥을 확인. 이 스위치는 '네이티브 경로 입력'(`scrh`)이 켜져 있을 때 쓰인다.
- **다음(5번 3단계~)**: 경로 탐색 요청·결과 상태를 자바로 → 저장값·설정·알림 → 그 뒤 홈 결과 카드 등 1~4번.

## 2026-10-19 엔진 s52 — 5번(데이터 계층을 웹뷰 밖으로) 3단계: 경로 탐색 요청·결과 상태 (판단은 엔진 `follow`, 통신·보관은 앱 본체(자바))
- **YJ 지시**: "엔진 배포했어. 다음 이어서 네이티브화 해줘. 모든 계산은 엔진이 앱은 그림만 그린다는 규칙 필수" + (작업 중) "현재는 구글지도로 되어있는데 네이티브했을 때 사용 가능한 무료지도가 있으면 그걸 사용해줘" → **지도 결정은 맨 아래**.
- **왜 이렇게 나눴나**: 경로 요청 흐름(`fmapDoRoute`)에는 '통신'(경로 서버 GET·응답 보관)과 '판단'(빠른 응답을 그릴지/전체를 기다릴지·전체를 뒤따라 받을지·'예상' 버스를 언제 다시 조회할지·다시 받은 게 나아졌는지)이 섞여 있었다. 판단은 예전엔 웹이 응답의 `liveStat` 를 읽고 스스로 정했다 → **엔진으로 옮겼다**. 통신·보관만 자바로 간다.
- **엔진 `engine/route-follow.js`**(워커 사본 `// ===== route-follow (…) 시작/끝` 구간, `sync-module.js` 로 동기화; 버전 `route-v2-2026-10-19s52`): `routeFollow({liveStat,n,bf,ver,pm,pa})` → `follow = {v:1, ver, n(경로 수), draw(false=이 응답은 그리지 않는다: ldWait), next('full'=같은 요청을 live=0 없이 한 번 더), miss(못 받아 '예상'인 버스 구간 수), applied, retry([12000,16000,20000] 또는 null: 기준시각을 직접 골랐거나(bf=1) miss=0 이면 null), better(요청에 pm 이 있을 때만: miss 가 줄었거나 같은데 applied 가 늘었나)}`. `/route-v2-app` 응답 **맨 앞**에 `follow` 키로 실린다(`Object.assign({follow}, _od)`; 실패해도 원본 응답은 나간다). 요청 쿼리 `pm`·`pa` = 웹이 직전에 그린 응답의 miss·applied(없으면 `better` 없음). 옛 엔진은 `follow` 가 없다.
- **자바 `native/RouteFetchCore.java`**(순수 — 안드로이드·네트워크·시계·스레드 없음; 통신·시계·낡은 요청 확인은 `Env` 로 받는다 → JVM 에서 가짜 Env 로 그대로 시험): `isRouteUrl`(https 이고 `/route-v2-app` 경로만) · `clampTimeout` · `extractFollow`(응답 맨 앞 `{"follow":{…}` 만 읽는다 — 응답 전체를 파싱하지 않음) · `run`(단계 진행: `url&live=0` → follow 없음=legacy / draw=false 면 전체를 받아 first 로(전체 실패면 빠른 응답을 forced) / 그 밖은 first 후 next=full 이면 전체를 받아 full 이벤트) · `once`(한 건: 경로 있으면 보관, 엔진이 better=false 라 한 응답은 보관 안 함) · `logEntry`(웹 `_routeFetchLog` 와 같은 모양·문구) · `State`(가장 최근에 받은 '경로 있는 응답' 보관). **자바에는 `liveStat/livePending/ldWait/liveMissing` 를 읽는 코드가 없다** — 시험이 글자로 막는다.
- **자바 `native/RouteFetchPlugin.java`**(플러그인 `RouteFetch`): `request({id,url,timeoutMs})`(첫 응답이 준비되면 resolve, 뒤따르는 전체는 이벤트 `route`) · `once` · `last`(보관된 최근 결과) · `cancel` · `status`. HttpURLConnection(연결 ≤8초·읽기 timeoutMs·본문 8MB 상한·200 아니면 실패), 새 request 가 오면 이전 것은 `stale`, 호출은 어떤 경우에도 resolve 로 끝난다.
- **웹 `www/index.html`**: 설정 스위치 `rtf`(키 `gdm_rtf`, 카드 `rtfSetCard`, 엔진 설정 화면 `f.rtf`, 기본 꺼짐; 카드는 플러그인이 있을 때만). `fmapDoRoute` 의 `_routeStaged` 가 켜져 있으면 `_rjStart`(플러그인 request) 를, 아니면 예전 `_routeStagedWeb` 를 쓴다. 뒤따르기: 앱 본체 모드는 `follow.next==='full'`(forced 면 안 함), 예전 모드는 `liveStat.livePending`. `_estRetry` 는 `follow.retry` 간격·`follow.miss/applied`·요청 `pm/pa`·`follow.better` 를 우선하고 없으면(옛 엔진) 예전 상수·비교를 쓴다. 재조회 한 건·보조 요청(`_routeGetJson`: 다른 편 고르기 `_ldReselect` · 출발 시각 비교 `_depCompareStart` · 출퇴근 미리 받기 `_commutePrefetch`)도 켜져 있으면 앱 본체가 받고 못 받으면 예전 fetch.
- **폴백(전부 자동, 예전 코드 `_routeStagedWeb`·`_fetchJson`·fetch 그대로 남김)**: ① 플러그인 없음 ② request 거절/예외 ③ 시간초과가 아닌 통신 실패 ④ 옛 엔진(follow 없음 = legacy) → `_rjFail(사유)` 로 스위치를 쓰지 않은 것처럼 예전 방식으로 그 탐색을 다시 이어간다(카드에 사유, 껐다 켜면 재시도). 시간초과는 예전처럼 실패 안내(웹으로 다시 묻지 않음). 옛 엔진일 때 첫 탐색만 요청이 두 번 나간다(자바 한 번 + 웹 폴백).
- **시험**: `route_follow` 14(엔진 판단 == 예전 웹 규칙 · 워커 내장본 끝에서 끝까지 · 응답 맨 앞 follow) · `RouteFetchJvmTest` 44(단계 진행 9갈래·follow 읽기·진단 문구·once·보관) · `route_fetch_native` 9(+1 건너뜀: android.jar 필요 — CI) · `route_rtf.ui` 18(진짜 `fmapDoRoute` 를 가짜 서버+가짜 플러그인에: 꺼짐=예전·켜짐=웹 직접 요청 없음·뒤따르기·ldWait·재조회 간격/pm·pa/better·폴백 4종·시간초과·보조 요청) · `settings_engine` 71. CI 매트릭스 81 → 84. `scene_native_java` 의 가짜 MainActivity 플러그인 목록에 `RouteFetchPlugin` 추가(지난번 CI 실패 원인과 같은 곳).
- **기기 미검증(정직)**: `RouteFetchPlugin` 은 로컬에 `android.jar`·Capacitor 가 없어 최소 스텁 컴파일과 소스 글 점검뿐 — 실제 컴파일은 CI. 실기기에서 확인할 것: ① 설정 탭 '경로 요청을 앱 본체가 하기' 카드가 보이는지 ② 켜고 경로를 찾으면 예전과 똑같이 그려지는지(진단 기록에 '앱 본체 1건' 계획 문구, 카드에 '마지막 응답 N KB · N ms') ③ 느린 구간에서 빠른 응답 → 전체로 바뀌는지 ④ '예상' 버스가 12초 뒤쯤 실제값으로 바뀌는지 ⑤ 네트워크를 막았을 때 실패 안내/폴백 ⑥ **큰 응답을 Capacitor 다리로 넘길 때의 속도**(응답이 수백 KB 면 웹 fetch 보다 느릴 수 있음 — 카드의 ms 로 비교, 느리면 스위치를 끄면 된다).
- **알려진 한계**: 결과를 그리는 일(`_handleRouteResults`·`_parseRouteOptions`·`_renderTransitResultCard`)은 아직 웹이다(홈 결과 카드 네이티브화는 뒤 단계) — 자바는 가장 최근 응답을 쥐고 있을 뿐(`RouteFetch.last()`), 아직 읽는 곳은 없다. 재조회 타이머와 '지금 다시 그려도 되나'(확정·탑승 중·세부경로 보는 중) 판단은 화면 상태라 웹에 남았다. `_ensureStopsParam`(주변 정류장 목록)·길찾기 외 다른 경로 서버 호출(`/ride-track`·`/ride-eta`·`/next-train`·`/scene`)은 이 단계 밖이다.
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s52) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-19s52`(엔진을 먼저 배포해야 새 방식이 쓰인다; 안 하면 앱이 알아채고 예전 방식으로 돌아간다). 새 APK 설정 탭 '경로 요청을 앱 본체가 하기'(안드로이드 앱에서만 보임)를 켜고 위 ①~⑥ 확인.
- **지도 결정(YJ 지시 반영)**: 조사 결과 앱에는 구글지도가 **없다**. 웹 지도(맛집·버스 정류장 등 Leaflet+MapLibre GL)는 이미 무료 **OpenFreeMap(Liberty)** 이고 실패 시 OSM 래스터로 자동 전환된다(`_TILE_LIBERTY`·`_TILE_OSM`, `_addBaseTiles`). 노선도는 앱이 직접 그리는 자체 도면(`metro_native.bin`)이라 지도 서비스를 쓰지 않는다. 안드로이드 매니페스트에 Google Maps 키·`play-services-maps` 도 없다. → **앞으로 지리 지도를 네이티브로 옮길 때는 MapLibre Native(안드로이드 SDK) + 같은 OpenFreeMap 스타일(`https://tiles.openfreemap.org/styles/liberty`, 키 불필요·무료)을 쓴다. 구글지도/Mapbox 는 쓰지 않는다.** 그때 폴백은 지금처럼 웹 Leaflet(OpenFreeMap → OSM).
- **다음(5번 4단계~)**: 저장값·설정·알림 → 홈 결과 카드 등 1~4번(결과 카드를 네이티브로 그릴 때 `RouteFetch.last()` 가 입력이 된다) → 지리 지도 네이티브(MapLibre Native + OpenFreeMap).

## 2026-10-19 엔진 s53 — 5번(데이터 계층을 웹뷰 밖으로) 4단계: 저장값·설정(4-1) + 하차·환승 알림 시점(4-2)
- **YJ 지시**: "지금부터 엔진파일도 올려줘. 다음 4단계 진행해. 100%네이티브화 하려면 얼마나 남았는지도 알려줘" (규칙: 모든 계산은 엔진이, 앱은 그림만). 엔진 파일은 채팅으로 전달(YJ가 직접 배포 — 운영 에디터에 내가 붙여 넣는 건 막혀 있으니 시도하지 말 것).
- **4-1 저장값을 앱 본체에도 보관** (설정 스위치 `sto`, 키 `gdm_sto`, 카드 `stoSetCard`, 엔진 설정 화면 `f.sto`, 기본 꺼짐, 카드는 플러그인이 있을 때만):
  - **엔진 `engine/store-sync.js`**(워커 사본 `// ===== store-sync (…)` 구간): `GET /store-policy`(보관할 키 규칙: exact 목록 · prefix `gdm_` · 거절 `gdm_err_log` · 끝이 `_c/_fail/_why` · 값 ≤20000자 · 키 ≤160 · 합계 ≤160000 · 센티넬 `gdm_sto_seen`) · `POST /store-merge`(웹·앱 본체 **지문**만 받아 `toWeb/toNat/delNat` 키 목록을 돌려준다; 본문 ≤100000). **값은 서버로 가지 않는다** — 키·글자 수·FNV-1a 32비트 지문(UTF-16 코드 단위 + 길이)만. 어느 쪽 값을 따를지(웹이 지워졌으면 앱 본체 값, 둘 다 있으면 웹 우선 등)도 엔진이 정한다.
  - **자바 `native/StoreCore.java`(순수) · `native/StorePlugin.java`(플러그인 `Store`: snapshot·apply·get·clear·status)**: SharedPreferences `gdm_store` 에 JSON 한 덩어리. 자바는 **구조 검사만**(키 글자 `[A-Za-z0-9_:.-]` ≤64자 · 값 ≤20000 · 키 ≤200 · 합계 ≤200000) — 어떤 키를 보관할지 목록은 자바에 없다(시험이 확인). 다른 자바 기능이 읽을 `read()` 있음.
  - **웹**: 정책을 받아(실패하면 내장 처음 정책 `_STO_POL0` = 엔진과 같은지 시험) `Storage.prototype.setItem/removeItem` 을 localStorage 에만 덧씌워 쓰기를 앱 본체로 따라 보낸다(읽기는 예전 그대로 localStorage). 웹 저장소가 지워진 걸 알아채면(센티넬 없음 + 앱 본체에 값 있음) 엔진이 정한 키를 되돌리고 **딱 한 번** 다시 연다(`gdm_sto_rl` 세션 표시로 되풀이 방지). 스위치 자체가 웹에서 지워져도 앱 본체에 켠 기록이 있으면 켠 것으로 본다.
  - **폴백(자동)**: 플러그인 없음 · 보관 실패 · 옛 엔진(404) → 예전 방식(웹 저장소만). 옛 엔진이어도 '되돌리기'만 최소 규칙으로 한다. 스위치를 껐다 켜면 재시도.
- **4-2 하차·환승 알림 시점을 엔진이** (설정 스위치 `ra`, 키 `gdm_ra`, 카드 `raSetCard`, 엔진 설정 화면 `f.ra`, 기본 꺼짐, 카드는 늘 보임 — 플러그인 없이 웹+엔진만):
  - **엔진 `engine/ride-alert.js`**(워커 사본 `// ===== ride-alert (…)` 구간): `POST /ride-alert` ← `{nodes[{k:'s'|'b'|null,l,n}], allowed, fired, curIdx, nowMin, eta{노드:'HH:MM'}, jr}` → `{v:1, alert:null|{key,type,title,body,vib}, extra[], curPos, nt}`. 규칙은 **새로 만들지 않고** 앱을 가렸을 때의 `rsAlerts`(ride-standby.js; `mtFn` 6번째 인자 추가 — 덧말 '(약 N분 후)' 를 앞 화면 규칙으로) 를 그대로 쓴다 → 앞 화면·대기 모드 규칙이 한 곳. 알림 대상(환승 하차역·최종 하차)도 `raTargets` 가 엔진에서 만든다.
  - **웹 `_checkTransitAlerts`**: 얇은 겉옷 — `_sbHanded`/`_baseTimeMs` 이면 예전처럼 아무것도 안 하고, 스위치가 켜져 있고 쉬는 중이 아니면 `_raCheck`(엔진에 노드 이름·순번·fired·끈 종류만 보냄, **좌표 없음**), 아니면 예전 본체 `_checkTransitAlertsLocal`. 같은 상태(curIdx · fired · 끈 종류 · 노드)는 다시 묻지 않는다. 돌아온 알림은 그대로 `showNotification`(+extra 는 보낸 것으로 처리, 대기 모드에 알림). 기다리는 동안 숨김 인계/예상 모드가 되면 울리지 않는다.
  - **폴백(자동)**: 엔진 404 · 오류 · 이상한 응답 · 2.5초 무응답 → **그 호출에서 바로** 예전 규칙으로 울리고 60초 동안은 엔진에 묻지 않는다(그 뒤 다시 묻는다). 카드에 사유 표시, 껐다 켜면 즉시 재시도.
- **시험**: `store_sync` 23(정책·지문·병합 · 워커 내장본 끝에서 끝까지) · `StoreJvmTest` 23(구조 검사·인코딩 왕복) · `store_native` 8(+1 건너뜀: android.jar 필요 — CI) · `store_sto.ui` 13(진짜 index.html 을 가짜 Store 플러그인+진짜 엔진 모듈에: 꺼짐=예전·값이 서버로 안 감·웹 지움 후 되돌림+한 번만 재열기·폴백) · `ride_alert` 15(엔진 == 예전 웹 규칙 · rsAlerts 와 같은 규칙) · `ride_ra.ui` 22(같은 장면에서 예전 경로와 엔진 경로 나란히 비교: 문구·진동·종류·순서 일치 · 같은 상태 한 번만 묻기 · 좌표 없음 · 끈 종류 · 숨김 인계/예상 모드 · 404/bad 2종/무응답 폴백 · 60초 쉬기 후 재시도 · 카드) · `ride_standby` 24 · `settings_engine` 73(`sto`·`ra` 항목, 카드 문구 = 엔진 문구). CI 매트릭스 84 → 88(실제 줄 수 88). `build-apk.yml`: StoreCore/StorePlugin 복사 + MainActivity `registerPlugin(StorePlugin.class)`; `scene_native_java` 가짜 MainActivity 목록에 `StorePlugin` 추가.
- **기기 미검증(정직)**: ① `StorePlugin` 은 로컬에 android.jar 가 없어 최소 스텁 컴파일뿐 — 실제 컴파일은 CI. ② 실제 WebView 에서 '웹 데이터 지움 → 앱 본체 값으로 복원 → 한 번 다시 열기' 흐름(시험은 가짜 플러그인). ③ 알림: 앞 화면에서 실제 GPS 로 따라가며 환승 준비·목적지 2정거장 전·곧 하차·도착이 예전과 같은 때·같은 문구로 울리는지(시험은 같은 장면 비교). ④ workers.dev 가 샌드박스에서 막혀 있어 실제 서버 응답으로는 확인하지 못했다(시험은 진짜 엔진 모듈을 가짜 서버로 연결).
- **알려진 한계(4단계에서 아직 웹인 것)**: 알림 정책 표(`_NOTIF_ALLOW`·`_VIBE_ALLOW`·종류별 설정 `notifPref`)와 '울릴지' 최종 판단(`showNotification` 안) · 근접 알림 · 도착 직전 추천(arrive_reco) · 출퇴근 브리핑 · 알림 대상 만들기(`_buildTransitAlertTargets` — 폴백/대기 모드 입력으로 남김; 엔진은 노드로 자기 대상을 만들지만 웹이 만든 대상은 대기 모드가 쓴다). 저장값은 '같이 보관' 단계 — 웹이 읽는 원천은 아직 localStorage 이다.
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s53) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-19s53` (엔진을 먼저 배포해야 새 스위치가 쓰인다; 안 하면 앱이 알아채고 예전 방식으로 돌아간다 — s52 파일은 이 파일에 포함됨). 새 APK 설정 탭에서 '설정·저장값을 앱 본체에도 보관하기'(앱에서만 보임), '하차·환승 알림 시점을 엔진이 정하기'를 켜고: 웹 데이터를 지운 뒤 설정이 돌아오는지(한 번 다시 열림) · 이동 중 알림 때·문구가 같은지 확인.
- **다음(5번 5단계~)**: 홈 결과 카드(`RouteFetch.last()` 가 입력) · 남은 설정 카드 · 커뮤니티 칩 줄 · 글쓰기 시트/팝업 → 지리 지도 네이티브(MapLibre Native + OpenFreeMap, 위 s52 결정) → 마지막에 웹뷰 껍데기 제거.

## 2026-10-19 엔진 s54 — 5번 5단계 첫 조각(데이터·판단): 알림 정책을 엔진이 정한다
- **YJ 지시**: "데이터판단부분부터 네이티브. 진행해줘" (규칙: 모든 계산은 엔진이, 앱은 그림만). 데이터·판단 영역(남은 약 4~5단계)의 첫 조각으로 '알림 종류 허용 여부'를 골랐다 — 알림·진동·기능이 모두 이 판단을 거치므로 뒤 조각(근접 알림·하차 직전 추천·브리핑)의 바탕이 된다.
- **왜**: '이 알림을 상단 알림으로 보낼까·진동을 줄까·이 기능을 켤까'는 웹의 `_NOTIF_ALLOW`·`_VIBE_ALLOW`·`_NOTIF_TOP`·`_notifPrefGroup`·`_notifAllowed`·`_vibeAllowed`·`_featureAllowed` 가 정했다(사용자가 끈 분류·출퇴근 브리핑 토글·예전 모드 `_notifLegacy` 포함).
- **엔진 `engine/notif-policy.js`**(워커 사본 `// ===== notif-policy (…)` 구간, `sync-module.js`; 버전 `route-v2-2026-10-19s54`): `notifPolicy({prefs, legacy, cm})` → `{v:1, types:{종류:{n:상단 알림, v:진동, f:기능}}, groups, top}`. 규칙은 예전 웹과 글자 그대로(표에 없는 종류는 셋 다 거절 = 표에 안 나옴). `POST /notif-policy`(본문 ≤4000자).
- **웹 `www/index.html`**: 설정 스위치 `npol`(키 `gdm_npol`, 카드 `npolSetCard`, 엔진 설정 화면 `f.npol`, 기본 꺼짐, 카드는 늘 보임). `_notifAllowed/_vibeAllowed/_featureAllowed` 는 얇은 겉옷 → `_npAnswer(type, 'n'|'v'|'f')` 가 엔진 표를 읽고, 표가 없거나 낡았으면 예전 본체(`…Local`)로 답한다. 부르는 쪽이 동기 답을 필요로 해서 표를 받아 두고 쓴다 — 상태(분류 스위치·브리핑·예전 모드) 서명이 표의 서명과 다르면(방금 스위치를 건드림) **새 표가 오기 전에도 틀린 답이 나가지 않게** 예전 규칙으로 답하고 새 표를 요청한다(두 규칙은 같다). 엔진에는 `{prefs, legacy, cm}` 만 간다.
- **폴백(자동)**: 스위치 꺼짐 · 404 · 오류 · 이상한 응답 · 2.5초 무응답 → 바로 예전 규칙, 60초 쉬기(그 뒤 다시 물음), 카드에 사유, 껐다 켜면 즉시 재시도.
- **시험**: `notif_policy` 8(모든 조합 896개가 예전 웹 규칙의 얼린 사본과 같음 · 워커 내장본 끝에서 끝까지 · /notif-policy 길) · `notif_npol.ui` 15(진짜 index.html: 꺼짐=엔진 안 부름 · 켜짐=예전 모드2×브리핑2×분류16×종류11 전부 예전 `…Local` 과 같음 + 엔진 표가 실제로 답함(hits) · 같은 상태 한 번만 묻기 · 상태 바뀐 순간 틀린 답 없음 · showNotification 이 끈 종류를 안 보냄 · 404/bad/무응답 폴백 · 60초 뒤 재시도 · 카드) · `settings_engine` 74 · 회귀: `journey_alerts` 50 · `ride_ra` 22. CI 매트릭스 88 → 90.
- **기기 미검증(정직)**: 실제 폰에서 스위치를 켜고 알림 종류 스위치(도착 임박·환승·하차 전 추천)를 껐다 켜며 상단 알림·진동이 예전과 같게 오가는지. workers.dev 가 샌드박스에서 막혀 실제 서버 응답으로는 못 봤다.
- **알려진 한계(아직 웹인 것)**: 표를 *읽어 답하는* 일은 아직 웹 함수(겉옷)다 — 규칙(어느 종류가 허용인가)만 엔진으로 갔다. `showNotification` 안의 발송(LocalNotifications 호출·알림 버튼 종류)·진동 호출은 입출력이라 웹에 남는다. 이어서 남은 판단: 근접 알림(`_checkRouteProximityAlert`) · 하차 직전 추천(arrive_reco) · 출퇴근 브리핑 · 알림 대상 만들기(`_buildTransitAlertTargets`) · 추적 흐름 조율 · 저장값을 읽는 쪽.
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s54) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-19s54` (s53 내용 포함 — s53 파일은 안 올려도 된다). 새 APK 설정 탭에서 '알림 종류 허용 여부를 엔진이 정하기'를 켜고 알림 종류 스위치를 바꿔 가며 알림·진동이 예전과 같은지 확인.
- **다음 조각 후보**: ① 근접 알림 + 하차 직전 추천의 '언제·무슨 문구' ② 출퇴근 브리핑 ③ 알림 대상 만들기·추적 흐름.

## 2026-10-19 엔진 s55 — 5번 5단계 둘째 조각(데이터·판단): 하차 전 추천 '언제 보낼까'를 엔진이 정한다
- **YJ 지시**: "진행해줘" (데이터·판단 영역 이어서). 이번 조각은 추천 *문구·가게 고르기*가 아니라 *시점 판단*만이다 — 문구 엔진(날씨·위트 문구 풀·가게 고르기·쿠팡 아이템)은 1500줄 규모라 따로 뒤 조각으로 남겼다.
- **왜**: `_arrCheckPreAlert`(내리기 7분~1분 전 구간에서만 · 여정당 1회 · 30분 안 재발송 없음) · `_arrSlot`(도착 시각 → 아침/점심/저녁·야식/쇼핑/없음) · `_arrIsDinner` · `_arrRemainMin` 은 순수한 시간 규칙인데 웹이 정했다.
- **엔진 `engine/arrive-reco.js`**(워커 사본 `// ===== arrive-reco (…)`; 버전 `route-v2-2026-10-19s55`): `arrRecoWhen({arrMs, remSec, dest, lastKey, lastAt, nowMs})` → `{v:1, fire, why:'ok'|'input'|'window'|'dup'|'recent', key, slot, dinner, remMin, pre, askMs}`. 시간대는 **한국시간 기준**(웹은 기기 시간대; 한국 앱이라 같다 — 시험은 Asia/Seoul). `askMs` = 다시 물을 때까지 기다릴 시간(5~60초: 구간보다 많이 남았으면 길게) — 20초마다 도는 감시(`_arrWatchTick`)가 여정 내내 엔진을 부르지 않게. `POST /arrive-reco`(본문 ≤4000자).
- **웹 `www/index.html`**: 설정 스위치 `arw`(키 `gdm_arw`, 카드 `arwSetCard`, 엔진 설정 화면 `f.arw`, 기본 꺼짐). `_arrCheckPreAlert` 는 겉옷 → 켜져 있으면 `_arwCheck`(엔진에 도착 시각·남은 초·목적지·지난 기록만 보냄, 답을 받으면 `fire` 일 때 기록 키를 남기고 `_arrFireAlert`), 아니면 예전 본체 `_arrCheckPreAlertLocal`. 기다리는 사이 이미 보냈거나 예상 모드가 되면 보내지 않는다. 엔진이 알려 준 시간대·저녁 여부(`_arwDec`)는 같은 도착 시각에 한해 `_arrSlot`/`_arrIsDinner` 가 쓴다(그 밖은 예전 `…Local`). 추천 본문(`_arrFireAlert` 이후)은 건드리지 않았다.
- **폴백(자동)**: 스위치 꺼짐 · 404 · 오류 · 이상한 응답 · 2.5초 무응답 → 그 호출에서 바로 예전 규칙, 60초 쉬기, 카드에 사유, 껐다 켜면 즉시 재시도.
- **시험**: `arrive_reco` 9(하루 1440분×이틀 시간대·저녁이 얼린 예전 규칙과 같음 · 구간 경계 · 1회/30분 규칙 조합 · 이상한 입력 · 워커 내장본 · /arrive-reco 길) · `arrive_arw.ui` 17(진짜 index.html: 꺼짐=엔진 안 부름 · 켜짐=남은 초10×기록3×시각3×목적지2 = 180조합이 예전 `…Local` 과 같은 판정·기록 · 시간대 사용 · 길게 기다리기/다시 묻기 · 중복 방지 · 예상 모드 · 404/bad/무응답 폴백 · 60초 뒤 재시도 · 카드) · `settings_engine` 75 · 회귀 `journey_alerts` `loading_chars` `overlay_reco` `notif_npol` `ride_ra`. CI 매트릭스 90 → 92.
- **기기 미검증(정직)**: 실제 폰에서 하차 7분 전쯤 추천이 예전과 같은 때·한 번만 뜨는지, 오버레이 하단 줄이 같은 때 나오는지. workers.dev 가 샌드박스에서 막혀 실제 서버로는 못 봤다.
- **알려진 한계(아직 웹인 것)**: 추천 본문 만들기(`_arrBuildAlert`·`_arrCx` 날씨 문구·위트 풀·가게 고르기) · 오버레이 하단 줄을 *언제 보일지*(도착 3분 전~30초 뒤·TTL 25분·닫음 기록 — 매 틱 동기 판단이라 별도 설계 필요) · 근접 알림(`_checkRouteProximityAlert` 는 코드가 없는 죽은 기능 — 정책 표에만 남음) · 출퇴근 브리핑 · 알림 대상 만들기 · 추적 흐름 조율.
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s55) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-19s55` (s53·s54 내용 포함). 새 APK 설정 탭에서 '하차 전 추천 시점을 엔진이 정하기'를 켜고 하차 7분 전 추천이 한 번 뜨는지 확인.
- **다음 조각 후보**: ① 추천 문구 엔진 이전(큰 덩어리 — 여러 단계) ② 출퇴근 브리핑 ③ 알림 대상 만들기·추적 흐름.

## 2026-10-19 엔진 s56 — 5번 5단계 셋째 조각(데이터·판단): 출퇴근 브리핑 '언제 울릴까'를 엔진이 정한다
- **YJ 지시**: "다음단계 진행해줘". 이번 조각은 브리핑 *내용*(날씨·혼잡도)이 아니라 *시각 판단*만이다. 장소(집·회사)·좌표가 얽힌 경로 미리 받기(`_commutePrefetch`)·`_cmPair` 는 개인 장소를 엔진에 보내야 해서 개인정보 결정이 필요하므로 뒤로 미뤘다.
- **왜**: `_cmTick`(앱이 켜져 있을 때 30초마다 '지금이 출근/퇴근 시각과 같은 분인가 · 설정한 요일인가 · 같은 분에 이미 보냈나') 와 `_cmOccurrences`(앞으로 4주치 OS 예약 알림 시각) 는 순수한 시간 규칙인데 웹이 정했다.
- **엔진 `engine/commute-alarm.js`**(워커 사본 `// ===== commute-alarm (…)`; 버전 `route-v2-2026-10-19s56`): `cmDue({nowMs,on,osOk,morn,eve,days,lastKey})` → `{v:1, fire:null|'morn'|'eve', key:'Mon Oct 19 2026|07:30', askMs}`(키는 예전 `toDateString()|HH:MM` 과 같은 글자 — 저장된 `lastKey` 와 호환; 꺼짐·OS 예약 있음 → 안 보냄; 같은 키 → 안 보냄; 요일 목록이 비면 매일). `cmOccurrences({nowMs,morn,eve,days})` → `{v:1, morn:[ms…], eve:[ms…]}`(예전과 같게 36일 안에서 지금보다 2초 넘게 뒤 · 선택한 요일 · 최대 28개). 한국시간 기준. `askMs` = 다시 물을 때까지 기다릴 시간(대상 분이 1분 반 안이면 0, 멀면 최대 9분, 꺼짐·OS 예약이면 10분). `POST /commute-alarm`(본문 ≤4000자, `op:'occ'` 면 예약 목록). **엔진에는 시각·요일·켜짐·기록만 간다** — 장소·좌표·알림 내용은 가지 않는다.
- **웹 `www/index.html`**: 설정 스위치 `cmw`(키 `gdm_cmw`, 카드 `cmwSetCard`, 엔진 설정 화면 `f.cmw`, 기본 꺼짐). `_cmTick` 은 겉옷 → 켜져 있으면 `_cmwTick`(엔진 답이 `fire` 면 기록 키를 남기고 `_fireCommuteBriefing`), 아니면 예전 본체 `_cmTickLocal`. 시각·요일을 바꾸면 기다림을 건너뛰고 바로 묻는다(`sig`). `_cmScheduleOS` 도 겉옷 → 켜져 있으면 `{op:'occ'}` 로 시각 목록을 받아 `_cmScheduleOSLocal(occ)` 에 넘겨 예약(없으면 예전 `_cmOccurrences`). 늦게 온 옛 답은 버린다(`occSeq`).
- **폴백(자동)**: 스위치 꺼짐 · 404 · 오류 · 이상한 응답 · 2.5초 무응답 → 그 호출에서 바로 예전 규칙, 60초 쉬기, 카드에 사유, 껐다 켜면 즉시 재시도.
- **시험**: `commute_alarm` 18(1주일×1분 격자×설정 7종×켜짐/꺼짐×OS예약 40만 조합이 예전 규칙과 같음 · 같은 분 1회 · 키 글자 호환 · askMs 로 쉬어도 대상 분을 놓치지 않음 · 4주치 시각 3천여 조합 · 이상한 입력 · 장소 필드 안 읽음 · 워커 내장본 · /commute-alarm 길) · `commute_cmw.ui` 22(진짜 index.html: 꺼짐=엔진 안 부름 · 시각90×설정5종=450조합이 `_cmTickLocal` 과 같음 · 보내는 값 · 길게 기다리기/시각 변경 시 즉시 · 같은 분 1회 · OS 예약·꺼짐 · 예약 목록 12조합이 예전과 같음 · 404/bad/무응답 폴백 · 60초 뒤 재시도 · 카드) · `settings_engine` 76 · 회귀 `journey_alerts` `screen_set_js` `notif_npol` `arrive_arw` `ride_ra`. CI 매트릭스 92 → 94.
- **기기 미검증(정직)**: 실제 폰에서 출퇴근 시각에 브리핑이 예전과 같은 때·한 번만 뜨는지, 4주치 예약이 OS 에 같은 시각으로 걸리는지. workers.dev 가 샌드박스에서 막혀 실제 서버로는 못 봤다.
- **알려진 한계(아직 웹인 것)**: 브리핑 본문(날씨·혼잡도) · 경로 미리 받기·`_cmPair`(장소 개인정보 결정 필요) · 추천 본문 만들기 · 오버레이 하단 줄 보임 시점 · 알림 대상 만들기 · 추적 흐름 조율.
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s56) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-19s56` (s53~s55 내용 포함). 새 APK 설정 탭에서 '출퇴근 브리핑 시각을 엔진이 정하기'를 켜고 설정 시각에 브리핑이 한 번 뜨는지 확인.
- **다음 조각 후보**: ① 추천 문구 엔진 이전(큰 덩어리) ② 알림 대상 만들기·추적 흐름 ③ 오버레이 보임 시점.

## 2026-10-19 엔진 s57 — 5번 5단계 넷째 조각(추천 문구 1단계): 하차 전 추천 알림 본문을 엔진이 만든다
- **YJ 지시**: "추천문구 엔진이전 시작해줘". 큰 덩어리라 단계로 나눈다 — **1단계(이번) = 하차 전 추천 *알림 본문*** (상황 한 줄 · 메뉴·가게 고르기 · 줄 맞춤). 2단계 = 작은 화면(PiP) 문구·오버레이 광고 줄(`_arrPipText`·`_arrAd`) · 3단계 = 쿠팡 상품 고르기(`_arrPickShopItem`) · 가게 목록 받기(`_arrEnsureFood`).
- **엔진 `engine/reco-text.js`**(워커 사본 `// ===== reco-text (…)`, 버전 `route-v2-2026-10-19s57`): `recoAlert({arrMs, nowMs, dest, weather:{temp,feel,tmin,tmax,rain,txt}, food:[{n,c,d}], recent:[이름], shop:{n,_t,_cat}, seed})` → `{v:1, slot, kind, title, body, remMin, dinner, menu, brunch, spots, placeIdx, hook, hookStrong, cx, shop}`(슬롯 'none' 이면 `{v:1,slot:'none'}`). 문구 풀·상황 규칙(비·추위·금요일·월급날…)·조사 함수는 **웹 코드를 글자 그대로 옮겼다**(이름만 `rtx…`; 생성 스크립트로 추출해 오타 방지). 가게 고르기(`rtxPickPlace`·`rtxSpotsFor`·`rtxMenusWithSpots`)도 같은 순서. **무작위는 씨앗**(`seed` → mulberry32)으로 정해 같은 입력이면 같은 결과; 앱이 씨앗만 보낸다. 시간은 한국시간. 시간대·저녁·남은 분은 `arrive-reco.js` 의 `arrSlot/arrIsDinner/arrRemainMin`, 계절·살림용품 표는 `shop.js` 의 `SHOP_SEASON_KW/SHOP_NOWX` 를 같이 쓴다(shop.js 내보내기에 두 표 추가 — 워커 사본은 그대로). `POST /reco-text`(본문 ≤60000자, 가게 목록 최대 300곳).
- **웹 `www/index.html`**: 설정 스위치 `rtx`(키 `gdm_rtx`, 카드 `rtxSetCard`, 엔진 설정 화면 `f.rtx`, 기본 꺼짐). 예전 `_arrBuildAlert` 는 `_arrBuildAlertLocal` 로 이름만 바꾸고, 같은 이름의 새 겉옷이 엔진이 만든 답(`_RTX.pack`, 60초 안·같은 목적지·같은 도착 시각)이 있으면 그걸 예전 모양(`place` 는 가게 목록의 원래 객체, `shop` 은 고른 상품 객체)으로 돌려주고 없으면 예전 본체를 쓴다. 답은 **알림을 보내는 순간**(`_arrFireAlert` → `_arrFireAlertGo` → `_rtxPrefetch`)에 한 번 받아 두고 한 번만 쓴다. 쇼핑 시간대는 상품을 앱이 먼저 고르고(`_arrPickShopItem`) 엔진 실패 시 그 상품을 그대로 예전 본문에 건넨다(`_rtxTakeShop`) — 두 번 고르지 않는다. 엔진이 고른 가게는 앱이 '최근 추천' 기록(`_arrRecoMark`)에 남긴다.
- **폴백(자동)**: 스위치 꺼짐 · 404 · 오류 · 이상한 응답 · 2.5초 무응답 → 그 호출에서 바로 예전 본체, 60초 쉬기, 카드에 사유, 껐다 켜면 즉시 재시도.
- **시험**: `reco_text` 19(시간대별 모양 · 반경 · 파는 메뉴만 · 최근 피하기 · 상황 문구 · 조사 · 날짜 시드 · 이상한 입력 · 전역 무작위/웹 상태 미사용 · 워커 내장본 · /reco-text 길) · `reco_rtx.ui` 16(진짜 index.html: 시간대 6×날씨 6×가게목록 4×최근 2×씨앗 4×날 4×상품 5 중 솎은 수백 조합에서 **엔진 경로 본문이 `_arrBuildAlertLocal` 과 글자·객체 모양까지 같음** · 최근 기록 · 한 번만 사용 · 낡은 답 무시 · 404/bad/무응답 폴백 · 60초 뒤 재시도 · 쇼핑 상품 한 번만 고름 · 카드) · `settings_engine` 77 · 회귀 `arrive_arw` `journey_alerts` `overlay_reco` `loading_chars` `screen_set_js` `commute_cmw`. CI 매트릭스 94 → 96.
- **기기 미검증(정직)**: 실제 폰에서 하차 7분 전 추천 알림 문구가 예전과 같은 모양으로 뜨는지(엔진 답이 오는 데 최대 2.5초 더 걸릴 수 있음), 서버에서 받은 실제 가게 목록 크기(최대 300곳 전송)로 속도 괜찮은지. workers.dev 가 샌드박스에서 막혀 실제 서버로는 못 봤다.
- **알려진 한계(아직 웹인 것)**: 작은 화면(PiP) 문구(`_arrPipText`) · 오버레이 광고 줄(`_arrAd`)·오버레이 새로고침의 `_arrBuildAlert('',…)` 호출(엔진 답이 없으면 예전 본체) · `_arrShopLine`/`_arrHook` 을 직접 부르는 곳(홈 브리핑 등) · 쿠팡 상품 고르기 · 가게 목록 받기 · 배달 앱 열기.
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s57) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-19s57` (s53~s56 내용 포함). 새 APK 설정 탭에서 '하차 전 추천 문구를 엔진이 만들기'를 켜고 하차 7분 전 추천 알림이 정상으로 뜨는지 확인.
- **다음 조각**: 2단계 = PiP 문구·오버레이 광고 줄을 같은 엔진 호출에서 함께 받기(`recoAlert` 결과에 `pip`·`ad` 추가) → 3단계 = 쿠팡 상품 고르기·가게 목록.

## 2026-10-19 엔진 s58 — 5번 5단계 다섯째 조각(추천 문구 2단계): 작은 화면(PiP) 문구와 오버레이 추천 줄도 엔진이 만든다
- **YJ 지시**: "2단계 시작해줘". s57(알림 본문)에 이어 같은 알림에서 쓰는 두 가지 — 작은 화면 문구(`_arrPipText`)와 오버레이 추천 줄(`_arrAd`: 가게/상품 이름 + 감성 한 줄)을 엔진이 만든다.
- **엔진 `engine/reco-text.js`**(버전 `route-v2-2026-10-19s58`): `recoAlert` 결과에 `pip:{title,lines}` 와 `ad:{k,a,b,m,pn,piIdx}|null` 이 함께 온다(알림 본문 그대로 쓸 때). 꼬리 문구 풀 · 줄 자르기(`_pipClampLines`: 한 줄 46자 · 전체 7줄) · 가게/상품 한마디 표(`_ARR_FOOD_PITCH`) · `_arrShopSay` · `_stripEmoji` 도 웹 코드를 글자 그대로 옮겼다(생성 스크립트). 무작위 흐름은 본문과 이어진다(같은 씨앗). `ad.piIdx` = 보낸 가게 목록에서의 번호 — 앱이 원래 목록 항목을 다시 붙여 `[맛집 보기]` 가 예전처럼 그 가게를 연다. 새 길: `POST /reco-text {op:'pip', slot, dest, body, nowMs, seed, a:{remMin,menu,brunch,hook,spots,shopN,shopT,cx,dinner}}` → `{v:1, pip}` — 본문 한 줄이 AI 문구로 바뀐 경우(`_arrAiCopy`)에만 작은 화면 문구를 다시 만든다(가게 목록·최근 기록은 보내지 않는다).
- **웹 `www/index.html`**: `_arrFireAlertNow` 안의 `send` 가 둘로 나뉨 — `sendNow(body, ePt, ePad)`(예전 본체; 엔진 값이 있으면 그걸, 없으면 `_arrPipText`·`_arrAd`) + 겉옷 `send`(엔진이 만든 본문(`_RTX.pad`)이면 본문 그대로일 때 함께 온 pip/ad 사용, AI 문구로 바뀌었으면 `_rtxPipFetch` 로 pip 만 다시, 실패하면 예전). 모양이 이상한 pip/ad 는 쓰지 않는다. 설정 카드 문구에 '작은 화면·오버레이 추천 줄' 추가. `loading_chars` 의 원본 모양 확인(`_pipReco.ad = _arrAd(...)`)을 겉옷 모양도 받게 고침.
- **시험**: `reco_text` 23(pip/ad 모양 · 가게 번호 일치 · 줄 길이 자르기 · recoPip 이상한 입력 · op=pip 길 포함) · `reco_rtx.ui` 26(대조 시험이 알림 본문뿐 아니라 pip·ad 까지 같음 + **실제 발송 함수 `_arrFireAlertGo→_arrFireAlertNow` 를 끝까지 돌려** 알림 제목·본문·작은 화면·`_arrLast.ad` 가 스위치 껐을 때와 같음(6가지 상황 × 씨앗 3) · AI 문구로 바뀐 경우 pip 만 다시 묻기 · op=pip 가 예전 `_arrPipText` 와 같음 · 이상한 pip 은 안 씀) · 회귀 `settings_engine` 77 `arrive_arw` `journey_alerts` `overlay_reco` `loading_chars` 45 `screen_set_js` `commute_cmw` `notif_npol`. CI 매트릭스 수 변화 없음(96).
- **기기 미검증(정직)**: 폰에서 작은 화면·오버레이 추천 줄이 예전과 같은 모양인지, [맛집 보기] 가 그 가게를 여는지. workers.dev 가 샌드박스에서 막혀 실제 서버로는 못 봤다.
- **알려진 한계(아직 웹인 것)**: 오버레이 새로고침의 `_arrBuildAlert('',…)`·`_arrAd` 호출(엔진 답이 없으면 예전) · 홈 브리핑이 `_arrCx/_arrVar/_ARR_*` 를 직접 쓰는 곳 · 쿠팡 상품 고르기(`_arrPickShopItem`) · 가게 목록 받기(`_arrEnsureFood`) · AI 위로 문구 요청(`_arrAiCopy`).
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s58) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-19s58` (s53~s57 포함). 설정 탭의 '하차 전 추천 문구를 엔진이 만들기'가 켜져 있으면 알림·작은 화면·오버레이 줄 모두 엔진이 만든다.
- **다음 조각(3단계)**: 쿠팡 상품 고르기 + 가게 목록 받기를 엔진으로, 오버레이 새로고침 미리보기도 같은 길로.

## 2026-10-19 엔진 s59 — 5번 5단계 여섯째 조각(추천 문구 3단계): 쿠팡 상품 고르기·도착지 가게 목록 받기·오버레이 시연 줄을 엔진이 한다
- **YJ 지시**: "다음단계해줘" (s58 의 '다음 조각(3단계)'). 앞 단계에서 입력으로 받기만 하던 두 가지 — 쿠팡 상품 *고르기*(`_arrPickShopItem`)와 도착지 가게 목록 *받기*(`_arrEnsureFood`) — 를 엔진이 하게 하고, 설정 화면의 오버레이 시연 버튼(`_ovlAdSample`)도 같은 길로 줄을 받는다.
- **엔진 `engine/reco-text.js`**(워커 사본 `// ===== reco-text (…)`, 버전 `route-v2-2026-10-19s59`): 요청에 선택 값 추가(없으면 s58 과 똑같이 동작). `pickShop:1`+`shopRecent:[이름]` → 쇼핑 시간대에 쇼핑 서버 목록(`shopLoad()` 60초 메모리)에서 `shopPick`(추천 100선)의 위 30개 중 최근 추천하지 않은 것을 씨앗 무작위로 고른다 → 응답 `shopItem:{n,u,i,_cat,_t}`(링크·그림 주소가 http(s) 가 아니면 쓰지 않음), 못 고르면 `shopMiss:true`. `foodPref:'server'`+`loc:{lat,lng}`(역·정류장 좌표 — 집·직장 좌표 아님; 한국 범위 밖이면 무시, 소수 5자리로 다듬음) → 엔진이 맛집 서버(`gildongmu-food /food?r=800&limit=200`, 1.8초 제한, 10분 메모리)에서 받아 그 목록으로 만들고 `foods:[{n,c,a,d}]`(최대 200)로 돌려준다(번호 `placeIdx`·`piIdx` 가 이 목록 순서); 못 받으면 앱이 보낸 `food` 를 쓴다. `recoAlert(body, ext)` 는 여전히 순수(바깥 자원은 `ext` 로 받음), `handleRecoText` 가 필요할 때만(쇼핑 시간대·좌표 있음) 불러오고 `rtxSetLoaders` 로 시험이 가짜를 끼운다.
- **웹 `www/index.html`**: `_arrFireAlert` — 스위치가 켜져 있으면 앱이 맛집을 먼저 받아 기다리지 않고(`_arrEnsureFood` 건너뜀) 바로 `_arrFireAlertGo`. `_rtxPrefetch` 는 서버 목록이 신선하지 않으면 도착지 좌표(`_arrFoodCoord` — 예전 `_arrEnsureFood` 의 좌표 계산을 뽑아냄)를 `loc` 로 보내고 앱이 가진 목록(내장·맛집 탭)은 대신 쓸 것으로 함께 보낸다; 쇼핑 시간대는 앱이 고르지 않고 `pickShop`·`shopRecent`(= `arrShopLog`) 만 보낸다. 응답의 `shopItem` 은 앱이 '최근 추천' 기록(`_arrShopMark`)을 남기고 `_rtxShopPre` 에도 둔다; `foods` 는 모양을 검사해 `_arrFoodCache` 를 채운다(순서가 어긋나면 통째로 쓰지 않고 폴백). `shopMiss` 면 앱이 예전 규칙으로 하나 골라 한 번 더 묻는다. 대기 한도는 목록·상품을 받을 땐 4초(그 밖 2.5초). **폴백**: 엔진이 답을 못 주면(`_RTX.pack` 없음) `_arrFireAlertGo` 가 예전 길(`_arrEnsureFood` 후 예전 본체)로 이어가고, 쉬는 60초 동안은 처음부터 예전 길. 시연 버튼 `_ovlRecoDemo` — 켜져 있으면 `_rtxDemoAd`(같은 `/reco-text` 의 `ad`; 쿠팡은 22시로 시각을 맞춰 `pickShop`)로 줄을 받고, 안 되면 그 종류는 `_ovlAdSample`(예전), 꺼져 있으면 동기 그대로. 카드·엔진 설정 화면 문구 갱신.
- **시험**: `reco_text` 54(상품 고르기: 위 30개 안·씨앗 결정성·최근 피하기·앱이 보낸 상품 우선·목록 없음 shopMiss·이상한 링크·날씨 반영·비쇼핑 시간대 / 가게 목록: 서버 목록 우선·앱 목록 대신·foodPref 없으면 무시·ad 와 번호 일치 / 연결부: 필요할 때만 부름·좌표 다듬기·이상한 좌표 7종·불러오기 예외·op=pip 은 안 부름·옛 앱 요청 그대로) · `reco_rtx.ui` 42(진짜 index.html + 진짜 `handleRecoText`: 기존 대조 전수 그대로 통과 + 서버 목록 없을 때 앱이 기다리지 않고 좌표만 보냄·캐시 채움·기록 · 신선하면 좌표 안 보냄 · 엔진이 못 받으면 앱 목록 · 이상한 목록은 통째로 폴백 · 404/bad 때 예전 길(맛집 받기 1회) · 꺼짐/쉬는 중 예전 길 · 상품은 앱이 안 고르고 기록만 알림→엔진 상품·기록 · shopMiss 때 앱이 한 번만 고름 · 시연 가게/쿠팡/폴백/꺼짐/기능없음).
- **기기 미검증(정직)**: 폰에서 알림이 최대 4초 늦을 수 있는지(엔진이 맛집 서버를 부르는 시간 포함), 엔진이 받아 온 실제 맛집 목록으로 만든 문구·[맛집 보기]가 맞는 가게를 여는지, 쇼핑 서버가 잠깐 안 될 때 shopMiss 폴백이 실제로 자연스러운지. workers.dev 가 샌드박스에서 막혀 실제 서버(쇼핑·맛집)로는 못 봤다. 엔진 쪽 쇼핑 목록은 서버 `/shop` 데이터라 앱에 내장된 목록과 상품이 조금 다를 수 있다(쇼핑 탭 엔진과 같은 정책).
- **개인정보**: 엔진에 새로 가는 것은 도착지 *역·정류장* 좌표와 최근 쿠팡 추천 이름뿐 — 집·직장 좌표는 보내지 않는다(`_homeBriefCoord('dest', 역이름)`·`_arrAlightCoord` 만 사용).
- **알려진 한계(아직 웹인 것)**: 홈 브리핑이 `_arrCx/_arrVar/_ARR_*` 를 직접 쓰는 곳 · AI 위로 문구 요청(`_arrAiCopy`) · 오버레이 새로고침의 `_arrBuildAlert('',…)` 호출은 시연 버튼만 엔진으로 옮김(실제 알림 경로는 이미 엔진) · 맛집 탭 자체의 목록 받기(`_foodServerBase` 계열)는 별개.
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s59) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-19s59` (s53~s58 포함). 설정 탭의 '하차 전 추천 문구를 엔진이 만들기'가 켜져 있으면 쿠팡 상품·가게 목록도 엔진이 한다. 설정 탭 오버레이 시연 버튼으로 줄이 나오는지, 하차 7분 전 알림이 평소보다 눈에 띄게 늦지 않은지 확인.
- **다음 조각 후보**: ① 알림 대상 만들기·추적 흐름 ② 오버레이 보임 시점 ③ 출퇴근 경로 미리 받기(개인 장소 결정 필요) ④ 이후 홈 결과 카드/화면 → MapLibre 지도 → 웹뷰 제거.

## 2026-10-19 엔진 s60 — 5번 5단계 일곱째 조각(알림 대상): 환승 하차역·최종 하차 대상 만들기를 엔진이 한다
- **YJ 지시**: "다음 진행해줘". s59 의 '다음 조각 후보' 중 ① 알림 대상 만들기를 했다. (② 오버레이 보임 시점은 매 틱 동기 판단이라 비동기 엔진에 맞게 별도 설계가 필요해 뒤로 미뤘다 — 아래 '남은 것'.)
- **왜**: 앞 화면 알림 시점은 이미 엔진(`/ride-alert`)이 정하지만, 그 판단의 입력인 '어느 역이 환승 하차역·최종 하차인가'(`window._transitAlertTargets`·`_transitSeqIdx`)는 웹(`_buildTransitAlertTargets`)이 DOM 노드(`_transitNodeData`)에서 만들어 대기 모드(`_ovlStandbyBuild` cfg)와 폴백에 넘겼다. 같은 규칙이 엔진 `raTargets` 에 이미 있어, 웹이 두 번 계산하던 것이다.
- **엔진 `engine/ride-alert.js`**(워커 사본 `// ===== ride-alert (…)`; 버전 `route-v2-2026-10-19s60`): `POST /ride-alert {op:'targets', nodes:[{k,l,n}]}` → `{v:1, op:'targets', targets:[{seqPos,nodeIdx,name,kind:'transfer'|'dest',nextLine?}], seq:[노드 인덱스], nt}`. 알림 판단은 하지 않는다. 노드는 400개까지만 본다. `op` 가 없으면 예전 그대로(알림 판단).
- **웹 `www/index.html`**: 스위치는 새로 만들지 않고 기존 `ra`(`gdm_ra`, '하차·환승 알림 시점을 엔진이 정하기')에 합쳤다 — 카드·엔진 설정 화면 문구에 '어느 역에서 울릴지'를 더했다. `_buildTransitAlertTargets` 는 겉옷: 스위치 켜짐·쉬는 중 아님이면 `_raBuildTargets`(엔진에 노드의 노선·역 이름만 보냄, 좌표 없음; 대상은 답이 온 뒤 채움, 그 전엔 비어 있어 알림 판단은 대상이 온 뒤부터), 아니면 `_buildTransitAlertTargetsLocal`(예전 규칙, 동기). 보낸 알림 기록(`_transitAlertFired`)은 빌드 시작 때 비운다(예전과 같다). **폴백**: 2.5초 무응답·404·오류·이상한 응답(모양·인덱스 범위 검사)이면 `_transitTargetsCompute`(예전 규칙)로 바로 채우고 60초 쉰다; 기다리는 동안 경로(`_transitNodeData`)가 바뀌면 낡은 답은 버린다; 스위치를 끄는 순간 대상이 비어 있으면 예전 규칙으로 채운다. 답이 오면 대기 모드(`_ovlStandbyPush`)에 바로 다시 맡긴다.
- **시험**: `ride_alert` 19(대상 op: 모양·이상한 입력(아주 많은 노드 포함)·예전 계산식 참고 구현과 무작위 경로 3000개가 같음·op 없으면 예전·워커 내장본 포함) · `ride_ra.ui` 33(진짜 index.html: 켜면 엔진이 대상을 만들고 예전 규칙과 같음·좌표 없음 · 대상 오기 전엔 비어 있어 알림 판단을 묻지 않음 → 온 뒤 알림 정상 · 404/bad/모양 이상/인덱스 범위 밖/무응답 폴백 · 경로가 바뀐 낡은 답 무시 · 꺼짐/쉬는 중은 동기 예전 규칙 · 끄는 순간 채움).
- **기기 미검증(정직)**: 폰에서 경로 확정 직후 대상이 늦게(최대 2.5초) 채워져도 첫 알림에 문제가 없는지, 대기 모드(앱을 가렸을 때)가 엔진이 만든 대상으로 같은 시점에 울리는지. workers.dev 가 샌드박스에서 막혀 실제 서버로는 못 봤다.
- **알려진 한계(아직 웹인 것)**: 추적 흐름 조율(`_startTransitGpsTracking`·`_updateTransitGps` — GPS·스크롤·타이머와 얽힌 입출력) · 오버레이 추천 줄 *보임 시점*(`_ovlState` 안, 도착 3분 전~30초 뒤·TTL 25분·닫음 기록 — 매 틱 동기 판단) · 출퇴근 경로 미리 받기(개인 장소 결정 필요) · 홈 브리핑이 `_arrCx` 등을 직접 쓰는 곳 · AI 위로 문구 요청.
- **YJ가 할 일**: Cloudflare route-v2 워커에 `engine/route-v2-worker.ascii.js`(s60) 전체를 붙여 넣고 Deploy → 루트 `version` = `route-v2-2026-10-19s60` (s53~s59 포함). 설정 탭의 '하차·환승 알림 시점을 엔진이 정하기'가 켜져 있으면 대상도 엔진이 만든다 — 경로를 확정하고 환승·하차 알림이 평소처럼 뜨는지 확인.
- **다음 조각 후보**: ① 오버레이 보임 시점(엔진이 '보임 구간'을 절대 시각으로 알려 주고 앱은 그 안인지만 보는 설계) ② 추적 흐름 조율 ③ 출퇴근 경로 미리 받기(개인 장소 결정 필요) ④ 이후 홈 결과 카드/화면 → MapLibre 지도 → 웹뷰 제거.

## 2026-10-19 엔진 s61 — 오버레이 추천 줄 보임 창을 엔진 값으로 · 실기기 문제 수정(홈 입력·단추·키보드) · 도착 :50 / 정차 20초
- **YJ 지시**: "1번 진행해줘"(오버레이 보임 시점) + 실기기 제보 3건: "홈화면 키보드가 안 열려 · 위치감지/경로탐색이 원래 둥글었는데 이상해졌어 · 스크롤하면 잔상(다른 탭도 화면이 깨져)" + "지하철 도착을 확정하는 마커도 20초쯤 빠른 것 같다 · 도착 후 역에 머무는 시간을 20초로 · 기존 규칙을 수정".
- **① 오버레이 추천 줄 보임 창(엔진)**: `engine/ride-eta.js` `rideArrive` 의 `reco` 가 `{fromMs, untilMs, ttlMs}`(7분 전 ~ 도착 30초 뒤, 묵은 추천 25분)를 준다. 앱 `_arrAlightEta`/`_arrHomeEta` 가 이 창을 `reco` 로 실어 `_ovlState` 가 지금 시각이 창 안인지만 비교한다. 창이 없으면(엔진 답 전·옛 응답) 예전 규칙(남은 초)으로 그대로. 한 정거장 전(`_ovlFinLv`)·닫음·정책·끄기·테스트 미리보기는 예전과 같다. 시험: `overlay_reco.ui` 70(남은 시간 9가지가 예전 규칙과 같음·묵은 추천 숨김·창 우선·이상한 창 폴백), `ride_eta` ttlMs.
- **② 홈 입력줄 단추 모양(네이티브)**: 홈 입력줄은 칸 모서리 `r:0`(네모)인데 단추도 같은 값을 써서 네모가 됐다 → `ScreenView.drawInbar` 단추 둥글기를 `r>0 ? r : 9`(웹과 같은 9)로. 
- **③ 키보드(네이티브 `ScreenView`)**: 정확한 원인은 못 찾았다(실기기에서만 보임 — 샌드박스에 안드로이드 없음). 방어 3가지: 편집 시작 직후 키보드 올리기를 배치 뒤에도 두 번 더 시도(`kbSoon`) · 시작 500ms 안에 포커스가 잠깐 빠지면 되찾음 · 시작 600ms 안엔 '화면 밖'이라며 편집을 닫지 않음. **실기기 확인 필요.**
- **④ 실험 카드 한 번 끄기**: 위 세 가지가 '네이티브 경로 입력(실험)' 카드에서 나와, 이 빌드에서 한 번만 `gdm_scrh_on` 을 꺼 웹 카드(예전 모습)로 돌려놓는다(표시 `gdm_scrh_mig1`). 설정에서 다시 켜 볼 수 있다. 시험 `screen_home_js.ui` 13.
- **⑤ 스크롤 잔상·화면 깨짐**: **원인 미확인.** 사진(홈·커뮤니티 설정)에서 글자가 위아래로 겹쳐 보이는 곳은 모두 네이티브 화면/영역이 웹 위에 얹힌 곳이다. 네이티브 화면은 스크롤 중 웹 쪽이 숨겼다 보였다 하며 따라가는데(`_scrKit.tick` 60~200ms·영역 `wake`), 그 사이 겹쳐 보이는 것으로 의심. 코드로는 재현 못 함 → YJ 가 설정의 네이티브 스위치(경로 입력·게시판·실시간소통·탭 막대·뉴스·설정·맛집·쇼핑·경로 화면)를 하나씩 끄며 어느 것을 끄면 사라지는지 알려 주면 좁힌다.
- **⑥ 도착·정차 규칙(엔진 `RIDE_ETA_DEFAULTS`)**: `planSecOffset` 30→**50**(06:38 → 06:38:50 에 도착으로 확정; 화면 시각은 여전히 06:38) · `stopDwellSec` 12→**20** · `markerDwellSec` 12→**20**. 웹 폴백 `_RT_NOCOVER_DWELL_MIN` 0.2→20/60. 시험 `ride_eta` 97 갱신. '20초 빠르다'는 도착 확정 시각(:30)이 실제 도착보다 이르다는 뜻으로 읽어 +20초로 옮겼다 — 아니면 `planSecOffset` 한 숫자만 바꾸면 된다.
- **YJ가 할 일**: 워커에 `engine/route-v2-worker.ascii.js`(s61) 붙여 넣고 Deploy → `version` = `route-v2-2026-10-19s61`. 새 APK 로 ①~④ 확인(홈 카드는 웹 카드로 보임 · 실험을 다시 켜면 단추 둥글기·키보드 확인).
- **기기 미검증**: 모두. 특히 ③ 키보드와 ⑤ 잔상.

## 2026-10-19 엔진 s62 — 오버레이 하단 줄 깜박임 · 네이티브 경로 화면 스크롤 잔상 · 버스 정류장 새로고침
- **YJ 제보 3건**: ① "도착 즈음 나오는 오버레이가 금방 사라져 · 추천문구도 앱은 나오는데 오버레이는 안 나오거나 빨리 사라져 · 하단문구가 계속 사라졌다 나왔다 해" ② "네이티브 경로 화면을 켜면 나오는 스크롤 잔상도 해결해줘" ③ "버스정류장이 계속 새로고침돼서 볼 수가 없어 · 현재 위치가 이전 조회 대비 100m 미만이면 재조회하지 마 · 시간이 바뀌는 건 계속 새로고침하지 말고 시간만 조용히 바꿔".
- **① 오버레이 하단 줄(추천 · 내릴 준비)**: **정확한 원인은 못 찾았다**(실기기 값이 필요). 확인한 것: 추천 줄은 `_ovlFinLv !== 1`(한 정거장 전이 아닐 때)이고 엔진 창 안일 때만, 한 정거장 전이면 같은 자리에 내릴 준비 줄이 대신 뜬다 → 두 줄이 한 자리를 번갈아 쓰고, 진행 칸(`_pipHereIdx`)·승차 판정이 흔들리면 번갈아 깜박일 수 있다. 추천이 하차 7분 전이 아니라 3분 전쯤 늦게 만들어지는 것도 보였다(사진: 알림 '하차 3분 전') — 늦게 만들어지면 이미 한 정거장 전이라 오버레이엔 내릴 준비만 뜬다. 이것도 원인 미확인.
  - **보강(엔진 `rideArrive`)**: `reco.holdMs`(기본 30초, `ARRIVE_DEFAULTS.rowHoldSec`). **앱 `_ovlLines`**: 한 번 보인 줄은 마지막으로 보인 뒤 holdMs 동안 그대로 둔다(우선순위 내릴 준비 > 추천 > 없음, 낮은 줄로 내려가는 것만 붙잡음 · 올라가는 건 즉시). [확인]으로 닫은 추천·기능 끔·앱 종료 예약 시각 이후엔 붙잡지 않는다. 엔진 답에 holdMs 가 없으면(옛 엔진) 예전과 같다. 끄기 `window._ovlRowHoldOff = true`.
  - **진단**: 줄이 바뀔 때마다 설정 > 진단에 `하단줄` 로그(전→후 · 진행칸 · 한정거장전 · 남은초 · 창 안/밖)를 남긴다 — 또 깜박이면 이 로그로 원인을 가린다.
- **② 스크롤 잔상(웹 `www/index.html`, 네이티브 영역 팩토리)**: 확인한 원인 후보 2개를 고쳤다 — (a) 예전엔 네이티브를 숨기기 *전에* 웹 글자를 먼저 되돌려서, 비동기 `hide` 가 끝나기까지 1~3프레임 동안 '옛 자리 네이티브 글자 + 스크롤된 웹 글자'가 겹쳤다 → 이제 `P.hide` 가 끝난 뒤(`done`)에 웹 글자를 되돌린다(겹침 대신 한두 프레임 글자가 빈다) · `webSync` 도 갱신·숨김 중엔 웹을 되돌리지 않는다. (b) 스크롤 이벤트 → rAF → tick 비교 → 숨김까지 늦던 것을, 떠 있는 영역은 스크롤 이벤트 안에서 곧바로 `hideNow()`(문서 스크롤 · 영역이 든 요소 스크롤; 가로 스크롤 요소 `scrollEl` 자신은 제외). 끄기 `window._htlHideOrderOff`(예전 순서) · `window._htlHideNowOff`. **기기 미검증** — 이게 진짜 원인인지는 폰에서 확인해야 한다. 안 고쳐졌으면 스위치를 끄고 쓰게 하고(`gdm_htl_on` 기본 꺼짐), 어느 화면에서 어떻게 겹치는지 영상이 필요하다.
- **③ 버스 정류장(웹)**: 새로고침처럼 보이던 두 원인을 고쳤다 — (a) 도착 갱신이 '내 정류장만(partial)' → '이웃 병합(최종)' 두 번 그리는데, 노선이 더 적은 partial 을 '구성이 바뀜'으로 보고 줄을 허물고 펼침 애니메이션·'방향 확인 중…'으로 다시 만들었다 → 이미 줄이 있는 카드는 partial 에서 구조를 건드리지 않고 시간만 제자리 갱신, 최종에서 구성이 정말 바뀌어도 애니메이션 없이·방향 글자 유지(`card._dirTxt`)로 조용히. (b) 주변 정류장: 화면에 목록이 있으면 다시 그리지 않고(🔄 force 제외), 기준 위치는 *화면에 그린* 자리(`_busNearShownPos`), **100m 미만이면 60초가 지나도 재조회하지 않고** 도착 시간만 갱신(`_BUS_MOVE_M` 150→100 · `_busCoordClose` 200→100 · 탭 복귀 250→100). 끄기 `window._busQuietOff = true`.
- **시험**: `ride_eta` 97(holdMs) · `overlay_reco.ui` 76(⑥ 하단 줄 붙잡기 6건) · `htl_native_js.ui` 37(⑤-3 잔상 2건) · `bus_quiet.ui` 6(새 파일; 옛 코드에선 4건 실패 확인).
- **YJ가 할 일**: 워커에 `engine/route-v2-worker.ascii.js`(s62) 붙여 넣고 Deploy → `version` = `route-v2-2026-10-19s62`(s53~s61 포함). 새 앱에서 ② 네이티브 경로 화면을 켜고 스크롤 잔상, ③ 버스 탭 새로고침, ① 도착 즈음 하단 줄을 확인.
- **기기 미검증**: ①②③ 전부. 특히 ① 은 원인 미확인(보강만).

## 2026-10-19 엔진 s63 — 네이티브화 4단계 첫 조각: 저녁·야식·쇼핑 'AI 위로 문구'를 엔진이 받아 끼운다
- **옮긴 것**: 예전엔 앱(`_arrAiCopy`)이 AI 서버(`/ai-talk` · `nightsnack`)에서 한 줄을 받아 검사(60자 이하 · 정치/분쟁 금지어)하고 본문 네 번째 줄에 조사를 맞춰 끼운 뒤 작은 화면 문구를 엔진에 다시 물었다(왕복 2번 + 앱 계산). 이제 앱이 `/reco-text` 에 `aiCopy:1` 만 얹어 보내면(저녁·야식·쇼핑, 상황 문구가 약할 때 = `hookStrong` 아님, 본문 4줄 이상) 엔진이 AI 서버에서 받아(2.5초 제한) 같은 검사를 하고 끼운 뒤 **작은 화면 문구·오버레이 줄까지 그 본문으로** 한 번에 돌려준다(같은 씨앗 → 나머지는 그대로). 엔진 `engine/reco-text.js`: `rtxAiClean` · `rtxLoadAi` · `rtxAiSubject` · 로더 `ai`(시험용 주입) · 응답 `aiTried:true`(받아 보았다) / `ai:true`(끼웠다).
- **앱(`www/index.html`)**: `_rtxPrefetch` 가 저녁·야식·쇼핑에 `aiCopy:1`(대기 +3초) · `_rtxUnpack` 은 `ai` 키만 빼고 `aiTried` 는 남김 · `_arrFireAlertNow` 는 `a.aiTried===true` 면 웹 `_arrAiCopy` 와 pip 재요청을 건너뛴다. **폴백**: 엔진이 꺼졌거나 실패·옛 엔진(aiTried 없음)이면 예전 웹 길(`_arrAiCopy`) 그대로. 끄기 `window._rtxAiOff = true`.
- **엔진이 AI 를 못 받은 경우**: 본문은 AI 줄 없이 그대로 + `aiTried:true` (앱이 또 부르지 않는다 — 같은 서버를 두 번 두드려 봐야 같은 결과).
- **시험**: `reco_text` 에 ⑦ 구간(rtxAiClean · 끼우기 · 결정성 · hookStrong 제외 · 연결부 aiCopy · 실패 5종) · `reco_rtx.ui` 에 s63 5건(엔진이 받음 · 못 받음 · 점심 제외 · 옛 엔진 · 끄기).
- **YJ가 할 일**: `engine/route-v2-worker.ascii.js`(s63) Deploy → `version` = `route-v2-2026-10-19s63`. 저녁/야식 도착 알림에 AI 한 줄이 들어가는지 확인.
- **기기 미검증**: 전부(웹 시험은 가짜 AI 서버로만).

## 2026-10-19 엔진 s64 — 네이티브화 4단계 둘째 조각: 출퇴근 경로 '미리 받기' 때를 엔진이 정한다
- **YJ 지시**: "다음 네이티브 진행해줘" → 남은 후보 중 '출퇴근 경로 미리 받기 판단'(개인 장소 문제는 *시각만* 엔진에 보내기로 해서 해결).
- **옮긴 것**: 예전엔 웹 `_commutePrefetch` 가 '지금이 출근/퇴근 시각의 -45분 ~ +20분인가 · 설정한 요일인가 · 같은 구간을 20분 안에 이미 받았나'를 정했다. 이제 설정 스위치 `gdm_cmw`(출퇴근 브리핑 시각을 엔진이 정하기; 같은 스위치)가 켜져 있으면 엔진 `/commute-alarm` `op:'pre'`(`cmPreDue` · `engine/commute-alarm.js`)가 `due:['morn','eve']` 를 돌려준다. 앱은 due 순서대로 **저장된 장소(좌표)가 있는 첫 구간만** 받는다(한 번에 한 구간 — 예전과 같다).
- **엔진에 가는 것**: `nowMs · morn · eve · days · ageMorn · ageEve`(그 구간을 마지막으로 받은 지 몇 ms; 없으면 null) — **집·회사 이름과 좌표는 가지 않는다**(경로 요청은 예전처럼 앱이 직접). 앱에 남은 것: 온라인/데이터 절약/화면 숨김/진행 중 같은 기기 상태 검사 · 장소 조회 · 받은 시각 기록 · 실제 경로 요청.
- **폴백(자동)**: 스위치 꺼짐 · 엔진 응답 없음(2.5초)·오류·이상한 응답 → 예전 규칙(`_cmPreDueLocal`)으로 바로 정하고 60초는 엔진에 묻지 않는다(브리핑 시각 판단과 같은 쉬기 상태 공유). 카드 문구는 그대로(엔진 설정 화면과 같아야 해서) — 응답 횟수에만 포함.
- **시험**: `commute_alarm` 21(예전 웹 규칙 얼린 사본과 5천 조합 대조 · 자정 넘김 · 20분 경계) · `commute_cmw.ui` 30(새 구간 8건: 꺼짐 · 39시각×4설정 대조 · 엔진에 장소 안 감 · 20분 중복 · 장소 없음 · 404/bad/무응답 폴백).
- **YJ가 할 일**: `engine/route-v2-worker.ascii.js`(s64) Deploy → `version` = `route-v2-2026-10-19s64`(s63 포함). 설정 > '출퇴근 브리핑 시각을 엔진이 정하기'를 켠 상태에서 출근 45분 전쯤 미리 받기가 도는지(`window._cmPf.last` — 개발자 콘솔에서만 보임; 설정 진단에는 아직 안 나옴).
- **기기 미검증**: 전부(웹 시험은 가짜 경로 요청으로).

## 2026-10-19 엔진 s65 — 네이티브화 4단계 셋째 조각: 홈 'AI 승무원' 브리핑 문장을 엔진이 만든다 (새 스위치 `gdm_e2`)
- **YJ 지시**: "일단 다 하고 확인하고 수정하자. 남은 네이티브화해줘. 모든 계산은 엔진이 앱은 그림그리기만" → 남은 계산을 한꺼번에 옮기고, 끝난 뒤 YJ와 확인·수정 단계.
- **새 공용 스위치**: 설정 '남은 계산을 엔진이 하기'(`gdm_e2`, 기본 꺼짐 · `_e2On/_e2Use/_e2Ask`). s65 이후 조각은 모두 이 한 스위치 아래에 둔다. 엔진에 물을 수 없으면(응답 없음 2.5초·오류·이상한 응답) 예전 웹 방식으로 바로 이어가고 60초 쉰다.
- **옮긴 것**: 홈 맨 위 AI 승무원 카드의 문장(소요시간 · 환승 안내[버스 첫 구간·환승 횟수·장거리] · 도착 시각/노선도 다음 열차·막차 후 첫차 · 혼잡 한마디 · 날씨·준비물 · 목적지 미설정 · 마무리 문구)을 엔진 `/home-brief`(`engine/home-brief.js` `homeBrief`)가 만든다. 앱은 '지금 상태'(출발/도착 이름 · 시 · 혼잡도 · 휴일 · 소요 · 날씨 · 경로 구간 · 다음 열차 · 난수 하나)만 보내고, 돌아온 조각(`{b}` 굵게 · `{stn}` 역 배지 · `{ln}` 노선 배지 · `{id}` 갱신용 칸)을 색 배지·굵은 글씨로 그리기만 한다(`_hbInput/_hbGood/_hbRender`). 으로/로 조사 · 문장 순서 · 문턱값은 모두 엔진.
- **폴백**: 스위치 꺼짐 · 엔진 실패 → 예전 문장 만들기(`buildLocal`) 그대로. 비상 끄기 `window._hbeOff=true`. 더 최신 브리핑이 오면 늦은 답은 버린다(`_homeWxSeq`).
- **시험**: `home_brief`(엔진 20) · `home_brief_e2.ui`(26: 꺼짐/켜짐 카드 HTML 이 글자 하나까지 같음[경로 종류×시간대×날씨 54 + 노선도 6 + 특수 7] · 엔진에 보내는 값은 상태만 · 404/bad/무응답/쉬기/_hbeOff/늦은 답 폐기) · `settings_engine` 78(본문 높이 상한 6000→7000, 카드가 늘어서).
- **기기 미검증**: 전부.

## 2026-10-19 엔진 s66 — 네이티브화 4단계 넷째 조각: 경로 결과 정리(겹침 정리 · 탭 대표 · 왜 이 경로 · 승차/대기/도보 나눔)를 엔진이 한다
- **옮긴 것**: 경로 응답을 받은 웹이 하던 `_pathSig/_dedupPaths`(같은 노선·승하차는 하나 · 더 짧은 쪽 · 탭 합치기 · 소요/환승/종류 같은 것 제거) · `_routeWhyText`('가장 빨리 도착하는 경로예요…') · `_routeTimeSplit/_routeSplitText`('전체 N분 · 승차 · 대기 · 도보·환승')를 엔진 `engine/route-view.js`(`rvAnnotate`)가 같은 규칙으로 한다. **응답 시간 늘지 않음**: 별도 왕복 없이 같은 경로 응답에 `result.rv` 로 실린다(요청에 `&rv=1` 이 있을 때만; 스위치 `gdm_e2` 가 켜지면 앱이 붙인다). 엔진은 `ntAttachAll` 뒤에 돌아 환승 대기 정보가 붙은 값으로 나눈다.
- **앱**: `_rvApply`(맞는 모양일 때만: v=1 · 경로 수 일치 · 번호 범위/중복 · 탭 배열 · 문장 문자열) → 엔진이 남긴 번호 순서대로 고르고 `info._tabs/_rvWhy/_rvSplit` 를 채운다. 경로 객체의 `why`/`rvSplit` 으로 그리기(`_renderSplitRow`)는 엔진 값 그대로(총 소요가 지금 보이는 값과 같을 때만 — 타임라인 보정으로 달라졌으면 예전 계산). **폴백**: 스위치 꺼짐 · rv 없음(옛 엔진) · 이상한 rv → 예전 방식(`_dedupPaths` · `_routeWhyText` · `_routeTimeSplit`) 그대로.
- **시험**: `route_view`(엔진 8) · `route_view_rv.ui`(7: 무작위 경로 묶음 600개를 진짜 예전 웹 함수와 엔진에 똑같이 태워 남는 경로·탭·why·나눔이 같음 · `_rvApply` 거절 12종 · 그리기) · `route_view_e2e.ui`(4: 진짜 탐색 흐름 끝까지 — 꺼짐/켜짐/옛 엔진 세 경우 결과 동일, 요청에 rv=1 은 켜짐에서만).
- **YJ가 할 일**: `engine/route-v2-worker.ascii.js`(s66) Deploy → `version` = `route-v2-2026-10-19s66`(s63~s65 포함). 설정 > '남은 계산을 엔진이 하기'를 켜고 홈 AI 브리핑 문장 · 경로 결과 줄(전체 N분 · 승차/대기)이 평소와 같은지 확인.
- **기기 미검증**: 전부(진짜 Worker 의 `rv=1` 응답은 배포 뒤에 처음 실물로 돈다 — 시험은 같은 모듈을 가짜 서버에 태워 확인).
- **아직 앱에 남은 계산(다음 조각 후보)**: `_svcCheck`(운행종료 판단) · `_depCompareStart` · `_trkSubConfirmed/_trkApply` 카운터 · 오버레이 단계/남은 역 계산 · 승차 판정 · 버스 화면 묶음 · 쇼핑/맛집 점수.

## 2026-10-19 엔진 s67 — 칩(호선·카테고리·탭)을 눌러도 기다리지 않게: 엔진이 모든 칩 화면을 한 번에 계산해 보내고, 앱은 받아 둔 화면만 그린다
- **문제(YJ 보고)**: 네이티브로 바꾼 뒤 실시간 소통 호선 칩 · 도착역 맛집 칩 · 뉴스 카테고리 칩을 누를 때마다 엔진 왕복을 기다려 느렸다(칩마다 목록 전체를 엔진에 보내 새 화면을 받는 구조).
- **고침(규칙 그대로: 계산은 엔진, 앱은 그림만)**: 요청에 `alts` 를 실을 수 있다. 엔진이 `out.alts[칩]` 에 칩별 전체 화면을 같이 계산해 돌려주고, 앱은 각 화면을 "그 칩을 눌렀을 때 보냈을 요청의 해시(`fk`)"로 메모에 넣는다 → 칩 탭은 메모 적중(**네트워크 0회**). 앱은 플러그인에 넘기기 전에 `alts` 를 지운다. `alts` 가 없으면(옛 엔진) 예전 탭마다 요청하는 길 그대로.
  - 뉴스 `alts:'chips'` → `newsScreens`(카테고리 전부, 최대 12) · 맛집 `alts:'chips'` → `foodScreens`(최대 12) · 탭 막대 `alts:'tabs'` → `tabsScreens`(탭 전부, 현재 배지 유지) · 실시간 소통은 이미 받아 둔 방만 `alts:{호선:{f,d}}`(방 8개까지, 요청 본문 400000바이트 넘으면 중단, 이미 메모에 있으면 생략) → `chatScreens`(최대 24). 첫 응답 한 번에 첫 화면 + 나머지 칩 화면이 같이 온다.
  - 앱 `www/index.html`: 뉴스/맛집/`_scrKit`/채팅/탭의 `request()` 가 `post`(alts 포함 본문)·`fkOf`/`fkChip`/`altFkOf` 를 돌려주고 `splitAlts` 가 메모에 채운다. 이미 채운 키는 `S.altDone` 으로 다시 안 보냄. 메모 상한 24.
- **같이 들어간 길찾기 고침(엔진 route-v2 s40, 이 파일에 포함)**: '왜 다르지'(부평→두정이 카카오와 다름) — 급행 쌍 간선이 서로 독립이라 용산급행으로 신길까지 갔다가 천안급행으로 되돌아오는 길이 구로에서 기다리는 길과 시간이 같아 뽑히던 문제. ① 같은 선로를 되돌아가는 연결 금지(`trackEnds`) ② 급행→급행 갈아타기(5분 넘게 기다림)도 환승 1회로 센다. 라이브 D1 자료로 로컬 재현해 확인(평일 18:46 최소환승에서 더 이상 안 돈다). 회귀 시험 `route-v2/test/transfers.test.js`(옛 엔진은 가→다→나로 되돌아와 실패, 새 엔진 통과). route-v2 저장소 `8a74ee8`. 같은 시기 s37(같은 노선 일반↔급행 갈아타기도 환승 비용·횟수) · s38(급행 사이 중간역 되살림) · s39(전체 노선 점검: 4호선 초지·경춘선 광운대 복구)도 HANDOFF 에 따로 안 적혀 있었다 — 위 세 조각이 앱 워커에도 이미 들어 있다.
- **시험**: `news_engine` 130 · `food_engine` 111 · `chat_engine` 83 · `tabs_engine` 39 · `screen_news_js.ui` 28 · `screen_food_js.ui` 29 · `screen_bct_js.ui` 21 모두 통과(가짜 엔진이 alts 를 돌려주는 UI 시험: 칩 탭 = 요청 0회 · 옛 엔진 폴백 · 오래된 데이터 · 방 왔다갔다). `scene`/`widget_say` 의 1건 실패는 s67 이전부터 있던 것(옛 엔진도 같음).
- **YJ가 할 일**: `engine/route-v2-worker.ascii.js`(s67) 를 붙여 넣고 Deploy → `version` = `route-v2-2026-10-19s67`. (앱 APK 도 새로 빌드해야 칩 즉시 전환이 된다. 엔진만 올리면 옛 앱은 그대로, 앱만 올리고 엔진이 옛것이면 예전처럼 탭마다 요청.)
- **기기 미검증(전부)**: 첫 응답에 화면이 여러 개 실려 커진다(뉴스 8 · 맛집 6 · 탭 5 · 채팅 받은 방) — LTE 에서 첫 로딩이 얼마나 늘었는지 **재 보지 않았다**. 크게 느리면 `NW_ALTS_MAX`/`FOOD_ALTS_MAX`/`CHT_ALTS_MAX` 를 줄이거나 첫 화면만 먼저 보내고 나머지를 두 번째 요청으로 미룬다. 실시간 소통은 아직 안 받은 방은 미리 못 채운다(엔진이 방 내용을 가진 게 아니라 앱이 가진 목록을 보내는 구조 — 방 목록이 엔진 쪽 저장소로 가면 `alts:'chips'` 로 바꿀 수 있다).
- **이 s67 코드는 이전 클로드의 중단된 작업을 같은 설계로 다시 만든 것**(그 작업물은 저장소에 없었다).

## 2026-10-19 엔진 s68 — 네이티브화: 설정의 웹 카드 시트 6개를 엔진이 구성한 네이티브 하위 화면으로 (출퇴근 브리핑 · 캐릭터 시계 위젯 · 하차 5분 전 추천 시험 · 다른 앱 위에 표시 · 개발자 도구 · 갤럭시 절전)
- **YJ 지시**: "다음 네이티브 진행해줘. 목표는 100%네이티브 현기능 100%구현. 모든 계산은 엔진이 앱은 그림만 그린다 규칙 절대지켜."
- **옮긴 것**: 설정 첫 화면에서 '웹 카드 시트'로 열리던 6개 카드가 이제 네이티브 하위 화면이다. 제목·문장·요일 칸·시각·안내·경고·남은 시간 문구는 전부 엔진(`engine/settings.js` `settingsPageScreen`)이 만들고, 앱은 **기기 사실(`f.pf`)만** 읽어 보낸다(켜짐·저장값·읽은 숫자·입력칸 글자). 같은 입력 → 같은 출력.
  - 요청: `?cap=8&p=<sam|ovl|dev|arr|gw|cm>&f={"pf":{...}}`. 첫 화면(설정 루트)도 cap 8 로 요청하면 카드 행이 `pg.<이름>` 호출이 된다(cap 3 이하는 예전 그대로 `web` 행동).
  - 출퇴근 브리핑은 하위의 하위 화면 둘이 더 있다: 시각 고르기(`sub:'tp'`: 오전/오후 · 1~12시 · 5분 단위 칸) · 장소 고르기(`sub:'pick'`: 입력칸 + 직접 저장/지우기/취소 + 내 장소·버스 정류장 후보 `pk.u.N`/`pk.b.N`). 뒤로 단추는 '‹ 출퇴근 브리핑 알림'.
- **엔진/화면 규격 변경**: 새 노드 `row`(칸 1~8개를 가로로 같은 너비 · 칸은 button/box/text만 · `gap`) — `ScreenCore.java`(검증·배치) · `ScreenJvmTest` 277 통과. **새 APK 필요**: 플러그인 `status` 가 `cap:8` 을 돌려주고(`ScreenNativePlugin.java`), 웹이 첫 요청 전에 한 번 읽어 cap 8 일 때만 `cap=8&p=` 로 요청한다. 옛 APK(cap 없음)는 cap 3 → 설정 카드 행이 예전 웹 카드 시트 그대로(시험 있음).
- **앱(`www/index.html` `_scrSet`)**: `pgCall`(허용 목록 정규식만: `pg.* sam.open bat.req ovl.diag pf.live pf.rec dev.start.<모드> dev.stop arr.t.<종류> arr.demo arr.stat gw.add.<k> gw.roam.dn|up cm.day.N cm.preset.* cm.test cm.tp.* cm.pick.* tp.* pk.*`)가 **기존 웹 함수를 그대로 부른다**(`_cmDayToggle` `_cmSaveTimes` `_gwAdd` `_gwRoamSet` `_ovlTestStart` `_arrTestUI` `_samOpen` `_batRequest` …) → 기능 100% 유지. 스위치 `set cm`/`set ovl`. 입력칸 `cmq` 글자는 `text` 이벤트로 받아 버스 정류장 검색(350ms) → 후보 이름만 엔진에 보낸다. 안드로이드 뒤로가기는 시각/장소 고르기 → 그 화면 → 설정 순서로 한 단계씩.
- **폴백(자동)**: 엔진이 옛 버전이라 `info.page` 가 다르거나, 응답이 없거나, 틀린 모양이면 → 예전 웹 카드 시트(`openSheet`)로 연다. 더 새 요청에 밀려 버려진 응답은 폴백으로 치지 않는다(시험에서 잡은 버그).
- **시험**: `settings_engine` 180(새 ⑦: cap 문지기 · 화면별 모양/이모지 없음/결정성 · 행동 허용 목록 · ScreenCheck 검증 20건 · 웹 문구와 같음 · 워커 끝에서 끝) · `ScreenJvmTest` 277 · `screen_native` 13 · `screen_set_js.ui` 45(새 ⑥ 18건: 옛 APK cap 3 유지 포함 ·: 열기·요일·시각 고르기[확인/취소]·장소 고르기[저장/지우기/취소]·모르는 행동 무시·뒤로·6개 화면의 기존 웹 함수 호출·옛 엔진/다운 폴백).
- **YJ가 할 일**: ① `engine/route-v2-worker.ascii.js`(s68) 붙여 넣고 Deploy → `version` = `route-v2-2026-10-19s68`(s67 포함). ② **새 APK 빌드**(CI) — `row` 노드 때문. ③ 설정 > '네이티브 설정 화면'을 켠 상태에서 6개 카드 행을 눌러 본다.
- **기기 미검증(전부)**: ① 안드로이드에서 `row` 단추 그림(칸 너비·글자 잘림) ② 스크롤 안의 입력칸(`cmq`)에서 키보드가 올라올 때 ③ 시각 고르기는 슬라이더 대신 5분 단위 칸(스테퍼) ④ 진단창(`_ovlDiagShow`)·예전 장소 팝업(`_pickPop`)은 **여전히 웹 팝업**이라 뜨는 동안 네이티브를 숨긴다 ⑤ 갤럭시 절전 상태 읽기(`backgroundStatus`)는 실기기 값.
- **아직 100% 네이티브가 아닌 것(정직하게)**: 홈 경로 결과 카드 · 커뮤니티 칩 줄 · 글쓰기 시트/팝업 · 데이터 계층(경로·도착 데이터 로딩). 이 조각은 설정 화면 안의 마지막 웹 시트만 옮겼다.

## 2026-10-19 엔진 s69 — 네이티브화: 커뮤니티 맨 위 칩 줄(실시간소통 · 게시판 · 뉴스 · 설정)을 엔진이 구성
- **YJ 지시**: "계속 진행해줘"(s68 이어서) — 남은 웹 조각 중 커뮤니티 칩 줄. 새 설정 스위치 `네이티브 커뮤니티 칩 줄`(`scrq`, 기본 꺼짐).
- **엔진**(`engine/cchips.js` + `cchips-worker.js`, `POST /screen/cchips`, 내장 블록 `CCHIPS`): `{cap:6, f:{mode:'chat'|'board'|'news'|'set'}, alts:'chips'}` → 칩 네 개(순서·글자·켜진 칸·실시간소통 켜졌을 때 빨강)를 `head` 의 `chips` 한 줄로. 글자는 웹 칩과 같고 **이모지만 뺐다**(새 네이티브 화면 규칙). `alts:'chips'` 로 네 칸 화면을 한 번에 받아 칩을 눌러도 요청 없이 올린다(s67 방식).
- **앱**(`www/index.html` `_scrCchips`, 공용 틀 `_scrKit`): `#filterRow` 위를 덮는다. 켜진 칸은 웹 칩의 `.on` 위치로 읽고(`sig` 로 400ms 마다 확인 → 다른 곳이 `showChatTab` 등을 불러도 따라간다), 눌림 `cc.chat|board|news|set` 은 예전 `showChatTab`/`filterCat`/`showSettingsTab` 을 그대로 부른다. 커뮤니티 탭이 열릴 때 `switchTab` 이 `kick()` 한다.
- **폴백**: 스위치 꺼짐·플러그인 없음·엔진 실패·플러그인 오류 → 웹 칩 줄(기존 그대로, 계속 눌린다).
- **시험**: `cchips_engine` 29(웹 칩 글자 대조·cap·검증기·워커 내장·워커 끝에서 끝까지·alts) · `screen_cchips_js.ui` 12(꺼짐/없음 무호출·show+사각형·칩 4종·무시·웹 쪽 변경 따라감·탭 이동·폴백·스위치) · `settings_engine` 181(`scrq` 설명 웹=엔진) · CI 매트릭스에 2개 추가.
- **YJ가 할 일**: `engine/route-v2-worker.ascii.js`(s69) Deploy → `version` = `route-v2-2026-10-19s69`(s68 포함). APK 는 s68 때 새로 빌드했다면 그대로 쓰면 된다(새 노드 없음, 기존 `chips`). 설정 > '네이티브 커뮤니티 칩 줄'을 켠다.
- **기기 미검증**: 네이티브 칩 줄이 웹 칩 줄 높이(≈29)와 같은지 · 글자 크기(웹 11 → 네이티브 12) · 가로 스크롤 필요 여부(칩 4개라 폭은 충분).

## 2026-10-19 엔진 s70 — 네이티브화: 커뮤니티 '제보 글쓰기' 시트를 엔진이 구성 + CI 실패(HOME_STNS 이름 충돌) 수리
- **CI 수리**: s68/s69 빌드가 `home_engine` 의 '다른 엔진과 이름이 겹치지 않는다' 에서 실패했다. 원인 = `engine/settings.js` 의 `var HOME_STNS;` 가 `home-stations.js` 와 워커 안에서 겹침. `settingsStns()`(전역이 있으면 그걸, 노드에서는 require)로 바꿔 해결. 같은 때 `screen_native_js.ui`(테마 팔레트 update) 가 #1197 에서만 한 번 실패 — #1198 에서는 통과, 로컬 29/29 → CI 부하로 인한 일시 실패로 본다(다시 나오면 조사).
- **YJ 지시**: "계속 진행해줘" — 남은 웹 조각 중 글쓰기 시트. 새 설정 스위치 `네이티브 글쓰기 시트`(`scrw`, 기본 꺼짐).
- **엔진**(`engine/write.js` + `write-worker.js`, `POST /screen/write`, 내장 블록 `WRITE`): `{cap:9, f:{rc, err, busy, t, b}}` → 제목 줄('제보 글쓰기' + 닫기) · 카테고리 · 현장제보 횟수 안내 · 안내 빨간 상자(이모지 제거) · 제목 입력칸 · 여러 줄 내용 입력칸(`multi`) · 등록 단추('등록 중...' 포함). 계산(횟수 문구·단추 글)은 전부 엔진.
- **화면 규격 변경(새 APK 필요)**: `field` 노드에 `multi`(여러 줄), `maxlen` ≤ 1000, `value` ≤ 1000자, `h` ≤ 160. `ScreenCore.java`(검증) · `ScreenView.java`(`drawFieldLines`, 편집기 여러 줄) · 플러그인 `status` 가 `cap` 9 를 돌려준다. 웹은 `cap>=9` 일 때만 요청한다(옛 APK 는 웹 시트 그대로). `ScreenJvmTest` 282 통과.
- **앱**(`www/index.html` `_scrWrite`): `#wsheet` 위를 덮되 하단 탭바 위까지만(탭바가 시트 아래쪽을 덮고 있어 그대로 두면 '가려짐'으로 보류됨 — 시험으로 잡은 버그). 네이티브가 맡는 동안 웹 시트 속은 숨김(`scrw-own`, 자리는 그대로). `wr.submit` → 입력칸 글을 웹 입력칸에 옮겨 `submitPost`(욕설 거르기·서버 등록·포인트는 웹 그대로), 결과 토스트는 등록이 끝날 때까지 기기 토스트로, 성공이면 네이티브 입력칸도 `setField` 로 비운다. `wr.close` → `closeWrite`.
- **버린 것**: 웹의 '호선 선택(wLine)' 은 아무 데서도 읽지 않아 옮기지 않았다. 카테고리는 '잡담' 하나.
- **시험**: `write_engine` 35 · `screen_write_js.ui` 13 · `ScreenJvmTest` 282 · `screen_native` 13 · `screen_cchips_js.ui` 12 · `screen_bct_js.ui` 21 · `home_engine` 70 통과. CI 행렬에 `write_engine`, `screen_write_js.ui` 추가.
- **YJ가 할 일**: ① `engine/route-v2-worker.ascii.js`(s70) 붙여 넣고 Deploy → `version` = `route-v2-2026-10-19s70`. ② **새 APK 빌드**(Java 변경: 여러 줄 field · cap 9). ③ 설정 > '네이티브 글쓰기 시트' 켜고 확인.
- **기기 미검증(전부, Java 는 CI 컴파일로만 확인됨)**: 여러 줄 입력칸 그리기·타이핑·줄바꿈 · 키보드가 올라올 때 시트 사각형 · 웹 시트 속 숨김 · 토스트 라우팅 · 등록 뒤 입력칸 비우기.
- **아직 100% 네이티브가 아닌 것**: 홈 경로 결과 카드 · 글쓰기 뒤 팝업 · `_ovlDiagShow`/`_pickPop` 팝업 · 데이터 계층 · 지도 탭(SVG).

## 2026-10-20 수리 — 네이티브 화면이 올림·숨김을 끝없이 되풀이하던 버그 (CI 의 screen_native_js 실패의 진짜 원인)
- **증상**: CI(#1197·#1201)에서 `screen_native_js.ui` '테마가 바뀌면 팔레트만 다시 보낸다'가 계속 실패. 처음엔 CI 부하 탓으로 봤으나 **틀린 판단**이었다 — 로컬에서 CPU 를 느리게 하면 재현됐고, 고치기 전 코드에서는 새 시험이 느리게 하지 않아도 바로 실패한다.
- **원인(앱 `_scr*` 반복 확인 `tick` 5곳 공통)**: 사각형이 연달아 바뀌면(탭 전환·키보드) `S.chg >= 3` 이 남는다. 화면을 올리는 `present()` 가 `S.still = 0` 으로 되돌리므로 올린 바로 다음 확인에서 `moving = chg>=3 && still<3` 이 참 → 숨김 → 3번 가만히 있으면 다시 올림 → 또 숨김 … 기기에서는 화면이 계속 깜박였을 것이다(기기 미검증).
- **고침**: `moving` 계산 직후 `if(S.still >= 3) S.chg = 0;` — 가만히 3번 확인되면 '연달아 바뀜' 기록을 지운다(쇼핑·뉴스/맛집·채팅/탭·칩/글쓰기 공용틀·홈 5곳).
- **시험**: `screen_native_js.ui` 에 회귀 시험 추가(움직임이 멈추고 다시 올라온 뒤 1.5초 동안 hide/show 가 없다) → 30/30. 나머지 screen_*_js.ui 7개(bct 21 · cchips 12 · food 29 · home 13 · news 28 · set 45 · write 13) 통과.
- **같이 고친 시험**: `loading_chars` 점심 문구 길이 하한(요일마다 템플릿이 달라 월요일에 짧은 문구) · `cong_card` 현재 시각 막대(자정~4시 실행 시 운행 시간 밖) — 둘 다 실행 시각 의존이었다.

## 2026-10-20 엔진 s71 — 네이티브화: 홈 '경로 결과 카드' 윗부분(머리줄·요약·환승 안내·경로 탭)을 엔진이 구성
- **YJ 지시**: "남은거 진행해줘". 새 설정 스위치 `네이티브 경로 결과 윗부분`(`scrr`, 기본 꺼짐). 결과 카드 1단계 — 나머지(출발 시각·공식 안내·알림 줄, 구간 타임라인, 실시간 위치, 혼잡도, AI 브리핑, 장거리 등급 칩)는 아직 웹.
- **엔진**(`engine/rhead.js` + `rhead-worker.js`, `POST /screen/rhead`, 내장 블록 `RHEAD`): `{cap:10, part:'h'|'t', f:{...}}`. part h = 머리줄(`rhd` 노드: 큰 숫자 + 분/분 남음 + 'A → B' + 즐겨찾기 + ×) · '전체 N분 · 승차 · 대기 · 도보·환승' · 이유 글 · 호차/문 안내 · 환승 안내 상자. 경로 없는 탭이면 `rhd` 가 안내 글('지하철만으로 갈 수 있는 경로가 없어요'). part t = 경로 탭 한 줄(고른 탭 금색, 장거리는 `ld` 일 때만). 글에 이모지 없음(웹 탭 라벨의 이모지는 뺌).
- **화면 규격 변경(새 APK 필요)**: 노드 `rhd`(머리줄 한 덩이 — 눌리는 곳은 즐겨찾기·× 두 곳뿐) · 화면 `bg`('bg'|'card'|'card2' — 카드 안에 들어가는 화면이 카드 색으로 칠함) · `status().cap` = 10. `ScreenCore`(검증·배치·`rhdAct`) · `ScreenView`(`drawRhd`) · `ScreenNativePlugin`.
- **앱**(`www/index.html` `_scrRhead`, 공용 틀 `_scrKit` 둘: `rhead`=#trHeadWrap, `rtabs`=#routeOptionTabs): 감싸개 `#trHeadWrap` 을 새로 만들어 머리줄·요약·환승 줄을 묶었다. 사실만 읽어 보낸다(DOM 의 숫자·이름·`_routeSplitNow`·`_rhRoute`(엔진 경로의 why/transfers/sections 원자료)·고른 탭). 높이는 'size' 이벤트를 따른다. 옛 페인트 구역(hd/tb/split/xfer)은 `rhOwned()` 일 때 양보. 한 스위치로 두 틀을 함께 켜고 끈다. 눌림은 `rh.fav`→`_openFavPopup`, `rh.close`→`closeTransitResult`, `rh.tab.<종류>`→`selectRouteOption`(허용 목록 밖 무시).
- **폴백**: 스위치 꺼짐·플러그인 없음·옛 APK(cap<10)·엔진 실패·플러그인 오류 → 웹 카드 그대로.
- **시험**: `rhead_engine` 65 · `screen_rhead_js.ui` 13 · `ScreenJvmTest` 295 · `settings_engine` 183. CI 행렬에 `rhead_engine`, `screen_rhead_js.ui` 추가.
- **YJ가 할 일**: ① `engine/route-v2-worker.ascii.js`(s71) 붙여 넣고 Deploy → `version` = `route-v2-2026-10-20s71`. ② **새 APK 빌드**(새 노드 `rhd`, `bg`, cap 10). ③ 설정 > '네이티브 경로 결과 윗부분' 스위치 켜기.
- **기기 미검증(전부)**: `rhd` 그리기(숫자·단위·경로 한 줄 기준선, 즐겨찾기 알약, ×) · 카드 색 배경 · 감싸개 높이가 내용 높이를 따라가는지 · 옛 페인트 구역 양보 · 탭 누름 · 경로 없음 안내 · 환승 상자 줄바꿈.
- **아직 100% 네이티브가 아닌 것**: 결과 카드 나머지 · 글쓰기 뒤 팝업 · `_ovlDiagShow`/`_pickPop` 팝업 · 데이터 계층 · 지도 탭(SVG).

## 2026-10-20 수리 — '네이티브 경로 화면'을 켜면 설정 글씨가 자글자글 (스크롤이 서서히 멈추는 꼬리의 켜짐↔꺼짐 되풀이)
- **증상(YJ 스크린샷·녹화)**: 설정 탭을 스크롤하면 글자가 웹 글자와 네이티브 글자로 번갈아 보이고 일부 블록 글자가 비어 보인다.
- **원인(재현함)**: 그림 영역(`makeRegion`)이 '가만히 4프레임'이면 네이티브를 켜는데, 손가락을 뗀 뒤 스크롤이 서서히 멈추는 꼬리는 프레임당 0.5px 미만이라 '가만히'로 읽힌다. 켜자마자 다음 스크롤 이벤트가 와서 `hideNow` 로 꺼지고, 다시 4프레임 뒤 켜짐 — 되풀이. 재현 스크립트(설정 탭, 0.5px 씩 90ms 간격 2.3초)에서 켜짐·꺼짐 223번.
- **고침**: 이 영역을 지나는 스크롤 이벤트가 마지막으로 온 뒤 0.25초(`H.scAt`)는 켜지 않는다. 같은 재현에서 12번(멈춘 뒤 한 번 켜짐).
- **시험**: `htl_native_js.ui` 에 회귀 시험 추가(느리게 멈추는 스크롤에서 켜짐·꺼짐 40번 이하 · 멈춘 뒤 다시 켜짐) → 단독 38/38. **기기 미검증**.
- 주의: 시험을 동시에 여러 개 돌리면 부하로 htl_native 등이 무더기로 실패한다(단독 실행하면 통과). 전체 확인은 CI 로 본다.
- (같은 날 보정) 첫 수정이 CI 의 htl_native 를 깼다 — 자기 가로 스크롤 요소의 움직임까지 '스크롤'로 세어 숨겼고, 떠 있는 영역까지 tick 이 숨겼다. 이제 **꺼져 있던 영역을 켜는 것만** 0.25초 늦추고(`!H.shown`), 자기 `scrollEl` 의 스크롤은 세지 않는다. CPU 6배 느리게(`throttle.js`) 해도 38/38.
- 시험 버그: `route_follow`·`store_sync` 가 엔진 버전 날짜(10-19)를 박아 두어 날짜가 바뀌면 실패했다 → 날짜 무관 정규식으로 고침.

## 2026-10-20 엔진 s72 — 네이티브화: 결과 카드 '공식 공지 · 지연 제보' 줄을 엔진이 구성
- **YJ 지시**: "다음 네이티브 진행해줘"(웹 중간 방식에서만 생기는 문제는 고치지 말고 네이티브 전환을 먼저 — 08:43).
- **범위**: 결과 카드의 `transitOfficialRow`(서울교통공사 공지·지연 의심) · `transitAlertRow`(지연 제보 3명 이상 + '노선 방 보기'). `transitDepRow`(출발 시각 비교)는 이미 AI 승무원에 합쳐져 숨겨져 있어 대상 아님.
- **엔진**: 기존 `rhead` 에 `part:'n'` 추가(같은 `POST /screen/rhead`, cap 10 그대로 — **새 APK 필요 없음**). 웹은 사실만 보낸다: `ln`(내 경로 지하철 노선), `off`(노선별 공지 원자료 `{text,title,ts,estimated,suspect}`), `al`(노선별 `{reporters,stations}`), `now`(분 단위로 내림). 엔진이 글(웹 `_offText` 와 한 글자 같음, 그림말 제외)·파란/빨간 상자·굵은 앞부분·'노선 방 보기'(`rh.room.<순번>`) 단추를 정한다. 보일 것이 없으면 높이 0 spacer.
- **앱**: 감싸개 `#trNoteWrap`(공지·제보 줄을 묶음) + 세 번째 틀 `rnote`(스위치는 같은 `scrr`; 저장값 `gdm_scrr3_on` 은 틀을 만들기 전에 머리줄 값에 맞춘다). 웹이 줄을 보여 주는 동안에만 덮는다(자리가 있어야 덮을 수 있다 — 보일지 여부의 글은 엔진이 짓는다). 원자료는 웹이 가져오던 그대로(`_offGet`·`/lalerts`) `window._rnOff/_rnAl/_rnLn` 에 담아 넘긴다 — 데이터 계층은 아직 웹. 옛 페인트 구역(r:transitOfficialRow·r:transitAlertRow)은 `rhOwned()` 일 때 양보.
- **시험**: `rhead_engine` 85(웹 `_offText` 문구 대조 포함) · `screen_rhead_js.ui` 16 · `settings_engine` 183. 시험 버그 2개도 같이 고침(버전 날짜).
- **YJ가 할 일**: 워커 s72(`route-v2-2026-10-20s72`) Deploy. APK 는 s71 것을 쓰면 된다(Java 변경 없음). 설정 스위치는 기존 '네이티브 경로 결과 윗부분' 하나로 세 줄 모두 켜고 끈다.
- **기기 미검증**: 공지 줄 높이 따라가기 · 웹 줄이 사라질 때 자리 반환 · '노선 방 보기' 누름.
- **아직 100% 네이티브가 아닌 것**: 결과 카드 나머지(구간 타임라인 · 실시간 위치 · 혼잡도 · AI 브리핑 · 장거리 등급 칩) · 글쓰기 뒤 팝업 · `_ovlDiagShow`/`_pickPop` 팝업 · 데이터 계층 · 지도 탭(SVG). 웹 중간 방식에서만 생기는 문제(스크롤 꼬리 자글자글 등)는 웹을 걷어낼 때 사라지므로 더 고치지 않는다.

## 2026-10-20 엔진 s73 — 네이티브화: 결과 카드 '장거리 열차·버스 고르기' 상자를 엔진이 구성
- **YJ 지시**: "일단 계속 진행해줘" + "모든 계산은 엔진이 앱은 그림만 그린다는 규칙 절대 지키고".
- **엔진**: `rhead` 에 `part:'l'` 추가(같은 `POST /screen/rhead`, cap 10 — **새 APK 필요 없음**). 웹은 서버가 준 장거리 원자료 `lg`(mode·grade·depTs·candidates·options·noWaitMin·fastRide)만 그대로 보낸다. 엔진이 수단 라벨('열차'·'고속버스'·'시외버스'; 이모지 뺌) · 시각 · 소요 분 · 요금 쉼표('12,300원') · **선택 표시**(모드+정확한 시각 / 등급+시각; depTs 가 없으면 모드·등급만 — 웹과 같은 판단) · 후보 2개 이상일 때만 노출 · 줄 나눔(폭 어림) · '대기 시간을 빼면 약 N분…' · '이동만 가장 빠른 편…' 문구를 정한다. 드롭박스(펼침 목록) 대신 단추 줄로 모두 보여 준다(기능은 같고 한 번 덜 누른다). 눌림은 `rh.ld.m|g.<원자료 번호>`.
- **앱**: 네 번째 틀 `rld`(root `#ldGradeChips`, 같은 스위치 `scrr`, 저장값 `gdm_scrr4_on`). `_renderLdGradeChips` 가 `window._rhLd` 에 원자료를 담는다. 눌림은 번호의 원자료로 예전 `_ldReselect(수단, 등급, 시각)`(엔진 재요청)을 그대로 부른다 — 번호 밖·허용 밖은 무시.
- **시험**: `rhead_engine` 99(선택 표시·요금 쉼표·이상한 값·앱 검증기) · `screen_rhead_js.ui` 19 · `settings_engine` 183.
- **YJ가 할 일**: 워커 s73(`route-v2-2026-10-20s73`) Deploy. APK 는 s71 것 그대로.
- **기기 미검증**: 단추 줄 폭·줄바꿈(긴 라벨) · 높이 따라가기 · 고른 뒤 재요청 흐름. 장거리 탭에서만 보인다.
- **남은 비네이티브**: 결과 카드 구간 타임라인 · 실시간 위치 · 혼잡도 · AI 브리핑 · 글쓰기 뒤 팝업 · `_ovlDiagShow`/`_pickPop` 팝업 · 데이터 계층 · 지도 탭(SVG).

## 2026-10-20 엔진 s74 + APK 변경 — 네이티브화: 결과 카드 '구간 타임라인'(1단계, 정적)
- **YJ 지시**: "가장 오래걸리고 어려운것부터해줘. 엔진은 계산만 앱은 그림그리기 규칙지켜".
- **엔진**: `rhead` 에 `part:'k'`(같은 `POST /screen/rhead`, cap 10). 예전 웹 `_renderHtlTrack`·`_segStopOffsets`·`_transitColor`·`_brightenForTimeline`·`_htlBaseMs` 가 하던 계산을 전부 옮겼다:
  단일 시간축(예상 시각/탐색 시각/기기 시계 + 막차 뒤 첫차까지 이동) · 구간별 시작/끝 · 지하철 시각표 대기(`ttWaitMs`) 누적 · 역별 시각(엔진 역별 시각 → 좌표 거리 비례 → 균등) · 같은 이름 역 중복 제거(장거리 앞뒤는 지우지 않음) ·
  노선 색(LC 표·별칭·어두운 테마 밝힘)·버스 여러 개면 구간마다 다른 색 · 환승 도보 '환승'/'도보' · 환승·급행/일반 환승·장거리 출발/도착·총 소요 배지 · 점/선 색 · 시작/끝 점 색(테마) · 기기 시간대 HH:MM.
  웹은 **원자료만** 보낸다: 구간(`ty,nm,du,di,ws,ar,ss,es,sts,tw,we,tc,st[이름,위도,경도]`) · 환승 원자료(`xf`) · `bt`(예상 시각) · `rb`(탐색 시각) · `now`(그릴 때 기기 시계) · `sw`(첫차 이동 분) · `tz` · `th`. 색·시각 글·배지 글은 요청에 없다(시험으로 확인).
  구간 시각을 하나도 못 받은 옛 응답은 엔진이 `notimes` 로 거절 → 웹이 그린다. 출력은 `head:[{t:'trk', cells:[…]}]`, 본문은 `spacer h:0`.
- **APK(새 노드 `trk`)**: `ScreenCore` 에 `trk` 노드(머리의 가로로 밀리는 칸 줄; 칸마다 폭·이름·배지·왼/오른 선·점 e/r/m·시각), `ScreenView.drawTrk`. 규격 번호(cap)는 10 그대로 — **s71 APK 에는 trk 가 없어서** 이 단계는 **새 APK 를 빌드해 깔아야** 켜진다(옛 APK 는 trk 를 '모르는 노드'로 건너뛰고 빈 줄이 되므로, 아래 '기기 미검증' 참고).
- **앱**: 다섯 번째 틀 `rtrk`(root `#transitHtlWrap`, 같은 스위치 `scrr`, 저장값 `gdm_scrr5_on`). `_renderHtlTrack` 가 `window._rhTrk` 에 그릴 때의 원자료를 담는다. 예전 그림 영역(`tl`)은 이 틀이 맡는 동안 비킨다.
- **아직 안 된 것(2단계)**: 내 위치 점(파란 점/링) · 지나간 역 흐리게 · 현재 역 강조 · 승차 대기 배지 — 네이티브 타임라인이 켜져 있는 동안은 보이지 않는다(웹 쪽 추적은 숨은 웹 줄에서 계속 돈다). 그래서 이 단계는 **기본 꺼짐으로만** 쓸 것.
- **알려진 한계**: 네이티브 줄 위에서 세로로 쓸어도 페이지가 안 움직인다(기존 rhead 줄들과 같다 — 웹을 지우면 사라지는 문제).
- **시험**: `ScreenJvmTest` 309 · `rhead_engine` · `screen_rtrk_js.ui`(웹이 DOM 으로 그린 타임라인과 엔진 칸을 칸마다 대조: 이름·배지·시각·선 색·점 종류/색·폭; 6개 경로 모양 × 다크/파스텔).
- **YJ가 할 일**: 워커 s74(`route-v2-2026-10-20s74`) Deploy + **새 APK 빌드·설치**.
- **기기 미검증**: 칸 그리기(이름 두 줄 맞춤·알약 배지·선 이음·점 겹침) · 가로 밀기 · 높이(105dp) 따라가기 · 옛 APK 에서의 동작.

## 2026-10-20 엔진 s75 + APK 변경 — 네이티브화: 구간 타임라인 2단계(내 위치 마커 · 대기 배지 · 지금 보이는 시각) + s74 CI 실패 수정
- **s74 CI 실패 원인**: `ScreenView.drawTrk` 가 환승 점을 `new LinearGradient` 로 그려 '그릴 때 새 객체를 만들지 않는다'(`screen_native.test.js`) 검사에 걸렸다. 좌우 반원으로 나눠 칠하도록 고침(반지름 3dp 라 눈에 안 띈다). `overlay_pill_native` 는 CI 에서 exit 152(CPU 제한)로 죽은 것 — 로컬 11/11 통과, 재실행으로 확인.
- **YJ 지시**: "이어서해줘. 한계도 100%네이티브되면다 구현되는거잖아".
- **엔진**: `part:'k'` 요청에 선택 필드 `lv`(웹이 정한 상태를 원자료로만): `p:{f,t,r,sn}`(마커가 있는 칸 번호 f→t, 구간 비율 r(0.1 단위), sn=점프) · `w:{d}`(승차 대기 중이면 승차역까지 m) · `ea:[HH:MM…]`(웹이 지금 보여 주는 칸별 시각). 엔진이 (1) 역 칸 시각을 `ea` 로 덮고(칸 수가 안 맞으면 무시 · 장거리 '총 …' 은 유지) (2) trk 노드에 `mk`(칸 번호 · 비율 · 이동 ms 3000 · 점/테두리/번쩍임/고리 색 · 맥박 주기 · 대기면 주황 맥박 + 배지 글 '대기 중 · 350m')를 붙인다. **part k 는 이제 cap 12 가 있어야 만든다**(cap 11 = s74 APK 는 마커를 못 그리니 웹 타임라인 그대로).
- **APK**: `ScreenCore.Mark`/`mk` 파서(검증: 칸 번호·pu·색·비율·크기) + 배치(칸 가운데 사이 x · 점 y · 배지 자리), `ScreenView.drawMk`(고리·번쩍임/맥박·점·배지, 새 화면이 오면 지금 자리에서 새 자리까지 엔진이 준 ms 로 이어 감 · 처음/sn 이면 곧바로 · 마커가 있을 때만 초당 15번 다시 그림). 규격 번호 **12**.
- **웹**: `_placeGpsMarkerSmooth` 가 가드를 거친 최종 위치를 `window._rhLive` 에, `_htlWaitBadge` 가 `window._rhWait` 에 남기고 `trkFacts` 가 `lv` 로 보낸다(`_etaApply` 가 고치는 `_transitNodeData[].arrTime` 을 그대로 읽는다). 새로 그리면 둘 다 지운다.
- **웹에 남은 데이터 계층(아직 네이티브 아님)**: GPS→역 인덱스 추적 상태 머신 · 역주행 가드(`_markerMaxProg`) · 시각 정합성 교정 · 대기 모드 판단 · 5초 eta 요청. 마커 '위치를 정하는 일'은 여기라 웹이 하고, 엔진은 그 결과를 어떻게 그릴지만 정한다.
- **알려진 한계(웹 삭제 때 사라짐)**: 마커는 엔진 응답이 올 때 움직인다(0.1 구간 단위 + 3초 이어가기 — 웹의 매 틱 부드러운 이동보다 거칠다). 지나간 역 흐리게(`htl-passed`)·현재 역 강조는 아직 없다.
- **시험**: `ScreenJvmTest` 315 · `rhead_engine` 140 · `screen_rtrk_js.ui`(마커 위치가 웹 노드 이름과 같은 칸에 놓이는지 · 요청 폭주 없음 · 대기 배지 글이 웹 배지와 같음 · 탑승 중이면 안 켬 · 시각 덮어쓰기 · 새 경로에서 지움 · cap 11 은 웹 그대로).
- **YJ가 할 일**: 워커 s75(`route-v2-2026-10-20s75`) Deploy + **새 APK 빌드·설치**(cap 12).
- **기기 미검증**: 마커 그리기·이동 애니메이션·맥박 · 대기 배지 위치(노선 줄 안) · 가로 밀기 중 마커.

## 2026-10-20 엔진 s76 + APK 변경 — 네이티브화: 홈 '혼잡도 카드' 본문(머리줄 · 게이지 · 24시간 막대 · 칸별 혼잡 / 버스 안내)
- **YJ 지시**: "다음 네이티브 진행해줘. 네이티브다하면 웹은 다 뺄거야. 모든 계산은 엔진이 그림은 앱이 그리기".
- **엔진**: 새 `POST /screen/cong`(cap 13). `engine/cong.js`(+`cong-data.js` = 웹 `_REAL_CONG` 245역×24시 표 그대로, `cong-worker.js`). 웹은 사실만 보낸다: `mode`(sub/bus/none), 지하철이면 역·호선·(로드됐다면) 실시간 칸 `live`, 버스면 노선·정류장·국토부 원자료 `[시간대, 승객 수]`, `now`(5분 단위 ms)·`tz`·`th`.
  엔진이 정한다: 혼잡 비율(역 프로필·평일/주말/공휴일 감쇠·실시간 섞기) · 상태 글/색/배지(원활·보통·혼잡·매우혼잡 / 쾌적해요…지옥이에요; 이모지 없음) · 24시간 막대 높이·색·피크·출처·현재 시각 칸 · 칸별 8칸 혼잡 · 버스 평균/최대 승객·막대 · 카드 띠 색·배지 `info`. 웹 `getCongPct/getCong24/renderChart24/renderCarGrid/_renderBusChart24/_processCongItems` 와 숫자·색 일치를 시험으로 대조.
- **APK(새 노드 `cgh` `gauge` `chart` `cars`, `box.hc`)**: `ScreenCore`(검증·배치; 막대 줄은 머리의 가로 밀기 줄, 현재 시각이 가운데로 오게 `initScrollX`) · `ScreenView.drawCgh/drawGauge/drawChart/drawHbar/drawCars`(새 객체 없이) · `ScreenNativePlugin` cap 13.
- **앱(웹)**: `#congBody` 감싸개(장면 `#congScene` 은 밖) · `_cgSet()` 이 사실 변화를 알림(`updateCong`·`_resetCongToWaiting`·`updateBusCong`) · 틀 `cong`(저장값 `gdm_scrg_on`, 설정 > '네이티브 혼잡도 카드' 기본 꺼짐) · 엔진 `info` 로 카드 띠 색·`#congBadge` 글/색 적용 · 장면(`.cs-on`)이면 쉼 · 네이티브가 맡는 동안 옛 그림 영역(`cs:*`) 비킴.
- **폴백**: 스위치 꺼짐·플러그인 없음·옛 APK(cap<13)·엔진 실패 → 웹 본문 그대로.
- **알려진 한계(웹 삭제 때 정리)**: 게이지 채움 애니메이션 없음 · 현재 막대는 점프로 가운데(웹의 300ms 두 번째 이동 없음) · 막대 눌러 말풍선 없음(웹도 요소가 없음) · 버스 로딩/없음은 머리줄만(웹은 이전 값 유지) · 빈 버스 차트 생략 · 없음 상태 간격 10(웹 8) · 웹 쪽 중복 계산 코드는 웹 제거 때까지 폴백으로 남음.
- **시험**: `cong_engine` 50 · `screen_cong_js.ui` 14 · `ScreenJvmTest` 335 · `settings_engine` · `screen_native` · 기존 `cong_card`/`cong_scene`(DOM 감싸개 변경에 맞춰 시험의 '보임' 판정을 offsetParent 로 바꿈) 통과. CI 행렬에 `cong_engine`, `screen_cong_js.ui` 추가.
- **YJ가 할 일**: 워커 s76(`route-v2-2026-10-20s76`) Deploy + **새 APK 빌드·설치**(cap 13). 설정에서 '네이티브 혼잡도 카드'를 켠다.
- **기기 미검증(전부)**: 머리줄·게이지·막대(가로 밀기·현재 칸 가운데)·칸별·버스 안내 그리기 · 감싸개 높이 따라가기 · 카드 띠 색/배지 · 장면 전환 시 겹침.
- **남은 비네이티브**: AI 브리핑 카드 · 실시간 소통방 · 글쓰기 뒤 팝업 · `_ovlDiagShow`/`_pickPop` 팝업 · 데이터 계층(fetch · GPS→인덱스 추적 · 마커 가드 · eta 요청 · 버스 혼잡 fetch/카카오 지역) · 지도 탭(SVG).

## 2026-10-20 엔진 s77 + APK 변경 — 네이티브화: 홈 'AI 승무원' 카드(제목 · 브리핑 문장 · 노선 색 글씨 · 카운트다운 · 새로고침)
- **YJ 지시**: "남은 내이티브도 해줘". 남은 목록 중 AI 브리핑 카드를 먼저.
- **엔진**: 새 `POST /screen/ai`(cap 14, `engine/aicard.js` + `ai-worker.js`; 문장은 기존 `home-brief.js` 의 `homeBrief` 를 그대로 부른다). 웹은 사실만 보낸다: `mode`(empty/loading/prep/route/brief/preview), 제목 틀 `tk`, 출발/도착 이름, 기준 시각 `base`(ms), 혼잡도, 날씨, 경로 구간, 다음 열차, `mins`·`dist`(소요 모르면 엔진이 거리로 어림: `max(5, round(km*2.5)+5)`), 남은 분 `rem`, 도착 예정 `arrMs`, 출발 비교 문구 `dm`, 다음 갱신 `nextAt`, 단추 눌림 `busy`.
  엔진이 정한다: 제목(실시간 `출발 → 도착 · 남은시간/소요시간: N분` · 미리보기 `… · 예상 · 오후 02:35` · 기본 `AI 승무원 브리핑`) · 한국어 시각 글 · 날짜 문장(요일·오전/오후) · 미리보기 혼잡 전망 · 브리핑 문단 · 굵은 글 색(#2f7cf6)과 노선 이름→글자색 표(웹 `_lineColor` 와 같음) · 빈/생성 중/준비 중/경로 확인 안내(이모지 없음) · 단추 상태.
- **APK(규격 14)**: `ScreenCore` — 새 노드 `aih`(제목 한 줄 · 카운트다운 알약 · 새로고침 단추; 단추 자리만 눌림) · `text`/`box` 의 `hl` 구간에 선택 색 `[시작,끝,색]`(조각마다 글자색, `Item.segCol`) · hl 상한 20→48. `ScreenView.drawAih`(새 객체 없이; 마감 시각(`to`, 기기 시계 ms)까지 남은 시간을 매초 m:ss 로 그림) · `ScreenNativePlugin` cap 14.
- **앱(웹)**: `#homeAiInner` 감싸개 · `_haiSet()`(사실 알림: `requestHomeBrief` 생성 중 · `_renderHomeBriefLocal` 미리보기 · `_renderHomeConductorBrief` compose · 준비 중 · 경로 확인 중) · 틀 `ai`(저장값 `gdm_scra_on`, 설정 > '네이티브 AI 승무원 카드' 기본 꺼짐) · 남은 분/도착 예정/출발 비교/마감 시각은 요청 때 현재 값을 읽는다(0.5초마다 확인 — 바뀔 때만 요청) · 허용 행동은 `ai.refresh` 하나(→ 예전 `requestHomeBrief(true)`).
- **폴백**: 스위치 꺼짐·플러그인 없음·옛 APK(cap<14)·엔진 실패 → 웹 카드 그대로. 웹의 `buildLocal`/`_hbRender` 경로와 날씨·경로 구간 수집·5분 주기·`/ai-brief` 호출은 데이터 계층이라 웹에 남는다.
- **알려진 한계**: 새 글이 올 때 웹의 0.2초 페이드 없음 · 카운트다운 숫자 형식(m:ss)은 기기가 그린다(엔진은 마감 시각만 줌) · 미리보기 라벨 `#aiPreviewLabel`(이모지 포함)은 아직 웹 · 브리핑 안의 줄바꿈은 기기 글자 폭 기준(웹과 줄 끊김 위치가 다를 수 있음).
- **시험**: `aicard_engine` 110 · `screen_ai_js.ui` 14(웹이 DOM 으로 그린 제목·미리보기·브리핑 문단과 엔진 글이 같은지 대조) · `ScreenJvmTest` 344 · `settings_engine` 185. 혼잡도 UI 시험(`screen_cong_js.ui`)의 시작 타이밍 불안정(앱이 먼저 올리는 빈 상태와 시험이 정한 사실이 섞임)을 고침. CI 행렬에 `aicard_engine`, `screen_ai_js.ui` 추가.
- **YJ가 할 일**: 워커 s77(`route-v2-2026-10-20s77`) Deploy + **새 APK 빌드·설치**(cap 14). 설정에서 '네이티브 AI 승무원 카드'를 켠다.
- **기기 미검증(전부)**: 머리줄 그리기(제목 말줄임 · 알약 폭 · 단추) · 색 글씨 줄바꿈 · 카운트다운 매초 갱신 · 감싸개 높이 따라가기.
- **남은 비네이티브**: 실시간 소통방(`livetalk`) · 글쓰기 뒤 팝업 · `_ovlDiagShow`/`_pickPop` 팝업 · `#aiPreviewLabel`/`#congPreviewLabel` 미리보기 라벨 · 데이터 계층(fetch · GPS→인덱스 추적 · 마커 가드 · eta 요청 · 버스 혼잡 fetch) · 지도 탭(SVG).

## 2026-10-20 엔진 s78 + APK 변경 — 네이티브화: 홈 '실시간 대화' 게시판(머리줄 · 최근 5줄 · 입력줄)
- **YJ 지시**: "남은 내이티브도 해줘". 남은 목록 중 실시간 대화 게시판.
- **엔진**: 새 `POST /screen/talk`(cap 15, `engine/talkcard.js` + `talk-worker.js`). 웹은 사실만 보낸다: 받아 둔 대화 `[닉네임, 글, 시각(ms), 내 글]` 뒤쪽 8개 · `fold`(작은 폰에서 웹이 화면 높이를 재서 접은 줄 수, `#tab-home[data-hf]`) · 기기 시간대 `tzo`.
  엔진이 정한다: 머리줄 글('실시간 대화' + 꼬리 ›)·색 점 · 보여 줄 줄(최근 5줄, 접으면 5-fold줄)·순서 · 줄 글 정리(공백 한 칸, 빈 글 건너뜀, 닉네임 40자/글 200자) · 시각 글(HH:MM, 기기 시간대) · 게시판 높이(줄 영역 120/95/70/45 고정 — 줄이 모자라면 빈 칸으로 채움; 머리 21 + 줄 + 간격 10 + 입력 38) · 입력줄 글(힌트·최대 100자·둥근 보내기 단추).
- **APK(규격 15)**: `ScreenCore` — 새 노드 `lth`(색 점 + 굵은 제목 + 꼬리 글, 줄 전체가 눌림) · `ltr`(닉네임 굵게 최대 80dp 말줄임 + 글 한 줄 말줄임 + 오른쪽 시각 9sp) · `inbar` 에 `bicon`(둥근 아이콘 단추: 지름 `bh`, 금색 원 + 흰 아이콘). `ScreenView.drawLth/drawLtr` + 둥근 단추 그리기(새 객체 없이). `ScreenNativePlugin` cap 15.
- **앱(웹)**: `#homeTalkInner` 감싸개 · 틀 `talk`(저장값 `gdm_sclt_on`, 설정 > '네이티브 실시간 대화 게시판' 기본 꺼짐) · `_renderLiveTalk()` 가 새 줄을 알림(`_scrTalk.changed()`) · `_homeTalkSend(글)` 이 글을 직접 받고 올렸는지(true) 돌려줌 · 허용 행동 둘: `tk.open`(→ 예전 `_goCommunityChat()`) · `tk.send`(→ 예전 `_homeTalkSend`, 올라가면 입력칸 비움).
- **폴백**: 스위치 꺼짐·플러그인 없음·옛 APK(cap<15)·엔진 실패 → 웹 게시판 그대로. 대화 받아 오기(서버 폴링)·가짜 대화 만들기·욕설 거르기·커뮤니티 아이디 확인은 데이터 계층이라 웹에 남는다.
- **알려진 한계**: 새 줄이 올라올 때의 0.4초 슬라이드 없음 · 빨간 점 깜박임 없음(정지) · 기기가 그린 줄은 글꼴 폭 기준으로 말줄임(웹과 끊는 위치가 다를 수 있음) · 접힘(`fold`) 계산 자체는 아직 웹 DOM 을 재는 방식(`_sceneFit`).
- **시험**: `talkcard_engine` 44 · `screen_talk_js.ui` 13(웹 DOM 최근 5줄과 엔진 줄이 같다 · 웹 속 높이 ≈ 엔진 계산 189 · 접힘 · 머리줄/보내기 행동) · `ScreenJvmTest` 353 · `settings_engine` 186. CI 행렬에 `talkcard_engine`, `screen_talk_js.ui` 추가.
- **YJ가 할 일**: 워커 s78(`route-v2-2026-10-20s78`) Deploy + **새 APK 빌드·설치**(cap 15). 설정에서 '네이티브 실시간 대화 게시판'을 켠다.
- **기기 미검증(전부)**: 머리줄·줄 그리기(말줄임 폭) · 둥근 보내기 단추 · 키보드가 올라올 때 입력줄 위치 · 감싸개 높이 따라가기.
- **남은 비네이티브**: 글쓰기 뒤 팝업 · `_ovlDiagShow`/`_pickPop` 팝업 · `#aiPreviewLabel`/`#congPreviewLabel` 미리보기 라벨 · 데이터 계층(fetch · GPS→인덱스 추적 · 마커 가드 · eta 요청 · 버스 혼잡 fetch) · 지도 탭(SVG).

## 2026-10-20 엔진 s79 + APK 변경 — 네이티브화: 안내창(대화상자) 공통 틀 — 권한 안내 · 오버레이 진단 기록 · 잠깐 뜨는 알림
- **YJ 지시**: "계속해줘"(남은 팝업).
- **엔진**: 새 `POST /screen/dlg`(cap 16, `engine/dialog.js` + `dlg-worker.js`). 웹은 사실만 보낸다: `kind`(perm · diag · pop) · (diag) 기록 줄 목록(최대 600)과 복사 결과 `cp` · (pop) 글 두 줄 `msg`/`sub` 와 모양 `cls`. 엔진이 정한다: 모든 문구 · 글자 크기 · 색 · 단추 이름 · 카드 폭/최대 높이/뒤 흐림/위치/모서리 · 진단 기록의 최신이 위 정렬과 덩어리 나누기 · 알림의 이모지 제거와 길이 제한 · 행동 이름(dl.ok · dl.no · dl.copy · dl.clear · dl.close).
- **APK(규격 16)**: `ScreenCore` — 화면 JSON 에 `dlg:{w,maxh,dim,top,r,mx,fit,fill,line,tap}`(안내창 모드), 단추줄 `eq`/`bsize`/`r`. `ScreenNativePlugin` — 안내창 모드는 웹 칸 위가 아니라 화면 가운데 둥근 카드로 띄우고(내용 높이에 맞춤) 뒤 흐림 View 를 깔며, 흐린 곳 누르면 `dlg.tap` 행동. `ScreenView` — 테두리 · 내용 폭에 맞춘 카드.
- **앱(웹)**: 틀 `dlg`(저장값 `gdm_scrd_on`, 설정 > '네이티브 안내창' 기본 꺼짐). `_pickPop` · `_showOvlPermDialog` · `_ovlDiagShow` 가 먼저 `window._ndlg.*` 를 시도하고, 꺼짐·옛 APK·처음 능력 확인 중·2.5초 안에 못 띄움이면 예전 웹 함수(`_pickPopWeb` · `_showOvlPermDialogWeb` · `_ovlDiagShowWeb`)로 돌아간다. 뒤로가기는 안내창부터 닫는다(권한 안내는 '취소'와 같다). 알림은 1.5초 뒤 저절로 닫힌다.
- **알려진 한계**: 처음 한 번은 능력 확인(약 1.8초 뒤 자동) 전이라 웹 안내창이 뜬다 · 페이드 없음 · 알림 카드 안은 터치가 막힌다 · 진단 복사 단추의 웹 '✓' 표시는 글자('복사됨')로 바뀜 · `exitConfirmPopup` · 글쓰기 뒤 팝업은 아직 웹.
- **시험**: `dialog_engine` 39 · `screen_dlg_js.ui` 12 · `ScreenJvmTest` 360 · `settings_engine` 187 · `screen_native` · 기존 `screen_set_js.ui` 45 · `screen_talk_js.ui` 13 · `screen_ai_js.ui` 14 회귀 통과.
- **YJ가 할 일**: 워커 s79(`route-v2-2026-10-20s79`) Deploy + **새 APK 빌드·설치**(cap 16). 설정에서 '네이티브 안내창'을 켠다.
- **기기 미검증(전부)**: 카드 가운데 배치 · 내용 높이 맞춤 · 뒤 흐림 · 진단 기록 스크롤 · 알림 카드 크기 · 뒤로가기.
- **남은 비네이티브**: `exitConfirmPopup` · 글쓰기 뒤 팝업 · `#aiPreviewLabel`/`#congPreviewLabel` 미리보기 라벨 · 데이터 계층(fetch · GPS→인덱스 추적 · 마커 가드 · eta 요청 · 버스 혼잡 fetch) · 지도 탭(SVG).

## 2026-10-20 엔진 s80 — 안내창에 '앱 종료 확인' 추가(APK 변경 없음, 규격 16 그대로)
- **YJ 지시**: "남은거 계속진행해줘". 참고: **웹을 다 걷어낸 뒤 애니메이션(페이드·슬라이드·깜박임 등)을 다시 구현할 예정** — 지금 네이티브 화면에 애니메이션이 없는 건 의도된 보류.
- **엔진**: `engine/dialog.js` 에 `kind:'exit'` 추가(고정 어두운 카드 `#1c1c1e` · 흐림 0.7 · 흐린 곳 눌러도 안 닫힘 · '아니요'(dl.no) / '종료'(dl.ok)). 글 색은 색 역할만 받으므로 흰색 + 투명도 0.56 으로 웹의 `#8e8e93` 을 근사.
- **앱(웹)**: `_showExitPopup` 이 먼저 `_ndlg.exit()` 를 시도하고 안 되면 웹 `#exitConfirmPopup`. 아니요·뒤로가기 → 닫고 `_backPressCount = 0`, 종료 → 닫고 `_exitConfirm()`. 설정 카드 문구에 '앱 종료 확인창' 추가.
- **글쓰기 뒤 알림**: 앱 전체에서 토스트가 꺼져 있어(`submitPost` 주석) 그릴 대상이 없다. 삭제 실패 알림은 단추 글자 바꿈이라 별도 팝업 아님. 남은 `confirm()` 은 신고 확인 1곳(`window.confirm`).
- **시험**: `dialog_engine` 44 · `screen_dlg_js.ui` 13(종료 확인 포함) · `settings_engine` 187 · `ScreenJvmTest` 360 · `screen_native` · `screen_set_js.ui` 45.
- **YJ가 할 일**: 워커 s80(`route-v2-2026-10-20s80`) Deploy(APK 재빌드는 s79 것 그대로면 됨).
- **남은 비네이티브**: 신고 `confirm()` · `#aiPreviewLabel`/`#congPreviewLabel` · 데이터 계층 · 지도 탭(SVG) · 그 뒤 웹 제거 → 애니메이션.

## 2026-10-20 엔진 s81 + APK 변경 — 네이티브화: 미리보기 라벨(알약) · 글 신고 확인창
- **YJ 지시**: "진행해줘"(남은 것 계속). 웹을 다 걷어낸 뒤 애니메이션을 다시 구현할 예정이므로 무지개 테두리(`preview-glow`, CSS 애니메이션)는 지금 웹 그대로 둔다.
- **엔진**: 새 `POST /screen/pvl`(cap 17, `engine/pvlabel.js` + `pvl-worker.js`). 웹은 사실만: `kind`(route · cong · ai) · `mode`(custom=예상 · metro=노선도) · `lbl`(웹 `#baseTimeDisplay` 글). 엔진이 글('예상 경로 · 오후 2:30' / '예상 혼잡도 · …' / '예상 브리핑 · …' / '노선도에서 설정한 경로'; 이모지 제거·40자) · 색(#ff9500 · 바탕 rgba(255,149,0,0.14)) · 크기(11 굵게, 여백 4/11, 둥글기 9)를 정한다. `dialog.js` 에 `kind:'report'`(글 신고 확인: 취소 / 신고) 추가.
- **APK(규격 17)**: `ScreenCore` 새 노드 `pill`(글 폭 + 좌우 여백만큼만 차지, 칸보다 길면 말줄임) · `ScreenView.drawPill`. 플러그인 cap 17.
- **앱(웹)**: 라벨 3개(경로 `#routePreviewLabel` · 혼잡도 · AI)마다 틀(`pvr` · `pvc` · `pva`, 저장값 `gdm_scrp_on` 공유, 설정 > '네이티브 미리보기 라벨' 기본 꺼짐). 카드 맨 위에 `#<kind>PvlNat` 자리를 만들고 네이티브가 맡는 동안 웹 라벨만 감춘다(`.pv-own`). `_updatePreviewHighlight` 끝에서 `_ndpvl.changed()`. `_lrReportMsg` 가 먼저 `_ndlg.report()` 를 시도(신고는 `_lrReportGo`), 안 되면 예전 `window.confirm`.
- **알려진 한계**: 라벨 자리 높이는 기기가 알려 주기 전 첫 순간 33dp 로 잡았다가 바로 따라간다 · 무지개 테두리·펄스 애니메이션 없음(웹 그대로) · 경로 결과 카드(`transitResultCard`)는 경로가 있을 때만 보이므로 그때만 route 라벨이 뜬다.
- **시험**: `pvlabel_engine` 24 · `screen_pvl_js.ui` 8 · `dialog_engine` 49 · `screen_dlg_js.ui` 15 · `ScreenJvmTest` 364 · `settings_engine` 188(본문 높이 상한 8200 으로) · 회귀 `screen_set_js.ui` · `screen_cong_js.ui` · `screen_ai_js.ui` · `screen_talk_js.ui` 통과.
- **YJ가 할 일**: 워커 s81(`route-v2-2026-10-20s81`) Deploy + **새 APK 빌드·설치**(cap 17). 설정에서 '네이티브 미리보기 라벨'을 켠다('네이티브 안내창'은 s79 것 그대로).
- **기기 미검증(전부)**: 알약 위치·크기 · 카드 맨 위 자리 높이 · 신고 확인창.
- **남은 비네이티브**: 데이터 계층(fetch · GPS→인덱스 추적 · 마커 가드 · eta 요청 · 버스 혼잡 fetch) · 지도 탭(SVG) · 무지개 테두리 · 그 뒤 웹 제거 → 애니메이션.

## 2026-10-20 엔진 s82 + APK 변경 — 데이터 계층 첫 조각: '네이티브 통신'(엔진 화면 요청을 앱 본체가 대신 보냄)
- **YJ 지시**: "진행해줘"(데이터 계층). 데이터 계층은 화면 그리기와 성격이 달라 먼저 웹의 통신을 훑었다: 웹 `fetch` 호출 약 100곳(엔진 `/screen/*` · `/route-v2-app` · `/ride-eta` · `/ride-alert` · `/commute-alarm` · `/reco-text` · board-writer `/talks` `/lroom` `/react` · 중계 `/weather` `/bus-stops` `/tago` · 외부 Valhalla/OSRM 등), 위치 `watchPosition` 계열 56곳, 타이머 `setInterval` 42 · `setTimeout` 414. 웹을 걷어내려면 이 중 '화면에 쓰는 데이터를 가져오는 일'과 '센서(GPS·기지국)를 모아 엔진에 보내는 일'을 앱 본체(자바)가 맡아야 한다. 계산 판정은 이미 대부분 엔진(`ride-track` · `ride-eta` · `ride-standby` · `ride-alert` · `route-follow`)에 있다.
- **이번 조각**: 서버 구동 네이티브 화면 틀(`_scrKit` 및 옛 틀 2곳)이 엔진에 화면을 요청하는 POST 를 웹 `fetch` 대신 플러그인 `ScreenNative.post({url, body, timeoutMs})`(순수 자바 `NetPost`)가 보낸다. 허용 범위는 길동무 서버 세 곳(https · 기본 포트 · 사용자 정보/역슬래시/공백 없음 — `ScreenCore.netAllowed`), 본문 20만자 · 응답 2MB · 제한 시간 1~20초 · 리다이렉트 안 따름.
- **APK(규격 18)**: `NetPost.java` 새 파일(CI 복사 목록에 추가) · `ScreenNativePlugin.post` · cap 18.
- **앱(웹)**: `window._nnet`(설정 > '네이티브 통신' 기본 꺼짐, 저장값 `gdm_nnet_on`). 꺼짐·옛 APK(cap<18)·post 가 막힘이면 같은 요청을 예전 웹 `fetch` 로 다시 보내 화면은 그대로 뜬다. 연속 3번 실패하면 이번 실행 동안 접는다. 서버가 4xx/5xx 로 답한 건 통신 실패로 세지 않는다. 공통 도우미 `window._nnetText(url, body, ms, ctl)`.
- **아직 웹 fetch 인 것**: 위 목록 중 화면 틀 밖의 모든 호출(경로 요청은 이미 `RouteFetchPlugin` · 후보 검색은 `HomeSearchPlugin` 이 앱 본체). 다음 조각 후보: ① 대화/게시판 서버 폴링(`/lroom` `/talks` 6초) ② 날씨·버스 혼잡 fetch ③ 센서 수집(GPS→`ride-track` 전송)을 `KeepAliveService` 상시화 ④ eta 요청.
- **시험**: `net_native_js.ui` 7 · `ScreenJvmTest` 368(허용 주소·주소 속임수 거절·제한 시간·보내기 거절) · `settings_engine` 189 · `screen_native` 13 · 회귀 `screen_set/dlg/pvl/talk/cong/ai` 통과.
- **YJ가 할 일**: 워커 s82(`route-v2-2026-10-20s82`) Deploy(설정 카드 문구 때문) + **새 APK 빌드·설치**(cap 18). 설정에서 '네이티브 통신'을 켠다.
- **기기 미검증(전부)**: 실제 HTTPS 요청·응답(한글 본문 인코딩) · 응답 시간 · 기기 네트워크 전환 중 실패 시 웹 복귀.

## 2026-10-20 엔진 s83 — 위치 판단기(PosFusion)를 엔진으로 옮김 + 방향 확정(웹 제거 · 한 번에 네이티브)
- **YJ 지시**: "gps부터해줘" / "어짜피 웹은 다 제거할거야. 최종적으로는 웹버전은 데이터 관리용 파일만. 지금부터 네이티브화된 부분은 웹 다 제거 (웹버전은 따로 데이터를 가지고 있어야 함, iOS 개발용)" / "이전에 네이티브된 부분도 웹은 제거" / "우선 모든부분 한번에 네이티브 시켜, 안되는 부분은 수정하는 방향".
- **엔진**: `engine/posfusion.js` + `pf-worker.js` → `POST /pos-fuse`. 상태 없는 함수 `posFuseRun({nowMs, stations:[{lat,lng,schedMs,xferFromPrev,name}], state?, seed?, startMs?, ev:[gps|motion|cell|arrived]})` → `{ok,state,best,median,fed}`. 웹 원본(지연 가설 31개 × (2N−1) 상태 HMM)과 같은 결과를 `test/posfusion_engine.test.js` 25개로 대조.
- **iOS 기준본**: `ios-reference/`(웹 전체 동결 사본, 앱 빌드 제외, 수정 금지). 이후 웹을 제거해도 여기에 남는다.
- **APK 변경 없음**(규격 18 그대로). **YJ가 할 일**: 워커 s83(`route-v2-2026-10-20s83`) Deploy.
- **다음**: 네이티브 껍데기(Activity·탭·상태·행동 라우터) 설계 후 구현. GPS 수집 → `/pos-fuse` → ride-standby 를 KeepAliveService 에서 돌리는 것부터. 기기 미검증(전부).

## 2026-10-20 s84 (브랜치 `native-shell`) — 웹 전부 제거, 순수 네이티브 껍데기 첫 APK
- **YJ 지시**: "웹 폴백/웹뷰 연동 코드는 1%도 남기지 마. 에러는 네이티브 안에서 처리·수정. www 는 삭제/보관, Activity·하단 탭·상태 관리까지 100% 네이티브로."
- **구조(이 브랜치에서만; main 은 그대로 옛 웹 앱)**: `www/` 삭제(웹 기준본 = `ios-reference/`), Capacitor·플러그인 12개·옛 CI·웹(Playwright) 시험·안드로이드 스텁·아이콘 원본(assets)·옛 인수인계 문서는 이 브랜치에서 지웠다(main 과 git 기록에 남아 있다 — 필요하면 `git show main:경로`). 새 Gradle 프로젝트 `shell-android/`(AGP 8.2.1, minSdk 26, Capacitor 없음, 소스는 `native/shell/` 뿐) + 새 워크플로 `.github/workflows/build-shell.yml`(push to native-shell, 시험 26개 → debug APK 아티팩트 `gildongmu-native-debug`).
- **`native/shell/`**: `ScreenCore`·`ScreenView`(그리기) · `NetPost`(허용 목록 통신, GET 추가) · `ShellCore`(순수: 탭·설정 사실·눌림→효과·팔레트, JVM 시험 37) · `ShellActivity`(웹뷰 없음: 위 내용 ScreenView + 아래 엔진이 그린 탭 막대 ScreenView, 저장은 SharedPreferences, 뒤로가기는 홈으로).
- **지금 되는 것(기기 미검증)**: 탭 막대(엔진 /screen/tabs) · 커뮤니티 탭 = 설정 화면(엔진 /screen/settings, 알림 스위치·도착 오차 기록·테마·아이디 저장/삭제). 나머지 탭은 '옮기는 중' 임시 화면. 설정의 하위 화면(web 행동)·약관·오류 로그는 '아직 옮기는 중' 알림.
- **엔진 쪽 남은 정리**: settings.js 의 웹 기능 스위치 행(scr* 등)·`/screen/*` 의 웹 전용 분기는 웹이 사라졌으니 걷어낼 대상(아직 안 건드림, 껍데기는 feat 를 비워 보냄).
- **다음 조각**: 홈/쇼핑/맛집/뉴스/게시판 탭을 엔진 화면에 잇기 → GPS 수집(KeepAliveService) → /pos-fuse · /ride-standby → 지도 탭 → 위젯·오버레이·알림.
- **남겨 둔 것(재사용 예정)**: native/ 의 Htl·Row·Scene·Metro·Widget 코어/뷰(빌드에는 아직 안 들어감). 옛 Capacitor 플러그인의 안드로이드 로직은 `git show main:native/XxxPlugin.java` 로 꺼내 쓴다.

## 2026-10-20 s85~s86 (브랜치 `native-shell`) — 탭 연결(커뮤니티·쇼핑) + 홈 탭 입력
- **s85**: 커뮤니티 탭 = 칩 줄(cchips) + 뉴스(원자료 받아 엔진 /screen/news, 기사 상세 대화상자) / 설정. 쇼핑 탭 = /screen/shop. `ShellCore` 에 슬롯 모델·Req·NewsRows 추가.
- **s86 홈 탭 입력(기기 미검증)**: `HomeCore`(순수 자바: 입력칸 글·활성 칸·고른 장소·후보·기준시각·경로 질의) + `HomeSearchCore`/`RouteFetchCore`(native/shell 로 이동). `ShellActivity` 가 입력 이벤트→엔진 /screen/home 재요청, 버스·장소 후보 받기, 위치 감지(LocationManager, 권한 요청), 기준시각 고르기(네이티브 대화상자), 경로 탐색 첫 응답(live=0)까지. 매니페스트에 위치 권한.
- **아직 없음**: 경로 결과 화면(엔진 `result.js` 이식 필요 — rhead 사실을 route 응답에서 만든다), 탑승 추적, 맛집/게시판/채팅/지도 탭, GPS 상시 수집(KeepAliveService), 위젯·오버레이·알림.
- **시험**: `node test/shell_native.test.js`(ANDROID_JAR 지정) 5 통과 · JVM 89점검.

## 2026-10-20 엔진 s87 + native-shell — 경로 결과 카드(엔진 `/screen/result`)
- **YJ 지시**: "전부 네이티브로, 웹의 규칙·애니메이션 다 적용, 모든 계산은 엔진" / "웹은 다 지울 거야. 모든 구동이 네이티브와 엔진만으로".
- **엔진**: `engine/result.js` + `result-worker.js` → `POST /screen/result` `{cap≥12, r:{data(경로 응답 그대로), tab, a, b, bt, rb, now, tz, th, fav}}`. 웹 `_convertEngineRoutes`·`_normStop`·`_rvApply`·탭 대표 고르기·머리줄/탭/타임라인 사실 모으기를 엔진으로 옮겼다(`ios-reference` 와 대조 시험 22). 출력은 rhead 의 h·t·l·k 를 한 panel 로 묶은 화면.
- **앱**: `HomeCore` 가 받은 경로 응답을 그대로 들고(가공 없음) 탭·닫기·즐겨찾기 누름을 구분, `ShellCore.mergeBodies` 가 홈 입력 화면 뒤에 결과 본문을 이어 붙임, `ShellActivity.goRoute` 가 live=0 → follow 지시대로 전체를 받음.
- **없음/다음**: 즐겨찾기 저장·목록(현재 안내만), 장거리 고르기(rh.ld.*), 공지·제보 줄(part n), 내 위치 마커/대기(lv, 탑승 추적과 함께), 재조회(follow retry), 기준시각 재탐색.
- **YJ가 할 일**: 워커 s87(`route-v2-2026-10-20s87`) Deploy + 새 APK.

## 2026-10-20 엔진 s88 + native-shell — 게시판·실시간소통 탭 네이티브 연결
- **게시판(`BoardCore`)**: 서버 `/posts` 글을 엔진 줄로 옮겨 `/screen/board` 에 보냄. 반응(좋아요/ㅋㅋ/ㅠㅠ: 켜면 표시 +1, 한 번 더 누르면 끔)·신고/삭제 두 번 눌러 확정(3.5초)·댓글(서버 `/comments`, 글 펼칠 때 받음)·내 글 보관·글쓰기 시트(엔진 `/screen/write`, 서버 `/post`). 엔진 `board.js` 가 서버 글 규칙(정치·분쟁 소재 빼기, 숫자만 다른 같은 글 하나만, 조회수 0 이면 번호·경과시간으로 보정)을 웹과 같게 한다(웹 함수 대조 시험).
- **실시간소통(`ChatCore`)**: 전체 방 `/talks`, 노선 방 `/lroom`(6초 폴링, 화면이 보일 때만), 공식 공지 `/line-notices`, 보내기 `/react`, 글 신고 `/lreport`(안내창 확인). 엔진 `chat.js` 가 '내 노선'(지금 경로의 지하철 구간 + 탄 기록) 순서와 노선 색(타임라인과 같은 표)을 정하고 `info.pl`(전체 방 글에 붙일 노선)을 준다.
- **경로 결과 → 실시간소통 연결**: `/screen/result` 의 `info.sec` 를 앱이 `ChatCore.routeSec` 로 넘김.
- **없음/다음**: 포인트(글쓰기 +10P)·현장제보 하루 3회·욕설 거르기(지금은 서버가 거절하는 것만), 탄 노선 기록(my_lines)은 경로 확정/탑승 시작과 함께, 맛집·지도·AI/혼잡도/대화 카드, 탑승 추적·GPS 서비스·알림·위젯.
- **YJ가 할 일**: 워커 s88(`route-v2-2026-10-20s88`) Deploy + 새 APK.

## 2026-10-20 엔진 s90 + native-shell — 맛집 탭 네이티브 연결
- **엔진 `food.js`**: 앱이 보내는 것은 사실(`stn`·`gps`·`dl`·`st`·`flt`·`fail`)과 서버/공공데이터 **원자료**(`s`·`u`)뿐. 도착역 → 표(HOME_STNS) 좌표, 도착역이 없으면 기기 위치에서 **가장 가까운 역**(웹 `_foodLoadNearby`와 같은 계산), 서버·공공데이터 중복 정리·거리 재기(웹 `haversineM`)·거리순(웹 `_foodMergeList`)을 모두 엔진이 한다. `st:'done'` 은 엔진이 ready/none 으로 정함. 응답 `info.ctr`(중심)·`info.go`(눌림 번호 → 가게 사실).
- **가게 시트**: `f.sel`(가게)+`f.me`(기기 위치)를 보내면 `foodsheet` 화면과 `info.nv`(네이버/카카오 걷기 길찾기·가게 정보의 앱 스킴+웹 주소)를 돌려줌. 웹의 Leaflet 지도 시트는 외부 지도 앱 열기로 대체.
- **앱 `FoodCore`**: 도착지(홈에서 고른 것)·기기 위치 보관, 서버 `gildongmu-food /food`(400곳) + 공공데이터 `/tago`(최대 3쪽) 받기, 10분 캐시, 칩은 엔진이 `alts:'chips'` 로 한꺼번에 계산해 요청 없이 전환. 통신 허용 목록에 `gildongmu-food.phg0643.workers.dev` 추가.
- **웹과 다른 점**: 웹의 오프라인 내장 목록(STN_FOOD)은 옮기지 않음 → 위쪽(순위·별점)은 서버 맛집, 아래쪽('공공데이터')은 공공데이터. 카카오 가게 ID 검색(장소 상세 바로 열기)은 검색 주소로 대체.
- **시험**: food_engine 140(원자료 정리·가까운 역·시트 웹 대조 포함), JVM FoodCore 점검 추가.
- **YJ가 할 일**: 워커 s90(`route-v2-2026-10-20s90`) Deploy + 새 APK. 기기 미확인(위치 권한 흐름·외부 지도 앱 열기).

## 2026-10-20 엔진 s91 + native-shell — 지도 탭 네이티브 연결(지하철 노선도 + 버스)
- **엔진 `map.js`** (`POST /screen/map`): 머리줄(버스/지하철 · 지역 · 역 검색 · 내 위치 · 14호선 필터), 본문, 역 팝업(`mapstn`: 출발/도착/시간표), 시간표(`maptt`). 역 → 노선 표(MSM+별칭), 검색, 가까운 역, 시간표 요약 모두 엔진. 웹 MSM 869역과 동치 시험.
- **노선도 그림**: 옛 `MetroMapView/Renderer/Camera/Data` 를 `native/shell/` 로 옮겨 `assets/metro_native.bin` 을 읽음. 역을 누르면 엔진 팝업 시트.
- **버스(수도권 우선)**: 앱은 내 위치만 보냄 → 엔진이 `info.bus.need`(받아 올 공공 API 주소)를 돌려줌 → 앱이 `/tago?url=` 프록시로 받아 본문 그대로 `f.bus.res` 에 담아 다시 묻기(위치→정류장→도착정보, 최대 3번). 해석(서울 TOPIS XML / TAGO JSON, 중복 25m 정리, 역 출구 350m 안 우선·목록 길이 확장, 도착 줄)은 전부 엔진. 앱이 받는 주소는 `apis.data.go.kr`·`ws.bus.go.kr` 만.
- **웹과 다른 점**: 경기 GBIS·D1 `/bus-stops` 폴백·즐겨찾기/순서/별명·버스 지도는 아직 안 옮김(경기권은 TAGO 결과만). 서울 TOPIS 가 키 인증 실패면 TAGO 로 내려감.
- **시험**: map_engine 63, JVM MapCore(버스 중계 포함) 통과.
- **YJ가 할 일**: 워커 s91(`route-v2-2026-10-20s91`) Deploy + 새 APK. 기기 미확인(노선도 터치·위치 권한·실제 공공 API 응답).

## 2026-10-20 엔진 s92 + native-shell — 경로 결과 카드 남은 부분(장거리 다시 고르기 · 공지/제보 줄 · 예상 재조회 · 즐겨찾기)
- **장거리 다른 편**: 엔진 `result.js` 가 칩 번호별 질의(`info.ld.m/g` = `&ldMode=…&ldGrade=…&ldDepTs=…`)를 만들어 준다. 앱은 지난 탐색 질의(`lastQs`)에 덧붙여 다시 받아 `r.ld2` 로 보내면, 엔진이 그 응답의 장거리 경로만 바꿔 끼운다(웹 `_ldReselect`).
- **공지·지연 제보 줄**: 앱이 `info.sec`(내 지하철 노선, 최대 6)을 보고 `/line-notices`(route-v2)·`/lalerts?lines=`(board-writer) 원자료를 받아 `r.off`·`r.al` 로 보낸다(60초 캐시). 문장·색·'노선 방 보기'(`rh.room.<i>` → 실시간소통 탭 그 노선) 는 엔진 rhead part n.
- **'예상' 버스 재조회**: 엔진 `follow.retry`(12/16/20초)마다 `&pm=&pa=` 를 붙여 다시 받고, `follow.better` 일 때만 결과를 바꾼다(웹 `_estRetry`). 기준시각을 직접 고른 탐색은 안 한다. 기준시각을 바꾸면(결과가 떠 있고 출발·도착이 정해졌으면) 그 시각으로 다시 찾는다.
- **즐겨찾기**: 새 엔진 `fav.js` → `POST /screen/fav`(최대 8개 · 중복 · 같은 역 규칙 · 이름 기본 'A→B' · 역 이름 → 노선/좌표 풀기). 앱 `FavCore` 는 저장 목록 글(`mk_favorites`)을 그대로 보내고 엔진이 준 새 목록을 그대로 저장. 시트에서 즐겨찾기를 누르면 출발·도착을 정하고 바로 경로 찾기.
- **웹과 다른 점**: 즐겨찾기는 지하철역 경로만(웹과 같음, 웹의 '새로 등록' 입력 폼은 안 옮김 — 경로를 찾은 뒤 '빠른 등록'). 예전 웹 저장값(localStorage)은 옮기지 않음.
- **아직**: 내 위치 마커/대기(`lv`)는 탑승 추적과 함께(#261).
- **시험**: result_engine 30, fav_engine 14, JVM(HomeCore·FavCore) 통과.
- **YJ가 할 일**: 워커 s92(`route-v2-2026-10-20s92`) Deploy + 새 APK. 기기 미확인(실제 재조회 응답·노선 방 이동).

## 2026-10-20 엔진 s93 + native-shell — 홈 카드 4종(AI 크루 · 혼잡도 · 대화 · 세부경로 시트)
- 엔진 `engine/hcards.js` + `hcards-worker.js`(POST `/screen/hcards`): 기기 사실(위치·시각·경로 사실·최근 대화)만 받아 기존 AI(cap14)·혼잡도(cap13)·대화(cap15) 엔진을 한 번에 묶어 패널 3장을 만든다. 시험 `test/hcards_engine.test.js` 15개(CI 표에 추가).
- 앱 `HcardsCore`(5분 AI 갱신 시각·열쇠·눌림 ai.refresh/tk.open/tk.send), `ChatCore.recentTalksJson/talkCount/talkMark`, `HomeCore.resultFacts`(결과·카드 묶음 공용, 경로 없으면 "null"), `ShellActivity`(홈 5초 틱, 카드 병합 `ShellCore.mergeBodies`).
- 세부경로 시트: `result.js` `view:'detail'`(`resDetailScreen`) — 구간마다 노선·소요·시각 범위, 누르면 정거장별 시각 펼침(rd.tg.N), 카카오맵/네이버 길안내 주소는 엔진이 만든다(`info.nav`, 앱 주소 + 웹 대체). 결과 카드에 `rh.detail` 단추. 앱은 `HomeCore.actDetail/detailRequest/onDetail` + `ShellActivity.openDetailSheet`(Dialog+ScreenView, 앱 주소는 kakaomap:// · nmap:// 만 허용).
- 한계: 혼잡도 3D 캐릭터 장면 미이식, AI 브리프의 날씨·다음 열차 null, 기기 미확인. 안드로이드 계층 컴파일은 CI에서만 한다.
- **YJ가 할 일**: 워커 s93(`route-v2-2026-10-20s93`) Deploy + 새 APK.

## 2026-10-20 엔진 s94 + native-shell — 탑승 추적(경로 확정 → 포그라운드 서비스 → 하차/환승 알림 · 결과 카드 내 위치)
- 엔진 `engine/ride-start.js` + `ride-start-worker.js`(POST `/ride/start`, 시험 `test/ride_start_engine.test.js` 19개·CI 표에 추가): 결과 화면 사실(r)로 `/ride-standby` 의 초기 state 를 만든다 — 노드(출발+역·정류장, 노선·계획 분), 영점용 정류장(좌표·도착 ms·버스 여부·마지막), 알림 대상(`raTargets`: 환승 하차역 · 최종 하차), 시각표 기준(첫 구간이 지하철이면). 장거리·시각/좌표 없는 옛 응답은 `{ok:false,msg}`.
- `rhead.js`: `rheadTrkPrep`(화면과 시작이 같은 사실 정리) · `rheadTrkPoints` 내보냄, 점마다 `la/lo/ms/sty` 추가. 타임라인 마커·칸별 시각은 노드 번호 `lv.pn/lv.na` → 칸 번호로 엔진이 바꾼다. `result.js`: `r.lv`(대기 모드 pos·arr·curIdx) → 마커/시각, `r.ride` → 상태 박스 + [안내 종료], 세부경로 시트에 [이 경로로 탑승 시작]/[탑승 안내 종료]. `ride-standby.js` 출력에 `pos`·`arr` 추가(워커 사본 sync).
- 앱: `RideCore`(요청 본문·응답 읽기·위치 모으기·저장/복원, 순수 자바) · `RideService`(포그라운드 서비스, foregroundServiceType=location, GPS+네트워크 위치 → 5초(엔진 nextMs, 2~8초)마다 `/ride-standby`, 상주 알림 + 알림 채널 + 엔진이 준 진동 무늬, START_STICKY 복원 30분) · `RideWidget`(홈 위젯: 엔진 글 그대로) · `HomeCore`(routeId·rideJson/lvJson·rh.stop/rd.confirm/rd.stop) · `ShellActivity`(권한 요청, startRide/stopRide, 5초 틱에서 서비스 상태를 카드에 반영). 매니페스트: FOREGROUND_SERVICE(+LOCATION)·POST_NOTIFICATIONS·VIBRATE, service, widget receiver, res/layout·xml·drawable 추가.
- 한계(정직하게): 기기 미확인. 승차 전 대기/승차 확정 판정은 옮기지 않았다(누른 시점에 이미 탔다고 본다). `/pos-fuse` 위치 융합·기지국 선행·버스 경로 확정 UI·플로팅 오버레이(SYSTEM_ALERT_WINDOW)·알림 종류별 끄기(allowed)는 미이식 — 알림은 상주 알림 + 헤드업 알림으로 대신한다. 앱 프로세스가 죽었다 서비스만 되살아나면 결과 카드는 다시 안 뜬다(알림·위젯은 이어짐).
- **YJ가 할 일**: 워커 s94(`route-v2-2026-10-20s94`) Deploy + 새 APK. 첫 사용 시 위치·알림 권한 허용.

## 2026-10-20 엔진 s95 + native-shell — 마무리(앱 규칙 엔진 · 화면 움직임 · 설정 정리 · 옛 웹 시절 자바 걷어냄)
- **규칙 엔진** `engine/rules.js` + `rules-worker.js`(POST `/rules`, 상태 없음, 시험 `test/rules_engine.test.js` 26개·CI 표에 추가): `check`(비었나 · 욕설 — 웹 `_BAD_WORDS` 와 같은 목록, 공백 끼워 넣기 우회 막음 · 현장제보 하루 3회) · `award`(글쓰기 +10P · 탑승 안내 시작 +10P · 현장제보 3~8P 확률 35/25/18/12/7/3 추첨 — 무작위 수는 기기가 보냄) · `view`(총점 · 등급 · 다음 등급까지) · `mylines`(탄 노선 기록 정리). 저장값 `pt` 는 엔진이 만든 그대로 앱이 보관(`mk_pt`).
- 앱: `RulesCore`(요청 본문 · 답 읽기 · 저장, 순수 자바) + `ShellActivity` 연결 — 글쓰기(엔진 검사 → 서버 등록 → 포인트 문구), 댓글 · 채팅 · 홈 한마디(검사 통과해야 올림, 거절되면 입력칸 유지), 탑승 안내 시작(+10P, 탄 노선 `my_lines` 기록). 엔진이 안 닿으면 막지 않는다(서버 필터가 한 번 더 거른다). `ShellCore.settingsFacts` 에 `pt`·`day`(`mk_today`, 화면 요청 직전에 껍데기가 넣음) 추가.
- **설정** `settings.js`: 웹 기능 스위치(feat) 줄 · settingsStat 제거, "포인트" 칸 추가(등급 · 다음 등급까지). 시험 157.
- **움직임**: 시트는 아래에서 올라오며 나타나고(220ms) 탭 화면은 살짝 페이드(140ms). 지도 마커 맥박/이동은 기존 `ScreenView` 것.
- **걷어냄**: 이 브랜치에서 쓰지 않는 옛 캐패시터 시절 자바(`native/*.java · *.kt · res/`)와 그 JVM 시험(Htl · Row · Scene · Store · Widget · AwtCv). `main` 에는 그대로 있다. 워크플로(`.github/workflows/*`)는 데이터 수집용이라 그대로 둠(공휴일 갱신은 `main` 의 `www/` 를 고치는 것이라 이 브랜치와 무관). `ios-reference/` 는 iOS 기준본이자 동등성 시험 입력이라 유지.
- **한계(정직하게)**: 전부 기기 미확인. 혼잡도 3D 캐릭터 장면 · 웹 역 맛집 목록 · 카카오 장소 ID 조회 · Leaflet 지도 · 버스(경기 GBIS · D1 · 즐겨찾기 · 지도) 미이식. 즐겨찾기 '새로 등록' 입력 폼 · 옛 웹 localStorage 즐겨찾기 이전 없음. AI 브리프에 날씨 · 다음 열차 없음. 탑승 추적: 승차 전 대기 판정 · `/pos-fuse` · 떠 있는 오버레이 · 알림 종류별 켜기/끄기 연결(`np_arrive`/`np_transfer` → `allowed`) 없음, 앱이 죽으면 결과 카드는 안 돌아옴(알림 · 위젯은 계속).
- **YJ가 할 일**: 워커 s95(`route-v2-2026-10-20s95`) Deploy + 새 APK. 첫 탑승 안내 때 위치 · 알림 권한 허용.

## 2026-10-21 s95b — 탑승 알림 종류별 켜기/끄기 연결 (엔진 변경 없음, 워커 그대로 s95)
- 설정의 "도착 알림"(np_arrive) · "환승 알림"(np_transfer)을 끄면 탑승 시작 때 `RideCore.offKinds` 가 끈 종류(near_arrive2 · near_arrive · arrive / transfer2 · transfer)를 `allowed:{종류:false}` 로 실어 보내고, 엔진 `ride-start` 가 state.cfg.allowed 에 넣어 `ride-standby` 가 그 종류를 막는다. 시험: ride_start_engine 21, JVM RideCore.
- 앱이 죽은 뒤 결과 카드 복원은 하지 않기로 함: 경로(홈 결과)가 저장되지 않아 붙일 카드가 없다. 알림(종료 버튼)·위젯은 계속 동작.
- 남은 큰 것: 승차 전 대기 판정(boarded:false 일 때 승차 감지), `/pos-fuse`, 떠 있는 오버레이.

## 2026-10-21 엔진 s96 — 승차 대기 → 승차 감지 (`ride-standby.rsWait`, `ride-start` cfg.waitBoard)
- `/ride/start` 가 만든 state 는 `cfg.waitBoard:true`(요청 `r.wait:false` 로 끌 수 있음). `/ride-standby` 첫 위치 틱에서 첫 승차역(pass:false 정류장) 출발 시각이 아직 안 지났거나 90초 안쪽이면 **승차 대기**를 건다 — `eta.boarded=false · notDeparted=true` (ride-eta 가 승차역 이후를 예정 시각 그대로 둠), 상주 글 `승차 대기 · 역 시각 · 도착지까지`, 하차·환승 알림 보류.
- 감지: 승차역 150m 안에 한 번이라도 있었고(`seen`) → 400m 이상 벗어나며 최근 15초 이상 구간 속도가 4m/s(걷는 속도 3.0 보다 빠름) 이상이면 승차 확정 — 첫 승차역 통과 증거(gps, 역 근처 마지막 시각)를 넣고 평소 흐름. 걷는 속도로 멀어지면 승차가 아니다. 출발 시각 8분 뒤까지 감지 못 하면 시각표대로 이어간다(알림이 영영 안 울리는 것 방지). 출발 시각보다 90초 넘게 늦게 시작했으면 이미 탄 것으로 본다.
- 시험: ride_start_engine 32(대기 시작·역 도착·승차 확정·걸어서 멀어짐·8분 뒤 시각표·늦은 시작·끄기·알림 보류). 워커 `route-v2-2026-10-20s96`. 기기 미확인(실제 GPS 정확도 · 지하 신호 끊김).
- 남은 것: `/pos-fuse` 위치 융합, 떠 있는 오버레이. 대기 중엔 결과 카드 내 위치 마커(pos)가 비어 있다.

## 2026-10-21 엔진 s97 — AI 브리프에 날씨 (앱 수정 없음)
- `hcards.js`: `hcWxPoints(f)` 가 날씨를 볼 두 지점을 정한다(wF = 지금 위치, 없으면 경로 출발역 · wT = 경로 도착역; 역 이름은 `home-stations` 표에서 찾고, 버스 정류장처럼 표에 없으면 지점 없음). `f.wx = {wF,wT}`({temp,txt,rain}) 가 있으면 AI 브리프(`aicard` → `home-brief`)에 그대로 쓴다. 날씨 값이 없으면 날씨 말을 하지 않는다.
- `hcards-worker.js`: Worker 가 `sceneWeather`(subway-api `/weather`, 10분 캐시, 2.5초 제한)로 두 지점 날씨를 받아 `f.wx` 에 넣어 준다. 앱은 바뀐 게 없다(새 APK 불필요). 실패하면 날씨 없이 계산.
- 시험: hcards_engine 23(지점 정하기 · 값 반영 · 값 없을 때 · 워커 안에서 /weather 두 번 호출). 워커 `route-v2-2026-10-20s97`.
- 지하철 '다음 열차'(`af.nt`)는 이미 경로 응답 구간의 `nextTrain`(next-train 엔진이 붙임)을 쓰고 있었다 — 이전 인수인계의 '다음 열차 없음' 한계는 틀린 말이었고, 경로 응답에 그 값이 실려 오면 AI 글에 들어간다(없으면 말하지 않음). 날씨만 비어 있던 것을 이번에 채웠다.
