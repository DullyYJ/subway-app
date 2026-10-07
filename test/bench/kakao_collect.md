# 카카오 대조 수집 절차 (route_cmp_*.json 만드는 법)

카카오맵은 `pubtrans.json` 을 직접 fetch 하면 404 라서, **같은 출처 숨은 iframe 으로 UI 를 긁는다**.
1. 브라우저(내장 브라우저 가능)에서 https://map.kakao.com 열기.
2. 구간마다 `https://map.kakao.com/?sName=..&eName=..` 형식(또는 좌표) 로 숨은 iframe 을 만들고, 로드 후 `a#transit` 클릭 → 목록 `li.TransitRouteItem` 의 총 소요(분)·환승·도보를 읽는다.
3. **같은 시각에 연달아** 엔진 `https://route-v2.phg0643.workers.dev/route-v2-app?SX=&SY=&EX=&EY=&live=0` 를 조회한다(탭 fast/less/walk/sub/bus/direct/longdist, `info.ldNoWaitMin`, `info.ldFastRide`).
   두 값의 시각이 몇 분만 벌어져도 장거리는 달라지므로 한 건씩 번갈아 부른다.
4. 열 구성은 route_cmp_*.json 의 `columns` 참고. 점수: `python3 test/bench/route_cmp_score.py test/bench/route_cmp_20261007.json`.
정의 차이: 카카오 장거리 = 가장 빠른 열차 운행시간(대기 제외), 카카오 시내 = 출발지→역 도보·출구까지 걷기 포함. 엔진은 '지금 탈 다음 열차' 총시간.
