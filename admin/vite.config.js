import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 관리자 웹 — 학생 앱(frontend, 5173)과 따로 띄운다.
// 5175는 backend/.env 의 ALLOWED_ORIGINS 예시에 들어 있는 포트다 (실제 서버 설정은 백엔드 담당자 확인 필요).
// 포트가 이미 쓰이고 있으면 다른 포트로 옮겨가지 않고 멈춘다 (허용되지 않은 주소로 뜨면 로그인이 전부 막힌다).
export default defineConfig({
  plugins: [react()],
  server: { port: 5175, strictPort: true },
  preview: { port: 5175, strictPort: true },
})
