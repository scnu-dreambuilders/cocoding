<?php
// backend/api/admin/items.php — 관리자 웹: 코코 꾸미기 아이템과 상점 가격 관리
//
// GET    아이템 전체 + 종류 목록 + 자유창작 보상 후보(free_pool)
// PUT    { "items": { "왕관": { "type":"hat", "emoji":"👑", "price":30 }, ... },
//          "free_pool": ["왕관", ...] }      보낸 것만 바꾼다
// DELETE ?name=왕관                          아이템 하나 지우기
//
// 아이템 목록은 DB 가 아니라 backend/data/items.json 파일에 있다. 이 API 가 그 파일을
// 읽고 쓴다. 표로 옮기지 않은 이유는 지금 코드 여러 곳(챕터 보상·상점·꾸미기 화면)이
// 이 파일을 바로 읽고 있어서, 표로 바꾸면 그 자리를 다 손봐야 하기 때문이다.
//
// 정한 규칙
//   · price 가 있으면 상점에서 코인으로 살 수 있고, 없으면 상점에 안 나온다.
//     source 가 'chapter' 면 챕터 완료 보상으로만 얻는다.
//   · 이미 그 아이템을 가진 학생이 있으면 지울 수 없다. 지우면 그 학생의 꾸미기가 깨진다.
//   · 챕터 보상으로 걸려 있는 아이템도 지울 수 없다. 그 챕터를 깬 학생이 받을 것이 없어진다.
//   · 파일을 쓸 때 임시 파일에 먼저 쓰고 바꿔 끼운다. 쓰다가 실패해서 반쯤 쓴 JSON 이
//     남으면 꾸미기와 상점이 전부 멈춘다.
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/Logger.php';
require_once __DIR__ . '/../../config/Database.php';
require_once __DIR__ . '/../../models/ItemModel.php';

$admin = Auth::requireAdmin();
$adminId = (int)$admin['id'];
$method = $_SERVER['REQUEST_METHOD'];

const ITEM_FILE = __DIR__ . '/../../data/items.json';
const ITEM_TYPES = ['hat', 'glasses', 'background', 'accessory'];
const ITEM_MAX_PRICE = 100000;

function readCatalog() {
    $raw = @file_get_contents(ITEM_FILE);
    $data = $raw === false ? null : json_decode($raw, true);
    if (!is_array($data) || !isset($data['items']) || !is_array($data['items'])) {
        Response::error("아이템 파일을 읽을 수 없어요. 서버 관리자에게 알려주세요.", 500);
    }
    if (!isset($data['free_pool']) || !is_array($data['free_pool'])) $data['free_pool'] = [];
    return $data;
}

/* 임시 파일에 쓰고 바꿔 끼운다 — 쓰다 실패해도 원본이 깨지지 않게 */
function writeCatalog(array $data) {
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) Response::error("아이템 내용을 저장할 수 없어요.", 500);
    $tmp = ITEM_FILE . '.tmp';
    if (@file_put_contents($tmp, $json . "\n") === false) {
        Response::error("아이템 파일에 쓸 수 없어요. 폴더 권한을 확인해주세요.", 500);
    }
    if (!@rename($tmp, ITEM_FILE)) {
        @unlink($tmp);
        Response::error("아이템 파일을 바꿔 끼우지 못했어요.", 500);
    }
}

$catalog = readCatalog();

if ($method === 'GET') {
    $db = Database::getInstance();
    // 아이템마다 몇 명이 가지고 있는지 (지울 수 있는지 화면에서 판단하게)
    $owned = [];
    foreach ($db->query("SELECT item_name, COUNT(*) AS n FROM user_items GROUP BY item_name") as $r) {
        $owned[$r['item_name']] = (int)$r['n'];
    }
    // 챕터 보상으로 걸린 아이템
    $rewards = [];
    foreach ($db->query("SELECT id, reward_item FROM chapters WHERE reward_item IS NOT NULL AND reward_item <> ''") as $r) {
        $rewards[$r['reward_item']][] = (int)$r['id'];
    }

    $items = [];
    foreach ($catalog['items'] as $name => $info) {
        $items[] = [
            'name' => $name,
            'type' => $info['type'] ?? 'accessory',
            'emoji' => $info['emoji'] ?? '🎁',
            'price' => isset($info['price']) ? (int)$info['price'] : null,
            'source' => $info['source'] ?? null,
            'ownedBy' => isset($owned[$name]) ? $owned[$name] : 0,
            'chapterReward' => isset($rewards[$name]) ? $rewards[$name] : [],
        ];
    }
    Response::success([
        'items' => $items,
        'freePool' => array_values($catalog['free_pool']),
        'types' => ITEM_TYPES,
    ]);
}

if ($method === 'DELETE') {
    $name = isset($_GET['name']) ? trim((string)$_GET['name']) : '';
    if ($name === '' || !isset($catalog['items'][$name])) {
        Response::error("그런 아이템이 없어요.", 404);
    }
    $db = Database::getInstance();
    $cnt = $db->prepare("SELECT COUNT(*) FROM user_items WHERE item_name = ?");
    $cnt->execute([$name]);
    if ((int)$cnt->fetchColumn() > 0) {
        Response::error("이미 이 아이템을 가진 학생이 있어서 지울 수 없어요. 상점에서만 빼려면 가격을 지워주세요.", 400);
    }
    $ch = $db->prepare("SELECT COUNT(*) FROM chapters WHERE reward_item = ?");
    $ch->execute([$name]);
    if ((int)$ch->fetchColumn() > 0) {
        Response::error("챕터 보상으로 걸려 있어서 지울 수 없어요. 먼저 챕터 보상을 바꿔주세요.", 400);
    }

    unset($catalog['items'][$name]);
    $catalog['free_pool'] = array_values(array_filter($catalog['free_pool'], function ($n) use ($name) {
        return $n !== $name;
    }));
    writeCatalog($catalog);
    Logger::admin('admin.item.delete', ['by' => $adminId]);
    Response::success(['message' => '아이템을 지웠어요.']);
}

if ($method !== 'PUT') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

$data = Response::input();
if (!is_array($data)) $data = [];

$saved = [];

if (isset($data['items'])) {
    if (!is_array($data['items'])) Response::error("items 는 { 이름: 정보 } 모양으로 보내주세요.", 400);
    foreach ($data['items'] as $name => $info) {
        $name = trim((string)$name);
        if ($name === '' || mb_strlen($name) > 100) {
            Response::error("아이템 이름은 1~100자로 써주세요.", 400);
        }
        if (!is_array($info)) Response::error("'$name' 의 정보를 다시 보내주세요.", 400);

        $type = isset($info['type']) ? $info['type'] : 'accessory';
        if (!in_array($type, ITEM_TYPES, true)) {
            Response::error("'$name' 의 종류는 " . implode('·', ITEM_TYPES) . " 중에 골라주세요.", 400);
        }
        $emoji = isset($info['emoji']) && is_string($info['emoji']) ? trim($info['emoji']) : '';
        if ($emoji === '' || mb_strlen($emoji) > 8) {
            Response::error("'$name' 의 그림(이모지)을 넣어주세요.", 400);
        }

        $entry = ['type' => $type, 'emoji' => $emoji];

        // price 를 null 로 보내면 상점에서 뺀다
        if (array_key_exists('price', $info) && $info['price'] !== null && $info['price'] !== '') {
            if (is_bool($info['price']) || !is_numeric($info['price']) || (int)$info['price'] != $info['price']) {
                Response::error("'$name' 의 가격은 숫자로 적어주세요.", 400);
            }
            $price = (int)$info['price'];
            if ($price < 0 || $price > ITEM_MAX_PRICE) {
                Response::error("'$name' 의 가격은 0부터 " . ITEM_MAX_PRICE . "까지만 넣을 수 있어요.", 400);
            }
            $entry['price'] = $price;
        }

        if (isset($info['source']) && $info['source'] === 'chapter') {
            $entry['source'] = 'chapter';
        }

        $catalog['items'][$name] = $entry;
        $saved[] = $name;
    }
}

if (isset($data['free_pool'])) {
    if (!is_array($data['free_pool'])) Response::error("free_pool 은 이름 배열로 보내주세요.", 400);
    $pool = [];
    foreach ($data['free_pool'] as $n) {
        if (!is_string($n)) Response::error("free_pool 에 글자가 아닌 값이 있어요.", 400);
        if (!isset($catalog['items'][$n])) {
            Response::error("free_pool 에 없는 아이템이 있어요: " . mb_substr($n, 0, 40), 400);
        }
        if (!in_array($n, $pool, true)) $pool[] = $n;
    }
    $catalog['free_pool'] = $pool;
    $saved[] = 'free_pool';
}

if (!$saved) Response::error("바꿀 내용이 없어요.", 400);

writeCatalog($catalog);
Logger::admin('admin.item.update', ['by' => $adminId, 'count' => count($saved)]);

Response::success(['message' => count($saved) . '개를 저장했어요.', 'saved' => $saved]);
