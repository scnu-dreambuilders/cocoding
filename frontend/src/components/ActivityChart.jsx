import { useEffect, useState } from 'react'
import { api } from '../api/client'
import './Profile.css'

/* ════════════════════════════════════════════════
   학습 기록 그래프 + 랭킹
   · 그래프: 최근 14일 출석·챕터·작품 (막대)
   · 랭킹: 등수를 크게 보여주기보다 "또래 평균과 견준 내 위치"를 먼저 보여준다
   (요구사항 SFR-STU-003 29·30번, 기능정의서 STU-029·030)
   ════════════════════════════════════════════════ */
const SCOPES = [
  { id: 'all', label: '전체' },
  { id: 'friends', label: '친구' },
  { id: 'class', label: '우리 반' },
]

/* 막대 색은 CSS 변수(--warn/--ok/--accent)로 — 다크 모드에서도 바탕과 구분되게 */
const BARS = [
  { key: 'attended', label: '출석' },
  { key: 'chapters', label: '챕터 완료' },
  { key: 'projects', label: '작품 저장' },
]

// 2026-03-07 → 3월 7일
const dayLabel = (iso) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ActivityChart() {
  const [activity, setActivity] = useState(null)
  const [scope, setScope] = useState('all')
  const [ranking, setRanking] = useState(null)

  useEffect(() => {
    let alive = true
    api.profile()
      .then((d) => { if (alive) setActivity(d.activity ?? []) })
      .catch(() => { if (alive) setActivity([]) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    api.ranking(scope)
      .then((d) => { if (alive) setRanking(d) })
      .catch((e) => { if (alive) { setRanking({ error: e.message }) } })
    return () => { alive = false }
  }, [scope])

  if (!activity) return <div className="skeleton-card profile-skeleton" aria-hidden="true" />

  // 막대 높이 기준: 하루 최대 활동 수 (최소 2로 둬서 막대가 너무 커 보이지 않게)
  const max = Math.max(2, ...activity.map((d) => d.attended + d.chapters + d.projects))
  const totals = BARS.map((b) => ({ ...b, total: activity.reduce((n, d) => n + d[b.key], 0) }))
  const busyDays = activity.filter((d) => d.attended + d.chapters + d.projects > 0).length
  const today = todayISO()
  const range = activity.length
    ? `${dayLabel(activity[0].date)} ~ ${dayLabel(activity[activity.length - 1].date)}`
    : ''

  return (
    <section className="dash-section">
      <div className="section-header">
        <h3 className="section-title"><span aria-hidden="true">📈</span>내 학습 기록</h3>
        <span className="section-badge">최근 2주</span>
      </div>

      <div className="chart-card">
        <div className="chart-legend">
          {totals.map((b) => (
            <span key={b.key}>
              <i className={`chart-key chart-${b.key}`} aria-hidden="true" />
              {b.label} <b>{b.total}회</b>
            </span>
          ))}
        </div>

        <div className="chart-bars" role="img"
          aria-label={`${range} 학습 기록. ${totals.map((b) => `${b.label} ${b.total}회`).join(', ')}. `
            + `${activity.length}일 중 ${busyDays}일 활동했고, 하루 최대 ${max}회예요.`}>
          {activity.map((d) => {
            const sum = d.attended + d.chapters + d.projects
            return (
              <div key={d.date} className={`chart-col ${d.date === today ? 'is-today' : ''}`}
                title={`${dayLabel(d.date)} · 출석 ${d.attended} · 챕터 ${d.chapters} · 작품 ${d.projects}`}>
                <span className="chart-sum" aria-hidden="true">{sum > 0 ? sum : ''}</span>
                <div className="chart-stack">
                  {BARS.map((b) => (
                    d[b.key] > 0 && (
                      <span key={b.key} className={`chart-seg chart-${b.key}`}
                        style={{ height: `${(d[b.key] / max) * 100}%` }} />
                    )
                  ))}
                </div>
                <small aria-hidden="true">{Number(d.date.slice(8, 10))}</small>
              </div>
            )
          })}
        </div>

        <p className="chart-axis">
          <span>{range}</span>
          <span>{busyDays === 0 ? '아직 기록이 없어요' : `활동한 날 ${busyDays}일 · 하루 최대 ${max}회`}</span>
        </p>
      </div>

      {/* 랭킹 */}
      <div className="rank-card">
        <div className="rank-head">
          <h4>학습 랭킹</h4>
          <div className="rank-scopes" role="tablist">
            {SCOPES.map((s) => (
              <button key={s.id} type="button" role="tab" aria-selected={scope === s.id}
                className={scope === s.id ? 'on' : ''} onClick={() => setScope(s.id)}>{s.label}</button>
            ))}
          </div>
        </div>

        {!ranking ? (
          <p className="dash-hint">불러오는 중…</p>
        ) : ranking.error ? (
          <p className="dash-hint">{ranking.error}</p>
        ) : ranking.total === 0 ? (
          <p className="dash-hint">아직 견줄 친구가 없어요. 친구를 팔로우하거나 반에 들어가면 보여요.</p>
        ) : (
          <>
            <p className="rank-summary">
              {ranking.myRank
                ? <>{ranking.total}명 중 <b>{ranking.myRank}위</b>예요. </>
                : <>아직 순위에 들지 않았어요. </>}
              {ranking.comparedToAverage >= 0
                ? <>또래 평균보다 경험치를 <b>{ranking.comparedToAverage}</b> 더 모았어요 👍</>
                : <>평균까지 경험치 <b>{-ranking.comparedToAverage}</b> 남았어요. 오늘 한 챕터 어때요?</>}
            </p>
            <ol className="rank-list">
              {ranking.top.map((t) => (
                <li key={t.id} className={t.isMe ? 'is-me' : ''}>
                  <span className="rank-no">{t.rank}</span>
                  <span className="rank-name">{t.username}{t.isMe && ' (나)'}</span>
                  <span className="rank-lv">Lv.{t.level}</span>
                  <span className="rank-xp">{t.xp} XP</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  )
}
