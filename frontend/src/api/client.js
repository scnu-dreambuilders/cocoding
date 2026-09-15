// If VITE_API_URL isn't set at build time, assume the backend is reverse-
// proxied under /api on the same origin as the page (e.g. Apache serving
// both the static build and /api from one domain, no separate port).
const BASE = import.meta.env.VITE_API_URL ?? '/api'
const REQUEST_TIMEOUT_MS = 15000

async function request(path, options = {}) {
  const token = localStorage.getItem('cocooding_token')
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers ?? {}) },
      signal: controller.signal,
    })
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? '서버 응답이 너무 오래 걸립니다' : '서버에 연결할 수 없습니다', { cause: err })
  } finally {
    clearTimeout(timeoutId)
  }

  // 토큰이 만료되거나 로그아웃된 경우 → 앱에 알려서 로그인 화면으로 (App.jsx)
  if (res.status === 401 && token) {
    window.dispatchEvent(new Event('cocoding:unauthorized'))
  }

  let json
  try {
    json = await res.json()
  } catch {
    throw new Error(res.ok ? '서버 응답을 처리할 수 없습니다' : `서버 오류가 발생했습니다 (${res.status})`)
  }

  if (!json.success) throw new Error(json.error ?? '오류가 발생했습니다')
  return json.data
}

export const api = {
  /* ── Auth ──────────────────────────────────── */
  login: (email, password) =>
    request('/auth/login.php', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (username, email, password) =>
    request('/auth/register.php', {
      method: 'POST',
      body: JSON.stringify({ username, email, password }),
    }),

  me: () => request('/auth/me.php'),

  // 서버에서 토큰 무효화 (다른 기기에서 로그인한 것도 함께 로그아웃)
  logout: () => request('/auth/logout.php', { method: 'POST' }),

  updateSurvey: (level, tags) =>
    request('/auth/me.php', {
      method: 'PATCH',
      body: JSON.stringify({ level, tags }),
    }),

  /* ── Chapters ──────────────────────────────── */
  chapters: () => request('/chapters/index.php'),

  // 미션 통과 → 완료 처리 + 보상 아이템 + 다음 챕터 잠금 해제 + 포트폴리오 자동 저장
  completeChapter: (chapterId, { title, blocks_data, thumbnail }) =>
    request('/chapters/progress.php', {
      method: 'POST',
      body: JSON.stringify({ chapter_id: chapterId, title, blocks_data, thumbnail }),
    }),

  /* ── Projects ──────────────────────────────── */
  myProjects: () => request('/projects/index.php'),

  publicProjects: (page = 1) => request(`/projects/index.php?public=1&page=${page}`),

  createProject: (data) =>
    request('/projects/index.php', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  remakeProject: (originalId) =>
    request('/projects/index.php', {
      method: 'POST',
      body: JSON.stringify({ remake_of: originalId }),
    }),

  getProject: (id) => request(`/projects/view.php?id=${encodeURIComponent(id)}`),

  updateProject: (id, data) =>
    request(`/projects/view.php?id=${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteProject: (id) =>
    request(`/projects/view.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  reportProject: (id, reason) =>
    request('/projects/report.php', {
      method: 'POST',
      body: JSON.stringify({ id, reason }),
    }),

  /* ── Items (코코 꾸미기) ───────────────────── */
  items: () => request('/items/index.php'),

  equipItem: (id, equipped) =>
    request('/items/index.php', {
      method: 'PATCH',
      body: JSON.stringify({ id, equipped }),
    }),

  /* ── Topics ────────────────────────────────── */
  recommendations: () => request('/topics/recommend.php'),
}
