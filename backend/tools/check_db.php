<?php
// backend/tools/check_db.php — start.bat에서 서버 켜기 전에 DB 연결 확인 (성공 0 / 실패 1)
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/../config/Database.php';

try {
    $db = Database::getInstance();
    $chapters = $db->query("SELECT COUNT(*) FROM chapters")->fetchColumn();
    echo "  DB 연결 OK (" . Env::get('DB_HOST') . ":" . Env::get('DB_PORT', 3306) . "/" . Env::get('DB_NAME') . ", 챕터 {$chapters}개)\n";
    exit(0);
} catch (Throwable $e) {
    echo "  [DB 연결 실패] " . $e->getMessage() . "\n";
    exit(1);
}
