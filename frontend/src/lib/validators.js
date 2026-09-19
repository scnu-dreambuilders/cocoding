// 서버와 같은 입력 규칙 (backend/config/Validators.php) — 제출 전에 미리 알려주기용

export const ROLES = [
  { id: 'student', emoji: '🧒', label: '학생', desc: '블록 코딩을 배워요' },
  { id: 'teacher', emoji: '🧑‍🏫', label: '선생님', desc: '반을 만들고 진도를 봐요' },
  { id: 'guardian', emoji: '👪', label: '보호자', desc: '아이 가입에 동의하고 진도를 봐요' },
]
export const ROLE_LABEL = Object.fromEntries(ROLES.map((r) => [r.id, r.label]))

// 만 14세 미만 보호자 동의. 태어난 해만 받으므로 올해 14살이 되는 경우도 동의 대상
export const CONSENT_AGE = 14
const thisYear = () => new Date().getFullYear()
export const needsGuardianConsent = (birthYear) => thisYear() - Number(birthYear) <= CONSENT_AGE

// 가입 화면의 태어난 해 선택지 (5살 ~ 100살)
export const birthYearOptions = () => Array.from({ length: 96 }, (_, i) => thisYear() - 5 - i)

export function usernameError(name) {
  return /^[가-힣A-Za-z0-9_]{2,12}$/.test(name.trim()) ? '' : '닉네임은 한글·영문·숫자로 2~12자까지 쓸 수 있어요'
}

export function passwordError(pw) {
  return pw.length >= 8 && pw.length <= 72 && /[A-Za-z]/.test(pw) && /[0-9]/.test(pw)
    ? '' : '비밀번호는 영문과 숫자를 섞어서 8자 이상으로 만들어주세요'
}

// 코드 보기 좋게: ABCD2345 → ABCD-2345
export const formatCode = (code) => (code && code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code ?? '')
