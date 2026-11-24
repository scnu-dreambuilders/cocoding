<?php
// backend/config/Auth.php
// JWT(HS256) 발급·검증. 토큰에 사용자별 token_version(tv)을 담아서
// 로그아웃하면 DB의 버전을 올려 이전에 발급한 토큰을 모두 무효화한다.
require_once __DIR__ . '/Env.php';
require_once __DIR__ . '/Logger.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Settings.php';

class Auth {
    const TOKEN_TTL = 86400 * 3; // 3일

    private static $secret_key;
    private static $cachedUser = false;
    private static $idleExpired = false; // 이번 요청이 '자리 비움'으로 끊겼는지 (안내 문구를 다르게 하려고)

    // 마지막 요청 시각을 얼마나 자주 고쳐 적을지(초). 요청마다 적으면 DB 쓰기가 너무 잦다.
    // 그만큼 판정이 늦어질 수 있지만 길어야 1분이다
    const ACTIVE_TOUCH_SECONDS = 60;

    /* 자리 비움 자동 로그아웃
       로그인한 뒤 서버에 아무 요청도 오지 않은 시간이 기준(운영 기준값 auth.idle_minutes)을
       넘으면 그 계정의 토큰을 모두 끊는다. 공용 컴퓨터에서 로그아웃을 잊고 자리를 떠도
       다음 사람이 그 계정을 쓸 수 없게 하려는 것이다.

       서버가 볼 수 있는 것은 '요청이 왔는가' 뿐이다. 화면에서 마우스를 움직이는 것은 모른다.
       그래서 화면 쪽이 사용 중일 때 가벼운 요청(GET /api/auth/me.php)을 보내 줘야,
       요청 없이 오래 작업하는 화면(블록 편집기)에서 작업 중에 끊기지 않는다. */
    public static function idleLimitSeconds() {
        return Settings::int('auth.idle_minutes') * 60;
    }

    private static function init() {
        if (!isset(self::$secret_key)) {
            self::$secret_key = Env::require('JWT_SECRET');
        }
    }

    private static function base64UrlEncode($data) {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode($data) {
        return base64_decode(strtr($data, '-_', '+/'), true);
    }

    private static function sign($data) {
        self::init();
        return self::base64UrlEncode(hash_hmac('sha256', $data, self::$secret_key, true));
    }

    public static function generateJWT($payload) {
        $header = self::base64UrlEncode(json_encode(['typ' => 'JWT', 'alg' => 'HS256']));
        $body = self::base64UrlEncode(json_encode($payload));
        return "$header.$body." . self::sign("$header.$body");
    }

    // 서명·만료만 확인 (DB 조회 없음). 실패하면 false
    public static function validateJWT($jwt) {
        if (!is_string($jwt) || $jwt === '') return false;
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) return false;
        [$header, $body, $signature] = $parts;

        // 알고리즘은 HS256으로 고정 (토큰 헤더의 alg 값은 믿지 않음)
        if (!hash_equals(self::sign("$header.$body"), $signature)) return false;

        $decoded = json_decode((string)self::base64UrlDecode($body), true);
        if (!is_array($decoded) || !isset($decoded['id'], $decoded['exp'])) return false;
        if (time() >= (int)$decoded['exp']) return false;
        return $decoded;
    }

    public static function issueToken($userId, $username) {
        self::touch($userId); // 자리 비움 시간을 지금부터 다시 센다
        $stmt = Database::getInstance()->prepare("SELECT token_version FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        return self::generateJWT([
            'id' => (int)$userId,
            'username' => $username,
            'tv' => (int)$stmt->fetchColumn(),
            'iat' => time(),
            'exp' => time() + self::TOKEN_TTL,
        ]);
    }

    // 지금 사용 중이라고 적는다 (로그인·가입 직후, 그리고 요청이 올 때마다 가끔)
    public static function touch($userId) {
        Database::getInstance()->prepare("UPDATE users SET last_active_at = NOW() WHERE id = ?")->execute([$userId]);
    }

    // 로그아웃: 이 사용자의 모든 토큰 무효화
    public static function revoke($userId) {
        Database::getInstance()->prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?")->execute([$userId]);
    }

    public static function getBearerToken() {
        $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null;
        if ($header === null && function_exists('getallheaders')) {
            foreach (getallheaders() as $name => $value) {
                if (strcasecmp($name, 'Authorization') === 0) $header = $value;
            }
        }
        if ($header && preg_match('/^Bearer\s+(\S+)$/', trim($header), $m)) {
            return $m[1];
        }
        return null;
    }

    // 현재 요청의 사용자(토큰 payload) 또는 null. 로그아웃된 토큰·삭제된 계정은 거부
    // 계정 유형(role)과 보호자 동의 상태(consent)는 토큰이 아니라 DB의 최신 값을 담는다
    public static function user() {
        if (self::$cachedUser !== false) return self::$cachedUser;
        $payload = self::validateJWT(self::getBearerToken());
        if ($payload) {
            $stmt = Database::getInstance()->prepare("SELECT token_version, role, consent_status, is_admin, suspended, suspended_reason,
                    TIMESTAMPDIFF(SECOND, last_active_at, NOW()) AS idle_seconds
                FROM users WHERE id = ?");
            $stmt->execute([$payload['id']]);
            $row = $stmt->fetch();
            $limit = $row ? self::idleLimitSeconds() : 0;
            // last_active_at 이 비어 있으면(이 기능이 생기기 전에 로그인한 토큰) 지금부터 센다
            $idle = $row && $row['idle_seconds'] !== null ? (int)$row['idle_seconds'] : null;
            if (!$row || (int)$row['token_version'] !== (int)($payload['tv'] ?? 0)) {
                $payload = null;
            } elseif ($limit > 0 && $idle !== null && $idle > $limit) {
                // 너무 오래 요청이 없었다 → 이 계정의 토큰을 모두 끊는다.
                // 버전을 올려 두지 않으면, 다른 기기에서 다시 로그인하는 순간 이 옛 토큰이 되살아난다
                self::revoke($payload['id']);
                Logger::setUser($payload['id']); // 기록에 누구의 세션이 끊겼는지 번호로 남긴다
                Logger::audit('logout.idle', ['idle' => $idle]);
                self::$idleExpired = true;
                $payload = null;
            } else {
                if ($idle === null || $idle >= self::ACTIVE_TOUCH_SECONDS) {
                    self::touch($payload['id']);
                }
                $payload['role'] = $row['role'];
                $payload['consent'] = $row['consent_status'];
                // 운영자 권한과 정지 여부도 토큰이 아니라 DB의 최신 값으로 본다.
                // 토큰에 넣으면 권한을 빼앗거나 계정을 정지해도 토큰이 만료될 때까지 그대로 통한다
                $payload['is_admin'] = (int)$row['is_admin'] === 1;
                $payload['suspended'] = (int)$row['suspended'] === 1;
                $payload['suspended_reason'] = $row['suspended_reason'];
            }
        }
        self::$cachedUser = $payload ?: null;
        // 접근 기록에 '누구의 요청인지' 남기기 위해 번호만 알려준다
        Logger::setUser(self::$cachedUser['id'] ?? null);
        return self::$cachedUser;
    }

    // 로그인이 필요한 API: 아니면 401로 끝냄
    // 정지된 계정은 403으로 막는다. 401로 하면 화면이 '로그인 풀림'으로 보고 조용히
    // 로그아웃시켜서, 학생이 왜 막혔는지 알 수 없다
    public static function requireUser() {
        $payload = self::user();
        if (!$payload) {
            Response::error(self::$idleExpired
                ? "오랫동안 사용하지 않아 자동으로 로그아웃됐어요. 다시 로그인해 주세요."
                : "로그인이 필요합니다.", 401);
        }
        if (!empty($payload['suspended'])) {
            $reason = trim((string)($payload['suspended_reason'] ?? ''));
            Response::error($reason !== ''
                ? "이 계정은 지금 쓸 수 없어요. ($reason) 선생님이나 보호자에게 물어봐 주세요."
                : "이 계정은 지금 쓸 수 없어요. 선생님이나 보호자에게 물어봐 주세요.", 403);
        }
        return $payload;
    }

    // 관리자 웹 전용 API. 운영자 플래그(users.is_admin)가 켜진 계정만 쓸 수 있다.
    // 역할(role)과는 다른 축이라, 선생님 계정에 운영자 권한을 줄 수도 있다
    public static function requireAdmin() {
        $payload = self::requireUser();
        if (empty($payload['is_admin'])) {
            // 관리자 주소가 있다는 것조차 알려주지 않으려면 404가 낫지만,
            // 운영자가 권한을 잃은 경우를 구분해야 해서 403으로 둔다
            Response::error("관리자만 쓸 수 있는 기능이에요.", 403);
        }
        return $payload;
    }

    // 특정 계정 유형만 쓸 수 있는 API (선생님 반 관리, 보호자 자녀 연결 등)
    public static function requireRole(array $roles) {
        $payload = self::requireUser();
        if (!in_array($payload['role'], $roles, true)) {
            Response::error("이 기능을 쓸 수 없는 계정이에요.", 403);
        }
        return $payload;
    }

    // 다른 친구와 작품을 주고받는 기능(공개·친구 작품 보기·리메이크·신고)은
    // 만 14세 미만이면 보호자 동의가 끝난 뒤에만 쓸 수 있다
    public static function canShare($payload) {
        return ($payload['consent'] ?? 'not_required') !== 'pending';
    }

    public static function requireSharing($payload) {
        if (!self::canShare($payload)) {
            Response::error("보호자 동의가 끝나면 친구들과 작품을 나눌 수 있어요.", 403);
        }
    }
}
