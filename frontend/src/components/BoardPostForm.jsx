import { useEffect, useId, useRef, useState } from 'react'
import { BOARD_KIND_LABEL, CHAPTER_OPTIONS, MAX_BLOCK_TAGS, blockOptions, chapterLabel } from '../lib/boardTopics'

/* ════════════════════════════════════════════════
   코딩 게시판 글쓰기·고치기 폼 — 질문 / 토론을 한 폼에서
   · 질문만: 챕터(선택), 관련 블록 태그(선택, 최대 3개), 작성 안내(본문 밖, 글에 들어가지 않음)
   · 종류를 바꿔도 제목·본문·질문용 선택값은 그대로 둔다 (토론으로 올릴 때 질문 값은 부모가 보내지 않음)
   · 고치기에서는 글 종류를 바꿀 수 없다
   ════════════════════════════════════════════════ */
const QUESTION_GUIDE = ['무엇을 만들고 싶었나요?', '실제로 어떻게 동작했나요?', '어떤 방법을 시도했나요?']
const KIND_HELP = { question: '막힌 문제를 묻고 답변을 받아요', discussion: '생각과 작품 이야기를 나눠요' }
const BODY_PLACEHOLDER = {
  question: '어디서 막혔는지 적어 주세요 (1000자까지). 이름·학교·전화번호는 적지 마세요!',
  discussion: '만든 작품 이야기, 코딩하며 든 생각을 적어 보세요 (1000자까지). 이름·학교·전화번호는 적지 마세요!',
}

const sameForm = (a, b) => a.kind === b.kind && a.title === b.title && a.body === b.body
  && a.chapter === b.chapter && a.blocks.join(',') === b.blocks.join(',')

// initial: 고치기일 때 { kind, title, body, chapter, blocks } / defaultKind: 새 글의 처음 종류
// onSubmit({ kind, title, body, chapter, blocks }) / notice: 올리지 못한 이유(입력은 그대로 둔다)
// onDirtyChange(bool): 처음 값에서 바뀌었는지 — 이탈 확인에 쓴다
export default function BoardPostForm({ initial, defaultKind = 'discussion', onSubmit, onCancel, busy, onDirtyChange, notice }) {
  const editing = !!initial
  const [start] = useState(() => ({
    kind: initial?.kind ?? defaultKind,
    title: initial?.title ?? '',
    body: initial?.body ?? '',
    chapter: initial?.chapter ?? '',
    blocks: initial?.blocks ?? [],
  }))
  const [form, setForm] = useState(start)
  const [blockNote, setBlockNote] = useState('')
  const titleRef = useRef(null)
  const uid = useId()
  const guideId = `${uid}-guide`

  // 폼을 열면 제목 입력란으로 초점 (키보드 사용자가 바로 쓸 수 있게)
  useEffect(() => { titleRef.current?.focus() }, [])

  const change = (patch) => {
    const next = { ...form, ...patch }
    setForm(next)
    onDirtyChange?.(!sameForm(next, start))
  }

  // 챕터를 바꾸면 그 챕터까지 배우지 않은 블록은 선택에서 뺀다 (뺐다는 사실을 알려 준다)
  const changeChapter = (chapter) => {
    const allowed = new Set(blockOptions(chapter).map((o) => o.value))
    const kept = form.blocks.filter((b) => allowed.has(b))
    const dropped = form.blocks.length - kept.length
    setBlockNote(dropped ? `${chapterLabel(chapter)}까지 배우지 않은 블록 ${dropped}개는 선택에서 빠졌어요.` : '')
    change({ chapter, blocks: kept })
  }

  const toggleBlock = (type) => {
    setBlockNote('')
    if (form.blocks.includes(type)) change({ blocks: form.blocks.filter((b) => b !== type) })
    else if (form.blocks.length < MAX_BLOCK_TAGS) change({ blocks: [...form.blocks, type] })
  }

  const isQuestion = form.kind === 'question'
  const options = isQuestion ? blockOptions(form.chapter) : []
  const full = form.blocks.length >= MAX_BLOCK_TAGS

  return (
    <form className="board-form" onSubmit={(e) => { e.preventDefault(); onSubmit(form) }}>
      {editing ? (
        <p className="board-form-kind">
          <span className={`board-kind is-${form.kind}`}>{BOARD_KIND_LABEL[form.kind]}</span>
          <small>올린 뒤에는 글 종류를 바꿀 수 없어요.</small>
        </p>
      ) : (
        <fieldset className="board-kind-pick">
          <legend>글 종류</legend>
          {['question', 'discussion'].map((k) => (
            <label key={k} className={form.kind === k ? 'is-on' : ''}>
              <input type="radio" name={`${uid}-kind`} value={k} checked={form.kind === k}
                onChange={() => change({ kind: k })} />
              <span><b>{BOARD_KIND_LABEL[k]}</b> {KIND_HELP[k]}</span>
            </label>
          ))}
        </fieldset>
      )}

      <input ref={titleRef} value={form.title} onChange={(e) => change({ title: e.target.value })} maxLength={80}
        placeholder="제목 (80자까지)" aria-label="제목" required />

      {isQuestion && (
        <div className="board-question-fields">
          <label className="board-field">
            <span>챕터 (선택)</span>
            <select value={form.chapter} onChange={(e) => changeChapter(e.target.value)}>
              {CHAPTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <fieldset className="board-blocks">
            <legend>관련 블록 (선택, {MAX_BLOCK_TAGS}개까지 · {form.blocks.length}개 고름)</legend>
            <div className="board-blocks-list">
              {options.map((o) => {
                const on = form.blocks.includes(o.value)
                return (
                  <label key={o.value} className={on ? 'is-on' : ''}>
                    <input type="checkbox" checked={on} disabled={!on && full} onChange={() => toggleBlock(o.value)} />
                    <span>{o.label}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>
          {blockNote && <p className="board-note" role="status">{blockNote}</p>}
          <div className="board-guide" id={guideId}>
            <b>이렇게 적으면 답변을 받기 쉬워요</b>
            <ul>{QUESTION_GUIDE.map((g) => <li key={g}>{g}</li>)}</ul>
            <small>안내 문장은 글에 들어가지 않아요. 본문에 직접 적어 주세요.</small>
          </div>
        </div>
      )}

      <textarea value={form.body} onChange={(e) => change({ body: e.target.value })} maxLength={1000} rows={6}
        placeholder={BODY_PLACEHOLDER[form.kind]} aria-label="내용" aria-describedby={isQuestion ? guideId : undefined} required />

      {notice && <p className="board-form-notice" role="alert">{notice}</p>}

      <div className="board-form-foot">
        <small>{form.body.length}/1000</small>
        <div>
          {onCancel && <button type="button" className="role-btn ghost" onClick={onCancel}>취소</button>}
          <button type="submit" className="role-btn" disabled={busy || !form.title.trim() || !form.body.trim()}>
            {busy ? '올리는 중…' : editing ? '고치기' : isQuestion ? '질문 올리기' : '글 올리기'}
          </button>
        </div>
      </div>
    </form>
  )
}
