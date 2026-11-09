<?php
// backend/api/auth/password_reset.php — 비밀번호 찾기
// POST {email}                   재설정 링크 메일 보내기
// POST {token, new_password}     새 비밀번호로 바꾸기 (링크 안의 토큰 사용)
//
// 계정이 있는지 없는지는 응답으로 알 수 없게 항상 같은 메시지를 돌려준다.
// 토큰은 메일에만 담고 DB에는 해시만 저장하며, 30분 뒤 만료되고 한 번만 쓸 수 있다.
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../config/Validators.php';
require_once __DIR__ . '/../../config/Mailer.php';
require_once __DIR__ . '/../../models/UserModel.php';
require_once __DIR__ . '/../../config/Logger.php';

const RESET_TTL_MINUTES = 30;
const SAME_ANSWER = '메일을 보냈어요. 받은 편지함을 확인해주세요. (계정이 없으면 메일이 오지 않아요)';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

$db = Database::getInstance();
$data = json_decode(file_get_contents("php://input"), true) ?? [];
$userModel = new UserModel();

/* ── 2단계: 토큰으로 비밀번호 바꾸기 ───────────── */
if (isset($data['token'])) {
    RateLimiter::limit('pwreset:use:' . RateLimiter::clientIp(), 20, 3600, "시도가 너무 많아요. 잠시 후 다시 해주세요.");

    $token = is_string($data['token']) ? trim($data['token']) : '';
    $newPassword = $data['new_password'] ?? null;
    $error = Validators::password($newPassword);
    if ($error) Response::error($error);

    $stmt = $db->prepare("SELECT id, user_id FROM password_resets
                          WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()");
    $stmt->execute([hash('sha256', $token)]);
    $row = $stmt->fetch();
    if (!$row) {
        Response::error("링크가 만료되었거나 이미 사용했어요. 다시 요청해주세요.", 400);
    }

    $db->beginTransaction();
    try {
        $userModel->updatePassword($row['user_id'], $newPassword);
        $db->prepare("UPDATE password_resets SET used_at = NOW() WHERE id = ?")->execute([$row['id']]);
        // 남은 링크도 무효화하고, 기존 로그인도 모두 끊는다
        $db->prepare("UPDATE password_resets SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL")->execute([$row['user_id']]);
        Auth::revoke($row['user_id']);
        $db->commit();
    } catch (Throwable $e) {
        $db->rollBack();
        throw $e;
    }
    RateLimiter::clear("login:account:" . strtolower((string)($userModel->findById($row['user_id'])['email'] ?? '')));
    Logger::audit('password.reset.done');
    Response::success(["message" => "비밀번호를 바꿨어요. 새 비밀번호로 로그인해주세요."]);
}

/* ── 1단계: 재설정 링크 보내기 ─────────────────── */
$email = is_string($data['email'] ?? null) ? strtolower(trim($data['email'])) : '';
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    Response::error("올바른 이메일 형식이 아닙니다.");
}
RateLimiter::limit("pwreset:send:$email", 3, 3600, "메일을 너무 자주 요청했어요. 잠시 후 다시 해주세요.");
RateLimiter::limit('pwreset:ip:' . RateLimiter::clientIp(), 15, 3600, "요청이 너무 많아요. 잠시 후 다시 해주세요.");

$user = $userModel->findByEmail($email);
if ($user) {
    $token = bin2hex(random_bytes(32));
    $db->prepare("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, NOW() + INTERVAL ? MINUTE)")
        ->execute([$user['id'], hash('sha256', $token), RESET_TTL_MINUTES]);

    Logger::audit('password.reset.request', ['uid_target' => (int)$user['id']]);
    $link = Mailer::appUrl() . '/?reset=' . $token;
    Mailer::send($email, '[코코딩] 비밀번호 다시 정하기',
        "안녕하세요, {$user['username']}님.\n\n" .
        "아래 링크를 눌러 새 비밀번호를 정해주세요. " . RESET_TTL_MINUTES . "분 안에 열어야 해요.\n\n$link\n\n" .
        "본인이 요청한 게 아니라면 이 메일은 그냥 두셔도 됩니다. 비밀번호는 바뀌지 않아요.\n");
}

Response::success(["message" => SAME_ANSWER]);
