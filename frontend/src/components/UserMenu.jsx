import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { CocoAvatar } from './Coco'
import TextSizeControl from './TextSizeControl'
import AccountModal from './AccountModal'
import { LEVEL_LABEL } from '../data/library'
import { ROLE_LABEL } from '../lib/validators'
import './UserMenu.css'

/* ════════════════════════════════════════════════
   UserMenu — 로그인한 사용자의 상단 오른쪽 영역 (글씨 크기·내 정보·설정·로그아웃)
   학생 홈의 오른쪽 영역과 같은 모양을 메인 홈에서도 쓰기 위한 컴포넌트.
   (학생 홈은 기존 코드를 그대로 쓰고, 여기서는 건드리지 않는다)
   ════════════════════════════════════════════════ */
export default function UserMenu({ user, onLogout, onUserChange, onAccountDeleted, onEditSurvey, showToast }) {
  const role = user.role ?? 'student'
  const isStudent = role === 'student'
  const [equipped, setEquipped] = useState([])
  const [accountOpen, setAccountOpen] = useState(false)

  // 학생이 꾸민 코코 아바타 (교사·보호자는 꾸미기 기능이 없음)
  useEffect(() => {
    if (!isStudent) return undefined
    let alive = true
    api.items()
      .then((list) => { if (alive) setEquipped(list.filter((i) => Number(i.equipped))) })
      .catch(() => {})
    return () => { alive = false }
  }, [isStudent])

  return (
    <>
      <div className="dash-header-right usermenu">
        <TextSizeControl />
        <div className="user-chip">
          <CocoAvatar size={28} items={equipped} />
          <span className="user-name">{user.username}</span>
          {isStudent
            ? user.level && <span className="user-level-tag">{LEVEL_LABEL[user.level] ?? user.level}</span>
            : <span className="user-level-tag">{ROLE_LABEL[role]}</span>}
        </div>
        <button type="button" className="btn-icon" onClick={() => setAccountOpen(true)} title="내 정보" aria-label="내 정보">👤</button>
        {isStudent && onEditSurvey && (
          <button type="button" className="btn-icon usermenu-settings" onClick={onEditSurvey} title="관심사·코딩 수준 수정" aria-label="관심사 수정">⚙️</button>
        )}
        <button type="button" className="btn-icon" onClick={onLogout} title="로그아웃" aria-label="로그아웃">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {accountOpen && (
        <AccountModal user={user} onClose={() => setAccountOpen(false)} onUserChange={onUserChange}
          onDeleted={onAccountDeleted} showToast={showToast} />
      )}
    </>
  )
}
