<?php
// backend/api/social/profile.php
// GET  ?id=N   다른 학생 프로필 보기 (공개 범위에 따라 거부)
// GET          내 프로필 (레벨·경험치·업적·좋아요·팔로워)
// PATCH {bio, profile_visibility}  내 소개말·공개 범위 바꾸기
// POST {follow:id} / {unfollow:id}  팔로우 켜고 끄기
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/UserModel.php';
require_once __DIR__ . '/../../models/SocialModel.php';
require_once __DIR__ . '/../../models/ProgressModel.php';
require_once __DIR__ . '/../../models/ProjectModel.php';
require_once __DIR__ . '/../../models/ItemModel.php';

const MAX_BIO = 50;
const VISIBILITY = ['public', 'friends', 'private'];

$payload = Auth::requireUser();
$userId = (int)$payload['id'];
$social = new SocialModel();
$progress = new ProgressModel();
$users = new UserModel();
$db = Database::getInstance();

// 프로필에 담을 공개 정보 (이메일·태어난 해는 절대 넣지 않는다)
function publicProfile($row, SocialModel $social, ProgressModel $progress, $viewerId) {
    $id = (int)$row['id'];
    $counts = $social->counts($id);
    $items = (new ItemModel())->findByUser($id);
    return [
        'id' => $id,
        'username' => $row['username'],
        'bio' => $row['bio'],
        'role' => $row['role'],
        'visibility' => $row['profile_visibility'],
        'isMe' => $id === (int)$viewerId,
        'isFollowing' => $social->isFollowing($viewerId, $id),
        'isFriend' => $social->isFriend($viewerId, $id),
        'followers' => $counts['followers'],
        'following' => $counts['following'],
        'likesReceived' => $social->likesReceived($id),
        'equipped' => array_values(array_filter($items, function ($i) { return (int)$i['equipped'] === 1; })),
        'achievements' => array_values(array_filter($progress->earned($id), function ($a) { return $a['earned']; })),
    ] + ProgressModel::levelInfo($row['xp']);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $targetId = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT) ?: $userId;
    $stmt = $db->prepare("SELECT id, username, role, bio, xp, profile_visibility FROM users WHERE id = ?");
    $stmt->execute([$targetId]);
    $row = $stmt->fetch();
    if (!$row) {
        Response::error("사용자를 찾을 수 없어요.", 404);
    }
    if (!$social->canViewProfile($userId, $row)) {
        Response::error("이 친구는 프로필을 공개하지 않았어요.", 403);
    }

    $profile = publicProfile($row, $social, $progress, $userId);
    $profile['projects'] = $targetId === $userId ? [] : (new ProjectModel())->findPublicByUser($targetId);
    if ($targetId === $userId) {
        $profile['friends'] = $social->friends($userId);
        $profile['followingOnly'] = $social->followingOnly($userId);
        $profile['allAchievements'] = $progress->earned($userId);
        $profile['activity'] = $progress->activity($userId);
    }
    Response::success($profile);
}

if ($_SERVER['REQUEST_METHOD'] === 'PATCH') {
    RateLimiter::limit("profile:update:$userId", 30, 3600);
    $data = json_decode(file_get_contents("php://input"), true) ?? [];

    if (array_key_exists('bio', $data)) {
        $bio = is_string($data['bio']) ? trim($data['bio']) : '';
        if (mb_strlen($bio) > MAX_BIO) {
            Response::error("소개말은 " . MAX_BIO . "자까지 쓸 수 있어요.");
        }
        // 아이들이 실수로 올리기 쉬운 연락처는 막는다
        if (preg_match('/\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}/', $bio) || preg_match('/[\w.+-]+@[\w-]+\.[\w.]+/', $bio)) {
            Response::error("소개말에 전화번호나 이메일은 쓸 수 없어요.");
        }
        $db->prepare("UPDATE users SET bio = ? WHERE id = ?")->execute([$bio === '' ? null : $bio, $userId]);
    }

    if (array_key_exists('profile_visibility', $data)) {
        if (!in_array($data['profile_visibility'], VISIBILITY, true)) {
            Response::error("공개 범위를 다시 골라주세요.");
        }
        $db->prepare("UPDATE users SET profile_visibility = ? WHERE id = ?")->execute([$data['profile_visibility'], $userId]);
    }

    $stmt = $db->prepare("SELECT id, username, role, bio, xp, profile_visibility FROM users WHERE id = ?");
    $stmt->execute([$userId]);
    Response::success(publicProfile($stmt->fetch(), $social, $progress, $userId));
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    Auth::requireSharing($payload);
    RateLimiter::limit("follow:$userId", 60, 3600);
    $data = json_decode(file_get_contents("php://input"), true) ?? [];

    $followId = filter_var($data['follow'] ?? null, FILTER_VALIDATE_INT);
    $unfollowId = filter_var($data['unfollow'] ?? null, FILTER_VALIDATE_INT);

    if ($unfollowId) {
        $social->unfollow($userId, $unfollowId);
        Response::success(["message" => "팔로우를 취소했어요.", "following" => false]);
    }
    if (!$followId || $followId === $userId) {
        Response::error("팔로우할 친구를 찾을 수 없어요.", 404);
    }
    $stmt = $db->prepare("SELECT id, role, profile_visibility FROM users WHERE id = ?");
    $stmt->execute([$followId]);
    $target = $stmt->fetch();
    if (!$target || $target['role'] !== 'student') {
        Response::error("학생 계정만 팔로우할 수 있어요.", 404);
    }
    if ($target['profile_visibility'] === 'private') {
        Response::error("이 친구는 프로필을 비공개로 해두었어요.", 403);
    }
    if (!$social->follow($userId, $followId)) {
        Response::error("팔로우는 " . SocialModel::MAX_FOLLOWING . "명까지 할 수 있어요.", 409);
    }
    $progress->checkAll($userId);
    $progress->checkAll($followId);
    Response::success([
        "message" => $social->isFriend($userId, $followId) ? "서로 팔로우해서 친구가 됐어요!" : "팔로우했어요.",
        "following" => true,
        "friend" => $social->isFriend($userId, $followId),
    ]);
}

Response::error("잘못된 요청 방식입니다.", 405);
