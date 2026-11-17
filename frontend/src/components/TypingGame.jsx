import { useEffect, useRef, useState } from 'react'
import { BookOpen, Puzzle, Volume2, VolumeX } from 'lucide-react'
import { TYPING_SET_COUNT, TYPING_STAGES, typingSet } from '../data/typingPractice'
import { canPlayTypingSound, createTypingSound, isTypingKey } from '../lib/typingSound'

/* ════════════════════════════════════════════════
   게임존 타자게임 — 한글 낱말·블록 구문 따라 입력하기
   단계 선택 → 짧은 안내 → 연습(5문제) → 결과
   점수·속도·정확도는 재지 않고, 기록 저장·보상 요청도 하지 않는다.
   ════════════════════════════════════════════════ */

const STAGE_ICON = { word: BookOpen, block: Puzzle }
const NEXT_GUARD_MS = 400 // 넘어간 직후 같은 손놀림의 연속 클릭·Enter가 새 문제에 제출되지 않게

// 실시간 표시와 제출이 함께 쓰는 비교 — NFC 정규화, 맨 앞·맨 뒤 공백만 무시, 안쪽 공백·숫자는 그대로 비교
function compareTyping(target, raw) {
  const goal = [...target.normalize('NFC')]
  const typed = [...raw.normalize('NFC').trim()]
  const cells = goal.map((ch, i) => (i >= typed.length ? 'todo' : typed[i] === ch ? 'ok' : 'bad'))
  return {
    goal,
    typed,
    cells,
    extra: Math.max(0, typed.length - goal.length),
    firstBad: cells.indexOf('bad'),
    done: typed.join('') === goal.join(''),
    empty: typed.length === 0,
  }
}

// 받침 유무에 맞춰 ‘을/를’을 붙인다 (한글 음절·숫자 읽기 기준, 그 밖의 글자는 ‘글자를’)
function withObject(ch) {
  const code = ch.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return `‘${ch}’${(code - 0xac00) % 28 ? '을' : '를'}`
  if (/[0-9]/.test(ch)) return `‘${ch}’${'013678'.includes(ch) ? '을' : '를'}`
  return `‘${ch}’ 글자를`
}

// 비교 결과를 읽을 수 있는 한 줄 안내로 (위치는 사람 기준 1부터, 띄어쓰기도 한 칸으로 센다)
function describeTyping(r) {
  if (r.empty) return '위의 문구를 보고 입력해 보세요.'
  if (r.done) return '목표 문구와 같아요. Enter나 아래 버튼을 눌러 넘어가세요.'
  if (r.firstBad >= 0) {
    const pos = r.firstBad + 1
    const want = r.goal[r.firstBad]
    const got = r.typed[r.firstBad]
    if (want === ' ') return `${pos}번째 칸은 띄어쓰기예요.`
    if (got === ' ') return `${pos}번째 칸에 띄어쓰기가 들어갔어요. ${withObject(want)} 입력해야 해요.`
    return `${pos}번째 글자가 달라요. ${withObject(want)} 입력해야 해요.`
  }
  if (r.extra > 0) return `목표 문구보다 ${r.extra}칸 더 입력했어요. 뒤쪽을 확인해 보세요.`
  const left = r.goal.length - r.typed.length
  const nextCh = r.goal[r.typed.length]
  if (nextCh === ' ') return `여기까지 맞아요. 다음은 띄어쓰기예요. (${left}칸 남음)`
  // 문장부호는 놓치기 쉬워서 무엇을 넣어야 하는지 알려준다
  if (/[?!.,~]/.test(nextCh)) return `여기까지 맞아요. 다음은 문장부호 ‘${nextCh}’예요. (${left}칸 남음)`
  return `여기까지 맞아요. 아직 ${left}칸 남았어요.`
}

// 목표 문구를 글자 칸으로 보여준다 (장식이라 aria-hidden — 낭독용 문구는 따로 둔다)
function TargetCells({ result }) {
  return (
    <p className="typing-cells" aria-hidden="true">
      {result.goal.map((ch, i) => (
        <span key={i} className={`typing-cell is-${result.cells[i]}${ch === ' ' ? ' is-space' : ''}${/[?!.,~]/.test(ch) ? ' is-mark' : ''}`}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
      {result.extra > 0 && <span className="typing-cell is-extra">+{result.extra}</span>}
    </p>
  )
}

// 효과음 켜기/끄기 — 접근 이름은 ‘효과음’으로 고정, 상태는 aria-pressed와 보이는 글자로
function SoundToggle({ on, onToggle }) {
  return (
    <>
      <button type="button" className="game-option" aria-pressed={on} onClick={onToggle}>
        {on ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />} 효과음
        <span aria-hidden="true"> · {on ? '켜짐' : '꺼짐'}</span>
      </button>
      {on && !canPlayTypingSound() && <p className="typing-help">이 브라우저에서는 소리를 낼 수 없어요. 게임은 그대로 할 수 있어요.</p>}
    </>
  )
}

// onLeave: 게임존 첫 화면으로 / onDirtyChange(bool): 버리면 사라질 진행이 있는지 (게임존의 메뉴·로고·로그인 이동 확인용)
// soundOn·onSoundChange: 효과음 설정 (게임존에 머무는 동안 GameZonePage가 기억, 저장하지 않음)
export default function TypingGame({ onLeave, onDirtyChange, soundOn = false, onSoundChange }) {
  const [view, setView] = useState('stages') // 'stages' | 'guide' | 'practice' | 'result'
  const [stageId, setStageId] = useState(null)
  const [setIndex, setSetIndex] = useState(0)
  const [qIndex, setQIndex] = useState(0)
  const [input, setInput] = useState('')
  const [shown, setShown] = useState('')      // 실시간 표시에 쓰는 '확정된' 입력 (조합 중에는 갱신하지 않음)
  const [composing, setComposing] = useState(false)
  const [retry, setRetry] = useState('')       // 제출했는데 틀렸을 때의 안내 — 다시 입력하기 시작하면 지운다
  const [announce, setAnnounce] = useState('') // 화면 낭독기에 읽힐 안내 — 제출했을 때만 바뀐다

  const composingRef = useRef(false)
  const justComposedRef = useRef(false) // 조합을 끝낸 바로 그 Enter가 제출되지 않게
  const justComposedTimer = useRef(0)
  const advancingRef = useRef(false)    // 다음 문제·결과·재시작을 한 번만 처리
  const announceFlip = useRef(false)    // 같은 안내를 다시 읽게 하려고 보이지 않는 글자를 번갈아 붙인다
  const advancedAtRef = useRef(-Infinity) // 마지막으로 다음 문제로 넘어간 이벤트 시각 (연속 클릭·Enter 방지)
  const headingRef = useRef(null)
  const inputRef = useRef(null)
  const soundRef = useRef(null) // 효과음 엔진 — 사용자 동작 때 처음 만들고, 화면을 떠나면 정리

  const stage = TYPING_STAGES.find((s) => s.id === stageId) ?? null
  const items = stage ? typingSet(stage, setIndex) : []
  const item = items[qIndex]

  // 버리면 사라지는 진행: 연습 중 완료한 문제가 있거나 입력 중인 글자가 있을 때 (결과 화면은 아님)
  const dirty = view === 'practice' && (qIndex > 0 || input.trim() !== '')
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])
  useEffect(() => () => {
    onDirtyChange?.(false)
    clearTimeout(justComposedTimer.current)
  }, [onDirtyChange])

  // 화면이 바뀌거나 다음 문제로 가면: 연속 처리 잠금 해제 + 초점 이동 (화면 밖으로 튀지 않게 nearest)
  useEffect(() => {
    advancingRef.current = false
    const el = view === 'practice' ? inputRef.current : headingRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'nearest' })
  }, [view, qIndex, stageId, setIndex])

  // 효과음 엔진은 이벤트 처리 중에만 꺼낸다 (렌더 중에는 만들지 않음)
  const getSound = () => {
    if (!soundRef.current) soundRef.current = createTypingSound()
    return soundRef.current
  }
  useEffect(() => () => {
    soundRef.current?.dispose()
    soundRef.current = null
  }, [])

  const toggleSound = () => {
    const nextOn = !soundOn
    if (nextOn) getSound().setEnabled(true) // 이 클릭 안에서 재생을 허락받는다
    else soundRef.current?.setEnabled(false)
    onSoundChange?.(nextOn)
  }

  // 타건음: 실제 키 입력(keydown) 한 곳에서만 낸다. 입력 처리는 바꾸지 않는다 (preventDefault 없음).
  const playKeySound = (e) => {
    if (!soundOn || advancingRef.current) return
    const el = e.currentTarget
    if (el.readOnly || el.disabled || !isTypingKey(e.nativeEvent)) return
    const sound = getSound()
    sound.setEnabled(true)
    sound.tick()
  }

  const resetQuestion = () => {
    setInput('')
    setShown('')
    setRetry('')
    setAnnounce('')
    composingRef.current = false
    setComposing(false)
  }

  const confirmDiscard = () => !dirty || window.confirm('지금 그만두면 이번 연습은 처음부터 다시 시작돼요. 그만둘까요?')

  const chooseStage = (id) => {
    setStageId(id)
    setSetIndex(0) // 단계를 새로 고르면 1세트부터
    setQIndex(0)
    resetQuestion()
    setView('guide')
  }

  const startPractice = () => {
    if (advancingRef.current) return
    advancingRef.current = true
    setQIndex(0)
    resetQuestion()
    setView('practice')
  }

  const backToStages = () => {
    if (!confirmDiscard()) return
    resetQuestion()
    setQIndex(0)
    setView('stages')
  }

  // ── 입력 ── 입력값은 그대로 두고(자르거나 바꾸지 않음), 실시간 비교만 조합이 끝난 뒤에 한다
  const onChange = (e) => {
    const value = e.target.value
    setInput(value)
    setRetry('')
    if (!composingRef.current) setShown(value)
  }
  const onCompositionStart = () => {
    composingRef.current = true
    setComposing(true)
  }
  const onCompositionEnd = (e) => {
    composingRef.current = false
    setComposing(false)
    setShown(e.currentTarget.value)
    // 일부 브라우저는 조합을 끝내는 Enter의 keydown이 compositionend 뒤에 온다 → 그 한 번만 무시
    justComposedRef.current = true
    clearTimeout(justComposedTimer.current)
    justComposedTimer.current = setTimeout(() => { justComposedRef.current = false }, 120)
  }
  const onKeyDown = (e) => {
    playKeySound(e)
    if (e.key !== 'Enter') return
    if (e.nativeEvent.isComposing || e.keyCode === 229 || composingRef.current || justComposedRef.current) {
      e.preventDefault()
    }
  }
  const onKeyUp = () => { justComposedRef.current = false } // 다음 Enter는 정상 동작

  // Enter 또는 '다음 문제' 한 번으로: 맞으면 바로 다음 문제로, 틀리면 다시 해 보라고 알려준다
  const submit = (e) => {
    e.preventDefault()
    if (!item || composingRef.current || advancingRef.current) return
    // 넘어가자마자 빈 입력창에 들어온 두 번째 클릭·Enter는 무시한다 (‘다시 해 보세요’가 뜨지 않게).
    // 빈 입력은 정답일 수 없으니 이 무시로 문제를 건너뛰는 일은 없다.
    if (input.trim() === '' && e.timeStamp - advancedAtRef.current < NEXT_GUARD_MS) return
    const r = compareTyping(item.text, input)
    setShown(input)
    if (!r.done) {
      const msg = `다시 해 보세요. ${describeTyping(r)}`
      setRetry(msg)
      announceFlip.current = !announceFlip.current
      setAnnounce(msg + (announceFlip.current ? '​' : '')) // 틀려도 입력은 그대로 둔다
      inputRef.current?.focus()
      return
    }
    advancingRef.current = true
    advancedAtRef.current = e.timeStamp
    // 중복 처리 잠금 뒤 한 번만. 재진입 뒤 키를 누르지 않고(붙여넣기·마우스) 바로 제출해도 나도록 엔진을 먼저 켠다
    if (soundOn) {
      const sound = getSound()
      sound.setEnabled(true)
      sound.success()
    }
    if (qIndex + 1 >= items.length) {
      setView('result')
      return
    }
    resetQuestion()
    setAnnounce(`정답이에요! ${qIndex + 2}번째 문제예요.`)
    setQIndex((i) => i + 1)
  }

  // 같은 단계 다시 연습하기: 다음 세트로 (1 → 2 → 1 …)
  const practiceAgain = () => {
    if (advancingRef.current) return
    advancingRef.current = true
    setSetIndex((s) => (s + 1) % TYPING_SET_COUNT)
    setQIndex(0)
    resetQuestion()
    setView('practice')
  }

  // ── 화면 ──
  if (view === 'stages') {
    return (
      <section className="game-card typing-wrap" aria-labelledby="typing-stage-title">
        <h1 id="typing-stage-title" ref={headingRef} tabIndex={-1}>한글 타자게임</h1>
        <p>코딩 낱말과 블록 구문을 따라 입력하며 익혀요. 단계를 골라 주세요.</p>
        <div className="game-selection">
          {TYPING_STAGES.map((s) => {
            const Icon = STAGE_ICON[s.id]
            return (
              <section key={s.id} className="game-card" aria-labelledby={`typing-stage-${s.id}`}>
                <Icon size={36} aria-hidden="true" />
                <h2 id={`typing-stage-${s.id}`}>{s.name}</h2>
                <p>{s.summary}</p>
                <p>한 번에 5문제 · 제한시간 없음</p>
                <button type="button" className="game-primary" onClick={() => chooseStage(s.id)}>{s.name} 고르기</button>
              </section>
            )
          })}
        </div>
        <button type="button" className="game-option" onClick={onLeave}>게임존으로 돌아가기</button>
        <p>연습 결과는 저장되지 않으며 코인·경험치 보상은 없어요.</p>
      </section>
    )
  }

  if (view === 'guide' && stage) {
    return (
      <section className="game-card typing-wrap" aria-labelledby="typing-guide-title">
        <h1 id="typing-guide-title" ref={headingRef} tabIndex={-1}>{stage.name}</h1>
        <p className="typing-set">{setIndex + 1}세트 · 이번에 연습할 문제 {items.length}개</p>
        <SoundToggle on={soundOn} onToggle={toggleSound} />
        <ul className="typing-guide">
          <li>위에 보이는 문구를 아래 입력창에 똑같이 입력해요. 뜻은 읽기만 하면 돼요.</li>
          <li>띄어쓰기·숫자·물음표 같은 문장부호도 그대로 입력해요. 맨 앞과 맨 뒤 공백은 괜찮아요.</li>
          <li>다 입력했으면 Enter 키나 ‘다음 문제’를 눌러요. 맞으면 바로 다음 문제로 넘어가요.</li>
          <li>틀리면 어디가 다른지 알려줘요. 입력은 지워지지 않으니 고친 뒤 다시 눌러요.</li>
        </ul>
        <div className="typing-guide-actions">
          <button type="button" className="game-primary" onClick={startPractice}>연습 시작하기</button>
          <button type="button" className="game-option" onClick={backToStages}>단계 선택으로</button>
        </div>
      </section>
    )
  }

  if (view === 'result' && stage) {
    return (
      <section className="game-card typing-wrap" aria-labelledby="typing-result-title">
        <h1 id="typing-result-title" ref={headingRef} tabIndex={-1}>{stage.name} 끝!</h1>
        <p>{setIndex + 1}세트 · {items.length}문제를 모두 입력했어요.</p>
        <h2 className="typing-review-title">이번에 연습한 {stage.id === 'word' ? '낱말' : '구문'}</h2>
        <ul className="game-term-review">
          {items.map((it) => (
            <li key={it.id}><b>{it.text}</b><p>{it.meaning}</p></li>
          ))}
        </ul>
        <div className="typing-result-actions">
          <button type="button" className="game-primary" onClick={practiceAgain}>다시 연습하기 · {((setIndex + 1) % TYPING_SET_COUNT) + 1}세트</button>
          <button type="button" className="game-option" onClick={backToStages}>단계 선택</button>
          <button type="button" className="game-option" onClick={onLeave}>게임존으로</button>
        </div>
        <p className="typing-result-note">연습 결과는 저장되지 않으며 코인·경험치 보상은 없어요.</p>
      </section>
    )
  }

  if (view !== 'practice' || !item) return null

  const live = compareTyping(item.text, shown)
  const status = composing ? '글자를 조합하는 중이에요. 조합이 끝나면 다시 비교해요.' : describeTyping(live)
  const isLast = qIndex + 1 === items.length

  return (
    <section className="game-card typing-wrap" aria-labelledby="typing-practice-title">
      <h1 id="typing-practice-title" className="typing-practice-title">{stage.name}</h1>
      <p className="typing-set">{setIndex + 1}세트 · 문제 {qIndex + 1}/{items.length} · 완료 {qIndex}개</p>
      <SoundToggle on={soundOn} onToggle={toggleSound} />
      <progress className="game-typing-progress" max={items.length} value={qIndex} aria-label="이번 세트에서 완료한 문제 수" />

      <div className="typing-target-box">
        <p className="typing-label">입력할 {stage.id === 'word' ? '낱말' : '구문'}</p>
        {/* 화면 낭독기는 이 문구를 한 번에 읽는다 */}
        <p id="typing-target" className="game-sr-only">{item.text}</p>
        <TargetCells result={live} />
        <p id="typing-meaning" className="game-typing-example">{item.meaning}</p>
      </div>

      <form className="game-typing-form" onSubmit={submit}>
        <label htmlFor="typing-input">위의 {stage.id === 'word' ? '낱말' : '구문'}을 똑같이 입력해 보세요.</label>
        <input ref={inputRef} id="typing-input" value={input}
          onChange={onChange} onCompositionStart={onCompositionStart} onCompositionEnd={onCompositionEnd}
          onKeyDown={onKeyDown} onKeyUp={onKeyUp}
          aria-describedby="typing-target typing-meaning typing-status"
          autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={80} lang="ko" />
        {/* 입력할 때마다 바뀌는 안내 — 보이기만 하고 낭독은 하지 않는다 (매 키마다 읽지 않게) */}
        <p id="typing-status" className={`typing-status${retry ? ' is-retry' : ''}`}>{retry || status}</p>
        <p className="typing-legend">초록 밑줄: 맞음 · 빨간 물결 밑줄: 다름 · 흐린 글자: 아직 입력 안 함</p>
        {/* 제출했을 때만 읽히는 안내 */}
        <p className="game-sr-only" role="status">{announce}</p>
        <button type="submit" className="game-primary">{isLast ? '결과 보기' : '다음 문제'}</button>
      </form>
      <p className="typing-help">조작: 입력 → Enter 또는 ‘{isLast ? '결과 보기' : '다음 문제'}’. 맞으면 넘어가고, 틀리면 다시 해 보라고 알려줘요.</p>
      <button type="button" className="game-option" onClick={backToStages}>단계 선택으로</button>
      <p className="typing-help">돌아가면 이번 연습은 처음부터 다시 시작돼요.</p>
    </section>
  )
}
