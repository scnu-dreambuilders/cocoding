import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import { BrandIcon } from '../components/icons'
import { CocoAvatar } from '../components/Coco'
import { CHAPTERS, CHAPTER_COUNT } from '../data/chapters'
import { INTEREST_EMOJI, LEVEL_LABEL, ITEM_TYPE_LABEL } from '../data/library'
import { BLOCK_INFO } from '../blockly/blocks'
import emptyProjectsImg from '../assets/empty-projects.png'
import './DashboardPage.css'

const STATUS = {
  completed:   { label: '완료',    cls: 'done',   icon: '✓' },
  in_progress: { label: '도전 중', cls: 'active', icon: '▶' },
  locked:      { label: '잠김',    cls: 'locked', icon: '🔒' },
}

// backend/models/ProjectModel.php의 REPORT_REASONS와 같아야 함
const REPORT_REASONS = ['나쁜 말이나 그림', '개인정보(얼굴·이름·목소리)가 있어요', '내 작품을 베꼈어요', '기타']

function fmtDate(str) {
  if (!str) return ''
  return new Date(str.replace(' ', 'T')).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

function Skeleton({ count = 3, cls = '' }) {
  return Array.from({ length: count }, (_, i) => <div key={i} className={`skeleton-card ${cls}`} aria-hidden="true" />)
}

function Section({ icon, title, badge, action, children }) {
  return (
    <section className="dash-section">
      <div className="section-header">
        <h3 className="section-title"><span aria-hidden="true">{icon}</span>{title}</h3>
        {badge && <span className="section-badge">{badge}</span>}
        {action}
      </div>
      {children}
    </section>
  )
}

function fetchCommunity(page, setCommunity) {
  return api.publicProjects(page)
    .then((res) => setCommunity((c) => ({
      list: page === 1 ? res.projects : [...c.list, ...res.projects],
      page, hasMore: res.hasMore, loading: false,
    })))
    .catch(() => setCommunity((c) => ({ ...c, loading: false, hasMore: false })))
}

function Thumb({ src, fallback = '🧩' }) {
  return (
    <div className="project-thumb" aria-hidden="true">
      {src ? <img src={src} alt="" /> : <span className="thumb-fallback">{fallback}</span>}
    </div>
  )
}

/* ════════════════════════════════════════════════
   DashboardPage
   ════════════════════════════════════════════════ */
export default function DashboardPage({ user, onLogout, onOpenEditor, onEditSurvey, onOpenMyGame }) {
  const [chapters, setChapters] = useState([])
  const [projects, setProjects] = useState([])
  const [recos, setRecos] = useState([])
  const [items, setItems] = useState([])
  const [community, setCommunity] = useState({ list: [], page: 0, hasMore: true, loading: true })
  const [load, setLoad] = useState({ ch: true, pr: true })
  const [err, setErr] = useState({ ch: '', pr: '' })
  const [filter, setFilter] = useState('all')
  const [lockedTip, setLockedTip] = useState(null)
  const [reporting, setReporting] = useState(null)
  const [toast, setToast] = useState('')

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const loadMoreCommunity = () => {
    setCommunity((c) => ({ ...c, loading: true }))
    fetchCommunity(community.page + 1, setCommunity)
  }

  useEffect(() => {
    api.chapters().then(setChapters).catch((e) => setErr((x) => ({ ...x, ch: e.message })))
      .finally(() => setLoad((l) => ({ ...l, ch: false })))
    api.myProjects().then(setProjects).catch((e) => setErr((x) => ({ ...x, pr: e.message })))
      .finally(() => setLoad((l) => ({ ...l, pr: false })))
    api.recommendations().then((r) => setRecos(Array.isArray(r) ? r : [])).catch(() => setRecos([]))
    api.items().then(setItems).catch(() => setItems([]))
    fetchCommunity(1, setCommunity)
  }, [])

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
    if (load.ch) return '오늘은 뭘 해볼까? 잠깐만, 기록을 확인하고 있어…'
    if (current) {
      const no = Number(current.order_num)
      return no === 1
        ? '처음이구나! 챕터 1에서 캐릭터를 움직이는 것부터 같이 해보자 🐾'
        : `지난번엔 챕터 ${no - 1}까지 끝냈어! 오늘은 챕터 ${no} '${CHAPTERS[no]?.title.split(' – ')[0]}'에 도전해볼까?`
    }
    if (allDone && lastProject) return `모든 챕터 완료! 🎓 만들던 '${lastProject.title}' 이어서 만들어볼까?`
    if (allDone) return '모든 챕터를 끝냈어! 이제 배운 블록으로 나만의 게임을 만들어보자 🎮'
    return '오늘도 블록으로 멋진 작품을 만들어보자!'
  }, [load.ch, current, allDone, lastProject])

  const openChapter = (ch) => {
    if (ch.status === 'locked') {
      setLockedTip(ch.id)
      setTimeout(() => setLockedTip(null), 2200)
      return
    }
    onOpenEditor({ mode: 'chapter', chapter: ch })
  }
  const openProject = (p) => onOpenEditor({ mode: 'free', projectId: p.id, completedChapters: completedNos })
  const openTopic = (t) => onOpenEditor({ mode: 'free', topic: t, completedChapters: completedNos })
  const openBlank = () => onOpenEditor({ mode: 'free', completedChapters: completedNos })

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
      <header className="dash-header">
        <div className="dash-header-left">
          <BrandIcon />
          <span className="dash-brand-name">코코딩</span>
        </div>
        <div className="dash-header-right">
          <button type="button" className="btn-dash-new" onClick={openBlank}>＋ 새 프로젝트</button>
          <div className="user-chip">
            <CocoAvatar size={28} items={equipped} />
            <span className="user-name">{user?.username}</span>
            {user?.level && <span className="user-level-tag">{LEVEL_LABEL[user.level] ?? user.level}</span>}
          </div>
          <button type="button" className="btn-icon" onClick={onEditSurvey} title="관심사·코딩 수준 수정" aria-label="관심사 수정">⚙️</button>
          <button type="button" className="btn-icon" onClick={onLogout} title="로그아웃" aria-label="로그아웃">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </header>

      <main className="dash-main">
        {/* ── 환영 + 페이스메이커 ── */}
        <section className="dash-section dash-welcome-section">
          <div className="welcome-banner">
            <div className="welcome-coco">
              <CocoAvatar size={92} emotion="happy" items={equipped} />
              <div className="welcome-text">
                <h2 className="welcome-title">안녕, <em>{user?.username}</em>! 👋</h2>
                <p className="welcome-bubble">{pacemaker}</p>
                {current && (
                  <button type="button" className="welcome-cta" onClick={() => openChapter(current)}>
                    챕터 {current.order_num} 이어하기 →
                  </button>
                )}
                {allDone && (
                  <button type="button" className="welcome-cta" onClick={onOpenMyGame}>🎮 나만의 게임 만들기 →</button>
                )}
              </div>
            </div>
            <div className="welcome-stats">
              <div className="stat"><span className="stat-num">{completedNos.length}/{CHAPTER_COUNT}</span><span className="stat-label">챕터 완료</span></div>
              <div className="stat-divider" />
              <div className="stat"><span className="stat-num">{load.pr ? '…' : projects.length}</span><span className="stat-label">내 작품</span></div>
              <div className="stat-divider" />
              <div className="stat"><span className="stat-num">{items.length}</span><span className="stat-label">아이템</span></div>
            </div>
          </div>
        </section>

        {/* ── 오늘의 추천 주제 ── */}
        <Section icon="⭐" title="오늘의 추천 주제" badge={user?.tags?.length ? '관심사 기반' : null}
          action={<button type="button" className="section-action" onClick={onEditSurvey}>관심사 바꾸기</button>}>
          {!user?.tags?.length && (
            <p className="dash-hint">관심사를 알려주면 딱 맞는 주제를 추천해줄게! <button type="button" className="link-btn" onClick={onEditSurvey}>관심사 고르기</button></p>
          )}
          <div className="recos-grid">
            {recos.map((t) => (
              <button key={`${t.category}-${t.title}`} type="button" className={`reco-card reco-lv${t.level}`}
                onClick={() => openTopic(t)} aria-label={`${t.title} 시작하기`}>
                <div className="reco-category">{t.emoji ?? INTEREST_EMOJI[t.category]} {t.category}</div>
                <div className="reco-title">{t.title}</div>
                <div className="reco-footer">
                  <span className="reco-hint">🧩 {t.hintBlock ? BLOCK_INFO[t.hintBlock]?.name : t.hint}</span>
                  <span className="reco-level">Lv.{t.level}</span>
                </div>
              </button>
            ))}
            <button type="button" className="reco-card reco-blank" onClick={openBlank}>
              <div className="reco-category">✏️ 직접 시작</div>
              <div className="reco-title">빈 무대에서 내 마음대로 만들기</div>
            </button>
          </div>
        </Section>

        {/* ── 단계별 기초학습 ── */}
        <Section icon="♟️" title="단계별 기초학습" badge={!load.ch && chapters.length ? `${completedNos.length}/${chapters.length}` : null}>
          <p className="dash-hint">체스를 폰 하나로 시작하듯, 챕터마다 새 블록 몇 개씩만 배워요. 앞 챕터를 끝내면 다음 챕터가 열려요.</p>
          <div className="chapters-list">
            {load.ch ? <Skeleton count={5} cls="chapter-skeleton" />
              : err.ch ? <div className="empty-msg" role="alert">챕터를 불러오지 못했습니다: {err.ch}</div>
                : chapters.map((ch) => {
                  const s = STATUS[ch.status] ?? STATUS.locked
                  const content = CHAPTERS[ch.order_num]
                  return (
                    <button key={ch.id} type="button" className={`chapter-card ch-${s.cls}`} onClick={() => openChapter(ch)}
                      aria-disabled={ch.status === 'locked'}>
                      <div className={`ch-num ch-num-${s.cls}`}>{ch.order_num}</div>
                      <div className="ch-info">
                        <div className="ch-title">{content?.title ?? ch.title}</div>
                        <div className="ch-desc">{content?.mission ?? ch.mission}</div>
                        {ch.reward_item && <div className="ch-reward">🎁 보상: {ch.reward_emoji ?? ''} {ch.reward_item}</div>}
                      </div>
                      <div className={`ch-badge ch-badge-${s.cls}`}>
                        <span className="ch-badge-icon">{s.icon}</span>
                        <span>{s.label}</span>
                      </div>
                      {lockedTip === ch.id && <div className="ch-locked-tip" role="status">이전 챕터를 먼저 완료해주세요!</div>}
                    </button>
                  )
                })}
            {!load.ch && !err.ch && (
              <button type="button" className={`chapter-card mygame-card ${allDone ? 'ch-active' : 'ch-locked'}`}
                onClick={() => (allDone ? onOpenMyGame() : showToast('챕터 5까지 모두 완료하면 열려요!'))}>
                <div className="ch-num">🎮</div>
                <div className="ch-info">
                  <div className="ch-title">나만의 게임 만들기</div>
                  <div className="ch-desc">배운 모든 블록 + 직접 그린 캐릭터 + 녹음한 소리로 완성형 게임 만들기</div>
                </div>
                <div className={`ch-badge ch-badge-${allDone ? 'active' : 'locked'}`}>{allDone ? '열림' : '🔒 챕터 5 완료 시'}</div>
              </button>
            )}
          </div>
        </Section>

        {/* ── 내 포트폴리오 ── */}
        <Section icon="📁" title="내 포트폴리오" badge={projects.length ? `${projects.length}개` : null}
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
                    <Thumb src={p.thumbnail_url} fallback={p.track === 'chapter' ? '🏆' : '🧩'} />
                    <div className="project-info">
                      <div className="project-title">{p.title}</div>
                      <div className="project-meta">
                        <span className={`project-track track-${p.track}`}>{p.track === 'chapter' ? '챕터' : '자유 창작'}</span>
                        {Number(p.report_hidden)
                          ? <span className="project-hidden" title="신고가 여러 번 들어와서 비공개로 바뀌었어요">🚩 숨겨짐</span>
                          : Number(p.is_public) ? <span className="project-public">공개</span> : <span className="project-private">비공개</span>}
                        {Number(p.remake_count) > 0 && <span className="project-remakes">🔁 {p.remake_count}</span>}
                        <span className="project-date">{fmtDate(p.updated_at)}</span>
                      </div>
                    </div>
                  </button>
                  <button type="button" className="project-del" onClick={() => removeProject(p)} aria-label={`${p.title} 삭제`} title="삭제">🗑️</button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── 친구 작품 ── */}
        <Section icon="🌟" title="친구 작품" badge="리메이크해서 따라 만들어보기">
          {community.list.length === 0 && !community.loading ? (
            <div className="empty-msg">아직 공개된 작품이 없어요. 에디터에서 🔗 공유를 눌러 첫 번째로 공개해보세요!</div>
          ) : (
            <div className="projects-grid">
              {community.list.map((p) => (
                <div key={p.id} className="project-card community-card">
                  <Thumb src={p.thumbnail_url} />
                  <div className="project-info">
                    <div className="project-title">{p.title}</div>
                    <div className="project-meta">
                      <span className="project-author">👤 {p.username}</span>
                      <span className="project-remakes" title="리메이크 수">🔁 {p.remake_count ?? 0}</span>
                    </div>
                  </div>
                  {Number(p.user_id) === Number(user?.id)
                    ? <button type="button" className="remake-btn mine" onClick={() => openProject(p)}>내 작품</button>
                    : <button type="button" className="remake-btn" onClick={() => remake(p)}>🔁 리메이크</button>}
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
                      <button type="button" className="report-btn" onClick={() => setReporting(p.id)} title="신고하기">🚩 신고</button>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
          {community.hasMore && community.list.length > 0 && (
            <button type="button" className="more-btn" onClick={loadMoreCommunity} disabled={community.loading}>
              {community.loading ? '불러오는 중…' : '더 보기'}
            </button>
          )}
        </Section>

        {/* ── 코코 꾸미기 ── */}
        <Section icon="🎀" title="코코 꾸미기" badge={items.length ? `${items.length}개 모음` : null}>
          {items.length === 0 ? (
            <div className="empty-msg">챕터를 완료하거나 작품을 저장하면 코코를 꾸밀 아이템을 받아요!</div>
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
      </main>
    </div>
  )
}
