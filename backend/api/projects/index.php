<?php
// backend/api/projects/index.php
// GET               내 작품 목록 (포트폴리오)
// GET ?public=1     친구 작품 목록 — 로그인한 사용자만 (아이들 작품·목소리 보호), 보호자 동의 전이면 403
// POST              자유 창작 작품 저장 (첫 저장 시 꾸미기 아이템 보상)
// POST {remake_of}  공개 작품 리메이크 (복사 후 내 작품으로) — 작가가 리메이크를 허용한 작품만
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/ProjectModel.php';
require_once __DIR__ . '/../../models/ItemModel.php';

$payload = Auth::requireUser();
$userId = $payload['id'];
$projectModel = new ProjectModel();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!empty($_GET['public'])) {
        Auth::requireSharing($payload);
        $page = min(100, max(1, (int)($_GET['page'] ?? 1)));
        Response::success($projectModel->findPublic($page));
    }
    Response::success($projectModel->findByUser($userId));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

// 저장 공간 보호: 1시간에 30개 / 한 사람 최대 50개
RateLimiter::limit("project:create:$userId", 30, 3600, "작품을 너무 많이 만들었어요. 잠시 후 다시 시도해주세요.");
if ($projectModel->countByUser($userId) >= ProjectModel::MAX_PROJECTS_PER_USER) {
    Response::error("작품은 " . ProjectModel::MAX_PROJECTS_PER_USER . "개까지 저장할 수 있어요. 안 쓰는 작품을 지워주세요.", 409);
}

$data = json_decode(file_get_contents("php://input"), true) ?? [];

/* ── 리메이크 ─────────────────────────────── */
if (isset($data['remake_of'])) {
    $original = $projectModel->findById(filter_var($data['remake_of'], FILTER_VALIDATE_INT) ?: 0);
    if (!$original) {
        Response::error("원본 작품을 찾을 수 없습니다.", 404);
    }
    $isOwn = (int)$original['user_id'] === (int)$userId;
    if (!$isOwn) {
        Auth::requireSharing($payload);
        if (!ProjectModel::isVisibleToOthers($original)) {
            Response::error("공개된 작품만 리메이크할 수 있습니다.", 403);
        }
        if (!$original['allow_remake']) {
            Response::error("작가가 리메이크를 허용하지 않은 작품이에요.", 403);
        }
    }
    $title = mb_substr($original['title'], 0, ProjectModel::MAX_TITLE_LENGTH - 8) . ' (리메이크)';
    $newId = $projectModel->create($userId, $title, $original['blocks_data'], 'free', null, $original['thumbnail_url']);
    if (!$isOwn) {
        $projectModel->recordRemake($original['id'], $newId);
    }
    Response::success(["id" => $newId], 201);
}

/* ── 새 작품 저장 ─────────────────────────── */
// 챕터 완성작은 chapters/progress.php에서만 만든다 → 여기서는 항상 자유 창작
$title = is_string($data['title'] ?? null) ? trim($data['title']) : '제목 없는 프로젝트';
$blocksData = $data['blocks_data'] ?? [];
$thumbnail = $data['thumbnail'] ?? null;

$validationError = ProjectModel::validateInput($title, 'free', $blocksData) ?? ProjectModel::validateThumbnail($thumbnail);
if ($validationError) {
    Response::error($validationError);
}

$projectId = $projectModel->create($userId, $title, $blocksData, 'free', null, $thumbnail);

// 자유 창작 보상: 저장 → 포트폴리오 등록 → 꾸미기 아이템 1개 (하루 제한)
$reward = (new ItemModel())->grantRandomFreeReward($userId);

Response::success([
    "id" => $projectId,
    "rewardItem" => $reward,
    "rewardEmoji" => $reward ? ItemModel::info($reward)['emoji'] : null,
], 201);
