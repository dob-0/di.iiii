import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { getSocketConfigForRuntime } from '../../hooks/useSpaceSocket.js'
import { generateId } from '../../shared/projectSchema.js'

const DEFAULT_DISPLAY_NAME_STORAGE_KEY = 'dii.project.displayName'
const DEFAULT_USER_ID_STORAGE_KEY = 'dii.project.userId'
const CURSOR_STALE_MS = 3000
const MAX_CHAT_MESSAGES = 200

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

// Module-level constants, not inline [] defaults: a fresh array literal per
// call defeated the useMemo deps below, re-running getOrCreateUserId — which
// WRITES localStorage — on every single render of every consumer.
const NO_LEGACY_KEYS = Object.freeze([])

export function useProjectPresence({
    projectId,
    // Opt-in, and only meaningful for a project that lives on a server. Pass it
    // and this same socket also joins `space-<id>` and carries the space-wide
    // chat — the one every project in the space shares. Left empty, nothing
    // about this hook changes.
    spaceId = '',
    displayName,
    displayNameStorageKey = DEFAULT_DISPLAY_NAME_STORAGE_KEY,
    userIdStorageKey = DEFAULT_USER_ID_STORAGE_KEY,
    legacyDisplayNameStorageKeys = NO_LEGACY_KEYS,
    legacyUserIdStorageKeys = NO_LEGACY_KEYS,
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
    const [messages, setMessages] = useState([])
    const [spaceMessages, setSpaceMessages] = useState([])
    const [canModerateSpaceChat, setCanModerateSpaceChat] = useState(false)

    useEffect(() => {
        persistStoredValue(displayNameStorageKey, resolvedName)
    }, [displayNameStorageKey, resolvedName])

    useEffect(() => {
        if (!projectId) return undefined
        setMessages([])
        setSpaceMessages([])
        setCanModerateSpaceChat(false)
        const hasWindow = typeof window !== 'undefined'
        const { serverUrl, path, auth } = getSocketConfigForRuntime({
            configuredBase: import.meta.env.VITE_API_BASE_URL || '',
            token: '',
            isDev: Boolean(import.meta.env.DEV),
            locationOrigin: hasWindow ? window.location.origin : ''
        })

        const socket = io(serverUrl, {
            path,
            auth,
            reconnection: true,
            // Cap the retry cadence against a server that is simply off (a
            // local install after `di down`): socket.io's default backoff
            // tops out at 5s forever. 15s matches apiClient's
            // SERVER_UNAVAILABLE_COOLDOWN_MS and useSpaceSocket's idiom.
            reconnectionDelayMax: 15000
        })

        socket.on('connect', () => {
            setPresenceState('connected')
            socket.emit('join-project', {
                projectId,
                userId: localUserId,
                userName: resolvedName
            })
            if (spaceId) {
                // `chat: true` asks the server for the stored transcript; the
                // scene-collaboration client joins the same room without it.
                socket.emit('join-space', {
                    spaceId,
                    userId: localUserId,
                    userName: resolvedName,
                    chat: true
                })
            }
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

        socket.on('project-chat-message', (payload) => {
            setMessages((current) => [...current, { ...payload, receivedAt: Date.now() }].slice(-MAX_CHAT_MESSAGES))
        })

        // Replay on join — the whole reason space chat is stored. Replaces
        // rather than merges: this IS the room's history, and a reconnect must
        // not stack a second copy of every line onto the first.
        socket.on('space-chat-history', (payload) => {
            const incoming = Array.isArray(payload?.messages) ? payload.messages : []
            const now = Date.now()
            setSpaceMessages(incoming.map((message) => ({
                ...message,
                receivedAt: now,
                self: message.userId === localUserId
            })).slice(-MAX_CHAT_MESSAGES))
            setCanModerateSpaceChat(Boolean(payload?.canModerate))
        })

        socket.on('space-chat-message', (payload) => {
            setSpaceMessages((current) => {
                // The sender already holds an optimistic copy under the same id
                // (the client mints it, see sendSpaceChatMessage) — a replay or
                // a self-echo must not double it.
                if (payload?.id && current.some((message) => message.id === payload.id)) return current
                return [...current, { ...payload, receivedAt: Date.now() }].slice(-MAX_CHAT_MESSAGES)
            })
        })

        socket.on('space-chat-removed', (payload) => {
            if (!payload?.id) return
            setSpaceMessages((current) => current.filter((message) => message.id !== payload.id))
        })

        socketRef.current = socket
        return () => {
            socketRef.current = null
            socket.disconnect()
        }
    }, [localUserId, projectId, resolvedName, spaceId])

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

    const sendChatMessage = useCallback((text) => {
        const trimmed = String(text || '').trim()
        if (!trimmed || !projectId || !socketRef.current?.connected) return
        socketRef.current.emit('project-chat-message', {
            projectId,
            userId: localUserId,
            userName: resolvedName,
            text: trimmed
        })
        setMessages((current) => [...current, {
            id: generateId('chat-msg'),
            userId: localUserId,
            userName: resolvedName,
            text: trimmed,
            timestamp: Date.now(),
            receivedAt: Date.now(),
            self: true
        }].slice(-MAX_CHAT_MESSAGES))
    }, [localUserId, projectId, resolvedName])

    const sendSpaceChatMessage = useCallback((text) => {
        const trimmed = String(text || '').trim()
        if (!trimmed || !spaceId || !socketRef.current?.connected) return
        // The id is minted here, not on the server, so the optimistic copy and
        // the stored row are one message — an admin's removal then reaches the
        // author's own screen too.
        const id = generateId('space-chat')
        socketRef.current.emit('space-chat-message', {
            spaceId,
            id,
            userId: localUserId,
            userName: resolvedName,
            text: trimmed
        })
        setSpaceMessages((current) => [...current, {
            id,
            userId: localUserId,
            userName: resolvedName,
            text: trimmed,
            timestamp: Date.now(),
            receivedAt: Date.now(),
            self: true
        }].slice(-MAX_CHAT_MESSAGES))
    }, [localUserId, resolvedName, spaceId])

    const removeSpaceChatMessage = useCallback((id) => {
        if (!id || !spaceId || !socketRef.current?.connected) return
        // No optimistic removal: the server is the one that decides whether
        // this session is allowed to erase somebody else's words, and the
        // `space-chat-removed` broadcast comes back to us like everyone else.
        socketRef.current.emit('space-chat-remove', { spaceId, id })
    }, [spaceId])

    return {
        displayName: resolvedName,
        localUserId,
        presenceState,
        users,
        cursors,
        emitCursor,
        clearCursor,
        messages,
        sendChatMessage,
        spaceMessages,
        sendSpaceChatMessage,
        canModerateSpaceChat,
        removeSpaceChatMessage
    }
}
