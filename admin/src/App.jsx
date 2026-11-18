import { useCallback, useEffect, useRef, useState } from 'react'
import { ADMIN_KEY, TOKEN_KEY, UNAUTHORIZED_EVENT, USE_MOCK, api, readToken } from './api/client.js'
import Layout, { MockBanner } from './components/Layout.jsx'
import { clearDirty, confirmLeave, hasDirty, parseHash } from './lib/route.js'
import LoginPage from './pages/LoginPage.jsx'
import ForbiddenPage from './pages/ForbiddenPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import UsersPage from './pages/UsersPage.jsx'
import UserDetailPage from './pages/UserDetailPage.jsx'
import ModerationPage from './pages/ModerationPage.jsx'

function readMe() {
  try { return JSON.parse(localStorage.getItem(ADMIN_KEY) ?? 'null') } catch { return null }
}
function saveSession(token, me) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(ADMIN_KEY, JSON.stringify({ id: me.id, username: me.username, email: me.email }))
  } catch { /* 저장소를 못 쓰면 이 탭에서만 유지되지 않는다 — 다음 요청에서 401 로 로그인 화면이 나온다 */ }
}
function clearSession() {
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(ADMIN_KEY) } catch { /* 무시 */ }
}

/* 상태
   checking  저장된 토큰으로 운영자인지 확인하는 중 (stats 요청)
   login     로그인 화면 (notice: 로그인이 끊겼을 때 안내)
   forbidden 로그인은 됐지만 운영자가 아님 — 서버 문장을 그대로 보여 준다
   offline   서버에 닿지 못함 — 연결 상태 안내와 다시 시도
   ready     관리 화면 */
export default function App() {
  const [auth, setAuth] = useState(() => (readToken() ? { status: 'checking' } : { status: 'login' }))
  const [me, setMe] = useState(readMe)
  const [route, setRoute] = useState(() => parseHash())
  const [loggingOut, setLoggingOut] = useState(false)
  // 로그인·로그아웃할 때마다 바뀐다. 늦게 온 확인 응답이 새 로그인 상태를 덮어쓰지 않게 한다
  const sessionRef = useRef(0)

  const verify = useCallback(() => {
    const session = sessionRef.current
    return api.stats().then(
      () => { if (session === sessionRef.current) setAuth({ status: 'ready' }) },
      (err) => {
        if (session !== sessionRef.current) return
        if (err.kind === 'forbidden') setAuth({ status: 'forbidden', message: err.message })
        else if (err.kind === 'unauthorized') { clearSession(); setMe(null); setAuth({ status: 'login', notice: err.message }) }
        else setAuth({ status: 'offline', message: err.message, kind: err.kind })
      },
    )
  }, [])

  // 처음 열 때 저장된 토큰이 있으면 운영자인지 확인 (요청은 effect 밖 비동기 함수에서 상태를 바꾼다)
  useEffect(() => {
    if (readToken()) verify()
  }, [verify])

  // 다른 곳에서 받은 401 — client.js 가 '지금 토큰으로 보낸 요청'일 때만 보낸다
  useEffect(() => {
    const onUnauthorized = () => {
      sessionRef.current += 1
      clearDirty()
      clearSession()
      setMe(null)
      setLoggingOut(false)
      setAuth({ status: 'login', notice: '로그인이 끊겼어요. 다시 로그인해 주세요.' })
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  // 주소 바뀜 — 저장하지 않은 입력이 있으면 묻고, 취소하면 원래 주소로 되돌린다
  const acceptedHash = useRef(window.location.hash)
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === acceptedHash.current) return
      if (!confirmLeave()) {
        window.history.replaceState(null, '', acceptedHash.current || '#/dashboard')
        return
      }
      acceptedHash.current = window.location.hash
      setRoute(parseHash())
    }
    const onBeforeUnload = (e) => {
      if (!hasDirty()) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('hashchange', onHash)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [])

  const onLoggedIn = useCallback((token, user) => {
    sessionRef.current += 1
    saveSession(token, user)
    setLoggingOut(false)
    setMe({ id: user.id, username: user.username, email: user.email })
    setAuth({ status: 'checking' })
    verify()
  }, [verify])

  const logout = useCallback(async () => {
    if (!confirmLeave()) return
    setLoggingOut(true)
    const session = ++sessionRef.current
    // 지금 서버는 로그아웃할 때 이 계정의 모든 토큰을 끊는다 (Auth::revoke).
    // 서버에 알리지 못했으면 다른 기기는 그대로일 수 있으니, '모든 기기 로그아웃'이라고 말하지 않는다
    let serverDone = true
    try { await api.logout() } catch { serverDone = false }
    if (session !== sessionRef.current) return
    clearSession()
    setMe(null)
    setLoggingOut(false)
    setAuth(serverDone
      ? { status: 'login', notice: '로그아웃했어요. 이 계정을 쓰는 다른 기기와 학생 앱에서도 다시 로그인해야 해요.', tone: 'ok' }
      : { status: 'login', notice: '이 브라우저에서만 로그아웃했어요. 서버에 로그아웃을 알리지 못해서, 다른 기기의 로그인은 그대로일 수 있어요.', tone: 'warn' })
  }, [])

  // 화면에서 불러오기가 403 을 받으면 권한이 빠졌는지 다시 확인한다 (문장으로 판단하지 않는다)
  const recheck = useCallback(() => { verify() }, [verify])

  if (auth.status === 'login') {
    return <LoginPage mock={USE_MOCK} notice={auth.notice} tone={auth.tone} onLoggedIn={onLoggedIn} />
  }
  if (auth.status === 'checking' || auth.status === 'offline' || auth.status === 'forbidden') {
    return (
      <>
        {USE_MOCK && <MockBanner />}
        {auth.status === 'forbidden'
          ? <ForbiddenPage me={me} message={auth.message} loggingOut={loggingOut} onLogout={logout} />
          : (
            <div className="center-page">
              <div className="card auth-card" aria-live="polite">
                {auth.status === 'checking'
                  ? <p>운영자 권한을 확인하는 중이에요…</p>
                  : (
                    <>
                      <h1>{auth.kind === 'server' ? '서버에 문제가 생겼어요' : '연결 상태를 확인해 주세요'}</h1>
                      <p className="notice warn" role="alert">{auth.message}</p>
                      <div className="btn-row">
                        <button type="button" className="btn primary" onClick={() => { setAuth({ status: 'checking' }); verify() }}>다시 시도</button>
                        <button type="button" className="btn" onClick={logout} disabled={loggingOut}>로그아웃</button>
                      </div>
                    </>
                  )}
              </div>
            </div>
          )}
      </>
    )
  }

  const [first, second] = route.parts
  let section = '/dashboard'
  let page = <DashboardPage onForbidden={recheck} />
  if (first === 'users' && second) {
    section = '/users'
    page = <UserDetailPage key={second} id={Number(second)} me={me} back={route.params.get('back') ?? ''} onForbidden={recheck} />
  } else if (first === 'users') {
    section = '/users'
    page = <UsersPage params={route.params} onForbidden={recheck} />
  } else if (first === 'moderation') {
    section = '/moderation'
    page = <ModerationPage params={route.params} onForbidden={recheck} />
  }

  return (
    <Layout section={section} me={me} mock={USE_MOCK} loggingOut={loggingOut} onLogout={logout}>
      {page}
    </Layout>
  )
}
