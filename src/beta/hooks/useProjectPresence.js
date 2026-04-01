import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { getSocketConfigForRuntime } from '../../hooks/useSpaceSocket.js'
import { generateId } from '../../shared/projectSchema.js'

const DISPLAY_NAME_KEY = 'dii.beta.displayName'
const USER_ID_KEY = 'dii.beta.userId'
const CURSOR_STALE_MS = 3000

const getDisplayName = () => {
    try {
        return window.localStorage.getItem(DISPLAY_NAME_KEY) || ''
    } catch {
        return ''
    }
}

const getUserId = () => {
    try {
        const existing = window.localStorage.getItem(USER_ID_KEY)
        if (existing) return existing
        const next = generateId('beta-user')
        window.localStorage.setItem(USER_ID_KEY, next)
        return next
    } catch {
        return generateId('beta-user')
    }
}

export function useProjectPresence({
    projectId,
    displayName
} = {}) {
    const localUserId = useMemo(() => getUserId(), [])
    const resolvedName = useMemo(() => {
        const explicit = String(displayName || '').trim()
        if (explicit) return explicit
        const stored = getDisplayName().trim()
        if (stored) return stored
        return `Beta-${localUserId.slice(-4)}`
    }, [displayName, localUserId])
    const socketRef = useRef(null)
    const throttleRef = useRef({ lastSentAt: 0, pending: null, timerId: null })
    const [presenceState, setPresenceState] = useState('disconnected')
    const [users, setUsers] = useState([])
    const [cursors, setCursors] = useState({})

    useEffect(() => {
        try {
            window.localStorage.setItem(DISPLAY_NAME_KEY, resolvedName)
        } catch {
            // ignore localStorage issues
        }
    }, [resolvedName])

    useEffect(() => {
        if (!projectId) return undefined
        const hasWindow = typeof window !== 'undefined'
        const { serverUrl, path, auth } = getSocketConfigForRuntime({
            configuredBase: import.meta.env.VITE_API_BASE_URL || '',
            token: import.meta.env.VITE_API_TOKEN || '',
            isDev: Boolean(import.meta.env.DEV),
            locationOrigin: hasWindow ? window.location.origin : ''
        })

        const socket = io(serverUrl, {
            path,
            auth,
            reconnection: true
        })

        socket.on('connect', () => {
            setPresenceState('connected')
            socket.emit('join-project', {
                projectId,
                userId: localUserId,
                userName: resolvedName
            })
        })

        socket.on('disconnect', () => {
            setPresenceState('disconnected')
        })

        socket.on('connect_error', () => {
            setPresenceState('degraded')
        })

        socket.on('users-in-project', (nextUsers = []) => {
            setUsers(Array.isArray(nextUsers) ? nextUsers : [])
        })

        socket.on('project-user-joined', (payload) => {
            setUsers((current) => {
                const next = new Map(current.map((entry) => [entry.socketId || entry.userId, entry]))
                next.set(payload.socketId || payload.userId, {
                    userId: payload.userId,
                    socketId: payload.socketId,
                    userName: payload.userName,
                    joinedAt: payload.timestamp
                })
                return Array.from(next.values())
            })
        })

        socket.on('project-user-left', (payload) => {
            setUsers((current) => current.filter((entry) => {
                if (payload.socketId && entry.socketId === payload.socketId) return false
                if (payload.userId && entry.userId === payload.userId) return false
                return true
            }))
            setCursors((current) => {
                const next = { ...current }
                delete next[payload.socketId || payload.userId]
                return next
            })
        })

        socket.on('project-cursor', (payload) => {
            const key = payload.socketId || payload.userId
            if (!key) return
            setCursors((current) => ({
                ...current,
                [key]: {
                    ...payload,
                    receivedAt: Date.now()
                }
            }))
        })

        socketRef.current = socket
        return () => {
            socketRef.current = null
            socket.disconnect()
        }
    }, [localUserId, projectId, resolvedName])

    useEffect(() => {
        const intervalId = window.setInterval(() => {
            setCursors((current) => {
                const now = Date.now()
                let changed = false
                const next = {}
                Object.entries(current).forEach(([key, value]) => {
                    if ((value?.receivedAt || 0) >= now - CURSOR_STALE_MS) {
                        next[key] = value
                    } else {
                        changed = true
                    }
                })
                return changed ? next : current
            })
        }, 1000)
        return () => window.clearInterval(intervalId)
    }, [])

    const flushPendingCursor = useCallback(() => {
        const state = throttleRef.current
        if (!state.pending || !socketRef.current?.connected || !projectId) return
        socketRef.current.emit('project-cursor', {
            projectId,
            userId: localUserId,
            userName: resolvedName,
            cursor: state.pending
        })
        state.lastSentAt = Date.now()
        state.pending = null
        if (state.timerId) {
            window.clearTimeout(state.timerId)
            state.timerId = null
        }
    }, [localUserId, projectId, resolvedName])

    const emitCursor = useCallback((cursor) => {
        if (!projectId || !socketRef.current?.connected) return
        const state = throttleRef.current
        state.pending = cursor
        const elapsed = Date.now() - state.lastSentAt
        if (elapsed >= 80) {
            flushPendingCursor()
            return
        }
        if (!state.timerId) {
            state.timerId = window.setTimeout(flushPendingCursor, 80 - elapsed)
        }
    }, [flushPendingCursor, projectId])

    const clearCursor = useCallback(() => {
        const state = throttleRef.current
        state.pending = null
        if (state.timerId) {
            window.clearTimeout(state.timerId)
            state.timerId = null
        }
    }, [])

    return {
        displayName: resolvedName,
        localUserId,
        presenceState,
        users,
        cursors,
        emitCursor,
        clearCursor
    }
}
