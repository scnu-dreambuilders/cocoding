// 여러 화면에서 같이 쓰는 작은 조각
export function ErrorState({ error, onRetry }) {
  if (!error) return null
  const connection = ['network', 'timeout', 'parse'].includes(error.kind)
  const title = connection ? '연결 상태를 확인해 주세요'
    : error.kind === 'server' ? `서버 오류 (${error.status})`
      : error.kind === 'forbidden' ? '이 작업은 할 수 없어요' : '불러오지 못했어요'
  return (
    <div className={`notice ${connection || error.kind === 'server' ? 'warn' : 'error'}`} role="alert">
      <p><b>{title}</b></p>
      <p>{error.message}</p>
      {onRetry && <p style={{ marginTop: 8 }}><button type="button" className="btn small" onClick={onRetry}>다시 불러오기</button></p>}
    </div>
  )
}

export function Pager({ page, hasMore, total, pageSize = 20, busy, onPage }) {
  const last = typeof total === 'number' ? Math.max(1, Math.ceil(total / pageSize)) : null
  if (page <= 1 && !hasMore) return null
  return (
    <nav className="pager" aria-label="쪽 넘기기">
      <button type="button" className="btn small" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>이전</button>
      <span className="num">{last ? `${page} / ${last} 쪽` : `${page}쪽`}</span>
      <button type="button" className="btn small" disabled={busy || !hasMore} onClick={() => onPage(page + 1)}>다음</button>
    </nav>
  )
}

export function UserBadges({ user }) {
  return (
    <>
      {user.is_admin && <span className="badge admin">운영자</span>}
      {user.suspended && <span className="badge suspended">정지</span>}
      {user.consent_status === 'pending' && <span className="badge pending">동의 대기</span>}
    </>
  )
}
