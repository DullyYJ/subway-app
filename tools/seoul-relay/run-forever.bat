@echo off
rem Keeps relay.js running (label-free loop). Log: relay.log
cd /d "%~dp0"
for /l %%i in (0,0,1) do (node relay.js >> relay.log 2>&1 & timeout /t 10 /nobreak >nul)
