import { Component, type ReactNode } from 'react'
import { Alert, AlertDescription } from './ui/alert'
import { Button } from './ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from './ui/card'
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
          <Card className="error-boundary__card">
            <CardHeader className="error-boundary__header">
              <CardTitle className="error-boundary__title">出了点问题</CardTitle>
            </CardHeader>
            <CardContent className="error-boundary__content">
              <Alert variant="destructive" className="error-boundary__alert">
                <AlertDescription>
                  {this.state.error?.message || '未知错误'}
                </AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter className="error-boundary__footer">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="error-boundary__retry"
                onClick={this.handleReload}
              >
                重试
              </Button>
            </CardFooter>
          </Card>
        </div>
      )
    }
    return this.props.children
  }
}
