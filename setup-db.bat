@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

REM ---- PHP 경로 찾기 (start.bat과 동일) ----
where php >nul 2>nul
if %errorlevel%==0 (
    set "PHP_EXE=php"
) else if exist "C:\xampp\php\php.exe" (
    set "PHP_EXE=C:\xampp\php\php.exe"
) else (
    echo [오류] php.exe를 찾을 수 없습니다.
    pause
    exit /b 1
)

"%PHP_EXE%" backend\tools\setup_db.php
pause
endlocal
