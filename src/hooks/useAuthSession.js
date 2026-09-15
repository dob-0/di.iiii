import { useCallback, useEffect, useRef, useState } from 'react'
import { getApiSession, hasServerApi, loginApiSession, logoutApiSession } from '../services/apiClient.js'
import { rememberGuestSandbox } from '../utils/carriedSandbox.js'

// Every component holds its own copy of the session, fetched when it mounts.
// A write that changes this session's scope (opening a file, making a space)
// re-issues the cookie on the server, but a gate that mounted before it kept
// the old list: open a file on /spaces, click its card, and the gate — same
// instance, new address — said "Access restricted" about the space just made.
// Whoever makes such a write announces it; every mounted copy asks again.
const SESSION_CHANGED_EVENT = 'dii:auth-session-changed'

export const announceSessionChanged = () => {
    try { window.dispatchEvent(new Event(SESSION_CHANGED_EVENT)) } catch { /* no window — nothing mounted to tell */ }
}

const DEFAULT_STATE = {
    requireAuth: false,
    // True when this server is a `di up` install on the visitor's own machine
    // (server reads DI_LOCAL). Hosted-product copy must not render over it.
    local: false,
    authenticated: false,
    type: null,
    role: null,
    subject: null,
    label: null,
    spaces: null,
    openSpaceId: null,
    sandboxSpaceId: null,
    expiresAt: null,
    spaceLimit: null,
    ownedSpaceCount: 0,
    canCreateSpace: false
}

export default function useAuthSession() {
    const [state, setState] = useState(DEFAULT_STATE)
    const [loading, setLoading] = useState(hasServerApi)
    const [error, setError] = useState(null)
    // A refresh can outlive the component (unmount mid-fetch) — abort it and
    // drop its state updates, or React trips on setState after teardown.
    const mountedRef = useRef(true)
    const abortRef = useRef(null)

    const refresh = useCallback(async () => {
        if (!hasServerApi) {
            if (mountedRef.current) setLoading(false)
            return
        }
        const controller = new AbortController()
        abortRef.current = controller
        const tid = setTimeout(() => controller.abort(), 8000)
        try {
            const data = await getApiSession({ signal: controller.signal })
            // Remembered even if this component has gone: the sandbox id a guest
            // held is what finds their work again after they sign in.
            rememberGuestSandbox(data)
            if (!mountedRef.current) return
            setState({ ...DEFAULT_STATE, ...data })
            setError(null)
        } catch (err) {
            if (!mountedRef.current) return
            setState(DEFAULT_STATE)
            setError(err?.message || 'Failed to reach server')
        } finally {
            clearTimeout(tid)
            if (mountedRef.current) setLoading(false)
        }
    }, [])

    useEffect(() => {
        mountedRef.current = true
        refresh()
        window.addEventListener(SESSION_CHANGED_EVENT, refresh)
        return () => {
            mountedRef.current = false
            window.removeEventListener(SESSION_CHANGED_EVENT, refresh)
            abortRef.current?.abort()
        }
    }, [refresh])

    const login = useCallback(async (token) => {
        const data = await loginApiSession(token)
        setState(data)
        return data
    }, [])

    const logout = useCallback(async () => {
        await logoutApiSession()
        await refresh()
    }, [refresh])

    return { ...state, loading, error, login, logout, refresh }
}
