<?php
// backend/api/admin/notices.php — 관리자 웹: 공지사항 쓰기·고치기·지우기
//
// GET    ?page=1            전체 목록 (초안까지 보인다)
// GET    ?id=N              공지 1개
// POST   { title, body, pinned?, published?, audience? }   새 공지
// PATCH  ?id=N { ... }      고치기 (보낸 항목만)
// DELETE ?id=N              지우기
//
// 학생·선생님·보호자가 보는 쪽은 /api/notices.php (로그인만 필요, 읽기만)
//
// 정한 규칙
//   · published 를 꺼두면 초안이다. 운영자만 보이고 학생 화면에는 안 나온다.
//     급한 공지를 쓰다 말고 저장해도 학생에게 반쯤 쓴 글이 보이지 않게 하려는 것이다.
//   · audience 로 받는 사람을 고른다. all 이면 모두, student/teacher/guardian 이면 그 역할만.
//   · pinned 는 맨 위 고정. 여러 개를 고정해도 되고, 고정끼리는 최신 순이다.
//   · 공지는 지우면 되돌릴 수 없다. 대신 published 를 끄면 학생에게만 안 보이게 할 수 있다.
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/Logger.php';
require_once __DIR__ . '/../../models/AdminModel.php';

$admin = Auth::requireAdmin();
$adminId = (int)$admin['id'];
$model = new AdminModel();
$method = $_SERVER['REQUEST_METHOD'];
$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);

const NOTICE_MAX_TITLE = 80;
const NOTICE_MAX_BODY = 2000;
const NOTICE_AUDIENCES = ['all', 'student', 'teacher', 'guardian'];

/* 보낸 값 검사. $need 가 true 면 제목·내용이 반드시 있어야 한다 (새 공지) */
function noticeFields(array $data, $need) {
    $out = [];

    if ($need || array_key_exists('title', $data)) {
        $title = is_string($data['title'] ?? null) ? trim($data['title']) : '';
        if ($title === '' || mb_strlen($title) > NOTICE_MAX_TITLE) {
            Response::error("제목은 1~" . NOTICE_MAX_TITLE . "자로 써주세요.", 400);
        }
        $out['title'] = $title;
    }

    if ($need || array_key_exists('body', $data)) {
        $body = is_string($data['body'] ?? null) ? trim($data['body']) : '';
        if ($body === '' || mb_strlen($body) > NOTICE_MAX_BODY) {
            Response::error("내용은 1~" . NOTICE_MAX_BODY . "자로 써주세요.", 400);
        }
        $out['body'] = $body;
    }

    foreach (['pinned', 'published'] as $flag) {
        if (array_key_exists($flag, $data)) {
            if (!is_bool($data[$flag])) Response::error("$flag 는 true/false 로 보내주세요.", 400);
            $out[$flag] = $data[$flag] ? 1 : 0;
        }
    }

    if (array_key_exists('audience', $data)) {
        if (!in_array($data['audience'], NOTICE_AUDIENCES, true)) {
            Response::error("받는 사람은 all·student·teacher·guardian 중에 골라주세요.", 400);
        }
        $out['audience'] = $data['audience'];
    }

    return $out;
}

if ($method === 'GET') {
    if ($id) {
        $notice = $model->notice($id);
        if (!$notice) Response::error("그런 공지가 없어요.", 404);
        Response::success(['notice' => $notice]);
    }
    $page = min(500, max(1, (int)($_GET['page'] ?? 1)));
    Response::success($model->notices($page) + ['audiences' => NOTICE_AUDIENCES]);
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];

if ($method === 'POST') {
    $fields = noticeFields($data, true);
    // 안 보낸 것은 기본값으로
    $fields += ['pinned' => 0, 'published' => 1, 'audience' => 'all'];
    $newId = $model->createNotice($fields, $adminId);
    Logger::admin('admin.notice.create', ['by' => $adminId, 'notice' => $newId,
        'published' => (bool)$fields['published']]);
    Response::success([
        'notice' => $model->notice($newId),
        'message' => $fields['published'] ? '공지를 올렸어요.' : '초안으로 저장했어요.',
    ], 201);
}

if (!$id) Response::error("어떤 공지인지 알려주세요.", 400);
if (!$model->notice($id)) Response::error("그런 공지가 없어요.", 404);

if ($method === 'PATCH') {
    $fields = noticeFields($data, false);
    if (!$fields) Response::error("바꿀 내용이 없어요.", 400);
    $changed = $model->updateNotice($id, $fields);
    Logger::admin('admin.notice.update', ['by' => $adminId, 'notice' => $id, 'fields' => $changed]);
    Response::success(['notice' => $model->notice($id), 'message' => '공지를 고쳤어요.']);
}

if ($method === 'DELETE') {
    $model->deleteNotice($id);
    Logger::admin('admin.notice.delete', ['by' => $adminId, 'notice' => $id]);
    Response::success(['message' => '공지를 지웠어요.']);
}

Response::error("잘못된 요청 방식입니다.", 405);
