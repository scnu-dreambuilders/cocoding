import { useCallback, useEffect, useRef, useState } from 'react'
import { Brain, Gamepad2, Keyboard } from 'lucide-react'
import { api } from '../api/client'
import TopNav from '../components/TopNav'
import SiteFooter from '../components/SiteFooter'
import TypingGame from '../components/TypingGame'
import ChapterQuiz from '../components/ChapterQuiz'
import { QUIZ_SET_SIZE } from '../data/quizQuestions'
import './GameZonePage.css'

/* 게임존 — 한글 타자게임 · 챕터별 복습 퀴즈
   로그인한 사용자는 게임을 끝낼 때 맞힌 개수만큼 코인을 받는다 (games/reward.php).
   같은 단계는 하루 한 번: 타자는 단계·세트별, 퀴즈는 단계·처음 풀이/다시 풀기별. 경험치는 오르지 않고,
   풀이 기록도 저장하지 않는다. 게스트는 요청 없이 그대로 즐긴다.

   잔액은 App이 한곳에서 관리한다 (coinSync). 지급 응답의 balance는 쓰지 않고, 지급이 끝나면 App이 서버에서
   잔액을 다시 읽는다. 지급 요청은 아래 대기열로 한 번에 하나씩 보내고, 게임존 화면이 해제돼도 대기열은 이어진다. */

// 지급 대기열 — 파일 단위라 화면을 떠나도 이미 넣은 작업은 끝까지 간다. 앞 작업이 실패해도 다음 작업은 진행된다
let rewardQueue = Promise.resolve()
function enqueueReward(task) {
  const run = rewardQueue.then(task).catch((e) => ({ kind: 'error', message: e?.message ?? '알 수 없는 오류' }))
  rewardQueue = run.then(() => undefined)
  return run
}
// 완료 결과(객체) → 지급 작업. 화면이 다시 그려지거나 StrictMode로 두 번 요청해도 같은 결과는 한 번만 보낸다
const rewardEntries = new WeakMap()
// 코인 단가 조회 — 같은 로그인 세션에서는 한 번만 (StrictMode 두 번 마운트에도 반복 조회하지 않게)
let ratesCache = null

// 결과 화면의 코인 안내. completion: { id, payload, label, rule } — 결과 하나마다 새 객체
function RewardStatus({ completion, loggedIn, coins, onRequest, onRefreshBalance }) {
  const [state, setState] = useState({ kind: 'pending' })
  const [attempt, setAttempt] = useState(0)
  const [reloading, setReloading] = useState(false)

  useEffect(() => {
    if (!loggedIn) return undefined
    let alive = true // 결과 화면을 떠난 뒤 늦게 온 응답은 이 안내를 바꾸지 않는다 (잔액 갱신은 App이 따로 한다)
    onRequest(completion, { retry: attempt > 0 }).then((r) => { if (alive) setState(r) })
    return () => { alive = false }
  }, [completion, loggedIn, onRequest, attempt])

  // 지급 요청이 실패했을 때만: 같은 완료 결과(같은 payload)로 다시 요청
  const retryClaim = () => {
    setState({ kind: 'pending' })
    setAttempt((n) => n + 1)
  }
  // 지급은 됐고 잔액 조회만 실패했을 때: 잔액만 다시 읽는다 (지급 요청은 다시 보내지 않음)
  const reloadBalance = async () => {
    setReloading(true)
    try {
      const r = await onRefreshBalance()
      if (r.ok) setState((s) => ({ ...s, balanceError: false }))
    } finally {
      setReloading(false)
    }
  }

  const coinsText = coins == null ? '' : ` 지금 내 코인은 ${coins}개예요.`
  let text
  let tone = ''
  if (!loggedIn) {
    text = '로그인하면 맞힌 문제 수만큼 코인을 받을 수 있어요. 게임은 로그인 없이도 계속할 수 있어요.'
  } else if (state.kind === 'pending') {
    text = '코인을 받는 중이에요…'
  } else if (state.kind === 'awarded' && state.balanceError) {
    text = `코인 ${state.awarded}개는 받았지만 잔액을 새로 불러오지 못했어요.`
    tone = ' is-ok'
  } else if (state.kind === 'awarded') {
    text = `코인 ${state.awarded}개를 받았어요!${coinsText}`
    tone = ' is-ok'
  } else if (state.kind === 'already') {
    text = `‘${completion.label}’은(는) 오늘 이미 코인을 받았어요. 내일 다시 받을 수 있어요.`
  } else if (state.kind === 'zero') {
    text = '이번에는 맞힌 문제가 없어서 받을 코인이 없어요.'
  } else if (state.kind === 'canceled') {
    text = '로그인 상태가 바뀌어서 이 결과로는 코인을 요청하지 않았어요.'
  } else {
    text = `코인을 받지 못했어요 (${state.message}). 게임 결과는 그대로예요.`
    tone = ' is-bad'
  }

  return (
    <div className={`quiz-feedback${tone}`} role="status">
      <p>{text}</p>
      {loggedIn && state.kind === 'error' && (
        <p><button type="button" className="link-btn" onClick={retryClaim}>코인 다시 받기</button></p>
      )}
      {loggedIn && state.kind === 'awarded' && state.balanceError && (
        <p><button type="button" className="link-btn" onClick={reloadBalance} disabled={reloading}>
          {reloading ? '잔액 불러오는 중…' : '잔액 다시 불러오기'}
        </button></p>
      )}
      <p className="quiz-help">{completion.rule} 경험치는 오르지 않아요.</p>
    </div>
  )
}

// coinSync: App이 주는 세션·잔액 도구 { session(), isCurrent(tag), refresh(tag) }
export default function GameZonePage({ user, onMenu, onBack, onAuth, onLogout, coinSync }) {
  const [toast, setToast] = useState('')
  const [typing, setTyping] = useState(false)
  const [quiz, setQuiz] = useState(false)
  const [typingSound, setTypingSound] = useState(false) // 타자게임 효과음 — 게임존에 머무는 동안만 기억 (기본 꺼짐, 저장 안 함)
  const [rates, setRates] = useState(null) // 코인 단가 조회 결과 { userId, status: 'ready'|'error', reward }
  const toastTimer = useRef(null)
  const heading = useRef(null)
  const typingDirty = useRef(false) // 타자게임에 버리면 사라질 진행이 있는지 (TypingGame이 알려준다)
  const quizDirty = useRef(false)   // 퀴즈에 버리면 사라질 진행이 있는지 (ChapterQuiz가 알려준다)

  const userId = user?.id ?? null
  const coins = Number.isInteger(user?.coins) && user.coins >= 0 ? user.coins : null

  // 코인 단가는 서버(GET) 값만 쓴다. 못 불러오면 숫자를 지어내지 않는다. 이전 세션의 응답은 버린다
  useEffect(() => {
    const tag = coinSync?.session()
    if (userId == null || !tag) return undefined
    let alive = true
    if (!ratesCache || ratesCache.no !== tag.no) ratesCache = { no: tag.no, promise: api.gameRewards() }
    const { promise } = ratesCache
    promise.then(
      (r) => { if (alive && coinSync.isCurrent(tag)) setRates({ userId, status: 'ready', reward: r.reward ?? {} }) },
      () => {
        if (ratesCache?.promise === promise) ratesCache = null // 실패한 조회는 다음에 다시 시도
        if (alive && coinSync.isCurrent(tag)) setRates({ userId, status: 'error' })
      },
    )
    return () => { alive = false }
  }, [userId, coinSync])
  const rateInfo = userId == null ? null : rates?.userId === userId ? rates : { status: 'loading' }

  // 이번 완료 결과로 코인 요청. 같은 완료 결과는 한 번만(재시도는 지급 요청이 실패했을 때만)
  // 세션은 대기열에 넣을 때와 실제로 보내기 직전에 모두 확인하고, 달라졌으면 보내지 않고 취소한다
  const requestReward = useCallback((completion, { retry = false } = {}) => {
    const tag = coinSync?.session()
    if (!tag) return Promise.resolve({ kind: 'guest' })
    const prev = rewardEntries.get(completion)
    if (prev && prev.tag.no === tag.no && !(retry && prev.failed)) return prev.promise
    const entry = { tag, failed: false }
    entry.promise = enqueueReward(async () => {
      if (!coinSync.isCurrent(tag)) return { kind: 'canceled' }
      let r
      try {
        r = await api.claimGameReward(completion.payload)
      } catch (e) {
        if (!coinSync.isCurrent(tag)) return { kind: 'canceled' }
        entry.failed = true
        return { kind: 'error', message: e.message }
      }
      const kind = r.awarded > 0 ? 'awarded' : r.already ? 'already' : 'zero'
      if (kind !== 'awarded') return { kind, awarded: 0 }
      // 지급 성공 → App이 서버에서 잔액을 다시 읽는다 (같은 세션일 때만). 조회만 실패해도 지급 성공은 그대로
      const fresh = await coinSync.refresh(tag)
      return { kind, awarded: r.awarded, balanceError: !fresh.ok && !fresh.stale }
    })
    rewardEntries.set(completion, entry)
    return entry.promise
  }, [coinSync])

  // 잔액만 다시 읽기 (지금 세션 기준)
  const refreshBalance = useCallback(() => coinSync?.refresh() ?? Promise.resolve({ ok: false, stale: true }), [coinSync])

  const loggedIn = !!user
  const renderReward = useCallback((completion) => (completion
    ? <RewardStatus key={completion.id} completion={completion} loggedIn={loggedIn} coins={coins}
        onRequest={requestReward} onRefreshBalance={refreshBalance} />
    : null), [requestReward, refreshBalance, loggedIn, coins])

  const setTypingDirty = useCallback((dirty) => { typingDirty.current = dirty }, [])
  const setQuizDirty = useCallback((dirty) => { quizDirty.current = dirty }, [])
  // 진행 중인 타자게임·퀴즈가 있을 때 이 화면을 떠나는 길(메뉴·로고·로그인·로그아웃)이면 한 번 묻는다
  const confirmLeave = () => {
    if (typing && typingDirty.current) return window.confirm('지금 그만두면 이번 타자 연습은 처음부터 다시 시작돼요. 그만둘까요?')
    if (quiz && quizDirty.current) return window.confirm('지금 그만두면 이번 퀴즈는 처음부터 다시 시작돼요. 그만둘까요?')
    return true
  }
  // 안내만 띄우고 이 화면에 머무는 메뉴 (App의 공통 메뉴 규칙과 같은 기준) — 이런 메뉴에는 묻지 않는다
  // (Q&A는 이제 코딩 게시판으로 실제 이동하므로 여기 넣지 않는다)
  const staysHere = (key) => key === 'game'
    || (!!user && (user.role ?? 'student') !== 'student' && ['study', 'free', 'popular'].includes(key))

  // 게임존 첫 화면으로 돌아오면 제목으로 초점
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [typing, quiz])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const navigate = (key) => {
    if (key === 'game') return
    if (!staysHere(key) && !confirmLeave()) return
    const result = onMenu?.(key)
    if (!result?.toast) return
    clearTimeout(toastTimer.current)
    setToast(result.toast)
    toastTimer.current = setTimeout(() => {
      setToast('')
      result.after?.()
    }, result.after ? 1300 : 3500)
  }

  const selecting = !typing && !quiz

  // 첫 화면의 코인 안내 — 단가는 서버에서 받은 값만 보여 준다
  const rewardLine = !user
    ? '로그인 없이도 즐길 수 있어요. 로그인하면 맞힌 문제 수만큼 코인을 받아요.'
    : rateInfo?.status === 'ready' && rateInfo.reward.typing != null && rateInfo.reward.quiz != null
      ? `맞힌 문제마다 코인을 받아요: 타자게임 정답 1개에 ${rateInfo.reward.typing}코인, 퀴즈 정답 1개에 ${rateInfo.reward.quiz}코인.`
      : rateInfo?.status === 'error'
        ? '맞힌 문제 수만큼 코인을 받아요. (코인 기준을 불러오지 못했어요)'
        : '맞힌 문제 수만큼 코인을 받아요.'

  return (
    <div className="game-root">
      <TopNav user={user} active="game" onNavigate={navigate}
        onBrandClick={() => { if (confirmLeave()) onBack() }}
        onLogin={() => { if (confirmLeave()) onAuth('login') }}
        onSignup={() => { if (confirmLeave()) onAuth('register') }}
        onLogout={() => { if (confirmLeave()) onLogout() }} />
      {toast && <div className="game-toast" role="status">{toast}</div>}
      <main className={`game-main${selecting ? ' game-main-selection' : ''}`}>
        {typing && <TypingGame onLeave={() => setTyping(false)} onDirtyChange={setTypingDirty}
          soundOn={typingSound} onSoundChange={setTypingSound} renderReward={renderReward} />}
        {quiz && <ChapterQuiz onLeave={() => setQuiz(false)} onDirtyChange={setQuizDirty} renderReward={renderReward} />}
        {selecting && <>
          <h1 ref={heading} tabIndex={-1}><Gamepad2 aria-hidden="true" /> 게임존</h1>
          <p>게임으로 배운 코딩 개념을 확인해 보세요.</p>
          <div className="game-selection">
          <section className="game-card" aria-labelledby="quiz-title">
            <Brain size={40} aria-hidden="true" />
            <h2 id="quiz-title">코딩 퀴즈</h2>
            <p>챕터에서 배운 블록의 역할과 결과, 오류를 문제로 복습해요.</p>
            <p>챕터 1~5 · 전체 복습 · 한 번에 {QUIZ_SET_SIZE}문제 · 제한시간 없음</p>
            <button className="game-primary" type="button" onClick={() => setQuiz(true)}>퀴즈 시작하기</button>
          </section>
          <section className="game-card" aria-labelledby="typing-card-title">
            <Keyboard size={40} aria-hidden="true" />
            <h2 id="typing-card-title">한글 타자게임</h2>
            <p className="typing-card-desc">코딩 낱말과 블록 구문을 따라 쳐요.</p>
            {/* 항목 단위로 줄바꿈 — 구분점은 앞 항목 끝에 붙여 줄 첫머리에 혼자 남지 않게 (CSS) */}
            <p className="typing-card-meta">
              <span>낱말·블록 구문 2단계</span>{' '}
              <span>한 번에 5문제</span>{' '}
              <span>시간제한 없음</span>
            </p>
            <button className="game-primary" type="button" onClick={() => setTyping(true)}>타자게임 시작하기</button>
          </section>
          </div>
          <p>{rewardLine}</p>
          <p>코인은 같은 단계에서 하루 한 번 받아요 (타자게임은 단계·세트별, 퀴즈는 단계의 처음 풀이·다시 풀기별). 경험치는 오르지 않고, 풀이 기록은 저장하지 않아요.</p>
        </>}
      </main>
      <SiteFooter onNavigate={navigate} />
    </div>
  )
}
