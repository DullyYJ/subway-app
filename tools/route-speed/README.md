# 경로 엔진(route-v2) 속도 패치 — 결과 동일 검증 포함

엔진 본체(`route-v2-worker`)는 이 저장소 밖(Cloudflare 배포본)이라 **앵커 기반 패치 스크립트**로 적용한다.
`IN=<현재 배포본.js> ./make.sh <출력.js>` — 앵커가 하나라도 안 맞으면 즉시 실패(조용히 어긋나지 않음).

- `patch_dijkstra.js`: 탐색 루프의 자료구조 교체(문자열 키 객체 → 정수 상태 배열, 힙 평행배열, 인접 리스트 캐시, 버스 대기시간 간선 캐시 — 라이브/rtw/accessSec 가 없을 때만). 엣지 순회·힙 비교·갱신 조건은 원본과 동일.
- `patch_access.js`: accessNodes 의 버스 정류장 전수 순회 → addBus 가 만든 지도 칸 색인(결과·순서 동일), xpWait 의 Date 제거(동일 연산).
- `patch_addbus_memo.js`: addBus 결과를 (rows 배열·분·요일) 키로 최근 2개 재사용.
- 검증: `eq.mjs`(탐색 무작위 질의 원본 대비 JSON 동일), `eq2.mjs`(xpWait·accessNodes), `eq3.mjs`(라이브/rtw/accessSec 상태에서 부작용 통계까지), `full_rc.mjs`(handleRouteV2 전체 응답 비교). 데이터(정류장 행·kric)는 D1 에서 받아 `/tmp/prof/` 에 둔다(커밋하지 않음) — 경로는 스크립트 상단 참고.
- 2026-10-07 결과: 무작위 수천 건 + 전체 응답 13건 **차이 0**. 로컬(따뜻한 상태) 요청당 시간 약 2~3배 단축(서울역→수원 461→217ms, 강남→수원 296→164ms).
