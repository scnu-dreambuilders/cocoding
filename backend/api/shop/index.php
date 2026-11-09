<?php
// backend/api/shop/index.php
// GET            상점에 있는 꾸미기 아이템 목록 + 내 코인 + 코인 사용 내역
// POST {item}    코인으로 아이템 사기
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/RateLimiter.php';
require_once __DIR__ . '/../../config/Validators.php';
require_once __DIR__ . '/../../models/CoinModel.php';
require_once __DIR__ . '/../../models/ItemModel.php';

$payload = Auth::requireUser();
$userId = (int)$payload['id'];
$coins = new CoinModel();
$items = new ItemModel();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    Response::success([
        'balance' => $coins->balance($userId),
        'items' => $items->shopCatalog($userId),
        'history' => $coins->history($userId, 10),
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

RateLimiter::limit("shop:buy:$userId", 60, 3600, "잠깐 쉬었다가 다시 사보자!");

$data = json_decode(file_get_contents("php://input"), true) ?? [];
$name = is_string($data['item'] ?? null) ? $data['item'] : '';
$price = ItemModel::price($name);

if ($price === null) {
    Response::error("상점에 없는 아이템이에요.", 404);
}
if ($items->has($userId, $name)) {
    Response::error("이미 가지고 있는 아이템이에요.", 409);
}

$db = Database::getInstance();
$db->beginTransaction();
try {
    // 코인을 먼저 빼고(잔액 부족이면 실패) 아이템을 준다
    if (!$coins->spend($userId, $price, 'shop', $name)) {
        $db->rollBack();
        Response::error("코인이 모자라요. 출석하거나 챕터를 완료하면 모을 수 있어!", 409);
    }
    $items->grant($userId, $name);
    $db->commit();
} catch (Throwable $e) {
    $db->rollBack();
    throw $e;
}

Response::success([
    'message' => Validators::withParticle($name) . ' 샀어! 코코에게 입혀보자',
    'balance' => $coins->balance($userId),
    'items' => $items->shopCatalog($userId),
]);
