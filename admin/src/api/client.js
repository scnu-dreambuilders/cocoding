/* ════════════════════════════════════════════════
   관리자 웹 API — 학생 앱(frontend)과 토큰 저장 키·인증 이벤트를 따로 쓴다.
   응답 모양은 backend/api/admin/*.php (관리자웹-프론트-요청.md) 기준.

   오류 종류(err.kind)
     unauthorized  401 — 로그인이 끊김 (이 요청을 보낸 토큰이 지금 토큰과 같을 때만 전역 이벤트를 보낸다)
     forbidden     403 — 운영자가 아니거나 이 작업을 할 수 없음 (화면을 비우지 말고 서버 문장을 보여 준다)
     api           그 밖의 서버 거절 (400·404·409 …). err.message 는 그대로 보여도 되는 문장
     server        5xx — 서버 내부 오류. 서버 문장 대신 일반 문구를 쓰고 status 는 남긴다 (다시 시도 가능)
     network / timeout / parse  서버에 닿지 못했거나 응답을 읽지 못함 — '연결 상태'로 안내한다
   400·404·409·429 같은 4xx 는 서버가 사용자에게 보여 주려고 쓴 문장이라 그대로 보여 준다.
   응답 원문·로그인 정보·임시 비밀번호는 콘솔이나 저장소에 남기지 않는다 (이 파일에 console 호출 없음)
   ════════════════════════════════════════════════ */
const BASE = import.meta.env.VITE_API_URL ?? '/api'
const TIMEOUT_MS = 15000

export const TOKEN_KEY = 'cocoding_admin_token'
export const ADMIN_KEY = 'cocoding_admin_me' // 로그인한 운영자 { id, username, email } — 비밀번호는 저장하지 않는다
export const UNAUTHORIZED_EVENT = 'cocoding-admin:unauthorized'

// 개발 서버에서 VITE_ADMIN_MOCK=true 일 때만 모의 응답을 쓴다.
// 운영 빌드에서는 import.meta.env.DEV 가 false 로 바뀌어 모의 코드(./mock.js)가 번들에서 빠진다
export const USE_MOCK = import.meta.env.DEV && import.meta.env.VITE_ADMIN_MOCK === 'true'

function apiError(message, kind, status) {
  const err = new Error(message)
  err.kind = kind
  if (status !== undefined) err.status = status
  return err
}

export function readToken() {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

async function send(path, init) {
  if (import.meta.env.DEV && USE_MOCK) {
    const { mockFetch } = await import('./mock.js')
    return mockFetch(path, init)
  }
  return fetch(`${BASE}${path}`, init)
}

export async function request(path, { method = 'GET', body } = {}) {
  const token = readToken()
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res
  try {
    res = await send(path, {
      method, headers, signal: controller.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw apiError('서버 응답이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.', 'timeout')
    throw apiError('서버에 연결할 수 없어요. 관리자 API 서버가 켜져 있는지 확인해 주세요.', 'network')
  } finally {
    clearTimeout(timer)
  }

  // 5xx 는 본문을 읽지도 보여 주지도 않는다. 서버 문장에 내부 경로·DB 설정 안내가 섞여 올 수 있고(503),
  // HTML 오류 페이지일 수도 있다. 상태 번호와 종류(server)만 남겨 다시 시도할 수 있게 한다
  if (res.status >= 500) {
    throw apiError(res.status === 503
      ? '서버를 잠시 쓸 수 없어요. 잠시 후 다시 시도해 주세요.'
      : '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.', 'server', res.status)
  }

  // JSON 이 아닌 응답(프록시·웹 서버 오류 페이지 등)이면 json 은 null — 원문은 보여 주지 않는다
  let json
  try { json = await res.json() } catch { json = null }
  const serverText = typeof json?.error === 'string' && json.error.trim() ? json.error : null

  if (res.status === 401) {
    // 이미 로그아웃했거나 다른 토큰으로 다시 로그인했다면 이전 요청의 401은 지금 세션을 끝내지 않는다
    const current = readToken()
    if (token && current && current === token) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    throw apiError(serverText ?? '로그인이 끊겼어요. 다시 로그인해 주세요.', 'unauthorized', 401)
  }
  if (res.status === 403) throw apiError(serverText ?? '이 작업을 할 수 있는 권한이 없어요.', 'forbidden', 403)
  if (json === null) throw apiError(res.ok ? '서버 응답을 읽을 수 없어요.' : `서버 응답을 읽을 수 없어요 (${res.status}).`, 'parse', res.status)
  if (!json.success) throw apiError(serverText ?? '요청을 처리하지 못했어요.', 'api', res.status)
  return json.data
}

const qs = (params) => {
  const p = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, String(v)) })
  return p.toString()
}

export const api = {
  login: (email, password) => request('/auth/login.php', { method: 'POST', body: { email, password } }),
  logout: () => request('/auth/logout.php', { method: 'POST' }),

  // 대시보드 숫자. 운영자인지 확인하는 데도 쓴다 (403이면 운영자가 아님)
  stats: () => request('/admin/stats.php'),

  users: ({ page = 1, q = '', role = '', state = '' } = {}) => request(`/admin/users.php?${qs({ page, q, role, state })}`),
  user: (id) => request(`/admin/users.php?${qs({ id })}`),
  // 보낸 항목만 바뀐다 (요청서 4번)
  updateUser: (id, changes) => request(`/admin/users.php?${qs({ id })}`, { method: 'PATCH', body: changes }),
  deleteUser: (id) => request(`/admin/users.php?${qs({ id })}`, { method: 'DELETE' }),

  reported: ({ target = 'post', page = 1 } = {}) => request(`/admin/moderation.php?${qs({ target, page })}`),
  reportedDetail: (target, id) => request(`/admin/moderation.php?${qs({ target, id })}`),
  setHidden: (target, id, hidden) => request(`/admin/moderation.php?${qs({ target, id })}`, { method: 'PATCH', body: { hidden } }),

  // 공지사항 (요청서 6-1, backend/api/admin/notices.php). 목록은 초안까지, { notices, hasMore, audiences }
  notices: ({ page = 1 } = {}) => request(`/admin/notices.php?${qs({ page })}`),
  notice: (id) => request(`/admin/notices.php?${qs({ id })}`),
  // { title, body, pinned?, published?, audience? } → 201 { notice, message }
  createNotice: (fields) => request('/admin/notices.php', { method: 'POST', body: fields }),
  // 보낸 항목만 바뀐다 → { notice, message }
  updateNotice: (id, changes) => request(`/admin/notices.php?${qs({ id })}`, { method: 'PATCH', body: changes }),
  deleteNotice: (id) => request(`/admin/notices.php?${qs({ id })}`, { method: 'DELETE' }),

  // 운영 기준값 (요청서 5번, backend/api/admin/settings.php)
  settings: () => request('/admin/settings.php'),
  // { values: { name: 숫자 }, reset: [name] } → { settings, saved, errors, message }
  // 일부만 저장돼도(또는 하나도 저장되지 않아도) 200 이다 — saved·errors 로 판단한다
  saveSettings: ({ values = {}, reset = [] } = {}) => request('/admin/settings.php', { method: 'PUT', body: { values, reset } }),
}
