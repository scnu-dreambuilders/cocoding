/* ════════════════════════════════════════════════
   코코딩 커스텀 블록 정의
   - 기획서의 블록(이동·반복·조건·변수·메시지/장면) + 무대 실행용 보조 블록
   - BLOCK_INFO: 이름/툴팁/설명 — 블록 검색, 코코의 힌트·오류 말풍선에 사용
   - 코드 생성기는 '코드 보기' 패널 표시용 (실제 실행은 engine/runtime.js)
   ════════════════════════════════════════════════ */
import * as Blockly from 'blockly'
import { javascriptGenerator, Order } from 'blockly/javascript'
import * as Ko from 'blockly/msg/ko'
import { BLOCK_INFO, BUILTIN_SOUNDS, CATEGORIES, HAT_TYPES, KEY_OPTIONS } from './blockInfo'

// 편집기 쪽에서 blocks.js만 가져다 쓰는 곳이 많아 그대로 다시 내보낸다
export { BLOCK_INFO, BUILTIN_SOUNDS, CATEGORIES, HAT_TYPES, KEY_OPTIONS }

Blockly.setLocale(Ko)
Blockly.Msg.MATH_RANDOM_INT_TITLE = '%1 부터 %2 사이의 무작위 수'
Blockly.Msg.VARIABLES_DEFAULT_NAME = '점수'
Blockly.Msg.NEW_VARIABLE = '＋ 변수 만들기'
Blockly.Msg.NEW_VARIABLE_TITLE = '새 변수 이름 (예: 점수, 목숨)'

/* ── 동적 드롭다운 (현재 프로젝트의 캐릭터/장면/소리) ── */
const ctx = { sprites: [], scenes: [], sounds: [] }

export function setBlockContext({ sprites, scenes, sounds }) {
  ctx.sprites = sprites ?? []
  ctx.scenes = scenes ?? []
  ctx.sounds = sounds ?? []
}

export function spriteLabel(s) {
  return `${s.emoji ?? '🖼️'} ${s.name}`
}

function spriteOptions() {
  if (!ctx.sprites.length) return [['(캐릭터 없음)', '__none__']]
  return ctx.sprites.map((s) => [spriteLabel(s), s.id])
}
function touchOptions() {
  return [['🧱 벽', '__wall__'], ...ctx.sprites.map((s) => [spriteLabel(s), s.id])]
}
function sceneOptions() {
  if (!ctx.scenes.length) return [['장면 1', 'scene1']]
  return ctx.scenes.map((s) => [s.name, s.id])
}
function soundOptions() {
  return [...BUILTIN_SOUNDS.map(([n, id]) => [`🔔 ${n}`, id]), ...ctx.sounds.map((s) => [`🎤 ${s.name}`, s.id])]
}

/* ── 블록 정의 도우미 ─────────────────────────── */
function tip(type) {
  const info = BLOCK_INFO[type]
  return info ? `${info.name} — ${info.tooltip}` : ''
}
// 블록에는 색 대신 스타일 이름만 준다 → 실제 색은 theme.js의 blockStyles가 정함
function styleOf(type) {
  return `${BLOCK_INFO[type].cat}_style`
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

defineHat('when_start', (input) => input.appendField('▶ 시작 버튼을 눌렀을 때'))
defineHat('when_key', (input) =>
  input.appendField(new Blockly.FieldDropdown(KEY_OPTIONS), 'KEY').appendField('키를 눌렀을 때'))
defineHat('when_clicked', (input) => input.appendField('캐릭터를 클릭했을 때'))
defineHat('when_receive', (input) =>
  input.appendField(new Blockly.FieldTextInput('신호'), 'MSG').appendField('메시지를 받았을 때'))
defineHat('when_scene_start', (input) =>
  input.appendField(new Blockly.FieldDropdown(sceneOptions), 'SCENE').appendField('장면이 시작될 때'))

// 드롭다운이 필요한 나머지 블록
Blockly.Blocks.touching = {
  init() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(touchOptions), 'TARGET')
      .appendField('에 닿았는가?')
    this.setOutput(true, 'Boolean')
    this.setStyle(styleOf('touching'))
    this.setTooltip(tip('touching'))
  },
}
Blockly.Blocks.key_pressed = {
  init() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(KEY_OPTIONS.filter(([, v]) => v !== 'any')), 'KEY')
      .appendField('키를 눌렀는가?')
    this.setOutput(true, 'Boolean')
    this.setStyle(styleOf('key_pressed'))
    this.setTooltip(tip('key_pressed'))
  },
}
Blockly.Blocks.switch_scene = {
  init() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(sceneOptions), 'SCENE')
      .appendField('장면 시작하기')
    this.setPreviousStatement(true)
    this.setNextStatement(true)
    this.setStyle(styleOf('switch_scene'))
    this.setTooltip(tip('switch_scene'))
  },
}
Blockly.Blocks.play_sound = {
  init() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown(soundOptions), 'SOUND')
      .appendField('소리 재생하기')
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
  stmt('move_x', 'x 좌표를 %1 만큼 바꾸기', [num('DX')]),
  stmt('move_y', 'y 좌표를 %1 만큼 바꾸기', [num('DY')]),
  stmt('set_dir', '%1 도 방향 보기', [num('DIR')]),
  stmt('move_steps', '%1 만큼 움직이기', [num('STEPS')]),
  stmt('turn_around', '방향 반대로 바꾸기'),
  stmt('goto_xy', 'x: %1 y: %2 위치로 이동하기', [num('X'), num('Y')]),
  stmt('goto_random', '무작위 위치로 이동하기'),
  stmt('turn_right', '오른쪽으로 %1 도 돌기', [num('DEG')]),
  { type: 'get_x', message0: 'x 좌표', output: 'Number', style: styleOf('get_x'), tooltip: tip('get_x') },
  { type: 'get_y', message0: 'y 좌표', output: 'Number', style: styleOf('get_y'), tooltip: tip('get_y') },

  stmt('say', '%1 말하기', [{ type: 'input_value', name: 'TEXT' }]),
  stmt('say_secs', '%1 을(를) %2 초 동안 말하기', [{ type: 'input_value', name: 'TEXT' }, num('SECS')]),
  stmt('show', '보이기'),
  stmt('hide', '숨기기'),
  stmt('change_size', '크기를 %1 만큼 바꾸기', [num('DS')]),
  stmt('set_size', '크기를 %1 % 로 정하기', [num('SIZE')]),

  stmt('repeat_n', '%1 번 반복하기 %2 %3',
    [num('TIMES'), { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }]),
  stmt('forever', '무한 반복하기 %1 %2',
    [{ type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }], { nextStatement: undefined }),
  stmt('wait', '%1 초 기다리기', [num('SECS')]),
  stmt('stop_all', '모두 멈추기', [], { nextStatement: undefined }),

  stmt('if_then', '만약 %1 라면 %2 %3',
    [{ type: 'input_value', name: 'COND', check: 'Boolean' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' }]),
  stmt('if_else', '만약 %1 라면 %2 %3 아니면 %4 %5',
    [{ type: 'input_value', name: 'COND', check: 'Boolean' }, { type: 'input_dummy' }, { type: 'input_statement', name: 'DO' },
      { type: 'input_dummy' }, { type: 'input_statement', name: 'ELSE' }]),

  stmt('var_set', '%1 을(를) %2 (으)로 정하기',
    [{ type: 'field_variable', name: 'VAR', variable: '점수' }, { type: 'input_value', name: 'VALUE' }]),
  stmt('var_change', '%1 을(를) %2 만큼 바꾸기',
    [{ type: 'field_variable', name: 'VAR', variable: '점수' }, num('DELTA')]),
  stmt('var_show', '변수 %1 보이기', [{ type: 'field_variable', name: 'VAR', variable: '점수' }]),
  stmt('var_hide', '변수 %1 숨기기', [{ type: 'field_variable', name: 'VAR', variable: '점수' }]),

  stmt('broadcast', '%1 메시지 보내기', [{ type: 'field_input', name: 'MSG', text: '신호' }]),
])

/* ════════════════════════════════════════════════
   코드 생성기 ('코드 보기' 패널 전용)
   ════════════════════════════════════════════════ */
const G = javascriptGenerator
const val = (b, name, fallback = '0') => G.valueToCode(b, name, Order.NONE) || fallback
const body = (b, name) => G.statementToCode(b, name)
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const varName = (b) => b.workspace.getVariableMap().getVariableById(b.getFieldValue('VAR'))?.getName() ?? '변수'
const spriteName = (b) => ctx.sprites.find((s) => s.id === b.getFieldValue('SPRITE'))?.name ?? '캐릭터'
const sceneName = (b) => ctx.scenes.find((s) => s.id === b.getFieldValue('SCENE'))?.name ?? '장면'

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
    code = `// ⚠ 이벤트 블록에 연결되지 않아서 실행되지 않아요\n${code}`
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
    const name = BUILTIN_SOUNDS.find(([, v]) => v === id)?.[0] ?? ctx.sounds.find((s) => s.id === id)?.name ?? id
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
