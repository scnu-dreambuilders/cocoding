import { useRef, useState } from 'react'
import { SPRITE_LIBRARY, SCENE_COLORS } from '../data/library'
import { fileToSpriteData, makeSprite, newId, MAX_SCENES } from '../lib/project'

/* ════════════════════════════════════════════════
   캐릭터 패널 — 라이브러리 선택 / 직접 그리기 / 사진 올리기 + 속성 편집
   ════════════════════════════════════════════════ */
export function SpritePanel({ sprites, selectedId, onSelect, onChange, onDraw, onSounds, soundCount, disabled, locked, compact }) {
  const [picker, setPicker] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)
  const selected = sprites.find((s) => s.id === selectedId) ?? sprites[0]

  const uniqueName = (base) => {
    let name = base
    for (let i = 2; sprites.some((s) => s.name === name); i++) name = `${base}${i}`
    return name
  }
  const add = (opts) => {
    const s = makeSprite({ ...opts, name: uniqueName(opts.name), x: Math.round(Math.random() * 200 - 100), y: Math.round(Math.random() * 120 - 60) })
    onChange([...sprites, s])
    onSelect(s.id)
    setPicker(false)
  }
  const update = (patch) => onChange(sprites.map((s) => (s.id === selected.id ? { ...s, ...patch } : s)))
  const remove = () => {
    if (sprites.length <= 1) return
    const rest = sprites.filter((s) => s.id !== selected.id)
    onChange(rest)
    onSelect(rest[0].id)
  }
  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setError('')
      add({ name: file.name.replace(/\.[^.]+$/, '').slice(0, 10) || '사진', image: await fileToSpriteData(file) })
    } catch (err) {
      setError(err.message)
    }
  }
  const numField = (key, label, min, max) => (
    <label className="sp-field">
      <span>{label}</span>
      <input
        type="number" value={Math.round(selected[key])} min={min} max={max} disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) update({ [key]: Math.max(min, Math.min(max, v)) })
        }}
      />
    </label>
  )

  return (
    <div className={`sprite-panel ${compact ? 'compact' : ''}`}>
      <div className="sp-head">
        <span className="panel-label">캐릭터</span>
        <div className="sp-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSounds} disabled={disabled || locked}>
            🎤 소리{soundCount ? ` ${soundCount}` : ''}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPicker((p) => !p)} disabled={disabled || locked}
            aria-expanded={picker}>
            ＋ 캐릭터
          </button>
        </div>
      </div>

      {picker && (
        <div className="sp-picker">
          <div className="sp-picker-actions">
            <button type="button" className="btn btn-run btn-sm" onClick={() => { setPicker(false); onDraw() }}>🎨 직접 그리기</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>🖼️ 사진 올리기</button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={onFile} />
          </div>
          <div className="sp-library" role="list">
            {SPRITE_LIBRARY.map((it) => (
              <button key={it.emoji} type="button" role="listitem" className="sp-lib-item" title={it.name}
                onClick={() => add({ emoji: it.emoji, name: it.name })}>
                <span aria-hidden="true">{it.emoji}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <p className="form-error">{error}</p>}

      <div className="sp-list" role="listbox" aria-label="캐릭터 목록">
        {sprites.map((s) => (
          <button key={s.id} type="button" role="option" aria-selected={s.id === selected?.id}
            className={`sp-tile ${s.id === selected?.id ? 'on' : ''} ${s.visible === false ? 'hidden-sprite' : ''}`}
            onClick={() => onSelect(s.id)}>
            {s.image ? <img src={s.image} alt="" /> : <span className="sp-emoji">{s.emoji}</span>}
            <span className="sp-name">{s.name}</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="sp-props">
          <label className="sp-field sp-field-name">
            <span>이름</span>
            <input value={selected.name} maxLength={12} disabled={disabled || locked}
              onChange={(e) => update({ name: e.target.value })} />
          </label>
          {numField('x', 'x', -240, 240)}
          {numField('y', 'y', -180, 180)}
          {numField('dir', '방향', -180, 180)}
          {numField('size', '크기', 10, 400)}
          <label className="sp-check">
            <input type="checkbox" checked={selected.visible !== false} disabled={disabled}
              onChange={(e) => update({ visible: e.target.checked })} />
            보이기
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={remove}
            disabled={disabled || locked || sprites.length <= 1} title="캐릭터 삭제">🗑️</button>
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════
   장면 탭 — 최대 5장면, 장면마다 배경색
   ════════════════════════════════════════════════ */
export function SceneBar({ scenes, currentId, onSelect, onChange, disabled, locked }) {
  const [editing, setEditing] = useState(null)
  const current = scenes.find((s) => s.id === currentId) ?? scenes[0]

  const add = () => {
    if (scenes.length >= MAX_SCENES) return
    const s = { id: newId('scene'), name: `장면 ${scenes.length + 1}`, bg: SCENE_COLORS[scenes.length % SCENE_COLORS.length] }
    onChange([...scenes, s])
    onSelect(s.id)
  }
  const update = (id, patch) => onChange(scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const remove = (id) => {
    if (scenes.length <= 1) return
    const rest = scenes.filter((s) => s.id !== id)
    onChange(rest)
    onSelect(rest[0].id)
  }

  return (
    <div className="scene-bar">
      <div className="scene-tabs" role="tablist" aria-label="장면">
        {scenes.map((s, i) => (
          editing === s.id ? (
            <input key={s.id} className="scene-rename" autoFocus defaultValue={s.name} maxLength={10}
              onBlur={(e) => { update(s.id, { name: e.target.value.trim() || s.name }); setEditing(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }} />
          ) : (
            <button key={s.id} type="button" role="tab" aria-selected={s.id === current.id}
              className={`scene-tab ${s.id === current.id ? 'on' : ''}`} disabled={disabled}
              onClick={() => onSelect(s.id)}
              onDoubleClick={() => !locked && setEditing(s.id)}
              title={i === 0 ? '첫 장면 (시작하면 이 장면부터) · 더블클릭해서 이름 바꾸기' : '더블클릭해서 이름 바꾸기'}>
              <span className="scene-swatch" style={{ background: s.bg }} aria-hidden="true" />
              {s.name}
            </button>
          )
        ))}
        {!locked && scenes.length < MAX_SCENES && (
          <button type="button" className="scene-tab scene-add" onClick={add} disabled={disabled}>＋ 장면</button>
        )}
      </div>
      {!locked && (
        <div className="scene-colors" aria-label="배경색">
          {SCENE_COLORS.map((c) => (
            <button key={c} type="button" className={`scene-color ${current.bg === c ? 'on' : ''}`} style={{ background: c }}
              onClick={() => update(current.id, { bg: c })} disabled={disabled} aria-label={`배경색 ${c}`} />
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(current.id)}
            disabled={disabled || scenes.length <= 1} title="이 장면 삭제">🗑️</button>
        </div>
      )}
    </div>
  )
}
