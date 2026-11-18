<?php
// backend/api/admin/settings.php — 관리자 웹: 운영 기준값 관리
//
// GET  기준값 목록. 화면이 입력칸을 직접 그릴 수 있게 항목마다 이름·설명·범위가 함께 온다
// PUT  { "values": { "coin.chapter": 50, ... } }   여러 개를 한 번에 저장
// PUT  { "reset": ["coin.chapter", ...] }          기본값으로 되돌리기
//
// 정한 규칙
//   · 기준값은 settings 표에 저장하고, 행이 없으면 config/Settings.php 의 기본값을 쓴다.
//     그래서 표가 비어 있어도 서비스는 그대로 돌아간다.
//   · 저장은 전부 되거나 전부 안 되는 식이 아니다. 하나라도 범위를 벗어나면 그 항목만
//     거절하고 나머지는 저장한다 — 어느 칸이 틀렸는지 화면에 바로 보여줄 수 있게 한다.
//   · 바꾼 사람(updated_by)과 시각(updated_at)을 표에 남기고, 운영 기록에도 남긴다.
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../config/Logger.php';
require_once __DIR__ . '/../../config/Settings.php';

$admin = Auth::requireAdmin();
$adminId = (int)$admin['id'];
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    Response::success(['settings' => Settings::describe()]);
}

if ($method !== 'PUT') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

$data = json_decode(file_get_contents("php://input"), true);
if (!is_array($data)) $data = [];

$values = isset($data['values']) && is_array($data['values']) ? $data['values'] : [];
$resets = isset($data['reset']) && is_array($data['reset']) ? $data['reset'] : [];

if (!$values && !$resets) {
    Response::error("바꿀 기준값을 보내주세요.", 400);
}

$saved = [];
$errors = [];   // 항목 이름 => 왜 안 됐는지 (화면이 그 칸 아래에 보여줄 수 있게)

foreach ($values as $name => $value) {
    $error = Settings::set($name, $value, $adminId);
    if ($error === null) {
        $saved[] = $name;
    } else {
        $errors[(string)$name] = $error;
    }
}

foreach ($resets as $name) {
    if (!is_string($name)) continue;
    $error = Settings::reset($name);
    if ($error === null) {
        $saved[] = $name;
    } else {
        $errors[$name] = $error;
    }
}

if ($saved) {
    Logger::audit('admin.settings', ['by' => $adminId, 'saved' => $saved]);
}

$message = $saved
    ? count($saved) . '개 기준값을 저장했어요.'
    : '저장된 기준값이 없어요.';
if ($errors) {
    $message .= ' ' . count($errors) . '개는 저장하지 못했어요.';
}

Response::success([
    'settings' => Settings::describe(),
    'saved' => $saved,
    'errors' => $errors,
    'message' => $message,
]);
