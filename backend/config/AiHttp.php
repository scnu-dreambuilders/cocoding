<?php
// backend/config/AiHttp.php
// AI 제공자(Gemini·OpenRouter)에 공통으로 쓰는 HTTPS POST.
// API 키는 서버 .env에만 두고 브라우저로는 절대 보내지 않는다.
require_once __DIR__ . '/Env.php';

// 키가 없거나 요청이 실패해서 지금은 대답할 수 없는 상태
class AiUnavailableException extends RuntimeException {}

class AiHttp {
    const TIMEOUT_SECONDS = 20;

    // 윈도우용 PHP는 HTTPS 인증서 목록(curl.cainfo)이 비어 있는 경우가 많다.
    // 그럴 때만 .env의 CA_BUNDLE 또는 PC에 이미 있는 인증서 묶음을 쓴다 (검증은 끄지 않음)
    public static function caBundle() {
        if (ini_get('curl.cainfo') || ini_get('openssl.cafile')) return null;
        $candidates = [
            (string)Env::get('CA_BUNDLE', ''),
            'C:\\xampp\\apache\\bin\\curl-ca-bundle.crt',
            'C:\\Program Files\\Git\\mingw64\\etc\\ssl\\certs\\ca-bundle.crt',
            'C:\\Program Files\\Git\\mingw64\\ssl\\certs\\ca-bundle.crt',
        ];
        foreach ($candidates as $path) {
            if ($path !== '' && is_file($path)) return $path;
        }
        return null;
    }

    // [HTTP 상태코드, 응답 본문] — 연결 자체가 안 되면 AiUnavailableException
    public static function post($url, array $headers, $payload, $label = 'AI') {
        $ca = self::caBundle();
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $payload,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => self::TIMEOUT_SECONDS,
            ]);
            if ($ca) curl_setopt($ch, CURLOPT_CAINFO, $ca);
            $raw = curl_exec($ch);
            $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $error = curl_error($ch);
            curl_close($ch);
            if ($raw === false) throw new AiUnavailableException("$label 연결 실패: $error");
            return [$status, $raw];
        }

        // curl 확장이 없는 웹호스팅용
        $context = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $headers),
            'content' => $payload,
            'timeout' => self::TIMEOUT_SECONDS,
            'ignore_errors' => true,
        ], 'ssl' => $ca ? ['cafile' => $ca] : []]);
        $raw = @file_get_contents($url, false, $context);
        if ($raw === false) throw new AiUnavailableException("$label 연결 실패");
        $status = preg_match('#^HTTP/\S+\s+(\d{3})#', $http_response_header[0] ?? '', $m) ? (int)$m[1] : 0;
        return [$status, $raw];
    }

    // .env의 true/false 값 읽기.
    // .env는 ini 형식이라 PHP가 true를 '1'로, false를 빈 문자열로 바꿔서 읽는다.
    // 그래서 '빈 값'과 '줄이 아예 없음'을 Env::has로 구분한다.
    public static function flag($key, $default) {
        if (!Env::has($key)) return $default;
        $raw = strtolower(trim((string)Env::get($key, '')));
        if ($raw === '') return false;
        return in_array($raw, ['1', 'true', 'yes', 'on'], true);
    }
}
