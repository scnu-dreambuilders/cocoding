import { BrandIcon } from './icons'
import './TopNav.css'

/* ════════════════════════════════════════════════
   TopNav — 모든 일반 화면(홈/로그인/설문/대시보드)에서 쓰는 공통 상단바
   화면설계서(WEB-MAIN-001)의 "① 카테고리 메뉴바 + ② 회원 정보 바" 구조를 따르되,
   오른쪽 영역은 페이지마다 다른 기능(글자 크기, 새 프로젝트, 계정 등)을 담아야 하므로
   `right` 슬롯으로 완전히 위임한다. `right`를 넘기지 않으면 로그인 전/후 기본 UI를 보여준다.

   EditorPage는 이 컴포넌트를 쓰지 않는다 — 작업용 헤더(실행/저장/제출)를 그대로 유지.
   ════════════════════════════════════════════════ */

const MENU = [
  { key: 'study', label: '단계별 학습', icon: '📘' },
  { key: 'free', label: '자유창작', icon: '🎨' },
  { key: 'qna', label: 'Q&A 게시판', icon: '💬' },
  { key: 'game', label: '게임존', icon: '🎮' },
]

export default function TopNav({ user, active, onNavigate, onBrandClick, onLogin, onSignup, onLogout, right }) {
  const go = (key) => onNavigate?.(key)

  return (
    <header className="topnav">
      <div className="topnav-left">
        <button type="button" className="topnav-brand" onClick={onBrandClick} disabled={!onBrandClick}>
          <BrandIcon />
          <span className="topnav-brand-name">코코딩</span>
        </button>
        <nav className="topnav-menu" aria-label="주요 메뉴">
          {MENU.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`topnav-menu-btn ${active === m.key ? 'active' : ''}`}
              onClick={() => go(m.key)}
              aria-label={m.label}
            >
              <span aria-hidden="true">{m.icon}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="topnav-right">
        {right ?? (user ? (
          <div className="topnav-auth">
            <span className="topnav-username">{user.username}</span>
            <button type="button" className="topnav-btn-ghost" onClick={onLogout}>로그아웃</button>
          </div>
        ) : (
          <div className="topnav-auth">
            <button type="button" className="topnav-btn-ghost" onClick={onLogin}>로그인</button>
            <button type="button" className="topnav-btn-solid" onClick={onSignup}>회원가입</button>
          </div>
        ))}
      </div>
    </header>
  )
}
