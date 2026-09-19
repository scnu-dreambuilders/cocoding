<?php
// backend/api/auth/account.php — 내 정보 관리
// PATCH  {username}                          닉네임 바꾸기
// POST   {current_password, new_password}    비밀번호 바꾸기 → 다른 기기 로그인은 모두 끊고 새 토큰 발급
// DELETE {password}                          회원 탈퇴 (작품·진도·아이템 모두 삭제)
// 비밀번호를 확인하는 요청은 로그인과 같이 실패 횟수를 제한한다 (훔친 토큰으로 비밀번호 대입 방지)
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../config/Validators.php';
require_once __DIR__ . '/../../models/UserModel.php';
require_once __DIR__ . '/../../models/GuardianModel.php';

const PASSWORD_CHECK_MAX = 5;
const PASSWORD_CHECK_WINDOW = 900; // 15분

$payload = Auth::requireUser();
$userId = (int)$payload['id'];
$userModel = new UserModel();
$data = json_decode(file_get_contents("php://input"), true) ?? [];
$method = $_SERVER['REQUEST_METHOD'];

function verifyCurrentPassword(UserModel $userModel, $userId, $password) {
    $key = "account:password:$userId";
    if (RateLimiter::tooMany($key, PASSWORD_CHECK_MAX, PASSWORD_CHECK_WINDOW)) {
        header('Retry-After: ' . PASSWORD_CHECK_WINDOW);
        Response::error("비밀번호를 여러 번 틀렸어요. 15분 후에 다시 시도해주세요.", 429);
    }
    if (!is_string($password) || !password_verify($password, (string)$userModel->passwordHash($userId))) {
        RateLimiter::hit($key);
        Response::error("지금 쓰는 비밀번호가 맞지 않아요.", 403);
    }
    RateLimiter::clear($key);
}

if ($method === 'PATCH') {
    RateLimiter::limit("account:username:$userId", 10, 3600, "닉네임을 너무 자주 바꿨어요. 잠시 후 다시 시도해주세요.");
    $username = is_string($data['username'] ?? null) ? trim($data['username']) : '';
    $error = Validators::username($username);
    if ($error) Response::error($error);

    $existing = $userModel->findByUsername($username);
    if ($existing && (int)$existing['id'] !== $userId) {
        Response::error("이미 사용 중인 닉네임입니다.");
    }
    $userModel->updateUsername($userId, $username);
    Response::success($userModel->findById($userId));
}

if ($method === 'POST') {
    verifyCurrentPassword($userModel, $userId, $data['current_password'] ?? null);
    $newPassword = $data['new_password'] ?? null;
    $error = Validators::password($newPassword);
    if ($error) Response::error($error);
    if (hash_equals((string)$data['current_password'], $newPassword)) {
        Response::error("지금 비밀번호와 다른 비밀번호를 써주세요.");
    }

    $userModel->updatePassword($userId, $newPassword);
    Auth::revoke($userId); // 비밀번호가 새어서 바꾸는 경우를 위해 다른 곳의 로그인 끊기
    $user = $userModel->findById($userId);
    Response::success(["token" => Auth::issueToken($userId, $user['username']), "user" => $user]);
}

if ($method === 'DELETE') {
    verifyCurrentPassword($userModel, $userId, $data['password'] ?? null);
    $guardians = new GuardianModel();
    $children = $payload['role'] === 'guardian' ? $guardians->studentIds($userId) : [];

    $db = Database::getInstance();
    $db->beginTransaction();
    try {
        $userModel->delete($userId);
        // 보호자가 탈퇴해서 동의해준 보호자가 아무도 없게 된 자녀는 다시 동의 전 상태로
        foreach ($children as $childId) {
            if ($guardians->guardianCount($childId) === 0) $userModel->revokeConsent($childId);
        }
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
    Response::success(["message" => "탈퇴가 완료되었어요. 그동안 고마웠어요!"]);
}

Response::error("잘못된 요청 방식입니다.", 405);
