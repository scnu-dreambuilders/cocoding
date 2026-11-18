import { useCallback, useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { api } from '../api/client'
import './Attendance.css'

/* ════════════════════════════════════════════════
   오늘의 출석 — 하루 한 번 도장을 찍으면 코인을 받는다.
   연속으로 올수록 보너스가 붙어서 매일 들어올 이유를 만든다.
   ════════════════════════════════════════════════ */
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function AttendanceCard({ showToast, onCoinsChange }) {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('') // 조회 실패 문구
  const [loadKey, setLoadKey] = useState(0)      // 다시 시도 (조회만 — 출석 도장은 다시 찍지 않는다)
  const seq = useRef(0)                          // 요청 번호 — 출석 뒤에 늦게 온 이전 조회 응답이 결과를 덮지 않게

  const apply = useCallback((next) => {
    setState(next)
    onCoinsChange?.(next.balance)
  }, [onCoinsChange])

  useEffect(() => {
    const id = ++seq.current
    api.attendance()
      .then((s) => { if (id === seq.current) apply(s) })
      .catch((e) => { if (id === seq.current) setLoadError(e.message) })
    return () => { seq.current += 1 }
  }, [apply, loadKey])

  const retryLoad = () => {
    setLoadError('')
    setLoadKey((k) => k + 1)
  }

  const check = async () => {
    seq.current += 1 // 진행 중인 조회가 있으면 그 응답은 버린다 (출석 응답이 최신)
    setBusy(true)
    try {
      const res = await api.checkIn()
      apply(res)
      showToast(res.message)
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!state) {
    if (!loadError) return <div className="skeleton-card attend-skeleton" aria-hidden="true" />
    return (
      <section className="dash-section attend-section">
        <div className="section-header">
          <h3 className="section-title">오늘의 출석</h3>
        </div>
        <div className="empty-msg" role="alert">
          출석 정보를 불러오지 못했어요: {loadError}{' '}
          <button type="button" className="link-btn" onClick={retryLoad}>다시 시도</button>
        </div>
      </section>
    )
  }

  // 이번 달 달력: 1일이 무슨 요일인지 맞춰서 앞을 비워둔다
  const now = new Date()
  const firstWeekday = new Date(now.getFullYear(), now.getMonth(), 1).getDay()
  const attended = new Set(state.monthDays)
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: state.daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <section className="dash-section attend-section">
      <div className="section-header">
        <h3 className="section-title">오늘의 출석</h3>
        <span className="section-badge">{now.getMonth() + 1}월에 {state.monthDays.length}일 출석</span>
      </div>

      <div className="attend-card">
        <div className="attend-left">
          <div className="attend-streak">
            <b>{state.streak}</b>
            <span>일 연속</span>
          </div>
          <p className="attend-note">
            {state.checkedToday
              ? `오늘 ${state.todayReward}코인 받았어! 내일 오면 더 많이 받아.`
              : '도장을 찍고 코인을 받아보자. 연속으로 올수록 많이 줘!'}
          </p>
          <button type="button" className="attend-btn" onClick={check} disabled={busy || state.checkedToday}>
            {state.checkedToday ? '오늘 출석 완료' : busy ? '도장 찍는 중…' : '출석 도장 찍기'}
          </button>
          <div className="attend-total">지금까지 {state.totalDays}일 출석</div>
        </div>

        <div className="attend-calendar" role="group" aria-label={`${now.getMonth() + 1}월 출석 달력`}>
          {WEEKDAYS.map((w) => <span key={w} className="attend-weekday">{w}</span>)}
          {cells.map((day, i) => {
            if (day === null) return <span key={`blank-${i}`} className="attend-day is-blank" aria-hidden="true" />
            const done = attended.has(day)
            const isToday = day === state.today
            return (
              <span key={day} className={`attend-day ${done ? 'is-done' : ''} ${isToday ? 'is-today' : ''}`}
                aria-label={`${day}일 ${done ? '출석' : '미출석'}`}>
                {done ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : day}
              </span>
            )
          })}
        </div>
      </div>
    </section>
  )
}
