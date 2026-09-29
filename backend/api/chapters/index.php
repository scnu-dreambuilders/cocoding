<?php
// backend/api/chapters/index.php
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../models/ChapterModel.php';
require_once __DIR__ . '/../../models/ItemModel.php';

// 게스트 자유창작(EditorPage)은 이 endpoint를 호출하지 않음(학생 로그인 후 대시보드에서만 사용) — student 전용으로 제한
$payload = Auth::requireRole(['student']);

$chapterModel = new ChapterModel();
$chapters = $chapterModel->findAll();

foreach ($chapters as &$chapter) {
    $chapter['reward_emoji'] = ItemModel::info($chapter['reward_item'])['emoji'];
}
unset($chapter);

$chapters = $chapterModel->withStatus($chapters, $payload['id']);

Response::success($chapters);
