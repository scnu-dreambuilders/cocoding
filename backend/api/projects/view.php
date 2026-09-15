<?php
// backend/api/projects/view.php?id=N
// GET 작품 열기 (공개 작품 또는 내 작품) / PUT 수정 / DELETE 삭제
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../models/ProjectModel.php';

$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
if (!$id) {
    Response::error("프로젝트 ID가 필요합니다.");
}

$projectModel = new ProjectModel();
$project = $projectModel->findById($id);

if (!$project) {
    Response::error("프로젝트를 찾을 수 없습니다.", 404);
}

$payload = Auth::user();
$isOwner = $payload && (int)$payload['id'] === (int)$project['user_id'];
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'PUT') {
    if (!$isOwner) {
        Response::error("수정 권한이 없습니다.", 403);
    }
    $data = json_decode(file_get_contents("php://input"), true) ?? [];
    $fields = [];

    if (array_key_exists('title', $data)) $fields['title'] = is_string($data['title']) ? trim($data['title']) : '';
    if (array_key_exists('blocks_data', $data)) $fields['blocks_data'] = $data['blocks_data'];
    if (array_key_exists('is_public', $data)) $fields['is_public'] = (bool)$data['is_public'];
    if (array_key_exists('thumbnail', $data)) $fields['thumbnail_url'] = $data['thumbnail'];

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

if (!$project['is_public'] && !$isOwner) {
    Response::error("열람 권한이 없습니다.", 403);
}
$project['is_owner'] = $isOwner;
Response::success($project);
