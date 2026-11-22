/* ════════════════════════════════════════════════
   코딩 게시판 — 글 종류·챕터·블록 태그 도우미 (화면 표시용)
   챕터 제목은 data/chapterText.js, 챕터별 블록은 data/chapterLogic.js,
   블록 이름은 blockly/blockText.js에서 읽기만 한다.
   허용 값과 개수 제한은 백엔드와 합의 전 — 서버가 다른 값을 돌려줘도 화면이 깨지지 않게 받는다.
   ════════════════════════════════════════════════ */
import { CHAPTER_TEXT } from '../data/chapterText'
import { CHAPTER_COUNT, chapterBlocks } from '../data/chapterLogic'
import { BLOCK_NAME } from '../blockly/blockText'

export const BOARD_KIND_LABEL = { question: '질문', discussion: '토론' }
export const BOARD_STATUS_LABEL = { open: '미해결', solved: '해결됨' }
export const MAX_BLOCK_TAGS = 3

// '이동과 방향 – 캐릭터를 움직여보자' → '이동과 방향'
const shortTitle = (no) => String(CHAPTER_TEXT[no]?.title ?? '').split(' – ')[0]

// 질문 챕터: 선택 안 함('') · 챕터 1~5('1'~'5') · 자유창작('free')
export const CHAPTER_OPTIONS = [
  { value: '', label: '선택 안 함' },
  ...Array.from({ length: CHAPTER_COUNT }, (_, i) => ({ value: String(i + 1), label: `챕터 ${i + 1} · ${shortTitle(i + 1)}` })),
  { value: 'free', label: '자유창작' },
]

export const chapterLabel = (value) => {
  if (value === 'free') return '자유창작'
  const no = Number(value)
  return no >= 1 && no <= CHAPTER_COUNT ? `챕터 ${no}` : ''
}

export const blockLabel = (type) => BLOCK_NAME[type] ?? type

// 고를 수 있는 블록: 챕터를 고르면 그 챕터까지 배운 블록(이전 챕터 포함), 선택 안 함·자유창작이면 챕터 1~5 전체
export function blockOptions(chapter) {
  const no = Number(chapter)
  const upTo = no >= 1 && no <= CHAPTER_COUNT ? no : CHAPTER_COUNT
  return [...new Set(chapterBlocks(upTo))]
    .filter((type) => BLOCK_NAME[type])
    .map((type) => ({ value: type, label: BLOCK_NAME[type] }))
}

// 목록·상세의 글을 화면에서 쓰는 모양으로. 지금 서버의 글(종류 정보 없음)은 토론으로 본다
export function normalizePost(p) {
  const kind = p?.kind === 'question' ? 'question' : 'discussion'
  return {
    ...p,
    kind,
    status: kind === 'question' && p?.status === 'solved' ? 'solved' : 'open',
    chapter: p?.chapter == null ? '' : String(p.chapter),
    blocks: Array.isArray(p?.blocks) ? p.blocks.slice(0, MAX_BLOCK_TAGS) : [],
    replyCount: Number(p?.answer_count ?? p?.comment_count ?? 0),
  }
}
