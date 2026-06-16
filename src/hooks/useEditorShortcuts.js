import { useEffect, useRef } from 'react'

export function useEditorShortcuts({
    isEnabled = true,
    axisConstraint,
    setAxisConstraint,
    resetAxisLock,
    freeTransformRef,
    setIsGizmoVisible,
    setGizmoMode,
    toggleAdminMode,
    toggleInteractionMode,
    setIsPerfVisible,
    setIsUiVisible,
    setIsSelectionLocked,
    handleUndo,
    handleRedo,
    deleteSelectedObject,
    copySelectedObject,
    pasteClipboardObject,
    cutSelectedObject,
    duplicateSelectedObject,
    handleCreateSelectionGroup,
    handleUngroupSelection,
    selectAllObjects,
    handleFrameSelection
} = {}) {
    const adminChordRef = useRef(false)

    useEffect(() => {
        if (!isEnabled) return undefined

        const handleKeyToggleSelectionLock = (event) => {
            if (event.defaultPrevented) return
            if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
            const target = event.target
            const tagName = (target?.tagName || '').toLowerCase()
            const isTyping = tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target?.isContentEditable
            if (isTyping) return
            if (event.key && event.key.toLowerCase() === 'l') {
                setIsSelectionLocked?.(prev => !prev)
            }
        }
        window.addEventListener('keydown', handleKeyToggleSelectionLock)
        return () => window.removeEventListener('keydown', handleKeyToggleSelectionLock)
    }, [isEnabled, setIsSelectionLocked])

    useEffect(() => {
        if (!isEnabled) return undefined

        const handleKeyDown = (event) => {
            const targetTag = event.target?.tagName
            const isTyping = targetTag === 'INPUT' || targetTag === 'TEXTAREA' || event.target?.isContentEditable
            const metaKey = event.metaKey || event.ctrlKey
            const key = event.key?.toLowerCase?.()

            if (metaKey && key === 'z') {
                event.preventDefault()
                if (event.shiftKey) {
                    handleRedo?.()
                } else {
                    handleUndo?.()
                }
                return
            }

            if (metaKey && key === 'y') {
                event.preventDefault()
                handleRedo?.()
                return
            }

            if (!isTyping && (event.key === 'Delete' || event.key === 'Backspace')) {
                event.preventDefault()
                deleteSelectedObject?.()
                return
            }

            if (metaKey && key === 'c') {
                event.preventDefault()
                copySelectedObject?.()
                return
            }

            if (metaKey && key === 'v') {
                event.preventDefault()
                pasteClipboardObject?.()
                return
            }

            if (metaKey && key === 'x') {
                event.preventDefault()
                cutSelectedObject?.()
                return
            }

            if (metaKey && key === 'd') {
                event.preventDefault()
                duplicateSelectedObject?.()
                return
            }

            if (metaKey && key === 'g') {
                event.preventDefault()
                handleCreateSelectionGroup?.()
                return
            }

            if (event.altKey && key === 'g') {
                event.preventDefault()
                handleUngroupSelection?.()
                return
            }

            if (isTyping) {
                return
            }

            const ensureGizmoVisible = () => {
                setIsGizmoVisible?.(true)
            }

            const handleAxisSnap = (axisKey) => {
                const axis = axisKey.toUpperCase()
                if (axisConstraint === axis) {
                    resetAxisLock?.()
                    return
                }
                setAxisConstraint?.(axis)
                if (freeTransformRef?.current) {
                    freeTransformRef.current.axis = axis
                }
            }

            if (key === 'escape' || key === 'enter') {
                adminChordRef.current = false
                resetAxisLock?.()
                return
            }

            if (key === 'e' && !event.metaKey && !event.ctrlKey && !event.altKey) {
                event.preventDefault()
                toggleInteractionMode?.()
                return
            }

            if (event.shiftKey && key === 'd') {
                adminChordRef.current = true
                return
            }

            if (event.shiftKey && key === 'i' && adminChordRef.current) {
                event.preventDefault()
                adminChordRef.current = false
                toggleAdminMode?.()
                return
            }

            if (key === 'g') {
                event.preventDefault()
                ensureGizmoVisible()
                setGizmoMode?.('translate')
                if (freeTransformRef?.current) {
                    freeTransformRef.current.mode = 'translate'
                    freeTransformRef.current.axis = null
                }
                setAxisConstraint?.(null)
                return
            }

            if (key === 'r') {
                event.preventDefault()
                ensureGizmoVisible()
                setGizmoMode?.('rotate')
                if (freeTransformRef?.current) {
                    freeTransformRef.current.mode = 'rotate'
                    freeTransformRef.current.axis = null
                }
                setAxisConstraint?.(null)
                return
            }

            if (key === 's') {
                event.preventDefault()
                ensureGizmoVisible()
                setGizmoMode?.('scale')
                if (freeTransformRef?.current) {
                    freeTransformRef.current.mode = 'scale'
                    freeTransformRef.current.axis = null
                }
                setAxisConstraint?.(null)
                return
            }

            if (['x', 'y', 'z'].includes(key)) {
                event.preventDefault()
                handleAxisSnap(key)
                return
            }

            if (key === 'f') {
                event.preventDefault()
                handleFrameSelection?.()
                return
            }

            if (key === 'p') {
                setIsPerfVisible?.(prev => !prev)
            }
            if (key === 'h') {
                setIsUiVisible?.(prev => !prev)
            }
            if (key === 'a') {
                if (event.altKey) {
                    return
                }
                event.preventDefault()
                selectAllObjects?.()
            }
        }

        const handleKeyUp = (event) => {
            const key = event.key?.toLowerCase?.()
            if (key === 'd' || key === 'i' || !event.shiftKey) {
                adminChordRef.current = false
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [
        isEnabled,
        axisConstraint,
        copySelectedObject,
        cutSelectedObject,
        deleteSelectedObject,
        duplicateSelectedObject,
        freeTransformRef,
        handleCreateSelectionGroup,
        handleFrameSelection,
        handleRedo,
        handleUndo,
        handleUngroupSelection,
        pasteClipboardObject,
        resetAxisLock,
        selectAllObjects,
        setAxisConstraint,
        setGizmoMode,
        setIsGizmoVisible,
        setIsPerfVisible,
        setIsUiVisible,
        toggleAdminMode,
        toggleInteractionMode
    ])
}

export default useEditorShortcuts
