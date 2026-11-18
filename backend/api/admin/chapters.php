<?php
// backend/api/admin/chapters.php — 관리자 웹: 챕터 내용 관리
//
// GET  전체 챕터 + 학생 몇 명이 하고 있는지
// GET  ?id=N                     챕터 1개
// PUT  ?id=N { title, concept, mission, new_blocks, required_blocks, reward_item }
//
// 챕터를 새로 만들거나 지우는 길은 두지 않았다. 챕터 수와 번호는 화면 코드
// (frontend/src/data/chapterLogic.js 의 CHAPTER_COUNT)와 맞춰져 있어서, DB 에서만
// 늘리면 화면이 그 챕터를 그릴 수 없다. 글자(제목·개념·미션)와 보상만 고칠 수 있다.
//
// 블록 id 목록(new_blocks·required_blocks)도 고칠 수 있게 뒀지만, 아는 블록인지
// 서버에서 확인한다. 모르는 블록을 넣으면 그 챕터의 채점이 영원히 통과하지 못한다.
//
// 정한 규칙
//   · 이미 그 챕터를 하고 있는 학생 수를 함께 돌려준다. 미션이나 필요한 블록을 바꾸면
//     진행 중인 학생의 채점 결과가 달라지므로, 화면에서 경고를 띄울 수 있게 한다.
//   · 이미 끝낸 학생의 진행 기록은 건드리지 않는다. 다시 풀게 만들지 않는다.
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/Logger.php';
require_once __DIR__ . '/../../models/AdminModel.php';
require_once __DIR__ . '/../../models/BoardModel.php'; // 아는 블록 목록(KNOWN_BLOCKS)을 쓴다

$admin = Auth::requireAdmin();
$adminId = (int)$admin['id'];
$model = new AdminModel();
$method = $_SERVER['REQUEST_METHOD'];
$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);

if ($method === 'GET') {
    if ($id) {
        $chapter = $model->chapter($id);
        if (!$chapter) Response::error("그런 챕터가 없어요.", 404);
        Response::success(['chapter' => $chapter, 'usage' => $model->chapterUsage($id),
            'knownBlocks' => BoardModel::KNOWN_BLOCKS]);
    }
    $chapters = $model->chapters();
    $usage = [];
    foreach ($chapters as $c) { $usage[$c['id']] = $model->chapterUsage($c['id']); }
    Response::success(['chapters' => $chapters, 'usage' => $usage,
        'knownBlocks' => BoardModel::KNOWN_BLOCKS]);
}

if ($method !== 'PUT') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

if (!$id) Response::error("어떤 챕터인지 알려주세요.", 400);
if (!$model->chapter($id)) Response::error("그런 챕터가 없어요.", 404);

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];

$changes = [];

$texts = ['title' => 100, 'concept' => 2000, 'mission' => 2000, 'reward_item' => 100];
foreach ($texts as $field => $max) {
    if (!array_key_exists($field, $data)) continue;
    $value = is_string($data[$field]) ? trim($data[$field]) : '';
    if ($field === 'reward_item') {
        // 보상 아이템은 비워둘 수 있다 (보상 없는 챕터)
        if (mb_strlen($value) > $max) Response::error("보상 아이템 이름이 너무 길어요.", 400);
        $changes[$field] = $value === '' ? null : $value;
        continue;
    }
    if ($value === '' || mb_strlen($value) > $max) {
        Response::error("$field 는 1~{$max}자로 써주세요.", 400);
    }
    $changes[$field] = $value;
}

// 블록 목록 — 아는 블록만, 중복 없이
foreach (['new_blocks', 'required_blocks'] as $field) {
    if (!array_key_exists($field, $data)) continue;
    if (!is_array($data[$field])) Response::error("$field 는 블록 id 배열로 보내주세요.", 400);
    $clean = [];
    foreach ($data[$field] as $b) {
        if (!is_string($b)) Response::error("$field 에 글자가 아닌 값이 있어요.", 400);
        if (!in_array($b, BoardModel::KNOWN_BLOCKS, true)) {
            Response::error("모르는 블록이 들어 있어요: " . mb_substr($b, 0, 30), 400);
        }
        if (!in_array($b, $clean, true)) $clean[] = $b;
    }
    if ($field === 'required_blocks' && !$clean) {
        // 필요한 블록이 하나도 없으면 무엇을 해도 통과한다
        Response::error("채점에 필요한 블록은 하나 이상 골라주세요.", 400);
    }
    $changes[$field] = json_encode($clean, JSON_UNESCAPED_UNICODE);
}

if (!$changes) Response::error("바꿀 내용이 없어요.", 400);

$changed = $model->updateChapter($id, $changes);
Logger::admin('admin.chapter.update', ['by' => $adminId, 'chapter' => $id, 'fields' => $changed]);

$usage = $model->chapterUsage($id);
$message = '챕터를 고쳤어요.';
if ($usage['inProgress'] > 0 && (isset($changes['required_blocks']) || isset($changes['mission']))) {
    $message .= " 지금 이 챕터를 하고 있는 학생이 {$usage['inProgress']}명 있어요.";
}

Response::success(['chapter' => $model->chapter($id), 'usage' => $usage, 'message' => $message]);
