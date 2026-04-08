import { describe, expect, it } from 'vitest'
import { getSocketConfigForRuntime } from './useSpaceSocket.js'

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
            token: 'Bearer abc123',
            locationOrigin: 'https://example.com'
        })).toEqual({
            serverUrl: 'https://example.com',
            path: '/serverXR/socket.io',
            auth: { token: 'abc123' }
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
})
