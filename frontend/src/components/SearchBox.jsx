import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import './SearchBox.css'

/* ════════════════════════════════════════════════
   전체 검색 — 내 작품, 친구 작품, 챕터를 한 번에 찾는다.
   두 글자 이상 입력하면 잠시 뒤 자동으로 찾는다.
   ════════════════════════════════════════════════ */
const DEBOUNCE_MS = 350

export default function SearchBox({ onOpenProject, onOpenChapter, onRemake }) {
  const [q, setQ] = useState('')
  const [result, setResult] = useState(null) // { query, ... }
  const [error, setError] = useState(null)   // { query, message }
  const boxRef = useRef(null)
  const query = q.trim()

  // 입력이 멈추면 검색. 결과에 검색어를 같이 담아서, 지금 입력과 다르면 '찾는 중'으로 보여준다
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return undefined
    const timer = setTimeout(() => {
      api.search(term)
        .then((r) => setResult(r))
        .catch((e) => setError({ query: term, message: e.message }))
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [q])

  // 바깥을 누르면 결과 닫기
  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setResult(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  const close = () => {
    setQ('')
    setResult(null)
    setError(null)
  }

  const open = (fn, arg) => {
    close()
    fn?.(arg)
  }

  return (
    <div className="searchbox" ref={boxRef}>
      <span className="searchbox-icon" aria-hidden="true">🔍</span>
      <input
        type="search"
        className="searchbox-input"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') close() }}
        placeholder="작품·챕터 검색 (두 글자 이상)"
        aria-label="전체 검색"
      />
      {q && <button type="button" className="searchbox-clear" onClick={close} aria-label="검색어 지우기">×</button>}

      {query.length >= 2 && (
        <div className="searchbox-results" role="group" aria-label="검색 결과">
          {error?.query === query ? (
            <p className="searchbox-msg" role="alert">{error.message}</p>
          ) : result?.query !== query ? (
            <p className="searchbox-msg" role="status">찾는 중…</p>
          ) : result.total === 0 ? (
            <p className="searchbox-msg">‘{result.query}’에 맞는 결과가 없어요.</p>
          ) : (
            <>
              <p className="sr-only" role="status">검색 결과 {result.total}개</p>
              {result.chapters.length > 0 && (
                <section>
                  <h4>단계별 학습</h4>
                  {result.chapters.map((c) => (
                    <button key={c.id} type="button" className="searchbox-row" onClick={() => open(onOpenChapter, c)}
                      disabled={c.status === 'locked'}>
                      <span className="searchbox-badge">챕터 {c.order_num}</span>
                      <span className="searchbox-title">{c.title}</span>
                      {c.status === 'locked' && <span className="searchbox-tag">🔒 잠김</span>}
                      {c.status === 'completed' && <span className="searchbox-tag is-done">완료</span>}
                    </button>
                  ))}
                </section>
              )}

              {result.myProjects.length > 0 && (
                <section>
                  <h4>내 작품</h4>
                  {result.myProjects.map((p) => (
                    <button key={p.id} type="button" className="searchbox-row" onClick={() => open(onOpenProject, p)}>
                      <span className="searchbox-badge">{p.track === 'chapter' ? '챕터' : '자유'}</span>
                      <span className="searchbox-title">{p.title}</span>
                      {Boolean(p.is_public) && <span className="searchbox-tag">공개</span>}
                    </button>
                  ))}
                </section>
              )}

              {result.publicProjects.length > 0 && (
                <section>
                  <h4>친구 작품</h4>
                  {result.publicProjects.map((p) => (
                    <button key={p.id} type="button" className="searchbox-row"
                      onClick={() => open(p.allow_remake ? onRemake : onOpenProject, p)}>
                      <span className="searchbox-badge">👤 {p.username}</span>
                      <span className="searchbox-title">{p.title}</span>
                      <span className="searchbox-tag">{p.allow_remake ? '🔁 리메이크' : '👀 구경'}</span>
                    </button>
                  ))}
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
