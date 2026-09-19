import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import { CHAPTERS } from '../data/chapters'
import { formatCode } from '../lib/validators'
import './RolePanels.css'

/* ════════════════════════════════════════════════
   대시보드의 계정 유형별 화면
   · ConsentBanner   만 14세 미만 학생: 보호자 동의 코드 안내
   · StudentClasses  학생: 참여 코드로 반 들어가기
   · TeacherPanel    선생님: 반 만들기 · 참여 코드 · 학생별 진도
   · GuardianPanel   보호자: 동의 코드로 자녀 연결 · 자녀 진도
   ════════════════════════════════════════════════ */

function daysAgo(str) {
  if (!str) return '기록 없음'
  const d = new Date(str.replace(' ', 'T'))
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0) return '오늘'
  if (days === 1) return '어제'
  if (days < 30) return `${days}일 전`
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

async function copyText(text, showToast) {
  try {
    await navigator.clipboard.writeText(text)
    showToast('복사했어요!')
  } catch {
    showToast(`코드: ${text}`)
  }
}

function PanelSection({ icon, title, badge, children, className = '' }) {
  return (
    <section className={`dash-section role-panel ${className}`}>
      <div className="section-header">
        <h3 className="section-title"><span aria-hidden="true">{icon}</span>{title}</h3>
        {badge && <span className="section-badge">{badge}</span>}
      </div>
      {children}
    </section>
  )
}

/* 챕터 진도 칸: 완료(점수) / 도전 중 / 잠김 */
function ChapterCells({ chapters }) {
  return chapters.map((c) => {
    const title = `챕터 ${c.order_num} · ${CHAPTERS[c.order_num]?.title ?? ''}`
    if (c.status === 'completed') {
      return <span key={c.order_num} className="cp-cell cp-done" title={`${title} — 완료 (최고 ${c.best_score ?? '-'}점)`}>{c.best_score ?? '✓'}</span>
    }
    if (c.status === 'in_progress') {
      return <span key={c.order_num} className="cp-cell cp-active" title={`${title} — 도전 중 (제출 ${c.attempts}번)`}>{c.attempts ? `${c.attempts}회` : '▶'}</span>
    }
    return <span key={c.order_num} className="cp-cell cp-locked" title={`${title} — 잠김`} aria-label="잠김">·</span>
  })
}

/* ── 보호자 동의 안내 (동의 전 학생) ─────────────────── */
export function ConsentBanner({ user, onRefresh }) {
  const [checking, setChecking] = useState(false)
  const check = async () => {
    setChecking(true)
    await onRefresh()
    setChecking(false)
  }
  return (
    <section className="consent-banner" aria-label="보호자 동의 안내">
      <div className="consent-emoji" aria-hidden="true">👪</div>
      <div className="consent-body">
        <h3>부모님의 동의가 필요해요</h3>
        <p>14살 이하 친구는 부모님(보호자)이 동의해야 <b>작품 공유·친구 작품 보기·리메이크</b>를 할 수 있어요. 챕터 학습과 작품 만들기는 지금도 할 수 있어요!</p>
        <ol>
          <li>부모님이 코코딩에 <b>보호자</b>로 가입해요</li>
          <li>보호자 화면에서 아래 <b>동의 코드</b>를 입력해요</li>
        </ol>
      </div>
      <div className="consent-code-box">
        <span className="consent-code-label">동의 코드</span>
        <span className="consent-code">{formatCode(user.consent_code)}</span>
        <button type="button" className="role-btn" onClick={check} disabled={checking}>
          {checking ? '확인 중…' : '동의됐는지 확인'}
        </button>
      </div>
    </section>
  )
}

/* ── 학생: 우리 반 ──────────────────────────────── */
export function StudentClasses({ showToast }) {
  const [list, setList] = useState([])
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.classes().then(setList).catch(() => setList([]))
  }, [])

  const join = async (e) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    try {
      const joined = await api.joinClass(code)
      setList((l) => [...l, joined])
      setCode('')
      showToast(`'${joined.name}' 반에 들어왔어요! 🏫`)
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  const leave = async (c) => {
    if (!window.confirm(`'${c.name}' 반에서 나갈까요? 선생님이 더 이상 내 진도를 볼 수 없어요.`)) return
    try {
      await api.deleteClass(c.id)
      setList((l) => l.filter((x) => x.id !== c.id))
    } catch (err) {
      showToast(err.message)
    }
  }

  return (
    <PanelSection icon="🏫" title="우리 반" badge={list.length ? `${list.length}개` : null}>
      <div className="class-join-row">
        {list.map((c) => (
          <span key={c.id} className="class-chip">
            🏫 {c.name} <small>{c.teacher_name} 선생님</small>
            <button type="button" onClick={() => leave(c)} aria-label={`${c.name} 반에서 나가기`} title="반에서 나가기">×</button>
          </span>
        ))}
        <form className="code-form" onSubmit={join}>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8}
            placeholder="선생님이 알려준 참여 코드" aria-label="반 참여 코드" />
          <button type="submit" className="role-btn" disabled={busy || !code.trim()}>반 들어가기</button>
        </form>
      </div>
      {list.length === 0 && <p className="dash-hint">반에 들어가면 선생님이 내 챕터 진도를 볼 수 있어요. 이메일이나 태어난 해는 보이지 않아요.</p>}
    </PanelSection>
  )
}

/* ── 선생님: 반 관리 ────────────────────────────── */
export function TeacherPanel({ showToast }) {
  const [classes, setClasses] = useState(null)
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    api.classes()
      .then((list) => {
        setClasses(list)
        if (list.length) setSelected(list[0].id)
      })
      .catch((e) => {
        setClasses([])
        showToast(e.message)
      })
  }, [showToast])

  // 고른 반의 진도 (detail.id가 selected와 다르면 아직 불러오는 중)
  useEffect(() => {
    if (!selected) return undefined
    let alive = true
    api.classDetail(selected)
      .then((d) => { if (alive) setDetail(d) })
      .catch((e) => showToast(e.message))
    return () => { alive = false }
  }, [selected, reload, showToast])

  const create = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setBusy(true)
    try {
      const c = await api.createClass(name.trim())
      setClasses((l) => [...l, { ...c, member_count: 0 }])
      setSelected(c.id)
      setName('')
      showToast(`'${c.name}' 반을 만들었어요. 참여 코드를 학생들에게 알려주세요!`)
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  const regenerate = async () => {
    if (!window.confirm('참여 코드를 새로 만들까요? 예전 코드로는 더 이상 들어올 수 없어요. (이미 들어온 학생은 그대로예요)')) return
    try {
      const c = await api.updateClass(detail.id, { regenerate_code: true })
      setDetail((d) => ({ ...d, join_code: c.join_code }))
      setClasses((l) => l.map((x) => (x.id === c.id ? { ...x, join_code: c.join_code } : x)))
    } catch (err) {
      showToast(err.message)
    }
  }

  const removeClass = async () => {
    if (!window.confirm(`'${detail.name}' 반을 삭제할까요? 학생 계정과 작품은 그대로 남아요.`)) return
    try {
      await api.deleteClass(detail.id)
      const rest = classes.filter((x) => x.id !== detail.id)
      setClasses(rest)
      setSelected(rest[0]?.id ?? null)
    } catch (err) {
      showToast(err.message)
    }
  }

  const removeStudent = async (s) => {
    if (!window.confirm(`${s.username} 학생을 '${detail.name}' 반에서 뺄까요?`)) return
    try {
      await api.removeStudent(detail.id, s.id)
      setDetail((d) => ({ ...d, students: d.students.filter((x) => x.id !== s.id) }))
      setClasses((l) => l.map((x) => (x.id === detail.id ? { ...x, member_count: x.member_count - 1 } : x)))
    } catch (err) {
      showToast(err.message)
    }
  }

  const students = detail?.students ?? []
  const avg = students.length ? (students.reduce((n, s) => n + s.completed, 0) / students.length).toFixed(1) : '-'
  const chapterCount = students[0]?.chapter_count ?? Object.keys(CHAPTERS).length

  return (
    <PanelSection icon="🧑‍🏫" title="내 반 관리" badge={classes?.length ? `${classes.length}개 반` : null} className="teacher-panel">
      <div className="class-tabs" role="tablist" aria-label="반 목록">
        {(classes ?? []).map((c) => (
          <button key={c.id} type="button" role="tab" aria-selected={selected === c.id}
            className={`class-tab ${selected === c.id ? 'on' : ''}`} onClick={() => setSelected(c.id)}>
            {c.name} <small>{c.member_count}명</small>
          </button>
        ))}
        <form className="code-form" onSubmit={create}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="새 반 이름 (예: 4학년 2반)" aria-label="새 반 이름" />
          <button type="submit" className="role-btn" disabled={busy || !name.trim()}>＋ 반 만들기</button>
        </form>
      </div>

      {classes && classes.length === 0 && (
        <div className="role-empty">
          <b>반을 만들어보세요!</b>
          <span>반을 만들면 참여 코드가 생겨요. 학생들이 대시보드의 <b>우리 반</b>에 코드를 입력하면 챕터 진도를 한눈에 볼 수 있어요.</span>
        </div>
      )}

      {selected && detail?.id !== selected && <div className="skeleton-card role-skeleton" aria-hidden="true" />}

      {detail && detail.id === selected && (
        <div className="class-detail">
          <div className="class-summary">
            <div className="join-code-box">
              <span className="consent-code-label">참여 코드</span>
              <span className="consent-code">{detail.join_code}</span>
              <div className="join-code-actions">
                <button type="button" className="role-btn" onClick={() => copyText(detail.join_code, showToast)}>복사</button>
                <button type="button" className="role-btn ghost" onClick={regenerate}>새 코드</button>
              </div>
            </div>
            <div className="class-stats">
              <div><b>{students.length}</b><span>학생</span></div>
              <div><b>{avg}</b><span>평균 완료 챕터</span></div>
              <div><b>{students.filter((s) => s.completed >= chapterCount).length}</b><span>모두 완료</span></div>
            </div>
            <div className="join-code-actions">
              <button type="button" className="role-btn ghost" onClick={() => setReload((n) => n + 1)} title="새로 들어온 학생·최신 진도 불러오기">↻ 새로고침</button>
              <button type="button" className="role-btn danger" onClick={removeClass}>반 삭제</button>
            </div>
          </div>

          {students.length === 0 ? (
            <div className="role-empty">
              <b>아직 들어온 학생이 없어요</b>
              <span>학생들에게 참여 코드 <b>{detail.join_code}</b>를 알려주세요.</span>
            </div>
          ) : (
            <div className="progress-table-wrap">
              <table className="progress-table">
                <thead>
                  <tr>
                    <th scope="col">학생</th>
                    {students[0].chapters.map((c) => <th key={c.order_num} scope="col" title={CHAPTERS[c.order_num]?.title}>챕터 {c.order_num}</th>)}
                    <th scope="col">완료</th>
                    <th scope="col">작품</th>
                    <th scope="col">최근 활동</th>
                    <th scope="col"><span className="sr-only">관리</span></th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id}>
                      <th scope="row">
                        {s.username}
                        {s.consent_status === 'pending' && <span className="consent-pill" title="보호자 동의 전이라 작품 공유가 제한돼요">동의 대기</span>}
                      </th>
                      <ChapterCellsRow chapters={s.chapters} />
                      <td><b>{s.completed}</b>/{s.chapter_count}</td>
                      <td>{s.projects}{s.shared_projects > 0 && <small> (공개 {s.shared_projects})</small>}</td>
                      <td>{daysAgo(s.last_active)}</td>
                      <td><button type="button" className="row-remove" onClick={() => removeStudent(s)} aria-label={`${s.username} 반에서 빼기`} title="반에서 빼기">×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="table-legend">
                <span className="cp-cell cp-done">90</span> 완료(최고 점수)
                <span className="cp-cell cp-active">2회</span> 도전 중(제출 횟수)
                <span className="cp-cell cp-locked">·</span> 아직 잠김
              </p>
            </div>
          )}
        </div>
      )}
    </PanelSection>
  )
}

function ChapterCellsRow({ chapters }) {
  return chapters.map((c) => <td key={c.order_num}><ChapterCells chapters={[c]} /></td>)
}

/* ── 보호자: 자녀 연결 · 진도 ───────────────────── */
const CONSENT_ITEMS = [
  ['모으는 정보', '닉네임, 이메일, 태어난 해, 아이가 만든 작품(그림·녹음 포함), 학습 기록'],
  ['쓰는 곳', '블록 코딩 학습 제공, 친구들과 작품 공유·리메이크, 선생님 반 진도 확인'],
  ['보관 기간', '회원 탈퇴 시 바로 삭제'],
  ['동의 철회', '언제든 이 화면에서 연결을 끊으면 철회되고, 아이의 공개 작품은 비공개로 바뀌어요'],
]

export function GuardianPanel({ showToast }) {
  const [children, setChildren] = useState(null)
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState(null)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api.children().then(setChildren).catch((e) => {
      setChildren([])
      showToast(e.message)
    })
  }, [showToast])

  useEffect(() => {
    load()
  }, [load])

  const lookup = async (e) => {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    try {
      setPreview(await api.consentChild(code))
      setAgreed(false)
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  const consent = async () => {
    setBusy(true)
    try {
      const res = await api.consentChild(code, true)
      showToast(res.message)
      setPreview(null)
      setCode('')
      load()
    } catch (err) {
      showToast(err.message)
    } finally {
      setBusy(false)
    }
  }

  const unlink = async (child) => {
    if (!window.confirm(`${child.username} 계정과 연결을 끊을까요?\n다른 보호자가 없으면 동의가 철회되고, 아이의 공개 작품은 비공개로 바뀌어요.`)) return
    try {
      const res = await api.unlinkChild(child.id)
      showToast(res.message)
      setChildren((l) => l.filter((c) => c.id !== child.id))
    } catch (err) {
      showToast(err.message)
    }
  }

  return (
    <PanelSection icon="👪" title="우리 아이" badge={children?.length ? `${children.length}명` : null} className="guardian-panel">
      {preview ? (
        <div className="consent-form">
          <h4><b>{preview.username}</b> ({preview.birth_year}년생) 계정이 맞나요?</h4>
          <p>아래 내용을 읽고 동의하시면 아이 계정과 연결되고, 아이가 친구들과 작품을 나눌 수 있게 돼요.</p>
          <dl className="consent-items">
            {CONSENT_ITEMS.map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
          <label className="share-check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>보호자로서 위 개인정보 수집·이용에 동의합니다 (만 14세 미만 아동 법정대리인 동의)</span>
          </label>
          <div className="consent-actions">
            <button type="button" className="role-btn ghost" onClick={() => setPreview(null)}>취소</button>
            <button type="button" className="role-btn" onClick={consent} disabled={!agreed || busy}>동의하고 연결</button>
          </div>
        </div>
      ) : (
        <form className="code-form wide" onSubmit={lookup}>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={9}
            placeholder="아이 화면의 동의 코드 (예: ABCD-2345)" aria-label="자녀 동의 코드" />
          <button type="submit" className="role-btn" disabled={busy || !code.trim()}>아이 계정 찾기</button>
        </form>
      )}

      {children && children.length === 0 && !preview && (
        <div className="role-empty">
          <b>아이 계정을 연결해보세요</b>
          <span>아이가 로그인하면 대시보드에 <b>동의 코드</b>가 보여요. 코드를 입력하고 동의하면 아이의 학습 진도를 여기서 볼 수 있어요.</span>
        </div>
      )}

      <div className="children-grid">
        {(children ?? []).map((c) => (
          <article key={c.id} className="child-card">
            <header>
              <h4>{c.username}</h4>
              <span className="child-active">최근 활동: {daysAgo(c.last_active)}</span>
            </header>
            <div className="child-progress" aria-label={`챕터 ${c.chapter_count}개 중 ${c.completed}개 완료`}>
              <div className="child-bar"><span style={{ width: `${(c.completed / c.chapter_count) * 100}%` }} /></div>
              <b>{c.completed}/{c.chapter_count}</b> 챕터 완료
            </div>
            <div className="child-chapters"><ChapterCells chapters={c.chapters} /></div>
            <div className="child-meta">
              <span>📁 작품 {c.projects}개</span>
              <span>🌟 공개 {c.shared_projects}개</span>
            </div>
            <button type="button" className="role-btn ghost danger-text" onClick={() => unlink(c)}>연결 끊기</button>
          </article>
        ))}
      </div>
    </PanelSection>
  )
}
