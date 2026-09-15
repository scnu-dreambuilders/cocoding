import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', gap: '1rem', textAlign: 'center',
        fontFamily: 'inherit', padding: '1rem',
      }}>
        <p>문제가 발생했습니다. 페이지를 새로고침해주세요.</p>
        <button type="button" onClick={() => window.location.reload()}>
          새로고침
        </button>
      </div>
    )
  }
}
