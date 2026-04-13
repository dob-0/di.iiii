import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRealtimeCollaboration } from './useRealtimeCollaboration.js'

const useSpaceSocketMock = vi.fn()

vi.mock('./useSpaceSocket.js', () => ({
    useSpaceSocket: (...args) => useSpaceSocketMock(...args)
}))

describe('useRealtimeCollaboration', () => {
    beforeEach(() => {
        useSpaceSocketMock.mockReset()
        window.localStorage.clear()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('keeps collaborator presence while disabling scene edit events', async () => {
        useSpaceSocketMock.mockReturnValue({
            isConnected: true,
            usersInSpace: [
                { userId: 'self-client', userName: 'Self', socketId: 'socket-self' },
                { userId: 'other-client', userName: 'Other User', socketId: 'socket-other' }
            ],
            emit: { objectAdded: vi.fn(), userCursor: vi.fn() },
            on: { userCursor: vi.fn(() => () => {}) }
        })

        const { result } = renderHook(() => useRealtimeCollaboration({
            canAccessServerSpaces: true,
            spaceId: 'main',
            liveClientId: 'self-client',
            enableSceneEditEvents: false
        }))

        expect(result.current.collaborators).toEqual([
            { userId: 'other-client', userName: 'Other User', socketId: 'socket-other' }
        ])
        expect(result.current.isSocketConnected).toBe(true)
        expect(result.current.effectiveDisplayName).toBe('User-self-cli')
        expect(result.current.socketEmit).toBeNull()
        expect(result.current.participantRoster[0].displayName).toBe('Self (You)')
    })

    it('persists display names and forwards them to the socket join payload', async () => {
        useSpaceSocketMock.mockReturnValue({
            isConnected: true,
            usersInSpace: [],
            emit: { userCursor: vi.fn() },
            on: { userCursor: vi.fn(() => () => {}) }
        })

        const { result, rerender } = renderHook(() => useRealtimeCollaboration({
            canAccessServerSpaces: true,
            spaceId: 'main',
            liveClientId: 'client-12345678',
            enableSceneEditEvents: false
        }))

        act(() => {
            result.current.setDisplayName('  Alice   Example  ')
        })

        rerender()

        expect(result.current.effectiveDisplayName).toBe('Alice Example')
        expect(window.localStorage.getItem('dii-collaboration-display-name')).toBe('Alice Example')
        expect(useSpaceSocketMock).toHaveBeenLastCalledWith('main', 'client-12345678', 'Alice Example')
    })

    it('tracks remote cursors, throttles broadcasts, and clears stale cursor markers', () => {
        vi.useFakeTimers()
        const emitUserCursor = vi.fn()
        let cursorListener = null
        let socketState = {
            isConnected: true,
            usersInSpace: [
                { userId: 'self', userName: 'Self', socketId: 'socket-self' },
                { userId: 'other', userName: 'Other User', socketId: 'socket-other' }
            ],
            emit: { userCursor: emitUserCursor },
            on: {
                userCursor: vi.fn((callback) => {
                    cursorListener = callback
                    return () => {
                        cursorListener = null
                    }
                })
            }
        }
        useSpaceSocketMock.mockImplementation(() => socketState)

        const { result, rerender } = renderHook(() => useRealtimeCollaboration({
            canAccessServerSpaces: true,
            spaceId: 'main',
            liveClientId: 'self',
            enableSceneEditEvents: false
        }))

        act(() => {
            cursorListener?.({
                socketId: 'socket-other',
                cursor: { x: 0.25, y: 0.5 },
                timestamp: Date.now()
            })
        })

        expect(result.current.remoteCursorMarkers).toEqual([
            { key: 'socket-other', label: 'Other User', x: 0.25, y: 0.5 }
        ])

        act(() => {
            result.current.broadcastCursor({ x: 0.1, y: 0.2 })
            result.current.broadcastCursor({ x: 0.6, y: 0.7 })
        })

        expect(emitUserCursor).toHaveBeenCalledTimes(1)
        expect(emitUserCursor).toHaveBeenNthCalledWith(1, { x: 0.1, y: 0.2 })

        act(() => {
            vi.advanceTimersByTime(100)
        })

        expect(emitUserCursor).toHaveBeenCalledTimes(2)
        expect(emitUserCursor).toHaveBeenNthCalledWith(2, { x: 0.6, y: 0.7 })

        act(() => {
            vi.advanceTimersByTime(4000)
        })

        expect(result.current.remoteCursorMarkers).toEqual([])

        act(() => {
            cursorListener?.({
                socketId: 'socket-other',
                cursor: { x: 0.4, y: 0.4 },
                timestamp: Date.now()
            })
        })

        expect(result.current.remoteCursorMarkers).toHaveLength(1)

        socketState = {
            ...socketState,
            isConnected: false,
            usersInSpace: []
        }
        rerender()

        expect(result.current.remoteCursorMarkers).toEqual([])
    })
})
