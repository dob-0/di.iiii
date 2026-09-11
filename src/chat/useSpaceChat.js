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
const REPLY_QUOTE_MAX = 160
const TYPING_SEND_INTERVAL_MS = 2000
// How long a typing signal is believed. Longer than the send interval, so a
// steady typist never flickers; short enough that somebody who walked away
// stops being announced.
const TYPING_TTL_MS = 5000

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

export default function useSpaceChat({ spaceId, displayName = '', channel = 'room' } = {}) {
    const localUserId = useMemo(() => getOrCreateUserId(), [])
    // The signed-in label wins. A room where everyone is Guest-C1B3 is not a
    // room anybody can talk in, and the session already knows who this is.
    const resolvedName = useMemo(() => {
        const explicit = String(displayName || '').trim()
        if (explicit) return explicit
        const stored = readStored(DISPLAY_NAME_STORAGE_KEY).trim()
        if (stored) return stored
        return `Guest-${localUserId.slice(-4)}`
    }, [displayName, localUserId])

    const socketRef = useRef(null)
    const lastTypingSentRef = useRef(0)
    const [connection, setConnection] = useState('connecting')
    const [messages, setMessages] = useState([])
    const [people, setPeople] = useState([])
    const [canModerate, setCanModerate] = useState(false)
    // Whether the SERVER has said yet. `canModerate` starts false because it
    // has to start somewhere, and "not yet asked" is indistinguishable from
    // "no" unless it is tracked separately — a distinction that cost the staff
    // room its whole point on the first two-browser run: the surface demoted an
    // admin back to the open room before the answer arrived, and a line meant
    // for staff was written where everybody could read it.
    const [moderationKnown, setModerationKnown] = useState(false)
    const [canPin, setCanPin] = useState(false)
    const [pinned, setPinned] = useState(null)
    // Who is mid-sentence, and when we last heard so. A typing signal has no
    // "stopped" event on purpose — the sender may close the tab mid-word — so
    // it expires on a clock here instead of waiting for a message that may
    // never come.
    const [typingAt, setTypingAt] = useState({})
    const [cleared, setCleared] = useState('')
    const [forbidden, setForbidden] = useState('')

    useEffect(() => {
        persistStored(DISPLAY_NAME_STORAGE_KEY, resolvedName)
    }, [resolvedName])

    useEffect(() => {
        if (!spaceId) return undefined
        setMessages([])
        setPeople([])
        setCanModerate(false)
        setModerationKnown(false)
        setCanPin(false)
        setPinned(null)
        setTypingAt({})
        setCleared('')
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
                chat: true,
                channel
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
            setModerationKnown(true)
            setCanPin(Boolean(payload?.canPin))
            setPinned(payload?.pinned || null)
        })

        socket.on('space-chat-pinned', (payload) => {
            setPinned(payload?.pinned || null)
        })

        socket.on('space-chat-typing', (payload) => {
            if (!payload?.userId || payload.userId === localUserId) return
            setTypingAt((current) => ({
                ...current,
                [payload.userId]: { name: payload.userName || 'Someone', at: Date.now() }
            }))
        })

        socket.on('space-chat-message', (payload) => {
            setMessages((current) => {
                if (payload?.id && current.some((message) => message.id === payload.id)) return current
                return [...current, { ...payload, receivedAt: Date.now() }].slice(-MAX_CHAT_MESSAGES)
            })
        })

        socket.on('space-chat-cleared', (payload) => {
            setMessages([])
            setPinned(null)
            setCleared(payload?.by ? `${payload.by} emptied this room` : 'this room was emptied')
        })

        socket.on('space-chat-removed', (payload) => {
            if (!payload?.id) return
            setMessages((current) => current.filter((message) => message.id !== payload.id))
            // A removed line takes the pin with it — the server already dropped
            // the row, and a bar quoting a message nobody can find is worse than
            // no bar.
            setPinned((current) => (current?.message?.id === payload.id ? null : current))
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
        // A refusal is also an answer: it is the server saying no to this
        // channel, and the surface must be free to act on it rather than wait
        // for a history that will never come.
        socket.on('space-chat-forbidden', (payload) => {
            setModerationKnown(true)
            setForbidden(payload?.message || 'Only an admin can remove messages.')
        })

        socketRef.current = socket
        return () => {
            socketRef.current = null
            socket.disconnect()
        }
    }, [localUserId, resolvedName, spaceId, channel])

    // Emptying the room. Admin only on the server; the interface asks for the
    // space's name to be typed first, so it cannot happen by tapping a menu.
    const clear = useCallback(() => {
        if (!spaceId || !socketRef.current?.connected) return
        socketRef.current.emit('space-chat-clear', { spaceId, channel })
    }, [spaceId, channel])

    const send = useCallback((text, replyTo = null) => {
        const trimmed = String(text || '').trim()
        if (!trimmed || !spaceId || !socketRef.current?.connected) return
        const id = generateId('space-chat')
        const quoted = replyTo?.id
            ? { id: replyTo.id, userName: replyTo.userName || '', text: String(replyTo.text || '').slice(0, REPLY_QUOTE_MAX) }
            : null
        socketRef.current.emit('space-chat-message', {
            spaceId,
            channel,
            id,
            userId: localUserId,
            userName: resolvedName,
            text: trimmed,
            ...(quoted ? { replyTo: quoted } : {})
        })
        setMessages((current) => [...current, {
            id,
            userId: localUserId,
            userName: resolvedName,
            text: trimmed,
            ...(quoted ? { replyTo: quoted } : {}),
            timestamp: Date.now(),
            receivedAt: Date.now(),
            self: true
        }].slice(-MAX_CHAT_MESSAGES))
    }, [localUserId, resolvedName, spaceId, channel])

    const pin = useCallback((id) => {
        if (!id || !spaceId || !socketRef.current?.connected) return
        socketRef.current.emit('space-chat-pin', { spaceId, channel, id })
    }, [spaceId, channel])

    const unpin = useCallback(() => {
        if (!spaceId || !socketRef.current?.connected) return
        socketRef.current.emit('space-chat-unpin', { spaceId, channel })
    }, [spaceId, channel])

    // Called on every keystroke; the throttle is here so the socket is not, and
    // the server throttles again because a client is not to be trusted with it.
    const notifyTyping = useCallback(() => {
        if (!spaceId || !socketRef.current?.connected) return
        const now = Date.now()
        if (now - lastTypingSentRef.current < TYPING_SEND_INTERVAL_MS) return
        lastTypingSentRef.current = now
        socketRef.current.emit('space-chat-typing', { spaceId, channel })
    }, [spaceId, channel])

    // Expiry is a SWEEP rather than a filter at read time: one interval for the
    // whole room, running only while somebody is actually typing, and the list
    // stays something the render can read without asking what time it is.
    useEffect(() => {
        if (!Object.keys(typingAt).length) return undefined
        const timer = setInterval(() => {
            const now = Date.now()
            setTypingAt((current) => {
                const kept = Object.fromEntries(
                    Object.entries(current).filter(([, entry]) => now - entry.at < TYPING_TTL_MS)
                )
                return Object.keys(kept).length === Object.keys(current).length ? current : kept
            })
        }, 1000)
        return () => clearInterval(timer)
    }, [typingAt])

    const typingNames = useMemo(() => Object.values(typingAt).map((entry) => entry.name), [typingAt])

    const remove = useCallback((id) => {
        if (!id || !spaceId || !socketRef.current?.connected) return
        socketRef.current.emit('space-chat-remove', { spaceId, channel, id })
    }, [spaceId, channel])

    return {
        connection,
        messages,
        people,
        canModerate,
        moderationKnown,
        canPin,
        pinned,
        cleared,
        typingNames,
        forbidden,
        send,
        remove,
        clear,
        pin,
        unpin,
        notifyTyping,
        displayName: resolvedName,
        localUserId
    }
}
