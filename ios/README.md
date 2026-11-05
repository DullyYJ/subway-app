# 길동무 iOS (부모 앱)

안드로이드(`native/`, `shell-android/`)와 **완전히 분리된 폴더**다. 서버(route-v2 엔진)는 안드로이드와 같은 것을 쓴다 — 계산은 서버, 앱은 서버가 준 화면 JSON 을 그리기만 한다(안드로이드 ScreenCore/ScreenView 와 같은 원칙).

## 맥에서 열기
```bash
brew install xcodegen          # 한 번만
cd ios/Gildongmu
xcodegen                       # Gildongmu.xcodeproj 생성(저장소에 넣지 않는다)
open Gildongmu.xcodeproj
```
Xcode: Signing & Capabilities 에서 Team 선택 → 실제 아이폰 또는 시뮬레이터(iOS 16+) 선택 → ▶︎.
시험: ⌘U (`Tests/ParseTests.swift` — 화면 해석 · 색 · SVG 아이콘).

## 1단계에서 되는 것 (2026-11-06)
- 맨 위 응원 문구(서버 `/screen/hdr`), 아래 탭 막대(서버 `/screen/tabs`, 아이콘은 서버가 준 SVG path 를 그림).
- 서버 화면 렌더러(SwiftUI): text · spacer · divider · button · box · panel · row · toggle · navrow · chips · bar · tabbar · marq · select · field, 목록 줄(place · news · sug)은 단순 모양. 모르는 종류는 건너뜀.
- 본문은 **화면 탐색기(DevExplorer)** — 주소와 요청을 고르면 같은 서버 화면이 iOS 에서 어떻게 그려지는지 바로 볼 수 있다(안드로이드와 나란히 비교용). 프리셋: 설정 · 탭 막대 · 칩 · 응원 문구.
- 행동: open(https) · tab.* 전환 · set(스위치 저장) · refresh. 그 밖의 행동은 화면 아래에 '아직 연결 안 됨'으로 알린다.

## 다음 단계 (순서)
1. 시험 결과(컴파일 오류 · 모양 어긋남)를 받아 고친다.
2. 위치 권한 + 홈 탭(`/screen/home`) 연결 · 노선도(지하철 지도 그리기) · 경로 탐색.
3. 커뮤니티 · 쇼핑 · 맛집 탭, 설정 하위 화면.
4. 탑승/환승 바 · 하차 알림은 iOS 에 '다른 앱 위 표시'가 없어 잠금화면 Live Activity + 로컬 알림으로.
5. 알림(APNs) · 구독(StoreKit 2) · 위젯 · 키즈 연동(키즈 서버 `/p/*`).

## 안드로이드와 다른 점 (iOS 제약)
- 오버레이 없음 → Live Activity / Dynamic Island.
- FCM 대신 APNs, Play Billing 대신 StoreKit.
- 백그라운드 위치는 '항상 허용' 권한 심사 사유서가 필요하다.
