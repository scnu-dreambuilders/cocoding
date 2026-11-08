import { defineConfig } from 'vite'

/* 화면 문구를 채점기 번들에서 빼는 플러그인
   이름이 ...Text.js로 끝나는 파일에서 t('...')로 감싼 문구를 빈 칸으로 바꾼다.
   블록 입력 칸 자리(%1, %2)는 개수와 순서를 그대로 남긴다 — 지우면 블록이 깨진다.

   덕분에 화면 문구만 고쳤을 때는 grade.mjs가 한 글자도 바뀌지 않는다.
   (채점 결과에는 문구가 들어가지 않는다. 서버는 점수와 통과 여부만 돌려준다.) */
const TEXT_FILE = /[/\\]\w+Text\.js$/
const MARKED = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*\)/g

function stripDisplayText() {
  return {
    name: 'coco-strip-display-text',
    enforce: 'pre',
    transform(code, id) {
      if (!TEXT_FILE.test(id.split('?')[0])) return null
      let hits = 0
      const out = code.replace(MARKED, (_, single, double) => {
        hits++
        const slots = (single ?? double ?? '').match(/%\d/g) ?? []
        return `'${slots.join(' ')}'`
      })
      if (!hits) this.warn(`${id}에서 t()로 감싼 문구를 찾지 못했습니다`)
      return { code: out, map: null }
    },
  }
}

// 서버 재채점기를 Node.js에서 바로 실행되는 파일 하나로 묶는다 (blockly 포함, node_modules 없이 동작)
// 화면 없는 Blockly만 쓰므로 브라우저용 빌드(blockly.mjs)를 그대로 쓴다 — jsdom 불필요
export default defineConfig({
  plugins: [stripDisplayText()],
  build: {
    lib: { entry: 'grader/entry.js', formats: ['es'], fileName: () => 'grade.mjs' },
    outDir: '../backend/grader',
    emptyOutDir: true,
    target: 'node18',
    copyPublicDir: false,
  },
})
