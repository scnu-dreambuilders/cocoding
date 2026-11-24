-- ============================================================
-- 코코딩 — 기존 DB 업그레이드 (전체 모음)
-- ============================================================
--
-- schema.sql 로 새로 설치하는 경우에는 이 파일을 실행할 필요가 없다.
-- 예전 버전으로 만들어진 DB를 지금 코드에 맞출 때만 쓴다.
--
-- backend/config/SchemaUpgrader.php 가 서버 첫 요청에서 같은 내용을 자동으로
-- 적용하므로 보통은 손으로 실행할 일이 없다. DB 계정에 ALTER 권한이 없어
-- 자동 적용이 안 될 때만 phpMyAdmin 에서 돌린다.
--
-- 아래는 날짜 순서다. 위에서부터 차례로 실행하면 되고, 이미 적용된 구간은
-- "Duplicate column" 같은 오류가 나므로 건너뛰고 그 다음 구간부터 실행한다.
--
--   mysql -u root cocoding < migrations/upgrade.sql
--
-- ============================================================

USE cocoding;


-- ============================================================
-- [2026-09-15] 2026-09-15_upgrade.sql
-- ============================================================

ALTER TABLE projects MODIFY thumbnail_url MEDIUMTEXT NULL;
ALTER TABLE projects ADD INDEX idx_public (is_public, updated_at);

-- 코코 꾸미기: 장착 여부
ALTER TABLE user_items ADD COLUMN equipped TINYINT(1) NOT NULL DEFAULT 0 AFTER item_type;

ALTER TABLE remakes ADD INDEX idx_original (original_project_id);

-- 예전 progress.php가 챕터를 다시 완료할 때마다 같은 아이템을 중복 지급했던 것 정리
DELETE a FROM user_items a
JOIN user_items b ON a.user_id = b.user_id AND a.item_name = b.item_name AND a.id > b.id;

-- 예전 보상은 전부 'accessory'로 들어갔으므로 아이템 종류 바로잡기
UPDATE user_items SET item_type = 'hat'        WHERE item_name = '빨간 모자';
UPDATE user_items SET item_type = 'glasses'    WHERE item_name = '반짝이는 안경';
UPDATE user_items SET item_type = 'background' WHERE item_name IN ('푸른 숲 배경', '우주선 배경');

-- 챕터 내용을 방향성 문서 v3 + 새 블록 id에 맞춤
UPDATE chapters SET title = '이동과 방향 – 캐릭터를 움직여보자',
  concept = '캔버스 좌표(x/y)를 이해하고 캐릭터를 원하는 방향으로 움직여요.',
  mission = '화살표 키 → ← ↑ ↓ 를 누르면 캐릭터가 그 방향으로 움직이게 만들어보세요!',
  new_blocks = '["when_key", "move_x", "move_y", "set_dir"]', required_blocks = '["when_key", "move_x", "move_y"]'
  WHERE id = 1;
UPDATE chapters SET title = '반복 – 같은 동작을 여러 번',
  concept = '반복 블록으로 같은 동작을 정해진 횟수만큼, 또는 계속 실행해요.',
  mission = '캐릭터가 화면을 10번 왕복하는 애니메이션을 만들어보세요!',
  new_blocks = '["repeat_n", "forever", "wait", "move_steps"]', required_blocks = '["repeat_n", "move_x"]'
  WHERE id = 2;
UPDATE chapters SET title = '조건 – 상황에 따라 다르게 행동',
  concept = '만약 ~라면 블록과 닿음·키 감지로 상황에 맞게 행동해요.',
  mission = '공이 벽에 닿으면 반대 방향으로 튕기는 프로그램을 만들어보세요!',
  new_blocks = '["if_then", "touching", "key_pressed", "turn_around"]', required_blocks = '["forever", "if_then", "touching", "turn_around"]'
  WHERE id = 3;
UPDATE chapters SET title = '변수 – 점수와 상태를 기억하기',
  concept = '변수로 점수를 기억하고 바꿔요.',
  mission = '동전을 먹으면 점수 +1, 10점이 되면 "클리어!"라고 말하는 게임을 완성해보세요.',
  new_blocks = '["var_set", "var_change", "var_show", "var_hide", "variables_get", "logic_compare", "goto_random"]', required_blocks = '["var_change", "touching", "logic_compare"]'
  WHERE id = 4;
UPDATE chapters SET title = '이벤트와 장면 – 게임 흐름 만들기',
  concept = '메시지를 주고받고 장면을 바꿔서 게임의 시작·진행·끝을 만들어요.',
  mission = '시작 화면 → 게임 → 게임오버 3장면 게임을 완성해보세요!',
  new_blocks = '["broadcast", "when_receive", "switch_scene", "when_scene_start", "show", "hide"]', required_blocks = '["broadcast", "when_receive", "switch_scene"]'
  WHERE id = 5;


-- ============================================================
-- [2026-09-16] 2026-09-16_security.sql
-- ============================================================

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


-- ============================================================
-- [2026-09-17] 2026-09-17_grading.sql
-- ============================================================

ALTER TABLE user_chapter_progress ADD COLUMN best_score TINYINT UNSIGNED NULL AFTER completed_at;
ALTER TABLE user_chapter_progress ADD COLUMN attempts INT NOT NULL DEFAULT 0 AFTER best_score;


-- ============================================================
-- [2026-09-18] 2026-09-18_roles_classes.sql
-- ============================================================

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

-- 선생님이 반에 내주는 과제 (처음 모양. 뒤의 [2026-11-04] 구간에서 제목·보상 컬럼이 붙는다)
CREATE TABLE IF NOT EXISTS class_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_id INT NOT NULL,
    chapter_id INT NOT NULL,
    note VARCHAR(200) NULL,
    due_on DATE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_assignment (class_id, chapter_id),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 비밀번호 재설정 링크 (토큰은 해시로만 저장)
CREATE TABLE IF NOT EXISTS password_resets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_token (token_hash),
    INDEX idx_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 교사 소속 정보
ALTER TABLE users ADD COLUMN IF NOT EXISTS affiliation VARCHAR(50) NULL AFTER consent_at;


-- ============================================================
-- [2026-11-03] 2026-11-03_attendance_shop.sql
-- ============================================================

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


-- ============================================================
-- [2026-11-04] 2026-11-04_social_progress.sql
-- ============================================================

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


-- ============================================================
-- [2026-11-18] 2026-11-18_role_enum_fix.sql
-- ============================================================

ALTER TABLE users MODIFY role ENUM('student', 'teacher', 'guardian', 'admin') NOT NULL DEFAULT 'student';

-- 옛 admin 계정은 지우지 않고 권한이 가장 가까운 선생님으로 옮긴다
UPDATE users SET role = 'teacher' WHERE role = 'admin';

ALTER TABLE users MODIFY role ENUM('student', 'teacher', 'guardian') NOT NULL DEFAULT 'student';

-- ============================================================
-- [2026-11-19] 2026-11-19_board_questions.sql
-- ============================================================

-- 코딩 게시판: 토론 글과 질문 글을 한 테이블에서 다룬다 (PR #13 요청)
-- 종류가 오지 않은 옛 글은 모두 discussion 으로 남는다 (기본값)
ALTER TABLE board_posts ADD COLUMN kind ENUM('discussion', 'question') NOT NULL DEFAULT 'discussion' AFTER user_id;

-- 질문에만 쓰는 태그. chapter 는 '1'~'5' 또는 'free', 안 고르면 NULL
ALTER TABLE board_posts ADD COLUMN chapter VARCHAR(8) NULL AFTER body;
ALTER TABLE board_posts ADD COLUMN blocks JSON NULL AFTER chapter;

-- 채택한 답변. 이 값이 있으면 해결됨(status=solved)으로 본다
ALTER TABLE board_posts ADD COLUMN accepted_comment_id INT NULL AFTER blocks;
ALTER TABLE board_posts ADD INDEX idx_kind (kind, hidden, created_at);
ALTER TABLE board_posts ADD INDEX idx_chapter (kind, chapter);

-- 채택한 답변이 지워지면 자동으로 미해결로 돌아가게
ALTER TABLE board_posts
    ADD CONSTRAINT fk_board_accepted FOREIGN KEY (accepted_comment_id)
    REFERENCES board_comments(id) ON DELETE SET NULL;

-- ============================================================
-- [2026-11-20] 2026-11-20_admin.sql
-- ============================================================

-- 관리자 웹(회원·기준값 관리)을 위한 추가
-- 관리자는 학생·선생님·보호자와 다른 축이라 role 을 늘리지 않고 따로 플래그를 둔다.
-- role 을 늘리면 기존 역할 분기(선생님 반, 보호자 연결 등)가 전부 영향을 받는다.
ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0 AFTER profile_visibility;

-- 정지된 계정은 로그인은 되지만 API 를 쓸 수 없다. 사유는 화면에 보여준다
ALTER TABLE users ADD COLUMN suspended TINYINT(1) NOT NULL DEFAULT 0 AFTER is_admin;
ALTER TABLE users ADD COLUMN suspended_reason VARCHAR(100) NULL AFTER suspended;

-- 운영 기준값. 행이 없으면 코드의 기본값(config/Settings.php DEFAULTS)을 쓰므로
-- 표가 비어 있어도 서비스는 그대로 돌아간다
CREATE TABLE IF NOT EXISTS settings (
    name VARCHAR(40) PRIMARY KEY,
    value VARCHAR(200) NOT NULL,
    updated_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 공지사항 — 관리자 웹에서 쓰고 학생 화면에 보인다
CREATE TABLE IF NOT EXISTS notices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(80) NOT NULL,
    body VARCHAR(2000) NOT NULL,
    -- pinned: 맨 위에 고정. published: 꺼두면 학생에게 안 보인다 (초안)
    pinned TINYINT(1) NOT NULL DEFAULT 0,
    published TINYINT(1) NOT NULL DEFAULT 1,
    -- 누구에게 보일지. all 이면 모두, 그 밖에는 그 역할에게만
    audience ENUM('all', 'student', 'teacher', 'guardian') NOT NULL DEFAULT 'all',
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_show (published, pinned, id),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- [2026-11-24] 2026-11-24_idle_logout.sql
-- 자리 비움 자동 로그아웃: 마지막으로 요청이 온 시각을 계정마다 적어 둔다
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP NULL AFTER token_version;


-- [2026-11-25] 2026-11-25_item_unique.sql
-- 같은 아이템이 두 번 지급되지 않게 유니크 키를 건다.
-- 먼저 이미 중복된 행을 정리한다. 중복 가운데 하나라도 장착 중이면 남기는 행에 장착 표시를 옮긴다
UPDATE user_items a
JOIN user_items b ON a.user_id = b.user_id AND a.item_name = b.item_name AND a.id < b.id AND b.equipped = 1
SET a.equipped = 1;
DELETE a FROM user_items a
JOIN user_items b ON a.user_id = b.user_id AND a.item_name = b.item_name AND a.id > b.id;
ALTER TABLE user_items ADD UNIQUE KEY uniq_user_item (user_id, item_name);
