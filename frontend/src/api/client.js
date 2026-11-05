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
    if (err.name === 'AbortError') throw new Error('서버 응답이 너무 오래 걸립니다', { cause: err })
    // 개발 중에는 서버가 멀쩡해도 브라우저가 막아서 여기로 오는 경우가 있다 (페이지 주소가
    // backend/.env의 ALLOWED_ORIGINS에 없을 때). 원인을 찾느라 헤매지 않게 주소를 알려준다
    const crossOrigin = /^https?:\/\//.test(BASE) && !BASE.startsWith(window.location.origin)
    const hint = import.meta.env.DEV && crossOrigin
      ? ` (${BASE} 호출 실패 — 백엔드가 켜져 있는지, ALLOWED_ORIGINS에 ${window.location.origin} 주소가 있는지 확인해주세요)`
      : ''
    throw new Error('서버에 연결할 수 없습니다' + hint, { cause: err })
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

  // role: 'student' | 'teacher' | 'guardian'
  // 학생은 birth_year (만 14세 미만이면 보호자 동의 코드 발급), 선생님·보호자는 adult: true
  register: ({ username, email, password, role, birth_year, adult, affiliation }) =>
    request('/auth/register.php', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, role, birth_year, adult, affiliation }),
    }),

  me: () => request('/auth/me.php'),

  // 서버에서 토큰 무효화 (다른 기기에서 로그인한 것도 함께 로그아웃)
  logout: () => request('/auth/logout.php', { method: 'POST' }),

  updateSurvey: (level, tags) =>
    request('/auth/me.php', {
      method: 'PATCH',
      body: JSON.stringify({ level, tags }),
    }),

  /* ── 내 정보 ──────────────────────────────── */
  changeUsername: (username) =>
    request('/auth/account.php', { method: 'PATCH', body: JSON.stringify({ username }) }),

  // 선생님 전용: 소속(학교/학원 등) 바꾸기
  changeAffiliation: (affiliation) =>
    request('/auth/account.php', { method: 'PATCH', body: JSON.stringify({ affiliation }) }),

  // 성공하면 다른 기기 로그인은 끊기고 새 토큰을 받음
  changePassword: (current_password, new_password) =>
    request('/auth/account.php', { method: 'POST', body: JSON.stringify({ current_password, new_password }) }),

  deleteAccount: (password) =>
    request('/auth/account.php', { method: 'DELETE', body: JSON.stringify({ password }) }),

  /* ── 반 (선생님: 만들기·진도 보기 / 학생: 참여 코드로 들어가기) ── */
  classes: () => request('/classes/index.php'),

  createClass: (name) =>
    request('/classes/index.php', { method: 'POST', body: JSON.stringify({ name }) }),

  joinClass: (join_code) =>
    request('/classes/index.php', { method: 'POST', body: JSON.stringify({ join_code }) }),

  classDetail: (id) => request(`/classes/view.php?id=${encodeURIComponent(id)}`),

  updateClass: (id, data) =>
    request(`/classes/view.php?id=${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // 선생님: 반 삭제 / 학생: 반에서 나가기
  deleteClass: (id) =>
    request(`/classes/view.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  removeStudent: (classId, studentId) =>
    request(`/classes/view.php?id=${encodeURIComponent(classId)}&student_id=${encodeURIComponent(studentId)}`, { method: 'DELETE' }),

  // 선생님: 학생을 본인의 다른 반으로 이동
  moveStudent: (fromClassId, studentId, toClassId) =>
    request(`/classes/view.php?id=${encodeURIComponent(fromClassId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ move_student_id: studentId, move_to_class_id: toClassId }),
    }),

  /* ── 보호자 ────────────────────────────────── */
  children: () => request('/guardian/children.php'),

  // agree 없이 보내면 어떤 아이인지 확인만, agree: true면 동의 + 연결
  consentChild: (code, agree = false) =>
    request('/guardian/children.php', { method: 'POST', body: JSON.stringify({ code, agree }) }),

  unlinkChild: (studentId) =>
    request(`/guardian/children.php?student_id=${encodeURIComponent(studentId)}`, { method: 'DELETE' }),

  /* ── Chapters ──────────────────────────────── */
  chapters: () => request('/chapters/index.php'),

  // 정답 제출: 서버가 제출한 코드를 다시 채점해서 기록 (도전 횟수·최고 점수) → { passed, score, ... }
  // 통과면 완료 처리 + 보상 아이템 + 다음 챕터 잠금 해제 + 포트폴리오 자동 저장
  submitChapter: (chapterId, { title, blocks_data, thumbnail }) =>
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

  // 비밀번호 찾기: 메일로 재설정 링크 받기 → 링크의 토큰으로 새 비밀번호 설정
  requestPasswordReset: (email) =>
    request('/auth/password_reset.php', { method: 'POST', body: JSON.stringify({ email }) }),

  resetPassword: (token, new_password) =>
    request('/auth/password_reset.php', { method: 'POST', body: JSON.stringify({ token, new_password }) }),

  /* ── 전체 검색 ─────────────────────────────── */
  search: (q) => request(`/search/index.php?q=${encodeURIComponent(q)}`),

  /* ── 과제 (선생님이 반에 내주는 챕터) ───────── */
  assignments: (classId) =>
    request(`/classes/assignments.php${classId ? `?class_id=${encodeURIComponent(classId)}` : ''}`),

  createAssignment: (data) =>
    request('/classes/assignments.php', { method: 'POST', body: JSON.stringify(data) }),

  deleteAssignment: (id) =>
    request(`/classes/assignments.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  /* ── 좋아요 · 인기 작품 ─────────────────────── */
  likeProject: (id) => request('/projects/like.php', { method: 'POST', body: JSON.stringify({ id }) }),

  popularProjects: (page = 1) => request(`/projects/index.php?public=1&sort=popular&page=${page}`),

  /* ── 프로필 · 팔로우 · 랭킹 ─────────────────── */
  profile: (id) => request(`/social/profile.php${id ? `?id=${encodeURIComponent(id)}` : ''}`),

  updateProfile: (data) => request('/social/profile.php', { method: 'PATCH', body: JSON.stringify(data) }),

  followUser: (id) => request('/social/profile.php', { method: 'POST', body: JSON.stringify({ follow: id }) }),

  unfollowUser: (id) => request('/social/profile.php', { method: 'POST', body: JSON.stringify({ unfollow: id }) }),

  ranking: (scope = 'all') => request(`/social/ranking.php?scope=${encodeURIComponent(scope)}`),

  /* ── 토론 게시판 ────────────────────────────── */
  boardList: (page = 1) => request(`/board/index.php?page=${page}`),

  boardPost: (id) => request(`/board/index.php?id=${encodeURIComponent(id)}`),

  createBoardPost: (title, body) => request('/board/index.php', { method: 'POST', body: JSON.stringify({ title, body }) }),

  updateBoardPost: (id, title, body) =>
    request(`/board/index.php?id=${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ title, body }) }),

  deleteBoardPost: (id) => request(`/board/index.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  addBoardComment: (post_id, body) => request('/board/index.php', { method: 'POST', body: JSON.stringify({ post_id, body }) }),

  deleteBoardComment: (id) => request(`/board/index.php?comment_id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  reportBoardPost: (report_id, reason) => request('/board/index.php', { method: 'POST', body: JSON.stringify({ report_id, reason }) }),

  /* ── 과제 (추가) ───────────────────────────── */
  assignmentDetail: (id) => request(`/classes/assignments.php?id=${encodeURIComponent(id)}`),

  updateAssignment: (id, data) =>
    request(`/classes/assignments.php?id=${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),

  markAssignmentDone: (done_id, note) =>
    request('/classes/assignments.php', { method: 'POST', body: JSON.stringify({ done_id, note }) }),

  /* ── 출석 ──────────────────────────────────── */
  attendance: () => request('/attendance/index.php'),

  checkIn: () => request('/attendance/index.php', { method: 'POST' }),

  /* ── 상점 ──────────────────────────────────── */
  shop: () => request('/shop/index.php'),

  buyItem: (item) => request('/shop/index.php', { method: 'POST', body: JSON.stringify({ item }) }),

  /* ── Items (코코 꾸미기) ───────────────────── */
  items: () => request('/items/index.php'),

  equipItem: (id, equipped) =>
    request('/items/index.php', {
      method: 'PATCH',
      body: JSON.stringify({ id, equipped }),
    }),

  /* ── Topics ────────────────────────────────── */
  recommendations: () => request('/topics/recommend.php'),

  /* ── 코코 AI 대화 (Gemini, 서버에서 호출) ───── */
  // { enabled, remaining, limit }
  cocoStatus: () => request('/coco/chat.php'),

  // history: [{ role: 'user' | 'coco', text }], context: { chapter, code }
  askCoco: (message, history = [], context = {}) =>
    request('/coco/chat.php', {
      method: 'POST',
      body: JSON.stringify({ message, history, context }),
    }),
}
