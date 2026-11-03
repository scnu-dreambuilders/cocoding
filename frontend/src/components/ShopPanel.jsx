import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import { CocoAvatar } from './Coco'
import { ITEM_TYPE_LABEL } from '../data/library'
import './Attendance.css'

/* ════════════════════════════════════════════════
   코코 상점 — 출석·학습으로 모은 코인으로 꾸미기 아이템을 산다.
   산 아이템은 바로 위 '코코 꾸미기'에서 입힐 수 있다.
   ════════════════════════════════════════════════ */
const TYPE_ORDER = ['hat', 'glasses', 'accessory', 'background']

const REASON_LABEL = {
  attendance: '출석',
  chapter: '챕터 완료',
  project: '작품 저장',
  shop: '상점에서 구매',
}

export default function ShopPanel({ showToast, onBought, onCoinsChange, equipped }) {
  const [shop, setShop] = useState(null)
  const [buying, setBuying] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const apply = useCallback((next) => {
    setShop(next)
    onCoinsChange?.(next.balance)
  }, [onCoinsChange])

  useEffect(() => {
    let alive = true
    api.shop()
      .then((s) => { if (alive) apply(s) })
      .catch(() => {})
    return () => { alive = false }
  }, [apply])

  const buy = async (item) => {
    if (!window.confirm(`${item.emoji} ${item.item_name}을(를) ${item.price}코인에 살까요?`)) return
    setBuying(item.item_name)
    try {
      const res = await api.buyItem(item.item_name)
      setShop((s) => ({ ...s, balance: res.balance, items: res.items }))
      onCoinsChange?.(res.balance)
      showToast(res.message)
      onBought?.()
    } catch (e) {
      showToast(e.message)
    } finally {
      setBuying('')
    }
  }

  if (!shop) return <div className="skeleton-card attend-skeleton" aria-hidden="true" />

  const byType = TYPE_ORDER.map((type) => [type, shop.items.filter((i) => i.item_type === type)]).filter(([, list]) => list.length)

  return (
    <section className="dash-section shop-section">
      <div className="section-header">
        <h3 className="section-title"><span aria-hidden="true">🛍️</span>코코 상점</h3>
        <span className="coin-badge" aria-label={`내 코인 ${shop.balance}개`}>🪙 {shop.balance}</span>
        <button type="button" className="section-action" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? '내역 닫기' : '코인 내역'}
        </button>
      </div>

      <p className="dash-hint">출석 도장, 챕터 완료, 작품 저장으로 코인을 모아 꾸미기 아이템을 살 수 있어요.</p>

      {showHistory && (
        <ul className="coin-history">
          {shop.history.length === 0 && <li className="coin-history-empty">아직 코인 기록이 없어요.</li>}
          {shop.history.map((h, i) => (
            <li key={i}>
              <span className={h.amount > 0 ? 'coin-plus' : 'coin-minus'}>{h.amount > 0 ? `+${h.amount}` : h.amount}</span>
              <span className="coin-reason">{REASON_LABEL[h.reason] ?? h.reason}{h.reason === 'shop' && h.ref ? ` · ${h.ref}` : ''}</span>
              <span className="coin-date">{String(h.created_at).slice(5, 10)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="shop-wrap">
        <div className="shop-preview">
          <CocoAvatar size={110} emotion="happy" items={equipped} />
          <span>내 코코</span>
        </div>

        <div className="shop-groups">
          {byType.map(([type, list]) => (
            <div key={type} className="shop-group">
              <h4 className="shop-group-title">{ITEM_TYPE_LABEL[type] ?? type}</h4>
              <div className="shop-grid">
                {list.map((item) => {
                  const tooPoor = !item.owned && shop.balance < item.price
                  return (
                    <button key={item.item_name} type="button"
                      className={`shop-item ${item.owned ? 'is-owned' : ''} ${tooPoor ? 'is-locked' : ''}`}
                      onClick={() => buy(item)} disabled={item.owned || tooPoor || buying === item.item_name}
                      title={item.owned ? '이미 가지고 있어요' : tooPoor ? `${item.price - shop.balance}코인 더 모으면 살 수 있어요` : `${item.price}코인`}>
                      <span className="shop-emoji" aria-hidden="true">{item.emoji}</span>
                      <span className="shop-name">{item.item_name}</span>
                      <span className="shop-price">
                        {item.owned ? '보유 중' : buying === item.item_name ? '사는 중…' : `🪙 ${item.price}`}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
