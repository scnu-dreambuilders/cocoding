<?php
// backend/api/auth/logout.php
// 로그아웃: 서버에서 이 사용자의 토큰을 모두 무효화 (다른 기기 포함)
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

$payload = Auth::user();
if ($payload) {
    Auth::revoke($payload['id']);
}
// 이미 만료된 토큰이어도 로그아웃은 성공으로 처리
Response::success(["message" => "로그아웃되었습니다."]);
