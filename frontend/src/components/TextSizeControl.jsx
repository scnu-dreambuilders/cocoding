import { TEXT_SIZES, setTextSize, useTextSize } from '../lib/textSize'

/* 헤더의 글씨 크기 버튼: 가(작게) 가(보통) 가(크게) */
export default function TextSizeControl() {
  const current = useTextSize()
  return (
    <div className="text-size" role="radiogroup" aria-label="글씨 크기">
      {TEXT_SIZES.map((s) => (
        <button key={s.id} type="button" role="radio" aria-checked={current.id === s.id} title={`글씨 ${s.label}`}
          className={`text-size-btn ts-${s.id} ${current.id === s.id ? 'on' : ''}`} onClick={() => setTextSize(s.id)}>
          가
        </button>
      ))}
    </div>
  )
}
