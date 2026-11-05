import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import HomePage      from './pages/HomePage'
import AuthPage      from './pages/AuthPage'
import SurveyPage    from './pages/SurveyPage'
import StudentHomePage from './pages/StudentHomePage'
// 블록 편집기는 blockly 라이브러리까지 같이 받아와야 해서 무겁다.
// 홈·대시보드에서는 필요 없으므로 편집기를 열 때 그때 내려받는다.
const EditorPage = lazy(() => import('./pages/EditorPage'))
import PasswordResetPage from './pages/PasswordResetPage'
import BoardPage from './pages/BoardPage'
import { api } from './api/client'
import { CHAPTER_COUNT } from './data/chapters'

/* Read any locally-cached session synchronously (lazy initializer) so the
   first render already reflects it — no loading flash, no setState-in-effect. */
function readCachedUser() {
  const token = localStorage.getItem('cocooding_token')
  const saved = localStorage.getItem('cocooding_user')
  if (!token || !saved) return null
  try {
    return JSON.parse(saved)
  } catch {
    localStorage.removeItem('cocooding_token')
    localStorage.removeItem('cocooding_user')
    return null
  }
}

// 설문을 한 번도 하지 않은 학생 (건너뛰면 빈 배열로 저장됨). 선생님·보호자는 설문 없음
const needsSurvey = (u) => u && (u.role ?? 'student') === 'student' && (u.tags === null || u.tags === undefined)

// 비밀번호 재설정 메일 링크(?reset=토큰)로 들어왔는지
function readResetToken() {
  const token = new URLSearchParams(window.location.search).get('reset')
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null
}

export default function App() {
  const [user,      setUser]      = useState(readCachedUser)
  const [resetToken, setResetToken] = useState(readResetToken)
  const [page,      setPage]      = useState(() => (readResetToken() ? 'reset' : readCachedUser() ? 'dashboard' : 'home'))
  const [launch,    setLaunch]    = useState(null)
  const [editorKey, setEditorKey] = useState(0)

  const saveUser = useCallback((u) => {
    localStorage.setItem('cocooding_user', JSON.stringify(u))
    setUser(u)
  }, [])

  // 로컬 세션만 지우기 (토큰이 이미 무효일 때)
  const clearSession = useCallback(() => {
    localStorage.removeItem('cocooding_token')
    localStorage.removeItem('cocooding_user')
    setUser(null)
    setLaunch(null)
    setPage('auth')
  }, [])

  // 로그아웃 버튼: 서버에서도 토큰을 무효화
  // (토큰 만료처럼 자동으로 세션이 지워질 때는 clearSession만 써서 로그인 화면으로 보낸다)
  const logout = useCallback(() => {
    api.logout().catch(() => {})
    clearSession()
    setPage('home')
  }, [clearSession])

  /* 어떤 요청이든 401(토큰 만료·다른 곳에서 로그아웃)이 오면 로그인 화면으로 */
  useEffect(() => {
    window.addEventListener('cocoding:unauthorized', clearSession)
    return () => window.removeEventListener('cocoding:unauthorized', clearSession)
  }, [clearSession])

  /* 브라우저 bfcache 복원(뒤로가기 등) 방어: 비로그인 상태로 guest 자유창작 에디터가
     그대로 되살아난 경우만 홈으로 정리한다. 로그인 사용자·일반 새로고침에는 영향 없음
     (persisted가 false면 아무 것도 하지 않음 — 최초 로드/새로고침은 위 useState 초기값으로 이미 처리됨) */
  useEffect(() => {
    const onPageShow = (e) => {
      if (e.persisted && !user && page === 'editor' && launch?.mode === 'free') {
        setLaunch(null)
        setPage('home')
      }
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [user, page, launch])

  /* ── Re-validate cached session against the server ───────────── */
  useEffect(() => {
    if (!localStorage.getItem('cocooding_token')) return
    api.me()
      .then((fresh) => {
        saveUser(fresh)
        if (needsSurvey(fresh)) setPage((p) => (p === 'dashboard' ? 'survey' : p))
      })
      .catch(clearSession)
  }, [saveUser, clearSession])

  const refreshUser = useCallback(() => {
    api.me().then(saveUser).catch(() => {})
  }, [saveUser])

  /* ── Navigation ──────────────────────────────── */
  const handleLogin = (userData) => {
    saveUser(userData)
    setPage(needsSurvey(userData) ? 'survey' : 'dashboard')
  }

  const openEditor = useCallback((next) => {
    setLaunch(next)
    setEditorKey((k) => k + 1) // 챕터→다음 챕터처럼 에디터끼리 이동해도 새로 마운트
    setPage('editor')
  }, [])

  const openChapterById = useCallback(async (chapterId) => {
    try {
      const list = await api.chapters()
      const ch = list.find((c) => Number(c.id) === Number(chapterId))
      if (ch) openEditor({ mode: 'chapter', chapter: ch })
      else setPage('dashboard')
    } catch {
      setPage('dashboard')
    }
  }, [openEditor])

  const openMyGame = useCallback(() => {
    openEditor({ mode: 'free', template: 'mygame', completedChapters: Array.from({ length: CHAPTER_COUNT }, (_, i) => i + 1) })
  }, [openEditor])

  // 메인 홈에서 로그인한 학생이 자유창작으로 들어갈 때: 학생 홈과 같이 배운 챕터 정보를 함께 넘긴다
  const openFreeFromHome = useCallback(async () => {
    let completedChapters = []
    try {
      const list = await api.chapters()
      completedChapters = list.filter((c) => c.status === 'completed').map((c) => Number(c.order_num))
    } catch {
      // 챕터 정보를 못 불러와도 기본 블록으로 자유창작은 열어준다
    }
    openEditor({ mode: 'free', completedChapters })
  }, [openEditor])

  const goDashboard = () => {
    setLaunch(null)
    setPage(user ? 'dashboard' : 'home')
  }

  /* ── Render ───────────────────────────────────── */
  if (page === 'editor' && launch) {
    return (
      <Suspense fallback={<div className="app-loading" role="status">블록 편집기를 준비하고 있어요…</div>}>
        <EditorPage
          key={editorKey}
          user={user}
          launch={launch}
          onBack={goDashboard}
          onUserUpdate={refreshUser}
          onOpenChapter={openChapterById}
          onOpenMyGame={openMyGame}
        />
      </Suspense>
    )
  }

  if ((page === 'survey' || page === 'survey-edit') && user) {
    return (
      <SurveyPage
        user={user}
        editing={page === 'survey-edit'}
        onDone={(u) => { saveUser(u); setPage('dashboard') }}
        onSkip={(u) => { if (u) saveUser(u); setPage('dashboard') }}
      />
    )
  }

  if (page === 'dashboard' && user) {
    return (
      <StudentHomePage
        user={user}
        onLogout={logout}
        onOpenEditor={openEditor}
        onEditSurvey={() => setPage('survey-edit')}
        onOpenMyGame={openMyGame}
        onUserChange={saveUser}
        onAccountDeleted={clearSession}
        onGoHome={() => setPage('home')}
        onOpenBoard={() => setPage('board')}
      />
    )
  }

  if (page === 'home') {
    return (
      <HomePage
        user={user}
        onAuth={() => setPage('auth')}
        onGuest={() => openEditor({ mode: 'free' })}
        onGoDashboard={() => setPage('dashboard')}
        onOpenFree={openFreeFromHome}
        onLogout={logout}
        onUserChange={saveUser}
        onAccountDeleted={clearSession}
        onEditSurvey={() => setPage('survey-edit')}
      />
    )
  }

  if (page === 'board' && user) {
    return (
      <BoardPage
        user={user}
        onLogout={logout}
        onGoHome={() => setPage('home')}
        onNavigate={(key) => (key === 'board' ? setPage('board') : key === 'home' ? setPage('dashboard') : setPage('dashboard'))}
      />
    )
  }

  if (page === 'reset') {
    return (
      <PasswordResetPage
        token={resetToken}
        onDone={() => {
          // 주소창의 토큰을 지워서 새로고침해도 다시 열리지 않게
          window.history.replaceState(null, '', window.location.pathname)
          setResetToken(null)
          setPage('auth')
        }}
      />
    )
  }

  return (
    <AuthPage
      onLogin={handleLogin}
      onGuest={() => openEditor({ mode: 'free' })}
      onForgotPassword={() => setPage('reset')}
    />
  )
}
