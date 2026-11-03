import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 배포 서버(deploy/apache-cocoding.conf)와 같은 보안 헤더 — `npm run preview`로 빌드 결과를 같은 조건에서 확인
// (개발 서버는 HMR 때문에 인라인 스크립트가 필요해서 적용하지 않음)
// VITE_API_URL이 '/backend/api'처럼 같은 도메인의 경로면 별도 출처가 없다 (connect-src 'self'로 충분)
const apiUrl = process.env.VITE_API_URL ?? ''
const apiOrigin = /^https?:\/\//.test(apiUrl) ? new URL(apiUrl).origin : ''
const securityHeaders = {
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:", "media-src 'self' data: blob:", `connect-src 'self' ${apiOrigin}`.trim(),
    "font-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=(self)',
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 포트가 밀려나면 backend/.env의 ALLOWED_ORIGINS에 없는 주소가 되어 가입·로그인이 전부 막힌다.
  // 조용히 5174로 옮겨가지 말고 그 자리에서 멈추게 해서, 먼저 뜬 개발 서버를 끄고 다시 켜도록 한다.
  server: { port: 5173, strictPort: true },
  preview: { headers: securityHeaders },
})
