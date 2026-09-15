<?php
// backend/config/Auth.php
class Auth {
    private static $secret_key;

    private static function init() {
        if (!isset(self::$secret_key)) {
            require_once __DIR__ . '/Env.php';
            self::$secret_key = Env::require('JWT_SECRET');
        }
    }

    public static function generateJWT($payload) {
        self::init();
        $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
        $base64UrlHeader = self::base64UrlEncode($header);
        $base64UrlPayload = self::base64UrlEncode(json_encode($payload));
        $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, self::$secret_key, true);
        $base64UrlSignature = self::base64UrlEncode($signature);
        return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
    }

    public static function validateJWT($jwt) {
        if (!is_string($jwt) || $jwt === '') return false;

        self::init();
        $tokenParts = explode('.', $jwt);
        if (count($tokenParts) !== 3) return false;

        $header = base64_decode(self::base64UrlDecode($tokenParts[0]));
        $payload = base64_decode(self::base64UrlDecode($tokenParts[1]));
        $signatureProvided = $tokenParts[2];

        $base64UrlHeader = self::base64UrlEncode($header);
        $base64UrlPayload = self::base64UrlEncode($payload);
        $signatureCheck = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, self::$secret_key, true);
        $base64UrlSignatureCheck = self::base64UrlEncode($signatureCheck);

        if (!hash_equals($base64UrlSignatureCheck, $signatureProvided)) {
            return false;
        }

        $decoded = json_decode($payload, true);
        if (!is_array($decoded)) return false;

        if (isset($decoded['exp']) && time() >= (int)$decoded['exp']) {
            return false;
        }

        return $decoded;
    }

    private static function base64UrlEncode($data) {
        return str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($data));
    }

    private static function base64UrlDecode($data) {
        return str_replace(['-', '_'], ['+', '/'], $data);
    }

    public static function getBearerToken() {
        $headers = getallheaders();
        if (isset($headers['Authorization'])) {
            if (preg_match('/Bearer\s(\S+)/', $headers['Authorization'], $matches)) {
                return $matches[1];
            }
        }
        return null;
    }

    // Returns the decoded JWT payload for the current request, or null if
    // there's no (valid) bearer token. Use for endpoints where auth is optional.
    public static function user() {
        $token = self::getBearerToken();
        $payload = self::validateJWT($token);
        return $payload ?: null;
    }

    // Same as user(), but sends a 401 and stops the request if unauthenticated.
    public static function requireUser() {
        $payload = self::user();
        if (!$payload) {
            Response::error("인증이 필요합니다.", 401);
        }
        return $payload;
    }
}
