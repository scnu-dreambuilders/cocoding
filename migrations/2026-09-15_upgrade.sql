-- ════════════════════════════════════════════════
-- 기존 DB 업그레이드 (2026-09-15 기능 개편) — 한 번만 실행
--   mysql -u root cocoding < migrations/2026-09-15_upgrade.sql
-- 새로 설치하는 경우에는 schema.sql만 실행하면 됨
-- ════════════════════════════════════════════════
USE cocoding;

-- 무대 캡처 썸네일(data URL)을 저장할 수 있게 확장
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
