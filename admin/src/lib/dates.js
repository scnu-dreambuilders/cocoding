/* 날짜만 다루는 계산 ('YYYY-MM-DD' 글자). 관리자 PC 의 시간대에 영향을 받지 않게
   Date 는 UTC 로만 쓰고, '오늘'은 서버가 준 날짜 → 없으면 Asia/Seoul 달력으로 정한다. */
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/
export const FALLBACK_TZ = 'Asia/Seoul'

// 실제로 있는 날짜인지까지 본다 (2026-02-30 같은 값은 거른다)
export function isYmd(s) {
  const m = YMD.exec(String(s ?? ''))
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

const pad = (n) => String(n).padStart(2, '0')
const fromUtc = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

export function addDays(ymd, n) {
  const m = YMD.exec(ymd)
  return fromUtc(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n)))
}

// 주어진 시각(now)이 timeZone 달력으로 며칠인지
export function todayIn(timeZone = FALLBACK_TZ, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (t) => parts.find((p) => p.type === t)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

/* 최근 7일 가입자 7칸 만들기
   - 기준일: serverToday 가 올바른 날짜면 그것, 아니면 Asia/Seoul 의 오늘 (basis 로 알려 준다)
   - 서버가 빠뜨린 날은 0, 같은 날이 두 번 오면 더한다
   - 7일 범위 밖(미래 포함)이거나 날짜 형식이 아닌 줄은 그리지 않고 skipped 로 센다 */
export function buildWeek(rows, serverToday, now = new Date()) {
  const fromServer = isYmd(serverToday)
  const today = fromServer ? serverToday : todayIn(FALLBACK_TZ, now)
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6))
  const counts = new Map(days.map((d) => [d, 0]))
  let skipped = 0
  for (const r of Array.isArray(rows) ? rows : []) {
    const day = String(r?.day ?? '').slice(0, 10)
    const n = Number(r?.count)
    if (!isYmd(day) || !counts.has(day) || !Number.isFinite(n) || n < 0) { skipped += 1; continue }
    counts.set(day, counts.get(day) + n)
  }
  return { today, basis: fromServer ? 'server' : 'fallback', skipped, days: days.map((day) => ({ day, count: counts.get(day) })) }
}
