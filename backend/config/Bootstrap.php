<?php
// backend/config/Bootstrap.php
// Common entrypoint: 보안 헤더, CORS, JSON error responses for any uncaught error/exception.
require_once __DIR__ . '/Response.php';
require_once __DIR__ . '/Logger.php';
require_once __DIR__ . '/AppTime.php';

// PHP와 DB가 같은 날짜를 쓰도록 기준 시간대를 먼저 맞춘다 (DB 쪽은 Database.php에서)
AppTime::apply();

// 요청 하나를 추적할 번호를 만들고, 끝날 때 접근 기록을 남기도록 걸어둔다
Logger::init();

// API는 JSON만 돌려주므로 가장 엄격하게: 다른 사이트에 끼워 넣기·MIME 추측·리퍼러 노출 금지
header_remove('X-Powered-By');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('Cache-Control: no-store');

require_once __DIR__ . '/Cors.php';

// 내 PC에서 띄운 요청인지 — 설치 안내를 보여줘도 되는 자리인지 가른다.
// Host 머리글은 보내는 쪽이 마음대로 적을 수 있으니 접속한 주소까지 같이 본다.
// 둘 다 내 PC여야 한다.
function isLocalRequest() {
    $loopback = ['localhost', '127.0.0.1', '::1', '[::1]'];
    $host = strtolower(preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? '')));
    $addr = (string)($_SERVER['REMOTE_ADDR'] ?? '');
    return in_array($host, $loopback, true) && in_array($addr, $loopback, true);
}

// 기록에 남길 오류 문구에서 개인정보를 가린다.
// DB의 중복 키 오류는 "Duplicate entry 'kid@example.com' for key 'email'" 처럼 값을 그대로 담는다
function safeLogMessage($message) {
    $message = preg_replace("/Duplicate entry '.*?' for key/su", "Duplicate entry '<가림>' for key", (string)$message);
    return (string)preg_replace('/[\w.+-]+@[\w-]+\.[\w.-]+/u', '<이메일>', (string)$message);
}

set_exception_handler(function ($e) {
    $message = safeLogMessage($e->getMessage());
    // 예외를 통째로 찍으면 스택에 함수 인자(DB 비밀번호 등)가 함께 찍힐 수 있다. 위치만 남긴다
    $where = [];
    foreach (array_slice($e->getTrace(), 0, 8) as $frame) {
        if (isset($frame['file'])) $where[] = basename($frame['file']) . ':' . ($frame['line'] ?? '?');
    }
    error_log(get_class($e) . ': ' . $message . ' @ ' . basename($e->getFile()) . ':' . $e->getLine()
        . ($where ? ' < ' . implode(' < ', $where) : ''));
    Logger::error('exception', [
        'type' => get_class($e),
        'msg' => mb_substr($message, 0, 300),
        'file' => basename($e->getFile()),
        'line' => $e->getLine(),
    ]);
    // 같은 요청이 거의 동시에 두 번 온 경우(가입 버튼 두 번, 같은 닉네임으로 동시에 변경, 상점 두 번 구매)
    // 뒤에 온 쪽이 유니크 키에 걸린다. 서버 고장이 아니므로 500 대신 409 로 알려준다
    if ($e instanceof PDOException && strpos($e->getMessage(), 'Duplicate entry') !== false) {
        Response::error('이미 처리됐거나 다른 사람이 먼저 쓴 값이에요. 새로고침한 뒤 다시 확인해주세요.', 409);
    }
    if ($e instanceof DatabaseConnectionException) {
        // 가장 흔한 설치 문제는 .env의 DB 포트/계정/비밀번호가 실제 DB와 다른 것이다.
        // 그 안내는 내 PC에서 띄웠을 때만 보여준다. 실제 서버에서 설정 파일 이름과
        // 항목 이름을 그대로 돌려주면, 로그인하지 않은 사람에게 서버 구성을 알려주는 셈이 된다.
        if (isLocalRequest()) {
            Response::error('데이터베이스에 연결할 수 없습니다. backend/.env의 DB_HOST·DB_PORT·DB_USER·DB_PASS를 확인하거나 setup-db.bat을 실행해주세요.', 503);
        }
        Response::error('지금은 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.', 503);
    }
    Response::error('서버 오류가 발생했습니다.', 500);
});

set_error_handler(function ($severity, $message, $file, $line) {
    if (!(error_reporting() & $severity)) return false; // @로 의도적으로 숨긴 경고는 무시
    throw new ErrorException($message, 0, $severity, $file, $line);
});
