import { CHAPTER_OPTIONS, blockOptions } from '../lib/boardTopics'

/* ════════════════════════════════════════════════
   코딩 게시판 목록 도구 — [전체·질문·토론] 탭, 제목·내용 검색, 질문 필터
   · 검색창의 글자(searchInput)와 실제로 적용된 검색어(appliedQ)는 따로다. [검색]을 눌러야 적용된다.
   · 질문 필터(챕터·관련 블록·해결 상태)는 질문 탭에서만 보이고 질문 글에만 적용된다.
   · 값은 BoardPage가 들고 있어서 글 상세에 들어갔다 돌아와도 그대로다.
   ════════════════════════════════════════════════ */
const TABS = [['all', '전체'], ['question', '질문'], ['discussion', '토론']]
const STATUS = [['all', '전체 상태'], ['open', '미해결'], ['solved', '해결됨']]
// 필터의 챕터: 전체('') · 챕터 1~5 · 자유창작 · 챕터를 고르지 않은 질문('none')
const CHAPTER_FILTER = [
  { value: '', label: '전체 챕터' },
  ...CHAPTER_OPTIONS.filter((o) => o.value !== ''),
  { value: 'none', label: '챕터 선택 안 한 질문' },
]

export default function BoardFilters({
  query, onQuery, searchInput, onSearchInput, onSearch, onClearSearch,
}) {
  const blocks = blockOptions(query.chapter)
  return (
    <div className="board-tools">
      <div className="board-tabs" role="group" aria-label="글 종류">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={query.kind === k} onClick={() => onQuery({ kind: k })}>{label}</button>
        ))}
      </div>

      <form className="board-search" role="search" onSubmit={(e) => { e.preventDefault(); onSearch() }}>
        <input type="search" value={searchInput} onChange={(e) => onSearchInput(e.target.value)} maxLength={50}
          placeholder="제목·내용 검색" aria-label="제목·내용 검색" />
        <button type="submit" className="role-btn">검색</button>
      </form>
      {query.q && (
        <p className="board-applied">
          <span>‘{query.q}’ 검색 중</span>
          <button type="button" className="link-btn" onClick={onClearSearch}>검색 지우기</button>
        </p>
      )}

      {query.kind === 'question' && (
        <div className="board-filters" role="group" aria-label="질문 필터">
          <label className="board-field">
            <span>챕터</span>
            <select value={query.chapter} onChange={(e) => {
              const chapter = e.target.value
              // 고른 챕터까지 배우지 않은 블록이 걸려 있으면 블록 조건은 푼다
              const keep = !query.block || blockOptions(chapter).some((o) => o.value === query.block)
              onQuery({ chapter, block: keep ? query.block : '' })
            }}>
              {CHAPTER_FILTER.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="board-field">
            <span>관련 블록</span>
            <select value={query.block} onChange={(e) => onQuery({ block: e.target.value })}>
              <option value="">전체 블록</option>
              {blocks.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <div className="board-status-pick" role="group" aria-label="해결 상태">
            {STATUS.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={query.status === k} onClick={() => onQuery({ status: k })}>{label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
