<?php
// backend/config/Storage.php
// 운영 중에 쓰는 파일(로그·메일 기록·스키마 표시)을 public_html 밖에 둔다.
//
// 위치를 정하는 순서
//   1) .env 의 COCODING_DATA_DIR (상대 경로면 .env 가 있는 폴더 기준)
//   2) .env 가 backend 밖에 있으면 그 옆의 data/
//   3) 그 밖에는 backend/data/  (로컬 개발·DocumentRoot 밖 배포)
//
// FTP 배포처럼 backend 가 public_html 안에 들어가는 환경에서는 .env 와 이 폴더를
// public_html 바로 위에 두면, .htaccess 가 꺼진 서버에서도 로그·메일 기록이
// 웹으로 내려가지 않는다.
require_once __DIR__ . '/Env.php';

class Storage {
    public static function runtimeDir() {
        $configured = trim((string)Env::get('COCODING_DATA_DIR', ''));
        if ($configured !== '') return self::resolve($configured);

        $backend = dirname(__DIR__);
        $envDir = Env::dir();
        if ($envDir !== '' && self::normalize($envDir) !== self::normalize($backend)) {
            return rtrim($envDir, "/\\") . '/data';
        }
        return $backend . '/data';
    }

    public static function runtimePath($name) {
        return self::runtimeDir() . '/' . basename((string)$name);
    }

    // 폴더가 없으면 만든다. 만들 수 없거나 쓸 수 없으면 null 을 돌려주고,
    // 부르는 쪽이 error_log 같은 안전한 대체 수단을 쓰게 한다.
    public static function ensureRuntimeDir() {
        $dir = self::runtimeDir();
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        return is_dir($dir) && is_writable($dir) ? $dir : null;
    }

    // LOG_DIR 처럼 설정에서 받은 경로를 .env 위치 기준으로 풀어준다.
    public static function resolve($path) {
        $path = trim((string)$path);
        if ($path === '') return '';
        if (self::isAbsolute($path)) return rtrim($path, "/\\");
        return rtrim(Env::dir(), "/\\") . '/' . $path;
    }

    private static function isAbsolute($path) {
        return $path[0] === '/' || $path[0] === '\\'
            || preg_match('/^[A-Za-z]:[\\\\\/]/', $path) === 1;
    }

    private static function normalize($path) {
        $real = realpath($path);
        if ($real !== false) $path = $real;
        return rtrim(str_replace('\\', '/', $path), '/');
    }
}
