import { useState } from 'react'
import { api } from '../api/client'
import { BrandLogo } from '../components/icons'
import { passwordError } from '../lib/validators'
import './AuthPage.css'

/* ════════════════════════════════════════════════
   비밀번호 찾기
   token 없음 → 메일 보내기 / token 있음(메일 링크로 들어옴) → 새 비밀번호 정하기
   ════════════════════════════════════════════════ */
export default function PasswordResetPage({ token, onDone }) {
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const sendLink = async (e) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await api.requestPasswordReset(email.trim())
      setMsg(res.message)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const savePassword = async (e) => {
    e.preventDefault()
    const problem = passwordError(pw)
    setError(problem)
    if (problem) return
    setBusy(true)
    try {
      const res = await api.resetPassword(token, pw)
      setMsg(res.message)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const done = msg !== ''

  return (
    <div className="auth-root">
      <div className="auth-blob auth-blob-1" aria-hidden="true" />
      <div className="auth-blob auth-blob-2" aria-hidden="true" />

      <div className="auth-card">
        <div className="auth-brand">
          <BrandLogo height={30} />
        </div>

        <h1 className="auth-heading">비밀번호를 잊으셨나요?</h1>
        <p className="auth-sub">
          {token ? '새로 쓸 비밀번호를 정해주세요' : '가입할 때 쓴 이메일로 링크를 보내드려요'}
        </p>

        {done ? (
          <>
            <div className="auth-msg auth-msg-info" role="status">{msg}</div>
            <button type="button" className="auth-submit" onClick={onDone}>로그인 화면으로</button>
          </>
        ) : token ? (
          <form className="auth-form" onSubmit={savePassword} noValidate>
            <div className="field">
              <label htmlFor="reset-pw">새 비밀번호</label>
              <input id="reset-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)}
                placeholder="영문+숫자 8자 이상" autoComplete="new-password" required minLength={8} />
            </div>
            {error && <div className="auth-msg auth-msg-error" role="alert">{error}</div>}
            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? '바꾸는 중…' : '비밀번호 바꾸기'}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={sendLink} noValidate>
            <div className="field">
              <label htmlFor="reset-email">이메일</label>
              <input id="reset-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com" autoComplete="email" required />
            </div>
            {error && <div className="auth-msg auth-msg-error" role="alert">{error}</div>}
            <button type="submit" className="auth-submit" disabled={busy || !email.trim()}>
              {busy ? '보내는 중…' : '재설정 링크 보내기'}
            </button>
          </form>
        )}

        {!done && (
          <>
            <div className="auth-divider"><span>또는</span></div>
            <button type="button" className="auth-guest" onClick={onDone}>로그인 화면으로 돌아가기</button>
          </>
        )}
      </div>
    </div>
  )
}
