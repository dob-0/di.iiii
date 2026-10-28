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

// Inline on purpose: this page must still read when the stylesheets failed to
// load. The fallbacks are the house tokens' own values (base.css), so the page
// looks the same with or without CSS.
export const VIEW_FAILED_INK = {
    text: 'var(--ui-text-primary, #fff)',
    ground: 'var(--ui-bg, #000)',
    line: 'var(--ui-border, rgba(255, 255, 255, 0.12))',
    muted: 'var(--ui-text-muted, rgba(255, 255, 255, 0.5))',
    sans: "var(--di-sans, Inter, system-ui, sans-serif)",
    mono: "var(--di-mono, 'JetBrains Mono', monospace)"
}

export function ViewFailed({ error }) {
    const message = String(error?.message || error || '').slice(0, 300)
    const ink = VIEW_FAILED_INK
    return (
        <div
            role="alert"
            data-testid="view-failed"
            style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 12,
                maxWidth: 560, margin: '15vh auto 0', padding: 24,
                color: ink.text, background: ink.ground,
                border: `1px solid ${ink.line}`, borderRadius: 0,
                fontFamily: ink.sans, fontSize: 14, lineHeight: 1.5
            }}
        >
            <strong>This view stopped working.</strong>
            {/* What is known, and nothing more (audit F142, 2026-10-28). The old
                line, "Work saved, nothing changed", was printed on every failure
                whatever the state of the save: this boundary cannot know it. */}
            <span style={{ color: ink.muted }}>
                Something went wrong while drawing this page. Reload to try again, or go to another page.
            </span>
            {/* The raw error is for whoever helps, folded away by default. */}
            {message && (
                <details data-testid="view-failed-details" style={{ color: ink.muted, fontSize: 13 }}>
                    <summary style={{ cursor: 'pointer' }}>Details for helpers</summary>
                    <code style={{ display: 'block', marginTop: 8, fontFamily: ink.mono, fontSize: 12, wordBreak: 'break-word' }}>{message}</code>
                </details>
            )}
            <button
                type="button"
                onClick={() => window.location.reload()}
                style={{
                    padding: '6px 14px', borderRadius: 0, cursor: 'pointer',
                    color: 'inherit', background: 'transparent', border: '1px solid currentColor', font: 'inherit'
                }}
            >
                Reload this view
            </button>
            <nav aria-label="Leave this view" style={{ display: 'flex', gap: 16 }}>
                <a href="/spaces" style={{ color: 'inherit' }}>Spaces</a>
                <a href="/" style={{ color: 'inherit' }}>di.iiii</a>
            </nav>
        </div>
    )
}

export function RouteErrorBoundary({ children }) {
    const { pathname } = useLocation()
    return <AppErrorBoundary name="RouteErrorBoundary" resetKey={pathname}>{children}</AppErrorBoundary>
}

export default AppErrorBoundary
