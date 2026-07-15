import { describe, expect, it, vi } from 'vitest'
import { createRateLimiter, clientKey } from './rateLimit.js'

const makeReq = (overrides = {}) => ({ headers: {}, ip: '10.0.0.1', ...overrides })
const makeRes = () => {
    const res = {
        statusCode: null,
        headers: {},
        body: null,
        set(name, value) { this.headers[name] = value; return this },
        status(code) { this.statusCode = code; return this },
        json(payload) { this.body = payload; return this }
    }
    return res
}

describe('createRateLimiter', () => {
    it('passes requests through until max, then answers 429 with Retry-After', () => {
        const limiter = createRateLimiter({ windowMs: 60_000, max: 3, name: 'test calls' })
        const next = vi.fn()

        for (let i = 0; i < 3; i++) limiter(makeReq(), makeRes(), next)
        expect(next).toHaveBeenCalledTimes(3)

        const res = makeRes()
        limiter(makeReq(), res, next)
        expect(next).toHaveBeenCalledTimes(3)
        expect(res.statusCode).toBe(429)
        expect(Number(res.headers['Retry-After'])).toBeGreaterThan(0)
        expect(res.body.error).toContain('test calls')
    })

    it('counts addresses independently', () => {
        const limiter = createRateLimiter({ windowMs: 60_000, max: 1 })
        const next = vi.fn()

        limiter(makeReq({ ip: '10.0.0.1' }), makeRes(), next)
        limiter(makeReq({ ip: '10.0.0.2' }), makeRes(), next)
        expect(next).toHaveBeenCalledTimes(2)

        const res = makeRes()
        limiter(makeReq({ ip: '10.0.0.1' }), res, next)
        expect(res.statusCode).toBe(429)
    })

    it('resets the bucket after the window elapses', () => {
        vi.useFakeTimers()
        try {
            const limiter = createRateLimiter({ windowMs: 1000, max: 1 })
            const next = vi.fn()

            limiter(makeReq(), makeRes(), next)
            const blocked = makeRes()
            limiter(makeReq(), blocked, next)
            expect(blocked.statusCode).toBe(429)

            vi.advanceTimersByTime(1001)
            limiter(makeReq(), makeRes(), next)
            expect(next).toHaveBeenCalledTimes(2)
        } finally {
            vi.useRealTimers()
        }
    })

    // The app runs behind two trusted proxy hops on the VPS (Caddy, then nginx
    // in the client container) without `trust proxy`, so req.ip is always the
    // nginx container for every visitor — the limiter must key on the
    // forwarded client. Each trusted hop APPENDS the true peer IP it saw, so
    // the last entry (nginx's peer, i.e. Caddy) is constant and useless; the
    // second-to-last entry (Caddy's peer, i.e. the real client) is the one to
    // trust — anything earlier is attacker-suppliable via a spoofed header.
    it('keys on the second-to-last X-Forwarded-For hop (real client behind two trusted proxies)', () => {
        expect(clientKey(makeReq({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } }))).toBe('203.0.113.9')
        expect(clientKey(makeReq({ headers: { 'x-forwarded-for': 'spoofed, 203.0.113.9, 10.0.0.1' } }))).toBe('203.0.113.9')
        expect(clientKey(makeReq({ headers: { 'x-forwarded-for': '1.2.3.4' } }))).toBe('1.2.3.4')
        expect(clientKey(makeReq())).toBe('10.0.0.1')
        expect(clientKey({ headers: {} })).toBe('unknown')
    })
})
