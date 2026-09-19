import { useCallback, useEffect, useState } from 'react'
import AuthPage      from './pages/AuthPage'
import SurveyPage    from './pages/SurveyPage'
import DashboardPage from './pages/DashboardPage'
import EditorPage    from './pages/EditorPage'
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

export default function App() {
  const [user,      setUser]      = useState(readCachedUser)
  const [page,      setPage]      = useState(() => (readCachedUser() ? 'dashboard' : 'auth'))
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
  const logout = useCallback(() => {
    api.logout().catch(() => {})
    clearSession()
  }, [clearSession])

  /* 어떤 요청이든 401(토큰 만료·다른 곳에서 로그아웃)이 오면 로그인 화면으로 */
  useEffect(() => {
    window.addEventListener('cocoding:unauthorized', clearSession)
    return () => window.removeEventListener('cocoding:unauthorized', clearSession)
  }, [clearSession])

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

  const goDashboard = () => {
    setLaunch(null)
    setPage(user ? 'dashboard' : 'auth')
  }

  /* ── Render ───────────────────────────────────── */
  if (page === 'editor' && launch) {
    return (
      <EditorPage
        key={editorKey}
        user={user}
        launch={launch}
        onBack={goDashboard}
        onUserUpdate={refreshUser}
        onOpenChapter={openChapterById}
        onOpenMyGame={openMyGame}
      />
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
      <DashboardPage
        user={user}
        onLogout={logout}
        onOpenEditor={openEditor}
        onEditSurvey={() => setPage('survey-edit')}
        onOpenMyGame={openMyGame}
        onUserChange={saveUser}
        onAccountDeleted={clearSession}
      />
    )
  }

  return <AuthPage onLogin={handleLogin} onGuest={() => openEditor({ mode: 'free' })} />
}
