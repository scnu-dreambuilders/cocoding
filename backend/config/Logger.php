<?php
// backend/config/Logger.php
// 운영 기록. backend/data/logs/에 하루 한 파일씩, 한 줄에 한 건(JSON)으로 쌓인다.
//
//   access-2026-11-09.log  어떤 요청이 들어와서 어떤 응답이 나갔는지
//   audit-2026-11-09.log   로그인·가입·탈퇴·신고처럼 나중에 확인할 일이 생기는 일
//   error-2026-11-09.log   오류와 예외
//
// 개인정보는 남기지 않는다. 이름·이메일·질문 내용은 기록하지 않고,
// 사용자는 번호(uid)로, 접속 지점은 되돌릴 수 없는 해시로만 남긴다.
// 오래된 파일은 LOG_RETENTION_DAYS가 지나면 자동으로 지운다.
//
// 기록하다 실패해도 서비스는 그대로 돌아가야 하므로 모든 쓰기는 조용히 넘어간다.
require_once __DIR__ . '/Env.php';

class Logger {
    const DEFAULT_RETENTION_DAYS = 30;
    const DEFAULT_TIMEZONE = 'Asia/Seoul';

    private static $requestId = null;
    private static $startedAt = null;
    private static $userId = null;
    private static $accessWritten = false;

    /* Bootstrap에서 한 번 부른다 */
    public static function init() {
        if (self::$startedAt !== null) return;
        self::$startedAt = microtime(true);
        self::$requestId = substr(bin2hex(random_bytes(6)), 0, 10);
        register_shutdown_function([self::class, 'finish']);
    }

    /* 토큰을 확인한 뒤 누가 보낸 요청인지 알려준다 (Auth에서 부름) */
    public static function setUser($userId) {
        self::$userId = $userId === null ? null : (int)$userId;
    }

    public static function requestId() {
        return self::$requestId;
    }

    /* 나중에 확인할 일이 생기는 사건: 로그인, 가입, 탈퇴, 신고 등 */
    public static function audit($event, array $fields = []) {
        self::write('audit', $event, $fields);
    }

    /* 오류·예외 */
    public static function error($event, array $fields = []) {
        self::write('error', $event, $fields);
    }

    /* 요청이 끝날 때 접근 기록을 남긴다 (shutdown에서 자동 호출) */
    public static function finish() {
        if (self::$accessWritten) return;
        self::$accessWritten = true;

        // 치명적 오류로 끝났으면 그것부터 남긴다
        $fatal = error_get_last();
        if ($fatal && in_array($fatal['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
            self::write('error', 'fatal', [
                'msg' => self::clip($fatal['message'], 300),
                'file' => basename($fatal['file']),
                'line' => $fatal['line'],
            ]);
        }

        $ms = self::$startedAt === null ? null : (int)round((microtime(true) - self::$startedAt) * 1000);
        self::write('access', 'request', [
            'status' => function_exists('http_response_code') ? (int)http_response_code() : null,
            'ms' => $ms,
        ]);
        self::cleanup();
    }

    /* ── 실제 쓰기 ──────────────────────────────── */
    public static function write($channel, $event, array $fields = []) {
        try {
            if (!self::enabled()) return;
            $dir = self::dir();
            if ($dir === null) return;

            $line = json_encode(array_merge([
                'ts' => self::now()->format('c'),
                'rid' => self::$requestId,
                'ev' => $event,
                'uid' => self::$userId,
                'ip' => self::ipHash(),
                'm' => $_SERVER['REQUEST_METHOD'] ?? null,
                'p' => self::path(),
            ], $fields), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            if ($line === false) return;

            $file = $dir . '/' . $channel . '-' . self::now()->format('Y-m-d') . '.log';
            @file_put_contents($file, $line . "\n", FILE_APPEND | LOCK_EX);
        } catch (Throwable $e) {
            // 기록 실패가 서비스를 멈추게 하면 안 된다
        }
    }

    /* ── 도우미 ─────────────────────────────────── */
    /* 기록 시각은 우리 시간대로 적는다. 서버 전체 설정은 건드리지 않는다 */
    private static function now() {
        $tz = trim((string)Env::get('LOG_TIMEZONE', '')) ?: self::DEFAULT_TIMEZONE;
        try {
            return new DateTime('now', new DateTimeZone($tz));
        } catch (Throwable $e) {
            return new DateTime('now', new DateTimeZone(self::DEFAULT_TIMEZONE));
        }
    }

    private static function enabled() {
        $raw = Env::get('LOG_ENABLED', null);
        if ($raw === null) return true; // 적지 않으면 켠다
        return !in_array(strtolower(trim((string)$raw)), ['0', 'false', 'no', 'off', ''], true);
    }

    private static function dir() {
        $dir = trim((string)Env::get('LOG_DIR', ''));
        if ($dir === '') $dir = __DIR__ . '/../data/logs';
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) return null;
        self::protect($dir);
        return $dir;
    }

    // 웹호스팅처럼 backend가 공개 폴더 안에 있을 때 로그가 그대로 열리지 않도록
    private static function protect($dir) {
        $htaccess = $dir . '/.htaccess';
        if (!is_file($htaccess)) {
            @file_put_contents($htaccess, "Require all denied\n<IfModule !mod_authz_core.c>\n    Deny from all\n</IfModule>\n");
        }
    }

    // 접속 지점은 되돌릴 수 없게 해시로만. 같은 사람의 연속 시도는 구분되지만 IP는 복원할 수 없다
    private static function ipHash() {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '';
        if ($ip === '') return null;
        $salt = (string)Env::get('LOG_IP_SALT', '');
        if ($salt === '') $salt = (string)Env::get('JWT_SECRET', 'cocoding');
        return substr(hash('sha256', $salt . '|' . $ip), 0, 12);
    }

    /* 이메일을 그대로 남기지 않고, 같은 계정을 노린 시도인지만 알 수 있게 해시로 */
    public static function accountHash($email) {
        $email = strtolower(trim((string)$email));
        if ($email === '') return null;
        $salt = (string)Env::get('LOG_IP_SALT', '');
        if ($salt === '') $salt = (string)Env::get('JWT_SECRET', 'cocoding');
        return substr(hash('sha256', $salt . '|acct|' . $email), 0, 12);
    }

    private static function path() {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
        return $path === null ? null : self::clip($path, 120);
    }

    private static function clip($text, $max) {
        $text = (string)$text;
        return mb_strlen($text) > $max ? mb_substr($text, 0, $max) . '…' : $text;
    }

    /* 보관 기간이 지난 파일 삭제. 하루에 한 번만 돌도록 표시 파일을 둔다 */
    public static function cleanup() {
        try {
            $dir = self::dir();
            if ($dir === null) return;
            $marker = $dir . '/.cleanup';
            $today = self::now()->format('Y-m-d');
            if (is_file($marker) && trim((string)@file_get_contents($marker)) === $today) return;
            @file_put_contents($marker, $today);

            $days = (int)Env::get('LOG_RETENTION_DAYS', self::DEFAULT_RETENTION_DAYS);
            if ($days < 1) $days = self::DEFAULT_RETENTION_DAYS;
            $cutoff = strtotime("-$days days");
            foreach (glob($dir . '/*.log') ?: [] as $file) {
                if (preg_match('/-(\d{4}-\d{2}-\d{2})\.log$/', $file, $m) && strtotime($m[1]) < $cutoff) {
                    @unlink($file);
                }
            }
        } catch (Throwable $e) {
            // 청소 실패도 서비스에 영향을 주지 않는다
        }
    }
}
