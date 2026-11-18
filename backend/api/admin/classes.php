<?php
// backend/api/admin/classes.php — 관리자 웹: 선생님 반과 과제 보기·정리
//
// GET    ?page=1&q=                반 목록 (q: 반 이름 또는 선생님 닉네임)
// GET    ?id=N                     반 1개 + 학생 명단 + 과제 목록
// DELETE ?id=N                     반 지우기 (학생 명단·과제도 함께 사라진다)
// DELETE ?assignment=N             과제 하나 지우기
//
// 반을 만들고 과제를 내는 것은 선생님이 하는 일이다. 이 API 는 운영자가 들여다보고
// 정리하는 용도다. 그래서 만들거나 고치는 길은 두지 않았다 — 운영자가 남의 반에
// 과제를 내면 선생님이 왜 생겼는지 알 수 없다.
//
// 정한 규칙
//   · 반을 지우면 class_members·class_assignments 가 외래키로 함께 지워진다.
//     학생 계정이나 작품은 지워지지 않는다.
//   · 참가 코드(join_code)는 그대로 보여준다. 선생님이 코드를 잊었을 때 알려줘야 한다.
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/Logger.php';
require_once __DIR__ . '/../../models/AdminModel.php';

$admin = Auth::requireAdmin();
$adminId = (int)$admin['id'];
$model = new AdminModel();
$method = $_SERVER['REQUEST_METHOD'];
$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
$assignmentId = filter_var($_GET['assignment'] ?? null, FILTER_VALIDATE_INT);

if ($method === 'GET') {
    if ($id) {
        $detail = $model->classDetail($id);
        if (!$detail) Response::error("그런 반이 없어요.", 404);
        Response::success($detail);
    }
    $page = min(500, max(1, (int)($_GET['page'] ?? 1)));
    $q = isset($_GET['q']) && is_string($_GET['q']) ? trim($_GET['q']) : '';
    Response::success($model->classes($page, $q));
}

if ($method !== 'DELETE') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

if ($assignmentId) {
    if (!$model->deleteAssignment($assignmentId)) {
        Response::error("그런 과제가 없어요.", 404);
    }
    Logger::admin('admin.assignment.delete', ['by' => $adminId, 'assignment' => $assignmentId]);
    Response::success(['message' => '과제를 지웠어요.']);
}

if (!$id) Response::error("어떤 반인지 알려주세요.", 400);
if (!$model->deleteClass($id)) Response::error("그런 반이 없어요.", 404);

Logger::admin('admin.class.delete', ['by' => $adminId, 'class' => $id]);
Response::success(['message' => '반을 지웠어요. 학생 계정과 작품은 그대로예요.']);
