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
