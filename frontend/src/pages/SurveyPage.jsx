import { useState } from 'react'
import { api } from '../api/client'
import { INTERESTS, LEVELS } from '../data/library'
import { CocoAvatar } from '../components/Coco'
import './SurveyPage.css'

/* ════════════════════════════════════════════════
   관심사 설문 — 카드 탭으로 복수 선택 + 코딩 수준(1/2/3)
   tags는 추천 주제, level은 자유 창작 팔레트 블록 수를 결정
   ════════════════════════════════════════════════ */
export default function SurveyPage({ user, editing = false, onDone, onSkip }) {
  const [tags, setTags] = useState(() => new Set(Array.isArray(user?.tags) ? user.tags : []))
  const [level, setLevel] = useState(Number(user?.level) || 1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggle = (tag) => setTags((prev) => {
    const next = new Set(prev)
    if (next.has(tag)) next.delete(tag)
    else if (next.size < 10) next.add(tag)
    return next
  })

  const save = async (skip = false) => {
    setSaving(true)
    setError('')
    try {
      // 건너뛰기도 빈 배열로 저장해서 다시 묻지 않음 (대시보드에서 언제든 수정 가능)
      const updated = await api.updateSurvey(level, skip ? [] : [...tags])
      ;(skip ? onSkip : onDone)(updated)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="survey-root">
      <div className="survey-card">
        <div className="survey-coco">
          <CocoAvatar emotion="happy" size={72} />
          <div className="survey-bubble">
            {editing ? '관심사를 바꾸면 추천 주제도 바뀌어!' : `반가워 ${user?.username ?? ''}! 나는 코코야. 너는 어떤 걸 좋아해?`}
          </div>
        </div>

        <h1 className="survey-title">어떤 걸 좋아해? <small>(여러 개 골라도 돼요)</small></h1>
        <div className="interest-grid" role="group" aria-label="관심사">
          {INTERESTS.map((it) => {
            const on = tags.has(it.tag)
            return (
              <button key={it.tag} type="button" aria-pressed={on} className={`interest-card ${on ? 'on' : ''}`}
                onClick={() => toggle(it.tag)}>
                <span className="interest-emoji" aria-hidden="true">{it.emoji}</span>
                <span>{it.tag}</span>
                {on && <span className="interest-check" aria-hidden="true">✓</span>}
              </button>
            )
          })}
        </div>

        <h2 className="survey-sub">코딩은 얼마나 해봤어?</h2>
        <div className="level-row" role="radiogroup" aria-label="코딩 경험">
          {LEVELS.map((l) => (
            <button key={l.level} type="button" role="radio" aria-checked={level === l.level}
              className={`level-card ${level === l.level ? 'on' : ''}`} onClick={() => setLevel(l.level)}>
              <span className="level-emoji" aria-hidden="true">{l.emoji}</span>
              <b>{l.label}</b>
              <small>{l.desc}</small>
            </button>
          ))}
        </div>
        <p className="survey-note">고른 수준에 따라 자유 창작에서 보이는 블록 수가 달라져요. 처음이면 꼭 필요한 블록만 보여줄게요!</p>

        {error && <p className="survey-error" role="alert">{error}</p>}
        <div className="survey-actions">
          {!editing && (
            <button type="button" className="survey-skip" onClick={() => save(true)} disabled={saving}>나중에 하기</button>
          )}
          {editing && (
            <button type="button" className="survey-skip" onClick={() => onSkip(null)} disabled={saving}>취소</button>
          )}
          <button type="button" className="survey-go" onClick={() => save(false)} disabled={saving || tags.size === 0}>
            {saving ? '저장 중…' : editing ? '저장하기' : `시작하기 (${tags.size}개 선택)`}
          </button>
        </div>
      </div>
    </div>
  )
}
