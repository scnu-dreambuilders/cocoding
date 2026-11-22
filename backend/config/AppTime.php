<?php
// backend/config/AppTime.php
// 서비스가 쓰는 기준 시간대를 한 곳에서 정한다.
//
// 왜 필요한가: PHP와 DB가 서로 다른 시간대로 돌면 같은 "오늘"이 9시간씩 어긋난다.
// 출석은 DB의 CURDATE() 로 하루를 세는데 코인 기록은 PHP의 date() 로 날짜를 붙이는 식이라,
// 두 시간대가 다르면 새벽에 출석한 학생이 코인을 못 받는 일이 생긴다. 서버마다 설정이
// 다를 수 있으니(우분투는 보통 UTC, 윈도우 개발 PC는 한국 시간) 양쪽을 코드에서 못박는다.
//
// APP_TIMEZONE 을 .env 에 적으면 바꿀 수 있지만, 적지 않으면 Asia/Seoul 이다.
require_once __DIR__ . '/Env.php';

class AppTime {
    const DEFAULT_ZONE = 'Asia/Seoul';

    private static $zone = null;   // 확인이 끝난 시간대 이름
    private static $applied = false;

    /* 쓰기로 한 시간대 이름. 이름이 틀렸으면 기본값으로 돌아간다 */
    public static function zoneName() {
        if (self::$zone !== null) return self::$zone;
        $name = trim((string)Env::get('APP_TIMEZONE', '')) ?: self::DEFAULT_ZONE;
        try {
            new DateTimeZone($name);
        } catch (Throwable $e) {
            $name = self::DEFAULT_ZONE;
        }
        self::$zone = $name;
        return $name;
    }

    /* PHP 쪽 기본 시간대를 맞춘다. 여러 번 불러도 한 번만 한다 */
    public static function apply() {
        if (self::$applied) return;
        self::$applied = true;
        @date_default_timezone_set(self::zoneName());
    }

    /* DB 세션에 넣을 시차 문자열 (예: '+09:00').
       MariaDB에 시간대 이름표가 올라가 있지 않은 서버가 많아서 이름 대신 시차로 넣는다 */
    public static function dbOffset() {
        $tz = new DateTimeZone(self::zoneName());
        $seconds = $tz->getOffset(new DateTime('now', $tz));
        $sign = $seconds < 0 ? '-' : '+';
        $seconds = abs($seconds);
        return sprintf('%s%02d:%02d', $sign, intdiv($seconds, 3600), intdiv($seconds % 3600, 60));
    }

    /* 우리 시간대 기준 오늘 날짜 (YYYY-MM-DD) */
    public static function today() {
        self::apply();
        return (new DateTime('now', new DateTimeZone(self::zoneName())))->format('Y-m-d');
    }
}
