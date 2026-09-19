/* ════════════════════════════════════════════════
   글씨 크기 설정 (작게 / 보통 / 크게)
   - CSS 글자 크기는 모두 rem → <html data-text-size>로 화면 전체 글씨가 함께 바뀜 (index.css)
   - blockScale: 블록 작업공간 확대 비율 (BlocklyEditor)
   ════════════════════════════════════════════════ */
import { useEffect, useState } from 'react'

export const TEXT_SIZES = [
  { id: 'sm', label: '작게', blockScale: 0.85 },
  { id: 'md', label: '보통', blockScale: 1 },
  { id: 'lg', label: '크게', blockScale: 1.15 },
]
const DEFAULT = TEXT_SIZES[1]
const KEY = 'cocoding_text_size'
const EVENT = 'cocoding:textsize'

export function getTextSize() {
  try {
    return TEXT_SIZES.find((s) => s.id === localStorage.getItem(KEY)) ?? DEFAULT
  } catch {
    return DEFAULT
  }
}

export function applyTextSize(size = getTextSize()) {
  document.documentElement.dataset.textSize = size.id
}

export function setTextSize(id) {
  const size = TEXT_SIZES.find((s) => s.id === id) ?? DEFAULT
  try {
    localStorage.setItem(KEY, size.id)
  } catch { /* 저장 못 해도 이번 화면에는 적용 */ }
  applyTextSize(size)
  window.dispatchEvent(new CustomEvent(EVENT, { detail: size }))
}

export function useTextSize() {
  const [size, setSize] = useState(getTextSize)
  useEffect(() => {
    const on = (e) => setSize(e.detail)
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return size
}
