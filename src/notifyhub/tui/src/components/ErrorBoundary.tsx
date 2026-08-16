import { Component, type ReactNode } from "react"
import { ThemeContext, type Theme } from "../theme"

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static contextType = ThemeContext
  declare context: Theme

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        this.props.fallback ?? (
          <box width="100%" height={3} paddingX={1}>
            <text fg={this.context.error}>
              Rendering error: {this.state.error.message}
            </text>
          </box>
        )
      )
    }

    return this.props.children
  }
}
