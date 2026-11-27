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
//   · 타자게임 정답 1개는 2코인, 복습 퀴즈 정답 1개는 10코인이 기본이다.
//     관리자 웹의 운영 기준값(coin.game.typing, coin.game.quiz)으로 바꿀 수 있다.
//     퀴즈는 첫 도전(first)이든 오답 재도전(retry)이든 똑같이 10코인이다.
//     다만 재도전은 틀린 문제만 다시 푸는 것이라, 한 단계에서 첫 도전과 재도전을 합쳐 5문제치까지만 받는다.
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

// 오늘 날짜. 출석과 같은 기준 시간대(APP_TIMEZONE)를 쓴다.
// 따로 계산하면 출석의 하루와 게임 보상의 하루가 어긋날 수 있다
function gameToday() {
    return AppTime::today();
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
        // 화면이 "정답 하나에 몇 코인"을 보여줄 때 쓰는 값. 관리자 웹에서 바꾼 기준값이 그대로 나간다
        'reward' => ['typing' => CoinModel::gameAmount('typing'), 'quiz' => CoinModel::gameAmount('quiz')],
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

RateLimiter::limit("game:reward:$userId", 120, 3600, "게임을 너무 빠르게 보내고 있어요. 조금 쉬었다가 다시 해보자!");

$data = Response::input();
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

$amount = $correct * CoinModel::gameAmount($game);
// 퀴즈 재도전은 첫 도전에서 틀린 문제만 다시 푼다. 그러니 첫 도전과 재도전에서 받는 코인을 합쳐도
// 한 세트(5문제)치를 넘을 수 없다. 화면을 거치지 않고 '첫 도전 5개, 재도전 5개'를 보내 두 배로 받는 것을 막는다.
// 서버는 문제를 직접 채점하지 않으므로 맞힌 개수 자체는 확인할 수 없다. 대신 정직하게 다 맞힌 학생보다
// 더 받을 수는 없게 한다
// 어느 쪽을 먼저 보내든 같아야 하므로(재도전을 먼저 보내고 첫 도전을 보내는 경우) 양쪽 모두에서 본다
$cappedOut = false; // 한 세트치를 이미 다 받아서 이번에 줄 것이 없는 경우
if ($game === 'quiz' && $amount > 0) {
    $other = $round === 'first' ? 'retry' : 'first';
    $stmt = Database::getInstance()->prepare("SELECT COALESCE(SUM(amount), 0) FROM coin_log WHERE user_id = ? AND reason = 'game' AND ref = ?");
    $stmt->execute([$userId, "quiz:$stage:$other:$today"]);
    $amount = max(0, min($amount, $MAX_CORRECT * CoinModel::gameAmount($game) - (int)$stmt->fetchColumn()));
    $cappedOut = $amount === 0;
}
// 지급액이 0이면 grant()는 아무것도 넣지 않고 0을 돌려준다 → 이미 받은 것과 섞이지 않게 따로 본다
$awarded = $amount > 0 ? $coins->grant($userId, $amount, 'game', $ref) : 0;
$already = ($amount > 0 && $awarded === 0) || $cappedOut;

if ($amount === 0 && !$cappedOut) {
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
