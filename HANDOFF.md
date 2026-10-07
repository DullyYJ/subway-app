# HANDOFF (길동무 앱 + 엔진) — 작업 묶음이 끝날 때마다 이 파일 하나를 갱신한다

**마지막 갱신: 2026-10-06 (KST)** · 다음 Claude는 이 파일부터 읽고, 아래 "주의·원칙"을 지킨다. **작업 3·4(서구청→서해구청 표기, 번들 누락역 추가)는 [`HANDOFF-작업3-4-서해구청-누락역.md`](HANDOFF-작업3-4-서해구청-누락역.md)로 넘겼다.** **2026-10-06 세션의 최신 변경(엔진 인천2호선 수정 06a~d, 총시간/타임라인 정합 06e·06f, 라이브 스윕 시험, 앱 셀 수정, 시험·시뮬 하네스, 작업 방법·남은 일)은 [`HANDOFF-2026-10-06.md`](HANDOFF-2026-10-06.md)에 있다 — 함께 읽을 것. 원칙: 모든 결정은 엔진이, 앱은 그리기만.**

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
