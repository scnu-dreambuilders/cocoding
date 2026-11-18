<?php
// backend/tools/make_admin.php — 운영자 지정·해제 (명령줄 전용)
//
// 관리자 웹은 운영자만 쓸 수 있는데, 운영자가 한 명도 없으면 아무도 들어갈 수 없다.
// 첫 운영자는 서버에서 이 도구로 지정한다. 웹으로 자기 자신을 운영자로 만드는 길은
// 일부러 두지 않았다 — 그런 길이 있으면 누구나 운영자가 될 수 있다.
//
// 쓰는 법 (backend 폴더에서)
//   php tools/make_admin.php 목록
//   php tools/make_admin.php 지정 admin@example.com
//   php tools/make_admin.php 해제 admin@example.com
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/../config/Database.php';

$action = $argv[1] ?? '';
$email = isset($argv[2]) ? strtolower(trim($argv[2])) : '';

$db = Database::getInstance();

function showAdmins(PDO $db) {
    $rows = $db->query("SELECT id, username, email, role FROM users WHERE is_admin = 1 ORDER BY id");
    $found = false;
    echo "지금 운영자:\n";
    foreach ($rows as $r) {
        $found = true;
        echo "  #{$r['id']}  {$r['username']}  <{$r['email']}>  ({$r['role']})\n";
    }
    if (!$found) echo "  (없음)\n";
}

if ($action === '목록' || $action === 'list') {
    showAdmins($db);
    exit(0);
}

if (!in_array($action, ['지정', '해제', 'grant', 'revoke'], true) || $email === '') {
    echo "쓰는 법:\n";
    echo "  php tools/make_admin.php 목록\n";
    echo "  php tools/make_admin.php 지정 admin@example.com\n";
    echo "  php tools/make_admin.php 해제 admin@example.com\n";
    exit(1);
}

$stmt = $db->prepare("SELECT id, username, email, is_admin FROM users WHERE email = ?");
$stmt->execute([$email]);
$user = $stmt->fetch();
if (!$user) {
    echo "그런 이메일로 가입한 계정이 없습니다: $email\n";
    exit(1);
}

$grant = in_array($action, ['지정', 'grant'], true);

if ($grant && (int)$user['is_admin'] === 1) {
    echo "이미 운영자입니다: {$user['username']} <{$user['email']}>\n";
    exit(0);
}
if (!$grant && (int)$user['is_admin'] === 0) {
    echo "운영자가 아닙니다: {$user['username']} <{$user['email']}>\n";
    exit(0);
}

// 마지막 운영자를 해제하면 관리자 웹에 아무도 들어갈 수 없다
if (!$grant) {
    $count = (int)$db->query("SELECT COUNT(*) FROM users WHERE is_admin = 1")->fetchColumn();
    if ($count <= 1) {
        echo "운영자가 한 명뿐입니다. 해제하면 관리자 웹에 아무도 들어갈 수 없습니다.\n";
        echo "다른 사람을 먼저 운영자로 지정하세요.\n";
        exit(1);
    }
}

$db->prepare("UPDATE users SET is_admin = ? WHERE id = ?")->execute([$grant ? 1 : 0, $user['id']]);
// 권한이 바뀌면 들고 있던 토큰을 끊어서 다시 로그인하게 한다
$db->prepare("UPDATE users SET token_version = token_version + 1 WHERE id = ?")->execute([$user['id']]);

echo ($grant ? "운영자로 지정했습니다: " : "운영자 권한을 뺐습니다: ")
    . "{$user['username']} <{$user['email']}>\n";
echo "이 계정은 다시 로그인해야 합니다.\n\n";
showAdmins($db);
