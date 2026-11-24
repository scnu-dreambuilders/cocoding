<?php
// backend/api/admin/moderation.php — 관리자 웹: 신고된 글·작품 관리
//
// GET   ?target=post|project&page=1        신고가 쌓인 것 + 이미 숨겨진 것 목록
// GET   ?target=post|project&id=N          신고 이유 + 글 내용(댓글 포함) 또는 작품 정보
// PATCH ?target=post|project&id=N { "hidden": true|false }   숨기기 / 복구
//
// 정한 규칙
//   · 신고가 기준 수(기준값 report.hide_count)에 닿으면 서비스가 자동으로 숨긴다.
//     이 API 는 운영자가 그 판단을 뒤집거나, 기준에 닿지 않은 것을 미리 숨기는 데 쓴다.
//   · 복구할 때 신고 기록은 지우지 않는다. 왜 숨겨졌는지 남아 있어야 다음 판단을 할 수 있다.
//     다만 신고 기록이 남아 있어도 자동으로 다시 숨겨지지는 않는다 — 자동 숨김은 새 신고가
//     들어올 때만 판단하기 때문이다.
//   · 글을 지우는 기능은 두지 않았다. 숨기면 작성자 말고는 볼 수 없고, 지우면 되돌릴 수 없다.
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/Logger.php';
require_once __DIR__ . '/../../config/Settings.php';
require_once __DIR__ . '/../../models/AdminModel.php';

$admin = Auth::requireAdmin();
$adminId = (int)$admin['id'];
$model = new AdminModel();
$method = $_SERVER['REQUEST_METHOD'];

$target = $_GET['target'] ?? 'post';
if (!in_array($target, ['post', 'project'], true)) {
    Response::error("post 또는 project 중에 골라주세요.", 400);
}
$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);

if ($method === 'GET') {
    if ($id) {
        if (!$model->targetExists($target, $id)) Response::error("그런 글이 없어요.", 404);
        // 숨긴 뒤에도 내용을 볼 수 있어야 복구할지 판단할 수 있다.
        // 작품은 blocks_data 를 빼고 제목·무대 캡처만 준다 (수백 KB 를 실어 보내지 않는다)
        Response::success([
            'target' => $target,
            'id' => $id,
            'reasons' => $model->reportReasons($target, $id),
        ] + ($model->reportedContent($target, $id) ?: []));
    }
    $page = min(500, max(1, (int)($_GET['page'] ?? 1)));
    Response::success($model->reported($target, $page) + [
        'target' => $target,
        'hideCount' => Settings::int('report.hide_count'),
    ]);
}

if ($method !== 'PATCH') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

if (!$id) Response::error("어떤 글인지 알려주세요.", 400);
if (!$model->targetExists($target, $id)) Response::error("그런 글이 없어요.", 404);

$data = Response::input();
if (!is_array($data) || !array_key_exists('hidden', $data) || !is_bool($data['hidden'])) {
    Response::error("hidden 을 true 또는 false 로 보내주세요.", 400);
}

$model->setHidden($target, $id, $data['hidden']);
Logger::admin('admin.moderation', [
    'by' => $adminId,
    'target' => $target,
    'id' => $id,
    'hidden' => $data['hidden'],
]);

Response::success([
    'message' => $data['hidden'] ? '숨겼어요.' : '다시 보이게 했어요.',
    'hidden' => $data['hidden'],
]);
