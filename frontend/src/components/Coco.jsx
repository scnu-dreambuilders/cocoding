/* ════════════════════════════════════════════════
   AI 캐릭터 '코코'(하늘다람쥐) — 상황별 문구(말풍선) + CSS 애니메이션
   자유 대화는 panel로 받은 CocoChat(Gemini, 서버 호출)이 담당
   emotion: normal | happy | thinking | celebrate
   message.type: intro | hint | error | success | encourage
   items: 장착한 꾸미기 아이템 [{ type, emoji }]
   panel: 말풍선 대신 띄울 대화창 (열려 있으면 말풍선은 숨김)
   ════════════════════════════════════════════════ */
import './Coco.css'
import { COCO_IMG } from '../lib/coco'

const SMILE = new Set(['happy', 'celebrate'])
// 48px 이하에서는 전신이 뭉개지므로 얼굴만 잘라낸 그림을 둥근 하늘색 바탕에 올린다
const FACE_MAX = 48

export function CocoAvatar({ emotion = 'normal', items = [], size = 96 }) {
  // 서버 아이템은 item_type, 그 밖에서는 type으로 넘어온다
  const byType = Object.fromEntries(items.map((i) => [i.item_type ?? i.type, i.emoji]))
  const face = size <= FACE_MAX
  const smile = SMILE.has(emotion)
  const src = face ? (smile ? COCO_IMG.faceSmile : COCO_IMG.faceCalm) : (smile ? COCO_IMG.smile : COCO_IMG.calm)
  return (
    <div className={`coco-avatar coco-${emotion} ${face ? 'is-face' : 'is-full'}`} style={{ width: size, height: size }}>
      {byType.background && <span className="coco-item coco-bg" aria-hidden="true">{byType.background}</span>}
      <img className="coco-img" src={src} alt="" width={size} height={size} draggable="false" />
      {byType.hat && <span className="coco-item coco-hat" aria-hidden="true">{byType.hat}</span>}
      {byType.glasses && <span className="coco-item coco-glasses" aria-hidden="true">{byType.glasses}</span>}
      {byType.accessory && <span className="coco-item coco-acc" aria-hidden="true">{byType.accessory}</span>}
    </div>
  )
}

export default function Coco({ message, emotion, items, onClose, onAvatarClick, actions, panel }) {
  return (
    <div className="coco-dock">
      {panel}
      {!panel && message && (
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
      <button type="button" className="coco-btn" onClick={onAvatarClick} title="코코에게 도움 받기" aria-label="코코에게 도움 받기" aria-expanded={panel ? true : undefined}>
        <CocoAvatar emotion={emotion} items={items} size={84} />
      </button>
    </div>
  )
}
