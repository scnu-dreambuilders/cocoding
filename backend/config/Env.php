<?php
// backend/config/Env.php
class Env {
    private static $values = null;

    private static function load() {
        if (self::$values === null) {
            $path = __DIR__ . '/../.env';
            $parsed = @parse_ini_file($path);
            if ($parsed === false) {
                throw new RuntimeException("환경 설정 파일을 읽을 수 없습니다: $path");
            }
            self::$values = $parsed;
        }
    }

    public static function get($key, $default = null) {
        self::load();
        return self::$values[$key] ?? $default;
    }

    // Use for secrets that must never silently fall back to empty/null (e.g. JWT_SECRET).
    public static function require($key) {
        self::load();
        $value = self::$values[$key] ?? '';
        if ($value === '') {
            throw new RuntimeException("필수 환경 변수가 설정되지 않았습니다: $key");
        }
        return $value;
    }
}
