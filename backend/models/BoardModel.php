<?php
// backend/models/BoardModel.php
// 토론 게시판 — 글·댓글·신고. 팀원이 만든 Q&A 게시판과는 별개 메뉴다.
// 아이들이 쓰는 곳이라 신고가 3건 쌓이면 자동으로 숨긴다 (작품 신고와 같은 방식).
require_once __DIR__ . '/../config/Database.php';

class BoardModel {
    const MAX_TITLE = 80;
    const MAX_BODY = 1000;
    const MAX_COMMENT = 500;
    const PAGE_SIZE = 10;
    const REPORTS_TO_HIDE = 3;
    const REPORT_REASONS = ['나쁜 말이나 그림', '개인정보(얼굴·이름·전화번호)가 있어요', '광고·도배', '기타'];

    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public static function validate($title, $body) {
        if (!is_string($title) || trim($title) === '' || mb_strlen(trim($title)) > self::MAX_TITLE) {
            return "제목은 1~" . self::MAX_TITLE . "자로 써주세요.";
        }
        if (!is_string($body) || trim($body) === '' || mb_strlen(trim($body)) > self::MAX_BODY) {
            return "내용은 1~" . self::MAX_BODY . "자로 써주세요.";
        }
        return null;
    }

    public function list($page = 1) {
        $limit = self::PAGE_SIZE + 1; // 하나 더 가져와서 다음 페이지가 있는지 본다
        $offset = max(0, ((int)$page - 1) * self::PAGE_SIZE);
        $stmt = $this->db->prepare("SELECT p.id, p.title, p.created_at, u.username, u.id AS user_id,
                (SELECT COUNT(*) FROM board_comments c WHERE c.post_id = p.id) AS comment_count
            FROM board_posts p JOIN users u ON u.id = p.user_id
            WHERE p.hidden = 0 ORDER BY p.created_at DESC LIMIT ? OFFSET ?");
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->bindValue(2, $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();
        $hasMore = count($rows) > self::PAGE_SIZE;
        return [
            'posts' => array_map([self::class, 'castPost'], array_slice($rows, 0, self::PAGE_SIZE)),
            'hasMore' => $hasMore,
        ];
    }

    private static function castPost($p) {
        foreach (['id', 'user_id', 'comment_count'] as $k) {
            if (isset($p[$k])) $p[$k] = (int)$p[$k];
        }
        return $p;
    }

    public function find($id) {
        $stmt = $this->db->prepare("SELECT p.*, u.username FROM board_posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?");
        $stmt->execute([$id]);
        $post = $stmt->fetch();
        if (!$post) return null;
        $post['id'] = (int)$post['id'];
        $post['user_id'] = (int)$post['user_id'];
        $post['hidden'] = (int)$post['hidden'];
        return $post;
    }

    public function create($user_id, $title, $body) {
        $stmt = $this->db->prepare("INSERT INTO board_posts (user_id, title, body) VALUES (?, ?, ?)");
        $stmt->execute([$user_id, trim($title), trim($body)]);
        return (int)$this->db->lastInsertId();
    }

    public function update($id, $title, $body) {
        $stmt = $this->db->prepare("UPDATE board_posts SET title = ?, body = ? WHERE id = ?");
        return $stmt->execute([trim($title), trim($body), $id]);
    }

    public function delete($id) {
        return $this->db->prepare("DELETE FROM board_posts WHERE id = ?")->execute([$id]);
    }

    // 마지막 글을 쓴 시각 (도배 방지: 5초에 1개)
    public function secondsSinceLastPost($user_id) {
        $stmt = $this->db->prepare("SELECT TIMESTAMPDIFF(SECOND, MAX(created_at), NOW()) FROM board_posts WHERE user_id = ?");
        $stmt->execute([$user_id]);
        $v = $stmt->fetchColumn();
        return $v === null ? PHP_INT_MAX : (int)$v;
    }

    /* ── 댓글 ───────────────────────────────── */

    public function comments($post_id) {
        $stmt = $this->db->prepare("SELECT c.id, c.body, c.created_at, c.user_id, u.username
            FROM board_comments c JOIN users u ON u.id = c.user_id
            WHERE c.post_id = ? ORDER BY c.created_at ASC");
        $stmt->execute([$post_id]);
        return array_map(function ($c) {
            $c['id'] = (int)$c['id'];
            $c['user_id'] = (int)$c['user_id'];
            return $c;
        }, $stmt->fetchAll());
    }

    public function addComment($post_id, $user_id, $body) {
        $stmt = $this->db->prepare("INSERT INTO board_comments (post_id, user_id, body) VALUES (?, ?, ?)");
        $stmt->execute([$post_id, $user_id, trim($body)]);
        return (int)$this->db->lastInsertId();
    }

    public function findComment($id) {
        $stmt = $this->db->prepare("SELECT c.*, p.user_id AS post_owner FROM board_comments c
            JOIN board_posts p ON p.id = c.post_id WHERE c.id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) return null;
        $row['user_id'] = (int)$row['user_id'];
        $row['post_owner'] = (int)$row['post_owner'];
        return $row;
    }

    public function deleteComment($id) {
        return $this->db->prepare("DELETE FROM board_comments WHERE id = ?")->execute([$id]);
    }

    /* ── 신고 ───────────────────────────────── */

    // 이미 신고했으면 false, 아니면 ['hidden' => bool]
    public function report($post_id, $user_id, $reason) {
        $stmt = $this->db->prepare("INSERT IGNORE INTO board_reports (post_id, user_id, reason) VALUES (?, ?, ?)");
        $stmt->execute([$post_id, $user_id, $reason]);
        if ($stmt->rowCount() === 0) return false;

        $count = $this->db->prepare("SELECT COUNT(*) FROM board_reports WHERE post_id = ?");
        $count->execute([$post_id]);
        $hidden = (int)$count->fetchColumn() >= self::REPORTS_TO_HIDE;
        if ($hidden) {
            $this->db->prepare("UPDATE board_posts SET hidden = 1 WHERE id = ?")->execute([$post_id]);
        }
        return ['hidden' => $hidden];
    }
}
