import { useCallback, useEffect, useState } from 'react'
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

  useEffect(() => {
    const down = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [onClose])

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
    <div className="modal-backdrop" role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal assign-detail-modal" role="dialog" aria-modal="true" aria-labelledby="assign-detail-title">
        <div className="modal-head">
          <h3 id="assign-detail-title">{assignTitle(row)}</h3>
          <button type="button" className="modal-x" onClick={onClose} aria-label="닫기">×</button>
        </div>

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

        <div className="modal-foot">
          <button type="button" className="role-btn ghost" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}

/* ── 선생님 화면 (반 상세 안에 들어감) ───────────── */
export function TeacherAssignments({ classId, showToast }) {
  const [list, setList] = useState(null)
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

  const load = useCallback(() => {
    api.assignments(classId).then(setList).catch(() => setList([]))
  }, [classId])

  useEffect(() => {
    let alive = true
    api.assignments(classId)
      .then((r) => { if (alive) setList(r) })
      .catch(() => { if (alive) setList([]) })
    return () => { alive = false }
  }, [classId])

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
      setList((l) => l.filter((x) => x.id !== a.id))
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

      {list && list.length === 0 && <p className="dash-hint">아직 낸 과제가 없어요.</p>}

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
