<?php
// backend/config/ReplyFilter.php
// 코코(AI)가 돌려준 답을 학생에게 보여주기 전에 한 번 거른다.
//
// Gemini에는 유해 내용 차단 설정(safetySettings)이 있지만 OpenRouter에는 같은 기능이 없다.
// 그래서 제공자와 상관없이 서버에서 한 번 더 본다. 걸리면 답을 버리고 안전한 문장으로 바꾼다.
//
// 블록코딩 수업에서 자연스럽게 나오는 말(적을 없애기, 게임오버, 공격 같은 게임 이야기,
// '전화번호는 알려주면 안 돼' 같은 안내)은 통과해야 하므로, 낱말만 보고 막지 않고
// 실제 값(전화번호 숫자, 주소 형식)이나 분명한 표현만 본다.

class ReplyFilter {
    /* 걸린 이유를 돌려준다. 문제가 없으면 null */
    public static function check($reply) {
        $text = (string)$reply;
        if (trim($text) === '') return null;
        $flat = preg_replace('/\s+/u', '', $text); // 글자 사이에 공백을 끼워 피하는 것 막기

        foreach (self::rules() as [$pattern, $reason, $useFlat]) {
            if (preg_match($pattern, $useFlat ? $flat : $text)) return $reason;
        }
        return null;
    }

    /* [정규식, 이유, 공백 지운 문장으로 볼지] */
    private static function rules() {
        return [
            // 링크·웹사이트 주소 (시스템 지시에서 금지한 항목)
            ['~(https?://|www\.)~i', 'link', false],
            ['~[\w-]+\.(?:com|net|org|io|me|gg|xyz|co\.kr|kr)(?:/|\b)~i', 'link', false],

            // 연락처·식별번호가 실제 값으로 들어간 경우
            ['~0\d{1,2}[- ]?\d{3,4}[- ]?\d{4}~', 'contact', false],
            ['~[\w.+-]+@[\w-]+\.[\w.-]+~', 'contact', false],
            ['~\d{6}[- ]\d{7}~', 'contact', false],
            ['~\d{4}[- ]\d{4}[- ]\d{4}[- ]\d{4}~', 'contact', false],

            // 욕설·모욕
            ['~(씨발|시발|씨빨|시팔|병신|지랄|개새끼|새끼야|니미|애미|썅|좆|존나|미친놈|미친년|닥쳐|꺼져라)~u', 'abuse', true],
            ['~\b(fuck|shit|bitch|asshole|bastard)~i', 'abuse', false],

            // 성적인 내용
            ['~(섹스|성관계|자위|야동|포르노|19금|야한사진|가슴을만져)~u', 'sexual', true],

            // 자해·죽음을 부추기는 말 (게임 속 '적을 없애기'와 구분하려고 사람에게 하는 말만)
            ['~(자살해|자살하는법|죽어버려|죽어라|뒈져|목을매|손목을그어)~u', 'selfharm', true],

            // 개인정보를 캐묻는 말
            ['~(이름이뭐야|몇살이야|어디살아|어느학교|학교이름|주소가어디|전화번호알려|번호알려줘|사진보내)~u', 'askpersonal', true],

            // 지시문(시스템 프롬프트)을 그대로 뱉은 경우
            ['~너는초등학생용블록코딩~u', 'leak', true],
            ['~말투와길이~u', 'leak', true],
        ];
    }
}
