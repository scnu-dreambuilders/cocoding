<?php
// backend/api/qna/answers/view.php?id=N
// DELETE   답변 삭제 (작성자 본인만)
require_once __DIR__ . '/../../../config/Bootstrap.php';
require_once __DIR__ . '/../../../config/Auth.php';
require_once __DIR__ . '/../../../models/AnswerModel.php';

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
if (!$id) {
    Response::error("답변 ID가 필요합니다.");
}

$payload = Auth::requireUser();
$answerModel = new AnswerModel();
$answer = $answerModel->findById($id);
if (!$answer) {
    Response::error("답변을 찾을 수 없습니다.", 404);
}
if ((int)$answer['user_id'] !== (int)$payload['id']) {
    Response::error("삭제 권한이 없습니다.", 403);
}

$answerModel->delete($id);
Response::success(["message" => "답변 삭제 완료"]);
