<?php
// backend/api/topics/recommend.php
// 오늘의 추천 주제: 관심사 태그와 일치하는 주제 중 2~3개 랜덤 (코딩 수준에 맞게)
// 추천 엔진 없이 topics.json 태그-주제 매핑만 사용
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../models/UserModel.php';

const RECOMMEND_COUNT = 3;

// topics.json의 hint(블록 분류) → 에디터에서 코코가 제안할 블록 id
const HINT_BLOCKS = [
    '이동 블록' => 'move_x',
    '좌표 블록' => 'goto_xy',
    '반복 블록' => 'repeat_n',
    '조건 블록' => 'if_then',
    '키 감지 블록' => 'when_key',
    '변수 블록' => 'var_change',
    '메시지 블록' => 'broadcast',
    '장면 블록' => 'switch_scene',
];
const CATEGORY_EMOJI = [
    '게임' => '🎮', '애니메이션' => '🎬', '동물' => '🐶', '스포츠' => '⚽', '음식' => '🍕',
    '우주' => '🚀', '음악' => '🎵', '자연' => '🌳', '탈것' => '🚗', '학교생활' => '🏫',
    '공룡' => '🦖', '로봇' => '🤖', '요리' => '🍳', '마법' => '🪄', '패션' => '👗',
];

$payload = Auth::requireUser();
$user = (new UserModel())->findById($payload['id']);
$tags = $user['tags'] ?: [];
$level = max(1, (int)($user['level'] ?? 1));

$topicsData = json_decode(file_get_contents(__DIR__ . '/../../data/topics.json'), true);
$categories = array_values(array_filter($tags, fn($t) => isset($topicsData[$t])));
if (!$categories) {
    $categories = array_keys($topicsData); // 관심사가 없으면 전체에서
}

$pool = [];
foreach ($categories as $category) {
    foreach ($topicsData[$category] as $topic) {
        $pool[] = [
            'category' => $category,
            'emoji' => CATEGORY_EMOJI[$category] ?? '⭐',
            'title' => $topic['title'],
            'hint' => $topic['hint'],
            'hintBlock' => $topic['hintBlock'] ?? (HINT_BLOCKS[$topic['hint']] ?? null),
            'level' => (int)$topic['level'],
        ];
    }
}

// 내 수준보다 너무 어려운 주제는 빼고 (남는 게 없으면 전체 사용)
$fit = array_values(array_filter($pool, fn($t) => $t['level'] <= $level + 1));
if ($fit) $pool = $fit;
shuffle($pool);

// 여러 관심사를 골랐다면 카테고리가 겹치지 않게 먼저 뽑는다
$picked = [];
$usedCategories = [];
foreach ($pool as $topic) {
    if (count($picked) >= RECOMMEND_COUNT) break;
    if (!in_array($topic['category'], $usedCategories, true)) {
        $picked[] = $topic;
        $usedCategories[] = $topic['category'];
    }
}
foreach ($pool as $topic) {
    if (count($picked) >= RECOMMEND_COUNT) break;
    if (!in_array($topic, $picked, true)) $picked[] = $topic;
}

Response::success($picked);
