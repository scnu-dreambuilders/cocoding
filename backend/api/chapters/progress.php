<?php
// backend/api/chapters/progress.php
// POST {chapter_id, score, passed, title, blocks_data, thumbnail}
// 정답 제출(자동 채점 결과) 기록 → 도전 횟수 +1, 최고 점수 갱신
// 통과했으면 챕터 완료 + 보상 아이템(최초 1회) + 다음 챕터 잠금 해제 + 완성작 포트폴리오 저장
// (score/passed 없이 보내는 예전 클라이언트는 통과로 처리)
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/ChapterModel.php';
require_once __DIR__ . '/../../models/ItemModel.php';
require_once __DIR__ . '/../../models/ProjectModel.php';

$payload = Auth::requireUser();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}
RateLimiter::limit("chapter:complete:{$payload['id']}", 120, 3600);

$data = json_decode(file_get_contents("php://input"), true) ?? [];
$chapterId = filter_var($data['chapter_id'] ?? null, FILTER_VALIDATE_INT);
$userId = $payload['id'];

if (!$chapterId) {
    Response::error("챕터 ID가 필요합니다.");
}

$score = null;
if (isset($data['score'])) {
    $score = filter_var($data['score'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => 100]]);
    if ($score === false) Response::error("점수는 0~100 사이여야 합니다.");
}
$passed = !array_key_exists('passed', $data) || $data['passed'] === true;

$chapterModel = new ChapterModel();
$itemModel = new ItemModel();
$projectModel = new ProjectModel();

$chapter = $chapterModel->findById($chapterId);
if (!$chapter) {
    Response::error("존재하지 않는 챕터입니다.", 404);
}

// 잠긴 챕터는 완료할 수 없음 (앞 챕터를 먼저 완료해야 함)
$status = $chapterModel->getStatus($userId, $chapter);
if ($status === 'locked') {
    Response::error("이전 챕터를 먼저 완료해주세요.", 403);
}
$alreadyCompleted = $status === 'completed';

// 채점에서 통과하지 못함 → 도전 기록만 남김
if (!$passed) {
    $record = $chapterModel->recordAttempt($userId, $chapterId, $score);
    Response::success(["passed" => false, "score" => $score] + $record);
}

// 완성작 (선택) — 포트폴리오 저장용
$blocksData = $data['blocks_data'] ?? null;
$thumbnail = $data['thumbnail'] ?? null;
$title = is_string($data['title'] ?? null) && trim($data['title']) !== '' ? mb_substr(trim($data['title']), 0, 200) : $chapter['title'];
if ($blocksData !== null) {
    $err = ProjectModel::validateInput($title, 'chapter', $blocksData) ?? ProjectModel::validateThumbnail($thumbnail);
    if ($err) Response::error($err);
}

$db = Database::getInstance();
$db->beginTransaction();
try {
    $record = $chapterModel->recordAttempt($userId, $chapterId, $score);
    $chapterModel->updateProgress($userId, $chapterId, 'completed');

    $rewardGranted = $itemModel->grant($userId, $chapter['reward_item']);

    // 다음 챕터 잠금 해제 (이미 완료한 챕터를 되돌리지 않음)
    $nextChapter = $chapterModel->findByOrder($chapter['order_num'] + 1);
    if ($nextChapter) {
        $chapterModel->unlock($userId, $nextChapter['id']);
    }

    // 포트폴리오: 챕터당 작품 하나 — 다시 완료하면 최신 작품으로 갱신
    $portfolioId = null;
    if ($blocksData !== null) {
        $portfolioId = $projectModel->findChapterProject($userId, $chapterId);
        if ($portfolioId) {
            $projectModel->update($portfolioId, ['title' => $title, 'blocks_data' => $blocksData, 'thumbnail_url' => $thumbnail]);
        } else {
            $portfolioId = $projectModel->create($userId, $title, $blocksData, 'chapter', $chapterId, $thumbnail);
        }
    }
    $db->commit();
} catch (Throwable $e) {
    $db->rollBack();
    throw $e;
}

Response::success([
    "passed" => true,
    "score" => $score,
    "bestScore" => $record['bestScore'],
    "attempts" => $record['attempts'],
    "message" => "챕터 완료!",
    "rewardItem" => $chapter['reward_item'],
    "rewardEmoji" => ItemModel::info($chapter['reward_item'])['emoji'],
    "rewardGranted" => (bool)$rewardGranted,
    "alreadyCompleted" => $alreadyCompleted,
    "nextChapterId" => $nextChapter ? (int)$nextChapter['id'] : null,
    "portfolioId" => $portfolioId,
    "portfolioSaved" => $portfolioId !== null,
]);
