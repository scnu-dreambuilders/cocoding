import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { CocoAvatar } from './Coco'
import './Profile.css'

/* ════════════════════════════════════════════════
   친구 프로필 보기 — 닉네임·레벨·업적·공개 작품·팔로우
   이메일이나 태어난 해는 서버에서 아예 내려주지 않는다.
   ════════════════════════════════════════════════ */
export default function ProfileModal({ userId, onClose, onOpenProject, showToast }) {
  const [state, setState] = useState({ loading: true })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    api.profile(userId)
      .then((d) => { if (alive) setState({ profile: d }) })
      .catch((e) => { if (alive) setState({ error: e.message }) })
    return () => { alive = false }
  }, [userId])

  const toggleFollow = async () => {
    const p = state.profile
    setBusy(true)
    try {
      const res = p.isFollowing ? await api.unfollowUser(p.id) : await api.followUser(p.id)
      showToast?.(res.message)
      setState({ profile: await api.profile(userId) })
    } catch (e) {
      showToast?.(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal profile-modal" role="dialog" aria-modal="true" aria-label="친구 프로필" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>친구 프로필</h3>
          <button type="button" className="modal-x" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {state.loading && <p className="dash-hint">불러오는 중…</p>}
        {state.error && <p className="dash-hint" role="alert">{state.error}</p>}

        {state.profile && (
          <>
            <div className="profile-main">
              <CocoAvatar size={80} emotion="happy" items={state.profile.equipped} />
              <div className="profile-info">
                <b className="profile-name">{state.profile.username}</b>
                {state.profile.bio && <p className="profile-bio">{state.profile.bio}</p>}
                <div className="profile-stats">
                  <span>⭐ Lv.<b>{state.profile.level}</b></span>
                  <span>💜 <b>{state.profile.likesReceived > 99 ? '+99' : state.profile.likesReceived}</b></span>
                  <span>👥 <b>{state.profile.followers}</b></span>
                </div>
                {!state.profile.isMe && (
                  <button type="button" className={`role-btn ${state.profile.isFollowing ? 'ghost' : ''}`}
                    onClick={toggleFollow} disabled={busy}>
                    {state.profile.isFriend ? '🤝 친구 (팔로우 취소)' : state.profile.isFollowing ? '팔로우 취소' : '＋ 팔로우'}
                  </button>
                )}
              </div>
            </div>

            {state.profile.achievements.length > 0 && (
              <div className="profile-achievements">
                <h4>업적 <small>{state.profile.achievements.length}개</small></h4>
                <div className="achv-grid">
                  {state.profile.achievements.map((a) => (
                    <div key={a.code} className="achv on" title={a.desc}>
                      <span className="achv-emoji" aria-hidden="true">{a.emoji}</span>
                      <span className="achv-name">{a.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="profile-friends">
              <h4>공개한 작품 <small>{state.profile.projects?.length ?? 0}개</small></h4>
              {(state.profile.projects?.length ?? 0) === 0 ? (
                <p className="dash-hint">아직 공개한 작품이 없어요.</p>
              ) : (
                <ul className="friend-list">
                  {state.profile.projects.map((p) => (
                    <li key={p.id}>
                      <button type="button" className="friend-open" onClick={() => { onClose(); onOpenProject?.(p) }}>
                        <b>{p.title}</b>
                        <small>💜 {p.like_count ?? 0} · 🔁 {p.remake_count ?? 0}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
