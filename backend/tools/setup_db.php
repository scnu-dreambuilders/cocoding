<?php
// backend/tools/setup_db.php — DB 연결 설정 도우미 (setup-db.bat에서 실행)
//  1) 접속 정보 입력 (포트 자동 감지, 비밀번호는 화면에 안 보이게)
//  2) 접속 확인 → DB가 없으면 schema.sql로 만들고, 있으면 새 기능에 맞게 업그레이드
//  3) backend/.env에 저장
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/../config/SchemaUpgrader.php';
require_once __DIR__ . '/../config/Database.php';

$envPath = __DIR__ . '/../.env';
$schemaPath = __DIR__ . '/../../schema.sql';
$env = is_file($envPath) ? (parse_ini_file($envPath) ?: []) : [];

function ask($label, $default = '') {
    echo $default !== '' ? "$label [$default]: " : "$label: ";
    $line = fgets(STDIN);
    $line = $line === false ? '' : trim($line);
    return $line === '' ? (string)$default : $line;
}

function askSecret($label) {
    if (getenv('COCO_DB_PASS') !== false) return getenv('COCO_DB_PASS'); // 자동 설치용
    if (DIRECTORY_SEPARATOR === '\\') {
        // Windows: PowerShell의 Read-Host -AsSecureString으로 입력을 가린다
        echo "$label\n";
        $cmd = 'powershell -NoProfile -Command "$s = Read-Host \'Password\' -AsSecureString; '
             . '[Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))"';
        $out = shell_exec($cmd);
        if ($out !== null) return rtrim($out, "\r\n");
    }
    return ask($label);
}

function portOpen($host, $port) {
    $fp = @fsockopen($host === 'localhost' ? '127.0.0.1' : $host, (int)$port, $errno, $errstr, 0.5);
    if ($fp) fclose($fp);
    return (bool)$fp;
}

echo "\n=== 코코딩 DB 연결 설정 ===\n\n";
$host = ask('DB 주소', $env['DB_HOST'] ?? 'localhost');

$candidates = array_unique(array_filter([$env['DB_PORT'] ?? null, 3306, 3307, 3308]));
$found = null;
foreach ($candidates as $p) {
    if (portOpen($host, $p)) { $found = $p; break; }
}
if ($found) echo "  → $host:$found 에서 DB 서버를 찾았어요.\n";
else echo "  → 열려 있는 DB 포트를 찾지 못했어요. MariaDB/MySQL 서비스가 켜져 있는지 확인하세요.\n";
$port = (int)ask('DB 포트', $found ?? ($env['DB_PORT'] ?? 3306));
$user = ask('DB 계정', $env['DB_USER'] ?? 'root');
$pass = askSecret('DB 비밀번호 (없으면 그냥 Enter)');
$dbname = ask('DB 이름', $env['DB_NAME'] ?? 'cocoding');

try {
    $pdo = Database::connect($host, $port, null, $user, $pass);
} catch (PDOException $e) {
    echo "\n[실패] DB에 접속하지 못했어요: " . $e->getMessage() . "\n";
    echo "  포트·계정·비밀번호를 확인하고 다시 실행해주세요.\n";
    exit(1);
}
echo "\n[OK] DB 서버 접속 성공 (" . $pdo->query('SELECT VERSION()')->fetchColumn() . ")\n";

$exists = $pdo->prepare("SELECT 1 FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?");
$exists->execute([$dbname]);
$hasDb = (bool)$exists->fetchColumn();
$hasTables = false;
if ($hasDb) {
    $t = $pdo->prepare("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('users','chapters','projects')");
    $t->execute([$dbname]);
    $hasTables = (int)$t->fetchColumn() === 3;
}

if (!$hasTables) {
    echo "[..] '$dbname' 데이터베이스가 비어 있어서 schema.sql로 새로 만들어요.\n";
    $sql = file_get_contents($schemaPath);
    $sql = str_replace(['IF NOT EXISTS cocoding', 'USE cocoding;'], ["IF NOT EXISTS `$dbname`", "USE `$dbname`;"], $sql);
    foreach (preg_split('/;\s*(\r?\n|$)/', $sql) as $stmt) {
        $stmt = trim(preg_replace('/^\s*--.*$/m', '', $stmt));
        if ($stmt !== '') $pdo->exec($stmt);
    }
    echo "[OK] 테이블과 챕터 데이터를 만들었어요.\n";
} else {
    $pdo->exec("USE `$dbname`");
    SchemaUpgrader::upgrade($pdo);
    @file_put_contents(__DIR__ . '/../data/.schema_version', SchemaUpgrader::VERSION);
    echo "[OK] 기존 '$dbname' 데이터베이스를 새 기능에 맞게 업그레이드했어요.\n";
}
$pdo->exec("USE `$dbname`");
$counts = [];
foreach (['users' => '회원', 'chapters' => '챕터', 'projects' => '작품'] as $table => $label) {
    $counts[] = "$label " . $pdo->query("SELECT COUNT(*) FROM `$table`")->fetchColumn() . "개";
}
echo "     (" . implode(', ', $counts) . ")\n";

// .env 저장 — 기존 JWT_SECRET/ALLOWED_ORIGINS는 유지
if (strpos($pass, '"') !== false) {
    echo "\n[주의] 비밀번호에 큰따옴표(\")가 있으면 .env에 저장할 수 없어요. 직접 입력해주세요.\n";
    exit(1);
}
$values = array_merge($env, [
    'DB_HOST' => $host, 'DB_PORT' => $port, 'DB_NAME' => $dbname, 'DB_USER' => $user, 'DB_PASS' => $pass,
]);
if (empty($values['JWT_SECRET'])) $values['JWT_SECRET'] = bin2hex(random_bytes(32));
if (empty($values['ALLOWED_ORIGINS'])) $values['ALLOWED_ORIGINS'] = 'http://localhost:5173';
$lines = [];
foreach (['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS', 'JWT_SECRET', 'ALLOWED_ORIGINS'] as $key) {
    $v = (string)$values[$key];
    $lines[] = $key === 'DB_PASS' ? "$key=\"$v\"" : "$key=$v";
    unset($values[$key]);
}
foreach ($values as $key => $v) $lines[] = "$key=$v";
file_put_contents($envPath, implode("\n", $lines) . "\n");
echo "[OK] backend/.env에 저장했어요. 이제 start.bat으로 실행하면 돼요!\n\n";
