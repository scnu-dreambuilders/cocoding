<?php
// backend/api/auth/login.php
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/UserModel.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

$data = json_decode(file_get_contents("php://input"), true) ?? [];
$email = is_string($data['email'] ?? null) ? trim($data['email']) : '';
$password = is_string($data['password'] ?? null) ? $data['password'] : '';

$rateLimitKey = ($_SERVER['REMOTE_ADDR'] ?? 'unknown') . ':' . strtolower($email);
if (!RateLimiter::attempt($rateLimitKey, 5, 300)) {
    Response::error("로그인 시도가 너무 많습니다. 5분 후 다시 시도해주세요.", 429);
}

$userModel = new UserModel();
$user = $userModel->findByEmail($email);

if (!$user || !password_verify($password, $user['password_hash'])) {
    Response::error("이메일 또는 비밀번호가 올바르지 않습니다.", 401);
}

$token = Auth::generateJWT([
    "id" => $user['id'],
    "username" => $user['username'],
    "exp" => time() + (86400 * 7) // 7일 유지
]);

Response::success([
    "token" => $token,
    // tags가 NULL이면 설문을 아직 안 한 사용자 → 프론트에서 설문 화면으로 보냄
    "user" => $userModel->findById($user['id']),
]);
