import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { api } from '../api/client'
import { CHAPTERS, CHAPTER_COUNT } from '../data/chapters'
import './Assignments.css'

/* ════════════════════════════════════════════════
   선생님이 반에 내주는 과제
   · 챕터 과제 — 그 챕터를 통과하면 자동으로 완료
   · 자유 과제 — 챕터 없이 제목만 적어서 내고, 학생이 '끝냈어요'로 표시
   · StudentAssignments  학생: 받은 과제 목록, 챕터로 이동 / 끝냄 표시
   · TeacherAssignments  선생님: 과제 내기·고치기·취소, 학생별 수행 현황
   ════════════════════════════════════════════════ */

const MAX_REWARD = 100
const MAX_NOTE = 200
const MAX_TITLE = 80

// 마감일까지 며칠 남았는지
function dueLabel(due) {
  if (!due) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${due}T00:00:00`)
  const days = Math.round((target - today) / 86400000)
  if (days < 0) return { text: `${-days}일 지남`, cls: 'is-late' }
  if (days === 0) return { text: '오늘까지', cls: 'is-today' }
  if (days === 1) return { text: '내일까지', cls: 'is-soon' }
  return { text: `${days}일 남음`, cls: '' }
}

// 챕터 과제는 챕터 제목, 자유 과제는 선생님이 적은 제목
function assignTitle(a) {
  if (a.chapter_id) return CHAPTERS[a.order_num]?.title ?? a.title ?? `챕터 ${a.order_num}`
  return a.title || '제목 없는 과제'
}

// '2026-11-03 21:04:00' → '11월 3일 21:04'
function whenLabel(ts) {
  if (!ts) return null
  const d = new Date(String(ts).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return String(ts)
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getHours()}:${mm}`
}

const clampReward = (v) => Math.max(0, Math.min(MAX_REWARD, Math.floor(Number(v) || 0)))

/* ── 학생 화면 ─────────────────────────────────── */
export function StudentAssignments({ onOpenChapter }) {
  const [list, setList] = useState(null)
  const [noteFor, setNoteFor] = useState(null) // 메모를 적는 중인 과제 id
  const [draft, setDraft] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [msg, setMsg] = useState(null) // { id, text }

  useEffect(() => {
    let alive = true
    api.assignments()
      .then((r) => { if (alive) setList(r) })
      .catch(() => { if (alive) setList([]) })
    return () => { alive = false }
  }, [])

  const markDone = async (a) => {
    setBusyId(a.id)
    try {
      const res = await api.markAssignmentDone(a.id, draft.trim())
      setList((l) => l.map((x) => (x.id === a.id ? { ...x, done: true } : x)))
      setMsg({ id: a.id, text: res.message })
      setNoteFor(null)
      setDraft('')
    } catch (err) {
      setMsg({ id: a.id, text: err.message })
    } finally {
      setBusyId(null)
    }
  }

  if (!list || list.length === 0) return null // 과제가 없으면 섹션 자체를 숨긴다

  const left = list.filter((a) => !a.done)
  const done = list.filter((a) => a.done)

  const card = (a) => {
    const free = !a.chapter_id
    const due = dueLabel(a.due_on)
    const head = (
      <>
        <span className={`assign-chapter ${free ? 'is-free' : ''}`}>
          {free ? '자유 과제' : `챕터 ${a.order_num}`}
        </span>
        <span className="assign-body">
          <b>{assignTitle(a)}</b>
          {a.note && <small>{a.note}</small>}
          <small className="assign-class">{a.class_name}</small>
        </span>
        <span className="assign-right">
          {a.reward_coins > 0 && (
            <span className="assign-coin" title={`끝내면 ${a.reward_coins}코인`}>{a.reward_coins}코인</span>
          )}
          {a.done
            ? <span className="assign-state is-ok">완료</span>
            : <span className={`assign-state ${due?.cls ?? ''}`}>{due ? due.text : (free ? '해보자!' : '하러 가기 →')}</span>}
        </span>
      </>
    )

    // 챕터 과제: 누르면 그 챕터로
    if (!free) {
      return (
        <button key={a.id} type="button" className={`assign-card ${a.done ? 'is-done' : ''}`}
          onClick={() => onOpenChapter(a.chapter_id)}>
          {head}
        </button>
      )
    }

    // 자유 과제: 갈 챕터가 없으니 직접 '끝냈어요'를 누른다
    return (
      <div key={a.id} className={`assign-card is-free-card ${a.done ? 'is-done' : ''}`}>
        <div className="assign-card-top">{head}</div>

        {msg?.id === a.id && <p className="assign-done-msg" role="status">{msg.text}</p>}

        {!a.done && (noteFor === a.id ? (
          <div className="assign-done-box">
            <label className="assign-note-label" htmlFor={`assign-note-${a.id}`}>무엇을 했는지 적어도 좋아요 (안 적어도 돼요)</label>
            <textarea id={`assign-note-${a.id}`} className="assign-note-input" rows={2} maxLength={MAX_NOTE}
              value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder="예: 동생이랑 같이 애니메이션을 만들었어요" />
            <div className="assign-actions">
              <small className="assign-note-count">{draft.length}/{MAX_NOTE}자</small>
              <button type="button" className="role-btn ghost assign-mini" disabled={busyId === a.id}
                onClick={() => { setNoteFor(null); setDraft('') }}>취소</button>
              <button type="button" className="role-btn assign-mini" disabled={busyId === a.id}
                onClick={() => markDone(a)}>{busyId === a.id ? '보내는 중…' : '끝냈어요!'}</button>
            </div>
          </div>
        ) : (
          <div className="assign-actions">
            <button type="button" className="role-btn assign-mini"
              onClick={() => { setNoteFor(a.id); setDraft(''); setMsg(null) }}>끝냈어요</button>
          </div>
        ))}
      </div>
    )
  }

  return (
    <section className="dash-section">
      <div className="section-header">
        <h3 className="section-title">선생님이 내준 과제</h3>
        <span className="section-badge">{left.length > 0 ? `${left.length}개 남음` : '모두 완료'}</span>
      </div>

      <div className="assign-list">
        {left.map(card)}
        {done.length > 0 && (
          <>
            <h4 className="assign-group-title">끝낸 과제 {done.length}개</h4>
            {done.map(card)}
          </>
        )}
      </div>
    </section>
  )
}

/* ── 선생님: 과제 1개의 학생별 수행 현황 ─────────── */
function AssignmentDetail({ row, onClose }) {
  const [detail, setDetail] = useState(null)
  const [error, setError] = useState(null)
  const id = row.id

  useEffect(() => {
    let alive = true
    api.assignmentDetail(id)
      .then((d) => { if (alive) setDetail(d) })
      .catch((err) => { if (alive) setError(err.message) })
    return () => { alive = false }
  }, [id])

  const titleId = useId()
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // 열려 있는 동안: 배경 스크롤을 막고 초점을 창 안으로. 닫히면 스크롤 상태와 '자세히 보기' 버튼으로 초점을 되돌린다.
  // Esc 는 초점이 어디 있든 닫는다 (StrictMode 의 두 번 실행에도 원래 값으로 돌아간다)
  useEffect(() => {
    const opener = document.activeElement
    const body = document.body
    const prevOverflow = body.style.overflow
    const prevPadding = body.style.paddingRight
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`
    panelRef.current?.focus({ preventScroll: true })
    const down = (e) => { if (e.key === 'Escape') onCloseRef.current() }
    window.addEventListener('keydown', down)
    return () => {
      window.removeEventListener('keydown', down)
      body.style.overflow = prevOverflow
      body.style.paddingRight = prevPadding
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [])

  // Tab·Shift+Tab 은 창 안에서만 돈다
  const trapTab = (e) => {
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    const items = [...panel.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    if (items.length === 0) { e.preventDefault(); panel.focus(); return }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (active === panel || !panel.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return }
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
  }

  const free = !row.chapter_id
  const students = detail?.students ?? []
  // 챕터 과제는 점수·제출 횟수, 자유 과제는 적은 메모를 보여준다
  const metaOf = (s) => {
    const parts = []
    if (!free) parts.push(s.attempts > 0 ? `최고 ${s.best_score ?? 0}점 · ${s.attempts}번 제출` : '아직 안 풀어봤어요')
    if (s.done_at) parts.push(whenLabel(s.done_at))
    return parts.join(' · ')
  }

  return (
    <div className="assign-detail-overlay" role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={panelRef} className="assign-detail-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}
        tabIndex={-1} onKeyDown={trapTab}>
        <div className="assign-detail-head">
          <h3 id={titleId}>{assignTitle(row)}</h3>
          <button type="button" className="assign-detail-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {/* 내용이 길면 여기만 스크롤 — 키보드로도 스크롤할 수 있게 초점을 받고 이름을 붙인다 */}
        <div className="assign-detail-main" role="region" aria-label="과제 정보와 학생별 수행 현황" tabIndex={0}>
        <div className="assign-detail-sum">
          <span className={`assign-badge ${free ? 'is-free' : ''}`}>{free ? '자유 과제' : `챕터 ${row.order_num}`}</span>
          {row.due_on && <span className="assign-detail-chip">마감 {row.due_on}</span>}
          {row.reward_coins > 0 && <span className="assign-coin">{row.reward_coins}코인</span>}
          {detail && <span className="assign-detail-chip is-count">{detail.doneCount}/{students.length}명 완료</span>}
        </div>
        {row.note && <p className="assign-detail-note-teacher">“{row.note}”</p>}

        {error && <p className="form-error">{error}</p>}
        {!detail && !error && <p className="dash-hint">불러오는 중…</p>}

        {detail && students.length === 0 && <p className="dash-hint">아직 이 반에 학생이 없어요.</p>}

        {detail && students.length > 0 && (
          <ul className="assign-detail-list">
            {students.map((s) => (
              <li key={s.id} className={s.done ? 'is-done' : ''}>
                <div className="assign-detail-row">
                  <span className="assign-detail-name">{s.username}</span>
                  <span className={`assign-detail-state ${s.done ? 'is-ok' : ''}`}>{s.done ? '완료' : '아직'}</span>
                </div>
                {metaOf(s) && <span className="assign-detail-meta">{metaOf(s)}</span>}
                {free && s.student_note && <p className="assign-detail-memo">“{s.student_note}”</p>}
                {free && s.done && !s.student_note && <span className="assign-detail-meta">적어둔 메모 없음</span>}
              </li>
            ))}
          </ul>
        )}
        </div>

        <div className="assign-detail-foot">
          <button type="button" className="role-btn ghost" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

/* ── 선생님 화면 (반 상세 안에 들어감) ───────────── */
export function TeacherAssignments({ classId, showToast }) {
  // 과제 목록: 어느 반의 목록인지(forClass)와 실패(error)를 함께 둔다.
  // 실패는 빈 목록으로 바꾸지 않고, 같은 반의 이전 목록은 남겨 둔다
  // error.afterWrite: 과제 내기·고치기는 됐는데 그 뒤 목록 조회만 실패한 경우
  const [listState, setListState] = useState({ forClass: null, items: null, error: null, loading: false })
  const listSeq = useRef(0)
  const mounted = useRef(true)
  const classIdRef = useRef(classId)
  useEffect(() => { classIdRef.current = classId }, [classId])
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const sameClass = listState.forClass === classId
  const list = sameClass ? listState.items : null
  const listError = sameClass ? listState.error : null
  const listLoading = !sameClass || listState.loading
  const [kind, setKind] = useState('chapter') // 'chapter' | 'free'
  const [chapter, setChapter] = useState('1')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [due, setDue] = useState('')
  const [reward, setReward] = useState('0')
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState(null)
  const [draft, setDraft] = useState({ title: '', note: '', due_on: '', reward_coins: '0' })
  const [saving, setSaving] = useState(false)
  const [openId, setOpenId] = useState(null)

  // 목록 GET 만 보낸다. 마지막으로 보낸 요청이고, 화면이 남아 있고, 그 반을 아직 보고 있을 때만 반영한다
  const fetchList = useCallback((targetClass, afterWrite = false) => {
    const my = ++listSeq.current
    api.assignments(targetClass).then(
      (items) => {
        if (!mounted.current || my !== listSeq.current || classIdRef.current !== targetClass) return
        setListState({ forClass: targetClass, items: Array.isArray(items) ? items : [], error: null, loading: false })
      },
      (err) => {
        if (!mounted.current || my !== listSeq.current || classIdRef.current !== targetClass) return
        setListState((s) => ({
          forClass: targetClass,
          items: s.forClass === targetClass ? s.items : null,
          error: { message: err.message, afterWrite },
          loading: false,
        }))
      },
    )
  }, [])

  // 쓰기(내기·고치기) 성공 뒤 목록 다시 받기 — 지금 보고 있는 반의 목록을 받는다
  const load = useCallback(() => {
    setListState((s) => (s.forClass === classIdRef.current ? { ...s, loading: true } : s))
    fetchList(classIdRef.current, true)
  }, [fetchList])

  // '다시 시도' — 지금 반의 과제 목록 GET 만 다시 보낸다 (쓰기 요청은 다시 보내지 않는다)
  const retryList = () => {
    setListState((s) => (s.forClass === classId ? { ...s, error: null, loading: true } : s))
    fetchList(classId)
  }

  useEffect(() => {
    fetchList(classId)
  }, [classId, fetchList])

  const create = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const body = { class_id: classId, note: note.trim(), due_on: due, reward_coins: clampReward(reward) }
      if (kind === 'chapter') body.chapter_id = Number(chapter)
      else body.title = title.trim()
      const res = await api.createAssignment(body)
      showToast(res.message)
      setTitle('')
      setNote('')
      setDue('')
      setReward('0')
      load()
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  const startEdit = (a) => {
    setEditId(a.id)
    setDraft({
      title: a.chapter_id ? '' : (a.title ?? ''),
      note: a.note ?? '',
      due_on: a.due_on ?? '',
      reward_coins: String(a.reward_coins ?? 0),
    })
  }

  const saveEdit = async (e, a) => {
    e.preventDefault()
    setSaving(true)
    try {
      const body = { note: draft.note.trim(), due_on: draft.due_on, reward_coins: clampReward(draft.reward_coins) }
      if (!a.chapter_id) body.title = draft.title.trim()
      const res = await api.updateAssignment(a.id, body)
      showToast(res.message)
      setEditId(null)
      load()
    } catch (err) {
      showToast(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (a) => {
    if (!window.confirm(`'${assignTitle(a)}' 과제를 취소할까요?`)) return
    try {
      await api.deleteAssignment(a.id)
      if (!mounted.current) return
      setListState((s) => (s.items ? { ...s, items: s.items.filter((x) => x.id !== a.id) } : s))
      if (openId === a.id) setOpenId(null)
      if (editId === a.id) setEditId(null)
    } catch (err) {
      showToast(err.message)
    }
  }

  const openRow = (list ?? []).find((a) => a.id === openId) ?? null
  const field = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target.value }))

  return (
    <div className="assign-teacher">
      <h4 className="assign-teacher-title">과제 내기</h4>

      <form className="assign-form" onSubmit={create}>
        <div className="assign-kind" role="radiogroup" aria-label="과제 종류">
          <label className={`assign-kind-opt ${kind === 'chapter' ? 'on' : ''}`}>
            <input type="radio" name={`assign-kind-${classId}`} value="chapter"
              checked={kind === 'chapter'} onChange={() => setKind('chapter')} />
            <span>챕터 과제</span>
          </label>
          <label className={`assign-kind-opt ${kind === 'free' ? 'on' : ''}`}>
            <input type="radio" name={`assign-kind-${classId}`} value="free"
              checked={kind === 'free'} onChange={() => setKind('free')} />
            <span>자유 과제</span>
          </label>
        </div>

        <div className="assign-form-row">
          {kind === 'chapter' ? (
            <select value={chapter} onChange={(e) => setChapter(e.target.value)} aria-label="과제로 낼 챕터">
              {Array.from({ length: CHAPTER_COUNT }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>챕터 {n} · {CHAPTERS[n]?.title.split(' – ')[0]}</option>
              ))}
            </select>
          ) : (
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={MAX_TITLE}
              placeholder="과제 제목 (예: 우리 가족 소개 애니메이션 만들기)" aria-label="자유 과제 제목" />
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_NOTE}
            placeholder="한마디 (예: 말하기 블록을 3개 이상 써보세요)" aria-label="과제 안내" />
        </div>

        <div className="assign-form-row">
          <label className="assign-field">마감일
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label className="assign-field">보상 코인 (0~{MAX_REWARD})
            <input type="number" min="0" max={MAX_REWARD} step="5" value={reward}
              onChange={(e) => setReward(e.target.value)} />
          </label>
          <button type="submit" className="role-btn assign-submit"
            disabled={busy || (kind === 'free' && !title.trim())}>내기</button>
        </div>
      </form>

      <p className="dash-hint assign-kind-hint">
        {kind === 'chapter'
          ? '챕터 과제는 학생이 그 챕터를 통과하면 자동으로 완료돼요.'
          : '자유 과제는 챕터 없이 제목만 적어서 내요. 학생이 “끝냈어요”를 누르면 완료로 표시돼요.'}
      </p>

      {/* 과제 목록: 불러오는 중 / 실패 / 실제로 빈 목록을 나눠 보여 준다 */}
      {listLoading && !list && <p className="dash-hint" role="status">과제 목록을 불러오는 중…</p>}

      {listError && (
        <div className="role-empty" role="alert">
          <b>
            {listError.afterWrite ? '저장은 됐지만 과제 목록을 새로 불러오지 못했어요'
              : list ? '과제 목록을 새로 불러오지 못했어요' : '과제 목록을 불러오지 못했어요'}
          </b>
          <span>{listError.message}{list ? ' 아래 목록은 이전에 불러온 내용이에요.' : ''}</span>
          <button type="button" className="role-btn ghost" onClick={retryList} disabled={sameClass && listState.loading}>다시 시도</button>
        </div>
      )}

      {list && list.length === 0 && !listError && <p className="dash-hint">아직 낸 과제가 없어요.</p>}

      {list && list.length > 0 && (
        <ul className="assign-teacher-list">
          {list.map((a) => (
            <li key={a.id} className={`${a.chapter_id ? 'is-chapter' : 'is-free'} ${editId === a.id ? 'is-editing' : ''}`}>
              <div className="assign-teacher-row">
                <span className={`assign-badge ${a.chapter_id ? '' : 'is-free'}`}>
                  {a.chapter_id ? `챕터 ${a.order_num}` : '자유'}
                </span>
                <span className="assign-teacher-name" title={assignTitle(a)}>{assignTitle(a)}</span>
                {a.reward_coins > 0 && <span className="assign-coin">{a.reward_coins}코인</span>}
                {a.due_on && <span className="assign-teacher-due">~{a.due_on.slice(5)}</span>}
                <span className="assign-teacher-count">{a.done_count}/{a.member_count}명 완료</span>
                <span className="assign-row-actions">
                  <button type="button" className="role-btn ghost assign-mini" onClick={() => setOpenId(a.id)}>자세히 보기</button>
                  <button type="button" className="role-btn ghost assign-mini" aria-expanded={editId === a.id}
                    onClick={() => (editId === a.id ? setEditId(null) : startEdit(a))}>수정</button>
                  <button type="button" className="row-remove" onClick={() => remove(a)}
                    aria-label={`${assignTitle(a)} 과제 취소`} title="과제 취소">×</button>
                </span>
              </div>

              {editId === a.id && (
                <form className="assign-edit-form" onSubmit={(e) => saveEdit(e, a)}>
                  {!a.chapter_id && (
                    <label className="assign-field">제목
                      <input value={draft.title} onChange={field('title')} maxLength={MAX_TITLE} required />
                    </label>
                  )}
                  <label className="assign-field assign-field-wide">안내
                    <input value={draft.note} onChange={field('note')} maxLength={MAX_NOTE} placeholder="한마디" />
                  </label>
                  <label className="assign-field">마감일
                    <input type="date" value={draft.due_on} onChange={field('due_on')} />
                  </label>
                  <label className="assign-field">보상 코인
                    <input type="number" min="0" max={MAX_REWARD} step="5" value={draft.reward_coins} onChange={field('reward_coins')} />
                  </label>
                  <div className="assign-edit-actions">
                    <button type="submit" className="role-btn assign-mini" disabled={saving}>저장</button>
                    <button type="button" className="role-btn ghost assign-mini" disabled={saving}
                      onClick={() => setEditId(null)}>취소</button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {openRow && <AssignmentDetail row={openRow} onClose={() => setOpenId(null)} />}
    </div>
  )
}
