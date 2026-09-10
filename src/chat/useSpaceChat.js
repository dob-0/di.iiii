import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { getSocketConfigForRuntime } from '../hooks/useSpaceSocket.js'
import { generateId } from '../shared/projectSchema.js'

// The space room WITHOUT a project. useProjectPresence carries space chat too,
// but it refuses to connect without a projectId (`if (!projectId) return`) —
// it is a project's hook that grew a second room. A standalone chat surface
// has no project and never will, so it joins `space-<id>` on its own rather
// than inventing a project to hold a socket open.
//
// The wire is identical to useProjectPresence's space half — same events, same
// minted-id rule, same 200-line window — so a message typed here and one typed
// in Raw's chat panel are the same message in the same room.

const DISPLAY_NAME_STORAGE_KEY = 'dii.chat.displayName'
const USER_ID_STORAGE_KEY = 'dii.chat.userId'
const MAX_CHAT_MESSAGES = 200

const readStored = (key) => {
    try {
        return window.localStorage.getItem(key) || ''
    } catch {
        return ''
    }
}

const persistStored = (key, value) => {
    try {
        if (value) window.localStorage.setItem(key, value)
    } catch {
        // a browser with storage blocked still gets a working room, just an
        // anonymous one that forgets its name on reload
    }
}

const getOrCreateUserId = () => {
    const existing = readStored(USER_ID_STORAGE_KEY)
    if (existing) return existing
    const next = generateId('chat-user')
    persistStored(USER_ID_STORAGE_KEY, next)
    return next
}

export default function useSpaceChat({ spaceId, displayName = '' } = {}) {
    const localUserId = useMemo(() => getOrCreateUserId(), [])
    // The signed-in label wins. A studio chat where everyone is Guest-C1B3 is
    // not a studio chat, and the session already knows who this is.
    const resolvedName = useMemo(() => {
        const explicit = String(displayName || '').trim()
        if (explicit) return explicit
        const stored = readStored(DISPLAY_NAME_STORAGE_KEY).trim()
        if (stored) return stored
        return `Guest-${localUserId.slice(-4)}`
    }, [displayName, localUserId])

    const socketRef = useRef(null)
    const [connection, setConnection] = useState('connecting')
    const [messages, setMessages] = useState([])
    const [people, setPeople] = useState([])
    const [canModerate, setCanModerate] = useState(false)
    const [forbidden, setForbidden] = useState('')

    useEffect(() => {
        persistStored(DISPLAY_NAME_STORAGE_KEY, resolvedName)
    }, [resolvedName])

    useEffect(() => {
        if (!spaceId) return undefined
        setMessages([])
        setPeople([])
        setCanModerate(false)
        setForbidden('')

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
            reconnectionDelayMax: 15000
        })

        socket.on('connect', () => {
            setConnection('connected')
            socket.emit('join-space', {
                spaceId,
                userId: localUserId,
                userName: resolvedName,
                chat: true
            })
        })

        socket.on('disconnect', () => setConnection('disconnected'))
        socket.on('connect_error', () => setConnection('disconnected'))

        socket.on('space-chat-history', (payload) => {
            const incoming = Array.isArray(payload?.messages) ? payload.messages : []
            const now = Date.now()
            setMessages(incoming.map((message) => ({
                ...message,
                receivedAt: now,
                self: message.userId === localUserId
            })).slice(-MAX_CHAT_MESSAGES))
            setCanModerate(Boolean(payload?.canModerate))
        })

        socket.on('space-chat-message', (payload) => {
            setMessages((current) => {
                if (payload?.id && current.some((message) => message.id === payload.id)) return current
                return [...current, { ...payload, receivedAt: Date.now() }].slice(-MAX_CHAT_MESSAGES)
            })
        })

        socket.on('space-chat-removed', (payload) => {
            if (!payload?.id) return
            setMessages((current) => current.filter((message) => message.id !== payload.id))
        })

        // The server sends the roster as a bare array on `users-in-space`, and
        // names the two deltas without a `space-` prefix — they are the space
        // room's events even though the words do not say so.
        socket.on('users-in-space', (payload) => {
            setPeople(Array.isArray(payload) ? payload : [])
        })

        socket.on('user-joined', (payload) => {
            if (!payload?.socketId) return
            setPeople((current) => (
                current.some((entry) => entry.socketId === payload.socketId)
                    ? current
                    : [...current, payload]
            ))
        })

        socket.on('user-left', (payload) => {
            setPeople((current) => current.filter((entry) => {
                if (payload?.socketId && entry.socketId === payload.socketId) return false
                if (payload?.userId && entry.userId === payload.userId) return false
                return true
            }))
        })

        // A private space answers a stranger with a refusal, not an empty room.
        // Say so rather than render a chat that silently swallows every line.
        socket.on('space-forbidden', (payload) => {
            setForbidden(payload?.message || 'This room is not open to you.')
        })
        socket.on('space-chat-forbidden', (payload) => {
            setForbidden(payload?.message || 'Only an admin can remove messages.')
        })

        socketRef.current = socket
        return () => {
            socketRef.current = null
            socket.disconnect()
        }
    }, [localUserId, resolvedName, spaceId])

    const send = useCallback((text) => {
        const trimmed = String(text || '').trim()
        if (!trimmed || !spaceId || !socketRef.current?.connected) return
        const id = generateId('space-chat')
        socketRef.current.emit('space-chat-message', {
            spaceId,
            id,
            userId: localUserId,
            userName: resolvedName,
            text: trimmed
        })
        setMessages((current) => [...current, {
            id,
            userId: localUserId,
            userName: resolvedName,
            text: trimmed,
            timestamp: Date.now(),
            receivedAt: Date.now(),
            self: true
        }].slice(-MAX_CHAT_MESSAGES))
    }, [localUserId, resolvedName, spaceId])

    const remove = useCallback((id) => {
        if (!id || !spaceId || !socketRef.current?.connected) return
        socketRef.current.emit('space-chat-remove', { spaceId, id })
    }, [spaceId])

    return { connection, messages, people, canModerate, forbidden, send, remove, displayName: resolvedName, localUserId }
}
