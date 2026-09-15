<?php
// backend/models/UserModel.php
require_once __DIR__ . '/../config/Database.php';

class UserModel {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    // tags: NULL이면 설문 전(null), 건너뛰었으면 빈 배열
    public function findById($id) {
        $stmt = $this->db->prepare("SELECT id, username, email, level, tags, created_at FROM users WHERE id = ?");
        $stmt->execute([$id]);
        $user = $stmt->fetch();
        if ($user) {
            $user['id'] = (int)$user['id'];
            $user['level'] = (int)$user['level'];
            $user['tags'] = $user['tags'] === null ? null : (json_decode($user['tags'], true) ?? []);
        }
        return $user;
    }

    public function findByEmail($email) {
        $stmt = $this->db->prepare("SELECT * FROM users WHERE email = ?");
        $stmt->execute([$email]);
        return $stmt->fetch();
    }

    public function findByUsername($username) {
        $stmt = $this->db->prepare("SELECT id FROM users WHERE username = ?");
        $stmt->execute([$username]);
        return $stmt->fetch();
    }

    public function create($username, $email, $password) {
        $hash = password_hash($password, PASSWORD_BCRYPT);
        $stmt = $this->db->prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)");
        $stmt->execute([$username, $email, $hash]);
        return (int)$this->db->lastInsertId();
    }

    public function updateSurvey($id, $level, $tags) {
        $stmt = $this->db->prepare("UPDATE users SET level = ?, tags = ? WHERE id = ?");
        return $stmt->execute([$level, json_encode(array_values($tags), JSON_UNESCAPED_UNICODE), $id]);
    }
}
