import { describe, expect, it } from 'vitest'
import { getApiBaseUrlForRuntime } from './apiClient.js'

describe('getApiBaseUrlForRuntime', () => {
    it('uses the same-origin API path in dev for loopback server URLs', () => {
        expect(getApiBaseUrlForRuntime({
            configuredBase: 'http://localhost:4000/serverXR',
            isDev: true,
            locationOrigin: 'http://localhost:5173',
            locationHostname: 'localhost'
        })).toBe('http://localhost:5173/serverXR')
    })

    it('preserves external origins outside local dev proxying', () => {
        expect(getApiBaseUrlForRuntime({
            configuredBase: 'https://di-studio.xyz/serverXR',
            isDev: true,
            locationOrigin: 'http://localhost:5173',
            locationHostname: 'localhost'
        })).toBe('https://di-studio.xyz/serverXR')
    })
})
