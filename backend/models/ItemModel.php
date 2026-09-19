<?php
// backend/models/ItemModel.php
// 코코 꾸미기 아이템 — 챕터 완료 보상 + 자유 창작 저장 보상
require_once __DIR__ . '/../config/Database.php';

class ItemModel {
    const FREE_SAVE_DAILY_LIMIT = 3; // 자유 창작 저장 보상은 하루 3개까지

    private $db;
    private static $catalog = null;

    public function __construct() {
        $this->db = Database::getInstance();
    }

    public static function catalog() {
        if (self::$catalog === null) {
            self::$catalog = json_decode(file_get_contents(__DIR__ . '/../data/items.json'), true);
        }
        return self::$catalog;
    }

    // 아이템 이름 → ['type' => ..., 'emoji' => ...]
    public static function info($name) {
        return self::catalog()['items'][$name] ?? ['type' => 'accessory', 'emoji' => '🎁'];
    }

    public function findByUser($user_id) {
        $stmt = $this->db->prepare("SELECT id, item_name, item_type, equipped, acquired_at FROM user_items WHERE user_id = ? ORDER BY acquired_at ASC, id ASC");
        $stmt->execute([$user_id]);
        $items = $stmt->fetchAll();
        foreach ($items as &$item) {
            $item['emoji'] = self::info($item['item_name'])['emoji'];
            $item['equipped'] = (int)$item['equipped'];
        }
        return $items;
    }

    public function has($user_id, $item_name) {
        $stmt = $this->db->prepare("SELECT 1 FROM user_items WHERE user_id = ? AND item_name = ? LIMIT 1");
        $stmt->execute([$user_id, $item_name]);
        return (bool)$stmt->fetchColumn();
    }

    // 이미 가진 아이템은 다시 주지 않는다. 새로 지급했으면 true
    public function grant($user_id, $item_name) {
        if ($this->has($user_id, $item_name)) return false;
        $stmt = $this->db->prepare("INSERT INTO user_items (user_id, item_name, item_type) VALUES (?, ?, ?)");
        return $stmt->execute([$user_id, $item_name, self::info($item_name)['type']]);
    }

    // 자유 창작 저장 보상: 아직 없는 아이템 중 랜덤 1개 (하루 제한)
    public function grantRandomFreeReward($user_id) {
        $pool = self::catalog()['free_pool'];
        $placeholders = implode(',', array_fill(0, count($pool), '?'));
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM user_items WHERE user_id = ? AND acquired_at >= CURDATE() AND item_name IN ($placeholders)");
        $stmt->execute(array_merge([$user_id], $pool));
        if ((int)$stmt->fetchColumn() >= self::FREE_SAVE_DAILY_LIMIT) return null;

        $owned = array_column($this->findByUser($user_id), 'item_name');
        $candidates = array_values(array_diff($pool, $owned));
        if (!$candidates) return null;

        $name = $candidates[random_int(0, count($candidates) - 1)];
        $this->grant($user_id, $name);
        return $name;
    }

    // 같은 종류(모자/안경/배경/소품)는 하나만 장착
    public function setEquipped($user_id, $item_id, $equipped) {
        $stmt = $this->db->prepare("SELECT item_type FROM user_items WHERE id = ? AND user_id = ?");
        $stmt->execute([$item_id, $user_id]);
        $type = $stmt->fetchColumn();
        if ($type === false) return false;

        $this->db->beginTransaction();
        if ($equipped) {
            $this->db->prepare("UPDATE user_items SET equipped = 0 WHERE user_id = ? AND item_type = ?")->execute([$user_id, $type]);
        }
        $this->db->prepare("UPDATE user_items SET equipped = ? WHERE id = ? AND user_id = ?")->execute([$equipped ? 1 : 0, $item_id, $user_id]);
        $this->db->commit();
        return true;
    }
}
