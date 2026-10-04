@echo off
rem 중계 프로그램을 계속 실행한다. 꺼지면 10초 뒤 다시 켠다. 기록은 relay.log 에 쌓인다.
cd /d "%~dp0"
:loop
node relay.js >> relay.log 2>&1
timeout /t 10 /nobreak >nul
goto loop
