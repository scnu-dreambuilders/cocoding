<?php
// backend/models/BoardModel.php
// 코딩 게시판 — 토론 글과 질문 글, 댓글(=질문의 답변), 신고.
// 아이들이 쓰는 곳이라 신고가 3건 쌓이면 자동으로 숨긴다 (작품 신고와 같은 방식).
//
// 글 종류(kind)
//   discussion  생각·작품 이야기를 나누는 글. 종류가 오지 않은 요청과 옛 글은 모두 여기로 본다
//   question    막힌 문제를 묻는 글. 챕터·블록 태그와 해결 상태를 추가로 가진다
//   올린 뒤에는 종류를 바꿀 수 없다 (고치기에서 kind 를 받지 않는다)
//
// 해결 상태(status)는 따로 저장하지 않고 accepted_comment_id 가 있는지로 정한다.
// 채택 = 해결로 보기 때문이다. 답변 없이 해결 처리하는 버튼은 화면에도 없다.
require_once __DIR__ . '/../config/Database.php';

class BoardModel {
    const MAX_TITLE = 80;
    const MAX_BODY = 1000;
    const MAX_COMMENT = 500;
    const PAGE_SIZE = 10;
    const REPORTS_TO_HIDE = 3;
    const REPORT_REASONS = ['나쁜 말이나 그림', '개인정보(얼굴·이름·전화번호)가 있어요', '광고·도배', '기타'];

    const KINDS = ['discussion', 'question'];
    const MAX_BLOCK_TAGS = 3;
    const CHAPTER_COUNT = 5;

    // 질문에 붙일 수 있는 블록. frontend/src/blockly/blockDefs.js 의 BLOCK_CATEGORY 와 같은 목록이다.
    // 화면에서는 고른 챕터까지 배운 블록만 보여주지만, 서버는 "아는 블록인지"와 개수만 본다.
    // 챕터와의 관계까지 서버에서 막으려면 챕터별 블록 목록(frontend/src/data/chapterLogic.js)을
    // PHP로 베껴와야 하고, 챕터 내용이 바뀔 때마다 두 곳이 어긋난다. 그래서 하지 않았다.
    const KNOWN_BLOCKS = [
        'broadcast', 'change_size', 'forever', 'get_x', 'get_y', 'goto_random', 'goto_xy',
        'hide', 'if_else', 'if_then', 'key_pressed', 'logic_compare', 'logic_negate',
        'logic_operation', 'math_arithmetic', 'math_random_int', 'move_steps', 'move_x',
        'move_y', 'play_sound', 'repeat_n', 'say', 'say_secs', 'set_dir', 'set_size',
        'show', 'stop_all', 'switch_scene', 'touching', 'turn_around', 'turn_right',
        'var_change', 'var_hide', 'var_set', 'var_show', 'variables_get', 'wait',
        'when_clicked', 'when_key', 'when_receive', 'when_scene_start', 'when_start',
    ];

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

    /* 질문 태그 검증. 통과하면 ['chapter' => string|null, 'blocks' => array], 틀리면 문자열(오류 메시지) */
    public static function validateQuestionTags($chapter, $blocks) {
        // 챕터: 안 고르면 null, 고르면 '1'~'5' 또는 'free'
        if ($chapter === null || $chapter === '') {
            $chapter = null;
        } else {
            if (!is_string($chapter) && !is_int($chapter)) return "챕터를 다시 골라주세요.";
            $chapter = (string)$chapter;
            $isChapterNo = ctype_digit($chapter) && (int)$chapter >= 1 && (int)$chapter <= self::CHAPTER_COUNT;
            if (!$isChapterNo && $chapter !== 'free') return "챕터를 다시 골라주세요.";
        }

        // 블록 태그: 없거나 배열. 아는 블록만, 중복 빼고 최대 3개
        if ($blocks === null || $blocks === '') $blocks = [];
        if (!is_array($blocks)) return "블록 태그를 다시 골라주세요.";
        $clean = [];
        foreach ($blocks as $b) {
            if (!is_string($b)) return "블록 태그를 다시 골라주세요.";
            if (!in_array($b, self::KNOWN_BLOCKS, true)) return "모르는 블록이 들어 있어요: " . mb_substr($b, 0, 30);
            if (!in_array($b, $clean, true)) $clean[] = $b;
        }
        if (count($clean) > self::MAX_BLOCK_TAGS) {
            return "블록 태그는 " . self::MAX_BLOCK_TAGS . "개까지 고를 수 있어요.";
        }
        return ['chapter' => $chapter, 'blocks' => $clean];
    }

    /* 목록 조건을 WHERE 절과 값으로 바꾼다. $query 는 api에서 넘어온 $_GET */
    private function filters(array $query) {
        $where = ['p.hidden = 0'];
        $args = [];

        $kind = isset($query['kind']) ? $query['kind'] : '';
        if (in_array($kind, self::KINDS, true)) {
            $where[] = 'p.kind = ?';
            $args[] = $kind;
        }

        // 제목·본문 검색. LIKE 특수문자는 글자 그대로 찾도록 막는다
        $text = isset($query['q']) && is_string($query['q']) ? trim($query['q']) : '';
        if ($text !== '') {
            $like = '%' . addcslashes($text, '%_\\') . '%';
            $where[] = '(p.title LIKE ? OR p.body LIKE ?)';
            $args[] = $like;
            $args[] = $like;
        }

        // 챕터: 'none'은 챕터를 고르지 않은 질문만, 그 밖에는 그 값인 글만
        $chapter = isset($query['chapter']) && is_string($query['chapter']) ? $query['chapter'] : '';
        if ($chapter === 'none') {
            $where[] = "p.kind = 'question' AND p.chapter IS NULL";
        } elseif ($chapter !== '') {
            $where[] = 'p.chapter = ?';
            $args[] = $chapter;
        }

        $block = isset($query['block']) && is_string($query['block']) ? $query['block'] : '';
        if ($block !== '' && in_array($block, self::KNOWN_BLOCKS, true)) {
            $where[] = 'JSON_CONTAINS(p.blocks, ?)';
            $args[] = json_encode($block, JSON_UNESCAPED_UNICODE);
        }

        // 해결 상태 = 채택한 답변이 있는지
        $status = isset($query['status']) ? $query['status'] : '';
        if ($status === 'solved') {
            $where[] = "p.kind = 'question' AND p.accepted_comment_id IS NOT NULL";
        } elseif ($status === 'open') {
            $where[] = "p.kind = 'question' AND p.accepted_comment_id IS NULL";
        }

        return [implode(' AND ', $where), $args];
    }

    public function list($page = 1, array $query = []) {
        $limit = self::PAGE_SIZE + 1; // 하나 더 가져와서 다음 페이지가 있는지 본다
        $offset = max(0, ((int)$page - 1) * self::PAGE_SIZE);
        list($where, $args) = $this->filters($query);
        // 조건을 먼저 적용하고 나서 페이지를 자른다 (현재 페이지만 걸러내는 방식이 아니다)
        $sql = "SELECT p.id, p.kind, p.title, p.chapter, p.blocks, p.accepted_comment_id,
                    p.created_at, u.username, u.id AS user_id,
                    (SELECT COUNT(*) FROM board_comments c WHERE c.post_id = p.id) AS comment_count
                FROM board_posts p JOIN users u ON u.id = p.user_id
                WHERE $where ORDER BY p.created_at DESC LIMIT ? OFFSET ?";
        $stmt = $this->db->prepare($sql);
        $i = 1;
        foreach ($args as $a) { $stmt->bindValue($i++, $a); }
        $stmt->bindValue($i++, $limit, PDO::PARAM_INT);
        $stmt->bindValue($i, $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();
        $hasMore = count($rows) > self::PAGE_SIZE;
        return [
            'posts' => array_map([self::class, 'castPost'], array_slice($rows, 0, self::PAGE_SIZE)),
            'hasMore' => $hasMore,
        ];
    }

    // DB 행을 화면이 쓰는 모양으로. 숫자는 숫자로, blocks 는 배열로, status 는 채택 여부로
    private static function castPost($p) {
        foreach (['id', 'user_id', 'comment_count', 'hidden'] as $k) {
            if (isset($p[$k])) $p[$k] = (int)$p[$k];
        }
        $p['kind'] = (isset($p['kind']) && $p['kind'] === 'question') ? 'question' : 'discussion';

        if (array_key_exists('accepted_comment_id', $p)) {
            $accepted = $p['accepted_comment_id'] === null ? null : (int)$p['accepted_comment_id'];
            $p['accepted_comment_id'] = $accepted;
            $p['status'] = ($p['kind'] === 'question' && $accepted !== null) ? 'solved' : 'open';
        }

        if (array_key_exists('blocks', $p)) {
            $decoded = is_string($p['blocks']) ? json_decode($p['blocks'], true) : $p['blocks'];
            $p['blocks'] = is_array($decoded) ? array_values(array_filter($decoded, 'is_string')) : [];
        }
        if (array_key_exists('chapter', $p) && $p['chapter'] === '') $p['chapter'] = null;

        // 화면은 질문이면 '답변 수', 토론이면 '댓글 수'로 보여준다. 수는 같다
        if (isset($p['comment_count']) && $p['kind'] === 'question') {
            $p['answer_count'] = $p['comment_count'];
        }
        return $p;
    }

    public function find($id) {
        $stmt = $this->db->prepare("SELECT p.*, u.username,
                (SELECT COUNT(*) FROM board_comments c WHERE c.post_id = p.id) AS comment_count
            FROM board_posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?");
        $stmt->execute([$id]);
        $post = $stmt->fetch();
        if (!$post) return null;
        return self::castPost($post);
    }

    // $question 이 null 이면 토론 글, 배열이면 질문 글.
    // 토론으로 올린 글에는 챕터·블록을 저장하지 않는다 (화면도 보내지 않는다)
    public function create($user_id, $title, $body, $question = null) {
        if ($question === null) {
            $stmt = $this->db->prepare("INSERT INTO board_posts (user_id, kind, title, body) VALUES (?, 'discussion', ?, ?)");
            $stmt->execute([$user_id, trim($title), trim($body)]);
        } else {
            $stmt = $this->db->prepare("INSERT INTO board_posts (user_id, kind, title, body, chapter, blocks)
                                        VALUES (?, 'question', ?, ?, ?, ?)");
            $stmt->execute([
                $user_id, trim($title), trim($body),
                $question['chapter'],
                json_encode($question['blocks'], JSON_UNESCAPED_UNICODE),
            ]);
        }
        return (int)$this->db->lastInsertId();
    }

    // 글 종류(kind)는 바꾸지 않는다. 질문 글일 때만 챕터·블록을 함께 고친다
    public function update($id, $title, $body, $question = null) {
        if ($question === null) {
            $stmt = $this->db->prepare("UPDATE board_posts SET title = ?, body = ? WHERE id = ?");
            return $stmt->execute([trim($title), trim($body), $id]);
        }
        $stmt = $this->db->prepare("UPDATE board_posts SET title = ?, body = ?, chapter = ?, blocks = ? WHERE id = ?");
        return $stmt->execute([
            trim($title), trim($body),
            $question['chapter'],
            json_encode($question['blocks'], JSON_UNESCAPED_UNICODE),
            $id,
        ]);
    }

    /* ── 답변 채택 ───────────────────────────────
       채택한 답변이 있으면 그 질문은 해결됨으로 본다. 상태를 따로 저장하지 않는다.
       $commentId 가 null 이면 채택 취소. */
    public function acceptComment($postId, $commentId) {
        $stmt = $this->db->prepare("UPDATE board_posts SET accepted_comment_id = ? WHERE id = ?");
        return $stmt->execute([$commentId, $postId]);
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

    // 질문의 답변도 같은 표를 쓴다. accepted 는 그 질문이 채택한 답변인지
    public function comments($post_id) {
        $stmt = $this->db->prepare("SELECT c.id, c.body, c.created_at, c.user_id, u.username,
                (p.accepted_comment_id IS NOT NULL AND p.accepted_comment_id = c.id) AS accepted
            FROM board_comments c
            JOIN users u ON u.id = c.user_id
            JOIN board_posts p ON p.id = c.post_id
            WHERE c.post_id = ? ORDER BY c.created_at ASC");
        $stmt->execute([$post_id]);
        return array_map(function ($c) {
            $c['id'] = (int)$c['id'];
            $c['user_id'] = (int)$c['user_id'];
            $c['accepted'] = (bool)$c['accepted'];
            return $c;
        }, $stmt->fetchAll());
    }

    public function addComment($post_id, $user_id, $body) {
        $stmt = $this->db->prepare("INSERT INTO board_comments (post_id, user_id, body) VALUES (?, ?, ?)");
        $stmt->execute([$post_id, $user_id, trim($body)]);
        return (int)$this->db->lastInsertId();
    }

    public function findComment($id) {
        $stmt = $this->db->prepare("SELECT c.*, p.user_id AS post_owner, p.kind AS post_kind,
                (p.accepted_comment_id IS NOT NULL AND p.accepted_comment_id = c.id) AS accepted
            FROM board_comments c
            JOIN board_posts p ON p.id = c.post_id WHERE c.id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) return null;
        $row['id'] = (int)$row['id'];
        $row['post_id'] = (int)$row['post_id'];
        $row['user_id'] = (int)$row['user_id'];
        $row['post_owner'] = (int)$row['post_owner'];
        $row['accepted'] = (bool)$row['accepted'];
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
