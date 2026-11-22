<?php
// backend/api/board/index.php — 코딩 게시판 (토론 + 질문)
//
// GET  ?page=1&kind=&q=&chapter=&block=&status=   글 목록 (조건을 적용한 뒤 페이지를 자른다)
//        kind     question | discussion (없으면 둘 다)
//        q        제목·본문 검색
//        chapter  1~5 | free | none(챕터를 고르지 않은 질문만)
//        block    블록 type id 하나
//        status   open | solved (질문에만 뜻이 있다)
// GET  ?id=N                                      글 1개 + 댓글(질문이면 답변)
// POST {title, body}                              토론 글 쓰기 (5초에 1개)
// POST {kind:'question', title, body, chapter, blocks}  질문 글 쓰기
// PUT  ?id=N {title, body}                        내 글 고치기 (질문이면 chapter·blocks도)
// PUT  ?id=N {accept_answer_id: N|null}           답변 채택 · 채택 취소
// DELETE ?id=N                                    내 글 지우기
// POST {post_id, body}                            댓글(답변) 쓰기
// DELETE ?comment_id=N                            댓글 지우기 (내 댓글 또는 내 글에 달린 댓글)
// POST {report_id, reason}                        글 신고 (3명이면 자동 숨김)
//
// 정한 규칙 (PR #13에서 합의가 필요하다고 한 부분)
//   - 글 종류는 올린 뒤 바꿀 수 없다. 종류가 오지 않은 요청과 옛 글은 토론으로 본다
//   - 채택과 채택 취소는 질문을 쓴 사람만 할 수 있다
//   - 자기 답변도 채택할 수 있다 (스스로 해결한 질문을 표시할 방법이 이것뿐이고, 채택에 붙는 보상이 없다)
//   - 채택한 답변이 있으면 해결됨으로 본다. 답변 없이 해결 처리하는 길은 두지 않았다
//   - 채택한 답변이 지워지면 외래키(ON DELETE SET NULL)로 자동 미해결이 된다
//   - 숨겨진 글에는 답변을 쓸 수도, 채택할 수도 없다
//   - 답변·댓글 신고는 넣지 않았다 (화면에 버튼이 없다)
//   - 글자 수 제한은 그대로다 (제목 80 · 본문 1000 · 댓글 500)
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../models/BoardModel.php';
require_once __DIR__ . '/../../config/Logger.php';

require_once __DIR__ . '/../../config/Settings.php';

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
        // 숨겨진 글은 쓴 사람만 볼 수 있다. 운영자도 볼 수 있게 열어 둔다 —
        // 신고를 받아 숨긴 뒤에 내용을 다시 확인해야 복구할지 판단할 수 있다
        $canSeeHidden = $post && ($post['user_id'] === $userId || !empty($payload['is_admin']));
        if (!$post || ($post['hidden'] && !$canSeeHidden)) {
            Response::error("글을 찾을 수 없어요.", 404);
        }
        Response::success([
            'post' => $post + ['is_mine' => $post['user_id'] === $userId],
            'comments' => $board->comments($id),
            'reasons' => BoardModel::REPORT_REASONS,
        ]);
    }
    $page = min(100, max(1, (int)($_GET['page'] ?? 1)));
    Response::success($board->list($page, $_GET) + ['reasons' => BoardModel::REPORT_REASONS]);
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
        Logger::audit('report.board', ['post' => $postId]);
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

        $word = $post['kind'] === 'question' ? '답변' : '댓글';
        $body = is_string($data['body'] ?? null) ? trim($data['body']) : '';
        if ($body === '' || mb_strlen($body) > BoardModel::MAX_COMMENT) {
            Response::error("$word" . "은 1~" . BoardModel::MAX_COMMENT . "자로 써주세요.");
        }
        $board->addComment($postId, $userId, $body);
        Response::success(['comments' => $board->comments($postId)], 201);
    }

    // 새 글
    RateLimiter::limit("board:post:$userId", 30, 3600, "글을 너무 많이 썼어요. 잠시 후 다시 해주세요.");
    $cooldown = Settings::int('board.post_cooldown');
    if ($cooldown > 0 && $board->secondsSinceLastPost($userId) < $cooldown) {
        Response::error("조금 전에 글을 썼어요. {$cooldown}초 뒤에 다시 올려주세요.", 429);
    }
    $error = BoardModel::validate($data['title'] ?? null, $data['body'] ?? null);
    if ($error) Response::error($error);

    // 종류가 오지 않으면 토론. question 일 때만 챕터·블록을 받는다
    $kind = $data['kind'] ?? null;
    if ($kind !== null && !in_array($kind, BoardModel::KINDS, true)) {
        Response::error("글 종류를 다시 골라주세요.");
    }
    $question = null;
    if ($kind === 'question') {
        $question = BoardModel::validateQuestionTags($data['chapter'] ?? null, $data['blocks'] ?? null);
        if (is_string($question)) Response::error($question);
    }

    $id = $board->create($userId, $data['title'], $data['body'], $question);
    Response::success([
        'id' => $id,
        'message' => $question === null ? '글을 올렸어요.' : '질문을 올렸어요.',
    ], 201);
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

// 답변 채택 · 채택 취소 — 질문을 쓴 사람만. 위에서 글 주인인지 이미 걸렀다
if ($method === 'PUT' && array_key_exists('accept_answer_id', $data)) {
    if ($post['kind'] !== 'question') Response::error("질문에서만 답변을 채택할 수 있어요.");
    if ($post['hidden']) Response::error("숨겨진 글이에요.", 403);

    $answerId = $data['accept_answer_id'];
    if ($answerId === null) {
        $board->acceptComment($id, null);
        Response::success(['message' => '채택을 취소했어요.']);
    }
    $answerId = filter_var($answerId, FILTER_VALIDATE_INT);
    $answer = $answerId ? $board->findComment($answerId) : null;
    if (!$answer || $answer['post_id'] !== $id) Response::error("답변을 찾을 수 없어요.", 404);

    $board->acceptComment($id, $answerId);
    Logger::audit('board.accept', ['post' => $id, 'answer' => $answerId]);
    Response::success(['message' => '답변을 채택했어요.']);
}

if ($method === 'PUT') {
    $error = BoardModel::validate($data['title'] ?? null, $data['body'] ?? null);
    if ($error) Response::error($error);

    // 글 종류는 바꾸지 않는다. 질문 글이면 챕터·블록도 함께 고친다
    $question = null;
    if ($post['kind'] === 'question') {
        $question = BoardModel::validateQuestionTags($data['chapter'] ?? null, $data['blocks'] ?? null);
        if (is_string($question)) Response::error($question);
    }
    $board->update($id, $data['title'], $data['body'], $question);
    Response::success(['message' => $post['kind'] === 'question' ? '질문을 고쳤어요.' : '글을 고쳤어요.']);
}

if ($method === 'DELETE') {
    $board->delete($id);
    Response::success(['message' => '글을 지웠어요.']);
}

Response::error("잘못된 요청 방식입니다.", 405);
