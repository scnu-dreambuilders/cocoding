import { useEffect, useId, useRef, useState } from 'react'

/* 되돌리기 어려운 작업 앞의 확인 창.
   - 열리면 창 안으로 초점을 옮기고, Tab 은 창 안에서만 돈다. 닫히면 열기 전 초점으로 돌려놓는다
   - typed 를 주면 그 글자를 똑같이 적어야 확인 버튼이 켜진다 (탈퇴 같은 작업)
   - busy 동안은 닫기·중복 확인을 막고, error 는 창 안에 그대로 보여 준다 (입력은 지우지 않음) */
export default function ConfirmDialog({ title, children, confirmLabel = '확인', danger = false, typed, busy = false, error = '', onConfirm, onCancel }) {
  const id = useId()
  const boxRef = useRef(null)
  const [text, setText] = useState('')

  useEffect(() => {
    const before = document.activeElement
    const box = boxRef.current
    const first = box?.querySelector('input, button:not([disabled])')
    first?.focus()
    return () => {
      if (before && typeof before.focus === 'function' && document.contains(before)) before.focus()
    }
  }, [])

  useEffect(() => {
    if (busy) boxRef.current?.focus({ preventScroll: true })
    else if (document.activeElement === boxRef.current) {
      boxRef.current?.querySelector('input:not([disabled]), button:not([disabled])')?.focus()
    }
  }, [busy])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (!busy) onCancel()
      return
    }
    if (e.key !== 'Tab') return
    const items = [...boxRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    if (items.length === 0) { e.preventDefault(); boxRef.current?.focus(); return }
    const firstEl = items[0]
    const lastEl = items[items.length - 1]
    if (document.activeElement === boxRef.current) { e.preventDefault(); (e.shiftKey ? lastEl : firstEl).focus() }
    else if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus() }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus() }
  }

  const matches = typed === undefined || text.trim() === typed
  const submit = (e) => {
    e.preventDefault()
    if (busy || !matches) return
    onConfirm()
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel() }}>
      <form ref={boxRef} tabIndex={-1} className="dialog" role="alertdialog" aria-modal="true" aria-busy={busy} aria-labelledby={`${id}-t`} aria-describedby={`${id}-d`} onKeyDown={onKeyDown} onSubmit={submit}>
        <h2 id={`${id}-t`}>{title}</h2>
        <div id={`${id}-d`} className="small">{children}</div>
        {typed !== undefined && (
          <label className="field">
            확인하려면 <b>{typed}</b> 를 똑같이 적어 주세요
            <input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" disabled={busy} />
          </label>
        )}
        {error && <p className="notice error" role="alert">{error}</p>}
        <div className="btn-row">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>취소</button>
          <button type="submit" className={`btn ${danger ? 'danger solid' : 'primary'}`} disabled={busy || !matches}>
            {busy ? '처리하는 중…' : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  )
}
