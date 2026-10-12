import React from 'react'
import { useLocation } from 'react-router-dom'

// Catching rendering errors with an error boundary (React docs): a throw while
// rendering a panel used to unmount the whole app, because the only boundaries
// guard canvases and scene objects. Two levels use this one class:
//   - RouteErrorBoundary: around the routed surface, inside the router. The
//     chrome outside it (mode mark, tree chip, notices) stays usable, and a
//     move to another address clears the failure.
//   - the app root, the last resort when something outside the routed surface
//     throws: no router there, so the only way out is a reload.
// Reported the way the other boundaries report: console.error with a tag
// (runtimeConsole keeps those for the support bundle).
export class AppErrorBoundary extends React.Component {
    state = { error: null }

    static getDerivedStateFromError(error) {
        return { error: error || new Error('unknown render error') }
    }

    componentDidCatch(error, info) {
        console.error(`[${this.props.name || 'AppErrorBoundary'}] a view failed to draw:`, error, info?.componentStack)
    }

    componentDidUpdate(prevProps) {
        if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ error: null })
        }
    }

    render() {
        if (!this.state.error) return this.props.children
        return <ViewFailed error={this.state.error} />
    }
}

export function ViewFailed({ error }) {
    const message = String(error?.message || error || '').slice(0, 300)
    return (
        <div
            role="alert"
            data-testid="view-failed"
            style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
                maxWidth: 560, margin: '15vh auto 0', padding: 24,
                color: 'var(--ui-text-primary, #eee)', background: 'var(--ui-bg, #111)',
                border: '1px solid var(--ui-border, #444)', borderRadius: 0,
                font: '14px/1.5 system-ui, sans-serif'
            }}
        >
            <strong>This view stopped working.</strong>
            <span style={{ color: 'var(--ui-text-muted, #aaa)' }}>
                Something in it failed while drawing. Your work is saved as before; nothing was changed
                by this. Reload this view to try again, or go to the spaces list or the di home page.
            </span>
            {message && (
                <code style={{ color: 'var(--ui-text-muted, #aaa)', fontSize: 12, wordBreak: 'break-word' }}>{message}</code>
            )}
            <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                    padding: '6px 14px', borderRadius: 2, cursor: 'pointer',
                    color: 'inherit', background: 'transparent', border: '1px solid currentColor', font: 'inherit'
                }}
            >
                Reload this view
            </button>
            <nav aria-label="Leave this view" style={{ display: 'flex', gap: 16 }}>
                <a href="/spaces" style={{ color: 'inherit' }}>Spaces</a>
                <a href="/" style={{ color: 'inherit' }}>di home</a>
            </nav>
        </div>
    )
}

export function RouteErrorBoundary({ children }) {
    const { pathname } = useLocation()
    return <AppErrorBoundary name="RouteErrorBoundary" resetKey={pathname}>{children}</AppErrorBoundary>
}

export default AppErrorBoundary
