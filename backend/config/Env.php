<?php
// backend/config/Env.php
class Env {
    private static $values = null;

    // .env를 찾는 순서
    //   1) COCODING_ENV_FILE 환경변수로 지정한 경로
    //   2) backend/.env  (개발 PC·전용 서버 기본)
    //   3) backend 두 단계 위의 .env  (웹호스팅에서 backend가 public_html 안에 있을 때,
    //      공개 폴더 밖에 두고 쓰기 위한 경로 — 예: /.env, /public_html/backend/)
    private static function candidates() {
        $fromEnv = getenv('COCODING_ENV_FILE');
        return array_filter([
            $fromEnv !== false && $fromEnv !== '' ? $fromEnv : null,
            __DIR__ . '/../.env',
            __DIR__ . '/../../../.env',
        ]);
    }

    private static function load() {
        if (self::$values !== null) return;
        foreach (self::candidates() as $path) {
            $parsed = @parse_ini_file($path);
            if ($parsed !== false) {
                self::$values = $parsed;
                return;
            }
        }
        throw new RuntimeException('환경 설정 파일(.env)을 읽을 수 없습니다. 찾아본 위치: ' . implode(', ', self::candidates()));
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
