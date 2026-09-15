import { useState } from 'react'
import { api } from '../api/client'
import { BrandIcon } from '../components/icons'
import heroImg from '../assets/hero.png'
import './AuthPage.css'

/* ════════════════════════════════════════════════
   AuthPage
   ════════════════════════════════════════════════ */
export default function AuthPage({ onLogin, onGuest }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const update = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const switchMode = (m) => {
    setMode(m)
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // 회원가입도 토큰을 바로 받아 자동 로그인 → 관심사 설문으로 이어짐
      const data = mode === 'login'
        ? await api.login(form.email, form.password)
        : await api.register(form.username, form.email, form.password)
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
            <div className="field">
              <label htmlFor="auth-username">닉네임</label>
              <input
                id="auth-username"
                type="text"
                placeholder="코코딩에서 쓸 이름"
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
              placeholder={mode === 'register' ? '6자 이상 입력하세요' : '비밀번호'}
              value={form.password}
              onChange={update('password')}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={mode === 'register' ? 6 : undefined}
            />
          </div>

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
