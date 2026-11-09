/* ════════════════════════════════════════════════
   블록 로직 데이터 — 화면에 보이는 글자가 없는 것만 둔다.
   서버 재채점기(backend/grader/grade.mjs)가 이 파일을 가져간다.
   블록 이름·설명·라벨 같은 문구는 blockText.js에 있다.
   ════════════════════════════════════════════════ */

/* 아래에 블록을 붙일 수 있는 이벤트(모자) 블록 */
export const HAT_TYPES = new Set(['when_start', 'when_key', 'when_clicked', 'when_receive', 'when_scene_start'])

/* 블록이 속한 카테고리 — 팔레트 분류와 블록 색(theme.js의 blockStyles)에 쓴다 */
export const BLOCK_CATEGORY = {
  when_start:       'event',
  when_key:         'event',
  when_clicked:     'event',
  move_x:           'motion',
  move_y:           'motion',
  set_dir:          'motion',
  move_steps:       'motion',
  turn_around:      'motion',
  goto_xy:          'motion',
  goto_random:      'motion',
  turn_right:       'motion',
  get_x:            'motion',
  get_y:            'motion',
  say:              'looks',
  say_secs:         'looks',
  show:             'looks',
  hide:             'looks',
  change_size:      'looks',
  set_size:         'looks',
  play_sound:       'sound',
  repeat_n:         'loop',
  forever:          'loop',
  wait:             'loop',
  stop_all:         'loop',
  if_then:          'cond',
  if_else:          'cond',
  touching:         'sensing',
  key_pressed:      'sensing',
  var_set:          'variable',
  var_change:       'variable',
  var_show:         'variable',
  var_hide:         'variable',
  variables_get:    'variable',
  broadcast:        'message',
  when_receive:     'message',
  switch_scene:     'message',
  when_scene_start: 'message',
  logic_compare:    'op',
  math_arithmetic:  'op',
  math_random_int:  'op',
  logic_operation:  'op',
  logic_negate:     'op',
}

/* 키 블록 드롭다운에 넣을 키 값 (보이는 글자는 blockText.js의 KEY_LABEL) */
export const KEY_VALUES = [
  'ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Space', 'any',
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
]

/* 기본 제공 소리 id (보이는 이름은 blockText.js의 SOUND_LABEL) */
export const SOUND_IDS = ['sfx:jump', 'sfx:coin', 'sfx:hit', 'sfx:boom', 'sfx:win', 'sfx:lose', 'sfx:click', 'sfx:magic']
