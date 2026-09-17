<?php
// backend/api/guardian/children.php — 보호자 전용
// GET                        연결된 자녀들의 학습 진도
// POST {code}                동의 코드 확인 → 어떤 자녀인지(닉네임) 먼저 보여줌
// POST {code, agree: true}   개인정보 수집·이용에 동의하고 자녀 계정과 연결 → 자녀의 공유 기능이 열림
// DELETE ?student_id=N       연결 끊기 (동의한 보호자가 아무도 없으면 동의 철회 → 자녀 작품 비공개)
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../config/Validators.php';
require_once __DIR__ . '/../../models/UserModel.php';
require_once __DIR__ . '/../../models/GuardianModel.php';
require_once __DIR__ . '/../../models/StudentProgress.php';

$payload = Auth::requireRole(['guardian']);
$guardianId = (int)$payload['id'];
$guardians = new GuardianModel();
$users = new UserModel();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    Response::success(StudentProgress::summarize($guardians->studentIds($guardianId)));
}

if ($method === 'POST') {
    // 동의 코드 대입 방지 (코드 확인·동의 모두 포함)
    RateLimiter::limit("guardian:code:$guardianId", 20, 3600, "코드를 너무 많이 입력했어요. 잠시 후 다시 시도해주세요.");
    $data = json_decode(file_get_contents("php://input"), true) ?? [];
    $code = Validators::normalizeCode($data['code'] ?? null);
    $child = strlen($code) === 8 ? $users->findPendingByConsentCode($code) : null;
    if (!$child) {
        Response::error("동의 코드를 찾을 수 없어요. 아이 화면에 보이는 8자리 코드를 다시 확인해주세요.", 404);
    }

    if (($data['agree'] ?? false) !== true) {
        Response::success(["username" => $child['username'], "birth_year" => (int)$child['birth_year']]);
    }

    if (count($guardians->studentIds($guardianId)) >= GuardianModel::MAX_CHILDREN) {
        Response::error("자녀 계정은 " . GuardianModel::MAX_CHILDREN . "개까지 연결할 수 있어요.", 409);
    }
    $db = Database::getInstance();
    $db->beginTransaction();
    try {
        $guardians->link($guardianId, $child['id']);
        $users->grantConsent($child['id']);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
    Response::success(["message" => "{$child['username']} 계정에 동의하고 연결했어요.", "student_id" => (int)$child['id']], 201);
}

if ($method === 'DELETE') {
    $studentId = filter_var($_GET['student_id'] ?? null, FILTER_VALIDATE_INT);
    if (!$studentId || !$guardians->isLinked($guardianId, $studentId)) {
        Response::error("연결된 자녀가 아니에요.", 404);
    }
    $db = Database::getInstance();
    $db->beginTransaction();
    try {
        $guardians->unlink($guardianId, $studentId);
        $revoked = $guardians->guardianCount($studentId) === 0;
        if ($revoked) $users->revokeConsent($studentId);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
    Response::success([
        "message" => $revoked
            ? "연결을 끊고 동의를 철회했어요. 아이의 공개 작품은 비공개로 바뀌었어요."
            : "연결을 끊었어요.",
        "consentRevoked" => $revoked,
    ]);
}

Response::error("잘못된 요청 방식입니다.", 405);
