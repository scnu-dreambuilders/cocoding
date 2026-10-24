/* ════════════════════════════════════════════════
   코코에게 물어보기 — Gemini 대화창 (API 키는 서버에만 있음)
   getContext(): { chapter, code } 지금 화면 정보를 질문과 함께 보냄
   onHint(): 기존 상황별 힌트 (AI 없이)
   onEmotion(emotion): 대답을 기다리는 동안 코코 표정 바꾸기
   ════════════════════════════════════════════════ */
import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import './CocoChat.css'

const HISTORY_SENT = 6 // 서버도 직전 6개까지만 사용
const MESSAGE_MAX = 300
const SUGGESTIONS = ['이 블록은 어떻게 써?', '내 코드 어디가 틀렸어?', '뭘 만들어볼까?']

export default function CocoChat({ getContext, onHint, onClose, onEmotion }) {
  const [log, setLog] = useState([
    { role: 'coco', text: '안녕! 궁금한 걸 물어봐. 지금 만들고 있는 코드도 같이 볼게 🙂' },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null) // { enabled, remaining, limit }
  const listRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    api.cocoStatus().then(setStatus).catch(() => setStatus({ enabled: false, remaining: 0 }))
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [log, busy])

  const send = async (text) => {
    const message = text.trim().slice(0, MESSAGE_MAX)
    if (!message || busy) return
    // 첫 인사는 화면용이라 대화 기록으로 보내지 않음
    const history = log.slice(1).slice(-HISTORY_SENT)
    setLog((l) => [...l, { role: 'user', text: message }])
    setInput('')
    setBusy(true)
    onEmotion?.('thinking')
    try {
      const res = await api.askCoco(message, history, getContext?.() ?? {})
      setLog((l) => [...l, { role: 'coco', text: res.reply }])
      setStatus((s) => (s ? { ...s, remaining: res.remaining } : s))
      onEmotion?.('happy')
    } catch (err) {
      setLog((l) => [...l, { role: 'coco', text: err.message, error: true }])
      onEmotion?.('normal')
    } finally {
      setBusy(false)
      inputRef.current?.focus()
    }
  }

  const disabled = status && (!status.enabled || status.remaining <= 0)
  const notice = !status ? '' : !status.enabled
    ? '코코가 아직 대화 준비 중이야. 지금은 힌트만 줄 수 있어!'
    : status.remaining <= 0 ? '오늘은 코코랑 이야기를 많이 했어! 내일 또 물어봐 🌙' : ''

  return (
    <div className="coco-chat" role="dialog" aria-label="코코에게 물어보기">
      <div className="coco-chat-head">
        <strong>코코에게 물어보기</strong>
        {status?.enabled && <span className="coco-chat-left">오늘 {status.remaining}번 남음</span>}
        <button type="button" className="coco-chat-x" onClick={onClose} aria-label="대화창 닫기">×</button>
      </div>

      <div className="coco-chat-log" ref={listRef} aria-live="polite">
        {log.map((m, i) => (
          <p key={i} className={`coco-msg coco-msg-${m.role} ${m.error ? 'is-error' : ''}`}>{m.text}</p>
        ))}
        {busy && <p className="coco-msg coco-msg-coco coco-typing" aria-label="코코가 생각 중">•••</p>}
        {notice && <p className="coco-chat-notice">{notice}</p>}
      </div>

      {!disabled && log.length === 1 && (
        <div className="coco-chat-chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => send(s)} disabled={busy}>{s}</button>
          ))}
        </div>
      )}

      <form className="coco-chat-form" onSubmit={(e) => { e.preventDefault(); send(input) }}>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={MESSAGE_MAX}
          placeholder={disabled ? '' : '코코에게 물어봐!'}
          disabled={busy || disabled}
          aria-label="코코에게 할 말"
        />
        <button type="submit" disabled={busy || disabled || !input.trim()}>보내기</button>
      </form>
      <div className="coco-chat-foot">
        <button type="button" onClick={onHint}>💡 다음 블록 힌트</button>
        <span>이름·학교·전화번호는 적지 마!</span>
      </div>
    </div>
  )
}
