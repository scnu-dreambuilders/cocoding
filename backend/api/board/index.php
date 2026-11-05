<?php
// backend/api/board/index.php — 토론 게시판
// GET ?page=1            글 목록
// GET ?id=N              글 1개 + 댓글
// POST {title, body}     글 쓰기 (5초에 1개)
// PUT ?id=N {title, body} 내 글 고치기
// DELETE ?id=N           내 글 지우기
// POST {post_id, body}   댓글 쓰기
// DELETE ?comment_id=N   댓글 지우기 (내 댓글 또는 내 글에 달린 댓글)
// POST {report_id, reason} 신고 (3명이면 자동 숨김)
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/BoardModel.php';

const POST_COOLDOWN_SECONDS = 5;

$payload = Auth::requireUser();
Auth::requireSharing($payload); // 보호자 동의 전에는 게시판을 쓸 수 없다
$userId = (int)$payload['id'];
$board = new BoardModel();
$method = $_SERVER['REQUEST_METHOD'];
$data = json_decode(file_get_contents("php://input"), true) ?? [];

/* ── 읽기 ───────────────────────────────── */
if ($method === 'GET') {
    $id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
    if ($id) {
        $post = $board->find($id);
        if (!$post || ($post['hidden'] && $post['user_id'] !== $userId)) {
            Response::error("글을 찾을 수 없어요.", 404);
        }
        Response::success([
            'post' => $post + ['is_mine' => $post['user_id'] === $userId],
            'comments' => $board->comments($id),
            'reasons' => BoardModel::REPORT_REASONS,
        ]);
    }
    $page = min(100, max(1, (int)($_GET['page'] ?? 1)));
    Response::success($board->list($page) + ['reasons' => BoardModel::REPORT_REASONS]);
}

/* ── 쓰기 ───────────────────────────────── */
if ($method === 'POST') {
    // 신고
    if (isset($data['report_id'])) {
        RateLimiter::limit("board:report:$userId", 20, 3600, "신고를 너무 많이 했어요. 잠시 후 다시 해주세요.");
        $postId = filter_var($data['report_id'], FILTER_VALIDATE_INT);
        $post = $postId ? $board->find($postId) : null;
        if (!$post) Response::error("글을 찾을 수 없어요.", 404);
        if ($post['user_id'] === $userId) Response::error("내 글은 신고할 수 없어요.", 403);
        if (!in_array($data['reason'] ?? '', BoardModel::REPORT_REASONS, true)) {
            Response::error("신고 이유를 골라주세요.");
        }
        $result = $board->report($postId, $userId, $data['reason']);
        if ($result === false) Response::error("이미 신고한 글이에요.", 409);
        Response::success([
            'hidden' => $result['hidden'],
            'message' => $result['hidden'] ? '신고가 쌓여서 글이 숨겨졌어요.' : '신고가 접수됐어요. 고마워요!',
        ]);
    }

    // 댓글
    if (isset($data['post_id'])) {
        RateLimiter::limit("board:comment:$userId", 60, 3600, "댓글을 너무 많이 썼어요. 잠시 후 다시 해주세요.");
        $postId = filter_var($data['post_id'], FILTER_VALIDATE_INT);
        $post = $postId ? $board->find($postId) : null;
        if (!$post || $post['hidden']) Response::error("글을 찾을 수 없어요.", 404);

        $body = is_string($data['body'] ?? null) ? trim($data['body']) : '';
        if ($body === '' || mb_strlen($body) > BoardModel::MAX_COMMENT) {
            Response::error("댓글은 1~" . BoardModel::MAX_COMMENT . "자로 써주세요.");
        }
        $board->addComment($postId, $userId, $body);
        Response::success(['comments' => $board->comments($postId)], 201);
    }

    // 새 글
    RateLimiter::limit("board:post:$userId", 30, 3600, "글을 너무 많이 썼어요. 잠시 후 다시 해주세요.");
    if ($board->secondsSinceLastPost($userId) < POST_COOLDOWN_SECONDS) {
        Response::error("조금 전에 글을 썼어요. " . POST_COOLDOWN_SECONDS . "초 뒤에 다시 올려주세요.", 429);
    }
    $error = BoardModel::validate($data['title'] ?? null, $data['body'] ?? null);
    if ($error) Response::error($error);

    $id = $board->create($userId, $data['title'], $data['body']);
    Response::success(['id' => $id, 'message' => '글을 올렸어요.'], 201);
}

/* ── 고치기 · 지우기 ────────────────────── */
$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
$commentId = filter_var($_GET['comment_id'] ?? null, FILTER_VALIDATE_INT);

if ($method === 'DELETE' && $commentId) {
    $comment = $board->findComment($commentId);
    if (!$comment) Response::error("댓글을 찾을 수 없어요.", 404);
    // 내 댓글이거나, 내 글에 달린 댓글이면 지울 수 있다
    if ($comment['user_id'] !== $userId && $comment['post_owner'] !== $userId) {
        Response::error("지울 수 있는 댓글이 아니에요.", 403);
    }
    $board->deleteComment($commentId);
    Response::success(['message' => '댓글을 지웠어요.']);
}

$post = $id ? $board->find($id) : null;
if (!$post) {
    Response::error("글을 찾을 수 없어요.", 404);
}
if ($post['user_id'] !== $userId) {
    Response::error("내가 쓴 글만 고치거나 지울 수 있어요.", 403);
}

if ($method === 'PUT') {
    $error = BoardModel::validate($data['title'] ?? null, $data['body'] ?? null);
    if ($error) Response::error($error);
    $board->update($id, $data['title'], $data['body']);
    Response::success(['message' => '글을 고쳤어요.']);
}

if ($method === 'DELETE') {
    $board->delete($id);
    Response::success(['message' => '글을 지웠어요.']);
}

Response::error("잘못된 요청 방식입니다.", 405);
