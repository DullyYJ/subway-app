# 출근길 뭐라카노 — Capacitor APK 빌드 가이드

PC에 아무것도 설치하지 않고, GitHub에 올리기만 하면 자동으로 APK가 만들어집니다.

## 📦 이 폴더 구성

```
subway-app/
├── package.json          ← Capacitor 의존성
├── capacitor.config.json ← 앱 이름·ID 설정
├── www/index.html        ← 앱 본체 (현재 버전)
├── .github/workflows/
│   └── build-apk.yml     ← 자동 빌드 설정
└── .gitignore
```

## 🚀 사용법

1. 이 폴더를 GitHub 저장소에 업로드
2. Actions 탭에서 빌드 자동 실행 (약 5분)
3. Actions → 빌드 완료 → Artifacts에서 APK 다운로드
4. 폰에 설치 (설정 → 알 수 없는 앱 허용)

## 📱 앱 정보

- 앱 이름: 출근길 뭐라카노
- 패키지 ID: com.dullyyj.subway
- 최소 Android: 7.0 (API 24)
