import { useState } from 'react'
import { api } from '../api/client'
import { BrandIcon } from '../components/icons'
import { ROLES, birthYearOptions, needsGuardianConsent, passwordError, usernameError } from '../lib/validators'
import heroImg from '../assets/hero.png'
import './AuthPage.css'

/* ════════════════════════════════════════════════
   AuthPage
   ════════════════════════════════════════════════ */
export default function AuthPage({ onLogin, onGuest }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'student', birthYear: '', adult: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const update = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const isStudent = form.role === 'student'
  const minor = isStudent && form.birthYear && needsGuardianConsent(form.birthYear)

  const switchMode = (m) => {
    setMode(m)
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    // 서버와 같은 규칙을 미리 확인 (backend/api/auth/register.php)
    if (mode === 'register') {
      const problem = usernameError(form.username) || passwordError(form.password)
        || (isStudent && !form.birthYear && '태어난 해를 골라주세요')
        || (!isStudent && !form.adult && '선생님·보호자 계정은 성인만 만들 수 있어요')
      if (problem) {
        setError(problem)
        return
      }
    }
    setLoading(true)

    try {
      // 회원가입도 토큰을 바로 받아 자동 로그인 → 관심사 설문으로 이어짐
      const data = mode === 'login'
        ? await api.login(form.email, form.password)
        : await api.register({
          username: form.username, email: form.email, password: form.password, role: form.role,
          ...(isStudent ? { birth_year: Number(form.birthYear) } : { adult: true }),
        })
      localStorage.setItem('cocooding_token', data.token)
      localStorage.setItem('cocooding_user', JSON.stringify(data.user))
      onLogin(data.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-root">
      {/* Decorative blobs */}
      <div className="auth-blob auth-blob-1" aria-hidden="true" />
      <div className="auth-blob auth-blob-2" aria-hidden="true" />

      <div className="auth-hero">
        <img src={heroImg} alt="" className="auth-hero-img" aria-hidden="true" />
      </div>

      <div className="auth-card">
        {/* Brand */}
        <div className="auth-brand">
          <BrandIcon />
          <span className="auth-brand-name">코코딩</span>
        </div>

        <h1 className="auth-heading">
          {mode === 'login' ? '다시 만나서 반가워요 👋' : '처음 오셨군요! 🎉'}
        </h1>
        <p className="auth-sub">
          {mode === 'login'
            ? '이메일과 비밀번호를 입력해주세요'
            : '계정을 만들고 블록 코딩을 시작해봐요'}
        </p>

        {/* Mode tabs */}
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
          >
            로그인
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
          >
            회원가입
          </button>
        </div>

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {mode === 'register' && (
            <fieldset className="role-picker">
              <legend>어떤 분이세요?</legend>
              {ROLES.map((r) => (
                <label key={r.id} className={`role-option ${form.role === r.id ? 'on' : ''}`}>
                  <input type="radio" name="role" value={r.id} checked={form.role === r.id} onChange={update('role')} />
                  <span className="role-emoji" aria-hidden="true">{r.emoji}</span>
                  <span className="role-label">{r.label}</span>
                  <span className="role-desc">{r.desc}</span>
                </label>
              ))}
            </fieldset>
          )}

          {mode === 'register' && (
            <div className="field">
              <label htmlFor="auth-username">닉네임</label>
              <input
                id="auth-username"
                type="text"
                placeholder="친구들에게 보일 이름 (2~12자)"
                value={form.username}
                onChange={update('username')}
                autoComplete="username"
                required
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="auth-email">이메일</label>
            <input
              id="auth-email"
              type="email"
              placeholder="example@email.com"
              value={form.email}
              onChange={update('email')}
              autoComplete="email"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="auth-password">비밀번호</label>
            <input
              id="auth-password"
              type="password"
              placeholder={mode === 'register' ? '영문+숫자 8자 이상' : '비밀번호'}
              value={form.password}
              onChange={update('password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'register' ? 8 : undefined}
            />
          </div>

          {mode === 'register' && isStudent && (
            <div className="field">
              <label htmlFor="auth-birth">태어난 해</label>
              <select id="auth-birth" value={form.birthYear} onChange={update('birthYear')} required>
                <option value="">골라주세요</option>
                {birthYearOptions().map((y) => <option key={y} value={y}>{y}년</option>)}
              </select>
              <span className="field-note">나이 확인에만 써요. 친구들에게는 보이지 않아요.</span>
            </div>
          )}
          {minor && (
            <div className="auth-msg auth-msg-info" role="note">
              👪 14살 이하 친구는 <b>보호자 동의</b>가 필요해요. 가입하면 나오는 <b>동의 코드</b>를 부모님께 보여드리세요.
              동의 전에도 챕터 학습과 작품 만들기는 할 수 있어요!
            </div>
          )}
          {mode === 'register' && !isStudent && (
            <label className="auth-check">
              <input type="checkbox" checked={form.adult} onChange={(e) => setForm((f) => ({ ...f, adult: e.target.checked }))} />
              <span>만 19세 이상 성인입니다</span>
            </label>
          )}

          {error   && <div className="auth-msg auth-msg-error"  role="alert">{error}</div>}
          <button type="submit" className="auth-submit" disabled={loading}>
            {loading
              ? '처리 중...'
              : mode === 'login'
              ? '로그인'
              : '계정 만들기'}
          </button>
        </form>

        {/* Guest option */}
        <div className="auth-divider">
          <span>또는</span>
        </div>

        <button type="button" className="auth-guest" onClick={onGuest}>
          로그인 없이 체험하기
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
            <path d="M2.5 6.5h8M7.5 3.5l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
