import { useEffect, useRef, useState } from 'react'
import TopNav from '../components/TopNav'
import { pickQuizQuestions, QUIZ_QUESTION_COUNT, QUIZ_SCORE_PER_ANSWER, QUIZ_TIME_LIMIT } from '../data/quizQuestions'
import './GameZonePage.css'

/* ════════════════════════════════════════════════
   GameZonePage — 게임존 1차 구현 (퀴즈 게임 1종)
   backend/DB 없이 프론트 정적 문제 데이터로만 동작.
   실제 지급되지 않는 코인/XP를 지급한 것처럼 표시하지 않는다.
   ════════════════════════════════════════════════ */
export default function GameZonePage({ user, onBack, onAuth, onLogout, onOpenEditor, onGoDashboard }) {
  const [gameState, setGameState] = useState('idle') // 'idle' | 'playing' | 'result'
  const [questions, setQuestions] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(QUIZ_TIME_LIMIT)
  const [selectedAnswer, setSelectedAnswer] = useState(null)
  const [toast, setToast] = useState('')
  const advanceTimer = useRef(0)
  const toastTimer = useRef(0)

  const showToast = (msg) => {
    clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), 3200)
  }

  // 60초 타이머: playing 상태일 때만 동작, 0초가 되면 자동으로 결과 화면
  useEffect(() => {
    if (gameState !== 'playing') return undefined
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id)
          setGameState('result')
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [gameState])

  useEffect(() => () => {
    clearTimeout(advanceTimer.current)
    clearTimeout(toastTimer.current)
  }, [])

  const startGame = () => {
    setQuestions(pickQuizQuestions())
    setCurrentIndex(0)
    setScore(0)
    setTimeLeft(QUIZ_TIME_LIMIT)
    setSelectedAnswer(null)
    setGameState('playing')
  }

  const backToIdle = () => {
    clearTimeout(advanceTimer.current)
    setGameState('idle')
  }

  const selectAnswer = (idx) => {
    if (selectedAnswer !== null) return // 중복 클릭 방지
    setSelectedAnswer(idx)
    if (idx === questions[currentIndex].answerIndex) {
      setScore((s) => s + QUIZ_SCORE_PER_ANSWER)
    }
    advanceTimer.current = setTimeout(() => {
      if (currentIndex + 1 >= questions.length) {
        setGameState('result')
      } else {
        setCurrentIndex((i) => i + 1)
        setSelectedAnswer(null)
      }
    }, 700)
  }

  // 공통 TopNav 메뉴 클릭 처리 (게임존 자체는 이미 이 화면이므로 무시)
  const handleNavigate = (key) => {
    if (key === 'game') return
    if (key === 'study') { user ? onGoDashboard?.() : onAuth?.() }
    else if (key === 'free') { user ? onOpenEditor?.({ mode: 'free' }) : onAuth?.() }
    else showToast('🚧 이 메뉴는 곧 만나볼 수 있어요. 지금은 준비 중이에요!')
  }

  const current = questions[currentIndex]

  return (
    <div className="game-root">
      {toast && <div className="game-toast" role="status">{toast}</div>}
      <TopNav user={user} active="game" onNavigate={handleNavigate} onBrandClick={onBack}
        onLogin={onAuth} onSignup={onAuth} onLogout={onLogout} />

      <main className="game-main">
        {gameState === 'idle' && (
          <>
            <div className="game-head">
              <h1>🎮 게임존</h1>
              <p>게임을 즐기고 배운 내용을 확인해보세요!</p>
            </div>
            <div className="game-card">
              <span className="game-card-emoji" aria-hidden="true">🧠</span>
              <h2>퀴즈 게임</h2>
              <p>코딩 개념을 테스트하세요</p>
              <span className="game-card-meta">⏱ 60초 제한시간 · 문제 {QUIZ_QUESTION_COUNT}개</span>
              <button type="button" className="game-btn-primary" onClick={startGame}>▶ 시작하기</button>
            </div>
            {!user && (
              <p className="game-guest-note">💡 로그인 없이도 게임을 즐길 수 있어요. 로그인하면 나중에 보상도 받을 수 있어요!</p>
            )}
          </>
        )}

        {gameState === 'playing' && current && (
          <div className="game-play">
            <div className="game-stat-bar">
              <span className="game-stat">⭐ {score}점</span>
              <span className="game-stat">⏱ {timeLeft}초</span>
              <span className="game-stat">문제 {currentIndex + 1}/{questions.length}</span>
            </div>
            <div className="game-question-card">
              <span className="game-topic-badge">{current.topic}</span>
              <h2>{current.question}</h2>
              <div className="game-options">
                {current.options.map((opt, idx) => {
                  const isSelected = selectedAnswer === idx
                  const isCorrect = idx === current.answerIndex
                  let cls = 'game-option'
                  if (selectedAnswer !== null) {
                    if (isCorrect) cls += ' correct'
                    else if (isSelected) cls += ' wrong'
                  }
                  return (
                    <button key={idx} type="button" className={cls} disabled={selectedAnswer !== null}
                      onClick={() => selectAnswer(idx)}>
                      {opt}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {gameState === 'result' && (
          <div className="game-result">
            <span className="game-result-emoji" aria-hidden="true">🎉</span>
            <h2>게임 완료!</h2>
            <p className="game-result-score">최종 점수 <strong>{score}점</strong></p>
            {user ? (
              <p className="game-result-note">보상 시스템은 추후 제공 예정이에요. 계속 플레이하며 실력을 키워보세요!</p>
            ) : (
              <p className="game-result-note">로그인하면 나중에 보상을 받을 수 있어요!</p>
            )}
            <div className="game-result-actions">
              <button type="button" className="game-btn-ghost" onClick={backToIdle}>게임존으로 돌아가기</button>
              <button type="button" className="game-btn-primary" onClick={startGame}>🔄 다시 하기</button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
