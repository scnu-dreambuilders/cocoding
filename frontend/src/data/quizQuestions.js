// frontend/src/data/quizQuestions.js
// 게임존 '챕터별 복습 퀴즈'의 정적 문제 데이터 (프론트에서만 사용 — 저장·보상·챕터 진행과 무관)
//
// · 챕터마다 5문제: 개념 확인 2 → 결과 예상 2 → 오류 찾기 1 (이 순서로 낸다)
// · 블록 문구는 blockly/blockText.js의 문구에 숫자·이름을 채워 읽기 쉽게 다듬은 표기다.
//   실제 동작은 engine/runtime.js 기준 (방향 90 = 오른쪽, 좌표는 ±240·±180에서 멈춤,
//   메시지는 이름이 같은 '받았을 때'에만 전달, '만큼 바꾸기'는 지금 값에 더하기).
// · 문제 모양
//   setup:   상황 한두 문장 (없으면 생략)
//   code:    블록 묶음 목록 [{ who?, lines }] — line은 { text, inner? } (inner = 반복·조건 안쪽)
//   options: 보기 3개, 보기마다 고정 id — 정답은 answerId로 연결한다 (글자 비교 아님)

export const QUIZ_SET_SIZE = 5

export const QUIZ_TYPE_LABEL = { concept: '개념 확인', predict: '결과 예상', debug: '오류 찾기' }

// 챕터 선택 카드의 짧은 설명 (챕터 제목은 data/chapterText.js에서 가져온다)
export const QUIZ_CHAPTER_SUMMARY = {
  1: '좌표와 방향을 복습해요.',
  2: '횟수 반복과 무한 반복을 복습해요.',
  3: '조건과 벽에서 튕기기를 복습해요.',
  4: '변수로 점수 세기를 복습해요.',
  5: '메시지와 장면 바꾸기를 복습해요.',
}

const opt = (a, b, c) => [{ id: 'a', text: a }, { id: 'b', text: b }, { id: 'c', text: c }]
const L = (text, inner) => (inner ? { text, inner } : { text })

export const QUIZ_QUESTIONS = [
  // ── 챕터 1. 이동과 방향 ──────────────────────
  {
    id: 'c1-y-up', chapter: 1, type: 'concept',
    setup: '코코는 무대 가운데(x 0, y 0)에 있어요.',
    question: '‘y 좌표를 10만큼 바꾸기’를 실행하면 코코는 어느 쪽으로 움직일까요?',
    options: opt('위쪽', '아래쪽', '오른쪽'), answerId: 'a',
    explain: 'y가 커지면 위쪽으로 가요. 아래로 가려면 y 좌표를 -10만큼 바꿔요.',
  },
  {
    id: 'c1-set-dir', chapter: 1, type: 'concept',
    setup: '코코는 무대 가운데(x 0, y 0)에 있어요.',
    question: '‘90도 방향 보기’만 실행하면 코코는 어떻게 될까요?',
    options: opt('자리는 그대로이고, 오른쪽을 바라봐요', '오른쪽으로 90만큼 움직여요', '위쪽으로 90만큼 움직여요'), answerId: 'a',
    explain: '방향 보기는 바라보는 쪽만 바꾸고 위치는 그대로예요. 90도는 오른쪽이에요.',
  },
  {
    id: 'c1-minus', chapter: 1, type: 'predict',
    setup: '코코는 x 0에 있어요. 벽에는 닿지 않아요.',
    code: [{ lines: [L('시작 버튼을 눌렀을 때'), L('x 좌표를 10만큼 바꾸기'), L('x 좌표를 10만큼 바꾸기'), L('x 좌표를 -10만큼 바꾸기')] }],
    question: '실행이 끝나면 코코의 x 좌표는 얼마일까요?',
    options: opt('10', '30', '-10'), answerId: 'a',
    explain: '10 + 10 - 10 = 10이에요. -10은 왼쪽으로 10만큼 가는 거예요.',
  },
  {
    id: 'c1-xy', chapter: 1, type: 'predict',
    setup: '코코는 무대 가운데(x 0, y 0)에 있어요.',
    code: [{ lines: [L('시작 버튼을 눌렀을 때'), L('y 좌표를 20만큼 바꾸기'), L('x 좌표를 10만큼 바꾸기')] }],
    question: '실행이 끝나면 코코는 어디에 있을까요?',
    options: opt('x 10, y 20', 'x 20, y 10', 'x 10, y -20'), answerId: 'a',
    explain: 'x는 왼쪽·오른쪽, y는 위·아래예요. 위로 20, 오른쪽으로 10만큼 갔어요.',
  },
  {
    id: 'c1-arrow-bug', chapter: 1, type: 'debug',
    setup: '← 키를 누르면 코코가 왼쪽으로 가야 하는데, 오른쪽으로 가요.',
    code: [
      { lines: [L('→ 키를 눌렀을 때'), L('x 좌표를 10만큼 바꾸기')] },
      { lines: [L('← 키를 눌렀을 때'), L('x 좌표를 10만큼 바꾸기')] },
      { lines: [L('↑ 키를 눌렀을 때'), L('y 좌표를 10만큼 바꾸기')] },
      { lines: [L('↓ 키를 눌렀을 때'), L('y 좌표를 -10만큼 바꾸기')] },
    ],
    question: '어떻게 고치면 될까요?',
    options: opt('← 키 아래 블록의 10을 -10으로 바꿔요', '→ 키 아래 블록의 10을 -10으로 바꿔요', '← 키 아래 블록을 y 좌표 바꾸기로 바꿔요'), answerId: 'a',
    explain: '왼쪽으로 가려면 x를 줄여야 해요. 마이너스(-)를 붙이면 반대 방향이에요.',
  },

  // ── 챕터 2. 반복 ─────────────────────────────
  {
    id: 'c2-why-repeat', chapter: 2, type: 'concept',
    question: '같은 블록을 여러 번 이어 붙이는 대신 무엇을 쓰면 좋을까요?',
    options: opt('반복 블록 안에 넣고 횟수를 정해요', '블록 순서를 거꾸로 바꿔요', '기다리기 블록을 넣어요'), answerId: 'a',
    explain: '반복 블록은 안에 넣은 블록을 정한 횟수만큼 되풀이해요.',
  },
  {
    id: 'c2-forever', chapter: 2, type: 'concept',
    question: '‘3번 반복하기’와 ‘무한 반복하기’는 무엇이 다를까요?',
    options: opt('3번 반복은 3번 하고 끝나고, 무한 반복은 멈출 때까지 계속해요', '둘 다 3번 하고 끝나요', '무한 반복은 한 번만 실행해요'), answerId: 'a',
    explain: '무한 반복은 정지 버튼을 누를 때까지 계속 되풀이해요.',
  },
  {
    id: 'c2-steps', chapter: 2, type: 'predict',
    setup: '코코는 오른쪽을 보고 있어요. 벽에는 닿지 않아요.',
    code: [{ lines: [L('시작 버튼을 눌렀을 때'), L('3번 반복하기', [L('10만큼 움직이기')])] }],
    question: '코코는 모두 얼마만큼 움직일까요?',
    options: opt('30', '13', '10'), answerId: 'a',
    explain: '10만큼 움직이기를 세 번 하니까 10 + 10 + 10 = 30이에요.',
  },
  {
    id: 'c2-round-trip', chapter: 2, type: 'predict',
    setup: '코코는 x 0에서 시작해요. 아래 블록 말고 다른 블록은 실행되지 않아요.',
    code: [{ lines: [L('시작 버튼을 눌렀을 때'), L('2번 반복하기', [
      L('x 좌표를 50만큼 바꾸기'), L('0.5초 기다리기'), L('x 좌표를 -50만큼 바꾸기'), L('0.5초 기다리기'),
    ])] }],
    question: '코코는 몇 번 왕복할까요?',
    options: opt('2번', '4번', '1번'), answerId: 'a',
    explain: '반복 안의 네 블록이 오른쪽에 갔다가 돌아오는 한 번 왕복이에요. 이걸 2번 해요.',
  },
  {
    id: 'c2-outside-bug', chapter: 2, type: 'debug',
    setup: '코코가 오른쪽과 왼쪽을 번갈아 10번 오가게 하고 싶어요. 그런데 오른쪽 이동은 반복되지만, 왼쪽 이동은 마지막에 한 번만 실행돼요.',
    code: [{ lines: [
      L('시작 버튼을 눌렀을 때'),
      L('10번 반복하기', [L('x 좌표를 50만큼 바꾸기'), L('0.5초 기다리기')]),
      L('x 좌표를 -50만큼 바꾸기'), L('0.5초 기다리기'),
    ] }],
    question: '왜 그럴까요?',
    options: opt('왼쪽 이동 블록이 반복 바깥에 있어서', '반복 횟수가 10이라서', '기다리기 블록이 있어서'), answerId: 'a',
    explain: '반복 안에 있는 블록만 되풀이돼요. 왼쪽 이동 블록도 반복 안으로 넣어야 해요.',
  },

  // ── 챕터 3. 조건 ─────────────────────────────
  {
    id: 'c3-when-true', chapter: 3, type: 'concept',
    question: '‘만약 벽에 닿았는가? 라면’ 안에 넣은 블록은 언제 실행될까요?',
    options: opt('벽에 닿았을 때만', '언제나', '벽에 닿지 않았을 때만'), answerId: 'a',
    explain: '조건이 맞을 때만 안쪽 블록을 실행해요.',
  },
  {
    id: 'c3-why-turn', chapter: 3, type: 'concept',
    question: '공이 벽에 닿았을 때 ‘방향 반대로 바꾸기’를 하는 까닭은 무엇일까요?',
    options: opt('벽에서 튕겨 반대쪽으로 다시 움직이게 하려고', '공을 멈추려고', '공을 숨기려고'), answerId: 'a',
    explain: '방향이 반대가 되면 다음 움직이기에서 반대쪽으로 가요.',
  },
  {
    id: 'c3-skip', chapter: 3, type: 'predict',
    setup: '공은 무대 가운데에 있고, 벽에 닿지 않았어요.',
    code: [{ lines: [
      L('시작 버튼을 눌렀을 때'),
      L('만약 벽에 닿았는가? 라면', [L('‘벽이다!’ 말하기')]),
      L('‘출발!’ 말하기'),
    ] }],
    question: '공은 무엇을 말할까요?',
    options: opt('‘출발!’만 말해요', '‘벽이다!’를 말한 다음 ‘출발!’을 말해요', '아무 말도 하지 않아요'), answerId: 'a',
    explain: '조건이 맞지 않으면 안쪽 블록은 건너뛰고, 아래 블록을 실행해요.',
  },
  {
    id: 'c3-bounce', chapter: 3, type: 'predict',
    setup: '공은 오른쪽을 보고 있고, 오른쪽 벽에 닿아 있어요.',
    code: [{ lines: [
      L('시작 버튼을 눌렀을 때'),
      L('만약 벽에 닿았는가? 라면', [L('방향 반대로 바꾸기')]),
      L('10만큼 움직이기'),
    ] }],
    question: '공은 어느 쪽으로 움직일까요?',
    options: opt('왼쪽으로 10만큼', '오른쪽으로 10만큼', '움직이지 않아요'), answerId: 'a',
    explain: '벽에 닿았으니 방향이 반대로 바뀌어 왼쪽을 봐요. 그래서 왼쪽으로 움직여요.',
  },
  {
    id: 'c3-outside-bug', chapter: 3, type: 'debug',
    setup: '공은 무대 가운데에서 오른쪽을 보고 시작해요. 처음에는 벽에 닿지 않았어요. 그런데 오른쪽 벽에 닿아도 튕기지 않아요.',
    code: [{ lines: [
      L('시작 버튼을 눌렀을 때'),
      L('만약 벽에 닿았는가? 라면', [L('방향 반대로 바꾸기')]),
      L('무한 반복하기', [L('6만큼 움직이기')]),
    ] }],
    question: '왜 그럴까요?',
    options: opt('조건이 반복 바깥에 있어서 처음에 한 번만 확인해요', '6이 너무 작은 숫자라서', '‘방향 반대로 바꾸기’가 잘못된 블록이라서'), answerId: 'a',
    explain: '움직이는 동안 계속 확인하려면 ‘만약’ 블록을 무한 반복 안에 넣어야 해요.',
  },

  // ── 챕터 4. 변수 ─────────────────────────────
  {
    id: 'c4-what-var', chapter: 4, type: 'concept',
    question: '변수 ‘점수’는 어떤 일을 할까요?',
    options: opt('바뀌는 값을 기억해요', '캐릭터를 움직여요', '소리를 내요'), answerId: 'a',
    explain: '변수는 값을 기억하는 주머니예요. 점수처럼 바뀌는 값을 담아요.',
  },
  {
    id: 'c4-why-reset', chapter: 4, type: 'concept',
    question: '시작할 때 ‘점수를 0으로 정하기’를 하는 까닭은 무엇일까요?',
    options: opt('지난번 점수가 남지 않고 0부터 시작하려고', '점수를 1씩 올리려고', '점수를 숨기려고'), answerId: 'a',
    explain: '시작할 때 처음 값을 정해 두면 매번 0부터 다시 셀 수 있어요.',
  },
  {
    id: 'c4-change', chapter: 4, type: 'predict',
    setup: '시작 버튼을 눌러 점수를 0으로 정한 뒤, 스페이스 키를 한 번씩 모두 3번 눌렀어요.',
    code: [
      { lines: [L('시작 버튼을 눌렀을 때'), L('점수를 0으로 정하기')] },
      { lines: [L('스페이스 키를 눌렀을 때'), L('점수를 2만큼 바꾸기')] },
    ],
    question: '점수는 얼마일까요?',
    options: opt('6', '2', '3'), answerId: 'a',
    explain: '‘만큼 바꾸기’는 지금 값에 더해요. 0 + 2 + 2 + 2 = 6이에요.',
  },
  {
    id: 'c4-set', chapter: 4, type: 'predict',
    setup: '지금 점수는 5예요.',
    code: [{ lines: [L('점수를 1로 정하기')] }],
    question: '이 블록을 실행하면 점수는 얼마일까요?',
    options: opt('1', '6', '5'), answerId: 'a',
    explain: '‘으로 정하기’는 값을 그 숫자로 바꿔 넣어요. 지금 값에 더하는 건 ‘만큼 바꾸기’예요.',
  },
  {
    id: 'c4-reset-bug', chapter: 4, type: 'debug',
    setup: '동전에게 아래 블록이 있어요. 코코가 동전을 여러 번 먹어도 점수가 늘 1이에요.',
    code: [{ who: '동전', lines: [
      L('시작 버튼을 눌렀을 때'),
      L('무한 반복하기', [
        L('만약 코코에 닿았는가? 라면', [L('점수를 0으로 정하기'), L('점수를 1만큼 바꾸기'), L('무작위 위치로 이동하기')]),
      ]),
    ] }],
    question: '왜 그럴까요?',
    options: opt('닿을 때마다 ‘점수를 0으로 정하기’가 먼저 실행돼서', '‘1만큼 바꾸기’의 숫자가 작아서', '동전이 무작위 위치로 이동해서'), answerId: 'a',
    explain: '‘0으로 정하기’를 시작 버튼 바로 아래로 옮겨 처음에 한 번만 실행되게 해야 해요.',
  },

  // ── 챕터 5. 이벤트와 장면 ────────────────────
  {
    id: 'c5-event', chapter: 5, type: 'concept',
    question: '‘시작 버튼을 눌렀을 때’, ‘키를 눌렀을 때’ 블록은 어떤 일을 할까요?',
    options: opt('어떤 일이 일어나면 아래 블록을 실행하기 시작해요', '캐릭터를 움직여요', '값을 기억해요'), answerId: 'a',
    explain: '이런 블록을 이벤트라고 해요. 실행을 시작하는 신호예요.',
  },
  {
    id: 'c5-message', chapter: 5, type: 'concept',
    question: '‘시작’ 메시지를 보내면 어떤 블록이 실행될까요?',
    options: opt('이름이 같은 ‘시작 메시지를 받았을 때’ 아래 블록', '모든 ‘메시지를 받았을 때’ 아래 블록', '아무 블록도 실행되지 않아요'), answerId: 'a',
    explain: '메시지는 이름이 똑같은 ‘받았을 때’ 블록에만 전달돼요.',
  },
  {
    id: 'c5-receive', chapter: 5, type: 'predict',
    setup: '지금은 ‘시작 화면’ 장면이에요. 아래 블록 말고 장면을 바꾸는 블록은 없어요.',
    code: [
      { who: '코코', lines: [L('시작 버튼을 눌렀을 때'), L('‘게임 시작!’을 1초 동안 말하기'), L('시작 메시지 보내기')] },
      { who: '유령', lines: [L('시작 메시지를 받았을 때'), L('게임 장면 시작하기')] },
    ],
    question: '시작 버튼을 누르면 마지막에 어떤 장면이 될까요?',
    options: opt('게임', '시작 화면 그대로', '게임오버'), answerId: 'a',
    explain: '코코가 보낸 시작 메시지를 유령이 받아서 게임 장면으로 바꿔요.',
  },
  {
    id: 'c5-scene-flow', chapter: 5, type: 'predict',
    setup: '지금은 ‘시작 화면’ 장면이에요. 먼저 스페이스 키를 누르고, 그다음 게임오버 메시지가 보내졌어요. 아래 블록 말고 장면을 바꾸는 블록은 없어요.',
    code: [
      { who: '코코', lines: [L('스페이스 키를 눌렀을 때'), L('게임 장면 시작하기')] },
      { who: '코코', lines: [L('게임오버 메시지를 받았을 때'), L('게임오버 장면 시작하기')] },
    ],
    question: '장면은 어떤 순서로 바뀔까요?',
    options: opt('시작 화면 → 게임 → 게임오버', '시작 화면 → 게임오버 → 게임', '게임 → 시작 화면 → 게임오버'), answerId: 'a',
    explain: '이 코드에서는 스페이스 키로 게임 장면이 되고, 그다음 게임오버 메시지를 받아 게임오버 장면이 돼요.',
  },
  {
    id: 'c5-scene-bug', chapter: 5, type: 'debug',
    setup: '유령에 닿으면 게임오버 장면이 나와야 하는데, 시작 화면이 나와요.',
    code: [
      { who: '유령', lines: [
        L('시작 버튼을 눌렀을 때'),
        L('무한 반복하기', [L('만약 코코에 닿았는가? 라면', [L('게임오버 메시지 보내기')])]),
      ] },
      { who: '코코', lines: [L('게임오버 메시지를 받았을 때'), L('시작 화면 장면 시작하기')] },
    ],
    question: '어떻게 고치면 될까요?',
    options: opt('‘받았을 때’ 아래 장면을 ‘게임오버’로 골라요', '메시지 이름을 바꿔요', '유령의 무한 반복을 없애요'), answerId: 'a',
    explain: '메시지는 잘 전달됐어요. 메시지를 받은 뒤 시작할 장면을 잘못 골랐어요.',
  },
]

export const QUIZ_CHAPTER_NOS = [1, 2, 3, 4, 5]

// 한 챕터의 문제 (개념 → 결과 예상 → 오류 찾기 순서 그대로)
export const chapterQuestions = (no) => QUIZ_QUESTIONS.filter((q) => q.chapter === no)

// Fisher–Yates — rand는 0 이상 1 미만을 돌려주는 함수
function shuffle(list, rand) {
  const result = [...list]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// 전체 복습: 챕터마다 1문제씩 무작위로 골라 챕터 순서대로 (같은 문제가 다시 뽑힐 수 있음)
export function pickReviewQuestions(rand = Math.random) {
  return QUIZ_CHAPTER_NOS.map((no) => {
    const pool = chapterQuestions(no)
    return pool[Math.floor(rand() * pool.length)]
  })
}

// 퀴즈를 시작할 때 한 번만 보기 순서를 섞는다. 보기 id와 answerId는 그대로라 정답 연결이 유지된다.
export const withShuffledOptions = (questions, rand = Math.random) =>
  questions.map((q) => ({ ...q, options: shuffle(q.options, rand) }))
