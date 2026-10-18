# route-sweep — 엔진(route-v2)을 로컬에서 돌려 노선·시간대별로 이상한 경로를 찾는다 (2026-10-18)

실제 Cloudflare 없이 배포용 엔진 파일을 Node 로 불러와 `/route-v2-app` 을 직접 부른다. 읽기만 하고 아무것도 바꾸지 않는다.

## 준비
1. 엔진 파일을 `eng.mjs` 로 복사(예: `cp engine/route-v2-worker.ascii.js tools/route-sweep/eng.mjs`).
2. `node tools/route-sweep/extract_bundle.js engine/route-v2-worker.ascii.js tools/route-sweep/bundle.json`
3. 급행 구간표 `kric_all.json` = `{ "seg": [...], "xp": [...] }` — 실제 DB(subway-db)의 `SELECT line,a,b,sec FROM kric_seg` 와 `SELECT line,a,b,hop,wk,we,hk,he FROM kric_xp` 결과(읽기 전용). 엔진 `kricLoad` 가 하는 것과 같다.

## 실행 (tools/route-sweep 폴더 안에서 — eng.mjs·bundle.json·kric_all.json 을 현재 폴더에서 읽는다)
`node sweepall.mjs ./eng.mjs S01 0 1 out.jsonl` — 노선 `S01` 의 모든 역 쌍을 3개 시각(평일 07:00·12:40·17:20, `TS=` 환경변수로 바꿈)으로 돌려 `out.jsonl` 에 한 줄씩 적는다.
- 같은 역을 한 구간 안에서 두 번 지나는 되돌림(`dupInLeg`)·환승역이 아닌 곳에서 다시 만남(`revisit`)·정차 시각이 거꾸로 감(`timeBack`)을 찾는다(`anom.mjs`).
- **주의**: 워커에는 IP 당 10초 40건 요청 제한이 있다. 이 스크립트는 요청마다 다른 `CF-Connecting-IP` 를 보내 피한다(안 그러면 결과가 429 로 비어 '이상 없음'처럼 보인다).
- 수정 전후 비교는 두 엔진 파일로 같은 명령을 돌려 줄별로 비교한다(`times` 필드).

## 비교 도구
- `sweep.mjs` — 엔진을 불러 `route(출발역, 도착역, 시각ms)` 로 한 번 부르는 공용 함수(`ENG=./eng.mjs` 환경변수로 엔진 파일 선택).
- `cmp2.js A.jsonl B.jsonl` — 두 엔진의 결과를 같은 (출발|도착|시각) 끼리 비교해 **시간이 늘어난 탭**을 찾는다. 이상 0건이어도 이걸로 정상 경로가 막히지 않았는지 꼭 본다(2026-10-18 s40 첫 버전이 이걸로 걸렸다).
- `legs3.mjs 노선 출발 노선 도착 2026-10-14T17:20 fast` — 한 구간의 탭별 실제 경로(역 목록·급행/일반 전환점)를 출력.
- 남는 `dupInLeg` 몇 건(오산→신도림 등)은 정상: 급행이 서지 않고 지나치는 역이 통과역 목록에 한 번, 되돌아오는 일반열차에 한 번 나와 중복으로 잡힌다.
