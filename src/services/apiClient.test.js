import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, parseRetryAfterMs, getApiBaseUrlForRuntime, normalizeClientApiToken, normalizeSessionApiToken } from './apiClient.js'

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

// RFC 9110 section 10.2.3 (Retry-After) and RFC 6585 section 4 (429).
describe('apiFetch rate limiting (429)', () => {
    afterEach(() => { vi.useRealTimers() })
    const limited = (retryAfter) => new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...(retryAfter !== undefined ? { 'Retry-After': retryAfter } : {}) }
    })
    const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })

    it('retries a GET once after the stated Retry-After seconds, then returns the answer', async () => {
        vi.useFakeTimers()
        const fetchMock = vi.fn().mockResolvedValueOnce(limited('3')).mockResolvedValueOnce(ok())
        vi.stubGlobal('fetch', fetchMock)
        const result = apiFetch('/api/spaces')
        await vi.advanceTimersByTimeAsync(2900)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(200)
        await expect(result).resolves.toEqual({ ok: true })
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('does not retry a POST: the caller gets status 429 and the delay', async () => {
        const fetchMock = vi.fn().mockResolvedValue(limited('7'))
        vi.stubGlobal('fetch', fetchMock)
        await expect(apiFetch('/api/spaces', { method: 'POST', body: { label: 'Main' } }))
            .rejects.toMatchObject({ status: 429, isRateLimited: true, retryAfterMs: 7000 })
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('gives up after a bounded number of retries and surfaces 429', async () => {
        vi.useFakeTimers()
        const fetchMock = vi.fn().mockImplementation(async () => limited('1'))
        vi.stubGlobal('fetch', fetchMock)
        const result = apiFetch('/api/spaces')
        const settled = expect(result).rejects.toMatchObject({ status: 429, isRateLimited: true })
        await vi.advanceTimersByTimeAsync(60000)
        await settled
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('does not wait out a Retry-After longer than the cap', async () => {
        const fetchMock = vi.fn().mockResolvedValue(limited('3600'))
        vi.stubGlobal('fetch', fetchMock)
        await expect(apiFetch('/api/spaces')).rejects.toMatchObject({ status: 429, retryAfterMs: 3600000 })
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})

describe('parseRetryAfterMs', () => {
    it('reads delay-seconds and HTTP-dates; anything else is null', () => {
        expect(parseRetryAfterMs('120')).toBe(120000)
        expect(parseRetryAfterMs('Wed, 21 Oct 2015 07:28:10 GMT', Date.parse('Wed, 21 Oct 2015 07:28:00 GMT'))).toBe(10000)
        expect(parseRetryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT', Date.parse('Wed, 21 Oct 2015 07:29:00 GMT'))).toBe(0)
        expect(parseRetryAfterMs('soon')).toBeNull()
        expect(parseRetryAfterMs(null)).toBeNull()
    })
})
