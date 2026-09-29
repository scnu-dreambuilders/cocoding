// frontend/src/data/quizQuestions.js
// 게임존 퀴즈 게임의 정적 문제 데이터 (백엔드 없음, 프론트에서만 사용)
// 단계별 학습에서 다루는 개념(반복·순서·이벤트·이동·조건·좌표·블록의 역할) 범위 안에서만 출제
export const QUIZ_QUESTIONS = [
  {
    id: 1,
    topic: '반복',
    question: '코코를 화면에서 10번 왕복시키려면 어떤 블록이 꼭 필요할까요?',
    options: ['반복하기', '말하기', '소리 재생하기', '색 바꾸기'],
    answerIndex: 0,
  },
  {
    id: 2,
    topic: '순서',
    question: '블록을 위에서부터 차례로 쌓아두면 코코는 어떤 순서로 실행할까요?',
    options: ['맨 아래 블록부터', '위에서부터 차례대로', '무작위 순서로', '전부 동시에'],
    answerIndex: 1,
  },
  {
    id: 3,
    topic: '이벤트',
    question: "'시작 버튼을 눌렀을 때' 블록은 어떤 역할을 할까요?",
    options: ['코드를 시작하는 신호', '캐릭터를 숨기는 것', '소리를 끄는 것', '배경을 바꾸는 것'],
    answerIndex: 0,
  },
  {
    id: 4,
    topic: '이동',
    question: '캐릭터를 오른쪽으로 움직이려면 x좌표를 어떻게 바꿔야 할까요?',
    options: ['+(양수) 값만큼 바꾼다', '-(음수) 값만큼 바꾼다', 'y좌표를 바꾼다', '크기를 바꾼다'],
    answerIndex: 0,
  },
  {
    id: 5,
    topic: '조건',
    question: "'만약 ~라면' 블록은 언제 사용할까요?",
    options: ['특정 조건일 때만 실행하고 싶을 때', '항상 실행하고 싶을 때', '소리를 낼 때', '캐릭터를 추가할 때'],
    answerIndex: 0,
  },
  {
    id: 6,
    topic: '좌표',
    question: '무대의 정중앙 좌표는 무엇일까요?',
    options: ['x: 0, y: 0', 'x: 100, y: 100', 'x: -240, y: 180', 'x: 240, y: -180'],
    answerIndex: 0,
  },
  {
    id: 7,
    topic: '블록의 역할',
    question: "'말하기' 블록은 무엇을 할까요?",
    options: ['캐릭터가 말풍선으로 말한다', '캐릭터를 움직인다', '소리를 재생한다', '점수를 올린다'],
    answerIndex: 0,
  },
  {
    id: 8,
    topic: '순서',
    question: '블록과 블록을 연결할 때는 어디에 붙여야 할까요?',
    options: ['블록 사이의 홈에 딱 맞게', '아무 곳에나 겹쳐서', '팔레트 안에', '무대 위에'],
    answerIndex: 0,
  },
  {
    id: 9,
    topic: '이동',
    question: "'10만큼 움직이기' 블록을 실행하면 캐릭터는 어느 방향으로 움직일까요?",
    options: ['캐릭터가 보고 있는 방향', '항상 위쪽', '항상 아래쪽', '움직이지 않는다'],
    answerIndex: 0,
  },
  {
    id: 10,
    topic: '이벤트',
    question: '반복 블록 안에 있는 코드는 언제까지 계속 실행될까요?',
    options: ['정해진 조건이 끝날 때까지', '한 번만 실행하고 끝', '블록을 클릭할 때만', '무대를 클릭할 때만'],
    answerIndex: 0,
  },
]

export const QUIZ_QUESTION_COUNT = 5
export const QUIZ_TIME_LIMIT = 60
export const QUIZ_SCORE_PER_ANSWER = 10

// 문제 풀에서 무작위로 5개를 뽑아 순서를 섞는다 (매 게임마다 다른 조합)
export function pickQuizQuestions(count = QUIZ_QUESTION_COUNT) {
  const shuffled = [...QUIZ_QUESTIONS].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}
