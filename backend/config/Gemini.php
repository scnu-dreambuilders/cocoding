<?php
// backend/config/Gemini.php
// Gemini API(generateContent) 호출. API 키는 서버 .env에만 두고 브라우저로는 절대 보내지 않는다.
require_once __DIR__ . '/Env.php';

class GeminiUnavailableException extends RuntimeException {}

class Gemini {
    const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent';
    const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
    const TIMEOUT_SECONDS = 20;

    public static function isConfigured() {
        return (string)Env::get('GEMINI_API_KEY', '') !== '';
    }

    // $contents: [['role' => 'user'|'model', 'text' => '...'], ...]
    // 성공하면 답변 문자열, 안전 필터에 막히거나 빈 답이면 null
    public static function generate($systemInstruction, array $contents, array $generationConfig = []) {
        $apiKey = (string)Env::get('GEMINI_API_KEY', '');
        if ($apiKey === '') throw new GeminiUnavailableException('GEMINI_API_KEY가 설정되지 않았습니다.');
        $model = (string)Env::get('GEMINI_MODEL', self::DEFAULT_MODEL) ?: self::DEFAULT_MODEL;

        // 어린이 서비스라 모든 유해 분류를 가장 엄격하게 차단
        $safety = [];
        foreach (['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'] as $category) {
            $safety[] = ['category' => $category, 'threshold' => 'BLOCK_LOW_AND_ABOVE'];
        }

        $body = [
            'systemInstruction' => ['parts' => [['text' => $systemInstruction]]],
            'contents' => array_map(fn($c) => ['role' => $c['role'], 'parts' => [['text' => $c['text']]]], $contents),
            'generationConfig' => $generationConfig,
            'safetySettings' => $safety,
        ];

        [$status, $raw] = self::post(sprintf(self::ENDPOINT, rawurlencode($model)), $apiKey, json_encode($body));
        $json = json_decode((string)$raw, true);
        if ($status !== 200 || !is_array($json)) {
            // 키·모델 오류 내용은 서버 로그에만 남기고 사용자에게는 보여주지 않는다
            error_log("Gemini API error ($status): " . substr((string)$raw, 0, 500));
            throw new GeminiUnavailableException("Gemini API 요청 실패 ($status)");
        }

        if (!empty($json['promptFeedback']['blockReason'])) return null;
        $parts = $json['candidates'][0]['content']['parts'] ?? [];
        $text = trim(implode('', array_map(fn($p) => $p['text'] ?? '', $parts)));
        return $text === '' ? null : $text;
    }

    // 윈도우용 PHP는 HTTPS 인증서 목록(curl.cainfo)이 비어 있는 경우가 많다.
    // 그럴 때만 .env의 CA_BUNDLE 또는 PC에 이미 있는 인증서 묶음을 쓴다 (검증은 끄지 않음)
    private static function caBundle() {
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

    private static function post($url, $apiKey, $payload) {
        $headers = ['Content-Type: application/json', 'x-goog-api-key: ' . $apiKey];
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
            if ($raw === false) throw new GeminiUnavailableException("Gemini 연결 실패: $error");
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
        if ($raw === false) throw new GeminiUnavailableException('Gemini 연결 실패');
        $status = preg_match('#^HTTP/\S+\s+(\d{3})#', $http_response_header[0] ?? '', $m) ? (int)$m[1] : 0;
        return [$status, $raw];
    }
}
