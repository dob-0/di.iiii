import { useCallback, useRef } from 'react'
import useAuthSession from './useAuthSession.js'

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

    // Admin mode unlocks editing on a read-only space (canEditScene is
    // `!isReadOnly || isAdminMode`) and shows the admin buttons. Both ways in
    // -- the Shift+D Shift+I chord (useEditorShortcuts) and the 4-finger hold
    // (useSceneActions) -- call this, and any public space with nothing
    // published opens this editor for a stranger. So turning it ON needs a
    // signed-in admin session, the same role the admin console gates on
    // (PreferencesPage). The server reports role 'admin' for the owner at a
    // local install and when auth is disabled, so those keep the chord.
    // Turning it OFF never needs anything.
    const { authenticated, role } = useAuthSession()
    const isAdminSession = Boolean(authenticated && role === 'admin')

    const toggleAdminMode = useCallback(() => {
        setIsAdminMode?.((prev) => {
            const next = !prev
            if (next && !isAdminSession) {
                return prev
            }
            if (!next) {
                setIsGizmoVisible?.(false)
            }
            return next
        })
    }, [isAdminSession, setIsAdminMode, setIsGizmoVisible])

    return {
        guardEditAction,
        toggleAdminMode
    }
}

export default useGuardedEditActions
