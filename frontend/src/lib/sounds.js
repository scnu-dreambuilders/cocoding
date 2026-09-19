/* 기본 효과음 8종 — 파일 없이 Web Audio API(Oscillator + Gain)로 합성
   + 녹음한 소리(data URL) 재생 */

let ctx = null
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function tone(ac, { type = 'sine', from, to = from, start = 0, dur = 0.15, vol = 0.25 }) {
  const t0 = ac.currentTime + start
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(from, t0)
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur)
  gain.gain.setValueAtTime(vol, t0)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
  osc.connect(gain).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

function noise(ac, { dur = 0.4, vol = 0.35 }) {
  const len = Math.floor(ac.sampleRate * dur)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2
  const src = ac.createBufferSource()
  const gain = ac.createGain()
  gain.gain.value = vol
  src.buffer = buf
  src.connect(gain).connect(ac.destination)
  src.start()
}

const SFX = {
  'sfx:jump': (ac) => tone(ac, { type: 'square', from: 220, to: 660, dur: 0.18, vol: 0.12 }),
  'sfx:coin': (ac) => { tone(ac, { type: 'square', from: 988, dur: 0.08, vol: 0.1 }); tone(ac, { type: 'square', from: 1319, start: 0.08, dur: 0.25, vol: 0.1 }) },
  'sfx:hit': (ac) => tone(ac, { type: 'sawtooth', from: 180, to: 60, dur: 0.2, vol: 0.2 }),
  'sfx:boom': (ac) => { noise(ac, { dur: 0.6 }); tone(ac, { type: 'sine', from: 120, to: 30, dur: 0.5, vol: 0.4 }) },
  'sfx:win': (ac) => [523, 659, 784, 1047].forEach((f, i) => tone(ac, { type: 'triangle', from: f, start: i * 0.1, dur: 0.18, vol: 0.2 })),
  'sfx:lose': (ac) => [392, 330, 262].forEach((f, i) => tone(ac, { type: 'triangle', from: f, to: f * 0.95, start: i * 0.18, dur: 0.25, vol: 0.2 })),
  'sfx:click': (ac) => tone(ac, { type: 'square', from: 1500, to: 800, dur: 0.03, vol: 0.12 }),
  'sfx:magic': (ac) => [880, 1175, 1568, 1976, 2349].forEach((f, i) => tone(ac, { type: 'sine', from: f, start: i * 0.06, dur: 0.3, vol: 0.12 })),
}

export function playSound(id, recorded = []) {
  const ac = audio()
  if (SFX[id]) {
    if (ac) SFX[id](ac)
    return
  }
  const rec = recorded.find((s) => s.id === id)
  if (rec?.data) {
    const el = new Audio(rec.data)
    el.play().catch(() => {})
  }
}

/* 녹음: MediaRecorder → data URL (최대 maxMs) */
export async function startRecording({ maxMs = 5000, onStop }) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new MediaRecorder(stream)
  const chunks = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const timer = setTimeout(() => recorder.state === 'recording' && recorder.stop(), maxMs)
  recorder.onstop = () => {
    clearTimeout(timer)
    stream.getTracks().forEach((t) => t.stop())
    const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
    const reader = new FileReader()
    reader.onload = () => onStop(reader.result)
    reader.readAsDataURL(blob)
  }
  recorder.start()
  return {
    stop: () => recorder.state === 'recording' && recorder.stop(),
    cancel: () => {
      recorder.onstop = () => stream.getTracks().forEach((t) => t.stop())
      if (recorder.state === 'recording') recorder.stop()
      clearTimeout(timer)
    },
  }
}
