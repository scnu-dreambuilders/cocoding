-- ════════════════════════════════════════════════
-- 좋아요·팔로우·프로필·경험치·업적·토론 게시판·자유 과제 (2026-11-04) — 한 번만 실행
-- ※ 백엔드가 첫 요청 때 자동으로 적용하므로(SchemaUpgrader) 보통은 따로 실행할 필요 없음.
--   DB 계정에 ALTER 권한이 없는 서버에서만 관리자가 직접 실행하세요.
-- ════════════════════════════════════════════════
USE cocoding;

-- 프로필·경험치
ALTER TABLE users ADD COLUMN bio VARCHAR(50) NULL;
ALTER TABLE users ADD COLUMN xp INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN profile_visibility ENUM('public','friends','private') NOT NULL DEFAULT 'public';

CREATE TABLE IF NOT EXISTS project_likes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_like (project_id, user_id),
    INDEX idx_project (project_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS follows (
    id INT AUTO_INCREMENT PRIMARY KEY,
    follower_id INT NOT NULL,
    following_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_follow (follower_id, following_id),
    INDEX idx_following (following_id),
    FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_achievements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    code VARCHAR(40) NOT NULL,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_achievement (user_id, code),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 토론 게시판
CREATE TABLE IF NOT EXISTS board_posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(80) NOT NULL,
    body TEXT NOT NULL,
    hidden TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_created (hidden, created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS board_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    body VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_post (post_id, created_at),
    FOREIGN KEY (post_id) REFERENCES board_posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS board_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    reason VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_board_report (post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES board_posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 과제: 챕터 배정 외에 선생님이 직접 쓰는 과제도 허용
-- (유니크 키를 외래키가 쓰고 있어서 class_id 인덱스를 먼저 만들어야 지울 수 있음)
ALTER TABLE class_assignments ADD COLUMN title VARCHAR(80) NULL AFTER chapter_id;
ALTER TABLE class_assignments ADD COLUMN reward_coins SMALLINT NOT NULL DEFAULT 0 AFTER note;
ALTER TABLE class_assignments ADD INDEX idx_class (class_id);
ALTER TABLE class_assignments DROP INDEX uniq_assignment;
ALTER TABLE class_assignments MODIFY chapter_id INT NULL;

CREATE TABLE IF NOT EXISTS assignment_done (
    id INT AUTO_INCREMENT PRIMARY KEY,
    assignment_id INT NOT NULL,
    student_id INT NOT NULL,
    note VARCHAR(200) NULL,
    done_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_done (assignment_id, student_id),
    FOREIGN KEY (assignment_id) REFERENCES class_assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
