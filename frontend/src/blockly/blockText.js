/* ════════════════════════════════════════════════
   블록에 보이는 모든 글자 — 이름·툴팁·설명·블록 라벨·드롭다운 글자.
   디자인·문구를 고칠 때 이 파일만 보면 된다.

   t()로 감싼 문구는 채점기 빌드(grader/vite.config.js)에서 빈 칸으로 바뀐다.
   그래서 여기 문구를 고쳐도 backend/grader/grade.mjs는 그대로다.
   새 문구를 넣을 때도 반드시 t()로 감쌀 것. %1, %2는 블록의 입력 칸 자리라 지우면 안 된다.
   ════════════════════════════════════════════════ */
import { KEY_VALUES, SOUND_IDS } from './blockDefs'

const t = (s) => s

/* ── 팔레트·검색·힌트에 쓰는 블록 이름 ─────────── */
export const BLOCK_NAME = {
  when_start:       t('시작 버튼을 눌렀을 때'),
  when_key:         t('키를 눌렀을 때'),
  when_clicked:     t('캐릭터를 클릭했을 때'),
  move_x:           t('x 좌표 바꾸기'),
  move_y:           t('y 좌표 바꾸기'),
  set_dir:          t('방향 보기'),
  move_steps:       t('만큼 움직이기'),
  turn_around:      t('방향 반대로 바꾸기'),
  goto_xy:          t('위치로 이동하기'),
  goto_random:      t('무작위 위치로 이동하기'),
  turn_right:       t('도 돌기'),
  get_x:            t('x 좌표 값'),
  get_y:            t('y 좌표 값'),
  say:              t('말하기'),
  say_secs:         t('초 동안 말하기'),
  show:             t('보이기'),
  hide:             t('숨기기'),
  change_size:      t('크기 바꾸기'),
  set_size:         t('크기 정하기'),
  play_sound:       t('소리 재생하기'),
  repeat_n:         t('번 반복하기'),
  forever:          t('무한 반복하기'),
  wait:             t('초 기다리기'),
  stop_all:         t('모두 멈추기'),
  if_then:          t('만약 ~라면'),
  if_else:          t('만약 ~라면 / 아니면'),
  touching:         t('에 닿았는가?'),
  key_pressed:      t('키를 눌렀는가?'),
  var_set:          t('변수 정하기'),
  var_change:       t('변수 바꾸기'),
  var_show:         t('변수 보이기'),
  var_hide:         t('변수 숨기기'),
  variables_get:    t('변수 값'),
  broadcast:        t('메시지 보내기'),
  when_receive:     t('메시지를 받았을 때'),
  switch_scene:     t('장면 시작하기'),
  when_scene_start: t('장면이 시작될 때'),
  logic_compare:    t('비교하기 (=, <, >)'),
  math_arithmetic:  t('계산하기 (+, -, ×, ÷)'),
  math_random_int:  t('무작위 수'),
  logic_operation:  t('그리고 / 또는'),
  logic_negate:     t('~가 아니다'),
}

/* ── 마우스를 올렸을 때 나오는 한 줄 설명 ──────── */
export const BLOCK_TOOLTIP = {
  when_start:       t('▶ 실행 버튼을 누르면 아래 블록들이 실행돼요'),
  when_key:         t('고른 키를 누를 때마다 아래 블록들이 실행돼요'),
  when_clicked:     t('무대에서 캐릭터를 클릭하면 실행돼요'),
  move_x:           t('캐릭터를 좌우로 움직여요 (+는 오른쪽, -는 왼쪽)'),
  move_y:           t('캐릭터를 위아래로 움직여요 (+는 위, -는 아래)'),
  set_dir:          t('캐릭터가 바라보는 방향을 정해요 (90=오른쪽, -90=왼쪽, 0=위, 180=아래)'),
  move_steps:       t('캐릭터가 바라보는 방향으로 움직여요'),
  turn_around:      t('캐릭터가 뒤로 돌아요'),
  goto_xy:          t('정해진 x, y 위치로 순간이동해요'),
  goto_random:      t('무대 아무 곳으로 순간이동해요'),
  turn_right:       t('시계 방향으로 회전해요'),
  get_x:            t('캐릭터의 지금 x 좌표'),
  get_y:            t('캐릭터의 지금 y 좌표'),
  say:              t('캐릭터가 말풍선으로 말해요'),
  say_secs:         t('정해진 시간 동안 말하고 말풍선을 지워요'),
  show:             t('캐릭터를 무대에 보여줘요'),
  hide:             t('캐릭터를 무대에서 숨겨요'),
  change_size:      t('캐릭터 크기를 키우거나 줄여요'),
  set_size:         t('캐릭터 크기를 %로 정해요 (100이 원래 크기)'),
  play_sound:       t('효과음이나 내가 녹음한 소리를 재생해요'),
  repeat_n:         t('안에 있는 블록들을 정해진 횟수만큼 반복해요'),
  forever:          t('안에 있는 블록들을 멈출 때까지 계속 반복해요'),
  wait:             t('정해진 시간 동안 기다려요'),
  stop_all:         t('프로그램을 완전히 멈춰요'),
  if_then:          t('조건이 맞을 때만 안에 있는 블록들을 실행해요'),
  if_else:          t('조건이 맞으면 위쪽, 아니면 아래쪽 블록을 실행해요'),
  touching:         t('벽이나 다른 캐릭터에 닿았는지 확인해요'),
  key_pressed:      t('지금 키보드 키를 누르고 있는지 확인해요'),
  var_set:          t('변수에 새로운 값을 넣어요'),
  var_change:       t('변수 값을 더하거나 빼요'),
  var_show:         t('무대에 변수 값을 표시해요'),
  var_hide:         t('무대에서 변수 표시를 숨겨요'),
  variables_get:    t('변수에 들어있는 값'),
  broadcast:        t('다른 캐릭터에게 신호를 보내요'),
  when_receive:     t('신호를 받으면 아래 블록들을 실행해요'),
  switch_scene:     t('다른 장면으로 넘어가요'),
  when_scene_start: t('그 장면으로 바뀌면 아래 블록들을 실행해요'),
  logic_compare:    t('두 값을 비교해요'),
  math_arithmetic:  t('두 수를 계산해요'),
  math_random_int:  t('두 수 사이의 아무 수나 골라요'),
  logic_operation:  t('두 조건을 합쳐요'),
  logic_negate:     t('조건을 반대로 바꿔요'),
}

/* ── 오류가 났을 때 코코가 말해주는 설명 ───────── */
export const BLOCK_DESC = {
  when_start:       t('프로그램이 시작될 때 실행되는 블록이야. 아래에 할 일을 붙여줘!'),
  when_key:         t('키보드를 누르면 실행되는 블록이야. 실행 중에 키를 눌러봐!'),
  when_clicked:     t('실행 중에 무대 위 캐릭터를 클릭하면 아래 블록들이 실행돼.'),
  move_x:           t('x 좌표를 바꾸면 캐릭터가 옆으로 움직여. 숫자가 +면 오른쪽, -면 왼쪽이야.'),
  move_y:           t('y 좌표를 바꾸면 캐릭터가 위아래로 움직여. 숫자가 +면 위, -면 아래야.'),
  set_dir:          t('방향은 각도로 정해. 90은 오른쪽, -90은 왼쪽, 0은 위, 180은 아래야.'),
  move_steps:       t('캐릭터가 지금 바라보는 방향으로 앞으로 가. 방향 보기 블록과 같이 써봐!'),
  turn_around:      t('바라보는 방향을 반대로 바꿔. 벽에 닿았을 때 쓰면 튕기는 것처럼 보여!'),
  goto_xy:          t('x는 -240~240, y는 -180~180 사이 숫자를 넣어야 무대 안에 있어.'),
  goto_random:      t('무대 안의 아무 위치로 이동해. 동전이 여기저기 나타나게 할 때 좋아!'),
  turn_right:       t('숫자만큼 오른쪽(시계 방향)으로 돌아.'),
  get_x:            t('캐릭터의 지금 x 좌표 값이야.'),
  get_y:            t('캐릭터의 지금 y 좌표 값이야.'),
  say:              t('말풍선에 글자를 보여줘. 빈칸이면 말풍선이 사라져.'),
  say_secs:         t('숫자만큼 기다렸다가 말풍선이 사라져. 시간 칸에는 숫자를 넣어줘.'),
  show:             t('숨겨진 캐릭터를 다시 보이게 해.'),
  hide:             t('캐릭터를 안 보이게 해. 숨긴 캐릭터는 다른 캐릭터에 닿지 않아.'),
  change_size:      t('숫자만큼 크기가 바뀌어. -를 넣으면 작아져.'),
  set_size:         t('100이 원래 크기야. 10~300 사이로 넣어봐.'),
  play_sound:       t('고른 소리를 재생해. 🎵 소리 버튼에서 직접 녹음할 수도 있어!'),
  repeat_n:         t('안에 넣은 블록을 숫자만큼 반복해. 횟수에는 0 이상의 숫자를 넣어줘.'),
  forever:          t('■ 정지 버튼을 누를 때까지 안의 블록을 계속 반복해.'),
  wait:             t('숫자(초)만큼 기다렸다가 다음 블록을 실행해.'),
  stop_all:         t('모든 실행을 멈춰. 게임이 끝났을 때 써봐.'),
  if_then:          t('육각형 칸에 조건 블록(예: 벽에 닿았는가?)을 끼워야 해!'),
  if_else:          t('조건이 참이면 위쪽, 거짓이면 아래쪽이 실행돼. 육각형 칸에 조건을 넣어줘.'),
  touching:         t('닿았으면 참, 아니면 거짓이야. "만약 ~라면" 블록의 조건 칸에 끼워 써.'),
  key_pressed:      t('키를 누르고 있으면 참이야. 무한 반복 안에서 쓰면 부드럽게 움직일 수 있어.'),
  var_set:          t('변수(값을 기억하는 주머니)에 숫자를 넣어. 보통 시작할 때 0으로 정해.'),
  var_change:       t('변수에 숫자만큼 더해. -1을 넣으면 1씩 줄어들어.'),
  var_show:         t('무대 왼쪽 위에 변수 값을 보여줘.'),
  var_hide:         t('무대에 보이던 변수 값을 숨겨.'),
  variables_get:    t('변수에 들어있는 값이야. 숫자 칸에 끼워서 쓸 수 있어.'),
  broadcast:        t('신호를 보내면 같은 이름의 "메시지를 받았을 때" 블록이 실행돼.'),
  when_receive:     t('보낸 메시지와 이름이 똑같아야 받을 수 있어!'),
  switch_scene:     t('무대 배경이 고른 장면으로 바뀌고, 그 장면의 "장면이 시작될 때" 블록이 실행돼.'),
  when_scene_start: t('장면이 바뀔 때 실행돼. 첫 장면은 프로그램이 시작될 때 실행돼.'),
  logic_compare:    t('양쪽 칸에 값을 넣어서 비교해. 예: 점수 = 10'),
  math_arithmetic:  t('양쪽 칸에 숫자를 넣어야 계산할 수 있어.'),
  math_random_int:  t('두 숫자 사이에서 아무 수나 하나 골라.'),
  logic_operation:  t('양쪽 칸에 조건 블록을 끼워야 해.'),
  logic_negate:     t('참은 거짓으로, 거짓은 참으로 바꿔. 칸에 조건을 끼워줘.'),
}

/* ── 키·소리 드롭다운에 보이는 글자 ────────────── */
const KEY_LABEL = {
  ArrowRight: t('→ 오른쪽 화살표'),
  ArrowLeft:  t('← 왼쪽 화살표'),
  ArrowUp:    t('↑ 위쪽 화살표'),
  ArrowDown:  t('↓ 아래쪽 화살표'),
  Space:      t('스페이스'),
  any:        t('아무 키'),
}
const SOUND_LABEL = {
  'sfx:jump':  t('점프'),
  'sfx:coin':  t('동전'),
  'sfx:hit':   t('충돌'),
  'sfx:boom':  t('폭발'),
  'sfx:win':   t('성공'),
  'sfx:lose':  t('실패'),
  'sfx:click': t('클릭'),
  'sfx:magic': t('마법'),
}
// 알파벳 키는 글자 그대로 보여준다
export const keyOptions = () => KEY_VALUES.map((v) => [KEY_LABEL[v] || v.toUpperCase(), v])
export const soundOptions = () => SOUND_IDS.map((id) => [SOUND_LABEL[id], id])

/* ── 블록에 적히는 글자 ──────────────────────────
   %1, %2는 숫자나 블록을 끼우는 칸이다. 순서와 개수를 바꾸면 블록이 깨진다. */
export const BLOCK_LABEL = {
  when_start:        t('▶ 시작 버튼을 눌렀을 때'),
  when_key_suffix:   t('키를 눌렀을 때'),
  when_clicked:      t('캐릭터를 클릭했을 때'),
  when_receive_suffix: t('메시지를 받았을 때'),
  when_scene_start_suffix: t('장면이 시작될 때'),
  touching_suffix:   t('에 닿았는가?'),
  key_pressed_suffix: t('키를 눌렀는가?'),
  switch_scene_suffix: t('장면 시작하기'),
  play_sound_suffix: t('소리 재생하기'),

  move_x:      t('x 좌표를 %1 만큼 바꾸기'),
  move_y:      t('y 좌표를 %1 만큼 바꾸기'),
  set_dir:     t('%1 도 방향 보기'),
  move_steps:  t('%1 만큼 움직이기'),
  turn_around: t('방향 반대로 바꾸기'),
  goto_xy:     t('x: %1 y: %2 위치로 이동하기'),
  goto_random: t('무작위 위치로 이동하기'),
  turn_right:  t('오른쪽으로 %1 도 돌기'),
  get_x:       t('x 좌표'),
  get_y:       t('y 좌표'),
  say:         t('%1 말하기'),
  say_secs:    t('%1 을(를) %2 초 동안 말하기'),
  show:        t('보이기'),
  hide:        t('숨기기'),
  change_size: t('크기를 %1 만큼 바꾸기'),
  set_size:    t('크기를 %1 % 로 정하기'),
  repeat_n:    t('%1 번 반복하기 %2 %3'),
  forever:     t('무한 반복하기 %1 %2'),
  wait:        t('%1 초 기다리기'),
  stop_all:    t('모두 멈추기'),
  if_then:     t('만약 %1 라면 %2 %3'),
  if_else:     t('만약 %1 라면 %2 %3 아니면 %4 %5'),
  var_set:     t('%1 을(를) %2 (으)로 정하기'),
  var_change:  t('%1 을(를) %2 만큼 바꾸기'),
  var_show:    t('변수 %1 보이기'),
  var_hide:    t('변수 %1 숨기기'),
  broadcast:   t('%1 메시지 보내기'),
}

/* ── 드롭다운의 고정 항목과 Blockly 기본 문구 ──── */
export const DROPDOWN_TEXT = {
  noSprite:     t('(캐릭터 없음)'),
  wall:         t('🧱 벽'),
  defaultScene: t('장면 1'),
  builtinSound: t('🔔'),
  recordedSound: t('🎤'),
}
export const BLOCKLY_TEXT = {
  randomInt:       t('%1 부터 %2 사이의 무작위 수'),
  newVariable:     t('＋ 변수 만들기'),
  newVariableTitle: t('새 변수 이름 (예: 점수, 목숨)'),
}
/* 이벤트 블록에 붙지 않은 블록 묶음에 '코드 보기'에서 다는 설명 */
export const UNCONNECTED_NOTE = t('⚠ 이벤트 블록에 연결되지 않아서 실행되지 않아요')

/* '코드 보기' 패널에서 이름을 못 찾았을 때 대신 보여줄 말 */
export const CODE_FALLBACK = {
  variable: t('변수'),
  sprite:   t('캐릭터'),
  scene:    t('장면'),
}
