import { describe, expect, it, vi } from 'vitest'
import { createSessionDbSync } from './sessionDbSync.js'

const normalizeAuthRole = (role, fallback) => ['viewer', 'editor', 'admin'].includes(role) ? role : fallback

// Regression tests for the 2026-07-17 audit: session role/scope was trusted
// straight from the signed cookie on every gated request -- a DB-side role
// or space revocation only took effect once the client happened to hit
// GET /api/auth/session (which already re-synced from the DB, just there
// only). This module lets every gated route pick up a revocation within
// `recheckMs`, without hitting the DB on literally every single request.
describe('createSessionDbSync', () => {
  it('returns the fresh DB identity on the very first (uncached) lookup', () => {
    const findUserById = vi.fn(() => ({ role: 'admin', spaces: ['a', 'b'], isUnrestricted: false }))
    const { getFreshDbIdentity } = createSessionDbSync({ findUserById, normalizeAuthRole })

    const result = getFreshDbIdentity('user-1')

    expect(findUserById).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ dbRole: 'admin', dbSpaces: ['a', 'b'], dbUnrestricted: false })
  })

  it('serves subsequent lookups from cache within recheckMs, without re-querying', () => {
    const findUserById = vi.fn(() => ({ role: 'editor', spaces: [], isUnrestricted: false }))
    let clock = 0
    const { getFreshDbIdentity } = createSessionDbSync({ findUserById, normalizeAuthRole, recheckMs: 60_000, now: () => clock })

    getFreshDbIdentity('user-1')
    clock += 1000
    getFreshDbIdentity('user-1')
    clock += 30_000
    getFreshDbIdentity('user-1')

    expect(findUserById).toHaveBeenCalledTimes(1)
  })

  // The actual fix: a role/space change in the DB is picked up on the next
  // lookup once the cache window elapses -- this is what makes a revocation
  // propagate within recheckMs instead of only at next full cookie refresh.
  it('picks up a DB role/space change once the cache window elapses', () => {
    let dbRow = { role: 'editor', spaces: ['a'], isUnrestricted: false }
    const findUserById = vi.fn(() => dbRow)
    let clock = 0
    const { getFreshDbIdentity } = createSessionDbSync({ findUserById, normalizeAuthRole, recheckMs: 60_000, now: () => clock })

    expect(getFreshDbIdentity('user-1')).toEqual({ dbRole: 'editor', dbSpaces: ['a'], dbUnrestricted: false })

    // Revoked to viewer-only, no spaces -- simulates an admin action via the
    // DB while the user's session cookie still claims the old role.
    dbRow = { role: 'viewer', spaces: [], isUnrestricted: false }

    // Still within the cache window: stale value served, no new query yet.
    clock += 30_000
    expect(getFreshDbIdentity('user-1')).toEqual({ dbRole: 'editor', dbSpaces: ['a'], dbUnrestricted: false })
    expect(findUserById).toHaveBeenCalledTimes(1)

    // Past the cache window: the revocation is now visible.
    clock += 31_000
    expect(getFreshDbIdentity('user-1')).toEqual({ dbRole: 'viewer', dbSpaces: [], dbUnrestricted: false })
    expect(findUserById).toHaveBeenCalledTimes(2)
  })

  it('returns null (no override) for a subject with no DB row, e.g. a guest session, and caches the miss', () => {
    const findUserById = vi.fn(() => null)
    const { getFreshDbIdentity } = createSessionDbSync({ findUserById, normalizeAuthRole })

    expect(getFreshDbIdentity('guest:abc123')).toBeNull()
    expect(getFreshDbIdentity('guest:abc123')).toBeNull()
    expect(findUserById).toHaveBeenCalledTimes(1)
  })

  it('treats a findUserById throw as non-fatal and keeps serving the cookie state (returns null)', () => {
    const findUserById = vi.fn(() => { throw new Error('db unavailable') })
    const { getFreshDbIdentity } = createSessionDbSync({ findUserById, normalizeAuthRole })

    expect(() => getFreshDbIdentity('user-1')).not.toThrow()
    expect(getFreshDbIdentity('user-1')).toBeNull()
  })
})
