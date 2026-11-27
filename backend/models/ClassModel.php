<?php
// backend/models/ClassModel.php — 선생님 반과 반 학생
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/CoinModel.php';
require_once __DIR__ . '/../config/Validators.php';
require_once __DIR__ . '/../config/Settings.php';
require_once __DIR__ . '/../config/AppTime.php';

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

       같은 과제면 언제 끝냈든 같은 보상을 받는다. 보상을 나중에 올리면 이미 받은 학생은 차액을 받는다.
       보상을 내려도 준 코인은 회수하지 않는다. 직접 쓴 과제도 같은 규칙이다 (payAssignmentReward).
       coin_log 의 (user_id, reason, ref) 유니크 키가 같은 지급이 두 번 들어가는 것을 막는다.
       학생 한 명이 하루에 받는 과제 보상에는 상한이 있다 (운영 기준값 coin.assignment_daily). */

    // 한 학생이 끝낸 과제 중 보상을 덜 받은 것을 모두 채운다. 이번에 들어간 코인 합을 돌려준다.
    // 챕터 과제는 그 챕터를 통과했으면, 직접 쓴 과제는 '끝냈어요'를 눌렀으면 끝낸 것이다.
    // $chapterId 를 주면 그 챕터로 낸 과제만 본다 (챕터를 막 통과했을 때)
    public function settleRewardsForStudent($studentId, $chapterId = null) {
        $sql = "SELECT a.id, a.reward_coins FROM class_assignments a
                JOIN class_members m ON m.class_id = a.class_id AND m.student_id = ?
                LEFT JOIN user_chapter_progress p ON p.user_id = m.student_id
                     AND p.chapter_id = a.chapter_id AND p.status = 'completed'
                LEFT JOIN assignment_done d ON d.assignment_id = a.id AND d.student_id = m.student_id
                WHERE a.reward_coins > 0";
        $args = [$studentId];
        if ($chapterId !== null) {
            $sql .= " AND a.chapter_id = ? AND p.id IS NOT NULL";
            $args[] = $chapterId;
        } else {
            $sql .= " AND ((a.chapter_id IS NOT NULL AND p.id IS NOT NULL) OR (a.chapter_id IS NULL AND d.id IS NOT NULL))";
        }
        $sql .= " ORDER BY a.id";
        $stmt = $this->db->prepare($sql);
        $stmt->execute($args);
        $total = 0;
        foreach ($stmt->fetchAll() as $a) {
            $total += $this->payAssignmentReward($studentId, (int)$a['id'], (int)$a['reward_coins']);
        }
        return $total;
    }

    // 과제 보상을 한 학생에게 준다. 이번에 들어간 코인을 돌려준다 (없으면 0).
    // 처음이면 보상 전액을 주고, 이미 받았는데 보상이 그 뒤에 올랐으면 차액만 준다.
    // 보상이 내려간 경우에는 아무것도 하지 않는다 (준 코인을 회수하지 않는다).
    //
    // 하루 상한(운영 기준값 coin.assignment_daily)을 넘게 되면 이번에는 주지 않는다.
    // 못 받은 보상은 없어지지 않고, 다음 날 학생이 과제 목록을 열 때 들어온다.
    //
    // 중복 방지: 첫 지급은 ref = '과제번호', 차액은 ref = '과제번호:오른 뒤 보상' 으로 남긴다.
    // 같은 금액으로 올린 요청이 두 번 와도 유니크 키가 두 번째를 막는다
    public function payAssignmentReward($studentId, $assignmentId, $reward) {
        $reward = (int)$reward;
        if ($reward <= 0) return 0;
        // '오늘 받은 합계 확인'과 '지급' 사이에 같은 학생의 다른 요청이 끼어들면 둘 다 상한을 통과한다.
        // 학생 행을 잠가서 한 번에 하나씩만 지나가게 한다
        $own = !$this->db->inTransaction();
        if ($own) $this->db->beginTransaction();
        try {
            $this->db->prepare("SELECT id FROM users WHERE id = ? FOR UPDATE")->execute([$studentId]);
            $paid = $this->payAssignmentRewardLocked($studentId, $assignmentId, $reward);
            if ($own) $this->db->commit();
            return $paid;
        } catch (Throwable $e) {
            if ($own) $this->db->rollBack();
            throw $e;
        }
    }

    private function payAssignmentRewardLocked($studentId, $assignmentId, $reward) {
        $stmt = $this->db->prepare("SELECT COALESCE(SUM(amount), 0) FROM coin_log
            WHERE user_id = ? AND reason = 'assignment' AND (ref = ? OR ref LIKE ?)");
        $stmt->execute([$studentId, (string)$assignmentId, $assignmentId . ':%']);
        $paid = (int)$stmt->fetchColumn();
        $due = $reward - $paid;
        if ($due <= 0) return 0;

        $stmt = $this->db->prepare("SELECT COALESCE(SUM(amount), 0) FROM coin_log
            WHERE user_id = ? AND reason = 'assignment' AND created_at >= ?");
        $stmt->execute([$studentId, AppTime::today() . ' 00:00:00']);
        if ((int)$stmt->fetchColumn() + $due > Settings::int('coin.assignment_daily')) return 0;

        $ref = $paid === 0 ? (string)$assignmentId : $assignmentId . ':' . $reward;
        return (new CoinModel())->grant($studentId, $due, 'assignment', $ref);
    }

    // 과제 하나에 대해, 이미 끝낸 반 학생 모두에게 보상을 맞춰 준다.
    // 챕터 과제는 그 챕터를 통과한 학생, 직접 쓴 과제는 '끝냈어요'를 누른 학생이 대상이다.
    // 아직 못 받은 학생은 전액을, 보상이 오르기 전에 받은 학생은 차액을 받는다.
    // 이번에 코인이 들어간 학생 수를 돌려준다 (선생님이 과제를 내거나 보상을 고쳤을 때)
    public function settleRewardsForAssignment($assignmentId) {
        $stmt = $this->db->prepare("SELECT a.reward_coins, m.student_id FROM class_assignments a
            JOIN class_members m ON m.class_id = a.class_id
            LEFT JOIN user_chapter_progress p ON p.user_id = m.student_id
                 AND p.chapter_id = a.chapter_id AND p.status = 'completed'
            LEFT JOIN assignment_done d ON d.assignment_id = a.id AND d.student_id = m.student_id
            WHERE a.id = ? AND a.reward_coins > 0
              AND ((a.chapter_id IS NOT NULL AND p.id IS NOT NULL) OR (a.chapter_id IS NULL AND d.id IS NOT NULL))");
        $stmt->execute([$assignmentId]);
        $paid = 0;
        foreach ($stmt->fetchAll() as $row) {
            if ($this->payAssignmentReward((int)$row['student_id'], (int)$assignmentId, (int)$row['reward_coins']) > 0) {
                $paid++;
            }
        }
        return $paid;
    }
}
