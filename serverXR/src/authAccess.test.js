// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest'
import {
  canAccessSpace,
  getOwnSandboxSpaceId,
  setCommunalSpaceId
} from './authAccess.js'

afterEach(() => {
  setCommunalSpaceId(null)
})

describe('getOwnSandboxSpaceId', () => {
  it('derives a deterministic sandbox id from the subject', () => {
    expect(getOwnSandboxSpaceId('guest:1a2b3c4d-5e6f')).toBe('sandbox-guest1a2b3c4d5e6')
    expect(getOwnSandboxSpaceId('github:12345678')).toBe('sandbox-github12345678')
    // Same subject, same sandbox — a returning identity never mints a new one.
    expect(getOwnSandboxSpaceId('guest:abc')).toBe(getOwnSandboxSpaceId('guest:abc'))
  })

  it('returns null for empty subjects', () => {
    expect(getOwnSandboxSpaceId('')).toBeNull()
    expect(getOwnSandboxSpaceId(null)).toBeNull()
  })
})

describe('communal open space grant', () => {
  const guest = { authenticated: true, type: 'guest', subject: 'guest:abc', spaces: ['sandbox-guestabc'] }
  const account = { authenticated: true, type: 'session', subject: 'github:99', spaces: ['my-space'] }
  const anonymous = { authenticated: false, type: 'session', subject: null, spaces: [] }

  it('lets every authenticated session touch the open space, without cookie scope', () => {
    setCommunalSpaceId('open')
    expect(canAccessSpace(guest, 'open')).toBe(true)
    expect(canAccessSpace(account, 'open')).toBe(true)
  })

  it('never grants the open space to unauthenticated callers or when unset', () => {
    setCommunalSpaceId('open')
    expect(canAccessSpace(anonymous, 'open')).toBe(false)
    setCommunalSpaceId(null)
    expect(canAccessSpace(guest, 'open')).toBe(false)
  })
})

describe('own-sandbox grant', () => {
  it('lets a session reach its derived sandbox even when scope omits it', () => {
    const account = { authenticated: true, type: 'session', subject: 'github:99', spaces: ['my-space'] }
    expect(canAccessSpace(account, getOwnSandboxSpaceId('github:99'))).toBe(true)
  })

  it('never grants someone else\'s sandbox or non-session identities', () => {
    const account = { authenticated: true, type: 'session', subject: 'github:99', spaces: ['my-space'] }
    expect(canAccessSpace(account, getOwnSandboxSpaceId('github:11'))).toBe(false)
    const token = { authenticated: true, type: 'token', subject: 'editor', spaces: ['my-space'] }
    expect(canAccessSpace(token, getOwnSandboxSpaceId('editor'))).toBe(false)
  })

  it('keeps plain scope checks intact', () => {
    const account = { authenticated: true, type: 'session', subject: 'github:99', spaces: ['my-space'] }
    expect(canAccessSpace(account, 'my-space')).toBe(true)
    expect(canAccessSpace(account, 'other-space')).toBe(false)
    expect(canAccessSpace({ authenticated: true, isUnrestricted: true }, 'anything')).toBe(true)
  })
})

// null/undefined `spaces` intentionally means "unrestricted" — this is the
// counterpart to the known bug class (docs/ai/known-fixes.md): a scope of
// null/undefined must only ever reach canAccessSpace for an account that is
// actually meant to be unrestricted (e.g. via isUnrestricted/an explicit
// grant), never as an accidental default for a normal scoped account. This
// locks in the current intended semantics so a future change can't silently
// widen who ends up unrestricted.
describe('canAccessSpace: null/undefined spaces semantics', () => {
  it('null spaces means unrestricted — same class as the OAuth spaces:null bug this guards against', () => {
    const account = { authenticated: true, type: 'session', subject: 'github:99', spaces: null }
    expect(canAccessSpace(account, 'any-space')).toBe(true)
  })

  it('undefined spaces falls back to the same unrestricted default as explicit null', () => {
    const account = { authenticated: true, type: 'session', subject: 'github:99' }
    expect(canAccessSpace(account, 'any-space')).toBe(true)
  })

  it('an explicit empty array is NOT the same as null/undefined — denies everywhere', () => {
    const account = { authenticated: true, type: 'session', subject: 'github:99', spaces: [] }
    expect(canAccessSpace(account, 'any-space')).toBe(false)
  })
})
