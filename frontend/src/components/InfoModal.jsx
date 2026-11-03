import { useEffect, useRef, useState } from 'react'
import { CONTACT, FAQ, LICENSES, PRIVACY, TERMS, UPDATED_AT } from '../data/siteInfo'
import './InfoModal.css'

/* ════════════════════════════════════════════════
   안내 문서 창 — 이용약관 / 개인정보처리방침 / 오픈소스 라이선스 / FAQ / 코코딩 정보
   푸터와 가입 화면(약관 전문 보기)에서 같은 창을 연다.
   ════════════════════════════════════════════════ */
const TABS = [
  { key: 'faq', label: '자주 묻는 질문' },
  { key: 'terms', label: '이용약관' },
  { key: 'privacy', label: '개인정보처리방침' },
  { key: 'license', label: '오픈소스 라이선스' },
  { key: 'contact', label: '코코딩 정보' },
]

function Doc({ doc }) {
  return (
    <>
      {doc.sections.map((s) => (
        <section key={s.h} className="info-block">
          <h4>{s.h}</h4>
          {s.p?.map((text, i) => <p key={i}>{text}</p>)}
          {s.list && <ul>{s.list.map((li, i) => <li key={i}>{li}</li>)}</ul>}
        </section>
      ))}
      <p className="info-updated">최종 수정일: {UPDATED_AT}</p>
    </>
  )
}

export default function InfoModal({ section = 'faq', onClose }) {
  const [tab, setTab] = useState(section)
  const closeRef = useRef(null)
  const panelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  // 열면 닫기 버튼으로 포커스, Esc로 닫기, Tab은 창 안에서만 돌고, 닫으면 원래 자리로 돌아가기
  useEffect(() => {
    const opener = document.activeElement
    closeRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') { onCloseRef.current?.(); return }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const items = [...panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((el) => !el.disabled && el.getClientRects().length > 0)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const here = document.activeElement
      if (e.shiftKey && (here === first || !panel.contains(here))) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && (here === last || !panel.contains(here))) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  return (
    <div className="info-overlay" role="presentation" onClick={onClose}>
      <div ref={panelRef} className="info-panel" role="dialog" aria-modal="true" aria-labelledby="info-title" onClick={(e) => e.stopPropagation()}>
        <div className="info-head">
          <h3 id="info-title">코코딩 안내</h3>
          <button ref={closeRef} type="button" className="info-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="info-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} aria-controls="info-body"
              className={`info-tab ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 길어서 스크롤되는 영역 — 키보드로도 스크롤할 수 있게 tabIndex */}
        <div className="info-body" id="info-body" role="tabpanel" tabIndex={0}>
          {tab === 'faq' && FAQ.map((g) => (
            <section key={g.group} className="info-block">
              <h4>{g.group}</h4>
              <dl className="info-faq">
                {g.items.map((item) => (
                  <div key={item.q}>
                    <dt>Q. {item.q}</dt>
                    <dd>{item.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}

          {tab === 'terms' && <Doc doc={TERMS} />}
          {tab === 'privacy' && <Doc doc={PRIVACY} />}

          {tab === 'license' && (
            <>
              <p className="info-intro">{LICENSES.intro}</p>
              <div className="info-table-wrap">
                <table className="info-table">
                  <thead>
                    <tr><th scope="col">이름</th><th scope="col">만든 곳</th><th scope="col">라이선스</th><th scope="col">쓰는 곳</th></tr>
                  </thead>
                  <tbody>
                    {LICENSES.items.map((l) => (
                      <tr key={l.name}>
                        <th scope="row">{l.name}</th>
                        <td>{l.by}</td>
                        <td>{l.license}</td>
                        <td>{l.use}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'contact' && (
            <section className="info-block">
              <h4>코코딩</h4>
              <p>초등학생을 위한 블록 코딩 학습 서비스입니다. {CONTACT.team}가 졸업작품으로 만들었습니다.</p>
              <dl className="info-contact">
                <div><dt>만든 팀</dt><dd>{CONTACT.team}</dd></div>
                <div><dt>문의</dt><dd><a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a></dd></div>
                <div><dt>저작권</dt><dd>© 2026 코코딩 · {CONTACT.team}</dd></div>
              </dl>
              <p className="info-note">{CONTACT.note}</p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
