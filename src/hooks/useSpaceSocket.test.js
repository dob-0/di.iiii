import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { getSocketConfigForRuntime, useSpaceSocket } from './useSpaceSocket.js'
import { io } from 'socket.io-client'

vi.mock('socket.io-client', () => ({ io: vi.fn() }))
vi.mock('../services/apiClient.js', async (importOriginal) => ({
    ...(await importOriginal()),
    clearServerUnavailable: vi.fn(),
    getServerUnavailableRetryDelay: () => 1000,
    isServerTemporarilyUnavailable: () => false,
    markServerUnavailable: vi.fn()
}))

const makeFakeSocket = () => {
    const handlers = {}
    return {
        handlers,
        on: vi.fn((event, handler) => { handlers[event] = handler }),
        emit: vi.fn(),
        disconnect: vi.fn(function () { handlers.disconnect?.('io client disconnect') })
    }
}

describe('getSocketConfigForRuntime', () => {
    it('builds the root socket path for root API bases', () => {
        expect(getSocketConfigForRuntime({
            configuredBase: 'https://example.com',
            locationOrigin: 'https://example.com'
        })).toEqual({
            serverUrl: 'https://example.com',
            path: '/socket.io',
            auth: undefined
        })
    })

    it('builds nested socket paths from configured API bases and normalizes bearer tokens', () => {
        expect(getSocketConfigForRuntime({
            configuredBase: '/serverXR',
            token: 'Bearer abcdefghijklmnop',
            locationOrigin: 'https://example.com'
        })).toEqual({
            serverUrl: 'https://example.com',
            path: '/serverXR/socket.io',
            auth: { token: 'abcdefghijklmnop' }
        })
    })

    it('matches custom nested API bases for non-root deployments', () => {
        expect(getSocketConfigForRuntime({
            configuredBase: '/nested/app/',
            locationOrigin: 'https://example.com'
        })).toEqual({
            serverUrl: 'https://example.com',
            path: '/nested/app/socket.io',
            auth: undefined
        })
    })

    it('uses the current Vite origin in dev for loopback API bases', () => {
        expect(getSocketConfigForRuntime({
            configuredBase: 'http://localhost:4000/serverXR',
            isDev: true,
            locationOrigin: 'http://localhost:5173'
        })).toEqual({
            serverUrl: 'http://localhost:5173',
            path: '/serverXR/socket.io',
            auth: undefined
        })
    })

    it('uses the page origin in dev with no API base, so the socket goes through the Vite proxy', () => {
        // A second dev stack (VITE_PROXY_API_TARGET=:4361) must not open its
        // socket on whatever server holds :4000, and a phone must not dial its
        // own localhost.
        for (const locationOrigin of ['http://127.0.0.1:5192', 'http://192.168.1.20:5173']) {
            expect(getSocketConfigForRuntime({ configuredBase: '', isDev: true, locationOrigin })).toEqual({
                serverUrl: locationOrigin,
                path: '/serverXR/socket.io',
                auth: undefined
            })
        }
    })

    it('drops malformed socket auth tokens instead of forwarding them', () => {
        expect(getSocketConfigForRuntime({
            configuredBase: '/serverXR',
            token: `sed -i "s|^VITE_API_TOKEN=.*|VITE_API_TOKEN=token|" ~/.config/dii/production.deploy.env`,
            locationOrigin: 'https://example.com'
        })).toEqual({
            serverUrl: 'https://example.com',
            path: '/serverXR/socket.io',
            auth: undefined
        })
    })
})

describe('useSpaceSocket reconnection', () => {
    afterEach(() => {
        vi.useRealTimers()
        io.mockReset()
    })

    // Regression guard: the socket is created with reconnection:false and retry
    // was only wired to connect_error — a plain mid-session disconnect (server
    // restart, transport drop) left presence dead until the component remounted.
    it('reconnects after an unexpected disconnect, but not after its own cleanup', () => {
        vi.useFakeTimers()
        const sockets = []
        io.mockImplementation(() => {
            const socket = makeFakeSocket()
            sockets.push(socket)
            return socket
        })

        const { unmount } = renderHook(() => useSpaceSocket('space-1', 'user-1', 'User One'))
        expect(io).toHaveBeenCalledTimes(1)

        act(() => { sockets[0].handlers.disconnect('transport close') })
        act(() => { vi.advanceTimersByTime(2500) })
        expect(io).toHaveBeenCalledTimes(2)

        unmount()
        act(() => { vi.advanceTimersByTime(10000) })
        expect(io).toHaveBeenCalledTimes(2)
    })
})
