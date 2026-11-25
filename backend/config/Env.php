<?php
// backend/config/Env.php
class Env {
    private static $values = null;
    private static $path = null;

    // 흔한 웹 루트 폴더 이름. backend 가 바로 아래에 있으면 웹에 노출된 것으로 본다.
    const PUBLIC_DIRS = ['public_html', 'www', 'htdocs', 'web', 'html', 'public', 'httpdocs', 'wwwroot'];
    // 중첩 배포(public_html/사이트/backend)에서도 웹 루트로 확실한 이름.
    // 'www'는 /var/www/사이트/backend 같은 정상 배포가 흔해서 여기 넣지 않는다.
    const STRONG_PUBLIC_DIRS = ['public_html', 'htdocs', 'web', 'html', 'public', 'httpdocs', 'wwwroot'];

    // backend 가 실제 DocumentRoot 안에 있으면 그 루트를, 아니면 null 을 돌려준다.
    //
    // 웹 요청에서는 DOCUMENT_ROOT 와 비교하는 것이 가장 정확하다. 이 방법이면
    // public_html/사이트/backend 처럼 한 단계 더 들어간 배포도 잡아낸다.
    // CLI 와 `php -S`(개발 서버)는 DOCUMENT_ROOT 가 backend 자신을 가리키므로
    // 비교에서 뺀다. 개발 서버는 router.php 가 .env 를 막고, CLI 는 웹에 열리지 않는다.
    private static function publicRoot() {
        if (!in_array(PHP_SAPI, ['cli', 'cli-server'], true) && !empty($_SERVER['DOCUMENT_ROOT'])) {
            $docRoot = realpath($_SERVER['DOCUMENT_ROOT']);
            $backend = realpath(dirname(__DIR__));
            if ($docRoot !== false && $backend !== false) {
                $docRoot = rtrim(str_replace('\\', '/', $docRoot), '/');
                $backend = rtrim(str_replace('\\', '/', $backend), '/');
                if ($docRoot === '' || $backend === $docRoot || strpos($backend . '/', $docRoot . '/') === 0) {
                    return $docRoot === '' ? '/' : $docRoot;
                }
            }
        }

        // CLI·개발 서버이거나 DOCUMENT_ROOT 를 알 수 없을 때의 보수적 판정.
        // backend 바로 위가 공개 폴더면 그 폴더를 웹 루트로 본다.
        $dir = dirname(__DIR__, 2);
        if (in_array(strtolower(basename($dir)), self::PUBLIC_DIRS, true)) return $dir;

        // public_html/사이트/backend 처럼 한두 단계 더 들어간 경우.
        // 'www'는 위에서 바로 위일 때만 인정했으므로 여기서는 보지 않는다.
        for ($i = 0; $i < 3; $i++) {
            $dir = dirname($dir);
            if ($dir === '' || $dir === '.' || $dir === DIRECTORY_SEPARATOR) break;
            if (in_array(strtolower(basename($dir)), self::STRONG_PUBLIC_DIRS, true)) return $dir;
            if (dirname($dir) === $dir) break;
        }
        return null;
    }

    private static function underPublicRoot() {
        return self::publicRoot() !== null;
    }

    private static function externalPath() {
        $root = self::publicRoot();
        if ($root !== null) {
            // 웹 루트의 한 단계 위. public_html/사이트/backend 라면 public_html 위에 둔다.
            // DOCUMENT_ROOT 가 public_html/사이트처럼 하위 폴더여도, .env 는
            // 실제 공개 폴더(public_html)의 위에 둔다.
            // 'www'는 /var/www/사이트 같은 상위 폴더일 수 있어 여기서는 보지 않는다.
            $dir = $root;
            for ($i = 0; $i < 3; $i++) {
                if (in_array(strtolower(basename($dir)), self::STRONG_PUBLIC_DIRS, true)) {
                    return ($dir === '/' ? '' : dirname($dir)) . '/.env';
                }
                $parent = dirname($dir);
                if ($parent === $dir) break;
                $dir = $parent;
            }
            return ($root === '/' ? '' : dirname($root)) . '/.env';
        }
        return dirname(__DIR__, 3) . '/.env';
    }

    // .env를 찾는 순서
    //   1) COCODING_ENV_FILE 환경변수로 지정한 경로
    //   2) 웹 루트 밖의 .env  (FTP 배포처럼 backend가 public_html 안에 있을 때)
    //   3) backend/.env       (로컬 개발·DocumentRoot 밖 전용 서버)
    //
    // 2번이 필요한 환경에서는 3번을 아예 후보에 넣지 않는다. .htaccess 가 꺼진
    // 서버에서 public_html/backend/.env 가 그대로 내려받히는 것을 막기 위해서다.
    private static function candidates() {
        $fromEnv = getenv('COCODING_ENV_FILE');
        $fromEnv = $fromEnv !== false && $fromEnv !== '' ? $fromEnv : null;
        $local = __DIR__ . '/../.env';
        $external = self::externalPath();

        if (self::underPublicRoot()) {
            return array_filter([$fromEnv, $external]);
        }
        return array_filter([$fromEnv, $local, $external]);
    }

    private static function load() {
        if (self::$values !== null) return;
        foreach (self::candidates() as $path) {
            $parsed = @parse_ini_file($path);
            if ($parsed !== false) {
                self::$values = $parsed;
                self::$path = realpath($path) ?: $path;
                return;
            }
        }
        $hint = self::underPublicRoot()
            ? ' 웹 루트(public_html 등) 안의 backend/.env 는 보안상 읽지 않습니다. .env 를 웹 루트 바로 위 폴더로 옮기거나 COCODING_ENV_FILE 로 웹 루트 밖 경로를 지정하세요.'
            : '';
        throw new RuntimeException('환경 설정 파일(.env)을 읽을 수 없습니다.' . $hint . ' 찾아본 위치: ' . implode(', ', self::candidates()));
    }

    // 실제로 읽은 .env 경로. Storage 가 상대 경로를 풀 때 쓴다.
    public static function path() {
        self::load();
        return self::$path;
    }

    public static function dir() {
        self::load();
        return self::$path === null ? '' : dirname(self::$path);
    }

    // .env에 그 줄이 아예 없는지 확인. ini 형식에서는 false가 빈 문자열로 읽히기 때문에,
    // '적지 않음'과 '거짓'을 구분하려면 이걸 써야 한다
    public static function has($key) {
        self::load();
        return array_key_exists($key, self::$values);
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
