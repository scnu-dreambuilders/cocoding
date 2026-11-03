<?php
// backend/api/social/ranking.php?scope=all|friends|class
// 학습 랭킹. 등수를 앞세우기보다 "또래 평균과 견줘 내가 어디쯤인지"를 보여준다.
// 프로필을 비공개로 한 학생은 목록에 넣지 않고, 본인은 항상 자기 자리를 볼 수 있다.
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../models/ProgressModel.php';

const TOP_N = 10;

$payload = Auth::requireRole(['student']);
$userId = (int)$payload['id'];
$scope = $_GET['scope'] ?? 'all';
$db = Database::getInstance();

// 점수 = 경험치. 같으면 완료한 챕터 수로 가른다
$base = "SELECT u.id, u.username, u.xp,
        (SELECT COUNT(*) FROM user_chapter_progress p WHERE p.user_id = u.id AND p.status = 'completed') AS chapters
    FROM users u";

if ($scope === 'friends') {
    // 나와 서로 팔로우한 친구 + 나
    $sql = "$base
        WHERE u.role = 'student' AND (u.id = :me OR (
            EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = :me2 AND f.following_id = u.id)
            AND EXISTS(SELECT 1 FROM follows b WHERE b.follower_id = u.id AND b.following_id = :me3)))
        ORDER BY u.xp DESC, chapters DESC, u.id ASC";
    $stmt = $db->prepare($sql);
    $stmt->execute([':me' => $userId, ':me2' => $userId, ':me3' => $userId]);
} elseif ($scope === 'class') {
    // 내가 속한 반 친구들
    $sql = "$base
        WHERE u.role = 'student' AND u.id IN (
            SELECT m2.student_id FROM class_members m1
            JOIN class_members m2 ON m2.class_id = m1.class_id
            WHERE m1.student_id = :me)
        ORDER BY u.xp DESC, chapters DESC, u.id ASC";
    $stmt = $db->prepare($sql);
    $stmt->execute([':me' => $userId]);
} else {
    $scope = 'all';
    $sql = "$base
        WHERE u.role = 'student' AND (u.profile_visibility <> 'private' OR u.id = :me)
        ORDER BY u.xp DESC, chapters DESC, u.id ASC";
    $stmt = $db->prepare($sql);
    $stmt->execute([':me' => $userId]);
}

$rows = $stmt->fetchAll();
$total = count($rows);
$sumXp = 0;
$myRank = null;
$list = [];

foreach ($rows as $i => $row) {
    $sumXp += (int)$row['xp'];
    $isMe = (int)$row['id'] === $userId;
    if ($isMe) $myRank = $i + 1;
    if ($i < TOP_N || $isMe) {
        $list[] = [
            'rank' => $i + 1,
            'id' => (int)$row['id'],
            'username' => $row['username'],
            'xp' => (int)$row['xp'],
            'level' => ProgressModel::levelOf($row['xp']),
            'chapters' => (int)$row['chapters'],
            'isMe' => $isMe,
        ];
    }
}
// 내가 10위 밖이면 맨 뒤에 한 번만 붙는다 → 순서 정리
usort($list, function ($a, $b) { return $a['rank'] <=> $b['rank']; });

$myXp = 0;
foreach ($rows as $row) {
    if ((int)$row['id'] === $userId) $myXp = (int)$row['xp'];
}
$average = $total > 0 ? round($sumXp / $total) : 0;

Response::success([
    'scope' => $scope,
    'total' => $total,
    'myRank' => $myRank,
    'myXp' => $myXp,
    'myLevel' => ProgressModel::levelOf($myXp),
    'average' => $average,
    'comparedToAverage' => $myXp - $average,
    'top' => $list,
]);
