<?php
// backend/api/games/reward.php
// POST  게임존에서 맞힌 개수만큼 코인 받기 (같은 단계는 하루에 한 번만)
// GET   오늘 이미 받은 단계 + 코인 잔액
//
// 요청 (POST)
//   { "game": "typing", "stage": "word"|"block",    "set": 0|1,               "correct": 0~5 }
//   { "game": "quiz",   "stage": "1".."5"|"review", "round": "first"|"retry", "correct": 0~5 }
// 응답 (POST)
//   { success: true, data: { awarded, already, balance, message } }
// 응답 (GET)
//   { success: true, data: { balance, claimed: ["typing:word:0", ...], reward: { typing, quiz } } }
//
// 정한 규칙
//   · 타자게임 정답 1개는 2코인, 복습 퀴즈 정답 1개는 10코인 (CoinModel::GAME_REWARD).
//     퀴즈는 첫 도전(first)이든 오답 재도전(retry)이든 똑같이 10코인이다.
//   · 경험치(xp)는 올리지 않는다. 레벨과 랭킹은 챕터 진도로만 올라가야 한다.
//   · 한 세트가 5문제라서 correct는 0부터 5까지만 받는다.
//   · 같은 단계는 하루에 한 번만. ref 끝에 오늘 날짜를 붙여 두면 coin_log의
//     (user_id, reason, ref) 유니크 키가 두 번째 지급을 알아서 막아준다.
//       타자 → typing:<stage>:<set>:<날짜>     예) typing:word:0:2026-11-19
//       퀴즈 → quiz:<stage>:<round>:<날짜>     예) quiz:review:retry:2026-11-19
//   · game·stage·set·round·correct는 모두 정해진 값만 받는다. 화면에서 버튼을 눌러야만
//     보낼 수 있다고 믿으면, 아무 값이나 넣어 ref를 끝없이 만들어 계속 받을 수 있다.
//   · 날짜는 Logger와 같은 우리 시간대(Asia/Seoul)로 만든다. 서버 시간대를 그대로 쓰는
//     date()를 쓰면 "하루 한 번"의 기준 날짜가 어긋날 수 있다.
//   · 맞힌 게 0개면 받을 코인도 0개다. 이건 잘못된 요청이 아니라 정상 응답으로 awarded: 0.
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/Env.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/CoinModel.php';

// 받아줄 값 목록. 여기 없는 값은 모두 거절한다
$GAME_STAGES = [
    'typing' => ['word', 'block'],
    'quiz' => ['1', '2', '3', '4', '5', 'review'],
];
$QUIZ_ROUNDS = ['first', 'retry'];
$TYPING_SETS = [0, 1];
$MAX_CORRECT = 5; // 한 세트는 5문제

// 오늘 날짜(우리 시간대). Logger가 쓰는 LOG_TIMEZONE을 그대로 따른다
function gameToday() {
    $tz = trim((string)Env::get('LOG_TIMEZONE', ''));
    if ($tz === '') $tz = 'Asia/Seoul';
    try {
        $now = new DateTime('now', new DateTimeZone($tz));
    } catch (Throwable $e) {
        $now = new DateTime('now', new DateTimeZone('Asia/Seoul'));
    }
    return $now->format('Y-m-d');
}

// 숫자·글자 어느 쪽으로 와도 같게 보도록 글자로 맞춘다 (예: 퀴즈 3단계는 3도 "3"도 된다)
function gameWord($value) {
    if (is_string($value)) return trim($value);
    if (is_int($value)) return (string)$value;
    return '';
}

// 0 이상 $max 이하의 정수인지. 정수가 아니면 null (소수·참/거짓·글자는 안 된다)
function gameCount($value, $max) {
    if (is_bool($value) || !is_numeric($value)) return null;
    if ((int)$value != $value) return null; // 3.5처럼 떨어지지 않는 수
    $number = (int)$value;
    if ($number < 0 || $number > $max) return null;
    return $number;
}

$payload = Auth::requireUser();
$userId = (int)$payload['id'];
$coins = new CoinModel();
$today = gameToday();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    Response::success([
        'balance' => $coins->balance($userId),
        'claimed' => $coins->gameClaims($userId, $today),
        'reward' => CoinModel::GAME_REWARD,
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

RateLimiter::limit("game:reward:$userId", 120, 3600, "게임을 너무 빠르게 보내고 있어요. 조금 쉬었다가 다시 해보자!");

$data = json_decode(file_get_contents("php://input"), true) ?? [];
$game = gameWord($data['game'] ?? null);

if (!isset($GAME_STAGES[$game])) {
    Response::error("어떤 게임인지 모르겠어요. 타자게임이나 복습 퀴즈에서 다시 해보자!", 400);
}

$stage = gameWord($data['stage'] ?? null);
if (!in_array($stage, $GAME_STAGES[$game], true)) {
    Response::error("없는 단계예요. 게임존에서 단계를 골라 다시 해보자!", 400);
}

$correct = gameCount($data['correct'] ?? null, $MAX_CORRECT);
if ($correct === null) {
    Response::error("맞힌 개수는 0개부터 {$MAX_CORRECT}개까지만 보낼 수 있어요.", 400);
}

// 게임별로 ref 뒷부분이 다르다 (타자는 세트 번호, 퀴즈는 첫 도전/재도전)
if ($game === 'typing') {
    $set = gameCount($data['set'] ?? null, max($TYPING_SETS));
    if ($set === null || !in_array($set, $TYPING_SETS, true)) {
        Response::error("타자게임 세트는 0번과 1번만 있어요.", 400);
    }
    $ref = "typing:$stage:$set:$today";
} else {
    $round = gameWord($data['round'] ?? null);
    if (!in_array($round, $QUIZ_ROUNDS, true)) {
        Response::error("퀴즈는 첫 도전(first)이나 다시 도전(retry)만 보낼 수 있어요.", 400);
    }
    $ref = "quiz:$stage:$round:$today";
}

$amount = $correct * CoinModel::GAME_REWARD[$game];
// 지급액이 0이면 grant()는 아무것도 넣지 않고 0을 돌려준다 → 이미 받은 것과 섞이지 않게 따로 본다
$awarded = $amount > 0 ? $coins->grant($userId, $amount, 'game', $ref) : 0;
$already = $amount > 0 && $awarded === 0;

if ($amount === 0) {
    $message = "이번엔 맞힌 문제가 없어서 코인은 없어. 다시 해보자!";
} elseif ($already) {
    $message = "이 단계는 오늘 이미 코인을 받았어! 내일 또 받을 수 있어";
} else {
    $message = "잘했어! 코인 {$awarded}개를 받았어";
}

Logger::audit('game.reward', [
    'game' => $game,
    'stage' => $stage,
    'awarded' => $awarded,
]);

Response::success([
    'awarded' => $awarded,
    'already' => $already,
    'balance' => $coins->balance($userId),
    'message' => $message,
]);
