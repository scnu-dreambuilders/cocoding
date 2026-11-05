/* ════════════════════════════════════════════════
   블록 메타데이터 — 이름·설명·카테고리처럼 Blockly 없이도 쓰는 순수 데이터.
   대시보드(챕터 카드·미션 칩)와 채점기가 이 파일만 가져가면 되므로,
   블록 편집기(blockly 라이브러리, 약 1MB)를 같이 받아오지 않는다.
   실제 블록 정의와 코드 생성기는 blockly/blocks.js에 있다.
   ════════════════════════════════════════════════ */

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
// name: 팔레트·검색·힌트에 쓰는 이름 / tooltip: 마우스 올렸을 때 한 줄 설명
// desc: 오류가 났을 때 코코가 말해주는 설명 (1~2문장)
export const BLOCK_INFO = {
  when_start:       { cat: 'event',   name: '시작 버튼을 눌렀을 때', tooltip: '▶ 실행 버튼을 누르면 아래 블록들이 실행돼요', desc: '프로그램이 시작될 때 실행되는 블록이야. 아래에 할 일을 붙여줘!' },
  when_key:         { cat: 'event',   name: '키를 눌렀을 때',       tooltip: '고른 키를 누를 때마다 아래 블록들이 실행돼요', desc: '키보드를 누르면 실행되는 블록이야. 실행 중에 키를 눌러봐!' },
  when_clicked:     { cat: 'event',   name: '캐릭터를 클릭했을 때',  tooltip: '무대에서 캐릭터를 클릭하면 실행돼요', desc: '실행 중에 무대 위 캐릭터를 클릭하면 아래 블록들이 실행돼.' },
  move_x:           { cat: 'motion',  name: 'x 좌표 바꾸기',        tooltip: '캐릭터를 좌우로 움직여요 (+는 오른쪽, -는 왼쪽)', desc: 'x 좌표를 바꾸면 캐릭터가 옆으로 움직여. 숫자가 +면 오른쪽, -면 왼쪽이야.' },
  move_y:           { cat: 'motion',  name: 'y 좌표 바꾸기',        tooltip: '캐릭터를 위아래로 움직여요 (+는 위, -는 아래)', desc: 'y 좌표를 바꾸면 캐릭터가 위아래로 움직여. 숫자가 +면 위, -면 아래야.' },
  set_dir:          { cat: 'motion',  name: '방향 보기',            tooltip: '캐릭터가 바라보는 방향을 정해요 (90=오른쪽, -90=왼쪽, 0=위, 180=아래)', desc: '방향은 각도로 정해. 90은 오른쪽, -90은 왼쪽, 0은 위, 180은 아래야.' },
  move_steps:       { cat: 'motion',  name: '만큼 움직이기',        tooltip: '캐릭터가 바라보는 방향으로 움직여요', desc: '캐릭터가 지금 바라보는 방향으로 앞으로 가. 방향 보기 블록과 같이 써봐!' },
  turn_around:      { cat: 'motion',  name: '방향 반대로 바꾸기',   tooltip: '캐릭터가 뒤로 돌아요', desc: '바라보는 방향을 반대로 바꿔. 벽에 닿았을 때 쓰면 튕기는 것처럼 보여!' },
  goto_xy:          { cat: 'motion',  name: '위치로 이동하기',      tooltip: '정해진 x, y 위치로 순간이동해요', desc: 'x는 -240~240, y는 -180~180 사이 숫자를 넣어야 무대 안에 있어.' },
  goto_random:      { cat: 'motion',  name: '무작위 위치로 이동하기', tooltip: '무대 아무 곳으로 순간이동해요', desc: '무대 안의 아무 위치로 이동해. 동전이 여기저기 나타나게 할 때 좋아!' },
  turn_right:       { cat: 'motion',  name: '도 돌기',              tooltip: '시계 방향으로 회전해요', desc: '숫자만큼 오른쪽(시계 방향)으로 돌아.' },
  get_x:            { cat: 'motion',  name: 'x 좌표 값',            tooltip: '캐릭터의 지금 x 좌표', desc: '캐릭터의 지금 x 좌표 값이야.' },
  get_y:            { cat: 'motion',  name: 'y 좌표 값',            tooltip: '캐릭터의 지금 y 좌표', desc: '캐릭터의 지금 y 좌표 값이야.' },
  say:              { cat: 'looks',   name: '말하기',               tooltip: '캐릭터가 말풍선으로 말해요', desc: '말풍선에 글자를 보여줘. 빈칸이면 말풍선이 사라져.' },
  say_secs:         { cat: 'looks',   name: '초 동안 말하기',        tooltip: '정해진 시간 동안 말하고 말풍선을 지워요', desc: '숫자만큼 기다렸다가 말풍선이 사라져. 시간 칸에는 숫자를 넣어줘.' },
  show:             { cat: 'looks',   name: '보이기',               tooltip: '캐릭터를 무대에 보여줘요', desc: '숨겨진 캐릭터를 다시 보이게 해.' },
  hide:             { cat: 'looks',   name: '숨기기',               tooltip: '캐릭터를 무대에서 숨겨요', desc: '캐릭터를 안 보이게 해. 숨긴 캐릭터는 다른 캐릭터에 닿지 않아.' },
  change_size:      { cat: 'looks',   name: '크기 바꾸기',          tooltip: '캐릭터 크기를 키우거나 줄여요', desc: '숫자만큼 크기가 바뀌어. -를 넣으면 작아져.' },
  set_size:         { cat: 'looks',   name: '크기 정하기',          tooltip: '캐릭터 크기를 %로 정해요 (100이 원래 크기)', desc: '100이 원래 크기야. 10~300 사이로 넣어봐.' },
  play_sound:       { cat: 'sound',   name: '소리 재생하기',        tooltip: '효과음이나 내가 녹음한 소리를 재생해요', desc: '고른 소리를 재생해. 🎵 소리 버튼에서 직접 녹음할 수도 있어!' },
  repeat_n:         { cat: 'loop',    name: '번 반복하기',          tooltip: '안에 있는 블록들을 정해진 횟수만큼 반복해요', desc: '안에 넣은 블록을 숫자만큼 반복해. 횟수에는 0 이상의 숫자를 넣어줘.' },
  forever:          { cat: 'loop',    name: '무한 반복하기',        tooltip: '안에 있는 블록들을 멈출 때까지 계속 반복해요', desc: '■ 정지 버튼을 누를 때까지 안의 블록을 계속 반복해.' },
  wait:             { cat: 'loop',    name: '초 기다리기',          tooltip: '정해진 시간 동안 기다려요', desc: '숫자(초)만큼 기다렸다가 다음 블록을 실행해.' },
  stop_all:         { cat: 'loop',    name: '모두 멈추기',          tooltip: '프로그램을 완전히 멈춰요', desc: '모든 실행을 멈춰. 게임이 끝났을 때 써봐.' },
  if_then:          { cat: 'cond',    name: '만약 ~라면',           tooltip: '조건이 맞을 때만 안에 있는 블록들을 실행해요', desc: '육각형 칸에 조건 블록(예: 벽에 닿았는가?)을 끼워야 해!' },
  if_else:          { cat: 'cond',    name: '만약 ~라면 / 아니면',   tooltip: '조건이 맞으면 위쪽, 아니면 아래쪽 블록을 실행해요', desc: '조건이 참이면 위쪽, 거짓이면 아래쪽이 실행돼. 육각형 칸에 조건을 넣어줘.' },
  touching:         { cat: 'sensing', name: '에 닿았는가?',         tooltip: '벽이나 다른 캐릭터에 닿았는지 확인해요', desc: '닿았으면 참, 아니면 거짓이야. "만약 ~라면" 블록의 조건 칸에 끼워 써.' },
  key_pressed:      { cat: 'sensing', name: '키를 눌렀는가?',       tooltip: '지금 키보드 키를 누르고 있는지 확인해요', desc: '키를 누르고 있으면 참이야. 무한 반복 안에서 쓰면 부드럽게 움직일 수 있어.' },
  var_set:          { cat: 'variable', name: '변수 정하기',         tooltip: '변수에 새로운 값을 넣어요', desc: '변수(값을 기억하는 주머니)에 숫자를 넣어. 보통 시작할 때 0으로 정해.' },
  var_change:       { cat: 'variable', name: '변수 바꾸기',         tooltip: '변수 값을 더하거나 빼요', desc: '변수에 숫자만큼 더해. -1을 넣으면 1씩 줄어들어.' },
  var_show:         { cat: 'variable', name: '변수 보이기',         tooltip: '무대에 변수 값을 표시해요', desc: '무대 왼쪽 위에 변수 값을 보여줘.' },
  var_hide:         { cat: 'variable', name: '변수 숨기기',         tooltip: '무대에서 변수 표시를 숨겨요', desc: '무대에 보이던 변수 값을 숨겨.' },
  variables_get:    { cat: 'variable', name: '변수 값',             tooltip: '변수에 들어있는 값', desc: '변수에 들어있는 값이야. 숫자 칸에 끼워서 쓸 수 있어.' },
  broadcast:        { cat: 'message', name: '메시지 보내기',        tooltip: '다른 캐릭터에게 신호를 보내요', desc: '신호를 보내면 같은 이름의 "메시지를 받았을 때" 블록이 실행돼.' },
  when_receive:     { cat: 'message', name: '메시지를 받았을 때',    tooltip: '신호를 받으면 아래 블록들을 실행해요', desc: '보낸 메시지와 이름이 똑같아야 받을 수 있어!' },
  switch_scene:     { cat: 'message', name: '장면 시작하기',        tooltip: '다른 장면으로 넘어가요', desc: '무대 배경이 고른 장면으로 바뀌고, 그 장면의 "장면이 시작될 때" 블록이 실행돼.' },
  when_scene_start: { cat: 'message', name: '장면이 시작될 때',      tooltip: '그 장면으로 바뀌면 아래 블록들을 실행해요', desc: '장면이 바뀔 때 실행돼. 첫 장면은 프로그램이 시작될 때 실행돼.' },
  logic_compare:    { cat: 'op',      name: '비교하기 (=, <, >)',    tooltip: '두 값을 비교해요', desc: '양쪽 칸에 값을 넣어서 비교해. 예: 점수 = 10' },
  math_arithmetic:  { cat: 'op',      name: '계산하기 (+, -, ×, ÷)', tooltip: '두 수를 계산해요', desc: '양쪽 칸에 숫자를 넣어야 계산할 수 있어.' },
  math_random_int:  { cat: 'op',      name: '무작위 수',            tooltip: '두 수 사이의 아무 수나 골라요', desc: '두 숫자 사이에서 아무 수나 하나 골라.' },
  logic_operation:  { cat: 'op',      name: '그리고 / 또는',        tooltip: '두 조건을 합쳐요', desc: '양쪽 칸에 조건 블록을 끼워야 해.' },
  logic_negate:     { cat: 'op',      name: '~가 아니다',           tooltip: '조건을 반대로 바꿔요', desc: '참은 거짓으로, 거짓은 참으로 바꿔. 칸에 조건을 끼워줘.' },
}

export const HAT_TYPES = new Set(['when_start', 'when_key', 'when_clicked', 'when_receive', 'when_scene_start'])

export const BUILTIN_SOUNDS = [
  ['점프', 'sfx:jump'], ['동전', 'sfx:coin'], ['충돌', 'sfx:hit'], ['폭발', 'sfx:boom'],
  ['성공', 'sfx:win'], ['실패', 'sfx:lose'], ['클릭', 'sfx:click'], ['마법', 'sfx:magic'],
]

export const KEY_OPTIONS = [
  ['→ 오른쪽 화살표', 'ArrowRight'], ['← 왼쪽 화살표', 'ArrowLeft'],
  ['↑ 위쪽 화살표', 'ArrowUp'], ['↓ 아래쪽 화살표', 'ArrowDown'],
  ['스페이스', 'Space'], ['아무 키', 'any'],
  ...'abcdefghijklmnopqrstuvwxyz'.split('').map((c) => [c.toUpperCase(), c]),
]
