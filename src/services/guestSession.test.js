import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureGuestSession, resetGuestSession } from './guestSession.js'
import { getApiSession } from './apiClient.js'

vi.mock('./apiClient.js', () => ({ getApiSession: vi.fn() }))

describe('ensureGuestSession', () => {
    beforeEach(() => {
        resetGuestSession()
        vi.mocked(getApiSession).mockReset()
    })

    it('issues the session once and shares it with later callers', async () => {
        vi.mocked(getApiSession).mockResolvedValue({ authenticated: true })

        const [a, b] = await Promise.all([ensureGuestSession(), ensureGuestSession()])

        expect(a).toEqual({ authenticated: true })
        expect(b).toEqual({ authenticated: true })
        expect(getApiSession).toHaveBeenCalledTimes(1)
    })

    // Regression test for audit batch 2: the failed attempt used to stay
    // cached at module scope, so the visible "Couldn't load this space →
    // Retry" button (and the 3s auto-retry) awaited the same resolved-null
    // promise forever and kept requesting without a session cookie — on an
    // auth-required deployment, an unrecoverable 401 loop behind an
    // affordance that promises recovery.
    it('retries after a failed attempt instead of caching the failure forever', async () => {
        vi.mocked(getApiSession).mockRejectedValueOnce(new Error('backend restarting'))

        expect(await ensureGuestSession()).toBeNull()
        expect(getApiSession).toHaveBeenCalledTimes(1)

        vi.mocked(getApiSession).mockResolvedValue({ authenticated: true })

        expect(await ensureGuestSession()).toEqual({ authenticated: true })
        expect(getApiSession).toHaveBeenCalledTimes(2)

        // ...and the recovered session is cached again.
        await ensureGuestSession()
        expect(getApiSession).toHaveBeenCalledTimes(2)
    })
})
