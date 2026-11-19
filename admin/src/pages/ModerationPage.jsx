import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { api } from '../api/client.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { ErrorState, Pager } from '../components/ui.jsx'
import { dateOnly, dateTime, num } from '../lib/format.js'
import { buildHash, go, rememberListPosition, restoreListPosition } from '../lib/route.js'

const TARGETS = [['post', '게시글'], ['project', '작품']]
const KIND_LABEL = { discussion: '토론', question: '질문' }

// 무대 캡처는 data:image 나 http(s) 주소일 때만 그린다 (상대 경로는 이 앱 주소로 잘못 풀릴 수 있다)
const safeImage = (url) => (typeof url === 'string' && /^(data:image\/|https?:\/\/)/.test(url) ? url : null)

function ReportCount({ reports, hideCount }) {
  const near = typeof hideCount === 'number' && hideCount > 0
  return (
    <span className="btn-row" style={{ justifyContent: 'flex-end', gap: 6 }}>
      <span className="num">{num(reports)}</span>
      {near && reports >= hideCount && <span className="badge near">기준 {hideCount}건 도달</span>}
      {near && reports === hideCount - 1 && <span className="badge plain">기준까지 1건</span>}
    </span>
  )
}

function Detail({ target, id, onClose, onChanged, onForbidden }) {
  const [state, setState] = useState({ key: '', data: null, error: null })
  const [reload, setReload] = useState(0)
  const [dialog, setDialog] = useState(null)
  const [busy, setBusy] = useState(false)
  const [dialogError, setDialogError] = useState('')
  const [flash, setFlash] = useState('')
  const busyRef = useRef(false)
  const headRef = useRef(null)
  const seq = useRef(0)
  const alive = useRef(true)
  const key = `${target}|${id}`

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  useEffect(() => {
    const my = ++seq.current
    let cancelled = false
    api.reportedDetail(target, id)
      .then((data) => { if (!cancelled && my === seq.current) setState({ key, data, error: null }) })
      .catch((error) => {
        if (cancelled || my !== seq.current) return
        setState({ key, data: null, error })
        if (error.kind === 'forbidden') onForbidden()
      })
    return () => { cancelled = true }
  }, [key, target, id, reload, onForbidden])

  // 상세를 열면 제목으로 초점을 옮긴다 (좁은 화면에서는 목록 아래에 열린다)
  useEffect(() => { headRef.current?.focus() }, [key])

  const loading = state.key !== key
  const data = loading ? null : state.data
  const error = loading ? null : state.error
  const item = data?.post ?? data?.project
  const hidden = !!item?.hidden

  const toggle = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setDialogError('')
    try {
      const res = await api.setHidden(target, id, !hidden)
      if (!alive.current) return
      setFlash(res?.message ?? '')
      setDialog(null)
      setReload((n) => n + 1)
      onChanged()
    } catch (err) {
      if (!alive.current) return
      setDialogError(err.message)
      if (err.kind === 'forbidden') onForbidden()
    } finally {
      busyRef.current = false
      if (alive.current) setBusy(false)
    }
  }

  const img = safeImage(data?.project?.thumbnail_url)

  return (
    <section className="card" aria-labelledby="mod-detail-t" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="btn-row" style={{ justifyContent: 'space-between' }}>
        <h2 id="mod-detail-t" ref={headRef} tabIndex={-1} style={{ fontSize: '1.05rem' }}>
          {target === 'post' ? '게시글' : '작품'} #{id} 상세
        </h2>
        <button type="button" className="btn small" onClick={onClose} aria-label="상세 닫기"><X size={15} aria-hidden="true" /></button>
      </div>

      {loading && <div className="skeleton" style={{ height: 120 }} aria-label="불러오는 중" />}
      <ErrorState error={error} onRetry={error?.status === 404 ? undefined : () => setReload((n) => n + 1)} />
      {flash && <p className="notice ok" role="status">{flash}</p>}

      {item && (
        <>
          <div>
            <p className="btn-row" style={{ gap: 6 }}>
              <b style={{ color: 'var(--text-h)' }}>{item.title || '(제목 없음)'}</b>
              {hidden ? <span className="badge hidden">숨김</span> : <span className="badge plain">보이는 중</span>}
              {data.post && <span className="badge plain">{KIND_LABEL[item.kind] ?? item.kind}</span>}
              {data.project && <span className="badge plain">{item.is_public ? '공개 작품' : '비공개 작품'}</span>}
            </p>
            <p className="small muted" style={{ marginTop: 4 }}>
              <a href={`#/users/${item.user_id}`}>{item.username}</a> · {dateTime(item.created_at)}
            </p>
          </div>

          {data.post && <div className="post-body">{item.body}</div>}
          {data.project && (img
            ? <img src={img} alt={`${item.title} 무대 캡처`} style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid var(--border)' }} />
            : <p className="small muted">무대 캡처가 없거나 이 화면에서 열 수 없는 주소예요. 블록 코드는 이 화면에 오지 않아요.</p>)}

          <div>
            <h3 style={{ fontSize: '0.9375rem', marginBottom: 6 }}>신고 이유 {num(data.reasons?.length ?? 0)}건</h3>
            {data.reasons?.length ? (
              <ul className="reasons">
                {data.reasons.map((r, i) => <li key={i}>{r.reason || '(이유 없음)'} <span className="muted">· {dateTime(r.created_at)}</span></li>)}
              </ul>
            ) : <p className="small muted">신고 기록이 없어요. (운영자가 직접 숨긴 글일 수 있어요)</p>}
          </div>

          {data.comments && (
            <div>
              <h3 style={{ fontSize: '0.9375rem', marginBottom: 6 }}>댓글 {num(data.comments.length)}개</h3>
              {data.comments.length ? (
                <ul className="reasons">
                  {data.comments.map((c) => <li key={c.id}><b>{c.username}</b>: {c.body} <span className="muted">· {dateTime(c.created_at)}</span></li>)}
                </ul>
              ) : <p className="small muted">댓글이 없어요.</p>}
            </div>
          )}

          <div className="btn-row">
            <button type="button" className={`btn ${hidden ? 'primary' : 'danger'}`} disabled={busy} onClick={() => { setDialogError(''); setDialog(true) }}>
              {hidden ? '신고 숨김 해제' : '숨기기'}
            </button>
          </div>
          <p className="small muted">삭제하지 않고 신고 숨김 상태만 바꿔요. 숨김을 해제해도 신고 기록은 남아요.{data.project && ' 작품의 기존 공개 범위는 유지되며, 비공개 작품을 공개로 바꾸는 기능은 아니에요.'}</p>
        </>
      )}

      {dialog && item && (
        <ConfirmDialog
          title={hidden ? '신고 숨김을 해제할까요?' : '숨길까요?'}
          confirmLabel={hidden ? '신고 숨김 해제' : '숨기기'} danger={!hidden}
          busy={busy} error={dialogError} onCancel={() => { if (!busyRef.current) setDialog(null) }} onConfirm={toggle}
        >
          <p><b>{item.title || '(제목 없음)'}</b></p>
          <p style={{ marginTop: 6 }}>
            {hidden
              ? `${data.project ? '작품의 신고 숨김만 해제해요. 기존 공개 범위는 유지되며 비공개 작품은 공개되지 않아요.' : '게시글의 신고 숨김을 해제해요.'} 신고 기록은 남고, 새 신고에 따라 다시 숨겨질 수 있어요.`
              : '작성자 말고는 볼 수 없게 돼요. 나중에 다시 보이게 할 수 있어요.'}
          </p>
        </ConfirmDialog>
      )}
    </section>
  )
}

export default function ModerationPage({ params, onForbidden }) {
  const target = params.get('target') === 'project' ? 'project' : 'post'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const id = Number(params.get('id')) || 0

  const [result, setResult] = useState({ key: '', data: null, error: null })
  const [reload, setReload] = useState(0)
  const seq = useRef(0)
  const key = `${target}|${page}|${reload}`

  // 탭·쪽을 빠르게 바꿔도 마지막 조건의 응답만 남긴다
  useEffect(() => {
    const my = ++seq.current
    let cancelled = false
    api.reported({ target, page })
      .then((data) => { if (!cancelled && my === seq.current) setResult({ key, data, error: null }) })
      .catch((error) => {
        if (cancelled || my !== seq.current) return
        setResult({ key, data: null, error })
        if (error.kind === 'forbidden') onForbidden()
      })
    return () => { cancelled = true }
  }, [key, target, page, onForbidden])

  const fresh = result.key === key
  // 새로고침 중에는 앞 목록을 그대로 두고(같은 탭·쪽일 때), 탭이 바뀌면 비운다
  const sameView = result.key.startsWith(`${target}|${page}|`)
  const data = fresh || sameView ? result.data : null
  const error = fresh ? result.error : null
  const loading = !fresh
  const items = data?.items ?? []
  const hideCount = data?.hideCount

  useEffect(() => {
    if (data && !id) return restoreListPosition()
  }, [data, id])

  const set = (patch) => go('/moderation', { target, page: page > 1 ? page : '', id: id || '', ...patch })

  return (
    <>
      <div className="page-head">
        <div>
          <h1>신고 관리</h1>
          <p>신고가 들어왔거나 숨겨진 것만 보여요. 신고 많은 순서예요.</p>
        </div>
        <button type="button" className="btn" onClick={() => setReload((n) => n + 1)} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" /> {loading ? '불러오는 중…' : '새로고침'}
        </button>
      </div>

      <div className="toolbar">
        <div className="tabs" role="group" aria-label="대상">
          {TARGETS.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={target === v} onClick={() => go('/moderation', { target: v })}>{label}</button>
          ))}
        </div>
        {typeof hideCount === 'number' && <p className="small muted">신고 {hideCount}건이 쌓이면 서비스가 자동으로 숨겨요.</p>}
      </div>

      <ErrorState error={error} onRetry={() => setReload((n) => n + 1)} />

      <div className={id ? 'split' : ''}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {data && items.length === 0 && <div className="card empty">{target === 'post' ? '신고되거나 숨긴 게시글이 없어요.' : '신고되거나 숨긴 작품이 없어요.'}</div>}
          {(items.length > 0 || (loading && !data)) && (
            <div className="table-wrap" aria-busy={loading}>
              <table className="data">
                <caption className="sr-only">{target === 'post' ? '신고된 게시글' : '신고된 작품'}</caption>
                <thead>
                  <tr>
                    <th scope="col">번호</th>
                    <th scope="col">제목</th>
                    <th scope="col">{target === 'post' ? '종류' : '공개'}</th>
                    <th scope="col">작성자</th>
                    <th scope="col" className="num">신고</th>
                    <th scope="col">상태</th>
                    <th scope="col">작성일</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} aria-current={it.id === id ? 'true' : undefined}>
                      <td className="num">{it.id}</td>
                      <td className="wrap"><a id={`report-link-${target}-${it.id}`}
                        href={buildHash('/moderation', { target, page: page > 1 ? page : '', id: it.id })}
                        onClick={(e) => rememberListPosition(e, `report-link-${target}-${it.id}`)}><b>{it.title || '(제목 없음)'}</b></a></td>
                      <td>{target === 'post' ? (KIND_LABEL[it.kind] ?? it.kind) : (it.is_public ? '공개' : '비공개')}</td>
                      <td>{it.username}</td>
                      <td className="num"><ReportCount reports={it.reports} hideCount={hideCount} /></td>
                      <td>{it.hidden ? <span className="badge hidden">숨김</span> : <span className="badge plain">보이는 중</span>}</td>
                      <td>{dateOnly(it.created_at)}</td>
                    </tr>
                  ))}
                  {!data && <tr><td colSpan={7} className="empty">불러오는 중…</td></tr>}
                </tbody>
              </table>
            </div>
          )}
          {data && <Pager page={page} hasMore={data.hasMore} busy={loading} onPage={(p) => go('/moderation', { target, page: p })} />}
        </div>

        {id > 0 && (
          <Detail
            key={`${target}-${id}`} target={target} id={id}
            onClose={() => set({ id: '' })}
            onChanged={() => setReload((n) => n + 1)}
            onForbidden={onForbidden}
          />
        )}
      </div>
    </>
  )
}
