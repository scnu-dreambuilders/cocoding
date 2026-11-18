<?php
// backend/api/admin/users.php — 관리자 웹: 회원 관리
//
// GET    ?page=1&q=&role=&state=     회원 목록 (q: 닉네임·이메일, role: student|teacher|guardian,
//                                     state: suspended|admin|pending)
// GET    ?id=N                       회원 1명 + 활동 요약
// PATCH  ?id=N { ... }               회원 상태 바꾸기 (아래 참고)
// DELETE ?id=N                       회원 탈퇴 처리 (되돌릴 수 없음)
//
// PATCH 로 보낼 수 있는 것 (보낸 항목만 바뀐다)
//   role: 'student'|'teacher'|'guardian'   계정 유형
//   is_admin: true|false                   운영자 권한
//   suspended: true|false                  계정 정지 / 해제
//   suspended_reason: '문자열'              정지 사유 (학생 화면에 보인다, 100자)
//   consent: 'granted'                     보호자 동의를 운영자가 대신 승인
//   force_logout: true                     이 사람의 모든 토큰 무효화
//   email: 'a@b.com'                       이메일 바꾸기 (다른 사람이 쓰고 있으면 거절)
//   coins_delta: 10 | -10                  코인 더하기·빼기 (coin_log 에 남는다)
//   xp_delta: 10 | -10                     경험치 더하기·빼기
//   reset_password: true                   임시 비밀번호 발급 (응답에 한 번만 보인다)
//
// 정한 규칙
//   · 운영자는 자기 계정의 운영자 권한을 뺄 수 없고, 자기 계정을 정지·탈퇴시킬 수 없다.
//     실수로 관리자 웹에 아무도 못 들어가는 상태를 만들지 않기 위해서다.
//   · 마지막 운영자의 권한도 뺄 수 없다 (위와 같은 이유).
//   · 역할을 선생님으로 바꿀 때 소속이 비어 있으면 그대로 둔다. 소속은 선생님이 직접 적는 값이다.
//   · 정지를 풀면 사유도 함께 지운다.
//   · 모든 변경은 운영 기록(admin-날짜.log)에 남는다. 이메일·닉네임·비밀번호는 남기지 않고
//     번호만 남긴다.
//   · 코인은 users.coins 를 바로 고치지 않고 coin_log 를 거친다. 나중에 "왜 늘었나"를
//     되짚을 수 있어야 한다. 코인·경험치는 0 밑으로 내려가지 않는다.
//   · 임시 비밀번호는 응답에 딱 한 번 담아 보낸다. 서버는 해시만 저장하므로 다시 볼 수 없다.
//     메일을 쓰지 않는 환경(MAIL_ENABLED=false)에서도 비밀번호를 잊은 학생을 도울 수
//     있어야 해서 이렇게 했다. 발급하면 그 계정의 토큰도 끊는다..
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/Logger.php';
require_once __DIR__ . '/../../models/AdminModel.php';
require_once __DIR__ . '/../../models/UserModel.php';

$admin = Auth::requireAdmin();
$adminId = (int)$admin['id'];
$model = new AdminModel();
$method = $_SERVER['REQUEST_METHOD'];
$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);

if ($method === 'GET') {
    if ($id) {
        $user = $model->user($id);
        if (!$user) Response::error("그런 회원이 없어요.", 404);
        Response::success(['user' => $user, 'summary' => $model->userSummary($id)]);
    }
    $page = min(500, max(1, (int)($_GET['page'] ?? 1)));
    Response::success($model->users($page, $_GET));
}

if ($method !== 'PATCH' && $method !== 'DELETE') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

if (!$id) Response::error("어떤 회원인지 알려주세요.", 400);
$target = $model->user($id);
if (!$target) Response::error("그런 회원이 없어요.", 404);

/* ── 탈퇴 처리 ──────────────────────────────── */
if ($method === 'DELETE') {
    if ($id === $adminId) {
        Response::error("자기 계정은 여기서 지울 수 없어요. 내 정보 화면에서 해주세요.", 400);
    }
    if ($target['is_admin']) {
        Response::error("운영자 권한을 먼저 빼고 지워주세요.", 400);
    }
    (new UserModel())->delete($id);
    Logger::admin('admin.user.delete', ['target' => $id, 'by' => $adminId]);
    Response::success(['message' => '회원을 지웠어요.']);
}

/* ── 상태 바꾸기 ────────────────────────────── */
$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];

$changes = [];   // DB 컬럼 => 값
$extras = [];    // 기록에 남길 추가 동작

if (array_key_exists('role', $data)) {
    if (!in_array($data['role'], UserModel::ROLES, true)) {
        Response::error("계정 유형을 다시 골라주세요.", 400);
    }
    $changes['role'] = $data['role'];
}

if (array_key_exists('is_admin', $data)) {
    if (!is_bool($data['is_admin'])) Response::error("운영자 권한은 true/false 로 보내주세요.", 400);
    if ($data['is_admin'] === false) {
        if ($id === $adminId) {
            Response::error("자기 운영자 권한은 뺄 수 없어요. 다른 운영자에게 부탁해주세요.", 400);
        }
        if ($target['is_admin'] && $model->adminCount() <= 1) {
            Response::error("운영자가 한 명뿐이라 권한을 뺄 수 없어요.", 400);
        }
    }
    $changes['is_admin'] = $data['is_admin'] ? 1 : 0;
}

if (array_key_exists('suspended', $data)) {
    if (!is_bool($data['suspended'])) Response::error("정지 여부는 true/false 로 보내주세요.", 400);
    if ($data['suspended'] && $id === $adminId) {
        Response::error("자기 계정은 정지할 수 없어요.", 400);
    }
    $changes['suspended'] = $data['suspended'] ? 1 : 0;
    if (!$data['suspended']) {
        $changes['suspended_reason'] = null; // 정지를 풀면 사유도 지운다
    }
}

if (array_key_exists('suspended_reason', $data) && !array_key_exists('suspended_reason', $changes)) {
    $reason = is_string($data['suspended_reason']) ? trim($data['suspended_reason']) : '';
    if (mb_strlen($reason) > 100) Response::error("정지 사유는 100자까지 쓸 수 있어요.", 400);
    $changes['suspended_reason'] = $reason === '' ? null : $reason;
}

if (array_key_exists('consent', $data)) {
    if ($data['consent'] !== 'granted') {
        Response::error("보호자 동의는 granted 로만 바꿀 수 있어요.", 400);
    }
    if ($target['consent_status'] !== 'pending') {
        Response::error("보호자 동의를 기다리는 계정이 아니에요.", 400);
    }
    $changes['consent_status'] = 'granted';
    $changes['consent_at'] = date('Y-m-d H:i:s');
}

if (array_key_exists('email', $data)) {
    $email = is_string($data['email']) ? strtolower(trim($data['email'])) : '';
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 100) {
        Response::error("올바른 이메일 형식이 아니에요.", 400);
    }
    if ($model->emailTaken($email, $id)) {
        Response::error("다른 회원이 쓰고 있는 이메일이에요.", 409);
    }
    $changes['email'] = $email;
}

$forceLogout = !empty($data['force_logout']);

/* 코인·경험치 손보기 — 보낸 만큼 더하거나 뺀다 (절대값이 아니다) */
$coinDelta = 0;
$xpDelta = 0;
foreach (['coins_delta' => 'coin', 'xp_delta' => 'xp'] as $key => $label) {
    if (!array_key_exists($key, $data)) continue;
    $v = $data[$key];
    if (is_bool($v) || !is_numeric($v) || (int)$v != $v) {
        Response::error("$key 는 정수로 보내주세요. (더하려면 10, 빼려면 -10)", 400);
    }
    $v = (int)$v;
    if ($v === 0) continue;
    if (abs($v) > 1000000) Response::error("$key 가 너무 커요.", 400);
    if ($key === 'coins_delta') $coinDelta = $v; else $xpDelta = $v;
}

$resetPassword = !empty($data['reset_password']);

if (!$changes && !$forceLogout && $coinDelta === 0 && $xpDelta === 0 && !$resetPassword) {
    Response::error("바꿀 내용이 없어요.", 400);
}

$changed = $model->updateUser($id, $changes);

/* 임시 비밀번호. 사람이 받아 적을 수 있게 섞이기 쉬운 글자(0·O·1·l·I)를 뺀다 */
$tempPassword = null;
if ($resetPassword) {
    $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    $tempPassword = '';
    for ($i = 0; $i < 10; $i++) {
        $tempPassword .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    $tempPassword .= '!'; // 비밀번호 규칙(특수문자)을 만족시키려고
    $model->setPassword($id, $tempPassword);
    $extras[] = 'password';
}

if ($coinDelta !== 0) {
    $model->adjustCoins($id, $coinDelta, $adminId);
    $extras[] = 'coins';
}
if ($xpDelta !== 0) {
    $model->adjustXp($id, $xpDelta);
    $extras[] = 'xp';
}

// 권한을 빼거나 계정을 정지했으면 들고 있던 토큰도 끊어야 한다.
// Auth 가 요청마다 DB를 보긴 하지만, 정지된 사람이 토큰을 계속 들고 있을 이유가 없다
$needLogout = $forceLogout
    || $resetPassword
    || (isset($changes['suspended']) && $changes['suspended'] === 1)
    || (isset($changes['is_admin']) && $changes['is_admin'] === 0)
    || isset($changes['role'])
    || isset($changes['email']);
if ($needLogout) {
    Auth::revoke($id);
    $extras[] = 'logout';
}

Logger::admin('admin.user.update', [
    'target' => $id,
    'by' => $adminId,
    'fields' => $changed,   // 컬럼 이름만. 바뀐 값(이메일 등)은 남기지 않는다
    'extra' => $extras,
    'coins' => $coinDelta,
    'xp' => $xpDelta,
]);

$result = [
    'user' => $model->user($id),
    'summary' => $model->userSummary($id),
    'message' => '회원 정보를 바꿨어요.' . ($needLogout ? ' 이 회원은 다시 로그인해야 해요.' : ''),
];
// 임시 비밀번호는 이 응답에만 담긴다. 다시 볼 수 없으니 화면에서 꼭 보여줘야 한다
if ($tempPassword !== null) {
    $result['tempPassword'] = $tempPassword;
    $result['message'] = '임시 비밀번호를 만들었어요. 이 화면을 닫으면 다시 볼 수 없어요.';
}

Response::success($result);
