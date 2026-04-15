import { useCallback, useEffect, useRef, useState } from 'react'

export function usePanelResize(initialWidth = 260, options = {}) {
    const {
        min = 240,
        max = 520,
        minHeight = 200,
        maxHeight = 800,
        initialHeight = null
    } = options

    const [width, setWidth] = useState(initialWidth)
    const [height, setHeight] = useState(initialHeight)
    const resizeStateRef = useRef(null)
    const [isResizing, setIsResizing] = useState(false)
    const lastInitialHeightRef = useRef(initialHeight)

    const clamp = (value, minValue, maxValue) => Math.max(minValue, Math.min(maxValue, value))

    const handlePointerMove = useCallback((event) => {
        const state = resizeStateRef.current
        if (!state) return
        const deltaX = event.clientX - state.startX
        const deltaY = event.clientY - state.startY
        setWidth(clamp(state.startWidth + deltaX, min, max))
        if (state.startHeight != null) {
            setHeight(clamp(state.startHeight + deltaY, minHeight, maxHeight))
        }
    }, [max, min, maxHeight, minHeight])

    const endResize = useCallback(() => {
        resizeStateRef.current = null
        setIsResizing(false)
    }, [])

    const handlePointerDown = useCallback((event) => {
        event.preventDefault()
        const rect = event.currentTarget?.parentElement?.getBoundingClientRect?.()
        resizeStateRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            startWidth: width,
            startHeight: rect?.height ?? height
        }
        if (height == null && rect?.height) {
            setHeight(rect.height)
        }
        setIsResizing(true)
    }, [height, width])

    const handleResetHeight = useCallback(() => {
        // reset back to the initial height (or auto if null)
        setHeight(lastInitialHeightRef.current)
    }, [])

    useEffect(() => {
        if (!isResizing) return
        const handleUp = () => endResize()
        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup', handleUp)
        window.addEventListener('pointercancel', handleUp)
        window.addEventListener('pointerleave', handleUp)
        return () => {
            window.removeEventListener('pointermove', handlePointerMove)
            window.removeEventListener('pointerup', handleUp)
            window.removeEventListener('pointercancel', handleUp)
            window.removeEventListener('pointerleave', handleUp)
        }
    }, [endResize, handlePointerMove, isResizing])

    const resizerProps = {
        onPointerDown: handlePointerDown,
        onDoubleClick: handleResetHeight
    }

    return { width, height, resizerProps, isResizing }
}
