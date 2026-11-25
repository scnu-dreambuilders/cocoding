# 코코딩 배포본 만들기 — FTP업로드 폴더를 지금 코드로 갱신한다
# 쓰는 법: build-deploy.bat 을 두 번 누르거나
#   powershell -NoProfile -ExecutionPolicy Bypass -File build-deploy.ps1
#
# 서버 설정(.env)은 public_html 밖에, 웹 루트 설정(public_html/.htaccess)은
# public_html 안에 둔다. .env 는 읽어서 필요한 줄을 더한 뒤 같은 자리에 다시 쓴다.

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

# 관리자 화면은 별도 앱(admin/)이다. 서버에서는 /admin/ 주소로 열리므로 그 주소 기준으로
# 빌드하고, API는 학생용 화면과 같은 /backend/api 를 부르게 한다
Write-Host "      관리자 화면 빌드 (admin/)"
Push-Location admin
if (-not (Test-Path node_modules)) {
    Write-Host "      node_modules가 없어서 먼저 설치합니다..."
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "admin npm ci 실패" }
}
$env:VITE_API_URL = '/backend/api'
npx vite build --base=/admin/
$adminExit = $LASTEXITCODE
Remove-Item Env:VITE_API_URL
Pop-Location
if ($adminExit -ne 0) { Fail "관리자 화면 빌드 실패" }

Step 3 "서버 설정 따로 빼두기"
$differs = @()
# .env 는 public_html 밖($ftp/.env)에 둔다. 웹 루트 안에 두면 .htaccess 가
# 꺼진 서버에서 DB 비밀번호·JWT_SECRET·API 키가 그대로 내려받힌다.
#
# 예전 배포본의 public_html/backend/.env 가 있으면 읽어서 새 위치로 옮긴다.
# 두 파일이 모두 있고 내용이 다르면, 어느 쪽이 최신인지 알 수 없으므로 멈추고
# 사람이 확인하게 한다 (비밀값을 말없이 잃지 않도록).
#
# .htaccess 두 개는 저장소가 들고 있어서 지키지 않는다.
#   웹 루트  → frontend/public/.htaccess (빌드하면 dist 로 복사됨)
#   backend/ → backend/.htaccess
# 서버에서 직접 고친 .htaccess 가 있으면 이 빌드가 덮어쓴다.
foreach ($f in @('.htaccess', 'backend/.htaccess')) {
    if (Test-Path "$web/$f") {
        $old = Get-Content "$web/$f" -Raw -Encoding UTF8
        $src = if ($f -eq '.htaccess') { 'frontend/public/.htaccess' } else { 'backend/.htaccess' }
        # 줄끝(CRLF/LF)만 다른 것은 같은 내용으로 본다. git이 체크아웃할 때 줄끝을 바꿔서
        # 내용이 같은데도 다르다고 알리는 일을 막는다
        $norm = { param($t) ($t -replace "`r`n", "`n").TrimEnd("`n") }
        if ((& $norm (Get-Content $src -Raw -Encoding UTF8)) -ne (& $norm $old)) {
            $keepOld = $old
            Write-Host "      [알림] $f 가 저장소 내용과 다릅니다. 덮어쓰기 전 사본을 FTP업로드/변경전-설정사본/ 에 남깁니다." -ForegroundColor Yellow
            $differs += @{ path = $f; text = $keepOld }
        }
    }
}

$envTarget = Join-Path (Resolve-Path $ftp).Path '.env'
$legacyEnv = "$web/backend/.env"
$envText = $null
$normText = { param($t) (($t -replace "`r`n", "`n").TrimEnd("`n")) }
if (Test-Path $envTarget) {
    $envText = Get-Content $envTarget -Raw -Encoding UTF8
    Write-Host "      보관: .env (public_html 밖)"
    if (Test-Path $legacyEnv) {
        $legacyText = Get-Content $legacyEnv -Raw -Encoding UTF8
        if ((& $normText $legacyText) -ne (& $normText $envText)) {
            Fail "public_html/backend/.env 와 public_html 밖 .env 내용이 다릅니다. 둘 중 최신 파일을 public_html 밖 .env로 맞춘 뒤 다시 실행하세요."
        }
        Write-Host "      [정리] 웹 루트 안의 backend/.env 는 배포 후 삭제합니다." -ForegroundColor Yellow
    }
} elseif (Test-Path $legacyEnv) {
    $envText = Get-Content $legacyEnv -Raw -Encoding UTF8
    Write-Host "      [이전] backend/.env 를 public_html 밖(.env)으로 옮깁니다." -ForegroundColor Yellow
} else {
    Write-Host "      [알림] .env 가 없습니다. FTP업로드/.env 를 만들고 DB·JWT 값을 채워 주세요." -ForegroundColor Yellow
}

# 운영 기록·메일 기록을 public_html 밖에 두도록 .env 에 한 줄 추가한다.
# 이미 다른 경로를 적어 두었다면 그 값을 존중한다.
if ($null -ne $envText -and $envText -notmatch '(?m)^\s*COCODING_DATA_DIR\s*=') {
    $nl = if ($envText -match "`r`n") { "`r`n" } else { "`n" }
    $envText = $envText.TrimEnd([char[]]"`r`n") + $nl + $nl + "; 운영 기록·메일 기록을 public_html 밖에 저장 (build-deploy.ps1이 추가)" + $nl + "COCODING_DATA_DIR=data" + $nl
    Write-Host "      .env 에 COCODING_DATA_DIR=data 추가"
}

Step 4 "파일 모으기"
if (Test-Path $web) { Remove-Item $web -Recurse -Force }
Copy-Item 'frontend/dist' $web -Recurse -Force
Copy-Item 'admin/dist' "$web/admin" -Recurse -Force
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

# .env 는 public_html 안에 다시 넣지 않는다. public_html 밖($ftp/.env)에만 둔다.
if (Test-Path "$web/backend/.env") {
    Remove-Item "$web/backend/.env" -Force
    Write-Host "      [보안] 웹 루트 안의 backend/.env 삭제"
}
if ($null -ne $envText) {
    # BOM 없는 UTF-8 로 쓴다. BOM 이 붙으면 parse_ini_file 이 첫 키를 못 읽을 수 있다.
    [System.IO.File]::WriteAllText($envTarget, $envText, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "      저장: .env (public_html 밖)"
}
if (-not (Test-Path "$ftp/data")) {
    New-Item -ItemType Directory -Path "$ftp/data" -Force | Out-Null
}
# 빈 폴더는 FTP에서 빠질 수 있어 안내 파일을 하나 둔다 (민감정보 아님)
$dataReadme = "$ftp/data/README.txt"
if (-not (Test-Path $dataReadme)) {
    Set-Content $dataReadme "코코딩 운영 기록(로그·메일 기록)을 보관하는 폴더입니다. public_html 밖에 두세요." -Encoding UTF8
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
$must = @("$web/index.html", "$web/admin/index.html", "$web/.htaccess", "$web/backend/api/auth/login.php",
          "$web/backend/grader/grade.mjs", "$web/backend/config/Logger.php",
          "$web/backend/config/Storage.php", "$web/backend/.htaccess", "$ftp/2-DB.sql")
foreach ($f in $must) { if (-not (Test-Path $f)) { Fail "$f 가 없습니다" } }
if (Test-Path "$web/backend/tools") { Fail "tools 폴더가 섞여 들어갔습니다" }
if (Test-Path "$web/backend/.env") { Fail "public_html 안에 .env 가 남아 있습니다. public_html 밖으로 옮겨 주세요." }
if (Test-Path "$web/backend/data/mail.log") { Fail "public_html 안에 mail.log 가 남아 있습니다." }
if (-not (Test-Path "$ftp/data")) { Fail "FTP업로드/data 폴더가 없습니다." }
if ($null -ne $envText -and -not (Test-Path $envTarget)) {
    Fail "$envTarget 가 없습니다. .env 를 public_html 밖에 만들어 주세요."
}
if ($null -eq $envText) {
    Write-Host "      [알림] .env 가 없습니다. FTP업로드/.env 를 만들고 DB·JWT 값을 채워 주세요." -ForegroundColor Yellow
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
Write-Host "  FTP업로드/.env 와 FTP업로드/data 폴더는 public_html 바로 위 폴더에 넣으세요."
Write-Host "  .env 와 data 는 절대 public_html 안에 올리지 마세요."
Write-Host "  서버에 예전 public_html/backend/.env 가 있으면 삭제하세요."
Write-Host "  서버에 예전 public_html/backend/data/mail.log 나 logs 폴더가 있으면 삭제하세요."
Write-Host "  (예전 .env 에는 DB 비밀번호·JWT_SECRET, 예전 mail.log 에는 재설정 링크가 남아 있을 수 있습니다.)"
Write-Host "  (숨김 파일 .htaccess 와 .env 가 FTP 화면에서 보이지 않으면 '숨김 파일 보기'를 켜세요.)"
Write-Host ""
Write-Host "  호스팅이 public_html 위에 파일을 둘 수 없다면, 웹 루트 밖 경로를"
Write-Host "  COCODING_ENV_FILE 환경변수로 지정하거나 웹 서버 vhost 설정을 쓰세요."
Write-Host ""
