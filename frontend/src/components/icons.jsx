/* ── Shared brand & UI icons ─────────────────────
   Extracted from duplicated inline definitions in
   AuthPage / DashboardPage / EditorPage. */

export function BrandIcon() {
  return (
    <div className="brand-icon" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2"    y="2"    width="7.5" height="7.5" rx="1.8" fill="white" opacity="0.95" />
        <rect x="10.5" y="2"    width="7.5" height="7.5" rx="1.8" fill="white" opacity="0.6"  />
        <rect x="2"    y="10.5" width="7.5" height="7.5" rx="1.8" fill="white" opacity="0.6"  />
        <rect x="10.5" y="10.5" width="7.5" height="7.5" rx="1.8" fill="white" opacity="0.28" />
      </svg>
    </div>
  )
}

export function IconPlay() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M3 2L10.5 6.5 3 11V2Z" fill="currentColor" />
    </svg>
  )
}

export function IconSpinner() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="spin" aria-hidden="true">
      <circle cx="6.5" cy="6.5" r="5" stroke="white" strokeWidth="1.4" strokeOpacity="0.25" />
      <path d="M6.5 1.5A5 5 0 0111.5 6.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function IconCopy() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <rect x="4" y="0.8" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M1.2 4.5V11A1.2 1.2 0 002.4 12.2H9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

export function IconCheck() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M2 6.5L5 9.5L11 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconTrash() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M1.5 3.5h10M5 1.5h3M2.8 3.5l.65 7.5A1 1 0 004.45 12h4.1a1 1 0 001-.95L10.2 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconSave() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M2 2h7.5L12 4.5V11a1 1 0 01-1 1H2a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
      <path d="M4 2v3.5h5V2M4 12V8h5v4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}

export function IconBack() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M8.5 2.5L4 7l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconCode() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M4 3.5L1.5 6.5 4 9.5M9 3.5L11.5 6.5 9 9.5M7.5 2L5.5 11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconTerminal() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <rect x="1" y="1.5" width="11" height="10" rx="2" stroke="currentColor" strokeWidth="1.25" />
      <path d="M3.5 5L5.5 6.5 3.5 8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 8h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  )
}
