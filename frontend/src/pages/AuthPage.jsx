import { useState } from 'react'
import { api } from '../api/client'
import { BrandIcon } from '../components/icons'
import { ROLES, birthYearOptions, needsGuardianConsent, passwordError, usernameError } from '../lib/validators'
import heroImg from '../assets/hero.png'
import './AuthPage.css'

/* ════════════════════════════════════════════════
   AuthPage
   ════════════════════════════════════════════════ */
// 회원가입 3단계 위저드의 화면 순서 (화면설계서 WEB-AUTH-003 기준). 로직·데이터는 그대로, 화면만 단계로 나눔.
const STEPS = [
  { n: 1, label: '유형 선택' },
  { n: 2, label: '약관 동의' },
  { n: 3, label: '정보 입력' },
]

function StepIndicator({ step }) {
  return (
    <div className="auth-steps" role="list" aria-label="회원가입 진행 단계">
      {STEPS.map((s, i) => (
        <div key={s.n} className="auth-step-item" role="listitem">
          <span className={`auth-step-dot ${step === s.n ? 'current' : step > s.n ? 'done' : ''}`}>
            {step > s.n ? '✓' : s.n}
          </span>
          <span className={`auth-step-label ${step >= s.n ? 'on' : ''}`}>{s.label}</span>
          {i < STEPS.length - 1 && <span className={`auth-step-line ${step > s.n ? 'done' : ''}`} aria-hidden="true" />}
        </div>
      ))}
    </div>
  )
}

const TERMS_INFO = {
  service: { label: '서비스 이용약관 동의', required: true,
    detail: '코코딩을 안전하고 즐겁게 이용하기 위한 기본 규칙이에요. 다른 친구를 존중하고, 서비스를 목적에 맞게 사용해주세요.' },
  privacy: { label: '개인정보 수집 및 이용 동의', required: true,
    detail: '회원가입·서비스 제공에 필요한 최소한의 정보(닉네임, 이메일, 태어난 해 등)만 수집하고 안전하게 보관해요.' },
  marketing: { label: '서비스 소식 및 안내 수신 동의', required: false,
    detail: '새로운 기능이나 이벤트 소식을 이메일로 가끔 받아볼 수 있어요. 나중에 언제든 설정에서 바꿀 수 있어요.' },
}

export default function AuthPage({ onLogin, onGuest }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [step, setStep] = useState(1) // register 전용: 1 유형선택 → 2 약관동의 → 3 정보입력
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'student', birthYear: '', adult: false })
  const [terms, setTerms] = useState({ service: false, privacy: false, marketing: false }) // UI 동의만 — 서버 저장·API 전송 없음
  const [termsOpen, setTermsOpen] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const update = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const isStudent = form.role === 'student'
  const minor = isStudent && form.birthYear && needsGuardianConsent(form.birthYear)
  const requiredTermsAgreed = terms.service && terms.privacy
  const allTermsAgreed = requiredTermsAgreed && terms.marketing

  const switchMode = (m) => {
    setMode(m)
    setError('')
    if (m === 'register') setStep(1) // 탭을 새로 열 때는 항상 1단계부터
  }

  const toggleTerm = (key) => setTerms((t) => ({ ...t, [key]: !t[key] }))
  const toggleAllTerms = () => {
    const next = !allTermsAgreed
    setTerms({ service: next, privacy: next, marketing: next })
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

      <div className={`auth-card ${mode === 'register' ? 'auth-card-wide' : ''}`}>
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

        {/* ── 로그인: 기존 그대로 ── */}
        {mode === 'login' && (
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
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
                placeholder="비밀번호"
                value={form.password}
                onChange={update('password')}
                autoComplete="current-password"
                required
              />
            </div>

            {error && <div className="auth-msg auth-msg-error" role="alert">{error}</div>}
            <button type="submit" className="auth-submit" disabled={loading}>
              {loading ? '처리 중...' : '로그인'}
            </button>
          </form>
        )}

        {/* ── 회원가입: 3단계 위저드 (화면설계서 WEB-AUTH-003 구조, 기존 로직·필드는 그대로) ── */}
        {mode === 'register' && (
          <>
            <StepIndicator step={step} />

            {/* STEP 1 · 유형 선택 */}
            {step === 1 && (
              <div className="auth-step-panel">
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
                <div className="auth-step-actions">
                  <button type="button" className="auth-next" onClick={() => setStep(2)}>다음 →</button>
                </div>
              </div>
            )}

            {/* STEP 2 · 약관 동의 */}
            {step === 2 && (
              <div className="auth-step-panel">
                <div className="terms-box">
                  <label className="term-row term-all">
                    <input type="checkbox" checked={allTermsAgreed} onChange={toggleAllTerms} />
                    <span><b>전체 동의</b></span>
                  </label>
                  {Object.entries(TERMS_INFO).map(([key, t]) => (
                    <div key={key} className="term-block">
                      <label className="term-row">
                        <input type="checkbox" checked={terms[key]} onChange={() => toggleTerm(key)} />
                        <span>
                          <span className={`term-tag ${t.required ? 'req' : 'opt'}`}>{t.required ? '필수' : '선택'}</span>
                          {t.label}
                        </span>
                        <button type="button" className="term-view"
                          onClick={() => setTermsOpen((o) => (o === key ? null : key))}
                          aria-expanded={termsOpen === key}>
                          {termsOpen === key ? '접기' : '보기'}
                        </button>
                      </label>
                      {termsOpen === key && <p className="term-detail">{t.detail}</p>}
                    </div>
                  ))}
                </div>
                <div className="auth-step-actions">
                  <button type="button" className="auth-prev" onClick={() => setStep(1)}>← 이전</button>
                  <button type="button" className="auth-next" disabled={!requiredTermsAgreed} onClick={() => setStep(3)}>다음 →</button>
                </div>
              </div>
            )}

            {/* STEP 3 · 정보 입력 (기존 회원가입 폼 필드 그대로) */}
            {step === 3 && (
              <form className="auth-form auth-step-panel" onSubmit={handleSubmit} noValidate>
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
                    placeholder="영문+숫자 8자 이상"
                    value={form.password}
                    onChange={update('password')}
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                </div>

                {isStudent && (
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
                {!isStudent && (
                  <label className="auth-check">
                    <input type="checkbox" checked={form.adult} onChange={(e) => setForm((f) => ({ ...f, adult: e.target.checked }))} />
                    <span>만 19세 이상 성인입니다</span>
                  </label>
                )}

                {error && <div className="auth-msg auth-msg-error" role="alert">{error}</div>}
                <div className="auth-step-actions">
                  <button type="button" className="auth-prev" onClick={() => setStep(2)}>← 이전</button>
                  <button type="submit" className="auth-submit auth-next-submit" disabled={loading}>
                    {loading ? '처리 중...' : '🎉 코코딩 회원가입 완료!'}
                  </button>
                </div>
              </form>
            )}
          </>
        )}

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
