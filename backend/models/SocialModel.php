<?php
// backend/models/SocialModel.php
// 좋아요 · 팔로우(맞팔 = 친구) · 프로필 공개 범위
require_once __DIR__ . '/../config/Database.php';

class SocialModel {
    const MAX_FOLLOWING = 200;

    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    /* ── 좋아요 ─────────────────────────────── */

    public function likeCount($project_id) {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM project_likes WHERE project_id = ?");
        $stmt->execute([$project_id]);
        return (int)$stmt->fetchColumn();
    }

    public function hasLiked($project_id, $user_id) {
        $stmt = $this->db->prepare("SELECT 1 FROM project_likes WHERE project_id = ? AND user_id = ?");
        $stmt->execute([$project_id, $user_id]);
        return (bool)$stmt->fetchColumn();
    }

    // 눌러서 켜고 끄기 → ['liked' => bool, 'count' => int]
    public function toggleLike($project_id, $user_id) {
        $stmt = $this->db->prepare("INSERT IGNORE INTO project_likes (project_id, user_id) VALUES (?, ?)");
        $stmt->execute([$project_id, $user_id]);
        $liked = $stmt->rowCount() > 0;
        if (!$liked) {
            $this->db->prepare("DELETE FROM project_likes WHERE project_id = ? AND user_id = ?")->execute([$project_id, $user_id]);
        }
        return ['liked' => $liked, 'count' => $this->likeCount($project_id)];
    }

    // 내가 받은 좋아요 총합 (99 넘으면 화면에서 +99로 표시)
    public function likesReceived($user_id) {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM project_likes l JOIN projects p ON p.id = l.project_id WHERE p.user_id = ?");
        $stmt->execute([$user_id]);
        return (int)$stmt->fetchColumn();
    }

    /* ── 팔로우 ─────────────────────────────── */

    public function follow($follower_id, $following_id) {
        if ($follower_id === $following_id) return false;
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM follows WHERE follower_id = ?");
        $stmt->execute([$follower_id]);
        if ((int)$stmt->fetchColumn() >= self::MAX_FOLLOWING) return false;
        $stmt = $this->db->prepare("INSERT IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)");
        $stmt->execute([$follower_id, $following_id]);
        return true;
    }

    public function unfollow($follower_id, $following_id) {
        $this->db->prepare("DELETE FROM follows WHERE follower_id = ? AND following_id = ?")->execute([$follower_id, $following_id]);
    }

    public function isFollowing($follower_id, $following_id) {
        $stmt = $this->db->prepare("SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?");
        $stmt->execute([$follower_id, $following_id]);
        return (bool)$stmt->fetchColumn();
    }

    public function isFriend($a, $b) {
        return $this->isFollowing($a, $b) && $this->isFollowing($b, $a);
    }

    public function counts($user_id) {
        $stmt = $this->db->prepare("SELECT
            (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS followers,
            (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following");
        $stmt->execute([$user_id, $user_id]);
        $row = $stmt->fetch();
        return ['followers' => (int)$row['followers'], 'following' => (int)$row['following']];
    }

    // 서로 팔로우한 사람들 = 친구 목록
    public function friends($user_id) {
        $stmt = $this->db->prepare("SELECT u.id, u.username, u.xp, u.bio
            FROM follows f
            JOIN follows back ON back.follower_id = f.following_id AND back.following_id = f.follower_id
            JOIN users u ON u.id = f.following_id
            WHERE f.follower_id = ? ORDER BY u.username ASC");
        $stmt->execute([$user_id]);
        return $stmt->fetchAll();
    }

    // 내가 팔로우만 한 사람 (아직 맞팔 아님)
    public function followingOnly($user_id) {
        $stmt = $this->db->prepare("SELECT u.id, u.username, u.xp
            FROM follows f JOIN users u ON u.id = f.following_id
            WHERE f.follower_id = ? AND NOT EXISTS (
                SELECT 1 FROM follows b WHERE b.follower_id = f.following_id AND b.following_id = f.follower_id)
            ORDER BY u.username ASC");
        $stmt->execute([$user_id]);
        return $stmt->fetchAll();
    }

    /* ── 프로필 보기 권한 ────────────────────── */

    // 공개 범위에 따라 남의 프로필을 볼 수 있는지
    public function canViewProfile($viewer_id, $owner) {
        if ((int)$owner['id'] === (int)$viewer_id) return true;
        switch ($owner['profile_visibility'] ?? 'public') {
            case 'private': return false;
            case 'friends': return $this->isFriend($viewer_id, (int)$owner['id']);
            default: return true;
        }
    }
}
