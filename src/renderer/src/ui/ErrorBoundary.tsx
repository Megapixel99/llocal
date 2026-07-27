import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

/**
 * App-level error boundary. Without it, any thrown render/effect error unmounts the whole React
 * tree and leaves a blank screen with no way out (a real problem on mobile, where you can't open
 * devtools). Instead we show a readable fallback with a Reload button.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface it for anyone with a console attached; the fallback UI covers the mobile case.
    console.error('Unhandled UI error:', error, info)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[#2c2c2c] p-6 text-center text-white">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="max-w-md break-words text-sm opacity-70">{error.message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
        >
          Reload
        </button>
      </div>
    )
  }
}
