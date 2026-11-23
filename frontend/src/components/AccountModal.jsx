import { useEffect, useId, useRef, useState } from 'react'
import { api } from '../api/client'
import { ROLE_LABEL, passwordError, usernameError } from '../lib/validators'
import './RolePanels.css'
import './AccountModal.css' // 공통 모달(index.css) 위에 이 창에만 필요한 것: 머리 고정·닫기 버튼 크기·좁은 화면 입력줄

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/* ════════════════════════════════════════════════
   내 정보 — 닉네임 · 비밀번호 바꾸기 · 회원 탈퇴
   ════════════════════════════════════════════════ */
const CONSENT_LABEL = { pending: '보호자 동의 대기', granted: '보호자 동의 완료' }

// onEditSurvey가 있으면 관심사·코딩 수준 수정도 이 창에서 연다 (마이페이지)
export default function AccountModal({ user, onClose, onUserChange, onDeleted, showToast, onEditSurvey }) {
  const [username, setUsername] = useState(user.username)
  const [affiliation, setAffiliation] = useState(user.affiliation ?? '')
  const [pw, setPw] = useState({ current: '', next: '' })
  const [delPw, setDelPw] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState({})
  const [busy, setBusy] = useState('')
  const titleId = useId()
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  // 열려 있는 동안: 배경 스크롤을 막고, 초점을 창 안으로 옮긴다.
  // 닫히면(해제되면) 스크롤 상태와 초점을 연 버튼으로 되돌린다. StrictMode 의 두 번 실행에도 원래 값으로 돌아간다
  useEffect(() => {
    const opener = document.activeElement
    const body = document.body
    const prevOverflow = body.style.overflow
    const prevPadding = body.style.paddingRight
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    body.style.overflow = 'hidden'
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px` // 스크롤바가 사라져 화면이 옆으로 밀리지 않게
    panelRef.current?.focus({ preventScroll: true })
    return () => {
      body.style.overflow = prevOverflow
      body.style.paddingRight = prevPadding
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus({ preventScroll: true })
    }
  }, [])

  // Esc 로 닫기, Tab·Shift+Tab 은 창 안에서만 돈다
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCloseRef.current()
      return
    }
    if (e.key !== 'Tab') return
    const panel = panelRef.current
    const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
    if (items.length === 0) { e.preventDefault(); panel.focus(); return }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (active === panel || !panel.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return }
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
  }

  const run = async (key, problem, fn) => {
    setError((e) => ({ ...e, [key]: problem }))
    if (problem) return
    setBusy(key)
    try {
      await fn()
    } catch (err) {
      setError((e) => ({ ...e, [key]: err.message }))
    } finally {
      setBusy('')
    }
  }

  const saveName = (e) => {
    e.preventDefault()
    run('name', username.trim() === user.username ? '지금 닉네임과 같아요' : usernameError(username), async () => {
      onUserChange(await api.changeUsername(username.trim()))
      showToast('닉네임을 바꿨어요')
    })
  }

  const saveAffiliation = (e) => {
    e.preventDefault()
    run('affiliation', '', async () => {
      onUserChange(await api.changeAffiliation(affiliation.trim()))
      showToast('소속을 바꿨어요')
    })
  }

  const savePassword = (e) => {
    e.preventDefault()
    run('pw', !pw.current ? '지금 비밀번호를 입력해주세요' : passwordError(pw.next), async () => {
      const res = await api.changePassword(pw.current, pw.next)
      localStorage.setItem('cocooding_token', res.token)
      onUserChange(res.user)
      setPw({ current: '', next: '' })
      showToast('비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해야 해요.')
    })
  }

  const remove = (e) => {
    e.preventDefault()
    run('del', delPw ? '' : '비밀번호를 입력해주세요', async () => {
      const res = await api.deleteAccount(delPw)
      window.alert(res.message)
      onDeleted()
    })
  }

  return (
    <div className="modal-backdrop">
      <div ref={panelRef} className="modal account-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}
        tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="modal-head account-head">
          <h3 id={titleId}>내 정보</h3>
          <button type="button" className="modal-x account-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <dl className="account-info">
          <div><dt>이메일</dt><dd>{user.email}</dd></div>
          <div><dt>계정 유형</dt><dd>{ROLE_LABEL[user.role] ?? '학생'}</dd></div>
          {CONSENT_LABEL[user.consent_status] && <div><dt>보호자 동의</dt><dd>{CONSENT_LABEL[user.consent_status]}</dd></div>}
        </dl>

        <form className="account-form" onSubmit={saveName}>
          <h4>닉네임 바꾸기</h4>
          <div className="account-row">
            <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={12} aria-label="새 닉네임" />
            <button type="submit" className="role-btn" disabled={busy === 'name'}>바꾸기</button>
          </div>
          {error.name && <p className="form-error" role="alert">{error.name}</p>}
        </form>

        {user.role === 'teacher' && (
          <form className="account-form" onSubmit={saveAffiliation}>
            <h4>소속 바꾸기</h4>
            <div className="account-row">
              <input value={affiliation} onChange={(e) => setAffiliation(e.target.value)} maxLength={50}
                placeholder="예: ○○초등학교 / ○○학원" aria-label="소속" />
              <button type="submit" className="role-btn" disabled={busy === 'affiliation'}>바꾸기</button>
            </div>
            {error.affiliation && <p className="form-error" role="alert">{error.affiliation}</p>}
          </form>
        )}

        {onEditSurvey && (
          <div className="account-form">
            <h4>관심사·코딩 수준</h4>
            <div className="account-row">
              <span className="account-note">추천 주제와 자유 창작에서 보이는 블록이 바뀌어요.</span>
              <button type="button" className="role-btn" onClick={() => { onClose(); onEditSurvey() }}>수정하기</button>
            </div>
          </div>
        )}

        <form className="account-form" onSubmit={savePassword}>
          <h4>비밀번호 바꾸기</h4>
          <input type="password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
            placeholder="지금 비밀번호" autoComplete="current-password" aria-label="지금 비밀번호" />
          <div className="account-row">
            <input type="password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
              placeholder="새 비밀번호 (영문+숫자 8자 이상)" autoComplete="new-password" aria-label="새 비밀번호" />
            <button type="submit" className="role-btn" disabled={busy === 'pw'}>바꾸기</button>
          </div>
          {error.pw && <p className="form-error" role="alert">{error.pw}</p>}
        </form>

        <div className="account-form account-danger">
          <h4>회원 탈퇴</h4>
          {!confirmDelete ? (
            <button type="button" className="role-btn ghost danger-text" onClick={() => setConfirmDelete(true)}>탈퇴하기…</button>
          ) : (
            <form onSubmit={remove}>
              <p>
                탈퇴하면 작품·챕터 기록·코코 아이템이 <b>모두 지워지고 되돌릴 수 없어요.</b>
                {user.role === 'teacher' && ' 만든 반도 함께 삭제돼요.'}
                {user.role === 'guardian' && ' 연결된 아이의 보호자 동의도 철회돼요.'}
              </p>
              <div className="account-row">
                <input type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} placeholder="비밀번호 확인"
                  autoComplete="current-password" aria-label="탈퇴 비밀번호 확인" />
                <button type="submit" className="role-btn danger" disabled={busy === 'del'}>탈퇴</button>
              </div>
              {error.del && <p className="form-error" role="alert">{error.del}</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
