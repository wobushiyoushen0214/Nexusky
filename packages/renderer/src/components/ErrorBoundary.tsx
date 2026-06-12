import { Component, type ReactNode } from 'react'
import { Button } from './ui/button'
import './error-boundary.css'

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
        <div className="error-boundary">
          <p className="error-boundary__title">出了点问题</p>
          <p className="error-boundary__message">
            {this.state.error?.message || '未知错误'}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="error-boundary__retry"
            onClick={this.handleReload}
          >
            重试
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
