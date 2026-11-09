/* ════════════════════════════════════════════════
   챕터 채점 로직 — 서버 재채점기(backend/grader/grade.mjs)가 가져가는 파일
   - 캐릭터·장면, 예시 워크스페이스, 필요한 블록 목록
   - makeJudge: 실행 기록(trace)으로 미션 조건을 실시간 자동 판정
   - grading: '정답 제출' 자동 채점 때 테스트 로봇이 할 일 (engine/grader.js)
     seconds = 최대 테스트 시간(가상 시계), drive(bot, frame) = 매 프레임 키 누르기·조종

   화면에 보이는 문구(제목·소개·미션·힌트·채점 안내)는 chapterText.js에 있다.
   여기에 문구를 되돌려 넣으면 채점기 번들이 다시 커지므로 넣지 말 것.
   화면에서 쓸 때는 둘을 합쳐 주는 chapters.js를 가져다 쓴다.
   ════════════════════════════════════════════════ */
import { makeSprite, DEFAULT_SCENES } from '../lib/project'

/* ── 블록 JSON 도우미 ─────────────────────────── */
const N = (n) => ({ shadow: { type: 'math_number', fields: { NUM: n } } })
const T = (s) => ({ shadow: { type: 'text', fields: { TEXT: s } } })
function chain(...blocks) {
  for (let i = blocks.length - 2; i >= 0; i--) blocks[i].next = { block: blocks[i + 1] }
  return blocks[0]
}
const b = (type, inputs, fields) => ({ type, ...(inputs && { inputs }), ...(fields && { fields }) })
const hat = (type, fields, [x, y], ...body) => ({ type, x, y, fields, ...(body.length && { next: { block: chain(...body) } }) })
const wrap = (type, inputs, ...body) => ({ type, inputs: { ...inputs, ...(body.length && { DO: { block: chain(...body) } }) } })
const cond = (condBlock) => ({ COND: { block: condBlock } })
const V = (id) => ({ VAR: { id } })
const workspace = (tops, variables) => ({ blocks: { languageVersion: 0, blocks: tops }, ...(variables && { variables }) })
const SCORE = [{ name: '점수', id: 'var_score' }]

/* 코드에서 쓰는 블록 사용 여부 (이벤트 블록에 연결된 블록만 인정) */
export function usedTypes(ws) {
  const hats = new Set(['when_start', 'when_key', 'when_clicked', 'when_receive', 'when_scene_start'])
  const set = new Set()
  for (const blk of ws.getAllBlocks(false)) {
    if (blk.isShadow()) continue
    if (hats.has(blk.getRootBlock().type)) set.add(blk.type)
  }
  return set
}

/* ── 챕터별 블록 (누적) ─────────────────────── */
export const BASE_BLOCKS = ['when_start', 'say']
const NEW_BLOCKS = {
  1: ['when_key', 'move_x', 'move_y', 'set_dir'],
  2: ['repeat_n', 'forever', 'wait', 'move_steps'],
  3: ['if_then', 'touching', 'key_pressed', 'turn_around'],
  4: ['var_set', 'var_change', 'var_show', 'var_hide', 'variables_get', 'logic_compare', 'goto_random'],
  5: ['broadcast', 'when_receive', 'switch_scene', 'when_scene_start', 'show', 'hide'],
}
export function chapterBlocks(no) {
  const list = [...BASE_BLOCKS]
  for (let i = 1; i <= no; i++) list.push(...(NEW_BLOCKS[i] ?? []))
  return list
}
export function learnedBlocks(completedNos) {
  return [...new Set(completedNos.flatMap((n) => NEW_BLOCKS[n] ?? []))]
}

/* ── 공통 판정 도우미 ─────────────────────────── */
// tip: 채점에서 이 조건을 못 채웠을 때 코코가 알려줄 고칠 점
const check = (label, done, tip) => ({ label, done: !!done, tip })
const ARROWS = ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']

/* ════════════════════════════════════════════════
   챕터 로직 데이터
   ════════════════════════════════════════════════ */
export const CHAPTER_LOGIC = {
  1: {
    newBlocks: NEW_BLOCKS[1],
    focus: ['move_x', 'move_y'],
    sprites: () => [makeSprite({ id: 'coco', name: '코코', costume: 'coco' })],
    example: {
      workspace: workspace([
        hat('when_key', { SPRITE: 'coco', KEY: 'ArrowRight' }, [30, 30], b('move_x', { DX: N(10) })),
      ]),
      demoKeys: ['ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight', 'ArrowRight'],
    },
    required: ['when_key', 'move_x', 'move_y'],
    makeJudge: () => {
      const want = { ArrowRight: ['x', 1], ArrowLeft: ['x', -1], ArrowUp: ['y', 1], ArrowDown: ['y', -1] }
      const ok = {}
      return {
        onEvent(e) {
          if (e.type !== 'move' || e.hat !== 'when_key' || !want[e.key]) return
          const [axis, sign] = want[e.key]
          if (Math.sign(axis === 'x' ? e.rawDx : e.rawDy) === sign) ok[e.key] = true
        },
        checks: () => [
          check('→ 누르면 오른쪽으로', ok.ArrowRight, "'→ 키를 눌렀을 때' 아래에 'x 좌표 바꾸기'를 +숫자로 붙여봐."),
          check('← 누르면 왼쪽으로', ok.ArrowLeft, "'← 키를 눌렀을 때' 아래에 'x 좌표 바꾸기'를 -숫자로 붙여봐."),
          check('↑ 누르면 위로', ok.ArrowUp, "'↑ 키를 눌렀을 때' 아래에 'y 좌표 바꾸기'를 +숫자로 붙여봐."),
          check('↓ 누르면 아래로', ok.ArrowDown, "'↓ 키를 눌렀을 때' 아래에 'y 좌표 바꾸기'를 -숫자로 붙여봐."),
        ],
      }
    },
    grading: {
      seconds: 4,
      drive: (bot, f) => bot.hold(f % 20 < 10 && f < 80 ? [ARROWS[Math.floor(f / 20)]] : []),
    },
  },

  2: {
    newBlocks: NEW_BLOCKS[2],
    focus: ['repeat_n'],
    sprites: () => [makeSprite({ id: 'coco', name: '코코', costume: 'coco', x: -120 })],
    example: {
      workspace: workspace([
        hat('when_start', { SPRITE: 'coco' }, [30, 30],
          wrap('repeat_n', { TIMES: N(3) },
            b('move_x', { DX: N(150) }), b('wait', { SECS: N(0.3) }),
            b('move_x', { DX: N(-150) }), b('wait', { SECS: N(0.3) }))),
      ]),
    },
    required: ['repeat_n', 'move_x'],
    makeJudge: (ws) => {
      const last = {}
      let reversals = 0
      let moved = false
      return {
        onEvent(e) {
          if (e.type !== 'move' || !e.rawDx) return
          const sign = Math.sign(e.rawDx)
          moved = true
          if (last[e.sprite] && last[e.sprite] !== sign) reversals++
          last[e.sprite] = sign
        },
        checks: () => {
          const trips = moved ? Math.floor((reversals + 1) / 2) : 0
          return [
            check("'번 반복하기' 블록 사용하기", usedTypes(ws).has('repeat_n'), "'번 반복하기' 블록을 시작 블록 아래에 붙여봐."),
            check(`화면 왕복 10번 (${Math.min(trips, 10)}/10)`, trips >= 10,
              trips ? `지금은 ${trips}번 왕복했어. 반복 횟수를 10으로 바꿔봐!` : '반복 안에 오른쪽(+)으로 가기와 왼쪽(-)으로 가기를 둘 다 넣어봐.'),
          ]
        },
      }
    },
    grading: { seconds: 90 },
  },

  3: {
    newBlocks: NEW_BLOCKS[3],
    focus: ['if_then', 'touching'],
    sprites: () => [makeSprite({ id: 'ball', name: '공', costume: 'ball', size: 80 })],
    example: {
      workspace: workspace([
        hat('when_start', { SPRITE: 'ball' }, [30, 30],
          wrap('forever', {},
            b('move_steps', { STEPS: N(6) }),
            wrap('if_then', cond(b('touching', null, { TARGET: '__wall__' })),
              b('say', { TEXT: T('벽이다!') })))),
      ]),
    },
    required: ['forever', 'if_then', 'touching', 'turn_around'],
    makeJudge: (ws) => {
      const atWall = {}
      const lastSign = {}
      let bounces = 0
      return {
        onEvent(e) {
          if (e.type === 'touch' && e.target === '__wall__') atWall[e.sprite] = true
          const reversed = (e.type === 'turn' && Math.abs(Math.abs(e.to - e.from) - 180) < 1)
            || (e.type === 'move' && e.rawDx && lastSign[e.sprite] && Math.sign(e.rawDx) !== lastSign[e.sprite])
          if (e.type === 'move' && e.rawDx) lastSign[e.sprite] = Math.sign(e.rawDx)
          if (reversed && atWall[e.sprite]) {
            bounces++
            atWall[e.sprite] = false
          }
        },
        checks: () => {
          const used = usedTypes(ws)
          return [
            check("'무한 반복하기' 사용하기", used.has('forever'), "공이 멈추지 않고 계속 움직이도록 '무한 반복하기'로 감싸봐."),
            check("'만약 ~라면' + '닿았는가?' 사용하기", used.has('if_then') && used.has('touching'),
              "'만약 ~라면' 육각형 칸에 '벽에 닿았는가?'를 끼워봐."),
            check(`벽에서 튕기기 (${Math.min(bounces, 3)}/3)`, bounces >= 3,
              "'만약 벽에 닿았는가? 라면' 안에 '방향 반대로 바꾸기'를 넣어봐. 공은 '만큼 움직이기'로 움직여야 바뀐 방향으로 가!"),
          ]
        },
      }
    },
    grading: { seconds: 40 },
  },

  4: {
    newBlocks: NEW_BLOCKS[4],
    focus: ['var_change', 'var_set'],
    sprites: () => [
      makeSprite({ id: 'coco', name: '코코', costume: 'coco', x: -150 }),
      makeSprite({ id: 'coin', name: '동전', costume: 'coin', x: 120, y: 60, size: 70 }),
    ],
    example: {
      workspace: workspace([
        hat('when_start', { SPRITE: 'coco' }, [30, 30],
          b('var_set', { VALUE: N(0) }, V('var_score')), b('var_show', null, V('var_score'))),
        hat('when_key', { SPRITE: 'coco', KEY: 'Space' }, [30, 220],
          b('var_change', { DELTA: N(1) }, V('var_score'))),
      ], SCORE),
      demoKeys: ['Space', 'Space', 'Space'],
    },
    // 스스로 완성 단계는 챕터 1에서 만든 화살표 이동이 미리 들어있는 상태로 시작
    starter: workspace([
      hat('when_key', { SPRITE: 'coco', KEY: 'ArrowRight' }, [30, 30], b('move_x', { DX: N(15) })),
      hat('when_key', { SPRITE: 'coco', KEY: 'ArrowLeft' }, [30, 150], b('move_x', { DX: N(-15) })),
      hat('when_key', { SPRITE: 'coco', KEY: 'ArrowUp' }, [30, 270], b('move_y', { DY: N(15) })),
      hat('when_key', { SPRITE: 'coco', KEY: 'ArrowDown' }, [30, 390], b('move_y', { DY: N(-15) })),
    ], SCORE),
    required: ['var_change', 'touching', 'logic_compare'],
    makeJudge: () => {
      let idx = 0
      let lastTouch = -99
      let coinScore = false
      let maxVal = 0
      let saidClear = false
      const prev = {}
      return {
        onEvent(e) {
          idx++
          if (e.type === 'touch' && e.target !== '__wall__') lastTouch = idx
          if (e.type === 'var' && typeof e.value === 'number') {
            if (e.value > (prev[e.id] ?? 0) && idx - lastTouch <= 6) coinScore = true
            prev[e.id] = e.value
            maxVal = Math.max(maxVal, e.value)
          }
          if (e.type === 'say' && String(e.text).includes('클리어')) saidClear = true
        },
        checks: () => [
          check('동전에 닿으면 점수 올리기', coinScore,
            "동전에게 '무한 반복 → 만약 코코에 닿았는가? 라면 → 점수 1만큼 바꾸기'를 만들어봐."),
          check(`점수 10점 만들기 (${Math.min(maxVal, 10)}/10)`, maxVal >= 10,
            "점수를 올린 뒤 '무작위 위치로 이동하기'로 동전을 옮겨야 계속 먹을 수 있어."),
          check("'클리어!' 말하기", saidClear, "'만약 점수 = 10 이라면' 안에 '클리어!' 말하기를 넣어봐."),
        ],
      }
    },
    grading: {
      seconds: 60,
      drive: (bot) => bot.steer('coco', 'coin'),
    },
  },

  5: {
    newBlocks: NEW_BLOCKS[5],
    focus: ['broadcast', 'when_receive', 'switch_scene'],
    sprites: () => [
      makeSprite({ id: 'coco', name: '코코', costume: 'coco', x: -150 }),
      makeSprite({ id: 'enemy', name: '유령', costume: 'ghost', x: 150, size: 80 }),
    ],
    scenes: () => [
      { id: 'scene1', name: '시작 화면', bg: '#dbeafe' },
      { id: 'scene2', name: '게임', bg: '#dcfce7' },
      { id: 'scene3', name: '게임오버', bg: '#fee2e2' },
    ],
    example: {
      workspace: workspace([
        hat('when_start', { SPRITE: 'coco' }, [30, 30],
          b('say_secs', { TEXT: T('게임 시작!'), SECS: N(1) }), b('broadcast', null, { MSG: '시작' })),
        hat('when_receive', { SPRITE: 'enemy', MSG: '시작' }, [30, 220],
          b('switch_scene', null, { SCENE: 'scene2' }), b('say', { TEXT: T('잡으러 간다!') })),
      ]),
    },
    required: ['broadcast', 'when_receive', 'switch_scene'],
    makeJudge: () => {
      let progress = 0
      let received = false
      return {
        onEvent(e) {
          if (e.type === 'scene' && e.index === progress) progress++
          if (e.type === 'receive') received = true
        },
        checks: () => [
          check('시작 화면 → 게임 장면', progress >= 2, "스페이스 키를 누르면 '게임 장면 시작하기'가 실행되게 해봐."),
          check('게임 장면 → 게임오버 장면', progress >= 3,
            "유령에 닿으면 '게임오버' 메시지를 보내고, 그 메시지를 받으면 '게임오버 장면 시작하기'를 해봐. 코코를 화살표 키로 움직일 수 있어야 유령에 닿을 수 있어!"),
          check('메시지 보내고 받기', received, "'메시지 보내기'와 같은 이름의 '메시지를 받았을 때' 블록을 만들어봐."),
        ],
      }
    },
    grading: {
      seconds: 60,
      drive: (bot, f) => {
        if (bot.sceneIndex() > 0) return bot.steer('coco', 'enemy')
        bot.hold([])
        if (f % 60 === 30) bot.press('Space')
        if (f % 120 === 90) {
          bot.click('coco')
          bot.click('enemy')
        }
      },
    },
  },
}

/* 챕터 5 완료 후 열리는 '나만의 게임 만들기' 자유 창작 미션 (문구는 chapterText.js) */
export const MY_GAME_LOGIC = {
  scenes: () => DEFAULT_SCENES(),
}

export const CHAPTER_COUNT = Object.keys(CHAPTER_LOGIC).length
