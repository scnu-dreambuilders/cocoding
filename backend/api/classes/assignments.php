<?php
// backend/api/classes/assignments.php
// GET                      학생: 내가 속한 반에서 받은 과제 (+ 내 진행 상태)
// GET ?class_id=N          선생님: 그 반에 낸 과제 목록 (+ 완료 인원)
// GET ?id=N                선생님: 과제 1개의 학생별 수행 내용 (EDU-014)
// POST {class_id, chapter_id|title, note?, due_on?, reward_coins?}  선생님: 과제 내기
// PUT ?id=N {title?, note?, due_on?, reward_coins?}                 선생님: 과제 고치기
// DELETE ?id=N             선생님: 과제 취소
// POST {done_id, note?}    학생: 직접 쓴 과제를 끝냈다고 표시 (챕터 과제는 진도로 자동 판정)
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/ClassModel.php';
require_once __DIR__ . '/../../models/ChapterModel.php';
require_once __DIR__ . '/../../models/CoinModel.php';

const MAX_NOTE_LENGTH = 200;
const MAX_TITLE_LENGTH = 80;
const MAX_REWARD_COINS = 100;

$payload = Auth::requireRole(['student', 'teacher']);
$userId = (int)$payload['id'];
$isTeacher = $payload['role'] === 'teacher';
$classes = new ClassModel();
$db = Database::getInstance();
$data = json_decode(file_get_contents("php://input"), true) ?? [];

// 선생님이 그 반의 주인인지 확인 (아니면 존재 여부도 알려주지 않음)
function ownedClass(ClassModel $classes, $classId, $userId) {
    $class = $classId ? $classes->findById($classId) : null;
    if (!$class || (int)$class['teacher_id'] !== $userId) {
        Response::error("반을 찾을 수 없어요.", 404);
    }
    return $class;
}

// 내가 낸 과제인지 확인
function ownedAssignment(PDO $db, $assignmentId, $teacherId) {
    $stmt = $db->prepare("SELECT a.*, c.teacher_id, c.name AS class_name FROM class_assignments a
        JOIN classes c ON c.id = a.class_id WHERE a.id = ?");
    $stmt->execute([$assignmentId]);
    $row = $stmt->fetch();
    if (!$row || (int)$row['teacher_id'] !== $teacherId) {
        Response::error("과제를 찾을 수 없어요.", 404);
    }
    return $row;
}

// 과제 제목: 챕터 과제면 챕터 제목, 직접 쓴 과제면 적은 제목
$titleExpr = "COALESCE(a.title, c.title)";

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $assignmentId = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);

    /* 선생님: 과제 1개의 학생별 수행 내용 */
    if ($assignmentId && $isTeacher) {
        $a = ownedAssignment($db, $assignmentId, $userId);
        $stmt = $db->prepare("SELECT u.id, u.username,
                (p.status = 'completed') AS chapter_done, p.best_score, p.attempts, p.completed_at,
                d.done_at, d.note AS student_note
            FROM class_members m
            JOIN users u ON u.id = m.student_id
            LEFT JOIN user_chapter_progress p ON p.user_id = u.id AND p.chapter_id = ?
            LEFT JOIN assignment_done d ON d.assignment_id = ? AND d.student_id = u.id
            WHERE m.class_id = ? ORDER BY u.username ASC");
        $stmt->execute([$a['chapter_id'], $assignmentId, $a['class_id']]);

        $students = array_map(function ($s) use ($a) {
            $done = $a['chapter_id'] ? (bool)$s['chapter_done'] : $s['done_at'] !== null;
            return [
                'id' => (int)$s['id'],
                'username' => $s['username'],
                'done' => $done,
                'best_score' => $s['best_score'] === null ? null : (int)$s['best_score'],
                'attempts' => (int)($s['attempts'] ?? 0),
                'done_at' => $a['chapter_id'] ? $s['completed_at'] : $s['done_at'],
                'student_note' => $s['student_note'],
            ];
        }, $stmt->fetchAll());

        Response::success([
            'id' => (int)$a['id'],
            'class_name' => $a['class_name'],
            'chapter_id' => $a['chapter_id'] === null ? null : (int)$a['chapter_id'],
            'title' => $a['title'],
            'note' => $a['note'],
            'due_on' => $a['due_on'],
            'reward_coins' => (int)$a['reward_coins'],
            'students' => $students,
            'doneCount' => count(array_filter($students, function ($s) { return $s['done']; })),
        ]);
    }

    if ($isTeacher) {
        $class = ownedClass($classes, filter_var($_GET['class_id'] ?? null, FILTER_VALIDATE_INT), $userId);
        $stmt = $db->prepare("SELECT a.id, a.chapter_id, a.note, a.due_on, a.reward_coins, a.created_at,
                c.order_num, $titleExpr AS title,
                (SELECT COUNT(*) FROM class_members m WHERE m.class_id = a.class_id) AS member_count,
                (SELECT COUNT(*) FROM class_members m
                   JOIN user_chapter_progress p ON p.user_id = m.student_id
                 WHERE m.class_id = a.class_id AND p.chapter_id = a.chapter_id AND p.status = 'completed') AS chapter_done,
                (SELECT COUNT(*) FROM assignment_done d WHERE d.assignment_id = a.id) AS marked_done
            FROM class_assignments a LEFT JOIN chapters c ON c.id = a.chapter_id
            WHERE a.class_id = ? ORDER BY a.created_at DESC");
        $stmt->execute([$class['id']]);
        Response::success(array_map(function ($a) {
            $a['id'] = (int)$a['id'];
            $a['chapter_id'] = $a['chapter_id'] === null ? null : (int)$a['chapter_id'];
            $a['order_num'] = $a['order_num'] === null ? null : (int)$a['order_num'];
            $a['member_count'] = (int)$a['member_count'];
            $a['reward_coins'] = (int)$a['reward_coins'];
            // 챕터 과제는 진도로, 직접 쓴 과제는 학생이 표시한 기록으로 센다
            $a['done_count'] = $a['chapter_id'] ? (int)$a['chapter_done'] : (int)$a['marked_done'];
            unset($a['chapter_done'], $a['marked_done']);
            return $a;
        }, $stmt->fetchAll()));
    }

    // 학생: 내가 속한 모든 반의 과제
    $stmt = $db->prepare("SELECT a.id, a.chapter_id, a.note, a.due_on, a.reward_coins,
            c.order_num, $titleExpr AS title, cl.name AS class_name,
            (p.status = 'completed') AS chapter_done, d.done_at
        FROM class_assignments a
        JOIN class_members m ON m.class_id = a.class_id AND m.student_id = ?
        JOIN classes cl ON cl.id = a.class_id
        LEFT JOIN chapters c ON c.id = a.chapter_id
        LEFT JOIN user_chapter_progress p ON p.user_id = m.student_id AND p.chapter_id = a.chapter_id
        LEFT JOIN assignment_done d ON d.assignment_id = a.id AND d.student_id = m.student_id
        ORDER BY a.due_on IS NULL, a.due_on ASC, a.created_at DESC");
    $stmt->execute([$userId]);
    Response::success(array_map(function ($a) {
        $a['id'] = (int)$a['id'];
        $a['chapter_id'] = $a['chapter_id'] === null ? null : (int)$a['chapter_id'];
        $a['order_num'] = $a['order_num'] === null ? null : (int)$a['order_num'];
        $a['reward_coins'] = (int)$a['reward_coins'];
        $a['done'] = $a['chapter_id'] ? (bool)$a['chapter_done'] : $a['done_at'] !== null;
        unset($a['chapter_done']);
        return $a;
    }, $stmt->fetchAll()));
}

/* ── 학생: 직접 쓴 과제 끝냈다고 표시 ─────────── */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($data['done_id'])) {
    if ($isTeacher) Response::error("선생님은 과제를 제출하지 않아요.", 403);
    RateLimiter::limit("assignment:done:$userId", 60, 3600);

    $assignmentId = filter_var($data['done_id'], FILTER_VALIDATE_INT);
    $stmt = $db->prepare("SELECT a.* FROM class_assignments a
        JOIN class_members m ON m.class_id = a.class_id AND m.student_id = ?
        WHERE a.id = ?");
    $stmt->execute([$userId, $assignmentId]);
    $a = $stmt->fetch();
    if (!$a) Response::error("과제를 찾을 수 없어요.", 404);
    if ($a['chapter_id']) Response::error("챕터 과제는 챕터를 통과하면 자동으로 완료돼요.", 400);

    $note = is_string($data['note'] ?? null) ? mb_substr(trim($data['note']), 0, MAX_NOTE_LENGTH) : null;
    $stmt = $db->prepare("INSERT IGNORE INTO assignment_done (assignment_id, student_id, note) VALUES (?, ?, ?)");
    $stmt->execute([$assignmentId, $userId, $note !== '' ? $note : null]);
    $first = $stmt->rowCount() > 0;

    // 선생님이 보상을 걸어둔 과제라면 처음 제출할 때 코인 지급
    $coins = 0;
    if ($first && (int)$a['reward_coins'] > 0) {
        $coins = (new CoinModel())->grant($userId, (int)$a['reward_coins'], 'assignment', (string)$assignmentId);
    }
    Response::success([
        'message' => $first ? ($coins > 0 ? "과제 완료! {$coins}코인을 받았어" : '과제를 끝냈다고 표시했어요!') : '이미 끝낸 과제예요.',
        'coinsEarned' => $coins,
    ]);
}

if (!$isTeacher) {
    Response::error("선생님만 과제를 낼 수 있어요.", 403);
}

/* ── 선생님: 내기 · 고치기 · 취소 ─────────────── */
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    RateLimiter::limit("assignment:$userId", 60, 3600);
    $class = ownedClass($classes, filter_var($data['class_id'] ?? null, FILTER_VALIDATE_INT), $userId);

    $chapterId = filter_var($data['chapter_id'] ?? null, FILTER_VALIDATE_INT);
    $title = is_string($data['title'] ?? null) ? mb_substr(trim($data['title']), 0, MAX_TITLE_LENGTH) : '';

    if ($chapterId) {
        if (!(new ChapterModel())->findById($chapterId)) {
            Response::error("존재하지 않는 챕터입니다.", 404);
        }
        $title = null; // 챕터 과제는 챕터 제목을 쓴다
    } elseif ($title === '') {
        Response::error("챕터를 고르거나 과제 제목을 적어주세요.");
    }

    $note = is_string($data['note'] ?? null) ? mb_substr(trim($data['note']), 0, MAX_NOTE_LENGTH) : null;
    $due = $data['due_on'] ?? null;
    if ($due !== null && $due !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$due)) {
        Response::error("마감일 형식이 올바르지 않아요.");
    }
    $reward = filter_var($data['reward_coins'] ?? 0, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => MAX_REWARD_COINS]]);
    if ($reward === false) Response::error("보상 코인은 0~" . MAX_REWARD_COINS . " 사이로 정해주세요.");

    // 같은 챕터를 또 내면 새로 만들지 않고 내용만 바꾼다
    if ($chapterId) {
        $stmt = $db->prepare("SELECT id FROM class_assignments WHERE class_id = ? AND chapter_id = ?");
        $stmt->execute([$class['id'], $chapterId]);
        $existing = $stmt->fetchColumn();
        if ($existing) {
            $db->prepare("UPDATE class_assignments SET note = ?, due_on = ?, reward_coins = ? WHERE id = ?")
                ->execute([$note !== '' ? $note : null, $due !== '' ? $due : null, $reward, $existing]);
            Response::success(["id" => (int)$existing, "message" => "이미 낸 과제라서 내용만 바꿨어요."]);
        }
    }

    $stmt = $db->prepare("INSERT INTO class_assignments (class_id, chapter_id, title, note, reward_coins, due_on) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->execute([$class['id'], $chapterId ?: null, $title ?: null, $note !== '' ? $note : null, $reward, $due !== '' ? $due : null]);
    Response::success(["id" => (int)$db->lastInsertId(), "message" => "과제를 냈어요. 학생 화면에 바로 보여요."], 201);
}

$assignmentId = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $a = ownedAssignment($db, $assignmentId, $userId);
    $fields = [];
    $params = [];

    if (array_key_exists('title', $data) && !$a['chapter_id']) {
        $title = is_string($data['title']) ? mb_substr(trim($data['title']), 0, MAX_TITLE_LENGTH) : '';
        if ($title === '') Response::error("과제 제목을 적어주세요.");
        $fields[] = 'title = ?';
        $params[] = $title;
    }
    if (array_key_exists('note', $data)) {
        $fields[] = 'note = ?';
        $params[] = is_string($data['note']) && trim($data['note']) !== '' ? mb_substr(trim($data['note']), 0, MAX_NOTE_LENGTH) : null;
    }
    if (array_key_exists('due_on', $data)) {
        $due = (string)$data['due_on'];
        if ($due !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $due)) Response::error("마감일 형식이 올바르지 않아요.");
        $fields[] = 'due_on = ?';
        $params[] = $due !== '' ? $due : null;
    }
    if (array_key_exists('reward_coins', $data)) {
        $reward = filter_var($data['reward_coins'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => MAX_REWARD_COINS]]);
        if ($reward === false) Response::error("보상 코인은 0~" . MAX_REWARD_COINS . " 사이로 정해주세요.");
        $fields[] = 'reward_coins = ?';
        $params[] = $reward;
    }
    if (!$fields) Response::error("고칠 내용이 없어요.");

    $params[] = $assignmentId;
    $db->prepare("UPDATE class_assignments SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
    Response::success(["message" => "과제를 고쳤어요."]);
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    ownedAssignment($db, $assignmentId, $userId);
    $db->prepare("DELETE FROM class_assignments WHERE id = ?")->execute([$assignmentId]);
    Response::success(["message" => "과제를 취소했어요."]);
}

Response::error("잘못된 요청 방식입니다.", 405);
