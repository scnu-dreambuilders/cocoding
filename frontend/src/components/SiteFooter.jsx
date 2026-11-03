import { useState } from 'react'
import { BrandIcon } from './icons'
import { CONTACT, SITEMAP } from '../data/siteInfo'
import InfoModal from './InfoModal'
import './SiteFooter.css'

/* ════════════════════════════════════════════════
   공통 푸터 — 사이트맵 + 안내 문서 + 연락처 + 저작권
   요구사항 SFR-COM-001~005. 홈과 학생 대시보드에서 같이 쓴다.
   onNavigate(key): 사이트맵에서 서비스 메뉴를 눌렀을 때 (안내 문서는 이 안에서 창으로 염)
   ════════════════════════════════════════════════ */
const DOC_KEYS = new Set(['faq', 'terms', 'privacy', 'license', 'contact'])

export default function SiteFooter({ onNavigate }) {
  const [doc, setDoc] = useState(null)

  const click = (key) => {
    if (DOC_KEYS.has(key)) setDoc(key)
    else onNavigate?.(key)
  }

  return (
    <>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <div className="site-footer-brand">
            <BrandIcon />
            <div>
              <b>코코딩</b>
              <span>초등학생을 위한 블록 코딩 학습 서비스</span>
            </div>
          </div>

          <nav className="site-footer-map" aria-label="사이트맵">
            {SITEMAP.map((col) => (
              <div key={col.group} className="site-footer-col">
                <h4>{col.group}</h4>
                <ul>
                  {col.links.map((l) => (
                    <li key={l.key}>
                      <button type="button" onClick={() => click(l.key)}>{l.label}</button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="site-footer-bottom">
            <p className="site-footer-note">
              🔒 회원가입과 서비스 제공에 필요한 최소한의 정보(닉네임, 이메일, 태어난 해)만 모아요.
              만 14세 미만은 보호자 동의 후에 작품을 공유할 수 있어요.
            </p>
            <p className="site-footer-meta">
              <span>문의 <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></span>
              <span>© 2026 코코딩 · {CONTACT.team}</span>
            </p>
          </div>
        </div>
      </footer>

      {doc && <InfoModal section={doc} onClose={() => setDoc(null)} />}
    </>
  )
}
