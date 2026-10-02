import { Component, useCallback, useEffect, useRef, useState } from 'react'
import './webglContextGuard.css'

// The browser only fires webglcontextrestored because three's WebGLRenderer
// calls preventDefault() on webglcontextlost; if restoration never comes
// (common on Linux/Mesa driver resets) the canvas stays dead until remounted.
export function useWebglContextGuard() {
    const [contextLost, setContextLost] = useState(false)
    const [canvasKey, setCanvasKey] = useState(0)
    const autoRestoreSpentRef = useRef(false)
    const timerRef = useRef(null)

    const restoreContext = useCallback(() => {
        clearTimeout(timerRef.current)
        setContextLost(false)
        setCanvasKey((key) => key + 1)
    }, [])

    const bindContextGuard = useCallback((gl) => {
        const canvas = gl?.domElement
        if (!canvas?.addEventListener) return
        canvas.addEventListener('webglcontextlost', () => {
            setContextLost(true)
            // One automatic remount per mount; repeated losses (GPU under
            // real pressure) would otherwise remount-loop, so they wait for
            // the overlay button instead.
            if (!autoRestoreSpentRef.current) {
                autoRestoreSpentRef.current = true
                clearTimeout(timerRef.current)
                timerRef.current = setTimeout(restoreContext, 2000)
            }
        })
        canvas.addEventListener('webglcontextrestored', () => {
            clearTimeout(timerRef.current)
            setContextLost(false)
        })
    }, [restoreContext])

    useEffect(() => () => clearTimeout(timerRef.current), [])

    return { canvasKey, contextLost, bindContextGuard, restoreContext }
}

export function WebglContextLostOverlay({ onRestore }) {
    return (
        <div className="webgl-context-lost" role="alert">
            <span>3D view lost its graphics context.</span>
            <button type="button" onClick={onRestore}>Restore 3D view</button>
        </div>
    )
}

// three.js throws when the browser gives no WebGL context at all, and R3F
// rethrows it while mounting the <Canvas> — uncaught, it took the whole page
// down with a console stack and nothing on screen (owner, 2026-10-03: his
// installed di on Chromium/ANGLE-Vulkan refused 'high-performance').
// rendererWithFallback() retries once with 'default'; this boundary is for
// when that fails too: the 3D view says why, the rest of the page stays.
// Any other error is passed on to the next boundary unchanged.
export const isWebglCreationError = (error) => /WebGL/i.test(String(error?.message || error || ''))

export class WebglUnavailableBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = { error: null, attempt: 0 }
        this.retry = () => this.setState(({ attempt }) => ({ error: null, attempt: attempt + 1 }))
    }

    static getDerivedStateFromError(error) {
        return { error }
    }

    componentDidCatch(error) {
        if (isWebglCreationError(error)) console.warn(`[viewport] no 3D: ${error?.message || error}`)
    }

    render() {
        const { error, attempt } = this.state
        if (!error) return <WebglAttempt key={attempt}>{this.props.children}</WebglAttempt>
        if (!isWebglCreationError(error)) throw error
        return (
            <div className="webgl-context-lost webgl-unavailable" role="alert">
                <span>No 3D view: this browser gave no WebGL context.</span>
                <span className="webgl-unavailable-reason">{error.message}</span>
                <span className="webgl-unavailable-reason">Turn on graphics acceleration in the browser settings, or open this page in another browser.</span>
                <button type="button" onClick={this.retry}>Try again</button>
            </div>
        )
    }
}

// A keyed wrapper, so "Try again" mounts a fresh <Canvas> (a canvas that
// failed getContext keeps no context to reuse).
function WebglAttempt({ children }) {
    return children
}
