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
$differs = @()
# backend/.env 만 지킨다. 실제 서비스 비밀값(DB 비밀번호, JWT_SECRET, API 키)이
# 들어 있고 저장소에 올리지 않는 파일이라 여기 사본이 유일하다.
#
# .htaccess 두 개는 이제 저장소가 들고 있어서 지키지 않는다.
#   웹 루트  → frontend/public/.htaccess (빌드하면 dist 로 복사됨)
#   backend/ → backend/.htaccess
# 서버에서 직접 고친 .htaccess 가 있으면 이 빌드가 덮어쓴다.
foreach ($f in @('.htaccess', 'backend/.htaccess')) {
    if (Test-Path "$web/$f") {
        $old = Get-Content "$web/$f" -Raw -Encoding UTF8
        $src = if ($f -eq '.htaccess') { 'frontend/public/.htaccess' } else { 'backend/.htaccess' }
        if ((Get-Content $src -Raw -Encoding UTF8) -ne $old) {
            $keepOld = $old
            Write-Host "      [알림] $f 가 저장소 내용과 다릅니다. 덮어쓰기 전 사본을 FTP업로드/변경전-설정사본/ 에 남깁니다." -ForegroundColor Yellow
            $differs += @{ path = $f; text = $keepOld }
        }
    }
}
$keep = @{}
foreach ($f in @('backend/.env')) {
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

# 저장소와 달랐던 .htaccess 는 비교할 수 있게 사본을 남긴다.
# public_html 안에 두면 그대로 서버에 올라가므로 웹 루트 밖에 둔다.
if ($differs.Count -gt 0) {
    $bakDir = "$ftp/변경전-설정사본"
    if (-not (Test-Path $bakDir)) { New-Item -ItemType Directory -Path $bakDir -Force | Out-Null }
    foreach ($d in $differs) {
        $name = ($d.path -replace '[\/]', '_')
        Set-Content "$bakDir/$name" $d.text -NoNewline -Encoding UTF8
    }
}

Step 5 "DB 파일 갱신"
# SQL은 파일 하나로 둔다. 안에서 [A] 처음 설치 / [B] 기존 DB 업그레이드로 나뉘고,
# 상황에 맞는 구역 하나만 실행한다. 둘 다 돌리면 CREATE와 ALTER가 충돌한다.
$bar = '-- ' + ('=' * 60)
$sql = @(
    $bar
    '-- 코코딩 DB'
    $bar
    '--'
    '--  ▶ 처음 설치하는 경우           → [A] 구역만 실행'
    '--  ▶ 예전부터 쓰던 DB를 올리는 경우 → [B] 구역만 실행'
    '--'
    '--  두 구역을 다 실행하면 안 됩니다. [A]가 만든 테이블에 [B]가 다시'
    '--  컬럼을 추가하려 해서 오류가 납니다.'
    '--'
    '--  [B]는 서버가 첫 접속 때 자동으로 적용하므로 보통 실행할 필요가 없습니다.'
    '--  DB 계정에 ALTER 권한이 없어 자동 적용이 안 될 때만 phpMyAdmin에서 돌리세요.'
    '--'
    "--  만든 날짜: $(Get-Date -Format 'yyyy-MM-dd')"
    $bar
    ''
    ''
    $bar
    '-- [A] 처음 설치용 — 빈 DB에 테이블을 만든다'
    $bar
    ''
    (Get-Content 'schema.sql' -Raw -Encoding UTF8).TrimEnd()
    ''
    ''
    $bar
    '-- [B] 기존 DB 업그레이드용 — 이미 쓰고 있던 DB를 지금 코드에 맞춘다'
    $bar
    ''
    (Get-Content 'migrations/upgrade.sql' -Raw -Encoding UTF8).TrimEnd()
)
# 저장소에도 같은 파일을 둔다. FTP업로드 폴더는 git 밖이라 팀원이 볼 수 없어서,
# 로컬 DB를 손으로 맞출 때 쓸 수 있도록 저장소 루트에 DB.sql 로 함께 쓴다.
Set-Content 'DB.sql' $sql -Encoding UTF8
Copy-Item 'DB.sql' "$ftp/2-DB.sql" -Force
# 전에 두 개로 나눠 두던 파일은 헷갈리니 지운다
foreach ($old in @('2-처음설치용-DB.sql', '3-기존DB-업그레이드.sql')) {
    if (Test-Path "$ftp/$old") { Remove-Item "$ftp/$old" -Force; Write-Host "      정리: $old" }
}
Write-Host "      DB.sql(저장소) · 2-DB.sql(배포본) 갱신 — [A] 처음 설치 + [B] 기존 DB 업그레이드"

Step 6 "확인"
$must = @("$web/index.html", "$web/.htaccess", "$web/backend/api/auth/login.php",
          "$web/backend/grader/grade.mjs", "$web/backend/config/Logger.php",
          "$web/backend/.htaccess", "$ftp/2-DB.sql")
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
