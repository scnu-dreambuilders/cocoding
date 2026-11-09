<?php
// backend/api/attendance/index.php
// GET   오늘 출석했는지 + 연속 출석일 + 이번 달 출석한 날 + 코인 잔액
// POST  오늘 출석 도장 찍기 (하루 한 번, 연속일수만큼 보너스 코인)
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/CoinModel.php';
require_once __DIR__ . '/../../models/ProgressModel.php';

$payload = Auth::requireUser();
$userId = (int)$payload['id'];
$coins = new CoinModel();

function attendanceState(CoinModel $coins, $userId, array $extra = []) {
    $today = $coins->todayRow($userId);
    return $extra + [
        'checkedToday' => $today !== null,
        'streak' => $coins->currentStreak($userId),
        'totalDays' => $coins->totalDays($userId),
        'monthDays' => $coins->monthDays($userId),
        'today' => (int)date('j'),
        'daysInMonth' => (int)date('t'),
        'balance' => $coins->balance($userId),
        'todayReward' => $today ? (int)$today['reward_coins'] : 0,
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    Response::success(attendanceState($coins, $userId));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

RateLimiter::limit("attendance:$userId", 30, 3600);
$result = $coins->checkIn($userId);
$progress = new ProgressModel();
if (!$result['already']) $progress->addXp($userId, ProgressModel::XP['attendance']);
$newAchievements = $progress->checkAll($userId);

Response::success(attendanceState($coins, $userId, [
    'already' => $result['already'],
    'earned' => $result['coins'],
    'newAchievements' => $newAchievements,
    'level' => ProgressModel::levelInfo($progress->xp($userId)),
    'message' => $result['already']
        ? '오늘은 이미 출석했어! 내일 또 만나자'
        : "출석 완료! {$result['coins']}코인을 받았어 (연속 {$result['streak']}일)",
]));
