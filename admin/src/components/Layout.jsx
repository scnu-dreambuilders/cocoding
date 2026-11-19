import { Flag, LayoutDashboard, LogOut, Users } from 'lucide-react'

const NAV = [
  { path: '/dashboard', label: '대시보드', Icon: LayoutDashboard },
  { path: '/users', label: '회원 관리', Icon: Users },
  { path: '/moderation', label: '신고 관리', Icon: Flag },
]

export function MockBanner() {
  if (!import.meta.env.DEV) return null // 운영 빌드에는 띠 글자도 넣지 않는다
  return <div className="mock-banner" role="status">모의 데이터 — 개발용 가짜 응답이에요. 실제 서버·회원과 연결되어 있지 않아요.</div>
}

export default function Layout({ section, me, mock, loggingOut, onLogout, children }) {
  return (
    <>
      {mock && <MockBanner />}
      <div className="layout">
        <aside className="side">
          <div className="side-brand">
            <b>코코딩 관리자</b>
            <span className="small muted">운영 도구</span>
          </div>
          <nav aria-label="관리 메뉴">
            {NAV.map(({ path, label, Icon }) => (
              <a key={path} className="side-link" href={`#${path}`} aria-current={section === path ? 'page' : undefined}>
                <Icon size={18} aria-hidden="true" /> {label}
              </a>
            ))}
          </nav>
          <div className="side-foot">
            <span className="muted" title={me?.email ?? ''}>{me?.username ?? '운영자'}</span>
            <button type="button" className="btn small" onClick={onLogout} disabled={loggingOut} aria-describedby="logout-note">
              <LogOut size={15} aria-hidden="true" /> {loggingOut ? '로그아웃 중…' : '로그아웃'}
            </button>
            <span className="small muted" id="logout-note">로그아웃하면 이 계정을 쓰는 다른 기기와 학생 앱에서도 다시 로그인해야 해요.</span>
          </div>
        </aside>
        <main className="main" id="main">{children}</main>
      </div>
    </>
  )
}
