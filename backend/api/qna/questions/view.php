<?php
// backend/api/qna/questions/view.php?id=N
// GET      질문 상세 (비로그인도 조회 가능)
// DELETE   질문 삭제 (작성자 본인만)
require_once __DIR__ . '/../../../config/Bootstrap.php';
require_once __DIR__ . '/../../../config/Auth.php';
require_once __DIR__ . '/../../../models/QuestionModel.php';

$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
if (!$id) {
    Response::error("질문 ID가 필요합니다.");
}

$questionModel = new QuestionModel();
$question = $questionModel->findById($id);
if (!$question) {
    Response::error("질문을 찾을 수 없습니다.", 404);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $payload = Auth::requireUser();
    if ((int)$question['user_id'] !== (int)$payload['id']) {
        Response::error("삭제 권한이 없습니다.", 403);
    }
    $questionModel->delete($id);
    Response::success(["message" => "질문 삭제 완료"]);
}

Response::success($question);
