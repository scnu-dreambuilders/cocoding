# 코코딩 배포본 만들기 — FTP업로드 폴더를 지금 코드로 갱신한다
# 쓰는 법: build-deploy.bat 을 두 번 누르거나
#   powershell -NoProfile -ExecutionPolicy Bypass -File build-deploy.ps1
#
# 서버 설정(public_html/backend/.env)과 웹 루트 설정(public_html/.htaccess)은
# 건드리지 않는다. 지우고 다시 만든 뒤 원래 파일을 그대로 되돌려 놓는다.

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ftp = '../FTP업로드'
$web = "$ftp/public_html"

function Step($n, $text) { Write-Host ""; Write-Host "[$n/6] $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host ""; Write-Host "  [실패] $text" -ForegroundColor Red; exit 1 }

Write-Host "================================================"
Write-Host " 코코딩 배포본 만들기"
Write-Host "================================================"
Write-Host " 올릴 곳: $((Resolve-Path $ftp -ErrorAction SilentlyContinue).Path)"

if (-not (Test-Path $ftp)) { Fail "$ftp 폴더가 없습니다" }

Step 1 "프론트엔드 빌드"
Push-Location frontend
if (-not (Test-Path node_modules)) {
    Write-Host "      node_modules가 없어서 먼저 설치합니다..."
    npm install
    if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "npm install 실패" }
}
# API 주소는 frontend 폴더의 .env.production.local에서 읽는다 (VITE_API_URL=/backend/api)
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "프론트엔드 빌드 실패" }

Step 2 "서버 재채점기 빌드"
npm run build:grader
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "채점기 빌드 실패" }
Pop-Location

Step 3 "서버 설정 따로 빼두기"
$keep = @{}
foreach ($f in @('.htaccess', 'backend/.env', 'backend/.htaccess')) {
    if (Test-Path "$web/$f") {
        $keep[$f] = Get-Content "$web/$f" -Raw -Encoding UTF8
        Write-Host "      보관: $f"
    }
}

Step 4 "파일 모으기"
if (Test-Path $web) { Remove-Item $web -Recurse -Force }
Copy-Item 'frontend/dist' $web -Recurse -Force
New-Item -ItemType Directory -Path "$web/backend" -Force | Out-Null
foreach ($d in @('api', 'config', 'models', 'data', 'grader')) {
    Copy-Item "backend/$d" "$web/backend/$d" -Recurse -Force
}
Copy-Item 'backend/router.php' "$web/backend/router.php" -Force
Copy-Item 'backend/.htaccess' "$web/backend/.htaccess" -Force

# 올리면 안 되는 것 빼기: 관리용 스크립트, 로그, 개발 PC에서 생긴 파일
foreach ($x in @("$web/backend/tools", "$web/backend/data/logs",
                 "$web/backend/data/.schema_version", "$web/backend/data/mail.log",
                 "$web/backend/data/.rate_limit.json")) {
    if (Test-Path $x) { Remove-Item $x -Recurse -Force }
}

# 보관해둔 서버 설정 되돌리기
foreach ($f in $keep.Keys) {
    $dir = Split-Path "$web/$f" -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Set-Content "$web/$f" $keep[$f] -NoNewline -Encoding UTF8
    Write-Host "      되돌림: $f"
}

Step 5 "DB 파일 갱신"
Copy-Item 'schema.sql' "$ftp/2-처음설치용-DB.sql" -Force
$head = @(
    '-- ════════════════════════════════════════════════',
    '-- 기존 DB 업그레이드 — 서버가 첫 접속 때 자동으로 적용하므로 보통은 실행할 필요 없음',
    '-- DB 계정에 ALTER 권한이 없어서 자동 적용이 안 될 때만 phpMyAdmin에서 실행하세요.',
    '-- 이미 실행했던 부분이 있으면 그 아래부터 복사해서 실행하면 됩니다.',
    "-- 만든 날짜: $(Get-Date -Format 'yyyy-MM-dd')",
    '-- ════════════════════════════════════════════════',
    ''
)
$body = foreach ($m in (Get-ChildItem 'migrations/*.sql' | Sort-Object Name)) {
    ''
    '-- ════════════════════════════════════════════════'
    "-- $($m.Name)"
    '-- ════════════════════════════════════════════════'
    (Get-Content $m.FullName -Raw -Encoding UTF8)
}
Set-Content "$ftp/3-기존DB-업그레이드.sql" ($head + $body) -Encoding UTF8
Write-Host "      2-처음설치용-DB.sql, 3-기존DB-업그레이드.sql 갱신"

Step 6 "확인"
$must = @("$web/index.html", "$web/.htaccess", "$web/backend/api/auth/login.php",
          "$web/backend/grader/grade.mjs", "$web/backend/config/Logger.php",
          "$web/backend/.htaccess", "$ftp/2-처음설치용-DB.sql")
foreach ($f in $must) { if (-not (Test-Path $f)) { Fail "$f 가 없습니다" } }
if (Test-Path "$web/backend/tools") { Fail "tools 폴더가 섞여 들어갔습니다" }
if (-not (Test-Path "$web/backend/.env")) {
    Write-Host "      [알림] backend/.env가 없습니다. env-내용-예시.txt를 보고 만들어 주세요." -ForegroundColor Yellow
}
$files = Get-ChildItem $web -Recurse -File -Force
$size = [math]::Round((($files | Measure-Object Length -Sum).Sum / 1MB), 1)
Write-Host "      파일 $($files.Count)개, 합계 $size MB"

Write-Host ""
Write-Host "================================================"
Write-Host " 다 됐습니다."
Write-Host "================================================"
Write-Host ""
Write-Host "  FTP업로드/public_html 안의 내용을 서버 public_html 안에 넣으세요."
Write-Host "  (숨김 파일 .htaccess, backend/.env도 함께 올라가야 합니다)"
Write-Host ""
