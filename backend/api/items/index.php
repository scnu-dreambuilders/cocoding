<?php
// backend/api/items/index.php
// GET   내 꾸미기 아이템 목록
// PATCH {id, equipped}  코코에게 입히기/벗기기 (같은 종류는 하나만)
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../models/ItemModel.php';

$payload = Auth::requireUser();
$itemModel = new ItemModel();

if ($_SERVER['REQUEST_METHOD'] === 'PATCH') {
    $data = json_decode(file_get_contents("php://input"), true) ?? [];
    $itemId = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT);
    if (!$itemId) {
        Response::error("아이템 ID가 필요합니다.");
    }
    if (!$itemModel->setEquipped($payload['id'], $itemId, !empty($data['equipped']))) {
        Response::error("아이템을 찾을 수 없습니다.", 404);
    }
}

Response::success($itemModel->findByUser($payload['id']));
