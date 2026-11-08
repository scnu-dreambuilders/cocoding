<?php
// backend/models/ProgressModel.php
// 경험치·레벨 · 업적 · 학습 기록 그래프
// 레벨은 경험치로 정해진다 (관심사 설문의 '코딩 수준'과는 다른 값).
require_once __DIR__ . '/../config/Database.php';

class ProgressModel {
    // 지급 사유별 경험치
    const XP = [
        'attendance' => 5,
        'chapter' => 100,
        'project' => 20,
        'like_received' => 2,
    ];
    const LEVEL_STEP = 150;   // 레벨 하나 올리는 데 필요한 경험치
    const MAX_LEVEL = 30;

    // 업적: code => [이모지, 이름, 설명]
    // [이름, 설명] — 화면에 보이는 아이콘은 프론트엔드에서 붙인다
    const ACHIEVEMENTS = [
        'first_step'    => ['첫 걸음',        '챕터 1을 완료했어요'],
        'all_chapters'  => ['졸업생',          '챕터 5개를 모두 완료했어요'],
        'perfect'       => ['만점왕',          '채점에서 100점을 받았어요'],
        'maker'         => ['작품 수집가',     '작품을 5개 만들었어요'],
        'sharer'        => ['나눔쟁이',        '작품을 처음 공개했어요'],
        'loved'         => ['인기쟁이',        '좋아요를 10개 받았어요'],
        'streak_7'      => ['일주일 개근',     '7일 연속 출석했어요'],
        'collector'     => ['멋쟁이 코코',     '꾸미기 아이템을 5개 모았어요'],
        'friendly'      => ['친구 많은 코더',  '친구가 3명이 되었어요'],
    ];

    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public static function levelOf($xp) {
        return min(self::MAX_LEVEL, 1 + intdiv(max(0, (int)$xp), self::LEVEL_STEP));
    }

    // 화면에 보여줄 레벨 정보 (다음 레벨까지 얼마나 남았는지)
    public static function levelInfo($xp) {
        $xp = max(0, (int)$xp);
        $level = self::levelOf($xp);
        $into = $xp % self::LEVEL_STEP;
        $isMax = $level >= self::MAX_LEVEL;
        return [
            'xp' => $xp,
            'level' => $level,
            'intoLevel' => $isMax ? self::LEVEL_STEP : $into,
            'levelStep' => self::LEVEL_STEP,
            'toNext' => $isMax ? 0 : self::LEVEL_STEP - $into,
            'isMax' => $isMax,
        ];
    }

    public function addXp($user_id, $amount) {
        $amount = (int)$amount;
        if ($amount <= 0) return;
        $this->db->prepare("UPDATE users SET xp = xp + ? WHERE id = ?")->execute([$amount, $user_id]);
    }

    public function xp($user_id) {
        $stmt = $this->db->prepare("SELECT xp FROM users WHERE id = ?");
        $stmt->execute([$user_id]);
        return (int)$stmt->fetchColumn();
    }

    /* ── 업적 ───────────────────────────────── */

    // 새로 받았으면 업적 정보, 이미 있으면 null
    public function award($user_id, $code) {
        if (!isset(self::ACHIEVEMENTS[$code])) return null;
        $stmt = $this->db->prepare("INSERT IGNORE INTO user_achievements (user_id, code) VALUES (?, ?)");
        $stmt->execute([$user_id, $code]);
        if ($stmt->rowCount() === 0) return null;
        [$name, $desc] = self::ACHIEVEMENTS[$code];
        return ['code' => $code, 'name' => $name, 'desc' => $desc];
    }

    public function earned($user_id) {
        $stmt = $this->db->prepare("SELECT code, earned_at FROM user_achievements WHERE user_id = ?");
        $stmt->execute([$user_id]);
        $map = [];
        foreach ($stmt->fetchAll() as $row) $map[$row['code']] = $row['earned_at'];

        $list = [];
        foreach (self::ACHIEVEMENTS as $code => [$name, $desc]) {
            $list[] = [
                'code' => $code, 'name' => $name, 'desc' => $desc,
                'earned' => isset($map[$code]), 'earned_at' => $map[$code] ?? null,
            ];
        }
        return $list;
    }

    // 지금 상태를 보고 받을 수 있는 업적을 모두 준다 → 새로 받은 것만 돌려줌
    public function checkAll($user_id) {
        // ? 개수를 세어서 넘기므로 조건을 늘려도 개수를 따로 맞출 필요가 없다
        $sql = "SELECT
            (SELECT COUNT(*) FROM user_chapter_progress WHERE user_id = ? AND status = 'completed') AS chapters,
            (SELECT COUNT(*) FROM chapters) AS chapter_total,
            (SELECT MAX(best_score) FROM user_chapter_progress WHERE user_id = ?) AS best,
            (SELECT COUNT(*) FROM projects WHERE user_id = ?) AS projects,
            (SELECT COUNT(*) FROM projects WHERE user_id = ? AND is_public = 1) AS shared,
            (SELECT COUNT(*) FROM project_likes l JOIN projects p ON p.id = l.project_id WHERE p.user_id = ?) AS likes,
            (SELECT MAX(streak) FROM attendance WHERE user_id = ?) AS streak,
            (SELECT COUNT(*) FROM user_items WHERE user_id = ?) AS items,
            (SELECT COUNT(*) FROM follows f JOIN follows b ON b.follower_id = f.following_id AND b.following_id = f.follower_id
             WHERE f.follower_id = ?) AS friends";
        $stmt = $this->db->prepare($sql);
        $stmt->execute(array_fill(0, substr_count($sql, '?'), $user_id));
        $s = $stmt->fetch();

        $rules = [
            'first_step' => (int)$s['chapters'] >= 1,
            'all_chapters' => (int)$s['chapters'] >= max(1, (int)$s['chapter_total']),
            'perfect' => (int)$s['best'] >= 100,
            'maker' => (int)$s['projects'] >= 5,
            'sharer' => (int)$s['shared'] >= 1,
            'loved' => (int)$s['likes'] >= 10,
            'streak_7' => (int)$s['streak'] >= 7,
            'collector' => (int)$s['items'] >= 5,
            'friendly' => (int)$s['friends'] >= 3,
        ];
        $new = [];
        foreach ($rules as $code => $met) {
            if (!$met) continue;
            $awarded = $this->award($user_id, $code);
            if ($awarded) $new[] = $awarded;
        }
        return $new;
    }

    /* ── 학습 기록 그래프 ───────────────────── */

    // 최근 $days일 동안 날짜별 출석·챕터 완료·작품 저장 횟수
    public function activity($user_id, $days = 14) {
        $days = max(7, min(60, (int)$days));
        $since = date('Y-m-d', strtotime("-" . ($days - 1) . " days"));

        $buckets = [];
        for ($i = 0; $i < $days; $i++) {
            $buckets[date('Y-m-d', strtotime("$since +$i days"))] = ['date' => date('Y-m-d', strtotime("$since +$i days")),
                'attended' => 0, 'chapters' => 0, 'projects' => 0];
        }

        $queries = [
            'attended' => "SELECT attended_on AS d, COUNT(*) AS n FROM attendance WHERE user_id = ? AND attended_on >= ? GROUP BY d",
            'chapters' => "SELECT DATE(completed_at) AS d, COUNT(*) AS n FROM user_chapter_progress
                           WHERE user_id = ? AND completed_at IS NOT NULL AND DATE(completed_at) >= ? GROUP BY d",
            'projects' => "SELECT DATE(created_at) AS d, COUNT(*) AS n FROM projects WHERE user_id = ? AND DATE(created_at) >= ? GROUP BY d",
        ];
        foreach ($queries as $key => $sql) {
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$user_id, $since]);
            foreach ($stmt->fetchAll() as $row) {
                if (isset($buckets[$row['d']])) $buckets[$row['d']][$key] = (int)$row['n'];
            }
        }
        return array_values($buckets);
    }
}
