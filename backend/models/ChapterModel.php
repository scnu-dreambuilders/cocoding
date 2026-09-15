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
        $stmt = $this->db->prepare("SELECT chapter_id, status, completed_at FROM user_chapter_progress WHERE user_id = ?");
        $stmt->execute([$user_id]);
        return $stmt->fetchAll();
    }

    // 챕터 목록에 사용자 상태 붙이기: 기록이 없으면 1챕터 또는 앞 챕터 완료 시 도전 가능
    public function withStatus(array $chapters, $user_id) {
        $map = [];
        foreach ($this->getUserProgress($user_id) as $p) {
            $map[$p['chapter_id']] = $p['status'];
        }
        $prevCompleted = true;
        foreach ($chapters as &$chapter) {
            $status = $map[$chapter['id']] ?? null;
            if ($status === null || $status === 'locked') {
                $status = $prevCompleted ? 'in_progress' : 'locked';
            }
            $chapter['status'] = $status;
            $prevCompleted = $status === 'completed';
        }
        return $chapters;
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
