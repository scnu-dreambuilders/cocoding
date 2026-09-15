<?php
// backend/config/Bootstrap.php
// Common entrypoint: 보안 헤더, CORS, JSON error responses for any uncaught error/exception.
require_once __DIR__ . '/Response.php';

// API는 JSON만 돌려주므로 가장 엄격하게: 다른 사이트에 끼워 넣기·MIME 추측·리퍼러 노출 금지
header_remove('X-Powered-By');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');

require_once __DIR__ . '/Cors.php';

set_exception_handler(function ($e) {
    error_log($e);
    if ($e instanceof DatabaseConnectionException) {
        // 가장 흔한 설치 문제: .env의 DB 포트/계정/비밀번호가 실제 DB와 다름
        Response::error('데이터베이스에 연결할 수 없습니다. backend/.env의 DB_HOST·DB_PORT·DB_USER·DB_PASS를 확인하거나 setup-db.bat을 실행해주세요.', 503);
    }
    Response::error('서버 오류가 발생했습니다.', 500);
});

set_error_handler(function ($severity, $message, $file, $line) {
    if (!(error_reporting() & $severity)) return false; // @로 의도적으로 숨긴 경고는 무시
    throw new ErrorException($message, 0, $severity, $file, $line);
});
