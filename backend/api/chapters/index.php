<?php
// backend/api/chapters/index.php
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../models/ChapterModel.php';
require_once __DIR__ . '/../../models/ItemModel.php';

$payload = Auth::user();

$chapterModel = new ChapterModel();
$chapters = $chapterModel->findAll();

foreach ($chapters as &$chapter) {
    $chapter['reward_emoji'] = ItemModel::info($chapter['reward_item'])['emoji'];
}
unset($chapter);

if ($payload) {
    $chapters = $chapterModel->withStatus($chapters, $payload['id']);
}

Response::success($chapters);
