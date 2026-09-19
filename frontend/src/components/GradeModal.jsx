import { useEffect, useState } from 'react'

/* ════════════════════════════════════════════════
   정답 제출 채점 결과 창
   grade: { phase: 'grading', progress } | { phase: 'result', result, saving, saved, saveError }
   ════════════════════════════════════════════════ */

// 점수가 0부터 올라가는 효과
function useCountUp(target, ms = 700) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms)
      setN(Math.round(target * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return n
}

function GradeResult({ grade, onClose, onNext, onRetrySave }) {
  const { result, saving, saved, saveError } = grade
  const shown = useCountUp(result.score)
  const passed = result.passed
  return (
    <>
      <div className={`grade-hero ${passed ? 'is-pass' : 'is-fail'}`}>
        <div className="grade-score" aria-label={`${result.score}점`}>
          <b>{shown}</b><small>/ 100점</small>
        </div>
        <div className="grade-stars" aria-label={`별 ${result.stars}개`}>
          {[1, 2, 3].map((n) => <span key={n} className={n <= result.stars ? 'on' : ''} style={{ animationDelay: `${0.5 + n * 0.15}s` }}>★</span>)}
        </div>
        <div className="grade-verdict">{passed ? '통과! 미션 성공 🎉' : '아직 통과하지 못했어요. 조금만 고쳐보자 💪'}</div>
      </div>

      <ul className="grade-items" aria-label="채점 기준">
        {result.items.map((it) => (
          <li key={it.label} className={it.done ? 'ok' : 'no'}>
            <span className="grade-mark" aria-hidden="true">{it.done ? '✓' : '✗'}</span>
            <div className="grade-item-body">
              <div className="grade-item-label">
                {it.label}
                {it.via === 'live' && <em className="grade-via">직접 실행에서 확인</em>}
              </div>
              {it.tip && <div className="grade-tip">💡 {it.tip}</div>}
            </div>
            <span className="grade-pts">{it.earned}<small>/{it.max}</small></span>
          </li>
        ))}
      </ul>

      <p className="grade-howto">🤖 {result.howto}</p>

      <div className="grade-record" role="status">
        {saving && '기록 저장 중…'}
        {saveError && <span className="form-error">기록을 저장하지 못했어요: {saveError}</span>}
        {saved && `${saved.attempts}번째 제출 · 최고 점수 ${saved.bestScore ?? result.score}점`}
        {saved?.passed && saved.rewardItem && (
          <div className="grade-reward">
            🎁 보상 <b>{saved.rewardEmoji} {saved.rewardItem}</b>
            {saved.alreadyCompleted ? ' (이미 받은 보상이에요)' : '을(를) 받았어요!'}
          </div>
        )}
      </div>

      <div className="modal-foot">
        {saveError && <button type="button" className="btn btn-ghost" onClick={onRetrySave}>다시 저장</button>}
        {passed && saved ? (
          <>
            <button type="button" className="btn btn-ghost" onClick={onClose}>닫기</button>
            <button type="button" className="btn btn-run" onClick={onNext}>
              {saved.nextChapterId ? '다음 챕터 →' : '🎮 나만의 게임 만들기'}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-run" onClick={onClose} disabled={passed && saving}>
            {passed ? '확인' : '✏️ 다시 고치기'}
          </button>
        )}
      </div>
    </>
  )
}

export default function GradeModal({ grade, onClose, onNext, onRetrySave }) {
  const grading = grade.phase === 'grading'
  useEffect(() => {
    const down = (e) => { if (e.key === 'Escape' && !grading) onClose() }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [grading, onClose])

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !grading) onClose() }}>
      <div className="modal grade-modal" role="dialog" aria-modal="true" aria-labelledby="grade-title">
        <div className="modal-head">
          <h3 id="grade-title">📝 채점 결과</h3>
          {!grading && <button type="button" className="modal-x" onClick={onClose} aria-label="닫기">×</button>}
        </div>
        {grading ? (
          <div className="grade-running" role="status">
            <div className="grade-robot" aria-hidden="true">🤖</div>
            <p>채점 로봇이 네 코드를 실행해보고 있어요…</p>
            <div className="grade-bar"><span style={{ width: `${Math.round(grade.progress * 100)}%` }} /></div>
          </div>
        ) : (
          <GradeResult grade={grade} onClose={onClose} onNext={onNext} onRetrySave={onRetrySave} />
        )}
      </div>
    </div>
  )
}
