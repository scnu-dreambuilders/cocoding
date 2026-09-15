/* ════════════════════════════════════════════════
   자동 채점기 — '정답 제출'을 누르면 보이지 않는 무대에서 학생 코드를 실행해 채점
   - 가상 시계(1프레임 = 1/60초)로 돌려서 60초짜리 테스트도 1초 안팎에 끝난다
   - 챕터마다 정해진 테스트(키 누르기, 캐릭터 자동 조종)를 하면서 실행 기록을 판정기에 넘김
   - 채점 기준(100점): 미션 조건 70 + 배운 블록 사용 20 + 오류 없이 실행 10
   ════════════════════════════════════════════════ */
import { Runtime, validateWorkspace } from './runtime'
import { usedTypes } from '../data/chapters'
import { BLOCK_INFO } from '../blockly/blocks'

const FRAME_MS = 1000 / 60
const POINTS = { mission: 70, blocks: 20, clean: 10 }

// 한 프레임의 블록 실행(마이크로태스크)이 다 끝나도록 매 프레임 한 번 양보 — setTimeout과 달리 4ms 지연이 없음
// (채널을 하나만 만들어 재사용: 매번 새로 만드는 것보다 몇 배 빠름)
function taskYielder() {
  const ch = new MessageChannel()
  let wake = null
  ch.port1.onmessage = () => wake?.()
  return {
    next: () => new Promise((resolve) => {
      wake = resolve
      ch.port2.postMessage(null)
    }),
    close: () => ch.port1.close(),
  }
}

// 채점할 때마다 같은 결과가 나오도록 '무작위 위치로 이동'도 정해진 순서로
function seededRandom(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* 테스트 로봇: 챕터 grading.drive(bot, frame)가 이걸로 키를 누르고 캐릭터를 조종 */
function makeBot(rt) {
  const held = new Set()
  const taps = new Set()
  return {
    sprite: (id) => rt.sprites.find((s) => s.id === id),
    sceneIndex: () => (rt.project.scenes ?? []).findIndex((s) => s.id === rt.sceneId),
    // 매 프레임 시작: 지난 프레임에 톡 누른 키 떼기
    beginFrame() {
      for (const k of taps) if (!held.has(k)) rt.keyUp(k)
      taps.clear()
    },
    press(key) {
      rt.keyDown(key)
      taps.add(key)
    },
    // 누르고 있는 키 (키보드를 꾹 누르면 반복 입력되는 것처럼 매 프레임 다시 누름)
    hold(keys) {
      for (const k of [...held]) {
        if (!keys.includes(k)) {
          rt.keyUp(k)
          held.delete(k)
        }
      }
      for (const k of keys) {
        rt.keyDown(k)
        held.add(k)
      }
    },
    click: (id) => rt.clickSprite(id),
    // 화살표 키로 from 캐릭터를 to 캐릭터 쪽으로 몰기
    steer(fromId, toId) {
      const a = this.sprite(fromId)
      const b = this.sprite(toId)
      if (!a || !b || !b.visible) return this.hold([])
      const keys = []
      const dx = b.x - a.x
      const dy = b.y - a.y
      if (Math.abs(dx) > 6) keys.push(dx > 0 ? 'ArrowRight' : 'ArrowLeft')
      if (Math.abs(dy) > 6) keys.push(dy > 0 ? 'ArrowUp' : 'ArrowDown')
      return this.hold(keys)
    },
  }
}

/* 가상 시계로 한 번 실행 */
async function runTest({ workspace, project, judge, grading, onProgress }) {
  let vt = 0
  let pending = []
  let error = null
  const rt = new Runtime({
    workspace,
    project,
    requestFrame: (cb) => pending.push(cb),
    now: () => vt,
    random: seededRandom(20260917),
    onTrace: (e) => judge.onEvent(e),
    onError: (err) => { error = err },
  })
  const bot = makeBot(rt)
  const maxFrames = Math.round(grading.seconds * 60)
  const yielder = taskYielder()
  try {
    rt.start()
    await yielder.next()
    for (let f = 0; f < maxFrames && rt.running; f++) {
      bot.beginFrame()
      grading.drive?.(bot, f)
      vt += FRAME_MS
      const cbs = pending
      pending = []
      for (const cb of cbs) cb()
      await yielder.next()
      if (judge.checks().every((c) => c.done)) break
      if (f % 60 === 0) onProgress?.(f / maxFrames)
    }
  } finally {
    rt.stop('graded')
    yielder.close()
  }
  return { error, seconds: Math.round(vt / 100) / 10 }
}

// 70점을 조건 개수로 나누기 (나머지는 앞 조건부터 1점씩)
function split(total, n) {
  const base = Math.floor(total / n)
  return Array.from({ length: n }, (_, i) => base + (i < total - base * n ? 1 : 0))
}

export function starsOf(score) {
  if (score >= 100) return 3
  if (score >= 80) return 2
  if (score >= 50) return 1
  return 0
}

/**
 * 챕터 미션 채점
 * @param liveDone 같은 코드로 직접 실행했을 때 이미 채운 조건 번호 (자동 테스트가 못 해본 조작 인정)
 * @returns {{ score, passed, stars, items, error, howto, seconds }}
 */
export async function gradeChapter({ chapter, workspace, project, liveDone = [], onProgress }) {
  const grading = chapter.grading
  const blocking = validateWorkspace(workspace, project).find((i) => i.level === 'error')
  const judge = chapter.makeJudge(workspace)
  let error = blocking ? { blockId: blocking.blockId, message: blocking.message } : null
  let seconds = 0
  if (!blocking) {
    const res = await runTest({ workspace, project, judge, grading, onProgress })
    if (res.error) error = { blockId: res.error.blockId, message: res.error.message }
    seconds = res.seconds
  }

  const live = new Set(liveDone)
  const checks = judge.checks()
  const shares = split(POINTS.mission, checks.length)
  const items = checks.map((c, i) => {
    const byLive = !c.done && live.has(i)
    const done = c.done || byLive
    return {
      group: 'mission', label: c.label, max: shares[i], earned: done ? shares[i] : 0, done,
      via: byLive ? 'live' : null, tip: done ? null : c.tip,
    }
  })

  const used = usedTypes(workspace)
  const missing = chapter.required.filter((t) => !used.has(t))
  const have = chapter.required.length - missing.length
  items.push({
    group: 'blocks', label: '이번 챕터에서 배운 블록 사용하기',
    max: POINTS.blocks, earned: Math.round((POINTS.blocks * have) / chapter.required.length), done: !missing.length,
    tip: missing.length ? `${missing.map((t) => `'${BLOCK_INFO[t]?.name ?? t}'`).join(', ')} 블록을 써보자!` : null,
    missing,
  })
  items.push({
    group: 'clean', label: '오류 없이 실행하기',
    max: POINTS.clean, earned: error ? 0 : POINTS.clean, done: !error,
    tip: error ? error.message : null,
  })

  const score = items.reduce((sum, it) => sum + it.earned, 0)
  const passed = !error && items.filter((it) => it.group === 'mission').every((it) => it.done)
  return { score, passed, stars: passed ? starsOf(score) : 0, items, error, howto: grading.howto, seconds }
}
