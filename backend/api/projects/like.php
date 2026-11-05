<?php
// backend/api/projects/like.php
// POST {id}  공개된 작품에 좋아요 켜고 끄기 (한 사람당 한 번)
// 내 작품에는 누를 수 없고, 보호자 동의 전에는 쓸 수 없다.
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/ProjectModel.php';
require_once __DIR__ . '/../../models/SocialModel.php';
require_once __DIR__ . '/../../models/ProgressModel.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}
$payload = Auth::requireUser();
Auth::requireSharing($payload);
$userId = (int)$payload['id'];
RateLimiter::limit("like:$userId", 120, 3600, "좋아요를 너무 빨리 눌렀어요. 잠시 후 다시 해주세요.");

$data = json_decode(file_get_contents("php://input"), true) ?? [];
$id = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT);

$projects = new ProjectModel();
$project = $id ? $projects->findById($id) : null;
if (!$project || !ProjectModel::isVisibleToOthers($project)) {
    Response::error("공개된 작품만 좋아요를 누를 수 있어요.", 404);
}
if ((int)$project['user_id'] === $userId) {
    Response::error("내 작품에는 좋아요를 누를 수 없어요.", 403);
}

$social = new SocialModel();
$result = $social->toggleLike($id, $userId);

// 좋아요를 받은 쪽에 경험치와 업적
if ($result['liked']) {
    $progress = new ProgressModel();
    $progress->addXp((int)$project['user_id'], ProgressModel::XP['like_received']);
    $progress->checkAll((int)$project['user_id']);
}

Response::success($result);
