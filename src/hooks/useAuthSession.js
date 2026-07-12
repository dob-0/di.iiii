import { useCallback, useEffect, useRef, useState } from 'react'
import { getApiSession, hasServerApi, loginApiSession, logoutApiSession } from '../services/apiClient.js'

const DEFAULT_STATE = {
    requireAuth: false,
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
        return () => {
            mountedRef.current = false
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
