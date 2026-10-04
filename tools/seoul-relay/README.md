# 서울 지하철 실시간 중계 (한국 IP 노트북용)

서울 열린데이터광장(swopenapi)이 Cloudflare 서버 주소를 막아서, 한국 집 인터넷의 PC 가 대신 불러 와 Cloudflare(gentle-lab)에 올려 둔다.
앱은 이 노트북에 직접 접속하지 않는다 — 사용자 수와 상관없이 노트북의 일은 일정하다.

```
앱 → gentle-lab /seoul → (캐시) → D1 에 올라온 값
노트북 relay.js ─ 8초마다 GET /relay/wanted (앱이 찾는 경로)  → 서울 API → POST /relay/push
```

- 노트북이 꺼지거나 3분 넘게 소식이 없으면 워커는 옛 동작으로 돌아가고, 앱은 정적 시각표로 동작한다(멈추지 않는다).
- 호출량: 앱이 찾는 경로만, 같은 경로는 25~30초에 최대 한 번. 키당 하루 한도(서울 기본 1,000건)를 넘지 않게 남은 운행 시간에 고르게 나눠 쓰고, 키가 한도에 걸리면 다음 키로 넘어간다.
- **하루 1,000건이면 활성 경로가 몇 개뿐이어도 부족하다.** 서울 열린데이터광장에서 인증키와 함께 '활용사례'로 앱을 등록하면 제한 없이 쓸 수 있다고 안내돼 있다(YJ 계정으로 등록).

## 설치 (윈도우, 한 번)
1. https://nodejs.org 에서 LTS 설치.
2. 이 폴더(`tools/seoul-relay`)를 노트북에 복사.
3. `.env.example` 을 복사해 `.env` 로 만들고 `RELAY_TOKEN`(16자 이상 아무 문자열)과 `SEOUL_API_KEYS` 를 채운다.
4. Cloudflare 대시보드 → gentle-lab 워커 → 설정 → 변수 및 시크릿에 **같은 값**으로 `RELAY_TOKEN`(시크릿)을 추가하고 배포한다. 워커에는 D1 `DB` 바인딩이 이미 있다(별도 설정 없음).
5. 점검: `node relay.js --check` — `[정상]` 만 나오면 된다. `서울 응답 200` 이 나와야 한국 IP 에서 서울 서버가 열려 있는 것.
6. 자동 시작: 관리자 PowerShell 에서 `powershell -ExecutionPolicy Bypass -File install-autostart.ps1`, 이어서 `schtasks /Run /TN GildongmuRelay`.
7. 전원 어댑터를 꽂아 두고, 와이파이 절전 해제(장치 관리자 → 네트워크 어댑터 → 전원 관리 → '전원을 절약하기 위해...' 해제)를 권한다.

## 확인
- `type relay.log` — `상태 — 조회 N · 서울 호출 N · 올림 N` 줄이 보이면 정상.
- 앱 로그/응답 헤더 `x-seoul-cache: RELAY` 면 노트북이 올린 값을 쓰는 것, `RELAY-PENDING`(503)은 방금 처음 찾은 경로라 몇 초 뒤 채워지는 중.

## 시험
`node tools/seoul-relay/relay.test.js` (저장소 루트에서, 9건) · `node worker/test/relay_push.test.js` (8건).
