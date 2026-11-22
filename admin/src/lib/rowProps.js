// 표의 한 줄 전체를 눌러(또는 Enter·Space) 상세를 연다 — 줄 안의 버튼을 누를 때는 건드리지 않는다
export function rowProps(onOpen) {
  return {
    tabIndex: 0,
    onClick: onOpen,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() }
    },
  }
}
