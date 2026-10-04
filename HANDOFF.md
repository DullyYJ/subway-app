# HANDOFF (길동무 앱 + 엔진) — 작업 묶음이 끝날 때마다 이 파일 하나를 갱신한다

최종 갱신: 2026-10-04 · 이번 묶음(공지 문구·지연 의심 추정)은 YJ 허용에 따라 **두 저장소 main에 직접 push**했다. 작업 브랜치 `claude/jolly-darwin-dtzab9`에는 **미검증 WIP 커밋 `ac3e4ff`**(설정에서 이용 노선 직접 고르기)가 있다 — main에 넣지 말 것(4번 참고). 이 브랜치의 HANDOFF.md는 오래된 사본이니 main의 것을 본다

## 1. 저장소·배포 방법·현재 버전
| 저장소 | 역할 | 배포 |
|---|---|---|
| `DullyYJ/subway-app` | 앱. 화면은 `www/index.html`, 개인정보처리방침 `www/privacy.html` | Actions `Build APK`(build-apk.yml): **main push 때만 자동**. 다른 브랜치는 수동 실행(workflow_dispatch). 결과는 아티팩트 `subway-app-debug` |
| `DullyYJ/route-v2` | 경로 엔진 `route-v2-worker.js` + 실시간소통/게시판 서버 `board-writer/index.js` (별도 워커) | 엔진: main push 시 Cloudflare Workers Builds가 자동 배포(YJ 확인). GitHub Actions 없음. `board-writer`는 엔진과 **따로 배포**해야 한다(main/PR 병합만으로 배포되지 않음) |

- 엔진 `ENGINE_VERSION` = `route-v2-2026-10-04bt` (루트 URL 응답의 `version`으로 배포 여부 확인) · 읽기 전용 상태 확인 `GET /est-status`
- 앱 서버 주소: 엔진 `route-v2.phg0643.workers.dev`, 게시판/대화 `board-writer.phg0643.workers.dev`, 버스·기타 `gentle-lab-7e47subway-api.phg0643.workers.dev`
- PR: [subway-app#1](https://github.com/DullyYJ/subway-app/pull/1) 병합 완료(`18ef908`). [route-v2#1](https://github.com/DullyYJ/route-v2/pull/1)(board-writer 코드, 브랜치 `claude/jolly-darwin-dtzab9`)은 draft로 열려 있고 main에는 **아직 안 들어갔다** — 병합해도 board-writer는 배포되지 않는다
- main push·board-writer 배포·Cloudflare 접속은 YJ가 허용했다("전부 허용"). 하지만 아래 두 가지는 허용만으로 안 열리고 YJ가 설정을 바꿔야 한다(3·4번 참고)

## 2. 이번에 바꾼 것
**이번 묶음 (2026-10-04, main 직접 push)**
- subway-app `60eb8d7` — 노선 방 위 공지 줄: 1~8호선에 진행 중 공지가 없으면 `N호선 정상 운행 중입니다 (방금 확인)`. 공지가 있을 때 표시, 경의중앙선·공항철도·그 밖의 노선 문구, 공지 해제 시 자동 전환(엔진 `NTCE_RESOLVED_RE`)은 그대로. Build APK #735 성공
- route-v2 `b66fe7d` · `f062161`(ENGINE_VERSION 04bt) · `cd0b195`(test) — **공식 데이터가 없는 노선의 '지연 의심(추정)'** (`route-v2-worker.js`, `estimateNotices` 계열)
  - 대상 `9호선·신분당선·공항철도·경의중앙선·수인분당선`. 1~8호선 공식 공지 동작은 그대로, 같은 노선에 공식 공지가 있으면 공식이 우선(추정은 만들지도 않음)
  - 데이터: 서울 `realtimePosition`을 **엔진이 `env.BUSAPI`(gentle-lab `/seoul`, 시크릿 `SEOUL_API_KEY`는 gentle-lab에 이미 있음)로 호출**. 엔진에 새 시크릿 없음, 앱은 직접 호출하지 않음
  - 판정: 같은 방향 인접 열차 간격(역간 소요시간 `seg`로 환산) ≥ `min(2×배차간격, 배차간격+6분)`이 **연속 2회** → 지연 의심, **정상 연속 2회** → 해제. 같은 위치 자료(`recptnDt`)는 한 번만 센다. 연속 횟수·상태는 `ROWS_KV`(`est:v1:<노선ID>`)
  - 배차간격 = 번들 시간표 `SUBWAY_BUNDLE.lines[*].tt`(요일·시간대별). **`tt`가 있는 건 1~9호선뿐이라 대상 5개 중 지금 판정되는 노선은 9호선 하나다.** 신분당선·경의중앙선·수인분당선은 `hw:300`이라는 고정 기본값뿐이고 공항철도는 첫·막차만 있어 근거가 없다 → **판단 보류**(호출도 표시도 안 함). `tt`가 번들에 채워지면 코드 변경 없이 자동으로 판정 대상이 된다
  - 보류(정상이라고 표시하지 않음): 첫차+30분 전, 막차−60분 이후, **23시 이후(심야)**, 막차 열차(`lstcarAt`)가 보임, 위치 자료 5분 넘게 오래됨/없음/오류, 방향당 열차 3대 미만, 역 이름 매칭 30% 초과 실패, 호선이 한 줄(트리)이 아닌 경우. 보류가 10분 넘게 이어지면 의심 상태도 내린다(정상 표시 없이)
  - 호출량: 노선별 **2분에 1회 이하**(KV `lastTry`로 isolate 사이 공유). `/line-notices` 요청은 막지 않고 저장된 상태로 바로 답하며, 갱신할 때가 된 노선만 `waitUntil`로 백그라운드 갱신. 일일 한도(`ERROR-337` 등)면 30분 쉰다
  - 응답: `/line-notices`의 `lines[노선]`에 `estimated:true`로 합침. 지연 의심 `{estimated, suspect:true, title:"지연 의심 (도착 간격 기준 추정)", text, ts, normalMin, gapMin}`, 해제 직후 30분만 `{estimated, suspect:false, cleared:true, title:"정상 운행 중으로 보여요 (도착 간격 기준)"}`. 처음부터 정상이면 아무것도 안 낸다
- subway-app `04c2da3` — 노선 방 위 공지 줄: 추정은 공식과 다르게 표시(`⚠️ 지연 의심 (도착 간격 기준 추정) · … (N분 전 · 공식 공지 아님)` 주황, 해제는 `🟢 정상 운행 중으로 보여요 (도착 간격 기준)` 회색). 경로 카드 줄에는 지연 의심만 띄움. `_offText`/`_lrRenderOfficial`/`_routeOfficialRow`

**이전 묶음**
**subway-app**
- `5772a90` · `7bb6764` — `.github/workflows/ntce-lines.yml`(임시 집계 워크플로, 6번 참고). 공지 API 과거 300건(2024-05-14~2026-09-22, 전체 1,314건)의 `lineNmLst` 집계 + ride_log 건수 조회(읽기 전용)
  - 결과: 1~8호선이 거의 전부(1호선 95·4호선 86·5호선 75·2호선 68·3호선 62·6호선 45·7호선 43·8호선 35). 그 외는 **경의중앙선 4건·공항철도 3건**뿐(환승역 관련). 9호선·신분당선 등 0건. `lineNmLst`가 빈 공지 33건
  - ride_log: 테이블은 있으나 **0건**
- `16abcfe` — 공식 공지가 없을 때 경의중앙선·공항철도 문구를 "연동 전"에서 "환승역 관련 공지만 가끔 올라와요 · 지금은 없어요"로 변경(그 외 노선 문구·공지 표시는 그대로)
- `24eab5e` — 커뮤니티 개편
  - 상단 `내 노선` 칩 삭제. 노선 방(대화·공식 공지·지연/붐빔 제보·신고)은 **실시간소통 하단 탭**으로 이동
  - 하단 탭 = `전체` + 내가 경로 안내를 시작할 때 실제로 타는 지하철 노선(탄 횟수 순, 최대 6개, `_safeLS` 키 `my_lines`). 기록 시점은 `startTracking()` 안의 `_myLinesRecord()`
  - 전체 탭: 각 노선 방 대화를 모아서 표시, 닉네임 앞에 `(2호선)` 표시. 전체에서 쓴 글은 가장 많이 타는 노선 방으로 간다(없으면 노선 없이)
  - 스와이프 순서: 실시간소통 → 게시판 → 뉴스 → 설정. 게시판에서 밀어도 더는 내 노선으로 가지 않음(뉴스 카테고리가 따라 나오던 문제 해결). 뉴스 첫 카테고리에서 오른쪽 → 게시판
  - 노선 방 글쓰기는 `/lroom` 대신 `/react`(line 포함)로 보내 AI 이용자가 반응하게 함. 지연·붐빔 제보는 기존 `/lroom` 그대로
  - 개인정보처리방침: 노선 방도 AI 생성 콘텐츠 안내에 포함
- 수정하지 않은 것(규칙): AI 승무원 문구는 건드리지 않았다. 승차·대기 분할, 경로 선택 이유, 문 위치 팁은 경로 카드에만 있다 — AI 승무원에 다시 넣지 말 것

**route-v2** (`93c9927`, `board-writer/index.js`만 변경)
- `generateLineTalks`: 20분 cron마다 총 줄 수(`talkCount`)를 노선 비중(`LR_AI_ROOMS`: 2호선 10 … 인천2호선 1)대로 나눠 `line_msgs`(kind=chat, ipk='ai')에 저장. cron은 `generateTalks` 대신 이것을 호출(`generateTalks`와 `/gentalk`는 남겨 둠)
  - AI는 지연·붐빔 제보(delay/crowd)를 만들지 않아 `lrAlerts` 집계에 섞이지 않음. 대화에서 노선의 지금 운행 상황을 지어내지 않도록 프롬프트(`lineRule`)에서 막음
  - AI 글은 2일 뒤 삭제(실제 이용자 글은 14일). 6개월 중복 원장(`talkLedgerFilter`)은 방 구분 없이 공용
- `GET /talks`: 노선 방 대화를 시간순으로 모아 각 줄에 `line`을 붙여 내려줌(+ 최근 6시간의 옛 `talks`는 line=null)
- `POST /react`: body에 `line`이 있으면 그 방에 저장하고 그 방에서 AI가 반응. 없으면 기존 동작

## 3. 확인 안 된 것
- **엔진 04bt 자동 배포 결과**: main push 후 Workers Builds 결과를 이 환경에서 못 본다(Cloudflare 접속·체크 조회 불가). 루트 URL `version`이 `route-v2-2026-10-04bt`인지, `/est-status`가 열리는지 확인 필요. (이 PR 브랜치에서는 Workers Builds가 매번 0초 만에 실패했다 — main에서는 다를 수 있다)
- **서울 realtimePosition 실호출 미검증**: 네트워크가 막혀 실제 응답을 못 받았다. 필드명(`statnNm, trainNo, updnLine, recptnDt, lstcarAt`)은 공개 명세 기준이고 모의 데이터로만 시험했다. 배포 후 `/est-status`에서 9호선이 계속 `hold`(예: `unmapped`, `no-data`, `stale`, `fetch`)면 필드·역 이름 불일치부터 본다. BUSAPI 내부 호출 경로(`https://busapi.internal/seoul?path=…`)는 기존 `/tago` 패턴과 같지만 실호출은 못 해 봤다
- **서울 인증키 일일 한도**: gentle-lab 주석 기준 키 1개 하루 1,000건. 9호선만 판정해도 요청이 계속 오면 최대 약 500건/일(2분 × 06:06~23:00). 앱의 도착정보 조회와 같은 키를 나눠 쓰니 부족하면 `EST_OBS_MS`(현재 120초)를 늘린다
- **배차간격 해석**: `tt`가 일반열차만의 간격인지 급행 포함인지 모른다. 9호선은 방향별 모든 열차를 함께 세므로(간격이 더 촘촘하게 나옴) 오탐 쪽이 아니라 누락 쪽으로 기운다
- 판정 구간·임계값(첫차+30분~min(막차−60분, 23:00), 3대 이상, 2회 연속, 10분 끊김)은 YJ 규칙과 제 해석을 합친 값이다
- **board-writer 배포가 막힌 이유 2가지** (YJ 설정 필요)
  1. `route-v2` 저장소에는 `CF_API_TOKEN`·`CF_ACCOUNT_ID` 시크릿이 없다(확인용 워크플로가 "시크릿 없음"으로 실패). `subway-app`에는 있다. 시크릿은 Claude가 만들 수 없다
  2. 작업 환경의 Network access가 `workers.dev`, `api.cloudflare.com`, `apis.data.go.kr`을 막는다(2026-10-04 재확인, 403)
  - 또 `board-writer`용 `wrangler.toml`이 저장소에 없어서, 그냥 `wrangler deploy`하면 대시보드에서 설정한 바인딩(D1 등)이 덮어써질 수 있다. 배포 전에 현재 설정(바인딩 이름·크론)을 먼저 읽어 보고, 코드만 올리는 방식(Cloudflare API 업로드 + 기존 바인딩 유지)이나 대시보드 수동 배포를 쓸 것
- **board-writer 서버 배포 안 됨**: 이 작업 환경은 Cloudflare·workers.dev·apis.data.go.kr 접속이 막혀 있다. 배포 전에는 호선별 AI 글과 `(N호선)` 표시가 나오지 않는다. 배포 전에 노선 방에서 쓴 글은 호선 방이 아니라 예전 전체 대화(`talks`)에 저장된다
- 실제 Gemini 호출 경로는 못 돌려 봤다(로컬 모의 실행은 폴백 문구 경로). 폴백은 6개월 중복 금지 때문에 글이 적게 나온다. 배포 후 `/status`·`/talks`로 방별 글 수가 비중대로 나오는지 확인 필요
- `S.route.lp`의 노선 이름 형식이 `2호선`처럼 나오는지는 코드로만 확인(실기기 경로 안내로 `my_lines` 쌓이는지 확인 필요). lp에서 못 찾으면 `_lrRouteLines()`(검색 결과 1번 경로)로 대체하는데, 사용자가 다른 경로를 골랐다면 어긋날 수 있다
- APK 빌드: 수동 #732·#733 성공, 병합 자동 #734(`18ef908`) 성공, 문구 변경 #735(`60eb8d7`) 성공. 지연 의심 표시 #736(`04c2da3`) **성공**
- route-v2 PR의 `Workers Builds: route-v2` 체크 실패: 빌드가 0초에 끝나고 로그 없음, 이 PR은 `route-v2-worker.js`를 안 건드림 → Cloudflare 빌드 설정 문제로 보이나 대시보드를 못 봐서 원인 미확인(PR에 코멘트 남김)
- 노선 칸이 빈 공지 33건은 지금 엔진에서 어느 노선에도 표시되지 않는다(고치지 않음)

## 4. 남은 일 · YJ가 정할 것
- **YJ가 할 일**: (a) `route-v2` 저장소 Settings → Secrets에 `CF_API_TOKEN`·`CF_ACCOUNT_ID` 추가하거나, board-writer를 대시보드에서 직접 배포 (b) 필요하면 환경 Network access에 `workers.dev`, `api.cloudflare.com`, `apis.data.go.kr` 허용 (c) route-v2 `Workers Builds` 체크 실패 원인 확인(Cloudflare 대시보드, 이 PR과 무관해 보임)
- **YJ 결정**: 배포 시점(배포하면 호선별 AI 글 시작) / 노선 비중(`LR_AI_ROOMS`의 w)이 맞는지
- **YJ 결정 필요(지연 추정)**: 신분당선·공항철도·경의중앙선·수인분당선은 시간표 배차간격 자료가 없어 지금 판정되지 않는다. 선택지 ① 실제 시간표 배차간격을 번들 `tt`(또는 별도 표)에 채우기 ② 같은 시점 열차들 간격의 중앙값을 기준으로 삼는 대체 기준(시간표 기준이 아님, 노선 전체가 멈춘 경우는 못 잡음) ③ 지금처럼 보류 유지. 정해지기 전에는 임의 기본값(300초)으로 판정하지 않는다
- **미완 WIP**: 브랜치 `claude/jolly-darwin-dtzab9`의 `ac3e4ff` — 하단 탭을 '설정에서 직접 고른 노선'으로 바꾸는 작업(설정 카드·고르기 창, 자동 기록 제거). 문법 검사만 했고 화면 시험·PR은 안 했다. main에는 아직 '경로 안내 시작 때 자동으로 쌓이는 노선'(`24eab5e`) 방식이 들어 있다. 이어서 할 때: 헤드리스 시험 → PR. 그 브랜치의 HANDOFF.md는 오래된 사본
- (B) 환승 보정: ride_log가 0건이라 보류. 근거는 **환승 1회 이상 n≥30, 일관된 2분 내외**일 때만, 역별 편차로. `xfer_pos.secs` 평균(255초)을 통째로 쓰지 말 것. 단, ride_log에는 역 이름이 없어 역별 편차를 내려면 별도 방법이 필요(노선·시간대 수준까지만 가능)
- (C) 키·토큰 정리: YJ가 **이번에는 패스**라고 했다. 기능 작업 후 다시 요청이 오기 전까지 하지 않고, 앱에 새 키를 넣지 않는다
- 선택: 실제 사용자가 거의 없는 노선(GTX-A 등)은 AI 글이 너무 적거나 어색한지 배포 후 확인

## 5. 테스트·빌드 확인 방법
- 앱 문법: `www/index.html`의 인라인 `<script>`를 `new Function`으로 검사(`type="text/x-metro-svg"` 블록은 JS가 아니라 제외)
- 앱 화면: Playwright(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`)로 `file:///.../www/index.html`을 열고 외부 요청을 모두 막은 뒤 board-writer(`/talks`, `/lroom`, `/react`)만 모킹. `switchTab('community', #ni-community)` → `showChatTab(#chipLiveTalk)`; `_myLinesRecord()`로 노선 쌓기; `_chatSelect('2호선')`; 스와이프 순서는 `_commSwipeStep(±1)`과 `_commCurTab()`
- 지연 의심(엔진): `node test/est_delay.test.js`(단위 47건) · `node test/est_line_notices.test.js`(`/line-notices` 통합) — 저장소 `route-v2`. 모의 위치·KV·BUSAPI라 네트워크가 필요 없다
- 서버: `node --check board-writer/index.js`. 로컬 실행은 `node:sqlite`로 D1을 흉내 낸 모의 env(`prepare/bind/run/all/first/batch`)를 만들어 `scheduled()`, `/talks`, `/lroom`, `/react`를 호출(Node 22)
- 빌드: Actions → `Build APK` → Run workflow(브랜치 선택) 또는 MCP `actions_run_trigger`. 성공하면 `subway-app-debug` 아티팩트가 생긴다. 서명 릴리스(AAB)는 시크릿이 있을 때만
- 이 환경 제약: 아웃바운드가 프록시를 거치며 `workers.dev`, `apis.data.go.kr`, `api.cloudflare.com`은 막혀 있다. 외부 API를 불러야 하면 Actions 러너에서 시크릿(`TAGO_KEY`, `CF_API_TOKEN`, `CF_ACCOUNT_ID`)으로 한다(키·본문은 로그에 출력하지 말 것)

## 6. 임시 파일 · 되돌릴 것
- `ntce-lines.yml`(임시 집계 워크플로)은 병합 전에 삭제했다. 같은 집계가 필요하면 git 히스토리의 `5772a90`/`7bb6764`에서 꺼내 쓴다
- 이 브랜치의 `Build APK` 수동 실행 결과물은 확인용(30일 뒤 만료)
- 로컬 임시 파일(모의 서버 테스트, 스크린샷)은 스크래치패드에만 있고 저장소에는 없다
