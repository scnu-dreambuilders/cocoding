<?php
// backend/api/auth/register.php
// 가입 즉시 토큰을 발급해서 자동 로그인 → 관심사 설문으로 이어진다
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/UserModel.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

if (!RateLimiter::attempt('register:' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 10, 3600)) {
    Response::error("가입 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.", 429);
}

$data = json_decode(file_get_contents("php://input"), true) ?? [];
$username = is_string($data['username'] ?? null) ? trim($data['username']) : '';
$email = is_string($data['email'] ?? null) ? trim($data['email']) : '';
$password = is_string($data['password'] ?? null) ? $data['password'] : '';

if ($username === '' || $email === '' || $password === '') {
    Response::error("모든 필드를 입력해주세요.");
}
if (mb_strlen($username) > 20) {
    Response::error("닉네임은 20자 이내로 입력해주세요.");
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    Response::error("올바른 이메일 형식이 아닙니다.");
}
if (strlen($password) < 6) {
    Response::error("비밀번호는 6자 이상이어야 합니다.");
}

$userModel = new UserModel();
if ($userModel->findByEmail($email)) {
    Response::error("이미 사용 중인 이메일입니다.");
}
if ($userModel->findByUsername($username)) {
    Response::error("이미 사용 중인 닉네임입니다.");
}

$userId = $userModel->create($username, $email, $password);
$token = Auth::generateJWT([
    "id" => (int)$userId,
    "username" => $username,
    "exp" => time() + (86400 * 7)
]);

Response::success([
    "token" => $token,
    "user" => $userModel->findById($userId),
], 201);
