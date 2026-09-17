<?php
// backend/config/Validators.php
// 가입·내 정보 수정에서 같이 쓰는 입력 규칙 (frontend/src/lib/validators.js와 같아야 함)
class Validators {
    // 너무 흔해서 금방 뚫리는 비밀번호
    const COMMON_PASSWORDS = ['12345678', '123456789', '1234567890', '11111111', '00000000', 'password', 'password1',
        'qwer1234', 'qwerty12', 'qwerty123', 'asdf1234', 'abcd1234', '1q2w3e4r', '1q2w3e4r5t', 'a1234567', 'aa123456', 'iloveyou1'];

    // 만 14세 미만은 보호자 동의가 필요 (개인정보보호법 제22조의2).
    // 태어난 해만 받으므로, 올해 14살이 되는 경우도 안전하게 동의 대상으로 본다.
    const CONSENT_AGE = 14;

    // 닉네임은 친구 작품 탭·반 명단에 보이므로 글자 종류와 길이를 제한
    public static function username($username) {
        if (!is_string($username) || !preg_match('/^[\p{Hangul}A-Za-z0-9_]{2,12}$/u', $username)) {
            return "닉네임은 한글·영문·숫자로 2~12자까지 쓸 수 있어요.";
        }
        return null;
    }

    public static function password($password) {
        if (!is_string($password) || strlen($password) < 8 || strlen($password) > 72
            || !preg_match('/[A-Za-z]/', $password) || !preg_match('/[0-9]/', $password)) {
            return "비밀번호는 영문과 숫자를 섞어서 8자 이상으로 만들어주세요.";
        }
        if (in_array(strtolower($password), self::COMMON_PASSWORDS, true)) {
            return "너무 쉬운 비밀번호예요. 다른 비밀번호를 써주세요.";
        }
        return null;
    }

    public static function birthYear($year) {
        $now = (int)date('Y');
        if (!is_int($year) || $year > $now - 5 || $year < $now - 100) {
            return "태어난 해를 다시 확인해주세요.";
        }
        return null;
    }

    public static function needsGuardianConsent($birthYear) {
        return (int)date('Y') - (int)$birthYear <= self::CONSENT_AGE;
    }

    // 헷갈리는 글자(0/O, 1/I/L)를 뺀 코드 — 아이가 보고 불러주기 쉽게
    public static function randomCode($length) {
        $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        $code = '';
        for ($i = 0; $i < $length; $i++) {
            $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        return $code;
    }

    // 사람이 입력한 코드 정리: 공백·하이픈 제거, 대문자
    public static function normalizeCode($code) {
        return is_string($code) ? strtoupper(preg_replace('/[\s-]+/', '', $code)) : '';
    }
}
