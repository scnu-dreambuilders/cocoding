/* ════════════════════════════════════════════════
   개발 전용 모의 관리자 API — `npm run dev` + VITE_ADMIN_MOCK=true 일 때만 불러온다 (client.js USE_MOCK).
   운영 빌드에는 들어가지 않는다. 실제 서버로 아무것도 보내지 않고, 모든 데이터는 이 탭의 메모리에만 있다.

   origin/backend 의 backend/api/admin/*.php · Auth.php · auth/login.php 를 읽고 확인한 검증 순서·문장·상태 코드를
   흉내 낸다. 서버 구현을 그대로 옮긴 것은 아니며, 실제 응답으로 확인한 것도 아니다.
   실제 서버와 다르게 일부러 편하게 만든 부분은 README '모의 모드와 실제 서버의 차이'에 적어 두었다.

   모의 로그인 계정 (비밀번호는 아무 글자나)
     admin@mock.test      운영자
     teacher@mock.test    운영자가 아닌 선생님 → 권한 없음(403) 화면
     suspended@mock.test  정지된 운영자 → 로그인은 되고, 관리자 API 에서 403 + 정지 사유

   개발자 도구 콘솔에서 쓰는 조작 (모의 모드에서만 있음)
     __adminMock.fail('/admin/users.php', 500)                 다음 한 번만 그 상태 코드로 실패 (JSON)
     __adminMock.fail('/admin/stats.php', 502, '', { html: true })  다음 한 번만 HTML 오류 페이지로 실패
     __adminMock.delay = 1500                                   응답 지연(ms)
     __adminMock.serverToday = '2026-11-18'                     stats 의 today 를 이 날짜로 바꿔 보냄 (기본은 이 PC 의 오늘)
     __adminMock.legacyStats = true                             옛 서버처럼 today 없이, 가입자가 있는 날만 보냄 (화면의 대체 기준 확인용)
     __adminMock.extraSignups = [{ day: '2030-01-01', count: 5 }]  signups7d 에 범위 밖 줄 추가
     __adminMock.nextDelays = [1500, 50]                        다음 요청들의 지연을 차례로 지정 (늦은 응답 확인용)
     __adminMock.rejectSettings = ['coin.chapter']              기준값 저장 때 그 항목을 거절 ('*' 이면 전부) — 일부/전체 실패 확인용
   ════════════════════════════════════════════════ */

export const MOCK_LOGIN_HINT = [
  { email: 'admin@mock.test', label: '운영자 계정' },
  { email: 'teacher@mock.test', label: '운영자가 아닌 계정 (권한 없음 확인)' },
  { email: 'suspended@mock.test', label: '정지된 운영자 (로그인 뒤 403 확인)' },
]

const PAGE_SIZE = 20
const HIDE_COUNT = 3
const pad = (n) => String(n).padStart(2, '0')
// 모의 '서버 시각'은 이 PC 시계를 쓴다 (실제 서버 시간대는 미확인)
const day = (offset) => {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const ts = (offset, hh = 10) => `${day(offset)} ${pad(hh)}:${pad((offset * 7) % 60)}:00`
// 최근 7일 중 2일 전·5일 전에는 가입자가 없게 한다 → 서버처럼 그 날을 빼고 보내서 화면의 0 채우기를 확인
const SIGNUP_OFFSETS = [0, 1, 3, 4, 6, 8, 10, 11]

/* ── 모의 데이터 (탭을 새로 열면 처음으로 돌아간다) ── */
function seedUsers() {
  const list = [
    { id: 1, username: '모의운영자', email: 'admin@mock.test', role: 'teacher', level: 1, xp: 0, coins: 0, is_admin: true, affiliation: '코코딩 운영팀', consent_status: 'not_required', created_at: ts(40) },
    { id: 2, username: '모의선생님', email: 'teacher@mock.test', role: 'teacher', level: 2, xp: 40, coins: 15, is_admin: false, affiliation: '모의초등학교', consent_status: 'not_required', created_at: ts(30) },
    { id: 3, username: '모의보호자', email: 'parent@mock.test', role: 'guardian', level: 1, xp: 0, coins: 0, is_admin: false, affiliation: null, consent_status: 'not_required', created_at: ts(20) },
    { id: 4, username: '정지된운영자', email: 'suspended@mock.test', role: 'teacher', level: 1, xp: 0, coins: 0, is_admin: true, affiliation: null, consent_status: 'not_required', created_at: ts(25), suspended: true, suspended_reason: '모의 정지 사유' },
  ]
  for (let i = 1; i <= 44; i++) {
    const pending = i % 9 === 0
    list.push({
      id: 4 + i, username: `모의학생${pad(i)}`, email: `student${pad(i)}@mock.test`, role: 'student',
      level: (i % 3) + 1, xp: (i * 37) % 900, coins: (i * 23) % 400, is_admin: false, affiliation: null,
      consent_status: pending ? 'pending' : i % 4 === 0 ? 'granted' : 'not_required',
      created_at: ts(SIGNUP_OFFSETS[i % SIGNUP_OFFSETS.length], 9 + (i % 8)),
    })
  }
  list[10].suspended = true
  list[10].suspended_reason = '다른 친구에게 나쁜 말을 했어요 (모의)'
  return list.map((u) => ({
    suspended: false, suspended_reason: null, birth_year: u.role === 'student' ? 2015 : 1990,
    bio: u.role === 'student' ? '코딩 좋아요 (모의)' : null, profile_visibility: 'public',
    consent_code: u.consent_status === 'pending' ? 'MOCK1234' : null, consent_at: null, updated_at: u.created_at,
    ...u,
  }))
}

function seedReports() {
  const posts = [
    { id: 101, title: '게임 같이 만들 사람 (모의)', kind: 'discussion', hidden: false, reports: 2, user: 9 },
    { id: 102, title: '광고 글 (모의)', kind: 'discussion', hidden: true, reports: 3, user: 10 },
    { id: 103, title: '벽에 닿아도 안 튕겨요 (모의)', kind: 'question', hidden: false, reports: 1, user: 11 },
    { id: 104, title: '숨겼다가 확인할 글 (모의)', kind: 'discussion', hidden: true, reports: 1, user: 12 },
  ]
  const projects = [
    { id: 201, title: '우주 게임 (모의)', is_public: true, hidden: false, reports: 2, user: 13 },
    { id: 202, title: '개인정보가 보이는 작품 (모의)', is_public: true, hidden: true, reports: 3, user: 14 },
  ]
  const reasons = ['나쁜 말이나 그림', '개인정보(얼굴·이름·전화번호)가 있어요', '광고·도배', '기타']
  const withReasons = (it, i) => ({
    ...it, created_at: ts(i + 1),
    reasonList: Array.from({ length: it.reports }, (_, k) => ({ reason: reasons[(i + k) % reasons.length], created_at: ts(i, 11 + k) })),
  })
  return { post: posts.map(withReasons), project: projects.map(withReasons) }
}

// 공지 — notices 표 흉내. 23개라 목록이 두 쪽이 된다
function seedNotices() {
  const audiences = ['all', 'student', 'teacher', 'guardian']
  return Array.from({ length: 23 }, (_, k) => {
    const i = k + 1
    return {
      id: i, title: `모의 공지 ${pad(i)}${i === 21 ? ' — 고정' : ''}`,
      body: `모의 공지 ${i}번 내용이에요.\n두 번째 줄이에요.`,
      pinned: i === 21 || i === 3, published: i % 5 !== 0, audience: audiences[i % 4],
      created_by: 1, created_at: ts(30 - i, 9), updated_at: ts(30 - i, 9),
    }
  })
}

// 운영 기준값 — backend/config/Settings.php 의 SPEC·DEFAULTS 를 모의 데이터로 옮겨 둔 것 (화면은 이 목록을 응답으로만 받는다)
const SETTING_SPEC = [
  ['coin.attendance', '코인', '출석 코인', '하루 한 번 출석 도장을 찍을 때 주는 코인이에요.', 0, 1000, 10],
  ['coin.attendance_streak', '코인', '연속 출석 보너스', '연속으로 출석한 하루마다 더 주는 코인이에요 (7일째까지만 늘어나요).', 0, 1000, 5],
  ['coin.chapter', '코인', '챕터 첫 완료 코인', '챕터를 처음 끝냈을 때 한 번만 주는 코인이에요.', 0, 1000, 50],
  ['coin.project', '코인', '자유 창작 첫 저장 코인', '자유 창작 작품을 처음 저장했을 때 주는 코인이에요.', 0, 1000, 5],
  ['coin.game.typing', '코인', '타자게임 정답 코인', '타자게임에서 한 문제 맞힐 때마다 주는 코인이에요. 같은 단계는 하루 한 번만 받아요.', 0, 100, 2],
  ['coin.game.quiz', '코인', '복습 퀴즈 정답 코인', '복습 퀴즈에서 한 문제 맞힐 때마다 주는 코인이에요. 오답 재도전도 같아요.', 0, 100, 10],
  ['coco.daily_limit', '코코 대화', '하루 질문 횟수', '학생 한 명이 24시간 동안 코코에게 물어볼 수 있는 횟수예요.', 1, 500, 30],
  ['report.hide_count', '신고', '자동 숨김 신고 수', '서로 다른 이 인원이 신고하면 글·작품을 자동으로 숨겨요.', 1, 50, 3],
  ['board.post_cooldown', '게시판', '글쓰기 간격(초)', '도배를 막기 위해 글을 연달아 올릴 수 없는 시간이에요.', 0, 3600, 5],
].map(([name, group, label, help, min, max, def]) => ({ name, group, label, help, min, max, default: def }))

const db = { users: seedUsers(), reports: seedReports(), tokens: new Map(), notices: seedNotices(), settings: new Map([['coin.chapter', 70]]) }

/* ── 개발자 도구용 조작 (모의 모드에서만 존재) ── */
const control = { delay: 250, failures: [], serverToday: null, legacyStats: false, extraSignups: [], nextDelays: [], rejectSettings: [] }
if (typeof window !== 'undefined') {
  window.__adminMock = {
    get delay() { return control.delay },
    set delay(ms) { control.delay = Number(ms) || 0 },
    get serverToday() { return control.serverToday },
    set serverToday(v) { control.serverToday = v || null },
    get legacyStats() { return control.legacyStats },
    set legacyStats(v) { control.legacyStats = !!v },
    get extraSignups() { return control.extraSignups },
    set extraSignups(v) { control.extraSignups = Array.isArray(v) ? v : [] },
    get nextDelays() { return control.nextDelays },
    set nextDelays(v) { control.nextDelays = Array.isArray(v) ? v.map(Number) : [] },
    get rejectSettings() { return control.rejectSettings },
    set rejectSettings(v) { control.rejectSettings = Array.isArray(v) ? v.map(String) : [] },
    fail(pathPrefix, status = 500, message = '모의 오류가 났어요', { html = false } = {}) { control.failures.push({ pathPrefix, status, message, html }) },
  }
}

/* ── 응답 도우미 (실제 Response.php 모양: {success, data} / {success:false, error}) ── */
const respond = (status, payload) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
const ok = (data, status = 200) => respond(status, { success: true, data })
const fail = (status, error) => respond(status, { success: false, error })
const listUser = (u) => ({
  id: u.id, username: u.username, email: u.email, role: u.role, level: u.level, xp: u.xp, coins: u.coins,
  is_admin: u.is_admin, suspended: u.suspended, suspended_reason: u.suspended_reason,
  consent_status: u.consent_status, affiliation: u.affiliation, created_at: u.created_at,
})
const detailUser = (u) => ({
  ...listUser(u), birth_year: u.birth_year, bio: u.bio, profile_visibility: u.profile_visibility,
  consent_code: u.consent_code, consent_at: u.consent_at, updated_at: u.updated_at,
})
// 로그인 응답의 user (UserModel::findById 와 같은 항목 — is_admin 은 없다)
const loginUser = (u) => ({
  id: u.id, username: u.username, email: u.email, role: u.role, birth_year: u.birth_year, consent_status: u.consent_status,
  consent_code: u.consent_code, affiliation: u.affiliation, level: u.level, tags: null, coins: u.coins, xp: u.xp,
  bio: u.bio, profile_visibility: u.profile_visibility, created_at: u.created_at,
})
// 받은 신고는 실제처럼 게시글 신고만 센다
const summaryOf = (u) => {
  const posts = db.reports.post.filter((p) => p.user === u.id)
  const projects = db.reports.project.filter((p) => p.user === u.id)
  return {
    projects: (u.id * 3) % 9, publicProjects: (u.id * 2) % 5, hiddenProjects: projects.filter((p) => p.hidden).length,
    chaptersDone: u.role === 'student' ? u.id % 6 : 0, posts: posts.length + (u.id % 3), hiddenPosts: posts.filter((p) => p.hidden).length,
    comments: (u.id * 5) % 13, reportsReceived: posts.reduce((n, p) => n + p.reports, 0), reportsMade: u.id % 2,
    coinsEarned: u.coins + (u.id % 5) * 20, coinsSpent: (u.id % 5) * 20,
  }
}
const adminCount = () => db.users.filter((u) => u.is_admin).length // stats.admins — 정지된 운영자도 센다
// usableAdminCount — 지금 관리자 웹에 들어올 수 있는 운영자 (정지되지 않은 운영자)
const usableAdminCount = () => db.users.filter((u) => u.is_admin && !u.suspended).length
// Auth::revoke — 그 계정의 모든 토큰을 끊는다
const revoke = (userId) => { for (const [t, id] of db.tokens) if (id === userId) db.tokens.delete(t) }
const intId = (v) => (/^\d+$/.test(String(v ?? '')) && Number(v) > 0 ? Number(v) : 0)

// 실제와 같은 글자 모음(0 O 1 l I o 제외)으로 10자 + '!' — 매번 새로 만든다 (고정값 없음)
function tempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint8Array(10)
  crypto.getRandomValues(bytes)
  return `${Array.from(bytes, (b) => chars[b % chars.length]).join('')}!`
}

function statsPayload() {
  const users = db.users
  const today = day(0)
  const byRole = users.reduce((m, u) => ({ ...m, [u.role]: (m[u.role] ?? 0) + 1 }), {})
  // 지금 서버처럼 today 와, 가입이 없던 날도 0 으로 채운 7칸을 보낸다 (legacyStats 면 옛 서버처럼 빈 날을 뺀다)
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = day(6 - i)
    return { day: d, count: users.filter((u) => u.created_at.startsWith(d)).length }
  })
  const signups7d = (control.legacyStats ? week.filter((r) => r.count > 0) : week).concat(control.extraSignups)
  const posts = db.reports.post
  const projects = db.reports.project
  const payload = {
    users: {
      total: users.length, byRole, admins: adminCount(), suspended: users.filter((u) => u.suspended).length,
      consentPending: users.filter((u) => u.consent_status === 'pending').length,
      newToday: users.filter((u) => u.created_at.startsWith(today)).length, activeWeek: 17,
    },
    signups7d,
    learning: { chaptersDone: 83, projects: 120, publicProjects: 44 },
    board: { posts: 31, questions: 12, solved: 7, comments: 58 },
    moderation: {
      hiddenPosts: posts.filter((p) => p.hidden).length,
      hiddenProjects: projects.filter((p) => p.hidden).length,
      openPostReports: posts.filter((p) => !p.hidden && p.reports > 0).length,
    },
    coins: { granted: 4210, spent: 1800, held: users.reduce((n, u) => n + u.coins, 0) },
  }
  if (!control.legacyStats) payload.today = control.serverToday || today
  return payload
}

/* ── 회원 PATCH — users.php 의 검사 순서와 문장 ── */
function patchUser(adminId, target, body) {
  const data = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const has = (k) => Object.prototype.hasOwnProperty.call(data, k)
  const changes = {}

  if (has('role')) {
    if (!['student', 'teacher', 'guardian'].includes(data.role)) return fail(400, '계정 유형을 다시 골라주세요.')
    changes.role = data.role
  }
  // 이 회원이 지금 관리자 웹에 들어올 수 있는 운영자인지 (마지막 한 명이면 권한 빼기·정지를 막는다)
  const targetUsable = !!target.is_admin && !target.suspended
  if (has('is_admin')) {
    if (typeof data.is_admin !== 'boolean') return fail(400, '운영자 권한은 true/false 로 보내주세요.')
    if (data.is_admin === false) {
      if (target.id === adminId) return fail(400, '자기 운영자 권한은 뺄 수 없어요. 다른 운영자에게 부탁해주세요.')
      if (targetUsable && usableAdminCount() <= 1) return fail(400, '지금 들어올 수 있는 운영자가 이분뿐이라 권한을 뺄 수 없어요. 다른 분을 먼저 운영자로 지정해주세요.')
    }
    changes.is_admin = data.is_admin
  }
  if (has('suspended')) {
    if (typeof data.suspended !== 'boolean') return fail(400, '정지 여부는 true/false 로 보내주세요.')
    if (data.suspended && target.id === adminId) return fail(400, '자기 계정은 정지할 수 없어요.')
    if (data.suspended && targetUsable && usableAdminCount() <= 1) return fail(400, '지금 들어올 수 있는 운영자가 이분뿐이라 정지할 수 없어요. 다른 분을 먼저 운영자로 지정해주세요.')
    changes.suspended = data.suspended
    if (!data.suspended) changes.suspended_reason = null // 정지를 풀면 사유도 지운다
  }
  if (has('suspended_reason') && !('suspended_reason' in changes)) {
    const reason = typeof data.suspended_reason === 'string' ? data.suspended_reason.trim() : ''
    if ([...reason].length > 100) return fail(400, '정지 사유는 100자까지 쓸 수 있어요.')
    changes.suspended_reason = reason === '' ? null : reason
  }
  if (has('consent')) {
    if (data.consent !== 'granted') return fail(400, '보호자 동의는 granted 로만 바꿀 수 있어요.')
    if (target.consent_status !== 'pending') return fail(400, '보호자 동의를 기다리는 계정이 아니에요.')
    changes.consent_status = 'granted'
  }
  if (has('email')) {
    const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || new TextEncoder().encode(email).length > 100) return fail(400, '올바른 이메일 형식이 아니에요.')
    if (db.users.some((u) => u.id !== target.id && u.email === email)) return fail(409, '다른 회원이 쓰고 있는 이메일이에요.')
    changes.email = email
  }
  const forceLogout = !!data.force_logout
  const deltas = { coins_delta: 0, xp_delta: 0 }
  for (const key of Object.keys(deltas)) {
    if (!has(key)) continue
    const v = data[key]
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
    if (typeof v === 'boolean' || !Number.isFinite(n) || !Number.isInteger(n)) return fail(400, `${key} 는 정수로 보내주세요. (더하려면 10, 빼려면 -10)`)
    if (n === 0) continue
    if (Math.abs(n) > 1000000) return fail(400, `${key} 가 너무 커요.`)
    deltas[key] = n
  }
  const resetPassword = !!data.reset_password
  if (!Object.keys(changes).length && !forceLogout && !deltas.coins_delta && !deltas.xp_delta && !resetPassword) {
    return fail(400, '바꿀 내용이 없어요.')
  }

  Object.assign(target, changes)
  if (changes.consent_status === 'granted') { target.consent_code = null; target.consent_at = ts(0, new Date().getHours()) }
  target.coins = Math.max(0, target.coins + deltas.coins_delta)
  target.xp = Math.max(0, target.xp + deltas.xp_delta)
  target.updated_at = ts(0, new Date().getHours())
  const temp = resetPassword ? tempPassword() : null

  const needLogout = forceLogout || resetPassword || changes.suspended === true || changes.is_admin === false
    || 'role' in changes || 'email' in changes
  if (needLogout) revoke(target.id)

  const payload = {
    user: detailUser(target), summary: summaryOf(target),
    message: `회원 정보를 바꿨어요.${needLogout ? ' 이 회원은 다시 로그인해야 해요.' : ''}`,
  }
  if (temp) {
    payload.tempPassword = temp
    payload.message = '임시 비밀번호를 만들었어요. 이 화면을 닫으면 다시 볼 수 없어요.'
  }
  return ok(payload)
}

/* ── 라우터 ── */
function route(path, init) {
  const url = new URL(path, 'http://mock.local')
  const p = url.pathname
  const q = url.searchParams
  const method = (init?.method ?? 'GET').toUpperCase()
  let body = null
  try { body = init?.body ? JSON.parse(init.body) : null } catch { body = null }

  if (p === '/auth/login.php') {
    if (method !== 'POST') return fail(405, '잘못된 요청 방식입니다.')
    // 실제처럼 정지 여부는 로그인에서 막지 않는다 (막는 곳은 Auth::requireUser)
    const user = db.users.find((u) => u.email === String(body?.email ?? '').trim().toLowerCase())
    if (!user || !body?.password) return fail(401, '이메일 또는 비밀번호가 올바르지 않습니다.')
    const token = `mock-${crypto.getRandomValues(new Uint32Array(2)).join('')}`
    db.tokens.set(token, user.id)
    return ok({ token, user: loginUser(user) })
  }

  const auth = (init?.headers?.Authorization ?? '').replace(/^Bearer /, '')
  const me = db.users.find((u) => u.id === db.tokens.get(auth))

  if (p === '/auth/logout.php') {
    if (method !== 'POST') return fail(405, '잘못된 요청 방식입니다.')
    if (me) revoke(me.id) // 실제처럼 이 계정의 모든 토큰을 끊는다
    return ok({ message: '로그아웃되었습니다.' })
  }

  // Auth::requireAdmin = requireUser(401 / 정지면 403) + 운영자 확인(403)
  if (!me) return fail(401, '로그인이 필요합니다.')
  if (me.suspended) {
    const reason = String(me.suspended_reason ?? '').trim()
    return fail(403, reason ? `이 계정은 지금 쓸 수 없어요. (${reason}) 선생님이나 보호자에게 물어봐 주세요.` : '이 계정은 지금 쓸 수 없어요. 선생님이나 보호자에게 물어봐 주세요.')
  }
  if (!me.is_admin) return fail(403, '관리자만 쓸 수 있는 기능이에요.')

  if (p === '/admin/stats.php') {
    if (method !== 'GET') return fail(405, '잘못된 요청 방식입니다.')
    return ok(statsPayload())
  }

  if (p === '/admin/users.php') {
    const id = intId(q.get('id'))
    if (method === 'GET') {
      if (id) {
        const target = db.users.find((u) => u.id === id)
        if (!target) return fail(404, '그런 회원이 없어요.')
        return ok({ user: detailUser(target), summary: summaryOf(target) })
      }
      const page = Math.min(500, Math.max(1, Number.parseInt(q.get('page') ?? '1', 10) || 1))
      const text = (q.get('q') ?? '').trim().toLowerCase()
      const role = q.get('role') ?? ''
      const state = q.get('state') ?? ''
      let list = [...db.users].sort((a, b) => b.id - a.id)
      if (text) list = list.filter((u) => u.username.toLowerCase().includes(text) || u.email.includes(text))
      if (['student', 'teacher', 'guardian'].includes(role)) list = list.filter((u) => u.role === role)
      if (state === 'suspended') list = list.filter((u) => u.suspended)
      else if (state === 'admin') list = list.filter((u) => u.is_admin)
      else if (state === 'pending') list = list.filter((u) => u.consent_status === 'pending')
      const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      return ok({ users: slice.map(listUser), hasMore: page * PAGE_SIZE < list.length, total: list.length })
    }
    if (method !== 'PATCH' && method !== 'DELETE') return fail(405, '잘못된 요청 방식입니다.')
    if (!id) return fail(400, '어떤 회원인지 알려주세요.')
    const target = db.users.find((u) => u.id === id)
    if (!target) return fail(404, '그런 회원이 없어요.')
    if (method === 'DELETE') {
      if (target.id === me.id) return fail(400, '자기 계정은 여기서 지울 수 없어요. 내 정보 화면에서 해주세요.')
      if (target.is_admin) return fail(400, '운영자 권한을 먼저 빼고 지워주세요.')
      // 스키마의 연쇄 삭제처럼 이 회원의 글·작품(과 그 신고)도 지운다
      db.users = db.users.filter((u) => u.id !== id)
      db.reports.post = db.reports.post.filter((it) => it.user !== id)
      db.reports.project = db.reports.project.filter((it) => it.user !== id)
      revoke(id)
      return ok({ message: '회원을 지웠어요.' })
    }
    return patchUser(me.id, target, body)
  }

  if (p === '/admin/moderation.php') {
    const target = q.get('target') ?? 'post'
    if (!['post', 'project'].includes(target)) return fail(400, 'post 또는 project 중에 골라주세요.')
    const items = db.reports[target]
    const id = intId(q.get('id'))
    if (method === 'GET') {
      if (id) {
        const item = items.find((it) => it.id === id)
        if (!item) return fail(404, '그런 글이 없어요.')
        const author = db.users.find((u) => u.id === item.user)
        // 실제처럼 신고 이유는 최신순
        const reasons = [...item.reasonList].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        const base = { target, id, reasons }
        if (target === 'post') {
          return ok({
            ...base,
            post: { id: item.id, kind: item.kind, title: item.title, body: `${item.title}의 본문이에요. (모의)\n두 번째 줄.`, chapter: null, hidden: item.hidden, created_at: item.created_at, user_id: item.user, username: author?.username },
            comments: [{ id: item.id * 10 + 1, body: '댓글 예시 (모의)', created_at: item.created_at, user_id: 6, username: '모의학생02' }],
          })
        }
        return ok({ ...base, project: { id: item.id, title: item.title, track: 'free', is_public: item.is_public, thumbnail_url: null, created_at: item.created_at, updated_at: item.created_at, user_id: item.user, username: author?.username, hidden: item.hidden } })
      }
      const page = Math.min(500, Math.max(1, Number.parseInt(q.get('page') ?? '1', 10) || 1))
      const sorted = items.filter((it) => it.reports > 0 || it.hidden).sort((a, b) => b.reports - a.reports || b.id - a.id)
      const slice = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      return ok({
        items: slice.map((it) => {
          const author = db.users.find((u) => u.id === it.user)
          const row = { id: it.id, title: it.title, hidden: it.hidden, created_at: it.created_at, user_id: it.user, username: author?.username, reports: it.reports, target }
          return target === 'post' ? { ...row, kind: it.kind } : { ...row, is_public: it.is_public }
        }),
        hasMore: page * PAGE_SIZE < sorted.length, target, hideCount: HIDE_COUNT,
      })
    }
    if (method !== 'PATCH') return fail(405, '잘못된 요청 방식입니다.')
    if (!id) return fail(400, '어떤 글인지 알려주세요.')
    const item = items.find((it) => it.id === id)
    if (!item) return fail(404, '그런 글이 없어요.')
    if (typeof body?.hidden !== 'boolean') return fail(400, 'hidden 을 true 또는 false 로 보내주세요.')
    item.hidden = body.hidden
    return ok({ message: body.hidden ? '숨겼어요.' : '다시 보이게 했어요.', hidden: body.hidden })
  }

  if (p === '/admin/notices.php') return noticesRoute(me, method, q, body)
  if (p === '/admin/settings.php') return settingsRoute(method, body)

  return fail(404, '모의 서버에 없는 주소예요.')
}

/* ── 공지 — notices.php 의 검사 순서와 문장 ── */
const NOTICE_AUDIENCES = ['all', 'student', 'teacher', 'guardian']
const noticeOut = (n) => ({ ...n, author: db.users.find((u) => u.id === n.created_by)?.username ?? null })
function noticeFields(data, need) {
  const has = (k) => Object.prototype.hasOwnProperty.call(data, k)
  const out = {}
  if (need || has('title')) {
    const title = typeof data.title === 'string' ? data.title.trim() : ''
    if (title === '' || [...title].length > 80) return { error: '제목은 1~80자로 써주세요.' }
    out.title = title
  }
  if (need || has('body')) {
    const body = typeof data.body === 'string' ? data.body.trim() : ''
    if (body === '' || [...body].length > 2000) return { error: '내용은 1~2000자로 써주세요.' }
    out.body = body
  }
  for (const flag of ['pinned', 'published']) {
    if (has(flag)) {
      if (typeof data[flag] !== 'boolean') return { error: `${flag} 는 true/false 로 보내주세요.` }
      out[flag] = data[flag]
    }
  }
  if (has('audience')) {
    if (!NOTICE_AUDIENCES.includes(data.audience)) return { error: '받는 사람은 all·student·teacher·guardian 중에 골라주세요.' }
    out.audience = data.audience
  }
  return { fields: out }
}
function noticesRoute(me, method, q, body) {
  const id = intId(q.get('id'))
  const sorted = () => [...db.notices].sort((a, b) => (b.pinned - a.pinned) || (b.id - a.id))
  if (method === 'GET') {
    if (id) {
      const n = db.notices.find((x) => x.id === id)
      if (!n) return fail(404, '그런 공지가 없어요.')
      return ok({ notice: noticeOut(n) })
    }
    const page = Math.min(500, Math.max(1, Number.parseInt(q.get('page') ?? '1', 10) || 1))
    const list = sorted()
    return ok({ notices: list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(noticeOut), hasMore: page * PAGE_SIZE < list.length, audiences: NOTICE_AUDIENCES })
  }
  const data = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  if (method === 'POST') {
    const { error, fields } = noticeFields(data, true)
    if (error) return fail(400, error)
    const n = { pinned: false, published: true, audience: 'all', ...fields, id: Math.max(0, ...db.notices.map((x) => x.id)) + 1, created_by: me.id, created_at: ts(0, new Date().getHours()) }
    n.updated_at = n.created_at
    db.notices.push(n)
    return ok({ notice: noticeOut(n), message: n.published ? '공지를 올렸어요.' : '초안으로 저장했어요.' }, 201)
  }
  if (!id) return fail(400, '어떤 공지인지 알려주세요.')
  const n = db.notices.find((x) => x.id === id)
  if (!n) return fail(404, '그런 공지가 없어요.')
  if (method === 'PATCH') {
    const { error, fields } = noticeFields(data, false)
    if (error) return fail(400, error)
    if (!Object.keys(fields).length) return fail(400, '바꿀 내용이 없어요.')
    Object.assign(n, fields, { updated_at: ts(0, new Date().getHours()) })
    return ok({ notice: noticeOut(n), message: '공지를 고쳤어요.' })
  }
  if (method === 'DELETE') {
    db.notices = db.notices.filter((x) => x.id !== id)
    return ok({ message: '공지를 지웠어요.' })
  }
  return fail(405, '잘못된 요청 방식입니다.')
}

/* ── 운영 기준값 — settings.php · Settings::set/reset 의 검사와 문장 ── */
const describeSettings = () => SETTING_SPEC.map((s) => {
  const value = db.settings.has(s.name) ? db.settings.get(s.name) : s.default
  return { group: s.group, label: s.label, help: s.help, min: s.min, max: s.max, name: s.name, value, default: s.default, changed: value !== s.default }
})
function settingsRoute(method, body) {
  if (method === 'GET') return ok({ settings: describeSettings() })
  if (method !== 'PUT') return fail(405, '잘못된 요청 방식입니다.')
  const data = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const values = data.values && typeof data.values === 'object' && !Array.isArray(data.values) ? data.values : {}
  const resets = Array.isArray(data.reset) ? data.reset : []
  if (!Object.keys(values).length && !resets.length) return fail(400, '바꿀 기준값을 보내주세요.')
  const rejected = (name) => control.rejectSettings.includes('*') || control.rejectSettings.includes(name)
  const saved = []
  const errors = {}
  for (const [name, value] of Object.entries(values)) {
    const spec = SETTING_SPEC.find((s) => s.name === name)
    if (!spec) { errors[name] = `모르는 기준값이에요: ${[...name].slice(0, 40).join('')}`; continue }
    const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
    if (typeof value === 'boolean' || !Number.isFinite(n) || !Number.isInteger(n)) { errors[name] = `${spec.label}은 숫자로 적어주세요.`; continue }
    if (n < spec.min || n > spec.max) { errors[name] = `${spec.label}은 ${spec.min}부터 ${spec.max}까지만 넣을 수 있어요.`; continue }
    if (rejected(name)) { errors[name] = `${spec.label}을 저장하지 못했어요. (모의 거절)`; continue }
    db.settings.set(name, n)
    saved.push(name)
  }
  for (const name of resets) {
    if (typeof name !== 'string') continue
    if (!SETTING_SPEC.some((s) => s.name === name)) { errors[name] = '모르는 기준값이에요.'; continue }
    if (rejected(name)) { errors[name] = '기본값으로 되돌리지 못했어요. (모의 거절)'; continue }
    db.settings.delete(name)
    saved.push(name)
  }
  const failed = Object.keys(errors).length
  let message = saved.length ? `${saved.length}개 기준값을 저장했어요.` : '저장된 기준값이 없어요.'
  if (failed) message += ` ${failed}개는 저장하지 못했어요.`
  // PHP 는 빈 errors 를 [] 로 보낸다 — 화면이 두 모양을 다 받는지 확인하려고 그대로 흉내 낸다
  return ok({ settings: describeSettings(), saved, errors: failed ? errors : [], message })
}

export async function mockFetch(path, init) {
  const wait = control.nextDelays.length ? control.nextDelays.shift() : control.delay
  await new Promise((r) => setTimeout(r, wait))
  const i = control.failures.findIndex((f) => path.startsWith(f.pathPrefix))
  if (i >= 0) {
    const [f] = control.failures.splice(i, 1)
    if (f.html) return new Response(`<html><body><h1>${f.status} 모의 오류 페이지</h1></body></html>`, { status: f.status, headers: { 'Content-Type': 'text/html' } })
    return fail(f.status, f.message)
  }
  return route(path, init)
}
