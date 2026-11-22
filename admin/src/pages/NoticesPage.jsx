import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, Pencil, Pin, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { api } from '../api/client.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { ErrorState, Pager } from '../components/ui.jsx'
import { dateTime } from '../lib/format.js'
import { buildHash, confirmLeave, go, rememberListPosition, restoreListPosition, setDirty } from '../lib/route.js'

/* 공지사항 — backend/api/admin/notices.php (요청서 6-1)
   #/notices?page=N   목록 (초안까지, 고정이 위)
   #/notices/new      새 공지
   #/notices/12       상세 · 고치기 · 지우기 */

// 서버 NOTICE_AUDIENCES 와 같은 값. 목록 응답의 audiences 가 오면 그 순서를 쓴다
const AUDIENCES = ['all', 'student', 'teacher', 'guardian']
const AUDIENCE_LABEL = { all: '전체', student: '학생', teacher: '교사', guardian: '보호자' }
const audienceText = (a) => AUDIENCE_LABEL[a] ?? a ?? '—'
const TITLE_MAX = 80
const BODY_MAX = 2000
// 서버는 mb_strlen 으로 센다 — 이모지 같은 글자도 한 글자로 세도록 코드 포인트로 센다
const charLen = (s) => [...String(s ?? '')].length
const FORM_KEY = 'notice-form'

// 화면을 옮긴 뒤 보여 줄 결과 문장 (서버 문장). 주소에 넣지 않고 메모리에만 잠깐 둔다
const flashes = new Map()

function NoticeBadges({ notice }) {
  return (
    <span className="btn-row" style={{ gap: 6 }}>
      {notice.published ? <span className="badge ok">게시</span> : <span className="badge draft">초안</span>}
      {notice.pinned && <span className="badge pinned"><Pin size={12} aria-hidden="true" />고정</span>}
      <span className="badge plain">대상: {audienceText(notice.audience)}</span>
    </span>
  )
}

/* ── 작성·수정 폼 ──
   publish: 누른 버튼이 '게시'인지 '초안'인지. 실패해도 입력은 그대로 둔다 */
function NoticeForm({ initial, mode, audiences, busy, error, onSubmit, onCancel }) {
  const id = useId()
  const [title, setTitle] = useState(initial.title)
  const [body, setBody] = useState(initial.body)
  const [audience, setAudience] = useState(initial.audience)
  const [pinned, setPinned] = useState(initial.pinned)
  const [tried, setTried] = useState(false)

  const dirty = title !== initial.title || body !== initial.body || audience !== initial.audience || pinned !== initial.pinned
  useEffect(() => { setDirty(FORM_KEY, dirty) }, [dirty])
  useEffect(() => () => setDirty(FORM_KEY, false), [])

  const titleLen = charLen(title.trim())
  const bodyLen = charLen(body.trim())
  const titleErr = titleLen === 0 ? '제목을 적어 주세요.' : titleLen > TITLE_MAX ? `제목은 ${TITLE_MAX}자까지 쓸 수 있어요.` : ''
  const bodyErr = bodyLen === 0 ? '내용을 적어 주세요.' : bodyLen > BODY_MAX ? `내용은 ${BODY_MAX}자까지 쓸 수 있어요.` : ''
  const valid = !titleErr && !bodyErr
  const showTitleErr = (tried || titleLen > TITLE_MAX) && titleErr
  const showBodyErr = (tried || bodyLen > BODY_MAX) && bodyErr

  const submit = (publish) => {
    setTried(true)
    if (busy || !valid) return
    onSubmit({ title: title.trim(), body: body.trim(), audience, pinned }, publish)
  }

  const wasPublished = mode === 'edit' && initial.published
  return (
    <form className="card notice-form" onSubmit={(e) => { e.preventDefault(); submit(mode === 'edit' ? initial.published : true) }} noValidate aria-busy={busy}>
      <label className="field">
        제목
        <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} maxLength={TITLE_MAX * 2}
          aria-invalid={!!showTitleErr} aria-describedby={`${id}-th`} autoComplete="off" />
        <span id={`${id}-th`} className={showTitleErr ? 'err' : 'hint'}>{showTitleErr || ''} <span className="num">{titleLen}/{TITLE_MAX}</span></span>
      </label>
      <label className="field">
        내용
        <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={busy} rows={8}
          aria-invalid={!!showBodyErr} aria-describedby={`${id}-bh`} />
        <span id={`${id}-bh`} className={showBodyErr ? 'err' : 'hint'}>{showBodyErr || '줄바꿈은 그대로 보여요.'} <span className="num">{bodyLen}/{BODY_MAX}</span></span>
      </label>
      <fieldset className="field audience" disabled={busy}>
        <legend>받는 사람</legend>
        <div className="btn-row">
          {audiences.map((a) => (
            <label key={a} className="radio">
              <input type="radio" name={`${id}-aud`} value={a} checked={audience === a} onChange={() => setAudience(a)} />
              {audienceText(a)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="check">
        <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} disabled={busy} />
        맨 위에 고정
      </label>
      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="btn-row">
        {wasPublished ? (
          <>
            <button type="button" className="btn primary" disabled={busy} onClick={() => submit(true)}>{busy ? '저장하는 중…' : '저장 (게시 유지)'}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => submit(false)}>초안으로 돌리고 저장</button>
          </>
        ) : (
          <>
            <button type="button" className="btn primary" disabled={busy} onClick={() => submit(true)}>{busy ? '저장하는 중…' : '올리기'}</button>
            <button type="button" className="btn" disabled={busy} onClick={() => submit(false)}>초안으로 저장</button>
          </>
        )}
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>취소</button>
      </div>
      <p className="small muted">초안은 운영자만 볼 수 있어요. 올리기를 누르면 선택한 대상에게 공개하는 상태로 저장돼요.</p>
    </form>
  )
}

// 게시 상태가 바뀌는 저장은 한 번 더 묻는다
function publishConfirm(fields, publish, wasPublished) {
  if (publish && !wasPublished) {
    return { title: '공지를 올릴까요?', confirmLabel: '올리기', body: <p><b>{audienceText(fields.audience)}</b> 대상에게 공개하는 상태로 저장해요.{fields.pinned ? ' 공개 목록에서 맨 위에 고정돼요.' : ''} 학생·교사·보호자 앱에서 공지를 보여 주는 화면은 아직 준비 중이에요.</p> }
  }
  if (!publish && wasPublished) {
    return { title: '초안으로 돌릴까요?', confirmLabel: '초안으로 돌리기', body: <p>공개를 멈추고 초안으로 저장해요. 운영자 화면에는 그대로 남아요.</p> }
  }
  return null
}

/* ── 새 공지 ── */
function NoticeCreate({ back, onForbidden }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState(null)
  const busyRef = useRef(false)
  const alive = useRef(true)
  const headRef = useRef(null)
  useEffect(() => {
    alive.current = true
    headRef.current?.focus()
    return () => { alive.current = false }
  }, [])
  const backHref = `#/notices${back ? `?${back}` : ''}`

  const save = async (fields, publish) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const res = await api.createNotice({ ...fields, published: publish })
      if (!alive.current) return
      const newId = res?.notice?.id
      setDirty(FORM_KEY, false)
      setDialog(null)
      if (Number.isInteger(newId)) {
        flashes.set(String(newId), res?.message ?? '저장했어요.')
        go(`/notices/${newId}`, { back })
      } else {
        // 저장은 됐지만 응답에서 새 공지 번호를 읽지 못함 — 목록으로 가서 확인하게 한다
        flashes.set('list', `${res?.message ?? '저장했어요.'} (새 공지 번호를 응답에서 읽지 못해 목록으로 왔어요.)`)
        go('/notices', Object.fromEntries(new URLSearchParams(back)))
      }
    } catch (err) {
      if (!alive.current) return
      setError(err.message)
      setDialog(null)
      if (err.kind === 'forbidden') onForbidden()
    } finally {
      busyRef.current = false
      if (alive.current) setBusy(false)
    }
  }

  const onSubmit = (fields, publish) => {
    const ask = publishConfirm(fields, publish, false)
    if (ask) setDialog({ ...ask, run: () => save(fields, publish) })
    else save(fields, publish)
  }

  return (
    <>
      <a className="btn small" href={backHref} style={{ alignSelf: 'flex-start' }}><ArrowLeft size={15} aria-hidden="true" /> 목록으로</a>
      <div className="page-head"><h1 ref={headRef} tabIndex={-1}>새 공지</h1></div>
      <NoticeForm mode="create" audiences={AUDIENCES} busy={busy} error={error}
        initial={{ title: '', body: '', audience: 'all', pinned: false, published: false }}
        onSubmit={onSubmit} onCancel={() => { if (confirmLeave()) go('/notices', Object.fromEntries(new URLSearchParams(back))) }} />
      {dialog && (
        <ConfirmDialog title={dialog.title} confirmLabel={dialog.confirmLabel} busy={busy} onCancel={() => { if (!busyRef.current) setDialog(null) }} onConfirm={dialog.run}>
          {dialog.body}
        </ConfirmDialog>
      )}
    </>
  )
}

/* ── 상세 · 고치기 · 지우기 ── */
function NoticeDetail({ id, back, onForbidden }) {
  const [state, setState] = useState({ loading: true, notice: null, error: null })
  const [flash, setFlash] = useState(() => (flashes.has(String(id)) ? { kind: 'ok', text: flashes.get(String(id)) } : null))
  const [editing, setEditing] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [formError, setFormError] = useState('')
  const [dialog, setDialog] = useState(null)
  const [dialogError, setDialogError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const alive = useRef(true)
  const seq = useRef(0)
  const headRef = useRef(null)
  const backHref = `#/notices${back ? `?${back}` : ''}`
  const backParams = () => Object.fromEntries(new URLSearchParams(back))

  useEffect(() => { flashes.delete(String(id)) }, [id])

  const load = useCallback(() => {
    const my = ++seq.current
    api.notice(id).then(
      (data) => {
        if (!alive.current || my !== seq.current) return
        if (!data?.notice) { setState({ loading: false, notice: null, error: Object.assign(new Error('공지 응답을 읽을 수 없어요.'), { kind: 'parse' }) }); return }
        setState({ loading: false, notice: data.notice, error: null })
      },
      (error) => {
        if (!alive.current || my !== seq.current) return
        setState((s) => ({ ...s, loading: false, error }))
        if (error.kind === 'forbidden') onForbidden()
      },
    )
  }, [id, onForbidden])
  // 다시 불러오기 (처음 불러오기는 state 의 loading: true 로 시작한다)
  const reload = () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    load()
  }

  useEffect(() => {
    alive.current = true
    load()
    return () => { alive.current = false; seq.current += 1 }
  }, [load])

  const { notice, loading, error } = state
  const loaded = !!notice
  useEffect(() => { if (loaded) headRef.current?.focus() }, [loaded, editing])

  // 쓰기(고치기·지우기) 시작 — 진행 중이던 조회는 버린다.
  // 저장보다 늦게 도착한 옛 조회 응답이 저장한 내용을 덮지 않게 하려는 것이다.
  // (조회 중에는 고치기·지우기 버튼을 막아 두므로, 여기서 버리는 조회는 고치는 동안 시작된 '다시 불러오기'뿐이다)
  const run = async (task, onFail) => {
    if (busyRef.current) return
    busyRef.current = true
    seq.current += 1
    setState((s) => (s.loading ? { ...s, loading: false } : s))
    setBusy(true)
    setDialogError('')
    setFormError('')
    try {
      await task()
    } catch (err) {
      if (!alive.current) return
      onFail(err.message)
      if (err.kind === 'forbidden') onForbidden()
    } finally {
      busyRef.current = false
      if (alive.current) setBusy(false)
    }
  }

  // 바뀐 항목만 보낸다 (PATCH)
  const save = (fields, publish) => run(async () => {
    const changes = {}
    if (fields.title !== notice.title) changes.title = fields.title
    if (fields.body !== notice.body) changes.body = fields.body
    if (fields.audience !== notice.audience) changes.audience = fields.audience
    if (fields.pinned !== notice.pinned) changes.pinned = fields.pinned
    if (publish !== notice.published) changes.published = publish
    if (!Object.keys(changes).length) {
      setDialog(null)
      setFormError('바뀐 내용이 없어요.')
      return
    }
    const res = await api.updateNotice(id, changes)
    if (!alive.current) return
    setDirty(FORM_KEY, false)
    if (res?.notice) setState({ loading: false, notice: res.notice, error: null })
    else reload()
    setFlash({ kind: 'ok', text: res?.message ?? '저장했어요.' })
    setDialog(null)
    setEditing(false)
  }, (msg) => { setFormError(msg); setDialog(null) })

  const onSubmit = (fields, publish) => {
    const ask = publishConfirm(fields, publish, notice.published)
    if (ask) setDialog({ ...ask, run: () => save(fields, publish) })
    else save(fields, publish)
  }

  const remove = () => run(async () => {
    const res = await api.deleteNotice(id)
    if (!alive.current) return
    setDirty(FORM_KEY, false)
    flashes.set('list', res?.message ?? '공지를 지웠어요.')
    go('/notices', backParams())
  }, (msg) => setDialogError(msg))

  if (!notice) {
    return (
      <>
        <a className="btn small" href={backHref} style={{ alignSelf: 'flex-start' }}><ArrowLeft size={15} aria-hidden="true" /> 목록으로</a>
        {loading && <div className="skeleton" aria-label="불러오는 중" />}
        <ErrorState error={error} onRetry={error?.status === 404 ? undefined : reload} />
      </>
    )
  }

  return (
    <>
      <div className="btn-row">
        <a className="btn small" href={backHref}><ArrowLeft size={15} aria-hidden="true" /> 목록으로</a>
        {!editing && <button type="button" className="btn small" onClick={reload} disabled={loading || busy}><RefreshCw size={14} aria-hidden="true" /> 새로고침</button>}
      </div>
      <div className="page-head">
        <div>
          <h1 ref={headRef} tabIndex={-1}>{editing ? '공지 고치기' : notice.title}</h1>
          <p>공지 번호 {notice.id} · 작성 {notice.author ?? '(알 수 없음)'} · {dateTime(notice.created_at)}{notice.updated_at && notice.updated_at !== notice.created_at ? ` · 고친 시각 ${dateTime(notice.updated_at)}` : ''}</p>
        </div>
      </div>
      {flash && <p className={`notice ${flash.kind}`} role="status">{flash.text}</p>}
      <ErrorState error={error} onRetry={reload} />

      {editing ? (
        <NoticeForm key={formKey} mode="edit" audiences={AUDIENCES} busy={busy} error={formError}
          initial={{ title: notice.title, body: notice.body, audience: notice.audience, pinned: !!notice.pinned, published: !!notice.published }}
          onSubmit={onSubmit}
          onCancel={() => { if (confirmLeave()) { setEditing(false); setFormError('') } }} />
      ) : (
        <section className="card" aria-label="공지 내용" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <NoticeBadges notice={notice} />
          <div className="post-body">{notice.body}</div>
          <div className="btn-row">
            <button type="button" className="btn" disabled={busy || loading} onClick={() => { setFlash(null); setFormError(''); setFormKey((k) => k + 1); setEditing(true) }}>
              <Pencil size={15} aria-hidden="true" /> 고치기
            </button>
            <button type="button" className="btn danger" disabled={busy || loading} onClick={() => { setDialogError(''); setDialog({ kind: 'delete' }) }}>
              <Trash2 size={15} aria-hidden="true" /> 지우기
            </button>
          </div>
          {notice.published && <p className="small muted">공개만 멈추려면 지우지 말고 '고치기 → 초안으로 돌리고 저장'을 쓰세요.</p>}
        </section>
      )}

      {dialog?.kind === 'delete' && (
        <ConfirmDialog title="이 공지를 지울까요?" confirmLabel="지우기" danger busy={busy} error={dialogError}
          onCancel={() => { if (!busyRef.current) setDialog(null) }} onConfirm={remove}>
          <p><b>{notice.title}</b></p>
          <p style={{ marginTop: 6 }}>지우면 되돌릴 수 없어요. 잠시 내리기만 하려면 초안으로 돌리세요.</p>
        </ConfirmDialog>
      )}
      {dialog && dialog.kind !== 'delete' && (
        <ConfirmDialog title={dialog.title} confirmLabel={dialog.confirmLabel} busy={busy}
          onCancel={() => { if (!busyRef.current) setDialog(null) }} onConfirm={dialog.run}>
          {dialog.body}
        </ConfirmDialog>
      )}
    </>
  )
}

/* ── 목록 ── */
function NoticeList({ params, onForbidden }) {
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [result, setResult] = useState({ key: '', data: null, error: null })
  const [reload, setReload] = useState(0)
  const [flash] = useState(() => flashes.get('list') ?? '')
  const seq = useRef(0)
  const key = `${page}|${reload}`

  useEffect(() => { flashes.delete('list') }, [])

  // 쪽을 빠르게 넘겨도 마지막 쪽의 응답만 남긴다
  useEffect(() => {
    const my = ++seq.current
    let cancelled = false
    api.notices({ page })
      .then((data) => { if (!cancelled && my === seq.current) setResult({ key, data, error: null }) })
      .catch((error) => {
        if (cancelled || my !== seq.current) return
        setResult({ key, data: null, error })
        if (error.kind === 'forbidden') onForbidden()
      })
    return () => { cancelled = true }
  }, [key, page, onForbidden])

  const fresh = result.key === key
  const sameView = result.key.startsWith(`${page}|`)
  const data = fresh || sameView ? result.data : null
  const error = fresh ? result.error : null
  const loading = !fresh
  const notices = Array.isArray(data?.notices) ? data.notices : []
  const listQuery = buildHash('', { page: page > 1 ? page : '' }).replace(/^#\??/, '')

  useEffect(() => {
    if (data) return restoreListPosition()
  }, [data])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>공지사항</h1>
          <p>초안까지 모두 보여요. 고정한 공지가 위에 와요.</p>
        </div>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => setReload((n) => n + 1)} disabled={loading}>
            <RefreshCw size={16} aria-hidden="true" /> {loading ? '불러오는 중…' : '새로고침'}
          </button>
          <a className="btn primary" href={buildHash('/notices/new', { back: listQuery })}><Plus size={16} aria-hidden="true" /> 새 공지</a>
        </div>
      </div>

      {flash && <p className="notice ok" role="status">{flash}</p>}
      <ErrorState error={error} onRetry={() => setReload((n) => n + 1)} />

      {data && notices.length === 0 && (
        <div className="card empty">{page > 1 ? '이 쪽에는 공지가 없어요.' : '아직 공지가 없어요.'}</div>
      )}

      {(notices.length > 0 || (loading && !data)) && (
        <div className="table-wrap" aria-busy={loading}>
          <table className="data">
            <caption className="sr-only">공지 목록</caption>
            <thead>
              <tr>
                <th scope="col">번호</th>
                <th scope="col">제목</th>
                <th scope="col">상태</th>
                <th scope="col">대상</th>
                <th scope="col">작성</th>
                <th scope="col">고친 시각</th>
              </tr>
            </thead>
            <tbody>
              {notices.map((n) => (
                <tr key={n.id} className={n.published ? '' : 'dim'}>
                  <td className="num">{n.id}</td>
                  <td className="wrap">
                    <a id={`notice-link-${n.id}`} href={buildHash(`/notices/${n.id}`, { back: listQuery })}
                      onClick={(e) => rememberListPosition(e, `notice-link-${n.id}`)}>
                      {n.pinned && <Pin size={13} aria-label="고정" style={{ marginRight: 4, verticalAlign: '-1px' }} />}
                      <b>{n.title}</b>
                    </a>
                  </td>
                  <td>{n.published ? <span className="badge ok">게시</span> : <span className="badge draft">초안</span>}</td>
                  <td>{audienceText(n.audience)}</td>
                  <td>{n.author ?? '—'}</td>
                  <td>{dateTime(n.updated_at ?? n.created_at)}</td>
                </tr>
              ))}
              {!data && <tr><td colSpan={6} className="empty">불러오는 중…</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {data && <Pager page={page} hasMore={!!data.hasMore} busy={loading} onPage={(p) => go('/notices', { page: p > 1 ? p : '' })} />}
    </>
  )
}

export default function NoticesPage({ id, params, onForbidden }) {
  const back = params.get('back') ?? ''
  if (id === 'new') return <NoticeCreate back={back} onForbidden={onForbidden} />
  if (id) return <NoticeDetail key={id} id={Number(id)} back={back} onForbidden={onForbidden} />
  return <NoticeList params={params} onForbidden={onForbidden} />
}
