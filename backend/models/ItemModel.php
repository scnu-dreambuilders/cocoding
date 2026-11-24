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
        // 보상이 없는 챕터(관리자 화면에서 보상을 비운 경우)는 줄 것이 없다
        if ($item_name === null || $item_name === '') return false;
        if ($this->has($user_id, $item_name)) return false;
        // 위 확인과 아래 넣기 사이에 같은 요청이 끼어들 수 있다. 그때는 유니크 키(uniq_user_item)가
        // 두 번째를 막고, 여기서는 '이미 가진 것'으로 본다
        $stmt = $this->db->prepare("INSERT IGNORE INTO user_items (user_id, item_name, item_type) VALUES (?, ?, ?)");
        $stmt->execute([$user_id, $item_name, self::info($item_name)['type']]);
        return $stmt->rowCount() > 0;
    }

    // 자유 창작 저장 보상: 아직 없는 아이템 중 랜덤 1개 (하루 제한)
    public function grantRandomFreeReward($user_id) {
        $pool = self::catalog()['free_pool'] ?? [];
        // 관리자 화면에서 보상 목록을 비워 두면 줄 것이 없다. 그대로 두면 IN () 문법 오류로 작품 저장이 실패한다
        if (!$pool) return null;
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

    // 상점 목록: 코인으로 살 수 있는 아이템 + 내가 가졌는지
    public function shopCatalog($user_id) {
        $owned = array_column($this->findByUser($user_id), 'item_name');
        $list = [];
        foreach (self::catalog()['items'] as $name => $info) {
            if (!isset($info['price'])) continue; // 챕터 보상 전용은 상점에 없음
            $list[] = [
                'item_name' => $name,
                'item_type' => $info['type'],
                'emoji' => $info['emoji'],
                'price' => (int)$info['price'],
                'owned' => in_array($name, $owned, true),
            ];
        }
        usort($list, function ($a, $b) {
            return [$a['item_type'], $a['price']] <=> [$b['item_type'], $b['price']];
        });
        return $list;
    }

    public static function price($name) {
        $info = self::catalog()['items'][$name] ?? null;
        return isset($info['price']) ? (int)$info['price'] : null;
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
