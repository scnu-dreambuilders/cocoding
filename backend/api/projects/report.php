<?php
// backend/api/projects/report.php
// POST {id, reason} 친구 작품 신고 — 서로 다른 3명이 신고하면 자동으로 비공개
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/ProjectModel.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}
$payload = Auth::requireUser();
RateLimiter::limit("project:report:{$payload['id']}", 20, 3600, "신고를 너무 많이 했어요. 잠시 후 다시 시도해주세요.");

$data = json_decode(file_get_contents("php://input"), true) ?? [];
$id = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT);
$reason = $data['reason'] ?? '';
if (!$id || !in_array($reason, ProjectModel::REPORT_REASONS, true)) {
    Response::error("신고할 작품과 이유를 골라주세요.");
}

$projectModel = new ProjectModel();
$project = $projectModel->findById($id);
if (!$project || !ProjectModel::isVisibleToOthers($project)) {
    Response::error("프로젝트를 찾을 수 없습니다.", 404);
}
if ((int)$project['user_id'] === (int)$payload['id']) {
    Response::error("내 작품은 신고할 수 없어요.");
}

$result = $projectModel->report($id, $payload['id'], $reason);
if ($result === false) {
    Response::error("이미 신고한 작품이에요.", 409);
}
Response::success(["message" => "신고가 접수됐어요. 고마워요!", "hidden" => $result['hidden']]);
