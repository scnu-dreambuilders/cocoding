/* ════════════════════════════════════════════════
   블록 디자인 (테마) — 블록 색·글꼴·외형은 전부 여기서 정한다
   · 블록 정의(blockly/blocks.js)에는 색상값이 없고 스타일 이름만 있다.
     그래서 이 파일만 고치면 블록·팔레트 카테고리·미션 패널 칩 색이 함께 바뀐다.
   · 서버 재채점기(backend/grader/grade.mjs)는 blocks.js만 가져가므로,
     이 파일을 바꿔도 채점기 파일은 바뀌지 않는다 (npm run build:grader 불필요).
   · 블록 위 글자색은 Blockly가 흰색으로 고정해 두어서 theme.css에서 덮는다.
   ════════════════════════════════════════════════ */
import * as Blockly from 'blockly'
import './theme.css'

/* ── 카테고리 색 ───────────────────────────────
   블록 색 + 팔레트 카테고리 색 + 미션 패널의 블록 칩 색을 함께 정한다.
   연한 바탕 + 진한 테두리 한 쌍이고, 블록 글자는 갈색(바탕 위 8.7:1 이상, theme.css).
   어두운 화면에서도 같은 값을 쓴다.
   카테고리 목록(이름·소속 블록)은 blockInfo.js의 CATEGORIES에 있다. */
export const CATEGORY_COLOURS = {
  event:    '#F3E49E',
  motion:   '#BADCFF',
  looks:    '#E2CCFF',
  sound:    '#FFC7EC',
  loop:     '#B1F0C1',
  cond:     '#89E7E7',
  sensing:  '#A5EEFF',
  op:       '#D3EAA8',
  variable: '#FFC89B',
  message:  '#FFC3CB',
}
// 블록 테두리·드롭다운 바탕 (흰 글자 4.8:1 이상)
export const CATEGORY_EDGES = {
  event:    '#7F6700',
  motion:   '#3A65B8',
  looks:    '#7652AC',
  sound:    '#9E427B',
  loop:     '#007F3D',
  cond:     '#007F83',
  sensing:  '#0074AB',
  op:       '#587500',
  variable: '#A24F00',
  message:  '#A93F53',
}

// 맨 위 '찾기' 카테고리 (블록이 없는 검색 전용 칸)
export const SEARCH_COLOUR = '#5BA6AE'

/* ── 블록 외형 ─────────────────────────────────
   zelos: 스크래치처럼 둥글고 통통한 블록 / geras·thrasos: 각진 기본 블록
   startHats: 시작(이벤트) 블록 위의 둥근 모자 */
export const RENDERER = 'zelos'
const START_HATS = true

const FONT = {
  family: '"Pretendard Variable", Pretendard, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
  weight: '600',
  size: 11, // 글씨 크기 설정(lib/textSize.js)에 따라 작업공간 전체가 함께 확대·축소된다
}

/* ── 작업공간·팔레트 배경 (라이트/다크) ────────── */
const CHROME = {
  light: {
    workspaceBackgroundColour: '#f3fafa',
    toolboxBackgroundColour: '#ffffff',
    toolboxForegroundColour: '#472917',
    flyoutBackgroundColour: '#e4f2f3',
    flyoutForegroundColour: '#472917',
    flyoutOpacity: 0.97,
    scrollbarColour: '#a6d3d8',
    scrollbarOpacity: 0.7,
  },
  dark: {
    workspaceBackgroundColour: '#0e2225',
    toolboxBackgroundColour: '#132d31',
    toolboxForegroundColour: '#f2f9f9',
    flyoutBackgroundColour: '#17353a',
    flyoutForegroundColour: '#f2f9f9',
    flyoutOpacity: 0.97,
    scrollbarColour: '#6a979d',
    scrollbarOpacity: 0.7,
  },
}

// 작업공간 바닥의 점 격자
const GRID = {
  spacing: 24,
  length: 3,
  colour: { light: '#c8e4e6', dark: '#28484d' },
}

export function buildGrid() {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  return { spacing: GRID.spacing, length: GRID.length, colour: dark ? GRID.colour.dark : GRID.colour.light, snap: true }
}

/* ── Blockly 테마 만들기 ───────────────────────
   blockStyles:    블록 정의의 style 이름('motion_style') → 바탕(Primary)·테두리(Tertiary)
   categoryStyles: 팔레트 카테고리의 categorystyle 이름('motion_category') → 색 */
const styleOf = (cat) => ({ colourPrimary: CATEGORY_COLOURS[cat], colourSecondary: CATEGORY_COLOURS[cat], colourTertiary: CATEGORY_EDGES[cat] })
const blockStyles = {
  ...Object.fromEntries(Object.keys(CATEGORY_COLOURS).map((cat) => [`${cat}_style`, styleOf(cat)])),
  // Blockly가 기본 제공하는 연산(비교·계산·무작위 수)·글자·변수 값 블록도 같은 색 체계로
  logic_blocks: styleOf('op'),
  math_blocks: styleOf('op'),
  text_blocks: styleOf('op'),
  variable_blocks: styleOf('variable'),
}
const categoryStyles = {
  ...Object.fromEntries(Object.entries(CATEGORY_COLOURS).map(([cat, colour]) => [`${cat}_category`, { colour }])),
  search_category: { colour: SEARCH_COLOUR },
}

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
