<?php
// backend/config/RateLimiter.php
// DB 기반 요청 제한 (고정 창 방식). 예전 파일 방식은 서버 폴더에 쓰기 권한이 없으면
// 조용히 꺼졌기 때문에, 앱이 어차피 쓰는 DB에 기록한다 → 권한 문제로 꺼지지 않음.
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Response.php';

class RateLimiter {
    private static function hashKey($key) {
        return hash('sha256', $key);
    }

    public static function clientIp() {
        return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    }

    // 최근 $windowSeconds 동안의 기록 수
    public static function count($key, $windowSeconds) {
        $stmt = Database::getInstance()->prepare("SELECT COUNT(*) FROM rate_limits WHERE key_hash = ? AND attempted_at > ?");
        $stmt->execute([self::hashKey($key), time() - $windowSeconds]);
        return (int)$stmt->fetchColumn();
    }

    public static function tooMany($key, $maxAttempts, $windowSeconds) {
        return self::count($key, $windowSeconds) >= $maxAttempts;
    }

    public static function hit($key) {
        $db = Database::getInstance();
        $db->prepare("INSERT INTO rate_limits (key_hash, attempted_at) VALUES (?, ?)")->execute([self::hashKey($key), time()]);
        // 가끔 하루 지난 기록 청소 (테이블이 계속 커지지 않게)
        if (random_int(1, 100) === 1) {
            $db->prepare("DELETE FROM rate_limits WHERE attempted_at < ?")->execute([time() - 86400]);
        }
    }

    public static function clear($key) {
        Database::getInstance()->prepare("DELETE FROM rate_limits WHERE key_hash = ?")->execute([self::hashKey($key)]);
    }

    // 제한을 넘으면 429로 응답을 끝내고, 아니면 기록한다
    public static function limit($key, $maxAttempts, $windowSeconds, $message = '요청이 너무 많아요. 잠시 후 다시 시도해주세요.') {
        if (self::tooMany($key, $maxAttempts, $windowSeconds)) {
            header('Retry-After: ' . $windowSeconds);
            Response::error($message, 429);
        }
        self::hit($key);
    }
}
