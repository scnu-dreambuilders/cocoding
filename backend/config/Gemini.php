<?php
// backend/config/Gemini.php
// Gemini API(generateContent) 호출. API 키는 서버 .env에만 두고 브라우저로는 절대 보내지 않는다.
// 어느 AI를 쓸지는 AiChat.php가 고른다. .env에서 GEMINI_API_TRUE=false면 꺼진다.
require_once __DIR__ . '/Env.php';
require_once __DIR__ . '/AiHttp.php';

// 예전 코드가 이 이름으로 잡고 있어서 남겨둔다
class GeminiUnavailableException extends AiUnavailableException {}

class Gemini {
    const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent';
    const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

    // 값을 안 적어두면 켜진 것으로 본다 (예전 설정 그대로 돌아가도록)
    public static function isEnabled() {
        return AiHttp::flag('GEMINI_API_TRUE', true);
    }

    public static function isConfigured() {
        return self::isEnabled() && trim((string)Env::get('GEMINI_API_KEY', '')) !== '';
    }

    public static function model() {
        $model = trim((string)Env::get('GEMINI_MODEL', ''));
        return $model !== '' ? $model : self::DEFAULT_MODEL;
    }

    // $contents: [['role' => 'user'|'model', 'text' => '...'], ...]
    // 성공하면 답변 문자열, 안전 필터에 막히거나 빈 답이면 null
    public static function generate($systemInstruction, array $contents, array $generationConfig = []) {
        $apiKey = trim((string)Env::get('GEMINI_API_KEY', ''));
        if ($apiKey === '') throw new GeminiUnavailableException('GEMINI_API_KEY가 설정되지 않았습니다.');
        $model = self::model();

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

        $headers = ['Content-Type: application/json', 'x-goog-api-key: ' . $apiKey];
        [$status, $raw] = AiHttp::post(sprintf(self::ENDPOINT, rawurlencode($model)), $headers, json_encode($body), 'Gemini');
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
}
