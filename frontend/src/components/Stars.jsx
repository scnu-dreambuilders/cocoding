import { Star } from 'lucide-react'

// 별 3개 평가 — 얻은 별은 채우고, 못 얻은 별은 윤곽선만 (색은 index.css .stars)
export default function Stars({ count, size = 16, className = '', delay }) {
  return (
    <span className={`stars ${className}`} role="img" aria-label={`별 ${count}개`}>
      {[1, 2, 3].map((n) => (
        <Star key={n} size={size} aria-hidden="true" className={n <= count ? 'on' : ''}
          style={delay != null ? { animationDelay: `${delay + n * 0.15}s` } : undefined} />
      ))}
    </span>
  )
}
