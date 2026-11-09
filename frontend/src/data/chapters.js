/* ════════════════════════════════════════════════
   화면에서 쓰는 챕터 데이터 — 로직(chapterLogic.js) + 문구(chapterText.js)
   둘을 합쳐서 예전과 같은 모양으로 내보낸다. 화면 코드는 이 파일만 보면 된다.

   서버 재채점기는 chapterLogic.js만 가져간다. 그래서 문구를 고쳐도
   backend/grader/grade.mjs를 다시 빌드할 필요가 없다.
   ════════════════════════════════════════════════ */
import { CHAPTER_LOGIC, MY_GAME_LOGIC } from './chapterLogic'
import { CHAPTER_TEXT, MY_GAME_TEXT } from './chapterText'

export { BASE_BLOCKS, CHAPTER_COUNT, chapterBlocks, learnedBlocks, usedTypes } from './chapterLogic'

const merge = (logic, text) => ({
  ...logic,
  title: text.title,
  chess: text.chess,
  concept: text.concept,
  mission: text.mission,
  hints: text.hints,
  example: { ...logic.example, desc: text.exampleDesc },
  grading: { ...logic.grading, howto: text.howto },
})

export const CHAPTERS = Object.fromEntries(
  Object.entries(CHAPTER_LOGIC).map(([no, logic]) => [no, merge(logic, CHAPTER_TEXT[no])]),
)

export const MY_GAME = { ...MY_GAME_LOGIC, ...MY_GAME_TEXT }
