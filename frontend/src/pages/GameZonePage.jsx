import { useCallback, useEffect, useRef, useState } from 'react'
import { Brain, Gamepad2, Keyboard } from 'lucide-react'
import TopNav from '../components/TopNav'
import SiteFooter from '../components/SiteFooter'
import TypingGame from '../components/TypingGame'
import ChapterQuiz from '../components/ChapterQuiz'
import { QUIZ_SET_SIZE } from '../data/quizQuestions'
import './GameZonePage.css'

// 게임은 이 화면에서만 동작하며 점수 저장·보상 API는 호출하지 않는다.
export default function GameZonePage({ user, onMenu, onBack, onAuth, onLogout }) {
  const [toast, setToast] = useState('')
  const [typing, setTyping] = useState(false)
  const [quiz, setQuiz] = useState(false)
  const [typingSound, setTypingSound] = useState(false) // 타자게임 효과음 — 게임존에 머무는 동안만 기억 (기본 꺼짐, 저장 안 함)
  const toastTimer = useRef(null)
  const heading = useRef(null)
  const typingDirty = useRef(false) // 타자게임에 버리면 사라질 진행이 있는지 (TypingGame이 알려준다)
  const quizDirty = useRef(false)   // 퀴즈에 버리면 사라질 진행이 있는지 (ChapterQuiz가 알려준다)

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
          soundOn={typingSound} onSoundChange={setTypingSound} />}
        {quiz && <ChapterQuiz onLeave={() => setQuiz(false)} onDirtyChange={setQuizDirty} />}
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
          <p>로그인 없이도 즐길 수 있어요. 점수는 저장되지 않으며 코인·경험치 보상은 없어요.</p>
        </>}
      </main>
      <SiteFooter onNavigate={navigate} />
    </div>
  )
}
