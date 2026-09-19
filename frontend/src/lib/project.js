/* ════════════════════════════════════════════════
   프로젝트 데이터 (DB의 blocks_data 컬럼에 저장되는 JSON)
   { version: 2, workspace, sprites, scenes, sounds }
   - 예전 형식(Blockly blocks 객체만 저장)도 불러올 수 있게 변환
   ════════════════════════════════════════════════ */

export const PROJECT_VERSION = 2
export const MAX_SCENES = 5

let idSeq = 0
export function newId(prefix) {
  idSeq += 1
  return `${prefix}_${Date.now().toString(36)}${idSeq.toString(36)}`
}

export function makeSprite(opts = {}) {
  return {
    id: opts.id ?? newId('sp'),
    name: opts.name ?? '캐릭터',
    emoji: opts.image ? undefined : (opts.emoji ?? '🐨'),
    image: opts.image,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    dir: opts.dir ?? 90,
    size: opts.size ?? 100,
    visible: opts.visible ?? true,
  }
}

export const DEFAULT_SCENES = () => [{ id: 'scene1', name: '장면 1', bg: '#eef2ff' }]

export function makeProject({ sprites, scenes, sounds, workspace } = {}) {
  return {
    version: PROJECT_VERSION,
    workspace: workspace ?? null,
    sprites: sprites ?? [makeSprite({ id: 'coco', name: '코코', emoji: '🐨' })],
    scenes: scenes ?? DEFAULT_SCENES(),
    sounds: sounds ?? [],
  }
}

/* 공유 작품은 다른 사용자가 만든 데이터 — 이미지/소리는 data: URL만 허용 */
const IMAGE_RE = /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/
const AUDIO_RE = /^data:audio\/[a-z0-9.+-]+(;codecs=[a-z0-9.,+-]+)?;base64,[A-Za-z0-9+/=]+$/i
export const safeImage = (url) => (typeof url === 'string' && IMAGE_RE.test(url) ? url : undefined)
export const safeAudio = (url) => (typeof url === 'string' && AUDIO_RE.test(url) ? url : undefined)

const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d)
const str = (v, d, max = 30) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : d)

export function normalizeProject(raw) {
  // 예전 형식: Blockly workspace의 blocks 객체만 저장돼 있음
  if (!raw || typeof raw !== 'object' || raw.version !== PROJECT_VERSION) {
    const hasBlocks = raw && typeof raw === 'object' && Array.isArray(raw.blocks)
    return makeProject({ workspace: hasBlocks ? { blocks: raw } : null })
  }
  const sprites = (Array.isArray(raw.sprites) ? raw.sprites : []).slice(0, 30).map((s, i) => {
    const image = safeImage(s?.image)
    return makeSprite({
      id: str(s?.id, `sp${i}`, 60),
      name: str(s?.name, `캐릭터${i + 1}`),
      emoji: image ? undefined : str(s?.emoji, '🐨', 16),
      image,
      x: num(s?.x, 0), y: num(s?.y, 0), dir: num(s?.dir, 90), size: num(s?.size, 100),
      visible: s?.visible !== false,
    })
  })
  const scenes = (Array.isArray(raw.scenes) ? raw.scenes : []).slice(0, MAX_SCENES).map((s, i) => ({
    id: str(s?.id, `scene${i + 1}`, 60),
    name: str(s?.name, `장면 ${i + 1}`),
    bg: /^#[0-9a-f]{6}$/i.test(s?.bg) ? s.bg : '#eef2ff',
  }))
  const sounds = (Array.isArray(raw.sounds) ? raw.sounds : []).slice(0, 20)
    .map((s, i) => ({ id: str(s?.id, `snd${i}`, 60), name: str(s?.name, `소리${i + 1}`), data: safeAudio(s?.data) }))
    .filter((s) => s.data)
  return {
    version: PROJECT_VERSION,
    workspace: raw.workspace && typeof raw.workspace === 'object' ? raw.workspace : null,
    sprites: sprites.length ? sprites : [makeSprite({ id: 'coco', name: '코코', emoji: '🐨' })],
    scenes: scenes.length ? scenes : DEFAULT_SCENES(),
    sounds,
  }
}

export function serializeProject(project, workspaceState) {
  return {
    version: PROJECT_VERSION,
    workspace: workspaceState,
    sprites: project.sprites.map(({ id, name, emoji, image, x, y, dir, size, visible }) =>
      ({ id, name, emoji, image, x: Math.round(x), y: Math.round(y), dir, size, visible })),
    scenes: project.scenes,
    sounds: project.sounds,
  }
}

/* 이미지 파일/캔버스를 작은 PNG data URL로 (스프라이트 용량 절약) */
export function canvasToSpriteData(sourceCanvas, maxSize = 160) {
  const scale = Math.min(1, maxSize / Math.max(sourceCanvas.width, sourceCanvas.height))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(sourceCanvas.width * scale))
  c.height = Math.max(1, Math.round(sourceCanvas.height * scale))
  c.getContext('2d').drawImage(sourceCanvas, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

export function fileToSpriteData(file, maxSize = 160) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
      reject(new Error('PNG, JPG, GIF 이미지만 올릴 수 있어요'))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('5MB보다 작은 이미지를 골라주세요'))
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      c.getContext('2d').drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      resolve(canvasToSpriteData(c, maxSize))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 읽을 수 없어요'))
    }
    img.src = url
  })
}
