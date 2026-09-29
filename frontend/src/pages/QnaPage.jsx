import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import TopNav from '../components/TopNav'
import './QnaPage.css'

/* backend/models/QuestionModel.php의 CATEGORIES와 맞춤 */
const CATEGORIES = ['블록 오류', '자유창작 팁', '일반 질문']

function fmtDate(str) {
  if (!str) return ''
  return new Date(str.replace(' ', 'T')).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/* ════════════════════════════════════════════════
   QnaPage — Q&A 게시판 1차 구현 (목록/작성/상세+답변)
   화면설계서 WEB-BOARD-001 구조 기준, 목록·상세는 비로그인도 열람 가능
   ════════════════════════════════════════════════ */
export default function QnaPage({ user, onBack, onAuth, onLogout, onOpenEditor, onGoDashboard }) {
  const [view, setView] = useState('list') // 'list' | 'write' | 'detail'
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [category, setCategory] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [form, setForm] = useState({ category: CATEGORIES[0], title: '', body: '' })
  const [submitting, setSubmitting] = useState(false)
  const [detail, setDetail] = useState(null) // { question, answers }
  const [detailLoading, setDetailLoading] = useState(false)
  const [answerBody, setAnswerBody] = useState('')
  const [answerSubmitting, setAnswerSubmitting] = useState(false)
  const [toast, setToast] = useState('')
  const toastTimer = useRef(0)

  const showToast = (msg) => {
    clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), 3200)
  }
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  useEffect(() => {
    if (view !== 'list') return
    let alive = true
    api.questions(category === 'all' ? null : category, keyword || null)
      .then((list) => { if (alive) { setQuestions(list); setError('') } })
      .catch((e) => { if (alive) setError(e.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [view, category, keyword])

  const openList = () => { setDetail(null); setView('list') }
  const changeCategory = (c) => { setLoading(true); setCategory(c) }

  const openDetail = (id) => {
    setView('detail')
    setDetailLoading(true)
    Promise.all([api.getQuestion(id), api.answers(id)])
      .then(([question, answers]) => setDetail({ question, answers }))
      .catch((e) => showToast(e.message))
      .finally(() => setDetailLoading(false))
  }

  const startWrite = () => {
    if (!user) { onAuth?.(); return }
    setForm({ category: CATEGORIES[0], title: '', body: '' })
    setView('write')
  }

  const submitQuestion = async (e) => {
    e.preventDefault()
    if (!user) { onAuth?.(); return }
    if (!form.title.trim() || !form.body.trim()) return
    setSubmitting(true)
    try {
      const res = await api.createQuestion(form.category, form.title.trim(), form.body.trim())
      showToast('질문이 등록됐어요!')
      openDetail(res.id)
    } catch (err) {
      showToast(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const submitAnswer = async () => {
    if (!user) { onAuth?.(); return }
    if (!answerBody.trim() || !detail) return
    setAnswerSubmitting(true)
    try {
      await api.createAnswer(detail.question.id, answerBody.trim())
      setAnswerBody('')
      const answers = await api.answers(detail.question.id)
      setDetail((d) => (d ? { ...d, answers } : d))
    } catch (err) {
      showToast(err.message)
    } finally {
      setAnswerSubmitting(false)
    }
  }

  const removeQuestion = async () => {
    if (!detail || !window.confirm('이 질문을 삭제할까요? 되돌릴 수 없어요.')) return
    try {
      await api.deleteQuestion(detail.question.id)
      openList()
    } catch (err) {
      showToast(err.message)
    }
  }

  const removeAnswer = async (id) => {
    if (!detail || !window.confirm('이 답변을 삭제할까요?')) return
    try {
      await api.deleteAnswer(id)
      const answers = await api.answers(detail.question.id)
      setDetail((d) => (d ? { ...d, answers } : d))
    } catch (err) {
      showToast(err.message)
    }
  }

  // 공통 TopNav 메뉴 클릭 처리 (Q&A 메뉴 자체는 이미 이 화면이므로 무시)
  const handleNavigate = (key) => {
    if (key === 'qna') return
    if (key === 'study') { user ? onGoDashboard?.() : onAuth?.() }
    else if (key === 'free') { user ? onOpenEditor?.({ mode: 'free' }) : onAuth?.() }
    else showToast('🚧 이 메뉴는 곧 만나볼 수 있어요. 지금은 준비 중이에요!')
  }

  const handleSearch = (e) => {
    e.preventDefault()
    setLoading(true)
    setKeyword(searchInput.trim())
  }

  return (
    <div className="qna-root">
      {toast && <div className="qna-toast" role="status">{toast}</div>}
      <TopNav user={user} active="qna" onNavigate={handleNavigate} onBrandClick={onBack}
        onLogin={onAuth} onSignup={onAuth} onLogout={onLogout} />

      <main className="qna-main">
        {view === 'list' && (
          <>
            <div className="qna-head">
              <h1>Q&amp;A 게시판</h1>
              <p>코딩하다 막혔을 때 물어보고, 친구들의 질문에 답해주세요.</p>
            </div>

            <form className="qna-search" onSubmit={handleSearch}>
              <input type="text" placeholder="질문 제목이나 내용을 검색해보세요" value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)} aria-label="질문 검색" />
              <button type="submit">검색</button>
            </form>

            <div className="qna-toolbar">
              <div className="qna-cats">
                <button type="button" className={category === 'all' ? 'on' : ''} onClick={() => changeCategory('all')}>전체</button>
                {CATEGORIES.map((c) => (
                  <button key={c} type="button" className={category === c ? 'on' : ''} onClick={() => changeCategory(c)}>{c}</button>
                ))}
              </div>
              <button type="button" className="qna-btn-write" onClick={startWrite}>✏️ 질문하기</button>
            </div>

            {loading ? (
              <div className="qna-empty">불러오는 중…</div>
            ) : error ? (
              <div className="qna-empty" role="alert">질문을 불러오지 못했어요: {error}</div>
            ) : questions.length === 0 ? (
              <div className="qna-empty">
                {keyword || category !== 'all' ? '조건에 맞는 질문이 없어요.' : '아직 등록된 질문이 없어요. 첫 질문을 남겨보세요!'}
              </div>
            ) : (
              <div className="qna-list">
                {questions.map((q) => (
                  <button key={q.id} type="button" className="qna-card" onClick={() => openDetail(q.id)}>
                    <span className="qna-card-cat">{q.category}</span>
                    <span className="qna-card-title">{q.title}</span>
                    <span className="qna-card-meta">
                      <span>{q.username}</span>
                      <span aria-hidden="true">·</span>
                      <span>{fmtDate(q.created_at)}</span>
                      <span className="qna-card-answers">💬 {q.answer_count}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {view === 'write' && (
          <form className="qna-write" onSubmit={submitQuestion}>
            <button type="button" className="qna-back" onClick={openList}>← 목록으로</button>
            <h2>새 질문 작성하기</h2>
            <label className="qna-field">
              <span>카테고리</span>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="qna-field">
              <span>제목</span>
              <input type="text" maxLength={100} placeholder="무엇이 궁금한가요?" value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
            </label>
            <label className="qna-field">
              <span>내용</span>
              <textarea rows={8} maxLength={2000} placeholder="어떤 블록을 사용했는지, 어떤 문제가 생겼는지 자세히 적어주세요"
                value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} required />
            </label>
            <div className="qna-write-actions">
              <button type="button" className="qna-btn-ghost" onClick={openList}>취소</button>
              <button type="submit" className="qna-btn-write" disabled={submitting}>{submitting ? '등록 중…' : '질문 등록하기'}</button>
            </div>
          </form>
        )}

        {view === 'detail' && (
          <div className="qna-detail">
            <button type="button" className="qna-back" onClick={openList}>← 목록으로</button>
            {detailLoading || !detail ? (
              <div className="qna-empty">불러오는 중…</div>
            ) : (
              <>
                <div className="qna-detail-card">
                  <span className="qna-card-cat">{detail.question.category}</span>
                  <h2>{detail.question.title}</h2>
                  <div className="qna-detail-meta">
                    <span>{detail.question.username}</span>
                    <span aria-hidden="true">·</span>
                    <span>{fmtDate(detail.question.created_at)}</span>
                  </div>
                  <p className="qna-detail-body">{detail.question.body}</p>
                  {Number(detail.question.user_id) === Number(user?.id) && (
                    <button type="button" className="qna-delete" onClick={removeQuestion}>🗑️ 질문 삭제</button>
                  )}
                </div>

                <div className="qna-answers">
                  <h3>답변 {detail.answers.length}개</h3>
                  {detail.answers.length === 0 ? (
                    <div className="qna-empty">아직 답변이 없어요. 첫 답변을 남겨보세요!</div>
                  ) : (
                    detail.answers.map((a) => (
                      <div key={a.id} className="qna-answer">
                        <div className="qna-answer-head">
                          <span className="qna-answer-author">{a.username}</span>
                          <span className="qna-answer-date">{fmtDate(a.created_at)}</span>
                        </div>
                        <p>{a.body}</p>
                        {Number(a.user_id) === Number(user?.id) && (
                          <button type="button" className="qna-delete" onClick={() => removeAnswer(a.id)}>삭제</button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="qna-answer-form">
                  <textarea rows={3} maxLength={1000}
                    placeholder={user ? '코코딩 친구에게 도움을 주는 답변을 남겨볼까요?' : '로그인하면 답변을 남길 수 있어요'}
                    value={answerBody} onChange={(e) => setAnswerBody(e.target.value)} disabled={!user} />
                  <button type="button" className="qna-btn-write" onClick={submitAnswer} disabled={answerSubmitting}>
                    {user ? (answerSubmitting ? '등록 중…' : '답변 등록') : '로그인하고 답변하기'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
