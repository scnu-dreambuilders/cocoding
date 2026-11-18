import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { api } from '../api/client.js'
import { ErrorState, Pager, UserBadges } from '../components/ui.jsx'
import { dateOnly, levelText, num, roleText } from '../lib/format.js'
import { buildHash, go, rememberListPosition, restoreListPosition } from '../lib/route.js'

const ROLES = [['', '전체'], ['student', '학생'], ['teacher', '선생님'], ['guardian', '보호자']]
const STATES = [['', '모든 상태'], ['suspended', '정지된 계정'], ['admin', '운영자'], ['pending', '보호자 동의 대기']]
const PAGE_SIZE = 20

// 검색어는 '찾기'를 눌렀을 때만 적용한다 — 칸에 적는 동안에는 목록을 다시 부르지 않는다
function SearchBox({ initial, onSearch }) {
  const [text, setText] = useState(initial)
  return (
    <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); onSearch(text.trim()) }}>
      <label className="sr-only" htmlFor="user-q">닉네임 또는 이메일</label>
      <input id="user-q" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="닉네임 또는 이메일" maxLength={100} />
      <button type="submit" className="btn"><Search size={16} aria-hidden="true" /> 찾기</button>
    </form>
  )
}

export default function UsersPage({ params, onForbidden }) {
  const q = params.get('q') ?? ''
  const role = params.get('role') ?? ''
  const state = params.get('state') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [result, setResult] = useState({ key: '', loading: true, data: null, error: null })
  const seq = useRef(0)
  const key = `${q}|${role}|${state}|${page}`
  const [reload, setReload] = useState(0)

  // 필터를 빠르게 바꿔도 마지막으로 고른 조건의 응답만 화면에 남긴다
  useEffect(() => {
    const my = ++seq.current
    let cancelled = false
    api.users({ page, q, role, state })
      .then((data) => { if (!cancelled && my === seq.current) setResult({ key, loading: false, data, error: null }) })
      .catch((error) => {
        if (cancelled || my !== seq.current) return
        setResult({ key, loading: false, data: null, error })
        if (error.kind === 'forbidden') onForbidden()
      })
    return () => { cancelled = true }
  }, [key, page, q, role, state, reload, onForbidden])

  const loading = result.key !== key || result.loading
  const data = result.key === key ? result.data : null
  const error = result.key === key ? result.error : null
  const set = (patch) => go('/users', { q, role, state, page: 1, ...patch })
  const listQuery = buildHash('', { q, role, state, page: page > 1 ? page : '' }).replace(/^#\??/, '')

  useEffect(() => {
    if (data) return restoreListPosition()
  }, [data])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>회원 관리</h1>
          <p>닉네임을 선택하면 회원 상세를 볼 수 있어요.</p>
        </div>
      </div>

      <div className="toolbar">
        <SearchBox key={q} initial={q} onSearch={(text) => set({ q: text })} />
        <div className="tabs" role="group" aria-label="계정 유형">
          {ROLES.map(([v, label]) => (
            <button key={v || 'all'} type="button" aria-pressed={role === v} onClick={() => set({ role: v })}>{label}</button>
          ))}
        </div>
        <label className="field">
          상태
          <select value={state} onChange={(e) => set({ state: e.target.value })}>
            {STATES.map(([v, label]) => <option key={v || 'all'} value={v}>{label}</option>)}
          </select>
        </label>
      </div>

      <p className="small muted" aria-live="polite">
        {loading ? '불러오는 중…' : data ? `${num(data.total)}명${q ? ` · "${q}" 검색` : ''}` : ''}
      </p>

      <ErrorState error={error} onRetry={() => setReload((n) => n + 1)} />

      {data && data.users.length === 0 && (
        <div className="card empty">
          조건에 맞는 회원이 없어요.
          {(q || role || state) && <> <button type="button" className="link-btn" onClick={() => go('/users')}>조건 지우기</button></>}
        </div>
      )}

      {(data?.users.length > 0 || (loading && !error)) && (
        <div className="table-wrap" aria-busy={loading}>
          <table className="data">
            <caption className="sr-only">회원 목록</caption>
            <thead>
              <tr>
                <th scope="col">번호</th>
                <th scope="col">닉네임</th>
                <th scope="col">이메일</th>
                <th scope="col">유형</th>
                <th scope="col">상태</th>
                <th scope="col">코딩 경험(설문)</th>
                <th scope="col" className="num">코인</th>
                <th scope="col" className="num">경험치</th>
                <th scope="col">가입일</th>
              </tr>
            </thead>
            <tbody>
              {(data?.users ?? []).map((u) => (
                <tr key={u.id} className={u.suspended ? 'dim' : ''}>
                  <td className="num">{u.id}</td>
                  <td><a id={`user-link-${u.id}`} href={buildHash(`/users/${u.id}`, { back: listQuery })}
                    onClick={(e) => rememberListPosition(e, `user-link-${u.id}`)}><b>{u.username}</b></a></td>
                  <td>{u.email}</td>
                  <td>{roleText(u.role)}</td>
                  <td><span className="btn-row"><UserBadges user={u} /></span></td>
                  <td>{levelText(u.level)}</td>
                  <td className="num">{num(u.coins)}</td>
                  <td className="num">{num(u.xp)}</td>
                  <td>{dateOnly(u.created_at)}</td>
                </tr>
              ))}
              {!data && <tr><td colSpan={9} className="empty">불러오는 중…</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {data && <Pager page={page} hasMore={data.hasMore} total={data.total} pageSize={PAGE_SIZE} busy={loading} onPage={(p) => set({ page: p })} />}
    </>
  )
}
