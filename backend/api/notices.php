<?php
// backend/api/notices.php — 공지사항 읽기 (학생·선생님·보호자)
//
// GET  올려진 공지 목록. 내 계정 유형에게 보이는 것만, 고정된 것이 위로
//
// 쓰는 쪽은 /api/admin/notices.php (운영자만).
// 초안(published = 0)은 여기서 절대 나오지 않는다.
require_once __DIR__ . '/../config/Bootstrap.php';
require_once __DIR__ . '/../config/Auth.php';
require_once __DIR__ . '/../config/Database.php';

$payload = Auth::requireUser();
$role = $payload['role'];

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

// 한 번에 많이 보여줄 일이 없다. 최근 20개면 충분하다
$stmt = Database::getInstance()->prepare(
    "SELECT id, title, body, pinned, audience, created_at, updated_at
     FROM notices
     WHERE published = 1 AND (audience = 'all' OR audience = ?)
     ORDER BY pinned DESC, id DESC LIMIT 20"
);
$stmt->execute([$role]);

$notices = array_map(function ($n) {
    $n['id'] = (int)$n['id'];
    $n['pinned'] = (int)$n['pinned'] === 1;
    return $n;
}, $stmt->fetchAll());

Response::success(['notices' => $notices]);
