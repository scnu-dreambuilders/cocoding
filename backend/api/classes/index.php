<?php
// backend/api/classes/index.php
// GET                 선생님: 내가 만든 반 목록(참여 코드·학생 수) / 학생: 참여한 반 목록
// POST {name}         선생님: 반 만들기 (참여 코드 자동 생성)
// POST {join_code}    학생: 참여 코드로 반에 들어가기
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../config/Validators.php';
require_once __DIR__ . '/../../models/ClassModel.php';

$payload = Auth::requireRole(['student', 'teacher']);
$userId = (int)$payload['id'];
$isTeacher = $payload['role'] === 'teacher';
$classes = new ClassModel();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    Response::success($isTeacher ? $classes->findByTeacher($userId) : $classes->findByStudent($userId));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}
$data = json_decode(file_get_contents("php://input"), true) ?? [];

if ($isTeacher) {
    RateLimiter::limit("class:create:$userId", 20, 3600);
    $error = ClassModel::validateName($data['name'] ?? null);
    if ($error) Response::error($error);
    if ($classes->countByTeacher($userId) >= ClassModel::MAX_CLASSES_PER_TEACHER) {
        Response::error("반은 " . ClassModel::MAX_CLASSES_PER_TEACHER . "개까지 만들 수 있어요.", 409);
    }
    $id = $classes->create($userId, $data['name']);
    Response::success($classes->findById($id), 201);
}

// 학생: 참여 코드 대입을 막기 위해 시도 횟수 제한
RateLimiter::limit("class:join:$userId", 20, 3600, "반 참여를 너무 많이 시도했어요. 잠시 후 다시 시도해주세요.");
$code = Validators::normalizeCode($data['join_code'] ?? null);
$class = strlen($code) === ClassModel::CODE_LENGTH ? $classes->findByCode($code) : null;
if (!$class) {
    Response::error("참여 코드를 찾을 수 없어요. 선생님께 받은 코드를 다시 확인해주세요.", 404);
}
if ($classes->isMember($class['id'], $userId)) {
    Response::error("이미 '{$class['name']}' 반에 들어와 있어요.", 409);
}
if (count($classes->memberIds($class['id'])) >= ClassModel::MAX_MEMBERS) {
    Response::error("반 인원이 가득 찼어요. 선생님께 말씀드려주세요.", 409);
}
$classes->addMember($class['id'], $userId);
Response::success(["id" => (int)$class['id'], "name" => $class['name'], "teacher_name" => $class['teacher_name']], 201);
