# 출근길 뭐라카노 — Capacitor APK 빌드 가이드

PC에 아무것도 설치하지 않고, GitHub에 올리기만 하면 자동으로 APK가 만들어집니다.

---

## 📦 이 폴더 구성

```
subway-app/
├── package.json              ← Capacitor 의존성
├── capacitor.config.json     ← 앱 이름·ID 설정
├── www/index.html            ← 앱 본체 (현재 버전)
├── .github/workflows/
│   └── build-apk.yml          ← 자동 빌드 설정
├── .gitignore
└── README.md                  ← 이 파일
```

- **앱 이름**: 출근길 뭐라카노
- **패키지 ID**: com.dullyyj.subway

---

## 🚀 APK 만드는 법 (5분)

### 1. GitHub 새 저장소 만들기
1. https://github.com 접속 → 우측 상단 `+` → **New repository**
2. 저장소 이름 입력 (예: `subway-app`)
3. **Public** 선택 (무료 빌드 무제한) → **Create repository**

### 2. 이 폴더 전체를 업로드
**방법 A — 웹에서 드래그 (가장 쉬움)**
1. 만든 저장소 페이지에서 **uploading an existing file** 클릭
2. 이 폴더 안의 **모든 파일·폴더**를 드래그해서 올림
   - ⚠️ `.github` 폴더도 꼭 포함 (숨김 폴더라 안 보이면, 웹 업로드 시 직접 경로 입력)
3. **Commit changes** 클릭

**방법 B — git 명령어 (git 쓸 줄 알면)**
```bash
cd subway-app
git init
git add .
git commit -m "Capacitor 앱"
git branch -M main
git remote add origin https://github.com/본인아이디/subway-app.git
git push -u origin main
```

### 3. 자동 빌드 확인
1. 저장소 상단 **Actions** 탭 클릭
2. "Build Android APK" 워크플로우가 자동 실행됨 (약 5분)
3. 초록색 체크(✅)가 뜨면 완료

### 4. APK 다운로드
1. 완료된 빌드 클릭
2. 맨 아래 **Artifacts** → **app-debug-apk** 클릭해서 다운로드
3. zip 안의 `app-debug.apk`를 폰으로 옮겨 설치
   - 설치 시 "출처를 알 수 없는 앱" 허용 필요

---

## 🔄 앱 수정 후 재빌드

`www/index.html`만 새 버전으로 교체하고 다시 업로드(commit)하면, Actions가 자동으로 새 APK를 만듭니다.

---

## 📲 Play 스토어 출시할 때 (나중에)

지금 만들어지는 건 **디버그 APK**(테스트용, 바로 설치 가능)입니다.
Play 스토어에 올리려면 **서명된 릴리즈 APK/AAB**가 필요한데, 그땐 keystore를 만들어 워크플로우에 추가합니다. 출시 단계에서 안내해 드릴게요.

---

## ✅ 포함된 네이티브 기능

| 플러그인 | 용도 |
|---|---|
| Geolocation | GPS 실시간 관제 (열차 추적) |
| Network | 온라인/오프라인 감지 |
| StatusBar | 상태바 영역 처리 (시계·배터리 표시) |
| App | 뒤로가기 버튼 등 앱 생명주기 |

GPS 권한은 앱 첫 실행 시 사용자에게 요청됩니다.

---

## 다음 단계: 서버 연동

APK가 잘 만들어지면, 다음은 **실시간 톡·커뮤니티 서버**(Cloudflare Workers + D1)를 붙입니다.
그땐 `www/index.html`의 톡/커뮤니티 부분을 서버 API 호출로 바꾸고, 다시 이 저장소에 올리면 됩니다.
