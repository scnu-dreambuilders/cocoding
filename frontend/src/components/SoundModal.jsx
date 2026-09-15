import { useEffect, useRef, useState } from 'react'
import { BUILTIN_SOUNDS } from '../blockly/blocks'
import { playSound, startRecording } from '../lib/sounds'
import { newId } from '../lib/project'

/* ════════════════════════════════════════════════
   소리 준비 — 마이크 녹음(MediaRecorder) + 기본 효과음
   녹음한 소리는 '소리 재생하기' 블록의 드롭다운에 나타난다
   ════════════════════════════════════════════════ */
const MAX_MS = 5000
const MAX_SOUNDS = 10

export default function SoundModal({ sounds, onChange, onClose }) {
  const [state, setState] = useState('idle') // idle | recording
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const recRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => () => {
    recRef.current?.cancel()
    clearInterval(timerRef.current)
  }, [])

  const start = async () => {
    setError('')
    if (sounds.length >= MAX_SOUNDS) {
      setError(`소리는 ${MAX_SOUNDS}개까지 만들 수 있어요`)
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('이 브라우저에서는 녹음을 할 수 없어요')
      return
    }
    try {
      const t0 = Date.now()
      recRef.current = await startRecording({
        maxMs: MAX_MS,
        onStop: (data) => {
          clearInterval(timerRef.current)
          setState('idle')
          recRef.current = null
          onChange([...sounds, { id: newId('snd'), name: `내 소리 ${sounds.length + 1}`, data }])
        },
      })
      setState('recording')
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(Date.now() - t0), 100)
    } catch {
      setError('마이크를 사용할 수 없어요. 브라우저에서 마이크 권한을 허용해주세요.')
    }
  }

  const rename = (id, name) => onChange(sounds.map((s) => (s.id === id ? { ...s, name: name.slice(0, 12) } : s)))
  const remove = (id) => onChange(sounds.filter((s) => s.id !== id))

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="소리 준비">
      <div className="modal sound-modal">
        <div className="modal-head">
          <h3>🎤 소리 준비</h3>
          <button type="button" className="modal-x" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <section className="sound-rec">
          {state === 'recording' ? (
            <>
              <div className="rec-dot" aria-hidden="true" />
              <div className="rec-time">{(elapsed / 1000).toFixed(1)}초 / {MAX_MS / 1000}초</div>
              <div className="rec-bar"><span style={{ width: `${Math.min(100, (elapsed / MAX_MS) * 100)}%` }} /></div>
              <button type="button" className="btn btn-run" onClick={() => recRef.current?.stop()}>■ 녹음 끝내기</button>
            </>
          ) : (
            <>
              <p>내 목소리나 주변 소리를 녹음해서 블록으로 재생할 수 있어요 (최대 5초)</p>
              <button type="button" className="btn btn-run" onClick={start}>● 녹음 시작</button>
            </>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
        </section>

        <section>
          <h4 className="sound-h">내가 녹음한 소리</h4>
          {sounds.length === 0 ? (
            <p className="muted">아직 녹음한 소리가 없어요</p>
          ) : (
            <ul className="sound-list">
              {sounds.map((s) => (
                <li key={s.id}>
                  <button type="button" className="btn btn-ghost" onClick={() => playSound(s.id, sounds)} aria-label={`${s.name} 재생`}>▶</button>
                  <input value={s.name} onChange={(e) => rename(s.id, e.target.value)} aria-label="소리 이름" />
                  <button type="button" className="btn btn-ghost" onClick={() => remove(s.id)} aria-label={`${s.name} 삭제`}>🗑️</button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4 className="sound-h">기본 효과음 (눌러서 들어보기)</h4>
          <div className="sfx-grid">
            {BUILTIN_SOUNDS.map(([name, id]) => (
              <button key={id} type="button" className="sfx-btn" onClick={() => playSound(id)}>🔔 {name}</button>
            ))}
          </div>
        </section>

        <div className="modal-foot">
          <span className="muted">'소리' 칸의 <b>소리 재생하기</b> 블록에서 골라 쓸 수 있어요</span>
          <button type="button" className="btn btn-run" onClick={onClose}>완료</button>
        </div>
      </div>
    </div>
  )
}
