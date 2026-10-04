# 관리자 권한 PowerShell 에서 한 번 실행: 부팅하면 자동으로 중계가 켜지고, 전원 연결 중에는 절전·덮개 닫힘으로 꺼지지 않게 한다.
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host 'Node.js 가 없습니다. https://nodejs.org 에서 LTS 를 먼저 설치하세요.'; exit 1 }
if (-not (Test-Path (Join-Path $dir '.env'))) { Write-Host '.env 파일이 없습니다. .env.example 을 복사해 .env 로 만들고 값을 채우세요.'; exit 1 }
$bat = Join-Path $dir 'run-forever.bat'
schtasks /Create /TN 'GildongmuRelay' /TR "`"$bat`"" /SC ONSTART /RU SYSTEM /RL HIGHEST /F | Out-Null
# 전원이 연결돼 있으면 절전·최대 절전 없음, 덮개를 닫아도 계속 실행
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setactive SCHEME_CURRENT
Write-Host '완료. 지금 바로 시작하려면: schtasks /Run /TN GildongmuRelay'
Write-Host '상태 확인: type relay.log  (마지막 줄에 "상태 — 조회 ..." 가 보이면 정상)'
