<?php
// backend/config/Response.php
class Response {
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
