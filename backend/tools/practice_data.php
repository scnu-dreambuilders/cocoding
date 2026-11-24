<?php
// backend/tools/practice_data.php — 관리자 웹 연습용 데이터 (명령줄 전용)
//
// 관리자 화면의 정지·탈퇴·코인 조정·숨김 버튼을 실제 회원에게 눌러볼 수는 없다.
// 마음대로 건드려도 되는 연습용 계정과 신고된 글·작품을 만들어 준다.
// 선생님 화면(반·학생 진도·과제)을 눌러볼 수 있게 연습선생님의 반과 과제도 만든다.
// 만든 것은 전부 이메일이 @practice.cocoding.test 로 끝나는 계정에 딸려 있어서,
// '지우기' 한 번으로 흔적 없이 사라진다 (글·작품·신고·반·과제는 계정과 함께 지워진다).
//
// 쓰는 법 (backend 폴더에서)
//   php tools/practice_data.php 만들기     계정 6개 + 신고된 글 2개 + 신고된 작품 2개 + 반 2개 + 과제 3개
//   php tools/practice_data.php 지우기
//   php tools/practice_data.php 목록
//
//   php tools/practice_data.php 만들기 <비밀번호>   비밀번호를 정해서 만들기 (다른 서버와 맞출 때)
//
// 비밀번호를 정하지 않으면 무작위로 만들어 화면에 한 번만 보여준다. 파일이나 Git에 남기지 않는다.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../models/ClassModel.php';

const PRACTICE_DOMAIN = '@practice.cocoding.test';

$action = $argv[1] ?? '';
$db = Database::getInstance();

function practiceUsers(PDO $db) {
    $stmt = $db->prepare("SELECT id, username, email, role, is_admin, suspended FROM users WHERE email LIKE ? ORDER BY id");
    $stmt->execute(['%' . PRACTICE_DOMAIN]);
    return $stmt->fetchAll();
}

function showList(PDO $db) {
    $rows = practiceUsers($db);
    if (!$rows) { echo "연습용 계정이 없습니다.\n"; return; }
    echo "연습용 계정:\n";
    foreach ($rows as $r) {
        $tags = [];
        if ((int)$r['is_admin'] === 1) $tags[] = '운영자';
        if ((int)$r['suspended'] === 1) $tags[] = '정지';
        echo "  #{$r['id']}  {$r['email']}  {$r['username']}  ({$r['role']})" . ($tags ? '  [' . implode(', ', $tags) . ']' : '') . "\n";
    }
}

if ($action === '목록' || $action === 'list') {
    showList($db);
    exit(0);
}

if ($action === '지우기' || $action === 'remove') {
    $stmt = $db->prepare("DELETE FROM users WHERE email LIKE ?");
    $stmt->execute(['%' . PRACTICE_DOMAIN]);
    echo "연습용 계정 {$stmt->rowCount()}개와 딸린 글·작품·신고·반·과제를 지웠습니다.\n";
    exit(0);
}

if ($action !== '만들기' && $action !== 'create') {
    echo "쓰는 법:\n";
    echo "  php tools/practice_data.php 만들기\n";
    echo "  php tools/practice_data.php 지우기\n";
    echo "  php tools/practice_data.php 목록\n";
    exit(1);
}

if (practiceUsers($db)) {
    echo "연습용 계정이 이미 있습니다. 새로 만들려면 먼저 '지우기'를 하세요.\n\n";
    showList($db);
    exit(1);
}

// 헷갈리는 글자(0 O 1 l I)를 뺀 임시 비밀번호. 여섯 계정이 같은 비밀번호를 쓴다
// 비밀번호를 직접 정했으면 그것을 쓴다. 내 PC와 서버의 연습용 계정을 같은 비밀번호로 맞출 때 쓴다
$given = isset($argv[2]) ? (string)$argv[2] : '';
if ($given !== '') {
    if (strlen($given) < 10) {
        echo "비밀번호는 10자 이상으로 정해주세요.\n";
        exit(1);
    }
    $password = $given;
} else {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    $password = '';
    for ($i = 0; $i < 12; $i++) $password .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    $password .= '!7';
}
$hash = password_hash($password, PASSWORD_DEFAULT);

$accounts = [
    // key => [닉네임, 이메일 앞부분, 역할, 운영자, 정지 사유]
    'admin'     => ['연습운영자', 'admin',     'teacher',  1, null],
    'teacher'   => ['연습선생님', 'teacher',   'teacher',  0, null],
    'suspended' => ['연습정지학생', 'suspended', 'student',  0, '연습용 정지 사유'],
    'student'   => ['연습학생',   'student',   'student',  0, null],
    'student2'  => ['연습학생둘', 'student2',  'student',  0, null],
    'guardian'  => ['연습보호자', 'guardian',  'guardian', 0, null],
];

$db->beginTransaction();
try {
    $ids = [];
    $insert = $db->prepare("INSERT INTO users (username, email, password_hash, role, birth_year, affiliation, is_admin, suspended, suspended_reason, coins, xp, tags)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')");
    foreach ($accounts as $key => $a) {
        $insert->execute([
            $a[0], $a[1] . PRACTICE_DOMAIN, $hash, $a[2],
            $a[2] === 'student' ? 2008 : null,           // 동의가 필요 없는 나이
            $a[2] === 'teacher' ? '연습용 소속' : null,
            $a[3], $a[4] !== null ? 1 : 0, $a[4],
            $a[2] === 'student' ? 120 : 0, $a[2] === 'student' ? 80 : 0,
        ]);
        $ids[$key] = (int)$db->lastInsertId();
    }

    // 신고된 글: 하나는 신고 2건(아직 보임), 하나는 신고 3건(자동 숨김 상태)
    $post = $db->prepare("INSERT INTO board_posts (user_id, kind, title, body, hidden) VALUES (?, 'discussion', ?, ?, ?)");
    $comment = $db->prepare("INSERT INTO board_comments (post_id, user_id, body) VALUES (?, ?, ?)");
    $postReport = $db->prepare("INSERT INTO board_reports (post_id, user_id, reason) VALUES (?, ?, ?)");

    $post->execute([$ids['student'], '[연습] 신고 2건 받은 글', "관리자 화면 연습용 글입니다.\n숨김과 복구를 눌러봐도 됩니다.", 0]);
    $p1 = (int)$db->lastInsertId();
    $comment->execute([$p1, $ids['student2'], '연습용 댓글 하나']);
    $comment->execute([$p1, $ids['teacher'], '연습용 댓글 둘']);
    $postReport->execute([$p1, $ids['student2'], '도배 같아요']);
    $postReport->execute([$p1, $ids['teacher'], '게시판과 상관없는 글']);

    $post->execute([$ids['student2'], '[연습] 신고 3건으로 숨겨진 글', '신고가 쌓여 자동으로 숨겨진 상태를 확인하는 글입니다.', 1]);
    $p2 = (int)$db->lastInsertId();
    $postReport->execute([$p2, $ids['student'], '기분 나쁜 말이 있어요']);
    $postReport->execute([$p2, $ids['teacher'], '부적절한 내용']);
    $postReport->execute([$p2, $ids['guardian'], '부적절한 내용']);

    // 신고된 작품: 같은 구성. 빈 작업 공간이라 열어도 문제없다
    $blocks = json_encode(['version' => 2, 'workspace' => new stdClass(), 'sprites' => [], 'scenes' => [], 'sounds' => []]);
    $project = $db->prepare("INSERT INTO projects (user_id, title, blocks_data, track, is_public, report_hidden) VALUES (?, ?, ?, 'free', ?, ?)");
    $projectReport = $db->prepare("INSERT INTO project_reports (project_id, user_id, reason) VALUES (?, ?, ?)");

    $project->execute([$ids['student'], '[연습] 신고 1건 받은 작품', $blocks, 1, 0]);
    $j1 = (int)$db->lastInsertId();
    $projectReport->execute([$j1, $ids['student2'], '다른 사람 작품을 베낀 것 같아요']);

    $project->execute([$ids['student2'], '[연습] 신고 3건으로 숨겨진 작품', $blocks, 0, 1]);
    $j2 = (int)$db->lastInsertId();
    $projectReport->execute([$j2, $ids['student'], '부적절한 그림']);
    $projectReport->execute([$j2, $ids['teacher'], '부적절한 그림']);
    $projectReport->execute([$j2, $ids['guardian'], '부적절한 그림']);

    // 선생님 화면 연습용 반: 학생 둘이 든 반 하나와 빈 반 하나.
    // 반을 오가며 눌러보거나 빈 목록 화면을 볼 때 쓴다. 반은 선생님 계정과 함께 지워진다
    $classes = new ClassModel();
    $c1 = $classes->create($ids['teacher'], '[연습] 코코반');
    $c2 = $classes->create($ids['teacher'], '[연습] 빈 반');
    $member = $db->prepare("INSERT INTO class_members (class_id, student_id) VALUES (?, ?)");
    $member->execute([$c1, $ids['student']]);
    $member->execute([$c1, $ids['student2']]);

    // 진도: 연습학생은 챕터 1을 끝냈고, 연습학생둘은 하는 중
    $progress = $db->prepare("INSERT INTO user_chapter_progress (user_id, chapter_id, status, completed_at, best_score, attempts) VALUES (?, 1, ?, ?, ?, ?)");
    $progress->execute([$ids['student'], 'completed', date('Y-m-d H:i:s'), 100, 2]);
    $progress->execute([$ids['student2'], 'in_progress', null, 60, 1]);

    // 과제 3개: 챕터 과제(한 명 완료), 직접 쓴 과제(마감 지남, 한 명 완료), 마감 없는 챕터 과제(아무도 안 함)
    // 챕터 1 과제의 보상은 여기서 주지 않는다. 연습학생이 과제 목록을 열 때 서버가 한 번 준다
    $assign = $db->prepare("INSERT INTO class_assignments (class_id, chapter_id, title, note, reward_coins, due_on) VALUES (?, ?, ?, ?, ?, ?)");
    $assign->execute([$c1, 1, null, '화살표 키 네 개를 모두 써 보세요.', 20, date('Y-m-d', strtotime('+7 days'))]);
    $a1 = (int)$db->lastInsertId();
    $assign->execute([$c1, null, '[연습] 나만의 캐릭터 소개 작품 만들기',
        '자유 작품으로 캐릭터가 자기 이름과 좋아하는 것을 말하게 만들어 보세요. 다 만들면 작품을 공개로 바꾸고 끝냈어요를 눌러 주세요.',
        10, date('Y-m-d', strtotime('-2 days'))]);
    $a2 = (int)$db->lastInsertId();
    $assign->execute([$c1, 2, null, null, 0, null]);
    $a3 = (int)$db->lastInsertId();
    $db->prepare("INSERT INTO assignment_done (assignment_id, student_id, note) VALUES (?, ?, ?)")
       ->execute([$a2, $ids['student2'], '고양이 캐릭터로 만들었어요']);

    $db->commit();
} catch (Throwable $e) {
    $db->rollBack();
    echo "만들지 못했습니다: " . $e->getMessage() . "\n";
    exit(1);
}

showList($db);
echo "\n신고된 글 2개(#$p1 보임, #$p2 숨김), 신고된 작품 2개(#$j1 보임, #$j2 숨김)를 만들었습니다.\n";
echo "연습선생님의 반 2개(#$c1 학생 2명, #$c2 빈 반), 과제 3개(#$a1 챕터 1, #$a2 직접 쓴 과제, #$a3 챕터 2)를 만들었습니다.\n";
echo $given !== ''
    ? "\n여섯 계정의 비밀번호는 정해주신 값으로 넣었습니다.\n"
    : "\n여섯 계정의 비밀번호 (지금 한 번만 보입니다): $password\n";
echo "다 쓰면 'php tools/practice_data.php 지우기' 로 한 번에 지우세요.\n";
