<?php
// backend/api/qna/questions/index.php
// GET                 질문 목록 (비로그인도 조회 가능) — ?category=, ?q=(키워드) 옵션
// POST                질문 작성 (로그인 필요)
require_once __DIR__ . '/../../../config/Bootstrap.php';
require_once __DIR__ . '/../../../config/Auth.php';
require_once __DIR__ . '/../../../config/RateLimiter.php';
require_once __DIR__ . '/../../../models/QuestionModel.php';

$questionModel = new QuestionModel();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $category = isset($_GET['category']) && $_GET['category'] !== '' ? $_GET['category'] : null;
    if ($category !== null && !in_array($category, QuestionModel::CATEGORIES, true)) {
        Response::error("올바른 카테고리가 아닙니다.");
    }
    $keyword = isset($_GET['q']) ? trim((string)$_GET['q']) : null;
    Response::success($questionModel->findAll($category, $keyword));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

$payload = Auth::requireUser();
RateLimiter::limit("qna:question:create:{$payload['id']}", 10, 3600, "질문을 너무 많이 올렸어요. 잠시 후 다시 시도해주세요.");

$data = json_decode(file_get_contents("php://input"), true) ?? [];
$category = is_string($data['category'] ?? null) ? $data['category'] : '';
$title = is_string($data['title'] ?? null) ? $data['title'] : '';
$body = is_string($data['body'] ?? null) ? $data['body'] : '';

$validationError = QuestionModel::validateInput($category, $title, $body);
if ($validationError) {
    Response::error($validationError);
}

$id = $questionModel->create($payload['id'], $category, $title, $body);
Response::success(["id" => $id], 201);
