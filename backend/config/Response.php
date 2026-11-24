<?php
// backend/config/Response.php
class Response {
    // 요청 본문(JSON)을 배열로 읽는다. 본문이 없거나, JSON 이 아니거나, 5 나 "x" 처럼
    // 배열이 아닌 값이면 빈 배열을 돌려준다. 그대로 쓰면 array_key_exists 에서 오류(500)가 난다
    public static function input() {
        $data = json_decode((string)file_get_contents('php://input'), true);
        return is_array($data) ? $data : [];
    }

    public static function json($data, $status = 200) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code($status);
        echo json_encode($data);
        exit;
    }

    public static function success($data = [], $status = 200) {
        self::json(['success' => true, 'data' => $data], $status);
    }

    public static function error($message, $status = 400) {
        self::json(['success' => false, 'error' => $message], $status);
    }
}
