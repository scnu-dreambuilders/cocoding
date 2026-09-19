/* ════════════════════════════════════════════════
   팔레트(툴박스) 구성
   - 챕터 모드: 그 챕터까지 배운 블록만 (체스 앱 방식 누적)
   - 자유 창작: 코딩 수준(1/2/3)에 따라 블록 수 제한 + 완료한 챕터 블록
   - 맨 위 '🔍 찾기' 카테고리: 블록 검색 결과
   ════════════════════════════════════════════════ */
import { BLOCK_INFO, CATEGORIES } from './blocks'

const numShadow = (n) => ({ shadow: { type: 'math_number', fields: { NUM: n } } })
const textShadow = (t) => ({ shadow: { type: 'text', fields: { TEXT: t } } })

// 팔레트에 꺼내 놓을 때의 기본값
const DEFAULT_INPUTS = {
  move_x: { DX: numShadow(10) },
  move_y: { DY: numShadow(10) },
  set_dir: { DIR: numShadow(90) },
  move_steps: { STEPS: numShadow(10) },
  goto_xy: { X: numShadow(0), Y: numShadow(0) },
  turn_right: { DEG: numShadow(15) },
  say: { TEXT: textShadow('안녕!') },
  say_secs: { TEXT: textShadow('안녕!'), SECS: numShadow(2) },
  change_size: { DS: numShadow(10) },
  set_size: { SIZE: numShadow(100) },
  repeat_n: { TIMES: numShadow(10) },
  wait: { SECS: numShadow(0.5) },
  var_set: { VALUE: numShadow(0) },
  var_change: { DELTA: numShadow(1) },
  logic_compare: { A: numShadow(0), B: numShadow(10) },
  math_arithmetic: { A: numShadow(1), B: numShadow(1) },
  math_random_int: { FROM: numShadow(1), TO: numShadow(10) },
}

// 카테고리별 블록 순서
const CATEGORY_BLOCKS = {
  event: ['when_start', 'when_key', 'when_clicked'],
  motion: ['move_x', 'move_y', 'set_dir', 'move_steps', 'turn_around', 'turn_right', 'goto_xy', 'goto_random', 'get_x', 'get_y'],
  looks: ['say', 'say_secs', 'show', 'hide', 'change_size', 'set_size'],
  sound: ['play_sound'],
  loop: ['repeat_n', 'forever', 'wait', 'stop_all'],
  cond: ['if_then', 'if_else'],
  sensing: ['touching', 'key_pressed'],
  op: ['logic_compare', 'math_arithmetic', 'math_random_int', 'logic_operation', 'logic_negate'],
  variable: ['var_set', 'var_change', 'var_show', 'var_hide', 'variables_get'],
  message: ['broadcast', 'when_receive', 'switch_scene', 'when_scene_start'],
}

export const ALL_BLOCKS = Object.values(CATEGORY_BLOCKS).flat()

/* 코딩 수준별 자유 창작 팔레트 (김해진님 의견: 초급/중급/상급 블록 수 분리) */
const LV1 = ['when_start', 'when_key', 'say', 'say_secs', 'move_x', 'move_y', 'set_dir', 'move_steps',
  'goto_xy', 'repeat_n', 'forever', 'wait', 'play_sound']
const LV2 = [...LV1, 'when_clicked', 'turn_around', 'goto_random', 'show', 'hide', 'if_then', 'touching',
  'key_pressed', 'var_set', 'var_change', 'var_show', 'var_hide', 'variables_get', 'logic_compare',
  'broadcast', 'when_receive']
export const LEVEL_BLOCKS = { 1: LV1, 2: LV2, 3: ALL_BLOCKS }

export function blockItem(type) {
  const item = { kind: 'block', type }
  if (DEFAULT_INPUTS[type]) item.inputs = DEFAULT_INPUTS[type]
  return item
}

/* ── 검색 ─────────────────────────────────────── */
let searchQuery = ''
let allowedForSearch = new Set(ALL_BLOCKS)

export function setSearchQuery(q) {
  searchQuery = q.trim()
}

export function searchBlocks(query, allowed = allowedForSearch) {
  const qn = query.trim().toLowerCase()
  if (!qn) return []
  return [...allowed].filter((t) => {
    const info = BLOCK_INFO[t]
    return info && (info.name.toLowerCase().includes(qn) || info.tooltip.toLowerCase().includes(qn)
      || CATEGORIES[info.cat].name.includes(qn))
  })
}

export function searchFlyout() {
  if (!searchQuery) {
    return [{ kind: 'label', text: '위 검색창에 찾고 싶은 블록 이름을 입력해봐 (예: 반복, 좌표, 닿았는가)' }]
  }
  const found = searchBlocks(searchQuery)
  if (!found.length) return [{ kind: 'label', text: `'${searchQuery}' 블록을 찾지 못했어요` }]
  return found.flatMap((t) => (t === 'variables_get' ? [] : [blockItem(t)]))
}

/* 변수 카테고리 (동적) — 변수 만들기 버튼 + 변수 블록 */
export function variableFlyout(workspace, allowed) {
  const items = [{ kind: 'button', text: '＋ 변수 만들기', callbackkey: 'COCO_CREATE_VARIABLE' }]
  const vars = workspace.getVariableMap().getVariablesOfType('')
  if (!vars.length) {
    items.push({ kind: 'label', text: '먼저 변수를 만들어봐! (예: 점수)' })
    return items
  }
  const first = { VAR: { id: vars[0].getId() } }
  for (const t of ['var_set', 'var_change', 'var_show', 'var_hide']) {
    if (allowed.has(t)) items.push({ ...blockItem(t), fields: first })
  }
  if (allowed.has('variables_get')) {
    for (const v of vars) items.push({ kind: 'block', type: 'variables_get', fields: { VAR: { id: v.getId() } } })
  }
  return items
}

/* ── 툴박스 JSON 만들기 ────────────────────────── */
export function buildToolbox({ allowed, newBlocks = [] }) {
  const allowedSet = new Set(allowed)
  allowedForSearch = allowedSet
  const newSet = new Set(newBlocks)

  const contents = [{
    kind: 'category', name: '🔍 찾기', colour: '#94a3b8',
    toolboxitemid: 'cat_search', custom: 'COCO_SEARCH',
  }]

  for (const [cat, types] of Object.entries(CATEGORY_BLOCKS)) {
    const list = types.filter((t) => allowedSet.has(t))
    if (!list.length) continue
    const hasNew = list.some((t) => newSet.has(t))
    const base = {
      kind: 'category',
      name: CATEGORIES[cat].name,
      colour: CATEGORIES[cat].colour,
      toolboxitemid: `cat_${cat}`,
      ...(hasNew && { cssconfig: { container: 'blocklyToolboxCategoryContainer coco-cat-new' } }),
    }
    if (cat === 'variable') {
      contents.push({ ...base, custom: 'COCO_VARIABLE' })
    } else {
      contents.push({ ...base, contents: list.map(blockItem) })
    }
  }
  return { kind: 'categoryToolbox', contents }
}

export function categoryIdOf(type) {
  const cat = BLOCK_INFO[type]?.cat
  return cat ? `cat_${cat}` : null
}
