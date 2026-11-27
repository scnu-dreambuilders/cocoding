<?php
// backend/config/Database.php
require_once __DIR__ . '/Env.php';
require_once __DIR__ . '/AppTime.php';
require_once __DIR__ . '/SchemaUpgrader.php';

// DB에 아예 접속하지 못한 경우 — Bootstrap에서 설정 안내 메시지로 바꿔서 응답
class DatabaseConnectionException extends RuntimeException {}

class Database {
    private static $instance = null;
    private $conn;

    public static function connect($host, $port, $dbname, $user, $pass) {
        $dsn = "mysql:host=$host;port=$port;charset=utf8mb4" . ($dbname !== null ? ";dbname=$dbname" : '');
        $conn = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
        // PHP와 DB가 같은 "오늘"을 쓰게 맞춘다. 서버 설정이 UTC여도 결과가 같아진다.
        // (TIMESTAMP 값은 안에 UTC로 담겨 있어서, 시차를 바꿔도 저장된 시각 자체는 그대로다)
        AppTime::apply();
        try {
            $conn->exec("SET time_zone = '" . AppTime::dbOffset() . "'");
        } catch (Throwable $e) {
            // 시차 설정을 못 해도 서비스는 돌아가야 한다. 다만 '오늘'의 기준이 PHP와 DB에서 어긋날 수 있으므로
            // (출석·하루 한 번 보상) 알 수 있게 남긴다
            error_log('[Database] DB 시차(time_zone)를 맞추지 못했습니다: ' . $e->getMessage());
        }
        return $conn;
    }

    private function __construct() {
        try {
            $this->conn = self::connect(
                Env::get('DB_HOST', 'localhost'),
                (int)Env::get('DB_PORT', 3306),
                Env::get('DB_NAME', 'cocoding'),
                Env::get('DB_USER', 'root'),
                Env::get('DB_PASS', '')
            );
        } catch (PDOException $e) {
            throw new DatabaseConnectionException($e->getMessage(), (int)$e->getCode(), $e);
        }
        // 마이그레이션을 따로 실행하지 않아도 새 기능에 필요한 컬럼을 맞춰준다
        SchemaUpgrader::ensure($this->conn);
    }

    public static function getInstance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance->conn;
    }
}
