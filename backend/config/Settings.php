<?php
// backend/config/Settings.php
// 운영 기준값. 관리자 웹에서 고치고, 코드 곳곳에서 읽는다.
//
// settings 표에 행이 없으면 아래 DEFAULTS 를 쓴다. 그래서 표가 비어 있어도,
// DB 접속이 늦어 표를 못 읽어도 서비스는 그대로 돌아간다. 기준값을 코드에서
// 지워버리지 않고 기본값으로 남겨두는 이유다.
//
// SPEC 은 관리자 화면이 입력칸을 직접 그릴 수 있게 하려고 둔다. 화면에 항목 이름과
// 범위를 하드코딩하면, 기준값을 하나 추가할 때마다 프론트도 같이 고쳐야 한다.
require_once __DIR__ . '/Database.php';

class Settings {
    /* 기준값 기본값 — settings 표에 행이 없을 때 쓰는 값 */
    const DEFAULTS = [
        'coin.attendance'    => 10,
        'coin.attendance_streak' => 5,
        'coin.chapter'       => 50,
        'coin.project'       => 5,
        'coin.game.typing'   => 2,
        'coin.game.quiz'     => 10,
        'coco.daily_limit'   => 30,
        'report.hide_count'  => 3,
        'board.post_cooldown' => 5,
    ];

    /* 관리자 화면이 입력칸을 그릴 때 쓰는 정보. min~max 밖의 값은 저장하지 않는다 */
    const SPEC = [
        'coin.attendance' => [
            'group' => '코인', 'label' => '출석 코인',
            'help' => '하루 한 번 출석 도장을 찍을 때 주는 코인이에요.',
            'min' => 0, 'max' => 1000,
        ],
        'coin.attendance_streak' => [
            'group' => '코인', 'label' => '연속 출석 보너스',
            'help' => '연속으로 출석한 하루마다 더 주는 코인이에요 (7일째까지만 늘어나요).',
            'min' => 0, 'max' => 1000,
        ],
        'coin.chapter' => [
            'group' => '코인', 'label' => '챕터 첫 완료 코인',
            'help' => '챕터를 처음 끝냈을 때 한 번만 주는 코인이에요.',
            'min' => 0, 'max' => 1000,
        ],
        'coin.project' => [
            'group' => '코인', 'label' => '자유 창작 첫 저장 코인',
            'help' => '자유 창작 작품을 처음 저장했을 때 주는 코인이에요.',
            'min' => 0, 'max' => 1000,
        ],
        'coin.game.typing' => [
            'group' => '코인', 'label' => '타자게임 정답 코인',
            'help' => '타자게임에서 한 문제 맞힐 때마다 주는 코인이에요. 같은 단계는 하루 한 번만 받아요.',
            'min' => 0, 'max' => 100,
        ],
        'coin.game.quiz' => [
            'group' => '코인', 'label' => '복습 퀴즈 정답 코인',
            'help' => '복습 퀴즈에서 한 문제 맞힐 때마다 주는 코인이에요. 오답 재도전도 같아요.',
            'min' => 0, 'max' => 100,
        ],
        'coco.daily_limit' => [
            'group' => '코코 대화', 'label' => '하루 질문 횟수',
            'help' => '학생 한 명이 24시간 동안 코코에게 물어볼 수 있는 횟수예요.',
            'min' => 1, 'max' => 500,
        ],
        'report.hide_count' => [
            'group' => '신고', 'label' => '자동 숨김 신고 수',
            'help' => '서로 다른 이 인원이 신고하면 글·작품을 자동으로 숨겨요.',
            'min' => 1, 'max' => 50,
        ],
        'board.post_cooldown' => [
            'group' => '게시판', 'label' => '글쓰기 간격(초)',
            'help' => '도배를 막기 위해 글을 연달아 올릴 수 없는 시간이에요.',
            'min' => 0, 'max' => 3600,
        ],
    ];

    private static $cache = null; // 한 요청에서 표를 한 번만 읽는다

    /* 저장된 값 + 기본값을 합쳐서 전부 돌려준다 */
    public static function all() {
        if (self::$cache !== null) return self::$cache;
        $values = self::DEFAULTS;
        try {
            $rows = Database::getInstance()->query("SELECT name, value FROM settings");
            foreach ($rows as $row) {
                // 코드에서 더 이상 쓰지 않는 옛 기준값이 표에 남아 있어도 무시한다
                if (array_key_exists($row['name'], $values)) {
                    $values[$row['name']] = $row['value'];
                }
            }
        } catch (Throwable $e) {
            // 표가 아직 없거나 DB를 못 읽어도 기본값으로 돌아간다
        }
        self::$cache = $values;
        return $values;
    }

    /* 숫자 기준값 하나. 아는 이름이 아니면 예외 — 오타를 조용히 넘기지 않는다 */
    public static function int($name) {
        if (!array_key_exists($name, self::DEFAULTS)) {
            throw new InvalidArgumentException("모르는 기준값: $name");
        }
        $all = self::all();
        $value = (int)$all[$name];
        $spec = isset(self::SPEC[$name]) ? self::SPEC[$name] : null;
        // 누군가 DB를 직접 고쳐 범위 밖 값을 넣어도 코드가 이상하게 돌지 않도록 조인다
        if ($spec !== null) {
            if ($value < $spec['min']) $value = (int)self::DEFAULTS[$name];
            if ($value > $spec['max']) $value = (int)self::DEFAULTS[$name];
        }
        return $value;
    }

    /* 관리자 화면에 보여줄 목록 — 지금 값 + 기본값 + 범위 + 설명 */
    public static function describe() {
        $all = self::all();
        $out = [];
        foreach (self::SPEC as $name => $spec) {
            $out[] = $spec + [
                'name' => $name,
                'value' => (int)$all[$name],
                'default' => (int)self::DEFAULTS[$name],
                'changed' => (int)$all[$name] !== (int)self::DEFAULTS[$name],
            ];
        }
        return $out;
    }

    /* 기준값 저장. 틀리면 오류 메시지(문자열), 맞으면 null */
    public static function set($name, $value, $adminId) {
        if (!isset(self::SPEC[$name])) return "모르는 기준값이에요: " . mb_substr((string)$name, 0, 40);
        $spec = self::SPEC[$name];

        if (is_bool($value) || !is_numeric($value) || (int)$value != $value) {
            return "{$spec['label']}은 숫자로 적어주세요.";
        }
        $value = (int)$value;
        if ($value < $spec['min'] || $value > $spec['max']) {
            return "{$spec['label']}은 {$spec['min']}부터 {$spec['max']}까지만 넣을 수 있어요.";
        }

        $stmt = Database::getInstance()->prepare(
            "INSERT INTO settings (name, value, updated_by) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)"
        );
        $stmt->execute([$name, (string)$value, $adminId]);
        self::$cache = null; // 다음 읽기에서 새 값을 보도록
        return null;
    }

    /* 기준값을 기본값으로 되돌린다 (행을 지우면 기본값이 된다) */
    public static function reset($name) {
        if (!isset(self::SPEC[$name])) return "모르는 기준값이에요.";
        Database::getInstance()->prepare("DELETE FROM settings WHERE name = ?")->execute([$name]);
        self::$cache = null;
        return null;
    }
}
