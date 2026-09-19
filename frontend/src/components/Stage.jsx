import { useEffect, useRef } from 'react'
import { STAGE_W, STAGE_H, HALF_W, HALF_H, SPRITE_PX, spriteRadius } from '../engine/runtime'

/* ════════════════════════════════════════════════
   무대 — 캔버스 480×360 (x: -240~240, y: -180~180)
   getView()를 매 프레임 읽어서 그린다 (실행 중에는 런타임 상태,
   멈춰 있을 때는 프로젝트의 캐릭터 배치)
   ════════════════════════════════════════════════ */
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'
const imageCache = new Map()
function getImage(src) {
  let img = imageCache.get(src)
  if (!img) {
    img = new Image()
    img.src = src
    imageCache.set(src, img)
  }
  return img.complete && img.naturalWidth ? img : null
}

const toCanvas = (x, y) => [x + HALF_W, HALF_H - y]

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16)
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 < 110
}

function drawGrid(ctx, dark) {
  ctx.save()
  ctx.lineWidth = 1
  for (let x = -240; x <= 240; x += 30) {
    const major = x % 120 === 0
    ctx.strokeStyle = x === 0 ? (dark ? 'rgba(255,255,255,.55)' : 'rgba(15,23,42,.45)')
      : major ? (dark ? 'rgba(255,255,255,.25)' : 'rgba(15,23,42,.2)') : (dark ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.07)')
    const [cx] = toCanvas(x, 0)
    ctx.beginPath(); ctx.moveTo(cx + 0.5, 0); ctx.lineTo(cx + 0.5, STAGE_H); ctx.stroke()
  }
  for (let y = -180; y <= 180; y += 30) {
    const major = y % 90 === 0
    ctx.strokeStyle = y === 0 ? (dark ? 'rgba(255,255,255,.55)' : 'rgba(15,23,42,.45)')
      : major ? (dark ? 'rgba(255,255,255,.25)' : 'rgba(15,23,42,.2)') : (dark ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.07)')
    const [, cy] = toCanvas(0, y)
    ctx.beginPath(); ctx.moveTo(0, cy + 0.5); ctx.lineTo(STAGE_W, cy + 0.5); ctx.stroke()
  }
  ctx.fillStyle = dark ? 'rgba(255,255,255,.8)' : 'rgba(15,23,42,.7)'
  ctx.font = 'bold 10px system-ui, sans-serif'
  for (const x of [-240, -120, 0, 120, 240]) {
    const [cx, cy] = toCanvas(x, 0)
    ctx.textAlign = x === -240 ? 'left' : x === 240 ? 'right' : 'center'
    ctx.fillText(`x:${x}`, cx + (x === 0 ? 14 : 0), cy + 13)
  }
  for (const y of [-180, -90, 90, 180]) {
    const [cx, cy] = toCanvas(0, y)
    ctx.textAlign = 'left'
    ctx.fillText(`y:${y}`, cx + 4, cy + (y === 180 ? 11 : y === -180 ? -4 : 4))
  }
  ctx.restore()
}

function wrapText(ctx, text, maxW) {
  const lines = []
  let line = ''
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      lines.push(line)
      line = ch
    } else line += ch
  }
  if (line) lines.push(line)
  return lines.slice(0, 4)
}

function drawBubble(ctx, s) {
  const [cx, cy] = toCanvas(s.x, s.y)
  const r = (SPRITE_PX / 2) * (s.size / 100)
  ctx.save()
  ctx.font = '600 13px system-ui, "Malgun Gothic", sans-serif'
  const lines = wrapText(ctx, s.say, 150)
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 20
  const h = lines.length * 17 + 12
  let bx = cx + r * 0.4
  let by = cy - r - h - 8
  if (bx + w > STAGE_W - 4) bx = cx - r * 0.4 - w
  bx = Math.max(4, bx)
  by = Math.max(4, by)
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = 'rgba(15,23,42,.25)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.roundRect(bx, by, w, h, 10)
  ctx.fill(); ctx.stroke()
  ctx.fillStyle = '#0f172a'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  lines.forEach((l, i) => ctx.fillText(l, bx + 10, by + 7 + i * 17))
  ctx.restore()
}

function drawSprite(ctx, s, selected) {
  const [cx, cy] = toCanvas(s.x, s.y)
  const px = SPRITE_PX * (s.size / 100)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(((s.dir - 90) * Math.PI) / 180)
  const img = s.image ? getImage(s.image) : null
  if (img) {
    const k = px / Math.max(img.naturalWidth, img.naturalHeight)
    ctx.drawImage(img, (-img.naturalWidth * k) / 2, (-img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k)
  } else {
    ctx.font = `${Math.round(px * 0.85)}px ${EMOJI_FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(s.emoji ?? '❓', 0, px * 0.05)
  }
  ctx.restore()
  if (selected) {
    ctx.save()
    ctx.setLineDash([4, 3])
    ctx.strokeStyle = '#7c3aed'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cy, spriteRadius(s) + 8, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}

function drawMonitors(ctx, monitors) {
  ctx.save()
  ctx.font = '600 12px system-ui, "Malgun Gothic", sans-serif'
  ctx.textBaseline = 'middle'
  let y = 8
  for (const m of monitors) {
    const label = `${m.name}`
    const value = `${typeof m.value === 'number' ? Math.round(m.value * 100) / 100 : m.value}`
    const lw = ctx.measureText(label).width
    const vw = Math.max(22, ctx.measureText(value).width + 12)
    ctx.fillStyle = 'rgba(255,255,255,.92)'
    ctx.strokeStyle = 'rgba(15,23,42,.2)'
    ctx.beginPath(); ctx.roundRect(8, y, lw + vw + 20, 24, 6); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#334155'; ctx.fillText(label, 16, y + 12)
    ctx.fillStyle = '#FF8C1A'
    ctx.beginPath(); ctx.roundRect(lw + 22, y + 3, vw, 18, 4); ctx.fill()
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(value, lw + 22 + vw / 2, y + 12); ctx.textAlign = 'left'
    y += 30
  }
  ctx.restore()
}

export default function Stage({ getView, showGrid, selectedId, onSelect, onDragSprite, onClickSprite, canvasRef }) {
  const innerRef = useRef(null)
  const coordRef = useRef(null)
  const dragRef = useRef(null)
  const propsRef = useRef({ getView, showGrid, selectedId, onSelect, onDragSprite, onClickSprite })
  useEffect(() => {
    propsRef.current = { getView, showGrid, selectedId, onSelect, onDragSprite, onClickSprite }
  })

  /* 렌더 루프 */
  useEffect(() => {
    const canvas = innerRef.current
    if (canvasRef) canvasRef.current = canvas
    const ctx = canvas.getContext('2d')
    let raf
    const render = () => {
      const { getView: gv, showGrid: grid, selectedId: sel } = propsRef.current
      const view = gv()
      const bg = view.scene?.bg ?? '#eef2ff'
      const dark = isDark(bg)
      ctx.clearRect(0, 0, STAGE_W, STAGE_H)
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, STAGE_W, STAGE_H)
      if (grid) drawGrid(ctx, dark)
      for (const s of view.sprites) if (s.visible !== false) drawSprite(ctx, s, !view.running && s.id === sel)
      for (const s of view.sprites) if (s.visible !== false && s.say) drawBubble(ctx, s)
      if (view.monitors?.length) drawMonitors(ctx, view.monitors)
      raf = requestAnimationFrame(render)
    }
    render()
    return () => cancelAnimationFrame(raf)
  }, [canvasRef])

  /* 포인터: 좌표 표시 / 캐릭터 끌어서 배치 / 실행 중 클릭 */
  const toStage = (e) => {
    const rect = innerRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * STAGE_W - HALF_W
    const y = HALF_H - ((e.clientY - rect.top) / rect.height) * STAGE_H
    return [Math.round(x), Math.round(y)]
  }
  const hitTest = (x, y) => {
    const { sprites } = propsRef.current.getView()
    for (let i = sprites.length - 1; i >= 0; i--) {
      const s = sprites[i]
      if (s.visible !== false && Math.hypot(s.x - x, s.y - y) <= spriteRadius(s) + 6) return s
    }
    return null
  }

  const onPointerDown = (e) => {
    const [x, y] = toStage(e)
    const hit = hitTest(x, y)
    const { getView: gv, onClickSprite: click, onSelect: select } = propsRef.current
    if (gv().running) {
      if (hit) click?.(hit.id)
      return
    }
    if (!hit) return
    select?.(hit.id)
    dragRef.current = { id: hit.id, ox: hit.x - x, oy: hit.y - y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    const [x, y] = toStage(e)
    if (coordRef.current) coordRef.current.textContent = `x: ${x}  y: ${y}`
    const d = dragRef.current
    if (d) {
      const nx = Math.max(-HALF_W, Math.min(HALF_W, x + d.ox))
      const ny = Math.max(-HALF_H, Math.min(HALF_H, y + d.oy))
      propsRef.current.onDragSprite?.(d.id, Math.round(nx), Math.round(ny))
    }
  }
  const onPointerUp = () => { dragRef.current = null }
  const onPointerLeave = () => { if (coordRef.current) coordRef.current.textContent = '' }

  return (
    <div className="stage-wrap">
      <canvas
        ref={innerRef}
        width={STAGE_W}
        height={STAGE_H}
        className="stage-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        aria-label="실행 무대"
      />
      <span className="stage-coords" ref={coordRef} aria-hidden="true" />
    </div>
  )
}
