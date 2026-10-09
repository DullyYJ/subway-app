# 경로 엔진(route-v2) 속도 패치 — 결과 동일 검증 포함

엔진 본체(`route-v2-worker`)는 이 저장소 밖(Cloudflare 배포본)이라 **앵커 기반 패치 스크립트**로 적용한다.
`IN=<현재 배포본.js> ./make.sh <출력.js>` — 앵커가 하나라도 안 맞으면 즉시 실패(조용히 어긋나지 않음).

- `patch_dijkstra.js`: 탐색 루프의 자료구조 교체(문자열 키 객체 → 정수 상태 배열, 힙 평행배열, 인접 리스트 캐시, 버스 대기시간 간선 캐시 — 라이브/rtw/accessSec 가 없을 때만). 엣지 순회·힙 비교·갱신 조건은 원본과 동일.
- `patch_access.js`: accessNodes 의 버스 정류장 전수 순회 → addBus 가 만든 지도 칸 색인(결과·순서 동일), xpWait 의 Date 제거(동일 연산).
- `patch_addbus_memo.js`: addBus 결과를 (rows 배열·분·요일) 키로 최근 2개 재사용.
- 검증: `eq.mjs`(탐색 무작위 질의 원본 대비 JSON 동일), `eq2.mjs`(xpWait·accessNodes), `eq3.mjs`(라이브/rtw/accessSec 상태에서 부작용 통계까지), `full_rc.mjs`(handleRouteV2 전체 응답 비교). 데이터(정류장 행·kric)는 D1 에서 받아 `/tmp/prof/` 에 둔다(커밋하지 않음) — 경로는 스크립트 상단 참고.
- 2026-10-07 결과: 무작위 수천 건 + 전체 응답 13건 **차이 0**. 로컬(따뜻한 상태) 요청당 시간 약 2~3배 단축(서울역→수원 461→217ms, 강남→수원 296→164ms).

## s3 (2026-10-07 밤 추가)
- `patch_s3.js`: ①버스 대기 간선 캐시를 accessSec/rtw 상태로 확장(waitLog·rtwStat 부작용을 그대로 재생, ld 순위 계산의 `__bwMemo` 안에서는 비활성) ②isPassStop 이름별 캐시 ③xpBits/xpHops 테이블 디코드(잘못된 문자는 원본 경로).
- 검증: `eq4.mjs`(accessSec·rtw·중도 변경·라이브 전환에서 waitLog·rtwStat 포함 동일), `eq5.mjs`(디코드·isPassStop 7만 건 퍼즈), `full_rc.mjs`(70건 전체 응답; `KEEPLS=1` 이면 liveStat 의 시간 필드 외 전부 비교) — 모두 차이 0. 먼저 `eq5`/`full_rc` 에서 rtwStat.miss 차이를 잡아 `__bwMemo` 예외를 넣었다.
- 효과: 로컬 따뜻한 상태 장거리 ≈12% 단축, 콜드 첫 요청은 거의 변화 없음(콜드는 JIT 가 지배: 부산 콜드 ≈800ms vs 따뜻 ≈230ms).

## s4
- `patch_warm.js`: `GET /warm` — 격리당 최초 1회 서울역→수원 검색(live=0)을 내부 실행해 JIT·kric·rows 를 예열(60초 내 재호출은 즉시 반환, 속도제한 적용). 진단용 `busDiag.iso/isoN`(격리 식별자·요청 순번) 추가. 기존 경로·응답 본문 불변: 70건 전체 응답 비교 차이 0. 로컬 효과: 부산 콜드 ≈800ms → 워밍 후 ≈530ms.

## s11 (2026-10-09) — 지하철 '다음 열차' 계산을 엔진으로
- `patch_nexttrain.js`: `engine/next-train.js`·`next-train-data.js`·`next-train-worker.js` 를 `handleFetch` 앞에 넣고, `/route-v2-app` 응답에 구간별 `ttWaitMs`·`nextTrain`·`ntVer` 를 붙이고(`xferAnnotateAll` 다음), `/next-train` 라우트 추가, `/ride-eta` 를 `handleRideEtaNT`(boardInfo → timetable 채움)로 교체. 앵커가 하나라도 안 맞으면 실패. `ENGINE_DIR` 환경변수로 engine 폴더 위치 지정(기본: 저장소의 engine/).
- `gen_nt_data.js`: 인천 시각표(`test/fixtures/incheon_tt.json`) → `engine/next-train-data.js` 의 차분 압축본 재생성.
- 빌드: `ENGINE_DIR=<저장소>/engine ./make.sh <출력.js>` (make.sh 는 /home/claude/work/deploy/speed 에서 돌린다 — 이 폴더의 patch_*.js 를 거기에 복사해서).
- 검증: s10 vs s11 전체 응답 70건 — 새 필드(ttWaitMs·nextTrain·ntVer·ttApplied)를 빼면 차이 0(55건에 새 필드 붙음, 구간 307개 중 대기 262개). 단위·비교 시험은 `test/next_train_*.test.js`.

