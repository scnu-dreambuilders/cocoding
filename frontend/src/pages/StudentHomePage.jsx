import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Gamepad2, Heart, House, Lock, LogOut, Play, Puzzle, Settings, Trash2, Trophy, User } from 'lucide-react'
import { api } from '../api/client'
import { CocoAvatar } from '../components/Coco'
import TopNav from '../components/TopNav'
import { CHAPTERS, CHAPTER_COUNT } from '../data/chapters'
import { LEVEL_LABEL, ITEM_TYPE_LABEL } from '../data/library'
import { BLOCK_INFO } from '../blockly/blockInfo'
import { starsOf } from '../engine/grader'
import TextSizeControl from '../components/TextSizeControl'
import AccountModal from '../components/AccountModal'
import AttendanceCard from '../components/AttendanceCard'
import ShopPanel from '../components/ShopPanel'
import SearchBox from '../components/SearchBox'
import SiteFooter from '../components/SiteFooter'
import { MyProfileSide } from '../components/ProfileCard'
import { useMyProfile } from '../lib/useMyProfile'
import ProfileModal from '../components/ProfileModal'
import ActivityChart from '../components/ActivityChart'
import Stars from '../components/Stars'
import { StudentAssignments } from '../components/Assignments'
import { ConsentBanner, GuardianPanel, StudentClasses, TeacherPanel } from '../components/RolePanels'
import { ROLE_LABEL } from '../lib/validators'
import emptyProjectsImg from '../assets/coco/coco-calm.png'
import './StudentHomePage.css'
import './MyPage.css'

const STATUS = {
  completed:   { label: '완료',    cls: 'done',   icon: Check },
  in_progress: { label: '도전 중', cls: 'active', icon: Play },
  locked:      { label: '잠김',    cls: 'locked', icon: Lock },
}

// backend/models/ProjectModel.php의 REPORT_REASONS와 같아야 함
const REPORT_REASONS = ['나쁜 말이나 그림', '개인정보(얼굴·이름·목소리)가 있어요', '내 작품을 베꼈어요', '기타']

function fmtDate(str) {
  if (!str) return ''
  return new Date(str.replace(' ', 'T')).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

// 화면 사이 바로가기가 가리키는 고정 구역 ID (문구로 찾지 않는다)
const SECTION_ID = {
  chapters: 'chapters-section',
  projects: 'mypage-projects',
  items: 'mypage-items',
  shop: 'mypage-shop',
}

// 구역으로 스크롤: 고정(sticky) 상단바에 가리지 않게 상단바 실제 높이 + 여백만큼 띄운다
function scrollToSection(sectionId, smooth = true) {
  const el = document.getElementById(sectionId)
  if (!el) return
  const navH = document.querySelector('.topnav')?.offsetHeight ?? 0
  const top = el.getBoundingClientRect().top + window.scrollY - navH - 16
  window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' })
}

// 학생 홈 요약 숫자 — 기존 .stat 모양 그대로, 누르거나 Enter·Space로 해당 구역으로 이동
function StatLink({ num, label, hint, onGo }) {
  return (
    <div className="stat" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
      onClick={onGo}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGo() }
      }}
      aria-label={`${label} ${num} — ${hint}`} title={hint}>
      <span className="stat-num">{num}</span><span className="stat-label">{label}</span>
    </div>
  )
}

function Skeleton({ count = 3, cls = '' }) {
  return Array.from({ length: count }, (_, i) => <div key={i} className={`skeleton-card ${cls}`} aria-hidden="true" />)
}

function Section({ id, title, badge, action, children }) {
  return (
    <section id={id} className="dash-section">
      <div className="section-header">
        <h3 className="section-title">{title}</h3>
        {badge && <span className="section-badge">{badge}</span>}
        {action}
      </div>
      {children}
    </section>
  )
}

function fetchCommunity(page, setCommunity, sort = 'recent') {
  return (sort === 'popular' ? api.popularProjects(page) : api.publicProjects(page))
    .then((res) => setCommunity((c) => ({
      list: page === 1 ? res.projects : [...c.list, ...res.projects],
      page, hasMore: res.hasMore, loading: false,
    })))
    .catch(() => setCommunity((c) => ({ ...c, loading: false, hasMore: false })))
}

function Thumb({ src, icon: FallbackIcon = Puzzle }) {
  return (
    <div className="project-thumb" aria-hidden="true">
      {src ? <img src={src} alt="" /> : <FallbackIcon size={40} className="thumb-fallback" />}
    </div>
  )
}

/* ════════════════════════════════════════════════
   StudentHomePage — 로그인한 사용자의 개인 화면
   학생은 view에 따라 세 화면으로 나눠 보여준다 (App의 page 값과 같은 이름).
     · dashboard: 학생 홈 — 환영·이어하기·요약 숫자·검색·과제·추천 주제·친구 작품·출석
     · study:     단계별 학습 — 챕터 목록·나만의 게임 만들기
     · mypage:    마이페이지 — 내 작품·프로필·꾸미기·상점·학습 기록·우리 반·내 정보/설문 수정
   세 화면은 App에서 같은 자리에 같은 컴포넌트로 그려지므로 인스턴스가 유지된다.
   그래서 챕터·작품·아이템·코인 상태를 화면을 옮겨 다녀도 하나로 공유한다.
   선생님·보호자는 view와 관계없이 기존 화면(dashboard)만 쓴다.
   ════════════════════════════════════════════════ */
export default function StudentHomePage({ user, view = 'dashboard', onChangeView, onLogout, onOpenEditor, onEditSurvey, onOpenMyGame, onUserChange, onAccountDeleted, onGoHome, onOpenBoard }) {
  const role = user?.role ?? 'student'
  const isStudent = role === 'student'
  const page = isStudent && (view === 'study' || view === 'mypage') ? view : 'dashboard'
  // 만 14세 미만 + 보호자 동의 전: 친구 작품 보기·공유·리메이크 잠김 (챕터·작품 만들기는 가능)
  const consentPending = user?.consent_status === 'pending'
  const [chapters, setChapters] = useState([])
  const [projects, setProjects] = useState([])
  const [recos, setRecos] = useState([])
  const [items, setItems] = useState([])
  const [community, setCommunity] = useState(() => ({ list: [], page: 0, hasMore: !consentPending, loading: !consentPending }))
  const [load, setLoad] = useState({ ch: true, pr: true })
  const [err, setErr] = useState({ ch: '', pr: '' })
  const [filter, setFilter] = useState('all')
  const [lockedTip, setLockedTip] = useState(null)
  const [reporting, setReporting] = useState(null)
  const [toast, setToast] = useState('')
  const [accountOpen, setAccountOpen] = useState(false)
  const [coins, setCoins] = useState(user?.coins ?? 0)
  const [profileId, setProfileId] = useState(null) // 친구 프로필 창
  const [sort, setSort] = useState('recent')       // 친구 작품: 최신순 | 인기순
  const toastTimer = useRef(0)

  // 패널 컴포넌트의 effect 의존성에 들어가므로 항상 같은 함수
  const showToast = useCallback((msg) => {
    clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), 3500)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // 보호자가 다른 기기에서 동의했는지 확인
  const refreshConsent = async () => {
    try {
      const fresh = await api.me()
      onUserChange(fresh)
      if (fresh.consent_status === 'pending') {
        showToast('아직 동의 전이에요. 부모님이 보호자 화면에서 코드를 입력하면 바로 열려요!')
      } else {
        showToast('보호자 동의가 끝났어요! 이제 친구들과 작품을 나눌 수 있어요!')
        setCommunity((c) => ({ ...c, loading: true, hasMore: true }))
        fetchCommunity(1, setCommunity)
      }
    } catch (e) {
      showToast(e.message)
    }
  }

  const loadMoreCommunity = () => {
    setCommunity((c) => ({ ...c, loading: true }))
    fetchCommunity(community.page + 1, setCommunity, sort)
  }

  // 최신순 ↔ 인기순
  const changeSort = (next) => {
    setSort(next)
    setCommunity({ list: [], page: 0, hasMore: true, loading: true })
    fetchCommunity(1, setCommunity, next)
  }

  // 좋아요 켜고 끄기 (목록에서 바로 반영)
  const toggleLike = async (p) => {
    try {
      const res = await api.likeProject(p.id)
      setCommunity((c) => ({
        ...c,
        list: c.list.map((x) => (x.id === p.id ? { ...x, like_count: res.count, liked_by_me: res.liked ? 1 : 0 } : x)),
      }))
    } catch (e) {
      showToast(e.message)
    }
  }

  useEffect(() => {
    if (!isStudent) return // 교사·보호자는 학생 전용 데이터를 쓰지 않음 (TeacherPanel/GuardianPanel이 각자 필요한 데이터를 따로 불러옴)
    api.chapters().then(setChapters).catch((e) => setErr((x) => ({ ...x, ch: e.message })))
      .finally(() => setLoad((l) => ({ ...l, ch: false })))
    api.myProjects().then(setProjects).catch((e) => setErr((x) => ({ ...x, pr: e.message })))
      .finally(() => setLoad((l) => ({ ...l, pr: false })))
    api.recommendations().then((r) => setRecos(Array.isArray(r) ? r : [])).catch(() => setRecos([]))
    api.items().then(setItems).catch(() => setItems([]))
    if (!consentPending) fetchCommunity(1, setCommunity)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- 첫 화면에서 한 번만 불러옴

  const completedNos = useMemo(
    () => chapters.filter((c) => c.status === 'completed').map((c) => Number(c.order_num)),
    [chapters],
  )
  const allDone = chapters.length > 0 && completedNos.length >= CHAPTER_COUNT
  const current = chapters.find((c) => c.status === 'in_progress')
  const equipped = items.filter((i) => Number(i.equipped))
  const lastProject = projects.find((p) => p.track === 'free')

  /* 페이스메이커: 오늘 할 일을 코코가 먼저 제안 */
  const pacemaker = useMemo(() => {
    if (role === 'teacher') return '선생님, 반을 만들고 참여 코드를 알려주시면 학생들의 챕터 진도를 한눈에 볼 수 있어요.'
    if (role === 'guardian') return '아이 화면에 보이는 동의 코드를 입력하면 아이 계정이 연결되고 학습 진도를 볼 수 있어요.'
    if (load.ch) return '오늘은 뭘 해볼까? 잠깐만, 기록을 확인하고 있어…'
    if (current) {
      const no = Number(current.order_num)
      return no === 1
        ? '처음이구나! 챕터 1에서 캐릭터를 움직이는 것부터 같이 해보자'
        : `지난번엔 챕터 ${no - 1}까지 끝냈어! 오늘은 챕터 ${no} '${CHAPTERS[no]?.title.split(' – ')[0]}'에 도전해볼까?`
    }
    if (allDone && lastProject) return `모든 챕터 완료! 만들던 '${lastProject.title}' 이어서 만들어볼까?`
    if (allDone) return '모든 챕터를 끝냈어! 이제 배운 블록으로 나만의 게임을 만들어보자!'
    return '오늘도 블록으로 멋진 작품을 만들어보자!'
  }, [role, load.ch, current, allDone, lastProject])

  const openChapter = (ch) => {
    if (ch.status === 'locked') {
      setLockedTip(ch.id)
      setTimeout(() => setLockedTip(null), 2200)
      return
    }
    onOpenEditor({ mode: 'chapter', chapter: ch })
  }
  // 검색 결과에서 챕터 열기 — 목록에 있는 챕터 정보를 그대로 쓴다
  const openChapterById = (chapterId) => {
    const ch = chapters.find((c) => Number(c.id) === Number(chapterId))
    if (ch) openChapter(ch)
    else showToast('챕터를 불러오는 중이에요. 잠시 후 다시 눌러주세요.')
  }

  const openProject = (p) => onOpenEditor({ mode: 'free', projectId: p.id, completedChapters: completedNos })
  const openTopic = (t) => onOpenEditor({ mode: 'free', topic: t, completedChapters: completedNos })
  const openBlank = () => onOpenEditor({ mode: 'free', completedChapters: completedNos })

  // 마이페이지: 프로필(레벨·업적·친구)과 연속 출석일은 마이페이지에 들어올 때마다 새로 불러온다
  const myProfile = useMyProfile(showToast, page === 'mypage')
  const [streak, setStreak] = useState(null)
  useEffect(() => {
    if (page !== 'mypage') return undefined
    let alive = true
    api.attendance()
      .then((s) => { if (alive) setStreak(s.streak ?? 0) })
      .catch(() => {})
    return () => { alive = false }
  }, [page])

  // 화면(view)을 바꾸면 맨 위에서 시작한다. 다른 화면의 특정 구역으로 가야 할 때는
  // 화면이 바뀐 뒤 그 구역으로 스크롤한다 (scrollTargetRef). 첫 화면 진입 때는 건드리지 않는다.
  const scrollTargetRef = useRef(null)
  const prevPageRef = useRef(page)
  useEffect(() => {
    if (prevPageRef.current === page) return
    prevPageRef.current = page
    const target = scrollTargetRef.current
    scrollTargetRef.current = null
    if (!target) {
      window.scrollTo(0, 0)
      return undefined
    }
    // 새 화면으로 바로 이동한 뒤, 위쪽 구역(학습 기록·상점 등)이 늦게 그려지며 위치가 밀리는 동안 몇 번 더 맞춘다
    const go = () => scrollToSection(target, false)
    go()
    const timers = [150, 400, 800].map((ms) => setTimeout(go, ms))
    return () => timers.forEach(clearTimeout)
  }, [page])

  const goToSection = (targetPage, sectionId) => {
    if (page === targetPage) {
      scrollToSection(sectionId)
    } else {
      scrollTargetRef.current = sectionId
      onChangeView?.(targetPage)
    }
  }

  // 공통 TopNav의 카테고리 메뉴 클릭 처리. Q&A·게임존은 이번 MVP에서 미구현이라 안내만 표시.
  const handleNavigate = (key) => {
    if (key === 'home') {
      onChangeView?.('dashboard')
    } else if (key === 'study') {
      if (isStudent) onChangeView?.('study')
    } else if (key === 'free') {
      if (isStudent) openBlank()
      else showToast('자유창작은 학생 계정에서만 이용할 수 있어요.')
    } else if (key === 'board') {
      onOpenBoard?.()
    } else if (key === 'popular') {
      changeSort('popular')
      goToSection('dashboard', 'community-section')
    } else {
      showToast('이 메뉴는 곧 만나볼 수 있어요. 지금은 준비 중이에요!')
    }
  }

  const removeProject = async (p) => {
    if (!window.confirm(`'${p.title}' 작품을 삭제할까요? 되돌릴 수 없어요.`)) return
    try {
      await api.deleteProject(p.id)
      setProjects((list) => list.filter((x) => x.id !== p.id))
      setCommunity((c) => ({ ...c, list: c.list.filter((x) => x.id !== p.id) }))
    } catch (e) {
      showToast(`삭제하지 못했어요: ${e.message}`)
    }
  }

  const remake = async (p) => {
    try {
      const res = await api.remakeProject(p.id)
      onOpenEditor({ mode: 'free', projectId: res.id, completedChapters: completedNos })
    } catch (e) {
      showToast(`리메이크하지 못했어요: ${e.message}`)
    }
  }

  // 신고: 서로 다른 3명이 신고하면 서버가 자동으로 비공개 처리
  const report = async (p, reason) => {
    setReporting(null)
    try {
      const res = await api.reportProject(p.id, reason)
      setCommunity((c) => ({ ...c, list: c.list.filter((x) => x.id !== p.id) }))
      showToast(res.message ?? '신고가 접수됐어요')
    } catch (e) {
      showToast(e.message)
    }
  }

  const toggleEquip = async (item) => {
    const next = !Number(item.equipped)
    try {
      await api.equipItem(item.id, next)
      setItems((list) => list.map((i) => {
        if (i.id === item.id) return { ...i, equipped: next ? 1 : 0 }
        if (next && i.item_type === item.item_type) return { ...i, equipped: 0 } // 같은 종류는 하나만
        return i
      }))
    } catch (e) {
      showToast(e.message)
    }
  }

  const shownProjects = projects.filter((p) => filter === 'all' || p.track === filter)

  return (
    <div className="dash-root">
      {toast && <div className="dash-toast" role="status">{toast}</div>}
      <TopNav
        user={user}
        active={!isStudent ? undefined : page === 'study' ? 'study' : page === 'dashboard' ? 'home' : undefined}
        onNavigate={handleNavigate}
        onLogout={onLogout}
        onBrandClick={onGoHome}
        // 학생은 단계별 학습·마이페이지에서 학생 홈으로 돌아올 수 있게 메인 홈과 같은 '학생 홈' 메뉴를 붙인다
        extraMenu={isStudent ? [{ key: 'home', icon: House, label: '학생 홈' }] : []}
        right={
          <div className="dash-header-right">
            <TextSizeControl />
            <div className="user-chip">
              {isStudent
                ? <CocoAvatar size={28} items={equipped} />
                : <span className="user-initial" aria-hidden="true">{user?.username?.[0]}</span>}
              <span className="user-name">{user?.username}</span>
              {isStudent
                ? user?.level && <span className="user-level-tag">{LEVEL_LABEL[user.level] ?? user.level}</span>
                : <span className="user-level-tag">{ROLE_LABEL[role]}</span>}
            </div>
            {/* 학생: 마이페이지로 이동 (내 정보 창은 마이페이지에서 연다). 선생님·보호자: 기존처럼 내 정보 창 */}
            {isStudent
              ? <button type="button" className="btn-icon" onClick={() => onChangeView?.('mypage')} title="마이페이지" aria-label="마이페이지"><User size={18} aria-hidden="true" /></button>
              : <button type="button" className="btn-icon" onClick={() => setAccountOpen(true)} title="내 정보" aria-label="내 정보"><User size={18} aria-hidden="true" /></button>}
            {isStudent && <button type="button" className="btn-icon" onClick={onEditSurvey} title="관심사·코딩 수준 수정" aria-label="관심사 수정"><Settings size={18} aria-hidden="true" /></button>}
            <button type="button" className="btn-icon" onClick={onLogout} title="로그아웃" aria-label="로그아웃">
              <LogOut size={18} aria-hidden="true" />
            </button>
          </div>
        }
      />

      <main className="dash-main">
        {/* ── 환영 + 페이스메이커 (학생 홈) ── */}
        {page === 'dashboard' && <section className="dash-section dash-welcome-section">
          <div className={`welcome-banner ${isStudent ? '' : 'is-adult'}`}>
            <div className="welcome-coco">
              {isStudent && <CocoAvatar size={92} emotion="happy" items={equipped} />}
              <div className="welcome-text">
                <h2 className="welcome-title">
                  {isStudent
                    ? <>안녕, <em>{user?.username}</em>!</>
                    : role === 'teacher'
                      ? <>안녕하세요, {user?.affiliation ? <>{user.affiliation} <em>{user?.username}</em></> : <em>{user?.username}</em>} 선생님</>
                      : <>안녕하세요, <em>{user?.username}</em> 보호자님</>}
                </h2>
                <p className="welcome-bubble">{pacemaker}</p>
                <div className="welcome-cta-row">
                  {current && isStudent && (
                    <button type="button" className="welcome-cta" onClick={() => openChapter(current)}>
                      챕터 {current.order_num} 이어하기 →
                    </button>
                  )}
                  {allDone && isStudent && (
                    <button type="button" className="welcome-cta" onClick={onOpenMyGame}>나만의 게임 만들기 →</button>
                  )}
                  {/* 최근 작품 이어 만들기: 내 작품 목록(서버 updated_at 최신순)의 첫 자유창작 작품(lastProject).
                      목록을 불러오는 중이거나 실패했을 때는 '작품 없음'과 구분해 버튼을 띄우지 않는다 */}
                  {isStudent && !load.pr && !err.pr && lastProject && (
                    <button type="button" className="welcome-cta welcome-cta-secondary" onClick={() => openProject(lastProject)}
                      title={lastProject.title} aria-label={`최근 작품 이어 만들기: ${lastProject.title}`}>
                      최근 작품 이어 만들기
                    </button>
                  )}
                  {isStudent && (
                    <button type="button" className="welcome-cta welcome-cta-secondary" onClick={openBlank}>
                      자유창작 시작하기
                    </button>
                  )}
                </div>
              </div>
            </div>
            {isStudent && (
              <div className="welcome-stats">
                <StatLink num={`${completedNos.length}/${CHAPTER_COUNT}`} label="챕터 완료" hint="단계별 학습으로 이동"
                  onGo={() => goToSection('study', SECTION_ID.chapters)} />
                <div className="stat-divider" />
                <StatLink num={load.pr ? '…' : projects.length} label="내 작품" hint="마이페이지의 내 작품으로 이동"
                  onGo={() => goToSection('mypage', SECTION_ID.projects)} />
                <div className="stat-divider" />
                <StatLink num={items.length} label="아이템" hint="마이페이지의 코코 꾸미기로 이동"
                  onGo={() => goToSection('mypage', SECTION_ID.items)} />
                <div className="stat-divider" />
                <StatLink num={coins} label="코인" hint="마이페이지의 코코 상점으로 이동"
                  onGo={() => goToSection('mypage', SECTION_ID.shop)} />
              </div>
            )}
          </div>
        </section>}

        {page === 'dashboard' && isStudent && consentPending && <ConsentBanner user={user} onRefresh={refreshConsent} />}
        {page === 'dashboard' && isStudent && (
          <section className="dash-section dash-search-section">
            <SearchBox onOpenProject={openProject} onOpenChapter={(c) => openChapterById(c.id)} onRemake={remake} />
          </section>
        )}
        {role === 'teacher' && <TeacherPanel showToast={showToast} />}
        {role === 'guardian' && <GuardianPanel showToast={showToast} />}

        {/* ── 단계별 기초학습 (단계별 학습 화면) ── */}
        {page === 'study' && <Section id={SECTION_ID.chapters} title="단계별 기초학습" badge={!load.ch && chapters.length ? `${completedNos.length}/${chapters.length}` : null}>
          <p className="dash-hint">체스를 폰 하나로 시작하듯, 챕터마다 새 블록 몇 개씩만 배워요. 앞 챕터를 끝내면 다음 챕터가 열려요.</p>
          <div className="chapters-list">
            {load.ch ? <Skeleton count={5} cls="chapter-skeleton" />
              : err.ch ? <div className="empty-msg" role="alert">챕터를 불러오지 못했습니다: {err.ch}</div>
                : chapters.map((ch) => {
                  const s = STATUS[ch.status] ?? STATUS.locked
                  const StatusIcon = s.icon
                  const content = CHAPTERS[ch.order_num]
                  return (
                    <button key={ch.id} type="button" className={`chapter-card ch-${s.cls}`} onClick={() => openChapter(ch)}
                      aria-disabled={ch.status === 'locked'}>
                      <div className={`ch-num ch-num-${s.cls}`}>{ch.order_num}</div>
                      <div className="ch-info">
                        <div className="ch-title">{content?.title ?? ch.title}</div>
                        <div className="ch-desc">{content?.mission ?? ch.mission}</div>
                        {ch.reward_item && <div className="ch-reward">보상: {ch.reward_item}</div>}
                        {ch.best_score != null && (
                          <div className="ch-score">
                            {ch.status === 'completed' && (
                              <Stars count={starsOf(ch.best_score)} size={14} className="ch-stars" />
                            )}
                            최고 <b>{ch.best_score}점</b> · 제출 {ch.attempts}번
                          </div>
                        )}
                      </div>
                      <div className={`ch-badge ch-badge-${s.cls}`}>
                        <StatusIcon size={13} className="ch-badge-icon" aria-hidden="true" />
                        <span>{s.label}</span>
                      </div>
                      {lockedTip === ch.id && <div className="ch-locked-tip" role="status">이전 챕터를 먼저 완료해주세요!</div>}
                    </button>
                  )
                })}
            {!load.ch && !err.ch && (
              <button type="button" className={`chapter-card mygame-card ${allDone ? 'ch-active' : 'ch-locked'}`}
                onClick={() => (allDone ? onOpenMyGame() : showToast('챕터 5까지 모두 완료하면 열려요!'))}>
                <div className="ch-num"><Gamepad2 size={22} aria-hidden="true" /></div>
                <div className="ch-info">
                  <div className="ch-title">나만의 게임 만들기</div>
                  <div className="ch-desc">배운 모든 블록 + 직접 그린 캐릭터 + 녹음한 소리로 완성형 게임 만들기</div>
                </div>
                <div className={`ch-badge ch-badge-${allDone ? 'active' : 'locked'}`}>{allDone ? '열림' : '챕터 5 완료 시'}</div>
              </button>
            )}
          </div>
        </Section>}

        {/* ── 마이페이지: 왼쪽 내 정보(프로필 카드, 넓은 화면에서 스크롤을 따라오는 sticky) / 오른쪽 학습 현황·활동·나머지 기능 ──
            좁은 화면에서는 한 열로 프로필 → 학습 현황 → 나머지 순서 (HTML 순서 그대로) */}
        {page === 'mypage' && (
          <div className="mypage">
            <section className="dash-section mypage-head">
              <div className="section-header"><h2 className="section-title">마이페이지</h2></div>
            </section>
            <div className="mypage-layout">
              {/* 왼쪽 묶음: 프로필 요약 → 업적·친구·공개 범위(접기) → 우리 반 카드. 넓은 화면에서는 묶음 전체가 sticky */}
              <div className="mypage-side">
                <MyProfileSide profile={myProfile} roleLabel={ROLE_LABEL[role]} equippedItems={equipped}
                  onEditAccount={() => setAccountOpen(true)} onEditSurvey={onEditSurvey}
                  onOpenShowroom={() => goToSection('mypage', SECTION_ID.items)}
                  onOpenProfile={setProfileId}>
                  <div className="profile-card mypage-class-card">
                    <StudentClasses showToast={showToast} />
                  </div>
                </MyProfileSide>
              </div>
              <div className="mypage-main">
                {/* 나의 학습 현황: 이미 있는 값만 쓴다 (챕터 완료·내 작품은 학생 홈 요약과 같은 값, 연속 출석은 출석 API) */}
                <Section title="나의 학습 현황">
                  <div className="mypage-stats">
                    <div className="profile-card mypage-stat"><span className="stat-num">{completedNos.length}/{CHAPTER_COUNT}</span><span className="stat-label">챕터 완료</span></div>
                    <div className="profile-card mypage-stat"><span className="stat-num">{load.pr ? '…' : projects.length}</span><span className="stat-label">내 작품</span></div>
                    <div className="profile-card mypage-stat"><span className="stat-num">{streak ?? '…'}</span><span className="stat-label">연속 출석(일)</span></div>
                  </div>
                </Section>
                <ActivityChart />

                {/* ── 내 포트폴리오 (마이페이지) ── */}
                <Section id={SECTION_ID.projects} title="내 포트폴리오" badge={projects.length ? `${projects.length}개` : null}
                  action={
                    <div className="filter-tabs" role="tablist">
                      {[['all', '전체'], ['chapter', '챕터 완성작'], ['free', '자유 창작']].map(([v, l]) => (
                        <button key={v} type="button" role="tab" aria-selected={filter === v} className={filter === v ? 'on' : ''}
                          onClick={() => setFilter(v)}>{l}</button>
                      ))}
                    </div>
                  }>
                  {load.pr ? (
                    <div className="projects-grid"><Skeleton count={3} cls="project-skeleton" /></div>
                  ) : err.pr ? (
                    <div className="empty-msg" role="alert">작품을 불러오지 못했습니다: {err.pr}</div>
                  ) : shownProjects.length === 0 ? (
                    <div className="empty-projects">
                      <img src={emptyProjectsImg} alt="" className="empty-icon" aria-hidden="true" />
                      <p className="empty-text">아직 작품이 없어요. 챕터를 완료하거나 자유 창작에서 저장하면 여기에 쌓여요!</p>
                      <button type="button" className="btn-dash-new" onClick={openBlank}>첫 작품 만들기</button>
                    </div>
                  ) : (
                    <div className="projects-grid">
                      {shownProjects.map((p) => (
                        <div key={p.id} className="project-card">
                          <button type="button" className="project-open" onClick={() => openProject(p)} aria-label={`${p.title} 열기`}>
                            <Thumb src={p.thumbnail_url} icon={p.track === 'chapter' ? Trophy : Puzzle} />
                            <div className="project-info">
                              <div className="project-title">{p.title}</div>
                              <div className="project-meta">
                                <span className={`project-track track-${p.track}`}>{p.track === 'chapter' ? '챕터' : '자유 창작'}</span>
                                {Number(p.report_hidden)
                                  ? <span className="project-hidden" title="신고가 여러 번 들어와서 비공개로 바뀌었어요">숨겨짐</span>
                                  : Number(p.is_public) ? <span className="project-public">공개</span> : <span className="project-private">비공개</span>}
                                {Number(p.remake_count) > 0 && <span className="project-remakes">리메이크 {p.remake_count}</span>}
                                <span className="project-date">{fmtDate(p.updated_at)}</span>
                              </div>
                            </div>
                          </button>
                          <button type="button" className="project-del" onClick={() => removeProject(p)} aria-label={`${p.title} 삭제`} title="삭제"><Trash2 size={16} aria-hidden="true" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* ── 코코 꾸미기 (마이페이지) ── */}
                <Section id={SECTION_ID.items} title="코코 꾸미기" badge={items.length ? `${items.length}개 모음` : null}>
                  {items.length === 0 ? (
                    <div className="empty-msg">챕터를 완료하거나 작품을 저장하면 코코를 꾸밀 아이템을 받아요. 아래 상점에서 코인으로 살 수도 있어요!</div>
                  ) : (
                    <div className="items-wrap">
                      <div className="items-preview"><CocoAvatar size={110} emotion="happy" items={equipped} /></div>
                      <div className="items-grid">
                        {items.map((it) => (
                          <button key={it.id} type="button" className={`item-card ${Number(it.equipped) ? 'on' : ''}`} onClick={() => toggleEquip(it)}
                            aria-pressed={!!Number(it.equipped)} title={Number(it.equipped) ? '벗기기' : '입히기'}>
                            <span className="item-emoji" aria-hidden="true">{it.emoji}</span>
                            <span className="item-name">{it.item_name}</span>
                            <span className="item-type">{ITEM_TYPE_LABEL[it.item_type] ?? it.item_type}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Section>

                {/* ── 코코 상점 (마이페이지) ── */}
                {/* 상점은 불러오는 동안 골격 카드만 그리므로, 바로가기 대상 ID는 감싸는 칸에 둔다 */}
                <div id={SECTION_ID.shop}>
                  <ShopPanel showToast={showToast} equipped={equipped} onCoinsChange={setCoins}
                    onBought={() => api.items().then(setItems).catch(() => {})} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 학생 홈: 넓은 화면에서는 왼쪽(주 내용)과 오른쪽(출석) 두 단으로 나눈다. 좁으면 한 줄로 쌓인다 */}
        {isStudent && page === 'dashboard' && <div className="dash-columns">
        <div className="dash-col-main">
        {page === 'dashboard' && <StudentAssignments onOpenChapter={openChapterById} showToast={showToast} onCoinsChange={setCoins} />}

        {/* ── 오늘의 추천 주제 (학생 홈) ── */}
        {page === 'dashboard' && <Section title="오늘의 추천 주제" badge={user?.tags?.length ? '관심사 기반' : null}
          action={<button type="button" className="section-action" onClick={onEditSurvey}>관심사 바꾸기</button>}>
          {!user?.tags?.length && (
            <p className="dash-hint">관심사를 알려주면 딱 맞는 주제를 추천해줄게! <button type="button" className="link-btn" onClick={onEditSurvey}>관심사 고르기</button></p>
          )}
          <div className="recos-grid">
            {recos.map((t) => (
              <button key={`${t.category}-${t.title}`} type="button" className={`reco-card reco-lv${t.level}`}
                onClick={() => openTopic(t)} aria-label={`${t.title} 시작하기`}>
                <div className="reco-category">{t.category}</div>
                <div className="reco-title">{t.title}</div>
                <div className="reco-footer">
                  <span className="reco-hint">{t.hintBlock ? BLOCK_INFO[t.hintBlock]?.name : t.hint}</span>
                  <span className="reco-level">Lv.{t.level}</span>
                </div>
              </button>
            ))}
            <button type="button" className="reco-card reco-blank" onClick={openBlank}>
              <div className="reco-category">직접 시작</div>
              <div className="reco-title">빈 무대에서 내 마음대로 만들기</div>
            </button>
          </div>
        </Section>}

        {/* ── 친구 작품 (학생 홈) ── */}
        {page === 'dashboard' && <Section id="community-section" title="친구 작품"
          action={
            <div className="filter-tabs" role="tablist" aria-label="정렬">
              {[['recent', '최신순'], ['popular', '인기순']].map(([v, l]) => (
                <button key={v} type="button" role="tab" aria-selected={sort === v} className={sort === v ? 'on' : ''}
                  onClick={() => changeSort(v)}>{l}</button>
              ))}
            </div>
          }>
          {consentPending ? (
            <div className="empty-msg">보호자 동의가 끝나면 친구들의 작품을 보고 리메이크할 수 있어요.</div>
          ) : community.list.length === 0 && !community.loading ? (
            <div className="empty-msg">아직 공개된 작품이 없어요. 에디터에서 공유를 눌러 첫 번째로 공개해보세요!</div>
          ) : (
            <div className="projects-grid">
              {community.list.map((p) => (
                <div key={p.id} className="project-card community-card">
                  <Thumb src={p.thumbnail_url} />
                  <div className="project-info">
                    <div className="project-title">{p.title}</div>
                    <div className="project-meta">
                      <button type="button" className="project-author-btn" onClick={() => setProfileId(Number(p.user_id))}
                        title={`${p.username} 프로필 보기`}>{p.username}</button>
                      <span className="project-remakes">리메이크 {p.remake_count ?? 0}</span>
                      {Number(p.user_id) === Number(user?.id)
                        ? <span className="project-likes" title="받은 좋아요"><Heart size={14} aria-label="받은 좋아요" /> {p.like_count ?? 0}</span>
                        : (
                          <button type="button" className={`like-btn ${Number(p.liked_by_me) ? 'on' : ''}`}
                            onClick={() => toggleLike(p)} aria-pressed={!!Number(p.liked_by_me)}
                            title={Number(p.liked_by_me) ? '좋아요 취소' : '좋아요'}>
                            <Heart size={14} aria-hidden="true" /> {p.like_count ?? 0}
                          </button>
                        )}
                    </div>
                  </div>
                  {Number(p.user_id) === Number(user?.id)
                    ? <button type="button" className="remake-btn mine" onClick={() => openProject(p)}>내 작품</button>
                    : Number(p.allow_remake ?? 1)
                      ? <button type="button" className="remake-btn" onClick={() => remake(p)}>리메이크</button>
                      : <button type="button" className="remake-btn view-only" onClick={() => openProject(p)} title="작가가 구경만 허용한 작품이에요">구경하기</button>}
                  {Number(p.user_id) !== Number(user?.id) && (
                    reporting === p.id ? (
                      <div className="report-box" role="group" aria-label="신고 이유">
                        <span>어떤 문제가 있나요?</span>
                        {REPORT_REASONS.map((r) => (
                          <button key={r} type="button" onClick={() => report(p, r)}>{r}</button>
                        ))}
                        <button type="button" className="report-cancel" onClick={() => setReporting(null)}>취소</button>
                      </div>
                    ) : (
                      <button type="button" className="report-btn" onClick={() => setReporting(p.id)} title="신고하기">신고</button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
          {!consentPending && community.hasMore && community.list.length > 0 && (
            <button type="button" className="more-btn" onClick={loadMoreCommunity} disabled={community.loading}>
              {community.loading ? '불러오는 중…' : '더 보기'}
            </button>
          )}
        </Section>}

        </div>

        <aside className="dash-col-side" aria-label="내 기록">
          <AttendanceCard showToast={showToast} onCoinsChange={setCoins} />
        </aside>
        </div>}
      </main>

      <SiteFooter onNavigate={handleNavigate} />

      {profileId && (
        <ProfileModal userId={profileId} onClose={() => setProfileId(null)} showToast={showToast}
          onOpenProject={(p) => openProject(p)} />
      )}

      {accountOpen && (
        <AccountModal user={user} onClose={() => setAccountOpen(false)} onUserChange={onUserChange}
          onDeleted={onAccountDeleted} showToast={showToast} />
      )}
    </div>
  )
}
