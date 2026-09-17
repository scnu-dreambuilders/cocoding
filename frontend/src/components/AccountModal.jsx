import { useState } from 'react'
import { api } from '../api/client'
import { ROLE_LABEL, passwordError, usernameError } from '../lib/validators'
import './RolePanels.css'

/* ════════════════════════════════════════════════
   내 정보 — 닉네임 · 비밀번호 바꾸기 · 회원 탈퇴
   ════════════════════════════════════════════════ */
const CONSENT_LABEL = { pending: '보호자 동의 대기', granted: '보호자 동의 완료' }

export default function AccountModal({ user, onClose, onUserChange, onDeleted, showToast }) {
  const [username, setUsername] = useState(user.username)
  const [pw, setPw] = useState({ current: '', next: '' })
  const [delPw, setDelPw] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState({})
  const [busy, setBusy] = useState('')

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
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="내 정보">
      <div className="modal account-modal">
        <div className="modal-head">
          <h3>👤 내 정보</h3>
          <button type="button" className="modal-x" onClick={onClose} aria-label="닫기">×</button>
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
