<?php
// backend/api/auth/register.php
// 가입 즉시 토큰을 발급해서 자동 로그인 → 관심사 설문으로 이어진다
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/UserModel.php';

// 너무 흔해서 금방 뚫리는 비밀번호
const COMMON_PASSWORDS = ['12345678', '123456789', '1234567890', '11111111', '00000000', 'password', 'password1',
    'qwer1234', 'qwerty12', 'qwerty123', 'asdf1234', 'abcd1234', '1q2w3e4r', '1q2w3e4r5t', 'a1234567', 'aa123456', 'iloveyou1'];

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

RateLimiter::limit('register:ip:' . RateLimiter::clientIp(), 10, 3600, "가입 시도가 너무 많아요. 잠시 후 다시 시도해주세요.");

$data = json_decode(file_get_contents("php://input"), true) ?? [];
$username = is_string($data['username'] ?? null) ? trim($data['username']) : '';
$email = is_string($data['email'] ?? null) ? strtolower(trim($data['email'])) : '';
$password = is_string($data['password'] ?? null) ? $data['password'] : '';

if ($username === '' || $email === '' || $password === '') {
    Response::error("모든 필드를 입력해주세요.");
}
// 닉네임은 친구 작품 탭에 공개되므로 글자 종류와 길이를 제한
if (!preg_match('/^[\p{Hangul}A-Za-z0-9_]{2,12}$/u', $username)) {
    Response::error("닉네임은 한글·영문·숫자로 2~12자까지 쓸 수 있어요.");
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 100) {
    Response::error("올바른 이메일 형식이 아닙니다.");
}
if (strlen($password) < 8 || strlen($password) > 72 || !preg_match('/[A-Za-z]/', $password) || !preg_match('/[0-9]/', $password)) {
    Response::error("비밀번호는 영문과 숫자를 섞어서 8자 이상으로 만들어주세요.");
}
if (in_array(strtolower($password), COMMON_PASSWORDS, true)) {
    Response::error("너무 쉬운 비밀번호예요. 다른 비밀번호를 써주세요.");
}

$userModel = new UserModel();
if ($userModel->findByEmail($email)) {
    Response::error("이미 가입된 이메일이에요. 로그인해주세요.");
}
if ($userModel->findByUsername($username)) {
    Response::error("이미 사용 중인 닉네임입니다.");
}

$userId = $userModel->create($username, $email, $password);

Response::success([
    "token" => Auth::issueToken($userId, $username),
    "user" => $userModel->findById($userId),
], 201);
