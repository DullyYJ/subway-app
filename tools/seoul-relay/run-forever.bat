@echo off
rem Keeps relay.js running; restarts it 10 seconds after it exits. Log: relay.log
cd /d "%~dp0"
:loop
node relay.js >> relay.log 2>&1
timeout /t 10 /nobreak >nul
goto loop
