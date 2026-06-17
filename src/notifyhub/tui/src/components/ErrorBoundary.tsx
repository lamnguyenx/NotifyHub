import { Component, type ReactNode } from "react"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <box width="100%" height={3} paddingX={1}>
            <text fg="#ef5350">
              Rendering error: {this.state.error.message}
            </text>
          </box>
        )
      )
    }

    return this.props.children
  }
}
