<?php
// backend/config/Mailer.php
// 메일 보내기. 메일 서버가 없는 개발 환경에서는 보내는 대신 기록을 남긴다.
// .env: MAIL_ENABLED=true, MAIL_FROM="코코딩 <no-reply=도메인>", APP_URL=https://...
//
// 보안 규칙: 메일 본문은 절대 파일에 남기지 않는다. 비밀번호 재설정 링크처럼
// 30분 동안 유효한 비밀이 들어 있기 때문이다. 기록에는 받는 사람(가린 주소),
// 제목, 본문 길이만 남긴다.
require_once __DIR__ . '/Env.php';
require_once __DIR__ . '/Storage.php';

class Mailer {
    public static function appUrl() {
        return rtrim((string)Env::get('APP_URL', 'http://localhost:5173'), '/');
    }

    // 실제로 mail() 을 부를 수 있는 상태인지. 비밀번호 찾기 API 가 이 값을 보고
    // 메일이 꺼진 서버에서 토큰을 만들지 않고 안내를 돌려준다.
    public static function enabled() {
        $enabled = filter_var(Env::get('MAIL_ENABLED', 'false'), FILTER_VALIDATE_BOOLEAN);
        $from = trim((string)Env::get('MAIL_FROM', ''));
        return $enabled && $from !== '' && function_exists('mail');
    }

    // 성공/실패와 상관없이 호출한 쪽 응답은 같아야 한다 (계정 존재 여부가 새지 않게)
    public static function send($to, $subject, $body) {
        if (self::enabled()) {
            $from = trim((string)Env::get('MAIL_FROM', ''));
            $headers = [
                'From: ' . $from,
                'Content-Type: text/plain; charset=UTF-8',
                'MIME-Version: 1.0',
            ];
            $encoded = '=?UTF-8?B?' . base64_encode($subject) . '?=';
            if (@mail($to, $encoded, $body, implode("\r\n", $headers))) return true;
            error_log('[Mailer] 전송 실패: ' . self::maskEmail($to));
        }
        self::logToFile($to, $subject, strlen((string)$body));
        return false;
    }

    // 개발·장애 확인용 기록. 본문은 남기지 않고 메타데이터만 남긴다.
    private static function logToFile($to, $subject, $bodyBytes) {
        $line = sprintf(
            "[%s] to=%s subject=%s body=%d bytes (REDACTED)\n",
            date('c'),
            self::maskEmail($to),
            self::oneLine($subject),
            $bodyBytes
        );
        $dir = Storage::ensureRuntimeDir();
        if ($dir === null) {
            error_log('[Mailer] ' . rtrim($line));
            return;
        }

        $file = $dir . '/mail.log';
        if (@file_put_contents($file, $line, FILE_APPEND | LOCK_EX) !== false) {
            // 예전에 만들어진 파일이 0644여도 다음 기록 때 0600으로 좁힌다.
            @chmod($file, 0600);
        }
    }

    private static function maskEmail($email) {
        $email = trim((string)$email);
        $at = strrpos($email, '@');
        if ($at === false) return '***';
        $name = substr($email, 0, $at);
        $domain = substr($email, $at);
        $first = $name === '' ? '' : mb_substr($name, 0, 1);
        return $first . '***' . $domain;
    }

    private static function oneLine($text) {
        return str_replace(["\r", "\n"], ' ', trim((string)$text));
    }
}
