/* ════════════════════════════════════════════════
   화면에서 쓰는 블록 메타데이터 — 로직(blockDefs.js) + 문구(blockText.js)를 합친 것.
   Blockly 없이도 쓰는 순수 데이터라, 대시보드(챕터 카드·미션 칩)가
   블록 편집기(blockly 라이브러리, 약 1MB)를 같이 받아오지 않는다.

   서버 재채점기는 이 파일을 가져가지 않는다. 블록 이름·툴팁·설명을 고칠 때는
   blockText.js만 고치면 되고, 채점기를 다시 빌드할 필요가 없다.
   실제 블록 정의와 코드 생성기는 blockly/blocks.js에 있다.
   ════════════════════════════════════════════════ */
import { BLOCK_CATEGORY } from './blockDefs'
import { BLOCK_DESC, BLOCK_NAME, BLOCK_TOOLTIP, keyOptions, soundOptions } from './blockText'

export { HAT_TYPES } from './blockDefs'

/* ── 카테고리 ───────────────────────────────────
   색은 테마(blockly/theme.js)가 정한다 — 여기에는 이름만 둔다 */
export const CATEGORIES = {
  event:    { name: '이벤트' },
  motion:   { name: '이동' },
  looks:    { name: '모양' },
  sound:    { name: '소리' },
  loop:     { name: '반복' },
  cond:     { name: '조건' },
  sensing:  { name: '감지' },
  op:       { name: '연산' },
  variable: { name: '변수' },
  message:  { name: '메시지·장면' },
}

/* ── 블록 메타데이터 ──────────────────────────── */
// cat: 카테고리 / name: 팔레트·검색·힌트에 쓰는 이름
// tooltip: 마우스 올렸을 때 한 줄 설명 / desc: 오류가 났을 때 코코가 말해주는 설명
export const BLOCK_INFO = Object.fromEntries(
  Object.entries(BLOCK_CATEGORY).map(([type, cat]) => [type, {
    cat,
    name: BLOCK_NAME[type],
    tooltip: BLOCK_TOOLTIP[type],
    desc: BLOCK_DESC[type],
  }]),
)

/* 소리 블록 드롭다운과 소리 고르기 창에 쓰는 기본 제공 소리 [이름, id] */
export const BUILTIN_SOUNDS = soundOptions()

/* 키 블록 드롭다운 [보이는 글자, 키 값] */
export const KEY_OPTIONS = keyOptions()
