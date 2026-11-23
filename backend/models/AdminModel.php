<?php
// backend/models/AdminModel.php
// 관리자 웹이 쓰는 읽기 질의와 회원 상태 바꾸기.
//
// 다른 모델과 달리 여기서는 이메일을 그대로 돌려준다. 운영자가 회원을 찾는 데 필요하기 때문이다.
// 대신 운영 기록(Logger)에는 절대 남기지 않는다 — 기록에는 번호(uid)만 들어간다.
require_once __DIR__ . '/../config/Database.php';
require_once __DIR__ . '/UserModel.php';

class AdminModel {
    const PAGE_SIZE = 20;

    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    /* ── 회원 ─────────────────────────────────── */

    // $query: q(닉네임·이메일 검색), role, state('all'|'suspended'|'admin'|'pending')
    public function users($page, array $query) {
        $where = ['1 = 1'];
        $args = [];

        $q = isset($query['q']) && is_string($query['q']) ? trim($query['q']) : '';
        if ($q !== '') {
            // LIKE 특수문자는 글자 그대로 찾는다 (q=% 가 전체 검색이 되지 않도록)
            $like = '%' . addcslashes($q, '%_\\') . '%';
            $where[] = '(u.username LIKE ? OR u.email LIKE ?)';
            $args[] = $like;
            $args[] = $like;
        }

        $role = isset($query['role']) ? $query['role'] : '';
        if (in_array($role, ['student', 'teacher', 'guardian'], true)) {
            $where[] = 'u.role = ?';
            $args[] = $role;
        }

        $state = isset($query['state']) ? $query['state'] : '';
        if ($state === 'suspended') {
            $where[] = 'u.suspended = 1';
        } elseif ($state === 'admin') {
            $where[] = 'u.is_admin = 1';
        } elseif ($state === 'pending') {
            $where[] = "u.consent_status = 'pending'"; // 보호자 동의를 기다리는 학생
        }

        $whereSql = implode(' AND ', $where);
        $limit = self::PAGE_SIZE + 1; // 하나 더 읽어서 다음 쪽이 있는지 본다
        $offset = max(0, ((int)$page - 1) * self::PAGE_SIZE);

        $stmt = $this->db->prepare("SELECT u.id, u.username, u.email, u.role, u.level, u.xp, u.coins,
                u.is_admin, u.suspended, u.suspended_reason, u.consent_status, u.affiliation, u.created_at
            FROM users u WHERE $whereSql ORDER BY u.id DESC LIMIT ? OFFSET ?");
        $i = 1;
        foreach ($args as $a) { $stmt->bindValue($i++, $a); }
        $stmt->bindValue($i++, $limit, PDO::PARAM_INT);
        $stmt->bindValue($i, $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();

        $total = $this->db->prepare("SELECT COUNT(*) FROM users u WHERE $whereSql");
        $total->execute($args);

        return [
            'users' => array_map([self::class, 'castUser'], array_slice($rows, 0, self::PAGE_SIZE)),
            'hasMore' => count($rows) > self::PAGE_SIZE,
            'total' => (int)$total->fetchColumn(),
        ];
    }

    public function user($id) {
        $stmt = $this->db->prepare("SELECT id, username, email, role, birth_year, level, xp, coins, bio,
                profile_visibility, consent_status, consent_code, consent_at, affiliation,
                is_admin, suspended, suspended_reason, created_at, updated_at
            FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ? self::castUser($row) : null;
    }

    // 상세 화면에 함께 보여줄 숫자들 (작품 수, 끝낸 챕터, 쓴 글, 받은 신고 등)
    public function userSummary($id) {
        $one = function ($sql) use ($id) {
            $stmt = $this->db->prepare($sql);
            $stmt->execute([$id]);
            return (int)$stmt->fetchColumn();
        };
        return [
            'projects' => $one("SELECT COUNT(*) FROM projects WHERE user_id = ?"),
            'publicProjects' => $one("SELECT COUNT(*) FROM projects WHERE user_id = ? AND is_public = 1"),
            'hiddenProjects' => $one("SELECT COUNT(*) FROM projects WHERE user_id = ? AND report_hidden = 1"),
            'chaptersDone' => $one("SELECT COUNT(*) FROM user_chapter_progress WHERE user_id = ? AND status = 'completed'"),
            'posts' => $one("SELECT COUNT(*) FROM board_posts WHERE user_id = ?"),
            'hiddenPosts' => $one("SELECT COUNT(*) FROM board_posts WHERE user_id = ? AND hidden = 1"),
            'comments' => $one("SELECT COUNT(*) FROM board_comments WHERE user_id = ?"),
            'reportsReceived' => $one("SELECT COUNT(*) FROM board_reports r JOIN board_posts p ON p.id = r.post_id WHERE p.user_id = ?"),
            'reportsMade' => $one("SELECT COUNT(*) FROM board_reports WHERE user_id = ?"),
            'coinsEarned' => $one("SELECT COALESCE(SUM(amount), 0) FROM coin_log WHERE user_id = ? AND amount > 0"),
            'coinsSpent' => $one("SELECT COALESCE(-SUM(amount), 0) FROM coin_log WHERE user_id = ? AND amount < 0"),
        ];
    }

    private static function castUser($u) {
        foreach (['id', 'level', 'xp', 'coins', 'birth_year'] as $k) {
            if (isset($u[$k])) $u[$k] = (int)$u[$k];
        }
        foreach (['is_admin', 'suspended'] as $k) {
            if (array_key_exists($k, $u)) $u[$k] = (int)$u[$k] === 1;
        }
        return $u;
    }

    /* 회원 상태 바꾸기 — 바뀐 항목 이름을 배열로 돌려준다 (운영 기록에 남기려고) */
    public function updateUser($id, array $changes) {
        $sets = [];
        $args = [];
        foreach ($changes as $column => $value) {
            $sets[] = "$column = ?";
            $args[] = $value;
        }
        if (!$sets) return [];
        $args[] = $id;
        $this->db->prepare("UPDATE users SET " . implode(', ', $sets) . " WHERE id = ?")->execute($args);
        return array_keys($changes);
    }

    // 지금 운영자가 몇 명인지 (마지막 운영자가 스스로 권한을 빼는 것을 막으려고)
    public function adminCount() {
        return (int)$this->db->query("SELECT COUNT(*) FROM users WHERE is_admin = 1")->fetchColumn();
    }

    // 지금 실제로 관리자 웹에 들어올 수 있는 운영자 수.
    // 정지된 운영자는 로그인해도 막히니 머릿수에서 뺀다 — 안 빼면 "운영자 두 명" 으로 보이지만
    // 한 명은 정지 상태라, 남은 한 명의 권한을 빼는 순간 아무도 못 들어오게 된다.
    public function usableAdminCount() {
        return (int)$this->db->query("SELECT COUNT(*) FROM users WHERE is_admin = 1 AND suspended = 0")->fetchColumn();
    }

    /* ── 신고·숨김 ───────────────────────────── */

    // 신고가 쌓인 글과 작품을 한 목록으로. 숨겨진 것도 함께 보여준다 (복구해야 하므로)
    public function reported($kind, $page) {
        $limit = self::PAGE_SIZE + 1;
        $offset = max(0, ((int)$page - 1) * self::PAGE_SIZE);

        if ($kind === 'project') {
            $sql = "SELECT p.id, p.title, p.is_public, p.report_hidden AS hidden, p.created_at,
                        u.id AS user_id, u.username,
                        (SELECT COUNT(*) FROM project_reports r WHERE r.project_id = p.id) AS reports
                    FROM projects p JOIN users u ON u.id = p.user_id
                    HAVING reports > 0 OR hidden = 1
                    ORDER BY reports DESC, p.id DESC LIMIT ? OFFSET ?";
        } else {
            $sql = "SELECT p.id, p.title, p.kind, p.hidden, p.created_at,
                        u.id AS user_id, u.username,
                        (SELECT COUNT(*) FROM board_reports r WHERE r.post_id = p.id) AS reports
                    FROM board_posts p JOIN users u ON u.id = p.user_id
                    HAVING reports > 0 OR hidden = 1
                    ORDER BY reports DESC, p.id DESC LIMIT ? OFFSET ?";
        }
        $stmt = $this->db->prepare($sql);
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->bindValue(2, $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();

        $items = array_map(function ($r) use ($kind) {
            foreach (['id', 'user_id', 'reports'] as $k) {
                if (isset($r[$k])) $r[$k] = (int)$r[$k];
            }
            $r['hidden'] = (int)$r['hidden'] === 1;
            if (isset($r['is_public'])) $r['is_public'] = (int)$r['is_public'] === 1;
            $r['target'] = $kind;
            return $r;
        }, array_slice($rows, 0, self::PAGE_SIZE));

        return ['items' => $items, 'hasMore' => count($rows) > self::PAGE_SIZE];
    }

    // 신고 이유 모아보기 — 왜 신고됐는지 보고 판단해야 한다
    public function reportReasons($kind, $id) {
        $sql = $kind === 'project'
            ? "SELECT reason, created_at FROM project_reports WHERE project_id = ? ORDER BY id DESC"
            : "SELECT reason, created_at FROM board_reports WHERE post_id = ? ORDER BY id DESC";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$id]);
        return $stmt->fetchAll();
    }

    /* 숨기기·복구. 복구할 때 신고 기록은 지우지 않는다 (왜 숨겨졌는지 남겨둬야 한다) */
    public function setHidden($kind, $id, $hidden) {
        $sql = $kind === 'project'
            ? "UPDATE projects SET report_hidden = ? WHERE id = ?"
            : "UPDATE board_posts SET hidden = ? WHERE id = ?";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$hidden ? 1 : 0, $id]);
        return $stmt->rowCount() > 0;
    }

    /* 신고된 것의 내용. 운영자가 숨길지 복구할지 판단하려면 내용을 봐야 한다.
       작품은 blocks_data(수백 KB) 를 빼고, 보이는 것(제목·무대 캡처)만 준다 */
    public function reportedContent($kind, $id) {
        if ($kind === 'project') {
            $stmt = $this->db->prepare("SELECT p.id, p.title, p.track, p.is_public, p.report_hidden,
                    p.thumbnail_url, p.created_at, p.updated_at, u.id AS user_id, u.username
                FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = ?");
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) return null;
            $row['id'] = (int)$row['id'];
            $row['user_id'] = (int)$row['user_id'];
            $row['is_public'] = (int)$row['is_public'] === 1;
            $row['hidden'] = (int)$row['report_hidden'] === 1;
            unset($row['report_hidden']);
            return ['project' => $row];
        }

        $stmt = $this->db->prepare("SELECT p.id, p.kind, p.title, p.body, p.chapter, p.hidden,
                p.created_at, u.id AS user_id, u.username
            FROM board_posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) return null;
        $row['id'] = (int)$row['id'];
        $row['user_id'] = (int)$row['user_id'];
        $row['hidden'] = (int)$row['hidden'] === 1;

        $c = $this->db->prepare("SELECT c.id, c.body, c.created_at, u.id AS user_id, u.username
            FROM board_comments c JOIN users u ON u.id = c.user_id
            WHERE c.post_id = ? ORDER BY c.created_at ASC");
        $c->execute([$id]);
        return ['post' => $row, 'comments' => array_map(function ($x) {
            $x['id'] = (int)$x['id'];
            $x['user_id'] = (int)$x['user_id'];
            return $x;
        }, $c->fetchAll())];
    }

    public function targetExists($kind, $id) {
        $sql = $kind === 'project'
            ? "SELECT 1 FROM projects WHERE id = ?"
            : "SELECT 1 FROM board_posts WHERE id = ?";
        $stmt = $this->db->prepare($sql);
        $stmt->execute([$id]);
        return (bool)$stmt->fetchColumn();
    }

    /* ── 공지사항 ─────────────────────────────── */

    // 관리자 목록: 초안(published=0)까지 다 보여준다
    public function notices($page) {
        $limit = self::PAGE_SIZE + 1;
        $offset = max(0, ((int)$page - 1) * self::PAGE_SIZE);
        $stmt = $this->db->prepare("SELECT n.*, u.username AS author
            FROM notices n LEFT JOIN users u ON u.id = n.created_by
            ORDER BY n.pinned DESC, n.id DESC LIMIT ? OFFSET ?");
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->bindValue(2, $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();
        return [
            'notices' => array_map([self::class, 'castNotice'], array_slice($rows, 0, self::PAGE_SIZE)),
            'hasMore' => count($rows) > self::PAGE_SIZE,
            // 화면이 "3 / 7 쪽" 처럼 마지막 쪽 번호를 보여줄 수 있게 전체 개수와 쪽 크기도 준다
            'total' => (int)$this->db->query("SELECT COUNT(*) FROM notices")->fetchColumn(),
            'pageSize' => self::PAGE_SIZE,
        ];
    }

    public function notice($id) {
        $stmt = $this->db->prepare("SELECT n.*, u.username AS author
            FROM notices n LEFT JOIN users u ON u.id = n.created_by WHERE n.id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ? self::castNotice($row) : null;
    }

    private static function castNotice($n) {
        $n['id'] = (int)$n['id'];
        $n['pinned'] = (int)$n['pinned'] === 1;
        $n['published'] = (int)$n['published'] === 1;
        $n['created_by'] = $n['created_by'] === null ? null : (int)$n['created_by'];
        return $n;
    }

    public function createNotice(array $f, $adminId) {
        $stmt = $this->db->prepare("INSERT INTO notices (title, body, pinned, published, audience, created_by)
            VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$f['title'], $f['body'], $f['pinned'] ? 1 : 0, $f['published'] ? 1 : 0, $f['audience'], $adminId]);
        return (int)$this->db->lastInsertId();
    }

    public function updateNotice($id, array $changes) {
        if (!$changes) return [];
        $sets = [];
        $args = [];
        foreach ($changes as $col => $v) { $sets[] = "$col = ?"; $args[] = $v; }
        $args[] = $id;
        $this->db->prepare("UPDATE notices SET " . implode(', ', $sets) . " WHERE id = ?")->execute($args);
        return array_keys($changes);
    }

    public function deleteNotice($id) {
        $stmt = $this->db->prepare("DELETE FROM notices WHERE id = ?");
        $stmt->execute([$id]);
        return $stmt->rowCount() > 0;
    }

    /* ── 챕터 ─────────────────────────────────── */

    public function chapters() {
        $rows = $this->db->query("SELECT * FROM chapters ORDER BY order_num, id")->fetchAll();
        return array_map([self::class, 'castChapter'], $rows);
    }

    public function chapter($id) {
        $stmt = $this->db->prepare("SELECT * FROM chapters WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        return $row ? self::castChapter($row) : null;
    }

    // new_blocks·required_blocks 는 DB에 JSON 글자로 들어 있다. 화면이 쓰기 쉽게 배열로 바꿔준다
    private static function castChapter($c) {
        $c['id'] = (int)$c['id'];
        $c['order_num'] = (int)$c['order_num'];
        foreach (['new_blocks', 'required_blocks'] as $k) {
            $decoded = is_string($c[$k]) ? json_decode($c[$k], true) : $c[$k];
            $c[$k] = is_array($decoded) ? array_values(array_filter($decoded, 'is_string')) : [];
        }
        return $c;
    }

    public function updateChapter($id, array $changes) {
        if (!$changes) return [];
        $sets = [];
        $args = [];
        foreach ($changes as $col => $v) { $sets[] = "$col = ?"; $args[] = $v; }
        $args[] = $id;
        $this->db->prepare("UPDATE chapters SET " . implode(', ', $sets) . " WHERE id = ?")->execute($args);
        return array_keys($changes);
    }

    // 이 챕터를 이미 하고 있는 학생이 몇 명인지 (내용을 고치기 전에 알려주려고)
    public function chapterUsage($id) {
        $stmt = $this->db->prepare("SELECT
                SUM(status = 'completed') AS done,
                SUM(status = 'in_progress') AS doing,
                COUNT(*) AS total
            FROM user_chapter_progress WHERE chapter_id = ?");
        $stmt->execute([$id]);
        $r = $stmt->fetch();
        return [
            'completed' => (int)$r['done'],
            'inProgress' => (int)$r['doing'],
            'total' => (int)$r['total'],
        ];
    }

    /* ── 선생님 반 ────────────────────────────── */

    public function classes($page, $q = '') {
        $where = '1 = 1';
        $args = [];
        if ($q !== '') {
            $like = '%' . addcslashes($q, '%_\\') . '%';
            $where = '(c.name LIKE ? OR u.username LIKE ?)';
            $args = [$like, $like];
        }
        $limit = self::PAGE_SIZE + 1;
        $offset = max(0, ((int)$page - 1) * self::PAGE_SIZE);
        $stmt = $this->db->prepare("SELECT c.id, c.name, c.join_code, c.created_at,
                u.id AS teacher_id, u.username AS teacher,
                (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id) AS students,
                (SELECT COUNT(*) FROM class_assignments a WHERE a.class_id = c.id) AS assignments
            FROM classes c JOIN users u ON u.id = c.teacher_id
            WHERE $where ORDER BY c.id DESC LIMIT ? OFFSET ?");
        $i = 1;
        foreach ($args as $a) { $stmt->bindValue($i++, $a); }
        $stmt->bindValue($i++, $limit, PDO::PARAM_INT);
        $stmt->bindValue($i, $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();
        $items = array_map(function ($c) {
            foreach (['id', 'teacher_id', 'students', 'assignments'] as $k) { $c[$k] = (int)$c[$k]; }
            return $c;
        }, array_slice($rows, 0, self::PAGE_SIZE));
        return ['classes' => $items, 'hasMore' => count($rows) > self::PAGE_SIZE];
    }

    public function classDetail($id) {
        $stmt = $this->db->prepare("SELECT c.*, u.username AS teacher FROM classes c
            JOIN users u ON u.id = c.teacher_id WHERE c.id = ?");
        $stmt->execute([$id]);
        $class = $stmt->fetch();
        if (!$class) return null;
        $class['id'] = (int)$class['id'];
        $class['teacher_id'] = (int)$class['teacher_id'];

        $members = $this->db->prepare("SELECT m.id, m.joined_at, u.id AS user_id, u.username, u.level, u.suspended
            FROM class_members m JOIN users u ON u.id = m.student_id WHERE m.class_id = ? ORDER BY u.username");
        $members->execute([$id]);

        $assignments = $this->db->prepare("SELECT a.*,
                (SELECT COUNT(*) FROM assignment_done d WHERE d.assignment_id = a.id) AS done
            FROM class_assignments a WHERE a.class_id = ? ORDER BY a.id DESC");
        $assignments->execute([$id]);

        return [
            'class' => $class,
            'members' => array_map(function ($m) {
                foreach (['id', 'user_id', 'level'] as $k) { $m[$k] = (int)$m[$k]; }
                $m['suspended'] = (int)$m['suspended'] === 1;
                return $m;
            }, $members->fetchAll()),
            'assignments' => array_map(function ($a) {
                $a['id'] = (int)$a['id'];
                $a['done'] = (int)$a['done'];
                return $a;
            }, $assignments->fetchAll()),
        ];
    }

    public function deleteClass($id) {
        $stmt = $this->db->prepare("DELETE FROM classes WHERE id = ?");
        $stmt->execute([$id]);
        return $stmt->rowCount() > 0;
    }

    public function deleteAssignment($id) {
        $stmt = $this->db->prepare("DELETE FROM class_assignments WHERE id = ?");
        $stmt->execute([$id]);
        return $stmt->rowCount() > 0;
    }

    /* ── 코인·경험치 손보기 ────────────────────
       잘못 지급된 코인을 되돌리거나, 행사로 더 줄 때 쓴다.
       users 표를 바로 고치지 않고 coin_log 를 거쳐서, 나중에 "왜 늘었나"를 되짚을 수 있게 한다. */
    public function adjustCoins($userId, $delta, $adminId) {
        // coin_log 에는 (user_id, reason, ref) 유니크 키가 있다. 같은 초에 두 번 조정하면
        // 시각만으로는 ref 가 겹쳐서 중복 키 오류가 난다. 무작위 꼬리를 붙여 겹치지 않게 한다
        $ref = 'by:' . $adminId . ':' . date('YmdHis') . ':' . bin2hex(random_bytes(3));
        $this->db->prepare("INSERT INTO coin_log (user_id, amount, reason, ref) VALUES (?, ?, 'admin', ?)")
            ->execute([$userId, $delta, $ref]);
        // 코인이 음수가 되지 않게 막는다
        $this->db->prepare("UPDATE users SET coins = GREATEST(0, coins + ?) WHERE id = ?")
            ->execute([$delta, $userId]);
        $stmt = $this->db->prepare("SELECT coins FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        return (int)$stmt->fetchColumn();
    }

    public function adjustXp($userId, $delta) {
        $this->db->prepare("UPDATE users SET xp = GREATEST(0, xp + ?) WHERE id = ?")->execute([$delta, $userId]);
        $stmt = $this->db->prepare("SELECT xp FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        return (int)$stmt->fetchColumn();
    }

    public function emailTaken($email, $exceptId) {
        $stmt = $this->db->prepare("SELECT 1 FROM users WHERE email = ? AND id <> ? LIMIT 1");
        $stmt->execute([$email, $exceptId]);
        return (bool)$stmt->fetchColumn();
    }

    public function setPassword($userId, $plain) {
        $this->db->prepare("UPDATE users SET password_hash = ? WHERE id = ?")
            ->execute([password_hash($plain, PASSWORD_DEFAULT), $userId]);
    }

    /* ── 통계 ─────────────────────────────────── */


    public function stats() {
        $num = function ($sql) {
            return (int)$this->db->query($sql)->fetchColumn();
        };
        // 한 명도 없는 유형도 0으로 보낸다. 빼고 보내면 화면이 받는 항목 수가 그때그때 달라진다
        $byRole = array_fill_keys(UserModel::ROLES, 0);
        foreach ($this->db->query("SELECT role, COUNT(*) AS n FROM users GROUP BY role") as $r) {
            $byRole[$r['role']] = (int)$r['n'];
        }
        // 최근 7일 가입자 (날짜별) — 화면에서 막대그래프로 그릴 수 있게.
        // 기준 날짜는 DB의 오늘을 쓴다. 보는 사람 PC의 시계가 달라도 같은 그림이 되도록,
        // 가입이 없던 날도 0으로 채워서 항상 7칸을 보낸다.
        $today = (string)$this->db->query("SELECT CURDATE()")->fetchColumn();
        $counts = [];
        foreach ($this->db->query("SELECT DATE(created_at) AS day, COUNT(*) AS n FROM users
                WHERE created_at >= CURDATE() - INTERVAL 6 DAY GROUP BY day ORDER BY day") as $r) {
            $counts[(string)$r['day']] = (int)$r['n'];
        }
        $signups = [];
        $cursor = new DateTime($today);
        $cursor->modify('-6 day');
        for ($i = 0; $i < 7; $i++) {
            $day = $cursor->format('Y-m-d');
            $signups[] = ['day' => $day, 'count' => isset($counts[$day]) ? $counts[$day] : 0];
            $cursor->modify('+1 day');
        }
        return [
            'today' => $today,
            'users' => [
                'total' => $num("SELECT COUNT(*) FROM users"),
                'byRole' => $byRole,
                'admins' => $num("SELECT COUNT(*) FROM users WHERE is_admin = 1"),
                'suspended' => $num("SELECT COUNT(*) FROM users WHERE suspended = 1"),
                'consentPending' => $num("SELECT COUNT(*) FROM users WHERE consent_status = 'pending'"),
                'newToday' => $num("SELECT COUNT(*) FROM users WHERE DATE(created_at) = CURDATE()"),
                'activeWeek' => $num("SELECT COUNT(DISTINCT user_id) FROM coin_log WHERE created_at >= NOW() - INTERVAL 7 DAY"),
            ],
            'signups7d' => $signups,
            'learning' => [
                'chaptersDone' => $num("SELECT COUNT(*) FROM user_chapter_progress WHERE status = 'completed'"),
                'projects' => $num("SELECT COUNT(*) FROM projects"),
                'publicProjects' => $num("SELECT COUNT(*) FROM projects WHERE is_public = 1 AND report_hidden = 0"),
            ],
            'board' => [
                'posts' => $num("SELECT COUNT(*) FROM board_posts"),
                'questions' => $num("SELECT COUNT(*) FROM board_posts WHERE kind = 'question'"),
                'solved' => $num("SELECT COUNT(*) FROM board_posts WHERE kind = 'question' AND accepted_comment_id IS NOT NULL"),
                'comments' => $num("SELECT COUNT(*) FROM board_comments"),
            ],
            'moderation' => [
                'hiddenPosts' => $num("SELECT COUNT(*) FROM board_posts WHERE hidden = 1"),
                'hiddenProjects' => $num("SELECT COUNT(*) FROM projects WHERE report_hidden = 1"),
                'openPostReports' => $num("SELECT COUNT(DISTINCT post_id) FROM board_reports r
                    JOIN board_posts p ON p.id = r.post_id WHERE p.hidden = 0"),
            ],
            'coins' => [
                'granted' => $num("SELECT COALESCE(SUM(amount), 0) FROM coin_log WHERE amount > 0"),
                'spent' => $num("SELECT COALESCE(-SUM(amount), 0) FROM coin_log WHERE amount < 0"),
                'held' => $num("SELECT COALESCE(SUM(coins), 0) FROM users"),
            ],
        ];
    }
}
