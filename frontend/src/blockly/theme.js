/* ════════════════════════════════════════════════
   블록 디자인 (테마) — 블록 색·글꼴·외형은 전부 여기서 정한다
   · 블록 정의(blockly/blocks.js)에는 색상값이 없고 스타일 이름만 있다.
     그래서 이 파일만 고치면 블록·팔레트 카테고리·미션 패널 칩 색이 함께 바뀐다.
   · 서버 재채점기(backend/grader/grade.mjs)는 blocks.js만 가져가므로,
     이 파일을 바꿔도 채점기 파일은 바뀌지 않는다 (npm run build:grader 불필요).
   ════════════════════════════════════════════════ */
import * as Blockly from 'blockly'

/* ── 카테고리 색 ───────────────────────────────
   블록 색 + 팔레트 카테고리 색 + 미션 패널의 블록 칩 색을 함께 정한다.
   카테고리 목록(이름·소속 블록)은 blocks.js의 CATEGORIES에 있다. */
export const CATEGORY_COLOURS = {
  event:    '#F5A623',
  motion:   '#4C97FF',
  looks:    '#9966FF',
  sound:    '#CF63CF',
  loop:     '#2FB871',
  cond:     '#0FA8C9',
  sensing:  '#5CB1D6',
  op:       '#59C059',
  variable: '#FF8C1A',
  message:  '#E6A700',
}

// 맨 위 '🔍 찾기' 카테고리 (블록이 없는 검색 전용 칸)
export const SEARCH_COLOUR = '#94a3b8'

/* ── 블록 외형 ─────────────────────────────────
   zelos: 스크래치처럼 둥글고 통통한 블록 / geras·thrasos: 각진 기본 블록
   startHats: 시작(이벤트) 블록 위의 둥근 모자 */
export const RENDERER = 'zelos'
const START_HATS = true

const FONT = {
  family: 'system-ui, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
  weight: '600',
  size: 11, // 글씨 크기 설정(lib/textSize.js)에 따라 작업공간 전체가 함께 확대·축소된다
}

/* ── 작업공간·팔레트 배경 (라이트/다크) ────────── */
const CHROME = {
  light: {
    workspaceBackgroundColour: '#f8fafc',
    toolboxBackgroundColour: '#ffffff',
    toolboxForegroundColour: '#0f172a',
    flyoutBackgroundColour: '#f1f5f9',
    flyoutForegroundColour: '#0f172a',
    flyoutOpacity: 0.97,
    scrollbarColour: '#cbd5e1',
    scrollbarOpacity: 0.7,
  },
  dark: {
    workspaceBackgroundColour: '#0b0f17',
    toolboxBackgroundColour: '#0d1117',
    toolboxForegroundColour: '#e6edf3',
    flyoutBackgroundColour: '#111827',
    flyoutForegroundColour: '#e6edf3',
    flyoutOpacity: 0.97,
    scrollbarColour: '#30363d',
    scrollbarOpacity: 0.7,
  },
}

// 작업공간 바닥의 점 격자
const GRID = {
  spacing: 24,
  length: 3,
  colour: { light: '#e2e8f0', dark: '#1c2128' },
}

export function buildGrid() {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  return { spacing: GRID.spacing, length: GRID.length, colour: dark ? GRID.colour.dark : GRID.colour.light, snap: true }
}

/* ── Blockly 테마 만들기 ───────────────────────
   blockStyles:    블록 정의의 style 이름('motion_style') → 색
   categoryStyles: 팔레트 카테고리의 categorystyle 이름('motion_category') → 색
   (어두운 테두리·글자색은 Blockly가 기본 색에서 자동으로 만든다) */
const blockStyles = Object.fromEntries(
  Object.entries(CATEGORY_COLOURS).map(([cat, colour]) => [`${cat}_style`, { colourPrimary: colour }]),
)
const categoryStyles = {
  ...Object.fromEntries(Object.entries(CATEGORY_COLOURS).map(([cat, colour]) => [`${cat}_category`, { colour }])),
  search_category: { colour: SEARCH_COLOUR },
}

// 연산(비교·계산·무작위 수)과 변수 값 블록은 Blockly가 기본 제공하는 블록이라
// Classic 테마의 색을 그대로 쓴다. 색을 바꾸려면 위 blockStyles에
// logic_blocks / math_blocks / variable_blocks 를 추가하면 된다.
export function buildTheme() {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  return Blockly.Theme.defineTheme(dark ? 'cocoding-dark' : 'cocoding-light', {
    base: Blockly.Themes.Classic,
    startHats: START_HATS,
    fontStyle: FONT,
    blockStyles,
    categoryStyles,
    componentStyles: dark ? CHROME.dark : CHROME.light,
  })
}
