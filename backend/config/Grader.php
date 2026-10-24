<?php
// backend/config/Grader.php
// 서버 재채점: 브라우저와 같은 채점기(grader/grade.mjs, frontend에서 빌드)를 Node.js로 실행한다.
// 브라우저가 보낸 점수는 믿지 않는다 → 제출한 코드로 서버가 직접 점수를 낸다.
// 채점기는 블록을 직접 해석할 뿐 학생 코드를 eval하지 않고, 가상 시계로 정해진 시간만 돌린다.
require_once __DIR__ . '/Env.php';

class GraderUnavailableException extends RuntimeException {}

class Grader {
    const TIMEOUT_SECONDS = 20;
    const MEMORY_MB = 256;

    private static function script() {
        return __DIR__ . '/../grader/grade.mjs';
    }

    // 성공하면 ['score' => 0~100, 'passed' => bool]
    public static function grade($chapterNo, $blocksData) {
        if (!is_file(self::script())) throw new GraderUnavailableException('grader/grade.mjs가 없습니다 (npm run build:grader).');
        if (!function_exists('proc_open')) throw new GraderUnavailableException('proc_open을 쓸 수 없는 서버입니다.');

        $node = (string)Env::get('NODE_BIN', '') ?: 'node';
        $cmd = [$node, '--max-old-space-size=' . self::MEMORY_MB, self::script()];
        // 출력은 임시 파일로 받는다 (윈도우 PHP는 proc_open 파이프를 기다리는 stream_select가 안 됨)
        $outFile = tempnam(sys_get_temp_dir(), 'grd');
        $errFile = tempnam(sys_get_temp_dir(), 'grd');
        try {
            $proc = @proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['file', $outFile, 'w'], 2 => ['file', $errFile, 'w']], $pipes);
            if (!is_resource($proc)) throw new GraderUnavailableException("Node.js를 실행할 수 없습니다 ($node).");

            fwrite($pipes[0], json_encode(['chapter' => (int)$chapterNo, 'blocks_data' => $blocksData]));
            fclose($pipes[0]);

            // 시간 안에 안 끝나면 강제로 끝낸다
            $deadline = microtime(true) + self::TIMEOUT_SECONDS;
            while (($status = proc_get_status($proc)) && $status['running']) {
                if (microtime(true) > $deadline) {
                    proc_terminate($proc, 9);
                    proc_close($proc);
                    throw new GraderUnavailableException('채점 시간 초과');
                }
                usleep(20000);
            }
            $code = $status['exitcode'];
            proc_close($proc);
            $out = (string)file_get_contents($outFile);
            $err = (string)file_get_contents($errFile);
        } finally {
            @unlink($outFile);
            @unlink($errFile);
        }

        $result = json_decode($out, true);
        if (!is_array($result) || !isset($result['score'], $result['passed'])) {
            $detail = is_array($result) ? ($result['error'] ?? '') : substr($err, 0, 300);
            throw new GraderUnavailableException("채점기 오류 (exit $code): $detail");
        }
        if (!empty($result['detail'])) error_log('[Grader] ' . $result['detail']);
        return [
            'score' => max(0, min(100, (int)$result['score'])),
            'passed' => $result['passed'] === true,
        ];
    }
}
