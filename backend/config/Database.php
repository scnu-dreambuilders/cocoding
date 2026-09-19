<?php
// backend/config/Database.php
require_once __DIR__ . '/Env.php';
require_once __DIR__ . '/SchemaUpgrader.php';

// DB에 아예 접속하지 못한 경우 — Bootstrap에서 설정 안내 메시지로 바꿔서 응답
class DatabaseConnectionException extends RuntimeException {}

class Database {
    private static $instance = null;
    private $conn;

    public static function connect($host, $port, $dbname, $user, $pass) {
        $dsn = "mysql:host=$host;port=$port;charset=utf8mb4" . ($dbname !== null ? ";dbname=$dbname" : '');
        return new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
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
