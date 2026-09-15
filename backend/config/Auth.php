<?php
// backend/config/Auth.php
// JWT(HS256) 발급·검증. 토큰에 사용자별 token_version(tv)을 담아서
// 로그아웃하면 DB의 버전을 올려 이전에 발급한 토큰을 모두 무효화한다.
require_once __DIR__ . '/Env.php';
require_once __DIR__ . '/Database.php';

class Auth {
    const TOKEN_TTL = 86400 * 3; // 3일

    private static $secret_key;
    private static $cachedUser = false;

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
    public static function user() {
        if (self::$cachedUser !== false) return self::$cachedUser;
        $payload = self::validateJWT(self::getBearerToken());
        if ($payload) {
            $stmt = Database::getInstance()->prepare("SELECT token_version FROM users WHERE id = ?");
            $stmt->execute([$payload['id']]);
            $version = $stmt->fetchColumn();
            if ($version === false || (int)$version !== (int)($payload['tv'] ?? 0)) $payload = null;
        }
        return self::$cachedUser = $payload ?: null;
    }

    // 로그인이 필요한 API: 아니면 401로 끝냄
    public static function requireUser() {
        $payload = self::user();
        if (!$payload) {
            Response::error("로그인이 필요합니다.", 401);
        }
        return $payload;
    }
}
