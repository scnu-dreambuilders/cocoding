// 표·카드에 보여 줄 글자 모양. 서버 값의 뜻은 관리자웹-프론트-요청.md 기준
export const ROLE_LABEL = { student: '학생', teacher: '선생님', guardian: '보호자' }

// users.level = 가입 설문의 코딩 경험 단계 (XP 레벨이 아님 — 백엔드 확인 완료)
export const LEVEL_LABEL = { 1: '처음이에요', 2: '조금 해봤어요', 3: '꽤 해봤어요' }

export const CONSENT_LABEL = { pending: '보호자 동의 대기', granted: '보호자 동의 완료', not_required: '동의 필요 없음' }

const nf = new Intl.NumberFormat('ko-KR')
export const num = (n) => (typeof n === 'number' && Number.isFinite(n) ? nf.format(n) : '—')

// 서버는 'YYYY-MM-DD HH:MM:SS' (서버 시간대) 로 준다 — 시간대 변환 없이 글자 그대로 줄여 보인다
export function dateTime(s) {
  if (!s) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s))
  return m ? `${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}` : String(s)
}
export function dateOnly(s) {
  if (!s) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s))
  return m ? `${m[1]}.${m[2]}.${m[3]}` : String(s)
}
export function shortDay(s) {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(s ?? ''))
  return m ? `${Number(m[1])}/${Number(m[2])}` : String(s ?? '')
}

export const levelText = (lv) => LEVEL_LABEL[lv] ?? (lv == null ? '—' : `단계 ${lv}`)
export const roleText = (r) => ROLE_LABEL[r] ?? r ?? '—'
