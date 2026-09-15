import { useState } from 'react'
import { IconCheck, IconCopy } from './icons'

/* ════════════════════════════════════════════════
   블록 → 코드 변환 패널 (고청해님 제안)
   블록이 바뀔 때마다 JavaScript로 실시간 변환, 읽기 전용
   ════════════════════════════════════════════════ */
const TOKEN_RE = /(\/\/.*$)|('(?:[^'\\]|\\.)*')|\b(let|const|while|for|if|else|true|false)\b|(\b\d+(?:\.\d+)?\b)|([\p{L}_$][\p{L}\p{N}_$]*)(?=\()/gmu
const CLASS = ['tk-comment', 'tk-string', 'tk-keyword', 'tk-number', 'tk-fn']

function highlight(code) {
  const out = []
  let last = 0
  let key = 0
  for (const m of code.matchAll(TOKEN_RE)) {
    if (m.index > last) out.push(code.slice(last, m.index))
    const group = m.slice(1).findIndex((g) => g !== undefined)
    out.push(<span key={key++} className={CLASS[group]}>{m[0]}</span>)
    last = m.index + m[0].length
  }
  out.push(code.slice(last))
  return out
}

export default function CodePanel({ code }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* 클립보드 권한 없음 */ }
  }
  return (
    <div className="code-panel">
      <div className="code-head">
        <span>이 코드가 블록이 하는 일이야! 블록을 바꾸면 코드도 바뀌어요</span>
        <button type="button" className={`btn btn-ghost btn-sm ${copied ? 'btn-copied' : ''}`} onClick={copy} disabled={!code}>
          {copied ? <IconCheck /> : <IconCopy />}
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
      <pre className="code-view">
        {code ? highlight(code) : <span className="code-placeholder">{'// 블록을 조립하면\n// 코드가 여기에 표시됩니다'}</span>}
      </pre>
    </div>
  )
}
