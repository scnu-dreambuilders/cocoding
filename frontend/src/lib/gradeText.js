import { BLOCK_INFO } from '../blockly/blockInfo'

/* ════════════════════════════════════════════════
   채점 결과에 붙일 안내 문구
   채점기(engine/grader.js)는 '어떤 블록이 빠졌는지'만 알려주고,
   블록 이름을 붙이는 일은 화면에서 한다. 그래야 블록 이름·설명이
   서버 재채점기 번들(backend/grader/grade.mjs)에 들어가지 않는다.
   ════════════════════════════════════════════════ */
export function itemTip(item) {
  if (!item) return null
  if (item.tip) return item.tip
  if (!item.missing?.length) return null
  const names = item.missing.map((type) => `'${BLOCK_INFO[type]?.name ?? type}'`).join(', ')
  return `${names} 블록을 써보자!`
}
