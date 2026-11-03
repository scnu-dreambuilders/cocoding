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

    // 학생을 이 반에서 선생님의 다른 반으로 이동 (본인 소유 반 사이에서만 — PATCH 도달 시점엔 항상 $isOwner)
    if (isset($data['move_student_id']) && isset($data['move_to_class_id'])) {
        $moveStudentId = filter_var($data['move_student_id'], FILTER_VALIDATE_INT);
        $moveToClassId = filter_var($data['move_to_class_id'], FILTER_VALIDATE_INT);
        if (!$moveStudentId || !$moveToClassId) {
            Response::error("이동할 학생과 반을 확인해주세요.");
        }
        if ($moveToClassId === (int)$class['id']) {
            Response::error("같은 반으로는 이동할 수 없어요.");
        }
        $target = $classes->findById($moveToClassId);
        // 다른 선생님 반은 존재 여부도 알려주지 않음 (관계없는 반 조회 정책과 동일)
        if (!$target || (int)$target['teacher_id'] !== $userId) {
            Response::error("반을 찾을 수 없어요.", 404);
        }
        if (!$classes->isMember($class['id'], $moveStudentId)) {
            Response::error("이 반의 학생이 아니에요.", 404);
        }
        if ($classes->isMember($moveToClassId, $moveStudentId)) {
            Response::error("이미 해당 반에 등록된 학생이에요.", 409);
        }
        if (count($classes->memberIds($moveToClassId)) >= ClassModel::MAX_MEMBERS) {
            Response::error("반 인원이 가득 찼어요. 선생님께 말씀드려주세요.", 409);
        }
        $classes->moveMember($class['id'], $moveToClassId, $moveStudentId);
        Response::success(["message" => "학생을 반으로 옮겼어요."]);
    }

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
