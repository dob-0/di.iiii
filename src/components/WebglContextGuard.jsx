import { useCallback, useEffect, useRef, useState } from 'react'
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
