import { Fragment, useEffect, useRef, useState } from 'react'
import { Award, ChevronDown, Lock, Pencil } from 'lucide-react'
import { VISIBILITY, useMyProfile } from '../lib/useMyProfile'
import { CocoAvatar } from './Coco'
import './Profile.css'

/* ════════════════════════════════════════════════
   내 프로필 — 레벨·경험치·업적·친구·소개말·공개 범위
   (기능정의서 STU-017~028, 요구사항 SFR-STU-003)

   데이터(불러오기·저장)는 useMyProfile 하나가 맡고, 화면 조각은 나눠 쓴다.
   (useMyProfile은 lib/useMyProfile.js)
     · ProfileCard        기존 한 장짜리 카드 (예전 모양 그대로)
     · MyProfileSide      마이페이지 왼쪽 묶음: 프로필 요약(아바타·닉네임·역할·레벨·경험치·소개말·버튼)
                          + 업적·친구·프로필 공개 범위(접기·펼치기) + 우리 반(children)
   같은 useMyProfile 결과를 나눠 쓰므로 팔로우 취소 등이 모든 조각에 함께 반영된다.
   ════════════════════════════════════════════════ */
// 받은 좋아요는 99를 넘으면 +99로 (요구사항 24번)
const likeLabel = (n) => (n > 99 ? '+99' : String(n))

/* ── 조각: 소개말 (보기 / 수정) ── */
function ProfileBio({ p }) {
  return p.editing ? (
    <div className="profile-bio-edit">
      <input value={p.bio} onChange={(e) => p.setBio(e.target.value)} maxLength={50}
        placeholder="나를 소개하는 한 줄 (50자, 전화번호·이메일은 쓸 수 없어요)" aria-label="소개말" />
      <button type="button" className="role-btn" onClick={p.saveBio} disabled={p.busy}>저장</button>
      <button type="button" className="role-btn ghost" onClick={p.cancelEdit}>취소</button>
    </div>
  ) : (
    <p className="profile-bio">
      {p.me.bio || <span className="profile-bio-empty">아직 소개말이 없어요</span>}
      <button type="button" className="profile-edit" onClick={() => p.setEditing(true)}>수정</button>
    </p>
  )
}

/* ── 조각: 레벨 막대 (showStep: 현재 레벨 안에서 모은 경험치 / 레벨 하나에 필요한 경험치) ── */
function ProfileLevel({ me, showStep = false }) {
  return (
    <div className="profile-level">
      {showStep && (
        <div className="mypage-exp-head">
          <span>EXP</span>
          <span>{me.isMax ? '최고 레벨' : `${me.intoLevel} / ${me.levelStep}`}</span>
        </div>
      )}
      <div className="profile-level-bar">
        <span style={{ width: `${Math.round((me.intoLevel / me.levelStep) * 100)}%` }} />
      </div>
      <small>
        경험치 {me.xp}
        {me.isMax ? ' · 최고 레벨!' : ` · 다음 레벨까지 ${me.toNext}`}
      </small>
    </div>
  )
}

// friendsToggle({ open, controls, onToggle })이 있으면 '친구 n'을 친구 영역을 펼치는 버튼으로 (마이페이지). 없으면 기존 글자
function ProfileStats({ me, friendsToggle }) {
  const friendCount = me.friends?.length ?? 0
  return (
    <div className="profile-stats">
      <span>받은 좋아요 <b>{likeLabel(me.likesReceived)}</b></span>
      <span>팔로워 <b>{me.followers}</b></span>
      {friendsToggle ? (
        <button type="button" className="mypage-stat-toggle" aria-expanded={friendsToggle.open}
          aria-controls={friendsToggle.controls} onClick={friendsToggle.onToggle}>
          친구 <b>{friendCount}</b>
          <ChevronDown size={14} className="mypage-fold-icon" aria-hidden="true" />
        </button>
      ) : (
        <span>친구 <b>{friendCount}</b></span>
      )}
    </div>
  )
}

// hideLegend: 접기 머리에 이미 '프로필 공개 범위'가 있을 때 화면에서는 숨기고 화면 낭독기용 이름만 남긴다
function VisibilityField({ p, hideLegend = false }) {
  return (
    <fieldset className="profile-visibility">
      <legend className={hideLegend ? 'mypage-sr-only' : undefined}>프로필 공개 범위</legend>
      {VISIBILITY.map((v) => (
        <label key={v.id} className={`profile-vis ${p.me.visibility === v.id ? 'on' : ''}`} title={v.desc}>
          <input type="radio" name="visibility" checked={p.me.visibility === v.id} onChange={() => p.setVisibility(v.id)} />
          <span>{v.label}{p.me.visibility === v.id && <small>{v.desc}</small>}</span>
        </label>
      ))}
    </fieldset>
  )
}

// showDesc: 이름 아래에 기존 설명(a.desc)을 글자로도 보여준다 (마이페이지). 기본은 기존처럼 title만
function AchievementGrid({ me, showDesc = false }) {
  const earned = me.allAchievements?.filter((a) => a.earned) ?? []
  const locked = me.allAchievements?.filter((a) => !a.earned) ?? []
  return (
    <div className="achv-grid">
      {[...earned, ...locked].map((a) => (
        <div key={a.code} className={`achv ${a.earned ? 'on' : ''}`} title={a.earned ? a.desc : `${a.desc} (아직 못 받았어요)`}>
          {a.earned ? <Award size={24} className="achv-icon" aria-hidden="true" /> : <Lock size={24} className="achv-icon" aria-hidden="true" />}
          <span className="achv-name">{a.name}</span>
          {showDesc && <small className="mypage-achv-desc">{a.desc}{!a.earned && ' (아직 못 받았어요)'}</small>}
        </div>
      ))}
    </div>
  )
}

const earnedCount = (me) => me.allAchievements?.filter((a) => a.earned).length ?? 0

function FriendList({ p, onOpenProfile }) {
  const { me } = p
  return (me.friends?.length ?? 0) === 0 && (me.followingOnly?.length ?? 0) === 0 ? (
    <p className="dash-hint">친구 작품에서 마음에 드는 작품을 만든 친구를 팔로우해보세요.</p>
  ) : (
    <ul className="friend-list">
      {me.friends.map((f) => (
        <li key={f.id}>
          <button type="button" className="friend-open" onClick={() => onOpenProfile?.(f.id)}>
            <b>{f.username}</b>
            {f.bio && <small>{f.bio}</small>}
          </button>
          <span className="friend-tag">친구</span>
          <button type="button" className="row-remove" onClick={() => p.unfollow(f)} title="팔로우 취소" aria-label={`${f.username} 팔로우 취소`}>×</button>
        </li>
      ))}
      {me.followingOnly.map((f) => (
        <li key={f.id}>
          <button type="button" className="friend-open" onClick={() => onOpenProfile?.(f.id)}>
            <b>{f.username}</b>
          </button>
          <span className="friend-tag pending">팔로우 중</span>
          <button type="button" className="row-remove" onClick={() => p.unfollow(f)} title="팔로우 취소" aria-label={`${f.username} 팔로우 취소`}>×</button>
        </li>
      ))}
    </ul>
  )
}

/* ════════ 마이페이지 왼쪽 묶음의 스티키 위치 계산 ════════
   왼쪽 묶음(프로필 요약 + 업적·친구·공개 범위 + 우리 반)을 하나의 sticky로 둔다. top은 CSS 변수 --mypage-sticky-top으로만 넘기고,
   sticky 적용 여부(넓은 화면)는 MyPage.css가 정한다. 내부 스크롤바는 쓰지 않는다.
   · 묶음이 화면에 들어가면 상단바 아래(상단바 높이 + 16px)에 붙는다.
   · 묶음이 화면보다 길면, 스크롤한 만큼 함께 움직이다가 아래로 갈 때는 맨 아래가 보이는 곳, 위로 갈 때는 상단바 아래에서 멈춘다.
     그래서 내부 스크롤 없이도 묶음의 모든 부분이 한 번씩 화면을 지나간다.
   · 펼치기·접기로 높이가 바뀌어도 그 순간에는 위치를 옮기지 않는다(누른 버튼이 튀지 않음). 이후 스크롤하면 위 규칙대로 맞춰진다. */
const STICKY_GAP = 16
function useStickyTop(ref, ready) {
  useEffect(() => {
    const el = ref.current
    if (!ready || !el) return undefined
    let top = null
    let lastY = window.scrollY
    const bounds = () => {
      const navH = document.querySelector('.topnav')?.offsetHeight ?? 0
      const h = el.offsetHeight
      const padBottom = parseFloat(getComputedStyle(el).paddingBottom) || 0
      const preferred = navH + STICKY_GAP                       // 위로 갈 때 멈추는 곳
      const fitAll = window.innerHeight - h - STICKY_GAP        // 묶음 전체 + 아래 여백이 보이는 위치
      const fitContent = window.innerHeight - (h - padBottom)   // 마지막 내용까지 보이는 위치
      let min                                                  // 아래로 갈 때 멈추는 곳
      if (fitAll >= preferred) min = preferred
      else if (fitAll >= navH) min = fitAll
      else if (fitContent >= navH) min = navH
      else min = fitContent
      return { min, max: preferred }
    }
    const apply = () => {
      const next = `${Math.round(top)}px`
      if (el.style.getPropertyValue('--mypage-sticky-top') !== next) el.style.setProperty('--mypage-sticky-top', next)
    }
    const onScroll = () => {
      const { min, max } = bounds()
      const d = window.scrollY - lastY
      lastY = window.scrollY
      if (top === null) top = max
      if (d > 0) top = Math.max(top - d, Math.min(min, top))   // 아래로: 함께 올라가다 맨 아래가 보이면 멈춤
      else if (d < 0) top = Math.min(top - d, max)            // 위로: 함께 내려오다 상단바 아래에서 멈춤
      apply()
    }
    const onResize = () => {
      const { max } = bounds()
      top = top === null ? max : Math.min(top, max)            // 높이가 바뀌어도 그 자리 유지 (위로만 넘치지 않게)
      apply()
    }
    onResize()
    // 창 크기·확대 비율·펼치기/접기로 높이가 바뀌면 onResize, 스크롤하면 onScroll
    const ro = new ResizeObserver(onResize)
    ro.observe(el)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onScroll)
    }
  }, [ref, ready])
}

// 펼친 내용이 화면 밖이면 보이도록 페이지를 필요한 만큼만 스크롤한다. 누른 버튼(anchor)은 상단바 밑으로 숨기지 않는다.
function revealBelow(anchor, content) {
  if (!anchor || !content) return
  const navH = document.querySelector('.topnav')?.offsetHeight ?? 0
  const a = anchor.getBoundingClientRect()
  const c = content.getBoundingClientRect()
  const topLimit = navH + STICKY_GAP
  if (c.top < topLimit) {                                         // 내용이 상단바에 가려 있으면 위로
    window.scrollBy({ top: c.top - topLimit, behavior: 'smooth' })
    return
  }
  const needDown = c.bottom + STICKY_GAP - window.innerHeight   // 내용 아래쪽이 화면 밖이면 그만큼 아래로
  const canDown = a.top - topLimit                               // 단, 누른 버튼이 상단바 밑으로 들어가지 않을 만큼만
  const delta = Math.min(needDown, canDown)
  if (delta > 0) window.scrollBy({ top: delta, behavior: 'smooth' })
}

/* ── 조각: 접기·펼치기 카드 (실제 button + aria-expanded/aria-controls, 접힌 내용은 hidden이라 Tab 초점이 들어가지 않음) ──
   내용은 접혀도 지우지 않고 숨기기만 하므로 안의 상태가 초기화되지 않는다. 열고 닫기는 화면 상태일 뿐 저장 요청이 없다. */
function Fold({ id, title, summary, open, onToggle, contentRef, children }) {
  return (
    <section className="profile-card mypage-fold">
      <h3 className="mypage-fold-heading">
        <button type="button" className="mypage-fold-btn" aria-expanded={open} aria-controls={id} onClick={onToggle}>
          <span className="mypage-fold-title">{title}</span>
          {summary && <span className="section-badge">{summary}</span>}
          <ChevronDown size={18} className="mypage-fold-icon" aria-hidden="true" />
        </button>
      </h3>
      <div id={id} ref={contentRef} className="mypage-fold-body" hidden={!open}>
        {children}
      </div>
    </section>
  )
}

// 펼침 영역 ID (마이페이지에 하나뿐이라 고정, 다른 곳과 겹치지 않는 이름)
const FOLD_ID = {
  achievements: 'mypage-fold-achievements',
  friends: 'mypage-fold-friends',
  visibility: 'mypage-fold-visibility',
}

/* ════════ 마이페이지 왼쪽 묶음 ════════
   프로필 요약 카드 → 업적(접기) → 친구(접기) → 프로필 공개 범위(접기) → children(우리 반 카드)
   roleLabel: '학생' 등 / onEditAccount: 내 정보 창 / onEditSurvey: 관심사 수정 / onOpenShowroom: 코코 꾸미기로
   equippedItems: 화면이 들고 있는 착용 아이템 (꾸미기에서 바꾸면 아바타도 바로 바뀌도록). 없으면 프로필 값
   onOpenProfile: 친구 프로필 열기 */
export function MyProfileSide({ profile: p, roleLabel, equippedItems, onEditAccount, onEditSurvey, onOpenShowroom, onOpenProfile, children }) {
  const stackRef = useRef(null)
  useStickyTop(stackRef, !!p.me)
  const [open, setOpen] = useState({ achievements: false, friends: false, visibility: false })
  const achievementsBody = useRef(null)
  const friendsBody = useRef(null)
  const visibilityBody = useRef(null)
  const reveal = useRef(null)   // 방금 펼친 영역: { body, anchor } — 그려진 뒤 화면 밖이면 보이게

  const toggle = (key, body, anchor) => {
    const opening = !open[key]
    setOpen((o) => ({ ...o, [key]: !o[key] }))
    // 펼칠 때만 화면 확인. 접을 때는 화면을 옮기지 않는다
    reveal.current = opening ? { body, anchor } : null
  }

  useEffect(() => {
    const r = reveal.current
    if (!r) return undefined
    reveal.current = null
    const raf = requestAnimationFrame(() => revealBelow(r.anchor, r.body.current))
    return () => cancelAnimationFrame(raf)
  }, [open])

  // 프로필을 한 번도 못 받았으면: 불러오는 중이면 골격 카드, 실패면 안내와 다시 시도 (레벨·숫자를 기본값으로 채우지 않는다)
  // 불러오는 중·실패·성공 모두 같은 묶음 안 같은 key에 우리 반 카드(children)를 두어,
  // 프로필을 다시 받아 화면이 바뀌어도 우리 반 카드(입력 중인 코드 포함)를 새로 만들지 않는다
  if (!p.me) {
    return (
      <div className="mypage-side-stack">
        {p.loadError ? (
          <div className="profile-card">
            <div className="empty-msg" role="alert">
              프로필을 불러오지 못했어요: {p.loadError}{' '}
              <button type="button" className="link-btn" onClick={p.reload}>다시 시도</button>
            </div>
          </div>
        ) : (
          <div className="skeleton-card profile-skeleton" aria-hidden="true" />
        )}
        <Fragment key="side-extra">{children}</Fragment>
      </div>
    )
  }
  const { me } = p
  const visibilityLabel = VISIBILITY.find((v) => v.id === me.visibility)?.label ?? ''

  return (
    <div ref={stackRef} className="mypage-side-stack">
      {/* 다시 들어왔을 때 새로 불러오기에 실패했으면, 이전에 받은 값이라는 것을 알리고 다시 시도할 수 있게 */}
      {p.loadError && (
        <p className="dash-hint" role="alert">
          프로필을 새로 불러오지 못해 이전 정보를 보여주고 있어요.{' '}
          <button type="button" className="link-btn" onClick={p.reload}>다시 시도</button>
        </p>
      )}
      <section className="profile-card mypage-profile" aria-label="내 프로필">
        <div className="mypage-avatar">
          <CocoAvatar size={110} emotion="happy" items={equippedItems ?? me.equipped} />
          <button type="button" className="btn-icon mypage-avatar-edit" onClick={onOpenShowroom}
            title="코코 꾸미기" aria-label="코코 꾸미기로 이동"><Pencil size={16} aria-hidden="true" /></button>
        </div>
        <div className="mypage-identity">
          <b className="profile-name">{me.username}</b>
          {roleLabel && <span className="mypage-role">{roleLabel}</span>}
          <span className="section-badge">Lv.{me.level}</span>
        </div>
        <ProfileLevel me={me} showStep />
        <ProfileBio p={p} />
        <ProfileStats me={me} friendsToggle={{
          open: open.friends,
          controls: FOLD_ID.friends,
          onToggle: (e) => toggle('friends', friendsBody, e.currentTarget),
        }} />
        <div className="mypage-profile-actions">
          <button type="button" className="role-btn" onClick={onEditAccount}>프로필 수정</button>
          <button type="button" className="role-btn ghost" onClick={onOpenShowroom}>쇼룸 가기</button>
          <button type="button" className="role-btn ghost" onClick={onEditSurvey}>관심사·코딩 수준 수정</button>
        </div>
      </section>

      <Fold id={FOLD_ID.achievements} title="업적" summary={`${earnedCount(me)}/${me.allAchievements?.length ?? 0}`}
        open={open.achievements} onToggle={(e) => toggle('achievements', achievementsBody, e.currentTarget)}
        contentRef={achievementsBody}>
        <AchievementGrid me={me} showDesc />
      </Fold>

      <Fold id={FOLD_ID.friends} title="친구" summary={`${me.friends?.length ?? 0}명`}
        open={open.friends} onToggle={(e) => toggle('friends', friendsBody, e.currentTarget)}
        contentRef={friendsBody}>
        <div className="profile-friends">
          <p className="dash-hint">서로 팔로우하면 친구가 돼요</p>
          <FriendList p={p} onOpenProfile={onOpenProfile} />
        </div>
      </Fold>

      <Fold id={FOLD_ID.visibility} title="프로필 공개 범위" summary={visibilityLabel}
        open={open.visibility} onToggle={(e) => toggle('visibility', visibilityBody, e.currentTarget)}
        contentRef={visibilityBody}>
        <VisibilityField p={p} hideLegend />
      </Fold>

      <Fragment key="side-extra">{children}</Fragment>
    </div>
  )
}

/* ════════ 기존 한 장짜리 카드 (모양 그대로) ════════ */
export default function ProfileCard({ showToast, onOpenProfile }) {
  const p = useMyProfile(showToast)
  if (!p.me) return <div className="skeleton-card profile-skeleton" aria-hidden="true" />
  const { me } = p

  return (
    <section className="dash-section">
      <div className="section-header">
        <h3 className="section-title">내 프로필</h3>
        <span className="section-badge">Lv.{me.level}</span>
      </div>

      <div className="profile-card">
        <div className="profile-main">
          <CocoAvatar size={88} emotion="happy" items={me.equipped} />
          <div className="profile-info">
            <b className="profile-name">{me.username}</b>
            <ProfileBio p={p} />
            {/* 레벨 막대 */}
            <ProfileLevel me={me} />
            <ProfileStats me={me} />
          </div>
        </div>

        {/* 공개 범위 */}
        <VisibilityField p={p} />

        {/* 업적 */}
        <div className="profile-achievements">
          <h4>업적 <small>{earnedCount(me)}/{me.allAchievements?.length ?? 0}</small></h4>
          <AchievementGrid me={me} />
        </div>

        {/* 친구 */}
        <div className="profile-friends">
          <h4>친구 <small>서로 팔로우하면 친구가 돼요</small></h4>
          <FriendList p={p} onOpenProfile={onOpenProfile} />
        </div>
      </div>
    </section>
  )
}
