# 코코딩 배포본 만들기 (FTP 업로드용)
# 쓰는 법: build-deploy.bat 을 두 번 누르거나
#   powershell -NoProfile -ExecutionPolicy Bypass -File build-deploy.ps1

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Step($n, $text) { Write-Host ""; Write-Host "[$n/5] $text" -ForegroundColor Cyan }
function Fail($text) { Write-Host ""; Write-Host "  [실패] $text" -ForegroundColor Red; exit 1 }

Write-Host "================================================"
Write-Host " 코코딩 배포본 만들기 (FTP 업로드용)"
Write-Host "================================================"

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

Step 3 "예전 배포본 지우기"
foreach ($d in @('deploy/public', 'deploy/backend')) {
    if (Test-Path $d) { Remove-Item $d -Recurse -Force }
}
Write-Host "      지웠습니다"

Step 4 "파일 모으기"
# 화면 (public_html 안에 올릴 것)
Copy-Item 'frontend/dist' 'deploy/public' -Recurse -Force
# 서버
New-Item -ItemType Directory -Path 'deploy/backend' -Force | Out-Null
foreach ($d in @('api', 'config', 'models', 'data', 'grader')) {
    Copy-Item "backend/$d" "deploy/backend/$d" -Recurse -Force
}
foreach ($f in @('router.php', '.htaccess', '.env.example')) {
    Copy-Item "backend/$f" "deploy/backend/$f" -Force
}
Copy-Item 'schema.sql' 'deploy/schema.sql' -Force

# 올리면 안 되는 것 빼기: 실제 설정(.env), 관리용 스크립트(tools), 로그, 실행 중 생긴 파일
foreach ($x in @('deploy/backend/.env', 'deploy/backend/tools', 'deploy/backend/data/logs',
                 'deploy/backend/data/.schema_version', 'deploy/backend/data/mail.log',
                 'deploy/backend/data/.rate_limit.json')) {
    if (Test-Path $x) { Remove-Item $x -Recurse -Force }
}
Write-Host "      모았습니다"

Step 5 "확인"
$must = @('deploy/public/index.html', 'deploy/backend/api/auth/login.php',
          'deploy/backend/grader/grade.mjs', 'deploy/backend/config/Logger.php', 'deploy/schema.sql')
foreach ($f in $must) { if (-not (Test-Path $f)) { Fail "$f 가 없습니다" } }
if (Test-Path 'deploy/backend/.env') { Fail ".env가 섞여 들어갔습니다" }
if (Test-Path 'deploy/backend/tools') { Fail "tools 폴더가 섞여 들어갔습니다" }

$files = Get-ChildItem deploy -Recurse -File
$size = [math]::Round((($files | Measure-Object Length -Sum).Sum / 1MB), 1)
Write-Host "      파일 $($files.Count)개, 합계 $size MB"

Write-Host ""
Write-Host "================================================"
Write-Host " 다 됐습니다. deploy 폴더를 FTP로 올리세요."
Write-Host "================================================"
Write-Host ""
Write-Host "   deploy/public/    ->  public_html/           (화면)"
Write-Host "   deploy/backend/   ->  public_html/backend/   (서버)"
Write-Host "   deploy/schema.sql ->  처음 설치할 때 DB에 한 번만 실행"
Write-Host ""
Write-Host "  올린 뒤 서버에서 backend/.env를 직접 만들어야 합니다."
Write-Host "  .env.example을 복사해서 DB 정보, JWT_SECRET, OPENROUTER_KEY를 채우세요."
Write-Host ""
