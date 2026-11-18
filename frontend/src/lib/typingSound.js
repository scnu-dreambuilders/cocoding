// frontend/src/lib/typingSound.js
// 게임존 타자게임 전용 효과음 — Web Audio로 직접 만든 짧은 소리 (외부 음원·패키지 없음)
//
// · AudioContext는 켜진 상태에서 사용자 동작(클릭·키 입력)이 있을 때 처음 만들고, 엔진 하나당 하나만 쓴다.
// · 꺼진 상태에서는 만들기·재개·재생을 하지 않는다.
// · 재생할 수 없는 순간(재개 대기 중 등)의 소리는 버린다 — 모았다가 나중에 한꺼번에 내지 않는다.
// · 오디오 실패는 여기서만 삼킨다. 호출하는 쪽의 입력·판정 코드는 감싸지 않는다.

// 소리를 내는 물리 키 (한글 조합 중에는 key가 'Process'라서 code로 판단한다)
const TYPING_KEY_CODES = /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Space|Backspace|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote|IntlBackslash|IntlRo|IntlYen)$/

// 타건음 대상 키인가: 길게 누른 반복·단축키 조합·code가 없는 이벤트(모바일 가상 키보드 등)는 제외
export function isTypingKey(e) {
  if (!e || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return false
  return typeof e.code === 'string' && TYPING_KEY_CODES.test(e.code)
}

// 이 브라우저에 Web Audio가 있는가 (확인만 하고 AudioContext는 만들지 않는다)
export const canPlayTypingSound = () =>
  typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext)

const MASTER_GAIN = 0.5
const TICK_GAP = 0.03      // 타건음 사이 최소 간격(초) — 빠른 연타에서 겹침 줄이기
const MAX_TICKS = 4        // 동시에 울리는 타건음 수 제한
const ATTACK = 0.004       // 4ms에 걸쳐 커진다 (딸깍 잡음 방지)
const SILENT = 0.0001      // 지수 감쇠의 끝값 (0으로는 지수 감쇠를 할 수 없다)

export function createTypingSound() {
  let ctx = null
  let master = null
  let enabled = false
  let closed = false
  let lastTickAt = -Infinity
  const voices = new Set()

  // 켜져 있고 닫히지 않았을 때만 컨텍스트를 만든다
  const ensure = () => {
    if (closed || !enabled) return null
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      ctx = new AC()
      master = ctx.createGain()
      master.gain.value = MASTER_GAIN
      master.connect(ctx.destination)
    }
    return ctx.state === 'closed' ? null : ctx
  }

  // 바로 소리 낼 수 있는 컨텍스트만 돌려준다. 멈춰 있으면 재개만 요청하고 이번 소리는 버린다.
  const running = () => {
    const c = ensure()
    if (!c) return null
    if (c.state === 'running') return c
    resume(c)
    return null
  }

  const resume = (c) => {
    c.resume()
      .then(() => {
        // 재개를 기다리는 사이 소리를 껐다면 다시 멈춘다 (닫힌 뒤라면 아무것도 하지 않는다)
        if (!closed && !enabled && c.state === 'running') c.suspend().catch(() => {})
      })
      .catch(() => {})
  }

  // 짧은 음 하나: 4ms에 커졌다가 dur 동안 지수로 사라진다. 높은 소리는 low-pass로 부드럽게.
  const tone = (c, { kind, type, from, to, peak, start = 0, dur }) => {
    const t0 = c.currentTime + start
    const osc = c.createOscillator()
    const filter = c.createBiquadFilter()
    const gain = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, t0)
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur)
    filter.type = 'lowpass'
    filter.frequency.value = 2200
    gain.gain.setValueAtTime(SILENT, t0)
    gain.gain.linearRampToValueAtTime(peak, t0 + ATTACK)
    gain.gain.exponentialRampToValueAtTime(SILENT, t0 + dur)
    osc.connect(filter)
    filter.connect(gain)
    gain.connect(master)
    const voice = { kind, osc, gain, nodes: [osc, filter, gain] }
    voices.add(voice)
    osc.onended = () => {
      voices.delete(voice)
      voice.nodes.forEach((n) => { try { n.disconnect() } catch { /* 이미 끊김 */ } })
    }
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  // 울리는 소리를 빠르게 줄여 멈춘다 (kind를 주면 그 종류만)
  const stopVoices = (kind) => {
    if (!ctx) return
    const now = ctx.currentTime
    voices.forEach((v) => {
      if (kind && v.kind !== kind) return
      try {
        v.gain.gain.cancelScheduledValues(now)
        v.gain.gain.setTargetAtTime(0, now, 0.005)
        v.osc.stop(now + 0.03)
      } catch { /* 이미 멈춤 */ }
    })
  }

  return {
    // 켜기/끄기. 켤 때는 사용자 동작 안에서 불러야 브라우저가 재생을 허락한다.
    setEnabled(on) {
      try {
        enabled = !!on && !closed
        if (enabled) {
          const c = ensure()
          if (c && c.state !== 'running') resume(c)
        } else if (ctx && ctx.state === 'running') {
          stopVoices()
          ctx.suspend().catch(() => {})
        }
      } catch { /* 오디오 실패는 무시 — 게임은 그대로 */ }
    },

    // 짧고 부드러운 ‘톡’
    tick() {
      try {
        const c = running()
        if (!c) return
        if (c.currentTime - lastTickAt < TICK_GAP) return
        let ticks = 0
        voices.forEach((v) => { if (v.kind === 'tick') ticks += 1 })
        if (ticks >= MAX_TICKS) return
        lastTickAt = c.currentTime
        tone(c, { kind: 'tick', type: 'triangle', from: 520, to: 360, peak: 0.08, dur: 0.06 })
      } catch { /* 오디오 실패는 무시 */ }
    },

    // 정답음: 두 음이 짧게 올라간다. 남아 있는 타건음을 먼저 정리해 타건음 제한에 걸리지 않는다.
    success() {
      try {
        const c = running()
        if (!c) return
        stopVoices('tick')
        tone(c, { kind: 'success', type: 'sine', from: 660, peak: 0.1, dur: 0.11 })
        tone(c, { kind: 'success', type: 'sine', from: 880, peak: 0.1, start: 0.09, dur: 0.16 })
      } catch { /* 오디오 실패는 무시 */ }
    },

    // 완전히 정리. 여러 번 불러도 안전하고, 닫힌 뒤에는 어떤 소리도 내지 않는다.
    dispose() {
      if (closed) return
      closed = true
      enabled = false
      try {
        stopVoices()
        if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {})
      } catch { /* 오디오 실패는 무시 */ }
      voices.clear()
      ctx = null
      master = null
    },
  }
}
