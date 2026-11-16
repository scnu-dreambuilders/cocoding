import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
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

// 로그인 후 개인 화면들. 모두 StudentHomePage 하나가 view만 바꿔 그린다 (상태 공유)
//  dashboard: 학생 홈(교사·보호자는 기존 화면) / study: 단계별 학습 / mypage: 마이페이지
const PERSONAL_PAGES = ['dashboard', 'study', 'mypage']

// 상단 메뉴·푸터의 메뉴 키 → 학생 전용 메뉴 이름 (로그인·역할 안내 문구에 씀)
const STUDENT_MENU = { study: '단계별 학습', free: '자유창작', popular: '인기 작품' }
const SOON_MESSAGE = '이 메뉴는 곧 만나볼 수 있어요. 지금은 준비 중이에요!'

// 앱 시작 시 세션 확인에서 '계정 없음'으로 확정할 수 있는 응답인지.
// backend/api/auth/me.php는 계정이 없으면 JSON {success:false, error:"사용자를 찾을 수 없습니다."}와 404를 보낸다.
// 경로 오류(HTML 404)·네트워크·시간 초과·5xx·해석 실패는 여기에 해당하지 않으므로 세션을 지우지 않는다.
const ACCOUNT_GONE_MESSAGE = '사용자를 찾을 수 없습니다.'
const isAccountGone = (err) => err?.status === 404 && err?.kind === 'api' && err?.message === ACCOUNT_GONE_MESSAGE

// 비밀번호 재설정 메일 링크(?reset=토큰)로 들어왔는지
function readResetToken() {
  const token = new URLSearchParams(window.location.search).get('reset')
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null
}

/* ── 주소(URL) ↔ 화면 ────────────────────────────
   화면은 지금처럼 page 값 하나로 바꾸고, 주소는 그 값을 따라간다 (새로고침·뒤로 가기·주소 공유용).
   react-router로 옮기면 이 표가 그대로 라우트 정의가 된다. */
const PAGE_PATH = {
  home: '/', dashboard: '/home', study: '/study', mypage: '/mypage', board: '/board',
  survey: '/survey', 'survey-edit': '/survey/edit',
}
const PATH_PAGE = Object.fromEntries(Object.entries(PAGE_PATH).map(([p, path]) => [path, p]))
const LOGIN_ONLY = new Set(['dashboard', 'study', 'mypage', 'board', 'survey', 'survey-edit'])
const STUDENT_ONLY = new Set(['study', 'mypage'])

function editorPath(launch, savedId) {
  if (launch.mode === 'chapter') return `/editor/chapter/${launch.chapter.id}`
  if (launch.template === 'mygame') return '/editor/mygame'
  const id = launch.projectId ?? savedId
  return id ? `/editor/project/${id}` : '/editor/new'
}

// 지금 화면의 주소. 비밀번호 재설정은 주소의 토큰을 그대로 둔다 (null)
function pathOf(page, launch, authMode, savedId) {
  if (page === 'editor' && launch) return editorPath(launch, savedId)
  if (page === 'auth') return authMode === 'register' ? '/signup' : '/login'
  return PAGE_PATH[page] ?? null
}

// 주소 → { page, authMode } 또는 편집기라면 { editor: { kind, id } } (편집기는 데이터를 다시 불러와 연다)
function routeOf(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/'
  const m = path.match(/^\/editor\/(chapter|project)\/(\d+)$/)
  if (m) return { editor: { kind: m[1], id: Number(m[2]) } }
  if (path === '/editor/mygame') return { editor: { kind: 'mygame' } }
  if (path === '/editor/new') return { editor: { kind: 'new' } }
  if (path === '/login') return { page: 'auth', authMode: 'login' }
  if (path === '/signup') return { page: 'auth', authMode: 'register' }
  return { page: PATH_PAGE[path] ?? 'home' }
}

// 로그인 여부·역할에 맞지 않는 주소는 갈 수 있는 화면으로 바꾼다
function allowedPage(page, user) {
  if (!user) return LOGIN_ONLY.has(page) ? 'auth' : page
  if (page === 'auth') return 'dashboard'
  if (STUDENT_ONLY.has(page) && (user.role ?? 'student') !== 'student') return 'dashboard'
  return page
}

function initialPage() {
  if (readResetToken()) return 'reset'
  const user = readCachedUser()
  const route = routeOf(window.location.pathname)
  if (route.editor) return user ? 'dashboard' : 'home' // 편집기는 아래에서 데이터를 불러와 다시 연다
  // 처음 들어온 주소가 메인('/')이면 로그인한 사람은 기존처럼 학생 홈으로
  if (route.page === 'home' && user) return 'dashboard'
  return allowedPage(route.page, user)
}

export default function App() {
  const [user,      setUser]      = useState(readCachedUser)
  const [resetToken, setResetToken] = useState(readResetToken)
  const [page,      setPage]      = useState(initialPage)
  const [launch,    setLaunch]    = useState(null)
  const [editorKey, setEditorKey] = useState(0)
  // 에디터·설문 수정에서 돌아갈 화면 (학습 화면에서 연 챕터는 학습 화면으로, 메인에서 연 에디터는 메인으로)
  const [backTo, setBackTo] = useState('dashboard')
  // 로그인 화면을 어느 탭으로 열지 ('login' | 'register') — 회원가입 버튼만 'register'
  const [authMode, setAuthMode] = useState(() => routeOf(window.location.pathname).authMode ?? 'login')
  // 편집기 주소(/editor/...)로 들어오거나 뒤로 가기로 돌아왔을 때 다시 열어야 할 편집기. 여는 동안은 안내만 보여준다
  const [restoring, setRestoring] = useState(() => (readResetToken() ? null : routeOf(window.location.pathname).editor ?? null))
  // 화면을 옮긴 뒤 한 번만 할 일 ('popular': 친구 작품 인기순으로 / 'guide': 사용법 안내 열기). 쓰고 나면 null
  const [navIntent, setNavIntent] = useState(null)
  // 앱 시작 시 세션 확인이 인증 문제가 아닌 이유(네트워크·서버 오류 등)로 실패했을 때의 안내
  const [sessionIssue, setSessionIssue] = useState('')

  // 주소 동기화용 — 새 작품을 처음 저장해 생긴 번호, 편집기의 '나가도 될까?' 확인, 뒤로 가기 처리에 쓰는 최신 값
  const savedIdRef = useRef(null)
  const leaveGuardRef = useRef(null)
  const lastPathRef = useRef(window.location.pathname)
  const replaceNextRef = useRef(true) // 첫 화면·주소 보정은 방문 기록을 늘리지 않는다
  const latestRef = useRef({ page, user })
  useEffect(() => { latestRef.current = { page, user } })

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
    setNavIntent(null)
    setSessionIssue('')
    setAuthMode('login')
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
  // 401(토큰 만료)은 client.js가 'cocoding:unauthorized' 이벤트로 이미 로그아웃시킨다.
  // 그 밖에는 '계정 없음'이 확실할 때만 세션을 지우고, 네트워크·시간 초과·서버 오류는 세션을 남긴 채 안내만 한다.
  // (저장된 사용자 정보는 확인된 것이 아니므로 안내를 띄우고, 실제 작업은 서버가 요청마다 다시 인증한다)
  const checkSession = useCallback(() => {
    if (!localStorage.getItem('cocooding_token')) return
    api.me()
      .then((fresh) => {
        setSessionIssue('')
        saveUser(fresh)
        if (needsSurvey(fresh)) setPage((p) => (p === 'dashboard' ? 'survey' : p))
      })
      .catch((err) => {
        if (err?.status === 401) return
        if (isAccountGone(err)) {
          clearSession()
          return
        }
        setSessionIssue(`로그인 상태를 확인하지 못했어요 (${err?.message ?? '알 수 없는 오류'}). 잠시 후 다시 확인해 주세요.`)
      })
  }, [saveUser, clearSession])

  useEffect(() => {
    checkSession()
  }, [checkSession])

  const refreshUser = useCallback(() => {
    api.me().then(saveUser).catch(() => {})
  }, [saveUser])

  /* ── Navigation ──────────────────────────────── */
  const handleLogin = (userData) => {
    saveUser(userData)
    setPage(needsSurvey(userData) ? 'survey' : 'dashboard')
  }

  const openEditor = useCallback((next) => {
    // 에디터끼리 이동할 때(다음 챕터 등)는 처음 들어온 화면을 그대로 기억한다
    // 메인에서 열면 메인으로 (비로그인 체험은 goDashboard가 원래대로 메인으로 보낸다)
    if (page !== 'editor') setBackTo(PERSONAL_PAGES.includes(page) || page === 'home' ? page : 'dashboard')
    savedIdRef.current = null
    setLaunch(next)
    setEditorKey((k) => k + 1) // 챕터→다음 챕터처럼 에디터끼리 이동해도 새로 마운트
    setPage('editor')
  }, [page])

  // 관심사·코딩 수준 수정: 끝나면 연 화면으로 돌아간다 (메인 홈에서 열면 기존처럼 학생 홈)
  const openSurveyEdit = useCallback(() => {
    setBackTo(PERSONAL_PAGES.includes(page) ? page : 'dashboard')
    setPage('survey-edit')
  }, [page])

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
  const loadCompletedChapters = useCallback(async () => {
    try {
      const list = await api.chapters()
      return list.filter((c) => c.status === 'completed').map((c) => Number(c.order_num))
    } catch {
      return [] // 챕터 정보를 못 불러와도 기본 블록으로는 열어준다
    }
  }, [])

  const openFreeFromHome = useCallback(async () => {
    openEditor({ mode: 'free', completedChapters: await loadCompletedChapters() })
  }, [openEditor, loadCompletedChapters])

  // 메인 추천 작품 카드: 고른 작품을 기존 구경 흐름(에디터, 남의 작품은 '구경 중' — 저장·공유 없음)으로 연다.
  // 볼 수 있는지는 서버(projects/view.php)가 공개 여부·보호자 동의로 다시 확인하고, 못 열면 에디터가 안내와 '돌아가기'를 보여준다
  const openProjectFromHome = useCallback(async (projectId) => {
    openEditor({ mode: 'free', projectId, completedChapters: await loadCompletedChapters() })
  }, [openEditor, loadCompletedChapters])

  const openAuth = useCallback((mode = 'login') => {
    setAuthMode(mode)
    setPage('auth')
  }, [])

  // 메뉴 키(TopNav·푸터)를 화면과 상관없이 같은 목적지로 보낸다.
  // 화면에 띄울 안내가 있으면 { toast, after }를 돌려준다 (after: 안내 뒤 이어서 할 일 — 로그인 화면으로)
  // 학생 홈·학습·마이페이지 안에서 바로 처리하는 키(자유창작·인기 작품)는 StudentHomePage가 먼저 처리한다
  const handleMenu = useCallback((key) => {
    const role = user ? (user.role ?? 'student') : null
    if (key === 'guide') { setNavIntent('guide'); setPage('home'); return null }
    if (key === 'qna' || key === 'game') return { toast: SOON_MESSAGE }
    if (key === 'home') { setPage(user ? 'dashboard' : 'home'); return null }
    if (key === 'board') {
      if (!user) return { toast: '토론 게시판은 로그인하면 이용할 수 있어요. 로그인 화면으로 이동할게요!', after: () => openAuth('login') }
      setPage('board')
      return null
    }
    const what = STUDENT_MENU[key]
    if (!what) return null
    if (!user) return { toast: `${what}은 로그인하면 이용할 수 있어요. 로그인 화면으로 이동할게요!`, after: () => openAuth('login') }
    if (role !== 'student') return { toast: `${what}은 학생 계정에서만 이용할 수 있어요.` }
    if (key === 'study') setPage('study')
    else if (key === 'free') openFreeFromHome()
    else { setNavIntent('popular'); setPage('dashboard') }
    return null
  }, [user, openAuth, openFreeFromHome])

  const consumeNavIntent = useCallback(() => setNavIntent(null), [])

  // 메인 '더 많은 작품 보기': 학생 홈의 친구 작품 목록(고정 ID community-section)으로. 정렬은 바꾸지 않는다
  const openFriendWorks = useCallback(() => {
    setNavIntent('friends')
    setPage('dashboard')
  }, [])

  const goDashboard = () => {
    setLaunch(null)
    setPage(user ? backTo : 'home')
  }

  /* ── 주소 동기화 ──────────────────────────────── */
  // 편집기 주소를 데이터로 다시 연다 (새로고침·주소 공유·뒤로 가기). 못 열면 각 함수가 학생 홈 등으로 보낸다
  const restoreEditor = useCallback(async ({ kind, id }) => {
    if (kind === 'new' && !user) { openEditor({ mode: 'free' }); return } // 로그인 없이 체험
    if (!user) { setAuthMode('login'); setPage('auth'); return }
    if (kind === 'chapter') await openChapterById(id)
    else if (kind === 'mygame') openMyGame()
    else if (kind === 'project') await openProjectFromHome(id)
    else await openFreeFromHome()
  }, [user, openEditor, openChapterById, openMyGame, openProjectFromHome, openFreeFromHome])

  const restoredRef = useRef(null)
  useEffect(() => {
    if (!restoring || restoredRef.current === restoring) return
    restoredRef.current = restoring
    restoreEditor(restoring).finally(() => {
      replaceNextRef.current = true
      setRestoring(null)
    })
  }, [restoring, restoreEditor])

  // 화면이 바뀌면 주소를 맞춘다. 뒤로 가기로 바뀐 화면은 주소가 이미 같아서 기록을 늘리지 않는다
  useEffect(() => {
    if (restoring) return
    const path = pathOf(page, launch, authMode, savedIdRef.current)
    const replace = replaceNextRef.current
    replaceNextRef.current = false
    if (!path || path === window.location.pathname) return
    window.history[replace ? 'replaceState' : 'pushState'](null, '', path)
    lastPathRef.current = path
  }, [page, launch, authMode, restoring])

  useEffect(() => {
    const onPop = () => {
      const { page: current, user: me } = latestRef.current
      // 편집기에서 저장하지 않은 내용이 있어 '머무르기'를 고르면 주소를 편집기로 되돌린다
      if (current === 'editor' && leaveGuardRef.current && !leaveGuardRef.current()) {
        window.history.pushState(null, '', lastPathRef.current)
        return
      }
      lastPathRef.current = window.location.pathname
      const route = routeOf(window.location.pathname)
      if (route.editor) { setRestoring(route.editor); return }
      replaceNextRef.current = true
      setLaunch(null)
      if (route.authMode) setAuthMode(route.authMode)
      setPage(allowedPage(route.page, me))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const registerLeaveGuard = useCallback((guard) => {
    leaveGuardRef.current = guard
    return () => { if (leaveGuardRef.current === guard) leaveGuardRef.current = null }
  }, [])

  // 새 작품을 처음 저장하면 주소를 /editor/project/번호로 바꿔, 새로고침해도 그 작품이 열리게 한다
  const handleProjectSaved = useCallback((id) => {
    if (latestRef.current.page !== 'editor' || !id) return
    savedIdRef.current = id
    const path = `/editor/project/${id}`
    if (window.location.pathname !== path) window.history.replaceState(null, '', path)
    lastPathRef.current = path
  }, [])

  /* ── Render ───────────────────────────────────── */
  if (restoring) {
    return <div className="app-loading" role="status">화면을 불러오고 있어요…</div>
  }

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
          registerLeaveGuard={registerLeaveGuard}
          onProjectSaved={handleProjectSaved}
        />
      </Suspense>
    )
  }

  if ((page === 'survey' || page === 'survey-edit') && user) {
    const afterSurvey = page === 'survey-edit' ? backTo : 'dashboard'
    return (
      <SurveyPage
        user={user}
        editing={page === 'survey-edit'}
        onDone={(u) => { saveUser(u); setPage(afterSurvey) }}
        onSkip={(u) => { if (u) saveUser(u); setPage(afterSurvey) }}
      />
    )
  }

  // 학생 홈·단계별 학습·마이페이지는 같은 자리에서 같은 컴포넌트로 그려 상태를 유지한다
  if (PERSONAL_PAGES.includes(page) && user) {
    return (
      <StudentHomePage
        user={user}
        view={page}
        onChangeView={setPage}
        onLogout={logout}
        onOpenEditor={openEditor}
        onEditSurvey={openSurveyEdit}
        onOpenMyGame={openMyGame}
        onUserChange={saveUser}
        onAccountDeleted={clearSession}
        onGoHome={() => setPage('home')}
        onMenu={handleMenu}
        navIntent={navIntent}
        onNavIntentDone={consumeNavIntent}
        sessionIssue={sessionIssue}
        onRecheckSession={checkSession}
      />
    )
  }

  if (page === 'home') {
    return (
      <HomePage
        user={user}
        onAuth={openAuth}
        onGoDashboard={() => setPage('dashboard')}
        onOpenMyPage={() => setPage('mypage')}
        onOpenProject={openProjectFromHome}
        onOpenFriendWorks={openFriendWorks}
        onMenu={handleMenu}
        navIntent={navIntent}
        onNavIntentDone={consumeNavIntent}
        sessionIssue={sessionIssue}
        onRecheckSession={checkSession}
        onLogout={logout}
        onUserChange={saveUser}
        onAccountDeleted={clearSession}
        onEditSurvey={openSurveyEdit}
      />
    )
  }

  if (page === 'board' && user) {
    return (
      <BoardPage
        user={user}
        onLogout={logout}
        onGoHome={() => setPage('home')}
        onMenu={handleMenu}
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
      key={authMode}
      initialMode={authMode}
      onLogin={handleLogin}
      onGuest={() => openEditor({ mode: 'free' })}
      onForgotPassword={() => setPage('reset')}
    />
  )
}
