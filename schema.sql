CREATE DATABASE IF NOT EXISTS cocoding DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cocoding;

-- 유저 테이블 (tags: NULL = 관심사 설문 전, [] = 건너뜀)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    level TINYINT DEFAULT 1,
    tags JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 챕터 테이블 (블록 id·미션 판정 로직은 frontend/src/data/chapters.js와 맞춤)
CREATE TABLE chapters (
    id INT PRIMARY KEY,
    order_num TINYINT UNIQUE NOT NULL,
    title VARCHAR(100) NOT NULL,
    concept TEXT,
    mission TEXT,
    new_blocks JSON,
    required_blocks JSON,
    reward_item VARCHAR(100)
);

-- 유저 챕터 진행 상황
CREATE TABLE user_chapter_progress (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    chapter_id INT NOT NULL,
    status ENUM('locked', 'in_progress', 'completed') DEFAULT 'locked',
    completed_at TIMESTAMP NULL,
    UNIQUE(user_id, chapter_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
);

-- 프로젝트 테이블
-- blocks_data: { version: 2, workspace, sprites, scenes, sounds }
-- thumbnail_url: 무대 캡처 이미지(data URL)
CREATE TABLE projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    chapter_id INT NULL,
    title VARCHAR(200) NOT NULL,
    blocks_data JSON NOT NULL,
    track ENUM('chapter', 'free') DEFAULT 'chapter',
    is_public BOOLEAN DEFAULT FALSE,
    thumbnail_url MEDIUMTEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_public (is_public, updated_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
);

-- 유저 아이템 (코코 꾸미기 보상). 종류별로 하나만 equipped = 1
CREATE TABLE user_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    item_type ENUM('hat', 'glasses', 'background', 'accessory') NOT NULL,
    equipped TINYINT(1) NOT NULL DEFAULT 0,
    acquired_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 리메이크 기록 (원작자 카드에 리메이크 수 표시)
CREATE TABLE remakes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    original_project_id INT NOT NULL,
    remaked_project_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_original (original_project_id),
    FOREIGN KEY (original_project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (remaked_project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 초기 챕터 데이터 (방향성 문서 v3의 챕터 1~5)
INSERT INTO chapters (id, order_num, title, concept, mission, new_blocks, required_blocks, reward_item) VALUES
(1, 1, '이동과 방향 – 캐릭터를 움직여보자', '캔버스 좌표(x/y)를 이해하고 캐릭터를 원하는 방향으로 움직여요.', '화살표 키 → ← ↑ ↓ 를 누르면 캐릭터가 그 방향으로 움직이게 만들어보세요!', '["when_key", "move_x", "move_y", "set_dir"]', '["when_key", "move_x", "move_y"]', '빨간 모자'),
(2, 2, '반복 – 같은 동작을 여러 번', '반복 블록으로 같은 동작을 정해진 횟수만큼, 또는 계속 실행해요.', '캐릭터가 화면을 10번 왕복하는 애니메이션을 만들어보세요!', '["repeat_n", "forever", "wait", "move_steps"]', '["repeat_n", "move_x"]', '반짝이는 안경'),
(3, 3, '조건 – 상황에 따라 다르게 행동', '만약 ~라면 블록과 닿음·키 감지로 상황에 맞게 행동해요.', '공이 벽에 닿으면 반대 방향으로 튕기는 프로그램을 만들어보세요!', '["if_then", "touching", "key_pressed", "turn_around"]', '["forever", "if_then", "touching", "turn_around"]', '푸른 숲 배경'),
(4, 4, '변수 – 점수와 상태를 기억하기', '변수로 점수를 기억하고 바꿔요.', '동전을 먹으면 점수 +1, 10점이 되면 "클리어!"라고 말하는 게임을 완성해보세요.', '["var_set", "var_change", "var_show", "var_hide", "variables_get", "logic_compare", "goto_random"]', '["var_change", "touching", "logic_compare"]', '황금 트로피'),
(5, 5, '이벤트와 장면 – 게임 흐름 만들기', '메시지를 주고받고 장면을 바꿔서 게임의 시작·진행·끝을 만들어요.', '시작 화면 → 게임 → 게임오버 3장면 게임을 완성해보세요!', '["broadcast", "when_receive", "switch_scene", "when_scene_start", "show", "hide"]', '["broadcast", "when_receive", "switch_scene"]', '우주선 배경');
