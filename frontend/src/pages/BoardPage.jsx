import { useCallback, useEffect, useRef, useState } from 'react'
import { api, BOARD_SERVER } from '../api/client'
import TopNav from '../components/TopNav'
import SiteFooter from '../components/SiteFooter'
import TextSizeControl from '../components/TextSizeControl'
import ProfileModal from '../components/ProfileModal'
import BoardPostForm from '../components/BoardPostForm'
import BoardFilters from '../components/BoardFilters'
import { BOARD_KIND_LABEL, BOARD_STATUS_LABEL, blockLabel, chapterLabel, normalizePost } from '../lib/boardTopics'
import './BoardPage.css'

/* ════════════════════════════════════════════════
   코딩 게시판 — 토론과 질문(Q&A)을 한 화면에서
   · 토론: 글 쓰기·고치기·지우기, 댓글, 신고(3명이면 자동 숨김) — 지금 서버로 동작
   · 질문: 챕터·블록 태그, 해결 상태, 답변·채택 — 백엔드는 구현됨(board/index.php). 실제 서버 QA 전까지
     api/client.js의 BOARD_SERVER가 꺼져 있어 요청을 보내지 않는다
     연결 전 기능은 요청을 보내지 않고 '서버 연결 전' 안내를 띄운다. 성공한 척하거나 다른 곳에 대신 저장하지 않는다.
   (기능정의서 STU-003, 요구사항 SFR-STU-005, 플로우차트 ver02 '게시판', PR #10 리뷰의 Q&A 요구)
   ════════════════════════════════════════════════ */
const fmt = (s) => (s ? String(s).slice(5, 16).replace('-', '/') : '')

const LEAVE_MESSAGE = '작성 중인 내용이 사라져요. 나갈까요?'
const UNSUPPORTED_KEEP = '쓴 내용은 그대로 있어요. 토론으로 올리거나, 서버 연결 뒤에 다시 올려 주세요.'

// 목록 조건 — 상세에 들어갔다 돌아와도 그대로 둔다. 질문 필터(chapter·block·status)는 질문 탭에서만 적용
const DEFAULT_QUERY = { kind: 'all', q: '', chapter: '', block: '', status: 'all' }
const apiQuery = (q) => (q.kind === 'question' ? q : { kind: q.kind, q: q.q })
const hasConditions = (q) => !!q.q || (q.kind === 'question' && (!!q.chapter || !!q.block || q.status !== 'all'))

// 이 화면을 떠나지 않고 안내만 띄우는 메뉴인지 (App의 공통 메뉴 규칙과 같은 기준) — 이런 메뉴에는 이탈 확인을 띄우지 않는다
// 'qna'·'board'는 둘 다 이 코딩 게시판이다. 게임존은 실제로 화면을 옮기므로 여기 넣지 않는다
const STUDENT_ONLY_MENU = ['study', 'free', 'popular']
const staysOnBoard = (key, user) => key === 'qna' || key === 'board'
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

// 글 종류·해결 상태·챕터·블록 표시 (목록과 상세에서 같이 쓴다)
function PostBadges({ post }) {
  return (
    <>
      <span className={`board-kind is-${post.kind}`}>{BOARD_KIND_LABEL[post.kind]}</span>
      {post.kind === 'question' && (
        <span className={`board-status is-${post.status}`}>{BOARD_STATUS_LABEL[post.status]}</span>
      )}
    </>
  )
}
function PostTags({ post }) {
  if (post.kind !== 'question' || (!post.chapter && post.blocks.length === 0)) return null
  return (
    <span className="board-tags">
      {chapterLabel(post.chapter) && <span className="board-tag">{chapterLabel(post.chapter)}</span>}
      {post.blocks.map((b) => <span key={b} className="board-tag is-block">{blockLabel(b)}</span>)}
    </span>
  )
}

// onMenu(key): 메뉴 키를 App의 공통 목적지로 보낸다. 이 화면에 머물러야 하면 { toast }를 돌려주고 여기서 안내만 띄운다
export default function BoardPage({ user, onLogout, onMenu, onGoHome }) {
  const [profileId, setProfileId] = useState(null) // 글쓴이 프로필 창
  const [list, setList] = useState(null)
  const [page, setPage] = useState(1)
  const [query, setQuery] = useState(DEFAULT_QUERY)   // 실제로 적용된 목록 조건
  const [searchInput, setSearchInput] = useState('')   // 검색창에 쓰는 중인 글자 (검색을 눌러야 적용)
  const [openId, setOpenId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailNotice, setDetailNotice] = useState('') // 저장은 됐지만 새 내용을 불러오지 못했을 때의 안내
  const [writing, setWriting] = useState(false)
  const [writeKind, setWriteKind] = useState('discussion') // 새 글 폼을 열 때의 처음 종류
  const [editing, setEditing] = useState(false)
  const [formNotice, setFormNotice] = useState('')     // 폼을 올리지 못한 이유 (서버 연결 전 등) — 입력은 그대로
  const [comment, setComment] = useState('')
  const [reporting, setReporting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  const busyRef = useRef(false)          // 처리 함수에서도 중복 요청을 막는다 (버튼 비활성화만 믿지 않음)
  const formDirtyRef = useRef(false)     // 열려 있는 글쓰기·고치기 폼이 바뀌었는지
  const openIdRef = useRef(null)         // 응답이 왔을 때 아직 같은 글을 보고 있는지 확인용
  // 글쓰기·고치기 폼을 열거나 닫을 때마다 +1 — 늦게 끝난 저장 요청이 지금 열린 폼(또는 다른 폼)의 상태를 바꾸지 않게
  const formSessionRef = useRef(0)
  const listSeq = useRef(0)              // 목록 요청 번호 — 늦게 온 응답이 최신 목록을 덮지 않게
  const queryRef = useRef(DEFAULT_QUERY) // 요청을 보낼 때 쓰는 최신 목록 조건
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

  // 지금 화면에 사라질 입력이 있는지: 열린 글쓰기·고치기 폼이 바뀌었거나, 글 상세에서 댓글·답변을 쓰는 중
  const hasDraft = () => formDirtyRef.current || (openIdRef.current != null && comment.trim() !== '')
  // 사라질 입력이 있을 때만 한 번 묻는다. 취소하면 아무것도 바꾸지 않는다
  const confirmLeave = (dirty = hasDraft()) => !dirty || window.confirm(LEAVE_MESSAGE)

  // ── 목록 ── 서버에 없는 조건(질문·검색)은 요청 없이 'unsupported'로 와서 '서버 연결 전' 안내를 띄운다
  const loadList = useCallback((p, q = queryRef.current) => {
    const id = ++listSeq.current
    api.boardList(p, apiQuery(q))
      .then((r) => {
        if (id !== listSeq.current) return
        setList({ posts: (r.posts ?? []).map(normalizePost), hasMore: !!r.hasMore })
        setPage(p)
      })
      .catch((e) => {
        if (id !== listSeq.current) return
        if (e.kind === 'unsupported') {
          setList({ posts: [], unsupported: e.message })
          setPage(p)
        } else {
          setList({ posts: [], error: e.message, failedPage: p })
        }
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

  // 탭·검색·필터를 바꾸면 첫 쪽부터 다시 (초점은 지금 누른 탭·칸에 그대로)
  const changeQuery = (patch) => {
    const next = { ...queryRef.current, ...patch }
    queryRef.current = next
    setQuery(next)
    setList(null)
    setPage(1)
    loadList(1, next)
  }
  const applySearch = () => {
    const q = searchInput.trim()
    setSearchInput(q)
    changeQuery({ q })
  }
  const clearSearch = () => {
    setSearchInput('')
    changeQuery({ q: '' })
  }
  const clearConditions = () => {
    setSearchInput('')
    changeQuery({ q: '', chapter: '', block: '', status: 'all' })
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
  const post = loaded ? normalizePost(loaded.post) : null
  const isQuestion = post?.kind === 'question'
  const replyWord = isQuestion ? '답변' : '댓글'

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
    setFormNotice('')
    formSessionRef.current += 1 // 고치던 폼이 있었다면 그 저장 결과는 이제 화면을 바꾸지 않는다
    formDirtyRef.current = false
  }

  const openPost = (id) => {
    // 글을 쓰던 중이면 확인 후 쓰기 폼을 닫는다 (폼과 상세가 같이 보이지 않게)
    if (writing) {
      if (!confirmLeave(formDirtyRef.current)) return
      formSessionRef.current += 1
      setWriting(false)
      formDirtyRef.current = false
    }
    listReturnRef.current = { y: window.scrollY, id }
    setReporting(false)
    setComment('')
    setDetailNotice('')
    setFormNotice('')
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
    formSessionRef.current += 1
    formDirtyRef.current = false
    setFormNotice('')
    setWriteKind(queryRef.current.kind === 'question' ? 'question' : 'discussion') // 질문 탭에서 열면 질문으로 시작
    setWriting(true)
  }

  const cancelWriting = () => {
    if (!confirmLeave(formDirtyRef.current)) return
    formSessionRef.current += 1 // 저장 중에 취소했다면 그 결과는 이후 폼을 건드리지 않는다
    formDirtyRef.current = false
    setFormNotice('')
    setWriting(false)
  }

  // 질문으로 올릴 때만 질문 값을 보낸다 (토론은 지금 서버 형식 그대로)
  const questionFields = (f) => (f.kind === 'question' ? { chapter: f.chapter, blocks: f.blocks } : undefined)

  const create = async (form) => {
    if (!beginBusy()) return
    const session = formSessionRef.current
    setFormNotice('')
    try {
      await api.createBoardPost(form.title, form.body, questionFields(form))
      // 저장하는 사이 폼을 닫았거나(취소·다른 글 열기) 다른 폼을 열었다면 지금 화면의 폼은 건드리지 않는다
      if (session === formSessionRef.current) {
        formDirtyRef.current = false
        setWriting(false)
      }
      loadList(1)
      showToast(form.kind === 'question' ? '질문을 올렸어요' : '글을 올렸어요')
    } catch (e) {
      // 실패하면 폼과 입력은 그대로. 서버 연결 전 기능은 폼 안에 이유를 남긴다 (토론으로 대신 저장하지 않음)
      if (e.kind === 'unsupported') {
        if (session === formSessionRef.current) setFormNotice(`${e.message} ${UNSUPPORTED_KEEP}`)
      } else showToast(e.message)
    } finally {
      endBusy()
    }
  }

  const startEditing = () => {
    formSessionRef.current += 1
    formDirtyRef.current = false
    setFormNotice('')
    setEditing(true)
  }

  const cancelEditing = () => {
    if (!confirmLeave(formDirtyRef.current)) return
    formSessionRef.current += 1 // 저장 중에 취소했다면 그 결과는 이후 폼을 건드리지 않는다
    formDirtyRef.current = false
    setFormNotice('')
    setEditing(false)
  }

  // 저장 뒤 글 다시 불러오기 (조회만) — failText: 불러오지 못했을 때 안내 앞부분
  const reloadDetail = async (postId, failText = '글은 고쳤지만 고친 내용을') => {
    try {
      const d = await api.boardPost(postId)
      if (openIdRef.current !== postId) return
      setDetail({ ...d, postId })
      setDetailNotice('')
    } catch (e) {
      if (openIdRef.current !== postId) return
      setDetailNotice(`${failText} 불러오지 못했어요 (${e.message}). 아래는 바뀌기 전 내용이에요.`)
    }
  }

  const update = async (form) => {
    if (!beginBusy()) return
    const postId = openIdRef.current
    const session = formSessionRef.current
    setFormNotice('')
    try {
      await api.updateBoardPost(postId, form.title, form.body, questionFields(form))
    } catch (e) {
      // 저장 실패: 폼과 입력은 그대로
      if (e.kind === 'unsupported') {
        if (session === formSessionRef.current) setFormNotice(`${e.message} 고친 내용은 그대로 있어요.`)
      } else showToast(e.message)
      endBusy()
      return
    }
    // 저장 성공 — 이후 조회가 실패해도 저장 실패로 보이지 않게 따로 안내한다 (고치기 요청은 다시 보내지 않음)
    // 그사이 취소했거나 다시 고치기를 열었다면 지금 열린 폼과 입력 표시는 건드리지 않는다
    if (openIdRef.current === postId && session === formSessionRef.current) {
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
    if (!window.confirm(`이 글을 지울까요? ${replyWord}도 함께 지워져요.`)) return
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

  // 댓글(토론)·답변(질문) 쓰기 — 지금 서버의 댓글 요청을 그대로 쓴다
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

  // 답변 채택·채택 취소 (질문 작성자만) — 서버 연결 전이면 안내만 하고 화면은 바꾸지 않는다
  const toggleAccept = async (answer) => {
    if (!beginBusy()) return
    const postId = openIdRef.current
    try {
      await api.acceptBoardAnswer(postId, answer.accepted ? null : answer.id)
    } catch (e) {
      showToast(e.message)
      endBusy()
      return
    }
    showToast(answer.accepted ? '채택을 취소했어요' : '답변을 채택했어요')
    loadList(page)
    await reloadDetail(postId, '채택은 반영됐지만 바뀐 내용을')
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
  // 상단 메뉴·푸터: 목적지는 App 규칙 그대로. 코딩 게시판 메뉴, 교사·보호자의 학생 전용 메뉴는 이 화면에 머문다
  const handleMenu = (key) => {
    if (!staysOnBoard(key, user) && !confirmLeave()) return
    const r = onMenu?.(key)
    if (r?.toast) showToast(r.toast)
  }
  const goHome = () => { if (confirmLeave()) onGoHome?.() }
  const logout = () => { if (confirmLeave()) onLogout?.() }

  const emptyLater = list && !list.error && !list.unsupported && list.posts.length === 0 && page > 1
  const filtered = hasConditions(query)
  const emptyText = filtered ? '조건에 맞는 글이 없어요.'
    : query.kind === 'question' ? '아직 질문이 없어요. 막힌 문제가 있으면 질문을 올려 보세요!'
      : query.kind === 'discussion' ? '아직 토론 글이 없어요. 첫 글을 올려 보세요!'
        : '아직 글이 없어요. 첫 글을 올려 보세요!'

  // 질문 답변: 채택된 답변은 '채택된 답변' 칸에 따로 보여 준다
  const comments = loaded?.comments ?? []
  const acceptedAnswers = isQuestion ? comments.filter((c) => c.accepted) : []
  const otherComments = isQuestion ? comments.filter((c) => !c.accepted) : comments

  const renderComment = (c) => (
    <div key={c.id} className={`board-comment${c.accepted ? ' is-accepted' : ''}`}>
      <Author id={c.user_id} onOpenProfile={setProfileId}>{c.username}</Author>
      <p>
        {c.accepted && <b className="board-accepted-mark">채택된 답변 </b>}
        {c.body}
      </p>
      <span>{fmt(c.created_at)}</span>
      {(c.user_id === user?.id || post?.is_mine) && (
        <button type="button" className="row-remove" onClick={() => removeComment(c.id)} disabled={busy} aria-label={`${replyWord} 지우기`}>×</button>
      )}
      {/* 질문 작성자는 답변을 채택·취소할 수 있다. 서버 규칙에 맞춰 자기 답변도 채택할 수 있다
          (스스로 해결한 질문을 '해결됨'으로 표시하는 방법) */}
      {isQuestion && post.is_mine && (
        <button type="button" className="board-link board-accept" onClick={() => toggleAccept(c)} disabled={busy}>
          {c.accepted ? '채택 취소' : '채택하기'}
        </button>
      )}
    </div>
  )

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
            <h2 ref={headRef}>코딩 게시판</h2>
            <p>궁금한 점을 묻고, 생각과 작품 이야기를 나눠요.</p>
          </div>
          {!writing && !openId && (
            <button type="button" className="role-btn" onClick={startWriting}>글 쓰기</button>
          )}
        </header>

        {writing && (
          <BoardPostForm defaultKind={writeKind} onSubmit={create} onCancel={cancelWriting} busy={busy}
            notice={formNotice} onDirtyChange={(d) => { formDirtyRef.current = d }} />
        )}

        {/* 글 상세 */}
        {openId && (
          <article className="board-detail" ref={detailRef}>
            <button type="button" className="board-back" onClick={backToList}>← 목록으로</button>

            {!loaded ? (
              <p className="dash-hint" role="status">불러오는 중…</p>
            ) : editing ? (
              <BoardPostForm
                initial={{ kind: post.kind, title: post.title, body: post.body, chapter: post.chapter, blocks: post.blocks }}
                onSubmit={update} onCancel={cancelEditing} busy={busy} notice={formNotice}
                onDirtyChange={(d) => { formDirtyRef.current = d }} />
            ) : (
              <>
                {detailNotice && (
                  <p className="dash-hint" role="alert">
                    {detailNotice}{' '}
                    <button type="button" className="link-btn" onClick={() => reloadDetail(loaded.postId)}>다시 불러오기</button>
                  </p>
                )}
                <p className="board-badges"><PostBadges post={post} /><PostTags post={post} /></p>
                <h3>{post.title}</h3>
                <p className="board-meta">
                  <Author id={post.user_id} onOpenProfile={setProfileId}>
                    {post.username}
                  </Author>
                  <span>{fmt(post.created_at)}</span>
                  {post.is_mine ? (
                    <>
                      <button type="button" className="board-link" onClick={startEditing}>고치기</button>
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

                <p className="board-body">{post.body}</p>

                <section className="board-comments">
                  <h4>{replyWord} {comments.length}개</h4>
                  {isQuestion && (
                    <div className="board-accepted">
                      <h5>채택된 답변</h5>
                      {acceptedAnswers.length > 0 ? acceptedAnswers.map(renderComment) : (
                        <p className="board-accepted-empty">
                          아직 채택된 답변이 없어요.{post.is_mine && ' 도움이 된 답변이 있으면 채택해 주세요.'}
                          {!BOARD_SERVER.accept && ' (채택은 서버 연결 뒤에 쓸 수 있어요)'}
                        </p>
                      )}
                    </div>
                  )}
                  {otherComments.map(renderComment)}
                  <form className="board-comment-form" onSubmit={addComment}>
                    <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500}
                      placeholder={`${replyWord} 쓰기 (500자까지)`} aria-label={replyWord} />
                    <button type="submit" className="role-btn" disabled={busy || !comment.trim()}>등록</button>
                  </form>
                </section>
              </>
            )}
          </article>
        )}

        {/* 목록 */}
        {!openId && (
          <BoardFilters query={query} onQuery={changeQuery} searchInput={searchInput} onSearchInput={setSearchInput}
            onSearch={applySearch} onClearSearch={clearSearch} />
        )}
        {!openId && (
          !list ? (
            <>
              <p className="sr-only" role="status">글 목록을 불러오는 중이에요</p>
              <div className="skeleton-card board-skeleton" aria-hidden="true" />
            </>
          ) : list.unsupported ? (
            <div className="board-note is-pending" role="status">
              <p><b>{list.unsupported}</b> 서버가 준비되면 여기에서 볼 수 있어요.</p>
              <p className="board-note-actions">
                {query.q && <button type="button" className="link-btn" onClick={clearSearch}>검색어 지우기</button>}
                {query.kind === 'question' && (
                  <button type="button" className="link-btn" onClick={() => changeQuery({ kind: 'discussion' })}>토론 글 보기</button>
                )}
              </p>
            </div>
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
            <div className="empty-msg">
              <p>{emptyText}</p>
              {filtered && <button type="button" className="link-btn" onClick={clearConditions}>조건 지우기</button>}
            </div>
          ) : (
            <>
              {query.kind === 'all' && !BOARD_SERVER.questions && (
                <p className="board-note">지금은 토론 글만 보여요. 질문 글은 서버 연결 뒤에 함께 보여요.</p>
              )}
              <ul className="board-list">
                {list.posts.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="board-row" data-post-id={p.id} onClick={() => openPost(p.id)}>
                      <span className="board-row-top">
                        <PostBadges post={p} />
                        <span className="board-title">{p.title}</span>
                      </span>
                      <PostTags post={p} />
                      <span className="board-row-meta">
                        {p.username} · {fmt(p.created_at)}
                        <b> · {p.kind === 'question' ? '답변' : '댓글'} {p.replyCount}</b>
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
