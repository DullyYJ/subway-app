# 앱은 그리기만, 계산은 엔진이? — 점검 보고 (2026-10-12)

읽기 전용 점검. 코드는 수정하지 않았다. 줄 번호는 점검 시점의 www/index.html 기준. route-v2 워커 본체와 gildongmu-ride 워커 소스는 이 저장소에 없어 엔진 내부는 확인하지 못했다.

## 결론

탐색과 도착시각은 엔진이 하고 있다. 그러나 탑승 중의 판단(승차 확정, 어느 정류장까지 왔는지, 이탈·다른 차 판정, 마커 위치, 알림 단계)은 아직 앱이 계산한다. "앱은 그리기만"은 절반만 지켜지고 있다.

## 이미 엔진이 하는 것

- 경로탐색: `fmapDoRoute`(8114) → GET /route-v2-app. 재탐색(`_handleOffRoute` 11715, '놓침' 14015·14345)도 같은 호출을 다시 부를 뿐 앱이 경로를 만들지 않는다.
- 도착시각·지연: `_etaRequest`(11077) → POST /ride-eta. 앱은 증거(`_etaPayload` 11025: 통과 기록, 승차 여부, live, 다음 차)만 보내고 `_etaApply`(11050)가 받은 값을 그대로 라벨에 쓴다.
- 다음 열차·방향: /next-train. 버스 차량 후보 매칭: gildongmu-ride /vehicle(`_vehTick` 11674).

## 앱 쪽 계산 (센서 입력 — 온디바이스 유지 가능)

GPS 튐 거르기(`locOnGps` 12758), 지하/지상 상태(`locTick` 12790), 기지국 변화(`_cellMovingState` 12885), 가속도(`_pfM*`), 궤적 적재(`_evSample` 37930). PosFusion 은 파티클 필터가 아니라 HMM 이며 시각표를 사전분포로 쓴다. 센서 융합 자체는 앱에 둬도 된다.

## 앱 쪽 계산 (엔진으로 옮길 수 있는 판단)

- 승차·차량 판정: `_rideEv` 38015, `_htlBoardWatch` 7671, `_htlWaitArrived` 7644, `_autoLockOnRide` 38193, 열차 매칭 `_rtBoardMatch` 13126, 버스 `_vehCands` 11518·`_vehApply` 11608. 입력은 최근 궤적·기지국 변화·'탑승' 버튼 시각이면 충분.
- 진행도(`_gpsMaxIdx`) 결정: GPS 틱 14157~14298(가장 가까운 노드, 되돌림 500/250m, 도착 400m, 버스 15초당 1정류장 상한), `_maybeRecordPass` 11199, `_progGuard` 7381, `_cellHopAdvance` 12938, `_pfApplyLive`/`_pfAdopt` 38159/38116.
- 마커·시각표 위치: `_estimateTimelinePos` 13469, `_rtDwellRatio` 10986, `_pfPosOverride` 38091, 무GPS 구간 1/3 전진 14064, 시각표 soft advance 14090, `_markerPos` 14589. 마커·오버레이·혼잡도·알림이 서로 다른 위치를 읽어 어긋났던 문제(10-06)의 뿌리가 여기.
- 이탈·경로맞춤: `_checkOffRoute` 11320(350m × 6틱), `_matchRiddenRoute` 11411, `_applyRiddenRoute` 11440, `_ridePathWatch` 11474. 앱이 사실상 경로를 고르는 곳이라 규칙 위반 정도가 가장 크다.
- 알림·오버레이 단계: `_buildTransitAlertTargets` 10801, `_checkTransitAlerts` 10821, `_ovlAlertLevelRaw` 28204, 탑승 시트 `_rsTick` 38432.
- 버스 승차시각 선택 `_applyRealBoardTime` 7250~7309: 후보를 모두 live 로 보내고 엔진이 고르게 할 수 있음.

## 순수 그리기 (그대로 둬도 됨)

`_placeGpsMarkerSmooth` 의 픽셀 배치(13644~13679), `_ovlLines`(문자열 조립), `_ovlSync` 변경 감지, `_pipStations`, `_etaApply` 라벨 갱신.

## 옮길 순서 제안

1. 마커·위치(ratio): /ride-eta 응답에 pos 를 추가. 엔진이 이미 arr·통과 기록·현재 시각을 갖고 있어 입력 추가가 거의 없고, 위치 불일치 문제가 한 번에 정리된다.
2. 이탈·경로맞춤: 후보가 이미 엔진에서 오므로 앱은 궤적만 보내고 '후보 id 또는 재탐색'을 받는다. 이번 시뮬에서 가장 문제가 컸던 영역(RESULTS 1·4번).
3. 승차·차량 판정: /ride-state 형태(상태 없는 엔진에 최근 N분 궤적·기지국·모션·버튼을 보내고 boarded·boardTs·vehicle·progressIdx 를 받음). 비용이 가장 크고 최근 오탑승·오자동확정 버그가 여기서 나왔다.
4. 알림 단계: 진행 인덱스와 위치가 엔진에서 나온 뒤에 옮겨야 일관된다.
5. 버스 승차시각 선택, 지하철 도착 정보 호출 주기 정리 같은 소규모 항목.

센서 융합(HMM)은 마지막까지 앱에 두되, 채택 규칙(`_pfApplyLive`)과 시각표 사전분포 의존은 3번에서 같이 정리하는 것을 권장한다.
