import { useEffect, useRef, useState } from 'react'
import { CHAPTER_TEXT } from '../data/chapterText'
import {
  QUIZ_CHAPTER_NOS, QUIZ_CHAPTER_SUMMARY, QUIZ_SET_SIZE, QUIZ_TYPE_LABEL,
  chapterQuestions, pickReviewQuestions, withShuffledOptions,
} from '../data/quizQuestions'

/* ════════════════════════════════════════════════
   게임존 챕터별 복습 퀴즈
   챕터 선택 → 5문제(보기 고르기 → 정답 확인 → 해설 → 직접 다음) → 결과 → 다시 풀기
   제한시간·자동 전환·점수 저장·보상 없음. 실제 챕터 완료·잠금과도 무관하다.
   ════════════════════════════════════════════════ */

// '이동과 방향 – 캐릭터를 움직여보자' → '이동과 방향'
const chapterTitle = (no) => String(CHAPTER_TEXT[no]?.title ?? `챕터 ${no}`).split(' – ')[0]
const modeLabel = (mode) => (mode?.kind === 'review' ? '전체 복습' : `챕터 ${mode?.no} · ${chapterTitle(mode?.no)}`)
const optionText = (q, id) => q.options.find((o) => o.id === id)?.text ?? ''

// 블록 순서: 반복·조건의 안쪽은 한 단계 들여쓴 목록으로
function CodeLines({ lines }) {
  return (
    <ul>
      {lines.map((line, i) => (
        <li key={i}>
          <span className="quiz-code-line">{line.text}</span>
          {line.inner && <CodeLines lines={line.inner} />}
        </li>
      ))}
    </ul>
  )
}

function CodeBlocks({ code }) {
  return (
    <div className="quiz-code" role="group" aria-label="블록 순서">
      {code.map((stack, i) => (
        <div key={i} className="quiz-code-stack">
          {stack.who && <p className="quiz-code-who">{stack.who}의 블록</p>}
          <CodeLines lines={stack.lines} />
        </div>
      ))}
    </div>
  )
}

// 챕터 선택 카드: 첫 줄 [챕터 번호 · 제목 · 문제 수], 다음 줄 요약, 오른쪽 아래 시작 버튼
// 버튼은 화면에 ‘시작하기 →’로 보이고, 화면 낭독기에는 ‘챕터 1 시작하기’처럼 어느 카드인지 함께 읽힌다.
function ChapterCard({ id, chip, title, summary, srName, onStart }) {
  return (
    <section className="game-card quiz-chapter-card" aria-labelledby={id}>
      <div className="quiz-chapter-head">
        <span className="quiz-chip">{chip}</span>
        <h2 id={id}>{title}</h2>
        <span className="quiz-chapter-count">{QUIZ_SET_SIZE}문제</span>
      </div>
      <p className="quiz-chapter-summary">{summary}</p>
      <button type="button" className="game-primary quiz-chapter-start" onClick={onStart}>
        <span className="game-sr-only">{srName} </span>시작하기<span aria-hidden="true"> →</span>
      </button>
    </section>
  )
}

// onLeave: 게임존 첫 화면으로 / onDirtyChange(bool): 버리면 사라질 진행이 있는지 (게임존의 메뉴·로고·로그인 이동 확인용)
export default function ChapterQuiz({ onLeave, onDirtyChange }) {
  const [view, setView] = useState('chapters') // 'chapters' | 'play' | 'result'
  const [mode, setMode] = useState(null)       // { kind: 'chapter', no } | { kind: 'review' }
  const [round, setRound] = useState('first')  // 'first' | 'retry'
  const [questions, setQuestions] = useState([]) // 이번 풀이의 문제 — 보기 순서는 시작할 때 한 번만 섞는다
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState(null) // 고른 보기 id (확인 전에는 바꿀 수 있음)
  const [answers, setAnswers] = useState({})     // { [문제 id]: 고른 보기 id } — 정답 확인 때 한 번만 기록
  const [firstResult, setFirstResult] = useState(null) // 처음 풀이 결과 — 다시 풀어도 바뀌지 않음
  const [focusKey, setFocusKey] = useState(0)

  const advancedFromRef = useRef(-1) // 같은 문제에서 '다음'이 두 번 처리되지 않게
  const headingRef = useRef(null)
  const nextRef = useRef(null)

  const q = questions[index]
  const chosen = q ? answers[q.id] : undefined
  const confirmed = chosen !== undefined
  const isLast = index + 1 >= questions.length
  const correctCount = questions.filter((it) => answers[it.id] === it.answerId).length

  // 버리면 사라지는 진행: 풀이 중 고른 답이 있거나 확인한 문제가 있을 때 (결과 화면은 아님)
  const dirty = view === 'play' && (selected !== null || Object.keys(answers).length > 0)
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  // 화면·문제가 바뀌면 제목으로 초점 (화면 밖으로 튀지 않게 nearest)
  useEffect(() => {
    const el = headingRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'nearest' })
  }, [view, index, focusKey])

  // 정답 확인 뒤에는 '다음 문제' 버튼으로 (해설은 아래 status 영역이 읽어 준다)
  useEffect(() => {
    if (confirmed) nextRef.current?.focus({ preventScroll: true })
  }, [confirmed])

  const begin = (nextMode, list, nextRound) => {
    setMode(nextMode)
    setRound(nextRound)
    setQuestions(withShuffledOptions(list))
    setIndex(0)
    setSelected(null)
    setAnswers({})
    advancedFromRef.current = -1
    setView('play')
    setFocusKey((k) => k + 1)
  }

  // 새 챕터·새 전체 복습: 처음 풀이 결과도 새로 시작
  const startChapter = (no) => {
    setFirstResult(null)
    begin({ kind: 'chapter', no }, chapterQuestions(no), 'first')
  }
  const startReview = () => {
    setFirstResult(null)
    begin({ kind: 'review' }, pickReviewQuestions(), 'first')
  }
  const restartSame = () => (mode.kind === 'review' ? startReview() : startChapter(mode.no))
  // 틀린 문제 다시 풀기: 방금 끝난 풀이에서 틀린 문제만
  const retryWrong = () => {
    const wrong = questions.filter((it) => answers[it.id] !== it.answerId)
    if (wrong.length) begin(mode, wrong, 'retry')
  }

  const confirmDiscard = () => !dirty || window.confirm('지금 그만두면 이번 퀴즈는 처음부터 다시 시작돼요. 그만둘까요?')
  const toChapters = () => {
    if (!confirmDiscard()) return
    setView('chapters')
    setSelected(null)
    setAnswers({})
    setFocusKey((k) => k + 1)
  }

  const choose = (id) => {
    if (confirmed) return // 확인한 뒤에는 고정
    setSelected(id)
  }

  const confirm = () => {
    if (!q || confirmed || selected === null) return
    // 같은 문제는 한 번만 기록 — 중복 확인으로 정답 수가 늘지 않는다
    setAnswers((a) => (q.id in a ? a : { ...a, [q.id]: selected }))
  }

  const next = () => {
    if (!confirmed || advancedFromRef.current === index) return
    advancedFromRef.current = index
    if (isLast) {
      if (round === 'first') {
        setFirstResult({ total: questions.length, correct: correctCount })
      }
      setView('result')
      return
    }
    setSelected(null)
    setIndex((i) => i + 1)
  }
  // Enter를 누르고 있어 생기는 반복 입력으로 해설을 건너뛰지 않게 (일반 클릭·키 입력은 그대로)
  const onNextKeyDown = (e) => {
    if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault()
  }

  // ── 챕터 선택 ──
  if (view === 'chapters') {
    return (
      <section className="game-play quiz-wrap" aria-labelledby="quiz-chapters-title">
        <h1 id="quiz-chapters-title" ref={headingRef} tabIndex={-1}>어떤 내용을 복습할까요?</h1>
        <p>챕터에서 배운 블록의 역할과 결과, 오류를 문제로 다시 살펴봐요. 아직 배우지 않은 챕터도 미리 살펴볼 수 있어요.</p>
        <div className="quiz-chapter-grid">
          {QUIZ_CHAPTER_NOS.map((no) => (
            <ChapterCard key={no} id={`quiz-ch-${no}`} chip={`챕터 ${no}`} title={chapterTitle(no)}
              summary={QUIZ_CHAPTER_SUMMARY[no]} srName={`챕터 ${no}`} onStart={() => startChapter(no)} />
          ))}
          <ChapterCard id="quiz-ch-review" chip="챕터 1~5" title="전체 복습"
            summary="챕터마다 한 문제씩 골라 풀어요." srName="전체 복습" onStart={startReview} />
        </div>
        <button type="button" className="game-option" onClick={onLeave}>게임존으로 돌아가기</button>
        <p>퀴즈 결과는 저장되지 않으며 코인·경험치 보상은 없어요. 챕터 진행에도 영향을 주지 않아요.</p>
      </section>
    )
  }

  // ── 결과 ──
  if (view === 'result') {
    const wrongCount = questions.length - correctCount
    return (
      <section className="game-card quiz-wrap" aria-labelledby="quiz-result-title">
        <h1 id="quiz-result-title" ref={headingRef} tabIndex={-1}>
          {round === 'retry' ? '틀린 문제 다시 풀기 결과' : `${modeLabel(mode)} 결과`}
        </h1>
        {round === 'retry' && <p className="quiz-chip">{modeLabel(mode)}</p>}
        <p className="game-score">{questions.length}문제 중 {correctCount}문제 정답</p>
        {round === 'retry' && firstResult && (
          <p>처음 풀이: {firstResult.total}문제 중 {firstResult.correct}문제 정답 (다시 풀어도 바뀌지 않아요)</p>
        )}
        <ol className="quiz-review">
          {questions.map((it) => {
            const ok = answers[it.id] === it.answerId
            return (
              <li key={it.id} className={ok ? 'is-ok' : 'is-bad'}>
                <p className="quiz-review-mark">{ok ? '맞았어요' : '틀렸어요'} · {QUIZ_TYPE_LABEL[it.type]}</p>
                {it.setup && <p>{it.setup}</p>}
                {/* 문제에서 본 블록 순서도 다시 보여 준다 (특히 ‘어떻게 고칠까요?’ 문제는 블록이 있어야 해설을 이해할 수 있다) */}
                {it.code && <CodeBlocks code={it.code} />}
                <p><b>{it.question}</b></p>
                <p>내가 고른 답: {optionText(it, answers[it.id])}</p>
                {!ok && <p>정답: {optionText(it, it.answerId)}</p>}
                <p className="quiz-explain">{it.explain}</p>
              </li>
            )
          })}
        </ol>
        {wrongCount > 0 && (
          <button type="button" className="game-primary" onClick={retryWrong}>틀린 문제 다시 풀기 ({wrongCount}문제)</button>
        )}
        <button type="button" className={wrongCount > 0 ? 'game-option' : 'game-primary'} onClick={restartSame}>
          {mode?.kind === 'review' ? '전체 복습 다시 풀기 (새로 뽑기)' : '같은 챕터 다시 풀기'}
        </button>
        <button type="button" className="game-option" onClick={toChapters}>다른 챕터 고르기</button>
        <button type="button" className="game-option" onClick={onLeave}>게임존으로 돌아가기</button>
        <p>퀴즈 결과는 저장되지 않으며 코인·경험치 보상은 없어요.</p>
      </section>
    )
  }

  if (!q) return null

  // ── 문제 풀기 ──
  const right = confirmed && chosen === q.answerId
  return (
    <section className="game-play quiz-wrap" aria-label={`${modeLabel(mode)} 퀴즈`}>
      <div className="game-stats">
        <span>{round === 'retry' ? '틀린 문제 다시 풀기' : modeLabel(mode)}</span>
        <span>문제 {index + 1}/{questions.length} · 정답 {correctCount}개</span>
      </div>
      <progress className="game-typing-progress" max={questions.length} value={index + (confirmed ? 1 : 0)}
        aria-label="이번 퀴즈에서 확인한 문제 수" />
      <div className="game-card">
        {/* 새 문제마다 초점이 오는 곳 — 상황·블록·질문을 위에서부터 차례로 읽게 맨 위에 둔다 */}
        <h2 ref={headingRef} tabIndex={-1} className="quiz-chip">문제 {index + 1} · {QUIZ_TYPE_LABEL[q.type]}</h2>
        {q.setup && <p className="quiz-setup">{q.setup}</p>}
        {q.code && <CodeBlocks code={q.code} />}
        <p className="quiz-question">{q.question}</p>
        <div className="quiz-options" role="group" aria-label="보기">
          {q.options.map((o) => {
            const isPicked = (confirmed ? chosen : selected) === o.id
            const isAnswer = o.id === q.answerId
            const state = confirmed ? (isAnswer ? ' is-correct' : isPicked ? ' is-wrong' : '') : isPicked ? ' is-selected' : ''
            return (
              <button key={o.id} type="button" className={`game-option${state}`} aria-pressed={isPicked}
                disabled={confirmed} onClick={() => choose(o.id)}>
                {!confirmed && isPicked && <span className="quiz-tag">✓ 선택함</span>}
                {confirmed && isAnswer && <span className="quiz-tag">정답</span>}
                {confirmed && isPicked && !isAnswer && <span className="quiz-tag">내가 고른 답 · 오답</span>}
                {o.text}
              </button>
            )
          })}
        </div>
        {/* 정답 확인 결과와 해설 — 확인했을 때 내용이 들어가며 화면 낭독기가 한 번 읽는다 */}
        <div className={`quiz-feedback${confirmed ? (right ? ' is-ok' : ' is-bad') : ''}`} role="status">
          {confirmed && <>
            <p><b>{right ? '정답이에요!' : `아쉬워요. 정답은 ‘${optionText(q, q.answerId)}’예요.`}</b></p>
            <p>{q.explain}</p>
          </>}
        </div>
        <div className="quiz-actions">
          <button type="button" className="game-primary" onClick={confirm} disabled={confirmed || selected === null}>정답 확인</button>
          <button ref={nextRef} type="button" className="game-primary" onClick={next} onKeyDown={onNextKeyDown} disabled={!confirmed}>
            {isLast ? '결과 보기' : '다음 문제'}
          </button>
        </div>
        {!confirmed && <p className="quiz-help">보기를 고른 뒤 ‘정답 확인’을 눌러요. 확인하기 전에는 다른 보기로 바꿀 수 있어요.</p>}
      </div>
      <button type="button" className="game-option" onClick={toChapters}>챕터 선택으로</button>
    </section>
  )
}
