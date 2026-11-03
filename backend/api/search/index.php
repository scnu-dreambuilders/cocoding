<?php
// backend/api/search/index.php?q=검색어
// 사이트 전체 검색: 내 작품 + 친구 작품(공개) + 챕터
// 친구 작품은 보호자 동의가 끝난 학생에게만 보여준다.
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../models/ProjectModel.php';
require_once __DIR__ . '/../../models/ChapterModel.php';

const SEARCH_LIMIT = 8;       // 분류별 최대 개수
const SEARCH_MIN_LENGTH = 2;  // 한 글자 검색은 결과가 너무 많아서 막는다

$payload = Auth::requireUser();
$userId = (int)$payload['id'];

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

$q = trim((string)($_GET['q'] ?? ''));
if (mb_strlen($q) < SEARCH_MIN_LENGTH) {
    Response::error("두 글자 이상 입력해주세요.");
}
// LIKE에서 특별한 뜻을 가지는 글자를 그대로 찾도록 escape
$like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $q) . '%';
$db = Database::getInstance();

/* 내 작품 */
$stmt = $db->prepare("SELECT id, title, track, is_public, thumbnail_url, updated_at
    FROM projects WHERE user_id = ? AND title LIKE ? ORDER BY updated_at DESC LIMIT " . SEARCH_LIMIT);
$stmt->execute([$userId, $like]);
$mine = $stmt->fetchAll();

/* 친구 작품 (공개 + 신고로 숨겨지지 않은 것) */
$friends = [];
if (Auth::canShare($payload)) {
    $stmt = $db->prepare("SELECT p.id, p.title, p.thumbnail_url, p.allow_remake, p.updated_at, u.username
        FROM projects p JOIN users u ON u.id = p.user_id
        WHERE p.is_public = 1 AND p.report_hidden = 0 AND p.user_id <> ? AND (p.title LIKE ? OR u.username LIKE ?)
        ORDER BY p.updated_at DESC LIMIT " . SEARCH_LIMIT);
    $stmt->execute([$userId, $like, $like]);
    $friends = $stmt->fetchAll();
}

/* 챕터 (제목·개념·미션 설명에서 찾기) */
$chapterModel = new ChapterModel();
$chapters = [];
foreach ($chapterModel->withStatus($chapterModel->findAll(), $userId) as $c) {
    $haystack = $c['title'] . ' ' . $c['concept'] . ' ' . $c['mission'];
    if (mb_stripos($haystack, $q) !== false) {
        $chapters[] = [
            'id' => (int)$c['id'],
            'order_num' => (int)$c['order_num'],
            'title' => $c['title'],
            'mission' => $c['mission'],
            'status' => $c['status'],
        ];
    }
}

Response::success([
    'query' => $q,
    'myProjects' => array_map(function ($p) {
        $p['id'] = (int)$p['id'];
        $p['is_public'] = (int)$p['is_public'];
        return $p;
    }, $mine),
    'publicProjects' => array_map(function ($p) {
        $p['id'] = (int)$p['id'];
        $p['allow_remake'] = (int)$p['allow_remake'];
        return $p;
    }, $friends),
    'chapters' => $chapters,
    'total' => count($mine) + count($friends) + count($chapters),
]);
