import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import TopNav from '../components/TopNav'
import UserMenu from '../components/UserMenu'
import { CocoAvatar } from '../components/Coco'
import heroImg from '../assets/hero.png'
import './HomePage.css'

/* ════════════════════════════════════════════════
   HomePage — 로그인하지 않은 사용자의 첫 화면 (화면설계서 WEB-MAIN-001 기준)
   와이어프레임의 정보 구조(카테고리 메뉴 → 히어로 → 사용법 → 캐릭터 소개 →
   새소식 → 추천 프로젝트)는 유지하되, 시각 스타일은 기존 보라색 카드형 UI로 구현.
   ════════════════════════════════════════════════ */

const GUIDE_STEPS = [
  { n: 1, title: '관심 분야 선택하기', desc: '좋아하는 주제를 선택하면 나에게 맞는 코딩 활동을 추천해 줘요.' },
  { n: 2, title: '단계별 학습으로 코딩 배우기', desc: '블록을 연결하고 미션을 해결하면서 코딩의 기초를 차근차근 배워요.' },
  { n: 3, title: '자유창작으로 작품 만들기', desc: '배운 블록을 활용해 나만의 게임이나 이야기를 만들고 작품을 저장해 보세요.' },
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

// 추천 프로젝트 영역 안내 문구 (사용자 상태별). 로그인 버튼은 비로그인에게만 보여준다.
const PROJECT_EMPTY_MESSAGE = {
  guest: '🔒 친구들의 작품은 로그인 후에 만나볼 수 있어요. (어린이 작품·개인정보 보호를 위해서예요)',
  pending: '보호자 동의가 완료되면 친구들의 공개 작품을 볼 수 있어요.',
  staff: '친구들의 공개 작품은 학생 계정에서 이용할 수 있어요.',
  empty: '아직 소개할 작품이 없어요. 새로운 작품이 올라오면 여기서 만날 수 있어요!',
  failed: '작품을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
}

// 공지 API가 아직 없어서 mock 데이터로 대체 (백엔드 새로 만들지 않음)
// body: 상세 보기에 보여줄 문단. 실제 구현된 기능만 적는다.
const NEWS = [
  {
    tag: '안내', date: '2026.09', title: '초등학생 눈높이에 맞춘 힌트 친구, 코코를 만나보세요',
    body: [
      '코코는 코코딩에서 블록 코딩을 함께 배우는 안내 캐릭터예요.',
      '미션을 풀다가 막히면 힌트를 건네고, 해냈을 때는 칭찬을 해줘요.',
      '이 화면의 "AI 캐릭터 친구들을 만나보세요!"에서 코코를 만나볼 수 있어요.',
    ],
  },
  {
    tag: '업데이트', date: '2026.09', title: '자유창작에서 배경과 소리를 직접 그리고 녹음할 수 있어요',
    body: [
      '자유창작에서는 나만의 캐릭터를 직접 그려서 작품에 쓸 수 있어요.',
      '마이크로 소리를 녹음해 두면 "소리 재생하기" 블록에서 골라 쓸 수 있어요.',
      '장면마다 배경색을 골라 작품을 꾸밀 수도 있어요.',
    ],
  },
  {
    tag: '안내', date: '2026.08', title: '챕터 5개를 모두 완료하면 나만의 게임 만들기가 열려요',
    body: [
      '단계별 학습의 챕터 5개를 모두 완료하면 학생 홈에서 "나만의 게임 만들기"가 열려요.',
      '지금까지 배운 블록과 직접 그린 캐릭터, 녹음한 소리를 모아 나만의 게임을 완성해 보세요.',
    ],
  },
]

function Thumb({ src, fallback = '🧩' }) {
  return (
    <div className="home-thumb" aria-hidden="true">
      {src ? <img src={src} alt="" /> : <span>{fallback}</span>}
    </div>
  )
}

function Modal({ onClose, children, labelledBy }) {
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  // 키보드 사용자를 위해: 열릴 때 닫기 버튼에 포커스, Esc로 닫기, 닫히면 원래 있던 곳으로 포커스 복귀
  const closeBtnRef = useRef(null)
  useEffect(() => {
    const opener = document.activeElement
    closeBtnRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onCloseRef.current?.() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  return (
    <div className="home-modal-overlay" role="presentation" onClick={onClose}>
      <div className="home-modal-panel" role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        onClick={(e) => e.stopPropagation()}>
        <button ref={closeBtnRef} type="button" className="home-modal-close" onClick={onClose} aria-label="닫기">×</button>
        {children}
      </div>
    </div>
  )
}

// 로그인 후 개인 홈(App의 dashboard)으로 가는 메뉴 라벨과 메인 홈 버튼 문구 — 역할별
const HOME_MENU_LABEL = { student: '학생 홈', teacher: '내 반 관리', guardian: '우리 아이' }
const HOME_CTA_LABEL = { student: '🏠 학생 홈으로 가기', teacher: '🏠 내 반 관리하기', guardian: '🏠 우리 아이 학습 확인하기' }

export default function HomePage({
  user, onAuth, onGoDashboard, onOpenFree, onLogout, onUserChange, onAccountDeleted, onEditSurvey,
}) {
  const [guideOpen, setGuideOpen] = useState(false)
  const [character, setCharacter] = useState(null)
  const [newsItem, setNewsItem] = useState(null)
  const [projects, setProjects] = useState({ list: [], loading: true, failed: false })
  const [toast, setToast] = useState('')
  const toastTimer = useRef(0)

  const role = user ? (user.role ?? 'student') : null
  const isStudent = role === 'student'

  const showToast = (msg) => {
    clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), 3200)
  }
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // 추천 프로젝트 — 기존 publicProjects API 재사용(새 API·권한 변경 없음).
  // 이 API는 로그인한 학생(보호자 동의 완료)만 쓸 수 있으므로, 그 외 상태는 호출하지 않고
  // 사용자 상태(로그인/역할/동의)에 맞는 안내만 보여준다.
  const projectAccess = !user ? 'guest'
    : !isStudent ? 'staff'
      : user.consent_status === 'pending' ? 'pending'
        : 'ok'
  useEffect(() => {
    if (projectAccess !== 'ok') return undefined
    let alive = true
    api.publicProjects(1)
      .then((res) => { if (alive) setProjects({ list: res.projects ?? [], loading: false, failed: false }) })
      .catch(() => { if (alive) setProjects({ list: [], loading: false, failed: true }) })
    return () => { alive = false }
  }, [projectAccess])

  // 단계별 학습·자유창작은 로그인한 학생의 기능이다.
  //  · 비로그인: 로그인 유도 (체험 모드는 AuthPage의 "로그인 없이 체험하기"로만 제공)
  //  · 학생: 학생 홈과 같은 경로로 이동 (로그인 화면으로 보내지 않음)
  //  · 교사·보호자: 학생 전용 기능이라 안내만 표시
  const handleNavigate = (key) => {
    if (key === 'home') {
      onGoDashboard?.()
      return
    }
    if (key !== 'study' && key !== 'free') {
      showToast('🚧 이 메뉴는 곧 만나볼 수 있어요. 지금은 준비 중이에요!')
      return
    }
    if (!user) {
      onAuth?.()
    } else if (!isStudent) {
      showToast(key === 'study' ? '단계별 학습은 학생 계정에서만 이용할 수 있어요.' : '자유창작은 학생 계정에서만 이용할 수 있어요.')
    } else if (key === 'study') {
      onGoDashboard?.()
      setTimeout(() => document.getElementById('chapters-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
    } else {
      (onOpenFree ?? onGoDashboard)?.()
    }
  }

  return (
    <div className="home-root">
      {toast && <div className="home-toast" role="status">{toast}</div>}
      <TopNav
        user={null}
        onNavigate={handleNavigate}
        onLogin={onAuth}
        onSignup={onAuth}
        extraMenu={user ? [{ key: 'home', icon: '🏠', label: HOME_MENU_LABEL[role] ?? '내 홈' }] : []}
        right={user
          ? <UserMenu user={user} onLogout={onLogout} onUserChange={onUserChange}
            onAccountDeleted={onAccountDeleted} onEditSurvey={onEditSurvey} showToast={showToast} />
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
              <button type="button" className="home-btn-primary" onClick={user ? onGoDashboard : onAuth}>
                {user ? (HOME_CTA_LABEL[role] ?? '🏠 내 홈으로 가기') : '🚀 코딩 모험 시작하기'}
              </button>
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
              <button key={i} type="button" className="home-news-card home-news-card-btn" onClick={() => setNewsItem(n)}>
                <span className={`home-news-tag tag-${n.tag}`}>{n.tag}</span>
                <span className="home-news-date">{n.date}</span>
                <span className="home-news-title">{n.title}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── 추천 프로젝트 ── */}
        <section className="home-section">
          <h2 className="home-section-title">친구들은 뭘 만들었을까? 추천 프로젝트</h2>
          {projectAccess === 'ok' && projects.loading ? (
            <div className="home-proj-grid">
              {Array.from({ length: 4 }, (_, i) => <div key={i} className="home-proj-skeleton" aria-hidden="true" />)}
            </div>
          ) : projectAccess !== 'ok' || projects.failed || projects.list.length === 0 ? (
            <div className="home-empty">
              <p>{PROJECT_EMPTY_MESSAGE[projectAccess === 'ok' ? (projects.failed ? 'failed' : 'empty') : projectAccess]}</p>
              {projectAccess === 'guest' && (
                <button type="button" className="home-btn-primary" onClick={onAuth}>로그인하고 구경하기</button>
              )}
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

        {/* ── 보호자 동의 안내 ── */}
        <section className="home-section">
          <div className="home-safety-card">
            <span className="home-safety-icon" aria-hidden="true">🛡️</span>
            <div className="home-safety-body">
              <b>안전하게 시작해요</b>
              <p>
                만 14세 미만 학생은 안전한 서비스 이용을 위해 보호자 동의가 필요해요.
                학생 계정에 표시되는 동의 코드를 보호자 계정에 입력하면 계정이 연결되고,
                보호자가 학습 진행 상황을 함께 확인할 수 있어요.
              </p>
            </div>
            <button type="button" className="home-btn-ghost home-safety-cta" onClick={onAuth}>회원가입하러 가기</button>
          </div>
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
          <button type="button" className="home-btn-primary home-modal-cta" onClick={() => setGuideOpen(false)}>
            시작할 준비 완료!
          </button>
        </Modal>
      )}

      {newsItem && (
        <Modal onClose={() => setNewsItem(null)} labelledBy="news-title">
          <div className="home-news-modal-meta">
            <span className={`home-news-tag tag-${newsItem.tag}`}>{newsItem.tag}</span>
            <span className="home-news-date">{newsItem.date}</span>
          </div>
          <h3 id="news-title" className="home-modal-title home-news-modal-title">{newsItem.title}</h3>
          {newsItem.body.map((p, i) => <p key={i} className="home-news-modal-body">{p}</p>)}
          <button type="button" className="home-btn-ghost home-modal-cta" onClick={() => setNewsItem(null)}>닫기</button>
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
