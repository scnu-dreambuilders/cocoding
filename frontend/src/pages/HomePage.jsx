import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import TopNav from '../components/TopNav'
import { CocoAvatar } from '../components/Coco'
import heroImg from '../assets/hero.png'
import './HomePage.css'

/* ════════════════════════════════════════════════
   HomePage — 로그인하지 않은 사용자의 첫 화면 (화면설계서 WEB-MAIN-001 기준)
   와이어프레임의 정보 구조(카테고리 메뉴 → 히어로 → 사용법 → 캐릭터 소개 →
   새소식 → 추천 프로젝트)는 유지하되, 시각 스타일은 기존 보라색 카드형 UI로 구현.
   ════════════════════════════════════════════════ */

const GUIDE_STEPS = [
  { n: 1, title: '관심 분야 선택', desc: '어떤 걸 좋아하는지 알려주면 딱 맞는 학습 주제를 추천해줘요.' },
  { n: 2, title: '단계별 학습', desc: '챕터마다 새로운 블록을 하나씩 배우며 코딩의 기초를 익혀요.' },
  { n: 3, title: '자유창작', desc: '배운 블록으로 나만의 게임과 이야기를 자유롭게 만들어요.' },
]

// 코코 외 캐릭터는 이번 단계에서 전용 일러스트를 새로 만들지 않고, 이모지 배지로 소개만 제공
const CHARACTERS = [
  { id: 'coco', name: '코코', role: '친절한 코딩 안내병', avatar: 'coco',
    desc: '코딩 여정에서 든든한 친구가 되어줄게요. 막힌 부분엔 힌트를, 작은 성공엔 칭찬을 건네요.' },
  { id: 'ruby', name: '루비', role: '똑똑한 알고리즘 여우', emoji: '🦊',
    desc: '복잡해 보이는 문제도 순서대로 차근차근 풀어가는 방법을 알려줘요.' },
  { id: 'ditto', name: '디토', role: '재미있는 디버깅 문어', emoji: '🐙',
    desc: '여러 팔로 코드 구석구석을 살펴서 오류를 잘 찾아내요. 코드가 이상할 땐 디토를 불러보세요!' },
  { id: 'beat', name: '비트', role: '빠른 실행 토끼', emoji: '🐰',
    desc: '빠릿빠릿하게 실행 결과를 보여주고 다음 도전을 응원해줘요.' },
]

// 공지 API가 아직 없어서 mock 데이터로 대체 (백엔드 새로 만들지 않음)
const NEWS = [
  { tag: '안내', date: '2026.09', title: '초등학생 눈높이에 맞춘 힌트 친구, 코코를 만나보세요' },
  { tag: '업데이트', date: '2026.09', title: '자유창작에서 배경과 소리를 직접 그리고 녹음할 수 있어요' },
  { tag: '안내', date: '2026.08', title: '챕터 5개를 모두 완료하면 나만의 게임 만들기가 열려요' },
]

function Thumb({ src, fallback = '🧩' }) {
  return (
    <div className="home-thumb" aria-hidden="true">
      {src ? <img src={src} alt="" /> : <span>{fallback}</span>}
    </div>
  )
}

function Modal({ onClose, children, labelledBy }) {
  return (
    <div className="home-modal-overlay" role="presentation" onClick={onClose}>
      <div className="home-modal-panel" role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}>
        <button type="button" className="home-modal-close" onClick={onClose} aria-label="닫기">×</button>
        {children}
      </div>
    </div>
  )
}

export default function HomePage({ user, onAuth, onGoDashboard }) {
  const [guideOpen, setGuideOpen] = useState(false)
  const [character, setCharacter] = useState(null)
  const [projects, setProjects] = useState({ list: [], loading: true, locked: false })
  const [toast, setToast] = useState('')
  const toastTimer = useRef(0)

  const showToast = (msg) => {
    clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), 3200)
  }
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // 추천 프로젝트 — 기존 publicProjects API 재사용. 이 API는 아동 보호를 위해
  // 로그인한 사용자만 조회할 수 있으므로(친구 작품 = 로그인 후 공개), 비로그인
  // 상태에서는 항상 "잠김" 빈 상태로 자연스럽게 보여준다 (새 API를 만들지 않음).
  useEffect(() => {
    let alive = true
    api.publicProjects(1)
      .then((res) => { if (alive) setProjects({ list: res.projects ?? [], loading: false, locked: false }) })
      .catch(() => { if (alive) setProjects({ list: [], loading: false, locked: true }) })
    return () => { alive = false }
  }, [])

  // 단계별 학습·자유창작 모두 로그인 후 이용하는 흐름으로 통일 (체험 모드는 AuthPage의 "로그인 없이 체험하기"로만 제공)
  const handleNavigate = (key) => {
    if (key === 'study' || key === 'free') onAuth?.()
    else showToast('🚧 이 메뉴는 곧 만나볼 수 있어요. 지금은 준비 중이에요!')
  }

  return (
    <div className="home-root">
      {toast && <div className="home-toast" role="status">{toast}</div>}
      <TopNav
        user={null}
        onNavigate={handleNavigate}
        onLogin={onAuth}
        onSignup={onAuth}
        right={user
          ? <button type="button" className="home-btn-primary" onClick={onGoDashboard}>📋 대시보드로 가기</button>
          : undefined}
      />

      <main className="home-main">
        {/* ── 히어로 ── */}
        <section className="home-hero">
          <div className="home-hero-text">
            <span className="home-hero-eyebrow">AI 친구와 함께 배우는 블록 코딩</span>
            <h1>코코딩과 함께하는<br />코딩 모험!</h1>
            <p>AI 캐릭터 친구들과 함께 블록 코딩으로 프로그래밍을 배우는 초등학생 맞춤 교육 플랫폼이에요.</p>
            <div className="home-hero-actions">
              <button type="button" className="home-btn-primary" onClick={onAuth}>🚀 코딩 모험 시작하기</button>
              <button type="button" className="home-btn-ghost" onClick={() => setGuideOpen(true)}>▶ 코코딩 사용법 알아보기</button>
            </div>
          </div>
          <img src={heroImg} alt="" className="home-hero-img" aria-hidden="true" />
        </section>

        {/* ── AI 캐릭터 소개 ── */}
        <section className="home-section">
          <h2 className="home-section-title">AI 캐릭터 친구들을 만나보세요!</h2>
          <div className="home-char-grid">
            {CHARACTERS.map((c) => (
              <button key={c.id} type="button" className="home-char-card" onClick={() => setCharacter(c)}>
                {c.avatar === 'coco'
                  ? <CocoAvatar emotion="happy" size={56} />
                  : <span className="home-char-emoji" aria-hidden="true">{c.emoji}</span>}
                <b>{c.name}</b>
                <span>{c.role}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── 새소식 ── */}
        <section className="home-section">
          <h2 className="home-section-title">코코딩은 변신 중! 새 소식</h2>
          <div className="home-news-list">
            {NEWS.map((n, i) => (
              <div key={i} className="home-news-card">
                <span className={`home-news-tag tag-${n.tag}`}>{n.tag}</span>
                <span className="home-news-date">{n.date}</span>
                <span className="home-news-title">{n.title}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── 추천 프로젝트 ── */}
        <section className="home-section">
          <h2 className="home-section-title">친구들은 뭘 만들었을까? 추천 프로젝트</h2>
          {projects.loading ? (
            <div className="home-proj-grid">
              {Array.from({ length: 4 }, (_, i) => <div key={i} className="home-proj-skeleton" aria-hidden="true" />)}
            </div>
          ) : projects.locked || projects.list.length === 0 ? (
            <div className="home-empty">
              <p>🔒 친구들의 작품은 로그인 후에 만나볼 수 있어요. (어린이 작품·개인정보 보호를 위해서예요)</p>
              <button type="button" className="home-btn-primary" onClick={onAuth}>로그인하고 구경하기</button>
            </div>
          ) : (
            <div className="home-proj-grid">
              {projects.list.slice(0, 4).map((p) => (
                <div key={p.id} className="home-proj-card">
                  <Thumb src={p.thumbnail_url} />
                  <div className="home-proj-info">
                    <b>{p.title}</b>
                    <span>by {p.username}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {guideOpen && (
        <Modal onClose={() => setGuideOpen(false)} labelledBy="guide-title">
          <h3 id="guide-title" className="home-modal-title">✨ 코코딩 사용법</h3>
          <ol className="home-guide-steps">
            {GUIDE_STEPS.map((s) => (
              <li key={s.n}>
                <span className="home-guide-num">{s.n}</span>
                <div>
                  <b>{s.title}</b>
                  <p>{s.desc}</p>
                </div>
              </li>
            ))}
          </ol>
          <button type="button" className="home-btn-primary home-modal-cta" onClick={() => { setGuideOpen(false); onAuth?.() }}>
            시작할 준비 완료!
          </button>
        </Modal>
      )}

      {character && (
        <Modal onClose={() => setCharacter(null)} labelledBy="char-title">
          <div className="home-char-modal-head">
            {character.avatar === 'coco'
              ? <CocoAvatar emotion="celebrate" size={72} />
              : <span className="home-char-emoji home-char-emoji-lg" aria-hidden="true">{character.emoji}</span>}
            <div>
              <h3 id="char-title" className="home-modal-title">{character.name}</h3>
              <span className="home-char-role">{character.role}</span>
            </div>
          </div>
          <p className="home-char-desc">{character.desc}</p>
          <button type="button" className="home-btn-ghost home-modal-cta" onClick={() => setCharacter(null)}>닫기</button>
        </Modal>
      )}
    </div>
  )
}
