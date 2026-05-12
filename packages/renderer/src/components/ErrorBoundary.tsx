import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 32 }}>
          <p style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>出了点问题</p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', maxWidth: 400, textAlign: 'center', lineHeight: 1.6 }}>
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            onClick={this.handleReload}
            style={{ padding: '6px 16px', fontSize: 12, borderRadius: 6, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
