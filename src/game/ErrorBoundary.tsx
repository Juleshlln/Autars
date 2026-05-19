import { Component, type ReactNode } from 'react'

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('Caught error in game:', error)
    console.error('Component stack:', info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <pre
          style={{
            position: 'fixed',
            inset: 0,
            margin: 0,
            padding: 24,
            background: '#0a061a',
            color: '#fff',
            whiteSpace: 'pre-wrap',
            fontFamily: 'ui-monospace, monospace',
            fontSize: 12,
            overflow: 'auto',
          }}
        >
          {`Error: ${this.state.error.message}\n\n${this.state.error.stack ?? ''}`}
        </pre>
      )
    }
    return this.props.children
  }
}
