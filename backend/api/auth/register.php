<?php
// backend/api/auth/register.php
// POST {username, email, password, role, birth_year?, adult?}
// 가입 즉시 토큰을 발급해서 자동 로그인 → (학생) 관심사 설문으로 이어진다
// 학생은 태어난 해를 받아 만 14세 미만이면 보호자 동의 코드를 만든다 (동의 전에는 공유 기능 제한)
// 선생님·보호자는 성인 확인만 받는다 (태어난 해 등 추가 개인정보는 받지 않음)
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../config/Validators.php';
require_once __DIR__ . '/../../models/UserModel.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

RateLimiter::limit('register:ip:' . RateLimiter::clientIp(), 10, 3600, "가입 시도가 너무 많아요. 잠시 후 다시 시도해주세요.");

$data = json_decode(file_get_contents("php://input"), true) ?? [];
$username = is_string($data['username'] ?? null) ? trim($data['username']) : '';
$email = is_string($data['email'] ?? null) ? strtolower(trim($data['email'])) : '';
$password = is_string($data['password'] ?? null) ? $data['password'] : '';
$role = $data['role'] ?? 'student';
$birthYear = $data['birth_year'] ?? null;

if ($username === '' || $email === '' || $password === '') {
    Response::error("모든 필드를 입력해주세요.");
}
if (!in_array($role, UserModel::ROLES, true)) {
    Response::error("계정 유형을 골라주세요.");
}
$error = Validators::username($username);
if ($error) Response::error($error);
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 100) {
    Response::error("올바른 이메일 형식이 아닙니다.");
}
$error = Validators::password($password);
if ($error) Response::error($error);

if ($role === 'student') {
    $error = Validators::birthYear($birthYear);
    if ($error) Response::error($error);
} elseif (($data['adult'] ?? false) !== true) {
    Response::error("선생님·보호자 계정은 성인만 만들 수 있어요.");
}

$userModel = new UserModel();
if ($userModel->findByEmail($email)) {
    Response::error("이미 가입된 이메일이에요. 로그인해주세요.");
}
if ($userModel->findByUsername($username)) {
    Response::error("이미 사용 중인 닉네임입니다.");
}

$userId = $userModel->create($username, $email, $password, $role, $role === 'student' ? $birthYear : null);

Response::success([
    "token" => Auth::issueToken($userId, $username),
    "user" => $userModel->findById($userId),
], 201);
