-- ════════════════════════════════════════════════
-- 보안 개선 (2026-09-16) — 한 번만 실행
-- ※ 백엔드가 첫 요청 때 자동으로 적용하므로(SchemaUpgrader) 보통은 따로 실행할 필요 없음.
--   DB 계정에 ALTER 권한이 없는 서버에서만 관리자가 직접 실행하세요.
-- ════════════════════════════════════════════════
USE cocoding;

-- 로그아웃 시 토큰 무효화
ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0;

-- 신고 누적으로 자동 비공개된 작품
ALTER TABLE projects ADD COLUMN report_hidden TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS project_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    user_id INT NOT NULL,
    reason VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_report (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 요청 제한 기록
CREATE TABLE IF NOT EXISTS rate_limits (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    key_hash CHAR(64) NOT NULL,
    attempted_at INT UNSIGNED NOT NULL,
    INDEX idx_key_time (key_hash, attempted_at)
);
