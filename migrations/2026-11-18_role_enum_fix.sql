-- 2026-11-18 role 컬럼 값 목록 바로잡기
--
-- 아주 예전 DB는 role이 ENUM('student','admin')으로 만들어져 있었다.
-- 2026-09-18 업그레이드는 "컬럼이 없으면 추가"만 했기 때문에 이 DB들은
-- 옛 정의를 그대로 들고 있었고, 선생님·보호자 가입이
-- "Data truncated for column 'role'" 오류로 실패했다.
--
-- 서버가 첫 접속 때 자동으로 적용하므로 보통은 실행할 필요가 없다.
-- 여러 번 실행해도 안전하다.

-- 좁히기 전에 잠깐 admin도 허용해야 아래 UPDATE가 통과한다
ALTER TABLE users MODIFY role ENUM('student', 'teacher', 'guardian', 'admin') NOT NULL DEFAULT 'student';

-- 옛 admin 계정은 지우지 않고 권한이 가장 가까운 선생님으로 옮긴다
UPDATE users SET role = 'teacher' WHERE role = 'admin';

ALTER TABLE users MODIFY role ENUM('student', 'teacher', 'guardian') NOT NULL DEFAULT 'student';
