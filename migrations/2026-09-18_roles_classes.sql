-- ════════════════════════════════════════════════
-- 계정 유형 · 보호자 동의 · 선생님 반 · 리메이크 허용 (2026-09-18) — 한 번만 실행
-- ※ 백엔드가 첫 요청 때 자동으로 적용하므로(SchemaUpgrader) 보통은 따로 실행할 필요 없음.
--   DB 계정에 ALTER 권한이 없는 서버에서만 관리자가 직접 실행하세요.
-- ════════════════════════════════════════════════
USE cocoding;

-- 계정 유형(학생/선생님/보호자)과 만 14세 미만 보호자 동의
ALTER TABLE users ADD COLUMN role ENUM('student', 'teacher', 'guardian') NOT NULL DEFAULT 'student' AFTER password_hash;
ALTER TABLE users ADD COLUMN birth_year SMALLINT NULL AFTER role;
ALTER TABLE users ADD COLUMN consent_status ENUM('not_required', 'pending', 'granted') NOT NULL DEFAULT 'not_required' AFTER birth_year;
ALTER TABLE users ADD COLUMN consent_code CHAR(8) NULL AFTER consent_status, ADD UNIQUE KEY uniq_consent_code (consent_code);
ALTER TABLE users ADD COLUMN consent_at TIMESTAMP NULL AFTER consent_code;

-- 공개 작품을 친구가 리메이크해도 되는지
ALTER TABLE projects ADD COLUMN allow_remake TINYINT(1) NOT NULL DEFAULT 1 AFTER is_public;

CREATE TABLE IF NOT EXISTS guardian_links (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guardian_id INT NOT NULL,
    student_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_link (guardian_id, student_id),
    FOREIGN KEY (guardian_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS classes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    teacher_id INT NOT NULL,
    name VARCHAR(40) NOT NULL,
    join_code CHAR(6) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_join_code (join_code),
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS class_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL,
    student_id INT NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_member (class_id, student_id),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
