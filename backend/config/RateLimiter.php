<?php
// backend/config/RateLimiter.php
// DB 기반 요청 제한 (고정 창 방식). 예전 파일 방식은 서버 폴더에 쓰기 권한이 없으면
// 조용히 꺼졌기 때문에, 앱이 어차피 쓰는 DB에 기록한다 → 권한 문제로 꺼지지 않음.
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Response.php';
require_once __DIR__ . '/Logger.php';

class RateLimiter {
    private static function hashKey($key) {
        return hash('sha256', $key);
    }

    public static function clientIp() {
        return $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    }

    // 최근 $windowSeconds 동안의 기록 수
    public static function count($key, $windowSeconds) {
        $stmt = Database::getInstance()->prepare("SELECT COUNT(*) FROM rate_limits WHERE key_hash = ? AND attempted_at > ?");
        $stmt->execute([self::hashKey($key), time() - $windowSeconds]);
        return (int)$stmt->fetchColumn();
    }

    public static function tooMany($key, $maxAttempts, $windowSeconds) {
        return self::count($key, $windowSeconds) >= $maxAttempts;
    }

    public static function hit($key) {
        $db = Database::getInstance();
        $db->prepare("INSERT INTO rate_limits (key_hash, attempted_at) VALUES (?, ?)")->execute([self::hashKey($key), time()]);
        // 하루 지난 기록 청소. 개인정보처리방침에 "접속 기록은 24시간 뒤 지운다"고 적혀 있다.
        // 한 시간에 한 번은 반드시 돌게 한다. 표식 파일을 못 쓰는 서버에서는 전처럼 가끔(100번에 한 번) 돈다
        $marker = __DIR__ . '/../data/.rate_purge';
        $last = @filemtime($marker);
        $due = $last === false ? random_int(1, 100) === 1 : time() - $last >= 3600;
        if ($last === false && @touch($marker)) $due = true;
        if ($due) {
            @touch($marker);
            $db->prepare("DELETE FROM rate_limits WHERE attempted_at < ?")->execute([time() - 86400]);
        }
    }

    public static function clear($key) {
        Database::getInstance()->prepare("DELETE FROM rate_limits WHERE key_hash = ?")->execute([self::hashKey($key)]);
    }

    // 같은 키를 다루는 요청이 한 번에 하나씩만 지나가게 한다.
    // '몇 번 했나 세기'와 '한 번 했다고 적기'가 따로라서, 거의 동시에 온 요청 여러 개가
    // 모두 "아직 안 넘었다"고 보고 함께 통과할 수 있었다. DB의 이름 붙은 잠금으로 줄을 세운다.
    // 3초 안에 못 잡으면(앞 요청이 오래 걸리는 드문 경우) 그대로 진행한다. 제한이 서비스를 막아서는 안 된다
    private static function withLock($key, $fn) {
        $db = Database::getInstance();
        $name = 'rl:' . substr(self::hashKey($key), 0, 48);
        $got = false;
        try {
            $stmt = $db->prepare("SELECT GET_LOCK(?, 3)");
            $stmt->execute([$name]);
            $got = (int)$stmt->fetchColumn() === 1;
            $stmt->closeCursor();
        } catch (Throwable $e) {
            // 잠금을 못 쓰는 환경이면 전처럼 동작한다
        }
        try {
            return $fn();
        } finally {
            if ($got) {
                try {
                    $stmt = $db->prepare("SELECT RELEASE_LOCK(?)");
                    $stmt->execute([$name]);
                    $stmt->closeCursor();
                } catch (Throwable $e) {
                }
            }
        }
    }

    // 이 요청이 끝날 때까지 같은 키의 다른 요청을 기다리게 한다 (접속이 끝나면 저절로 풀린다).
    // 로그인처럼 '실패 횟수 확인 → 비밀번호 확인 → 실패 기록'이 떨어져 있는 곳에서,
    // 한꺼번에 보낸 시도들이 모두 "아직 5번 안 됐다"고 보고 통과하는 것을 막는다
    public static function hold($key, $waitSeconds = 5) {
        try {
            $stmt = Database::getInstance()->prepare("SELECT GET_LOCK(?, ?)");
            $stmt->execute(['rh:' . substr(self::hashKey($key), 0, 48), (int)$waitSeconds]);
            $stmt->closeCursor();
        } catch (Throwable $e) {
            // 잠금을 못 쓰는 환경이면 전처럼 동작한다
        }
    }

    // 한도 안이면 한 번 쓴 것으로 적고 true, 이미 다 썼으면 아무것도 적지 않고 false
    public static function take($key, $maxAttempts, $windowSeconds) {
        return self::withLock($key, function () use ($key, $maxAttempts, $windowSeconds) {
            if (self::tooMany($key, $maxAttempts, $windowSeconds)) return false;
            self::hit($key);
            return true;
        });
    }

    // take() 로 적은 한 번을 되돌린다 (일이 실패해서 횟수를 돌려줄 때)
    public static function refund($key) {
        Database::getInstance()->prepare("DELETE FROM rate_limits WHERE key_hash = ? ORDER BY id DESC LIMIT 1")
            ->execute([self::hashKey($key)]);
    }

    // 제한을 넘으면 429로 응답을 끝내고, 아니면 기록한다
    public static function limit($key, $maxAttempts, $windowSeconds, $message = '요청이 너무 많아요. 잠시 후 다시 시도해주세요.') {
        if (!self::take($key, $maxAttempts, $windowSeconds)) {
            header('Retry-After: ' . $windowSeconds);
            // 어떤 제한에 걸렸는지만 남긴다 (키에는 이메일이 들어갈 수 있어 종류만)
            Logger::audit('ratelimit', ['kind' => explode(':', $key)[0] . ':' . (explode(':', $key)[1] ?? '')]);
            Response::error($message, 429);
        }
    }
}
