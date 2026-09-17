<?php
// backend/models/StudentProgress.php
// 선생님(반 학생)·보호자(자녀)가 보는 학습 진도 요약.
// 이메일·태어난 해 같은 개인정보는 넣지 않는다 — 닉네임과 학습 기록만.
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/ChapterModel.php';

class StudentProgress {
    // $studentIds 순서대로 요약 배열을 돌려준다
    public static function summarize(array $studentIds) {
        $ids = array_values(array_unique(array_map('intval', $studentIds)));
        if (!$ids) return [];
        $db = Database::getInstance();
        $in = implode(',', array_fill(0, count($ids), '?'));

        $stmt = $db->prepare("SELECT id, username, consent_status FROM users WHERE id IN ($in)");
        $stmt->execute($ids);
        $users = [];
        foreach ($stmt->fetchAll() as $u) $users[(int)$u['id']] = $u;

        $stmt = $db->prepare("SELECT user_id, chapter_id, status, completed_at, best_score, attempts FROM user_chapter_progress WHERE user_id IN ($in)");
        $stmt->execute($ids);
        $rows = [];
        foreach ($stmt->fetchAll() as $r) $rows[(int)$r['user_id']][] = $r;

        $stmt = $db->prepare("SELECT user_id, COUNT(*) AS total, SUM(is_public = 1 AND report_hidden = 0) AS shared, MAX(updated_at) AS last_saved
                              FROM projects WHERE user_id IN ($in) GROUP BY user_id");
        $stmt->execute($ids);
        $projects = [];
        foreach ($stmt->fetchAll() as $p) $projects[(int)$p['user_id']] = $p;

        $chapters = (new ChapterModel())->findAll();
        $result = [];
        foreach ($ids as $id) {
            if (!isset($users[$id])) continue;
            $mine = $rows[$id] ?? [];
            $lastActive = $projects[$id]['last_saved'] ?? null;
            foreach ($mine as $r) {
                if ($r['completed_at'] !== null && ($lastActive === null || $r['completed_at'] > $lastActive)) $lastActive = $r['completed_at'];
            }
            $list = [];
            $completed = 0;
            foreach (ChapterModel::statusFromRows($chapters, $mine) as $c) {
                if ($c['status'] === 'completed') $completed++;
                $list[] = [
                    'order_num' => (int)$c['order_num'],
                    'status' => $c['status'],
                    'best_score' => $c['best_score'],
                    'attempts' => $c['attempts'],
                ];
            }
            $result[] = [
                'id' => $id,
                'username' => $users[$id]['username'],
                'consent_status' => $users[$id]['consent_status'],
                'completed' => $completed,
                'chapter_count' => count($chapters),
                'chapters' => $list,
                'projects' => (int)($projects[$id]['total'] ?? 0),
                'shared_projects' => (int)($projects[$id]['shared'] ?? 0),
                'last_active' => $lastActive,
            ];
        }
        return $result;
    }
}
