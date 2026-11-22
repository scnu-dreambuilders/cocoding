// 관리자 API 접근이 거절된 계정. 권한 부족·정지 여부는 오류 문장으로 추측하지 않는다.
export default function ForbiddenPage({ me, message, loggingOut, onLogout }) {
  return (
    <div className="center-page">
      <div className="card auth-card">
        <h1>관리자 화면에 접근할 수 없어요</h1>
        <p className="notice error" role="alert">{message || '이 계정은 관리자 화면을 쓸 수 없어요.'}</p>
        {me?.email && <p className="small"><b>{me.email}</b> 계정으로 로그인했어요.</p>}
        <p className="small">접근에 도움이 필요하면 운영 담당자에게 문의해 주세요.</p>
        <p className="small muted">운영자 권한 지정은 서버 관리자가 담당해요. 이 화면에서는 권한이나 계정 상태를 변경할 수 없어요.</p>
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={onLogout} disabled={loggingOut}>
            {loggingOut ? '로그아웃 중…' : '다른 계정으로 로그인'}
          </button>
        </div>
        <p className="small muted">로그아웃하면 이 계정을 쓰는 다른 기기와 학생 앱에서도 다시 로그인해야 해요.</p>
      </div>
    </div>
  )
}
