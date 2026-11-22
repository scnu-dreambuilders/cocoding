import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'
import { MockBanner } from '../components/Layout.jsx'

// 학생 앱과 같은 로그인 API 를 쓰되, 토큰은 관리자 웹 전용 키에 따로 저장한다 (App.saveSession)
export default function LoginPage({ mock, notice, tone = 'warn', onLoggedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hints, setHints] = useState([])
  const busyRef = useRef(false)

  // 모의 모드에서만 모의 계정 안내를 불러온다 (운영 빌드에는 이 코드와 계정 글자가 들어가지 않는다)
  useEffect(() => {
    if (import.meta.env.DEV && mock) {
      let alive = true
      import('../api/mock.js').then((m) => { if (alive) setHints(m.MOCK_LOGIN_HINT) })
      return () => { alive = false }
    }
  }, [mock])

  const submit = async (e) => {
    e.preventDefault()
    if (busyRef.current) return
    if (!email.trim() || !password) { setError('이메일과 비밀번호를 모두 적어 주세요.'); return }
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const data = await api.login(email.trim(), password)
      if (!data?.token || !data?.user) throw Object.assign(new Error('로그인 응답을 읽을 수 없어요.'), { kind: 'parse' })
      setPassword('')
      onLoggedIn(data.token, data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return (
    <>
      {mock && <MockBanner />}
      <div className="center-page">
        <div className="card auth-card">
          <div>
            <h1>코코딩 관리자</h1>
            <p className="muted small">운영자 권한이 있는 계정으로 로그인해 주세요.</p>
          </div>
          {notice && <p className={`notice ${tone}`} role="status">{notice}</p>}
          <form onSubmit={submit} noValidate>
            <label className="field">
              이메일
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" disabled={busy} />
            </label>
            <label className="field">
              비밀번호
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" disabled={busy} />
            </label>
            {error && <p className="notice error" role="alert">{error}</p>}
            <button type="submit" className="btn primary" disabled={busy}>{busy ? '로그인하는 중…' : '로그인'}</button>
          </form>
          {import.meta.env.DEV && hints.length > 0 && (
            <div className="notice warn small">
              <p><b>모의 계정</b> (비밀번호는 아무 글자나 · 실제 서버로 보내지 않아요)</p>
              <ul className="reasons">
                {hints.map((h) => (
                  <li key={h.email}>
                    <button type="button" className="link-btn" onClick={() => setEmail(h.email)}>{h.email}</button> — {h.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
