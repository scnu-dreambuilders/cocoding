import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { api } from '../api/client.js'
import { ErrorState } from '../components/ui.jsx'
import { num, roleText, shortDay } from '../lib/format.js'
import { FALLBACK_TZ, buildWeek } from '../lib/dates.js'

function Stat({ label, value, note, attention, href }) {
  const body = (
    <>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{num(value)}</span>
      {note && <span className="stat-note">{note}</span>}
    </>
  )
  const cls = `stat${attention ? ' attention' : ''}`
  return href ? <a className={cls} href={href} style={{ textDecoration: 'none' }}>{body}</a> : <div className={cls}>{body}</div>
}

// week = buildWeek(...) 결과. 불러올 때 한 번 계산해 둔다 (그리는 동안 시계를 읽지 않게)
function SignupChart({ week }) {
  const data = week.days
  const max = Math.max(1, ...data.map((d) => d.count))
  const W = 560, H = 180, padB = 26, padT = 18, gap = 14
  const bw = (W - gap * (data.length + 1)) / data.length
  return (
    <figure style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`최근 7일 가입자: ${data.map((d) => `${shortDay(d.day)} ${d.count}명`).join(', ')}`}>
        <line x1="0" x2={W} y1={H - padB} y2={H - padB} stroke="var(--border)" />
        {data.map((d, i) => {
          const h = ((H - padB - padT) * d.count) / max
          const x = gap + i * (bw + gap)
          return (
            <g key={d.day}>
              <rect x={x} y={H - padB - h} width={bw} height={Math.max(h, d.count ? 2 : 0)} rx="4" fill="var(--accent)" />
              <text x={x + bw / 2} y={H - padB - h - 5} textAnchor="middle" fontSize="12" fill="var(--text-h)">{d.count}</text>
              <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="var(--text-muted)">{shortDay(d.day)}</text>
            </g>
          )
        })}
      </svg>
      <figcaption className="small muted">
        {week.basis === 'server'
          ? `서버가 알려 준 오늘(${week.today})까지 7일이에요.`
          : `서버 기준 날짜를 받지 못해 서울 시간(${FALLBACK_TZ}) 기준 오늘(${week.today})까지 7일로 보여요. 서버 시간대와 다르면 하루 어긋날 수 있어요.`}
        {' '}가입자가 없는 날은 0이에요.
        {week.skipped > 0 && ` 이 범위 밖이거나 날짜를 읽을 수 없는 ${week.skipped}줄은 그리지 않았어요.`}
      </figcaption>
    </figure>
  )
}

export default function DashboardPage({ onForbidden }) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const seq = useRef(0)

  const load = useCallback(async () => {
    const my = ++seq.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await api.stats()
      // 서버 기준 날짜 필드(today)는 백엔드에 요청 중 — 없으면 Asia/Seoul 로 대신한다
      if (my === seq.current) setState({ loading: false, data, week: buildWeek(data?.signups7d, data?.today), error: null })
    } catch (error) {
      if (my !== seq.current) return
      setState((s) => ({ ...s, loading: false, error }))
      if (error.kind === 'forbidden') onForbidden()
    }
  }, [onForbidden])

  useEffect(() => {
    load()
    return () => { seq.current += 1 }
  }, [load])

  const { loading, data, week, error } = state
  const u = data?.users
  const m = data?.moderation

  return (
    <>
      <div className="page-head">
        <div>
          <h1>대시보드</h1>
          <p>숫자만 모아 보여 줘요. 누가 했는지는 이 화면에 나오지 않아요.</p>
        </div>
        <button type="button" className="btn" onClick={load} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" /> {loading ? '불러오는 중…' : '새로고침'}
        </button>
      </div>

      <ErrorState error={error} onRetry={load} />
      {!data && loading && <div className="skeleton" aria-label="불러오는 중" />}

      {data && (
        <>
          <section className="card" aria-labelledby="d-mod">
            <h2 id="d-mod">신고·숨김</h2>
            <p className="small muted" style={{ marginBottom: 10 }}>세 숫자는 세는 대상이 달라서 서로 더하지 않아요.</p>
            <div className="stat-grid">
              <Stat label="신고가 있는 게시글" value={m?.openPostReports} note="아직 숨기지 않은 글 중 신고가 1건 이상" attention={m?.openPostReports > 0} href="#/moderation?target=post" />
              <Stat label="숨긴 게시글" value={m?.hiddenPosts} href="#/moderation?target=post" />
              <Stat label="숨긴 작품" value={m?.hiddenProjects} href="#/moderation?target=project" />
            </div>
          </section>

          <section className="card" aria-labelledby="d-users">
            <h2 id="d-users">회원</h2>
            <div className="stat-grid">
              <Stat label="전체 회원" value={u?.total} note={Object.entries(u?.byRole ?? {}).map(([r, n]) => `${roleText(r)} ${num(n)}`).join(' · ')} />
              <Stat label="오늘 가입" value={u?.newToday} />
              <Stat label="최근 7일 코인 활동 계정" value={u?.activeWeek} note="7일 안에 코인 기록이 생긴 계정 수 (학생만이 아닌 모든 계정, 방문자 수 아님)" />
              <Stat label="보호자 동의 대기" value={u?.consentPending} attention={u?.consentPending > 0} href="#/users?state=pending" />
              <Stat label="정지된 계정" value={u?.suspended} href="#/users?state=suspended" />
              <Stat label="운영자" value={u?.admins} href="#/users?state=admin" />
            </div>
          </section>

          <div className="grid-2">
            <section className="card" aria-labelledby="d-sign">
              <h2 id="d-sign">최근 7일 가입자</h2>
              {week && <SignupChart week={week} />}
            </section>
            <section className="card" aria-labelledby="d-learn">
              <h2 id="d-learn">학습·게시판·코인</h2>
              <dl className="kv">
                <dt>완료한 챕터</dt><dd className="num">{num(data.learning?.chaptersDone)}건</dd>
                <dt>작품</dt><dd className="num">{num(data.learning?.projects)}개 (공개 {num(data.learning?.publicProjects)})</dd>
                <dt>게시글</dt><dd className="num">{num(data.board?.posts)}개 (질문 포함)</dd>
                <dt>질문</dt><dd className="num">{num(data.board?.questions)}개 · 해결 {num(data.board?.solved)}</dd>
                <dt>댓글</dt><dd className="num">{num(data.board?.comments)}개</dd>
                <dt>준 코인</dt><dd className="num">{num(data.coins?.granted)}</dd>
                <dt>쓴 코인</dt><dd className="num">{num(data.coins?.spent)}</dd>
                <dt>지금 가진 코인 합</dt><dd className="num">{num(data.coins?.held)}</dd>
              </dl>
            </section>
          </div>
        </>
      )}
    </>
  )
}
