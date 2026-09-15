import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as Blockly from 'blockly'
import BlocklyEditor from '../components/BlocklyEditor'
import Stage from '../components/Stage'
import { SpritePanel, SceneBar } from '../components/StagePanels'
import Coco from '../components/Coco'
import MissionPanel from '../components/MissionPanel'
import CodePanel from '../components/CodePanel'
import DrawingModal from '../components/DrawingModal'
import SoundModal from '../components/SoundModal'
import { IconBack, IconPlay, IconSave, IconSpinner, IconCode } from '../components/icons'
import { BLOCK_INFO, CATEGORIES, setBlockContext } from '../blockly/blocks'
import { buildToolbox, categoryIdOf, LEVEL_BLOCKS, ALL_BLOCKS } from '../blockly/toolbox'
import { Runtime, validateWorkspace } from '../engine/runtime'
import { CHAPTERS, MY_GAME, chapterBlocks, learnedBlocks, usedTypes } from '../data/chapters'
import { LEVELS } from '../data/library'
import { makeProject, makeSprite, normalizeProject, serializeProject } from '../lib/project'
import { playSound } from '../lib/sounds'
import { api } from '../api/client'
import '../App.css'
import './EditorPage.css'

const IDLE_MS = 30000
const PRAISE = ['좋아, 잘 연결했어! 👍', '블록이 딱 맞았어!', '멋진데? 계속 해보자!', '오, 점점 완성되고 있어! ✨']
const blockName = (t) => BLOCK_INFO[t]?.name ?? t
const catName = (t) => CATEGORIES[BLOCK_INFO[t]?.cat]?.name ?? ''

function Celebration() {
  const pieces = ['🎉', '⭐', '🎊', '✨', '🏆', '💜']
  return (
    <div className="celebration" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => (
        <span key={i} style={{
          left: `${(Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * 100}%`,
          animationDelay: `${(i % 7) * 0.12}s`,
          fontSize: `${18 + (i % 4) * 6}px`,
        }}>{pieces[i % pieces.length]}</span>
      ))}
    </div>
  )
}

/* ════════════════════════════════════════════════
   EditorPage
   launch: { mode: 'chapter', chapter } | { mode: 'free', projectId?, topic?, template?, completedChapters? }
   ════════════════════════════════════════════════ */
export default function EditorPage({ user, launch, onBack, onUserUpdate, onOpenChapter, onOpenMyGame }) {
  const isChapter = launch.mode === 'chapter'
  const chapterNo = isChapter ? launch.chapter.order_num : null
  const chapter = isChapter ? CHAPTERS[chapterNo] : null
  const alreadyCompleted = isChapter && launch.chapter.status === 'completed'

  /* ── 초기 프로젝트 ─────────────────────────── */
  const [project, setProjectState] = useState(() => {
    let p
    if (isChapter) p = makeProject({ sprites: chapter.sprites(), scenes: chapter.scenes?.() })
    else if (launch.template === 'mygame') p = makeProject({ scenes: MY_GAME.scenes() })
    else if (launch.topic) {
      p = makeProject({ sprites: [makeSprite({ id: 'coco', name: '코코', emoji: '🐨', x: -120 }),
        makeSprite({ id: 'hero', name: launch.topic.category ?? '주인공', emoji: launch.topic.emoji ?? '⭐', x: 100 })] })
    } else p = makeProject()
    setBlockContext(p) // 블록 드롭다운이 워크스페이스 로드 전에 캐릭터 목록을 알아야 함
    return p
  })
  // 빈 화면에서 시작하지 않도록: 바로 ▶ 실행해볼 수 있는 시작 블록
  const [initialWs, setInitialWs] = useState(() => {
    if (isChapter || launch.projectId || launch.template) return null
    const sprite = launch.topic ? 'hero' : 'coco'
    const text = launch.topic ? `${launch.topic.title}, 시작!` : '안녕! 나는 코코야'
    return {
      blocks: {
        languageVersion: 0,
        blocks: [{
          type: 'when_start', x: 40, y: 40, fields: { SPRITE: sprite },
          next: { block: { type: 'say', inputs: { TEXT: { shadow: { type: 'text', fields: { TEXT: text } } } } } },
        }],
      },
    }
  })
  const [loading, setLoading] = useState(!!launch.projectId)
  const [loadError, setLoadError] = useState('')
  const [meta, setMeta] = useState({
    id: launch.projectId ?? null,
    title: isChapter ? `챕터 ${chapterNo} 연습` : launch.template === 'mygame' ? MY_GAME.title : (launch.topic?.title ?? '새 프로젝트'),
    isPublic: false,
  })
  const [editTitle, setEditTitle] = useState(false)

  const [code, setCode] = useState('')
  const [running, setRunning] = useState(false)
  const [demoRunning, setDemoRunning] = useState(false)
  const [showGrid, setShowGrid] = useState(chapterNo === 1)
  const [selectedId, setSelectedId] = useState(project.sprites[0]?.id)
  const [sceneId, setSceneId] = useState(project.scenes[0]?.id)
  const [tab, setTab] = useState(isChapter ? 'mission' : 'code')
  const [modal, setModal] = useState(null)
  const [coco, setCoco] = useState({ message: null, emotion: 'normal' })
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [dirty, setDirty] = useState(false)
  const [items, setItems] = useState([])
  const [celebrate, setCelebrate] = useState(false)
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState(user?.level ?? 1)

  // 챕터 상태
  const [step, setStep] = useState(1)
  const [maxStep, setMaxStep] = useState(alreadyCompleted ? 3 : 1)
  const [checks, setChecks] = useState(() => (chapter ? chapter.makeJudge({ getAllBlocks: () => [] }).checks() : []))
  const [hintCount, setHintCount] = useState(0)
  const [result, setResult] = useState(null)

  const blocklyRef = useRef(null)
  const runtimeRef = useRef(null)
  const judgeRef = useRef(null)
  const passedRef = useRef(false)
  const canvasRef = useRef(null)
  const projectRef = useRef(project)
  const sceneRef = useRef(sceneId)
  const cocoTimer = useRef(null)
  const idleTimer = useRef(null)
  const praiseRef = useRef({ count: 0, last: 0 })
  const enteredSelf = useRef(false)
  const checksRaf = useRef(0)
  const stepRef = useRef(step)
  const [loadedTypes, setLoadedTypes] = useState([])

  useEffect(() => {
    projectRef.current = project
    sceneRef.current = sceneId
    stepRef.current = step
  })

  const setProject = useCallback((updater) => {
    setProjectState((p) => (typeof updater === 'function' ? updater(p) : updater))
    if (runtimeRef.current && !runtimeRef.current.running) runtimeRef.current = null // 편집하면 처음 배치를 보여줌
    setDirty(true)
  }, [])

  /* 캐릭터/장면/소리 이름이 바뀌면 블록 드롭다운 갱신 */
  const ctxKey = JSON.stringify([
    project.sprites.map((s) => [s.id, s.name, s.emoji]), project.scenes.map((s) => [s.id, s.name]), project.sounds.map((s) => [s.id, s.name]),
  ])
  useEffect(() => {
    setBlockContext(projectRef.current)
    blocklyRef.current?.refreshDropdowns()
  }, [ctxKey])

  /* ── 코코 말하기 ───────────────────────────── */
  const say = useCallback((text, type = 'intro', emotion = 'normal', { duration = 8000, actions } = {}) => {
    clearTimeout(cocoTimer.current)
    setCoco({ message: { id: Date.now() + Math.random(), text, type, actions }, emotion })
    if (duration) {
      cocoTimer.current = setTimeout(() => setCoco((c) => ({ message: null, emotion: c.emotion === 'celebrate' ? 'happy' : 'normal' })), duration)
    }
  }, [])
  const flashBlock = useCallback((type) => {
    const cat = categoryIdOf(type)
    if (cat) blocklyRef.current?.flashCategory(cat, type)
  }, [])

  /* ── 불러오기 (저장된 프로젝트) ─────────────── */
  useEffect(() => {
    if (!launch.projectId) return undefined
    let alive = true
    api.getProject(launch.projectId)
      .then((p) => {
        if (!alive) return
        const data = normalizeProject(p.blocks_data)
        setBlockContext(data)
        setProjectState(data)
        setSelectedId(data.sprites[0]?.id)
        setSceneId(data.scenes[0]?.id)
        setInitialWs(data.workspace)
        setLoadedTypes(collectTypes(data.workspace))
        setMeta({ id: p.id, title: p.title, isPublic: !!Number(p.is_public) })
        setLoading(false)
      })
      .catch((err) => {
        if (!alive) return
        setLoadError(err.message)
        setLoading(false)
      })
    return () => { alive = false }
  }, [launch.projectId, isChapter, launch.template])

  /* 획득 아이템 (코코 꾸미기) */
  useEffect(() => {
    if (!user) return
    api.items().then((list) => setItems(list.filter((i) => Number(i.equipped)))).catch(() => {})
  }, [user])

  /* ── 팔레트 ────────────────────────────────── */
  const allowed = useMemo(() => {
    if (isChapter) return chapterBlocks(chapterNo)
    const set = new Set([
      ...(LEVEL_BLOCKS[level] ?? LEVEL_BLOCKS[1]),
      ...learnedBlocks(launch.completedChapters ?? []),
      ...(launch.template === 'mygame' ? ALL_BLOCKS : []),
      ...(launch.topic?.hintBlock ? [launch.topic.hintBlock] : []),
      ...loadedTypes, // 불러온 작품에 쓰인 블록은 수준과 상관없이 보여줌
    ])
    return ALL_BLOCKS.filter((t) => set.has(t))
  }, [isChapter, chapterNo, level, launch.completedChapters, launch.template, launch.topic, loadedTypes])
  const newBlocks = chapter?.newBlocks ?? []
  const toolbox = useMemo(() => buildToolbox({ allowed, newBlocks }), [allowed]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 진입 인사 ─────────────────────────────── */
  useEffect(() => {
    if (loading) return
    const t = setTimeout(() => {
      if (isChapter) {
        const names = chapter.focus.map((b) => `'${blockName(b)}'`).join(', ')
        say(`챕터 ${chapterNo}에서는 ${names} 블록을 배울 거야! 팔레트에서 반짝이는 칸을 찾아봐 👀`, 'intro', 'happy')
        flashBlock(chapter.focus[0])
      } else if (launch.template === 'mygame') {
        say(MY_GAME.intro, 'intro', 'celebrate')
      } else if (launch.topic) {
        const hb = launch.topic.hintBlock
        say(hb ? `'${launch.topic.title}' 만들어볼까? 이런 블록으로 시작해보자 → '${blockName(hb)}' (${catName(hb)} 칸에 있어!)`
          : `'${launch.topic.title}' 만들어볼까? 무대 아래에서 캐릭터를 골라봐!`, 'intro', 'happy')
        if (hb) flashBlock(hb)
      } else if (launch.projectId) {
        say(`다시 왔구나! '${meta.title}' 이어서 만들어보자 💪`, 'intro', 'happy')
      } else {
        say(`${user ? '' : '로그인 없이 체험 중이야! (저장은 로그인 후에 할 수 있어)\n'}시작 블록을 놓아뒀어. ▶ 실행을 눌러보고, '이동' 칸의 블록을 아래에 붙여봐!`,
          'intro', 'happy')
        flashBlock('move_x')
      }
    }, 600)
    return () => clearTimeout(t)
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ── 30초 막힘 감지 → 힌트 ─────────────────── */
  const idleHint = useCallback(() => {
    const ed = blocklyRef.current
    if (!ed || runtimeRef.current?.running) return
    const used = ed.usedTypes()
    let pool = allowed.filter((t) => t !== 'variables_get')
    if (isChapter && stepRef.current === 3) pool = chapter.required
    else if (isChapter) pool = chapter.newBlocks
    const next = pool.find((t) => !used.has(t))
    if (!next) {
      say('잘하고 있어! ▶ 실행 버튼을 눌러서 결과를 확인해봐 🙂', 'encourage', 'happy')
      return
    }
    say(`혹시 '${blockName(next)}' 블록 찾고 있어? '${catName(next)}' 칸에 있어!`, 'hint', 'thinking', {
      duration: 12000,
      actions: [{ label: '어디 있는지 보여줘', onClick: () => flashBlock(next) }],
    })
    flashBlock(next)
  }, [allowed, isChapter, chapter, say, flashBlock])

  const resetIdle = useCallback(() => {
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => idleHint(), IDLE_MS)
  }, [idleHint])

  useEffect(() => {
    if (loading) return undefined
    resetIdle()
    return () => clearTimeout(idleTimer.current)
  }, [loading, resetIdle])

  /* ── 블록 에디터 콜백 ──────────────────────── */
  const onActivity = useCallback((e) => {
    resetIdle()
    if (!e.isUiEvent) setDirty(true)
  }, [resetIdle])

  const onConnect = useCallback(() => {
    const p = praiseRef.current
    p.count++
    const now = Date.now()
    if (p.count % 4 === 0 && now - p.last > 20000) {
      p.last = now
      say(PRAISE[p.count % PRAISE.length], 'encourage', 'happy', { duration: 3500 })
    } else {
      setCoco((c) => ({ ...c, emotion: 'happy' }))
      setTimeout(() => setCoco((c) => (c.emotion === 'happy' ? { ...c, emotion: 'normal' } : c)), 1200)
    }
  }, [say])

  const onRangeWarning = useCallback(({ message }) => {
    say(`⚠️ 너무 큰 숫자야! ${message}`, 'error', 'thinking', { duration: 7000 })
  }, [say])

  /* ── 무대 표시 상태 ─────────────────────────── */
  const getView = useCallback(() => {
    const rt = runtimeRef.current
    const p = projectRef.current
    if (rt) {
      return { sprites: rt.sprites, scene: p.scenes.find((s) => s.id === rt.sceneId) ?? p.scenes[0], monitors: rt.monitors(), running: rt.running }
    }
    return { sprites: p.sprites, scene: p.scenes.find((s) => s.id === sceneRef.current) ?? p.scenes[0], monitors: [], running: false }
  }, [])

  const makeThumbnail = useCallback(() => {
    const src = canvasRef.current
    if (!src) return null
    const c = document.createElement('canvas')
    c.width = 240
    c.height = 180
    c.getContext('2d').drawImage(src, 0, 0, 240, 180)
    return c.toDataURL('image/jpeg', 0.75)
  }, [])

  /* ── 챕터 통과 ─────────────────────────────── */
  const handlePass = useCallback(async () => {
    if (passedRef.current) return
    passedRef.current = true
    setChecks(judgeRef.current.checks())
    say('🎉 완벽해! 미션 성공!', 'success', 'celebrate', { duration: 0 })
    setCelebrate(true)
    playSound('sfx:win')
    setTimeout(() => runtimeRef.current?.stop('passed'), 1200)
    setTimeout(() => setCelebrate(false), 3500)
    try {
      const res = await api.completeChapter(launch.chapter.id, {
        title: `챕터 ${chapterNo} · ${chapter.title.split(' – ')[0]}`,
        blocks_data: serializeProject(projectRef.current, blocklyRef.current.save()),
        thumbnail: makeThumbnail(),
      })
      setResult(res)
      setMaxStep(4)
      setStep(4)
      say(res.nextChapterId ? `챕터 ${chapterNo} 완료! 다음 챕터가 열렸어 🔓\n보상: ${res.rewardEmoji ?? ''} ${res.rewardItem}`
        : `모든 챕터를 끝냈어! 🎓 이제 '나만의 게임 만들기'가 열렸어!`, 'success', 'celebrate', { duration: 0 })
      onUserUpdate?.()
      if (user) api.items().then((list) => setItems(list.filter((i) => Number(i.equipped)))).catch(() => {})
    } catch (err) {
      passedRef.current = false
      say(`미션은 성공했는데 저장하지 못했어: ${err.message}\n다시 실행해서 시도해줘!`, 'error', 'thinking', { duration: 0 })
    }
  }, [launch.chapter, chapterNo, chapter, say, makeThumbnail, onUserUpdate, user])

  /* ── 실행 ──────────────────────────────────── */
  const stopRun = useCallback(() => {
    runtimeRef.current?.stop('stopped')
  }, [])

  const handleRun = useCallback(() => {
    const ed = blocklyRef.current
    if (!ed) return
    if (runtimeRef.current?.running) {
      stopRun()
      return
    }
    const ws = ed.getWorkspace()
    const p = projectRef.current
    ed.clearErrors()
    const issues = validateWorkspace(ws, p)
    const errors = issues.filter((i) => i.level === 'error')
    const warns = issues.filter((i) => i.level === 'warn')
    const lenient = isChapter && stepRef.current === 2 // 따라하기 단계는 오류 처리 없이 시도

    if (errors.length) {
      const first = errors[0]
      if (first.blockId) ed.markErrors(errors.map((i) => i.blockId).filter(Boolean), { shake: !lenient })
      const type = ws.getBlockById(first.blockId)?.type
      say(`${lenient ? '' : '❌ '}${first.message}${type && !lenient ? `\n\n💬 ${BLOCK_INFO[type]?.desc ?? ''}` : ''}`,
        lenient ? 'hint' : 'error', 'thinking', { duration: 12000 })
      if (first.kind === 'no-hat') flashBlock('when_start')
      return
    }
    let hinted = false // 실행 전 안내를 했으면 실행 끝 격려 메시지로 덮지 않음
    if (warns.length) {
      hinted = true
      ed.markErrors(warns.map((i) => i.blockId).filter(Boolean), { shake: false, focus: false, cls: 'coco-warn-block' })
      say(`⚠️ ${warns[0].message}`, 'hint', 'thinking', { duration: 9000 })
    } else if (isChapter && stepRef.current === 3) {
      const missing = chapter.required.find((t) => !usedTypes(ws).has(t))
      if (missing) {
        hinted = true
        say(`'${blockName(missing)}' 블록이 아직 없어! '${catName(missing)}' 칸에서 찾아봐.`, 'hint', 'thinking', { duration: 9000 })
        flashBlock(missing)
      }
    }

    passedRef.current = false
    judgeRef.current = isChapter && stepRef.current === 3 ? chapter.makeJudge(ws) : null
    if (judgeRef.current) setChecks(judgeRef.current.checks())

    const rt = new Runtime({
      workspace: ws,
      project: p,
      playSound: (id) => playSound(id, projectRef.current.sounds),
      onTrace: (e) => {
        const j = judgeRef.current
        if (!j || passedRef.current) return
        j.onEvent(e)
        if (!checksRaf.current) {
          checksRaf.current = requestAnimationFrame(() => {
            checksRaf.current = 0
            const list = j.checks()
            setChecks(list)
            if (list.every((c) => c.done)) handlePass()
          })
        }
      },
      onError: (err) => {
        const type = ws.getBlockById(err.blockId)?.type
        ed.markErrors([err.blockId], { shake: !lenient })
        say(`${lenient ? '' : '❌ '}${err.message}${type ? `\n\n💬 ${BLOCK_INFO[type]?.desc ?? ''}` : ''}`,
          lenient ? 'hint' : 'error', 'thinking', { duration: 12000 })
      },
      onFinish: ({ reason }) => {
        setRunning(false)
        ed.glow([])
        const j = judgeRef.current
        if (reason === 'done' && j && !passedRef.current && !hinted) {
          const left = j.checks().filter((c) => !c.done)
          if (left.length) say(`거의 다 왔어! 아직 남은 조건 → ${left[0].label} 💪`, 'encourage', 'thinking', { duration: 9000 })
        }
      },
    })
    runtimeRef.current = rt
    setRunning(true)
    document.activeElement?.blur?.() // 스페이스/엔터가 버튼을 다시 누르지 않도록
    rt.start()
  }, [isChapter, chapter, say, flashBlock, handlePass, stopRun])

  /* 실행 중인 블록 묶음 반짝이기 */
  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => {
      const rt = runtimeRef.current
      if (rt?.running) blocklyRef.current?.glow([...rt.threads.keys()])
    }, 150)
    return () => clearInterval(id)
  }, [running])

  /* 예시 결과 보기 (따라하기) — 보이지 않는 워크스페이스에서 예시 실행 */
  const handleDemo = useCallback(() => {
    if (runtimeRef.current?.running) return
    const ex = chapter.example
    const ws = new Blockly.Workspace()
    Blockly.serialization.workspaces.load(ex.workspace, ws)
    const template = makeProject({ sprites: chapter.sprites(), scenes: chapter.scenes?.() })
    const timers = []
    const cleanup = () => {
      timers.forEach(clearTimeout)
      setDemoRunning(false)
      setTimeout(() => ws.dispose(), 0)
    }
    const rt = new Runtime({
      workspace: ws, project: template, playSound: (id) => playSound(id),
      onFinish: () => {
        cleanup()
        say('이제 똑같이 조립해서 ▶ 실행해봐!', 'intro', 'happy')
      },
    })
    runtimeRef.current = rt
    setDemoRunning(true)
    say('예시를 보여줄게! 무대를 봐 👀', 'intro', 'happy', { duration: 4000 })
    rt.start()
    ;(ex.demoKeys ?? []).forEach((k, i) => timers.push(setTimeout(() => { rt.keyDown(k); rt.keyUp(k) }, 500 + i * 450)))
    timers.push(setTimeout(() => rt.stop('demo-end'), Math.max(4500, 800 + (ex.demoKeys?.length ?? 0) * 450)))
  }, [chapter, say])

  const startSelf = useCallback(() => {
    stopRun()
    enteredSelf.current = true
    blocklyRef.current?.load(chapter.starter ?? null)
    setProjectState(makeProject({ sprites: chapter.sprites(), scenes: chapter.scenes?.() }))
    runtimeRef.current = null
    setStep(3)
    setMaxStep((m) => Math.max(m, 3))
    setChecks(chapter.makeJudge(blocklyRef.current.getWorkspace()).checks())
    say(`🎯 스스로 완성 미션!\n${chapter.mission}`, 'intro', 'happy', { duration: 12000 })
  }, [chapter, say, stopRun])

  const goStep = useCallback((n) => {
    if (n === 3 && !enteredSelf.current) {
      startSelf()
      return
    }
    setStep(n)
    if (n > maxStep) setMaxStep(n)
    if (n === 2) say('오른쪽 예시처럼 블록을 조립해봐! ▶ 예시 결과 보기로 먼저 확인해도 좋아', 'intro', 'happy')
  }, [maxStep, startSelf, say])

  const showHint = () => {
    const n = Math.min(chapter.hints.length, hintCount + 1)
    setHintCount(n)
    say(`💡 ${chapter.hints[n - 1]}`, 'hint', 'thinking', { duration: 12000 })
  }

  /* ── 저장 / 공유 ───────────────────────────── */
  const handleSave = useCallback(async ({ quiet = false } = {}) => {
    if (!user) {
      say('로그인하면 작품을 저장할 수 있어!', 'hint', 'normal')
      return null
    }
    if (isChapter) return null
    setSaving(true)
    setSaveMsg('')
    try {
      const blocks_data = serializeProject(projectRef.current, blocklyRef.current.save())
      const thumbnail = makeThumbnail()
      let id = meta.id
      if (id) {
        await api.updateProject(id, { title: meta.title, blocks_data, thumbnail })
      } else {
        const res = await api.createProject({ title: meta.title, blocks_data, thumbnail, track: 'free' })
        id = res.id
        setMeta((m) => ({ ...m, id }))
        if (res.rewardItem) {
          say(`포트폴리오에 등록됐어! 📁\n저장 보상으로 ${res.rewardEmoji ?? ''} ${res.rewardItem}을(를) 받았어!`, 'success', 'celebrate')
          onUserUpdate?.()
        } else if (!quiet) say('포트폴리오에 등록됐어! 📁', 'success', 'happy', { duration: 4000 })
      }
      setDirty(false)
      setSaveMsg('saved')
      return id
    } catch (err) {
      setSaveMsg('error')
      say(`저장하지 못했어: ${err.message}`, 'error', 'thinking')
      return null
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 3000)
    }
  }, [user, isChapter, meta.id, meta.title, makeThumbnail, say, onUserUpdate])

  const toggleShare = async () => {
    const id = meta.id ?? (await handleSave({ quiet: true }))
    if (!id) return
    try {
      const next = !meta.isPublic
      await api.updateProject(id, { is_public: next })
      setMeta((m) => ({ ...m, isPublic: next }))
      say(next ? "친구 작품 탭에 공개됐어! 친구들이 '리메이크'해서 따라 만들 수 있어 🌟" : '공개를 취소했어. 이제 나만 볼 수 있어.', 'success', 'happy')
    } catch (err) {
      say(`공개 설정을 바꾸지 못했어: ${err.message}`, 'error', 'thinking')
    }
  }

  const handleBack = () => {
    if (dirty && user && !isChapter && !window.confirm('저장하지 않은 변경이 있어요. 그래도 나갈까요?')) return
    stopRun()
    onBack()
  }

  /* ── 키보드 ────────────────────────────────── */
  const runRef = useRef(handleRun)
  const saveRef = useRef(handleSave)
  useEffect(() => {
    runRef.current = handleRun
    saveRef.current = handleSave
  })
  useEffect(() => {
    const typing = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
      || el.classList?.contains('blocklyHtmlInput'))
    const down = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runRef.current(); return }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveRef.current(); return }
      const rt = runtimeRef.current
      if (!rt?.running || typing(e.target)) return
      if (e.key === 'Escape') { rt.stop('stopped'); return }
      if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault()
      rt.keyDown(e.key)
    }
    const up = (e) => runtimeRef.current?.keyUp(e.key)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      runtimeRef.current?.stop('unmount')
      clearTimeout(cocoTimer.current)
    }
  }, [])

  /* ── 렌더 ──────────────────────────────────── */
  if (loading || loadError) {
    return (
      <div className="ed-loading">
        {loadError ? (
          <>
            <p>작품을 불러오지 못했어요: {loadError}</p>
            <button type="button" className="btn btn-ghost" onClick={onBack}><IconBack /> 돌아가기</button>
          </>
        ) : <p><IconSpinner /> 작품을 불러오는 중…</p>}
      </div>
    )
  }

  const busy = running || demoRunning

  return (
    <div className="app editor-app">
      {celebrate && <Celebration />}
      <header className="app-header">
        <div className="header-brand">
          <button type="button" className="btn btn-ghost editor-back" onClick={handleBack} title="뒤로 가기">
            <IconBack />
            {user ? '대시보드' : '홈'}
          </button>
          <span className="header-sep" aria-hidden="true">/</span>
          {editTitle && !isChapter ? (
            <input className="editor-title-input" autoFocus value={meta.title} maxLength={60} aria-label="프로젝트 제목"
              onChange={(e) => { setMeta((m) => ({ ...m, title: e.target.value })); setDirty(true) }}
              onBlur={() => { setEditTitle(false); setMeta((m) => ({ ...m, title: m.title.trim() || '새 프로젝트' })) }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur() }} />
          ) : (
            <button type="button" className="editor-title-btn" onClick={() => !isChapter && setEditTitle(true)}
              title={isChapter ? chapter.title : '제목 수정'}>
              {isChapter ? `챕터 ${chapterNo} · ${chapter.title}` : meta.title}
            </button>
          )}
          <span className={`track-badge ${isChapter ? 'track-chapter' : 'track-free'}`}>
            {isChapter ? '단계별 기초학습' : '자유 창작'}
          </span>
        </div>

        <div className="header-actions">
          {saveMsg === 'saved' && <span className="save-msg save-ok" role="status">저장됨 ✓</span>}
          {saveMsg === 'error' && <span className="save-msg save-err" role="alert">저장 실패</span>}
          <span className="shortcut-hint" aria-hidden="true"><kbd>Ctrl</kbd>+<kbd>Enter</kbd> 실행</span>
          {user && !isChapter && (
            <>
              <button type="button" className={`btn btn-ghost ${meta.isPublic ? 'btn-shared' : ''}`} onClick={toggleShare}
                title="친구 작품 탭에 공개하기">
                {meta.isPublic ? '🌟 공개 중' : '🔗 공유'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => handleSave()} disabled={saving} title="저장 (Ctrl+S)">
                {saving ? <IconSpinner /> : <IconSave />}
                {saving ? '저장 중' : '저장'}
              </button>
            </>
          )}
          <button type="button" className={`btn btn-run ${running ? 'is-running' : ''}`} onClick={handleRun}
            disabled={demoRunning} title="실행 / 정지 (Ctrl+Enter)">
            {running ? <span className="stop-square" aria-hidden="true" /> : <IconPlay />}
            {running ? '정지' : '실행'}
          </button>
        </div>
      </header>

      <main className="ed-main">
        <section className="ed-blocks">
          <div className="palette-bar">
            <label className="palette-search">
              <span aria-hidden="true">🔍</span>
              <input value={search} placeholder="블록 찾기 (예: 반복, 좌표)" aria-label="블록 검색"
                onChange={(e) => { setSearch(e.target.value); blocklyRef.current?.search(e.target.value) }} />
              {search && <button type="button" onClick={() => { setSearch(''); blocklyRef.current?.search('') }} aria-label="검색어 지우기">×</button>}
            </label>
            {isChapter ? (
              <span className="palette-info">챕터 {chapterNo}까지 배운 블록 {allowed.length}개</span>
            ) : (
              <label className="palette-level" title="코딩 수준에 따라 보이는 블록 수가 달라져요">
                블록
                <select value={level} onChange={(e) => setLevel(Number(e.target.value))}>
                  {LEVELS.map((l) => <option key={l.level} value={l.level}>{l.emoji} {l.label}</option>)}
                </select>
                <span className="palette-count">{allowed.length}개</span>
              </label>
            )}
          </div>
          <div className="blockly-host">
            <BlocklyEditor
              ref={blocklyRef}
              initialState={initialWs}
              toolbox={toolbox}
              allowedBlocks={allowed}
              newBlocks={newBlocks}
              onCode={setCode}
              onActivity={onActivity}
              onConnect={onConnect}
              onRangeWarning={onRangeWarning}
            />
          </div>
          <Coco
            message={coco.message}
            emotion={coco.emotion}
            items={items}
            actions={coco.message?.actions}
            onClose={() => setCoco((c) => ({ ...c, message: null }))}
            onAvatarClick={() => (coco.message ? setCoco((c) => ({ ...c, message: null })) : idleHint())}
          />
        </section>

        <aside className={`ed-side ${isChapter ? 'is-chapter' : ''}`}>
          <div className="stage-card">
            <div className="stage-toolbar">
              <button type="button" className={`btn btn-sm ${running ? 'btn-stop' : 'btn-run'}`} onClick={handleRun} disabled={demoRunning}>
                {running ? '■ 정지' : '▶ 실행'}
              </button>
              <button type="button" className={`btn btn-ghost btn-sm ${showGrid ? 'on' : ''}`} onClick={() => setShowGrid((g) => !g)}
                aria-pressed={showGrid} title="x/y 격자와 좌표 표시">
                # 격자
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
                onClick={() => { runtimeRef.current = null; blocklyRef.current?.clearErrors() }} title="캐릭터를 처음 위치로">
                ⟲ 처음 위치
              </button>
              <span className="stage-hint">{busy ? '실행 중 · 키보드로 조작해보세요 (Esc 정지)' : '캐릭터를 끌어서 위치를 옮길 수 있어요'}</span>
            </div>
            <Stage
              getView={getView}
              showGrid={showGrid}
              selectedId={selectedId}
              canvasRef={canvasRef}
              onSelect={setSelectedId}
              onDragSprite={(id, x, y) => setProject((p) => ({ ...p, sprites: p.sprites.map((s) => (s.id === id ? { ...s, x, y } : s)) }))}
              onClickSprite={(id) => runtimeRef.current?.clickSprite(id)}
            />
            <SceneBar
              scenes={project.scenes}
              currentId={sceneId}
              onSelect={(id) => { setSceneId(id); if (!busy) runtimeRef.current = null }}
              onChange={(scenes) => setProject((p) => ({ ...p, scenes }))}
              disabled={busy}
              locked={isChapter}
            />
          </div>

          <SpritePanel
            sprites={project.sprites}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={(sprites) => setProject((p) => ({ ...p, sprites }))}
            onDraw={() => setModal('draw')}
            onSounds={() => setModal('sound')}
            soundCount={project.sounds.length}
            disabled={busy}
            locked={isChapter}
            compact={isChapter}
          />

          <div className="side-tabs" role="tablist">
            {isChapter && (
              <button type="button" role="tab" aria-selected={tab === 'mission'} className={`tab-btn ${tab === 'mission' ? 'active' : ''}`}
                onClick={() => setTab('mission')}>🎯 미션</button>
            )}
            <button type="button" role="tab" aria-selected={tab === 'code'} className={`tab-btn ${tab === 'code' ? 'active' : ''}`}
              onClick={() => setTab('code')}><IconCode /> 코드 보기</button>
          </div>
          <div className="side-tab-body">
            {isChapter && tab === 'mission' ? (
              <MissionPanel
                no={chapterNo}
                chapter={chapter}
                step={step}
                maxStep={maxStep}
                onStep={goStep}
                checks={checks}
                hintCount={hintCount}
                onHint={showHint}
                onDemo={handleDemo}
                demoRunning={demoRunning}
                onStartSelf={startSelf}
                result={result}
                onNext={() => (result?.nextChapterId ? onOpenChapter?.(result.nextChapterId) : onOpenMyGame?.())}
                onDashboard={onBack}
              />
            ) : (
              <CodePanel code={code} />
            )}
          </div>
        </aside>
      </main>

      {modal === 'draw' && (
        <DrawingModal
          onClose={() => setModal(null)}
          onDone={({ name, image }) => {
            const s = makeSprite({ name, image, x: 0, y: 0 })
            setProject((p) => ({ ...p, sprites: [...p.sprites, s] }))
            setSelectedId(s.id)
            setModal(null)
            say(`'${name}' 캐릭터가 무대에 올라왔어! 이벤트 블록의 드롭다운에서 '${name}'을(를) 골라서 움직여봐 🎨`, 'success', 'celebrate')
          }}
        />
      )}
      {modal === 'sound' && (
        <SoundModal
          sounds={project.sounds}
          onChange={(sounds) => setProject((p) => ({ ...p, sounds }))}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

/* 저장된 워크스페이스 JSON에서 쓰인 블록 종류 모으기 (팔레트에 포함시키기 위해) */
function collectTypes(state) {
  const out = new Set()
  const walk = (b) => {
    if (!b || typeof b !== 'object') return
    if (typeof b.type === 'string') out.add(b.type)
    for (const v of Object.values(b.inputs ?? {})) walk(v.block)
    walk(b.next?.block)
  }
  for (const b of state?.blocks?.blocks ?? []) walk(b)
  return [...out]
}
