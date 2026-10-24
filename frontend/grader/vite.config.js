import { defineConfig } from 'vite'

// 서버 재채점기를 Node.js에서 바로 실행되는 파일 하나로 묶는다 (blockly 포함, node_modules 없이 동작)
// 화면 없는 Blockly만 쓰므로 브라우저용 빌드(blockly.mjs)를 그대로 쓴다 — jsdom 불필요
export default defineConfig({
  build: {
    lib: { entry: 'grader/entry.js', formats: ['es'], fileName: () => 'grade.mjs' },
    outDir: '../backend/grader',
    emptyOutDir: true,
    target: 'node18',
    copyPublicDir: false,
  },
})
