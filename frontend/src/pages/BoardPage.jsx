import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import TopNav from '../components/TopNav'
import SiteFooter from '../components/SiteFooter'
import TextSizeControl from '../components/TextSizeControl'
import ProfileModal from '../components/ProfileModal'
import './BoardPage.css'

/* ════════════════════════════════════════════════
   토론 게시판 — 코딩 이야기를 나누는 곳
   글 쓰기·고치기·지우기, 댓글, 신고(3명이면 자동 숨김)
   (기능정의서 STU-003, 요구사항 SFR-STU-005)
   ════════════════════════════════════════════════ */
const fmt = (s) => (s ? String(s).slice(5, 16).replace('-', '/') : '')

const LEAVE_MESSAGE = '작성 중인 내용이 사라져요. 나갈까요?'

// 이 화면을 떠나지 않고 안내만 띄우는 메뉴인지 (App의 공통 메뉴 규칙과 같은 기준) — 이런 메뉴에는 이탈 확인을 띄우지 않는다
const STUDENT_ONLY_MENU = ['study', 'free', 'popular']
const staysOnBoard = (key, user) => key === 'qna' || key === 'game' || key === 'board'
  || ((user?.role ?? 'student') !== 'student' && STUDENT_ONLY_MENU.includes(key))

// 고정 상단바에 가리지 않게 요소 위쪽이 상단바 아래에 오도록 즉시 스크롤
function scrollBelowNav(el) {
  if (!el) return
  const navH = document.querySelector('.topnav')?.offsetHeight ?? 0
  const top = el.getBoundingClientRect().top + window.scrollY - navH - 16
  window.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
}

// 초점을 옮기되 화면은 움직이지 않는다 (스크롤은 따로 맞춘다). 제목처럼 원래 초점이 안 가는 요소는 tabindex="-1"만 붙인다
function focusQuietly(el) {
  if (!el) return
  if (!el.matches('button, a[href], input, textarea, select, [tabindex]')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
}

/* 프로필을 열 수 있을 때만 누를 수 있는 버튼으로 (아니면 그냥 이름 — 눌러도 아무 일 없는 버튼 방지) */
function Author({ id, onOpenProfile, className = '', children }) {
  if (!onOpenProfile) return <span className={`board-author-name ${className}`}>{children}</span>
  return (
    <button type="button" className={`board-author ${className}`} onClick={() => onOpenProfile(id)}>
      {children}
    </button>
  )
}

// onDirtyChange(bool): 처음 값에서 바뀌었는지 (원래 값으로 되돌리면 false) — 이탈 확인에 쓴다
function PostForm({ initial, onSubmit, onCancel, busy, onDirtyChange }) {
  const initTitle = initial?.title ?? ''
  const initBody = initial?.body ?? ''
  const [title, setTitle] = useState(initTitle)
  const [body, setBody] = useState(initBody)
  const titleRef = useRef(null)

  // 폼을 열면 제목 입력란으로 초점 (키보드 사용자가 바로 쓸 수 있게)
  useEffect(() => { titleRef.current?.focus() }, [])

  const change = (nextTitle, nextBody) => {
    setTitle(nextTitle)
    setBody(nextBody)
    onDirtyChange?.(nextTitle !== initTitle || nextBody !== initBody)
  }

  return (
    <form className="board-form" onSubmit={(e) => { e.preventDefault(); onSubmit(title, body) }}>
      <input ref={titleRef} value={title} onChange={(e) => change(e.target.value, body)} maxLength={80}
        placeholder="제목 (80자까지)" aria-label="제목" required />
      <textarea value={body} onChange={(e) => change(title, e.target.value)} maxLength={1000} rows={6}
        placeholder="코딩하면서 궁금했던 것, 만든 작품 이야기를 적어보세요 (1000자까지). 이름·학교·전화번호는 적지 마세요!"
        aria-label="내용" required />
      <div className="board-form-foot">
        <small>{body.length}/1000</small>
        <div>
          {onCancel && <button type="button" className="role-btn ghost" onClick={onCancel}>취소</button>}
          <button type="submit" className="role-btn" disabled={busy || !title.trim() || !body.trim()}>
            {busy ? '올리는 중…' : initial ? '고치기' : '글 올리기'}
          </button>
        </div>
      </div>
    </form>
  )
}

// onMenu(key): 메뉴 키를 App의 공통 목적지로 보낸다. 이 화면에 머물러야 하면 { toast }를 돌려주고 여기서 안내만 띄운다
export default function BoardPage({ user, onLogout, onMenu, onGoHome }) {
  const [profileId, setProfileId] = useState(null) // 글쓴이 프로필 창
  const [list, setList] = useState(null)
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailNotice, setDetailNotice] = useState('') // 저장은 됐지만 새 내용을 불러오지 못했을 때의 안내
  const [writing, setWriting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [comment, setComment] = useState('')
  const [reporting, setReporting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  const busyRef = useRef(false)          // 처리 함수에서도 중복 요청을 막는다 (버튼 비활성화만 믿지 않음)
  const formDirtyRef = useRef(false)     // 열려 있는 글쓰기·고치기 폼이 바뀌었는지
  const openIdRef = useRef(null)         // 응답이 왔을 때 아직 같은 글을 보고 있는지 확인용
  const writeSessionRef = useRef(0)      // 글쓰기 폼을 열 때마다 +1 — 이전 폼의 저장 결과가 새 폼을 닫지 않게
  const listSeq = useRef(0)              // 목록 요청 번호 — 늦게 온 응답이 최신 목록을 덮지 않게
  const listReturnRef = useRef(null)     // 목록으로 돌아올 때 복원할 { y, id } (id가 null이면 목록 제목으로 초점)
  const headRef = useRef(null)           // 목록 제목 (초점 대체 위치)
  const detailRef = useRef(null)
  const toastTimer = useRef(0)

  useEffect(() => { openIdRef.current = openId }, [openId])

  const showToast = useCallback((msg) => {
    clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), 3500)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), []) // 화면을 떠나면 안내 타이머도 정리

  const beginBusy = () => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    return true
  }
  const endBusy = () => {
    busyRef.current = false
    setBusy(false)
  }

  // 지금 화면에 사라질 입력이 있는지: 열린 글쓰기·고치기 폼이 바뀌었거나, 글 상세에서 댓글을 쓰는 중
  const hasDraft = () => formDirtyRef.current || (openIdRef.current != null && comment.trim() !== '')
  // 사라질 입력이 있을 때만 한 번 묻는다. 취소하면 아무것도 바꾸지 않는다
  const confirmLeave = (dirty = hasDraft()) => !dirty || window.confirm(LEAVE_MESSAGE)

  // ── 목록 ──
  const loadList = useCallback((p) => {
    const id = ++listSeq.current
    api.boardList(p)
      .then((r) => {
        if (id !== listSeq.current) return
        setList(r)
        setPage(p)
      })
      .catch((e) => {
        if (id !== listSeq.current) return
        setList({ posts: [], error: e.message, failedPage: p })
      })
  }, [])

  useEffect(() => {
    loadList(1)
    return () => { listSeq.current += 1 } // 화면을 떠나면 진행 중이던 목록 응답은 버린다
  }, [loadList])

  const retryList = () => {
    const p = list?.failedPage ?? page
    setList(null)
    loadList(p)
  }

  // ── 글 상세 ── 불러온 글에 postId를 같이 담아서, 지금 열람 중인 글과 다르면 아직 불러오는 중으로 본다
  useEffect(() => {
    if (!openId) return undefined
    let alive = true // 다른 글로 바뀌거나 목록으로 돌아가면 이전 글의 늦은 응답은 버린다
    api.boardPost(openId)
      .then((d) => { if (alive) setDetail({ ...d, postId: openId }) })
      .catch((e) => {
        if (!alive) return
        showToast(e.message)
        setOpenId(null) // 목록으로 (스크롤·초점은 아래 복원 처리)
      })
    return () => { alive = false }
  }, [openId, showToast])

  const loaded = detail?.postId === openId ? detail : null

  // 글을 다 불러오면 제목으로 초점 (화면은 열 때 이미 맞춤)
  const loadedId = loaded?.postId
  useEffect(() => {
    if (loadedId == null || editing) return
    focusQuietly(detailRef.current?.querySelector('h3'))
  }, [loadedId, editing])

  // 목록으로 돌아오면: 기억한 스크롤 위치로 즉시 되돌리고, 방금 본 글 버튼(없으면 목록 제목)으로 초점 — 초점은 스크롤을 움직이지 않는다
  useEffect(() => {
    if (openId != null) return
    const back = listReturnRef.current
    if (!back) return
    listReturnRef.current = null
    window.scrollTo({ top: back.y, behavior: 'auto' })
    const row = back.id != null ? document.querySelector(`[data-post-id="${back.id}"]`) : null
    focusQuietly(row ?? headRef.current)
  }, [openId])

  // 상세 화면을 닫을 때 (확인은 부르는 쪽에서) 그 글의 입력·신고·고치기 상태를 정리한다
  const closeDetail = ({ focusId } = {}) => {
    const fromId = openIdRef.current
    listReturnRef.current = { y: listReturnRef.current?.y ?? 0, id: focusId === undefined ? fromId : focusId }
    setOpenId(null)
    setEditing(false)
    setReporting(false)
    setComment('')
    setDetailNotice('')
    formDirtyRef.current = false
  }

  const openPost = (id) => {
    // 글을 쓰던 중이면 확인 후 쓰기 폼을 닫는다 (폼과 상세가 같이 보이지 않게)
    if (writing) {
      if (!confirmLeave(formDirtyRef.current)) return
      setWriting(false)
      formDirtyRef.current = false
    }
    listReturnRef.current = { y: window.scrollY, id }
    setReporting(false)
    setComment('')
    setDetailNotice('')
    setEditing(false)
    setOpenId(id)
    // 상세가 그려진 뒤 상세 맨 위가 상단바 아래에 오도록
    requestAnimationFrame(() => scrollBelowNav(detailRef.current))
  }

  const backToList = () => {
    if (!confirmLeave()) return
    closeDetail()
  }

  // ── 쓰기·고치기·지우기 ──
  const startWriting = () => {
    writeSessionRef.current += 1
    formDirtyRef.current = false
    setWriting(true)
  }

  const cancelWriting = () => {
    if (!confirmLeave(formDirtyRef.current)) return
    formDirtyRef.current = false
    setWriting(false)
  }

  const create = async (title, body) => {
    if (!beginBusy()) return
    const session = writeSessionRef.current
    try {
      await api.createBoardPost(title, body)
      // 저장하는 사이 폼을 닫고 새로 열었다면 새 폼은 건드리지 않는다
      if (session === writeSessionRef.current) {
        formDirtyRef.current = false
        setWriting(false)
      }
      loadList(1)
      showToast('글을 올렸어요')
    } catch (e) {
      showToast(e.message) // 실패하면 폼과 입력은 그대로
    } finally {
      endBusy()
    }
  }

  const cancelEditing = () => {
    if (!confirmLeave(formDirtyRef.current)) return
    formDirtyRef.current = false
    setEditing(false)
  }

  // 고친 글 다시 불러오기 (조회만)
  const reloadDetail = async (postId) => {
    try {
      const d = await api.boardPost(postId)
      if (openIdRef.current !== postId) return
      setDetail({ ...d, postId })
      setDetailNotice('')
    } catch (e) {
      if (openIdRef.current !== postId) return
      setDetailNotice(`글은 고쳤지만 고친 내용을 불러오지 못했어요 (${e.message}). 아래는 고치기 전 내용이에요.`)
    }
  }

  const update = async (title, body) => {
    if (!beginBusy()) return
    const postId = openIdRef.current
    try {
      await api.updateBoardPost(postId, title, body)
    } catch (e) {
      showToast(e.message) // 저장 실패: 폼과 입력은 그대로
      endBusy()
      return
    }
    // 저장 성공 — 이후 조회가 실패해도 저장 실패로 보이지 않게 따로 안내한다 (고치기 요청은 다시 보내지 않음)
    if (openIdRef.current === postId) {
      formDirtyRef.current = false
      setEditing(false)
    }
    showToast('글을 고쳤어요')
    loadList(page)
    await reloadDetail(postId)
    endBusy()
  }

  const remove = async () => {
    if (busyRef.current) return
    if (!window.confirm('이 글을 지울까요? 댓글도 함께 지워져요.')) return
    if (!beginBusy()) return
    const postId = openIdRef.current
    try {
      await api.deleteBoardPost(postId)
      // 글이 없어졌으니 목록 맨 위로, 초점은 목록 제목으로
      if (openIdRef.current === postId) {
        listReturnRef.current = { y: 0, id: null }
        closeDetail({ focusId: null })
      }
      loadList(1)
      showToast('글을 지웠어요')
    } catch (e) {
      showToast(e.message)
    } finally {
      endBusy()
    }
  }

  const addComment = async (e) => {
    e.preventDefault()
    if (!comment.trim() || !beginBusy()) return
    const postId = openIdRef.current
    try {
      const res = await api.addBoardComment(postId, comment)
      // 그사이 다른 글로 옮겼다면 그 글의 댓글·입력은 건드리지 않는다
      if (openIdRef.current === postId) {
        setDetail((d) => (d?.postId === postId ? { ...d, comments: res.comments } : d))
        setComment('')
      }
      loadList(page)
    } catch (err) {
      showToast(err.message) // 실패하면 쓰던 댓글은 그대로
    } finally {
      endBusy()
    }
  }

  const removeComment = async (id) => {
    if (!beginBusy()) return
    const postId = openIdRef.current
    try {
      await api.deleteBoardComment(id)
    } catch (e) {
      showToast(e.message)
      endBusy()
      return
    }
    // 지우기는 성공. 새 댓글 목록을 못 받아도 지운 댓글만 화면에서 뺀다
    try {
      const d = await api.boardPost(postId)
      if (openIdRef.current === postId) setDetail({ ...d, postId })
    } catch {
      if (openIdRef.current === postId) {
        setDetail((d) => (d?.postId === postId ? { ...d, comments: d.comments.filter((c) => c.id !== id) } : d))
      }
    }
    loadList(page)
    endBusy()
  }

  const report = async (reason) => {
    if (!beginBusy()) return
    const postId = openIdRef.current
    setReporting(false)
    try {
      const res = await api.reportBoardPost(postId, reason)
      showToast(res.message)
      if (res.hidden) {
        if (openIdRef.current === postId) closeDetail({ focusId: null })
        loadList(1)
      }
    } catch (e) {
      showToast(e.message)
    } finally {
      endBusy()
    }
  }

  // ── 화면 밖으로 나가는 길 (메뉴·푸터·로고·로그아웃): 사라질 입력이 있으면 한 번만 묻는다 ──
  // 상단 메뉴·푸터: 목적지는 App 규칙 그대로. Q&A·게임존, 교사·보호자의 학생 전용 메뉴는 이 화면에 머물며 안내
  const handleMenu = (key) => {
    if (!staysOnBoard(key, user) && !confirmLeave()) return
    const r = onMenu?.(key)
    if (r?.toast) showToast(r.toast)
  }
  const goHome = () => { if (confirmLeave()) onGoHome?.() }
  const logout = () => { if (confirmLeave()) onLogout?.() }

  const emptyLater = list && !list.error && list.posts.length === 0 && page > 1

  return (
    <div className="board-root">
      {toast && <div className="dash-toast" role="status">{toast}</div>}
      <TopNav user={user} active="board" onNavigate={handleMenu} onLogout={logout} onBrandClick={goHome}
        right={
          <>
            <TextSizeControl />
            <span className="topnav-username">{user?.username}</span>
            <button type="button" className="topnav-btn-ghost" onClick={logout}>로그아웃</button>
          </>
        } />

      <main className="board-main">
        <header className="board-head">
          <div>
            <h2 ref={headRef}>토론 게시판</h2>
            <p>코딩하면서 궁금한 것, 만든 작품 이야기를 친구들과 나눠요.</p>
          </div>
          {!writing && !openId && (
            <button type="button" className="role-btn" onClick={startWriting}>글 쓰기</button>
          )}
        </header>

        {writing && (
          <PostForm onSubmit={create} onCancel={cancelWriting} busy={busy}
            onDirtyChange={(d) => { formDirtyRef.current = d }} />
        )}

        {/* 글 상세 */}
        {openId && (
          <article className="board-detail" ref={detailRef}>
            <button type="button" className="board-back" onClick={backToList}>← 목록으로</button>

            {!loaded ? (
              <p className="dash-hint" role="status">불러오는 중…</p>
            ) : editing ? (
              <PostForm initial={loaded.post} onSubmit={update} onCancel={cancelEditing} busy={busy}
                onDirtyChange={(d) => { formDirtyRef.current = d }} />
            ) : (
              <>
                {detailNotice && (
                  <p className="dash-hint" role="alert">
                    {detailNotice}{' '}
                    <button type="button" className="link-btn" onClick={() => reloadDetail(loaded.postId)}>다시 불러오기</button>
                  </p>
                )}
                <h3>{loaded.post.title}</h3>
                <p className="board-meta">
                  <Author id={loaded.post.user_id} onOpenProfile={setProfileId}>
                    {loaded.post.username}
                  </Author>
                  <span>{fmt(loaded.post.created_at)}</span>
                  {loaded.post.is_mine ? (
                    <>
                      <button type="button" className="board-link" onClick={() => { formDirtyRef.current = false; setEditing(true) }}>고치기</button>
                      <button type="button" className="board-link danger" onClick={remove} disabled={busy}>지우기</button>
                    </>
                  ) : (
                    <button type="button" className="board-link" onClick={() => setReporting((v) => !v)}>신고</button>
                  )}
                </p>

                {reporting && (
                  <div className="board-report" role="group" aria-label="신고 이유">
                    <span>어떤 문제가 있나요?</span>
                    {loaded.reasons.map((r) => <button key={r} type="button" onClick={() => report(r)} disabled={busy}>{r}</button>)}
                    <button type="button" className="board-report-cancel" onClick={() => setReporting(false)}>취소</button>
                  </div>
                )}

                <p className="board-body">{loaded.post.body}</p>

                <section className="board-comments">
                  <h4>댓글 {loaded.comments.length}개</h4>
                  {loaded.comments.map((c) => (
                    <div key={c.id} className="board-comment">
                      <Author id={c.user_id} onOpenProfile={setProfileId}>{c.username}</Author>
                      <p>{c.body}</p>
                      <span>{fmt(c.created_at)}</span>
                      {(c.user_id === user?.id || loaded.post.is_mine) && (
                        <button type="button" className="row-remove" onClick={() => removeComment(c.id)} disabled={busy} aria-label="댓글 지우기">×</button>
                      )}
                    </div>
                  ))}
                  <form className="board-comment-form" onSubmit={addComment}>
                    <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500}
                      placeholder="댓글 쓰기 (500자까지)" aria-label="댓글" />
                    <button type="submit" className="role-btn" disabled={busy || !comment.trim()}>등록</button>
                  </form>
                </section>
              </>
            )}
          </article>
        )}

        {/* 목록 */}
        {!openId && (
          !list ? (
            <>
              <p className="sr-only" role="status">글 목록을 불러오는 중이에요</p>
              <div className="skeleton-card board-skeleton" aria-hidden="true" />
            </>
          ) : list.error ? (
            <p className="board-error" role="alert">
              {list.error}{' '}
              <button type="button" className="link-btn" onClick={retryList}>다시 시도</button>
            </p>
          ) : emptyLater ? (
            <>
              <p className="empty-msg">이 쪽에는 글이 없어요.</p>
              <div className="board-pager">
                <button type="button" className="role-btn ghost" onClick={() => loadList(page - 1)}>← 이전</button>
                <span>{page} 쪽</span>
              </div>
            </>
          ) : list.posts.length === 0 ? (
            <p className="empty-msg">아직 글이 없어요. 첫 글을 올려보세요!</p>
          ) : (
            <>
              <ul className="board-list">
                {list.posts.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="board-row" data-post-id={p.id} onClick={() => openPost(p.id)}>
                      <span className="board-title">{p.title}</span>
                      <span className="board-row-meta">
                        {p.username} · {fmt(p.created_at)}
                        {p.comment_count > 0 && <b> · 댓글 {p.comment_count}</b>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="board-pager">
                <button type="button" className="role-btn ghost" disabled={page <= 1} onClick={() => loadList(page - 1)}>← 이전</button>
                <span>{page} 쪽</span>
                <button type="button" className="role-btn ghost" disabled={!list.hasMore} onClick={() => loadList(page + 1)}>다음 →</button>
              </div>
            </>
          )
        )}
      </main>

      {profileId && (
        <ProfileModal userId={profileId} onClose={() => setProfileId(null)} showToast={showToast} />
      )}

      <SiteFooter onNavigate={handleMenu} />
    </div>
  )
}
