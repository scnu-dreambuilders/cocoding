<?php
// backend/config/AiChat.php
// 코코 대화를 어느 AI로 보낼지 고른다. 부르는 쪽(api/coco/chat.php)은 이 파일만 쓰면 된다.
//
// .env 설정
//   OPENROUTER_USE=true    → OpenRouter 사용 (실제 서비스용)
//   OPENROUTER_KEY=...     → OpenRouter API 키
//   OPENROUTER_MODEL=...   → 쓸 모델 (비우면 OpenRouter::DEFAULT_MODEL)
//   GEMINI_API_TRUE=false  → Gemini(AI Studio) 끄기. 비워두면 켜진 것으로 본다
//   GEMINI_API_KEY=...     → Gemini API 키
//
// 둘 다 켜져 있으면 OpenRouter를 먼저 쓴다. 둘 다 못 쓰면 대화 기능만 꺼지고
// 나머지 기능은 그대로 동작한다.
require_once __DIR__ . '/AiHttp.php';
require_once __DIR__ . '/Gemini.php';
require_once __DIR__ . '/OpenRouter.php';

class AiChat {
    // 지금 쓸 제공자 이름 ('openrouter' | 'gemini') — 쓸 수 있는 게 없으면 null
    public static function provider() {
        if (OpenRouter::isConfigured()) return 'openrouter';
        if (Gemini::isConfigured()) return 'gemini';
        return null;
    }

    public static function isConfigured() {
        return self::provider() !== null;
    }

    // 지금 쓰는 모델 이름 (설정 화면·로그 확인용)
    public static function model() {
        $provider = self::provider();
        if ($provider === 'openrouter') return OpenRouter::model();
        if ($provider === 'gemini') return Gemini::model();
        return null;
    }

    // $contents: [['role' => 'user'|'model', 'text' => '...'], ...]
    // 성공하면 답변 문자열, 안전 필터에 막히거나 빈 답이면 null
    public static function generate($systemInstruction, array $contents, array $generationConfig = []) {
        switch (self::provider()) {
            case 'openrouter':
                return OpenRouter::generate($systemInstruction, $contents, $generationConfig);
            case 'gemini':
                return Gemini::generate($systemInstruction, $contents, $generationConfig);
            default:
                throw new AiUnavailableException('쓸 수 있는 AI 설정이 없습니다. .env의 OPENROUTER_USE 또는 GEMINI_API_TRUE를 확인해주세요.');
        }
    }
}
