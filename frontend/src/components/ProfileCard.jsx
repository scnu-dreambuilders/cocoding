import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import { CocoAvatar } from './Coco'
import './Profile.css'

/* ════════════════════════════════════════════════
   내 프로필 — 레벨·경험치·업적·친구·소개말·공개 범위
   (기능정의서 STU-017~028, 요구사항 SFR-STU-003)
   ════════════════════════════════════════════════ */
const VISIBILITY = [
  { id: 'public', label: '전체 공개', desc: '코코딩 친구 누구나 볼 수 있어요' },
  { id: 'friends', label: '친구 공개', desc: '서로 팔로우한 친구만 볼 수 있어요' },
  { id: 'private', label: '비공개', desc: '나만 볼 수 있어요' },
]

// 받은 좋아요는 99를 넘으면 +99로 (요구사항 24번)
const likeLabel = (n) => (n > 99 ? '+99' : String(n))

export default function ProfileCard({ showToast, onOpenProfile }) {
  const [me, setMe] = useState(null)
  const [bio, setBio] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  const apply = useCallback((data) => {
    setMe(data)
    setBio(data.bio ?? '')
  }, [])

  useEffect(() => {
    let alive = true
    api.profile()
      .then((d) => { if (alive) apply(d) })
      .catch(() => {})
    return () => { alive = false }
  }, [apply])

  const saveBio = async () => {
    setBusy(true)
    try {
      apply(await api.updateProfile({ bio }))
      setEditing(false)
      showToast('소개말을 저장했어요')
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy(false)
    }
  }

  const setVisibility = async (v) => {
    try {
      apply(await api.updateProfile({ profile_visibility: v }))
      showToast(`프로필을 ${VISIBILITY.find((x) => x.id === v).label}로 바꿨어요`)
    } catch (e) {
      showToast(e.message)
    }
  }

  const unfollow = async (friend) => {
    try {
      await api.unfollowUser(friend.id)
      apply(await api.profile())
    } catch (e) {
      showToast(e.message)
    }
  }

  if (!me) return <div className="skeleton-card profile-skeleton" aria-hidden="true" />

  const earned = me.allAchievements?.filter((a) => a.earned) ?? []
  const locked = me.allAchievements?.filter((a) => !a.earned) ?? []

  return (
    <section className="dash-section">
      <div className="section-header">
        <h3 className="section-title"><span aria-hidden="true">🏅</span>내 프로필</h3>
        <span className="section-badge">Lv.{me.level}</span>
      </div>

      <div className="profile-card">
        <div className="profile-main">
          <CocoAvatar size={88} emotion="happy" items={me.equipped} />
          <div className="profile-info">
            <b className="profile-name">{me.username}</b>

            {editing ? (
              <div className="profile-bio-edit">
                <input value={bio} onChange={(e) => setBio(e.target.value)} maxLength={50}
                  placeholder="나를 소개하는 한 줄 (50자, 전화번호·이메일은 쓸 수 없어요)" aria-label="소개말" />
                <button type="button" className="role-btn" onClick={saveBio} disabled={busy}>저장</button>
                <button type="button" className="role-btn ghost" onClick={() => { setBio(me.bio ?? ''); setEditing(false) }}>취소</button>
              </div>
            ) : (
              <p className="profile-bio">
                {me.bio || <span className="profile-bio-empty">아직 소개말이 없어요</span>}
                <button type="button" className="profile-edit" onClick={() => setEditing(true)}>수정</button>
              </p>
            )}

            {/* 레벨 막대 */}
            <div className="profile-level">
              <div className="profile-level-bar">
                <span style={{ width: `${Math.round((me.intoLevel / me.levelStep) * 100)}%` }} />
              </div>
              <small>
                경험치 {me.xp}
                {me.isMax ? ' · 최고 레벨!' : ` · 다음 레벨까지 ${me.toNext}`}
              </small>
            </div>

            <div className="profile-stats">
              <span>💜 받은 좋아요 <b>{likeLabel(me.likesReceived)}</b></span>
              <span>👥 팔로워 <b>{me.followers}</b></span>
              <span>🤝 친구 <b>{me.friends?.length ?? 0}</b></span>
            </div>
          </div>
        </div>

        {/* 공개 범위 */}
        <fieldset className="profile-visibility">
          <legend>프로필 공개 범위</legend>
          {VISIBILITY.map((v) => (
            <label key={v.id} className={`profile-vis ${me.visibility === v.id ? 'on' : ''}`} title={v.desc}>
              <input type="radio" name="visibility" checked={me.visibility === v.id} onChange={() => setVisibility(v.id)} />
              <span>{v.label}{me.visibility === v.id && <small>{v.desc}</small>}</span>
            </label>
          ))}
        </fieldset>

        {/* 업적 */}
        <div className="profile-achievements">
          <h4>업적 <small>{earned.length}/{me.allAchievements?.length ?? 0}</small></h4>
          <div className="achv-grid">
            {[...earned, ...locked].map((a) => (
              <div key={a.code} className={`achv ${a.earned ? 'on' : ''}`} title={a.earned ? a.desc : `${a.desc} (아직 못 받았어요)`}>
                <span className="achv-emoji" aria-hidden="true">{a.earned ? a.emoji : '🔒'}</span>
                <span className="achv-name">{a.name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 친구 */}
        <div className="profile-friends">
          <h4>친구 <small>서로 팔로우하면 친구가 돼요</small></h4>
          {(me.friends?.length ?? 0) === 0 && (me.followingOnly?.length ?? 0) === 0 ? (
            <p className="dash-hint">친구 작품에서 마음에 드는 작품을 만든 친구를 팔로우해보세요.</p>
          ) : (
            <ul className="friend-list">
              {me.friends.map((f) => (
                <li key={f.id}>
                  <button type="button" className="friend-open" onClick={() => onOpenProfile?.(f.id)}>
                    <b>{f.username}</b>
                    {f.bio && <small>{f.bio}</small>}
                  </button>
                  <span className="friend-tag">🤝 친구</span>
                  <button type="button" className="row-remove" onClick={() => unfollow(f)} title="팔로우 취소" aria-label={`${f.username} 팔로우 취소`}>×</button>
                </li>
              ))}
              {me.followingOnly.map((f) => (
                <li key={f.id}>
                  <button type="button" className="friend-open" onClick={() => onOpenProfile?.(f.id)}>
                    <b>{f.username}</b>
                  </button>
                  <span className="friend-tag pending">팔로우 중</span>
                  <button type="button" className="row-remove" onClick={() => unfollow(f)} title="팔로우 취소" aria-label={`${f.username} 팔로우 취소`}>×</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
