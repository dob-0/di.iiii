// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createAuthSessionValue, verifyAuthSessionValue } = require('./authSession.js')

// The behaviour, stated as arithmetic rather than as a running server: a
// session past half its life gets a new clock, one inside the first half does
// not. Twelve hours was the whole of the "why do I have to sign in every time"
// complaint — the cookie's life was fixed at issue, so a person working all day
// was thrown out mid-afternoon and asked for Google again.
const SECRET = 'test-secret'
const TTL = 12 * 60 * 60 * 1000

const isStale = (expiresAt, ttl = TTL, now = Date.now()) => (expiresAt - now) <= ttl / 2

describe('a session that is being used', () => {
    it('is not re-signed while it is still fresh', () => {
        const { expiresAt } = createAuthSessionValue({ secret: SECRET, ttlMs: TTL, session: { subject: 'u1', role: 'editor' } })
        expect(isStale(expiresAt)).toBe(false)
    })

    it('is re-signed once past halfway', () => {
        const almostGone = Date.now() + (TTL / 2) - 1000
        expect(isStale(almostGone)).toBe(true)
    })

    it('keeps who you are when it is re-signed', () => {
        // The refresh must carry role, scope and tokenVersion across, or a
        // renewed cookie is a quiet privilege change.
        const original = createAuthSessionValue({
            secret: SECRET,
            ttlMs: TTL,
            session: { subject: 'u1', label: 'Someone', role: 'admin', spaces: ['main'], isUnrestricted: true, tokenVersion: 3 }
        })
        const read = verifyAuthSessionValue(original.value, { secret: SECRET })
        const renewed = createAuthSessionValue({
            secret: SECRET,
            ttlMs: TTL,
            session: {
                subject: read.session.subject,
                label: read.session.label,
                role: read.session.role,
                spaces: read.session.spaces,
                ...(read.session.isUnrestricted ? { isUnrestricted: true } : {}),
                tokenVersion: read.session.tokenVersion
            }
        })
        const after = verifyAuthSessionValue(renewed.value, { secret: SECRET })
        expect(after.valid).toBe(true)
        expect(after.session.subject).toBe('u1')
        expect(after.session.role).toBe('admin')
        expect(after.session.spaces).toEqual(['main'])
        expect(after.session.isUnrestricted).toBe(true)
        expect(after.session.tokenVersion).toBe(3)
        expect(renewed.expiresAt).toBeGreaterThan(read.session.expiresAt - 1000)
    })

    // Absence must still sign a person out — the point is a session that
    // follows activity, not one that never ends.
    it('an expired cookie is refused rather than renewed', () => {
        const stale = createAuthSessionValue({ secret: SECRET, ttlMs: 1, session: { subject: 'u1', role: 'editor' } })
        const read = verifyAuthSessionValue(stale.value, { secret: SECRET, now: Date.now() + 5000 })
        expect(read.valid).toBe(false)
    })
})
