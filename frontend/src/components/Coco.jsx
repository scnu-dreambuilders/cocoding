/* ════════════════════════════════════════════════
   AI 캐릭터 '코코' — 외부 AI API 없이 상황별 문구 + CSS 애니메이션
   emotion: normal | happy | thinking | celebrate
   message.type: intro | hint | error | success | encourage
   items: 장착한 꾸미기 아이템 [{ type, emoji }]
   ════════════════════════════════════════════════ */
import './Coco.css'

function Face({ emotion }) {
  const eyes = emotion === 'happy' || emotion === 'celebrate'
    ? <><path d="M36 50q5-6 10 0" /><path d="M58 50q5-6 10 0" /></>
    : emotion === 'thinking'
      ? <><circle cx="41" cy="50" r="4" /><path d="M58 51h10" /></>
      : <><circle cx="41" cy="50" r="4.5" /><circle cx="63" cy="50" r="4.5" /></>
  const mouth = emotion === 'celebrate'
    ? <path d="M44 66q8 10 16 0z" fill="#be123c" stroke="none" />
    : emotion === 'happy'
      ? <path d="M45 65q7 7 14 0" />
      : emotion === 'thinking'
        ? <path d="M47 68q5-3 10 0" />
        : <path d="M47 66q5 4 10 0" />
  return (
    <g stroke="#1e1b4b" strokeWidth="3" strokeLinecap="round" fill="#1e1b4b">
      {eyes}
      <g fill="none">{mouth}</g>
    </g>
  )
}

export function CocoAvatar({ emotion = 'normal', items = [], size = 96 }) {
  // 서버 아이템은 item_type, 그 밖에서는 type으로 넘어온다
  const byType = Object.fromEntries(items.map((i) => [i.item_type ?? i.type, i.emoji]))
  return (
    <div className={`coco-avatar coco-${emotion}`} style={{ width: size, height: size }}>
      {byType.background && <span className="coco-item coco-bg" aria-hidden="true">{byType.background}</span>}
      <svg viewBox="0 0 104 104" width={size} height={size} aria-hidden="true">
        <circle cx="20" cy="30" r="17" fill="#a78bfa" />
        <circle cx="20" cy="30" r="9" fill="#f5d0fe" />
        <circle cx="84" cy="30" r="17" fill="#a78bfa" />
        <circle cx="84" cy="30" r="9" fill="#f5d0fe" />
        <ellipse cx="52" cy="56" rx="36" ry="33" fill="#c4b5fd" />
        <ellipse cx="52" cy="60" rx="24" ry="20" fill="#ede9fe" />
        <ellipse cx="52" cy="58" rx="7" ry="5.5" fill="#4c1d95" />
        <circle cx="31" cy="64" r="5" fill="#f9a8d4" opacity=".6" />
        <circle cx="73" cy="64" r="5" fill="#f9a8d4" opacity=".6" />
        <Face emotion={emotion} />
      </svg>
      {byType.hat && <span className="coco-item coco-hat" aria-hidden="true">{byType.hat}</span>}
      {byType.glasses && <span className="coco-item coco-glasses" aria-hidden="true">{byType.glasses}</span>}
      {byType.accessory && <span className="coco-item coco-acc" aria-hidden="true">{byType.accessory}</span>}
    </div>
  )
}

export default function Coco({ message, emotion, items, onClose, onAvatarClick, actions }) {
  return (
    <div className="coco-dock">
      {message && (
        <div key={message.id} className={`coco-bubble coco-bubble-${message.type}`} role="status" aria-live="polite">
          <button type="button" className="coco-bubble-x" onClick={onClose} aria-label="말풍선 닫기">×</button>
          <p>{message.text}</p>
          {actions?.length > 0 && (
            <div className="coco-actions">
              {actions.map((a) => (
                <button key={a.label} type="button" onClick={a.onClick}>{a.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
      <button type="button" className="coco-btn" onClick={onAvatarClick} title="코코에게 도움 받기" aria-label="코코에게 도움 받기">
        <CocoAvatar emotion={emotion} items={items} size={84} />
      </button>
    </div>
  )
}
