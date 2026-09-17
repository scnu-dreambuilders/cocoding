<?php
// backend/api/projects/view.php?id=N
// GET 작품 열기 (내 작품, 또는 로그인한 사용자에게 공개 작품) / PUT 수정 / DELETE 삭제
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/ProjectModel.php';

$payload = Auth::requireUser();

$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
if (!$id) {
    Response::error("프로젝트 ID가 필요합니다.");
}

$projectModel = new ProjectModel();
$project = $projectModel->findById($id);

$isOwner = $project && (int)$payload['id'] === (int)$project['user_id'];
// 볼 권한이 없으면 "없는 작품"과 같은 응답 (비공개 작품 id 존재 여부를 알 수 없게)
if (!$project || (!$isOwner && !ProjectModel::isVisibleToOthers($project))) {
    Response::error("프로젝트를 찾을 수 없습니다.", 404);
}
// 친구 작품 열기는 보호자 동의가 끝난 뒤에만
if (!$isOwner) {
    Auth::requireSharing($payload);
}
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'PUT') {
    if (!$isOwner) {
        Response::error("수정 권한이 없습니다.", 403);
    }
    RateLimiter::limit("project:update:{$payload['id']}", 240, 3600, "저장을 너무 자주 했어요. 잠시 후 다시 시도해주세요.");
    $data = json_decode(file_get_contents("php://input"), true) ?? [];
    $fields = [];

    if (array_key_exists('title', $data)) $fields['title'] = is_string($data['title']) ? trim($data['title']) : '';
    if (array_key_exists('blocks_data', $data)) $fields['blocks_data'] = $data['blocks_data'];
    if (array_key_exists('is_public', $data)) $fields['is_public'] = (bool)$data['is_public'];
    if (array_key_exists('allow_remake', $data)) $fields['allow_remake'] = (bool)$data['allow_remake'];
    if (array_key_exists('thumbnail', $data)) $fields['thumbnail_url'] = $data['thumbnail'];

    if (!empty($fields['is_public'])) {
        Auth::requireSharing($payload);
    }
    if (!empty($fields['is_public']) && $project['report_hidden']) {
        Response::error("신고가 여러 번 들어와서 공개할 수 없는 작품이에요. 선생님께 문의해주세요.", 403);
    }

    $validationError = ProjectModel::validateInput(
        $fields['title'] ?? $project['title'],
        $project['track'],
        $fields['blocks_data'] ?? $project['blocks_data']
    ) ?? ProjectModel::validateThumbnail($fields['thumbnail_url'] ?? null);
    if ($validationError) {
        Response::error($validationError);
    }

    $projectModel->update($id, $fields);
    Response::success(["message" => "프로젝트 수정 완료"]);
}

if ($method === 'DELETE') {
    if (!$isOwner) {
        Response::error("삭제 권한이 없습니다.", 403);
    }
    $projectModel->delete($id);
    Response::success(["message" => "프로젝트 삭제 완료"]);
}

$project['is_owner'] = $isOwner;
Response::success($project);
