<?php
// backend/models/CoinModel.php
// 코인(재화) 지급·차감과 출석 체크.
// 중복 지급은 coin_log의 (user_id, reason, ref) 유니크 키로 막는다.
require_once __DIR__ . '/../config/Database.php';

class CoinModel {
    // 지급 사유별 기본 금액
    const REWARD = [
        'attendance' => 10,  // 출석 (연속 보너스 별도)
        'chapter' => 50,     // 챕터 첫 완료
        'project' => 5,      // 자유 창작 첫 저장
    ];
    const STREAK_BONUS = 5;        // 연속 출석 하루당 추가
    const STREAK_BONUS_MAX = 7;    // 7일째부터는 더 늘지 않음

    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public function balance($user_id) {
        $stmt = $this->db->prepare("SELECT coins FROM users WHERE id = ?");
        $stmt->execute([$user_id]);
        return (int)$stmt->fetchColumn();
    }

    // 코인 지급. 같은 (사유, ref)로는 한 번만 — 이미 받았으면 0을 돌려준다
    public function grant($user_id, $amount, $reason, $ref = null) {
        $amount = (int)$amount;
        if ($amount <= 0) return 0;
        $stmt = $this->db->prepare("INSERT IGNORE INTO coin_log (user_id, amount, reason, ref) VALUES (?, ?, ?, ?)");
        $stmt->execute([$user_id, $amount, $reason, $ref]);
        if ($stmt->rowCount() === 0) return 0; // 이미 지급됨
        $this->db->prepare("UPDATE users SET coins = coins + ? WHERE id = ?")->execute([$amount, $user_id]);
        return $amount;
    }

    // 코인 차감. 잔액이 모자라면 false (동시에 두 번 눌러도 음수가 되지 않게 WHERE로 확인)
    public function spend($user_id, $amount, $reason, $ref = null) {
        $amount = (int)$amount;
        if ($amount <= 0) return false;
        $stmt = $this->db->prepare("UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?");
        $stmt->execute([$amount, $user_id, $amount]);
        if ($stmt->rowCount() === 0) return false;
        $this->db->prepare("INSERT INTO coin_log (user_id, amount, reason, ref) VALUES (?, ?, ?, ?)")
            ->execute([$user_id, -$amount, $reason, $ref]);
        return true;
    }

    public function history($user_id, $limit = 20) {
        $stmt = $this->db->prepare("SELECT amount, reason, ref, created_at FROM coin_log WHERE user_id = ? ORDER BY id DESC LIMIT ?");
        $stmt->bindValue(1, $user_id, PDO::PARAM_INT);
        $stmt->bindValue(2, $limit, PDO::PARAM_INT);
        $stmt->execute();
        return array_map(function ($row) {
            $row['amount'] = (int)$row['amount'];
            return $row;
        }, $stmt->fetchAll());
    }

    /* ── 출석 ───────────────────────────────── */

    public function todayRow($user_id) {
        $stmt = $this->db->prepare("SELECT attended_on, reward_coins, streak FROM attendance WHERE user_id = ? AND attended_on = CURDATE()");
        $stmt->execute([$user_id]);
        $row = $stmt->fetch();
        return $row ?: null;
    }

    // 이번 달 출석한 날짜 (달력 표시용)
    public function monthDays($user_id) {
        $stmt = $this->db->prepare("SELECT DAY(attended_on) AS d FROM attendance
            WHERE user_id = ? AND YEAR(attended_on) = YEAR(CURDATE()) AND MONTH(attended_on) = MONTH(CURDATE())");
        $stmt->execute([$user_id]);
        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }

    public function currentStreak($user_id) {
        $row = $this->todayRow($user_id);
        if ($row) return (int)$row['streak'];
        // 오늘 전이면 어제까지의 연속일이 이어진다
        $stmt = $this->db->prepare("SELECT streak FROM attendance WHERE user_id = ? AND attended_on = CURDATE() - INTERVAL 1 DAY");
        $stmt->execute([$user_id]);
        return (int)$stmt->fetchColumn();
    }

    public function totalDays($user_id) {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM attendance WHERE user_id = ?");
        $stmt->execute([$user_id]);
        return (int)$stmt->fetchColumn();
    }

    // 오늘 출석 처리. 이미 했으면 ['already' => true]
    public function checkIn($user_id) {
        if ($this->todayRow($user_id)) {
            return ['already' => true, 'streak' => $this->currentStreak($user_id), 'coins' => 0];
        }
        // 어제 출석했으면 연속, 아니면 1일차부터
        $stmt = $this->db->prepare("SELECT streak FROM attendance WHERE user_id = ? AND attended_on = CURDATE() - INTERVAL 1 DAY");
        $stmt->execute([$user_id]);
        $yesterday = (int)$stmt->fetchColumn();
        $streak = $yesterday > 0 ? $yesterday + 1 : 1;
        $coins = self::REWARD['attendance'] + self::STREAK_BONUS * (min($streak, self::STREAK_BONUS_MAX) - 1);

        $stmt = $this->db->prepare("INSERT IGNORE INTO attendance (user_id, attended_on, reward_coins, streak) VALUES (?, CURDATE(), ?, ?)");
        $stmt->execute([$user_id, $coins, $streak]);
        if ($stmt->rowCount() === 0) { // 같은 순간에 두 번 눌린 경우
            return ['already' => true, 'streak' => $this->currentStreak($user_id), 'coins' => 0];
        }
        $this->grant($user_id, $coins, 'attendance', date('Y-m-d'));
        return ['already' => false, 'streak' => $streak, 'coins' => $coins];
    }
}
