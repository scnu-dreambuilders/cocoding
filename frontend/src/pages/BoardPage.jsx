import { useCallback, useEffect, useState } from 'react'
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

/* 프로필을 열 수 있을 때만 누를 수 있는 버튼으로 (아니면 그냥 이름 — 눌러도 아무 일 없는 버튼 방지) */
function Author({ id, onOpenProfile, className = '', children }) {
  if (!onOpenProfile) return <span className={`board-author-name ${className}`}>{children}</span>
  return (
    <button type="button" className={`board-author ${className}`} onClick={() => onOpenProfile(id)}>
      {children}
    </button>
  )
}

function PostForm({ initial, onSubmit, onCancel, busy }) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')

  return (
    <form className="board-form" onSubmit={(e) => { e.preventDefault(); onSubmit(title, body) }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80}
        placeholder="제목 (80자까지)" aria-label="제목" required />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={6}
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

export default function BoardPage({ user, onLogout, onNavigate, onGoHome }) {
  const [profileId, setProfileId] = useState(null) // 글쓴이 프로필 창
  const [list, setList] = useState(null)
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [writing, setWriting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [comment, setComment] = useState('')
  const [reporting, setReporting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = useCallback((msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }, [])

  const loadList = useCallback((p) => {
    api.boardList(p).then((r) => { setList(r); setPage(p) }).catch((e) => { setList({ posts: [], error: e.message }) })
  }, [])

  useEffect(() => {
    let alive = true
    api.boardList(1).then((r) => { if (alive) setList(r) }).catch((e) => { if (alive) setList({ posts: [], error: e.message }) })
    return () => { alive = false }
  }, [])

  // 불러온 글에 postId를 같이 담아서, 지금 열람 중인 글과 다르면 아직 불러오는 중으로 본다
  useEffect(() => {
    if (!openId) return undefined
    let alive = true
    api.boardPost(openId)
      .then((d) => { if (alive) setDetail({ ...d, postId: openId }) })
      .catch((e) => {
        if (!alive) return
        showToast(e.message)
        setOpenId(null)
      })
    return () => { alive = false }
  }, [openId, showToast])

  const loaded = detail?.postId === openId ? detail : null

  const create = async (title, body) => {
    setBusy(true)
    try {
      await api.createBoardPost(title, body)
      setWriting(false)
      loadList(1)
      showToast('글을 올렸어요')
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy(false)
    }
  }

  const update = async (title, body) => {
    setBusy(true)
    try {
      await api.updateBoardPost(openId, title, body)
      setEditing(false)
      setDetail({ ...(await api.boardPost(openId)), postId: openId })
      loadList(page)
      showToast('글을 고쳤어요')
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!window.confirm('이 글을 지울까요? 댓글도 함께 지워져요.')) return
    try {
      await api.deleteBoardPost(openId)
      setOpenId(null)
      loadList(1)
      showToast('글을 지웠어요')
    } catch (e) {
      showToast(e.message)
    }
  }

  const addComment = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await api.addBoardComment(openId, comment)
      setDetail((d) => ({ ...d, comments: res.comments }))
      setComment('')
      loadList(page)
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  const removeComment = async (id) => {
    try {
      await api.deleteBoardComment(id)
      setDetail({ ...(await api.boardPost(openId)), postId: openId })
      loadList(page)
    } catch (e) {
      showToast(e.message)
    }
  }

  const report = async (reason) => {
    setReporting(false)
    try {
      const res = await api.reportBoardPost(openId, reason)
      showToast(res.message)
      if (res.hidden) {
        setOpenId(null)
        loadList(1)
      }
    } catch (e) {
      showToast(e.message)
    }
  }

  return (
    <div className="board-root">
      {toast && <div className="dash-toast" role="status">{toast}</div>}
      <TopNav user={user} active="board" onNavigate={onNavigate} onLogout={onLogout} onBrandClick={onGoHome}
        right={
          <>
            <TextSizeControl />
            <span className="topnav-username">{user?.username}</span>
            <button type="button" className="topnav-btn-ghost" onClick={onLogout}>로그아웃</button>
          </>
        } />

      <main className="board-main">
        <header className="board-head">
          <div>
            <h2>💬 토론 게시판</h2>
            <p>코딩하면서 궁금한 것, 만든 작품 이야기를 친구들과 나눠요.</p>
          </div>
          {!writing && !openId && (
            <button type="button" className="role-btn" onClick={() => setWriting(true)}>✏️ 글 쓰기</button>
          )}
        </header>

        {writing && <PostForm onSubmit={create} onCancel={() => setWriting(false)} busy={busy} />}

        {/* 글 상세 */}
        {openId && (
          <article className="board-detail">
            <button type="button" className="board-back" onClick={() => { setOpenId(null); setEditing(false) }}>← 목록으로</button>

            {!loaded ? (
              <p className="dash-hint" role="status">불러오는 중…</p>
            ) : editing ? (
              <PostForm initial={loaded.post} onSubmit={update} onCancel={() => setEditing(false)} busy={busy} />
            ) : (
              <>
                <h3>{loaded.post.title}</h3>
                <p className="board-meta">
                  <Author id={loaded.post.user_id} onOpenProfile={setProfileId}>
                    👤 {loaded.post.username}
                  </Author>
                  <span>{fmt(loaded.post.created_at)}</span>
                  {loaded.post.is_mine ? (
                    <>
                      <button type="button" className="board-link" onClick={() => setEditing(true)}>고치기</button>
                      <button type="button" className="board-link danger" onClick={remove}>지우기</button>
                    </>
                  ) : (
                    <button type="button" className="board-link" onClick={() => setReporting((v) => !v)}>🚩 신고</button>
                  )}
                </p>

                {reporting && (
                  <div className="board-report" role="group" aria-label="신고 이유">
                    <span>어떤 문제가 있나요?</span>
                    {loaded.reasons.map((r) => <button key={r} type="button" onClick={() => report(r)}>{r}</button>)}
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
                        <button type="button" className="row-remove" onClick={() => removeComment(c.id)} aria-label="댓글 지우기">×</button>
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
            <p className="board-error" role="alert">⚠️ {list.error}</p>
          ) : list.posts.length === 0 ? (
            <p className="empty-msg">아직 글이 없어요. 첫 글을 올려보세요!</p>
          ) : (
            <>
              <ul className="board-list">
                {list.posts.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="board-row" onClick={() => setOpenId(p.id)}>
                      <span className="board-title">{p.title}</span>
                      <span className="board-row-meta">
                        👤 {p.username} · {fmt(p.created_at)}
                        {p.comment_count > 0 && <b> · 💬 {p.comment_count}</b>}
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

      <SiteFooter onNavigate={onNavigate} />
    </div>
  )
}
