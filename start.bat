@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo   코코딩 개발 서버 시작
echo ============================================

REM ---- PHP 경로 찾기 ----
where php >nul 2>nul
if %errorlevel%==0 (
    set "PHP_EXE=php"
) else if exist "C:\xampp\php\php.exe" (
    set "PHP_EXE=C:\xampp\php\php.exe"
) else (
    echo [오류] php.exe를 찾을 수 없습니다. XAMPP가 C:\xampp 에 설치되어 있는지 확인해 주세요.
    pause
    exit /b 1
)

REM ---- DB 연결 확인 (포트/비밀번호가 틀리면 설정 도우미 실행) ----
echo [1/3] DB 연결 확인 중...
net start MariaDB >nul 2>nul
"%PHP_EXE%" backend\tools\check_db.php
if errorlevel 1 (
    echo.
    echo   DB에 연결할 수 없어서 설정 도우미를 실행합니다.
    "%PHP_EXE%" backend\tools\setup_db.php
    "%PHP_EXE%" backend\tools\check_db.php
    if errorlevel 1 (
        echo [오류] DB 연결 설정을 마치지 못했습니다. setup-db.bat을 다시 실행해 주세요.
        pause
        exit /b 1
    )
)

REM ---- 백엔드: PHP 내장 서버 (backend/router.php 로 .env 등 민감 파일 차단) ----
echo [2/3] 백엔드 서버 실행 (http://localhost:8080)...
start "코코딩 백엔드" cmd /k ""%PHP_EXE%" -S localhost:8080 -t backend backend\router.php"

REM ---- 프론트엔드: Vite 개발 서버 ----
echo [3/3] 프론트엔드 서버 실행 (http://localhost:5173)...
if not exist "frontend\node_modules" (
    echo   node_modules가 없어 먼저 설치합니다...
    pushd frontend
    call npm install
    popd
)
start "코코딩 프론트엔드" cmd /k "cd /d "%~dp0frontend" && npm run dev"

REM ---- 잠시 대기 후 브라우저 열기 ----
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo 백엔드/프론트엔드가 각각 새 창에서 실행 중입니다.
echo 끄려면 해당 창을 닫으면 됩니다.
echo.
pause
endlocal
