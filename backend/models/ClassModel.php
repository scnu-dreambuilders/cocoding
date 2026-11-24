<?php
// backend/models/ClassModel.php — 선생님 반과 반 학생
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/CoinModel.php';
require_once __DIR__ . '/../config/Validators.php';

class ClassModel {
    const MAX_CLASSES_PER_TEACHER = 10;
    const MAX_MEMBERS = 100;
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

    // 같은 선생님의 다른 반으로 이동 — class_id만 바꾸므로 joined_at(가입 시점)은 그대로 유지됨
    public function moveMember($fromClassId, $toClassId, $studentId) {
        $stmt = $this->db->prepare("UPDATE class_members SET class_id = ? WHERE class_id = ? AND student_id = ?");
        $stmt->execute([$toClassId, $fromClassId, $studentId]);
        return $stmt->rowCount() > 0;
    }

    /* ── 챕터 과제 보상 ───────────────────────────
       챕터 과제는 학생이 그 챕터를 통과했는지로 완료를 판정한다. 보상도 같은 기준으로 준다.
       과제를 내기 전에 이미 통과한 학생도 완료로 보이므로 보상도 똑같이 받는다.

       과제 하나에 한 번만 준다. coin_log 의 (user_id, reason, ref) 유니크 키가 두 번째를 막는다.
       직접 쓴 과제의 '끝냈어요'와 같은 reason('assignment')·ref(과제 번호)를 쓴다.
       그래서 보상 금액을 나중에 올려도 이미 받은 학생에게 차액을 더 주지는 않는다. */

    // 한 학생이 받을 수 있는 챕터 과제 보상을 모두 준다. 이번에 새로 받은 코인 합을 돌려준다.
    // $chapterId 를 주면 그 챕터로 낸 과제만 본다 (챕터를 막 통과했을 때)
    public function settleChapterRewardsForStudent($studentId, $chapterId = null) {
        $sql = "SELECT a.id, a.reward_coins FROM class_assignments a
                JOIN class_members m ON m.class_id = a.class_id AND m.student_id = ?
                JOIN user_chapter_progress p ON p.user_id = m.student_id
                     AND p.chapter_id = a.chapter_id AND p.status = 'completed'
                WHERE a.chapter_id IS NOT NULL AND a.reward_coins > 0";
        $args = [$studentId];
        if ($chapterId !== null) {
            $sql .= " AND a.chapter_id = ?";
            $args[] = $chapterId;
        }
        $stmt = $this->db->prepare($sql);
        $stmt->execute($args);
        $coins = new CoinModel();
        $total = 0;
        foreach ($stmt->fetchAll() as $a) {
            $total += $coins->grant($studentId, (int)$a['reward_coins'], 'assignment', (string)$a['id']);
        }
        return $total;
    }

    // 과제 하나에 대해, 이미 그 챕터를 통과한 반 학생 모두에게 보상을 준다.
    // 이번에 새로 받은 학생 수를 돌려준다 (선생님이 과제를 내거나 보상을 고쳤을 때)
    public function settleChapterRewardsForAssignment($assignmentId) {
        $stmt = $this->db->prepare("SELECT a.reward_coins, m.student_id FROM class_assignments a
            JOIN class_members m ON m.class_id = a.class_id
            JOIN user_chapter_progress p ON p.user_id = m.student_id
                 AND p.chapter_id = a.chapter_id AND p.status = 'completed'
            WHERE a.id = ? AND a.chapter_id IS NOT NULL AND a.reward_coins > 0");
        $stmt->execute([$assignmentId]);
        $coins = new CoinModel();
        $paid = 0;
        foreach ($stmt->fetchAll() as $row) {
            if ($coins->grant((int)$row['student_id'], (int)$row['reward_coins'], 'assignment', (string)$assignmentId) > 0) {
                $paid++;
            }
        }
        return $paid;
    }
}
