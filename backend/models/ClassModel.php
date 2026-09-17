<?php
// backend/models/ClassModel.php — 선생님 반과 반 학생
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Validators.php';

class ClassModel {
    const MAX_CLASSES_PER_TEACHER = 10;
    const MAX_MEMBERS = 40;
    const MAX_NAME_LENGTH = 40;
    const CODE_LENGTH = 6;

    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public static function validateName($name) {
        if (!is_string($name) || trim($name) === '' || mb_strlen(trim($name)) > self::MAX_NAME_LENGTH) {
            return "반 이름은 1~" . self::MAX_NAME_LENGTH . "자로 써주세요.";
        }
        return null;
    }

    public function findById($id) {
        $stmt = $this->db->prepare("SELECT * FROM classes WHERE id = ?");
        $stmt->execute([$id]);
        return $stmt->fetch();
    }

    public function findByCode($code) {
        $stmt = $this->db->prepare("SELECT c.*, u.username AS teacher_name FROM classes c JOIN users u ON u.id = c.teacher_id WHERE c.join_code = ?");
        $stmt->execute([$code]);
        return $stmt->fetch();
    }

    public function findByTeacher($teacherId) {
        $stmt = $this->db->prepare("SELECT c.id, c.name, c.join_code, c.created_at,
                (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id) AS member_count
            FROM classes c WHERE c.teacher_id = ? ORDER BY c.created_at ASC, c.id ASC");
        $stmt->execute([$teacherId]);
        return array_map(function ($c) {
            $c['id'] = (int)$c['id'];
            $c['member_count'] = (int)$c['member_count'];
            return $c;
        }, $stmt->fetchAll());
    }

    // 학생이 참여한 반 (참여 코드는 보여주지 않음)
    public function findByStudent($studentId) {
        $stmt = $this->db->prepare("SELECT c.id, c.name, u.username AS teacher_name, m.joined_at
            FROM class_members m JOIN classes c ON c.id = m.class_id JOIN users u ON u.id = c.teacher_id
            WHERE m.student_id = ? ORDER BY m.joined_at ASC");
        $stmt->execute([$studentId]);
        return array_map(function ($c) {
            $c['id'] = (int)$c['id'];
            return $c;
        }, $stmt->fetchAll());
    }

    public function countByTeacher($teacherId) {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM classes WHERE teacher_id = ?");
        $stmt->execute([$teacherId]);
        return (int)$stmt->fetchColumn();
    }

    public function create($teacherId, $name) {
        for ($try = 0; ; $try++) {
            try {
                $stmt = $this->db->prepare("INSERT INTO classes (teacher_id, name, join_code) VALUES (?, ?, ?)");
                $stmt->execute([$teacherId, trim($name), Validators::randomCode(self::CODE_LENGTH)]);
                return (int)$this->db->lastInsertId();
            } catch (PDOException $e) {
                if ($try >= 3) throw $e; // 참여 코드가 우연히 겹친 경우 다시 시도
            }
        }
    }

    public function rename($id, $name) {
        $stmt = $this->db->prepare("UPDATE classes SET name = ? WHERE id = ?");
        return $stmt->execute([trim($name), $id]);
    }

    // 참여 코드가 퍼졌을 때 새 코드로 바꾸기 (이미 들어온 학생은 그대로)
    public function regenerateCode($id) {
        for ($try = 0; ; $try++) {
            try {
                $stmt = $this->db->prepare("UPDATE classes SET join_code = ? WHERE id = ?");
                $stmt->execute([Validators::randomCode(self::CODE_LENGTH), $id]);
                return;
            } catch (PDOException $e) {
                if ($try >= 3) throw $e;
            }
        }
    }

    public function delete($id) {
        $stmt = $this->db->prepare("DELETE FROM classes WHERE id = ?");
        return $stmt->execute([$id]);
    }

    public function memberIds($classId) {
        $stmt = $this->db->prepare("SELECT student_id FROM class_members WHERE class_id = ? ORDER BY joined_at ASC, id ASC");
        $stmt->execute([$classId]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    public function isMember($classId, $studentId) {
        $stmt = $this->db->prepare("SELECT 1 FROM class_members WHERE class_id = ? AND student_id = ?");
        $stmt->execute([$classId, $studentId]);
        return (bool)$stmt->fetchColumn();
    }

    public function addMember($classId, $studentId) {
        $stmt = $this->db->prepare("INSERT IGNORE INTO class_members (class_id, student_id) VALUES (?, ?)");
        $stmt->execute([$classId, $studentId]);
        return $stmt->rowCount() > 0;
    }

    public function removeMember($classId, $studentId) {
        $stmt = $this->db->prepare("DELETE FROM class_members WHERE class_id = ? AND student_id = ?");
        $stmt->execute([$classId, $studentId]);
        return $stmt->rowCount() > 0;
    }
}
