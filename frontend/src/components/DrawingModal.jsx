import { useEffect, useRef, useState } from 'react'
import { canvasToSpriteData } from '../lib/project'

/* ════════════════════════════════════════════════
   캐릭터 직접 그리기 (HTML5 Canvas 2D, 외부 라이브러리 없음)
   펜 · 지우개 · 사각형 · 원 · 색채우기 / 16색 / 굵기 / 실행취소
   ════════════════════════════════════════════════ */
const SIZE = 360
const COLORS = ['#0f172a', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6',
  '#ec4899', '#a16207', '#94a3b8', '#fecaca', '#fde68a', '#bbf7d0', '#bfdbfe', '#e9d5ff']
const TOOLS = [
  { id: 'pen', label: '펜', icon: '✏️' },
  { id: 'eraser', label: '지우개', icon: '🧽' },
  { id: 'rect', label: '사각형', icon: '⬛' },
  { id: 'circle', label: '원', icon: '⚪' },
  { id: 'fill', label: '색채우기', icon: '🪣' },
]

function hexToRgba(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]
}

// 스캔라인 flood fill, 허용 오차 30
function floodFill(ctx, sx, sy, hex) {
  const img = ctx.getImageData(0, 0, SIZE, SIZE)
  const d = img.data
  const idx = (x, y) => (y * SIZE + x) * 4
  const target = d.slice(idx(sx, sy), idx(sx, sy) + 4)
  const fill = hexToRgba(hex)
  const same = (i) => Math.abs(d[i] - target[0]) <= 30 && Math.abs(d[i + 1] - target[1]) <= 30
    && Math.abs(d[i + 2] - target[2]) <= 30 && Math.abs(d[i + 3] - target[3]) <= 30
  if (fill.every((v, i) => Math.abs(v - target[i]) <= 2)) return
  const stack = [[sx, sy]]
  const seen = new Uint8Array(SIZE * SIZE)
  while (stack.length) {
    const [x0, y] = stack.pop()
    let x = x0
    while (x >= 0 && !seen[y * SIZE + x] && same(idx(x, y))) x--
    x++
    let up = false
    let down = false
    while (x < SIZE && !seen[y * SIZE + x] && same(idx(x, y))) {
      const i = idx(x, y)
      d[i] = fill[0]; d[i + 1] = fill[1]; d[i + 2] = fill[2]; d[i + 3] = 255
      seen[y * SIZE + x] = 1
      if (y > 0) {
        const u = same(idx(x, y - 1)) && !seen[(y - 1) * SIZE + x]
        if (u && !up) stack.push([x, y - 1])
        up = u
      }
      if (y < SIZE - 1) {
        const w = same(idx(x, y + 1)) && !seen[(y + 1) * SIZE + x]
        if (w && !down) stack.push([x, y + 1])
        down = w
      }
      x++
    }
  }
  ctx.putImageData(img, 0, 0)
}

function trimmedCanvas(src) {
  const ctx = src.getContext('2d')
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE)
  let minX = SIZE, minY = SIZE, maxX = -1, maxY = -1
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (data[(y * SIZE + x) * 4 + 3] > 10) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  const pad = 4
  const w = maxX - minX + 1 + pad * 2
  const h = maxY - minY + 1 + pad * 2
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  c.getContext('2d').drawImage(src, minX - pad, minY - pad, w, h, 0, 0, w, h)
  return c
}

export default function DrawingModal({ onDone, onClose }) {
  const canvasRef = useRef(null)
  const drawRef = useRef(null)
  const undoRef = useRef([])
  const [tool, setTool] = useState('pen')
  const [color, setColor] = useState('#8b5cf6')
  const [width, setWidth] = useState(6)
  const [name, setName] = useState('내 캐릭터')
  const [canUndo, setCanUndo] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const ctx = () => canvasRef.current.getContext('2d')
  const pos = (e) => {
    const r = canvasRef.current.getBoundingClientRect()
    return [Math.floor(((e.clientX - r.left) / r.width) * SIZE), Math.floor(((e.clientY - r.top) / r.height) * SIZE)]
  }
  const pushUndo = () => {
    undoRef.current.push(ctx().getImageData(0, 0, SIZE, SIZE))
    if (undoRef.current.length > 20) undoRef.current.shift()
    setCanUndo(true)
  }
  function undo() {
    const snap = undoRef.current.pop()
    if (snap) ctx().putImageData(snap, 0, 0)
    setCanUndo(undoRef.current.length > 0)
  }
  const clearAll = () => {
    pushUndo()
    ctx().clearRect(0, 0, SIZE, SIZE)
  }

  const onDown = (e) => {
    const [x, y] = pos(e)
    const c = ctx()
    pushUndo()
    if (tool === 'fill') {
      floodFill(c, Math.min(SIZE - 1, Math.max(0, x)), Math.min(SIZE - 1, Math.max(0, y)), color)
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    drawRef.current = { x, y, snap: c.getImageData(0, 0, SIZE, SIZE) }
    if (tool === 'pen' || tool === 'eraser') {
      c.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
      c.strokeStyle = color
      c.fillStyle = color
      c.lineWidth = tool === 'eraser' ? width * 2 : width
      c.lineCap = 'round'
      c.lineJoin = 'round'
      c.beginPath()
      c.arc(x, y, c.lineWidth / 2, 0, Math.PI * 2)
      c.fill()
      c.beginPath()
      c.moveTo(x, y)
    }
  }
  const onMove = (e) => {
    const d = drawRef.current
    if (!d) return
    const [x, y] = pos(e)
    const c = ctx()
    if (tool === 'pen' || tool === 'eraser') {
      c.lineTo(x, y)
      c.stroke()
    } else {
      c.putImageData(d.snap, 0, 0)
      c.globalCompositeOperation = 'source-over'
      c.fillStyle = color
      c.beginPath()
      if (tool === 'rect') c.rect(Math.min(d.x, x), Math.min(d.y, y), Math.abs(x - d.x), Math.abs(y - d.y))
      else c.ellipse((d.x + x) / 2, (d.y + y) / 2, Math.abs(x - d.x) / 2, Math.abs(y - d.y) / 2, 0, 0, Math.PI * 2)
      c.fill()
    }
  }
  const onUp = () => {
    drawRef.current = null
    ctx().globalCompositeOperation = 'source-over'
  }

  const finish = () => {
    const trimmed = trimmedCanvas(canvasRef.current)
    if (!trimmed) {
      setError('캔버스에 그림을 그려주세요!')
      return
    }
    onDone({ name: name.trim() || '내 캐릭터', image: canvasToSpriteData(trimmed, 160) })
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="캐릭터 그리기">
      <div className="modal draw-modal">
        <div className="modal-head">
          <h3>🎨 나만의 캐릭터 그리기</h3>
          <button type="button" className="modal-x" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <div className="draw-body">
          <div className="draw-tools">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" className={`draw-tool ${tool === t.id ? 'on' : ''}`}
                onClick={() => setTool(t.id)} title={t.label}>
                <span aria-hidden="true">{t.icon}</span>
                <small>{t.label}</small>
              </button>
            ))}
            <label className="draw-width" title="굵기">
              굵기 {width}
              <input type="range" min="1" max="30" value={width} onChange={(e) => setWidth(Number(e.target.value))} />
            </label>
            <button type="button" className="draw-tool" onClick={undo} disabled={!canUndo} title="실행취소 (Ctrl+Z)">
              <span aria-hidden="true">↩️</span><small>되돌리기</small>
            </button>
            <button type="button" className="draw-tool" onClick={clearAll} title="전체 지우기">
              <span aria-hidden="true">🗑️</span><small>다 지우기</small>
            </button>
          </div>
          <canvas
            ref={canvasRef}
            width={SIZE}
            height={SIZE}
            className={`draw-canvas tool-${tool}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          <div className="draw-colors" role="radiogroup" aria-label="색상">
            {COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c}
                className={`draw-color ${color === c ? 'on' : ''}`} style={{ background: c }}
                onClick={() => setColor(c)} />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="다른 색 고르기" />
          </div>
        </div>
        <div className="modal-foot">
          <label className="draw-name">
            이름
            <input value={name} maxLength={12} onChange={(e) => setName(e.target.value)} />
          </label>
          {error && <span className="form-error">{error}</span>}
          <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
          <button type="button" className="btn btn-run" onClick={finish}>완료 — 무대에 올리기</button>
        </div>
      </div>
    </div>
  )
}
