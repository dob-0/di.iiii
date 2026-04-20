import { describe, expect, it } from 'vitest'
import { getApiBaseUrlForRuntime, normalizeClientApiToken } from './apiClient.js'

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

describe('normalizeClientApiToken', () => {
    it('strips a bearer prefix from valid client tokens', () => {
        expect(normalizeClientApiToken('Bearer abcdefghijklmnop')).toBe('abcdefghijklmnop')
    })

    it('drops malformed multi-line command values', () => {
        expect(normalizeClientApiToken(`sed -i "s|^VITE_API_TOKEN=.*|VITE_API_TOKEN=token|" ~/.config/dii/production.deploy.env
grep -n 'VITE_API_TOKEN' ~/.config/dii/production.deploy.env`)).toBe('')
    })
})
