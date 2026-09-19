<?php
// backend/api/auth/me.php
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/UserModel.php';

$payload = Auth::requireUser();

$userModel = new UserModel();
$user = $userModel->findById($payload['id']);

if (!$user) {
    Response::error("사용자를 찾을 수 없습니다.", 404);
}

// 설문 정보 업데이트 (PATCH 요청인 경우)
if ($_SERVER['REQUEST_METHOD'] === 'PATCH') {
    RateLimiter::limit("me:update:{$user['id']}", 30, 3600);
    $data = json_decode(file_get_contents("php://input"), true);

    $level = array_key_exists('level', $data ?? []) ? $data['level'] : $user['level'];
    if (!is_int($level) || $level < 1 || $level > 3) {
        Response::error("level은 1~3 사이의 정수여야 합니다.");
    }

    $tags = array_key_exists('tags', $data ?? []) ? $data['tags'] : ($user['tags'] ?? []);
    if (!is_array($tags) || count($tags) > 10) {
        Response::error("tags는 10개 이하의 문자열 배열이어야 합니다.");
    }
    $validCategories = array_keys(json_decode(file_get_contents(__DIR__ . '/../../data/topics.json'), true));
    foreach ($tags as $tag) {
        if (!is_string($tag) || !in_array($tag, $validCategories, true)) {
            Response::error("알 수 없는 관심사 태그입니다.");
        }
    }

    $userModel->updateSurvey($user['id'], $level, $tags);
    $user = $userModel->findById($user['id']);
}

Response::success($user);
