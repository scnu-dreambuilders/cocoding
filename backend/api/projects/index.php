<?php
// backend/api/projects/index.php
// GET               내 작품 목록 (포트폴리오)
// GET ?public=1[&sort=popular]  친구 작품 / 인기 작품 목록 — 로그인한 사용자만 (아이들 작품·목소리 보호), 보호자 동의 전이면 403
// POST              자유 창작 작품 저장 (첫 저장 시 꾸미기 아이템 보상)
// POST {remake_of}  공개 작품 리메이크 (복사 후 내 작품으로) — 작가가 리메이크를 허용한 작품만
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/ProjectModel.php';
require_once __DIR__ . '/../../models/ItemModel.php';
require_once __DIR__ . '/../../models/CoinModel.php';
require_once __DIR__ . '/../../models/ProgressModel.php';

$payload = Auth::requireRole(['student']);
$userId = $payload['id'];
$projectModel = new ProjectModel();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!empty($_GET['public'])) {
        Auth::requireSharing($payload);
        $page = min(100, max(1, (int)($_GET['page'] ?? 1)));
        // sort=popular 이면 좋아요 많은 순 (인기 작품)
        $sort = ($_GET['sort'] ?? '') === 'popular' ? 'popular' : 'recent';
        Response::success($projectModel->findPublic($page, $sort, $userId));
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

$data = Response::input();

/* ── 리메이크 ─────────────────────────────── */
if (isset($data['remake_of'])) {
    $original = $projectModel->findById(filter_var($data['remake_of'], FILTER_VALIDATE_INT) ?: 0);
    if (!$original) {
        Response::error("원본 작품을 찾을 수 없습니다.", 404);
    }
    $isOwn = (int)$original['user_id'] === (int)$userId;
    // 신고로 숨겨진 작품을 복사하면 새 작품은 숨김이 풀린 채 만들어져서 다시 공개할 수 있었다
    if (!empty($original['report_hidden'])) {
        Response::error("신고로 숨겨진 작품은 복사할 수 없어요. 운영자에게 문의해주세요.", 403);
    }
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

// 저장과 보상을 한 묶음으로 처리한다. 보상 단계에서 오류가 나면 작품도 저장되지 않은 것으로 되돌려서,
// 화면에는 실패로 보이는데 작품은 남아 다시 누를 때마다 복사본이 쌓이는 일이 없게 한다.
// 학생 행을 잠그는 것은 '오늘 몇 번 받았나' 확인과 지급 사이에 다른 저장 요청이 끼어들지 못하게 하려는 것이다
$db = Database::getInstance();
$db->beginTransaction();
try {
$db->prepare("SELECT id FROM users WHERE id = ? FOR UPDATE")->execute([$userId]);

$projectId = $projectModel->create($userId, $title, $blocksData, 'free', null, $thumbnail);

// 자유 창작 보상: 저장 → 포트폴리오 등록 → 꾸미기 아이템 1개 + 코인 (둘 다 하루 제한)
$reward = (new ItemModel())->grantRandomFreeReward($userId);
// 코인은 작품 번호로 중복을 막는데, 새 작품은 번호가 늘 새것이다. 만들고 지우기를 되풀이하면
// 끝없이 받을 수 있어서, 아이템과 같은 하루 횟수로 묶는다
$stmt = $db->prepare("SELECT COUNT(*) FROM coin_log WHERE user_id = ? AND reason = 'project' AND created_at >= ?");
$stmt->execute([$userId, AppTime::today() . ' 00:00:00']);
$coinsEarned = (int)$stmt->fetchColumn() < ItemModel::FREE_SAVE_DAILY_LIMIT
    ? (new CoinModel())->grant($userId, CoinModel::amount('project'), 'project', (string)$projectId)
    : 0;
$progressModel = new ProgressModel();
if ($coinsEarned > 0) $progressModel->addXp($userId, ProgressModel::XP['project']);

    $db->commit();
} catch (Throwable $e) {
    if ($db->inTransaction()) $db->rollBack();
    throw $e;
}

Response::success([
    "id" => $projectId,
    "rewardItem" => $reward,
    "rewardEmoji" => $reward ? ItemModel::info($reward)['emoji'] : null,
    "coinsEarned" => $coinsEarned,
    "newAchievements" => $progressModel->checkAll($userId),
], 201);
