<?php
// backend/api/admin/stats.php — 관리자 웹: 한눈에 보기(대시보드)
//
// GET  회원·학습·게시판·신고·코인 숫자와 최근 7일 가입자
//
// 개인정보는 들어가지 않는다. 사람을 셀 뿐이고 누구인지는 돌려주지 않는다.
// '최근 7일 활동'은 그 기간에 코인이 오간 사람 수로 센다. 접속 시각을 따로 저장하지
// 않기 때문에, 출석·챕터·작품 저장·게임 중 하나라도 한 사람을 활동한 사람으로 본다.
require_once __DIR__ . '/../../config/Bootstrap.php';
require_once __DIR__ . '/../../config/Auth.php';
require_once __DIR__ . '/../../models/AdminModel.php';

Auth::requireAdmin();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    Response::error("잘못된 요청 방식입니다.", 405);
}

Response::success((new AdminModel())->stats());
