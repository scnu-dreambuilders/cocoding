import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, RotateCcw, Save, Undo2 } from 'lucide-react'
import { api } from '../api/client.js'
import ConfirmDialog from '../components/ConfirmDialog.jsx'
import { ErrorState } from '../components/ui.jsx'
import { num } from '../lib/format.js'
import { confirmLeave, setDirty } from '../lib/route.js'

/* 운영 기준값 — backend/api/admin/settings.php (요청서 5번)
   항목 이름·묶음·설명·범위는 서버의 settings 배열로만 그린다 (화면에 하드코딩하지 않는다).
   저장은 '전부 아니면 전부'가 아니다: saved 는 저장된 항목, errors 는 항목별 거절 이유.
   기준값은 저장하는 순간 서비스에 반영된다 (서버에 캐시 없음) — 저장 전에 바뀌는 값을 한 번 더 보여 준다 */
const DIRTY_KEY = 'settings-form'

// 서버 응답의 settings 한 줄이 그릴 수 있는 모양인지
const isItem = (s) => s && typeof s.name === 'string' && Number.isFinite(Number(s.value))
// PHP 는 빈 연관 배열을 [] 로 보낸다 → 항목 이름 → 문장 객체로 맞춘다
function errorMap(errors) {
  if (!errors || Array.isArray(errors) || typeof errors !== 'object') return {}
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => typeof v === 'string'))
}
function groupsOf(settings) {
  const order = []
  const map = new Map()
  for (const s of settings) {
    const g = typeof s.group === 'string' && s.group ? s.group : '기타'
    if (!map.has(g)) { map.set(g, []); order.push(g) }
    map.get(g).push(s)
  }
  return order.map((g) => ({ group: g, items: map.get(g) }))
}
// 입력값 검사 — 서버(Settings::set)와 같은 기준(정수, min~max). 최종 판단은 서버
function checkDraft(item, text) {
  const t = String(text).trim()
  if (!/^-?\d+$/.test(t)) return `${item.label ?? item.name}은 정수로 적어 주세요.`
  const n = Number(t)
  if (Number.isFinite(item.min) && n < item.min) return `${item.min}부터 ${item.max}까지만 넣을 수 있어요.`
  if (Number.isFinite(item.max) && n > item.max) return `${item.min}부터 ${item.max}까지만 넣을 수 있어요.`
  return ''
}

export default function SettingsPage({ onForbidden }) {
  const [state, setState] = useState({ loading: true, settings: null, error: null })
  const [drafts, setDrafts] = useState({})    // name → 입력 중인 글자 (지금 값과 다를 때만)
  const [resets, setResets] = useState([])    // 기본값으로 되돌릴 name
  const [fieldErrors, setFieldErrors] = useState({}) // 서버가 거절한 이유 name → 문장
  const [result, setResult] = useState(null)  // 마지막 저장 결과 { kind, text, saved: [{ label, before, after }] }
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const alive = useRef(true)
  const seq = useRef(0)

  const load = useCallback(() => {
    const my = ++seq.current
    api.settings().then(
      (data) => {
        if (!alive.current || my !== seq.current) return
        if (!Array.isArray(data?.settings)) {
          setState({ loading: false, settings: null, error: Object.assign(new Error('기준값 응답을 읽을 수 없어요.'), { kind: 'parse' }) })
          return
        }
        setState({ loading: false, settings: data.settings.filter(isItem), error: null })
      },
      (error) => {
        if (!alive.current || my !== seq.current) return
        setState((s) => ({ ...s, loading: false, error }))
        if (error.kind === 'forbidden') onForbidden()
      },
    )
  }, [onForbidden])
  // 다시 불러오기 (처음 불러오기는 state 의 loading: true 로 시작한다)
  const reload = () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    load()
  }

  useEffect(() => {
    alive.current = true
    load()
    return () => { alive.current = false; seq.current += 1; setDirty(DIRTY_KEY, false) }
  }, [load])

  const dirty = Object.keys(drafts).length > 0 || resets.length > 0
  useEffect(() => { setDirty(DIRTY_KEY, dirty) }, [dirty])

  const { settings, loading, error } = state
  const byName = new Map((settings ?? []).map((s) => [s.name, s]))

  const setDraft = (item, text) => {
    setResult(null)
    setFieldErrors((e) => { const next = { ...e }; delete next[item.name]; return next })
    setResets((r) => r.filter((n) => n !== item.name))
    setDrafts((d) => {
      const next = { ...d }
      if (String(text).trim() === String(item.value)) delete next[item.name]
      else next[item.name] = text
      return next
    })
  }
  const toggleReset = (item) => {
    setResult(null)
    setFieldErrors((e) => { const next = { ...e }; delete next[item.name]; return next })
    setDrafts((d) => { const next = { ...d }; delete next[item.name]; return next })
    setResets((r) => (r.includes(item.name) ? r.filter((n) => n !== item.name) : [...r, item.name]))
  }
  const discard = () => {
    setDrafts({}); setResets([]); setFieldErrors({}); setResult(null)
  }

  // 저장할 변경 목록 (변경 전 → 후)
  const localErrors = Object.fromEntries(Object.entries(drafts)
    .map(([name, text]) => [name, byName.has(name) ? checkDraft(byName.get(name), text) : ''])
    .filter(([, msg]) => msg))
  const changes = [
    ...Object.entries(drafts).filter(([name]) => byName.has(name)).map(([name, text]) => {
      const item = byName.get(name)
      return { name, label: item.label ?? name, before: Number(item.value), after: Number(String(text).trim()), reset: false }
    }),
    ...resets.filter((name) => byName.has(name)).map((name) => {
      const item = byName.get(name)
      return { name, label: item.label ?? name, before: Number(item.value), after: Number(item.default), reset: true }
    }),
  ]
  // 다시 불러오는 동안에는 입력·저장을 막는다 (불러온 값과 입력 중인 값이 섞이지 않게)
  const canSave = changes.length > 0 && Object.keys(localErrors).length === 0 && !busy && !loading

  const save = async () => {
    if (busyRef.current || !canSave) return
    busyRef.current = true
    // 저장 시작 — 진행 중이던 조회는 버린다. 저장보다 늦게 온 옛 조회 응답이 저장 결과를 덮지 않게
    seq.current += 1
    setState((s) => (s.loading ? { ...s, loading: false } : s))
    setBusy(true)
    const sent = changes
    const values = Object.fromEntries(sent.filter((c) => !c.reset).map((c) => [c.name, c.after]))
    const reset = sent.filter((c) => c.reset).map((c) => c.name)
    try {
      const res = await api.saveSettings({ values, reset })
      if (!alive.current) return
      // 모양이 다르면 성공으로 치지 않는다 — 입력은 그대로 두고 다시 불러오게 한다
      if (!Array.isArray(res?.settings) || !Array.isArray(res?.saved)) {
        setResult({ kind: 'error', text: '저장 응답을 읽을 수 없어요. 저장됐는지 확실하지 않으니 새로고침으로 지금 값을 확인해 주세요.', saved: [] })
        return
      }
      const savedNames = new Set(res.saved.map(String))
      const errs = errorMap(res.errors)
      const nextSettings = res.settings.filter(isItem)
      const after = new Map(nextSettings.map((s) => [s.name, s]))
      setState({ loading: false, settings: nextSettings, error: null })
      // 저장된 칸은 입력을 비우고, 거절된 칸은 입력을 남겨 그 아래에 이유를 붙인다
      setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([n]) => !savedNames.has(n))))
      setResets((r) => r.filter((n) => !savedNames.has(n)))
      setFieldErrors(errs)
      const unknown = Object.keys(errs).filter((n) => !after.has(n))
      const savedList = sent.filter((c) => savedNames.has(c.name))
        .map((c) => ({ label: c.label, before: c.before, after: after.has(c.name) ? Number(after.get(c.name).value) : c.after }))
      const failed = Object.keys(errs).length
      const kind = failed === 0 && savedList.length > 0 ? 'ok' : savedList.length > 0 ? 'warn' : 'error'
      const extra = unknown.length ? ` 화면에 없는 항목에 대한 오류: ${unknown.map((n) => `${n} — ${errs[n]}`).join(' / ')}` : ''
      setResult({ kind, text: `${res.message ?? ''}${extra}`.trim() || (kind === 'ok' ? '저장했어요.' : '저장하지 못한 항목이 있어요.'), saved: savedList })
    } catch (err) {
      if (!alive.current) return
      setResult({ kind: 'error', text: err.message, saved: [] })
      if (err.kind === 'forbidden') onForbidden()
    } finally {
      busyRef.current = false
      if (alive.current) { setBusy(false); setConfirming(false) }
    }
  }

  const reloadAll = () => {
    if (dirty && !confirmLeave()) return
    discard()
    reload()
  }

  // 크게 바뀌는 값은 확인 창에서 강조한다 (두 배 넘게 늘거나 최댓값)
  const isBig = (c) => {
    const item = byName.get(c.name)
    return c.after > c.before && ((c.before > 0 && c.after >= c.before * 2) || (Number.isFinite(item?.max) && c.after === item.max))
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>운영 기준값</h1>
          <p>저장하면 바로 서비스에 반영돼요. 항목과 범위는 서버가 알려 준 대로 보여요.</p>
        </div>
        <button type="button" className="btn" onClick={reloadAll} disabled={loading || busy}>
          <RefreshCw size={16} aria-hidden="true" /> {loading ? '불러오는 중…' : '새로고침'}
        </button>
      </div>

      <ErrorState error={error} onRetry={reload} />
      {!settings && loading && <div className="skeleton" aria-label="불러오는 중" />}

      {result && (
        <div className={`notice ${result.kind}`} role={result.kind === 'ok' ? 'status' : 'alert'}>
          <p>{result.text}</p>
          {result.saved.length > 0 && (
            <ul className="reasons" style={{ marginTop: 6 }}>
              {result.saved.map((s) => <li key={s.label}>{s.label}: <span className="num">{num(s.before)} → {num(s.after)}</span></li>)}
            </ul>
          )}
        </div>
      )}

      {settings && settings.length === 0 && <div className="card empty">서버가 알려 준 기준값이 없어요.</div>}

      {settings && groupsOf(settings).map(({ group, items }) => (
        <section key={group} className="card" aria-labelledby={`sg-${group}`}>
          <h2 id={`sg-${group}`}>{group}</h2>
          <div className="setting-list">
            {items.map((item) => {
              const draft = drafts[item.name]
              const resetting = resets.includes(item.name)
              const err = fieldErrors[item.name] || localErrors[item.name] || ''
              const inputId = `set-${item.name}`
              const pending = draft !== undefined || resetting
              return (
                <div key={item.name} className={`setting-row${pending ? ' pending' : ''}${err ? ' invalid' : ''}`}>
                  <div className="setting-text">
                    <label htmlFor={inputId}><b>{item.label ?? item.name}</b></label>
                    {item.help && <p className="small muted" id={`${inputId}-help`}>{item.help}</p>}
                    <p className="small muted num">
                      범위 {num(item.min)}~{num(item.max)} · 기본값 {num(item.default)}
                      {item.changed ? <> · <span className="badge near">기본값에서 바뀜</span></> : null}
                    </p>
                  </div>
                  <div className="setting-input">
                    <input id={inputId} inputMode="numeric" value={resetting ? String(item.default) : draft ?? String(item.value)}
                      onChange={(e) => setDraft(item, e.target.value)} disabled={busy || resetting || loading}
                      aria-invalid={!!err} aria-describedby={`${item.help ? `${inputId}-help ` : ''}${inputId}-msg`} />
                    <span id={`${inputId}-msg`} className={err ? 'err' : 'hint num'}>
                      {err || (resetting ? `기본값으로 되돌림: ${num(item.value)} → ${num(item.default)}`
                        : draft !== undefined ? `지금 ${num(item.value)} → ${String(draft).trim() || '?'}` : `지금 값 ${num(item.value)}`)}
                    </span>
                    <div className="btn-row">
                      {pending && (
                        <button type="button" className="btn small" disabled={busy || loading} onClick={() => (resetting ? toggleReset(item) : setDraft(item, String(item.value)))}>
                          <Undo2 size={14} aria-hidden="true" /> 입력 취소
                        </button>
                      )}
                      {item.changed && !resetting && (
                        <button type="button" className="btn small" disabled={busy || loading} onClick={() => toggleReset(item)}>
                          <RotateCcw size={14} aria-hidden="true" /> 기본값으로
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {settings && (
        <div className="save-bar" role="region" aria-label="저장">
          <span className="small" aria-live="polite">
            {changes.length ? `바꿀 항목 ${changes.length}개` : '바꾼 항목이 없어요'}
            {Object.keys(localErrors).length ? ` · 고칠 칸 ${Object.keys(localErrors).length}개` : ''}
          </span>
          <div className="btn-row">
            <button type="button" className="btn" disabled={busy || !dirty} onClick={discard}>모두 취소</button>
            <button type="button" className="btn primary" disabled={!canSave} onClick={() => setConfirming(true)}>
              <Save size={16} aria-hidden="true" /> 저장
            </button>
          </div>
        </div>
      )}

      {confirming && (
        <ConfirmDialog title="기준값을 저장할까요?" confirmLabel={`${changes.length}개 저장`} busy={busy}
          onCancel={() => { if (!busyRef.current) setConfirming(false) }} onConfirm={save}>
          <p>저장하는 순간부터 서비스에 반영돼요.</p>
          <ul className="reasons" style={{ marginTop: 6 }}>
            {changes.map((c) => (
              <li key={c.name}>
                {c.label}: <span className="num">{num(c.before)} → <b>{num(c.after)}</b></span>
                {c.reset && ' (기본값)'}
                {isBig(c) && <b className="err-text"> · 크게 늘어요</b>}
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </>
  )
}
