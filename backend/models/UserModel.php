<?php
// backend/models/UserModel.php
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/../config/Validators.php';

class UserModel {
    const ROLES = ['student', 'teacher', 'guardian'];

    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    // 본인에게만 돌려주는 정보 (로그인·내 정보). consent_code는 동의 전 학생 본인만 봄
    // tags: NULL이면 설문 전(null), 건너뛰었으면 빈 배열
    public function findById($id) {
        $stmt = $this->db->prepare("SELECT id, username, email, role, birth_year, consent_status, consent_code, level, tags, created_at
                                    FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $user = $stmt->fetch();
        if ($user) {
            $user['id'] = (int)$user['id'];
            $user['level'] = (int)$user['level'];
            $user['birth_year'] = $user['birth_year'] === null ? null : (int)$user['birth_year'];
            $user['tags'] = $user['tags'] === null ? null : (json_decode($user['tags'], true) ?? []);
            if ($user['consent_status'] !== 'pending') $user['consent_code'] = null;
        }
        return $user;
    }

    public function findByEmail($email) {
        $stmt = $this->db->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        return $stmt->fetch();
    }

    public function findByUsername($username) {
        $stmt = $this->db->prepare("SELECT id FROM users WHERE username = ?");
        $stmt->execute([$username]);
        return $stmt->fetch();
    }

    public function passwordHash($id) {
        $stmt = $this->db->prepare("SELECT password_hash FROM users WHERE id = ?");
        $stmt->execute([$id]);
        return $stmt->fetchColumn();
    }

    // 학생: 태어난 해로 보호자 동의 필요 여부 결정 / 선생님·보호자: 설문 없이 바로 시작(tags = [])
    public function create($username, $email, $password, $role = 'student', $birthYear = null) {
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $needsConsent = $role === 'student' && Validators::needsGuardianConsent($birthYear);
        $tags = $role === 'student' ? null : '[]';

        for ($try = 0; ; $try++) {
            $code = $needsConsent ? Validators::randomCode(8) : null;
            try {
                $stmt = $this->db->prepare("INSERT INTO users (username, email, password_hash, role, birth_year, consent_status, consent_code, tags)
                                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$username, $email, $hash, $role, $role === 'student' ? $birthYear : null,
                    $needsConsent ? 'pending' : 'not_required', $code, $tags]);
                return (int)$this->db->lastInsertId();
            } catch (PDOException $e) {
                // 동의 코드가 우연히 겹친 경우만 다시 시도
                if ($try >= 3 || !$needsConsent || strpos($e->getMessage(), 'consent_code') === false) throw $e;
            }
        }
    }

    public function updateSurvey($id, $level, $tags) {
        $stmt = $this->db->prepare("UPDATE users SET level = ?, tags = ? WHERE id = ?");
        return $stmt->execute([$level, json_encode(array_values($tags), JSON_UNESCAPED_UNICODE), $id]);
    }

    public function updateUsername($id, $username) {
        $stmt = $this->db->prepare("UPDATE users SET username = ? WHERE id = ?");
        return $stmt->execute([$username, $id]);
    }

    public function updatePassword($id, $password) {
        $stmt = $this->db->prepare("UPDATE users SET password_hash = ? WHERE id = ?");
        return $stmt->execute([password_hash($password, PASSWORD_BCRYPT), $id]);
    }

    // 탈퇴: 작품·진도·아이템·반 참여·보호자 연결은 외래키 ON DELETE CASCADE로 함께 삭제
    public function delete($id) {
        $stmt = $this->db->prepare("DELETE FROM users WHERE id = ?");
        return $stmt->execute([$id]);
    }

    /* ── 보호자 동의 ─────────────────────────── */

    public function findPendingByConsentCode($code) {
        $stmt = $this->db->prepare("SELECT id, username, birth_year FROM users
                                    WHERE consent_code = ? AND consent_status = 'pending' AND role = 'student'");
        $stmt->execute([$code]);
        return $stmt->fetch();
    }

    public function grantConsent($studentId) {
        $stmt = $this->db->prepare("UPDATE users SET consent_status = 'granted', consent_code = NULL, consent_at = CURRENT_TIMESTAMP WHERE id = ?");
        return $stmt->execute([$studentId]);
    }

    // 보호자가 모두 연결을 끊으면 동의 철회 → 다시 동의 전 상태, 공개했던 작품은 비공개로
    public function revokeConsent($studentId) {
        for ($try = 0; ; $try++) {
            try {
                $stmt = $this->db->prepare("UPDATE users SET consent_status = 'pending', consent_code = ?, consent_at = NULL
                                            WHERE id = ? AND consent_status = 'granted'");
                $stmt->execute([Validators::randomCode(8), $studentId]);
                break;
            } catch (PDOException $e) {
                if ($try >= 3) throw $e;
            }
        }
        $this->db->prepare("UPDATE projects SET is_public = 0 WHERE user_id = ?")->execute([$studentId]);
    }
}
