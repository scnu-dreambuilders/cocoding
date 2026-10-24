<?php
// backend/api/chapters/progress.php
// POST {chapter_id, title, blocks_data, thumbnail}
// 정답 제출 → 서버가 제출한 코드를 직접 다시 채점(config/Grader.php) → 도전 횟수 +1, 최고 점수 갱신
// 통과했으면 챕터 완료 + 보상 아이템(최초 1회) + 다음 챕터 잠금 해제 + 완성작 포트폴리오 저장
// 브라우저가 보내는 score/passed는 쓰지 않는다 (조작 방지)
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/Grader.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/ChapterModel.php';
require_once __DIR__ . '/../../models/ItemModel.php';
require_once __DIR__ . '/../../models/ProjectModel.php';

$payload = Auth::requireUser();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}
RateLimiter::limit("chapter:complete:{$payload['id']}", 120, 3600);
// 제출마다 서버에서 채점기를 실행하므로 짧은 시간에 몰아서 보내는 것도 막는다
RateLimiter::limit("chapter:grade:min:{$payload['id']}", 10, 60, "제출을 너무 빨리 했어요. 잠깐 쉬었다가 다시 제출해주세요.");

$data = json_decode(file_get_contents("php://input"), true) ?? [];
$chapterId = filter_var($data['chapter_id'] ?? null, FILTER_VALIDATE_INT);
$userId = $payload['id'];

if (!$chapterId) {
    Response::error("챕터 ID가 필요합니다.");
}

// 제출한 코드 (채점 + 통과 시 포트폴리오 저장)
$blocksData = $data['blocks_data'] ?? null;
$thumbnail = $data['thumbnail'] ?? null;
if ($blocksData === null) {
    Response::error("채점할 코드가 없어요. 화면을 새로고침한 뒤 다시 제출해주세요.");
}

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

$title = is_string($data['title'] ?? null) && trim($data['title']) !== '' ? mb_substr(trim($data['title']), 0, 200) : $chapter['title'];
$err = ProjectModel::validateInput($title, 'chapter', $blocksData) ?? ProjectModel::validateThumbnail($thumbnail);
if ($err) Response::error($err);

try {
    $graded = Grader::grade($chapter['order_num'], $blocksData);
} catch (GraderUnavailableException $e) {
    error_log('[Grader] ' . $e->getMessage());
    Response::error("채점 서버에 문제가 생겼어요. 잠시 후 다시 제출해주세요.", 503);
}
$score = $graded['score'];

// 채점에서 통과하지 못함 → 도전 기록만 남김
if (!$graded['passed']) {
    $record = $chapterModel->recordAttempt($userId, $chapterId, $score);
    Response::success(["passed" => false, "score" => $score] + $record);
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
