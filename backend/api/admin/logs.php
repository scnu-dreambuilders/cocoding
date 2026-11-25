<?php
// backend/api/admin/logs.php — 관리자 웹: 운영 기록 보기
//
// GET  ?channel=admin&date=2026-11-20&q=&limit=200
//        channel  admin | audit | error | access  (기본 admin)
//        date     없으면 오늘. 있는 날짜만 고를 수 있게 dates 를 함께 돌려준다
//        q        이 글자가 들어간 줄만 (쉬운 찾기)
//        limit    최근 몇 줄까지 (기본 200, 최대 1000)
//
// 운영 기록은 Storage::runtimePath('logs') 아래에 하루 한 파일, 한 줄에 한 건(JSON)으로 쌓인다.
// 이 API 는 그 파일을 읽어서 최근 줄부터 돌려준다.
//
// 정한 규칙
//   · 파일을 처음부터 다 메모리에 올리지 않는다. 뒤에서부터 필요한 만큼만 읽는다.
//     운영을 오래 하면 access 로그가 수십 MB 가 되는데, 그걸 통째로 올리면 서버가 멈춘다.
//   · 채널·날짜는 정해진 값만 받는다. 파일 이름을 그대로 쓰면 ../ 로 아무 파일이나
//     읽어낼 수 있다.
//   · 기록 자체에는 이미 개인정보가 없다 (사용자는 번호, 접속 지점은 되돌릴 수 없는 해시).
//     그래도 운영자만 볼 수 있게 막는다.
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/Env.php';
require_once __DIR__ . '/../../config/Storage.php';

Auth::requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

const LOG_CHANNELS = ['admin', 'audit', 'error', 'access'];
const LOG_DEFAULT_LIMIT = 200;
const LOG_MAX_LIMIT = 1000;
const LOG_READ_BYTES = 1048576; // 뒤에서부터 최대 1MB 만 읽는다

function logDir() {
    $dir = trim((string)Env::get('LOG_DIR', ''));
    $dir = $dir === '' ? Storage::runtimePath('logs') : Storage::resolve($dir);
    return is_dir($dir) ? $dir : null;
}

/* 파일 뒤쪽 $bytes 만 읽어서 줄 배열로. 맨 앞 조각난 줄은 버린다 */
function tailLines($path, $bytes) {
    $size = filesize($path);
    $fh = @fopen($path, 'rb');
    if (!$fh) return [];
    $from = max(0, $size - $bytes);
    if ($from > 0) fseek($fh, $from);
    $text = (string)stream_get_contents($fh);
    fclose($fh);
    $lines = explode("\n", $text);
    if ($from > 0) array_shift($lines); // 중간부터 읽어서 잘린 첫 줄
    return array_values(array_filter($lines, function ($l) { return trim($l) !== ''; }));
}

$dir = logDir();
if ($dir === null) {
    Response::success(['channel' => 'admin', 'date' => null, 'dates' => [], 'lines' => [],
        'message' => '기록 폴더가 아직 없어요.']);
}

$channel = $_GET['channel'] ?? 'admin';
if (!in_array($channel, LOG_CHANNELS, true)) {
    Response::error("기록 종류는 admin·audit·error·access 중에 골라주세요.", 400);
}

// 이 채널에 어떤 날짜가 있는지 (화면에서 날짜를 고를 수 있게)
$dates = [];
foreach (glob($dir . '/' . $channel . '-*.log') ?: [] as $file) {
    if (preg_match('/-(\d{4}-\d{2}-\d{2})\.log$/', $file, $m)) $dates[] = $m[1];
}
rsort($dates);

$date = $_GET['date'] ?? '';
if ($date === '') {
    $date = $dates ? $dates[0] : date('Y-m-d');
} elseif (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$date)) {
    // 날짜 모양이 아니면 파일 이름을 조작하려는 것으로 본다
    Response::error("날짜는 2026-11-20 처럼 보내주세요.", 400);
}

$limit = (int)($_GET['limit'] ?? LOG_DEFAULT_LIMIT);
$limit = max(1, min(LOG_MAX_LIMIT, $limit));
$q = isset($_GET['q']) && is_string($_GET['q']) ? trim($_GET['q']) : '';

$path = $dir . '/' . $channel . '-' . $date . '.log';
$lines = [];
$fileSize = 0;
if (is_file($path)) {
    $fileSize = (int)filesize($path);
    $raw = tailLines($path, LOG_READ_BYTES);
    if ($q !== '') {
        $raw = array_values(array_filter($raw, function ($l) use ($q) {
            return mb_stripos($l, $q) !== false;
        }));
    }
    // 최근 것이 위로 오게
    $raw = array_reverse($raw);
    $raw = array_slice($raw, 0, $limit);
    foreach ($raw as $line) {
        $parsed = json_decode($line, true);
        // 줄이 깨져 있어도 화면이 멈추지 않게, 원문도 함께 준다
        $lines[] = is_array($parsed) ? $parsed : ['raw' => mb_substr($line, 0, 500)];
    }
}

Response::success([
    'channel' => $channel,
    'date' => $date,
    'dates' => $dates,
    'channels' => LOG_CHANNELS,
    'lines' => $lines,
    'count' => count($lines),
    'fileSize' => $fileSize,
    // 파일이 1MB 보다 크면 뒤쪽 1MB 안에서만 찾았다는 뜻 — 화면에 알려줘야 한다
    'truncated' => $fileSize > LOG_READ_BYTES,
    'retentionDays' => (int)Env::get('LOG_RETENTION_DAYS', 30),
]);
