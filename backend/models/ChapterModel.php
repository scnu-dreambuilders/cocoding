<?php
// backend/models/ChapterModel.php
require_once __DIR__ . '/../config/Database.php';

class ChapterModel {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    private static function decode($chapter) {
        if ($chapter) {
            $chapter['new_blocks'] = json_decode($chapter['new_blocks'] ?? 'null', true);
            $chapter['required_blocks'] = json_decode($chapter['required_blocks'] ?? 'null', true);
        }
        return $chapter;
    }

    public function findAll() {
        $stmt = $this->db->query("SELECT * FROM chapters ORDER BY order_num ASC");
        return array_map([self::class, 'decode'], $stmt->fetchAll());
    }

    public function findById($id) {
        $stmt = $this->db->prepare("SELECT * FROM chapters WHERE id = ?");
        $stmt->execute([$id]);
        return self::decode($stmt->fetch());
    }

    public function findByOrder($order_num) {
        $stmt = $this->db->prepare("SELECT id FROM chapters WHERE order_num = ?");
        $stmt->execute([$order_num]);
        return $stmt->fetch();
    }

    public function getUserProgress($user_id) {
        $stmt = $this->db->prepare("SELECT chapter_id, status, completed_at, best_score, attempts FROM user_chapter_progress WHERE user_id = ?");
        $stmt->execute([$user_id]);
        return $stmt->fetchAll();
    }

    // 챕터 목록에 사용자 상태 붙이기: 기록이 없으면 1챕터 또는 앞 챕터 완료 시 도전 가능
    public function withStatus(array $chapters, $user_id) {
        return self::statusFromRows($chapters, $this->getUserProgress($user_id));
    }

    // 진행 기록 행으로 상태 계산 (선생님·보호자 화면에서 여러 학생을 한 번에 조회할 때도 사용)
    public static function statusFromRows(array $chapters, array $rows) {
        $map = [];
        foreach ($rows as $p) {
            $map[$p['chapter_id']] = $p;
        }
        $prevCompleted = true;
        foreach ($chapters as &$chapter) {
            $row = $map[$chapter['id']] ?? null;
            $status = $row['status'] ?? null;
            if ($status === null || $status === 'locked') {
                $status = $prevCompleted ? 'in_progress' : 'locked';
            }
            $chapter['status'] = $status;
            $chapter['best_score'] = isset($row['best_score']) ? (int)$row['best_score'] : null;
            $chapter['attempts'] = (int)($row['attempts'] ?? 0);
            $prevCompleted = $status === 'completed';
        }
        return $chapters;
    }

    // 정답 제출 기록: 도전 횟수 +1, 최고 점수 갱신 (진행 상태는 건드리지 않음)
    public function recordAttempt($user_id, $chapter_id, $score) {
        $stmt = $this->db->prepare("
            INSERT INTO user_chapter_progress (user_id, chapter_id, status, best_score, attempts)
            VALUES (?, ?, 'in_progress', ?, 1)
            ON DUPLICATE KEY UPDATE
            attempts = attempts + 1,
            best_score = IF(VALUES(best_score) IS NULL, best_score, GREATEST(COALESCE(best_score, 0), VALUES(best_score)))
        ");
        $stmt->execute([$user_id, $chapter_id, $score]);
        $stmt = $this->db->prepare("SELECT best_score, attempts FROM user_chapter_progress WHERE user_id = ? AND chapter_id = ?");
        $stmt->execute([$user_id, $chapter_id]);
        $row = $stmt->fetch();
        return [
            'bestScore' => isset($row['best_score']) ? (int)$row['best_score'] : null,
            'attempts' => (int)($row['attempts'] ?? 0),
        ];
    }

    public function getStatus($user_id, $chapter) {
        foreach ($this->withStatus($this->findAll(), $user_id) as $c) {
            if ((int)$c['id'] === (int)$chapter['id']) return $c['status'];
        }
        return 'locked';
    }

    public function updateProgress($user_id, $chapter_id, $status) {
        $stmt = $this->db->prepare("
            INSERT INTO user_chapter_progress (user_id, chapter_id, status, completed_at)
            VALUES (?, ?, ?, CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END)
            ON DUPLICATE KEY UPDATE
            status = VALUES(status),
            completed_at = COALESCE(completed_at, VALUES(completed_at))
        ");
        return $stmt->execute([$user_id, $chapter_id, $status, $status]);
    }

    // 잠금 해제: 이미 진행 중/완료면 그대로 둔다
    public function unlock($user_id, $chapter_id) {
        $stmt = $this->db->prepare("
            INSERT INTO user_chapter_progress (user_id, chapter_id, status) VALUES (?, ?, 'in_progress')
            ON DUPLICATE KEY UPDATE status = IF(status = 'locked', 'in_progress', status)
        ");
        return $stmt->execute([$user_id, $chapter_id]);
    }
}
