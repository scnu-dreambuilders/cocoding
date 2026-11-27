<?php
// backend/config/Grader.php
// 서버 재채점: 브라우저와 같은 채점기(grader/grade.mjs, frontend에서 빌드)를 Node.js로 실행한다.
// 브라우저가 보낸 점수는 믿지 않는다 → 제출한 코드로 서버가 직접 점수를 낸다.
// 채점기는 블록을 직접 해석할 뿐 학생 코드를 eval하지 않고, 가상 시계로 정해진 시간만 돌린다.
require_once __DIR__ . '/Env.php';
require_once __DIR__ . '/Database.php';

class GraderUnavailableException extends RuntimeException {}
// 채점 자리가 없을 때. getCode() 가 429 면 같은 학생의 앞 제출이 아직 채점 중, 503 이면 사이트 전체가 밀린 것
class GraderBusyException extends RuntimeException {}

class Grader {
    const TIMEOUT_SECONDS = 20;
    const MEMORY_MB = 256;

    private static function script() {
        return __DIR__ . '/../grader/grade.mjs';
    }

    /* 채점 자리 잡기
       채점 한 번은 Node 프로세스 하나(메모리 최대 256MB, 길게는 20초)를 띄운다. 제출을 한꺼번에
       수십 개 보내면 그만큼 프로세스가 떠서 서버가 멈춘다. 그래서
         · 한 학생은 한 번에 하나만 채점한다 (앞 제출이 끝나야 다음 것을 받는다)
         · 사이트 전체로도 동시에 도는 채점기를 MAX_PARALLEL 개로 묶는다. 자리가 없으면 잠깐 기다린다
       잠금은 DB 접속에 묶여 있어서, 요청이 중간에 죽어도 접속이 끊기면 저절로 풀린다 */
    const MAX_PARALLEL = 6;
    const SLOT_WAIT_SECONDS = 10;

    private static function lock($name, $timeout) {
        $stmt = Database::getInstance()->prepare("SELECT GET_LOCK(?, ?)");
        $stmt->execute([$name, $timeout]);
        $got = (int)$stmt->fetchColumn() === 1;
        $stmt->closeCursor();
        return $got;
    }

    private static function unlock($name) {
        $stmt = Database::getInstance()->prepare("SELECT RELEASE_LOCK(?)");
        $stmt->execute([$name]);
        $stmt->closeCursor();
    }

    // 잡은 잠금 이름들을 돌려준다. 못 잡으면 GraderBusyException
    public static function acquire($userId) {
        $mine = 'grade:user:' . (int)$userId;
        if (!self::lock($mine, 0)) {
            throw new GraderBusyException('앞 제출 채점 중', 429);
        }
        $deadline = microtime(true) + self::SLOT_WAIT_SECONDS;
        do {
            for ($i = 0; $i < self::MAX_PARALLEL; $i++) {
                if (self::lock("grade:slot:$i", 0)) return [$mine, "grade:slot:$i"];
            }
            usleep(200000);
        } while (microtime(true) < $deadline);
        self::unlock($mine);
        throw new GraderBusyException('채점 자리 없음', 503);
    }

    public static function release($locks) {
        foreach ((array)$locks as $name) {
            try { self::unlock($name); } catch (Throwable $e) { }
        }
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
        // 입력도 임시 파일로 넘긴다. 파이프에 쓰면 node 가 입력을 읽지 않고 멈춰 있을 때 쓰기에서 기다리게 되고,
        // 그 기다림은 아래 제한 시간보다 앞이라 요청이 끝나지 않는다 (작품은 4MB까지라 파이프 버퍼를 넘는다)
        $inFile = tempnam(sys_get_temp_dir(), 'grd');
        try {
            file_put_contents($inFile, json_encode(['chapter' => (int)$chapterNo, 'blocks_data' => $blocksData]));
            $proc = @proc_open($cmd, [0 => ['file', $inFile, 'r'], 1 => ['file', $outFile, 'w'], 2 => ['file', $errFile, 'w']], $pipes);
            if (!is_resource($proc)) throw new GraderUnavailableException("Node.js를 실행할 수 없습니다 ($node).");

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
            @unlink($inFile);
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
