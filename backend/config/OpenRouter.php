<?php
// backend/config/OpenRouter.php
// OpenRouter(chat/completions) 호출. 여러 회사 모델을 같은 방식으로 부를 수 있다.
// .env에서 OPENROUTER_USE=true로 켜고, OPENROUTER_KEY와 OPENROUTER_MODEL을 적어주면 된다.
require_once __DIR__ . '/Env.php';
require_once __DIR__ . '/AiHttp.php';

class OpenRouter {
    const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
    const DEFAULT_MODEL = 'google/gemini-omni-1.2-flash';

    public static function isEnabled() {
        return AiHttp::flag('OPENROUTER_USE', false);
    }

    public static function isConfigured() {
        return self::isEnabled() && self::key() !== '';
    }

    public static function model() {
        $model = trim((string)Env::get('OPENROUTER_MODEL', ''));
        return $model !== '' ? $model : self::DEFAULT_MODEL;
    }

    private static function key() {
        return trim((string)Env::get('OPENROUTER_KEY', ''));
    }

    // $contents: [['role' => 'user'|'model', 'text' => '...'], ...]  (Gemini와 같은 모양)
    // 성공하면 답변 문자열, 빈 답이면 null
    public static function generate($systemInstruction, array $contents, array $generationConfig = []) {
        $key = self::key();
        if ($key === '') throw new AiUnavailableException('OPENROUTER_KEY가 설정되지 않았습니다.');

        $messages = [['role' => 'system', 'content' => $systemInstruction]];
        foreach ($contents as $c) {
            // OpenRouter는 model 대신 assistant를 쓴다
            $messages[] = [
                'role' => ($c['role'] ?? 'user') === 'model' ? 'assistant' : 'user',
                'content' => (string)($c['text'] ?? ''),
            ];
        }

        $body = ['model' => self::model(), 'messages' => $messages];
        if (isset($generationConfig['temperature'])) $body['temperature'] = (float)$generationConfig['temperature'];
        if (isset($generationConfig['maxOutputTokens'])) $body['max_tokens'] = (int)$generationConfig['maxOutputTokens'];

        $headers = [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $key,
            // OpenRouter 통계 화면에 어느 서비스가 부른 건지 표시되는 값 (선택 항목)
            'X-Title: Cocoding',
        ];
        $appUrl = trim((string)Env::get('APP_URL', ''));
        if ($appUrl !== '') $headers[] = 'HTTP-Referer: ' . $appUrl;

        [$status, $raw] = AiHttp::post(self::ENDPOINT, $headers, json_encode($body), 'OpenRouter');
        $json = json_decode((string)$raw, true);
        if ($status !== 200 || !is_array($json) || isset($json['error'])) {
            // 키·모델 오류 내용은 서버 로그에만 남기고 사용자에게는 보여주지 않는다
            error_log("OpenRouter API error ($status): " . substr((string)$raw, 0, 500));
            throw new AiUnavailableException("OpenRouter 요청 실패 ($status)");
        }

        $text = trim((string)($json['choices'][0]['message']['content'] ?? ''));
        return $text === '' ? null : $text;
    }
}
