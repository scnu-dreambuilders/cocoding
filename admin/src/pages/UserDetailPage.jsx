import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Copy, RefreshCw } from 'lucide-react'
import { api } from '../api/client.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { ErrorState, UserBadges } from '../components/ui.jsx'
import { CONSENT_LABEL, ROLE_LABEL, dateTime, levelText, num, roleText } from '../lib/format.js'
import { go, setDirty } from '../lib/route.js'

const REASON_MAX = 100
const DELTA_MAX = 1_000_000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DIRTY_KEYS = ['u-reason', 'u-email', 'u-delta', 'u-role']

// 정수만 받는다 (빈칸은 0). 형식이 틀리면 null
function parseDelta(s) {
  const t = String(s).trim()
  if (t === '' || t === '-' || t === '+') return 0
  const value = /^[+-]?\d{1,7}$/.test(t) ? Number(t) : NaN
  return Number.isInteger(value) && Math.abs(value) <= DELTA_MAX ? value : null
}
// 탈퇴할 때 함께 지워지는 것 — 요청서와 저장소 스키마(schema.sql 등)에 적힌 범위 기준.
// 실제 운영 DB와 같은지는 README '배포 전 확인'에 남겨 두었다
function DeleteNotice({ role }) {
  return (
    <ul className="reasons" style={{ marginTop: 6 }}>
      <li>이 회원의 작품·게시글·댓글·코인 기록·출석·학습 기록이 함께 지워지고, <b>되돌릴 수 없어요.</b></li>
      <li>이 회원의 게시글에 <b>다른 사람이 단 댓글도</b> 함께 지워져요.</li>
      {role === 'teacher' && <li>선생님 계정이라 <b>이 선생님이 만든 반과 과제</b>도 함께 지워져요. 반에 속한 학생 계정은 남아요.</li>}
      {role === 'guardian' && <li>보호자 계정이라 <b>연결된 자녀와의 연결</b>이 끊어져요. 자녀 계정은 남아요.</li>}
    </ul>
  )
}

const after = (now, delta) => Math.max(0, now + delta)
const signed = (n) => (n > 0 ? `+${num(n)}` : num(n))

export default function UserDetailPage({ id, me, back, onForbidden }) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [flash, setFlash] = useState(null) // 마지막 작업 결과 — 서버 문장을 그대로
  const [tempPass, setTempPass] = useState('') // 메모리에만. 저장소·기록에 남기지 않는다
  const [copied, setCopied] = useState(false)
  const [dialog, setDialog] = useState(null)
  const [dialogError, setDialogError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const alive = useRef(true)
  const seq = useRef(0)
  const headingRef = useRef(null)
  const focusedId = useRef(null)

  // 입력 칸 — 실패해도 지우지 않는다
  const [roleDraft, setRoleDraft] = useState('')
  const [reason, setReason] = useState('')
  const [email, setEmail] = useState('')
  const [coinsDelta, setCoinsDelta] = useState('')
  const [xpDelta, setXpDelta] = useState('')

  const load = useCallback(async () => {
    if (busyRef.current) return
    const my = ++seq.current
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await api.user(id)
      if (alive.current && my === seq.current) setState({ loading: false, data, error: null })
    } catch (error) {
      if (!alive.current || my !== seq.current) return
      setState((s) => ({ ...s, loading: false, error }))
      if (error.kind === 'forbidden') onForbidden()
    }
  }, [id, onForbidden])

  useEffect(() => {
    alive.current = true
    load()
    return () => {
      alive.current = false
      DIRTY_KEYS.forEach((k) => setDirty(k, false))
    }
  }, [load])

  // 떠나기 전 확인 대상
  useEffect(() => { setDirty('u-reason', reason.trim() !== '') }, [reason])
  useEffect(() => { setDirty('u-email', email.trim() !== '') }, [email])
  useEffect(() => { setDirty('u-delta', coinsDelta.trim() !== '' || xpDelta.trim() !== '') }, [coinsDelta, xpDelta])
  useEffect(() => { setDirty('u-role', roleDraft !== '') }, [roleDraft])

  const { data, loading, error } = state
  const user = data?.user
  const summary = data?.summary
  const isSelf = !!user && me?.id === user.id
  const backHref = `#/users${back ? `?${back}` : ''}`

  useEffect(() => {
    if (!user || focusedId.current === id) return
    focusedId.current = id
    headingRef.current?.focus({ preventScroll: true })
    headingRef.current?.scrollIntoView({ block: 'nearest' })
  }, [user, id])

  const openDialog = (d) => { setDialogError(''); setDialog(d) }
  const closeDialog = () => { if (!busyRef.current) setDialog(null) }

  // 바꾸기 공통: 중복 전송 막기 → PATCH → 응답의 최신 회원 정보로 화면 갱신
  const patch = async (changes, onDone, before) => {
    if (busyRef.current) return
    busyRef.current = true
    seq.current += 1 // 변경 전 시작한 조회는 변경 결과를 덮지 않는다.
    setState((s) => ({ ...s, loading: false }))
    setBusy(true)
    setDialogError('')
    try {
      if (before) {
        const stop = await before()
        if (stop) { if (alive.current) setDialogError(stop); return }
      }
      const res = await api.updateUser(id, changes)
      if (!alive.current) return
      if (res?.user) setState({ loading: false, data: { user: res.user, summary: res.summary ?? summary }, error: null })
      else {
        // 응답에 회원이 없으면 현재 변경 작업을 끝낸 뒤 별도로 재조회한다.
        const data = await api.user(id)
        if (alive.current) setState({ loading: false, data, error: null })
      }
      setFlash({ kind: 'ok', text: res?.message ?? '바꿨어요.' })
      if (res?.tempPassword) { setTempPass(res.tempPassword); setCopied(false) }
      setDialog(null)
      onDone?.()
    } catch (err) {
      if (!alive.current) return
      setDialogError(err.message)
      if (err.kind === 'forbidden') onForbidden()
    } finally {
      busyRef.current = false
      if (alive.current) setBusy(false)
    }
  }

  const remove = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setDialogError('')
    try {
      await api.deleteUser(id)
      if (!alive.current) return
      DIRTY_KEYS.forEach((k) => setDirty(k, false))
      go('/users', Object.fromEntries(new URLSearchParams(back)))
    } catch (err) {
      if (!alive.current) return
      setDialogError(err.message)
      if (err.kind === 'forbidden') onForbidden()
    } finally {
      busyRef.current = false
      if (alive.current) setBusy(false)
    }
  }

  // 운영자 권한 빼기 직전에 최신 운영자 수를 다시 본다 (최종 판단은 서버)
  const checkLastAdmin = async () => {
    const stats = await api.stats()
    if ((stats?.users?.admins ?? 0) <= 1) return '운영자가 한 명뿐이라 권한을 뺄 수 없어요. 다른 운영자를 먼저 지정해 주세요.'
    return null
  }

  const copyTemp = async () => {
    try { await navigator.clipboard.writeText(tempPass); setCopied(true) } catch { setCopied(false) }
  }

  if (!data) {
    return (
      <>
        <a className="btn small" href={backHref} style={{ alignSelf: 'flex-start' }}><ArrowLeft size={15} aria-hidden="true" /> 목록으로</a>
        {loading && <div className="skeleton" aria-label="불러오는 중" />}
        <ErrorState error={error} onRetry={error?.status === 404 ? undefined : load} />
      </>
    )
  }

  const reasonLen = reason.trim().length
  const reasonOk = reasonLen > 0 && reason.length <= REASON_MAX
  const emailTrim = email.trim().toLowerCase()
  const emailOk = EMAIL_RE.test(emailTrim) && emailTrim.length <= 100 && emailTrim !== user.email
  const cd = parseDelta(coinsDelta)
  const xd = parseDelta(xpDelta)
  const deltaOk = cd !== null && xd !== null && (cd !== 0 || xd !== 0)
  const roleOk = roleDraft !== '' && roleDraft !== user.role

  return (
    <>
      <div className="btn-row">
        <a className="btn small" href={backHref}><ArrowLeft size={15} aria-hidden="true" /> 목록으로</a>
        <button type="button" className="btn small" onClick={load} disabled={loading || busy}><RefreshCw size={14} aria-hidden="true" /> 새로고침</button>
      </div>

      <div className="page-head">
        <div>
          <h1 ref={headingRef} tabIndex={-1}>{user.username} <span className="btn-row" style={{ display: 'inline-flex', verticalAlign: 'middle' }}><UserBadges user={user} /></span></h1>
          <p>{roleText(user.role)} · 회원 번호 {user.id}{isSelf ? ' · 내 계정' : ''}</p>
        </div>
      </div>

      {flash && <p className={`notice ${flash.kind}`} role="status">{flash.text}</p>}
      <ErrorState error={error} onRetry={load} />

      {tempPass && (
        <section className="temp-pass" aria-labelledby="tp-t">
          <div style={{ flex: '1 1 16rem' }}>
            <h2 id="tp-t" style={{ fontSize: '1rem' }}>임시 비밀번호</h2>
            <p className="small">이 화면을 떠나면 다시 볼 수 없어요. 회원에게 직접 전해 주고, 로그인한 뒤 바로 바꾸도록 안내해 주세요.</p>
          </div>
          <code>{tempPass}</code>
          <div className="btn-row">
            <button type="button" className="btn small" onClick={copyTemp}><Copy size={14} aria-hidden="true" /> {copied ? '복사했어요' : '복사'}</button>
            <button type="button" className="btn small" onClick={() => setTempPass('')}>다 전했어요 (숨기기)</button>
          </div>
        </section>
      )}

      <div className="grid-2">
        <section className="card" aria-labelledby="u-info">
          <h2 id="u-info">회원 정보</h2>
          <dl className="kv">
            <dt>이메일</dt><dd>{user.email}</dd>
            <dt>계정 유형</dt><dd>{roleText(user.role)}</dd>
            <dt>코딩 경험(설문)</dt><dd>{levelText(user.level)}</dd>
            <dt>코인</dt><dd className="num">{num(user.coins)}</dd>
            <dt>경험치</dt><dd className="num">{num(user.xp)}</dd>
            <dt>보호자 동의</dt><dd>{CONSENT_LABEL[user.consent_status] ?? user.consent_status ?? '—'}</dd>
            {user.affiliation && <><dt>소속</dt><dd>{user.affiliation}</dd></>}
            {user.birth_year && <><dt>태어난 해</dt><dd>{user.birth_year}</dd></>}
            <dt>가입</dt><dd>{dateTime(user.created_at)}</dd>
            <dt>정보 수정</dt><dd>{dateTime(user.updated_at)}</dd>
            {user.suspended && <><dt>정지 사유</dt><dd>{user.suspended_reason || '(사유 없음)'}</dd></>}
          </dl>
        </section>
        <section className="card" aria-labelledby="u-sum">
          <h2 id="u-sum">활동 요약</h2>
          <dl className="kv">
            <dt>끝낸 챕터</dt><dd className="num">{num(summary?.chaptersDone)}</dd>
            <dt>작품</dt><dd className="num">{num(summary?.projects)} (공개 {num(summary?.publicProjects)} · 숨김 {num(summary?.hiddenProjects)})</dd>
            <dt>게시글</dt><dd className="num">{num(summary?.posts)} (숨김 {num(summary?.hiddenPosts)})</dd>
            <dt>댓글</dt><dd className="num">{num(summary?.comments)}</dd>
            <dt>받은 신고</dt><dd className="num">{num(summary?.reportsReceived)} <span className="muted small">(게시글 기준)</span></dd>
            <dt>한 신고</dt><dd className="num">{num(summary?.reportsMade)}</dd>
            <dt>받은 코인 합</dt><dd className="num">{num(summary?.coinsEarned)}</dd>
            <dt>쓴 코인 합</dt><dd className="num">{num(summary?.coinsSpent)}</dd>
          </dl>
        </section>
      </div>

      <h2 style={{ fontSize: '1.15rem' }}>관리</h2>
      <div className="actions">
        {/* 정지 / 해제 */}
        <section className="card action" aria-labelledby="a-susp">
          <h3 id="a-susp">{user.suspended ? '정지 풀기' : '계정 정지'}</h3>
          {user.suspended ? (
            <>
              <p>지금 정지된 계정이에요. 풀면 사유도 함께 지워져요.</p>
              <div className="btn-row">
                <button type="button" className="btn" disabled={busy} onClick={() => openDialog({
                  title: '정지를 풀까요?', confirmLabel: '정지 풀기',
                  body: <p>{user.username} 님이 서비스를 다시 이용할 수 있게 돼요.</p>,
                  run: () => patch({ suspended: false }),
                })}>정지 풀기</button>
              </div>
            </>
          ) : isSelf ? (
            <p className="muted">내 계정은 정지할 수 없어요.</p>
          ) : (
            <>
              <label className="field">
                정지 사유 (꼭 적어 주세요)
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={REASON_MAX} rows={3} aria-describedby="reason-hint" />
                <span id="reason-hint" className="hint">학생 화면에 그대로 보여요. 이름·연락처 같은 개인정보는 적지 마세요. <span className="num">{reason.length}/{REASON_MAX}</span></span>
              </label>
              <div className="btn-row">
                <button type="button" className="btn danger" disabled={busy || !reasonOk} onClick={() => openDialog({
                  title: '이 계정을 정지할까요?', confirmLabel: '정지하기', danger: true,
                  body: <><p>{user.username} 님의 현재 로그인은 무효화되고, 정지가 해제될 때까지 서비스 이용이 제한돼요.</p><p style={{ marginTop: 6 }}>학생에게 보일 사유: <b>{reason.trim()}</b></p></>,
                  run: () => patch({ suspended: true, suspended_reason: reason.trim() }, () => setReason('')),
                })}>정지하기</button>
              </div>
            </>
          )}
        </section>

        {/* 운영자 권한 */}
        <section className="card action" aria-labelledby="a-admin">
          <h3 id="a-admin">운영자 권한</h3>
          {user.is_admin ? (
            isSelf ? <p className="muted">내 운영자 권한은 뺄 수 없어요. 다른 운영자에게 부탁해 주세요.</p> : (
              <>
                <p>권한을 빼면 이 회원은 관리자 웹에 들어올 수 없고 로그아웃돼요. 마지막 운영자의 권한은 뺄 수 없어요.</p>
                <div className="btn-row">
                  <button type="button" className="btn danger" disabled={busy} onClick={() => openDialog({
                    title: '운영자 권한을 뺄까요?', confirmLabel: '권한 빼기', danger: true,
                    body: <p>{user.username} 님의 운영자 권한을 빼요. 빼기 전에 최신 운영자 수를 다시 확인해요.</p>,
                    run: () => patch({ is_admin: false }, null, checkLastAdmin),
                  })}>권한 빼기</button>
                </div>
              </>
            )
          ) : (
            <>
              <p>운영자가 되면 회원 정보와 신고 글을 보고 바꿀 수 있어요.</p>
              <div className="btn-row">
                <button type="button" className="btn" disabled={busy} onClick={() => openDialog({
                  title: '운영자 권한을 줄까요?', confirmLabel: '권한 주기',
                  body: <p>{user.username} ({user.email}) 님이 관리자 웹의 모든 기능을 쓸 수 있게 돼요.</p>,
                  run: () => patch({ is_admin: true }),
                })}>권한 주기</button>
              </div>
            </>
          )}
        </section>

        {/* 계정 유형 */}
        <section className="card action" aria-labelledby="a-role">
          <h3 id="a-role">계정 유형 바꾸기</h3>
          <label className="field">
            새 유형
            <select value={roleDraft} onChange={(e) => setRoleDraft(e.target.value)} disabled={busy}>
              <option value="">고르기 (지금: {roleText(user.role)})</option>
              {Object.entries(ROLE_LABEL).filter(([v]) => v !== user.role).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </label>
          <p className="small muted">바꾸면 이 회원은 다시 로그인해야 해요.{isSelf ? ' 내 계정이라 나도 로그아웃돼요.' : ''}</p>
          <div className="btn-row">
            <button type="button" className="btn" disabled={busy || !roleOk} onClick={() => openDialog({
              title: '계정 유형을 바꿀까요?', confirmLabel: '바꾸기',
              body: <p>{roleText(user.role)} → <b>{roleText(roleDraft)}</b></p>,
              run: () => patch({ role: roleDraft }, () => setRoleDraft('')),
            })}>바꾸기</button>
          </div>
        </section>

        {/* 이메일 */}
        <section className="card action" aria-labelledby="a-email">
          <h3 id="a-email">이메일 바꾸기</h3>
          <label className="field">
            새 이메일
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={100} autoComplete="off" disabled={busy} placeholder={user.email} />
            {email.trim() && !emailOk && <span className="err">{emailTrim === user.email ? '지금 이메일과 같아요.' : '이메일 형식을 확인해 주세요.'}</span>}
          </label>
          <p className="small muted">다른 회원이 쓰는 이메일이면 서버가 거절해요. 바꾸면 다시 로그인해야 해요.</p>
          <div className="btn-row">
            <button type="button" className="btn" disabled={busy || !emailOk} onClick={() => openDialog({
              title: '이메일을 바꿀까요?', confirmLabel: '바꾸기',
              body: <p>{user.email} → <b>{emailTrim}</b></p>,
              run: () => patch({ email: emailTrim }, () => setEmail('')),
            })}>바꾸기</button>
          </div>
        </section>

        {/* 코인·경험치 */}
        <section className="card action" aria-labelledby="a-delta">
          <h3 id="a-delta">코인·경험치 더하기·빼기</h3>
          <p className="small muted">지금 값에 더하거나 뺄 수를 적어요 (빼려면 -10). 0 밑으로는 내려가지 않고, 코인 변경은 기록에 남아요.</p>
          <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
            <label className="field">
              코인 (지금 {num(user.coins)})
              <input inputMode="numeric" value={coinsDelta} onChange={(e) => setCoinsDelta(e.target.value)} placeholder="예: 10, -10" disabled={busy} />
              {cd === null ? <span className="err">-1,000,000부터 1,000,000 사이의 정수로 적어 주세요.</span> : cd !== 0 && <span className="hint num">바뀐 뒤 {num(after(user.coins, cd))}</span>}
            </label>
            <label className="field">
              경험치 (지금 {num(user.xp)})
              <input inputMode="numeric" value={xpDelta} onChange={(e) => setXpDelta(e.target.value)} placeholder="예: 50" disabled={busy} />
              {xd === null ? <span className="err">-1,000,000부터 1,000,000 사이의 정수로 적어 주세요.</span> : xd !== 0 && <span className="hint num">바뀐 뒤 {num(after(user.xp, xd))}</span>}
            </label>
          </div>
          <div className="btn-row">
            <button type="button" className="btn" disabled={busy || !deltaOk} onClick={() => {
              const changes = {}
              if (cd) changes.coins_delta = cd
              if (xd) changes.xp_delta = xd
              openDialog({
                title: '코인·경험치를 바꿀까요?', confirmLabel: '적용하기',
                body: (
                  <ul className="reasons">
                    {cd !== 0 && <li>코인 {signed(cd)}: {num(user.coins)} → {num(after(user.coins, cd))}</li>}
                    {xd !== 0 && <li>경험치 {signed(xd)}: {num(user.xp)} → {num(after(user.xp, xd))}</li>}
                  </ul>
                ),
                run: () => patch(changes, () => { setCoinsDelta(''); setXpDelta('') }),
              })
            }}>적용하기</button>
          </div>
        </section>

        {/* 로그인 관련 */}
        <section className="card action" aria-labelledby="a-login">
          <h3 id="a-login">로그인 돕기</h3>
          {user.consent_status === 'pending' && (
            <>
              <p>보호자 동의를 기다리는 계정이에요. 보호자와 직접 확인했다면 대신 승인할 수 있어요.</p>
              <div className="btn-row">
                <button type="button" className="btn" disabled={busy} onClick={() => openDialog({
                  title: '보호자 동의를 대신 승인할까요?', confirmLabel: '승인하기',
                  body: <p>보호자에게 직접 동의를 받았을 때만 승인해 주세요. 승인 기록이 남아요.</p>,
                  run: () => patch({ consent: 'granted' }),
                })}>보호자 동의 승인</button>
              </div>
            </>
          )}
          <p>비밀번호를 잊었을 때 임시 비밀번호를 만들어 줄 수 있어요. 만들면 이 회원은 로그아웃돼요.</p>
          <div className="btn-row">
            <button type="button" className="btn" disabled={busy} onClick={() => openDialog({
              title: '임시 비밀번호를 만들까요?', confirmLabel: '만들기',
              body: <p>지금 비밀번호는 더 쓸 수 없게 되고, 새 임시 비밀번호는 이 화면에 한 번만 보여요.</p>,
              run: () => patch({ reset_password: true }),
            })}>임시 비밀번호 만들기</button>
            <button type="button" className="btn" disabled={busy} onClick={() => openDialog({
              title: '모든 기기에서 로그아웃시킬까요?', confirmLabel: '로그아웃시키기',
              body: <p>{user.username} 님이 로그인한 모든 곳에서 로그아웃돼요.{isSelf ? ' 내 계정이라 나도 로그아웃돼요.' : ''}</p>,
              run: () => patch({ force_logout: true }),
            })}>강제 로그아웃</button>
          </div>
        </section>

        {/* 탈퇴 */}
        <section className="card action" aria-labelledby="a-del">
          <h3 id="a-del">탈퇴 처리</h3>
          {isSelf ? <p className="muted">내 계정은 여기서 지울 수 없어요.</p>
            : user.is_admin ? <p className="muted">운영자 권한을 먼저 빼야 지울 수 있어요.</p>
              : (
                <>
                  <DeleteNotice role={user.role} />
                  <div className="btn-row">
                    <button type="button" className="btn danger" disabled={busy} onClick={() => openDialog({
                      title: '이 회원을 탈퇴 처리할까요?', confirmLabel: '탈퇴 처리', danger: true, typed: user.username,
                      body: <><p><b>{user.username}</b> ({user.email}) 님의 계정을 지워요.</p><DeleteNotice role={user.role} /></>,
                      run: remove,
                    })}>탈퇴 처리</button>
                  </div>
                </>
              )}
        </section>
      </div>

      {dialog && (
        <ConfirmDialog
          title={dialog.title} confirmLabel={dialog.confirmLabel} danger={dialog.danger} typed={dialog.typed}
          busy={busy} error={dialogError} onCancel={closeDialog} onConfirm={dialog.run}
        >
          {dialog.body}
        </ConfirmDialog>
      )}
    </>
  )
}
