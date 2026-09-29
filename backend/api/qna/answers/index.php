<?php
// backend/api/qna/answers/index.php
// GET ?question_id=N   답변 목록 (비로그인도 조회 가능)
// POST                 답변 작성 (로그인 필요)
require_once __DIR__ . '/../../../config/Bootstrap.php';
require_once __DIR__ . '/../../../config/Auth.php';
require_once __DIR__ . '/../../../config/RateLimiter.php';
require_once __DIR__ . '/../../../models/QuestionModel.php';
require_once __DIR__ . '/../../../models/AnswerModel.php';

$answerModel = new AnswerModel();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $questionId = filter_var($_GET['question_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$questionId) {
        Response::error("질문 ID가 필요합니다.");
    }
    Response::success($answerModel->findByQuestion($questionId));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

$payload = Auth::requireUser();
RateLimiter::limit("qna:answer:create:{$payload['id']}", 20, 3600, "답변을 너무 많이 남겼어요. 잠시 후 다시 시도해주세요.");

$data = json_decode(file_get_contents("php://input"), true) ?? [];
$questionId = filter_var($data['question_id'] ?? null, FILTER_VALIDATE_INT);
$body = is_string($data['body'] ?? null) ? $data['body'] : '';

if (!$questionId || !(new QuestionModel())->findById($questionId)) {
    Response::error("답변할 질문을 찾을 수 없습니다.", 404);
}

$validationError = AnswerModel::validateInput($body);
if ($validationError) {
    Response::error($validationError);
}

$id = $answerModel->create($questionId, $payload['id'], $body);
Response::success(["id" => $id], 201);
