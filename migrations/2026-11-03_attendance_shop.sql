-- ════════════════════════════════════════════════
-- 출석 체크 · 코인 · 상점 (2026-11-03) — 한 번만 실행
-- ※ 백엔드가 첫 요청 때 자동으로 적용하므로(SchemaUpgrader) 보통은 따로 실행할 필요 없음.
--   DB 계정에 ALTER 권한이 없는 서버에서만 관리자가 직접 실행하세요.
-- ════════════════════════════════════════════════
USE cocoding;

ALTER TABLE users ADD COLUMN coins INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS attendance (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    attended_on DATE NOT NULL,
    reward_coins SMALLINT NOT NULL DEFAULT 0,
    streak SMALLINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_day (user_id, attended_on),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS coin_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount INT NOT NULL,
    reason VARCHAR(40) NOT NULL,
    ref VARCHAR(60) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_ref (user_id, reason, ref),
    INDEX idx_user_time (user_id, created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
