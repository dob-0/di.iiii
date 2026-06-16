import { useCallback, useRef } from 'react'

export function useGuardedEditActions({
    canEditScene = true,
    isReadOnly = false,
    setIsAdminMode,
    setIsGizmoVisible
} = {}) {
    const readOnlyAlertRef = useRef(0)

    const notifyReadOnly = useCallback(() => {
        if (!isReadOnly) return
        const now = Date.now()
        if (now - readOnlyAlertRef.current < 1500) return
        readOnlyAlertRef.current = now
        alert('This space is read-only. Ask an admin to enable editing.')
    }, [isReadOnly])

    const guardEditAction = useCallback(
        (fn) => {
            return (...args) => {
                if (canEditScene) {
                    return fn?.(...args)
                }
                notifyReadOnly()
                return undefined
            }
        },
        [canEditScene, notifyReadOnly]
    )

    const toggleAdminMode = useCallback(() => {
        setIsAdminMode?.((prev) => {
            const next = !prev
            if (!next) {
                setIsGizmoVisible?.(false)
            }
            return next
        })
    }, [setIsAdminMode, setIsGizmoVisible])

    return {
        guardEditAction,
        toggleAdminMode
    }
}

export default useGuardedEditActions
