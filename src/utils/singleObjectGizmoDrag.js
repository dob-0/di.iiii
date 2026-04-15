export function createSingleObjectGizmoDragController({
    persistTransform,
    setPointerDragging,
    setOrbitControlsEnabled,
    resetAxisLock,
    addWindowListener = (type, handler) => window.addEventListener(type, handler),
    removeWindowListener = (type, handler) => window.removeEventListener(type, handler)
} = {}) {
    let isDragging = false
    const failSafeHandlers = new Map()

    const syncDraggingState = (nextDragging) => {
        setPointerDragging?.(nextDragging)
        setOrbitControlsEnabled?.(!nextDragging)
    }

    const clearFailSafe = () => {
        failSafeHandlers.forEach((handler, type) => {
            removeWindowListener(type, handler)
        })
        failSafeHandlers.clear()
    }

    const finalizeDrag = ({ persistFinalTransform = true } = {}) => {
        const hadActiveDrag = isDragging
        clearFailSafe()
        isDragging = false
        syncDraggingState(false)
        if (hadActiveDrag && persistFinalTransform) {
            persistTransform?.()
        }
        if (hadActiveDrag) {
            resetAxisLock?.()
        }
    }

    const installFailSafe = () => {
        if (failSafeHandlers.size > 0) return
        const forceCleanup = () => {
            finalizeDrag({ persistFinalTransform: true })
        }
        ;['pointerup', 'pointercancel', 'blur'].forEach((type) => {
            failSafeHandlers.set(type, forceCleanup)
            addWindowListener(type, forceCleanup)
        })
    }

    const beginDrag = () => {
        if (isDragging) return
        isDragging = true
        syncDraggingState(true)
        installFailSafe()
    }

    const handleChange = () => {
        if (!isDragging) return
        persistTransform?.()
    }

    const handleDraggingChanged = (event) => {
        const dragging = typeof event === 'boolean'
            ? event
            : typeof event?.value === 'boolean'
                ? event.value
                : false
        if (dragging === isDragging) return
        if (dragging) {
            beginDrag()
            return
        }
        finalizeDrag({ persistFinalTransform: true })
    }

    const dispose = () => {
        finalizeDrag({ persistFinalTransform: isDragging })
    }

    return {
        beginDrag,
        handleChange,
        handleDraggingChanged,
        finalizeDrag,
        dispose,
        getIsDragging: () => isDragging
    }
}

export default createSingleObjectGizmoDragController
