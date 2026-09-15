/* ════════════════════════════════════════════════
   블록 실행 엔진 (인터프리터)
   - 생성된 JS를 eval하지 않고 블록 트리를 직접 실행한다
     → 오류가 난 '블록 id'를 정확히 알 수 있음 (빨간 테두리 + 코코 설명)
     → 다른 사람의 공개 작품을 열어도 임의 코드가 실행되지 않음
   - 스크래치처럼 반복문은 한 바퀴마다 한 프레임 쉬어서 움직임이 보인다
   - onTrace로 실행 기록을 흘려보내 챕터 미션 자동 판정에 사용
   ════════════════════════════════════════════════ */

export const STAGE_W = 480
export const STAGE_H = 360
export const HALF_W = STAGE_W / 2
export const HALF_H = STAGE_H / 2
export const SPRITE_PX = 64

const HATS = new Set(['when_start', 'when_key', 'when_clicked', 'when_receive', 'when_scene_start'])
const INPUT_HATS = new Set(['when_key', 'when_clicked'])
const MAX_THREADS = 300
// Blockly ConnectionType 값 (엔진이 Blockly에 의존하지 않도록 숫자로 사용)
const INPUT_VALUE = 1
const NEXT_STATEMENT = 3

export class BlockError extends Error {
  constructor(blockId, message, kind = 'runtime') {
    super(message)
    this.blockId = blockId
    this.kind = kind
  }
}
const STOP = Symbol('stop')

export function spriteRadius(s) {
  return (SPRITE_PX / 2) * ((s.size ?? 100) / 100) * 0.8
}

export function normalizeKey(key) {
  if (key === ' ' || key === 'Spacebar') return 'Space'
  if (key.length === 1) return key.toLowerCase()
  return key
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const normDir = (d) => {
  let r = ((d + 180) % 360 + 360) % 360 - 180
  if (r === -180) r = 180
  return Math.round(r * 1000) / 1000
}

function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'boolean') return v ? 1 : 0
  const s = String(v ?? '').trim()
  if (s === '') return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
function truthy(v) {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  const s = String(v ?? '').trim().toLowerCase()
  return s !== '' && s !== '0' && s !== 'false'
}
function compare(a, b) {
  const na = toNum(a)
  const nb = toNum(b)
  if (na !== null && nb !== null && String(a).trim() !== '' && String(b).trim() !== '') return na - nb
  const sa = String(a).toLowerCase()
  const sb = String(b).toLowerCase()
  return sa < sb ? -1 : sa > sb ? 1 : 0
}

/* ════════════════════════════════════════════════
   실행 전 검사 — 조립 실수 찾기
   ════════════════════════════════════════════════ */
export function validateWorkspace(workspace, project) {
  const issues = []
  const tops = workspace.getTopBlocks(true)
  const hats = tops.filter((b) => HATS.has(b.type))
  const spriteIds = new Set((project.sprites ?? []).map((s) => s.id))

  if (!hats.length) {
    issues.push({
      level: 'error', kind: 'no-hat', blockId: null,
      message: "'▶ 시작 버튼을 눌렀을 때' 같은 이벤트 블록부터 놓아봐! 이벤트 블록 아래에 붙은 블록만 실행돼.",
    })
  }
  for (const b of tops) {
    if (!HATS.has(b.type) && !b.outputConnection) {
      issues.push({
        level: 'warn', kind: 'orphan', blockId: b.id,
        message: '이 블록은 이벤트 블록에 붙어있지 않아서 실행되지 않아! 이벤트 블록 아래에 딱 붙여봐.',
      })
    }
  }

  const sent = []
  const received = new Set()
  for (const hat of hats) {
    if (hat.type === 'when_receive') received.add(String(hat.getFieldValue('MSG')).trim())
    if (!spriteIds.has(hat.getFieldValue('SPRITE'))) {
      issues.push({ level: 'error', kind: 'sprite', blockId: hat.id, message: '이 블록의 캐릭터가 무대에 없어! 드롭다운에서 캐릭터를 다시 골라줘.' })
    }
    for (const d of hat.getDescendants(false)) {
      if (d.type === 'broadcast') sent.push(d)
      for (const input of d.inputList) {
        const conn = input.connection
        if (!conn || conn.targetBlock()) continue
        if (conn.type === INPUT_VALUE) {
          const isBool = (conn.getCheck() ?? []).includes('Boolean')
          issues.push({
            level: 'error', kind: 'empty', blockId: d.id,
            message: isBool ? '여기 육각형 칸에 조건 블록을 끼워 넣어봐! (예: 벽에 닿았는가?)' : '여기에 숫자를 넣어봐!',
          })
        } else if (conn.type === NEXT_STATEMENT && ['repeat_n', 'forever', 'if_then'].includes(d.type) && input.name === 'DO') {
          issues.push({ level: 'warn', kind: 'empty-body', blockId: d.id, message: '이 블록 안쪽이 비어있어! 반복하거나 실행할 블록을 안에 넣어봐.' })
        }
      }
    }
  }
  for (const b of sent) {
    const name = String(b.getFieldValue('MSG')).trim()
    if (!received.has(name)) {
      issues.push({ level: 'warn', kind: 'no-receiver', blockId: b.id, message: `'${name}' 메시지를 받는 블록이 없어! "메시지를 받았을 때" 블록의 이름을 똑같이 맞춰봐.` })
    }
  }
  return issues
}

/* ════════════════════════════════════════════════
   Runtime
   ════════════════════════════════════════════════ */
export class Runtime {
  constructor({ workspace, project, onTrace, onError, onFinish, playSound, requestFrame, now, random }) {
    this.workspace = workspace
    this.project = project
    this.onTrace = onTrace ?? (() => {})
    this.onError = onError ?? (() => {})
    this.onFinish = onFinish ?? (() => {})
    this.playSoundHook = playSound ?? (() => {})
    this.requestFrame = requestFrame ?? ((cb) => requestAnimationFrame(cb))
    this.now = now ?? (() => performance.now())
    this.random = random ?? Math.random

    this.running = false
    this.threads = new Map() // hat.id → thread
    this.keys = new Set()
    this.vars = new Map()
    this.shownVars = new Set()
    this.sprites = []
    this.sceneId = null
    this._frame = null
  }

  /* ── 상태 ────────────────────────────────── */
  reset() {
    this.sprites = (this.project.sprites ?? []).map((s) => ({
      ...s, dir: s.dir ?? 90, size: s.size ?? 100, visible: s.visible !== false, say: null,
    }))
    this.sceneId = this.project.scenes?.[0]?.id ?? null
    this.vars = new Map()
    for (const v of this.workspace.getVariableMap().getAllVariables()) this.vars.set(v.getId(), 0)
    this.shownVars = new Set()
    this.keys = new Set()
    this.threads = new Map()
  }

  varName(id) {
    return this.workspace.getVariableMap().getVariableById(id)?.getName() ?? '변수'
  }

  monitors() {
    return [...this.shownVars].map((id) => ({ id, name: this.varName(id), value: this.vars.get(id) ?? 0 }))
  }

  hats(type) {
    return this.workspace.getTopBlocks(true).filter((b) => b.type === type && b.isEnabled())
  }

  /* ── 시작/정지 ───────────────────────────── */
  start() {
    this.reset()
    this.running = true
    this.hasInputHats = this.workspace.getTopBlocks(false).some((b) => INPUT_HATS.has(b.type))
    this.emit({ type: 'start' })
    if (this.sceneId) this.emit({ type: 'scene', sceneId: this.sceneId, index: 0 })
    for (const hat of this.hats('when_start')) this.spawn(hat)
    for (const hat of this.hats('when_scene_start')) {
      if (hat.getFieldValue('SCENE') === this.sceneId) this.spawn(hat)
    }
    this.maybeFinish()
  }

  stop(reason = 'stopped') {
    if (!this.running) return
    this.running = false
    for (const t of this.threads.values()) t.cancelled = true
    this.threads.clear()
    this.onFinish({ reason })
  }

  fail(err) {
    if (!this.running) return
    this.onError(err)
    this.stop('error')
  }

  maybeFinish() {
    if (this.running && this.threads.size === 0 && !this.hasInputHats) this.stop('done')
  }

  /* ── 입력 ────────────────────────────────── */
  keyDown(rawKey) {
    if (!this.running) return
    const key = normalizeKey(rawKey)
    this.keys.add(key)
    this.emit({ type: 'key', key })
    for (const hat of this.hats('when_key')) {
      const k = hat.getFieldValue('KEY')
      if (k === key || k === 'any') this.spawn(hat, key)
    }
  }

  keyUp(rawKey) {
    this.keys.delete(normalizeKey(rawKey))
  }

  clickSprite(spriteId) {
    if (!this.running) return
    for (const hat of this.hats('when_clicked')) {
      if (hat.getFieldValue('SPRITE') === spriteId) this.spawn(hat)
    }
  }

  /* ── 스레드 ──────────────────────────────── */
  spawn(hat, key = null) {
    if (!this.running) return
    const existing = this.threads.get(hat.id)
    if (existing) {
      if (INPUT_HATS.has(hat.type)) return // 키/클릭은 실행 중이면 무시 (스크래치와 동일)
      existing.cancelled = true // 메시지/장면은 처음부터 다시
    }
    if (this.threads.size >= MAX_THREADS) return
    const sprite = this.sprites.find((s) => s.id === hat.getFieldValue('SPRITE'))
    if (!sprite) {
      this.fail(new BlockError(hat.id, '이 블록의 캐릭터가 무대에 없어! 드롭다운에서 캐릭터를 다시 골라줘.', 'sprite'))
      return
    }
    const t = { hat, sprite, cancelled: false, current: hat.id, key }
    this.threads.set(hat.id, t)
    this.runThread(t)
  }

  async runThread(t) {
    try {
      await this.execStack(t.hat.getNextBlock(), t)
    } catch (e) {
      if (e !== STOP) {
        if (e instanceof BlockError) this.fail(e)
        else this.fail(new BlockError(t.current, `실행 중에 문제가 생겼어: ${e?.message ?? e}`))
      }
    } finally {
      if (this.threads.get(t.hat.id) === t) this.threads.delete(t.hat.id)
      this.maybeFinish()
    }
  }

  check(t) {
    if (!this.running || t.cancelled) throw STOP
  }

  frame() {
    if (!this._frame) {
      this._frame = new Promise((resolve) => {
        this.requestFrame(() => {
          this._frame = null
          resolve()
        })
      })
    }
    return this._frame
  }

  async tick(t) {
    await this.frame()
    this.check(t)
  }

  async sleep(ms, t) {
    const end = this.now() + ms
    do {
      await this.tick(t)
    } while (this.now() < end)
  }

  emit(e) {
    this.onTrace(e, this)
  }

  /* ── 값 읽기 ─────────────────────────────── */
  target(block, name, emptyMsg) {
    const b = block.getInputTargetBlock(name)
    if (!b) throw new BlockError(block.id, emptyMsg, 'empty')
    return b
  }

  any(block, name, t) {
    return this.evalValue(this.target(block, name, '여기에 값을 넣어봐!'), t)
  }

  num(block, name, t) {
    const b = this.target(block, name, '여기에 숫자를 넣어봐!')
    const v = this.evalValue(b, t)
    const n = toNum(v)
    if (n === null) throw new BlockError(b.id, `여기엔 숫자가 들어가야 하는데 '${v}'(이)가 들어갔어!`, 'value')
    return n
  }

  bool(block, name, t) {
    const b = this.target(block, name, '여기 육각형 칸에 조건 블록을 끼워 넣어봐!')
    return truthy(this.evalValue(b, t))
  }

  evalValue(b, t) {
    switch (b.type) {
      case 'math_number': return Number(b.getFieldValue('NUM'))
      case 'text': return b.getFieldValue('TEXT')
      case 'logic_boolean': return b.getFieldValue('BOOL') === 'TRUE'
      case 'variables_get': return this.vars.get(b.getFieldValue('VAR')) ?? 0
      case 'get_x': return Math.round(t.sprite.x)
      case 'get_y': return Math.round(t.sprite.y)
      case 'touching': return this.touching(t.sprite, b.getFieldValue('TARGET'))
      case 'key_pressed': return this.keys.has(b.getFieldValue('KEY'))
      case 'logic_compare': {
        const c = compare(this.any(b, 'A', t), this.any(b, 'B', t))
        switch (b.getFieldValue('OP')) {
          case 'EQ': return c === 0
          case 'NEQ': return c !== 0
          case 'LT': return c < 0
          case 'LTE': return c <= 0
          case 'GT': return c > 0
          case 'GTE': return c >= 0
          default: return false
        }
      }
      case 'logic_operation': {
        const a = this.bool(b, 'A', t)
        if (b.getFieldValue('OP') === 'AND') return a && this.bool(b, 'B', t)
        return a || this.bool(b, 'B', t)
      }
      case 'logic_negate': return !this.bool(b, 'BOOL', t)
      case 'math_arithmetic': {
        const x = this.num(b, 'A', t)
        const y = this.num(b, 'B', t)
        switch (b.getFieldValue('OP')) {
          case 'ADD': return x + y
          case 'MINUS': return x - y
          case 'MULTIPLY': return x * y
          case 'DIVIDE':
            if (y === 0) throw new BlockError(b.id, '0으로 나눌 수는 없어! 나누는 수를 바꿔봐.', 'value')
            return x / y
          case 'POWER': return x ** y
          default: return 0
        }
      }
      case 'math_random_int': {
        let lo = Math.ceil(this.num(b, 'FROM', t))
        let hi = Math.floor(this.num(b, 'TO', t))
        if (lo > hi) [lo, hi] = [hi, lo]
        return lo + Math.floor(this.random() * (hi - lo + 1))
      }
      case 'text_join': {
        let s = ''
        for (let i = 0; b.getInput(`ADD${i}`); i++) {
          const c = b.getInputTargetBlock(`ADD${i}`)
          if (c) s += String(this.evalValue(c, t))
        }
        return s
      }
      default:
        throw new BlockError(b.id, '이 블록은 무대에서 실행할 수 없는 블록이야.', 'unsupported')
    }
  }

  /* ── 무대 동작 ───────────────────────────── */
  moveTo(t, x, y, rawDx, rawDy) {
    const s = t.sprite
    const ox = s.x
    const oy = s.y
    s.x = clamp(x, -HALF_W, HALF_W)
    s.y = clamp(y, -HALF_H, HALF_H)
    this.emit({
      type: 'move', sprite: s.id, dx: s.x - ox, dy: s.y - oy,
      rawDx: rawDx ?? s.x - ox, rawDy: rawDy ?? s.y - oy, hat: t.hat.type, key: t.key,
    })
  }

  setDir(t, d) {
    const s = t.sprite
    const from = s.dir
    s.dir = normDir(d)
    this.emit({ type: 'turn', sprite: s.id, from, to: s.dir })
  }

  touching(s, target) {
    if (!s.visible) return false
    const r = spriteRadius(s)
    let hit
    if (target === '__wall__') {
      hit = s.x - r <= -HALF_W || s.x + r >= HALF_W || s.y - r <= -HALF_H || s.y + r >= HALF_H
    } else {
      const o = this.sprites.find((x) => x.id === target)
      hit = !!o && o !== s && o.visible && Math.hypot(o.x - s.x, o.y - s.y) < r + spriteRadius(o)
    }
    if (hit) this.emit({ type: 'touch', sprite: s.id, target })
    return hit
  }

  setVar(id, value) {
    this.vars.set(id, value)
    this.emit({ type: 'var', id, name: this.varName(id), value })
  }

  broadcast(name) {
    const key = String(name).trim()
    const receivers = this.hats('when_receive').filter((h) => String(h.getFieldValue('MSG')).trim() === key)
    this.emit({ type: 'broadcast', name: key, receivers: receivers.length })
    for (const hat of receivers) {
      this.emit({ type: 'receive', name: key, sprite: hat.getFieldValue('SPRITE') })
      this.spawn(hat)
    }
  }

  switchScene(sceneId) {
    const index = (this.project.scenes ?? []).findIndex((s) => s.id === sceneId)
    if (index < 0) return false
    this.sceneId = sceneId
    this.emit({ type: 'scene', sceneId, index })
    for (const hat of this.hats('when_scene_start')) {
      if (hat.getFieldValue('SCENE') === sceneId) this.spawn(hat)
    }
    return true
  }

  /* ── 블록 실행 ───────────────────────────── */
  async execStack(block, t) {
    while (block) {
      if (block.isEnabled()) await this.exec(block, t)
      block = block.getNextBlock()
    }
  }

  async exec(b, t) {
    this.check(t)
    t.current = b.id
    const s = t.sprite
    switch (b.type) {
      case 'move_x': { const dx = this.num(b, 'DX', t); this.moveTo(t, s.x + dx, s.y, dx, 0); break }
      case 'move_y': { const dy = this.num(b, 'DY', t); this.moveTo(t, s.x, s.y + dy, 0, dy); break }
      case 'move_steps': {
        const n = this.num(b, 'STEPS', t)
        const rad = (s.dir * Math.PI) / 180
        const dx = Math.round(Math.sin(rad) * n * 1000) / 1000
        const dy = Math.round(Math.cos(rad) * n * 1000) / 1000
        this.moveTo(t, s.x + dx, s.y + dy, dx, dy)
        break
      }
      case 'goto_xy': {
        const x = this.num(b, 'X', t)
        const y = this.num(b, 'Y', t)
        this.moveTo(t, x, y)
        break
      }
      case 'goto_random': {
        const r = spriteRadius(s)
        this.moveTo(t, Math.round((this.random() * 2 - 1) * (HALF_W - r)), Math.round((this.random() * 2 - 1) * (HALF_H - r)))
        break
      }
      case 'set_dir': this.setDir(t, this.num(b, 'DIR', t)); break
      case 'turn_around': this.setDir(t, s.dir + 180); break
      case 'turn_right': this.setDir(t, s.dir + this.num(b, 'DEG', t)); break

      case 'say':
      case 'text_print': {
        const text = String(this.any(b, 'TEXT', t) ?? '')
        s.say = text === '' ? null : text
        this.emit({ type: 'say', sprite: s.id, text })
        break
      }
      case 'say_secs': {
        const text = String(this.any(b, 'TEXT', t) ?? '')
        const secs = this.num(b, 'SECS', t)
        const token = {}
        s.say = text === '' ? null : text
        s.sayToken = token
        this.emit({ type: 'say', sprite: s.id, text })
        await this.sleep(Math.max(0, secs) * 1000, t)
        if (s.sayToken === token) s.say = null
        break
      }
      case 'show': s.visible = true; this.emit({ type: 'visible', sprite: s.id, visible: true }); break
      case 'hide': s.visible = false; this.emit({ type: 'visible', sprite: s.id, visible: false }); break
      case 'change_size': s.size = clamp(s.size + this.num(b, 'DS', t), 10, 400); break
      case 'set_size': s.size = clamp(this.num(b, 'SIZE', t), 10, 400); break
      case 'play_sound': {
        const id = b.getFieldValue('SOUND')
        this.playSoundHook(id)
        this.emit({ type: 'sound', sprite: s.id, id })
        break
      }

      case 'repeat_n':
      case 'controls_repeat_ext': {
        const n = Math.round(this.num(b, 'TIMES', t))
        if (n < 0) throw new BlockError(b.id, '반복 횟수는 0보다 크거나 같아야 해!', 'value')
        const bodyBlock = b.getInputTargetBlock('DO')
        for (let i = 0; i < n; i++) {
          await this.execStack(bodyBlock, t)
          await this.tick(t)
        }
        break
      }
      case 'forever': {
        const bodyBlock = b.getInputTargetBlock('DO')
        for (;;) {
          await this.execStack(bodyBlock, t)
          await this.tick(t)
        }
      }
      case 'controls_whileUntil': {
        const until = b.getFieldValue('MODE') === 'UNTIL'
        const bodyBlock = b.getInputTargetBlock('DO')
        while (this.bool(b, 'BOOL', t) !== until) {
          await this.execStack(bodyBlock, t)
          await this.tick(t)
        }
        break
      }
      case 'wait': {
        const secs = this.num(b, 'SECS', t)
        if (secs < 0) throw new BlockError(b.id, '기다리는 시간은 0초 이상이어야 해!', 'value')
        await this.sleep(secs * 1000, t)
        break
      }
      case 'stop_all': this.stop('stop_block'); throw STOP

      case 'if_then':
        if (this.bool(b, 'COND', t)) await this.execStack(b.getInputTargetBlock('DO'), t)
        break
      case 'if_else':
        await this.execStack(b.getInputTargetBlock(this.bool(b, 'COND', t) ? 'DO' : 'ELSE'), t)
        break
      case 'controls_if': {
        let done = false
        for (let i = 0; b.getInput(`IF${i}`); i++) {
          if (this.bool(b, `IF${i}`, t)) {
            await this.execStack(b.getInputTargetBlock(`DO${i}`), t)
            done = true
            break
          }
        }
        if (!done && b.getInput('ELSE')) await this.execStack(b.getInputTargetBlock('ELSE'), t)
        break
      }

      case 'var_set':
      case 'variables_set': {
        const raw = this.any(b, 'VALUE', t)
        const n = toNum(raw)
        this.setVar(b.getFieldValue('VAR'), n !== null && String(raw).trim() !== '' ? n : raw)
        break
      }
      case 'var_change':
      case 'math_change': {
        const id = b.getFieldValue('VAR')
        const cur = toNum(this.vars.get(id)) ?? 0
        this.setVar(id, cur + this.num(b, 'DELTA', t))
        break
      }
      case 'var_show': this.shownVars.add(b.getFieldValue('VAR')); break
      case 'var_hide': this.shownVars.delete(b.getFieldValue('VAR')); break

      case 'broadcast': this.broadcast(b.getFieldValue('MSG')); break
      case 'switch_scene':
        if (!this.switchScene(b.getFieldValue('SCENE'))) {
          throw new BlockError(b.id, '이 장면이 없어! 드롭다운에서 장면을 다시 골라줘.', 'value')
        }
        break

      default:
        throw new BlockError(b.id, '이 블록은 무대에서 실행할 수 없는 블록이야.', 'unsupported')
    }
  }
}
