import { useEffect, useRef, useState, useCallback } from 'react'

let globalZIndex = 1000

export function usePanelDrag(initialPosition = { x: 0, y: 0 }, options = {}) {
    const { baseZ = 100 } = options
    const panelRef = useRef(null)
    const dragStateRef = useRef(null)
    const [offset, setOffset] = useState(initialPosition)
    const [isDragging, setIsDragging] = useState(false)
    const [zIndex, setZIndex] = useState(baseZ)

    useEffect(() => {
        const el = panelRef.current
        if (!el) return
        el.style.transform = `translate(${offset.x}px, ${offset.y}px)`
    }, [offset])

    const clampToViewport = (x, y) => {
        const el = panelRef.current
        const vw = typeof window !== 'undefined' ? window.innerWidth : 0
        const vh = typeof window !== 'undefined' ? window.innerHeight : 0
        const rect = el?.getBoundingClientRect()
        const width = rect?.width || 0
        const height = rect?.height || 0
        const padding = 8
        const maxX = Math.max(padding, vw - width - padding)
        const maxY = Math.max(padding, vh - height - padding)
        return {
            x: Math.min(Math.max(x, padding), maxX),
            y: Math.min(Math.max(y, padding), maxY)
        }
    }

    const handlePointerMove = useCallback((event) => {
        const state = dragStateRef.current
        if (!state) return
        const dx = event.clientX - state.startX
        const dy = event.clientY - state.startY
        const next = clampToViewport(state.originX + dx, state.originY + dy)
        setOffset(next)
    }, [])

    const endDrag = useCallback(() => {
        dragStateRef.current = null
        setIsDragging(false)
    }, [])

    const bringToFront = useCallback(() => {
        const next = ++globalZIndex
        setZIndex(next)
    }, [])

    const handlePointerDown = useCallback((event) => {
        event.preventDefault()
        bringToFront()
        dragStateRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            originX: offset.x,
            originY: offset.y
        }
        setIsDragging(true)
    }, [bringToFront, offset])

    useEffect(() => {
        if (!isDragging) return
        const handleUp = () => endDrag()
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
    }, [endDrag, handlePointerMove, isDragging])

    const dragProps = {
        onPointerDown: handlePointerDown
    }

    return {
        panelRef,
        dragProps,
        panelPointerProps: { onPointerDownCapture: bringToFront },
        dragStyle: { position: 'fixed', top: 0, left: 0, transform: `translate(${offset.x}px, ${offset.y}px)`, zIndex },
        isDragging
    }
}
