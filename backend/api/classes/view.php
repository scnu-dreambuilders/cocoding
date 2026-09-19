<?php
// backend/api/classes/view.php?id=N
// GET                        선생님(반 주인): 반 정보 + 학생별 학습 진도
// PATCH {name}               선생님: 반 이름 바꾸기
// PATCH {regenerate_code}    선생님: 참여 코드 새로 만들기
// DELETE                     선생님: 반 삭제 / 학생: 반에서 나가기
// DELETE &student_id=M       선생님: 학생을 반에서 빼기
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/ClassModel.php';
require_once __DIR__ . '/../../models/StudentProgress.php';

$payload = Auth::requireRole(['student', 'teacher']);
$userId = (int)$payload['id'];
$classes = new ClassModel();

$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
$class = $id ? $classes->findById($id) : null;
$isOwner = $class && (int)$class['teacher_id'] === $userId;
$isMember = $class && !$isOwner && $payload['role'] === 'student' && $classes->isMember($class['id'], $userId);
// 관계없는 반은 존재 여부도 알려주지 않음
if (!$isOwner && !$isMember) {
    Response::error("반을 찾을 수 없어요.", 404);
}
$method = $_SERVER['REQUEST_METHOD'];

if ($isMember) {
    if ($method !== 'DELETE') Response::error("반을 찾을 수 없어요.", 404);
    $classes->removeMember($class['id'], $userId);
    Response::success(["message" => "반에서 나왔어요."]);
}

if ($method === 'GET') {
    Response::success([
        "id" => (int)$class['id'],
        "name" => $class['name'],
        "join_code" => $class['join_code'],
        "created_at" => $class['created_at'],
        "students" => StudentProgress::summarize($classes->memberIds($class['id'])),
    ]);
}

if ($method === 'PATCH') {
    RateLimiter::limit("class:update:$userId", 60, 3600);
    $data = json_decode(file_get_contents("php://input"), true) ?? [];
    if (!empty($data['regenerate_code'])) {
        $classes->regenerateCode($class['id']);
    }
    if (array_key_exists('name', $data)) {
        $error = ClassModel::validateName($data['name']);
        if ($error) Response::error($error);
        $classes->rename($class['id'], $data['name']);
    }
    $fresh = $classes->findById($class['id']);
    Response::success(["id" => (int)$fresh['id'], "name" => $fresh['name'], "join_code" => $fresh['join_code']]);
}

if ($method === 'DELETE') {
    if (isset($_GET['student_id'])) {
        $studentId = filter_var($_GET['student_id'], FILTER_VALIDATE_INT);
        if (!$studentId || !$classes->removeMember($class['id'], $studentId)) {
            Response::error("이 반의 학생이 아니에요.", 404);
        }
        Response::success(["message" => "학생을 반에서 뺐어요."]);
    }
    $classes->delete($class['id']);
    Response::success(["message" => "반을 삭제했어요."]);
}

Response::error("잘못된 요청 방식입니다.", 405);
