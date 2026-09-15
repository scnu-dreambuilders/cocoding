import { BLOCK_INFO, CATEGORIES } from '../blockly/blocks'
import { BlockPreview } from './BlocklyEditor'

/* ════════════════════════════════════════════════
   챕터 미션 패널 — STEP1 소개 → STEP2 따라하기 → STEP3 스스로 완성 → STEP4 완료
   ════════════════════════════════════════════════ */
const STEPS = ['새 블록 소개', '따라하기', '스스로 완성', '완료']

export function BlockChip({ type, isNew }) {
  const info = BLOCK_INFO[type]
  if (!info) return null
  return (
    <span className={`block-chip ${isNew ? 'is-new' : ''}`} style={{ '--chip': CATEGORIES[info.cat].colour }}>
      {info.name}
      {isNew && <b>NEW</b>}
    </span>
  )
}

function Stars({ n }) {
  return (
    <span className="mini-stars" aria-label={`별 ${n}개`}>
      {[1, 2, 3].map((i) => <span key={i} className={i <= n ? 'on' : ''}>★</span>)}
    </span>
  )
}

export default function MissionPanel({
  no, chapter, step, maxStep, onStep, checks, hintCount, onHint,
  onDemo, demoRunning, onStartSelf, result, onNext, onDashboard,
  onSubmit, grading, ready, record,
}) {
  const passedCount = checks.filter((c) => c.done).length

  return (
    <div className="mission">
      <div className="mission-steps" role="tablist" aria-label="챕터 단계">
        {STEPS.map((label, i) => {
          const n = i + 1
          return (
            <button key={label} type="button" role="tab" aria-selected={step === n}
              className={`mstep ${step === n ? 'on' : ''} ${n < step || (result && n <= 4) ? 'done' : ''}`}
              disabled={n > maxStep} onClick={() => onStep(n)}>
              <span className="mstep-num">{n < step || (result && n === 4) ? '✓' : n}</span>
              {label}
            </button>
          )
        })}
      </div>

      <div className="mission-body">
        <div className="mission-title">
          <span className="mission-badge">챕터 {no}</span>
          {chapter.title}
        </div>

        {step === 1 && (
          <>
            <p className="mission-chess">{chapter.chess}</p>
            <p className="mission-text">{chapter.concept}</p>
            <div className="mission-sub">이번에 새로 배우는 블록</div>
            <div className="chip-row">
              {chapter.newBlocks.map((t) => <BlockChip key={t} type={t} isNew />)}
            </div>
            <p className="mission-note">✨ 팔레트에서 반짝이는 카테고리에 새 블록이 있어요. 이전 챕터 블록도 그대로 쓸 수 있어요.</p>
            <button type="button" className="btn btn-run mission-cta" onClick={() => onStep(2)}>따라하기 시작 →</button>
          </>
        )}

        {step === 2 && (
          <>
            <p className="mission-text">{chapter.example.desc}</p>
            <BlockPreview state={chapter.example.workspace} />
            <div className="mission-row">
              <button type="button" className="btn btn-ghost" onClick={onDemo} disabled={demoRunning}>
                {demoRunning ? '예시 실행 중…' : '▶ 예시 결과 보기'}
              </button>
              <button type="button" className="btn btn-run" onClick={onStartSelf}>다 따라했어요! 스스로 완성 →</button>
            </div>
            <p className="mission-note">왼쪽 작업 공간에 똑같이 조립하고 ▶ 실행해봐요. 틀려도 괜찮아요!</p>
          </>
        )}

        {step === 3 && (
          <>
            <p className="mission-goal">🎯 {chapter.mission}</p>
            <ul className="checklist" aria-label="미션 조건">
              {checks.map((c) => (
                <li key={c.label} className={c.done ? 'ok' : ''}>
                  <span className="check-box" aria-hidden="true">{c.done ? '✓' : ''}</span>
                  {c.label}
                </li>
              ))}
            </ul>
            <div className="mission-progress" aria-label={`${passedCount}/${checks.length} 완료`}>
              <span style={{ width: `${checks.length ? (passedCount / checks.length) * 100 : 0}%` }} />
            </div>
            {hintCount > 0 && (
              <ol className="hint-list">
                {chapter.hints.slice(0, hintCount).map((h) => <li key={h}>{h}</li>)}
              </ol>
            )}
            <div className="mission-row">
              <button type="button" className={`btn btn-submit ${ready ? 'is-ready' : ''}`} onClick={onSubmit} disabled={grading}>
                {grading ? '채점 중…' : '📝 정답 제출하고 채점받기'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onHint} disabled={hintCount >= chapter.hints.length}>
                💡 힌트 보기 ({hintCount}/{chapter.hints.length})
              </button>
            </div>
            {record.attempts > 0 && (
              <p className="mission-record">
                최고 점수 <b>{record.best ?? 0}점</b> · 제출 {record.attempts}번
              </p>
            )}
            <p className="mission-note">
              ▶ 실행으로 연습하면 위 조건이 바로바로 체크돼요. 다 됐으면 📝 정답 제출! 채점 로봇이 코드를 직접 실행해서 100점 만점으로 채점해요.
            </p>
          </>
        )}

        {step === 4 && (
          <div className="mission-done">
            <div className="mission-done-emoji" aria-hidden="true">🏆</div>
            <h4>챕터 {no} 완료!</h4>
            {result?.score != null && (
              <p className="mission-done-score"><Stars n={result.stars} /> <b>{result.score}점</b></p>
            )}
            {result?.rewardItem && (
              <p>
                보상 아이템 <b>{result.rewardEmoji} {result.rewardItem}</b>
                {result.alreadyCompleted ? ' (이미 받은 보상이에요)' : '을(를) 받았어요!'}
              </p>
            )}
            {result?.portfolioSaved && <p className="muted">완성한 작품이 포트폴리오에 저장됐어요 📁</p>}
            <div className="mission-row">
              {result?.nextChapterId && <button type="button" className="btn btn-run" onClick={onNext}>다음 챕터 →</button>}
              {!result?.nextChapterId && <button type="button" className="btn btn-run" onClick={onNext}>🎮 나만의 게임 만들기</button>}
              <button type="button" className="btn btn-ghost" onClick={onDashboard}>대시보드</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
