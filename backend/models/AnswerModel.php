<?php
// backend/models/AnswerModel.php
require_once __DIR__ . '/../config/Database.php';

class AnswerModel {
    const MAX_BODY_LENGTH = 1000;

    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public static function validateInput($body) {
        if (!is_string($body) || trim($body) === '' || mb_strlen($body) > self::MAX_BODY_LENGTH) {
            return "답변은 1~" . self::MAX_BODY_LENGTH . "자 이내여야 합니다.";
        }
        return null;
    }

    public function findByQuestion($question_id) {
        $stmt = $this->db->prepare("SELECT a.id, a.question_id, a.user_id, a.body, a.created_at, a.updated_at, u.username
            FROM answers a JOIN users u ON u.id = a.user_id WHERE a.question_id = ? ORDER BY a.created_at ASC");
        $stmt->execute([$question_id]);
        return $stmt->fetchAll();
    }

    public function findById($id) {
        $stmt = $this->db->prepare("SELECT id, question_id, user_id, body, created_at FROM answers WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    public function create($question_id, $user_id, $body) {
        $stmt = $this->db->prepare("INSERT INTO answers (question_id, user_id, body) VALUES (?, ?, ?)");
        $stmt->execute([$question_id, $user_id, trim($body)]);
        return (int)$this->db->lastInsertId();
    }

    public function delete($id) {
        $stmt = $this->db->prepare("DELETE FROM answers WHERE id = ?");
        return $stmt->execute([$id]);
    }
}
