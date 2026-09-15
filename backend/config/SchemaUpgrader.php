<?php
// backend/config/SchemaUpgrader.php
// 기존 DB를 새 기능에 맞게 자동으로 업그레이드.
// migrations/*.sql과 같은 내용이며, 몇 번 실행해도 안전하다.
// 한 번 끝나면 data/.schema_version에 기록해서 다음 요청부터는 건너뛴다.
class SchemaUpgrader {
    const VERSION = '2026-09-17';

    private static function markerPath() {
        return __DIR__ . '/../data/.schema_version';
    }

    public static function ensure(PDO $db) {
        $marker = self::markerPath();
        if (is_file($marker) && trim((string)file_get_contents($marker)) === self::VERSION) return;
        try {
            self::upgrade($db);
            file_put_contents($marker, self::VERSION);
        } catch (Throwable $e) {
            // 권한 부족 등 — 요청 자체는 계속 처리하고, 다음 요청에서 다시 시도
            error_log('[SchemaUpgrader] ' . $e->getMessage());
        }
    }

    private static function column(PDO $db, $table, $column) {
        $stmt = $db->prepare("SELECT DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?");
        $stmt->execute([$table, $column]);
        $type = $stmt->fetchColumn();
        return $type === false ? null : strtolower($type);
    }

    private static function hasIndex(PDO $db, $table, $index) {
        $stmt = $db->prepare("SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1");
        $stmt->execute([$table, $index]);
        return (bool)$stmt->fetchColumn();
    }

    public static function upgrade(PDO $db) {
        // 무대 캡처 썸네일(data URL, 수 KB~수십 KB)
        if (self::column($db, 'projects', 'thumbnail_url') !== 'mediumtext') {
            $db->exec("ALTER TABLE projects MODIFY thumbnail_url MEDIUMTEXT NULL");
        }
        if (!self::hasIndex($db, 'projects', 'idx_public')) {
            $db->exec("ALTER TABLE projects ADD INDEX idx_public (is_public, updated_at)");
        }
        // 코코 꾸미기: 장착 여부
        if (self::column($db, 'user_items', 'equipped') === null) {
            $db->exec("ALTER TABLE user_items ADD COLUMN equipped TINYINT(1) NOT NULL DEFAULT 0 AFTER item_type");
        }
        if (!self::hasIndex($db, 'remakes', 'idx_original')) {
            $db->exec("ALTER TABLE remakes ADD INDEX idx_original (original_project_id)");
        }

        /* ── 2026-09-16 보안 개선 ── */
        // 로그아웃 시 토큰 무효화: 토큰에 담긴 버전과 다르면 거부
        if (self::column($db, 'users', 'token_version') === null) {
            $db->exec("ALTER TABLE users ADD COLUMN token_version INT NOT NULL DEFAULT 0");
        }
        // 신고가 쌓여 자동으로 숨겨진 작품
        if (self::column($db, 'projects', 'report_hidden') === null) {
            $db->exec("ALTER TABLE projects ADD COLUMN report_hidden TINYINT(1) NOT NULL DEFAULT 0");
        }
        $db->exec("CREATE TABLE IF NOT EXISTS project_reports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            project_id INT NOT NULL,
            user_id INT NOT NULL,
            reason VARCHAR(100) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_report (project_id, user_id),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        // 요청 제한 기록 (파일 대신 DB — 서버 폴더 권한과 무관하게 항상 동작)
        $db->exec("CREATE TABLE IF NOT EXISTS rate_limits (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            key_hash CHAR(64) NOT NULL,
            attempted_at INT UNSIGNED NOT NULL,
            INDEX idx_key_time (key_hash, attempted_at)
        ) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        /* ── 2026-09-17 정답 제출 채점 ── */
        if (self::column($db, 'user_chapter_progress', 'best_score') === null) {
            $db->exec("ALTER TABLE user_chapter_progress ADD COLUMN best_score TINYINT UNSIGNED NULL AFTER completed_at");
        }
        if (self::column($db, 'user_chapter_progress', 'attempts') === null) {
            $db->exec("ALTER TABLE user_chapter_progress ADD COLUMN attempts INT NOT NULL DEFAULT 0 AFTER best_score");
        }

        // 예전 버전이 챕터를 다시 완료할 때마다 중복 지급한 아이템 정리 + 종류 바로잡기
        $db->exec("DELETE a FROM user_items a JOIN user_items b
                   ON a.user_id = b.user_id AND a.item_name = b.item_name AND a.id > b.id");
        $db->exec("UPDATE user_items SET item_type = 'hat' WHERE item_name = '빨간 모자'");
        $db->exec("UPDATE user_items SET item_type = 'glasses' WHERE item_name = '반짝이는 안경'");
        $db->exec("UPDATE user_items SET item_type = 'background' WHERE item_name IN ('푸른 숲 배경', '우주선 배경')");

        // 챕터가 예전 블록 id(move-x처럼 하이픈)로 되어 있으면 새 내용으로 교체
        $chapters = [
            1 => ['이동과 방향 – 캐릭터를 움직여보자', '캔버스 좌표(x/y)를 이해하고 캐릭터를 원하는 방향으로 움직여요.',
                  '화살표 키 → ← ↑ ↓ 를 누르면 캐릭터가 그 방향으로 움직이게 만들어보세요!',
                  '["when_key", "move_x", "move_y", "set_dir"]', '["when_key", "move_x", "move_y"]'],
            2 => ['반복 – 같은 동작을 여러 번', '반복 블록으로 같은 동작을 정해진 횟수만큼, 또는 계속 실행해요.',
                  '캐릭터가 화면을 10번 왕복하는 애니메이션을 만들어보세요!',
                  '["repeat_n", "forever", "wait", "move_steps"]', '["repeat_n", "move_x"]'],
            3 => ['조건 – 상황에 따라 다르게 행동', '만약 ~라면 블록과 닿음·키 감지로 상황에 맞게 행동해요.',
                  '공이 벽에 닿으면 반대 방향으로 튕기는 프로그램을 만들어보세요!',
                  '["if_then", "touching", "key_pressed", "turn_around"]', '["forever", "if_then", "touching", "turn_around"]'],
            4 => ['변수 – 점수와 상태를 기억하기', '변수로 점수를 기억하고 바꿔요.',
                  '동전을 먹으면 점수 +1, 10점이 되면 "클리어!"라고 말하는 게임을 완성해보세요.',
                  '["var_set", "var_change", "var_show", "var_hide", "variables_get", "logic_compare", "goto_random"]', '["var_change", "touching", "logic_compare"]'],
            5 => ['이벤트와 장면 – 게임 흐름 만들기', '메시지를 주고받고 장면을 바꿔서 게임의 시작·진행·끝을 만들어요.',
                  '시작 화면 → 게임 → 게임오버 3장면 게임을 완성해보세요!',
                  '["broadcast", "when_receive", "switch_scene", "when_scene_start", "show", "hide"]', '["broadcast", "when_receive", "switch_scene"]'],
        ];
        $stmt = $db->prepare("UPDATE chapters SET title = ?, concept = ?, mission = ?, new_blocks = ?, required_blocks = ?
                              WHERE id = ? AND new_blocks LIKE '%-%'");
        foreach ($chapters as $id => [$title, $concept, $mission, $new, $required]) {
            $stmt->execute([$title, $concept, $mission, $new, $required, $id]);
        }
    }
}
