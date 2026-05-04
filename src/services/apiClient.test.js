import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    apiFetch,
    getApiBaseUrlForRuntime,
    normalizeClientApiToken,
    normalizeSessionApiToken
} from './apiClient.js'

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

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

describe('normalizeSessionApiToken', () => {
    it('keeps server edit tokens trim-only so existing deployments can log in', () => {
        expect(normalizeSessionApiToken(' Bearer dev-token ')).toBe('dev-token')
        expect(normalizeSessionApiToken('abc')).toBe('abc')
    })
})

describe('apiFetch auth sessions', () => {
    it('includes browser credentials so http-only auth sessions can be used', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        }))
        vi.stubGlobal('fetch', fetchMock)

        await apiFetch('/api/spaces')

        expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/serverXR/api/spaces', expect.objectContaining({
            credentials: 'include'
        }))
    })

    it('throws on 401 without prompting the user', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        }))
        vi.stubGlobal('fetch', fetchMock)

        await expect(apiFetch('/api/spaces', { method: 'POST', body: { label: 'Main' } }))
            .rejects.toMatchObject({ status: 401 })
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('throws on 403 without prompting the user', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
            error: 'Admin role required.',
            requiredRole: 'admin',
            currentRole: 'editor'
        }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
        }))
        vi.stubGlobal('fetch', fetchMock)

        await expect(apiFetch('/api/spaces/main', { method: 'PATCH', body: {} }))
            .rejects.toMatchObject({ status: 403 })
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})
