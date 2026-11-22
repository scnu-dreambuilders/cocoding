// frontend/src/data/typingPractice.js
// 게임존 타자게임의 연습 문구 (프론트에서만 사용, 기록·보상 없음)
//
// · text: 학생이 입력하는 목표 문구. 설명(meaning)은 입력하지 않는다.
// · 블록 구문은 블록 문구와 '똑같은 표기'가 아니다. 블록의 숫자·선택 칸을 채우고
//   숫자와 단위를 붙여 읽기 쉽게 정리한 연습 문구다 (예: '%1 번 반복하기' + 10 → '10번 반복하기').
// · source: 나중에 실제 블록 문구와 대조할 수 있게 출처를 남긴다.
//   - kind 'category': blockly/blockInfo.js의 CATEGORIES 이름
//   - kind 'term': 블록 설명(blockly/blockText.js)에 쓰인 낱말
//   - kind 'block': blockly/blockText.js의 BLOCK_LABEL 원문(original)과 채운 값(values)
// 한 단계는 10문제를 5문제씩 두 세트로 나눠, 고정된 순서로 연습한다.

export const TYPING_SET_SIZE = 5
export const TYPING_SET_COUNT = 2

export const TYPING_STAGES = [
  {
    id: 'word',
    name: '낱말 연습',
    summary: '코딩에서 자주 쓰는 낱말을 한글로 정확하게 입력해요.',
    items: [
      { id: 'w-event', text: '이벤트', meaning: '시작 버튼 누르기처럼, 블록이 실행되게 만드는 일이에요.',
        source: { kind: 'category', key: 'event', original: '이벤트' } },
      { id: 'w-move', text: '이동', meaning: '캐릭터의 위치를 바꾸는 거예요.',
        source: { kind: 'category', key: 'motion', original: '이동' } },
      { id: 'w-coord', text: '좌표', meaning: '무대 위 위치를 나타내는 숫자예요. x는 좌우, y는 위아래예요.',
        source: { kind: 'term', type: 'move_x', original: 'x 좌표를 %1 만큼 바꾸기' } },
      { id: 'w-dir', text: '방향', meaning: '캐릭터가 바라보는 쪽이에요. 90은 오른쪽이에요.',
        source: { kind: 'term', type: 'set_dir', original: '%1 도 방향 보기' } },
      { id: 'w-loop', text: '반복', meaning: '안에 넣은 블록을 여러 번 실행하는 거예요.',
        source: { kind: 'category', key: 'loop', original: '반복' } },
      { id: 'w-cond', text: '조건', meaning: '맞는지 확인해서, 맞을 때만 블록을 실행하게 하는 기준이에요.',
        source: { kind: 'category', key: 'cond', original: '조건' } },
      { id: 'w-sense', text: '감지', meaning: '벽에 닿았는지, 키를 눌렀는지 알아보는 거예요.',
        source: { kind: 'category', key: 'sensing', original: '감지' } },
      { id: 'w-var', text: '변수', meaning: '점수처럼 바뀌는 값을 기억하는 주머니예요.',
        source: { kind: 'category', key: 'variable', original: '변수' } },
      { id: 'w-msg', text: '메시지', meaning: '다른 캐릭터에게 보내는 신호예요.',
        source: { kind: 'category', key: 'message', original: '메시지·장면' } },
      { id: 'w-scene', text: '장면', meaning: '시작 화면·게임 화면처럼 작품을 나눈 화면이에요. 장면마다 배경과 실행되는 블록이 달라요.',
        source: { kind: 'term', type: 'switch_scene', original: '장면 시작하기' } },
    ],
  },
  {
    id: 'block',
    name: '블록 구문 연습',
    summary: '블록에 쓰인 말을 숫자와 띄어쓰기까지 정확하게 입력해요.',
    items: [
      { id: 'b-start', text: '시작 버튼을 눌렀을 때', meaning: '실행 버튼을 누르면 이 블록 아래에 붙인 블록들이 실행돼요.',
        source: { kind: 'block', type: 'when_start', original: '시작 버튼을 눌렀을 때', values: {} } },
      { id: 'b-movex', text: 'x 좌표를 10만큼 바꾸기', meaning: '바라보는 방향과 상관없이 캐릭터를 오른쪽으로 10만큼 옮겨요.',
        source: { kind: 'block', type: 'move_x', original: 'x 좌표를 %1 만큼 바꾸기', values: { '%1': '10' } } },
      { id: 'b-steps', text: '10만큼 움직이기', meaning: '캐릭터가 지금 바라보는 방향으로 10만큼 가요.',
        source: { kind: 'block', type: 'move_steps', original: '%1 만큼 움직이기', values: { '%1': '10' } } },
      { id: 'b-repeat', text: '10번 반복하기', meaning: '안에 넣은 블록을 10번 실행해요.',
        source: { kind: 'block', type: 'repeat_n', original: '%1 번 반복하기 %2 %3', values: { '%1': '10' } } },
      { id: 'b-wait', text: '1초 기다리기', meaning: '1초 동안 기다렸다가 다음 블록을 실행해요.',
        source: { kind: 'block', type: 'wait', original: '%1 초 기다리기', values: { '%1': '1' } } },
      { id: 'b-dir', text: '90도 방향 보기', meaning: '캐릭터가 오른쪽을 바라보게 해요.',
        source: { kind: 'block', type: 'set_dir', original: '%1 도 방향 보기', values: { '%1': '90' } } },
      { id: 'b-turn', text: '오른쪽으로 90도 돌기', meaning: '지금 바라보는 방향에서 시계 방향으로 90도 더 돌아요.',
        source: { kind: 'block', type: 'turn_right', original: '오른쪽으로 %1 도 돌기', values: { '%1': '90' } } },
      { id: 'b-touch', text: '벽에 닿았는가?', meaning: '캐릭터가 벽에 닿았는지 확인해요. ‘만약 ~라면’ 블록의 조건 칸에 끼워 써요.',
        source: { kind: 'block', type: 'touching', original: '(드롭다운) + 에 닿았는가?', values: { dropdown: '벽' } } },
      { id: 'b-random', text: '무작위 위치로 이동하기', meaning: '걸어가지 않고 무대의 아무 곳으로 순간이동해요.',
        source: { kind: 'block', type: 'goto_random', original: '무작위 위치로 이동하기', values: {} } },
      { id: 'b-forever', text: '무한 반복하기', meaning: '정지 버튼을 누를 때까지 안에 넣은 블록을 계속 반복해요.',
        source: { kind: 'block', type: 'forever', original: '무한 반복하기 %1 %2', values: {} } },
    ],
  },
]

// setIndex(0부터)번째 세트의 문제들 — 고정 순서
export const typingSet = (stage, setIndex) =>
  stage.items.slice(setIndex * TYPING_SET_SIZE, (setIndex + 1) * TYPING_SET_SIZE)
