-- ════════════════════════════════════════════════
-- 정답 제출 자동 채점 (2026-09-17) — 한 번만 실행
-- ※ 백엔드가 첫 요청 때 자동으로 적용하므로(SchemaUpgrader) 보통은 따로 실행할 필요 없음.
--   DB 계정에 ALTER 권한이 없는 서버에서만 관리자가 직접 실행하세요.
-- ════════════════════════════════════════════════
USE cocoding;

-- 챕터별 최고 점수(0~100)와 제출 횟수
ALTER TABLE user_chapter_progress ADD COLUMN best_score TINYINT UNSIGNED NULL AFTER completed_at;
ALTER TABLE user_chapter_progress ADD COLUMN attempts INT NOT NULL DEFAULT 0 AFTER best_score;
