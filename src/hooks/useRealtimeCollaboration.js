import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSpaceSocket } from './useSpaceSocket.js'

const DISPLAY_NAME_STORAGE_KEY = 'dii-collaboration-display-name'
const CURSOR_STALE_MS = 3000
const CURSOR_THROTTLE_MS = 90

const readStoredDisplayName = () => {
    if (typeof window === 'undefined') return ''
    try {
        return String(window.localStorage.getItem(DISPLAY_NAME_STORAGE_KEY) || '')
    } catch {
        return ''
    }
}

const clamp01 = (value) => Math.max(0, Math.min(1, value))

const normalizeDisplayName = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 40)

const normalizeCursorPayload = (cursor) => {
    const x = Number(cursor?.x)
    const y = Number(cursor?.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null
    return {
        x: clamp01(x),
        y: clamp01(y)
    }
}

const formatFreshnessLabel = (ageMs) => {
    if (!Number.isFinite(ageMs)) return 'No cursor yet'
    if (ageMs < 1500) return 'Cursor active now'
    if (ageMs < 10000) return `Cursor ${Math.round(ageMs / 1000)}s ago`
    return 'Cursor idle'
}

export function useRealtimeCollaboration({
    canAccessServerSpaces = false,
    spaceId = null,
    liveClientId = '',
    displayName: initialDisplayName = '',
    enableSceneEditEvents = false
} = {}) {
    const [displayName, setDisplayNameState] = useState(() => {
        const stored = normalizeDisplayName(readStoredDisplayName())
        return stored || normalizeDisplayName(initialDisplayName)
    })
    const [remoteCursorMap, setRemoteCursorMap] = useState({})
    const cursorTimerRef = useRef(null)
    const queuedCursorRef = useRef(null)
    const lastCursorSentAtRef = useRef(0)
    const [cursorNow, setCursorNow] = useState(() => Date.now())

    const effectiveDisplayName = useMemo(() => {
        const stored = normalizeDisplayName(displayName)
        return stored || `User-${liveClientId.slice(0, 8)}`
    }, [displayName, liveClientId])

    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            const next = normalizeDisplayName(displayName)
            if (next) {
                window.localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, next)
            } else {
                window.localStorage.removeItem(DISPLAY_NAME_STORAGE_KEY)
            }
        } catch {
            // ignore storage errors
        }
    }, [displayName])

    const setDisplayName = useCallback((nextValue) => {
        setDisplayNameState((previous) => {
            const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue
            return normalizeDisplayName(resolved)
        })
    }, [])

    const {
        isConnected: isSocketConnected,
        usersInSpace,
        emit: socketEmit,
        on: socketOn
    } = useSpaceSocket(
        canAccessServerSpaces ? spaceId : null,
        liveClientId,
        effectiveDisplayName
    )

    useEffect(() => {
        if (!canAccessServerSpaces || !spaceId) {
            setRemoteCursorMap({})
            return
        }
        const detach = socketOn?.userCursor?.((event) => {
            const cursor = normalizeCursorPayload(event?.cursor)
            if (!cursor) return
            const cursorKey = event?.socketId || event?.userId
            if (!cursorKey) return
            setRemoteCursorMap((previous) => ({
                ...previous,
                [cursorKey]: {
                    x: cursor.x,
                    y: cursor.y,
                    updatedAt: Number(event?.timestamp) || Date.now()
                }
            }))
        })
        return () => {
            detach?.()
        }
    }, [canAccessServerSpaces, socketOn, spaceId])

    useEffect(() => {
        if (!spaceId) {
            setRemoteCursorMap({})
            return
        }
        setRemoteCursorMap({})
    }, [spaceId])

    useEffect(() => {
        if (!isSocketConnected) {
            setRemoteCursorMap({})
        }
    }, [isSocketConnected])

    useEffect(() => {
        const activeSocketIds = new Set((usersInSpace || []).map((user) => user?.socketId).filter(Boolean))
        setRemoteCursorMap((previous) => {
            const nextEntries = Object.entries(previous).filter(([socketId]) => activeSocketIds.has(socketId))
            if (nextEntries.length === Object.keys(previous).length) {
                return previous
            }
            return Object.fromEntries(nextEntries)
        })
    }, [usersInSpace])

    useEffect(() => {
        if (!Object.keys(remoteCursorMap).length) return undefined
        const intervalId = window.setInterval(() => {
            const cutoff = Date.now() - CURSOR_STALE_MS
            setCursorNow(Date.now())
            setRemoteCursorMap((previous) => {
                const nextEntries = Object.entries(previous).filter(([, cursor]) => (cursor?.updatedAt || 0) >= cutoff)
                if (nextEntries.length === Object.keys(previous).length) {
                    return previous
                }
                return Object.fromEntries(nextEntries)
            })
        }, 1000)
        return () => window.clearInterval(intervalId)
    }, [remoteCursorMap])

    useEffect(() => {
        return () => {
            if (cursorTimerRef.current) {
                window.clearTimeout(cursorTimerRef.current)
            }
        }
    }, [])

    const collaborators = useMemo(() => {
        return usersInSpace.filter((user) => user.userId !== liveClientId)
    }, [liveClientId, usersInSpace])

    const participantRoster = useMemo(() => {
        return usersInSpace.map((user) => {
            const cursor = remoteCursorMap[user.socketId || user.userId] || null
            const cursorAgeMs = cursor ? Math.max(0, cursorNow - cursor.updatedAt) : null
            const isSelf = user.userId === liveClientId
            return {
                ...user,
                isSelf,
                displayName: isSelf ? `${user.userName} (You)` : user.userName,
                sessionTail: String(user.socketId || user.userId || '').slice(-6),
                joinedAt: user.joinedAt || null,
                cursor,
                cursorAgeMs,
                isCursorActive: !isSelf && cursorAgeMs !== null && cursorAgeMs <= CURSOR_STALE_MS,
                cursorLabel: formatFreshnessLabel(cursorAgeMs)
            }
        })
    }, [cursorNow, liveClientId, remoteCursorMap, usersInSpace])

    const remoteCursorMarkers = useMemo(() => {
        return participantRoster
            .filter((participant) => !participant.isSelf && participant.isCursorActive && participant.cursor)
            .map((participant) => ({
                key: participant.socketId || participant.userId,
                label: participant.userName,
                x: participant.cursor.x,
                y: participant.cursor.y
            }))
    }, [participantRoster])

    const flushQueuedCursor = useCallback(() => {
        cursorTimerRef.current = null
        const queued = queuedCursorRef.current
        if (!queued || !socketEmit?.userCursor || !isSocketConnected) return
        queuedCursorRef.current = null
        lastCursorSentAtRef.current = Date.now()
        socketEmit.userCursor(queued)
    }, [isSocketConnected, socketEmit])

    const broadcastCursor = useCallback((cursor) => {
        if (!socketEmit?.userCursor || !isSocketConnected) return
        const nextCursor = normalizeCursorPayload(cursor)
        if (!nextCursor) return
        const now = Date.now()
        const elapsed = now - lastCursorSentAtRef.current
        if (elapsed >= CURSOR_THROTTLE_MS) {
            lastCursorSentAtRef.current = now
            queuedCursorRef.current = null
            socketEmit.userCursor(nextCursor)
            return
        }
        queuedCursorRef.current = nextCursor
        if (cursorTimerRef.current) return
        cursorTimerRef.current = window.setTimeout(flushQueuedCursor, CURSOR_THROTTLE_MS - elapsed)
    }, [flushQueuedCursor, isSocketConnected, socketEmit])

    return {
        displayName,
        setDisplayName,
        effectiveDisplayName,
        isSocketConnected,
        usersInSpace,
        collaborators,
        participantRoster,
        remoteCursorMarkers,
        broadcastCursor,
        socketEmit: enableSceneEditEvents ? socketEmit : null
    }
}

export default useRealtimeCollaboration
