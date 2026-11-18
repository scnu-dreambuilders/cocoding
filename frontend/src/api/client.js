// If VITE_API_URL isn't set at build time, assume the backend is reverse-
// proxied under /api on the same origin as the page (e.g. Apache serving
// both the static build and /api from one domain, no separate port).
const BASE = import.meta.env.VITE_API_URL ?? '/api'
const REQUEST_TIMEOUT_MS = 15000

// 던지는 오류에 원인 정보만 덧붙인다 (메시지는 그대로라 기존 catch의 e.message 처리는 바뀌지 않는다)
//  kind: 'timeout' | 'network' | 'parse'(JSON이 아님) | 'api'(서버가 success:false JSON으로 거절)
//        | 'unsupported'(서버에 아직 없는 기능 — 요청을 보내지 않음, 코딩 게시판의 BOARD_SERVER 참고)
//  status: HTTP 상태 코드 (응답을 받은 경우만)
function requestError(message, kind, status, cause) {
  const err = new Error(message, cause ? { cause } : undefined)
  err.kind = kind
  if (status !== undefined) err.status = status
  return err
}

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
    if (err.name === 'AbortError') throw requestError('서버 응답이 너무 오래 걸립니다', 'timeout', undefined, err)
    // 개발 중에는 서버가 멀쩡해도 브라우저가 막아서 여기로 오는 경우가 있다 (페이지 주소가
    // backend/.env의 ALLOWED_ORIGINS에 없을 때). 원인을 찾느라 헤매지 않게 주소를 알려준다
    const crossOrigin = /^https?:\/\//.test(BASE) && !BASE.startsWith(window.location.origin)
    const hint = import.meta.env.DEV && crossOrigin
      ? ` (${BASE} 호출 실패 — 백엔드가 켜져 있는지, ALLOWED_ORIGINS에 ${window.location.origin} 주소가 있는지 확인해주세요)`
      : ''
    throw requestError('서버에 연결할 수 없습니다' + hint, 'network', undefined, err)
  } finally {
    clearTimeout(timeoutId)
  }

  // 토큰이 만료되거나 로그아웃된 경우 → 앱에 알려서 로그인 화면으로 (App.jsx)
  // 단, 이 요청을 보낼 때 쓴 토큰이 지금도 저장된 토큰일 때만. 이미 로그아웃했거나 다른 토큰으로
  // 다시 로그인했다면 이전 요청의 401이 지금 세션을 정리하지 않는다 (오류는 아래에서 그대로 호출자에게 간다)
  const currentToken = localStorage.getItem('cocooding_token')
  if (res.status === 401 && token && currentToken && currentToken === token) {
    window.dispatchEvent(new Event('cocoding:unauthorized'))
  }

  let json
  try {
    json = await res.json()
  } catch {
    throw requestError(res.ok ? '서버 응답을 처리할 수 없습니다' : `서버 오류가 발생했습니다 (${res.status})`, 'parse', res.status)
  }

  if (!json.success) throw requestError(json.error ?? '오류가 발생했습니다', 'api', res.status)
  return json.data
}

/* 코딩 게시판의 질문·검색·채택 연결 스위치.
   백엔드는 구현됨(board/index.php — 커밋 dde5364): 요청 형식(kind·chapter·blocks·status·q·accept_answer_id)과
   응답 필드(posts·hasMore, post.kind·status·chapter·blocks·is_mine, comments[].accepted)가 이 파일·화면과 맞는다.
   그래도 아직 false로 둔다. 대상 서버의 DB가 2026-11-19 스키마로 올라갔는지(첫 API 요청 때 SchemaUpgrader가
   자동 적용) 확인하고, 실제 서버 통합 QA(질문 등록·검색·필터·채택)를 통과한 기능부터 하나씩 true로 바꾼다.
   값을 켜는 것만으로 연동이 끝나지 않는다: ① 합의 ② 백엔드 구현·배포 확인 ③ 요청·응답 처리 조정
   ④ 준비된 기능별로 활성화 ⑤ 실제 서버 통합 QA — 지금은 ①②③까지 끝난 상태다 */
export const BOARD_SERVER = { questions: false, search: false, accept: false }

// 질문 작성·수정 요청의 챕터: 폼의 '선택 안 함'('')은 null, 챕터 '1'~'5'와 'free'는 그대로 보낸다.
// 목록 필터의 'none'(챕터를 고르지 않은 질문만 조회)과는 뜻이 다르므로 boardList에서는 쓰지 않는다
const questionChapterForRequest = (chapter) => (chapter === '' || chapter == null ? null : chapter)

// 서버에 연결되지 않은 기능: 요청을 보내지 않고 바로 거절한다 (화면은 kind로 '연결 전' 안내를 구분)
const unsupported = (message) => Promise.reject(requestError(message, 'unsupported'))

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

  /* ── 코딩 게시판 (토론 + 질문) ──────────────────
     지금 연결됨: 토론 목록·상세·쓰기·고치기·지우기·댓글·신고.
     백엔드는 있지만 아직 끔: 질문 구분·챕터·블록 태그·해결 상태·채택·검색·필터 → BOARD_SERVER 참고.
     꺼져 있는 기능은 요청을 보내지 않고 kind: 'unsupported' 오류로 거절한다 (성공한 척하지 않음). */
  // query: { kind: 'all'|'question'|'discussion', q, chapter, block, status: 'all'|'open'|'solved' }
  boardList: (page = 1, query = {}) => {
    const { kind = 'all', q = '', chapter = '', block = '', status = 'all' } = query
    const questionOnly = kind === 'question' || chapter !== '' || block !== '' || status !== 'all'
    if (q && !BOARD_SERVER.search) return unsupported('검색은 아직 서버에 연결되지 않았어요.')
    if (questionOnly && !BOARD_SERVER.questions) return unsupported('질문 목록은 아직 서버에 연결되지 않았어요.')
    const params = new URLSearchParams({ page: String(page) })
    if (BOARD_SERVER.questions) {
      if (kind !== 'all') params.set('kind', kind)
      // 목록 필터의 챕터: ''(전체 챕터)는 조건을 보내지 않고, '1'~'5'·'free'·'none'(챕터 미선택 질문)은 그대로
      if (chapter) params.set('chapter', chapter)
      if (block) params.set('block', block)
      if (status !== 'all') params.set('status', status)
    }
    if (q) params.set('q', q)
    return request(`/board/index.php?${params}`)
  },

  boardPost: (id) => request(`/board/index.php?id=${encodeURIComponent(id)}`),

  // question: 질문으로 올릴 때만 { chapter, blocks } — 토론은 지금 서버 형식({ title, body }) 그대로 보낸다
  createBoardPost: (title, body, question) => {
    if (question && !BOARD_SERVER.questions) return unsupported('질문 등록은 아직 서버에 연결되지 않았어요.')
    const payload = question
      ? { kind: 'question', title, body, chapter: questionChapterForRequest(question.chapter), blocks: question.blocks }
      : { title, body }
    return request('/board/index.php', { method: 'POST', body: JSON.stringify(payload) })
  },

  // question: 질문 글을 고칠 때만 { chapter, blocks } (글 종류는 바꾸지 않는다)
  updateBoardPost: (id, title, body, question) => {
    if (question && !BOARD_SERVER.questions) return unsupported('질문 고치기는 아직 서버에 연결되지 않았어요.')
    const payload = question
      ? { title, body, chapter: questionChapterForRequest(question.chapter), blocks: question.blocks }
      : { title, body }
    return request(`/board/index.php?id=${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(payload) })
  },

  // 질문 작성자의 답변 채택(answerId) · 채택 취소(null) — 규칙과 형식은 백엔드와 합의 전
  acceptBoardAnswer: (postId, answerId) => {
    if (!BOARD_SERVER.accept) return unsupported('답변 채택은 아직 서버에 연결되지 않았어요.')
    return request(`/board/index.php?id=${encodeURIComponent(postId)}`, {
      method: 'PUT', body: JSON.stringify({ accept_answer_id: answerId }),
    })
  },

  deleteBoardPost: (id) => request(`/board/index.php?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  addBoardComment: (post_id, body) => request('/board/index.php', { method: 'POST', body: JSON.stringify({ post_id, body }) }),

  deleteBoardComment: (id) => request(`/board/index.php?comment_id=${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // 현재 게시글 신고 API가 구현되어 있다 (3명이면 자동 숨김 — 지금 서버 정책 그대로).
  // 질문 게시글에도 같은 정책을 적용하는 것은 백엔드 통합 시 반영할 사항이다.
  // 답변·댓글 신고는 별도 합의가 필요하다 (지금은 화면 버튼도 API도 없다)
  reportBoardPost: (report_id, reason) => request('/board/index.php', { method: 'POST', body: JSON.stringify({ report_id, reason }) }),

  /* ── 게임존 코인 보상 (games/reward.php) ──────────
     로그인한 사용자만. 같은 단계는 하루 한 번 (타자: 단계·세트별, 퀴즈: 단계·first/retry별), 경험치는 오르지 않는다.
     GET  → { balance, claimed: ['typing:word:0', ...], reward: { typing, quiz } }  (정답 1개당 코인)
     POST → { awarded, already, balance, message }
       타자 { game: 'typing', stage: 'word'|'block', set: 0|1, correct: 0~5 }
       퀴즈 { game: 'quiz', stage: '1'~'5'|'review', round: 'first'|'retry', correct: 0~5 } */
  gameRewards: () => request('/games/reward.php'),

  claimGameReward: (payload) => request('/games/reward.php', { method: 'POST', body: JSON.stringify(payload) }),

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
