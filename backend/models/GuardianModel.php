<?php
// backend/models/GuardianModel.php — 보호자와 자녀 계정 연결
require_once __DIR__ . '/../config/Database.php';

class GuardianModel {
    const MAX_CHILDREN = 10;

    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function studentIds($guardianId) {
        $stmt = $this->db->prepare("SELECT student_id FROM guardian_links WHERE guardian_id = ? ORDER BY created_at ASC, id ASC");
        $stmt->execute([$guardianId]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    public function isLinked($guardianId, $studentId) {
        $stmt = $this->db->prepare("SELECT 1 FROM guardian_links WHERE guardian_id = ? AND student_id = ?");
        $stmt->execute([$guardianId, $studentId]);
        return (bool)$stmt->fetchColumn();
    }

    public function guardianCount($studentId) {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM guardian_links WHERE student_id = ?");
        $stmt->execute([$studentId]);
        return (int)$stmt->fetchColumn();
    }

    public function link($guardianId, $studentId) {
        $stmt = $this->db->prepare("INSERT IGNORE INTO guardian_links (guardian_id, student_id) VALUES (?, ?)");
        return $stmt->execute([$guardianId, $studentId]);
    }

    public function unlink($guardianId, $studentId) {
        $stmt = $this->db->prepare("DELETE FROM guardian_links WHERE guardian_id = ? AND student_id = ?");
        $stmt->execute([$guardianId, $studentId]);
        return $stmt->rowCount() > 0;
    }
}
