/* ════════════════════════════════════════════════
   코코딩 커스텀 블록 정의
   - 기획서의 블록(이동·반복·조건·변수·메시지/장면) + 무대 실행용 보조 블록
   - 블록에 보이는 글자는 전부 blockText.js에 있다 (여기에는 두지 않는다)
   - 카테고리 같은 로직 값은 blockDefs.js
   - 코드 생성기는 '코드 보기' 패널 표시용 (실제 실행은 engine/runtime.js)
   ════════════════════════════════════════════════ */
import * as Blockly from 'blockly'
import { javascriptGenerator, Order } from 'blockly/javascript'
import * as Ko from 'blockly/msg/ko'
import { BLOCK_CATEGORY, HAT_TYPES } from './blockDefs'
import { BLOCKLY_TEXT, BLOCK_LABEL, CODE_FALLBACK, DROPDOWN_TEXT, UNCONNECTED_NOTE, keyOptions, soundOptions } from './blockText'

// 편집기 쪽에서 blocks.js만 가져다 쓰는 곳이 많아 그대로 다시 내보낸다
export { BLOCK_INFO, BUILTIN_SOUNDS, CATEGORIES, KEY_OPTIONS } from './blockInfo'
export { HAT_TYPES } from './blockDefs'

const KEY_OPTIONS = keyOptions()

Blockly.setLocale(Ko)
Blockly.Msg.MATH_RANDOM_INT_TITLE = BLOCKLY_TEXT.randomInt
// 변수 이름 기본값은 저장된 작품에 그대로 들어가는 값이라 문구 파일로 빼지 않는다
Blockly.Msg.VARIABLES_DEFAULT_NAME = '점수'
Blockly.Msg.NEW_VARIABLE = BLOCKLY_TEXT.newVariable
Blockly.Msg.NEW_VARIABLE_TITLE = BLOCKLY_TEXT.newVariableTitle

/* ── 동적 드롭다운 (현재 프로젝트의 캐릭터/장면/소리) ── */
const ctx = { sprites: [], scenes: [], sounds: [] }

export function setBlockContext({ sprites, scenes, sounds }) {
  ctx.sprites = sprites ?? []
  ctx.scenes = scenes ?? []
  ctx.sounds = sounds ?? []
}

// 캐릭터 보관함에서 고른 이모지가 있으면 앞에 붙이고, 모습 키로 그리는 캐릭터는 이름만 보여준다
export function spriteLabel(s) {
  return [s.emoji, s.name].filter(Boolean).join(' ')
}

function spriteOptions() {
  if (!ctx.sprites.length) return [[DROPDOWN_TEXT.noSprite, '__none__']]
  return ctx.sprites.map((s) => [spriteLabel(s), s.id])
}
function touchOptions() {
  return [[DROPDOWN_TEXT.wall, '__wall__'], ...ctx.sprites.map((s) => [spriteLabel(s), s.id])]
}
function sceneOptions() {
  if (!ctx.scenes.length) return [[DROPDOWN_TEXT.defaultScene, 'scene1']]
  return ctx.scenes.map((s) => [s.name, s.id])
}
function soundDropdown() {
  return [
    ...soundOptions().map(([n, id]) => [`${DROPDOWN_TEXT.builtinSound} ${n}`.trim(), id]),
    ...ctx.sounds.map((s) => [`${DROPDOWN_TEXT.recordedSound} ${s.name}`.trim(), s.id]),
  ]
}

/* ── 블록 정의 도우미 ─────────────────────────── */
/* 툴팁 문구는 화면 쪽에서 넣어준다 (editor에서 setBlockTooltips 호출).
   블록 이름·설명을 여기서 가져오면 서버 재채점기 번들에 같이 들어가기 때문이다.
   넣어주지 않으면 툴팁만 비고 블록 동작은 그대로다. */
let tooltipOf = () => ''
export function setBlockTooltips(fn) {
  tooltipOf = typeof fn === 'function' ? fn : () => ''
}
const tip = (type) => () => tooltipOf(type)

// 블록에는 색 대신 스타일 이름만 준다 → 실제 색은 theme.js의 blockStyles가 정함
function styleOf(type) {
  return `${BLOCK_CATEGORY[type]}_style`
}

// 캐릭터 드롭다운이 붙은 이벤트(모자) 블록
function defineHat(type, build) {
  Blockly.Blocks[type] = {
    init() {
      const input = this.appendDummyInput()
      input.appendField(new Blockly.FieldDropdown(spriteOptions), 'SPRITE')
      build(input, this)
      this.setNextStatement(true)
      this.setStyle(styleOf(type))
      this.setTooltip(tip(type))
    },
  }
}

defineHat('when_start', (input) => input.appendField(BLOCK_LABEL.when_start))
defineHat('when_key', (input) =>
  input.appendField(new Blockly.FieldDropdown(KEY_OPTIONS), 'KEY').appendField(BLOCK_LABEL.when_key_suffix))
defineHat('when_clicked', (input) => input.appendField(BLOCK_LABEL.when_clicked))
defineHat('when_receive', (input) =>
  input.appendField(new Blockly.FieldTextInput('신호'), 'MSG').appendField(BLOCK_LABEL.when_receive_suffix))
defineHat('when_scene_start', (input) =>
  input.appendField(new Blockly.FieldDropdown(sceneOptions), 'SCENE').appendField(BLOCK_LABEL.when_scene_start_suffix))

// 드롭다운이 필요한 나머지 블록
Blockly.Blocks.touching = {
  init() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(touchOptions), 'TARGET')
      .appendField(BLOCK_LABEL.touching_suffix)
    this.setOutput(true, 'Boolean')
    this.setStyle(styleOf('touching'))
    this.setTooltip(tip('touching'))
  },
}
Blockly.Blocks.key_pressed = {
  init() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(KEY_OPTIONS.filter(([, v]) => v !== 'any')), 'KEY')
      .appendField(BLOCK_LABEL.key_pressed_suffix)
    this.setOutput(true, 'Boolean')
    this.setStyle(styleOf('key_pressed'))
    this.setTooltip(tip('key_pressed'))
  },
}
Blockly.Blocks.switch_scene = {
  init() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(sceneOptions), 'SCENE')
      .appendField(BLOCK_LABEL.switch_scene_suffix)
    this.setPreviousStatement(true)
    this.setNextStatement(true)
    this.setStyle(styleOf('switch_scene'))
    this.setTooltip(tip('switch_scene'))
  },
}
Blockly.Blocks.play_sound = {
  init() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(soundDropdown), 'SOUND')
      .appendField(BLOCK_LABEL.play_sound_suffix)
    this.setPreviousStatement(true)
    this.setNextStatement(true)
    this.setStyle(styleOf('play_sound'))
    this.setTooltip(tip('play_sound'))
  },
}

/* JSON으로 정의 가능한 블록 */
const num = (name) => ({ type: 'input_value', name, check: 'Number' })
const stmt = (type, message0, args0 = [], extra = {}) => ({
  type, message0, args0,
  previousStatement: null, nextStatement: null,
  inputsInline: true,
  style: styleOf(type), tooltip: tip(type),
  ...extra,
})

Blockly.defineBlocksWithJsonArray([
  stmt('move_x', BLOCK_LABEL.move_x, [num('DX')]),
  stmt('move_y', BLOCK_LABEL.move_y, [num('DY')]),
  stmt('set_dir', BLOCK_LABEL.set_dir, [num('DIR')]),
  stmt('move_steps', BLOCK_LABEL.move_steps, [num('STEPS')]),
  stmt('turn_around', BLOCK_LABEL.turn_around),
  stmt('goto_xy', BLOCK_LABEL.goto_xy, [num('X'), num('Y')]),
  stmt('goto_random', BLOCK_LABEL.goto_random),
  stmt('turn_right', BLOCK_LABEL.turn_right, [num('DEG')]),
  { type: 'get_x', message0: BLOCK_LABEL.get_x, output: 'Number', style: styleOf('get_x'), tooltip: tip('get_x') },
  { type: 'get_y', message0: BLOCK_LABEL.get_y, output: 'Number', style: styleOf('get_y'), tooltip: tip('get_y') },

  stmt('say', BLOCK_LABEL.say, [{ type: 'input_value', name: 'TEXT' }]),
  stmt('say_secs', BLOCK_LABEL.say_secs, [{ type: 'input_value', name: 'TEXT' }, num('SECS')]),
  stmt('show', BLOCK_LABEL.show),
  stmt('hide', BLOCK_LABEL.hide),
  stmt('change_size', BLOCK_LABEL.change_size, [num('DS')]),
  stmt('set_size', BLOCK_LABEL.set_size, [num('SIZE')]),

  stmt('repeat_n', BLOCK_LABEL.repeat_n,
    [num('TIMES'), { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }]),
  stmt('forever', BLOCK_LABEL.forever,
    [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], { nextStatement: undefined }),
  stmt('wait', BLOCK_LABEL.wait, [num('SECS')]),
  stmt('stop_all', BLOCK_LABEL.stop_all, [], { nextStatement: undefined }),

  stmt('if_then', BLOCK_LABEL.if_then,
    [{ type: 'input_value', name: 'COND', check: 'Boolean' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }]),
  stmt('if_else', BLOCK_LABEL.if_else,
    [{ type: 'input_value', name: 'COND', check: 'Boolean' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' },
      { type: 'input_dummy' }, { type: 'input_statement', name: 'ELSE' }]),

  stmt('var_set', BLOCK_LABEL.var_set,
    [{ type: 'field_variable', name: 'VAR', variable: '점수' }, { type: 'input_value', name: 'VALUE' }]),
  stmt('var_change', BLOCK_LABEL.var_change,
    [{ type: 'field_variable', name: 'VAR', variable: '점수' }, num('DELTA')]),
  stmt('var_show', BLOCK_LABEL.var_show, [{ type: 'field_variable', name: 'VAR', variable: '점수' }]),
  stmt('var_hide', BLOCK_LABEL.var_hide, [{ type: 'field_variable', name: 'VAR', variable: '점수' }]),

  stmt('broadcast', BLOCK_LABEL.broadcast, [{ type: 'field_input', name: 'MSG', text: '신호' }]),
])

/* ════════════════════════════════════════════════
   코드 생성기 ('코드 보기' 패널 전용)
   ════════════════════════════════════════════════ */
const G = javascriptGenerator
const val = (b, name, fallback = '0') => G.valueToCode(b, name, Order.NONE) || fallback
const body = (b, name) => G.statementToCode(b, name)
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const varName = (b) => b.workspace.getVariableMap().getVariableById(b.getFieldValue('VAR'))?.getName() ?? CODE_FALLBACK.variable
const spriteName = (b) => ctx.sprites.find((s) => s.id === b.getFieldValue('SPRITE'))?.name ?? CODE_FALLBACK.sprite
const sceneName = (b) => ctx.scenes.find((s) => s.id === b.getFieldValue('SCENE'))?.name ?? CODE_FALLBACK.scene

// 이벤트 블록은 아래에 붙은 블록들을 함수 본문으로 감싸서 보여준다
function hatGen(header) {
  return (block) => {
    const next = block.getNextBlock()
    const inner = next ? G.prefixLines(G.blockToCode(next), G.INDENT) : ''
    return `// ${spriteName(block)}\n${header(block)} => {\n${inner}});\n`
  }
}
G.forBlock.when_start = hatGen(() => 'onStart(()')
G.forBlock.when_key = hatGen((b) => `onKeyPress(${q(b.getFieldValue('KEY'))}, ()`)
G.forBlock.when_clicked = hatGen(() => 'onClick(()')
G.forBlock.when_receive = hatGen((b) => `onMessage(${q(b.getFieldValue('MSG'))}, ()`)
G.forBlock.when_scene_start = hatGen((b) => `onSceneStart(${q(sceneName(b))}, ()`)

const origScrub = G.scrub_.bind(G)
G.scrub_ = function (block, code, thisOnly) {
  if (HAT_TYPES.has(block.type)) return origScrub(block, code, true)
  // 이벤트 블록에 연결되지 않은 블록 묶음은 실행되지 않는다는 표시
  if (!block.getParent() && !block.outputConnection) {
    code = `// ${UNCONNECTED_NOTE}\n${code}`
  }
  return origScrub(block, code, thisOnly)
}

Object.assign(G.forBlock, {
  move_x: (b) => `x += ${val(b, 'DX')};\n`,
  move_y: (b) => `y += ${val(b, 'DY')};\n`,
  set_dir: (b) => `direction = ${val(b, 'DIR', '90')};\n`,
  move_steps: (b) => `move(${val(b, 'STEPS')});\n`,
  turn_around: () => 'direction += 180;\n',
  goto_xy: (b) => `x = ${val(b, 'X')};\ny = ${val(b, 'Y')};\n`,
  goto_random: () => 'x = random(-240, 240);\ny = random(-180, 180);\n',
  turn_right: (b) => `direction += ${val(b, 'DEG')};\n`,
  get_x: () => ['x', Order.ATOMIC],
  get_y: () => ['y', Order.ATOMIC],
  say: (b) => `say(${val(b, 'TEXT', "''")});\n`,
  say_secs: (b) => `say(${val(b, 'TEXT', "''")});\nwait(${val(b, 'SECS')});\nsay('');\n`,
  show: () => 'show();\n',
  hide: () => 'hide();\n',
  change_size: (b) => `size += ${val(b, 'DS')};\n`,
  set_size: (b) => `size = ${val(b, 'SIZE', '100')};\n`,
  play_sound: (b) => {
    const id = b.getFieldValue('SOUND')
    const name = soundOptions().find(([, v]) => v === id)?.[0] ?? ctx.sounds.find((s) => s.id === id)?.name ?? id
    return `playSound(${q(name)});\n`
  },
  repeat_n: (b) => `for (let i = 0; i < ${val(b, 'TIMES')}; i++) {\n${body(b, 'DO')}}\n`,
  forever: (b) => `while (true) {\n${body(b, 'DO')}}\n`,
  wait: (b) => `wait(${val(b, 'SECS')});\n`,
  stop_all: () => 'stopAll();\n',
  if_then: (b) => `if (${val(b, 'COND', 'false')}) {\n${body(b, 'DO')}}\n`,
  if_else: (b) => `if (${val(b, 'COND', 'false')}) {\n${body(b, 'DO')}} else {\n${body(b, 'ELSE')}}\n`,
  touching: (b) => {
    const t = b.getFieldValue('TARGET')
    const name = t === '__wall__' ? 'wall' : ctx.sprites.find((s) => s.id === t)?.name ?? t
    return [`touching(${q(name)})`, Order.FUNCTION_CALL]
  },
  key_pressed: (b) => [`isKeyPressed(${q(b.getFieldValue('KEY'))})`, Order.FUNCTION_CALL],
  var_set: (b) => `${varName(b)} = ${val(b, 'VALUE')};\n`,
  var_change: (b) => `${varName(b)} += ${val(b, 'DELTA')};\n`,
  var_show: (b) => `showVariable(${q(varName(b))});\n`,
  var_hide: (b) => `hideVariable(${q(varName(b))});\n`,
  variables_get: (b) => [varName(b), Order.ATOMIC],
  broadcast: (b) => `broadcast(${q(b.getFieldValue('MSG'))});\n`,
  switch_scene: (b) => `startScene(${q(sceneName(b))});\n`,
  // 예전 버전 프로젝트 호환
  text_print: (b) => `say(${val(b, 'TEXT', "''")});\n`,
})

/* 코드 보기용: 워크스페이스 전체를 읽기 쉬운 JS로 */
export function workspaceToCode(workspace) {
  let code = G.workspaceToCode(workspace)
  code = code.replace(/^var [^;]*;\s*/, '') // Blockly가 만든 영문 변수 선언 제거
  const vars = workspace.getVariableMap().getAllVariables().map((v) => v.getName())
  const header = vars.length ? vars.map((n) => `let ${n} = 0;`).join('\n') + '\n\n' : ''
  return (header + code).trim()
}
