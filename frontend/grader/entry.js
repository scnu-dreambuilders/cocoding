/* ════════════════════════════════════════════════
   서버 재채점기 (Node.js) — backend/api/chapters/progress.php가 실행
   브라우저 '정답 제출'과 같은 채점기(engine/grader.js)를 그대로 돌려서
   브라우저가 보낸 점수 대신 서버가 직접 점수를 정한다.
   stdin : {"chapter": 챕터 번호(order_num), "blocks_data": 제출한 작품}
   stdout: {"score": 0~100, "passed": bool}  (실패하면 {"error": "..."})
   빌드: npm run build:grader → backend/grader/grade.mjs
   ════════════════════════════════════════════════ */
import * as Blockly from 'blockly'
import { DOMImplementation, DOMParser, XMLSerializer } from '@xmldom/xmldom'
import { gradeChapter } from '../src/engine/grader'
import { CHAPTERS } from '../src/data/chapters'
import { setBlockContext } from '../src/blockly/blocks'
import { makeProject } from '../src/lib/project'

// 화면 없는 Node에는 document가 없어서, Blockly가 블록을 만들 때 쓰는 XML 기능만 채워준다
Blockly.utils.xml.injectDependencies({
  document: new DOMImplementation().createDocument(null, null, null),
  DOMParser,
  XMLSerializer,
})

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// 챕터의 캐릭터·장면은 잠겨 있어서 챕터 정의 그대로 쓴다.
// 학생이 바꿀 수 있는 건 무대에서 끌어 옮긴 위치뿐이라 그것만 제출본에서 가져온다
function chapterProject(chapter, submitted) {
  const project = makeProject({ sprites: chapter.sprites(), scenes: chapter.scenes?.() })
  const moved = Array.isArray(submitted?.sprites) ? submitted.sprites : []
  project.sprites = project.sprites.map((s) => {
    const m = moved.find((x) => x && x.id === s.id)
    if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.y)) return s
    return { ...s, x: clamp(Math.round(m.x), -240, 240), y: clamp(Math.round(m.y), -180, 180) }
  })
  return project
}

async function grade(input) {
  const chapter = CHAPTERS[input?.chapter]
  if (!chapter) return { error: 'unknown chapter' }
  const submitted = input.blocks_data
  const project = chapterProject(chapter, submitted)
  setBlockContext(project) // 블록 드롭다운이 워크스페이스 로드 전에 캐릭터 목록을 알아야 함

  const workspace = new Blockly.Workspace()
  try {
    const state = submitted?.workspace
    if (state && typeof state === 'object') Blockly.serialization.workspaces.load(state, workspace)
  } catch (err) {
    // 없는 블록·깨진 데이터 → 실행할 수 없는 코드로 채점 (0점). detail은 서버 로그용
    return { score: 0, passed: false, detail: String(err?.message ?? err).slice(0, 200) }
  }
  const res = await gradeChapter({ chapter, workspace, project })
  workspace.dispose()
  return { score: res.score, passed: res.passed }
}

// 브라우저용 빌드라 'node:process'를 import하면 빈 모듈로 바뀐다 → Node 전역 process를 직접 쓴다
const { process } = globalThis
let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => { raw += chunk })
process.stdin.on('end', async () => {
  let out
  try {
    out = await grade(JSON.parse(raw))
  } catch (err) {
    out = { error: String(err?.message ?? err) }
  }
  process.stdout.write(JSON.stringify(out))
  process.exit(0)
})
