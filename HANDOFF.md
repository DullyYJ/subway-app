# HANDOFF (길동무 앱 + 엔진) — 작업 묶음이 끝날 때마다 이 파일 하나를 갱신한다

최종 갱신: 2026-10-04 (UTC 2026-10-03 23시 반경) · 작업 브랜치 `claude/jolly-darwin-dtzab9` (두 저장소 공통). subway-app PR #1은 **병합됨**(`18ef908`, main) → 이 브랜치는 병합 뒤 main에서 다시 딴 것

## 1. 저장소·배포 방법·현재 버전
| 저장소 | 역할 | 배포 |
|---|---|---|
| `DullyYJ/subway-app` | 앱. 화면은 `www/index.html`, 개인정보처리방침 `www/privacy.html` | Actions `Build APK`(build-apk.yml): **main push 때만 자동**. 다른 브랜치는 수동 실행(workflow_dispatch). 결과는 아티팩트 `subway-app-debug` |
| `DullyYJ/route-v2` | 경로 엔진 `route-v2-worker.js` + 실시간소통/게시판 서버 `board-writer/index.js` (별도 워커) | Cloudflare. GitHub Actions 없음. `board-writer`는 route-v2 워커와 **따로 배포**해야 한다(PR 병합만으로 배포되지 않음) |

- 엔진 `ENGINE_VERSION` = `route-v2-2026-10-03bs` (이번 묶음에서 엔진 코드는 안 건드려 그대로)
- 앱 서버 주소: 엔진 `route-v2.phg0643.workers.dev`, 게시판/대화 `board-writer.phg0643.workers.dev`, 버스·기타 `gentle-lab-7e47subway-api.phg0643.workers.dev`
- PR: [subway-app#1](https://github.com/DullyYJ/subway-app/pull/1) 병합 완료. [route-v2#1](https://github.com/DullyYJ/route-v2/pull/1)(board-writer)은 draft로 열려 있음 — **병합해도 board-writer는 배포되지 않는다**
- main push·board-writer 배포·Cloudflare 접속은 YJ가 허용했다("전부 허용"). 하지만 아래 두 가지는 허용만으로 안 열리고 YJ가 설정을 바꿔야 한다(3·4번 참고)

## 2. 이번에 바꾼 것
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
- **board-writer 배포가 막힌 이유 2가지** (YJ 설정 필요)
  1. `route-v2` 저장소에는 `CF_API_TOKEN`·`CF_ACCOUNT_ID` 시크릿이 없다(확인용 워크플로가 "시크릿 없음"으로 실패). `subway-app`에는 있다. 시크릿은 Claude가 만들 수 없다
  2. 작업 환경의 Network access가 `workers.dev`, `api.cloudflare.com`, `apis.data.go.kr`을 막는다(2026-10-04 재확인, 403)
  - 또 `board-writer`용 `wrangler.toml`이 저장소에 없어서, 그냥 `wrangler deploy`하면 대시보드에서 설정한 바인딩(D1 등)이 덮어써질 수 있다. 배포 전에 현재 설정(바인딩 이름·크론)을 먼저 읽어 보고, 코드만 올리는 방식(Cloudflare API 업로드 + 기존 바인딩 유지)이나 대시보드 수동 배포를 쓸 것
- **board-writer 서버 배포 안 됨**: 이 작업 환경은 Cloudflare·workers.dev·apis.data.go.kr 접속이 막혀 있다. 배포 전에는 호선별 AI 글과 `(N호선)` 표시가 나오지 않는다. 배포 전에 노선 방에서 쓴 글은 호선 방이 아니라 예전 전체 대화(`talks`)에 저장된다
- 실제 Gemini 호출 경로는 못 돌려 봤다(로컬 모의 실행은 폴백 문구 경로). 폴백은 6개월 중복 금지 때문에 글이 적게 나온다. 배포 후 `/status`·`/talks`로 방별 글 수가 비중대로 나오는지 확인 필요
- `S.route.lp`의 노선 이름 형식이 `2호선`처럼 나오는지는 코드로만 확인(실기기 경로 안내로 `my_lines` 쌓이는지 확인 필요). lp에서 못 찾으면 `_lrRouteLines()`(검색 결과 1번 경로)로 대체하는데, 사용자가 다른 경로를 골랐다면 어긋날 수 있다
- APK 빌드: 브랜치 수동 run #732(`16abcfe`)·#733(`24eab5e`) 성공. 병합 후 main 자동 빌드 run #734(`18ef908`)는 작성 시점에 진행 중(결과는 Actions의 Build APK #734에서 확인)
- route-v2 PR의 `Workers Builds: route-v2` 체크 실패: 빌드가 0초에 끝나고 로그 없음, 이 PR은 `route-v2-worker.js`를 안 건드림 → Cloudflare 빌드 설정 문제로 보이나 대시보드를 못 봐서 원인 미확인(PR에 코멘트 남김)
- 노선 칸이 빈 공지 33건은 지금 엔진에서 어느 노선에도 표시되지 않는다(고치지 않음)

## 4. 남은 일 · YJ가 정할 것
- **YJ가 할 일**: (a) `route-v2` 저장소 Settings → Secrets에 `CF_API_TOKEN`·`CF_ACCOUNT_ID` 추가하거나, board-writer를 대시보드에서 직접 배포 (b) 필요하면 환경 Network access에 `workers.dev`, `api.cloudflare.com`, `apis.data.go.kr` 허용 (c) route-v2 `Workers Builds` 체크 실패 원인 확인(Cloudflare 대시보드, 이 PR과 무관해 보임)
- **YJ 결정**: 배포 시점(배포하면 호선별 AI 글 시작) / 노선 비중(`LR_AI_ROOMS`의 w)이 맞는지
- **YJ 결정 대기**: 도착 간격 기반 지연 추정 방식 — 정해지기 전에는 구현하지 않는다(구현 전에 물어볼 것)
- (B) 환승 보정: ride_log가 0건이라 보류. 근거는 **환승 1회 이상 n≥30, 일관된 2분 내외**일 때만, 역별 편차로. `xfer_pos.secs` 평균(255초)을 통째로 쓰지 말 것. 단, ride_log에는 역 이름이 없어 역별 편차를 내려면 별도 방법이 필요(노선·시간대 수준까지만 가능)
- (C) 키·토큰 정리: YJ가 **이번에는 패스**라고 했다. 기능 작업 후 다시 요청이 오기 전까지 하지 않고, 앱에 새 키를 넣지 않는다
- 선택: 실제 사용자가 거의 없는 노선(GTX-A 등)은 AI 글이 너무 적거나 어색한지 배포 후 확인

## 5. 테스트·빌드 확인 방법
- 앱 문법: `www/index.html`의 인라인 `<script>`를 `new Function`으로 검사(`type="text/x-metro-svg"` 블록은 JS가 아니라 제외)
- 앱 화면: Playwright(`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`)로 `file:///.../www/index.html`을 열고 외부 요청을 모두 막은 뒤 board-writer(`/talks`, `/lroom`, `/react`)만 모킹. `switchTab('community', #ni-community)` → `showChatTab(#chipLiveTalk)`; `_myLinesRecord()`로 노선 쌓기; `_chatSelect('2호선')`; 스와이프 순서는 `_commSwipeStep(±1)`과 `_commCurTab()`
- 서버: `node --check board-writer/index.js`. 로컬 실행은 `node:sqlite`로 D1을 흉내 낸 모의 env(`prepare/bind/run/all/first/batch`)를 만들어 `scheduled()`, `/talks`, `/lroom`, `/react`를 호출(Node 22)
- 빌드: Actions → `Build APK` → Run workflow(브랜치 선택) 또는 MCP `actions_run_trigger`. 성공하면 `subway-app-debug` 아티팩트가 생긴다. 서명 릴리스(AAB)는 시크릿이 있을 때만
- 이 환경 제약: 아웃바운드가 프록시를 거치며 `workers.dev`, `apis.data.go.kr`, `api.cloudflare.com`은 막혀 있다. 외부 API를 불러야 하면 Actions 러너에서 시크릿(`TAGO_KEY`, `CF_API_TOKEN`, `CF_ACCOUNT_ID`)으로 한다(키·본문은 로그에 출력하지 말 것)

## 6. 임시 파일 · 되돌릴 것
- `ntce-lines.yml`(임시 집계 워크플로)은 병합 전에 삭제했다. 같은 집계가 필요하면 git 히스토리의 `5772a90`/`7bb6764`에서 꺼내 쓴다
- 이 브랜치의 `Build APK` 수동 실행 결과물은 확인용(30일 뒤 만료)
- 로컬 임시 파일(모의 서버 테스트, 스크린샷)은 스크래치패드에만 있고 저장소에는 없다
