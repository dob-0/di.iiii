import { useCallback, useEffect, useState } from 'react'
import { getApiSession, hasServerApi, loginApiSession, logoutApiSession } from '../services/apiClient.js'

const DEFAULT_STATE = {
    requireAuth: false,
    authenticated: false,
    type: null,
    role: null,
    subject: null,
    label: null,
    spaces: null,
    expiresAt: null
}

export default function useAuthSession() {
    const [state, setState] = useState(DEFAULT_STATE)
    const [loading, setLoading] = useState(hasServerApi)
    const [error, setError] = useState(null)

    const refresh = useCallback(async () => {
        if (!hasServerApi) {
            setLoading(false)
            return
        }
        try {
            const data = await getApiSession()
            setState({ ...DEFAULT_STATE, ...data })
            setError(null)
        } catch (err) {
            setError(err?.message || 'Failed to reach server')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        refresh()
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
