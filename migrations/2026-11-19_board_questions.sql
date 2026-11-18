-- ════════════════════════════════════════════════
-- 2026-11-19 코딩 게시판: 토론 + 질문 (PR #13 백엔드 요청)
--   mysql -u root cocoding < migrations/2026-11-19_board_questions.sql
-- 새로 설치하는 경우에는 schema.sql만 실행하면 됨
--
-- 서버가 첫 요청에서 backend/config/SchemaUpgrader.php로 같은 내용을 자동 적용하므로
-- 보통은 실행할 필요가 없다. DB 계정에 ALTER 권한이 없을 때만 phpMyAdmin에서 실행하세요.
-- ════════════════════════════════════════════════
USE cocoding;

-- 토론 글과 질문 글을 한 표에서 다룬다.
-- 종류가 오지 않은 옛 글은 기본값 그대로 discussion(토론)으로 남는다
ALTER TABLE board_posts ADD COLUMN kind ENUM('discussion', 'question') NOT NULL DEFAULT 'discussion' AFTER user_id;

-- 질문에만 쓰는 태그. chapter는 '1'~'5' 또는 'free', 안 고르면 NULL
ALTER TABLE board_posts ADD COLUMN chapter VARCHAR(8) NULL AFTER body;
ALTER TABLE board_posts ADD COLUMN blocks JSON NULL AFTER chapter;

-- 채택한 답변. 이 값이 있으면 해결됨(status=solved)으로 본다.
-- 해결 상태를 따로 저장하지 않는 이유는 두 값이 어긋나는 것을 막기 위해서다
ALTER TABLE board_posts ADD COLUMN accepted_comment_id INT NULL AFTER blocks;

ALTER TABLE board_posts ADD INDEX idx_kind (kind, hidden, created_at);
ALTER TABLE board_posts ADD INDEX idx_chapter (kind, chapter);

-- 채택한 답변이 지워지면 DB가 알아서 미해결로 돌려준다
ALTER TABLE board_posts
    ADD CONSTRAINT fk_board_accepted FOREIGN KEY (accepted_comment_id)
    REFERENCES board_comments(id) ON DELETE SET NULL;
