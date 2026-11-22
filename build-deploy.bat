@echo off
setlocal
where pwsh 1>nul 2>nul
if %errorlevel%==0 (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-deploy.ps1"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-deploy.ps1"
)
pause
