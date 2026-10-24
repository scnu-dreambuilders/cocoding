<?php
// backend/api/auth/login.php
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/UserModel.php';

// 실패 제한 (15분 기준)
//   계정+IP 5번  — 한 곳에서 한 계정 대입 방지. 남이 내 이메일로 일부러 틀려도 막히는 건 그 사람 IP뿐
//   IP 20번      — 한 IP에서 여러 계정 대입 방지
//   계정 50번    — 여러 IP를 돌려가며 한 계정을 노리는 경우 (5번으로 하면 아무나 남의 계정을 잠글 수 있음)
const LOGIN_WINDOW = 900;
const LOGIN_MAX_PER_ACCOUNT_IP = 5;
const LOGIN_MAX_PER_IP = 20;
const LOGIN_MAX_PER_ACCOUNT = 50;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

$data = json_decode(file_get_contents("php://input"), true) ?? [];
$email = is_string($data['email'] ?? null) ? strtolower(trim($data['email'])) : '';
$password = is_string($data['password'] ?? null) ? $data['password'] : '';

$ip = RateLimiter::clientIp();
$accountKey = 'login:account:' . $email;
$accountIpKey = 'login:account-ip:' . $email . '|' . $ip;
$ipKey = 'login:ip:' . $ip;
if (RateLimiter::tooMany($accountIpKey, LOGIN_MAX_PER_ACCOUNT_IP, LOGIN_WINDOW)
    || RateLimiter::tooMany($ipKey, LOGIN_MAX_PER_IP, LOGIN_WINDOW)
    || RateLimiter::tooMany($accountKey, LOGIN_MAX_PER_ACCOUNT, LOGIN_WINDOW)) {
    header('Retry-After: ' . LOGIN_WINDOW);
    Response::error("로그인에 여러 번 실패했어요. 15분 후에 다시 시도해주세요.", 429);
}

$userModel = new UserModel();
$user = $email !== '' ? $userModel->findByEmail($email) : null;

// 없는 계정이어도 같은 시간이 걸리게 가짜 해시로 한 번 검사 (계정 존재 여부를 응답 시간으로 알 수 없게)
$hash = $user['password_hash'] ?? '$2y$10$DjplZbF2rfjdC8CHvu9C6.kbrXewxs/EHHWN2sEFCH9/BZEVm6WaO';
$valid = password_verify($password, $hash) && $user;

if (!$valid) {
    RateLimiter::hit($accountIpKey);
    RateLimiter::hit($ipKey);
    RateLimiter::hit($accountKey);
    Response::error("이메일 또는 비밀번호가 올바르지 않습니다.", 401);
}

RateLimiter::clear($accountIpKey);
RateLimiter::clear($accountKey);

Response::success([
    "token" => Auth::issueToken($user['id'], $user['username']),
    // tags가 NULL이면 설문을 아직 안 한 사용자 → 프론트에서 설문 화면으로 보냄
    "user" => $userModel->findById($user['id']),
]);
