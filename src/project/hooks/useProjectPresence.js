import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { getSocketConfigForRuntime } from '../../hooks/useSpaceSocket.js'
import { generateId } from '../../shared/projectSchema.js'

const DEFAULT_DISPLAY_NAME_STORAGE_KEY = 'dii.project.displayName'
const DEFAULT_USER_ID_STORAGE_KEY = 'dii.project.userId'
const CURSOR_STALE_MS = 3000

const readStoredValue = (primaryKey, fallbackKeys = []) => {
    const keys = [primaryKey, ...fallbackKeys].filter(Boolean)
    for (const key of keys) {
        try {
            const value = window.localStorage.getItem(key)
            if (value) return value
        } catch {
            // ignore storage issues
        }
    }
    return ''
}

const persistStoredValue = (key, value) => {
    if (!key) return
    try {
        window.localStorage.setItem(key, value)
    } catch {
        // ignore storage issues
    }
}

const getOrCreateUserId = ({
    primaryKey,
    fallbackKeys = [],
    userIdPrefix = 'project-user'
} = {}) => {
    const existing = readStoredValue(primaryKey, fallbackKeys)
    if (existing) {
        persistStoredValue(primaryKey, existing)
        return existing
    }
    const next = generateId(userIdPrefix)
    persistStoredValue(primaryKey, next)
    return next
}

export function useProjectPresence({
    projectId,
    displayName,
    displayNameStorageKey = DEFAULT_DISPLAY_NAME_STORAGE_KEY,
    userIdStorageKey = DEFAULT_USER_ID_STORAGE_KEY,
    legacyDisplayNameStorageKeys = [],
    legacyUserIdStorageKeys = [],
    anonymousLabel = 'Project',
    userIdPrefix = 'project-user'
} = {}) {
    const localUserId = useMemo(() => getOrCreateUserId({
        primaryKey: userIdStorageKey,
        fallbackKeys: legacyUserIdStorageKeys,
        userIdPrefix
    }), [legacyUserIdStorageKeys, userIdPrefix, userIdStorageKey])
    const resolvedName = useMemo(() => {
        const explicit = String(displayName || '').trim()
        if (explicit) return explicit
        const stored = readStoredValue(displayNameStorageKey, legacyDisplayNameStorageKeys).trim()
        if (stored) return stored
        return `${anonymousLabel}-${localUserId.slice(-4)}`
    }, [anonymousLabel, displayName, displayNameStorageKey, localUserId, legacyDisplayNameStorageKeys])
    const socketRef = useRef(null)
    const throttleRef = useRef({ lastSentAt: 0, pending: null, timerId: null })
    const [presenceState, setPresenceState] = useState('disconnected')
    const [users, setUsers] = useState([])
    const [cursors, setCursors] = useState({})

    useEffect(() => {
        persistStoredValue(displayNameStorageKey, resolvedName)
    }, [displayNameStorageKey, resolvedName])

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
            withCredentials: true,
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
