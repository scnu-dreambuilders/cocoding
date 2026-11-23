import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// 관리자 웹 — 학생 앱(frontend, 5173)과 따로 띄운다.
// 5175는 backend/.env 의 ALLOWED_ORIGINS 예시에 들어 있는 포트다 (실제 서버 설정은 백엔드 담당자 확인 필요).
// 포트가 이미 쓰이고 있으면 다른 포트로 옮겨가지 않고 멈춘다 (허용되지 않은 주소로 뜨면 로그인이 전부 막힌다).

// 개발 서버 전용 API 프록시 (기본은 꺼져 있음)
// 실제 서버가 localhost:5175 를 CORS 로 허용하지 않을 때, 서버 설정을 바꾸지 않고 확인하려고 둔다.
// ADMIN_API_PROXY 에 서버 주소(https://…)를 넣고 VITE_API_URL 을 '/backend/api' 로 주면,
// 브라우저는 localhost:5175/backend/api 만 부르고 이 개발 서버가 그 서버로 전달한다.
// npm run build(운영 빌드)와 npm run preview 에는 영향이 없다.
const proxyTarget = (process.env.ADMIN_API_PROXY ?? '').trim()
if (proxyTarget && !/^https?:\/\/[^/\s]+$/.test(proxyTarget)) {
  throw new Error('ADMIN_API_PROXY 는 https://example.com 처럼 경로 없이 서버 주소만 적어 주세요.')
}
const proxy = proxyTarget
  ? { '/backend/api': { target: proxyTarget, changeOrigin: true, secure: true } }
  : undefined

export default defineConfig({
  plugins: [react()],
  server: { port: 5175, strictPort: true, proxy },
  preview: { port: 5175, strictPort: true },
})
