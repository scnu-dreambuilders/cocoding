<?php
// backend/config/Cors.php
require_once __DIR__ . '/Env.php';

$DEFAULT_ORIGINS = 'http://localhost:5173,http://localhost:5174,http://localhost:5175';
$allowedOrigins = array_filter(array_map('trim', explode(',', Env::get('ALLOWED_ORIGINS', $DEFAULT_ORIGINS))));
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

// 목록의 포트 자리를 *로 적으면 그 주소의 아무 포트나 허용한다 (예: http://localhost:*).
// 개발 서버가 5173을 못 잡고 5174·5175로 밀려도 가입·로그인이 끊기지 않게 하려는 장치다.
$originAllowed = false;
if ($origin !== '') {
    foreach ($allowedOrigins as $rule) {
        if ($rule === $origin) {
            $originAllowed = true;
            break;
        }
        if (substr($rule, -2) === ':*') {
            $prefix = substr($rule, 0, -1); // 'http://localhost:'
            $port = substr($origin, strlen($prefix));
            if (strncmp($origin, $prefix, strlen($prefix)) === 0 && $port !== '' && ctype_digit($port)) {
                $originAllowed = true;
                break;
            }
        }
    }
}

if ($originAllowed) {
    header("Access-Control-Allow-Origin: $origin");
}
// 허용되지 않은 주소에도 Vary는 붙인다 — 중간 캐시가 한 주소의 응답을 다른 주소에 재사용하지 않도록
header('Vary: Origin');
header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit;
}
