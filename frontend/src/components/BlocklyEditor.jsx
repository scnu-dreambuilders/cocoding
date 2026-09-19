import { useEffect, useImperativeHandle, useRef } from 'react'
import * as Blockly from 'blockly'
import { HAT_TYPES, workspaceToCode } from '../blockly/blocks'
import { searchFlyout, setSearchQuery, variableFlyout } from '../blockly/toolbox'
import { getTextSize, useTextSize } from '../lib/textSize'

/* ── 테마 (라이트/다크) ─────────────────────────── */
function buildTheme() {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  return Blockly.Theme.defineTheme(dark ? 'cocoding-dark' : 'cocoding-light', {
    base: Blockly.Themes.Classic,
    startHats: true,
    fontStyle: { family: 'system-ui, "Malgun Gothic", "Apple SD Gothic Neo", sans-serif', weight: '600', size: 11 },
    componentStyles: dark
      ? {
          workspaceBackgroundColour: '#0b0f17', toolboxBackgroundColour: '#0d1117', toolboxForegroundColour: '#e6edf3',
          flyoutBackgroundColour: '#111827', flyoutForegroundColour: '#e6edf3', flyoutOpacity: 0.97,
          scrollbarColour: '#30363d', scrollbarOpacity: 0.7,
        }
      : {
          workspaceBackgroundColour: '#f8fafc', toolboxBackgroundColour: '#ffffff', toolboxForegroundColour: '#0f172a',
          flyoutBackgroundColour: '#f1f5f9', flyoutForegroundColour: '#0f172a', flyoutOpacity: 0.97,
          scrollbarColour: '#cbd5e1', scrollbarOpacity: 0.7,
        },
  })
}

// Blockly 아이콘·효과음·커서는 기본값이 외부 서버(blockly-demo.appspot.com) →
// 우리 사이트(public/blockly-media)에서 받도록 해서 CSP를 지키고 외부 접속을 없앤다
const BLOCKLY_MEDIA = `${import.meta.env.BASE_URL}blockly-media/`

/* 좌표 범위 초과 검사 (기획서 ⑥) — [블록 종류, 입력, 최대값, 안내 문구] */
const RANGE_RULES = [
  ['goto_xy', 'X', 240, 'x는 -240부터 240까지만 무대 안이야!'],
  ['goto_xy', 'Y', 180, 'y는 -180부터 180까지만 무대 안이야!'],
  ['move_x', 'DX', 240, '한 번에 240보다 많이 움직이면 무대 밖으로 나가! (최대 240, 최소 -240)'],
  ['move_y', 'DY', 180, '한 번에 180보다 많이 움직이면 무대 밖으로 나가! (최대 180, 최소 -180)'],
  ['move_steps', 'STEPS', 240, '한 번에 240보다 많이 움직이면 무대 밖으로 나가! (최대 240, 최소 -240)'],
]

/* ════════════════════════════════════════════════
   BlocklyEditor
   ref로 에디터 제어 함수 제공 (save/load/search/markErrors …)
   ════════════════════════════════════════════════ */
export default function BlocklyEditor({
  ref, initialState, toolbox, allowedBlocks, newBlocks = [],
  onCode, onActivity, onConnect, onRangeWarning,
}) {
  const containerRef = useRef(null)
  const wsRef = useRef(null)
  const cbRef = useRef({ onCode, onActivity, onConnect, onRangeWarning })
  const allowedRef = useRef(new Set(allowedBlocks))
  const newRef = useRef(new Set(newBlocks))
  const hintRef = useRef(null)
  const rangeRef = useRef(new Set())

  useEffect(() => {
    cbRef.current = { onCode, onActivity, onConnect, onRangeWarning }
    allowedRef.current = new Set(allowedBlocks)
    newRef.current = new Set(newBlocks)
  })

  /* ── 워크스페이스 생성 (한 번만) ───────────── */
  useEffect(() => {
    const container = containerRef.current
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const ws = Blockly.inject(container, {
      toolbox,
      media: BLOCKLY_MEDIA,
      theme: buildTheme(),
      renderer: 'zelos',
      grid: { spacing: 24, length: 3, colour: dark ? '#1c2128' : '#e2e8f0', snap: true },
      zoom: { controls: true, wheel: true, startScale: getTextSize().blockScale, maxScale: 2, minScale: 0.4, scaleSpeed: 1.1 },
      trashcan: true,
      move: { scrollbars: true, drag: true, wheel: true },
    })
    wsRef.current = ws

    ws.registerToolboxCategoryCallback('COCO_SEARCH', () => searchFlyout())
    ws.registerToolboxCategoryCallback('COCO_VARIABLE', (w) => variableFlyout(w, allowedRef.current))
    ws.registerButtonCallback('COCO_CREATE_VARIABLE', () => {
      Blockly.Variables.createVariableButtonHandler(ws, () => ws.getToolbox()?.refreshSelection())
    })

    if (initialState) {
      try {
        Blockly.serialization.workspaces.load(initialState, ws)
      } catch (err) {
        console.error('블록을 불러오지 못했습니다:', err)
      }
    }

    const emitCode = () => cbRef.current.onCode?.(workspaceToCode(ws))

    const checkRanges = () => {
      const now = new Set()
      for (const [type, input, max, msg] of RANGE_RULES) {
        for (const b of ws.getBlocksByType(type, false)) {
          const target = b.getInputTargetBlock(input)
          const svg = target?.getSvgRoot?.()
          const v = target?.type === 'math_number' ? Number(target.getFieldValue('NUM')) : null
          const bad = v !== null && Math.abs(v) > max
          svg?.classList.toggle('coco-range-error', bad)
          if (bad) {
            now.add(`${b.id}:${input}`)
            if (!rangeRef.current.has(`${b.id}:${input}`)) cbRef.current.onRangeWarning?.({ blockId: b.id, message: msg })
          }
        }
      }
      // 경고 아이콘은 블록 단위로 갱신
      for (const b of ws.getAllBlocks(false)) {
        const msgs = RANGE_RULES.filter(([type, input]) => type === b.type && now.has(`${b.id}:${input}`)).map((r) => r[3])
        if (RANGE_RULES.some(([type]) => type === b.type)) b.setWarningText(msgs.length ? msgs.join('\n') : null)
      }
      rangeRef.current = now
    }

    const markFlyout = () => {
      const flyoutWs = ws.getFlyout()?.getWorkspace()
      if (!flyoutWs) return
      for (const b of flyoutWs.getTopBlocks(false)) {
        const root = b.getSvgRoot()
        root.classList.toggle('coco-new-block', newRef.current.has(b.type))
        root.classList.toggle('coco-hint-block', hintRef.current === b.type)
      }
    }

    const onChange = (e) => {
      if (e.type === Blockly.Events.TOOLBOX_ITEM_SELECT) setTimeout(markFlyout, 0)
      if (e.type === Blockly.Events.BLOCK_DRAG || !e.isUiEvent) cbRef.current.onActivity?.(e)
      if (e.isUiEvent) return
      if (e.type === Blockly.Events.BLOCK_MOVE && e.newParentId && !e.oldParentId) {
        const b = ws.getBlockById(e.blockId)
        if (b && !b.isShadow()) cbRef.current.onConnect?.(b)
      }
      emitCode()
      checkRanges()
    }
    ws.addChangeListener(onChange)
    emitCode()
    checkRanges()

    const ro = new ResizeObserver(() => Blockly.svgResize(ws))
    ro.observe(container)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onScheme = () => ws.setTheme(buildTheme())
    mq.addEventListener('change', onScheme)

    return () => {
      ro.disconnect()
      mq.removeEventListener('change', onScheme)
      ws.dispose()
      wsRef.current = null
    }
    // 워크스페이스는 한 번만 만든다: initialState/toolbox는 생성 시점 값만 쓰고
    // 이후 변경은 아래 effect와 ref API(load/updateToolbox)로 반영
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 툴박스 변경 (챕터 단계·수준 변경 시) */
  useEffect(() => {
    const ws = wsRef.current
    if (ws && toolbox) ws.updateToolbox(toolbox)
  }, [toolbox])

  /* 글씨 크기 설정이 바뀌면 블록도 같이 확대/축소 (팔레트 폭도 새 글씨에 맞춤) */
  const { blockScale } = useTextSize()
  useEffect(() => {
    const ws = wsRef.current
    if (!ws || ws.getScale() === blockScale) return undefined
    ws.setScale(blockScale)
    const raf = requestAnimationFrame(() => {
      if (wsRef.current !== ws) return
      Blockly.svgResize(ws)
      ws.getToolbox()?.refreshSelection()
    })
    return () => cancelAnimationFrame(raf)
  }, [blockScale])

  /* ── 외부 제어 API ─────────────────────────── */
  useImperativeHandle(ref, () => ({
    getWorkspace: () => wsRef.current,
    save: () => Blockly.serialization.workspaces.save(wsRef.current),
    load: (state) => {
      const ws = wsRef.current
      ws.clear()
      if (state) Blockly.serialization.workspaces.load(state, ws)
      ws.scrollCenter()
    },
    clear: () => wsRef.current.clear(),
    search: (q) => {
      const ws = wsRef.current
      setSearchQuery(q)
      const tb = ws.getToolbox()
      const item = tb?.getToolboxItemById('cat_search')
      if (!item) return
      if (tb.getSelectedItem() === item) tb.refreshSelection()
      else tb.setSelectedItem(item)
    },
    markErrors: (ids, { shake = true, focus = true, cls = 'coco-error-block' } = {}) => {
      const ws = wsRef.current
      let first = null
      for (const id of ids) {
        const b = ws.getBlockById(id)
        const root = b?.getSvgRoot()
        if (!root) continue
        first ??= b
        root.classList.add(cls)
        if (shake) {
          root.classList.remove('coco-shake')
          void root.getBoundingClientRect()
          root.classList.add('coco-shake')
          setTimeout(() => root.classList.remove('coco-shake'), 700)
        }
      }
      if (first && focus) {
        const target = first.getRootBlock()
        ws.scrollBoundsIntoView?.(target.getBoundingRectangle())
      }
    },
    clearErrors: () => {
      containerRef.current?.querySelectorAll('.coco-error-block, .coco-warn-block')
        .forEach((el) => el.classList.remove('coco-error-block', 'coco-warn-block'))
    },
    glow: (hatIds) => {
      const ws = wsRef.current
      const set = new Set(hatIds)
      for (const b of ws.getTopBlocks(false)) {
        if (HAT_TYPES.has(b.type)) b.getSvgRoot()?.classList.toggle('coco-running', set.has(b.id))
      }
    },
    flashCategory: (catId, type) => {
      const ws = wsRef.current
      hintRef.current = type ?? null
      const div = ws.getToolbox()?.getToolboxItemById(catId)?.getDiv?.()
      if (!div) return
      div.classList.remove('coco-cat-hint')
      void div.offsetWidth
      div.classList.add('coco-cat-hint')
      setTimeout(() => div.classList.remove('coco-cat-hint'), 4500)
    },
    refreshDropdowns: () => {
      const ws = wsRef.current
      for (const b of ws.getAllBlocks(false)) {
        for (const name of ['SPRITE', 'TARGET', 'SCENE', 'SOUND']) {
          const f = b.getField(name)
          if (!f) continue
          f.getOptions(false)
          f.doValueUpdate_?.(f.getValue())
          f.forceRerender?.()
        }
      }
      ws.getToolbox()?.refreshSelection()
    },
    usedTypes: () => new Set(wsRef.current.getAllBlocks(false).filter((b) => !b.isShadow()).map((b) => b.type)),
  }), [])

  return <div ref={containerRef} className="blockly-canvas" />
}

/* ════════════════════════════════════════════════
   읽기 전용 블록 미리보기 (챕터 '따라하기' 예시)
   ════════════════════════════════════════════════ */
export function BlockPreview({ state }) {
  const ref = useRef(null)
  useEffect(() => {
    const ws = Blockly.inject(ref.current, {
      readOnly: true, theme: buildTheme(), renderer: 'zelos', media: BLOCKLY_MEDIA,
      // zoomToFit은 움직일 수 있는 워크스페이스에서만 동작 → 스크롤바는 켜고 CSS로 숨김
      zoom: { startScale: 0.7 }, move: { scrollbars: true, drag: true, wheel: false },
    })
    Blockly.serialization.workspaces.load(state, ws)
    ws.zoomToFit()
    if (ws.getScale() > 0.8) {
      ws.setScale(0.8)
      ws.scrollCenter()
    }
    return () => ws.dispose()
  }, [state])
  return <div ref={ref} className="block-preview" />
}
