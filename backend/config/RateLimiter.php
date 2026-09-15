<?php
// backend/config/RateLimiter.php
// Simple file-based fixed-window rate limiter — no external cache needed
// for this project's scale. Guards endpoints like login against brute force.
class RateLimiter {
    private static function storePath() {
        return __DIR__ . '/../data/.rate_limit.json';
    }

    // Records an attempt for $key and returns whether it's still within the
    // allowance ($maxAttempts per $decaySeconds). Fails open on disk errors
    // so infra issues can't lock everyone out of login.
    public static function attempt($key, $maxAttempts, $decaySeconds) {
        $fp = @fopen(self::storePath(), 'c+');
        if (!$fp) return true;

        flock($fp, LOCK_EX);
        $store = json_decode(stream_get_contents($fp), true) ?: [];

        $now = time();
        $hashedKey = hash('sha256', $key);
        $attempts = array_values(array_filter(
            $store[$hashedKey] ?? [],
            fn($t) => $t > $now - $decaySeconds
        ));

        $allowed = count($attempts) < $maxAttempts;
        if ($allowed) {
            $attempts[] = $now;
        }
        $store[$hashedKey] = $attempts;

        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($store));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);

        return $allowed;
    }
}
