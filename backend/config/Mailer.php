<?php
// backend/config/Mailer.php
// 메일 보내기. 메일 서버가 없는 개발 환경에서는 보내는 대신 data/mail.log에 적어둔다.
// .env: MAIL_ENABLED=true, MAIL_FROM="코코딩 <no-reply=도메인>", APP_URL=https://...
require_once __DIR__ . '/Env.php';

class Mailer {
    public static function appUrl() {
        return rtrim((string)Env::get('APP_URL', 'http://localhost:5173'), '/');
    }

    // 성공/실패와 상관없이 호출한 쪽 응답은 같아야 한다 (계정 존재 여부가 새지 않게)
    public static function send($to, $subject, $body) {
        $from = (string)Env::get('MAIL_FROM', '');
        $enabled = filter_var(Env::get('MAIL_ENABLED', 'false'), FILTER_VALIDATE_BOOLEAN);

        if ($enabled && $from !== '' && function_exists('mail')) {
            $headers = [
                'From: ' . $from,
                'Content-Type: text/plain; charset=UTF-8',
                'MIME-Version: 1.0',
            ];
            $encoded = '=?UTF-8?B?' . base64_encode($subject) . '?=';
            if (@mail($to, $encoded, $body, implode("\r\n", $headers))) return true;
            error_log('[Mailer] 메일 전송 실패 (받는 사람은 기록하지 않음)');
        }
        self::logToFile($to, $subject, $body);
        return false;
    }

    // 개발용 기록. 내 PC에서 띄웠을 때만 받는 사람과 본문(재설정 링크)을 파일에 남긴다.
    // 실제 서버에서는 남기지 않는다: 메일이 꺼져 있거나 전송에 실패하면 이메일 주소와
    // 30분 동안 살아 있는 재설정 링크가 그대로 파일에 쌓이기 때문이다
    private static function logToFile($to, $subject, $body) {
        if (!function_exists('isLocalRequest') || !isLocalRequest()) {
            error_log('[Mailer] 메일을 보내지 못했습니다 (MAIL_ENABLED 가 꺼져 있거나 전송 실패). 받는 사람과 본문은 기록하지 않습니다.');
            return;
        }
        $dir = __DIR__ . '/../data';
        $line = sprintf("[%s] to=%s subject=%s\n%s\n%s\n", date('c'), $to, $subject, $body, str_repeat('-', 60));
        if (is_dir($dir) && is_writable($dir)) {
            @file_put_contents($dir . '/mail.log', $line, FILE_APPEND);
        } else {
            error_log('[Mailer] ' . str_replace("\n", ' / ', $line));
        }
    }
}
