// 해시 주소 (#/users?q=..&page=2) — 서버 설정 없이 새로고침·뒤로 가기·주소 공유가 된다
export function parseHash(hash = window.location.hash) {
  const raw = hash.replace(/^#/, '') || '/dashboard'
  const [path, query = ''] = raw.split('?')
  const parts = path.split('/').filter(Boolean)
  return { path: `/${parts.join('/')}`, parts, params: new URLSearchParams(query) }
}

export function buildHash(path, params = {}) {
  const p = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null && v !== false) p.set(k, String(v)) })
  const q = p.toString()
  return `#${path}${q ? `?${q}` : ''}`
}

export function go(path, params) {
  const next = buildHash(path, params)
  if (window.location.hash !== next) window.location.hash = next
}

// 상세 진입 전 목록 위치를 기억한다. 실제 링크의 새 탭 동작은 유지한다.
const listReturns = new Map()
function listKey(hash) {
  const { path, params } = parseHash(hash)
  const page = Math.max(1, Number(params.get('page')) || 1)
  if (path === '/users') return buildHash(path, {
    q: params.get('q') ?? '', role: params.get('role') ?? '', state: params.get('state') ?? '', page: page > 1 ? page : '',
  })
  if (path === '/moderation') return buildHash(path, {
    target: params.get('target') === 'project' ? 'project' : 'post', page: page > 1 ? page : '',
  })
  return hash
}
export function rememberListPosition(e, elementId) {
  if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
  listReturns.set(listKey(window.location.hash), { elementId, y: window.scrollY })
}
export function restoreListPosition() {
  const hash = listKey(window.location.hash)
  const back = listReturns.get(hash)
  if (!back) return undefined
  const frame = requestAnimationFrame(() => {
    const el = document.getElementById(back.elementId)
    if (!el) return
    listReturns.delete(hash)
    window.scrollTo({ top: back.y, behavior: 'auto' })
    el.focus({ preventScroll: true })
  })
  return () => cancelAnimationFrame(frame)
}

/* ── 저장하지 않은 입력이 있을 때 떠나기 전에 묻기 ──
   각 입력 칸이 setDirty(key, true/false) 로 알려 주고, App 이 주소 바뀜·창 닫기 때 확인한다 */
const dirty = new Set()
export function setDirty(key, on) {
  if (on) dirty.add(key)
  else dirty.delete(key)
}
export const hasDirty = () => dirty.size > 0
export const clearDirty = () => dirty.clear()
export function confirmLeave() {
  if (!hasDirty()) return true
  const okToLeave = window.confirm('저장하지 않은 입력이 있어요. 이 화면을 떠날까요?')
  if (okToLeave) clearDirty()
  return okToLeave
}
