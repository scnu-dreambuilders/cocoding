<?php
// backend/models/ProjectModel.php
require_once __DIR__ . '/../config/Database.php';

class ProjectModel {
    const MAX_TITLE_LENGTH = 200;
    // 캐릭터 그림·녹음 소리(data URL)가 들어가므로 여유 있게
    const MAX_BLOCKS_JSON_BYTES = 4_000_000;
    const MAX_THUMBNAIL_BYTES = 300_000;
    const VALID_TRACKS = ['chapter', 'free'];
    const PUBLIC_PAGE_SIZE = 12;
    const MAX_PROJECTS_PER_USER = 50;  // 데모 서버 저장 공간 보호
    const REPORTS_TO_HIDE = 3;         // 서로 다른 3명이 신고하면 자동 비공개
    const REPORT_REASONS = ['나쁜 말이나 그림', '개인정보(얼굴·이름·목소리)가 있어요', '내 작품을 베꼈어요', '기타'];

    // 목록에서는 무거운 blocks_data를 빼고 보낸다
    const LIST_COLUMNS = "p.id, p.user_id, p.chapter_id, p.title, p.track, p.is_public, p.report_hidden, p.thumbnail_url, p.created_at, p.updated_at,
        (SELECT COUNT(*) FROM remakes r WHERE r.original_project_id = p.id) AS remake_count";

    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    // Returns an error message string, or null if the input is valid.
    public static function validateInput($title, $track, $blocksData) {
        if (!is_string($title) || trim($title) === '' || mb_strlen($title) > self::MAX_TITLE_LENGTH) {
            return "제목은 1~" . self::MAX_TITLE_LENGTH . "자 이내여야 합니다.";
        }
        if (!in_array($track, self::VALID_TRACKS, true)) {
            return "track은 " . implode(', ', self::VALID_TRACKS) . " 중 하나여야 합니다.";
        }
        if (!is_array($blocksData)) {
            return "blocks_data는 객체/배열이어야 합니다.";
        }
        if (strlen(json_encode($blocksData)) > self::MAX_BLOCKS_JSON_BYTES) {
            return "작품 용량이 너무 큽니다. 그림이나 소리를 줄여주세요.";
        }
        return null;
    }

    // 썸네일은 무대 캡처 이미지(data URL)만 허용
    public static function validateThumbnail($thumbnail) {
        if ($thumbnail === null) return null;
        if (!is_string($thumbnail) || strlen($thumbnail) > self::MAX_THUMBNAIL_BYTES
            || !preg_match('#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$#', $thumbnail)) {
            return "썸네일 형식이 올바르지 않습니다.";
        }
        return null;
    }

    private static function decode($project) {
        if ($project) {
            $project['blocks_data'] = json_decode($project['blocks_data'], true);
            $project['is_public'] = (int)$project['is_public'];
            $project['report_hidden'] = (int)($project['report_hidden'] ?? 0);
        }
        return $project;
    }

    public function findByUser($user_id) {
        $stmt = $this->db->prepare("SELECT " . self::LIST_COLUMNS . " FROM projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC");
        $stmt->execute([$user_id]);
        return $stmt->fetchAll();
    }

    public function findById($id) {
        $stmt = $this->db->prepare("SELECT p.*, u.username FROM projects p JOIN users u ON u.id = p.user_id WHERE p.id = ?");
        $stmt->execute([$id]);
        return self::decode($stmt->fetch());
    }

    public function findChapterProject($user_id, $chapter_id) {
        $stmt = $this->db->prepare("SELECT id FROM projects WHERE user_id = ? AND chapter_id = ? AND track = 'chapter' ORDER BY id ASC LIMIT 1");
        $stmt->execute([$user_id, $chapter_id]);
        $id = $stmt->fetchColumn();
        return $id === false ? null : (int)$id;
    }

    public function create($user_id, $title, $blocks_data, $track, $chapter_id = null, $thumbnail = null) {
        $stmt = $this->db->prepare("INSERT INTO projects (user_id, title, blocks_data, track, chapter_id, thumbnail_url) VALUES (?, ?, ?, ?, ?, ?)");
        $stmt->execute([$user_id, $title, json_encode($blocks_data), $track, $chapter_id, $thumbnail]);
        return (int)$this->db->lastInsertId();
    }

    // $fields: title / blocks_data / is_public / thumbnail_url 중 바뀐 것만
    public function update($id, array $fields) {
        $sets = [];
        $params = [];
        foreach ($fields as $column => $value) {
            if (!in_array($column, ['title', 'blocks_data', 'is_public', 'thumbnail_url'], true)) continue;
            if ($column === 'blocks_data') $value = json_encode($value);
            if ($column === 'is_public') $value = $value ? 1 : 0;
            $sets[] = "$column = ?";
            $params[] = $value;
        }
        if (!$sets) return true;
        $params[] = $id;
        $stmt = $this->db->prepare("UPDATE projects SET " . implode(', ', $sets) . " WHERE id = ?");
        return $stmt->execute($params);
    }

    public function delete($id) {
        $stmt = $this->db->prepare("DELETE FROM projects WHERE id = ?");
        return $stmt->execute([$id]);
    }

    // 친구 작품 탭 (최신순, 페이지 단위)
    public function findPublic($page = 1) {
        $limit = self::PUBLIC_PAGE_SIZE + 1; // 하나 더 가져와서 다음 페이지 유무 판단
        $offset = max(0, ($page - 1) * self::PUBLIC_PAGE_SIZE);
        $stmt = $this->db->prepare("SELECT " . self::LIST_COLUMNS . ", u.username
            FROM projects p JOIN users u ON p.user_id = u.id
            WHERE p.is_public = 1 AND p.report_hidden = 0 ORDER BY p.updated_at DESC LIMIT ? OFFSET ?");
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->bindValue(2, $offset, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();
        $hasMore = count($rows) > self::PUBLIC_PAGE_SIZE;
        return ['projects' => array_slice($rows, 0, self::PUBLIC_PAGE_SIZE), 'hasMore' => $hasMore];
    }

    public function countByUser($user_id) {
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM projects WHERE user_id = ?");
        $stmt->execute([$user_id]);
        return (int)$stmt->fetchColumn();
    }

    // 다른 사람이 볼 수 있는 작품인가 (공개 + 신고로 숨겨지지 않음)
    public static function isVisibleToOthers($project) {
        return (int)$project['is_public'] === 1 && (int)($project['report_hidden'] ?? 0) === 0;
    }

    // 신고 기록. 이미 신고했으면 false. 신고가 쌓이면 자동 비공개 → ['hidden' => bool]
    public function report($project_id, $user_id, $reason) {
        $stmt = $this->db->prepare("INSERT IGNORE INTO project_reports (project_id, user_id, reason) VALUES (?, ?, ?)");
        $stmt->execute([$project_id, $user_id, $reason]);
        if ($stmt->rowCount() === 0) return false;

        $count = $this->db->prepare("SELECT COUNT(*) FROM project_reports WHERE project_id = ?");
        $count->execute([$project_id]);
        $hidden = (int)$count->fetchColumn() >= self::REPORTS_TO_HIDE;
        if ($hidden) {
            $this->db->prepare("UPDATE projects SET is_public = 0, report_hidden = 1 WHERE id = ?")->execute([$project_id]);
        }
        return ['hidden' => $hidden];
    }

    public function recordRemake($original_id, $new_id) {
        $stmt = $this->db->prepare("INSERT INTO remakes (original_project_id, remaked_project_id) VALUES (?, ?)");
        return $stmt->execute([$original_id, $new_id]);
    }
}
