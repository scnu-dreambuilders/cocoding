<?php
// backend/models/QuestionModel.php
require_once __DIR__ . '/../config/Database.php';

class QuestionModel {
    const MAX_TITLE_LENGTH = 100;
    const MAX_BODY_LENGTH = 2000;
    const PAGE_SIZE = 30;
    const CATEGORIES = ['블록 오류', '자유창작 팁', '일반 질문'];

    // 목록에서는 답변 개수만 같이 보여준다 (본문은 상세에서만)
    const LIST_COLUMNS = "q.id, q.user_id, q.category, q.title, q.created_at, q.updated_at, u.username,
        (SELECT COUNT(*) FROM answers a WHERE a.question_id = q.id) AS answer_count";

    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    // Returns an error message string, or null if the input is valid.
    public static function validateInput($category, $title, $body) {
        if (!in_array($category, self::CATEGORIES, true)) {
            return "카테고리는 " . implode(', ', self::CATEGORIES) . " 중 하나여야 합니다.";
        }
        if (!is_string($title) || trim($title) === '' || mb_strlen($title) > self::MAX_TITLE_LENGTH) {
            return "제목은 1~" . self::MAX_TITLE_LENGTH . "자 이내여야 합니다.";
        }
        if (!is_string($body) || trim($body) === '' || mb_strlen($body) > self::MAX_BODY_LENGTH) {
            return "내용은 1~" . self::MAX_BODY_LENGTH . "자 이내여야 합니다.";
        }
        return null;
    }

    // $category / $keyword가 없으면 전체
    public function findAll($category = null, $keyword = null) {
        $where = [];
        $params = [];
        if ($category !== null) {
            $where[] = "q.category = ?";
            $params[] = $category;
        }
        if ($keyword !== null && $keyword !== '') {
            $where[] = "(q.title LIKE ? OR q.body LIKE ?)";
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $keyword) . '%';
            $params[] = $like;
            $params[] = $like;
        }
        $sql = "SELECT " . self::LIST_COLUMNS . " FROM questions q JOIN users u ON u.id = q.user_id";
        if ($where) $sql .= " WHERE " . implode(' AND ', $where);
        $sql .= " ORDER BY q.created_at DESC LIMIT " . self::PAGE_SIZE;
        $stmt = $this->db->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    public function findById($id) {
        $stmt = $this->db->prepare("SELECT q.id, q.user_id, q.category, q.title, q.body, q.created_at, q.updated_at, u.username
            FROM questions q JOIN users u ON u.id = q.user_id WHERE q.id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public function create($user_id, $category, $title, $body) {
        $stmt = $this->db->prepare("INSERT INTO questions (user_id, category, title, body) VALUES (?, ?, ?, ?)");
        $stmt->execute([$user_id, $category, trim($title), trim($body)]);
        return (int)$this->db->lastInsertId();
    }

    public function delete($id) {
        $stmt = $this->db->prepare("DELETE FROM questions WHERE id = ?");
        return $stmt->execute([$id]);
    }
}
